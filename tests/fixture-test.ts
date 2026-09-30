import { JSDOM } from 'jsdom';
import { generateStructuredLocatorForElement, toPlaywrightScript, generateLocatorBundle } from '../services/structuredLocator';

const html = `
<!DOCTYPE html>
<html>
<head><title>Test Fixture</title></head>
<body>
  <!-- 1. Standard button with text -->
  <button id="btn-1">Submit</button>

  <!-- 2. Non-button role="button" -->
  <div id="btn-2" role="button">Click Me</div>

  <!-- 3. aria-label -->
  <button id="btn-3" aria-label="Close dialog">X</button>

  <!-- 4. aria-labelledby -->
  <span id="lbl">Save Changes</span>
  <button id="btn-4" aria-labelledby="lbl">Icon</button>

  <!-- 5. input with label for -->
  <label for="email-input">Email Address</label>
  <input id="email-input" type="text" />

  <!-- 6. input wrapped in label -->
  <label id="pwd-label">Password <input id="pwd-input" type="password" /></label>

  <!-- 7. input with placeholder -->
  <input id="search-input" placeholder="Search docs..." />

  <!-- 8. img with alt -->
  <img id="logo-img" src="logo.png" alt="Company Logo" />

  <!-- 9. title attribute -->
  <span id="info-span" title="More Information">i</span>

  <!-- 10. data-testid -->
  <div id="card-div" data-testid="user-profile-card">User Profile</div>

  <!-- 11. stable id -->
  <div id="main-header">Header</div>

  <!-- 12. name attribute -->
  <input id="input-829374" name="shipping_address" />

  <!-- 13. link with href -->
  <a id="about-link" href="/about-us">About Us</a>

  <!-- 14. Volatile text element -->
  <button id="cart-btn">Cart (3)</button>

  <!-- 15. Duplicate elements requiring scope -->
  <div data-testid="card-a"><button class="card-action">Delete</button></div>
  <div data-testid="card-b"><button class="card-action">Delete</button></div>

  <!-- 18. iframe element -->
  <iframe id="content-iframe" name="content-frame" src="about:blank"></iframe>

  <!-- 19. Duplicate elements with no unique anchors -->
  <button class="dup-btn">Duplicate</button>
  <button class="dup-btn">Duplicate</button>
</body>
</html>
`;

const dom = new JSDOM(html, { url: 'https://example.com' });
const doc = dom.window.document;
(global as any).window = dom.window;
(global as any).document = doc;
(global as any).Node = dom.window.Node;
(global as any).ShadowRoot = dom.window.ShadowRoot;

console.log('=== RUNNING 19 ARCHETYPE LOCATOR FIXTURE TESTS ===\n');

let passed = 0;
let failed = 0;

function assertLocator(testNum: number, name: string, el: HTMLElement | null, expectedScript: string | RegExp) {
  if (!el) {
    console.error(`❌ Test ${testNum} (${name}): Element not found in DOM`);
    failed++;
    return;
  }
  const loc = generateStructuredLocatorForElement(el);
  const script = toPlaywrightScript(loc);
  const isMatch = typeof expectedScript === 'string' ? script === expectedScript : expectedScript.test(script);

  if (isMatch) {
    console.log(`✅ Test ${testNum} (${name}): ${script}`);
    passed++;
  } else {
    console.error(`❌ Test ${testNum} (${name}):`);
    console.error(`   Expected: ${expectedScript}`);
    console.error(`   Got:      ${script}`);
    failed++;
  }
}

// 1. Standard button with text
assertLocator(1, 'Standard <button> with text', doc.querySelector('#btn-1'), `page.getByRole('button', { name: 'Submit', exact: true })`);

// 2. Non-button role="button"
assertLocator(2, 'role="button" div', doc.querySelector('#btn-2'), `page.getByRole('button', { name: 'Click Me', exact: true })`);

// 3. aria-label
assertLocator(3, 'aria-label button', doc.querySelector('#btn-3'), `page.getByRole('button', { name: 'Close dialog', exact: true })`);

// 4. aria-labelledby
assertLocator(4, 'aria-labelledby button', doc.querySelector('#btn-4'), `page.getByRole('button', { name: 'Save Changes', exact: true })`);

// 5. input with label for
assertLocator(5, 'input with <label for>', doc.querySelector('#email-input'), `page.getByLabel('Email Address', { exact: true })`);

// 6. input wrapped in label
assertLocator(6, 'input wrapped in <label>', doc.querySelector('#pwd-input'), `page.getByLabel('Password', { exact: true })`);

// 7. input with placeholder
assertLocator(7, 'input with placeholder', doc.querySelector('#search-input'), `page.getByPlaceholder('Search docs...', { exact: true })`);

// 8. img with alt
assertLocator(8, 'img with alt', doc.querySelector('#logo-img'), `page.getByAltText('Company Logo', { exact: true })`);

// 9. title attribute
assertLocator(9, 'span with title', doc.querySelector('#info-span'), `page.getByTitle('More Information', { exact: true })`);

// 10. data-testid
assertLocator(10, 'div with data-testid', doc.querySelector('#card-div'), `page.getByTestId('user-profile-card')`);

// 11. stable id
assertLocator(11, 'div with stable id', doc.querySelector('#main-header'), `page.locator('#main-header')`);

// 12. name attribute
assertLocator(12, 'input with name', doc.querySelector('#input-829374'), `page.locator('[name="shipping_address"]')`);

// 13. link with href
assertLocator(13, 'a with href', doc.querySelector('#about-link'), `page.getByRole('link', { name: 'About Us', exact: true })`);

// 14. Volatile text element (Cart (3) -> volatile number, fallthrough to stable ID #cart-btn)
assertLocator(14, 'Volatile text element', doc.querySelector('#cart-btn'), `page.locator('#cart-btn')`);

// 15. Scoped duplicate element
const cardAButton = doc.querySelector('[data-testid="card-a"] button') as HTMLElement;
assertLocator(15, 'Scoped duplicate element', cardAButton, `page.locator('[data-testid="card-a"]').getByRole('button', { name: 'Delete', exact: true })`);

// 16. Shadow DOM Open element
const customEl = doc.createElement('custom-element');
doc.body.appendChild(customEl);
const shadowRoot = customEl.attachShadow({ mode: 'open' });
const shadowBtn = doc.createElement('button');
shadowBtn.textContent = 'Shadow Click';
shadowRoot.appendChild(shadowBtn);
assertLocator(16, 'Shadow DOM open element', shadowBtn, `page.locator('custom-element').getByRole('button', { name: 'Shadow Click', exact: true })`);

// 17. Closed Shadow DOM element
const closedEl = doc.createElement('closed-element');
doc.body.appendChild(closedEl);
const closedRoot = closedEl.attachShadow({ mode: 'closed' });
const closedBtn = doc.createElement('button');
closedBtn.textContent = 'Closed Click';
closedRoot.appendChild(closedBtn);
assertLocator(17, 'Closed shadow DOM element', closedBtn, `page.locator('closed-element')`);

// 18. Frame / iframe element (Simulated frame element inside document)
const iframeEl = doc.querySelector('#content-iframe') as HTMLIFrameElement;
const iframeDoc = dom.window.document; // simulated frame doc context
const frameBtn = doc.createElement('button');
frameBtn.textContent = 'Frame Action';
doc.body.appendChild(frameBtn);
assertLocator(18, 'Iframe element', iframeEl, `page.locator('iframe[name="content-frame"]')`);

// 19. Duplicate elements with no unique anchors (nth fallback)
const firstDupBtn = doc.querySelectorAll('.dup-btn')[0] as HTMLElement;
assertLocator(19, 'Duplicate element nth fallback', firstDupBtn, `page.getByRole('button', { name: 'Duplicate', exact: true }).nth(0)`);

console.log(`\nRESULTS: ${passed} Passed, ${failed} Failed`);
if (failed > 0) process.exit(1);
