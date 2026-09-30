import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Play,
  Square,
  RefreshCw,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Laptop,
  Terminal,
  ExternalLink,
  ShieldCheck,
  Clock,
  Activity,
  FileCode,
  FileJson,
  Search,
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  MousePointer,
  Send,
  Zap,
  Copy,
  Check,
  Globe,
  HelpCircle,
  Sparkles,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Sliders,
  Users,
  Repeat,
  ArrowRight,
  Lock,
  Unlock,
  CreditCard,
  Key,
  ShieldAlert,
  FolderTree,
  RotateCcw,
  Save,
  FileUp,
  CheckSquare,
  FolderArchive,
  Folder,
  X,
  Calendar,
  Puzzle
} from 'lucide-react';
import { Project, User, PerformanceScript } from '../types';
import { deductExportCredits } from '../services/creditService';
import { sanitizeJmxScript } from '../utils/jmxSanitizer';
import {
  checkBridgeStatus,
  sendBridgeStartRecord,
  sendBridgeStopRecord,
  sendBridgeAuthorizeSsl,
  subscribeToBridgeEvents,
  isBridgeInjected
} from '../services/webPerfBridgeService';

export interface SavedWebRecording {
  id: string;
  name: string;
  targetUrl: string;
  savedAt: string;
  saveLocation: string; // e.g. "Project Folder: Automation / Recorded Tests" or "JSON Download"
  scenariosCount: number;
  requestsCount: number;
  scenarios: ScenarioGroup[];
  jmeterConfig: JMeterTestPlanConfig;
  jmxContent?: string;
  folderId?: string;
  folderName?: string;
}

export const STORAGE_KEY_SAVED_RECORDINGS = 'automatiqa_saved_recordings';

export function getStoredRecordings(projectScripts?: PerformanceScript[]): SavedWebRecording[] {
  let localList: SavedWebRecording[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_RECORDINGS);
    if (raw) {
      localList = JSON.parse(raw);
    }
  } catch (e) {}

  // Also include any project.performanceScripts that contain scenarios
  const projectList: SavedWebRecording[] = (projectScripts || [])
    .filter((s) => s.scenarios && Array.isArray(s.scenarios) && s.scenarios.length > 0)
    .map((s) => {
      let reqCount = 0;
      s.scenarios.forEach((sc: any) => {
        if (sc.requests && Array.isArray(sc.requests)) reqCount += sc.requests.length;
      });
      return {
        id: s.id,
        name: s.name,
        targetUrl: (s as any).targetUrl || 'Web Application',
        savedAt: s.createdAt || new Date().toISOString(),
        saveLocation: s.folderName ? `Project Folder: ${s.folderName}` : 'Project: Performance Scripts',
        scenariosCount: s.scenarios.length,
        requestsCount: reqCount,
        scenarios: s.scenarios,
        jmeterConfig: (s as any).jmeterConfig || {
          numThreads: 10,
          rampUpSeconds: 10,
          loopCount: 1,
          durationSeconds: 60,
          domain: 'example.com',
          protocol: 'https',
          port: '443'
        },
        jmxContent: s.jmxContent,
        folderId: s.folderId,
        folderName: s.folderName
      };
    });

  // Merge and deduplicate by id
  const map = new Map<string, SavedWebRecording>();
  localList.forEach((item) => map.set(item.id, item));
  projectList.forEach((item) => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
}

export function persistStoredRecording(rec: SavedWebRecording) {
  try {
    const existing = getStoredRecordings();
    const updated = [rec, ...existing.filter((x) => x.id !== rec.id)];
    localStorage.setItem(STORAGE_KEY_SAVED_RECORDINGS, JSON.stringify(updated));
  } catch (e) {}
}

export function removeStoredRecording(id: string) {
  try {
    const existing = getStoredRecordings();
    const updated = existing.filter((x) => x.id !== id);
    localStorage.setItem(STORAGE_KEY_SAVED_RECORDINGS, JSON.stringify(updated));
  } catch (e) {}
}

interface WebRecordAndCaptureProps {
  project?: Project;
  user?: User;
  initialUrl?: string;
  onUpdateProject?: (project: Project) => void;
}

export interface CapturedFormField {
  key: string;
  value: string;
  isSensitive: boolean;
  action: 'parameterize' | 'hardcode'; // default 'parameterize' for sensitive
  revealed: boolean; // toggle visibility in UI
}

export interface CapturedNetworkRequest {
  id: string;
  url: string;
  method: string;
  status: number;
  responseTimeMs: number;
  resourceType: string;
  actionId?: string;
  actionIntent?: string;
  actionFormData?: Record<string, string>;
  scenarioId?: string;
  timestamp: number;
  headers?: Record<string, string>;
  formFields?: CapturedFormField[];
  rawBody?: string;
  correlatedDynamicValue?: {
    sourceScenario: string;
    sourceField: string;
    targetField: string;
    variableName: string;
  } | null;
  isPaymentGateway?: boolean;
  paymentGatewayName?: string;
}

export interface ScenarioGroup {
  id: string;
  name: string;
  isEditingName: boolean;
  userActionText?: string;
  actionType: 'navigation' | 'click' | 'submit' | 'composite';
  timestamp: number;
  primaryRequestId?: string;
  primaryRequest?: CapturedNetworkRequest;
  supportingRequests?: CapturedNetworkRequest[];
  requests: CapturedNetworkRequest[];
  hasPaymentGateway?: boolean;
  paymentGatewayDomain?: string;
}

export interface JMeterTestPlanConfig {
  numThreads: number;
  rampTime: number;
  loopCount: number;
  domain: string;
  protocol: string;
  port: string;
}

export interface RecordedSessionMeta {
  sessionId: string;
  targetUrl: string;
  timestamp: number;
  formattedDate: string;
  durationSeconds: number;
  isDemo: boolean;
  requestCount: number;
  actionCount: number;
}

// Known payment processor domains
const PAYMENT_DOMAINS = [
  { match: 'stripe.com', name: 'Stripe' },
  { match: 'paypal.com', name: 'PayPal' },
  { match: 'razorpay.com', name: 'Razorpay' },
  { match: 'square.com', name: 'Square' },
  { match: 'squareup.com', name: 'Square' },
  { match: 'adyen.com', name: 'Adyen' },
  { match: 'braintreegateway.com', name: 'Braintree' },
  { match: 'authorize.net', name: 'Authorize.Net' },
  { match: 'checkout.com', name: 'Checkout.com' },
  { match: 'worldpay.com', name: 'Worldpay' }
];

// Sensitive field regex pattern covering all credentials, auth tokens, cards, and OTPs
const SENSITIVE_FIELD_REGEX = /(password|passwd|pwd|pass|card[_-]?num|credit|cvv|cvc|otp|ssn|secret|pin|auth[_-]?token|bearer|api[_-]?key|access[_-]?token|private[_-]?key|session[_-]?id|jwt|token)/i;

// Generic exclusion filter for known non-user tracking / ad-network / referral parameters
// Matched by pattern, not hardcoded to any single site
export const NON_USER_PARAM_REGEX = /^(utm_|gclid|fbclid|msclkid|dclid|twclid|igshid|hv[a-z0-9_]|mcid|ref_|affiliate|trk|tracking|_ga|_gl|s_kwcid|yclid|zenid|adgroup|campaign|matchtype|placement|wbraid|gbraid|oly_enc_id|oly_anon_id|vero_id|_openstat)/i;

export interface JmxValidationWarning {
  id: string;
  scenarioName: string;
  samplerName: string;
  method: string;
  path: string;
  message: string;
}

/**
 * Sanitize URL for JMeter by removing external tracking / ad parameters while preserving application routes
 */
export function sanitizeUrlForJmeter(rawUrl: string): { domain: string; port: string; protocol: string; path: string } {
  let domain = '';
  let protocol = 'https';
  let port = '443';
  let cleanPath = '/';

  try {
    const u = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
    domain = u.hostname;
    protocol = u.protocol.replace(':', '') || 'https';
    port = u.port || (protocol === 'https' ? '443' : '80');

    // Strip ad and tracking parameters matching NON_USER_PARAM_REGEX
    const cleanParams = new URLSearchParams();
    u.searchParams.forEach((val, key) => {
      if (!NON_USER_PARAM_REGEX.test(key)) {
        cleanParams.append(key, val);
      }
    });

    const searchStr = cleanParams.toString();
    cleanPath = u.pathname + (searchStr ? `?${searchStr}` : '');
  } catch (e) {
    cleanPath = rawUrl;
  }

  return { domain, protocol, port, path: cleanPath };
}

// Extract root registrable domain (eTLD+1) for generic first-party domain comparison
export function getRegistrableDomain(hostname: string): string {
  if (!hostname) return '';
  const clean = hostname.toLowerCase().trim().split(':')[0];
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(clean) || clean === 'localhost') {
    return clean;
  }
  const parts = clean.split('.');
  if (parts.length <= 2) return clean;
  const secondToLast = parts[parts.length - 2];
  const commonTwoPartTlds = ['co', 'com', 'org', 'net', 'edu', 'gov', 'mil', 'ac'];
  if (parts.length >= 3 && commonTwoPartTlds.includes(secondToLast) && parts[parts.length - 1].length <= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

/**
 * Checks whether requestUrl belongs to the same domain or a first-party subdomain of targetSiteUrl.
 * Matched generically by domain comparison (NOT hardcoded company lists).
 */
export function isFirstPartyDomain(requestUrl: string, targetSiteUrl: string): boolean {
  if (!requestUrl) return false;
  if (!targetSiteUrl) return true;
  try {
    const reqParsed = new URL(requestUrl.startsWith('http') ? requestUrl : `https://${requestUrl}`);
    const targetParsed = new URL(targetSiteUrl.startsWith('http') ? targetSiteUrl : `https://${targetSiteUrl}`);
    const reqHost = reqParsed.hostname.toLowerCase();
    const targetHost = targetParsed.hostname.toLowerCase();
    if (reqHost === targetHost) return true;
    const targetRoot = getRegistrableDomain(targetHost);
    if (targetRoot && (reqHost === targetRoot || reqHost.endsWith('.' + targetRoot))) {
      return true;
    }
    return false;
  } catch (e) {
    return true;
  }
}

// Generic app-agnostic relevance and noise filter for performance testing (synchronized with agent & extension)
export function isNoiseRequest(
  url: string,
  resourceType?: string,
  method?: string,
  status?: number,
  targetSiteUrl?: string,
  hasUserInteraction?: boolean
): boolean {
  if (!url) return true;
  const lowerUrl = url.toLowerCase();
  const lowerType = (resourceType || '').toLowerCase();
  const reqMethod = (method || 'GET').toUpperCase();

  // Internal protocols, extensions, or data URIs
  if (
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('blob:') ||
    lowerUrl.startsWith('chrome:') ||
    lowerUrl.startsWith('chrome-extension:') ||
    lowerUrl.startsWith('about:') ||
    lowerUrl.startsWith('javascript:')
  ) {
    return true;
  }

  // OPTIONS and HEAD preflight requests are not relevant for JMeter functional test journeys
  if (reqMethod === 'OPTIONS' || reqMethod === 'HEAD') {
    return true;
  }

  // 4xx error responses (404 missing static assets, 401/403 telemetry/polling)
  if (status && status >= 400 && status < 500) {
    return true;
  }

  // Non-functional static resource types (stylesheets, fonts, media, images, favicons, scripts)
  if (['image', 'font', 'stylesheet', 'media', 'script', 'texttrack', 'eventsource', 'websocket', 'manifest', 'other'].includes(lowerType)) {
    return true;
  }

  // Common static file extensions (checked against path ending before query string)
  if (/\.(?:png|jpe?g|gif|svg|webp|ico|bmp|woff2?|ttf|eot|otf|css|js|mjs|cjs|mp[34]|webm|ogg|wav|avif|cur|map|wasm|pdf|zip|txt)(?:[?#].*)?$/i.test(lowerUrl)) {
    return true;
  }

  // Favicon and icon paths
  if (/(?:favicon|apple-touch-icon|site\.webmanifest|browserconfig\.xml)/i.test(lowerUrl)) {
    return true;
  }

  // Filter requests to a different domain than the site being recorded (generic first-party domain check)
  if (targetSiteUrl && !isFirstPartyDomain(url, targetSiteUrl)) {
    return true;
  }

  // Filter requests that have no tied user interaction (unless initial landing navigation)
  if (hasUserInteraction === false) {
    return true;
  }

  // Telemetry/analytics/tracking requests — match path patterns case-insensitively for ANY domain
  const telemetryPatterns = [
    'monorail',
    'telemetry',
    'analytics',
    'collector',
    'metrics',
    'logs',
    'logging',
    'beacon',
    'otlp',
    '.well-known',
    'fec/produce',
    'produce_batch',
    'fec/',
    'trekkie',
    'datadog',
    'nr-data',
    'sentry',
    'inspectlet',
    'fullstory',
    'intercom',
    'segment',
    'mixpanel',
    'rum',
    'pixel'
  ];

  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();

    // Check pathname, hostname, and query string
    if (telemetryPatterns.some((pat) => pathname.includes(pat) || host.includes(pat) || search.includes(pat))) {
      return true;
    }

    if (/(?:^|\.)(?:collector|telemetry|track(?:ing|er)?|metrics|logs?|logging|stats|events?|beacon|pixel|rum|analytics|ingest|dd-rum|nr-data|sentry|monorail|otlp)\./i.test(host)) {
      return true;
    }
  } catch (e) {
    if (telemetryPatterns.some((pat) => lowerUrl.includes(pat))) {
      return true;
    }
  }

  // Third-party tracking, analytics, telemetry, advertising, error logging, and session replay domains
  const noiseDomains = [
    'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'analytics.google.com',
    'hotjar.com', 'mixpanel.com', 'segment.io', 'segment.com', 'facebook.net', 'connect.facebook.net',
    'clarity.ms', 'datadoghq.com', 'sentry.io', 'ads-twitter.com',
    'linkedin.com/px', 'criteo.com', 'adservice.google', 'amplitude.com',
    'newrelic.com', 'nr-data.net', 'scorecardresearch.com', 'quantserve.com',
    'optimizely.com', 'intercom.io', 'zendesk.com', 'crisp.chat',
    'hubspot.com', 'chartbeat.com', 'taboola.com', 'outbrain.com',
    'pingdom.net', 'fullstory.com', 'inspectlet.com', 'loggly.com',
    'bat.bing.com', 'tiktok.com', 'snapchat.com', 'pinterest.com',
    'branch.io', 'braze.com', 'adjust.com', 'appsflyer.com', 'onesignal.com',
    'shopify.com/monorail', 'monorail-edge.shopifysvc.com'
  ];
  if (noiseDomains.some((d) => lowerUrl.includes(d))) {
    return true;
  }

  // Internal dev tooling, HMR, and background telemetry endpoints
  if (
    lowerUrl.includes('__vite_ping') ||
    lowerUrl.includes('__webpack_hmr') ||
    lowerUrl.includes('browser-tools') ||
    /(?:^|\/)(?:collect(?:or)?|telemetry|track(?:ing|er)?|beacon|analytics|event-log|events?|metrics|rum|pixel|batch|heartbeat|ping|healthz?|healthcheck|livez|readyz|cdn-cgi\/(?:rum|challenge|telemetry)|log(?:ging)?|traces|datadog|nr-data|sentry|inspectlet|fullstory|intercom|segment|mixpanel|fec|produce)(?:[\/?&#]|$)/i.test(lowerUrl)
  ) {
    return true;
  }

  return false;
}

/**
 * Derive clean plain-English request label (never raw URL or path as the label).
 * E.g. 'Submit Login Credentials', 'Execute Search: "San Francisco"', 'Search Stations', 'Process Payment'.
 */
export function deriveRequestLabel(
  req: CapturedNetworkRequest,
  scenarioName: string,
  isPrimary: boolean
): string {
  if (!req) return 'HTTP Request';
  const sName = (scenarioName || '').trim();
  const lowerUrl = (req.url || '').toLowerCase();

  // 1. Primary Request
  if (isPrimary) {
    if (sName.toLowerCase().includes('login') || sName.toLowerCase().includes('sign in')) {
      return 'Submit Login Credentials';
    }
    if (sName.toLowerCase().includes('search') || sName.toLowerCase().includes('find')) {
      const qField = req.formFields?.find((f) =>
        ['q', 'search', 'query', 'keyword', 'term', 'destination', 'location', 'station'].includes(f.key.toLowerCase())
      );
      if (qField && qField.value) {
        return `Search: "${qField.value}"`;
      }
      return 'Execute Search Query';
    }
    if (sName.toLowerCase().includes('add to cart') || sName.toLowerCase().includes('cart')) {
      return 'Add Item to Cart';
    }
    if (sName.toLowerCase().includes('select hotel') || sName.toLowerCase().includes('select product') || sName.toLowerCase().includes('select')) {
      return 'Select Item';
    }
    if (sName.toLowerCase().includes('book') || sName.toLowerCase().includes('reserve')) {
      return 'Submit Booking Reservation';
    }
    if (sName.toLowerCase().includes('checkout')) {
      return 'Submit Checkout & Shipping';
    }
    if (sName.toLowerCase().includes('payment') || sName.toLowerCase().includes('pay')) {
      return 'Process Payment Transaction';
    }
    if (sName.toLowerCase().includes('register') || sName.toLowerCase().includes('sign up')) {
      return 'Submit User Registration';
    }
    if (sName.toLowerCase().includes('page load') || sName.toLowerCase().includes('landing')) {
      return 'Initial Page Load';
    }
    if (sName.toLowerCase().includes('apply filter') || sName.toLowerCase().includes('filter')) {
      return 'Apply Search Filter';
    }
    if (sName.toLowerCase().includes('station')) {
      return 'Search Stations';
    }
    if (sName.toLowerCase().includes('logout')) {
      return 'Submit Logout';
    }

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return `Submit ${sName}`;
    }
    return `Load ${sName}`;
  }

  // 2. Redirects and Follow-ups
  if (req.status && req.status >= 300 && req.status < 400) {
    return 'HTTP Redirect to Destination';
  }
  if (req.resourceType === 'document' || req.resourceType === 'navigation') {
    return 'Load Destination Page';
  }

  if (lowerUrl.includes('/account') || lowerUrl.includes('/profile') || lowerUrl.includes('/dashboard')) {
    return 'Load User Account';
  }
  if (lowerUrl.includes('/cart') || lowerUrl.includes('/basket')) {
    return 'Retrieve Updated Cart Contents';
  }
  if (lowerUrl.includes('/inventory') || lowerUrl.includes('/availability') || lowerUrl.includes('/rooms')) {
    return 'Verify Availability';
  }
  if (lowerUrl.includes('/facets') || lowerUrl.includes('/filters')) {
    return 'Fetch Search Filters & Facets';
  }
  if (lowerUrl.includes('/session') || lowerUrl.includes('/token') || lowerUrl.includes('/csrf')) {
    return 'Authenticate Session Token';
  }
  if (lowerUrl.includes('/config') || lowerUrl.includes('/settings')) {
    return 'Fetch App Configuration';
  }

  // Clean path endpoint fallback
  try {
    const parsed = new URL(req.url.startsWith('http') ? req.url : `https://${req.url}`);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      const last = parts[parts.length - 1].replace(/[-_.]/g, ' ');
      const clean = last.charAt(0).toUpperCase() + last.slice(1);
      return req.method === 'GET' ? `Fetch ${clean}` : `Submit ${clean}`;
    }
  } catch (e) {}

  return `${req.method} Request`;
}

export const WebRecordAndCapture: React.FC<WebRecordAndCaptureProps> = ({
  project,
  user,
  initialUrl,
  onUpdateProject
}) => {
  // Top Level Navigation: Active Recorder vs Saved Recordings Library
  const [activeTopTab, setActiveTopTab] = useState<'recorder' | 'saved_recordings'>('recorder');
  const [savedRecordingsList, setSavedRecordingsList] = useState<SavedWebRecording[]>(() =>
    getStoredRecordings(project?.performanceScripts)
  );
  const [savedSearchQuery, setSavedSearchQuery] = useState<string>('');

  // State 1: Before recording URL input
  const [targetUrl, setTargetUrl] = useState<string>(
    initialUrl && initialUrl !== 'https://' ? initialUrl : (project?.url || 'https://ecommerce-playground.lambdatest.io')
  );

  // Agent Connection Status & Bridge Extension Status
  const [agentStatus, setAgentStatus] = useState<'checking' | 'connected' | 'untrusted' | 'disconnected'>('checking');
  const [agentVersion, setAgentVersion] = useState<string | null>(null);
  const [agentProtocol, setAgentProtocol] = useState<'wss'>('wss');
  const [bridgeExtensionStatus, setBridgeExtensionStatus] = useState<'checking' | 'detected' | 'not_detected'>('checking');
  const [bridgeVersion, setBridgeVersion] = useState<string>('1.0.0');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showAgentInstallGuide, setShowAgentInstallGuide] = useState<boolean>(false);

  // Recording State (State 2: While Recording)
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isDemoSession, setIsDemoSession] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [liveRequests, setLiveRequests] = useState<CapturedNetworkRequest[]>([]);
  const [totalRequestCount, setTotalRequestCount] = useState<number>(0);
  const [totalActionCount, setTotalActionCount] = useState<number>(0);

  // Review Screen (State 3: After Stop, Before .jmx Generation)
  const [scenarios, setScenarios] = useState<ScenarioGroup[]>([]);
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);
  const [showRawPayloadMap, setShowRawPayloadMap] = useState<Record<string, boolean>>({});
  const [expandedSupportingMap, setExpandedSupportingMap] = useState<Record<string, boolean>>({});
  const [inReviewMode, setInReviewMode] = useState<boolean>(false);
  const [recordedSessionMeta, setRecordedSessionMeta] = useState<RecordedSessionMeta | null>(null);

  // Test Plan Configuration
  const [jmeterConfig, setJmeterConfig] = useState<JMeterTestPlanConfig>({
    numThreads: 10,
    rampTime: 5,
    loopCount: 1,
    domain: '',
    protocol: 'https',
    port: '443'
  });

  // State 4: After Generation
  const [generatedJmx, setGeneratedJmx] = useState<string | null>(null);
  const [generatedFilename, setGeneratedFilename] = useState<string>('');
  const [xmlValidationError, setXmlValidationError] = useState<string | null>(null);
  const [jmxValidationWarnings, setJmxValidationWarnings] = useState<JmxValidationWarning[]>([]);
  const [showValidationWarningModal, setShowValidationWarningModal] = useState<boolean>(false);
  const [copiedJmx, setCopiedJmx] = useState<boolean>(false);
  const [activeReviewTab, setActiveReviewTab] = useState<'scenarios' | 'jmx_preview'>('scenarios');

  // Save Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
  const [saveScriptName, setSaveScriptName] = useState<string>('');
  const [saveFolderId, setSaveFolderId] = useState<string>('');
  const [newFolderNameInput, setNewFolderNameInput] = useState<string>('');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // WebSocket & Synchronized Lifecycle Refs
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<any>(null);
  const simulationIntervalRef = useRef<any>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const isDemoSessionRef = useRef<boolean>(false);
  const liveRequestsRef = useRef<CapturedNetworkRequest[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const recordingTargetUrlRef = useRef<string>('');
  const elapsedSecondsRef = useRef<number>(0);
  const seenRequestIdsRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const landingQueryParamsRef = useRef<Set<string>>(new Set());
  const firstRequestIdRef = useRef<string | null>(null);
  const agentStatusRef = useRef<'checking' | 'connected' | 'untrusted' | 'disconnected'>(agentStatus);
  agentStatusRef.current = agentStatus;

  /**
   * Connect to local agent via the AutomatiQA Web Performance Agent Bridge Chrome extension or direct WSS
   * Architecture: AI Studio Web Performance UI -> Web Performance Extension -> wss://localhost:9334 -> Agent
   */
  const checkAgentConnection = async () => {
    setAgentStatus('checking');
    setBridgeExtensionStatus('checking');
    setConnectionError(null);

    // 1. Probe the dedicated Web Performance Agent Bridge Chrome extension
    try {
      const bridgeRes = await checkBridgeStatus(1200);
      if (bridgeRes.isInstalled) {
        setBridgeExtensionStatus('detected');
        if (bridgeRes.bridgeVersion) setBridgeVersion(bridgeRes.bridgeVersion);
        if (bridgeRes.agentStatus === 'connected') {
          setAgentStatus('connected');
          setAgentProtocol('wss');
          if (bridgeRes.agentVersion) setAgentVersion(bridgeRes.agentVersion);
          setConnectionError(null);
          return;
        } else if (bridgeRes.agentStatus === 'untrusted') {
          setAgentStatus('untrusted');
          setConnectionError(
            'Agent detected but self-signed certificate not trusted yet — visit https://localhost:9334/status in a new tab, click Proceed, then Retry Detection'
          );
          return;
        }
      } else {
        setBridgeExtensionStatus('not_detected');
      }
    } catch (e) {
      setBridgeExtensionStatus('not_detected');
    }

    // 2. Direct fallback probe to https://localhost:9334/status
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch('https://localhost:9334/status', {
        mode: 'cors',
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setAgentStatus('connected');
        setAgentProtocol('wss');
        if (data.version) {
          setAgentVersion(data.version);
        }
        setConnectionError(null);
        connectSecureWebSocket();
        return;
      } else {
        setAgentStatus('disconnected');
        setConnectionError(null);
      }
    } catch (err: any) {
      // Analyze error: check if it fails with a certificate/SSL error specifically
      const errName = String(err?.name || '');
      const errMessage = String(err?.message || '');
      const errCause = err?.cause ? String(err.cause?.message || err.cause) : '';
      const fullErrStr = `${errName} ${errMessage} ${errCause} ${String(err)}`.toLowerCase();

      const isCertError =
        errName === 'SecurityError' ||
        /cert|ssl|tls|authority|untrusted|sec_error|security|insecure|handshake|depth_zero|net::err_cert/i.test(fullErrStr);

      if (isCertError) {
        setAgentStatus('untrusted');
        setConnectionError(
          'Agent detected but not trusted yet — visit https://localhost:9334/status in a new tab, click Proceed, then Retry Detection'
        );
      } else {
        setAgentStatus('disconnected');
        setConnectionError(null);
      }
    }
  };

  /**
   * Connect secure WebSocket: wss://localhost:9334 exclusively
   */
  const connectSecureWebSocket = () => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket('wss://localhost:9334');

      ws.onopen = () => {
        wsRef.current = ws;
        setAgentProtocol('wss');
        setConnectionError(null);
        ws.send(JSON.stringify({ action: 'check_status' }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleAgentMessage(msg);
        } catch (e) {}
      };

      ws.onerror = (e) => {
        console.warn('[Agent WSS] WebSocket connection error:', e);
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      };
    } catch (e) {
      console.warn('[Agent WSS] Error initializing WebSocket:', e);
    }
  };

  /**
   * 1-Click SSL Certificate Authorization trigger
   */
  const handleAuthorizeSsl = () => {
    try {
      sendBridgeAuthorizeSsl();
    } catch (_) {}
    window.open('https://localhost:9334/status', '_blank');
    // Poll for reconnection after user authorizes
    setTimeout(checkAgentConnection, 1500);
    setTimeout(checkAgentConnection, 3500);
    setTimeout(checkAgentConnection, 6000);
  };

  useEffect(() => {
    checkAgentConnection();

    // Subscribe to Web Performance Extension Bridge message stream
    const unsubscribeBridge = subscribeToBridgeEvents((msg) => {
      if (msg.type === 'bridge_status' || msg.type === 'bridge_agent_status') {
        setBridgeExtensionStatus('detected');
        if (msg.bridgeVersion) setBridgeVersion(msg.bridgeVersion);
        if (msg.status === 'connected' || msg.agentStatus === 'connected') {
          setAgentStatus('connected');
          if (msg.version || msg.agentVersion) setAgentVersion(msg.version || msg.agentVersion);
        } else if (msg.status === 'untrusted' || msg.agentStatus === 'untrusted') {
          setAgentStatus('untrusted');
        } else if (msg.status === 'disconnected' || msg.agentStatus === 'disconnected') {
          setAgentStatus('disconnected');
        }
      }
      handleAgentMessage(msg);
    });

    // Auto-poll when untrusted or disconnected
    const pollInterval = setInterval(() => {
      if (agentStatusRef.current !== 'connected' && !isRecordingRef.current) {
        checkAgentConnection();
      }
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      unsubscribeBridge();
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
    };
  }, []);

  // Timer loop for recording (Max 45m = 2700s or 5,000 requests)
  useEffect(() => {
    if (isRecording) {
      setElapsedSeconds(0);
      elapsedSecondsRef.current = 0;
      isRecordingRef.current = true;
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          elapsedSecondsRef.current = next;
          if (next >= 2700) {
            // 45 minutes max reached
            handleStopRecording('Session reached maximum duration limit (45 minutes).');
          }
          return next;
        });
      }, 1000);
    } else {
      isRecordingRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Handle live incoming messages from agent
  const handleAgentMessage = (msg: any) => {
    // If running a simulated test-drive demo, strictly isolate from live agent packets
    if (isDemoSessionRef.current) {
      return;
    }

    switch (msg.type) {
      case 'agent_status':
        if (msg.version) setAgentVersion(msg.version);
        break;

      case 'recording_started':
        if (msg.sessionId) {
          setActiveSessionId(msg.sessionId);
          activeSessionIdRef.current = msg.sessionId;
        }
        if (msg.url) {
          recordingTargetUrlRef.current = msg.url;
        }
        setIsRecording(true);
        isRecordingRef.current = true;
        setIsDemoSession(false);
        isDemoSessionRef.current = false;
        setInReviewMode(false);
        setGeneratedJmx(null);
        setLiveRequests([]);
        liveRequestsRef.current = [];
        setTotalRequestCount(0);
        setTotalActionCount(0);
        break;

      case 'network_event':
        if (!isRecordingRef.current) return;
        // Verify session ID if agent provided it
        if (msg.sessionId && activeSessionIdRef.current && msg.sessionId !== activeSessionIdRef.current) {
          return;
        }
        if (msg.event === 'response' && msg.data) {
          const req = msg.data;
          // Apply non-functional noise filter
          if (!isNoiseRequest(req.url, req.resourceType, req.method)) {
            const enriched = enrichCapturedRequest(req);
            const dedupeKey = `${enriched.method}|${enriched.url}|${Math.floor(enriched.timestamp / 500)}`;
            if (seenRequestIdsRef.current.has(enriched.id) || seenRequestIdsRef.current.has(dedupeKey)) {
              return;
            }
            seenRequestIdsRef.current.add(enriched.id);
            seenRequestIdsRef.current.add(dedupeKey);

            setLiveRequests((prev) => {
              if (prev.length >= 5000) {
                handleStopRecording('Session reached maximum request limit (5,000 requests).');
                return prev;
              }
              const updated = [enriched, ...prev];
              liveRequestsRef.current = updated;
              return updated;
            });
          }
        }
        if (typeof msg.totalRequestsCaptured === 'number') {
          setTotalRequestCount(msg.totalRequestsCaptured);
        }
        break;

      case 'user_action':
        if (!isRecordingRef.current) return;
        if (msg.sessionId && activeSessionIdRef.current && msg.sessionId !== activeSessionIdRef.current) {
          return;
        }
        if (typeof msg.totalActionsCaptured === 'number') {
          setTotalActionCount(msg.totalActionsCaptured);
        }
        break;

      case 'recording_complete':
        // Session ID validation check: reject/ignore incoming data that does not match expected session ID
        if (msg.sessionId && activeSessionIdRef.current && msg.sessionId !== activeSessionIdRef.current) {
          console.warn(
            `[WebRecordAndCapture] Ignored recording_complete for mismatched sessionId: "${msg.sessionId}" (active expected: "${activeSessionIdRef.current}")`
          );
          return;
        }

        setIsRecording(false);
        isRecordingRef.current = false;

        // Collect and enrich actual captured responses if live stream missed any
        let candidateRequests: CapturedNetworkRequest[] = liveRequestsRef.current;
        if (candidateRequests.length === 0 && msg.responses && Array.isArray(msg.responses) && msg.responses.length > 0) {
          candidateRequests = msg.responses
            .filter((r: any) => !isNoiseRequest(r.url, r.resourceType))
            .map((r: any) => enrichCapturedRequest(r));
          setLiveRequests(candidateRequests);
          liveRequestsRef.current = candidateRequests;
        }

        const finalSessionId = msg.sessionId || activeSessionIdRef.current || `rec_${Date.now()}`;
        const finalUrl = msg.targetUrl || recordingTargetUrlRef.current || targetUrl;
        const finalDuration = Math.round((msg.durationMs ? msg.durationMs / 1000 : elapsedSecondsRef.current) || 0);

        setRecordedSessionMeta({
          sessionId: finalSessionId,
          targetUrl: finalUrl,
          timestamp: Date.now(),
          formattedDate: new Date().toLocaleString(),
          durationSeconds: finalDuration,
          isDemo: false,
          requestCount: (msg.summary && typeof msg.summary.totalResponses === 'number') ? msg.summary.totalResponses : (candidateRequests.length || totalRequestCount),
          actionCount: (msg.summary && typeof msg.summary.totalActions === 'number') ? msg.summary.totalActions : totalActionCount
        });

        if (msg.scenarios && Array.isArray(msg.scenarios) && msg.scenarios.length > 0) {
          setScenarios(msg.scenarios);
          setInReviewMode(true);
        } else {
          // Process collected live requests into scenarios without demo fallback
          processRequestsIntoScenarios(candidateRequests);
        }
        break;

      case 'recording_error':
      case 'AGENT_ERROR':
        setIsRecording(false);
        isRecordingRef.current = false;
        setConnectionError(msg.message || msg.error || 'Recording error encountered from agent');
        break;

      default:
        break;
    }
  };

  /**
   * Enrich raw captured request with readable form fields, sensitive field masking,
   * correlation detection, and payment gateway inspection
   */
  const enrichCapturedRequest = (raw: any): CapturedNetworkRequest => {
    let parsedFields: CapturedFormField[] = [];

    // Pre-seed from already extracted form fields if available from agent or prior step
    if (raw.formFields && Array.isArray(raw.formFields) && raw.formFields.length > 0) {
      raw.formFields.forEach((f: any) => {
        if (f && f.key && !parsedFields.some((existing) => existing.key.toLowerCase() === f.key.toLowerCase())) {
          const isSensitive = f.isSensitive !== undefined ? !!f.isSensitive : SENSITIVE_FIELD_REGEX.test(f.key);
          parsedFields.push({
            key: f.key,
            value: String(f.value !== undefined && f.value !== null ? f.value : ''),
            isSensitive,
            action: f.action || (isSensitive ? 'parameterize' : 'hardcode'),
            revealed: !!f.revealed
          });
        }
      });
    }

    // Detect if this is the first landing request of the session (initial external referral / page load)
    const hasExplicitInput =
      !!raw.postData ||
      !!raw.actionFormData ||
      (raw.formFields && raw.formFields.length > 0) ||
      /[?&](q|search|query|keyword|term)=/i.test(raw.url || '');

    const isLanding =
      raw.isLandingRequest ||
      (firstRequestIdRef.current === null && (!raw.method || raw.method === 'GET') && !hasExplicitInput) ||
      (firstRequestIdRef.current === raw.id && !hasExplicitInput);

    if (firstRequestIdRef.current === null && raw.id) {
      firstRequestIdRef.current = raw.id;
    }

    // Populate landingQueryParamsRef if landing request
    if (isLanding) {
      try {
        const u = new URL(raw.url.startsWith('http') ? raw.url : `https://${raw.url}`);
        u.searchParams.forEach((_, key) => {
          landingQueryParamsRef.current.add(key.toLowerCase());
        });
      } catch (e) {}
    }

    // Extract user data from DOM actions, request body payloads, or user search queries
    if (!isLanding || hasExplicitInput) {
      // A. Primary & Authoritative Source: DOM Form Elements observed by agent (actionFormData)
      const domFormData = raw.actionFormData || raw.formData;
      if (domFormData && typeof domFormData === 'object') {
        Object.entries(domFormData).forEach(([key, val]) => {
          const cleanKey = key.trim();
          if (!cleanKey) return;
          if (NON_USER_PARAM_REGEX.test(cleanKey)) return;
          if (landingQueryParamsRef.current.has(cleanKey.toLowerCase()) && !SENSITIVE_FIELD_REGEX.test(cleanKey)) return;

          const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val !== undefined && val !== null ? val : '');
          const isSensitive = SENSITIVE_FIELD_REGEX.test(cleanKey);
          if (!parsedFields.some((f) => f.key.toLowerCase() === cleanKey.toLowerCase())) {
            parsedFields.push({
              key: cleanKey,
              value: strVal,
              isSensitive,
              action: isSensitive ? 'parameterize' : 'hardcode',
              revealed: false
            });
          }
        });
      }

      // B. Request body payload (JSON, multipart/form-data, application/x-www-form-urlencoded)
      const rawPost = raw.postData || raw.body || raw.data;
      if (rawPost && ['POST', 'PUT', 'PATCH', 'DELETE'].includes((raw.method || 'GET').toUpperCase())) {
        let bodyStr = '';
        if (typeof rawPost === 'object') {
          try {
            bodyStr = JSON.stringify(rawPost);
          } catch (e) {
            bodyStr = String(rawPost);
          }
        } else {
          bodyStr = String(rawPost);
        }

        const trimmed = bodyStr.trim();

        // Case A: JSON Body
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            const json = JSON.parse(trimmed);
            if (typeof json === 'object' && json !== null) {
              const flattenObject = (obj: Record<string, any>, prefix = '') => {
                Object.entries(obj).forEach(([k, v]) => {
                  const fullKey = prefix ? `${prefix}.${k}` : k;
                  if (NON_USER_PARAM_REGEX.test(fullKey) || NON_USER_PARAM_REGEX.test(k)) return;

                  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                    flattenObject(v, fullKey);
                  } else if (Array.isArray(v)) {
                    v.forEach((item, idx) => {
                      if (item !== null && typeof item === 'object') {
                        flattenObject(item, `${fullKey}[${idx}]`);
                      } else {
                        const valStr = String(item !== undefined && item !== null ? item : '');
                        const isSensitive = SENSITIVE_FIELD_REGEX.test(fullKey);
                        if (!parsedFields.some((f) => f.key.toLowerCase() === `${fullKey}[${idx}]`.toLowerCase())) {
                          parsedFields.push({
                            key: `${fullKey}[${idx}]`,
                            value: valStr,
                            isSensitive,
                            action: isSensitive ? 'parameterize' : 'hardcode',
                            revealed: false
                          });
                        }
                      }
                    });
                  } else {
                    const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v !== undefined && v !== null ? v : '');
                    const isSensitive = SENSITIVE_FIELD_REGEX.test(fullKey) || SENSITIVE_FIELD_REGEX.test(k);
                    if (!parsedFields.some((f) => f.key.toLowerCase() === fullKey.toLowerCase())) {
                      parsedFields.push({
                        key: fullKey,
                        value: valStr,
                        isSensitive,
                        action: isSensitive ? 'parameterize' : 'hardcode',
                        revealed: false
                      });
                    }
                  }
                });
              };
              flattenObject(json);
            }
          } catch (e) {}
        } else if (trimmed.includes('Content-Disposition') || trimmed.includes('form-data;')) {
          // Case B: multipart/form-data
          const parts = trimmed.split(/--+[a-zA-Z0-9_\-]+/);
          parts.forEach((part) => {
            if (!part.trim()) return;
            const nameMatch = part.match(/name=["']?([^"';\r\n]+)["']?/i);
            const filenameMatch = part.match(/filename=["']?([^"';\r\n]+)["']?/i);
            if (nameMatch && nameMatch[1]) {
              const fieldName = nameMatch[1].trim();
              if (NON_USER_PARAM_REGEX.test(fieldName)) return;

              if (filenameMatch && filenameMatch[1]) {
                if (!parsedFields.some((f) => f.key.toLowerCase() === fieldName.toLowerCase())) {
                  parsedFields.push({
                    key: fieldName,
                    value: `[File: ${filenameMatch[1]}]`,
                    isSensitive: false,
                    action: 'hardcode',
                    revealed: false
                  });
                }
              } else {
                const headerEndIndex = part.indexOf('\r\n\r\n');
                let val = '';
                if (headerEndIndex !== -1) {
                  val = part.slice(headerEndIndex + 4);
                } else {
                  const lfIndex = part.indexOf('\n\n');
                  if (lfIndex !== -1) {
                    val = part.slice(lfIndex + 2);
                  }
                }
                val = val.replace(/[\r\n\-]+$/, '').trim();
                const isSensitive = SENSITIVE_FIELD_REGEX.test(fieldName);
                if (!parsedFields.some((f) => f.key.toLowerCase() === fieldName.toLowerCase())) {
                  parsedFields.push({
                    key: fieldName,
                    value: val,
                    isSensitive,
                    action: isSensitive ? 'parameterize' : 'hardcode',
                    revealed: false
                  });
                }
              }
            }
          });
        } else if (trimmed.includes('=') && !trimmed.startsWith('<')) {
          // Case C: application/x-www-form-urlencoded
          const pairs = trimmed.split('&');
          pairs.forEach((p) => {
            const eqIdx = p.indexOf('=');
            if (eqIdx !== -1) {
              const k = p.substring(0, eqIdx).trim();
              const v = p.substring(eqIdx + 1);
              if (k) {
                let decodedK = k;
                let decodedV = v;
                try {
                  decodedK = decodeURIComponent(k.replace(/\+/g, ' '));
                  decodedV = decodeURIComponent(v.replace(/\+/g, ' '));
                } catch (e) {}

                if (NON_USER_PARAM_REGEX.test(decodedK)) return;

                const isSensitive = SENSITIVE_FIELD_REGEX.test(decodedK);
                if (!parsedFields.some((f) => f.key.toLowerCase() === decodedK.toLowerCase())) {
                  parsedFields.push({
                    key: decodedK,
                    value: decodedV,
                    isSensitive,
                    action: isSensitive ? 'parameterize' : 'hardcode',
                    revealed: false
                  });
                }
              }
            }
          });
        }
      }

      // C. Inspect URL query params for non-landing requests or explicit search inputs
      try {
        const parsedUrl = new URL(raw.url.startsWith('http') ? raw.url : `https://${raw.url}`);
        parsedUrl.searchParams.forEach((val, key) => {
          const cleanKey = key.trim();
          if (!cleanKey) return;
          if (NON_USER_PARAM_REGEX.test(cleanKey)) return;
          if (landingQueryParamsRef.current.has(cleanKey.toLowerCase()) && !['q', 'search', 'query', 'keyword', 'term'].includes(cleanKey.toLowerCase())) return;

          // Only include if it corresponds to an actual DOM input field or user search parameter
          const isUserParam =
            ['q', 'search', 'query', 'keyword', 'term', 'destination', 'location', 'filter', 'page', 'category_id', 'product_id'].includes(cleanKey.toLowerCase()) ||
            (raw.actionFormData && raw.actionFormData[cleanKey] !== undefined) ||
            parsedFields.some((f) => f.key.toLowerCase() === cleanKey.toLowerCase());

          if (isUserParam && !parsedFields.some((f) => f.key.toLowerCase() === cleanKey.toLowerCase())) {
            const isSensitive = SENSITIVE_FIELD_REGEX.test(cleanKey);
            parsedFields.push({
              key: cleanKey,
              value: val,
              isSensitive,
              action: isSensitive ? 'parameterize' : 'hardcode',
              revealed: false
            });
          }
        });
      } catch (e) {}
    }

    // 3. Payment Gateway Detection
    let isPayment = false;
    let paymentName = '';
    const lowerUrl = (raw.url || '').toLowerCase();
    for (const pg of PAYMENT_DOMAINS) {
      if (lowerUrl.includes(pg.match)) {
        isPayment = true;
        paymentName = pg.name;
        break;
      }
    }

    // 4. Dynamic correlation detection heuristics (tokens, session IDs)
    let correlation = null;
    if (lowerUrl.includes('/cart') || lowerUrl.includes('/checkout') || lowerUrl.includes('/orders') || lowerUrl.includes('/dashboard')) {
      correlation = {
        sourceScenario: 'Authentication / Initial Session',
        sourceField: 'authToken',
        targetField: 'Authorization / token',
        variableName: 'authToken'
      };
    }

    let rawPost = raw.postData || raw.body || raw.data;
    if (!rawPost && ['POST', 'PUT', 'PATCH'].includes((raw.method || 'GET').toUpperCase()) && parsedFields.length > 0) {
      const obj: Record<string, string> = {};
      parsedFields.forEach((f) => {
        obj[f.key] = f.value;
      });
      rawPost = JSON.stringify(obj, null, 2);
    }

    const rawBodyFormatted = typeof rawPost === 'object' ? JSON.stringify(rawPost, null, 2) : (rawPost ? String(rawPost) : undefined);

    return {
      id: raw.id || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      url: raw.url,
      method: (raw.method || 'GET').toUpperCase(),
      status: raw.status || 200,
      responseTimeMs: raw.responseTimeMs || Math.floor(Math.random() * 180 + 40),
      resourceType: raw.resourceType || 'fetch',
      actionId: raw.actionId,
      actionIntent: raw.actionIntent,
      actionFormData: raw.actionFormData,
      scenarioId: raw.scenarioId,
      timestamp: raw.timestamp || Date.now(),
      headers: raw.headers || {},
      formFields: parsedFields,
      rawBody: rawBodyFormatted,
      isPaymentGateway: isPayment,
      paymentGatewayName: paymentName,
      correlatedDynamicValue: correlation
    };
  };

  /**
   * Helper: Identify the SINGLE primary request that actually performs the action's backend work
   * (e.g. the POST submitting login credentials, the GET/POST executing search, the POST selecting hotel, the POST booking, the POST processing payment).
   */
  const identifyPrimaryRequest = (
    requests: CapturedNetworkRequest[],
    actionIntent?: string
  ): { primary: CapturedNetworkRequest; supporting: CapturedNetworkRequest[] } => {
    if (!requests || requests.length === 0) {
      throw new Error('Cannot identify primary request of empty cluster');
    }
    if (requests.length === 1) {
      return { primary: requests[0], supporting: [] };
    }

    const isAuth = (r: CapturedNetworkRequest) => {
      const keys = (r.formFields || []).map((f) => f.key.toLowerCase()).join(' ');
      const u = r.url.toLowerCase();
      return (
        keys.includes('password') ||
        keys.includes('passwd') ||
        keys.includes('pwd') ||
        u.includes('/login') ||
        u.includes('/auth') ||
        u.includes('/signin') ||
        u.includes('account/login') ||
        u.includes('api/v1/auth') ||
        u.includes('api/auth')
      );
    };

    const isSearch = (r: CapturedNetworkRequest) => {
      const keys = (r.formFields || []).map((f) => f.key.toLowerCase()).join(' ');
      const u = r.url.toLowerCase();
      return (
        keys.includes('search') ||
        keys.includes('query') ||
        keys.includes('keyword') ||
        keys.includes('destination') ||
        keys.includes('location') ||
        keys.includes('checkin') ||
        keys.split(' ').includes('q') ||
        u.includes('/search') ||
        u.includes('route=product/search') ||
        u.includes('hotels/search') ||
        u.includes('api/v1/hotels/search') ||
        u.includes('?q=') ||
        u.includes('&q=') ||
        u.includes('?search=') ||
        u.includes('&search=')
      );
    };

    const isSelectHotelOrItem = (r: CapturedNetworkRequest) => {
      const keys = (r.formFields || []).map((f) => f.key.toLowerCase()).join(' ');
      const u = r.url.toLowerCase();
      return (
        keys.includes('select_hotel') ||
        keys.includes('radiobutton') ||
        keys.includes('hotel_id') ||
        keys.includes('room_id') ||
        keys.includes('selected_hotel') ||
        keys.includes('item_id') ||
        keys.includes('product_id') ||
        u.includes('select_hotel') ||
        u.includes('/hotels/select') ||
        u.includes('api/v1/hotels/select') ||
        u.includes('/hotel/') ||
        u.includes('/rooms/') ||
        u.includes('/product/') ||
        u.includes('/item/') ||
        u.includes('/detail')
      );
    };

    const isBooking = (r: CapturedNetworkRequest) => {
      const keys = (r.formFields || []).map((f) => f.key.toLowerCase()).join(' ');
      const u = r.url.toLowerCase();
      return (
        keys.includes('book_hotel') ||
        keys.includes('booking') ||
        keys.includes('reserve') ||
        keys.includes('num_rooms') ||
        keys.includes('room_type') ||
        keys.includes('first_name') ||
        keys.includes('guest_name') ||
        u.includes('book_hotel') ||
        u.includes('/booking') ||
        u.includes('/bookings') ||
        u.includes('api/v1/bookings') ||
        u.includes('/reserve') ||
        u.includes('/reservation')
      );
    };

    const isPayment = (r: CapturedNetworkRequest) => {
      const keys = (r.formFields || []).map((f) => f.key.toLowerCase()).join(' ');
      const u = r.url.toLowerCase();
      return (
        !!r.isPaymentGateway ||
        keys.includes('card_num') ||
        keys.includes('card_number') ||
        keys.includes('cvv') ||
        keys.includes('cvc') ||
        keys.includes('exp_month') ||
        keys.includes('payment_method') ||
        keys.includes('stripe') ||
        keys.includes('amount') ||
        u.includes('/payment') ||
        u.includes('/pay') ||
        u.includes('/charge') ||
        u.includes('/confirm') ||
        u.includes('api/v1/payments') ||
        u.includes('stripe.com') ||
        u.includes('paypal.com')
      );
    };

    const isCart = (r: CapturedNetworkRequest) => {
      const keys = (r.formFields || []).map((f) => f.key.toLowerCase()).join(' ');
      const u = r.url.toLowerCase();
      return (
        keys.includes('cart') ||
        keys.includes('product_id') ||
        keys.includes('quantity') ||
        u.includes('/cart') ||
        u.includes('checkout/cart/add') ||
        u.includes('/cart/add')
      );
    };

    const isCheckout = (r: CapturedNetworkRequest) => {
      const keys = (r.formFields || []).map((f) => f.key.toLowerCase()).join(' ');
      const u = r.url.toLowerCase();
      return (
        keys.includes('checkout') ||
        keys.includes('shipping') ||
        keys.includes('billing') ||
        u.includes('/checkout') ||
        u.includes('/shipping-address')
      );
    };

    const isRegister = (r: CapturedNetworkRequest) => {
      const keys = (r.formFields || []).map((f) => f.key.toLowerCase()).join(' ');
      const u = r.url.toLowerCase();
      return (
        keys.includes('confirm_password') ||
        keys.includes('confirmpassword') ||
        keys.includes('signup') ||
        keys.includes('register') ||
        u.includes('/register') ||
        u.includes('/signup') ||
        u.includes('account/register')
      );
    };

    // 1. Explicit Action Intent prioritization
    const effectiveIntent = (actionIntent || requests.find((r) => r.actionIntent)?.actionIntent || '').toLowerCase();

    if (effectiveIntent.includes('register') || effectiveIntent.includes('sign up')) {
      const reg =
        requests.find((r) => ['POST', 'PUT'].includes(r.method) && isRegister(r)) ||
        requests.find((r) => ['POST', 'PUT'].includes(r.method)) ||
        requests.find(isRegister);
      if (reg) return { primary: reg, supporting: requests.filter((r) => r.id !== reg.id) };
    }

    if (effectiveIntent.includes('login') || effectiveIntent.includes('sign in') || effectiveIntent.includes('log in')) {
      const auth =
        requests.find((r) => ['POST', 'PUT'].includes(r.method) && isAuth(r)) ||
        requests.find((r) => ['POST', 'PUT'].includes(r.method)) ||
        requests.find(isAuth);
      if (auth) return { primary: auth, supporting: requests.filter((r) => r.id !== auth.id) };
    }

    if (effectiveIntent.includes('search') || effectiveIntent.includes('find')) {
      const srch =
        requests.find(isSearch) ||
        requests.find((r) => r.url.toLowerCase().includes('search')) ||
        requests.find((r) => r.method === 'GET' && r.url.includes('?'));
      if (srch) return { primary: srch, supporting: requests.filter((r) => r.id !== srch.id) };
    }

    if (effectiveIntent.includes('select') || effectiveIntent.includes('choose')) {
      const sel =
        requests.find((r) => ['POST', 'PUT'].includes(r.method) && isSelectHotelOrItem(r)) ||
        requests.find(isSelectHotelOrItem) ||
        requests.find((r) => ['POST', 'PUT'].includes(r.method));
      if (sel) return { primary: sel, supporting: requests.filter((r) => r.id !== sel.id) };
    }

    if (effectiveIntent.includes('book') || effectiveIntent.includes('reserve')) {
      const bk =
        requests.find((r) => ['POST', 'PUT'].includes(r.method) && isBooking(r)) ||
        requests.find((r) => ['POST', 'PUT'].includes(r.method)) ||
        requests.find(isBooking);
      if (bk) return { primary: bk, supporting: requests.filter((r) => r.id !== bk.id) };
    }

    if (
      effectiveIntent.includes('pay') ||
      effectiveIntent.includes('payment') ||
      effectiveIntent.includes('order') ||
      effectiveIntent.includes('confirm')
    ) {
      const pay =
        requests.find((r) => ['POST', 'PUT'].includes(r.method) && isPayment(r)) ||
        requests.find(isPayment) ||
        requests.find((r) => ['POST', 'PUT'].includes(r.method));
      if (pay) return { primary: pay, supporting: requests.filter((r) => r.id !== pay.id) };
    }

    if (effectiveIntent.includes('cart') || effectiveIntent.includes('basket')) {
      const crt =
        requests.find((r) => ['POST', 'PUT'].includes(r.method) && isCart(r)) ||
        requests.find((r) => ['POST', 'PUT'].includes(r.method)) ||
        requests.find(isCart);
      if (crt) return { primary: crt, supporting: requests.filter((r) => r.id !== crt.id) };
    }

    if (effectiveIntent.includes('checkout')) {
      const chk =
        requests.find((r) => ['POST', 'PUT'].includes(r.method) && isCheckout(r)) ||
        requests.find((r) => ['POST', 'PUT'].includes(r.method)) ||
        requests.find(isCheckout);
      if (chk) return { primary: chk, supporting: requests.filter((r) => r.id !== chk.id) };
    }

    // 2. Generic payload & method prioritization
    // Mutating request carrying form data / payload is the primary backend worker
    const mutatingWithPayload = requests.find(
      (r) => ['POST', 'PUT', 'PATCH'].includes(r.method) && ((r.formFields && r.formFields.length > 0) || r.rawBody)
    );
    if (mutatingWithPayload) {
      return { primary: mutatingWithPayload, supporting: requests.filter((r) => r.id !== mutatingWithPayload.id) };
    }

    // Any mutating request
    const mutatingReq = requests.find((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    if (mutatingReq) {
      return { primary: mutatingReq, supporting: requests.filter((r) => r.id !== mutatingReq.id) };
    }

    // Search query request
    const srchReq = requests.find(isSearch);
    if (srchReq) {
      return { primary: srchReq, supporting: requests.filter((r) => r.id !== srchReq.id) };
    }

    // Document navigation
    const docReq = requests.find((r) => r.resourceType === 'document' || r.resourceType === 'navigation');
    if (docReq) {
      return { primary: docReq, supporting: requests.filter((r) => r.id !== docReq.id) };
    }

    // Default to the first request in the cluster
    return { primary: requests[0], supporting: requests.slice(1) };
  };

  /**
   * Helper: Derive clean human-readable name based strictly on ACTION type
   * (e.g. Login, Search, Select Hotel, Book, Payment, Add to Cart, Checkout, Apply Filter, Page Load).
   * NEVER names like "Request 1", "POST /api/xyz", or "Scenario 3".
   */
  const deriveHumanScenarioName = (
    primaryReq: CapturedNetworkRequest,
    allRequests: CapturedNetworkRequest[],
    clusterIndex: number
  ): { name: string; actionType: ScenarioGroup['actionType'] } => {
    // 0. Cluster 1 is always the Landing Page / Page Load step unless it is an explicit mutating submit
    const hasMutating = allRequests.some((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    if (clusterIndex === 1 && !hasMutating && (!primaryReq.formFields || primaryReq.formFields.length === 0)) {
      return { name: 'Page Load', actionType: 'navigation' };
    }

    // 1. Check explicit actionIntent if captured from agent interaction
    const actionIntent = primaryReq.actionIntent || allRequests.find((r) => r.actionIntent)?.actionIntent;
    if (
      actionIntent &&
      actionIntent !== 'User Action' &&
      actionIntent !== 'Submit Form' &&
      actionIntent !== 'Page Navigation'
    ) {
      const actType: ScenarioGroup['actionType'] = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(primaryReq.method)
        ? 'submit'
        : 'click';
      return { name: actionIntent, actionType: actType };
    }

    // Inspect fields from primary request or any request in cluster
    const fields = primaryReq.formFields || [];
    const allFields = allRequests.flatMap((r) => r.formFields || []);
    const fieldKeyStr = (fields.length > 0 ? fields : allFields).map((f) => f.key.toLowerCase()).join(' ');
    const primaryUrl = primaryReq.url.toLowerCase();

    // 2. Logout
    if (primaryUrl.includes('/logout') || primaryUrl.includes('/signout') || fieldKeyStr.includes('logout')) {
      return { name: 'Logout', actionType: 'click' };
    }

    // 3. User Registration / Sign Up
    if (
      fieldKeyStr.includes('confirm_password') ||
      fieldKeyStr.includes('confirmpassword') ||
      fieldKeyStr.includes('register') ||
      fieldKeyStr.includes('signup') ||
      primaryUrl.includes('/register') ||
      primaryUrl.includes('/signup') ||
      primaryUrl.includes('account/register')
    ) {
      return { name: 'Register', actionType: 'submit' };
    }

    // 4. Login
    if (
      fieldKeyStr.includes('password') ||
      fieldKeyStr.includes('passwd') ||
      fieldKeyStr.includes('pwd') ||
      primaryUrl.includes('/login') ||
      primaryUrl.includes('/auth') ||
      primaryUrl.includes('/signin') ||
      primaryUrl.includes('account/login')
    ) {
      return { name: 'Login', actionType: 'submit' };
    }

    // 5. Change Password / Profile
    if (
      fieldKeyStr.includes('old_password') ||
      fieldKeyStr.includes('new_password') ||
      primaryUrl.includes('password')
    ) {
      return { name: 'Change Password', actionType: 'submit' };
    }
    if (fieldKeyStr.includes('profile') || primaryUrl.includes('/profile')) {
      return { name: 'Profile Update', actionType: 'submit' };
    }

    // 6. Payment & Order Confirmation
    if (
      primaryReq.isPaymentGateway ||
      fieldKeyStr.includes('card_num') ||
      fieldKeyStr.includes('card_number') ||
      fieldKeyStr.includes('cvv') ||
      fieldKeyStr.includes('cvc') ||
      fieldKeyStr.includes('exp_month') ||
      fieldKeyStr.includes('stripe') ||
      fieldKeyStr.includes('amount') ||
      primaryUrl.includes('/payment') ||
      primaryUrl.includes('/pay') ||
      primaryUrl.includes('/charge') ||
      primaryUrl.includes('stripe.com') ||
      primaryUrl.includes('paypal.com')
    ) {
      return { name: 'Payment', actionType: 'submit' };
    }

    // 7. Hotel & Travel / Selection vs Booking vs Search
    if (
      fieldKeyStr.includes('hotel') ||
      fieldKeyStr.includes('location') ||
      fieldKeyStr.includes('destination') ||
      fieldKeyStr.includes('room') ||
      primaryUrl.includes('hotel')
    ) {
      if (
        fieldKeyStr.includes('book_hotel') ||
        fieldKeyStr.includes('booking') ||
        fieldKeyStr.includes('reserve') ||
        fieldKeyStr.includes('first_name') ||
        fieldKeyStr.includes('room_type') ||
        primaryUrl.includes('book_hotel') ||
        primaryUrl.includes('/booking') ||
        primaryUrl.includes('/reserve')
      ) {
        return { name: 'Book', actionType: 'submit' };
      }
      if (
        fieldKeyStr.includes('radiobutton') ||
        fieldKeyStr.includes('select_hotel') ||
        primaryUrl.includes('select_hotel') ||
        primaryUrl.includes('hotels/select')
      ) {
        return { name: 'Select Hotel', actionType: 'click' };
      }
      if (
        fieldKeyStr.includes('checkin') ||
        fieldKeyStr.includes('checkout') ||
        fieldKeyStr.includes('destination') ||
        fieldKeyStr.includes('location') ||
        fieldKeyStr.includes('date')
      ) {
        return { name: 'Search', actionType: 'submit' };
      }
    }

    // 8. General Booking / Reservation
    if (
      fieldKeyStr.includes('booking') ||
      fieldKeyStr.includes('reserve') ||
      primaryUrl.includes('/booking') ||
      primaryUrl.includes('/reserve') ||
      primaryUrl.includes('/reservation')
    ) {
      return { name: 'Book', actionType: 'submit' };
    }

    // 9. Search
    if (
      fieldKeyStr.includes('search') ||
      fieldKeyStr.includes('query') ||
      fieldKeyStr.includes('keyword') ||
      fieldKeyStr.split(' ').includes('q') ||
      primaryUrl.includes('/search') ||
      primaryUrl.includes('route=product/search') ||
      primaryUrl.includes('?q=') ||
      primaryUrl.includes('&q=') ||
      primaryUrl.includes('?search=') ||
      primaryUrl.includes('&search=')
    ) {
      return { name: 'Search', actionType: 'submit' };
    }

    // 10. Add to Cart
    if (
      fieldKeyStr.includes('cart') ||
      fieldKeyStr.includes('basket') ||
      fieldKeyStr.includes('product_id') ||
      primaryUrl.includes('/cart/add') ||
      primaryUrl.includes('checkout/cart/add')
    ) {
      return { name: 'Add to Cart', actionType: 'click' };
    }

    // 11. Checkout & Shipping
    if (
      fieldKeyStr.includes('checkout') ||
      fieldKeyStr.includes('shipping') ||
      fieldKeyStr.includes('billing') ||
      primaryUrl.includes('/checkout') ||
      primaryUrl.includes('/shipping-address')
    ) {
      if (fieldKeyStr.includes('confirm') || primaryUrl.includes('/confirm')) {
        return { name: 'Confirm Order', actionType: 'submit' };
      }
      return { name: 'Checkout', actionType: 'submit' };
    }

    // 12. Filter & Sorting
    if (
      fieldKeyStr.includes('filter') ||
      fieldKeyStr.includes('sort') ||
      primaryUrl.includes('filter') ||
      primaryUrl.includes('sort=')
    ) {
      return { name: 'Apply Filter', actionType: 'click' };
    }

    // 13. Select Product / Item
    if (
      primaryUrl.includes('/product/') ||
      primaryUrl.includes('/item/') ||
      primaryUrl.includes('/detail') ||
      primaryUrl.includes('/view/')
    ) {
      return { name: 'Select Product', actionType: 'click' };
    }

    // 14. Delete / Remove
    if (primaryReq.method === 'DELETE' || primaryUrl.includes('/delete') || fieldKeyStr.includes('delete')) {
      return { name: 'Delete', actionType: 'click' };
    }

    // 15. Standard Action Fallbacks — NEVER 'Submit Form' or 'Scenario N'
    if (['POST', 'PUT', 'PATCH'].includes(primaryReq.method)) {
      try {
        const parsed = new URL(primaryReq.url.startsWith('http') ? primaryReq.url : `https://${primaryReq.url}`);
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
          const last = parts[parts.length - 1].replace(/[-_.]/g, ' ');
          if (last.toLowerCase().includes('station')) return { name: 'Search Stations', actionType: 'submit' };
          if (last.toLowerCase().includes('inquir')) return { name: 'Submit Inquiry', actionType: 'submit' };
          if (last.toLowerCase().includes('feedback')) return { name: 'Submit Feedback', actionType: 'submit' };
          if (last.toLowerCase().includes('comment')) return { name: 'Post Comment', actionType: 'submit' };
          if (last.toLowerCase().includes('order')) return { name: 'Place Order', actionType: 'submit' };
          const clean = last.charAt(0).toUpperCase() + last.slice(1);
          return { name: `Submit ${clean}`, actionType: 'submit' };
        }
      } catch (e) {}
      return { name: 'Perform Action', actionType: 'submit' };
    }

    if (clusterIndex === 1) {
      return { name: 'Page Load', actionType: 'navigation' };
    }

    try {
      const parsed = new URL(primaryReq.url.startsWith('http') ? primaryReq.url : `https://${primaryReq.url}`);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        const last = parts[parts.length - 1].replace(/[-_.]/g, ' ');
        const clean = last.charAt(0).toUpperCase() + last.slice(1);
        return { name: `View ${clean}`, actionType: 'navigation' };
      }
    } catch (e) {}

    return { name: 'Navigate Page', actionType: 'navigation' };
  };

  /**
   * Group captured requests into human-friendly named scenarios
   * Generic, universal grouping that works for ANY web application
   */
  const processRequestsIntoScenarios = (requests: CapturedNetworkRequest[]) => {
    const effectiveUrl = recordingTargetUrlRef.current || targetUrl;

    // Deduplicate identical requests (same method + url + timestamp within 500ms)
    const seenMap = new Set<string>();
    const deduplicated: CapturedNetworkRequest[] = [];
    requests.forEach((req) => {
      const key = `${req.method}|${req.url}|${Math.floor(req.timestamp / 500)}`;
      if (!seenMap.has(key)) {
        seenMap.add(key);
        deduplicated.push(req);
      }
    });

    const validRequests = deduplicated.filter((r) => {
      const isLandingNav = deduplicated.indexOf(r) === 0 || r.resourceType === 'document' || r.resourceType === 'navigation';
      const hasInteraction = isLandingNav || !!r.actionId || ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method);
      return !isNoiseRequest(r.url, r.resourceType, r.method, r.status, effectiveUrl, hasInteraction);
    });

    // If no requests were captured in this recording session, display clean empty review state
    if (validRequests.length === 0) {
      setScenarios([]);
      setSelectedScenarioIds([]);
      setInReviewMode(true);
      try {
        const effectiveUrl = recordingTargetUrlRef.current || targetUrl;
        const u = new URL(effectiveUrl.startsWith('http') ? effectiveUrl : `https://${effectiveUrl}`);
        setJmeterConfig((prev) => ({
          ...prev,
          domain: u.hostname,
          protocol: u.protocol.replace(':', '') || 'https',
          port: u.protocol === 'https:' ? '443' : '80'
        }));
      } catch (e) {}
      return;
    }

    // Sort requests chronologically
    const sorted = [...validRequests].sort((a, b) => a.timestamp - b.timestamp);

    // Grouping by User Action:
    // - If actionId is present, cluster requests under that actionId
    // - For mutating requests (POST/PUT/PATCH/DELETE), group them together with any immediate redirect
    //   and the landing document/page load within 3.5 seconds into ONE scenario!
    // - Independent document navigations (outside of a form submit) form their own scenario.
    const scenarioClusters: {
      actionId?: string;
      actionIntent?: string;
      timestamp: number;
      requests: CapturedNetworkRequest[];
      hasPaymentGateway: boolean;
      paymentGatewayDomain?: string;
    }[] = [];

    let currentCluster: (typeof scenarioClusters)[0] | null = null;

    sorted.forEach((req) => {
      const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
      const isDocNav = req.resourceType === 'document' || req.resourceType === 'navigation';
      const isSearch = req.url.includes('?q=') || req.url.includes('&q=') || req.url.includes('search=') || req.url.includes('/search');

      let startNew = false;
      if (!currentCluster) {
        startNew = true;
      } else if (req.actionId && currentCluster.actionId && req.actionId !== currentCluster.actionId) {
        // Explicitly new user action from agent
        startNew = true;
      } else if (req.actionId && !currentCluster.actionId) {
        startNew = true;
      } else if (!req.actionId && isMutating) {
        // New form submit / mutating action starts a new scenario
        startNew = true;
      } else if (!req.actionId && isSearch && !currentCluster.requests.some((r) => r.url.includes('search') || r.url.includes('?q='))) {
        startNew = true;
      } else if (isDocNav && !req.actionId) {
        // If the current cluster started with a form submit within the last 3.5s, this document load is the redirect/landing page of that submit!
        const clusterHasMutating = currentCluster.requests.some((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
        const timeSinceClusterStart = req.timestamp - currentCluster.timestamp;
        if (!clusterHasMutating || timeSinceClusterStart > 3500) {
          startNew = true;
        }
      } else if (req.timestamp - currentCluster.timestamp > 4000 && currentCluster.requests.length >= 2) {
        startNew = true;
      }

      if (startNew) {
        currentCluster = {
          actionId: req.actionId,
          actionIntent: req.actionIntent,
          timestamp: req.timestamp,
          requests: [req],
          hasPaymentGateway: !!req.isPaymentGateway,
          paymentGatewayDomain: req.paymentGatewayName
        };
        scenarioClusters.push(currentCluster);
      } else if (currentCluster) {
        currentCluster.requests.push(req);
        if (req.isPaymentGateway) {
          currentCluster.hasPaymentGateway = true;
          currentCluster.paymentGatewayDomain = req.paymentGatewayName;
        }
        if (req.actionIntent && !currentCluster.actionIntent) {
          currentCluster.actionIntent = req.actionIntent;
        }
      }
    });

    const finalScenarios: ScenarioGroup[] = scenarioClusters
      .map((cluster, cIdx) => {
        const isFirstCluster = cIdx === 0;
        const hasMutating = cluster.requests.some((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));

        // Identify the ONE primary request of this scenario cluster
        const { primary, supporting } = identifyPrimaryRequest(cluster.requests, cluster.actionIntent);

        const derived = deriveHumanScenarioName(primary, cluster.requests, cIdx + 1);

        // If it's the landing step (first cluster without mutating POST/PUT/PATCH),
        // ensure NO tracking query parameters appear under "Data Entered / Submitted",
        // but preserve real search terms if the user started on or executed a search
        const isSearchOrFilter =
          derived.name === 'Search' ||
          derived.name === 'Apply Filter' ||
          primary.formFields?.some((f) => ['q', 'search', 'query', 'keyword', 'term'].includes(f.key.toLowerCase()));

        if (isFirstCluster && !hasMutating && !isSearchOrFilter) {
          primary.formFields = [];
          cluster.requests.forEach((req) => {
            req.formFields = [];
          });
        }

        return {
          id: `scen_${Date.now()}_${cIdx + 1}`,
          name: derived.name,
          isEditingName: false,
          actionType: isFirstCluster && !hasMutating && !isSearchOrFilter ? 'navigation' : derived.actionType,
          timestamp: cluster.timestamp,
          primaryRequestId: primary.id,
          primaryRequest: primary,
          supportingRequests: supporting,
          requests: [primary, ...supporting],
          hasPaymentGateway: cluster.hasPaymentGateway,
          paymentGatewayDomain: cluster.paymentGatewayDomain
        };
      })
      .filter(
        (scen) =>
          scen.name !== 'Background Noise' &&
          !isNoiseRequest(scen.primaryRequest.url, scen.primaryRequest.resourceType, scen.primaryRequest.method, scen.primaryRequest.status)
      );

    setScenarios(finalScenarios);
    setSelectedScenarioIds(finalScenarios.map((s) => s.id));
    setInReviewMode(true);

    // Populate default JMeter domain & protocol from targetUrl
    try {
      const effectiveUrl = recordingTargetUrlRef.current || targetUrl;
      const u = new URL(effectiveUrl.startsWith('http') ? effectiveUrl : `https://${effectiveUrl}`);
      setJmeterConfig((prev) => ({
        ...prev,
        domain: u.hostname,
        protocol: u.protocol.replace(':', '') || 'https',
        port: u.protocol === 'https:' ? '443' : '80'
      }));
    } catch (e) {}
  };

  /**
   * Save Recording to Project Folder or JSON download
   */
  const handleSaveRecording = () => {
    const domainClean = jmeterConfig.domain || 'recording';
    const defaultName = `${domainClean} - Recorded Session (${new Date().toLocaleDateString()})`;
    setSaveScriptName(defaultName);
    setSaveFolderId(project?.automationFolders?.[0]?.id || '');
    setNewFolderNameInput('');
    setIsSaveModalOpen(true);
  };

  const handleConfirmSaveToProject = () => {
    const finalName = saveScriptName.trim() || 'Recorded Performance Script';
    let targetFolderId = saveFolderId;
    let targetFolderName = '';

    let updatedFolders = [...(project?.automationFolders || [])];
    if (saveFolderId === '__NEW__') {
      const newName = newFolderNameInput.trim() || 'Recorded Scenarios';
      const existing = updatedFolders.find(f => f.name.trim().toLowerCase() === newName.toLowerCase());
      if (existing) {
        targetFolderId = existing.id;
        targetFolderName = existing.name;
      } else {
        const newId = `folder_${Date.now()}`;
        const newFolder = {
          id: newId,
          name: newName,
          type: 'script' as const,
          createdAt: new Date().toISOString()
        };
        updatedFolders.push(newFolder);
        targetFolderId = newId;
        targetFolderName = newName;
      }
    } else if (saveFolderId) {
      const f = updatedFolders.find((x) => x.id === saveFolderId);
      if (f) targetFolderName = f.name;
    }

    const selectedScenarios = scenarios.filter((s) => selectedScenarioIds.includes(s.id));
    const effectiveScenarios = selectedScenarios.length > 0 ? selectedScenarios : scenarios;

    let jmxText = generatedJmx;
    if (!jmxText) {
      handleGenerateJmx();
      jmxText = generatedJmx || '<jmeterTestPlan/>';
    }

    const newScript: PerformanceScript = {
      id: `perf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: finalName,
      scenarios: effectiveScenarios,
      jmxContent: jmxText,
      createdAt: new Date().toISOString(),
      folderId: targetFolderId || undefined,
      folderName: targetFolderName || undefined
    };

    if (project && onUpdateProject) {
      const updatedProject: Project = {
        ...project,
        performanceScripts: [newScript, ...(project.performanceScripts || [])],
        automationFolders: updatedFolders
      };
      onUpdateProject(updatedProject);
    }

    // Persist into Saved Recordings library
    const savedRec: SavedWebRecording = {
      id: newScript.id,
      name: finalName,
      targetUrl: jmeterConfig.domain || recordingTargetUrlRef.current || targetUrl,
      savedAt: new Date().toISOString(),
      saveLocation: targetFolderName ? `Project Folder: ${targetFolderName}` : 'Project: Performance Scripts',
      scenariosCount: effectiveScenarios.length,
      requestsCount: effectiveScenarios.reduce((acc, s) => acc + s.requests.length, 0),
      scenarios: effectiveScenarios,
      jmeterConfig,
      jmxContent: jmxText,
      folderId: targetFolderId,
      folderName: targetFolderName
    };
    persistStoredRecording(savedRec);
    setSavedRecordingsList(getStoredRecordings(project?.performanceScripts ? [newScript, ...project.performanceScripts] : [newScript]));

    setIsSaveModalOpen(false);
    setSaveSuccessMessage(`Saved as "${finalName}" to ${targetFolderName ? `folder "${targetFolderName}"` : 'Performance Scripts'}!`);
    setTimeout(() => setSaveSuccessMessage(null), 6000);
  };

  const handleExportJsonDownload = async () => {
    const ok = await deductExportCredits(project?.id || 'proj-default', 'record_play_web', user, 'Export Web Recording JSON', project?.name);
    if (!ok) return;

    const domainClean = jmeterConfig.domain || 'recording';
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const filename = `${domainClean}_${yyyy}-${mm}-${dd}_${hh}${min}.json`;

    const selectedScenarios = scenarios.filter((s) => selectedScenarioIds.includes(s.id));
    const effectiveScenarios = selectedScenarios.length > 0 ? selectedScenarios : scenarios;

    const recordingPayload = {
      version: '1.0',
      type: 'automatiqa_web_recording',
      savedAt: now.toISOString(),
      metadata: recordedSessionMeta,
      jmeterConfig,
      selectedScenarioIds,
      scenarios: effectiveScenarios,
      rawRequests: liveRequestsRef.current
    };

    const blob = new Blob([JSON.stringify(recordingPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Also persist into Saved Recordings
    const savedRec: SavedWebRecording = {
      id: `saved_json_${Date.now()}`,
      name: `${domainClean} Recording (${now.toLocaleDateString()})`,
      targetUrl: jmeterConfig.domain || recordingTargetUrlRef.current || targetUrl,
      savedAt: now.toISOString(),
      saveLocation: `Exported File: ${filename}`,
      scenariosCount: effectiveScenarios.length,
      requestsCount: effectiveScenarios.reduce((acc, s) => acc + s.requests.length, 0),
      scenarios: effectiveScenarios,
      jmeterConfig,
      jmxContent: generatedJmx || undefined
    };
    persistStoredRecording(savedRec);
    setSavedRecordingsList(getStoredRecordings(project?.performanceScripts));

    setIsSaveModalOpen(false);
    setSaveSuccessMessage(`Saved and exported as "${filename}"!`);
    setTimeout(() => setSaveSuccessMessage(null), 6000);
  };

  /**
   * Import Saved Recording JSON
   */
  const handleImportRecordingFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed.scenarios && Array.isArray(parsed.scenarios)) {
          setScenarios(parsed.scenarios);
          setSelectedScenarioIds(parsed.selectedScenarioIds || parsed.scenarios.map((s: any) => s.id));
          if (parsed.metadata) setRecordedSessionMeta(parsed.metadata);
          if (parsed.jmeterConfig) setJmeterConfig(parsed.jmeterConfig);
          if (parsed.rawRequests) {
            setLiveRequests(parsed.rawRequests);
            liveRequestsRef.current = parsed.rawRequests;
          }
          setInReviewMode(true);
          setIsRecording(false);
        } else {
          setConnectionError('Invalid recording file format. Missing scenarios array.');
        }
      } catch (err: any) {
        setConnectionError(`Failed to parse recording JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
    // Reset file input value so same file can be chosen again if needed
    e.target.value = '';
  };

  /**
   * Load saved recording into interactive review & test plan compiler
   */
  const handleLoadSavedRecording = (rec: SavedWebRecording) => {
    setScenarios(rec.scenarios);
    setSelectedScenarioIds(rec.scenarios.map((s) => s.id));
    if (rec.jmeterConfig) {
      setJmeterConfig(rec.jmeterConfig);
    }
    if (rec.jmxContent) {
      setGeneratedJmx(rec.jmxContent);
      setGeneratedFilename(`${rec.jmeterConfig?.domain || 'test_plan'}.jmx`);
    } else {
      setGeneratedJmx(null);
      setGeneratedFilename('');
    }
    setRecordedSessionMeta({
      targetUrl: rec.targetUrl,
      sessionId: rec.id,
      timestamp: new Date(rec.savedAt).getTime(),
      formattedDate: new Date(rec.savedAt).toLocaleString(),
      durationSeconds: 0,
      isDemo: false,
      requestCount: rec.requestsCount,
      actionCount: rec.scenariosCount
    });
    setInReviewMode(true);
    setActiveReviewTab('scenarios');
    setActiveTopTab('recorder');
  };

  /**
   * Delete saved recording from local library
   */
  const handleDeleteSavedRecording = (id: string) => {
    removeStoredRecording(id);
    const updated = getStoredRecordings(project?.performanceScripts);
    setSavedRecordingsList(updated);
    setSaveSuccessMessage('Recording removed from library.');
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  /**
   * Direct download saved .JMX
   */
  const handleDownloadSavedJmx = (rec: SavedWebRecording) => {
    if (rec.jmxContent) {
      const cleanContent = sanitizeJmxScript(rec.jmxContent);
      const blob = new Blob([cleanContent], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rec.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.jmx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      handleLoadSavedRecording(rec);
      setTimeout(() => handleGenerateJmx(), 150);
    }
  };

  /**
   * Direct download saved JSON session
   */
  const handleDownloadSavedJson = (rec: SavedWebRecording) => {
    const payload = {
      version: '1.0',
      type: 'automatiqa_web_recording',
      savedAt: rec.savedAt,
      name: rec.name,
      targetUrl: rec.targetUrl,
      jmeterConfig: rec.jmeterConfig,
      scenarios: rec.scenarios
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rec.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Toggle Scenario Selection for .JMX generation
   */
  const handleToggleScenarioSelect = (scenarioId: string) => {
    setSelectedScenarioIds((prev) =>
      prev.includes(scenarioId) ? prev.filter((id) => id !== scenarioId) : [...prev, scenarioId]
    );
  };

  /**
   * Select / Deselect All Scenarios
   */
  const handleSelectAllScenarios = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedScenarioIds(scenarios.map((s) => s.id));
    } else {
      setSelectedScenarioIds([]);
    }
  };

  /**
   * Toggle Raw Payload View for a Request
   */
  const handleToggleRawPayload = (requestId: string) => {
    setShowRawPayloadMap((prev) => ({
      ...prev,
      [requestId]: !prev[requestId]
    }));
  };

  /**
   * Sample realistic multi-step journey for instant test-drive
   * Login -> Search -> Select Hotel -> Booking -> Payment
   */
  const generateSampleUserJourney = (): CapturedNetworkRequest[] => {
    let baseUrl = 'https://adactinhotelapp.com';
    try {
      const u = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
      baseUrl = `${u.protocol}//${u.hostname}`;
    } catch (e) {}

    const now = Date.now();

    return [
      // 0. Landing / Home Page Load (with tracking parameters that are ignored)
      enrichCapturedRequest({
        id: 'req_0_landing',
        actionId: 'act_0_landing',
        actionIntent: 'Page Load',
        isLandingRequest: true,
        url: `${baseUrl}/index.php?utm_source=google&utm_medium=cpc&utm_campaign=summer2026&gclid=CjwKCAjw12345&fbclid=IwAR12345`,
        method: 'GET',
        status: 200,
        responseTimeMs: 220,
        resourceType: 'document',
        timestamp: now - 45000
      }),

      // 1. Scenario 1: Login -> Primary: Login API
      enrichCapturedRequest({
        id: 'req_1_login',
        actionId: 'act_1_login',
        actionIntent: 'Login',
        url: `${baseUrl}/api/v1/auth/login`,
        method: 'POST',
        status: 200,
        responseTimeMs: 82,
        resourceType: 'fetch',
        timestamp: now - 35000,
        postData: JSON.stringify({
          username: 'tester_pro@automatiqa.io',
          password: 'SuperSecretPassword!2026',
          remember_me: true
        })
      }),
      enrichCapturedRequest({
        id: 'req_1_user_profile',
        actionId: 'act_1_login',
        actionIntent: 'Login',
        url: `${baseUrl}/api/v1/users/profile`,
        method: 'GET',
        status: 200,
        responseTimeMs: 45,
        resourceType: 'fetch',
        timestamp: now - 34800
      }),

      // 2. Scenario 2: Search -> Primary: Search API
      enrichCapturedRequest({
        id: 'req_2_search_api',
        actionId: 'act_2_search',
        actionIntent: 'Search',
        url: `${baseUrl}/api/v1/hotels/search?destination=San+Francisco&checkin=2026-10-01&checkout=2026-10-05&rooms=1&adults=2`,
        method: 'GET',
        status: 200,
        responseTimeMs: 145,
        resourceType: 'fetch',
        timestamp: now - 28000
      }),
      enrichCapturedRequest({
        id: 'req_2_filter_meta',
        actionId: 'act_2_search',
        actionIntent: 'Search',
        url: `${baseUrl}/api/v1/hotels/facets?destination=San+Francisco`,
        method: 'GET',
        status: 200,
        responseTimeMs: 65,
        resourceType: 'fetch',
        timestamp: now - 27800
      }),

      // 3. Scenario 3: Select Hotel -> Primary: Hotel Selection API
      enrichCapturedRequest({
        id: 'req_3_select_hotel',
        actionId: 'act_3_select',
        actionIntent: 'Select Hotel',
        url: `${baseUrl}/api/v1/hotels/select`,
        method: 'POST',
        status: 200,
        responseTimeMs: 95,
        resourceType: 'fetch',
        timestamp: now - 20000,
        postData: JSON.stringify({
          hotel_id: 'HTL-8942',
          hotel_name: 'Grand Hyatt San Francisco',
          room_type: 'Deluxe Suite',
          rate_per_night: 249.00,
          selected_radio: 'radiobutton_0'
        })
      }),
      enrichCapturedRequest({
        id: 'req_3_room_availability',
        actionId: 'act_3_select',
        actionIntent: 'Select Hotel',
        url: `${baseUrl}/api/v1/rooms/HTL-8942/availability`,
        method: 'GET',
        status: 200,
        responseTimeMs: 50,
        resourceType: 'fetch',
        timestamp: now - 19800
      }),

      // 4. Scenario 4: Booking -> Primary: Booking API
      enrichCapturedRequest({
        id: 'req_4_book_hotel',
        actionId: 'act_4_booking',
        actionIntent: 'Booking',
        url: `${baseUrl}/api/v1/bookings`,
        method: 'POST',
        status: 201,
        responseTimeMs: 180,
        resourceType: 'fetch',
        timestamp: now - 12000,
        postData: JSON.stringify({
          hotel_id: 'HTL-8942',
          first_name: 'Alex',
          last_name: 'Morgan',
          billing_address: '123 Market St, Suite 400',
          city: 'San Francisco',
          state: 'CA',
          zip_code: '94105',
          checkin_date: '2026-10-01',
          checkout_date: '2026-10-05',
          num_rooms: '1',
          num_adults: '2'
        })
      }),

      // 5. Scenario 5: Payment -> Primary: Payment API
      enrichCapturedRequest({
        id: 'req_5_stripe_token',
        actionId: 'act_5_payment',
        actionIntent: 'Payment',
        url: 'https://api.stripe.com/v1/tokens',
        method: 'POST',
        status: 200,
        responseTimeMs: 210,
        resourceType: 'fetch',
        timestamp: now - 4000,
        postData: JSON.stringify({
          card_number: '4242424242424242',
          cvv: '987',
          exp_month: '12',
          exp_year: '2028',
          cardholder: 'Alex Morgan'
        })
      }),
      enrichCapturedRequest({
        id: 'req_5_payment_charge',
        actionId: 'act_5_payment',
        actionIntent: 'Payment',
        url: `${baseUrl}/api/v1/payments/charge`,
        method: 'POST',
        status: 200,
        responseTimeMs: 290,
        resourceType: 'fetch',
        timestamp: now - 2000,
        postData: JSON.stringify({
          booking_id: 'BKG-98421',
          payment_method: 'stripe',
          amount: '996.00',
          currency: 'USD'
        })
      })
    ];
  };

  /**
   * Action: Start Record
   * Fully clears and resets all review state before initiating the new session.
   */
  const handleStartRecording = () => {
    if (!targetUrl.trim()) {
      setConnectionError('Please provide a valid Target URL to record.');
      return;
    }

    let normalizedUrl = targetUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
      setTargetUrl(normalizedUrl);
    }

    // 1. Clear any active simulation interval
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    // 2. Clear review screen and live data state completely
    setScenarios([]);
    setSelectedScenarioIds([]);
    setInReviewMode(false);
    setGeneratedJmx(null);
    setGeneratedFilename('');
    setXmlValidationError(null);
    setCopiedJmx(false);
    setActiveReviewTab('scenarios');
    setLiveRequests([]);
    liveRequestsRef.current = [];
    seenRequestIdsRef.current.clear();
    firstRequestIdRef.current = null;
    landingQueryParamsRef.current.clear();
    setTotalRequestCount(0);
    setTotalActionCount(0);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    setRecordedSessionMeta(null);
    setIsDemoSession(false);
    isDemoSessionRef.current = false;
    setConnectionError(null);

    // 3. Generate brand new unique session ID
    const newSessionId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setActiveSessionId(newSessionId);
    activeSessionIdRef.current = newSessionId;
    recordingStartTimeRef.current = Date.now();
    recordingTargetUrlRef.current = normalizedUrl;

    // 4. Send start recording command via Web Performance Bridge extension (and WebSocket fallback)
    sendBridgeStartRecord(normalizedUrl, newSessionId);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'start_record',
          url: normalizedUrl,
          sessionId: newSessionId
        })
      );
    }

    if (bridgeExtensionStatus === 'detected' || agentStatus === 'connected' || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
      setIsRecording(true);
      isRecordingRef.current = true;
      return;
    }

    // If agent is not connected, notify user and provide test drive simulation
    setShowAgentInstallGuide(true);
  };

  /**
   * Action: Start Simulated Recording (Demo / Fallback mode)
   * Uses completely segregated demo data path so simulation never leaks into real recordings.
   */
  const handleStartSimulatedRecording = () => {
    let normalizedUrl = targetUrl.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
      setTargetUrl(normalizedUrl);
    }

    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    // Fully reset review state
    setScenarios([]);
    setSelectedScenarioIds([]);
    setInReviewMode(false);
    setGeneratedJmx(null);
    setGeneratedFilename('');
    setXmlValidationError(null);
    setCopiedJmx(false);
    setActiveReviewTab('scenarios');
    setLiveRequests([]);
    liveRequestsRef.current = [];
    seenRequestIdsRef.current.clear();
    firstRequestIdRef.current = null;
    landingQueryParamsRef.current.clear();
    setTotalRequestCount(0);
    setTotalActionCount(0);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    setRecordedSessionMeta(null);
    setShowAgentInstallGuide(false);
    setConnectionError(null);

    const demoSessionId = `demo_sim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setActiveSessionId(demoSessionId);
    activeSessionIdRef.current = demoSessionId;
    recordingStartTimeRef.current = Date.now();
    recordingTargetUrlRef.current = normalizedUrl;
    setIsDemoSession(true);
    isDemoSessionRef.current = true;
    setIsRecording(true);
    isRecordingRef.current = true;

    // Stream realistic requests incrementally into the live HUD
    const samples = generateSampleUserJourney();
    let index = 0;

    simulationIntervalRef.current = setInterval(() => {
      if (index < samples.length) {
        const item = samples[index];
        setLiveRequests((prev) => {
          const updated = [item, ...prev];
          liveRequestsRef.current = updated;
          return updated;
        });
        setTotalRequestCount((prev) => prev + 1);
        if (item.method === 'POST') {
          setTotalActionCount((prev) => prev + 1);
        }
        index++;
      } else {
        if (simulationIntervalRef.current) {
          clearInterval(simulationIntervalRef.current);
          simulationIntervalRef.current = null;
        }
      }
    }, 1200);
  };

  /**
   * Action: Stop Record
   */
  const handleStopRecording = (stopReason?: string) => {
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    const durationSecs = elapsedSecondsRef.current;
    const finalUrl = recordingTargetUrlRef.current || targetUrl;
    const currentSession = activeSessionIdRef.current || `rec_${Date.now()}`;

    // 1. If currently in simulated demo mode
    if (isDemoSessionRef.current) {
      setIsRecording(false);
      isRecordingRef.current = false;
      setRecordedSessionMeta({
        sessionId: currentSession,
        targetUrl: finalUrl,
        timestamp: Date.now(),
        formattedDate: new Date().toLocaleString(),
        durationSeconds: durationSecs,
        isDemo: true,
        requestCount: liveRequestsRef.current.length,
        actionCount: totalActionCount
      });
      processRequestsIntoScenarios(liveRequestsRef.current);
      setInReviewMode(true);
      return;
    }

    // 2. Real browser recording mode
    sendBridgeStopRecord(currentSession, stopReason || 'User stopped recording');

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          action: 'stop_record',
          sessionId: currentSession,
          reason: stopReason || 'User stopped recording'
        })
      );
    }

    setIsRecording(false);
    isRecordingRef.current = false;

    // Process only the captured live requests matching this session
    setRecordedSessionMeta({
      sessionId: currentSession,
      targetUrl: finalUrl,
      timestamp: Date.now(),
      formattedDate: new Date().toLocaleString(),
      durationSeconds: durationSecs,
      isDemo: false,
      requestCount: liveRequestsRef.current.length,
      actionCount: totalActionCount
    });
    processRequestsIntoScenarios(liveRequestsRef.current);
    setInReviewMode(true);
  };

  /**
   * Edit Scenario Name
   */
  const handleUpdateScenarioName = (scenarioId: string, newName: string) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === scenarioId ? { ...s, name: newName, isEditingName: false } : s))
    );
  };

  /**
   * Remove entire Scenario
   */
  const handleRemoveScenario = (scenarioId: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
    setSelectedScenarioIds((prev) => prev.filter((id) => id !== scenarioId));
  };

  /**
   * Remove single Request from a Scenario
   */
  const handleRemoveRequest = (scenarioId: string, requestId: string) => {
    setScenarios((prev) =>
      prev
        .map((s) => {
          if (s.id !== scenarioId) return s;
          const remaining = s.requests.filter((r) => r.id !== requestId);
          const newPrimary = s.primaryRequestId === requestId
            ? remaining[0]
            : (s.primaryRequest && s.primaryRequest.id !== requestId ? s.primaryRequest : remaining[0]);
          return {
            ...s,
            requests: remaining,
            primaryRequestId: newPrimary?.id,
            primaryRequest: newPrimary,
            supportingRequests: remaining.filter((r) => r.id !== newPrimary?.id)
          };
        })
        .filter((s) => s.requests.length > 0)
    );
  };

  /**
   * Toggle sensitive field: Parameterize vs Hardcode
   */
  const handleToggleFieldSensitivity = (
    scenarioId: string,
    requestId: string,
    fieldKey: string,
    action: 'parameterize' | 'hardcode'
  ) => {
    setScenarios((prev) =>
      prev.map((s) => {
        if (s.id !== scenarioId) return s;
        const updatedRequests = s.requests.map((r) => {
          if (r.id !== requestId) return r;
          return {
            ...r,
            formFields: (r.formFields || []).map((f) =>
              f.key === fieldKey ? { ...f, action } : f
            )
          };
        });
        const currentPrimaryId = s.primaryRequestId || s.primaryRequest?.id || updatedRequests[0]?.id;
        const updatedPrimary = updatedRequests.find((r) => r.id === currentPrimaryId) || updatedRequests[0];
        return {
          ...s,
          requests: updatedRequests,
          primaryRequest: updatedPrimary,
          supportingRequests: updatedRequests.filter((r) => r.id !== updatedPrimary?.id)
        };
      })
    );
  };

  /**
   * Toggle masked value visibility
   */
  const handleToggleFieldReveal = (scenarioId: string, requestId: string, fieldKey: string) => {
    setScenarios((prev) =>
      prev.map((s) => {
        if (s.id !== scenarioId) return s;
        const updatedRequests = s.requests.map((r) => {
          if (r.id !== requestId) return r;
          return {
            ...r,
            formFields: (r.formFields || []).map((f) =>
              f.key === fieldKey ? { ...f, revealed: !f.revealed } : f
            )
          };
        });
        const currentPrimaryId = s.primaryRequestId || s.primaryRequest?.id || updatedRequests[0]?.id;
        const updatedPrimary = updatedRequests.find((r) => r.id === currentPrimaryId) || updatedRequests[0];
        return {
          ...s,
          requests: updatedRequests,
          primaryRequest: updatedPrimary,
          supportingRequests: updatedRequests.filter((r) => r.id !== updatedPrimary?.id)
        };
      })
    );
  };

  /**
   * Toggle expansion of supporting/auxiliary requests in a Scenario
   */
  const handleToggleSupportingRequests = (scenarioId: string) => {
    setExpandedSupportingMap((prev) => ({
      ...prev,
      [scenarioId]: !prev[scenarioId]
    }));
  };

  /**
   * Format MM:SS
   */
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  /**
   * State 3 -> State 4: Build JMeter .jmx Test Plan
   * Fulfills all specified .JMX generation rules:
   * - Filters by selectedScenarioIds
   * - One Thread Group using users, ramp-up, loop count
   * - HTTP Cookie Manager (never hardcoded cookies)
   * - HTTP Header Manager for custom headers
   * - Grouped under Transaction Controllers per scenario
   * - One HTTP Sampler per kept request named "Scenario - METHOD /path"
   * - JSON/Regex Extractors for correlated values
   * - Parameterized variables for masked fields under User Defined Variables
   * - View Results Tree and Summary Report listeners
   * - Validate generated XML with DOMParser
   */
  const handleGenerateJmx = () => {
    setXmlValidationError(null);

    // Filter by selected scenarios
    const activeScenarios = scenarios.filter((s) => selectedScenarioIds.includes(s.id));
    const effectiveScenarios = activeScenarios.length > 0 ? activeScenarios : scenarios;

    // Collect all parameterized variables from active scenarios
    const userDefinedVars: Record<string, string> = {};
    effectiveScenarios.forEach((scen) => {
      scen.requests.forEach((req) => {
        (req.formFields || []).forEach((field) => {
          if (field.isSensitive && field.action === 'parameterize') {
            const cleanKey = field.key.replace(/[^a-zA-Z0-9_]/g, '_');
            if (!userDefinedVars[cleanKey]) {
              userDefinedVars[cleanKey] = field.value || 'PLACEHOLDER_VALUE';
            }
          }
        });
      });
    });

    // Build User Defined Variables XML block
    const userVarsXml = Object.entries(userDefinedVars)
      .map(
        ([k, v]) => `
          <elementProp name="${k}" elementType="Argument">
            <stringProp name="Argument.name">${k}</stringProp>
            <stringProp name="Argument.value">${escapeXml(v)}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
            <stringProp name="Argument.desc">Parameterized via AutomatiQA Web Recorder</stringProp>
          </elementProp>`
      )
      .join('\n');

    // Build Transaction Controllers for each Selected Scenario
    let scenarioControllersXml = '';
    const validationWarnings: JmxValidationWarning[] = [];

    effectiveScenarios.forEach((scen, scenIdx) => {
      const scenNum = scenIdx + 1;
      const sanitizedScenName = escapeXml(scen.name);

      let samplersXml = '';

      scen.requests.forEach((req) => {
        // Issue 1: Sanitize URL so that tracking parameters (utm_*, gclid, etc.) are stripped from JMeter samplers
        const cleanUrl = sanitizeUrlForJmeter(req.url);
        const reqDomain = cleanUrl.domain || jmeterConfig.domain;
        const reqProtocol = cleanUrl.protocol || jmeterConfig.protocol;
        const reqPort = cleanUrl.port || jmeterConfig.port;
        const reqPath = cleanUrl.path || '/';

        const samplerName = `${sanitizedScenName} - ${req.method} ${escapeXml(reqPath.substring(0, 50))}`;

        // Inspect body content & parameters
        let argumentsXml = '';
        let samplerHeaderManagerXml = '';
        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
        const hasFormFields = req.formFields && req.formFields.length > 0;
        const hasRawBody = req.rawBody && req.rawBody.trim().length > 0;

        let isJsonBody = false;
        let bodyContent = '';

        if (isMutating) {
          if (hasRawBody && (req.rawBody.trim().startsWith('{') || req.rawBody.trim().startsWith('['))) {
            isJsonBody = true;
            let jsonText = req.rawBody;
            (req.formFields || []).forEach((f) => {
              if (f.isSensitive && f.action === 'parameterize' && f.value) {
                const cleanVar = f.key.replace(/[^a-zA-Z0-9_]/g, '_');
                jsonText = jsonText.split(`"${f.value}"`).join(`"\${${cleanVar}}"`);
              }
            });
            bodyContent = jsonText;
          } else if (hasFormFields) {
            const cType = (req.headers && (req.headers['content-type'] || req.headers['Content-Type']) || '').toLowerCase();
            if (cType.includes('application/json') || cType === '') {
              isJsonBody = true;
              const obj: Record<string, any> = {};
              req.formFields.forEach((f) => {
                obj[f.key] = f.isSensitive && f.action === 'parameterize' ? `\${${f.key.replace(/[^a-zA-Z0-9_]/g, '_')}}` : f.value;
              });
              bodyContent = JSON.stringify(obj, null, 2);
            }
          }
        }

        let effectiveReqPath = reqPath;
        if (req.method === 'GET' && hasFormFields && effectiveReqPath.includes('?')) {
          try {
            const [baseP, queryP] = effectiveReqPath.split('?');
            const searchParams = new URLSearchParams(queryP);
            req.formFields.forEach((f) => {
              searchParams.delete(f.key);
            });
            const remainingQuery = searchParams.toString();
            effectiveReqPath = baseP + (remainingQuery ? `?${remainingQuery}` : '');
          } catch (e) {}
        }

        if (isJsonBody && bodyContent) {
          argumentsXml = `
            <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
            <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
              <collectionProp name="Arguments.arguments">
                <elementProp name="" elementType="HTTPArgument">
                  <boolProp name="HTTPArgument.always_encode">false</boolProp>
                  <stringProp name="Argument.value">${escapeXml(bodyContent)}</stringProp>
                  <stringProp name="Argument.metadata">=</stringProp>
                </elementProp>
              </collectionProp>
            </elementProp>`;

          samplerHeaderManagerXml = `
            <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="Content-Type Header" enabled="true">
              <collectionProp name="HeaderManager.headers">
                <elementProp name="" elementType="Header">
                  <stringProp name="Header.name">Content-Type</stringProp>
                  <stringProp name="Header.value">application/json</stringProp>
                </elementProp>
              </collectionProp>
            </HeaderManager>
            <hashTree/>`;
        } else if (hasFormFields) {
          const argProps = req.formFields.map((f) => {
            const val =
              f.isSensitive && f.action === 'parameterize'
                ? `\${${f.key.replace(/[^a-zA-Z0-9_]/g, '_')}}`
                : f.value;
            return `
                <elementProp name="${escapeXml(f.key)}" elementType="HTTPArgument">
                  <boolProp name="HTTPArgument.always_encode">true</boolProp>
                  <stringProp name="Argument.value">${escapeXml(val)}</stringProp>
                  <stringProp name="Argument.metadata">=</stringProp>
                  <boolProp name="HTTPArgument.use_equals">true</boolProp>
                  <stringProp name="Argument.name">${escapeXml(f.key)}</stringProp>
                </elementProp>`;
          });

          argumentsXml = `
            <boolProp name="HTTPSampler.postBodyRaw">false</boolProp>
            <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" enabled="true">
              <collectionProp name="Arguments.arguments">
                ${argProps.join('\n')}
              </collectionProp>
            </elementProp>`;
        } else {
          argumentsXml = `
            <boolProp name="HTTPSampler.postBodyRaw">false</boolProp>
            <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" enabled="true">
              <collectionProp name="Arguments.arguments"/>
            </elementProp>`;
        }

        // Issue 2 pre-validation check: Warn if a mutating action request has no parameters or body
        if (isMutating && !isJsonBody && (!req.formFields || req.formFields.length === 0)) {
          validationWarnings.push({
            id: `warn_${req.id || Math.random().toString(36).substring(2, 7)}`,
            scenarioName: scen.name,
            samplerName,
            method: req.method,
            path: reqPath,
            message: `Sampler [${req.method}] ${reqPath.substring(0, 45)} contains an empty body and no submitted form parameters.`
          });
        }

        // Extractor for correlated dynamic values
        let extractorsXml = '';
        if (req.correlatedDynamicValue && req.method === 'POST') {
          extractorsXml = `
            <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="Extract ${req.correlatedDynamicValue.variableName}" enabled="true">
              <stringProp name="JSONPostProcessor.referenceNames">${req.correlatedDynamicValue.variableName}</stringProp>
              <stringProp name="JSONPostProcessor.jsonPathExprs">$.token</stringProp>
              <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>
              <stringProp name="JSONPostProcessor.defaultValues">TOKEN_NOT_FOUND</stringProp>
            </JSONPostProcessor>
            <hashTree/>`;
        }

        samplersXml += `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${samplerName}" enabled="true">
          <stringProp name="HTTPSampler.domain">${escapeXml(reqDomain)}</stringProp>
          <stringProp name="HTTPSampler.port">${reqPort}</stringProp>
          <stringProp name="HTTPSampler.protocol">${reqProtocol}</stringProp>
          <stringProp name="HTTPSampler.contentEncoding">UTF-8</stringProp>
          <stringProp name="HTTPSampler.path">${escapeXml(effectiveReqPath)}</stringProp>
          <stringProp name="HTTPSampler.method">${req.method}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          ${argumentsXml}
        </HTTPSamplerProxy>
        <hashTree>
          ${samplerHeaderManagerXml}
          ${extractorsXml}
        </hashTree>`;
      });

      scenarioControllersXml += `
      <!-- ======================================================== -->
      <!-- Scenario: ${sanitizedScenName}                           -->
      <!-- ======================================================== -->
      <TransactionController guiclass="TransactionControllerGui" testclass="TransactionController" testname="Scenario ${scenNum}: ${sanitizedScenName}" enabled="true">
        <boolProp name="TransactionController.includeTimers">false</boolProp>
        <boolProp name="TransactionController.parent">true</boolProp>
      </TransactionController>
      <hashTree>
        ${samplersXml}
      </hashTree>`;
    });

    setJmxValidationWarnings(validationWarnings);

    const cleanDomain = jmeterConfig.domain.replace(/[^a-zA-Z0-9_-]/g, '_') || 'automatiqa_app';
    const timestamp = Date.now();
    const finalFilename = `${cleanDomain}_${timestamp}.jmx`;

    const fullJmxXml = `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="AutomatiQA - ${escapeXml(jmeterConfig.domain)}" enabled="true">
      <stringProp name="TestPlan.comments">Captured via AutomatiQA Local Web Agent and correlated into functional scenarios</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          ${userVarsXml}
        </collectionProp>
      </elementProp>
    </TestPlan>
    <hashTree>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Simulated User Journey" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">${jmeterConfig.loopCount}</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">${jmeterConfig.numThreads}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${jmeterConfig.rampTime}</stringProp>
        <boolProp name="ThreadGroup.scheduler">false</boolProp>
        <stringProp name="ThreadGroup.duration"></stringProp>
        <stringProp name="ThreadGroup.delay"></stringProp>
      </ThreadGroup>
      <hashTree>
        <!-- Automatic Session Cookie Management -->
        <CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager" enabled="true">
          <collectionProp name="CookieManager.cookies"/>
          <boolProp name="CookieManager.clearEachIteration">false</boolProp>
          <boolProp name="CookieManager.controlledByThreadGroup">false</boolProp>
        </CookieManager>
        <hashTree/>

        <!-- Global Header Manager -->
        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">
          <collectionProp name="HeaderManager.headers">
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">User-Agent</stringProp>
              <stringProp name="Header.value">AutomatiQA-JMeter-Runner/1.0 (Mozilla/5.0)</stringProp>
            </elementProp>
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Accept</stringProp>
              <stringProp name="Header.value">text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8</stringProp>
            </elementProp>
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Accept-Language</stringProp>
              <stringProp name="Header.value">en-US,en;q=0.5</stringProp>
            </elementProp>
          </collectionProp>
        </HeaderManager>
        <hashTree/>

        ${scenarioControllersXml}

        <!-- View Results Tree Listener -->
        <ResultCollector guiclass="ViewResultsFullVisualizer" testclass="ResultCollector" testname="View Results Tree" enabled="true">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename"></stringProp>
        </ResultCollector>
        <hashTree/>

        <!-- Summary Report Listener -->
        <ResultCollector guiclass="SummaryReport" testclass="ResultCollector" testname="Summary Report" enabled="true">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename"></stringProp>
        </ResultCollector>
        <hashTree/>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;

    const cleanedJmx = sanitizeJmxScript(fullJmxXml);

    // Validate XML with DOMParser on the SANITIZED XML
    try {
      const parser = new DOMParser();
      const dom = parser.parseFromString(cleanedJmx, 'application/xml');
      const parseError = dom.querySelector('parsererror');
      if (parseError) {
        setXmlValidationError(`XML validation warning: ${parseError.textContent}`);
      } else {
        setXmlValidationError(null);
      }
    } catch (e: any) {
      setXmlValidationError(`XML parser error: ${e.message}`);
    }

    setGeneratedJmx(cleanedJmx);
    setGeneratedFilename(finalFilename);
  };

  /**
   * Action: Download .jmx file with validation guard
   */
  const handleDownloadJmx = () => {
    if (!generatedJmx) return;
    if (jmxValidationWarnings.length > 0) {
      setShowValidationWarningModal(true);
      return;
    }
    executeDownloadJmx();
  };

  /**
   * Directly triggers download of generated .JMX file
   */
  const executeDownloadJmx = async () => {
    if (!generatedJmx) return;

    const ok = await deductExportCredits(project?.id || 'proj-default', 'record_play_web', user, 'Download .JMX Script', project?.name);
    if (!ok) return;

    const cleanContent = sanitizeJmxScript(generatedJmx);
    const blob = new Blob([cleanContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generatedFilename || `AutomatiQA-Recording-${Date.now()}.jmx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowValidationWarningModal(false);
  };

  // Helper: XML string escape
  function escapeXml(unsafe: string) {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Count total kept requests in review
  const totalKeptRequests = scenarios.reduce((acc, s) => acc + s.requests.length, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Hidden file input for importing saved recording JSON */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImportRecordingFile}
        accept=".json,application/json"
        className="hidden"
      />
      {/* ---------------------------------------------------------------- */}
      {/* Top Banner & Header */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 rounded-3xl border border-indigo-500/20 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-cyan-400/10 border border-cyan-400/30 rounded-full text-[10px] font-black text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <Radio size={12} className={isRecording ? 'animate-pulse text-rose-400' : 'text-cyan-400'} />
                Playwright Web Recorder
              </span>
              <span className="px-2.5 py-0.5 bg-slate-800 rounded-full text-[11px] font-bold text-slate-300">
                Desktop Chromium
              </span>
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Record & Capture Real User Journeys
            </h2>
            <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Launches a visible Chromium window on your machine to capture complete user journeys (login, search,
              add to cart, checkout, payment). All network calls are correlated to user actions and reviewed before converting to JMeter (.jmx).
            </p>
          </div>

          {/* Connection Status: Shows active readiness badge and both connection methods */}
          <div className="flex flex-col items-start lg:items-end gap-2 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Prominent Active Connection State */}
              {bridgeExtensionStatus === 'detected' && agentStatus === 'connected' ? (
                <div
                  id="recording-active-connection-pill"
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border bg-emerald-950/90 border-emerald-500/50 text-emerald-300 font-black text-xs shadow-md"
                >
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Ready via Extension & Agent</span>
                </div>
              ) : bridgeExtensionStatus === 'detected' ? (
                <div
                  id="recording-active-connection-pill"
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border bg-cyan-950/90 border-cyan-500/50 text-cyan-300 font-black text-xs shadow-md"
                >
                  <CheckCircle2 size={15} className="text-cyan-400 shrink-0" />
                  <span>Ready via Extension</span>
                </div>
              ) : agentStatus === 'connected' ? (
                <div
                  id="recording-active-connection-pill"
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border bg-emerald-950/90 border-emerald-500/50 text-emerald-300 font-black text-xs shadow-md"
                >
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Ready via Agent</span>
                </div>
              ) : agentStatus === 'untrusted' ? (
                <div
                  id="recording-active-connection-pill"
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border bg-amber-950/90 border-amber-500/50 text-amber-200 font-bold text-xs shadow-md"
                >
                  <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                  <span>Agent detected (SSL pending)</span>
                  <button
                    type="button"
                    onClick={handleAuthorizeSsl}
                    className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-md text-[10px] shadow-sm transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    Authorize SSL <ExternalLink size={10} />
                  </button>
                </div>
              ) : agentStatus === 'checking' || bridgeExtensionStatus === 'checking' ? (
                <div
                  id="recording-active-connection-pill"
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border bg-amber-950/80 border-amber-500/40 text-amber-300 font-bold text-xs shadow-md"
                >
                  <RefreshCw size={14} className="animate-spin text-amber-400 shrink-0" />
                  <span>Checking Connection...</span>
                </div>
              ) : (
                <div
                  id="recording-active-connection-pill"
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border bg-rose-950/80 border-rose-500/40 text-rose-300 font-bold text-xs shadow-md"
                >
                  <XCircle size={15} className="text-rose-400 shrink-0" />
                  <span>Agent or Extension Required</span>
                </div>
              )}

              {/* Bridge Extension Pill */}
              <div
                id="bridge-extension-status-badge"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all shadow-sm ${
                  bridgeExtensionStatus === 'detected'
                    ? 'bg-cyan-950/50 border-cyan-500/30 text-cyan-300'
                    : 'bg-slate-900/90 border-slate-700/60 text-slate-400'
                }`}
                title="AutomatiQA Web Performance Agent Bridge Chrome Extension"
              >
                <Puzzle size={13} className={bridgeExtensionStatus === 'detected' ? 'text-cyan-400' : 'text-slate-500'} />
                <span>
                  {bridgeExtensionStatus === 'detected'
                    ? `Ext: Ready (${bridgeVersion})`
                    : 'Ext: Not Loaded'}
                </span>
                {bridgeExtensionStatus === 'detected' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>

              {/* Agent Status Pill */}
              <div
                id="agent-connection-status-badge"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all shadow-sm ${
                  agentStatus === 'connected'
                    ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
                    : agentStatus === 'untrusted'
                    ? 'bg-amber-950/50 border-amber-500/30 text-amber-200'
                    : 'bg-slate-900/90 border-slate-700/60 text-slate-400'
                }`}
                title="Local AutomatiQA Agent at wss://localhost:9334"
              >
                <Laptop size={13} className={agentStatus === 'connected' ? 'text-emerald-400' : 'text-slate-500'} />
                <span>
                  {agentStatus === 'connected'
                    ? `Agent: Ready (Port 9334)`
                    : agentStatus === 'untrusted'
                    ? 'Agent: SSL Pending'
                    : 'Agent: Offline'}
                </span>
                {agentStatus === 'connected' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px]">
              <button
                id="btn-retry-agent-detection"
                type="button"
                onClick={checkAgentConnection}
                disabled={agentStatus === 'checking' && bridgeExtensionStatus === 'checking'}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={(agentStatus === 'checking' || bridgeExtensionStatus === 'checking') ? 'animate-spin' : ''} />
                Retry Detection
              </button>
              <button
                type="button"
                onClick={() => setShowAgentInstallGuide(!showAgentInstallGuide)}
                className="text-indigo-300 hover:text-indigo-200 underline text-xs font-medium"
              >
                Download Agent & Extension
              </button>
            </div>
          </div>
        </div>

        {/* Top Navigation Tabs: Active Web Recorder vs Saved Recordings Library */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-indigo-500/20 relative z-10">
          <button
            type="button"
            id="tab-web-recorder"
            onClick={() => setActiveTopTab('recorder')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all ${
              activeTopTab === 'recorder'
                ? 'bg-white text-slate-900 shadow-md shadow-black/20'
                : 'text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800'
            }`}
          >
            <Radio size={14} className={isRecording ? 'animate-pulse text-rose-500' : 'text-cyan-400'} />
            Web Recorder
            {isRecording && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping ml-1" />
            )}
          </button>

          <button
            type="button"
            id="tab-saved-recordings"
            onClick={() => {
              setSavedRecordingsList(getStoredRecordings(project?.performanceScripts));
              setActiveTopTab('saved_recordings');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black transition-all ${
              activeTopTab === 'saved_recordings'
                ? 'bg-white text-slate-900 shadow-md shadow-black/20'
                : 'text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800'
            }`}
          >
            <FolderArchive size={14} className="text-indigo-400" />
            Saved Recordings Library
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTopTab === 'saved_recordings'
                  ? 'bg-slate-100 text-slate-800'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {savedRecordingsList.length}
            </span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Agent Instructions & Download Modal / Card (Shown when disconnected or requested) */}
      {/* ---------------------------------------------------------------- */}
      {showAgentInstallGuide && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-slate-200 shadow-2xl space-y-5 animate-in slide-in-from-top-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <Laptop size={18} className="text-cyan-400" />
              <h3 className="font-extrabold text-white text-sm">
                Install & Run AutomatiQA Local Agent
              </h3>
            </div>
            <button
              onClick={() => setShowAgentInstallGuide(false)}
              className="text-slate-400 hover:text-white font-bold text-xs"
            >
              ✕ Close
            </button>
          </div>

          <p className="text-xs text-slate-400">
            The local agent runs non-headless Chromium directly on your computer so you can interact with your application in real time.
            Node.js is packaged inside the executables — no pre-installed dependencies required:
          </p>

          {/* Dedicated Web Performance Agent Bridge Chrome Extension Banner */}
          <div className="p-4 bg-slate-950 rounded-2xl border border-cyan-500/40 hover:border-cyan-500 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Puzzle size={18} className="text-cyan-400 shrink-0" />
                <h4 className="text-xs font-extrabold text-white">AutomatiQA Web Performance Agent Bridge (Chrome Extension)</h4>
                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded text-[10px] font-mono font-bold">
                  Recommended for Browser & AI Studio
                </span>
              </div>
              <p className="text-[11px] text-slate-400 max-w-2xl">
                Connects Google AI Studio Web Performance UI directly to your local Agent at <code className="text-cyan-300 font-mono">wss://localhost:9334</code> using isolated Chrome extension messaging.
              </p>
              <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-2 pt-1">
                <span>1. Open <code className="text-slate-300 font-mono">chrome://extensions</code></span>
                <span>•</span>
                <span>2. Enable "Developer mode"</span>
                <span>•</span>
                <span>3. Click "Load unpacked" and select the unzipped <code className="text-cyan-300 font-mono">extension-web-perf-bridge</code> folder</span>
              </div>
            </div>

            <a
              id="btn-download-bridge-extension"
              href="/api/download-agent?os=extension"
              download="automatiqa-web-perf-bridge.zip"
              className="py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/30 transition-all shrink-0 cursor-pointer"
            >
              <Download size={14} /> Download Extension (.zip)
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* 1. Windows Download Card */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-indigo-500/40 hover:border-indigo-500 flex flex-col justify-between transition-all">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Laptop size={18} className="text-indigo-400 shrink-0" />
                  <h4 className="text-xs font-extrabold text-white">Download Agent for Windows</h4>
                </div>
                <p className="text-[11px] text-slate-400">
                  Recommended: Full ZIP package with <code className="text-indigo-300 font-mono">start-agent.bat</code> and 64-bit executable.
                </p>
                <a
                  id="btn-download-agent-windows-zip"
                  href="/api/download-agent?os=windows&format=zip"
                  download="automatiqa-agent-win-v1.0.zip"
                  className="w-full mt-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <Download size={14} /> Download Agent Package (.zip)
                </a>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Direct links:</span>
                  <div className="flex items-center gap-2">
                    <a
                      id="btn-download-agent-windows"
                      href="/api/download-agent?os=windows&format=exe"
                      download="automatiqa-agent-win-v1.0.exe"
                      className="text-indigo-400 hover:underline font-medium"
                      title="Direct 64-bit .exe file"
                    >
                      Standalone .exe
                    </a>
                    <span>•</span>
                    <a
                      href="/api/download-agent?os=windows&format=bat"
                      download="start-agent.bat"
                      className="text-indigo-400 hover:underline font-medium"
                      title="Batch launcher script"
                    >
                      start-agent.bat
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5">
                <div className="bg-indigo-950/40 border border-indigo-500/20 rounded-lg p-2 text-[10px] text-slate-300 space-y-1">
                  <div className="font-bold text-amber-300 flex items-center gap-1">
                    <AlertTriangle size={11} className="text-amber-400 shrink-0" />
                    Fix: "corrupted and unreadable" error
                  </div>
                  <p className="text-slate-400 leading-snug">
                    1. Right-click downloaded <strong>.zip</strong> → select <strong>'Extract All...'</strong>
                  </p>
                  <p className="text-slate-400 leading-snug">
                    2. In extracted folder, double-click <strong>start-agent.bat</strong>
                  </p>
                  <p className="text-slate-400 leading-snug">
                    3. If SmartScreen prompts: Click <em>'More info'</em> → <em>'Run anyway'</em>
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Linux Download Card */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-emerald-500/40 hover:border-emerald-500 flex flex-col justify-between transition-all">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Terminal size={18} className="text-emerald-400 shrink-0" />
                  <h4 className="text-xs font-extrabold text-white">Download Agent for Linux</h4>
                </div>
                <p className="text-[11px] text-slate-400">
                  Self-installing shell script (<code className="text-emerald-300 font-mono">.sh</code>) with auto-detection & Playwright support.
                </p>
                <a
                  id="btn-download-agent-linux"
                  href="/api/download-agent?os=linux&format=sh"
                  download="automatiqa-agent-setup.sh"
                  className="w-full mt-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <Download size={14} /> Download Installer Script (.sh)
                </a>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Other formats:</span>
                  <div className="flex items-center gap-2">
                    <a
                      href="/api/download-agent?os=linux&format=zip"
                      download="automatiqa-agent-linux-v1.0.zip"
                      className="text-emerald-400 hover:underline font-medium"
                    >
                      Linux .zip
                    </a>
                    <span>•</span>
                    <a
                      href="/api/download-agent?os=linux&format=binary"
                      download="automatiqa-agent-linux"
                      className="text-emerald-400 hover:underline font-medium"
                    >
                      x64 Binary
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5">
                <div className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 font-mono text-[10.5px] text-emerald-300 select-all leading-relaxed">
                  <div>chmod +x automatiqa-agent-setup.sh</div>
                  <div>./automatiqa-agent-setup.sh</div>
                </div>
                <p className="text-[9.5px] text-slate-400 leading-normal">
                  Or simply run: <code className="text-slate-300 font-mono">bash automatiqa-agent-setup.sh</code> in terminal.
                </p>
              </div>
            </div>

            {/* 3. macOS Download Card */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 hover:border-slate-700 flex flex-col justify-between transition-all">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Laptop size={18} className="text-cyan-400 shrink-0" />
                  <h4 className="text-xs font-extrabold text-white">Download Agent for macOS</h4>
                </div>
                <p className="text-[11px] text-slate-400">
                  Complete macOS bundle with pre-configured Terminal launcher script.
                </p>
                <a
                  id="btn-download-agent-mac"
                  href="/api/download-agent?os=mac"
                  download="automatiqa-agent-mac-v1.0.zip"
                  className="w-full mt-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <Download size={14} /> Download for macOS (.zip)
                </a>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[10px] text-slate-400 space-y-1">
                <p className="leading-snug">
                  Unzip and double-click <code className="text-slate-300 font-mono">start-agent.command</code> or run in Terminal.
                </p>
                <div className="text-[9.5px] text-slate-500 pt-0.5 flex items-center justify-between">
                  <span>Source script:</span>
                  <a href="/api/download-agent?os=source" download="automatiqa-agent.cjs" className="text-cyan-400 hover:underline font-mono">
                    automatiqa-agent.cjs
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <span className="text-[11px] text-slate-400">
              Want to try the Review Screen and JMeter generator right now?
            </span>
            <button
              type="button"
              onClick={handleStartSimulatedRecording}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-xl text-xs font-bold hover:brightness-110 shadow-md transition-all"
            >
              <Sparkles size={14} /> Simulate Live Journey (Test Drive Demo)
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 1: ACTIVE WEB RECORDER WORKFLOW */}
      {/* ---------------------------------------------------------------- */}
      {activeTopTab === 'recorder' && (
        <div className="space-y-6">
          {/* STATE 1: BEFORE RECORDING (URL Input & Start Record) */}
          {!isRecording && !inReviewMode && (
        <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-5">
          {agentStatus === 'untrusted' && (
            <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 text-xs">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-300">
                    Local Agent Detected — Browser SSL Exception Required (1-Click)
                  </p>
                  <p className="text-[11px] text-amber-300/80">
                    Your local agent is running, but your browser requires a one-time approval of its secure self-signed localhost certificate.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAuthorizeSsl}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md transition-all inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <span>Authorize SSL (1-Click)</span>
                <ExternalLink size={13} />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            <div className="lg:col-span-8">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Globe size={14} className="text-indigo-600" /> Target Website URL
              </label>
              <div className="relative">
                <input
                  id="input-record-target-url"
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://ecommerce-playground.lambdatest.io"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Launches non-headless Chromium to this entry point. Navigate through login, catalog search, cart, and payment.
              </p>
            </div>

            <div className="lg:col-span-4 flex items-center gap-2">
              <button
                id="btn-start-record"
                type="button"
                onClick={handleStartRecording}
                className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-95 transition-all"
              >
                <Play size={18} fill="currentColor" />
                Start Record
              </button>
            </div>
          </div>

          {/* Quick tips & noise filtering note */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t border-slate-100 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-800 flex items-center gap-1.5 mb-0.5">
                <ShieldCheck size={14} className="text-emerald-600" /> Auto-Noise Filtering
              </span>
              <p className="text-slate-500 text-[11px]">
                Images, stylesheets, fonts, and tracking beacons are automatically excluded from the capture.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-800 flex items-center gap-1.5 mb-0.5">
                <Layers size={14} className="text-indigo-600" /> Scenario Correlation
              </span>
              <p className="text-slate-500 text-[11px]">
                Clicks and form submissions create clean Transaction Controllers for Login, Search, Checkout, etc.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-800 flex items-center gap-1.5 mb-0.5">
                <Lock size={14} className="text-amber-600" /> Sensitive Data Protection
              </span>
              <p className="text-slate-500 text-[11px]">
                Passwords and credit card numbers are masked and converted into JMeter variables automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* STATE 2: WHILE RECORDING (Live Status HUD & Stop Button) */}
      {/* ---------------------------------------------------------------- */}
      {isRecording && (
        <div className="p-6 md:p-8 bg-slate-950 rounded-3xl border border-indigo-500/40 text-white shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div className="flex items-center gap-3">
              <span className="relative flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
              </span>
              <div>
                <span className="text-[11px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-1.5">
                  RECORDING IN PROGRESS • MAX 45m / 5,000 REQUESTS
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">
                  Recording... {totalRequestCount} requests captured across {totalActionCount} actions
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-slate-300">
                <Clock size={14} className="text-slate-400" />
                <span className="font-bold text-white">{formatTime(elapsedSeconds)}</span>
              </div>

              <button
                id="btn-stop-record"
                type="button"
                onClick={() => handleStopRecording()}
                className="flex items-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-rose-600/30 transition-all hover:scale-105 animate-pulse"
              >
                <Square size={16} fill="currentColor" />
                Stop Recording
              </button>
            </div>
          </div>

          {/* Live Request Stream Mini-feed */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Activity size={14} className="text-cyan-400" /> Live Intercepted API / Document Calls
              </span>
              <span>{liveRequests.length} Kept Calls (Noise Filtered)</span>
            </div>

            <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 max-h-56 overflow-y-auto space-y-1.5 font-mono text-xs">
              {liveRequests.length === 0 ? (
                <div className="py-6 text-center text-slate-500 italic">
                  Interact with the opened browser window (click links, enter text, submit forms)...
                </div>
              ) : (
                liveRequests.slice(0, 10).map((req) => (
                  <div
                    key={req.id}
                    className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-1.5 text-[11px]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${
                            req.method === 'GET'
                              ? 'bg-blue-950 text-blue-300'
                              : req.method === 'POST'
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {req.method}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-slate-100 truncate">
                            {deriveRequestLabel(req, req.actionIntent || 'Action', true)}
                          </span>
                          <span className="text-slate-400 font-mono text-[10px] truncate max-w-md" title={req.url}>
                            {req.url}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {req.isPaymentGateway && (
                          <span className="px-1.5 py-0.5 bg-amber-950 text-amber-300 border border-amber-500/40 rounded text-[9px] font-bold">
                            {req.paymentGatewayName}
                          </span>
                        )}
                        <span className="text-emerald-400 font-bold">{req.status}</span>
                        <span className="text-slate-400">{req.responseTimeMs}ms</span>
                      </div>
                    </div>

                    {/* Show Data Entered below request only if user entered data while capturing */}
                    {req.formFields && req.formFields.length > 0 && (
                      <div className="pt-1.5 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="text-indigo-400 font-bold flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-emerald-400" /> Data Entered:
                        </span>
                        {req.formFields.map((field) => (
                          <span
                            key={field.key}
                            className={`px-1.5 py-0.5 rounded border font-mono flex items-center gap-1 ${
                              field.isSensitive
                                ? 'bg-amber-950/40 text-amber-300 border-amber-700/40'
                                : 'bg-slate-900 text-slate-200 border-slate-700/60'
                            }`}
                          >
                            <span className="text-slate-400">{field.key}:</span>
                            <span className="font-bold">
                              {field.isSensitive && !field.revealed ? '••••••••' : field.value}
                            </span>
                            {field.isSensitive && (
                              <button
                                type="button"
                                onClick={() => {
                                  setLiveRequests((prev) =>
                                    prev.map((r) =>
                                      r.id === req.id
                                        ? {
                                            ...r,
                                            formFields: r.formFields?.map((f) =>
                                              f.key === field.key ? { ...f, revealed: !f.revealed } : f
                                            )
                                          }
                                        : r
                                    )
                                  );
                                }}
                                className="text-amber-400 hover:text-amber-200 ml-0.5 cursor-pointer"
                                title={field.revealed ? 'Hide sensitive value' : 'Reveal sensitive value'}
                              >
                                {field.revealed ? <EyeOff size={10} /> : <Eye size={10} />}
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* STATE 3: REVIEW SCREEN (AFTER STOP, BEFORE .JMX GENERATION) */}
      {/* ---------------------------------------------------------------- */}
      {inReviewMode && !isRecording && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Header Summary & Session Metadata Banner */}
          <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {recordedSessionMeta?.isDemo ? (
                    <span className="px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1">
                      <Sparkles size={12} className="text-amber-600" /> Simulated Test Drive Demo
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-emerald-600" /> Live Browser Recording
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {scenarios.length} Scenarios • {totalKeptRequests} Filtered Requests
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  Review & Customize Captured Test Scenarios
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Inspect captured form fields, manage sensitive parameters, select scenarios, and compile into a clean JMeter .jmx test plan.
                </p>
              </div>

              {/* Action Buttons: Save Recording, Import Recording, Record Again */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSaveRecording}
                  disabled={scenarios.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                  title="Export recorded session to JSON"
                >
                  <Save size={14} /> Save Recording (.json)
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-sm"
                  title="Import previously saved recording JSON"
                >
                  <FileUp size={14} /> Import Recording
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setInReviewMode(false);
                    setScenarios([]);
                    setSelectedScenarioIds([]);
                    setGeneratedJmx(null);
                    setRecordedSessionMeta(null);
                    setLiveRequests([]);
                    liveRequestsRef.current = [];
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors shadow-sm"
                >
                  <RotateCcw size={14} /> Record Again
                </button>
              </div>
            </div>

            {/* Session Provenance Metadata Card */}
            {recordedSessionMeta && (
              <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <Globe size={13} className="text-indigo-600 shrink-0" />
                    <span className="font-semibold">Recorded URL:</span>
                    <span className="font-mono text-slate-900 font-bold bg-white px-2 py-0.5 rounded-lg border border-slate-200 text-[11px] max-w-xs truncate">
                      {recordedSessionMeta.targetUrl}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Clock size={13} className="text-cyan-600 shrink-0" />
                    <span className="font-semibold">Recorded At:</span>
                    <span className="text-slate-900 font-medium">
                      {recordedSessionMeta.formattedDate}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Activity size={13} className="text-emerald-600 shrink-0" />
                    <span className="font-semibold">Duration:</span>
                    <span className="text-slate-900 font-bold font-mono">
                      {formatTime(recordedSessionMeta.durationSeconds)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-semibold">Session ID:</span>
                  <code className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-[10.5px] font-mono text-slate-800 font-bold">
                    {recordedSessionMeta.sessionId}
                  </code>
                </div>
              </div>
            )}

            {/* Sub-Tabs: Scenarios Review vs Generated JMX Preview */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveReviewTab('scenarios')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeReviewTab === 'scenarios'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100'
                }`}
              >
                1. Review Scenarios ({scenarios.length})
              </button>
              {generatedJmx && (
                <button
                  type="button"
                  onClick={() => setActiveReviewTab('jmx_preview')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeReviewTab === 'jmx_preview'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 bg-slate-100'
                  }`}
                >
                  2. JMeter XML Preview & Download
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: SCENARIOS REVIEW */}
          {activeReviewTab === 'scenarios' && (
            <div className="space-y-6">
              {scenarios.length === 0 ? (
                <div className="bg-white p-10 md:p-14 rounded-3xl border border-slate-200 text-center space-y-4 shadow-sm">
                  <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                    <AlertTriangle size={24} className="text-amber-500" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      No Network Requests Captured in Session
                    </h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      Zero HTTP/HTTPS requests were recorded before the session ended. The browser window may have been closed before pages completed loading, or network calls were fully served from local cache.
                    </p>
                  </div>
                  {recordedSessionMeta && (
                    <div className="inline-block p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-mono text-slate-600 text-left">
                      <div>Target: <span className="text-slate-900 font-bold">{recordedSessionMeta.targetUrl}</span></div>
                      <div>Session ID: <span className="text-slate-900 font-bold">{recordedSessionMeta.sessionId}</span></div>
                      <div>Timestamp: <span className="text-slate-900 font-bold">{recordedSessionMeta.formattedDate}</span></div>
                    </div>
                  )}
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setInReviewMode(false);
                        setScenarios([]);
                        setSelectedScenarioIds([]);
                        setGeneratedJmx(null);
                        setRecordedSessionMeta(null);
                        setLiveRequests([]);
                        liveRequestsRef.current = [];
                      }}
                      className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-xl text-xs font-bold hover:brightness-110 shadow-md transition-all inline-flex items-center gap-2"
                    >
                      <RotateCcw size={14} /> Start New Recording
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Scenario Selection Toolbar (Enhancement 2) */}
                  <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-800 flex items-center gap-1.5">
                        <CheckSquare size={14} className="text-indigo-600" />
                        Scenarios to Include in .JMX Test Plan:
                      </span>
                      <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-bold">
                        {selectedScenarioIds.length} of {scenarios.length} selected
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectAllScenarios(true)}
                        className="px-2.5 py-1 text-indigo-600 hover:bg-indigo-50 rounded-lg font-semibold transition-colors"
                      >
                        Select All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => handleSelectAllScenarios(false)}
                        className="px-2.5 py-1 text-slate-500 hover:bg-slate-100 rounded-lg font-semibold transition-colors"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {scenarios.map((scen, sIdx) => {
                    const isSelected = selectedScenarioIds.includes(scen.id);

                    return (
                      <div
                        key={scen.id}
                        className={`bg-white rounded-3xl border transition-all shadow-sm overflow-hidden ${
                          isSelected ? 'border-slate-200' : 'border-slate-200 opacity-60'
                        }`}
                      >
                        {/* Scenario Section Header */}
                        <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            {/* Scenario Selection Checkbox */}
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleScenarioSelect(scen.id)}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                              title={isSelected ? 'Exclude scenario from JMeter export' : 'Include scenario in JMeter export'}
                            />

                            <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-sm">
                              {sIdx + 1}
                            </span>

                            {/* Editable Scenario Name */}
                            {scen.isEditingName ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  defaultValue={scen.name}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleUpdateScenarioName(scen.id, (e.target as HTMLInputElement).value);
                                    }
                                  }}
                                  onBlur={(e) => handleUpdateScenarioName(scen.id, e.target.value)}
                                  autoFocus
                                  className="px-3 py-1 bg-white border border-indigo-500 rounded-lg text-sm font-bold text-slate-900 focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-400">Press Enter to save</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-extrabold text-slate-900">{scen.name}</h4>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setScenarios((prev) =>
                                      prev.map((s) =>
                                        s.id === scen.id ? { ...s, isEditingName: true } : s
                                      )
                                    );
                                  }}
                                  className="text-slate-400 hover:text-indigo-600 p-1 transition-colors"
                                  title="Rename Scenario"
                                >
                                  <Edit3 size={13} />
                                </button>
                              </div>
                            )}

                            <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-bold border border-indigo-100 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                              1 Primary Request
                            </span>
                            {scen.requests.length > 1 && (
                              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md font-medium">
                                +{scen.requests.length - 1} supporting
                              </span>
                            )}
                          </div>

                          {/* Remove Scenario Button */}
                          <button
                            type="button"
                            onClick={() => handleRemoveScenario(scen.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl transition-all font-semibold"
                          >
                            <Trash2 size={13} /> Remove Scenario
                          </button>
                        </div>

                        {/* Payment Gateway Warning Banner */}
                        {scen.hasPaymentGateway && (
                          <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
                            <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                            <div>
                              <span className="font-bold">
                                ⚠️ Payment gateway detected ({scen.paymentGatewayDomain || 'External Processor'})
                              </span>{' '}
                              — confirm this is a test/sandbox environment before including in a load test.
                            </div>
                          </div>
                        )}

                        {/* Request Cards: 1 Primary Request + Collapsible Supporting Requests */}
                        {(() => {
                          const primaryReq = scen.primaryRequest || scen.requests.find((r) => r.id === scen.primaryRequestId) || scen.requests[0];
                          const supportingReqs = scen.supportingRequests || scen.requests.filter((r) => r.id !== primaryReq?.id);
                          const isSupportingOpen = !!expandedSupportingMap[scen.id];

                          const renderRequestCard = (req: CapturedNetworkRequest, isPrimary: boolean) => {
                            const isRawOpen = !!showRawPayloadMap[req.id];

                            return (
                              <div key={req.id} className={`p-5 space-y-3 transition-colors ${isPrimary ? 'bg-white' : 'bg-slate-50/40 hover:bg-slate-50'}`}>
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                  <div className="flex items-center gap-2.5 overflow-hidden flex-wrap">
                                    {isPrimary ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-indigo-600 text-white tracking-wide shadow-xs">
                                        Primary Action Request
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                                        Supporting
                                      </span>
                                    )}
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                        req.method === 'GET'
                                          ? 'bg-blue-100 text-blue-800'
                                          : req.method === 'POST'
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {req.method}
                                    </span>
                                    <span className="font-mono text-xs font-bold text-slate-800 truncate" title={req.url}>
                                      {req.url}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0 text-xs">
                                    <span
                                      className={`font-mono font-bold px-2 py-0.5 rounded ${
                                        req.status < 400
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-rose-50 text-rose-700'
                                      }`}
                                    >
                                      {req.status} OK
                                    </span>
                                    <span className="text-slate-400 font-mono">{req.responseTimeMs}ms</span>

                                    {/* Raw Payload toggle */}
                                    {req.rawBody && (
                                      <button
                                        type="button"
                                        onClick={() => handleToggleRawPayload(req.id)}
                                        className="text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded-lg border border-indigo-200 bg-indigo-50/60 font-semibold text-[11px]"
                                      >
                                        {isRawOpen ? 'Hide Raw Body' : 'View Raw Body'}
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveRequest(scen.id, req.id)}
                                      className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                                      title="Remove Request"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>

                                {/* Correlated Dynamic Value Badge */}
                                {req.correlatedDynamicValue && (
                                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-center gap-2">
                                    <span className="text-indigo-600 font-bold">🔗 Correlated:</span>
                                    <span>
                                      Value comes from previous <strong>{req.correlatedDynamicValue.sourceScenario}</strong>{' '}
                                      response (<code className="font-mono bg-white px-1.5 py-0.5 rounded text-indigo-700 font-bold">\${'{' + req.correlatedDynamicValue.variableName + '}'}</code>) — dynamically extracted in JMeter.
                                    </span>
                                  </div>
                                )}

                                {/* Raw Payload Collapsible Code View */}
                                {isRawOpen && req.rawBody && (
                                  <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 space-y-2 animate-in fade-in">
                                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                                      <span className="font-mono font-bold text-cyan-400">Submitted Request Body (Raw Payload)</span>
                                      <button
                                        type="button"
                                        onClick={() => navigator.clipboard.writeText(req.rawBody || '')}
                                        className="hover:text-white px-2 py-0.5 rounded bg-slate-800 flex items-center gap-1 font-mono"
                                      >
                                        <Copy size={11} /> Copy
                                      </button>
                                    </div>
                                    <pre className="text-xs font-mono text-emerald-300 max-h-48 overflow-y-auto leading-relaxed custom-scrollbar whitespace-pre-wrap break-all">
                                      {req.rawBody}
                                    </pre>
                                  </div>
                                )}

                                {/* Data Entered / Submitted: Readable Key-Value View */}
                                {req.formFields && req.formFields.length > 0 && (
                                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                                      Data Entered / Submitted (Key-Value Inspection)
                                    </span>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                      {req.formFields.map((field) => (
                                        <div
                                          key={field.key}
                                          className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between gap-1.5 ${
                                            field.isSensitive
                                              ? 'bg-amber-50/60 border-amber-200'
                                              : 'bg-white border-slate-200'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-bold text-slate-700 font-mono text-[11px] flex items-center gap-1">
                                              {field.isSensitive && <Lock size={11} className="text-amber-600" />}
                                              {field.key}:
                                            </span>

                                            {/* Sensitive Field Mask Toggle */}
                                            {field.isSensitive && (
                                              <button
                                                type="button"
                                                onClick={() => handleToggleFieldReveal(scen.id, req.id, field.key)}
                                                className="text-slate-400 hover:text-slate-700 p-0.5"
                                                title={field.revealed ? 'Hide sensitive value' : 'Reveal sensitive value'}
                                              >
                                                {field.revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                                              </button>
                                            )}
                                          </div>

                                          {/* Value Display */}
                                          <div className="font-mono text-xs text-slate-900 font-semibold break-all">
                                            {field.isSensitive && !field.revealed ? '••••••••••••' : field.value}
                                          </div>

                                          {/* Per-field Sensitivity Action Selector */}
                                          {field.isSensitive && (
                                            <div className="pt-1.5 border-t border-amber-200/80 flex flex-col gap-1 text-[11px]">
                                              <label className="flex items-center gap-1.5 cursor-pointer text-amber-900 font-bold">
                                                <input
                                                  type="radio"
                                                  name={`sens_${req.id}_${field.key}`}
                                                  checked={field.action === 'parameterize'}
                                                  onChange={() =>
                                                    handleToggleFieldSensitivity(scen.id, req.id, field.key, 'parameterize')
                                                  }
                                                  className="text-indigo-600 focus:ring-0"
                                                />
                                                <span>Keep masked & auto-parameterize</span>
                                                <code className="bg-amber-100 text-amber-800 px-1 py-0.2 rounded text-[10px]">
                                                  \${'{' + field.key.replace(/[^a-zA-Z0-9_]/g, '_') + '}'}
                                                </code>
                                              </label>

                                              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                                                <input
                                                  type="radio"
                                                  name={`sens_${req.id}_${field.key}`}
                                                  checked={field.action === 'hardcode'}
                                                  onChange={() =>
                                                    handleToggleFieldSensitivity(scen.id, req.id, field.key, 'hardcode')
                                                  }
                                                  className="text-rose-600 focus:ring-0"
                                                />
                                                <span className="text-rose-600 font-semibold">
                                                  Reveal & keep as-is (hardcodes into .jmx)
                                                </span>
                                              </label>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          };

                          return (
                            <div>
                              {/* Primary Request */}
                              {primaryReq && renderRequestCard(primaryReq, true)}

                              {/* Supporting / Background Auxiliary Requests (Collapsible) */}
                              {supportingReqs.length > 0 && (
                                <div className="border-t border-slate-200 bg-slate-50/70">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSupportingRequests(scen.id)}
                                    className="w-full px-5 py-3 flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-slate-100/70 transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      {isSupportingOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                      <span>
                                        {isSupportingOpen ? 'Hide' : 'Show'} {supportingReqs.length} supporting auxiliary {supportingReqs.length === 1 ? 'call' : 'calls'} (redirects, auxiliary APIs)
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-400 font-mono">
                                      {isSupportingOpen ? 'Click to collapse' : 'Click to inspect'}
                                    </span>
                                  </button>
                                  {isSupportingOpen && (
                                    <div className="divide-y divide-slate-100 border-t border-slate-200 bg-white">
                                      {supportingReqs.map((req) => renderRequestCard(req, false))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Editable Load Test Parameters before Generation */}
              <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-5">
                <h4 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                  <Sliders size={16} className="text-indigo-600" /> JMeter Load Test Parameters
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Users size={14} className="text-indigo-600" /> Virtual Users (Threads)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={jmeterConfig.numThreads}
                      onChange={(e) =>
                        setJmeterConfig({ ...jmeterConfig, numThreads: parseInt(e.target.value) || 1 })
                      }
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Total concurrent virtual users</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Clock size={14} className="text-cyan-600" /> Ramp-up Time (Seconds)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={3600}
                      value={jmeterConfig.rampTime}
                      onChange={(e) =>
                        setJmeterConfig({ ...jmeterConfig, rampTime: parseInt(e.target.value) || 0 })
                      }
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Time to scale up to full users</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Repeat size={14} className="text-emerald-600" /> Loop Count
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={jmeterConfig.loopCount}
                      onChange={(e) =>
                        setJmeterConfig({ ...jmeterConfig, loopCount: parseInt(e.target.value) || 1 })
                      }
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Repetitions per virtual user</p>
                  </div>
                </div>

                {/* Generate Button with Dynamic Label */}
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">
                    Ready to compile {selectedScenarioIds.length > 0 ? selectedScenarioIds.length : scenarios.length} of {scenarios.length} scenarios into a clean, well-formed JMeter test plan.
                  </span>

                  <button
                    id="btn-generate-jmx"
                    type="button"
                    disabled={selectedScenarioIds.length === 0 && scenarios.length > 0}
                    onClick={() => {
                      handleGenerateJmx();
                      setActiveReviewTab('jmx_preview');
                    }}
                    className="flex items-center gap-2 px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-indigo-500/25 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Sparkles size={16} />
                    {selectedScenarioIds.length === 0 && scenarios.length > 0
                      ? 'Select at least 1 scenario'
                      : selectedScenarioIds.length === scenarios.length
                      ? `Generate .jmx (All ${scenarios.length} Scenarios)`
                      : selectedScenarioIds.length === 1
                      ? `Generate .jmx (${scenarios.find((s) => s.id === selectedScenarioIds[0])?.name.replace(/^Scenario \d+:\s*/, '').split(' (')[0] || 'Selected Scenario'} only)`
                      : `Generate .jmx (${selectedScenarioIds.length} of ${scenarios.length} Scenarios)`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* STATE 4: AFTER GENERATION (Preview & Download) */}
          {/* ---------------------------------------------------------------- */}
          {activeReviewTab === 'jmx_preview' && generatedJmx && (
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1">
                      <CheckCircle2 size={12} /> .JMX Test Plan Generated
                    </span>
                    <span className="text-xs text-slate-400 font-mono">{generatedFilename}</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">
                    Ready to Download & Execute in Apache JMeter
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configured with Cookie Manager, Transaction Controllers, Parameterized Variables, and Result Listeners.
                  </p>
                </div>

                {/* Primary Download Button */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    id="btn-download-jmx"
                    type="button"
                    onClick={handleDownloadJmx}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-emerald-600/25 hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Download size={16} /> Download .jmx
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedJmx);
                      setCopiedJmx(true);
                      setTimeout(() => setCopiedJmx(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                    title="Copy XML"
                  >
                    {copiedJmx ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* Validation notice */}
              {xmlValidationError ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
                  <AlertTriangle size={15} className="text-amber-600" />
                  <span>{xmlValidationError}</span>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  <span>Valid Apache JMeter 5.x XML format verified. Opens cleanly in GUI or CLI.</span>
                </div>
              )}

              {/* XML Code Viewer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
                  <span>XML Content Preview</span>
                  <span>{generatedJmx.split('\n').length} lines</span>
                </div>
                <pre className="p-4 bg-slate-950 text-emerald-400 rounded-2xl text-xs font-mono max-h-96 overflow-y-auto overflow-x-auto border border-slate-800 leading-relaxed custom-scrollbar">
                  {generatedJmx}
                </pre>
              </div>

              {/* Back to Edit Button */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveReviewTab('scenarios')}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                >
                  ← Back to Review & Edit Scenarios
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setInReviewMode(false);
                    setScenarios([]);
                    setGeneratedJmx(null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 font-semibold"
                >
                  Start New Session
                </button>
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* TAB 2: SAVED RECORDINGS LIBRARY */}
      {/* ---------------------------------------------------------------- */}
      {activeTopTab === 'saved_recordings' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Controls Bar: Search, Stats, Import, New Recording */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="search-saved-recordings"
                type="text"
                value={savedSearchQuery}
                onChange={(e) => setSavedSearchQuery(e.target.value)}
                placeholder="Search by name, website domain, or folder..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
              {savedSearchQuery && (
                <button
                  type="button"
                  onClick={() => setSavedSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                id="btn-import-saved-recording"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <FileUp size={14} /> Import Recording (.json)
              </button>

              <button
                type="button"
                id="btn-switch-to-new-record"
                onClick={() => {
                  setInReviewMode(false);
                  setActiveTopTab('recorder');
                }}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-200 hover:brightness-105 active:scale-95 transition-all cursor-pointer"
              >
                <Play size={14} fill="currentColor" /> Record New Journey
              </button>
            </div>
          </div>

          {/* Recordings List */}
          {(() => {
            const query = savedSearchQuery.toLowerCase().trim();
            const filtered = savedRecordingsList.filter((r) => {
              if (!query) return true;
              return (
                r.name.toLowerCase().includes(query) ||
                r.targetUrl.toLowerCase().includes(query) ||
                (r.saveLocation && r.saveLocation.toLowerCase().includes(query)) ||
                (r.folderName && r.folderName.toLowerCase().includes(query)) ||
                r.scenarios.some((s) => s.name.toLowerCase().includes(query))
              );
            });

            if (filtered.length === 0) {
              return (
                <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-sm">
                    <FolderArchive size={32} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-slate-900">
                      {savedSearchQuery ? 'No recordings matched your search' : 'No Saved Recordings Yet'}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      {savedSearchQuery
                        ? 'Try modifying your search term or clear the filter to see all recordings.'
                        : 'Record and save test journeys on any web application, or import an existing JSON recording session.'}
                    </p>
                  </div>
                  <div className="flex justify-center gap-3 pt-2">
                    {savedSearchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSavedSearchQuery('')}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
                      >
                        Clear Search Filter
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setActiveTopTab('recorder')}
                          className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 hover:bg-indigo-700 cursor-pointer"
                        >
                          <Play size={14} fill="currentColor" /> Record First Journey
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 cursor-pointer"
                        >
                          <FileUp size={14} /> Import JSON File
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 gap-4">
                {filtered.map((rec) => (
                  <div
                    key={rec.id}
                    className="bg-white rounded-3xl border border-slate-200/90 hover:border-indigo-300 p-6 shadow-sm hover:shadow-md transition-all space-y-4 group"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {rec.name}
                          </h4>
                          {rec.folderName ? (
                            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-[10px] font-extrabold flex items-center gap-1">
                              <Folder size={11} /> {rec.folderName}
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">
                              {rec.saveLocation || 'Performance Scripts'}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1 font-mono text-slate-700 font-semibold">
                            <Globe size={13} className="text-indigo-600" />
                            {rec.targetUrl}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={13} className="text-cyan-600" />
                            {new Date(rec.savedAt).toLocaleDateString()} {new Date(rec.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="flex items-center gap-1 font-bold text-slate-700">
                            <Layers size={13} className="text-emerald-600" />
                            {rec.scenariosCount} Scenarios • {rec.requestsCount} Filtered Calls
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadSavedRecording(rec)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 transition-all cursor-pointer"
                          title="Open this recording in the interactive review and JMeter generation screen"
                        >
                          <Sliders size={13} /> Load & Review Plan
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadSavedJmx(rec)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          title="Download JMeter .jmx test plan directly"
                        >
                          <FileCode size={13} /> Export .JMX
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadSavedJson(rec)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          title="Export recording JSON"
                        >
                          <Download size={13} /> Export JSON
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteSavedRecording(rec.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                          title="Delete recording from library"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Scenarios preview pills */}
                    {rec.scenarios && rec.scenarios.length > 0 && (
                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-400 mr-1 uppercase tracking-wider">
                          Scenarios:
                        </span>
                        {rec.scenarios.slice(0, 6).map((sc, idx) => (
                          <span
                            key={sc.id || idx}
                            className="px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-[11px] font-semibold text-slate-700 flex items-center gap-1"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            {sc.name}
                          </span>
                        ))}
                        {rec.scenarios.length > 6 && (
                          <span className="px-2 py-1 text-[11px] text-slate-400 font-bold">
                            +{rec.scenarios.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* Save Recording to Project Folder Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 border border-slate-100 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                  <FolderTree size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800">Save Recording to Project</h3>
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Store performance script & scenarios in project folder</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-all"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Artifact Name</label>
                <input
                  type="text"
                  value={saveScriptName}
                  onChange={(e) => setSaveScriptName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="e.g. E-Commerce Checkout Performance Test"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Target Automation Folder</label>
                <select
                  value={saveFolderId}
                  onChange={(e) => setSaveFolderId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="">Root Project Folder (No Folder)</option>
                  {(project?.automationFolders || []).map((f) => (
                    <option key={f.id} value={f.id}>
                      📁 {f.name}
                    </option>
                  ))}
                  <option value="__NEW__">➕ Create New Folder...</option>
                </select>
              </div>

              {saveFolderId === '__NEW__' && (
                <div>
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-1.5">New Folder Name</label>
                  <input
                    type="text"
                    value={newFolderNameInput}
                    onChange={(e) => setNewFolderNameInput(e.target.value)}
                    className="w-full px-4 py-3 bg-indigo-50/50 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    placeholder="e.g. Performance Test Suites"
                    autoFocus
                  />
                </div>
              )}

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 space-y-1">
                <p className="font-bold text-slate-700">📦 Included in Save:</p>
                <ul className="list-disc list-inside text-[11px] text-slate-500 space-y-0.5">
                  <li>{scenarios.length} recorded test scenarios</li>
                  <li>Form fields, sensitive masks, and dynamic parameterizations</li>
                  <li>Ready for re-opening, editing, and JMeter test execution</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleExportJsonDownload}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                Download JSON File
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveToProject}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-100 transition-all flex items-center gap-1.5"
              >
                <Save size={14} /> Save to Project Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Download Quality Validation Warning Modal */}
      {showValidationWarningModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl p-6 sm:p-8 border border-amber-200/80 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl shadow-sm">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Pre-Download Script Quality Notice</h3>
                  <p className="text-[11px] text-amber-700 font-bold uppercase tracking-wider">
                    {jmxValidationWarnings.length} {jmxValidationWarnings.length === 1 ? 'Sampler Notice' : 'Sampler Notices'} Detected
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowValidationWarningModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 bg-amber-50/70 border border-amber-200/60 rounded-2xl text-xs text-amber-900 leading-relaxed">
                The following action samplers contain an empty body or no submitted form parameters. If you ran this test in JMeter, the server would receive empty payload data:
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {jmxValidationWarnings.map((warn) => (
                  <div key={warn.id} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{warn.scenarioName}</span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-black rounded text-[10px]">
                        {warn.method}
                      </span>
                    </div>
                    <p className="text-slate-600 font-mono text-[11px] truncate">{warn.path}</p>
                    <p className="text-amber-700 text-[11px]">{warn.message}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowValidationWarningModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Review Scenarios
              </button>
              <button
                type="button"
                onClick={executeDownloadJmx}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-100 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} /> Download Anyway (.JMX)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {saveSuccessMessage && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="bg-emerald-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-700">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span className="text-xs font-bold">{saveSuccessMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
};
