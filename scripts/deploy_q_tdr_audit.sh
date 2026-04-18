#!/bin/bash
cd ~/mp-stock-discovery
echo "--- [Q4 TDR AUDIT] START ---"

# Find tdrGate.cjs
TDR_PATH=$(find . -name "tdrGate.cjs" -not -path "*/node_modules/*")
echo "TDR Path: $TDR_PATH"

if [ -n "$TDR_PATH" ]; then
    echo "[TDR-1] tdrGate.cjs ENV references"
    grep -nE "process.env|TDR|SECRET|hmac|token" "$TDR_PATH" | head -20
else
    echo "tdrGate.cjs NOT FOUND"
fi
echo ""

echo "[TDR-2] server.cjs tdrGate usage"
grep -nE "tdrGate|require.*tdr" server.cjs | head -10
echo "--- [Q4 TDR AUDIT] END ---"
