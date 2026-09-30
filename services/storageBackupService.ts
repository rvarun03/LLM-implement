/**
 * storageBackupService.ts
 * 
 * Provides robust multi-tier persistence for projects, automation scripts, and large POM suites:
 * 1. Fast In-Memory Map Cache (instant synchronous access, prevents React state loss during async operations)
 * 2. IndexedDB Storage (unlimited client-side storage, eliminates localStorage 5MB quota errors)
 * 3. Server-side Disk Backup via /api/projects/backup/:id
 * 4. Safe Merge Utility (guarantees uploaded scripts and 135+ POM files never disappear during refinement or Firestore sync)
 */

import { Project, AutomationScript, AutomationScriptFile, PerformanceScript, UserStory } from '../types';
import { generateUniqueFolderId } from '../utils/idGenerator';

// 1. In-Memory Project Cache (survives component remounts and async calls)
const memoryProjectCache = new Map<string, Project>();

// Helper to check if IndexedDB is available
const hasIndexedDb = (): boolean => {
  return typeof window !== 'undefined' && 'indexedDB' in window;
};

const DB_NAME = 'AutomatiqaStorageDB';
const DB_VERSION = 1;
const STORE_NAME = 'project_backups';

const openDb = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    if (!hasIndexedDb()) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };
      request.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
};

// Helper to retrieve all permanently deleted IDs from localStorage and project
const getGlobalDeletedSet = (project?: any): Set<string> => {
  const set = new Set<string>();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('automatiqa_deleted_ids');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach((id: string) => {
            if (id) {
              const str = String(id).trim().toLowerCase();
              set.add(str);
              set.add(`folder-${str}`);
            }
          });
        }
      }
    }
  } catch (e) {}
  if (project && Array.isArray(project.deletedItemIds)) {
    project.deletedItemIds.forEach((id: string) => {
      if (id) {
        const str = String(id).trim().toLowerCase();
        set.add(str);
        set.add(`folder-${str}`);
      }
    });
  }
  return set;
};

/**
 * Normalizes, deduplicates, and synchronizes all folders and their references across
 * recorded flows, upload video flows, and automation scripts.
 * Guarantees:
 * 1. Folders with saved video flows always have type 'upload_video'
 * 2. Duplicate folders (same name & platform) are safely merged without data loss
 * 3. Any folder referenced by an uploadVideoFlow is auto-restored into automationFolders if missing
 * 4. Flow and script folderId / folderName references point to canonical folder IDs
 */
export const syncFolderReferences = <T extends Partial<Project>>(project: T): T => {
  if (!project) return project;

  const deletedSet = getGlobalDeletedSet(project);

  if (Array.isArray(project.uiTestingFolders)) {
    (project as any).uiTestingFolders = project.uiTestingFolders.filter(f => {
      if (!f || !f.id) return false;
      const fId = String(f.id).trim().toLowerCase();
      const fName = f.name ? String(f.name).trim().toLowerCase() : '';
      return !deletedSet.has(f.id) && !deletedSet.has(fId) && !deletedSet.has(`folder-${fId}`) && (!fName || (!deletedSet.has(f.name) && !deletedSet.has(fName) && !deletedSet.has(`folder-${fName}`)));
    });
  }
  if (Array.isArray(project.uiTestingReports)) {
    (project as any).uiTestingReports = project.uiTestingReports.filter(r => {
      if (!r || !r.id) return false;
      const rId = String(r.id).trim().toLowerCase();
      const rFId = r.folderId ? String(r.folderId).trim().toLowerCase() : '';
      return !deletedSet.has(r.id) && !deletedSet.has(rId) && (!rFId || (!deletedSet.has(r.folderId) && !deletedSet.has(rFId) && !deletedSet.has(`folder-${rFId}`)));
    });
  }
  if (Array.isArray(project.uiTestingInputs)) {
    (project as any).uiTestingInputs = project.uiTestingInputs.filter(i => {
      if (!i || !i.id) return false;
      const iId = String(i.id).trim().toLowerCase();
      const iFId = i.folderId ? String(i.folderId).trim().toLowerCase() : '';
      return !deletedSet.has(i.id) && !deletedSet.has(iId) && (!iFId || (!deletedSet.has(i.folderId) && !deletedSet.has(iFId) && !deletedSet.has(`folder-${iFId}`)));
    });
  }
  if (Array.isArray(project.figmaDesignReviews)) {
    (project as any).figmaDesignReviews = project.figmaDesignReviews.filter(f => {
      if (!f || !f.id) return false;
      const fId = String(f.id).trim().toLowerCase();
      const fFId = f.folderId ? String(f.folderId).trim().toLowerCase() : '';
      return !deletedSet.has(f.id) && !deletedSet.has(fId) && (!fFId || (!deletedSet.has(f.folderId) && !deletedSet.has(fFId) && !deletedSet.has(`folder-${fFId}`)));
    });
  }
  if (Array.isArray(project.uiComparisonReports)) {
    (project as any).uiComparisonReports = project.uiComparisonReports.filter(c => {
      if (!c || !c.id) return false;
      const cId = String(c.id).trim().toLowerCase();
      const cFId = c.folderId ? String(c.folderId).trim().toLowerCase() : '';
      return !deletedSet.has(c.id) && !deletedSet.has(cId) && (!cFId || (!deletedSet.has(c.folderId) && !deletedSet.has(cFId) && !deletedSet.has(`folder-${cFId}`)));
    });
  }

  const rawFolders = (Array.isArray(project.automationFolders) ? [...project.automationFolders] : [])
    .filter(f => f && f.id && !deletedSet.has(String(f.id).trim().toLowerCase()) && !deletedSet.has(`folder-${String(f.id).trim().toLowerCase()}`));
  const rawUploadFlows = Array.isArray(project.uploadVideoFlows) ? [...project.uploadVideoFlows] : [];
  const rawRecordedFlows = Array.isArray(project.recordedFlows) ? [...project.recordedFlows] : [];
  const rawScripts = Array.isArray(project.automationScripts) ? [...project.automationScripts] : [];

  // 1. Deduplicate folders by type + normalized name + platform so flow folders, video folders, and script folders never collide
  const canonicalFolders: typeof rawFolders = [];
  const seenFolderIds = new Set<string>();
  const aliasMap = new Map<string, string>(); // oldId / duplicateId -> canonicalId
  const idRemapByType = new Map<string, string>(); // `${oldDuplicateId}___${folderType}` -> newUniqueId
  const seenKeyToCanonical = new Map<string, typeof rawFolders[0]>();

  for (const folder of rawFolders) {
    if (!folder || !folder.name) continue;
    const folderType = folder.type || 'flow';
    const normName = folder.name.trim().toLowerCase();
    const plat = folder.platform || 'all';
    const key = `${folderType}___${normName}___${plat}`;

    // Ensure folder has a valid ID
    let currentId = (folder.id || '').trim();
    if (!currentId) {
      currentId = generateUniqueFolderId('folder');
    }

    if (seenKeyToCanonical.has(key)) {
      // Same logical folder already exists (same type, normalized name, and platform)
      const canonical = seenKeyToCanonical.get(key)!;
      aliasMap.set(currentId, canonical.id);
      idRemapByType.set(`${currentId}___${folderType}`, canonical.id);
      if (normName === canonical.id.toLowerCase()) {
        aliasMap.set(normName, canonical.id);
      }
      if (!canonical.platform && folder.platform) {
        canonical.platform = folder.platform;
      }
      if (!canonical.type && folder.type) {
        canonical.type = folder.type;
      }
      if ((folder as any).isImported && !(canonical as any).isImported) {
        (canonical as any).isImported = true;
      }
    } else {
      // First time seeing this logical folder (type + name + platform)
      let finalFolderId = currentId;
      if (seenFolderIds.has(finalFolderId)) {
        // ID collision with a folder of a DIFFERENT type or name!
        // Generate a new unique ID so no two folders ever share the same ID
        finalFolderId = generateUniqueFolderId('folder');
        idRemapByType.set(`${currentId}___${folderType}`, finalFolderId);
        aliasMap.set(`${currentId}___${folderType}`, finalFolderId);
      }

      seenFolderIds.add(finalFolderId);
      const canonical = { 
        ...folder, 
        id: finalFolderId,
        name: folder.name.trim(),
        type: folderType as any,
        platform: folder.platform || 'web'
      };
      seenKeyToCanonical.set(key, canonical);
      canonicalFolders.push(canonical);
    }
  }

  // 2. Synchronize and permanently preserve recorded flows and their folders
  const updatedRecordedFlows = rawRecordedFlows.map(flow => {
    if (!flow) return flow;
    const rawId = flow.folderId;
    const currentFolderId = rawId ? (idRemapByType.get(`${rawId}___flow`) || aliasMap.get(rawId) || rawId) : undefined;
    const currentFolderName = (flow.folderName || '').trim();
    const lowerFolderName = currentFolderName.toLowerCase();

    // Match against canonical folders by ID or by name (prioritizing flow folders)
    let matchedFolder = canonicalFolders.find(
      f => (f.type === 'flow' || !f.type) && (
        (currentFolderId && f.id === currentFolderId) ||
        (lowerFolderName && f.name.trim().toLowerCase() === lowerFolderName)
      )
    );

    // Fallback: match any flow folder by ID if not found above
    if (!matchedFolder && currentFolderId) {
      matchedFolder = canonicalFolders.find(f => f.id === currentFolderId && (f.type === 'flow' || !f.type));
    }

    if (matchedFolder) {
      if (!matchedFolder.type) {
        matchedFolder.type = 'flow';
      }
      if (!matchedFolder.platform && flow.platform) {
        matchedFolder.platform = flow.platform;
      }
      return {
        ...flow,
        folderId: matchedFolder.id,
        folderName: matchedFolder.name
      };
    }

    // Auto-restore folder into canonicalFolders if flow references a folder that is missing
    if (currentFolderName || currentFolderId) {
      const lowerName = currentFolderName.toLowerCase();
      if ((currentFolderId && (deletedSet.has(currentFolderId.toLowerCase()) || deletedSet.has(`folder-${currentFolderId.toLowerCase()}`))) ||
          (lowerName && (deletedSet.has(lowerName) || deletedSet.has(`folder-${lowerName}`)))) {
        return { ...flow, folderId: undefined, folderName: undefined };
      }
      let restoreId = currentFolderId;
      if (!restoreId || seenFolderIds.has(restoreId)) {
        restoreId = generateUniqueFolderId('folder');
      }
      seenFolderIds.add(restoreId);
      const restoredFolder = {
        id: restoreId,
        name: currentFolderName || 'Recorded Flows',
        type: 'flow' as const,
        platform: (flow.platform as ('web' | 'mobile')) || 'web'
      };
      canonicalFolders.push(restoredFolder);
      return {
        ...flow,
        folderId: restoredFolder.id,
        folderName: restoredFolder.name
      };
    }

    return flow;
  });

  // 3. Synchronize and restore upload video folders
  const updatedUploadFlows = rawUploadFlows.map(flow => {
    if (!flow) return flow;
    const rawId = flow.folderId;
    const currentFolderId = rawId ? (idRemapByType.get(`${rawId}___upload_video`) || aliasMap.get(rawId) || rawId) : undefined;
    const currentFolderName = (flow.folderName || '').trim();
    const lowerFolderName = currentFolderName.toLowerCase();

    // Match against canonical folders by ID or by name (scoped to upload_video or untyped)
    let matchedFolder = canonicalFolders.find(
      f => (f.type === 'upload_video' || !f.type) && (
        (currentFolderId && f.id === currentFolderId) || 
        (lowerFolderName && f.name.trim().toLowerCase() === lowerFolderName)
      )
    );

    if (matchedFolder) {
      if (!matchedFolder.type) {
        matchedFolder.type = 'upload_video';
      }
      if (!matchedFolder.platform && flow.platform) {
        matchedFolder.platform = flow.platform;
      }
      return {
        ...flow,
        folderId: matchedFolder.id,
        folderName: matchedFolder.name
      };
    }

    // If flow references a folder (by name or ID) that is missing from canonicalFolders, auto-restore it
    if (currentFolderName || currentFolderId) {
      if ((currentFolderId && (deletedSet.has(currentFolderId.toLowerCase()) || deletedSet.has(`folder-${currentFolderId.toLowerCase()}`))) ||
          (lowerFolderName && (deletedSet.has(lowerFolderName) || deletedSet.has(`folder-${lowerFolderName}`)))) {
        return { ...flow, folderId: undefined, folderName: undefined };
      }
      let restoreId = currentFolderId;
      if (!restoreId || seenFolderIds.has(restoreId)) {
        restoreId = generateUniqueFolderId('folder');
      }
      seenFolderIds.add(restoreId);
      const restoredFolder = {
        id: restoreId,
        name: currentFolderName || 'Video Flows',
        type: 'upload_video' as const,
        platform: flow.platform || 'web'
      };
      canonicalFolders.push(restoredFolder);
      return {
        ...flow,
        folderId: restoredFolder.id,
        folderName: restoredFolder.name
      };
    }

    return flow;
  });

  // 4. Synchronize automation scripts references
  const updatedScripts = rawScripts.map(script => {
    if (!script) return script;
    const rawId = script.folderId;
    const currentFolderId = rawId ? (idRemapByType.get(`${rawId}___script`) || aliasMap.get(rawId) || rawId) : undefined;
    const currentFolderName = (script.folderName || '').trim();
    const lowerFolderName = currentFolderName.toLowerCase();

    const matchedFolder = canonicalFolders.find(
      f => (f.type === 'script' || !f.type) && (
        (currentFolderId && f.id === currentFolderId) ||
        (lowerFolderName && f.name.trim().toLowerCase() === lowerFolderName)
      )
    );

    if (matchedFolder) {
      if (!matchedFolder.type) {
        matchedFolder.type = 'script';
      }
      return {
        ...script,
        folderId: matchedFolder.id,
        folderName: matchedFolder.name
      };
    }

    if (currentFolderName || currentFolderId) {
      if ((currentFolderId && (deletedSet.has(currentFolderId.toLowerCase()) || deletedSet.has(`folder-${currentFolderId.toLowerCase()}`))) ||
          (lowerFolderName && (deletedSet.has(lowerFolderName) || deletedSet.has(`folder-${lowerFolderName}`)))) {
        return { ...script, folderId: undefined, folderName: undefined };
      }
      let restoreId = currentFolderId;
      if (!restoreId || seenFolderIds.has(restoreId)) {
        restoreId = generateUniqueFolderId('folder');
      }
      seenFolderIds.add(restoreId);
      const restoredFolder = {
        id: restoreId,
        name: currentFolderName || 'Automation Scripts',
        type: 'script' as const,
        platform: (script as any).platform || 'web'
      };
      canonicalFolders.push(restoredFolder);
      return {
        ...script,
        folderId: restoredFolder.id,
        folderName: restoredFolder.name
      };
    }

    return script;
  });

  return {
    ...project,
    automationFolders: canonicalFolders,
    uploadVideoFlows: updatedUploadFlows,
    recordedFlows: updatedRecordedFlows,
    automationScripts: updatedScripts
  };
};

/**
 * Save project to in-memory cache, IndexedDB, localStorage (if fits), and server backup
 */
export const saveProjectBackup = async (project: Project): Promise<void> => {
  if (!project || !project.id) return;

  // Run full folder and reference synchronization before persisting
  const syncedProject = syncFolderReferences(project) as Project;

  // 1. In-Memory Cache update immediately
  memoryProjectCache.set(syncedProject.id, { ...syncedProject });

  // 1b. Dedicated lightweight performance scripts backup (immune to 5MB localStorage limits)
  if (Array.isArray(syncedProject.performanceScripts)) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(`automatiqa_perf_scripts_${syncedProject.id}`, JSON.stringify(syncedProject.performanceScripts));
      }
    } catch (e) {}
  }

  // 2. IndexedDB write (safe for large files / 135+ files)
  try {
    const db = await openDb();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id: syncedProject.id,
        updatedAt: Date.now(),
        project: syncedProject
      });
    }
  } catch (err) {
    console.warn('[storageBackupService] IndexedDB save error:', err);
  }

  // 3. LocalStorage backup (best effort, graceful catch if quota exceeded)
  try {
    const serialized = JSON.stringify(syncedProject);
    if (serialized.length < 3500000) {
      localStorage.setItem(`automatiqa_project_backup_${syncedProject.id}`, serialized);
    } else {
      const lightweightCopy: any = {
        ...syncedProject,
        automationScripts: (syncedProject.automationScripts || []).map(s => {
          if (s.files && s.files.length > 0 && (s.content || '').length > 50000) {
            return {
              ...s,
              content: `/* Stored with ${s.files.length} files in IndexedDB */`
            };
          }
          return s;
        }),
        uiTestingReports: (syncedProject.uiTestingReports || []).map(r => ({
          ...r,
          highlightedScreenshots: (r.highlightedScreenshots || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${r.id}_hl_${idx}` : img),
          visualDefectsScreenshots: (r.visualDefectsScreenshots || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${r.id}_vd_${idx}` : img),
          screenshots: (r.screenshots || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${r.id}_sc_${idx}` : img),
          correctedScreenshots: (r.correctedScreenshots || []).map((cs: any, idx: number) => ({
            ...cs,
            originalImage: (typeof cs.originalImage === 'string' && cs.originalImage.startsWith('data:') && cs.originalImage.length > 5000) ? `ui_screenshot_id:sc_backup_${r.id}_csorig_${idx}` : cs.originalImage,
            correctedImage: (typeof cs.correctedImage === 'string' && cs.correctedImage.startsWith('data:') && cs.correctedImage.length > 5000) ? `ui_screenshot_id:sc_backup_${r.id}_cscorr_${idx}` : cs.correctedImage
          }))
        })),
        figmaDesignReviews: (syncedProject.figmaDesignReviews || []).map(f => ({
          ...f,
          images: (f.images || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${f.id}_img_${idx}` : img),
          highlightedScreenshots: (f.highlightedScreenshots || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${f.id}_hl_${idx}` : img),
          visualDefectsScreenshots: (f.visualDefectsScreenshots || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${f.id}_vd_${idx}` : img)
        })),
        uiComparisonReports: (syncedProject.uiComparisonReports || []).map(c => ({
          ...c,
          appScreenshots: (c.appScreenshots || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${c.id}_app_${idx}` : img),
          figmaImages: (c.figmaImages || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${c.id}_fig_${idx}` : img),
          highlightedScreenshots: (c.highlightedScreenshots || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${c.id}_hl_${idx}` : img)
        })),
        uiTestingInputs: (syncedProject.uiTestingInputs || []).map(i => ({
          ...i,
          screenshots: (i.screenshots || []).map((img: string, idx: number) => (typeof img === 'string' && img.startsWith('data:') && img.length > 5000) ? `ui_screenshot_id:sc_backup_${i.id}_sc_${idx}` : img)
        }))
      };
      try {
        localStorage.setItem(`automatiqa_project_backup_${syncedProject.id}`, JSON.stringify(lightweightCopy));
      } catch (innerErr) {
        // Extreme fallback: keep essential metadata and folder linkages without raw payloads
        const minimalCopy = {
          id: syncedProject.id,
          name: syncedProject.name,
          automationFolders: syncedProject.automationFolders,
          uiTestingFolders: syncedProject.uiTestingFolders,
          uiTestingReports: (syncedProject.uiTestingReports || []).map(r => ({ id: r.id, name: r.name, folderId: r.folderId, timestamp: r.timestamp, category: r.category })),
          figmaDesignReviews: (syncedProject.figmaDesignReviews || []).map(f => ({ id: f.id, name: f.name, folderId: f.folderId, timestamp: f.timestamp })),
          uiComparisonReports: (syncedProject.uiComparisonReports || []).map(c => ({ id: c.id, name: c.name, folderId: c.folderId, timestamp: c.timestamp })),
          uiTestingInputs: (syncedProject.uiTestingInputs || []).map(i => ({ id: i.id, name: i.name, folderId: i.folderId, timestamp: i.timestamp }))
        };
        try {
          localStorage.setItem(`automatiqa_project_backup_${syncedProject.id}`, JSON.stringify(minimalCopy));
        } catch (_) {}
      }
    }
  } catch (err) {
    // Ignore localStorage QuotaExceededError safely - IndexedDB and Server disk backup already have the full copy
  }

  // 4. Server Disk Backup endpoint (/api/projects/backup/:id)
  try {
    if (typeof window !== 'undefined' && window.fetch) {
      fetch(`/api/projects/backup/${syncedProject.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncedProject)
      }).catch(() => {
        // Non-blocking background sync
      });
    }
  } catch {
    // Non-blocking
  }
};

/**
 * Synchronously retrieves a project backup from in-memory cache or localStorage.
 */
export const getProjectBackupSync = (projectId: string): Project | null => {
  if (!projectId) return null;
  if (memoryProjectCache.has(projectId)) {
    return memoryProjectCache.get(projectId)!;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed) return parsed as Project;
      }
    } catch {}
  }
  return null;
};

/**
 * Get project from in-memory cache or IndexedDB or LocalStorage
 */
export const getProjectBackup = async (projectId: string): Promise<Project | null> => {
  if (!projectId) return null;

  // 1. In-memory cache first
  if (memoryProjectCache.has(projectId)) {
    return memoryProjectCache.get(projectId)!;
  }

  // 2. IndexedDB second
  try {
    const db = await openDb();
    if (db) {
      const record = await new Promise<any>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(projectId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      if (record && record.project) {
        memoryProjectCache.set(projectId, record.project);
        return record.project;
      }
    }
  } catch (err) {
    console.warn('[storageBackupService] IndexedDB read error:', err);
  }

  // 3. LocalStorage fallback
  try {
    const raw = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) {
        const synced = syncFolderReferences(parsed) as Project;
        memoryProjectCache.set(projectId, synced);
        return synced;
      }
    }
  } catch {
    // Ignore parse error
  }

  // 4. Server Disk Backup fallback (/api/projects/backup/:id)
  try {
    if (typeof window !== 'undefined' && window.fetch) {
      const res = await fetch(`/api/projects/backup/${encodeURIComponent(projectId)}`);
      if (res.ok) {
        const serverData = await res.json();
        if (serverData && serverData.id) {
          const synced = syncFolderReferences(serverData) as Project;
          memoryProjectCache.set(projectId, synced);
          try {
            localStorage.setItem(`automatiqa_project_backup_${projectId}`, JSON.stringify(synced));
          } catch {}
          return synced;
        }
      }
    }
  } catch {
    // Non-blocking
  }

  return null;
};

/**
 * Filters out any script files whose path or file name matches any of the deleted file paths.
 */
export const filterDeletedScriptFiles = (
  files: AutomationScriptFile[] = [],
  deletedPaths: string[] = []
): AutomationScriptFile[] => {
  if (!Array.isArray(files) || files.length === 0) return [];
  if (!Array.isArray(deletedPaths) || deletedPaths.length === 0) return files;

  const cleanDeleted = deletedPaths
    .filter(p => typeof p === 'string' && p.trim().length > 0)
    .map(p => p.replace(/\\/g, '/').toLowerCase().trim());

  if (cleanDeleted.length === 0) return files;

  return files.filter(f => {
    if (!f || typeof f.path !== 'string' || !f.path.trim()) return false;
    const normPath = f.path.replace(/\\/g, '/').toLowerCase().trim();
    const baseName = normPath.split('/').pop() || normPath;

    for (const d of cleanDeleted) {
      const dBase = d.split('/').pop() || d;
      // Exact match
      if (normPath === d) return false;
      // Ends with deleted path, e.g. path is 'src/tests/cart.spec.ts' and deleted was 'tests/cart.spec.ts'
      if (normPath.endsWith(`/${d}`)) return false;
      // Basename matches
      if (baseName === d || baseName === dBase) return false;
    }
    return true;
  });
};

/**
 * Merges a project coming from Firestore with our local/in-memory backup.
 * This guarantees that if a script with 135 files was uploaded locally or in refinement,
 * Firestore snapshots will NEVER wipe out the uploaded files or scripts,
 * while respecting any deleted files so removed script files never reappear!
 */
export const mergeAutomationScriptsWithBackup = (
  projectId: string,
  firestoreScripts: AutomationScript[] = [],
  deletedIds: Set<string> = new Set()
): AutomationScript[] => {
  const cachedProject = memoryProjectCache.get(projectId);
  const backupScripts = cachedProject?.automationScripts || [];

  if (backupScripts.length === 0) {
    return firestoreScripts
      .filter(s => s && s.id && !deletedIds.has(s.id) && !deletedIds.has(s.id.toLowerCase()))
      .map(s => {
        const deletedPaths = Array.isArray(s.deletedFilePaths) ? s.deletedFilePaths : [];
        const cleanFiles = filterDeletedScriptFiles(s.files || [], deletedPaths);
        return { ...s, files: cleanFiles, deletedFilePaths: deletedPaths };
      });
  }

  const scriptMap = new Map<string, AutomationScript>();

  // 1. Index firestore scripts first
  firestoreScripts.forEach(s => {
    if (s && s.id && !deletedIds.has(s.id) && !deletedIds.has(s.id.toLowerCase())) {
      const deletedPaths = Array.isArray(s.deletedFilePaths) ? s.deletedFilePaths : [];
      const cleanFiles = filterDeletedScriptFiles(s.files || [], deletedPaths);
      scriptMap.set(s.id, { ...s, files: cleanFiles, deletedFilePaths: deletedPaths });
    }
  });

  // 2. Overlay backup scripts, ensuring files array is NEVER lost or downgraded,
  // but explicitly respecting deleted files so they are never resurrected
  backupScripts.forEach(backupScript => {
    if (!backupScript || !backupScript.id) return;
    if (deletedIds.has(backupScript.id) || deletedIds.has(backupScript.id.toLowerCase())) return;

    const existing = scriptMap.get(backupScript.id);
    if (!existing) {
      // Script was present in backup (e.g. newly uploaded 135-file suite) but not yet or pruned in Firestore
      const deletedPaths = Array.isArray(backupScript.deletedFilePaths) ? backupScript.deletedFilePaths : [];
      const cleanFiles = filterDeletedScriptFiles(backupScript.files || [], deletedPaths);
      scriptMap.set(backupScript.id, { ...backupScript, files: cleanFiles, deletedFilePaths: deletedPaths });
    } else {
      const allDeletedFilePaths = Array.from(new Set([
        ...(existing.deletedFilePaths || []),
        ...(backupScript.deletedFilePaths || [])
      ]));

      const existingCleanFiles = filterDeletedScriptFiles(existing.files || [], allDeletedFilePaths);
      const backupCleanFiles = filterDeletedScriptFiles(backupScript.files || [], allDeletedFilePaths);

      // Check if existingCleanFiles has valid non-empty content
      const existingHasContent = existingCleanFiles.length > 0 && existingCleanFiles.some(f => f && typeof f.content === 'string' && f.content.trim().length > 0);
      const backupHasContent = backupCleanFiles.length > 0 && backupCleanFiles.some(f => f && typeof f.content === 'string' && f.content.trim().length > 0);

      let mergedFiles: AutomationScriptFile[];
      if (existingHasContent) {
        mergedFiles = existingCleanFiles.map(f => {
          if (!f.content || f.content.trim().length === 0) {
            const bf = backupCleanFiles.find(b => b.path === f.path || (b.path.split('/').pop() || b.path) === (f.path.split('/').pop() || f.path));
            if (bf && bf.content && bf.content.trim().length > 0) {
              return { ...f, content: bf.content };
            }
          }
          return f;
        });
      } else if (backupHasContent) {
        mergedFiles = backupCleanFiles;
      } else {
        mergedFiles = existingCleanFiles.length > 0 ? existingCleanFiles : backupCleanFiles;
      }

      // If existing content is missing, short, or placeholder, restore full markdown content from backup
      const isPlaceholderContent = (str?: string) => !str || str.length < 50 || str.startsWith('/* POM Suite') || str.startsWith('/* Generated script');
      const resolvedContent = !isPlaceholderContent(existing.content)
        ? existing.content
        : (!isPlaceholderContent(backupScript.content) ? backupScript.content : (existing.content || backupScript.content || ''));

      scriptMap.set(backupScript.id, {
        ...existing,
        ...backupScript,
        title: existing.title || backupScript.title,
        description: existing.description || backupScript.description,
        isApproved: existing.isApproved !== undefined ? existing.isApproved : backupScript.isApproved,
        folderId: existing.folderId || backupScript.folderId,
        folderName: existing.folderName || backupScript.folderName,
        flowId: existing.flowId || backupScript.flowId,
        flowName: existing.flowName || backupScript.flowName,
        source: existing.source || backupScript.source,
        platform: existing.platform || backupScript.platform,
        files: mergedFiles,
        deletedFilePaths: allDeletedFilePaths,
        content: resolvedContent,
        lastExecutionStatus: existing.lastExecutionStatus || backupScript.lastExecutionStatus,
        lastExecutionNotes: existing.lastExecutionNotes || backupScript.lastExecutionNotes,
        evidence: existing.evidence || backupScript.evidence,
        evidenceUrl: existing.evidenceUrl || backupScript.evidenceUrl,
        attachments: (existing.attachments && existing.attachments.length > 0) ? existing.attachments : backupScript.attachments,
        refinedFilePaths: existing.refinedFilePaths || backupScript.refinedFilePaths,
        lastRefinementSummary: existing.lastRefinementSummary || backupScript.lastRefinementSummary,
        lastRefinedAt: existing.lastRefinedAt || backupScript.lastRefinedAt
      });
    }
  });

  return Array.from(scriptMap.values());
};

/**
 * Merges upload video flows coming from Firestore with local/server backup.
 * Ensures video flows, step definitions, and generated scripts never disappear.
 */
export const mergeUploadVideoFlowsWithBackup = (
  projectId: string,
  firestoreFlows: any[] = [],
  deletedIds: Set<string> = new Set(),
  backupFlowsList?: any[]
): any[] => {
  const cachedProject = memoryProjectCache.get(projectId);
  let backupFlows = backupFlowsList || cachedProject?.uploadVideoFlows || [];

  if (backupFlows.length === 0 && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.uploadVideoFlows)) {
          backupFlows = parsed.uploadVideoFlows;
        }
      }
    } catch {}
  }

  const flowMap = new Map<string, any>();

  // 1. Index firestore flows
  firestoreFlows.forEach(f => {
    if (f && f.id && !deletedIds.has(f.id)) {
      flowMap.set(f.id, f);
    }
  });

  // 2. Overlay backup flows
  backupFlows.forEach(bf => {
    if (!bf || !bf.id || deletedIds.has(bf.id)) return;

    const existing = flowMap.get(bf.id);
    if (!existing) {
      flowMap.set(bf.id, bf);
    } else {
      // Merge properties: keep steps, scriptFiles, videoUrl if backup has fuller data
      const existingStepsCount = Array.isArray(existing.steps) ? existing.steps.length : 0;
      const backupStepsCount = Array.isArray(bf.steps) ? bf.steps.length : 0;
      const mergedSteps = backupStepsCount >= existingStepsCount ? (bf.steps || []) : (existing.steps || []);

      const existingFilesCount = Array.isArray(existing.scriptFiles) ? existing.scriptFiles.length : 0;
      const backupFilesCount = Array.isArray(bf.scriptFiles) ? bf.scriptFiles.length : 0;
      const mergedFiles = backupFilesCount >= existingFilesCount ? (bf.scriptFiles || []) : (existing.scriptFiles || []);

      const bestVideoUrl = (bf.videoUrl && !bf.videoUrl.startsWith('data:') && !bf.videoUrl.startsWith('blob:'))
        ? bf.videoUrl
        : (existing.videoUrl && !existing.videoUrl.startsWith('data:') && !existing.videoUrl.startsWith('blob:'))
          ? existing.videoUrl
          : bf.videoUrl || existing.videoUrl;

      const bestInputVideoUrl = (bf.inputVideoUrl && !bf.inputVideoUrl.startsWith('data:') && !bf.inputVideoUrl.startsWith('blob:'))
        ? bf.inputVideoUrl
        : (existing.inputVideoUrl && !existing.inputVideoUrl.startsWith('data:') && !existing.inputVideoUrl.startsWith('blob:'))
          ? existing.inputVideoUrl
          : bf.inputVideoUrl || existing.inputVideoUrl;

      flowMap.set(bf.id, {
        ...bf,
        ...existing,
        name: existing.name || bf.name,
        description: existing.description || bf.description,
        videoUrl: bestVideoUrl,
        inputVideoUrl: bestInputVideoUrl,
        thumbnailUrl: existing.thumbnailUrl || bf.thumbnailUrl || '',
        posterUrl: existing.posterUrl || bf.posterUrl || '',
        steps: mergedSteps,
        scriptFiles: mergedFiles,
        generatedScript: (existing.generatedScript && existing.generatedScript.length > 50) ? existing.generatedScript : (bf.generatedScript || existing.generatedScript),
        folderId: existing.folderId || bf.folderId,
        folderName: existing.folderName || bf.folderName,
        platform: existing.platform || bf.platform,
        isApproved: existing.isApproved !== undefined ? existing.isApproved : bf.isApproved
      });
    }
  });

  return Array.from(flowMap.values());
};

/**
 * Merges recorded flows coming from Firestore with local/server backup.
 * Ensures recorded flows and step definitions never disappear across refresh, navigation, or saving.
 */
export const mergeRecordedFlowsWithBackup = (
  projectId: string,
  firestoreFlows: any[] = [],
  deletedIds: Set<string> = new Set(),
  backupFlowsList?: any[]
): any[] => {
  const cachedProject = memoryProjectCache.get(projectId);
  let backupFlows: any[] = backupFlowsList || [];

  if (cachedProject?.recordedFlows && Array.isArray(cachedProject.recordedFlows)) {
    const existingIds = new Set(backupFlows.map(f => f.id));
    cachedProject.recordedFlows.forEach(cf => {
      if (!existingIds.has(cf.id)) {
        backupFlows.push(cf);
        existingIds.add(cf.id);
      }
    });
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.recordedFlows)) {
          const existingIds = new Set(backupFlows.map(f => f.id));
          parsed.recordedFlows.forEach((pf: any) => {
            if (!existingIds.has(pf.id)) {
              backupFlows.push(pf);
              existingIds.add(pf.id);
            }
          });
        }
      }
    } catch {}
  }

  const flowMap = new Map<string, any>();

  // 1. Index firestore flows
  firestoreFlows.forEach(f => {
    if (f && f.id && !deletedIds.has(f.id)) {
      flowMap.set(f.id, f);
    }
  });

  // 2. Overlay backup flows
  backupFlows.forEach(bf => {
    if (!bf || !bf.id || deletedIds.has(bf.id)) return;

    const existing = flowMap.get(bf.id);
    if (!existing) {
      flowMap.set(bf.id, bf);
    } else {
      const existingStepsCount = Array.isArray(existing.steps) ? existing.steps.length : 0;
      const backupStepsCount = Array.isArray(bf.steps) ? bf.steps.length : 0;
      const mergedSteps = backupStepsCount >= existingStepsCount ? (bf.steps || []) : (existing.steps || []);

      flowMap.set(bf.id, {
        ...existing,
        ...bf,
        steps: mergedSteps,
        name: existing.name || bf.name,
        description: existing.description || bf.description,
        isApproved: bf.isApproved !== undefined ? bf.isApproved : existing.isApproved,
        folderId: bf.folderId || existing.folderId,
        folderName: bf.folderName || existing.folderName,
        platform: bf.platform || existing.platform || 'web',
        generatedScript: bf.generatedScript || existing.generatedScript,
        scriptFiles: bf.scriptFiles || existing.scriptFiles,
        scriptId: bf.scriptId || existing.scriptId,
        tool: bf.tool || existing.tool,
        language: bf.language || existing.language,
        framework: bf.framework || existing.framework,
        generatedProject: bf.generatedProject || existing.generatedProject
      });
    }
  });

  return Array.from(flowMap.values());
};

/**
 * Merges automation folders coming from Firestore with local/server backup.
 * Ensures folders never disappear after refresh or re-login.
 */
export const mergeFoldersWithBackup = (
  projectId: string,
  firestoreFolders: any[] = [],
  deletedIds: Set<string> = new Set(),
  backupFoldersList?: any[]
): any[] => {
  const cachedProject = memoryProjectCache.get(projectId);
  let backupFolders: any[] = backupFoldersList ? [...backupFoldersList] : [];

  if (cachedProject?.automationFolders && Array.isArray(cachedProject.automationFolders)) {
    const existingIds = new Set(backupFolders.map(f => f.id));
    cachedProject.automationFolders.forEach(cf => {
      if (!existingIds.has(cf.id)) {
        backupFolders.push(cf);
        existingIds.add(cf.id);
      }
    });
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.automationFolders)) {
          const existingIds = new Set(backupFolders.map(f => f.id));
          parsed.automationFolders.forEach((pf: any) => {
            if (!existingIds.has(pf.id)) {
              backupFolders.push(pf);
              existingIds.add(pf.id);
            }
          });
        }
      }
    } catch {}
  }

  const folderMap = new Map<string, any>();
  const seenNames = new Map<string, any>();

  const processFolder = (f: any) => {
    if (!f || !f.id || deletedIds.has(f.id)) return;
    const normName = (f.name || '').trim().toLowerCase();
    const type = f.type || 'flow';
    const plat = f.platform || 'web';
    const nameKey = `${type}___${normName}___${plat}`;

    if (folderMap.has(f.id)) {
      const existing = folderMap.get(f.id);
      // If exact same type and name, safely merge attributes
      if (existing.type === type && (existing.name || '').trim().toLowerCase() === normName) {
        folderMap.set(f.id, {
          ...f,
          ...existing,
          name: existing.name || f.name,
          type: existing.type || type,
          platform: existing.platform || plat
        });
      } else {
        // ID collision with a folder of different type/name: assign a new unique ID
        const newId = generateUniqueFolderId('folder');
        folderMap.set(newId, {
          ...f,
          id: newId,
          name: f.name,
          type,
          platform: plat
        });
      }
    } else {
      if (seenNames.has(nameKey)) {
        // Same logical folder with a different ID: merge into the canonical one
        const canonical = seenNames.get(nameKey);
        Object.assign(canonical, f, { id: canonical.id, name: canonical.name });
      } else {
        folderMap.set(f.id, { ...f });
        seenNames.set(nameKey, f);
      }
    }
  };

  firestoreFolders.forEach(processFolder);
  backupFolders.forEach(processFolder);

  return Array.from(folderMap.values());
};

/**
 * Merges scenarios and folders coming from Firestore with local/server backup.
 * Ensures approved test cases and folders never lose their approval status or disappear after refresh/re-login.
 */
export const mergeScenariosWithBackup = (
  projectId: string,
  firestoreScenarios: any[] = [],
  backupScenarios: any[] = [],
  deletedIds: Set<string> = new Set()
): any[] => {
  const cachedProject = memoryProjectCache.get(projectId);
  const memScenarios = cachedProject?.scenarios || [];

  const isItemDeleted = (id?: string, title?: string, isFolder?: boolean, scenarioId?: string) => {
    if (!id) return true;
    const lowerId = id.trim().toLowerCase();
    if (deletedIds.has(id) || deletedIds.has(lowerId) || deletedIds.has(`folder-${id}`) || deletedIds.has(`folder-${lowerId}`)) {
      return true;
    }
    if (scenarioId && !['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER', 'INPUT_SOURCE', 'SCRIPT_GENERATOR_FOLDER', 'USERSTORY_FOLDER'].includes(scenarioId)) {
      const lowerScId = scenarioId.trim().toLowerCase();
      if (deletedIds.has(scenarioId) || deletedIds.has(lowerScId)) {
        return true;
      }
    }
    if (isFolder && title) {
      const lowerTitle = title.trim().toLowerCase();
      if (deletedIds.has(`folder-${lowerTitle}`)) {
        return true;
      }
    }
    return false;
  };

  const scenarioMap = new Map<string, any>();

  // 1. Index firestore scenarios
  firestoreScenarios.forEach(s => {
    if (s && s.id && !isItemDeleted(s.id, s.title, s.isFolder || s.scenarioId === 'SCENARIO_FOLDER', s.scenarioId)) {
      scenarioMap.set(s.id, { ...s });
    }
  });

  // Helper to overlay scenarios from backup sources
  const overlayScenarios = (list: any[]) => {
    list.forEach(bs => {
      if (!bs || !bs.id || isItemDeleted(bs.id, bs.title, bs.isFolder || bs.scenarioId === 'SCENARIO_FOLDER', bs.scenarioId)) return;

      const existing = scenarioMap.get(bs.id);
      if (!existing) {
        scenarioMap.set(bs.id, { ...bs });
      } else {
        // Merge test cases, preserving isApproved and properties
        let mergedCases = existing.testCases || [];
        if (Array.isArray(existing.testCases) || Array.isArray(bs.testCases)) {
          const caseMap = new Map<string, any>();
          (existing.testCases || []).forEach((tc: any) => {
            if (tc && tc.id && !deletedIds.has(tc.id)) {
              caseMap.set(tc.id, { ...tc });
            }
          });

          (bs.testCases || []).forEach((btc: any) => {
            if (!btc || !btc.id || deletedIds.has(btc.id)) return;
            const cur = caseMap.get(btc.id);
            if (!cur) {
              caseMap.set(btc.id, { ...btc });
            } else {
              caseMap.set(btc.id, {
                ...cur,
                ...btc,
                isApproved: cur.isApproved !== undefined ? (cur.isApproved === true || cur.isApproved === 'true') : (btc.isApproved === true || btc.isApproved === 'true'),
                status: cur.status || btc.status,
                testType: cur.testType || btc.testType,
                priority: cur.priority || btc.priority
              });
            }
          });

          mergedCases = Array.from(caseMap.values());
        }

        const isAnyCaseApproved = Array.isArray(mergedCases) && mergedCases.some((c: any) => Boolean(c.isApproved));

        const isFolderItem = bs.isFolder || existing.isFolder || 
          bs.scenarioId === 'SCENARIO_FOLDER' || existing.scenarioId === 'SCENARIO_FOLDER' ||
          bs.scenarioId === 'TESTCASE_FOLDER' || existing.scenarioId === 'TESTCASE_FOLDER' ||
          bs.scenarioId === 'MANUAL_FOLDER' || existing.scenarioId === 'MANUAL_FOLDER';

        const mergedMembers = Array.from(new Set([
          ...(Array.isArray(existing.memberScenarioIds) ? existing.memberScenarioIds : []),
          ...(Array.isArray(bs.memberScenarioIds) ? bs.memberScenarioIds : [])
        ])).filter(id => !deletedIds.has(id));

        const resolvedApproved = existing.isApproved !== undefined 
          ? (existing.isApproved === true || existing.isApproved === 'true')
          : (bs.isApproved === true || bs.isApproved === 'true' || isAnyCaseApproved);

        scenarioMap.set(bs.id, {
          ...bs,
          ...existing,
          title: (existing.title && existing.title.trim()) ? existing.title : bs.title,
          testCases: mergedCases,
          isApproved: resolvedApproved,
          saved: (existing.saved !== undefined ? existing.saved : bs.saved) || Boolean(isFolderItem),
          isFolder: isFolderItem,
          folderType: existing.folderType || bs.folderType,
          folderId: existing.folderId || bs.folderId,
          folderName: existing.folderName || bs.folderName,
          isRemovedFromIndividual: existing.isRemovedFromIndividual !== undefined ? existing.isRemovedFromIndividual : bs.isRemovedFromIndividual,
          memberScenarioIds: isFolderItem ? mergedMembers : (existing.memberScenarioIds || bs.memberScenarioIds),
          videoUrl: existing.videoUrl || bs.videoUrl,
          videoFileName: existing.videoFileName || bs.videoFileName,
          videoDuration: existing.videoDuration || bs.videoDuration,
          videoFrames: (existing.videoFrames && existing.videoFrames.length > 0) ? existing.videoFrames : bs.videoFrames,
          videoSize: existing.videoSize || bs.videoSize
        });
      }
    });
  };

  // 2. Overlay backupScenarios and in-memory cache scenarios
  overlayScenarios(backupScenarios);
  overlayScenarios(memScenarios);

  // 3. Bidirectional folder-member consistency guarantee
  const allScenarios = Array.from(scenarioMap.values());
  const folderMap = new Map<string, any>();
  allScenarios.forEach(s => {
    if (s.isFolder || s.scenarioId === 'SCENARIO_FOLDER' || s.scenarioId === 'TESTCASE_FOLDER' || s.scenarioId === 'MANUAL_FOLDER') {
      folderMap.set(s.id, s);
    }
  });

  allScenarios.forEach(s => {
    if (s.folderId) {
      const isFolderDead = deletedIds.has(s.folderId) || 
        deletedIds.has(s.folderId.toLowerCase()) || 
        deletedIds.has(`folder-${s.folderId.toLowerCase()}`) ||
        (s.folderName && (deletedIds.has(s.folderName) || deletedIds.has(s.folderName.trim().toLowerCase())));

      if (isFolderDead || !folderMap.has(s.folderId)) {
        s.folderId = "";
        s.folderName = "";
        s.isRemovedFromIndividual = false;
      } else {
        const parentFolder = folderMap.get(s.folderId);
        const members = new Set(Array.isArray(parentFolder.memberScenarioIds) ? parentFolder.memberScenarioIds : []);
        if (!members.has(s.id)) {
          members.add(s.id);
          parentFolder.memberScenarioIds = Array.from(members);
        }
      }
    }
  });

  folderMap.forEach(folder => {
    if (Array.isArray(folder.memberScenarioIds)) {
      const validMembers: string[] = [];
      folder.memberScenarioIds.forEach(mId => {
        if (!mId || deletedIds.has(mId) || deletedIds.has(mId.toLowerCase())) return;
        const item = scenarioMap.get(mId);
        if (item) {
          validMembers.push(mId);
          if (!item.folderId) {
            item.folderId = folder.id;
            item.folderName = folder.title;
          }
        }
      });
      folder.memberScenarioIds = validMembers;
    }
  });

  return Array.from(scenarioMap.values());
};

/**
 * Merges performance scripts, JMeter JMX artifacts, and AI reports coming from Firestore with local,
 * in-memory cache, and dedicated localStorage backups.
 * Ensures JMX files, CSV test data, and reports NEVER disappear after generation, save, or page refresh.
 */
export const mergePerformanceScriptsWithBackup = (
  projectId: string,
  firestoreScripts: PerformanceScript[] = [],
  deletedIds: Set<string> = new Set(),
  backupScripts: PerformanceScript[] = []
): PerformanceScript[] => {
  const cachedProject = memoryProjectCache.get(projectId);
  const memScripts = cachedProject?.performanceScripts || [];

  const scriptMap = new Map<string, PerformanceScript>();

  // 1. Index firestore scripts first
  (firestoreScripts || []).forEach(s => {
    if (s && s.id && !deletedIds.has(s.id)) {
      scriptMap.set(s.id, { ...s });
    }
  });

  // Helper to overlay scripts from backups
  const overlayScripts = (list: any[]) => {
    if (!Array.isArray(list)) return;
    list.forEach(bs => {
      if (!bs || !bs.id || deletedIds.has(bs.id)) return;

      const existing = scriptMap.get(bs.id);
      if (!existing) {
        scriptMap.set(bs.id, { ...bs });
      } else {
        scriptMap.set(bs.id, {
          ...bs,
          ...existing,
          jmxContent: existing.jmxContent || bs.jmxContent || '',
          csvData: existing.csvData || bs.csvData || '',
          analysisReport: existing.analysisReport || bs.analysisReport,
          trendData: existing.trendData || bs.trendData,
          scenarios: (existing.scenarios && existing.scenarios.length > 0) ? existing.scenarios : (bs.scenarios || [])
        });
      }
    });
  };

  // 2. Overlay backup scripts passed in (e.g. from active React state or server backup)
  overlayScripts(backupScripts);

  // 3. Overlay in-memory cache
  overlayScripts(memScripts);

  // 4. Overlay dedicated localStorage key
  try {
    if (typeof localStorage !== 'undefined') {
      const local = localStorage.getItem(`automatiqa_perf_scripts_${projectId}`);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          overlayScripts(parsed);
        }
      }
    }
  } catch (e) {}

  // 5. Overlay full project backup from localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const fullBackup = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
      if (fullBackup) {
        const parsed = JSON.parse(fullBackup);
        if (parsed && Array.isArray(parsed.performanceScripts)) {
          overlayScripts(parsed.performanceScripts);
        }
      }
    }
  } catch (e) {}

  return Array.from(scriptMap.values());
};

/**
 * Merges user stories and user story folders with local and server backups.
 * Ensures folders and member story associations never disappear or rollback on snapshot sync.
 */
export const mergeUserStoriesWithBackup = (
  projectId: string,
  projectUserStories: UserStory[] = [],
  deletedIds: Set<string> = new Set(),
  backupUserStories: UserStory[] = []
): UserStory[] => {
  let localBackupStories: UserStory[] = [];
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.userStories)) {
          localBackupStories = parsed.userStories;
        }
      }
    }
  } catch (e) {}

  const cachedProject = memoryProjectCache.get(projectId);
  const memStories = cachedProject?.userStories || [];

  const allBackupSources = [...backupUserStories, ...localBackupStories, ...memStories];

  const storyMap = new Map<string, UserStory>();
  (projectUserStories || []).forEach(s => {
    if (s && s.id && !deletedIds.has(s.id)) {
      storyMap.set(s.id, { ...s });
    }
  });

  allBackupSources.forEach(backupStory => {
    if (!backupStory || !backupStory.id || deletedIds.has(backupStory.id)) return;

    const existing = storyMap.get(backupStory.id);
    if (!existing) {
      storyMap.set(backupStory.id, { ...backupStory });
    } else {
      const isFolder = existing.storyId === 'USERSTORY_FOLDER' || backupStory.storyId === 'USERSTORY_FOLDER';
      if (isFolder) {
        const existingMembers = Array.isArray(existing.memberStoryIds) ? existing.memberStoryIds : [];
        const backupMembers = Array.isArray(backupStory.memberStoryIds) ? backupStory.memberStoryIds : [];
        const mergedMembers = Array.from(new Set([...existingMembers, ...backupMembers])).filter(id => !deletedIds.has(id));

        const validSummary = (backupStory.summary && backupStory.summary.trim() && backupStory.summary !== 'Untitled Folder')
          ? backupStory.summary
          : ((existing.summary && existing.summary.trim() && existing.summary !== 'Untitled Folder') ? existing.summary : (backupStory.summary || existing.summary || 'Untitled Folder'));

        storyMap.set(existing.id, {
          ...existing,
          ...backupStory,
          storyId: 'USERSTORY_FOLDER',
          summary: validSummary,
          description: backupStory.description || existing.description || 'Organization folder',
          memberStoryIds: mergedMembers,
          updatedAt: backupStory.updatedAt || existing.updatedAt || new Date().toISOString()
        });
      } else {
        const targetFolderId = backupStory.folderId || existing.folderId;
        const targetParentFolderId = backupStory.parentFolderId || existing.parentFolderId;
        const shouldBeRemovedFromIndividual = Boolean(targetFolderId) || Boolean(backupStory.isRemovedFromIndividual) || Boolean(existing.isRemovedFromIndividual);

        storyMap.set(existing.id, {
          ...existing,
          ...backupStory,
          summary: (backupStory.summary && backupStory.summary.trim()) ? backupStory.summary : existing.summary,
          description: (backupStory.description && backupStory.description.trim()) ? backupStory.description : existing.description,
          acceptanceCriteria: (backupStory.acceptanceCriteria && backupStory.acceptanceCriteria.trim()) ? backupStory.acceptanceCriteria : existing.acceptanceCriteria,
          folderId: targetFolderId || undefined,
          parentFolderId: targetParentFolderId || undefined,
          isRemovedFromIndividual: shouldBeRemovedFromIndividual,
          updatedAt: backupStory.updatedAt || existing.updatedAt || new Date().toISOString()
        });
      }
    }
  });

  // Bidirectional consistency guarantee between folders and member stories
  const allStories = Array.from(storyMap.values()).filter(s => !deletedIds.has(s.id));
  const folderMap = new Map<string, UserStory>();
  allStories.forEach(s => {
    if (s.storyId === 'USERSTORY_FOLDER') {
      folderMap.set(s.id, s);
    }
  });

  allStories.forEach(s => {
    if (s.folderId && folderMap.has(s.folderId)) {
      const folder = folderMap.get(s.folderId)!;
      const members = new Set(Array.isArray(folder.memberStoryIds) ? folder.memberStoryIds : []);
      if (!members.has(s.id)) {
        members.add(s.id);
        folder.memberStoryIds = Array.from(members);
      }
      s.isRemovedFromIndividual = true;
    }
  });

  folderMap.forEach(folder => {
    if (Array.isArray(folder.memberStoryIds)) {
      folder.memberStoryIds.forEach(mId => {
        const item = storyMap.get(mId);
        if (item && item.storyId !== 'USERSTORY_FOLDER') {
          if (!item.folderId) {
            item.folderId = folder.id;
          }
          item.isRemovedFromIndividual = true;
        }
      });
    }
  });

  return Array.from(storyMap.values()).filter(s => !deletedIds.has(s.id));
};

/**
 * Merges UI testing folders with backup and in-memory caches.
 */
export const mergeUITestingFoldersWithBackup = (
  projectId: string,
  currentFolders: any[] = [],
  deletedIds: Set<string> = new Set(),
  backupFolders: any[] = []
): any[] => {
  const globalDeleted = getGlobalDeletedSet();
  const isDeleted = (id: string, name?: string): boolean => {
    if (!id) return true;
    const norm = String(id).trim().toLowerCase();
    if (deletedIds.has(id) || deletedIds.has(norm) || deletedIds.has(`folder-${norm}`)) return true;
    if (globalDeleted.has(norm) || globalDeleted.has(`folder-${norm}`)) return true;
    if (name) {
      const normName = String(name).trim().toLowerCase();
      if (deletedIds.has(normName) || globalDeleted.has(normName)) return true;
    }
    return false;
  };

  const folderMap = new Map<string, any>();
  (currentFolders || []).forEach(f => {
    if (f && f.id && !isDeleted(f.id, f.name)) {
      folderMap.set(f.id, f);
    }
  });
  (backupFolders || []).forEach(f => {
    if (f && f.id && !isDeleted(f.id, f.name)) {
      if (!folderMap.has(f.id)) {
        folderMap.set(f.id, f);
      } else {
        const existing = folderMap.get(f.id);
        folderMap.set(f.id, { ...f, ...existing, name: existing.name || f.name });
      }
    }
  });
  return Array.from(folderMap.values());
};

/**
 * Merges UI testing reports with backup, ensuring newly saved reports are never dropped.
 */
export const mergeUITestingReportsWithBackup = (
  projectId: string,
  currentReports: any[] = [],
  deletedIds: Set<string> = new Set(),
  backupReports: any[] = []
): any[] => {
  const reportMap = new Map<string, any>();
  (currentReports || []).forEach(r => {
    if (r && r.id && !deletedIds.has(r.id)) {
      reportMap.set(r.id, r);
    }
  });
  (backupReports || []).forEach(r => {
    if (r && r.id && !deletedIds.has(r.id)) {
      if (!reportMap.has(r.id)) {
        reportMap.set(r.id, r);
      } else {
        const existing = reportMap.get(r.id);
        const bestScreenshots = (Array.isArray(existing.screenshots) && existing.screenshots.some((s: string) => s && s.startsWith('data:')))
          ? existing.screenshots
          : (r.screenshots || existing.screenshots || []);

        const bestHL = (Array.isArray(existing.highlightedScreenshots) && existing.highlightedScreenshots.some((s: string) => s && s.startsWith('data:')))
          ? existing.highlightedScreenshots
          : (r.highlightedScreenshots || existing.highlightedScreenshots || []);

        const bestVD = (Array.isArray(existing.visualDefectsScreenshots) && existing.visualDefectsScreenshots.some((s: string) => s && s.startsWith('data:')))
          ? existing.visualDefectsScreenshots
          : (r.visualDefectsScreenshots || existing.visualDefectsScreenshots || []);

        const bestCorrected = (existing.correctedImage && existing.correctedImage.startsWith('data:'))
          ? existing.correctedImage
          : (r.correctedImage || existing.correctedImage || '');

        reportMap.set(r.id, {
          ...r,
          ...existing,
          screenshots: bestScreenshots,
          highlightedScreenshots: bestHL,
          visualDefectsScreenshots: bestVD,
          correctedImage: bestCorrected,
          folderId: existing.folderId !== undefined ? existing.folderId : r.folderId,
          report: existing.report || r.report,
          name: existing.name || r.name
        });
      }
    }
  });
  return Array.from(reportMap.values());
};

/**
 * Merges Figma design reviews with backup.
 */
export const mergeFigmaDesignReviewsWithBackup = (
  projectId: string,
  currentReviews: any[] = [],
  deletedIds: Set<string> = new Set(),
  backupReviews: any[] = []
): any[] => {
  const reviewMap = new Map<string, any>();
  (currentReviews || []).forEach(r => {
    if (r && r.id && !deletedIds.has(r.id)) {
      reviewMap.set(r.id, r);
    }
  });
  (backupReviews || []).forEach(r => {
    if (r && r.id && !deletedIds.has(r.id)) {
      if (!reviewMap.has(r.id)) {
        reviewMap.set(r.id, r);
      } else {
        const existing = reviewMap.get(r.id);
        reviewMap.set(r.id, {
          ...r,
          ...existing,
          folderId: existing.folderId !== undefined ? existing.folderId : r.folderId,
          analysisReport: existing.analysisReport || r.analysisReport,
          name: existing.name || r.name
        });
      }
    }
  });
  return Array.from(reviewMap.values());
};

/**
 * Merges UI Comparison reports with backup.
 */
export const mergeUIComparisonReportsWithBackup = (
  projectId: string,
  currentComparisons: any[] = [],
  deletedIds: Set<string> = new Set(),
  backupComparisons: any[] = []
): any[] => {
  const compMap = new Map<string, any>();
  (currentComparisons || []).forEach(c => {
    if (c && c.id && !deletedIds.has(c.id)) {
      compMap.set(c.id, c);
    }
  });
  (backupComparisons || []).forEach(c => {
    if (c && c.id && !deletedIds.has(c.id)) {
      if (!compMap.has(c.id)) {
        compMap.set(c.id, c);
      } else {
        const existing = compMap.get(c.id);
        compMap.set(c.id, {
          ...c,
          ...existing,
          folderId: existing.folderId !== undefined ? existing.folderId : c.folderId,
          comparisonReport: existing.comparisonReport || c.comparisonReport,
          name: existing.name || c.name
        });
      }
    }
  });
  return Array.from(compMap.values());
};

/**
 * Merges UI Testing inputs with backup.
 */
export const mergeUITestingInputsWithBackup = (
  projectId: string,
  currentInputs: any[] = [],
  deletedIds: Set<string> = new Set(),
  backupInputs: any[] = []
): any[] => {
  const inputMap = new Map<string, any>();
  (currentInputs || []).forEach(i => {
    if (i && i.id && !deletedIds.has(i.id)) {
      inputMap.set(i.id, i);
    }
  });
  (backupInputs || []).forEach(i => {
    if (i && i.id && !deletedIds.has(i.id)) {
      if (!inputMap.has(i.id)) {
        inputMap.set(i.id, i);
      } else {
        const existing = inputMap.get(i.id);
        const hasExistingScreenshots = Array.isArray(existing.screenshots) && existing.screenshots.some((s: string) => s && s.length > 100);
        const bestScreenshots = hasExistingScreenshots ? existing.screenshots : (i.screenshots || existing.screenshots || []);

        inputMap.set(i.id, {
          ...i,
          ...existing,
          screenshots: bestScreenshots,
          folderId: existing.folderId !== undefined ? existing.folderId : i.folderId,
          name: existing.name || i.name
        });
      }
    }
  });
  return Array.from(inputMap.values());
};

/**
 * Merges a full project with its local in-memory/IndexedDB/server backup.
 */
export const mergeProjectWithBackupData = (
  project: Project,
  backup: Partial<Project> | null | undefined,
  deletedIds: Set<string> = new Set()
): Project => {
  if (!backup) return syncFolderReferences(project) as Project;

  // Merge scripts
  const mergedScripts = mergeAutomationScriptsWithBackup(
    project.id,
    project.automationScripts || [],
    deletedIds
  );

  // Merge upload video flows
  const mergedUploadFlows = mergeUploadVideoFlowsWithBackup(
    project.id,
    project.uploadVideoFlows || [],
    deletedIds,
    backup.uploadVideoFlows || []
  );

  // Merge recorded flows
  const mergedRecordedFlows = mergeRecordedFlowsWithBackup(
    project.id,
    project.recordedFlows || [],
    deletedIds,
    backup.recordedFlows || []
  );

  // Merge folders
  const mergedFolders = mergeFoldersWithBackup(
    project.id,
    project.automationFolders || [],
    deletedIds,
    backup.automationFolders || []
  );

  // Merge scenarios and folders with test cases
  const mergedScenarios = mergeScenariosWithBackup(
    project.id,
    project.scenarios || [],
    backup.scenarios || [],
    deletedIds
  );

  // Merge performance scripts and JMX artifacts
  const mergedPerformanceScripts = mergePerformanceScriptsWithBackup(
    project.id,
    project.performanceScripts || [],
    deletedIds,
    backup.performanceScripts || []
  );

  // Merge user stories and user story folders
  const mergedUserStories = mergeUserStoriesWithBackup(
    project.id,
    project.userStories || [],
    deletedIds,
    backup.userStories || []
  );

  // Merge UI Testing folders & artifacts
  const mergedUIFolders = mergeUITestingFoldersWithBackup(
    project.id,
    project.uiTestingFolders || [],
    deletedIds,
    backup.uiTestingFolders || []
  );
  const mergedUIReports = mergeUITestingReportsWithBackup(
    project.id,
    project.uiTestingReports || [],
    deletedIds,
    backup.uiTestingReports || []
  );
  const mergedFigmaReviews = mergeFigmaDesignReviewsWithBackup(
    project.id,
    project.figmaDesignReviews || [],
    deletedIds,
    backup.figmaDesignReviews || []
  );
  const mergedUIComparisons = mergeUIComparisonReportsWithBackup(
    project.id,
    project.uiComparisonReports || [],
    deletedIds,
    backup.uiComparisonReports || []
  );
  const mergedUIInputs = mergeUITestingInputsWithBackup(
    project.id,
    project.uiTestingInputs || [],
    deletedIds,
    backup.uiTestingInputs || []
  );

  return syncFolderReferences({
    ...project,
    scenarios: mergedScenarios,
    automationScripts: mergedScripts,
    recordedFlows: mergedRecordedFlows,
    uploadVideoFlows: mergedUploadFlows,
    automationFolders: mergedFolders,
    performanceScripts: mergedPerformanceScripts,
    userStories: mergedUserStories,
    uiTestingFolders: mergedUIFolders,
    uiTestingReports: mergedUIReports,
    figmaDesignReviews: mergedFigmaReviews,
    uiComparisonReports: mergedUIComparisons,
    uiTestingInputs: mergedUIInputs
  }) as Project;
};
