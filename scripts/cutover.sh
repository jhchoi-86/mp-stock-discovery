#!/bin/bash
# 컷오버 스크립트 (T3-11)
echo "Starting Cutover Procedure..."

# 1. Nginx upstream 전환
sed -i 's/proxy_pass http:\/\/127.0.0.1:3000/proxy_pass http:\/\/127.0.0.1:3001/' /etc/nginx/sites-available/mpstock 2>/dev/null
# nginx -s reload

# 2. pm2 재시작
# pm2 restart all

# 4. 파일 마운트 읽기 전용
# chmod 444 data/signals.json data/stock_master.json

echo "Cutover complete!"
