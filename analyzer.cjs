/**
 * analyzer.cjs
 * Translates TradingView Pine Script logic into Node.js
 */

// --- Math Utilities ---

function rsi(src, period) {
    if (src.length <= period) return Array(src.length).fill(null);
    let rsiValues = Array(period).fill(null);
    
    let gains = [];
    let losses = [];
    
    for (let i = 1; i < src.length; i++) {
        let diff = src[i] - src[i-1];
        gains.push(Math.max(0, diff));
        losses.push(Math.max(0, -diff));
    }
    
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b) / period;
    
    const firstRS = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    rsiValues.push(firstRS);
    
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        const rs = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        rsiValues.push(rs);
    }
    
    return rsiValues;
}

function ema(src, period) {
    const k = 2 / (period + 1);
    let emaValues = [src[0]];
    for (let i = 1; i < src.length; i++) {
        emaValues.push(src[i] * k + emaValues[i-1] * (1 - k));
    }
    return emaValues;
}

function sma(src, period) {
    let results = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) {
            results.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += src[i - j];
            }
            results.push(sum / period);
        }
    }
    return results;
}

function lowest(src, period) {
    let results = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) {
            results.push(null);
            continue;
        }
        let window = src.slice(i - period + 1, i + 1);
        results.push(Math.min(...window));
    }
    return results;
}

function stdev(src, period) {
    let results = [];
    for (let i = 0; i < src.length; i++) {
        if (i < period - 1) {
            results.push(null);
            continue;
        }
        let window = src.slice(i - period + 1, i + 1);
        let mean = window.reduce((a, b) => a + b) / period;
        let variance = window.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
        results.push(Math.sqrt(variance));
    }
    return results;
}

// ADX (Average Directional Index) Calculation
function calculateADX(high, low, close, period = 14) {
    if (close.length <= period) return Array(close.length).fill(null);
    let tr = [0], plusDM = [0], minusDM = [0];

    for (let i = 1; i < close.length; i++) {
        let upMove = high[i] - high[i - 1];
        let downMove = low[i - 1] - low[i];
        
        plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
        minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
        
        let tr1 = high[i] - low[i];
        let tr2 = Math.abs(high[i] - close[i - 1]);
        let tr3 = Math.abs(low[i] - close[i - 1]);
        tr.push(Math.max(tr1, tr2, tr3));
    }

    let smoothTR = [0], smoothPlusDM = [0], smoothMinusDM = [0];
    
    // Wilder's Smoothing
    for (let i = 1; i < close.length; i++) {
        if (i < period) {
            smoothTR.push(null);
            smoothPlusDM.push(null);
            smoothMinusDM.push(null);
            continue;
        }
        if (i === period) {
            smoothTR.push(tr.slice(1, period + 1).reduce((a, b) => a + b, 0));
            smoothPlusDM.push(plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0));
            smoothMinusDM.push(minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0));
        } else {
            smoothTR.push(smoothTR[i - 1] - (smoothTR[i - 1] / period) + tr[i]);
            smoothPlusDM.push(smoothPlusDM[i - 1] - (smoothPlusDM[i - 1] / period) + plusDM[i]);
            smoothMinusDM.push(smoothMinusDM[i - 1] - (smoothMinusDM[i - 1] / period) + minusDM[i]);
        }
    }

    let adx = Array(close.length).fill(null);
    let dx = [];

    for (let i = period; i < close.length; i++) {
        let plusDI = 100 * (smoothPlusDM[i] / smoothTR[i]);
        let minusDI = 100 * (smoothMinusDM[i] / smoothTR[i]);
        if (plusDI + minusDI === 0) {
            dx.push(0);
        } else {
            dx.push(100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI));
        }
    }

    let dxOffset = period; // dx array is shorter than close array
    for (let i = period * 2 - 1; i < close.length; i++) {
        if (i === period * 2 - 1) {
            adx[i] = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
        } else {
            adx[i] = ((adx[i - 1] * (period - 1)) + dx[i - dxOffset]) / period;
        }
    }

    return adx;
}

/**
 * Re-implements ta.valuewhen
 * @param {Array<boolean>} condition 
 * @param {Array<number>} source 
 * @param {number} occurrence (0 = latest, 1 = previous...)
 */
function valuewhen(condition, source, occurrence = 0) {
    let matches = [];
    for (let i = 0; i < condition.length; i++) {
        if (condition[i]) {
            matches.push({ val: source[i], idx: i });
        }
    }
    if (matches.length <= occurrence) return null;
    return matches[matches.length - 1 - occurrence].val;
}

// --- Pine Indicator Implementation ---

function calculateSignals(ohlcHistory, timeframeStr = '1D') {
    // Filter out potential nulls from Yahoo Finance
    const timestamps = ohlcHistory.time || [];
    const rawClose = ohlcHistory.close || [];
    const rawOpen = ohlcHistory.open || [];
    const rawHigh = ohlcHistory.high || [];
    const rawLow = ohlcHistory.low || [];
    const rawVolume = ohlcHistory.volume || [];

    let cleanData = [];
    for (let i = 0; i < rawClose.length; i++) {
        if (rawClose[i] !== null && rawOpen[i] !== null && rawHigh[i] !== null && rawLow[i] !== null) {
            cleanData.push({
                close: rawClose[i],
                open: rawOpen[i],
                high: rawHigh[i],
                low: rawLow[i],
                volume: rawVolume[i] || 0,
                time: timestamps[i]
            });
        }
    }

    if (cleanData.length < 50) return null;

    const close = cleanData.map(d => d.close);
    const open = cleanData.map(d => d.open);
    const low = cleanData.map(d => d.low);
    const high = cleanData.map(d => d.high);
    const volume = cleanData.map(d => d.volume);
    const timeArr = cleanData.map(d => d.time); // Unix timestamp in seconds
    const len = close.length;

    // RSI Pivot 1 (RSI 2)
    const rsi2 = rsi(close, 2);
    const P_2 = rsi2.map((val, i) => i > 1 ? (rsi2[i-2] > rsi2[i-1] && rsi2[i-1] < rsi2[i]) : false);
    const lowest_low_3_2 = lowest(low, 3);
    
    // Calculate result_2 over time
    let result_2_series = Array(len).fill(0);
    for (let i = 2; i < len; i++) {
        const B_2 = valuewhen(P_2.slice(0, i+1), lowest_low_3_2.slice(0, i+1), 0);
        const B_2_prev = valuewhen(P_2.slice(0, i), lowest_low_3_2.slice(0, i), 0);
        
        if (B_2_prev !== null && B_2 !== null && B_2_prev < B_2) {
            const Q_2 = lowest(low.slice(0, i+1), 2).pop();
            const QQ_2 = lowest(low.slice(0, i), 2).pop();
            result_2_series[i] = Q_2 > QQ_2 ? Q_2 : QQ_2;
        } else {
            result_2_series[i] = result_2_series[i-1];
        }
        
        // Trailing support: If the price breaks the support, the new low is the current support.
        if (result_2_series[i] > 0 && low[i] < result_2_series[i]) {
            result_2_series[i] = low[i];
        }
    }

    // RSI Pivot 2 (RSI 8)
    const rsi8 = rsi(close, 8);
    const P_3 = rsi8.map((val, i) => i > 1 ? (rsi8[i-2] > rsi8[i-1] && rsi8[i-1] < rsi8[i]) : false);
    const lowest_low_3_3 = lowest(low, 3);
    
    let result_3_series = Array(len).fill(0);
    for (let i = 2; i < len; i++) {
        const B_3 = valuewhen(P_3.slice(0, i+1), lowest_low_3_3.slice(0, i+1), 0);
        const B_3_prev = valuewhen(P_3.slice(0, i), lowest_low_3_3.slice(0, i), 0);
        
        if (B_3_prev !== null && B_3 !== null && B_3_prev < B_3) {
            const Q_3 = lowest(low.slice(0, i+1), 8).pop();
            const QQ_3 = lowest(low.slice(0, i), 8).pop();
            result_3_series[i] = Q_3 > QQ_3 ? Q_3 : QQ_3;
        } else {
            result_3_series[i] = result_3_series[i-1];
        }

        // Trailing support: If the price breaks the support, the new low is the current support.
        if (result_3_series[i] > 0 && low[i] < result_3_series[i]) {
            result_3_series[i] = low[i];
        }
    }

    // --- Trend Filter (EMA MACD) ---
    // [1] Primary Timeframe MACD (8, 26, 9, 0.2)
    const m_rapida = ema(close, 8);
    const m_lenta = ema(close, 26);
    const BBMacd = m_rapida.map((r, i) => r - m_lenta[i]);
    const Avg = ema(BBMacd, 9);
    const SDev = stdev(BBMacd, 9);
    const stdv = 0.2;
    const banda_supe = Avg.map((a, i) => a + stdv * SDev[i]);

    // [2] Multi-Timeframe (MTF) MACD
    const multiplier = 2;
    // Aggregate close array (compress)
    let mtfCloses = [];
    for (let i = 0; i < len; i += multiplier) {
        let endIdx = Math.min(i + multiplier - 1, len - 1);
        mtfCloses.push(close[endIdx]);
    }
    
    // Calculate indicators on compressed array
    const rapida_mtf = 12;
    const lenta_mtf = 39;
    const stdv_mtf = 0.4;
    
    const m_rapida_c = ema(mtfCloses, rapida_mtf);
    const m_lenta_c = ema(mtfCloses, lenta_mtf);
    const BBMacd_c = m_rapida_c.map((r, i) => r - m_lenta_c[i]);
    const Avg_c = ema(BBMacd_c, 9);
    const SDev_c = stdev(BBMacd_c, 9);
    const banda_supe_c = Avg_c.map((a, i) => a + stdv_mtf * SDev_c[i]);

    // Project MTF indicators back to base timeframe length
    let BBMacd_mtf = Array(len).fill(0);
    let Avg_mtf = Array(len).fill(0);
    let banda_supe_mtf = Array(len).fill(0);

    for (let i = 0; i < len; i++) {
        let mtfIdx = Math.floor(i / multiplier);
        BBMacd_mtf[i] = BBMacd_c[mtfIdx] !== undefined ? BBMacd_c[mtfIdx] : 0;
        Avg_mtf[i] = Avg_c[mtfIdx] !== undefined ? Avg_c[mtfIdx] : 0;
        banda_supe_mtf[i] = banda_supe_c[mtfIdx] !== undefined ? banda_supe_c[mtfIdx] : 0;
    }

    // --- Signal Evaluation ---
    const last_idx = len - 1;
    
    // Red Team Hotfix: cond_up7 Apple-to-Orange comparison fix (Avg_mtf -> Avg)
    const cond_up7_series = Array(len).fill(false);
    for (let i = 0; i < len; i++) {
        cond_up7_series[i] = (BBMacd[i] > banda_supe[i]) && 
                             (BBMacd_mtf[i] > banda_supe_mtf[i]) && 
                             (BBMacd[i] > Avg[i]) && 
                             (BBMacd_mtf[i] > 0);
    }
    const cond_up7 = cond_up7_series[last_idx];

    // Red Team Hotfix: DHH2 Separation (Pullback formed earlier, then breakout occurs within 5 bars)
    const pullback_formed_series = Array(len).fill(false);
    for (let i = 1; i < len; i++) {
        pullback_formed_series[i] = (result_2_series[i] > result_3_series[i]) && 
                                    (result_2_series[i-1] !== result_2_series[i]) && 
                                    (open[i] > result_2_series[i]);
    }

    const checkDHH2At = (idx) => {
        if (idx < 1) return false;
        if (!cond_up7_series[idx] || open[idx] <= result_2_series[idx]) return false;
        
        // Look back up to 5 bars from idx for pullback confirmation
        for (let k = idx; k >= Math.max(1, idx - 5); k--) {
            if (pullback_formed_series[k]) return true;
        }
        return false;
    };

    let isSignalActive = false;
    // To accommodate dashboard visibility, check if DHH2 fired in the recent 3 candles
    for (let i = last_idx; i > Math.max(0, last_idx - 3); i--) {
        if (checkDHH2At(i)) {
            isSignalActive = true;
            break;
        }
    }

    const rsi2_prev = rsi2[last_idx - 1] !== null ? rsi2[last_idx - 1] : 50;
    const rsi2_curr = rsi2[last_idx] !== null ? rsi2[last_idx] : 50;
    
    // 1. RSI Trigger: Hooking up from pullback region (< 40)
    const trigger_rsi = rsi2_prev < 40 && rsi2_curr > rsi2_prev;

    let trigger_vol = false;
    if (volume.length >= 20) {
        let volSum = 0;
        for (let i = last_idx - 20; i < last_idx; i++) {
            if (i >= 0) volSum += volume[i];
        }
        const volAvg = volSum / 20;
        // 2. Volume Trigger: Meaningful participation (> 1.5x average)
        if (volAvg > 0 && volume[last_idx] >= volAvg * 1.5) {
            trigger_vol = true;
        }
    }

    // 3. Price Action Confirmation: Bullish Candle (Close > Open)
    const bullish_candle = close[last_idx] > open[last_idx];

    // Entry Approved: Removed strict conditions per user request. Sniper uses Top 15 Telegram score filter instead.
    const entry_approved = true;

    // --- Progress & Final Signal Logic ---
    const timeframeMsMap = {
        '5M': 5 * 60 * 1000,
        '15M': 15 * 60 * 1000,
        '30M': 30 * 60 * 1000,
        '1H': 60 * 60 * 1000,
        '4H': 4 * 60 * 60 * 1000,
        '1D': 24 * 60 * 60 * 1000,
        '1W': 7 * 24 * 60 * 60 * 1000
    };
    const tfMs = timeframeMsMap[timeframeStr] || timeframeMsMap['1D'];
    
    // timeArr[last_idx] is usually seconds (unix) or potentially ms. Handle intelligently.
    const candleStartRaw = timeArr[last_idx];
    const candleStart = candleStartRaw > 1e11 ? candleStartRaw : candleStartRaw * 1000;
    const timenow = Date.now();
    let progress = Math.max(0, Math.min(1.0, (timenow - candleStart) / tfMs));
    
    // Signal_HH is strongly defined as DHH2 AND progress > 0.3 AND entry_approved
    const signal_HH = isSignalActive && progress > 0.3 && entry_approved;

    const adxArray = calculateADX(high, low, close, 14);
    const currentADX = adxArray[last_idx] !== null ? adxArray[last_idx] : 0;
    const isTrending = currentADX >= 25;

    // --- Phase 4: Optimal Entry Price & Categorization & Multi-targets ---
    const ema5 = ema(close, 5);
    const ema10 = ema(close, 10);
    const ema20 = ema(close, 20);
    const ema60 = ema(close, 60);
    const ema5_val = ema5[last_idx];
    const ema10_val = ema10[last_idx];
    const ema20_val = ema20[last_idx];
    const ema60_val = ema60[last_idx];
    
    // Bollinger Bands (20, 2)
    const sma20 = sma(close, 20);
    const sma60 = sma(close, 60);
    const sma120 = sma(close, 120);
    const stdev20 = stdev(close, 20);
    const bb_lower = sma20[last_idx] !== null ? sma20[last_idx] - 2 * stdev20[last_idx] : null;
    const bb_upper = sma20[last_idx] !== null ? sma20[last_idx] + 2 * stdev20[last_idx] : null;

    const lowest3_val = lowest_low_3_2[last_idx] !== null ? lowest_low_3_2[last_idx] : low[last_idx];

    let category = "기타 (관망)";
    let entry_price = close[last_idx];

    if (isTrending && cond_up7) {
        category = "추세 지속형";
        // Use EMA 20 or RSI Pivot as support for uptrends
        entry_price = Math.max(ema20_val, result_2_series[last_idx]);
    } else if (!isTrending) {
        // Range-bound
        category = "박스권 횡보";
        entry_price = bb_lower !== null ? bb_lower : lowest3_val;
    } else if (isTrending && !cond_up7) {
        if (rsi2_curr < 40) {
            category = "바닥권 반등";
            entry_price = lowest3_val; // tight stop base
        } else {
            category = "하락 추세";
            entry_price = lowest3_val;
        }
    }

    return {
        result_2: result_2_series[last_idx],
        result_3: result_3_series[last_idx],
        cond_up7,
        DHH2: isSignalActive,
        progress: Number(progress.toFixed(3)),
        signal_HH: signal_HH,
        adx: currentADX,
        isTrending: isTrending,
        trigger_rsi,
        trigger_vol,
        entry_approved,
        category,
        entry_price: entry_price ? Math.round(entry_price) : 0,
        ema5: ema5_val ? Math.round(ema5_val) : 0,
        ema10: ema10_val ? Math.round(ema10_val) : 0,
        ema20: ema20_val ? Math.round(ema20_val) : 0,
        ema60: ema60_val ? Math.round(ema60_val) : 0,
        sma20: sma20[last_idx] ? Math.round(sma20[last_idx]) : 0,
        sma60: sma60[last_idx] ? Math.round(sma60[last_idx]) : 0,
        sma120: sma120[last_idx] ? Math.round(sma120[last_idx]) : 0,
        bb_upper: bb_upper ? Math.round(bb_upper) : 0,
        current_price: close[last_idx] ? Math.round(close[last_idx]) : 0,
        open_price: open[last_idx] ? Math.round(open[last_idx]) : 0,
        prev_close: (last_idx > 0 && close[last_idx - 1]) ? Math.round(close[last_idx - 1]) : 0,
        kis_change_data: ohlcHistory.kis_change_data || null
    };
}

module.exports = { calculateSignals };
