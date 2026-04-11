import subprocess

cmd = [
    "ssh",
    "-i", "C:/Users/danbe/Documents/mp-key.pem",
    "-o", "StrictHostKeyChecking=no",
    "ubuntu@15.134.243.209",
    "cd ~/mp-stock-discovery && node -e \"const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.report.findFirst({ orderBy: { sentAt: 'desc' } }).then(r => { console.log(r.content); p.\\$disconnect(); });\""
]

result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
if result.returncode == 0:
    with open("data/latest_report.txt", "w", encoding="utf-8") as f:
        f.write(result.stdout)
    print("Report saved to data/latest_report.txt")
else:
    print("Error:", result.stderr)
