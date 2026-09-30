import { RecordedStep, StepLocator } from '../types';

/**
 * Generates a human-readable display description for a mobile recorded step.
 */
export function formatMobileStepDescription(step: RecordedStep): string {
  const elem = step.elementName || 'element';
  switch (step.action) {
    case 'click':
      return `Tap on "${elem}"`;
    case 'dblclick':
      return `Double-tap on "${elem}"`;
    case 'long_press':
      return `Long-press on "${elem}"`;
    case 'type':
    case 'fill':
      return `Type "${step.value || ''}" into "${elem}"`;
    case 'swipe':
    case 'scroll':
      return `Swipe on screen (deltaX: ${step.deltaX || 0}, deltaY: ${step.deltaY || 0})`;
    case 'press':
      return `Press hardware ${step.keyCombo || step.value || 'button'}`;
    case 'assertion':
      return `Assert "${elem}" is visible / contains "${step.value || ''}"`;
    case 'wait':
      return `Wait for ${step.value || '2'} seconds`;
    default:
      return `${step.action.toUpperCase()} on "${elem}"`;
  }
}

/**
 * Validates whether a recorded step has sufficient locator metadata for playback.
 */
export function validateMobileStep(step: RecordedStep): { valid: boolean; reason?: string } {
  if (!step.id) return { valid: false, reason: 'Missing step ID' };
  if (!step.action) return { valid: false, reason: 'Missing step action' };

  if (step.action === 'press') {
    if (!step.keyCombo && !step.value) {
      return { valid: false, reason: 'Press action requires keyCombo or value' };
    }
    return { valid: true };
  }

  if (step.action === 'wait') {
    return { valid: true };
  }

  const primaryLoc = step.locator?.primary;
  if (!primaryLoc || !primaryLoc.value) {
    if (!step.coordinates && !step.x) {
      return { valid: false, reason: 'Step lacks both locator strategy and tap coordinates' };
    }
  }

  return { valid: true };
}

/**
 * Optimizes a list of recorded steps by collapsing redundant actions (e.g. intermediate keystrokes into full text).
 */
export function optimizeMobileStepSequence(steps: RecordedStep[]): RecordedStep[] {
  if (steps.length <= 1) return steps;

  const optimized: RecordedStep[] = [];
  for (let i = 0; i < steps.length; i++) {
    const current = steps[i];
    const prev = optimized[optimized.length - 1];

    // If consecutive type/fill actions on the same element, collapse to the latest value
    if (
      prev &&
      (prev.action === 'type' || prev.action === 'fill') &&
      (current.action === 'type' || current.action === 'fill') &&
      prev.locator?.primary?.value === current.locator?.primary?.value
    ) {
      optimized[optimized.length - 1] = {
        ...current,
        value: current.value
      };
    } else {
      optimized.push(current);
    }
  }

  return optimized.map((s, idx) => ({ ...s, sequenceNumber: idx + 1 }));
}

/**
 * Converts mobile step sequence into runnable Appium TypeScript code snippet.
 */
export function convertMobileStepsToAppiumCode(
  steps: RecordedStep[],
  appPackage: string = 'com.example.app',
  appActivity: string = '.MainActivity'
): string {
  const codeLines: string[] = [
    `import { remote } from 'webdriverio';`,
    ``,
    `describe('Mobile Appium Automated Flow', () => {`,
    `  let driver: WebdriverIO.Browser;`,
    ``,
    `  before(async () => {`,
    `    driver = await remote({`,
    `      path: '/',`,
    `      port: 4723,`,
    `      capabilities: {`,
    `        platformName: 'Android',`,
    `        'appium:automationName': 'UiAutomator2',`,
    `        'appium:appPackage': '${appPackage}',`,
    `        'appium:appActivity': '${appActivity}',`,
    `        'appium:ensureWebviewsHavePages': true`,
    `      }`,
    `    });`,
    `  });`,
    ``,
    `  after(async () => {`,
    `    if (driver) await driver.deleteSession();`,
    `  });`,
    ``,
    `  it('should execute recorded mobile steps successfully', async () => {`
  ];

  steps.forEach(step => {
    if (step.skipped) return;
    const desc = formatMobileStepDescription(step);
    codeLines.push(`    // ${desc}`);

    const primary = step.locator?.primary;
    let selector = '';
    if (primary) {
      if (primary.type === 'accessibility-id') {
        selector = `~${primary.value}`;
      } else if (primary.type === 'resource-id') {
        selector = `id=${primary.value}`;
      } else if (primary.type === 'xpath') {
        selector = primary.value;
      } else if (primary.type === 'text') {
        selector = `//*[@text='${primary.value}']`;
      } else {
        selector = primary.value;
      }
    }

    switch (step.action) {
      case 'click':
        if (selector) {
          codeLines.push(`    const el_${step.sequenceNumber} = await driver.$('${selector}');`);
          codeLines.push(`    await el_${step.sequenceNumber}.click();`);
        } else if (step.coordinates) {
          codeLines.push(`    await driver.performActions([{ type: 'pointer', id: 'finger1', actions: [{ type: 'pointerMove', x: ${step.coordinates.x}, y: ${step.coordinates.y} }, { type: 'pointerDown' }, { type: 'pointerUp' }] }]);`);
        }
        break;
      case 'type':
      case 'fill':
        codeLines.push(`    const el_${step.sequenceNumber} = await driver.$('${selector}');`);
        codeLines.push(`    await el_${step.sequenceNumber}.setValue('${step.value || ''}');`);
        break;
      case 'long_press':
        codeLines.push(`    const el_${step.sequenceNumber} = await driver.$('${selector}');`);
        codeLines.push(`    await driver.action('pointer').move({ origin: el_${step.sequenceNumber} }).down().pause(1000).up().perform();`);
        break;
      case 'press':
        if (step.keyCombo === 'BACK' || step.value === 'BACK') {
          codeLines.push(`    await driver.back();`);
        } else if (step.keyCombo === 'HOME' || step.value === 'HOME') {
          codeLines.push(`    await driver.pressKeyCode(3); // KEYCODE_HOME`);
        } else {
          codeLines.push(`    await driver.pressKeyCode(66); // KEYCODE_ENTER`);
        }
        break;
      case 'wait':
        const seconds = parseInt(step.value || '2', 10);
        codeLines.push(`    await driver.pause(${seconds * 1000});`);
        break;
      case 'assertion':
        codeLines.push(`    const el_${step.sequenceNumber} = await driver.$('${selector}');`);
        codeLines.push(`    await expect(el_${step.sequenceNumber}).toBeDisplayed();`);
        break;
      default:
        break;
    }
    codeLines.push(``);
  });

  codeLines.push(`  });`);
  codeLines.push(`});`);

  return codeLines.join('\n');
}
