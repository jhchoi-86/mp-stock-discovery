#!/bin/bash
# MP Stock Platform - Server Optimization persistence setup
# 작성일: 2026-04-03
# 대상: Ubuntu/Debian (AWS EC2)

echo "--- Installing MP Stock Optimization Service ---"

# 1. 최적화 스크립트를 표준 경로로 복사
sudo cp ./admin_server_optimize.sh /usr/local/bin/mpstock-optimize.sh
sudo chmod +x /usr/local/bin/mpstock-optimize.sh
echo "[1/3] Optimization script copied to /usr/local/bin/mpstock-optimize.sh"

# 2. systemd 서비스 유닛 파일 생성
SERVICE_FILE="/etc/systemd/system/mpstock-optimize.service"
echo "[2/3] Creating systemd service file..."
sudo bash -c "cat <<EOF > $SERVICE_FILE
[Unit]
Description=MP Stock Platform Infrastructure Optimization
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/mpstock-optimize.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF"

# 3. 서비스 활성화
echo "[3/3] Enabling and starting the service..."
sudo systemctl daemon-reload
sudo systemctl enable mpstock-optimize.service
sudo systemctl start mpstock-optimize.service

echo "--- Persistence Setup Complete ---"
echo "이제 서버가 리부팅되어도 자동으로 최적화 설정이 점검 및 복구됩니다."
sudo systemctl status mpstock-optimize.service --no-pager
