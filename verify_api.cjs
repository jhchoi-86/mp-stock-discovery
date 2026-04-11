const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const API_KEY = process.env.INTERNAL_API_SECRET || 'fallback_secret';

async function testAuth() {
    console.log('Testing Internal API Authentication...');
    try {
        // 1. Without header
        await axios.post('http://127.0.0.1:8000/api/v1/generate-comment', { stocks: [] });
        console.log('❌ FAIL: Request without header succeeded (Expected 403)');
    } catch (err) {
        if (err.response && err.response.status === 403) {
            console.log('✅ PASS: Request without header returned 403');
        } else {
            console.log(`❓ UNEXPECTED: Request without header returned ${err.response?.status || err.message}`);
        }
    }

    try {
        // 2. With WRONG header
        await axios.post('http://127.0.0.1:8000/api/v1/generate-comment', { stocks: [] }, {
            headers: { 'x-internal-api-key': 'wrong_key' }
        });
        console.log('❌ FAIL: Request with wrong header succeeded (Expected 403)');
    } catch (err) {
        if (err.response && err.response.status === 403) {
            console.log('✅ PASS: Request with wrong header returned 403');
        } else {
            console.log(`❓ UNEXPECTED: Request with wrong header returned ${err.response?.status || err.message}`);
        }
    }

    try {
        // 3. With CORRECT header
        const res = await axios.post('http://127.0.0.1:8000/api/v1/generate-comment', { stocks: [] }, {
            headers: { 'x-internal-api-key': API_KEY }
        });
        console.log(`✅ PASS: Request with correct header succeeded (Status: ${res.status})`);
    } catch (err) {
        console.log(`❌ FAIL: Request with correct header failed: ${err.message}`);
        if (err.response) console.log('Response:', err.response.data);
    }
}

async function testHealth() {
    console.log('\nTesting AI Service Health Check...');
    try {
        const res = await axios.get('http://127.0.0.1:8000/health');
        console.log('✅ PASS: Health check returned:', res.data);
    } catch (err) {
        console.log('❌ FAIL: Health check failed:', err.message);
    }
}

async function run() {
    await testAuth();
    await testHealth();
}

run();
