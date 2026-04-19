const express = require('express');
const fs = require('fs');
const path = require('path');
const StrategyService = require('../services/StrategyService.cjs');
const authMiddleware = require('../middlewares/authMiddleware.cjs');

const router = express.Router();
const SIGNALS_FILE = path.join(__dirname, '../../data/signals.json');

/**
 * GET /api/strategy/top10
 * 최신 시그널 데이터에서 상위 10개 종목의 매매 전략 리포트 반환
 */
router.get('/top10', authMiddleware, async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const STRATEGY_FILE = path.join(__dirname, '../../data/watchlist_strategy.json');

        // 1. AI 분석된 정적 파일 로딩 시도 (최우선)
        if (fs.existsSync(STRATEGY_FILE)) {
            try {
                const fileContent = fs.readFileSync(STRATEGY_FILE, 'utf8');
                const strategyData = JSON.parse(fileContent);
                
                if (strategyData.stocks && strategyData.stocks.length > 0) {
                    // 구버전/신버전 필드명 통합 정규화 (호환성 보장)
                    const normalizedStocks = strategyData.stocks.map(s => ({
                        id:            s.id || `ppp-${s.code}`,
                        code:          s.code,
                        name:          s.name,
                        score:         s.score || 0,
                        category:      s.category || '추세 지속형',
                        market:        s.market || 'KR_STOCK',
                        timeframe:     s.timeframe || 'MTF',
                        // ✅ 신규 필드명 (구버전 → 신버전 자동 변환)
                        current_price: s.current_price || s.currentPrice || 0,
                        entry_1:       s.entry_1 || s.entryPrice1 || s.entryPrice || 0,
                        entry_2:       s.entry_2 || s.entryPrice2 || 0,
                        target:        s.target || s.targetPrice1 || s.targetPrice || 0,
                        stop_loss:     s.stop_loss || s.stopLoss || 0,
                        rationale:     s.rationale || s.aiComment || '기술적 반등 및 수급 개선 시그널 발생',
                        is_ai_generated: s.is_ai_generated || !!(s.aiComment),
                        chartUrl:      s.chartUrl || `https://www.tradingview.com/chart/?symbol=KRX:${s.code}`,
                        metrics:       s.metrics || { adx: 20, bbw: 100, ma: 'N/A', volTrigger: false }
                    }));

                    return res.json({
                        success: true,
                        source: 'file',
                        version: strategyData.version || '9.8.9',
                        updatedAt: strategyData.updatedAt || new Date().toISOString(),
                        count: normalizedStocks.length,
                        data: normalizedStocks
                    });
                }
            } catch (fileErr) {
                console.warn('[Strategy API] 리포트 파일 읽기 실패, DB 폴백 진행:', fileErr.message);
            }
        }

        // 2. 파일 부재 또는 오류 시 DB에서 실시간 조회 (Fallback)
        const activeWatchlist = await prisma.pppWatchlist.findMany({
            where: { is_active: true },
            orderBy: { score: 'desc' },
            take: 10
        });

        if (!activeWatchlist || activeWatchlist.length === 0) {
            return res.json({ success: true, data: [], source: 'db', version: '9.8.9' });
        }

        const reportData = activeWatchlist.map(item => StrategyService.enrichStrategyData(item));

        res.json({
            success: true,
            source: 'db',
            version: '9.8.9',
            count: reportData.length,
            timestamp: Date.now(),
            data: reportData
        });

    } catch (error) {
        console.error('[Strategy API Error]', error);
        res.status(500).json({ success: false, error: '전략 데이터를 처리하는 중 오류가 발생했습니다.' });
    }
});

module.exports = router;
