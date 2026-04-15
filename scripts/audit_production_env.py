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

print("--- Auditing Production .env for CRON_SECRET ---")
res = run_ssh("grep CRON_SECRET .env")
sys.stdout.buffer.write(res.stdout)
if res.stderr: sys.stderr.buffer.write(res.stderr)
