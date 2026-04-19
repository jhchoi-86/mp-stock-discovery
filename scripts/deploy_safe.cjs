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
    log("Starting Robust Tarball Deployment (v5.4.0)...");

    // 0.5 Validate Syntax
    log("Step 0.5: Validating server-side syntax...");
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

    // 1. Local Build
    log("Step 1: Building locally...");
    execSync('powershell -ExecutionPolicy Bypass -Command "npm run build"', { stdio: 'inherit' });
    log("Local build succeeded.");

    autoUpdateReleaseHistory();

    // 1.2 Local Compression
    log("Step 1.2: Creating deployment tarball...");
    const assets = [
        "dist", 
        "src", 
        "ai-service",
        "platform", 
        "prisma", 
        "scripts", 
        "lib",
        "public",
        "server.cjs", 
        "analyzer.cjs", 
        "ppp_filter.cjs",
        "ppp_gemini_scanner.cjs",
        "ppp_scheduler.cjs",
        "sync_scheduler.cjs",
        "telegramBot.cjs",
        "scoringEngine.cjs",
        "package.json", 
        "package-lock.json",
        "RELEASE.md"
    ];
    // Use tar.exe for Windows compatibility with excludes for Python env
    execSync(`tar -czf mp-deploy.tar.gz --exclude="*/venv" --exclude="*/__pycache__" ${assets.join(' ')}`, { stdio: 'inherit' });
    log("Deployment tarball created (mp-deploy.tar.gz).");

    log("Step 1.5: Halting remote services and aggressive cleanup...");
    const fixPermCmd = `ssh -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no ${CONFIG.USER}@${CONFIG.IP} "sudo pm2 stop all || true; sudo chattr -R -i ${CONFIG.REMOTE_DIR} || true; sudo rm -rf ${CONFIG.REMOTE_DIR}dist ${CONFIG.REMOTE_DIR}src ${CONFIG.REMOTE_DIR}scripts; mkdir -p ${CONFIG.REMOTE_DIR}dist/assets ${CONFIG.REMOTE_DIR}scripts ${CONFIG.REMOTE_DIR}src; sudo chown -R ${CONFIG.USER}:${CONFIG.USER} ${CONFIG.REMOTE_DIR}"`;
    execSync(fixPermCmd, { stdio: 'inherit' });

    log("Step 2: Uploading tarball to /tmp/...");
    const scpCmd = `scp -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no mp-deploy.tar.gz ${CONFIG.USER}@${CONFIG.IP}:/tmp/mp-deploy.tar.gz`;
    execSync(scpCmd, { stdio: 'inherit' });
    log("Tarball uploaded to /tmp/ successfully.");

    // 3. Remote Commands (Extract + Chmod + PM2 Reload)
    log("Step 3: Extracting tarball with sudo and reloading services...");
    const remoteCommands = [
        `sudo tar -xzf /tmp/mp-deploy.tar.gz -C ${CONFIG.REMOTE_DIR}`,
        `sudo rm -f /tmp/mp-deploy.tar.gz`,
        `sudo chown -R ${CONFIG.USER}:${CONFIG.USER} ${CONFIG.REMOTE_DIR}`,
        `cd ${CONFIG.REMOTE_DIR}`,
        `chmod -R 755 dist`,
        `npx prisma generate`,
        `npx prisma db push --accept-data-loss`,
        `pm2 reload ${CONFIG.PM2_NAME} --update-env || pm2 start server.cjs --name ${CONFIG.PM2_NAME}`,
        `pm2 reload mp-stock-ai-api --update-env || pm2 start "python3 -m uvicorn main:app --host 0.0.0.0 --port 8000" --name mp-stock-ai-api --cwd ${CONFIG.REMOTE_DIR}ai-service`,
        `sudo rm -rf ${CONFIG.NGINX_ROOT}`,
        `sudo cp -r dist ${CONFIG.NGINX_ROOT}`,
        `sudo chown -R www-data:www-data ${CONFIG.NGINX_ROOT}`
    ].join(' && ');

    const sshCmd = `ssh -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no ${CONFIG.USER}@${CONFIG.IP} "${remoteCommands}"`;
    execSync(sshCmd, { stdio: 'inherit' });
    log("Remote extraction and reload complete.");

    // 4. Verification
    log("Step 4: Performing Remote Health Check...");
    const healthCheckCmd = `ssh -i "${CONFIG.KEY_PATH}" -o StrictHostKeyChecking=no ${CONFIG.USER}@${CONFIG.IP} "curl -s -o /dev/null -w '%{http_code}' https://mpstock.co.kr/"`;
    const httpCode = execSync(healthCheckCmd).toString().trim();
    
    if (httpCode === '200') {
        log(`\x1b[32m✔ Health Check Passed (HTTP ${httpCode})\x1b[0m`);
        log("\x1b[32m✔ DEPLOYMENT SUCCESSFUL!\x1b[0m");
        // Cleanup local tarball
        if (fs.existsSync('mp-deploy.tar.gz')) fs.unlinkSync('mp-deploy.tar.gz');
    } else {
        error(`Health Check Failed! Server returned HTTP ${httpCode}.`);
    }

} catch (err) {
    error(`Deployment failed: ${err.message}`);
}
