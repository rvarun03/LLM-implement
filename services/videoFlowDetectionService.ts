import { ExtractedVideoFrame } from '../utils/videoExtractor';
import { RecordedStep, UniversalLocator, StepLocator, AutomationScriptFile, AutomationTool, ProgrammingLanguage, TestCase, TestStatus, TestType, TestIntent, TestPriority } from '../types';
import { detectVideoWalkthroughActions, DetectedVideoAction, DetectedVideoPage } from '../geminiService';
import { BddDocumentParsed } from '../utils/automationFrameworkOptions';
import { generateMultiFrameworkProject } from './codeGenerators/multiFrameworkScriptGenerator';

export interface DOMElementInfo {
  index: number;
  pageUrl?: string;
  tagName: string;
  id: string;
  name: string;
  type: string;
  testId: string;
  role: string;
  ariaLabel: string;
  placeholder: string;
  title: string;
  textContent: string;
  value?: string;
  className: string;
  cssSelector: string;
  xpath: string;
  exactLocator?: {
    type: string;
    value: string;
    playwright: string;
    isUnique?: boolean;
  };
  boundingBox?: { x: number; y: number; width: number; height: number };
  isInteractive: boolean;
  isVisible: boolean;
}

export interface MatchedStepAction {
  step: RecordedStep;
  detectedAction: DetectedVideoAction;
  matchedDomElement?: DOMElementInfo;
  matchScore: number;
  matchReason: string;
  extractedFrame?: ExtractedVideoFrame;
}

export interface VideoFlowAnalysisResult {
  flowName: string;
  flowDescription: string;
  detectedUrl: string;
  platform: 'web' | 'mobile';
  steps: RecordedStep[];
  matchedActions: MatchedStepAction[];
  generatedScript: string;
  scriptFiles: AutomationScriptFile[];
  domElementsCount: number;
  livePageTitle?: string;
  liveScreenshot?: string;
  testCases: TestCase[];
  detectedPages: DetectedVideoPage[];
  domElementsByUrl?: Record<string, DOMElementInfo[]>;
}

export interface VideoFlowAnalysisOptions {
  targetUrlOverride?: string;
  videoFileName: string;
  videoDuration?: number;
  platform?: 'web' | 'mobile';
  tool?: AutomationTool;
  language?: ProgrammingLanguage;
  framework?: string;
  bddDocument?: BddDocumentParsed;
  userDirectives?: string;
  enableDataDriven?: boolean;
  onProgress?: (stage: string, percent: number) => void;
}

/**
 * Normalizes string for fuzzy comparison
 */
function normalizeStr(val?: string): string {
  if (!val) return '';
  return val.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Calculates matching score between a detected visual action and a DOM element
 */
function calculateElementMatchScore(action: DetectedVideoAction, el: DOMElementInfo): number {
  let score = 0;
  const actNameNorm = normalizeStr(action.elementName);
  const actHintNorm = normalizeStr(action.targetHint);
  const actValNorm = normalizeStr(action.value);
  const locHints = action.suggestedLocators || {};

  const isPasswordAction = actNameNorm.includes('password') || actHintNorm.includes('password') || action.elementName?.toLowerCase().includes('password');
  const isLoginAction = actNameNorm.includes('login') || actHintNorm.includes('login') || actNameNorm.includes('signin') || actHintNorm.includes('signin') || action.elementName?.toLowerCase().includes('login');

  // Password-specific affinity boost
  if (isPasswordAction) {
    if (el.type === 'password') score += 70;
    if (el.name?.toLowerCase().includes('password') || el.id?.toLowerCase().includes('password')) score += 50;
    if (el.placeholder?.toLowerCase().includes('password')) score += 45;
  }

  // Login-specific affinity boost
  if (isLoginAction && action.action === 'click') {
    const isButtonTag = el.tagName === 'button' || el.role === 'button' || (el.tagName === 'input' && el.type === 'submit');
    if (isButtonTag) score += 30;
    const txtLower = (el.textContent || '').toLowerCase();
    if (txtLower.includes('log in') || txtLower.includes('login') || txtLower.includes('sign in') || txtLower.includes('signin')) score += 60;
    if (el.id?.toLowerCase().includes('login') || el.name?.toLowerCase().includes('login')) score += 40;
  }

  // 1. Exact or partial Data-TestID Match (Tier 5)
  if (el.testId) {
    const elTestIdNorm = normalizeStr(el.testId);
    if (locHints.dataTestId && elTestIdNorm === normalizeStr(locHints.dataTestId)) score += 80;
    else if (actNameNorm && elTestIdNorm === actNameNorm) score += 70;
    else if (actNameNorm && (elTestIdNorm.includes(actNameNorm) || actNameNorm.includes(elTestIdNorm))) score += 50;
    else if (actHintNorm && elTestIdNorm.includes(actHintNorm)) score += 40;
    else score += 10;
  }

  // 2. ID Match (Tier 7)
  if (el.id && !/^\d+$/.test(el.id)) {
    const elIdNorm = normalizeStr(el.id);
    if (locHints.id && elIdNorm === normalizeStr(locHints.id)) score += 75;
    else if (actNameNorm && elIdNorm === actNameNorm) score += 70;
    else if (actNameNorm && (elIdNorm.includes(actNameNorm) || actNameNorm.includes(elIdNorm))) score += 50;
    else if (actHintNorm && (elIdNorm.includes(actHintNorm) || actHintNorm.includes(elIdNorm))) score += 40;
  }

  // 3. Name Attribute Match (Tier 6)
  if (el.name) {
    const elNameNorm = normalizeStr(el.name);
    if (locHints.name && elNameNorm === normalizeStr(locHints.name)) score += 65;
    else if (actNameNorm && elNameNorm === actNameNorm) score += 60;
    else if (actNameNorm && (elNameNorm.includes(actNameNorm) || actNameNorm.includes(elNameNorm))) score += 45;
  }

  // 4. Role Match & Tag Affinity (Tier 2)
  if (el.role || el.tagName) {
    const actType = action.action;
    if (actType === 'click') {
      if (el.tagName === 'button' || el.role === 'button') score += 25;
      else if (el.tagName === 'a' || el.role === 'link') score += 25;
    } else if (actType === 'fill') {
      if (el.tagName === 'input' || el.tagName === 'textarea' || el.role === 'textbox') score += 30;
    } else if (actType === 'selectOption') {
      if (el.tagName === 'select' || el.role === 'combobox' || el.role === 'listbox') score += 30;
    } else if (actType === 'check' || actType === 'uncheck') {
      if (el.type === 'checkbox' || el.role === 'checkbox') score += 35;
    }
  }

  // 5. Accessible Name / Placeholder / Title / Text Content Match (Tier 1, 3, 4)
  const elTextNorm = normalizeStr(el.textContent);
  const elPlaceholderNorm = normalizeStr(el.placeholder);
  const elAriaNorm = normalizeStr(el.ariaLabel);

  if (actNameNorm && elTextNorm && (elTextNorm === actNameNorm || elTextNorm.includes(actNameNorm) || actNameNorm.includes(elTextNorm))) {
    score += (elTextNorm === actNameNorm ? 50 : 35);
  }
  if (actNameNorm && elPlaceholderNorm && (elPlaceholderNorm === actNameNorm || elPlaceholderNorm.includes(actNameNorm) || actNameNorm.includes(elPlaceholderNorm))) {
    score += 35;
  }
  if (actNameNorm && elAriaNorm && (elAriaNorm === actNameNorm || elAriaNorm.includes(actNameNorm) || actNameNorm.includes(elAriaNorm))) {
    score += 35;
  }

  // Target hint comparison (e.g. "Click Submit", "Log out button", "Enter student into Username")
  if (actHintNorm && elTextNorm && elTextNorm.length > 0 && actHintNorm.includes(elTextNorm)) {
    score += 40;
  }

  // Value match for form fields
  if (actValNorm && el.value && normalizeStr(el.value) === actValNorm) {
    score += 15;
  }

  // Visibility / Interactivity Boost
  if (el.isVisible && el.isInteractive) {
    score += 15;
  }

  return score;
}

/**
 * Builds the exact, stable, and singular locator from the actual DOM element
 * strictly following the 8-level priority hierarchy:
 * 1. getByText()
 * 2. getByRole()
 * 3. getByPlaceholder()
 * If these are not available or unique, then use:
 * 4. getByLabel()
 * 5. getByTestId()
 * 6. locator() (name / attribute)
 * 7. id / CSS
 * 8. XPath as the last option
 *
 * The locator must match the actual DOM element in the target URL.
 * Use only one accurate and stable locator for each element.
 */
function buildStableUniversalLocator(
  action: DetectedVideoAction,
  matchedEl?: DOMElementInfo
): UniversalLocator {
  // If this action is page navigation:
  if (action.action === 'navigate') {
    const navUrl = action.value || action.pageUrl || 'https://app.example.com';
    return {
      primary: {
        type: 'navigate' as any,
        value: navUrl,
        playwright: `page.goto('${navUrl}')`
      },
      alternatives: []
    };
  }

  // If matched with a live DOM element that already has a verified unique locator:
  if (matchedEl?.exactLocator) {
    return {
      primary: {
        type: matchedEl.exactLocator.type as any,
        value: matchedEl.exactLocator.value,
        playwright: matchedEl.exactLocator.playwright
      },
      alternatives: [] // Strictly single exact locator
    };
  }

  // If matched with a DOM element without pre-computed exactLocator, follow strict priority order:
  if (matchedEl) {
    const isInputOrTextArea = ['input', 'textarea'].includes(matchedEl.tagName);

    // 1. getByText() (Priority 1: Visible text - for buttons, links, labels, text elements)
    if (!isInputOrTextArea && matchedEl.textContent && matchedEl.textContent.trim().length > 0 && matchedEl.textContent.trim().length < 60) {
      const cleanText = matchedEl.textContent.trim();
      return {
        primary: {
          type: 'text',
          value: cleanText,
          playwright: `page.getByText('${cleanText.replace(/'/g, "\\'")}', { exact: true })`
        },
        alternatives: []
      };
    }

    // 2. getByRole() (Priority 2: Accessible Role + Name)
    if (matchedEl.role || ['button', 'a', 'input', 'select', 'textarea'].includes(matchedEl.tagName)) {
      const roleName = matchedEl.role || (matchedEl.tagName === 'a' ? 'link' : matchedEl.tagName === 'button' ? 'button' : matchedEl.tagName === 'select' ? 'combobox' : 'textbox');
      const labelName = matchedEl.ariaLabel || (matchedEl.tagName === 'button' || matchedEl.tagName === 'a' ? matchedEl.textContent : '') || matchedEl.placeholder || matchedEl.title;
      if (labelName && labelName.trim().length > 0 && labelName.trim().length < 50) {
        return {
          primary: {
            type: 'role',
            value: `${roleName}: ${labelName.trim()}`,
            playwright: `page.getByRole('${roleName}', { name: '${labelName.trim().replace(/'/g, "\\'")}' })`
          },
          alternatives: []
        };
      }
    }

    // 3. getByPlaceholder() (Priority 3: Placeholder)
    if (matchedEl.placeholder && matchedEl.placeholder.trim().length > 0) {
      const ph = matchedEl.placeholder.trim();
      return {
        primary: {
          type: 'placeholder',
          value: ph,
          playwright: `page.getByPlaceholder('${ph.replace(/'/g, "\\'")}')`
        },
        alternatives: []
      };
    }

    // 4. getByLabel() (Priority 4: Associated Label or Aria-Label)
    if (matchedEl.ariaLabel && matchedEl.ariaLabel.trim().length > 0) {
      const al = matchedEl.ariaLabel.trim();
      return {
        primary: {
          type: 'label' as any,
          value: al,
          playwright: `page.getByLabel('${al.replace(/'/g, "\\'")}')`
        },
        alternatives: []
      };
    }

    // 5. getByTestId() (Priority 5: Data-TestId)
    if (matchedEl.testId && matchedEl.testId.trim().length > 0) {
      const tid = matchedEl.testId.trim();
      return {
        primary: {
          type: 'data-testid',
          value: tid,
          playwright: `page.getByTestId('${tid}')`
        },
        alternatives: []
      };
    }

    // 6. locator() (Priority 6: Semantic Name / Attribute)
    if (matchedEl.name && matchedEl.name.trim().length > 0) {
      const nm = matchedEl.name.trim();
      return {
        primary: {
          type: 'name',
          value: `${matchedEl.tagName}[name="${nm}"]`,
          playwright: `page.locator('${matchedEl.tagName}[name="${nm}"]')`
        },
        alternatives: []
      };
    }

    // 7. id / CSS (Priority 7: Clean ID or CSS Selector)
    if (matchedEl.id && !/^\d+$/.test(matchedEl.id)) {
      return {
        primary: {
          type: 'id',
          value: `#${matchedEl.id}`,
          playwright: `page.locator('#${matchedEl.id}')`
        },
        alternatives: []
      };
    }
    if (matchedEl.cssSelector) {
      return {
        primary: {
          type: 'css',
          value: matchedEl.cssSelector,
          playwright: `page.locator('${matchedEl.cssSelector}')`
        },
        alternatives: []
      };
    }

    // 8. XPath (Priority 8: XPath as the last option)
    if (matchedEl.xpath) {
      return {
        primary: {
          type: 'xpath',
          value: matchedEl.xpath,
          playwright: `page.locator('xpath=${matchedEl.xpath}')`
        },
        alternatives: []
      };
    }
  }

  // Fallback when live DOM is inaccessible: strictly follow 1-8 priority hierarchy
  const sl = action.suggestedLocators || {};
  const elNameLower = (action.elementName || '').toLowerCase();

  // 1. getByText() (Only for click, check, uncheck, assertion actions - NEVER for fill/type)
  if (action.action !== 'fill' && (action.action as string) !== 'type' && sl.text && sl.text.trim().length > 0 && sl.text.trim().length < 60) {
    const txt = sl.text.trim();
    return {
      primary: {
        type: 'text',
        value: txt,
        playwright: `page.getByText('${txt.replace(/'/g, "\\'")}', { exact: true })`
      },
      alternatives: []
    };
  }

  // 2. getByRole()
  if (sl.role && (sl.name || sl.text || action.elementName)) {
    const roleName = sl.role;
    const accessibleName = (sl.name || sl.text || action.elementName || '').trim();
    if (accessibleName) {
      return {
        primary: {
          type: 'role',
          value: `${roleName}: ${accessibleName}`,
          playwright: `page.getByRole('${roleName}', { name: '${accessibleName.replace(/'/g, "\\'")}' })`
        },
        alternatives: []
      };
    }
  }

  // 3. getByPlaceholder()
  if (sl.placeholder && sl.placeholder.trim().length > 0) {
    const ph = sl.placeholder.trim();
    return {
      primary: {
        type: 'placeholder',
        value: ph,
        playwright: `page.getByPlaceholder('${ph.replace(/'/g, "\\'")}')`
      },
      alternatives: []
    };
  }

  // Special Password / Username heuristic for Priority 3 (getByPlaceholder)
  if (elNameLower.includes('password') && action.action === 'fill') {
    return {
      primary: {
        type: 'placeholder',
        value: 'Password',
        playwright: `page.getByPlaceholder('Password')`
      },
      alternatives: []
    };
  }

  // 4. getByLabel()
  if (sl.ariaLabel && sl.ariaLabel.trim().length > 0) {
    const al = sl.ariaLabel.trim();
    return {
      primary: {
        type: 'label' as any,
        value: al,
        playwright: `page.getByLabel('${al.replace(/'/g, "\\'")}')`
      },
      alternatives: []
    };
  }

  // 5. getByTestId()
  if (sl.dataTestId && sl.dataTestId.trim().length > 0) {
    const tid = sl.dataTestId.trim();
    return {
      primary: {
        type: 'data-testid',
        value: tid,
        playwright: `page.getByTestId('${tid}')`
      },
      alternatives: []
    };
  }

  // 6. locator() (name attribute)
  if (sl.name && sl.name.trim().length > 0) {
    const nm = sl.name.trim();
    return {
      primary: {
        type: 'name',
        value: `[name="${nm}"]`,
        playwright: `page.locator('[name="${nm}"]')`
      },
      alternatives: []
    };
  }

  // 7. id / CSS
  if (sl.id && sl.id.trim().length > 0) {
    const cleanId = sl.id.replace(/^#/, '');
    return {
      primary: {
        type: 'id',
        value: `#${cleanId}`,
        playwright: `page.locator('#${cleanId}')`
      },
      alternatives: []
    };
  }
  if (sl.css && sl.css.trim().length > 0) {
    return {
      primary: {
        type: 'css',
        value: sl.css,
        playwright: `page.locator('${sl.css}')`
      },
      alternatives: []
    };
  }

  // 8. XPath (Last option)
  if (sl.xpath && sl.xpath.trim().length > 0) {
    return {
      primary: {
        type: 'xpath',
        value: sl.xpath,
        playwright: `page.locator('xpath=${sl.xpath}')`
      },
      alternatives: []
    };
  }

  // Clean single default locator based on action type
  const cleanId = (action.elementName || 'element').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  if (action.action === 'click') {
    const btnLabel = action.elementName || (elNameLower.includes('login') ? 'Login' : 'Submit');
    return {
      primary: {
        type: 'role',
        value: `button: ${btnLabel}`,
        playwright: `page.getByRole('button', { name: '${btnLabel.replace(/'/g, "\\'")}' })`
      },
      alternatives: []
    };
  } else if (action.action === 'fill') {
    if (action.elementName) {
      return {
        primary: {
          type: 'placeholder',
          value: action.elementName,
          playwright: `page.getByPlaceholder('${action.elementName.replace(/'/g, "\\'")}')`
        },
        alternatives: []
      };
    }
    return {
      primary: {
        type: 'id',
        value: `#${cleanId}`,
        playwright: `page.locator('#${cleanId}')`
      },
      alternatives: []
    };
  }

  return {
    primary: {
      type: 'css',
      value: `#${cleanId}`,
      playwright: `page.locator('#${cleanId}')`
    },
    alternatives: []
  };
}

/**
 * Generates an end-to-end executable test script & Page Object Model architecture
 * strictly according to the selected Automation Tool, Language, and Framework.
 */
function generateAutomationScriptFromSteps(
  flowName: string,
  targetUrl: string,
  steps: RecordedStep[],
  tool: AutomationTool = "Playwright",
  language: ProgrammingLanguage = "TypeScript",
  detectedPages: DetectedVideoPage[] = [],
  framework?: string,
  bddDocument?: BddDocumentParsed,
  platform: "web" | "mobile" = "web",
  enableDataDriven: boolean = false
): { script: string; files: AutomationScriptFile[] } {
  const result = generateMultiFrameworkProject({
    flowName,
    targetUrl,
    steps,
    tool,
    language,
    framework,
    bddDocument,
    platform,
    enableDataDriven
  });

  return {
    script: result.combinedMarkdown,
    files: result.files
  };
}

/**
 * End-to-End Orchestrator: Video Upload → Frames Extraction → AI Detection → Multi-Page DOM Inspection → Smart Matching → Stable Locator Generation → Script Synthesis
 */
export async function analyzeVideoWalkthroughAndSynthesizeFlow(
  videoFrames: ExtractedVideoFrame[],
  options: VideoFlowAnalysisOptions
): Promise<VideoFlowAnalysisResult> {
  const {
    targetUrlOverride,
    videoFileName,
    videoDuration,
    platform = 'web',
    tool = 'Playwright',
    language = 'TypeScript',
    userDirectives,
    onProgress
  } = options;

  if (!videoFrames || videoFrames.length === 0) {
    throw new Error('No video frames available for analysis.');
  }

  // -------------------------------------------------------------
  // STAGE 1: Visual Action Detection & Multi-Page Identification
  // -------------------------------------------------------------
  onProgress?.('Analyzing video keyframes, pages, and chronological user clicks...', 20);

  const detectionResult = await detectVideoWalkthroughActions(
    videoFrames.map(f => ({ timestamp: f.timestamp, image: f.image })),
    {
      targetUrl: targetUrlOverride,
      videoFileName,
      videoDuration,
      userInstructions: userDirectives,
      platform
    }
  );

  const resolvedUrl = targetUrlOverride || detectionResult.detectedUrl || 'https://app.example.com';
  const flowName = detectionResult.flowTitle || `${videoFileName.replace(/\.[^/.]+$/, '')} Flow`;
  const flowDescription = detectionResult.flowDescription || 'Automated flow generated from uploaded video';
  const detectedPages = detectionResult.pages || [];

  // Collect all distinct URLs to inspect across all pages
  const urlsToInspect: string[] = [resolvedUrl];
  detectedPages.forEach(p => {
    let pageUrl = p.pageUrl;
    if (pageUrl && !pageUrl.startsWith('http://') && !pageUrl.startsWith('https://')) {
      try {
        pageUrl = new URL(pageUrl, resolvedUrl).href;
        p.pageUrl = pageUrl;
      } catch {
        pageUrl = resolvedUrl;
      }
    }
    if (pageUrl && !urlsToInspect.includes(pageUrl)) {
      urlsToInspect.push(pageUrl);
    }
  });

  // -------------------------------------------------------------
  // STAGE 2: Live Multi-Page DOM Inspection via Headless Playwright
  // -------------------------------------------------------------
  onProgress?.(`Inspecting live DOM across ${urlsToInspect.length} page(s) at ${resolvedUrl}...`, 45);

  let domElements: DOMElementInfo[] = [];
  let domElementsByUrl: Record<string, DOMElementInfo[]> = {};
  let livePageTitle = '';
  let liveScreenshot = '';

  try {
    const domRes = await fetch('/api/record-play/inspect-dom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: resolvedUrl, urls: urlsToInspect })
    });

    if (domRes.ok) {
      const data = await domRes.json();
      if (data.success && Array.isArray(data.elements)) {
        domElements = data.elements;
        domElementsByUrl = data.elementsByUrl || { [resolvedUrl]: domElements };
        livePageTitle = data.pageTitle || '';
        liveScreenshot = data.screenshot || '';
      }
    }
  } catch (domErr) {
    console.warn('[VideoFlowDetection] Live DOM inspection notice:', domErr);
  }

  // -------------------------------------------------------------
  // STAGE 3: Element Matching & Stable Locator Generation
  // -------------------------------------------------------------
  onProgress?.('Matching every page click with live DOM & building resilient locators...', 70);

  const rawActions = detectionResult.actions && detectionResult.actions.length > 0
    ? [...detectionResult.actions]
    : [
        {
          id: 'step-1',
          action: 'navigate' as const,
          elementName: 'Application Homepage',
          pageTitle: 'Home Page',
          pageUrl: resolvedUrl,
          value: resolvedUrl,
          targetHint: `Navigate to ${resolvedUrl}`,
          confidence: 0.98,
          frameIndex: 0,
          timestamp: '00:00',
          visualContext: `Navigates to ${resolvedUrl}`,
          suggestedLocators: { css: 'body' }
        }
      ];

  // Guarantee that step 1 is always navigating to the exact target URL
  if (rawActions.length > 0 && rawActions[0].action !== 'navigate') {
    rawActions.unshift({
      id: `step-nav-initial`,
      action: 'navigate' as const,
      elementName: 'Target Application URL',
      pageTitle: detectionResult.pages?.[0]?.pageTitle || 'Landing Page',
      pageUrl: resolvedUrl,
      value: resolvedUrl,
      targetHint: `Navigate to ${resolvedUrl}`,
      confidence: 1.0,
      frameIndex: 0,
      timestamp: '00:00',
      visualContext: `Initial navigation to ${resolvedUrl}`,
      suggestedLocators: { css: 'body' }
    });
  } else if (rawActions[0] && rawActions[0].action === 'navigate') {
    rawActions[0].value = rawActions[0].value || rawActions[0].pageUrl || resolvedUrl;
    rawActions[0].pageUrl = rawActions[0].pageUrl || rawActions[0].value || resolvedUrl;
  }

  // Normalize page URLs across all raw actions
  rawActions.forEach((act) => {
    if (act.pageUrl && !act.pageUrl.startsWith('http://') && !act.pageUrl.startsWith('https://')) {
      try {
        act.pageUrl = new URL(act.pageUrl, resolvedUrl).href;
      } catch {
        act.pageUrl = resolvedUrl;
      }
    } else if (!act.pageUrl) {
      act.pageUrl = resolvedUrl;
    }
  });

  const matchedActions: MatchedStepAction[] = [];
  const recordedSteps: RecordedStep[] = [];

  rawActions.forEach((act, idx) => {
    let bestDomMatch: DOMElementInfo | undefined;
    let highestScore = 0;

    // Search within page-specific elements first, then all elements
    const pageTargetElements = (act.pageUrl && domElementsByUrl[act.pageUrl]) || domElements;

    if (pageTargetElements.length > 0) {
      for (const el of pageTargetElements) {
        const score = calculateElementMatchScore(act, el);
        if (score > highestScore && score >= 20) {
          highestScore = score;
          bestDomMatch = el;
        }
      }
    }

    const universalLocator = buildStableUniversalLocator(act, bestDomMatch);
    const frame = videoFrames[act.frameIndex] || videoFrames[Math.min(idx, videoFrames.length - 1)];

    const step: RecordedStep = {
      id: `step-${Date.now()}-${idx + 1}`,
      action: act.action as any,
      elementName: act.elementName,
      value: act.value,
      url: act.pageUrl || resolvedUrl,
      screen: act.pageTitle || bestDomMatch?.title || livePageTitle || flowName,
      platform,
      timestamp: Date.now() + idx * 1000,
      sequenceNumber: idx + 1,
      locator: universalLocator,
      screenshot: frame?.image || undefined
    };

    recordedSteps.push(step);

    matchedActions.push({
      step,
      detectedAction: act,
      matchedDomElement: bestDomMatch,
      matchScore: highestScore,
      matchReason: bestDomMatch 
        ? `Matched live DOM element <${bestDomMatch.tagName}> on ${act.pageTitle || 'page'} with score ${highestScore}% (${universalLocator.primary.type})` 
        : `Derived high-stability locator (${universalLocator.primary.type}) from visual action context`,
      extractedFrame: frame
    });
  });

  // -------------------------------------------------------------
  // STAGE 4: Exact Test Cases Synthesis (Granular Split Decomposition)
  // -------------------------------------------------------------
  const cleanTitle = flowName.replace(/[^a-zA-Z0-9 ]/g, '');
  const baseTcId = `TC-VID-${Date.now().toString().slice(-4)}`;
  const testCases: TestCase[] = [];

  // 1. Generate individual granular test cases for each discrete recorded step
  recordedSteps.forEach((step, idx) => {
    const actionDesc = `${step.action.toUpperCase()} on "${step.elementName || step.screen || 'element'}" ${step.value ? `with "${step.value}"` : ''}`.trim();
    const frameTime = step.timestamp ? `[@ ${step.timestamp}]` : `[Step ${idx + 1}]`;
    const stepTitle = `Verify ${cleanTitle} - Step ${idx + 1}: ${step.elementName || step.action}`;

    testCases.push({
      id: Math.random().toString(36).substr(2, 9),
      testCaseId: `${baseTcId}-${String(idx + 1).padStart(2, '0')}`,
      title: stepTitle,
      description: `Verifies isolated execution, UI feedback, and state transition for step ${idx + 1} (${actionDesc}) identified in video recording.`,
      steps: [
        `Navigate to "${resolvedUrl}" and ensure application is stabilized ${frameTime}`,
        `Locate target element "${step.elementName || step.locator.primary.value}" using ${step.locator.primary.type}`,
        `Perform action: ${actionDesc}`,
        `Assert that the element reacts with appropriate visual state change and no errors are thrown`
      ],
      expectedResult: `Element responds immediately to ${step.action} action, state updates accurately, and UI matches video recording.`,
      status: TestStatus.NOT_EXECUTED,
      isApproved: true,
      testType: TestType.FUNCTIONAL,
      testIntent: TestIntent.POSITIVE,
      priority: idx === 0 || idx === recordedSteps.length - 1 ? TestPriority.HIGH : TestPriority.MEDIUM,
      testDataSets: [
        step.value ? `Set 1: Target value "${step.value}"` : 'Set 1: Primary action trigger',
        'Set 2: Boundary test data',
        'Set 3: Alternative input format'
      ],
      source: 'video_walkthrough',
      videoEvidence: videoFileName,
      executedAt: new Date().toISOString()
    });
  });

  // 2. Add End-to-End Workflow Integration Test Case
  testCases.push({
    id: Math.random().toString(36).substr(2, 9),
    testCaseId: `${baseTcId}-${String(testCases.length + 1).padStart(2, '0')}`,
    title: `Verify ${cleanTitle} End-to-End Workflow Execution`,
    description: `Executes all ${recordedSteps.length} sequential user actions across ${detectedPages.length || 1} page(s) captured from the video recording.`,
    steps: recordedSteps.map((s, i) => `Step ${i + 1} [@ ${s.locator.primary.type}]: ${s.action.toUpperCase()} "${s.elementName || s.screen}" ${s.value ? `with value "${s.value}"` : ''}`),
    expectedResult: `Application completes workflow successfully with all page transitions and field validations matching recorded video.`,
    status: TestStatus.NOT_EXECUTED,
    isApproved: true,
    testType: TestType.FUNCTIONAL,
    testIntent: TestIntent.POSITIVE,
    priority: TestPriority.HIGH,
    testDataSets: [
      'Set 1: Verified dataset from video recording',
      'Set 2: Secondary test payload',
      'Set 3: Regression automation payload'
    ],
    source: 'video_walkthrough',
    videoEvidence: videoFileName,
    executedAt: new Date().toISOString()
  });

  // 3. Add Form Validation & Negative States Test Case
  testCases.push({
    id: Math.random().toString(36).substr(2, 9),
    testCaseId: `${baseTcId}-${String(testCases.length + 1).padStart(2, '0')}`,
    title: `Verify ${cleanTitle} Form Validation and Negative States`,
    description: `Tests boundary conditions, missing required inputs, and error alerts on pages identified in video.`,
    steps: [
      `Navigate to "${resolvedUrl}"`,
      `Submit mandatory forms with empty or invalid values`,
      `Assert appropriate inline field error messages and disabled submit state`
    ],
    expectedResult: `System prevents invalid submission and preserves form state without crashing.`,
    status: TestStatus.NOT_EXECUTED,
    isApproved: false,
    testType: TestType.FUNCTIONAL,
    testIntent: TestIntent.NEGATIVE,
    priority: TestPriority.HIGH,
    testDataSets: [
      'Set 1: Empty mandatory input fields',
      'Set 2: Special characters and script payload',
      'Set 3: Exceeded maximum character length'
    ],
    source: 'video_walkthrough',
    videoEvidence: videoFileName,
    executedAt: new Date().toISOString()
  });

  // 4. Add Boundary & Edge Constraints Test Case
  testCases.push({
    id: Math.random().toString(36).substr(2, 9),
    testCaseId: `${baseTcId}-${String(testCases.length + 1).padStart(2, '0')}`,
    title: `Verify ${cleanTitle} Boundary Constraints & Chronological Ordering`,
    description: `Validates field length limits, chronological picker constraints, and input sanitization across video steps.`,
    steps: [
      `Navigate to "${resolvedUrl}"`,
      `Attempt to input boundary extreme values into inputs identified in walkthrough`,
      `Verify system enforces upper/lower limits gracefully without unhandled exceptions`
    ],
    expectedResult: `System enforces boundary constraints and validates inputs gracefully.`,
    status: TestStatus.NOT_EXECUTED,
    isApproved: false,
    testType: TestType.FUNCTIONAL,
    testIntent: TestIntent.NEGATIVE,
    priority: TestPriority.MEDIUM,
    testDataSets: [
      'Set 1: Minimum threshold limit',
      'Set 2: Maximum ceiling capacity limit',
      'Set 3: Malformed data format'
    ],
    source: 'video_walkthrough',
    videoEvidence: videoFileName,
    executedAt: new Date().toISOString()
  });

  // 5. Add Visual UI & Responsiveness Test Case
  testCases.push({
    id: Math.random().toString(36).substr(2, 9),
    testCaseId: `${baseTcId}-${String(testCases.length + 1).padStart(2, '0')}`,
    title: `Verify ${cleanTitle} UI Component Alignment and Multi-Device Responsiveness`,
    description: `Inspects typography, layout hierarchy, and responsive scaling across screens captured in video.`,
    steps: [
      `Inspect visual layout of screens captured in video frames`,
      `Assert component alignment, button contrast, and absence of visual overlaps`,
      `Test responsive reflow at desktop (1920x1080), tablet (768x1024), and mobile (375x812)`
    ],
    expectedResult: `All UI elements maintain correct styling, legible contrast, and responsive layout across all breakpoints.`,
    status: TestStatus.NOT_EXECUTED,
    isApproved: false,
    testType: TestType.UI,
    testIntent: TestIntent.POSITIVE,
    priority: TestPriority.MEDIUM,
    testDataSets: [
      'Set 1: Desktop viewport (1920x1080)',
      'Set 2: Tablet viewport (768x1024)',
      'Set 3: Mobile viewport (375x812)'
    ],
    source: 'video_walkthrough',
    videoEvidence: videoFileName,
    executedAt: new Date().toISOString()
  });

  // -------------------------------------------------------------
  // STAGE 5: Automation Script & POM / BDD Framework Synthesis
  // -------------------------------------------------------------
  onProgress?.(`Synthesizing multi-page ${tool} (${language}) ${options.framework || 'Page Object Model'} architecture...`, 90);

  const { script, files } = generateAutomationScriptFromSteps(
    flowName,
    resolvedUrl,
    recordedSteps,
    tool,
    language,
    detectedPages,
    options.framework,
    options.bddDocument,
    platform,
    Boolean(options.enableDataDriven)
  );

  onProgress?.('Completed! Ready for review.', 100);

  return {
    flowName,
    flowDescription,
    detectedUrl: resolvedUrl,
    platform,
    steps: recordedSteps,
    matchedActions,
    generatedScript: script,
    scriptFiles: files,
    domElementsCount: domElements.length,
    livePageTitle,
    liveScreenshot,
    testCases,
    detectedPages,
    domElementsByUrl
  };
}
