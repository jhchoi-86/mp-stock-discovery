const express = require('express');
const request = require('supertest');
const app = express();

// [TASK-S14] Safe BigInt Serialization (Alternative to global prototype patch)
app.set('json replacer', (key, value) => {
    return typeof value === 'bigint' ? value.toString() : value;
});

app.get('/test', (req, res) => {
    res.json({
        id: BigInt(1234567890123456789),
        message: "Hello BigInt"
    });
});

async function runTest() {
    console.log("Checking if BigInt.prototype.toJSON exists (should be undefined):", BigInt.prototype.toJSON);
    
    const response = await request(app).get('/test');
    console.log("Response Body:", response.body);
    
    if (response.body.id === "1234567890123456789") {
        console.log("SUCCESS: BigInt serialized correctly via Express replacer.");
    } else {
        console.error("FAILURE: BigInt serialization failed.");
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
