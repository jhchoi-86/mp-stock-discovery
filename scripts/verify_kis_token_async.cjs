const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const KIS_APP_KEY = (process.env.KIS_APP_KEY || '').trim();
const KIS_APP_SECRET = (process.env.KIS_APP_SECRET || '').trim();
const TOKEN_DIR = path.join(__dirname, 'data');
const KIS_TOKEN_FILE = path.join(TOKEN_DIR, 'kis_token.json');

let kisAccessToken = null;
let kisTokenExpiry = 0;

async function getKisAccessTokenAsync(force = false) {
    if (!KIS_APP_KEY || !KIS_APP_SECRET) {
        throw new Error("KIS API Keys are missing in .env");
    }

    if (!force && !kisAccessToken) {
        try {
            console.log("[Test] Checking token file existence...");
            const fileExists = await fs.promises.access(KIS_TOKEN_FILE).then(() => true).catch(() => false);
            if (fileExists) {
                console.log("[Test] Reading token file...");
                const savedData = await fs.promises.readFile(KIS_TOKEN_FILE, 'utf8');
                const saved = JSON.parse(savedData);
                kisAccessToken = saved.token;
                kisTokenExpiry = saved.expiry;
                console.log("[Test] Token loaded from cache.");
            }
        } catch (e) {
            console.error("[Test] Failed to read token cache file:", e);
        }
    }

    if (!force && kisAccessToken && kisTokenExpiry > Date.now() + 3600000) {
        console.log("[Test] Token is still valid.");
        return kisAccessToken;
    }

    console.log("[Test] Requesting new Access Token...");
    try {
        const response = await axios.post('https://openapi.koreainvestment.com:9443/oauth2/tokenP', {
            grant_type: 'client_credentials',
            appkey: KIS_APP_KEY,
            appsecret: KIS_APP_SECRET
        });

        kisAccessToken = response.data.access_token;
        kisTokenExpiry = Date.now() + (response.data.expires_in * 1000);
        
        console.log("[Test] Checking data directory...");
        const dirExists = await fs.promises.access(TOKEN_DIR).then(() => true).catch(() => false);
        if (!dirExists) {
            await fs.promises.mkdir(TOKEN_DIR, { recursive: true });
        }
        
        console.log("[Test] Saving token atomically...");
        const tempPath = KIS_TOKEN_FILE + '.tmp';
        await fs.promises.writeFile(tempPath, JSON.stringify({
            token: kisAccessToken,
            expiry: kisTokenExpiry
        }, null, 2));
        await fs.promises.rename(tempPath, KIS_TOKEN_FILE);
        
        console.log(`[Test] Token successfully issued and cached.`);
        return kisAccessToken;
    } catch (e) {
        console.error("[Test] Token Request Failed:", e.response?.data || e.message);
        throw new Error("Failed to get KIS Access Token");
    }
}

async function runTest() {
    try {
        console.log("--- Starting Async KIS Token Verification ---");
        
        // 1. First call (should read from file or fetch if not present)
        const token1 = await getKisAccessTokenAsync();
        console.log("Call 1 OK, Token:", token1.substring(0, 10) + "...");

        // 2. Second call (should reuse cached memory token)
        const token2 = await getKisAccessTokenAsync();
        console.log("Call 2 OK, Token refers to same:", token1 === token2);

        // 3. Force refresh (should fetch and write atomically)
        const token3 = await getKisAccessTokenAsync(true);
        console.log("Call 3 (Force) OK, New Token:", token3.substring(0, 10) + "...");

        console.log("--- Verification Completed Successfully ---");
    } catch (err) {
        console.error("Verification FAILED:", err);
        process.exit(1);
    }
}

runTest();
