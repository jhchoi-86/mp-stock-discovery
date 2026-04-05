const len = 100; // Smaller for debugging
const low = Array.from({length: len}, (_, i) => 1000 + i); // Linear for predictability
const P_2 = Array.from({length: len}, (_, i) => i % 5 === 0); // Every 5th
const lowest_low_3_2 = Array.from({length: len}, (_, i) => low[i]); // Simplify

function valuewhenOriginal(condition, source, occurrence = 0) {
    let matches = [];
    for (let j = 0; j < condition.length; j++) {
        if (condition[j]) matches.push(source[j]);
    }
    if (matches.length <= occurrence) return null;
    return matches[matches.length - 1 - occurrence];
}

function runOriginal() {
    let res = Array(len).fill(0);
    for (let i = 2; i < len; i++) {
        const B_2 = valuewhenOriginal(P_2.slice(0, i+1), lowest_low_3_2.slice(0, i+1), 0);
        const B_2_prev = valuewhenOriginal(P_2.slice(0, i), lowest_low_3_2.slice(0, i), 0);
        if (B_2_prev !== null && B_2 !== null && B_2_prev < B_2) {
            res[i] = 777; // Constant to test logic trigger
        } else {
            res[i] = res[i-1];
        }
    }
    return res;
}

function runOptimized() {
    let res = Array(len).fill(0);
    let last = null;
    let prev = null;
    for (let i = 0; i < len; i++) {
        if (P_2[i]) {
            prev = last;
            last = lowest_low_3_2[i];
        }
        if (i < 2) continue;
        const B_2 = last;
        const B_2_prev = prev;
        if (B_2_prev !== null && B_2 !== null && B_2_prev < B_2) {
            res[i] = 777;
        } else {
            res[i] = res[i-1];
        }
    }
    return res;
}

const r1 = runOriginal();
const r2 = runOptimized();

let match = 0;
for(let i=0; i<len; i++) {
    if(r1[i] === r2[i]) match++;
    else console.log(`Mismatch at ${i}: Ori=${r1[i]}, Opt=${r2[i]}`);
}
console.log(`Matches: ${match}/${len}`);
