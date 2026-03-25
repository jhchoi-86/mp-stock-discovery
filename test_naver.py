import urllib.parse
from bs4 import BeautifulSoup
import asyncio
import aiohttp

async def fetch_naver_news(stock_name: str):
    query = urllib.parse.quote(stock_name)
    url = f"https://search.naver.com/search.naver?where=news&query={query}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers, timeout=3.5) as resp:
            print(f"Status: {resp.status}")
            html = await resp.text()
            with open('naver_dump.html', 'w', encoding='utf-8') as f:
                f.write(html)
            soup = BeautifulSoup(html, 'html.parser')
            articles = soup.find_all('a', class_='news_tit')
            print(f"Found {len(articles)} articles with class 'news_tit'")
            for a in articles[:3]:
                print(a.get('title') or a.text, a.get('href'))
            
            if not articles:
                print("Looking for any 'a' tag under 'list_news' or similar...")
                any_links = soup.select('.news_area a')
                print(f"Found {len(any_links)} fallback links")
                for a in any_links[:3]:
                    print(a.get('title') or a.text, a.get('href'))

if __name__ == "__main__":
    asyncio.run(fetch_naver_news("엘앤에프"))
