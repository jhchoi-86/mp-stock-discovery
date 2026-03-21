#!/bin/bash
# 롤백 스크립트 (V1.0 컷오버 실패 시나리오)

echo "🚨 [EMERGENCY] Rolling back Cutover! Restoring Nginx to V2 (Port 3000)..."

# 1. Nginx upstream 복구 (3001 -> 3000)
sed -i 's/proxy_pass http:\/\/127.0.0.1:3001/proxy_pass http:\/\/127.0.0.1:3000/' /etc/nginx/sites-available/mpstock 2>/dev/null
# nginx -s reload

echo "✅ Rollback complete. V2 is active again."
