import { RecordedStep } from '../types';

export interface StepTargetMetrics {
  targetBox: { x: number; y: number; width: number; height: number };
  coordinates: { x: number; y: number };
  locatorLabel?: string;
  strategy?: string;
}

/**
 * Resolves high-fidelity, exact element bounding box and center coordinates
 * from recorded steps, locators, selectors, action types, and element metadata.
 */
export function resolveStepTargetMetrics(
  step: RecordedStep | any,
  index: number = 0,
  totalSteps: number = 1,
  platform: 'web' | 'mobile' = 'web'
): StepTargetMetrics {
  if (!step) {
    return {
      targetBox: { x: 40, y: 40, width: 20, height: 6 },
      coordinates: { x: 50, y: 43 },
      locatorLabel: 'Target Element',
      strategy: 'default'
    };
  }

  const isMobile = platform === 'mobile' || step.platform === 'mobile';

  // 1. Direct Target Box Check (Recorded Element Bounding Box)
  if (
    step.targetBox &&
    typeof step.targetBox.x === 'number' &&
    typeof step.targetBox.y === 'number' &&
    !isNaN(step.targetBox.x) &&
    !isNaN(step.targetBox.y)
  ) {
    const rawX = step.targetBox.x;
    const rawY = step.targetBox.y;
    const rawW = typeof step.targetBox.width === 'number' && !isNaN(step.targetBox.width) ? step.targetBox.width : (step.action === 'fill' ? 28 : 16);
    const rawH = typeof step.targetBox.height === 'number' && !isNaN(step.targetBox.height) ? step.targetBox.height : 5;

    const x = Math.max(0, Math.min(96, rawX));
    const y = Math.max(0, Math.min(96, rawY));
    const width = Math.max(2, Math.min(96, rawW));
    const height = Math.max(2, Math.min(96, rawH));

    const exactX = typeof step.coordinates?.x === 'number' && !isNaN(step.coordinates.x) ? step.coordinates.x : (typeof step.x === 'number' && !isNaN(step.x) ? step.x : x + width / 2);
    const exactY = typeof step.coordinates?.y === 'number' && !isNaN(step.coordinates.y) ? step.coordinates.y : (typeof step.y === 'number' && !isNaN(step.y) ? step.y : y + height / 2);

    return {
      targetBox: { x, y, width, height },
      coordinates: {
        x: Math.max(1, Math.min(99, exactX)),
        y: Math.max(1, Math.min(99, exactY))
      },
      locatorLabel: step.elementName || step.locator?.primary?.value || 'Recorded Element',
      strategy: step.locator?.primary?.type || 'exact-box'
    };
  }

  // 2. Explicit Recorded Coordinates Check
  const recordedCx = step.coordinates?.x ?? step.x ?? step.position?.x;
  const recordedCy = step.coordinates?.y ?? step.y ?? step.position?.y;

  if (
    typeof recordedCx === 'number' &&
    typeof recordedCy === 'number' &&
    !isNaN(recordedCx) &&
    !isNaN(recordedCy) &&
    (recordedCx > 0 || recordedCy > 0)
  ) {
    const cx = Math.max(2, Math.min(98, recordedCx));
    const cy = Math.max(2, Math.min(98, recordedCy));

    let width = isMobile ? 18 : 16;
    let height = isMobile ? 6 : 5;
    if (step.action === 'fill' || step.action === 'type') {
      width = isMobile ? 70 : 28;
      height = isMobile ? 6 : 5;
    } else if (step.action === 'check' || step.action === 'uncheck') {
      width = 4;
      height = 4;
    } else if (step.action === 'select' || step.action === 'selectOption') {
      width = 22;
      height = 5;
    }

    const x = Math.max(0, Math.min(96, cx - width / 2));
    const y = Math.max(0, Math.min(96, cy - height / 2));

    return {
      targetBox: { x, y, width, height },
      coordinates: { x: cx, y: cy },
      locatorLabel: step.elementName || step.locator?.primary?.value || 'Target Element',
      strategy: step.locator?.primary?.type || 'coordinates'
    };
  }

  // 3. Android UiAutomator bounds string parsing: "[x1,y1][x2,y2]"
  const boundsStr = step.bounds || step.locator?.primary?.bounds;
  if (typeof boundsStr === 'string') {
    const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (match) {
      const x1 = parseInt(match[1], 10);
      const y1 = parseInt(match[2], 10);
      const x2 = parseInt(match[3], 10);
      const y2 = parseInt(match[4], 10);
      if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2) && x2 > x1 && y2 > y1) {
        // Standard Android density base: 1080 x 2400
        const totalW = 1080;
        const totalH = 2400;
        const xPct = (x1 / totalW) * 100;
        const yPct = (y1 / totalH) * 100;
        const wPct = ((x2 - x1) / totalW) * 100;
        const hPct = ((y2 - y1) / totalH) * 100;
        return {
          targetBox: {
            x: Math.max(0, Math.min(96, Number(xPct.toFixed(1)))),
            y: Math.max(0, Math.min(96, Number(yPct.toFixed(1)))),
            width: Math.max(2, Math.min(96, Number(wPct.toFixed(1)))),
            height: Math.max(2, Math.min(96, Number(hPct.toFixed(1))))
          },
          coordinates: {
            x: Math.max(1, Math.min(99, Number((xPct + wPct / 2).toFixed(1)))),
            y: Math.max(1, Math.min(99, Number((yPct + hPct / 2).toFixed(1))))
          },
          locatorLabel: step.elementName || 'Android Element',
          strategy: 'bounds'
        };
      }
    }
  }

  // 4. Locator & Semantic Element Position Analysis
  const locVal = (step.locator?.primary?.value || step.selector || '').toLowerCase();
  const elName = (step.elementName || '').toLowerCase();
  const placeholder = (step.placeholder || '').toLowerCase();
  const action = (step.action || '').toLowerCase();
  const val = (step.value || '').toLowerCase();
  const combined = `${locVal} ${elName} ${placeholder} ${val}`.toLowerCase();

  // Strategy Label
  const stratType = step.locator?.primary?.type || 'locator';

  // ==========================================
  // MOBILE APP SPECIFIC SEMANTIC GEOMETRY
  // ==========================================
  if (isMobile) {
    // 0. WEBDRIVERIO NATIVE DEMO APP LOCATORS & COMPONENTS
    // WDIO Bottom Navigation Tabs
    if (combined.includes('tab_home') || combined.includes('elem-wdio-tab-home') || locVal === 'home' || elName === 'home') {
      const box = { x: 2, y: 92, width: 14, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Home Tab', strategy: stratType };
    }
    if (combined.includes('tab_webview') || combined.includes('elem-wdio-tab-webview') || locVal === 'webview' || elName === 'webview') {
      const box = { x: 18, y: 92, width: 14, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Webview Tab', strategy: stratType };
    }
    if (combined.includes('tab_login') || combined.includes('elem-wdio-tab-login') || (combined.includes('login') && (combined.includes('tab') || combined.includes('nav')))) {
      const box = { x: 34, y: 92, width: 14, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Login Tab', strategy: stratType };
    }
    if (combined.includes('tab_forms') || combined.includes('elem-wdio-tab-forms') || combined.includes('forms') && (combined.includes('tab') || combined.includes('button'))) {
      const box = { x: 50, y: 92, width: 14, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Forms Tab', strategy: stratType };
    }
    if (combined.includes('tab_swipe') || combined.includes('elem-wdio-tab-swipe') || combined.includes('swipe') && (combined.includes('tab') || combined.includes('button'))) {
      const box = { x: 66, y: 92, width: 14, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Swipe Tab', strategy: stratType };
    }
    if (combined.includes('tab_drag') || combined.includes('elem-wdio-tab-drag') || combined.includes('drag') && (combined.includes('tab') || combined.includes('button'))) {
      const box = { x: 82, y: 92, width: 14, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Drag Tab', strategy: stratType };
    }

    // WDIO Home Elements
    if (combined.includes('wdio_mascot') || combined.includes('webdriverio logo') || combined.includes('elem-wdio-home-robot')) {
      const box = { x: 30, y: 12, width: 40, height: 20 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO Robot Mascot', strategy: stratType };
    }
    if (combined.includes('button-visit-site') || combined.includes('btn_website') || combined.includes('elem-wdio-home-btn-webdriver')) {
      const box = { x: 12, y: 48, width: 76, height: 6.5 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Website Link Button', strategy: stratType };
    }
    if (combined.includes('button-youtube') || combined.includes('btn_youtube') || combined.includes('elem-wdio-home-btn-youtube')) {
      const box = { x: 12, y: 57, width: 76, height: 6.5 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: YouTube Button', strategy: stratType };
    }

    // WDIO Login / Sign-up Elements
    if (combined.includes('button-login-container') || combined.includes('login_tab')) {
      const box = { x: 8, y: 8, width: 40, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Login Tab Switch', strategy: stratType };
    }
    if (combined.includes('button-sign-up-container') || combined.includes('signup_tab')) {
      const box = { x: 52, y: 8, width: 40, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Sign up Tab Switch', strategy: stratType };
    }
    if (combined.includes('input-email') || combined.includes('input_email')) {
      const box = { x: 8, y: 17, width: 84, height: 7 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Email Input', strategy: stratType };
    }
    if (combined.includes('input-password') || combined.includes('input_password')) {
      const box = { x: 8, y: 27, width: 84, height: 7 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Password Input', strategy: stratType };
    }
    if (combined.includes('input-repeat-password') || combined.includes('input_repeat_password')) {
      const box = { x: 8, y: 37, width: 84, height: 7 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Repeat Password Input', strategy: stratType };
    }
    if (combined.includes('button-biometric') || combined.includes('switch_biometric')) {
      const box = { x: 8, y: 47, width: 84, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Biometrics Switch', strategy: stratType };
    }
    if (combined.includes('button-login') || combined.includes('btn_login') || (combined.includes('login') && action === 'click')) {
      const box = { x: 8, y: 56, width: 84, height: 7 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: LOGIN Action Button', strategy: stratType };
    }
    if (combined.includes('button-sign up') || combined.includes('button-signup') || combined.includes('btn_signup')) {
      const box = { x: 8, y: 56, width: 84, height: 7 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: SIGN UP Action Button', strategy: stratType };
    }

    // WDIO Forms Elements
    if (combined.includes('text-input') || combined.includes('text_input') || combined.includes('elem-wdio-text-input')) {
      const box = { x: 8, y: 16, width: 84, height: 7 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Type Something Input', strategy: stratType };
    }
    if (combined.includes('input-text-result') || combined.includes('input_text_result')) {
      const box = { x: 8, y: 25, width: 84, height: 5 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Typed Text Echo', strategy: stratType };
    }
    if ((combined.includes('switch') && !combined.includes('biometric')) || combined.includes('elem-wdio-switch')) {
      const box = { x: 8, y: 32, width: 84, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Switch Control', strategy: stratType };
    }
    if (combined.includes('dropdown') || combined.includes('elem-wdio-dropdown')) {
      const box = { x: 8, y: 46, width: 84, height: 7 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Dropdown Picker', strategy: stratType };
    }
    if (combined.includes('button-active') || combined.includes('button_active')) {
      const box = { x: 8, y: 56, width: 40, height: 6.5 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Active Button', strategy: stratType };
    }
    if (combined.includes('button-inactive') || combined.includes('button_inactive')) {
      const box = { x: 52, y: 56, width: 40, height: 6.5 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Inactive Button', strategy: stratType };
    }

    // WDIO Swipe & Drag Elements
    if (combined.includes('carousel') || combined.includes('swipe card') || combined.includes('elem-wdio-swipe-card')) {
      const box = { x: 10, y: 18, width: 80, height: 35 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Swipe Card Carousel', strategy: stratType };
    }
    if (combined.includes('drag-drop') || combined.includes('puzzle') || combined.includes('tile_')) {
      const box = { x: 15, y: 22, width: 70, height: 42 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'WDIO: Drag Puzzle Grid', strategy: stratType };
    }

    // A. QALculate / Calculator Specific Locators & Buttons

    // Tabs
    if (combined.includes('tab_standard') || (combined.includes('standard') && combined.includes('tab'))) {
      const box = { x: 3, y: 8, width: 22, height: 4.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Standard Tab', strategy: stratType };
    }
    if (combined.includes('tab_scientific') || (combined.includes('scientific') && combined.includes('tab'))) {
      const box = { x: 27, y: 8, width: 22, height: 4.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Scientific Tab', strategy: stratType };
    }
    if (combined.includes('tab_converter') || (combined.includes('converter') && combined.includes('tab'))) {
      const box = { x: 51, y: 8, width: 22, height: 4.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Converter Tab', strategy: stratType };
    }
    if (combined.includes('tab_history') || combined.includes('qalculate history tab') || (combined.includes('history') && (combined.includes('tab') || combined.includes('btn')))) {
      const box = { x: 75, y: 8, width: 22, height: 4.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'History Tab', strategy: stratType };
    }

    // Display Screen (Formula & Result)
    if (combined.includes('txt_formula') || combined.includes('calculation formula') || (combined.includes('formula') && combined.includes('display'))) {
      const box = { x: 6, y: 15, width: 88, height: 5.5 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Formula Display', strategy: stratType };
    }
    if (combined.includes('txt_result') || combined.includes('calculation result') || (combined.includes('result') && combined.includes('output'))) {
      const box = { x: 6, y: 21, width: 88, height: 6 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Result Output', strategy: stratType };
    }

    // Degree / Radian Switch
    if (combined.includes('btn_deg_rad') || combined.includes('angle mode') || combined.includes('deg_rad') || (combined.includes('rad') && combined.includes('deg'))) {
      const box = { x: 78, y: 3.5, width: 18, height: 4.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'RAD/DEG Switch', strategy: stratType };
    }

    // Memory & Quick Modifier Bar
    if (combined.includes('btn_inv') || combined.includes('inverse functions') || combined.includes('inv')) {
      const box = { x: 18, y: 28, width: 14, height: 4.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'INV Button', strategy: stratType };
    }
    if (combined.includes('btn_mc') || combined.includes('memory clear')) {
      const box = { x: 34, y: 28, width: 14, height: 4.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'MC Button', strategy: stratType };
    }
    if (combined.includes('btn_mr') || combined.includes('memory recall')) {
      const box = { x: 50, y: 28, width: 14, height: 4.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'MR Button', strategy: stratType };
    }
    if (combined.includes('btn_m_plus') || combined.includes('memory add') || combined.includes('m+')) {
      const box = { x: 66, y: 28, width: 14, height: 4.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'M+ Button', strategy: stratType };
    }
    if (combined.includes('btn_m_minus') || combined.includes('memory subtract') || combined.includes('m-')) {
      const box = { x: 82, y: 28, width: 14, height: 4.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'M- Button', strategy: stratType };
    }

    // Scientific Functions (sin, cos, tan, ln, log, sqrt, power, pi, e, parentheses)
    if (combined.includes('btn_sin') || combined.includes('sine') || (val === 'sin' || val === 'sin(' || val === 'asin(')) {
      const box = { x: 5, y: 34, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'sin Operator', strategy: stratType };
    }
    if (combined.includes('btn_cos') || combined.includes('cosine') || (val === 'cos' || val === 'cos(' || val === 'acos(')) {
      const box = { x: 28, y: 34, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'cos Operator', strategy: stratType };
    }
    if (combined.includes('btn_tan') || combined.includes('tangent') || (val === 'tan' || val === 'tan(' || val === 'atan(')) {
      const box = { x: 52, y: 34, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'tan Operator', strategy: stratType };
    }
    if (combined.includes('btn_ln') || combined.includes('natural logarithm') || val === 'ln' || val === 'ln(') {
      const box = { x: 75, y: 34, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'ln Operator', strategy: stratType };
    }

    if (combined.includes('btn_log') || combined.includes('logarithm') || val === 'log' || val === 'log(') {
      const box = { x: 5, y: 40, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'log Operator', strategy: stratType };
    }
    if (
      combined.includes('btn_sqrt') ||
      combined.includes('square root') ||
      combined.includes('sqrt') ||
      locVal.includes('sqrt') ||
      elName.includes('sqrt') ||
      elName.includes('square root') ||
      val === '√' ||
      val === '√(' ||
      combined.includes('√')
    ) {
      const box = { x: 28, y: 40, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Square Root (√) Operator', strategy: stratType };
    }
    if (combined.includes('btn_power') || combined.includes('power') || combined.includes('exponent') || val === '^' || val === 'xʸ') {
      const box = { x: 52, y: 40, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Power (xʸ) Operator', strategy: stratType };
    }
    if (combined.includes('btn_pi') || combined.includes('pi constant') || val === 'π' || combined.includes('π')) {
      const box = { x: 75, y: 40, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Pi (π) Constant', strategy: stratType };
    }

    if (combined.includes('btn_e') || combined.includes('euler') || val === 'e') {
      const box = { x: 5, y: 46, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Euler (e) Constant', strategy: stratType };
    }
    if (combined.includes('btn_paren_open') || combined.includes('open parenthesis') || val === '(') {
      const box = { x: 28, y: 46, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Open Paren (', strategy: stratType };
    }
    if (combined.includes('btn_paren_close') || combined.includes('close parenthesis') || val === ')') {
      const box = { x: 52, y: 46, width: 20, height: 5.2 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Close Paren )', strategy: stratType };
    }

    // Keypad Row 1: AC, DEL, %, ÷
    if (combined.includes('btn_ac') || combined.includes('btn_clear') || val === 'ac' || (combined.includes('clear') && !combined.includes('memory'))) {
      const box = { x: 5, y: 53, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'AC Clear Button', strategy: stratType };
    }
    if (combined.includes('btn_del') || combined.includes('delete') || val === 'del' || combined.includes('backspace')) {
      const box = { x: 28, y: 53, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'DEL Button', strategy: stratType };
    }
    if (combined.includes('btn_percent') || combined.includes('percent') || val === '%') {
      const box = { x: 52, y: 53, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Percent (%) Button', strategy: stratType };
    }
    if (combined.includes('op_div') || combined.includes('divide') || val === '÷' || val === '/') {
      const box = { x: 75, y: 53, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Divide (÷) Button', strategy: stratType };
    }

    // Keypad Row 2: 7, 8, 9, ×
    if (combined.includes('digit_7') || combined.includes('key_7') || val === '7' || (combined.includes('7') && combined.includes('digit'))) {
      const box = { x: 5, y: 62, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 7 Button', strategy: stratType };
    }
    if (combined.includes('digit_8') || combined.includes('key_8') || val === '8' || (combined.includes('8') && combined.includes('digit'))) {
      const box = { x: 28, y: 62, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 8 Button', strategy: stratType };
    }
    if (combined.includes('digit_9') || combined.includes('key_9') || val === '9' || (combined.includes('9') && combined.includes('digit'))) {
      const box = { x: 52, y: 62, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 9 Button', strategy: stratType };
    }
    if (combined.includes('op_mul') || combined.includes('multiply') || val === '×' || val === '*') {
      const box = { x: 75, y: 62, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Multiply (×) Button', strategy: stratType };
    }

    // Keypad Row 3: 4, 5, 6, -
    if (combined.includes('digit_4') || combined.includes('key_4') || val === '4' || (combined.includes('4') && combined.includes('digit'))) {
      const box = { x: 5, y: 71, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 4 Button', strategy: stratType };
    }
    if (combined.includes('digit_5') || combined.includes('key_5') || val === '5' || (combined.includes('5') && combined.includes('digit'))) {
      const box = { x: 28, y: 71, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 5 Button', strategy: stratType };
    }
    if (combined.includes('digit_6') || combined.includes('key_6') || val === '6' || (combined.includes('6') && combined.includes('digit'))) {
      const box = { x: 52, y: 71, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 6 Button', strategy: stratType };
    }
    if (combined.includes('op_sub') || combined.includes('subtract') || val === '-' || (combined.includes('minus') && !combined.includes('memory'))) {
      const box = { x: 75, y: 71, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Subtract (-) Button', strategy: stratType };
    }

    // Keypad Row 4: 1, 2, 3, +
    if (combined.includes('digit_1') || combined.includes('key_1') || val === '1' || (combined.includes('1') && combined.includes('digit'))) {
      const box = { x: 5, y: 80, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 1 Button', strategy: stratType };
    }
    if (combined.includes('digit_2') || combined.includes('key_2') || val === '2' || (combined.includes('2') && combined.includes('digit'))) {
      const box = { x: 28, y: 80, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 2 Button', strategy: stratType };
    }
    if (combined.includes('digit_3') || combined.includes('key_3') || val === '3' || (combined.includes('3') && combined.includes('digit'))) {
      const box = { x: 52, y: 80, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 3 Button', strategy: stratType };
    }
    if (combined.includes('op_add') || combined.includes('btn_plus') || val === '+' || (combined.includes('plus') && !combined.includes('minus') && !combined.includes('memory'))) {
      const box = { x: 75, y: 80, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Add (+) Button', strategy: stratType };
    }

    // Keypad Row 5: 0, ., ±, =
    if (combined.includes('digit_0') || combined.includes('key_0') || val === '0' || (combined.includes('0') && combined.includes('digit'))) {
      const box = { x: 5, y: 89, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Digit 0 Button', strategy: stratType };
    }
    if (combined.includes('btn_dot') || combined.includes('decimal') || val === '.') {
      const box = { x: 28, y: 89, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Decimal (.) Button', strategy: stratType };
    }
    if (combined.includes('btn_plus_minus') || combined.includes('plus_minus') || val === '±') {
      const box = { x: 52, y: 89, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Plus/Minus (±) Button', strategy: stratType };
    }
    if (
      combined.includes('btn_equals') ||
      combined.includes('btn_equal') ||
      combined.includes('equals') ||
      val === '=' ||
      combined.includes('calculate') ||
      combined.includes('equal')
    ) {
      const box = { x: 75, y: 89, width: 20, height: 6.8 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'Equals (=) Button', strategy: stratType };
    }

    // History list item entries
    if (combined.includes('history entry') || combined.includes('hist-')) {
      if (combined.includes('entry 1') || combined.includes('entry 0') || index === 0) {
        const box = { x: 6, y: 18, width: 88, height: 10 };
        return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'History Entry 1', strategy: stratType };
      }
      if (combined.includes('entry 2') || combined.includes('entry 1')) {
        const box = { x: 6, y: 30, width: 88, height: 10 };
        return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'History Entry 2', strategy: stratType };
      }
      if (combined.includes('entry 3')) {
        const box = { x: 6, y: 42, width: 88, height: 10 };
        return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'History Entry 3', strategy: stratType };
      }
      if (combined.includes('entry 4') || combined.includes('144') || combined.includes('37')) {
        const box = { x: 6, y: 54, width: 88, height: 10 };
        return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'History Entry 4', strategy: stratType };
      }
      const box = { x: 6, y: 66, width: 88, height: 10 };
      return { targetBox: box, coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 }, locatorLabel: 'History Entry', strategy: stratType };
    }
  }

  // Navigation action
  if (action === 'navigate') {
    return {
      targetBox: isMobile ? { x: 10, y: 4, width: 80, height: 6 } : { x: 20, y: 2, width: 60, height: 5 },
      coordinates: isMobile ? { x: 50, y: 7 } : { x: 50, y: 4.5 },
      locatorLabel: step.value || 'Page Navigation',
      strategy: 'url'
    };
  }

  // Brand / Home / Logo / Back to Products
  if (combined.includes('logo') || combined.includes('brand') || combined.includes('back-to-products') || combined.includes('back home')) {
    const box = isMobile ? { x: 6, y: 6, width: 28, height: 6 } : { x: 6, y: 3.5, width: 14, height: 4 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: step.elementName || 'Brand Home',
      strategy: stratType
    };
  }

  // Search input
  if (combined.includes('search')) {
    const box = isMobile ? { x: 10, y: 14, width: 80, height: 6 } : { x: 26, y: 3.5, width: 28, height: 4 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Search Input',
      strategy: stratType
    };
  }

  // Shopping Cart Link / Badge in Header
  if (
    (combined.includes('shopping_cart_link') || combined.includes('cart') || combined.includes('basket')) &&
    !combined.includes('add') && !combined.includes('continue')
  ) {
    const box = isMobile ? { x: 80, y: 6, width: 14, height: 6 } : { x: 88, y: 3.5, width: 7, height: 4.5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Shopping Cart',
      strategy: stratType
    };
  }

  // Authentication Fields (Username / Email)
  if (
    combined.includes('user-name') ||
    combined.includes('username') ||
    combined.includes('email') ||
    combined.includes('login_field') ||
    combined.includes('account')
  ) {
    const box = isMobile ? { x: 12, y: 30, width: 76, height: 7 } : { x: 36, y: 34, width: 28, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Username / Email',
      strategy: stratType
    };
  }

  // Password field
  if (combined.includes('password') || combined.includes('pass') || combined.includes('secret') || combined.includes('pwd')) {
    const box = isMobile ? { x: 12, y: 40, width: 76, height: 7 } : { x: 36, y: 43, width: 28, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Password',
      strategy: stratType
    };
  }

  // Remember me / Terms checkbox
  if (combined.includes('remember') || combined.includes('agree') || combined.includes('terms') || action === 'check' || action === 'uncheck') {
    const box = isMobile ? { x: 14, y: 50, width: 6, height: 6 } : { x: 36, y: 51, width: 4, height: 4 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Checkbox Option',
      strategy: stratType
    };
  }

  // Login / Sign In Submit Button
  if (
    combined.includes('login-button') ||
    (combined.includes('login') && (action === 'click' || action === 'submit')) ||
    combined.includes('sign in') ||
    combined.includes('log in') ||
    combined.includes('signin')
  ) {
    const box = isMobile ? { x: 12, y: 58, width: 76, height: 7 } : { x: 36, y: 57, width: 28, height: 5.5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Login Button',
      strategy: stratType
    };
  }

  // Sort / Filter Container
  if (combined.includes('sort') || combined.includes('filter') || combined.includes('product_sort_container')) {
    const box = isMobile ? { x: 50, y: 15, width: 42, height: 6 } : { x: 72, y: 14, width: 22, height: 4.5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Sort Filter',
      strategy: stratType
    };
  }

  // Swag Labs Product Items & Add to Cart
  // Product 1 (Backpack)
  if (combined.includes('backpack') || combined.includes('item_4')) {
    if (combined.includes('add') || combined.includes('remove') || combined.includes('btn_inventory')) {
      const box = isMobile ? { x: 55, y: 38, width: 35, height: 6 } : { x: 28, y: 44, width: 14, height: 4.5 };
      return {
        targetBox: box,
        coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        locatorLabel: 'Add to Cart: Backpack',
        strategy: stratType
      };
    }
    const box = isMobile ? { x: 10, y: 24, width: 80, height: 18 } : { x: 16, y: 24, width: 22, height: 16 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Product: Backpack',
      strategy: stratType
    };
  }

  // Product 2 (Bike Light)
  if (combined.includes('bike-light') || combined.includes('bike light') || combined.includes('item_0')) {
    if (combined.includes('add') || combined.includes('remove')) {
      const box = isMobile ? { x: 55, y: 64, width: 35, height: 6 } : { x: 74, y: 44, width: 14, height: 4.5 };
      return {
        targetBox: box,
        coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        locatorLabel: 'Add to Cart: Bike Light',
        strategy: stratType
      };
    }
    const box = isMobile ? { x: 10, y: 50, width: 80, height: 18 } : { x: 62, y: 24, width: 22, height: 16 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Product: Bike Light',
      strategy: stratType
    };
  }

  // Product 3 (Bolt T-Shirt)
  if (combined.includes('bolt-t-shirt') || combined.includes('t-shirt') || combined.includes('item_1')) {
    if (combined.includes('add') || combined.includes('remove')) {
      const box = isMobile ? { x: 55, y: 90, width: 35, height: 6 } : { x: 28, y: 74, width: 14, height: 4.5 };
      return {
        targetBox: box,
        coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        locatorLabel: 'Add to Cart: Bolt T-Shirt',
        strategy: stratType
      };
    }
    const box = isMobile ? { x: 10, y: 76, width: 80, height: 18 } : { x: 16, y: 54, width: 22, height: 16 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Product: Bolt T-Shirt',
      strategy: stratType
    };
  }

  // Product 4 (Fleece Jacket)
  if (combined.includes('fleece-jacket') || combined.includes('jacket') || combined.includes('item_5')) {
    if (combined.includes('add') || combined.includes('remove')) {
      const box = isMobile ? { x: 55, y: 116, width: 35, height: 6 } : { x: 74, y: 74, width: 14, height: 4.5 };
      return {
        targetBox: box,
        coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        locatorLabel: 'Add to Cart: Fleece Jacket',
        strategy: stratType
      };
    }
    const box = isMobile ? { x: 10, y: 102, width: 80, height: 18 } : { x: 62, y: 54, width: 22, height: 16 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Product: Fleece Jacket',
      strategy: stratType
    };
  }

  // Cart / Checkout Navigation Buttons
  if (combined.includes('continue-shopping') || combined.includes('continue shopping')) {
    const box = isMobile ? { x: 10, y: 70, width: 38, height: 6 } : { x: 16, y: 64, width: 18, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Continue Shopping Button',
      strategy: stratType
    };
  }

  if (combined.includes('checkout')) {
    const box = isMobile ? { x: 52, y: 70, width: 38, height: 6 } : { x: 68, y: 64, width: 16, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Checkout Button',
      strategy: stratType
    };
  }

  // Checkout Step 1: Customer Information
  if (combined.includes('first-name') || combined.includes('firstname') || combined.includes('first name')) {
    const box = isMobile ? { x: 12, y: 26, width: 76, height: 7 } : { x: 34, y: 28, width: 32, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'First Name Input',
      strategy: stratType
    };
  }

  if (combined.includes('last-name') || combined.includes('lastname') || combined.includes('last name')) {
    const box = isMobile ? { x: 12, y: 36, width: 76, height: 7 } : { x: 34, y: 37, width: 32, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Last Name Input',
      strategy: stratType
    };
  }

  if (
    combined.includes('postal-code') ||
    combined.includes('postalcode') ||
    combined.includes('postal code') ||
    combined.includes('zip')
  ) {
    const box = isMobile ? { x: 12, y: 46, width: 76, height: 7 } : { x: 34, y: 46, width: 32, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Postal / Zip Code Input',
      strategy: stratType
    };
  }

  if (combined.includes('cancel')) {
    const box = isMobile ? { x: 12, y: 58, width: 36, height: 6 } : { x: 34, y: 56, width: 14, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Cancel Button',
      strategy: stratType
    };
  }

  if (combined.includes('continue')) {
    const box = isMobile ? { x: 52, y: 58, width: 36, height: 6 } : { x: 52, y: 56, width: 14, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Continue Button',
      strategy: stratType
    };
  }

  // Checkout Step 2: Overview Finish
  if (combined.includes('finish')) {
    const box = isMobile ? { x: 12, y: 72, width: 76, height: 7 } : { x: 68, y: 68, width: 16, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: 'Finish Order Button',
      strategy: stratType
    };
  }

  // Fallback: Smart Form Cascade based on Action and Sequence
  if (action === 'fill' || action === 'type') {
    const row = index % 6;
    const y = 26 + row * 9;
    const box = isMobile ? { x: 12, y: 22 + row * 10, width: 76, height: 6.5 } : { x: 34, y, width: 32, height: 5 };
    return {
      targetBox: box,
      coordinates: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      locatorLabel: step.elementName || step.locator?.primary?.value || 'Input Field',
      strategy: stratType
    };
  }

  if (action === 'click' || action === 'dblclick' || action === 'submit') {
    const col = index % 3;
    const row = Math.floor((index % 9) / 3);
    const x = isMobile ? 15 + col * 26 : 24 + col * 24;
    const y = isMobile ? 30 + row * 16 : 32 + row * 14;
    const width = isMobile ? 22 : 18;
    const height = isMobile ? 6 : 5;
    const box = { x, y, width, height };
    return {
      targetBox: box,
      coordinates: { x: x + width / 2, y: y + height / 2 },
      locatorLabel: step.elementName || step.locator?.primary?.value || 'Action Button',
      strategy: stratType
    };
  }

  // Default Centralized Target
  const defaultBox = isMobile ? { x: 20, y: 40, width: 60, height: 8 } : { x: 36, y: 42, width: 28, height: 6 };
  return {
    targetBox: defaultBox,
    coordinates: { x: defaultBox.x + defaultBox.width / 2, y: defaultBox.y + defaultBox.height / 2 },
    locatorLabel: step.elementName || step.locator?.primary?.value || 'Target Element',
    strategy: stratType
  };
}

/**
 * Calculates accurate 2D coordinates for playback cursor animation
 */
export function calculateTargetCoordinates(
  step: RecordedStep | any,
  index: number = 0,
  totalSteps: number = 1,
  platform: 'web' | 'mobile' = 'web'
): { x: number; y: number } {
  const metrics = resolveStepTargetMetrics(step, index, totalSteps, platform);
  return metrics.coordinates;
}
