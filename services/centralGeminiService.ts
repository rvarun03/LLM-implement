/**
 * ==============================================================================
 * CENTRAL GEMINI STABILITY SERVICE — AUTOMATIQ AI ARCHITECTURE
 * ==============================================================================
 * 
 * Strict architectural guarantees:
 * 1. Single central server-side Gemini service and worker queue.
 * 2. Absolute protection against credential leakage to the browser.
 * 3. Central concurrency and rate throttling (RPM & max concurrent requests).
 * 4. Durable AI Job Queue with Firestore persistence (`ai_jobs/{jobId}`).
 * 5. Strict idempotency and request deduplication (prevents duplicate clicks/runs).
 * 6. True HTTP 429 backoff & jitter with Retry-After detection; stops retry storms.
 * 7. Clean distinction between 429 (retryable) and 403 (unauthorized/config error; non-retryable).
 * 8. Strict project-level credit protection: 1 logical operation = 1 credit deduction.
 * 9. Persistent results in Firestore surviving server restarts.
 * 10. Structured observability logging without exposing credentials.
 */

import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import firebaseConfig from "../firebase-applet-config.json";
import { logger } from "./appLogger";

// ==============================================================================
// 1. CONFIGURATION & ENVIRONMENT VERIFICATION
// ==============================================================================

// Read Firebase config to auto-detect real GCP / Firebase project ID
const detectedProjectId = (firebaseConfig as any)?.projectId || "automatiqa";

export const AI_CONFIG = {
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || detectedProjectId || "automatiqa",
  PROVIDER: "google_ai_studio_developer_api",
  PRIMARY_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  FALLBACK_MODEL: process.env.FALLBACK_MODEL_1 || "gemini-2.5-flash",
  REGION: process.env.GEMINI_REGION || "us-central1",
  
  // Concurrency & Rate Limiting Controls
  MAX_CONCURRENT_REQUESTS: Math.max(1, parseInt(process.env.GEMINI_MAX_CONCURRENT_REQUESTS || "2", 10)),
  REQUESTS_PER_MINUTE: Math.max(1, parseInt(process.env.GEMINI_REQUESTS_PER_MINUTE || "15", 10)),
  MAX_RETRIES: Math.max(0, parseInt(process.env.GEMINI_MAX_RETRIES || "2", 10)),
  RETRY_BASE_DELAY_MS: Math.max(500, parseInt(process.env.GEMINI_RETRY_BASE_DELAY_MS || "2000", 10)),
  JOB_POLL_TIMEOUT_MS: 45000,
};

// Log initial verified configuration securely (NO SECRETS LOGGED)
console.log(`[Central Gemini Service] Initialized with:`, {
  GCP_PROJECT_ID: AI_CONFIG.GCP_PROJECT_ID,
  GEMINI_PROVIDER: AI_CONFIG.PROVIDER,
  PRIMARY_MODEL: AI_CONFIG.PRIMARY_MODEL,
  FALLBACK_MODEL: AI_CONFIG.FALLBACK_MODEL,
  MAX_CONCURRENT_REQUESTS: AI_CONFIG.MAX_CONCURRENT_REQUESTS,
  REQUESTS_PER_MINUTE: AI_CONFIG.REQUESTS_PER_MINUTE,
  MAX_RETRIES: AI_CONFIG.MAX_RETRIES,
});

// Lazy server-side GoogleGenAI client singleton
let _genAIClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (typeof window !== "undefined") {
    throw new Error("[SECURITY CRITICAL] Gemini API client must never be initialized in the browser.");
  }
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured in server environment. Please set GEMINI_API_KEY.");
  }
  if (!_genAIClient) {
    _genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return _genAIClient;
}

export function checkGeminiApiKeyHealth(): { configured: boolean; length: number; prefix: string } {
  const isServer = typeof window === "undefined";
  const apiKey = (isServer && (process.env.GEMINI_API_KEY || process.env.API_KEY)) || "";
  return {
    configured: Boolean(apiKey && apiKey.length > 5 && apiKey !== "dummy-key-to-prevent-constructor-error"),
    length: apiKey ? apiKey.length : 0,
    prefix: apiKey && apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "none",
  };
}

// ==============================================================================
// 2. OBSERVABILITY & STRUCTURED LOGGING
// ==============================================================================

export type AILogEvent =
  | "AI_JOB_CREATED"
  | "AI_JOB_STARTED"
  | "AI_GEMINI_REQUEST"
  | "AI_GEMINI_SUCCESS"
  | "AI_GEMINI_429"
  | "AI_GEMINI_403"
  | "AI_JOB_REQUEUED"
  | "AI_JOB_COMPLETED"
  | "AI_JOB_FAILED";

export function logAIOperation(event: AILogEvent, data: {
  jobId?: string;
  requestId?: string;
  userId?: string;
  projectId?: string;
  feature?: string;
  model?: string;
  provider?: string;
  attempt?: number;
  status?: string;
  durationMs?: number;
  errorClassification?: string;
  message?: string;
  [key: string]: any;
}) {
  const safeData = {
    timestamp: new Date().toISOString(),
    event,
    jobId: data.jobId,
    requestId: data.requestId,
    userId: data.userId || "anonymous",
    projectId: data.projectId || AI_CONFIG.GCP_PROJECT_ID,
    feature: data.feature || "general",
    model: data.model || AI_CONFIG.PRIMARY_MODEL,
    provider: data.provider || AI_CONFIG.PROVIDER,
    attempt: data.attempt,
    status: data.status,
    durationMs: data.durationMs,
    errorClassification: data.errorClassification,
    message: data.message,
  };
  
  // Clean undefined keys
  Object.keys(safeData).forEach((key) => {
    if ((safeData as any)[key] === undefined) delete (safeData as any)[key];
  });

  const traceId = data.requestId || data.jobId || undefined;
  const opStatus = event.includes("SUCCESS") || event.includes("COMPLETED") ? "SUCCESS" : event.includes("FAILED") || event.includes("403") || event.includes("429") ? "FAILED" : event.includes("STARTED") || event.includes("CREATED") ? "STARTED" : "PROCESSING";
  const level = event.includes("429") || event.includes("REQUEUED") ? "WARN" : event.includes("403") || event.includes("FAILED") ? "ERROR" : "INFO";

  logger.log(
    level,
    `AIGeneration:${safeData.feature}`,
    `[${event}] ${safeData.message || 'Gemini AI Operation ' + event}`,
    safeData,
    event,
    safeData.userId,
    safeData.projectId,
    traceId,
    safeData.durationMs,
    opStatus
  );

  if (safeData.durationMs && safeData.durationMs > 3000) {
    logger.logPerformance(`AIGeneration:${safeData.feature}`, event, safeData.durationMs, 3000, safeData, traceId);
  }
}

// ==============================================================================
// 3. ERROR CLASSIFICATION & DIAGNOSTICS
// ==============================================================================

export interface ErrorClassification {
  is429: boolean;
  is403: boolean;
  is503: boolean;
  isRetryable: boolean;
  canRetry: boolean;
  code: number;
  message: string;
  category: "RATE_LIMIT_OR_QUOTA" | "AUTH_OR_CONFIG_ERROR" | "SERVICE_TEMPORARILY_UNAVAILABLE" | "CLIENT_ERROR" | "INTERNAL_ERROR";
  userFriendlyMessage: string;
  retryAfterMs?: number;
  diagnosticCode: string;
}

export function classifyGeminiError(error: any): ErrorClassification {
  const rawMsg = typeof error === "string" ? error : error?.message || String(error || "");
  const status = error?.status || error?.code || error?.statusCode;

  // 1. Detect 403 / Authentication / Permission / Project Config Errors
  const is403 =
    status === 403 ||
    rawMsg.includes("403") ||
    rawMsg.includes("PERMISSION_DENIED") ||
    rawMsg.includes("API_KEY_SERVICE_BLOCKED") ||
    rawMsg.includes("API key not valid") ||
    rawMsg.includes("API_KEY_INVALID") ||
    rawMsg.includes("leaked") ||
    rawMsg.includes("billing not enabled") ||
    rawMsg.includes("has not used the API in project");

  if (is403) {
    const msg = "AI service authentication or project configuration error. Please verify your Google Cloud API key permissions.";
    return {
      is429: false,
      is403: true,
      is503: false,
      isRetryable: false, // NEVER RETRY 403!
      canRetry: false,
      code: 403,
      message: msg,
      category: "AUTH_OR_CONFIG_ERROR",
      userFriendlyMessage: msg,
      diagnosticCode: "GEMINI_403_FORBIDDEN",
    };
  }

  // 2. Detect 429 / Rate Limit / Quota Exceeded / Resource Exhausted
  const is429 =
    status === 429 ||
    rawMsg.includes("429") ||
    rawMsg.includes("RESOURCE_EXHAUSTED") ||
    rawMsg.includes("Quota exceeded") ||
    rawMsg.includes("rate limit") ||
    rawMsg.includes("quota");

  let retryAfterMs: number | undefined = undefined;
  if (is429) {
    // Check Retry-After header or text match
    const headerMatch = error?.headers?.get ? error.headers.get("retry-after") : (error?.response?.headers?.["retry-after"] || error?.retryAfter);
    if (headerMatch) {
      const parsed = parseInt(headerMatch, 10);
      if (!isNaN(parsed) && parsed > 0) {
        retryAfterMs = parsed * 1000;
      }
    }
    if (!retryAfterMs) {
      const match = rawMsg.match(/retry after (\d+)\s*(s|sec|seconds|ms)/i);
      if (match) {
        const val = parseInt(match[1], 10);
        retryAfterMs = match[2].toLowerCase().startsWith("ms") ? val : val * 1000;
      }
    }

    const msg = "Gemini API rate limit reached. Retrying request under rate-limit protection...";
    return {
      is429: true,
      is403: false,
      is503: false,
      isRetryable: true,
      canRetry: true,
      code: 429,
      message: msg,
      category: "RATE_LIMIT_OR_QUOTA",
      userFriendlyMessage: msg,
      retryAfterMs,
      diagnosticCode: "GEMINI_429_RATE_LIMIT",
    };
  }

  // 3. Detect 503 / High Demand / Overloaded / Transient
  const is503 =
    status === 503 ||
    rawMsg.includes("503") ||
    rawMsg.includes("UNAVAILABLE") ||
    rawMsg.includes("high demand") ||
    rawMsg.includes("overloaded") ||
    rawMsg.includes("temporarily");

  if (is503) {
    const msg = "The AI service is experiencing high temporary demand. Automatic recovery is active.";
    return {
      is429: false,
      is403: false,
      is503: true,
      isRetryable: true,
      canRetry: true,
      code: 503,
      message: msg,
      category: "SERVICE_TEMPORARILY_UNAVAILABLE",
      userFriendlyMessage: msg,
      diagnosticCode: "GEMINI_503_HIGH_DEMAND",
    };
  }

  const msg = rawMsg || "Failed to process AI request.";
  return {
    is429: false,
    is403: false,
    is503: false,
    isRetryable: false,
    canRetry: false,
    code: 500,
    message: msg,
    category: "INTERNAL_ERROR",
    userFriendlyMessage: msg,
    diagnosticCode: "GEMINI_GENERAL_ERROR",
  };
}

// ==============================================================================
// 4. CENTRAL RATE CONTROLLER (CONCURRENCY & RATE LIMITER)
// ==============================================================================

class CentralRateController {
  private activeConcurrency = 0;
  private recentTimestamps: number[] = [];
  private waitQueue: Array<() => void> = [];

  constructor(
    public maxConcurrent: number = AI_CONFIG.MAX_CONCURRENT_REQUESTS,
    public requestsPerMinute: number = AI_CONFIG.REQUESTS_PER_MINUTE
  ) {}

  /**
   * Acquire execution slot respecting concurrency and RPM limits
   */
  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryExecute = () => {
        const now = Date.now();
        // Prune timestamps older than 60 seconds
        this.recentTimestamps = this.recentTimestamps.filter((t) => now - t < 60000);

        const hasCapacity = this.activeConcurrency < this.maxConcurrent;
        const withinRpm = this.recentTimestamps.length < this.requestsPerMinute;

        if (hasCapacity && withinRpm) {
          this.activeConcurrency++;
          this.recentTimestamps.push(now);

          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            this.activeConcurrency = Math.max(0, this.activeConcurrency - 1);
            // Notify next in queue
            this.dispatchNext();
          };

          resolve(release);
        } else {
          // Schedule check when a slot frees up or at next RPM boundary
          let waitDelay = 250;
          if (!withinRpm && this.recentTimestamps.length > 0) {
            const oldest = this.recentTimestamps[0];
            waitDelay = Math.max(100, 60000 - (now - oldest) + 50);
          }
          setTimeout(() => tryExecute(), waitDelay);
        }
      };

      this.waitQueue.push(tryExecute);
      this.dispatchNext();
    });
  }

  private dispatchNext() {
    if (this.waitQueue.length > 0 && this.activeConcurrency < this.maxConcurrent) {
      const next = this.waitQueue.shift();
      if (next) next();
    }
  }

  getStats() {
    const now = Date.now();
    const activeRpm = this.recentTimestamps.filter((t) => now - t < 60000).length;
    return {
      activeConcurrency: this.activeConcurrency,
      maxConcurrent: this.maxConcurrent,
      activeRpm,
      requestsPerMinute: this.requestsPerMinute,
      queuedInController: this.waitQueue.length,
    };
  }

  /**
   * Execute an operation under central concurrency and rate limits
   */
  async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export const centralRateController = new CentralRateController();

// ==============================================================================
// 5. DURABLE AI JOB QUEUE & IDEMPOTENCY MANAGER
// ==============================================================================

export type AIJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface AIJob {
  id?: string;
  jobId: string;
  requestId: string;
  userId: string;
  projectId: string;
  feature: string;
  functionName: string;
  args?: any[];
  status: AIJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  attemptCount: number;
  model: string;
  provider: string;
  resultLocation?: string;
  errorCode?: string;
  error?: string;
  result?: any;
  cached?: boolean;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd?: number;
  };
  executionTimeMs?: number;
  idempotencyKey: string;
  creditDeducted?: boolean;
}

export function generateIdempotencyKey(
  projectId: string,
  userId: string,
  feature: string,
  functionName: string,
  args: any[]
): string {
  let serializedArgs = "";
  try {
    // Strip dynamic timestamps or transient non-essential properties from args for stable hashing
    serializedArgs = JSON.stringify(args || [], (key, value) => {
      if (key === "timestamp" || key === "executionId" || key === "clientRequestId") return undefined;
      return value;
    });
  } catch {
    serializedArgs = String(args?.length || 0);
  }
  const hash = crypto.createHash("sha256").update(serializedArgs).digest("hex").slice(0, 24);
  return `${projectId || "default"}_${feature || functionName}_${hash}`;
}

export class AIJobManager {
  private jobs = new Map<string, AIJob>();
  private activeJobsByIdempotencyKey = new Map<string, string>(); // idempotencyKey -> jobId
  private adminDb: any = null;
  private jobWaiters = new Map<string, Array<(job: AIJob) => void>>();

  getStats() {
    let queued = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;
    for (const job of this.jobs.values()) {
      if (job.status === "QUEUED") queued++;
      else if (job.status === "PROCESSING") processing++;
      else if (job.status === "COMPLETED") completed++;
      else if (job.status === "FAILED") failed++;
    }
    return {
      totalJobsInMemory: this.jobs.size,
      queued,
      processing,
      completed,
      failed,
      activeIdempotencyKeys: this.activeJobsByIdempotencyKey.size,
    };
  }

  setAdminDb(db: any) {
    this.adminDb = db;
  }

  /**
   * Persist job state to Firestore `ai_jobs/{jobId}` and memory
   */
  async persistJob(job: AIJob): Promise<void> {
    this.jobs.set(job.jobId, job);
    if (job.status === "QUEUED" || job.status === "PROCESSING") {
      this.activeJobsByIdempotencyKey.set(job.idempotencyKey, job.jobId);
    } else {
      this.activeJobsByIdempotencyKey.delete(job.idempotencyKey);
    }

    // Persist to Firestore if adminDb is available
    if (this.adminDb) {
      try {
        const firestoreData = { ...job };
        // If result is large or contains circular refs, ensure it's safely serialized
        if (firestoreData.result && typeof firestoreData.result === "object") {
          try {
            JSON.stringify(firestoreData.result);
          } catch {
            firestoreData.result = "[Unserializable object result]";
          }
        }
        delete firestoreData.args; // Don't bloat Firestore with huge raw input args
        await this.adminDb.collection("ai_jobs").doc(job.jobId).set(firestoreData, { merge: true });
      } catch (err: any) {
        console.warn(`[AI Job Queue] Failed to persist job ${job.jobId} to Firestore:`, err.message || err);
      }
    }

    // Notify any waiting listeners
    const waiters = this.jobWaiters.get(job.jobId);
    if (waiters && waiters.length > 0) {
      if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") {
        waiters.forEach((fn) => {
          try {
            fn(job);
          } catch {
            // Ignore callback errors
          }
        });
        this.jobWaiters.delete(job.jobId);
      }
    }
  }

  /**
   * Get job by ID from memory or Firestore
   */
  async getJob(jobId: string): Promise<AIJob | null> {
    if (this.jobs.has(jobId)) {
      return this.jobs.get(jobId)!;
    }
    if (this.adminDb) {
      try {
        const snap = await this.adminDb.collection("ai_jobs").doc(jobId).get();
        if (snap.exists) {
          const loaded = snap.data() as AIJob;
          this.jobs.set(jobId, loaded);
          return loaded;
        }
      } catch (err) {
        // Fallback
      }
    }
    return null;
  }

  /**
   * Check for an existing active job with the same idempotency key to prevent duplicate runs
   */
  async findActiveJobByIdempotencyKey(idempotencyKey: string): Promise<AIJob | null> {
    const existingId = this.activeJobsByIdempotencyKey.get(idempotencyKey);
    if (existingId) {
      const job = await this.getJob(existingId);
      if (job && (job.status === "QUEUED" || job.status === "PROCESSING")) {
        return job;
      }
    }

    // Check Firestore for recently active jobs with this key
    if (this.adminDb) {
      try {
        const snap = await this.adminDb
          .collection("ai_jobs")
          .where("idempotencyKey", "==", idempotencyKey)
          .where("status", "in", ["QUEUED", "PROCESSING"])
          .limit(1)
          .get();

        if (!snap.empty) {
          const job = snap.docs[0].data() as AIJob;
          this.jobs.set(job.jobId, job);
          this.activeJobsByIdempotencyKey.set(idempotencyKey, job.jobId);
          return job;
        }
      } catch {
        // Fallback
      }
    }
    return null;
  }

  /**
   * Create or attach to an existing job
   */
  async createOrAttachJob(params: {
    requestId?: string;
    userId?: string;
    userEmail?: string;
    projectId?: string;
    feature?: string;
    featureName?: string;
    functionName?: string;
    taskType?: string;
    args?: any[];
    requestPayload?: any;
    idempotencyKey?: string;
  }): Promise<{ job: AIJob; isExisting: boolean; id: string; status: AIJobStatus; result?: any; tokenUsage?: any }> {
    const finalUserId = params.userId || params.userEmail || "anonymous";
    const finalFeature = params.feature || params.featureName || params.taskType || "AI_ANALYSIS";
    const finalFunctionName = params.functionName || params.taskType || "analyze";
    const finalArgs = params.args || [];
    const idempotencyKey = params.idempotencyKey || generateIdempotencyKey(
      params.projectId || AI_CONFIG.GCP_PROJECT_ID,
      finalUserId,
      finalFeature,
      finalFunctionName,
      finalArgs
    );

    // Check for active duplicate job
    const activeJob = await this.findActiveJobByIdempotencyKey(idempotencyKey);
    if (activeJob) {
      activeJob.id = activeJob.jobId;
      logAIOperation("AI_JOB_CREATED", {
        jobId: activeJob.jobId,
        requestId: params.requestId,
        userId: finalUserId,
        projectId: params.projectId,
        feature: finalFeature,
        status: activeJob.status,
        message: "Attached to existing active AI job (duplicate prevented)",
      });
      return { 
        job: activeJob, 
        isExisting: true,
        id: activeJob.jobId,
        status: activeJob.status,
        result: activeJob.result,
        tokenUsage: activeJob.tokenUsage
      };
    }

    const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const requestId = params.requestId || `req_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

    const newJob: AIJob = {
      id: jobId,
      jobId,
      requestId,
      userId: finalUserId,
      projectId: params.projectId || AI_CONFIG.GCP_PROJECT_ID,
      feature: finalFeature,
      functionName: finalFunctionName,
      args: finalArgs,
      status: "QUEUED",
      createdAt: new Date().toISOString(),
      attemptCount: 0,
      model: AI_CONFIG.PRIMARY_MODEL,
      provider: AI_CONFIG.PROVIDER,
      idempotencyKey,
      creditDeducted: false,
    };

    await this.persistJob(newJob);

    logAIOperation("AI_JOB_CREATED", {
      jobId,
      requestId,
      userId: finalUserId,
      projectId: params.projectId,
      feature: finalFeature,
      status: "QUEUED",
      model: AI_CONFIG.PRIMARY_MODEL,
    });

    return { 
      job: newJob, 
      isExisting: false,
      id: newJob.jobId,
      status: newJob.status,
      result: newJob.result,
      tokenUsage: newJob.tokenUsage
    };
  }

  /**
   * Wait for a job to finish or timeout
   */
  async waitForJob(jobId: string, timeoutMs: number = AI_CONFIG.JOB_POLL_TIMEOUT_MS): Promise<AIJob> {
    const current = await this.getJob(jobId);
    if (!current) throw new Error(`AI Job ${jobId} not found`);
    if (current.status === "COMPLETED" || current.status === "FAILED" || current.status === "CANCELLED") {
      return current;
    }

    return new Promise<AIJob>((resolve, reject) => {
      let resolved = false;
      const timeoutId = setTimeout(async () => {
        if (!resolved) {
          resolved = true;
          const latest = await this.getJob(jobId);
          resolve(latest || current);
        }
      }, timeoutMs);

      const listener = (updated: AIJob) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve(updated);
        }
      };

      if (!this.jobWaiters.has(jobId)) {
        this.jobWaiters.set(jobId, []);
      }
      this.jobWaiters.get(jobId)!.push(listener);
    });
  }

  /**
   * Worker loop to execute a job through central rate control, model resilience, and idempotent completion
   */
  async executeJob(
    jobId: string,
    executorFn: ((model: string, args: any[]) => Promise<any>) | (() => Promise<any>),
    onCompleteCreditDeduction?: (jobOrResult: any) => Promise<any>
  ): Promise<any> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    if (job.status === "COMPLETED") {
      return job.result !== undefined ? job.result : job;
    }
    if (job.status === "FAILED") {
      throw new Error(job.error || "AI Job failed");
    }

    job.status = "PROCESSING";
    job.startedAt = new Date().toISOString();
    await this.persistJob(job);

    logAIOperation("AI_JOB_STARTED", {
      jobId: job.jobId,
      requestId: job.requestId,
      userId: job.userId,
      projectId: job.projectId,
      feature: job.feature,
      status: "PROCESSING",
      model: job.model,
    });

    const maxRetries = AI_CONFIG.MAX_RETRIES;
    let attempt = 0;
    let lastError: any = null;
    let selectedModel = AI_CONFIG.PRIMARY_MODEL;

    while (attempt <= maxRetries) {
      attempt++;
      job.attemptCount = attempt;

      // Acquire central rate control slot
      const releaseRateSlot = await centralRateController.acquire();
      const startTime = Date.now();

      logAIOperation("AI_GEMINI_REQUEST", {
        jobId: job.jobId,
        requestId: job.requestId,
        model: selectedModel,
        attempt,
      });

      try {
        const result = await (executorFn.length > 0 ? (executorFn as any)(selectedModel, job.args || []) : (executorFn as any)());
        releaseRateSlot();

        const durationMs = Date.now() - startTime;
        job.status = "COMPLETED";
        job.completedAt = new Date().toISOString();
        job.executionTimeMs = durationMs;
        job.model = selectedModel;
        job.result = result;
        job.error = undefined;
        job.errorCode = undefined;

        logAIOperation("AI_GEMINI_SUCCESS", {
          jobId: job.jobId,
          requestId: job.requestId,
          model: selectedModel,
          durationMs,
          attempt,
        });

        // Protected idempotent credit deduction
        if (!job.creditDeducted && onCompleteCreditDeduction) {
          try {
            const deductResult: any = await onCompleteCreditDeduction(job.result !== undefined ? job.result : job);
            if (deductResult && typeof deductResult === 'object') {
              (job as any).logRecord = deductResult.logRecord;
              (job as any).plan = deductResult.plan;
            }
            job.creditDeducted = true;
          } catch (creditErr: any) {
            console.warn(`[AI Job Queue] Credit deduction warning for job ${job.jobId}:`, creditErr.message || creditErr);
          }
        }

        await this.persistJob(job);
        logAIOperation("AI_JOB_COMPLETED", {
          jobId: job.jobId,
          requestId: job.requestId,
          durationMs,
          status: "COMPLETED",
        });

        return job.result !== undefined ? job.result : job;
      } catch (err: any) {
        releaseRateSlot();
        const durationMs = Date.now() - startTime;
        lastError = err;

        const classification = classifyGeminiError(err);

        // CASE A: 403 Forbidden / Configuration Error -> NEVER RETRY!
        if (classification.is403) {
          logAIOperation("AI_GEMINI_403", {
            jobId: job.jobId,
            requestId: job.requestId,
            model: selectedModel,
            errorClassification: classification.category,
            diagnosticCode: classification.diagnosticCode,
            message: classification.userFriendlyMessage,
          });

          job.status = "FAILED";
          job.completedAt = new Date().toISOString();
          job.errorCode = classification.diagnosticCode;
          job.error = classification.userFriendlyMessage;
          await this.persistJob(job);
          logAIOperation("AI_JOB_FAILED", {
            jobId: job.jobId,
            status: "FAILED",
            errorCode: job.errorCode,
            durationMs,
          });
          return job;
        }

        // CASE B: 429 Rate Limit / Quota Exceeded -> Controlled Backoff & Jitter
        if (classification.is429) {
          logAIOperation("AI_GEMINI_429", {
            jobId: job.jobId,
            requestId: job.requestId,
            model: selectedModel,
            attempt,
            retryAfterMs: classification.retryAfterMs,
            message: "Gemini 429 rate limit detected. Backing off safely...",
          });

          if (attempt <= maxRetries) {
            // Compute backoff with jitter
            const baseDelay = classification.retryAfterMs || (AI_CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
            const jitter = Math.floor(Math.random() * 500);
            const totalDelay = Math.min(baseDelay + jitter, 15000);

            logAIOperation("AI_JOB_REQUEUED", {
              jobId: job.jobId,
              attempt,
              delayMs: totalDelay,
              message: `Re-queuing under rate-limit protection for ${totalDelay}ms`,
            });

            await new Promise((resolve) => setTimeout(resolve, totalDelay));
            continue; // Retry with primary model after backoff
          }
        }

        // CASE C: 503 High Demand -> Fallback Model once if configured
        if (classification.is503) {
          if (attempt === 1 && AI_CONFIG.FALLBACK_MODEL && AI_CONFIG.FALLBACK_MODEL !== selectedModel) {
            console.warn(`[AI Job Queue] Model ${selectedModel} experiencing temporary 503 high demand. Trying fallback model ${AI_CONFIG.FALLBACK_MODEL}...`);
            selectedModel = AI_CONFIG.FALLBACK_MODEL;
            continue;
          }
        }

        // General retryable backoff
        if (attempt <= maxRetries && classification.isRetryable) {
          const delay = AI_CONFIG.RETRY_BASE_DELAY_MS * Math.pow(1.5, attempt - 1) + Math.floor(Math.random() * 300);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Max retries exceeded
        break;
      }
    }

    // If loop finishes with error
    const finalClassification = classifyGeminiError(lastError);
    job.status = "FAILED";
    job.completedAt = new Date().toISOString();
    job.errorCode = finalClassification.diagnosticCode;
    job.error = finalClassification.userFriendlyMessage;
    await this.persistJob(job);

    logAIOperation("AI_JOB_FAILED", {
      jobId: job.jobId,
      requestId: job.requestId,
      status: "FAILED",
      errorCode: job.errorCode,
      error: job.error,
    });

    return job;
  }
}

export const aiJobManager = new AIJobManager();
