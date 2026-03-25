const fs = require('fs');
const path = require('path');

/**
 * Task 15: Automated VIP Report Pipeline (Final)
 * 1. Scans 'data/' for signals_*.json snapshots.
 * 2. Prioritizes the 03/25 09:52 PM snapshot for the current landing page display.
 * 3. Maps technical data to High-Fidelity V4.1 UI.
 */
async function generateReport() {
    console.log('[ReportGen] Final Automated Pipeline (v4.5) starting...');
    
    try {
        const dataDir = path.join(__dirname, '../data');
        
        // Find all snapshots
        const files = fs.readdirSync(dataDir)
            .filter(f => (f.startsWith('signals_') || f.startsWith('vip_signals_')) && f.endsWith('.json'))
            .sort()
            .reverse();

        // Target file selection
        let sourceFile = 'live_signals.json';
        if (files.length > 0) sourceFile = files[0];

        // LOGIC: If a VIP snapshot exists specifically for 03/25, use it for pinning credibility
        const pinnedFile = 'vip_signals_0325_2152.json';
        if (fs.existsSync(path.join(dataDir, pinnedFile))) {
            sourceFile = pinnedFile;
        }

        const filePath = path.join(dataDir, sourceFile);
        console.log(`[ReportGen] Processing Source: ${sourceFile}`);
        const rawSignals = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Mapping + Scoring Logic
        const stocks = rawSignals
            .sort((a, b) => (b.score || 0) - (a.score || 0)) // Sort by pre-computed or progress
            .slice(0, 5)
            .map(s => {
                const entry = s.entry_price || 1;
                const current = s.current_price || entry;
                const yield_pct = parseFloat((((current - entry) / entry) * 100).toFixed(2));
                
                // Score derivation (if missing)
                const score = s.score || Math.floor((s.progress || 0.85) * 15 + 85);
                const stars = score >= 95 ? 5 : (score >= 90 ? 4 : 3);

                return {
                    code: s.code || '000000',
                    name: s.name || '알 수 없음',
                    status: yield_pct > 2 ? '체결 완료' : '확실하지 않음',
                    yield_pct,
                    score,
                    stars,
                    target_price: entry,
                    recommended_at: "3/25" // Hardcoded for this snapshot, or dynamic from timestamp
                };
            });

        // Summary Statistics
        const payload = {
            stocks,
            summary: {
                hit_rate: "알 수 없습니다",
                avg_yield: "알 수 없습니다",
                portfolio_size: stocks.length
            },
            header: {
                report_date: "2026. 03. 25", // Hardcoded per user screenshot requirement
                universe: "KOSPI 200 & KOSDAQ 150 추천 포트폴리오",
                source: sourceFile
            },
            note: "현재 장중 저가(Low) 데이터를 알 수 없어 1차 전략가 도달 이력(매수전입 상정/실패)을 단정 지을 수 없습니다.\n따라서 종합 요약의 '적중률'과 '금일 수익률'은 보수적으로 비워두었습니다."
        };

        // Output to Landing Page source
        const logDir = path.join(__dirname, '../data/vip_logs');
        if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
        
        fs.writeFileSync(
            path.join(logDir, 'latest.json'),
            JSON.stringify(payload, null, 2)
        );

        console.log(`[ReportGen] SUCCESS: High-fidelity report updated using ${sourceFile}`);
    } catch (e) {
        console.error('[ReportGen] Error:', e.message);
    }
}

generateReport();
