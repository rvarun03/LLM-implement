import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { PlanType, ProjectPlan, ProjectCreditSummary, TokenLog, User } from '../types';
import { toast } from 'sonner';
import { getProjectCreditSummary, getProjectPlanSync, syncAndUpdateCachedPlans, addTokenLog } from './tokenConsumptionService';
import { safeFetchJson } from './apiUtils';

export type CreditActionType = 'analysis' | 'export' | 'copy' | 'download' | string;

export const TRIAL_PLAN = {
  totalCredits: 100,

  AI_USER_STORIES: {
    analysis: 5,
    downloadCopy: 20
  },

  AI_TEST_SCENARIO: {
    analysis: 10,
    downloadCopy: 20
  },

  AI_TEST_CASES: {
    analysis: 20,
    downloadCopy: 20
  },

  AUTOMATION_SCRIPT_GENERATOR: {
    analysis: 50,
    downloadCopy: 50
  },

  RECORD_PLAY_WEB: {
    analysis: 100,
    downloadCopy: 50
  },

  RECORD_PLAY_MOBILE: {
    analysis: 100,
    downloadCopy: 50
  },

  UI_TESTING: {
    analysis: 50,
    downloadCopy: 50
  },

  API_TESTING: {
    analysis: 50,
    folderDownload: 50
  },

  API_PERFORMANCE_TESTING: {
    analysis: 100,
    reportGeneration: 50
  },

  WEB_PERFORMANCE_TESTING: {
    analysis: 100,
    downloadCopy: 50
  }
};

export const PAID_PLAN = {
  totalCredits: 1000,

  AI_USER_STORIES: {
    analysis: 5,
    downloadCopy: 10
  },

  AI_TEST_SCENARIO: {
    analysis: 10,
    downloadCopy: 20
  },

  AI_TEST_CASES: {
    analysis: 20,
    downloadCopy: 20
  },

  AUTOMATION_SCRIPT_GENERATOR: {
    analysis: 50,
    downloadCopy: 50
  },

  RECORD_PLAY_WEB: {
    analysis: 100,
    downloadCopy: 50
  },

  RECORD_PLAY_MOBILE: {
    analysis: 100,
    downloadCopy: 50
  },

  UI_TESTING: {
    analysis: 50,
    downloadCopy: 50
  },

  API_TESTING: {
    analysis: 50,
    folderDownload: 50
  },

  API_PERFORMANCE_TESTING: {
    analysis: 100,
    reportGeneration: 50
  },

  WEB_PERFORMANCE_TESTING: {
    analysis: 100,
    downloadCopy: 50
  }
};

export interface FeatureCreditRule {
  featureKey: string;
  displayName: string;
  trial: {
    analysis: number;
    export: number;
  };
  paid: {
    analysis: number;
    export: number;
  };
  description: string;
}

/**
 * Centralized credit configuration for all 10 AutomatiQA modules.
 * Strictly adheres to the project-level credit specifications:
 * 
 * Feature                                | Trial Analysis | Trial Export | Paid Analysis | Paid Export
 * 1. AI User Stories Generation          | 5              | 20           | 5             | 10
 * 2. AI Test Scenario Generation         | 10             | 20           | 10            | 20
 * 3. AI Test Cases Generation            | 20             | 20           | 20            | 20
 * 4. Automation - Script Generator       | 50             | 50           | 50            | 50
 * 5. Automation - Record & Play - Web App| 100            | 50           | 100           | 50
 * 6. Automation - Record & Play - Mobile | 100            | 50           | 100           | 50
 * 7. UI Testing                          | 50             | 50           | 50            | 50
 * 8. API Testing                         | 50             | 50           | 50            | 50
 * 9. API Performance Testing             | 100            | 50           | 100           | 50
 * 10. Web Performance Testing            | 100            | 50           | 100           | 50
 */
export const FEATURE_CREDIT_RULES: Record<string, FeatureCreditRule> = {
  ai_user_stories: {
    featureKey: 'ai_user_stories',
    displayName: 'AI User stories generation',
    trial: { analysis: 5, export: 20 },
    paid: { analysis: 5, export: 10 },
    description: 'Generate User Stories from requirements, BRD, or wireframes. Export/copy to Jira or CSV.'
  },
  ai_scenarios: {
    featureKey: 'ai_scenarios',
    displayName: 'AI Test Scenario generation',
    trial: { analysis: 10, export: 20 },
    paid: { analysis: 10, export: 20 },
    description: 'Synthesize end-to-end user scenarios from user stories or specifications. Copy/export scenarios.'
  },
  ai_test_cases: {
    featureKey: 'ai_test_cases',
    displayName: 'AI Test Cases generation',
    trial: { analysis: 20, export: 20 },
    paid: { analysis: 20, export: 20 },
    description: 'Generate complete step-by-step test cases with preconditions and assertions. Copy/export test cases.'
  },
  automation_script: {
    featureKey: 'automation_script',
    displayName: 'Automation - script generator',
    trial: { analysis: 50, export: 50 },
    paid: { analysis: 50, export: 50 },
    description: 'Generate Page Object Model (POM) Playwright/Selenium/Cypress test automation scripts. Copy/export/push to Git.'
  },
  record_play_web: {
    featureKey: 'record_play_web',
    displayName: 'Automation - Record and play - Web app',
    trial: { analysis: 100, export: 50 },
    paid: { analysis: 100, export: 50 },
    description: 'Record user interactions on Web browser, generate automation scripts and assertions. Export/download scripts.'
  },
  record_play_video_analysis: {
    featureKey: 'record_play_video_analysis',
    displayName: 'Automation - Record and play - Video Analysis',
    trial: { analysis: 0, export: 0 },
    paid: { analysis: 0, export: 0 },
    description: 'Visual action detection from recorded walkthrough video. Upload video and analysis costs 0 credits.'
  },
  record_play_mobile: {
    featureKey: 'record_play_mobile',
    displayName: 'Automation - Record and play - Mobile app',
    trial: { analysis: 100, export: 50 },
    paid: { analysis: 100, export: 50 },
    description: 'Record mobile touch events, gestures, and screens, generate Appium scripts. Export/download mobile test package.'
  },
  ui_testing: {
    featureKey: 'ui_testing',
    displayName: 'UI testing',
    trial: { analysis: 50, export: 50 },
    paid: { analysis: 50, export: 50 },
    description: 'AI visual regression audit, Figma design-to-code comparison, and WCAG accessibility analysis. Export UI report.'
  },
  api_testing: {
    featureKey: 'api_testing',
    displayName: 'API testing',
    trial: { analysis: 50, export: 50 },
    paid: { analysis: 50, export: 50 },
    description: 'Generate REST API test suites, boundary validations, and response schemas from OpenAPI/cURL. Export test collection.'
  },
  api_performance: {
    featureKey: 'api_performance',
    displayName: 'API performance testing',
    trial: { analysis: 100, export: 50 },
    paid: { analysis: 100, export: 50 },
    description: 'Generate Apache JMeter JMX load test scripts and benchmark API response times. Export JMX/performance reports.'
  },
  web_performance: {
    featureKey: 'web_performance',
    displayName: 'Web performance testing',
    trial: { analysis: 100, export: 50 },
    paid: { analysis: 100, export: 50 },
    description: 'Lighthouse Core Web Vitals audit, speed index, performance bottleneck breakdown. Export performance PDF/CSV.'
  }
};

/**
 * Normalizes any input feature name or key into a canonical FeatureCreditRule
 */
export const normalizeFeatureRule = (featureKeyOrName: string): FeatureCreditRule => {
  if (!featureKeyOrName) return FEATURE_CREDIT_RULES.ai_test_cases;
  const lower = featureKeyOrName.toLowerCase().trim();

  if (FEATURE_CREDIT_RULES[lower]) {
    return FEATURE_CREDIT_RULES[lower];
  }

  // Exact display name matches
  for (const rule of Object.values(FEATURE_CREDIT_RULES)) {
    if (rule.displayName.toLowerCase() === lower) {
      return rule;
    }
  }

  // Fuzzy matches
  if (lower.includes('video analysis') || lower.includes('detectvideo') || lower.includes('videowalkthrough') || (lower.includes('upload') && lower.includes('video'))) {
    return FEATURE_CREDIT_RULES.record_play_video_analysis;
  }
  if (lower.includes('mobile') || lower.includes('appium')) {
    return FEATURE_CREDIT_RULES.record_play_mobile;
  }
  if (lower.includes('record') && lower.includes('web')) {
    return FEATURE_CREDIT_RULES.record_play_web;
  }
  if (lower.includes('user_stories') || lower.includes('user_story') || lower.includes('user stor') || lower.includes('story') || lower.includes('stories')) {
    return FEATURE_CREDIT_RULES.ai_user_stories;
  }
  if (lower.includes('scenario')) {
    return FEATURE_CREDIT_RULES.ai_scenarios;
  }
  if (lower.includes('script') && !lower.includes('jmeter')) {
    return FEATURE_CREDIT_RULES.automation_script;
  }
  if (lower.includes('ui test') || lower.includes('figma') || lower.includes('visual')) {
    return FEATURE_CREDIT_RULES.ui_testing;
  }
  if (lower.includes('api perf') || lower.includes('jmeter')) {
    return FEATURE_CREDIT_RULES.api_performance;
  }
  if (lower.includes('api')) {
    return FEATURE_CREDIT_RULES.api_testing;
  }
  if (lower.includes('web perf') || lower.includes('lighthouse')) {
    return FEATURE_CREDIT_RULES.web_performance;
  }
  if (lower.includes('test case') || lower.includes('case')) {
    return FEATURE_CREDIT_RULES.ai_test_cases;
  }

  return FEATURE_CREDIT_RULES.ai_test_cases;
};

/**
 * Returns the exact credit deduction cost for a given feature, action, and plan.
 */
export const getCreditCost = (
  featureKeyOrName: string,
  actionType: CreditActionType = 'analysis',
  planType: PlanType = 'Trial'
): number => {
  const rule = normalizeFeatureRule(featureKeyOrName);
  const planRates = planType === 'Paid' ? rule.paid : rule.trial;
  const normAction = (actionType || '').toLowerCase().trim();
  const isExport = normAction === 'export' || normAction === 'download' || normAction === 'copy' || normAction === 'csv' || normAction === 'excel' || normAction === 'xlsx';
  return isExport ? planRates.export : planRates.analysis;
};

export interface CheckPermissionResult {
  allowed: boolean;
  reason?: string;
  code?: 'PLAN_EXPIRED' | 'CREDITS_EXHAUSTED' | 'INSUFFICIENT_CREDITS' | 'OK';
  cost: number;
  remainingCredits: number;
  plan: ProjectPlan;
}

/**
 * Checks whether a project has active validity and sufficient credits to execute the action.
 * Calls server-side validation to avoid stale client cache, with reliable local fallback.
 */
export const canPerformAction = async (
  projectId: string,
  featureKeyOrName: string,
  actionType: CreditActionType = 'analysis',
  projectName?: string
): Promise<CheckPermissionResult> => {
  const localPlan = getProjectPlanSync(projectId, projectName);
  const localCheck = canPerformActionLocal(projectId, featureKeyOrName, actionType, projectName);

  try {
    const parsed = await safeFetchJson<any>('/api/credits/check-permission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        projectName,
        featureKey: featureKeyOrName,
        actionType,
        planType: localPlan?.planType
      })
    });

    if (parsed.ok && parsed.data) {
      const data = parsed.data;
      if (data.plan) {
        syncAndUpdateCachedPlans(data.plan, projectId, projectName);
      }
      return {
        allowed: !!data.allowed,
        reason: data.reason,
        code: data.code,
        cost: data.cost ?? getCreditCost(featureKeyOrName, actionType, localPlan?.planType || 'Paid'),
        remainingCredits: data.remainingCredits ?? localCheck.remainingCredits,
        plan: data.plan || localPlan
      };
    } else {
      // If server returned a business rule rejection with valid parsed error JSON
      if (parsed.data && parsed.data.allowed === false && parsed.data.code && parsed.data.code !== 'INTERNAL_ERROR') {
        return {
          allowed: false,
          reason: parsed.data.error || parsed.data.reason || 'Insufficient credits.',
          code: parsed.data.code,
          cost: parsed.data.cost || getCreditCost(featureKeyOrName, actionType, localPlan?.planType || 'Paid'),
          remainingCredits: parsed.data.remainingCredits ?? localCheck.remainingCredits,
          plan: parsed.data.plan || localPlan
        };
      }
      // If server returned 403 HTML, 500, network error, or timeout, evaluate locally
      console.warn('[creditService] Server check non-OK, evaluating locally:', parsed.error);
      return localCheck;
    }
  } catch (err) {
    // Network or server fallback check
    console.warn('[creditService] Server check failed, evaluating locally:', err);
    return localCheck;
  }
};

/**
 * Local fallback for check permission
 */
export const canPerformActionLocal = (
  projectId: string,
  featureKeyOrName: string,
  actionType: CreditActionType = 'analysis',
  projectName?: string
): CheckPermissionResult => {
  const plan = getProjectPlanSync(projectId, projectName);
  const cost = getCreditCost(featureKeyOrName, actionType, plan.planType);
  const projectSummary = getProjectCreditSummary(projectId, projectName);

  if (projectSummary.isExpired) {
    return {
      allowed: false,
      reason: 'Plan validity expired for this project. Please subscribe or renew your plan.',
      code: 'PLAN_EXPIRED',
      cost,
      remainingCredits: projectSummary.remainingCredits,
      plan
    };
  }

  // If remaining credits are available to perform this particular AI operation, allow it!
  if (projectSummary.remainingCredits >= cost) {
    return {
      allowed: true,
      code: 'OK',
      cost,
      remainingCredits: projectSummary.remainingCredits,
      plan
    };
  }

  // Otherwise, display insufficient credits message
  return {
    allowed: false,
    reason: `Insufficient credits. This action requires ${cost} credits, but only ${projectSummary.remainingCredits} credits remain in the project pool (${projectSummary.planType} plan).`,
    code: 'INSUFFICIENT_CREDITS',
    cost,
    remainingCredits: projectSummary.remainingCredits,
    plan
  };
};

export interface DeductCreditsResult {
  success: boolean;
  deducted: number;
  remainingCredits: number;
  logRecord?: any;
  plan?: ProjectPlan;
  error?: string;
  code?: string;
}

/**
 * Local deduction fallback when server is unreachable or experiences network hiccups
 */
export const deductProjectCreditsLocal = (
  projectId: string,
  featureKeyOrName: string,
  actionType: CreditActionType = 'analysis',
  userDetails?: {
    name?: string;
    email?: string;
    workspace?: string;
  },
  metadata?: {
    projectName?: string;
    userStoryId?: string;
    details?: string;
    outputType?: string;
    inputCount?: number;
    planType?: PlanType;
  }
): DeductCreditsResult => {
  const plan = getProjectPlanSync(projectId, metadata?.projectName);
  const effectivePlanType = metadata?.planType || plan.planType || 'Paid';
  const cost = getCreditCost(featureKeyOrName, actionType, effectivePlanType);
  const currentUsed = plan.consumedCredits ?? 0;
  const newUsed = Math.min(plan.allocatedCredits, currentUsed + cost);
  const newRemaining = Math.max(0, plan.allocatedCredits - newUsed);

  const updatedPlan: ProjectPlan = {
    ...plan,
    planType: effectivePlanType,
    consumedCredits: newUsed,
    remainingCredits: newRemaining,
    status: newRemaining <= 0 ? 'exhausted' : 'active',
    subscriptionStatus: newRemaining <= 0 ? 'exhausted' : 'active'
  };

  syncAndUpdateCachedPlans(updatedPlan, projectId, metadata?.projectName);

  const logRecord = {
    id: `log-local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    feature: featureKeyOrName,
    actionType: (actionType === 'copy' || actionType === 'download' || actionType === 'export') ? 'export' : 'analysis',
    creditsConsumed: cost,
    creditsRemaining: newRemaining,
    remainingCredits: newRemaining,
    userName: userDetails?.name || 'User',
    userEmail: userDetails?.email || 'user@qaoncloud.com',
    workspace: userDetails?.workspace || 'AutomatiQA Workspace',
    projectName: plan.projectName,
    projectId: plan.projectId,
    userStoryId: metadata?.userStoryId,
    timestamp: Date.now(),
    dateTimeIST: formatToIST(Date.now()),
    dateIST: formatToIST(Date.now()).split(' ')[0],
    timeIST: formatToIST(Date.now()).split(' ').slice(1).join(' '),
    costUsd: 0,
    itemsGenerated: 1,
    details: metadata?.details || metadata?.outputType || `${featureKeyOrName} (${actionType})`
  };

  try {
    addTokenLog(logRecord as any);
  } catch (e) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: logRecord }));
    window.dispatchEvent(new CustomEvent('project-plan-updated', { detail: updatedPlan }));
  }

  return {
    success: true,
    deducted: cost,
    remainingCredits: newRemaining,
    logRecord,
    plan: updatedPlan
  };
};

/**
 * Atomically deducts project credits server-side and logs the consumption.
 * Ensures multi-user project pooling, zero over-consumption, and real-time updates.
 */
export const deductProjectCredits = async (
  projectId: string,
  featureKeyOrName: string,
  actionType: CreditActionType,
  userDetails: {
    name?: string;
    email?: string;
    workspace?: string;
  },
  metadata?: {
    projectName?: string;
    userStoryId?: string;
    details?: string;
    outputType?: string;
    inputCount?: number;
    planType?: PlanType;
  }
): Promise<DeductCreditsResult> => {
  const localPlan = getProjectPlanSync(projectId, metadata?.projectName);
  const effectivePlanType = metadata?.planType || localPlan?.planType || 'Paid';

  try {
    const parsed = await safeFetchJson<any>('/api/credits/deduct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        projectName: metadata?.projectName,
        featureKey: featureKeyOrName,
        actionType,
        userDetails,
        metadata,
        planType: effectivePlanType
      })
    });

    if (parsed.ok && parsed.data?.success) {
      const data = parsed.data;
      if (data.plan) {
        syncAndUpdateCachedPlans(data.plan, projectId, metadata?.projectName);
      }
      // Broadcast update event to all UI listeners across the app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: data.logRecord }));
        window.dispatchEvent(new CustomEvent('project-plan-updated', { detail: data.plan }));
      }
      return {
        success: true,
        deducted: data.deducted || 0,
        remainingCredits: data.remainingCredits ?? 0,
        logRecord: data.logRecord,
        plan: data.plan
      };
    } else {
      console.warn('[creditService] Server deduct returned non-success, deducting locally:', parsed.error || parsed.data?.error);
      return deductProjectCreditsLocal(projectId, featureKeyOrName, actionType, userDetails, metadata);
    }
  } catch (err: any) {
    console.error('[creditService] Server deduction error, deducting locally:', err);
    return deductProjectCreditsLocal(projectId, featureKeyOrName, actionType, userDetails, metadata);
  }
};

/**
 * Convenient helper to validate credit permission and deduct export/download/copy credits.
 * Shows feedback toasts automatically and returns true if deduction succeeded, false if blocked.
 */
export const deductExportCredits = async (
  projectId: string,
  featureKey: string,
  user?: { name?: string; email?: string } | null,
  outputType: string = 'Export / Download',
  projectName?: string
): Promise<boolean> => {
  const name = user?.name || (typeof window !== 'undefined' ? (localStorage.getItem('automatiqa_user_name') || 'User') : 'User');
  const email = user?.email || (typeof window !== 'undefined' ? (localStorage.getItem('automatiqa_user_email') || 'user@qaoncloud.com') : 'user@qaoncloud.com');
  
  const lowerOutput = (outputType || '').toLowerCase();
  const effectiveActionType = (lowerOutput.includes('copy') || lowerOutput.includes('snippet')) ? 'copy'
    : lowerOutput.includes('download') ? 'download'
    : 'export';

  const check = canPerformActionLocal(projectId || 'proj-default', featureKey, effectiveActionType, projectName);
  const plan = getProjectPlanSync(projectId, projectName);
  const isPaid = plan?.planType === 'Paid' || plan?.allocatedCredits >= 1000;

  // Block action if credit validation fails
  if (!check.allowed) {
    toast.error(check.reason || `Action not allowed. ${outputType} is blocked due to insufficient credits or expired plan.`);
    return false;
  }

  try {
    const res = await deductProjectCredits(
      projectId || 'proj-default',
      featureKey,
      effectiveActionType,
      { name, email },
      { projectName, outputType }
    );

    if (res.success) {
      toast.success(`${outputType} successful! ${res.deducted} credits deducted. Remaining: ${res.remainingCredits}`);
    } else {
      console.warn(`[creditService] Export credit notice:`, res.error);
    }
    return true;
  } catch (err: any) {
    console.warn(`[creditService] Export error:`, err);
    return true;
  }
};

/**
 * Formats timestamps to Asia/Kolkata (IST)
 */
export const formatToIST = (timestamp: number = Date.now()): string => {
  const dateObj = new Date(timestamp);
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
