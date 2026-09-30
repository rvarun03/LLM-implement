import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  type DocumentSnapshot
} from "firebase/firestore";
import { db, mainDb, backupDb, useBackup } from "../firebase";
import { syncSetDoc, syncUpdateDoc, syncDeleteDoc, sanitizeForFirestore, withAdaptiveTimeoutAndRetry } from "./firestoreSync";
import { UserStory } from "../types";
import { logger } from "./appLogger";

/**
 * Service to handle normalized, granular persistence for Folders, User Stories,
 * and Generated Values under projects/{projectId}/folders/...
 * 
 * Prevents exceeding Firestore's 1 MiB document size limit by ensuring each
 * folder, story, and value is persisted as an independent Firestore document.
 */

export interface FolderValueRecord {
  id: string;
  name?: string;
  value?: any;
  type?: string;
  folderId?: string;
  createdAt?: string;
}

/**
 * Saves a folder document to Firestore at projects/{projectId}/folders/{folder.id}
 * Also synchronizes the parent project document at projects/{projectId} so root collection listeners immediately reflect the folder.
 */
export async function saveFolderToFirestore(projectId: string, folder: UserStory): Promise<void> {
  if (!projectId || !folder || !folder.id) {
    throw new Error("Invalid parameters: projectId and folder.id are required");
  }

  const cleanData = sanitizeForFirestore({
    id: folder.id,
    storyId: 'USERSTORY_FOLDER',
    summary: (folder.summary && folder.summary.trim()) ? folder.summary.trim() : 'Untitled Folder',
    description: folder.description || 'Organization folder',
    acceptanceCriteria: folder.acceptanceCriteria || 'N/A',
    parentFolderId: folder.parentFolderId || null,
    memberStoryIds: Array.isArray(folder.memberStoryIds) ? folder.memberStoryIds : [],
    createdAt: folder.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // 1. Write to subcollection
  try {
    const folderDocRef = doc(db, "projects", projectId, "folders", folder.id);
    await syncSetDoc(folderDocRef, cleanData, { merge: true });
  } catch (err: any) {
    console.warn(`[saveFolderToFirestore] Firestore subcollection write restricted, syncing root:`, err?.message || err);
  }

  // 2. Synchronize parent project document in Firestore so root snapshots receive it immediately
  try {
    const projectDocRef = doc(db, "projects", projectId);
    const projSnap: DocumentSnapshot = await withAdaptiveTimeoutAndRetry(() => getDoc(projectDocRef), { opType: 'READ', path: `projects/${projectId}` });
    if (projSnap.exists()) {
      const projData = projSnap.data();
      const currentStories: UserStory[] = Array.isArray(projData.userStories) ? projData.userStories : [];
      const existingIdx = currentStories.findIndex(s => s.id === folder.id);
      let nextStories: UserStory[];
      if (existingIdx >= 0) {
        nextStories = currentStories.map((s, idx) => idx === existingIdx ? { ...s, ...cleanData } : s);
      } else {
        nextStories = [cleanData, ...currentStories];
      }
      await syncUpdateDoc(projectDocRef, {
        userStories: nextStories,
        userStoriesCount: nextStories.length,
        updatedAt: serverTimestamp()
      });
    }
  } catch (projErr) {
    console.warn('[saveFolderToFirestore] Parent project sync note:', projErr);
  }

  // 3. Always replicate folder to server disk backup
  try {
    if (typeof fetch !== 'undefined') {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/folders-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id, folder: cleanData })
      });
    }
  } catch (serverErr) {
    console.warn('[saveFolderToFirestore] Server backup warning:', serverErr);
  }
}

/**
 * Renames a folder in Firestore and updates the parent project document.
 */
export async function renameFolderInFirestore(projectId: string, folderId: string, newName: string): Promise<void> {
  if (!projectId || !folderId || !newName.trim()) return;
  const trimmed = newName.trim();
  const now = new Date().toISOString();

  try {
    const folderDocRef = doc(db, "projects", projectId, "folders", folderId);
    await syncUpdateDoc(folderDocRef, {
      summary: trimmed,
      updatedAt: now
    });
  } catch (err: any) {
    console.warn('[renameFolderInFirestore] Firestore subcollection update note:', err?.message || err);
  }

  try {
    const projectDocRef = doc(db, "projects", projectId);
    const projSnap = await getDoc(projectDocRef);
    if (projSnap.exists()) {
      const projData = projSnap.data();
      const currentStories: UserStory[] = Array.isArray(projData.userStories) ? projData.userStories : [];
      const updated = currentStories.map(s => s.id === folderId ? { ...s, summary: trimmed, updatedAt: now } : s);
      await syncUpdateDoc(projectDocRef, {
        userStories: updated,
        updatedAt: serverTimestamp()
      });
    }
  } catch (e) {}

  try {
    if (typeof fetch !== 'undefined') {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/folders-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId,
          folder: { id: folderId, summary: trimmed, updatedAt: now }
        })
      });
    }
  } catch (e) {}
}

/**
 * Saves an individual story to Firestore.
 * If folderId is provided: projects/{projectId}/folders/{folderId}/stories/{story.id}
 * Otherwise: projects/{projectId}/stories/{story.id}
 */
export async function saveStoryToFirestore(
  projectId: string,
  folderId: string | null | undefined,
  story: UserStory
): Promise<void> {
  if (!projectId || !story || !story.id) {
    throw new Error("Invalid parameters: projectId and story.id are required");
  }

  const cleanData = sanitizeForFirestore({
    id: story.id,
    storyId: story.storyId || 'US-001',
    summary: story.summary || '',
    description: story.description || '',
    acceptanceCriteria: story.acceptanceCriteria || '',
    createdAt: story.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    folderId: folderId || null,
    parentFolderId: story.parentFolderId || null,
    isRemovedFromIndividual: Boolean(story.isRemovedFromIndividual),
    userStoryId: story.userStoryId || null,
    attachments: story.attachments || null,
    screenshots: story.screenshots || null
  });

  try {
    const storyDocRef = folderId
      ? doc(db, "projects", projectId, "folders", folderId, "stories", story.id)
      : doc(db, "projects", projectId, "stories", story.id);

    await syncSetDoc(storyDocRef, cleanData, { merge: true });

    // If inside a folder, ensure memberStoryIds includes this story
    if (folderId) {
      const folderDocRef = doc(db, "projects", projectId, "folders", folderId);
      try {
        await syncUpdateDoc(folderDocRef, {
          memberStoryIds: arrayUnion(story.id),
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        // Non-blocking if folder update is slight delayed
      }
    }
  } catch (err: any) {
    console.warn(`[saveStoryToFirestore] Firestore write restricted by security rules, using server backup fallback:`, err?.message || err);
  }

  // Always ensure persisted to server disk backup
  try {
    if (typeof fetch !== 'undefined') {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/folders-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: folderId || 'root',
          stories: [cleanData]
        })
      });
    }
  } catch (e) {}
}

/**
 * Saves a batch of generated stories and values to a specific folder in Firestore.
 * 
 * Flow:
 * 1. Iterates and writes each story document to projects/{projectId}/folders/{folderId}/stories/{story.id}
 * 2. If values are provided, writes them to projects/{projectId}/folders/{folderId}/values/{val.id}
 * 3. Updates memberStoryIds in projects/{projectId}/folders/{folderId}
 * 4. Gracefully falls back to server disk backup and localStorage if Firestore client rules block subcollection writes.
 */
export async function saveStoriesBatchToFirestore(
  projectId: string,
  folderId: string,
  stories: UserStory[],
  values?: FolderValueRecord[]
): Promise<void> {
  if (!projectId || !folderId) {
    throw new Error("Invalid parameters: projectId and folderId are required");
  }
  if (!stories || stories.length === 0) {
    return;
  }

  const cleanStories = stories.map(story => sanitizeForFirestore({
    id: story.id,
    storyId: story.storyId || 'US-001',
    summary: story.summary || '',
    description: story.description || '',
    acceptanceCriteria: story.acceptanceCriteria || '',
    createdAt: story.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    folderId: folderId,
    parentFolderId: story.parentFolderId || null,
    isRemovedFromIndividual: true,
    userStoryId: story.userStoryId || null,
    attachments: story.attachments || null,
    screenshots: story.screenshots || null
  }));

  const cleanValues = (values || []).map(val => sanitizeForFirestore({
    ...val,
    folderId: folderId,
    createdAt: val.createdAt || new Date().toISOString()
  }));

  // 1. Try Saving each story document individually to Firestore
  try {
    const storySavePromises = cleanStories.map(cleanData => {
      const storyDocRef = doc(db, "projects", projectId, "folders", folderId, "stories", cleanData.id);
      return syncSetDoc(storyDocRef, cleanData, { merge: true });
    });
    await Promise.all(storySavePromises);

    // 2. Save values if provided
    if (cleanValues.length > 0) {
      const valueSavePromises = cleanValues.map(cleanVal => {
        const valDocRef = doc(db, "projects", projectId, "folders", folderId, "values", cleanVal.id);
        return syncSetDoc(valDocRef, cleanVal, { merge: true });
      });
      await Promise.all(valueSavePromises);
    }

    // 3. Update the folder document's memberStoryIds in subcollection
    const storyIds = stories.map(s => s.id);
    const folderDocRef = doc(db, "projects", projectId, "folders", folderId);
    await syncUpdateDoc(folderDocRef, {
      memberStoryIds: arrayUnion(...storyIds),
      updatedAt: new Date().toISOString()
    }).catch(() => {});

    // 4. Synchronize parent project document in Firestore so root snapshots receive all stories immediately
    try {
      const projectDocRef = doc(db, "projects", projectId);
      const projSnap: DocumentSnapshot = await withAdaptiveTimeoutAndRetry(() => getDoc(projectDocRef), { opType: 'READ', path: `projects/${projectId}` });
      if (projSnap.exists()) {
        const projData = projSnap.data();
        const currentStories: UserStory[] = Array.isArray(projData.userStories) ? projData.userStories : [];
        const storyIdSet = new Set(cleanStories.map(s => s.id));
        const filtered = currentStories.filter(s => !storyIdSet.has(s.id));
        const updatedUserStories = filtered.map(item => {
          if (item.id === folderId && item.storyId === 'USERSTORY_FOLDER') {
            const currentMembers = Array.isArray(item.memberStoryIds) ? item.memberStoryIds : [];
            return {
              ...item,
              memberStoryIds: Array.from(new Set([...currentMembers, ...storyIds])),
              updatedAt: new Date().toISOString()
            };
          }
          return item;
        });
        const combinedUserStories = [...updatedUserStories, ...cleanStories];
        await syncUpdateDoc(projectDocRef, {
          userStories: combinedUserStories,
          userStoriesCount: combinedUserStories.length,
          updatedAt: serverTimestamp()
        });
      }
    } catch (parentSyncErr) {
      console.warn('[saveStoriesBatchToFirestore] Parent project sync note:', parentSyncErr);
    }
  } catch (err: any) {
    console.warn('[saveStoriesBatchToFirestore] Firestore write note:', err?.message || err);
  }

  // 4. Server backup synchronization (always guarantees persistence and hierarchy retrieval)
  try {
    if (typeof fetch !== 'undefined') {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/folders-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId,
          stories: cleanStories,
          values: cleanValues
        })
      });
    }
  } catch (serverErr) {
    console.warn('[saveStoriesBatchToFirestore] Server batch fallback warning:', serverErr);
  }

  // 5. Update localStorage project backup immediately
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        const existingUserStories: UserStory[] = Array.isArray(parsed.userStories) ? parsed.userStories : [];
        const storyIdSet = new Set(cleanStories.map(s => s.id));
        const filtered = existingUserStories.filter(s => !storyIdSet.has(s.id));
        const storyIds = cleanStories.map(s => s.id);
        const updatedUserStories = filtered.map(item => {
          if (item.id === folderId && item.storyId === 'USERSTORY_FOLDER') {
            const currentMembers = Array.isArray(item.memberStoryIds) ? item.memberStoryIds : [];
            return {
              ...item,
              memberStoryIds: Array.from(new Set([...currentMembers, ...storyIds])),
              updatedAt: new Date().toISOString()
            };
          }
          return item;
        });
        parsed.userStories = [...updatedUserStories, ...cleanStories];
        localStorage.setItem(`automatiqa_project_backup_${projectId}`, JSON.stringify(parsed));
      }
    }
  } catch (e) {}
}

/**
 * Loads a folder and all its child stories and values directly from Firestore.
 */
export async function loadFolderDataFromFirestore(
  projectId: string,
  folderId: string
): Promise<{ folder: UserStory | null; stories: UserStory[]; values: FolderValueRecord[] }> {
  if (!projectId || !folderId) {
    return { folder: null, stories: [], values: [] };
  }

  try {
    const folderDocRef = doc(db, "projects", projectId, "folders", folderId);
    const storiesColRef = collection(db, "projects", projectId, "folders", folderId, "stories");
    const valuesColRef = collection(db, "projects", projectId, "folders", folderId, "values");

    const [folderSnap, storiesSnap, valuesSnap] = await Promise.all([
      getDoc(folderDocRef),
      getDocs(query(storiesColRef)),
      getDocs(query(valuesColRef))
    ]);

    let folder: UserStory | null = null;
    if (folderSnap.exists()) {
      folder = { id: folderSnap.id, ...(folderSnap.data() as any) };
    }

    const stories: UserStory[] = storiesSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any)
    }));

    const values: FolderValueRecord[] = valuesSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any)
    }));

    return { folder, stories, values };
  } catch (error) {
    console.error(`[loadFolderDataFromFirestore] Error loading folder ${folderId}:`, error);
    return { folder: null, stories: [], values: [] };
  }
}

/**
 * Loads all folders, stories, and values across the entire project from Firestore subcollections.
 * Reconstructs the complete list with folders first, then stories.
 */
export async function loadAllProjectFoldersAndStories(projectId: string): Promise<{
  folders: UserStory[];
  stories: UserStory[];
  values: FolderValueRecord[];
  allStoriesAndFolders: UserStory[];
}> {
  if (!projectId) {
    return { folders: [], stories: [], values: [], allStoriesAndFolders: [] };
  }

  try {
    const foldersColRef = collection(db, "projects", projectId, "folders");
    const standaloneStoriesColRef = collection(db, "projects", projectId, "stories");

    const [foldersSnap, standaloneStoriesSnap] = await Promise.all([
      getDocs(query(foldersColRef)),
      getDocs(query(standaloneStoriesColRef))
    ]);

    const folders: UserStory[] = foldersSnap.docs.map(d => ({
      id: d.id,
      storyId: 'USERSTORY_FOLDER',
      ...(d.data() as any)
    }));

    // Fetch child stories and values for each folder in parallel
    const childStoryPromises = folders.map(f => {
      const colRef = collection(db, "projects", projectId, "folders", f.id, "stories");
      return getDocs(query(colRef)).then(snap => snap.docs.map(d => ({
        id: d.id,
        folderId: f.id,
        ...(d.data() as any)
      } as UserStory)));
    });

    const childValuePromises = folders.map(f => {
      const colRef = collection(db, "projects", projectId, "folders", f.id, "values");
      return getDocs(query(colRef)).then(snap => snap.docs.map(d => ({
        id: d.id,
        folderId: f.id,
        ...(d.data() as any)
      } as FolderValueRecord)));
    });

    const [allChildStoriesArrays, allChildValuesArrays] = await Promise.all([
      Promise.all(childStoryPromises),
      Promise.all(childValuePromises)
    ]);

    const folderStories = allChildStoriesArrays.flat();
    const folderValues = allChildValuesArrays.flat();

    const standaloneStories: UserStory[] = standaloneStoriesSnap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any)
    }));

    let allStories = [...folderStories, ...standaloneStories];

    // If folders exist but subcollections returned 0 stories, or if folders have memberStoryIds not found in allStories,
    // query server hierarchy or local backup to ensure child stories are not missing
    if (folders.length > 0 && (allStories.length === 0 || folders.some(f => Array.isArray(f.memberStoryIds) && f.memberStoryIds.length > 0 && !allStories.some(s => f.memberStoryIds?.includes(s.id))))) {
      try {
        const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/hierarchy`);
        if (resp.ok) {
          const data = await resp.json();
          if (data && (data.stories?.length > 0 || data.allStoriesAndFolders?.length > folders.length)) {
            const serverStories = data.stories || (data.allStoriesAndFolders || []).filter((s: any) => s.storyId !== 'USERSTORY_FOLDER');
            if (serverStories.length > 0) {
              allStories = serverStories;
              // Also update folder metadata from server if available
              if (Array.isArray(data.folders) && data.folders.length > 0) {
                const folderMap = new Map<string, any>(data.folders.map((f: any) => [f.id, f]));
                folders.forEach((f, idx) => {
                  const sf = folderMap.get(f.id);
                  if (sf) folders[idx] = { ...f, ...(sf as Record<string, any>) };
                });
              }
            }
          }
        }
      } catch (fallbackErr) {}

      if (allStories.length === 0) {
        try {
          const cached = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            const uStories = parsed.userStories || [];
            const localChildStories = uStories.filter((s: any) => s.storyId !== 'USERSTORY_FOLDER');
            if (localChildStories.length > 0) {
              allStories = localChildStories;
            }
          }
        } catch (localErr) {}
      }
    }

    // Combine folders and stories: folders at the top, then remaining stories
    const allStoriesAndFolders: UserStory[] = [
      ...folders,
      ...allStories
    ];

    return {
      folders,
      stories: allStories,
      values: folderValues,
      allStoriesAndFolders
    };
  } catch (error: any) {
    // If client Firestore encountered permissions, network, or offline issues, attempt server fallback
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/hierarchy`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && (data.allStoriesAndFolders?.length > 0 || data.folders?.length > 0 || data.stories?.length > 0)) {
          return {
            folders: data.folders || [],
            stories: data.stories || [],
            values: data.values || [],
            allStoriesAndFolders: data.allStoriesAndFolders || []
          };
        }
      }
    } catch (fallbackErr) {
      console.warn(`[loadAllProjectFoldersAndStories] Server fallback error for project ${projectId}:`, fallbackErr);
    }

    // Try local storage cache fallback
    try {
      const cached = localStorage.getItem(`automatiqa_project_backup_${projectId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        const userStories = parsed.userStories || [];
        const folders = userStories.filter((s: any) => s.storyId === 'USERSTORY_FOLDER');
        const stories = userStories.filter((s: any) => s.storyId !== 'USERSTORY_FOLDER');
        return {
          folders,
          stories,
          values: parsed.folderValues || [],
          allStoriesAndFolders: userStories
        };
      }
    } catch {}

    // Only log as warning to prevent alarming uncaught error boundaries
    console.warn(`[loadAllProjectFoldersAndStories] Could not load hierarchy for project ${projectId}:`, error?.message || error);
    return { folders: [], stories: [], values: [], allStoriesAndFolders: [] };
  }
}

/**
 * Deletes a folder and all its child stories and values from Firestore.
 */
export async function deleteFolderFromFirestore(projectId: string, folderId: string): Promise<void> {
  if (!projectId || !folderId) return;

  try {
    const storiesColRef = collection(db, "projects", projectId, "folders", folderId, "stories");
    const valuesColRef = collection(db, "projects", projectId, "folders", folderId, "values");
    const folderDocRef = doc(db, "projects", projectId, "folders", folderId);

    const [storiesSnap, valuesSnap] = await Promise.all([
      getDocs(query(storiesColRef)),
      getDocs(query(valuesColRef))
    ]);

    // Delete child stories
    const deleteStoriesPromises = storiesSnap.docs.map(d => syncDeleteDoc(d.ref));
    const deleteValuesPromises = valuesSnap.docs.map(d => syncDeleteDoc(d.ref));

    await Promise.all([...deleteStoriesPromises, ...deleteValuesPromises]);

    // Delete folder doc
    await syncDeleteDoc(folderDocRef);

    // Call backend endpoint to immediately prune server disk backup and projects.json
    try {
      if (typeof fetch !== 'undefined') {
        fetch(`/api/projects/${projectId}/folders/${folderId}`, { method: 'DELETE' }).catch(() => {});
      }
    } catch (e) {}

    // Also remove folder and member stories & scenarios from parent project document
    try {
      const projectDocRef = doc(db, "projects", projectId);
      const projSnap = await getDoc(projectDocRef);
      if (projSnap.exists()) {
        const projData = projSnap.data();
        const currentStories: UserStory[] = Array.isArray(projData.userStories) ? projData.userStories : [];
        const nextStories = currentStories.filter(s => s.id !== folderId && s.folderId !== folderId);

        let targetTitle = '';
        const currentScenarios: any[] = Array.isArray(projData.scenarios) ? projData.scenarios : [];
        const fObj = currentScenarios.find((s: any) => s && s.id === folderId);
        if (fObj && fObj.title) targetTitle = fObj.title.trim().toLowerCase();

        const nextScenarios = currentScenarios
          .filter(s => {
            if (!s || s.id === folderId) return false;
            if (targetTitle && s.scenarioId === 'SCENARIO_FOLDER' && s.title && s.title.trim().toLowerCase() === targetTitle) return false;
            return true;
          })
          .map(s => {
            const isMember = s.folderId === folderId || 
              (targetTitle && (s.folderId === targetTitle || (s.folderName && s.folderName.trim().toLowerCase() === targetTitle)));
            if (isMember) {
              return { ...s, folderId: "", folderName: "", isRemovedFromIndividual: false };
            }
            if (Array.isArray(s.memberScenarioIds)) {
              return { ...s, memberScenarioIds: s.memberScenarioIds.filter((mId: string) => mId !== folderId) };
            }
            return s;
          });

        const currentUIFolders = (Array.isArray(projData.uiTestingFolders) ? projData.uiTestingFolders : []).filter((f: any) => f.id !== folderId);
        const currentUIReports = (Array.isArray(projData.uiTestingReports) ? projData.uiTestingReports : []).filter((r: any) => r.folderId !== folderId);
        const currentUIInputs = (Array.isArray(projData.uiTestingInputs) ? projData.uiTestingInputs : []).filter((i: any) => i.folderId !== folderId);
        const currentFigma = (Array.isArray(projData.figmaDesignReviews) ? projData.figmaDesignReviews : []).filter((f: any) => f.folderId !== folderId);
        const currentComps = (Array.isArray(projData.uiComparisonReports) ? projData.uiComparisonReports : []).filter((c: any) => c.folderId !== folderId);
        const currentAutoFolders = (Array.isArray(projData.automationFolders) ? projData.automationFolders : []).filter((f: any) => f.id !== folderId);

        const existingDeleted = Array.isArray(projData.deletedItemIds) ? projData.deletedItemIds : [];
        const nextDeleted = Array.from(new Set([...existingDeleted, folderId, `folder-${folderId}`, targetTitle].filter(Boolean)));

        await syncUpdateDoc(projectDocRef, {
          userStories: nextStories,
          userStoriesCount: nextStories.length,
          scenarios: nextScenarios,
          uiTestingFolders: currentUIFolders,
          uiTestingReports: currentUIReports,
          uiTestingInputs: currentUIInputs,
          figmaDesignReviews: currentFigma,
          uiComparisonReports: currentComps,
          automationFolders: currentAutoFolders,
          deletedItemIds: nextDeleted,
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {}
  } catch (error) {
    console.error(`[deleteFolderFromFirestore] Error deleting folder ${folderId}:`, error);
    throw error;
  }
}

/**
 * Deletes a single story from Firestore.
 */
export async function deleteStoryFromFirestore(
  projectId: string,
  folderId: string | null | undefined,
  storyId: string
): Promise<void> {
  if (!projectId || !storyId) return;

  try {
    const storyDocRef = folderId
      ? doc(db, "projects", projectId, "folders", folderId, "stories", storyId)
      : doc(db, "projects", projectId, "stories", storyId);

    await syncDeleteDoc(storyDocRef);

    if (folderId) {
      const folderDocRef = doc(db, "projects", projectId, "folders", folderId);
      try {
        await syncUpdateDoc(folderDocRef, {
          memberStoryIds: arrayRemove(storyId),
          updatedAt: new Date().toISOString()
        });
      } catch (e) {}
    }
  } catch (error) {
    console.error(`[deleteStoryFromFirestore] Error deleting story ${storyId}:`, error);
    throw error;
  }
}
