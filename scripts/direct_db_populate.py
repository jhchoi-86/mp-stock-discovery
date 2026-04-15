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

# Direct Node script to populate the DB from signals.json
# 1. Read signals.json
# 2. Extract Top 5 or all relevant
# 3. Create records in dailyStockSnapshot with isTop5: true
node_script = """
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function run() {
    try {
        const signalsPath = path.join(__dirname, 'data', 'signals.json');
        if (!fs.existsSync(signalsPath)) {
            console.error('signals.json not found');
            return;
        }
        const signals = JSON.parse(fs.readFileSync(signalsPath, 'utf8'));
        const today = new Date();
        today.setHours(0,0,0,0);

        // Sort by score to find Top 5
        const sorted = signals.sort((a, b) => (b.score || 0) - (a.score || 0));
        const top5 = sorted.slice(0, 5);
        const top5Tickers = new Set(top5.map(s => s.code));

        console.log('Populating DB for:', today.toISOString().split('T')[0]);
        console.log('Top 5 identified:', top5.map(s => s.code).join(', '));

        for (const s of signals) {
            const isTop5 = top5Tickers.has(s.code);
            await prisma.dailyStockSnapshot.upsert({
                where: { ticker_syncDate: { ticker: s.code, syncDate: today } },
                update: {
                    isTop5: isTop5,
                    hybridScore: Number(s.score || 0),
                    name: s.name || s.code,
                    currentPrice: Number(s.current_price || s.entry_price || 0)
                },
                create: {
                    ticker: s.code,
                    name: s.name || s.code,
                    isTop5: isTop5,
                    syncDate: today,
                    hybridScore: Number(s.score || 0),
                    category: s.category || 'WATCH',
                    currentPrice: Number(s.current_price || s.entry_price || 0)
                }
            });
        }
        console.log('DB Population Successful.');
    } catch (e) {
        console.error('DB Population Failed:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
run();
"""

# Upload the node script to the project directory to resolve node_modules correctly
temp_script_path = "./scripts/populate_db.cjs"
run_ssh(f"mkdir -p ./scripts && cat << 'EOF' > {temp_script_path}\n{node_script}\nEOF")

print("--- Running Direct DB Population Node Script on Production ---")
res = run_ssh(f"node {temp_script_path} && rm {temp_script_path}")
sys.stdout.buffer.write(res.stdout)
if res.stderr: sys.stderr.buffer.write(res.stderr)
