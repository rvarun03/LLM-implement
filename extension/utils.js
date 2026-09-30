/**
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
    const fullText = (el.textContent || '').replace(/\s+/g, ' ').trim();

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
