import path from "path";
import fs from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import firebaseConfig from "../firebase-applet-config.json";

let backupReplicationRunning = false;
let lastQuotaExceededTime = 0;
const QUOTA_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown if quota is exhausted

/**
 * Initializes and returns the admin DB and Auth instances for Main and Backup projects.
 */
function getAdminInstances() {
  const mainKeyPath = path.join(process.cwd(), "main-key.json");
  const backupKeyPath = path.join(process.cwd(), "backup-key.json");

  if (!fs.existsSync(mainKeyPath) || !fs.existsSync(backupKeyPath)) {
    return null;
  }

  try {
    const mainKey = JSON.parse(fs.readFileSync(mainKeyPath, "utf8"));
    const backupKey = JSON.parse(fs.readFileSync(backupKeyPath, "utf8"));

    const existingApps = getApps();
    let mainApp = existingApps.find(a => a.name === "server-main-sync");
    if (!mainApp) {
      mainApp = initializeApp({ credential: cert(mainKey) }, "server-main-sync");
    }

    let backupApp = existingApps.find(a => a.name === "server-backup-sync");
    if (!backupApp) {
      backupApp = initializeApp({ credential: cert(backupKey) }, "server-backup-sync");
    }

    const firestoreDbId = (firebaseConfig as any).firestoreDatabaseId || "ai-studio-880ad9a9-93f0-4629-a7b4-349061b6ea24";
    const mainDb = getFirestore(mainApp, firestoreDbId);
    const backupDb = getFirestore(backupApp);

    const mainAuth = getAuth(mainApp);
    const backupAuth = getAuth(backupApp);

    return { mainDb, backupDb, mainAuth, backupAuth };
  } catch (err) {
    console.warn("[BackupReplication] Could not initialize service accounts:", err);
    return null;
  }
}

/**
 * Helper to check if an error is a Quota/Resource Exhausted error
 */
function isQuotaError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || err);
  const code = err?.code;
  return code === 8 || code === 'RESOURCE_EXHAUSTED' || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota exceeded');
}

/**
 * Synchronizes Firebase Auth users from Main to Backup Auth.
 */
export async function syncAuthUsers(): Promise<{ synced: number; created: number; errors: number }> {
  const instances = getAdminInstances();
  if (!instances) return { synced: 0, created: 0, errors: 0 };

  const { mainAuth, backupAuth } = instances;
  let created = 0;
  let synced = 0;
  let errors = 0;

  try {
    const listResult = await mainAuth.listUsers(1000);
    for (const u of listResult.users) {
      try {
        try {
          await backupAuth.getUser(u.uid);
          await backupAuth.updateUser(u.uid, {
            email: u.email,
            emailVerified: u.emailVerified,
            displayName: u.displayName || undefined,
            photoURL: u.photoURL || undefined,
            disabled: u.disabled
          });
          synced++;
        } catch (err: any) {
          if (err.code === "auth/user-not-found") {
            await backupAuth.createUser({
              uid: u.uid,
              email: u.email,
              emailVerified: u.emailVerified,
              displayName: u.displayName || undefined,
              photoURL: u.photoURL || undefined,
              disabled: u.disabled
            });
            created++;
          } else if (isQuotaError(err)) {
            console.warn(`[BackupReplication] Auth sync quota limit reached:`, err.message);
            lastQuotaExceededTime = Date.now();
            break;
          } else {
            throw err;
          }
        }
      } catch (userErr: any) {
        if (isQuotaError(userErr)) {
          console.warn(`[BackupReplication] Auth user sync quota exceeded. Pausing sync.`);
          lastQuotaExceededTime = Date.now();
          break;
        }
        console.warn(`[BackupReplication] Error syncing auth user ${u.email}:`, userErr?.message || userErr);
        errors++;
      }
    }
    console.log(`[BackupReplication] Auth sync complete: ${created} created, ${synced} updated, ${errors} errors.`);
  } catch (e: any) {
    if (isQuotaError(e)) {
      lastQuotaExceededTime = Date.now();
      console.warn("[BackupReplication] Auth sync quota exhausted:", e?.message || e);
    } else {
      console.warn("[BackupReplication] List users failed:", e);
    }
  }

  return { synced, created, errors };
}

/**
 * Synchronizes all Firestore collections and documents from Main DB to Backup DB.
 */
export async function syncFirestoreCollections(): Promise<{ totalCollections: number; totalDocsSynced: number; status?: string }> {
  const instances = getAdminInstances();
  if (!instances) return { totalCollections: 0, totalDocsSynced: 0, status: "no_instances" };

  if (Date.now() - lastQuotaExceededTime < QUOTA_COOLDOWN_MS) {
    const remainingMins = Math.ceil((QUOTA_COOLDOWN_MS - (Date.now() - lastQuotaExceededTime)) / 60000);
    console.log(`[BackupReplication] Firestore replication skipped (Quota cooldown active for ~${remainingMins}m).`);
    return { totalCollections: 0, totalDocsSynced: 0, status: "quota_cooldown" };
  }

  const { mainDb, backupDb } = instances;
  let totalDocsSynced = 0;
  let totalCollections = 0;

  try {
    const mainCols = await mainDb.listCollections();
    totalCollections = mainCols.length;

    for (const col of mainCols) {
      try {
        const snap = await col.get();
        const docs = snap.docs;
        const BATCH_SIZE = 50; // Safer batch size with pacing

        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          const chunk = docs.slice(i, i + BATCH_SIZE);
          const batch = backupDb.batch();
          for (const docSnap of chunk) {
            const targetRef = backupDb.collection(col.id).doc(docSnap.id);
            batch.set(targetRef, docSnap.data(), { merge: true });
            totalDocsSynced++;
          }
          await batch.commit();

          // Pacing delay to avoid spiking Firestore free-tier write quotas
          await new Promise(r => setTimeout(r, 60));
        }
      } catch (colErr: any) {
        if (isQuotaError(colErr)) {
          lastQuotaExceededTime = Date.now();
          console.warn(`[BackupReplication] Quota limit reached on collection "${col.id}". Pausing replication.`);
          return { totalCollections, totalDocsSynced, status: "quota_exceeded" };
        }
        console.warn(`[BackupReplication] Warning copying collection "${col.id}":`, colErr?.message || colErr);
      }
    }
    console.log(`[BackupReplication] Firestore replication complete: ${mainCols.length} collections, ${totalDocsSynced} documents processed.`);
    return { totalCollections: mainCols.length, totalDocsSynced, status: "success" };
  } catch (err: any) {
    if (isQuotaError(err)) {
      lastQuotaExceededTime = Date.now();
      console.warn("[BackupReplication] Firestore replication quota exhausted. Backing off.", err?.message || err);
      return { totalCollections, totalDocsSynced, status: "quota_exceeded" };
    }
    console.warn("[BackupReplication] Firestore replication error:", err?.message || err);
    return { totalCollections, totalDocsSynced, status: "error" };
  }
}

/**
 * Executes a full synchronization of Auth users and Firestore collections.
 */
export async function runFullReplication(): Promise<any> {
  if (backupReplicationRunning) {
    return { status: "already_running" };
  }

  backupReplicationRunning = true;
  try {
    console.log("[BackupReplication] Starting full synchronization to AutomatiQA Backup...");
    const authResult = await syncAuthUsers();
    const firestoreResult = await syncFirestoreCollections();
    console.log("[BackupReplication] Full synchronization finished.");
    return {
      status: "success",
      auth: authResult,
      firestore: firestoreResult,
      timestamp: new Date().toISOString()
    };
  } catch (error: any) {
    console.error("[BackupReplication] Replication error:", error);
    return { status: "error", message: error?.message || String(error) };
  } finally {
    backupReplicationRunning = false;
  }
}

/**
 * Initializes automatic background synchronization routine.
 */
export function startReplicationSchedule() {
  // Run on startup after 10 seconds delay to let services settle
  setTimeout(() => {
    runFullReplication().catch(e => console.warn("[BackupReplication] Startup sync note:", e));
  }, 10000);

  // Gentle recurring check every 60 minutes
  setInterval(() => {
    runFullReplication().catch(e => console.warn("[BackupReplication] Scheduled sync note:", e));
  }, 60 * 60 * 1000);
}
