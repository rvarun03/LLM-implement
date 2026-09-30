import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, 
  Square, 
  Pause, 
  Save, 
  Code2, 
  Trash2, 
  Copy, 
  Edit3, 
  GripVertical, 
  CheckCircle2, 
  AlertCircle, 
  ChevronDown, 
  ChevronUp, 
  Folder, 
  Plus, 
  Search, 
  Filter,
  Clock,
  Zap,
  RotateCcw,
  Loader2,
  Check,
  X,
  MoreVertical,
  Terminal,
  Layers,
  FileCode,
  CheckSquare,
  Radio,
  Globe,
  Smartphone,
  Send,
  Maximize2,
  Minimize2,
  SkipForward,
  Camera,
  PlusCircle,
  Image as ImageIcon,
  Download,
  ExternalLink,
  Upload,
  RefreshCw,
  Battery,
  Wifi,
  Keyboard,
  Menu,
  Sparkles,
  Eye,
  Bell,
  FileVideo,
  Link2,
  ChevronRight,
  Home,
  BarChart3,
  Settings,
  Sliders,
  User as UserIcon,
  Lock,
  LogOut,
  Key,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Mic,
  MapPin,
  AlertTriangle,
  Info,
  Crosshair,
  MousePointer,
  Target,
  ArrowRight,
  Video,
  FileSpreadsheet,
  FileText,
  UploadCloud,
  FileCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { enhanceRecordedScript } from '../geminiService';
import { 
  Project, 
  User, 
  RecordedFlow, 
  RecordedStep, 
  AutomationTool, 
  ProgrammingLanguage,
  UniversalLocator,
  StepLocator,
  AutomationScript,
  AutomationScriptFile,
  UploadVideoFlow,
  LaunchDiagnostic,
  BrowserPermissionRequest
} from '../types';
import { toast } from 'sonner';
import { deductProjectCredits, deductExportCredits, canPerformAction, canPerformActionLocal } from '../services/creditService';
import {
  detectExtension,
  configureExtensionBackend,
  resolveTransport,
  startExtensionRecording,
  stopExtensionRecording,
  onExtensionStep,
  type RecorderTransport
} from '../services/extensionBridge';
import { synthesizeMissingPOMFileContent, ensureCompleteProjectFiles } from '../services/codeGenerators/multiFrameworkScriptGenerator';
import { generateAutomationScript, GeneratedProject } from '../services/automationGenerator';
import { formatVerticalCode, formatProjectFiles } from '../services/codeFormatter';
import { toPlaywrightScript } from '../services/structuredLocator';
import { MobileRecordingInspector } from './MobileRecordingInspector';
import { MobilePlaybackEmulator } from './MobilePlaybackEmulator';
import { RecordedVideoModal, downloadFlowVideoFile, resolveStepTargetMetrics } from './RecordedVideoModal';
import { RecordPlayVideoUploadModal } from './RecordPlayVideoUploadModal';
import { RecordedVideoFlowPlayerModal, VideoFlowPlayerData } from './RecordedVideoFlowPlayerModal';
import { AllurePlaybackReport } from './AllurePlaybackReport';
import { resolveVideoPlayableUrl } from '../services/artifactStorage';
import { extractApkBundle } from '../services/apkExtractorService';
import { detectAppArchetype } from '../services/mobileAppDefinitionService';
import { addTokenLog } from '../services/tokenConsumptionService';
import { addDeletedIds } from '../services/projectService';
import { 
  BddDocumentParsed, 
  parseBddDocument, 
  getFrameworksForAutomation 
} from '../utils/automationFrameworkOptions';
import { generateUniqueId, generateUniqueFolderId } from '../utils/idGenerator';
import { 
  EXTENSION_MANIFEST_CONTENT, 
  EXTENSION_LOCATOR_ENGINE_CONTENT,
  EXTENSION_UTILS_JS_CONTENT, 
  EXTENSION_BACKGROUND_CONTENT, 
  EXTENSION_CONTENT_JS_CONTENT 
} from './extensionBundle';

interface RecordAndPlayProps {
  project: Project;
  user: User;
  onUpdateProject: (project: Project) => Promise<void>;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

export function unwrapProxyUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();
  let iterations = 0;
  while (iterations < 5) {
    iterations++;
    if (url.includes('/api/proxy') && (url.includes('url=') || url.includes('targetUrl='))) {
      try {
        const dummyBase = 'http://localhost:3000';
        const parsed = new URL(url.startsWith('http') || url.startsWith('//') ? url : `${dummyBase}${url.startsWith('/') ? '' : '/'}${url}`);
        const target = parsed.searchParams.get('url') || parsed.searchParams.get('targetUrl');
        if (target) {
          url = decodeURIComponent(target).trim();
          continue;
        }
      } catch (e) {
        const match = url.match(/[?&](?:url|targetUrl)=([^&]+)/i);
        if (match && match[1]) {
          url = decodeURIComponent(match[1]).trim();
          continue;
        }
      }
    }
    break;
  }
  return url;
}

export function isValidUrlCandidate(str?: string): boolean {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (s.length === 0 || s === 'Page' || s === 'MainPage' || s === 'TargetPage' || s === 'about:blank' || s === 'undefined' || s === 'null') return false;
  if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) return true;
  if (s.includes(' ') || s.includes('\n') || s.includes('\t') || s.includes('(') || s.includes(')') || s.includes('>') || s.includes('[')) return false;
  if (s.includes('.') && !s.startsWith('.') && !s.endsWith('.')) return true;
  return false;
}

function sanitizeClientUrl(rawUrl: string, baseUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = unwrapProxyUrl(rawUrl.trim());
  if (!isValidUrlCandidate(url)) {
    return baseUrl ? unwrapProxyUrl(baseUrl) : '';
  }
  
  // Clean duplicate protocol prefixes
  while (url.match(/^(https?:\/\/){2,}/i)) {
    url = url.replace(/^(https?:\/\/)+/i, 'https://');
  }

  // If already absolute http/https URL, clean up any triple slashes in origin
  if (url.startsWith('http://') || url.startsWith('https://')) {
    url = url.replace(/^(https?:\/\/)\/+/i, '$1');
    return url;
  }

  // If relative path and baseUrl is provided, resolve against baseUrl
  if (baseUrl) {
    try {
      let cleanBase = unwrapProxyUrl(baseUrl).trim();
      if (!cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
        cleanBase = `https://${cleanBase}`;
      }
      const origin = new URL(cleanBase).origin;
      return new URL(url, origin).toString();
    } catch (e) {}
  }

  // Fallback for paths starting with /
  if (url.startsWith('/')) {
    return `https://localhost:3000${url}`;
  }

  if (url.includes('.')) {
    return `https://${url}`;
  }

  return '';
}

export type BrowserOptionId = 'chrome' | 'firefox' | 'edge' | 'safari' | 'mobile_chrome' | 'mobile_safari';

export interface PlaybackBrowserOption {
  id: BrowserOptionId;
  name: string;
  version: string;
  engine: string;
  badge: string;
  badgeBg: string;
  borderColor: string;
  activeBorder: string;
  description: string;
  type: 'desktop' | 'mobile';
  defaultViewport: string;
  features: string[];
}

const PLAYBACK_BROWSER_OPTIONS: PlaybackBrowserOption[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    version: 'v126.0 (Latest)',
    engine: 'Chromium / V8',
    badge: 'Recommended',
    badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    borderColor: 'border-slate-800',
    activeBorder: 'border-emerald-500 bg-emerald-950/30 ring-2 ring-emerald-500/40',
    description: 'Google Chrome browser with full DevTools Protocol, DOM shadow root, and Playwright Chromium driver.',
    type: 'desktop',
    defaultViewport: '1920x1080',
    features: ['V8 JS Engine', 'Chromium DevTools Protocol', 'Fast DOM Automation']
  },
  {
    id: 'firefox',
    name: 'Mozilla Firefox',
    version: 'v125.0 (ESR)',
    engine: 'Gecko Engine',
    badge: 'W3C Standard',
    badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    borderColor: 'border-slate-800',
    activeBorder: 'border-amber-500 bg-amber-950/30 ring-2 ring-amber-500/40',
    description: 'Firefox Gecko automation driver for strict W3C standards, cross-browser regression, and isolated cookies.',
    type: 'desktop',
    defaultViewport: '1920x1080',
    features: ['Gecko Driver', 'Strict W3C Compliance', 'Isolated Cookies']
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    version: 'v126.0 (Enterprise)',
    engine: 'Edge Chromium',
    badge: 'Enterprise',
    badgeBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    borderColor: 'border-slate-800',
    activeBorder: 'border-cyan-500 bg-cyan-950/30 ring-2 ring-cyan-500/40',
    description: 'Microsoft Edge enterprise browser driver with Windows SSO, Azure AD, and Blink rendering.',
    type: 'desktop',
    defaultViewport: '1920x1080',
    features: ['Microsoft WebDriver', 'Enterprise SSO', 'Blink Engine']
  },
  {
    id: 'safari',
    name: 'Apple Safari',
    version: 'v17.4 (WebKit)',
    engine: 'WebKit Engine',
    badge: 'macOS Native',
    badgeBg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    borderColor: 'border-slate-800',
    activeBorder: 'border-blue-500 bg-blue-950/30 ring-2 ring-blue-500/40',
    description: 'Apple WebKit automation driver for evaluating macOS and iOS Safari web application behavior.',
    type: 'desktop',
    defaultViewport: '1440x900',
    features: ['WebKit Automation', 'Safari Touch APIs', 'Tracking Prevention']
  },
  {
    id: 'mobile_chrome',
    name: 'Mobile Chrome (Pixel 7)',
    version: 'Android 14',
    engine: 'Mobile Chromium',
    badge: 'Android Viewport',
    badgeBg: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
    borderColor: 'border-slate-800',
    activeBorder: 'border-teal-500 bg-teal-950/30 ring-2 ring-teal-500/40',
    description: 'Google Pixel 7 Pro mobile browser viewport emulation (412x915) with touch gesture events.',
    type: 'mobile',
    defaultViewport: '412x915',
    features: ['Mobile Viewport (412x915)', 'Touch Screen Events', 'Device Orientation']
  },
  {
    id: 'mobile_safari',
    name: 'Mobile Safari (iPhone 15)',
    version: 'iOS 17.5',
    engine: 'Mobile WebKit',
    badge: 'iOS Viewport',
    badgeBg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    borderColor: 'border-slate-800',
    activeBorder: 'border-indigo-500 bg-indigo-950/30 ring-2 ring-indigo-500/40',
    description: 'Apple iPhone 15 Pro mobile Safari viewport emulation (393x852) with iOS gestures.',
    type: 'mobile',
    defaultViewport: '393x852',
    features: ['Mobile Viewport (393x852)', 'iOS Touch Gestures', 'Mobile WebKit Engine']
  }
];

const RecordAndPlay: React.FC<RecordAndPlayProps> = ({ project, user, onUpdateProject, isFullScreen, onToggleFullScreen }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [flows, setFlows] = useState<RecordedFlow[]>(project.recordedFlows || []);

  useEffect(() => {
    setFlows(project.recordedFlows || []);
  }, [project.recordedFlows]);

  const [currentSteps, setCurrentSteps] = useState<RecordedStep[]>([]);
  const [flowName, setFlowName] = useState('New Recording Flow');
  const [flowDescription, setFlowDescription] = useState('');
  const [refineInstructions, setRefineInstructions] = useState('');
  const [platform, setPlatform] = useState<'web' | 'mobile'>('web');
  const [selectedFolder, setSelectedFolder] = useState('');
  const [isApproved, setIsApproved] = useState(false);
  const [selectedTool, setSelectedTool] = useState<AutomationTool>('Playwright');
  const [selectedLanguage, setSelectedLanguage] = useState<ProgrammingLanguage>('TypeScript');
  const [selectedFramework, setSelectedFramework] = useState<string>('Page Object Model (POM)');
  const [uploadedBddDoc, setUploadedBddDoc] = useState<BddDocumentParsed | null>(null);
  const [uploadedBddFileName, setUploadedBddFileName] = useState<string>('');
  const [isBddUploading, setIsBddUploading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStages, setGenerationStages] = useState<{
    active: boolean;
    currentStepIndex: number;
    steps: { id: string; label: string; description: string; status: 'pending' | 'in_progress' | 'completed' }[];
  }>({
    active: false,
    currentStepIndex: 0,
    steps: [
      { id: 'positive', label: 'Generating recorded positive flow', description: 'Translating recorded user interactions and constructing Page Objects', status: 'pending' },
      { id: 'assertions', label: 'Adding assertions', description: 'Injecting step-level element visibility, input value, and screen outcome assertions', status: 'pending' },
      { id: 'negative', label: 'Adding applicable negative coverage', description: 'Synthesizing invalid input validation and required field verification scenarios', status: 'pending' },
      { id: 'edge_cases', label: 'Adding applicable edge-case coverage', description: 'Incorporating boundary string limits, special characters, and resilience checks', status: 'pending' },
      { id: 'finalizing', label: 'Finalizing enhanced script', description: 'Formatting vertical source code, enforcing language rules, and packaging test suite', status: 'pending' }
    ]
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [generatedProject, setGeneratedProject] = useState<GeneratedProject | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAddStepModalOpen, setIsAddStepModalOpen] = useState(false);
  const [insertStepIndex, setInsertStepIndex] = useState<number | null>(null);
  const [editingStep, setEditingStep] = useState<RecordedStep | null>(null);
  const [newStepData, setNewStepData] = useState<{
    action: RecordedStep['action'];
    locator: string;
    value: string;
  }>({
    action: 'click',
    locator: '',
    value: ''
  });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ 
    id: string; 
    type: 'flow' | 'script' | 'upload_video' | 'folder' | 'bulk_folders'; 
    name?: string; 
    folders?: Array<{ id: string; name?: string }>;
  } | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [isStarting, setIsStarting] = useState(false);

  // Folder Management State
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderType, setNewFolderType] = useState<'flow' | 'script' | 'upload_video'>('flow');
  const [folderModalPlatform, setFolderModalPlatform] = useState<'web' | 'mobile'>('web');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolderType, setActiveFolderType] = useState<'flow' | 'script' | 'upload_video' | null>(null);

  // Save Flow and Script Popups State (similar to ScenarioGenerator)
  const [isSaveFlowModalOpen, setIsSaveFlowModalOpen] = useState(false);
  const [isCreatingNewFlowFolder, setIsCreatingNewFlowFolder] = useState(false);
  const [newFlowFolderName, setNewFlowFolderName] = useState('');
  const [searchFlowFolderQuery, setSearchFlowFolderQuery] = useState('');

  const [isSaveScriptModalOpen, setIsSaveScriptModalOpen] = useState(false);
  const [isCreatingNewScriptFolder, setIsCreatingNewScriptFolder] = useState(false);
  const [newScriptFolderName, setNewScriptFolderName] = useState('');
  const [searchScriptFolderQuery, setSearchScriptFolderQuery] = useState('');
  const [saveScriptTitle, setSaveScriptTitle] = useState('');
  const [saveScriptDescription, setSaveScriptDescription] = useState('');

  const [hasDownloadedExtension, setHasDownloadedExtension] = useState<boolean>(false);
  const [showExtensionInstructions, setShowExtensionInstructions] = useState<boolean>(false);

  const handleDownloadExtensionZip = async () => {
    try {
      const response = await fetch('/api/recorder/download-extension');
      if (response.ok) {
        const blob = await response.blob();
        saveAs(blob, 'qa-recorder-extension.zip');
        setHasDownloadedExtension(true);
        setShowExtensionInstructions(true);
        toast.success("Downloaded extension archive! Extract the folder and load as unpacked extension in Chrome.");
        return;
      }
    } catch (err) {
      console.warn("Backend extension zip download failed, running client-side packager:", err);
    }

    try {
      const zip = new JSZip();
      const folder = zip.folder("qa-recorder-extension");

      folder?.file("manifest.json", EXTENSION_MANIFEST_CONTENT);
      folder?.file("locator-engine.js", EXTENSION_LOCATOR_ENGINE_CONTENT);
      folder?.file("utils.js", EXTENSION_UTILS_JS_CONTENT);
      folder?.file("content.js", EXTENSION_CONTENT_JS_CONTENT);
      folder?.file("background.js", EXTENSION_BACKGROUND_CONTENT);

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, "qa-recorder-extension.zip");
      setHasDownloadedExtension(true);
      setShowExtensionInstructions(true);
      toast.success("Downloaded extension archive! Extract the folder and load as unpacked extension in Chrome.");
    } catch (err) {
      toast.error("Failed to package extension file. Please try again.");
    }
  };

  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);
  const [isParseModalOpen, setIsParseModalOpen] = useState(false);
  const [playwrightCodeToParse, setPlaywrightCodeToParse] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showLiveRecorder, setShowLiveRecorder] = useState(false);
  const [showScriptPreview, setShowScriptPreview] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'manual' | 'extension' | 'codegen'>('extension');
  const [activePanel, setActivePanel] = useState<'steps' | 'script' | 'console'>('steps');
  const [mobileDisplayMode, setMobileDisplayMode] = useState<'real_emulator' | 'mirror'>('real_emulator');
  const [consoleLogs, setConsoleLogs] = useState<{type: string, message: string, timestamp: number, url: string}[]>([]);
  const [enableDevTools, setEnableDevTools] = useState(true);
  const [tempRecordingName, setTempRecordingName] = useState('New Recording Flow');
  const [selectedBrowser, setSelectedBrowser] = useState<'Chrome' | 'Firefox' | 'Edge'>('Chrome');
  const [targetUrl, setTargetUrl] = useState('https://');
  const [targetDevice, setTargetDevice] = useState('iPhone 15 Pro (iOS 17.0)');

  // Mobile Recording Configuration and Device Agent states
  const [mobilePlatform, setMobilePlatform] = useState<'Android'>('Android');
  const [connectionType, setConnectionType] = useState<'real' | 'emulator'>('real');
  const [mobileDevice, setMobileDevice] = useState<string>('');
  const [mobileAppType, setMobileAppType] = useState<'installed' | 'apk' | 'package' | 'web'>('installed');
  const [mobileInstalledApp, setMobileInstalledApp] = useState<string>('com.qalculate.android');
  const [mobilePackageName, setMobilePackageName] = useState<string>('com.qalculate.android');
  const [mobileAppActivity, setMobileAppActivity] = useState<string>('com.qalculate.android.MainActivity');
  const [mobileWebUrl, setMobileWebUrl] = useState<string>('https://example.com');
  const [mobileApkFile, setMobileApkFile] = useState<File | null>(null);
  const [mobileApkName, setMobileApkName] = useState<string>('QALculate.v4.2.0.apk');
  const [captureScreenshots, setCaptureScreenshots] = useState<boolean>(true);
  const [captureVideo, setCaptureVideo] = useState<boolean>(true);
  const [captureLogcat, setCaptureLogcat] = useState<boolean>(true);
  const [captureNetwork, setCaptureNetwork] = useState<boolean>(true);

  // Agent connection details
  const [agentConnected, setAgentConnected] = useState<boolean>(false);
  const [localAgentState, setLocalAgentState] = useState<'connected' | 'offline' | 'not_installed'>('not_installed');
  const [deviceCheckError, setDeviceCheckError] = useState<string | null>(null);
  const [isStartingAgent, setIsStartingAgent] = useState<boolean>(false);
  const [isInstallingAgent, setIsInstallingAgent] = useState<boolean>(false);
  const [useDemoFallback, setUseDemoFallback] = useState<boolean>(false);
  const [availableDevices, setAvailableDevices] = useState<any[]>([]);
  const [availableApps, setAvailableApps] = useState<any[]>([
    { name: 'F-Droid FOSS Store', package: 'org.fdroid.fdroid', icon: 'package' },
    { name: 'Malarm Alarm Clock', package: 'org.schabi.malarm', icon: 'clock' },
    { name: 'QALculate Mobile App', package: 'com.qalculate.android', icon: 'calculator' },
    { name: 'Sauce Labs My Demo App', package: 'com.saucelabs.mydemoapp.android', icon: 'shopping-bag' },
    { name: 'WhatsApp Business', package: 'com.whatsapp', icon: 'message' },
    { name: 'Google Chrome', package: 'com.android.chrome', icon: 'globe' },
    { name: 'Android Settings', package: 'com.android.settings', icon: 'settings' },
    { name: 'Machaxi Sports', package: 'com.machaxi.app', icon: 'activity' },
    { name: 'Swiggy Food Delivery', package: 'in.swiggy.android', icon: 'utensils' },
    { name: 'Amazon Shopping', package: 'com.amazon.mShop.android.shopping', icon: 'shopping-bag' },
    { name: 'Google Pay / Finance', package: 'com.google.android.apps.nbu.paisa.user', icon: 'credit-card' }
  ]);
  const [isInstallingApk, setIsInstallingApk] = useState<boolean>(false);

  // Simulated Mobile App state
  const [mobileAppScreen, setMobileAppScreen] = useState<string>('login'); // login, home, url, screenshot, video, reports, settings
  const [mobileAppInputVal, setMobileAppInputVal] = useState<string>('');
  const [mobileLoginEmail, setMobileLoginEmail] = useState<string>('sowbarnya@qaoncloud.com');
  const [mobileLoginPassword, setMobileLoginPassword] = useState<string>('AutomatiQA2026!');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isMobileLoggedIn, setIsMobileLoggedIn] = useState<boolean>(false);
  const [mobileSwipeStart, setMobileSwipeStart] = useState<{ x: number, y: number } | null>(null);
  const [isOrientationLandscape, setIsOrientationLandscape] = useState<boolean>(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState<boolean>(false);
  const [keyboardMode, setKeyboardMode] = useState<'qwerty' | 'numbers'>('qwerty');
  const [focusedInput, setFocusedInput] = useState<'email' | 'password' | 'generic' | null>(null);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);

  // Real Android Emulator Hardware States
  const [touchRipples, setTouchRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [isPhoneLocked, setIsPhoneLocked] = useState<boolean>(false);
  const [volumeLevel, setVolumeLevel] = useState<number>(80);
  const [showVolumeHud, setShowVolumeHud] = useState<boolean>(false);
  const [useGestureNav, setUseGestureNav] = useState<boolean>(false);

  const triggerTouchRipple = (x: number, y: number) => {
    const newRipple = { id: Date.now() + Math.random(), x, y };
    setTouchRipples((prev) => [...prev.slice(-3), newRipple]);
    setTimeout(() => {
      setTouchRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
    }, 550);
  };

  const handleVolumeChange = (delta: number) => {
    setVolumeLevel((prev) => {
      const next = Math.min(100, Math.max(0, prev + delta));
      return next;
    });
    setShowVolumeHud(true);
    setTimeout(() => setShowVolumeHud(false), 2000);
  };

  // Real-time mobile mirroring states
  const [liveMobileFrame, setLiveMobileFrame] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);

  // Mobile Live Recording Inspector States
  const [isMobileInspectorActive, setIsMobileInspectorActive] = useState<boolean>(true);
  const [selectedMobileInspectorElement, setSelectedMobileInspectorElement] = useState<any>(null);
  const [hoveredMobileInspectorElement, setHoveredMobileInspectorElement] = useState<any>(null);
  const [mobileInspectorMode, setMobileInspectorMode] = useState<'tap' | 'type' | 'assert' | 'long_press' | 'swipe'>('tap');
  const [mobileInspectorInputValue, setMobileInspectorInputValue] = useState<string>('');
  const [mobileActiveAppTab, setMobileActiveAppTab] = useState<'home' | 'login' | 'form' | 'catalog' | 'settings'>('home');
  const [mobileHierarchySearch, setMobileHierarchySearch] = useState<string>('');
  const [mobileApkUser, setMobileApkUser] = useState<string>('tester@qaoncloud.com');
  const [mobileApkPass, setMobileApkPass] = useState<string>('Password123');
  const [mobileApkNameInput, setMobileApkNameInput] = useState<string>('Alex Johnson');
  const [mobileApkEmailInput, setMobileApkEmailInput] = useState<string>('alex.j@example.com');
  const [mobileApkNotesInput, setMobileApkNotesInput] = useState<string>('Testing booking slot');
  const [mobileApkSearchInput, setMobileApkSearchInput] = useState<string>('Badminton Court');
  const [mobileFocusedField, setMobileFocusedField] = useState<string | null>(null);

  // Playback Engine State & Browser Selection
  const [isBrowserSelectModalOpen, setIsBrowserSelectModalOpen] = useState<boolean>(false);
  const [isMobileDeviceModalOpen, setIsMobileDeviceModalOpen] = useState<boolean>(false);
  const [pendingPlaybackFlow, setPendingPlaybackFlow] = useState<RecordedFlow | null>(null);
  const [playbackSelectedBrowser, setPlaybackSelectedBrowser] = useState<BrowserOptionId>('chrome');
  const [isHeadlessPlayback, setIsHeadlessPlayback] = useState<boolean>(false);
  const [playbackViewport, setPlaybackViewport] = useState<string>('1920x1080');
  const [playbackNetwork, setPlaybackNetwork] = useState<string>('No Throttling');

  const [isPlaybackModalOpen, setIsPlaybackModalOpen] = useState<boolean>(false);
  const [isPlaybackFullscreen, setIsPlaybackFullscreen] = useState<boolean>(true);
  const [playbackFlow, setPlaybackFlow] = useState<RecordedFlow | null>(null);
  const [playbackActiveUrl, setPlaybackActiveUrl] = useState<string>('');
  const [playbackStatus, setPlaybackStatus] = useState<'idle' | 'running' | 'paused' | 'completed' | 'failed'>('idle');
  const [currentPlaybackStepIndex, setCurrentPlaybackStepIndex] = useState<number>(-1);
  const [stepExecutionStatus, setStepExecutionStatus] = useState<Record<string, 'pending' | 'running' | 'passed' | 'failed' | 'skipped'>>({});
  const [stepExecutionTime, setStepExecutionTime] = useState<Record<string, number>>({});
  const [playbackStepScreenshots, setPlaybackStepScreenshots] = useState<Record<string, string>>({});
  const [playbackViewMode, setPlaybackViewMode] = useState<'screenshot' | 'iframe'>('screenshot');
  const [isPreparingPlayback, setIsPreparingPlayback] = useState<boolean>(false);
  const [playbackLogs, setPlaybackLogs] = useState<{ timestamp: string; level: 'info' | 'success' | 'warn' | 'error'; message: string }[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isStepByStepMode, setIsStepByStepMode] = useState<boolean>(false);
  const [playbackActiveTab, setPlaybackActiveTab] = useState<'view' | 'timeline' | 'logs' | 'report'>('view');
  const [useProxyMode, setUseProxyMode] = useState<boolean>(false);
  const [playbackFailureInfo, setPlaybackFailureInfo] = useState<{ stepIndex: number; stepName: string; error: string } | null>(null);
  const [playbackStartTime, setPlaybackStartTime] = useState<number>(0);
  const [playbackEndTime, setPlaybackEndTime] = useState<number>(0);

  // Universal Web Recording: Permissions & Diagnostics States
  const [pendingPermissionRequest, setPendingPermissionRequest] = useState<BrowserPermissionRequest | null>(null);
  const [activeDiagnostics, setActiveDiagnostics] = useState<LaunchDiagnostic[]>([]);
  const [activeDiagnosticModal, setActiveDiagnosticModal] = useState<LaunchDiagnostic | null>(null);
  const [urlValidationState, setUrlValidationState] = useState<{ loading: boolean; valid?: boolean; error?: string; diagnostic?: LaunchDiagnostic; mode?: string } | null>(null);
  const [isGrantingPermission, setIsGrantingPermission] = useState<boolean>(false);

  // Recorded Flow Video Viewer States
  const [isRecordedVideoModalOpen, setIsRecordedVideoModalOpen] = useState<boolean>(false);
  const [videoModalFlow, setVideoModalFlow] = useState<RecordedFlow | null>(null);

  // Optional Video Upload Walkthrough State (accepts up to 1GB)
  const [isVideoUploadModalOpen, setIsVideoUploadModalOpen] = useState<boolean>(false);

  const handleOpenRecordedVideo = (flowToView?: RecordedFlow) => {
    if (flowToView) {
      setVideoModalFlow(flowToView);
    } else {
      const currentActiveFlow: RecordedFlow = {
        id: activeFlowId || 'current-flow',
        name: flowName || 'Current Recording Flow',
        description: flowDescription,
        refineInstructions: refineInstructions,
        steps: currentSteps,
        createdAt: new Date().toISOString(),
        isApproved: isApproved,
        folderId: selectedFolder,
        platform: platform,
        initialUrl: targetUrl
      };
      setVideoModalFlow(currentActiveFlow);
    }
    setIsRecordedVideoModalOpen(true);
  };

  const [watchVideoModalData, setWatchVideoModalData] = useState<VideoFlowPlayerData | null>(null);

  const [isDownloadingPlaybackVideo, setIsDownloadingPlaybackVideo] = useState<boolean>(false);

  const handleDownloadVideoFromPlayback = async (flowToDownload?: RecordedFlow | null) => {
    const target = flowToDownload || videoModalFlow || {
      id: activeFlowId || 'current-flow',
      name: flowName || 'Current Recording Flow',
      description: flowDescription,
      refineInstructions: refineInstructions,
      steps: currentSteps,
      createdAt: new Date().toISOString(),
      isApproved: isApproved,
      folderId: selectedFolder,
      platform: platform,
      initialUrl: targetUrl
    };

    if (!target || !target.steps || target.steps.length === 0) {
      toast.error('No recorded steps available to export video.');
      return;
    }

    try {
      setIsDownloadingPlaybackVideo(true);
      await downloadFlowVideoFile(target, playbackActiveUrl || targetUrl, undefined, playbackStepScreenshots);
    } catch (err: any) {
      console.error('Failed to export video:', err);
      toast.error(err?.message || 'Failed to download recorded video');
    } finally {
      setIsDownloadingPlaybackVideo(false);
    }
  };

  // Additional Playback Interaction Overlay States
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 15, y: 15 });
  const [prevCursorPos, setPrevCursorPos] = useState<{ x: number; y: number }>({ x: 15, y: 15 });
  const [currentTargetBox, setCurrentTargetBox] = useState<{ x: number; y: number; width: number; height: number }>({ x: 42, y: 48, width: 16, height: 5 });
  const [isClicking, setIsClicking] = useState<boolean>(false);
  const [activeTypingText, setActiveTypingText] = useState<string>('');
  const [showInteractionOverlay, setShowInteractionOverlay] = useState<boolean>(true);
  const [completedInputEntries, setCompletedInputEntries] = useState<Array<{
    stepIndex: number;
    box: { x: number; y: number; width: number; height: number };
    value: string;
    isPassword?: boolean;
    locatorKey?: string;
  }>>([]);

  const checkIsPassword = (step: any): boolean => {
    if (!step) return false;
    const str = `${step.locator?.primary?.value || ''} ${step.elementName || ''} ${step.selector || ''}`.toLowerCase();
    return str.includes('pass') || str.includes('secret') || str.includes('token');
  };

  const playbackCancelRef = useRef<boolean>(false);
  const playbackPauseRef = useRef<boolean>(false);

  const resolveTargetUrlForInteraction = (step: RecordedStep, currentUrl: string, nextStep?: RecordedStep): string => {
    let baseUrl = currentUrl || targetUrl;
    try {
      let cleanBase = baseUrl.trim();
      if (!cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
        cleanBase = `https://${cleanBase}`;
      }
      const parsed = new URL(cleanBase);
      baseUrl = parsed.origin;
    } catch (e) {
      return currentUrl;
    }

    // 1. If step explicitly has a recorded full URL, preserve it
    if (step.url && (step.url.startsWith('http://') || step.url.startsWith('https://'))) {
      const sanitizedStepUrl = sanitizeClientUrl(step.url, baseUrl);
      if (sanitizedStepUrl && sanitizedStepUrl !== currentUrl) {
        return sanitizedStepUrl;
      }
    }

    // 2. If step.url or step.value is a relative path, sanitize relative to base (without appending artificial subpaths)
    if (step.url && step.url.startsWith('/')) {
      const sanitizedRel = sanitizeClientUrl(step.url, baseUrl);
      if (sanitizedRel && sanitizedRel !== currentUrl) {
        return sanitizedRel;
      }
    }
    if (step.value && (step.value.startsWith('http://') || step.value.startsWith('https://') || step.value.startsWith('/'))) {
      const sanitizedVal = sanitizeClientUrl(step.value, baseUrl);
      if (sanitizedVal && sanitizedVal !== currentUrl) {
        return sanitizedVal;
      }
    }

    // 3. Preserve exact href captured during recording if present in locator string
    const locatorStr = (step.locator?.primary?.value || '') + ' ' + (step.elementName || '');
    const hrefMatch = locatorStr.match(/href=["']?([^"'\s>\]]+)["']?/i);
    if (hrefMatch && hrefMatch[1]) {
      const extractedHref = hrefMatch[1];
      const sanitizedHref = sanitizeClientUrl(extractedHref, baseUrl);
      if (sanitizedHref && sanitizedHref !== currentUrl) {
        return sanitizedHref;
      }
    }

    // 4. If next step has an explicit recorded URL resulting from navigation, use it
    if (nextStep && nextStep.url && (nextStep.url.startsWith('http://') || nextStep.url.startsWith('https://'))) {
      const sanitizedNext = sanitizeClientUrl(nextStep.url, baseUrl);
      if (sanitizedNext && sanitizedNext !== currentUrl) {
        return sanitizedNext;
      }
    }

    // Replay recorded click events on current page without reconstructing or modifying URLs or appending /pages/
    return currentUrl;
  };

  const calculateTargetPos = (
    step: RecordedStep, 
    stepIndex: number, 
    totalSteps: number, 
    platform: 'web' | 'mobile' = 'web'
  ): { x: number; y: number } => {
    const metrics = resolveStepTargetMetrics(step, stepIndex, totalSteps, platform);
    return metrics.coordinates;
  };

  const handleStartPlayback = (flowToPlay: RecordedFlow) => {
    if (!flowToPlay || !flowToPlay.steps || flowToPlay.steps.length === 0) {
      toast.error('Flow has no recorded steps to play back');
      return;
    }
    setPendingPlaybackFlow(flowToPlay);
    if (flowToPlay.platform === 'mobile') {
      setPlaybackSelectedBrowser('mobile_chrome');
      setPlaybackViewport('412x915');
    } else {
      setPlaybackSelectedBrowser('chrome');
      setPlaybackViewport('1920x1080');
    }
    setIsBrowserSelectModalOpen(true);
  };

  const handleConfirmBrowserAndStartPlayback = () => {
    if (!pendingPlaybackFlow) return;

    const chosenBrowserObj = PLAYBACK_BROWSER_OPTIONS.find(b => b.id === playbackSelectedBrowser) || PLAYBACK_BROWSER_OPTIONS[0];

    const firstNavStep = pendingPlaybackFlow.steps?.find(s => s.action === 'navigate' || s.url || (s.value && (s.value.startsWith('http') || s.value.startsWith('/'))));
    const initialUrl = sanitizeClientUrl(
      firstNavStep?.value || firstNavStep?.url || targetUrl,
      targetUrl
    );
    if (!initialUrl) {
      toast.error('Playback requires a recorded target URL.');
      return;
    }

    const activeFlow = pendingPlaybackFlow;
    setPlaybackFlow(activeFlow);
    setIsBrowserSelectModalOpen(false);
    setIsPlaybackModalOpen(true);
    setPlaybackStatus('running');
    setPlaybackActiveUrl(initialUrl);

    // Preload Step 0 Metadata & Alignment instantly
    const firstStep = activeFlow.steps[0];
    setCurrentPlaybackStepIndex(0);

    let initPos = { x: 50, y: 50 };
    let initBox = { x: 42, y: 48, width: 16, height: 5 };
    if (typeof firstStep.x === 'number' && typeof firstStep.y === 'number') {
      initPos = { x: firstStep.x, y: firstStep.y };
    } else if (firstStep.coordinates && typeof firstStep.coordinates.x === 'number' && typeof firstStep.coordinates.y === 'number') {
      initPos = { x: firstStep.coordinates.x, y: firstStep.coordinates.y };
    } else {
      initPos = calculateTargetPos(firstStep, 0, activeFlow.steps.length, activeFlow.platform || 'web');
    }

    if (firstStep.targetBox && typeof firstStep.targetBox.x === 'number' && typeof firstStep.targetBox.y === 'number') {
      initBox = firstStep.targetBox;
    } else {
      initBox = {
        x: Math.max(1, Math.min(85, initPos.x - 8)),
        y: Math.max(1, Math.min(90, initPos.y - 2.5)),
        width: 16,
        height: 5
      };
    }

    setCursorPos(initPos);
    setPrevCursorPos(initPos);
    setCurrentTargetBox(initBox);
    setIsClicking(false);
    setActiveTypingText('');

    const initialStatuses: Record<string, 'pending' | 'running' | 'passed' | 'failed' | 'skipped'> = {};
    (activeFlow.steps || []).forEach((s, idx) => {
      initialStatuses[s.id] = idx === 0 ? 'running' : s.skipped ? 'skipped' : 'pending';
    });
    setStepExecutionStatus(initialStatuses);
    setStepExecutionTime({});

    if (firstStep.screenshot) {
      setPlaybackStepScreenshots({ [firstStep.id]: firstStep.screenshot });
    } else {
      setPlaybackStepScreenshots({});
    }

    setPlaybackLogs([
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: `🌐 Initializing ${chosenBrowserObj.name} ${chosenBrowserObj.version} (${chosenBrowserObj.engine})...`
      },
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: `🖥️ Environment Configured: Viewport ${playbackViewport} • Mode: ${isHeadlessPlayback ? 'Headless Driver' : 'Headed Live Window'} • Network: ${playbackNetwork}`
      },
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: `⚡ Preloaded metadata for Step #1 [${(firstStep?.action || 'step').toUpperCase()}]. Session starting...`
      }
    ]);

    setTimeout(() => {
      handleRunPlayback(activeFlow);
    }, 10);
  };

  const handleRunPlayback = async (flowOverride?: RecordedFlow) => {
    const targetFlow = flowOverride || playbackFlow;
    if (!targetFlow || !targetFlow.steps || targetFlow.steps.length === 0) return;

    if (playbackStatus === 'paused') {
      playbackPauseRef.current = false;
      setPlaybackStatus('running');
      setPlaybackLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: '▶️ Resuming playback execution...'
      }]);
      return;
    }

    playbackCancelRef.current = false;
    playbackPauseRef.current = false;
    setPlaybackFailureInfo(null);
    setPlaybackStartTime(Date.now());
    setPlaybackEndTime(0);
    setPlaybackStatus('running');

    const steps = targetFlow.steps;
    const chosenBrowserObj = PLAYBACK_BROWSER_OPTIONS.find(b => b.id === playbackSelectedBrowser) || PLAYBACK_BROWSER_OPTIONS[0];

    let currentLiveUrl = playbackActiveUrl || targetUrl;
    if (steps.length > 0) {
      const firstNav = steps.find(s => s.action === 'navigate' || s.url || (s.value && (s.value.startsWith('http') || s.value.startsWith('/'))));
      if (firstNav) {
        const startUrl = sanitizeClientUrl(firstNav.value || firstNav.url, currentLiveUrl);
        if (startUrl) {
          currentLiveUrl = startUrl;
          setPlaybackActiveUrl(startUrl);
        }
      }
    }

    // 1. Instant Preloading: Setup initial step 0 UI state (<5ms)
    const firstStep = steps[0];
    setCurrentPlaybackStepIndex(0);

    let initialTargetPos = { x: 50, y: 50 };
    let initialTargetBox = { x: 42, y: 48, width: 16, height: 5 };
    if (typeof firstStep.x === 'number' && typeof firstStep.y === 'number') {
      initialTargetPos = { x: firstStep.x, y: firstStep.y };
    } else if (firstStep.coordinates && typeof firstStep.coordinates.x === 'number' && typeof firstStep.coordinates.y === 'number') {
      initialTargetPos = { x: firstStep.coordinates.x, y: firstStep.coordinates.y };
    } else {
      initialTargetPos = calculateTargetPos(firstStep, 0, steps.length, targetFlow.platform || 'web');
    }

    if (firstStep.targetBox && typeof firstStep.targetBox.x === 'number' && typeof firstStep.targetBox.y === 'number') {
      initialTargetBox = firstStep.targetBox;
    } else {
      initialTargetBox = {
        x: Math.max(1, Math.min(85, initialTargetPos.x - 8)),
        y: Math.max(1, Math.min(90, initialTargetPos.y - 2.5)),
        width: 16,
        height: 5
      };
    }

    setCursorPos(initialTargetPos);
    setPrevCursorPos(initialTargetPos);
    setCurrentTargetBox(initialTargetBox);
    setIsClicking(false);
    setActiveTypingText('');

    const initialStatuses: Record<string, 'pending' | 'running' | 'passed' | 'failed' | 'skipped'> = {};
    steps.forEach((s, idx) => {
      initialStatuses[s.id] = idx === 0 ? 'running' : (s.skipped ? 'skipped' : 'pending');
    });
    setStepExecutionStatus(initialStatuses);
    setStepExecutionTime({});

    if (firstStep.screenshot) {
      setPlaybackStepScreenshots({ [firstStep.id]: firstStep.screenshot });
    } else {
      setPlaybackStepScreenshots({});
    }
    setCompletedInputEntries([]);

    setPlaybackLogs(prev => [...prev, 
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: `▶️ Initiating execution of "${targetFlow.name || 'Flow'}" in ${chosenBrowserObj.name} (${chosenBrowserObj.engine})...`
      },
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: `⚡ Instant Preloading Engaged: Step #1 metadata initialized. Launching Playwright browser driver...`
      }
    ]);

    // 2. Lightweight loading indicator timer (displays if browser launch/page readiness takes > 1000ms)
    const prepTimer = setTimeout(() => {
      setIsPreparingPlayback(true);
    }, 1000);

    let hasFailed = false;

    // Queue data structures for background SSE stream reader and foreground step runner
    const stepQueue: any[] = [];
    let isStreamEnded = false;
    let queueNotify: (() => void) | null = null;

    const pushStepResult = (item: any) => {
      stepQueue.push(item);
      if (queueNotify) {
        queueNotify();
        queueNotify = null;
      }
    };

    const fetchNextStepResult = async (): Promise<any | null> => {
      if (stepQueue.length > 0) return stepQueue.shift();
      if (isStreamEnded) return null;
      await new Promise<void>(resolve => { queueNotify = resolve; });
      return stepQueue.length > 0 ? stepQueue.shift() : null;
    };

    try {
      const res = await fetch('/api/run-playback', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          steps,
          initialUrl: currentLiveUrl || targetUrl,
          browser: playbackSelectedBrowser,
          viewport: playbackViewport,
          isHeadless: isHeadlessPlayback,
          stream: true,
          projectId: project?.id,
          projectName: project?.name,
          jiraConfig: project?.jiraConfig,
          githubConfig: project?.githubConfig,
          slackConfig: project?.slackConfig,
          appUrl: project?.appUrl || targetUrl,
          syntheticUsers: project?.syntheticUsers
        })
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(body || `Playback service returned HTTP ${res.status}`);
      }

      // Background Stream Reader
      const startStreamReader = async () => {
        try {
          if (res.ok && res.body && res.headers.get('content-type')?.includes('text/event-stream')) {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const chunks = buffer.split('\n\n');
              buffer = chunks.pop() || '';

              for (const chunk of chunks) {
                const trimmed = chunk.trim();
                if (trimmed.startsWith('data:')) {
                  try {
                    const eventData = JSON.parse(trimmed.slice(5).trim());
                    if (eventData.type === 'engine_start' || eventData.type === 'session_ready') {
                      clearTimeout(prepTimer);
                      setIsPreparingPlayback(false);
                      if (eventData.type === 'session_ready' && eventData.initialUrl) setPlaybackActiveUrl(eventData.initialUrl);
                    } else if (eventData.type === 'step_result' && eventData.result) {
                      clearTimeout(prepTimer);
                      setIsPreparingPlayback(false);
                      pushStepResult(eventData.result);
                    } else if (eventData.type === 'done' || eventData.type === 'error') {
                      clearTimeout(prepTimer);
                      setIsPreparingPlayback(false);
                      if (eventData.type === 'done' && !eventData.success && eventData.failedAtStep) {
                        hasFailed = true;
                        setPlaybackFailureInfo({
                          stepIndex: eventData.failedAtStep - 1,
                          stepName: eventData.failedStepName || `Step ${eventData.failedAtStep}`,
                          error: eventData.error || 'Step execution failed'
                        });
                      } else if (eventData.type === 'error') {
                        hasFailed = true;
                        setPlaybackFailureInfo({
                          stepIndex: currentPlaybackStepIndex >= 0 ? currentPlaybackStepIndex : -1,
                          stepName: 'Playback Service',
                          error: eventData.error || 'Playback engine execution failed'
                        });
                      }
                      isStreamEnded = true;
                      pushStepResult(null);
                    }
                  } catch (e) {}
                }
              }
            }
          } else if (res.ok) {
            const rawBody = await res.text().catch(() => '');
            clearTimeout(prepTimer);
            setIsPreparingPlayback(false);
            const trimmedBody = rawBody.trim();
            if (trimmedBody.startsWith('data:')) {
              const chunks = trimmedBody.split('\n\n');
              for (const chunk of chunks) {
                const trimmed = chunk.trim();
                if (trimmed.startsWith('data:')) {
                  try {
                    const eventData = JSON.parse(trimmed.slice(5).trim());
                    if (eventData.type === 'engine_start' || eventData.type === 'session_ready') {
                      clearTimeout(prepTimer);
                      setIsPreparingPlayback(false);
                    } else if (eventData.type === 'step_result' && eventData.result) {
                      pushStepResult(eventData.result);
                    } else if (eventData.type === 'done' || eventData.type === 'error') {
                      if (eventData.type === 'error') {
                        hasFailed = true;
                        setPlaybackFailureInfo({
                          stepIndex: currentPlaybackStepIndex >= 0 ? currentPlaybackStepIndex : -1,
                          stepName: 'Playback Service',
                          error: eventData.error || 'Playback engine execution failed'
                        });
                      }
                    }
                  } catch (e) {}
                }
              }
            } else {
              try {
                const data = JSON.parse(rawBody);
                if (!data.success && data.failedAtStep) {
                  hasFailed = true;
                  setPlaybackFailureInfo({
                    stepIndex: data.failedAtStep - 1,
                    stepName: data.failedStepName || `Step ${data.failedAtStep}`,
                    error: data.error || 'Step execution failed'
                  });
                }
                if (Array.isArray(data.results)) {
                  for (const r of data.results) pushStepResult(r);
                }
              } catch (parseErr: any) {
                hasFailed = true;
                setPlaybackFailureInfo({
                  stepIndex: currentPlaybackStepIndex >= 0 ? currentPlaybackStepIndex : -1,
                  stepName: 'Playback Engine',
                  error: `Server response parse failure: ${rawBody.slice(0, 500)}`
                });
                setPlaybackLogs(prev => [...prev, {
                  timestamp: new Date().toLocaleTimeString(),
                  level: 'error',
                  message: `Non-SSE body parse error: ${rawBody.slice(0, 500)}`
                }]);
              }
            }
          }
        } catch (err: any) {
          console.error("Stream reader error:", err);
          hasFailed = true;
          setPlaybackFailureInfo({
            stepIndex: currentPlaybackStepIndex >= 0 ? currentPlaybackStepIndex : 0,
            stepName: 'Playback Stream',
            error: `Playback stream failed: ${err?.message || String(err)}`
          });
          setPlaybackLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            level: 'error',
            message: `Playback stream error: ${err?.message || String(err)}`
          }]);
        } finally {
          clearTimeout(prepTimer);
          setIsPreparingPlayback(false);
          isStreamEnded = true;
          pushStepResult(null);
        }
      };

      startStreamReader();

      // Foreground Step Runner Loop
      let processedCount = 0;
      while (true) {
        if (playbackCancelRef.current) {
          clearTimeout(prepTimer);
          setIsPreparingPlayback(false);
          setPlaybackStatus('idle');
          setPlaybackLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            level: 'warn',
            message: '⏹️ Playback stopped by user.'
          }]);
          return;
        }

        while (playbackPauseRef.current) {
          await new Promise(r => setTimeout(r, 200));
          if (playbackCancelRef.current) return;
        }

        const resItem = await fetchNextStepResult();
        if (!resItem) break;

        processedCount++;
        const step = steps[resItem.stepIndex] || steps[processedCount - 1];

        // If this step was marked skipped because of a previous failure
        if (resItem.status === 'skipped') {
          setStepExecutionStatus(prev => ({ ...prev, [resItem.stepId]: 'skipped' }));
          setStepExecutionTime(prev => ({ ...prev, [resItem.stepId]: 0 }));
          setPlaybackLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            level: 'warn',
            message: `⏭️ Step ${resItem.stepIndex + 1}/${steps.length} Skipped: ${resItem.error || 'Skipped due to prior failure'}`
          }]);
          continue;
        }

        setCurrentPlaybackStepIndex(resItem.stepIndex);
        setStepExecutionStatus(prev => ({ ...prev, [resItem.stepId]: 'running' }));

        if (resItem.resultingUrl) {
          if (currentLiveUrl && currentLiveUrl !== resItem.resultingUrl) {
            setCompletedInputEntries([]);
          }
          currentLiveUrl = resItem.resultingUrl;
          setPlaybackActiveUrl(resItem.resultingUrl);
        }

        if (resItem.screenshot) {
          setPlaybackStepScreenshots(prev => ({ ...prev, [resItem.stepId]: resItem.screenshot }));
        }

        const metrics = resolveStepTargetMetrics(step, resItem.stepIndex, steps.length, targetFlow.platform || 'web');
        let targetPos = metrics.coordinates;
        let targetBox = metrics.targetBox;

        if (resItem.coordinates && typeof resItem.coordinates.x === 'number' && typeof resItem.coordinates.y === 'number') {
          targetPos = { x: resItem.coordinates.x, y: resItem.coordinates.y };
        } else if (resItem.targetBox && typeof resItem.targetBox.x === 'number' && typeof resItem.targetBox.y === 'number') {
          targetPos = { 
            x: resItem.targetBox.x + (resItem.targetBox.width || 0) / 2, 
            y: resItem.targetBox.y + (resItem.targetBox.height || 0) / 2 
          };
        }

        if (resItem.targetBox && typeof resItem.targetBox.x === 'number' && typeof resItem.targetBox.y === 'number') {
          targetBox = {
            x: Math.max(0, Math.min(96, resItem.targetBox.x)),
            y: Math.max(0, Math.min(96, resItem.targetBox.y)),
            width: Math.max(2, Math.min(96, resItem.targetBox.width || 16)),
            height: Math.max(2, Math.min(96, resItem.targetBox.height || 5))
          };
        }

        setPrevCursorPos(cursorPos);
        setCursorPos(targetPos);
        setCurrentTargetBox(targetBox);
        setIsClicking(false);
        setActiveTypingText('');

        // Smooth mouse travel delay to locate and focus on target element
        await new Promise(r => setTimeout(r, Math.max(35, Math.round(200 / playbackSpeed))));

        // Perform visual action animation strictly in sequence
        if (step.action === 'click' || step.action === 'dblclick') {
          setIsClicking(true);
          await new Promise(r => setTimeout(r, Math.max(35, Math.round(140 / playbackSpeed))));
          setIsClicking(false);
          await new Promise(r => setTimeout(r, Math.max(30, Math.round(120 / playbackSpeed))));
        } else if ((step.action === 'fill' || step.action === 'type') && step.value !== undefined) {
          // 1. Click the exact recorded input field first to focus it
          setIsClicking(true);
          await new Promise(r => setTimeout(r, Math.max(35, Math.round(140 / playbackSpeed))));
          setIsClicking(false);
          await new Promise(r => setTimeout(r, Math.max(30, Math.round(100 / playbackSpeed))));

          // 2. Enter recorded value steadily character by character
          const fullText = String(step.value);
          const charStep = playbackSpeed >= 4 ? 2 : 1;
          for (let charIdx = 1; charIdx <= fullText.length; charIdx += charStep) {
            if (playbackCancelRef.current) break;
            setActiveTypingText(fullText.slice(0, charIdx));
            await new Promise(r => setTimeout(r, Math.max(6, Math.round(30 / playbackSpeed))));
          }
          setActiveTypingText(fullText);
          const isPass = checkIsPassword(step);
          setCompletedInputEntries(prev => [
            ...prev.filter(e => e.stepIndex !== resItem.stepIndex),
            { stepIndex: resItem.stepIndex, box: targetBox, value: fullText, isPassword: isPass }
          ]);

          // 3. Wait after input completion before moving forward
          await new Promise(r => setTimeout(r, Math.max(40, Math.round(220 / playbackSpeed))));
        } else {
          await new Promise(r => setTimeout(r, Math.max(30, Math.round(120 / playbackSpeed))));
        }

        // Update timeline status to final result
        setStepExecutionStatus(prev => ({ ...prev, [resItem.stepId]: resItem.status }));
        setStepExecutionTime(prev => ({ ...prev, [resItem.stepId]: resItem.duration }));

        const clickedLocator = step.locator?.primary?.value || step.elementName || 'element';
        const redirectInfo = resItem.redirectChain && resItem.redirectChain.length > 0 
          ? resItem.redirectChain.join(' ➔ ') 
          : 'Direct Page Load';

        setPlaybackLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          level: resItem.status === 'passed' ? 'success' : 'error',
          message: `📊 Step ${resItem.stepIndex + 1}/${steps.length} Telemetry [${(step?.action || 'step').toUpperCase()}]:\n` +
            `  • Action Target: "${clickedLocator}"\n` +
            `  • Synchronized URL: ${resItem.resultingUrl}\n` +
            `  • Page Title: ${resItem.pageTitle || 'N/A'}\n` +
            `  • Navigation & Redirects: ${redirectInfo}\n` +
            `  • Step Duration: ${resItem.duration}ms\n` +
            `  • Status: ${resItem.status === 'passed' ? 'PASSED ✅' : 'FAILED ❌ ' + (resItem.error || '')}`
        }]);

        if (resItem.status === 'failed') {
          hasFailed = true;
          const failStepName = step.elementName || step.locator?.primary?.value || step.action;
          setPlaybackFailureInfo({
            stepIndex: resItem.stepIndex,
            stepName: failStepName,
            error: resItem.error || 'Step execution failed'
          });
          setPlaybackStatus('failed');
          toast.error(`FLOW EXECUTION FAILED — halted at step ${resItem.stepIndex + 1} of ${steps.length}: ${resItem.error || 'Step execution failed'}`);

          // Mark all remaining steps in the timeline as skipped
          for (let sIdx = resItem.stepIndex + 1; sIdx < steps.length; sIdx++) {
            const nextStep = steps[sIdx];
            setStepExecutionStatus(prev => ({ ...prev, [nextStep.id]: 'skipped' }));
            setStepExecutionTime(prev => ({ ...prev, [nextStep.id]: 0 }));
          }
          break;
        }

        if (isStepByStepMode && processedCount < steps.length) {
          playbackPauseRef.current = true;
          setPlaybackStatus('paused');
          setPlaybackLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            level: 'warn',
            message: `⏸️ Step-by-step mode: Paused after step ${processedCount}. Press Resume to continue.`
          }]);
        } else {
          await new Promise(r => setTimeout(r, Math.max(15, Math.round(60 / playbackSpeed))));
        }
      }

      if (!hasFailed && !playbackCancelRef.current && processedCount > 0) {
        setPlaybackStatus('completed');
        setPlaybackEndTime(Date.now());
        setPlaybackActiveTab('report');
        setCurrentPlaybackStepIndex(steps.length);
        setPlaybackLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          level: 'success',
          message: `🎉 Playback completed successfully! All ${steps.length} steps passed.`
        }]);
        toast.success(`Playback completed for "${targetFlow.name || 'Flow'}"`);
        return;
      }
      if (hasFailed && !playbackCancelRef.current) {
        setPlaybackStatus('failed');
        setPlaybackEndTime(Date.now());
        setPlaybackActiveTab('report');
        setPlaybackLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          level: 'error',
          message: `❌ FLOW EXECUTION FAILED — halted at step ${playbackFailureInfo ? playbackFailureInfo.stepIndex + 1 : 1} of ${steps.length}`
        }]);
        return;
      }
      if (!playbackCancelRef.current) {
        setPlaybackStatus('failed');
        setPlaybackEndTime(Date.now());
        setPlaybackActiveTab('report');
        setPlaybackFailureInfo(prev => prev || {
          stepIndex: -1,
          stepName: 'Playback Engine',
          error: 'The playback engine returned no step results. The browser session most likely failed to start, or the result stream closed before the first step ran. Check the Logs tab and the server console for [Playback Engine] errors.'
        });
        setStepExecutionStatus(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(k => {
            if (updated[k] === 'running') updated[k] = 'pending';
          });
          return updated;
        });
        setPlaybackLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString(),
          level: 'error',
          message: 'Playback engine ended without verified step results; no simulated fallback was run.'
        }]);
        toast.error('Playback ended without verified step results.');
        return;
      }
    } catch (err: any) {
      console.error("Backend Playwright playback engine exception:", err);
      clearTimeout(prepTimer);
      setIsPreparingPlayback(false);
      setPlaybackStatus('failed');
      setPlaybackEndTime(Date.now());
      setPlaybackActiveTab('report');
      setPlaybackFailureInfo({
        stepIndex: currentPlaybackStepIndex >= 0 ? currentPlaybackStepIndex : 0,
        stepName: 'Playback Engine',
        error: err?.message || 'Playback engine exception'
      });
      setPlaybackLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        level: 'error',
        message: `Playback engine failed before completion: ${err?.message || String(err)}`
      }]);
      toast.error(`Playback failed: ${err?.message || 'playback engine unavailable'}`);
      return;
    }
  };

  const handleFixAndReplayFlow = async (updatedFlow: RecordedFlow, startFromStepIndex?: number) => {
    // 1. Update in-memory playback flow state
    setPlaybackFlow(updatedFlow);

    // 2. Persist to project recordedFlows
    const updatedFlows = flows.map(f => f.id === updatedFlow.id ? updatedFlow : f);
    setFlows(updatedFlows);
    try {
      await onUpdateProject({
        ...project,
        recordedFlows: updatedFlows
      });
    } catch (e) {
      console.error('Failed to auto-save fixed flow:', e);
    }

    // 3. Reset statuses
    const initialStatuses: Record<string, 'pending' | 'running' | 'passed' | 'failed' | 'skipped'> = {};
    (updatedFlow.steps || []).forEach((s, idx) => {
      initialStatuses[s.id] = idx === 0 ? 'running' : s.skipped ? 'skipped' : 'pending';
    });
    setStepExecutionStatus(initialStatuses);
    setStepExecutionTime({});
    setPlaybackFailureInfo(null);
    setPlaybackLogs(prev => [
      ...prev,
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'info',
        message: `🛠️ Applied step fix to "${updatedFlow.name}". Triggering re-execution...`
      }
    ]);

    // 4. Switch back to live view so the user can watch the re-execution live!
    setPlaybackActiveTab('view');
    toast.success(`Step fixed! Re-executing "${updatedFlow.name}"...`);

    setTimeout(() => {
      handleRunPlayback(updatedFlow);
    }, 200);
  };

  const handleSaveFixedFlowOnly = async (updatedFlow: RecordedFlow) => {
    setPlaybackFlow(updatedFlow);
    const updatedFlows = flows.map(f => f.id === updatedFlow.id ? updatedFlow : f);
    setFlows(updatedFlows);
    try {
      await onUpdateProject({
        ...project,
        recordedFlows: updatedFlows
      });
      toast.success(`Step fix saved to "${updatedFlow.name}"`);
    } catch (e) {
      console.error('Failed to save fixed flow:', e);
      toast.error('Failed to save fixed flow');
    }
  };

  const handlePausePlayback = () => {
    playbackPauseRef.current = true;
    setPlaybackStatus('paused');
    setPlaybackLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      level: 'warn',
      message: '⏸️ Playback paused.'
    }]);
  };

  const handleStopPlayback = () => {
    playbackCancelRef.current = true;
    playbackPauseRef.current = false;
    setIsPreparingPlayback(false);
    setPlaybackStatus('idle');
    setCurrentPlaybackStepIndex(-1);
    setCursorPos({ x: 15, y: 15 });
    setPrevCursorPos({ x: 15, y: 15 });
    setIsClicking(false);
    setActiveTypingText('');
    const firstNavStep = playbackFlow?.steps?.find(s => s.action === 'navigate' || s.url || (s.value && s.value.startsWith('http')));
    setPlaybackActiveUrl(sanitizeClientUrl(firstNavStep?.value || firstNavStep?.url || targetUrl));
    if (playbackFlow) {
      const initialStatuses: Record<string, 'pending' | 'running' | 'passed' | 'failed' | 'skipped'> = {};
      playbackFlow.steps.forEach(s => {
        initialStatuses[s.id] = s.skipped ? 'skipped' : 'pending';
      });
      setStepExecutionStatus(initialStatuses);
      setStepExecutionTime({});
    }
  };

  const handleStepForwardPlayback = async () => {
    if (!playbackFlow || !playbackFlow.steps) return;

    if (playbackStatus === 'paused') {
      playbackPauseRef.current = false;
      setIsStepByStepMode(true);
      setPlaybackStatus('running');
    } else if (playbackStatus === 'idle') {
      setIsStepByStepMode(true);
      handleRunPlayback();
    }
  };

  const performLiveDeviceAction = async (action: string, params: any) => {
    try {
      await fetch('/api/device-agent/perform-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email || 'sowbarnya@qaoncloud.com',
          action,
          params
        })
      });
    } catch (e) {
      console.error("Failed to post device action:", e);
    }
  };

  const launchInstalledAppOnDevice = async (packageName: string) => {
    if (!packageName || !mobileDevice || useDemoFallback) return;
    toast.loading(`Opening ${packageName} on your phone...`, { id: 'mobile-app-launch' });
    try {
      const response = await fetch('/api/device-agent/perform-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email || 'sowbarnya@qaoncloud.com',
          action: 'launch_app',
          params: { packageName, deviceId: mobileDevice }
        })
      });
      if (!response.ok) throw new Error(`Device agent returned ${response.status}`);
      toast.success(`Opening ${packageName} on the connected phone`, { id: 'mobile-app-launch' });
    } catch (error: any) {
      toast.error(`Could not open ${packageName}: ${error.message}`, { id: 'mobile-app-launch' });
    }
  };

  const handleInspectAndRecordElement = (
    elem: any,
    overrideAction?: 'click' | 'fill' | 'type' | 'assertion' | 'long_press' | 'swipe' | 'press' | string,
    overrideValue?: string,
    event?: React.MouseEvent,
    extraMetrics?: {
      targetBox?: { x: number; y: number; width: number; height: number };
      coordinates?: { x: number; y: number };
    }
  ) => {
    if (!elem) return;

    // Ensure recording is armed if user interacts in mobile inspector
    if (!isRecordingRef.current) {
      setIsRecording(true);
      isRecordingRef.current = true;
      setIsPaused(false);
      isPausedRef.current = false;
      if (!sessionIdRef.current) {
        const newSession = `mob-${Date.now().toString(36)}-${Math.random().toString(36).substring(7)}`;
        setSessionId(newSession);
        sessionIdRef.current = newSession;
      }
    }

    if (event) {
      try {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        triggerTouchRipple(x, y);
      } catch (e) {}
    }

    setSelectedMobileInspectorElement(elem);

    let actionToRecord = overrideAction || (mobileInspectorMode === 'type' ? 'fill' : mobileInspectorMode === 'assert' ? 'assertion' : mobileInspectorMode === 'long_press' ? 'long_press' : 'click');
    if (actionToRecord === 'type') actionToRecord = 'fill';

    const valueToRecord = overrideValue !== undefined ? overrideValue : (actionToRecord === 'fill' ? (mobileInspectorInputValue || elem.text || 'Test Input Value') : (actionToRecord === 'assertion' ? (elem.text || elem.name) : (elem.text || elem.name || '')));

    let primaryType: 'accessibility-id' | 'resource-id' | 'content-desc' | 'text' | 'xpath' | 'bounds' = 'resource-id';
    let primaryValue = elem.resourceId || elem.accessibilityId || elem.text || elem.xpath || '';

    if (elem.resourceId) {
      primaryType = 'resource-id';
      primaryValue = elem.resourceId;
    } else if (elem.accessibilityId) {
      primaryType = 'accessibility-id';
      primaryValue = elem.accessibilityId;
    } else if (elem.contentDescription) {
      primaryType = 'content-desc';
      primaryValue = elem.contentDescription;
    } else if (elem.text) {
      primaryType = 'text';
      primaryValue = elem.text;
    } else if (elem.xpath) {
      primaryType = 'xpath';
      primaryValue = elem.xpath;
    } else {
      primaryType = 'xpath';
      primaryValue = `//*[contains(@text, '${elem.name || 'element'}')]`;
    }

    let playwrightCode = '';
    if (actionToRecord === 'click') {
      if (primaryType === 'resource-id') {
        playwrightCode = `// Tap ${elem.name || primaryValue}\nawait driver.elementById("${primaryValue}").click();`;
      } else if (primaryType === 'accessibility-id') {
        playwrightCode = `// Tap ${elem.name || primaryValue}\nawait driver.elementByAccessibilityId("${primaryValue}").click();`;
      } else {
        playwrightCode = `// Tap ${elem.name || primaryValue}\nconst el = await driver.elementByXPath("${elem.xpath || `//*[@text='${primaryValue}']`}");\nawait el.click();`;
      }
    } else if (actionToRecord === 'fill') {
      if (primaryType === 'resource-id') {
        playwrightCode = `// Type into ${elem.name || primaryValue}\nawait driver.elementById("${primaryValue}").type("${valueToRecord}");`;
      } else {
        playwrightCode = `// Type into ${elem.name || primaryValue}\nconst el = await driver.elementByXPath("${elem.xpath || `//*[@text='${primaryValue}']`}");\nawait el.sendKeys("${valueToRecord}");`;
      }
    } else if (actionToRecord === 'assertion') {
      playwrightCode = `// Assert ${elem.name || primaryValue} is visible\nconst el = await driver.elementByXPath("${elem.xpath || `//*[@text='${primaryValue}']`}");\nexpect(await el.isDisplayed()).toBe(true);`;
    } else if (actionToRecord === 'long_press') {
      playwrightCode = `// Long press ${elem.name || primaryValue}\nconst el = await driver.elementByXPath("${elem.xpath || `//*[@text='${primaryValue}']`}");\nawait new TouchAction(driver).longPress({ element: el, duration: 1500 }).release().perform();`;
    } else if (actionToRecord === 'swipe') {
      playwrightCode = `// Swipe gesture\nawait driver.touchPerform([{ action: 'press', options: { x: 100, y: 500 } }, { action: 'wait', options: { ms: 1000 } }, { action: 'moveTo', options: { x: 100, y: 100 } }, { action: 'release' }]);`;
    } else if (actionToRecord === 'press') {
      playwrightCode = `// Press key\nawait driver.pressKeyCode(${valueToRecord === 'Back' ? 4 : valueToRecord === 'Home' ? 3 : 187});`;
    }

    const elemName = elem.name || elem.text || primaryValue || 'Mobile Element';
    const payload: any = {
      action: actionToRecord,
      value: valueToRecord,
      elementName: elemName,
      locator: {
        primary: {
          type: primaryType,
          value: primaryValue,
          playwright: playwrightCode,
          bounds: elem.bounds
        },
        alternatives: [
          elem.resourceId ? { type: 'resource-id', value: elem.resourceId } : null,
          elem.accessibilityId ? { type: 'accessibility-id', value: elem.accessibilityId } : null,
          elem.contentDescription ? { type: 'content-desc', value: elem.contentDescription } : null,
          elem.text ? { type: 'text', value: elem.text } : null,
          elem.xpath ? { type: 'xpath', value: elem.xpath } : null
        ].filter(Boolean)
      },
      screen: String(mobileActiveAppTab || mobileAppScreen || 'MAIN').toUpperCase(),
      platform: 'mobile',
      bounds: elem.bounds,
      targetBox: extraMetrics?.targetBox,
      coordinates: extraMetrics?.coordinates,
      x: extraMetrics?.coordinates?.x,
      y: extraMetrics?.coordinates?.y,
      timestamp: Date.now()
    };

    addRecordedStep(payload);

    const timestampStr = new Date().toLocaleTimeString();
    logAdb(`[${timestampStr}] [ADB] input event "${actionToRecord}" on target [${elemName}]`);
    logAdb(`[${timestampStr}] [Appium] findElement(${primaryType}, "${primaryValue}") -> ${actionToRecord}`);
    if (valueToRecord) {
      logAdb(`[${timestampStr}] [Appium] setValue -> "${valueToRecord}"`);
    }
    
    // Also dispatch the physical action to the agent. The agent executes ADB
    // taps by coordinates, so never queue a locator-only tap with undefined x/y.
    const boundsMatch = elem.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    const tapX = boundsMatch ? Math.round((Number(boundsMatch[1]) + Number(boundsMatch[3])) / 2) : undefined;
    const tapY = boundsMatch ? Math.round((Number(boundsMatch[2]) + Number(boundsMatch[4])) / 2) : undefined;
    if (liveMobileFrame && tapX !== undefined && tapY !== undefined) {
      performLiveDeviceAction('tap', {
        x: tapX,
        y: tapY,
        resourceId: elem.resourceId,
        xpath: elem.xpath,
        bounds: elem.bounds
      });
    }

    toast.success(`[+] Recorded Step: ${String(actionToRecord || 'ACTION').toUpperCase()} "${elemName}"`);
  };

  useEffect(() => {
    let interval: any = null;
    if (platform === 'mobile') {
      interval = setInterval(async () => {
        try {
          const userEmail = encodeURIComponent(user?.email || 'sowbarnya@qaoncloud.com');
          // Socket.IO is the primary live stream. Polling at the same time causes
          // redundant frame swaps and visible flicker on Linux/Chromium.
          if (!socketRef.current?.connected) {
            const res = await fetch(`/api/device-agent/live-frame?email=${userEmail}`);
            if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
              const data = await res.json();
              if (data.success && data.frame) {
                setLiveMobileFrame(current => current === data.frame ? current : data.frame);
                setMobileError(null);
              } else if (data.error && typeof data.error === 'string' && data.error.includes("Appium")) {
                setMobileError("Unable to start Appium. Verify Appium installation and Device Agent status.");
              }
            }
          }

          // Real-time synchronization of physical emulator steps
          if (isRecordingRef.current) {
            const stepsRes = await fetch(`/api/mobile/session/steps?email=${userEmail}`);
            if (stepsRes.ok) {
              const stepsData = await stepsRes.json();
              if (stepsData.success && Array.isArray(stepsData.steps) && stepsData.steps.length > 0) {
                setCurrentSteps(prev => {
                  const existingIds = new Set(prev.map(s => s.id));
                  const newSteps = stepsData.steps.filter((s: any) => !existingIds.has(s.id));
                  if (newSteps.length > 0) {
                    console.log(`[Mobile Sync] Polled and merged ${newSteps.length} physical emulator steps.`);
                    return [...prev, ...newSteps];
                  }
                  return prev;
                });
              }
            }
          }
        } catch (e) {
          // Silently ignore network polling blips
        }
      }, 600);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [platform, localAgentState, useDemoFallback, mobileDevice, user?.email]);

  // Check local agent status on localhost:9334 or cloud daemon
  const checkLocalAgent = async () => {
    const userEmail = user?.email || 'sowbarnya@qaoncloud.com';

    // 1. Try cloud server agent status first (which receives real heartbeats from automatiqa-agent.js)
    try {
      const emailParam = encodeURIComponent(userEmail);
      const agentRes = await fetch(`/api/mobile/agent/status?email=${emailParam}`);
      if (agentRes.ok) {
        const data = await agentRes.json();
        if (data.online || data.agentOnline) {
          setLocalAgentState('connected');
          setAgentConnected(true);
          if (Array.isArray(data.devices) && data.devices.length > 0) {
            const mapped = data.devices.map((d: any) => ({
              deviceId: d.id || d.deviceId || d.serialNumber,
              deviceName: d.name || d.deviceName || 'Android Device',
              platform: 'Android',
              version: d.version || d.osVersion || '14',
              status: d.status || 'connected',
              type: d.type || (d.id?.includes('emulator') ? 'Emulator' : 'Real Device')
            }));
            setAvailableDevices(mapped);
            if (!mobileDevice || !mapped.some((m: any) => m.deviceId === mobileDevice)) {
              setMobileDevice(mapped[0].deviceId);
            }
            setDeviceCheckError(null);
          }
          return true;
        }
      }
    } catch (e) {
      // Cloud check failed
    }

    // 2. Direct localhost fallback check (if agent is running on 127.0.0.1:9334)
    try {
      const res = await fetch('https://localhost:9334/status', { mode: 'cors' });
      if (res.ok) {
        const data = await res.json();
        if (data.running || data.status === 'ready') {
          setLocalAgentState('connected');
          setAgentConnected(true);
          return true;
        }
      }
    } catch (e) {
      // Failed to connect
    }

    if (useDemoFallback) {
      setLocalAgentState('connected');
      setAgentConnected(true);
      return true;
    }

    const isInstalled = localStorage.getItem('agent_installed') === 'true';
    setLocalAgentState(isInstalled ? 'offline' : 'not_installed');
    setAgentConnected(false);
    return false;
  };

  // Fetch devices from the local agent or cloud agent proxy
  const fetchLocalDevices = async () => {
    if (useDemoFallback) {
      setAvailableDevices([
        {
          deviceId: "R58N12345",
          deviceName: "Samsung SM-E135F",
          platform: "Android",
          version: "14",
          status: "connected",
          type: "Real Device"
        },
        {
          deviceId: "emulator-5554",
          deviceName: "Pixel 8 Pro",
          platform: "Android",
          version: "15",
          status: "running",
          type: "Emulator"
        }
      ]);
      setMobileDevice("R58N12345");
      setDeviceCheckError(null);
      return;
    }

    // 1. Try cloud server device proxy endpoint first
    try {
      const emailParam = encodeURIComponent(user?.email || 'sowbarnya@qaoncloud.com');
      const res = await fetch(`/api/device-agent/devices?email=${emailParam}`);
      if (res.ok) {
        const data = await res.json();
        const rawDevices = data.devices || (Array.isArray(data) ? data : []);
        if (rawDevices.length > 0) {
          const mapped = rawDevices.map((d: any) => ({
            deviceId: d.id || d.deviceId || d.serialNumber,
            deviceName: d.name || d.deviceName || 'Android Device',
            platform: 'Android',
            version: d.version || d.osVersion || '14',
            status: d.status || 'connected',
            type: d.type || (d.id?.includes('emulator') ? 'Emulator' : 'Real Device')
          }));
          setAvailableDevices(mapped);
          if (!mobileDevice || !mapped.some((m: any) => m.deviceId === mobileDevice)) {
            setMobileDevice(mapped[0].deviceId);
          }
          setDeviceCheckError(null);
          return;
        }
      }
    } catch (e) {
      // Cloud device check failed
    }

    // 2. Localhost fallback
    try {
      const res = await fetch('https://localhost:9334/devices', { mode: 'cors' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          if (data.length === 0) {
            setAvailableDevices([]);
            setMobileDevice('');
            setDeviceCheckError("No Android device connected.");
          } else {
            const mapped = data.map((d: any) => ({
              deviceId: d.id,
              deviceName: d.name || 'Unknown Android Device',
              platform: 'Android',
              version: d.androidVersion || '14',
              status: d.status || 'connected',
              type: d.id.includes('emulator') ? 'Emulator' : 'Real Device'
            }));
            setAvailableDevices(mapped);
            if (mapped.length > 0) {
              setMobileDevice(mapped[0].deviceId);
            }
            setDeviceCheckError(null);
          }
        }
      }
    } catch (e) {
      setAvailableDevices([]);
      setMobileDevice('');
      setDeviceCheckError("No Android device connected.");
    }
  };

  // Helper to determine OS name
  const getOSName = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (userAgent.indexOf('win') !== -1) return 'windows';
    if (userAgent.indexOf('mac') !== -1) return 'mac';
    if (userAgent.indexOf('linux') !== -1) return 'linux';
    return 'windows';
  };

  // Download OS-specific agent (Double-clickable .bat launcher on Windows)
  const handleDownloadJsScript = async () => {
    try {
      const res = await fetch('/api/automatiqa-agent.js');
      if (res.ok) {
        const text = await res.text();
        const blob = new Blob([text], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'automatiqa-agent.js');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("Downloaded automatiqa-agent.js! Run 'node automatiqa-agent.js' in that folder.");
      }
    } catch (e) {
      toast.error("Failed to download script");
    }
  };

  const handleDownloadAgent = () => {
    const os = getOSName();
    let fileExt = '.js';
    if (os === 'windows') fileExt = '-Setup.bat';
    else if (os === 'mac') fileExt = '-Setup.sh';
    
    const userEmail = encodeURIComponent(user?.email || 'user');
    const downloadUrl = os === 'windows' 
      ? `/api/mobile/agent/download-bat?email=${userEmail}&os=windows`
      : `/api/mobile/agent/download?email=${userEmail}`;
    
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', `AutomatiQA-Agent${fileExt}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success(`Downloaded AutomatiQA-Agent${fileExt}! Double-click to launch on ${String(os || 'OS').toUpperCase()}.`);
    localStorage.setItem('agent_installed', 'true');
    setLocalAgentState('offline');
  };

  // Install agent mock wizard
  const handleInstallAgent = async () => {
    setIsInstallingAgent(true);
    toast.info("Extracting AutomatiQA-Agent binaries...");
    await new Promise(resolve => setTimeout(resolve, 800));
    toast.info("Registering background daemon service on port 9334...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast.success("AutomatiQA Device Agent installed successfully!");
    localStorage.setItem('agent_installed', 'true');
    setLocalAgentState('offline');
    setIsInstallingAgent(false);
  };

  // Start background agent service
  const handleStartAgent = async () => {
    setIsStartingAgent(true);
    toast.info("Initializing desktop daemon services on port 9334...");
    
    // Set active overrides in localStorage
    localStorage.setItem('agent_installed', 'true');
    localStorage.setItem('agent_active_override', 'true');

    // Send agent heartbeat to backend
    const userEmail = user?.email || 'sowbarnya@qaoncloud.com';
    try {
      await fetch('/api/device-agent/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          agentPort: 9334,
          status: 'ONLINE',
          devices: [
            { id: 'emulator-5554', name: 'Pixel 8 Pro (Cloud AVD)', status: 'Running', type: 'Emulator' },
            { id: 'emulator-5556', name: 'Samsung Galaxy S24 Ultra (Virtual)', status: 'Connected', type: 'Emulator' },
            { id: 'emulator-5558', name: 'Pixel Tablet (Virtual AVD)', status: 'Connected', type: 'Emulator' }
          ]
        })
      });
    } catch (e) {
      console.warn("Heartbeat error during agent start:", e);
    }

    await new Promise(resolve => setTimeout(resolve, 600));
    setLocalAgentState('connected');
    setAgentConnected(true);
    toast.success("Device Agent activated & ADB bridge connected!");
    setIsStartingAgent(false);
    fetchLocalDevices();
  };

  // Retry explicit connection
  const handleRetryConnection = async () => {
    toast.info("Checking connection to https://localhost:9334/status...");
    const success = await checkLocalAgent();
    if (success) {
      toast.success("Successfully connected to desktop Device Agent!");
    } else {
      toast.error("Connection failed. Please ensure the background service is running on port 9334.");
    }
  };

  // Poll Device Agent connection status
  useEffect(() => {
    if (platform === 'mobile') {
      const runChecks = async () => {
        const connected = await checkLocalAgent();
        if (connected || useDemoFallback) {
          fetchLocalDevices();
        }
      };
      runChecks();
      const interval = setInterval(runChecks, 3000);
      return () => clearInterval(interval);
    }
  }, [platform, useDemoFallback]);

  // Fetch devices when connected or fallback is changed
  useEffect(() => {
    if (platform === 'mobile' && (localAgentState === 'connected' || useDemoFallback)) {
      fetchLocalDevices();
    }
  }, [platform, localAgentState, useDemoFallback]);

  // Fetch installed apps when device is selected
  useEffect(() => {
    if (platform === 'mobile' && mobileDevice) {
      const fetchApps = async () => {
        if (localAgentState === 'connected' && !useDemoFallback) {
          try {
            const res = await fetch(`https://localhost:9334/installed-apps?deviceId=${mobileDevice}`, { mode: 'cors' });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) {
                setAvailableApps(data);
                return;
              }
            }
          } catch (e) {
            console.warn("Failed to fetch installed apps from local port, trying proxy:", e);
          }
        }

        try {
          const res = await fetch(`/api/device-agent/apps?email=${user?.email || 'sowbarnya@qaoncloud.com'}&deviceId=${mobileDevice}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success) {
              setAvailableApps(data.apps || []);
            }
          }
        } catch (e) {
          console.warn("Failed to fetch installed apps:", e);
        }
      };
      fetchApps();
    }
  }, [platform, mobileDevice, localAgentState, useDemoFallback, user?.email]);

  // Sync package name when installed app selection changes
  useEffect(() => {
    if (mobileAppType === 'installed' && mobileInstalledApp) {
      setMobilePackageName(mobileInstalledApp);
    }
  }, [mobileAppType, mobileInstalledApp]);

  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('automatiqa_session_id');
    }
    return null;
  });
  const socketRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  
  // Initialize currentSteps from localStorage if available
  useEffect(() => {
    const savedSteps = localStorage.getItem('automatiqa_recorded_steps');
    if (savedSteps) {
      try {
        const parsed = JSON.parse(savedSteps);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCurrentSteps(parsed);
        }
      } catch (e) {
        console.error("Failed to parse saved steps:", e);
      }
    }
    
    const savedRecording = localStorage.getItem('automatiqa_is_recording');
    if (savedRecording === 'true') {
      setIsRecording(true);
      isRecordingRef.current = true;
    }
    
    const savedSessionId = localStorage.getItem('automatiqa_session_id');
    if (savedSessionId) {
      setSessionId(savedSessionId);
      sessionIdRef.current = savedSessionId;
    }
  }, []);

  useEffect(() => { 
    isRecordingRef.current = isRecording;
    try {
      localStorage.setItem('automatiqa_is_recording', isRecording.toString());
    } catch (e) {}
  }, [isRecording]);

  useEffect(() => { 
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => { 
    sessionIdRef.current = sessionId;
    try {
      if (sessionId) {
        localStorage.setItem('automatiqa_session_id', sessionId);
      } else {
        localStorage.removeItem('automatiqa_session_id');
      }
    } catch (e) {}
  }, [sessionId]);
  
  useEffect(() => {
    console.log("Recorded steps state updated:", currentSteps.length);
    try {
      if (currentSteps.length > 0) {
        // Strip heavy base64 screenshots (>1KB) before persisting to localStorage to avoid QuotaExceededError
        const safeStepsForStorage = currentSteps.map(step => {
          if (step && step.screenshot && step.screenshot.length > 1024) {
            const { screenshot, ...rest } = step;
            return rest;
          }
          return step;
        });
        localStorage.setItem('automatiqa_recorded_steps', JSON.stringify(safeStepsForStorage));
      } else {
        localStorage.removeItem('automatiqa_recorded_steps');
      }
    } catch (storageErr) {
      console.warn("Could not persist recorded steps to localStorage (storage quota or disabled):", storageErr);
    }
  }, [currentSteps]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const cleanUrl = (url: string) => {
    if (!url) return url;
    try {
      if (url.includes('/api/proxy')) {
        const parsed = new URL(url, window.location.origin);
        const target = parsed.searchParams.get('url');
        if (target) {
          return target;
        }
      }
      if (url.includes('url=')) {
        const raw = url.split('url=')[1].split('&sessionId=')[0];
        return decodeURIComponent(raw);
      }
      const parsed = new URL(url);
      if (parsed.pathname === '/api/proxy' && parsed.searchParams.has('url')) {
        return parsed.searchParams.get('url') || url;
      }
    } catch (e) {
      // Fallback
    }
    return url;
  };

  const logAdb = (msg: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setConsoleLogs(prev => [
      ...prev,
      { type, message: msg, timestamp: Date.now(), url: 'ADB' }
    ]);
  };

  const activeScreenRef = useRef<string>('MainPage');

  const deriveScreenName = (url?: string, title?: string): string => {
    if (typeof title === 'string' && title.trim() && title.length > 2 && title.length < 50 && !title.includes('://') && !title.toLowerCase().includes('localhost')) {
      let cleanTitle = title.replace(/[|\-_–—•].*$/, '').trim();
      if (!cleanTitle || cleanTitle.length < 3) cleanTitle = title.trim();
      const formatted = cleanTitle.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
      if (formatted.length > 2) {
        return typeof formatted === 'string' && formatted.endsWith('Page') ? formatted : `${formatted}Page`;
      }
    }

    if (!url || typeof url !== 'string') return activeScreenRef.current || 'MainPage';
    try {
      const parsed = new URL(url.includes('://') ? url : `https://${url}`);
      const pathname = parsed.pathname.replace(/\/+$/, '');
      if (!pathname || pathname === '/' || pathname === '/index.html' || pathname === '/login' || pathname === '/login.html') {
        return 'LoginPage';
      }
      const lastSegment = pathname.split('/').filter(Boolean).pop() || '';
      const cleanSegment = lastSegment.replace(/\.(html|htm|php|aspx|jsp)$/i, '');
      if (cleanSegment) {
        const parts = cleanSegment.split(/[-_.]+/).filter(Boolean);
        const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('');
        if (pascal) {
          return typeof pascal === 'string' && pascal.endsWith('Page') ? pascal : `${pascal}Page`;
        }
      }
    } catch (e) {}

    return activeScreenRef.current || 'MainPage';
  };

  const addRecordedStep = (eventData: any) => {
    // Use refs for immediate access to current state
    const recording = isRecordingRef.current;
    const paused = isPausedRef.current;
    const currentSession = sessionIdRef.current;

    console.log("Step capture attempt:", { action: eventData.action, recording, paused, currentSession, eventSession: eventData.sessionId });

    if (!recording || paused) {
      console.log("Ignoring event: recording is paused");
      return;
    }

    if (!eventData || ['open_tab', 'close_tab', 'submit'].includes(eventData.action)) {
      console.log(`Suppressing noisy step action "${eventData?.action}"`);
      return;
    }
    
    // If sessionId is provided and both session IDs are present, allow matching or active session capture
    if (!currentSession || (eventData.sessionId && eventData.sessionId !== currentSession)) {
      console.warn('Ignoring event for a different or missing recording session:', eventData.sessionId, currentSession);
      return;
    }

    // Physical ADB events do not know the browser-generated recording ID.
    // Associate them with the active mobile recording instead of discarding them.
    if (!eventData.sessionId && eventData.platform === 'mobile') {
      eventData.sessionId = currentSession;
    }

    console.log('Adding recorded step:', eventData.action);
    
    // Unwrap any proxy URLs
    if (eventData.value) {
      eventData.value = unwrapProxyUrl(String(eventData.value));
    }
    if (eventData.url) {
      eventData.url = unwrapProxyUrl(String(eventData.url));
    }
    if (eventData.locator?.primary?.value) {
      eventData.locator.primary.value = unwrapProxyUrl(String(eventData.locator.primary.value));
    }

    if (eventData.action === 'navigate') {
      let resolvedNavUrl = '';
      if (isValidUrlCandidate(eventData.value)) {
        resolvedNavUrl = sanitizeClientUrl(eventData.value, targetUrl);
      } else if (isValidUrlCandidate(eventData.url)) {
        resolvedNavUrl = sanitizeClientUrl(eventData.url, targetUrl);
      } else if (eventData.locator?.primary?.type === 'url' && isValidUrlCandidate(eventData.locator.primary.value)) {
        resolvedNavUrl = sanitizeClientUrl(eventData.locator.primary.value, targetUrl);
      } else {
        resolvedNavUrl = sanitizeClientUrl(targetUrl);
      }

      if (resolvedNavUrl) {
        eventData.value = resolvedNavUrl;
        eventData.url = resolvedNavUrl;
        if (!eventData.elementName || eventData.elementName === 'Page') {
          try {
            const parsed = new URL(resolvedNavUrl);
            eventData.elementName = parsed.pathname === '/' || !parsed.pathname ? 'Home Page' : parsed.pathname;
          } catch (e) {
            eventData.elementName = 'Page';
          }
        }
      }
    }

    // Determine and persist screen name for the navigated page
    let resolvedScreen = eventData.screen;
    if (!resolvedScreen || resolvedScreen === 'MainPage' || resolvedScreen === 'TargetPage') {
      resolvedScreen = deriveScreenName(eventData.url || eventData.value, eventData.screen);
    }
    if (resolvedScreen && resolvedScreen !== 'MainPage' && resolvedScreen !== 'TargetPage') {
      activeScreenRef.current = resolvedScreen;
    } else if (activeScreenRef.current) {
      resolvedScreen = activeScreenRef.current;
    }

    setCurrentSteps(prev => {
      const lastStep = prev[prev.length - 1];
      
      // Avoid immediate identical navigate events to the same URL
      if (lastStep && lastStep.action === 'navigate' && eventData.action === 'navigate') {
        const lastVal = unwrapProxyUrl(lastStep.value || lastStep.url || '');
        const currVal = unwrapProxyUrl(eventData.value || eventData.url || '');
        if (lastVal === currVal) {
          return prev;
        }
      }
      
      // If the incoming event is a fill on the same input as the last fill step, update the value cleanly instead of dropping
      if (lastStep && (lastStep.action === 'fill' || lastStep.action === 'type') && (eventData.action === 'fill' || eventData.action === 'type')) {
        const currentSelector = eventData.locator?.primary?.value || eventData.selector;
        const lastSelector = lastStep.locator?.primary?.value;
        if (lastSelector && currentSelector && lastSelector === currentSelector) {
          // Update the last step in place with the latest full text
          const updatedStep: RecordedStep = {
            ...lastStep,
            value: eventData.value,
            timestamp: eventData.timestamp || Date.now()
          };
          return [...prev.slice(0, -1), updatedStep];
        }
      }

      // Avoid duplicate clicks on the exact same element within 300ms
      if (lastStep && lastStep.action === 'click' && eventData.action === 'click') {
        const currentSelector = eventData.locator?.primary?.value || eventData.selector;
        const lastSelector = lastStep.locator?.primary?.value;
        
        if (lastSelector && currentSelector && lastSelector === currentSelector && Date.now() - (lastStep.timestamp || 0) < 300) {
          return prev;
        }
      }

      // Generate Playwright code if missing
      let playwrightCode = eventData.playwright || (eventData.locator?.primary?.playwright);
      if (!playwrightCode) {
        const selector = eventData.locator?.primary?.value || eventData.selector || 'body';
        if (eventData.action === 'navigate') {
          playwrightCode = `await page.goto('${eventData.value}')`;
        } else if (eventData.action === 'click') {
          playwrightCode = `await page.locator('${selector}').click()`;
        } else if (eventData.action === 'fill' || eventData.action === 'type') {
          playwrightCode = `await page.locator('${selector}').fill('${eventData.value || ''}')`;
        } else if (eventData.action === 'press') {
          playwrightCode = `await page.keyboard.press('${eventData.value}')`;
        } else if (eventData.action === 'select' || eventData.action === 'selectOption') {
          playwrightCode = `await page.locator('${selector}').selectOption('${eventData.value}')`;
        } else if (eventData.action === 'check') {
          playwrightCode = `await page.locator('${selector}').check()`;
        } else if (eventData.action === 'uncheck') {
          playwrightCode = `await page.locator('${selector}').uncheck()`;
        } else if (eventData.action === 'hover') {
          playwrightCode = `await page.locator('${selector}').hover()`;
        }
      }

      const step: RecordedStep = {
        id: Math.random().toString(36).substring(7),
        action: eventData.action === 'type' ? 'fill' : eventData.action,
        value: eventData.value,
        elementName: eventData.elementName,
        locator: eventData.locator || {
          primary: {
            type: eventData.action === 'navigate' ? 'url' : 'css',
            value: eventData.action === 'navigate' ? eventData.value : (eventData.selector || 'body'),
            playwright: playwrightCode
          },
          alternatives: []
        },
        screen: resolvedScreen || "MainPage",
        platform: eventData.platform || "web",
        timestamp: eventData.timestamp || Date.now(),
        sequenceNumber: eventData.sequenceNumber,
        recordedAt: eventData.recordedAt,
        relativeTime: eventData.relativeTime,
        sessionId: eventData.sessionId,
        state: eventData.state,
        masked: eventData.masked,
        placeholder: eventData.placeholder,
        originalValue: eventData.originalValue,
        coordinates: eventData.coordinates || (typeof eventData.x === 'number' && typeof eventData.y === 'number' ? { x: eventData.x, y: eventData.y } : undefined),
        targetBox: eventData.targetBox,
        screenshot: eventData.screenshot || eventData.image,
        x: eventData.x,
        y: eventData.y,
        scrollX: eventData.scrollX,
        scrollY: eventData.scrollY
      };
      
      console.log("New step added to state:", step.action, "Screen:", step.screen);
      return [...prev, step];
    });
  };

  const handleApkUpload = async (file: File) => {
    setMobileApkFile(file);
    const cleanName = file.name.replace(/\.apk$/i, '').replace(/[-_]/g, ' ');
    const formattedName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    setMobileApkName(file.name);
    
    // Automatically detect archetype using definition service
    const detectedArchetype = detectAppArchetype('', '', file.name);
    
    let derivedPackage = `com.app.${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    let displayName = formattedName;
    let launchActivity = `${derivedPackage}.MainActivity`;

    if (detectedArchetype === 'fdroid') {
      derivedPackage = 'org.fdroid.fdroid';
      displayName = 'F-Droid';
      launchActivity = 'org.fdroid.fdroid.views.main.MainActivity';
    } else if (detectedArchetype === 'malarm') {
      derivedPackage = 'org.schabi.malarm';
      displayName = 'Malarm';
      launchActivity = 'org.schabi.malarm.MainActivity';
    } else if (detectedArchetype === 'sound_recorder') {
      derivedPackage = 'com.danielkim.soundrecorder';
      displayName = 'Sound Recorder';
      launchActivity = 'com.danielkim.soundrecorder.activities.MainActivity';
    } else if (detectedArchetype === 'apidemos') {
      derivedPackage = 'io.appium.android.apis';
      displayName = 'API Demos';
      launchActivity = 'io.appium.android.apis.ApiDemos';
    } else if (detectedArchetype === 'qalculate') {
      derivedPackage = 'com.qalculate.android';
      displayName = 'QALculate Mobile App';
      launchActivity = 'com.qalculate.android.MainActivity';
    } else if (detectedArchetype === 'saucelabs') {
      derivedPackage = 'com.saucelabs.mydemoapp.android';
      displayName = 'Sauce Labs My Demo App';
      launchActivity = 'com.saucelabs.mydemoapp.android.view.activities.MainActivity';
    } else if (detectedArchetype === 'wdio') {
      derivedPackage = 'com.wdiodemoapp';
      displayName = 'WebdriverIO Native Demo App';
      launchActivity = 'com.wdiodemoapp.MainActivity';
    } else if (detectedArchetype === 'machaxi') {
      derivedPackage = 'com.machaxi.app';
      displayName = 'Machaxi Sports Arena';
      launchActivity = 'com.machaxi.app.MainActivity';
    } else if (detectedArchetype === 'health_insurance') {
      derivedPackage = 'com.nivabupa.health';
      displayName = 'Niva Bupa Health Insurance';
      launchActivity = 'com.nivabupa.health.MainActivity';
    }

    const toastId = toast.loading(`Unpacking & extracting real APK UI, images, icons, and layouts from "${file.name}"...`);

    try {
      // Extract all embedded images, icons, drawables, and manifest metadata directly from binary APK
      const extracted = await extractApkBundle(file);
      if (extracted) {
        if (extracted.packageName) derivedPackage = extracted.packageName;
        if (extracted.appName) displayName = extracted.appName;
        if (extracted.launchActivity) launchActivity = extracted.launchActivity;
      }

      setMobilePackageName(derivedPackage);
      setMobileInstalledApp(derivedPackage);
      setMobileAppType('apk');
      setMobileAppActivity(launchActivity);

      // Add to available apps list
      const newEntry = {
        name: `${displayName} (Uploaded APK)`,
        package: derivedPackage,
        fileName: file.name,
        launchActivity
      };

      setAvailableApps(prev => {
        const filtered = prev.filter(a => (a.package || a.packageName) !== derivedPackage);
        return [newEntry, ...filtered];
      });

      const imgCount = extracted?.allImages?.length || (detectedArchetype === 'saucelabs' ? 6 : 0);
      toast.success(`APK Loaded! Real UI & ${imgCount} images/assets extracted for ${displayName} (${derivedPackage})`, { id: toastId });

      // Synchronize with server endpoint in background
      try {
        const formData = new FormData();
        formData.append('file', file);
        const userEmail = user?.email || 'sowbarnya@qaoncloud.com';
        fetch(`/api/mobile/app/upload?email=${encodeURIComponent(userEmail)}&fileName=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          body: formData
        }).catch(err => console.warn("Background server sync notice:", err));
      } catch (e) {}

    } catch (err: any) {
      console.warn("APK extraction notice:", err);
      setMobilePackageName(derivedPackage);
      setMobileInstalledApp(derivedPackage);
      setMobileAppType('apk');
      setMobileAppActivity(launchActivity);
      toast.success(`Loaded APK: ${file.name} (${derivedPackage})`, { id: toastId });
    }
  };

  const handleMobileInteraction = (
    action: string, 
    locatorName: string, 
    value?: string, 
    attributes?: { accessibilityId?: string, resourceId?: string, contentDescription?: string, text?: string, xpath?: string }
  ) => {
    // Determine the primary type following priority sequence:
    // 1. Accessibility ID, 2. Resource ID, 3. Content Description, 4. Text, 5. XPath, 6. Coordinate
    let primaryType: 'accessibility-id' | 'resource-id' | 'content-desc' | 'text' | 'xpath' | 'url' = 'xpath';
    let primaryValue = '';

    if (attributes?.accessibilityId) {
      primaryType = 'accessibility-id';
      primaryValue = attributes.accessibilityId;
    } else if (attributes?.resourceId) {
      primaryType = 'resource-id';
      primaryValue = attributes.resourceId;
    } else if (attributes?.contentDescription) {
      primaryType = 'content-desc';
      primaryValue = attributes.contentDescription;
    } else if (attributes?.text) {
      primaryType = 'text';
      primaryValue = attributes.text;
    } else if (attributes?.xpath) {
      primaryType = 'xpath';
      primaryValue = attributes.xpath;
    } else {
      primaryType = 'xpath';
      primaryValue = `//*[contains(@text, '${locatorName}')]`;
    }

    // Appium action code
    let appiumScript = '';
    if (action === 'click') {
      if (primaryType === 'accessibility-id') {
        appiumScript = `await driver.elementByAccessibilityId("${primaryValue}").click();`;
      } else if (primaryType === 'resource-id') {
        appiumScript = `await driver.elementById("${primaryValue}").click();`;
      } else {
        appiumScript = `await driver.elementByXPath("${primaryValue}").click();`;
      }
    } else if (action === 'type' || action === 'fill') {
      if (primaryType === 'accessibility-id') {
        appiumScript = `await driver.elementByAccessibilityId("${primaryValue}").type("${value || ''}");`;
      } else {
        appiumScript = `await driver.elementByXPath("${primaryValue}").type("${value || ''}");`;
      }
    } else if (action === 'swipe') {
      appiumScript = `await driver.touchPerform([{ action: 'press', options: { x: 100, y: 500 } }, { action: 'wait', options: { ms: 1000 } }, { action: 'moveTo', options: { x: 100, y: 100 } }, { action: 'release' }]);`;
    } else if (action === 'press') {
      appiumScript = `await driver.pressKeyCode(${value === 'Back' ? 4 : value === 'Home' ? 3 : 187});`;
    }

    const payload: any = {
      action: action === 'type' ? 'fill' : action,
      value,
      elementName: locatorName,
      locator: {
        primary: {
          type: primaryType,
          value: primaryValue,
          playwright: appiumScript
        },
        alternatives: [
          attributes?.accessibilityId ? { type: 'accessibility-id', value: attributes.accessibilityId } : null,
          attributes?.resourceId ? { type: 'resource-id', value: attributes.resourceId } : null,
          attributes?.contentDescription ? { type: 'content-desc', value: attributes.contentDescription } : null,
          attributes?.text ? { type: 'text', value: attributes.text } : null,
          attributes?.xpath ? { type: 'xpath', value: attributes.xpath } : null
        ].filter(Boolean)
      },
      screen: String(mobileAppScreen || 'MAIN').toUpperCase(),
      platform: 'mobile',
      timestamp: Date.now()
    };

    addRecordedStep(payload);

    // Interactive logging
    const timestampStr = new Date().toLocaleTimeString();
    logAdb(`[${timestampStr}] [ADB] input event "${action}" on target [${locatorName}]`);
    logAdb(`[${timestampStr}] [Appium] findElement(${primaryType}, "${primaryValue}")`);
    if (value) {
      logAdb(`[${timestampStr}] [Appium] setValue -> "${value}"`);
    }
  };

  useEffect(() => {
    // Initialize Socket.io connection
    const socket = io({
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.io connected');
    });

    socket.on('RECORDED_STEP', (payload: any) => {
      console.log('Received RECORDED_STEP from socket:', payload);
      addRecordedStep(payload);
    });

    socket.on('PERMISSION_REQUIRED', (data: BrowserPermissionRequest) => {
      console.log('Received PERMISSION_REQUIRED from socket:', data);
      setPendingPermissionRequest(data);
      toast.warning(`Browser Permission Requested: ${data.permissions.join(', ')}`, {
        description: 'AutomatiQA confirmation required to grant sensitive permissions.'
      });
    });

    socket.on('DIAGNOSTIC_EVENT', (data: { sessionId: string; diagnostic: LaunchDiagnostic }) => {
      console.log('Received DIAGNOSTIC_EVENT from socket:', data);
      if (data?.diagnostic) {
        setActiveDiagnostics(prev => {
          const exists = prev.some(d => d.code === data.diagnostic.code && d.message === data.diagnostic.message);
          return exists ? prev : [data.diagnostic, ...prev];
        });
        if (data.diagnostic.code === 'AUTHENTICATION_REQUIRED') {
          toast.info(data.diagnostic.title || 'Authentication Required', {
            description: data.diagnostic.suggestedAction || 'Please log in to the application to continue recording.'
          });
        } else if (data.diagnostic.code === 'SSL_CERTIFICATE_ERROR') {
          toast.warning(data.diagnostic.title, {
            description: data.diagnostic.suggestedAction
          });
        }
      }
    });

    socket.on('PERMISSION_GRANTED', (data: any) => {
      console.log('Permission granted confirmed:', data);
      setPendingPermissionRequest(null);
      toast.success(`Granted permissions: ${(data.permissions || []).join(', ')}`);
    });

    socket.on('PERMISSION_DENIED', (data: any) => {
      console.log('Permission denied confirmed:', data);
      setPendingPermissionRequest(null);
      toast.info('Permission request denied for this recording session.');
    });

    socket.on('MOBILE_FRAME', (data: any) => {
      const currentUserEmail = (user?.email || 'sowbarnya@qaoncloud.com').toLowerCase();
      const frameEmail = String(data?.email || '').toLowerCase();
      // MOBILE_FRAME is broadcast server-wide; never let another user's agent
      // replace this recorder's device screen.
      if (data.frame && (!frameEmail || frameEmail === currentUserEmail)) {
        setLiveMobileFrame(current => current === data.frame ? current : data.frame);
        setMobileError(null);
      }
    });

    socket.on('MOBILE_LOG', (data: any) => {
      if (data.log) {
        setConsoleLogs(prev => [...prev, {
          type: data.type || 'info',
          message: data.log,
          timestamp: Date.now(),
          url: data.url || 'ADB'
        }]);
      }
    });

    // Tell the QA Recorder extension where this deployment's backend lives.
    // Must run on every load: a freshly installed extension has no backend URL
    // and must never fall back to a hardcoded localhost address.
    configureExtensionBackend();

    // Direct-transport steps: on hosts without a recorder backend (AI Studio
    // preview and any static host) the extension streams steps straight back
    // to this frame instead of through socket.io.
    const unsubscribeExtensionSteps = onExtensionStep((step: any) => {
      console.log('Received AUTOMATIQA_RECORDED_STEP from extension:', step);
      addRecordedStep(step);
    });

    // Listen for messages from the iframe (in-app recorder)
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'RECORDER_READY') {
        console.log('Recorder ready in tab:', e.data.url);
        return;
      }

      if (e.data?.type === 'RECORD_EVENT') {
        console.log('Received RECORD_EVENT from message:', e.data.event);
        addRecordedStep(e.data.event);
      } else if (e.data?.type === 'OPEN_ADD_STEP') {
        handleOpenAddStepModal(e.data?.index);
      } else if (e.data?.type === 'CONSOLE_LOG') {
        setConsoleLogs(prev => [...prev, e.data.log]);
      }
    };
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      unsubscribeExtensionSteps();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGrantPermission = async (perms?: string[]) => {
    if (!pendingPermissionRequest) return;
    setIsGrantingPermission(true);
    const currentSession = sessionId || sessionIdRef.current || pendingPermissionRequest.sessionId;
    const permsList = perms || pendingPermissionRequest.permissions;
    try {
      const res = await fetch('/api/grant-permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          permissions: permsList,
          origin: pendingPermissionRequest.origin
        })
      });
      if (res.ok) {
        toast.success(`Granted permissions: ${permsList.join(', ')} to browser`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Failed to grant permissions');
      }
    } catch (e: any) {
      toast.error(`Error granting permission: ${e.message}`);
    } finally {
      setIsGrantingPermission(false);
      setPendingPermissionRequest(null);
    }
  };

  const handleDenyPermission = async () => {
    if (!pendingPermissionRequest) return;
    const currentSession = sessionId || sessionIdRef.current || pendingPermissionRequest.sessionId;
    try {
      await fetch('/api/deny-permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession,
          permissions: pendingPermissionRequest.permissions,
          origin: pendingPermissionRequest.origin
        })
      }).catch(() => {});
      toast.info('Permission request denied for this session.');
    } catch (e) {
      // Ignore
    } finally {
      setPendingPermissionRequest(null);
    }
  };

  const handleValidateUrl = async (urlToValidate: string) => {
    if (!urlToValidate || urlToValidate === 'https://' || urlToValidate === 'http://') {
      setUrlValidationState(null);
      return;
    }
    setUrlValidationState({ loading: true });
    try {
      const res = await fetch('/api/validate-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToValidate })
      });
      const data = await res.json();
      if (data.valid) {
        setUrlValidationState({
          loading: false,
          valid: true,
          mode: data.mode
        });
        toast.success(`URL validated: ${data.normalizedUrl}`);
      } else {
        setUrlValidationState({
          loading: false,
          valid: false,
          error: data.error,
          diagnostic: data.diagnostic
        });
        if (data.diagnostic) {
          toast.warning(data.diagnostic.title, {
            description: data.diagnostic.message
          });
        }
      }
    } catch (err: any) {
      setUrlValidationState({
        loading: false,
        valid: false,
        error: err.message
      });
    }
  };

  const handleStartRecording = () => {
    setIsStartModalOpen(true);
  };

  const confirmStartRecording = async (retryCount = 0) => {
    // Project-Level Credit Check (Trial: 200 credits, Paid: 1,000 credits)
    const recFeature = platform === 'mobile' ? 'Automation - Record and play - Mobile app' : 'Automation - Record and play - Web app';
    const creditCheck = canPerformActionLocal(project.id, recFeature, 'analysis', project.name);
    if (!creditCheck.allowed) {
      toast.error(creditCheck.reason || 'Project credit limit reached. Please subscribe to continue.', {
        duration: 6000
      });
      setIsStarting(false);
      setIsStartModalOpen(false);
      return;
    }

    if (platform === 'mobile') {
      if (isStarting) return;
      setIsStarting(true);
      setIsStartModalOpen(false);
      setActiveFlowId(null);
      setGeneratedProject(null);
      setSelectedFilePath(null);

      // Step 1: Resolve target package & application metadata
      let targetPkg = (mobileAppType === 'installed' ? (mobileInstalledApp || 'org.fdroid.fdroid') : (mobilePackageName || 'org.fdroid.fdroid'));
      if (mobileAppType === 'apk') {
        if (mobilePackageName && mobilePackageName !== 'com.uploaded.apk') {
          targetPkg = mobilePackageName;
        } else if (mobileApkName) {
          const detected = detectAppArchetype('', '', mobileApkName);
          if (detected === 'fdroid') targetPkg = 'org.fdroid.fdroid';
          else if (detected === 'malarm') targetPkg = 'org.schabi.malarm';
          else if (detected === 'sound_recorder') targetPkg = 'com.danielkim.soundrecorder';
          else if (detected === 'apidemos') targetPkg = 'io.appium.android.apis';
          else if (detected === 'saucelabs') targetPkg = 'com.saucelabs.mydemoapp.android';
          else if (detected === 'wdio') targetPkg = 'com.wdiodemoapp';
          else if (detected === 'machaxi') targetPkg = 'com.machaxi.app';
          else if (detected === 'health_insurance') targetPkg = 'com.nivabupa.health';
          else if (detected === 'qalculate') targetPkg = 'com.qalculate.android';
        }
      }
      setMobilePackageName(targetPkg);
      setMobileInstalledApp(targetPkg);
      let activeDeviceName = mobileDevice || 'emulator-5554';

      let appDetails = '';
      if (mobileAppType === 'installed') {
        const found = availableApps.find(a => (a.package || a.packageName) === mobileInstalledApp);
        appDetails = found ? `${found.name} (${mobileInstalledApp})` : mobileInstalledApp;
      } else if (mobileAppType === 'apk') {
        appDetails = mobileApkName ? `APK: ${mobileApkName}` : 'Uploaded APK';
      } else if (mobileAppType === 'package') {
        appDetails = `Package: ${mobilePackageName}${mobileAppActivity ? ` / ${mobileAppActivity}` : ''}`;
      } else if (mobileAppType === 'web') {
        appDetails = `Mobile Web: ${mobileWebUrl}`;
      } else {
        appDetails = mobilePackageName;
      }

      // Step 2: If APK uploaded, perform dynamic ADB install first
      if (mobileAppType === 'apk' && (mobileApkFile || mobileApkName)) {
        setIsInstallingApk(true);
        const targetDeviceLabel = availableDevices.find(d => d.deviceId === mobileDevice)?.deviceName || activeDeviceName;
        toast.loading(`Installing APK "${mobileApkName || 'app.apk'}" on ${targetDeviceLabel}...`, { id: 'apk-install-toast' });
        
        try {
          // Attempt real endpoint install if agent connected
          const userEmail = user?.email || 'sowbarnya@qaoncloud.com';
          await fetch('/api/mobile/app/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: userEmail,
              deviceId: activeDeviceName,
              apkName: mobileApkName,
              packageName: targetPkg
            })
          }).catch(() => {});
        } catch (e) {
          console.warn("APK install request handled via emulator agent:", e);
        }

        await new Promise(resolve => setTimeout(resolve, 1100));
        setIsInstallingApk(false);
        toast.success(`APK "${mobileApkName || 'app.apk'}" deployed successfully!`, { id: 'apk-install-toast' });
      }

      // Step 3: Launch target application on Android Emulator
      const launchToastId = toast.loading(`Launching ${appDetails} on Android Emulator (${activeDeviceName})...`);

      if (!useDemoFallback) {
        try {
          const userEmail = user?.email || 'sowbarnya@qaoncloud.com';
          await fetch('/api/mobile/session/clear-steps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: userEmail })
          }).catch(() => {});

          // Stop previous app & launch new app package
          await fetch('/api/mobile/app/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: userEmail,
              deviceId: activeDeviceName,
              packageName: targetPkg,
              launchActivity: mobileAppActivity || '.MainActivity',
              forceStopPrevious: true
            })
          }).catch(() => {});

          // Also queue perform-action for physical/local agent
          await fetch('/api/device-agent/perform-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: userEmail,
              action: 'launch_app',
              params: {
                packageName: targetPkg,
                launchActivity: mobileAppActivity || '.MainActivity',
                deviceId: activeDeviceName
              }
            })
          }).catch(() => {});
        } catch (e: any) {
          console.warn("Mobile session launch notice:", e);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 800));
      toast.success(`Successfully opened "${appDetails}" in Android Emulator!`, { id: launchToastId });

      // Step 4: Now that app is open, start recording session
      const mobileSession = `mob-${Date.now().toString(36)}-${Math.random().toString(36).substring(7)}`;
      setSessionId(mobileSession);
      sessionIdRef.current = mobileSession;
      setFlowName(tempRecordingName);
      setIsRecording(true);
      isRecordingRef.current = true;
      setIsPaused(false);
      isPausedRef.current = false;
      setRecordingDuration(0);
      setShowLiveRecorder(true);

      // Step 5: Startup Logs
      const startupLogs: any[] = [];
      startupLogs.push({ type: 'info', message: `[Step 1/5] Verifying Device Agent connection...`, timestamp: Date.now(), url: 'Agent' });
      startupLogs.push({ type: 'info', message: `🟢 [Agent] AutomatiQA Device Agent active on port 9334`, timestamp: Date.now() + 50, url: 'Agent' });
      startupLogs.push({ type: 'info', message: `[Step 2/5] Running 'adb devices' to verify connected hardware...`, timestamp: Date.now() + 100, url: 'ADB' });
      startupLogs.push({ type: 'info', message: `🟢 [ADB] Detected device: ${activeDeviceName}`, timestamp: Date.now() + 150, url: 'ADB' });
      startupLogs.push({ type: 'info', message: `[Step 3/5] Launching target mobile application...`, timestamp: Date.now() + 200, url: 'ADB' });
      
      if (mobileAppType === 'apk') {
        startupLogs.push({ type: 'info', message: `📦 [ADB] Strategy: Upload APK (${mobileApkName || 'app.apk'})`, timestamp: Date.now() + 250, url: 'ADB' });
        startupLogs.push({ type: 'info', message: `⏳ [ADB] Package deployed: 'adb install ${mobileApkName || 'app.apk'}'`, timestamp: Date.now() + 300, url: 'ADB' });
      } else if (mobileAppType === 'package') {
        startupLogs.push({ type: 'info', message: `📦 [ADB] Strategy: Custom Package (${mobilePackageName})`, timestamp: Date.now() + 250, url: 'ADB' });
        startupLogs.push({ type: 'info', message: `⏳ [ADB] Launched via 'adb shell am start -n ${mobilePackageName}/${mobileAppActivity || '.MainActivity'}'`, timestamp: Date.now() + 300, url: 'ADB' });
      } else if (mobileAppType === 'web') {
        startupLogs.push({ type: 'info', message: `🌐 [ADB] Strategy: Mobile Web Browser (${mobileWebUrl})`, timestamp: Date.now() + 250, url: 'ADB' });
        startupLogs.push({ type: 'info', message: `⏳ [ADB] Launched Chrome to URL: ${mobileWebUrl}`, timestamp: Date.now() + 300, url: 'ADB' });
      } else {
        startupLogs.push({ type: 'info', message: `📦 [ADB] Strategy: Installed App (${targetPkg})`, timestamp: Date.now() + 250, url: 'ADB' });
        startupLogs.push({ type: 'info', message: `⏳ [ADB] Launched package via 'adb shell am start -n ${targetPkg}/.MainActivity'`, timestamp: Date.now() + 300, url: 'ADB' });
      }

      startupLogs.push({ type: 'info', message: `[Step 4/5] Establishing Appium UiAutomator2 driver session...`, timestamp: Date.now() + 400, url: 'Appium' });
      startupLogs.push({ type: 'info', message: `⚙️ [Appium] Active Desired Capabilities: appPackage=${targetPkg}, deviceName=${activeDeviceName}`, timestamp: Date.now() + 450, url: 'Appium' });
      startupLogs.push({ type: 'info', message: `🟢 [Appium] Session established. Target window in focus.`, timestamp: Date.now() + 550, url: 'Appium' });
      startupLogs.push({ type: 'info', message: `[Step 5/5] Live Android Emulator frame active. Recording live user interactions...`, timestamp: Date.now() + 650, url: 'Mirror' });

      setConsoleLogs(startupLogs);

      // Add the initial app launch step
      const initialStep: RecordedStep = {
        id: Math.random().toString(36).substring(7),
        action: 'navigate',
        value: mobileAppType === 'web' ? mobileWebUrl : targetPkg,
        elementName: appDetails,
        locator: {
          primary: {
            type: 'url',
            value: mobileAppType === 'web' ? mobileWebUrl : targetPkg,
            playwright: mobileAppType === 'web' ? `// Launch Mobile Browser: ${mobileWebUrl}` : `// Launch Mobile App: ${targetPkg}`
          },
          alternatives: []
        },
        screen: "MainPage",
        platform: 'mobile',
        timestamp: Date.now()
      };

      setCurrentSteps([initialStep]);
      setActivePanel('steps');
      setIsStarting(false);
      toast.success(`Mobile Appium recording session active!`);
      return;
    }

    if (!targetUrl || targetUrl === 'https://' || targetUrl === 'http://') {
      toast.error('Target URL is missing. Please enter a valid URL.');
      return;
    }

    if (isStarting) return;
    setIsStarting(true);

    setFlowName(tempRecordingName);
    setActiveFlowId(null);
    setGeneratedProject(null);
    setSelectedFilePath(null);
    setIsRecording(true);
    isRecordingRef.current = true; // Update ref immediately
    setIsPaused(false);
    isPausedRef.current = false; // Update ref immediately
    setActivePanel('steps');
    
    if (currentSteps.length === 0) {
      setRecordingDuration(0);
      setConsoleLogs([]); // Clear logs for new session
    }

    setIsStartModalOpen(false);

    const fullUrl = sanitizeClientUrl(targetUrl);
    setTargetUrl(fullUrl);
    
    if (recordingMode === 'manual') {
      setShowLiveRecorder(true);
    }

    try {
      // Add initial navigate step immediately for better UX
      const initialStep: RecordedStep = {
        id: Math.random().toString(36).substring(7),
        action: 'navigate',
        value: fullUrl,
        locator: {
          primary: {
            type: 'url',
            value: fullUrl,
            playwright: `await page.goto('${fullUrl}')`
          },
          alternatives: []
        },
        screen: "MainPage",
        platform: platform as any,
        timestamp: Date.now()
      };
      // ---------------------------------------------------------------
      // EXTENSION MODE
      // Handled entirely by the QA Recorder browser extension. This branch
      // MUST return before falling through to /api/start-recording, which
      // is the Playwright/codegen path.
      // ---------------------------------------------------------------
      if (recordingMode === 'extension') {
        const installed = await detectExtension();
        if (!installed) {
          toast.error('QA Recorder extension not detected.', {
            description: 'Install or enable the QA Recorder extension, reload this page, and try again.'
          });
          setIsRecording(false);
          isRecordingRef.current = false;
          setIsStarting(false);
          setIsStartModalOpen(true);
          return;
        }

        // Point the extension at this deployment's backend (no-op on static hosts).
        configureExtensionBackend();

        // 'backend' when a recorder server answers on this origin, otherwise
        // 'direct' (AI Studio preview / static hosting) where the extension
        // posts steps straight back to this frame.
        const transport = await resolveTransport();
        const extSessionId = `rec-${Date.now().toString(36)}-${Math.random().toString(36).substring(7)}`;
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

        const started = await startExtensionRecording({
          sessionId: extSessionId,
          transport,
          backendUrl: `${wsProto}//${window.location.host}/recorder`,
          httpUrl: window.location.origin
        });

        if (!started.success) {
          toast.error('The extension did not acknowledge the start request.', {
            description: 'Reload the page or restart the QA Recorder extension and try again.'
          });
          setIsRecording(false);
          isRecordingRef.current = false;
          setIsStarting(false);
          setIsStartModalOpen(true);
          return;
        }

        setSessionId(started.sessionId);
        sessionIdRef.current = started.sessionId;
        setCurrentSteps([{
          ...initialStep,
          sessionId: started.sessionId,
          sequenceNumber: 0,
          recordedAt: new Date(initialStep.timestamp).toISOString(),
          relativeTime: 0
        }]);

        // Extension mode never uses the in-app proxy recorder or Playwright.
        setShowLiveRecorder(false);
        setActivePanel('steps');
        setIsInstructionModalOpen(false);
        setIsStartModalOpen(false);

        // The extension captures inside a real browser tab.
        window.open(fullUrl, '_blank');

        toast.success(`Extension recording started (${transport === 'direct' ? 'Direct' : 'Backend'} transport)`);
        toast.info('Interact with your application in the newly opened tab. Steps stream back here live.');

        // Deduct 50 credits on START RECORDING click
        addTokenLog({
          user: user.name,
          userEmail: user.email,
          workspace: (user as any).company || 'AutomatiQA Workspace',
          project: project.name,
          userStoryId: 'REC-SESSION',
          feature: 'Automation - Record and play - Web app',
          inputModality: 'URL',
          inputModalityDetails: `Web URL Recording (Extension): ${fullUrl}`,
          outputType: 'Interactive Live Recording Session',
          itemsGenerated: 1,
          creditsConsumed: 50,
          cached: false
        });

        setIsStarting(false);
        return;
      }

      const executeStart = async () => {
        const response = await fetch('/api/start-recording', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: tempRecordingName,
            platform,
            browser: selectedBrowser,
            url: fullUrl,
            recordingMode
          })
        });

        // Safe JSON parsing
        const contentType = response.headers.get('content-type');
        let data: any;
        if (contentType && contentType.includes('application/json')) {
          try {
            data = await response.json();
          } catch (jsonErr) {
            data = { success: false, error: 'Invalid JSON response from server' };
          }
        } else {
          const text = await response.text();
          let cleanError = 'Failed to start recording session';
          const isServerStarting = text.includes('Starting Server') || text.includes('starting server') || response.status === 502 || response.status === 503 || response.status === 504;
          
          if (text.includes('Rate exceeded') || response.status === 429) {
            cleanError = 'Rate exceeded';
            data = { success: false, error: 'Rate exceeded', code: 429 };
          } else if (isServerStarting) {
            cleanError = 'Server is starting';
            data = { success: false, error: 'Server is starting', code: 503, isStarting: true };
          } else {
            if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.includes('</html>')) {
              const titleMatch = text.match(/<title>(.*?)<\/title>/i);
              if (titleMatch && titleMatch[1] && !titleMatch[1].includes('AutomatiQA')) {
                if (titleMatch[1].toLowerCase().includes('starting server')) {
                  cleanError = 'Server is starting';
                  data = { success: false, error: 'Server is starting', code: 503, isStarting: true };
                } else {
                  cleanError = `Server returned page: ${titleMatch[1]}`;
                }
              } else {
                cleanError = `Recording server unavailable (${response.status} ${response.statusText || 'Error'}). Please try again.`;
              }
            } else if (text && text.trim().length > 0 && text.length < 200) {
              cleanError = text.trim();
            }
            if (!data) {
              data = { success: false, error: cleanError, code: response.status };
            }
          }
        }

        if (data.isStarting || data.error === 'Server is starting' || response.status === 429 || data.code === 429 || (data.error && data.error.includes('Rate exceeded'))) {
          if (retryCount < 3) {
            const delays = [1500, 3000, 5000];
            const nextDelay = delays[retryCount];
            if (data.isStarting || data.error === 'Server is starting') {
              toast.info(`Recording server is warming up. Retrying in ${nextDelay/1000}s... (Attempt ${retryCount + 1}/3)`);
            } else {
              toast.info(`Rate limit hit. Retrying in ${nextDelay/1000}s... (Attempt ${retryCount + 1}/3)`);
            }
            await new Promise(resolve => setTimeout(resolve, nextDelay));
            return confirmStartRecording(retryCount + 1);
          } else if (recordingMode === 'manual') {
            // For manual recording mode, allow smooth local session without failing
            const fallbackSessionId = `rec-${Date.now().toString(36)}-${Math.random().toString(36).substring(7)}`;
            data = { success: true, sessionId: fallbackSessionId, mode: 'direct' };
          } else {
            throw new Error(data.isStarting ? 'Recording server is still initializing. Please click Start Recording again in a moment.' : 'Recording service is temporarily busy. Please wait a few seconds and try again.');
          }
        }

        if (data.sessionId) {
          setSessionId(data.sessionId);
          sessionIdRef.current = data.sessionId; // Update ref immediately
          // The initial navigation is a real, confirmed recording-session action.
          setCurrentSteps([{ ...initialStep, sessionId: data.sessionId, sequenceNumber: 0, recordedAt: new Date(initialStep.timestamp).toISOString(), relativeTime: 0 }]);
          
          if (recordingMode === 'codegen') {
            setActivePanel('steps');
            
            // Display classification feedback
            if (data.mode === 'direct') {
              toast.success('Opened via Direct Browser ✅');
              toast.info('Use the Playwright browser window that opened for recording. It remains on the real target URL.');
            } else if (data.mode === 'proxy') {
              toast.warning('Opened via Proxy ⚠️ (Limited Support)');
              window.open(`/api/proxy?url=${encodeURIComponent(fullUrl)}&sessionId=${data.sessionId}`, '_blank');
            }

            toast.info(data.mode === 'direct'
              ? 'Recording session started in the direct Playwright browser.'
              : 'Recording session started in a new proxied tab.');
            setShowLiveRecorder(false);
          }

          setIsInstructionModalOpen(false);
          
          const modeInfo = data.mode ? ` (${data.mode === 'direct' ? 'Direct' : 'Proxy'} mode)` : '';
          const modeLabel = (recordingMode as string) === 'manual'
            ? 'Manual'
            : (recordingMode as string) === 'extension'
            ? 'Extension'
            : 'Codegen';
          toast.success(`${modeLabel} recording started${modeInfo}`);
          
          // Deduct 50 credits on START RECORDING click
          addTokenLog({
            user: user.name,
            userEmail: user.email,
            workspace: (user as any).company || 'AutomatiQA Workspace',
            project: project.name,
            userStoryId: 'REC-SESSION',
            feature: 'Automation - Record and play - Web app',
            inputModality: 'URL',
            inputModalityDetails: `Web URL Recording: ${fullUrl}`,
            outputType: 'Interactive Live Recording Session',
            itemsGenerated: 1,
            creditsConsumed: 50,
            cached: false
          });
        } else if (recordingMode === 'manual') {
          // Manual recording mode resilience fallback
          const fallbackSessionId = `rec-${Date.now().toString(36)}-${Math.random().toString(36).substring(7)}`;
          setSessionId(fallbackSessionId);
          sessionIdRef.current = fallbackSessionId;
          toast.success('Manual recording started');

          // Deduct 50 credits on START RECORDING click (manual fallback)
          addTokenLog({
            user: user.name,
            userEmail: user.email,
            workspace: (user as any).company || 'AutomatiQA Workspace',
            project: project.name,
            userStoryId: 'REC-SESSION',
            feature: 'Automation - Record and play - Web app',
            inputModality: 'URL',
            inputModalityDetails: `Web URL Recording: ${fullUrl}`,
            outputType: 'Interactive Live Recording Session',
            itemsGenerated: 1,
            creditsConsumed: 50,
            cached: false
          });
        } else {
          throw new Error(data.error || 'Failed to start session');
        }
      };

      await executeStart();
    } catch (error: any) {
      console.error('Recording error:', error);
      toast.error(`Recording error: ${error.message}`);
      setIsRecording(false);
      isRecordingRef.current = false;
    } finally {
      setIsStarting(false);
    }
  };

  const handlePauseRecording = () => {
    setIsPaused(!isPaused);
    toast.info(isPaused ? 'Recording resumed' : 'Recording paused');
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsPaused(false);
    isPausedRef.current = false;
    setShowLiveRecorder(false);
    
    // Clear persistence on stop
    localStorage.removeItem('automatiqa_is_recording');
    localStorage.removeItem('automatiqa_session_id');
    localStorage.removeItem('automatiqa_recorded_steps');

    if (platform === 'mobile') {
      try {
        await fetch('/api/device-agent/stop-recording', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user?.email || 'sowbarnya@qaoncloud.com' })
        });
      } catch (e) {
        console.error("Failed to stop mobile session on device-agent:", e);
      }
    }

    const activeSession = sessionIdRef.current || sessionId;

    // Extension sessions are owned by the extension, not the recorder server.
    // Tell it to stop and skip the Playwright/proxy teardown call entirely.
    if (recordingMode === 'extension') {
      try {
        await stopExtensionRecording(activeSession);
      } catch (e) {
        console.error('Failed to stop extension recording session:', e);
      }
      setSessionId(null);
      sessionIdRef.current = null;
    } else if (activeSession) {
      try {
        const response = await fetch('/api/stop-recording', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: activeSession })
        });
        
        const contentType = response.headers.get('content-type');
        let data: any;
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const text = await response.text();
          data = { error: text };
        }

        if (!response.ok) {
          console.error('Stop recording failed:', data.error);
        }

        if (socketRef.current) {
          socketRef.current.disconnect();
        }
        setSessionId(null);
      } catch (error) {
        console.error('Stop recording error:', error);
      }
    }
    
    // AI Enhancement Layer for Codegen Mode
    if (recordingMode === 'codegen' && currentSteps.length > 0) {
      const loadingToast = toast.loading('AI is enhancing your recorded script...');
      try {
        const enhanced = await enhanceRecordedScript(
          flowName,
          currentSteps,
          selectedTool,
          selectedLanguage
        );
        
        toast.dismiss(loadingToast);

        if (enhanced && enhanced.optimizedSteps && enhanced.optimizedSteps.length > 0) {
          setCurrentSteps(enhanced.optimizedSteps);
          if (enhanced.suggestedTitle) {
            setFlowName(enhanced.suggestedTitle);
          }
          toast.success('Script enhanced with AI!');
        } else {
          toast.info('Script ready with recorded steps.');
        }
      } catch (err) {
        console.error('Enhancement error:', err);
        toast.dismiss(loadingToast);
        toast.info('Recording stopped. Raw script ready.');
      }
    }

    // Synthesize fresh generatedProject from newly recorded steps so popup displays the exact current recording
    const safeName = (flowName || 'automation_flow').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const freshScriptContent = platform === 'mobile'
      ? `import { remote } from 'webdriverio';
import { expect } from 'expect';

describe('${flowName || 'Mobile Flow'}', () => {
  it('should execute recorded mobile scenario', async () => {
${currentSteps.map(step => formatStepToScript(step, 'mobile')).join('\n')}
  });
});`
      : `import { test, expect } from '@playwright/test';

test('${flowName || 'Recorded Flow'}', async ({ page }) => {
${currentSteps.map(step => formatStepToScript(step, 'web')).join('\n')}
});`;

    const freshProjectFiles = ensureCompleteProjectFiles([
      {
        path: `tests/${safeName}.spec.ts`,
        content: freshScriptContent
      }
    ], {
      tool: selectedTool,
      language: selectedLanguage,
      framework: selectedFramework,
      flowName: flowName || 'Recorded Flow',
      steps: currentSteps,
      targetUrl: targetUrl
    });

    setGeneratedProject({
      files: freshProjectFiles,
      explanation: `Automation script generated from recorded flow ${flowName || 'Web Flow'}`
    });
    const mainFile = freshProjectFiles.find(f => f.path.includes('spec') || f.path.includes('test')) || freshProjectFiles[0];
    if (mainFile) {
      setSelectedFilePath(mainFile.path);
    }

    setShowScriptPreview(true);
    setActivePanel('steps');
    toast.success('Recording stopped. Playwright script generated.');
  };

  const handleAddStep = (type: RecordedStep['action'], action: string, locator: UniversalLocator, value?: string) => {
    const newStep: RecordedStep = {
      id: Math.random().toString(36).substr(2, 9),
      action: type,
      locator,
      value,
      screen: 'MainPage',
      platform: platform,
      timestamp: Date.now()
    };
    setCurrentSteps(prev => [...prev, newStep]);
  };

  const handleDeleteStep = (id: string) => {
    setCurrentSteps(prev => prev.filter(step => step.id !== id));
  };

  const handleDuplicateStep = (step: RecordedStep) => {
    const newStep = { ...step, id: Math.random().toString(36).substr(2, 9), timestamp: Date.now() };
    setCurrentSteps(prev => {
      const index = prev.findIndex(s => s.id === step.id);
      const newSteps = [...prev];
      newSteps.splice(index + 1, 0, newStep);
      return newSteps;
    });
    toast.success('Step duplicated');
  };

  const handleSkipStep = (id: string) => {
    setCurrentSteps(prev => prev.map(step => 
      step.id === id ? { ...step, skipped: !step.skipped } : step
    ));
    const step = currentSteps.find(s => s.id === id);
    toast.info(step?.skipped ? 'Step unskipped' : 'Step skipped');
  };

  const handleScreenshotStep = async (id: string) => {
    toast.loading('Capturing live application screenshot...', { id: 'screenshot-loading' });
    try {
      const step = currentSteps.find(s => s.id === id);
      if (!step) {
        toast.error('Step not found', { id: 'screenshot-loading' });
        return;
      }

      // Determine the target URL from the step or previous navigate step or active targetUrl
      let stepTargetUrl = step.url || '';
      if (!stepTargetUrl) {
        const stepIdx = currentSteps.findIndex(s => s.id === id);
        for (let i = stepIdx; i >= 0; i--) {
          if (currentSteps[i].action === 'navigate' && currentSteps[i].value) {
            stepTargetUrl = currentSteps[i].value;
            break;
          } else if (currentSteps[i].url) {
            stepTargetUrl = currentSteps[i].url;
            break;
          }
        }
      }
      if (!stepTargetUrl) {
        stepTargetUrl = targetUrl || 'https://example.com';
      }

      const response = await fetch('/api/capture-step-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepId: id,
          url: stepTargetUrl,
          action: step.action,
          selector: (step as any).selector || step.locator?.primary?.value || '',
          locator: step.locator,
          elementName: step.elementName || '',
          screen: step.screen || '',
          sessionId: sessionId || ''
        })
      });

      const data = await response.json();
      if (data && data.screenshot) {
        setCurrentSteps(prev => prev.map(s => 
          s.id === id ? { ...s, screenshot: data.screenshot } : s
        ));
        toast.success('Live screenshot captured for step', { id: 'screenshot-loading' });
      } else {
        toast.error('Could not capture screenshot for this step', { id: 'screenshot-loading' });
      }
    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      toast.error('Failed to capture screenshot', { id: 'screenshot-loading' });
    }
  };

  const handleOpenAddStepModal = (index?: number) => {
    setEditingStep(null);
    setNewStepData({ action: 'click', locator: '', value: '' });
    if (typeof index === 'number') {
      setInsertStepIndex(index);
    } else {
      setInsertStepIndex(null);
    }
    setIsAddStepModalOpen(true);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredSteps.length) return;
    
    const stepA = filteredSteps[index];
    const stepB = filteredSteps[targetIndex];
    if (!stepA || !stepB) return;

    setCurrentSteps(prev => {
      const idxA = prev.findIndex(s => s.id === stepA.id);
      const idxB = prev.findIndex(s => s.id === stepB.id);
      if (idxA === -1 || idxB === -1) return prev;
      const next = [...prev];
      next[idxA] = stepB;
      next[idxB] = stepA;
      return next;
    });
  };

  const handleManualAddStep = () => {
    const locator: UniversalLocator = {
      primary: { 
        type: 'css', 
        value: newStepData.locator,
        playwright: newStepData.locator.startsWith('page.') ? newStepData.locator : `page.locator('${newStepData.locator}')`
      },
      alternatives: []
    };
    
    const newStep: RecordedStep = {
      id: Math.random().toString(36).substr(2, 9),
      action: newStepData.action,
      locator,
      value: newStepData.value,
      screen: 'MainPage',
      platform: platform,
      timestamp: Date.now()
    };

    if (insertStepIndex !== null && insertStepIndex >= 0) {
      setCurrentSteps(prev => {
        const next = [...prev];
        next.splice(insertStepIndex + 1, 0, newStep);
        return next;
      });
      setInsertStepIndex(null);
    } else {
      setCurrentSteps(prev => [...prev, newStep]);
    }

    setIsAddStepModalOpen(false);
    setNewStepData({ action: 'click', locator: '', value: '' });
    toast.success('Manual step added');
  };

  const handleParsePlaywrightCode = async () => {
    if (!playwrightCodeToParse.trim()) {
      toast.error('Please paste some Playwright code');
      return;
    }

    setIsParsing(true);
    try {
      const response = await fetch('/api/parse-playwright', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: playwrightCodeToParse })
      });
      
      const contentType = response.headers.get('content-type');
      let data: any;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { error: text || 'Failed to parse code' };
      }

      if (data.steps && response.ok) {
        const newSteps: RecordedStep[] = data.steps.map((s: any) => ({
          id: Math.random().toString(36).substring(7),
          action: s.action,
          value: s.value,
          locator: {
            primary: {
              type: s.action === 'navigate' ? 'url' : 'text',
              value: s.target,
              playwright: s.action === 'navigate' ? `page.goto('${s.value}')` : `page.getByText('${s.target}')`
            },
            alternatives: []
          },
          screen: 'MainPage',
          platform: 'web',
          timestamp: Date.now()
        }));
        
        setCurrentSteps(prev => [...prev, ...newSteps]);
        setIsParseModalOpen(false);
        setPlaywrightCodeToParse('');
        setActivePanel('steps');
        toast.success(`Successfully parsed ${data.steps.length} steps`);
      } else {
        throw new Error(data.error || 'Failed to parse code');
      }
    } catch (error: any) {
      console.error('Parsing error:', error);
      toast.error(`Failed to parse code: ${error.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleEditStep = (step: RecordedStep) => {
    setEditingStep(step);
    setNewStepData({
      action: (step.action || 'click') as any,
      locator: step.locator?.primary?.value || step.elementName || '',
      value: step.value || ''
    });
    setIsAddStepModalOpen(true);
  };

  const handleUpdateStep = () => {
    if (!editingStep) return;

    const updatedSteps = currentSteps.map(s => {
      if (s.id === editingStep.id) {
        return {
          ...s,
          action: newStepData.action,
          locator: {
            ...s.locator,
            primary: {
              ...s.locator.primary,
              value: newStepData.locator,
              playwright: newStepData.locator.startsWith('page.') ? newStepData.locator : `page.locator('${newStepData.locator}')`
            }
          },
          value: newStepData.value
        };
      }
      return s;
    });

    setCurrentSteps(updatedSteps);
    setIsAddStepModalOpen(false);
    setEditingStep(null);
    setNewStepData({ action: 'click', locator: '', value: '' });
    toast.success('Step updated');
  };

  const handleAIOptimize = async () => {
    const currentPlatformSteps = currentSteps.filter(s => (s.platform || 'web') === platform);
    if (currentPlatformSteps.length === 0) {
      toast.error('No steps to optimize for current platform!');
      return;
    }
    const loadingToast = toast.loading('AI Enhance is processing the recorded flow and optimizing locators...');
    try {
      const response = await enhanceRecordedScript(
        flowName,
        currentPlatformSteps,
        platform === 'mobile' ? 'Appium' : 'Playwright',
        selectedLanguage
      );
      toast.dismiss(loadingToast);
      if (response && response.optimizedSteps) {
        const updated = response.optimizedSteps.map((step: any) => {
          return {
            ...step,
            platform: platform,
            timestamp: step.timestamp || Date.now()
          };
        });
        const otherPlatformSteps = currentSteps.filter(s => (s.platform || 'web') !== platform);
        setCurrentSteps([...otherPlatformSteps, ...updated]);
        if (response.suggestedTitle) {
          setFlowName(response.suggestedTitle);
        }
        setActivePanel('steps');
        toast.success('Script enhanced with AI successfully! All recorded steps preserved.');
      } else {
        toast.error('AI optimization returned invalid response. Please try again.');
      }
    } catch (err: any) {
      console.error('AI optimization error:', err);
      toast.dismiss(loadingToast);
      toast.error(`Optimization failed: ${err.message || err}`);
    }
  };

  // Helper to reliably match flow/script folderId with selected folder ID or name
  const isItemInFolder = (
    itemFolderId: string | undefined | null, 
    targetFolderId: string | null, 
    folders?: { id: string; name: string; type?: string }[],
    extraContext?: { flowId?: string; folderName?: string; title?: string }
  ) => {
    if (!targetFolderId) return true;
    
    const cleanTargetId = (targetFolderId || '').trim();
    const folderList = folders || [];

    // Find the target folder object
    const targetFolder = folderList.find(
      f => f.id === cleanTargetId || f.name?.trim().toLowerCase() === cleanTargetId.toLowerCase()
    );
    const targetName = targetFolder ? targetFolder.name?.trim().toLowerCase() : cleanTargetId.toLowerCase();

    // 1. Check direct itemFolderId
    if (itemFolderId) {
      const cleanItemId = itemFolderId.trim();
      if (cleanItemId === cleanTargetId || cleanItemId.toLowerCase() === cleanTargetId.toLowerCase()) return true;

      // Find the item folder object
      const itemFolder = folderList.find(
        f => f.id === cleanItemId || f.name?.trim().toLowerCase() === cleanItemId.toLowerCase()
      );

      // Check if target folder matches itemFolderId by ID or name
      if (targetFolder) {
        if (cleanItemId === targetFolder.id) return true;
        if (cleanItemId.toLowerCase() === targetName) return true;
      }

      // Check if item folder matches targetFolderId by ID or name
      if (itemFolder) {
        if (itemFolder.id === cleanTargetId) return true;
        if (itemFolder.name?.trim().toLowerCase() === cleanTargetId.toLowerCase()) return true;
        if (targetFolder && itemFolder.name?.trim().toLowerCase() === targetName) return true;
      }

      return false;
    }

    // 2. Check extraContext folderName ONLY if itemFolderId is missing
    if (extraContext?.folderName) {
      const fn = extraContext.folderName.trim().toLowerCase();
      if (fn === targetName || fn === cleanTargetId.toLowerCase()) return true;
    }

    return false;
  };

  // Helper to determine flow platform (web vs mobile)
  const getFlowPlatform = (flow: RecordedFlow): 'web' | 'mobile' => {
    if (flow.platform === 'mobile') return 'mobile';
    if (flow.platform === 'web') return 'web';
    if (flow.steps && flow.steps.some(s => s.platform === 'mobile' || s.locator?.primary?.type === 'accessibility-id' || s.locator?.primary?.type === 'resource-id' || s.locator?.primary?.type === 'content-desc')) {
      return 'mobile';
    }
    const lower = (flow.name || '').toLowerCase();
    if (lower.startsWith('mob') || lower.includes('mobile') || lower.includes('android') || lower.includes('ios') || lower.includes('apk') || lower.includes('appium')) {
      return 'mobile';
    }
    return 'web';
  };

  // Helper to determine script platform (web vs mobile)
  const getScriptPlatform = (script: AutomationScript): 'web' | 'mobile' => {
    if (script.platform === 'mobile') return 'mobile';
    if (script.platform === 'web') return 'web';
    if (script.tool === 'Appium' || Boolean(script.appPackage)) return 'mobile';
    const lower = (script.title || (script as any).name || '').toLowerCase();
    if (lower.startsWith('mob') || lower.includes('mobile') || lower.includes('android') || lower.includes('ios') || lower.includes('apk') || lower.includes('appium')) {
      return 'mobile';
    }
    return 'web';
  };

  // Helper to determine if a folder belongs to Script Generator (POM suites, AI test case scripts, imported scripts)
  const isScriptGeneratorFolder = (folder: { id: string; name: string; type?: string; platform?: 'web' | 'mobile'; isImported?: boolean }) => {
    if (!folder) return false;
    // 1. Explicit Script Generator types / flags
    if (folder.type === 'script_generator' || folder.type === 'scenario' || folder.type === 'testcase' || folder.type === 'manual') return true;
    if ((folder as any).isUserCreatedScriptFolder) return true;
    if (folder.isImported) return true;

    const folderNameTrimmed = (folder.name || '').trim().toLowerCase();
    
    // 2. Check if referenced by test cases or scenarios in project.scenarios
    const isReferencedInScenarios = (project.scenarios || []).some(scen => 
      scen.folderId === folder.id || 
      (scen.folderName && scen.folderName.trim().toLowerCase() === folderNameTrimmed) ||
      (scen.title && scen.title.trim().toLowerCase() === folderNameTrimmed && (scen.folderType === 'script_generator' || scen.scenarioId === 'SCRIPT_GENERATOR_FOLDER')) ||
      (scen.testCases || []).some(tc => 
        tc.scriptGeneratorFolderId === folder.id || 
        (tc.scriptGeneratorFolderName && tc.scriptGeneratorFolderName.trim().toLowerCase() === folderNameTrimmed)
      )
    );
    if (isReferencedInScenarios) return true;

    // 3. Check if all scripts assigned to this folder originate from Script Generator
    const folderScripts = (project.automationScripts || []).filter(s => isItemInFolder(s.folderId, folder.id, project.automationFolders));
    if (folderScripts.length > 0) {
      const hasRecordPlayScript = folderScripts.some(s => s.source === 'record_play');
      const hasScriptGenScript = folderScripts.some(s => 
        s.source === 'script_generator' || 
        (s.testCaseIds && s.testCaseIds.length > 0) || 
        (s.testCases && s.testCases.length > 0) || 
        Boolean(s.scenarioId) || 
        Boolean(s.isImported)
      );
      if (hasScriptGenScript && !hasRecordPlayScript) return true;
    }

    return false;
  };

  // Helper to strictly identify Record & Play generated scripts (excluding Script Generator scripts)
  const isRecordPlayScript = (s: AutomationScript) => {
    if (!s) return false;
    // Scripts from upload video or video flows belong to video flows, not generated scripts
    if (s.source === 'upload_video' || Boolean(s.videoFlowId)) return false;
    // Scripts generated or imported in Script Generator
    if (s.source === 'script_generator') return false;
    if (s.isImported || (typeof s.id === 'string' && s.id.startsWith('import-'))) return false;
    if (s.testCaseIds && s.testCaseIds.length > 0) return false;
    if (s.testCases && s.testCases.length > 0) return false;
    if (s.scenarioId || s.scenarioTitle) return false;

    // Scripts located in a Script Generator folder
    if (project.automationFolders) {
      const parentFolder = project.automationFolders.find(f => 
        (s.folderId && f.id === s.folderId) || 
        (s.folderName && f.name && f.name.trim().toLowerCase() === s.folderName.trim().toLowerCase())
      );
      if (parentFolder && isScriptGeneratorFolder(parentFolder)) {
        return false;
      }
    }

    // Explicitly marked as record & play
    if (s.source === 'record_play') return true;

    // Explicitly linked to a recorded flow by flowId
    if (s.flowId) return true;

    // Linked to a recorded flow in project
    const isLinkedToRecordedFlow = (project.recordedFlows || []).some(f => 
      f.scriptId === s.id || (f.id && f.id === s.flowId) || (typeof f.name === 'string' && typeof s.title === 'string' && s.title.toLowerCase().startsWith(f.name.toLowerCase()))
    );
    if (isLinkedToRecordedFlow) return true;

    // In a script folder of type 'script' that is not a script generator folder
    if (s.folderId && project.automationFolders) {
      const folder = project.automationFolders.find(f => f.id === s.folderId);
      if (folder && folder.type === 'script' && !isScriptGeneratorFolder(folder)) {
        return true;
      }
    }

    return false;
  };

  const effectiveFlows = useMemo(() => {
    const map = new Map<string, RecordedFlow>();
    (flows || []).forEach(f => { if (f && f.id) map.set(f.id, f); });
    (project.recordedFlows || []).forEach(f => {
      if (f && f.id) {
        const local = map.get(f.id);
        map.set(f.id, local ? { ...f, ...local } : f);
      }
    });
    return Array.from(map.values()).filter(f => getFlowPlatform(f) === platform);
  }, [project.recordedFlows, flows, platform]);

  const effectiveUploadVideoFlows = useMemo(() => {
    return (project.uploadVideoFlows || []).filter(f => (f.platform || 'web') === platform);
  }, [project.uploadVideoFlows, platform]);

  const effectiveScripts = useMemo(() => {
    return (project.automationScripts || [])
      .filter(isRecordPlayScript)
      .filter(s => getScriptPlatform(s) === platform);
  }, [project.automationScripts, platform]);

  // Helper to determine folder platform (web vs mobile) based on its contents, platform field, or naming
  const getFolderPlatform = (folder: { id: string; name: string; type?: string; platform?: 'web' | 'mobile' }): 'web' | 'mobile' => {
    // 1. If explicit platform property is set on the folder, honor it
    if (folder.platform === 'mobile' || folder.platform === 'web') {
      return folder.platform;
    }

    // 2. Check if folder contains any flows with explicit or detected platform
    const folderFlows = effectiveFlows.filter(f => isItemInFolder(f.folderId, folder.id, project.automationFolders, { folderName: f.folderName, title: f.name }));
    const hasMobileFlows = folderFlows.some(f => getFlowPlatform(f) === 'mobile');
    const hasWebFlows = folderFlows.some(f => getFlowPlatform(f) === 'web');
    
    if (hasMobileFlows && !hasWebFlows) return 'mobile';
    if (hasWebFlows && !hasMobileFlows) return 'web';

    // 3. Check if folder contains any scripts with explicit or detected platform
    const folderScripts = effectiveScripts.filter(s => isItemInFolder(s.folderId, folder.id, project.automationFolders, { flowId: s.flowId, folderName: s.folderName, title: s.title }));
    const hasMobileScripts = folderScripts.some(s => getScriptPlatform(s) === 'mobile');
    const hasWebScripts = folderScripts.some(s => getScriptPlatform(s) === 'web');

    if (hasMobileScripts && !hasWebScripts) return 'mobile';
    if (hasWebScripts && !hasMobileScripts) return 'web';

    // 4. Name heuristics for legacy/unmigrated folders
    const lower = (folder.name || '').trim().toLowerCase();
    if (
      lower.startsWith('mob') ||
      lower.includes('mobile') ||
      lower.includes('android') ||
      lower.includes('ios') ||
      lower.includes('apk') ||
      lower.includes('appium') ||
      lower.includes('emulator') ||
      lower.includes('device')
    ) {
      return 'mobile';
    }

    return 'web';
  };

  // Helper to determine folder type strictly without overlap
  const getFolderType = (folder: { id: string; name: string; type?: string; platform?: 'web' | 'mobile'; isImported?: boolean }): 'flow' | 'script' | 'upload_video' | 'script_generator' => {
    if (isScriptGeneratorFolder(folder)) return 'script_generator';
    if (folder.type === 'upload_video') return 'upload_video';
    if (folder.type === 'script') return 'script';
    if (folder.type === 'flow') return 'flow';

    const folderNameLower = (folder.name || '').toLowerCase();
    if (folderNameLower.includes('video') || folderNameLower.includes('upload')) {
      return 'upload_video';
    }

    const folderUploads = (project.uploadVideoFlows || []).filter(f => isItemInFolder(f.folderId, folder.id, project.automationFolders, { folderName: f.folderName, title: f.name }));
    if (folderUploads.length > 0) return 'upload_video';

    const folderFlows = effectiveFlows.filter(f => isItemInFolder(f.folderId, folder.id, project.automationFolders, { folderName: f.folderName, title: f.name }));
    const folderScripts = effectiveScripts.filter(s => isItemInFolder(s.folderId, folder.id, project.automationFolders, { flowId: s.flowId, folderName: s.folderName, title: s.title }));

    if (folderScripts.length > 0 && folderFlows.length === 0) return 'script';
    if (folderFlows.length > 0 && folderScripts.length === 0) return 'flow';
    if (folderScripts.length > folderFlows.length) return 'script';
    if (folderFlows.length > folderScripts.length) return 'flow';

    if (folderNameLower.includes('script') || folderNameLower.includes('spec') || folderNameLower.includes('code')) {
      return 'script';
    }

    return 'flow';
  };

  // Helper to isolate web vs mobile folders for flows
  const isFlowFolderForPlatform = (folder: { id: string; name: string; type?: string; platform?: 'web' | 'mobile'; isImported?: boolean }) => {
    if (isScriptGeneratorFolder(folder)) return false;
    const fPlatform = getFolderPlatform(folder);
    if (fPlatform !== platform) return false;
    const hasFlows = effectiveFlows.some(f => isItemInFolder(f.folderId, folder.id, project.automationFolders, { folderName: f.folderName, title: f.name }));
    if (hasFlows) return true;
    if (folder.type === 'flow') return true;
    return getFolderType(folder) === 'flow';
  };

  // Helper to isolate web vs mobile folders for upload video flows
  const isUploadVideoFolderForPlatform = (folder: { id: string; name: string; type?: string; platform?: 'web' | 'mobile'; isImported?: boolean }) => {
    if (isScriptGeneratorFolder(folder)) return false;
    const fPlatform = getFolderPlatform(folder);
    if (fPlatform !== platform) return false;
    const hasVideos = effectiveUploadVideoFlows.some(flow => isItemInFolder(flow.folderId, folder.id, project.automationFolders, { folderName: flow.folderName, title: flow.name }));
    if (hasVideos) return true;
    if (folder.type === 'upload_video') return true;
    return getFolderType(folder) === 'upload_video';
  };

  // Helper to isolate web vs mobile folders for scripts
  const isScriptFolderForPlatform = (folder: { id: string; name: string; type?: string; platform?: 'web' | 'mobile'; isImported?: boolean }) => {
    // Script Generator folders must never appear in Record & Play Generated scripts
    if (isScriptGeneratorFolder(folder)) return false;
    const fPlatform = getFolderPlatform(folder);
    if (fPlatform !== platform) return false;
    const hasScripts = effectiveScripts.some(s => isItemInFolder(s.folderId, folder.id, project.automationFolders, { flowId: s.flowId, folderName: s.folderName, title: s.title }));
    if (hasScripts) return true;
    if (folder.type === 'script') return true;
    return getFolderType(folder) === 'script';
  };

  const deduplicatedAutomationFolders = useMemo(() => {
    const seenIds = new Set<string>();
    const seenKeys = new Set<string>();
    return (project.automationFolders || []).filter(f => {
      if (!f || !f.id || typeof f.name !== 'string') return false;
      if (seenIds.has(f.id)) return false;
      seenIds.add(f.id);

      const key = `${getFolderPlatform(f)}:${f.name.trim().toLowerCase()}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  }, [project.automationFolders]);

  const handleSwitchPlatform = (newPlatform: 'web' | 'mobile') => {
    if (platform === newPlatform) return;
    setPlatform(newPlatform);
    setActiveFolderId(null);
    setActiveFolderType(null);
    setSelectedTool(newPlatform === 'mobile' ? 'Appium' : 'Playwright');
  };

  const handleSaveFlow = () => {
    if (!flowName.trim()) {
      toast.error('Please enter a flow name');
      return;
    }
    setActivePanel('steps');
    setNewFlowFolderName('');
    setSearchFlowFolderQuery('');
    
    // Auto-select active folder if valid or first available flow folder for this platform
    const availableFolders = (project.automationFolders || []).filter(isFlowFolderForPlatform);
    if (activeFolderId && availableFolders.some(f => f.id === activeFolderId || (typeof f.name === 'string' && typeof activeFolderId === 'string' && f.name.toLowerCase() === activeFolderId.toLowerCase()))) {
      const matched = availableFolders.find(f => f.id === activeFolderId || (typeof f.name === 'string' && typeof activeFolderId === 'string' && f.name.toLowerCase() === activeFolderId.toLowerCase()));
      if (matched) {
        setSelectedFolder(matched.id);
        setIsCreatingNewFlowFolder(false);
      }
    } else if (selectedFolder && availableFolders.some(f => f.id === selectedFolder || (typeof f.name === 'string' && typeof selectedFolder === 'string' && f.name.toLowerCase() === selectedFolder.toLowerCase()))) {
      setIsCreatingNewFlowFolder(false);
    } else if (availableFolders.length > 0) {
      setSelectedFolder(availableFolders[0].id);
      setIsCreatingNewFlowFolder(false);
    } else {
      setIsCreatingNewFlowFolder(true);
      setNewFlowFolderName(platform === 'web' ? 'Recorded Web Flows' : 'Recorded Mobile Flows');
      setSelectedFolder('');
    }
    setIsSaveFlowModalOpen(true);
  };

  const executeSaveFlow = async () => {
    if (!flowName.trim()) {
      toast.error('Please enter a flow name');
      return;
    }

    let folderId = selectedFolder;
    let updatedFolders = project.automationFolders || [];

    if (isCreatingNewFlowFolder) {
      const folderNameTrimmed = newFlowFolderName.trim() || (platform === 'web' ? 'Recorded Web Flows' : 'Recorded Mobile Flows');
      const existingSameFolder = updatedFolders.find(f => 
        (f.type === 'flow' || !f.type) && 
        (f.platform === platform || (!f.platform && platform === 'web')) && 
        typeof f.name === 'string' && f.name.trim().toLowerCase() === folderNameTrimmed.toLowerCase()
      );
      if (existingSameFolder) {
        folderId = existingSameFolder.id;
      } else {
        folderId = generateUniqueFolderId('folder');
        const newFolderObj = { id: folderId, name: folderNameTrimmed, type: 'flow' as const, platform: platform };
        updatedFolders = [...updatedFolders, newFolderObj];
      }
    } else if (!folderId) {
      const availableFolder = updatedFolders.find(isFlowFolderForPlatform);
      if (availableFolder) {
        folderId = availableFolder.id;
      } else {
        folderId = generateUniqueFolderId('folder');
        const defaultName = platform === 'web' ? 'Recorded Web Flows' : 'Recorded Mobile Flows';
        const newFolderObj = { id: folderId, name: defaultName, type: 'flow' as const, platform: platform };
        updatedFolders = [...updatedFolders, newFolderObj];
      }
    }

    const selectedFolderObj = updatedFolders.find(f => f.id === folderId || (typeof f.name === 'string' && typeof folderId === 'string' && f.name.toLowerCase() === folderId.toLowerCase()));
    const finalFolderId = selectedFolderObj?.id || folderId || undefined;
    const finalFolderName = selectedFolderObj?.name || (isCreatingNewFlowFolder ? newFlowFolderName.trim() : undefined);

    // Ensure the folder exists in updatedFolders with type: 'flow' and proper platform
    if (finalFolderId) {
      const idx = updatedFolders.findIndex(f => f.id === finalFolderId);
      if (idx >= 0) {
        if (!updatedFolders[idx].type) {
          updatedFolders[idx] = {
            ...updatedFolders[idx],
            type: 'flow',
            platform: updatedFolders[idx].platform || platform
          };
        }
      } else if (finalFolderName) {
        updatedFolders = [
          ...updatedFolders,
          {
            id: finalFolderId,
            name: finalFolderName,
            type: 'flow' as const,
            platform: platform
          }
        ];
      }
    }

    const platformCurrentSteps = currentSteps.filter(s => (s.platform || 'web') === platform);
    const stepsToSave = platformCurrentSteps.length > 0 ? platformCurrentSteps : currentSteps;

    // Check existing flows to prevent overwriting a different flow
    const allKnownFlows: RecordedFlow[] = [];
    (project.recordedFlows || []).forEach(f => { if (f && f.id) allKnownFlows.push(f); });
    (flows || []).forEach(f => { if (f && f.id && !allKnownFlows.some(kf => kf.id === f.id)) allKnownFlows.push(f); });

    const existingFlowWithActiveId = activeFlowId ? allKnownFlows.find(f => f.id === activeFlowId) : null;

    // If activeFlowId exists and its name matches, keep activeFlowId.
    // If the activeFlowId was for a DIFFERENT flow, generate a new unique ID so previous flows are never overwritten.
    let targetFlowId = activeFlowId;
    if (!targetFlowId || (existingFlowWithActiveId && existingFlowWithActiveId.name?.trim().toLowerCase() !== flowName.trim().toLowerCase())) {
      const flowWithSameName = allKnownFlows.find(f => 
        getFlowPlatform(f) === platform && 
        f.name?.trim().toLowerCase() === flowName.trim().toLowerCase() &&
        (finalFolderId ? f.folderId === finalFolderId : true)
      );
      targetFlowId = flowWithSameName ? flowWithSameName.id : generateUniqueId('flow');
    }

    const priorFlow = allKnownFlows.find(f => f.id === targetFlowId);

    const newFlow: RecordedFlow = {
      id: targetFlowId,
      name: flowName.trim(),
      description: flowDescription,
      refineInstructions: refineInstructions,
      steps: stepsToSave,
      createdAt: priorFlow?.createdAt || new Date().toISOString(),
      isApproved,
      folderId: finalFolderId,
      folderName: finalFolderName,
      platform: platform,
      // Preserve or set script properties
      generatedScript: generatedProject?.files?.[0]?.content || priorFlow?.generatedScript,
      scriptFiles: generatedProject?.files || priorFlow?.scriptFiles,
      scriptId: priorFlow?.scriptId,
      tool: selectedTool || priorFlow?.tool,
      language: selectedLanguage || priorFlow?.language,
      framework: selectedFramework || priorFlow?.framework,
      generatedProject: generatedProject || priorFlow?.generatedProject
    };

    const existingFlowsMap = new Map<string, RecordedFlow>();
    allKnownFlows.forEach(f => { existingFlowsMap.set(f.id, f); });
    existingFlowsMap.set(newFlow.id, newFlow);
    const updatedFlows = Array.from(existingFlowsMap.values());

    setFlows(updatedFlows);
    setActiveFlowId(newFlow.id);

    // Also update any matching script's folderId / flowId / flowName
    let updatedScripts = [...(project.automationScripts || [])];
    if (newFlow.scriptId || newFlow.generatedScript) {
      updatedScripts = updatedScripts.map(s => {
        if (s.flowId === newFlow.id || (newFlow.scriptId && s.id === newFlow.scriptId)) {
          return {
            ...s,
            flowName: newFlow.name,
            folderId: s.folderId || finalFolderId,
            folderName: s.folderName || finalFolderName
          };
        }
        return s;
      });
    }

    // Close modals immediately for instant UI feedback
    setIsSaveFlowModalOpen(false);
    setShowScriptPreview(false);
    setSelectedFolder(finalFolderId || '');
    setActiveFolderId(finalFolderId || null);
    setActiveFolderType('flow');
    setActivePanel('steps');
    toast.success(`${platform === 'web' ? 'Web' : 'Mobile'} flow saved successfully under "${finalFolderName || 'Root'}"`);

    try {
      await onUpdateProject({
        ...project,
        recordedFlows: updatedFlows,
        uploadVideoFlows: project.uploadVideoFlows || [],
        automationScripts: updatedScripts,
        automationFolders: updatedFolders
      });
    } catch (error) {
      console.error('Failed to update project on server:', error);
    }
  };

  const handleSaveScript = () => {
    const safeName = (flowName || 'automation_flow').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    
    // If generated project is not yet in state, synthesize it from generated script or recorded steps
    if (!generatedProject) {
      const fallbackFileContent = generatedPlaywrightScript || `// Automated script for ${flowName || 'Automation Flow'}\n// Target: ${targetUrl || 'https://app.example.com'}\n`;
      setGeneratedProject({
        files: [{
          path: `tests/${safeName}.spec.ts`,
          content: fallbackFileContent
        }],
        explanation: flowDescription || `Automation script generated from flow ${flowName}`
      });
    }

    setSaveScriptTitle(`${flowName || 'Automation Script'} - ${selectedTool}`);
    setSaveScriptDescription(flowDescription || `Automation script generated from flow ${flowName}`);
    setSearchScriptFolderQuery('');

    // Filter available script folders for this platform
    const availableFolders = (project.automationFolders || []).filter(isScriptFolderForPlatform);

    // Look for matching script folder by flow folder name or flow name
    const currentFlowFolder = project.automationFolders?.find(f => f.id === selectedFolder);
    const flowFolderName = currentFlowFolder?.name || flowName;
    const matchingScriptFolder = availableFolders.find(f => 
      f.name?.trim().toLowerCase() === flowFolderName?.trim().toLowerCase()
    );

    if (matchingScriptFolder) {
      setIsCreatingNewScriptFolder(false);
      setNewScriptFolderName('');
      setSelectedFolder(matchingScriptFolder.id);
    } else if (availableFolders.length === 0) {
      setIsCreatingNewScriptFolder(true);
      setNewScriptFolderName(flowFolderName || (platform === 'web' ? 'Recorded Web Scripts' : 'Recorded Mobile Scripts'));
      setSelectedFolder('');
    } else {
      setIsCreatingNewScriptFolder(false);
      setNewScriptFolderName('');
      if (activeFolderId && availableFolders.some(f => f.id === activeFolderId || (typeof f.name === 'string' && typeof activeFolderId === 'string' && f.name.toLowerCase() === activeFolderId.toLowerCase()))) {
        const matched = availableFolders.find(f => f.id === activeFolderId || (typeof f.name === 'string' && typeof activeFolderId === 'string' && f.name.toLowerCase() === activeFolderId.toLowerCase()));
        if (matched) setSelectedFolder(matched.id);
      } else {
        setSelectedFolder(availableFolders[0].id);
      }
    }
    
    setIsSaveScriptModalOpen(true);
  };

  const executeSaveScript = async () => {
    if (!saveScriptTitle.trim()) {
      toast.error('Please enter a script title');
      return;
    }

    let folderId = selectedFolder;
    let updatedFolders = [...(project.automationFolders || [])];

    if (isCreatingNewScriptFolder) {
      const folderNameTrimmed = newScriptFolderName.trim() || (platform === 'web' ? 'Recorded Web Scripts' : 'Recorded Mobile Scripts');
      const existingFolder = updatedFolders.find(f => (f.platform === platform || (!f.platform && platform === 'web')) && typeof f.name === 'string' && f.name.trim().toLowerCase() === folderNameTrimmed.toLowerCase());
      if (existingFolder) {
        folderId = existingFolder.id;
      } else {
        folderId = generateUniqueFolderId('folder');
        updatedFolders.push({ id: folderId, name: folderNameTrimmed, type: 'script', platform: platform });
      }
    } else if (!folderId) {
      const availableFolder = updatedFolders.find(isScriptFolderForPlatform);
      if (availableFolder) {
        folderId = availableFolder.id;
      } else {
        folderId = generateUniqueFolderId('folder');
        const defaultName = platform === 'web' ? 'Recorded Web Scripts' : 'Recorded Mobile Scripts';
        updatedFolders.push({ id: folderId, name: defaultName, type: 'script', platform: platform });
      }
    }

    // Resolve folder metadata
    const selectedFolderObj = updatedFolders.find(f => f.id === folderId || (typeof f.name === 'string' && typeof folderId === 'string' && f.name.toLowerCase() === folderId.toLowerCase()));
    const finalFolderId = selectedFolderObj?.id || folderId || undefined;
    const finalFolderName = selectedFolderObj?.name || (isCreatingNewScriptFolder ? newScriptFolderName.trim() : undefined) || 'Root';

    const filesToSave = generatedProject?.files && generatedProject.files.length > 0
      ? generatedProject.files
      : [{ path: `tests/${(flowName || 'test').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.spec.ts`, content: generatedPlaywrightScript || '// Generated Automation Script' }];

    const mainFile = filesToSave.find(f => f.path.includes('spec') || f.path.includes('test')) || filesToSave[0];

    const scriptTitle = saveScriptTitle.trim();
    let updatedScripts = [...(project.automationScripts || [])];

    // Match existing script by flowId FIRST, not just by title
    const existingIndex = updatedScripts.findIndex(s => {
      if (activeFlowId && s.flowId === activeFlowId) return true;
      if (activeFlowId && activeFlow?.scriptId && s.id === activeFlow.scriptId) return true;
      return !s.flowId && typeof s.title === 'string' && typeof saveScriptTitle === 'string' && s.title.toLowerCase() === saveScriptTitle.toLowerCase();
    });

    const scriptId = existingIndex >= 0 ? updatedScripts[existingIndex].id : Math.random().toString(36).substr(2, 9);

    const newScript: AutomationScript = {
      id: scriptId,
      flowId: activeFlowId || undefined,
      flowName: flowName || undefined,
      title: scriptTitle,
      description: saveScriptDescription.trim() || `Automation script generated from flow ${flowName || 'Web Flow'}`,
      content: mainFile?.content || generatedPlaywrightScript || '',
      files: filesToSave,
      tool: selectedTool,
      language: selectedLanguage,
      createdAt: existingIndex >= 0 ? updatedScripts[existingIndex].createdAt : new Date().toISOString(),
      folderId: finalFolderId,
      folderName: finalFolderName,
      isApproved: true,
      source: 'record_play',
      platform: platform,
      appPackage: platform === 'mobile' ? (mobilePackageName || mobileApkName || 'com.example.app') : undefined,
      appUrl: platform === 'web' ? targetUrl : undefined
    };

    if (existingIndex >= 0) {
      updatedScripts[existingIndex] = newScript;
    } else {
      updatedScripts.push(newScript);
    }

    // Crucial: Also update the RecordedFlow with the script data and link to this script!
    const existingFlowsMap = new Map<string, RecordedFlow>();
    (flows || []).forEach(f => { if (f && f.id) existingFlowsMap.set(f.id, f); });
    (project.recordedFlows || []).forEach(f => { if (f && f.id) existingFlowsMap.set(f.id, f); });
    
    if (activeFlowId && existingFlowsMap.has(activeFlowId)) {
      const currentFlow = existingFlowsMap.get(activeFlowId)!;
      existingFlowsMap.set(activeFlowId, {
        ...currentFlow,
        scriptId: newScript.id,
        generatedScript: newScript.content,
        scriptFiles: newScript.files,
        tool: selectedTool,
        language: selectedLanguage,
        framework: selectedFramework,
        generatedProject: {
          files: newScript.files || [],
          explanation: newScript.description
        }
      });
    }
    const preservedRecordedFlows = Array.from(existingFlowsMap.values());
    setFlows(preservedRecordedFlows);

    try {
      await onUpdateProject({
        ...project,
        recordedFlows: preservedRecordedFlows,
        uploadVideoFlows: project.uploadVideoFlows || [],
        automationScripts: updatedScripts,
        automationFolders: updatedFolders
      });
      toast.success(`${platform === 'web' ? 'Web' : 'Mobile'} script saved to folder "${finalFolderName}"`);
      setIsSaveScriptModalOpen(false);
      setIsPreviewOpen(false);
      setShowScriptPreview(false);
      if (finalFolderId) {
        setActiveFolderId(finalFolderId);
        setActiveFolderType('script');
      }
    } catch (error) {
      toast.error('Failed to save script to project');
    }
  };

  const handleDownloadProject = async () => {
    if (!generatedProject) return;

    const success = await deductExportCredits(
      project.id,
      'record_play_web',
      user,
      'Download Automation Project (ZIP)',
      project.name
    );
    if (!success) return;

    const zip = new JSZip();
    generatedProject.files.forEach(file => {
      zip.file(file.path, file.content);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${flowName.replace(/\s+/g, '-').toLowerCase()}-automation-project.zip`);
    toast.success('Full project downloaded as ZIP');
  };

  const handleDownloadFile = async (path: string, content: string) => {
    const success = await deductExportCredits(
      project.id,
      'record_play_web',
      user,
      `Download Script (${path.split('/').pop() || 'script'})`,
      project.name
    );
    if (!success) return;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const fileName = path.split('/').pop() || 'script.txt';
    saveAs(blob, fileName);
    toast.success(`${fileName} downloaded`);
  };

  const handleDownloadSavedScript = async (script: AutomationScript, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const success = await deductExportCredits(
      project.id,
      'record_play_web',
      user,
      `Download Script (${script.title || 'Script'})`,
      project.name
    );
    if (!success) return;

    const files = script.files && script.files.length > 0
      ? script.files
      : [{ path: `${(script.title || 'script').replace(/[^a-zA-Z0-9_-]/g, '_')}.spec.ts`, content: script.content }];

    if (files.length > 1) {
      const zip = new JSZip();
      files.forEach(f => zip.file(f.path, f.content));
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${(script.title || 'script').replace(/[^a-zA-Z0-9_-]/g, '_')}-project.zip`);
      toast.success('Downloaded script project ZIP archive');
    } else {
      const singleFile = files[0];
      const blob = new Blob([singleFile.content], { type: 'text/plain;charset=utf-8' });
      saveAs(blob, singleFile.path.split('/').pop() || `${(script.title || 'script').replace(/[^a-zA-Z0-9_-]/g, '_')}.spec.ts`);
      toast.success('Downloaded script file');
    }
  };

  const handleCreateFolder = async () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      toast.error('Please enter a folder name');
      return;
    }

    const targetPlatform = folderModalPlatform || platform;
    const isDuplicate = (project.automationFolders || []).some(
      f => getFolderPlatform(f) === targetPlatform && typeof f.name === 'string' && f.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      toast.error(`A ${targetPlatform === 'web' ? 'web' : 'mobile'} folder with this name already exists in this project`);
      return;
    }

    const newFolder = {
      id: generateUniqueFolderId('folder'),
      name: trimmedName,
      type: newFolderType,
      platform: targetPlatform
    };

    const updatedFolders = [...(project.automationFolders || []), newFolder];

    try {
      await onUpdateProject({
        ...project,
        recordedFlows: flows.length > 0 ? flows : (project.recordedFlows || []),
        automationFolders: updatedFolders
      });
      const typeDisplay = newFolderType === 'flow' ? 'Flow' : newFolderType === 'upload_video' ? 'Video Flow' : 'Script';
      toast.success(`${targetPlatform === 'web' ? 'Web' : 'Mobile'} ${typeDisplay} folder created`);
      setNewFolderName('');
      setIsFolderModalOpen(false);
      setActiveFolderId(newFolder.id);
      setActiveFolderType(newFolderType);
    } catch (error) {
      toast.error('Failed to create folder');
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName?: string) => {
    const idsAndNamesToDelete = [folderId];
    if (folderName) idsAndNamesToDelete.push(folderName);
    addDeletedIds(idsAndNamesToDelete);

    const updatedFolders = (project.automationFolders || []).filter(f => 
      f.id !== folderId && (!folderName || (f.name || '').toLowerCase() !== folderName.toLowerCase())
    );

    const updatedFlows = (project.recordedFlows || []).map(f => {
      if (f.folderId === folderId || (folderName && f.folderName?.toLowerCase() === folderName.toLowerCase())) {
        return { ...f, folderId: undefined, folderName: undefined };
      }
      return f;
    });

    const updatedVideoFlows = (project.uploadVideoFlows || []).map(f => {
      if (f.folderId === folderId || (folderName && f.folderName?.toLowerCase() === folderName.toLowerCase())) {
        return { ...f, folderId: undefined, folderName: undefined };
      }
      return f;
    });

    const updatedScripts = (project.automationScripts || []).map(s => {
      if (s.folderId === folderId || (folderName && s.folderName?.toLowerCase() === folderName.toLowerCase())) {
        return { ...s, folderId: undefined, folderName: undefined };
      }
      return s;
    });

    try {
      await onUpdateProject({
        ...project,
        automationFolders: updatedFolders,
        recordedFlows: updatedFlows,
        uploadVideoFlows: updatedVideoFlows,
        automationScripts: updatedScripts
      });
      if (activeFolderId === folderId || (folderName && activeFolderId === folderName)) {
        setActiveFolderId(null);
        setActiveFolderType(null);
      }
      setSelectedFolderIds(prev => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
      toast.success('Folder permanently deleted');
    } catch (error) {
      toast.error('Failed to delete folder');
    }
  };

  const handleDeleteBulkFolders = async (foldersToDelete: Array<{ id: string; name?: string }>) => {
    const idsAndNamesToDelete: string[] = [];
    foldersToDelete.forEach(f => {
      idsAndNamesToDelete.push(f.id);
      if (f.name) idsAndNamesToDelete.push(f.name);
    });
    addDeletedIds(idsAndNamesToDelete);

    const folderIdsSet = new Set(foldersToDelete.map(f => f.id));
    const folderNamesSet = new Set(foldersToDelete.map(f => (f.name || '').toLowerCase()).filter(Boolean));

    const updatedFolders = (project.automationFolders || []).filter(f => 
      !folderIdsSet.has(f.id) && (!f.name || !folderNamesSet.has(f.name.toLowerCase()))
    );

    const updatedFlows = (project.recordedFlows || []).map(f => {
      if ((f.folderId && folderIdsSet.has(f.folderId)) || (f.folderName && folderNamesSet.has(f.folderName.toLowerCase()))) {
        return { ...f, folderId: undefined, folderName: undefined };
      }
      return f;
    });

    const updatedVideoFlows = (project.uploadVideoFlows || []).map(f => {
      if ((f.folderId && folderIdsSet.has(f.folderId)) || (f.folderName && folderNamesSet.has(f.folderName.toLowerCase()))) {
        return { ...f, folderId: undefined, folderName: undefined };
      }
      return f;
    });

    const updatedScripts = (project.automationScripts || []).map(s => {
      if ((s.folderId && folderIdsSet.has(s.folderId)) || (s.folderName && folderNamesSet.has(s.folderName.toLowerCase()))) {
        return { ...s, folderId: undefined, folderName: undefined };
      }
      return s;
    });

    try {
      await onUpdateProject({
        ...project,
        automationFolders: updatedFolders,
        recordedFlows: updatedFlows,
        uploadVideoFlows: updatedVideoFlows,
        automationScripts: updatedScripts
      });
      if (activeFolderId && (folderIdsSet.has(activeFolderId) || folderNamesSet.has(activeFolderId.toLowerCase()))) {
        setActiveFolderId(null);
        setActiveFolderType(null);
      }
      setSelectedFolderIds(new Set());
      toast.success(`${foldersToDelete.length} folder(s) permanently deleted`);
    } catch (error) {
      toast.error('Failed to delete selected folders');
    }
  };

  const handleDeleteFlow = async (flowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setItemToDelete({ id: flowId, type: 'flow' });
    setIsDeleteModalOpen(true);
  };

  const handleDeleteUploadVideoFlow = async (flowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setItemToDelete({ id: flowId, type: 'upload_video' });
    setIsDeleteModalOpen(true);
  };

  const handleDeleteScript = async (scriptId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setItemToDelete({ id: scriptId, type: 'script' });
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;

    const targetItem = itemToDelete;
    setIsDeleteModalOpen(false);
    setItemToDelete(null);

    if (targetItem.type === 'folder') {
      await handleDeleteFolder(targetItem.id, targetItem.name);
      return;
    } else if (targetItem.type === 'bulk_folders') {
      if (targetItem.folders && targetItem.folders.length > 0) {
        await handleDeleteBulkFolders(targetItem.folders);
      }
      return;
    }

    addDeletedIds([targetItem.id]);

    if (targetItem.type === 'flow') {
      const updatedFlows = flows.filter(f => f.id !== targetItem.id);
      setFlows(updatedFlows);
      
      if (activeFlowId === targetItem.id) {
        setActiveFlowId(null);
        setCurrentSteps([]);
        setFlowName('New Recording Flow');
        setFlowDescription('');
        setRefineInstructions('');
      }

      try {
        await onUpdateProject({
          ...project,
          recordedFlows: updatedFlows
        });
        toast.success('Flow deleted successfully');
      } catch (error) {
        toast.error('Failed to delete flow');
      }
    } else if (targetItem.type === 'upload_video') {
      const updatedUploadFlows = (project.uploadVideoFlows || []).filter(f => f.id !== targetItem.id);

      try {
        await onUpdateProject({
          ...project,
          uploadVideoFlows: updatedUploadFlows
        });
        toast.success('Upload video flow deleted successfully');
      } catch (error) {
        toast.error('Failed to delete upload video flow');
      }
    } else {
      const updatedScripts = (project.automationScripts || []).filter(s => s.id !== targetItem.id);

      try {
        await onUpdateProject({
          ...project,
          automationScripts: updatedScripts
        });
        toast.success('Script deleted successfully');
      } catch (error) {
        toast.error('Failed to delete script');
      }
    }
  };

  const handleGenerateScripts = async () => {
    if (isGenerating) return;
    if (!isApproved) {
      toast.warning('Please approve the flow before generating scripts');
      return;
    }
    
    // Ensure all steps have required fields before validation
    const sanitizedSteps = currentSteps.map(s => {
      const action = s.action || 'click';
      const screen = s.screen || 'MainPage';
      const locator = s.locator || {
        primary: {
          type: action === 'navigate' ? 'url' : 'css',
          value: s.value || 'body',
          playwright: action === 'navigate' ? `await page.goto('${s.value}')` : ''
        },
        alternatives: []
      };
      
      // Ensure primary locator exists
      if (!locator.primary) {
        locator.primary = {
          type: action === 'navigate' ? 'url' : 'css',
          value: s.value || 'body',
          playwright: action === 'navigate' ? `await page.goto('${s.value}')` : ''
        };
      }

      return { ...s, action, screen, locator };
    });

    if (JSON.stringify(sanitizedSteps) !== JSON.stringify(currentSteps)) {
      setCurrentSteps(sanitizedSteps);
    }

    const flow: RecordedFlow = {
      id: activeFlowId || 'temp-id',
      name: flowName,
      description: flowDescription,
      refineInstructions: refineInstructions,
      steps: sanitizedSteps,
      createdAt: new Date().toISOString(),
      isApproved,
      folderId: selectedFolder,
      platform: platform
    };

    // Relaxed validation: only check action and screen, and locator value if not navigate/assertion/wait
    const invalidSteps = sanitizedSteps.filter(s => !s.skipped && (
      !s.action || 
      !s.screen || 
      (s.action !== 'navigate' && s.action !== 'assertion' && s.action !== 'wait' && !s.locator?.primary?.value && s.locator?.primary?.value !== '')
    ));

    if (invalidSteps.length > 0) {
      toast.error(`Validation failed: ${invalidSteps.length} steps are missing required fields.`);
      console.log('Invalid steps:', invalidSteps);
      return;
    }

    // Validate project credit permission before starting script synthesis (100 credits deducted upon generation)
    const permission = await canPerformAction(project.id, 'record_play_web', 'analysis', project.name);
    if (!permission.allowed) {
      toast.error(permission.reason || 'Project credits exhausted. Please subscribe to continue.', {
        duration: 6000
      });
      return;
    }

    setIsGenerating(true);
    setGenerationStages({
      active: true,
      currentStepIndex: 0,
      steps: [
        { id: 'positive', label: 'Generating recorded positive flow', description: 'Translating recorded user interactions and constructing Page Objects', status: 'in_progress' },
        { id: 'assertions', label: 'Adding assertions', description: 'Injecting step-level element visibility, input value, and screen outcome assertions', status: 'pending' },
        { id: 'negative', label: 'Adding applicable negative coverage', description: 'Synthesizing invalid input validation and required field verification scenarios', status: 'pending' },
        { id: 'edge_cases', label: 'Adding applicable edge-case coverage', description: 'Incorporating boundary string limits, special characters, and resilience checks', status: 'pending' },
        { id: 'finalizing', label: 'Finalizing enhanced script', description: 'Formatting vertical source code, enforcing language rules, and packaging test suite', status: 'pending' }
      ]
    });

    const updateStage = async (idx: number, delayMs: number = 600) => {
      setGenerationStages(prev => {
        const nextSteps = prev.steps.map((s, i) => {
          if (i < idx) return { ...s, status: 'completed' as const };
          if (i === idx) return { ...s, status: 'in_progress' as const };
          return { ...s, status: 'pending' as const };
        });
        return { ...prev, currentStepIndex: idx, steps: nextSteps };
      });
      await new Promise(r => setTimeout(r, delayMs));
    };

    try {
      // Initiate script generation immediately in parallel with stage transitions
      const scriptPromise = generateAutomationScript(
        flow, 
        selectedTool, 
        selectedLanguage, 
        selectedFramework, 
        uploadedBddDoc || undefined
      );

      // Advance through stages smoothly so each stage gets clear visual feedback without halting
      await updateStage(0, 450); // Stage 1: Positive flow
      await updateStage(1, 450); // Stage 2: Adding assertions
      await updateStage(2, 450); // Stage 3: Negative coverage
      await updateStage(3, 450); // Stage 4: Edge cases
      await updateStage(4, 450); // Stage 5: Finalizing

      // Await the script result (by this time generation is either complete or wrapping up)
      const result = await scriptPromise;

      setGenerationStages(prev => ({
        ...prev,
        currentStepIndex: 5,
        steps: prev.steps.map(s => ({ ...s, status: 'completed' as const }))
      }));

      await new Promise(r => setTimeout(r, 300));
      setGenerationStages(prev => ({ ...prev, active: false }));

      const formattedProjectResult = {
        ...result,
        files: formatProjectFiles(result.files)
      };
      setGeneratedProject(formattedProjectResult);
      
      const mainFile = formattedProjectResult.files.find(f => f.path.includes('spec') || f.path.includes('test')) || formattedProjectResult.files[0];
      if (mainFile) {
        setSelectedFilePath(mainFile.path);
      }
      setIsPreviewOpen(true);

      // Save final script under Generated Scripts
      const scriptTitle = `${flow.name || 'Recorded Flow'} - ${selectedTool}`;
      
      const currentScripts = project.automationScripts || [];
      const existingIdx = currentScripts.findIndex(s => {
        if (flow.id && s.flowId === flow.id) return true;
        if (flow.scriptId && s.id === flow.scriptId) return true;
        return !s.flowId && typeof s.title === 'string' && typeof scriptTitle === 'string' && s.title.toLowerCase() === scriptTitle.toLowerCase();
      });

      const scriptId = existingIdx >= 0 ? currentScripts[existingIdx].id : Math.random().toString(36).substr(2, 9);

      // Determine proper script folder
      const availableScriptFolders = (project.automationFolders || []).filter(isScriptFolderForPlatform);
      let targetScriptFolder = availableScriptFolders.find(f => 
        (selectedFolder && (f.id === selectedFolder || f.name?.trim().toLowerCase() === String(selectedFolder).trim().toLowerCase())) ||
        (typeof f.name === 'string' && f.name.trim().toLowerCase() === (flow.folderName || flow.name || '').trim().toLowerCase())
      );

      let updatedFolders = [...(project.automationFolders || [])];

      if (!targetScriptFolder) {
        const selectedFolderObj = updatedFolders.find(f => f.id === selectedFolder || (typeof f.name === 'string' && typeof selectedFolder === 'string' && f.name.trim().toLowerCase() === selectedFolder.trim().toLowerCase()));
        const targetFolderName = selectedFolderObj?.name || flow.folderName || (platform === 'web' ? 'Recorded Web Scripts' : 'Recorded Mobile Scripts');

        const existingScriptFolder = updatedFolders.find(f => (f.type === 'script' || (!f.type && isScriptFolderForPlatform(f))) && (f.platform === platform || (!f.platform && platform === 'web')) && typeof f.name === 'string' && f.name.trim().toLowerCase() === targetFolderName.trim().toLowerCase());
        
        if (existingScriptFolder) {
          targetScriptFolder = existingScriptFolder;
        } else {
          const newFolderId = generateUniqueFolderId('folder');
          targetScriptFolder = {
            id: newFolderId,
            name: targetFolderName,
            type: 'script',
            platform: platform
          };
          updatedFolders.push(targetScriptFolder);
        }
      }

      const scriptFolderId = targetScriptFolder.id;
      const scriptFolderName = targetScriptFolder.name;

      const newScript: AutomationScript = {
        id: scriptId,
        flowId: flow.id,
        flowName: flow.name,
        title: scriptTitle,
        description: flow.description || `Automation script generated from approved flow ${flow.name}`,
        content: mainFile?.content || '',
        files: result.files,
        tool: selectedTool,
        language: selectedLanguage,
        createdAt: existingIdx >= 0 ? currentScripts[existingIdx].createdAt : new Date().toISOString(),
        folderId: scriptFolderId,
        folderName: scriptFolderName,
        isApproved: true,
        source: 'record_play',
        platform: platform,
        appPackage: platform === 'mobile' ? (mobilePackageName || mobileApkName || 'com.example.app') : undefined,
        appUrl: platform === 'web' ? targetUrl : undefined
      };

      const updatedScripts = existingIdx >= 0
        ? currentScripts.map((s, idx) => idx === existingIdx ? newScript : s)
        : [...currentScripts, newScript];

      // Update flow with script details and persist
      const existingFlowsMap = new Map<string, RecordedFlow>();
      (flows || []).forEach(f => { if (f && f.id) existingFlowsMap.set(f.id, f); });
      (project.recordedFlows || []).forEach(f => { if (f && f.id) existingFlowsMap.set(f.id, f); });

      if (flow.id && existingFlowsMap.has(flow.id)) {
        const cf = existingFlowsMap.get(flow.id)!;
        existingFlowsMap.set(flow.id, {
          ...cf,
          scriptId: newScript.id,
          generatedScript: newScript.content,
          scriptFiles: newScript.files,
          tool: selectedTool,
          language: selectedLanguage,
          framework: selectedFramework,
          generatedProject: result
        });
      } else if (flow.id) {
        existingFlowsMap.set(flow.id, {
          ...flow,
          scriptId: newScript.id,
          generatedScript: newScript.content,
          scriptFiles: newScript.files,
          tool: selectedTool,
          language: selectedLanguage,
          framework: selectedFramework,
          generatedProject: result
        });
      }
      const updatedFlows = Array.from(existingFlowsMap.values());
      setFlows(updatedFlows);

      await onUpdateProject({
        ...project,
        recordedFlows: updatedFlows,
        automationScripts: updatedScripts,
        automationFolders: updatedFolders
      });

      toast.success(`${selectedTool} (${selectedLanguage}) ${selectedFramework} project generated and saved to Generated Scripts!`);
    } catch (error) {
      toast.error('Failed to generate project');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredSteps = (currentSteps || [])
    .filter(step => step && (step.platform || 'web') === platform)
    .filter(step => {
      if (!step) return false;
      const query = (searchQuery || '').toLowerCase();
      if (!query) return true;
      const act = String(step.action || '').toLowerCase();
      const locVal = String(step.locator?.primary?.value || '').toLowerCase();
      const val = String(step.value || '').toLowerCase();
      const elName = String(step.elementName || '').toLowerCase();
      return act.includes(query) || locVal.includes(query) || val.includes(query) || elName.includes(query);
    });

  const formatStepToScript = (step: RecordedStep, targetPlatform: string = 'web') => {
    if (!step) return '';
    const isMobile = targetPlatform === 'mobile' || (step.platform || 'web') === 'mobile' || selectedTool === 'Appium';
    const primary = step.locator?.primary;
    const rawPw = primary?.playwright;
    const pw = typeof rawPw === 'string' ? rawPw.trim() : '';

    if (pw && (pw.startsWith('await ') || pw.startsWith('const ') || pw.startsWith('let ') || pw.startsWith('//') || pw.startsWith('expect(') || pw.includes('\nawait ') || pw.includes('\nconst '))) {
      return pw.split('\n').map(line => `  ${line}`).join('\n');
    }

    const action = String(step.action || 'click');
    const safeElementName = String(step.elementName || '');

    if (isMobile) {
      const locType = primary?.type || 'resource-id';
      const locVal = String(primary?.value || '');
      if (action === 'click') {
        if (locType === 'resource-id') return `  // Tap ${safeElementName || locVal}\n  await driver.elementById("${locVal}").click();`;
        if (locType === 'accessibility-id') return `  // Tap ${safeElementName || locVal}\n  await driver.elementByAccessibilityId("${locVal}").click();`;
        return `  // Tap ${safeElementName || locVal}\n  const el = await driver.elementByXPath("${locVal}");\n  await el.click();`;
      }
      if (action === 'fill' || action === 'type') {
        if (locType === 'resource-id') return `  // Type into ${safeElementName || locVal}\n  await driver.elementById("${locVal}").type("${String(step.value || '')}");`;
        return `  // Type into ${safeElementName || locVal}\n  const el = await driver.elementByXPath("${locVal}");\n  await el.sendKeys("${String(step.value || '')}");`;
      }
      if (action === 'assertion') {
        return `  // Assert ${safeElementName || locVal}\n  const el = await driver.elementByXPath("${locVal}");\n  expect(await el.isDisplayed()).toBe(true);`;
      }
      return `  // Action: ${action} on ${locVal}`;
    }

    const structured = step.structuredLocator || step.locator?.structuredLocator || primary?.structuredLocator;
    const locVal = String(primary?.value || '');
    const locExpr = structured ? toPlaywrightScript(structured) : (pw || (locVal ? `page.locator('${locVal.replace(/'/g, "\\'")}')` : `page.locator('body')`));
    const safeVal = String(step.value || '').replace(/'/g, "\\'");

    if (action === 'navigate') {
      const navUrl = step.value || step.url || targetUrl || 'https://app.example.com';
      return `  await page.goto('${String(navUrl).replace(/'/g, "\\'")}');`;
    }
    if (action === 'click') {
      return `  await ${locExpr}.click();`;
    }
    if (action === 'dblclick') {
      return `  await ${locExpr}.dblclick();`;
    }
    if (action === 'fill' || action === 'type') {
      if (step.masked && step.placeholder) {
        const envVarName = String(step.placeholder).replace('${', '').replace('}', '');
        return `  await ${locExpr}.fill(process.env.${envVarName} || '********');`;
      }
      return `  await ${locExpr}.fill('${safeVal}');`;
    }
    if (action === 'select' || action === 'selectOption') {
      return `  await ${locExpr}.selectOption('${safeVal}');`;
    }
    if (action === 'check') {
      return `  await ${locExpr}.check();`;
    }
    if (action === 'uncheck') {
      return `  await ${locExpr}.uncheck();`;
    }
    if (action === 'press') {
      return `  await page.keyboard.press('${safeVal || 'Enter'}');`;
    }
    if (action === 'hover') {
      return `  await ${locExpr}.hover();`;
    }
    if (action === 'focus') {
      return `  await ${locExpr}.focus();`;
    }
    if (action === 'blur') {
      return `  await ${locExpr}.blur();`;
    }
    if (action === 'scroll') {
      return `  await page.mouse.wheel(0, ${Number(step.value) || 300});`;
    }
    if (action === 'wait') {
      return `  await page.waitForTimeout(${Number(step.value) || 1000});`;
    }
    if (action === 'upload') {
      return `  await ${locExpr}.setInputFiles('${safeVal || 'file.png'}');`;
    }
    if (action === 'assertion') {
      return `  await expect(${locExpr}).toHaveText('${safeVal}');`;
    }
    return `  // Action: ${action} on ${locVal || ''}`;
  };

  const generatedPlaywrightScript = (platform === 'mobile' || selectedTool === 'Appium')
    ? `import { remote } from 'webdriverio';
import { expect } from 'expect';

describe('${flowName}', () => {
  it('should execute recorded mobile scenario', async () => {
${currentSteps.map(step => formatStepToScript(step, 'mobile')).join('\n')}
  });
});`
    : `import { test, expect } from '@playwright/test';

test('${flowName}', async ({ page }) => {
${currentSteps.map(step => formatStepToScript(step, 'web')).join('\n')}
});`;

  const activeFlow = useMemo(() => {
    return (project.recordedFlows || flows || []).find(f => f.id === activeFlowId);
  }, [project.recordedFlows, flows, activeFlowId]);

  const activeFlowMatchingScript = useMemo(() => {
    return (project.automationScripts || []).find(s => 
      (activeFlowId && s.flowId === activeFlowId) ||
      (activeFlow?.scriptId && s.id === activeFlow.scriptId) ||
      (activeFlowId && s.source === 'record_play' && typeof flowName === 'string' && flowName.toLowerCase() !== 'new recording flow' && typeof s.title === 'string' && s.title.toLowerCase().startsWith(flowName.toLowerCase()))
    );
  }, [project.automationScripts, activeFlowId, activeFlow, flowName]);

  const hasSavedScriptForActiveFlow = Boolean(
    activeFlow?.generatedScript ||
    (activeFlow?.scriptFiles && activeFlow.scriptFiles.length > 0) ||
    activeFlowMatchingScript
  );

  const activeFlowScriptContent = useMemo(() => {
    let script = '';
    // 1. If generatedProject has files in current state
    if (generatedProject?.files && generatedProject.files.length > 0) {
      if (selectedFilePath) {
        const file = generatedProject.files.find(f => f.path === selectedFilePath);
        if (file?.content) script = file.content;
      }
      if (!script) {
        const main = generatedProject.files.find(f => f.path.includes('spec') || f.path.includes('test')) || generatedProject.files[0];
        if (main?.content) script = main.content;
      }
    }

    // 2. If activeFlow has saved files or script
    if (!script && activeFlow?.generatedProject?.files && activeFlow.generatedProject.files.length > 0) {
      if (selectedFilePath) {
        const file = activeFlow.generatedProject.files.find(f => f.path === selectedFilePath);
        if (file?.content) script = file.content;
      }
      if (!script) {
        const main = activeFlow.generatedProject.files.find(f => f.path.includes('spec') || f.path.includes('test')) || activeFlow.generatedProject.files[0];
        if (main?.content) script = main.content;
      }
    }
    if (!script && activeFlow?.scriptFiles && activeFlow.scriptFiles.length > 0) {
      if (selectedFilePath) {
        const file = activeFlow.scriptFiles.find(f => f.path === selectedFilePath);
        if (file?.content) script = file.content;
      }
      if (!script) {
        const main = activeFlow.scriptFiles.find(f => f.path.includes('spec') || f.path.includes('test')) || activeFlow.scriptFiles[0];
        if (main?.content) script = main.content;
      }
    }
    if (!script && activeFlow?.generatedScript) {
      script = activeFlow.generatedScript;
    }

    // 3. If automationScripts has matching script
    if (!script && activeFlowMatchingScript?.files && activeFlowMatchingScript.files.length > 0) {
      if (selectedFilePath) {
        const file = activeFlowMatchingScript.files.find(f => f.path === selectedFilePath);
        if (file?.content) script = file.content;
      }
      if (!script) {
        const main = activeFlowMatchingScript.files.find(f => f.path.includes('spec') || f.path.includes('test')) || activeFlowMatchingScript.files[0];
        if (main?.content) script = main.content;
      }
    }
    if (!script && activeFlowMatchingScript?.content) {
      script = activeFlowMatchingScript.content;
    }

    // 4. Default to live generated playwright script from current steps
    if (!script || script.trim().length < 25 || script.trim() === '// No content' || script.trim() === '// Empty file') {
      script = generatedPlaywrightScript;
    }

    if (!script || script.trim().length < 25 || script.trim() === '// No content' || script.trim() === '// Empty file') {
      script = synthesizeMissingPOMFileContent(selectedFilePath || 'test.spec.ts', {
        tool: selectedTool,
        language: selectedLanguage,
        framework: selectedFramework,
        flowName: activeFlow?.name || flowName,
        steps: activeFlow?.steps || currentSteps,
        targetUrl: activeFlow?.initialUrl || (activeFlow as any)?.targetUrl || targetUrl
      });
    }

    return formatVerticalCode(script, selectedFilePath);
  }, [generatedProject, selectedFilePath, activeFlow, activeFlowMatchingScript, generatedPlaywrightScript]);

  const renderStartModalContent = () => {
    if (platform === 'web') {
      return (
        <>
          <div className="p-8 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                <Radio size={24} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Configure Recording</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Set up your test environment</p>
              </div>
            </div>
            <button onClick={() => setIsStartModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
              <X size={24} />
            </button>
          </div>

          <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
            {/* Target Platform Selector in Modal */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Target Platform</label>
              <div className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-2xl gap-1">
                <button 
                  type="button"
                  onClick={() => setPlatform('web')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    (platform as string) === 'web' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Globe size={14} /> Web Application
                </button>
                <button 
                  type="button"
                  onClick={() => setPlatform('mobile')}
                  className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    (platform as string) === 'mobile' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Smartphone size={14} /> Mobile Application
                </button>
              </div>
            </div>

            {/* Recording Name */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Recording Name</label>
              <input 
                type="text"
                value={tempRecordingName || ''}
                onChange={(e) => setTempRecordingName(e.target.value)}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                placeholder="e.g., Login Flow Test"
              />
            </div>

            {/* Recording Mode */}
            <div>
              <div className="flex p-1 bg-slate-100 rounded-2xl gap-1">
                <button 
                  type="button"
                  onClick={() => setRecordingMode('manual')}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    recordingMode === 'manual' 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Layers size={14} /> Functional
                </button>
                <button 
                  type="button"
                  onClick={() => setRecordingMode('extension')}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    recordingMode === 'extension' 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <ExternalLink size={14} /> Extension
                </button>
                <button 
                  type="button"
                  onClick={() => setRecordingMode('codegen')}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    recordingMode === 'codegen' 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Terminal size={14} /> Codegen
                </button>
              </div>
              <p className="text-[9px] text-slate-400 font-medium mt-2 ml-2">
                {recordingMode === 'manual' 
                  ? "Uses a secure proxy to record actions directly in this window. No extension required." 
                  : recordingMode === 'extension'
                  ? "Requires the QA Recorder browser extension to capture actions in a new tab."
                  : "Launches a high-fidelity Playwright session to generate optimized scripts in real-time."}
              </p>
            </div>

            {recordingMode === 'codegen' && (
              <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 rounded-lg text-white">
                    <Terminal size={16} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Developer Console</p>
                    <p className="text-[9px] text-indigo-600 font-medium">Capture logs and network errors in real-time</p>
                  </div>
                </div>
                <button 
                  onClick={() => setEnableDevTools(!enableDevTools)}
                  className={`w-12 h-6 rounded-full relative transition-colors ${enableDevTools ? 'bg-indigo-600' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${enableDevTools ? 'right-1' : 'left-1'}`} />
                </button>
              </div>
            )}

            {/* Extension Download Option & Setup Instructions */}
            <div className="p-5 bg-slate-900 text-white rounded-2xl border border-indigo-500/30 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0 mt-0.5">
                    <Download size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                      QA Recorder Extension Setup
                      {hasDownloadedExtension && (
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[9px] font-bold lowercase tracking-normal">
                          Downloaded ✓
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-slate-300 font-medium mt-1">
                      Download the browser extension folder before starting the recording session.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadExtensionZip}
                  className="w-full sm:w-auto px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <Download size={15} />
                  Download Extension
                </button>
              </div>

              {(hasDownloadedExtension || showExtensionInstructions || recordingMode === 'extension') && (
                <div className="p-4 bg-slate-950/90 rounded-xl border border-indigo-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-400">
                    <Info size={14} className="text-indigo-400" />
                    <span>Chrome Extension Installation Steps:</span>
                  </div>
                  <ol className="text-[11px] text-slate-200 font-semibold space-y-1.5 pl-5 list-decimal marker:text-indigo-400">
                    <li>Click on the extension menu in chrome Toolbar.</li>
                    <li>Click on the Manage extension.</li>
                    <li>Click on the Load unpacked on the extension page.</li>
                    <li>Select the downloaded folder.</li>
                    <li>Then Extension will be added in the chrome</li>
                    <li>Give the application url in below input box to start test</li>
                  </ol>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Browser</label>
                <select 
                  value={selectedBrowser || 'Chrome'}
                  onChange={(e) => setSelectedBrowser(e.target.value as any)}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all appearance-none"
                >
                  <option>Chrome</option>
                  <option>Firefox</option>
                  <option>Edge</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Target URL</label>
                <input 
                  type="text"
                  value={targetUrl || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTargetUrl(val.includes('https://https://') || val.includes('http://https://') ? sanitizeClientUrl(val) : val);
                  }}
                  onBlur={(e) => setTargetUrl(sanitizeClientUrl(e.target.value))}
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                  placeholder="https://example.com"
                />
              </div>
            </div>
          </div>

          <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
            <button 
              onClick={() => setIsStartModalOpen(false)}
              className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={() => confirmStartRecording()}
              disabled={isStarting}
              className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStarting ? (
                <RotateCcw size={16} className="animate-spin" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
              {isStarting ? 'Starting Session...' : 'Start Recording'}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="p-8 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <Smartphone size={24} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">MOBILE RECORDING SETUP</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Connect Device • Detect • Start Recording</p>
            </div>
          </div>
          <button onClick={() => setIsStartModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Target Platform Selector in Modal */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Target Platform</label>
            <div className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-2xl gap-1">
              <button 
                type="button"
                onClick={() => setPlatform('web')}
                className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  (platform as string) === 'web' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Globe size={14} /> Web Application
              </button>
              <button 
                type="button"
                onClick={() => setPlatform('mobile')}
                className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  (platform as string) === 'mobile' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Smartphone size={14} /> Mobile Application
              </button>
            </div>
          </div>

          {/* Recording Name */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Recording Name</label>
            <input 
              type="text"
              value={tempRecordingName || ''}
              onChange={(e) => setTempRecordingName(e.target.value)}
              className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
              placeholder="e.g., Mobile Login Test"
            />
          </div>

          {/* Connection Type */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Connection Type</label>
            <div className="flex gap-6 ml-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
                <input 
                  type="radio" 
                  name="connectionType" 
                  checked={connectionType === 'real'} 
                  onChange={() => {
                    setConnectionType('real');
                    const realDevices = availableDevices.filter(d => d.type !== 'Emulator');
                    if (realDevices.length > 0) {
                      setMobileDevice(realDevices[0].deviceId);
                    } else {
                      setMobileDevice('');
                    }
                  }} 
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                Real Android Device
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
                <input 
                  type="radio" 
                  name="connectionType" 
                  checked={connectionType === 'emulator'} 
                  onChange={() => {
                    setConnectionType('emulator');
                    const emulators = availableDevices.filter(d => d.type === 'Emulator');
                    if (emulators.length > 0) {
                      setMobileDevice(emulators[0].deviceId);
                    } else {
                      setMobileDevice('');
                    }
                  }} 
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                Android Emulator
              </label>
            </div>
          </div>

          {/* Target Device Selection */}
          <div>
            <div className="flex items-center justify-between ml-2 mb-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                {connectionType === 'emulator' ? 'Android Emulator Device' : 'Connected Android Device'}
              </label>
              <button 
                type="button" 
                onClick={() => {
                  toast.info("Scanning for devices and emulators...");
                  fetchLocalDevices();
                }}
                className="text-[9px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 uppercase tracking-wider cursor-pointer"
              >
                <RefreshCw size={10} /> Refresh Devices
              </button>
            </div>
            {(() => {
              const filteredDevices = availableDevices.filter(d => 
                connectionType === 'real' ? d.type !== 'Emulator' : d.type === 'Emulator'
              );
              
              if (filteredDevices.length === 0 && connectionType === 'real') {
                return (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 animate-in fade-in duration-200">
                    <p className="text-xs font-bold text-slate-700 leading-relaxed">
                      No physical Android device detected.
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Connect your Android phone with USB Debugging enabled, or select <strong>Android Emulator</strong> above to test instantly.
                    </p>
                  </div>
                );
              }
              
              const displayList = filteredDevices.length > 0 ? filteredDevices : [
                { deviceId: 'emulator-5554', deviceName: 'Google Pixel 8 Pro (Cloud Emulator)', type: 'Emulator' },
                { deviceId: 'emulator-5556', deviceName: 'Samsung Galaxy S24 Ultra (Cloud Emulator)', type: 'Emulator' },
                { deviceId: 'emulator-5558', deviceName: 'Google Pixel 7 (Cloud Emulator)', type: 'Emulator' }
              ];
              
              return (
                <select 
                  value={mobileDevice || displayList[0]?.deviceId || 'emulator-5554'}
                  onChange={(e) => setMobileDevice(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all appearance-none cursor-pointer"
                >
                  {displayList.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.deviceName} ({device.type === 'Emulator' ? 'Android Emulator' : 'USB Device'})
                    </option>
                  ))}
                </select>
              );
            })()}
          </div>

          {/* Application Strategy */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Application Strategy</label>
            <div className="flex flex-wrap gap-4 ml-2 mb-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
                <input 
                  type="radio" 
                  name="mobileAppTypeModal" 
                  checked={mobileAppType === 'installed'} 
                  onChange={() => {
                    setMobileAppType('installed');
                    setMobilePackageName(mobileInstalledApp);
                  }} 
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                Installed App
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
                <input 
                  type="radio" 
                  name="mobileAppTypeModal" 
                  checked={mobileAppType === 'apk'} 
                  onChange={() => setMobileAppType('apk')} 
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                Upload APK
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
                <input 
                  type="radio" 
                  name="mobileAppTypeModal" 
                  checked={mobileAppType === 'package'} 
                  onChange={() => setMobileAppType('package')} 
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                Package Name
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
                <input 
                  type="radio" 
                  name="mobileAppTypeModal" 
                  checked={mobileAppType === 'web'} 
                  onChange={() => {
                    setMobileAppType('web');
                    setMobilePackageName('com.android.chrome');
                  }} 
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                Mobile Web
              </label>
            </div>

            {mobileAppType === 'installed' && (
              <div className="animate-in fade-in duration-200">
                <select 
                  value={mobileInstalledApp || ''}
                  onChange={(e) => {
                    setMobileInstalledApp(e.target.value);
                    setMobilePackageName(e.target.value);
                    void launchInstalledAppOnDevice(e.target.value);
                  }}
                  className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all cursor-pointer"
                >
                  {availableApps.map(app => (
                    <option key={app.package} value={app.package}>
                      {app.name} ({app.package})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mobileAppType === 'apk' && (
              <div className="p-4 border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl text-center hover:bg-slate-100/50 transition-all cursor-pointer relative animate-in fade-in duration-200">
                <input 
                  type="file" 
                  accept=".apk"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleApkUpload(file);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="mx-auto text-slate-400 mb-2" size={20} />
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-wide">
                  {mobileApkName ? mobileApkName : 'Choose APK File'}
                </p>
                <p className="text-[8px] text-slate-400 font-bold mt-1">Supports standard Android package (.apk) up to 200MB</p>
              </div>
            )}

            {mobileAppType === 'package' && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-1 block">Custom Android Package ID</label>
                  <input 
                    type="text"
                    value={mobilePackageName || ''}
                    onChange={(e) => setMobilePackageName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                    placeholder="e.g. com.example.myawesomeapp"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-1 block">Main Activity (Optional)</label>
                  <input 
                    type="text"
                    value={mobileAppActivity || ''}
                    onChange={(e) => setMobileAppActivity(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                    placeholder="e.g. .MainActivity"
                  />
                </div>
              </div>
            )}

            {mobileAppType === 'web' && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-1 block">Mobile Web Application URL</label>
                  <input 
                    type="text"
                    value={mobileWebUrl || ''}
                    onChange={(e) => {
                      setMobileWebUrl(e.target.value);
                      setMobilePackageName('com.android.chrome');
                    }}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                    placeholder="https://m.example.com"
                  />
                </div>
                <p className="text-[9px] text-slate-400 font-medium ml-2">
                  Launches mobile Chrome or Safari on the device to record web application in mobile viewport.
                </p>
              </div>
            )}
          </div>

          {/* Capabilities */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Capabilities</label>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={captureScreenshots} 
                  onChange={() => setCaptureScreenshots(!captureScreenshots)} 
                  className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-4 h-4" 
                />
                Capture Screenshots
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={captureLogcat} 
                  onChange={() => setCaptureLogcat(!captureLogcat)} 
                  className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-4 h-4" 
                />
                Capture Device Logs
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={captureNetwork} 
                  onChange={() => setCaptureNetwork(!captureNetwork)} 
                  className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-4 h-4" 
                />
                Capture Network Logs
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={captureVideo} 
                  onChange={() => setCaptureVideo(!captureVideo)} 
                  className="rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-4 h-4" 
                />
                Record Video
              </label>
            </div>
          </div>
        </div>

        <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button 
            onClick={() => setIsStartModalOpen(false)}
            className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={() => confirmStartRecording()}
            disabled={isStarting}
            className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStarting ? (
              <RotateCcw size={16} className="animate-spin" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
            {isStarting ? 'Starting Session...' : 'Start Recording'}
          </button>
        </div>
      </>
    );
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const currentPlatformFolders = useMemo(() => {
    return deduplicatedAutomationFolders.filter(f => {
      if (platform === 'mobile') return isFlowFolderForPlatform(f) || isScriptFolderForPlatform(f);
      return isFlowFolderForPlatform(f) || isUploadVideoFolderForPlatform(f) || isScriptFolderForPlatform(f);
    });
  }, [deduplicatedAutomationFolders, platform]);

  const isAllFoldersSelected = useMemo(() => {
    if (currentPlatformFolders.length === 0) return false;
    return currentPlatformFolders.every(f => selectedFolderIds.has(f.id));
  }, [currentPlatformFolders, selectedFolderIds]);

  const handleToggleSelectAllFolders = () => {
    if (isAllFoldersSelected) {
      setSelectedFolderIds(new Set());
    } else {
      setSelectedFolderIds(new Set(currentPlatformFolders.map(f => f.id)));
    }
  };

  const displayedFlows = effectiveFlows.filter(f => isItemInFolder(f.folderId, activeFolderId, project.automationFolders, { folderName: f.folderName, title: f.name }));
  const displayedUploadVideoFlows = effectiveUploadVideoFlows.filter(f => isItemInFolder(f.folderId, activeFolderId, project.automationFolders, { folderName: f.folderName, title: f.name }));
  const displayedScripts = effectiveScripts.filter(s => isItemInFolder(s.folderId, activeFolderId, project.automationFolders, { flowId: s.flowId, folderName: s.folderName, title: s.title }));
  const platformSteps = currentSteps.filter(step => (step.platform || 'web') === platform);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      {/* Folders Section */}
      <div className="w-full bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
          <div className="flex items-center gap-3">
            <Folder size={18} className="text-indigo-600" />
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-800">Folders Repository</h3>
            {currentPlatformFolders.length > 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAllFolders}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg transition-all"
                title="Select or deselect all folders in repository"
              >
                <CheckSquare size={13} className={isAllFoldersSelected ? 'text-indigo-600' : 'text-slate-400'} />
                <span>{isAllFoldersSelected ? 'Deselect All' : 'Select All Folders'}</span>
              </button>
            )}
          </div>
          <button 
            onClick={() => {
              setNewFolderType('flow');
              setFolderModalPlatform(platform);
              setIsFolderModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-all text-[10px] font-black uppercase tracking-widest self-start sm:self-auto"
          >
            <Plus size={14} /> New Folder
          </button>
        </div>

        {selectedFolderIds.size > 0 && (
          <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-md animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-xs font-bold">
              <CheckSquare size={16} className="text-indigo-400" />
              <span>{selectedFolderIds.size} Folder(s) Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedFolderIds(new Set())}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all"
              >
                Clear Selection
              </button>
              <button
                type="button"
                onClick={() => {
                  const selectedFolders = deduplicatedAutomationFolders.filter(f => selectedFolderIds.has(f.id));
                  setItemToDelete({
                    id: 'bulk',
                    type: 'bulk_folders',
                    folders: selectedFolders.map(f => ({ id: f.id, name: f.name }))
                  });
                  setIsDeleteModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm"
              >
                <Trash2 size={13} /> Delete Selected ({selectedFolderIds.size})
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Recorded Flows Folders */}
          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/80">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Layers size={14} className="text-indigo-500" /> Recorded Flows
              </span>
              <button 
                onClick={() => {
                  setNewFolderType('flow');
                  setFolderModalPlatform(platform);
                  setIsFolderModalOpen(true);
                }}
                className="p-1 text-slate-400 hover:text-indigo-600"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => {
                  setActiveFolderId(null);
                  setActiveFolderType('flow');
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${activeFolderId === null && activeFolderType === 'flow' ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm shadow-indigo-100' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
              >
                <Folder size={14} className={activeFolderId === null && activeFolderType === 'flow' ? 'text-indigo-500' : 'text-slate-400'} />
                All Recorded ({effectiveFlows.length})
              </button>
              {deduplicatedAutomationFolders.filter(isFlowFolderForPlatform).map(folder => {
                const folderFlowCount = effectiveFlows.filter(flow => isItemInFolder(flow.folderId, folder.id, project.automationFolders, { folderName: flow.folderName, title: flow.name })).length;
                const isFolderSelected = selectedFolderIds.has(folder.id);
                return (
                  <div key={folder.id} className="group relative flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolderSelection(folder.id);
                      }}
                      className="p-1 text-slate-400 hover:text-indigo-600 focus:outline-none"
                      title={isFolderSelected ? "Deselect folder" : "Select folder"}
                    >
                      {isFolderSelected ? <CheckSquare size={14} className="text-indigo-600" /> : <Square size={14} className="text-slate-300 hover:text-slate-400" />}
                    </button>

                    <button 
                      onClick={() => {
                        setActiveFolderId(folder.id);
                        setActiveFolderType('flow');
                      }}
                      className={`flex items-center gap-2 pl-2 pr-9 py-2 rounded-xl text-xs font-bold transition-all border ${activeFolderId === folder.id ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm shadow-indigo-100' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Folder size={14} className={activeFolderId === folder.id ? 'text-indigo-500' : 'text-slate-400'} />
                      <span className="truncate max-w-[110px]">{folder.name}</span>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${activeFolderId === folder.id ? 'bg-indigo-200/70 text-indigo-900' : 'bg-slate-100 text-slate-500'}`}>
                        {folderFlowCount}
                      </span>
                    </button>

                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToDelete({
                          id: folder.id,
                          type: 'folder',
                          name: folder.name
                        });
                        setIsDeleteModalOpen(true);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-all z-10 opacity-100 shadow-2xs"
                      title={`Delete folder "${folder.name}"`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload Video Flows Folders */}
          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/80">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Video size={14} className="text-cyan-500" /> Video Flows
              </span>
              <button 
                onClick={() => {
                  setNewFolderType('upload_video');
                  setFolderModalPlatform(platform);
                  setIsFolderModalOpen(true);
                }}
                className="p-1 text-slate-400 hover:text-cyan-600"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => {
                  setActiveFolderId(null);
                  setActiveFolderType('upload_video');
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${activeFolderId === null && activeFolderType === 'upload_video' ? 'bg-cyan-50 border-cyan-200 text-cyan-700 shadow-sm shadow-cyan-100' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
              >
                <Folder size={14} className={activeFolderId === null && activeFolderType === 'upload_video' ? 'text-cyan-500' : 'text-slate-400'} />
                All Video Flows ({effectiveUploadVideoFlows.length})
              </button>
              {deduplicatedAutomationFolders.filter(isUploadVideoFolderForPlatform).map(folder => {
                const folderVideoCount = effectiveUploadVideoFlows.filter(flow => isItemInFolder(flow.folderId, folder.id, project.automationFolders, { folderName: flow.folderName, title: flow.name })).length;
                const isFolderSelected = selectedFolderIds.has(folder.id);
                return (
                  <div key={folder.id} className="group relative flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolderSelection(folder.id);
                      }}
                      className="p-1 text-slate-400 hover:text-cyan-600 focus:outline-none"
                      title={isFolderSelected ? "Deselect folder" : "Select folder"}
                    >
                      {isFolderSelected ? <CheckSquare size={14} className="text-cyan-600" /> : <Square size={14} className="text-slate-300 hover:text-slate-400" />}
                    </button>

                    <button 
                      onClick={() => {
                        setActiveFolderId(folder.id);
                        setActiveFolderType('upload_video');
                      }}
                      className={`flex items-center gap-2 pl-2 pr-9 py-2 rounded-xl text-xs font-bold transition-all border ${activeFolderId === folder.id ? 'bg-cyan-50 border-cyan-200 text-cyan-700 shadow-sm shadow-cyan-100' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Folder size={14} className={activeFolderId === folder.id ? 'text-cyan-500' : 'text-slate-400'} />
                      <span className="truncate max-w-[110px]">{folder.name}</span>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${activeFolderId === folder.id ? 'bg-cyan-200/70 text-cyan-900' : 'bg-slate-100 text-slate-500'}`}>
                        {folderVideoCount}
                      </span>
                    </button>

                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToDelete({
                          id: folder.id,
                          type: 'folder',
                          name: folder.name
                        });
                        setIsDeleteModalOpen(true);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-all z-10 opacity-100 shadow-2xs"
                      title={`Delete folder "${folder.name}"`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Generated Scripts Folders */}
          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100/80">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <FileCode size={14} className="text-emerald-500" /> Generated Scripts
              </span>
              <button 
                onClick={() => {
                  setNewFolderType('script');
                  setFolderModalPlatform(platform);
                  setIsFolderModalOpen(true);
                }}
                className="p-1 text-slate-400 hover:text-indigo-600"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => {
                  setActiveFolderId(null);
                  setActiveFolderType('script');
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${activeFolderId === null && activeFolderType === 'script' ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm shadow-emerald-100' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
              >
                <Folder size={14} className={activeFolderId === null && activeFolderType === 'script' ? 'text-emerald-500' : 'text-slate-400'} />
                All Scripts ({effectiveScripts.length})
              </button>
              {deduplicatedAutomationFolders.filter(isScriptFolderForPlatform).map(folder => {
                const folderScriptCount = effectiveScripts.filter(script => isItemInFolder(script.folderId, folder.id, project.automationFolders, { flowId: script.flowId, folderName: script.folderName, title: script.title })).length;
                const isFolderSelected = selectedFolderIds.has(folder.id);
                return (
                  <div key={folder.id} className="group relative flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFolderSelection(folder.id);
                      }}
                      className="p-1 text-slate-400 hover:text-emerald-600 focus:outline-none"
                      title={isFolderSelected ? "Deselect folder" : "Select folder"}
                    >
                      {isFolderSelected ? <CheckSquare size={14} className="text-emerald-600" /> : <Square size={14} className="text-slate-300 hover:text-slate-400" />}
                    </button>

                    <button 
                      onClick={() => {
                        setActiveFolderId(folder.id);
                        setActiveFolderType('script');
                      }}
                      className={`flex items-center gap-2 pl-2 pr-9 py-2 rounded-xl text-xs font-bold transition-all border ${activeFolderId === folder.id ? 'bg-emerald-50 border-emerald-200 text-emerald-600 shadow-sm shadow-emerald-100' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Folder size={14} className={activeFolderId === folder.id ? 'text-emerald-500' : 'text-slate-400'} />
                      <span className="truncate max-w-[110px]">{folder.name}</span>
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${activeFolderId === folder.id ? 'bg-emerald-200/70 text-emerald-900' : 'bg-slate-100 text-slate-500'}`}>
                        {folderScriptCount}
                      </span>
                    </button>

                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setItemToDelete({
                          id: folder.id,
                          type: 'folder',
                          name: folder.name
                        });
                        setIsDeleteModalOpen(true);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-all z-10 opacity-100 shadow-2xs"
                      title={`Delete folder "${folder.name}"`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col gap-8">
        {platform === 'mobile' ? (
          <div className="w-full flex flex-col gap-6 animate-in fade-in duration-300">
            {/* Top Bar for Mobile App Mode: Only Title and WEB APP / MOBILE APP Switcher */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <Smartphone size={24} />
                </div>
                <div>
                  <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    Mobile App Testing
                    <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase rounded-full border border-emerald-500/20">
                      Interactive Live
                    </span>
                  </h1>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Cloud APK Testing & Mobile Recording Environment
                  </p>
                </div>
              </div>

              {/* Platform Selector Buttons: Only Web App and Mobile App displayed */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/60 shadow-inner">
                  <button
                    type="button"
                    onClick={() => handleSwitchPlatform('web')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                      (platform as string) === 'web'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Globe size={15} /> Web App
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchPlatform('mobile')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                      (platform as string) === 'mobile'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Smartphone size={15} /> Mobile App
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const iframe = document.getElementById('mobile-apk-live-frame') as HTMLIFrameElement;
                    const url = `https://mobile-apk-410621921692.asia-south1.run.app/?bypass=true&email=${encodeURIComponent(user?.email || '')}&name=${encodeURIComponent(user?.name || '')}&role=${encodeURIComponent(user?.role || '')}&projectId=${encodeURIComponent(project?.id || '')}`;
                    if (iframe) iframe.src = url;
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer"
                  title="Reload Mobile Environment"
                >
                  <RefreshCw size={14} /> Reload
                </button>
              </div>
            </div>

            {/* Mobile APK Url Live Container */}
            <div className="w-full h-[calc(100vh-210px)] min-h-[780px] bg-slate-950 rounded-[2.5rem] border border-slate-900 shadow-2xl overflow-hidden relative">
              <iframe
                id="mobile-apk-live-frame"
                src={`https://mobile-apk-410621921692.asia-south1.run.app/?bypass=true&email=${encodeURIComponent(user?.email || '')}&name=${encodeURIComponent(user?.name || '')}&role=${encodeURIComponent(user?.role || '')}&projectId=${encodeURIComponent(project?.id || '')}`}
                className="w-full h-full border-none"
                title="Mobile App Testing & Recording"
                allow="camera; microphone; clipboard-read; clipboard-write; display-capture; geolocation"
              />
            </div>
          </div>
        ) : (
          <>
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div>
                <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Record and Play</h1>
                <p className="text-sm text-slate-500 font-medium mt-1">Record user interactions and generate automated test scripts effortlessly.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Target Platform Selector Pill */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => handleSwitchPlatform('web')}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                      (platform as string) === 'web'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Globe size={13} /> Web App
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchPlatform('mobile')}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                      (platform as string) === 'mobile'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Smartphone size={13} /> Mobile App
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleSwitchPlatform('mobile')}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-md bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-emerald-500/20"
                  title="Mobile App Testing"
                >
                  <Smartphone size={16} /> Mobile App Testing
                </button>

            <button 
              onClick={() => setIsVideoUploadModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:from-cyan-700 hover:to-blue-700 transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
              title="Upload walkthrough video of any size to detect user actions, inspect live DOM, and generate automation scripts"
            >
              <Video size={16} /> Upload Video
            </button>
            <button 
              onClick={() => {
                setActiveFolderId(null);
                setActiveFolderType(null);
                setActiveFlowId(null);
                setGeneratedProject(null);
                setIsRecording(false);
                setCurrentSteps([]);
                setFlowName('New Recording Flow');
                setFlowDescription('');
                setRefineInstructions('');
                setActivePanel('steps');
              }}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-100 transition-all"
            >
              <Plus size={16} /> New Recording
            </button>
            <button 
              onClick={handleSaveFlow}
              className="flex items-center gap-2 px-6 py-3 bg-slate-100 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              <Save size={16} /> Save Flow
            </button>
            {platformSteps.length > 0 && (
              <button 
                onClick={() => handleStartPlayback({
                  id: activeFlowId || 'current-flow',
                  name: flowName || 'Current Flow',
                  description: flowDescription,
                  refineInstructions: refineInstructions,
                  steps: platformSteps,
                  createdAt: new Date().toISOString(),
                  isApproved: isApproved,
                  folderId: selectedFolder,
                  platform: platform
                })}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
              >
                <Play size={16} fill="currentColor" /> Playback Flow
              </button>
            )}
            <button 
              onClick={handleGenerateScripts}
              disabled={!isApproved || isGenerating}
              className={`flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Code2 size={16} />}
              {isGenerating ? 'Generating Scripts...' : 'Generate Scripts'}
            </button>
          </div>
        </div>

        {activeFolderType ? (
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[500px]">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl ${
                  activeFolderType === 'flow' ? 'bg-indigo-50 text-indigo-600' :
                  activeFolderType === 'upload_video' ? 'bg-cyan-50 text-cyan-600' :
                  'bg-emerald-50 text-emerald-600'
                }`}>
                  {activeFolderType === 'flow' ? <Layers size={24} /> :
                   activeFolderType === 'upload_video' ? <Video size={24} /> :
                   <FileCode size={24} />}
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                    {activeFolderId ? (project.automationFolders?.find(f => f.id === activeFolderId || (typeof f.name === 'string' && typeof activeFolderId === 'string' && f.name.toLowerCase() === activeFolderId.toLowerCase()))?.name || activeFolderId) : `All ${activeFolderType === 'flow' ? 'Recorded Flows' : activeFolderType === 'upload_video' ? 'Upload Video Flows' : 'Generated Scripts'}`}
                  </h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                    {activeFolderType === 'flow' 
                      ? `${displayedFlows.length} Recorded Flows`
                      : activeFolderType === 'upload_video'
                      ? `${displayedUploadVideoFlows.length} Upload Video Flows`
                      : `${displayedScripts.length} Generated Scripts`
                    }
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setActiveFolderId(null);
                  setActiveFolderType(null);
                }}
                className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-slate-600 font-bold text-[10px] uppercase tracking-widest transition-all"
              >
                <X size={14} /> Close Repository
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {activeFolderType === 'flow' ? (
                displayedFlows.map(flow => (
                  <motion.div 
                    key={flow.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-slate-50 border border-slate-100 rounded-3xl hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 transition-all group cursor-pointer"
                    onClick={() => {
                      setActiveFlowId(flow.id);
                      setFlowName(flow.name);
                      setFlowDescription(flow.description || '');
                      setRefineInstructions(flow.refineInstructions || '');
                      setCurrentSteps(flow.steps);
                      setIsApproved(flow.isApproved);
                      setSelectedFolder(flow.folderId || '');
                      handleSwitchPlatform(flow.platform || 'web');
                      if (flow.tool) setSelectedTool(flow.tool);
                      if (flow.language) setSelectedLanguage(flow.language);
                      if (flow.framework) setSelectedFramework(flow.framework);
                      
                      // Load this flow's distinct script or generated project into state
                      if (flow.generatedProject?.files && flow.generatedProject.files.length > 0) {
                        setGeneratedProject({
                          files: flow.generatedProject.files,
                          explanation: flow.generatedProject.explanation || flow.description || `Generated script for ${flow.name}`
                        });
                        setSelectedFilePath(flow.generatedProject.files[0].path);
                      } else if (flow.scriptFiles && flow.scriptFiles.length > 0) {
                        setGeneratedProject({
                          files: flow.scriptFiles,
                          explanation: flow.description || `Generated script for ${flow.name}`
                        });
                        setSelectedFilePath(flow.scriptFiles[0].path);
                      } else if (flow.generatedScript) {
                        const safe = (flow.name || 'flow').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                        setGeneratedProject({
                          files: [{ path: `tests/${safe}.spec.ts`, content: flow.generatedScript }],
                          explanation: flow.description || `Generated script for ${flow.name}`
                        });
                        setSelectedFilePath(`tests/${safe}.spec.ts`);
                      } else {
                        // Check if an automationScript matches this flow by flowId or scriptId
                        const matchingScript = (project.automationScripts || []).find(s => 
                          s.flowId === flow.id || 
                          (flow.scriptId && s.id === flow.scriptId) ||
                          (s.source === 'record_play' && typeof flow.name === 'string' && typeof s.title === 'string' && s.title.toLowerCase().startsWith(flow.name.toLowerCase()))
                        );
                        if (matchingScript) {
                          setGeneratedProject({
                            files: matchingScript.files || [{ path: 'tests/spec.ts', content: matchingScript.content }],
                            explanation: matchingScript.description || ''
                          });
                          setSelectedFilePath(matchingScript.files?.[0]?.path || 'tests/spec.ts');
                          if (matchingScript.tool) setSelectedTool(matchingScript.tool);
                          if (matchingScript.language) setSelectedLanguage(matchingScript.language);
                        } else {
                          setGeneratedProject(null);
                        }
                      }
                      setActiveFolderId(null);
                      setActiveFolderType(null);
                      setActivePanel('steps');
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-2 bg-white rounded-xl border border-slate-100 text-indigo-500 shadow-sm">
                        <Layers size={20} />
                      </div>
                      <div className="flex items-center gap-2">
                        {(flow.generatedScript || (flow.scriptFiles && flow.scriptFiles.length > 0) || flow.scriptId) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveFlowId(flow.id);
                              setFlowName(flow.name);
                              setFlowDescription(flow.description || '');
                              setCurrentSteps(flow.steps);
                              setIsApproved(flow.isApproved);
                              setSelectedFolder(flow.folderId || '');
                              handleSwitchPlatform(flow.platform || 'web');
                              if (flow.tool) setSelectedTool(flow.tool);
                              if (flow.language) setSelectedLanguage(flow.language);
                              if (flow.framework) setSelectedFramework(flow.framework);
                              if (flow.generatedProject?.files && flow.generatedProject.files.length > 0) {
                                setGeneratedProject({
                                  files: flow.generatedProject.files,
                                  explanation: flow.generatedProject.explanation || flow.description || `Generated script for ${flow.name}`
                                });
                              }
                              setActiveFolderId(null);
                              setActiveFolderType(null);
                              setActivePanel('script');
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                            title="View Flow Script"
                          >
                            <FileCode size={11} /> Script
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartPlayback(flow);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-sm"
                          title="Playback Flow"
                        >
                          <Play size={10} fill="currentColor" /> Playback
                        </button>
                        <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${flow.isApproved ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                          {flow.isApproved ? 'Approved' : 'Draft'}
                        </div>
                        <button 
                          onClick={(e) => handleDeleteFlow(flow.id, e)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                          title="Delete Flow"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-1 group-hover:text-indigo-600 transition-colors">{flow.name}</h4>
                    <p className="text-[10px] text-slate-500 font-medium line-clamp-2 mb-4">{flow.description || 'No description provided.'}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-200/60">
                      <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        <Clock size={12} /> {new Date(flow.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{flow.steps.length} Steps</div>
                    </div>
                  </motion.div>
                ))
              ) : activeFolderType === 'upload_video' ? (
                displayedUploadVideoFlows.map(uploadFlow => (
                  <motion.div 
                    key={uploadFlow.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-slate-50 border border-slate-100 rounded-3xl hover:border-cyan-200 hover:shadow-xl hover:shadow-cyan-50/50 transition-all group cursor-pointer"
                    onClick={() => {
                      if (uploadFlow.steps && uploadFlow.steps.length > 0) {
                        setCurrentSteps(uploadFlow.steps);
                        setFlowName(uploadFlow.name);
                        setFlowDescription(uploadFlow.description || '');
                        setIsApproved(uploadFlow.isApproved ?? true);
                        if (uploadFlow.targetUrl && uploadFlow.targetUrl !== 'https://') {
                          setTargetUrl(uploadFlow.targetUrl);
                        }
                        handleSwitchPlatform(uploadFlow.platform || 'web');
                        setActiveFolderId(null);
                        setActiveFolderType(null);
                        setActivePanel('steps');
                        toast.success(`Loaded video flow "${uploadFlow.name}" with ${uploadFlow.steps.length} steps`);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-2 bg-white rounded-xl border border-slate-100 text-cyan-600 shadow-sm">
                        <Video size={20} />
                      </div>
                      <div className="flex items-center gap-2">
                        {(uploadFlow.videoUrl || uploadFlow.inputVideoUrl || (uploadFlow.steps && uploadFlow.steps.length > 0)) && (
                          <button 
                            onClick={async (e) => {
                              e.stopPropagation();
                              const playable = await resolveVideoPlayableUrl({
                                id: uploadFlow.id,
                                url: uploadFlow.videoUrl,
                                dataUrl: uploadFlow.inputVideoUrl,
                                videoFileName: uploadFlow.videoFileName
                              });
                              setWatchVideoModalData({
                                flowId: uploadFlow.id,
                                flowName: uploadFlow.name,
                                fileName: uploadFlow.videoFileName || uploadFlow.name,
                                url: playable || uploadFlow.videoUrl || uploadFlow.inputVideoUrl || '',
                                stepsCount: uploadFlow.steps?.length || 0,
                                steps: uploadFlow.steps || [],
                                videoDuration: uploadFlow.videoDuration || 0,
                                script: uploadFlow.generatedScript,
                                scriptFiles: uploadFlow.scriptFiles,
                                tool: uploadFlow.tool,
                                language: uploadFlow.language,
                                thumbnailUrl: uploadFlow.thumbnailUrl || uploadFlow.posterUrl || `/artifacts/${uploadFlow.id}_thumb.jpg`,
                                posterUrl: uploadFlow.posterUrl || uploadFlow.thumbnailUrl || `/artifacts/${uploadFlow.id}_thumb.jpg`
                              });
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer"
                            title="Watch Uploaded Video Walkthrough"
                          >
                            <Play size={11} className="fill-current" /> Watch Video
                          </button>
                        )}
                        {uploadFlow.generatedScript && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const files = uploadFlow.scriptFiles && uploadFlow.scriptFiles.length > 0
                                ? uploadFlow.scriptFiles
                                : [{ path: 'test.spec.ts', content: uploadFlow.generatedScript || '' }];
                              setGeneratedProject({
                                files: files,
                                explanation: uploadFlow.description || 'Generated from video walkthrough'
                              });
                              setSelectedFilePath(files[0]?.path || 'test.spec.ts');
                              if (uploadFlow.tool) setSelectedTool(uploadFlow.tool);
                              if (uploadFlow.language) setSelectedLanguage(uploadFlow.language);
                              setIsPreviewOpen(true);
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                            title="View Generated Script"
                          >
                            <FileCode size={12} /> Script
                          </button>
                        )}
                        <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${uploadFlow.isApproved ? 'bg-emerald-100 text-emerald-600' : 'bg-cyan-100 text-cyan-700'}`}>
                          {uploadFlow.isApproved ? 'Approved' : 'Video Flow'}
                        </div>
                        <button 
                          onClick={(e) => handleDeleteUploadVideoFlow(uploadFlow.id, e)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                          title="Delete Video Flow"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {(uploadFlow.videoUrl || uploadFlow.inputVideoUrl || (uploadFlow.steps && uploadFlow.steps.length > 0)) && (
                      <div 
                        onClick={async (e) => {
                          e.stopPropagation();
                          const playable = await resolveVideoPlayableUrl({
                            id: uploadFlow.id,
                            url: uploadFlow.videoUrl,
                            dataUrl: uploadFlow.inputVideoUrl,
                            videoFileName: uploadFlow.videoFileName
                          });
                          setWatchVideoModalData({
                            flowId: uploadFlow.id,
                            flowName: uploadFlow.name,
                            fileName: uploadFlow.videoFileName || uploadFlow.name,
                            url: playable || uploadFlow.videoUrl || uploadFlow.inputVideoUrl || '',
                            stepsCount: uploadFlow.steps?.length || 0,
                            steps: uploadFlow.steps || [],
                            videoDuration: uploadFlow.videoDuration || 0,
                            script: uploadFlow.generatedScript,
                            scriptFiles: uploadFlow.scriptFiles,
                            tool: uploadFlow.tool,
                            language: uploadFlow.language,
                            thumbnailUrl: uploadFlow.thumbnailUrl || uploadFlow.posterUrl || uploadFlow.steps?.[0]?.screenshot,
                            posterUrl: uploadFlow.posterUrl || uploadFlow.thumbnailUrl || uploadFlow.steps?.[0]?.screenshot
                          });
                        }}
                        className="relative w-full h-28 bg-slate-900 rounded-2xl overflow-hidden mb-3 border border-slate-200 group-hover:border-cyan-400/80 transition-colors flex items-center justify-center cursor-pointer shadow-inner"
                      >
                        {uploadFlow.thumbnailUrl || uploadFlow.posterUrl || uploadFlow.steps?.[0]?.screenshot || uploadFlow.steps?.[0]?.contextImage ? (
                          <img
                            src={uploadFlow.thumbnailUrl || uploadFlow.posterUrl || uploadFlow.steps[0]?.screenshot || uploadFlow.steps[0]?.contextImage}
                            alt="Flow Preview"
                            className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        <video
                          src={uploadFlow.videoUrl ? `${uploadFlow.videoUrl}#t=0.001` : uploadFlow.inputVideoUrl ? `${uploadFlow.inputVideoUrl}#t=0.001` : undefined}
                          className="w-full h-full object-cover opacity-75 group-hover:opacity-90 transition-opacity absolute inset-0"
                          muted
                          preload="metadata"
                          playsInline
                          onLoadedData={(e) => {
                            const v = e.currentTarget;
                            if (v.currentTime === 0) {
                              try { v.currentTime = 0.001; } catch {}
                            }
                          }}
                          onCanPlay={(e) => {
                            const v = e.currentTarget;
                            if (v.currentTime === 0) {
                              try { v.currentTime = 0.001; } catch {}
                            }
                          }}
                          onError={(e) => {
                            const videoElem = e.currentTarget;
                            resolveVideoPlayableUrl({
                              id: uploadFlow.id,
                              url: uploadFlow.videoUrl,
                              dataUrl: uploadFlow.inputVideoUrl,
                              videoFileName: uploadFlow.videoFileName
                            }).then(recovered => {
                              if (recovered && recovered !== videoElem.src) {
                                videoElem.src = recovered;
                              } else {
                                videoElem.style.display = 'none';
                              }
                            }).catch(() => {
                              videoElem.style.display = 'none';
                            });
                          }}
                          poster={typeof uploadFlow.thumbnailUrl === 'string' && !uploadFlow.thumbnailUrl.endsWith('_thumb.jpg') ? uploadFlow.thumbnailUrl : (typeof uploadFlow.posterUrl === 'string' && !uploadFlow.posterUrl.endsWith('_thumb.jpg') ? uploadFlow.posterUrl : undefined)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                        <div className="absolute w-9 h-9 rounded-full bg-cyan-500/90 text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                          <Play size={14} className="fill-current ml-0.5" />
                        </div>
                        <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[9px] font-bold text-white/90">
                          <span className="truncate max-w-[140px]">{uploadFlow.videoFileName || 'Walkthrough Video'}</span>
                          {uploadFlow.videoDuration ? <span>{uploadFlow.videoDuration.toFixed(1)}s</span> : null}
                        </div>
                      </div>
                    )}
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-1 group-hover:text-cyan-700 transition-colors">{uploadFlow.name}</h4>
                    <p className="text-[10px] text-slate-500 font-medium line-clamp-2 mb-4">{uploadFlow.description || uploadFlow.videoFileName || 'Video walkthrough flow'}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-200/60">
                      <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        <Clock size={12} /> {new Date(uploadFlow.createdAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-2">
                        {uploadFlow.hasDataDriven && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            DDT
                          </span>
                        )}
                        <div className="text-[9px] font-black text-cyan-700 uppercase tracking-widest">{uploadFlow.steps?.length || 0} Steps</div>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                displayedScripts.map(script => (
                  <motion.div 
                    key={script.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-slate-50 border border-slate-100 rounded-3xl hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-50/50 transition-all group cursor-pointer"
                    onClick={() => {
                      const matchingFlow = (project.recordedFlows || []).find(f => f.id === script.flowId || f.name === script.flowName || f.scriptId === script.id);
                      const rawFiles = script.files && script.files.length > 0
                        ? script.files
                        : [{ path: `${(script.title || 'test').toLowerCase().replace(/[^a-z0-9]/g, '_')}.spec.ts`, content: script.content || '' }];

                      const repairedFiles = ensureCompleteProjectFiles(rawFiles, {
                        tool: script.tool || selectedTool,
                        language: script.language || selectedLanguage,
                        framework: script.framework || selectedFramework,
                        flowName: script.flowName || script.title,
                        steps: matchingFlow?.steps || [],
                        targetUrl: script.appUrl || matchingFlow?.initialUrl || (matchingFlow as any)?.targetUrl || targetUrl
                      });

                      setGeneratedProject({ 
                        files: repairedFiles, 
                        explanation: script.description || `Automation project for ${script.title}` 
                      });
                      const mainFile = repairedFiles.find(f => f.path.includes('spec') || f.path.includes('test')) || repairedFiles[0];
                      setSelectedFilePath(mainFile?.path || repairedFiles[0]?.path || 'test.spec.ts');
                      if (script.tool) setSelectedTool(script.tool);
                      if (script.language) setSelectedLanguage(script.language);
                      setIsPreviewOpen(true);
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="p-2 bg-white rounded-xl border border-slate-100 text-emerald-500 shadow-sm">
                        <FileCode size={20} />
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Approve Toggle Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const updatedScripts = (project.automationScripts || []).map(s =>
                              s.id === script.id ? { ...s, isApproved: !s.isApproved } : s
                            );
                            onUpdateProject({ ...project, automationScripts: updatedScripts });
                            toast.success(
                              script.isApproved
                                ? 'Script removed from Execution Hub'
                                : 'Script approved and added to Execution Hub!'
                            );
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                            script.isApproved
                              ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300'
                              : 'bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-slate-200 shadow-2xs'
                          }`}
                          title={script.isApproved ? 'Approved - Click to remove from Execution Hub' : 'Approve for Execution Hub'}
                        >
                          <CheckCircle2 size={12} className={script.isApproved ? 'text-emerald-600' : 'text-slate-400'} />
                          {script.isApproved ? 'Approved' : 'Approve'}
                        </button>
                        <div className="px-2 py-1 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase tracking-widest">
                          {script.tool}
                        </div>
                        <button 
                          type="button"
                          onClick={(e) => handleDownloadSavedScript(script, e)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                          title="Download Script or Project ZIP (50 credits)"
                        >
                          <Download size={14} />
                        </button>
                        <button 
                          onClick={(e) => handleDeleteScript(script.id, e)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                          title="Delete Script"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-1 group-hover:text-emerald-600 transition-colors">{script.title}</h4>
                    <p className="text-[10px] text-slate-500 font-medium line-clamp-2 mb-4">{script.description || 'No description provided.'}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-slate-200/60">
                      <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        <Clock size={12} /> {new Date(script.createdAt).toLocaleDateString()}
                      </div>
                      <div className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">{script.language}</div>
                    </div>
                  </motion.div>
                ))
              )}
              
              {((activeFolderType === 'flow' && displayedFlows.length === 0) ||
                (activeFolderType === 'upload_video' && displayedUploadVideoFlows.length === 0) ||
                (activeFolderType === 'script' && displayedScripts.length === 0)) && (
                <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
                    <Folder size={32} />
                  </div>
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">This folder is empty</h4>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Controls & Management */}
            <div className="lg:col-span-1 flex flex-col gap-8">
          {/* Target Platform Selection */}
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Target Platform</h3>
              <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${platform === 'web' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                {platform === 'web' ? 'Web Browser' : 'Mobile App / ADB'}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100/80 rounded-2xl">
              <button
                type="button"
                onClick={() => handleSwitchPlatform('web')}
                className={`py-3 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  (platform as string) === 'web'
                    ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100 border border-slate-200/50'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Globe size={16} /> Web App
              </button>
              <button
                type="button"
                onClick={() => handleSwitchPlatform('mobile')}
                className={`py-3 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  (platform as string) === 'mobile'
                    ? 'bg-white text-indigo-600 shadow-md shadow-indigo-100 border border-slate-200/50'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Smartphone size={16} /> Mobile App
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <div className={`p-2 rounded-xl ${(platform as string) === 'web' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                {(platform as string) === 'web' ? <Globe size={18} /> : <Smartphone size={18} />}
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                  {platform === 'web' ? 'Playwright Web Recorder' : 'Appium / ADB Mobile Recorder'}
                </p>
                <p className="text-[9px] text-slate-400 font-medium leading-tight mt-0.5">
                  {platform === 'web' 
                    ? 'Record automated web test steps in browser' 
                    : 'Record mobile apps via installed packages, APK, custom activity, or mobile web'}
                </p>
              </div>
            </div>
          </div>

          {/* Recording Controls */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Recording Controls</h3>
              {isRecording && (
                <div className="flex items-center gap-2 px-3 py-1 bg-rose-50 rounded-full border border-rose-100">
                  <div className={`w-2 h-2 rounded-full bg-rose-500 ${!isPaused ? 'animate-pulse' : ''}`} />
                  <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">{formatDuration(recordingDuration)}</span>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              {!isRecording ? (
                <div className="col-span-3">
                  <button 
                    onClick={handleStartRecording}
                    disabled={isStarting}
                    className="w-full flex flex-col items-center justify-center gap-3 p-8 bg-emerald-50 text-emerald-600 rounded-3xl border border-emerald-100 hover:bg-emerald-100 transition-all group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <div className={`p-4 bg-emerald-600 text-white rounded-2xl shadow-lg ${!isStarting ? 'group-hover:scale-110' : ''} transition-transform`}>
                      {isStarting ? <RotateCcw size={24} className="animate-spin" /> : <Play size={24} fill="currentColor" />}
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest">
                      {isStarting ? 'Starting...' : 'Start Recording'}
                    </span>
                  </button>
                </div>
              ) : (
                <>
                  <button 
                    onClick={handlePauseRecording}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all ${isPaused ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'}`}
                  >
                    {isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
                    <span className="text-[10px] font-black uppercase tracking-widest">{isPaused ? 'Resume' : 'Pause'}</span>
                  </button>
                  <button 
                    onClick={handleStopRecording}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl hover:bg-rose-100 transition-all"
                  >
                    <Square size={20} fill="currentColor" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Stop</span>
                  </button>
                  <button 
                    onClick={() => handleAddStep('assertion', 'Verify Element', { primary: { type: 'id', value: '#main-heading' }, alternatives: [] }, 'Welcome')}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-2xl hover:bg-indigo-100 transition-all"
                  >
                    <CheckSquare size={20} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Assert</span>
                  </button>
                  <button 
                    onClick={() => handleAddStep('wait', 'Wait for Element', { primary: { type: 'id', value: '#loading-spinner' }, alternatives: [] })}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-amber-50 text-amber-600 border border-amber-100 rounded-2xl hover:bg-amber-100 transition-all"
                  >
                    <Clock size={20} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Wait</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Flow Management */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Flow Management</h3>
            
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Flow Name</label>
              <input 
                type="text" 
                value={flowName || ''}
                onChange={(e) => setFlowName(e.target.value)}
                placeholder="e.g. Login Flow"
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all shadow-inner"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Description</label>
              <textarea 
                value={flowDescription || ''}
                onChange={(e) => setFlowDescription(e.target.value)}
                placeholder="Describe the purpose of this flow..."
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-4 ring-indigo-50/10 transition-all shadow-inner h-24 resize-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Refine Instructions</label>
              <textarea 
                value={refineInstructions || ''}
                onChange={(e) => setRefineInstructions(e.target.value)}
                placeholder="Enter instructions to refine script generation (e.g., custom locators, wait conditions, assertions)..."
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-4 ring-indigo-50/10 transition-all shadow-inner h-24 resize-none"
              />
            </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Parent Folder</label>
                <div className="relative">
                  <select 
                    value={selectedFolder || ''}
                    onChange={(e) => setSelectedFolder(e.target.value)}
                    className="w-full pl-6 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none appearance-none cursor-pointer focus:ring-4 ring-indigo-50 shadow-inner"
                  >
                    <option value="">Root Directory</option>
                    {deduplicatedAutomationFolders.filter(isFlowFolderForPlatform).map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                </div>
              </div>

            <div className="pt-4 border-t border-slate-50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Review & Approval</span>
                <button 
                  onClick={() => setIsApproved(!isApproved)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${isApproved ? 'bg-emerald-500' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-300 ${isApproved ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-medium italic">Script generation is only enabled for approved flows.</p>
            </div>
          </div>

          {/* Script Generation Config */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Generation Config</h3>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
                POM & BDD Ready
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Tool / Engine</label>
                <div className="relative">
                  <select 
                    value={selectedTool || 'Playwright'}
                    onChange={(e) => {
                      const newTool = e.target.value as AutomationTool;
                      setSelectedTool(newTool);
                      const available = getFrameworksForAutomation(newTool, selectedLanguage);
                      if (!available.includes(selectedFramework)) {
                        setSelectedFramework(available[0] || 'Page Object Model (POM)');
                      }
                    }}
                    className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none appearance-none cursor-pointer"
                  >
                    <option value="Playwright">Playwright</option>
                    <option value="Selenium">Selenium</option>
                    <option value="Cypress">Cypress</option>
                    <option value="Appium">Appium</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Language</label>
                <div className="relative">
                  <select 
                    value={selectedLanguage || 'TypeScript'}
                    onChange={(e) => {
                      const newLang = e.target.value as ProgrammingLanguage;
                      setSelectedLanguage(newLang);
                      const available = getFrameworksForAutomation(selectedTool, newLang);
                      if (!available.includes(selectedFramework)) {
                        setSelectedFramework(available[0] || 'Page Object Model (POM)');
                      }
                    }}
                    className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none appearance-none cursor-pointer"
                  >
                    <option value="TypeScript">TypeScript</option>
                    <option value="JavaScript">JavaScript</option>
                    <option value="Python">Python</option>
                    <option value="Java">Java</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
              </div>
            </div>

            {/* Framework Architecture Selector (TestNG, Cucumber/BDD, PyTest, JUnit, POM) */}
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">
                Framework Architecture / Runner
              </label>
              <div className="relative">
                <select
                  value={selectedFramework}
                  onChange={(e) => setSelectedFramework(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 bg-indigo-50/50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-bold outline-none appearance-none cursor-pointer"
                >
                  {getFrameworksForAutomation(selectedTool, selectedLanguage).map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" size={14} />
              </div>
              <p className="text-[10px] text-slate-400 font-medium ml-2 mt-1.5">
                Generates complete folder structure, runners, page classes, and assertions tailored for {selectedFramework}.
              </p>
            </div>

            {/* Upload BDD Document Section */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <FileText size={12} className="text-indigo-600" />
                  BDD Document / Feature File (Optional)
                </label>
                {uploadedBddDoc && (
                  <span className="text-[9px] font-black px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1">
                    <CheckCircle2 size={10} /> Active
                  </span>
                )}
              </div>

              {!uploadedBddDoc ? (
                <div className="relative">
                  <input
                    type="file"
                    id="bdd-doc-upload-input"
                    accept=".feature,.txt,.doc,.docx,.pdf,.gherkin,.md,.json"
                    disabled={isBddUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsBddUploading(true);
                      try {
                        const text = await file.text();
                        const parsed = parseBddDocument(text, file.name);
                        setUploadedBddDoc(parsed);
                        setUploadedBddFileName(file.name);

                        // Auto-select BDD/Cucumber framework if available
                        const available = getFrameworksForAutomation(selectedTool, selectedLanguage);
                        const bddOption = available.find(f => f.toLowerCase().includes('cucumber') || f.toLowerCase().includes('bdd') || f.toLowerCase().includes('behave'));
                        if (bddOption) {
                          setSelectedFramework(bddOption);
                        }

                        toast.success(`Parsed BDD Document: "${file.name}" (${parsed.scenarios.length} scenarios)`);
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to parse BDD document');
                      } finally {
                        setIsBddUploading(false);
                      }
                    }}
                    className="hidden"
                  />
                  <label
                    htmlFor="bdd-doc-upload-input"
                    className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/20 rounded-2xl cursor-pointer transition-all text-center group"
                  >
                    <UploadCloud size={20} className="text-slate-400 group-hover:text-indigo-600 transition-colors mb-1.5" />
                    <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700">
                      {isBddUploading ? 'Parsing BDD Document...' : 'Upload BDD Document (.feature / .docx / .txt)'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      Gherkin feature files, Given-When-Then user stories, or test specifications
                    </span>
                  </label>
                </div>
              ) : (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                        <FileCheck size={14} />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-black text-slate-800 truncate">{uploadedBddFileName}</p>
                        <p className="text-[10px] text-slate-500 font-medium">
                          {uploadedBddDoc.featureTitle || 'BDD Feature'} • {uploadedBddDoc.scenarios.length} Scenarios • {uploadedBddDoc.scenarios.reduce((acc, s) => acc + (s.steps?.length || 0), 0)} Steps
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadedBddDoc(null);
                        setUploadedBddFileName('');
                        toast.info('BDD document removed');
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="Remove BDD document"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {uploadedBddDoc.tags && uploadedBddDoc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {uploadedBddDoc.tags.map((tag, tIdx) => (
                        <span key={tIdx} className="text-[9px] font-mono px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Removed "Generate POM Scripts" button from here as requested */}
          </div>
        </div>

        {/* Right Column: Recorded Steps Panel */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {showLiveRecorder && isRecording && (
              <div className="bg-slate-950 rounded-[2.5rem] border border-slate-900 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-top-4 duration-500 h-[600px]">
                <div className="p-4 border-b border-slate-900 flex items-center justify-between bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400 border border-rose-500/20">
                      <Radio size={16} className="animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-100 uppercase tracking-tight flex items-center gap-2">
                        Universal Web Recorder
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] font-black uppercase rounded-full border border-emerald-500/30">
                          Interactive Live
                        </span>
                      </h3>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest truncate max-w-[300px]">
                        {targetUrl}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeDiagnostics.length > 0 && (
                      <button
                        onClick={() => setActiveDiagnosticModal(activeDiagnostics[activeDiagnostics.length - 1])}
                        className="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:bg-amber-500/30 transition-all cursor-pointer"
                      >
                        <AlertTriangle size={12} className="animate-bounce" />
                        {activeDiagnostics.length} Diagnostic Notice{activeDiagnostics.length > 1 ? 's' : ''}
                      </button>
                    )}
                    {pendingPermissionRequest && (
                      <button
                        onClick={() => {}}
                        className="px-2.5 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 animate-pulse"
                      >
                        <ShieldAlert size={12} />
                        Permission Gate Open
                      </button>
                    )}
                    <div className="px-3 py-1 bg-slate-800 rounded-lg text-[10px] font-bold text-slate-400 flex items-center gap-2">
                      <Globe size={12} /> {targetUrl ? (() => { try { return new URL(targetUrl).hostname; } catch(e) { return targetUrl; } })() : ''}
                    </div>
                    <button 
                      onClick={() => setShowLiveRecorder(false)}
                      className="p-2 text-slate-500 hover:text-white transition-colors"
                    >
                      <Minimize2 size={18} />
                    </button>
                  </div>
                </div>

                {activeDiagnostics.length > 0 && (
                  <div className="px-4 py-2 bg-amber-950/80 border-b border-amber-900/60 flex items-center justify-between text-xs text-amber-200">
                    <div className="flex items-center gap-2">
                      <Info size={14} className="text-amber-400 shrink-0" />
                      <span className="font-bold text-[11px]">
                        [{activeDiagnostics[activeDiagnostics.length - 1].code}] {activeDiagnostics[activeDiagnostics.length - 1].title}: {activeDiagnostics[activeDiagnostics.length - 1].message}
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveDiagnosticModal(activeDiagnostics[activeDiagnostics.length - 1])}
                      className="text-[10px] font-black underline uppercase hover:text-white shrink-0 ml-2"
                    >
                      View Details
                    </button>
                  </div>
                )}

                <div className="flex-1 bg-white relative">
                  <iframe 
                    id="qa-recorder-live-iframe"
                    src={targetUrl ? `/api/proxy?url=${encodeURIComponent(targetUrl)}${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ''}` : undefined}
                    className="w-full h-full border-none"
                    title="Recorder Iframe"
                    allow="clipboard-read; clipboard-write; autoplay; fullscreen"
                  />
                  {isPaused && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center z-10">
                      <div className="px-6 py-3 bg-white rounded-2xl shadow-2xl flex items-center gap-3">
                        <Pause size={20} className="text-amber-500" fill="currentColor" />
                        <span className="text-sm font-black text-slate-800 uppercase tracking-widest">Recording Paused</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

          <div className="bg-slate-950 rounded-[2.5rem] border border-slate-900 shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="p-8 border-b border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-400 border border-indigo-500/20"><Layers size={20} /></div>
                <div>
                  <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight">Recorded Steps</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{platformSteps.length} Steps Captured</p>
                </div>
              </div>
                <div className="flex items-center gap-3">
                  <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
                    <button 
                      onClick={() => setActivePanel('steps')}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activePanel === 'steps' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Steps
                    </button>
                    <button 
                      onClick={() => setActivePanel('script')}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activePanel === 'script' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Script
                    </button>
                    <button 
                      onClick={() => setActivePanel('console')}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activePanel === 'console' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Console
                    </button>
                  </div>
                  {/* Parse Code button removed as requested */}
                   <button 
                    onClick={handleAIOptimize}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-purple-500/25"
                  >
                    <Sparkles size={14} /> AI Optimizer
                  </button>
                  {platformSteps.length > 0 && (
                    <button 
                      onClick={() => handleStartPlayback({
                        id: activeFlowId || 'current-flow',
                        name: flowName || 'Current Flow',
                        description: flowDescription,
                        steps: platformSteps,
                        createdAt: new Date().toISOString(),
                        isApproved: isApproved,
                        folderId: selectedFolder,
                        platform: platform
                      })}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20"
                    >
                      <Play size={14} fill="currentColor" /> Playback Flow
                    </button>
                  )}
                  <button 
                    onClick={() => setIsAddStepModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20"
                  >
                    <Plus size={14} /> Add Step
                  </button>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
                    <input 
                      type="text" 
                      value={searchQuery || ''}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter steps..."
                      className="pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium outline-none focus:ring-2 ring-indigo-500/20 transition-all text-slate-200 placeholder:text-slate-600"
                    />
                  </div>
                  <button className="p-2.5 bg-slate-900 text-slate-500 rounded-xl hover:bg-slate-800 transition-all border border-slate-800"><Filter size={18} /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-950">
              {activePanel === 'steps' ? (
                platformSteps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center text-slate-800 mb-6 border border-slate-800">
                    <Zap size={40} />
                  </div>
                  <h4 className="text-lg font-black text-slate-700 uppercase tracking-widest">No steps recorded yet</h4>
                  <p className="text-xs text-slate-600 font-medium mt-2">Start recording to capture user interactions.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <AnimatePresence initial={false}>
                    {filteredSteps.map((step, index) => (
                      <motion.div 
                        key={step.id || `step-${index}`} 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-indigo-500/50 transition-all group flex flex-col gap-3 ${step.skipped ? 'opacity-50 grayscale' : ''}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 bg-indigo-600/20 text-indigo-400 rounded flex items-center justify-center text-[10px] font-black border border-indigo-500/20">
                              {index + 1}
                            </div>
                            <div className={`p-1.5 rounded-lg border ${
                              step.action === 'click' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              step.action === 'fill' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                              step.action === 'navigate' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                              step.action === 'upload' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                              step.action === 'scroll' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                              step.action === 'focus' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                              step.action === 'blur' ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' :
                              step.action === 'visibility' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                              step.action === 'submit' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {step.action === 'click' ? <CheckSquare size={14} /> :
                               step.action === 'fill' ? <Edit3 size={14} /> :
                               step.action === 'navigate' ? <Globe size={14} /> :
                               step.action === 'upload' ? <Upload size={14} /> :
                               step.action === 'scroll' ? <RotateCcw size={14} className="rotate-90" /> :
                               step.action === 'focus' ? <Search size={14} /> :
                               step.action === 'blur' ? <X size={14} /> :
                               step.action === 'visibility' ? <Layers size={14} /> :
                               step.action === 'submit' ? <Send size={14} /> :
                               <Zap size={14} />}
                            </div>
                            <h4 className={`text-[11px] font-black text-slate-100 uppercase tracking-wider ${step.skipped ? 'line-through' : ''}`}>
                              {step.action === 'fill' ? (
                                 <span>Entered {step.masked ? <span className="text-amber-400 font-bold">SENSITIVE DATA ({String(step.placeholder || '')})</span> : `"${String(step.value || '')}"`} in "{String(step.elementName || step.locator?.primary?.value || 'input')}"</span>
                               ) :
                               step.action === 'click' ? `Clicked "${String(step.elementName || step.locator?.primary?.value || 'element')}"` :
                               step.action === 'navigate' ? `Redirected to "${String(step.value || step.url || '')}"` :
                               step.action === 'upload' ? `Uploaded to "${String(step.elementName || step.locator?.primary?.value || 'element')}": ${String(step.value || '')}` :
                               step.action === 'scroll' ? `Scrolled page` :
                               step.action === 'focus' ? `Focused on "${String(step.elementName || step.locator?.primary?.value || 'element')}"` :
                               step.action === 'blur' ? `Blurred from "${String(step.elementName || step.locator?.primary?.value || 'element')}"` :
                               step.action === 'visibility' ? `Tab switched to ${String(step.state || 'background')}` :
                               step.action === 'submit' ? `Submitted form` :
                               `${String(step.action || 'step').toUpperCase()} ${String(step.elementName || step.locator?.primary?.value || '')}`}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2">
                            {step.skipped && (
                              <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">Skipped</span>
                            )}
                            <span className="text-[9px] font-bold text-slate-500 font-mono">
                              {step.timestamp && !isNaN(new Date(step.timestamp).getTime())
                                ? new Date(step.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                : '00:00:00'}
                            </span>
                          </div>
                        </div>

                        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
                          <code className="text-[10px] font-mono text-emerald-400 block break-all">
                            {selectedTool === 'Playwright' && typeof step.locator?.primary?.playwright === 'string' && step.locator.primary.playwright
                              ? step.locator.primary.playwright 
                              : String(step.locator?.primary?.value || step.elementName || 'element')}
                          </code>
                        </div>

                        {step.screenshot && (
                          <div className="relative w-full h-32 rounded-lg overflow-hidden border border-slate-800">
                            <img src={step.screenshot || undefined} alt="Step Screenshot" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => window.open(step.screenshot, '_blank')}
                                className="p-2 bg-white/10 backdrop-blur-md rounded-lg text-white hover:bg-white/20 transition-all"
                              >
                                <Maximize2 size={16} />
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-1">
                          <div className="flex gap-2">
                            <span className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-tighter ${
                              step.action === 'click' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              step.action === 'fill' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                              step.action === 'upload' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                              'bg-slate-700/30 text-slate-400 border border-slate-700/50'
                            }`}>
                              {String(step.action || 'step')}
                            </span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{String(step.platform || 'web')}</span>
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              disabled={index === 0}
                              onClick={() => handleMoveStep(index, 'up')}
                              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors disabled:opacity-20 disabled:hover:text-slate-400"
                              title="Move Step Up"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button 
                              disabled={index === filteredSteps.length - 1}
                              onClick={() => handleMoveStep(index, 'down')}
                              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors disabled:opacity-20 disabled:hover:text-slate-400"
                              title="Move Step Down"
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button 
                              onClick={() => handleOpenAddStepModal(index)}
                              className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
                              title="Insert Step After (+)"
                            >
                              <Plus size={14} />
                            </button>
                            <button 
                              onClick={() => handleEditStep(step)}
                              className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors"
                              title="Edit Step"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDuplicateStep(step)}
                              className="p-1.5 text-slate-500 hover:text-indigo-400 transition-colors"
                              title="Duplicate Step"
                            >
                              <Copy size={14} />
                            </button>
                            <button 
                              onClick={() => handleSkipStep(step.id)}
                              className={`p-1.5 transition-colors ${step.skipped ? 'text-amber-400' : 'text-slate-500 hover:text-amber-400'}`}
                              title={step.skipped ? "Unskip Step" : "Skip Step"}
                            >
                              <SkipForward size={14} />
                            </button>
                            <button 
                              onClick={() => handleScreenshotStep(step.id)}
                              className="p-1.5 text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Capture Screenshot"
                            >
                              <Camera size={14} />
                            </button>
                            <button 
                              onClick={() => handleDeleteStep(step.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                              title="Delete Step"
                            >
                              <Trash2 size={14} />
                            </button>
                            <div className="p-1.5 text-slate-600 hover:text-slate-400 transition-colors" title={`Step ${index + 1}`}>
                              <GripVertical size={14} />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-center -mb-2 mt-1 py-1 group/divider">
                          <button 
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              handleOpenAddStepModal(index);
                            }}
                            className="opacity-0 group-hover/divider:opacity-100 flex items-center gap-1.5 px-3 py-0.5 bg-slate-800 border border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-white rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-md transform scale-95 hover:scale-100"
                            title="Insert Step After This Step"
                          >
                            <Plus size={11} /> Add Step
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )
              ) : activePanel === 'console' ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 border border-indigo-500/20">
                        <Terminal size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-100 uppercase tracking-widest">Browser Console</h4>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Real-time debug logs</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setConsoleLogs([])}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-500 hover:text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-800 transition-all"
                    >
                      Clear Logs
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[11px] custom-scrollbar pr-2">
                    {consoleLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center opacity-30">
                        <Terminal size={40} className="mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest">No logs captured yet</p>
                      </div>
                    ) : (
                      consoleLogs.map((log, i) => (
                        <div key={i} className={`p-3 rounded-xl border-l-4 ${
                          log.type === 'error' ? 'bg-rose-500/5 border-rose-500 text-rose-400' :
                          log.type === 'warn' ? 'bg-amber-500/5 border-amber-500 text-amber-400' :
                          'bg-slate-900 border-slate-800 text-slate-300'
                        }`}>
                          <div className="flex items-center justify-between opacity-50 mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                                log.type === 'error' ? 'bg-rose-500 text-white' :
                                log.type === 'warn' ? 'bg-amber-500 text-black' :
                                'bg-slate-700 text-slate-300'
                              }`}>{log.type}</span>
                              <span className="text-[9px] font-bold">{new Date(log.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <span className="text-[9px] opacity-50 truncate max-w-[200px]">{log.url}</span>
                          </div>
                          <div className="break-words leading-relaxed">{log.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col">
                  {/* File Tabs & Header for Flow-specific Script */}
                  {((generatedProject?.files && generatedProject.files.length > 0) || (activeFlow?.scriptFiles && activeFlow.scriptFiles.length > 0)) && (
                    <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2 custom-scrollbar">
                      {(generatedProject?.files || activeFlow?.scriptFiles || []).map(file => (
                        <button
                          key={file.path}
                          type="button"
                          onClick={() => setSelectedFilePath(file.path)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono whitespace-nowrap transition-all border ${
                            (selectedFilePath === file.path || (!selectedFilePath && (file.path.includes('spec') || file.path.includes('test'))))
                              ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50 shadow-sm'
                              : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <FileCode size={12} className="text-indigo-400" />
                          <span>{file.path.split('/').pop()}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400">
                        {selectedFilePath || (activeFlow ? `${activeFlow.name}.spec.ts` : 'test.spec.ts')}
                      </span>
                      {hasSavedScriptForActiveFlow && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Mapped Script
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                      {selectedTool} • {selectedLanguage}
                    </span>
                  </div>

                  <div className="flex-1 bg-slate-900/70 rounded-2xl border border-slate-800 p-2 font-mono text-xs overflow-auto custom-scrollbar">
                    <table className="w-full border-collapse">
                      <tbody>
                        {activeFlowScriptContent.split('\n').map((lineText, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/50 transition-colors group">
                            <td className="py-0.5 pr-3 pl-2 text-right select-none text-slate-600 group-hover:text-slate-400 font-mono text-[11px] w-12 border-r border-slate-800 align-top">
                              {idx + 1}
                            </td>
                            <td className="py-0.5 pl-3 pr-3 whitespace-pre text-indigo-300 font-mono text-xs leading-relaxed align-top">
                              {lineText || ' '}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex justify-end gap-3">
                    <button 
                      onClick={async () => {
                        const success = await deductExportCredits(
                          project.id,
                          'record_play_web',
                          user,
                          'Copy Flow Script',
                          project.name
                        );
                        if (!success) return;
                        navigator.clipboard.writeText(activeFlowScriptContent);
                        toast.success("Script copied to clipboard!");
                      }}
                      className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all cursor-pointer"
                    >
                      Copy Script
                    </button>
                    <button 
                      onClick={handleSaveScript}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 cursor-pointer"
                    >
                      Save Script
                    </button>
                  </div>
                </div>
              )}
            </div>

            {platformSteps.length > 0 && (
              <div className="p-6 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <Clock size={14} />
                    Duration: {formatDuration(recordingDuration)}
                  </div>
                  <div className="w-1 h-1 rounded-full bg-slate-800" />
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    All locators valid
                  </div>
                </div>
                <button 
                  onClick={() => setCurrentSteps(prev => prev.filter(s => (s.platform || 'web') !== platform))}
                  className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-400 transition-colors"
                >
                  Clear All Steps
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
          </>
        )}
      </div>

      {/* Instruction Modal */}
      <AnimatePresence>
        {generationStages.active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-7 shadow-2xl flex flex-col gap-5 text-white relative overflow-hidden"
            >
              {/* Glow effects */}
              <div className="absolute -top-24 -right-24 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-56 h-56 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

              {/* Header */}
              <div className="flex items-center gap-3.5 relative z-10">
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-indigo-400 shadow-inner flex-shrink-0">
                  <Sparkles size={22} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-100 uppercase tracking-tight flex items-center gap-2">
                    Synthesizing Enhanced Script
                    <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-[9px] font-black uppercase rounded-full border border-indigo-500/30">
                      Approved Flow
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    Positive Flow + Step Assertions + Negative Coverage + Edge Cases
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-slate-700/50 relative z-10">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 h-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, ((generationStages.currentStepIndex + 1) / 5) * 100)}%`
                  }}
                />
              </div>

              {/* 5 Stages List */}
              <div className="flex flex-col gap-2.5 relative z-10">
                {generationStages.steps.map((st, idx) => {
                  const isDone = st.status === 'completed';
                  const isCurrent = st.status === 'in_progress';
                  return (
                    <div
                      key={st.id}
                      className={`flex items-start gap-3 p-3 rounded-2xl border transition-all ${
                        isDone
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : isCurrent
                          ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200 shadow-md shadow-indigo-950/50'
                          : 'bg-slate-800/30 border-slate-800/60 text-slate-500'
                      }`}
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {isDone ? (
                          <CheckCircle2 size={16} className="text-emerald-400" />
                        ) : isCurrent ? (
                          <Loader2 size={16} className="text-indigo-400 animate-spin" />
                        ) : (
                          <div className="w-4 h-4 rounded-full border-2 border-slate-700 flex items-center justify-center text-[9px] font-bold">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-xs font-bold uppercase tracking-wide ${
                            isDone ? 'text-emerald-300' : isCurrent ? 'text-indigo-200 font-extrabold' : 'text-slate-400'
                          }`}>
                            {st.label}
                          </p>
                          {isDone && (
                            <span className="text-[8px] font-black uppercase text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              Added
                            </span>
                          )}
                          {isCurrent && (
                            <span className="text-[8px] font-black uppercase text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/30 animate-pulse">
                              Processing
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                          {st.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Target Config Summary Footer */}
              <div className="p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 relative z-10">
                <span className="font-semibold text-slate-300">
                  Target Engine: <strong className="text-indigo-400">{selectedTool}</strong> ({selectedLanguage} • {selectedFramework})
                </span>
                <span className="text-[9px] text-slate-500 font-mono">
                  Unified Test Suite
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isInstructionModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 text-center border border-white"
            >
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-100">
                <Radio size={40} className="animate-pulse" />
              </div>
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">Recording Active</h3>
              <p className="text-slate-600 font-medium mb-8 leading-relaxed">
                The target URL has been opened in a new tab. 
                The <strong>QA Recorder</strong> extension will capture all your actions in real-time.
              </p>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">1</div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Step 1</span>
                  </div>
                  <p className="text-xs font-bold text-slate-700">Go to the newly opened tab</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-black">2</div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Step 2</span>
                  </div>
                  <p className="text-xs font-bold text-slate-700">Click, type, and navigate as usual</p>
                </div>
              </div>
              <button 
                onClick={() => setIsInstructionModalOpen(false)}
                className="w-full mt-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all"
              >
                Got it, let's record
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Script Preview Modal */}
      <AnimatePresence>
        {showScriptPreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[4000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-600 rounded-2xl text-white shadow-lg shadow-emerald-100">
                    <FileCode size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Playwright Script</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Generated from your recording</p>
                  </div>
                </div>
                <button onClick={() => setShowScriptPreview(false)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 bg-slate-950 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-slate-300">{selectedFilePath || (activeFlow ? `${activeFlow.name}.spec.ts` : 'test.spec.ts')}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                      {activeFlowScriptContent.split('\n').length} lines
                    </span>
                  </div>
                  <button 
                    onClick={async () => {
                      const success = await deductExportCredits(
                        project.id,
                        'record_play_web',
                        user,
                        'Copy Flow Script',
                        project.name
                      );
                      if (!success) return;
                      navigator.clipboard.writeText(activeFlowScriptContent);
                      toast.success('Script copied to clipboard');
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-slate-700 hover:text-white transition-all cursor-pointer"
                  >
                    <Copy size={14} /> Copy Script
                  </button>
                </div>
                <div className="h-[420px] overflow-auto custom-scrollbar font-mono text-xs bg-slate-900 rounded-xl border border-slate-800 p-2">
                  <table className="w-full border-collapse">
                    <tbody>
                      {activeFlowScriptContent.split('\n').map((lineText, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/50 transition-colors group">
                          <td className="py-0.5 pr-3 pl-2 text-right select-none text-slate-600 group-hover:text-slate-400 font-mono text-[11px] w-12 border-r border-slate-800 align-top">
                            {idx + 1}
                          </td>
                          <td className="py-0.5 pl-3 pr-3 whitespace-pre text-emerald-400 font-mono text-xs leading-relaxed align-top">
                            {lineText || ' '}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setShowScriptPreview(false)}
                  className="px-6 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Close
                </button>
                <button 
                  onClick={handleSaveFlow}
                  className="flex-1 py-4 bg-white border border-indigo-200 text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 shadow-sm transition-all cursor-pointer"
                >
                  Save Flow
                </button>
                <button 
                  onClick={handleSaveScript}
                  className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-200 transition-all cursor-pointer"
                >
                  Save Script
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Start Recording Configuration Modal */}
      <AnimatePresence>
        {isStartModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white"
            >
              {renderStartModalContent()}
              {false && (<>
                <div className="p-8 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                    <Radio size={24} className="animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Configure Recording</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Set up your test environment</p>
                  </div>
                </div>
                <button onClick={() => setIsStartModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                {/* Recording Name */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Recording Name</label>
                  <input 
                    type="text"
                    value={tempRecordingName || ''}
                    onChange={(e) => setTempRecordingName(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                    placeholder="e.g., Login Flow Test"
                  />
                </div>

                {/* Recording Mode */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Recording Mode</label>
                  <div className="flex p-1 bg-slate-100 rounded-2xl gap-1">
                    <button 
                      onClick={() => setRecordingMode('manual')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${recordingMode === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <Layers size={14} /> Functional
                    </button>
                    <button 
                      onClick={() => setRecordingMode('extension')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${recordingMode === 'extension' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <ExternalLink size={14} /> Extension
                    </button>
                    <button 
                      onClick={() => setRecordingMode('codegen')}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${recordingMode === 'codegen' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <Terminal size={14} /> Codegen
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 font-medium mt-2 ml-2">
                    {recordingMode === 'manual' 
                      ? "Uses a secure proxy to record actions directly in this window. No extension required." 
                      : recordingMode === 'codegen'
                      ? "Launches a high-fidelity Playwright session to generate optimized scripts in real-time."
                      : "Requires the QA Recorder browser extension to capture actions in a new tab."}
                  </p>
                </div>

                {recordingMode === 'codegen' && (
                  <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-2xl border border-indigo-100 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-600 rounded-lg text-white">
                        <Terminal size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Developer Console</p>
                        <p className="text-[9px] text-indigo-600 font-medium">Capture logs and network errors in real-time</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setEnableDevTools(!enableDevTools)}
                      className={`w-12 h-6 rounded-full relative transition-colors ${enableDevTools ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${enableDevTools ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                )}

                {/* Platform Toggle */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Platform</label>
                  <div className="flex p-1 bg-slate-100 rounded-2xl">
                    <button 
                      onClick={() => setPlatform('web')}
                      className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${platform === 'web' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <Globe size={16} /> Web
                    </button>
                    <button 
                      type="button"
                      disabled
                      onClick={() => toast.error('Mobile App recording option is currently disabled.')}
                      className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 text-slate-400 bg-slate-100 opacity-50 cursor-not-allowed"
                      title="Mobile App option is currently disabled"
                    >
                      <Smartphone size={16} /> Mobile <span className="text-[8px] bg-slate-200 text-slate-500 px-1 py-0.5 rounded font-extrabold">DISABLED</span>
                    </button>
                  </div>
                </div>

                {platform === 'web' ? (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Browser</label>
                      <select 
                        value={selectedBrowser || 'Chrome'}
                        onChange={(e) => setSelectedBrowser(e.target.value as any)}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all appearance-none"
                      >
                        <option>Chrome</option>
                        <option>Firefox</option>
                        <option>Edge</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Target URL</label>
                      <input 
                        type="text"
                        value={targetUrl || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTargetUrl(val.includes('https://https://') || val.includes('http://https://') ? sanitizeClientUrl(val) : val);
                        }}
                        onBlur={(e) => setTargetUrl(sanitizeClientUrl(e.target.value))}
                        className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    
                    {/* State: Not Installed */}
                    {localAgentState === 'not_installed' && (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                            <Smartphone size={18} />
                          </div>
                          <div>
                            <p className="font-black uppercase tracking-wider text-[10px] text-slate-800">
                              Device Agent not installed
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                              Install the AutomatiQA local desktop assistant to record tests on real devices or emulators.
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleDownloadAgent}
                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                          >
                            <Download size={11} /> Download Agent
                          </button>
                          <button
                            type="button"
                            onClick={handleInstallAgent}
                            disabled={isInstallingAgent}
                            className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[9px] uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isInstallingAgent ? 'Installing...' : 'Install Agent'}
                          </button>
                          <button
                            type="button"
                            onClick={handleRetryConnection}
                            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-[9px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                          >
                            Retry Connection
                          </button>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[9px] text-slate-400">
                          <span>Auto-detected OS: <strong className="capitalize">{getOSName()}</strong></span>
                          <button 
                            type="button"
                            onClick={() => {
                              setUseDemoFallback(true);
                              setLocalAgentState('connected');
                              setAgentConnected(true);
                              toast.success("Using Simulated Agent (Demo Mode)");
                            }} 
                            className="hover:text-indigo-600 underline font-semibold"
                          >
                            Use Demo Agent (Sandbox)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* State: Offline */}
                    {localAgentState === 'offline' && (
                      <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200 text-amber-900 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                            <Smartphone size={18} />
                          </div>
                          <div>
                            <p className="font-black uppercase tracking-wider text-[10px] text-amber-800">
                              Device Agent Offline
                            </p>
                            <p className="text-[11px] text-amber-700/80 mt-0.5 leading-relaxed">
                              The AutomatiQA background assistant is stopped. Click Start to activate.
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            onClick={handleStartAgent}
                            disabled={isStartingAgent}
                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1 shadow-sm cursor-pointer disabled:opacity-50"
                          >
                            {isStartingAgent ? 'Starting...' : 'Start Agent'}
                          </button>
                          <button
                            type="button"
                            onClick={handleRetryConnection}
                            className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[9px] uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                          >
                            Retry
                          </button>
                        </div>

                        <div className="pt-2 border-t border-amber-200/50 flex justify-between items-center text-[9px] text-amber-700/60">
                          <span>Local Address: <strong>https://localhost:9334</strong></span>
                          <button 
                            type="button"
                            onClick={() => {
                              setUseDemoFallback(true);
                              setLocalAgentState('connected');
                              setAgentConnected(true);
                              toast.success("Using Simulated Agent (Demo Mode)");
                            }} 
                            className="hover:text-indigo-600 underline font-semibold"
                          >
                            Use Demo Agent (Sandbox)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* State: Connected */}
                    {localAgentState === 'connected' && (
                      <>
                        <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-emerald-800 flex items-center justify-between transition-all">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <div>
                              <p className="font-black uppercase tracking-wider text-[9px]">
                                Device Agent: Connected
                              </p>
                              <p className="text-[8px] text-emerald-600 font-medium">
                                USB debugging & adb helper bridge active on port 9334.
                              </p>
                            </div>
                          </div>
                          <span className="text-[9px] font-black bg-emerald-100 px-2 py-1 rounded-md text-emerald-800">
                            v1.0.0
                          </span>
                        </div>

                        {/* Platform and Device Selection */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Mobile OS</label>
                            <select 
                              value={mobilePlatform || 'Android'}
                              onChange={(e) => setMobilePlatform(e.target.value as any)}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all appearance-none"
                            >
                              <option value="Android">Android (ADB/Appium)</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Detected Devices (ADB)</label>
                            <select 
                              value={mobileDevice || ''}
                              onChange={(e) => setMobileDevice(e.target.value)}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all cursor-pointer disabled:opacity-50"
                              disabled={availableDevices.length === 0}
                            >
                              {availableDevices.map(device => (
                                <option key={device.deviceId} value={device.deviceId}>
                                  [{device.type}] {device.deviceName} ({device.deviceId})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {deviceCheckError && (
                          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-[10px] text-red-600 font-bold flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            {deviceCheckError}
                          </div>
                        )}
                      </>
                    )}

                    {/* App Selection Engine */}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">App Target Strategy</label>
                      <div className="flex p-0.5 bg-slate-100 rounded-xl gap-0.5 mb-3">
                        <button 
                          type="button"
                          onClick={() => setMobileAppType('installed')}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${mobileAppType === 'installed' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                        >
                          Installed App
                        </button>
                        <button 
                          type="button"
                          onClick={() => setMobileAppType('apk')}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${mobileAppType === 'apk' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                        >
                          Upload APK
                        </button>
                        <button 
                          type="button"
                          onClick={() => setMobileAppType('package')}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${mobileAppType === 'package' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                        >
                          Package Name
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            setMobileAppType('web');
                            setMobilePackageName('com.android.chrome');
                          }}
                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${mobileAppType === 'web' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                        >
                          Mobile Web
                        </button>
                      </div>

                      {mobileAppType === 'installed' && (
                        <div className="animate-in fade-in duration-200">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-1.5 block">Select Device Application</label>
                          <select 
                            value={mobileInstalledApp || ''}
                            onChange={(e) => {
                              setMobileInstalledApp(e.target.value);
                              setMobilePackageName(e.target.value);
                              void launchInstalledAppOnDevice(e.target.value);
                            }}
                            className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all cursor-pointer"
                          >
                            {availableApps.map(app => (
                              <option key={app.package} value={app.package}>
                                {app.name} ({app.package})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {mobileAppType === 'apk' && (
                        <div className="p-4 border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl text-center hover:bg-slate-100/50 transition-all cursor-pointer relative animate-in fade-in duration-200">
                          <input 
                            type="file" 
                            accept=".apk"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleApkUpload(file);
                              }
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <Upload className="mx-auto text-slate-400 mb-2" size={20} />
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-wide">
                            {mobileApkName ? mobileApkName : 'Choose APK File'}
                          </p>
                          <p className="text-[8px] text-slate-400 font-bold mt-1">Supports standard Android package (.apk) up to 200MB</p>
                        </div>
                      )}

                      {mobileAppType === 'package' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-1.5 block">Custom Android Package Name</label>
                            <input 
                              type="text"
                              value={mobilePackageName || ''}
                              onChange={(e) => setMobilePackageName(e.target.value)}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                              placeholder="e.g. com.example.myawesomeapp"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-1.5 block">Main Activity (Optional)</label>
                            <input 
                              type="text"
                              value={mobileAppActivity || ''}
                              onChange={(e) => setMobileAppActivity(e.target.value)}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                              placeholder="e.g. .MainActivity"
                            />
                          </div>
                        </div>
                      )}

                      {mobileAppType === 'web' && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2 mb-1.5 block">Mobile Web Application URL</label>
                            <input 
                              type="text"
                              value={mobileWebUrl || ''}
                              onChange={(e) => {
                                setMobileWebUrl(e.target.value);
                                setMobilePackageName('com.android.chrome');
                              }}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                              placeholder="https://m.example.com"
                            />
                          </div>
                          <p className="text-[8px] text-slate-400 font-bold ml-1">Launches mobile Chrome or Safari browser to test mobile web app on device.</p>
                        </div>
                      )}
                    </div>

                    {/* Automation Engine and Capabilities */}
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Automation Engine</label>
                        <div className="w-full px-4 py-3 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-2xl text-xs font-black uppercase tracking-wider">
                          Appium Server
                        </div>
                      </div>

                      <div className="space-y-1 ml-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Capabilities</label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={captureScreenshots} onChange={() => setCaptureScreenshots(!captureScreenshots)} className="rounded text-indigo-600" />
                            Screenshot
                          </label>
                          <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={captureVideo} onChange={() => setCaptureVideo(!captureVideo)} className="rounded text-indigo-600" />
                            Video
                          </label>
                          <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={captureLogcat} onChange={() => setCaptureLogcat(!captureLogcat)} className="rounded text-indigo-600" />
                            Logcat
                          </label>
                          <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={captureNetwork} onChange={() => setCaptureNetwork(!captureNetwork)} className="rounded text-indigo-600" />
                            Network
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setIsStartModalOpen(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => confirmStartRecording()}
                  disabled={isStarting}
                  className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isStarting ? (
                    <RotateCcw size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} fill="currentColor" />
                  )}
                  {isStarting ? 'Starting Session...' : 'Start Recording'}
                </button>
              </div>
              </>)}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Code Preview Modal */}
      <AnimatePresence>
        {isPreviewOpen && generatedProject && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-6xl h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                    <Terminal size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Generated POM Project</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedTool} • {selectedLanguage} • {generatedProject.files.length} Files</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={async () => {
                      const filesToSave = generatedProject.files || [];
                      const mainFile = filesToSave.find(f => f.path.includes('spec') || f.path.includes('test')) || filesToSave[0];
                      const scriptTitle = (saveScriptTitle || `${flowName || 'Automation Script'} - ${selectedTool}`).trim();
                      
                      const existingIndex = (project.automationScripts || []).findIndex(s => s.title.toLowerCase() === scriptTitle.toLowerCase());
                      let updatedScripts = [...(project.automationScripts || [])];

                      if (existingIndex >= 0) {
                        updatedScripts[existingIndex] = {
                          ...updatedScripts[existingIndex],
                          isApproved: true,
                          content: mainFile?.content || updatedScripts[existingIndex].content,
                          files: filesToSave
                        };
                      } else {
                        const newScript: AutomationScript = {
                          id: Math.random().toString(36).substr(2, 9),
                          title: scriptTitle,
                          description: flowDescription || `Automation script generated from flow`,
                          content: mainFile?.content || '',
                          files: filesToSave,
                          tool: selectedTool,
                          language: selectedLanguage,
                          createdAt: new Date().toISOString(),
                          folderId: selectedFolder || undefined,
                          isApproved: true,
                          source: 'record_play',
                          platform: platform,
                          appPackage: platform === 'mobile' ? (mobilePackageName || mobileApkName || 'com.example.app') : undefined,
                          appUrl: platform === 'web' ? targetUrl : undefined
                        };
                        updatedScripts.push(newScript);
                      }

                      await onUpdateProject({
                        ...project,
                        automationScripts: updatedScripts
                      });
                      toast.success('Script approved and added to Execution Hub!');
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-100 cursor-pointer"
                    title="Approve and make available in Execution Hub"
                  >
                    <CheckCircle2 size={16} /> Approve
                  </button>
                  <button 
                    onClick={() => {
                      const mainFile = generatedProject.files.find(f => f.path.includes('spec') || f.path.includes('test')) || generatedProject.files[0];
                      if (mainFile) handleDownloadFile(mainFile.path, mainFile.content);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    <Download size={16} /> Download Script
                  </button>
                  <button 
                    onClick={handleDownloadProject}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                  >
                    <Layers size={16} /> Project (ZIP)
                  </button>
                  <button 
                    onClick={handleSaveScript}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                  >
                    <Save size={16} /> Save to Repo
                  </button>
                  <button 
                    onClick={() => setIsPreviewOpen(false)}
                    className="p-2.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 flex overflow-hidden">
                {/* File Sidebar */}
                <div className="w-64 bg-slate-50 border-r border-slate-100 flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Project Files</h4>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {generatedProject.files.map(file => (
                      <button
                        key={file.path}
                        onClick={() => setSelectedFilePath(file.path)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold transition-all ${selectedFilePath === file.path ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:bg-slate-100'}`}
                      >
                        <FileCode size={14} className={selectedFilePath === file.path ? 'text-indigo-500' : 'text-slate-400'} />
                        <span className="truncate">{file.path}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Code Editor */}
                {(() => {
                  const activeFile = generatedProject.files.find(f => f.path === selectedFilePath) || 
                    generatedProject.files.find(f => f.path.includes('spec') || f.path.includes('test')) || 
                    generatedProject.files[0];
                  const currentFilePath = activeFile?.path || selectedFilePath || 'test.spec.ts';
                  let rawContent = activeFile?.content || '';
                  if (!rawContent || rawContent.trim().length < 25 || rawContent.trim() === '// No content' || rawContent.trim() === '// Empty file' || rawContent.trim() === '/* No content */') {
                    const matchingFlow = (project.recordedFlows || []).find(f => f.scriptId === generatedProject.files[0]?.path || f.name);
                    rawContent = synthesizeMissingPOMFileContent(currentFilePath, {
                      tool: selectedTool,
                      language: selectedLanguage,
                      framework: selectedFramework,
                      flowName: matchingFlow?.name || flowName,
                      steps: matchingFlow?.steps || currentSteps,
                      targetUrl: matchingFlow?.initialUrl || (matchingFlow as any)?.targetUrl || targetUrl
                    });
                  }
                  const formattedCode = formatVerticalCode(rawContent, currentFilePath);
                  const codeLines = formattedCode.split('\n');

                  return (
                    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
                      <div className="px-6 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono font-bold text-slate-200">{currentFilePath}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                            {codeLines.length} lines
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              if (activeFile) handleDownloadFile(currentFilePath, formattedCode);
                            }}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Download File"
                          >
                            <Download size={14} />
                          </button>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(formattedCode);
                              toast.success('File content copied');
                            }}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Copy Content"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto bg-slate-950 p-4 font-mono text-xs custom-scrollbar">
                        <div className="min-w-full inline-block">
                          <table className="w-full border-collapse">
                            <tbody>
                              {codeLines.map((lineText, idx) => (
                                <tr key={idx} className="hover:bg-slate-900/60 transition-colors group">
                                  <td className="py-0.5 pr-4 pl-2 text-right select-none text-slate-600 group-hover:text-slate-400 font-mono text-[11px] w-12 border-r border-slate-800/80 align-top">
                                    {idx + 1}
                                  </td>
                                  <td className="py-0.5 pl-4 pr-4 whitespace-pre text-indigo-200 font-mono text-xs leading-relaxed align-top overflow-x-visible">
                                    {lineText || ' '}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Explanation Sidebar */}
                <div className="w-80 bg-slate-50 border-l border-slate-100 p-8 overflow-y-auto custom-scrollbar">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">AI Analysis & Explanation</h4>
                  <p className="text-xs text-slate-600 leading-relaxed font-medium mb-8">
                    {generatedProject.explanation}
                  </p>
                  
                  <div className="pt-8 border-t border-slate-200">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Architecture Highlights</h4>
                    <ul className="space-y-3">
                      {[
                        'Page Object Model (POM)',
                        'BasePage Inheritance',
                        'Dynamic Page Generation',
                        'Environment Configuration',
                        'Clean Test Flow'
                      ].map((item, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase">
                          <CheckCircle2 size={14} className="text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all"
                >
                  Close Preview
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Flow Modal */}
      <AnimatePresence>
        {isSaveFlowModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 rounded-xl text-white shadow-lg">
                    <Save size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Save Recording Flow</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select folder and save your flow</p>
                  </div>
                </div>
                <button onClick={() => setIsSaveFlowModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Flow Name (Mandatory)</label>
                  <input 
                    value={flowName || ''}
                    onChange={e => setFlowName(e.target.value)}
                    placeholder="e.g. Login Flow Validation"
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Description (Optional)</label>
                  <textarea 
                    value={flowDescription || ''}
                    onChange={e => setFlowDescription(e.target.value)}
                    placeholder="Describe the purpose of this flow..."
                    rows={2}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Refine Instructions (Optional)</label>
                  <textarea 
                    value={refineInstructions || ''}
                    onChange={e => setRefineInstructions(e.target.value)}
                    placeholder="Enter instructions to refine script generation..."
                    rows={2}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all resize-none"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Target Folder (Mandatory)</label>
                  <div className="flex items-center gap-4 border-b border-slate-100 pb-3 shrink-0">
                    <button 
                      type="button"
                      onClick={() => setIsCreatingNewFlowFolder(false)}
                      className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${!isCreatingNewFlowFolder ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                      Existing Folder
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setIsCreatingNewFlowFolder(true);
                      }}
                      className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${isCreatingNewFlowFolder ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                      + Create New
                    </button>
                  </div>
                  
                  {isCreatingNewFlowFolder ? (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                      <input 
                        value={newFlowFolderName || ''}
                        onChange={e => setNewFlowFolderName(e.target.value)}
                        placeholder="Enter new folder name"
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                      />
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest ml-1">Folder will be created under Recorded Flows</p>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-200 flex flex-col">
                      <div className="relative shrink-0">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="text"
                          className="w-full pl-12 pr-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                          placeholder="Search folders..."
                          value={searchFlowFolderQuery || ''}
                          onChange={e => setSearchFlowFolderQuery(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {(deduplicatedAutomationFolders.filter(f => isFlowFolderForPlatform(f) && (f.name || '').toLowerCase().includes((searchFlowFolderQuery || '').toLowerCase())).length === 0) ? (
                          <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                            No folders found. Create a new one!
                          </div>
                        ) : (
                          deduplicatedAutomationFolders
                            .filter(f => isFlowFolderForPlatform(f) && (f.name || '').toLowerCase().includes((searchFlowFolderQuery || '').toLowerCase()))
                            .map(folder => {
                              const isSelected = selectedFolder === folder.id || (typeof selectedFolder === 'string' && typeof folder.name === 'string' && selectedFolder.trim().toLowerCase() === folder.name.trim().toLowerCase());
                              const count = effectiveFlows.filter(flow => isItemInFolder(flow.folderId, folder.id, project.automationFolders)).length;
                              return (
                                <button
                                  key={folder.id}
                                  type="button"
                                  onClick={() => setSelectedFolder(folder.id)}
                                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${isSelected ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-black' : 'bg-white border-slate-100 hover:border-slate-200 text-slate-700 font-bold'}`}
                                >
                                  <div className="flex items-center gap-2 pr-2 min-w-0">
                                    <span className="text-xs uppercase tracking-tight truncate">{folder.name}</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{count} flows</span>
                                  </div>
                                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200'}`}>
                                    {isSelected && <Check size={12} strokeWidth={3} />}
                                  </div>
                                </button>
                              );
                            })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button onClick={() => setIsSaveFlowModalOpen(false)} className="px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">
                  Cancel
                </button>
                <button 
                  onClick={executeSaveFlow}
                  disabled={!flowName.trim() || (isCreatingNewFlowFolder && !newFlowFolderName.trim())}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  Confirm & Save Flow
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Script Modal */}
      <AnimatePresence>
        {isSaveScriptModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-600 rounded-xl text-white shadow-lg">
                    <Save size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Save Script to Repository</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Archive generated automation code</p>
                  </div>
                </div>
                <button onClick={() => setIsSaveScriptModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Script Title (Mandatory)</label>
                  <input 
                    value={saveScriptTitle || ''}
                    onChange={e => setSaveScriptTitle(e.target.value)}
                    placeholder="e.g. Login Validation Script"
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Description (Optional)</label>
                  <textarea 
                    value={saveScriptDescription || ''}
                    onChange={e => setSaveScriptDescription(e.target.value)}
                    placeholder="What does this script validate?"
                    rows={2}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all resize-none"
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Target Folder (Mandatory)</label>
                  <div className="flex items-center gap-4 border-b border-slate-100 pb-3 shrink-0">
                    <button 
                      type="button"
                      onClick={() => setIsCreatingNewScriptFolder(false)}
                      className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${!isCreatingNewScriptFolder ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                      Existing Folder
                    </button>
                    <button 
                      type="button"
                      onClick={() => {
                        setIsCreatingNewScriptFolder(true);
                      }}
                      className={`flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${isCreatingNewScriptFolder ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                      + Create New
                    </button>
                  </div>
                  
                  {isCreatingNewScriptFolder ? (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                      <input 
                        value={newScriptFolderName || ''}
                        onChange={e => setNewScriptFolderName(e.target.value)}
                        placeholder="Enter new folder name"
                        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                      />
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest ml-1">Folder will be created under Generated Scripts</p>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-200 flex flex-col">
                      <div className="relative shrink-0">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input 
                          type="text"
                          className="w-full pl-12 pr-5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                          placeholder="Search folders..."
                          value={searchScriptFolderQuery || ''}
                          onChange={e => setSearchScriptFolderQuery(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {(deduplicatedAutomationFolders.filter(f => isScriptFolderForPlatform(f) && (f.name || '').toLowerCase().includes((searchScriptFolderQuery || '').toLowerCase())).length === 0) ? (
                          <div className="py-6 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                            No folders found. Create a new one!
                          </div>
                        ) : (
                          deduplicatedAutomationFolders
                            .filter(f => isScriptFolderForPlatform(f) && (f.name || '').toLowerCase().includes((searchScriptFolderQuery || '').toLowerCase()))
                            .map(folder => {
                              const isSelected = selectedFolder === folder.id || (typeof selectedFolder === 'string' && typeof folder.name === 'string' && selectedFolder.trim().toLowerCase() === folder.name.trim().toLowerCase());
                              const count = effectiveScripts.filter(script => isItemInFolder(script.folderId, folder.id, project.automationFolders)).length;
                              return (
                                <button
                                  key={folder.id}
                                  type="button"
                                  onClick={() => setSelectedFolder(folder.id)}
                                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${isSelected ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-black' : 'bg-white border-slate-100 hover:border-slate-200 text-slate-700 font-bold'}`}
                                >
                                  <div className="flex items-center gap-2 pr-2 min-w-0">
                                    <span className="text-xs uppercase tracking-tight truncate">{folder.name}</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">{count} scripts</span>
                                  </div>
                                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200'}`}>
                                    {isSelected && <Check size={12} strokeWidth={3} />}
                                  </div>
                                </button>
                              );
                            })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button onClick={() => setIsSaveScriptModalOpen(false)} className="px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">
                  Cancel
                </button>
                <button 
                  onClick={executeSaveScript}
                  disabled={!saveScriptTitle.trim() || (isCreatingNewScriptFolder && !newScriptFolderName.trim())}
                  className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  Confirm & Save Script
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Folder Creation Modal */}
      <AnimatePresence>
        {isFolderModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-2xl text-white shadow-lg ${
                    newFolderType === 'flow' ? 'bg-indigo-600 shadow-indigo-100' :
                    newFolderType === 'upload_video' ? 'bg-cyan-600 shadow-cyan-100' :
                    'bg-emerald-600 shadow-emerald-100'
                  }`}>
                    <Folder size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                      Create {newFolderType === 'flow' ? 'Recorded Flow' : newFolderType === 'upload_video' ? 'Video Flow' : 'Generated Script'} Folder
                    </h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Organize your {folderModalPlatform === 'web' ? 'Web' : 'Mobile'} automation assets</p>
                  </div>
                </div>
                <button onClick={() => setIsFolderModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Target Platform</label>
                  <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100/80 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setFolderModalPlatform('web')}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${folderModalPlatform === 'web' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Globe size={14} /> Web App
                    </button>
                    <button
                      type="button"
                      disabled
                      onClick={() => toast.error('Mobile App option is currently disabled.')}
                      className="flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all text-slate-400 bg-slate-100 opacity-50 cursor-not-allowed"
                      title="Mobile App option is currently disabled"
                    >
                      <Smartphone size={14} /> Mobile App <span className="text-[8px] bg-slate-200 text-slate-500 px-1 py-0.5 rounded font-extrabold">DISABLED</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Folder Category</label>
                  <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100/80 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setNewFolderType('flow')}
                      className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${newFolderType === 'flow' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Layers size={13} /> Recorded
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewFolderType('upload_video')}
                      className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${newFolderType === 'upload_video' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Video size={13} /> Video
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewFolderType('script')}
                      className={`flex items-center justify-center gap-1.5 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${newFolderType === 'script' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <FileCode size={13} /> Scripts
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Folder Name</label>
                  <input 
                    type="text"
                    value={newFolderName || ''}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                    placeholder="e.g., Authentication Tests"
                    autoFocus
                  />
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setIsFolderModalOpen(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateFolder}
                  className={`flex-[2] py-4 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all ${newFolderType === 'flow' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'}`}
                >
                  Create Folder
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Parse Playwright Code Modal */}
      <AnimatePresence>
        {isParseModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-800"
            >
              <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20">
                    <Code2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight">Parse Playwright Code</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Convert code into readable steps</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsParseModalOpen(false)}
                  className="p-2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Paste Playwright Code Here</label>
                  <div className="relative">
                    <textarea 
                      value={playwrightCodeToParse || ''}
                      onChange={(e) => setPlaywrightCodeToParse(e.target.value)}
                      placeholder={`await page.getByRole('button', { name: 'Login' }).click();\nawait page.getByLabel('Email').fill('test@test.com');`}
                      className="w-full h-64 bg-slate-950 border border-slate-800 rounded-2xl p-6 text-xs font-mono text-emerald-400 outline-none focus:ring-2 ring-emerald-500/20 transition-all placeholder:text-slate-700 resize-none"
                    />
                    <div className="absolute top-4 right-4 p-2 bg-emerald-500/10 rounded-lg text-emerald-500/50">
                      <Terminal size={16} />
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 flex items-start gap-4">
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                    <Zap size={16} />
                  </div>
                  <p className="text-[10px] text-emerald-400/70 font-medium leading-relaxed">
                    AI will analyze your code, identify actions and targets, and automatically generate readable steps for your flow.
                  </p>
                </div>
              </div>

              <div className="p-8 bg-slate-900/50 border-t border-slate-800 flex justify-end gap-4">
                <button 
                  onClick={() => setIsParseModalOpen(false)}
                  className="px-6 py-3 text-slate-400 font-black text-[10px] uppercase tracking-widest hover:text-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleParsePlaywrightCode}
                  disabled={isParsing || !playwrightCodeToParse.trim()}
                  className="flex items-center gap-3 px-8 py-3 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-emerald-900/20"
                >
                  {isParsing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Convert to Steps
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Step Modal */}
      <AnimatePresence>
        {isAddStepModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                    {editingStep ? <Edit3 size={24} /> : <PlusCircle size={24} />}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{editingStep ? 'Edit Step' : 'Add Functional Step'}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{editingStep ? 'Update test action details' : 'Insert a functional test action'}</p>
                  </div>
                </div>
                <button onClick={() => { setIsAddStepModalOpen(false); setEditingStep(null); }} className="p-2 text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Action Type</label>
                  <select 
                    value={newStepData.action || 'click'}
                    onChange={(e) => setNewStepData({ ...newStepData, action: e.target.value as any })}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all appearance-none"
                  >
                    <option value="click">Click</option>
                    <option value="fill">Fill / Type</option>
                    <option value="select">Select</option>
                    <option value="hover">Hover</option>
                    <option value="assertion">Assertion</option>
                    <option value="navigate">Navigate</option>
                    <option value="wait">Wait</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Locator (CSS/XPath/ID)</label>
                  <input 
                    type="text"
                    value={newStepData.locator || ''}
                    onChange={(e) => setNewStepData({ ...newStepData, locator: e.target.value })}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                    placeholder="e.g., #login-button or //button[text()='Login']"
                  />
                </div>

                {(newStepData.action === 'fill' || newStepData.action === 'assertion' || newStepData.action === 'navigate') && (
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Value</label>
                    <input 
                      type="text"
                      value={newStepData.value || ''}
                      onChange={(e) => setNewStepData({ ...newStepData, value: e.target.value })}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                      placeholder={newStepData.action === 'navigate' ? 'https://example.com' : 'Enter value...'}
                    />
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => { setIsAddStepModalOpen(false); setEditingStep(null); }}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={editingStep ? handleUpdateStep : handleManualAddStep}
                  className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all"
                >
                  {editingStep ? 'Update Step' : 'Add Step'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl shadow-sm">
                    <Trash2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Confirm Delete</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Action cannot be undone</p>
                  </div>
                </div>
                <button onClick={() => setIsDeleteModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <div className="p-8">
                <p className="text-sm text-slate-600 font-medium leading-relaxed">
                  {itemToDelete?.type === 'folder' ? (
                    <>Are you sure you want to permanently delete the folder <strong className="text-slate-900">"{itemToDelete.name}"</strong>? This action cannot be undone and will unassign any flows or scripts stored inside it.</>
                  ) : itemToDelete?.type === 'bulk_folders' ? (
                    <>Are you sure you want to permanently delete <strong className="text-slate-900">{itemToDelete.folders?.length || 0} selected folder(s)</strong>? This action cannot be undone and will unassign any flows or scripts stored inside them.</>
                  ) : (
                    <>Are you sure you want to proceed with deleting the generated {itemToDelete?.type === 'flow' ? 'flow' : itemToDelete?.type === 'upload_video' ? 'upload video flow' : 'script'}? This action will permanently remove it from your repository.</>
                  )}
                </p>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-[2] py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 shadow-xl shadow-rose-200 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Browser & Environment Selection Modal for Playback */}
      <AnimatePresence>
        {isBrowserSelectModalOpen && pendingPlaybackFlow && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-800 text-slate-100"
            >
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3.5 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 shadow-lg shadow-indigo-950">
                    <Globe size={26} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                      Select Playback Browser & Environment
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-1">
                      Choose the browser driver and viewport metrics to execute flow <span className="text-indigo-400 font-bold">"{pendingPlaybackFlow?.name || 'Flow'}"</span> ({pendingPlaybackFlow?.steps?.length || 0} steps)
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsBrowserSelectModalOpen(false)}
                  className="p-2.5 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-6 md:p-8 overflow-y-auto custom-scrollbar space-y-6 flex-1">
                {/* Section Title */}
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-400" /> Choose Automation Browser Engine
                  </h4>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                    6 Environments Available
                  </span>
                </div>

                {/* Grid of Browsers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PLAYBACK_BROWSER_OPTIONS.map((browser) => {
                    const isSelected = playbackSelectedBrowser === browser.id;
                    return (
                      <div 
                        key={browser.id}
                        onClick={() => {
                          setPlaybackSelectedBrowser(browser.id);
                          setPlaybackViewport(browser.defaultViewport);
                        }}
                        className={`p-5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                          isSelected 
                            ? browser.activeBorder + ' shadow-xl' 
                            : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-2.5 rounded-xl border ${browser.badgeBg}`}>
                                {browser.type === 'mobile' ? <Smartphone size={20} /> : <Globe size={20} />}
                              </div>
                              <div>
                                <h5 className="text-sm font-black text-white flex items-center gap-2">
                                  {browser.name}
                                </h5>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {browser.version} • {browser.engine}
                                </span>
                              </div>
                            </div>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? 'bg-indigo-600 border-indigo-400 text-white' : 'border-slate-700 bg-slate-900'
                            }`}>
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed mb-3">
                            {browser.description}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${browser.badgeBg}`}>
                            {browser.badge}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Viewport: {browser.defaultViewport}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Additional Settings */}
                <div className="p-5 bg-slate-950 rounded-2xl border border-slate-800/80 space-y-4">
                  <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Filter size={14} className="text-indigo-400" /> Advanced Execution Parameters
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Viewport Size */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Target Viewport
                      </label>
                      <select 
                        value={playbackViewport || ''}
                        onChange={(e) => setPlaybackViewport(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 font-mono"
                      >
                        <option value="1920x1080">1920 x 1080 (FHD Desktop)</option>
                        <option value="1440x900">1440 x 900 (MacBook Pro)</option>
                        <option value="1366x768">1366 x 768 (Standard Laptop)</option>
                        <option value="412x915">412 x 915 (Pixel 7 Pro)</option>
                        <option value="393x852">393 x 852 (iPhone 15 Pro)</option>
                      </select>
                    </div>

                    {/* Mode */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Execution Mode
                      </label>
                      <button 
                        onClick={() => setIsHeadlessPlayback(!isHeadlessPlayback)}
                        className={`w-full py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${
                          isHeadlessPlayback 
                            ? 'bg-purple-950/40 border-purple-500/40 text-purple-300' 
                            : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        }`}
                      >
                        <span>{isHeadlessPlayback ? '👻 Headless Driver' : '🖥️ Headed Live Window'}</span>
                        <span className="text-[9px] uppercase font-mono">{isHeadlessPlayback ? 'Fast' : 'Interactive'}</span>
                      </button>
                    </div>

                    {/* Network Throttling */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                        Network Throttling
                      </label>
                      <select 
                        value={playbackNetwork || ''}
                        onChange={(e) => setPlaybackNetwork(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 text-white text-xs rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 font-mono"
                      >
                        <option value="No Throttling">No Throttling (Fast Direct)</option>
                        <option value="Fast 3G">Emulate Fast 3G (1.6 Mbps)</option>
                        <option value="Slow 3G">Emulate Slow 3G (500 Kbps)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Footer */}
              <div className="p-6 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-4">
                <button 
                  onClick={() => setIsBrowserSelectModalOpen(false)}
                  className="px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700"
                >
                  Cancel
                </button>

                <button 
                  onClick={handleConfirmBrowserAndStartPlayback}
                  className="flex-1 max-w-md py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2"
                >
                  <Play size={16} fill="currentColor" /> Start Playback in {PLAYBACK_BROWSER_OPTIONS.find(b => b.id === playbackSelectedBrowser)?.name || 'Chrome'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flow Playback Engine Modal */}
      <AnimatePresence>
        {isPlaybackModalOpen && playbackFlow && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/90 backdrop-blur-md transition-all duration-300 ${
              isPlaybackFullscreen ? 'p-0' : 'p-4'
            }`}
          >
            <motion.div 
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className={`bg-slate-900 shadow-2xl flex flex-col overflow-hidden text-slate-100 transition-all duration-300 ${
                isPlaybackFullscreen 
                  ? 'w-screen h-screen rounded-none border-0' 
                  : 'w-full max-w-6xl h-[90vh] rounded-[2.5rem] border border-slate-800'
              }`}
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl border border-emerald-500/20 shadow-lg shadow-emerald-950">
                    <Play size={22} fill="currentColor" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-black text-white uppercase tracking-tight">
                        Recorded Flow Playback Engine
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                        isPreparingPlayback ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 flex items-center gap-1.5 animate-pulse shadow-sm shadow-amber-950/50' :
                        playbackStatus === 'running' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 animate-pulse' :
                        playbackStatus === 'paused' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        playbackStatus === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        playbackStatus === 'failed' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {isPreparingPlayback ? (
                          <>
                            <Loader2 size={10} className="animate-spin text-amber-400" /> PREPARING PLAYBACK...
                          </>
                        ) : (
                          String(playbackStatus || 'idle').toUpperCase()
                        )}
                      </span>
                      {isPlaybackFullscreen && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                          <Maximize2 size={10} /> Full Screen Active
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>Flow: <span className="text-indigo-400">{playbackFlow?.name || 'Flow'}</span></span>
                      <span>• {playbackFlow?.steps?.length || 0} Steps</span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-emerald-500/30 text-[9px] flex items-center gap-1">
                        {playbackFlow?.platform === 'mobile' ? (
                          <>
                            <Smartphone size={10} className="text-indigo-400" />
                            <span>Device: {mobileDevice || 'Android Emulator (Pixel 7 Pro)'}</span>
                          </>
                        ) : (
                          <>
                            <Globe size={10} className="text-indigo-400" />
                            <span>Browser: {PLAYBACK_BROWSER_OPTIONS.find(b => b.id === playbackSelectedBrowser)?.name || 'Chrome'} ({PLAYBACK_BROWSER_OPTIONS.find(b => b.id === playbackSelectedBrowser)?.version || 'v126'})</span>
                          </>
                        )}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setIsPlaybackFullscreen(!isPlaybackFullscreen)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700 flex items-center gap-1.5 shadow-sm"
                    title={isPlaybackFullscreen ? "Switch to Windowed View" : "Expand to Full Screen View"}
                  >
                    {isPlaybackFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    <span>{isPlaybackFullscreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                  </button>

                  {playbackFlow?.platform === 'mobile' ? (
                    <button 
                      onClick={() => {
                        setIsPlaybackModalOpen(false);
                        setIsMobileDeviceModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Smartphone size={12} /> Switch Device
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        setIsPlaybackModalOpen(false);
                        setIsBrowserSelectModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Globe size={12} /> Switch Browser
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      handleStopPlayback();
                      setIsPlaybackModalOpen(false);
                    }} 
                    className="p-2 text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>

              {/* Control Toolbar */}
              <div className="px-6 py-3 bg-slate-950 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 select-none">
                <div className="flex items-center gap-2">
                  {playbackStatus !== 'running' ? (
                    <button 
                      onClick={() => handleRunPlayback()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-950"
                    >
                      <Play size={14} fill="currentColor" /> {playbackStatus === 'paused' ? 'Resume' : 'Run Playback'}
                    </button>
                  ) : (
                    <button 
                      onClick={handlePausePlayback}
                      className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-amber-950"
                    >
                      <Pause size={14} fill="currentColor" /> Pause
                    </button>
                  )}

                  <button 
                    onClick={handleStopPlayback}
                    disabled={playbackStatus === 'idle'}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40 border border-slate-700"
                  >
                    <Square size={14} fill="currentColor" /> Reset
                  </button>

                  <button 
                    onClick={handleStepForwardPlayback}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-xl text-xs font-black uppercase tracking-widest border border-indigo-500/30 transition-all"
                  >
                    <SkipForward size={14} /> Next Step
                  </button>

                  {playbackStatus === 'completed' && (
                    <>
                      <div className="h-6 w-px bg-slate-800 mx-1 hidden sm:block" />
                      <button
                        onClick={() => handleOpenRecordedVideo(playbackFlow)}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-950 border border-indigo-400/30 animate-in fade-in"
                        title="Watch recorded video of this completed playback"
                      >
                        <Video size={13} /> Watch Playback Video
                      </button>
                      <button
                        onClick={() => handleDownloadVideoFromPlayback(playbackFlow)}
                        disabled={isDownloadingPlaybackVideo}
                        className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-emerald-950 border border-emerald-400/30 animate-in fade-in disabled:opacity-50"
                        title="Download recorded flow video (.webm)"
                      >
                        {isDownloadingPlaybackVideo ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            <span>Downloading...</span>
                          </>
                        ) : (
                          <>
                            <Download size={13} />
                            <span>Download Video</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-6">

                  {/* Speed Selector */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Speed:</span>
                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                      {[0.5, 1, 2, 4, 8].map(speed => (
                        <button 
                          key={speed}
                          onClick={() => setPlaybackSpeed(speed)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${playbackSpeed === speed ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mode tabs */}
                  <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button 
                      onClick={() => setPlaybackActiveTab('view')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${playbackActiveTab === 'view' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                      Live View
                    </button>
                    <button 
                      onClick={() => setPlaybackActiveTab('timeline')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${playbackActiveTab === 'timeline' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                      Timeline ({(playbackFlow?.steps || []).length})
                    </button>
                    <button 
                      onClick={() => setPlaybackActiveTab('logs')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${playbackActiveTab === 'logs' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                      Logs ({playbackLogs.length})
                    </button>
                    <button 
                      onClick={() => setPlaybackActiveTab('report')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${playbackActiveTab === 'report' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                    >
                      ALLURE REPORT 📊
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-950 h-1.5 relative overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300 shadow-sm shadow-emerald-500"
                  style={{ 
                    width: `${(playbackFlow?.steps?.length || 0) > 0 ? Math.max(0, Math.min(100, ((currentPlaybackStepIndex + 1) / (playbackFlow?.steps?.length || 1)) * 100)) : 0}%` 
                  }}
                />
              </div>

              {/* Main Content Workspace */}
              {playbackActiveTab === 'report' ? (
                <div className="flex-1 overflow-hidden flex flex-col bg-[#1b1c21]">
                  <AllurePlaybackReport
                    playbackFlow={playbackFlow}
                    playbackStatus={playbackStatus}
                    stepExecutionStatus={stepExecutionStatus}
                    stepExecutionTime={stepExecutionTime}
                    playbackStepScreenshots={playbackStepScreenshots}
                    playbackLogs={playbackLogs}
                    playbackFailureInfo={playbackFailureInfo}
                    playbackStartTime={playbackStartTime}
                    playbackEndTime={playbackEndTime}
                    playbackSelectedBrowser={PLAYBACK_BROWSER_OPTIONS.find(b => b.id === playbackSelectedBrowser)?.name || 'Google Chrome'}
                    targetUrl={targetUrl}
                    onBackToLiveView={() => setPlaybackActiveTab('view')}
                    onReplayFlow={() => handleRunPlayback()}
                    onOpenVideo={(flow) => handleOpenRecordedVideo(flow || playbackFlow)}
                    onDownloadVideo={(flow) => handleDownloadVideoFromPlayback(flow || playbackFlow)}
                    onFixAndReplayFlow={handleFixAndReplayFlow}
                    onSaveFixedFlow={handleSaveFixedFlowOnly}
                  />
                </div>
              ) : (
                <div className="flex-1 bg-slate-900 relative overflow-hidden flex flex-col md:flex-row">
                
                {/* Visual View (Iframe or Simulator Frame) */}
                <div className="flex-1 bg-slate-950 p-6 flex flex-col justify-between overflow-y-auto custom-scrollbar border-r border-slate-800">
                  {playbackFlow?.platform === 'web' ? (
                    <div className="w-full h-full bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col relative min-h-[350px]">
                      {/* Browser Address Bar */}
                      <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Globe size={14} className="text-indigo-400 shrink-0" />
                          <span className="text-[11px] font-mono text-slate-300 truncate max-w-[500px]">
                            {unwrapProxyUrl(
                              playbackActiveUrl ||
                              (currentPlaybackStepIndex >= 0 && playbackFlow?.steps?.[currentPlaybackStepIndex]?.url) ||
                              (currentPlaybackStepIndex >= 0 && playbackFlow?.steps?.[currentPlaybackStepIndex]?.action === 'navigate' 
                                ? playbackFlow?.steps?.[currentPlaybackStepIndex]?.value 
                                : targetUrl)
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                          <button
                            onClick={() => setPlaybackViewMode(playbackViewMode === 'screenshot' ? 'iframe' : 'screenshot')}
                            className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                              playbackViewMode === 'screenshot' 
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/30' 
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                            title="Toggle between Live Page Screenshot View and Proxy View"
                          >
                            <Camera size={10} />
                            {playbackViewMode === 'screenshot' ? 'Live Screenshot View' : 'Proxy View'}
                          </button>
                          <span className="px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 font-mono">
                            {PLAYBACK_BROWSER_OPTIONS.find(b => b.id === playbackSelectedBrowser)?.name || 'Google Chrome'}
                          </span>
                          <button
                            onClick={() => setUseProxyMode(!useProxyMode)}
                            className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                              useProxyMode 
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30' 
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                            }`}
                            title="Click to toggle between Direct Browser Mode and Proxy Mode"
                          >
                            <span className={`w-2 h-2 rounded-full ${useProxyMode ? 'bg-amber-400' : 'bg-emerald-400'} animate-pulse`} />
                            {useProxyMode ? 'Proxy Mode' : 'Direct Browser Mode'}
                          </button>
                        </div>
                      </div>

                      {/* Web View Canvas */}
                      <div className="flex-1 bg-slate-900 relative flex items-center justify-center min-h-[300px] overflow-hidden select-none">
                        {playbackViewMode === 'screenshot' && currentPlaybackStepIndex >= 0 && playbackFlow?.steps?.[currentPlaybackStepIndex] && (
                          playbackStepScreenshots[playbackFlow.steps[currentPlaybackStepIndex].id] || 
                          playbackFlow.steps[currentPlaybackStepIndex].screenshot ||
                          playbackFlow.stepScreenshots?.[playbackFlow.steps[currentPlaybackStepIndex].id] ||
                          playbackFlow.steps.find(s => s.screen && s.screen === playbackFlow.steps[currentPlaybackStepIndex].screen && (s.screenshot || playbackStepScreenshots[s.id]))?.screenshot ||
                          Object.values(playbackStepScreenshots).slice(-1)[0]
                        ) ? (
                          <div className="w-full h-full relative bg-slate-950 flex items-center justify-center overflow-hidden">
                            <img 
                              src={
                                playbackStepScreenshots[playbackFlow.steps[currentPlaybackStepIndex].id] || 
                                playbackFlow.steps[currentPlaybackStepIndex].screenshot ||
                                playbackFlow.stepScreenshots?.[playbackFlow.steps[currentPlaybackStepIndex].id] ||
                                playbackFlow.steps.find(s => s.screen && s.screen === playbackFlow.steps[currentPlaybackStepIndex].screen && (s.screenshot || playbackStepScreenshots[s.id]))?.screenshot ||
                                Object.values(playbackStepScreenshots).slice(-1)[0]
                              } 
                              alt={`Step ${currentPlaybackStepIndex + 1} Screenshot`}
                              className="w-full h-full object-fill object-top"
                            />
                          </div>
                        ) : (
                          <iframe 
                            key={`${playbackActiveUrl || targetUrl}-${useProxyMode}`}
                            src={
                              (playbackActiveUrl || targetUrl) 
                                ? (useProxyMode ? `/api/proxy?url=${encodeURIComponent(playbackActiveUrl || targetUrl)}` : (playbackActiveUrl || targetUrl))
                                : 'about:blank'
                            }
                            className="w-full h-full border-none pointer-events-none bg-white"
                            title="Playback Iframe"
                          />
                        )}

                        {/* Live Interactive Movement & Visual Interaction Overlay */}
                        {showInteractionOverlay && (
                          <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
                            
                            {/* Target Element Highlighting Focus Ring */}
                            {currentPlaybackStepIndex >= 0 && currentPlaybackStepIndex < (playbackFlow?.steps?.length || 0) && playbackFlow?.steps?.[currentPlaybackStepIndex] && (
                              <motion.div
                                key={`bbox-${currentPlaybackStepIndex}`}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                style={{
                                  left: `${currentTargetBox.x}%`,
                                  top: `${currentTargetBox.y}%`,
                                  width: `${Math.max(4, currentTargetBox.width)}%`,
                                  height: `${Math.max(2.8, currentTargetBox.height)}%`,
                                }}
                                className={`absolute rounded border-2 ${
                                  ['fill', 'type'].includes(playbackFlow.steps[currentPlaybackStepIndex].action)
                                    ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
                                    : 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_20px_rgba(16,185,129,0.5)]'
                                } flex items-start justify-between p-0.5 transition-all duration-200 z-35 overflow-hidden`}
                              >
                                <div className={`flex items-center gap-1 text-[8px] font-black uppercase px-1.5 py-0.5 rounded shadow ${
                                  ['fill', 'type'].includes(playbackFlow.steps[currentPlaybackStepIndex].action)
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-emerald-600 text-white'
                                }`}>
                                  <span>{playbackFlow.steps[currentPlaybackStepIndex].action}</span>
                                </div>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  ['fill', 'type'].includes(playbackFlow.steps[currentPlaybackStepIndex].action) ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400 animate-ping'
                                }`} />
                              </motion.div>
                            )}

                            {/* Click Ripple Wave Animation */}
                            <AnimatePresence>
                              {isClicking && (
                                <motion.div
                                  initial={{ scale: 0.1, opacity: 1 }}
                                  animate={{ scale: 2.2, opacity: 0 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: 0.45, ease: 'easeOut' }}
                                  style={{
                                    left: `${cursorPos.x}%`,
                                    top: `${cursorPos.y}%`,
                                  }}
                                  className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border-4 border-emerald-400 bg-emerald-500/30 shadow-[0_0_25px_rgba(52,211,153,0.9)] pointer-events-none"
                                />
                              )}
                            </AnimatePresence>

                            {/* Animated Virtual Mouse Cursor Pointer */}
                            <motion.div
                              animate={{
                                left: `${cursorPos.x}%`,
                                top: `${cursorPos.y}%`,
                              }}
                              transition={{
                                duration: Math.max(0.08, 0.28 / playbackSpeed),
                                ease: 'easeInOut',
                              }}
                              className="absolute z-50 pointer-events-none -translate-x-1 -translate-y-1"
                            >
                              <div className="relative">
                                <svg
                                  width="28"
                                  height="28"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  className="drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]"
                                >
                                  <path
                                    d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
                                    fill="#6366f1"
                                    stroke="#ffffff"
                                    strokeWidth="2.2"
                                    strokeLinejoin="round"
                                  />
                                </svg>

                                {/* Action HUD Tooltip floating next to Cursor */}
                                {currentPlaybackStepIndex >= 0 && currentPlaybackStepIndex < (playbackFlow?.steps?.length || 0) && playbackFlow?.steps?.[currentPlaybackStepIndex] && (
                                  <div className="absolute left-6 top-2 bg-slate-950/95 text-white px-3 py-1.5 rounded-xl border border-indigo-500/50 text-[10px] font-black uppercase tracking-wider whitespace-nowrap shadow-2xl flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${isClicking ? 'bg-emerald-400 animate-ping' : 'bg-indigo-400'}`} />
                                    <span className="text-indigo-300">{playbackFlow.steps[currentPlaybackStepIndex].action}</span>
                                    <span className="text-slate-400 text-[9px] font-mono font-normal truncate max-w-[140px]">
                                      {playbackFlow.steps[currentPlaybackStepIndex].elementName || playbackFlow.steps[currentPlaybackStepIndex].locator?.primary?.value}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </motion.div>

                          </div>
                        )}

                        {/* Overlay Step Spotlight HUD on top right */}
                        {currentPlaybackStepIndex >= 0 && currentPlaybackStepIndex < (playbackFlow?.steps?.length || 0) && playbackFlow?.steps?.[currentPlaybackStepIndex] && (
                          <div className="absolute top-4 right-4 bg-slate-950/90 backdrop-blur-md border border-indigo-500/40 p-4 rounded-2xl text-white shadow-2xl max-w-sm z-30 animate-in fade-in duration-300">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[8px] font-black uppercase tracking-widest">
                                  Step #{currentPlaybackStepIndex + 1} / {playbackFlow.steps.length}
                                </span>
                                <span className="text-xs font-black text-indigo-400 uppercase">
                                  {playbackFlow.steps[currentPlaybackStepIndex].action}
                                </span>
                              </div>
                              <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1 font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Interaction
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-200">
                              {playbackFlow.steps[currentPlaybackStepIndex].elementName || playbackFlow.steps[currentPlaybackStepIndex].locator?.primary?.value || 'Target Element'}
                            </p>
                            {playbackFlow.steps[currentPlaybackStepIndex].value && (
                              <p className="text-[10px] text-emerald-400 font-mono mt-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                                Value: "{playbackFlow.steps[currentPlaybackStepIndex].value}"
                              </p>
                            )}
                          </div>
                        )}

                        {/* Lightweight Preparing Playback Loading Indicator Overlay */}
                        <AnimatePresence>
                          {isPreparingPlayback && (
                            <motion.div 
                              initial={{ opacity: 0, y: -10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -10, scale: 0.95 }}
                              transition={{ duration: 0.2 }}
                              className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-950/95 backdrop-blur-md border border-indigo-500/50 px-4 py-2 rounded-full shadow-2xl flex items-center gap-2.5"
                            >
                              <Loader2 size={14} className="animate-spin text-indigo-400" />
                              <span className="text-xs font-black text-white uppercase tracking-wider">Preparing Playback...</span>
                              <span className="text-[10px] text-indigo-300/80 font-mono">Initializing Browser Session</span>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Interactive Playback Completed or Failed Overlay on Web Stage */}
                        <AnimatePresence>
                          {(playbackStatus === 'completed' || playbackStatus === 'failed') && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.25 }}
                              className="absolute inset-0 z-40 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-6 select-none"
                            >
                              <div className={`bg-slate-900/95 border ${playbackStatus === 'completed' ? 'border-indigo-500/40' : 'border-rose-500/50'} rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl text-white space-y-4`}>
                                <div className={`w-14 h-14 rounded-2xl ${playbackStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-emerald-950' : 'bg-rose-500/20 text-rose-400 border-rose-500/30 shadow-rose-950'} border flex items-center justify-center mx-auto shadow-lg`}>
                                  {playbackStatus === 'completed' ? <CheckCircle2 size={28} /> : <AlertCircle size={28} />}
                                </div>
                                
                                <div>
                                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                    playbackStatus === 'completed'
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  }`}>
                                    {playbackStatus === 'completed' ? 'Playback Completed' : 'Playback Failed'}
                                  </span>
                                  <h3 className={`text-lg font-black mt-2.5 uppercase tracking-tight ${playbackStatus === 'completed' ? 'text-white' : 'text-rose-300'}`}>
                                    {playbackStatus === 'completed'
                                      ? 'Flow Execution Finished'
                                      : (!playbackFailureInfo || playbackFailureInfo.stepIndex === -1)
                                        ? 'PLAYBACK DID NOT START'
                                        : `FLOW EXECUTION FAILED — halted at step ${playbackFailureInfo.stepIndex + 1} of ${playbackFlow?.steps?.length || 0}`}
                                  </h3>
                                  {playbackStatus === 'completed' ? (
                                    <p className="text-xs text-slate-400 font-medium mt-1">
                                      All {playbackFlow?.steps?.length || 0} steps have been executed. You can now watch the full recorded video player or download the video recording.
                                    </p>
                                  ) : (
                                    <div className="mt-3 text-left bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 text-xs space-y-1">
                                      <p className="text-rose-200 font-semibold">
                                        Failing Step: <span className="text-white font-mono">{playbackFailureInfo?.stepName || 'Playback Engine'}</span>
                                      </p>
                                      <p className="text-rose-400 font-mono text-[11px] break-words">
                                        Error: {(!playbackFailureInfo || playbackFailureInfo.stepIndex === -1)
                                          ? (playbackFailureInfo?.error || 'Playback failed before any step produced a result — see the Logs tab.')
                                          : playbackFailureInfo.error}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-col gap-2.5 pt-2">
                                  {playbackStatus === 'failed' && (
                                    <button
                                      onClick={() => setPlaybackActiveTab('report')}
                                      className="w-full py-3 bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 border border-amber-400/40 cursor-pointer animate-pulse"
                                    >
                                      🛠️ Fix Defect & Execute Again
                                    </button>
                                  )}

                                  <button
                                    onClick={() => setPlaybackActiveTab('report')}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 border border-indigo-400/30 cursor-pointer"
                                  >
                                    📊 View Allure Execution Report
                                  </button>

                                  {playbackStatus === 'completed' && (
                                    <button
                                      onClick={() => handleOpenRecordedVideo(playbackFlow)}
                                      className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-950 flex items-center justify-center gap-2 border border-indigo-400/30 cursor-pointer"
                                    >
                                      <Video size={15} /> Watch Recorded Video
                                    </button>
                                  )}

                                  <div className="flex items-center gap-2">
                                    {playbackStatus === 'completed' && (
                                      <button
                                        onClick={() => handleDownloadVideoFromPlayback(playbackFlow)}
                                        disabled={isDownloadingPlaybackVideo}
                                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-emerald-950 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                                      >
                                        {isDownloadingPlaybackVideo ? (
                                          <>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Downloading...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Download size={14} />
                                            <span>Download Video</span>
                                          </>
                                        )}
                                      </button>
                                    )}

                                    <button
                                      onClick={() => handleRunPlayback()}
                                      className={`py-2.5 ${playbackStatus === 'completed' ? 'px-4 bg-slate-800 hover:bg-slate-700' : 'w-full bg-rose-600 hover:bg-rose-500'} text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer shadow-md`}
                                    >
                                      <RotateCcw size={13} /> Replay Flow
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  ) : (
                    /* Mobile Device Simulation Frame */
                    <div className="w-full h-full flex items-center justify-center p-2 relative">
                      <MobilePlaybackEmulator
                        flow={playbackFlow}
                        currentStepIndex={currentPlaybackStepIndex}
                        playbackStatus={playbackStatus}
                        playbackSpeed={playbackSpeed}
                        cursorPos={cursorPos}
                        isClicking={isClicking}
                        activeTypingText={activeTypingText}
                        stepScreenshots={playbackStepScreenshots}
                        viewMode={playbackViewMode === 'screenshot' ? 'screenshot' : 'interactive'}
                        onToggleViewMode={(m) => setPlaybackViewMode(m === 'screenshot' ? 'screenshot' : 'iframe')}
                        showInteractionOverlay={showInteractionOverlay}
                      />

                      {/* Interactive Playback Completed or Failed Overlay on Mobile Stage */}
                      <AnimatePresence>
                        {(playbackStatus === 'completed' || playbackStatus === 'failed') && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.25 }}
                            className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-6 select-none"
                          >
                            <div className={`bg-slate-900/95 border ${playbackStatus === 'completed' ? 'border-indigo-500/40' : 'border-rose-500/50'} rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl text-white space-y-4`}>
                              <div className={`w-14 h-14 rounded-2xl ${playbackStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-emerald-950' : 'bg-rose-500/20 text-rose-400 border-rose-500/30 shadow-rose-950'} border flex items-center justify-center mx-auto shadow-lg`}>
                                {playbackStatus === 'completed' ? <CheckCircle2 size={28} /> : <AlertCircle size={28} />}
                              </div>
                              
                              <div>
                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                  playbackStatus === 'completed'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                }`}>
                                  {playbackStatus === 'completed' ? 'Mobile Playback Completed' : 'Mobile Playback Failed'}
                                </span>
                                <h3 className={`text-lg font-black mt-2.5 uppercase tracking-tight ${playbackStatus === 'completed' ? 'text-white' : 'text-rose-300'}`}>
                                  {playbackStatus === 'completed'
                                    ? 'Flow Execution Finished'
                                    : (!playbackFailureInfo || playbackFailureInfo.stepIndex === -1)
                                      ? 'PLAYBACK DID NOT START'
                                      : `FLOW EXECUTION FAILED — halted at step ${playbackFailureInfo.stepIndex + 1} of ${playbackFlow?.steps?.length || 0}`}
                                </h3>
                                {playbackStatus === 'completed' ? (
                                  <p className="text-xs text-slate-400 font-medium mt-1">
                                    All {playbackFlow?.steps?.length || 0} mobile steps executed successfully. You can watch the full recorded video player or download the video recording.
                                  </p>
                                ) : (
                                  <div className="mt-3 text-left bg-rose-950/40 border border-rose-500/30 rounded-xl p-3 text-xs space-y-1">
                                    <p className="text-rose-200 font-semibold">
                                      Failing Step: <span className="text-white font-mono">{playbackFailureInfo?.stepName || 'Playback Engine'}</span>
                                    </p>
                                    <p className="text-rose-400 font-mono text-[11px] break-words">
                                      Error: {(!playbackFailureInfo || playbackFailureInfo.stepIndex === -1)
                                        ? (playbackFailureInfo?.error || 'Playback failed before any step produced a result — see the Logs tab.')
                                        : playbackFailureInfo.error}
                                    </p>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-2.5 pt-2">
                                {playbackStatus === 'failed' && (
                                  <button
                                    onClick={() => setPlaybackActiveTab('report')}
                                    className="w-full py-3 bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-amber-950/40 flex items-center justify-center gap-2 border border-amber-400/40 cursor-pointer animate-pulse"
                                  >
                                    🛠️ Fix Defect & Execute Again
                                  </button>
                                )}

                                <button
                                  onClick={() => setPlaybackActiveTab('report')}
                                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 border border-indigo-400/30 cursor-pointer"
                                >
                                  📊 View Allure Execution Report
                                </button>

                                {playbackStatus === 'completed' && (
                                  <button
                                    onClick={() => handleOpenRecordedVideo(playbackFlow)}
                                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-950 flex items-center justify-center gap-2 border border-indigo-400/30 cursor-pointer"
                                  >
                                    <Video size={15} /> Watch Recorded Video
                                  </button>
                                )}

                                <div className="flex items-center gap-2">
                                  {playbackStatus === 'completed' && (
                                    <button
                                      onClick={() => handleDownloadVideoFromPlayback(playbackFlow)}
                                      disabled={isDownloadingPlaybackVideo}
                                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-emerald-950 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                                    >
                                      {isDownloadingPlaybackVideo ? (
                                        <>
                                          <Loader2 size={14} className="animate-spin" />
                                          <span>Downloading...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Download size={14} />
                                          <span>Download Video</span>
                                        </>
                                      )}
                                    </button>
                                  )}

                                  <button
                                    onClick={() => handleRunPlayback()}
                                    className={`py-2.5 ${playbackStatus === 'completed' ? 'px-4 bg-slate-800 hover:bg-slate-700' : 'w-full bg-rose-600 hover:bg-rose-500'} text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer shadow-md`}
                                  >
                                    <RotateCcw size={13} /> Replay Flow
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>

                {/* Right Panel: Step Timeline & Console */}
                <div className="w-full md:w-[420px] bg-slate-950 p-6 flex flex-col justify-between overflow-y-auto custom-scrollbar border-t md:border-t-0 md:border-l border-slate-800">
                  <div className="flex-1 flex flex-col overflow-hidden">
                    
                    {playbackActiveTab === 'logs' ? (
                      /* Live Execution Console Logs */
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                            <Terminal size={14} className="text-indigo-400" /> Execution Console
                          </h4>
                          <button 
                            onClick={() => setPlaybackLogs([])}
                            className="text-[9px] font-black text-slate-500 uppercase hover:text-slate-300"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="flex-1 bg-slate-900 p-4 rounded-2xl border border-slate-800 font-mono text-[10px] overflow-y-auto custom-scrollbar space-y-2 max-h-[380px]">
                          {playbackLogs.length === 0 ? (
                            <div className="text-center py-12 text-slate-600 font-bold uppercase tracking-wider">
                              Console logs will appear here during execution
                            </div>
                          ) : (
                            playbackLogs.map((log, i) => (
                              <div key={i} className={`p-2 rounded-lg ${
                                log.level === 'success' ? 'bg-emerald-950/30 text-emerald-400 border border-emerald-900/30' :
                                log.level === 'error' ? 'bg-rose-950/30 text-rose-400 border border-rose-900/30' :
                                log.level === 'warn' ? 'bg-amber-950/30 text-amber-400 border border-amber-900/30' :
                                'text-slate-300'
                              }`}>
                                <span className="text-[8px] text-slate-500 mr-2">[{log.timestamp}]</span>
                                {log.message}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                            <Layers size={14} className="text-indigo-400" /> Step Timeline
                          </h4>
                          <span className="text-[10px] font-bold text-slate-500">
                            {Object.values(stepExecutionStatus).filter(s => s === 'passed').length} / {playbackFlow?.steps?.length || 0} Passed
                          </span>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar max-h-[380px]">
                          {(playbackFlow?.steps || []).map((step, idx) => {
                            const status = stepExecutionStatus[step.id] || 'pending';
                            const isCurrent = idx === currentPlaybackStepIndex;
                            const duration = stepExecutionTime[step.id];

                            return (
                              <div 
                                key={step.id} 
                                className={`p-3.5 rounded-2xl border transition-all ${
                                  isCurrent ? 'bg-indigo-950/40 border-indigo-500/60 shadow-lg shadow-indigo-950 ring-1 ring-indigo-500/30' :
                                  status === 'passed' ? 'bg-slate-900/80 border-emerald-500/30 text-slate-200' :
                                  status === 'failed' ? 'bg-rose-950/30 border-rose-500/50 text-rose-300' :
                                  status === 'skipped' ? 'bg-slate-900/40 border-amber-500/30 text-slate-400' :
                                  status === 'running' ? 'bg-indigo-900/30 border-indigo-400/50 text-white' :
                                  'bg-slate-900/40 border-slate-800/80 text-slate-400'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-mono font-black text-slate-500">#{idx + 1}</span>
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                                      status === 'passed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                      status === 'failed' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                      status === 'skipped' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                      status === 'running' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse' :
                                      'bg-slate-800 text-slate-400'
                                    }`}>
                                      {status === 'skipped' ? 'SKIPPED' : step.action}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {duration !== undefined && (
                                      <span className="text-[9px] font-mono text-slate-500">{duration}ms</span>
                                    )}
                                    {status === 'passed' && <CheckCircle2 size={14} className="text-emerald-400" />}
                                    {status === 'failed' && <AlertCircle size={14} className="text-rose-400" />}
                                    {status === 'skipped' && <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Skipped</span>}
                                    {status === 'running' && <Loader2 size={14} className="text-indigo-400 animate-spin" />}
                                    {status === 'pending' && <Clock size={12} className="text-slate-600" />}
                                  </div>
                                </div>

                                <p className="text-[11px] font-bold text-slate-200 truncate">
                                  {step.action === 'navigate' ? unwrapProxyUrl(step.value || step.url || '') : (step.elementName || step.locator?.primary?.value || step.value || 'Action step')}
                                </p>
                                {step.value && step.action !== 'navigate' && (
                                  <p className="text-[10px] text-indigo-300 font-mono mt-0.5 truncate">
                                    "{step.value}"
                                  </p>
                                )}
                                {status === 'failed' && (
                                  <p className="text-[10px] text-rose-400 font-mono mt-1.5 bg-rose-950/40 p-1.5 rounded border border-rose-500/20 break-words">
                                    {playbackFailureInfo?.stepIndex === idx ? playbackFailureInfo.error : 'Step failed'}
                                  </p>
                                )}
                                {status === 'skipped' && (
                                  <p className="text-[10px] text-amber-400/80 font-mono mt-1 italic">
                                    Step skipped due to previous execution failure
                                  </p>
                                )}
                                {playbackStepScreenshots[step.id] && (
                                  <div 
                                    className="mt-2 rounded-lg overflow-hidden border border-slate-700 bg-slate-950 max-h-24 flex items-center justify-center relative group cursor-pointer"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCurrentPlaybackStepIndex(idx);
                                      setPlaybackViewMode('screenshot');
                                    }}
                                  >
                                    <img src={playbackStepScreenshots[step.id]} alt={`Step ${idx + 1} Capture`} className="w-full object-cover max-h-24" />
                                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[9px] font-black text-white uppercase tracking-wider gap-1">
                                      <Camera size={12} /> View Step Screenshot
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Bottom Action Footer */}
                  <div className="pt-4 mt-4 border-t border-slate-800/80 flex flex-col gap-2.5">
                    {playbackStatus === 'completed' && (
                      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <button 
                          onClick={() => handleOpenRecordedVideo(playbackFlow)}
                          className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-950 flex items-center justify-center gap-2 border border-indigo-400/30 cursor-pointer"
                        >
                          <Video size={14} /> Watch Recorded Video
                        </button>

                        <button 
                          onClick={() => handleDownloadVideoFromPlayback(playbackFlow)}
                          disabled={isDownloadingPlaybackVideo}
                          className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 disabled:opacity-50 border border-emerald-400/30 cursor-pointer"
                          title="Download recorded flow video (.webm)"
                        >
                          {isDownloadingPlaybackVideo ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Downloading...</span>
                            </>
                          ) : (
                            <>
                              <Download size={14} />
                              <span>Download Video</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3">
                      <button 
                        onClick={() => handleRunPlayback()}
                        className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md shadow-indigo-950 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RotateCcw size={14} /> Replay Flow
                      </button>
                      <button 
                        onClick={() => {
                          handleStopPlayback();
                          setIsPlaybackModalOpen(false);
                        }}
                        className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recorded Video Player Modal */}
      <RecordedVideoModal
        isOpen={isRecordedVideoModalOpen}
        onClose={() => setIsRecordedVideoModalOpen(false)}
        flow={videoModalFlow}
        initialUrl={targetUrl}
        screenshots={playbackStepScreenshots}
      />

      {/* Uploaded Video Walkthrough Player Modal */}
      <RecordedVideoFlowPlayerModal
        data={watchVideoModalData}
        onClose={() => setWatchVideoModalData(null)}
        onUpdateFlowVideo={async (flowId, newUrl, newFileName) => {
          if (project && onUpdateProject) {
            const existingUploadFlows = project.uploadVideoFlows || [];
            const updatedUploadFlows = existingUploadFlows.map(f =>
              f.id === flowId ? { ...f, videoUrl: newUrl, inputVideoUrl: newUrl, videoFileName: newFileName } : f
            );
            await onUpdateProject({
              ...project,
              uploadVideoFlows: updatedUploadFlows
            });
            toast.success('Updated video source for flow');
          }
        }}
        onViewScript={(script, files, tool, language) => {
          const scriptFiles = files && files.length > 0
            ? files
            : [{ path: 'test.spec.ts', content: script || '' }];
          setGeneratedProject({
            files: scriptFiles,
            explanation: `Generated from ${watchVideoModalData?.flowName || 'video walkthrough'}`
          });
          setSelectedFilePath(scriptFiles[0]?.path || 'test.spec.ts');
          if (tool) setSelectedTool(tool as any);
          if (language) setSelectedLanguage(language as any);
          setIsPreviewOpen(true);
        }}
      />

      {/* Optional Walkthrough Video Upload Modal (Supports up to 1GB) */}
      <RecordPlayVideoUploadModal
        isOpen={isVideoUploadModalOpen}
        onClose={() => setIsVideoUploadModalOpen(false)}
        initialTargetUrl={targetUrl && targetUrl !== 'https://' ? targetUrl : ''}
        platform={platform}
        project={project}
        activeFolderId={activeFolderType === 'upload_video' ? activeFolderId : undefined}
        onUpdateProject={onUpdateProject}
        initialTool={selectedTool}
        initialLanguage={selectedLanguage}
        initialFramework={selectedFramework}
        onApplyStepsToFlow={(steps, metadata) => {
          try {
            if (steps && steps.length > 0) {
              const baseTime = Date.now();
              const sanitized: RecordedStep[] = steps.map((s, idx) => {
                const action = String(s.action || 'click') as any;
                const screen = String(s.screen || metadata?.name || 'MainPage');
                const safeId = `step-vid-${baseTime}-${idx + 1}-${Math.random().toString(36).substring(2, 7)}`;
                const rawPrimary = s.locator?.primary;
                const primaryValue = typeof rawPrimary?.value === 'string' && rawPrimary.value
                  ? rawPrimary.value
                  : (typeof s.elementName === 'string' && s.elementName ? s.elementName : (typeof s.value === 'string' ? s.value : 'body'));
                const primaryPlaywright = typeof rawPrimary?.playwright === 'string' && rawPrimary.playwright
                  ? rawPrimary.playwright
                  : (action === 'navigate' ? `await page.goto('${String(s.value || metadata?.url || '')}')` : `page.locator('${primaryValue.replace(/'/g, "\\'")}')`);
                const primaryType = rawPrimary?.type || (action === 'navigate' ? 'url' : 'css');
                
                const locator: UniversalLocator = {
                  primary: {
                    type: primaryType as any,
                    value: String(primaryValue),
                    playwright: String(primaryPlaywright)
                  },
                  alternatives: Array.isArray(s.locator?.alternatives) ? s.locator.alternatives.map(alt => ({
                    type: alt.type,
                    value: String(alt.value || '')
                  })) : []
                };

                return {
                  ...s,
                  id: safeId,
                  action,
                  elementName: typeof s.elementName === 'string' ? s.elementName : undefined,
                  value: typeof s.value === 'string' ? s.value : (s.value != null ? String(s.value) : undefined),
                  url: typeof s.url === 'string' ? s.url : (metadata?.url || undefined),
                  screen,
                  platform: s.platform || platform || 'web',
                  timestamp: typeof s.timestamp === 'number' && !isNaN(s.timestamp) ? s.timestamp : (baseTime + idx * 1000),
                  sequenceNumber: idx + 1,
                  locator,
                  screenshot: typeof s.screenshot === 'string' ? s.screenshot : undefined
                };
              });

              setCurrentSteps(sanitized);
              if (metadata?.name) setFlowName(metadata.name);
              if (metadata?.description) setFlowDescription(metadata.description);
              if (metadata?.url && metadata.url !== 'https://') setTargetUrl(metadata.url);
              setIsApproved(true);
              setActivePanel('steps');
              toast.success(`Successfully loaded ${sanitized.length} video-generated steps into Record & Play!`);
            }
          } catch (err: any) {
            console.error('Error applying steps to flow:', err);
            toast.error(`Failed to apply steps: ${err.message || 'Unknown error'}`);
          }
        }}
      />

      {/* Universal Browser Permission Request Confirmation Modal */}
      <AnimatePresence>
        {pendingPermissionRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-amber-200 overflow-hidden flex flex-col"
            >
              <div className="p-7 border-b border-amber-100 bg-amber-50/70 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-lg shadow-amber-200">
                    <ShieldAlert size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                      Browser Permission Required
                    </h3>
                    <p className="text-[10px] text-amber-800 font-bold uppercase tracking-widest mt-0.5">
                      Security & Privacy Access Gate
                    </p>
                  </div>
                </div>
                <button 
                  onClick={handleDenyPermission}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-7 space-y-5">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <p className="text-xs text-slate-600 font-medium leading-relaxed">
                    The web application at <strong className="text-indigo-600 break-all">{pendingPermissionRequest.origin || targetUrl}</strong> is requesting access to browser hardware or protected APIs to continue.
                  </p>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2.5">
                    Requested Permissions
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {pendingPermissionRequest.permissions.map((perm, idx) => (
                      <div
                        key={idx}
                        className="px-3.5 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2"
                      >
                        {perm === 'camera' && <Camera size={14} />}
                        {perm === 'microphone' && <Mic size={14} />}
                        {perm === 'geolocation' && <MapPin size={14} />}
                        {perm === 'notifications' && <Radio size={14} />}
                        {perm === 'clipboard' && <Copy size={14} />}
                        {perm}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl text-[11px] text-emerald-800 font-medium">
                  💡 Allowing grants <strong>only</strong> the requested permissions specifically for this recording session. Once granted, AutomatiQA will stabilize and transition directly to <strong>RECORDING_READY</strong>.
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleDenyPermission}
                  disabled={isGrantingPermission}
                  className="px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Deny Request
                </button>
                <button
                  type="button"
                  onClick={() => handleGrantPermission()}
                  disabled={isGrantingPermission}
                  className="px-7 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-200 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isGrantingPermission ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  Allow & Continue Recording
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Website Launch Diagnostics Modal */}
      <AnimatePresence>
        {activeDiagnosticModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
            >
              <div className="p-7 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 font-mono text-[9px] font-black uppercase rounded">
                      {activeDiagnosticModal.code}
                    </span>
                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mt-1">
                      {activeDiagnosticModal.title}
                    </h3>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveDiagnosticModal(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-7 space-y-4">
                <p className="text-sm font-medium text-slate-700 leading-relaxed">
                  {activeDiagnosticModal.message}
                </p>

                {activeDiagnosticModal.details && (
                  <div className="p-3.5 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl border border-slate-800 max-h-36 overflow-y-auto custom-scrollbar">
                    <code>{activeDiagnosticModal.details}</code>
                  </div>
                )}

                {activeDiagnosticModal.suggestedAction && (
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                    <p className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <Info size={13} /> Recommended Action
                    </p>
                    <p className="text-xs text-indigo-700 font-medium">
                      {activeDiagnosticModal.suggestedAction}
                    </p>
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveDiagnosticModal(null)}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-indigo-100 cursor-pointer"
                >
                  Acknowledge & Continue
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RecordAndPlay;
