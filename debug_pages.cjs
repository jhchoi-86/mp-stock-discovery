const axios = require('axios');

async function httpGet(p) {
    return axios.get(`http://localhost:3001${p}`, { timeout: 5000 });
}

async function main() {
    console.log('========== FINAL VERIFICATION REPORT ==========');

    try {
        const r1 = await httpGet('/api/ssot/top/5');
        console.log(`\nGET /api/ssot/top/5 → status:${r1.status}`);
        const data = r1.data.data || [];
        console.log(`  Items: ${data.length}`);
        if(data.length > 0) {
            const tess = data.find(s => s.code === '095610');
            console.log(`  Tess Price: ${tess ? tess.currentPrice : 'N/A'}`);
            console.log(`  Tess Entry1: ${tess ? tess.entryPrice1 : 'N/A'}`);
            console.log(`  Tess Target: ${tess ? tess.targetPrice1 : 'N/A'}`);
        }
    } catch(e) { console.log(`/api/ssot/top/5 FAILED: ${e.message}`); }

    try {
        const r2 = await httpGet('/api/reports/daily/2026-04-12 13:08');
        console.log(`\nGET /api/reports/daily/13:08 (Performance) → status:${r2.status}`);
        console.log(`  Items: ${r2.data.stocks?.length || 0}`);
        console.log(`  Source: ${r2.data.source}`);
    } catch(e) { console.log(`/api/reports/daily FAILED: ${e.message}`); }

    try {
        const r3 = await httpGet('/api/public/sync-history-details?tagName=2026-04-12 13:08');
        console.log(`\nGET /api/public/sync-history-details (Analysis) → status:${r3.status}`);
        console.log(`  Items: ${Array.isArray(r3.data) ? r3.data.length : 'NOT ARRAY'}`);
    } catch(e) { console.log(`/api/public/sync-history-details FAILED: ${e.message}`); }

    console.log('\n========== DONE ==========');
}

main();
