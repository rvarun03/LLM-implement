import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  hitRate: number;
  totalSavedTimeMs: number;
  estimatedCostSavedUsd: number;
  entriesByFunction: Record<string, number>;
  lastUpdated: string;
}

export interface CacheEntry {
  key: string;
  functionName: string;
  argsHash: string;
  result: any;
  timestamp: number;
  hits: number;
  executionTimeMs: number;
}

const CACHE_FILE_PATH = path.join(process.cwd(), 'ai_cache_store.json');
const MAX_CACHE_ENTRIES = 1000;
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// List of AI functions that are safe to cache (static analyses, script enhancements)
const CACHEABLE_FUNCTIONS = new Set([
  'analyzeTestIntent',
  'analyzeLocatorsAndActions',
  'generateFinalPomScript',
  'generatePerformanceScenarios',
  'parsePlaywrightCodeToSteps',
  'generateAutomationScript',
  'refineAutomationScript',
  'appendToAutomationScript',
  'generateJMeterArtifacts',
  'analyzePerformanceResults',
  'generateScenariosFromApiResponse',
  'enhanceRecordedScript',
  'analyzePrImpact',
  'generateSyntheticUsers',
  'suggestLocatorHealing'
]);

class AICacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private hitsCount: number = 0;
  private missesCount: number = 0;
  private totalSavedTimeMs: number = 0;

  constructor() {
    this.loadFromDisk();
  }

  public isCacheable(functionName: string): boolean {
    return CACHEABLE_FUNCTIONS.has(functionName);
  }

  /**
   * Generates a deterministic SHA256 hash for arguments
   */
  public generateHash(functionName: string, args: any[]): string {
    const normalized = this.normalizeArgs(args);
    const jsonStr = JSON.stringify({ functionName, args: normalized });
    return crypto.createHash('sha256').update(jsonStr).digest('hex');
  }

  private normalizeArgs(val: any): any {
    if (val === null || val === undefined) return val;
    if (typeof val === 'function') return undefined;
    if (typeof val !== 'object') return val;

    if (Array.isArray(val)) {
      return val.map(item => this.normalizeArgs(item));
    }

    // Sort object keys deterministically
    const sortedKeys = Object.keys(val).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
      // Ignore transient UI or temporary timestamp properties that shouldn't invalidate cache
      if (['timestamp', '_clientTime', 'requestId', 'sessionId'].includes(key)) {
        continue;
      }
      result[key] = this.normalizeArgs(val[key]);
    }
    return result;
  }

  public async get(functionName: string, args: any[]): Promise<{ hit: boolean; result?: any; savedTimeMs?: number }> {
    if (!this.isCacheable(functionName)) {
      return { hit: false };
    }

    const key = this.generateHash(functionName, args);
    const entry = this.cache.get(key);

    if (!entry) {
      this.missesCount++;
      return { hit: false };
    }

    // Check expiration
    const now = Date.now();
    if (now - entry.timestamp > DEFAULT_TTL_MS) {
      this.cache.delete(key);
      this.missesCount++;
      this.saveToDisk();
      return { hit: false };
    }

    entry.hits++;
    this.hitsCount++;
    const savedTime = entry.executionTimeMs || 3000;
    this.totalSavedTimeMs += savedTime;

    let resultWithMeta = entry.result;
    if (resultWithMeta && typeof resultWithMeta === 'object') {
      try {
        if (!Array.isArray(resultWithMeta)) {
          resultWithMeta = {
            ...resultWithMeta,
            _cached: true,
            _cachedAt: entry.timestamp,
            _savedTimeMs: savedTime
          };
        }
      } catch (e) {
        // Fallback
      }
    }

    console.log(`[AI Cache HIT] Function: ${functionName}, Saved: ~${savedTime}ms, Total Hits: ${entry.hits}`);
    return {
      hit: true,
      result: resultWithMeta,
      savedTimeMs: savedTime
    };
  }

  public async set(functionName: string, args: any[], result: any, executionTimeMs: number): Promise<void> {
    if (!this.isCacheable(functionName)) return;

    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const argsHash = this.generateHash(functionName, args);
    const entry: CacheEntry = {
      key: argsHash,
      functionName,
      argsHash,
      result,
      timestamp: Date.now(),
      hits: 0,
      executionTimeMs
    };

    this.cache.set(argsHash, entry);
    console.log(`[AI Cache SET] Function: ${functionName}, ExecTime: ${executionTimeMs}ms, Cache Size: ${this.cache.size}`);
    this.saveToDisk();
  }

  public clear(functionName?: string): { clearedCount: number } {
    let count = 0;
    if (functionName) {
      for (const [key, entry] of this.cache.entries()) {
        if (entry.functionName === functionName) {
          this.cache.delete(key);
          count++;
        }
      }
    } else {
      count = this.cache.size;
      this.cache.clear();
      this.hitsCount = 0;
      this.missesCount = 0;
      this.totalSavedTimeMs = 0;
    }
    this.saveToDisk();
    return { clearedCount: count };
  }

  public getStats(): CacheStats {
    const totalRequests = this.hitsCount + this.missesCount;
    const hitRate = totalRequests > 0 ? (this.hitsCount / totalRequests) * 100 : 0;
    
    const entriesByFunction: Record<string, number> = {};
    for (const entry of this.cache.values()) {
      entriesByFunction[entry.functionName] = (entriesByFunction[entry.functionName] || 0) + 1;
    }

    const estimatedCostSavedUsd = (this.hitsCount * 0.002);

    return {
      totalEntries: this.cache.size,
      hits: this.hitsCount,
      misses: this.missesCount,
      hitRate: Math.round(hitRate * 10) / 10,
      totalSavedTimeMs: this.totalSavedTimeMs,
      estimatedCostSavedUsd: Math.round(estimatedCostSavedUsd * 1000) / 1000,
      entriesByFunction,
      lastUpdated: new Date().toISOString()
    };
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(CACHE_FILE_PATH)) {
        const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.entries)) {
          for (const entry of data.entries) {
            this.cache.set(entry.key, entry);
          }
        }
        this.hitsCount = data.hitsCount || 0;
        this.missesCount = data.missesCount || 0;
        this.totalSavedTimeMs = data.totalSavedTimeMs || 0;
        console.log(`[AI Cache Loaded] Loaded ${this.cache.size} entries from ${CACHE_FILE_PATH}`);
      }
    } catch (err) {
      console.warn('[AI Cache Load Warning] Could not load cache store from disk:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const data = {
        entries: Array.from(this.cache.values()),
        hitsCount: this.hitsCount,
        missesCount: this.missesCount,
        totalSavedTimeMs: this.totalSavedTimeMs,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[AI Cache Save Warning] Could not save cache store to disk:', err);
    }
  }
}

export const aiCacheService = new AICacheService();
