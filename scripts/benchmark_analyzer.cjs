const len = 1000;
const low = Array.from({length: len}, () => Math.floor(Math.random() * 100000));
const P_2 = Array.from({length: len}, () => Math.random() > 0.8);
const lowest_low_3_2 = Array.from({length: len}, (_, i) => Math.min(...low.slice(Math.max(0, i-2), i+1)));

function valuewhenOriginal(condition, source, occurrence = 0) {
    let matches = [];
    for (let i = 0; i < condition.length; i++) {
        if (condition[i]) {
            matches.push({ val: source[i], idx: i });
        }
    }
    if (matches.length <= occurrence) return null;
    return matches[matches.length - 1 - occurrence].val;
}

function runOriginal() {
    let result_2_series = Array(len).fill(0);
    for (let i = 2; i < len; i++) {
        const B_2 = valuewhenOriginal(P_2.slice(0, i+1), lowest_low_3_2.slice(0, i+1), 0);
        const B_2_prev = valuewhenOriginal(P_2.slice(0, i), lowest_low_3_2.slice(0, i), 0);
        if (B_2_prev !== null && B_2 !== null && B_2_prev < B_2) {
            result_2_series[i] = Math.max(low[i], low[i-1]);
        } else {
            result_2_series[i] = result_2_series[i-1];
        }
    }
    return result_2_series;
}

function runOptimized() {
    let result_2_series = Array(len).fill(0);
    let last_val_B2 = null;
    let prev_val_B2 = null;
    for (let i = 0; i < len; i++) {
        if (P_2[i]) {
            prev_val_B2 = last_val_B2;
            last_val_B2 = lowest_low_3_2[i];
        }
        if (i < 2) continue;
        const B_2 = last_val_B2;
        const B_2_prev = prev_val_B2;
        if (B_2_prev !== null && B_2 !== null && B_2_prev < B_2) {
            result_2_series[i] = Math.max(low[i], low[i-1]);
        } else {
            result_2_series[i] = result_2_series[i-1] || 0;
        }
    }
    return result_2_series;
}

console.log(`Benchmarking for ${len} candles...`);

const start1 = performance.now();
const res1 = runOriginal();
const end1 = performance.now();
console.log(`Original O(N^2): ${(end1 - start1).toFixed(2)}ms`);

const start2 = performance.now();
const res2 = runOptimized();
const end2 = performance.now();
console.log(`Optimized O(N): ${(end2 - start2).toFixed(2)}ms`);

// Basic integrity check
let matchCount = 0;
for(let i=0; i<len; i++) if(res1[i] === res2[i]) matchCount++;
console.log(`Integrity Check: ${matchCount}/${len} matches.`);
