import asyncio
import aiohttp
import xml.etree.ElementTree as ET
import urllib.parse

async def fetch_rss(stock_name: str):
    query = urllib.parse.quote(stock_name)
    url = f"https://news.google.com/rss/search?q={query}&hl=ko&gl=KR&ceid=KR:ko"
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=5.0) as resp:
            print(f"Status: {resp.status}")
            xml_data = await resp.text()
            
            root = ET.fromstring(xml_data)
            items = root.findall('.//item')
            print(f"Found {len(items)} RSS items")
            
            for item in items[:5]:
                title = item.find('title').text
                link = item.find('link').text
                pubDate = item.find('pubDate').text
                print(f"[{pubDate}] {title} -> {link}")

if __name__ == "__main__":
    asyncio.run(fetch_rss("엘앤에프"))
