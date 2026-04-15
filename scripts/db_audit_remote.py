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

print("--- DB Audit: dailyStockSnapshot (Today) ---")
# Use node to run a small prisma script
prisma_cmd = "node -e \"const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.dailyStockSnapshot.findMany({ where: { syncDate: { gte: new Date(new Date().setHours(0,0,0,0)) } } }).then(r => { console.log(JSON.stringify(r.map(s => ({ticker: s.ticker, isTop5: s.isTop5, rank: s.rank})), null, 2)); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })\""
res = run_ssh(prisma_cmd)
sys.stdout.buffer.write(res.stdout)
if res.stderr: sys.stderr.buffer.write(res.stderr)

print("\n--- DB Audit: dailySignalHistory (Today) ---")
prisma_cmd2 = "node -e \"const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); const todayStr = new Date(Date.now() + 9*3600000).toISOString().split('T')[0]; p.dailySignalHistory.findMany({ where: { date: todayStr } }).then(r => { console.log(JSON.stringify(r.map(s => ({code: s.code, name: s.name})), null, 2)); process.exit(0); })\""
res2 = run_ssh(prisma_cmd2)
sys.stdout.buffer.write(res2.stdout)
