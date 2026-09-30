/**
 * AutomatiQA Web Performance Agent Bridge - Content Script
 *
 * Facilitates two-way communication:
 * 1. Between the Web Performance Testing page in AI Studio and the background worker.
 * 2. On recorded pages: captures user interactions (clicks, form submits, typed input values,
 *    dropdown selections, checkboxes) from real DOM values at the moment of interaction.
 */

(function () {
  const NAMESPACE = 'automatiqa-web-performance';
  const PAGE_SOURCE = 'automatiqa-web-perf-page';
  const BRIDGE_SOURCE = 'automatiqa-web-perf-bridge';

  // Mark window presence for the AutomatiQA UI
  try {
    window.__AUTOMATIQA_WEB_PERF_BRIDGE__ = {
      installed: true,
      version: '1.0.0',
      timestamp: Date.now()
    };
  } catch (e) {}

  let bridgePort = null;

  function initBridgePort() {
    try {
      bridgePort = chrome.runtime.connect({ name: NAMESPACE });

      bridgePort.onMessage.addListener((msg) => {
        if (!msg || msg.namespace !== NAMESPACE) return;
        // Relay to window for the AutomatiQA page
        window.postMessage({
          ...msg,
          namespace: NAMESPACE,
          source: BRIDGE_SOURCE
        }, '*');
      });

      bridgePort.onDisconnect.addListener(() => {
        bridgePort = null;
        window.postMessage({
          namespace: NAMESPACE,
          source: BRIDGE_SOURCE,
          type: 'bridge_status',
          bridgeInstalled: true,
          agentStatus: 'disconnected'
        }, '*');
      });
    } catch (err) {
      bridgePort = null;
    }
  }

  initBridgePort();

  // Listen for messages from background script broadcast
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.namespace === NAMESPACE) {
      window.postMessage({
        ...msg,
        namespace: NAMESPACE,
        source: BRIDGE_SOURCE
      }, '*');
    }
  });

  // Listen for messages from the AI Studio Web Performance Testing page
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;

    const data = event.data;
    if (data.namespace !== NAMESPACE || data.source !== PAGE_SOURCE) {
      return;
    }

    const action = data.action;
    const payload = data.payload || {};

    if (action === 'ping_bridge') {
      // Immediate direct pong
      window.postMessage({
        namespace: NAMESPACE,
        source: BRIDGE_SOURCE,
        type: 'bridge_status',
        bridgeInstalled: true,
        bridgeVersion: '1.0.0',
        timestamp: Date.now()
      }, '*');
    }

    // Forward action to background worker
    if (!bridgePort) {
      initBridgePort();
    }

    if (bridgePort) {
      try {
        bridgePort.postMessage({
          namespace: NAMESPACE,
          action: action,
          payload: payload
        });
      } catch (e) {
        chrome.runtime.sendMessage({
          namespace: NAMESPACE,
          action: action,
          payload: payload
        }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response) {
            window.postMessage({
              ...response,
              namespace: NAMESPACE,
              source: BRIDGE_SOURCE
            }, '*');
          }
        });
      }
    } else {
      chrome.runtime.sendMessage({
        namespace: NAMESPACE,
        action: action,
        payload: payload
      }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response) {
          window.postMessage({
            ...response,
            namespace: NAMESPACE,
            source: BRIDGE_SOURCE
          }, '*');
        }
      });
    }
  });

  // Initial announcement to page
  window.postMessage({
    namespace: NAMESPACE,
    source: BRIDGE_SOURCE,
    type: 'bridge_status',
    bridgeInstalled: true,
    bridgeVersion: '1.0.0'
  }, '*');

  // =========================================================================
  // DOM INTERACTION CAPTURE (Active on any website being recorded)
  // =========================================================================
  const recentInteractions = new Map();
  const TRACKING_PARAM_REGEX = /^(?:_ga|_gid|_gat|utm_|fbclid|gclid|mc_eid|wickedid|dclid|zenid)/i;

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
    if (!name || TRACKING_PARAM_REGEX.test(name)) return;
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
    let curr = el;
    while (curr && curr.nodeType === 1) {
      let selector = curr.tagName.toLowerCase();
      if (curr.className && typeof curr.className === 'string' && curr.className.trim()) {
        const firstClass = curr.className.trim().split(/\s+/)[0];
        if (firstClass && !firstClass.includes(':') && !firstClass.includes('[')) {
          selector += `.${firstClass}`;
        }
      }
      path.unshift(selector);
      curr = curr.parentElement;
      if (path.length >= 3) break;
    }
    return path.join(' > ');
  }

  function collectAllFormValues(targetEl) {
    const result = {};
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

    // Merge recent interactions
    const now = Date.now();
    recentInteractions.forEach((item, name) => {
      if (now - item.timestamp < 90000) {
        if (item.value !== '' || result[name] === undefined) {
          result[name] = item.value;
        }
      }
    });

    return result;
  }

  function inferActionIntent(text, formData, url, selector) {
    const t = (text || '').toLowerCase();
    const u = (url || '').toLowerCase();
    const keys = Object.keys(formData || {}).map(k => k.toLowerCase()).join(' ');

    if (t.includes('login') || t.includes('sign in') || t.includes('log in') || keys.includes('password') || keys.includes('pwd')) {
      return 'Login';
    }
    if (t.includes('search') || t.includes('find') || keys.includes('search') || keys.includes('query') || keys.includes('q') || keys.includes('keyword')) {
      return 'Search';
    }
    if (t.includes('add to cart') || t.includes('add to bag') || t.includes('add to basket')) {
      return 'Add to Cart';
    }
    if (t.includes('checkout') || t.includes('proceed to checkout')) {
      return 'Checkout';
    }
    if (t.includes('select hotel') || t.includes('radiobutton') || keys.includes('radiobutton_')) {
      return 'Select Hotel';
    }
    if (t.includes('book') || t.includes('reserve') || keys.includes('room_type') || keys.includes('num_rooms')) {
      return 'Book';
    }
    if (t.includes('pay') || t.includes('confirm order') || keys.includes('card_number') || keys.includes('cvv')) {
      return 'Payment';
    }
    if (t.includes('register') || t.includes('sign up') || keys.includes('confirm_password')) {
      return 'Register';
    }
    if (t.includes('filter') || t.includes('apply')) {
      return 'Apply Filter';
    }
    if (t.includes('stations') || keys.includes('station')) {
      return 'Search Stations';
    }
    if (t.includes('logout') || t.includes('sign out')) {
      return 'Logout';
    }

    // Never return "Submit Form" or "Scenario N"
    if (t.length > 2 && t.length < 35 && !t.includes('\n')) {
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
    return 'Perform Action';
  }

  function notifyUserAction(actionType, targetEl, customText) {
    try {
      const formData = collectAllFormValues(targetEl);
      const rawText = customText || (targetEl ? (targetEl.innerText || targetEl.value || targetEl.getAttribute('aria-label') || targetEl.getAttribute('title') || '') : '').trim();
      const selector = getCssSelector(targetEl);
      const tag = targetEl && targetEl.tagName ? targetEl.tagName.toLowerCase() : '';
      const intent = inferActionIntent(rawText, formData, window.location.href, selector);

      const actionData = {
        action: actionType,
        actionIntent: intent,
        selector,
        tagName: tag,
        text: rawText.substring(0, 100),
        formData: Object.keys(formData).length > 0 ? formData : undefined,
        url: window.location.href,
        timestamp: Date.now()
      };

      chrome.runtime.sendMessage({
        namespace: NAMESPACE,
        action: 'user_action_recorded',
        payload: actionData
      }).catch(() => {});
    } catch (e) {}
  }

  // Keydown Enter
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const target = e.target;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
        recordElementInteraction(target);
        notifyUserAction('submit', target, `Enter on ${target.name || target.id || target.value || 'Input'}`);
      }
    }
  }, true);

  // Click
  document.addEventListener('click', (e) => {
    try {
      const target = e.target;
      if (!target) return;
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      const isButtonLike = tag === 'button' || target.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button'].includes(target.type)) || !!target.closest('button, [role="button"], input[type="submit"]');

      if (isButtonLike || target.closest('form, [role="form"], fieldset, .form')) {
        notifyUserAction(isButtonLike && target.type === 'submit' ? 'submit' : 'click', target);
      }
    } catch (err) {}
  }, true);

  // Form Submit
  document.addEventListener('submit', (e) => {
    try {
      notifyUserAction('submit', e.target, 'Form Submission');
    } catch (err) {}
  }, true);
})();
