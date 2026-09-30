export const EXTENSION_MANIFEST_CONTENT = `{
  "manifest_version": 3,
  "name": "QA Recorder",
  "version": "1.0",
  "description": "Browser extension for QA recording actions",
  "permissions": [
    "activeTab",
    "alarms",
    "scripting",
    "storage",
    "tabs",
    "webNavigation"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["locator-engine.js", "utils.js", "content.js"],
      "run_at": "document_start",
      "all_frames": true,
      "match_about_blank": true
    }
  ]
}
`;

export const EXTENSION_LOCATOR_ENGINE_CONTENT = `/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Source: services/structuredLocator.ts (SHARED_LOCATOR_ENGINE_SCRIPT)
 * Regenerate: node scripts/build-extension-engine.mjs
 *
 * Defines window.__automatiqaLocatorEngine inside the extension's isolated
 * world so utils.js and content.js can apply the 14-tier Playwright locator
 * priority hierarchy:
 *   getByRole > getByText > getByLabel > getByPlaceholder > getByAltText >
 *   getByTitle > getByTestId > id > name > href > scoped > css > xpath > nth
 */

(function() {
  if (window.__automatiqaLocatorEngine) return;

  const TEST_ID_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-test-id', 'data-automation-id'];
  const RANDOM_OR_GENERATED_ID_PATTERNS = [
    /^\\d+$/, /^\\d/, /:r[0-9a-zA-Z_-]+:/, /^react-\\d+/i, /^__react[a-zA-Z0-9_-]+/i,
    /^emberh?\\d+/i, /^ng-[a-zA-Z0-9_-]+/i, /^v-[a-zA-Z0-9_-]+/i, /^css-[a-zA-Z0-9]{4,}/i,
    /^sc-[a-zA-Z0-9]{4,}/i, /^mui-[a-zA-Z0-9_-]+/i, /^chakra-[a-zA-Z0-9_-]+/i, /^[a-zA-Z]+[0-9]{4,}$/,
    /^[a-zA-Z0-9_-]+_[0-9]{4,}$/, /^[a-f0-9]{8,}$/i, /^r[0-9][a-z0-9]{3,}$/i, /^[a-zA-Z0-9]{12,}$/
  ];

  function isStableId(id) {
    if (!id || typeof id !== 'string') return false;
    const trimmed = id.trim();
    if (trimmed.length < 2 || trimmed.length > 80) return false;
    for (const pattern of RANDOM_OR_GENERATED_ID_PATTERNS) {
      if (pattern.test(trimmed)) return false;
    }
    return /[a-zA-Z]/.test(trimmed);
  }

  function isStableClass(className) {
    if (!className || typeof className !== 'string') return false;
    const trimmed = className.trim();
    if (trimmed.length < 3 || trimmed.length > 50) return false;
    const UNSTABLE_PATTERNS = [/^(active|selected|hover|focus|open|opened|closed|show|shown|disabled|loading|current|visible|hidden)$/i, /^css-[a-zA-Z0-9]{4,}/i, /^sc-[a-zA-Z0-9]{4,}/i];
    for (const p of UNSTABLE_PATTERNS) if (p.test(trimmed)) return false;
    return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(trimmed);
  }

  function esc(value) {
    return String(value || '').replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
  }

  function cssEsc(value) {
    return typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function' ? CSS.escape(String(value || '')) : String(value || '').replace(/([ #;?%&,.+*~':"!^$[\\]()=>|/@])/g, '\\\\$1');
  }

  function isVolatileText(text) {
    if (!text || typeof text !== 'string') return false;
    const str = text.trim();
    if (!str) return false;
    if (/\\(\\d+\\)/.test(str)) return true;
    if (/\\b(?:cart|inbox|items?|messages?|notifications?|results?|unread|count)\\s*\\(?\\d+\\)?/i.test(str)) return true;
    if (/\\b\\d+\\s+(?:items?|messages?|notifications?|unread|results?|new|cart)\\b/i.test(str)) return true;
    if (/\\b(?:\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:am|pm)?|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}|\\d{4}-\\d{2}-\\d{2})\\b/i.test(str)) return true;
    if (/[$€£¥₹]\\s*\\d+/.test(str)) return true;
    return false;
  }

  function getComputedRole(el) {
    if (!el || el.nodeType !== 1) return '';
    const explicitRole = el.getAttribute ? el.getAttribute('role') : null;
    if (explicitRole) {
      const trimmed = explicitRole.trim().toLowerCase();
      if (trimmed === 'none' || trimmed === 'presentation') return '';
      return trimmed;
    }
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'a' || tag === 'area') return el.hasAttribute && el.hasAttribute('href') ? 'link' : '';
    if (tag === 'button') return 'button';
    if (tag === 'input') {
      const type = (el.type || 'text').toLowerCase();
      if (['text', 'search', 'email', 'tel', 'url'].includes(type)) return 'textbox';
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (['submit', 'reset', 'button', 'image'].includes(type)) return 'button';
      return 'textbox';
    }
    if (tag === 'select') return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'img') return 'img';
    return '';
  }

  function getAccessibleName(el) {
    if (!el || el.nodeType !== 1) return '';
    const root = el.getRootNode ? el.getRootNode() : (el.ownerDocument || document);

    const labelledBy = el.getAttribute ? el.getAttribute('aria-labelledby') : null;
    if (labelledBy && labelledBy.trim()) {
      const ids = labelledBy.trim().split(/\\s+/);
      const parts = [];
      for (const id of ids) {
        let targetEl = null;
        try { targetEl = root.querySelector('#' + cssEsc(id)); } catch(e) {}
        if (targetEl) {
          const txt = (targetEl.innerText || targetEl.textContent || '').replace(/\\s+/g, ' ').trim();
          if (txt) parts.push(txt);
        }
      }
      if (parts.length > 0) return parts.join(' ');
    }

    const ariaLabel = el.getAttribute ? el.getAttribute('aria-label') : null;
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.replace(/\\s+/g, ' ').trim();

    if (el.id) {
      let lEl = null;
      try { lEl = root.querySelector('label[for="' + cssEsc(el.id) + '"]'); } catch(e) {}
      if (lEl) {
        const txt = (lEl.innerText || lEl.textContent || '').replace(/\\s+/g, ' ').trim();
        if (txt) return txt;
      }
    }

    const parentLabel = el.closest ? el.closest('label') : null;
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      const inputs = clone.querySelectorAll('input, select, textarea, button');
      inputs.forEach(i => i.remove());
      const txt = (clone.innerText || clone.textContent || '').replace(/\\s+/g, ' ').trim();
      if (txt) return txt;
    }

    const ph = el.getAttribute ? el.getAttribute('placeholder') : null;
    if (ph && ph.trim()) return ph.replace(/\\s+/g, ' ').trim();

    const alt = el.getAttribute ? el.getAttribute('alt') : null;
    if (alt && alt.trim()) return alt.replace(/\\s+/g, ' ').trim();

    const title = el.getAttribute ? el.getAttribute('title') : null;
    if (title && title.trim()) return title.replace(/\\s+/g, ' ').trim();

    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const role = getComputedRole(el);
    const explicitRole = el.hasAttribute ? el.hasAttribute('role') : false;

    if (tag === 'button' || tag === 'a' || /^h[1-6]$/.test(tag) || tag === 'td' || tag === 'th' || tag === 'summary' || tag === 'option' || tag === 'li' || explicitRole || (role && role !== 'textbox' && role !== 'combobox')) {
      const txt = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (txt) return txt;
    }

    return '';
  }

  function generateStructuredLocatorForElement(el) {
    if (!el || el.nodeType !== 1) return { strategy: 'css', value: 'body', name: 'body', matchCount: 1 };
    const root = (el.getRootNode && el.getRootNode()) || el.ownerDocument || document;

    const shadowPath = [];
    let isClosedShadow = false;
    let curr = el;
    while (curr) {
      const r = curr.getRootNode ? curr.getRootNode() : null;
      if (r && typeof ShadowRoot !== 'undefined' && r instanceof ShadowRoot) {
        const host = r.host;
        if (!host) break;
        if (r.mode === 'closed' || !host.shadowRoot) isClosedShadow = true;
        let hostSel = host.tagName.toLowerCase();
        if (host.id && isStableId(host.id)) hostSel += '#' + host.id;
        else if (host.getAttribute && host.getAttribute('data-testid')) hostSel += '[data-testid="' + host.getAttribute('data-testid') + '"]';
        shadowPath.unshift(hostSel);
        curr = host;
      } else break;
    }

    const frameChain = [];
    const doc = el.ownerDocument || document;
    const win = doc.defaultView || window;
    let currWin = win;
    while (currWin && currWin !== currWin.top) {
      try {
        const frameEl = currWin.frameElement;
        if (frameEl) {
          let frameSel = 'iframe';
          const name = frameEl.getAttribute ? frameEl.getAttribute('name') : null;
          const id = frameEl.id;
          if (name) frameSel = 'iframe[name="' + cssEsc(name) + '"]';
          else if (id && isStableId(id)) frameSel = 'iframe#' + cssEsc(id);
          frameChain.unshift(frameSel);
          currWin = currWin.parent;
        } else break;
      } catch(e) { break; }
    }

    if (isClosedShadow) {
      const hostTag = shadowPath.join(' >> ') || el.tagName.toLowerCase();
      return { strategy: 'css', value: hostTag, name: hostTag, shadowPath: [], frameChain, matchCount: 1 };
    }

    const tagName = el.tagName ? el.tagName.toLowerCase() : '';
    const computedRole = getComputedRole(el);
    const accName = getAccessibleName(el);

    const queryMatchesInRoot = (selector) => {
      try { return Array.from(root.querySelectorAll(selector)); } catch(e) { return []; }
    };
    const isUniqueMatch = (matches) => matches.length === 1 && matches[0] === el;

    if (tagName === 'iframe') {
      const nameAttr = el.getAttribute ? el.getAttribute('name') : null;
      if (nameAttr) return { strategy: 'css', value: 'iframe[name="' + cssEsc(nameAttr) + '"]', name: 'iframe[name="' + nameAttr + '"]', matchCount: 1, frameChain, shadowPath };
    }

    let firstRoleCandidate = null;
    const isExplicitRole = el.hasAttribute ? el.hasAttribute('role') : false;
    const isTextInput = (tagName === 'input' && ['text', 'search', 'email', 'tel', 'url', 'number', 'password'].includes((el.type || '').toLowerCase())) || tagName === 'textarea';
    const shouldSkipTier1 = (tagName === 'img' && !isExplicitRole) || (isTextInput && !isExplicitRole);

    if (computedRole && accName && !shouldSkipTier1 && !isVolatileText(accName)) {
      const allMatching = queryMatchesInRoot('*').filter(cand => getComputedRole(cand) === computedRole && getAccessibleName(cand) === accName);
      if (isUniqueMatch(allMatching)) {
        return { strategy: 'role', role: computedRole, name: accName, exact: true, value: '[role="' + computedRole + '"][name="' + accName + '"]', matchCount: 1, frameChain, shadowPath };
      } else if (allMatching.length > 1) {
        const idx = allMatching.indexOf(el);
        if (idx !== -1) {
          firstRoleCandidate = { strategy: 'role', role: computedRole, name: accName, exact: true, value: '[role="' + computedRole + '"][name="' + accName + '"]', nthIndex: idx, matchCount: allMatching.length, frameChain, shadowPath };
        }
      }
    }

    const textDisplayTags = ['p', 'span', 'b', 'i', 'strong', 'em', 'small', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'button', 'a', 'option', 'td', 'th', 'li'];
    const hasDataTestId = TEST_ID_ATTRS.some(attr => el.hasAttribute ? el.hasAttribute(attr) : false);

    if (textDisplayTags.includes(tagName) && !hasDataTestId) {
      const ownText = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (ownText && ownText.length > 1 && ownText.length < 100 && !isVolatileText(ownText)) {
        const hasChildText = Array.from(el.children || []).some(child => (child.innerText || child.textContent || '').replace(/\\s+/g, ' ').trim().length > 0);
        if (!hasChildText || (el.children.length === 1 && el.children[0].tagName.toLowerCase() === 'svg')) {
          const allTextMatching = queryMatchesInRoot('*').filter(cand => {
            if (['input', 'textarea', 'select'].includes(cand.tagName.toLowerCase())) return false;
            return (cand.innerText || cand.textContent || '').replace(/\\s+/g, ' ').trim() === ownText;
          });
          if (isUniqueMatch(allTextMatching)) {
            return { strategy: 'text', name: ownText, value: ownText, exact: true, matchCount: 1, frameChain, shadowPath };
          }
        }
      }
    }

    let labelText = '';
    if (el.id) {
      let lEl = null;
      try { lEl = root.querySelector('label[for="' + cssEsc(el.id) + '"]'); } catch(e) {}
      if (lEl) labelText = (lEl.innerText || lEl.textContent || '').replace(/\\s+/g, ' ').trim();
    }
    if (!labelText && el.closest) {
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, select, textarea, button');
        inputs.forEach(i => i.remove());
        labelText = (clone.innerText || clone.textContent || '').replace(/\\s+/g, ' ').trim();
      }
    }
    if (!labelText && el.getAttribute && el.getAttribute('aria-label')) {
      labelText = el.getAttribute('aria-label').replace(/\\s+/g, ' ').trim();
    }

    if (labelText && !isVolatileText(labelText)) {
      const labelMatches = queryMatchesInRoot('input, select, textarea, button, [role]').filter(ctrl => {
        let cLabel = '';
        if (ctrl.id) {
          const l = root.querySelector('label[for="' + cssEsc(ctrl.id) + '"]');
          if (l) cLabel = (l.innerText || l.textContent || '').replace(/\\s+/g, ' ').trim();
        }
        if (!cLabel && ctrl.closest) {
          const pl = ctrl.closest('label');
          if (pl) {
            const clone = pl.cloneNode(true);
            const inputs = clone.querySelectorAll('input, select, textarea, button');
            inputs.forEach(i => i.remove());
            cLabel = (clone.innerText || clone.textContent || '').replace(/\\s+/g, ' ').trim();
          }
        }
        if (!cLabel && ctrl.getAttribute && ctrl.getAttribute('aria-label')) cLabel = ctrl.getAttribute('aria-label').replace(/\\s+/g, ' ').trim();
        return cLabel === labelText;
      });
      if (isUniqueMatch(labelMatches)) {
        return { strategy: 'label', name: labelText, value: labelText, exact: true, matchCount: 1, frameChain, shadowPath };
      }
    }

    const placeholder = el.getAttribute ? el.getAttribute('placeholder') : null;
    if (placeholder && placeholder.trim()) {
      const cleanPh = placeholder.replace(/\\s+/g, ' ').trim();
      const phMatches = queryMatchesInRoot('[placeholder="' + cssEsc(cleanPh) + '"]');
      if (isUniqueMatch(phMatches)) return { strategy: 'placeholder', name: cleanPh, value: cleanPh, exact: true, matchCount: 1, frameChain, shadowPath };
    }

    const alt = el.getAttribute ? el.getAttribute('alt') : null;
    if (alt && alt.trim() && !isVolatileText(alt)) {
      const cleanAlt = alt.replace(/\\s+/g, ' ').trim();
      const altMatches = queryMatchesInRoot('[alt="' + cssEsc(cleanAlt) + '"]');
      if (isUniqueMatch(altMatches)) return { strategy: 'alt', name: cleanAlt, value: cleanAlt, exact: true, matchCount: 1, frameChain, shadowPath };
    }

    const title = el.getAttribute ? el.getAttribute('title') : null;
    if (title && title.trim() && !isVolatileText(title)) {
      const cleanTitle = title.replace(/\\s+/g, ' ').trim();
      const titleMatches = queryMatchesInRoot('[title="' + cssEsc(cleanTitle) + '"]');
      if (isUniqueMatch(titleMatches)) return { strategy: 'title', name: cleanTitle, value: cleanTitle, exact: true, matchCount: 1, frameChain, shadowPath };
    }

    for (const attr of TEST_ID_ATTRS) {
      const val = el.getAttribute ? el.getAttribute(attr) : null;
      if (val && val.trim()) {
        const cleanVal = val.trim();
        const sel = '[' + attr + '="' + cssEsc(cleanVal) + '"]';
        const matches = queryMatchesInRoot(sel);
        if (isUniqueMatch(matches)) return { strategy: 'testid', testIdAttribute: attr, name: cleanVal, value: cleanVal, matchCount: 1, frameChain, shadowPath };
      }
    }

    if (el.id && isStableId(el.id)) {
      const sel = '#' + cssEsc(el.id);
      const matches = queryMatchesInRoot(sel);
      if (isUniqueMatch(matches)) return { strategy: 'id', value: el.id, name: el.id, matchCount: 1, frameChain, shadowPath };
    }

    const nameAttr = el.getAttribute ? el.getAttribute('name') : null;
    if (nameAttr && nameAttr.trim()) {
      const cleanName = nameAttr.trim();
      const sel = '[name="' + cssEsc(cleanName) + '"]';
      const matches = queryMatchesInRoot(sel);
      if (isUniqueMatch(matches)) return { strategy: 'name', name: cleanName, value: cleanName, matchCount: 1, frameChain, shadowPath };
    }

    const href = el.getAttribute ? el.getAttribute('href') : null;
    if ((tagName === 'a' || tagName === 'area') && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      const sel = 'a[href="' + cssEsc(href) + '"]';
      const matches = queryMatchesInRoot(sel);
      if (isUniqueMatch(matches)) return { strategy: 'href', name: href, value: href, matchCount: 1, frameChain, shadowPath };
    }

    let currentAncestor = el.parentElement;
    let ancestorDepth = 0;
    while (currentAncestor && ancestorDepth < 10 && currentAncestor !== root) {
      let ancestorSelector = '';
      let ancestorStrategy = '';
      for (const attr of TEST_ID_ATTRS) {
        const aVal = currentAncestor.getAttribute ? currentAncestor.getAttribute(attr) : null;
        if (aVal && aVal.trim()) { ancestorSelector = '[' + attr + '="' + cssEsc(aVal.trim()) + '"]'; ancestorStrategy = 'testid'; break; }
      }
      if (!ancestorSelector && currentAncestor.id && isStableId(currentAncestor.id)) {
        ancestorSelector = '#' + cssEsc(currentAncestor.id); ancestorStrategy = 'id';
      }
      if (ancestorSelector && queryMatchesInRoot(ancestorSelector).length === 1) {
        if (computedRole && accName && !isVolatileText(accName)) {
          const scopedMatches = Array.from(currentAncestor.querySelectorAll('*')).filter(cand => getComputedRole(cand) === computedRole && getAccessibleName(cand) === accName);
          if (isUniqueMatch(scopedMatches)) {
            return { strategy: 'scope', scope: ancestorSelector, scopeStrategy: ancestorStrategy, childStrategy: 'role', role: computedRole, name: accName, exact: true, value: ancestorSelector + ' >> [role="' + computedRole + '"][name="' + accName + '"]', matchCount: 1, frameChain, shadowPath };
          }
        }
      }
      currentAncestor = currentAncestor.parentElement;
      ancestorDepth++;
    }

    if (firstRoleCandidate) return firstRoleCandidate;

    const buildCssPath = (target) => {
      const parts = [];
      let cur = target;
      while (cur && cur !== root && cur.nodeType === 1) {
        let part = cur.tagName.toLowerCase();
        if (cur.id && isStableId(cur.id)) { parts.unshift('#' + cssEsc(cur.id)); break; }
        const parent = cur.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === cur.tagName);
          if (siblings.length > 1) { const idx = siblings.indexOf(cur) + 1; part += ':nth-of-type(' + idx + ')'; }
        }
        parts.unshift(part);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    };

    const cssPath = buildCssPath(el);
    const cssMatches = queryMatchesInRoot(cssPath);
    if (isUniqueMatch(cssMatches)) return { strategy: 'css', value: cssPath, name: cssPath, matchCount: 1, frameChain, shadowPath };

    const idx = cssMatches.indexOf(el);
    return { strategy: 'css', value: cssPath, name: cssPath, nthIndex: idx !== -1 ? idx : 0, matchCount: Math.max(1, cssMatches.length), frameChain, shadowPath };
  }

  function toPlaywrightScript(loc) {
    if (!loc) return "page.locator('body')";
    let baseExpr = '';
    const safeName = esc(loc.name || loc.value || '');
    const safeVal = esc(loc.value || '');

    if (loc.strategy === 'scope' && loc.scope) {
      const scopeExpr = "page.locator('" + esc(loc.scope) + "')";
      if (loc.childStrategy === 'role' && loc.role) {
        baseExpr = scopeExpr + ".getByRole('" + loc.role + "', { name: '" + safeName + "', exact: " + (loc.exact !== false) + " })";
      } else if (loc.childStrategy === 'placeholder') {
        baseExpr = scopeExpr + ".getByPlaceholder('" + safeName + "', { exact: true })";
      } else if (loc.childStrategy === 'label') {
        baseExpr = scopeExpr + ".getByLabel('" + safeName + "', { exact: true })";
      } else if (loc.childStrategy === 'testid') {
        baseExpr = scopeExpr + ".getByTestId('" + (safeName || safeVal) + "')";
      } else if (loc.childStrategy === 'text') {
        baseExpr = scopeExpr + ".getByText('" + (safeName || safeVal) + "', { exact: true })";
      } else {
        baseExpr = scopeExpr + ".locator('" + esc(loc.childValue || safeVal) + "')";
      }
    } else {
      switch (loc.strategy) {
        case 'role': baseExpr = "page.getByRole('" + loc.role + "', { name: '" + safeName + "', exact: " + (loc.exact !== false) + " })"; break;
        case 'text': baseExpr = "page.getByText('" + (safeName || safeVal) + "', { exact: true })"; break;
        case 'label': baseExpr = "page.getByLabel('" + safeName + "', { exact: true })"; break;
        case 'placeholder': baseExpr = "page.getByPlaceholder('" + safeName + "', { exact: true })"; break;
        case 'alt': baseExpr = "page.getByAltText('" + safeName + "', { exact: true })"; break;
        case 'title': baseExpr = "page.getByTitle('" + safeName + "', { exact: true })"; break;
        case 'testid':
          if (loc.testIdAttribute === 'data-testid' || !loc.testIdAttribute) baseExpr = "page.getByTestId('" + (safeName || safeVal) + "')";
          else baseExpr = "page.locator('[" + loc.testIdAttribute + '="' + (safeName || safeVal) + '"]' + "')";
          break;
        case 'id': baseExpr = "page.locator('#" + safeVal + "')"; break;
        case 'name': baseExpr = "page.locator('[name=" + '"' + safeVal + '"' + "]')"; break;
        case 'href': baseExpr = "page.locator('a[href=" + '"' + safeVal + '"' + "]')"; break;
        case 'css': baseExpr = "page.locator('" + safeVal + "')"; break;
        case 'xpath': baseExpr = "page.locator('xpath=" + safeVal + "')"; break;
        default: baseExpr = safeVal ? "page.locator('" + safeVal + "')" : "page.locator('body')";
      }
    }

    if (loc.shadowPath && loc.shadowPath.length > 0 && loc.strategy !== 'scope' && loc.strategy !== 'css') {
      const shadowChain = loc.shadowPath.map(h => "locator('" + esc(h) + "')").join('.');
      baseExpr = baseExpr.replace(/^page\\./, 'page.' + shadowChain + '.');
    }
    if (loc.frameChain && loc.frameChain.length > 0) {
      const frameExprs = loc.frameChain.map(f => "frameLocator('" + esc(f) + "')").join('.');
      baseExpr = baseExpr.replace(/^page\\./, 'page.' + frameExprs + '.');
    }
    if (typeof loc.nthIndex === 'number') baseExpr += '.nth(' + loc.nthIndex + ')';
    return baseExpr;
  }

  function generateLocatorBundle(el, action, value) {
    if (!el) return { primary: { type: 'css', value: 'body', playwright: "page.locator('body')", clickedIndex: 0, matchCount: 1, isUnique: true, confidence: 1 }, alternatives: [] };
    const structured = generateStructuredLocatorForElement(el);
    const pwExpr = toPlaywrightScript(structured);
    const primary = {
      type: structured.strategy === 'testid' ? (structured.testIdAttribute || 'data-testid') : structured.strategy,
      value: structured.value || structured.name || 'body',
      playwright: pwExpr,
      clickedIndex: typeof structured.nthIndex === 'number' ? structured.nthIndex : 0,
      matchCount: structured.matchCount || 1,
      isUnique: structured.nthIndex === null || structured.nthIndex === undefined,
      confidence: (structured.nthIndex === null || structured.nthIndex === undefined) ? 0.99 : 0.70,
      structuredLocator: structured
    };
    return {
      primary,
      alternatives: structured.scope ? [{ type: 'scope', value: structured.value || structured.scope, playwright: pwExpr, clickedIndex: 0, matchCount: 1, isUnique: true, confidence: 0.95, structuredLocator: structured }] : [],
      scopedLocator: structured.scope ? pwExpr : undefined,
      structuredLocator: structured
    };
  }

  window.__automatiqaLocatorEngine = {
    isStableId,
    isStableClass,
    isVolatileText,
    getComputedRole,
    getAccessibleName,
    generateStructuredLocatorForElement,
    toPlaywrightScript,
    generateLocatorBundle
  };
})();
`;

export const EXTENSION_UTILS_JS_CONTENT = `/**
 * Utility functions for the QA Recorder extension
 *
 * Loaded as a CLASSIC content script (no ES modules - Chrome MV3 content
 * scripts cannot use import/export). The locator engine itself lives in
 * locator-engine.js, which the manifest loads FIRST and which registers
 * window.__automatiqaLocatorEngine in this extension's isolated world.
 *
 * Implements strict Playwright Target Priority Hierarchy (14 Tiers):
 * 1. getByRole() — role + accessible name
 * 2. getByText() — visible text (non-input text-display elements only)
 * 3. getByLabel() — associated <label> or aria-label
 * 4. getByPlaceholder() — placeholder attribute
 * 5. getByAltText() — alt attribute
 * 6. getByTitle() — title attribute
 * 7. getByTestId() — configurable test-id attributes
 * 8. stable id
 * 9. name attribute
 * 10. href (links) or iframe attributes
 * 11. stable-ancestor scope + child locator
 * 12. unique CSS selector
 * 13. XPath
 * 14. nth index — absolute last resort
 */

(() => {
  const engine = window.__automatiqaLocatorEngine;

  if (!engine) {
    // Loud failure: silently degrading to css selectors is what produced
    // page.locator('div') for every recorded step.
    console.error(
      '[QA Recorder Utils] window.__automatiqaLocatorEngine is missing. ' +
      'locator-engine.js must be listed before utils.js in manifest.json. ' +
      'Locators will fall back to raw CSS selectors.'
    );
    return;
  }

  const {
    generateStructuredLocatorForElement,
    toPlaywrightScript,
    generateLocatorBundle,
    isStableId,
    isStableClass,
    getComputedRole,
    getAccessibleName,
    isVolatileText
  } = engine;

  function extractElementEvidence(el) {
    if (!el || typeof el !== 'object' || !el.tagName) {
      return { tagName: 'unknown' };
    }

    const tagName = String(el.tagName || '').toLowerCase();
    const id = el.id ? String(el.id) : undefined;
    const className = typeof el.className === 'string' ? el.className.trim() : undefined;
    const name = el.getAttribute?.('name') || undefined;
    const placeholder = el.getAttribute?.('placeholder') || undefined;
    const type = el.type ? String(el.type) : undefined;
    const href = el.getAttribute?.('href') || undefined;
    const dataTestId = el.getAttribute?.('data-testid') || el.getAttribute?.('data-test') || el.getAttribute?.('data-cy') || el.getAttribute?.('data-qa') || undefined;

    const role = getComputedRole(el);
    const accessibleName = getAccessibleName(el);
    const fullText = (el.textContent || '').replace(/\\s+/g, ' ').trim();

    return {
      tagName,
      id,
      className,
      name,
      role: role || undefined,
      accessibleName: accessibleName || undefined,
      placeholder,
      type,
      href,
      text: fullText ? fullText.slice(0, 100) : undefined,
      fullText: fullText || undefined,
      normalizedText: fullText ? fullText.toLowerCase().slice(0, 100) : undefined,
      dataTestId
    };
  }

  function generateSelector(el) {
    return generateLocatorBundle(el).primary;
  }

  function generateStructuredLocator(el) {
    return generateStructuredLocatorForElement(el);
  }

  function getElementInfo(el) {
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    const evidence = extractElementEvidence(el);
    const locator = generateLocatorBundle(el);
    const locatorInfo = locator.primary;

    return {
      tagName: evidence.tagName,
      id: el.id,
      name: el.name,
      role: evidence.role,
      text: evidence.text,
      placeholder: evidence.placeholder,
      value: el.value,
      type: el.type,
      selector: locatorInfo.value,
      locator,
      scopedLocator: locator.scopedLocator,
      structuredLocator: locator.structuredLocator,
      elementSnapshot: {
        tagName: evidence.tagName,
        id: el.id || '',
        className: el.className || '',
        name: el.getAttribute('name') || '',
        role: evidence.role || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        textContent: (el.textContent || '').trim().substring(0, 500),
        placeholder: evidence.placeholder || '',
        title: el.getAttribute('title') || '',
        href: el.getAttribute('href') || '',
        dataTestId: evidence.dataTestId || '',
        outerHTML: (el.outerHTML || '').substring(0, 2000),
        cssSelector: locatorInfo.type === 'css' ? locatorInfo.value : ''
      },
      rect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }
    };
  }

  window.QA_RECORDER_UTILS = {
    generateSelector,
    getElementInfo,
    generateLocatorBundle,
    generateStructuredLocator,
    toPlaywrightScript,
    isStableId,
    isStableClass,
    isVolatileText,
    getComputedRole,
    getAccessibleName,
    extractElementEvidence
  };

  console.log('[QA Recorder Utils] Locator engine ready (14-tier Playwright priority).');
})();
`;

export const EXTENSION_CONTENT_JS_CONTENT = `/**
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

  let isAutomatiQaPage = false; // becomes true once the page handshakes with us

  const pageProto = window.location.protocol;
  const wsProto = pageProto === 'https:' ? 'wss:' : 'ws:';
  const sameOriginBackendUrl =
    pageProto === 'http:' || pageProto === 'https:'
      ? \`\${wsProto}//\${window.location.host}/recorder\`
      : null;
  const sameOriginHttpUrl =
    pageProto === 'http:' || pageProto === 'https:' ? window.location.origin : null;

  function announceExtension() {
    isAutomatiQaPage = true;
    window.__QA_RECORDER_EXTENSION_ACTIVE__ = true;
    const detail = { version: '2.1', extensionId: (chrome.runtime && chrome.runtime.id) || null };
    window.postMessage({ type: 'AUTOMATIQA_EXTENSION_ACTIVE', ...detail }, '*');
    document.dispatchEvent(new CustomEvent('automatiqa:extension-active', { detail }));
    updateVisualIndicator(false, null);
  }

  function handleAppCommand(data, respond) {
    if (data.type === 'AUTOMATIQA_CHECK_EXTENSION') {
      announceExtension();
      return;
    }

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
    if (event.source !== window) return;

    handleAppCommand(data, (payload) => window.postMessage(payload, '*'));
  });

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
    if (isAutomatiQaPage || window.top !== window.self) return;

    if (recording) {
      if (!indicatorElement) {
        indicatorElement = document.createElement('div');
        indicatorElement.id = '__qa_recorder_status_badge__';
        indicatorElement.innerHTML = \`
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:8px;animation:qaPulse 1.5s infinite;"></span>
          <span style="font-weight:600;font-size:12px;letter-spacing:0.3px;">QA Recording Active</span>
          <span style="font-size:10px;opacity:0.8;margin-left:6px;">(\${sessionId ? sessionId.substring(0, 6) : 'Ready'})</span>
        \`;
        indicatorElement.style.cssText = \`
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
        \`;

        if (!document.getElementById('__qa_pulse_style__')) {
          const style = document.createElement('style');
          style.id = '__qa_pulse_style__';
          style.textContent = \`
            @keyframes qaPulse {
              0% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.3; transform: scale(0.85); }
              100% { opacity: 1; transform: scale(1); }
            }
          \`;
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
      currentPageId = \`tab-\${currentTabId}\`;
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

    if (isPageRecording && earlyEventBuffer.length > 0) {
      console.log(\`[QA Recorder Content] Flushing \${earlyEventBuffer.length} early buffered actions...\`);
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

    try {
      chrome.storage.local.get(['isRecording', 'currentSessionId'], (result) => {
        if (!chrome.runtime.lastError && result) {
          if (result.isRecording !== undefined) {
            updateRecordingState(result.isRecording, result.currentSessionId);
          }
        }
      });
    } catch (e) {}

    safeRuntimeSendMessage({ type: 'GET_RECORDING_STATE' }, (response) => {
      if (response && response.isRecording !== undefined) {
        updateRecordingState(response.isRecording, response.sessionId);
      }
    });
  }

  refreshRecordingState();

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

    if (target.closest('#__qa_recorder_status_badge__')) return null;

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

    const tagName = element.tagName.toLowerCase();
    const id = element.id ? \`#\${element.id}\` : '';
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
          playwright: \`page.locator('\${selector}')\`
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
          playwright: \`page.locator('\${fallbackSel}')\`
        },
        alternatives: []
      };
    }

    const isIframe = window !== window.top;
    const frameUrl = isIframe ? window.location.href : undefined;
    const pageId = currentPageId || (currentTabId !== null ? \`tab-\${currentTabId}\` : 'tab-1');

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
    if (!isStateResolved) {
      console.log('[QA Recorder Content] State not yet resolved; buffering step:', step.action);
      earlyEventBuffer.push(step);
      refreshRecordingState();
      return;
    }

    if (!isPageRecording) {
      return;
    }

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

  document.addEventListener(
    'click',
    (event) => {
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

  document.addEventListener(
    'submit',
    () => {
      flushPendingInput();
    },
    true
  );

  window.addEventListener(
    'scroll',
    () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (!isPageRecording) return;
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;

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
            value: \`scroll(\${scrollX}, \${scrollY})\`,
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
`;

export const EXTENSION_BACKGROUND_CONTENT = `/**
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

const DEFAULT_BACKEND_URL = null;

function deriveHttpUrl(wsUrl) {
  try {
    const parsed = new URL(wsUrl);
    const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    return \`\${protocol}//\${parsed.host}\`;
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

let transportMode = 'backend';
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
          }).catch(() => {});
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

    flushPendingSteps();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('[QA Recorder BG] Received backend message:', data);

      if (data.type === 'START_RECORDING') {
        isRecording = true;
        currentSessionId = data.sessionId || \`session-\${Date.now()}\`;

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
      .catch(() => {});
  } catch (e) {}
}

function sendStepToBackend(payload) {
  if (!payload.sessionId && currentSessionId) {
    payload.sessionId = currentSessionId;
  }

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

  if (!sentViaWs) {
    const targetHttp = httpUrl || deriveHttpUrl(backendUrl);
    if (!targetHttp) {
      console.warn('[QA Recorder BG] No backend configured; queueing step until an AutomatiQA tab announces one.');
      pendingStepQueue.push(payload);
      return;
    }
    const endpoint = \`\${targetHttp}/api/record-event\`;
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
          throw new Error(\`HTTP status \${res.status}\`);
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

  console.log(\`[QA Recorder BG] Flushing \${pendingStepQueue.length} queued steps to backend...\`);
  const toFlush = [...pendingStepQueue];
  pendingStepQueue.length = 0;

  for (const payload of toFlush) {
    sendStepToBackend(payload);
  }
}

// ============================================================
// RUNTIME MESSAGES
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

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

  if (message.type === 'START_RECORDING') {
    isRecording = true;
    currentSessionId = message.sessionId || \`session-\${Date.now()}\`;

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

  if (message.type === 'STEP') {
    const incomingPayload = message.payload || {};
    const resolvedSessionId = incomingPayload.sessionId || currentSessionId;
    const tabId = sender.tab?.id;
    const pageId = incomingPayload.pageId || (tabId !== undefined && tabId !== null ? \`tab-\${tabId}\` : 'tab-1');
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
// TAB NAVIGATION TRACKING
// ============================================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isRecording) return;
  if (tabId === appTabId) return;

  const tabUrl = tab.url || changeInfo.url;
  if (!tabUrl) return;

  if (
    tabUrl.startsWith('chrome://') ||
    tabUrl.startsWith('chrome-extension://') ||
    tabUrl.startsWith('devtools://') ||
    tabUrl.startsWith('about:blank')
  ) {
    return;
  }

  if (changeInfo.status === 'loading' || changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, {
      type: 'RECORDING_STATE',
      isRecording: true,
      sessionId: currentSessionId,
      tabId: tabId,
      pageId: \`tab-\${tabId}\`,
      url: tabUrl
    }).catch(() => {
      if (changeInfo.status === 'complete' && chrome.scripting) {
        chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['locator-engine.js', 'utils.js', 'content.js']
        }).catch(() => {});
      }
    });
  }

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
      pageId: \`tab-\${tabId}\`,
      tabTitle: tab.title || '',
      timestamp: now
    };

    sendStepToBackend(payload);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!isRecording) return;
  if (tab.id === appTabId) return;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (!isRecording) return;
  if (tabId === appTabId) return;
});

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
      pageId: \`tab-\${details.tabId}\`,
      timestamp: now
    };

    sendStepToBackend(payload);
  });
}

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
`;
