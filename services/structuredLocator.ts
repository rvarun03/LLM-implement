/**
 * Canonical Locator Priority Engine (14 Tiers)
 * 
 * Strict Playwright Target Priority Hierarchy:
 * 1. getByRole() — role + accessible name (buttons, links, checkboxes, radios, headings, tabs, menuitems, explicit roles)
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
 * 14. nth index — absolute last resort on highest-priority candidate
 */

export interface StructuredLocator {
  strategy: 'role' | 'text' | 'label' | 'placeholder' | 'alt' | 'title' | 'testid' | 'id' | 'name' | 'href' | 'scope' | 'css' | 'xpath' | 'attribute';
  role?: string;
  name?: string;
  exact?: boolean;
  value?: string;
  testIdAttribute?: string;
  scope?: string;
  scopeStrategy?: string;
  childStrategy?: string;
  childValue?: string;
  nthIndex?: number | null;
  matchCount?: number;
  frameChain?: string[];
  shadowPath?: string[];
  diagnostic?: string;
}

const TEST_ID_ATTRS = [
  'data-testid',
  'data-test',
  'data-cy',
  'data-qa',
  'data-test-id',
  'data-automation-id'
];

const RANDOM_OR_GENERATED_ID_PATTERNS = [
  /^\d+$/,
  /^\d/,
  /:r[0-9a-zA-Z_-]+:/,
  /^react-\d+/i,
  /^__react[a-zA-Z0-9_-]+/i,
  /^emberh?\d+/i,
  /^ng-[a-zA-Z0-9_-]+/i,
  /^v-[a-zA-Z0-9_-]+/i,
  /^css-[a-zA-Z0-9]{4,}/i,
  /^sc-[a-zA-Z0-9]{4,}/i,
  /^mui-[a-zA-Z0-9_-]+/i,
  /^chakra-[a-zA-Z0-9_-]+/i,
  /^[a-zA-Z]+[0-9]{4,}$/,
  /^[a-zA-Z0-9_-]+[-_][0-9]{4,}$/,
  /^[a-f0-9]{8,}$/i,
  /^r[0-9][a-z0-9]{3,}$/i,
  /^[a-zA-Z0-9]{12,}$/
];

export function isStableId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;

  for (const pattern of RANDOM_OR_GENERATED_ID_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  return /[a-zA-Z]/.test(trimmed);
}

const UNSTABLE_CLASS_PATTERNS = [
  /^(active|selected|hover|focus|open|opened|closed|show|shown|disabled|loading|current|visible|hidden)$/i,
  /^css-[a-zA-Z0-9]{4,}/i,
  /^sc-[a-zA-Z0-9]{4,}/i,
  /^emotion-[a-zA-Z0-9]{4,}/i,
  /^_ngcontent/i,
  /^ng-[a-zA-Z0-9]+/i,
  /^[a-zA-Z0-9_-]{1,2}$/
];

export function isStableClass(className: string | null | undefined): boolean {
  if (!className || typeof className !== 'string') return false;
  const trimmed = className.trim();
  if (trimmed.length < 3 || trimmed.length > 50) return false;

  for (const pattern of UNSTABLE_CLASS_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(trimmed);
}

function esc(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function cssEsc(value: string): string {
  if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
    return CSS.escape(String(value || ''));
  }
  return String(value || '').replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, '\\$1');
}

export function isVolatileText(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  const str = text.trim();
  if (!str) return false;

  if (/\(\d+\)/.test(str)) return true;
  if (/\b(?:cart|inbox|items?|messages?|notifications?|results?|unread|count)\s*\(?\d+\)?/i.test(str)) return true;
  if (/\b\d+\s+(?:items?|messages?|notifications?|unread|results?|new|cart)\b/i.test(str)) return true;

  if (/\b(?:\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\b/i.test(str)) return true;
  if (/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/i.test(str)) return true;
  if (/\b\d+\s+(?:sec|second|min|minute|hour|day|week|month|year)s?\s+ago\b/i.test(str)) return true;
  if (/\bjust\s+now\b/i.test(str)) return true;

  if (/[$€£¥₹]\s*\d+/.test(str)) return true;
  if (/\b\d{1,3}(?:,\d{3})+\b/.test(str)) return true;
  if (/\b\d{3,}\b/.test(str)) return true;
  if (/\b\d+\.\d{2,}\b/.test(str)) return true;

  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(str)) return true;
  if (/\b[0-9a-f]{12,}\b/i.test(str)) return true;
  if (/\b\d{5,}\b/.test(str)) return true;

  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(str)) return true;
  if (/\b(?:welcome(?:\s+back)?|hello|hi|signed\s+in\s+as)\b/i.test(str)) return true;

  return false;
}

export function getComputedRole(el: any): string {
  if (!el || el.nodeType !== 1) return '';
  const explicitRole = el.getAttribute ? el.getAttribute('role') : null;
  if (explicitRole) {
    const trimmed = explicitRole.trim().toLowerCase();
    if (trimmed === 'none' || trimmed === 'presentation') return '';
    return trimmed;
  }

  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  if (tag === 'a' || tag === 'area') {
    return el.hasAttribute && el.hasAttribute('href') ? 'link' : '';
  }
  if (tag === 'button') return 'button';
  if (tag === 'input') {
    const type = (el.type || 'text').toLowerCase();
    if (['text', 'search', 'email', 'tel', 'url'].includes(type)) return 'textbox';
    if (type === 'password') return '';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (['submit', 'reset', 'button', 'image'].includes(type)) return 'button';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    if (type === 'file') return 'button';
    return 'textbox';
  }
  if (tag === 'select') {
    return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
  }
  if (tag === 'textarea') return 'textbox';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'img') {
    const alt = el.getAttribute ? el.getAttribute('alt') : null;
    if (alt !== null && alt.trim() === '') return '';
    return 'img';
  }
  if (tag === 'nav') return 'navigation';
  if (tag === 'main') return 'main';
  if (tag === 'header') return 'banner';
  if (tag === 'footer') return 'contentinfo';
  if (tag === 'aside') return 'complementary';
  if (tag === 'section') return 'region';
  if (tag === 'article') return 'article';
  if (tag === 'ul' || tag === 'ol') return 'list';
  if (tag === 'li') return 'listitem';
  if (tag === 'table') return 'table';
  if (tag === 'tr') return 'row';
  if (tag === 'td') return 'cell';
  if (tag === 'th') return 'columnheader';
  if (tag === 'dialog') return 'dialog';
  if (tag === 'summary') return 'button';
  if (tag === 'progress') return 'progressbar';
  if (tag === 'hr') return 'separator';

  return '';
}

export function getAccessibleName(el: any): string {
  if (!el || el.nodeType !== 1) return '';
  const root = el.getRootNode ? el.getRootNode() : (el.ownerDocument || document);

  const labelledBy = el.getAttribute ? el.getAttribute('aria-labelledby') : null;
  if (labelledBy && labelledBy.trim()) {
    const ids = labelledBy.trim().split(/\s+/);
    const parts: string[] = [];
    for (const id of ids) {
      if (!id) continue;
      let targetEl: any = null;
      try { targetEl = root.querySelector('#' + cssEsc(id)); } catch {}
      if (targetEl) {
        const txt = (targetEl.innerText || targetEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt) parts.push(txt);
      }
    }
    if (parts.length > 0) return parts.join(' ');
  }

  const ariaLabel = el.getAttribute ? el.getAttribute('aria-label') : null;
  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.replace(/\s+/g, ' ').trim();
  }

  if (el.id) {
    let lEl: any = null;
    try { lEl = root.querySelector(`label[for="${cssEsc(el.id)}"]`); } catch {}
    if (lEl) {
      const txt = (lEl.innerText || lEl.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt) return txt;
    }
  }

  const parentLabel = el.closest ? el.closest('label') : null;
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    const inputs = clone.querySelectorAll('input, select, textarea, button');
    inputs.forEach((i: any) => i.remove());
    const txt = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt) return txt;
  }

  const fieldset = el.closest ? el.closest('fieldset') : null;
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) {
      const txt = (legend.innerText || legend.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt) return txt;
    }
  }

  const ph = el.getAttribute ? el.getAttribute('placeholder') : null;
  if (ph && ph.trim()) {
    return ph.replace(/\s+/g, ' ').trim();
  }

  const alt = el.getAttribute ? el.getAttribute('alt') : null;
  if (alt && alt.trim()) {
    return alt.replace(/\s+/g, ' ').trim();
  }

  const title = el.getAttribute ? el.getAttribute('title') : null;
  if (title && title.trim()) {
    return title.replace(/\s+/g, ' ').trim();
  }

  const tag = el.tagName ? el.tagName.toLowerCase() : '';
  const role = getComputedRole(el);
  const explicitRole = el.hasAttribute ? el.hasAttribute('role') : false;

  if (tag === 'button' || tag === 'a' || /^h[1-6]$/.test(tag) || tag === 'td' || tag === 'th' || tag === 'summary' || tag === 'option' || tag === 'li' || explicitRole || (role && role !== 'textbox' && role !== 'combobox')) {
    const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt) return txt;
  }

  if (tag === 'input') {
    const type = (el.type || '').toLowerCase();
    if (['submit', 'reset', 'button', 'image'].includes(type) && el.value) {
      const val = String(el.value).replace(/\s+/g, ' ').trim();
      if (val) return val;
    }
  }

  return '';
}

export function generateStructuredLocatorForElement(el: any): StructuredLocator {
  if (!el || el.nodeType !== 1) {
    return {
      strategy: 'css',
      value: 'body',
      name: 'body',
      nthIndex: null,
      matchCount: 1
    };
  }

  const root = (el.getRootNode && el.getRootNode()) || el.ownerDocument || document;

  const shadowPath: string[] = [];
  let isClosedShadow = false;
  let curr = el;
  while (curr) {
    const r = curr.getRootNode ? curr.getRootNode() : null;
    if (r && typeof ShadowRoot !== 'undefined' && r instanceof ShadowRoot) {
      const host = r.host;
      if (!host) break;
      if (r.mode === 'closed' || !host.shadowRoot) {
        isClosedShadow = true;
      }
      let hostSel = host.tagName.toLowerCase();
      if (host.id && isStableId(host.id)) {
        hostSel += '#' + host.id;
      } else if (host.getAttribute && host.getAttribute('data-testid')) {
        hostSel += `[data-testid="${host.getAttribute('data-testid')}"]`;
      }
      shadowPath.unshift(hostSel);
      curr = host;
    } else {
      break;
    }
  }

  const frameChain: string[] = [];
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
        const title = frameEl.getAttribute ? frameEl.getAttribute('title') : null;
        const src = frameEl.getAttribute ? frameEl.getAttribute('src') : null;

        if (name) {
          frameSel = `iframe[name="${cssEsc(name)}"]`;
        } else if (id && isStableId(id)) {
          frameSel = `iframe#${cssEsc(id)}`;
        } else if (title) {
          frameSel = `iframe[title="${cssEsc(title)}"]`;
        } else if (src) {
          const cleanSrc = src.split('?')[0];
          frameSel = `iframe[src*="${cssEsc(cleanSrc)}"]`;
        } else {
          const parentDoc = frameEl.ownerDocument;
          if (parentDoc) {
            const iframes = Array.from(parentDoc.querySelectorAll('iframe, frame'));
            const idx = iframes.indexOf(frameEl);
            if (idx !== -1) frameSel = `iframe:nth-of-type(${idx + 1})`;
          }
        }
        frameChain.unshift(frameSel);
        currWin = currWin.parent;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  if (isClosedShadow) {
    const hostTag = shadowPath.join(' >> ') || el.tagName.toLowerCase();
    return {
      strategy: 'css',
      value: hostTag,
      name: hostTag,
      diagnostic: 'Element is inside a CLOSED shadow root; targeting host element.',
      frameChain,
      shadowPath: [],
      matchCount: 1
    };
  }

  const tagName = el.tagName ? el.tagName.toLowerCase() : '';
  const computedRole = getComputedRole(el);
  const accName = getAccessibleName(el);

  const queryMatchesInRoot = (selector: string): any[] => {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  };

  const isUniqueMatch = (matches: any[]) => matches.length === 1 && matches[0] === el;

  // Handle iframe element itself
  if (tagName === 'iframe') {
    const nameAttr = el.getAttribute ? el.getAttribute('name') : null;
    if (nameAttr) {
      return {
        strategy: 'css',
        value: `iframe[name="${cssEsc(nameAttr)}"]`,
        name: `iframe[name="${nameAttr}"]`,
        matchCount: 1,
        frameChain,
        shadowPath
      };
    }
  }

  // Record candidates for nth fallback
  let firstRoleCandidate: StructuredLocator | null = null;

  // 1. getByRole()
  const isExplicitRole = el.hasAttribute ? el.hasAttribute('role') : false;
  const isTextInput = (tagName === 'input' && ['text', 'search', 'email', 'tel', 'url', 'number', 'password'].includes((el.type || '').toLowerCase())) || tagName === 'textarea';
  const shouldSkipTier1 = (tagName === 'img' && !isExplicitRole) || (isTextInput && !isExplicitRole);

  if (computedRole && accName && !shouldSkipTier1 && !isVolatileText(accName)) {
    const allMatching = queryMatchesInRoot('*').filter(cand => {
      return getComputedRole(cand) === computedRole && getAccessibleName(cand) === accName;
    });
    if (isUniqueMatch(allMatching)) {
      return {
        strategy: 'role',
        role: computedRole,
        name: accName,
        exact: true,
        value: `[role="${computedRole}"][name="${accName}"]`,
        matchCount: 1,
        frameChain,
        shadowPath
      };
    } else if (allMatching.length > 1) {
      const idx = allMatching.indexOf(el);
      if (idx !== -1) {
        firstRoleCandidate = {
          strategy: 'role',
          role: computedRole,
          name: accName,
          exact: true,
          value: `[role="${computedRole}"][name="${accName}"]`,
          nthIndex: idx,
          matchCount: allMatching.length,
          frameChain,
          shadowPath
        };
      }
    }
  }

  // 2. getByText() — visible text on non-input text-display elements only
  const textDisplayTags = ['p', 'span', 'b', 'i', 'strong', 'em', 'small', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'button', 'a', 'option', 'td', 'th', 'li'];
  const hasDataTestId = TEST_ID_ATTRS.some(attr => el.hasAttribute ? el.hasAttribute(attr) : false);

  if (textDisplayTags.includes(tagName) && !hasDataTestId) {
    const ownText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (ownText && ownText.length > 1 && ownText.length < 100 && !isVolatileText(ownText)) {
      const hasChildText = Array.from(el.children || []).some((child: any) => {
        const cText = (child.innerText || child.textContent || '').replace(/\s+/g, ' ').trim();
        return cText.length > 0;
      });
      const isPureTextOwner = !hasChildText || (el.children.length === 1 && el.children[0].tagName.toLowerCase() === 'svg');

      if (isPureTextOwner) {
        const allTextMatching = queryMatchesInRoot('*').filter(cand => {
          if (['input', 'textarea', 'select'].includes(cand.tagName.toLowerCase())) return false;
          const candText = (cand.innerText || cand.textContent || '').replace(/\s+/g, ' ').trim();
          return candText === ownText;
        });
        if (isUniqueMatch(allTextMatching)) {
          return {
            strategy: 'text',
            name: ownText,
            value: ownText,
            exact: true,
            matchCount: 1,
            frameChain,
            shadowPath
          };
        }
      }
    }
  }

  // 3. getByLabel()
  let labelText = '';
  if (el.id) {
    let lEl: any = null;
    try { lEl = root.querySelector(`label[for="${cssEsc(el.id)}"]`); } catch {}
    if (lEl) labelText = (lEl.innerText || lEl.textContent || '').replace(/\s+/g, ' ').trim();
  }
  if (!labelText && el.closest) {
    const parentLabel = el.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      const inputs = clone.querySelectorAll('input, select, textarea, button');
      inputs.forEach((i: any) => i.remove());
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
        const l = root.querySelector(`label[for="${cssEsc(ctrl.id)}"]`);
        if (l) cLabel = (l.innerText || l.textContent || '').replace(/\s+/g, ' ').trim();
      }
      if (!cLabel && ctrl.closest) {
        const pl = ctrl.closest('label');
        if (pl) {
          const clone = pl.cloneNode(true);
          const inputs = clone.querySelectorAll('input, select, textarea, button');
          inputs.forEach((i: any) => i.remove());
          cLabel = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
        }
      }
      if (!cLabel && ctrl.getAttribute && ctrl.getAttribute('aria-label')) {
        cLabel = ctrl.getAttribute('aria-label').replace(/\s+/g, ' ').trim();
      }
      return cLabel === labelText;
    });
    if (isUniqueMatch(labelMatches)) {
      return {
        strategy: 'label',
        name: labelText,
        value: labelText,
        exact: true,
        matchCount: 1,
        frameChain,
        shadowPath
      };
    }
  }

  // 4. getByPlaceholder()
  const placeholder = el.getAttribute ? el.getAttribute('placeholder') : null;
  if (placeholder && placeholder.trim()) {
    const cleanPh = placeholder.replace(/\s+/g, ' ').trim();
    const phMatches = queryMatchesInRoot(`[placeholder="${cssEsc(cleanPh)}"]`);
    if (isUniqueMatch(phMatches)) {
      return {
        strategy: 'placeholder',
        name: cleanPh,
        value: cleanPh,
        exact: true,
        matchCount: 1,
        frameChain,
        shadowPath
      };
    }
  }

  // 5. getByAltText()
  const alt = el.getAttribute ? el.getAttribute('alt') : null;
  if (alt && alt.trim() && !isVolatileText(alt)) {
    const cleanAlt = alt.replace(/\s+/g, ' ').trim();
    const altMatches = queryMatchesInRoot(`[alt="${cssEsc(cleanAlt)}"]`);
    if (isUniqueMatch(altMatches)) {
      return {
        strategy: 'alt',
        name: cleanAlt,
        value: cleanAlt,
        exact: true,
        matchCount: 1,
        frameChain,
        shadowPath
      };
    }
  }

  // 6. getByTitle()
  const title = el.getAttribute ? el.getAttribute('title') : null;
  if (title && title.trim() && !isVolatileText(title)) {
    const cleanTitle = title.replace(/\s+/g, ' ').trim();
    const titleMatches = queryMatchesInRoot(`[title="${cssEsc(cleanTitle)}"]`);
    if (isUniqueMatch(titleMatches)) {
      return {
        strategy: 'title',
        name: cleanTitle,
        value: cleanTitle,
        exact: true,
        matchCount: 1,
        frameChain,
        shadowPath
      };
    }
  }

  // 7. getByTestId()
  for (const attr of TEST_ID_ATTRS) {
    const val = el.getAttribute ? el.getAttribute(attr) : null;
    if (val && val.trim()) {
      const cleanVal = val.trim();
      const sel = `[${attr}="${cssEsc(cleanVal)}"]`;
      const matches = queryMatchesInRoot(sel);
      if (isUniqueMatch(matches)) {
        return {
          strategy: 'testid',
          testIdAttribute: attr,
          name: cleanVal,
          value: cleanVal,
          matchCount: 1,
          frameChain,
          shadowPath
        };
      }
    }
  }

  // 8. Stable ID
  if (el.id && isStableId(el.id)) {
    const sel = `#${cssEsc(el.id)}`;
    const matches = queryMatchesInRoot(sel);
    if (isUniqueMatch(matches)) {
      return {
        strategy: 'id',
        value: el.id,
        name: el.id,
        matchCount: 1,
        frameChain,
        shadowPath
      };
    }
  }

  // 9. Name attribute
  const nameAttr = el.getAttribute ? el.getAttribute('name') : null;
  if (nameAttr && nameAttr.trim()) {
    const cleanName = nameAttr.trim();
    const sel = `[name="${cssEsc(cleanName)}"]`;
    const matches = queryMatchesInRoot(sel);
    if (isUniqueMatch(matches)) {
      return {
        strategy: 'name',
        name: cleanName,
        value: cleanName,
        matchCount: 1,
        frameChain,
        shadowPath
      };
    }
  }

  // 10. href (links)
  const href = el.getAttribute ? el.getAttribute('href') : null;
  if ((tagName === 'a' || tagName === 'area') && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
    const sel = `a[href="${cssEsc(href)}"]`;
    const matches = queryMatchesInRoot(sel);
    if (isUniqueMatch(matches)) {
      return {
        strategy: 'href',
        name: href,
        value: href,
        matchCount: 1,
        frameChain,
        shadowPath
      };
    }
  }

  // 11. Stable-ancestor scope
  let currentAncestor = el.parentElement;
  let ancestorDepth = 0;

  while (currentAncestor && ancestorDepth < 10 && currentAncestor !== root) {
    let ancestorSelector = '';
    let ancestorStrategy = '';

    for (const attr of TEST_ID_ATTRS) {
      const aVal = currentAncestor.getAttribute ? currentAncestor.getAttribute(attr) : null;
      if (aVal && aVal.trim()) {
        ancestorSelector = `[${attr}="${cssEsc(aVal.trim())}"]`;
        ancestorStrategy = 'testid';
        break;
      }
    }

    if (!ancestorSelector && currentAncestor.id && isStableId(currentAncestor.id)) {
      ancestorSelector = `#${cssEsc(currentAncestor.id)}`;
      ancestorStrategy = 'id';
    }

    if (!ancestorSelector) {
      const aTag = currentAncestor.tagName ? currentAncestor.tagName.toLowerCase() : '';
      if (['form', 'nav', 'header', 'footer', 'main', 'aside', 'fieldset', 'section', 'article'].includes(aTag)) {
        if (queryMatchesInRoot(aTag).length === 1) {
          ancestorSelector = aTag;
          ancestorStrategy = 'semantic';
        }
      }
    }

    if (!ancestorSelector && typeof currentAncestor.className === 'string') {
      const stableClasses = currentAncestor.className.split(/\s+/).filter(isStableClass);
      for (const cls of stableClasses) {
        const clsSel = `.${cssEsc(cls)}`;
        if (queryMatchesInRoot(clsSel).length === 1) {
          ancestorSelector = clsSel;
          ancestorStrategy = 'class';
          break;
        }
      }
    }

    if (ancestorSelector && queryMatchesInRoot(ancestorSelector).length === 1) {
      if (computedRole && accName && !isVolatileText(accName)) {
        const scopedMatches = Array.from(currentAncestor.querySelectorAll('*')).filter((cand: any) => {
          return getComputedRole(cand) === computedRole && getAccessibleName(cand) === accName;
        });
        if (isUniqueMatch(scopedMatches)) {
          return {
            strategy: 'scope',
            scope: ancestorSelector,
            scopeStrategy: ancestorStrategy,
            childStrategy: 'role',
            role: computedRole,
            name: accName,
            exact: true,
            value: `${ancestorSelector} >> [role="${computedRole}"][name="${accName}"]`,
            matchCount: 1,
            frameChain,
            shadowPath
          };
        }
      }

      if (placeholder && placeholder.trim()) {
        const cleanPh = placeholder.trim();
        const scopedMatches = Array.from(currentAncestor.querySelectorAll(`[placeholder="${cssEsc(cleanPh)}"]`));
        if (isUniqueMatch(scopedMatches)) {
          return {
            strategy: 'scope',
            scope: ancestorSelector,
            scopeStrategy: ancestorStrategy,
            childStrategy: 'placeholder',
            name: cleanPh,
            exact: true,
            value: `${ancestorSelector} >> [placeholder="${cleanPh}"]`,
            matchCount: 1,
            frameChain,
            shadowPath
          };
        }
      }

      const ownText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (ownText && ownText.length < 100 && !isVolatileText(ownText)) {
        const scopedMatches = Array.from(currentAncestor.querySelectorAll(tagName)).filter((node: any) => {
          return (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim() === ownText;
        });
        if (isUniqueMatch(scopedMatches)) {
          return {
            strategy: 'scope',
            scope: ancestorSelector,
            scopeStrategy: ancestorStrategy,
            childStrategy: 'text',
            name: ownText,
            exact: true,
            value: `${ancestorSelector} >> text="${ownText}"`,
            matchCount: 1,
            frameChain,
            shadowPath
          };
        }
      }
    }

    currentAncestor = currentAncestor.parentElement;
    ancestorDepth++;
  }

  // Return roleCandidate with nthIndex if available before falling back to CSS
  if (firstRoleCandidate) {
    return firstRoleCandidate;
  }

  // 12. Unique CSS Selector
  const buildCssPath = (target: any) => {
    const parts: string[] = [];
    let cur = target;
    while (cur && cur !== root && cur.nodeType === 1) {
      let part = cur.tagName.toLowerCase();
      if (cur.id && isStableId(cur.id)) {
        parts.unshift(`#${cssEsc(cur.id)}`);
        break;
      }
      const parent = cur.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c: any) => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };

  const cssPath = buildCssPath(el);
  const cssMatches = queryMatchesInRoot(cssPath);
  if (isUniqueMatch(cssMatches)) {
    return {
      strategy: 'css',
      value: cssPath,
      name: cssPath,
      matchCount: 1,
      frameChain,
      shadowPath
    };
  }

  // 13. XPath
  const buildXPath = (target: any) => {
    const parts: string[] = [];
    let cur = target;
    while (cur && cur.nodeType === 1) {
      if (cur.id && isStableId(cur.id)) {
        parts.unshift(`//*[@id="${cur.id}"]`);
        return parts.join('/');
      }
      let count = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName === cur.tagName) count++;
        sib = sib.previousElementSibling;
      }
      parts.unshift(`${cur.tagName.toLowerCase()}[${count}]`);
      cur = cur.parentElement;
    }
    return `/${parts.join('/')}`;
  };

  const xpathStr = buildXPath(el);

  // 14. nth index
  const idx = cssMatches.indexOf(el);
  return {
    strategy: 'css',
    value: cssPath,
    name: cssPath,
    nthIndex: idx !== -1 ? idx : 0,
    matchCount: Math.max(1, cssMatches.length),
    frameChain,
    shadowPath
  };
}

export function toPlaywrightScript(loc: StructuredLocator): string {
  if (!loc) return "page.locator('body')";

  let baseExpr = '';
  const safeName = esc(loc.name || loc.value || '');
  const safeVal = esc(loc.value || '');

  if (loc.strategy === 'scope' && loc.scope) {
    const scopeExpr = `page.locator('${esc(loc.scope)}')`;
    if (loc.childStrategy === 'role' && loc.role) {
      baseExpr = `${scopeExpr}.getByRole('${loc.role}', { name: '${safeName}', exact: ${loc.exact !== false} })`;
    } else if (loc.childStrategy === 'placeholder') {
      baseExpr = `${scopeExpr}.getByPlaceholder('${safeName}', { exact: true })`;
    } else if (loc.childStrategy === 'label') {
      baseExpr = `${scopeExpr}.getByLabel('${safeName}', { exact: true })`;
    } else if (loc.childStrategy === 'testid') {
      baseExpr = `${scopeExpr}.getByTestId('${safeName || safeVal}')`;
    } else if (loc.childStrategy === 'text') {
      baseExpr = `${scopeExpr}.getByText('${safeName || safeVal}', { exact: true })`;
    } else {
      const childSelector = loc.childValue || safeVal;
      baseExpr = `${scopeExpr}.locator('${esc(childSelector)}')`;
    }
  } else {
    switch (loc.strategy) {
      case 'role':
        baseExpr = `page.getByRole('${loc.role}', { name: '${safeName}', exact: ${loc.exact !== false} })`;
        break;
      case 'text':
        baseExpr = `page.getByText('${safeName || safeVal}', { exact: true })`;
        break;
      case 'label':
        baseExpr = `page.getByLabel('${safeName}', { exact: true })`;
        break;
      case 'placeholder':
        baseExpr = `page.getByPlaceholder('${safeName}', { exact: true })`;
        break;
      case 'alt':
        baseExpr = `page.getByAltText('${safeName}', { exact: true })`;
        break;
      case 'title':
        baseExpr = `page.getByTitle('${safeName}', { exact: true })`;
        break;
      case 'testid':
        if (loc.testIdAttribute === 'data-testid' || !loc.testIdAttribute) {
          baseExpr = `page.getByTestId('${safeName || safeVal}')`;
        } else {
          baseExpr = `page.locator('[${loc.testIdAttribute}="${safeName || safeVal}"]')`;
        }
        break;
      case 'id':
        baseExpr = `page.locator('#${safeVal}')`;
        break;
      case 'name':
        baseExpr = `page.locator('[name="${safeVal}"]')`;
        break;
      case 'href':
        baseExpr = `page.locator('a[href="${safeVal}"]')`;
        break;
      case 'css':
        baseExpr = `page.locator('${safeVal}')`;
        break;
      case 'xpath':
        baseExpr = `page.locator('xpath=${safeVal}')`;
        break;
      default:
        baseExpr = safeVal ? `page.locator('${safeVal}')` : `page.locator('body')`;
    }
  }

  if (loc.shadowPath && loc.shadowPath.length > 0 && loc.strategy !== 'scope' && loc.strategy !== 'css') {
    const shadowChain = loc.shadowPath.map(h => `locator('${esc(h)}')`).join('.');
    baseExpr = baseExpr.replace(/^page\./, `page.${shadowChain}.`);
  }

  if (loc.frameChain && loc.frameChain.length > 0) {
    const frameExprs = loc.frameChain.map(f => `frameLocator('${esc(f)}')`).join('.');
    baseExpr = baseExpr.replace(/^page\./, `page.${frameExprs}.`);
  }

  if (typeof loc.nthIndex === 'number') {
    baseExpr += `.nth(${loc.nthIndex})`;
  }

  return baseExpr;
}

export function generateLocatorBundle(el: any, action?: string, value?: string): any {
  if (!el) {
    return {
      primary: {
        type: 'css',
        value: 'body',
        playwright: "page.locator('body')",
        clickedIndex: 0,
        matchCount: 1,
        isUnique: true,
        confidence: 1
      },
      alternatives: []
    };
  }

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
    alternatives: structured.scope ? [{
      type: 'scope',
      value: structured.value || structured.scope,
      playwright: pwExpr,
      clickedIndex: 0,
      matchCount: 1,
      isUnique: true,
      confidence: 0.95,
      structuredLocator: structured
    }] : [],
    scopedLocator: structured.scope ? pwExpr : undefined,
    structuredLocator: structured
  };
}

// Generate self-contained script string for injection into browser context
export const SHARED_LOCATOR_ENGINE_SCRIPT = `
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
    if (/[ $€£¥₹]\\s*\\d+/.test(str)) return true;
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
      const scopeExpr = 'page.locator(\'' + esc(loc.scope) + '\')';
      if (loc.childStrategy === 'role' && loc.role) {
        baseExpr = scopeExpr + '.getByRole(\'' + loc.role + '\', { name: \'' + safeName + '\', exact: ' + (loc.exact !== false) + ' })';
      } else {
        baseExpr = scopeExpr + '.locator(\'' + esc(loc.childValue || safeVal) + '\')';
      }
    } else {
      switch (loc.strategy) {
        case 'role': baseExpr = 'page.getByRole(\'' + loc.role + '\', { name: \'' + safeName + '\', exact: ' + (loc.exact !== false) + ' })'; break;
        case 'text': baseExpr = 'page.getByText(\'' + (safeName || safeVal) + '\', { exact: true })'; break;
        case 'label': baseExpr = 'page.getByLabel(\'' + safeName + '\', { exact: true })'; break;
        case 'placeholder': baseExpr = 'page.getByPlaceholder(\'' + safeName + '\', { exact: true })'; break;
        case 'alt': baseExpr = 'page.getByAltText(\'' + safeName + '\', { exact: true })'; break;
        case 'title': baseExpr = 'page.getByTitle(\'' + safeName + '\', { exact: true })'; break;
        case 'testid':
          if (loc.testIdAttribute === 'data-testid' || !loc.testIdAttribute) baseExpr = 'page.getByTestId(\'' + (safeName || safeVal) + '\')';
          else baseExpr = 'page.locator(\'[' + loc.testIdAttribute + '="' + (safeName || safeVal) + '"]\')';
          break;
        case 'id': baseExpr = 'page.locator(\'#' + safeVal + '\')'; break;
        case 'name': baseExpr = 'page.locator(\'[name="' + safeVal + '"]\')'; break;
        case 'href': baseExpr = 'page.locator(\'a[href="' + safeVal + '"]\')'; break;
        case 'css': baseExpr = 'page.locator(\'' + safeVal + '\')'; break;
        case 'xpath': baseExpr = 'page.locator(\'xpath=' + safeVal + '\')'; break;
        default: baseExpr = safeVal ? 'page.locator(\'' + safeVal + '\')' : 'page.locator(\'body\')';
      }
    }

    if (loc.shadowPath && loc.shadowPath.length > 0 && loc.strategy !== 'scope' && loc.strategy !== 'css') {
      const shadowChain = loc.shadowPath.map(h => 'locator(\'' + esc(h) + '\')').join('.');
      baseExpr = baseExpr.replace(/^page\\./, 'page.' + shadowChain + '.');
    }
    if (loc.frameChain && loc.frameChain.length > 0) {
      const frameExprs = loc.frameChain.map(f => 'frameLocator(\'' + esc(f) + '\')').join('.');
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
