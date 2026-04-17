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

    let manualSnapshots = [];
    let persistentEdits = [];

    // [v9.5.5] Fetch global persistent overrides (SignalPriceEdit)
    try {
      [manualSnapshots, persistentEdits] = await Promise.all([
        prisma.dailyStockSnapshot.findMany({
          where: { ticker: { in: codes }, syncDate: targetDate }
        }),
        prisma.signalPriceEdit.findMany({
          where: { ticker: { in: codes } }
        })
      ]);
    } catch (dbErr) {
      console.warn(`[ManualPriceEnricher] DB fallback: Using signal data only. (${dbErr.message})`);
    }

    const snapshotMap = new Map(manualSnapshots.map(s => [s.ticker, s]));
    const editMap = new Map(persistentEdits.map(e => [e.ticker, e]));

    return stocks.map(stock => {
      const code = stock.code || stock.ticker || stock.stock_code;
      const snapshot = snapshotMap.get(code);
      const persistentEdit = editMap.get(code);

      // [v9.5.5] Priority: Persistent Edit > Today's Manual Snapshot > Original
      const entry1Value = persistentEdit?.entry1 ?? (snapshot?.is_manual_price ? snapshot.inst_buy_manual : (snapshot?.entry1Price || snapshot?.entryPrice1 || stock.entry1 || stock.entry_price || stock.entry_price_1 || stock.result_2 || stock.latestSignal?.result_2));
      const entry2Value = persistentEdit?.entry2 ?? (snapshot?.is_manual_price ? snapshot.inst_buy2_manual : (snapshot?.entry2Price || snapshot?.entryPrice2 || stock.entry2 || stock.entry_price_2 || stock.result_3 || stock.latestSignal?.result_3));
      const targetValue = persistentEdit?.target ?? (snapshot?.is_manual_price ? snapshot.target_manual : (snapshot?.targetPrice || snapshot?.targetPrice1 || stock.target || stock.target_price_1 || stock.result_1 || stock.latestSignal?.result_1));
      const slValue     = persistentEdit?.stopLoss ?? (snapshot?.is_manual_price ? snapshot.stop_loss_manual : (snapshot?.stopLossPrice || snapshot?.stopLoss || stock.sl || stock.stop_loss || stock.latestSignal?.stop_loss));
      const isManual    = !!persistentEdit || (snapshot?.is_manual_price || false);

      const nEntry1 = Number(entry1Value) || 0;
      const nEntry2 = Number(entry2Value) || 0;
      const nTarget = Number(targetValue) || 0;
      const nSL     = Number(slValue) || 0;

      // [v9.5.1] Recursively enrich nested objects for report generator (reportUtils.js) compatibility
      const enriched = {
        ...stock,
        // Standardize output fields (Aliases for compatibility)
        entry1: nEntry1,
        entry1Price: nEntry1,
        entry_price: nEntry1,
        entry_price_1: nEntry1,
        inst_buy_manual: nEntry1,

        entry2: nEntry2,
        entry2Price: nEntry2,
        entry_price_2: nEntry2,
        inst_buy2_manual: nEntry2,

        target: nTarget,
        targetPrice: nTarget,
        target_price_1: nTarget,
        target_manual: nTarget,

        sl: nSL,
        stop_loss: nSL,
        stopLoss: nSL,
        stopLossPrice: nSL,
        stop_loss_manual: nSL,

        current_price: Number(snapshot?.currentPrice || stock.currentPrice || stock.current_price || stock.price) || 0,
        currentPrice: Number(snapshot?.currentPrice || stock.currentPrice || stock.current_price || stock.price) || 0,
        score: snapshot?.hybridScore || snapshot?.score || stock.score || 0,
        is_manual_price: isManual,
        enriched_at: new Date().toISOString()
      };

      // Enrich nested objects for deep consistency
      if (enriched.latestSignal) {
        enriched.latestSignal = {
          ...enriched.latestSignal,
          entry_price: nEntry1,
          result_1: nTarget,
          result_2: nEntry1,
          result_3: nEntry2,
          stop_loss: nSL,
          target_price: nTarget
        };
      }

      if (enriched.timeframeStatus) {
        const tfs = ['30M', '1H', '2H', '4H', '1D'];
        tfs.forEach(tf => {
          if (enriched.timeframeStatus[tf]) {
            enriched.timeframeStatus[tf] = {
              ...enriched.timeframeStatus[tf],
              result_1: nTarget,
              result_2: nEntry1,
              result_3: nEntry2,
              stop_loss: nSL,
              target_price: nTarget
            };
            if (tf === '1D') enriched.timeframeStatus[tf].bb_upper = nTarget;
          }
        });
      }

      return enriched;
    });
  } catch (err) {
    console.error('[ManualPriceEnricher] Unhandled Error:', err.message);
    return stocks; 
  }
}

module.exports = { enrichWithManualPrices };
