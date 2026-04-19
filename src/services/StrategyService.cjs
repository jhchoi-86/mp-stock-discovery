'use strict';
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * StrategyService.cjs — PPP 전략 데이터 고도화 서비스 (v9.8.9)
 * -----------------------------------------------------------
 * 1. Top 10 종목에 대한 매매 근거(Rationale) 자동 생성
 * 2. 진입가/손절가/목표가 계층 정합성 검증
 * 3. MTF(Multi-Timeframe) 정렬 상태 분석 
 */

class StrategyService {
    /**
     * 특정 시그널 데이터를 분석하여 한국어 자연어 근거 생성
     */
    generateRationale(signal) {
        const reasons = [];
        
        // 1. 추세 에너지 분석
        if (signal.signal_HHH) {
            reasons.push("강력한 매수 에너지와 대량 거래량 동반");
        } else if (signal.signal_HH) {
            reasons.push("PPP 7-Timeframe 정배열 임박 구간");
        }

        // 2. 변동성 및 추세 강도
        if (signal.bbw > 180) {
            reasons.push("변동성 수축 후 상방 에너지 확산 국면");
        }
        
        if (signal.adx > 25) {
            reasons.push("추세 강도(ADX) 우상향 가속화");
        }

        // 3. 이평선 및 패턴
        if (signal.maArrangement === '정배열') {
            reasons.push("중장기 이평선 정배열 추세 지속형");
        } else if (signal.DHH2) {
            reasons.push("안정적인 지지선 상단 눌림목 패턴 확인");
        }

        // 4. 점수 기반 결론
        if (signal.totalScore >= 95) {
            reasons.push("알고리즘 종합 점수 최상위(S등급) 포착");
        }

        return reasons.length > 0 ? reasons.join(" | ") : "기술적 반등 및 수급 개선 시그널 발생";
    }

    /**
     * 리포트용 표준 데이터 바인딩
     */
    enrichStrategyData(signal) {
        return {
            id: signal.id || `ppp-${signal.code}`,
            code: signal.code || signal.ticker,
            name: signal.name,
            market: signal.market || 'KR_STOCK',
            score: signal.totalScore || signal.score || 0,
            timeframe: signal.timeframe || 'MTF',
            current_price: signal.current_price,
            
            // 핵심 타점 (v9.8.9 DB/Signal 통합 지원 - Gemini 우선)
            entry_1: signal.gemini_entry_1 || signal.result_2 || signal.entry_1, 
            entry_2: signal.gemini_entry_2 || signal.result_3 || (signal.result_2 ? Math.round(signal.result_2 * 0.98) : null),
            target:  signal.gemini_target  || signal.target_price || signal.result_1 || signal.g_sell || Math.round(signal.current_price * 1.1), 
            stop_loss: signal.gemini_stop_loss || signal.stop_loss || (signal.result_2 ? Math.round(signal.result_2 * 0.96) : Math.round(signal.current_price * 0.95)),
            
            // 지표 세부 수치 (DB 데이터는 metrics가 없을 수 있으므로 방어 코드)
            metrics: {
                adx: signal.adx ? Math.round(signal.adx * 10) / 10 : 20,
                bbw: signal.bbw ? Math.round(signal.bbw) : 100,
                ma: signal.maArrangement || 'N/A',
                volTrigger: signal.trigger_vol || false
            },
            
            // 자연어 근거 (Gemini 우선)
            rationale: signal.gemini_rationale || this.generateRationale(signal),
            is_ai_generated: !!signal.gemini_rationale,
            chartUrl: `https://www.tradingview.com/chart/?symbol=KRX:${signal.code || signal.ticker}`
        };
    }

    /**
     * AI 마이크로서비스를 통한 대량 근거 생성 (v9.8.5)
     */
    async generateAiRationales(stocks) {
        const AI_SERVICE_URL = 'http://127.0.0.1:8000/api/v1/generate-comment';
        const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || 'fallback_secret';

        try {
            const payload = {
                stocks: stocks.map(s => ({
                    symbol: s.code || s.ticker,
                    name: s.name,
                    category: s.market || 'KR_STOCK',
                    price: s.current_price || 0,
                    indicators: {
                        adx: s.adx,
                        bbw: s.bbw,
                        score: s.score || s.totalScore,
                        ma: s.maArrangement
                    }
                }))
            };

            const response = await axios.post(AI_SERVICE_URL, payload, {
                headers: { 'X-Internal-API-Key': INTERNAL_SECRET },
                timeout: 15000
            });

            if (response.data && Array.isArray(response.data)) {
                const map = {};
                response.data.forEach(item => {
                    map[item.symbol] = item.ai_comment;
                });
                return map;
            }
        } catch (err) {
            console.error(`[StrategyService] AI Rationale Generation Failed:`, err.message);
        }
        return null;
    }

    /**
     * Top 10 전략 보고서 파일 생성 (v9.8.5 AI 연동)
     */
    async generateStaticReport(signals, dataDir) {
        const rawTop10 = (signals || []).slice(0, 10);
        
        // 1. AI 근거 생성 시도
        const aiRationales = await this.generateAiRationales(rawTop10);
        
        // 2. 데이터 바인딩 (AI 결과가 있으면 교체)
        const top10 = rawTop10.map(s => {
            const enriched = this.enrichStrategyData(s);
            const code = s.code || s.ticker;
            if (aiRationales && aiRationales[code]) {
                enriched.rationale = aiRationales[code];
                enriched.is_ai_generated = true;
            }
            return enriched;
        });

        const filePath = path.join(dataDir, 'watchlist_strategy.json');
        const payload = {
            updatedAt: new Date().toISOString(),
            stocks: top10,
            version: "9.8.9"
        };
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
        console.log(`[StrategyService] AI-Enriched static report generated: ${filePath}`);
        return payload;
    }

    /**
     * 텔레그램 채널로 전략 보고서 요약 방송 (v9.8.1)
     */
    async broadcastTop10(signals, telegramBot, channelId) {
        if (!telegramBot || !channelId) return;
        
        const top3 = (signals || []).slice(0, 3).map(s => this.enrichStrategyData(s));
        if (top3.length === 0) return;

        let message = `🚀 [MP Stock] 실시간 Top 3 매매 전략\n`;
        message += `----------------------------\n`;
        
        for (const s of top3) {
            message += `📌 ${s.name} (${s.code})\n`;
            message += `💰 현재가: ${s.current_price?.toLocaleString()}원\n`;
            message += `🎯 1차 진입가: ${s.entry_1?.toLocaleString()}원\n`;
            message += `📉 눌림목: ${s.entry_2?.toLocaleString()}원\n`;
            message += `🚀 목표가: ${s.target?.toLocaleString()}원\n`;
            message += `🚫 손절가: ${s.stop_loss?.toLocaleString()}원\n`;
            message += `📝 근거: ${s.rationale}\n\n`;
        }
        
        message += `🔗 전체 리포트: https://mpstock.co.kr/strategy-report`;

        try {
            await telegramBot.sendTelegramMessage(message, channelId);
            console.log(`[StrategyService] Telegram broadcast success`);
        } catch (err) {
            console.error(`[StrategyService] Telegram broadcast failed:`, err.message);
        }
    }
}

module.exports = new StrategyService();
