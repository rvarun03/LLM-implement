#!/usr/bin/env bash
cd "$(dirname "$0")"
chmod +x ./automatiqa-agent-linux 2>/dev/null
echo "================================================================="
echo "       AutomatiQA Local Web Recording Agent v1.0.0 (Linux)"
echo "================================================================="
echo ""
echo "Starting local agent on port 9333 (WS & HTTP)..."
echo "Keep this Terminal window open while recording in AutomatiQA."
echo "Press Ctrl+C to quit."
echo ""
if [ -f "./automatiqa-agent-linux" ]; then
  ./automatiqa-agent-linux
elif [ -f "./automatiqa-agent.cjs" ]; then
  node ./automatiqa-agent.cjs
fi
