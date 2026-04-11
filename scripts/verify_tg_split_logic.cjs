const assert = require('assert');

function splitTelegramMessage(content, maxBytes) {
    const chunks = [];
    let currentChunk = "";
    let currentBytes = 0;

    const lines = content.split('\n');
    for (const line of lines) {
        const lineWithNewline = (line === lines[lines.length - 1] && !content.endsWith('\n')) ? line : line + '\n';
        const lineBytes = Buffer.from(lineWithNewline).length;

        if (currentBytes + lineBytes > maxBytes) {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = "";
                currentBytes = 0;
            }

            if (lineBytes > maxBytes) {
                let remainingLine = lineWithNewline;
                while (Buffer.from(remainingLine).length > 0) {
                    let charCount = 0;
                    let sliceSize = 0;
                    while (charCount < remainingLine.length) {
                        const charBytes = Buffer.from(remainingLine[charCount]).length;
                        if (sliceSize + charBytes > maxBytes) break;
                        sliceSize += charBytes;
                        charCount++;
                    }
                    chunks.push(remainingLine.substring(0, charCount));
                    remainingLine = remainingLine.substring(charCount);
                }
            } else {
                currentChunk = lineWithNewline;
                currentBytes = lineBytes;
            }
        } else {
            currentChunk += lineWithNewline;
            currentBytes += lineBytes;
        }
    }
    if (currentChunk) chunks.push(currentChunk);
    return chunks;
}

function runTest() {
    console.log("--- Starting Telegram Split Logic Verification ---");

    // 1. Test Data Generation (Korean + Emojis + English)
    const longKorean = "안녕하세요. 텔레그램 메시지 분할 테스트 중입니다. ".repeat(100); // ~150 * 100 = 15000 chars (approx 25000 bytes)
    const emojis = "🚀🔥📈💰🤖".repeat(50); // 50 * 5 * 4 = 1000 bytes
    const testContent = longKorean + "\n" + emojis + "\n" + "End of Message";
    
    const MAX_BYTES = 4000;
    const chunks = splitTelegramMessage(testContent, MAX_BYTES);

    console.log(`[Test] Total Content Length (chars): ${testContent.length}`);
    console.log(`[Test] Total Content Bytes: ${Buffer.from(testContent).length}`);
    console.log(`[Test] Number of Chunks: ${chunks.length}`);

    // 2. Assertions
    let joined = "";
    chunks.forEach((chunk, i) => {
        const byteLen = Buffer.from(chunk).length;
        console.log(`Chunk ${i+1} byte length: ${byteLen}`);
        assert(byteLen <= 4096, `Chunk ${i+1} exceeds 4096 bytes: ${byteLen}`);
        joined += chunk;
    });

    assert.strictEqual(joined, testContent, "Joined chunks do not match original content!");
    console.log("--- Verification SUCCESS: All Chunks are safe and integrity is maintained. ---");
}

try {
    runTest();
} catch (e) {
    console.error("Verification FAILED:", e.message);
    process.exit(1);
}
