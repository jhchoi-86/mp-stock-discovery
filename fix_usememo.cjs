const fs = require('fs');
const filePath = '/home/ubuntu/mp-stock-discovery/src/components/MPStockDailyReport.jsx';
let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes("import React, { useMemo } from 'react'")) {
    content = "import React, { useMemo } from 'react';\n" + content;
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('[Fix] MPStockDailyReport.jsx patched with useMemo import.');
} else {
    console.log('[Skip] MPStockDailyReport.jsx already has useMemo import.');
}
