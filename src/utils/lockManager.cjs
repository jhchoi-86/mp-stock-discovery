'use strict';

const redis = require('../../platform/infra/redis/client.cjs');
const crypto = require('crypto');

/**
 * [TASK] Distributed Lock Manager using Redis
 * Replaces the memory-based 'isSignalFileLocked' to prevent race conditions 
 * in PM2 Cluster mode and eliminate Deadlock risks using TTL.
 */
class LockManager {
    /**
     * Acquire a distributed lock
     * @param {string} resource - Lock key
     * @param {number} ttl - Time to live in ms (deadlock prevention limit)
     * @param {number} retryDelay - Polling delay
     * @param {number} maxRetries - Max wait limit
     * @returns {string} - Lock value (UUID) for release matching
     */
    static async acquire(resource, ttl = 5000, retryDelay = 50, maxRetries = 200) {
        const lockKey = `lock:${resource}`;
        const lockValue = crypto.randomUUID();
        let retries = 0;

        while (retries < maxRetries) {
            // SET key value NX PX ttl
            const acquired = await redis.set(lockKey, lockValue, 'NX', 'PX', ttl);
            if (acquired === 'OK') {
                return lockValue;
            }
            retries++;
            await new Promise(res => setTimeout(res, retryDelay));
        }
        
        throw new Error(`[LockManager] Failed to acquire lock for ${resource} after ${maxRetries * retryDelay}ms timeout`);
    }

    /**
     * Release the distributed lock safely using Lua Script
     * Prevents accidental releasing of a lock acquired by another process if TTL expires
     */
    static async release(resource, lockValue) {
        const lockKey = `lock:${resource}`;
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        await redis.eval(script, 1, lockKey, lockValue);
    }

    /**
     * Wrapper to automatically acquire, execute, and release with deadlock safety
     * @param {string} resource 
     * @param {function} fn 
     */
    static async withLock(resource, fn, ttl = 10000) {
        let lockValue;
        try {
            lockValue = await this.acquire(resource, ttl);
        } catch (lockError) {
            console.error(`[LockManager] Acquire failed:`, lockError.message);
            throw lockError;
        }

        try {
            return await fn();
        } catch (e) {
            console.error(`[LockManager] Error inside locked function [${resource}]:`, e.message);
            throw e;
        } finally {
            if (lockValue) {
                await this.release(resource, lockValue);
            }
        }
    }
}

module.exports = LockManager;
