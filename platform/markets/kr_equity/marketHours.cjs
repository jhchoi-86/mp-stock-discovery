const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'market_hours.json');
let config = null;

function loadConfig() {
    try {
        if (!config) {
            config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).kr_equity;
        }
        return config;
    } catch (e) {
        console.error('[MarketHours] Failed to load config:', e.message);
        // Fallback default values
        return {
            trading_hours: { start: "08:00", end: "20:00" },
            holidays: {}
        };
    }
}

function getKSTNow() {
    return new Date(Date.now() + (9 * 60 * 60 * 1000));
}

function isTradingDay() {
    const kst = getKSTNow();
    const day = kst.getUTCDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;

    const year = kst.getUTCFullYear();
    const { holidays } = loadConfig();
    const holidayList = holidays[year] || [];
    const dateStr = `${year}-${(kst.getUTCMonth() + 1).toString().padStart(2, '0')}-${kst.getUTCDate().toString().padStart(2, '0')}`;
    
    return !holidayList.includes(dateStr);
}

function isKSTTradingHours() {
    if (!isTradingDay()) return false;

    const kst = getKSTNow();
    const hour = kst.getUTCHours();
    const min = kst.getUTCMinutes();
    const timeVal = hour * 100 + min;

    const { trading_hours } = loadConfig();
    const start = parseInt(trading_hours.start.replace(':', ''));
    const end = parseInt(trading_hours.end.replace(':', ''));

    return timeVal >= start && timeVal <= end;
}

module.exports = {
    isTradingDay,
    isKSTTradingHours,
    getKSTNow
};
