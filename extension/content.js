/**
 * QA Recorder - Content Script
 *
 * Runs inside target web pages and all subframes.
 * Captures user interactions and sends them to background.js.
 * Handles page reloads, redirects, and SPA transitions seamlessly.
 */

(() => {
  // Prevent duplicate execution inside the same window/frame context
  if (window.__QA_RECORDER_INITIALIZED__) {
    return;
  }
  window.__QA_RECORDER_INITIALIZED__ = true;

  // ------------------------------------------------------------
  // STATE
  // ------------------------------------------------------------

  let isPageRecording = false;
  let currentSessionId = null;
  let currentTabId = null;
  let currentPageId = 'tab-1';
  let isStateResolved = false;
  const earlyEventBuffer = [];

  let inputDebounceTimer = null;
  let pendingInputStep = null;
  let lastHoverElement = null;
  let lastHoverTime = 0;
  let scrollTimer = null;
  let indicatorElement = null;

  // ------------------------------------------------------------
  // EXTENSION CONTEXT CHECK
  // ------------------------------------------------------------

  function isExtensionContextValid() {
    try {
      return Boolean(
        typeof chrome !== 'undefined' &&
        chrome.runtime &&
        chrome.runtime.id
      );
    } catch (error) {
      return false;
    }
  }

  // ------------------------------------------------------------
  // SAFE RUNTIME MESSAGE WITH RETRY
  // ------------------------------------------------------------

  function safeRuntimeSendMessage(message, callback, retryCount = 0) {
    if (!isExtensionContextValid()) {
      console.warn('[QA Recorder Content] Cannot send message: extension context invalid.');
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || '';
          if (
            retryCount < 3 &&
            (errMsg.includes('Receiving end does not exist') ||
             errMsg.includes('Could not establish connection') ||
             errMsg.includes('context invalidated'))
          ) {
            setTimeout(() => {
              safeRuntimeSendMessage(message, callback, retryCount + 1);
            }, 150 * (retryCount + 1));
            return;
          }
          return;
        }

        if (typeof callback === 'function') {
          callback(response);
        }
      });
    } catch (error) {
      console.warn('[QA Recorder Content] Exception sending message:', error);
    }
  }

  // ------------------------------------------------------------
  // AUTOMATIQA WEB APP BRIDGE
  // ------------------------------------------------------------

  /*
   * The bridge is installed in EVERY frame of EVERY page, not only in a frame
   * that "looks like" the AutomatiQA dashboard. Two reasons:
   *
   *  1. Content scripts run at document_start, so <title> and <meta> are not
   *     parsed yet - any DOM-sniffing detection is always false at this point.
   *  2. Hosted previews (Google AI Studio, StackBlitz, CodeSandbox, ...) render
   *     the app inside a cross-origin iframe, so `window.top === window.self`
   *     is false for the frame that actually runs the AutomatiQA UI.
   *
   * A frame is treated as the app frame only after it sends us a handshake or a
   * command, so ordinary target pages never enter dashboard mode by accident.
   */

  let isAutomatiQaPage = false; // becomes true once the page handshakes with us

  const pageProto = window.location.protocol;
  const wsProto = pageProto === 'https:' ? 'wss:' : 'ws:';
  const sameOriginBackendUrl =
    pageProto === 'http:' || pageProto === 'https:'
      ? `${wsProto}//${window.location.host}/recorder`
      : null;
  const sameOriginHttpUrl =
    pageProto === 'http:' || pageProto === 'https:' ? window.location.origin : null;

  function announceExtension() {
    isAutomatiQaPage = true;
    window.__QA_RECORDER_EXTENSION_ACTIVE__ = true;
    const detail = { version: '2.1', extensionId: (chrome.runtime && chrome.runtime.id) || null };
    window.postMessage({ type: 'AUTOMATIQA_EXTENSION_ACTIVE', ...detail }, '*');
    document.dispatchEvent(new CustomEvent('automatiqa:extension-active', { detail }));
    // Remove the recording badge if this frame previously rendered one.
    updateVisualIndicator(false, null);
  }

  function handleAppCommand(data, respond) {
    if (data.type === 'AUTOMATIQA_CHECK_EXTENSION') {
      announceExtension();
      return;
    }

    // The app tells the extension where its own recorder backend lives. This is
    // sent on every page load, so a freshly installed extension on somebody
    // else's machine is configured without any manual setup.
    if (data.type === 'AUTOMATIQA_CONFIGURE_BACKEND') {
      isAutomatiQaPage = true;
      const wsUrl = data.backendUrl || sameOriginBackendUrl;
      if (wsUrl) {
        safeRuntimeSendMessage({
          type: 'AUTO_CONFIGURE_BACKEND',
          backendUrl: wsUrl,
          httpUrl: data.httpUrl || sameOriginHttpUrl
        }, (res) => {
          respond({
            type: 'AUTOMATIQA_EXTENSION_ACK',
            action: 'CONFIGURE_BACKEND',
            success: Boolean(res && res.success),
            backendUrl: res && res.backendUrl
          });
        });
      }
      announceExtension();
      return;
    }

    if (data.type === 'AUTOMATIQA_START_RECORDING') {
      isAutomatiQaPage = true;
      // `transport: 'direct'` means "there is no recorder backend reachable from
      // this page (hosted preview), stream the steps straight back to me".
      const transport = data.transport === 'direct' || !data.backendUrl ? 'direct' : 'backend';
      console.log('[QA Recorder Content] START_RECORDING from web app:', data.sessionId, transport);
      safeRuntimeSendMessage(
        {
          type: 'START_RECORDING',
          sessionId: data.sessionId,
          transport,
          backendUrl: transport === 'backend' ? data.backendUrl || sameOriginBackendUrl : null,
          httpUrl: transport === 'backend' ? data.httpUrl || sameOriginHttpUrl : null
        },
        (res) => {
          respond({
            type: 'AUTOMATIQA_EXTENSION_ACK',
            action: 'START_RECORDING',
            success: Boolean(res && res.success),
            sessionId: (res && res.sessionId) || data.sessionId,
            transport
          });
        }
      );
      return;
    }

    if (data.type === 'AUTOMATIQA_STOP_RECORDING') {
      console.log('[QA Recorder Content] STOP_RECORDING from web app');
      safeRuntimeSendMessage({ type: 'STOP_RECORDING', sessionId: data.sessionId }, (res) => {
        respond({ type: 'AUTOMATIQA_EXTENSION_ACK', action: 'STOP_RECORDING', success: true });
      });
    }
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
    if (!data.type.startsWith('AUTOMATIQA_')) return;
    // Only accept commands from this frame's own window (the app), never from
    // an embedded third-party frame trying to drive the recorder.
    if (event.source !== window) return;

    handleAppCommand(data, (payload) => window.postMessage(payload, '*'));
  });

  // CustomEvent bridge (used when the app prefers DOM events over postMessage)
  document.addEventListener('automatiqa:start-recording', (e) => {
    handleAppCommand({ type: 'AUTOMATIQA_START_RECORDING', ...(e.detail || {}) }, (payload) => {
      document.dispatchEvent(new CustomEvent('automatiqa:extension-ack', { detail: payload }));
    });
  });

  document.addEventListener('automatiqa:stop-recording', (e) => {
    handleAppCommand({ type: 'AUTOMATIQA_STOP_RECORDING', ...(e.detail || {}) }, (payload) => {
      document.dispatchEvent(new CustomEvent('automatiqa:extension-ack', { detail: payload }));
    });
  });

  // Announce ourselves once the document is parsed, so an app that loaded before
  // the extension (or that never sends a probe) still discovers the recorder.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeAnnounceToKnownApp, { once: true });
  } else {
    maybeAnnounceToKnownApp();
  }

  function maybeAnnounceToKnownApp() {
    const looksLikeApp = Boolean(
      document.querySelector('meta[name="qa-recorder-backend-url"]') ||
      window.__AUTOMATIQA_APP__ ||
      (document.title || '').includes('AutomatiQA')
    );
    if (!looksLikeApp) return;

    if (sameOriginBackendUrl) {
      safeRuntimeSendMessage({
        type: 'AUTO_CONFIGURE_BACKEND',
        backendUrl: sameOriginBackendUrl,
        httpUrl: sameOriginHttpUrl
      });
    }
    announceExtension();
  }

  // ------------------------------------------------------------
  // VISUAL RECORDING BADGE ON TARGET PAGES
  // ------------------------------------------------------------

  function updateVisualIndicator(recording, sessionId) {
    // Only render visual badge on top-level target pages, not inside AutomatiQA dashboard
    if (isAutomatiQaPage || window.top !== window.self) return;

    if (recording) {
      if (!indicatorElement) {
        indicatorElement = document.createElement('div');
        indicatorElement.id = '__qa_recorder_status_badge__';
        indicatorElement.innerHTML = `
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:8px;animation:qaPulse 1.5s infinite;"></span>
          <span style="font-weight:600;font-size:12px;letter-spacing:0.3px;">QA Recording Active</span>
          <span style="font-size:10px;opacity:0.8;margin-left:6px;">(${sessionId ? sessionId.substring(0, 6) : 'Ready'})</span>
        `;
        indicatorElement.style.cssText = `
          position: fixed;
          top: 14px;
          right: 14px;
          z-index: 2147483647;
          background: rgba(15, 23, 42, 0.92);
          color: #ffffff;
          padding: 6px 12px;
          border-radius: 9999px;
          font-family: system-ui, -apple-system, sans-serif;
          box-shadow: 0 4px 12px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1);
          pointer-events: none;
          display: flex;
          align-items: center;
          transition: opacity 0.2s ease;
        `;

        if (!document.getElementById('__qa_pulse_style__')) {
          const style = document.createElement('style');
          style.id = '__qa_pulse_style__';
          style.textContent = `
            @keyframes qaPulse {
              0% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.3; transform: scale(0.85); }
              100% { opacity: 1; transform: scale(1); }
            }
          `;
          document.head.appendChild(style);
        }

        document.body ? document.body.appendChild(indicatorElement) : document.documentElement.appendChild(indicatorElement);
      }
    } else {
      if (indicatorElement) {
        indicatorElement.remove();
        indicatorElement = null;
      }
    }
  }

  // ------------------------------------------------------------
  // RECORDING STATE MANAGEMENT
  // ------------------------------------------------------------

  function updateRecordingState(recording, sessionId, tabId, pageId) {
    isPageRecording = Boolean(recording);
    if (sessionId) {
      currentSessionId = sessionId;
    }
    if (tabId !== undefined && tabId !== null) {
      currentTabId = tabId;
    }
    if (pageId) {
      currentPageId = pageId;
    } else if (currentTabId !== null) {
      currentPageId = `tab-${currentTabId}`;
    }
    isStateResolved = true;

    console.log('[QA Recorder Content] Recording state:', {
      isPageRecording,
      currentSessionId,
      currentTabId,
      currentPageId,
      url: window.location.href
    });

    updateVisualIndicator(isPageRecording, currentSessionId);

    // If state just resolved to active recording, flush any early buffered user actions
    if (isPageRecording && earlyEventBuffer.length > 0) {
      console.log(`[QA Recorder Content] Flushing ${earlyEventBuffer.length} early buffered actions...`);
      while (earlyEventBuffer.length > 0) {
        const bufferedStep = earlyEventBuffer.shift();
        if (!bufferedStep.sessionId && currentSessionId) {
          bufferedStep.sessionId = currentSessionId;
        }
        sendStep(bufferedStep);
      }
    } else if (!isPageRecording) {
      earlyEventBuffer.length = 0;
    }
  }

  function refreshRecordingState() {
    if (!isExtensionContextValid()) return;

    // 1. Check chrome.storage.local
    try {
      chrome.storage.local.get(['isRecording', 'currentSessionId'], (result) => {
        if (!chrome.runtime.lastError && result) {
          if (result.isRecording !== undefined) {
            updateRecordingState(result.isRecording, result.currentSessionId);
          }
        }
      });
    } catch (e) {}

    // 2. Query background worker directly
    safeRuntimeSendMessage({ type: 'GET_RECORDING_STATE' }, (response) => {
      if (response && response.isRecording !== undefined) {
        updateRecordingState(response.isRecording, response.sessionId);
      }
    });
  }

  // Initialize state immediately upon injection
  refreshRecordingState();

  // Storage change listener for instant state sync across all open tabs/frames
  if (isExtensionContextValid()) {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          if (changes.isRecording !== undefined || changes.currentSessionId !== undefined) {
            const nextRecording = changes.isRecording !== undefined ? changes.isRecording.newValue : isPageRecording;
            const nextSession = changes.currentSessionId !== undefined ? changes.currentSessionId.newValue : currentSessionId;
            updateRecordingState(nextRecording, nextSession);
          }
        }
      });
    } catch (e) {}
  }

  // Runtime message listener from background worker
  if (isExtensionContextValid()) {
    try {
      chrome.runtime.onMessage.addListener((message) => {
        if (!message) return;
        if (message.type === 'START_RECORDING') {
          updateRecordingState(true, message.sessionId, message.tabId, message.pageId);
        } else if (message.type === 'STOP_RECORDING') {
          updateRecordingState(false, null, null, null);
        } else if (message.type === 'RECORDING_STATE') {
          updateRecordingState(message.isRecording, message.sessionId, message.tabId, message.pageId);
        } else if (message.type === 'DELIVER_STEP') {
          // Direct transport: background relays each captured step back to the
          // AutomatiQA UI frame, so no recorder backend is required.
          if (!isAutomatiQaPage) return;
          window.postMessage(
            { type: 'AUTOMATIQA_RECORDED_STEP', step: message.payload, sessionId: message.payload?.sessionId },
            '*'
          );
          document.dispatchEvent(
            new CustomEvent('automatiqa:recorded-step', { detail: message.payload })
          );
        }
      });
    } catch (e) {}
  }

  // Refresh recording state on window focus or visibility restore
  window.addEventListener('focus', () => {
    refreshRecordingState();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshRecordingState();
    }
  });

  // ------------------------------------------------------------
  // ELEMENT TARGETING & UTILITIES
  // ------------------------------------------------------------

  function getRealTarget(event) {
    if (event && typeof event.composedPath === 'function') {
      const path = event.composedPath();
      if (path && path.length > 0 && path[0] instanceof Element) {
        return path[0];
      }
    }
    return event?.target instanceof Element ? event.target : null;
  }

  function getInteractiveElement(target) {
    if (!target || !(target instanceof Element)) return null;

    // Ignore clicks on our own status badge
    if (target.closest('#__qa_recorder_status_badge__')) return null;

    // Prefer clickable / interactive ancestor container over inner icons or spans
    const interactive = target.closest(
      'button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="combobox"], [role="option"], [role="menuitem"], [role="tab"], label, [tabindex]'
    );
    return interactive || target;
  }

  function isSensitiveElement(element) {
    if (!element || !(element instanceof Element)) return false;

    if (element instanceof HTMLInputElement) {
      const type = (element.type || '').toLowerCase();
      if (type === 'password') return true;
    }

    const attrs = [
      element.getAttribute('name'),
      element.getAttribute('id'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.getAttribute('autocomplete')
    ].filter(Boolean).join(' ').toLowerCase();

    return /password|passwd|pin|ssn|cvv|creditcard|secret|token|apikey|otp/i.test(attrs);
  }

  function getElementValue(element) {
    if (!element) return '';
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value || '';
    }
    if (element instanceof HTMLSelectElement) {
      return element.value || (element.selectedOptions?.[0]?.textContent || '').trim();
    }
    return (element.innerText || element.textContent || '').trim();
  }

  let locatorFallbackWarned = false;
  function warnLocatorFallback(reason) {
    if (locatorFallbackWarned) return;
    locatorFallbackWarned = true;
    console.error(
      '[QA Recorder Content] Locator engine unavailable (' + reason + '). ' +
      'Falling back to raw CSS selectors - recorded steps will NOT use the ' +
      'Playwright priority hierarchy (getByRole/getByLabel/getByPlaceholder). ' +
      'Check that locator-engine.js and utils.js loaded without errors.'
    );
  }

  function getElementInfo(element) {
    if (!element || !(element instanceof Element)) return null;

    try {
      if (window.QA_RECORDER_UTILS && typeof window.QA_RECORDER_UTILS.getElementInfo === 'function') {
        return window.QA_RECORDER_UTILS.getElementInfo(element);
      }
      warnLocatorFallback('QA_RECORDER_UTILS unavailable');
    } catch (e) {
      warnLocatorFallback(e && e.message ? e.message : 'getElementInfo threw');
    }

    // Fallback locator generator — raw CSS only, NO Playwright priority.
    // Steps recorded through this path are not reliable for playback.
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const selector = id || tagName;
    return {
      tagName,
      id: element.id || '',
      name: element.getAttribute('name') || '',
      role: element.getAttribute('role') || tagName,
      text: (element.innerText || element.textContent || '').trim().substring(0, 100),
      placeholder: element.getAttribute('placeholder') || '',
      value: getElementValue(element),
      selector,
      locator: {
        primary: {
          type: 'css',
          value: selector,
          playwright: `page.locator('${selector}')`
        },
        alternatives: []
      }
    };
  }

  function highlightElement(element) {
    if (!element || !(element instanceof Element)) return;
    try {
      const origOutline = element.style.outline;
      const origTransition = element.style.transition;
      element.style.outline = '2px solid #2563eb';
      element.style.transition = 'outline 0.15s ease';
      setTimeout(() => {
        try {
          element.style.outline = origOutline;
          element.style.transition = origTransition;
        } catch (_) {}
      }, 350);
    } catch (_) {}
  }

  // ------------------------------------------------------------
  // STEP BUILDER & DISPATCHER
  // ------------------------------------------------------------

  function createStep(action, element, extra = {}) {
    const info = getElementInfo(element) || {};
    const rect = element?.getBoundingClientRect?.();
    const sensitive = isSensitiveElement(element);

    let val = '';
    if (!sensitive) {
      val = extra.value !== undefined ? extra.value : (info.value || getElementValue(element));
    } else {
      val = '[MASKED]';
    }

    let locator = info.locator;
    let selector = info.selector;
    if (!locator || !locator.primary) {
      const fallbackSel = selector || (element?.tagName ? element.tagName.toLowerCase() : 'body');
      locator = {
        primary: {
          type: 'css',
          value: fallbackSel,
          playwright: `page.locator('${fallbackSel}')`
        },
        alternatives: []
      };
    }

    const isIframe = window !== window.top;
    const frameUrl = isIframe ? window.location.href : undefined;
    const pageId = currentPageId || (currentTabId !== null ? `tab-${currentTabId}` : 'tab-1');

    return {
      action,
      url: window.location.href,
      pageUrl: window.location.href,
      expectedUrl: window.location.href,
      expectedOrigin: window.location.origin,
      pageId,
      tabId: currentTabId,
      frameUrl,
      scopedLocator: info.scopedLocator || locator.scopedLocator,
      title: document.title,
      timestamp: Date.now(),
      sessionId: currentSessionId,
      selector: locator.primary.value || selector || '',
      locator,
      structuredLocator: info.structuredLocator || locator.structuredLocator || locator.primary?.structuredLocator,
      elementName:
        info.text ||
        info.placeholder ||
        info.name ||
        element?.getAttribute?.('aria-label') ||
        element?.getAttribute?.('name') ||
        element?.id ||
        info.tagName ||
        'Element',
      role: info.role || element?.getAttribute?.('role') || '',
      tagName: info.tagName || element?.tagName?.toLowerCase() || '',
      text: info.text || (element?.innerText || element?.textContent || '').trim().substring(0, 100),
      value: val,
      masked: sensitive,
      targetBox: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      coordinates: rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null,
      ...extra
    };
  }

  function sendStep(step) {
    // If state is still resolving on a newly loaded/redirected page, buffer action so it is never lost
    if (!isStateResolved) {
      console.log('[QA Recorder Content] State not yet resolved; buffering step:', step.action);
      earlyEventBuffer.push(step);
      refreshRecordingState();
      return;
    }

    if (!isPageRecording) {
      return;
    }

    // Never record the tester's clicks inside the AutomatiQA UI itself.
    if (isAutomatiQaPage) {
      return;
    }

    if (!isExtensionContextValid()) {
      console.warn('[QA Recorder Content] Cannot record step: extension context invalid.');
      return;
    }

    if (!step.sessionId && currentSessionId) {
      step.sessionId = currentSessionId;
    }

    safeRuntimeSendMessage({
      type: 'STEP',
      payload: step
    });

    console.log('[QA Recorder Content] Recorded action:', step.action, step.elementName || '', step.url);
  }

  function flushPendingInput() {
    if (pendingInputStep) {
      clearTimeout(inputDebounceTimer);
      const step = pendingInputStep;
      pendingInputStep = null;
      sendStep(step);
    }
  }

  // ------------------------------------------------------------
  // EVENT LISTENERS (CAPTURE PHASE)
  // ------------------------------------------------------------

  // 1. CLICK
  document.addEventListener(
    'click',
    (event) => {
      // Flush any pending text input before processing click
      flushPendingInput();

      const realTarget = getRealTarget(event);
      const element = getInteractiveElement(realTarget);
      if (!element) return;

      highlightElement(element);

      const step = createStep('click', element, {
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        x: event.pageX,
        y: event.pageY,
        viewportX: event.clientX,
        viewportY: event.clientY,
        recordedViewport: { width: window.innerWidth, height: window.innerHeight }
      });

      sendStep(step);
    },
    true
  );

  // 2. DOUBLE CLICK
  document.addEventListener(
    'dblclick',
    (event) => {
      flushPendingInput();

      const realTarget = getRealTarget(event);
      const element = getInteractiveElement(realTarget);
      if (!element) return;

      highlightElement(element);

      const step = createStep('dblclick', element, {
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        x: event.pageX,
        y: event.pageY,
        viewportX: event.clientX,
        viewportY: event.clientY,
        recordedViewport: { width: window.innerWidth, height: window.innerHeight }
      });

      sendStep(step);
    },
    true
  );

  // 3. HOVER (MOUSEOVER)
  document.addEventListener(
    'mouseover',
    (event) => {
      const realTarget = getRealTarget(event);
      const element = getInteractiveElement(realTarget);
      if (!element) return;

      const now = Date.now();
      if (element === lastHoverElement && now - lastHoverTime < 800) {
        return;
      }
      lastHoverElement = element;
      lastHoverTime = now;
    },
    true
  );

  // 4. INPUT / CHANGE (TEXT FIELDS, TEXTAREAS)
  document.addEventListener(
    'input',
    (event) => {
      const realTarget = getRealTarget(event);
      if (!realTarget) return;

      if (
        realTarget instanceof HTMLInputElement ||
        realTarget instanceof HTMLTextAreaElement ||
        realTarget.isContentEditable
      ) {
        // Debounce typing so we don't spam a step per keystroke
        clearTimeout(inputDebounceTimer);

        const isSensitive = isSensitiveElement(realTarget);
        const val = isSensitive ? '[MASKED]' : (realTarget.value || realTarget.textContent || '');

        pendingInputStep = createStep('fill', realTarget, {
          value: val,
          masked: isSensitive
        });

        inputDebounceTimer = setTimeout(() => {
          flushPendingInput();
        }, 500);
      }
    },
    true
  );

  // 5. CHANGE EVENT (SELECT DROPDOWNS, CHECKBOXES, RADIOS)
  document.addEventListener(
    'change',
    (event) => {
      const realTarget = getRealTarget(event);
      if (!realTarget) return;

      if (realTarget instanceof HTMLSelectElement) {
        const val = realTarget.value || (realTarget.selectedOptions?.[0]?.textContent || '').trim();
        const step = createStep('selectOption', realTarget, {
          value: val
        });
        sendStep(step);
      } else if (realTarget instanceof HTMLInputElement) {
        if (realTarget.type === 'checkbox') {
          const action = realTarget.checked ? 'check' : 'uncheck';
          const step = createStep(action, realTarget, {
            checked: realTarget.checked,
            value: realTarget.checked ? 'checked' : 'unchecked'
          });
          sendStep(step);
        } else if (realTarget.type === 'radio') {
          if (realTarget.checked) {
            const step = createStep('check', realTarget, {
              checked: true,
              value: realTarget.value || 'checked'
            });
            sendStep(step);
          }
        }
      }
    },
    true
  );

  // 6. KEYDOWN (ENTER, TAB, ESCAPE)
  document.addEventListener(
    'keydown',
    (event) => {
      if (['Enter', 'Tab', 'Escape'].includes(event.key)) {
        flushPendingInput();

        const realTarget = getRealTarget(event);
        const element = getInteractiveElement(realTarget) || document.activeElement;
        if (!element) return;

        const step = createStep('press', element, {
          key: event.key,
          value: event.key
        });

        sendStep(step);
      }
    },
    true
  );

  // 7. FORM SUBMIT
  document.addEventListener(
    'submit',
    () => {
      flushPendingInput();
    },
    true
  );

  // 8. SCROLL
  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (!isPageRecording) return;
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;

        // Only record meaningful scrolls
        if (scrollY > 150) {
          sendStep({
            action: 'scroll',
            url: window.location.href,
            pageUrl: window.location.href,
            title: document.title,
            timestamp: Date.now(),
            sessionId: currentSessionId,
            selector: 'window',
            elementName: 'Window Scroll',
            value: `scroll(${scrollX}, ${scrollY})`,
            scrollX,
            scrollY
          });
        }
      }, 600);
    },
    { passive: true }
  );

  console.log('[QA Recorder Content] Content script initialized successfully on:', window.location.href);
})();
