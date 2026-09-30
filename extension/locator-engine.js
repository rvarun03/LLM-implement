/**
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
    /^\d+$/, /^\d/, /:r[0-9a-zA-Z_-]+:/, /^react-\d+/i, /^__react[a-zA-Z0-9_-]+/i,
    /^emberh?\d+/i, /^ng-[a-zA-Z0-9_-]+/i, /^v-[a-zA-Z0-9_-]+/i, /^css-[a-zA-Z0-9]{4,}/i,
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
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function cssEsc(value) {
    return typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function' ? CSS.escape(String(value || '')) : String(value || '').replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, '\\$1');
  }

  function isVolatileText(text) {
    if (!text || typeof text !== 'string') return false;
    const str = text.trim();
    if (!str) return false;
    if (/\(\d+\)/.test(str)) return true;
    if (/\b(?:cart|inbox|items?|messages?|notifications?|results?|unread|count)\s*\(?\d+\)?/i.test(str)) return true;
    if (/\b\d+\s+(?:items?|messages?|notifications?|unread|results?|new|cart)\b/i.test(str)) return true;
    if (/\b(?:\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/i.test(str)) return true;
    if (/[$€£¥₹]\s*\d+/.test(str)) return true;
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
      const ids = labelledBy.trim().split(/\s+/);
      const parts = [];
      for (const id of ids) {
        let targetEl = null;
        try { targetEl = root.querySelector('#' + cssEsc(id)); } catch(e) {}
        if (targetEl) {
          const txt = (targetEl.innerText || targetEl.textContent || '').replace(/\s+/g, ' ').trim();
          if (txt) parts.push(txt);
        }
      }
      if (parts.length > 0) return parts.join(' ');
    }

    const ariaLabel = el.getAttribute ? el.getAttribute('aria-label') : null;
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.replace(/\s+/g, ' ').trim();

    if (el.id) {
      let lEl = null;
      try { lEl = root.querySelector('label[for="' + cssEsc(el.id) + '"]'); } catch(e) {}
      if (lEl) {
        const txt = (lEl.innerText || lEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt) return txt;
      }
    }

    const parentLabel = el.closest ? el.closest('label') : null;
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      const inputs = clone.querySelectorAll('input, select, textarea, button');
      inputs.forEach(i => i.remove());
      const txt = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt) return txt;
    }

    const ph = el.getAttribute ? el.getAttribute('placeholder') : null;
    if (ph && ph.trim()) return ph.replace(/\s+/g, ' ').trim();

    const alt = el.getAttribute ? el.getAttribute('alt') : null;
    if (alt && alt.trim()) return alt.replace(/\s+/g, ' ').trim();

    const title = el.getAttribute ? el.getAttribute('title') : null;
    if (title && title.trim()) return title.replace(/\s+/g, ' ').trim();

    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    const role = getComputedRole(el);
    const explicitRole = el.hasAttribute ? el.hasAttribute('role') : false;

    if (tag === 'button' || tag === 'a' || /^h[1-6]$/.test(tag) || tag === 'td' || tag === 'th' || tag === 'summary' || tag === 'option' || tag === 'li' || explicitRole || (role && role !== 'textbox' && role !== 'combobox')) {
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
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
      const ownText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (ownText && ownText.length > 1 && ownText.length < 100 && !isVolatileText(ownText)) {
        const hasChildText = Array.from(el.children || []).some(child => (child.innerText || child.textContent || '').replace(/\s+/g, ' ').trim().length > 0);
        if (!hasChildText || (el.children.length === 1 && el.children[0].tagName.toLowerCase() === 'svg')) {
          const allTextMatching = queryMatchesInRoot('*').filter(cand => {
            if (['input', 'textarea', 'select'].includes(cand.tagName.toLowerCase())) return false;
            return (cand.innerText || cand.textContent || '').replace(/\s+/g, ' ').trim() === ownText;
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
      if (lEl) labelText = (lEl.innerText || lEl.textContent || '').replace(/\s+/g, ' ').trim();
    }
    if (!labelText && el.closest) {
      const parentLabel = el.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, select, textarea, button');
        inputs.forEach(i => i.remove());
        labelText = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
      }
    }
    if (!labelText && el.getAttribute && el.getAttribute('aria-label')) {
      labelText = el.getAttribute('aria-label').replace(/\s+/g, ' ').trim();
    }

    if (labelText && !isVolatileText(labelText)) {
      const labelMatches = queryMatchesInRoot('input, select, textarea, button, [role]').filter(ctrl => {
        let cLabel = '';
        if (ctrl.id) {
          const l = root.querySelector('label[for="' + cssEsc(ctrl.id) + '"]');
          if (l) cLabel = (l.innerText || l.textContent || '').replace(/\s+/g, ' ').trim();
        }
        if (!cLabel && ctrl.closest) {
          const pl = ctrl.closest('label');
          if (pl) {
            const clone = pl.cloneNode(true);
            const inputs = clone.querySelectorAll('input, select, textarea, button');
            inputs.forEach(i => i.remove());
            cLabel = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
          }
        }
        if (!cLabel && ctrl.getAttribute && ctrl.getAttribute('aria-label')) cLabel = ctrl.getAttribute('aria-label').replace(/\s+/g, ' ').trim();
        return cLabel === labelText;
      });
      if (isUniqueMatch(labelMatches)) {
        return { strategy: 'label', name: labelText, value: labelText, exact: true, matchCount: 1, frameChain, shadowPath };
      }
    }

    const placeholder = el.getAttribute ? el.getAttribute('placeholder') : null;
    if (placeholder && placeholder.trim()) {
      const cleanPh = placeholder.replace(/\s+/g, ' ').trim();
      const phMatches = queryMatchesInRoot('[placeholder="' + cssEsc(cleanPh) + '"]');
      if (isUniqueMatch(phMatches)) return { strategy: 'placeholder', name: cleanPh, value: cleanPh, exact: true, matchCount: 1, frameChain, shadowPath };
    }

    const alt = el.getAttribute ? el.getAttribute('alt') : null;
    if (alt && alt.trim() && !isVolatileText(alt)) {
      const cleanAlt = alt.replace(/\s+/g, ' ').trim();
      const altMatches = queryMatchesInRoot('[alt="' + cssEsc(cleanAlt) + '"]');
      if (isUniqueMatch(altMatches)) return { strategy: 'alt', name: cleanAlt, value: cleanAlt, exact: true, matchCount: 1, frameChain, shadowPath };
    }

    const title = el.getAttribute ? el.getAttribute('title') : null;
    if (title && title.trim() && !isVolatileText(title)) {
      const cleanTitle = title.replace(/\s+/g, ' ').trim();
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
      baseExpr = baseExpr.replace(/^page\./, 'page.' + shadowChain + '.');
    }
    if (loc.frameChain && loc.frameChain.length > 0) {
      const frameExprs = loc.frameChain.map(f => "frameLocator('" + esc(f) + "')").join('.');
      baseExpr = baseExpr.replace(/^page\./, 'page.' + frameExprs + '.');
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
