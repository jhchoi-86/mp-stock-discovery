const fs = require('fs');
const filePath = '/home/ubuntu/mp-stock-discovery/src/components/MPStockDailyReport.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Lucide imports if missing
if (!content.includes("from 'lucide-react'")) {
    content = "import { LayoutGrid, Flame, CheckCircle } from 'lucide-react';\n" + content;
} else if (!content.includes("LayoutGrid")) {
    content = content.replace("import {", "import { LayoutGrid, Flame, CheckCircle,");
}

// 2. Ensure comprehensive React import (Double check)
if (!content.includes("useState, useEffect, useMemo")) {
    content = content.replace(/import React, \{.*\} from 'react'/, "import React, { useState, useEffect, useMemo } from 'react'");
    content = content.replace(/import { useState, useEffect, useMemo } from 'react'/, "import React, { useState, useEffect, useMemo } from 'react'");
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('[Fix] MPStockDailyReport.jsx patched with missing icons and hooks.');
