const axios = require('axios');

async function testFallback() {
    let aiCommentsMap = {};
    const approvedStocks = [
        {
            code: '005930', name: '삼성전자',
            latestSignal: { category: '우량주', adx: 40 },
            total_score: 95, timeframeStatus: { '1D': { cond_up7: true } }
        }
    ];

    try {
        const aiPayload = approvedStocks.map(s => ({
            symbol: s.code, name: s.name, category: s.latestSignal.category, price: 72000,
            indicators: { adx: s.latestSignal.adx, score: s.total_score, trend: s.timeframeStatus['1D']?.cond_up7 ? "상승" : "관망" }
        }));
        
        console.log("Requesting AI comments...");
        const aiRes = await axios.post('http://127.0.0.1:8000/api/v1/generate-comment', 
            { stocks: aiPayload }, 
            { timeout: 5000 }
        );
        console.log("AI Response:", aiRes.data);
    } catch (aiErr) {
        console.error('[AI Service LLM Fallback] Failed to fetch LLM comments:', aiErr.message);
    }
    
    console.log("Continuation: Telemetry send will proceed with empty aiCommentsMap.");
}

testFallback();
