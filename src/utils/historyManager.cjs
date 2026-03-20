const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DATA_DIR = path.join(__dirname, '../../data');
const PAST_REC_FILE = path.join(DATA_DIR, 'past_recommendations.json');
const EXCEL_FILE = path.join(DATA_DIR, 'recommendations_history.xlsx');

// 1. Save today's recommendations for tomorrow's review
function savePastRecommendations(approvedStocks) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    
    // Convert current KST date
    const now = new Date();
    now.setUTCHours(now.getUTCHours() + 9); // KST
    const dateStr = `${now.getUTCFullYear()}-${(now.getUTCMonth()+1).toString().padStart(2,'0')}-${now.getUTCDate().toString().padStart(2,'0')}`;
    
    const records = approvedStocks.map(s => ({
        code: s.code,
        name: s.name,
        category: s.latestSignal.category,
        rec_price: s.latestSignal.entry_price || s.latestSignal.result_2 || s.latestSignal.current_price,
        date: dateStr
    }));

    fs.writeFileSync(PAST_REC_FILE, JSON.stringify(records, null, 2), 'utf8');
}

// 2. Load yesterday's recommendations, fetch current prices, evaluate, and save to Excel
async function evaluatePastRecommendations(kisToken, kisAppKey, kisAppSecret) {
    if (!fs.existsSync(PAST_REC_FILE)) return null;
    
    let pastRecs;
    try {
        pastRecs = JSON.parse(fs.readFileSync(PAST_REC_FILE, 'utf8'));
    } catch (e) {
        return null;
    }

    if (!pastRecs || pastRecs.length === 0) return null;

    const evaluated = [];
    let reviewText = `🎯 [전일 추천 종목 성과 리뷰]\n`;

    // Fetch live prices using KIS API
    for (const rec of pastRecs) {
        let highPrice = 0;
        let closePrice = 0;
        try {
            const kisUrl = 'https://openapi.koreainvestment.com:9443/uapi/domestic-stock/v1/quotations/inquire-price';
            const kisRes = await axios.get(kisUrl, {
                headers: {
                    'authorization': 'Bearer ' + kisToken,
                    'appkey': kisAppKey,
                    'appsecret': kisAppSecret,
                    'tr_id': 'FHKST01010100'
                },
                params: {
                    "FID_COND_MRKT_DIV_CODE": "J",
                    "FID_INPUT_ISCD": rec.code
                }
            });
            const data = kisRes.data.output;
            highPrice = parseInt(data.stck_hgpr);
            closePrice = parseInt(data.stck_prpr);
        } catch (e) {
            console.error(`[HistoryManager] Failed to fetch KIS data for ${rec.code}`);
            continue;
        }

        if (highPrice > 0 && rec.rec_price > 0) {
            const highYield = ((highPrice / rec.rec_price) - 1) * 100;
            const closeYield = ((closePrice / rec.rec_price) - 1) * 100;
            
            evaluated.push({
                date: rec.date,
                code: rec.code,
                name: rec.name,
                category: rec.category,
                rec_price: rec.rec_price,
                high_price: highPrice,
                high_yield: highYield.toFixed(2),
                close_price: closePrice,
                close_yield: closeYield.toFixed(2)
            });

            const emoji = highYield >= 5 ? '🚀' : (highYield > 0 ? '🔺' : '🔻');
            reviewText += `✅ ${rec.name} (${rec.code})\n` + 
                          `- 추천가: ${Math.round(rec.rec_price).toLocaleString()}원\n` +
                          `- 당일 최고가: ${Math.round(highPrice).toLocaleString()}원 (최고 ${highYield >= 0 ? '+' : ''}${highYield.toFixed(2)}% ${emoji})\n` +
                          `- 현재 종가: ${Math.round(closePrice).toLocaleString()}원 (${closeYield >= 0 ? '+' : ''}${closeYield.toFixed(2)}% 마감)\n\n`;
        }
    }

    if (evaluated.length === 0) return null;

    reviewText += `-------------------------\n\n`;

    // Append to Excel
    await appendToExcel(evaluated);

    // Delete PAST_REC_FILE so we don't evaluate twice
    fs.unlinkSync(PAST_REC_FILE);

    return reviewText;
}

// Helper to interact with ExcelJS
async function appendToExcel(records) {
    const workbook = new ExcelJS.Workbook();
    let worksheet;
    
    if (fs.existsSync(EXCEL_FILE)) {
      await workbook.xlsx.readFile(EXCEL_FILE);
      worksheet = workbook.getWorksheet('추천기록');
    } 
    
    if (!worksheet) {
      worksheet = workbook.addWorksheet('추천기록');
      worksheet.columns = [
        { header: '추천일자', key: 'date', width: 15 },
        { header: '종목코드', key: 'code', width: 15 },
        { header: '종목명', key: 'name', width: 25 },
        { header: '카테고리', key: 'category', width: 20 },
        { header: '추천가(종가)', key: 'rec_price', width: 15 },
        { header: '검증일_최고가', key: 'high_price', width: 15 },
        { header: '당일_최고수익률(%)', key: 'high_yield', width: 20 },
        { header: '검증일_종가', key: 'close_price', width: 15 },
        { header: '종가_수익률(%)', key: 'close_yield', width: 15 },
      ];
      // Format header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    }
  
    records.forEach(r => {
      worksheet.addRow(r);
    });
  
    await workbook.xlsx.writeFile(EXCEL_FILE);
}

// 3. Weekly & Monthly Reports
async function generateSummaryReport(period = 'weekly') {
    if (!fs.existsSync(EXCEL_FILE)) return null;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_FILE);
    const worksheet = workbook.getWorksheet('추천기록');
    
    if (!worksheet || worksheet.rowCount <= 1) return null;

    const now = new Date();
    now.setUTCHours(now.getUTCHours() + 9); // KST
    
    let cutoffDate = new Date(now);
    if (period === 'weekly') {
        cutoffDate.setDate(now.getDate() - 7);
    } else if (period === 'monthly') {
        cutoffDate.setMonth(now.getMonth() - 1);
    }

    const records = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const rowDate = new Date(row.getCell('A').value);
        if (rowDate >= cutoffDate && rowDate <= now) {
            records.push({
                name: row.getCell('C').value,
                code: row.getCell('B').value,
                highYield: parseFloat(row.getCell('G').value) || 0
            });
        }
    });

    if (records.length === 0) return null;

    // Aggregate highest yields
    // Distinct by name/code to find the absolute max yield hit during the period
    const bestPerformers = {};
    records.forEach(r => {
        if (!bestPerformers[r.code] || bestPerformers[r.code].highYield < r.highYield) {
            bestPerformers[r.code] = r;
        }
    });

    const sorted = Object.values(bestPerformers).sort((a, b) => b.highYield - a.highYield);
    const top3 = sorted.slice(0, 3);
    const title = period === 'weekly' ? '주간' : '월간';

    if (top3.length === 0 || top3[0].highYield <= 0) return null;

    let text = `🏆 [MP ${title} 추천주 최고 수익률 TOP 3]\n`;
    top3.forEach((s, idx) => {
        text += `${idx + 1}위. ${s.name} (+${s.highYield.toFixed(2)}%)\n`;
    });
    text += `\n* 더 상세한 누적 성과는 관리자 전용 엑셀 다운로드를 통해 확인할 수 있습니다.\n\n`;

    return text;
}

module.exports = {
    savePastRecommendations,
    evaluatePastRecommendations,
    generateSummaryReport,
    EXCEL_FILE
};
