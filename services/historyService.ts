import { mainDb, handleFirestoreError, OperationType } from '../firebase';
import { doc } from 'firebase/firestore';
import { syncSetDoc } from './firestoreSync';

export interface AIHistoryRecord {
  id?: string;
  projectId: string;
  feature: string;
  query: string;
  retrievedChunks: Array<{ chunkId: string; pageNumber: number; textSnippet: string; similarity: number }>;
  prompt: string;
  response: any;
  model: string;
  tokens: number;
  cost: number;
  responseTime: number;
  timestamp: string;
  workspaceId?: string;
  userId?: string;
}

/**
 * Logs an AI generation run to Firestore `ai_history` collection.
 */
export async function recordAIHistory(record: AIHistoryRecord): Promise<string> {
  const historyId = record.id || `hist_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  const timestamp = record.timestamp || new Date().toISOString();

  // Estimate tokens & cost if not provided
  const promptTokens = Math.ceil((record.prompt || '').length / 4);
  const responseStr = typeof record.response === 'string' ? record.response : JSON.stringify(record.response || '');
  const responseTokens = Math.ceil(responseStr.length / 4);
  const totalTokens = record.tokens || (promptTokens + responseTokens);
  
  // Estimated cost for gemini-3.8-flash ($0.000075 / 1k tokens)
  const estimatedCost = record.cost || Number(((totalTokens / 1000) * 0.000075).toFixed(6));

  const payload: AIHistoryRecord = {
    ...record,
    id: historyId,
    tokens: totalTokens,
    cost: estimatedCost,
    timestamp
  };

  try {
    const docRef = doc(mainDb, 'ai_history', historyId);
    await syncSetDoc(docRef, payload, { merge: true });
  } catch (error: any) {
    handleFirestoreError(error, OperationType.WRITE, 'ai_history');
    console.warn('[HistoryService] Recorded AI history to console fallback:', historyId);
  }

  return historyId;
}
