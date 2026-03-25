import os
import asyncio
import aiohttp
from dotenv import load_dotenv

load_dotenv(".env")

async def test_kis_news(code):
    try:
        # Get Token
        kis_key = os.getenv("KIS_APP_KEY")
        kis_secret = os.getenv("KIS_APP_SECRET")
        
        token_url = "https://openapi.koreainvestment.com:9443/oauth2/tokenP"
        async with aiohttp.ClientSession() as session:
            async with session.post(token_url, json={"grant_type": "client_credentials", "appkey": kis_key, "appsecret": kis_secret}) as resp:
                data = await resp.json()
                token = data.get("access_token")
        
        if not token:
            print("Failed to get token", data)
            return

        url = "https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-news-title"
        headers = {
            "authorization": f"Bearer {token}",
            "appkey": kis_key,
            "appsecret": kis_secret,
            "tr_id": "FHKST01011800"
        }
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": code,
            "FID_TITL_CNTT": ""
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, params=params) as resp:
                result = await resp.json()
                print("Status:", resp.status)
                print("Result Output Type:", type(result.get("output")))
                if result.get("output"):
                    for item in result["output"][:3]:
                        print("News:", item.get("news_titl") or item.get("data_dt") or item)
                else:
                    print("Full Response:", result)
    except Exception as e:
        print("Error:", e)

asyncio.run(test_kis_news("005930"))
