const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('--- Mar 26 Data Backfill Started ---');
    
    // 1. Data paths (Prod paths)
    const DATA_DIR = path.join(__dirname, 'data');
    const SIGNALS_FILE = path.join(DATA_DIR, 'signals.json');
    const STOCK_MASTER_FILE = path.join(DATA_DIR, 'stock_master.json');

    if (!fs.existsSync(SIGNALS_FILE) || !fs.existsSync(STOCK_MASTER_FILE)) {
      console.error('Data files not found. Are you running this on prod?');
      return;
    }

    const signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
    const stocks = JSON.parse(fs.readFileSync(STOCK_MASTER_FILE, 'utf8'));

    // Target Date: 2026-03-26 (Syncing UTC 06:00 to ensure Mar 26 in both UTC/KST)
    const targetDate = new Date('2026-03-26T06:00:00Z');

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Help to fetch the Daily Low for Mar 26
    const fetchDailyLowForStock = async (stockCode, market) => {
        try {
            const suffix = market.includes('KOSPI') ? '.KS' : '.KQ';
            const symbol = stockCode + suffix;
            const period1 = Math.floor(new Date('2026-03-26T00:00:00Z').getTime() / 1000);
            const period2 = Math.floor(new Date('2026-03-26T23:59:59Z').getTime() / 1000);
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d`;
            
            const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!resp.ok) return null;
            const data = await resp.json();
            const low = data.chart?.result?.[0]?.indicators?.quote?.[0]?.low?.[0];
            return low || null;
        } catch (e) {
            return null;
        }
    };

    // Remove existing snapshots for this date to avoid duplicates
    const deleteCount = await prisma.dailyStockSnapshot.deleteMany({
      where: {
        createdAt: {
          gte: new Date('2026-03-26T00:00:00Z'),
          lte: new Date('2026-03-26T23:59:59Z')
        }
      }
    });
    console.log(`Deleted ${deleteCount.count} existing snapshots for Mar 26.`);

    const getSignalsForStock = (code) => {
      const stockSignals = signals.filter(s => s.code === code);
      const timeframes = ["1H", "2H", "4H", "1D", "1W"];
      const status = {};
      timeframes.forEach(tf => {
        const sorted = stockSignals.filter(s => s.timeframe === tf).sort((a, b) => b.timestamp - a.timestamp);
        status[tf] = sorted[0];
      });
      return status;
    };

    const getLatestGlobal = (code) => signals.filter(s => s.code === code).sort((a, b) => b.timestamp - a.timestamp)[0];

    const snapshotData = [];
    console.log(`Processing ${stocks.length} stocks for execution check...`);

    for (const stock of stocks) {
      await sleep(100);
      const tfSigs = getSignalsForStock(stock.code);
      const latest = getLatestGlobal(stock.code);
      const kd = latest?.kis_change_data || {};
      
      const curPrice = latest?.current_price || 0;
      const entry1 = tfSigs['1H']?.result_2 || 0;
      const entry2 = tfSigs['2H']?.result_2 || 0;
      const entry3 = tfSigs['4H']?.result_2 || 0;

      // Check Execution
      const dailyLow = await fetchDailyLowForStock(stock.code, stock.market || 'KOSPI');
      let isExecuted = false;
      const minEntry = [entry1, entry2, entry3].filter(p => p > 0).reduce((min, p) => p < min ? p : min, Infinity);
      
      if (dailyLow && minEntry !== Infinity && dailyLow <= minEntry) {
          isExecuted = true;
      }

      // Calculate Score (Robust version from server.cjs)
      let score = 0;
      // 1. Core Score (Max 50)
      let coreScore = 0;
      ['2H', '1D', '1W'].forEach(tf => {
        let tfScore = 0;
        if (tfSigs[tf]?.cond_up7) tfScore += 25;
        if (tfSigs[tf]?.signal_HH || tfSigs[tf]?.DHH2) tfScore += 25;
        if (tfScore > coreScore) coreScore = tfScore;
      });
      score += coreScore;
      // 2. Volume Bonus (Max 10)
      if (tfSigs['1D']?.trigger_vol) score += 5;
      if (tfSigs['1W']?.trigger_vol) score += 5;
      // 3. Distance/Precision (Max 10)
      let distScore = 0;
      if (curPrice > 0) {
        ['2H', '1D', '1W'].forEach(tf => {
          if (tfSigs[tf]?.result_2) {
            const diffPct = ((curPrice - tfSigs[tf].result_2) / tfSigs[tf].result_2) * 100;
            if (diffPct >= 0 && diffPct <= 0.5) distScore = Math.max(distScore, 6);
            else if (diffPct > 0.5 && diffPct <= 1.0) distScore = Math.max(distScore, 4);
          }
        });
      }
      score += distScore;
      // 4. MTF Fractal (Max 30)
      if (tfSigs['2H']?.signal_HH || tfSigs['2H']?.DHH2) score += 10;
      if (tfSigs['1D']?.signal_HH || tfSigs['1D']?.DHH2) score += 10;
      if (tfSigs['1W']?.signal_HH || tfSigs['1W']?.DHH2) score += 10;
      // 5. KIS Bonus
      score += (kd.bonus_score || 0);

      const yieldVal = (isExecuted && entry1 > 0) 
          ? parseFloat(((curPrice - entry1) / entry1 * 100).toFixed(2)) 
          : null;

      let trendStr = "관망";
      if (tfSigs['1D']?.cond_up7 && score >= 80) trendStr = "강력 상승";
      else if (tfSigs['1D']?.cond_up7) trendStr = "상승";
      else if (latest?.adx > 30 && score < 40) trendStr = "하락 추세";

      snapshotData.push({
        code: stock.code,
        name: stock.name,
        category: latest?.category || '분석대기',
        score: Math.max(0, Math.min(score, 100)),
        yield: yieldVal,
        isExecuted,
        executedAt: isExecuted ? "장중 체결" : "미체결",
        adx: (typeof latest?.adx === 'number') ? Math.round(latest.adx) : 0,
        trend: trendStr,
        currentPrice: curPrice,
        entryPrice1: entry1,
        entryPrice2: entry2,
        entryPrice3: entry3,
        targetPrice1: tfSigs['1D']?.bb_upper || 0,
        foreignBuy: kd.foreign_buy ? String(kd.foreign_buy) : '-',
        instBuy: kd.inst_buy ? String(kd.inst_buy) : '-',
        createdAt: targetDate
      });
      
      if (snapshotData.length % 50 === 0) console.log(`[Backfill] Checked ${snapshotData.length}/${stocks.length} stocks...`);
    }

    await prisma.dailyStockSnapshot.createMany({
      data: snapshotData
    });

    console.log(`Successfully backfilled ${snapshotData.length} records for 2026-03-26.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
