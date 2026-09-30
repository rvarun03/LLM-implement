const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function buildZips() {
  const downloadsDir = path.join(__dirname, '..', 'public', 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }

  const sourceCjs = path.join(__dirname, '..', 'automatiqa-agent.cjs');
  const destCjs = path.join(downloadsDir, 'automatiqa-agent.cjs');
  if (fs.existsSync(sourceCjs)) {
    fs.copyFileSync(sourceCjs, destCjs);
  }

  const winExePath = path.join(downloadsDir, 'automatiqa-agent-win-v1.0.exe');
  const linuxBinPath = path.join(downloadsDir, 'automatiqa-agent-linux');
  const macBinPath = path.join(downloadsDir, 'automatiqa-agent-mac-v1.0');

  // Extract TLS Certificate to package alongside agent
  const agentContent = fs.existsSync(sourceCjs) ? fs.readFileSync(sourceCjs, 'utf8') : '';
  const certMatch = agentContent.match(/const TLS_CERT = `([\s\S]*?)`;/);
  const certText = certMatch ? certMatch[1].trim() : '';

  const winInstallCertBat = `@echo off
title AutomatiQA Certificate Setup
echo =================================================================
echo        AutomatiQA Local Agent Certificate Trust Setup
echo =================================================================
echo.
echo Installing AutomatiQA Certificate into CurrentUser Trusted Root Store...
certutil -addstore -user "Root" "%~dp0automatiqa-ca.crt"
if %ERRORLEVEL% equ 0 (
  echo.
  echo [SUCCESS] Certificate installed and trusted!
  echo You can now connect securely over wss://localhost:9334 with zero SSL warnings.
) else (
  echo.
  echo [NOTE] Automatic certutil installation returned code %ERRORLEVEL%.
  echo You can also authorize SSL by visiting https://localhost:9334/status in Chrome.
)
echo.
pause
`;

  const unixInstallCertSh = `#!/usr/bin/env bash
echo "================================================================="
echo "       AutomatiQA Local Agent Certificate Trust Setup"
echo "================================================================="
echo ""
CERT_FILE="$(dirname "$0")/automatiqa-ca.crt"
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "Installing certificate into macOS user keychain..."
  security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain "$CERT_FILE" 2>/dev/null && echo "[SUCCESS] Certificate trusted on macOS!" || echo "Note: Visit https://localhost:9334/status in Chrome to authorize directly."
elif command -v trust &>/dev/null; then
  trust anchor --store "$CERT_FILE" 2>/dev/null && echo "[SUCCESS] Certificate trusted via trust anchor!" || echo "Note: Visit https://localhost:9334/status in Chrome to authorize directly."
else
  echo "Please visit https://localhost:9334/status in Chrome to authorize directly."
fi
echo ""
`;

  // 1. Build Windows ZIP
  console.log('1. Building Windows ZIP bundle...');
  const winZip = new JSZip();

  if (certText) {
    winZip.file('automatiqa-ca.crt', certText);
    winZip.file('install-cert.bat', winInstallCertBat);
  }

  if (fs.existsSync(winExePath)) {
    winZip.file('automatiqa-agent-win-v1.0.exe', fs.readFileSync(winExePath));
  }

  const winBat = `@echo off
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
`;
  winZip.file('start-agent.bat', winBat);

  const winReadme = `AutomatiQA Local Web Recording Agent (Windows)
==============================================

QUICK START INSTRUCTIONS:
1. Double-click "start-agent.bat" or "automatiqa-agent-win-v1.0.exe".
2. If Windows SmartScreen displays "Windows protected your PC":
   -> Click "More info"
   -> Click "Run anyway"
3. The agent will start listening on ws://localhost:9333 (and http://localhost:9333).
4. A log file "automatiqa-agent.log" is automatically saved in this folder.
5. Return to your AutomatiQA Web Performance page:
   You will see "Agent detected" with a green checkmark!
6. Enter your Target URL and click "Start Record".
   Chromium will launch to record your network traffic and user interactions.

TROUBLESHOOTING:
- Port 9333 busy: Close any other running AutomatiQA agents or check Task Manager.
- Check "automatiqa-agent.log" in this directory for detailed error diagnostics.
- For assistance, contact support at vinuta@qaoncloud.com
`;
  winZip.file('README.txt', winReadme);

  if (fs.existsSync(destCjs)) {
    winZip.file('automatiqa-agent.cjs', fs.readFileSync(destCjs));
  }

  const winZipBuffer = await winZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 4 }
  });
  fs.writeFileSync(path.join(downloadsDir, 'automatiqa-agent-win-v1.0.zip'), winZipBuffer);
  console.log(`Created automatiqa-agent-win-v1.0.zip (${(winZipBuffer.length / (1024 * 1024)).toFixed(1)} MB)`);

  // 2. Build Linux ZIP
  console.log('2. Building Linux ZIP bundle...');
  const linuxZip = new JSZip();

  if (certText) {
    linuxZip.file('automatiqa-ca.crt', certText);
    linuxZip.file('install-cert.sh', unixInstallCertSh, { unixPermissions: '755' });
  }

  if (fs.existsSync(linuxBinPath)) {
    linuxZip.file('automatiqa-agent-linux', fs.readFileSync(linuxBinPath), { unixPermissions: '755' });
  }

  const linuxSh = `#!/usr/bin/env bash
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
`;
  linuxZip.file('start-agent.sh', linuxSh, { unixPermissions: '755' });

  const linuxReadme = `AutomatiQA Local Web Recording Agent (Linux x64)
================================================

QUICK START INSTRUCTIONS:
1. Make the binary executable and run:
   chmod +x automatiqa-agent-linux
   ./automatiqa-agent-linux
   
   Or run the shell script:
   bash start-agent.sh

2. Return to AutomatiQA Web Performance -> Record & Capture.
   You will see "Agent detected" with a green checkmark!

TROUBLESHOOTING & SYSTEM DEPENDENCIES:
If the browser fails to launch, run:
sudo apt install libnss3 libatk1.0-0 libgbm1 (Ubuntu/Debian)

A log file "automatiqa-agent.log" is recorded in this folder for diagnosis.
`;
  linuxZip.file('README.txt', linuxReadme);

  if (fs.existsSync(destCjs)) {
    linuxZip.file('automatiqa-agent.cjs', fs.readFileSync(destCjs));
  }

  const linuxZipBuffer = await linuxZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 4 }
  });
  fs.writeFileSync(path.join(downloadsDir, 'automatiqa-agent-linux-v1.0.zip'), linuxZipBuffer);
  console.log(`Created automatiqa-agent-linux-v1.0.zip (${(linuxZipBuffer.length / (1024 * 1024)).toFixed(1)} MB)`);

  // 3. Build Mac ZIP
  console.log('3. Building macOS ZIP bundle...');
  const macZip = new JSZip();

  if (certText) {
    macZip.file('automatiqa-ca.crt', certText);
    macZip.file('install-cert.sh', unixInstallCertSh, { unixPermissions: '755' });
  }

  if (fs.existsSync(macBinPath)) {
    macZip.file('automatiqa-agent-mac-v1.0', fs.readFileSync(macBinPath), { unixPermissions: '755' });
  }

  const macCommand = `#!/bin/bash
cd "$(dirname "$0")"
chmod +x ./automatiqa-agent-mac-v1.0 2>/dev/null
echo "================================================================="
echo "       AutomatiQA Local Web Recording Agent v1.0.0 (macOS)"
echo "================================================================="
echo ""
echo "Starting local agent on port 9333 (WS & HTTP)..."
echo "Keep this Terminal window open while recording in AutomatiQA."
echo "Press Ctrl+C to quit."
echo ""
if [ -f "./automatiqa-agent-mac-v1.0" ]; then
  ./automatiqa-agent-mac-v1.0
elif [ -f "./automatiqa-agent.cjs" ]; then
  node ./automatiqa-agent.cjs
fi
`;
  macZip.file('start-agent.command', macCommand, { unixPermissions: '755' });

  const macReadme = `AutomatiQA Local Web Recording Agent (macOS)
============================================

QUICK START INSTRUCTIONS:
1. Double-click "start-agent.command" or run in Terminal:
   chmod +x ./automatiqa-agent-mac-v1.0
   ./automatiqa-agent-mac-v1.0

2. If macOS Gatekeeper prevents opening ("unidentified developer"):
   Method A:
   - In Finder, Right-click (or Control-click) "automatiqa-agent-mac-v1.0"
   - Click "Open" from the context menu
   - In the confirmation dialog, click "Open"
   
   Method B (Terminal):
   - Open Terminal in this folder and run:
     xattr -d com.apple.quarantine automatiqa-agent-mac-v1.0
     ./automatiqa-agent-mac-v1.0

3. Keep the agent running in the background.
4. Return to AutomatiQA Web Performance -> Record & Capture tab.
   You will see "Agent detected" and can click "Start Record"!
`;
  macZip.file('README.txt', macReadme);
  if (fs.existsSync(destCjs)) {
    macZip.file('automatiqa-agent.cjs', fs.readFileSync(destCjs));
  }

  const macZipBuffer = await macZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 4 }
  });
  fs.writeFileSync(path.join(downloadsDir, 'automatiqa-agent-mac-v1.0.zip'), macZipBuffer);
  console.log(`Created automatiqa-agent-mac-v1.0.zip (${(macZipBuffer.length / (1024 * 1024)).toFixed(1)} MB)`);

  // 4. Build Web Performance Bridge Chrome Extension ZIP
  console.log('4. Building Web Performance Bridge Extension ZIP bundle...');
  const extDir = path.join(__dirname, '..', 'extension-web-perf-bridge');
  if (fs.existsSync(extDir)) {
    const extZip = new JSZip();
    const extFiles = fs.readdirSync(extDir);
    for (const f of extFiles) {
      const fullPath = path.join(extDir, f);
      if (fs.statSync(fullPath).isFile()) {
        extZip.file(f, fs.readFileSync(fullPath));
      }
    }
    const extZipBuffer = await extZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 4 }
    });
    fs.writeFileSync(path.join(downloadsDir, 'automatiqa-web-perf-bridge.zip'), extZipBuffer);
    console.log(`Created automatiqa-web-perf-bridge.zip (${(extZipBuffer.length / 1024).toFixed(1)} KB)`);
  }

  // Sync all download artifacts to dist/downloads if dist exists
  const distDownloadsDir = path.join(__dirname, '..', 'dist', 'downloads');
  if (!fs.existsSync(distDownloadsDir)) {
    fs.mkdirSync(distDownloadsDir, { recursive: true });
  }
  const files = fs.readdirSync(downloadsDir);
  for (const f of files) {
    fs.copyFileSync(path.join(downloadsDir, f), path.join(distDownloadsDir, f));
  }
  console.log(`Synced ${files.length} download files to dist/downloads/`);

  console.log('Packaging complete!');
}

buildZips().catch(console.error);
