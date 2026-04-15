import subprocess
import os
import sys

key_path = r"C:\Users\danbe\Documents\mp-key.pem"
ip = "15.134.243.209"

def run_ssh(cmd):
    ssh_cmd = [
        "ssh", "-i", key_path, "-o", "StrictHostKeyChecking=no",
        f"ubuntu@{ip}",
        f"export PATH=$PATH:/home/ubuntu/.npm-global/bin:/usr/local/bin:/usr/bin:/bin && cd ~/mp-stock-discovery && {cmd}"
    ]
    return subprocess.run(ssh_cmd, capture_output=True, text=False)

print("--- Remote Audit: daily-top5 API ---")
res1 = run_ssh("curl -s \"http://localhost:3001/api/daily-top5?date=2026-04-14\" | head -c 500")
sys.stdout.buffer.write(res1.stdout)

print("\n--- Remote Audit: landing_strategy.json ---")
res2 = run_ssh("node -e \"const b=require('./data/landing_strategy.json'); console.log(JSON.stringify(b.top5||b.stocks||b,null,2))\" | head -n 30")
sys.stdout.buffer.write(res2.stdout)

print("\n--- Remote Audit: latest.json ---")
res3 = run_ssh("node -e \"const a=require('./data/vip_logs/latest.json'); console.log(JSON.stringify(a.top5||a.stocks||a,null,2))\" | head -n 30")
sys.stdout.buffer.write(res3.stdout)
