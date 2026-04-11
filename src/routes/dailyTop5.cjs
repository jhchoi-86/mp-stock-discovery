const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const fs = require('fs');
const path = require('path');

const { getKstDateString } = require('../utils/kst.cjs');
const VIP_LOGS_DIR = path.join(__dirname, '../../data/vip_logs');

// Get Daily Top 5 for a specific date
router.get('/', async (req, res) => {
    const { date } = req.query; // Expects "YYYY-MM-DD"
    if (!date) {
        return res.status(400).json({ error: 'Date parameter is required (YYYY-MM-DD)' });
    }

    try {
        // [v8.8.41] 0. Try landing_strategy.json first as it's the actual source for landing page
        const strategyPath = path.join(__dirname, '../../data/landing_strategy.json');
        if (fs.existsSync(strategyPath)) {
            const strategy = JSON.parse(fs.readFileSync(strategyPath, 'utf8'));
            if (strategy.stocks && strategy.stocks.length > 0) {
                console.log(`[DailyTop5 API] Using landing_strategy.json as Primary Source`);
                const todayStr = getKstDateString();
                const mapped = strategy.stocks.slice(0, 5).map(s => ({
                    code: s.code,
                    name: s.name,
                    score: s.score || 0,
                    date: date
                }));
                return res.json(mapped);
            }
        }

        // 1. Try DB second
        const top5 = await prisma.dailyTop5.findMany({
            where: { date: date },
            orderBy: { score: 'desc' },
            take: 5
        });

        if (top5 && top5.length > 0) {
            return res.json(top5);
        }

        console.log(`[DailyTop5 API] No DB entries for ${date}. Falling back to latest.json`);
    } catch (error) {
        console.error('[DailyTop5 API] DB Error:', error.message);
    }

    // [v8.8.40] 2. Fallback to latest.json
    try {
        const latestPath = path.join(VIP_LOGS_DIR, 'latest.json');
        if (fs.existsSync(latestPath)) {
            const report = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
            if (report.stocks && report.stocks.length > 0) {
                const mapped = report.stocks.slice(0, 5).map(s => ({
                    code: s.code,
                    name: s.name,
                    score: s.score || 0,
                    date: date
                }));
                return res.json(mapped);
            }
        }
    } catch (fileErr) {
        console.error('[DailyTop5 API] File Fallback Error:', fileErr.message);
    }

    // [v8.8.40] 3. Last Fallback to DB Snapshots (Aligned with publicReports.cjs)
    try {
        const dbSnapshots = await prisma.dailyStockSnapshot.findMany({
            where: { 
                starGrade: { notIn: ['0', 'nullable'], not: null } 
            },
            orderBy: [
                { createdAt: 'desc' },
                { starGrade: 'desc' }
            ],
            take: 5
        });

        if (dbSnapshots && dbSnapshots.length > 0) {
            const mapped = dbSnapshots.map(s => ({
                code: s.code,
                name: s.name,
                score: s.score || 0,
                date: date
            }));
            return res.json(mapped);
        }
    } catch (snapErr) {
        console.error('[DailyTop5 API] Snapshot Fallback Error:', snapErr.message);
    }

    res.json([]);
});

module.exports = router;
