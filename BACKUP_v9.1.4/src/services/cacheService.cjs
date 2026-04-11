/**
 * [Phase 2-2] Redis Cache Service
 * Provides Write-through caching for Stock Signal Indicators
 */
const redis = require('../../platform/infra/redis/client.cjs');

class CacheService {
    /**
     * Write-through: DB 저장과 동시에 캐시 갱신 (B-ERR-01 보정)
     * @param {string} stockCode
     * @param {object} signalData - 11대 지표 전체 JSON
     */
    async setSignalReport(stockCode, signalData) {
        const key = `mp:signal:${stockCode}`;
        const ttl = 30 * 60; // 30분 (R-MISS-02 보정: 30분 TTL 확정)

        try {
            await redis.setex(key, ttl, JSON.stringify(signalData));
            console.log(`[Cache] SET ${key} (TTL: ${ttl}s) SUCCESS`);
        } catch (e) {
            console.error(`[Cache] SET FAILED for ${key}:`, e.message);
            // Non-blocking failure: DB fallback will handle it
        }
    }

    /**
     * 캐시 조회 -> 없으면 DB 조회 후 캐시 적재 (R-MISS-02 보정)
     */
    async getSignalReport(stockCode, dbFetchFn) {
        const key = `mp:signal:${stockCode}`;

        try {
            const cached = await redis.get(key);
            if (cached) {
                console.log(`[Cache] HIT ${key}`);
                return JSON.parse(cached);
            }
        } catch (e) {
            console.error(`[Cache] GET FAILED for ${key}:`, e.message);
        }

        console.log(`[Cache] MISS ${key}. Fetching from DB...`);
        const data = await dbFetchFn(stockCode);
        if (data) {
            await this.setSignalReport(stockCode, data);
        }
        return data;
    }

    /**
     * Top N 캐시 무효화 (Upsert 완료 후 호출)
     */
    async refreshTopNCache(n = 5) {
        const key = `mp:top:${n}`;
        try {
            await redis.del(key);
            console.log(`[Cache] INVALIDATED ${key} for refresh`);
        } catch (e) {
            console.error(`[Cache] INVALIDATE FAILED for ${key}:`, e.message);
        }
    }

    /**
     * 특정 종목 캐시 무효화 (데이터 변경 시 즉시 호출)
     */
    async invalidate(stockCode) {
        const keys = [
            `mp:signal:${stockCode}`,
            'mp:top:5',
            'mp:top:10'
        ];
        for (const key of keys) {
            await redis.del(key).catch(() => {});
        }
        console.log(`[Cache] INVALIDATED ALL for ${stockCode}`);
    }
}

module.exports = new CacheService();
