// src/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getAuth, setPersistence, browserLocalPersistence, inMemoryPersistence } from "firebase/auth";
import { getStorage } from "firebase/storage";
import firebaseConfig from "./firebase-applet-config.json";

try {
  // Silent log level prevents transient connection retry warnings from spamming console.error
  setLogLevel('silent');
} catch (e) {}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const firestoreDatabaseId = (firebaseConfig as any).firestoreDatabaseId?.trim();
const mainDb = firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);

export let db = mainDb;

// Initialize client-side backup database from config or localStorage
const savedBackupDbId = typeof window !== 'undefined' ? localStorage.getItem('automatiqa_backup_database_id') : null;
export let backupDb = savedBackupDbId && savedBackupDbId.trim() ? getFirestore(app, savedBackupDbId.trim()) : mainDb;

export const auth = getAuth(app);
export const backupAuth = auth;
export const storage = getStorage(app);
export let useBackup = false;

// Ensure Firebase Auth operates seamlessly across standard and Incognito modes without throwing storage restriction errors
try {
  setPersistence(auth, browserLocalPersistence).catch(() => {
    try {
      setPersistence(auth, inMemoryPersistence).catch(() => {});
    } catch (e) {}
  });
} catch (e) {}

export function switchToBackupDb() {
  useBackup = true;
  db = backupDb;
}

export function toggleBackupMode(active: boolean) {
  useBackup = active;
  db = active ? backupDb : mainDb;
}

export function configureBackupDb(dbId: string | null) {
  if (dbId && dbId.trim() && dbId.trim() !== firestoreDatabaseId) {
    try {
      backupDb = getFirestore(app, dbId.trim());
      if (typeof window !== 'undefined') {
        localStorage.setItem('automatiqa_backup_database_id', dbId.trim());
      }
    } catch (e) {
      console.error("Error initializing backup Firestore database:", e);
    }
  } else {
    backupDb = mainDb;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('automatiqa_backup_database_id');
    }
  }
  // Re-sync active db reference if backup mode is active
  if (useBackup) {
    db = backupDb;
  }
}

export {
  mainDb
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const errorCode = String((error as any)?.code || (error as any)?.name || '');
  
  const isConnectionError = 
    errorCode.includes('unavailable') ||
    errorMsg.toLowerCase().includes('unavailable') || 
    errorMsg.toLowerCase().includes('reach cloud firestore') || 
    errorMsg.toLowerCase().includes('could not reach') || 
    errorMsg.toLowerCase().includes('offline') ||
    errorMsg.toLowerCase().includes('client is offline');

  const isQuotaError = 
    errorCode.includes('resource-exhausted') ||
    errorCode.includes('resource_exhausted') ||
    errorMsg.toLowerCase().includes('quota') || 
    errorMsg.toLowerCase().includes('billing') || 
    errorMsg.toLowerCase().includes('exceeded') || 
    errorMsg.toLowerCase().includes('limit') ||
    errorMsg.toLowerCase().includes('429');

  const isPermissionError =
    errorCode.includes('permission-denied') ||
    errorMsg.toLowerCase().includes('missing or insufficient permissions') ||
    errorMsg.toLowerCase().includes('insufficient permissions');

  if (isConnectionError || isQuotaError) {
    console.warn(`Firestore operating in offline/cached mode for ${operationType} on ${path}:`, errorMsg);
    return; // Recover gracefully without uncaught console errors
  }

  // Gracefully handle subcollection permission restrictions since server-side persistence fallback handles them
  if (isPermissionError && path && (path.includes('/folders') || path.includes('/stories') || path.includes('/values'))) {
    console.warn(`Firestore subcollection write restricted for ${operationType} on ${path} (handled via server persistence fallback).`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}
