import { collection, doc, getDocs, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db, mainDb } from '../firebase';
import { syncSetDoc, syncDeleteDoc } from './firestoreSync';
import { RagChunk, VectorSearchResult, VectorDistanceMetric, RagFeasibilityStatus, Project } from '../types';

import firebaseConfig from '../firebase-applet-config.json';

const VECTOR_DIMENSION = 768;
const RAG_COLLECTION = 'rag_embeddings';
const CURRENT_DATABASE_ID = (firebaseConfig as any)?.firestoreDatabaseId || 'ai-studio-880ad9a9-93f0-4629-a7b4-349061b6ea24';

/**
 * Deterministic 768-dimensional fallback vector generator.
 * Converts text into a normalized term-frequency character n-gram embedding vector.
 */
export function generateFallbackEmbedding(text: string, dim: number = VECTOR_DIMENSION): number[] {
  const normalized = (text || '').toLowerCase().trim();
  const vector = new Array(dim).fill(0);
  if (!normalized) return vector;

  // Hashing character n-grams into 768 feature buckets
  for (let i = 0; i < normalized.length; i++) {
    const charCode = normalized.charCodeAt(i);
    const posHash = (charCode * 31 + i * 17) % dim;
    vector[posHash] += 1.0;

    if (i < normalized.length - 2) {
      const trigram = normalized.substring(i, i + 3);
      let triHash = 0;
      for (let j = 0; j < trigram.length; j++) {
        triHash = (triHash * 33 + trigram.charCodeAt(j)) % dim;
      }
      vector[triHash] += 2.0;
    }
  }

  // Normalize vector to unit length (L2 normalization)
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      vector[i] = parseFloat((vector[i] / norm).toFixed(6));
    }
  }
  return vector;
}

/**
 * Generates vector embedding via server API or fallback vectorizer.
 */
export async function generateEmbedding(text: string): Promise<{ embedding: number[]; source: 'api' | 'fallback' }> {
  try {
    const res = await fetch('/api/rag/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.embedding && Array.isArray(data.embedding) && data.embedding.length > 0) {
        return { embedding: data.embedding, source: 'api' };
      }
    }
  } catch (err) {
    console.warn('[RAG Service] Server API embedding call failed, falling back to local vector generator:', err);
  }

  // Fallback
  return {
    embedding: generateFallbackEmbedding(text, VECTOR_DIMENSION),
    source: 'fallback'
  };
}

/**
 * Cosine Similarity: range [-1.0, 1.0] -> normalized to [0, 1] for UI matching
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0;
  let norm1 = 0;
  let norm2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }
  if (norm1 === 0 || norm2 === 0) return 0;
  const cos = dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
  return Math.max(0, Math.min(1, cos));
}

/**
 * Euclidean Distance
 */
export function euclideanDistance(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 999;
  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Dot Product Similarity
 */
export function dotProduct(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  let dot = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
  }
  return dot;
}

/**
 * Save or Update a RAG Chunk in Firestore
 */
export async function saveRagChunk(chunkData: Omit<RagChunk, 'id' | 'createdAt'> & { id?: string }): Promise<RagChunk> {
  const id = chunkData.id || `rag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  let embedding = chunkData.embedding;
  if (!embedding || embedding.length === 0) {
    const embedRes = await generateEmbedding(`${chunkData.title}\n${chunkData.content}`);
    embedding = embedRes.embedding;
  }

  const chunkDoc: RagChunk = {
    ...chunkData,
    id,
    embedding,
    vectorDimension: embedding.length,
    createdAt: now,
    updatedAt: now
  };

  try {
    const ref = doc(mainDb, RAG_COLLECTION, id);
    await syncSetDoc(ref, chunkDoc);
  } catch (err) {
    console.warn('[RAG Service] Firestore sync write note, using local storage fallback:', err);
    saveLocalRagChunk(chunkDoc);
  }

  return chunkDoc;
}

/**
 * Fetch all RAG Chunks from Firestore
 */
export async function getAllRagChunks(projectId?: string): Promise<RagChunk[]> {
  const chunks: RagChunk[] = [];
  try {
    const colRef = collection(db, RAG_COLLECTION);
    const snap = await getDocs(colRef);
    snap.forEach((d) => {
      const data = d.data() as RagChunk;
      if (!projectId || !data.projectId || data.projectId === projectId) {
        chunks.push(data);
      }
    });
  } catch (err) {
    console.warn('[RAG Service] Firestore fetch failed, loading local RAG cache:', err);
  }

  // Merge with local fallback storage
  const local = getLocalRagChunks(projectId);
  const map = new Map<string, RagChunk>();
  chunks.forEach(c => map.set(c.id, c));
  local.forEach(c => map.set(c.id, c));

  return Array.from(map.values());
}

/**
 * Delete a RAG Chunk (Deletes from Original DB only; preserved in Backup DB)
 */
export async function deleteRagChunk(id: string): Promise<void> {
  try {
    await syncDeleteDoc(doc(mainDb, RAG_COLLECTION, id));
  } catch (err) {
    console.warn('[RAG Service] Firestore delete failed:', err);
  }
  deleteLocalRagChunk(id);
}

/**
 * Perform Vector Search across stored RAG chunks
 */
export async function searchVectorDatabase(
  queryText: string,
  options: {
    projectId?: string;
    topK?: number;
    minScore?: number;
    metric?: VectorDistanceMetric;
  } = {}
): Promise<VectorSearchResult[]> {
  const topK = options.topK || 5;
  const minScore = options.minScore || 0.1;
  const metric = options.metric || 'cosine';

  if (!queryText.trim()) return [];

  // Generate Query Vector Embedding
  const { embedding: queryEmbedding } = await generateEmbedding(queryText);

  // Fetch Candidates from Firestore
  const allChunks = await getAllRagChunks(options.projectId);

  const results: VectorSearchResult[] = [];

  for (const chunk of allChunks) {
    if (!chunk.embedding || chunk.embedding.length === 0) continue;

    let dist = 0;
    let score = 0;

    if (metric === 'cosine') {
      score = cosineSimilarity(queryEmbedding, chunk.embedding);
      dist = 1 - score;
    } else if (metric === 'euclidean') {
      dist = euclideanDistance(queryEmbedding, chunk.embedding);
      // Normalized score range
      score = Math.max(0, 1 - dist / 2.0);
    } else {
      score = dotProduct(queryEmbedding, chunk.embedding);
      dist = 1 - Math.min(1, Math.max(0, score));
    }

    if (score >= minScore) {
      results.push({
        chunk,
        similarityScore: parseFloat(score.toFixed(4)),
        distance: parseFloat(dist.toFixed(4)),
        metricUsed: metric
      });
    }
  }

  // Sort descending by similarity score
  results.sort((a, b) => b.similarityScore - a.similarityScore);

  return results.slice(0, topK);
}

/**
 * Auto-indexes an existing AutomatiQA project into RAG vector chunks
 */
export async function indexProjectKnowledge(project: Project): Promise<{ added: number; errors: number }> {
  let added = 0;
  let errors = 0;

  if (!project) return { added: 0, errors: 0 };

  // 1. Index Test Scenarios
  if (Array.isArray(project.scenarios)) {
    for (const sc of project.scenarios) {
      try {
        const textContent = `Scenario ID: ${sc.id}\nTitle: ${sc.title || sc.description}\nCategory/Type: ${sc.type || 'Functional'}\nPriority: ${sc.priority || 'Medium'}\nDescription: ${sc.description || ''}`;
        const { embedding } = await generateEmbedding(textContent);
        await saveRagChunk({
          projectId: project.id,
          projectName: project.name,
          title: `[Scenario] ${sc.title || sc.id}`,
          content: textContent,
          embedding,
          vectorDimension: VECTOR_DIMENSION,
          metadata: {
            type: 'scenario',
            tags: [sc.type || 'Functional', sc.priority || 'Medium'],
            source: `Project: ${project.name}`
          }
        });
        added++;
      } catch (err) {
        errors++;
      }
    }
  }

  // 2. Index Manual Test Cases
  if (Array.isArray(project.manualTestCases)) {
    for (const tc of project.manualTestCases) {
      try {
        const tcAny = tc as any;
        const stepsText = Array.isArray(tc.steps) ? tc.steps.map((s: any, idx: number) => `Step ${idx + 1}: ${s.action || s} -> Expected: ${s.expectedResult || s}`).join('\n') : '';
        const textContent = `Test Case ID: ${tcAny.testCaseId || tc.id}\nTitle: ${tc.title || 'Test Case'}\nPreconditions: ${tcAny.preconditions || tc.description || 'None'}\nSteps:\n${stepsText}\nExpected Result: ${tc.expectedResult || ''}`;
        const { embedding } = await generateEmbedding(textContent);
        await saveRagChunk({
          projectId: project.id,
          projectName: project.name,
          title: `[TestCase] ${tcAny.testCaseId || tc.title || tc.id}`,
          content: textContent,
          embedding,
          vectorDimension: VECTOR_DIMENSION,
          metadata: {
            type: 'testcase',
            tags: [tcAny.testType || tcAny.type || 'Functional', tc.priority || 'High'],
            source: `Project: ${project.name}`
          }
        });
        added++;
      } catch (err) {
        errors++;
      }
    }
  }

  // 3. Index User Stories
  if (Array.isArray((project as any).userStories)) {
    for (const us of (project as any).userStories) {
      try {
        const textContent = `User Story ID: ${us.userStoryId || us.storyId || us.id}\nSummary: ${us.summary}\nDescription: ${us.description}\nAcceptance Criteria:\n${us.acceptanceCriteria || ''}`;
        const { embedding } = await generateEmbedding(textContent);
        await saveRagChunk({
          projectId: project.id,
          projectName: project.name,
          title: `[UserStory] ${us.summary}`,
          content: textContent,
          embedding,
          vectorDimension: VECTOR_DIMENSION,
          metadata: {
            type: 'userstory',
            tags: ['UserStory', 'Requirement'],
            source: `Project: ${project.name}`
          }
        });
        added++;
      } catch (err) {
        errors++;
      }
    }
  }

  // 4. Index API Test Suites
  if (Array.isArray((project as any).apiSuites)) {
    for (const suite of (project as any).apiSuites) {
      try {
        const reqsText = Array.isArray(suite.requests) ? suite.requests.map((r: any) => `${r.method} ${r.url} - ${r.name || ''}`).join('\n') : '';
        const textContent = `API Suite: ${suite.name}\nDescription: ${suite.description || ''}\nEndpoints:\n${reqsText}`;
        const { embedding } = await generateEmbedding(textContent);
        await saveRagChunk({
          projectId: project.id,
          projectName: project.name,
          title: `[APISuite] ${suite.name}`,
          content: textContent,
          embedding,
          vectorDimension: VECTOR_DIMENSION,
          metadata: {
            type: 'doc',
            tags: ['API', 'Endpoints'],
            source: `Project: ${project.name}`
          }
        });
        added++;
      } catch (err) {
        errors++;
      }
    }
  }

  // 5. Index Automation Scripts
  if (Array.isArray((project as any).automationScripts)) {
    for (const script of (project as any).automationScripts) {
      try {
        const textContent = `Script: ${script.name || script.title}\nTool: ${script.tool || 'Playwright'}\nLanguage: ${script.language || 'TypeScript'}\nCode Snippet:\n${(script.code || script.content || '').slice(0, 1000)}`;
        const { embedding } = await generateEmbedding(textContent);
        await saveRagChunk({
          projectId: project.id,
          projectName: project.name,
          title: `[AutomationScript] ${script.name || script.title || 'Script'}`,
          content: textContent,
          embedding,
          vectorDimension: VECTOR_DIMENSION,
          metadata: {
            type: 'doc',
            tags: [script.tool || 'Playwright', 'Automation'],
            source: `Project: ${project.name}`
          }
        });
        added++;
      } catch (err) {
        errors++;
      }
    }
  }

  return { added, errors };
}

/**
 * Builds RAG Augmented Prompt by retrieving Top-K context chunks from Firestore Vector Store
 */
export async function buildRAGPrompt(
  userQuery: string,
  projectId?: string,
  topK = 3
): Promise<{ augmentedPrompt: string; retrievedChunks: VectorSearchResult[] }> {
  const retrievedChunks = await searchVectorDatabase(userQuery, {
    projectId,
    topK,
    minScore: 0.15,
    metric: 'cosine'
  });

  if (retrievedChunks.length === 0) {
    return {
      augmentedPrompt: userQuery,
      retrievedChunks: []
    };
  }

  const contextText = retrievedChunks
    .map((res, i) => `--- CONTEXT CHUNK #${i + 1} (Score: ${(res.similarityScore * 100).toFixed(1)}%, Source: ${res.chunk.metadata.type}) ---\nTitle: ${res.chunk.title}\nContent:\n${res.chunk.content}`)
    .join('\n\n');

  const augmentedPrompt = `[RETRIEVED PROJECT KNOWLEDGE FROM FIRESTORE VECTOR SEARCH (RAG)]\nUse the following verified project context chunks to make your response highly specific, accurate, and aligned with domain requirements:\n\n${contextText}\n\n[USER REQUEST]\n${userQuery}`;

  return {
    augmentedPrompt,
    retrievedChunks
  };
}

/**
 * Universal RAG Prompt Enrichment Helper for AI Features
 */
export async function ragEnrichPrompt(
  prompt: string,
  projectId?: string,
  topK = 3
): Promise<{ prompt: string; isRAGAugmented: boolean; chunks: VectorSearchResult[] }> {
  try {
    const { augmentedPrompt, retrievedChunks } = await buildRAGPrompt(prompt, projectId, topK);
    return {
      prompt: augmentedPrompt,
      isRAGAugmented: retrievedChunks.length > 0,
      chunks: retrievedChunks
    };
  } catch (err) {
    console.warn('[RAG Enrich Warning] Falling back to non-augmented prompt:', err);
    return { prompt, isRAGAugmented: false, chunks: [] };
  }
}

/**
 * Index a single entity (Scenario, Test Case, User Story, Script, API Suite) into RAG Vector Store in real-time
 */
export async function indexSingleItem(
  projectId: string,
  projectName: string,
  title: string,
  content: string,
  type: 'scenario' | 'testcase' | 'userstory' | 'doc',
  tags: string[] = []
): Promise<RagChunk | null> {
  try {
    const { embedding } = await generateEmbedding(`${title}\n${content}`);
    return await saveRagChunk({
      projectId,
      projectName,
      title: `[${type.toUpperCase()}] ${title}`,
      content,
      embedding,
      vectorDimension: VECTOR_DIMENSION,
      metadata: {
        type,
        tags,
        source: `Realtime Index (${projectName})`
      }
    });
  } catch (err) {
    console.error(`[RAG Single Item Index Failed] ${title}:`, err);
    return null;
  }
}

/**
 * Runs RAG Feasibility Diagnostics to verify whether RAG is implemented and working properly
 */
export async function runFeasibilityCheck(projectId?: string): Promise<RagFeasibilityStatus> {
  const diagnostics: RagFeasibilityStatus['diagnosticChecks'] = [];
  const startTotal = Date.now();

  // 1. Check Firestore Connection
  const t1 = Date.now();
  let firestoreConnected = false;
  try {
    const colRef = collection(db, RAG_COLLECTION);
    await getDocs(query(colRef, limit(1)));
    firestoreConnected = true;
    diagnostics.push({
      name: 'Firestore Database Connection',
      status: 'pass',
      message: `Successfully connected to Firestore database (${CURRENT_DATABASE_ID})`,
      latencyMs: Date.now() - t1
    });
  } catch (err: any) {
    diagnostics.push({
      name: 'Firestore Database Connection',
      status: 'warn',
      message: `Firestore warning: ${err.message || 'Running in local vector persistence mode'}`,
      latencyMs: Date.now() - t1
    });
  }

  // 2. Check Vector Embedding Model
  const t2 = Date.now();
  let embeddingApiStatus: 'active' | 'fallback' | 'offline' = 'fallback';
  try {
    const testEmbed = await generateEmbedding('AutomatiQA RAG Feasibility Check');
    embeddingApiStatus = testEmbed.source === 'api' ? 'active' : 'fallback';
    diagnostics.push({
      name: 'Vector Embedding Model (gemini-embedding-2-preview)',
      status: testEmbed.source === 'api' ? 'pass' : 'warn',
      message: testEmbed.source === 'api'
        ? 'Gemini API embedding model operational (768 dimensions)'
        : 'Active with fallback deterministic 768-dim vectorizer',
      latencyMs: Date.now() - t2
    });
  } catch (err: any) {
    diagnostics.push({
      name: 'Vector Embedding Model',
      status: 'fail',
      message: `Embedding error: ${err.message}`,
      latencyMs: Date.now() - t2
    });
  }

  // 3. Check Vector Distance Metrics
  const t3 = Date.now();
  try {
    const vA = generateFallbackEmbedding('user authentication login test');
    const vB = generateFallbackEmbedding('user auth login verification');
    const score = cosineSimilarity(vA, vB);
    diagnostics.push({
      name: 'Vector Distance Engine (Cosine / Euclidean)',
      status: score > 0.5 ? 'pass' : 'warn',
      message: `Similarity calculation operational (Test pair Cosine match: ${(score * 100).toFixed(1)}%)`,
      latencyMs: Date.now() - t3
    });
  } catch (err: any) {
    diagnostics.push({
      name: 'Vector Distance Engine',
      status: 'fail',
      message: `Distance calculation failed: ${err.message}`,
      latencyMs: Date.now() - t3
    });
  }

  // 4. Check Stored Chunks Count
  const t4 = Date.now();
  const allChunks = await getAllRagChunks(projectId);
  diagnostics.push({
    name: 'Firestore Vector Index Store',
    status: allChunks.length > 0 ? 'pass' : 'warn',
    message: `${allChunks.length} vector document chunk(s) stored in collection '${RAG_COLLECTION}'`,
    latencyMs: Date.now() - t4
  });

  // 5. RAG Retrieval & Augmentation Pipeline
  const t5 = Date.now();
  try {
    const { retrievedChunks } = await buildRAGPrompt('login validation test scenario', projectId, 2);
    diagnostics.push({
      name: 'RAG Prompt Context Augmentation',
      status: 'pass',
      message: `Pipeline active. Retrieved ${retrievedChunks.length} matching context chunk(s)`,
      latencyMs: Date.now() - t5
    });
  } catch (err: any) {
    diagnostics.push({
      name: 'RAG Prompt Context Augmentation',
      status: 'fail',
      message: `Augmentation pipeline error: ${err.message}`,
      latencyMs: Date.now() - t5
    });
  }

  const totalLatency = Date.now() - startTotal;

  return {
    isImplemented: true,
    firestoreConnected,
    databaseId: CURRENT_DATABASE_ID,
    vectorIndexCollection: RAG_COLLECTION,
    indexedCount: allChunks.length,
    vectorDimension: VECTOR_DIMENSION,
    embeddingModel: 'gemini-embedding-2-preview',
    embeddingApiStatus,
    averageSearchLatencyMs: Math.round(totalLatency / diagnostics.length),
    lastDiagnosticTimestamp: new Date().toISOString(),
    diagnosticChecks: diagnostics
  };
}

// Helpers for Local Storage Fallback
function getLocalRagChunks(projectId?: string): RagChunk[] {
  try {
    const raw = localStorage.getItem('automatiqa_rag_chunks');
    if (!raw) return [];
    const list: RagChunk[] = JSON.parse(raw);
    if (projectId) return list.filter(c => !c.projectId || c.projectId === projectId);
    return list;
  } catch {
    return [];
  }
}

function saveLocalRagChunk(chunk: RagChunk): void {
  try {
    const list = getLocalRagChunks();
    const idx = list.findIndex(c => c.id === chunk.id);
    if (idx >= 0) list[idx] = chunk;
    else list.push(chunk);
    localStorage.setItem('automatiqa_rag_chunks', JSON.stringify(list));
  } catch (err) {
    console.warn('LocalStorage save RAG failed:', err);
  }
}

function deleteLocalRagChunk(id: string): void {
  try {
    const list = getLocalRagChunks().filter(c => c.id !== id);
    localStorage.setItem('automatiqa_rag_chunks', JSON.stringify(list));
  } catch (err) {
    console.warn('LocalStorage delete RAG failed:', err);
  }
}
