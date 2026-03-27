const axios = require('axios');
require('dotenv').config();

const PORT = process.env.PORT || 3001;
const CRON_SECRET = process.env.CRON_SECRET;

async function runManualProcess() {
    console.log('[Manual Trigger] Starting Full Synchronzation (1D, 2H)...');
    try {
        const localApi = `http://127.0.0.1:${PORT}/api/auto-sync`;
        await axios.post(localApi, { timeframes: ['1D', '2H'] }, {
            headers: { 'x-internal-cron-secret': CRON_SECRET }
        });
        console.log('[Manual Trigger] Sync initiated successfully. Waiting for background completion (240s)...');
        
        // Wait for sync to potentially complete
        await new Promise(resolve => setTimeout(resolve, 240000));
        
        console.log('[Manual Trigger] 4 minutes elapsed. The background sync should be near completion.');
        console.log('[Manual Trigger] Since the recommendation logic is inside the 18:00 cron in server.cjs,');
        console.log('[Manual Trigger] please check the Telegram for the automated report if the background process finished.');
        console.log('[Manual Trigger] Note: For a direct manual report, we would need to duplicate the server logic.');
    } catch (e) {
        console.error('[Manual Trigger] Error:', e.message);
    }
}

runManualProcess();
