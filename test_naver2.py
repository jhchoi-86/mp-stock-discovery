from bs4 import BeautifulSoup
import re

with open('naver_dump.html', 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')
links = soup.find_all('a', href=re.compile(r'^http'))
print(f"Total HTTP links: {len(links)}")

for a in links[:30]:
    print(f"[{a.get('class')}] {a.text.strip()[:30]} -> {a.get('href')}")
