import { logger } from './appLogger';
import { getValidAuthToken, logAuthDiagnostic } from './authService';

/**
 * Safely parses API responses to prevent unhandled "Unexpected token '<', "<!DOCTYPE "... is not valid JSON" syntax errors
 * when endpoints return HTML (e.g. 500/502/404 pages or proxy fallback).
 * 
 * Automatically attaches valid Firebase ID token for authenticated requests,
 * and handles 401/403 responses by refreshing the token and retrying the request once.
 */
export async function safeFetchJson<T = any>(
  url: string, 
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const method = options?.method || 'GET';
  logger.debug('ApiUtils', `Executing ${method} request to ${url}`, { method }, 'safeFetchJson');

  // Prepare request options with Bearer token if available
  const prepareOptions = async (forceTokenRefresh = false): Promise<RequestInit> => {
    const opts: RequestInit = { ...(options || {}) };
    const headers = new Headers(opts.headers || {});

    // Only inject token if not already explicitly provided
    if (!headers.has('Authorization')) {
      try {
        const idToken = await getValidAuthToken(forceTokenRefresh);
        if (idToken) {
          headers.set('Authorization', `Bearer ${idToken}`);
        }
      } catch (tokenErr) {
        logAuthDiagnostic('Error obtaining token for API request', { url });
      }
    }

    opts.headers = headers;
    return opts;
  };

  try {
    const initialOptions = await prepareOptions(false);
    let response = await fetch(url, initialOptions);

    // If 401 Unauthorized or 403 Forbidden, token may have expired. Attempt refresh and single retry.
    if ((response.status === 401 || response.status === 403) && url.startsWith('/api/')) {
      logAuthDiagnostic('API request returned 401/403, attempting single token refresh & retry', { url, status: response.status });
      try {
        const refreshedOptions = await prepareOptions(true);
        response = await fetch(url, refreshedOptions);
        logAuthDiagnostic('Retried request completed', { url, status: response.status });
      } catch (retryErr: any) {
        logAuthDiagnostic('Token refresh retry request failed', { url, error: retryErr?.message });
      }
    }

    const result = await parseApiResponse<T>(response);
    if (!result.ok) {
      logger.warn('ApiUtils', `API request failed: ${method} ${url} -> Status ${result.status}`, { error: result.error, status: result.status }, 'safeFetchJson');
    } else {
      logger.info('ApiUtils', `API request succeeded: ${method} ${url} -> Status ${result.status}`, { status: result.status }, 'safeFetchJson');
    }
    return result;
  } catch (err: any) {
    logger.error('ApiUtils', `Network error executing ${method} ${url}: ${err.message}`, err, 'safeFetchJson');
    return {
      ok: false,
      status: 0,
      data: null,
      error: err.message || 'Network error encountered while connecting to server.'
    };
  }
}

export async function parseApiResponse<T = any>(
  response: Response
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const status = response.status;
  let text = '';
  
  try {
    text = await response.text();
  } catch (err: any) {
    return {
      ok: false,
      status,
      data: null,
      error: `Failed to read server response (Status ${status}).`
    };
  }

  if (!text || !text.trim()) {
    return {
      ok: response.ok,
      status,
      data: null,
      error: response.ok ? undefined : `Server returned empty response (Status ${status}).`
    };
  }

  try {
    const data = JSON.parse(text);
    const hasSuccessFlag = typeof data === 'object' && data !== null && 'success' in data;
    const hasAllowedFlag = typeof data === 'object' && data !== null && 'allowed' in data;
    
    // Check success condition: if response is ok OR data explicitly indicates success/allowed
    let isSuccess = response.ok;
    if (hasSuccessFlag) isSuccess = isSuccess && data.success === true;
    if (hasAllowedFlag) isSuccess = isSuccess && data.allowed === true;
    if (!response.ok && (data.success === true || data.allowed === true)) {
      isSuccess = true;
    }
    
    return {
      ok: isSuccess,
      status,
      data,
      error: !isSuccess ? (data.error || data.reason || data.message || `Request failed with status ${status}.`) : undefined
    };
  } catch (_jsonErr) {
    // Response text is NOT valid JSON (e.g. HTML <!DOCTYPE ...> or raw error string)
    let cleanText = text.trim();
    if (cleanText.startsWith('<!DOCTYPE') || cleanText.startsWith('<html') || cleanText.startsWith('<')) {
      if (status === 413 || cleanText.toLowerCase().includes('too large') || cleanText.toLowerCase().includes('payload')) {
        cleanText = `Payload size exceeded server limits (HTTP 413). Please retry with fewer keyframes or smaller images.`;
      } else {
        cleanText = `Server returned HTML response (Status ${status}). Please wait a moment and try again.`;
      }
    } else if (cleanText.length > 250) {
      cleanText = cleanText.substring(0, 250) + '...';
    }
    
    return {
      ok: false,
      status,
      data: null,
      error: cleanText || `Invalid response format returned from server (Status ${status}).`
    };
  }
}

/**
 * Compresses and resizes a base64 image data URL to ensure fast API payload transfer
 * and prevent payload overflow or connection timeouts.
 */
export function compressImage(dataUrl: string, maxWidth = 1200, maxHeight = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      resolve(dataUrl || '');
      return;
    }
    if (dataUrl.length < 150000) {
      // Already small (< ~110KB)
      resolve(dataUrl);
      return;
    }

    let settled = false;
    const finish = (result: string) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    // Safety timeout: resolve original within 2 seconds if canvas/image stalls
    const timer = setTimeout(() => {
      finish(dataUrl);
    }, 2000);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          let width = img.width || maxWidth;
          let height = img.height || maxHeight;

          if (width > maxWidth || height > maxHeight) {
            if (width / maxWidth > height / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', quality);
          finish(compressed);
        } catch {
          finish(dataUrl);
        }
      };
      img.onerror = () => {
        finish(dataUrl);
      };
      img.src = dataUrl;
    } catch {
      finish(dataUrl);
    }
  });
}

/**
 * Formats Acceptance Criteria string so that each Gherkin condition (Given, When, Then, And, But)
 * appears on its own line, with proper spacing between scenarios.
 */
export function formatAcceptanceCriteria(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let str = text.trim();
  if (!str) return '';

  // 1. If text contains Gherkin keywords Given/When/Then
  if (/\b(Given|When|Then)\b/i.test(str)) {
    // Insert double linebreaks before new Given (scenario start)
    str = str.replace(/(?<!^|\n)\s*[-*•\d+\.\)]*\s*(?=\bGiven\b)/gi, '\n\n');
    // Insert single linebreak before When, Then, And, But
    str = str.replace(/(?<!^|\n)\s*[-*•\d+\.\)]*\s*(?=\b(When|Then|And|But)\b)/gi, '\n');
  } else {
    // 2. If text contains numbered items (1., 2., 1), 2)), bullets (- , * , • ), AC1:, Scenario 1:
    str = str.replace(/(?<!^|\n)\s*(?=(?:\d+[\.\)]|[-*•+])\s+|\b(?:AC\s*\d+:?|Scenario\s*\d+:?|Criterion\s*\d+:?)\b)/gi, '\n');
    
    // 3. If there are still no linebreaks and text has multiple sentences
    if (!str.includes('\n') && /[.;]\s+[A-Z0-9]/i.test(str)) {
      str = str.replace(/([.;])\s+(?=[A-Z0-9])/g, '$1\n');
    }
  }

  // Split into lines and clean up each line
  const rawLines = str.split('\n');
  const cleanLines: string[] = [];

  rawLines.forEach((line) => {
    let trimmed = line.trim();
    if (!trimmed) return;

    // Remove leading bullet/number prefix if followed by Gherkin words
    trimmed = trimmed.replace(/^[-*•\s\d+\.\)]+\s*(?=\b(Given|When|Then|And|But)\b)/i, '');

    cleanLines.push(trimmed);
  });

  // Reconstruct with spacing: single newline between steps, double newline before new "Given" scenarios
  const result: string[] = [];
  cleanLines.forEach((line, idx) => {
    if (idx > 0 && /^Given\b/i.test(line) && result.length > 0 && result[result.length - 1] !== '') {
      result.push(''); // Blank line before new Given scenario
    }
    result.push(line);
  });

  return result.join('\n');
}

