require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const os = require('os');
const { exec } = require('child_process');
const redisClient = require('../../platform/infra/redis/client.cjs');

/**
 * System Stats Service
 * Handles collection of daily user activity and system resource metrics.
 */
const systemStatsService = {
  /**
   * Get Today's Date String (YYYY-MM-DD)
   */
  getToday() {
    const { getKSTDateString } = require('../utils/kst.cjs');
    return getKSTDateString();
  },

  /**
   * Record a login event
   */
  async recordLogin() {
    const today = this.getToday();
    try {
      await prisma.systemStat.upsert({
        where: { date: today },
        update: { loginCount: { increment: 1 } },
        create: { date: today, loginCount: 1 }
      });
    } catch (err) {
      console.error('[SystemStats] Record Login Error:', err);
    }
  },

  /**
   * Record a signup event
   */
  async recordSignup() {
    const today = this.getToday();
    try {
      await prisma.systemStat.upsert({
        where: { date: today },
        update: { signupCount: { increment: 1 } },
        create: { date: today, signupCount: 1 }
      });
    } catch (err) {
      console.error('[SystemStats] Record Signup Error:', err);
    }
  },

  /**
   * Record a unique visitor (Redis-based)
   */
  async recordVisitor(identifier) {
    const today = this.getToday();
    const key = `visitors:${today}`;
    try {
      const isNew = await redisClient.sadd(key, identifier);
      if (isNew) {
        await prisma.systemStat.upsert({
          where: { date: today },
          update: { visitorCount: { increment: 1 } },
          create: { date: today, visitorCount: 1 }
        });
      }
    } catch (err) {
      console.error('[SystemStats] Record Visitor Error:', err);
    }
  },

  /**
   * Update Concurrent User Count
   */
  async updateMaxConcurrent(count) {
    const today = this.getToday();
    try {
      const current = await prisma.systemStat.findUnique({ where: { date: today } });
      if (!current || count > current.maxConcurrent) {
        await prisma.systemStat.upsert({
          where: { date: today },
          update: { maxConcurrent: count },
          create: { date: today, maxConcurrent: count }
        });
      }
    } catch (err) {
      console.error('[SystemStats] Update Concurrent Error:', err);
    }
  },

  /**
   * Get Current System Resources (CPU, RAM, Disk)
   */
  async getSystemResources() {
    // 1. CPU Load (Load average or heuristic)
    const cpus = os.cpus().length;
    const loadAvg = os.loadavg();
    const cpuUsage = Math.min(((loadAvg[0] / cpus) * 100).toFixed(2), 100);

    // 2. Memory Usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = (((totalMem - freeMem) / totalMem) * 100).toFixed(2);

    // 3. Disk Usage (Async via df)
    let diskUsage = 0;
    try {
      const diskInfo = await new Promise((resolve) => {
        const cmd = os.platform() === 'win32' ? 'wmic logicaldisk where "deviceid=\'C:\'" get size,freespace' : "df -h / | tail -1 | awk '{print $5}'";
        exec(cmd, (err, stdout) => {
          if (err || !stdout) resolve("0%");
          if (os.platform() === 'win32') {
            const lines = stdout.trim().split(/\s+/);
            if (lines.length >= 4) {
              const free = parseInt(lines[2]);
              const total = parseInt(lines[3]);
              const usedPct = (((total - free) / total) * 100).toFixed(0);
              return resolve(`${usedPct}%`);
            }
            resolve("0%");
          } else {
            resolve(stdout.trim());
          }
        });
      });
      diskUsage = parseFloat(diskInfo.replace('%', '')) || 0;
    } catch (e) {
      diskUsage = 0;
    }

    // 4. Sync Pipeline Status (v2.1)
    let syncStatus = {};
    try {
      const [
        phase1Ready, 
        lastSnapshot, 
        phase1DataReady,
        phase2Complete, 
        phase2Count,
        phase3LastCandle,
        phase3Complete
      ] = await Promise.all([
        redisClient.get('phase1_success'),
        redisClient.get('phase1_snapshot_ts'),
        redisClient.get('phase1_data_ready'),
        redisClient.get('phase2_complete_ts'),
        redisClient.get('phase2_modified_count'),
        redisClient.get('phase3_last_candle_ts'),
        redisClient.get('phase3_complete_ts')
      ]);

      syncStatus = {
        phase1Ready: phase1Ready === 'true',
        lastSnapshot: lastSnapshot || '없음',
        phase1DataReady: phase1DataReady || '',
        lastFullSync: phase2Complete || (phase1Ready === 'true' ? '진행 예정' : '미확인'),
        phase2Count: parseInt(phase2Count) || 0,
        phase3LastCandle: phase3LastCandle || '',
        phase3Complete: phase3Complete || ''
      };
    } catch (e) {
      console.warn('[SystemStats] Sync Status Fetch Error:', e.message);
    }

    return {
      cpuUsage: parseFloat(cpuUsage),
      memUsage: parseFloat(memUsage),
      diskUsage: parseFloat(diskUsage),
      uptime: os.uptime(),
      health: (cpuUsage < 90 && memUsage < 95) ? 'HEALTHY' : 'WARN',
      sync: syncStatus
    };
  },

  /**
   * Archive Daily Stats (Membership distribution, etc.)
   */
  async archiveDailyStats() {
    const today = this.getToday();
    try {
      const freeUserCount = await prisma.user.count({ where: { role: { in: ['FREE', 'FREE_TRIAL', 'PENDING'] } } });
      const paidUserCount = await prisma.user.count({ where: { role: { in: ['PAID'] } } });
      
      const resources = await this.getSystemResources();

      await prisma.systemStat.upsert({
        where: { date: today },
        update: {
          freeUserCount,
          paidUserCount,
          cpuUsageAvg: resources.cpuUsage,
          memUsageAvg: resources.memUsage,
          diskUsageAvg: resources.diskUsage,
          healthStatus: resources.health
        },
        create: {
          date: today,
          freeUserCount,
          paidUserCount,
          cpuUsageAvg: resources.cpuUsage,
          memUsageAvg: resources.memUsage,
          diskUsageAvg: resources.diskUsage,
          healthStatus: resources.health
        }
      });
      console.log(`[SystemStats] Daily stats archived for ${today}`);
    } catch (err) {
      console.error('[SystemStats] Archive Error:', err);
    }
  }
};

module.exports = systemStatsService;
