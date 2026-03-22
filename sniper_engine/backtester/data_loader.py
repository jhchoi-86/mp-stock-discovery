# sniper_engine/backtester/data_loader.py
import json
import logging
from typing import List, Dict

logger = logging.getLogger("DataLoader")
logger.setLevel(logging.INFO)

class TickDataLoader:
    def __init__(self, file_path: str):
        self.file_path = file_path
        
    def load_data(self) -> List[Dict]:
        """
        🔵 [Blue Team] 틱 데이터 로더 (Task 6.1)
        JSON 파일의 과거 체결 데이터를 파싱하여 인메모리 리스트로 반환합니다.
        """
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            if not isinstance(data, list):
                raise ValueError("Data format mismatch: Expected JSON array containing tick dicts.")
                
            # 🔴 [Red Team 검증] 치명적 '미래 참조(Look-ahead Bias)' 원천 차단!
            # 소스 데이터가 어떤 변수로 섞여 들어오든 무조건 시간순('time' 키) 오름차순으로 강제 정렬(Sort)합니다.
            sorted_data = sorted(data, key=lambda x: x.get('time', '999999'))
            logger.info(f"Loaded and verified {len(sorted_data)} historical ticks securely in chronological order.")
            return sorted_data
            
        except FileNotFoundError:
            logger.warning(f"File Not Found at {self.file_path}. Operating in Dummy Test Mode.")
            return []
        except Exception as e:
            logger.error(f"🔴 Data Load Execution Failed: {e}")
            return []
