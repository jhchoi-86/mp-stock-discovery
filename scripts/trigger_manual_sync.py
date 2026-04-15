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

print("--- Triggering Manual DB Sync (Top5 Population) ---")
# Call the internal saveDailySignalsToDB or trigger /api/save-sync internally if possible
# Since /api/save-sync requires auth, we can run a node script that calls the logic directly
# Or just trigger /api/auto-sync with internal cron secret
sync_cmd = "curl -X POST -H 'x-internal-cron-secret: MpStock2026!Cron' http://localhost:3001/api/auto-sync"
res = run_ssh(sync_cmd)
sys.stdout.buffer.write(res.stdout)
if res.stderr: sys.stderr.buffer.write(res.stderr)
