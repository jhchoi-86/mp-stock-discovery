import os
import re
import json
import time
import asyncio
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
import aiohttp
from openai import AsyncOpenAI

router = APIRouter()

kis_semaphore = asyncio.Semaphore(3)
gemini_semaphore = asyncio.Semaphore(2)

# ==========================================
# 1. 환경 설정 및 초기화
# ==========================================
KST = timezone(timedelta(hours=9))

KIS_BASE_URL = "https://openapi.koreainvestment.com:9443"

# ==========================================
# 2. API 입력 검증 (Pydantic)
# ==========================================
class StockDataRaw(BaseModel):
    code: str
    name: str
    score_total: float = Field(default=0.0)
    current_price: float = Field(default=0.0)
    change_rate: str = Field(default="0%")
    chart_url: str = Field(default="")

class Top5Request(BaseModel):
    # 엔진에서 전체 분석 데이터(가격, 타점 등)를 JS 형식(code, score_total)으로 보냄
    raw_data: list[StockDataRaw] = Field(..., max_length=5, description="최대 5개의 종목 데이터만 허용")

# ==========================================
# 3. KIS 토큰 관리자
# ==========================================
class KISTokenManager:
    def __init__(self):
        self.access_token = None
        self.token_expires_at = 0
        self._lock = asyncio.Lock()

    async def get_token(self) -> str:
        kis_key = os.getenv("KIS_APP_KEY")
        kis_secret = os.getenv("KIS_APP_SECRET")
        if not kis_key or not kis_secret:
            return None # Fallback silently if KIS is not configured in .env

        if self.access_token is None or time.time() > (self.token_expires_at - 600):
            async with self._lock:
                if self.access_token is None or time.time() > (self.token_expires_at - 600):
                    await self._refresh_token(kis_key, kis_secret)
        return self.access_token

    async def _refresh_token(self, kis_key, kis_secret):
        url = f"{KIS_BASE_URL}/oauth2/tokenP"
        payload = {"grant_type": "client_credentials", "appkey": kis_key, "appsecret": kis_secret}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=5.0) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    self.access_token = data.get("access_token")
                    self.token_expires_at = time.time() + data.get("expires_in", 86400)

kis_auth = KISTokenManager()

# ==========================================
# 4. 데이터 수집 에셋
# ==========================================
async def fetch_kis_supply(code: str) -> str:
    # TODO: 임시 목업 데이터. 추후 KIS API 실 데이터 연결 필요
    return "외인 10,000주 / 기관 5,000주 순매수"

async def fetch_realtime_news(code: str) -> str:
    # TODO: 임시 목업 데이터
    return f"{code} 관련 특징주 뉴스"

async def classify_with_gemini(news_text: str) -> dict:
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        return {"category": "분석 불가", "reason": "GEMINI_API_KEY 미설정"}
        
    client = AsyncOpenAI(
        api_key=gemini_key,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
    )
    
    prompt = f"뉴스 텍스트를 보고 상승 이유를 짧게 요약하고 테마/카테고리를 1단어로 출력해줘. JSON 포맷: {{'category': '테마명', 'reason': '상승사유'}}.\n\n뉴스: {news_text}"
    
    try:
        async with gemini_semaphore:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model="gemini-2.5-flash",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3
                ),
                timeout=10.0
            )
        content = response.choices[0].message.content.strip()
        if content.startswith("```json"): content = content.replace("```json", "", 1)
        if content.endswith("```"): content = content[:-3]
        return json.loads(content.strip())
    except asyncio.TimeoutError:
        return {"category": "분석 지연", "reason": "AI 응답 타임아웃"}
    except Exception as e:
        return {"category": "기타_모멘텀", "reason": "AI 분석 실패"}

def escape_markdown_v2(text):
    if text is None: return "내용 없음"
    return re.sub(r"([_*\[\]()~`>#+\-=|{}.!])", r"\\\1", str(text))

async def send_telegram_message(text: str):
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    
    if not bot_token or not chat_id:
        print("[System] Telegram credentials missing in .env. Skipping send.")
        return

    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "MarkdownV2"
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, timeout=10.0) as resp:
            if resp.status != 200:
                body = await resp.text()
                print(f"[Telegram error] Status: {resp.status}, Body: {body}")

# ==========================================
# 5. 백그라운드 발송 엔진 
# ==========================================
async def background_worker(raw_data: list[StockDataRaw]):
    try:
        codes = [item.code for item in raw_data]
        
        # 1. 비동기 수집
        kis_results = await asyncio.gather(*(fetch_kis_supply(c) for c in codes))
        news_results = await asyncio.gather(*(fetch_realtime_news(c) for c in codes))
        llm_results = await asyncio.gather(*(classify_with_gemini(n) for n in news_results))

        # 2. 메시지 헤더 조립
        current_time = datetime.now(KST).strftime("%Y. %m. %d. %p %I:%M:%S").replace("AM", "오전").replace("PM", "오후")
        message_lines = [
            "📈 *\[MP KOSPI 200, KOSDAQ 150 매수 추천 리서치\]* 🚨\n",
            f"🗓 생성 일시: {escape_markdown_v2(current_time)}\n",
            f"🔥 분석 종목 수: {len(raw_data)}개\n\n",
            "🔥 *\\[추천 종목 감시 명단\\]*\n\n"
        ]

        # 3. 본문 작성
        for i, t_data in enumerate(raw_data):
            name = escape_markdown_v2(t_data.name)
            ticker = escape_markdown_v2(t_data.code)
            score = escape_markdown_v2(str(t_data.score_total))
            price = escape_markdown_v2(str(t_data.current_price))
            change_rate = escape_markdown_v2(str(t_data.change_rate))
            chart_url = t_data.chart_url if t_data.chart_url else f"https://kr.tradingview.com/chart/?symbol={t_data.code}"
            
            ai_cat = escape_markdown_v2(llm_results[i].get('category', '기타_모멘텀'))
            ai_rsn = escape_markdown_v2(llm_results[i].get('reason', '알 수 없음'))
            supply = escape_markdown_v2(kis_results[i])

            item_text = (
                f"*{i+1}\. {name} ({ticker})*\n"
                f"📊 분류: 박스권 횡보 | 총점: ★★★★☆ ({score}점)\n"
                f"💰 현재가: {price}원 ({change_rate})\n"
                "-------------------------\n"
                "*\[AI가 분석한 급등 모멘텀\]*\n"
                f" 🏷 *분류:* {ai_cat}\n"
                f" 💡 *사유:* {ai_rsn}\n"
                f" 📊 *수급:* {supply}\n"
                "-------------------------\n"
                f"🔗 차트: [TradingView]({chart_url})\n\n"
            )
            message_lines.append(item_text)

        final_message = "".join(message_lines)

        # 4. 텔레그램 발송
        await send_telegram_message(final_message)
        print("[System] 텔레그램 탑5 알림 발송 성공")

    except Exception as e:
        safe_err = escape_markdown_v2(str(e))
        error_msg = f"🚨 *\[MP Stock 시스템 에러\]*\nTop 5 알림 발송 중 치명적 오류 발생:\n`{safe_err}`"
        print(error_msg)
        await send_telegram_message(error_msg)

# ==========================================
# 6. 라우터 엔드포인트
# ==========================================
@router.post("/notify-top5")
async def notify_top5(request: Top5Request, background_tasks: BackgroundTasks):
    background_tasks.add_task(background_worker, request.raw_data)
    return {"status": "processing", "message": "Top 5 KIS & Gemini 연동 발송이 안전하게 시작되었습니다."}
