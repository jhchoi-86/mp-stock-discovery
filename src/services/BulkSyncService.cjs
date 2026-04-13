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
                ticker: sig.code,
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
                    // [v9.3.4] Use Prisma $transaction for atomic batching
                    await prisma.$transaction(
                        chunk.map((data) => {
                            return prisma.dailyStockSnapshot.upsert({
                                where: {
                                    ticker_syncDate: {
                                        ticker: data.ticker,
                                        syncDate: data.syncDate
                                    }
                                },
                                update: data,
                                create: data
                            });
                        })
                    );
                    results.success += chunk.length;
                    console.log(`[BulkSync] Batch ${Math.floor(i/BATCH_SIZE)+1} completed (${chunk.length} stocks)`);
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
