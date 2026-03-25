import asyncio
import aiohttp
from bs4 import BeautifulSoup

async def fetch_finance_news(code: str):
    url = f"https://finance.naver.com/item/news_news.naver?code={code}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers, timeout=5.0) as resp:
            print(f"Status: {resp.status}")
            
            # Naver Finance is typically EUC-KR, so we use resp.read() and decode with 'euc-kr'
            raw = await resp.read()
            html = raw.decode('euc-kr', errors='replace')
            with open('finance_dump.html', 'w', encoding='utf-8') as f:
                f.write(html)
            soup = BeautifulSoup(html, 'html.parser')
            
            titles = soup.find_all('a')
            print(f"Total anchors: {len(titles)}")
            for a in titles:
                # Naver Finance news usually has href starting with /item/news_read.naver
                href = a.get('href', '')
                if 'news_read.naver' in href:
                    title = a.text.strip()
                    link = "https://finance.naver.com" + href
                    print(f"TITLE: {title}")
                    print(f"LINK: {link}")

if __name__ == "__main__":
    asyncio.run(fetch_finance_news("066970"))  # 엘앤에프
