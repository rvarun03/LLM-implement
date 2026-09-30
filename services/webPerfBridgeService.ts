/**
 * AutomatiQA Web Performance Agent Bridge Service
 *
 * Dedicated communication layer for the Web Performance Testing feature.
 * Connects the Google AI Studio Web Performance UI to the local recording agent
 * through the new "AutomatiQA Web Performance Agent Bridge" Chrome extension.
 *
 * Architecture:
 * Web Performance UI -> Bridge Extension -> wss://localhost:9334 -> Local Agent
 */

export const WEB_PERF_NAMESPACE = 'automatiqa-web-performance';
export const PAGE_SOURCE = 'automatiqa-web-perf-page';
export const BRIDGE_SOURCE = 'automatiqa-web-perf-bridge';

export interface BridgeStatusResponse {
  isInstalled: boolean;
  bridgeVersion?: string;
  agentStatus: 'connected' | 'disconnected' | 'untrusted' | 'connecting' | 'checking';
  agentVersion?: string;
  error?: string;
}

const isBrowser = typeof window !== 'undefined';

/**
 * Check if the bridge extension is already injected on the window object
 */
export function isBridgeInjected(): boolean {
  return Boolean(isBrowser && (window as any).__AUTOMATIQA_WEB_PERF_BRIDGE__?.installed);
}

/**
 * Probe for the Web Performance Bridge Chrome Extension.
 */
export function checkBridgeStatus(timeoutMs = 1500): Promise<BridgeStatusResponse> {
  if (!isBrowser) {
    return Promise.resolve({
      isInstalled: false,
      agentStatus: 'disconnected'
    });
  }

  return new Promise<BridgeStatusResponse>((resolve) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };

    const finish = (result: BridgeStatusResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || !event.data) return;
      const data = event.data;

      if (
        data.namespace === WEB_PERF_NAMESPACE &&
        (data.source === BRIDGE_SOURCE || data.bridgeInstalled)
      ) {
        if (data.type === 'bridge_status' || data.type === 'bridge_agent_status') {
          finish({
            isInstalled: true,
            bridgeVersion: data.bridgeVersion || '1.0.0',
            agentStatus: data.agentStatus || (data.status === 'connected' ? 'connected' : 'disconnected'),
            agentVersion: data.agentVersion || data.version,
            error: data.message
          });
        }
      }
    };

    window.addEventListener('message', onMessage);

    const timer = setTimeout(() => {
      const injected = isBridgeInjected();
      finish({
        isInstalled: injected,
        agentStatus: 'disconnected'
      });
    }, timeoutMs);

    // Send probe message
    window.postMessage({
      namespace: WEB_PERF_NAMESPACE,
      source: PAGE_SOURCE,
      action: 'ping_bridge',
      timestamp: Date.now()
    }, '*');
  });
}

/**
 * Send start recording command through the Web Performance Bridge Extension
 */
export function sendBridgeStartRecord(url: string, sessionId: string): void {
  if (!isBrowser) return;

  window.postMessage({
    namespace: WEB_PERF_NAMESPACE,
    source: PAGE_SOURCE,
    action: 'start_record',
    payload: {
      url,
      sessionId
    }
  }, '*');
}

/**
 * Send stop recording command through the Web Performance Bridge Extension
 */
export function sendBridgeStopRecord(sessionId: string, reason?: string): void {
  if (!isBrowser) return;

  window.postMessage({
    namespace: WEB_PERF_NAMESPACE,
    source: PAGE_SOURCE,
    action: 'stop_record',
    payload: {
      sessionId,
      reason: reason || 'User stopped recording'
    }
  }, '*');
}

/**
 * Request Bridge Extension to open 1-click SSL certificate authorization tab
 */
export function sendBridgeAuthorizeSsl(): void {
  if (!isBrowser) return;

  window.postMessage({
    namespace: WEB_PERF_NAMESPACE,
    source: PAGE_SOURCE,
    action: 'authorize_ssl',
    payload: {}
  }, '*');
}

/**
 * Subscribe to live agent messages relayed via the Bridge Extension
 */
export function subscribeToBridgeEvents(callback: (msg: any) => void): () => void {
  if (!isBrowser) return () => {};

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window || !event.data) return;
    const data = event.data;

    if (
      data.namespace === WEB_PERF_NAMESPACE &&
      data.source === BRIDGE_SOURCE
    ) {
      callback(data);
    }
  };

  window.addEventListener('message', onMessage);
  return () => {
    window.removeEventListener('message', onMessage);
  };
}
