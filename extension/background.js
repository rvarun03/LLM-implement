/**
 * QA Recorder - Background Service Worker
 *
 * Responsibilities:
 * - Maintain WebSocket connection with recorder backend (dynamic ws/wss host)
 * - Receive recording commands from AutomatiQA backend and web app bridge
 * - Forward recorded steps from content.js with WebSocket and HTTP POST fallback
 * - Persist recording state and active sessionId in chrome.storage.local
 * - Broadcast recording state to newly navigated, redirected, or reloaded tabs
 * - Track tab navigation and SPA route transitions
 */

/*
 * There is deliberately NO default backend URL.
 *
 * A hardcoded ws://localhost:3000 default only ever works on the machine that
 * runs the recorder server locally. On every other machine it produces an
 * endless ERR_CONNECTION_REFUSED reconnect loop from the moment the extension
 * is installed, and it masks the real address. The extension stays unconfigured
 * until an AutomatiQA tab tells it where its backend lives.
 */
const DEFAULT_BACKEND_URL = null;

function deriveHttpUrl(wsUrl) {
  try {
    const parsed = new URL(wsUrl);
    const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${parsed.host}`;
  } catch (e) {
    return null;
  }
}

// ============================================================
// STATE
// ============================================================

let socket = null;
let isRecording = false;
let currentSessionId = null;
let backendUrl = DEFAULT_BACKEND_URL;
let httpUrl = deriveHttpUrl(DEFAULT_BACKEND_URL);
let reconnectTimer = null;
let isConnecting = false;
let hasLoggedUnconfigured = false;
const pendingStepQueue = [];
let lastRecordedNavigation = { url: '', time: 0 };

// 'backend' = stream steps to the recorder server over WS/HTTP (localhost dev,
// self-hosted deployment). 'direct' = no server is reachable from the page
// (Google AI Studio preview and other static hosts), so steps are relayed
// straight back into the AutomatiQA UI tab.
let transportMode = 'backend';
// Tab that hosts the AutomatiQA UI; steps are mirrored there in every mode.
let appTabId = null;

// ============================================================
// URL VALIDATION
// ============================================================

function isValidWebSocketUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch (error) {
    return false;
  }
}

/*
 * A stored ws://localhost URL is almost always the leftover hardcoded default
 * from an older build, not a deliberate choice. Discard it on startup: an
 * AutomatiQA tab re-announces the correct address on every page load, including
 * localhost for developers who really do run the server locally.
 */
function isStaleLocalhostUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch (e) {
    return false;
  }
}

// ============================================================
// LOAD PERSISTED STATE
// ============================================================

chrome.storage.local.get(
  ['backendUrl', 'httpUrl', 'isRecording', 'currentSessionId', 'transportMode', 'appTabId'],
  (result) => {
    transportMode = result.transportMode === 'direct' ? 'direct' : 'backend';
    appTabId = typeof result.appTabId === 'number' ? result.appTabId : null;
    if (
      result.backendUrl &&
      isValidWebSocketUrl(result.backendUrl) &&
      !isStaleLocalhostUrl(result.backendUrl)
    ) {
      backendUrl = result.backendUrl;
      httpUrl = result.httpUrl || deriveHttpUrl(backendUrl);
    } else {
      // Unconfigured: stay idle until an AutomatiQA tab announces its origin.
      backendUrl = DEFAULT_BACKEND_URL;
      httpUrl = null;
      chrome.storage.local.remove(['backendUrl', 'httpUrl']);
    }

    isRecording = Boolean(result.isRecording);
    currentSessionId = result.currentSessionId || null;

    console.log('[QA Recorder BG] Initialized with state:', {
      backendUrl,
      httpUrl,
      isRecording,
      currentSessionId,
      transportMode
    });

    connectSocket();
  }
);

// Listen to external storage updates if any
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.isRecording !== undefined) {
      isRecording = Boolean(changes.isRecording.newValue);
    }
    if (changes.currentSessionId !== undefined) {
      currentSessionId = changes.currentSessionId.newValue || null;
    }
    if (changes.backendUrl !== undefined && changes.backendUrl.newValue) {
      backendUrl = changes.backendUrl.newValue;
      httpUrl = deriveHttpUrl(backendUrl);
    }
    if (changes.httpUrl !== undefined && changes.httpUrl.newValue) {
      httpUrl = changes.httpUrl.newValue;
    }
    if (changes.transportMode !== undefined && changes.transportMode.newValue) {
      transportMode = changes.transportMode.newValue === 'direct' ? 'direct' : 'backend';
    }
    if (changes.appTabId !== undefined) {
      appTabId = typeof changes.appTabId.newValue === 'number' ? changes.appTabId.newValue : null;
    }
  }
});

// ============================================================
// BROADCAST RECORDING STATE TO TABS
// ============================================================

function broadcastRecordingStateToTabs(recording, sessionId) {
  try {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return;
      for (const tab of tabs) {
        if (
          tab.id &&
          tab.url &&
          !tab.url.startsWith('chrome://') &&
          !tab.url.startsWith('devtools://') &&
          !tab.url.startsWith('chrome-extension://')
        ) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'RECORDING_STATE',
            isRecording: recording,
            sessionId: sessionId
          }).catch(() => {
            // Tab might not have content script running yet
          });
        }
      }
    });
  } catch (e) {
    console.warn('[QA Recorder BG] Error broadcasting state to tabs:', e);
  }
}

// ============================================================
// WEBSOCKET CONNECTION
// ============================================================

function connectSocket() {
  // In direct mode there is no recorder server to talk to; trying to reach
  // ws://localhost:3000 from a cloud-hosted app only produces console noise.
  if (transportMode === 'direct') {
    return;
  }

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  if (!backendUrl) {
    if (!hasLoggedUnconfigured) {
      hasLoggedUnconfigured = true;
      console.log(
        '[QA Recorder BG] No backend configured yet. Open (or reload) an AutomatiQA tab - ' +
          'it announces its own origin to the extension automatically.'
      );
    }
    return;
  }
  hasLoggedUnconfigured = false;

  if (!isValidWebSocketUrl(backendUrl)) {
    console.error('[QA Recorder BG] Invalid backend URL:', backendUrl);
    return;
  }

  console.log('[QA Recorder BG] Connecting to recorder backend:', backendUrl);
  isConnecting = true;

  try {
    socket = new WebSocket(backendUrl);
  } catch (error) {
    console.error('[QA Recorder BG] Failed to create WebSocket:', error);
    isConnecting = false;
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    isConnecting = false;
    console.log('[QA Recorder BG] Connected to recorder backend:', backendUrl);

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Handshake with backend to announce active session if present
    if (currentSessionId) {
      try {
        socket.send(
          JSON.stringify({
            type: 'RECORDER_CONNECTED',
            sessionId: currentSessionId
          })
        );
      } catch (err) {
        console.error('[QA Recorder BG] Failed to send connection handshake:', err);
      }
    }

    // Flush any pending steps that arrived while disconnected
    flushPendingSteps();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[QA Recorder BG] Received backend message:', data);

      if (data.type === 'START_RECORDING') {
        isRecording = true;
        currentSessionId = data.sessionId || `session-${Date.now()}`;

        chrome.storage.local.set({
          isRecording: true,
          currentSessionId
        });

        console.log('[QA Recorder BG] Recording started:', currentSessionId);
        broadcastRecordingStateToTabs(true, currentSessionId);
      } else if (data.type === 'STOP_RECORDING') {
        isRecording = false;
        currentSessionId = null;

        chrome.storage.local.set({
          isRecording: false,
          currentSessionId: null
        });

        console.log('[QA Recorder BG] Recording stopped');
        broadcastRecordingStateToTabs(false, null);
      }
    } catch (err) {
      console.error('[QA Recorder BG] Error processing backend message:', err);
    }
  };

  socket.onclose = (event) => {
    isConnecting = false;
    console.warn('[QA Recorder BG] WebSocket closed:', {
      code: event.code,
      reason: event.reason,
      backendUrl
    });
    socket = null;
    scheduleReconnect();
  };

  socket.onerror = (err) => {
    console.warn('[QA Recorder BG] WebSocket error, fallback to HTTP available:', err);
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  if (!backendUrl || transportMode === 'direct') return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectSocket();
  }, 3000);
}

// ============================================================
// STEP TRANSMISSION (WEBSOCKET + HTTP FALLBACK)
// ============================================================

function deliverStepToApp(payload) {
  if (appTabId === null) return;
  try {
    chrome.tabs
      .sendMessage(appTabId, { type: 'DELIVER_STEP', payload })
      .catch(() => {
        // App tab closed or content script not injected yet.
      });
  } catch (e) {
    // no-op
  }
}

function sendStepToBackend(payload) {
  // Ensure session ID is attached
  if (!payload.sessionId && currentSessionId) {
    payload.sessionId = currentSessionId;
  }

  // Always mirror the step into the AutomatiQA UI tab so the steps list fills
  // in live even when the recorder server is unreachable.
  deliverStepToApp(payload);

  if (transportMode === 'direct') {
    console.log('[QA Recorder BG] Step delivered directly to app tab:', payload.action, payload.url);
    return;
  }

  let sentViaWs = false;

  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'STEP', payload }));
      console.log('[QA Recorder BG] Step sent via WebSocket:', payload.action, payload.url);
      sentViaWs = true;
    } catch (err) {
      console.warn('[QA Recorder BG] WebSocket send failed, falling back to HTTP:', err);
    }
  }

  // If WebSocket is not open or send failed, use HTTP API fallback
  if (!sentViaWs) {
    const targetHttp = httpUrl || deriveHttpUrl(backendUrl);
    if (!targetHttp) {
      console.warn('[QA Recorder BG] No backend configured; queueing step until an AutomatiQA tab announces one.');
      pendingStepQueue.push(payload);
      return;
    }
    const endpoint = `${targetHttp}/api/record-event`;
    console.log('[QA Recorder BG] Sending step via HTTP fallback to:', endpoint);

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: payload.sessionId || currentSessionId,
        event: payload
      })
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP status ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log('[QA Recorder BG] Step recorded successfully via HTTP fallback:', payload.action);
      })
      .catch((err) => {
        console.warn('[QA Recorder BG] HTTP fallback also failed, queueing step:', err?.message || err);
        pendingStepQueue.push(payload);
        connectSocket();
      });
  }
}

function flushPendingSteps() {
  if (pendingStepQueue.length === 0) return;

  console.log(`[QA Recorder BG] Flushing ${pendingStepQueue.length} queued steps to backend...`);
  const toFlush = [...pendingStepQueue];
  pendingStepQueue.length = 0;

  for (const payload of toFlush) {
    sendStepToBackend(payload);
  }
}

// ============================================================
// RUNTIME MESSAGES (from content.js & web app bridge)
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  // 1. GET RECORDING STATE
  if (message.type === 'GET_RECORDING_STATE' || message.type === 'GET_BACKEND_STATUS') {
    sendResponse({
      backendUrl,
      httpUrl,
      transportMode,
      connected:
        transportMode === 'direct'
          ? true
          : Boolean(socket && socket.readyState === WebSocket.OPEN),
      isRecording,
      sessionId: currentSessionId
    });
    return true;
  }

  // 2. AUTO-CONFIGURE BACKEND (From AutomatiQA dashboard tab)
  if (message.type === 'AUTO_CONFIGURE_BACKEND') {
    if (sender.tab && typeof sender.tab.id === 'number') {
      appTabId = sender.tab.id;
      chrome.storage.local.set({ appTabId });
    }
    const newWsUrl = message.backendUrl;
    const newHttpUrl = message.httpUrl || deriveHttpUrl(newWsUrl);

    if (newWsUrl && isValidWebSocketUrl(newWsUrl)) {
      const changed = newWsUrl !== backendUrl;
      backendUrl = newWsUrl;
      httpUrl = newHttpUrl;
      chrome.storage.local.set({ backendUrl, httpUrl });

      console.log('[QA Recorder BG] Auto-configured backend to:', { backendUrl, httpUrl, changed });

      if (changed || !socket || socket.readyState !== WebSocket.OPEN) {
        if (socket) {
          try { socket.close(); } catch (_) {}
          socket = null;
        }
        connectSocket();
      }
    }

    sendResponse({
      success: true,
      backendUrl,
      httpUrl,
      isRecording,
      sessionId: currentSessionId
    });
    return true;
  }

  // 3. START RECORDING (From AutomatiQA web app bridge or popup)
  if (message.type === 'START_RECORDING') {
    isRecording = true;
    currentSessionId = message.sessionId || `session-${Date.now()}`;

    // The tab that starts recording is the AutomatiQA UI tab: remember it so
    // captured steps can be streamed back to it.
    if (sender.tab && typeof sender.tab.id === 'number') {
      appTabId = sender.tab.id;
    }

    if (message.transport === 'direct') {
      transportMode = 'direct';
      if (socket) {
        try { socket.close(); } catch (_) {}
        socket = null;
      }
    } else if (message.backendUrl && isValidWebSocketUrl(message.backendUrl)) {
      transportMode = 'backend';
      backendUrl = message.backendUrl;
      httpUrl = message.httpUrl || deriveHttpUrl(backendUrl);
    }

    chrome.storage.local.set({
      isRecording: true,
      currentSessionId,
      backendUrl,
      httpUrl,
      transportMode,
      appTabId
    });

    console.log('[QA Recorder BG] Recording activated via runtime message:', {
      sessionId: currentSessionId,
      transportMode,
      backendUrl: transportMode === 'direct' ? null : backendUrl,
      appTabId
    });

    broadcastRecordingStateToTabs(true, currentSessionId);
    connectSocket();

    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(
          JSON.stringify({
            type: 'RECORDER_CONNECTED',
            sessionId: currentSessionId
          })
        );
      } catch (_) {}
    }

    sendResponse({
      success: true,
      sessionId: currentSessionId,
      isRecording: true,
      transportMode
    });
    return true;
  }

  // 4. STOP RECORDING (From AutomatiQA web app bridge or popup)
  if (message.type === 'STOP_RECORDING') {
    isRecording = false;
    currentSessionId = null;

    chrome.storage.local.set({
      isRecording: false,
      currentSessionId: null
    });

    console.log('[QA Recorder BG] Recording deactivated via runtime message');
    broadcastRecordingStateToTabs(false, null);

    sendResponse({ success: true, isRecording: false });
    return true;
  }

  // 5. STEP RECORDED BY CONTENT SCRIPT
  if (message.type === 'STEP') {
    const incomingPayload = message.payload || {};
    const resolvedSessionId = incomingPayload.sessionId || currentSessionId;
    const tabId = sender.tab?.id;
    const pageId = incomingPayload.pageId || (tabId !== undefined && tabId !== null ? `tab-${tabId}` : 'tab-1');
    const expectedUrl = incomingPayload.expectedUrl || incomingPayload.url || sender.tab?.url || '';
    let expectedOrigin = incomingPayload.expectedOrigin;
    if (!expectedOrigin && expectedUrl) {
      try { expectedOrigin = new URL(expectedUrl).origin; } catch (_) {}
    }

    const payload = {
      ...incomingPayload,
      sessionId: resolvedSessionId,
      tabId: tabId,
      pageId: pageId,
      expectedUrl: expectedUrl,
      expectedOrigin: expectedOrigin,
      tabTitle: sender.tab?.title,
      frameId: sender.frameId,
      recordedAt: Date.now()
    };

    sendStepToBackend(payload);
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// ============================================================
// TAB NAVIGATION TRACKING (REDIRECTS, PAGE LOADS, SPA)
// ============================================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isRecording) return;
  // Navigation inside the AutomatiQA UI tab is not a recorded test step.
  if (tabId === appTabId) return;

  const tabUrl = tab.url || changeInfo.url;
  if (!tabUrl) return;

  // Ignore internal Chrome protocols
  if (
    tabUrl.startsWith('chrome://') ||
    tabUrl.startsWith('chrome-extension://') ||
    tabUrl.startsWith('devtools://') ||
    tabUrl.startsWith('about:blank')
  ) {
    return;
  }

  // When tab status changes or loads, ensure content script has active recording state
  if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, {
      type: 'RECORDING_STATE',
      isRecording: true,
      sessionId: currentSessionId,
      tabId: tabId,
      pageId: `tab-${tabId}`,
      url: tabUrl
    }).catch(() => {
      // Content script may not be injected yet if newly navigated page; fallback injection
      if (changeInfo.status === 'complete' && chrome.scripting) {
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['locator-engine.js', 'utils.js', 'content.js']
        }).catch(() => {});
      }
    });
  }

  // If a URL change occurred, record navigation
  if (changeInfo.url) {
    const now = Date.now();
    if (changeInfo.url === lastRecordedNavigation.url && now - lastRecordedNavigation.time < 1200) {
      return;
    }
    lastRecordedNavigation = { url: changeInfo.url, time: now };

    let expectedOrigin = undefined;
    try { expectedOrigin = new URL(changeInfo.url).origin; } catch (_) {}

    const payload = {
      action: 'navigate',
      url: changeInfo.url,
      expectedUrl: changeInfo.url,
      expectedOrigin,
      sessionId: currentSessionId,
      tabId,
      pageId: `tab-${tabId}`,
      tabTitle: tab.title || '',
      timestamp: now
    };

    sendStepToBackend(payload);
  }
});

// Tab creation and closure listeners for explicit tab lifecycle tracking
chrome.tabs.onCreated.addListener((tab) => {
  if (!isRecording) return;
  if (tab.id === appTabId) return;

  const now = Date.now();
  const tabUrl = tab.url || tab.pendingUrl || '';
  let expectedOrigin = undefined;
  if (tabUrl && !tabUrl.startsWith('about:blank') && !tabUrl.startsWith('chrome://')) {
    try { expectedOrigin = new URL(tabUrl).origin; } catch (_) {}
  }

  // open_tab events suppressed to avoid recorded step noise and playback disruption
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (!isRecording) return;
  if (tabId === appTabId) return;

  // close_tab events suppressed to avoid recorded step noise and playback disruption
});

// WebNavigation listener for SPA history transitions & committed redirects
if (typeof chrome !== 'undefined' && chrome.webNavigation) {
  chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (!isRecording || details.frameId !== 0) return;
    if (details.tabId === appTabId) return;
    const url = details.url;
    if (
      !url ||
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:blank')
    ) {
      return;
    }

    const now = Date.now();
    if (url === lastRecordedNavigation.url && now - lastRecordedNavigation.time < 1200) {
      return;
    }
    lastRecordedNavigation = { url, time: now };

    let expectedOrigin = undefined;
    try { expectedOrigin = new URL(url).origin; } catch (_) {}

    const payload = {
      action: 'navigate',
      navigationType: 'spa',
      url,
      expectedUrl: url,
      expectedOrigin,
      sessionId: currentSessionId,
      tabId: details.tabId,
      pageId: `tab-${details.tabId}`,
      timestamp: now
    };

    sendStepToBackend(payload);
  });
}

// ============================================================
// KEEP SERVICE WORKER ALIVE (Manifest V3)
// ============================================================

chrome.alarms.create('qaRecorderKeepAlive', {
  periodInMinutes: 0.4
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'qaRecorderKeepAlive') {
    if (!backendUrl || transportMode === 'direct') return;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      connectSocket();
    }
  }
});

console.log('[QA Recorder BG] Background service worker active and ready.');
