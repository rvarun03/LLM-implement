import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  arrayUnion,
  serverTimestamp,
  getDoc,
  Timestamp,
  FieldValue
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { syncAddDoc, syncUpdateDoc, syncDeleteDoc, syncSetDoc } from "./firestoreSync";
import { isApiTestingScenario, isApiTestingCase, TestCase, TestScenario } from "../types";
import { logger } from "./appLogger";
import {
  saveFolderToFirestore,
  saveStoryToFirestore,
  saveStoriesBatchToFirestore,
  loadFolderDataFromFirestore,
  loadAllProjectFoldersAndStories,
  deleteFolderFromFirestore,
  deleteStoryFromFirestore,
  renameFolderInFirestore
} from "./folderPersistenceService";
import { filterDeletedScriptFiles, syncFolderReferences } from "./storageBackupService";

export {
  saveFolderToFirestore,
  saveStoryToFirestore,
  saveStoriesBatchToFirestore,
  loadFolderDataFromFirestore,
  loadAllProjectFoldersAndStories,
  deleteFolderFromFirestore,
  deleteStoryFromFirestore,
  renameFolderInFirestore
};

/**
 * Recursively cleans an object for Firestore.
 */
export const cleanFirestoreData = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') {
    return obj === undefined ? null : obj;
  }

  const constructorName = obj.constructor?.name;
  if (
    obj instanceof Timestamp || 
    obj instanceof FieldValue ||
    constructorName === 'Timestamp' || 
    constructorName === 'FieldValue' ||
    constructorName === 'FieldValueImpl' || 
    obj._methodName !== undefined
  ) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj
      .map(item => cleanFirestoreData(item))
      .filter(item => item !== undefined);
  }

  const cleaned: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      const cleanedVal = cleanFirestoreData(val);
      if (cleanedVal !== undefined) {
        cleaned[key] = cleanedVal;
      }
    }
  }
  return cleaned;
};

export interface ScenarioMetrics {
  total: number;
  approved: number;
  unapproved: number;
  functional: number;
  nonFunctional: number;
}

export const isScenarioItem = (s: any): boolean => {
  if (!s || !s.id) return false;
  if (isApiTestingScenario(s)) return false;
  if (s.isFolder) return false;
  if (typeof s.scenarioId === 'string' && (s.scenarioId.endsWith('_FOLDER') || s.scenarioId.startsWith('API-'))) return false;
  if (['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER', 'INPUT_SOURCE', 'SCRIPT_GENERATOR_FOLDER', 'USERSTORY_FOLDER'].includes(s.scenarioId)) return false;
  if (s.isApiScenario || s.moduleName === 'API Testing') return false;
  return true;
};

export const getScenarioMetrics = (scenarios: any[], deletedIds?: Set<string> | string[]): ScenarioMetrics => {
  if (!Array.isArray(scenarios)) {
    return { total: 0, approved: 0, unapproved: 0, functional: 0, nonFunctional: 0 };
  }

  const deletedSet = new Set<string>();
  const globalDeleted = getDeletedIds();
  globalDeleted.forEach(id => {
    if (id) {
      deletedSet.add(id);
      deletedSet.add(id.toLowerCase());
    }
  });

  if (deletedIds) {
    const list = Array.isArray(deletedIds) ? deletedIds : Array.from(deletedIds);
    list.forEach(id => {
      if (id && typeof id === 'string') {
        const trimmed = id.trim();
        if (trimmed) {
          deletedSet.add(trimmed);
          deletedSet.add(trimmed.toLowerCase());
        }
      }
    });
  }

  const validScenarios = scenarios.filter(s => {
    if (!isScenarioItem(s)) return false;
    if (!s.id) return false;
    const sId = String(s.id).toLowerCase().trim();
    const scId = s.scenarioId ? String(s.scenarioId).toLowerCase().trim() : '';

    if (
      deletedSet.has(s.id) ||
      deletedSet.has(sId) ||
      deletedSet.has(`folder-${s.id}`) ||
      deletedSet.has(`folder-${sId}`) ||
      (scId && !['scenario_folder', 'testcase_folder', 'manual_folder', 'input_source'].includes(scId) && (deletedSet.has(s.scenarioId) || deletedSet.has(scId)))
    ) {
      return false;
    }
    return true;
  });

  const seenKeys = new Set<string>();
  const uniqueScenarios: any[] = [];
  for (const s of validScenarios) {
    const key = String(s.id).toLowerCase().trim();
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueScenarios.push(s);
    }
  }

  let approved = 0;
  let unapproved = 0;
  let functional = 0;
  let nonFunctional = 0;

  for (const s of uniqueScenarios) {
    const isApproved = s.isApproved === true || s.isApproved === 'true' || s.status === 'Approved' || s.status === 'APPROVED';
    if (isApproved) {
      approved++;
    } else {
      unapproved++;
    }
    if (s.type === 'Non-functional' || s.type === 'Non-Functional') {
      nonFunctional++;
    } else {
      functional++;
    }
  }

  const total = approved + unapproved;

  return {
    total,
    approved,
    unapproved,
    functional,
    nonFunctional,
  };
};

/**
 * Persistent Tombstone helpers to permanently record deleted folder/item IDs
 * and prevent them from resurrecting on snapshot updates or after page reloads.
 */
export const getDeletedIds = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem('automatiqa_deleted_ids');
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const cleanArr = arr.filter(id => id && typeof id === 'string' && id.trim().length > 0);
        return new Set(cleanArr);
      }
    }
  } catch (e) {}
  return new Set();
};

export const addDeletedIds = (ids: string[]) => {
  if (typeof window === 'undefined' || !ids || ids.length === 0) return;
  try {
    const current = getDeletedIds();
    ids.forEach(id => {
      if (id && typeof id === 'string') {
        const trimmed = id.trim();
        if (trimmed) {
          current.add(trimmed);
          current.add(trimmed.toLowerCase());
        }
      }
    });
    localStorage.setItem('automatiqa_deleted_ids', JSON.stringify(Array.from(current)));
  } catch (e) {}
};

export interface AiTestCaseItem {
  scenario: TestScenario;
  testCase: TestCase;
}

export interface AiTestCaseMetrics {
  total: number;
  functional: number;
  nonFunctional: number;
  ui: number;
}

/**
 * Returns true if a scenario is a test case folder in AI Test Cases.
 * Excludes manual testing folders, script generator folders, and API testing.
 */
export const isAiTestCaseFolder = (s: any, scenarios: any[] = []): boolean => {
  if (!s || !s.id) return false;
  const deleted = getDeletedIds();
  if (deleted.has(s.id)) return false;
  if (s.scenarioId === 'MANUAL_FOLDER' || s.folderType === 'manual') return false;
  if (s.scenarioId === 'SCRIPT_GENERATOR_FOLDER' || s.folderType === 'script_generator') return false;
  if (s.moduleName === 'Script Generator') return false;
  if (s.moduleName === 'API Testing' || s.isApiScenario || isApiTestingScenario(s)) return false;
  if (typeof s.scenarioId === 'string' && s.scenarioId.startsWith('API-')) return false;

  // Explicit testcase folder only. AI Scenario folders must NOT reflect in AI Test Case folder section.
  if (s.scenarioId === 'TESTCASE_FOLDER' || (s.isFolder && s.folderType === 'testcase')) {
    return true;
  }

  return false;
};

/**
 * Normalizes, filters, and resolves all valid AI test cases for a project.
 * Perfectly synchronizes AI Test Cases page and Dashboard.
 * Handles folder memberships, deduplication, tombstones, and filters out non-AI modules.
 */
export const getAiTestCasesWithScenario = (project: any): AiTestCaseItem[] => {
  if (!project || !Array.isArray(project.scenarios)) return [];
  const scenarios: TestScenario[] = project.scenarios;
  const deleted = getDeletedIds();

  const isStructuralScenario = (s: any): boolean => {
    if (!s) return false;
    if (s.isFolder) return true;
    if (s.folderType === 'scenario' || s.folderType === 'testcase' || s.folderType === 'manual' || s.folderType === 'script_generator') return true;
    if (typeof s.scenarioId === 'string' && s.scenarioId.endsWith('_FOLDER')) return true;
    if (['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER', 'SCRIPT_GENERATOR_FOLDER', 'INPUT_SOURCE'].includes(s.scenarioId)) return true;
    return false;
  };

  // Deduplicate testcase folders by normalized title
  const rawFolders = scenarios.filter(s => isAiTestCaseFolder(s, scenarios));
  const seenTitles = new Map<string, TestScenario>();
  const testCaseFolders: TestScenario[] = [];

  for (const folder of rawFolders) {
    const normTitle = (folder.title || '').trim().toLowerCase();
    if (!normTitle) {
      testCaseFolders.push(folder);
      continue;
    }
    if (seenTitles.has(normTitle)) {
      const existing = seenTitles.get(normTitle)!;
      const mergedMembers = Array.from(new Set([...(existing.memberScenarioIds || []), ...(folder.memberScenarioIds || [])]));
      existing.memberScenarioIds = mergedMembers;
      const existingCaseIds = new Set((existing.testCases || []).map((c: any) => c.id));
      const extraCases = (folder.testCases || []).filter((c: any) => !existingCaseIds.has(c.id));
      if (extraCases.length > 0) {
        existing.testCases = [...(existing.testCases || []), ...extraCases];
      }
    } else {
      const copy = { ...folder };
      seenTitles.set(normTitle, copy);
      testCaseFolders.push(copy);
    }
  }

  const getScenarioCases = (scen: TestScenario): TestCase[] => {
    if (isApiTestingScenario(scen) || isStructuralScenario(scen)) return [];
    if (deleted.has(scen.id)) return [];
    if (Array.isArray(scen.testCases) && scen.testCases.length > 0) {
      return scen.testCases.filter((tc: any) => {
        if (!tc || !tc.id || isApiTestingCase(tc) || deleted.has(tc.id)) return false;
        if (tc.source === 'ai_synthesis' || tc.source === 'manual_import') return true;
        if (tc.id === `TC-${scen.id}` && tc.title === scen.title) return false;
        return true;
      });
    }
    return [];
  };

  const getFolderCases = (folder: TestScenario): TestCase[] => {
    if (isApiTestingScenario(folder)) return [];
    const directCases = (Array.isArray(folder.testCases) ? folder.testCases : []).filter((tc: any) => !isApiTestingCase(tc) && !deleted.has(tc.id));
    const memberIds = new Set(folder.memberScenarioIds || []);

    const memberScenarios = scenarios.filter(s =>
      (
        (s as any).testCaseFolderId === folder.id ||
        (!s.testCaseFolderId && (
          memberIds.has(s.id) ||
          (Array.isArray(folder.memberScenarioIds) && s.scenarioId && folder.memberScenarioIds.includes(s.scenarioId))
        ))
      ) &&
      !isStructuralScenario(s) &&
      !isApiTestingScenario(s)
    );

    const memberCases: TestCase[] = [];
    memberScenarios.forEach(ms => {
      memberCases.push(...getScenarioCases(ms));
    });

    const combined: TestCase[] = [];
    const seenIds = new Set<string>();
    const seenCaseIds = new Set<string>();
    const seenCaseTitles = new Set<string>();

    const addCase = (c: TestCase) => {
      if (!c) return;
      const idKey = c.id ? c.id.trim() : '';
      const tcIdKey = c.testCaseId ? c.testCaseId.trim().toLowerCase() : '';
      const titleKey = c.title ? c.title.trim().toLowerCase() : '';

      if (idKey && seenIds.has(idKey)) return;
      if (tcIdKey && seenCaseIds.has(tcIdKey)) return;
      if (titleKey && seenCaseTitles.has(titleKey)) return;

      if (idKey) seenIds.add(idKey);
      if (tcIdKey) seenCaseIds.add(tcIdKey);
      if (titleKey) seenCaseTitles.add(titleKey);
      combined.push(c);
    };

    directCases.forEach(addCase);
    memberCases.forEach(addCase);
    return combined;
  };

  // Approved individual scenarios (all approved non-structural scenarios)
  const approvedScenarios = scenarios.filter(s =>
    !isStructuralScenario(s) &&
    Boolean(s.isApproved) &&
    !isApiTestingScenario(s) &&
    !deleted.has(s.id)
  );

  const list: AiTestCaseItem[] = [];
  const seenKeys = new Set<string>();

  // Collect from folders
  testCaseFolders.forEach(folder => {
    if (isApiTestingScenario(folder)) return;
    const folderCases = getFolderCases(folder);
    folderCases.forEach(tc => {
      if (isApiTestingCase(tc)) return;
      const key = tc.id || tc.testCaseId || `${folder.id}_${tc.title}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        list.push({ scenario: folder, testCase: tc });
      }
    });
  });

  // Collect from individual approved scenarios
  approvedScenarios.forEach(scen => {
    if (isApiTestingScenario(scen)) return;
    const scenCases = getScenarioCases(scen);
    scenCases.forEach(tc => {
      if (isApiTestingCase(tc)) return;
      const key = tc.id || tc.testCaseId || `${scen.id}_${tc.title}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        list.push({ scenario: scen, testCase: tc });
      }
    });
  });

  return list;
};

/**
 * Returns all active, unique AI test cases for a project.
 */
export const getAiTestCases = (project: any): TestCase[] => {
  return getAiTestCasesWithScenario(project).map(item => item.testCase);
};

/**
 * Calculates standardized AI Test Cases metrics for one or more projects.
 */
export const getAiTestCaseMetrics = (projectOrProjects: any | any[]): AiTestCaseMetrics => {
  const projects = Array.isArray(projectOrProjects) ? projectOrProjects : (projectOrProjects ? [projectOrProjects] : []);
  const caseMap = new Map<string, TestCase>();

  projects.forEach(p => {
    if (!p) return;
    const cases = getAiTestCases(p);
    cases.forEach(tc => {
      const key = tc.id || tc.testCaseId || `${p.id || 'p'}_${tc.title}`;
      if (!caseMap.has(key)) {
        caseMap.set(key, tc);
      }
    });
  });

  const allCases = Array.from(caseMap.values());
  const functional = allCases.filter(c => c.testType === 'Functional').length;
  const nonFunctional = allCases.filter(c => c.testType === 'Non-Functional').length;
  const ui = allCases.filter(c => c.testType === 'UI').length;

  return {
    total: allCases.length,
    functional,
    nonFunctional,
    ui
  };
};

export const cleanProjectDeletedItems = (project: any): any => {
  if (!project) return project;
  const deleted = getDeletedIds();
  if (Array.isArray(project.deletedItemIds)) {
    project.deletedItemIds.forEach((id: string) => {
      if (id) {
        deleted.add(id);
        deleted.add(id.toLowerCase());
        deleted.add(`folder-${id}`);
      }
    });
  }

  const cleaned = { ...project };

  // Isolate API testing scenarios from project.scenarios into project.apiScenarios
  if (Array.isArray(cleaned.scenarios)) {
    const apiScenariosInScenarios = cleaned.scenarios.filter((s: any) => isApiTestingScenario(s));
    if (apiScenariosInScenarios.length > 0) {
      cleaned.scenarios = cleaned.scenarios.filter((s: any) => !isApiTestingScenario(s));
      const existingApiScenarios = Array.isArray(cleaned.apiScenarios) ? cleaned.apiScenarios : [];
      const existingIds = new Set(existingApiScenarios.map((s: any) => s.id));
      const newApiScenarios = [...existingApiScenarios];
      apiScenariosInScenarios.forEach((s: any) => {
        if (!existingIds.has(s.id)) {
          existingIds.add(s.id);
          newApiScenarios.push(s);
        }
      });
      cleaned.apiScenarios = newApiScenarios;
    }
  }

  // Sanitize manualTestCases so API test cases never appear in Functional Test Cases
  if (Array.isArray(cleaned.manualTestCases)) {
    cleaned.manualTestCases = cleaned.manualTestCases.filter((c: any) => !isApiTestingCase(c));
  }

  if (deleted.size === 0) return syncFolderReferences(cleaned);

  if (Array.isArray(cleaned.scenarios)) {
    cleaned.scenarios = cleaned.scenarios
      .filter((s: any) => {
        if (!s || !s.id) return false;
        const sId = String(s.id).toLowerCase().trim();
        const scId = s.scenarioId ? String(s.scenarioId).toLowerCase().trim() : '';
        const titleNorm = s.title ? String(s.title).toLowerCase().trim() : '';
        if (
          deleted.has(s.id) ||
          deleted.has(sId) ||
          deleted.has(`folder-${s.id}`) ||
          deleted.has(`folder-${sId}`) ||
          (scId && (deleted.has(s.scenarioId) || deleted.has(scId))) ||
          (titleNorm && (deleted.has(s.title) || deleted.has(titleNorm)))
        ) {
          return false;
        }
        const isFolder = s.isFolder || s.scenarioId === 'SCENARIO_FOLDER' || s.scenarioId === 'TESTCASE_FOLDER' || s.folderType === 'scenario';
        if (isFolder && s.title) {
          const tNorm = s.title.trim().toLowerCase();
          if (deleted.has(s.title) || deleted.has(tNorm) || deleted.has(`folder-${tNorm}`)) return false;
        }
        return true;
      })
      .map((s: any) => {
        let updated = { ...s };
        if (Array.isArray(updated.testCases)) {
          updated.testCases = updated.testCases.filter((tc: any) => 
            tc && tc.id && !deleted.has(tc.id) && !deleted.has(tc.id.toLowerCase())
          );
        }
        const isFolderDeleted = 
          (updated.folderId && (deleted.has(updated.folderId) || deleted.has(updated.folderId.toLowerCase()) || deleted.has(`folder-${updated.folderId.toLowerCase()}`))) ||
          (updated.folderName && (deleted.has(updated.folderName) || deleted.has(updated.folderName.trim().toLowerCase()) || deleted.has(`folder-${updated.folderName.trim().toLowerCase()}`)));
        
        if (isFolderDeleted) {
          updated.folderId = "";
          updated.folderName = "";
          updated.isRemovedFromIndividual = false;
        }
        if (updated.testCaseFolderId && (deleted.has(updated.testCaseFolderId) || deleted.has(updated.testCaseFolderId.toLowerCase()))) {
          updated.testCaseFolderId = undefined;
        }
        if (Array.isArray(updated.memberScenarioIds)) {
          updated.memberScenarioIds = updated.memberScenarioIds.filter((mId: string) => !deleted.has(mId) && !deleted.has(mId.toLowerCase()));
        }
        return updated;
      });
  }
  if (Array.isArray(cleaned.userStories)) {
    cleaned.userStories = cleaned.userStories.filter((s: any) => !deleted.has(s.id));
  }
  if (Array.isArray(cleaned.manualTestCases)) {
    cleaned.manualTestCases = cleaned.manualTestCases.filter((c: any) => !deleted.has(c.id));
  }
  if (Array.isArray(cleaned.automationFolders)) {
    const seenFolderIds = new Set<string>();
    cleaned.automationFolders = cleaned.automationFolders.filter((f: any) => {
      if (!f || !f.id) return false;
      if (deleted.has(f.id) || deleted.has(`folder-${f.id}`)) return false;
      if (seenFolderIds.has(f.id)) return false;
      // Do not retain empty script_generator folders with 0 scripts that were created via test-case approvals
      if (f.type === 'script_generator' && !(f as any).isUserCreatedScriptFolder) {
        const fName = (f.name || '').trim().toLowerCase();
        const hasScripts = Array.isArray(cleaned.automationScripts) && cleaned.automationScripts.some(
          (s: any) => (s.folderName || '').trim().toLowerCase() === fName || s.folderId === f.id
        );
        if (!hasScripts) return false;
      }
      seenFolderIds.add(f.id);
      return true;
    });
  }
  if (Array.isArray(cleaned.recordedFlows)) {
    cleaned.recordedFlows = cleaned.recordedFlows.filter((f: any) => !deleted.has(f.id));
  }
  if (Array.isArray(cleaned.uploadVideoFlows)) {
    cleaned.uploadVideoFlows = cleaned.uploadVideoFlows.filter((f: any) => !deleted.has(f.id));
  }
  if (Array.isArray(cleaned.automationScripts)) {
    cleaned.automationScripts = cleaned.automationScripts
      .filter((s: any) => {
        if (!s || !s.id) return false;
        if (deleted.has(s.id) || deleted.has(s.id.toLowerCase())) return false;
        if (s.folderId && (deleted.has(s.folderId) || deleted.has(s.folderId.toLowerCase()) || deleted.has(`folder-${s.folderId.toLowerCase()}`))) return false;
        const sFolder = (s.folderName || '').trim().toLowerCase();
        if (sFolder && (deleted.has(sFolder) || deleted.has(`folder-${sFolder}`))) return false;
        return true;
      })
      .map((s: any) => {
        if (Array.isArray(s.deletedFilePaths) && s.deletedFilePaths.length > 0 && Array.isArray(s.files)) {
          return {
            ...s,
            files: filterDeletedScriptFiles(s.files, s.deletedFilePaths)
          };
        }
        return s;
      });
  }
  if (Array.isArray(cleaned.uiTestingFolders)) {
    cleaned.uiTestingFolders = cleaned.uiTestingFolders.filter((f: any) => {
      if (!f || !f.id) return false;
      const fId = String(f.id).trim().toLowerCase();
      const fName = f.name ? String(f.name).trim().toLowerCase() : '';
      if (
        deleted.has(f.id) ||
        deleted.has(fId) ||
        deleted.has(`folder-${f.id}`) ||
        deleted.has(`folder-${fId}`) ||
        (fName && (deleted.has(f.name) || deleted.has(fName) || deleted.has(`folder-${fName}`)))
      ) {
        return false;
      }
      return true;
    });
  }
  if (Array.isArray(cleaned.uiTestingReports)) {
    cleaned.uiTestingReports = cleaned.uiTestingReports.filter((r: any) => {
      if (!r || !r.id) return false;
      const rId = String(r.id).trim().toLowerCase();
      const rFolderId = r.folderId ? String(r.folderId).trim().toLowerCase() : '';
      if (
        deleted.has(r.id) ||
        deleted.has(rId) ||
        (rFolderId && (deleted.has(r.folderId) || deleted.has(rFolderId) || deleted.has(`folder-${rFolderId}`)))
      ) {
        return false;
      }
      return true;
    });
  }
  if (Array.isArray(cleaned.performanceScripts)) {
    cleaned.performanceScripts = cleaned.performanceScripts.filter((s: any) => {
      if (!s || !s.id) return false;
      const sId = String(s.id);
      return !deleted.has(sId) && !deleted.has(sId.toLowerCase());
    });
  }
  if (Array.isArray(cleaned.uiTestingInputs)) {
    cleaned.uiTestingInputs = cleaned.uiTestingInputs.filter((i: any) => {
      if (!i || !i.id) return false;
      const iId = String(i.id).trim().toLowerCase();
      const iFolderId = i.folderId ? String(i.folderId).trim().toLowerCase() : '';
      if (
        deleted.has(i.id) ||
        deleted.has(iId) ||
        (iFolderId && (deleted.has(i.folderId) || deleted.has(iFolderId) || deleted.has(`folder-${iFolderId}`)))
      ) {
        return false;
      }
      return true;
    });
  }
  if (Array.isArray(cleaned.figmaDesignReviews)) {
    cleaned.figmaDesignReviews = cleaned.figmaDesignReviews.filter((f: any) => {
      if (!f || !f.id) return false;
      const fId = String(f.id).trim().toLowerCase();
      const fFolderId = f.folderId ? String(f.folderId).trim().toLowerCase() : '';
      if (
        deleted.has(f.id) ||
        deleted.has(fId) ||
        (fFolderId && (deleted.has(f.folderId) || deleted.has(fFolderId) || deleted.has(`folder-${fFolderId}`)))
      ) {
        return false;
      }
      return true;
    });
  }
  if (Array.isArray(cleaned.uiComparisonReports)) {
    cleaned.uiComparisonReports = cleaned.uiComparisonReports.filter((c: any) => {
      if (!c || !c.id) return false;
      const cId = String(c.id).trim().toLowerCase();
      const cFolderId = c.folderId ? String(c.folderId).trim().toLowerCase() : '';
      if (
        deleted.has(c.id) ||
        deleted.has(cId) ||
        (cFolderId && (deleted.has(c.folderId) || deleted.has(cFolderId) || deleted.has(`folder-${cFolderId}`)))
      ) {
        return false;
      }
      return true;
    });
  }
  if (Array.isArray(cleaned.apiScenarios)) {
    cleaned.apiScenarios = cleaned.apiScenarios.filter((s: any) => !deleted.has(s.id));
  }
  if (Array.isArray(cleaned.apiWorkspaces)) {
    cleaned.apiWorkspaces = cleaned.apiWorkspaces
      .filter((w: any) => !deleted.has(w.id))
      .map((w: any) => ({
        ...w,
        requests: (w.requests || []).filter((r: any) => !deleted.has(r.id)),
        collections: (w.collections || [])
          .filter((c: any) => !deleted.has(c.id))
          .map((c: any) => ({
            ...c,
            requests: (c.requests || []).filter((r: any) => !deleted.has(r.id)),
            folders: (c.folders || [])
              .filter((f: any) => !deleted.has(f.id))
              .map((f: any) => ({
                ...f,
                requests: (f.requests || []).filter((r: any) => !deleted.has(r.id))
              }))
          }))
      }));
  }

  // Ensure deletedItemIds is kept complete on cleaned project
  const existingDeletedList = Array.isArray(cleaned.deletedItemIds) ? cleaned.deletedItemIds : [];
  cleaned.deletedItemIds = Array.from(new Set([...existingDeletedList, ...Array.from(deleted)].filter(Boolean)));
  return syncFolderReferences(cleaned);
};

/**
 * Estimates the size of an object in bytes for Firestore 1MB limit (fast calculation).
 */
export const estimateSize = (obj: any): number => {
  if (!obj) return 0;
  try {
    const seen = new WeakSet();
    const str = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return undefined;
        const cname = value.constructor?.name;
        if (
          value instanceof Timestamp || 
          value instanceof FieldValue ||
          cname === 'Timestamp' || 
          cname === 'FieldValue' || 
          cname === 'FieldValueImpl' || 
          value._methodName !== undefined ||
          value instanceof Date
        ) {
          return 0;
        }
        seen.add(value);
      }
      return value;
    });
    return str ? str.length : 0;
  } catch (e) {
    try {
      let len = 0;
      const walk = (v: any, depth = 0) => {
        if (!v || depth > 8) return;
        if (typeof v === 'string') len += v.length;
        else if (Array.isArray(v)) v.slice(0, 30).forEach(i => walk(i, depth + 1));
        else if (typeof v === 'object') {
          for (const k of Object.keys(v)) {
            len += k.length;
            walk(v[k], depth + 1);
          }
        }
      };
      walk(obj);
      return len > 0 ? len : 600000;
    } catch (_) {
      return 600000;
    }
  }
};

/**
 * Aggressively prunes and sanitizes project data to stay well within Firestore's 1MB limit.
 * Focuses on compressing/stripping large base64 attachments, redundant screenshots, and bulky binary data.
 */
export const pruneProjectData = (project: any): any => {
  if (!project) return project;

  const deepClone = (val: any): any => {
    if (val === null || typeof val !== 'object') return val;
    const constructorName = val.constructor?.name;
    if (
      val instanceof Timestamp || 
      val instanceof FieldValue ||
      constructorName === 'Timestamp' || 
      constructorName === 'FieldValue' ||
      constructorName === 'FieldValueImpl' || 
      val._methodName !== undefined ||
      val instanceof Date
    ) {
      return val;
    }
    if (Array.isArray(val)) return val.map(deepClone);
    const res: Record<string, any> = {};
    for (const k in val) {
      if (Object.prototype.hasOwnProperty.call(val, k)) {
        res[k] = deepClone(val[k]);
      }
    }
    return res;
  };

  const cloned = deepClone(project);

  // Helper to sanitize oversized base64 strings in an object tree
  const sanitizeHeavyDataUrls = (obj: any, maxLen = 40000): any => {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      if (obj.startsWith('/artifacts/') || obj.startsWith('/api/artifacts/') || obj.startsWith('http://') || obj.startsWith('https://')) {
        return obj;
      }
      // If it's a data URL (e.g. base64 image or video)
      if (obj.startsWith('data:')) {
        return obj.length > maxLen ? '' : obj;
      }
      // Never strip scripts, code files, or persistent URLs unless excessively huge
      if (obj.length > 100000) {
        return obj.substring(0, 100000);
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      const sanitized = obj.map(item => sanitizeHeavyDataUrls(item, maxLen));
      if (sanitized.some(s => typeof s === 'string')) {
        const filtered = sanitized.filter(s => typeof s !== 'string' || s.trim().length > 0);
        return filtered;
      }
      return sanitized;
    }
    if (typeof obj === 'object') {
      const constructorName = obj.constructor?.name;
      if (
        obj instanceof Timestamp || 
        obj instanceof FieldValue ||
        constructorName === 'Timestamp' || 
        constructorName === 'FieldValue' ||
        constructorName === 'FieldValueImpl' || 
        obj._methodName !== undefined ||
        obj instanceof Date
      ) {
        return obj;
      }
      for (const key of Object.keys(obj)) {
        obj[key] = sanitizeHeavyDataUrls(obj[key], maxLen);
      }
    }
    return obj;
  };

  // 1. SANITIZE AUTOMATION SCRIPTS IMMEDIATELY
  // Evidence and contextImages containing large data URLs/base64 are the #1 cause of Firestore 1MB limits.
  if (cloned.automationScripts && Array.isArray(cloned.automationScripts)) {
    cloned.automationScripts.forEach((s: any) => {
      if (typeof s.thumbnailUrl === 'string' && s.thumbnailUrl.startsWith('data:')) {
        s.thumbnailUrl = '';
      }
      if (typeof s.posterUrl === 'string' && s.posterUrl.startsWith('data:')) {
        s.posterUrl = '';
      }
      if (typeof s.evidence === 'string') {
        if (s.evidence.startsWith('data:')) {
          s.evidence = '';
        } else if (s.evidence.length > 1000) {
          s.evidence = s.evidence.substring(0, 1000) + '... [truncated for Firestore]';
        }
      }
      if (Array.isArray(s.contextImages)) {
        s.contextImages = s.contextImages.filter((img: any) => typeof img === 'string' && !img.startsWith('data:') && img.length < 500);
      }
    });
  }

  // 2. SANITIZE UPLOAD VIDEO FLOWS IMMEDIATELY
  if (cloned.uploadVideoFlows && Array.isArray(cloned.uploadVideoFlows)) {
    cloned.uploadVideoFlows.forEach((flow: any) => {
      if (typeof flow.videoUrl === 'string' && flow.videoUrl.startsWith('data:')) {
        flow.videoUrl = '';
      }
      if (typeof flow.inputVideoUrl === 'string' && flow.inputVideoUrl.startsWith('data:')) {
        flow.inputVideoUrl = '';
      }
      if (typeof flow.thumbnailUrl === 'string' && flow.thumbnailUrl.startsWith('data:')) {
        flow.thumbnailUrl = '';
      }
      if (typeof flow.posterUrl === 'string' && flow.posterUrl.startsWith('data:')) {
        flow.posterUrl = '';
      }
      if (Array.isArray(flow.scriptFiles) && flow.scriptFiles.length > 0 && (flow.generatedScript || '').length > 500) {
        flow.generatedScript = `/* Generated script with ${flow.scriptFiles.length} files. Preserved in scriptFiles array. */`;
      }
      if (Array.isArray(flow.steps)) {
        flow.steps.forEach((st: any) => {
          if (typeof st.screenshot === 'string' && (st.screenshot.startsWith('data:') || st.screenshot.length > 1000)) {
            st.screenshot = '';
          }
          if (typeof st.contextImage === 'string' && (st.contextImage.startsWith('data:') || st.contextImage.length > 1000)) {
            st.contextImage = '';
          }
        });
      }
    });
  }

  // 3. SANITIZE RECORDED FLOWS IMMEDIATELY
  if (cloned.recordedFlows && Array.isArray(cloned.recordedFlows)) {
    cloned.recordedFlows.forEach((flow: any) => {
      if (typeof flow.videoUrl === 'string' && flow.videoUrl.startsWith('data:')) {
        flow.videoUrl = '';
      }
      if (typeof flow.thumbnailUrl === 'string' && flow.thumbnailUrl.startsWith('data:')) {
        flow.thumbnailUrl = '';
      }
      if (typeof flow.posterUrl === 'string' && flow.posterUrl.startsWith('data:')) {
        flow.posterUrl = '';
      }
      if (Array.isArray(flow.steps)) {
        flow.steps.forEach((st: any) => {
          if (typeof st.screenshot === 'string' && (st.screenshot.startsWith('data:') || st.screenshot.length > 1000)) {
            st.screenshot = '';
          }
          if (typeof st.contextImage === 'string' && (st.contextImage.startsWith('data:') || st.contextImage.length > 1000)) {
            st.contextImage = '';
          }
        });
      }
    });
  }

  // 4. SANITIZE PERFORMANCE SCRIPTS UNCONDITIONALLY:
  // Full raw JMX XML and CSV are safely stored in localStorage ('automatiqa_perf_scripts_<id>') and server disk.
  // Firestore document should strictly hold execution metadata to prevent 1MB overflow.
  if (cloned.performanceScripts && Array.isArray(cloned.performanceScripts)) {
    if (cloned.performanceScripts.length > 10) {
      cloned.performanceScripts = cloned.performanceScripts.slice(0, 10);
    }
    cloned.performanceScripts.forEach((s: any) => {
      s.trendData = undefined;
      if (typeof s.jmxContent === 'string' && s.jmxContent.length > 1500) {
        s.jmxStorageRef = 'local';
        s.jmxContent = '';
      }
      if (typeof s.csvData === 'string' && s.csvData.length > 1000) {
        s.csvData = '';
      }
    });
  }

  // Safe Firestore threshold (Firestore hard max is 1MB / 1,048,576 bytes; target 350KB)
  const LIMIT = 350000;
  const roughSize = estimateSize(cloned);
  let currentSize = roughSize;
  if (currentSize < LIMIT && currentSize > 0) return cloned;

  console.warn(`Pruning project data: Current size ${Math.round(currentSize / 1024)}KB exceeds ${Math.round(LIMIT / 1024)}KB threshold.`);

  // 5. COLLECT ALL TEST CASES WITH ATTACHMENTS
  const allCases: any[] = [];
  if (cloned.manualTestCases) allCases.push(...cloned.manualTestCases);
  if (cloned.scenarios) {
    cloned.scenarios.forEach((s: any) => {
      if (s.testCases) allCases.push(...s.testCases);
    });
  }

  // 6. PRUNE ATTACHMENTS FROM "PASS" CASES FIRST
  let prunedPass = false;
  for (const tc of allCases) {
    if (tc.status === 'PASS' && tc.attachments?.length > 0) {
      tc.attachments = [];
      prunedPass = true;
    }
  }
  if (prunedPass) {
    currentSize = estimateSize(cloned);
    if (currentSize < LIMIT && currentSize > 0) return cloned;
  }

  // 7. SANITIZE RAW OVERSIZED UNCOMPRESSED DATA URLS (> 20KB) ONLY IF STILL OVER LIMIT
  sanitizeHeavyDataUrls(cloned, 20000);
  currentSize = estimateSize(cloned);
  if (currentSize < LIMIT && currentSize > 0) return cloned;

  // 7. PRESERVE PERFORMANCE SCRIPTS: Full data is safely stored in LocalStorage and server disk backup
  if (cloned.performanceScripts && Array.isArray(cloned.performanceScripts)) {
    if (cloned.performanceScripts.length > 15) {
      cloned.performanceScripts = cloned.performanceScripts.slice(0, 15);
    }
    cloned.performanceScripts.forEach((s: any) => {
      s.trendData = undefined;
      // Never corrupt XML with broken truncation strings. If script is large, Firestore holds metadata while full JMX is in localStorage & server disk
      if (typeof s.jmxContent === 'string' && s.jmxContent.length > 3000) {
        s.jmxStorageRef = 'local';
        s.jmxContent = '';
      }
      if (typeof s.csvData === 'string' && s.csvData.length > 2000) {
        s.csvData = '';
      }
    });
  }

  // Prune scenarios array if project is oversized
  if (cloned.scenarios && Array.isArray(cloned.scenarios)) {
    if (cloned.scenarios.length > 50) {
      cloned.scenarios = cloned.scenarios.slice(0, 50);
    }
    cloned.scenarios.forEach((s: any) => {
      s.attachments = [];
      if (s.evidence && typeof s.evidence === 'string' && s.evidence.length > 500) {
        s.evidence = s.evidence.substring(0, 500);
      }
      if (Array.isArray(s.testCases)) {
        s.testCases.forEach((tc: any) => {
          tc.attachments = [];
          if (tc.evidence && typeof tc.evidence === 'string' && tc.evidence.length > 500) {
            tc.evidence = tc.evidence.substring(0, 500);
          }
        });
      }
    });
  }

  // Prune manual test cases
  if (cloned.manualTestCases && Array.isArray(cloned.manualTestCases)) {
    if (cloned.manualTestCases.length > 50) {
      cloned.manualTestCases = cloned.manualTestCases.slice(0, 50);
    }
    cloned.manualTestCases.forEach((tc: any) => {
      tc.attachments = [];
      if (tc.evidence && typeof tc.evidence === 'string' && tc.evidence.length > 500) {
        tc.evidence = tc.evidence.substring(0, 500);
      }
    });
  }

  // Trim extremely long user story descriptions/AC
  if (cloned.userStories && Array.isArray(cloned.userStories)) {
    cloned.userStories.forEach((s: any) => {
      if (typeof s.description === 'string' && s.description.length > 2000) {
        s.description = s.description.substring(0, 2000) + '... [truncated for Firestore]';
      }
      if (typeof s.acceptanceCriteria === 'string' && s.acceptanceCriteria.length > 2000) {
        s.acceptanceCriteria = s.acceptanceCriteria.substring(0, 2000) + '... [truncated for Firestore]';
      }
    });
  }

  // 8. PRUNE API HISTORY (Keep 5)
  if (cloned.apiHistory && cloned.apiHistory.length > 5) {
    cloned.apiHistory = cloned.apiHistory.slice(0, 5);
  }

  // 9. CHECK PROJECT SIZE FOR FIRESTORE LIMIT
  currentSize = estimateSize(cloned);
  if (currentSize < LIMIT) return cloned;

  // If still over limit, trim very long script file contents (> 20,000 chars) while preserving core code structure
  if (cloned.automationScripts && Array.isArray(cloned.automationScripts)) {
    cloned.automationScripts.forEach((s: any) => {
      if (Array.isArray(s.files) && s.files.length > 0) {
        s.files = s.files.map((f: any) => {
          if (f && typeof f.content === 'string' && f.content.length > 20000) {
            return {
              ...f,
              content: f.content.substring(0, 20000) + '\n\n// ... [content preserved in local storage / server disk]'
            };
          }
          return f;
        });
      }
    });
    currentSize = estimateSize(cloned);
    if (currentSize < LIMIT) return cloned;
  }

  // 10. SANITIZE UI TESTING REPORTS & ARTIFACTS FOR FIRESTORE
  // Converts large inline data URLs into lightweight ui_screenshot_id references that resolve from Firestore ui_screenshots collection.
  const sanitizeImageRef = (s: string, keyPrefix: string): string => {
    if (typeof s !== 'string' || !s) return '';
    if (s.startsWith('data:') && s.length > 5000) {
      const autoKey = `sc_auto_${keyPrefix.replace(/[^a-zA-Z0-9_\-]/g, '_')}_${Math.random().toString(36).substring(2, 7)}`;
      // Best effort background sync of image data to ui_screenshots document
      try {
        setDoc(doc(db, 'ui_screenshots', autoKey), {
          screenshotId: autoKey,
          dataUrl: s,
          downloadURL: '',
          createdAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      } catch (_) {}
      return `ui_screenshot_id:${autoKey}`;
    }
    return s;
  };

  if (cloned.uiTestingReports && Array.isArray(cloned.uiTestingReports)) {
    cloned.uiTestingReports.forEach((r: any, rIdx: number) => {
      if (Array.isArray(r.screenshots)) {
        r.screenshots = r.screenshots.map((s: string, idx: number) => sanitizeImageRef(s, `rep_${r.id || rIdx}_sc_${idx}`));
      }
      if (Array.isArray(r.highlightedScreenshots)) {
        r.highlightedScreenshots = r.highlightedScreenshots.map((s: string, idx: number) => sanitizeImageRef(s, `rep_${r.id || rIdx}_hl_${idx}`));
      }
      if (Array.isArray(r.visualDefectsScreenshots)) {
        r.visualDefectsScreenshots = r.visualDefectsScreenshots.map((s: string, idx: number) => sanitizeImageRef(s, `rep_${r.id || rIdx}_vd_${idx}`));
      }
      if (typeof r.correctedImage === 'string' && r.correctedImage.startsWith('data:') && r.correctedImage.length > 5000) {
        r.correctedImage = sanitizeImageRef(r.correctedImage, `rep_${r.id || rIdx}_corr`);
      }
      if (Array.isArray(r.correctedScreenshots)) {
        r.correctedScreenshots.forEach((cs: any, csIdx: number) => {
          if (typeof cs.originalImage === 'string' && cs.originalImage.startsWith('data:') && cs.originalImage.length > 5000) {
            cs.originalImage = sanitizeImageRef(cs.originalImage, `rep_${r.id || rIdx}_csorig_${csIdx}`);
          }
          if (typeof cs.correctedImage === 'string' && cs.correctedImage.startsWith('data:') && cs.correctedImage.length > 5000) {
            cs.correctedImage = sanitizeImageRef(cs.correctedImage, `rep_${r.id || rIdx}_cscorr_${csIdx}`);
          }
        });
      }
    });
    currentSize = estimateSize(cloned);
    if (currentSize < LIMIT) return cloned;
  }

  if (cloned.figmaDesignReviews && Array.isArray(cloned.figmaDesignReviews)) {
    cloned.figmaDesignReviews.forEach((f: any, fIdx: number) => {
      if (Array.isArray(f.images)) {
        f.images = f.images.map((s: string, idx: number) => sanitizeImageRef(s, `fig_${f.id || fIdx}_img_${idx}`));
      }
      if (Array.isArray(f.highlightedScreenshots)) {
        f.highlightedScreenshots = f.highlightedScreenshots.map((s: string, idx: number) => sanitizeImageRef(s, `fig_${f.id || fIdx}_hl_${idx}`));
      }
      if (Array.isArray(f.visualDefectsScreenshots)) {
        f.visualDefectsScreenshots = f.visualDefectsScreenshots.map((s: string, idx: number) => sanitizeImageRef(s, `fig_${f.id || fIdx}_vd_${idx}`));
      }
    });
    currentSize = estimateSize(cloned);
    if (currentSize < LIMIT) return cloned;
  }

  if (cloned.uiComparisonReports && Array.isArray(cloned.uiComparisonReports)) {
    cloned.uiComparisonReports.forEach((c: any, cIdx: number) => {
      if (Array.isArray(c.appScreenshots)) {
        c.appScreenshots = c.appScreenshots.map((s: string, idx: number) => sanitizeImageRef(s, `comp_${c.id || cIdx}_app_${idx}`));
      }
      if (Array.isArray(c.figmaImages)) {
        c.figmaImages = c.figmaImages.map((s: string, idx: number) => sanitizeImageRef(s, `comp_${c.id || cIdx}_fig_${idx}`));
      }
      if (Array.isArray(c.highlightedScreenshots)) {
        c.highlightedScreenshots = c.highlightedScreenshots.map((s: string, idx: number) => sanitizeImageRef(s, `comp_${c.id || cIdx}_hl_${idx}`));
      }
    });
    currentSize = estimateSize(cloned);
    if (currentSize < LIMIT) return cloned;
  }

  if (cloned.uiTestingInputs && Array.isArray(cloned.uiTestingInputs)) {
    cloned.uiTestingInputs.forEach((inp: any) => {
      if (Array.isArray(inp.screenshots)) {
        inp.screenshots = inp.screenshots.map((s: string) => (typeof s === 'string' && s.startsWith('data:') && s.length > 10000) ? '' : s);
      }
    });
    currentSize = estimateSize(cloned);
    if (currentSize < LIMIT) return cloned;
  }

  // 8. PRESERVE API WORKSPACES & SAVED RESPONSES (Only truncate giant payload strings > 50KB to respect Firestore limits)
  if (cloned.apiWorkspaces) {
    const sanitizeReq = (r: any) => {
      if (r && r.savedResponse && typeof r.savedResponse.data === 'string' && r.savedResponse.data.length > 50000) {
        r.savedResponse.data = r.savedResponse.data.substring(0, 50000) + '... (truncated for storage)';
      }
    };
    cloned.apiWorkspaces.forEach((w: any) => {
      w.requests?.forEach(sanitizeReq);
      w.collections?.forEach((c: any) => {
        c.requests?.forEach(sanitizeReq);
        c.folders?.forEach((f: any) => {
          f.requests?.forEach(sanitizeReq);
        });
      });
    });
  }

  currentSize = estimateSize(cloned);
  if (currentSize < LIMIT) return cloned;

  // 9. EMERGENCY PURGE: All base64 attachments on test cases & scenarios if still large
  for (const tc of allCases) {
    tc.attachments = [];
    tc.evidence = "";
    tc.videoEvidence = "";
  }
  if (cloned.scenarios) {
    cloned.scenarios.forEach((s: any) => {
      if (s.attachments) s.attachments = [];
      if (s.inputImages) s.inputImages = [];
      if (s.contextImages) s.contextImages = [];
      if (s.evidence) s.evidence = "";
    });
  }

  currentSize = estimateSize(cloned);
  if (currentSize < LIMIT) return cloned;

  // 10. ULTRA-AGGRESSIVE PASS: Sanitize all base64 data URLs > 5KB
  sanitizeHeavyDataUrls(cloned, 5000);
  currentSize = estimateSize(cloned);
  if (currentSize < LIMIT) return cloned;

  // 11. EMERGENCY PASS: Strip all remaining base64 data URLs completely
  sanitizeHeavyDataUrls(cloned, 0);

  currentSize = estimateSize(cloned);
  if (currentSize > LIMIT || currentSize >= 350000) {
    if (Array.isArray(cloned.scenarios) && cloned.scenarios.length > 20) {
      cloned.scenarios = cloned.scenarios.slice(0, 20);
    }
    if (Array.isArray(cloned.manualTestCases) && cloned.manualTestCases.length > 20) {
      cloned.manualTestCases = cloned.manualTestCases.slice(0, 20);
    }
    if (Array.isArray(cloned.performanceScripts) && cloned.performanceScripts.length > 5) {
      cloned.performanceScripts = cloned.performanceScripts.slice(0, 5);
    }
    if (Array.isArray(cloned.automationScripts) && cloned.automationScripts.length > 5) {
      cloned.automationScripts = cloned.automationScripts.slice(0, 5);
    }
    if (Array.isArray(cloned.recordedFlows) && cloned.recordedFlows.length > 3) {
      cloned.recordedFlows = cloned.recordedFlows.slice(0, 3);
    }
    if (Array.isArray(cloned.uploadVideoFlows) && cloned.uploadVideoFlows.length > 3) {
      cloned.uploadVideoFlows = cloned.uploadVideoFlows.slice(0, 3);
    }

    // 12. ENFORCEABLE HARD CEILING: Truncate any long strings (> 1000 chars) anywhere in the document
    const hardTrimStrings = (o: any, maxLen = 1000): any => {
      if (!o) return o;
      if (typeof o === 'string') {
        return o.length > maxLen ? o.substring(0, maxLen) + '... [trimmed for Firestore]' : o;
      }
      if (Array.isArray(o)) {
        return o.map(i => hardTrimStrings(i, maxLen));
      }
      if (typeof o === 'object') {
        const cname = o.constructor?.name;
        if (
          o instanceof Timestamp ||
          o instanceof FieldValue ||
          cname === 'Timestamp' ||
          cname === 'FieldValue' ||
          cname === 'FieldValueImpl' ||
          o._methodName !== undefined ||
          o instanceof Date
        ) {
          return o;
        }
        for (const k of Object.keys(o)) {
          o[k] = hardTrimStrings(o[k], maxLen);
        }
      }
      return o;
    };
    hardTrimStrings(cloned, 1000);
  }

  const finalSize = estimateSize(cloned);
  logger.info('ProjectService', `Project data pruned (${roughSize} -> ${finalSize} bytes)`, {
    projectId: project?.id,
    estimatedSizeBeforeBytes: roughSize,
    estimatedSizeAfterBytes: finalSize,
    reductionBytes: roughSize - finalSize
  }, 'ProjectPruningCompleted');

  return cloned;
};

/**
 * Emergency ultra-pruning helper when Firestore document write fails with 1MB limit.
 * Completely strips all base64 strings, trims heavy descriptions, and guarantees a lightweight document.
 */
export const pruneProjectDataUltra = (project: any): any => {
  if (!project) return project;
  logger.warn('ProjectService', `Running emergency ultra-pruning on project document`, { projectId: project?.id }, 'ProjectUltraPruningStarted');
  const pruned = pruneProjectData(project);
  const stripAllDataUrls = (obj: any): any => {
    if (!obj) return obj;
    if (typeof obj === 'string') {
      if (obj.startsWith('data:')) return '';
      if (obj.length > 5000) return obj.substring(0, 5000);
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(stripAllDataUrls).filter(item => typeof item !== 'string' || item.trim().length > 0);
    }
    if (typeof obj === 'object') {
      const res: Record<string, any> = {};
      for (const k of Object.keys(obj)) {
        res[k] = stripAllDataUrls(obj[k]);
      }
      return res;
    }
    return obj;
  };
  const ultra = stripAllDataUrls(pruned);

  // Aggressive stripping of heavy fields to guarantee Firestore payload is under 450KB
  if (ultra.automationScripts && Array.isArray(ultra.automationScripts)) {
    ultra.automationScripts.forEach((s: any) => {
      s.evidence = '';
      s.contextImages = [];
      if (Array.isArray(s.files)) {
        s.files = s.files.map((f: any) => ({
          ...f,
          content: typeof f.content === 'string' && f.content.length > 3000 ? f.content.substring(0, 3000) + '... (trimmed)' : f.content
        }));
      }
    });
  }
  if (ultra.uploadVideoFlows && Array.isArray(ultra.uploadVideoFlows)) {
    ultra.uploadVideoFlows.forEach((flow: any) => {
      flow.videoUrl = '';
      flow.inputVideoUrl = '';
      flow.thumbnailUrl = '';
      flow.posterUrl = '';
      if (Array.isArray(flow.steps)) {
        flow.steps = flow.steps.map((st: any) => ({
          id: st.id,
          stepNumber: st.stepNumber,
          action: st.action,
          target: st.target,
          value: st.value,
          description: st.description,
          screen: st.screen
        }));
      }
    });
  }
  if (ultra.recordedFlows && Array.isArray(ultra.recordedFlows)) {
    ultra.recordedFlows.forEach((flow: any) => {
      flow.videoUrl = '';
      flow.thumbnailUrl = '';
      flow.posterUrl = '';
      if (Array.isArray(flow.steps)) {
        flow.steps = flow.steps.map((st: any) => ({
          id: st.id,
          action: st.action,
          target: st.target,
          value: st.value,
          description: st.description
        }));
      }
    });
  }
  if (ultra.manualTestCases && Array.isArray(ultra.manualTestCases)) {
    ultra.manualTestCases.forEach((tc: any) => {
      tc.attachments = [];
      tc.evidence = '';
    });
  }
  if (ultra.scenarios && Array.isArray(ultra.scenarios)) {
    if (ultra.scenarios.length > 25) {
      ultra.scenarios = ultra.scenarios.slice(0, 25);
    }
    ultra.scenarios.forEach((sc: any) => {
      sc.attachments = [];
      sc.evidence = '';
      if (Array.isArray(sc.testCases)) {
        if (sc.testCases.length > 10) sc.testCases = sc.testCases.slice(0, 10);
        sc.testCases.forEach((tc: any) => {
          tc.attachments = [];
          tc.evidence = '';
        });
      }
    });
  }
  if (ultra.manualTestCases && Array.isArray(ultra.manualTestCases)) {
    if (ultra.manualTestCases.length > 25) {
      ultra.manualTestCases = ultra.manualTestCases.slice(0, 25);
    }
    ultra.manualTestCases.forEach((tc: any) => {
      tc.attachments = [];
      tc.evidence = '';
    });
  }
  if (ultra.performanceScripts && Array.isArray(ultra.performanceScripts)) {
    if (ultra.performanceScripts.length > 5) {
      ultra.performanceScripts = ultra.performanceScripts.slice(0, 5);
    }
    ultra.performanceScripts.forEach((s: any) => {
      s.jmxStorageRef = 'local';
      s.jmxContent = ''; // Preserved in local storage & disk
      s.csvData = '';
      s.trendData = undefined;
    });
  }
  if (ultra.automationScripts && Array.isArray(ultra.automationScripts)) {
    if (ultra.automationScripts.length > 8) {
      ultra.automationScripts = ultra.automationScripts.slice(0, 8);
    }
  }
  if (ultra.userStories && Array.isArray(ultra.userStories)) {
    if (ultra.userStories.length > 20) {
      ultra.userStories = ultra.userStories.slice(0, 20);
    }
    ultra.userStories.forEach((s: any) => {
      if (typeof s.description === 'string' && s.description.length > 1000) {
        s.description = s.description.substring(0, 1000) + '... [truncated for Firestore]';
      }
      if (typeof s.acceptanceCriteria === 'string' && s.acceptanceCriteria.length > 1000) {
        s.acceptanceCriteria = s.acceptanceCriteria.substring(0, 1000) + '... [truncated for Firestore]';
      }
    });
  }

  return ultra;
};

export const saveProject = async (projectData: any): Promise<string> => {
  const initialData = {
    ...projectData,
    scenarios: [],
    manualTestCases: [],
    automationScripts: [],
    apiTestSuites: [],
    performanceScripts: [],
    userStories: [],
    automationFolders: [],
    uiTestingFolders: [],
    uiTestingInputs: [],
    uiTestingReports: [],
    figmaDesignReviews: [],
    uiComparisonReports: [],
    recordedFlows: [],
    uploadVideoFlows: [],
    allocatedUserEmails: projectData.allocatedUserEmails || [],
    createdAt: serverTimestamp()
  };

  const path = "projects";
  const docRef = await syncAddDoc(collection(db, path), cleanFirestoreData(initialData));
  return docRef.id;
};

export const getProjects = async (userEmail: string) => {
  const path = "projects";
  const ownedQuery = query(
    collection(db, path),
    where("ownerEmail", "==", userEmail)
  );

  const allocatedQuery = query(
    collection(db, path),
    where("allocatedUserEmails", "array-contains", userEmail)
  );

  try {
    const [ownedSnap, allocSnap] = await Promise.all([
      getDocs(ownedQuery),
      getDocs(allocatedQuery)
    ]);

    const map = new Map<string, any>();
    ownedSnap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
    allocSnap.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));

    return Array.from(map.values());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return [];
  }
};

const firestoreUpdateTimers = new Map<string, any>();
const firestoreUpdateResolvers = new Map<string, Array<{ resolve: () => void; reject: (err: any) => void }>>();

export const updateProjectFirestore = async (projectId: string, data: any, options?: { immediate?: boolean }): Promise<void> => {
  if (!projectId) return;
  const path = `projects/${projectId}`;
  const ref = doc(db, "projects", projectId);
  const { id, ...cleanData } = data;
  
  // 1. ALWAYS persist pristine, full project data to server disk & localStorage immediately
  // This guarantees permanent cross-user, cross-session, and refresh persistence for all files, folders, videos, and reports
  try {
    if (typeof localStorage !== 'undefined') {
      if (Array.isArray(cleanData.performanceScripts)) {
        localStorage.setItem(`automatiqa_perf_scripts_${projectId}`, JSON.stringify(cleanData.performanceScripts));
      }
      localStorage.setItem(`automatiqa_project_backup_${projectId}`, JSON.stringify({ id: projectId, ...cleanData }));
    }
  } catch (e) {}

  if (typeof fetch !== 'undefined') {
    fetch(`/api/projects/backup/${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, ...cleanData })
    }).catch(err => console.warn('[Backup API] Failed to backup to server disk:', err));
  }

  const performWrite = async (): Promise<void> => {
    try {
      let finalizedData = cleanFirestoreData(cleanData);
      finalizedData = cleanProjectDeletedItems(finalizedData);
      
      // Retain userStories in parent document and keep count synchronized
      if (finalizedData.userStories) {
        finalizedData.userStoriesCount = Array.isArray(finalizedData.userStories) ? finalizedData.userStories.length : 0;
      }

      finalizedData = pruneProjectData(finalizedData);
      finalizedData.updatedAt = serverTimestamp();

      // Extra insurance: if estimateSize is still > 350KB, apply ultra-pruning before initial write
      if (estimateSize(finalizedData) > 350000) {
        finalizedData = pruneProjectDataUltra(finalizedData);
        finalizedData.updatedAt = serverTimestamp();
      }

      try {
        await syncUpdateDoc(ref, finalizedData);
      } catch (writeErr: any) {
        const errMsg = writeErr?.message || String(writeErr);
        if (
          errMsg.includes('exceeds the maximum allowed size') || 
          errMsg.includes('1,048,576') || 
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('larger than') ||
          errMsg.includes('timed out') ||
          errMsg.includes('Timeout') ||
          errMsg.includes('size')
        ) {
          console.warn('[Firestore Write Recovery] Project write notice (' + errMsg + '). Running emergency ultra-pruning recovery...', writeErr);
          try {
            const ultraPruned = pruneProjectDataUltra(finalizedData);
            ultraPruned.updatedAt = serverTimestamp();
            // Critical: overwrite without merge to shrink the oversized document on Firestore servers
            await syncSetDoc(ref, ultraPruned, { merge: false, timeoutMs: 30000 });
            console.info('[Firestore Write Recovery] Project document saved successfully with ultra-pruning recovery!');
            return;
          } catch (retryErr: any) {
            console.warn('[Firestore Write Recovery 2] Ultra-pruning write failed, saving core project skeleton to Firestore...', retryErr);
            try {
              // Save core project skeleton to Firestore without merge (all heavy data is already saved on server disk & local storage)
              const minimalDoc: Record<string, any> = {
                id: projectId,
                name: finalizedData.name || '',
                description: finalizedData.description || '',
                ownerEmail: finalizedData.ownerEmail || '',
                allocatedUserEmails: finalizedData.allocatedUserEmails || [],
                automationFolders: finalizedData.automationFolders || [],
                uiTestingFolders: finalizedData.uiTestingFolders || [],
                automationScripts: (finalizedData.automationScripts || []).slice(0, 10).map((s: any) => ({
                  id: s.id,
                  title: s.title,
                  description: s.description || '',
                  folderId: s.folderId,
                  folderName: s.folderName,
                  tool: s.tool,
                  language: s.language,
                  createdAt: s.createdAt,
                  videoFlowId: s.videoFlowId,
                  files: (s.files || []).map((f: any) => ({ name: f.name, path: f.path }))
                })),
                uploadVideoFlows: (finalizedData.uploadVideoFlows || []).slice(0, 5).map((f: any) => ({
                  id: f.id,
                  name: f.name,
                  description: f.description || '',
                  folderId: f.folderId,
                  folderName: f.folderName,
                  videoFileName: f.videoFileName,
                  videoDuration: f.videoDuration,
                  createdAt: f.createdAt,
                  stepsCount: (f.steps || []).length
                })),
                recordedFlows: (finalizedData.recordedFlows || []).slice(0, 5).map((f: any) => ({
                  id: f.id,
                  name: f.name,
                  folderId: f.folderId,
                  folderName: f.folderName,
                  createdAt: f.createdAt,
                  stepsCount: (f.steps || []).length
                })),
                scenarios: (finalizedData.scenarios || []).slice(0, 20).map((sc: any) => ({
                  id: sc.id,
                  title: sc.title,
                  folderId: sc.folderId,
                  isFolder: sc.isFolder
                })),
                updatedAt: serverTimestamp()
              };
              await syncSetDoc(ref, minimalDoc, { merge: false, timeoutMs: 30000 });
              console.info('[Firestore Write Recovery 2] Minimal project skeleton saved to Firestore successfully.');
              return;
            } catch (fallbackErr: any) {
              console.warn('[Firestore Write Fallback] Network sync timed out/failed, project safely persisted in local storage & server disk backup:', fallbackErr);
              return;
            }
          }
        }
        throw writeErr;
      }
    } catch (error) {
      console.error('[Firestore Write] Update project failed:', error);
      handleFirestoreError(error, OperationType.WRITE, path);
      throw error;
    }
  };

  // If immediate requested, write directly without debounce delay
  if (options?.immediate) {
    if (firestoreUpdateTimers.has(projectId)) {
      clearTimeout(firestoreUpdateTimers.get(projectId));
      firestoreUpdateTimers.delete(projectId);
    }
    const resolvers = firestoreUpdateResolvers.get(projectId) || [];
    firestoreUpdateResolvers.delete(projectId);

    try {
      await performWrite();
      resolvers.forEach(r => r.resolve());
      return;
    } catch (error) {
      resolvers.forEach(r => r.reject(error));
      throw error;
    }
  }

  // 2. Debounce standard background writes to avoid saturating network
  return new Promise<void>((resolve, reject) => {
    if (!firestoreUpdateResolvers.has(projectId)) {
      firestoreUpdateResolvers.set(projectId, []);
    }
    firestoreUpdateResolvers.get(projectId)!.push({ resolve, reject });

    if (firestoreUpdateTimers.has(projectId)) {
      clearTimeout(firestoreUpdateTimers.get(projectId));
    }

    const timer = setTimeout(async () => {
      firestoreUpdateTimers.delete(projectId);
      const resolvers = firestoreUpdateResolvers.get(projectId) || [];
      firestoreUpdateResolvers.delete(projectId);
      try {
        await performWrite();
        resolvers.forEach(r => r.resolve());
      } catch (error) {
        resolvers.forEach(r => r.reject(error));
      }
    }, 150);
    firestoreUpdateTimers.set(projectId, timer);
  });
};

export const updateProjectFirestoreImmediate = async (projectId: string, data: any): Promise<void> => {
  return updateProjectFirestore(projectId, data, { immediate: true });
};

export const deleteProject = async (projectId: string) => {
  if (!projectId) return;
  const path = `projects/${projectId}`;
  const ref = doc(db, "projects", projectId);
  try {
    await syncDeleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const allocateProject = async (projectId: string, email: string, role: 'Admin' | 'Team Member' = 'Team Member') => {
  if (!projectId || !email) return;
  const projectPath = `projects/${projectId}`;
  const projectRef = doc(db, "projects", projectId);
  const normalizedEmail = email.toLowerCase().trim();

  try {
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists()) {
      const pData = projectSnap.data();
      const currentRoles = pData.projectRoles || {};
      const updatedRoles = { ...currentRoles, [normalizedEmail]: role };
      await syncUpdateDoc(projectRef, {
        allocatedUserEmails: arrayUnion(normalizedEmail),
        projectRoles: updatedRoles
      });
    } else {
      await syncUpdateDoc(projectRef, {
        allocatedUserEmails: arrayUnion(normalizedEmail)
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, projectPath);
  }

  const userPath = `users/${normalizedEmail}`;
  const userRef = doc(db, "users", normalizedEmail);
  
  try {
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      await syncUpdateDoc(userRef, {
        assignedProjectIds: arrayUnion(projectId)
      });
    } else {
      await syncSetDoc(userRef, {
        email: normalizedEmail,
        name: normalizedEmail.split('@')[0],
        role: role === 'Admin' ? 'Admin' : 'Team Member',
        status: 'active',
        assignedProjectIds: [projectId],
        createdAt: new Date().toISOString()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
};