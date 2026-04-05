import { generateTelegramContent } from '../src/utils/reportUtils.js';

// Mock data based on the screenshot (성광벤드 014620)
const mockStock = {
  name: "성광벤드",
  code: "014620",
  total_score: 95,
  latestSignal: {
    current_price: 39600,
    category: "추세 지속형",
    adx: 45,
    kis_change_data: { rate: 9.39, sign: '2' }
  },
  timeframeStatus: {
    '1H': { result_2: 39228 },
    '2H': { result_2: 39228, result_3: 38780 },
    '1D': { bb_upper: 39251 } 
  },
  buy_signal_timeframes: ['1H', '2H'],
  trend_signal_timeframes: ['1D']
};

console.log("=== v6.6.1 Logic Verification (Pine Script Base) ===");
console.log("Current Price:", mockStock.latestSignal.current_price);
console.log("Entry 1 (result_2):", mockStock.timeframeStatus['2H'].result_2);
console.log("Entry 2 (result_3):", mockStock.timeframeStatus['2H'].result_3);

const telegramMsg = generateTelegramContent([mockStock], new Set());
console.log("\n--- Generated Telegram Message ---");
console.log(telegramMsg);

const lines = telegramMsg.split('\n');
const slLine = lines.find(l => l.includes("손절가 (SL)"));

console.log("\n--- Value Check ---");
console.log("SL Line:", slLine);

// result_3(38780) * 0.98 = 38004.4 -> 38004
if (slLine && slLine.includes("38,004")) {
  console.log("✅ SUCCESS: SL is correctly -2% from Entry 2 (38,004).");
} else {
  console.log("❌ FAIL: SL calculation mismatch. Expected 38,004.");
}
