# sniper_engine/mock_server/replay_server.py
import asyncio
import websockets
import json
import random
from datetime import datetime

async def kis_mock_handler(websocket):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Client Connected to KIS Mock Server")
    
    try:
        # 1. KIS 웹소켓 구독 요청 수신 모방
        sub_req = await asyncio.wait_for(websocket.recv(), timeout=5.0)
        print(f"Received Subscription: {sub_req}")
        
        # 2. 구독 성공 응답
        await websocket.send(json.dumps({
            "header": {"tr_id": "PINGPONG", "tr_key": "SUCCESS"},
            "body": {"msg1": "SUBSCRIBED OK"}
        }))

        # 3. 모의 틱 데이터 지속 발송 루프
        # 🔴 Red Team 방어 테스트: 네트워크 Jitter 및 커넥션 드랍 시뮬레이션 포함
        tick_count = 0
        while True:
            # 실시간 장중 호가 발생 속도 (약 0.05 ~ 0.2초 랜덤 간격)
            await asyncio.sleep(random.uniform(0.05, 0.2))
            
            now_str = datetime.now().strftime("%H%M%S")
            ticker = random.choice(["000660", "005930"])
            
            base_price = 165000 if ticker == "000660" else 80000
            price_fluctuation = random.choice([-500, 0, 500])
            volume = random.randint(10, 5000)
            
            payload = {
                "header": {"tr_id": "H0STCNT0"}, # 실시간 체결 코드
                "body": {
                    "code": ticker,
                    "time": now_str,
                    "price": base_price + price_fluctuation,
                    "volume": volume,
                    "is_buy": random.choice(["1", "5"]) # 1: 매도, 5: 매수 체결
                }
            }
            
            await websocket.send(json.dumps(payload))
            tick_count += 1
            
            # 🔴 Red Team 스트레스 테스트: 일정 틱마다 강제로 서버가 끊어짐을 유도 (웹소켓 10초 타임아웃 재연결 로직 테스트용)
            if tick_count % 300 == 0:
                print("\n🔴 [Red Team] Simulating Network Failure (Force Disconnect)\n")
                break

    except asyncio.TimeoutError:
        print("🔴 Client did not send subscription request within timeout.")
    except websockets.exceptions.ConnectionClosed:
        print("Client Disconnected from Client Side.")
    finally:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Connection terminated.")

async def main():
    print("🔵 [Blue Team] Starting KIS Mock WebSocket Server on ws://localhost:8765")
    async with websockets.serve(kis_mock_handler, "localhost", 8765):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main())
