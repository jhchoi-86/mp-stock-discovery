import os
import json
import logging
from fastapi import APIRouter, HTTPException
import httpx
from pydantic import BaseModel
import asyncio
from typing import List, Dict, Any, Optional
import urllib.parse
from bs4 import BeautifulSoup
import aiohttp
import xml.etree.ElementTree as ET
try:
    from openai import AsyncOpenAI
except ImportError:
    logger.error("openai package not found or AsyncOpenAI not available. Please run pip install openai.")
    AsyncOpenAI = None

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

# Replaced Naver Search with Google News RSS to bypass Next.js DOM obfuscation
async def fetch_google_news_rss(stock_name: str) -> List[Dict[str, str]]:
    query = urllib.parse.quote(stock_name)
    url = f"https://news.google.com/rss/search?q={query}&hl=ko&gl=KR&ceid=KR:ko"
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=4.0) as resp:
                if resp.status != 200:
                    logger.error(f"Google News RSS HTTP {resp.status} for {stock_name}")
                    return []
                
                xml_data = await resp.text()
                root = ET.fromstring(xml_data)
                items = root.findall('.//item')
                
                news_list = []
                # Fetch up to 5 articles to give Gemini more choices for impact assessment
                for item in items[:5]:
                    title = item.find('title').text if item.find('title') is not None else ""
                    link = item.find('link').text if item.find('link') is not None else ""
                    if title and link:
                        news_list.append({"title": title, "url": link})
                
                return news_list
    except Exception as e:
        logger.error(f"Failed to fetch Google News RSS for {stock_name}: {e}")
        return []

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

    prompt = "주식 종목들의 기술적 지표 데이터와 구글 뉴스 RSS 데이터를 줄 테니, 각 종목마다 120자 이내의 종합 요약 코멘트를 작성해줘.\n"
    prompt += "[지표 해석 기준]\n"
    prompt += "- ADX는 '주가 추세 강도'를 의미해. 코멘트를 작성할 때 무조건 '추세강도 [ADX수치]으로' 라는 표현으로 시작하도록 형태를 고정해줘. 'ADX'라는 단어를 그대로 쓰지 마.\n"
    prompt += "- Score는 'MP Stock 종합분석 지수'야. 점수가 높을수록 매수 관점으로 유리해.\n"
    prompt += "- [중요] 제공되는 여러 뉴스 중에서 해당 종목의 주가에 가장 큰 영향을 줄 수 있는 '단 1개'의 뉴스만 선택해서 브리핑에 녹여내고, 그 뉴스의 제목과 URL을 결과 JSON에 포함해줘.\n\n"
    prompt += "반드시 아래 JSON 배열 형식으로만 응답해야 해. 다른 말이나 마크다운 백틱은 절대 추가하지 마.\n"
    prompt += '[{"symbol": "종목코드", "ai_comment": "요약 코멘트", "selected_news": {"title": "뉴스제목", "url": "URL"}}]\n\n'
    
    # 🔴 [Red Team Performance Patch] Parallelize News Fetching to prevent timeouts
    import time
    start_time = time.time()
    logger.info(f"Fetching news for {len(request.stocks)} stocks in parallel...")
    news_tasks = [fetch_google_news_rss(stock.name) for stock in request.stocks]
    all_news_data = await asyncio.gather(*news_tasks)
    logger.info(f"News fetch completed in {time.time() - start_time:.2f}s")
    
    for i, stock in enumerate(request.stocks):
        prompt += f"종목명: {stock.name} ({stock.symbol}), 분류: {stock.category}, 현재가: {stock.price}\n"
        prompt += f"지표: {json.dumps(stock.indicators, ensure_ascii=False)}\n"
        
        news_data = all_news_data[i]
        
        if news_data:
            news_val = "후보 뉴스 목록 (이 중 가장 임팩트 있는 1개만 골라서 요약에 반영하고 JSON fields에 채워줘):\n" + "\n".join([f"- {n['title']} (URL: {n['url']})" for n in news_data])
        else:
            news_val = "최근 뉴스 검색 결과 없음"
            
        prompt += f"{news_val}\n\n"

    try:
        # LLM API 타임아웃 (Increased to 29s to match backend's 30s window)
        llm_start = time.time()
        logger.info(f"Requesting OpenAI completion for {len(request.stocks)} stocks...")
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model="gemini-2.0-flash",
                messages=[
                    {"role": "system", "content": "너는 20년 경력의 수석 주식 차트 분석 전문가야. 객관적이고 단호한 전문가형 어투로 팩트 기반 기술적 분석만 완전한 JSON 형태로 짧게 대답해. 배열 외에 단 한 글자도 출력하지 마."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=4000
            ),
            timeout=29.0 
        )
        logger.info(f"LLM completion completed in {time.time() - llm_start:.2f}s")
        
        import re
        reply_content = response.choices[0].message.content.strip()
        
        # 🔴 [Red Team JSON Fix] 100% Robust JSON Extraction (Regex based)
        # Find first '[' and last ']' to extract the JSON array
        match = re.search(r'\[.*\]', reply_content, re.DOTALL)
        if match:
            clean_json = match.group(0)
        else:
            # Fallback to previous logic if no brackets found
            clean_json = reply_content
            
        logger.info(f"Extracted JSON: {clean_json}")
        parsed_json = json.loads(clean_json)
        
        # 🔴 [Red Team Fix] Force list format if LLM returned a single object
        if isinstance(parsed_json, dict):
            parsed_json = [parsed_json]
        
        # 🔴 [Updated] AI가 선택한 단 하나의 뉴스를 메세지 뒤에 붙임
        for item in parsed_json:
            news = item.get("selected_news")
            if news and news.get("title") and news.get("url"):
                news_text = f"\n\n📰 [최신 뉴스 모멘텀]\n▪️ {news['title']}\n  🔗 {news['url']}"
                # Append to ai_comment so older backend logic still sees it, 
                # but also keep the field for new logic.
                item["ai_comment"] = item.get("ai_comment", "") + news_text
        
        return parsed_json
        
    except asyncio.TimeoutError:
        logger.error("LLM Request Timeout (exceeded 29.0s)")
        raise HTTPException(status_code=504, detail="LLM Request Timeout")
    except json.JSONDecodeError as jde:
        logger.error(f"LLM returned invalid JSON format: {jde}\nContent: {reply_content}")
        raise HTTPException(status_code=500, detail="LLM returned invalid JSON format")
    except Exception as e:
        logger.error(f"LLM Request failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
