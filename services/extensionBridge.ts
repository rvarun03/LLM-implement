/**
 * AutomatiQA <-> QA Recorder Chrome extension bridge.
 *
 * The extension's content script is injected into every frame of every page,
 * including the cross-origin iframe that Google AI Studio (and other hosted
 * preview environments) uses to render this app. Communication therefore goes
 * through `window.postMessage` on this frame's own window - never through
 * `chrome.runtime`, which is not exposed to page scripts.
 *
 * Two transports are supported:
 *   - 'backend': a recorder server is reachable from this origin (localhost dev
 *     or a self-hosted deployment). Steps travel app <- socket.io <- server <-
 *     WebSocket <- extension, exactly as before.
 *   - 'direct':  no server is reachable (AI Studio preview / any static host).
 *     The extension streams captured steps straight back to this frame with
 *     `AUTOMATIQA_RECORDED_STEP` messages.
 */

export type RecorderTransport = 'backend' | 'direct';

export interface ExtensionStartOptions {
  sessionId: string;
  transport: RecorderTransport;
  backendUrl?: string | null;
  httpUrl?: string | null;
}

const isBrowser = typeof window !== 'undefined';

/** True once the extension has announced itself in this frame. */
export function isExtensionAnnounced(): boolean {
  return Boolean(isBrowser && (window as any).__QA_RECORDER_EXTENSION_ACTIVE__);
}

/**
 * Probe for the extension. Resolves false if it does not answer in time,
 * which is the normal result when the extension is not installed.
 */
export function detectExtension(timeoutMs = 1200): Promise<boolean> {
  if (!isBrowser) return Promise.resolve(false);
  if (isExtensionAnnounced()) return Promise.resolve(true);

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (found: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(found);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === 'AUTOMATIQA_EXTENSION_ACTIVE') finish(true);
    };

    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(isExtensionAnnounced()), timeoutMs);

    window.postMessage({ type: 'AUTOMATIQA_CHECK_EXTENSION' }, '*');
  });
}

/**
 * Tell the extension where this deployment's recorder backend lives.
 *
 * Sent unconditionally on every page load. Without it a freshly installed
 * extension has no idea which server to talk to - it must never fall back to a
 * hardcoded localhost address, which only exists on a developer's machine.
 */
export function configureExtensionBackend(): void {
  if (!isBrowser) return;
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  window.postMessage(
    {
      type: 'AUTOMATIQA_CONFIGURE_BACKEND',
      backendUrl: `${wsProto}//${window.location.host}/recorder`,
      httpUrl: window.location.origin
    },
    '*'
  );
}

/**
 * Is there a recorder backend on this origin? On AI Studio the preview host
 * serves only static assets, so `/api/recorder/status` returns HTML (the SPA
 * fallback) or a 404 - both mean "no backend, use direct transport".
 */
export async function hasSameOriginRecorderBackend(timeoutMs = 2500): Promise<boolean> {
  if (!isBrowser) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('/api/recorder/status', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    return contentType.includes('application/json');
  } catch {
    return false;
  }
}

/** Resolve the transport to use for a new recording session. */
export async function resolveTransport(): Promise<RecorderTransport> {
  return (await hasSameOriginRecorderBackend()) ? 'backend' : 'direct';
}

function waitForAck(action: 'START_RECORDING' | 'STOP_RECORDING', timeoutMs: number) {
  return new Promise<any>((resolve) => {
    let settled = false;
    const finish = (value: any) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type === 'AUTOMATIQA_EXTENSION_ACK' && event.data.action === action) {
        finish(event.data);
      }
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

export async function startExtensionRecording(
  options: ExtensionStartOptions,
  timeoutMs = 3000
): Promise<{ success: boolean; sessionId: string; transport: RecorderTransport }> {
  if (!isBrowser) {
    return { success: false, sessionId: options.sessionId, transport: options.transport };
  }

  const ack = waitForAck('START_RECORDING', timeoutMs);

  window.postMessage(
    {
      type: 'AUTOMATIQA_START_RECORDING',
      sessionId: options.sessionId,
      transport: options.transport,
      backendUrl: options.transport === 'backend' ? options.backendUrl ?? null : null,
      httpUrl: options.transport === 'backend' ? options.httpUrl ?? null : null
    },
    '*'
  );

  const result = await ack;
  return {
    success: Boolean(result?.success),
    sessionId: result?.sessionId || options.sessionId,
    transport: (result?.transport as RecorderTransport) || options.transport
  };
}

export async function stopExtensionRecording(sessionId: string | null, timeoutMs = 2000) {
  if (!isBrowser) return false;
  const ack = waitForAck('STOP_RECORDING', timeoutMs);
  window.postMessage({ type: 'AUTOMATIQA_STOP_RECORDING', sessionId }, '*');
  const result = await ack;
  return Boolean(result?.success);
}

/**
 * Subscribe to steps pushed by the extension in direct transport mode.
 * Returns an unsubscribe function.
 */
export function onExtensionStep(handler: (step: any) => void): () => void {
  if (!isBrowser) return () => {};

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'AUTOMATIQA_RECORDED_STEP') return;
    if (event.data.step) handler(event.data.step);
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
