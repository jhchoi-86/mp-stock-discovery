const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const stats = await prisma.$queryRaw`
            SELECT
                CAST(COUNT(*) AS INTEGER) AS total,
                CAST(COUNT(CASE WHEN is_active = true  THEN 1 END) AS INTEGER) AS active,
                CAST(COUNT(CASE WHEN is_active = false THEN 1 END) AS INTEGER) AS expired,
                CAST(COUNT(CASE WHEN g_sell IS NOT NULL THEN 1 END) AS INTEGER) AS has_gsell,
                CAST(COUNT(CASE WHEN matched_tfs != '[]' THEN 1 END) AS INTEGER) AS has_matched_tfs,
                CAST(COUNT(CASE WHEN tf_values != '{}' THEN 1 END) AS INTEGER) AS has_tf_values,
                CAST(COUNT(CASE WHEN current_price IS NOT NULL THEN 1 END) AS INTEGER) AS has_price
            FROM ppp_watchlist
        `;

        const samples = await prisma.pppWatchlist.findMany({
            orderBy: { score: 'desc' },
            take: 3,
            select: {
                code: true,
                name: true,
                score: true,
                ppp1: true,
                ppp2: true,
                matched_tfs: true,
                tf_values: true,
                g_sell: true,
                current_price: true
            }
        });

        console.log('--- Stats ---');
        console.log(JSON.stringify(stats[0], (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
        console.log('\n--- Samples (Top 3) ---');
        samples.forEach(s => {
            console.log(`\nCode: ${s.code} | Name: ${s.name} | Score: ${s.score}`);
            console.log(`Matched TFs: ${s.matched_tfs}`);
            console.log(`G-Sell: ${s.g_sell} | Price: ${s.current_price}`);
            if (s.tf_values) {
                console.log(`TF Values (Preview): ${s.tf_values.substring(0, 100)}...`);
            }
        });
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
run();
