const { getKstDateString } = require('./kst.cjs');
const redis = require('../../platform/infra/redis/client.cjs');

/**
 * [v9.4.32] Dynamic Price Enrichment Utility
 * Standardizes price data across all endpoints by merging latest DailyStockSnapshot manual overrides.
 */
async function enrichWithManualPrices(stocks, prisma, date) {
  if (!stocks || stocks.length === 0) return stocks;

  const targetDateStr = date || getKstDateString();
  const targetDate = new Date(targetDateStr);
  targetDate.setHours(0, 0, 0, 0);

  try {
    const codes = stocks.map(s => s.code || s.ticker || s.stock_code).filter(Boolean);
    if (codes.length === 0) return stocks;

    // Fetch latest snapshots for these codes on the specific date
    const manualSnapshots = await prisma.dailyStockSnapshot.findMany({
      where: {
        ticker: { in: codes },
        syncDate: targetDate
      }
    });

    const snapshotMap = new Map(manualSnapshots.map(s => [s.ticker, s]));

    return stocks.map(stock => {
      const code = stock.code || stock.ticker || stock.stock_code;
      const snapshot = snapshotMap.get(code);

      if (!snapshot) return stock;

      // Priority Logic: Manual Price > Snapshot Price > Original Stock Object
      const entry1 = snapshot.is_manual_price ? snapshot.inst_buy_manual : (snapshot.entry1Price || snapshot.entryPrice1 || stock.entry1 || stock.entry_price || stock.entry_price_1);
      const entry2 = snapshot.is_manual_price ? snapshot.inst_buy2_manual : (snapshot.entry2Price || snapshot.entryPrice2 || stock.entry2 || stock.entry_price_2);
      const target = snapshot.is_manual_price ? snapshot.target_manual : (snapshot.targetPrice || snapshot.targetPrice1 || stock.target || stock.target_price_1);
      const sl = snapshot.is_manual_price ? snapshot.stop_loss_manual : (snapshot.stopLossPrice || snapshot.stopLoss || stock.sl || stock.stop_loss);

      // [v9.5.1] Recursively enrich nested objects for report generator (reportUtils.js) compatibility
      const enriched = {
        ...stock,
        // Standardize output fields to satisfy various frontend requirements
        entry1: Number(entry1) || 0,
        entry_price: Number(entry1) || 0,
        entry_price_1: Number(entry1) || 0,
        entry2: Number(entry2) || 0,
        entry_price_2: Number(entry2) || 0,
        target: Number(target) || 0,
        target_price_1: Number(target) || 0,
        sl: Number(sl) || 0,
        stop_loss: Number(sl) || 0,
        current_price: Number(snapshot.currentPrice || stock.current_price || stock.price) || 0,
        score: snapshot.hybridScore || snapshot.score || stock.score || 0,
        is_manual_price: snapshot.is_manual_price || false,
        enriched_at: new Date().toISOString()
      };

      if (snapshot.is_manual_price) {
        // A. Enrich latestSignal
        if (enriched.latestSignal) {
          enriched.latestSignal = {
            ...enriched.latestSignal,
            entry_price: Number(entry1),
            result_1: Number(target),
            result_2: Number(entry1),
            result_3: Number(entry2),
            stop_loss: Number(sl)
          };
        }

        // B. Enrich timeframeStatus (1H, 2H, 4H, 1D)
        if (enriched.timeframeStatus) {
          const tfs = ['1H', '2H', '4H'];
          tfs.forEach(tf => {
            if (enriched.timeframeStatus[tf]) {
              enriched.timeframeStatus[tf] = {
                ...enriched.timeframeStatus[tf],
                result_2: Number(entry1),
                result_3: Number(entry2)
              };
            }
          });
          
          if (enriched.timeframeStatus['1D']) {
            enriched.timeframeStatus['1D'] = {
              ...enriched.timeframeStatus['1D'],
              bb_upper: Number(target)
            };
          }
        }
      }

      return enriched;
    });
  } catch (err) {
    console.error('[ManualPriceEnricher] Error:', err.message);
    return stocks; // Return original on failure to prevent entire page crash
  }
}

module.exports = { enrichWithManualPrices };
