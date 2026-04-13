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
    NGINX_ROOT: "/var/www/mp-stock-discovery/dist",
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

function autoUpdateReleaseHistory() {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const version = pkg.version;
    const releasePath = 'RELEASE.md';
    let content = fs.readFileSync(releasePath, 'utf8');

    if (!content.includes(`## [v${version}]`)) {
        log(`Auto-generating release header for v${version}...`);
        const now = new Date().toISOString().split('T')[0];
        const newEntry = `
---

## [v${version}] - ${now}
### 🚩 상태: 자동화 배포 완료 (Automated Release)

### 🛠 주요 변경 및 조치 사항
1. [NEW] 배포 자동화 및 리포트 엔진 안정화 최적화 패치
2. [FIX] 릴리즈 이력 자동 기록 시스템 도입

`;
        // Insert after the main 5th line (after # title and description)
        const lines = content.split('\n');
        lines.splice(6, 0, newEntry);
        fs.writeFileSync(releasePath, lines.join('\n'));
        log(`RELEASE.md updated with version ${version}`);
    }
}

try {
    log("Starting Robust Deployment (v5.3.0)...");

    // 0.5 Validate Syntax (v7.8.5 Permanent Fix)
    log("Step 0.5: Validating server-side syntax (Permanent Stability Fix)...");
    const serverFiles = [
        'server.cjs',
        'analyzer.cjs',
        ...fs.readdirSync('src/routes').filter(f => f.endsWith('.cjs')).map(f => `src/routes/${f}`),
        ...fs.readdirSync('src/utils').filter(f => f.endsWith('.cjs')).map(f => `src/utils/${f}`)
    ];
    
    serverFiles.forEach(file => {
        try {
            execSync(`node -c "${file}"`, { stdio: 'pipe' });
            log(`  ✔ ${file} syntax OK`);
        } catch (e) {
            error(`  ✖ Syntax Error in ${file}:\n${e.stderr.toString()}`);
        }
    });

    // 0. Auto-increment version
    log("Step 0: Incrementing version (npm version patch)...");
    execSync('npm version patch --no-git-tag-version', { stdio: 'inherit' });

    // 1. Local Build
    log("Step 1: Building locally (powershell -ExecutionPolicy Bypass -Command 'npm run build')...");
    execSync('powershell -ExecutionPolicy Bypass -Command "npm run build"', { stdio: 'inherit' });
    log("Local build succeeded.");

    // [v6.2.9] Auto-update RELEASE.md before upload
    autoUpdateReleaseHistory();

    log("Step 1.5: Cleaning remote dist and fixing permissions...");
    const fixPermCmd = `ssh -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no ${CONFIG.USER}@${CONFIG.IP} "sudo rm -rf ${CONFIG.REMOTE_DIR}dist ${CONFIG.REMOTE_DIR}scripts && mkdir -p ${CONFIG.REMOTE_DIR}dist/assets ${CONFIG.REMOTE_DIR}scripts && sudo chown -R ${CONFIG.USER}:${CONFIG.USER} ${CONFIG.REMOTE_DIR}"`;
    execSync(fixPermCmd, { stdio: 'inherit' });

    log("Step 2: Uploading all backend assets to server...");
    const assets = [
        "dist/", 
        "src/", 
        "platform/", 
        "prisma/", 
        "scripts/", 
        "server.cjs", 
        "analyzer.cjs", 
        "package.json", 
        "package-lock.json",
        "RELEASE.md"
    ];
    const scpCmd = `scp -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no -r ${assets.map(a => `"${a}"`).join(' ')} ${CONFIG.USER}@${CONFIG.IP}:${CONFIG.REMOTE_DIR}`;
    execSync(scpCmd, { stdio: 'inherit' });
    log("Frontend and Backend assets uploaded successfully.");

    // 3. Remote Commands (Chmod + PM2 Reload)
    log("Step 3: Synchronizing permissions and reloading services...");
    const remoteCommands = [
        `chmod -R 755 ${CONFIG.REMOTE_DIR}dist`,
        `cd ${CONFIG.REMOTE_DIR} && npx prisma generate && npx prisma db push --accept-data-loss && pm2 reload ${CONFIG.PM2_NAME} --update-env`
    ].join(' && ');


    const sshCmd = `ssh -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no ${CONFIG.USER}@${CONFIG.IP} "${remoteCommands} && sudo rm -rf ${CONFIG.NGINX_ROOT} && sudo cp -r ${CONFIG.REMOTE_DIR}dist ${CONFIG.NGINX_ROOT} && sudo chown -R www-data:www-data ${CONFIG.NGINX_ROOT}"`;
    execSync(sshCmd, { stdio: 'inherit' });
    log("Server-side sync, Nginx root update, and reload complete.");

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
