@echo off
title AutomatiQA Local Recording Agent
echo =================================================================
echo       AutomatiQA Local Web Recording Agent v1.0.0 (Windows)
echo =================================================================
echo.
echo Starting local agent on port 9333 (WS & HTTP)...
echo Keep this window open while recording in AutomatiQA.
echo Press Ctrl+C to stop.
echo.
if exist "%~dp0automatiqa-agent-win-v1.0.exe" (
  "%~dp0automatiqa-agent-win-v1.0.exe"
) else (
  node "%~dp0automatiqa-agent.cjs"
)
pause
