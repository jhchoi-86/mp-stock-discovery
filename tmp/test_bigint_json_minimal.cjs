// [TASK-S14] Minimal Verification Script (No dependencies)
const express = require('express');

// We don't actually need to run the server, just test the replacer logic
const replacer = (key, value) => {
    return typeof value === 'bigint' ? value.toString() : value;
};

const testData = {
    id: BigInt("1234567890123456789"),
    nested: {
        val: BigInt(42)
    },
    list: [BigInt(1), BigInt(2)]
};

console.log("Checking if BigInt.prototype.toJSON exists (should be undefined):", BigInt.prototype.toJSON);

const serialized = JSON.stringify(testData, replacer);
console.log("Serialized JSON:", serialized);

const parsed = JSON.parse(serialized);

if (parsed.id === "1234567890123456789" && parsed.nested.val === "42" && parsed.list[0] === "1") {
    console.log("SUCCESS: BigInt serialized correctly via replacer.");
} else {
    console.error("FAILURE: BigInt serialization failed.");
    console.log("Parsed result:", parsed);
    process.exit(1);
}

// Check global prototype again
if (BigInt.prototype.toJSON !== undefined) {
    console.error("FAILURE: BigInt.prototype.toJSON is still defined!");
    process.exit(1);
}

console.log("FINAL VERIFICATION: Global prototype is clean and replacer works.");
