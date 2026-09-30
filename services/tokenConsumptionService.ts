import { TokenLog, FeaturePricingRate, Project, User, UserRole, PlanType, ProjectPlan, ProjectCreditSummary, ProjectMemberCreditContribution } from '../types';
import { collection, doc, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { syncSetDoc, syncDeleteDoc } from './firestoreSync';
import { getActiveUserSubscription, getUserCycleStartTimestamp } from './subscriptionService';
import { CreditActionType, getCreditCost, FEATURE_CREDIT_RULES, TRIAL_PLAN, PAID_PLAN, canPerformAction, deductProjectCredits } from './creditService';

export type { CreditActionType };
export { getCreditCost, FEATURE_CREDIT_RULES, TRIAL_PLAN, PAID_PLAN, canPerformAction, deductProjectCredits };

// ============================================================================
// GEMINI 3.8 FLASH OFFICIAL PRICING CONSTANTS (Paid Tier)
// ============================================================================
export const GEMINI_38_FLASH_MODEL = 'Gemini 3.8 Flash';
export const GEMINI_37_FLASH_MODEL = GEMINI_38_FLASH_MODEL;
export const GEMINI_36_FLASH_MODEL = GEMINI_38_FLASH_MODEL;

// Paid Tier pricing per 1,000 tokens (per 1M tokens: $1.50 Input, $7.50 Output, $0.15 Context Cache)
export const GEMINI_38_FLASH_INPUT_RATE_PER_1K = 0.0015; // $1.50 per 1,000,000 tokens ($0.0015 / 1K)
export const GEMINI_38_FLASH_OUTPUT_RATE_PER_1K = 0.0075; // $7.50 per 1,000,000 tokens ($0.0075 / 1K)
export const GEMINI_38_FLASH_CACHED_INPUT_RATE_PER_1K = 0.00015; // $0.15 per 1,000,000 tokens ($0.00015 / 1K)

export const GEMINI_37_FLASH_INPUT_RATE_PER_1K = GEMINI_38_FLASH_INPUT_RATE_PER_1K;
export const GEMINI_37_FLASH_OUTPUT_RATE_PER_1K = GEMINI_38_FLASH_OUTPUT_RATE_PER_1K;
export const GEMINI_37_FLASH_CACHED_INPUT_RATE_PER_1K = GEMINI_38_FLASH_CACHED_INPUT_RATE_PER_1K;

export const GEMINI_36_FLASH_INPUT_RATE_PER_1K = GEMINI_38_FLASH_INPUT_RATE_PER_1K;
export const GEMINI_36_FLASH_OUTPUT_RATE_PER_1K = GEMINI_38_FLASH_OUTPUT_RATE_PER_1K;
export const GEMINI_36_FLASH_CACHED_INPUT_RATE_PER_1K = GEMINI_38_FLASH_CACHED_INPUT_RATE_PER_1K;

// Multimodal Token Constants for Gemini 3.8 Flash
export const TOKENS_PER_IMAGE_SCREENSHOT = 258; // Standard vision tokens per screenshot
export const TOKENS_PER_VIDEO_SECOND = 258; // 1 frame per second @ 258 tokens/frame
export const TOKENS_PER_DOC_PAGE = 650; // Average tokens per standard document page (approx. 400-500 words per page)
export const CHARS_PER_TOKEN = 4; // Standard text token ratio (1 token ~ 4 chars)

export type InputTier = 'Small' | 'Medium' | 'High';

export interface TierInfo {
  tier: InputTier;
  count: number;
  label: string;
  badgeClass: string;
  dotClass: string;
  description: string;
  unit: string;
  rule: string;
}

/**
 * Extracts input count from details string, modality, or token usage.
 * Strictly handles:
 * - Documents / BRD: Page count (e.g. "30 pages", "30 pages BRD", "1 BRD Doc (30 pages)")
 * - Screenshots: Screenshot count (e.g. "12 Screenshots")
 * - Videos: Duration in seconds/steps (e.g. "15 steps", "60 seconds")
 * - URLs: URL endpoints / sub-pages count
 * - JSON / API: Endpoints / Schema models count
 * - User Stories / Scenarios: Count of stories / scenarios
 */
export const extractInputCountFromDetails = (details?: string, modality?: string, log?: Partial<TokenLog>): number => {
  if (log && typeof log.inputCount === 'number' && log.inputCount > 0) {
    return log.inputCount;
  }

  if (!details) {
    // If inputTokens is provided in log, derive estimated count
    if (log && typeof log.inputTokens === 'number' && log.inputTokens > 0) {
      if (log.inputTokens >= 7000) return Math.round(log.inputTokens / TOKENS_PER_DOC_PAGE) || 12;
      if (log.inputTokens >= 3500) return 8;
      return 4;
    }
    return 5;
  }

  const str = details.trim();

  // 1. Explicit document page patterns:
  // e.g. "30 pages", "30 BRD Spec Doc Pages", "30p", "pages: 30", "Page Count: 30", "1 BRD Doc (30 pages)"
  const pageMatch1 = str.match(/(\d+)\s*(?:brd|doc|document|spec|requirements?|pdf|docx|word)?\s*pages?\b/i);
  if (pageMatch1) {
    return parseInt(pageMatch1[1], 10);
  }

  const pageMatch2 = str.match(/pages?[:\s]+(\d+)\b/i);
  if (pageMatch2) {
    return parseInt(pageMatch2[1], 10);
  }

  const pageMatch3 = str.match(/\((\d+)\s*pages?\)/i);
  if (pageMatch3) {
    return parseInt(pageMatch3[1], 10);
  }

  const pageMatch4 = str.match(/(\d+)\s*p\b/i);
  if (pageMatch4 && !str.includes('px') && !str.includes('pm') && !str.includes('playwright')) {
    return parseInt(pageMatch4[1], 10);
  }

  // 2. Screenshots / Images patterns:
  // e.g. "12 Screenshots", "8 UI Screenshots (Vision)", "Screenshots: 15"
  const screenshotMatch = str.match(/(\d+)\s*(?:screenshots?|wireframes?|mockups?|images?|screens?|frames?)\b/i);
  if (screenshotMatch) {
    return parseInt(screenshotMatch[1], 10);
  }

  // 3. User stories / Scenarios / Test Cases patterns:
  // e.g. "25 User Stories", "14 Test Scenarios", "30 Detailed Test Cases"
  const itemMatch = str.match(/(\d+)\s*(?:user\s*stories|stories|scenarios|test\s*cases|cases|scripts|steps|endpoints|routes|profiles|users|items|fields)\b/i);
  if (itemMatch) {
    return parseInt(itemMatch[1], 10);
  }

  // 4. Video duration / steps:
  // e.g. "45 seconds", "2 mins", "15 Video Steps"
  const videoMatch = str.match(/(\d+)\s*(?:sec|seconds?|mins?|minutes?|steps?)\b/i);
  if (videoMatch) {
    return parseInt(videoMatch[1], 10);
  }

  // 5. URL count:
  // e.g. "3 URLs", "5 Target Web URLs"
  const urlMatch = str.match(/(\d+)\s*(?:urls?|sub-pages?|web\s*pages?)\b/i);
  if (urlMatch) {
    return parseInt(urlMatch[1], 10);
  }

  // 6. If numbers exist, find the primary non-wrapper number
  // Avoid taking leading '1' if there is another number like "1 Document (30 pages)"
  const allNums = str.match(/\b\d+\b/g);
  if (allNums && allNums.length > 0) {
    const parsedNums = allNums.map(n => parseInt(n, 10)).filter(n => !isNaN(n));
    // If there's a number > 1 (e.g. 30 in "1 BRD (30 pages)"), choose that
    const largerNums = parsedNums.filter(n => n > 1);
    if (largerNums.length > 0) {
      return largerNums[0];
    }
    return parsedNums[0] > 0 ? parsedNums[0] : 5;
  }

  // 7. Fallback based on log input tokens if available
  if (log && typeof log.inputTokens === 'number' && log.inputTokens > 0) {
    if (log.inputTokens >= 7000) return 15;
    if (log.inputTokens >= 3500) return 8;
    return 4;
  }

  return 5;
};

/**
 * Calculates input Tier (Small, Medium, High) based on Given Input count / Document Page count:
 * - Small: count <= 5 (e.g. 5 pages / 5 inputs: Small - 5 pages / ≤5)
 * - Medium: count 6..10 (e.g. 10 pages / 10 inputs: Medium - 10 pages / 6-10)
 * - High: count > 10 (above 10 pages / above 10 inputs: High - above 10 pages / >10)
 */
export const calculateInputTier = (inputCountOrLog?: number | Partial<TokenLog> | null): TierInfo => {
  let count = 5;
  let unit = 'inputs';
  let isDoc = false;
  let isScreenshot = false;
  let isVideo = false;
  let isUrl = false;
  let isApi = false;

  if (typeof inputCountOrLog === 'number') {
    count = inputCountOrLog;
  } else if (inputCountOrLog) {
    if (typeof inputCountOrLog.inputCount === 'number' && inputCountOrLog.inputCount > 0) {
      count = inputCountOrLog.inputCount;
    } else {
      count = extractInputCountFromDetails(inputCountOrLog.inputModalityDetails, inputCountOrLog.inputModality, inputCountOrLog);
    }

    const mod = (inputCountOrLog.inputModality || '').toLowerCase();
    const details = (inputCountOrLog.inputModalityDetails || '').toLowerCase();
    const feat = (inputCountOrLog.feature || '').toLowerCase();

    if (mod === 'document' || feat.includes('user stories') || details.includes('page') || details.includes('brd') || details.includes('spec') || details.includes('doc')) {
      isDoc = true;
    } else if (mod === 'screenshot' || details.includes('screenshot') || details.includes('image') || feat.includes('ui test') || feat.includes('figma')) {
      isScreenshot = true;
    } else if (mod === 'video' || details.includes('video') || details.includes('frame') || feat.includes('record')) {
      isVideo = true;
    } else if (mod === 'url' || details.includes('url') || feat.includes('performance')) {
      isUrl = true;
    } else if (details.includes('api') || details.includes('endpoint') || details.includes('swagger') || details.includes('json') || feat.includes('api')) {
      isApi = true;
    }
  }

  if (isDoc) {
    unit = count === 1 ? 'page' : 'pages';
  } else if (isScreenshot) {
    unit = count === 1 ? 'screenshot' : 'screenshots';
  } else if (isVideo) {
    unit = count === 1 ? 'step' : 'steps';
  } else if (isUrl) {
    unit = count === 1 ? 'url' : 'urls';
  } else if (isApi) {
    unit = count === 1 ? 'endpoint' : 'endpoints';
  } else {
    unit = count === 1 ? 'input' : 'inputs';
  }

  let tier: InputTier = 'Small';
  let badgeClass = 'bg-teal-50 text-teal-700 border-teal-200/80';
  let dotClass = 'bg-teal-500';
  let rule = '≤ 5';
  let description = `Small standard (${unit} ≤ 5)`;

  if (count > 10) {
    tier = 'High';
    badgeClass = 'bg-purple-50 text-purple-700 border-purple-200/80';
    dotClass = 'bg-purple-500';
    rule = '> 10';
    description = isDoc ? 'High volume (>10 pages)' : `High standard (${unit} > 10)`;
  } else if (count > 5) {
    tier = 'Medium';
    badgeClass = 'bg-amber-50 text-amber-700 border-amber-200/80';
    dotClass = 'bg-amber-500';
    rule = '6 - 10';
    description = isDoc ? 'Medium standard (6-10 pages)' : `Medium standard (${unit} 6-10)`;
  } else {
    tier = 'Small';
    badgeClass = 'bg-teal-50 text-teal-700 border-teal-200/80';
    dotClass = 'bg-teal-500';
    rule = '≤ 5';
    description = isDoc ? 'Small standard (≤5 pages)' : `Small standard (${unit} ≤ 5)`;
  }

  return {
    tier,
    count,
    label: `${tier} (${count} ${unit})`,
    badgeClass,
    dotClass,
    description,
    unit,
    rule
  };
};

/**
 * Calculates estimated generation capacity, tokens, and cost range for any feature & input count
 */
export const calculateCapacityAndEstimates = (
  featureName: string,
  inputCount: number,
  modality: 'Text' | 'Screenshot' | 'Video' | 'Document' | 'URL' | 'Multimodal' = 'Document'
) => {
  const tierInfo = calculateInputTier(inputCount);
  let estimatedInputTokens = 2450;
  let estimatedOutputTokens = 1200;
  let estimatedOutputItems = 4;
  let outputUnit = 'User Stories';

  switch (modality) {
    case 'Document':
      estimatedInputTokens = Math.max(1200, inputCount * TOKENS_PER_DOC_PAGE + 850);
      break;
    case 'Screenshot':
      estimatedInputTokens = Math.max(1200, inputCount * TOKENS_PER_IMAGE_SCREENSHOT + 850);
      break;
    case 'Video':
      estimatedInputTokens = Math.max(1500, inputCount * TOKENS_PER_VIDEO_SECOND + 1000);
      break;
    case 'URL':
      estimatedInputTokens = Math.max(1500, inputCount * 1200 + 750);
      break;
    case 'Multimodal':
      estimatedInputTokens = Math.max(2500, inputCount * 500 + 1200);
      break;
    default:
      estimatedInputTokens = Math.max(1000, inputCount * 300 + 600);
      break;
  }

  // Adjust output capacity based on tier
  if (tierInfo.tier === 'High') {
    estimatedOutputItems = Math.min(35, Math.max(15, Math.round(inputCount * 0.8)));
    estimatedOutputTokens = estimatedOutputItems * 400;
  } else if (tierInfo.tier === 'Medium') {
    estimatedOutputItems = Math.min(12, Math.max(7, Math.round(inputCount * 0.9)));
    estimatedOutputTokens = estimatedOutputItems * 380;
  } else {
    estimatedOutputItems = Math.min(5, Math.max(3, inputCount));
    estimatedOutputTokens = estimatedOutputItems * 350;
  }

  if (featureName.includes('Scenario')) {
    outputUnit = 'BDD Scenarios';
  } else if (featureName.includes('Test Case') || featureName.includes('test cases')) {
    outputUnit = 'Test Cases';
  } else if (featureName.includes('Automation') || featureName.includes('Script')) {
    outputUnit = 'Automation Scripts';
  } else if (featureName.includes('UI testing') || featureName.includes('Figma')) {
    outputUnit = 'UI Inspection Audits';
  } else if (featureName.includes('Synthetic')) {
    outputUnit = 'Synthetic User Personas';
  } else if (featureName.includes('API')) {
    outputUnit = 'API Test Suites';
  } else if (featureName.includes('Performance')) {
    outputUnit = 'Performance JMX Plans';
  }

  const costUsd = calculateTokenCostUsd(estimatedInputTokens, estimatedOutputTokens, false);
  const costFormatted = formatDollarCost(costUsd);

  return {
    tierInfo,
    estimatedInputTokens,
    estimatedOutputTokens,
    totalEstimatedTokens: estimatedInputTokens + estimatedOutputTokens,
    estimatedOutputItems,
    outputUnit,
    costUsd,
    costFormatted
  };
};

/**
 * Calculates dollar cost for Gemini 3.8 Flash token usage based on Paid Tier pricing
 */
export const calculateTokenCostUsd = (inputTokens: number, outputTokens: number, cached: boolean = false): number => {
  const inputRate = cached ? GEMINI_38_FLASH_CACHED_INPUT_RATE_PER_1K : GEMINI_38_FLASH_INPUT_RATE_PER_1K;
  const inputCost = (inputTokens / 1000) * inputRate;
  const outputCost = (outputTokens / 1000) * GEMINI_38_FLASH_OUTPUT_RATE_PER_1K;
  
  const totalCost = inputCost + outputCost;
  return Number(totalCost.toFixed(6));
};

/**
 * Formats dollar amounts nicely for UI display
 */
export const formatDollarCost = (cost: number): string => {
  if (cost === 0 || isNaN(cost)) return '$0.000000';
  if (cost < 1) {
    return `$${cost.toFixed(6)}`;
  }
  return `$${cost.toFixed(4)}`;
};

/**
 * Multimodal input tokens calculator for Gemini 3.8 Flash
 */
export interface MultimodalInputParams {
  textChars?: number;
  screenshotCount?: number;
  videoDurationSeconds?: number;
  documentPages?: number;
  urlScrapedChars?: number;
  systemPromptTokens?: number;
}

export const calculateMultimodalInputTokens = (params: MultimodalInputParams): number => {
  const textTokens = params.textChars ? Math.ceil(params.textChars / CHARS_PER_TOKEN) : 0;
  const screenshotTokens = (params.screenshotCount || 0) * TOKENS_PER_IMAGE_SCREENSHOT;
  const videoTokens = (params.videoDurationSeconds || 0) * TOKENS_PER_VIDEO_SECOND;
  const docTokens = (params.documentPages || 0) * TOKENS_PER_DOC_PAGE;
  const urlTokens = params.urlScrapedChars ? Math.ceil(params.urlScrapedChars / CHARS_PER_TOKEN) + 200 : 0;
  const basePromptTokens = params.systemPromptTokens || 600;

  return textTokens + screenshotTokens + videoTokens + docTokens + urlTokens + basePromptTokens;
};

/**
 * Output tokens calculator based on generated character count or items
 */
export const calculateOutputTokens = (outputCharsOrCount: number, isItemCount: boolean = false, tokensPerItem: number = 350): number => {
  if (isItemCount) {
    return Math.max(1, outputCharsOrCount) * tokensPerItem;
  }
  return Math.ceil(outputCharsOrCount / CHARS_PER_TOKEN);
};

// ============================================================================
// ALL 10 AUTOMATIQA MODULES & SPECIFICATIONS
// ============================================================================
export const AUTOMATIQA_MODULES = [
  {
    id: 'ai-user-stories',
    name: 'AI User stories generation',
    shortName: 'User Stories',
    inputTypes: ['Text', 'Document (DOCX/PDF)', 'Screenshot', 'Prompt'],
    outputType: 'Jira User Stories & Acceptance Criteria',
    baseSystemPrompt: 850,
    avgInputTokens: 2450,
    avgOutputTokens: 980,
    defaultItems: 4,
    description: 'Parses requirements docs, text prompts, and wireframe screenshots to generate structured Jira user stories with acceptance criteria.'
  },
  {
    id: 'ai-test-scenarios',
    name: 'AI Test Scenario generation',
    shortName: 'Test Scenarios',
    inputTypes: ['User Story', 'BRD Document', 'Text', 'Target URL'],
    outputType: 'Gherkin / BDD Test Scenarios',
    baseSystemPrompt: 750,
    avgInputTokens: 2150,
    avgOutputTokens: 820,
    defaultItems: 5,
    description: 'Generates end-to-end positive, negative, and edge-case BDD/Gherkin scenarios from stories, documents, and web URLs.'
  },
  {
    id: 'ai-test-cases',
    name: 'AI Test Cases generation',
    shortName: 'Test Cases',
    inputTypes: ['Test Scenarios', 'User Stories', 'Requirements Doc'],
    outputType: 'Detailed Manual & Automated Test Cases',
    baseSystemPrompt: 1200,
    avgInputTokens: 3800,
    avgOutputTokens: 2400,
    defaultItems: 8,
    description: 'Generates step-by-step test cases with preconditions, action steps, test data, expected results, and automated locator tags.'
  },
  {
    id: 'automation-script-generator',
    name: 'Automation - script generator',
    shortName: 'Script Generator',
    inputTypes: ['Test Cases', 'Natural Language', 'DOM Snippet'],
    outputType: 'Playwright / Selenium / Cypress / Appium Code',
    baseSystemPrompt: 1400,
    avgInputTokens: 3600,
    avgOutputTokens: 1650,
    defaultItems: 1,
    description: 'Synthesizes clean Page Object Model (POM) automation code across Playwright, Selenium, Cypress, and Appium in TypeScript, Python, and Java.'
  },
  {
    id: 'automation-record-play-web',
    name: 'Automation - Record and play - Web app',
    shortName: 'Record & Play (Web)',
    inputTypes: ['Live Web Interactions', 'DOM Events', 'Selectors', 'Browser Screenshots'],
    outputType: 'Executable Web Playback Suites & Test Scripts',
    baseSystemPrompt: 1500,
    avgInputTokens: 4200,
    avgOutputTokens: 1850,
    defaultItems: 1,
    description: 'Analyzes live browser recordings, UI clicks, typing, assertions, and DOM hierarchy to generate robust web playback scripts.'
  },
  {
    id: 'automation-record-play-mobile',
    name: 'Automation - Record and play - Mobile app',
    shortName: 'Record & Play (Mobile)',
    inputTypes: ['Recorded Touch Gestures', 'ADB Logs', 'Appium XML', 'Device Screenshots'],
    outputType: 'Executable Mobile Playback Suites & Appium Scripts',
    baseSystemPrompt: 1500,
    avgInputTokens: 4200,
    avgOutputTokens: 1850,
    defaultItems: 1,
    description: 'Analyzes mobile app touch gestures, ADB logcat, Appium UI hierarchy, and device screens to generate robust mobile test scripts.'
  },
  {
    id: 'ui-testing',
    name: 'UI testing',
    shortName: 'UI Testing & Review',
    inputTypes: ['Screenshot', 'Video Recording', 'Document (BRD/Specs)', 'Target URL'],
    outputType: 'Page-by-Page Compliance Analysis & Diff Reports',
    baseSystemPrompt: 1800,
    avgInputTokens: 5800,
    avgOutputTokens: 2600,
    defaultItems: 3,
    description: 'Performs deep multimodal inspection of screenshots, videos, documents, and live URLs against Standard Requirements, reporting matched/unmatched screens.'
  },
  {
    id: 'api-testing',
    name: 'API testing',
    shortName: 'API Testing',
    inputTypes: ['OpenAPI / Swagger Spec', 'cURL Commands', 'JSON Payloads', 'Endpoints'],
    outputType: 'API Test Collections & Assertion Suites',
    baseSystemPrompt: 950,
    avgInputTokens: 2600,
    avgOutputTokens: 1200,
    defaultItems: 6,
    description: 'Creates REST and GraphQL API test suites with schema validation, auth token workflows, status code assertions, and edge-case payloads.'
  },
  {
    id: 'api-performance-testing',
    name: 'API performance testing',
    shortName: 'API Performance',
    inputTypes: ['API Endpoints', 'Target RPS / Concurrency', 'SLA Thresholds', 'Auth Headers'],
    outputType: 'API Load Profiles, JMeter JMX & k6 Scripts',
    baseSystemPrompt: 1100,
    avgInputTokens: 2900,
    avgOutputTokens: 1450,
    defaultItems: 1,
    description: 'Generates high-throughput API load testing configurations, parameterized concurrency profiles, and latency SLA threshold validations.'
  },
  {
    id: 'web-performance-testing',
    name: 'Web performance testing',
    shortName: 'Web Performance',
    inputTypes: ['Target Web URL', 'User Load Profile', 'Ramp-up / Loop Config', 'Throttling'],
    outputType: 'Apache JMeter JMX Plans & Bottleneck Audits',
    baseSystemPrompt: 1350,
    avgInputTokens: 3400,
    avgOutputTokens: 1750,
    defaultItems: 1,
    description: 'Generates Apache JMeter JMX test plans, Thread Groups, HTTP Cookie/Header Managers, Summary Report listeners, and core web vitals diagnostics.'
  }
];

/**
 * Feature-level Per-Token Rates & Pricing Breakdown for Gemini 3.8 Flash across ALL 10 modules
 */
export const FEATURE_PRICING_RATES: FeaturePricingRate[] = AUTOMATIQA_MODULES.map(mod => ({
  feature: mod.name,
  model: GEMINI_38_FLASH_MODEL,
  inputCostPer1K: GEMINI_38_FLASH_INPUT_RATE_PER_1K,
  outputCostPer1K: GEMINI_38_FLASH_OUTPUT_RATE_PER_1K,
  cachedInputCostPer1K: GEMINI_38_FLASH_CACHED_INPUT_RATE_PER_1K,
  avgInputTokens: mod.avgInputTokens,
  avgOutputTokens: mod.avgOutputTokens,
  avgCostPerCallUsd: calculateTokenCostUsd(mod.avgInputTokens, mod.avgOutputTokens, false),
  inputTypes: mod.inputTypes,
  outputType: mod.outputType,
  description: mod.description
}));

// Total Credit Pool Configuration (Default 1,000 for Paid, 100 for Trial)
export const TOTAL_CREDIT_POOL = 1000;

// Plan Configurations (Project Level)
export const TRIAL_PLAN_CONFIG = {
  planType: 'Trial' as PlanType,
  planName: 'Trial Plan',
  totalCredits: 100,
  validityDays: 7,
  scope: 'PROJECT LEVEL',
  description: '7 Days Validity or 100 Credits (Whichever happens first expires the Trial Plan)',
  features: {
    aiGeneration: '100 Credit Pool (Shared across all project users)',
    nonAiFeatures: 'Unlimited (Manual tests, execution, reports, and dashboards)',
  },
  policyDescription: 'Trial Plan provides 100 credits pooled at the project level with 7 days validity. When 100 credits are consumed OR 7 days are completed, AI Generations, Downloads, and Copying are blocked until renewed or changed to Paid Plan by Super Admin. Remaining non-AI actions can be performed till plan validity.'
};

export const PAID_PLAN_CONFIG = {
  planType: 'Paid' as PlanType,
  planName: 'Paid Plan',
  totalCredits: 1000,
  validityDays: 30,
  scope: 'PROJECT LEVEL',
  description: '30 Days Validity or 1,000 Credits (Whichever happens first expires the current Paid Plan cycle)',
  features: {
    aiGeneration: '1,000 Credit Pool (Shared across all project users)',
    nonAiFeatures: 'Unlimited (Manual tests, execution, reports, and dashboards)',
  },
  policyDescription: 'Paid Plan provides 1,000 credits pooled at the project level with 30 days validity. When 1,000 credits are consumed OR 30 days are completed, AI generation is paused until the next cycle renewal. Non-AI features remain unlimited.'
};

export const PLAN_CONFIGS: Record<PlanType, typeof TRIAL_PLAN_CONFIG | typeof PAID_PLAN_CONFIG> = {
  Trial: TRIAL_PLAN_CONFIG,
  Paid: PAID_PLAN_CONFIG
};

// Backward-compatibility alias
export const BASIC_PLAN_CONFIG = {
  ...PAID_PLAN_CONFIG,
  creditPoints: 1000,
  trialDays: 0,
  activePackDays: 30,
  totalValidityDays: 30,
};

/**
 * Maps feature names to their required exact credit points cost per generation / button click:
 * - AI User Stories Generation        = 5 credits
 * - AI Test Scenario Generation       = 10 credits
 * - AI Test Cases Generation          = 20 credits
 * - Automation - Script Generator     = 50 credits
 * - Record & Play - Web App           = 50 credits
 * - Record & Play - Mobile App        = 50 credits
 * - API Testing - Test Suite          = 50 credits
 * - API Testing - Performance Testing = 50 credits
 * - UI Testing                        = 50 credits
 * - Web Performance Testing           = 100 credits
 * - Cached re-runs                    = 0 credits (Free)
 */
export const FEATURE_CREDIT_COSTS: Record<string, number> = {
  // 1. AI User Stories Generation = 5 credits
  'AI User stories generation': 5,
  'AI User Stories generation': 5,
  'AI User Stories Generation': 5,
  'User Stories': 5,

  // 2. AI Test Scenario Generation = 10 credits
  'AI Test Scenario generation': 10,
  'AI Test Scenarios generation': 10,
  'AI Test Scenario Generation': 10,
  'Test Scenarios': 10,

  // 3. AI Test Cases Generation = 20 credits
  'AI Test Cases generation': 20,
  'AI test cases generation': 20,
  'AI Test cases generation': 20,
  'AI Test Cases Generation': 20,
  'Test Cases': 20,

  // 4. Automation - Script Generator = 50 credits
  'Automation - script generator': 50,
  'Automation - Script Generator': 50,
  'Automation - Script generator': 50,
  'Script Generator': 50,

  // 5. Record & Play - Web App = 50 credits
  'Automation - Record and play - Web app': 50,
  'Automation - Record and play - WEb app': 50,
  'Automation - Record and play - Web App': 50,
  'Record & Play - Web App': 50,

  // 6. Record & Play - Mobile App = 50 credits
  'Automation - Record and play - Mobile app': 50,
  'Automation - Record and play - Mobile App': 50,
  'Record & Play - Mobile App': 50,
  'Automation - Record and play': 50,
  'Automation - Record and play - Web app and Mobile app': 50,

  // 7. API Testing - Test Suite = 50 credits
  'API testing': 50,
  'API Testing': 50,
  'API Testing - Test Suite': 50,

  // 8. API Testing - Performance Testing = 50 credits
  'API performance testing': 50,
  'API Performance Testing': 50,
  'API Testing - Performance Testing': 50,

  // 9. UI Testing = 50 credits
  'UI testing': 50,
  'UI Testing': 50,

  // 10. Web Performance Testing = 100 credits
  'Web performance testing': 100,
  'Web Performance Testing': 100
};

/**
 * Calculates credits consumed based strictly on feature and cache status (fixed credits per button click).
 * Does not depend on input/output token volume or counts:
 * - AI User Stories Generation: 5 credits
 * - AI Test Scenario Generation: 10 credits
 * - AI Test Cases Generation: 20 credits
 * - Automation - Script Generator: 50 credits
 * - Record & Play - Web App: 50 credits
 * - Record & Play - Mobile App: 50 credits
 * - API Testing - Test Suite: 50 credits
 * - API Testing - Performance Testing: 50 credits
 * - UI Testing: 50 credits
 * - Web Performance Testing: 100 credits
 * - Cached: 0 credits
 */
export const calculateCreditsConsumed = (
  feature: string,
  itemsCount: number = 1,
  cached: boolean = false,
  actionType: CreditActionType = 'analysis',
  planType: PlanType = 'Trial'
): number => {
  if (cached && actionType === 'analysis') return 0;
  return getCreditCost(feature, actionType, planType);
};

/**
 * Estimate Tokens & Cost for Any Module with Specific Input Modalities
 */
export interface ModuleEstimationInput {
  moduleName: string;
  textChars?: number;
  screenshotCount?: number;
  videoDurationSeconds?: number;
  documentPages?: number;
  urlProvided?: boolean;
  urlScrapedChars?: number;
  estimatedOutputItems?: number;
  cached?: boolean;
}

export interface ModuleEstimationResult {
  moduleName: string;
  model: string;
  inputTokens: number;
  inputTokensBreakdown: {
    textTokens: number;
    screenshotTokens: number;
    videoTokens: number;
    documentTokens: number;
    urlTokens: number;
    systemPromptTokens: number;
  };
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  cachedSavingsUsd: number;
  credits: number;
}

export const estimateModuleTokensAndCost = (input: ModuleEstimationInput): ModuleEstimationResult => {
  const mod = AUTOMATIQA_MODULES.find(m => m.name === input.moduleName) || AUTOMATIQA_MODULES[0];
  
  const textTokens = input.textChars ? Math.ceil(input.textChars / CHARS_PER_TOKEN) : 400;
  const screenshotTokens = (input.screenshotCount || 0) * TOKENS_PER_IMAGE_SCREENSHOT;
  const videoTokens = (input.videoDurationSeconds || 0) * TOKENS_PER_VIDEO_SECOND;
  const documentTokens = (input.documentPages || 0) * TOKENS_PER_DOC_PAGE;
  const urlTokens = input.urlProvided ? (input.urlScrapedChars ? Math.ceil(input.urlScrapedChars / CHARS_PER_TOKEN) : 950) : 0;
  const systemPromptTokens = mod.baseSystemPrompt;

  const totalInputTokens = textTokens + screenshotTokens + videoTokens + documentTokens + urlTokens + systemPromptTokens;
  
  const items = input.estimatedOutputItems || mod.defaultItems;
  const outputTokens = Math.round(items * (mod.avgOutputTokens / mod.defaultItems));
  const totalTokens = totalInputTokens + outputTokens;

  const isCached = Boolean(input.cached);
  const inputRate = isCached ? GEMINI_38_FLASH_CACHED_INPUT_RATE_PER_1K : GEMINI_38_FLASH_INPUT_RATE_PER_1K;
  
  const inputCostUsd = Number(((totalInputTokens / 1000) * inputRate).toFixed(6));
  const outputCostUsd = Number(((outputTokens / 1000) * GEMINI_38_FLASH_OUTPUT_RATE_PER_1K).toFixed(6));
  const totalCostUsd = Number((inputCostUsd + outputCostUsd).toFixed(6));

  const standardInputCost = (totalInputTokens / 1000) * GEMINI_38_FLASH_INPUT_RATE_PER_1K;
  const cachedSavingsUsd = Number((standardInputCost - ((totalInputTokens / 1000) * GEMINI_38_FLASH_CACHED_INPUT_RATE_PER_1K)).toFixed(6));
  const credits = calculateCreditsConsumed(input.moduleName, items, isCached);

  return {
    moduleName: mod.name,
    model: GEMINI_38_FLASH_MODEL,
    inputTokens: totalInputTokens,
    inputTokensBreakdown: {
      textTokens,
      screenshotTokens,
      videoTokens,
      documentTokens,
      urlTokens,
      systemPromptTokens
    },
    outputTokens,
    totalTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
    cachedSavingsUsd,
    credits
  };
};

/**
 * Formats any timestamp, date string, or Date object to Indian Standard Time (IST - Asia/Kolkata)
 * Example output: "20-Aug-2026 02:41 PM IST"
 */
export const formatToIST = (dateOrTimestamp?: string | number | Date | null): string => {
  if (!dateOrTimestamp) return '';
  let dateObj: Date;
  if (typeof dateOrTimestamp === 'number') {
    dateObj = new Date(dateOrTimestamp);
  } else if (typeof dateOrTimestamp === 'string') {
    const num = Number(dateOrTimestamp);
    if (!isNaN(num) && num > 100000000000) {
      dateObj = new Date(num);
    } else {
      dateObj = new Date(dateOrTimestamp);
    }
  } else {
    dateObj = dateOrTimestamp;
  }

  if (isNaN(dateObj.getTime())) {
    const str = String(dateOrTimestamp);
    return str.includes('IST') ? str : `${str} IST`;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const parts = formatter.formatToParts(dateObj);
  const day = parts.find(p => p.type === 'day')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const year = parts.find(p => p.type === 'year')?.value || '';
  const hour = parts.find(p => p.type === 'hour')?.value || '';
  const minute = parts.find(p => p.type === 'minute')?.value || '';
  const dayPeriod = (parts.find(p => p.type === 'dayPeriod')?.value || 'AM').toUpperCase();

  return `${day}-${month}-${year} ${hour}:${minute} ${dayPeriod} IST`;
};

/**
 * Returns current timestamp formatted in IST
 */
export const getCurrentISTDateFormatted = (timestamp: number = Date.now()): string => {
  return formatToIST(timestamp);
};

// ============================================================================
// CLEAN SLATE - FRESH CREDIT CONSUMPTION (0 Consumed, 1,000 Balance Pool)
// ============================================================================
export const SEED_TOKEN_LOGS: TokenLog[] = [];

const LOCAL_STORAGE_KEY = 'automatiqa_token_consumption_logs';
const LOCAL_STORAGE_INITIALIZED_KEY = 'automatiqa_token_logs_initialized';

/**
 * Safely persists a slice of token logs to localStorage without exceeding browser quota.
 * Automatically trims heavy fields and downscales slice size (50 -> 25 -> 10) if quota is exceeded.
 */
export const safePersistTokenLogs = (logs: TokenLog[]): void => {
  if (typeof window === 'undefined' || !logs) return;
  try {
    localStorage.setItem(LOCAL_STORAGE_INITIALIZED_KEY, 'true');
    const sanitizeLogForStorage = (l: TokenLog): TokenLog => {
      const copy: any = { ...l };
      if (typeof copy.promptText === 'string' && copy.promptText.length > 200) {
        copy.promptText = copy.promptText.substring(0, 200) + '...';
      }
      if (typeof copy.responseSummary === 'string' && copy.responseSummary.length > 200) {
        copy.responseSummary = copy.responseSummary.substring(0, 200) + '...';
      }
      delete copy.metadata;
      return copy as TokenLog;
    };

    const candidateSlices = [50, 25, 10, 5];
    for (const size of candidateSlices) {
      try {
        const slice = logs.slice(0, size).map(sanitizeLogForStorage);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(slice));
        return;
      } catch (innerErr) {
        // Continue to smaller slice size
      }
    }
  } catch (_) {
    // Gracefully ignore storage quota limits - in-memory and Firestore state remain intact
  }
};

// In-memory cache of token consumption logs - keeps real records hot in memory
let cachedTokenLogs: TokenLog[] = [];

export const getCachedTokenLogs = (): TokenLog[] => cachedTokenLogs;

/**
 * Role-Based Access Control Helpers for Credits Consumption
 */
export const isSuperAdminUser = (user?: User | null): boolean => {
  if (!user) return false;
  const roleStr = (user.role as string | undefined)?.toLowerCase().trim();

  // Explicit non-super admin roles MUST NEVER be evaluated as Super Admin
  if (
    user.role === UserRole.ADMIN ||
    roleStr === 'admin' ||
    roleStr === 'global admin' ||
    user.role === UserRole.TEAM_MEMBER ||
    roleStr === 'team member' ||
    user.role === UserRole.DELIVERY_MANAGER ||
    roleStr === 'delivery manager' ||
    user.role === UserRole.SPOC ||
    roleStr === 'spoc'
  ) {
    return false;
  }

  const email = (user.email || '').toLowerCase().trim();
  return (
    user.role === UserRole.SUPER_ADMIN ||
    roleStr === 'super admin' ||
    roleStr === 'super_admin' ||
    email === 'automatiqa@qaoncloud.com' ||
    email === 'admin@qaoncloud.com' ||
    (!user.role && (email === 'shanmugapriya@qaoncloud.com' || email === 'gomathy@qaoncloud.com' || email === 'vinuta@qaoncloud.com' || email === 'jagathesan@qaoncloud.com'))
  );
};

export const isAdminUser = (user?: User | null): boolean => {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const roleStr = (user.role as string | undefined)?.toLowerCase().trim();
  return (
    user.role === UserRole.ADMIN ||
    roleStr === 'admin' ||
    roleStr === 'global admin'
  );
};

/**
 * Filter projects to only those accessible by the logged-in user.
 * For Super Admin: returns all projects.
 * For Admin: returns only projects owned, allocated, or assigned to this Admin.
 */
export const getAccessibleProjects = (user?: User | null, allProjects?: Project[]): Project[] => {
  if (!allProjects || allProjects.length === 0) return [];
  if (!user) return [];
  if (isSuperAdminUser(user)) return allProjects;

  const email = (user.email || '').toLowerCase().trim();
  let rawAssigned: string[] = [];
  if (Array.isArray(user.assignedProjectIds)) {
    rawAssigned = user.assignedProjectIds.map(x => String(x));
  } else if (user.assignedProjectIds && typeof user.assignedProjectIds === 'object') {
    rawAssigned = Object.keys(user.assignedProjectIds);
  }
  const assignedIds = new Set(rawAssigned);

  return allProjects.filter(p => {
    const ownerMatch = p.ownerEmail?.toLowerCase().trim() === email;

    let allocatedMatch = false;
    if (Array.isArray(p.allocatedUserEmails)) {
      allocatedMatch = p.allocatedUserEmails.some(e => typeof e === 'string' && e.toLowerCase().trim() === email);
    } else if (p.allocatedUserEmails && typeof p.allocatedUserEmails === 'object') {
      allocatedMatch = Object.keys(p.allocatedUserEmails).some(e => e.toLowerCase().trim() === email) ||
                       Object.values(p.allocatedUserEmails).some(e => typeof e === 'string' && e.toLowerCase().trim() === email);
    }

    let roleMatch = false;
    if (p.projectRoles && typeof p.projectRoles === 'object') {
      roleMatch = Object.keys(p.projectRoles).some(k => k.toLowerCase().trim() === email);
    }

    const assignedIdMatch = assignedIds.has(p.id);

    return ownerMatch || allocatedMatch || roleMatch || assignedIdMatch;
  });
};

/**
 * Extract authorized members associated with the accessible projects.
 * For Super Admin: returns all members.
 * For Admin: returns only members from the Admin's accessible projects.
 */
export const getAuthorizedMembersForProjects = (
  accessibleProjects: Project[],
  allUsers?: any[]
): { name: string; email: string }[] => {
  const memberMap = new Map<string, string>();
  const projIdSet = new Set(accessibleProjects.map(p => p.id));

  accessibleProjects.forEach(p => {
    if (p.ownerEmail) {
      const clean = p.ownerEmail.toLowerCase().trim();
      memberMap.set(clean, p.ownerName || clean.split('@')[0]);
    }
    const allocated = Array.isArray(p.allocatedUserEmails)
      ? p.allocatedUserEmails
      : Object.values(p.allocatedUserEmails || {});
    allocated.forEach((e: any) => {
      if (typeof e === 'string' && e.trim()) {
        const clean = e.toLowerCase().trim();
        if (!memberMap.has(clean)) {
          memberMap.set(clean, clean.split('@')[0]);
        }
      }
    });
    if (p.projectRoles && typeof p.projectRoles === 'object') {
      Object.keys(p.projectRoles).forEach(k => {
        const clean = k.toLowerCase().trim();
        if (!memberMap.has(clean)) {
          memberMap.set(clean, clean.split('@')[0]);
        }
      });
    }
  });

  if (Array.isArray(allUsers)) {
    allUsers.forEach((u: any) => {
      const email = (u.data?.email || u.email || u.id || '').toLowerCase().trim();
      const name = u.data?.name || u.name || email.split('@')[0];
      const assigned = Array.isArray(u.data?.assignedProjectIds)
        ? u.data.assignedProjectIds
        : Array.isArray(u.assignedProjectIds)
        ? u.assignedProjectIds
        : [];
      if (assigned.some((pid: any) => projIdSet.has(String(pid)))) {
        if (email && !memberMap.has(email)) {
          memberMap.set(email, name);
        }
      }
    });
  }

  return Array.from(memberMap.entries())
    .map(([email, name]) => ({ email, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Normalizes and determines whether a token log belongs to a specific project.
 * Supports:
 * - Exact project name or ID matching (case-insensitive)
 * - Prefixed / slugified ID matching (e.g. 'proj-yra9mwg17atmvdl8tocz' <-> 'yRa9MWg17ATMVDl8TOcZ')
 * - Slugified project names (e.g. 'proj-credit-consumption-trial' <-> 'CREDIT CONSUMPTION TRIAL')
 * - Raw Firestore ID matches
 */
export const isLogMatchingProject = (
  log: TokenLog,
  projectOrIdOrName?: string | Project | null,
  allProjects?: Project[]
): boolean => {
  if (!log) return false;
  if (!projectOrIdOrName || projectOrIdOrName === 'All') return true;

  let targetId = '';
  let targetName = '';

  if (typeof projectOrIdOrName === 'object') {
    targetId = (projectOrIdOrName.id || '').trim();
    targetName = (projectOrIdOrName.name || '').trim();
  } else {
    const queryStr = projectOrIdOrName.trim();
    targetId = queryStr;
    targetName = queryStr;

    // Look up project object from known projects
    if (allProjects && allProjects.length > 0) {
      const qLower = queryStr.toLowerCase();
      const qStripped = qLower.replace(/^proj-/, '');
      const found = allProjects.find(p => {
        const pId = (p.id || '').toLowerCase().trim();
        const pName = (p.name || '').toLowerCase().trim();
        const pSlug = `proj-${pName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
        return (
          pId === qLower ||
          pName === qLower ||
          pId === qStripped ||
          pSlug === qLower ||
          p.id === queryStr ||
          p.name === queryStr
        );
      });
      if (found) {
        targetId = found.id || targetId;
        targetName = found.name || targetName;
      }
    }
  }

  const tIdNorm = targetId.toLowerCase().trim();
  const tNameNorm = targetName.toLowerCase().trim();
  const tIdStripped = tIdNorm.replace(/^proj-/, '');
  const tNameSlug = `proj-${tNameNorm.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const tIdSlug = `proj-${tIdNorm}`;

  const lp = (log.project || '').trim();
  const lpid = (log.projectId || '').trim();
  const lpNorm = lp.toLowerCase();
  const lpidNorm = lpid.toLowerCase();
  const lpStripped = lpNorm.replace(/^proj-/, '');
  const lpidStripped = lpidNorm.replace(/^proj-/, '');

  // 1. Direct ID matches
  if (tIdNorm) {
    if (
      lpNorm === tIdNorm ||
      lpidNorm === tIdNorm ||
      lpStripped === tIdStripped ||
      lpidStripped === tIdStripped ||
      lpStripped === tIdNorm ||
      lpidStripped === tIdNorm ||
      lpNorm === tIdSlug ||
      lpidNorm === tIdSlug
    ) {
      return true;
    }
  }

  // 2. Direct Name matches
  if (tNameNorm) {
    if (
      lpNorm === tNameNorm ||
      lpidNorm === tNameNorm ||
      lpStripped === tNameNorm ||
      lpidStripped === tNameNorm ||
      lpNorm === tNameSlug ||
      lpidNorm === tNameSlug
    ) {
      return true;
    }
  }

  // 3. Alphanumeric stripped match (handles hyphens, spaces, underscores variations)
  const cleanTName = tNameNorm.replace(/[^a-z0-9]/g, '');
  const cleanTId = tIdNorm.replace(/[^a-z0-9]/g, '');
  const cleanLp = lpNorm.replace(/[^a-z0-9]/g, '');
  const cleanLpid = lpidStripped.replace(/[^a-z0-9]/g, '');

  if (cleanTName && (cleanLp === cleanTName || cleanLpid === cleanTName)) {
    return true;
  }
  if (cleanTId && (cleanLp === cleanTId || cleanLpid === cleanTId)) {
    return true;
  }

  return false;
};

/**
 * Resolves a human-readable display name for a token log's project.
 * If log.project is a Firestore ID or slug, resolves it using the project list.
 */
export const getProjectDisplayName = (
  log: TokenLog,
  allProjects?: Project[]
): string => {
  if (!log) return 'Default Project';
  const lp = (log.project || '').trim();
  const lpid = (log.projectId || '').trim();

  if (allProjects && allProjects.length > 0) {
    const match = allProjects.find(p => isLogMatchingProject(log, p, allProjects));
    if (match && match.name) {
      return match.name;
    }
  }

  // If lp is not an opaque 20-character random firestore id, return it
  if (lp && !/^[A-Za-z0-9]{20}$/.test(lp)) {
    return lp;
  }

  return lp || lpid || 'Default Project';
};

/**
 * Verifies whether a token log belongs to one of the accessible projects.
 * Enforces both project membership and member authorization for Admin roles.
 */
export const isLogRecordAccessible = (
  log: TokenLog,
  accessibleProjects: Project[],
  authorizedMemberEmails?: Set<string>
): boolean => {
  if (!accessibleProjects || accessibleProjects.length === 0) return false;

  const matchesProject = accessibleProjects.some(p => isLogMatchingProject(log, p, accessibleProjects));
  if (!matchesProject) return false;

  if (authorizedMemberEmails && authorizedMemberEmails.size > 0) {
    const logUserEmail = (log.userEmail || '').toLowerCase().trim();
    if (logUserEmail && !authorizedMemberEmails.has(logUserEmail)) {
      return false;
    }
  }

  return true;
};

/**
 * Fetch token consumption logs with strict role-based access enforcement.
 * Checks authoritative backend endpoint, with Firestore direct fallback.
 */
export const getFirestoreTokenLogs = async (
  currentUser?: User | null,
  accessibleProjects?: Project[] | null,
  projectId?: string,
  memberEmail?: string
): Promise<TokenLog[]> => {
  const isSuperAdmin = isSuperAdminUser(currentUser);
  const userEmail = currentUser?.email || '';

  // 1. Try secure backend endpoint first to enforce server-side RBAC
  if (userEmail) {
    try {
      const params = new URLSearchParams({ userEmail });
      if (projectId && projectId !== 'All') params.append('projectId', projectId);
      if (memberEmail && memberEmail !== 'All') params.append('memberEmail', memberEmail);

      const res = await fetch(`/api/credits/consumption-records?${params.toString()}`, {
        headers: {
          'x-user-email': userEmail
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs) && data.logs.length > 0) {
          const cleanLogs = deduplicateTokenLogs(data.logs);
          cachedTokenLogs = cleanLogs;
          try {
            if (typeof window !== 'undefined') {
              safePersistTokenLogs(cleanLogs);
              window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: cleanLogs }));
            }
          } catch (e) {}
          console.log(`✓ [API] Retrieved ${cleanLogs.length} authorized credit records via backend RBAC.`);
          return cleanLogs;
        } else if (data.success && Array.isArray(data.logs) && data.logs.length === 0) {
          console.info('[Credits] Backend API returned 0 records, attempting direct Firestore query...');
        }
      } else if (res.status === 403) {
        const errJson = await res.json().catch(() => ({}));
        console.warn('[Credits] Backend API returned 403, falling back to direct Firestore:', errJson.error);
        // Do NOT throw - fallback to direct Firestore query below
      }
    } catch (apiErr: any) {
      console.warn('[Credits] Backend API unreachable or restricted, falling back to direct Firestore:', apiErr?.message);
    }
  }

  // 2. Direct Firestore fallback
  try {
    const logsRef = collection(db, 'token_consumption_logs');
    const q = query(logsRef, orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);

    const realLogs: TokenLog[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as TokenLog;
      realLogs.push({
        ...data,
        id: docSnap.id || data.id,
        costUsd: calculateTokenCostUsd(data.inputTokens, data.outputTokens, data.cached)
      });
    });

    let authorizedLogs = realLogs;
    if (!isSuperAdmin) {
      const validProjects = (accessibleProjects && accessibleProjects.length > 0)
        ? accessibleProjects
        : (currentUser ? getAccessibleProjects(currentUser, []) : []);
      if (validProjects.length > 0) {
        const authMembers = getAuthorizedMembersForProjects(validProjects);
        const authMemberEmails = new Set(authMembers.map(m => m.email.toLowerCase().trim()));
        if (currentUser?.email) authMemberEmails.add(currentUser.email.toLowerCase().trim());
        authorizedLogs = realLogs.filter(log => isLogRecordAccessible(log, validProjects, authMemberEmails));
      } else if (currentUser?.email) {
        const userEmailLower = currentUser.email.toLowerCase().trim();
        authorizedLogs = realLogs.filter(log => {
          const logEmail = (log.userEmail || '').toLowerCase().trim();
          const logUser = (log.user || '').toLowerCase().trim();
          return logEmail === userEmailLower || logUser === userEmailLower;
        });
      }
    }

    if (projectId && projectId !== 'All') {
      const validProjects = accessibleProjects || [];
      authorizedLogs = authorizedLogs.filter(l => isLogMatchingProject(l, projectId, validProjects));
    }
    if (memberEmail && memberEmail !== 'All') {
      const targetEmail = memberEmail.toLowerCase().trim();
      authorizedLogs = authorizedLogs.filter(l => (l.userEmail && l.userEmail.toLowerCase().trim() === targetEmail) || (l.user && l.user.toLowerCase().trim() === targetEmail));
    }

    const cleanLogs = deduplicateTokenLogs(authorizedLogs);
    cachedTokenLogs = cleanLogs;

    // Cache a safe snapshot in localStorage for offline resilience
    try {
      if (typeof window !== 'undefined') {
        safePersistTokenLogs(cleanLogs);
        window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: cleanLogs }));
      }
    } catch (e) {
      // Ignore localStorage quota errors silently
    }

    console.log(`✓ [Firestore] Fetched ${cleanLogs.length} authorized token consumption records.`);
    return cleanLogs;
  } catch (err: any) {
    console.error("✗ [Firestore] Error fetching token logs from Firestore:", err);
    throw err;
  }
};

/**
 * Save a single log entry to Firestore database
 */
export const saveLogToFirestore = async (log: TokenLog) => {
  try {
    const docRef = doc(db, 'token_consumption_logs', log.id);
    await syncSetDoc(docRef, log, { merge: true, timeoutMs: 30000 });
    console.log(`✓ [Firestore] Saved log ${log.id} (${log.feature}) to Firestore.`);
  } catch (err: any) {
    console.warn(`[Firestore] Token log ${log.id} stored locally; remote sync skipped:`, err?.message || err);
  }
};

/**
 * Subscribe to live Firestore updates for token consumption logs with role filtering.
 * Surfaces errors directly to caller rather than silently replacing data with empty arrays.
 */
export const subscribeToFirestoreTokenLogs = (
  callback: (logs: TokenLog[]) => void,
  onError?: (error: any) => void,
  currentUser?: User | null,
  accessibleProjects?: Project[] | null
) => {
  try {
    const logsRef = collection(db, 'token_consumption_logs');
    const q = query(logsRef, orderBy('timestamp', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const realLogs: TokenLog[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as TokenLog;
        realLogs.push({
          ...data,
          id: docSnap.id || data.id,
          costUsd: calculateTokenCostUsd(data.inputTokens, data.outputTokens, data.cached)
        });
      });

      const isSuperAdmin = isSuperAdminUser(currentUser);
      let authorizedLogs = realLogs;
      if (!isSuperAdmin) {
        const validProjects = (accessibleProjects && accessibleProjects.length > 0)
          ? accessibleProjects
          : (currentUser ? getAccessibleProjects(currentUser, []) : []);
        if (validProjects.length > 0) {
          const authMembers = getAuthorizedMembersForProjects(validProjects);
          const authMemberEmails = new Set(authMembers.map(m => m.email.toLowerCase().trim()));
          if (currentUser?.email) authMemberEmails.add(currentUser.email.toLowerCase().trim());
          authorizedLogs = realLogs.filter(log => isLogRecordAccessible(log, validProjects, authMemberEmails));
        } else if (currentUser?.email) {
          const userEmailLower = currentUser.email.toLowerCase().trim();
          authorizedLogs = realLogs.filter(log => {
            const logEmail = (log.userEmail || '').toLowerCase().trim();
            const logUser = (log.user || '').toLowerCase().trim();
            return logEmail === userEmailLower || logUser === userEmailLower;
          });
        }
      }

      const cleanLogs = deduplicateTokenLogs(authorizedLogs);
      cachedTokenLogs = cleanLogs;

      try {
        if (typeof window !== 'undefined') {
          safePersistTokenLogs(cleanLogs);
          window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: cleanLogs }));
        }
      } catch (e) {
        // ignore storage quota errors
      }

      console.log(`✓ [Firestore] Real-time listener received ${cleanLogs.length} authorized credit records.`);
      callback(cleanLogs);
    }, (err) => {
      console.error("✗ [Firestore] token_consumption_logs onSnapshot error:", err);
      if (onError) {
        onError(err);
      }
      if (cachedTokenLogs.length > 0) {
        callback(cachedTokenLogs);
      } else {
        const local = getTokenLogs();
        if (local.length > 0) {
          callback(local);
        }
      }
    });
  } catch (err: any) {
    console.error("✗ [Firestore] Failed to initialize token logs subscription:", err);
    if (onError) {
      onError(err);
    }
    if (cachedTokenLogs.length > 0) {
      callback(cachedTokenLogs);
    } else {
      callback(getTokenLogs());
    }
    return () => {};
  }
};

// Project Name normalizer mapping to replace generic names with exact project names
const SEED_PROJECT_MAP: Record<string, string> = {
  'tok-301': 'Global Retail Banking App',
  'tok-302': 'OmniPay Mobile Wallet',
  'tok-303': 'Enterprise Identity & SSO',
  'tok-304': 'ShopWave Direct Checkout',
  'tok-305': 'SmartCart E-Commerce Platform',
  'tok-306': 'HRMS Cloud Portal',
  'tok-307': 'Core Banking Gateway API',
  'tok-308': 'Cloud Payment Microservice',
  'tok-309': 'OmniChannel Storefront Web'
};

const FEATURE_PROJECT_FALLBACK_MAP: Record<string, string> = {
  'UI testing': 'Global Retail Banking App',
  'Automation - Record and play - Web app and Mobile app': 'OmniPay Mobile Wallet',
  'AI Test Scenario generation': 'Enterprise Identity & SSO',
  'AI test cases generation': 'ShopWave Direct Checkout',
  'Automation - script generator': 'SmartCart E-Commerce Platform',
  'AI User stories generation': 'HRMS Cloud Portal',
  'API testing': 'Core Banking Gateway API',
  'API performance testing': 'Cloud Payment Microservice',
  'Web performance testing': 'OmniChannel Storefront Web'
};

/**
 * Helper to get currently active project name from window or localStorage
 */
export const getActiveProjectName = (): string => {
  if (typeof window !== 'undefined') {
    const active = (window as any).__automatiqa_active_project_name || localStorage.getItem('automatiqa_active_project_name');
    if (active && active !== 'Banking App' && active !== 'AutomatiQA Project' && active !== '27/07' && active !== 'undefined' && active !== 'UNDEFINED' && active !== 'null') {
      return active;
    }
  }
  return 'Project - Pradee';
};

/**
 * Deduplicate token logs by ID and by near-simultaneous duplicate generation events
 */
export const deduplicateTokenLogs = (rawLogs: TokenLog[]): TokenLog[] => {
  if (!Array.isArray(rawLogs) || rawLogs.length === 0) return [];
  
  const seenIds = new Set<string>();
  const uniqueLogs: TokenLog[] = [];

  for (const log of rawLogs) {
    if (!log || !log.id) continue;
    if (seenIds.has(log.id)) continue;

    // Check if there is already a nearly identical log generated within 8 seconds for the same feature/user
    const isDuplicateEvent = uniqueLogs.some(existing => {
      const timeDiff = Math.abs((existing.timestamp || 0) - (log.timestamp || 0));
      const sameUser = existing.user === log.user || existing.userEmail === log.userEmail;
      const sameFeature = existing.feature === log.feature;
      const sameStory = Boolean(existing.userStoryId && log.userStoryId && existing.userStoryId === log.userStoryId);
      const sameItems = existing.itemsGenerated === log.itemsGenerated;

      return (
        timeDiff < 8000 &&
        sameUser &&
        (sameFeature || sameStory) &&
        (sameItems || (existing.totalTokens === log.totalTokens))
      );
    });

    if (!isDuplicateEvent) {
      seenIds.add(log.id);
      uniqueLogs.push(log);
    }
  }

  return uniqueLogs;
};

// Auto-sync real-time logs dispatched from any service (e.g. deductProjectCredits) into cache and localStorage
if (typeof window !== 'undefined') {
  window.addEventListener('token-consumption-updated', (e: any) => {
    const detail = e?.detail;
    if (detail && detail.id && !detail.cleared && !detail.reset) {
      const currentLogs = getTokenLogs();
      const existingIndex = currentLogs.findIndex(l => l.id === detail.id);
      if (existingIndex === -1) {
        const updatedLogs = deduplicateTokenLogs([detail, ...currentLogs]);
        cachedTokenLogs = updatedLogs;
        try {
          safePersistTokenLogs(updatedLogs);
        } catch (_) {}
      }
    }
  });
}

/**
 * Get all token consumption logs.
 * Prioritizes in-memory cache populated from Firestore, falling back to localStorage if offline.
 */
export const getTokenLogs = (): TokenLog[] => {
  if (cachedTokenLogs.length > 0) {
    return cachedTokenLogs;
  }

  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_KEY) : null;
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const currentActiveProject = getActiveProjectName();
        const mappedLogs = parsed.map((item: TokenLog) => {
          let resolvedProject = item.project;
          if (SEED_PROJECT_MAP[item.id]) {
            resolvedProject = SEED_PROJECT_MAP[item.id];
          } else if (!resolvedProject || resolvedProject === 'Banking App' || resolvedProject === 'AutomatiQA Project' || resolvedProject === 'SmartCart E-Commerce Platform') {
            resolvedProject = currentActiveProject;
          }

          return {
            ...item,
            project: resolvedProject || currentActiveProject,
            costUsd: calculateTokenCostUsd(item.inputTokens, item.outputTokens, item.cached)
          };
        });

        const deduped = deduplicateTokenLogs(mappedLogs);
        cachedTokenLogs = deduped;
        return deduped;
      }
    }
  } catch (err) {
    console.warn("Failed to read token logs from local storage:", err);
  }

  return [];
};

/**
 * Add a new token log entry and sync to Firestore
 */
export const addTokenLog = (logData: Partial<TokenLog> & { feature: string }): TokenLog => {
  const currentLogs = getTokenLogs();
  const currentActiveProject = getActiveProjectName();
  
  const now = new Date();
  const timestamp = logData.timestamp || Date.now();
  const dateFormatted = logData.date || formatToIST(timestamp);
  const inTokens = logData.inputTokens || 1500;
  const outTokens = logData.outputTokens || 600;
  const totalTokens = inTokens + outTokens;
  const costUsd = logData.costUsd !== undefined ? logData.costUsd : calculateTokenCostUsd(inTokens, outTokens, logData.cached || false);

  const exactProject = logData.project && logData.project !== 'Banking App' && logData.project !== 'AutomatiQA Project'
    ? logData.project 
    : currentActiveProject;

  const exactProjectId = logData.projectId || `proj-${exactProject.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

  const exactInputCount = logData.inputCount !== undefined && logData.inputCount > 0
    ? logData.inputCount
    : extractInputCountFromDetails(logData.inputModalityDetails, logData.inputModality);

  const tierInfo = calculateInputTier(exactInputCount);

  const newLog: TokenLog = {
    id: logData.id || `tok-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    date: dateFormatted,
    timestamp: logData.timestamp || Date.now(),
    user: logData.user || (typeof window !== 'undefined' ? ((window as any).__automatiqa_user_name || localStorage.getItem('automatiqa_user_name')) : 'Shanmugapriya') || 'Shanmugapriya',
    userEmail: logData.userEmail || (typeof window !== 'undefined' ? ((window as any).__automatiqa_user_email || localStorage.getItem('automatiqa_user_email')) : 'shanmugapriya@qaoncloud.com') || 'shanmugapriya@qaoncloud.com',
    workspace: logData.workspace || 'QAOnCloud Workspace',
    project: exactProject,
    projectId: exactProjectId,
    userStoryId: logData.userStoryId || 'US-102',
    feature: logData.feature,
    inputModality: logData.inputModality || 'Text',
    inputModalityDetails: logData.inputModalityDetails,
    inputCount: exactInputCount,
    tier: logData.tier || tierInfo.tier,
    outputType: logData.outputType,
    actionType: logData.actionType || 'analysis',
    itemsGenerated: logData.itemsGenerated || 1,
    creditsConsumed: (() => {
      const projSummary = getProjectCreditSummary(exactProjectId, exactProject);
      const rawC = logData.creditsConsumed !== undefined ? logData.creditsConsumed : calculateCreditsConsumed(logData.feature, logData.itemsGenerated || 1, logData.cached || false, logData.actionType || 'analysis');
      // Strictly respect project pool limit: cannot consume more credits than remaining in current cycle
      return Math.max(0, Math.min(rawC, projSummary.remainingCredits));
    })(),
    remainingCreditsAfter: logData.remainingCreditsAfter !== undefined ? logData.remainingCreditsAfter : (() => {
      const projSummary = getProjectCreditSummary(exactProjectId, exactProject);
      return Math.max(0, projSummary.remainingCredits);
    })(),
    model: logData.model || GEMINI_38_FLASH_MODEL,
    inputTokens: inTokens,
    outputTokens: outTokens,
    totalTokens,
    costUsd,
    responseTimeSeconds: logData.responseTimeSeconds || 1.8,
    cached: logData.cached || false
  };

  // Prevent duplicate log entry if identical or near-simultaneous log for the same feature/user exists
  const existingIndex = currentLogs.findIndex(l => {
    if (l.id === newLog.id) return true;
    const timeDiff = Math.abs((l.timestamp || 0) - (newLog.timestamp || 0));
    return (
      timeDiff < 8000 &&
      (l.user === newLog.user || l.userEmail === newLog.userEmail) &&
      (l.feature === newLog.feature || l.userStoryId === newLog.userStoryId) &&
      (l.itemsGenerated === newLog.itemsGenerated || l.totalTokens === newLog.totalTokens)
    );
  });

  let updatedLogs: TokenLog[];
  if (existingIndex >= 0) {
    // Merge / update in-place if incoming has richer modality info
    const existing = currentLogs[existingIndex];
    const merged: TokenLog = {
      ...existing,
      ...newLog,
      inputModality: newLog.inputModality || existing.inputModality,
      inputModalityDetails: newLog.inputModalityDetails || existing.inputModalityDetails,
      outputType: newLog.outputType || existing.outputType
    };
    updatedLogs = [...currentLogs];
    updatedLogs[existingIndex] = merged;
  } else {
    updatedLogs = deduplicateTokenLogs([newLog, ...currentLogs]);
  }
  
  cachedTokenLogs = updatedLogs;

  try {
    if (typeof window !== 'undefined') {
      safePersistTokenLogs(updatedLogs);
    }
  } catch (_) {}

  // Save to Firestore DB
  saveLogToFirestore(newLog);

  // Notify UI listeners
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: newLog }));

    // Check if project has reached or exceeded its plan limit (100 for Trial, 1,000 for Paid)
    if (exactProjectId || exactProject) {
      const projSummary = getProjectCreditSummary(exactProjectId, exactProject);
      if (projSummary.isGated || projSummary.usedCredits >= projSummary.totalPool || projSummary.remainingCredits <= 0) {
        window.dispatchEvent(new CustomEvent('credit-limit-exceeded', {
          detail: {
            project: exactProject,
            projectId: exactProjectId,
            userEmail: newLog.userEmail,
            usedCredits: projSummary.usedCredits,
            totalPool: projSummary.totalPool,
            planType: projSummary.planType,
            reason: `Project credit limit reached: Project "${projSummary.projectName}" has reached its ${projSummary.totalPool} credit limit on the ${projSummary.planType} plan. Only ${projSummary.totalPool} credits are available for this project. Please subscribe to continue.`
          }
        }));
      }
    }

    // Check if user has reached or exceeded the 1,000 credit limit in their current cycle
    const targetEmail = (newLog.userEmail || '').toLowerCase().trim();
    if (targetEmail) {
      const summary = getUserCreditSummary(targetEmail);
      if (summary.isExceeded || summary.usedCredits >= summary.totalPool) {
        window.dispatchEvent(new CustomEvent('credit-limit-exceeded', { 
          detail: { 
            userEmail: targetEmail, 
            usedCredits: summary.usedCredits, 
            totalPool: summary.totalPool 
          } 
        }));
      }
    }
  }

  return newLog;
};

/**
 * Log token consumption helper for feature APIs
 */
export const recordFeatureConsumption = (
  userName: string,
  userEmail: string,
  projectName: string,
  featureName: string,
  inputTokens: number,
  outputTokens: number,
  responseTimeSeconds: number,
  cached: boolean = false,
  itemsGenerated: number = 1,
  userStoryId?: string,
  workspace: string = 'QAOnCloud Workspace',
  inputModality?: 'Text' | 'Screenshot' | 'Video' | 'Document' | 'URL' | 'Multimodal',
  inputModalityDetails?: string,
  outputType?: string,
  inputCount?: number
) => {
  const creditsConsumed = calculateCreditsConsumed(featureName, itemsGenerated, cached);
  const resolvedProject = projectName && projectName !== 'Banking App' && projectName !== 'AutomatiQA Project'
    ? projectName
    : getActiveProjectName();

  return addTokenLog({
    user: userName || 'Admin User',
    userEmail: userEmail || 'admin@qaoncloud.com',
    workspace,
    project: resolvedProject,
    userStoryId: userStoryId || 'US-GENERAL',
    feature: featureName,
    inputModality,
    inputModalityDetails,
    inputCount,
    outputType,
    itemsGenerated,
    creditsConsumed,
    model: GEMINI_38_FLASH_MODEL,
    inputTokens,
    outputTokens,
    responseTimeSeconds,
    cached
  });
};

/**
 * Delete a single token log by ID from both local storage and Firestore
 */
export const deleteTokenLog = async (id: string): Promise<void> => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_INITIALIZED_KEY, 'true');
  }
  const currentLogs = getTokenLogs();
  const updatedLogs = currentLogs.filter(l => l.id !== id);
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedLogs));
    }
  } catch (e) {
    console.error("Failed to update localStorage after token log deletion:", e);
  }

  try {
    const docRef = doc(db, 'token_consumption_logs', id);
    await syncDeleteDoc(docRef);
  } catch (err: any) {
    console.warn("Firestore delete failed, fallback to local removal:", err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: { deletedId: id, remainingLogs: updatedLogs } }));
  }
};

/**
 * Delete multiple token logs by ID list from both local storage and Firestore
 */
export const deleteTokenLogs = async (ids: string[]): Promise<void> => {
  if (!ids || ids.length === 0) return;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_INITIALIZED_KEY, 'true');
  }
  const idSet = new Set(ids);
  const currentLogs = getTokenLogs();
  const updatedLogs = currentLogs.filter(l => !idSet.has(l.id));
  cachedTokenLogs = updatedLogs;

  try {
    if (typeof window !== 'undefined') {
      safePersistTokenLogs(updatedLogs);
    }
  } catch (_) {}

  await Promise.all(
    ids.map(async (id) => {
      try {
        const docRef = doc(db, 'token_consumption_logs', id);
        await syncDeleteDoc(docRef);
      } catch (err) {
        console.warn(`Firestore batch delete failed for ${id}:`, err);
      }
    })
  );

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: { deletedIds: ids, remainingLogs: updatedLogs } }));
  }
};

/**
 * Reset logs and restart fresh credit consumption
 */
export const resetDefaultTokenLogs = (): TokenLog[] => {
  cachedTokenLogs = [];
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_INITIALIZED_KEY, 'true');
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
  }
  resetBasicPlanStartDate();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: { reset: true, cleared: true, remainingLogs: [] } }));
  }
  return [];
};

/**
 * Clear all token logs permanently and start fresh credit consumption
 */
export const clearAllTokenLogs = async (): Promise<void> => {
  const currentLogs = getTokenLogs();
  const allIds = currentLogs.map(l => l.id);
  cachedTokenLogs = [];

  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_INITIALIZED_KEY, 'true');
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
  }
  resetBasicPlanStartDate();

  await Promise.all(
    allIds.map(async (id) => {
      try {
        const docRef = doc(db, 'token_consumption_logs', id);
        await syncDeleteDoc(docRef);
      } catch (err) {
        console.warn(`Firestore delete failed for ${id}:`, err);
      }
    })
  );

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: { cleared: true, remainingLogs: [] } }));
  }
};

const PLAN_START_TIMESTAMP_KEY = 'automatiqa_basic_plan_start_timestamp';

/**
 * Retrieves the starting timestamp of the Basic Plan (starts from today, 30 days total)
 */
export const getBasicPlanStartTimestamp = (): number => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(PLAN_START_TIMESTAMP_KEY);
    if (saved) {
      const num = Number(saved);
      if (!isNaN(num) && num > 0) return num;
    }
    // Default to start from today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const defaultStart = startOfToday.getTime();
    localStorage.setItem(PLAN_START_TIMESTAMP_KEY, String(defaultStart));
    return defaultStart;
  }
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return startOfToday.getTime();
};

/**
 * Resets or updates the plan start date
 */
export const resetBasicPlanStartDate = (timestamp?: number): number => {
  const startTimestamp = timestamp !== undefined ? timestamp : (() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return startOfToday.getTime();
  })();
  if (typeof window !== 'undefined') {
    localStorage.setItem(PLAN_START_TIMESTAMP_KEY, String(startTimestamp));
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: { planReset: true } }));
  }
  return startTimestamp;
};

export interface PlanValidityInfo {
  planName: string;
  creditPoints: number;
  trialDays: number;
  activePackDays: number;
  totalValidityDays: number;
  startTimestamp: number;
  startDateFormatted: string;
  trialEndTimestamp: number;
  trialEndDateFormatted: string;
  packEndTimestamp: number;
  packEndDateFormatted: string;
  daysElapsed: number;
  daysRemaining: number;
  isTrialPhase: boolean;
  isActivePackPhase: boolean;
  isExpired: boolean;
  phaseLabel: string;
  validityBadgeClass: string;
}

/**
 * Calculates current Basic Plan validity status (30 Days Total)
 */
export const getBasicPlanValidity = (): PlanValidityInfo => {
  const startTimestamp = getBasicPlanStartTimestamp();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  
  const packEndTimestamp = startTimestamp + (BASIC_PLAN_CONFIG.totalValidityDays * ONE_DAY_MS);
  
  const now = Date.now();
  const msElapsed = Math.max(0, now - startTimestamp);
  const daysElapsed = Math.floor(msElapsed / ONE_DAY_MS) + 1;
  const msRemaining = Math.max(0, packEndTimestamp - now);
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / ONE_DAY_MS));
  
  const isTrialPhase = false;
  const isExpired = now >= packEndTimestamp;
  const isActivePackPhase = !isExpired;

  let phaseLabel = 'Active (30 Days)';
  let validityBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';

  if (isExpired) {
    phaseLabel = 'Plan Expired (Renewal Required)';
    validityBadgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
  }

  return {
    planName: BASIC_PLAN_CONFIG.planName,
    creditPoints: BASIC_PLAN_CONFIG.creditPoints,
    trialDays: 0,
    activePackDays: BASIC_PLAN_CONFIG.activePackDays,
    totalValidityDays: BASIC_PLAN_CONFIG.totalValidityDays,
    startTimestamp,
    startDateFormatted: formatToIST(startTimestamp),
    trialEndTimestamp: packEndTimestamp,
    trialEndDateFormatted: formatToIST(packEndTimestamp),
    packEndTimestamp,
    packEndDateFormatted: formatToIST(packEndTimestamp),
    daysElapsed,
    daysRemaining,
    isTrialPhase,
    isActivePackPhase,
    isExpired,
    phaseLabel,
    validityBadgeClass
  };
};

export interface UserCreditCycleDetails {
  userEmail: string;
  userName: string;
  cycleStartTimestamp: number;
  cycleStartDateFormatted: string;
  allocatedCredits: number; // strictly 1,000 (or plan pool)
  consumedCredits: number; // STRICTLY CAPPED AT min(actualCurrentCycleRaw, allocatedCredits)
  actualCurrentCycleRaw: number; // raw sum of logs in current cycle
  remainingCredits: number; // max(allocatedCredits - consumedCredits, 0)
  percentageUsed: number; // min(round(consumedCredits / allocatedCredits * 100), 100)
  historicalTotalCredits: number; // sum of all historical logs for this user across all cycles
  lifetimeGenerationsCount: number; // total log count for this user
  currentCycleGenerationsCount: number; // log count in current cycle
  isGated: boolean; // consumedCredits >= allocatedCredits || remainingCredits <= 0
  status: string; // '100% Gated' | '75% Warning' | '50% Milestone' | '25% Normal'
  statusBadgeClass: string;
}

export interface UserCreditSummary {
  userEmail: string;
  userName: string;
  planName: string;
  totalPool: number;
  usedCredits: number;
  remainingCredits: number;
  percentageUsed: number;
  isExceeded: boolean;
  canUseAi: boolean;
  nonAiFeaturesStatus: 'Unlimited & Operational';
  validity: PlanValidityInfo;
  lifetimeUsedCredits?: number;
  actualCurrentCycleRaw?: number;
  cycleStartTimestamp?: number;
}

/**
 * Calculates user's credit cycle details with strict 1,000 credit cap per cycle.
 * Separates current cycle consumption from historical lifetime consumption.
 */
export const getUserCreditCycleDetails = (userEmail: string, logsToInspect?: TokenLog[]): UserCreditCycleDetails => {
  const resolvedEmail = (userEmail || '').toLowerCase().trim();
  const allLogs = logsToInspect || getTokenLogs();
  
  // 1. Determine active cycle start timestamp (from approved subscription or credit renewal)
  const activeSub = getActiveUserSubscription(resolvedEmail);
  const cycleStartTimestamp = activeSub?.approvedAt || activeSub?.requestedAt || getUserCycleStartTimestamp(resolvedEmail) || 0;
  const allocatedCredits = activeSub?.creditsGranted || activeSub?.requestedCredits || TOTAL_CREDIT_POOL; // Strictly 1,000

  // 2. Filter all historical logs belonging to this user
  const userLogs = allLogs.filter(l => {
    const lEmail = (l.userEmail || '').toLowerCase().trim();
    const lUser = (l.user || '').toLowerCase().trim();
    if (resolvedEmail) {
      if (lEmail && lEmail === resolvedEmail) return true;
      if (resolvedEmail.includes('@') && lUser.includes(resolvedEmail.split('@')[0])) return true;
      return false;
    }
    return true;
  });

  // 3. Historical/Cumulative total credits (All logs preserved permanently)
  const historicalTotalCredits = userLogs.reduce((acc, log) => {
    const c = log.creditsConsumed ?? calculateCreditsConsumed(log.feature, log.itemsGenerated || 1, log.cached);
    return acc + c;
  }, 0);

  // 4. Current cycle logs:
  // If an active subscription/renewal exists, only logs generated strictly AFTER approval count.
  // Previous cycle usage must NOT be added to the new cycle.
  const currentCycleLogs = cycleStartTimestamp > 0
    ? userLogs.filter(l => (l.timestamp || 0) > cycleStartTimestamp)
    : userLogs;

  const actualCurrentCycleRaw = currentCycleLogs.reduce((acc, log) => {
    const c = log.creditsConsumed ?? calculateCreditsConsumed(log.feature, log.itemsGenerated || 1, log.cached);
    return acc + c;
  }, 0);

  // 5. STRICT PER-USER CREDIT CALCULATION & CAPPING:
  // - Consumed Credit = min(actual consumption for current cycle, 1,000)
  // - Remaining Credit = max(1,000 - Consumed Credit, 0)
  // - Usage Percentage = min((Consumed Credit / 1,000) * 100, 100)
  // - Never display values such as 1,001, 2,000, 4,717, etc. as the user's current-cycle consumed credit.
  const consumedCredits = Math.min(actualCurrentCycleRaw, allocatedCredits);
  const remainingCredits = Math.max(0, allocatedCredits - consumedCredits);
  const percentageUsed = Math.min(100, Number(((consumedCredits / allocatedCredits) * 100).toFixed(1)));
  const isGated = consumedCredits >= allocatedCredits || remainingCredits <= 0;

  let status = 'Active';
  let statusBadgeClass = 'bg-emerald-50 border-emerald-200 text-emerald-700';

  if (consumedCredits >= 1000 || isGated || percentageUsed >= 100) {
    status = '100% Gated';
    statusBadgeClass = 'bg-rose-50 border-rose-200 text-rose-700';
  } else {
    status = 'Active';
    statusBadgeClass = 'bg-emerald-50 border-emerald-200 text-emerald-700';
  }

  const userName = (typeof window !== 'undefined' ? (window as any).__automatiqa_user_name || localStorage.getItem('automatiqa_user_name') : '') || (resolvedEmail ? resolvedEmail.split('@')[0] : 'User');

  return {
    userEmail: resolvedEmail,
    userName,
    cycleStartTimestamp,
    cycleStartDateFormatted: cycleStartTimestamp > 0 ? formatToIST(cycleStartTimestamp) : 'Initial Cycle',
    allocatedCredits,
    consumedCredits,
    actualCurrentCycleRaw,
    remainingCredits,
    percentageUsed,
    historicalTotalCredits,
    lifetimeGenerationsCount: userLogs.length,
    currentCycleGenerationsCount: currentCycleLogs.length,
    isGated,
    status,
    statusBadgeClass
  };
};

/**
 * Calculates current user's credit usage and verification status.
 * Strictly caps current cycle consumed credits at 1,000 and provides historical lifetime total.
 */
export const getUserCreditSummary = (userEmail?: string): UserCreditSummary => {
  const logs = getTokenLogs();
  const resolvedEmail = (userEmail || (typeof window !== 'undefined' ? (window as any).__automatiqa_user_email || localStorage.getItem('automatiqa_user_email') : '') || 'sowbarnya@qaoncloud.com').toLowerCase().trim();
  
  // Calculate cycle details with strict 1,000 cap
  const cycleDetails = getUserCreditCycleDetails(resolvedEmail, logs);
  const activeSub = getActiveUserSubscription(resolvedEmail);
  const totalPool = cycleDetails.allocatedCredits;
  const approvedAt = cycleDetails.cycleStartTimestamp;
  const usedCredits = cycleDetails.consumedCredits;
  const remainingCredits = cycleDetails.remainingCredits;
  const percentageUsed = cycleDetails.percentageUsed;
  const isExceeded = cycleDetails.isGated;
  
  // Calculate validity accurately from approval timestamp or basic plan
  let validity: PlanValidityInfo;
  if (activeSub && approvedAt > 0) {
    const validityDays = activeSub.validityDays || 30;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const packEndTimestamp = approvedAt + (validityDays * ONE_DAY_MS);
    const now = Date.now();
    const msElapsed = Math.max(0, now - approvedAt);
    const daysElapsed = Math.floor(msElapsed / ONE_DAY_MS) + 1;
    const msRemaining = Math.max(0, packEndTimestamp - now);
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / ONE_DAY_MS));
    const isExpired = now >= packEndTimestamp;

    validity = {
      planName: activeSub.planName || BASIC_PLAN_CONFIG.planName,
      creditPoints: totalPool,
      trialDays: 0,
      activePackDays: validityDays,
      totalValidityDays: validityDays,
      startTimestamp: approvedAt,
      startDateFormatted: formatToIST(approvedAt),
      trialEndTimestamp: packEndTimestamp,
      trialEndDateFormatted: formatToIST(packEndTimestamp),
      packEndTimestamp,
      packEndDateFormatted: formatToIST(packEndTimestamp),
      daysElapsed,
      daysRemaining,
      isTrialPhase: false,
      isActivePackPhase: !isExpired,
      isExpired,
      phaseLabel: isExpired ? 'Plan Expired (Renewal Required)' : `Active Subscription (${daysRemaining} Days Left)`,
      validityBadgeClass: isExpired ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
  } else {
    validity = getBasicPlanValidity();
  }

  const userName = (typeof window !== 'undefined' ? (window as any).__automatiqa_user_name || localStorage.getItem('automatiqa_user_name') : '') || (resolvedEmail ? resolvedEmail.split('@')[0] : 'User');

  return {
    userEmail: resolvedEmail,
    userName,
    planName: activeSub?.planName || BASIC_PLAN_CONFIG.planName,
    totalPool,
    usedCredits,
    remainingCredits,
    percentageUsed,
    isExceeded,
    canUseAi: !isExceeded && !validity.isExpired,
    nonAiFeaturesStatus: 'Unlimited & Operational',
    validity,
    lifetimeUsedCredits: cycleDetails.historicalTotalCredits,
    actualCurrentCycleRaw: cycleDetails.actualCurrentCycleRaw,
    cycleStartTimestamp: cycleDetails.cycleStartTimestamp
  };
};

/**
 * Quick check if user's credits are exceeded
 */
export const isUserCreditExceeded = (userEmail?: string): boolean => {
  const summary = getUserCreditSummary(userEmail);
  return summary.isExceeded;
};

/**
 * Verifies if an AI generation feature is permitted to execute
 */
export const checkAiGenerationPermission = (
  userEmail?: string, 
  featureName?: string,
  projectId?: string,
  projectName?: string
): {
  allowed: boolean;
  reason?: string;
  usedCredits: number;
  remainingCredits: number;
  planName: string;
} => {
  // 1. PRIMARY: Check project-level plan limit (Project-Level Pooling: Trial 100 credits, Paid 1,000 credits)
  const resolvedProjectId = projectId || (typeof window !== 'undefined' ? (window as any).__automatiqa_active_project_id || localStorage.getItem('automatiqa_active_project_id') : '');
  const resolvedProjectName = projectName || (typeof window !== 'undefined' ? (window as any).__automatiqa_active_project_name || localStorage.getItem('automatiqa_active_project_name') : '');

  if (resolvedProjectId || resolvedProjectName) {
    const projectSummary = getProjectCreditSummary(resolvedProjectId, resolvedProjectName);
    if (projectSummary.isExpired) {
      return {
        allowed: false,
        reason: `Project plan expired: The validity period for project "${projectSummary.projectName}" has expired. Please subscribe or renew your project plan.`,
        usedCredits: projectSummary.usedCredits,
        remainingCredits: 0,
        planName: `${projectSummary.planType} Plan`
      };
    }
    const requiredCost = featureName ? getCreditCost(featureName, 'analysis', projectSummary.planType) : 5;
    if (projectSummary.remainingCredits < requiredCost) {
      return {
        allowed: false,
        reason: `Insufficient credits: Project "${projectSummary.projectName}" has ${projectSummary.remainingCredits} credits remaining, but this operation requires ${requiredCost} credits. Please subscribe or top up credits to continue.`,
        usedCredits: projectSummary.usedCredits,
        remainingCredits: projectSummary.remainingCredits,
        planName: `${projectSummary.planType} Plan`
      };
    }

    // When project-level plan is active and valid with remaining credits, permit generation!
    return {
      allowed: true,
      usedCredits: projectSummary.usedCredits,
      remainingCredits: projectSummary.remainingCredits,
      planName: `${projectSummary.planType} Plan`
    };
  }

  // 2. SECONDARY: Check user-level summary
  const summary = getUserCreditSummary(userEmail);
  if (summary.isExceeded) {
    return {
      allowed: false,
      reason: `Basic Plan credit limit exceeded: You have utilized ${summary.usedCredits} of ${summary.totalPool} credit points. All non-AI features (manual test creation, execution, manual recording, and reports) remain 100% functional. AI generation is paused until credits are topped up.`,
      usedCredits: summary.usedCredits,
      remainingCredits: summary.remainingCredits,
      planName: summary.planName
    };
  }

  if (summary.validity.isExpired) {
    return {
      allowed: false,
      reason: `Plan validity expired (${summary.validity.totalValidityDays} days). All non-AI features remain functional. Please renew your plan to resume AI generations.`,
      usedCredits: summary.usedCredits,
      remainingCredits: summary.remainingCredits,
      planName: summary.planName
    };
  }

  return {
    allowed: true,
    usedCredits: summary.usedCredits,
    remainingCredits: summary.remainingCredits,
    planName: summary.planName
  };
};

/**
 * Project-Level Plan Management & Credit Calculation Services
 * Supports Trial Plan (100 credits, 7 days) and Paid Plan (1,000 credits, 30 days)
 * Enforces project-level pooling and strict zero over-consumption caps.
 */

// In-memory cache of project plans
let cachedProjectPlans: ProjectPlan[] = [];

/**
 * Real-time listener for project plans across all clients and team members
 */
export const subscribeToProjectPlans = (callback?: (plans: ProjectPlan[]) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  try {
    const q = query(collection(db, 'project_plans'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fsPlans: ProjectPlan[] = [];
      snapshot.forEach(docSnap => {
        if (docSnap.exists()) {
          const d = docSnap.data() as any;
          fsPlans.push({ ...d, projectId: d.projectId || docSnap.id });
        }
      });

      if (fsPlans.length > 0) {
        fsPlans.forEach(p => {
          syncAndUpdateCachedPlans(p, p.projectId, p.projectName, true);
        });
        if (callback) callback(cachedProjectPlans);
      }
    }, (err) => {
      console.warn('[tokenConsumptionService] Firestore project_plans listener warning:', err?.message || err);
    });

    return unsubscribe;
  } catch (err) {
    console.warn('[tokenConsumptionService] Failed to attach project_plans listener:', err);
    return () => {};
  }
};

/**
 * Loads project plans from server or Firestore or local fallback
 */
export const getProjectPlans = async (): Promise<ProjectPlan[]> => {
  let backendPlans: ProjectPlan[] = [];

  // 1. Fetch from server endpoint
  try {
    const res = await fetch('/api/credits/all-project-plans');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.plans) && data.plans.length > 0) {
        backendPlans = data.plans;
      }
    }
  } catch (err) {
    // Network or offline fallback
  }

  // 2. Direct Firestore fallback
  let firestorePlans: ProjectPlan[] = [];
  try {
    if (db) {
      const snap = await getDocs(collection(db, 'project_plans'));
      if (!snap.empty) {
        snap.forEach(d => {
          if (d.exists()) {
            firestorePlans.push({ ...(d.data() as any), projectId: d.data().projectId || d.id });
          }
        });
      }
    }
  } catch (fsErr) {
    // Permission or offline fallback
  }

  // Combine and deduplicate safely keeping the latest cycleStartTimestamp / lastRenewedAt
  const combinedMap = new Map<string, ProjectPlan>();

  const upsertPlanIfNewer = (p: ProjectPlan) => {
    if (!p) return;
    const keys = [
      (p.projectId || '').toLowerCase().trim(),
      (p.projectName || '').toLowerCase().trim(),
      (p.projectName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '')
    ].filter(Boolean);

    const pTime = p.lastRenewedAt || p.cycleStartTimestamp || 0;

    for (const k of keys) {
      const existing = combinedMap.get(k);
      if (!existing) {
        combinedMap.set(k, p);
      } else {
        const exTime = existing.lastRenewedAt || existing.cycleStartTimestamp || 0;
        if (pTime >= exTime) {
          combinedMap.set(k, p);
        }
      }
    }
  };

  // Local storage first
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('automatiqa_project_plans');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsed.forEach(p => upsertPlanIfNewer(p));
        }
      } catch (e) {}
    }
  }

  // Server plans next (only overwrite if equal or newer)
  backendPlans.forEach(p => upsertPlanIfNewer(p));

  // Firestore plans next (only overwrite if equal or newer)
  firestorePlans.forEach(p => upsertPlanIfNewer(p));

  const seen = new Set<string>();
  const finalPlans: ProjectPlan[] = [];
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  for (const p of combinedMap.values()) {
    const key = (p.projectId || p.projectName || '').toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      const isTrial = (p.planType || '').toLowerCase() === 'trial';
      const targetValidity = isTrial ? 7 : 30;
      const targetCredits = isTrial ? 100 : 1000;
      const expectedEnd = (p.cycleStartTimestamp || Date.now()) + (targetValidity * ONE_DAY_MS);
      const hasExcessCycle = isTrial && (p.cycleEndTimestamp - p.cycleStartTimestamp > 8 * ONE_DAY_MS);

      finalPlans.push({
        ...p,
        planType: isTrial ? 'Trial' : 'Paid',
        allocatedCredits: targetCredits,
        validityDays: targetValidity,
        cycleEndTimestamp: hasExcessCycle ? expectedEnd : (p.cycleEndTimestamp || expectedEnd),
        cycleEndDateFormatted: hasExcessCycle ? formatToIST(expectedEnd) : (p.cycleEndDateFormatted || formatToIST(p.cycleEndTimestamp || expectedEnd))
      });
    }
  }

  if (finalPlans.length > 0) {
    cachedProjectPlans = finalPlans;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('automatiqa_project_plans', JSON.stringify(finalPlans));
        window.dispatchEvent(new CustomEvent('project-plan-updated', { detail: finalPlans }));
      } catch (e) {}
    }
    return finalPlans;
  }

  return cachedProjectPlans;
};

// Auto-initialize project plans from server on client startup
if (typeof window !== 'undefined') {
  setTimeout(() => {
    getProjectPlans().catch(() => {});
  }, 100);
}

/**
 * Synchronous getter for a project's active plan with sensible defaults (Trial: 200, Paid: 1000)
 */
export const getProjectPlanSync = (projectId?: string, projectName?: string): ProjectPlan => {
  if (typeof window !== 'undefined' && cachedProjectPlans.length === 0) {
    const stored = localStorage.getItem('automatiqa_project_plans');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) cachedProjectPlans = parsed;
      } catch (e) {}
    }
  }

  const pIdLower = (projectId || '').toLowerCase().trim();
  const pNameLower = (projectName || '').toLowerCase().trim();
  const pNameClean = pNameLower.replace(/[^a-z0-9]/g, '');
  const pIdClean = pIdLower.replace(/[^a-z0-9]/g, '');

  // 1. Exact ID match (highest priority)
  let found = cachedProjectPlans.find(p => {
    const curId = (p.projectId || '').toLowerCase().trim();
    return pIdLower && curId === pIdLower;
  });

  // 2. Exact Name match
  if (!found) {
    found = cachedProjectPlans.find(p => {
      const curName = (p.projectName || '').toLowerCase().trim();
      return (pIdLower && curName === pIdLower) || (pNameLower && curName === pNameLower);
    });
  }

  // 3. Slug / normalized match
  if (!found) {
    found = cachedProjectPlans.find(p => {
      const curId = (p.projectId || '').toLowerCase().trim();
      const curName = (p.projectName || '').toLowerCase().trim();
      const curNameClean = curName.replace(/[^a-z0-9]/g, '');
      const curIdClean = curId.replace(/[^a-z0-9]/g, '');

      if (pIdClean && curIdClean === pIdClean) return true;
      if (pIdClean && curNameClean === pIdClean) return true;
      if (pNameClean && curNameClean === pNameClean) return true;
      if (pNameLower && curId === `proj-${pNameLower.replace(/[^a-z0-9]/g, '-')}`) return true;
      if (pIdLower && curId === `proj-${pIdLower.replace(/[^a-z0-9]/g, '-')}`) return true;
      return false;
    });
  }

  // 4. Substring name match (only for names >= 4 characters to prevent false matches on single-letter names like 'R')
  if (!found && (pIdClean.length >= 4 || pNameClean.length >= 4)) {
    found = cachedProjectPlans.find(p => {
      const curName = (p.projectName || '').toLowerCase().trim();
      const curNameClean = curName.replace(/[^a-z0-9]/g, '');
      if (curNameClean.length >= 4) {
        if (pNameClean.length >= 4 && (curNameClean.includes(pNameClean) || pNameClean.includes(curNameClean))) return true;
        if (pIdClean.length >= 4 && (curNameClean.includes(pIdClean) || pIdClean.includes(curNameClean))) return true;
      }
      return false;
    });
  }

  if (found) {
    const isTrial = (found.planType || '').toLowerCase() === 'trial';
    const targetValidity = isTrial ? 7 : 30;
    const targetCredits = isTrial ? 100 : 1000;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const expectedEnd = (found.cycleStartTimestamp || Date.now()) + (targetValidity * ONE_DAY_MS);
    const hasExcessCycle = isTrial && (found.cycleEndTimestamp - found.cycleStartTimestamp > 8 * ONE_DAY_MS);

    if (found.validityDays !== targetValidity || found.allocatedCredits !== targetCredits || hasExcessCycle) {
      return {
        ...found,
        planType: isTrial ? 'Trial' : 'Paid',
        allocatedCredits: targetCredits,
        validityDays: targetValidity,
        cycleEndTimestamp: hasExcessCycle ? expectedEnd : (found.cycleEndTimestamp || expectedEnd),
        cycleEndDateFormatted: hasExcessCycle ? formatToIST(expectedEnd) : (found.cycleEndDateFormatted || formatToIST(found.cycleEndTimestamp || expectedEnd))
      };
    }
    return found;
  }

  // Trigger background fetch if plan is not found in cache
  if (typeof window !== 'undefined') {
    getProjectPlans().catch(() => {});
  }

  // Default initial plan: Paid for default 27/07, Pradee, Healthcare, Indihood, BCK2, Trial for others
  const isDefaultPaid = pNameLower.includes('27/07') || pNameLower.includes('pradee') || pNameLower.includes('healthcare') || pNameLower.includes('indihood') || pNameLower.includes('bck2') || pIdLower.includes('bck2') || pIdLower.includes('3tfgx1rmsntcak6oqa1');
  const planType: PlanType = isDefaultPaid ? 'Paid' : 'Trial';
  const allocatedCredits = isDefaultPaid ? 1000 : 100;
  const validityDays = isDefaultPaid ? 30 : 7;
  const now = Date.now();
  const endTimestamp = now + (validityDays * 24 * 60 * 60 * 1000);

  const defaultPlan: ProjectPlan = {
    projectId: projectId || 'proj-default',
    projectName: (projectName && projectName.trim() && projectName !== '27/07' && projectName !== 'undefined' && projectName !== 'UNDEFINED' && projectName !== 'null') ? projectName.trim() : 'Project - Pradee',
    planType,
    allocatedCredits,
    validityDays,
    cycleStartTimestamp: now - (1 * 24 * 60 * 60 * 1000), // 1 day ago
    cycleStartDateFormatted: formatToIST(now - (1 * 24 * 60 * 60 * 1000)),
    cycleEndTimestamp: endTimestamp,
    cycleEndDateFormatted: formatToIST(endTimestamp),
    status: 'active'
  };

  return defaultPlan;
};

/**
 * Calculates Project-Level Credit Summary adhering strictly to:
 * - Project-level pooling (shared across all project users)
 * - Hard limit: Used Credits = MIN(actual current-cycle consumption, plan credit limit)
 * - Remaining Credits = MAX(plan credit limit - Used Credits, 0)
 * - Historical total consumption preserved separately as Lifetime Consumed
 */
export const getProjectCreditSummary = (
  projectId?: string,
  projectName?: string,
  logsToInspect?: TokenLog[]
): ProjectCreditSummary => {
  const plan = getProjectPlanSync(projectId, projectName);
  const allLogs = logsToInspect || getTokenLogs();

  const pIdLower = (plan.projectId || projectId || '').toLowerCase().trim();
  const pNameLower = (plan.projectName || projectName || '').toLowerCase().trim();

  // All logs belonging to this project (by id, name, slug, or stripped id)
  const projectLogs = allLogs.filter(log => {
    return isLogMatchingProject(log, {
      id: plan.projectId || projectId || '',
      name: plan.projectName || projectName || ''
    } as Project);
  });

  // Logs strictly within the current credit cycle (timestamp >= cycleStartTimestamp)
  const currentCycleLogs = plan.cycleStartTimestamp > 0
    ? projectLogs.filter(l => {
        const logTime = typeof l.timestamp === 'number'
          ? l.timestamp
          : (typeof l.timestamp === 'string' ? new Date(l.timestamp).getTime() : 0);
        return !isNaN(logTime) && logTime >= plan.cycleStartTimestamp;
      })
    : projectLogs;

  // Raw current-cycle consumption
  const actualCurrentCycleRaw = currentCycleLogs.reduce((sum, log) => {
    const c = log.creditsConsumed ?? calculateCreditsConsumed(log.feature, log.itemsGenerated || 1, log.cached);
    return sum + c;
  }, 0);

  // STRICT CAPPING: Never display Used Credits > plan limit (100 for Trial, 1000 for Paid)
  const totalPool = plan.allocatedCredits;
  const usedCredits = Math.min(actualCurrentCycleRaw, totalPool);
  const remainingCredits = Math.max(0, totalPool - usedCredits);
  const percentageUsed = Math.min(100, Number(((usedCredits / totalPool) * 100).toFixed(1)));

  // Historical Lifetime consumption across all cycles (uncapped)
  const historicalLifetimeUsed = projectLogs.reduce((sum, log) => {
    const c = log.creditsConsumed ?? calculateCreditsConsumed(log.feature, log.itemsGenerated || 1, log.cached);
    return sum + c;
  }, 0);

  // Plan validity check
  const now = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const isTrial = (plan.planType || '').toLowerCase() === 'trial';
  const effectiveValidityDays = isTrial ? 7 : 30;
  const expectedCycleEnd = (plan.cycleStartTimestamp || now) + (effectiveValidityDays * ONE_DAY_MS);
  const effectiveCycleEnd = (isTrial && (plan.cycleEndTimestamp - plan.cycleStartTimestamp > 8 * ONE_DAY_MS))
    ? expectedCycleEnd
    : (plan.cycleEndTimestamp || expectedCycleEnd);

  const isExpired = now >= effectiveCycleEnd;
  const msRemaining = Math.max(0, effectiveCycleEnd - now);
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / ONE_DAY_MS));
  const daysElapsed = Math.min(effectiveValidityDays, Math.floor(Math.max(0, now - plan.cycleStartTimestamp) / ONE_DAY_MS) + 1);

  // Hard limit gated check
  const isGated = usedCredits >= totalPool || remainingCredits <= 0 || isExpired;

  // Individual user contribution breakdown for this project
  const userMap = new Map<string, {
    userEmail: string;
    userName: string;
    consumedCredits: number;
    generationsCount: number;
    lifetimeConsumed: number;
    lastActivityTimestamp: number;
  }>();

  // First track current cycle contributions
  currentCycleLogs.forEach(log => {
    const email = (log.userEmail || `${(log.user || 'user').toLowerCase().replace(/\s+/g, '')}@qaoncloud.com`).toLowerCase().trim();
    const name = log.user || email.split('@')[0];
    const c = log.creditsConsumed ?? calculateCreditsConsumed(log.feature, log.itemsGenerated || 1, log.cached);

    const existing = userMap.get(email) || {
      userEmail: email,
      userName: name,
      consumedCredits: 0,
      generationsCount: 0,
      lifetimeConsumed: 0,
      lastActivityTimestamp: log.timestamp || 0
    };

    existing.consumedCredits += c;
    existing.generationsCount += 1;
    if ((log.timestamp || 0) > existing.lastActivityTimestamp) {
      existing.lastActivityTimestamp = log.timestamp || 0;
    }
    userMap.set(email, existing);
  });

  // Then add lifetime counts from all project logs
  projectLogs.forEach(log => {
    const email = (log.userEmail || `${(log.user || 'user').toLowerCase().replace(/\s+/g, '')}@qaoncloud.com`).toLowerCase().trim();
    const name = log.user || email.split('@')[0];
    const c = log.creditsConsumed ?? calculateCreditsConsumed(log.feature, log.itemsGenerated || 1, log.cached);

    const existing = userMap.get(email) || {
      userEmail: email,
      userName: name,
      consumedCredits: 0,
      generationsCount: 0,
      lifetimeConsumed: 0,
      lastActivityTimestamp: log.timestamp || 0
    };

    existing.lifetimeConsumed += c;
    if ((log.timestamp || 0) > existing.lastActivityTimestamp) {
      existing.lastActivityTimestamp = log.timestamp || 0;
    }
    userMap.set(email, existing);
  });

  const rawMembers = Array.from(userMap.values());
  const totalRawCycle = rawMembers.reduce((sum, u) => sum + u.consumedCredits, 0);

  // STRICT CAPPING FOR MEMBERS:
  // 1. For a Trial plan (100 pts) or Paid plan (1,000 pts), no member can ever display > totalPool in the current cycle (e.g. never 150 pts on a 100 pt pool).
  // 2. If the raw cycle sum exceeds totalPool, the current cycle pool (usedCredits) is partitioned among members proportionally.
  // 3. The sum of all member cycle consumptions strictly equals usedCredits (e.g. 100 pts).
  // 4. Lifetime totals remain uncapped to preserve complete historical audit transparency.
  let allocatedSum = 0;
  const memberBreakdown: ProjectMemberCreditContribution[] = rawMembers.map((u, idx) => {
    let cycleConsumed = u.consumedCredits;
    if (totalRawCycle > totalPool && totalRawCycle > 0) {
      if (idx === rawMembers.length - 1) {
        cycleConsumed = Math.max(0, usedCredits - allocatedSum);
      } else {
        cycleConsumed = Math.min(totalPool, Math.round((u.consumedCredits / totalRawCycle) * usedCredits));
        allocatedSum += cycleConsumed;
      }
    } else {
      cycleConsumed = Math.min(u.consumedCredits, totalPool);
    }

    const percentageOfProjectUsed = usedCredits > 0 ? Math.min(100, Math.round((cycleConsumed / usedCredits) * 100)) : 0;

    return {
      userEmail: u.userEmail,
      userName: u.userName,
      consumedCredits: cycleConsumed,
      percentageOfProjectUsed,
      generationsCount: u.generationsCount,
      lifetimeConsumed: u.lifetimeConsumed,
      lastActivity: u.lastActivityTimestamp > 0 ? formatToIST(u.lastActivityTimestamp) : undefined
    };
  });

  const effectiveProjectName = (projectName && projectName.trim() && projectName !== '27/07')
    ? projectName.trim()
    : (plan.projectName && plan.projectName !== '27/07')
    ? plan.projectName
    : (projectName || 'Project - Pradee');

  return {
    projectId: projectId || plan.projectId,
    projectName: effectiveProjectName,
    planType: isTrial ? 'Trial' : 'Paid',
    totalPool,
    validityDays: effectiveValidityDays,
    usedCredits,
    remainingCredits,
    percentageUsed,
    actualCurrentCycleRaw,
    historicalLifetimeUsed,
    isExpired,
    isGated,
    daysRemaining,
    daysElapsed,
    cycleStartTimestamp: plan.cycleStartTimestamp,
    cycleStartDateFormatted: plan.cycleStartDateFormatted,
    cycleEndTimestamp: effectiveCycleEnd,
    cycleEndDateFormatted: formatToIST(effectiveCycleEnd),
    memberBreakdown
  };
};

/**
 * Checks if a project has sufficient remaining credits and valid plan for a feature.
 * Hard limits: Zero over-consumption.
 */
export const checkProjectCreditPermission = (
  projectId?: string,
  featureName?: string,
  projectName?: string
): {
  allowed: boolean;
  reason?: string;
  code?: 'PLAN_EXPIRED' | 'CREDITS_EXHAUSTED' | 'INSUFFICIENT_CREDITS';
  summary: ProjectCreditSummary;
} => {
  const summary = getProjectCreditSummary(projectId, projectName);
  const cost = featureName ? calculateCreditsConsumed(featureName, 1, false) : 0;

  if (summary.isExpired) {
    return {
      allowed: false,
      reason: 'Plan validity expired. Please renew or upgrade your plan.',
      code: 'PLAN_EXPIRED',
      summary
    };
  }

  if (summary.remainingCredits <= 0) {
    return {
      allowed: false,
      reason: 'Credit limit reached. All 100% of credits have been consumed for this project.',
      code: 'CREDITS_EXHAUSTED',
      summary
    };
  }

  if (cost > 0 && summary.remainingCredits < cost) {
    return {
      allowed: false,
      reason: `Insufficient credits. This feature requires ${cost} credits, but only ${summary.remainingCredits} credits remain in the project pool.`,
      code: 'INSUFFICIENT_CREDITS',
      summary
    };
  }

  return {
    allowed: true,
    summary
  };
};

/**
 * Internal helper to update cached project plans accurately and notify UI
 */
export const syncAndUpdateCachedPlans = (
  newPlan: ProjectPlan,
  originalId?: string,
  originalName?: string,
  skipFirestoreSync?: boolean
): ProjectPlan[] => {
  const targetId = (originalId || '').toLowerCase().trim();
  const targetName = (originalName || '').toLowerCase().trim();
  const newId = (newPlan.projectId || '').toLowerCase().trim();
  const newName = (newPlan.projectName || '').toLowerCase().trim();
  const targetNameClean = targetName.replace(/[^a-z0-9]/g, '');
  const newNameClean = newName.replace(/[^a-z0-9]/g, '');

  let matched = false;
  const updated = cachedProjectPlans.map(p => {
    const curId = (p.projectId || '').toLowerCase().trim();
    const curName = (p.projectName || '').toLowerCase().trim();
    const curNameClean = curName.replace(/[^a-z0-9]/g, '');
    if (
      (newId && curId === newId) ||
      (newName && curName === newName) ||
      (targetId && (curId === targetId || curName === targetId)) ||
      (targetName && (curName === targetName || curId === targetName)) ||
      (targetNameClean && curNameClean === targetNameClean) ||
      (newNameClean && curNameClean === newNameClean)
    ) {
      matched = true;
      const isExistingPaid = p.planType === 'Paid' || (p.allocatedCredits && p.allocatedCredits >= 1000);
      const isNewPlanTrial = newPlan.planType === 'Trial' || (!newPlan.allocatedCredits || newPlan.allocatedCredits < 1000);

      if (isExistingPaid && isNewPlanTrial) {
        return {
          ...p,
          ...newPlan,
          planType: 'Paid' as PlanType,
          creditPlan: 'paid' as any,
          allocatedCredits: Math.max(p.allocatedCredits || 1000, 1000),
          totalCredits: Math.max(p.totalCredits || 1000, 1000),
          validityDays: Math.max(p.validityDays || 30, 30),
          remainingCredits: Math.max(0, 1000 - (newPlan.consumedCredits ?? p.consumedCredits ?? 0))
        };
      }
      return newPlan;
    }
    return p;
  });

  if (!matched) {
    updated.push(newPlan);
  }

  // Deduplicate by normalized ID and Name
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const deduped: ProjectPlan[] = [];
  for (const p of updated) {
    const idKey = (p.projectId || '').toLowerCase().trim();
    const nameKey = (p.projectName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    if (idKey && seenIds.has(idKey)) continue;
    if (nameKey && seenNames.has(nameKey)) continue;
    if (idKey) seenIds.add(idKey);
    if (nameKey) seenNames.add(nameKey);
    deduped.push(p);
  }

  cachedProjectPlans = deduped;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('automatiqa_project_plans', JSON.stringify(deduped));
      window.dispatchEvent(new CustomEvent('project-plan-updated', { detail: newPlan }));

      // Sync updated plan to Firestore so all connected clients receive the snapshot immediately
      if (!skipFirestoreSync && db && newPlan.projectId) {
        syncSetDoc(doc(db, 'project_plans', newPlan.projectId), newPlan, { merge: true, timeoutMs: 30000 }).catch(() => {});
      }
    } catch (e) {}
  }

  return deduped;
};

/**
 * Renews a project's credit cycle:
 * - Starts a NEW credit cycle (Used Credits = 0, Remaining = 100 or 1,000)
 * - Historical consumption logs are preserved (never deleted)
 * - Sets new start date to now, end date to now + validityDays
 */
export const approveSubscriptionRequestsForProject = async (
  projectId: string,
  projectName?: string,
  adminEmail: string = 'automatiqa@qaoncloud.com',
  requestId?: string,
  grantedCredits: number = 1000,
  validityDays: number = 30
): Promise<void> => {
  const now = Date.now();
  const pIdLower = (projectId || '').toLowerCase().trim();
  const pNameLower = (projectName || '').toLowerCase().trim();

  try {
    const rawSubs = localStorage.getItem('automatiqa_subscription_requests');
    if (rawSubs) {
      const subs = JSON.parse(rawSubs);
      if (Array.isArray(subs)) {
        let changed = false;
        const modified = subs.map((s: any) => {
          const sProjId = (s.projectId || '').toLowerCase().trim();
          const sProjName = (s.projectName || '').toLowerCase().trim();
          const sId = (s.id || '').toLowerCase().trim();
          const matches = (requestId && sId === requestId.toLowerCase().trim()) ||
            (pIdLower && sProjId === pIdLower) ||
            (pNameLower && sProjName === pNameLower) ||
            (pIdLower && sProjName === pIdLower) ||
            (pNameLower && sProjId === pNameLower);

          if (matches && (s.status === 'PENDING' || s.status === 'pending')) {
            changed = true;
            const updated = {
              ...s,
              status: 'APPROVED' as const,
              approvedAt: now,
              approvedAtFormatted: formatToIST(now),
              approvedBy: adminEmail,
              creditsGranted: grantedCredits,
              validityDays: validityDays
            };
            try {
              if (s.id) {
                syncSetDoc(doc(db, "subscription_requests", s.id), updated, { merge: true }).catch(() => {});
              }
            } catch (err) {}
            return updated;
          }
          return s;
        });

        if (changed) {
          localStorage.setItem('automatiqa_subscription_requests', JSON.stringify(modified));
          window.dispatchEvent(new CustomEvent('subscription-request-updated', { detail: modified }));
        }
      }
    }
  } catch (e) {
    console.warn('[tokenConsumptionService] Error approving subscription requests for project:', e);
  }
};

export const renewProjectPlanCycle = async (
  projectId: string,
  adminEmail?: string,
  projectName?: string
): Promise<ProjectPlan> => {
  const now = Date.now();
  const currentPlan = getProjectPlanSync(projectId, projectName);
  const planType = currentPlan.planType || 'Paid';
  const config = PLAN_CONFIGS[planType] || PLAN_CONFIGS.Paid;
  const endTimestamp = now + (config.validityDays * 24 * 60 * 60 * 1000);

  const localUpdated: ProjectPlan = {
    ...currentPlan,
    projectId: currentPlan.projectId || projectId,
    projectName: currentPlan.projectName || projectName || 'Project',
    planType,
    creditPlan: planType.toLowerCase() as any,
    allocatedCredits: config.totalCredits,
    totalCredits: config.totalCredits,
    remainingCredits: config.totalCredits,
    consumedCredits: 0,
    validityDays: config.validityDays,
    cycleStartTimestamp: now,
    subscriptionStartDate: now,
    cycleStartDateFormatted: formatToIST(now),
    cycleEndTimestamp: endTimestamp,
    subscriptionExpiryDate: endTimestamp,
    cycleEndDateFormatted: formatToIST(endTimestamp),
    status: 'active',
    subscriptionStatus: 'active',
    subscriptionRequestStatus: 'none',
    lastRenewedAt: now,
    lastRenewedBy: adminEmail || 'Admin'
  };

  // 1. Synchronously update local cache so UI resets immediately
  syncAndUpdateCachedPlans(localUpdated, projectId, projectName);
  approveSubscriptionRequestsForProject(projectId, projectName, adminEmail || 'Admin', undefined, config.totalCredits, config.validityDays);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: { projectId, projectReset: true } }));
    window.dispatchEvent(new CustomEvent('project-plan-updated', { detail: localUpdated }));
  }

  // 2. Call backend endpoint asynchronously
  try {
    const res = await fetch(`/api/credits/project-plan/${encodeURIComponent(projectId)}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail, projectName })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.plan) {
        syncAndUpdateCachedPlans(data.plan, projectId, projectName);
        return data.plan;
      }
    }
  } catch (err) {
    console.warn('[tokenConsumptionService] Backend renew failed, using local update:', err);
  }

  return localUpdated;
};

export const switchProjectPlan = async (
  projectId: string,
  newPlanType: PlanType,
  adminEmail?: string,
  projectName?: string
): Promise<ProjectPlan> => {
  const config = PLAN_CONFIGS[newPlanType] || PLAN_CONFIGS.Paid;
  const now = Date.now();
  const endTimestamp = now + (config.validityDays * 24 * 60 * 60 * 1000);
  const currentPlan = getProjectPlanSync(projectId, projectName);

  const localUpdated: ProjectPlan = {
    ...currentPlan,
    projectId: currentPlan.projectId || projectId,
    projectName: currentPlan.projectName || projectName || 'Project',
    planType: newPlanType,
    creditPlan: newPlanType.toLowerCase() as any,
    allocatedCredits: config.totalCredits,
    totalCredits: config.totalCredits,
    remainingCredits: config.totalCredits,
    consumedCredits: 0,
    validityDays: config.validityDays,
    cycleStartTimestamp: now,
    subscriptionStartDate: now,
    cycleStartDateFormatted: formatToIST(now),
    cycleEndTimestamp: endTimestamp,
    subscriptionExpiryDate: endTimestamp,
    cycleEndDateFormatted: formatToIST(endTimestamp),
    status: 'active',
    subscriptionStatus: 'active',
    subscriptionRequestStatus: 'none',
    lastRenewedAt: now,
    lastRenewedBy: adminEmail || 'Admin'
  };

  syncAndUpdateCachedPlans(localUpdated, projectId, projectName);
  approveSubscriptionRequestsForProject(projectId, projectName, adminEmail || 'Admin', undefined, config.totalCredits, config.validityDays);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: { projectId, projectReset: true } }));
    window.dispatchEvent(new CustomEvent('project-plan-updated', { detail: localUpdated }));
  }

  try {
    const res = await fetch(`/api/credits/project-plan/${encodeURIComponent(projectId)}/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType: newPlanType, adminEmail, projectName })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.plan) {
        syncAndUpdateCachedPlans(data.plan, projectId, projectName);
        return data.plan;
      }
    }
  } catch (err: any) {
    console.warn('[tokenConsumptionService] Backend switch plan failed, using local update:', err);
  }

  return localUpdated;
};

export const reEnableProjectPlanBySuperAdmin = async (
  projectId: string,
  projectName?: string,
  adminEmail: string = 'automatiqa@qaoncloud.com',
  planType: PlanType = 'Paid',
  requestId?: string
): Promise<ProjectPlan> => {
  const config = PLAN_CONFIGS[planType] || PLAN_CONFIGS.Paid;
  const now = Date.now();
  const endTimestamp = now + (config.validityDays * 24 * 60 * 60 * 1000);
  const currentPlan = getProjectPlanSync(projectId, projectName);

  const localUpdated: ProjectPlan = {
    ...currentPlan,
    projectId: currentPlan.projectId || projectId,
    projectName: currentPlan.projectName || projectName || 'Project',
    planType,
    creditPlan: planType.toLowerCase() as any,
    allocatedCredits: config.totalCredits,
    totalCredits: config.totalCredits,
    remainingCredits: config.totalCredits,
    consumedCredits: 0,
    validityDays: config.validityDays,
    cycleStartTimestamp: now,
    subscriptionStartDate: now,
    cycleStartDateFormatted: formatToIST(now),
    cycleEndTimestamp: endTimestamp,
    subscriptionExpiryDate: endTimestamp,
    cycleEndDateFormatted: formatToIST(endTimestamp),
    status: 'active',
    subscriptionStatus: 'active',
    subscriptionRequestStatus: 'none',
    lastRenewedAt: now,
    lastRenewedBy: adminEmail || 'Super Admin'
  };

  // 1. Sync locally FIRST for zero latency
  syncAndUpdateCachedPlans(localUpdated, projectId, projectName);
  approveSubscriptionRequestsForProject(projectId, projectName, adminEmail, requestId, config.totalCredits, config.validityDays);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: { projectId, projectReset: true } }));
    window.dispatchEvent(new CustomEvent('project-plan-updated', { detail: localUpdated }));
  }

  // 2. Call backend endpoints
  try {
    const res = await fetch(`/api/credits/project-plan/${encodeURIComponent(projectId)}/approve-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminEmail, adminName: 'Super Admin', projectName })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.plan) {
        syncAndUpdateCachedPlans(data.plan, projectId, projectName);
      }
    }
  } catch (err) {
    console.warn('[tokenConsumptionService] Backend approve-subscription warning:', err);
  }

  try {
    const res = await fetch(`/api/credits/project-plan/${encodeURIComponent(projectId)}/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType, adminEmail, projectName })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.plan) {
        syncAndUpdateCachedPlans(data.plan, projectId, projectName);
      }
    }
  } catch (err) {
    console.warn('[tokenConsumptionService] Backend switch plan warning:', err);
  }

  return localUpdated;
};


