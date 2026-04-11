const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        console.log("=== DB SNAPSHOTS ===");
        const dbRows = await prisma.dailyStockSnapshot.findMany({
            where: {
                createdAt: {
                    gte: new Date(new Date('2026-04-05').getTime() - 12*60*60*1000),
                    lte: new Date(new Date('2026-04-05').getTime() + 36*60*60*1000)
                }
            }
        });
        const ds = new Set();
        dbRows.forEach(r => ds.add(r.code));
        console.log('DB Rows:', dbRows.length, 'Unique codes:', ds.size);
        
        console.log("=== API RESPONSE ===");
        const res = await axios.get('http://127.0.0.1:3001/api/public/daily-snapshots?date=2026-04-05');
        const data = res.data;
        const set = new Set();
        data.forEach(d => set.add(d.code));
        console.log('API Returned length:', data.length, 'Unique codes:', set.size);
        
        // Find discrepancy between 350 and API
        const fs = require('fs');
        const signals = JSON.parse(fs.readFileSync('data/signals.json', 'utf8'));
        const fSignals = signals.filter(s => s.timeframe === '1D' && s.code !== 'TEST_ERR' && s.code !== 'TEST_EXM');
        const map = new Map();
        fSignals.forEach(s => { if(!map.has(s.code)) map.set(s.code, s); });
        const allTargetCodes = Array.from(map.keys());
        
        const missing = allTargetCodes.filter(c => !set.has(c));
        console.log('Missing codes from API response:', missing);
        
    } catch(e) {
        console.error(e.message);
    } finally {
        await prisma.$disconnect();
    }
}
check();
