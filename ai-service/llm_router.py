import os
import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from openai import AsyncOpenAI
import asyncio
import aiohttp
from news_router import kis_auth

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

import urllib.parse
from bs4 import BeautifulSoup

async def fetch_naver_news(stock_name: str) -> tuple[str, str]:
    query = urllib.parse.quote(stock_name)
    url = f"https://search.naver.com/search.naver?where=news&query={query}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=3.5) as resp:
                if resp.status == 200:
                    html = await resp.text()
                    soup = BeautifulSoup(html, 'html.parser')
                    articles = soup.find_all('a', class_='news_tit')
                    
                    if not articles:
                        return "최근 뉴스 검색 결과 없음", ""
                    
                    llm_text = []
                    telegram_links = []
                    
                    for a in articles[:3]:
                        title = a.get('title') or a.text
                        link = a.get('href')
                        llm_text.append(f"- {title}")
                        # 텔레그램 No-Parse-Mode에 대비해 마크다운 없이 원시 링크로 삽입 (링크 깨짐 방지)
                        telegram_links.append(f"▪️ {title}\n  🔗 {link}")
                        
                    return "관련 뉴스:\n" + "\n".join(llm_text), "\n\n📰 [네이버 최신 모멘텀]\n" + "\n".join(telegram_links)
    except Exception as e:
        logger.error(f"Failed to fetch Naver news for {stock_name}: {e}")
    return "최근 뉴스 확인 불가", ""

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

    prompt = "주식 종목들의 기술적 지표 데이터와 네이버 최근 뉴스를 줄 테니, 각 종목마다 120자 이내의 종합 요약 코멘트를 작성해줘.\n"
    prompt += "[지표 해석 기준]\n"
    prompt += "- ADX는 '주가 추세 강도'를 의미해. 코멘트를 작성할 때 무조건 '추세강도 [ADX수치]으로' 라는 표현으로 시작하도록 형태를 고정해줘. 'ADX'라는 단어를 그대로 쓰지 마. (예: '추세강도 64.86으로 강한 상승 추세이며...')\n"
    prompt += "- Score는 'MP Stock 종합분석 지수'야. 0~100점 범위를 가지며, 점수가 높을수록 매수 관점으로 타점에서 대기하다가 진입 시 기계적인 목표가에 이익 실현할 가능성이 매우 높은 지수야.\n"
    prompt += "- 제공되는 '최고 네이버 뉴스' 내용을 바탕으로 해당 주식이 오를 재료(모멘텀)를 브리핑에 반드시 포함시켜줘.\n\n"
    prompt += "반드시 아래 JSON 배열 형식으로만 응답해야 해. 다른 말이나 마크다운 백틱(```json)은 절대 추가하지 마.\n"
    prompt += '[{"symbol": "종목코드", "ai_comment": "코멘트 내용"}]\n\n'
    
    # 🔴 [Red Team 방어] 네이버 봇 탐지 회피를 위해 동시 스크래핑(gather) 대신 순차 스크래핑 도입
    telegram_links_list = []
    
    for i, stock in enumerate(request.stocks):
        prompt += f"종목명: {stock.name} ({stock.symbol}), 분류: {stock.category}, 현재가: {stock.price}\n"
        prompt += f"지표: {json.dumps(stock.indicators, ensure_ascii=False)}\n"
        
        try:
            news_val, links_val = await fetch_naver_news(stock.name)
        except Exception:
            news_val, links_val = "뉴스 확인 불가", ""
            
        telegram_links_list.append(links_val)
        prompt += f"{news_val}\n\n"
        await asyncio.sleep(0.4) # 네이버 IP 차단 방어 (0.4s 딜레이)

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
        
        # 🔴 [Red Team] AI 환각 방지: AI가 포맷팅하는 대신 파이썬이 네이버 URL을 메세지 뒤에 하드코딩으로 직접 용접
        for i, item in enumerate(parsed_json):
            symbol = item.get("symbol")
            for j, req_stock in enumerate(request.stocks):
                if req_stock.symbol == symbol:
                    if j < len(telegram_links_list) and telegram_links_list[j]:
                        item["ai_comment"] = item.get("ai_comment", "") + telegram_links_list[j]
                    break

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
