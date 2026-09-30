import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from "firebase/firestore";
import { mainDb, backupDb, db, useBackup, handleFirestoreError, OperationType } from "../firebase";
import { logger, getTraceId } from "./appLogger";

/**
 * Recursively strips out any keys with `undefined` values,
 * preventing Firestore "Function setDoc() called with invalid data. Unsupported field value: undefined" errors.
 * Preserves Date, FieldValue (arrayUnion, arrayRemove, serverTimestamp, etc.), and custom Firestore objects.
 */
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  if (obj instanceof Date) {
    return obj;
  }
  // Preserve Firestore FieldValue and custom class instances
  const constructorName = obj?.constructor?.name;
  if (
    constructorName &&
    constructorName !== 'Object' &&
    constructorName !== 'Array'
  ) {
    return obj;
  }
  if (
    typeof (obj as any)?._methodName === 'string' ||
    typeof (obj as any)?.isEqual === 'function' ||
    (obj as any)?._delegate !== undefined
  ) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore) as unknown as T;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      cleaned[key] = sanitizeForFirestore(val);
    }
  }
  return cleaned as T;
}

export interface FirestoreOpOptions {
  opType: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE';
  path: string;
  maxRetries?: number;
  initialTimeoutMs?: number;
}

/**
 * Executes a Firestore operation with adaptive timeouts, retry logic, and complete lifecycle logs.
 * Prevents unhandled promise rejections by cleanly handling timeouts and failures.
 */
export async function withAdaptiveTimeoutAndRetry<T>(
  fn: () => Promise<T>,
  options: FirestoreOpOptions
): Promise<T> {
  const { opType, path, maxRetries = 2, initialTimeoutMs = 25000 } = options;
  const traceId = getTraceId();
  const startTime = Date.now();

  logger.logOperation('FirestoreSync', `${opType}_${path}`, 'STARTED', `[Firestore ${opType}] Started execution on ${path}`, {
    opType,
    path,
    initialTimeoutMs,
    maxRetries
  }, 0, traceId);

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutMs = initialTimeoutMs + (attempt * 5000);
    const attemptStart = Date.now();

    if (attempt > 0) {
      logger.logOperation('FirestoreSync', `${opType}_${path}`, 'PROCESSING', `[Firestore ${opType}] Retry attempt ${attempt}/${maxRetries} on ${path}`, {
        opType,
        path,
        attempt,
        timeoutMs
      }, Date.now() - startTime, traceId);
    }

    try {
      let timer: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Firestore ${opType} operation timed out after ${timeoutMs}ms (attempt ${attempt + 1})`));
        }, timeoutMs);
      });

      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timer);

      const durationMs = Date.now() - startTime;
      logger.logOperation('FirestoreSync', `${opType}_${path}`, 'SUCCESS', `[Firestore ${opType}] Successfully completed on ${path}`, {
        opType,
        path,
        attempt,
        durationMs
      }, durationMs, traceId);

      if (durationMs > 1500) {
        logger.logPerformance('FirestoreSync', `${opType} ${path}`, durationMs, 1500, { path, opType }, traceId);
      }

      return result;
    } catch (err: any) {
      lastError = err;
      const attemptDuration = Date.now() - attemptStart;

      const errMsg = err?.message || String(err);
      const isPermanentError = 
        errMsg.includes('exceeds the maximum allowed size') ||
        errMsg.includes('1,048,576') ||
        (errMsg.includes('size') && errMsg.includes('exceeds')) ||
        errMsg.includes('insufficient permissions') ||
        errMsg.includes('permission-denied') ||
        errMsg.includes('Permission denied');

      if (isPermanentError) {
        logger.warn('FirestoreSync', `[Firestore ${opType}] Permanent error on ${path}, skipping retries: ${errMsg}`, {
          opType,
          path,
          error: errMsg
        }, `${opType}_PermanentError`, undefined, undefined, traceId);
        throw err;
      }

      const isFinalAttempt = attempt >= maxRetries;

      if (!isFinalAttempt) {
        logger.info('FirestoreSync', `[Firestore ${opType}] Attempt ${attempt + 1} will retry on ${path}: ${err?.message || err}`, {
          opType,
          path,
          attempt,
          attemptDurationMs: attemptDuration,
          error: err?.message || String(err)
        }, `${opType}_Retrying`, undefined, undefined, traceId);
      } else {
        logger.warn('FirestoreSync', `[Firestore ${opType}] Attempt ${attempt + 1} failed on ${path}: ${err?.message || err}`, {
          opType,
          path,
          attempt,
          attemptDurationMs: attemptDuration,
          error: err?.message || String(err)
        }, `${opType}_AttemptFailed`, undefined, undefined, traceId);
      }
    }
  }

  const totalDurationMs = Date.now() - startTime;
  logger.logOperation('FirestoreSync', `${opType}_${path}`, 'FAILED', `[Firestore ${opType}] All ${maxRetries + 1} attempts failed/timed out on ${path}`, {
    opType,
    path,
    totalDurationMs,
    error: lastError?.message || String(lastError)
  }, totalDurationMs, traceId);

  throw lastError;
}

const logSuccessMain = (path?: string) => logger.info('FirestoreSync', `Saved to Original Database (${path || ''})`, { path }, 'MainDatabaseSave');
const logSuccessBackup = (path?: string) => logger.debug('FirestoreSync', `Saved to Backup Database (${path || ''})`, { path }, 'BackupDatabaseSave');
const logBackupFailure = (err: any, path?: string) => logger.warn('FirestoreSync', `Original saved, Backup synchronization failed for ${path || ''}`, { error: err?.message || err, path }, 'BackupSyncFail');

function logMainSaveError(mainErr: any, path: string) {
  const errMsg = mainErr?.message || String(mainErr);
  const isExpected = 
    errMsg.includes('permissions') || 
    errMsg.includes('Quota') || 
    errMsg.includes('exhausted') || 
    errMsg.includes('resource-exhausted') ||
    errMsg.includes('timed out') ||
    errMsg.includes('timeout') ||
    errMsg.includes('offline') ||
    errMsg.includes('exceeds the maximum allowed size') ||
    errMsg.includes('1,048,576');

  if (isExpected) {
    logger.warn('FirestoreSync', `Firestore save notice on ${path} (${errMsg})`, { path, error: errMsg }, 'MainSaveRestricted');
  } else {
    logger.error('FirestoreSync', `Original Database save failed on ${path}`, mainErr, 'MainSaveError');
  }
  handleFirestoreError(mainErr, OperationType.WRITE, path);
}

/**
 * Adds a new document to the collection, preserving auto-generated IDs across databases.
 */
export async function syncAddDoc(collectionRef: any, data: any) {
  const cleanData = sanitizeForFirestore(data);
  const path = collectionRef.path;
  
  if (useBackup) {
    const backupDocRef = doc(collection(backupDb, path));
    try {
      await withAdaptiveTimeoutAndRetry(
        () => setDoc(backupDocRef, cleanData),
        { opType: 'CREATE', path }
      );
      logSuccessBackup(path);
      return backupDocRef;
    } catch (err) {
      console.error("Backup Database save failed:", err);
      handleFirestoreError(err, OperationType.WRITE, path);
      throw err;
    }
  }
  
  const mainDocRef = doc(collection(mainDb, path));
  const docId = mainDocRef.id;

  let mainSuccess = false;
  try {
    await withAdaptiveTimeoutAndRetry(
      () => setDoc(mainDocRef, cleanData),
      { opType: 'CREATE', path }
    );
    logSuccessMain(path);
    mainSuccess = true;
  } catch (mainErr) {
    logMainSaveError(mainErr, path);
    throw mainErr;
  }

  if (mainSuccess && backupDb && backupDb !== mainDb) {
    try {
      const backupDocRef = doc(backupDb, path, docId);
      await withAdaptiveTimeoutAndRetry(
        () => setDoc(backupDocRef, cleanData),
        { opType: 'CREATE', path: `${path}/${docId}` }
      ).catch(e => logBackupFailure(e, path));
      logSuccessBackup(path);
    } catch (err) {
      logBackupFailure(err, path);
    }
  }

  return mainDocRef;
}

/**
 * Sets document data, supporting options (such as merge).
 */
export async function syncSetDoc(docRef: any, data: any, options?: any) {
  const cleanData = sanitizeForFirestore(data);
  const path = docRef.path;
  const timeoutMs = options?.timeoutMs || 25000;
  // Separate Firestore setDoc options (like { merge: true }) from internal sync options
  const { timeoutMs: _t, ...firestoreOptions } = options || {};
  const hasOptions = Object.keys(firestoreOptions).length > 0;

  if (useBackup) {
    try {
      await withAdaptiveTimeoutAndRetry(
        () => hasOptions ? setDoc(doc(backupDb, path), cleanData, firestoreOptions) : setDoc(doc(backupDb, path), cleanData),
        { opType: 'UPDATE', path, initialTimeoutMs: timeoutMs }
      );
      logSuccessBackup(path);
      return;
    } catch (err) {
      console.error("Backup Database save failed:", err);
      handleFirestoreError(err, OperationType.WRITE, path);
      throw err;
    }
  }

  let mainSuccess = false;
  try {
    await withAdaptiveTimeoutAndRetry(
      () => hasOptions ? setDoc(doc(mainDb, path), cleanData, firestoreOptions) : setDoc(doc(mainDb, path), cleanData),
      { opType: 'UPDATE', path, initialTimeoutMs: timeoutMs }
    );
    logSuccessMain(path);
    mainSuccess = true;
  } catch (mainErr) {
    logMainSaveError(mainErr, path);
    throw mainErr;
  }

  if (mainSuccess && backupDb && backupDb !== mainDb) {
    try {
      await withAdaptiveTimeoutAndRetry(
        () => hasOptions ? setDoc(doc(backupDb, path), cleanData, firestoreOptions) : setDoc(doc(backupDb, path), cleanData),
        { opType: 'UPDATE', path, initialTimeoutMs: timeoutMs }
      ).catch(e => logBackupFailure(e, path));
      logSuccessBackup(path);
    } catch (err) {
      logBackupFailure(err, path);
    }
  }
}

/**
 * Updates an existing document in both databases (upsert with merge: true).
 */
export async function syncUpdateDoc(docRef: any, data: any) {
  const cleanData = sanitizeForFirestore(data);
  const path = docRef.path;

  if (useBackup) {
    try {
      await withAdaptiveTimeoutAndRetry(
        () => setDoc(doc(backupDb, path), cleanData, { merge: true }),
        { opType: 'UPDATE', path, initialTimeoutMs: 25000 }
      );
      logSuccessBackup(path);
      return;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('exceeds the maximum allowed size') || errMsg.includes('1,048,576')) {
        logger.warn('FirestoreSync', `Backup document size exceeded on merge on ${path}. Overwriting without merge...`, { path });
        try {
          await withAdaptiveTimeoutAndRetry(
            () => setDoc(doc(backupDb, path), cleanData),
            { opType: 'UPDATE', path, initialTimeoutMs: 15000 }
          );
          logSuccessBackup(path);
          return;
        } catch (backupReplaceErr) {
          console.error("Backup Database save failed:", backupReplaceErr);
          handleFirestoreError(backupReplaceErr, OperationType.WRITE, path);
          throw backupReplaceErr;
        }
      }
      console.error("Backup Database save failed:", err);
      handleFirestoreError(err, OperationType.WRITE, path);
      throw err;
    }
  }

  let mainSuccess = false;
  try {
    await withAdaptiveTimeoutAndRetry(
      () => setDoc(doc(mainDb, path), cleanData, { merge: true }),
      { opType: 'UPDATE', path, initialTimeoutMs: 25000 }
    );
    logSuccessMain(path);
    mainSuccess = true;
  } catch (mainErr: any) {
    const errMsg = mainErr?.message || String(mainErr);
    if (errMsg.includes('exceeds the maximum allowed size') || errMsg.includes('1,048,576') || errMsg.includes('size')) {
      logger.warn('FirestoreSync', `Document size exceeded on merge on ${path}. Overwriting without merge to shrink document...`, { path });
      try {
        await withAdaptiveTimeoutAndRetry(
          () => setDoc(doc(mainDb, path), cleanData),
          { opType: 'UPDATE', path, initialTimeoutMs: 30000 }
        );
        logSuccessMain(path);
        mainSuccess = true;
      } catch (replaceErr) {
        logMainSaveError(replaceErr, path);
        throw replaceErr;
      }
    } else {
      logMainSaveError(mainErr, path);
      throw mainErr;
    }
  }

  if (mainSuccess && backupDb && backupDb !== mainDb) {
    try {
      await withAdaptiveTimeoutAndRetry(
        () => setDoc(doc(backupDb, path), cleanData, { merge: true }),
        { opType: 'UPDATE', path, initialTimeoutMs: 25000 }
      ).catch(e => logBackupFailure(e, path));
      logSuccessBackup(path);
    } catch (err) {
      logBackupFailure(err, path);
    }
  }
}

/**
 * Deletes a document from the Original Database ONLY.
 */
export async function syncDeleteDoc(docRef: any) {
  const path = docRef.path;

  if (useBackup) {
    try {
      await withAdaptiveTimeoutAndRetry(
        () => deleteDoc(doc(db, path)),
        { opType: 'DELETE', path }
      );
      logger.info('FirestoreSync', `Deleted from active fallback database: ${path}`, { path }, 'DeleteFallbackSuccess');
    } catch (err) {
      logger.warn('FirestoreSync', `Delete error on active fallback: ${path}`, { path, error: err }, 'DeleteFallbackWarn');
    }
    return;
  }

  try {
    await withAdaptiveTimeoutAndRetry(
      () => deleteDoc(doc(mainDb, path)),
      { opType: 'DELETE', path }
    );
    logger.info('FirestoreSync', `Deleted from Original Database (${path})`, { path }, 'DeleteMainSuccess');
  } catch (mainErr) {
    handleFirestoreError(mainErr, OperationType.DELETE, path);
  }
}
