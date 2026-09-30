/**
 * AutomatiQA Web Performance Agent Bridge - Background Service Worker
 *
 * Supports Recording with EITHER connection:
 * 1. Local AutomatiQA Agent (wss://localhost:9334) if running, OR
 * 2. Directly via the Chrome Extension Bridge (using chrome.tabs, chrome.webRequest, and content script DOM interaction capture).
 *
 * Synchronized Filtering Rules:
 * - Capture: First-party domain requests tied to real user interactions, actual DOM form data, primary vs follow-up requests.
 * - Filter: Generic domain comparison against target site, static assets (.js, .css, images, fonts), background requests with no user action.
 */

const AGENT_WS_URL = 'wss://localhost:9334';
const AGENT_HTTPS_URL = 'https://localhost:9334/status';
const AGENT_HTTP_URL = 'http://localhost:9333/status';
const NAMESPACE = 'automatiqa-web-performance';

let agentSocket = null;
let isConnecting = false;
let agentStatus = 'disconnected'; // 'connected' | 'disconnected' | 'untrusted' | 'connecting'
let agentVersion = null;

// Track active content script ports from AutomatiQA UI
const activePorts = new Set();

// Extension-native recording state (when recording directly via extension)
let isExtensionRecording = false;
let currentSessionId = null;
let recordingTargetUrl = null;
let recordingTabId = null;
let sessionReqCounter = 0;
let capturedRequests = [];
let capturedResponses = [];
let capturedActions = [];
let activeActionId = null;
let activeActionIntent = null;
let activeActionFormData = null;
const pendingRequestMap = new Map();
const seenRequestIds = new Set();
const seenResponseKeys = new Set();

// =========================================================================
// UNIVERSAL DOMAIN COMPARISON & NOISE FILTERING
// =========================================================================

/**
 * Extract root registrable domain (eTLD+1) for generic first-party domain comparison.
 * Matches company.com, store.company.co.uk, localhost, IPs, etc.
 */
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

/**
 * Checks whether requestUrl belongs to the same domain or a first-party subdomain of targetSiteUrl.
 * Matched generically by domain comparison (NOT hardcoded company lists).
 */
function isFirstPartyDomain(requestUrl, targetSiteUrl) {
  if (!requestUrl) return false;
  if (!targetSiteUrl) return true;

  try {
    const reqParsed = new URL(requestUrl.startsWith('http') ? requestUrl : `https://${requestUrl}`);
    const targetParsed = new URL(targetSiteUrl.startsWith('http') ? targetSiteUrl : `https://${targetSiteUrl}`);

    const reqHost = reqParsed.hostname.toLowerCase();
    const targetHost = targetParsed.hostname.toLowerCase();

    // Exact host match
    if (reqHost === targetHost) return true;

    // First-party subdomain match
    const targetRoot = getRegistrableDomain(targetHost);
    if (targetRoot && (reqHost === targetRoot || reqHost.endsWith('.' + targetRoot))) {
      return true;
    }

    // Different domain -> Filter out as third-party (trackers, ads, analytics, Facebook, Firebase, etc.)
    return false;
  } catch (e) {
    return true;
  }
}

/**
 * Checks whether request is a static asset (.js, .css, images, fonts, media, etc.)
 */
function isStaticAsset(url, resourceType) {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  const lowerType = (resourceType || '').toLowerCase();

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

  if (['image', 'font', 'stylesheet', 'media', 'script', 'texttrack', 'eventsource', 'websocket', 'manifest', 'other'].includes(lowerType)) {
    return true;
  }

  if (/\.(?:png|jpe?g|gif|svg|webp|ico|bmp|woff2?|ttf|eot|otf|css|js|mjs|cjs|mp[34]|webm|ogg|wav|avif|cur|map|wasm|pdf|zip|txt)(?:[?#].*)?$/i.test(lowerUrl)) {
    return true;
  }

  if (/(?:favicon|apple-touch-icon|site\.webmanifest|browserconfig\.xml)/i.test(lowerUrl)) {
    return true;
  }

  return false;
}

/**
 * Universal noise filter for performance testing captures
 */
function isNoiseRequest(url, resourceType, method, status, targetSiteUrl, hasUserInteraction) {
  if (!url) return true;
  const reqMethod = (method || 'GET').toUpperCase();

  // OPTIONS and HEAD are preflights, not user-driven functional test steps
  if (reqMethod === 'OPTIONS' || reqMethod === 'HEAD') return true;

  // 4xx errors (404 missing static assets, failed telemetry)
  if (status && status >= 400 && status < 500) return true;

  // Static assets (.js, .css, images, fonts, etc.)
  if (isStaticAsset(url, resourceType)) return true;

  // Generic domain comparison: filter out any request to a different domain than site being recorded
  if (targetSiteUrl && !isFirstPartyDomain(url, targetSiteUrl)) {
    return true;
  }

  // Filter out requests with no tied user interaction (unless landing initial navigation)
  if (hasUserInteraction === false) {
    return true;
  }

  return false;
}

// =========================================================================
// TAB LISTENERS & SSL TRUST DETECTION
// =========================================================================

try {
  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && tab.url.includes('localhost:9334')) {
        console.log('[WebPerfBridge] Detected localhost:9334 tab update, reconnecting WSS...');
        setTimeout(() => {
          connectAgentWebSocket();
        }, 300);
      }
    });
  }
} catch (e) {}

// Handle user closing the recorded tab
chrome.tabs.onRemoved.addListener((tabId) => {
  if (isExtensionRecording && tabId === recordingTabId) {
    console.log('[WebPerfBridge] User closed recorded tab.');
    stopExtensionRecording('USER_CLOSED_TAB');
  }
});

/**
 * Broadcast message to all active content script listeners and open ports
 */
function broadcastToPage(payload) {
  const message = {
    namespace: NAMESPACE,
    source: 'automatiqa-web-perf-bridge',
    timestamp: Date.now(),
    ...payload
  };

  // 1. Post to active long-lived connection ports
  for (const port of activePorts) {
    try {
      port.postMessage(message);
    } catch (e) {
      activePorts.delete(port);
    }
  }

  // 2. Broadcast via chrome.tabs to all matching frames
  try {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return;
      tabs.forEach((tab) => {
        if (tab.id && tab.id !== recordingTabId) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      });
    });
  } catch (e) {}
}

/**
 * Connect to Local Agent via WebSocket (wss://localhost:9334)
 */
function connectAgentWebSocket(onConnectCallback) {
  if (agentSocket && (agentSocket.readyState === WebSocket.OPEN || agentSocket.readyState === WebSocket.CONNECTING)) {
    if (agentSocket.readyState === WebSocket.OPEN && onConnectCallback) {
      onConnectCallback(agentSocket);
    }
    return;
  }

  isConnecting = true;
  agentStatus = 'connecting';
  broadcastToPage({ type: 'bridge_agent_status', status: 'connecting' });

  try {
    const ws = new WebSocket(AGENT_WS_URL);
    agentSocket = ws;

    ws.onopen = () => {
      isConnecting = false;
      agentStatus = 'connected';
      console.log('[WebPerfBridge] Connected to AutomatiQA Agent at', AGENT_WS_URL);

      try {
        ws.send(JSON.stringify({ action: 'check_status' }));
      } catch (e) {}

      broadcastToPage({
        type: 'bridge_agent_status',
        status: 'connected',
        version: agentVersion
      });

      if (onConnectCallback) {
        onConnectCallback(ws);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'agent_status' && data.version) {
          agentVersion = data.version;
        }
        // Relay agent message directly to the web performance page
        broadcastToPage(data);
      } catch (err) {
        console.warn('[WebPerfBridge] Failed to parse agent message:', err);
      }
    };

    ws.onerror = () => {
      probeAgentHttps();
    };

    ws.onclose = (event) => {
      isConnecting = false;
      agentStatus = 'disconnected';
      if (agentSocket === ws) {
        agentSocket = null;
      }
      broadcastToPage({
        type: 'bridge_agent_status',
        status: 'disconnected',
        code: event.code,
        reason: event.reason || 'Agent connection closed'
      });
    };
  } catch (err) {
    isConnecting = false;
    agentStatus = 'disconnected';
    probeAgentHttps();
  }
}

/**
 * Probe Agent HTTPS & HTTP status endpoints to distinguish between untrusted SSL and offline agent
 */
async function probeAgentHttps() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(AGENT_HTTPS_URL, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      if (json.version) agentVersion = json.version;
      agentStatus = 'connected';
      broadcastToPage({
        type: 'bridge_agent_status',
        status: 'connected',
        version: agentVersion
      });
      return;
    }
  } catch (err) {
    const errStr = String(err).toLowerCase();
    if (errStr.includes('cert') || errStr.includes('security') || errStr.includes('authority') || errStr.includes('ssl')) {
      agentStatus = 'untrusted';
      broadcastToPage({
        type: 'bridge_agent_status',
        status: 'untrusted',
        message: 'Agent detected but self-signed certificate not trusted. Visit https://localhost:9334/status to approve.'
      });
      return;
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(AGENT_HTTP_URL, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      if (json.version) agentVersion = json.version;
      agentStatus = 'untrusted';
      broadcastToPage({
        type: 'bridge_agent_status',
        status: 'untrusted',
        version: agentVersion,
        message: 'Agent is running on localhost, but WSS certificate needs 1-click authorization.'
      });
      return;
    }
  } catch (_) {}

  agentStatus = 'disconnected';
  broadcastToPage({
    type: 'bridge_agent_status',
    status: 'disconnected',
    message: 'AutomatiQA Agent is not running on localhost:9334.'
  });
}

function openSslAuthTab() {
  try {
    chrome.tabs.create({ url: 'https://localhost:9334/status' });
  } catch (e) {}
}

// =========================================================================
// EXTENSION-NATIVE RECORDING ENGINE (When Agent is Offline or Extension Active)
// =========================================================================

function startExtensionRecording(url, sessionId) {
  isExtensionRecording = true;
  currentSessionId = sessionId;
  recordingTargetUrl = url;
  sessionReqCounter = 0;
  capturedRequests = [];
  capturedResponses = [];
  capturedActions = [];
  activeActionId = 'act_landing_0';
  activeActionIntent = 'Page Load';
  activeActionFormData = null;
  pendingRequestMap.clear();
  seenRequestIds.clear();
  seenResponseKeys.clear();

  // Create recording browser tab
  chrome.tabs.create({ url, active: true }, (tab) => {
    recordingTabId = tab?.id || null;
    broadcastToPage({
      type: 'recording_started',
      sessionId: currentSessionId,
      targetUrl: recordingTargetUrl,
      mode: 'extension'
    });
  });
}

function stopExtensionRecording(reason) {
  if (!isExtensionRecording) return;
  isExtensionRecording = false;

  const dataset = {
    sessionId: currentSessionId,
    targetUrl: recordingTargetUrl,
    reason: reason || 'User stopped recording',
    responses: capturedResponses,
    requests: capturedRequests,
    actions: capturedActions,
    mode: 'extension'
  };

  broadcastToPage({
    type: 'recording_stopped',
    sessionId: currentSessionId,
    dataset,
    totalRequestsCaptured: capturedRequests.length,
    totalResponsesCaptured: capturedResponses.length
  });

  recordingTabId = null;
}

// WebRequest Listeners for Extension Recording
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isExtensionRecording) return;
    if (recordingTabId && details.tabId !== recordingTabId) return;

    // Filter using isNoiseRequest
    const isLanding = details.type === 'main_frame' && capturedRequests.length === 0;
    const hasInteraction = isLanding || !!activeActionId;
    if (isNoiseRequest(details.url, details.type, details.method, undefined, recordingTargetUrl, hasInteraction)) {
      return;
    }

    sessionReqCounter++;
    const reqId = `ext_req_${currentSessionId || 'sess'}_${sessionReqCounter}_${Date.now()}`;

    // Extract POST payload from requestBody if present
    let postData = undefined;
    if (details.requestBody) {
      if (details.requestBody.formData) {
        const fd = {};
        for (const [k, v] of Object.entries(details.requestBody.formData)) {
          fd[k] = Array.isArray(v) && v.length === 1 ? v[0] : v;
        }
        postData = JSON.stringify(fd);
      } else if (details.requestBody.raw && details.requestBody.raw.length > 0) {
        try {
          const decoder = new TextDecoder('utf-8');
          postData = decoder.decode(details.requestBody.raw[0].bytes);
        } catch (e) {}
      }
    }

    if (!postData && ['POST', 'PUT', 'PATCH'].includes(details.method) && activeActionFormData) {
      postData = JSON.stringify(activeActionFormData);
    }

    const reqData = {
      id: reqId,
      url: details.url,
      method: details.method,
      postData,
      resourceType: details.type,
      timestamp: Date.now(),
      actionId: isLanding ? 'act_landing_0' : activeActionId,
      actionIntent: isLanding ? 'Page Load' : activeActionIntent,
      actionFormData: activeActionFormData,
      sessionId: currentSessionId
    };

    pendingRequestMap.set(details.requestId, reqData);

    if (!seenRequestIds.has(reqId)) {
      seenRequestIds.add(reqId);
      capturedRequests.push(reqData);

      broadcastToPage({
        type: 'network_event',
        event: 'request',
        data: reqData,
        totalRequestsCaptured: capturedRequests.length
      });
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!isExtensionRecording) return;
    if (recordingTabId && details.tabId !== recordingTabId) return;

    const reqData = pendingRequestMap.get(details.requestId);
    const isLanding = details.type === 'main_frame' && capturedResponses.length === 0;
    const hasInteraction = isLanding || (reqData && !!reqData.actionId) || !!activeActionId;

    if (isNoiseRequest(details.url, details.type, details.method, details.statusCode, recordingTargetUrl, hasInteraction)) {
      return;
    }

    const finishTime = Date.now();
    const responseTimeMs = reqData ? Math.max(1, finishTime - reqData.timestamp) : 100;
    const respId = reqData ? reqData.id : `ext_resp_${currentSessionId || 'sess'}_${++sessionReqCounter}_${finishTime}`;

    const dedupeKey = `${details.method}|${details.url}|${Math.floor(finishTime / 500)}`;
    if (seenResponseKeys.has(dedupeKey)) return;
    seenResponseKeys.add(dedupeKey);

    const respItem = {
      id: respId,
      url: details.url,
      method: details.method,
      status: details.statusCode,
      statusText: details.statusLine || 'OK',
      postData: reqData ? reqData.postData : undefined,
      body: reqData ? reqData.postData : undefined,
      responseTimeMs,
      resourceType: details.type,
      actionId: reqData ? reqData.actionId : activeActionId,
      actionIntent: reqData ? reqData.actionIntent : activeActionIntent,
      actionFormData: reqData ? reqData.actionFormData : activeActionFormData,
      timestamp: finishTime,
      sessionId: currentSessionId
    };

    capturedResponses.push(respItem);

    broadcastToPage({
      type: 'network_event',
      event: 'response',
      data: respItem,
      totalRequestsCaptured: capturedRequests.length,
      totalResponsesCaptured: capturedResponses.length,
      sessionId: currentSessionId
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

// =========================================================================
// MESSAGE DISPATCHER
// =========================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.namespace !== NAMESPACE) {
    return false;
  }

  const { action, payload } = message;

  switch (action) {
    case 'ping_bridge':
    case 'check_status':
      if (!agentSocket || agentSocket.readyState !== WebSocket.OPEN) {
        connectAgentWebSocket();
      } else {
        try {
          agentSocket.send(JSON.stringify({ action: 'check_status' }));
        } catch (e) {}
      }

      sendResponse({
        namespace: NAMESPACE,
        source: 'automatiqa-web-perf-bridge',
        type: 'bridge_status',
        bridgeInstalled: true,
        bridgeVersion: '1.0.0',
        agentStatus: agentStatus,
        agentVersion: agentVersion
      });
      return true;

    case 'authorize_ssl':
    case 'open_ssl_auth':
      openSslAuthTab();
      sendResponse({ success: true, status: 'opened_auth_tab' });
      return true;

    case 'user_action_recorded':
      // User performed an interaction in the recorded page
      if (payload) {
        const actionId = `act_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        activeActionId = actionId;
        activeActionIntent = payload.actionIntent || 'User Action';
        if (payload.formData && Object.keys(payload.formData).length > 0) {
          activeActionFormData = payload.formData;
        }

        const actionRecord = {
          id: actionId,
          ...payload,
          actionIntent: activeActionIntent
        };
        capturedActions.push(actionRecord);

        // Broadcast to page live view
        broadcastToPage({
          type: 'user_action',
          action: actionRecord
        });
      }
      sendResponse({ success: true });
      return true;

    case 'start_record':
      // FIX 1: Work with EITHER Agent OR Extension!
      if (agentSocket && agentSocket.readyState === WebSocket.OPEN) {
        // Agent is connected -> Record via agent Playwright context
        try {
          agentSocket.send(JSON.stringify({
            action: 'start_record',
            url: payload?.url,
            sessionId: payload?.sessionId
          }));
          sendResponse({ success: true, mode: 'agent' });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      } else {
        // Agent is NOT connected -> Record directly via Extension!
        startExtensionRecording(payload?.url, payload?.sessionId);
        sendResponse({ success: true, mode: 'extension' });
      }
      return true;

    case 'stop_record':
      if (agentSocket && agentSocket.readyState === WebSocket.OPEN) {
        try {
          agentSocket.send(JSON.stringify({
            action: 'stop_record',
            sessionId: payload?.sessionId,
            reason: payload?.reason || 'User stopped recording'
          }));
        } catch (err) {}
      }
      if (isExtensionRecording) {
        stopExtensionRecording(payload?.reason);
      }
      sendResponse({ success: true });
      return true;

    default:
      sendResponse({ error: `Unknown action: ${action}` });
      return false;
  }
});

/**
 * Handle persistent port connections from content script
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === NAMESPACE) {
    activePorts.add(port);

    port.postMessage({
      namespace: NAMESPACE,
      source: 'automatiqa-web-perf-bridge',
      type: 'bridge_status',
      bridgeInstalled: true,
      bridgeVersion: '1.0.0',
      agentStatus: agentStatus,
      agentVersion: agentVersion
    });

    port.onDisconnect.addListener(() => {
      activePorts.delete(port);
    });

    port.onMessage.addListener((msg) => {
      if (msg.action === 'ping_bridge' || msg.action === 'check_status') {
        if (!agentSocket || agentSocket.readyState !== WebSocket.OPEN) {
          connectAgentWebSocket();
        }
        port.postMessage({
          namespace: NAMESPACE,
          source: 'automatiqa-web-perf-bridge',
          type: 'bridge_status',
          bridgeInstalled: true,
          bridgeVersion: '1.0.0',
          agentStatus: agentStatus,
          agentVersion: agentVersion
        });
      } else if (msg.action === 'start_record') {
        if (agentSocket && agentSocket.readyState === WebSocket.OPEN) {
          agentSocket.send(JSON.stringify({
            action: 'start_record',
            url: msg.payload?.url,
            sessionId: msg.payload?.sessionId
          }));
        } else {
          startExtensionRecording(msg.payload?.url, msg.payload?.sessionId);
        }
      } else if (msg.action === 'stop_record') {
        if (agentSocket && agentSocket.readyState === WebSocket.OPEN) {
          agentSocket.send(JSON.stringify({
            action: 'stop_record',
            sessionId: msg.payload?.sessionId,
            reason: msg.payload?.reason
          }));
        }
        if (isExtensionRecording) {
          stopExtensionRecording(msg.payload?.reason);
        }
      }
    });
  }
});

// Auto-connect on startup
connectAgentWebSocket();
