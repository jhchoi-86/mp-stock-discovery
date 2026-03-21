import os
import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from openai import AsyncOpenAI
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# Instantiate AsyncOpenAI client
# It automatically picks up OPENAI_API_KEY from env
# We provide a dummy default to prevent immediate crash if not set, 
# but we will manually check before making requests.
try:
    client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", "dummy_key"))
except Exception as e:
    logger.error(f"Failed to initialize OpenAI client: {e}")
    client = None

class StockData(BaseModel):
    symbol: str
    name: str
    category: str
    price: float
    indicators: Dict[str, Any]

class CommentRequest(BaseModel):
    stocks: List[StockData]

@router.post("/generate-comment")
async def generate_comments(request: CommentRequest):
    if not os.getenv("OPENAI_API_KEY"):
        # Explicit fail for fallback testing if no key is provided
        logger.warning("OPENAI_API_KEY is not configured. Falling back.")
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured")
        
    if not client:
        raise HTTPException(status_code=500, detail="OpenAI client not initialized")

    prompt = "주식 종목들의 기술적 지표 데이터를 줄 테니, 각 종목마다 100자 이내의 핵심 요약 코멘트를 작성해줘.\n"
    prompt += "반드시 아래 JSON 배열 형식으로만 응답해야 해. 다른 말이나 마크다운 백틱(```json)은 절대 추가하지 마.\n"
    prompt += '[{"symbol": "종목코드", "ai_comment": "코멘트 내용"}]\n\n'
    
    for stock in request.stocks:
        prompt += f"종목명: {stock.name} ({stock.symbol}), 분류: {stock.category}, 현재가: {stock.price}\n"
        prompt += f"지표: {json.dumps(stock.indicators, ensure_ascii=False)}\n\n"

    try:
        # LLM API 타임아웃(5초 초과 방어 로직)
        logger.info(f"Requesting OpenAI completion for {len(request.stocks)} stocks...")
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "너는 주식 차트 분석 AI야. 감정 없이 팩트 기반 기술적 분석만 완전한 JSON 형태로 짧게 대답해. 배열 외에 단 한 글자도 출력하지 마."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=600
            ),
            timeout=4.5  # 4.5s internal timeout to safely return before reaching Node's 5s timeout
        )
        
        reply_content = response.choices[0].message.content.strip()
        
        # Ensure it's valid JSON (Remove markdown blocks if AI ignored instruction)
        if reply_content.startswith("```json"):
            reply_content = reply_content.replace("```json", "", 1)
        if reply_content.endswith("```"):
            reply_content = reply_content[:-3]
        reply_content = reply_content.strip()
        
        parsed_json = json.loads(reply_content)
        return parsed_json
        
    except asyncio.TimeoutError:
        logger.error("LLM Request Timeout (exceeded 4.5s)")
        raise HTTPException(status_code=504, detail="LLM Request Timeout")
    except json.JSONDecodeError as jde:
        logger.error(f"LLM returned invalid JSON format: {jde}\nContent: {reply_content}")
        raise HTTPException(status_code=500, detail="LLM returned invalid JSON format")
    except Exception as e:
        logger.error(f"LLM Request failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
