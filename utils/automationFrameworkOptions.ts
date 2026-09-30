import { TestCase, TestStatus, TestType, TestIntent, TestPriority } from '../types';

export type AutomationToolType =
  | 'Playwright'
  | 'Selenium'
  | 'Cypress'
  | 'Appium'
  | 'Puppeteer'
  | 'RestAssured (API)';

export type AutomationLanguageType =
  | 'TypeScript'
  | 'JavaScript'
  | 'Python'
  | 'Java'
  | 'C#';

export interface BddStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But' | string;
  text: string;
}

export interface BddScenario {
  id: string;
  title: string;
  type: 'Scenario' | 'Scenario Outline';
  tags: string[];
  steps: BddStep[];
  examples?: { headers: string[]; rows: string[][] };
}

export interface BddDocumentParsed {
  featureTitle: string;
  featureDescription: string;
  tags: string[];
  backgroundSteps: BddStep[];
  scenarios: BddScenario[];
  rawText: string;
  fileName?: string;
}

export const AUTOMATION_OPTIONS: AutomationToolType[] = [
  'Playwright',
  'Selenium',
  'Cypress',
  'Appium',
  'Puppeteer',
  'RestAssured (API)'
];

export const AUTOMATION_LANGUAGES: Record<AutomationToolType, AutomationLanguageType[]> = {
  'Playwright': ['TypeScript', 'JavaScript', 'Python', 'Java', 'C#'],
  'Selenium': ['Java', 'Python', 'TypeScript', 'JavaScript', 'C#'],
  'Cypress': ['TypeScript', 'JavaScript'],
  'Appium': ['Java', 'Python', 'TypeScript', 'JavaScript'],
  'Puppeteer': ['TypeScript', 'JavaScript'],
  'RestAssured (API)': ['Java', 'Python', 'TypeScript', 'JavaScript']
};

export const AUTOMATION_FRAMEWORKS: Record<AutomationToolType, Record<string, string[]>> = {
  'Playwright': {
    'TypeScript': [
      'Page Object Model (POM)',
      'BDD / Cucumber (@playwright/test + cucumber)',
      'Playwright Test Runner (@playwright/test)',
      'Data-Driven (DDT) + POM',
      'Hybrid Framework (POM + BDD + Fixtures)'
    ],
    'JavaScript': [
      'Page Object Model (POM)',
      'Cucumber.js (BDD) + Playwright',
      'Playwright Test Runner Standard',
      'Data-Driven (DDT) + POM'
    ],
    'Python': [
      'PyTest + Playwright (POM)',
      'Behave (BDD) + Playwright',
      'pytest-bdd + Playwright',
      'Data-Driven (DDT) + PyTest'
    ],
    'Java': [
      'TestNG + Playwright Java (POM)',
      'Cucumber-JVM + Playwright (BDD)',
      'JUnit 5 + Playwright Java (POM)',
      'Maven Hybrid (POM + ExtentReports)'
    ],
    'C#': [
      'NUnit + Playwright (.NET POM)',
      'SpecFlow (BDD) + Playwright',
      'MSTest + Playwright (.NET)'
    ]
  },
  'Selenium': {
    'Java': [
      'TestNG + Selenium POM (PageFactory)',
      'Cucumber-JVM + TestNG (BDD)',
      'JUnit 5 + Selenium POM',
      'Maven Hybrid Framework + ExtentReports',
      'Data-Driven (Apache POI Excel + POM)'
    ],
    'Python': [
      'PyTest + Selenium WebDriver (POM)',
      'Behave (BDD) + Selenium',
      'Robot Framework + SeleniumLibrary',
      'Data-Driven (openpyxl + PyTest)'
    ],
    'TypeScript': [
      'Mocha + Chai + Selenium POM',
      'Cucumber.js + Selenium (BDD)',
      'Jest + Selenium WebDriver'
    ],
    'JavaScript': [
      'Mocha + Chai + Selenium POM',
      'Cucumber.js + Selenium (BDD)',
      'Jest + Selenium WebDriver'
    ],
    'C#': [
      'NUnit + Selenium POM',
      'SpecFlow (BDD) + Selenium',
      'MSTest + Selenium POM'
    ]
  },
  'Cypress': {
    'TypeScript': [
      'Mocha / Chai + POM (Cypress)',
      'Cypress Cucumber Preprocessor (BDD)',
      'App Actions + Custom Commands',
      'Data-Driven (Fixtures + POM)'
    ],
    'JavaScript': [
      'Mocha / Chai + POM (Cypress)',
      'Cypress Cucumber Preprocessor (BDD)',
      'App Actions + Custom Commands',
      'Data-Driven (Fixtures + POM)'
    ]
  },
  'Appium': {
    'Java': [
      'TestNG + Appium POM (Android / iOS)',
      'Cucumber-JVM + Appium (BDD)',
      'JUnit 5 + Appium POM',
      'Maven Hybrid Mobile Framework'
    ],
    'Python': [
      'PyTest + Appium (POM)',
      'Behave (BDD) + Appium Mobile'
    ],
    'TypeScript': [
      'WebdriverIO + Appium (POM)',
      'WebdriverIO + Cucumber (BDD)'
    ],
    'JavaScript': [
      'WebdriverIO + Appium (POM)',
      'WebdriverIO + Cucumber (BDD)'
    ]
  },
  'Puppeteer': {
    'TypeScript': [
      'Jest + Puppeteer (POM)',
      'Mocha + Chai + Puppeteer',
      'Cucumber.js + Puppeteer (BDD)'
    ],
    'JavaScript': [
      'Jest + Puppeteer (POM)',
      'Mocha + Puppeteer',
      'Cucumber.js + Puppeteer (BDD)'
    ]
  },
  'RestAssured (API)': {
    'Java': [
      'TestNG + RestAssured (POM/Controller)',
      'Cucumber-JVM + RestAssured (BDD)',
      'JUnit 5 + RestAssured',
      'Data-Driven (Jackson POJO + RestAssured)'
    ],
    'Python': [
      'PyTest + Requests (API POM)',
      'Behave (BDD) + Requests'
    ],
    'TypeScript': [
      'Supertest + Jest / Playwright API',
      'PactumJS / Axios + Mocha'
    ],
    'JavaScript': [
      'Supertest + Jest API',
      'Axios + Mocha + Chai'
    ]
  }
};

export const getLanguagesForAutomation = (automation: AutomationToolType | string): AutomationLanguageType[] => {
  const norm = (automation || 'Playwright') as AutomationToolType;
  return AUTOMATION_LANGUAGES[norm] || ['TypeScript', 'JavaScript', 'Python', 'Java'];
};

export const getFrameworksForAutomation = (
  automation: AutomationToolType | string,
  language: AutomationLanguageType | string
): string[] => {
  const autoNorm = (automation || 'Playwright') as AutomationToolType;
  const langNorm = (language || 'TypeScript') as string;

  const toolFrameworks = AUTOMATION_FRAMEWORKS[autoNorm];
  if (toolFrameworks) {
    if (toolFrameworks[langNorm] && toolFrameworks[langNorm].length > 0) {
      return toolFrameworks[langNorm];
    }
    // Fallback to first available language in list
    const firstLang = Object.keys(toolFrameworks)[0];
    if (firstLang && toolFrameworks[firstLang]) {
      return toolFrameworks[firstLang];
    }
  }

  return ['Page Object Model (POM)', 'BDD / Cucumber', 'Standard Test Runner'];
};

/**
 * Robust Gherkin / BDD Document parser.
 * Handles Feature:, Background:, Scenario:, Scenario Outline:, Given, When, Then, And, But, Examples: tables, @tags.
 */
export const parseBddDocument = (content: string, fileName?: string): BddDocumentParsed => {
  const lines = content.split(/\r?\n/);
  let featureTitle = fileName ? fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ') : 'Feature Workflow';
  let featureDescription = '';
  const tags: string[] = [];
  const backgroundSteps: BddStep[] = [];
  const scenarios: BddScenario[] = [];

  let currentSection: 'header' | 'background' | 'scenario' = 'header';
  let currentScenario: BddScenario | null = null;
  let currentTags: string[] = [];
  let inExamples = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue; // Skip comments and blank lines
    }

    // Tag line e.g., @smoke @regression @login
    if (trimmed.startsWith('@')) {
      const lineTags = trimmed.split(/\s+/).filter(t => t.startsWith('@'));
      if (currentSection === 'header' && !featureTitle.includes('Feature:')) {
        tags.push(...lineTags);
      }
      currentTags.push(...lineTags);
      continue;
    }

    // Feature header
    if (/^Feature\s*:/i.test(trimmed)) {
      featureTitle = trimmed.replace(/^Feature\s*:\s*/i, '').trim();
      currentSection = 'header';
      continue;
    }

    // Background
    if (/^Background\s*:/i.test(trimmed)) {
      currentSection = 'background';
      continue;
    }

    // Scenario or Scenario Outline
    if (/^Scenario(?:\s+Outline)?\s*:/i.test(trimmed)) {
      const isOutline = /^Scenario\s+Outline\s*:/i.test(trimmed);
      const title = trimmed.replace(/^Scenario(?:\s+Outline)?\s*:\s*/i, '').trim();

      if (currentScenario) {
        scenarios.push(currentScenario);
      }

      currentScenario = {
        id: `SCEN-${Date.now().toString().slice(-4)}-${scenarios.length + 1}`,
        title: title || `Scenario ${scenarios.length + 1}`,
        type: isOutline ? 'Scenario Outline' : 'Scenario',
        tags: [...currentTags],
        steps: []
      };

      currentTags = [];
      currentSection = 'scenario';
      inExamples = false;
      continue;
    }

    // Examples table in Scenario Outline
    if (/^Examples\s*:/i.test(trimmed)) {
      inExamples = true;
      continue;
    }

    // Table rows (for examples or step tables)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (inExamples && currentScenario) {
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map(c => c.trim());

        if (!currentScenario.examples) {
          currentScenario.examples = { headers: cells, rows: [] };
        } else {
          currentScenario.examples.rows.push(cells);
        }
      }
      continue;
    }

    // Step lines: Given, When, Then, And, But, *
    const stepMatch = /^(Given|When|Then|And|But|\*)\s+(.*)$/i.exec(trimmed);
    if (stepMatch) {
      const keyword = stepMatch[1].charAt(0).toUpperCase() + stepMatch[1].slice(1).toLowerCase();
      const text = stepMatch[2].trim();
      const stepObj: BddStep = { keyword, text };

      if (currentSection === 'background') {
        backgroundSteps.push(stepObj);
      } else if (currentScenario) {
        currentScenario.steps.push(stepObj);
      }
      continue;
    }

    // If still in header and line doesn't match steps, append to description
    if (currentSection === 'header') {
      featureDescription += (featureDescription ? ' ' : '') + trimmed;
    }
  }

  if (currentScenario) {
    scenarios.push(currentScenario);
  }

  // Fallback: If no explicit scenarios detected, synthesize from lines
  if (scenarios.length === 0 && lines.length > 0) {
    const syntheticSteps: BddStep[] = [];
    lines.forEach(l => {
      const t = l.trim();
      if (t && !t.startsWith('#')) {
        syntheticSteps.push({ keyword: 'When', text: t });
      }
    });

    if (syntheticSteps.length > 0) {
      scenarios.push({
        id: `SCEN-${Date.now().toString().slice(-4)}-01`,
        title: featureTitle || 'Synthesized Workflow Scenario',
        type: 'Scenario',
        tags: ['@bdd', '@generated'],
        steps: syntheticSteps
      });
    }
  }

  return {
    featureTitle: featureTitle || 'BDD Workflow Feature',
    featureDescription: featureDescription || 'Automated feature specifications from BDD document.',
    tags,
    backgroundSteps,
    scenarios,
    rawText: content,
    fileName
  };
};

/**
 * Convert parsed BDD document scenarios into standard Test Cases.
 */
export const convertBddDocumentToTestCases = (bdd: BddDocumentParsed): TestCase[] => {
  return bdd.scenarios.map((scen, idx) => {
    const allSteps = [
      ...bdd.backgroundSteps.map(s => `[Background] ${s.keyword} ${s.text}`),
      ...scen.steps.map(s => `${s.keyword} ${s.text}`)
    ];

    const thenSteps = scen.steps.filter(s => s.keyword.toLowerCase() === 'then');
    const expected = thenSteps.length > 0
      ? thenSteps.map(s => s.text).join('; ')
      : `Application state satisfies all scenario conditions.`;

    return {
      id: Math.random().toString(36).substr(2, 9),
      testCaseId: `TC-BDD-${(idx + 1).toString().padStart(3, '0')}`,
      title: `${bdd.featureTitle}: ${scen.title}`,
      description: `Gherkin Scenario extracted from ${bdd.fileName || 'BDD Document'}. Tags: ${scen.tags.join(', ') || 'None'}`,
      steps: allSteps.length > 0 ? allSteps : ['Given user is on target page', 'When user executes flow', 'Then system validates outcome'],
      expectedResult: expected,
      status: TestStatus.NOT_EXECUTED,
      isApproved: true,
      testType: TestType.FUNCTIONAL,
      testIntent: scen.title.toLowerCase().includes('fail') || scen.title.toLowerCase().includes('invalid') ? TestIntent.NEGATIVE : TestIntent.POSITIVE,
      priority: scen.tags.some(t => t.includes('smoke') || t.includes('p1') || t.includes('critical')) ? TestPriority.HIGH : TestPriority.MEDIUM,
      testDataSets: scen.examples ? scen.examples.rows.map(r => r.join(' | ')) : ['Default Scenario Context'],
      source: 'bdd_document' as any,
      executedAt: new Date().toISOString()
    };
  });
};

/**
 * Formats a script's language and framework/tool as specified by user:
 * e.g. "TypeScript + Playwright", "JavaScript + Playwright", "Python + Selenium", "Java + Selenium"
 */
export function formatScriptLanguageAndFramework(script: {
  tool?: string;
  language?: string;
  framework?: string;
  content?: string;
  files?: { path: string; content: string }[];
}): string {
  if (!script) return 'TypeScript + Playwright';

  let lang = (script.language || '').trim();
  let tool = (script.framework || script.tool || '').trim();

  // If tool is missing, infer from content/files
  if (!tool) {
    const allText = [
      script.content || '',
      ...(script.files || []).map(f => `${f.path} ${f.content}`)
    ].join(' ');

    if (/selenium/i.test(allText)) tool = 'Selenium';
    else if (/cypress/i.test(allText)) tool = 'Cypress';
    else if (/appium/i.test(allText)) tool = 'Appium';
    else if (/cucumber/i.test(allText)) tool = 'Playwright (BDD/Cucumber)';
    else tool = 'Playwright';
  }

  // If language is missing, infer from content/files
  if (!lang) {
    const allText = [
      script.content || '',
      ...(script.files || []).map(f => `${f?.path || ''} ${f?.content || ''}`)
    ].join(' ');

    if (/\b(def |import pytest|from selenium|requirements\.txt)\b/.test(allText) || (script.files || []).some(f => f && typeof f.path === 'string' && f.path.endsWith('.py'))) {
      lang = 'Python';
    } else if (/\b(public class|import org\.|pom\.xml)\b/.test(allText) || (script.files || []).some(f => f && typeof f.path === 'string' && f.path.endsWith('.java'))) {
      lang = 'Java';
    } else if (/\b(using System|namespace )\b/.test(allText) || (script.files || []).some(f => f && typeof f.path === 'string' && f.path.endsWith('.cs'))) {
      lang = 'C#';
    } else if ((script.files || []).some(f => f && typeof f.path === 'string' && (f.path.endsWith('.ts') || f.path.endsWith('.tsx')))) {
      lang = 'TypeScript';
    } else if ((script.files || []).some(f => f && typeof f.path === 'string' && f.path.endsWith('.js'))) {
      lang = 'JavaScript';
    } else {
      lang = 'TypeScript';
    }
  }

  // Normalize language capitalization
  const lowerLang = lang.toLowerCase();
  const normalizedLang =
    lowerLang === 'typescript' || lowerLang === 'ts' ? 'TypeScript' :
    lowerLang === 'javascript' || lowerLang === 'js' ? 'JavaScript' :
    lowerLang === 'python' || lowerLang === 'py' ? 'Python' :
    lowerLang === 'java' ? 'Java' :
    lowerLang === 'c#' || lowerLang === 'csharp' ? 'C#' :
    lang;

  // Clean up tool display
  let normalizedTool = tool;
  const lowerTool = tool.toLowerCase();
  if (lowerTool === 'playwright') normalizedTool = 'Playwright';
  else if (lowerTool === 'selenium') normalizedTool = 'Selenium';
  else if (lowerTool === 'cypress') normalizedTool = 'Cypress';
  else if (lowerTool === 'appium') normalizedTool = 'Appium';
  else if (lowerTool.includes('cucumber') || lowerTool.includes('bdd')) {
    normalizedTool = tool.includes('Playwright') ? 'Playwright (BDD/Cucumber)' : 'Cucumber (BDD)';
  }

  return `${normalizedLang} + ${normalizedTool}`;
}
