#!/usr/bin/env node
/**
 * AutomatiQA Local Web Recording Agent
 * ====================================
 * A standalone desktop companion for AutomatiQA Web Performance Testing.
 * 
 * Features:
 * - Listens locally on port 9333 (ws:// & http://) and port 9334 (wss://) for web app commands
 * - Launches visible Chromium via Playwright on user screen
 * - Real-time network request/response capture with latency calculation
 * - Page navigation tracking (page.on('framenavigated'))
 * - DOM click and submit action capture correlated with network activity
 * - Real-time streaming to connected AutomatiQA web clients
 * - 45-minute inactivity safety timeout
 * - Secure localhost-only binding
 * - Version reporting and multi-session support
 */

const http = require('http');
const https = require('https');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const child_process = require('child_process');

const AGENT_VERSION = '1.0.0';
const DEFAULT_HTTP_PORT = parseInt(process.env.AGENT_PORT, 10) || 9333;
const DEFAULT_HTTPS_PORT = parseInt(process.env.AGENT_HTTPS_PORT, 10) || 9334;

// -----------------------------------------------------------------------------
// Logging system: Writes to automatiqa-agent.log on every run
// -----------------------------------------------------------------------------
function getLogFilePath() {
  const preferredDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
  try {
    const testFile = path.join(preferredDir, `.automatiqa-test-${Date.now()}`);
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return path.join(preferredDir, 'automatiqa-agent.log');
  } catch (e) {
    let fallbackDir = os.tmpdir();
    if (process.platform === 'win32' && process.env.APPDATA) {
      fallbackDir = path.join(process.env.APPDATA, 'AutomatiQA');
    } else if (os.homedir()) {
      fallbackDir = path.join(os.homedir(), '.automatiqa');
    }
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
      return path.join(fallbackDir, 'automatiqa-agent.log');
    } catch (e2) {
      return path.join(os.tmpdir(), 'automatiqa-agent.log');
    }
  }
}

const LOG_FILE = getLogFilePath();

function writeLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const text = args.map(arg => {
    if (arg instanceof Error) return `${arg.message}\n${arg.stack || ''}`;
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg); } catch (_) { return String(arg); }
    }
    return String(arg);
  }).join(' ');
  const line = `[${timestamp}] [${level.toUpperCase()}] ${text}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) {}
}

const origLog = console.log;
const origInfo = console.info;
const origWarn = console.warn;
const origError = console.error;

console.log = function (...args) {
  writeLog('INFO', ...args);
  origLog.apply(console, args);
};
console.info = function (...args) {
  writeLog('INFO', ...args);
  origInfo.apply(console, args);
};
console.warn = function (...args) {
  writeLog('WARN', ...args);
  origWarn.apply(console, args);
};
console.error = function (...args) {
  writeLog('ERROR', ...args);
  origError.apply(console, args);
};

// -----------------------------------------------------------------------------
// Native Error Dialog & Failure Visibility
// -----------------------------------------------------------------------------
function showNativeDialog(title, message, isError = true) {
  writeLog(isError ? 'ERROR' : 'INFO', `[NATIVE DIALOG: ${title}] ${message}`);

  try {
    if (process.platform === 'win32') {
      const safeTitle = title.replace(/'/g, "''");
      const safeMsg = message.replace(/'/g, "''").replace(/\r?\n/g, '`n');
      const icon = isError
        ? '[System.Windows.Forms.MessageBoxIcon]::Error'
        : '[System.Windows.Forms.MessageBoxIcon]::Information';
      const psCommand = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${safeMsg}', '${safeTitle}', [System.Windows.Forms.MessageBoxButtons]::OK, ${icon});`;
      child_process.spawnSync('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psCommand], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 15000
      });
      return;
    }

    if (process.platform === 'darwin') {
      const safeTitle = title.replace(/"/g, '\\"');
      const safeMsg = message.replace(/"/g, '\\"');
      const icon = isError ? 'stop' : 'note';
      const script = `display dialog "${safeMsg}" with title "${safeTitle}" buttons {"OK"} default button "OK" with icon ${icon}`;
      child_process.spawnSync('osascript', ['-e', script], {
        stdio: 'ignore',
        timeout: 15000
      });
      return;
    }

    if (process.platform === 'linux') {
      const flag = isError ? '--error' : '--info';
      const res = child_process.spawnSync('zenity', [flag, `--title=${title}`, `--text=${message}`], {
        stdio: 'ignore',
        timeout: 10000
      });
      if (res.error) {
        child_process.spawnSync('kdialog', ['--title', title, isError ? '--error' : '--msgbox', message], {
          stdio: 'ignore',
          timeout: 10000
        });
      }
    }
  } catch (_) {}
}

function fatalExit(exitCode, message) {
  console.error(`\n[Agent Fatal Error] ${message}\n`);
  showNativeDialog('AutomatiQA Local Agent', message, true);

  if (process.platform === 'win32') {
    console.log('\n================================================================');
    console.log('AutomatiQA Agent failed to start or encountered an error.');
    console.log(`Log file saved to: ${LOG_FILE}`);
    console.log('Press any key or Enter to close this window...');
    console.log('================================================================\n');
    try {
      child_process.spawnSync('cmd.exe', ['/c', 'pause'], { stdio: 'inherit' });
    } catch (_) {}
  }
  process.exit(exitCode);
}

process.on('uncaughtException', (err) => {
  console.error('[Agent] Uncaught Exception:', err);
  fatalExit(1, `Unexpected Error:\n\n${err.message || err}\n\nDetailed logs saved at:\n${LOG_FILE}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Agent] Unhandled Rejection:', reason);
  writeLog('ERROR', 'Unhandled Rejection:', reason);
});

// Embedded self-signed TLS certificates for local HTTPS / WSS mixed-content compliance
const TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDuTCCAqGgAwIBAgIUM6nvv1uZ5LMZXSWnU/jNax1ndBMwDQYJKoZIhvcNAQEL
BQAwPjESMBAGA1UEAwwJbG9jYWxob3N0MRMwEQYDVQQKDApBdXRvbWF0aVFBMRMw
EQYDVQQLDApMb2NhbEFnZW50MB4XDTI2MDkxMDE1MzMwNFoXDTQ2MDkwNTE1MzMw
NFowPjESMBAGA1UEAwwJbG9jYWxob3N0MRMwEQYDVQQKDApBdXRvbWF0aVFBMRMw
EQYDVQQLDApMb2NhbEFnZW50MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
AQEA3ZAwR6s3St6IV/fapjIQFSACMbRbATM/6RhFhlT9bunEwVHQeSjWHqPYYV9r
/txfitidjsgVWvU1cHXb9UUq/qzeqzSNnqttdTR/vijpqBw5vjFg0sUvcqN4tC1I
GywEBMIInjuXQoU+wrsH/6TzakA22ZSxoswe970dSRjECRc7VdiU5U/PwTGsA4/9
2dPMj69iPamzJHyQ7vQwmQkJ07t4kTDEBka5Dbss91dCxhYKF8CsxRxwYFupc2tD
q6IZBWl4wFaAum+JZZbs9ZutU8LT3/FQzEqw0TBqm9kz17jsui4j0SuZR9A/XSRe
jkCI9mCG1jlymlr8Cw7gWBFSXQIDAQABo4GuMIGrMB0GA1UdDgQWBBQmxIq5cxCN
pO9f3EcKJJc4LAIsyzAfBgNVHSMEGDAWgBQmxIq5cxCNpO9f3EcKJJc4LAIsyzAs
BgNVHREEJTAjgglsb2NhbGhvc3SHBH8AAAGHEAAAAAAAAAAAAAAAAAAAAAEwHQYD
VR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUFBwMCMAsGA1UdDwQEAwICpDAPBgNVHRMB
Af8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQBD2OpGB+/xH25gPeOpnXYxOWKl
PlVAAfpz5oX2lon/wqgLoNg5h9F8UQsGHrpVzQdEiHh7tfgl+Sh6ITCkXkExwDGT
pQHJ27L5aGb+tByehNpHahfGoq3zIUBq27GuQIk1A0G6xK9n+yY8jEv737Dn/Ogb
Y1IlHEz2GMxehh4Tdf5VEGgjlCDjEh5pY1K4yDVLtKrgF0K/zTEInZhMuRRbnFs1
MgePsK891IJuZgEr0vG1etdU8Jdxv2VPZzpWX2ezA+cuuKc79p4Yzb8dK7h1WTbf
fg25mr8HRcW07uphTnIHcU/cnZKTZ59jucz2qaHgOepj9tPAiWytgc5kfYYX
-----END CERTIFICATE-----`;

const TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDdkDBHqzdK3ohX
99qmMhAVIAIxtFsBMz/pGEWGVP1u6cTBUdB5KNYeo9hhX2v+3F+K2J2OyBVa9TVw
ddv1RSr+rN6rNI2eq211NH++KOmoHDm+MWDSxS9yo3i0LUgbLAQEwgieO5dChT7C
uwf/pPNqQDbZlLGizB73vR1JGMQJFztVdiU5U/PwTGsA4/92dPMj69iPamzJHyQ
7vQwmQkJ07t4kTDEBka5Dbss91dCxhYKF8CsxRxwYFupc2tDq6IZBWl4wFaAum+J
ZZbs9ZutU8LT3/FQzEqw0TBqm9kz17jsui4j0SuZR9A/XSRejkCI9mCG1jlymlr8
Cw7gWBFSXQIDAQABo4GuMIGrMB0GA1UdDgQWBBQmxIq5cxCNpO9f3EcKJJc4LAIs
yzAfBgNVHSMEGDAWgBQmxIq5cxCNpO9f3EcKJJc4LAIsyzAsBgNVHREEJTAjggls
b2NhbGhvc3SHBH8AAAGHEAAAAAAAAAAAAAAAAAAAAAEwHQYDVR0lBBYwFAYIKwYB
BQUHAwEGCCsGAQUFBwMCMAsGA1UdDwQEAwICpDAPBgNVHRMBAf8EBTADAQH/MA0G
CSqGSIb3DQEBCwUAA4IBAQBD2OpGB+/xH25gPeOpnXYxOWKlPlVAAfpz5oX2lon/
wqgLoNg5h9F8UQsGHrpVzQdEiHh7tfgl+Sh6ITCkXkExwDGTpQHJ27L5aGb+tBye
hNpHahfGoq3zIUBq27GuQIk1A0G6xK9n+yY8jEv737Dn/OgbY1IlHEz2GMxehh4T
df5VEGgjlCDjEh5pY1K4yDVLtKrgF0K/zTEInZhMuRRbnFs1MgePsK891IJuZgEr
0vG1etdU8Jdxv2VPZzpWX2ezA+cuuKc79p4Yzb8dK7h1WTbffg25mr8HRcW07uph
TnIHcU/cnZKTZ59jucz2qaHgOepj9tPAiWytgc5kfYYX
-----END PRIVATE KEY-----`;

// Playwright loader with fallback detection
function getPlaywright() {
  try {
    return require('playwright');
  } catch (e) {
    try {
      return require('playwright-core');
    } catch (e2) {
      console.error('[Agent Error] Playwright is not installed. Please run: npm install playwright');
      return null;
    }
  }
}

// -----------------------------------------------------------------------------
// Playwright Chromium Auto-Install on First Launch
// -----------------------------------------------------------------------------
async function checkAndInstallChromium(pw) {
  if (!pw) return false;

  // 1. Check if standard Playwright Chromium executable is present on disk
  let execPath = null;
  try {
    execPath = pw.chromium.executablePath();
  } catch (_) {}

  if (execPath && fs.existsSync(execPath)) {
    console.log(`[Agent] Verified Playwright Chromium at: ${execPath}`);
    return true;
  }

  // 2. Check if user already has Google Chrome or Microsoft Edge installed
  console.log('[Agent] Checking available system browsers (Chrome / Edge)...');
  try {
    const testB = await pw.chromium.launch({ channel: 'chrome', headless: true });
    await testB.close();
    console.log('[Agent] Detected system Google Chrome installation.');
    return true;
  } catch (_) {
    try {
      const testB = await pw.chromium.launch({ channel: 'msedge', headless: true });
      await testB.close();
      console.log('[Agent] Detected system Microsoft Edge installation.');
      return true;
    } catch (_) {}
  }

  // 3. Neither Playwright Chromium nor system browser is present -> auto-install
  console.log('\n================================================================');
  console.log('[*] Setting up for first use, please wait...');
  console.log('[*] Downloading and installing Chromium browser binary for Playwright...');
  console.log('[*] This requires internet access and typically takes 1-2 minutes.');
  console.log('================================================================\n');

  try {
    // Attempt 1: via npx playwright install chromium
    child_process.execSync('npx playwright install chromium', { stdio: 'inherit', timeout: 300000 });
    console.log('[Agent] Playwright Chromium browser installed successfully!');
    return true;
  } catch (err1) {
    try {
      // Attempt 2: via direct playwright install chromium
      child_process.execSync('playwright install chromium', { stdio: 'inherit', timeout: 300000 });
      console.log('[Agent] Playwright Chromium browser installed successfully!');
      return true;
    } catch (err2) {
      console.error('[Agent Error] Auto-installation of Chromium failed:', err2.message);
      const linuxNote = process.platform === 'linux'
        ? '\n\nTroubleshooting for Linux:\nIf the browser fails to launch, run: sudo apt install libnss3 libatk1.0-0 libgbm1 (Ubuntu/Debian)'
        : '';
      const failMsg = `Playwright Chromium browser is missing and auto-download failed.${linuxNote}\n\nPlease install Google Chrome or run 'npx playwright install chromium' in terminal.\n\nLog file: ${LOG_FILE}`;
      showNativeDialog('AutomatiQA Agent - Browser Missing', failMsg, true);
      return false;
    }
  }
}

// Global Agent State
let activeBrowser = null;
let activeContext = null;
let activePage = null;
let isRecording = false;
let currentSessionId = null;
let currentTargetUrl = '';
let recordingStartTime = 0;
let inactivityTimer = null;
let activeActionId = null;
let activeActionFormData = null;

// Recorded data collections
let capturedRequests = [];
let capturedResponses = [];
let capturedActions = [];
let capturedNavigations = [];
const pendingRequestMap = new Map();

// Active WebSocket client connections
const connectedSockets = new Set();

/**
 * Security: Enforce local-only connections (reject any non-loopback IP)
 */
function isLoopbackAddress(ip) {
  if (!ip) return false;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.endsWith('127.0.0.1') ||
    ip === 'localhost'
  );
}

/**
 * Send JSON message to all connected web app clients
 */
function broadcast(payload) {
  const json = JSON.stringify(payload);
  for (const client of connectedSockets) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(json);
      } catch (err) {
        console.error('[Agent] Broadcast send error:', err.message);
      }
    }
  }
}

/**
 * Send message to specific client
 */
function sendTo(client, payload) {
  if (client && client.readyState === WebSocket.OPEN) {
    try {
      client.send(JSON.stringify(payload));
    } catch (err) {
      console.error('[Agent] Client send error:', err.message);
    }
  }
}

/**
 * HTTP handler for status, health probes, and CORS preflight
 */
function handleHttpRequest(req, res) {
  const remoteIp = req.socket.remoteAddress || '';
  if (!isLoopbackAddress(remoteIp)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden: Localhost connections only');
    return;
  }

  // Permissive CORS for AutomatiQA web app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Download raw SSL certificate
  if (url.pathname === '/cert' || url.pathname === '/cert.pem' || url.pathname === '/automatiqa-ca.crt') {
    res.writeHead(200, {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Disposition': 'attachment; filename="automatiqa-ca.crt"'
    });
    res.end(TLS_CERT);
    return;
  }

  if (url.pathname === '/' || url.pathname === '/status' || url.pathname === '/health') {
    const isHtml = req.headers.accept && req.headers.accept.includes('text/html');

    if (isHtml) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutomatiQA Local Agent — SSL Authorized</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #0b0f19;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #111827;
      border: 1px solid #10b981;
      border-radius: 20px;
      padding: 36px 28px;
      max-width: 500px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid #059669;
      padding: 6px 14px;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 10px 0;
      color: #f8fafc;
    }
    p {
      font-size: 13.5px;
      color: #94a3b8;
      line-height: 1.6;
      margin: 0 0 20px 0;
    }
    .endpoint-box {
      background: #1f2937;
      border-radius: 8px;
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
      color: #38bdf8;
      margin-bottom: 24px;
      word-break: break-all;
    }
    .btn {
      background: #0284c7;
      color: white;
      border: none;
      padding: 11px 22px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #0369a1;
    }
    .live-status {
      margin-top: 18px;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <div class="status-badge"><span>●</span> SSL Connection Authorized</div>
    <h1>AutomatiQA Local Recording Agent</h1>
    <p>
      The secure WSS certificate exception for <code>localhost:9334</code> has been approved in this browser session.
    </p>
    <div class="endpoint-box">
      wss://localhost:9334 &bull; Version ${AGENT_VERSION}
    </div>
    <p style="font-size: 13px; color: #cbd5e1;">
      You can now close this tab and return to <strong>Google AI Studio</strong>. Your Web Performance Bridge extension will connect automatically!
    </p>
    <button class="btn" onclick="window.close()">Close Tab & Return to App</button>
    <div id="wss-indicator" class="live-status">Testing live WSS socket...</div>
  </div>
  <script>
    try {
      const ws = new WebSocket('wss://' + window.location.host);
      ws.onopen = () => {
        document.getElementById('wss-indicator').innerHTML = '<span style="color:#34d399;">✓ Live WSS WebSocket is Connected and Ready</span>';
      };
      ws.onerror = () => {
        document.getElementById('wss-indicator').innerHTML = '<span style="color:#fbbf24;">Note: Please refresh if socket handshake is pending</span>';
      };
    } catch(e) {}
  </script>
</body>
</html>`);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ready',
        version: AGENT_VERSION,
        name: 'AutomatiQA Local Recording Agent',
        isRecording,
        currentSessionId,
        activeTarget: currentTargetUrl,
        uptimeSeconds: Math.floor(process.uptime()),
        stats: {
          requestsCaptured: capturedRequests.length,
          actionsCaptured: capturedActions.length,
          navigationsCaptured: capturedNavigations.length
        }
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

/**
 * Start 45-minute inactivity safety timer
 */
function resetInactivityTimeout() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  // 45 minutes = 45 * 60 * 1000 ms
  inactivityTimer = setTimeout(() => {
    if (isRecording) {
      console.warn('[Agent] 45-minute safety timeout reached without stop_record. Auto-closing browser...');
      stopRecording('45_MINUTE_TIMEOUT');
    }
  }, 45 * 60 * 1000);
}

/**
 * Start Playwright recording session
 */
async function startRecording(config, client) {
  if (isRecording) {
    console.warn('[Agent] Recording already active. Closing previous session before starting new one.');
    await stopRecording('NEW_SESSION_PREEMPT');
  }

  const pw = getPlaywright();
  if (!pw) {
    const errorMsg = 'Playwright library is not available. Please install playwright.';
    broadcast({ type: 'recording_error', error: errorMsg });
    return { success: false, error: errorMsg };
  }

  const targetUrl = config.url || 'https://ecommerce-playground.lambdatest.io';
  currentSessionId = config.sessionId || `rec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  currentTargetUrl = targetUrl;
  recordingStartTime = Date.now();
  isRecording = true;
  activeActionId = null;
  activeActionFormData = null;

  // Reset metrics
  capturedRequests = [];
  capturedResponses = [];
  capturedActions = [];
  capturedNavigations = [];
  pendingRequestMap.clear();

  console.log(`\n======================================================`);
  console.log(`[Agent] START RECORDING SESSION: ${currentSessionId}`);
  console.log(`[Agent] Target URL: ${targetUrl}`);
  console.log(`======================================================`);

  resetInactivityTimeout();

  try {
    // 1. Launch Playwright Chromium with visible window (headless: false)
    console.log('[Agent] Launching visible Playwright Chromium browser...');
    
    let browser = null;
    const launchArgs = [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check'
    ];

    try {
      browser = await pw.chromium.launch({
        headless: false,
        args: launchArgs
      });
    } catch (launchErr) {
      console.log('[Agent] Standard chromium launch failed, trying system Chrome/Edge channels...');
      try {
        browser = await pw.chromium.launch({ channel: 'chrome', headless: false, args: launchArgs });
      } catch (chromeErr) {
        try {
          browser = await pw.chromium.launch({ channel: 'msedge', headless: false, args: launchArgs });
        } catch (edgeErr) {
          console.error('[Agent] All direct browser launches failed. Attempting first-time install...');
          const installed = await checkAndInstallChromium(pw);
          if (installed) {
            browser = await pw.chromium.launch({ headless: false, args: launchArgs });
          } else {
            let extraInfo = '';
            if (process.platform === 'linux') {
              extraInfo = '\n\nTroubleshooting for Linux:\nIf the browser fails to launch, run: sudo apt install libnss3 libatk1.0-0 libgbm1 (Ubuntu/Debian)';
            }
            const fullMsg = `Failed to launch Chromium browser: ${launchErr.message}${extraInfo}`;
            showNativeDialog('AutomatiQA Browser Error', fullMsg, true);
            broadcast({
              type: 'AGENT_ERROR',
              code: 'BROWSER_LAUNCH_FAILED',
              message: fullMsg,
              linuxTroubleshooting: 'sudo apt install libnss3 libatk1.0-0 libgbm1'
            });
            await stopRecording('BROWSER_LAUNCH_FAILED');
            return;
          }
        }
      }
    }

    if (!browser) {
      throw new Error('Chromium browser could not be initialized.');
    }

    activeBrowser = browser;

    // 2. Create fresh browser context
    activeContext = await browser.newContext({
      viewport: null, // Utilize natural window size
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 AutomatiQAAgent/1.0'
    });

    activePage = await activeContext.newPage();

    // Track unique request and response IDs per session for deduplication
    const seenRequestIds = new Set();
    const seenResponseIds = new Set();
    const seenResponseKeys = new Set();
    const listenedPages = new WeakSet();
    let sessionReqCounter = 0;

    // Extract root registrable domain (eTLD+1) for generic first-party domain comparison
    function getRegistrableDomain(hostname) {
      if (!hostname) return '';
      const clean = hostname.toLowerCase().trim().split(':')[0];
      if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(clean) || clean === 'localhost') {
        return clean;
      }
      const parts = clean.split('.');
      if (parts.length <= 2) return clean;
      const secondToLast = parts[parts.length - 2];
      const commonTwoPartTlds = ['co', 'com', 'org', 'net', 'edu', 'gov', 'mil', 'ac'];
      if (parts.length >= 3 && commonTwoPartTlds.includes(secondToLast) && parts[parts.length - 1].length <= 3) {
        return parts.slice(-3).join('.');
      }
      return parts.slice(-2).join('.');
    }

    function isFirstPartyDomain(requestUrl, targetSiteUrl) {
      if (!requestUrl) return false;
      if (!targetSiteUrl) return true;
      try {
        const reqParsed = new URL(requestUrl.startsWith('http') ? requestUrl : `https://${requestUrl}`);
        const targetParsed = new URL(targetSiteUrl.startsWith('http') ? targetSiteUrl : `https://${targetSiteUrl}`);
        const reqHost = reqParsed.hostname.toLowerCase();
        const targetHost = targetParsed.hostname.toLowerCase();
        if (reqHost === targetHost) return true;
        const targetRoot = getRegistrableDomain(targetHost);
        if (targetRoot && (reqHost === targetRoot || reqHost.endsWith('.' + targetRoot))) {
          return true;
        }
        return false;
      } catch (e) {
        return true;
      }
    }

    // Generic app-agnostic relevance and noise filter for performance testing
    function isNoiseRequest(url, resourceType, method, status, targetSiteUrl, hasUserInteraction) {
      if (!url) return true;
      const lowerUrl = url.toLowerCase();
      const lowerType = (resourceType || '').toLowerCase();
      const reqMethod = (method || 'GET').toUpperCase();

      if (
        lowerUrl.startsWith('data:') ||
        lowerUrl.startsWith('blob:') ||
        lowerUrl.startsWith('chrome:') ||
        lowerUrl.startsWith('chrome-extension:') ||
        lowerUrl.startsWith('about:') ||
        lowerUrl.startsWith('javascript:')
      ) {
        return true;
      }

      if (reqMethod === 'OPTIONS' || reqMethod === 'HEAD') return true;

      // 4xx responses unrelated to real user input (e.g. 404 missing assets, 401/403 background telemetry/polling)
      if (status && status >= 400 && status < 500) {
        return true;
      }

      // Static assets: images, fonts, stylesheets, media, icons, maps
      if (['image', 'font', 'stylesheet', 'media', 'script', 'texttrack', 'eventsource', 'websocket', 'manifest', 'other'].includes(lowerType)) {
        return true;
      }

      if (/\.(?:png|jpe?g|gif|svg|webp|ico|bmp|woff2?|ttf|eot|otf|css|js|mjs|cjs|mp[34]|webm|ogg|wav|avif|cur|map|wasm|pdf|zip|txt)(?:[?#].*)?$/i.test(lowerUrl)) {
        return true;
      }

      if (/(?:favicon|apple-touch-icon|site\.webmanifest|browserconfig\.xml)/i.test(lowerUrl)) {
        return true;
      }

      // Filter requests to a different domain than the site being recorded (generic first-party domain check)
      if (targetSiteUrl && !isFirstPartyDomain(url, targetSiteUrl)) {
        return true;
      }

      // Filter requests that have no tied user interaction (unless initial landing navigation)
      if (hasUserInteraction === false) {
        return true;
      }

      // Generic Subdomain / Domain Analytics & Telemetry Pattern
      try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        const host = parsed.hostname.toLowerCase();
        if (/(?:^|\.)(?:collector|telemetry|track(?:ing|er)?|metrics|logs?|logging|stats|events?|beacon|pixel|rum|analytics|ingest|dd-rum|nr-data|sentry)\./i.test(host)) {
          return true;
        }
      } catch (e) {
        if (/(?:collector|telemetry|tracking|metrics|logging|events|beacon|analytics)\./i.test(lowerUrl)) {
          return true;
        }
      }

      // Known tracking, advertising, error logging, and session replay domains
      const noiseDomains = [
        'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'analytics.google.com',
        'hotjar.com', 'mixpanel.com', 'segment.io', 'segment.com', 'facebook.net', 'connect.facebook.net',
        'clarity.ms', 'datadoghq.com', 'sentry.io', 'ads-twitter.com',
        'linkedin.com/px', 'criteo.com', 'adservice.google', 'amplitude.com',
        'newrelic.com', 'nr-data.net', 'scorecardresearch.com', 'quantserve.com',
        'optimizely.com', 'intercom.io', 'zendesk.com', 'crisp.chat',
        'hubspot.com', 'chartbeat.com', 'taboola.com', 'outbrain.com',
        'pingdom.net', 'fullstory.com', 'inspectlet.com', 'loggly.com',
        'bat.bing.com', 'tiktok.com', 'snapchat.com', 'pinterest.com',
        'branch.io', 'braze.com', 'adjust.com', 'appsflyer.com', 'onesignal.com'
      ];
      if (noiseDomains.some((d) => lowerUrl.includes(d))) return true;

      // Tracking keyword patterns in path or query
      if (
        lowerUrl.includes('__vite_ping') ||
        lowerUrl.includes('__webpack_hmr') ||
        lowerUrl.includes('browser-tools') ||
        /(?:^|\/)(?:collect(?:or)?|telemetry|track(?:ing|er)?|beacon|analytics|event-log|events?|metrics|rum|pixel|batch|heartbeat|ping|healthz?|healthcheck|livez|readyz|cdn-cgi\/(?:rum|challenge|telemetry)|log(?:ging)?|traces|datadog|nr-data|sentry|inspectlet|fullstory|intercom|segment|mixpanel)(?:[\/?&#]|$)/i.test(lowerUrl)
      ) {
        return true;
      }

      return false;
    }

    // Helper: Register listeners strictly once per page
    function attachPageListeners(page) {
      if (!page || listenedPages.has(page)) return;
      listenedPages.add(page);

      // 3. Handle browser / window close by user
      page.on('close', () => {
        console.log('[Agent] Browser page closed by user.');
        if (isRecording) {
          stopRecording('USER_CLOSED_BROWSER');
        }
      });

      // 4. Attach page.on('request')
      page.on('request', (request) => {
        const reqUrl = request.url();
        const isLanding = capturedRequests.length === 0;
        const hasInteraction = isLanding || !!activeActionId;
        if (isNoiseRequest(reqUrl, request.resourceType(), request.method(), undefined, currentTargetUrl, hasInteraction)) return;

        sessionReqCounter++;
        const reqId = `req_${currentSessionId || 'sess'}_${sessionReqCounter}_${Date.now()}`;
        
        let postData = undefined;
        try {
          postData = request.postData() || undefined;
          if (!postData && typeof request.postDataBuffer === 'function') {
            const buf = request.postDataBuffer();
            if (buf && buf.length > 0) {
              postData = buf.toString('utf8');
            }
          }
          if (!postData && ['POST', 'PUT', 'PATCH'].includes(request.method()) && activeActionFormData && Object.keys(activeActionFormData).length > 0) {
            const reqHeaders = request.headers ? request.headers() : {};
            const cType = (reqHeaders['content-type'] || '').toLowerCase();
            if (cType.includes('application/json')) {
              postData = JSON.stringify(activeActionFormData);
            } else {
              try {
                postData = new URLSearchParams(activeActionFormData).toString();
              } catch (e) {
                postData = JSON.stringify(activeActionFormData);
              }
            }
          }
        } catch (e) {}

        const reqData = {
          id: reqId,
          url: reqUrl,
          method: request.method(),
          headers: request.headers ? request.headers() : {},
          postData,
          resourceType: request.resourceType(),
          timestamp: Date.now(),
          actionId: activeActionId,
          actionIntent: activeActionIntent,
          actionFormData: activeActionFormData,
          sessionId: currentSessionId
        };

        pendingRequestMap.set(request, reqData);

        if (!seenRequestIds.has(reqId)) {
          seenRequestIds.add(reqId);
          capturedRequests.push(reqData);

          // Stream request counter
          broadcast({
            type: 'network_event',
            event: 'request',
            data: {
              id: reqId,
              url: reqUrl,
              method: request.method(),
              postData,
              resourceType: request.resourceType(),
              timestamp: reqData.timestamp,
              actionId: activeActionId,
              actionIntent: activeActionIntent,
              sessionId: currentSessionId
            },
            totalRequestsCaptured: capturedRequests.length
          });
        }
      });

      // 5. Attach page.on('response')
      page.on('response', async (response) => {
        const request = response.request();
        const reqData = pendingRequestMap.get(request);
        const reqUrl = response.url();
        const status = response.status();
        const isLanding = capturedResponses.length === 0;
        const hasInteraction = isLanding || (reqData && !!reqData.actionId) || !!activeActionId;
        if (isNoiseRequest(reqUrl, request.resourceType(), request.method(), status, currentTargetUrl, hasInteraction)) return;

        const finishTime = Date.now();
        const responseTimeMs = reqData ? Math.max(1, finishTime - reqData.timestamp) : 0;
        let contentLength = 0;
        try {
          const headers = response.headers();
          contentLength = parseInt(headers['content-length'] || '0', 10) || 0;
        } catch (e) {}

        // Read post body AFTER request is fully sent (at response time)
        let postPayload = undefined;
        try {
          postPayload = request.postData() || undefined;
          if (!postPayload && typeof request.postDataBuffer === 'function') {
            const buf = request.postDataBuffer();
            if (buf && buf.length > 0) {
              postPayload = buf.toString('utf8');
            }
          }
        } catch (e) {}

        if (!postPayload && reqData && reqData.postData) {
          postPayload = reqData.postData;
        }

        if (!postPayload && ['POST', 'PUT', 'PATCH'].includes(request.method()) && activeActionFormData && Object.keys(activeActionFormData).length > 0) {
          try {
            postPayload = JSON.stringify(activeActionFormData);
          } catch (e) {}
        }

        const respId = reqData ? reqData.id : `resp_${currentSessionId || 'sess'}_${++sessionReqCounter}_${finishTime}`;

        // Deduplication safety check: check respId AND (method + url + time window)
        const dedupeKey = `${request.method()}|${reqUrl}|${Math.floor(finishTime / 500)}`;
        if (seenResponseIds.has(respId) || seenResponseKeys.has(dedupeKey)) {
          return;
        }
        seenResponseIds.add(respId);
        seenResponseKeys.add(dedupeKey);

        const respItem = {
          id: respId,
          url: reqUrl,
          method: request.method(),
          status: response.status(),
          statusText: response.statusText(),
          headers: response.headers(),
          requestHeaders: request.headers ? request.headers() : {},
          postData: postPayload,
          body: postPayload,
          responseTimeMs,
          resourceType: request.resourceType(),
          contentLength,
          actionId: reqData ? reqData.actionId : activeActionId,
          actionIntent: (reqData && reqData.actionIntent) ? reqData.actionIntent : activeActionIntent,
          actionFormData: (reqData && reqData.actionFormData) ? reqData.actionFormData : activeActionFormData,
          timestamp: finishTime,
          sessionId: currentSessionId
        };

        capturedResponses.push(respItem);

        // Real-time stream to AutomatiQA web client
        broadcast({
          type: 'network_event',
          event: 'response',
          data: respItem,
          totalRequestsCaptured: capturedRequests.length,
          totalResponsesCaptured: capturedResponses.length,
          sessionId: currentSessionId
        });
      });

      // 6. Attach page.on('framenavigated') to mark navigation boundaries
      page.on('framenavigated', async (frame) => {
        if (frame === page.mainFrame()) {
          const navUrl = frame.url();
          let pageTitle = '';
          try {
            pageTitle = await page.title();
          } catch (e) {}

          console.log(`[Agent] Page Navigation: ${navUrl} (${pageTitle || 'Untitled'})`);
          const navEvent = {
            id: `nav_${Date.now()}`,
            url: navUrl,
            title: pageTitle,
            timestamp: Date.now(),
            sessionId: currentSessionId
          };
          capturedNavigations.push(navEvent);

          broadcast({
            type: 'navigation_event',
            data: navEvent,
            totalNavigations: capturedNavigations.length,
            sessionId: currentSessionId
          });
        }
      });
    }

    // Attach listeners to initial page exactly once
    attachPageListeners(activePage);

    // Support popups/new tabs without duplicate listener registration
    activeContext.on('page', (newPage) => {
      if (newPage && !listenedPages.has(newPage)) {
        console.log('[Agent] New popup/tab opened in session:', newPage.url());
        attachPageListeners(newPage);
      }
    });

    let activeActionFormData = null;
    let activeActionIntent = null;

    function inferActionIntent(actionData) {
      const text = (actionData.text || '').toLowerCase().trim();
      const sel = (actionData.selector || '').toLowerCase();
      const url = (actionData.url || '').toLowerCase();
      const keys = actionData.formData ? Object.keys(actionData.formData).map(k => k.toLowerCase()).join(' ') : '';

      // 1. Authentication / Registration / Logout
      if (text.includes('logout') || text.includes('log out') || text.includes('sign out') || sel.includes('logout') || sel.includes('signout')) {
        return 'Logout';
      }

      if (
        text.includes('register') || text.includes('sign up') || text.includes('signup') ||
        text.includes('create account') || sel.includes('register') || sel.includes('signup') ||
        keys.includes('confirm_password') || keys.includes('confirmpassword') ||
        url.includes('/register') || url.includes('/signup')
      ) {
        return 'Register';
      }

      if (
        keys.includes('password') || keys.includes('passwd') || keys.includes('pwd') ||
        text.includes('login') || text.includes('sign in') || text.includes('log in') ||
        sel.includes('login') || sel.includes('signin') ||
        url.includes('/login') || url.includes('/auth') || url.includes('/signin')
      ) {
        return 'Login';
      }

      // 2. Change Password / Profile
      if (text.includes('change password') || text.includes('reset password') || keys.includes('old_password') || keys.includes('new_password')) {
        return 'Change Password';
      }

      if (text.includes('profile') || text.includes('my account') || sel.includes('profile') || keys.includes('profile_name')) {
        return 'Profile Update';
      }

      // 3. Payment & Place Order
      if (
        text.includes('pay') || text.includes('payment') || text.includes('place order') ||
        text.includes('confirm order') || text.includes('complete purchase') || text.includes('complete payment') ||
        keys.includes('card_num') || keys.includes('card_number') || keys.includes('cvv') || keys.includes('cvc') ||
        keys.includes('stripe') || keys.includes('paypal') ||
        url.includes('/payment') || url.includes('/pay') || url.includes('/charge')
      ) {
        return 'Payment';
      }

      // 4. Booking & Reservation
      if (
        text.includes('book') || text.includes('reserve') || text.includes('reservation') ||
        sel.includes('book') || sel.includes('reserve') ||
        keys.includes('book_hotel') || keys.includes('num_rooms') || keys.includes('room_type') ||
        (keys.includes('checkin') && keys.includes('first_name')) ||
        url.includes('/booking') || url.includes('/reserve') || url.includes('book_hotel')
      ) {
        return 'Book';
      }

      // 5. Select Hotel / Select Product / Select Item
      if (
        text.includes('select hotel') || text.includes('choose hotel') || keys.includes('select_hotel') ||
        (keys.includes('radiobutton') && (url.includes('hotel') || text.includes('hotel') || keys.includes('hotel'))) ||
        (sel.includes('hotel') && (sel.includes('radio') || sel.includes('select') || sel.includes('choose')))
      ) {
        return 'Select Hotel';
      }

      if (
        text.includes('select') || text.includes('choose') || sel.includes('select') ||
        keys.includes('radiobutton') || keys.includes('item_id') || keys.includes('product_id') ||
        url.includes('/product/') || url.includes('/item/') || url.includes('/detail')
      ) {
        if (text.includes('hotel') || sel.includes('hotel') || url.includes('hotel') || keys.includes('hotel')) {
          return 'Select Hotel';
        }
        return 'Select Product';
      }

      // 6. Search
      if (
        text.includes('search') || text.includes('find') || text.includes('lookup') ||
        sel.includes('search') || sel.includes('find') ||
        keys.includes('search') || keys.includes('query') || keys.includes('keyword') ||
        keys.includes('destination') || keys.includes('location') || keys.split(' ').includes('q') ||
        url.includes('/search') || url.includes('?q=') || url.includes('&q=') || url.includes('search=')
      ) {
        return 'Search';
      }

      // 7. Add to Cart
      if (
        text.includes('add to cart') || text.includes('add to bag') || text.includes('add to basket') ||
        text === 'cart' || sel.includes('add-to-cart') || sel.includes('add_to_cart') ||
        url.includes('/cart/add') || url.includes('checkout/cart/add')
      ) {
        return 'Add to Cart';
      }

      // 8. Checkout
      if (
        text.includes('checkout') || text.includes('proceed to checkout') || sel.includes('checkout') ||
        keys.includes('shipping_address') || keys.includes('billing_address') ||
        url.includes('/checkout') || url.includes('/shipping')
      ) {
        return 'Checkout';
      }

      // 9. Upload / Download
      if (text.includes('upload') || sel.includes('upload') || keys.includes('file') || keys.includes('attachment')) {
        return 'Upload';
      }
      if (text.includes('download') || text.includes('export') || sel.includes('download')) {
        return 'Download';
      }

      // 10. Filter & Sort
      if (text.includes('filter') || sel.includes('filter') || keys.includes('filter') || url.includes('filter')) {
        return 'Apply Filter';
      }
      if (text.includes('sort') || sel.includes('sort') || keys.includes('sort') || url.includes('sort')) {
        return 'Sort';
      }

      // 11. Delete
      if (text.includes('delete') || text.includes('remove') || sel.includes('delete') || sel.includes('remove')) {
        return 'Delete';
      }

      // 12. Create / Update / Submit
      if (text.includes('create') || text.includes('new ') || text.startsWith('add ')) {
        return 'Create';
      }
      if (text.includes('save') || text.includes('update') || text.includes('edit')) {
        return 'Update';
      }

      if (actionData.action === 'submit' || actionData.tagName === 'form') {
        if (text && text.length > 2 && text.length < 35 && !text.includes('\n')) {
          return text.charAt(0).toUpperCase() + text.slice(1);
        }
        return 'Perform Action';
      }

      return undefined;
    }

    // 7. Injected script via page.addInitScript to capture DOM interactions
    await activePage.exposeFunction('__automatiqa_report_action', (eventData) => {
      const actionId = `act_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      activeActionId = actionId;
      if (eventData && eventData.formData && Object.keys(eventData.formData).length > 0) {
        activeActionFormData = eventData.formData;
      }

      const inferredIntent = inferActionIntent(eventData);
      activeActionIntent = inferredIntent;

      const actionItem = {
        id: actionId,
        action: eventData.action || 'click',
        actionIntent: inferredIntent,
        selector: eventData.selector || '',
        tagName: eventData.tagName || '',
        text: eventData.text || '',
        formData: eventData.formData,
        url: eventData.url || (activePage ? activePage.url() : ''),
        timestamp: eventData.timestamp || Date.now()
      };

      capturedActions.push(actionItem);
      console.log(`[Agent] User Action: [${actionItem.action.toUpperCase()}] ${inferredIntent ? `(Intent: ${inferredIntent}) ` : ''}on <${actionItem.tagName}> "${actionItem.text.substring(0, 30)}"`);

      broadcast({
        type: 'user_action',
        data: actionItem,
        totalActionsCaptured: capturedActions.length
      });
    });

    await activePage.addInitScript(() => {
      // Regex for generic ad-network/referral/tracking parameters to exclude from form data
      const TRACKING_PARAM_REGEX = /^(utm_|gclid|fbclid|msclkid|dclid|twclid|igshid|hv[a-z0-9_]|mcid|ref|ref_|tag|affiliate|trk|tracking|_ga|_gl|s_kwcid|yclid|zenid|sessionid|adgroup|campaign|keyword|matchtype|network|device|placement|wbraid|gbraid|oly_enc_id|oly_anon_id|vero_id|_openstat)/i;

      // In-memory registry of user-interacted elements
      const recentInteractions = new Map();

      function getCleanFieldName(el) {
        if (!el) return '';
        const raw = el.name || el.id || el.getAttribute('name') || el.getAttribute('data-field') || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
        return raw.trim();
      }

      function getInputValue(el) {
        if (!el) return '';
        if (el.type === 'checkbox') {
          return el.checked ? (el.value || 'on') : '';
        }
        if (el.type === 'radio') {
          return el.checked ? el.value : '';
        }
        if (el.tagName === 'SELECT') {
          if (el.multiple) {
            return Array.from(el.selectedOptions).map(o => o.value || o.text).join(',');
          }
          return el.value !== undefined ? el.value : (el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : '');
        }
        return el.value !== undefined ? el.value : '';
      }

      function recordElementInteraction(el) {
        if (!el || !el.tagName) return;
        const tag = el.tagName.toUpperCase();
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return;
        const name = getCleanFieldName(el);
        if (!name) return;
        if (TRACKING_PARAM_REGEX.test(name)) return;
        const val = getInputValue(el);
        recentInteractions.set(name, {
          name,
          value: val,
          type: (el.type || tag.toLowerCase()).toLowerCase(),
          tagName: tag.toLowerCase(),
          timestamp: Date.now()
        });
      }

      document.addEventListener('input', (e) => {
        if (e.target) recordElementInteraction(e.target);
      }, true);

      document.addEventListener('change', (e) => {
        if (e.target) recordElementInteraction(e.target);
      }, true);

      document.addEventListener('blur', (e) => {
        if (e.target) recordElementInteraction(e.target);
      }, true);

      function getCssSelector(el) {
        if (!el || el.nodeType !== 1) return '';
        if (el.id) return `#${el.id}`;
        
        let path = [];
        while (el && el.nodeType === 1) {
          let selector = el.tagName.toLowerCase();
          if (el.className && typeof el.className === 'string' && el.className.trim()) {
            const firstClass = el.className.trim().split(/\s+/)[0];
            if (firstClass && !firstClass.includes(':') && !firstClass.includes('[')) {
              selector += `.${firstClass}`;
            }
          }
          let sibling = el;
          let nth = 1;
          while (sibling = sibling.previousElementSibling) {
            if (sibling.tagName === el.tagName) nth++;
          }
          if (nth > 1) selector += `:nth-of-type(${nth})`;
          path.unshift(selector);
          el = el.parentElement;
          if (path.length >= 3) break;
        }
        return path.join(' > ');
      }

      function collectAllFormValues(targetEl) {
        const result = {};
        
        // 1. Closest form or container
        let form = targetEl ? (targetEl.closest ? targetEl.closest('form, [role="form"], fieldset, .form, div[class*="form"], div[class*="login"], div[class*="search"]') : null) : null;
        if (form) {
          try {
            const inputs = form.querySelectorAll('input, select, textarea');
            inputs.forEach(inp => {
              const name = getCleanFieldName(inp);
              if (name && inp.type !== 'submit' && inp.type !== 'button' && inp.type !== 'reset') {
                if (TRACKING_PARAM_REGEX.test(name)) return;
                const val = getInputValue(inp);
                if (inp.type === 'radio' && !inp.checked) return;
                result[name] = val;
              }
            });
          } catch(e) {}
        }

        // 2. Merge recently interacted form fields (within last 90s)
        const now = Date.now();
        recentInteractions.forEach((item, name) => {
          if (now - item.timestamp < 90000) {
            if (item.value !== '' || result[name] === undefined) {
              result[name] = item.value;
            }
          }
        });

        // 3. Fallback: visible inputs on page with non-empty values
        if (Object.keys(result).length === 0) {
          try {
            const allInputs = document.querySelectorAll('input, select, textarea');
            allInputs.forEach(inp => {
              if (inp.type === 'submit' || inp.type === 'button' || inp.type === 'reset' || inp.type === 'hidden') return;
              const name = getCleanFieldName(inp);
              if (name && !TRACKING_PARAM_REGEX.test(name)) {
                const val = getInputValue(inp);
                if (val && String(val).trim()) {
                  if (inp.type === 'radio' && !inp.checked) return;
                  result[name] = val;
                }
              }
            });
          } catch(e) {}
        }

        return result;
      }

      // Enter key submission on input elements
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const target = e.target;
          if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
            recordElementInteraction(target);
            const formData = collectAllFormValues(target);
            const rawText = (target.name || target.id || target.value || 'Enter Submit');
            window.__automatiqa_report_action({
              action: 'submit',
              selector: getCssSelector(target),
              tagName: target.tagName.toLowerCase(),
              text: `Enter on ${rawText}`,
              formData: Object.keys(formData).length > 0 ? formData : undefined,
              url: window.location.href,
              timestamp: Date.now()
            });
          }
        }
      }, true);

      document.addEventListener('click', (e) => {
        try {
          const target = e.target;
          if (!target) return;
          const selector = getCssSelector(target);
          const rawText = (target.innerText || target.value || target.getAttribute('aria-label') || target.getAttribute('title') || '').trim();
          const tag = target.tagName ? target.tagName.toLowerCase() : '';
          
          const isButtonLike = tag === 'button' || target.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].includes(target.type)) || !!target.closest('button, [role="button"], input[type="submit"]');
          
          let formData = {};
          if (isButtonLike || target.closest('form, [role="form"], fieldset, .form')) {
            formData = collectAllFormValues(target);
          }
          
          window.__automatiqa_report_action({
            action: (isButtonLike && target.type === 'submit') ? 'submit' : 'click',
            selector,
            tagName: tag,
            text: rawText.substring(0, 100),
            formData: Object.keys(formData).length > 0 ? formData : undefined,
            url: window.location.href,
            timestamp: Date.now()
          });
        } catch (err) {}
      }, true);

      document.addEventListener('submit', (e) => {
        try {
          const target = e.target;
          if (!target) return;
          const formData = collectAllFormValues(target);
          window.__automatiqa_report_action({
            action: 'submit',
            selector: getCssSelector(target),
            tagName: 'form',
            text: 'Form Submission',
            formData: Object.keys(formData).length > 0 ? formData : undefined,
            url: window.location.href,
            timestamp: Date.now()
          });
        } catch (err) {}
      }, true);
    });

    // 8. Announce session started to client
    broadcast({
      type: 'recording_started',
      sessionId: currentSessionId,
      url: targetUrl,
      status: 'active',
      startedAt: recordingStartTime
    });

    // 9. Navigate to target URL
    console.log(`[Agent] Navigating to ${targetUrl}...`);
    await activePage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch((e) => {
      console.warn(`[Agent] Initial navigation note: ${e.message}`);
    });

    return { success: true, sessionId: currentSessionId };
  } catch (err) {
    console.error('[Agent] Failed to start recording session:', err);
    isRecording = false;
    broadcast({
      type: 'recording_error',
      error: err.message || 'Failed to start browser recording session'
    });
    return { success: false, error: err.message };
  }
}

/**
 * Stop Playwright recording session and package captured dataset
 */
async function stopRecording(reason = 'USER_STOPPED') {
  if (!isRecording && !activeBrowser) {
    return { success: true, message: 'No active recording session' };
  }

  console.log(`\n[Agent] STOP RECORDING (Reason: ${reason}). Packaging captured telemetry...`);

  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }

  const durationMs = Date.now() - recordingStartTime;
  isRecording = false;

  // Close browser instance cleanly
  try {
    if (activePage) {
      await activePage.close().catch(() => {});
      activePage = null;
    }
    if (activeContext) {
      await activeContext.close().catch(() => {});
      activeContext = null;
    }
    if (activeBrowser) {
      await activeBrowser.close().catch(() => {});
      activeBrowser = null;
    }
  } catch (closeErr) {
    console.warn('[Agent] Browser cleanup notice:', closeErr.message);
  }

  // Correlate actions and requests into structured scenarios
  const correlatedScenarios = [];
  const actionMap = new Map();

  capturedActions.forEach((act, idx) => {
    actionMap.set(act.id, {
      ...act,
      stepNumber: idx + 1,
      requests: []
    });
  });

  const generalRequests = [];
  capturedResponses.forEach((resp) => {
    if (resp.actionId && actionMap.has(resp.actionId)) {
      actionMap.get(resp.actionId).requests.push(resp);
    } else {
      generalRequests.push(resp);
    }
  });

  // Calculate statistics
  const totalReqCount = capturedRequests.length;
  const totalRespCount = capturedResponses.length;
  const failedReqCount = capturedResponses.filter(r => r.status >= 400).length;
  const avgResponseTime = totalRespCount > 0
    ? Math.round(capturedResponses.reduce((acc, r) => acc + (r.responseTimeMs || 0), 0) / totalRespCount)
    : 0;

  const dataset = {
    type: 'recording_complete',
    sessionId: currentSessionId,
    targetUrl: currentTargetUrl,
    durationMs,
    reason,
    completedAt: new Date().toISOString(),
    summary: {
      totalRequests: totalReqCount,
      totalResponses: totalRespCount,
      totalActions: capturedActions.length,
      totalNavigations: capturedNavigations.length,
      failedRequests: failedReqCount,
      avgResponseTimeMs: avgResponseTime
    },
    requests: capturedRequests,
    responses: capturedResponses,
    actions: capturedActions,
    navigations: capturedNavigations,
    correlatedActions: Array.from(actionMap.values()),
    uncorrelatedRequests: generalRequests
  };

  console.log(`[Agent] Captured: ${totalReqCount} requests, ${capturedActions.length} actions, ${capturedNavigations.length} navigations.`);
  console.log(`[Agent] Broadcasting final dataset to web app...`);

  broadcast(dataset);

  // Reset state for next session
  currentSessionId = null;
  currentTargetUrl = '';
  activeActionId = null;
  activeActionFormData = null;

  return { success: true, dataset };
}

/**
 * Handle incoming WebSocket messages from web app
 */
function handleClientMessage(client, rawMessage) {
  try {
    const msg = JSON.parse(rawMessage.toString());
    const action = msg.action || msg.type;

    console.log(`[Agent] Received message: ${action}`);

    switch (action) {
      case 'ping':
      case 'check_status':
        sendTo(client, {
          type: 'agent_status',
          status: 'ready',
          version: AGENT_VERSION,
          isRecording,
          currentSessionId,
          activeTarget: currentTargetUrl
        });
        break;

      case 'start_record':
      case 'start_recording':
        startRecording(msg, client);
        break;

      case 'stop_record':
      case 'stop_recording':
        stopRecording('CLIENT_REQUESTED');
        break;

      default:
        console.log(`[Agent] Unhandled action: ${action}`);
        break;
    }
  } catch (err) {
    console.error('[Agent] Failed to parse client message:', err.message);
  }
}

/**
 * Boot dual HTTP and HTTPS servers with WebSocket upgrades
 */
function startServers() {
  console.log('================================================================');
  console.log(`       AUTOMATIQA LOCAL WEB RECORDING AGENT v${AGENT_VERSION}`);
  console.log('================================================================');

  // 1. Plain HTTP / WS Server (Port 9333)
  const httpServer = http.createServer(handleHttpRequest);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const remoteIp = socket.remoteAddress || '';
    if (!isLoopbackAddress(remoteIp)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  function setupWebSocketEvents(ws, request) {
    connectedSockets.add(ws);
    console.log(`[Agent] Web app client connected (${connectedSockets.size} active connection)`);

    // Immediate greeting & version check on connect
    sendTo(ws, {
      type: 'agent_status',
      status: 'ready',
      version: AGENT_VERSION,
      capabilities: ['playwright_chromium', 'network_capture', 'action_capture', 'framenavigated'],
      isRecording,
      currentSessionId,
      activeTarget: currentTargetUrl
    });

    ws.on('message', (data) => handleClientMessage(ws, data));

    ws.on('close', () => {
      connectedSockets.delete(ws);
      console.log(`[Agent] Client disconnected. (${connectedSockets.size} remaining)`);
    });

    ws.on('error', (err) => {
      console.warn('[Agent] WebSocket client error:', err.message);
      connectedSockets.delete(ws);
    });
  }

  wss.on('connection', setupWebSocketEvents);

  httpServer.listen(DEFAULT_HTTP_PORT, '127.0.0.1', () => {
    console.log('================================================================');
    console.log(`        AUTOMATIQA LOCAL RECORDING AGENT v${AGENT_VERSION}`);
    console.log('================================================================');
    console.log(`[Agent] Platform:    ${process.platform} (${process.arch})`);
    console.log(`[Agent] Executable:  ${process.execPath}`);
    console.log(`[Agent] Packaged:    ${Boolean(process.pkg)}`);
    console.log(`[Agent] Log File:    ${LOG_FILE}`);
    console.log(`[Agent] HTTP/WS:     ws://localhost:${DEFAULT_HTTP_PORT}`);
    console.log(`[Agent] Status URL:  http://localhost:${DEFAULT_HTTP_PORT}/status`);
    console.log('----------------------------------------------------------------');
    console.log('Status: LISTENING and ready for AutomatiQA Web Performance tests.');
    console.log('Keep this window open while recording.');
    console.log('================================================================\n');

    // Run first-time browser check in the background
    const pw = getPlaywright();
    if (pw) {
      checkAndInstallChromium(pw).catch((err) => {
        console.warn('[Agent] Initial browser check warning:', err.message);
      });
    }
  });

  // 2. HTTPS / WSS Server (Port 9334) for mixed-content HTTPS compatibility
  try {
    const httpsServer = https.createServer(
      {
        key: TLS_KEY,
        cert: TLS_CERT
      },
      handleHttpRequest
    );

    const wssSecure = new WebSocketServer({ noServer: true });

    httpsServer.on('upgrade', (request, socket, head) => {
      const remoteIp = socket.remoteAddress || '';
      if (!isLoopbackAddress(remoteIp)) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wssSecure.handleUpgrade(request, socket, head, (ws) => {
        wssSecure.emit('connection', ws, request);
      });
    });

    wssSecure.on('connection', setupWebSocketEvents);

    httpsServer.listen(DEFAULT_HTTPS_PORT, '127.0.0.1', () => {
      console.log(`[Agent] Secure HTTPS & WSS Server listening on:`);
      console.log(`        -> wss://localhost:${DEFAULT_HTTPS_PORT}`);
      console.log(`        -> https://localhost:${DEFAULT_HTTPS_PORT}/status`);
      console.log('================================================================\n');

      // Export root certificate file for optional local OS trust store installation
      try {
        const certDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
        const certPath = path.join(certDir, 'automatiqa-ca.crt');
        fs.writeFileSync(certPath, TLS_CERT, 'utf8');
      } catch (_) {}
    });

    httpsServer.on('error', (err) => {
      console.warn(`[Agent] Optional WSS server notice on port ${DEFAULT_HTTPS_PORT}:`, err.message);
    });
  } catch (tlsErr) {
    console.warn('[Agent] Note: Secure WSS server failed to start, using WS on 9333 only:', tlsErr.message);
  }

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const portMsg = `Port ${DEFAULT_HTTP_PORT} is already in use by another program or an existing instance of AutomatiQA Agent.\n\nPlease close any existing AutomatiQA Agent window/process or free up port ${DEFAULT_HTTP_PORT} and try again.\n\nLog file: ${LOG_FILE}`;
      fatalExit(1, portMsg);
    } else {
      console.error('[Agent Fatal] Server error:', err);
      fatalExit(1, `Server startup error: ${err.message}\n\nLog file: ${LOG_FILE}`);
    }
  });
}

// Handle clean shutdown
process.on('SIGINT', async () => {
  console.log('\n[Agent] Shutting down agent...');
  await stopRecording('AGENT_SHUTDOWN');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[Agent] Terminating agent...');
  await stopRecording('AGENT_SHUTDOWN');
  process.exit(0);
});

// Boot the agent
startServers();
