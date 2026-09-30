// src/services/scenarioService.ts
import {
  collection,
  getDocs,
  query,
  where,
  doc
} from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { syncAddDoc, syncUpdateDoc, syncDeleteDoc } from "./firestoreSync";

/* =========================
   CREATE SCENARIO (AUTO SAVE)
========================= */
export const saveScenario = async (scenarioData: any) => {
  const path = "Aiscenario";
  try {
    return await syncAddDoc(collection(db, path), {
      ...scenarioData,
      status: "active",
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

/* =========================
   GET SCENARIOS BY PROJECT
========================= */
export const getScenariosByProject = async (projectId: string) => {
  const path = "Aiscenario";
  const q = query(
    collection(db, path),
    where("projectId", "==", projectId)
  );

  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

/* =========================
   GET SCENARIOS FOR USER
========================= */
export const getScenariosForUser = async (email: string) => {
  const path = "Aiscenario";
  const q = query(
    collection(db, path),
    where("allocatedUsers", "array-contains", email)
  );

  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
};

/* =========================
   DELETE SCENARIO
========================= */
export const deleteScenario = async (scenarioId: string) => {
  const path = `Aiscenario/${scenarioId}`;
  try {
    await syncDeleteDoc(doc(db, "Aiscenario", scenarioId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

/* =========================
   UPDATE SCENARIO
========================= */
export const updateScenario = async (scenarioId: string, data: any) => {
  const path = `Aiscenario/${scenarioId}`;
  try {
    await syncUpdateDoc(doc(db, "Aiscenario", scenarioId), data);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};
