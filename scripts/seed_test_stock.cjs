const { calcPPPForStock } = require('../ppp_filter.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    process.env.TZ = 'Asia/Seoul';
    const stock = { code: '005930', name: '삼성전자', score: 75, market: 'KOSPI' };
    console.log(`[Seed] Analyzing ${stock.name} for seeding...`);
    try {
        const res = await calcPPPForStock(stock);
        if (res) {
            // Delete existing test data first if any
            await prisma.pppWatchlist.deleteMany({ where: { code: res.code } });
            
            await prisma.pppWatchlist.create({
                data: {
                    code:            res.code,
                    name:            res.name,
                    score:           res.score,
                    ppp1:            res.ppp1,
                    ppp2:            res.ppp2,
                    g_sell:          res.g_sell,
                    matched_tfs:     res.matched_tfs,
                    tf_values:       res.tf_values,
                    current_price:   res.current_price,
                    price_updated_at: new Date(),
                    registered_date: new Date().toISOString().slice(0,10),
                    expires_at:      new Date(Date.now() + 30*24*60*60*1000),
                    last_signal:     res.ppp2 ? 'PPP2' : (res.ppp1 ? 'PPP1' : 'NONE'),
                    last_signal_changed: new Date()
                }
            });
            console.log('[Seed] Samsung test data inserted successfully.');
        } else {
            console.warn('[Seed] No analysis result for seeding.');
        }
    } catch (e) {
        console.error('[Seed] Fail:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
run();
