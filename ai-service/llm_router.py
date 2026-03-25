import os
import json
import logging
import asyncio
import time
import re
import aiohttp
import xml.etree.ElementTree as ET
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# Configure logging to integrate with Uvicorn
logger = logging.getLogger("uvicorn.error")

try:
    import google.generativeai as genai
except ImportError:
    logger.error("google-generativeai package not found. Please install it.")
    genai = None

# Pydantic Models for Request
class StockInfo(BaseModel):
    symbol: str
    name: str
    category: str
    price: Optional[float] = 0.0
    indicators: Optional[Dict[str, Any]] = {}

class CommentRequest(BaseModel):
    stocks: List[StockInfo]

router = APIRouter()

# Global Gemini Configuration
gemini_key = os.getenv("GEMINI_API_KEY")
if genai and gemini_key:
    try:
        genai.configure(api_key=gemini_key)
        logger.info("✅ [Gemini SDK] Official Google Generative AI SDK configured successfully.")
    except Exception as e:
        logger.error(f"❌ [Gemini SDK] Configuration failed: {e}")
else:
    logger.warning("⚠️ [Gemini SDK] Not configured: GEMINI_API_KEY missing or package not installed.")

async def fetch_google_news_rss(stock_name: str) -> List[Dict[str, str]]:
    """Fetch latest news from Google News RSS for context."""
    encoded_query = urllib.parse.quote(stock_name) if 'urllib' in globals() else stock_name
    # Fallback import if needed
    import urllib.parse
    query = urllib.parse.quote(stock_name)
    url = f"https://news.google.com/rss/search?q={query}&hl=ko&gl=KR&ceid=KR:ko"
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=5.0) as resp:
                if resp.status != 200:
                    return []
                xml_data = await resp.text()
                root = ET.fromstring(xml_data)
                items = root.findall('.//item')
                
                news_list = []
                for item in items[:5]:
                    title = item.find('title').text if item.find('title') is not None else ""
                    link = item.find('link').text if item.find('link') is not None else ""
                    if title and link:
                        news_list.append({"title": title, "url": link})
                return news_list
    except Exception as e:
        logger.error(f"News fetch failed for {stock_name}: {e}")
        return []

@router.post("/generate-comment")
async def generate_comments(request: CommentRequest):
    if not genai or not gemini_key:
        logger.error("AI Service failure: Gemini SDK or API Key missing.")
        raise HTTPException(status_code=500, detail="Gemini SDK/Key not configured")
        
    try:
        stocks = request.stocks
        logger.info(f"🚀 [LLM] Generating comments for {len(stocks)} stocks...")
        
        # 1. Parallel News Acquisition
        news_tasks = [fetch_google_news_rss(s.name) for s in stocks]
        news_results = await asyncio.gather(*news_tasks)
        
        # 2. Build Contextual Prompt
        stock_contexts = []
        for i, s in enumerate(stocks):
            top_news = news_results[i][:3]
            news_text = "\n".join([f"- {n['title']} ({n['url']})" for n in top_news])
            ctx = (f"종목: {s.name}({s.symbol})\n"
                   f"분류: {s.category}, 현재가: {s.price}\n"
                   f"기술지표: {json.dumps(s.indicators, ensure_ascii=False)}\n"
                   f"관련 뉴스:\n{news_text if news_text else '없음'}")
            stock_contexts.append(ctx)
            
        full_context = "\n\n---\n\n".join(stock_contexts)
        prompt = (
            f"주식 분석 전문가로서 다음 데이터를 기반으로 심층 코멘트를 작성해줘.\n\n"
            f"{full_context}\n\n"
            "조건:\n"
            "1. 각 종목당 100~130자 내외의 한국어 분석을 작성할 것.\n"
            "2. ADX 수치를 '추세강도 [수치]으로' 라고 표현하며 시작할 것.\n"
            "3. 뉴스 중 가장 중요한 1개를 골라 요약에 반영하고 JSON 필드에 채울 것.\n"
            "4. 반드시 아래 JSON 배열 형식으로만 대답할 것 (마크다운 백틱 금지):\n"
            "[{\"symbol\": \"코드\", \"ai_comment\": \"코멘트\", \"selected_news\": {\"title\": \"뉴스제목\", \"url\": \"URL\"}}]"
        )

        llm_start = time.time()
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = await asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            
            raw_text = response.text
            logger.info(f"✅ [Gemini] Raw Response length: {len(raw_text)}")
            
            # JSON 추출 시도
            try:
                # 빽따옴표 제거 로직
                clean_json = raw_text.strip()
                if clean_json.startswith("```json"):
                    clean_json = clean_json[7:-3].strip()
                elif clean_json.startswith("```"):
                    clean_json = clean_json[3:-3].strip()
                    
                ai_data = json.loads(clean_json)
                # 'comments' 키가 없으면 전체가 데이터라고 가정
                parsed_data = ai_data.get("comments", ai_data)
            except Exception as je:
                logger.error(f"❌ [RED-TEAM] JSON Parsing failed: {str(je)}")
                raise HTTPException(status_code=500, detail="AI 데이터 형식 오류")
                
        except genai.types.ResourceExhausted as re_e:
            logger.error(f"❌ [Gemini API] ResourceExhausted Error: {str(re_e)}")
            raise HTTPException(status_code=429, detail="AI 사용량이 많아 잠시 제한되었습니다. 1분 뒤 다시 시도해 주세요.")
        except Exception as ge:
            logger.error(f"❌ [RED-TEAM] Gemini API Error: {str(ge)}")
            if "429" in str(ge) or "quota" in str(ge).lower():
                raise HTTPException(status_code=429, detail="AI 사용량이 많아 잠시 제한되었습니다. 1분 뒤 다시 시도해 주세요.")
            raise HTTPException(status_code=500, detail=f"AI 통신 오류: {str(ge)}")
            
        logger.info(f"✅ [LLM] Gemini response received in {time.time() - llm_start:.2f}s")
        
        if not parsed_data:
            raise ValueError("Empty response data from Gemini")
            
        if isinstance(parsed_data, dict):
            parsed_data = [parsed_data]
            
        # 5. Final Formatting (Attach news URL to comment for backward compatibility)
        for item in parsed_data:
            news = item.get("selected_news")
            if news and news.get("title") and news.get("url"):
                news_suffix = f"\n\n📰 [최신 주요 뉴스]\n▪️ {news['title']}\n🔗 {news['url']}"
                item["ai_comment"] = item.get("ai_comment", "") + news_suffix
                
        return parsed_data

    except Exception as e:
        logger.error(f"🔥 [LLM CRITICAL ERROR]: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
