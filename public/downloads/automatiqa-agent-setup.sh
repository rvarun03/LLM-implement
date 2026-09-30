#!/usr/bin/env bash
# AutomatiQA Local Web Recording Agent Setup & Runner for Linux
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "================================================================="
echo "       AutomatiQA Local Web Recording Agent (Linux)"
echo "================================================================="
echo ""
echo "[*] Initializing local recording bridge on port 9333 (WS & HTTP)..."

# Step 1: Ensure executable permissions if binary exists
if [ -f "./automatiqa-agent-linux" ]; then
    chmod +x ./automatiqa-agent-linux 2>/dev/null
fi

# Step 2: Try running precompiled standalone binary
if [ -f "./automatiqa-agent-linux" ]; then
    echo "[*] Starting standalone agent binary (embedded runtime)..."
    echo "[*] Listening on ws://localhost:9333 & http://localhost:9333"
    echo "Keep this terminal open while recording in AutomatiQA."
    echo "Press Ctrl+C to quit."
    echo ""
    ./automatiqa-agent-linux "$@"
    exit $?
fi

# Step 3: Fallback to Node.js runner if binary is absent or failed
if command -v node >/dev/null 2>&1; then
    echo "[*] Node.js $(node -v) detected."
    if [ -f "./automatiqa-agent.cjs" ]; then
        echo "[*] Starting automatiqa-agent.cjs..."
        exec node ./automatiqa-agent.cjs "$@"
    elif [ -f "./automatiqa-agent.js" ]; then
        echo "[*] Starting automatiqa-agent.js..."
        exec node ./automatiqa-agent.js "$@"
    fi
fi

# Step 4: If neither binary nor script is found, download directly
echo "[*] Standalone binary not found locally. Attempting to download..."
SERVER_URL="${SERVER_URL:-https://ais-dev-a264xqdgvvgpacz6owzfmf-328612573607.asia-east1.run.app}"

if command -v curl >/dev/null 2>&1; then
    curl -fsSL "${SERVER_URL}/api/download-agent?os=linux&format=binary" -o ./automatiqa-agent-linux || true
elif command -v wget >/dev/null 2>&1; then
    wget -qO ./automatiqa-agent-linux "${SERVER_URL}/api/download-agent?os=linux&format=binary" || true
fi

if [ -f "./automatiqa-agent-linux" ] && [ -s "./automatiqa-agent-linux" ]; then
    chmod +x ./automatiqa-agent-linux
    echo "[✓] Downloaded automatiqa-agent-linux successfully."
    exec ./automatiqa-agent-linux "$@"
fi

echo "[!] Error: Neither the standalone agent binary nor Node.js could be executed."
echo "    Please install Node.js 18+ ('sudo apt install nodejs' or 'sudo dnf install nodejs')"
echo "    or download the full Linux ZIP bundle from the AutomatiQA dashboard."
exit 1
