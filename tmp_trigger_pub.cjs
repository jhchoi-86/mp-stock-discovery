const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

async function main() {
    console.log('Triggering PublishingService from server root...');
    const PublishingService = require('./src/services/publishingService.cjs');
    const pub = new PublishingService();
    
    // Correct Path discovered: data/signals.json
    const SIGNALS_FILE = path.join(__dirname, 'data', 'signals.json');
    if (!fs.existsSync(SIGNALS_FILE)) {
        console.error(`signals.json not found at ${SIGNALS_FILE}`);
        return;
    }
    
    const raw = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
    console.log(`Read ${raw.length} signals from data/signals.json. Publishing...`);
    
    try {
        await pub.publishToAll(raw);
        console.log('Publish SUCCESS');
    } catch (e) {
        console.error('Publish FAILED:', e.message);
        if (e.stack) console.error(e.stack);
    }
}

main();
