import asyncio
import json
import os
import logging
import time
from datetime import datetime, timezone, timedelta
import aiohttp
import websockets
from dotenv import load_dotenv
from collections import deque
from sniper_engine.wbs_realtime_analyzer import WBSAggregator, SignalGate
from sniper_engine.utils.time_utils import is_market_open, hms_to_window_index

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s: %(message)s')
logger = logging.getLogger("RealtimeEngine")

# [TASK-CC02] KST 공통 시간 유틸리티 (Python)
KST = timezone(timedelta(hours=9))

def get_kst_now():
    return datetime.now(KST)

def get_kst_date_str():
    return get_kst_now().strftime("%Y-%m-%d")

load_dotenv()

# KIS API 설정
APP_KEY = os.getenv("KIS_APP_KEY")
APP_SECRET = os.getenv("KIS_APP_SECRET")
BASE_URL = "https://openapi.koreainvestment.com:9443"
WS_URL = "wss://ops.koreainvestment.com:21000"

# Node.js 서버 설정
NODE_SERVER_URL = os.getenv("NODE_SERVER_URL", "http://127.0.0.1:3001")

class TickerState:
    """종목별 실시간 상태 관리 클래스"""
    def __init__(self, ticker):
        self.ticker = ticker
        self.last_price = 0
        self.last_chegyul_time = ""
        self.order_book = {} 
        self.ask1_res = 1 
        self.bid1_res = 0
        self.history = deque(maxlen=100)

    def update_chegyul(self, data):
        parts = data.split('|')
        if len(parts) < 4: return None
        raw_tick = parts[-1].split('^')
        if len(raw_tick) < 3: return None
        
        try:
            self.last_price = int(raw_tick[2])
            self.last_chegyul_time = raw_tick[1]
            volume = int(raw_tick[6])
            
            # [TASK-R03] 체결 방향 판단 로직 정교화
            BUY_CODES = {'1', '2'}
            SELL_CODES = {'3', '4'}
            tck_type = raw_tick[3]
            if tck_type in BUY_CODES:
                is_buy = True
            elif tck_type in SELL_CODES:
                is_buy = False
            else:
                return None  # 중간체결('5') 등은 WBS 집계에서 제외
            
            return volume, is_buy
        except (ValueError, IndexError):
            return None

    def update_hoga(self, data):
        parts = data.split('|')
        if len(parts) < 4: return
        raw_hoga = parts[-1].split('^')
        if len(raw_hoga) < 20: return
        
        try:
            self.order_book = {"ask1": int(raw_hoga[3]), "bid1": int(raw_hoga[13])}
            self.ask1_res = int(raw_hoga[8])
            self.bid1_res = int(raw_hoga[18])
        except (ValueError, IndexError):
            pass

class KISAuthManager:
    def __init__(self):
        self.access_token = None
        self.approval_key = None
        self.token_expiry = 0

    async def get_access_token(self):
        url = f"{BASE_URL}/oauth2/tokenP"
        payload = {"grant_type": "client_credentials", "appkey": APP_KEY, "appsecret": APP_SECRET}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    data = await resp.json()
                    if "access_token" in data:
                        self.access_token = data["access_token"]
                        self.token_expiry = time.time() + int(data.get("expires_in", 86400))
                        logger.info("✅ OAuth2 Token 발급 성공.")
                        return True
                    return False
        except Exception as e:
            logger.error(f"❌ Auth API 오류: {e}")
            return False

    async def get_approval_key(self):
        url = f"{BASE_URL}/oauth2/Approval"
        payload = {"grant_type": "client_credentials", "appkey": APP_KEY, "secretkey": APP_SECRET}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as resp:
                    data = await resp.json()
                    self.approval_key = data.get("approval_key")
                    logger.info("🔑 Approval Key 갱신 성공.")
                    return self.approval_key
        except Exception as e:
            logger.error(f"❌ Approval API 오류: {e}")
            return None

class RealtimeEngine:
    def __init__(self, tickers, ticker_names=None):
        self.tickers = tickers
        self.ticker_names = ticker_names or {}
        self.auth = KISAuthManager()
        self.ws = None
        self.running = False
        self.ticker_states = {t: TickerState(t) for t in tickers}
        
        # [TASK-R02] Deque 기반 큐 관리 (자동 오버플로우 드랍)
        self.data_queue = deque(maxlen=1000)
        
        self.analyzer = WBSAggregator(tickers)
        self.gate = SignalGate()
        
        self.processor_task = None
        self.scheduler_task = None
        self.analyzer_task = None
        self.http_session = None

    async def signal_handler(self):
        self.running = False
        if self.ws: await self.ws.close()
        # [TASK-R04] 세션 종료 시 AttributeError 방지
        if self.http_session and not self.http_session.closed: 
            await self.http_session.close()
        for t in [self.processor_task, self.scheduler_task, self.analyzer_task]:
            if t: t.cancel()
        logger.info("🛑 엔진 정지 완료.")

    async def broadcast_signal(self, payload):
        """[Task 3-2] Node.js 서버로 시그널 전송"""
        if not self.http_session: return
        url = f"{NODE_SERVER_URL}/api/realtime/signal"
        try:
            async with self.http_session.post(url, json=payload) as resp:
                if resp.status == 200:
                    logger.info(f"📤 [Signal Broadcast] {payload['stockCode']} 전송 성공")
                else:
                    logger.error(f"❌ [Signal Broadcast] 실패: {resp.status}")
        except Exception as e:
            logger.error(f"❌ [Signal Broadcast] 오류: {e}")

    async def broadcast_wbs(self, ticker, wbs_1m, wbs_3m):
        """[Task 3-3] WBS 게이지 업데이트 전송 (1초 주기로 분석기에서 호출)"""
        if not self.http_session: return
        url = f"{NODE_SERVER_URL}/api/realtime/wbs-status"
        payload = {"ticker": ticker, "wbs1m": round(wbs_1m, 1), "wbs3m": round(wbs_3m, 1)}
        try:
            async with self.http_session.post(url, json=payload) as resp:
                pass # 부하 방지를 위해 로그 생략
        except: pass

    async def analyzer_callback(self, ticker, wbs_1m, wbs_3m):
        """WBSAggregator에서 1초마다 호출됨"""
        state = self.ticker_states[ticker]
        order_book = {"ask1_res": state.ask1_res, "bid1_res": state.bid1_res}
        
        # 1. WBS 게이지 브로드캐스트 (Task 3-3)
        await self.broadcast_wbs(ticker, wbs_1m, wbs_3m)
        
        # 2. 시그널 게이트 체크 (Task 2-2)
        signal_result = await self.gate.check_signal(ticker, wbs_1m, wbs_3m, order_book, state.last_price)
        
        if signal_result:
            # [Task 3-2] 시그널 데이터 구성
            payload = {
                "stockCode": ticker,
                "stockName": self.ticker_names.get(ticker, ticker),
                "signalType": f"BUY_{signal_result['level']}",
                "wbs1m": round(wbs_1m, 1),
                "wbs3m": round(wbs_3m, 1),
                "pScore": signal_result['p_score'],
                "predictiveRoi": signal_result['roi'],
                "entryPrice": signal_result['entry_price'],
                "targetPrice": signal_result['target_price'],
                "stopPrice": signal_result['stop_price'],
                "occurredAt": get_kst_now().isoformat() # [TASK-CC02] KST 기준 타임스탬프
            }
            logger.info(f"🚀 [SIGNAL] {ticker} | P:{payload['pScore']}% | ROI:{payload['predictiveRoi']}%")
            await self.broadcast_signal(payload)

    async def refresh_token_scheduler(self):
        while self.running:
            try:
                wait_time = max(60, self.auth.token_expiry - time.time() - 3600)
                await asyncio.sleep(wait_time)
                await self.auth.get_access_token()
            except asyncio.CancelledError: break
            except Exception as e:
                logger.error(f"⚠️ 토큰 스케줄러 오류: {e}")
                await asyncio.sleep(60)

    async def processor_loop(self):
        logger.info("⚙️ 실시간 데이터 프로세서 가동...")
        while self.running:
            try:
                if not self.data_queue:
                    await asyncio.sleep(0.01)
                    continue
                
                message = self.data_queue.popleft()
                if message.startswith('0') or message.startswith('1'):
                    parts = message.split('|')
                    if len(parts) >= 4:
                        tr_id, tr_key = parts[1], parts[3].split('^')[0] if '^' in parts[3] else parts[3]
                        if tr_key in self.ticker_states:
                            state = self.ticker_states[tr_key]
                            if tr_id == "H0STCNT0":
                                res = state.update_chegyul(message)
                                if res:
                                    vol, is_buy = res
                                    self.analyzer.add_tick(tr_key, state.last_price, vol, is_buy)
                            elif tr_id == "H0STASP0":
                                state.update_hoga(message)
            except asyncio.CancelledError: 
                break
            except Exception as e: 
                logger.error(f"⚠️ Processor 오류: {e}")

    async def subscribe(self, approval_key, tr_id, tr_key):
        sub_msg = {
            "header": {"approval_key": approval_key, "custtype": "P", "tr_type": "1", "content-type": "utf-8"},
            "body": {"input": {"tr_id": tr_id, "tr_key": tr_key}}
        }
        await self.ws.send(json.dumps(sub_msg))


    async def start(self):
        self.running = True
        self.http_session = aiohttp.ClientSession()
        self.processor_task = asyncio.create_task(self.processor_loop())
        self.scheduler_task = asyncio.create_task(self.refresh_token_scheduler())
        self.analyzer_task = asyncio.create_task(self.analyzer.run_batch_loop(self.analyzer_callback))
        
        retry_count = 0
        while self.running:
            try:
                # [DoD] 시장 시간 체크
                if not is_market_open():
                    logger.info("🌙 현재는 장 운영 시간이 아닙니다. (대기 중...)")
                    await asyncio.sleep(60)
                    continue

                if not self.auth.access_token or time.time() > self.auth.token_expiry:
                    await self.auth.get_access_token()
                approval_key = await self.auth.get_approval_key()
                if not approval_key: await asyncio.sleep(5); continue
                
                async with websockets.connect(WS_URL, ping_interval=60, ping_timeout=10) as ws:
                    self.ws = ws
                    for ticker in self.tickers:
                        await self.subscribe(approval_key, "H0STCNT0", ticker)
                        await asyncio.sleep(0.2)
                        await self.subscribe(approval_key, "H0STASP0", ticker)
                        await asyncio.sleep(0.2)
                    async for message in ws:
                        if not self.running: break
                        # 시장 종료 시 루프 탈출
                        if not is_market_open(): break 
                        
                        # [TASK-R02] Deque 기반 큐 관리 (자동 드랍)
                        self.data_queue.append(message)
                        
                        # 접속 유지 중에는 retry_count 초기화
                        if retry_count > 0:
                            logger.info("✅ 연결 안정화 - Retry Count 초기화")
                            retry_count = 0

            except asyncio.CancelledError:
                # [TASK-R01] CancelledError 가 Exception에 묻히지 않도록 명시적 처리
                logger.info("👋 RealtimeEngine Task 취소됨.")
                break
            except Exception as e:
                if not self.running: break
                retry_count += 1
                # [TASK-R06] 지수 백오프 상한 증설 (30초 -> 300초)
                wait_time = min(300, 2 ** retry_count)
                logger.error(f"⚠️ KIS 재접속 시도 ({retry_count}차) ({e}). {wait_time}초 대기...")
                await asyncio.sleep(wait_time)

async def main():
    strategy_path = os.path.join(os.path.dirname(__file__), "../data/landing_strategy.json")
    tickers = []
    ticker_names = {}
    try:
        if not os.path.exists(strategy_path):
            raise FileNotFoundError(f"Landing strategy file not found: {strategy_path}")
            
        with open(strategy_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            stocks = data.get("stocks", [])
            if not stocks:
                raise ValueError("No stocks found in landing_strategy.json")
                
            for item in stocks:
                tickers.append(item["code"])
                ticker_names[item["code"]] = item["name"]
                
        logger.info(f"📂 설정 파일 로드 완료 ({len(tickers)} 종목 모니터링)")
                
    except FileNotFoundError as e:
        logger.warning(f"⚠️ {e}. 기본 종목(삼성전자)으로 시작합니다.")
        tickers = ["005930"]
        ticker_names = {"005930": "삼성전자"}
    except json.JSONDecodeError as e:
        logger.error(f"❌ 설정 파일 파싱 오류: {e}")
        tickers = ["005930"]
        ticker_names = {"005930": "삼성전자"}
    except Exception as e:
        logger.error(f"❌ 설정 로드 중 예상치 못한 오류: {e}")
        tickers = ["005930"]
        ticker_names = {"005930": "삼성전자"}
    
    engine = RealtimeEngine(tickers, ticker_names)
    try: await engine.start()
    except KeyboardInterrupt: await engine.signal_handler()

if __name__ == "__main__":
    asyncio.run(main())
