/**
 * Application-Wide Sanitized & Structured Logging System for AutomatiQA
 * Supports both Browser (Client) and Cloud Run Node.js (Server) environments.
 * 
 * Features:
 * - Trace ID / Request ID tracking across Frontend -> API -> Backend -> Firestore -> Cloud Run.
 * - Structured lifecycle states: STARTED | PROCESSING | SUCCESS | FAILED | COMPLETED.
 * - Automatic sensitive information masking (passwords, tokens, API keys, secrets, credentials).
 * - Full error details (type, message, stack trace, feature, action, Trace ID).
 * - Performance logging for slow operations with duration thresholds.
 * - Dual-target logging: Browser console and Cloud Run server logs via /api/logs batching.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type OperationStatus = 'STARTED' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'COMPLETED';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  feature: string;
  step?: string;
  status?: OperationStatus | string;
  traceId?: string;
  durationMs?: number;
  message: string;
  user?: string; // "userId/userEmail"
  userId?: string;
  userEmail?: string;
  projectId?: string;
  errorType?: string;
  stack?: string;
  details?: any;
}

/**
 * Resolves User ID and User Email from caller parameter or current authenticated session
 */
export function getActiveUserSession(userParam?: any): { userId: string; userEmail: string; userStr: string } {
  let email = '';
  let uid = '';

  if (userParam) {
    if (typeof userParam === 'object') {
      email = userParam.email || '';
      uid = userParam.id || userParam.uid || (email.includes('@') ? email.split('@')[0] : '');
    } else if (typeof userParam === 'string') {
      if (userParam.includes('/')) {
        const parts = userParam.split('/');
        uid = parts[0] || '';
        email = parts[1] || parts[0] || '';
      } else if (userParam.includes('@')) {
        email = userParam;
      } else if (userParam !== 'anonymous' && userParam !== 'system') {
        uid = userParam;
      }
    }
  }

  if (typeof window !== 'undefined') {
    if (!email) {
      email = (window as any).__automatiqa_user_email || localStorage.getItem('automatiqa_user_email') || '';
    }
    if (!uid) {
      uid = (window as any).__automatiqa_user_id || (window as any).__automatiqa_user?.uid || (window as any).__automatiqa_user?.id || localStorage.getItem('automatiqa_user_id') || '';
    }

    if (!email || !uid) {
      try {
        const savedUserStr = sessionStorage.getItem('automatiqa_user') || localStorage.getItem('automatiqa_user');
        if (savedUserStr) {
          const parsed = JSON.parse(savedUserStr);
          if (parsed) {
            if (!email && parsed.email) email = parsed.email;
            if (!uid) uid = parsed.uid || parsed.id || parsed.userId;
          }
        }
      } catch (_) {}
    }
  }

  if (!email) email = 'anonymous';
  if (!uid) {
    uid = email !== 'anonymous' ? (email.includes('@') ? email.split('@')[0] : email) : 'anonymous';
  }

  return { userId: uid, userEmail: email, userStr: `${uid}/${email}` };
}

/**
 * Maps current active tab or provided feature to a clean human-readable Feature / Page name
 */
export function getActiveFeaturePage(providedFeature?: string): string {
  if (providedFeature && providedFeature !== 'ClientWindow' && providedFeature !== 'General' && providedFeature !== 'System' && providedFeature !== 'ClientApp') {
    return providedFeature;
  }

  if (typeof window !== 'undefined') {
    let tab = (window as any).__automatiqa_active_tab || '';
    if (!tab) {
      try {
        tab = localStorage.getItem('automatiqa_active_tab') || '';
      } catch (_) {}
    }
    if (!tab && window.location.hash) {
      tab = window.location.hash.replace('#', '');
    }

    if (tab) {
      const tabMap: Record<string, string> = {
        'cases': 'AI Test Cases',
        'scenarios': 'AI Scenarios',
        'user_stories': 'AI User Story Generator',
        'dashboard': 'Dashboard',
        'projects': 'Projects',
        'functional_cases': 'Functional Test cases',
        'scripts': 'Automation Scripts',
        'record_play': 'Record & Play',
        'execution': 'Execution Hub',
        'api': 'API Testing',
        'web_performance': 'Web Performance',
        'functional_performance': 'Functional Performance',
        'jmeter_performance': 'JMeter Performance',
        'settings_jira': 'Jira Integration Settings',
        'settings_github': 'GitHub Integration Settings',
        'settings_slack': 'Slack Integration Settings',
        'settings_cache': 'AI Cache & Performance Settings',
        'settings_credits': 'Credits Consumption Settings'
      };
      if (tabMap[tab]) {
        return tabMap[tab];
      }
      return tab.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  return providedFeature || 'Dashboard';
}

const SENSITIVE_KEYS = [
  'password',
  'pass',
  'passwd',
  'token',
  'bearer',
  'apikey',
  'api_key',
  'secret',
  'credentials',
  'authorization',
  'cookie',
  'privatekey',
  'auth',
  'access_token',
  'refresh_token',
  'client_secret',
  'session',
  'jwt',
  'card',
  'cvv',
  'ssn'
];

/**
 * Generate a unique Trace ID for tracing an action end-to-end
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `trc_${timestamp}_${randomStr}`;
}

let activeClientTraceId: string | null = null;

export function getTraceId(): string {
  if (typeof window !== 'undefined') {
    if (!activeClientTraceId) {
      try {
        activeClientTraceId = sessionStorage.getItem('automatiqa_trace_id');
      } catch (_) {}
    }
    if (!activeClientTraceId) {
      activeClientTraceId = generateTraceId();
      try {
        sessionStorage.setItem('automatiqa_trace_id', activeClientTraceId);
      } catch (_) {}
    }
    return activeClientTraceId;
  }
  return generateTraceId();
}

export function setTraceId(traceId: string) {
  activeClientTraceId = traceId;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem('automatiqa_trace_id', traceId);
    } catch (_) {}
  }
}

/**
 * Recursively sanitizes objects, arrays, and primitive strings to remove sensitive data
 * and truncate oversized base64 binary strings or huge payloads.
 */
export function sanitizeLogDetails(val: any, depth = 0): any {
  if (val === null || val === undefined) return val;
  if (depth > 6) return '[Max Depth Reached]';

  if (typeof val === 'string') {
    // Truncate long base64 image/file data
    if (val.startsWith('data:') && val.includes(';base64,')) {
      const mime = val.substring(0, val.indexOf(';base64,') + 8);
      return `${mime}[Base64 Payload Truncated - Length: ${val.length} chars]`;
    }
    if (val.length > 2000) {
      return `${val.substring(0, 500)}... [Truncated total ${val.length} chars]`;
    }
    return val;
  }

  if (val instanceof Error) {
    return {
      name: val.name || 'Error',
      message: val.message,
      stack: val.stack,
      code: (val as any).code,
      type: val.constructor ? val.constructor.name : 'Error'
    };
  }

  if (Array.isArray(val)) {
    return val.map(item => sanitizeLogDetails(item, depth + 1));
  }

  if (typeof val === 'object') {
    const sanitizedObj: Record<string, any> = {};
    for (const [key, propValue] of Object.entries(val)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYS.some(k => lowerKey.includes(k));
      if (isSensitive) {
        sanitizedObj[key] = '[REDACTED_SENSITIVE_DATA]';
      } else {
        sanitizedObj[key] = sanitizeLogDetails(propValue, depth + 1);
      }
    }
    return sanitizedObj;
  }

  return val;
}

class AppLogger {
  private isServer = typeof window === 'undefined';
  private logBuffer: LogEntry[] = [];

  constructor() {
    if (!this.isServer) {
      // Auto flush buffer periodically in browser
      setInterval(() => this.flushBuffer(), 3000);

      // Flush on page hide or unload
      if (typeof window !== 'undefined') {
        window.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            this.flushBuffer();
          }
        });

        // Intercept client fetch calls to automatically attach X-Trace-ID header
        if (window.fetch && !(window as any).__automatiqa_fetch_patched) {
          try {
            (window as any).__automatiqa_fetch_patched = true;
            const originalFetch = window.fetch;
            const patchedFetch = function (input: RequestInfo | URL, init?: RequestInit) {
              const currentTraceId = getTraceId();
              let newInit = init || {};
              const urlStr = typeof input === 'string' ? input : (input as Request)?.url || '';
              
              // Inject header for internal API routes
              if (urlStr.startsWith('/api') || urlStr.startsWith(window.location.origin + '/api')) {
                const headers = new Headers(newInit.headers || (typeof input === 'object' && (input as Request).headers ? (input as Request).headers : {}));
                if (!headers.has('X-Trace-ID')) {
                  headers.set('X-Trace-ID', currentTraceId);
                }
                newInit = { ...newInit, headers };
              }
              return originalFetch.call(this, input, newInit);
            };

            try {
              Object.defineProperty(window, 'fetch', {
                value: patchedFetch,
                writable: true,
                configurable: true
              });
            } catch (_) {
              (window as any).fetch = patchedFetch;
            }
          } catch (patchErr) {
            console.warn('[AppLogger] Notice: fetch header interception bypassed:', patchErr);
          }
        }
      }
    }
  }

  private createLogEntry(
    level: LogLevel,
    feature: string,
    message: string,
    details?: any,
    step?: string,
    user?: string | any,
    projectId?: string,
    traceId?: string,
    durationMs?: number,
    status?: OperationStatus | string,
    overrideErrorType?: string,
    overrideStack?: string
  ): LogEntry {
    const userSession = getActiveUserSession(user);
    const resolvedFeature = getActiveFeaturePage(feature);

    let resolvedProject = projectId;
    if (!resolvedProject && !this.isServer) {
      try {
        resolvedProject = localStorage.getItem('automatiqa_selected_project_id') || undefined;
      } catch (_) {}
    }

    const resolvedTraceId = traceId || (this.isServer ? undefined : getTraceId());

    let errorType: string | undefined = overrideErrorType;
    let stackTrace: string | undefined = overrideStack;
    let cleanMessage = message || '';

    if (details instanceof Error) {
      if (!errorType) errorType = details.name || details.constructor?.name || 'Error';
      if (!stackTrace) stackTrace = details.stack;
      if (!cleanMessage || cleanMessage === 'Error') {
        cleanMessage = details.message || cleanMessage;
      }
    } else if (details && typeof details === 'object') {
      if (!stackTrace && details.stack && typeof details.stack === 'string') {
        stackTrace = details.stack;
      }
      if (!errorType) {
        if (details.name && typeof details.name === 'string') {
          errorType = details.name;
        } else if (details.type && typeof details.type === 'string') {
          errorType = details.type;
        } else if (details.error && typeof details.error === 'object') {
          if (details.error.stack && !stackTrace) stackTrace = details.error.stack;
          if (details.error.name) errorType = details.error.name;
        }
      }
    }

    if (!errorType && level === 'ERROR') {
      if (step === 'UnhandledRejection' || step === 'WindowError') {
        errorType = step;
      } else {
        errorType = status ? String(status) : 'Error';
      }
    }

    if (cleanMessage.startsWith('Unhandled Promise Rejection: ')) {
      cleanMessage = cleanMessage.replace('Unhandled Promise Rejection: ', '');
    }

    return {
      timestamp: new Date().toISOString(),
      level,
      feature: resolvedFeature,
      step: step || (feature === 'ClientWindow' ? 'ClientWindow' : 'Execute'),
      status: status || (level === 'ERROR' ? 'FAILED' : undefined),
      traceId: resolvedTraceId,
      durationMs: durationMs !== undefined ? Math.round(durationMs) : undefined,
      message: cleanMessage,
      user: userSession.userStr,
      userId: userSession.userId,
      userEmail: userSession.userEmail,
      projectId: resolvedProject || undefined,
      errorType,
      stack: stackTrace,
      details: details !== undefined ? sanitizeLogDetails(details) : undefined
    };
  }

  public log(
    level: LogLevel,
    feature: string,
    message: string,
    details?: any,
    step?: string,
    user?: string | any,
    projectId?: string,
    traceId?: string,
    durationMs?: number,
    status?: OperationStatus | string,
    overrideErrorType?: string,
    overrideStack?: string
  ) {
    const msgLower = (message || '').toLowerCase();
    const detLower = typeof details === 'string' ? details.toLowerCase() : (details?.message ? String(details.message).toLowerCase() : '');
    if (msgLower.includes('websocket closed') || msgLower.includes('closed without opened') || detLower.includes('websocket closed') || detLower.includes('closed without opened')) {
      return; // Ignore Vite HMR WebSocket closed without opened errors in dev environment
    }

    const entry = this.createLogEntry(level, feature, message, details, step, user, projectId, traceId, durationMs, status, overrideErrorType, overrideStack);

    if (this.isServer) {
      this.writeServerLog(entry);
    } else {
      this.writeClientConsoleLog(entry);
      this.logBuffer.push(entry);
      if (this.logBuffer.length >= 8) {
        this.flushBuffer();
      }
    }
  }

  public debug(feature: string, message: string, details?: any, step?: string, user?: string | any, projectId?: string, traceId?: string) {
    this.log('DEBUG', feature, message, details, step, user, projectId, traceId);
  }

  public info(feature: string, message: string, details?: any, step?: string, user?: string | any, projectId?: string, traceId?: string) {
    this.log('INFO', feature, message, details, step, user, projectId, traceId);
  }

  public warn(feature: string, message: string, details?: any, step?: string, user?: string | any, projectId?: string, traceId?: string) {
    this.log('WARN', feature, message, details, step, user, projectId, traceId);
  }

  public error(feature: string, message: string, errorOrDetails?: any, step?: string, user?: string | any, projectId?: string, traceId?: string) {
    this.log('ERROR', feature, message, errorOrDetails, step, user, projectId, traceId);
  }

  public logOperation(
    feature: string,
    step: string,
    status: OperationStatus,
    message: string,
    details?: any,
    durationMs?: number,
    traceId?: string,
    user?: string | any,
    projectId?: string
  ) {
    const level: LogLevel = status === 'FAILED' ? 'ERROR' : status === 'STARTED' ? 'DEBUG' : 'INFO';
    this.log(level, feature, message, details, step, user, projectId, traceId, durationMs, status);
  }

  public logPerformance(
    feature: string,
    action: string,
    durationMs: number,
    thresholdMs: number = 1500,
    details?: any,
    traceId?: string
  ) {
    if (durationMs >= thresholdMs) {
      this.log(
        'WARN',
        feature,
        `[SLOW_OPERATION_WARNING] ${action} took ${Math.round(durationMs)}ms (threshold: ${thresholdMs}ms)`,
        { ...details, durationMs, thresholdMs },
        'PerformanceWarning',
        undefined,
        undefined,
        traceId,
        durationMs,
        'COMPLETED'
      );
    }
  }

  public startAction(feature: string, actionName: string, initialDetails?: any, user?: string, projectId?: string) {
    const traceId = generateTraceId();
    if (!this.isServer) {
      setTraceId(traceId);
    }
    const startTime = Date.now();

    this.log('INFO', feature, `Started user action: ${actionName}`, initialDetails, actionName, user, projectId, traceId, 0, 'STARTED');

    return {
      traceId,
      feature,
      actionName,
      startTime,
      processing: (stepMsg: string, details?: any) => {
        const durationMs = Date.now() - startTime;
        this.log('DEBUG', feature, stepMsg, details, actionName, user, projectId, traceId, durationMs, 'PROCESSING');
      },
      complete: (successMsg: string, details?: any) => {
        const durationMs = Date.now() - startTime;
        this.log('INFO', feature, successMsg, details, actionName, user, projectId, traceId, durationMs, 'COMPLETED');
        this.logPerformance(feature, actionName, durationMs, 2000, details, traceId);
      },
      fail: (error: any, failureMsg?: string, details?: any) => {
        const durationMs = Date.now() - startTime;
        const msg = failureMsg || `Failed user action: ${actionName} (${error?.message || error})`;
        this.log('ERROR', feature, msg, { error: sanitizeLogDetails(error), ...details }, actionName, user, projectId, traceId, durationMs, 'FAILED');
      }
    };
  }

  private writeServerLog(entry: LogEntry) {
    const trcStr = entry.traceId ? `[Trace: ${entry.traceId}]` : '';
    const userStr = `[User: ${entry.user || 'anonymous/anonymous'}]`;
    const featStr = `[Feature: ${entry.feature}]`;
    const stepStr = entry.step ? `[${entry.step}]` : '';
    const errTypeStr = entry.errorType ? `[${entry.errorType}]` : (entry.status ? `[${entry.status}]` : '');
    const projStr = entry.projectId ? `[Proj: ${entry.projectId}]` : '';
    const durStr = entry.durationMs !== undefined ? `[${entry.durationMs}ms]` : '';

    const prefix = `[${entry.timestamp}] [AutomatiQA ${entry.level}] ${trcStr} ${userStr} ${featStr} ${stepStr}${errTypeStr}${projStr}${durStr}`.replace(/\s+/g, ' ');
    const stackStr = entry.stack ? `\nStack trace:\n${entry.stack}` : '';
    const formattedMessage = `${prefix} ${entry.message}${stackStr}`;

    if (entry.level === 'ERROR') {
      console.error(formattedMessage, entry.details ? JSON.stringify(entry.details) : '');
    } else if (entry.level === 'WARN') {
      console.warn(formattedMessage, entry.details ? JSON.stringify(entry.details) : '');
    } else if (entry.level === 'DEBUG') {
      console.debug(formattedMessage, entry.details ? JSON.stringify(entry.details) : '');
    } else {
      console.log(formattedMessage, entry.details ? JSON.stringify(entry.details) : '');
    }
  }

  private writeClientConsoleLog(entry: LogEntry) {
    const trcStr = entry.traceId ? `[Trace: ${entry.traceId}]` : '';
    const userStr = `[User: ${entry.user}]`;
    const featStr = `[Feature: ${entry.feature}]`;
    const stepStr = entry.step ? `[${entry.step}]` : '';
    const errTypeStr = entry.errorType ? `[${entry.errorType}]` : (entry.status ? `[${entry.status}]` : '');
    const durStr = entry.durationMs !== undefined ? `[${entry.durationMs}ms]` : '';

    let color = '#3b82f6'; // blue for info
    if (entry.level === 'DEBUG') color = '#6b7280'; // gray
    if (entry.level === 'WARN') color = '#f59e0b'; // amber
    if (entry.level === 'ERROR') color = '#ef4444'; // red

    const style = `color: ${color}; font-weight: bold;`;

    if (entry.level === 'ERROR') {
      const tag = `%c[AutomatiQA ERROR] ${trcStr} ${userStr} ${featStr} ${stepStr}${errTypeStr}`.replace(/\s+/g, ' ');
      const logArgs: any[] = [tag, style, entry.message];
      if (entry.stack) {
        logArgs.push(`\nStack trace:\n${entry.stack}`);
      }
      if (entry.details !== undefined) {
        logArgs.push(entry.details);
      }
      console.error(...logArgs);
    } else if (entry.level === 'WARN') {
      const tag = `%c[AutomatiQA WARN] ${trcStr} ${userStr} ${featStr} ${stepStr}${errTypeStr}${durStr}`.replace(/\s+/g, ' ');
      console.warn(tag, style, entry.message, entry.details !== undefined ? entry.details : '');
    } else if (entry.level === 'DEBUG') {
      const tag = `%c[AutomatiQA DEBUG] ${trcStr} ${userStr} ${featStr} ${stepStr}${durStr}`.replace(/\s+/g, ' ');
      console.debug(tag, style, entry.message, entry.details !== undefined ? entry.details : '');
    } else {
      const tag = `%c[AutomatiQA INFO] ${trcStr} ${userStr} ${featStr} ${stepStr}${durStr}`.replace(/\s+/g, ' ');
      console.info(tag, style, entry.message, entry.details !== undefined ? entry.details : '');
    }
  }

  private async flushBuffer() {
    if (this.isServer || this.logBuffer.length === 0) return;

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    const payload = JSON.stringify({ logs: logsToSend });

    try {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        const success = navigator.sendBeacon('/api/logs', blob);
        if (success) return;
      }

      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });
    } catch (_) {
      // Non-blocking log sync failure fallback
    }
  }
}

export const logger = new AppLogger();
