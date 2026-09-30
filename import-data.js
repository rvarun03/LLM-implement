import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, GeoPoint } from 'firebase-admin/firestore';

const PREDEFINED_COLLECTIONS = [
  'users', 'projects', 'workspaces', 'teams', 'roles', 'permissions', 'settings',
  'aiScenarios', 'aiTestCases', 'testCases', 'testSuites', 'testExecutions', 'testResults',
  'automationScripts', 'apiCollections', 'performanceTests', 'accessibilityReports',
  'jiraIntegrations', 'githubIntegrations', 'slackIntegrations', 'notifications',
  'reports', 'dashboard', 'activityLogs', 'auditLogs', 'mobileTesting',
  'deviceConfigurations', 'attachments', 'executionHistory', 'activities', 'Aiscenario'
];

const IGNORED_JSON_FILES = new Set([
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'metadata.json',
  'firebase-blueprint.json',
  'firebase-applet-config.json',
  'main-key.json',
  'backup-key.json'
]);

function deserializeValue(val, db) {
  if (val === null || val === undefined) return val;

  if (typeof val === 'object') {
    if (val.__type__ === 'Timestamp') {
      return new Timestamp(val.seconds, val.nanoseconds);
    }
    if (val.__type__ === 'DocumentReference') {
      return db.doc(val.path);
    }
    if (val.__type__ === 'GeoPoint') {
      return new GeoPoint(val.latitude, val.longitude);
    }

    if (Array.isArray(val)) {
      return val.map(v => deserializeValue(v, db));
    }

    const res = {};
    for (const k of Object.keys(val)) {
      res[k] = deserializeValue(val[k], db);
    }
    return res;
  }

  return val;
}

async function importCollectionInBatches(db, collectionName, docs) {
  const BATCH_SIZE = 400;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    
    for (const docData of chunk) {
      const docRef = db.collection(collectionName).doc(docData.id);
      const deserialized = deserializeValue(docData.data, db);
      batch.set(docRef, deserialized);
    }
    
    await batch.commit();
    console.log(`  - Imported batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(docs.length / BATCH_SIZE)} for "${collectionName}" (${chunk.length} docs)`);
  }
}

async function runImport() {
  console.log("🚀 Starting import to Backup Firestore Database...");

  const keyPath = path.join(process.cwd(), 'backup-key.json');
  console.log(`Loading service account key from: ${keyPath}`);
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));

  const app = initializeApp({
    credential: cert(serviceAccount)
  }, 'import-app');

  const db = getFirestore(app);

  // Scan root directory for any JSON files to import
  const files = readdirSync(process.cwd());
  const collectionsToImport = [];

  for (const file of files) {
    if (file.endsWith('.json') && !IGNORED_JSON_FILES.has(file)) {
      const collectionName = path.basename(file, '.json');
      collectionsToImport.push({
        collectionName,
        filePath: path.join(process.cwd(), file)
      });
    }
  }

  // Also verify against predefined list if we missed anything or want to order/filter them
  console.log(`Found ${collectionsToImport.length} exported collection files to import.`);

  let totalDocsCount = 0;

  for (const { collectionName, filePath } of collectionsToImport) {
    try {
      console.log(`\nImporting collection "${collectionName}" from ${path.basename(filePath)}...`);
      const fileContent = readFileSync(filePath, 'utf8');
      const docs = JSON.parse(fileContent);

      if (!Array.isArray(docs)) {
        console.warn(`⚠ Skip: Content of ${path.basename(filePath)} is not an array.`);
        continue;
      }

      if (docs.length === 0) {
        console.log(`- Collection "${collectionName}" has 0 documents. Skipping.`);
        continue;
      }

      await importCollectionInBatches(db, collectionName, docs);
      console.log(`✓ Successfully imported ${docs.length} documents into collection "${collectionName}"`);
      totalDocsCount += docs.length;
    } catch (err) {
      console.error(`❌ Failed to import collection "${collectionName}":`, err.message);
    }
  }

  console.log(`\n🎉 Import complete! Total documents imported: ${totalDocsCount}`);
}

runImport().catch(err => {
  console.error("❌ Import script failed:", err);
  process.exit(1);
});
