import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PREDEFINED_COLLECTIONS = [
  'users', 'projects', 'workspaces', 'teams', 'roles', 'permissions', 'settings',
  'aiScenarios', 'aiTestCases', 'testCases', 'testSuites', 'testExecutions', 'testResults',
  'automationScripts', 'apiCollections', 'performanceTests', 'accessibilityReports',
  'jiraIntegrations', 'githubIntegrations', 'slackIntegrations', 'notifications',
  'reports', 'dashboard', 'activityLogs', 'auditLogs', 'mobileTesting',
  'deviceConfigurations', 'attachments', 'executionHistory', 'activities', 'Aiscenario'
];

function serializeValue(val) {
  if (val === null || val === undefined) return val;

  // Handle Timestamp
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      return { 
        __type__: 'Timestamp', 
        seconds: val.seconds !== undefined ? val.seconds : val._seconds, 
        nanoseconds: val.nanoseconds !== undefined ? val.nanoseconds : val._nanoseconds 
      };
    }
    if (val.constructor && (val.constructor.name === 'Timestamp' || val.constructor.name === 'rt')) {
      return { 
        __type__: 'Timestamp', 
        seconds: val.seconds !== undefined ? val.seconds : val._seconds, 
        nanoseconds: val.nanoseconds !== undefined ? val.nanoseconds : val._nanoseconds 
      };
    }
    if (val.seconds !== undefined && val.nanoseconds !== undefined && Object.keys(val).length === 2) {
      return { __type__: 'Timestamp', seconds: val.seconds, nanoseconds: val.nanoseconds };
    }
    if (val._seconds !== undefined && val._nanoseconds !== undefined) {
      return { __type__: 'Timestamp', seconds: val._seconds, nanoseconds: val._nanoseconds };
    }
    
    // Handle DocumentReference
    if (val.constructor && val.constructor.name === 'DocumentReference') {
      return { __type__: 'DocumentReference', path: val.path };
    }
    if (typeof val.path === 'string' && typeof val.id === 'string' && val.firestore) {
      return { __type__: 'DocumentReference', path: val.path };
    }

    // Handle GeoPoint
    if (val.constructor && val.constructor.name === 'GeoPoint') {
      return { __type__: 'GeoPoint', latitude: val.latitude, longitude: val.longitude };
    }
    if (val.latitude !== undefined && val.longitude !== undefined && Object.keys(val).length === 2) {
      return { __type__: 'GeoPoint', latitude: val.latitude, longitude: val.longitude };
    }

    if (Array.isArray(val)) {
      return val.map(serializeValue);
    }

    const res = {};
    for (const k of Object.keys(val)) {
      res[k] = serializeValue(val[k]);
    }
    return res;
  }

  return val;
}

async function runExport() {
  console.log("🚀 Starting export from Main Firestore Database...");
  
  const keyPath = path.join(process.cwd(), 'main-key.json');
  console.log(`Loading service account key from: ${keyPath}`);
  const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));

  const app = initializeApp({
    credential: cert(serviceAccount)
  }, 'export-app');

  const db = getFirestore(app, "ai-studio-880ad9a9-93f0-4629-a7b4-349061b6ea24");

  console.log("Fetching dynamic collections list...");
  const collections = await db.listCollections();
  const collectionNames = new Set(collections.map(c => c.id));

  // Add predefined collections
  for (const name of PREDEFINED_COLLECTIONS) {
    collectionNames.add(name);
  }

  console.log(`Found collections to check: ${Array.from(collectionNames).join(', ')}`);

  let totalDocsCount = 0;

  for (const name of collectionNames) {
    try {
      const colRef = db.collection(name);
      const snapshot = await colRef.get();
      
      if (snapshot.empty) {
        console.log(`- Collection "${name}" is empty, skipping.`);
        continue;
      }

      const docs = [];
      snapshot.forEach(doc => {
        docs.push({
          id: doc.id,
          data: serializeValue(doc.data())
        });
      });

      const outFile = path.join(process.cwd(), `${name}.json`);
      writeFileSync(outFile, JSON.stringify(docs, null, 2));
      console.log(`✓ Exported ${docs.length} documents from collection "${name}" to "${name}.json"`);
      totalDocsCount += docs.length;
    } catch (err) {
      console.error(`❌ Failed to export collection "${name}":`, err.message);
    }
  }

  console.log(`\n🎉 Export complete! Total documents exported: ${totalDocsCount}`);
}

runExport().catch(err => {
  console.error("❌ Export script failed:", err);
  process.exit(1);
});
