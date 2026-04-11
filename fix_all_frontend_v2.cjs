const fs = require('fs');
const path = require('path');

const baseDir = '/home/ubuntu/mp-stock-discovery/src/components';

// 1. Fix MPStockDailyReport.jsx (Missing imports)
const reportPath = path.join(baseDir, 'MPStockDailyReport.jsx');
if (fs.existsSync(reportPath)) {
    let content = fs.readFileSync(reportPath, 'utf8');
    // Ensure comprehensive React import
    if (content.includes("import React, { useMemo } from 'react'")) {
        content = content.replace("import React, { useMemo } from 'react'", "import React, { useState, useEffect, useMemo } from 'react'");
    } else if (!content.includes("import React") && !content.includes("import { useState")) {
        content = "import React, { useState, useEffect, useMemo } from 'react';\n" + content;
    }
    fs.writeFileSync(reportPath, content, 'utf8');
    console.log('[Fix] MPStockDailyReport.jsx imports updated.');
}

// 2. Fix MobileDashboard.jsx (Unsafe .length access)
const mobilePath = path.join(baseDir, 'MobileDashboard.jsx');
if (fs.existsSync(mobilePath)) {
    let content = fs.readFileSync(mobilePath, 'utf8');
    // fallbackCount={signals.length} -> signals?.length || 0
    content = content.replace(/fallbackCount=\{signals\.length\}/g, 'fallbackCount={signals?.length || 0}');
    fs.writeFileSync(mobilePath, content, 'utf8');
    console.log('[Fix] MobileDashboard.jsx safe navigation added.');
}

// 3. Fix SignalBoard.jsx (Ensure todayStr and imports)
const signalPath = path.join(baseDir, 'SignalBoard.jsx');
if (fs.existsSync(signalPath)) {
    let content = fs.readFileSync(signalPath, 'utf8');
    if (!content.includes('const todayStr =')) {
        content = content.replace('const SignalBoard = () => {', 'const SignalBoard = () => {\n    const todayStr = new Date().toISOString().split(\'T\')[0];');
    }
    fs.writeFileSync(signalPath, content, 'utf8');
    console.log('[Fix] SignalBoard.jsx todayStr ensured.');
}
