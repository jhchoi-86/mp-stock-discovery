const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * BulkSyncService handles high-throughput database synchronization
 * for stock signals and snapshots.
 */
class BulkSyncService {
    /**
     * Performs a bulk upsert of stock snapshots to the database.
     * @param {Array<Object>} signals List of signal objects to persist
     * @returns {Promise<Object>} Results summary
     */
    static async bulkUpsertSnapshots(signals) {
        if (!signals || signals.length === 0) return { success: true, count: 0 };

        // [v9.4.7] Safe Mode: Check connection before proceeding
        try {
            await Promise.race([
                prisma.$connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connect Timeout')), 2000))
            ]);
        } catch (connErr) {
            console.warn(`[BulkSync] DB unreachable (${connErr.message}). Entering Safe Mode (Skipping DB Persistence).`);
            return { success: true, count: 0, skipped: true, reason: 'DB_OFFLINE' };
        }

        try {
            console.log(`[BulkSync] Processing ${signals.length} snapshots...`);
            
            // Map signals to DB snapshot schema
            const snapshots = signals.map(sig => ({
                ticker: sig.ticker || sig.code,
                name: sig.name,
                currentPrice: sig.current_price || 0,
                hybridScore: typeof sig.score === 'number' ? sig.score : (sig.score?.total || 0),
                targetPrice: sig.target_price_1 || 0,
                stopLossPrice: sig.stop_loss || 0,
                yield: sig.yield || 0,
                tradeAmount: BigInt(sig.trade_amount || 0),
                syncDate: new Date(sig.timestamp || Date.now())
            }));

            // Use transaction for batch atomic upsert
            // Since Prisma doesn't have a native upsertMany for all providers (especially with composite keys),
            // we use a batch of single upserts or a raw query if needed.
            // For stability, we use Promise.all on chunks.
            
            const results = { success: 0, failed: 0 };
            const BATCH_SIZE = 50;
            const startTime = Date.now();
            
            for (let i = 0; i < snapshots.length; i += BATCH_SIZE) {
                const chunk = snapshots.slice(i, i + BATCH_SIZE);
                try {
                    // [v9.5.0] STEP-04: 수동 입력값 보호를 위해 기존 레코드 상태 조회
                    const tickers = chunk.map(s => s.ticker);
                    const syncDates = chunk.map(s => s.syncDate);
                    
                    const existingList = await prisma.dailyStockSnapshot.findMany({
                        where: {
                            ticker: { in: tickers },
                            syncDate: { in: syncDates }
                        },
                        select: {
                            ticker: true,
                            syncDate: true,
                            is_manual_price: true,
                            inst_buy_manual: true,
                            inst_buy2_manual: true,
                            target_manual: true,
                            stop_loss_manual: true,
                            manual_updated_at: true
                        }
                    });
                    
                    // 빠른 검색을 위한 Map 생성
                    const existingMap = new Map();
                    existingList.forEach(e => {
                        const key = `${e.ticker}_${e.syncDate.getTime()}`;
                        existingMap.set(key, e);
                    });

                    // [v9.3.4] Use Prisma $transaction for atomic batching
                    await prisma.$transaction(
                        chunk.map((data) => {
                            const key = `${data.ticker}_${data.syncDate.getTime()}`;
                            const existing = existingMap.get(key);
                            
                            // 수동 입력값이 있으면 해당 필드 보존, 없으면 빈 객체
                            const manualFields = (existing && existing.is_manual_price) 
                                ? {
                                    inst_buy_manual:   existing.inst_buy_manual,
                                    inst_buy2_manual:  existing.inst_buy2_manual,
                                    target_manual:     existing.target_manual,
                                    stop_loss_manual:  existing.stop_loss_manual,
                                    is_manual_price:   true,
                                    manual_updated_at: existing.manual_updated_at
                                }
                                : {
                                    inst_buy_manual:   null,
                                    inst_buy2_manual:  null,
                                    target_manual:     null,
                                    stop_loss_manual:  null,
                                    is_manual_price:   false,
                                    manual_updated_at: null
                                };

                            return prisma.dailyStockSnapshot.upsert({
                                where: {
                                    ticker_syncDate: {
                                        ticker: data.ticker,
                                        syncDate: data.syncDate
                                    }
                                },
                                update: { ...data, ...manualFields },
                                create: { ...data, ...manualFields }
                            });
                        })
                    );
                    results.success += chunk.length;
                    console.log(`[BulkSync] Batch ${Math.floor(i/BATCH_SIZE)+1} completed (${chunk.length} stocks | Protection Active)`);
                } catch (err) {
                    console.error(`[BulkSync] Transaction failure in batch ${Math.floor(i/BATCH_SIZE)+1}:`, err.message);
                    results.failed += chunk.length;
                }
            }

            const duration = Date.now() - startTime;
            console.log(`[BulkSync] Final Result: Success=${results.success}, Failed=${results.failed}, Time=${duration}ms`);
            return { success: true, ...results, duration };
        } catch (error) {
            console.error('[BulkSync] Global error:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = BulkSyncService;
