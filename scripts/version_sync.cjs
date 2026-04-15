const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Version Sync Utility (v1.1.0)
 * -----------------------------
 * Updates RELEASE.md with a new header, including Git Revision, when package.json version changes.
 */

function getGitRevision() {
    try {
        return execSync('git rev-parse --short HEAD').toString().trim();
    } catch (e) {
        return 'unknown';
    }
}

function syncVersion() {
    const pkgPath = path.join(__dirname, '../package.json');
    const releasePath = path.join(__dirname, '../RELEASE.md');

    if (!fs.existsSync(pkgPath)) {
        console.error('[Error] package.json not found');
        return;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const version = pkg.version;
    const revision = getGitRevision();
    const now = new Date().toISOString().split('T')[0];

    if (!fs.existsSync(releasePath)) {
        console.log('[Info] RELEASE.md not found. Creating new one...');
        fs.writeFileSync(releasePath, `# MP-STOCK Release Notes\n\n## [v${version}] (${revision}) - ${now}\n- Automated Release\n`);
        return;
    }

    let content = fs.readFileSync(releasePath, 'utf8');

    // Check if version header already exists
    if (!content.includes(`## [v${version}]`)) {
        console.log(`[Sync] Adding new version header for v${version} (${revision})...`);
        
        const newEntry = `## [v${version}] (${revision}) - ${now}
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 배포 파이프라인 하드닝 및 권한 자동화 적용
- [NEW] 리비전 (${revision}) 자동 동기화 및 Nginx 배포 자동화
- [SYS] PM2 Python 인터프리터 설정 최적화 (interpreter: none)

---

`;
        // Insert at the beginning (after the main title if exists)
        if (content.startsWith('# ')) {
            const lines = content.split('\n');
            const titleLineIndex = lines.findIndex(l => l.startsWith('# '));
            lines.splice(titleLineIndex + 1, 0, '\n' + newEntry);
            content = lines.join('\n');
        } else {
            content = newEntry + content;
        }

        fs.writeFileSync(releasePath, content);
        console.log(`[Success] RELEASE.md updated to v${version} (${revision})`);
    } else {
        console.log(`[Skip] RELEASE.md already contains v${version}`);
    }
}

syncVersion();
