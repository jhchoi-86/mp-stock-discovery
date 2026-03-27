const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * mp-stock-discovery Safe Deployment Utility (v5.3.0)
 * --------------------------------------------------
 * This script automates:
 * 1. Local Build (npm run build)
 * 2. Remote Static Deployment (SCP dist/ to Server)
 * 3. Remote Permission Sync (chmod 755 dist/)
 * 4. Remote PM2 Reload
 */

const CONFIG = {
    IP: "15.134.243.209",
    USER: "ubuntu",
    KEY_PATH: "C:/Users/danbe/Documents/mp-key.pem",
    REMOTE_DIR: "~/mp-stock-discovery/",
    LOCAL_DIST: "./dist/",
    PM2_NAME: "mp-stock-discovery" 
};


function log(msg) {
    console.log(`\x1b[36m[DEPLOY]\x1b[0m ${msg}`);
}

function error(msg) {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`);
    process.exit(1);
}

try {
    log("Starting Robust Deployment (v5.3.0)...");

    // 1. Local Build
    log("Step 1: Building locally (npm.cmd run build)...");
    execSync('npm.cmd run build', { stdio: 'inherit' });
    log("Local build succeeded.");

    log("Step 2: Uploading 'dist/', 'server.cjs', and 'src/routes/' to server...");
    const filesToUpload = [
        CONFIG.LOCAL_DIST,
        "server.cjs",
        "src/routes/",
        ".env" // Optional but good for hash updates
    ].join('" "');
    const scpCmd = `scp -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no -r "${CONFIG.LOCAL_DIST}" "server.cjs" "src/routes/" ${CONFIG.USER}@${CONFIG.IP}:${CONFIG.REMOTE_DIR}`;
    execSync(scpCmd, { stdio: 'inherit' });
    log("Frontend and Backend assets uploaded successfully.");

    // 3. Remote Commands (Chmod + PM2 Reload)
    log("Step 3: Synchronizing permissions and reloading services...");
    const remoteCommands = [
        `chmod -R 755 ${CONFIG.REMOTE_DIR}dist`,
        `cd ${CONFIG.REMOTE_DIR} && pm2 reload ${CONFIG.PM2_NAME} --update-env`
    ].join(' && ');


    const sshCmd = `ssh -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no ${CONFIG.USER}@${CONFIG.IP} "${remoteCommands}"`;
    execSync(sshCmd, { stdio: 'inherit' });
    log("Server-side sync and reload complete.");

    // 4. Verification (Health Check)
    log("Step 4: Performing Remote Health Check (HTTP 200 OK Verification)...");
    const healthCheckCmd = `ssh -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no ${CONFIG.USER}@${CONFIG.IP} "curl -s -o /dev/null -w '%{http_code}' https://mpstock.co.kr/"`;
    const httpCode = execSync(healthCheckCmd).toString().trim();
    
    if (httpCode === '200') {
        log(`\x1b[32m✔ Health Check Passed (HTTP ${httpCode})\x1b[0m`);
        log("\x1b[32m✔ DEPLOYMENT SUCCESSFUL!\x1b[0m");
    } else {
        error(`Health Check Failed! Server returned HTTP ${httpCode}. Possible 403/500.`);
    }

} catch (err) {
    error(`Deployment failed: ${err.message}`);
}
