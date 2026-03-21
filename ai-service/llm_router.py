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

try:
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        client = AsyncOpenAI(
            api_key=gemini_key,
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
        )
    else:
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", "dummy_key"))
except Exception as e:
    logger.error(f"Failed to initialize AI client: {e}")
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
    if not os.getenv("GEMINI_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        # Explicit fail for fallback testing if no key is provided
        logger.warning("No API key configured. Falling back.")
        raise HTTPException(status_code=503, detail="API key is not configured")
        
    if not client:
        raise HTTPException(status_code=500, detail="OpenAI client not initialized")

    prompt = "주식 종목들의 기술적 지표 데이터를 줄 테니, 각 종목마다 100자 이내의 핵심 요약 코멘트를 작성해줘.\n"
    prompt += "[지표 해석 기준]\n"
    prompt += "- ADX는 '주가 추세 강도'를 의미해. 코멘트를 작성할 때 무조건 '[ADX수치] 추세강도는 ' 이라는 표현으로 고정해서 작성해줘. 'ADX'라는 단어를 그대로 쓰지 마. (예: '64.86 추세강도는 강한 상승 추세로...')\n"
    prompt += "- Score는 'MP Stock 종합분석 지수'야. 0~100점 범위를 가지며, 점수가 높을수록 매수 관점으로 타점에서 대기하다가 진입 시 기계적인 목표가에 이익 실현할 가능성이 매우 높은 지수야.\n\n"
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
                model="gemini-2.5-flash" if os.getenv("GEMINI_API_KEY") else "gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "너는 20년 경력의 수석 주식 차트 분석 전문가야. 객관적이고 단호한 전문가형 어투로 팩트 기반 기술적 분석만 완전한 JSON 형태로 짧게 대답해. 배열 외에 단 한 글자도 출력하지 마."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=4000
            ),
            timeout=14.5  # Increased timeout to 14.5s to prevent disconnecting early
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
