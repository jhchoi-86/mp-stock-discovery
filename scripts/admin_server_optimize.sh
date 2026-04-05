#!/bin/bash
# MP Stock Platform - Server Optimization Script (Phase 1 Fixes)
# 작성일: 2026-04-03
# 대상: Ubuntu/Debian (AWS EC2 t3.micro/small)

echo "--- Starting Server Optimization ---"

# 1. 스왑 파일 보안 강화 (Permissions)
SWAP_FILE="/swapfile"
if [ -f "$SWAP_FILE" ]; then
    echo "[1/4] Setting permissions for $SWAP_FILE to 600..."
    sudo chmod 600 "$SWAP_FILE"
else
    echo "[!] Swap file ($SWAP_FILE) not found. Skipping permission fix."
fi

# 2. 스왑 영속성 확보 (Persistence)
if [ -f "$SWAP_FILE" ]; then
    echo "[2/4] Ensuring swap persistence in /etc/fstab..."
    if ! grep -q "$SWAP_FILE" /etc/fstab; then
        echo "$SWAP_FILE none swap sw 0 0" | sudo tee -a /etc/fstab
        echo "Added $SWAP_FILE to /etc/fstab."
    else
        echo "Swap file already exists in /etc/fstab."
    fi
fi

# 3. 커널 파라미터 최적화 (Swappiness)
echo "[3/4] Tuning swappiness to 10..."
sudo sysctl -w vm.swappiness=10
if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
    echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.conf
else
    sudo sed -i 's/vm.swappiness=.*/vm.swappiness=10/' /etc/sysctl.conf
fi

# 4. PM2 로그 로테이션 및 재시작 설정
echo "[4/4] Configuring PM2 optimizations..."
if command -v pm2 &> /dev/null; then
    # pm2-logrotate 설치 (없을 경우)
    if ! pm2 list | grep -q "pm2-logrotate"; then
        echo "Installing pm2-logrotate..."
        pm2 install pm2-logrotate
    fi
    # 로그 설정 최적화 (10MB 단위로 10개 유지)
    pm2 set pm2-logrotate:max_size 10M
    pm2 set pm2-logrotate:retain 10
    
    echo "PM2 optimizations applied."
else
    echo "[!] PM2 not found. Skipping PM2 optimizations."
fi

echo "--- Optimization Complete ---"
echo "Note: Please run 'sudo swapon -a' to verify swap if not already active."
