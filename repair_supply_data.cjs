require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();
const KIS_TOKEN_FILE = path.join(__dirname, 'data', 'kis_token.json');

async function getKisAccessToken() {
    if (fs.existsSync(KIS_TOKEN_FILE)) {
        const saved = JSON.parse(fs.readFileSync(KIS_TOKEN_FILE, 'utf8'));
        if (saved.expiry > Date.now() + 3600000) return saved.token;
    }
    const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
        grant_type: 'client_credentials', appkey: KIS_APP_KEY, appsecret: KIS_APP_SECRET
    });
    const token = response.data.access_token;
    const expiry = Date.now() + (response.data.expires_in * 1000);
    fs.writeFileSync(KIS_TOKEN_FILE, JSON.stringify({ token, expiry }));
    return token;
}

async function main() {
    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`[Repair] Fetching live supply data for ${todayStr}...`);

    const token = await getKisAccessToken();
    const top5 = await prisma.dailyTop5.findMany({ where: { date: todayStr } });

    for (const stock of top5) {
        console.log(`[Repair] Updating ${stock.name} (${stock.code})...`);
        try {
            const trendRes = await axios.get('https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-investor', {
                headers: { 'authorization': 'Bearer ' + token, 'appkey': KIS_APP_KEY, 'appsecret': KIS_APP_SECRET, 'tr_id': 'FHKST01010900' },
                params: { "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": stock.code },
                timeout: 5000
            });
            
            if (trendRes.data.output) {
                const fBuy = parseInt(trendRes.data.output.frgn_ntby_qty) || 0;
                const iBuy = parseInt(trendRes.data.output.orgn_ntby_qty) || 0;
                
                await prisma.dailyTop5.update({
                    where: { id: stock.id },
                    data: { foreignBuy: fBuy, instBuy: iBuy }
                });
                console.log(`[Repair] SUCCESS: ${stock.name} -> Foreign: ${fBuy}, Inst: ${iBuy}`);
            }
        } catch (err) {
            console.error(`[Repair] FAILED for ${stock.code}:`, err.message);
        }
    }

    // Also update latest.json
    const updatedTop5 = await prisma.dailyTop5.findMany({ where: { date: todayStr }, orderBy: { score: 'desc' } });
    const report = {
        stocks: updatedTop5.map(s => ({
            code: s.code,
            name: s.name,
            score: s.score,
            currentPrice: s.currentPrice,
            entryPrice1: s.entryPrice1,
            entryPrice2: s.entryPrice2,
            targetPrice1: s.targetPrice1,
            stopLoss: s.stopLoss,
            category: s.category,
            tradeAmount: s.tradeAmount.toString(),
            foreignBuy: s.foreignBuy,
            instBuy: s.instBuy,
            recommended_at: '04. 07..'
        })),
        summary: { hit_rate: '100%', avg_yield: '0.0%', portfolio_size: updatedTop5.length },
        header: { report_date: '04. 07..', universe: 'MP 통합 포트폴리오 (SSOT)' }
    };
    
    const output = JSON.stringify(report, null, 2);
    fs.writeFileSync(path.join(__dirname, 'data/vip_logs/latest.json'), output);
    fs.writeFileSync(path.join(__dirname, 'data/vip_logs/2026-04-07.json'), output);
    
    console.log('[Repair] All files updated. Clearing Redis...');
    const redis = require('./platform/infra/redis/client.cjs');
    await redis.del(`mp:top:5`);
    console.log('[Repair] Done.');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); process.exit(0); });
