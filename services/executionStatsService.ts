import { 
  Project, 
  TestCase, 
  AutomationScript, 
  ApiTestSuite, 
  ApiRequest, 
  PerformanceScript, 
  TestStatus, 
  TestPriority, 
  TestType, 
  TestIntent, 
  isApiTestingScenario, 
  isApiTestingCase 
} from '../types';
import { getDeletedIds } from './projectService';

export interface ExecutionStats {
  total: number;
  notStarted: number;
  pass: number;
  fail: number;
  blocked: number;
  passRate: number;
}

export interface FunctionalFolderSummary {
  id: string;
  name: string;
  type: 'AI' | 'Functional';
  total: number;
  notExecuted: number;
  passed: number;
  failed: number;
  blocked: number;
}

export interface ApiSuiteSummary {
  id: string;
  name: string;
  targetFolderId: string;
  targetFolderName?: string;
  total: number;
  notStarted: number;
  passed: number;
  failed: number;
  blocked: number;
  status: 'Completed' | 'In Progress' | 'Not Started';
}

export interface ExecutablePerformanceItem {
  id: string;
  itemKey: string;
  uniqueKey: string;
  artifactName: string;
  itemName: string;
  itemType: 'Scenario' | 'AI Analysis' | 'Thread';
  detail: string;
  generatedOn: string;
  status: TestStatus;
  originalArtifact: PerformanceScript;
}

// Default fallback scripts for Script Execution
export const defaultFallbackScripts: AutomationScript[] = [];

// Normalize script status to standard 4 buckets
export const normalizeScriptStatus = (status: any): 'NOT STARTED' | 'PASSED' | 'FAILED' | 'BLOCKED' => {
  const raw = String(status || '').toUpperCase().trim();
  if (raw === 'SUCCESS' || raw === 'PASS' || raw === 'PASSED') return 'PASSED';
  if (raw === 'FAILURE' || raw === 'FAIL' || raw === 'FAILED') return 'FAILED';
  if (raw === 'BLOCKED' || raw === 'BLOCK') return 'BLOCKED';
  return 'NOT STARTED';
};

// ==========================================
// 1. SCRIPT EXECUTION
// ==========================================
export const getScriptExecutionScripts = (project: Project): AutomationScript[] => {
  if (!project) return [];
  const deletedIds = getDeletedIds();
  const all = (project.automationScripts || []).filter(s => s && s.id && !deletedIds.has(s.id));
  const approvedUserScripts = all.filter(s => Boolean(s.isApproved));

  // Hydrate with local evidence/status if stored in browser
  return approvedUserScripts.map(script => {
    try {
      const stored = localStorage.getItem(`automatiqa_script_evidence_${project.id}_${script.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...script,
          lastExecutionStatus: parsed.status || script.lastExecutionStatus,
          comments: parsed.comments || script.comments,
          lastExecutionNotes: parsed.comments || script.lastExecutionNotes,
          evidence: (parsed.attachments && parsed.attachments.length > 0) ? parsed.attachments[0] : script.evidence
        };
      }
    } catch (e) {}
    return script;
  });
};

export const getScriptExecutionStats = (projects: Project | Project[]): ExecutionStats => {
  const list = Array.isArray(projects) ? projects : [projects];
  let notStarted = 0;
  let pass = 0;
  let fail = 0;
  let blocked = 0;

  list.forEach(proj => {
    const scripts = getScriptExecutionScripts(proj);
    scripts.forEach(s => {
      const norm = normalizeScriptStatus(s.lastExecutionStatus);
      if (norm === 'PASSED') pass++;
      else if (norm === 'FAILED') fail++;
      else if (norm === 'BLOCKED') blocked++;
      else notStarted++;
    });
  });

  const total = notStarted + pass + fail + blocked;
  const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
  return { total, notStarted, pass, fail, blocked, passRate };
};

// ==========================================
// 2. FUNCTIONAL EXECUTION
// ==========================================
export const getFunctionalExecutionCases = (project: Project): TestCase[] => {
  if (!project) return [];
  const list: TestCase[] = [];
  const activeExecutionFolderIds = new Set(project.activeExecutionFolderIds || []);
  
  try {
    const saved = localStorage.getItem(`automatiqa_active_execution_folders_${project.id}`);
    if (saved) {
      const ids: string[] = JSON.parse(saved);
      if (Array.isArray(ids)) {
        ids.forEach(id => activeExecutionFolderIds.add(id));
      }
    }
  } catch (e) {}

  const excludedIds = new Set(project.excludedFromExecutionIds || []);
  try {
    const savedEx = localStorage.getItem(`automatiqa_excluded_cases_${project.id}`);
    if (savedEx) {
      const ids: string[] = JSON.parse(savedEx);
      if (Array.isArray(ids)) {
        ids.forEach(id => excludedIds.add(id));
      }
    }
  } catch (e) {}

  let sessionUpdates: Record<string, any> = {};
  try {
    const rawUpdates = localStorage.getItem(`automatiqa_execution_updates_${project.id}`);
    if (rawUpdates) sessionUpdates = JSON.parse(rawUpdates);
  } catch (e) {}

  const allScenarios = (project.scenarios || []).filter(s => !isApiTestingScenario(s));

  const nonFolderScenarios = allScenarios.filter(sc => 
    !sc.isFolder && sc.scenarioId !== 'TESTCASE_FOLDER' && sc.scenarioId !== 'MANUAL_FOLDER' && !isApiTestingScenario(sc)
  );

  allScenarios
    .filter(s => {
      if (isApiTestingScenario(s)) return false;
      const isFolder = s.scenarioId === 'MANUAL_FOLDER' || 
                       s.scenarioId === 'TESTCASE_FOLDER' || 
                       (s.isFolder && s.scenarioId !== 'SCENARIO_FOLDER');
      return isFolder;
    })
    .forEach(s => {
      if (!activeExecutionFolderIds.has(s.id) || excludedIds.has(s.id)) return;

      const directCases = (Array.isArray(s.testCases) ? s.testCases : []).filter(tc => !isApiTestingCase(tc));
      const memberScenarios = nonFolderScenarios.filter(sc => 
        sc.folderId === s.id || (s.memberScenarioIds && s.memberScenarioIds.includes(sc.id))
      );
      const memberCases: TestCase[] = [];
      memberScenarios.forEach(ms => {
        if (Array.isArray(ms.testCases) && ms.testCases.length > 0) {
          memberCases.push(...ms.testCases);
        } else if (ms.title) {
          memberCases.push({
            id: `tc_${ms.id}`,
            testCaseId: ms.scenarioId || `TC-${ms.id.slice(-5)}`,
            title: ms.title,
            description: ms.description,
            steps: ms.description ? [ms.description] : ['Execute test scenario procedure'],
            expectedResult: ms.expectedResults || 'Execution validates requirements successfully.',
            status: ms.status || TestStatus.NOT_EXECUTED,
            isApproved: Boolean(ms.isApproved),
            priority: (ms.priority as TestPriority) || TestPriority.MEDIUM,
            testType: ms.type === 'Non-functional' ? TestType.NON_FUNCTIONAL : TestType.FUNCTIONAL,
            testIntent: TestIntent.POSITIVE,
            scenarioId: ms.id
          });
        }
      });

      const seenCaseIds = new Set<string>();
      const folderCases: TestCase[] = [];
      [...directCases, ...memberCases].forEach(c => {
        if (c && c.id && !seenCaseIds.has(c.id)) {
          seenCaseIds.add(c.id);
          folderCases.push(c);
        }
      });

      folderCases.forEach(tc => {
        if (excludedIds.has(tc.id)) return;
        
        let localStatus = tc.status;
        const rawId = tc.id.startsWith('tc_') ? tc.id.slice(3) : tc.id;
        const sessionUpd = sessionUpdates[`${s.id}_${tc.id}`]
          || sessionUpdates[`${s.id}_${rawId}`]
          || sessionUpdates[tc.id]
          || sessionUpdates[rawId];
        if (sessionUpd && sessionUpd.status) {
          localStatus = sessionUpd.status;
        } else {
          try {
            const evRaw = localStorage.getItem(`automatiqa_case_evidence_${project.id}_${tc.id}`)
              || localStorage.getItem(`automatiqa_case_evidence_${project.id}_${rawId}`)
              || (tc.testCaseId ? localStorage.getItem(`automatiqa_case_evidence_${project.id}_${tc.testCaseId}`) : null);
            if (evRaw) {
              const parsed = JSON.parse(evRaw);
              if (parsed && parsed.status) localStatus = parsed.status;
            }
          } catch (e) {}
        }

        list.push({
          ...tc,
          status: localStatus || tc.status || TestStatus.NOT_EXECUTED
        });
      });
    });

  return list;
};

export const getFunctionalExecutionFolderSummaries = (project: Project): FunctionalFolderSummary[] => {
  if (!project) return [];
  const summaries: FunctionalFolderSummary[] = [];
  const activeExecutionFolderIds = new Set(project.activeExecutionFolderIds || []);
  
  try {
    const saved = localStorage.getItem(`automatiqa_active_execution_folders_${project.id}`);
    if (saved) {
      const ids: string[] = JSON.parse(saved);
      if (Array.isArray(ids)) {
        ids.forEach(id => activeExecutionFolderIds.add(id));
      }
    }
  } catch (e) {}

  const excludedIds = new Set(project.excludedFromExecutionIds || []);
  try {
    const savedEx = localStorage.getItem(`automatiqa_excluded_cases_${project.id}`);
    if (savedEx) {
      const ids: string[] = JSON.parse(savedEx);
      if (Array.isArray(ids)) {
        ids.forEach(id => excludedIds.add(id));
      }
    }
  } catch (e) {}

  let sessionUpdates: Record<string, any> = {};
  try {
    const rawUpdates = localStorage.getItem(`automatiqa_execution_updates_${project.id}`);
    if (rawUpdates) sessionUpdates = JSON.parse(rawUpdates);
  } catch (e) {}

  const allScenarios = (project.scenarios || []).filter(s => !isApiTestingScenario(s));
  const nonFolderScenarios = allScenarios.filter(sc => 
    !sc.isFolder && sc.scenarioId !== 'TESTCASE_FOLDER' && sc.scenarioId !== 'MANUAL_FOLDER' && !isApiTestingScenario(sc)
  );

  allScenarios
    .filter(s => {
      if (isApiTestingScenario(s)) return false;
      const isFolder = s.scenarioId === 'MANUAL_FOLDER' || 
                       s.scenarioId === 'TESTCASE_FOLDER' || 
                       (s.isFolder && s.scenarioId !== 'SCENARIO_FOLDER');
      return isFolder;
    })
    .forEach(s => {
      if (!activeExecutionFolderIds.has(s.id) || excludedIds.has(s.id)) return;

      const directCases = (Array.isArray(s.testCases) ? s.testCases : []).filter(tc => !isApiTestingCase(tc));
      const memberScenarios = nonFolderScenarios.filter(sc => 
        sc.folderId === s.id || (s.memberScenarioIds && s.memberScenarioIds.includes(sc.id))
      );
      const memberCases: TestCase[] = [];
      memberScenarios.forEach(ms => {
        if (Array.isArray(ms.testCases) && ms.testCases.length > 0) {
          memberCases.push(...ms.testCases);
        } else if (ms.title) {
          memberCases.push({
            id: `tc_${ms.id}`,
            testCaseId: ms.scenarioId || `TC-${ms.id.slice(-5)}`,
            title: ms.title,
            description: ms.description,
            steps: ms.description ? [ms.description] : ['Execute test scenario procedure'],
            expectedResult: ms.expectedResults || 'Execution validates requirements successfully.',
            status: ms.status || TestStatus.NOT_EXECUTED,
            isApproved: Boolean(ms.isApproved),
            priority: (ms.priority as TestPriority) || TestPriority.MEDIUM,
            testType: ms.type === 'Non-functional' ? TestType.NON_FUNCTIONAL : TestType.FUNCTIONAL,
            testIntent: TestIntent.POSITIVE,
            scenarioId: ms.id
          });
        }
      });

      const seenCaseIds = new Set<string>();
      const folderCases: TestCase[] = [];
      [...directCases, ...memberCases].forEach(c => {
        if (c && c.id && !seenCaseIds.has(c.id) && !excludedIds.has(c.id)) {
          seenCaseIds.add(c.id);
          folderCases.push(c);
        }
      });

      let passed = 0;
      let failed = 0;
      let blocked = 0;
      let notExecuted = 0;

      folderCases.forEach(tc => {
        let status = tc.status;
        const rawId = tc.id.startsWith('tc_') ? tc.id.slice(3) : tc.id;
        const sessionUpd = sessionUpdates[`${s.id}_${tc.id}`]
          || sessionUpdates[`${s.id}_${rawId}`]
          || sessionUpdates[tc.id]
          || sessionUpdates[rawId];
        if (sessionUpd && sessionUpd.status) {
          status = sessionUpd.status;
        } else {
          try {
            const evRaw = localStorage.getItem(`automatiqa_case_evidence_${project.id}_${tc.id}`)
              || localStorage.getItem(`automatiqa_case_evidence_${project.id}_${rawId}`)
              || (tc.testCaseId ? localStorage.getItem(`automatiqa_case_evidence_${project.id}_${tc.testCaseId}`) : null);
            if (evRaw) {
              const parsed = JSON.parse(evRaw);
              if (parsed && parsed.status) status = parsed.status;
            }
          } catch (e) {}
        }

        if (status === TestStatus.PASS) passed++;
        else if (status === TestStatus.FAIL) failed++;
        else if (status === TestStatus.BLOCKED) blocked++;
        else notExecuted++;
      });

      summaries.push({
        id: s.id,
        name: s.title,
        type: (s.scenarioId === 'TESTCASE_FOLDER' || s.scenarioId !== 'MANUAL_FOLDER') ? 'AI' : 'Functional',
        total: folderCases.length,
        passed,
        failed,
        blocked,
        notExecuted
      });
    });

  return summaries;
};

export const getFunctionalExecutionStats = (projects: Project | Project[]): ExecutionStats => {
  const list = Array.isArray(projects) ? projects : [projects];
  let notStarted = 0;
  let pass = 0;
  let fail = 0;
  let blocked = 0;

  list.forEach(proj => {
    const cases = getFunctionalExecutionCases(proj);
    cases.forEach(tc => {
      if (tc.status === TestStatus.PASS) pass++;
      else if (tc.status === TestStatus.FAIL) fail++;
      else if (tc.status === TestStatus.BLOCKED) blocked++;
      else notStarted++;
    });
  });

  const total = notStarted + pass + fail + blocked;
  const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
  return { total, notStarted, pass, fail, blocked, passRate };
};

// ==========================================
// 3. API EXECUTION
// ==========================================
export const getApiSuiteScenarios = (project: Project, targetId: string): ApiRequest[] => {
  if (!targetId || !project) return [];

  const scenarios: ApiRequest[] = [];
  const seenIds = new Set<string>();

  const addScenario = (req: ApiRequest) => {
    if (req && req.id && !seenIds.has(req.id)) {
      seenIds.add(req.id);
      scenarios.push(req);
    }
  };

  // 1. Direct check: Is targetId a Collection ID?
  project.apiWorkspaces?.forEach(ws => {
    ws.collections?.forEach(col => {
      if (col.id === targetId) {
        (col.requests || []).forEach(addScenario);
        (col.folders || []).forEach(fold => {
          (fold.requests || []).forEach(addScenario);
        });
      }
    });
  });

  // 2. Direct check: Is targetId a Folder ID?
  if (scenarios.length === 0) {
    project.apiWorkspaces?.forEach(ws => {
      ws.collections?.forEach(col => {
        col.folders?.forEach(fold => {
          if (fold.id === targetId) {
            (fold.requests || []).forEach(addScenario);
          }
        });
      });
    });
  }

  // 3. Name check fallback
  if (scenarios.length === 0) {
    project.apiWorkspaces?.forEach(ws => {
      ws.collections?.forEach(col => {
        if (col.name === targetId || `${col.name} (${ws.name})` === targetId) {
          (col.requests || []).forEach(addScenario);
          (col.folders || []).forEach(fold => {
            (fold.requests || []).forEach(addScenario);
          });
        }
        col.folders?.forEach(fold => {
          if (fold.name === targetId || `${col.name} → ${fold.name}` === targetId) {
            (fold.requests || []).forEach(addScenario);
          }
        });
      });
    });
  }

  // 4. Special fallback: 'api-generated-scenarios' or project.apiScenarios
  if (scenarios.length === 0 && (targetId === 'api-generated-scenarios' || targetId.includes('AI Scenarios') || targetId.includes('AI-') || (project.apiScenarios || []).length > 0)) {
    (project.apiScenarios || []).forEach((sc, idx) => {
      const methodMatch = sc.description?.match(/\[([A-Z]+)\s/);
      const method = (methodMatch ? methodMatch[1] : 'GET') as any;
      addScenario({
        id: sc.id || `scen-${idx}`,
        name: sc.title || sc.scenarioId || `Scenario ${idx + 1}`,
        scenarioTitle: sc.title,
        method: method,
        url: sc.appUrl || '',
        headers: [],
        params: [],
        body: '',
        bodyType: 'none',
        description: sc.description || '',
        expectedResults: sc.expectedResults || '',
        createdAt: sc.createdAt || new Date().toISOString()
      });
    });
  }

  return scenarios;
};

export const getApiSuiteSummaries = (project: Project): ApiSuiteSummary[] => {
  if (!project) return [];
  const summaries: ApiSuiteSummary[] = [];
  const suites = project.apiTestSuites || [];

  suites.forEach(suite => {
    const scenarios = getApiSuiteScenarios(project, suite.targetFolderId);
    const results = suite.scenarioResults || {};
    let passed = 0;
    let failed = 0;
    let blocked = 0;
    let notStarted = 0;

    scenarios.forEach(req => {
      const res = results[req.id];
      const rawStatus = (res?.status || '').toUpperCase().trim();
      if (rawStatus === 'PASS' || rawStatus === 'PASSED' || rawStatus === 'SUCCESS') passed++;
      else if (rawStatus === 'FAIL' || rawStatus === 'FAILED' || rawStatus === 'FAILURE') failed++;
      else if (rawStatus === 'BLOCKED' || rawStatus === 'BLOCK') blocked++;
      else notStarted++;
    });

    const total = scenarios.length;
    let status: 'Completed' | 'In Progress' | 'Not Started' = 'Not Started';
    const executed = passed + failed + blocked;
    if (total > 0 && executed === total) status = 'Completed';
    else if (executed > 0) status = 'In Progress';

    summaries.push({
      id: suite.id,
      name: suite.name,
      targetFolderId: suite.targetFolderId,
      targetFolderName: suite.targetFolderName,
      total,
      notStarted,
      passed,
      failed,
      blocked,
      status
    });
  });

  return summaries;
};

export const getApiExecutionStats = (projects: Project | Project[]): ExecutionStats => {
  const list = Array.isArray(projects) ? projects : [projects];
  let notStarted = 0;
  let pass = 0;
  let fail = 0;
  let blocked = 0;

  list.forEach(proj => {
    const summaries = getApiSuiteSummaries(proj);
    summaries.forEach(s => {
      notStarted += s.notStarted;
      pass += s.passed;
      fail += s.failed;
      blocked += s.blocked;
    });
  });

  const total = notStarted + pass + fail + blocked;
  const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
  return { total, notStarted, pass, fail, blocked, passRate };
};

// ==========================================
// 4. PERFORMANCE EXECUTION
// ==========================================
export const getPerformanceExecutionItems = (project: Project): ExecutablePerformanceItem[] => {
  if (!project) return [];
  const items: ExecutablePerformanceItem[] = [];
  const archives = project.performanceScripts || [];
  const importedArtifactIds = new Set(project.importedPerformanceArtifactIds || []);

  archives.forEach(artifact => {
    if (!importedArtifactIds.has(artifact.id)) return;

    if (artifact.scenarios && artifact.scenarios.length > 0) {
      artifact.scenarios.forEach((s, idx) => {
        const itemKey = `scen-${idx}`;
        const uniqueKey = `${artifact.id}|${itemKey}`;
        items.push({
          id: artifact.id,
          itemKey,
          uniqueKey,
          artifactName: artifact.name || 'Untitled JMX',
          itemName: s.behavior || `Profile ${idx + 1}`,
          itemType: 'Scenario',
          detail: `${s.vus} VUs • ${s.duration}s duration`,
          generatedOn: artifact.createdAt,
          status: artifact.itemResults?.[itemKey] || TestStatus.NOT_EXECUTED,
          originalArtifact: artifact
        });
      });
    }

    if (artifact.analysisReport || artifact.trendData) {
      const itemKey = 'analysis-summary';
      const uniqueKey = `${artifact.id}|${itemKey}`;
      items.push({
        id: artifact.id,
        itemKey,
        uniqueKey,
        artifactName: artifact.name || 'Performance Report',
        itemName: artifact.trendData && !artifact.analysisReport ? 'Performance Telemetry & Graph' : 'Performance Insight Analysis',
        itemType: 'AI Analysis',
        detail: 'Post-Execution AI Findings',
        generatedOn: artifact.createdAt,
        status: artifact.itemResults?.[itemKey] || TestStatus.NOT_EXECUTED,
        originalArtifact: artifact
      });
    }
  });

  return items;
};

export const getPerformanceExecutionStats = (projects: Project | Project[]): ExecutionStats => {
  const list = Array.isArray(projects) ? projects : [projects];
  let notStarted = 0;
  let pass = 0;
  let fail = 0;
  let blocked = 0;

  list.forEach(proj => {
    const items = getPerformanceExecutionItems(proj);
    items.forEach(item => {
      const raw = String(item.status || '').toUpperCase();
      if (raw === 'PASS' || raw === 'PASSED' || item.status === TestStatus.PASS) pass++;
      else if (raw === 'FAIL' || raw === 'FAILED' || item.status === TestStatus.FAIL) fail++;
      else if (raw === 'BLOCKED' || raw === 'BLOCK' || item.status === TestStatus.BLOCKED) blocked++;
      else notStarted++;
    });
  });

  const total = notStarted + pass + fail + blocked;
  const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
  return { total, notStarted, pass, fail, blocked, passRate };
};
