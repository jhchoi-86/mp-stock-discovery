const { generateTelegramContent } = require('./src/utils/reportUtils.js');

// Mock data based on the screenshot (성광벤드 014620)
const mockStock = {
  name: "성광벤드",
  code: "014620",
  total_score: 95,
  latestSignal: {
    current_price: 39600, // Current price in screenshot
    category: "추세 지속형",
    adx: 45,
    kis_change_data: { rate: 9.39, sign: '2' }
  },
  timeframeStatus: {
    '1H': { result_2: 39228 },
    '2H': { result_2: 39228, result_3: 38780 },
    '1D': { bb_upper: 39251 } // 1D Target < Current Price (OLD LOGIC ISSUE)
  },
  buy_signal_timeframes: ['1H', '2H'],
  trend_signal_timeframes: ['1D']
};

console.log("=== v6.6.0 Logic Verification (Trending Stock) ===");
console.log("Current Price:", mockStock.latestSignal.current_price);
console.log("Original 1D BB Upper:", mockStock.timeframeStatus['1D'].bb_upper);

const telegramMsg = generateTelegramContent([mockStock], new Set());
console.log("\n--- Generated Telegram Message ---");
console.log(telegramMsg);

// Check for specific tokens
if (telegramMsg.includes("1차 목표가(보정)")) {
  console.log("\n✅ SUCCESS: Target price auto-correction (보정) detected.");
} else {
  console.log("\n❌ FAIL: Target price correction label missing.");
}

const lines = telegramMsg.split('\n');
const slLine = lines.find(l => l.includes("손절가 (SL)"));
const targetLine = lines.find(l => l.includes("1차 목표가(보정)"));

console.log("\n--- Value Check ---");
console.log("SL Line:", slLine);
console.log("Target Line:", targetLine);

// Entry1(39228) * 0.90 = 35305
if (slLine && slLine.includes("35,305")) {
  console.log("✅ SUCCESS: SL is correctly -10% from Entry 1 (35,305).");
} else {
  console.log("❌ FAIL: SL calculation mismatch.");
}

// 39600 * 1.05 = 41580
if (targetLine && targetLine.includes("41,580")) {
  console.log("✅ SUCCESS: Target 1 is correctly current * 1.05 (41,580).");
} else {
  console.log("❌ FAIL: Target 1 calculation mismatch.");
}
