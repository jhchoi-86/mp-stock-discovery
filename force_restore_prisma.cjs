const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function run() {
    console.log('[ForcePrisma] Starting physical restoration via Prisma RAW SQL...');
    
    try {
        const dataPath = path.join(__dirname, 'data', 'signals.json');
        if (!fs.existsSync(dataPath)) throw new Error('signals.json not found');

        const signals = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        const codes = Object.keys(signals);
        console.log(`[ForcePrisma] Found ${codes.length} signals in cache.`);

        // 1. 기존 4/5 데이터 일괄 삭제 (Atomic)
        await prisma.$executeRawUnsafe("DELETE FROM daily_stock_snapshots WHERE created_at >= '2026-04-05 00:00:00' AND created_at <= '2026-04-05 23:59:59'");
        console.log('[ForcePrisma] Previous 4/5 records cleared.');

        // 2. 대량 삽입 루프 (Raw Query로 성능/신뢰성 확보)
        for (const code of codes) {
            const s = signals[code];
            const name = (s.name || code).replace(/'/g, "''"); // SQL Injection 방지 (Escape)
            
            const query = `
                INSERT INTO daily_stock_snapshots 
                (code, name, current_price, entry_price1, target_price1, stop_loss, yield, created_at)
                VALUES (
                    '${code}', 
                    '${name}', 
                    ${s.current_price || 0}, 
                    ${s.entry_price_1 || s.current_price || 0}, 
                    ${s.target_price_1 || s.current_price || 0}, 
                    ${s.stop_loss || 0}, 
                    ${s.change_rate || 0}, 
                    '2026-04-05 12:00:00'
                )
            `;
            await prisma.$executeRawUnsafe(query);
        }

        const count = await prisma.dailyStockSnapshot.count({
            where: { createdAt: { gte: new Date('2026-04-05T00:00:00Z'), lte: new Date('2026-04-05T23:59:59Z') } }
        });
        console.log(`[ForcePrisma] SUCCESS! Final 4/5 Count: ${count}`);
        
        fs.writeFileSync('restore_result.txt', `COUNT: ${count}\nDATE: ${new Date().toISOString()}`);

    } catch (err) {
        console.error('[ForcePrisma] FATAL ERROR:', err);
    } finally {
        await prisma.$disconnect();
    }
}

run();
