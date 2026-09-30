/**
 * Centralized Application Logger for AutomatiQA
 * Handles structured logging across Browser Console and Cloud Run Server.
 * Sanitizes all sensitive information (passwords, tokens, credentials, API keys, raw base64 data).
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogPayload {
  level: LogLevel;
  feature: string;
  step?: string;
  message: string;
  details?: any;
  user?: string;
  projectId?: string;
  timestamp?: string;
}

// Sensitive parameter patterns to sanitize
const SENSITIVE_KEYS = [
  'password', 'pass', 'pwd', 'token', 'authtoken', 'bearer',
  'secret', 'apikey', 'api_key', 'privatekey', 'credentials',
  'authorization', 'cookie'
];

/**
 * Recursively sanitizes objects to mask sensitive data and truncate heavy base64 strings
 */
export function sanitizeLogDetails(obj: any, depth = 0): any {
  if (obj === null || obj === undefined) return obj;
  if (depth > 6) return '[Truncated Depth]';

  if (typeof obj === 'string') {
    if (obj.startsWith('data:image/') || obj.startsWith('data:video/') || obj.startsWith('data:application/')) {
      return `[BASE64 DATA URL: ${obj.substring(0, 30)}... (${Math.round(obj.length / 1024)} KB)]`;
    }
    if (obj.length > 4000) {
      return `${obj.substring(0, 300)}... [Truncated ${obj.length} chars]`;
    }
    return obj;
  }

  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    if (obj.length > 15) {
      return obj.slice(0, 15).map(item => sanitizeLogDetails(item, depth + 1)).concat(`[... +${obj.length - 15} more items]`);
    }
    return obj.map(item => sanitizeLogDetails(item, depth + 1));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
      sanitized[key] = '***MASKED***';
    } else {
      sanitized[key] = sanitizeLogDetails(value, depth + 1);
    }
  }
  return sanitized;
}

// Buffer for batching browser logs to send to Cloud Run backend server
let logBuffer: LogPayload[] = [];
let flushTimer: any = null;

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

function flushLogsToServer() {
  if (!isBrowser || logBuffer.length === 0) return;
  const logsToSend = [...logBuffer];
  logBuffer = [];

  try {
    const payload = JSON.stringify({ logs: logsToSend });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/logs', blob);
    } else {
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(() => {});
    }
  } catch (err) {
    // Silent catch for logger flush
  }
}

function scheduleFlush() {
  if (!isBrowser) return;
  if (logBuffer.length >= 10) {
    if (flushTimer) clearTimeout(flushTimer);
    flushLogsToServer();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushLogsToServer();
    }, 1500);
  }
}

export const logger = {
  log(level: LogLevel, feature: string, message: string, details?: any, step?: string, user?: string, projectId?: string) {
    const timestamp = new Date().toISOString();
    const sanitizedDetails = details !== undefined ? sanitizeLogDetails(details) : undefined;

    const payload: LogPayload = {
      level,
      feature,
      step,
      message,
      details: sanitizedDetails,
      user,
      projectId,
      timestamp
    };

    const stepText = step ? ` -> [Step: ${step}]` : '';
    const userText = user ? ` [User: ${user}]` : '';
    const projText = projectId ? ` [Proj: ${projectId}]` : '';
    const formattedMsg = `[${timestamp}] [${level}] [${feature}]${stepText}${userText}${projText} ${message}`;

    if (isBrowser) {
      const style = level === 'ERROR' ? 'color: #ef4444; font-weight: bold;'
        : level === 'WARN' ? 'color: #f59e0b; font-weight: bold;'
        : level === 'DEBUG' ? 'color: #8b5cf6;'
        : 'color: #10b981; font-weight: bold;';

      if (level === 'ERROR') {
        console.error(`%c${formattedMsg}`, style, sanitizedDetails !== undefined ? sanitizedDetails : '');
      } else if (level === 'WARN') {
        console.warn(`%c${formattedMsg}`, style, sanitizedDetails !== undefined ? sanitizedDetails : '');
      } else if (level === 'DEBUG') {
        console.debug(`%c${formattedMsg}`, style, sanitizedDetails !== undefined ? sanitizedDetails : '');
      } else {
        console.log(`%c${formattedMsg}`, style, sanitizedDetails !== undefined ? sanitizedDetails : '');
      }

      logBuffer.push(payload);
      scheduleFlush();
    } else {
      const detailsStr = sanitizedDetails !== undefined ? ` | Details: ${JSON.stringify(sanitizedDetails)}` : '';
      if (level === 'ERROR') {
        console.error(`${formattedMsg}${detailsStr}`);
      } else if (level === 'WARN') {
        console.warn(`${formattedMsg}${detailsStr}`);
      } else {
        console.log(`${formattedMsg}${detailsStr}`);
      }
    }
  },

  debug(feature: string, message: string, details?: any, step?: string, user?: string, projectId?: string) {
    this.log('DEBUG', feature, message, details, step, user, projectId);
  },

  info(feature: string, message: string, details?: any, step?: string, user?: string, projectId?: string) {
    this.log('INFO', feature, message, details, step, user, projectId);
  },

  warn(feature: string, message: string, details?: any, step?: string, user?: string, projectId?: string) {
    this.log('WARN', feature, message, details, step, user, projectId);
  },

  error(feature: string, message: string, errorObj?: any, step?: string, user?: string, projectId?: string) {
    let details: any = {};
    if (errorObj instanceof Error) {
      details = {
        name: errorObj.name,
        message: errorObj.message,
        stack: errorObj.stack
      };
    } else if (typeof errorObj === 'object' && errorObj !== null) {
      details = errorObj;
    } else if (errorObj !== undefined) {
      details = { error: String(errorObj) };
    }
    this.log('ERROR', feature, message, details, step, user, projectId);
  }
};
