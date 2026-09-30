/**
 * AutomatiQA Device Agent (Real-Time ADB Streaming & Action Bridge)
 * -----------------------------------------------------------------
 * Companion script for local USB devices and Android Studio emulators (e.g. emulator-5554)
 * to stream real Android application screens directly to AutomatiQA and capture physical/emulator taps.
 */

const { exec, spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Read command line arguments
const args = {};
process.argv.slice(2).forEach(val => {
  const parts = val.split('=');
  if (parts[0].startsWith('--')) {
    const key = parts[0].slice(2);
    args[key] = parts[1];
  }
});

const userEmail = (args.email || 'sowbarnya@qaoncloud.com').toLowerCase();
const serverUrl = (args.server || 'http://localhost:3000').replace(/\/$/, '');
const port = parseInt(args.port) || 4723;

console.log('====================================================');
console.log('       AUTOMATIQA DEVICE AGENT (REAL-TIME ADB STREAM)');
console.log('====================================================');
console.log(`User Email : ${userEmail}`);
console.log(`Server URL : ${serverUrl}`);
console.log(`ADB Status : Checking...`);

function runCmd(command) {
  return new Promise((resolve) => {
    exec(command, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: error.message, stdout: stdout || '', stderr: stderr || '' });
      } else {
        resolve({ success: true, stdout: stdout || '', stderr: stderr || '' });
      }
    });
  });
}

async function checkAdb() {
  const result = await runCmd('adb version');
  if (result.success) {
    console.log(`ADB Status : OK (${result.stdout.split('\n')[0]})`);
    return true;
  } else {
    console.log('ADB Status : ERROR (ADB not found in system PATH. Install Android SDK Platform-Tools.)');
    return false;
  }
}

async function scanDevices() {
  const result = await runCmd('adb devices -l');
  if (!result.success) return [];

  const lines = result.stdout.split('\n');
  const devices = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const id = parts[0];
    const status = parts[1];
    if (status !== 'device') continue;

    let model = 'Unknown Android Device';
    parts.forEach(part => {
      if (part.startsWith('model:')) model = part.substring(6).replace(/_/g, ' ');
    });

    const isEmulator = id.startsWith('emulator-') || id.startsWith('127.0.0.1:') || model.toLowerCase().includes('emulator');

    const versionRes = await runCmd(`adb -s ${id} shell getprop ro.build.version.release`);
    const version = versionRes.success && versionRes.stdout.trim() ? versionRes.stdout.trim() : '14';

    devices.push({
      deviceId: id,
      deviceName: model,
      platform: 'Android',
      version: version,
      status: 'Connected',
      type: isEmulator ? 'Emulator' : 'Real Device'
    });
  }

  return devices;
}

// Fast binary screencap via adb exec-out with fallback
function captureScreenshot(deviceId) {
  return new Promise((resolve) => {
    exec(`adb -s ${deviceId} exec-out screencap -p`, { encoding: 'buffer', maxBuffer: 15 * 1024 * 1024 }, (err, stdout) => {
      if (!err && stdout && stdout.length > 1000) {
        const base64Image = stdout.toString('base64');
        resolve(`data:image/png;base64,${base64Image}`);
      } else {
        // Fallback method via tmp
        const tempPath = path.join(__dirname || '.', `screencap_${deviceId.replace(/[^a-zA-Z0-9]/g, '_')}.png`);
        runCmd(`adb -s ${deviceId} shell screencap -p /data/local/tmp/screencap.png`).then(() => {
          runCmd(`adb -s ${deviceId} pull /data/local/tmp/screencap.png "${tempPath}"`).then(() => {
            try {
              if (fs.existsSync(tempPath)) {
                const fileData = fs.readFileSync(tempPath);
                fs.unlinkSync(tempPath);
                resolve(`data:image/png;base64,${fileData.toString('base64')}`);
                return;
              }
            } catch (e) {}
            resolve(null);
          });
        });
      }
    });
  });
}

// Cache the last window dump XML to minimize latency
let cachedXmlHierarchy = { time: 0, xml: '' };

async function getElementAtCoordinates(deviceId, x, y) {
  try {
    const now = Date.now();
    let xmlContent = '';

    // Dump window hierarchy to /data/local/tmp/window_dump.xml
    const dumpRes = await runCmd(`adb -s ${deviceId} shell uiautomator dump /data/local/tmp/window_dump.xml`);
    if (dumpRes.success) {
      const readRes = await runCmd(`adb -s ${deviceId} shell cat /data/local/tmp/window_dump.xml`);
      if (readRes.success && readRes.stdout && readRes.stdout.includes('<hierarchy')) {
        xmlContent = readRes.stdout;
        cachedXmlHierarchy = { time: now, xml: xmlContent };
      }
    }

    if (!xmlContent && now - cachedXmlHierarchy.time < 10000 && cachedXmlHierarchy.xml) {
      xmlContent = cachedXmlHierarchy.xml;
    }

    if (!xmlContent) return null;

    // Parse nodes and bounds [x1,y1][x2,y2]
    const nodeRegex = /<node\s+([^>]*)\s*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"([^>]*)\/?>/g;
    let match;
    let bestNodeAttributes = null;
    let smallestArea = Infinity;

    while ((match = nodeRegex.exec(xmlContent)) !== null) {
      const allAttrs = (match[1] + ' ' + match[6]).trim();
      const x1 = parseInt(match[2], 10);
      const y1 = parseInt(match[3], 10);
      const x2 = parseInt(match[4], 10);
      const y2 = parseInt(match[5], 10);

      // Check if tap point is inside this node's bounds
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
        const area = (x2 - x1) * (y2 - y1);

        // Extract attributes
        const getAttr = (name) => {
          const m = allAttrs.match(new RegExp(`${name}="([^"]*)"`));
          return m ? m[1] : '';
        };

        const isClickable = getAttr('clickable') === 'true';
        const hasText = !!getAttr('text');
        const hasDesc = !!getAttr('content-desc');

        // Prefer clickable or labeled elements
        let areaScore = area;
        if (isClickable || hasText || hasDesc) {
          areaScore = area * 0.8; // Give priority
        }

        if (areaScore < smallestArea) {
          smallestArea = areaScore;
          bestNodeAttributes = {
            resourceId: getAttr('resource-id'),
            contentDescription: getAttr('content-desc'),
            text: getAttr('text'),
            className: getAttr('class') || 'android.view.View',
            clickable: isClickable,
            bounds: `[${x1},${y1}][${x2},${y2}]`
          };
        }
      }
    }

    if (!bestNodeAttributes) return null;

    let { resourceId, contentDescription, text, hint, password, className, bounds, focused } = bestNodeAttributes;
    // Some apps expose an empty EditText but render its label as a nearby
    // TextView. Associate the closest label above/overlapping the input.
    if (!resourceId && !contentDescription && !text && !hint && /EditText$/i.test(className || '')) {
      const inputBounds = bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (inputBounds) {
        const [, ix1, iy1, ix2] = inputBounds.map(Number);
        const labels = [];
        const labelRegex = /<node\s+([^>]*)\s+bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"([^>]*)\/?>/g;
        let labelMatch;
        while ((labelMatch = labelRegex.exec(xmlContent)) !== null) {
          const attrs = `${labelMatch[1]} ${labelMatch[6]}`;
          const label = attrs.match(/(?:text|content-desc)="([^"]+)"/)?.[1]?.trim();
          if (!label) continue;
          const lx1 = Number(labelMatch[2]);
          const ly2 = Number(labelMatch[5]);
          const lx2 = Number(labelMatch[4]);
          const overlapsHorizontally = lx2 >= ix1 && lx1 <= ix2;
          const verticalDistance = Number(iy1) - ly2;
          if (overlapsHorizontally && verticalDistance >= -40 && verticalDistance <= 300) {
            labels.push({ label, distance: Math.abs(verticalDistance) });
          }
        }
        labels.sort((a, b) => a.distance - b.distance);
        hint = labels[0]?.label || '';
      }
    }
    const isAndroidSystemSurface = /^android:id\/(?:navigationBarBackground|statusBarBackground|content)$/i.test(resourceId);
    const hasStableSemanticLocator = !!(resourceId || contentDescription || text);
    const isNativeInteractiveControl = /(?:EditText|Button|CheckBox|RadioButton|Switch|Spinner)$/i.test(className || '');
    // Containers, root canvas views and Android system bars are not the
    // control the user intended to tap. Returning null makes the recorder use
    // its coordinate fallback instead of emitting a misleading XPath.
    if (isAndroidSystemSurface || (!hasStableSemanticLocator && !isNativeInteractiveControl)) return null;
    let xpath = '';
    let primaryType = 'xpath';
    let primaryValue = '';
    let playwrightScript = '';

    if (text) {
      primaryType = 'text';
      primaryValue = text;
      xpath = `//*[@text="${text}"]`;
      playwrightScript = `const el = await driver.elementByXPath("//*[@text='${text}']");\nawait el.click();`;
    } else if (contentDescription) {
      primaryType = 'accessibility-id';
      primaryValue = contentDescription;
      xpath = `//*[@content-desc="${contentDescription}"]`;
      playwrightScript = `await driver.elementByAccessibilityId("${contentDescription}").click();`;
    } else if (resourceId) {
      primaryType = 'resource-id';
      primaryValue = resourceId;
      xpath = `//*[@resource-id="${resourceId}"]`;
      playwrightScript = `await driver.elementById("${resourceId}").click();`;
    } else {
      primaryType = 'xpath';
      primaryValue = `//${className}[@bounds='${bounds}']`;
      xpath = primaryValue;
      playwrightScript = `const el = await driver.elementByXPath("${xpath}");\nawait el.click();`;
    }

    return {
      resourceId,
      accessibilityId: contentDescription || undefined,
      contentDescription,
      text,
      hint,
      password,
      className,
      xpath,
      primaryType,
      primaryValue,
      playwrightScript
    };
  } catch (err) {
    console.error('Failed to parse window XML dump:', err.message);
  }
  return null;
}

// Text typed with `adb shell input text` goes to whichever field holds focus, so
// the focused node is the element the step should reference.
async function getFocusedElement(deviceId, preloadedXml) {
  try {
    const xmlContent = preloadedXml || cachedXmlHierarchy.xml || await dumpUiHierarchy(deviceId);
    if (!xmlContent) return null;

    const nodeRegex = /<node\s+([^>]*?)\/?>/g;
    let match;
    while ((match = nodeRegex.exec(xmlContent)) !== null) {
      const attrs = match[1];
      const getAttr = (name) => {
        const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
        return m ? m[1] : '';
      };
      if (getAttr('focused') !== 'true') continue;

      const boundsMatch = getAttr('bounds').match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
      if (!boundsMatch) continue;
      const centerX = Math.round((Number(boundsMatch[1]) + Number(boundsMatch[3])) / 2);
      const centerY = Math.round((Number(boundsMatch[2]) + Number(boundsMatch[4])) / 2);
      return await getElementAtCoordinates(deviceId, centerX, centerY, xmlContent);
    }
  } catch (err) {
    console.error('Failed to resolve the focused element:', err.message);
  }
  return null;
}

// Appium code that drives the element itself rather than raw screen coordinates
function buildAppiumScript(action, locatorAttr, params) {
  const target = locatorAttr && locatorAttr.primaryValue
    ? (locatorAttr.primaryType === 'resource-id'
        ? `driver.elementById(${JSON.stringify(locatorAttr.primaryValue)})`
        : locatorAttr.primaryType === 'accessibility-id'
          ? `driver.elementByAccessibilityId(${JSON.stringify(locatorAttr.primaryValue)})`
          : `driver.elementByXPath(${JSON.stringify(locatorAttr.xpath || locatorAttr.primaryValue)})`)
    : '';

  if (action === 'fill' || action === 'type') {
    return target
      ? `const el = await ${target};\nawait el.clear();\nawait el.sendKeys(${JSON.stringify(params.text || '')});`
      : `await driver.keys(${JSON.stringify(params.text || '')});`;
  }
  if (action === 'press') {
    const keyName = params.key || 'Back';
    return `// Press ${keyName}\nawait driver.pressKeyCode(${keyName === 'Home' ? 3 : keyName === 'Recents' ? 187 : keyName === 'Enter' ? 66 : 4});`;
  }
  if (action === 'swipe' || action === 'scroll') {
    const anchor = target ? `const el = await ${target};\n` : '';
    return `${anchor}await driver.touchPerform([\n  { action: 'press', options: { x: ${params.x1}, y: ${params.y1} } },\n  { action: 'wait', options: { ms: ${params.duration || 300} } },\n  { action: 'moveTo', options: { x: ${params.x2}, y: ${params.y2} } },\n  { action: 'release' }\n]);`;
  }
  if (action === 'long_press') {
    return target
      ? `const el = await ${target};\nawait driver.touchPerform([{ action: 'longPress', options: { element: el.value } }, { action: 'release' }]);`
      : `await driver.touchPerform([{ action: 'longPress', options: { x: ${params.x}, y: ${params.y} } }, { action: 'release' }]);`;
  }
  if (action === 'double_tap') {
    return target
      ? `const el = await ${target};\nawait el.click();\nawait el.click();`
      : `await driver.touchPerform([{ action: 'tap', options: { x: ${params.x}, y: ${params.y}, count: 2 } }]);`;
  }
  // click / tap
  return target
    ? `await (await ${target}).click();`
    : `await driver.touchPerform([{ action: 'tap', options: { x: ${params.x}, y: ${params.y} } }]);`;
}

function postJson(urlStr, data) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const payload = JSON.stringify(data);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch(e) {
            resolve(body);
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.write(payload);
      req.end();
    } catch(err) {
      reject(err);
    }
  });
}

function getJson(urlStr) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: 'GET'
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch(e) {
            resolve(body);
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.end();
    } catch(err) {
      reject(err);
    }
  });
}

let agentRunning = true;
let activeRecordingSession = null;
let lastUploadedFrameTime = 0;
let lastUploadedHierarchyTime = 0;
let touchListenerProcess = null;
let currentListeningDevice = null;
let touchDeviceBounds = { displayWidth: 1080, displayHeight: 2400, touchMaxX: 1080, touchMaxY: 2400 };

async function getDeviceBounds(deviceId) {
  let displayWidth = 1080;
  let displayHeight = 2400;
  let touchMaxX = 1080;
  let touchMaxY = 2400;

  const wmSize = await runCmd(`adb -s ${deviceId} shell wm size`);
  if (wmSize.success && wmSize.stdout) {
    const match = wmSize.stdout.match(/Override size:\s*(\d+)x(\d+)/) || wmSize.stdout.match(/Physical size:\s*(\d+)x(\d+)/);
    if (match) {
      displayWidth = parseInt(match[1], 10);
      displayHeight = parseInt(match[2], 10);
    }
  }

  const geteventP = await runCmd(`adb -s ${deviceId} shell getevent -p`);
  if (geteventP.success && geteventP.stdout) {
    const lines = geteventP.stdout.split('\n');
    for (const l of lines) {
      if (l.includes('0035') || l.includes('ABS_MT_POSITION_X') || l.includes('ABS_X')) {
        const m = l.match(/max\s*(\d+)/i);
        if (m) touchMaxX = parseInt(m[1], 10);
      }
      if (l.includes('0036') || l.includes('ABS_MT_POSITION_Y') || l.includes('ABS_Y')) {
        const m = l.match(/max\s*(\d+)/i);
        if (m) touchMaxY = parseInt(m[1], 10);
      }
    }
  }

  return { displayWidth, displayHeight, touchMaxX, touchMaxY };
}

// Key map for converting ADB hardware input keys into characters
const KEY_MAP = {
  KEY_A: 'a', KEY_B: 'b', KEY_C: 'c', KEY_D: 'd', KEY_E: 'e', KEY_F: 'f', KEY_G: 'g', KEY_H: 'h',
  KEY_I: 'i', KEY_J: 'j', KEY_K: 'k', KEY_L: 'l', KEY_M: 'm', KEY_N: 'n', KEY_O: 'o', KEY_P: 'p',
  KEY_Q: 'q', KEY_R: 'r', KEY_S: 's', KEY_T: 't', KEY_U: 'u', KEY_V: 'v', KEY_W: 'w', KEY_X: 'x',
  KEY_Y: 'y', KEY_Z: 'z',
  KEY_0: '0', KEY_1: '1', KEY_2: '2', KEY_3: '3', KEY_4: '4', KEY_5: '5', KEY_6: '6', KEY_7: '7', KEY_8: '8', KEY_9: '9',
  KEY_SPACE: ' ', KEY_MINUS: '-', KEY_EQUAL: '=', KEY_SLASH: '/', KEY_BACKSLASH: '\\',
  KEY_SEMICOLON: ';', KEY_APOSTROPHE: "'", KEY_GRAVE: '`', KEY_COMMA: ',', KEY_DOT: '.',
  KEY_NUMPAD0: '0', KEY_NUMPAD1: '1', KEY_NUMPAD2: '2', KEY_NUMPAD3: '3', KEY_NUMPAD4: '4',
  KEY_NUMPAD5: '5', KEY_NUMPAD6: '6', KEY_NUMPAD7: '7', KEY_NUMPAD8: '8', KEY_NUMPAD9: '9'
};

let typingBuffer = '';
let typingTimer = null;
let lastFocusedElement = null;
let lastTrackedActivity = '';
let lastForegroundPackage = '';

// The package under test, as reported by the server with each heartbeat
function getTargetPackage() {
  return (activeRecordingSession && (activeRecordingSession.appPackage || activeRecordingSession.packageName)) || '';
}

// Only interactions with the app under test belong in the recording. Without this
// check, tapping through the launcher or any app that happens to come to the
// foreground is captured as a step of the flow.
function isTargetInForeground() {
  const target = getTargetPackage();
  if (!target || !lastForegroundPackage) return true;
  return lastForegroundPackage === target;
}

function skipForegroundMismatch(what) {
  console.log(`[Recorder] Ignoring ${what}: "${lastForegroundPackage}" is in the foreground, not the app under test "${getTargetPackage()}".`);
}

function flushTypingBuffer(deviceId) {
  if (!typingBuffer) return;
  const typedText = typingBuffer;
  typingBuffer = '';

  const stepPayload = {
    email: userEmail,
    event: {
      id: Math.random().toString(36).substring(7),
      action: 'fill',
      value: typedText,
      elementName: lastFocusedElement?.text || lastFocusedElement?.resourceId || `Input text: "${typedText}"`,
      locator: {
        primary: {
          type: lastFocusedElement?.primaryType || 'xpath',
          value: lastFocusedElement?.primaryValue || lastFocusedElement?.xpath || `//android.widget.EditText`,
          playwright: lastFocusedElement?.resourceId
            ? `await driver.elementById("${lastFocusedElement.resourceId}").sendKeys("${typedText}");`
            : `await driver.elementByXPath("//android.widget.EditText").sendKeys("${typedText}");`
        },
        alternatives: [
          lastFocusedElement?.resourceId ? { type: 'resource-id', value: lastFocusedElement.resourceId } : null,
          lastFocusedElement?.xpath ? { type: 'xpath', value: lastFocusedElement.xpath } : null
        ].filter(Boolean)
      },
      screen: lastTrackedActivity || "ActiveScreen",
      platform: 'mobile',
      timestamp: Date.now()
    }
  };

  console.log(`🟢 [ADB Recorded Step] Action: TYPE/FILL "${typedText}"`);
  postJson(`${serverUrl}/api/device-agent/record-event`, stepPayload).catch(() => {});
  postJson(`${serverUrl}/api/mobile/agent/record-event`, stepPayload).catch(() => {});
  postJson(`${serverUrl}/api/device-agent/upload-logs`, {
    email: userEmail,
    log: `[ADB Step Captured] TYPE "${typedText}" into input element`,
    type: 'info',
    url: 'ADB'
  }).catch(() => {});
}

async function startAdbTouchListener(deviceId) {
  if (currentListeningDevice === deviceId && touchListenerProcess) return;

  if (touchListenerProcess) {
    try { touchListenerProcess.kill(); } catch (e) {}
    touchListenerProcess = null;
  }

  currentListeningDevice = deviceId;
  touchDeviceBounds = await getDeviceBounds(deviceId);
  console.log(`[ADB Sniffer] 🟢 Active on ${deviceId} (Screen: ${touchDeviceBounds.displayWidth}x${touchDeviceBounds.displayHeight}, TouchMax: ${touchDeviceBounds.touchMaxX}x${touchDeviceBounds.touchMaxY})`);

  let lastSeenRawX = null;
  let lastSeenRawY = null;
  let currentRawX = null;
  let currentRawY = null;
  let isTouching = false;
  let lastRecordedTime = 0;
  let elementAtTouchStart = null;

  try {
    touchListenerProcess = spawn('adb', ['-s', deviceId, 'shell', 'getevent', '-l']);
    let buffer = '';

    touchListenerProcess.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;

        // Parse only absolute X axis events. Event value/code 0000 is also
        // used by EV_SYN and was incorrectly turning every recorded X into 0.
        if (line.includes('ABS_MT_POSITION_X') || /\bABS_X\b/.test(line) || /\b0035\b/.test(line)) {
          const parts = line.trim().split(/\s+/);
          const hexVal = parts[parts.length - 1];
          const val = parseInt(hexVal, 16);
          if (!isNaN(val)) {
            currentRawX = val;
            lastSeenRawX = val;
            if (currentRawX > touchDeviceBounds.touchMaxX && touchDeviceBounds.touchMaxX <= touchDeviceBounds.displayWidth) {
              touchDeviceBounds.touchMaxX = Math.max(32767, currentRawX);
            }
          }
        }
        // Parse only absolute Y axis events; 0001 is not a safe Y identifier.
        else if (line.includes('ABS_MT_POSITION_Y') || /\bABS_Y\b/.test(line) || /\b0036\b/.test(line)) {
          const parts = line.trim().split(/\s+/);
          const hexVal = parts[parts.length - 1];
          const val = parseInt(hexVal, 16);
          if (!isNaN(val)) {
            currentRawY = val;
            lastSeenRawY = val;
            if (currentRawY > touchDeviceBounds.touchMaxY && touchDeviceBounds.touchMaxY <= touchDeviceBounds.displayHeight) {
              touchDeviceBounds.touchMaxY = Math.max(32767, currentRawY);
            }
            if (isTouching && !elementAtTouchStart && currentRawX !== null) {
              const screenX = touchDeviceBounds.touchMaxX > touchDeviceBounds.displayWidth
                ? Math.round((currentRawX / touchDeviceBounds.touchMaxX) * touchDeviceBounds.displayWidth)
                : currentRawX;
              const screenY = touchDeviceBounds.touchMaxY > touchDeviceBounds.displayHeight
                ? Math.round((currentRawY / touchDeviceBounds.touchMaxY) * touchDeviceBounds.displayHeight)
                : currentRawY;
              elementAtTouchStart = getElementAtCoordinates(deviceId, screenX, screenY, true);
            }
          }
        }
        // Many Android touch drivers report tracking IDs without BTN_TOUCH.
        else if ((line.includes('ABS_MT_TRACKING_ID') || line.includes('0039 ')) && !line.includes('ffffffff')) {
          isTouching = true;
        }
        // Touch / Mouse Down
        else if ((line.includes('BTN_TOUCH') || line.includes('BTN_LEFT') || line.includes('BTN_MOUSE')) && line.includes('DOWN')) {
          isTouching = true;
          const rawX = currentRawX !== null ? currentRawX : lastSeenRawX;
          const rawY = currentRawY !== null ? currentRawY : lastSeenRawY;
          if (rawX !== null && rawY !== null) {
            const screenX = touchDeviceBounds.touchMaxX > touchDeviceBounds.displayWidth
              ? Math.round((rawX / touchDeviceBounds.touchMaxX) * touchDeviceBounds.displayWidth)
              : rawX;
            const screenY = touchDeviceBounds.touchMaxY > touchDeviceBounds.displayHeight
              ? Math.round((rawY / touchDeviceBounds.touchMaxY) * touchDeviceBounds.displayHeight)
              : rawY;
            // Start Appium/UIAutomator inspection before the tap can navigate
            // away from the element that the user actually touched.
            elementAtTouchStart = getElementAtCoordinates(deviceId, screenX, screenY, true);
          }
        }
        // Touch / Mouse Up or Release
        else if (
          ((line.includes('BTN_TOUCH') || line.includes('BTN_LEFT') || line.includes('BTN_MOUSE')) && line.includes('UP')) ||
          (line.includes('ABS_MT_TRACKING_ID') && line.includes('ffffffff')) ||
          (line.includes('0039') && line.includes('ffffffff'))
        ) {
          const targetX = currentRawX !== null ? currentRawX : lastSeenRawX;
          const targetY = currentRawY !== null ? currentRawY : lastSeenRawY;

          if (isTouching || (targetX !== null && targetY !== null)) {
            isTouching = false;
            const now = Date.now();
            if (now - lastRecordedTime > 300) {
              lastRecordedTime = now;
              currentRawX = null;
              currentRawY = null;

              if (targetX !== null && targetY !== null) {
                // Scale coordinates accurately to screen display pixels
                let screenX = targetX;
                let screenY = targetY;
                if (touchDeviceBounds.touchMaxX > touchDeviceBounds.displayWidth) {
                  screenX = Math.round((targetX / touchDeviceBounds.touchMaxX) * touchDeviceBounds.displayWidth);
                }
                if (touchDeviceBounds.touchMaxY > touchDeviceBounds.displayHeight) {
                  screenY = Math.round((targetY / touchDeviceBounds.touchMaxY) * touchDeviceBounds.displayHeight);
                }

                // Clamp to screen bounds
                screenX = Math.max(0, Math.min(touchDeviceBounds.displayWidth, screenX));
                screenY = Math.max(0, Math.min(touchDeviceBounds.displayHeight, screenY));

                const capturedElement = elementAtTouchStart;
                elementAtTouchStart = null;
                handlePhysicalEmulatorTap(deviceId, screenX, screenY, capturedElement);
              }
            }
          }
        }
        // Handle Back button keypress
        else if (line.includes('KEY_BACK') && line.includes('UP')) {
          handleHardwareKeyPress(deviceId, 'Back', 4);
        }
        // Handle Home button keypress
        else if ((line.includes('KEY_HOMEPAGE') || line.includes('KEY_HOME')) && line.includes('UP')) {
          handleHardwareKeyPress(deviceId, 'Home', 3);
        }
        // Handle App Switch button keypress
        else if ((line.includes('KEY_APPSELECT') || line.includes('KEY_MENU')) && line.includes('UP')) {
          handleHardwareKeyPress(deviceId, 'AppSwitch', 187);
        }
        // Handle Hardware Keystroke for typing
        else if (line.includes('EV_KEY') && line.includes('UP')) {
          const matchKey = line.match(/KEY_[A-Z0-9_]+/);
          if (matchKey) {
            const keyName = matchKey[0];
            if (keyName === 'KEY_ENTER') {
              flushTypingBuffer(deviceId);
            } else if (keyName === 'KEY_BACKSPACE') {
              typingBuffer = typingBuffer.slice(0, -1);
            } else if (KEY_MAP[keyName]) {
              typingBuffer += KEY_MAP[keyName];
              if (typingTimer) clearTimeout(typingTimer);
              typingTimer = setTimeout(() => {
                flushTypingBuffer(deviceId);
              }, 600);
            }
          }
        }
      }
    });

    touchListenerProcess.on('exit', () => {
      touchListenerProcess = null;
      currentListeningDevice = null;
    });
  } catch (err) {
    console.warn('[ADB Sniffer] Could not start getevent listener:', err.message);
  }
}

async function handleHardwareKeyPress(deviceId, keyName, keycode) {
  try {
    // Home and App Switch leave the app under test, so the press itself is only
    // a step when it happened while that app was in front.
    if (!isTargetInForeground()) {
      skipForegroundMismatch(`hardware key "${keyName}"`);
      return;
    }
    const stepPayload = {
      email: userEmail,
      event: {
        id: Math.random().toString(36).substring(7),
        action: 'press',
        value: keyName,
        elementName: `Hardware Key: ${keyName}`,
        locator: {
          primary: {
            type: 'key',
            value: keyName,
            playwright: `await driver.pressKeyCode(${keycode});`
          },
          alternatives: []
        },
        screen: "ActiveScreen",
        platform: 'mobile',
        timestamp: Date.now()
      }
    };

    console.log(`[ADB Key Event Captured] "${keyName}" on ${deviceId}`);
    await postJson(`${serverUrl}/api/device-agent/record-event`, stepPayload);
    await postJson(`${serverUrl}/api/device-agent/upload-logs`, {
      email: userEmail,
      log: `[ADB Key Event] Pressed '${keyName}' on ${deviceId}`,
      type: 'info',
      url: 'ADB'
    });
  } catch (err) {
    console.error('Failed to handle key press:', err.message);
  }
}

async function handlePhysicalEmulatorTap(deviceId, x, y, elementPromise) {
  try {
    if (!isTargetInForeground()) {
      skipForegroundMismatch(`physical tap at (${x}, ${y})`);
      return;
    }
    console.log(`[ADB Tap Event] Detected physical tap at coordinates (${x}, ${y}) on ${deviceId}`);
    const locatorAttr = await getElementAtCoordinates(deviceId, x, y);

    const labelName = getAndroidElementName(locatorAttr) || `Unlabelled Android element`;
    const playwrightCode = locatorAttr?.playwrightScript || `await driver.touchPerform([{ action: 'tap', options: { x: ${x}, y: ${y} } }]);`;

    const stepPayload = {
      email: userEmail,
      event: {
        id: Math.random().toString(36).substring(7),
        action: 'click',
        value: undefined,
        elementName: labelName,
        locator: {
          primary: {
            type: locatorAttr?.primaryType || 'coordinates',
            value: locatorAttr?.primaryValue || locatorAttr?.xpath || JSON.stringify({ x, y, unit: 'pixels' }),
            playwright: playwrightCode
          },
          alternatives: [
            locatorAttr?.text ? { type: 'text', value: locatorAttr.text } : null,
            locatorAttr?.accessibilityId ? { type: 'accessibility-id', value: locatorAttr.accessibilityId } : null,
            locatorAttr?.resourceId ? { type: 'resource-id', value: locatorAttr.resourceId } : null,
            locatorAttr?.xpath ? { type: 'xpath', value: locatorAttr.xpath } : null,
            { type: 'coordinates', value: JSON.stringify({ x, y, unit: 'pixels' }) }
          ].filter(Boolean)
        },
        screen: "ActiveScreen",
        platform: 'mobile',
        coordinates: { x, y },
        x,
        y,
        bounds: locatorAttr?.bounds,
        timestamp: Date.now()
      }
    };

    console.log(`🟢 [ADB Recorded Step] Action: CLICK on "${labelName}"`);

    // Post to both endpoints for instant UI synchronization
    await postJson(`${serverUrl}/api/device-agent/record-event`, stepPayload).catch(() => {});
    await postJson(`${serverUrl}/api/mobile/agent/record-event`, stepPayload).catch(() => {});

    // Upload live log to browser console
    await postJson(`${serverUrl}/api/device-agent/upload-logs`, {
      email: userEmail,
      log: `[ADB Step Captured] CLICK on "${labelName}" at (${x}, ${y})`,
      type: 'info',
      url: 'ADB'
    }).catch(() => {});

  } catch (err) {
    console.error('Failed to handle physical tap:', err.message);
  }
}

function getAndroidElementName(locatorAttr) {
  if (!locatorAttr) return '';
  const className = String(locatorAttr.className || '').split('.').pop();
  const identity = `${locatorAttr.resourceId || ''} ${locatorAttr.hint || ''} ${locatorAttr.contentDescription || ''}`;
  if (/EditText/i.test(className)) {
    if (locatorAttr.password || /pass(?:word|code)|pin/i.test(identity)) return 'Password field';
    if (/email/i.test(identity)) return 'Email field';
    if (/user(?:name)?/i.test(identity)) return 'Username field';
    if (locatorAttr.hint) return `${locatorAttr.hint} field`;
    return 'Text field';
  }
  const semanticName = locatorAttr.contentDescription || locatorAttr.accessibilityId || locatorAttr.text;
  if (semanticName && /[a-z0-9]{2}/i.test(String(semanticName))) return String(semanticName).trim();
  if (locatorAttr.resourceId) {
    const id = String(locatorAttr.resourceId).split(/[:/]id\//).pop() || String(locatorAttr.resourceId);
    const words = id
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/^(?:btn|button|toolbar|nav|navigation)\s+/i, '')
      .trim();
    if (/arrow\s*back|back\s*arrow|navigate\s*up/i.test(words)) return 'Back button';
    if (/profile|account|avatar/i.test(words)) return 'Profile button';
    if (/^(?:container|content|root|layout|view|wrapper|item|row|column|frame|screen)$/i.test(words)) return '';
    const title = words.replace(/\b\w/g, c => c.toUpperCase());
    return /Button$/i.test(className) && !/\bbutton$/i.test(title) ? `${title} button` : title;
  }
  if (/Button/i.test(className)) return 'Button';
  return className && className !== 'View' ? className.replace(/([a-z])([A-Z])/g, '$1 $2') : '';
}

async function startHeartbeat() {
  while (agentRunning) {
    try {
      const devices = await scanDevices();
      const payload = {
        email: userEmail,
        devices,
        agentPort: port,
        status: 'Active',
        timestamp: Date.now()
      };

      const res = await postJson(`${serverUrl}/api/mobile/agent/register`, payload);

      if (res && res.recording) {
        activeRecordingSession = res.recording;
      }
    } catch (e) {
      console.warn(`Connection to AutomatiQA Cloud failed: ${e.message}. Retrying...`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

let lastActivityCheckTime = 0;
let lastHierarchyRefreshTime = 0;

async function startStreamingAndCommandPolling() {
  while (agentRunning) {
    try {
      const devices = await scanDevices();
      if (devices.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      const deviceId = devices[0].deviceId;

      // Start hardware event listener for physical emulator touches
      startAdbTouchListener(deviceId);

      // 1. Continuously capture & stream screenshots to AutomatiQA backend
      const now = Date.now();
      // Keep a recent pre-interaction DOM snapshot. A hierarchy request begun
      // on touch-down can otherwise finish after a button mutates its label.
      if (now - lastHierarchyRefreshTime >= 1200) {
        lastHierarchyRefreshTime = now;
        refreshCachedXmlHierarchy(deviceId).catch(() => '');
      }
      if (now - lastUploadedFrameTime >= 400) {
        const frame = await captureScreenshot(deviceId);
        if (frame) {
          await postJson(`${serverUrl}/api/device-agent/upload-frame`, {
            email: userEmail,
            frame
          }).catch(() => {});
          lastUploadedFrameTime = now;
        }
      }

      // 1b. Stream the real UIAutomator hierarchy so the recorder can resolve
      // taps to actual app nodes instead of raw screen coordinates.
      if (now - lastUploadedHierarchyTime >= 1500) {
        lastUploadedHierarchyTime = now;
        const xml = await dumpUiHierarchy(deviceId).catch(() => '');
        if (xml) {
          await postJson(`${serverUrl}/api/device-agent/upload-hierarchy`, {
            email: userEmail,
            xml,
            deviceId
          }).catch(() => {});
        }
      }

      // 2. Track screen navigation / Activity changes
      if (now - lastActivityCheckTime >= 1200) {
        lastActivityCheckTime = now;
        const winFocus = await runCmd(`adb -s ${deviceId} shell "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp' | head -n 1"`);
        if (winFocus.success && winFocus.stdout) {
          const actMatch = winFocus.stdout.match(/([a-zA-Z0-9_\.]+\/[a-zA-Z0-9_\.]+)/);
          if (actMatch) {
            const currentAct = actMatch[1];
            lastForegroundPackage = currentAct.split('/')[0];
            const target = getTargetPackage();
            // A transition into the launcher or an unrelated app is not a step of
            // this flow, so track it but do not record it.
            const isTargetScreen = !target || lastForegroundPackage === target;
            if (lastTrackedActivity && lastTrackedActivity !== currentAct && isTargetScreen) {
              console.log(`🟢 [ADB Navigation Captured] Screen transition to: ${currentAct}`);
              const screenName = currentAct.split('/')[1] || currentAct;
              const navPayload = {
                email: userEmail,
                event: {
                  id: Math.random().toString(36).substring(7),
                  action: 'navigate',
                  value: currentAct,
                  elementName: `Screen: ${screenName}`,
                  locator: {
                    primary: {
                      type: 'activity',
                      value: currentAct,
                      playwright: `await driver.startActivity("${currentAct.split('/')[0]}", "${currentAct.split('/')[1]}");`
                    },
                    alternatives: []
                  },
                  screen: screenName,
                  platform: 'mobile',
                  timestamp: Date.now()
                }
              };
              postJson(`${serverUrl}/api/device-agent/record-event`, navPayload).catch(() => {});
              postJson(`${serverUrl}/api/mobile/agent/record-event`, navPayload).catch(() => {});
            }
            lastTrackedActivity = currentAct;
          }
        }
      }

      // 2. Poll for pending interactive user commands from AutomatiQA UI
      const actionRes = await getJson(`${serverUrl}/api/device-agent/pending-actions?email=${encodeURIComponent(userEmail)}`);
      if (actionRes && actionRes.actions && actionRes.actions.length > 0) {
        for (const item of actionRes.actions) {
          const { action, params } = item;
          const actionDeviceId = params.deviceId || deviceId;
          console.log(`Executing Action on Device ${actionDeviceId}: ${action}`, params);

          let cmd = '';
          let locatorAttr = null;

          if (action === 'click' || action === 'tap' || action === 'double_tap' || action === 'long_press') {
            cmd = `adb -s ${actionDeviceId} shell input tap ${params.x} ${params.y}`;
            if (action === 'double_tap') {
              cmd += ` && sleep 0.1 && adb -s ${actionDeviceId} shell input tap ${params.x} ${params.y}`;
            } else if (action === 'long_press') {
              cmd = `adb -s ${actionDeviceId} shell input swipe ${params.x} ${params.y} ${params.x} ${params.y} 1000`;
            }
            // Execute live taps immediately. A UIAutomator dump can take
            // multiple seconds and must not block the device interaction.
            locatorPromise = getElementAtCoordinates(actionDeviceId, params.x, params.y);
          } else if (action === 'type' || action === 'fill') {
            const escaped = (params.text || '').replace(/ /g, '%s');
            cmd = `adb -s ${actionDeviceId} shell input text "${escaped}"`;
            // Text lands in the focused field, so that node identifies the step
            const preXml = await getHierarchyBeforeGesture(actionDeviceId);
            locatorAttr = await getFocusedElement(actionDeviceId, preXml).catch(() => null);
          } else if (action === 'clear') {
            cmd = `adb -s ${actionDeviceId} shell input keyevent 67`.repeat(25).replace(/adb/g, '&& adb').substring(3);
          } else if (action === 'swipe' || action === 'scroll') {
            cmd = `adb -s ${actionDeviceId} shell input swipe ${params.x1} ${params.y1} ${params.x2} ${params.y2} ${params.duration || 300}`;
            // Anchor the gesture to the element it started on
            const preXml = await getHierarchyBeforeGesture(actionDeviceId);
            locatorAttr = await getElementAtCoordinates(actionDeviceId, params.x1, params.y1, preXml).catch(() => null);
          } else if (action === 'press') {
            let keycode = 4; // Back default
            if (params.key === 'Home') keycode = 3;
            else if (params.key === 'Recents') keycode = 187;
            else if (params.key === 'VolumeUp') keycode = 24;
            else if (params.key === 'VolumeDown') keycode = 25;
            else if (params.key === 'Power') keycode = 26;
            else if (params.key === 'Enter') keycode = 66;
            cmd = `adb -s ${actionDeviceId} shell input keyevent ${keycode}`;
          } else if (action === 'launch' || action === 'launch_app' || action === 'open_app') {
            const pkg = params.packageName || 'com.machaxi.app';
            const targetDev = (params.deviceId && !params.deviceId.includes(' ') && params.deviceId.length < 30) ? params.deviceId : deviceId;
            console.log(`[ADB Agent] Launching package "${pkg}" on target ADB device "${targetDev}"...`);

            // Wake up screen & dismiss keyguard lock
            await runCmd(`adb -s ${targetDev} shell input keyevent 224`);
            await runCmd(`adb -s ${targetDev} shell wm dismiss-keyguard`);

            // Check if package is installed first
            const pkgCheck = await runCmd(`adb -s ${targetDev} shell pm list packages ${pkg}`);
            const isInstalled = pkgCheck.stdout && pkgCheck.stdout.includes(pkg);

            if (!isInstalled) {
              const msg = `[ADB Warning] Package "${pkg}" is not installed on device ${targetDev}.`;
              console.warn(msg);
              await postJson(`${serverUrl}/api/device-agent/upload-logs`, {
                email: userEmail,
                log: msg,
                type: 'warn',
                url: 'ADB'
              }).catch(() => {});
            } else {
              // Primary: Monkey launcher (resolves default activity automatically)
              let launchRes = await runCmd(`adb -s ${targetDev} shell monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`);

              if (!launchRes.success || (launchRes.stdout && launchRes.stdout.includes('No activities found'))) {
                const act = params.launchActivity || '.MainActivity';
                launchRes = await runCmd(`adb -s ${targetDev} shell am start -n ${pkg}/${act}`);
                if (!launchRes.success || (launchRes.stderr && launchRes.stderr.includes('Error'))) {
                  await runCmd(`adb -s ${targetDev} shell am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER ${pkg}`);
                }
              }

              console.log(`[ADB Agent] App launch command executed for ${pkg}`);
              await postJson(`${serverUrl}/api/device-agent/upload-logs`, {
                email: userEmail,
                log: `[ADB] Launched application "${pkg}" on device ${targetDev}`,
                type: 'info',
                url: 'ADB'
              }).catch(() => {});
            }
            cmd = '';
          }

          if (cmd) {
            if (locatorPromise) {
              locatorAttr = await locatorPromise.catch(() => null);
            }
            await runCmd(cmd);

            // Resolve the node after the ADB command has already been sent. The
            // promise started before the tap, so it describes the tapped screen.
            if (locatorPromise) {
              locatorAttr = await locatorPromise.catch(() => null);
            }

            await postJson(`${serverUrl}/api/device-agent/upload-logs`, {
              email: userEmail,
              log: `[ADB] Executed ${action.toUpperCase()} on target device ${actionDeviceId}`,
              type: 'info',
              url: 'ADB'
            }).catch(() => {});

            const labelName = getAndroidElementName(locatorAttr) || 'Screen position';
            const stepPayload = {
              email: userEmail,
              event: {
                id: Math.random().toString(36).substring(7),
                action: action === 'type' ? 'fill' : action,
                value: params.text || params.key || (action === 'swipe' ? 'Swipe Gesture' : undefined),
                elementName: labelName,
                locator: {
                  primary: {
                    type: locatorAttr?.primaryType || 'xpath',
                    value: locatorAttr?.primaryValue || locatorAttr?.xpath || `//android.view.View`,
                    playwright: locatorAttr?.playwrightScript || ((action === 'click' || action === 'tap')
                      ? `await driver.touchPerform([{ action: 'tap', options: { x: ${params.x}, y: ${params.y} } }]);`
                      : action === 'fill' || action === 'type'
                        ? `await driver.keys("${params.text || ''}");`
                        : `await driver.pressKeyCode(4);`)
                  },
                  alternatives: [
                    locatorAttr?.text ? { type: 'text', value: locatorAttr.text } : null,
                    locatorAttr?.accessibilityId ? { type: 'accessibility-id', value: locatorAttr.accessibilityId } : null,
                    locatorAttr?.resourceId ? { type: 'resource-id', value: locatorAttr.resourceId } : null,
                    locatorAttr?.xpath ? { type: 'xpath', value: locatorAttr.xpath } : null,
                    params.x !== undefined && params.y !== undefined
                      ? { type: 'coordinates', value: JSON.stringify({ x: params.x, y: params.y, unit: 'pixels' }) }
                      : null
                  ].filter(Boolean)
                },
                // Records whether this step points at a real node from the app's
                // UI hierarchy, or only at screen coordinates
                resolvedFromHierarchy: !!locatorAttr,
                className: locatorAttr?.className,
                screen: "ActiveScreen",
                platform: 'mobile',
                x: params.x,
                y: params.y,
                timestamp: Date.now()
              }
            };

            await postJson(`${serverUrl}/api/device-agent/record-event`, stepPayload).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn(`[Stream/Polling Error] ${err.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

// Start local HTTP server on port 9334 for direct browser requests
function startLocalHttpDaemon() {
  const localServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      return res.end();
    }

    const parsedUrl = new URL(req.url, 'http://localhost:9334');

    if (parsedUrl.pathname === '/status') {
      const devices = await scanDevices();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ running: true, port: 9334, devices, email: userEmail }));
    }

    if (parsedUrl.pathname === '/devices') {
      const devices = await scanDevices();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(devices.map(d => ({
        id: d.deviceId,
        name: d.deviceName,
        androidVersion: d.version,
        status: d.status,
        type: d.type
      }))));
    }

    if (parsedUrl.pathname === '/installed-apps') {
      const devId = parsedUrl.searchParams.get('deviceId') || 'emulator-5554';
      const pkgCmd = await runCmd(`adb -s ${devId} shell pm list packages -3`);
      const pkgs = [];
      if (pkgCmd.success && pkgCmd.stdout) {
        const lines = pkgCmd.stdout.split('\n');
        for (const l of lines) {
          const clean = l.replace('package:', '').trim();
          if (clean) {
            const parts = clean.split('.');
            const name = parts[parts.length - 1];
            pkgs.push({
              name: name.charAt(0).toUpperCase() + name.slice(1),
              package: clean
            });
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(pkgs));
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  localServer.listen(9334, () => {
    console.log('🟢 [Local Daemon] Running on http://localhost:9334');
  });

  localServer.on('error', (e) => {
    console.log(`[Local Daemon Note] Port 9334 in use or unavailable: ${e.message}`);
  });
}

async function main() {
  await checkAdb();
  startLocalHttpDaemon();
  startHeartbeat();
  startStreamingAndCommandPolling();
  console.log('AutomatiQA Device Agent initialized and listening for hardware interactions.');
}

main();
