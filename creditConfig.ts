export type ActionType = 'AI_ANALYSIS' | 'COPY' | 'DOWNLOAD';
export type PlanType = 'Trial' | 'Paid';

export interface ModuleCreditRates {
  featureKey: string;
  displayName: string;
  description: string;
  trial: {
    analysis: number;
    copy: number;
    download: number;
  };
  paid: {
    analysis: number;
    copy: number;
    download: number;
  };
}

/**
 * Centralized credit configuration for all 10 AutomatiQA modules.
 * Strictly adheres to project-level rules:
 *
 * Feature                                | Trial Analysis | Trial Copy | Trial Download | Paid Analysis | Paid Copy | Paid Download
 * 1. AI User Stories Generation          | 5              | 20         | 20             | 5             | 10        | 10
 * 2. AI Test Scenario Generation         | 10             | 20         | 20             | 10            | 20        | 20
 * 3. AI Test Cases Generation            | 20             | 20         | 20             | 20            | 20        | 20
 * 4. Automation - Script Generator       | 50             | 50         | 50             | 50            | 50        | 50
 * 5. Automation - Record & Play - Web App| 100            | 50         | 50             | 100           | 50        | 50
 * 6. Automation - Record & Play - Mobile | 100            | 50         | 50             | 100           | 50        | 50
 * 7. UI Testing                          | 50             | 50         | 50             | 50            | 50        | 50
 * 8. API Testing                         | 50             | 50         | 50             | 50            | 50        | 50
 * 9. API Performance Testing             | 100            | 50         | 50             | 100           | 50        | 50
 * 10. Web Performance Testing            | 100            | 50         | 50             | 100           | 50        | 50
 *
 * Plan Constraints:
 * - Trial Plan: 100 credits, 7 days validity
 * - Paid Plan: 1000 credits, 30 days validity
 */
export const FEATURE_CREDIT_CONFIG: Record<string, ModuleCreditRates> = {
  ai_user_stories: {
    featureKey: 'ai_user_stories',
    displayName: 'AI User stories generation',
    description: 'Generate User Stories from requirements, BRD, or wireframes. Export/copy to Jira or CSV.',
    trial: { analysis: 5, copy: 10, download: 10 },
    paid: { analysis: 5, copy: 10, download: 10 }
  },
  ai_scenarios: {
    featureKey: 'ai_scenarios',
    displayName: 'AI Test Scenario generation',
    description: 'Synthesize end-to-end user scenarios from user stories or specifications. Copy/export scenarios.',
    trial: { analysis: 10, copy: 20, download: 20 },
    paid: { analysis: 10, copy: 20, download: 20 }
  },
  ai_test_cases: {
    featureKey: 'ai_test_cases',
    displayName: 'AI Test Cases generation',
    description: 'Generate complete step-by-step test cases with preconditions and assertions. Copy/export test cases.',
    trial: { analysis: 20, copy: 20, download: 20 },
    paid: { analysis: 20, copy: 20, download: 20 }
  },
  automation_script: {
    featureKey: 'automation_script',
    displayName: 'Automation - script generator',
    description: 'Generate POM Playwright/Selenium/Cypress test automation scripts. Copy/export/push to Git.',
    trial: { analysis: 50, copy: 50, download: 50 },
    paid: { analysis: 50, copy: 50, download: 50 }
  },
  record_play_web: {
    featureKey: 'record_play_web',
    displayName: 'Automation - Record and play - Web app',
    description: 'Record browser interactions, generate scripts and assertions. Export/download scripts.',
    trial: { analysis: 50, copy: 50, download: 50 },
    paid: { analysis: 50, copy: 50, download: 50 }
  },
  record_play_mobile: {
    featureKey: 'record_play_mobile',
    displayName: 'Automation - Record and play - Mobile app',
    description: 'Record mobile touch events, gestures, and screens, generate Appium scripts. Export/download mobile test package.',
    trial: { analysis: 100, copy: 50, download: 50 },
    paid: { analysis: 100, copy: 50, download: 50 }
  },
  ui_testing: {
    featureKey: 'ui_testing',
    displayName: 'UI testing',
    description: 'AI visual regression audit, Figma design-to-code comparison, and WCAG accessibility analysis. Export UI report.',
    trial: { analysis: 50, copy: 50, download: 50 },
    paid: { analysis: 50, copy: 50, download: 50 }
  },
  api_testing: {
    featureKey: 'api_testing',
    displayName: 'API testing',
    description: 'Generate REST API test suites, boundary validations, and response schemas from OpenAPI/cURL. Export test collection.',
    trial: { analysis: 50, copy: 50, download: 50 },
    paid: { analysis: 50, copy: 50, download: 50 }
  },
  api_performance: {
    featureKey: 'api_performance',
    displayName: 'API performance testing',
    description: 'Generate Apache JMeter JMX load test scripts and benchmark API response times. Export JMX/performance reports.',
    trial: { analysis: 100, copy: 50, download: 50 },
    paid: { analysis: 100, copy: 50, download: 50 }
  },
  web_performance: {
    featureKey: 'web_performance',
    displayName: 'Web performance testing',
    description: 'Lighthouse Core Web Vitals audit, speed index, performance bottleneck breakdown. Export performance PDF/CSV.',
    trial: { analysis: 100, copy: 50, download: 50 },
    paid: { analysis: 100, copy: 50, download: 50 }
  }
};

export const PLAN_LIMITS = {
  Trial: { totalCredits: 100, validityDays: 7 },
  trial: { totalCredits: 100, validityDays: 7 },
  Paid: { totalCredits: 1000, validityDays: 30 },
  paid: { totalCredits: 1000, validityDays: 30 }
};

export function normalizeFeatureConfig(featureKeyOrName: string): ModuleCreditRates {
  if (!featureKeyOrName) return FEATURE_CREDIT_CONFIG.ai_test_cases;
  const lower = featureKeyOrName.toLowerCase().trim();

  if (FEATURE_CREDIT_CONFIG[lower]) {
    return FEATURE_CREDIT_CONFIG[lower];
  }

  for (const rule of Object.values(FEATURE_CREDIT_CONFIG)) {
    if (rule.displayName.toLowerCase() === lower) {
      return rule;
    }
  }

  if (lower.includes('mobile') || lower.includes('appium')) return FEATURE_CREDIT_CONFIG.record_play_mobile;
  if (lower.includes('record') && lower.includes('web')) return FEATURE_CREDIT_CONFIG.record_play_web;
  if (lower.includes('user_stories') || lower.includes('user_story') || lower.includes('user stor') || lower.includes('story') || lower.includes('stories')) return FEATURE_CREDIT_CONFIG.ai_user_stories;
  if (lower.includes('scenario')) return FEATURE_CREDIT_CONFIG.ai_scenarios;
  if (lower.includes('script') && !lower.includes('jmeter')) return FEATURE_CREDIT_CONFIG.automation_script;
  if (lower.includes('ui test') || lower.includes('figma') || lower.includes('visual')) return FEATURE_CREDIT_CONFIG.ui_testing;
  if (lower.includes('api perf') || (lower.includes('api') && lower.includes('perf')) || lower.includes('jmeter')) return FEATURE_CREDIT_CONFIG.api_performance;
  if (lower.includes('api')) return FEATURE_CREDIT_CONFIG.api_testing;
  if (lower.includes('web perf') || lower.includes('lighthouse') || lower.includes('web performance')) return FEATURE_CREDIT_CONFIG.web_performance;
  if (lower.includes('test case') || lower.includes('cases') || lower.includes('manual test')) return FEATURE_CREDIT_CONFIG.ai_test_cases;

  return FEATURE_CREDIT_CONFIG.ai_test_cases;
}

export function getFeatureCreditCost(
  featureKeyOrName: string,
  actionType: ActionType | 'analysis' | 'export' = 'AI_ANALYSIS',
  planType: PlanType | 'trial' | 'paid' = 'Trial'
): number {
  const normPlan: PlanType = (planType.toLowerCase() === 'paid') ? 'Paid' : 'Trial';
  const rule = normalizeFeatureConfig(featureKeyOrName);
  const rates = normPlan === 'Paid' ? rule.paid : rule.trial;

  const act = (actionType || 'AI_ANALYSIS').toUpperCase();
  if (act === 'COPY') return rates.copy;
  if (act === 'DOWNLOAD' || act === 'EXPORT') return rates.download;
  return rates.analysis;
}
