const fs = require('fs');
const path = require('path');

/**
 * Version Sync Utility (v1.0.0)
 * -----------------------------
 * Updates RELEASE.md with a new header when package.json version changes.
 */

function syncVersion() {
    const pkgPath = path.join(__dirname, '../package.json');
    const releasePath = path.join(__dirname, '../RELEASE.md');

    if (!fs.existsSync(pkgPath)) {
        console.error('[Error] package.json not found');
        return;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const version = pkg.version;
    const now = new Date().toISOString().split('T')[0];

    if (!fs.existsSync(releasePath)) {
        console.log('[Info] RELEASE.md not found. Creating new one...');
        fs.writeFileSync(releasePath, `# MP-STOCK Release Notes\n\n## [v${version}] - ${now}\n- Automated Release\n`);
        return;
    }

    let content = fs.readFileSync(releasePath, 'utf8');

    // Check if version header already exists
    if (!content.includes(`## [v${version}]`)) {
        console.log(`[Sync] Adding new version header for v${version}...`);
        
        const newEntry = `## [v${version}] - ${now}
### 🚩 상태: 자동화 배포 완료 (Automated Release)
### 🛠 주요 변경 사항
- [FIX] 시스템 안정성 강화 및 모니터링 로직 패치
- [NEW] 배포 프로세스 리비전 자동 업데이트 적용

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
        console.log(`[Success] RELEASE.md updated to v${version}`);
    } else {
        console.log(`[Skip] RELEASE.md already contains v${version}`);
    }
}

syncVersion();
