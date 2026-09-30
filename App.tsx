import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  LayoutDashboard, 
  FolderKanban, 
  FileSearch, 
  PlayCircle, 
  Code2, 
  ChevronRight, 
  ChevronDown, 
  Database, 
  CheckCircle2, 
  BookOpen, 
  BarChart3, 
  Zap, 
  Network, 
  Activity, 
  Terminal, 
  Folder, 
  Plus, 
  X, 
  MoreVertical, 
  MoreHorizontal,
  LogOut, 
  Layout, 
  Users, 
  ShieldCheck, 
  Briefcase, 
  Bell, 
  Inbox, 
  Clock, 
  Eye, 
  Paperclip, 
  Trash2, 
  Link2, 
  MessageSquare, 
  FileVideo, 
  ImageIcon, 
  Upload, 
  ExternalLink,
  Loader2,
  AlertTriangle,
  Download,
  CheckCircle,
  Maximize2,
  Minimize2,
  Globe,
  Coins,
  ShieldAlert,
  Smartphone,
  Workflow
} from 'lucide-react';
import MobileTesting from './components/MobileTesting';
import { onSnapshot, query, collection, where, doc, orderBy, limit, serverTimestamp, getDocFromServer, or } from "firebase/firestore";
import { signOut, onIdTokenChanged } from "firebase/auth";
import { db, auth, handleFirestoreError, OperationType } from "./firebase";
import { syncUpdateDoc, syncSetDoc } from "./services/firestoreSync";
import { clearStaleAuthSession, logAuthDiagnostic, performSafeLogout } from "./services/authService";
import seededUsers from './users.json';
import { Toaster } from 'sonner';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './components/Dashboard';
import ProjectList from './components/ProjectList';
import ScenarioGenerator from './components/ScenarioGenerator';
import TestCaseManager from './components/TestCaseManager';
import ManualTestCaseManager from './components/ManualTestCaseManager';
import ExecutionPanel from './components/ExecutionPanel';
import ScriptGenerator from './components/ScriptGenerator';
import { ScriptExecution } from './components/ScriptExecution';
import ApiTesting from './components/ApiTesting';
import PerformanceTesting from './components/PerformanceTesting';
import PerformanceTestingWorkflow from './components/PerformanceTestingWorkflow';
import { FunctionalPerformanceTesting } from './components/FunctionalPerformanceTesting';
import PerformanceExecution from './components/PerformanceExecution';
import JMeterPerformance from './components/JMeterPerformance';
import { JiraBugModal } from './components/JiraBugModal';
import UITesting from './components/UITesting';
import UserManagement from './components/UserManagement';
import Reports from './components/Reports';
import RecordAndPlay from './components/RecordAndPlay';
import AuthComponent from './components/Auth';
import { AutomatiqaLogo } from './components/AutomatiqaLogo';
import { JiraSettings } from './components/JiraSettings';
import { GithubSettings } from './components/GithubSettings';
import { SlackSettings } from './components/SlackSettings';
import { AICacheSettings } from './components/AICacheSettings';
import { BackupSettings } from './components/BackupSettings';
import { AICacheNotification } from './components/AICacheNotification';
import { QACopilot } from './components/QACopilot';
import { NotificationBell } from './components/NotificationBell';
import AIGeneratorUser from './components/AIGeneratorUser';
import { RAGDashboard } from './components/RAGDashboard';
import { TokenConsumption } from './components/TokenConsumption';
import { CreditConsumption } from './components/CreditConsumption';
import { CreditAlertBanner } from './components/CreditAlertBanner';
import { Sliders, Github, Sparkles, UserPlus, Slack, Gauge } from 'lucide-react';
import { Project, ApiTestSuite, User, UserRole, AppNotification, ApiRequest, ApiTestSuiteEvidence, TestStatus, TestCase, TestPriority, TestType, TestIntent, isApiTestingScenario } from './types';
import { logActivity } from './services/activityService';
import { markAsRead } from './services/notificationService';
import { cleanFirestoreData, updateProjectFirestore, estimateSize, getDeletedIds, cleanProjectDeletedItems, addDeletedIds } from './services/projectService';
import { getSubscriptionRequests, subscribeToSubscriptionRequests } from './services/subscriptionService';
import { getProjectPlans, subscribeToProjectPlans, getFirestoreTokenLogs, subscribeToFirestoreTokenLogs } from './services/tokenConsumptionService';
import { saveProjectBackup, mergeAutomationScriptsWithBackup, mergeUploadVideoFlowsWithBackup, mergeRecordedFlowsWithBackup, mergeFoldersWithBackup, mergeProjectWithBackupData, filterDeletedScriptFiles, mergePerformanceScriptsWithBackup, mergeUserStoriesWithBackup, mergeScenariosWithBackup, syncFolderReferences, mergeUITestingFoldersWithBackup, mergeUITestingReportsWithBackup, mergeFigmaDesignReviewsWithBackup, mergeUIComparisonReportsWithBackup, mergeUITestingInputsWithBackup, getProjectBackupSync } from './services/storageBackupService';
import { loadAllProjectFoldersAndStories } from './services/folderPersistenceService';
import { toast as sonnerToast } from 'sonner';
import { logger } from './services/appLogger';

type ActiveTab = 'dashboard' | 'projects' | 'rag' | 'ai_user_generator' | 'scenarios' | 'cases' | 'manual' | 'execution' | 'execution_manual_cases' | 'execution_scripts' | 'execution_api' | 'execution_performance' | 'scripts' | 'record_play' | 'mobile_testing' | 'api' | 'performance' | 'web_performance' | 'functional_performance' | 'jmeter_performance' | 'ui_testing' | 'reports' | 'token_consumption' | 'user_management' | 'settings_jira' | 'settings_github' | 'settings_slack' | 'settings_cache' | 'settings_credits' | 'settings_backup';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 Minutes

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      // Only read initial local user if an explicit iframe SSO bypass is present
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('bypass') === 'true' && urlParams.get('email')) {
          const saved = sessionStorage.getItem('automatiqa_user') || localStorage.getItem('automatiqa_user');
          if (saved) return JSON.parse(saved);
        }
      }
    } catch (e) {}
    // Firebase Auth onAuthStateChanged / onIdTokenChanged is the single source of truth
    return null;
  });
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [testCaseInitialView, setTestCaseInitialView] = useState<'folders' | 'scenarios'>('scenarios');
  const [scriptInitialFolder, setScriptInitialFolder] = useState<{ id?: string; name?: string } | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    try {
      if (typeof window !== 'undefined') {
        const hash = window.location.hash.replace(/^#/, '');
        if (hash) return hash as ActiveTab;
        const saved = localStorage.getItem('automatiqa_active_tab');
        if (saved) return saved as ActiveTab;
      }
    } catch (e) {}
    return 'dashboard';
  });
  const [projects, setProjects] = useState<Project[]>(() => {
    try {
      const cached = localStorage.getItem('automatiqa_projects_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((p: Project) => cleanProjectDeletedItems(p));
        }
      }
    } catch (e) {}
    return [];
  });
  const projectsRef = useRef<Project[]>(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    try {
      const savedUser = sessionStorage.getItem('automatiqa_user') || localStorage.getItem('automatiqa_user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        if (u?.email) {
          const lastId = localStorage.getItem(`automatiqa_last_project_${u.email.toLowerCase()}`);
          if (lastId) return lastId;
        }
      }
      return localStorage.getItem('automatiqa_selected_project_id') || null;
    } catch (e) {
      return null;
    }
  });
  const [isExecutionExpanded, setIsExecutionExpanded] = useState(false);
  const [isAutomationExpanded, setIsAutomationExpanded] = useState(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [activeFolderRunId, setActiveFolderRunId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('automatiqa_active_folder_run') || null;
    } catch (e) {
      return null;
    }
  });
  const [isSwitchProjectOpen, setIsSwitchProjectOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isRecorderFullScreen, setIsRecorderFullScreen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const switchDropdownRef = useRef<HTMLDivElement>(null);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);
  const autoUpgradeAttemptedRef = useRef(false);
  const [toast, setToast] = useState<{ message: string; visible: boolean; type?: 'success' | 'error' | 'warning' } | null>(null);

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [fallbackTrigger, setFallbackTrigger] = useState(0);

  useEffect(() => {
    const handleFallback = () => {
      setFallbackTrigger(prev => prev + 1);
    };
    window.addEventListener('firestore-db-fallback', handleFallback);
    return () => window.removeEventListener('firestore-db-fallback', handleFallback);
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      logger.info('System', 'Browser connection restored (Online)', undefined, 'NetworkOnline', user?.email, selectedProjectId || undefined);
    };
    const handleOffline = () => {
      setIsOffline(true);
      logger.warn('System', 'Browser connection lost (Offline)', undefined, 'NetworkOffline', user?.email, selectedProjectId || undefined);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleWindowError = (event: ErrorEvent) => {
      const activeUser = user || (window as any).__automatiqa_user;
      const errObj = event.error || { message: event.message, filename: event.filename, lineno: event.lineno, stack: event.error?.stack };
      const errMsg = event.message || errObj?.message || 'Global window error';
      const lower = errMsg.toLowerCase();
      if (lower.includes('websocket') || lower.includes('script error') || lower.includes('vite')) {
        return;
      }
      logger.error('ClientWindow', errMsg, errObj, 'WindowError', activeUser, selectedProjectId || undefined);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const activeUser = user || (window as any).__automatiqa_user;
      const reason = event.reason;
      const errMsg = typeof reason === 'string' ? reason : (reason?.message || String(reason || 'Unhandled Promise Rejection'));
      const lower = errMsg.toLowerCase();
      if (lower.includes('websocket') || lower.includes('script error') || lower.includes('vite')) {
        return;
      }
      logger.error('ClientWindow', errMsg, reason, 'UnhandledRejection', activeUser, selectedProjectId || undefined);
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [user?.email, selectedProjectId]);

  useEffect(() => {
    logger.info('Navigation', `Active feature tab changed to: ${activeTab}`, { activeTab }, 'TabSwitch', user?.email, selectedProjectId || undefined);
    if (['settings_jira', 'settings_github', 'settings_slack', 'settings_cache', 'settings_credits', 'settings_backup'].includes(activeTab)) {
      setIsSettingsExpanded(true);
    }
  }, [activeTab, user?.email, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      logger.info('Project', `Selected project changed to: ${selectedProjectId}`, { selectedProjectId }, 'SelectProject', user?.email, selectedProjectId);
    }
  }, [selectedProjectId, user?.email]);

  // Firestore Connection & Quota Health Verification
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection verified.");
        setIsOffline(false);
      } catch (error: any) {
        if (error.message?.includes('Missing or insufficient permissions') || error.code === 'permission-denied') {
          console.warn("Connection test ping restricted by rules.");
        } else if (
          error.message?.includes('the client is offline') ||
          error.code === 'unavailable' ||
          error.message?.includes('Could not reach Cloud Firestore') ||
          error.code === 'resource-exhausted'
        ) {
          console.warn("Firebase connection or quota issue detected. Running in cached mode.");
          setIsOffline(true);
        } else {
          console.warn("Connection test warning:", error);
        }
      }
    };
    testConnection();
  }, []);

  // Global subscription requests, project credit plans & token consumption logs synchronization
  useEffect(() => {
    getSubscriptionRequests().catch(err => {
      console.warn("Initial subscription sync from Firestore:", err);
    });
    getProjectPlans().catch(err => {
      console.warn("Initial project plans sync:", err);
    });
    getFirestoreTokenLogs(user, projects).catch(err => {
      console.warn("Initial token logs sync from Firestore:", err);
    });

    const unsubSubs = subscribeToSubscriptionRequests();
    const unsubPlans = subscribeToProjectPlans();
    const unsubLogs = subscribeToFirestoreTokenLogs((logs) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('token-consumption-updated', { detail: logs }));
      }
    }, undefined, user, projects);

    const handleProjectChanged = (e: CustomEvent) => {
      const proj = e.detail;
      if (proj && proj.id) {
        setSelectedProjectId(proj.id);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('project-changed', handleProjectChanged as EventListener);
    }

    return () => {
      unsubSubs();
      unsubPlans();
      if (typeof unsubLogs === 'function') unsubLogs();
      if (typeof window !== 'undefined') {
        window.removeEventListener('project-changed', handleProjectChanged as EventListener);
      }
    };
  }, [user?.email, projects.length]);

  // API Execution States
  const [isSuiteModalOpen, setIsSuiteModalOpen] = useState(false);
  const [newSuiteName, setNewSuiteName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [suiteError, setSuiteError] = useState('');
  const [activeMenuSuiteId, setActiveMenuSuiteId] = useState<string | null>(null);
  const [activeMenuScenarioId, setActiveMenuScenarioId] = useState<string | null>(null);
  const [expandedSuiteIds, setExpandedSuiteIds] = useState<Set<string>>(new Set());
  const [deleteSuiteConfirm, setDeleteSuiteConfirm] = useState<{ id: string, name: string } | null>(null);
  
  const [apiBugModalOpen, setApiBugModalOpen] = useState(false);
  const [apiBugTitle, setApiBugTitle] = useState('');
  const [apiBugDescription, setApiBugDescription] = useState('');
  const [apiBugAttachments, setApiBugAttachments] = useState<string[]>([]);
  const [apiBugLinks, setApiBugLinks] = useState<string[]>([]);
  const [apiBugComments, setApiBugComments] = useState<string>('');

  const handleCreateScenarioBug = (suite: ApiTestSuite, scenario: any) => {
    const scenarioEv = suite.scenarioResults?.[scenario.id]?.evidence || stagedEvidence[scenario.id] || suite.evidence;
    const attachments = scenarioEv?.attachments || [];
    const links = scenarioEv?.links || [];
    const comment = scenarioEv?.comment || '';

    setApiBugTitle(`[FAIL] API Verification - ${suite.name} - ${scenario.name || 'Scenario'}`);
    
    let desc = 
      `AutomatiQA API Execution Failure Report\n` +
      `----------------------------------------\n` +
      `Suite Name: ${suite.name}\n` +
      `Scenario Name: ${scenario.name || 'Untitled Scenario'}\n` +
      `Method: ${scenario.method}\n` +
      `URL: ${scenario.url}\n` +
      `Timestamp: ${new Date().toLocaleString('en-GB')}\n\n`;

    if (comment) {
      desc += `Execution Comments:\n${comment}\n\n`;
    }
    if (links.length > 0) {
      desc += `Reference Links:\n` + links.map((l, i) => `${i + 1}. ${l}`).join('\n') + `\n\n`;
    }
    if (attachments.length > 0) {
      desc += `Attached Evidences: ${attachments.length} file(s) attached to this bug report.\n\n`;
    }

    desc += `Recommended Action: Inspect server gateway availability, routing configuration, SSL cert handshakes, or response payload schemas.`;

    setApiBugDescription(desc);
    setApiBugAttachments(attachments);
    setApiBugLinks(links);
    setApiBugComments(comment);
    setApiBugModalOpen(true);
  };
  
  // Action Modals State
  const [viewDetailsSuite, setViewDetailsSuite] = useState<ApiTestSuite | null>(null);
  const [addEvidenceContext, setAddEvidenceContext] = useState<{ suite: ApiTestSuite, scenarioId?: string } | null>(null);
  
  // STAGED EVIDENCE: Keyed by scenarioId or suiteId to preserve across navigation
  const [stagedEvidence, setStagedEvidence] = useState<Record<string, ApiTestSuiteEvidence>>({});
  const [newLinkInput, setNewLinkInput] = useState('');
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewMedia, setPreviewMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);

  // 0. SSO Bypass check for embedded iframe integration
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('bypass') === 'true' && urlParams.get('email')) {
          const email = urlParams.get('email')!.toLowerCase().trim();
          const name = urlParams.get('name') || email.split('@')[0];
          const role = urlParams.get('role') || 'super_admin';
          const projId = urlParams.get('projectId');

          const bypassedUser = {
            email,
            name,
            role: role as any,
            assignedProjectIds: []
          };

          setUser(bypassedUser);
          setIsAuthReady(true);
          sessionStorage.setItem('automatiqa_user', JSON.stringify(bypassedUser));
          localStorage.setItem('automatiqa_user', JSON.stringify(bypassedUser));

          if (projId) {
            setSelectedProjectId(projId);
          }

          // Directly land on mobile_testing tab so they don't see general dashboard
          setActiveTab('mobile_testing');
        }
      }
    } catch (e) {
      console.warn("SSO iframe bypass failure:", e);
    }
  }, []);

  // 1. Auth State Management - Firebase Auth is the Single Source of Truth
  useEffect(() => {
    // Fallback timer ensures the login screen or auth gate is unblocked even if Incognito browser storage or third-party cookies delay onAuthStateChanged
    const timer = setTimeout(() => {
      setIsAuthReady(true);
    }, 1500);

    const isBypassActive = () => {
      try {
        if (typeof window !== 'undefined') {
          return new URLSearchParams(window.location.search).get('bypass') === 'true';
        }
      } catch (e) {}
      return false;
    };

    const unsubscribeAuth = auth.onAuthStateChanged(
      (firebaseUser) => {
        clearTimeout(timer);
        setIsAuthReady(true);
        if (!firebaseUser) {
          if (!isBypassActive()) {
            logAuthDiagnostic('Auth state listener: no authenticated user');
            setUser(null);
            clearStaleAuthSession();
          }
        } else {
          logAuthDiagnostic('Auth state listener: user authenticated', { email: firebaseUser.email });
          setUser(prev => {
            if (prev && prev.email.toLowerCase() === firebaseUser.email?.toLowerCase()) {
              return prev;
            }
            const email = (firebaseUser.email || '').toLowerCase();
            const isSuper = email === 'shanmugapriya@qaoncloud.com' || email === 'vinuta@qaoncloud.com' || email === 'jagathesan@qaoncloud.com';
            return {
              email,
              name: firebaseUser.displayName || email.split('@')[0],
              role: isSuper ? UserRole.SUPER_ADMIN : UserRole.TEAM_MEMBER,
              assignedProjectIds: []
            };
          });
        }
      },
      (error) => {
        clearTimeout(timer);
        setIsAuthReady(true);
        logAuthDiagnostic('Auth state observer error', { message: error?.message });
        if (!isBypassActive()) {
          setUser(null);
          clearStaleAuthSession();
        }
      }
    );

    const unsubscribeIdToken = onIdTokenChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        logAuthDiagnostic('Auth ID token changed', { email: firebaseUser.email });
      } else if (!isBypassActive()) {
        logAuthDiagnostic('Auth ID token cleared');
        setUser(null);
        clearStaleAuthSession();
      }
    });

    return () => {
      clearTimeout(timer);
      unsubscribeAuth();
      unsubscribeIdToken();
    };
  }, []);

  // 1b-2. Permanent Storage Sync: Restore server-side disk backups
  useEffect(() => {
    fetch('/api/projects/all-backups')
      .then(res => res.json())
      .then(backups => {
        if (backups && typeof backups === 'object') {
          Object.keys(backups).forEach(projectId => {
            const serverProject = backups[projectId];
            if (serverProject) {
              const cleanedServerProject = cleanProjectDeletedItems(serverProject);
              saveProjectBackup(cleanedServerProject);
              try {
                localStorage.setItem(`automatiqa_project_backup_${projectId}`, JSON.stringify(cleanedServerProject));
              } catch (e) {}
            }
          });

          // Merge into active state so server backups are immediately available
          setProjects(prevProjects => {
            if (!prevProjects || prevProjects.length === 0) return prevProjects;
            return prevProjects.map(p => {
              const serverBackup = backups[p.id];
              if (!serverBackup) return p;
              const cleanBackup = cleanProjectDeletedItems(serverBackup);
              return mergeProjectWithBackupData(p, cleanBackup, getDeletedIds());
            });
          });
        }
      })
      .catch(() => {});
  }, []);

  // 1c. Real-time User Data Sync
  useEffect(() => {
    if (!isAuthReady || !user?.email || !auth.currentUser) return;

    const emailLower = user.email.toLowerCase().trim();
    const path = `users/${emailLower}`;
    const unsubUser = onSnapshot(doc(db, "users", emailLower), async (docSnap) => {
      if (docSnap.exists()) {
        const freshUserData = docSnap.data() as User;

        // Ensure sathya@qaoncloud.com is never treated as Super Admin
        if (emailLower === 'sathya@qaoncloud.com' && freshUserData.role === UserRole.SUPER_ADMIN) {
          syncUpdateDoc(doc(db, "users", emailLower), { role: UserRole.TEAM_MEMBER }).catch(() => {});
          freshUserData.role = UserRole.TEAM_MEMBER;
        }

        const isDefaultSuperAdmin = emailLower === 'shanmugapriya@qaoncloud.com' || emailLower === 'vinuta@qaoncloud.com' || emailLower === 'jagathesan@qaoncloud.com';

        // Auto-seed default super admins to Super Admin ONLY if role is completely undefined/blank
        if (isDefaultSuperAdmin && !freshUserData.role && !autoUpgradeAttemptedRef.current) {
          autoUpgradeAttemptedRef.current = true;
          try {
            await syncUpdateDoc(doc(db, "users", emailLower), { role: UserRole.SUPER_ADMIN });
            return; // The next snapshot from the database update will process the fresh state
          } catch (e) {
            console.error("Failed to auto-seed to Super Admin:", e);
          }
        }

        const freshAssigned = Array.isArray(freshUserData.assignedProjectIds)
          ? freshUserData.assignedProjectIds
          : (freshUserData.assignedProjectIds && typeof freshUserData.assignedProjectIds === 'object')
            ? Object.keys(freshUserData.assignedProjectIds)
            : [];

        const normalizedUser: User = {
          ...freshUserData,
          assignedProjectIds: freshAssigned
        };

        setUser(prev => {
           const prevAssigned = Array.isArray(prev?.assignedProjectIds)
             ? prev?.assignedProjectIds
             : (prev?.assignedProjectIds && typeof prev?.assignedProjectIds === 'object')
               ? Object.keys(prev?.assignedProjectIds)
               : [];

           if (prev && 
               prev.role === normalizedUser.role && 
               prev.name === normalizedUser.name &&
               JSON.stringify(prevAssigned) === JSON.stringify(freshAssigned)) {
             return prev;
           }
           return normalizedUser;
        });
        sessionStorage.setItem('automatiqa_user', JSON.stringify(normalizedUser));
      } else {
        // If user doc doesn't exist yet in this database, check seeded users and auto-provision
        const seeded = (seededUsers as any[]).find(u => u.id?.toLowerCase() === emailLower || u.data?.email?.toLowerCase() === emailLower);
        const seededData = seeded?.data;
        const isDefaultSuperAdmin = emailLower === 'shanmugapriya@qaoncloud.com' || emailLower === 'vinuta@qaoncloud.com' || emailLower === 'jagathesan@qaoncloud.com';
        
        const autoUser: User = {
          email: emailLower,
          name: seededData?.name || user.name || emailLower.split('@')[0],
          role: (seededData?.role as UserRole) || (isDefaultSuperAdmin ? UserRole.SUPER_ADMIN : (user.role || UserRole.TEAM_MEMBER)),
          assignedProjectIds: Array.isArray(seededData?.assignedProjectIds) ? seededData.assignedProjectIds : (user.assignedProjectIds || [])
        };

        try {
          await syncSetDoc(doc(db, "users", emailLower), { ...autoUser, status: 'active', createdAt: new Date().toISOString() });
        } catch (err) {
          console.warn("Auto-provision user document error:", err);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => unsubUser();
  }, [user?.email, isAuthReady, fallbackTrigger]);

  // 2. Real-time Notifications Listener
  useEffect(() => {
    if (!isAuthReady || !user || !auth.currentUser) {
      setNotifications([]);
      return;
    }

    const path = "notifications";
    const qNotifications = query(
      collection(db, path),
      where("recipientEmail", "==", user.email.toLowerCase()),
      limit(50)
    );

    const unsub = onSnapshot(qNotifications, (snap) => {
      const notes = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
      notes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setNotifications(notes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsub();
  }, [user?.email, isAuthReady, fallbackTrigger]);

  // Idle Logout Protocol (throttled to prevent event loop delay)
  useEffect(() => {
    if (!user) return;
    let idleTimer: number;
    let lastReset = Date.now();

    const resetIdleTimer = (force = false) => {
      const now = Date.now();
      if (!force && now - lastReset < 15000) {
        return; // Throttle: at most once every 15 seconds
      }
      lastReset = now;
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => handleLogout(), IDLE_TIMEOUT_MS);
    };

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(evt => window.addEventListener(evt, () => resetIdleTimer(), { passive: true }));
    resetIdleTimer(true);
    return () => {
      activityEvents.forEach(evt => window.removeEventListener(evt, () => resetIdleTimer()));
      if (idleTimer) window.clearTimeout(idleTimer);
    };
  }, [user]);

  // Real-time Firestore Sync for Projects
  useEffect(() => {
    if (!isAuthReady || !user || !auth.currentUser) {
      setProjects([]);
      return;
    }

    const path = "projects";
    const email = user.email.toLowerCase().trim();
    const projectsQuery = query(collection(db, path));

    const unsub = onSnapshot(projectsQuery, (snap) => {
      const rawProjectsData = snap.docs.map(d => {
        const data = d.data() as any;
        if (data && data.data && typeof data.data === 'object' && data.name === undefined) {
          return { id: d.id, ...data.data } as Project;
        }
        return { id: d.id, ...data } as Project;
      });
      rawProjectsData.forEach(p => {
        if (Array.isArray(p.deletedItemIds) && p.deletedItemIds.length > 0) {
          addDeletedIds(p.deletedItemIds);
        }
      });
      const deletedIds = getDeletedIds();
      
      const projectsData = rawProjectsData.map(p => {
        const rawScenarios = p.scenarios || [];
        const apiScenariosInScenarios = rawScenarios.filter((s: any) => isApiTestingScenario(s));
        let cleanScenarios = rawScenarios
          .filter((s: any) => !isApiTestingScenario(s) && !deletedIds.has(s.id))
          .map((s: any) => {
            if (Array.isArray(s.testCases)) {
              return {
                ...s,
                testCases: s.testCases.filter((tc: any) => 
                  !deletedIds.has(tc.id)
                )
              };
            }
            return s;
          });
        let cleanUserStories = (p.userStories || []).filter((s: any) => !deletedIds.has(s.id));
        const isAiScenarioCase = (c: any) => {
          if (!c) return false;
          if (c.isManual || c.isUploaded) return false;
          if (c.testCaseId && (c.testCaseId.startsWith('TC-MAN-') || c.testCaseId.startsWith('TC-MAN-UP-'))) return false;
          if (c.id && (c.id.startsWith('tc_man_') || c.id.startsWith('tc_man_up_'))) return false;
          if (c.id?.startsWith('tc_approved_') || c.id?.startsWith('TC-AI-')) return true;
          if (c.testCaseId?.startsWith('TC-AI-')) return true;
          if (c.testCaseId && /^TS-[\w-]+/i.test(c.testCaseId)) return true;
          if (c.id && /^TS-[\w-]+/i.test(c.id)) return true;
          return false;
        };

        let cleanManualCases = (p.manualTestCases || []).filter((s: any) => !deletedIds.has(s.id) && !isAiScenarioCase(s));
        let activeFolders = p.activeExecutionFolderIds || [];
        let excludedIdsList = p.excludedFromExecutionIds || [];

        const liveProject = projectsRef.current.find(pr => pr.id === p.id);
        const backupScenariosList: any[] = [];
        const backupUserStoriesList: any[] = [];
        if (liveProject?.scenarios) backupScenariosList.push(...liveProject.scenarios);
        if (liveProject?.userStories) backupUserStoriesList.push(...liveProject.userStories);

        const serverBackup = getProjectBackupSync(p.id);

        try {
          let localBackup = serverBackup;
          if (!localBackup) {
            const localBackupStr = localStorage.getItem(`automatiqa_project_backup_${p.id}`);
            if (localBackupStr) {
              localBackup = JSON.parse(localBackupStr);
            }
          }

          if (localBackup) {
            if (Array.isArray(localBackup.scenarios)) {
              backupScenariosList.push(...localBackup.scenarios);
            }
            if (Array.isArray(localBackup.userStories)) {
              backupUserStoriesList.push(...localBackup.userStories);
            }
            if (Array.isArray(localBackup.manualTestCases)) {
              const currentCaseIds = new Set(cleanManualCases.map((c: any) => c.id));
              const missingCases = localBackup.manualTestCases.filter((c: any) => 
                !currentCaseIds.has(c.id) && !deletedIds.has(c.id) && !isAiScenarioCase(c)
              );
              if (missingCases.length > 0) {
                cleanManualCases = [...cleanManualCases, ...missingCases];
              }

              // Merge latest test case properties (testType, status, evidence, etc.) from local backup
              const localCaseMap = new Map<string, any>();
              localBackup.manualTestCases.forEach((lc: any) => {
                if (lc.id) localCaseMap.set(lc.id, lc);
                if (lc.testCaseId) localCaseMap.set(lc.testCaseId, lc);
              });

              cleanManualCases = cleanManualCases.map((c: any) => {
                const local = localCaseMap.get(c.id) || (c.testCaseId ? localCaseMap.get(c.testCaseId) : undefined);
                if (local) {
                  return {
                    ...c,
                    testType: local.testType || c.testType,
                    status: local.status || c.status,
                    isApproved: local.isApproved !== undefined ? local.isApproved : c.isApproved,
                    title: local.title || c.title,
                    steps: local.steps || c.steps,
                    expectedResult: local.expectedResult || c.expectedResult,
                    evidence: local.evidence || c.evidence,
                    comments: local.comments || c.comments,
                    attachments: (local.attachments && local.attachments.length > 0) ? local.attachments : c.attachments,
                    links: (local.links && local.links.length > 0) ? local.links : c.links
                  };
                }
                return c;
              });
            }
            if ((!activeFolders || activeFolders.length === 0) && Array.isArray(localBackup?.activeExecutionFolderIds)) {
              activeFolders = localBackup.activeExecutionFolderIds;
            }
            if ((!excludedIdsList || excludedIdsList.length === 0) && Array.isArray(localBackup?.excludedFromExecutionIds)) {
              excludedIdsList = localBackup.excludedFromExecutionIds;
            }
          }
        } catch (e) {
          // Ignore
        }

        cleanScenarios = mergeScenariosWithBackup(p.id, cleanScenarios, backupScenariosList, deletedIds);
        cleanUserStories = mergeUserStoriesWithBackup(p.id, cleanUserStories, deletedIds, backupUserStoriesList);

        // Restore and preserve automation scripts & their attached evidence across reloads
        let cleanAutomationScripts = Array.isArray(p.automationScripts) ? [...p.automationScripts] : [];
        try {
          cleanAutomationScripts = mergeAutomationScriptsWithBackup(p.id, cleanAutomationScripts, deletedIds);
          const localBackupStr = localStorage.getItem(`automatiqa_project_backup_${p.id}`);
          if (localBackupStr) {
            const localBackup = JSON.parse(localBackupStr);
            if (localBackup && Array.isArray(localBackup.automationScripts)) {
              const scriptMap = new Map<string, any>();
              cleanAutomationScripts.forEach((s: any) => {
                if (s && s.id && !deletedIds.has(s.id) && !deletedIds.has(s.id.toLowerCase())) {
                  scriptMap.set(s.id, s);
                }
              });
              localBackup.automationScripts.forEach((localScript: any) => {
                if (!localScript || !localScript.id) return;
                if (deletedIds.has(localScript.id) || deletedIds.has(localScript.id.toLowerCase())) return;
                const existing = scriptMap.get(localScript.id);
                if (!existing) {
                  const deletedPaths = Array.isArray(localScript.deletedFilePaths) ? localScript.deletedFilePaths : [];
                  const cleanFiles = filterDeletedScriptFiles(localScript.files || [], deletedPaths);
                  scriptMap.set(localScript.id, { ...localScript, files: cleanFiles, deletedFilePaths: deletedPaths });
                } else {
                  // Keep local backup evidence, files, and notes if existing was stripped by size limits,
                  // but strictly respect deletedFilePaths so removed files never reappear
                  const allDeletedPaths = Array.from(new Set([
                    ...(existing.deletedFilePaths || []),
                    ...(localScript.deletedFilePaths || [])
                  ]));

                  const existingCleanFiles = filterDeletedScriptFiles(existing.files || [], allDeletedPaths);
                  const localCleanFiles = filterDeletedScriptFiles(localScript.files || [], allDeletedPaths);
                  const resolvedFiles = (existingCleanFiles.length > 0) ? existingCleanFiles : localCleanFiles;

                  const hasLocalEvidence = Boolean(
                    localScript.evidence ||
                    localScript.evidenceUrl ||
                    (localScript.attachments && localScript.attachments.length > 0) ||
                    (localScript.contextImages && localScript.contextImages.length > 0) ||
                    (localScript.links && localScript.links.length > 0) ||
                    localScript.lastExecutionNotes ||
                    localScript.comments
                  );
                  if (hasLocalEvidence || localCleanFiles.length > existingCleanFiles.length || allDeletedPaths.length > 0) {
                    scriptMap.set(localScript.id, {
                      ...existing,
                      files: resolvedFiles,
                      deletedFilePaths: allDeletedPaths,
                      content: existing.content || localScript.content,
                      evidence: existing.evidence || localScript.evidence,
                      evidenceUrl: existing.evidenceUrl || localScript.evidenceUrl,
                      attachments: (existing.attachments && existing.attachments.length > 0) ? existing.attachments : localScript.attachments,
                      contextImages: (existing.contextImages && existing.contextImages.length > 0) ? existing.contextImages : localScript.contextImages,
                      links: (existing.links && existing.links.length > 0) ? existing.links : localScript.links,
                      lastExecutionNotes: existing.lastExecutionNotes || localScript.lastExecutionNotes,
                      comments: existing.comments || localScript.comments,
                      lastExecutionStatus: existing.lastExecutionStatus || localScript.lastExecutionStatus
                    });
                  }
                }
              });
              cleanAutomationScripts = Array.from(scriptMap.values()).filter(
                (s: any) => s && s.id && !deletedIds.has(s.id) && !deletedIds.has(s.id.toLowerCase())
              );
            }
          }
        } catch (e) {}

        // Automatically consolidate any split imported scripts from the same folder into a single POM suite,
        // while preserving user approval status.
        const importedFolderMap = new Map<string, any[]>();
        const standaloneScripts: any[] = [];

        cleanAutomationScripts.forEach((s: any) => {
          if (s.isImported && s.folderName && s.folderName.trim() && s.folderName.toLowerCase() !== 'imported scripts') {
            const list = importedFolderMap.get(s.folderName) || [];
            list.push(s);
            importedFolderMap.set(s.folderName, list);
          } else {
            standaloneScripts.push(s);
          }
        });

        const consolidatedFolderScripts: any[] = [];
        importedFolderMap.forEach((folderScripts, folderName) => {
          if (folderScripts.length > 1) {
            const allFiles: { path: string; content: string }[] = [];
            folderScripts.forEach(s => {
              if (Array.isArray(s.files) && s.files.length > 0) {
                s.files.forEach((f: any) => {
                  if (!allFiles.some(existing => existing.path === f.path)) {
                    allFiles.push(f);
                  }
                });
              } else {
                const ext = s.language === 'Python' ? 'py' : s.language === 'Java' ? 'java' : s.language === 'C#' ? 'cs' : 'ts';
                const fileName = s.title && s.title.toLowerCase().includes('.') ? s.title : `${(s.title || 'test').toLowerCase()}.${ext}`;
                if (!allFiles.some(existing => existing.path === fileName)) {
                  allFiles.push({ path: fileName, content: s.content || '' });
                }
              }
            });

            const combinedContent = allFiles.map(f => {
              const ext = f.path.split('.').pop() || '';
              const langTag = ext === 'ts' ? 'typescript' : ext === 'js' ? 'javascript' : ext === 'py' ? 'python' : ext === 'java' ? 'java' : ext === 'json' ? 'json' : ext;
              return `### \`${f.path}\`\n\`\`\`${langTag}\n${f.content}\n\`\`\``;
            }).join('\n\n');

            const primary = folderScripts[0];
            const isFolderApproved = folderScripts.some(s => Boolean(s.isApproved));
            consolidatedFolderScripts.push({
              ...primary,
              id: primary.id,
              title: folderName,
              description: `Imported POM folder "${folderName}" with ${allFiles.length} files`,
              content: combinedContent,
              files: allFiles,
              isApproved: isFolderApproved,
              isImported: true,
              isSaved: true,
              folderName: folderName,
              folderId: primary.folderId || `folder-${folderName.toLowerCase().replace(/\s+/g, '-')}`
            });
          } else {
            const single = folderScripts[0];
            consolidatedFolderScripts.push({
              ...single,
              isApproved: Boolean(single.isApproved)
            });
          }
        });

        cleanAutomationScripts = [...consolidatedFolderScripts, ...standaloneScripts];

        // Restore and preserve folders, flows, reports, inputs, reviews, and API testing artifacts across reloads
        let cleanAutomationFolders = Array.isArray(p.automationFolders) 
          ? p.automationFolders.filter((f: any) => {
              if (!f || deletedIds.has(f.id)) return false;
              // Clean up empty folders with 0 scripts that originated from test case approvals
              if (f.type === 'script_generator' && !(f as any).isUserCreatedScriptFolder) {
                const fName = (f.name || '').trim().toLowerCase();
                const hasScripts = cleanAutomationScripts.some(
                  (s: any) => (s.folderName || '').trim().toLowerCase() === fName || s.folderId === f.id
                );
                if (!hasScripts) return false;
              }
              return true;
            }) 
          : [];
        let cleanRecordedFlows = Array.isArray(p.recordedFlows) ? p.recordedFlows.filter((f: any) => !deletedIds.has(f.id)) : [];
        let cleanUploadVideoFlows = Array.isArray(p.uploadVideoFlows) ? p.uploadVideoFlows.filter((f: any) => !deletedIds.has(f.id)) : [];
        let cleanUITestingFolders = Array.isArray(p.uiTestingFolders) ? p.uiTestingFolders.filter((f: any) => !deletedIds.has(f.id)) : [];
        let cleanUITestingReports = Array.isArray(p.uiTestingReports) ? p.uiTestingReports.filter((r: any) => !deletedIds.has(r.id)) : [];
        let cleanUITestingInputs = Array.isArray(p.uiTestingInputs) ? p.uiTestingInputs.filter((i: any) => !deletedIds.has(i.id)) : [];
        let cleanFigmaDesignReviews = Array.isArray(p.figmaDesignReviews) ? p.figmaDesignReviews.filter((f: any) => !deletedIds.has(f.id)) : [];
        let cleanUIComparisonReports = Array.isArray(p.uiComparisonReports) ? p.uiComparisonReports.filter((c: any) => !deletedIds.has(c.id)) : [];
        let cleanApiWorkspaces = Array.isArray(p.apiWorkspaces) ? p.apiWorkspaces : [];
        let cleanApiHistory = Array.isArray(p.apiHistory) ? p.apiHistory : [];
        let cleanApiScenarios = Array.isArray(p.apiScenarios) ? p.apiScenarios.filter((s: any) => !deletedIds.has(s.id)) : [];
        let cleanApiTestSuites = Array.isArray(p.apiTestSuites) ? [...p.apiTestSuites] : [];
        let cleanPerformanceScripts = Array.isArray(p.performanceScripts) ? [...p.performanceScripts] : [];

        // If any API scenarios were historically saved inside scenarios, migrate them into cleanApiScenarios
        if (apiScenariosInScenarios.length > 0) {
          const existingIds = new Set(cleanApiScenarios.map((s: any) => s.id));
          apiScenariosInScenarios.forEach((s: any) => {
            if (!existingIds.has(s.id) && !deletedIds.has(s.id)) {
              existingIds.add(s.id);
              cleanApiScenarios.push(s);
            }
          });
        }

        try {
          let localBackup = serverBackup;
          if (!localBackup) {
            const localBackupStr = localStorage.getItem(`automatiqa_project_backup_${p.id}`);
            if (localBackupStr) {
              localBackup = JSON.parse(localBackupStr);
            }
          }

          if (localBackup) {
            const inMemoryProjEarly = projectsRef.current.find(proj => proj.id === p.id);
            const inMemoryFoldersEarly = inMemoryProjEarly?.automationFolders || [];
            const inMemoryFlowsEarly = inMemoryProjEarly?.recordedFlows || [];
            const inMemoryUploadEarly = inMemoryProjEarly?.uploadVideoFlows || [];

            cleanAutomationFolders = mergeFoldersWithBackup(
              p.id, 
              cleanAutomationFolders, 
              deletedIds, 
              [...(Array.isArray(localBackup.automationFolders) ? localBackup.automationFolders : []), ...inMemoryFoldersEarly]
            );

            cleanRecordedFlows = mergeRecordedFlowsWithBackup(
              p.id, 
              cleanRecordedFlows, 
              deletedIds, 
              [...(Array.isArray(localBackup.recordedFlows) ? localBackup.recordedFlows : []), ...inMemoryFlowsEarly]
            );

            cleanUploadVideoFlows = mergeUploadVideoFlowsWithBackup(
              p.id, 
              cleanUploadVideoFlows, 
              deletedIds, 
              [...(Array.isArray(localBackup.uploadVideoFlows) ? localBackup.uploadVideoFlows : []), ...inMemoryUploadEarly]
            );

            if (Array.isArray(localBackup.uiTestingFolders)) {
              const uifMap = new Map<string, any>();
              cleanUITestingFolders.forEach(f => uifMap.set(f.id, f));
              localBackup.uiTestingFolders.forEach((f: any) => {
                if (!uifMap.has(f.id) && !deletedIds.has(f.id)) uifMap.set(f.id, f);
              });
              cleanUITestingFolders = Array.from(uifMap.values());
            }

            cleanUITestingReports = mergeUITestingReportsWithBackup(
              p.id,
              cleanUITestingReports,
              deletedIds,
              localBackup.uiTestingReports || []
            );

            cleanUITestingInputs = mergeUITestingInputsWithBackup(
              p.id,
              cleanUITestingInputs,
              deletedIds,
              localBackup.uiTestingInputs || []
            );

            if (Array.isArray(localBackup.figmaDesignReviews)) {
              const figMap = new Map<string, any>();
              cleanFigmaDesignReviews.forEach(f => figMap.set(f.id, f));
              localBackup.figmaDesignReviews.forEach((f: any) => {
                if (!figMap.has(f.id) && !deletedIds.has(f.id)) figMap.set(f.id, f);
              });
              cleanFigmaDesignReviews = Array.from(figMap.values());
            }
            if (Array.isArray(localBackup.uiComparisonReports)) {
              const compMap = new Map<string, any>();
              cleanUIComparisonReports.forEach(c => compMap.set(c.id, c));
              localBackup.uiComparisonReports.forEach((c: any) => {
                if (!compMap.has(c.id) && !deletedIds.has(c.id)) compMap.set(c.id, c);
              });
              cleanUIComparisonReports = Array.from(compMap.values());
            }
            if (Array.isArray(localBackup.apiScenarios)) {
              const apiMap = new Map<string, any>();
              cleanApiScenarios.forEach(s => apiMap.set(s.id, s));
              localBackup.apiScenarios.forEach((s: any) => {
                if (!apiMap.has(s.id) && !deletedIds.has(s.id)) apiMap.set(s.id, s);
              });
              cleanApiScenarios = Array.from(apiMap.values());
            }
            if (Array.isArray(localBackup.apiTestSuites)) {
                const suiteMap = new Map<string, any>();
                cleanApiTestSuites.forEach(s => suiteMap.set(s.id, s));
                localBackup.apiTestSuites.forEach((backupSuite: any) => {
                  if (!backupSuite || !backupSuite.id || deletedIds.has(backupSuite.id)) return;
                  const existing = suiteMap.get(backupSuite.id);
                  if (!existing) {
                    suiteMap.set(backupSuite.id, backupSuite);
                  } else {
                    const mergedResults = { ...(existing.scenarioResults || {}) };
                    const backupResults = backupSuite.scenarioResults || {};
                    Object.keys(backupResults).forEach(k => {
                      if (!mergedResults[k] || backupResults[k]?.status) {
                        mergedResults[k] = { ...(mergedResults[k] || {}), ...backupResults[k] };
                      }
                    });
                    suiteMap.set(backupSuite.id, {
                      ...existing,
                      ...backupSuite,
                      scenarioResults: mergedResults
                    });
                  }
                });
                cleanApiTestSuites = Array.from(suiteMap.values());
              }
              if (Array.isArray(localBackup.apiHistory)) {
                const histMap = new Map<string, any>();
                cleanApiHistory.forEach(h => histMap.set(h.id, h));
                localBackup.apiHistory.forEach((h: any) => {
                  if (!histMap.has(h.id) && !deletedIds.has(h.id)) histMap.set(h.id, h);
                });
                cleanApiHistory = Array.from(histMap.values());
              }
              if (Array.isArray(localBackup.apiWorkspaces)) {
                const wsMap = new Map<string, any>();
                cleanApiWorkspaces.forEach(w => wsMap.set(w.id, w));
                localBackup.apiWorkspaces.forEach((backupWs: any) => {
                  if (!wsMap.has(backupWs.id) && !deletedIds.has(backupWs.id)) {
                    wsMap.set(backupWs.id, backupWs);
                  } else if (wsMap.has(backupWs.id)) {
                    const currentWs = wsMap.get(backupWs.id);
                    const colMap = new Map<string, any>();
                    (currentWs.collections || []).forEach((c: any) => colMap.set(c.id, c));

                    (backupWs.collections || []).forEach((backupCol: any) => {
                      if (!colMap.has(backupCol.id) && !deletedIds.has(backupCol.id)) {
                        colMap.set(backupCol.id, backupCol);
                      } else if (colMap.has(backupCol.id)) {
                        const currentCol = colMap.get(backupCol.id);
                        
                        // Merge folders
                        const folderMap = new Map<string, any>();
                        (currentCol.folders || []).forEach((f: any) => folderMap.set(f.id, f));
                        (backupCol.folders || []).forEach((backupFolder: any) => {
                          if (!folderMap.has(backupFolder.id) && !deletedIds.has(backupFolder.id)) {
                            folderMap.set(backupFolder.id, backupFolder);
                          } else if (folderMap.has(backupFolder.id)) {
                            const curFolder = folderMap.get(backupFolder.id);
                            const reqMap = new Map<string, any>();
                            (curFolder.requests || []).forEach((r: any) => reqMap.set(r.id, r));
                            (backupFolder.requests || []).forEach((br: any) => {
                              if (!reqMap.has(br.id) && !deletedIds.has(br.id)) {
                                reqMap.set(br.id, br);
                              } else if (reqMap.has(br.id)) {
                                const cr = reqMap.get(br.id);
                                if (br.savedResponse && !cr.savedResponse) {
                                  reqMap.set(br.id, { ...cr, savedResponse: br.savedResponse });
                                }
                              }
                            });
                            folderMap.set(backupFolder.id, {
                              ...curFolder,
                              requests: Array.from(reqMap.values())
                            });
                          }
                        });

                        // Merge collection requests
                        const colReqMap = new Map<string, any>();
                        (currentCol.requests || []).forEach((r: any) => colReqMap.set(r.id, r));
                        (backupCol.requests || []).forEach((br: any) => {
                          if (!colReqMap.has(br.id) && !deletedIds.has(br.id)) {
                            colReqMap.set(br.id, br);
                          } else if (colReqMap.has(br.id)) {
                            const cr = colReqMap.get(br.id);
                            if (br.savedResponse && !cr.savedResponse) {
                              colReqMap.set(br.id, { ...cr, savedResponse: br.savedResponse });
                            }
                          }
                        });

                        colMap.set(backupCol.id, {
                          ...currentCol,
                          folders: Array.from(folderMap.values()),
                          requests: Array.from(colReqMap.values())
                        });
                      }
                    });

                    // Merge workspace requests
                    const wsReqMap = new Map<string, any>();
                    (currentWs.requests || []).forEach((r: any) => wsReqMap.set(r.id, r));
                    (backupWs.requests || []).forEach((br: any) => {
                      if (!wsReqMap.has(br.id) && !deletedIds.has(br.id)) {
                        wsReqMap.set(br.id, br);
                      } else if (wsReqMap.has(br.id)) {
                        const cr = wsReqMap.get(br.id);
                        if (br.savedResponse && !cr.savedResponse) {
                          wsReqMap.set(br.id, { ...cr, savedResponse: br.savedResponse });
                        }
                      }
                    });

                    wsMap.set(backupWs.id, {
                      ...currentWs,
                      collections: Array.from(colMap.values()),
                      requests: Array.from(wsReqMap.values())
                    });
                  }
                });
                cleanApiWorkspaces = Array.from(wsMap.values());
              }
              // Merge performance scripts and JMX artifacts with in-memory cache, React live state, and dedicated storage
              const inMemoryProj = projectsRef.current.find(proj => proj.id === p.id);
              const inMemoryScripts = inMemoryProj?.performanceScripts || [];
              cleanPerformanceScripts = mergePerformanceScriptsWithBackup(
                p.id,
                cleanPerformanceScripts,
                deletedIds,
                inMemoryScripts
              );
            }
        } catch (e) {}

        // Secondary safety: guarantee folders, flows, performance scripts, and UI Testing items are merged with backup and in-memory cache even if localBackup was empty
        const inMemoryProj = projectsRef.current.find(proj => proj.id === p.id);
        const inMemoryScripts = inMemoryProj?.performanceScripts || [];
        const inMemoryFolders = inMemoryProj?.automationFolders || [];
        const inMemoryFlows = inMemoryProj?.recordedFlows || [];
        const inMemoryUpload = inMemoryProj?.uploadVideoFlows || [];
        const inMemoryUIFolders = inMemoryProj?.uiTestingFolders || [];
        const inMemoryUIReports = inMemoryProj?.uiTestingReports || [];
        const inMemoryUIInputs = inMemoryProj?.uiTestingInputs || [];
        const inMemoryFigmaReviews = inMemoryProj?.figmaDesignReviews || [];
        const inMemoryUIComparisons = inMemoryProj?.uiComparisonReports || [];

        cleanAutomationFolders = mergeFoldersWithBackup(
          p.id,
          cleanAutomationFolders,
          deletedIds,
          inMemoryFolders
        );
        cleanRecordedFlows = mergeRecordedFlowsWithBackup(
          p.id,
          cleanRecordedFlows,
          deletedIds,
          inMemoryFlows
        );
        cleanUploadVideoFlows = mergeUploadVideoFlowsWithBackup(
          p.id,
          cleanUploadVideoFlows,
          deletedIds,
          inMemoryUpload
        );
        cleanPerformanceScripts = mergePerformanceScriptsWithBackup(
          p.id,
          cleanPerformanceScripts,
          deletedIds,
          inMemoryScripts
        );
        cleanUITestingFolders = mergeUITestingFoldersWithBackup(
          p.id,
          cleanUITestingFolders,
          deletedIds,
          inMemoryUIFolders
        );
        cleanUITestingReports = mergeUITestingReportsWithBackup(
          p.id,
          cleanUITestingReports,
          deletedIds,
          inMemoryUIReports
        );
        cleanUITestingInputs = mergeUITestingInputsWithBackup(
          p.id,
          cleanUITestingInputs,
          deletedIds,
          inMemoryUIInputs
        );
        cleanFigmaDesignReviews = mergeFigmaDesignReviewsWithBackup(
          p.id,
          cleanFigmaDesignReviews,
          deletedIds,
          inMemoryFigmaReviews
        );
        cleanUIComparisonReports = mergeUIComparisonReportsWithBackup(
          p.id,
          cleanUIComparisonReports,
          deletedIds,
          inMemoryUIComparisons
        );

        const inMemorySuites = inMemoryProj?.apiTestSuites || [];
        if (inMemorySuites.length > 0) {
          const suiteMap = new Map<string, any>();
          cleanApiTestSuites.forEach(s => suiteMap.set(s.id, s));
          inMemorySuites.forEach((inMemSuite: any) => {
            if (!inMemSuite || !inMemSuite.id || deletedIds.has(inMemSuite.id)) return;
            const existing = suiteMap.get(inMemSuite.id);
            if (!existing) {
              suiteMap.set(inMemSuite.id, inMemSuite);
            } else {
              const mergedResults = { ...(existing.scenarioResults || {}) };
              const inMemResults = inMemSuite.scenarioResults || {};
              Object.keys(inMemResults).forEach(k => {
                if (!mergedResults[k] || inMemResults[k]?.status) {
                  mergedResults[k] = { ...(mergedResults[k] || {}), ...inMemResults[k] };
                }
              });
              suiteMap.set(inMemSuite.id, {
                ...existing,
                ...inMemSuite,
                scenarioResults: mergedResults
              });
            }
          });
          cleanApiTestSuites = Array.from(suiteMap.values());
        }

        try {
          const localStoredFolders = localStorage.getItem(`automatiqa_active_execution_folders_${p.id}`);
          if (localStoredFolders) {
            const parsedStored = JSON.parse(localStoredFolders);
            if (Array.isArray(parsedStored) && parsedStored.length > 0) {
              const mergedFolders = new Set([...activeFolders, ...parsedStored]);
              activeFolders = Array.from(mergedFolders);
            }
          }
        } catch (e) {}

        return syncFolderReferences({
          ...p,
          scenarios: cleanScenarios,
          userStories: cleanUserStories,
          manualTestCases: cleanManualCases,
          automationScripts: cleanAutomationScripts,
          automationFolders: cleanAutomationFolders,
          recordedFlows: cleanRecordedFlows,
          uploadVideoFlows: cleanUploadVideoFlows,
          uiTestingFolders: cleanUITestingFolders,
          uiTestingReports: cleanUITestingReports,
          uiTestingInputs: cleanUITestingInputs,
          figmaDesignReviews: cleanFigmaDesignReviews,
          uiComparisonReports: cleanUIComparisonReports,
          apiWorkspaces: cleanApiWorkspaces,
          apiHistory: cleanApiHistory,
          apiScenarios: cleanApiScenarios,
          apiTestSuites: cleanApiTestSuites,
          performanceScripts: cleanPerformanceScripts,
          activeExecutionFolderIds: activeFolders,
          excludedFromExecutionIds: excludedIdsList
        });
      });

      let filtered: Project[] = [];
      const userRoleLower = (user.role as string | undefined)?.toLowerCase().trim();
      const isSuperAdminUser = user.role === UserRole.SUPER_ADMIN || 
                               userRoleLower === 'super admin' || 
                               email === 'shanmugapriya@qaoncloud.com' ||
                               email === 'vinuta@qaoncloud.com' ||
                               email === 'jagathesan@qaoncloud.com';

      if (isSuperAdminUser) {
         // Super Admin - Able to access all the projects
         filtered = projectsData;
      } else {
         // Admin and Team members - Access allocated project
         let rawAssigned: string[] = [];
         if (Array.isArray(user.assignedProjectIds)) {
           rawAssigned = user.assignedProjectIds.map(x => String(x));
         } else if (user.assignedProjectIds && typeof user.assignedProjectIds === 'object') {
           rawAssigned = Object.keys(user.assignedProjectIds);
         }

         // Fallback to seeded data if rawAssigned is empty
         if (rawAssigned.length === 0) {
           const seeded = (seededUsers as any[]).find(u => u.id?.toLowerCase() === email || u.data?.email?.toLowerCase() === email);
           if (seeded?.data?.assignedProjectIds && Array.isArray(seeded.data.assignedProjectIds)) {
             rawAssigned = seeded.data.assignedProjectIds.map((x: any) => String(x));
           }
         }

         const assignedIds = new Set(rawAssigned);

         filtered = projectsData.filter(p => {
           const ownerMatch = p.ownerEmail?.toLowerCase().trim() === email;
           
           let allocatedMatch = false;
           if (Array.isArray(p.allocatedUserEmails)) {
             allocatedMatch = p.allocatedUserEmails.some(e => typeof e === 'string' && e.toLowerCase().trim() === email);
           } else if (p.allocatedUserEmails && typeof p.allocatedUserEmails === 'object') {
             allocatedMatch = Object.keys(p.allocatedUserEmails).some(e => e.toLowerCase().trim() === email) ||
                              Object.values(p.allocatedUserEmails).some(e => typeof e === 'string' && e.toLowerCase().trim() === email);
           }

           let roleMatch = false;
           if (p.projectRoles && typeof p.projectRoles === 'object') {
             roleMatch = Object.keys(p.projectRoles).some(k => k.toLowerCase().trim() === email);
           }

           const assignedIdMatch = assignedIds.has(p.id);

           return ownerMatch || allocatedMatch || roleMatch || assignedIdMatch;
         });
      }
      setProjects(filtered);
      try {
        localStorage.setItem('automatiqa_projects_cache', JSON.stringify(filtered));
      } catch (e) {}
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsub();
  }, [user?.email, user?.role, JSON.stringify(user?.assignedProjectIds), isAuthReady, fallbackTrigger]);

  // Sync activeTab to localStorage and window hash for seamless page refreshes
  useEffect(() => {
    try {
      localStorage.setItem('automatiqa_active_tab', activeTab);
      if (typeof window !== 'undefined' && window.location.hash !== `#${activeTab}`) {
        window.history.replaceState(null, '', `#${activeTab}`);
      }
    } catch (e) {}
  }, [activeTab]);

  // Auto-select first project if none selected
  useEffect(() => {
    if (user && projects.length > 0 && !selectedProjectId) {
      const savedId = localStorage.getItem(`automatiqa_last_project_${user.email.toLowerCase()}`) || localStorage.getItem('automatiqa_selected_project_id');
      if (savedId && projects.some(p => p.id === savedId)) {
        setSelectedProjectId(savedId);
      } else {
        setSelectedProjectId(projects[0].id);
      }
    }
  }, [projects, user, selectedProjectId]);

  // --- PERSISTENCE LOGIC: Last Accessed Project ---
  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem('automatiqa_selected_project_id', selectedProjectId);
      if (user) {
        localStorage.setItem(`automatiqa_last_project_${user.email.toLowerCase()}`, selectedProjectId);
      }
    }
  }, [selectedProjectId, user]);

  useEffect(() => {
    if (selectedProjectId && projects.length > 0) {
      if (!projects.some(p => p.id === selectedProjectId)) {
        setSelectedProjectId(projects[0]?.id || null);
      }
    }
  }, [projects, selectedProjectId]);

  // Load subcollection folders and stories from Firestore for selected project
  useEffect(() => {
    if (!selectedProjectId) return;
    loadAllProjectFoldersAndStories(selectedProjectId).then(hierarchy => {
      if (hierarchy && hierarchy.allStoriesAndFolders && hierarchy.allStoriesAndFolders.length > 0) {
        setProjects(prev => prev.map(p => {
          if (p.id === selectedProjectId) {
            const merged = mergeUserStoriesWithBackup(p.id, p.userStories || [], getDeletedIds(), hierarchy.allStoriesAndFolders);
            return {
              ...p,
              userStories: merged
            };
          }
          return p;
        }));
      }
    }).catch(err => console.warn('[App] Error loading subcollection stories for project:', err));
  }, [selectedProjectId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (switchDropdownRef.current && !switchDropdownRef.current.contains(event.target as Node)) {
        setIsSwitchProjectOpen(false);
      }
      if (notificationDropdownRef.current && !notificationDropdownRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
    try {
      sessionStorage.setItem('automatiqa_user', JSON.stringify(userData));
      localStorage.setItem('automatiqa_user', JSON.stringify(userData));
    } catch (e) {}
  };

  const handleLogout = async () => {
    await performSafeLogout();
    setUser(null);
    try {
      localStorage.removeItem('automatiqa_active_tab');
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '#dashboard');
      }
    } catch (e) {}
    setActiveTab('dashboard');
    setSelectedProjectId(null);
  };

  const activeProject = projects.find(p => p.id === selectedProjectId) || projects[0];

  // Sync active project and user details globally for AI token consumption and feature logging
  useEffect(() => {
    if (activeProject) {
      const activeProjName = activeProject.name || (activeProject as any).data?.name;
      if (activeProjName && activeProjName !== 'undefined' && activeProjName !== 'UNDEFINED' && activeProjName !== 'null') {
        try {
          localStorage.setItem('automatiqa_active_project_name', activeProjName);
          localStorage.setItem('automatiqa_active_project_id', activeProject.id);
        } catch (e) {}
        if (typeof window !== 'undefined') {
          (window as any).__automatiqa_active_project_name = activeProjName;
          (window as any).__automatiqa_active_project_id = activeProject.id;
        }
      }
    }
  }, [activeProject?.id, activeProject?.name]);

  useEffect(() => {
    if (user) {
      const uAny = user as any;
      const userId = uAny.id || uAny.uid || (user.email ? user.email.split('@')[0] : 'Shanmugapriya');
      try {
        localStorage.setItem('automatiqa_user_name', user.name || 'Shanmugapriya');
        localStorage.setItem('automatiqa_user_email', user.email || 'shanmugapriya@qaoncloud.com');
        localStorage.setItem('automatiqa_user_id', userId);
      } catch (e) {}
      if (typeof window !== 'undefined') {
        (window as any).__automatiqa_user = user;
        (window as any).__automatiqa_user_name = user.name || 'Shanmugapriya';
        (window as any).__automatiqa_user_email = user.email || 'shanmugapriya@qaoncloud.com';
        (window as any).__automatiqa_user_id = userId;
      }
    }
  }, [user]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__automatiqa_active_tab = activeTab;
      localStorage.setItem('automatiqa_active_tab', activeTab);
    }
  }, [activeTab]);

  const switcherProjects = useMemo(() => {
    if (!user) return [];
    // For Admins and other roles, 'projects' state is already filtered correctly in the listener
    // Admins get all projects, while others get only their assigned/owned ones.
    return projects;
  }, [projects, user]);

  const rawContextualUser: User | null = user ? {
    ...user,
    role: (() => {
      const userRoleLower = (user.role as string | undefined)?.toLowerCase().trim();
      if (user.role === UserRole.SUPER_ADMIN || userRoleLower === 'super admin') return UserRole.SUPER_ADMIN;
      if (!activeProject) return user.role;
      const emailLower = user.email.toLowerCase().trim();
      if (activeProject.ownerEmail?.toLowerCase().trim() === emailLower) {
        return UserRole.ADMIN;
      }
      const pRole = activeProject.projectRoles?.[emailLower];
      if (pRole === 'Admin') return UserRole.ADMIN;
      if (pRole === 'Team Member') return UserRole.TEAM_MEMBER;
      return user.role;
    })()
  } : null;

  const isSuperAdmin = Boolean(
    user && (() => {
      const globalRole = (user.role as string | undefined)?.toLowerCase().trim();
      const contextualRole = (rawContextualUser?.role as string | undefined)?.toLowerCase().trim();

      // If either global or contextual role is explicitly Admin, Team Member, DM, or Spoc, NEVER grant Super Admin
      if (
        globalRole === 'admin' || 
        contextualRole === 'admin' ||
        globalRole === 'team member' ||
        contextualRole === 'team member' ||
        globalRole === 'delivery manager' ||
        contextualRole === 'delivery manager' ||
        globalRole === 'spoc' ||
        contextualRole === 'spoc'
      ) {
        return false;
      }

      // Check for Super Admin role
      if (
        user.role === UserRole.SUPER_ADMIN ||
        globalRole === 'super admin' ||
        rawContextualUser?.role === UserRole.SUPER_ADMIN ||
        contextualRole === 'super admin'
      ) {
        return true;
      }

      // Default fallback ONLY if no explicit role is defined at all
      const email = user.email?.toLowerCase().trim();
      if (!user.role && (email === 'shanmugapriya@qaoncloud.com' || email === 'vinuta@qaoncloud.com' || email === 'jagathesan@qaoncloud.com')) {
        return true;
      }

      return false;
    })()
  );

  const isGlobalAdmin = user ? (
    user.role === UserRole.SUPER_ADMIN || 
    user.role === UserRole.ADMIN ||
    (user.role as string)?.toLowerCase().trim() === 'super admin' ||
    (user.role as string)?.toLowerCase().trim() === 'admin'
  ) : false;
  
  const isAdmin = rawContextualUser ? (
    rawContextualUser.role === UserRole.SUPER_ADMIN || 
    rawContextualUser.role === UserRole.ADMIN ||
    (rawContextualUser.role as string)?.toLowerCase().trim() === 'super admin' ||
    (rawContextualUser.role as string)?.toLowerCase().trim() === 'admin'
  ) : false;

  const canViewReports = rawContextualUser ? (
    rawContextualUser.role === UserRole.SUPER_ADMIN || 
    rawContextualUser.role === UserRole.DELIVERY_MANAGER || 
    rawContextualUser.role === UserRole.SPOC || 
    rawContextualUser.role === UserRole.ADMIN ||
    (rawContextualUser.role as string)?.toLowerCase().trim() === 'super admin' ||
    (rawContextualUser.role as string)?.toLowerCase().trim() === 'admin'
  ) : false;

  // Immediate navigation guard: if non-SuperAdmin user is on a SuperAdmin-only tab, redirect them to dashboard
  useEffect(() => {
    if (!isSuperAdmin && ['web_performance', 'functional_performance', 'jmeter_performance'].includes(activeTab)) {
      setActiveTab('dashboard');
    }
    // Team member role: Credit Consumption page should not be visible / accessible at all
    if (!isSuperAdmin && !isAdmin && !isGlobalAdmin && (activeTab as string) === 'settings_credits') {
      setActiveTab('dashboard');
    }
  }, [isSuperAdmin, isAdmin, isGlobalAdmin, activeTab]);

  const updateProject = async (updatedProject: Project, options?: { immediate?: boolean }): Promise<void> => {
    if (!updatedProject?.id) return;
    
    // Ensure all permanently deleted items are stripped
    const cleanUpdatedProject = cleanProjectDeletedItems(updatedProject);

    // Save multi-tier backup (in-memory, IndexedDB, localStorage, and server backup)
    saveProjectBackup(cleanUpdatedProject);

    // Save immediate local backup synchronously so onSnapshot never sees a stale state
    try {
      if (Array.isArray(cleanUpdatedProject.performanceScripts)) {
        localStorage.setItem(`automatiqa_perf_scripts_${cleanUpdatedProject.id}`, JSON.stringify(cleanUpdatedProject.performanceScripts));
      }
      localStorage.setItem(`automatiqa_project_backup_${cleanUpdatedProject.id}`, JSON.stringify(cleanUpdatedProject));
      const cached = localStorage.getItem('automatiqa_projects_cache');
      if (cached) {
        const list = JSON.parse(cached);
        const next = list.map((p: any) => p.id === cleanUpdatedProject.id ? cleanUpdatedProject : p);
        localStorage.setItem('automatiqa_projects_cache', JSON.stringify(next));
      }
    } catch (e) {}

    // Update state immediately without blocking on JSON serialization or Firestore network calls
    setProjects(prevProjects => 
      prevProjects.map(p => p.id === cleanUpdatedProject.id ? { ...cleanUpdatedProject } : p)
    );

    // Trigger Firestore update; if immediate is requested, await it directly
    try {
      if (options?.immediate) {
        await updateProjectFirestore(cleanUpdatedProject.id, cleanUpdatedProject, { immediate: true });
      } else {
        await updateProjectFirestore(cleanUpdatedProject.id, cleanUpdatedProject);
      }
    } catch (err: any) {
      console.warn("Firestore update notice:", err);
      throw err;
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, visible: true, type });
    setTimeout(() => { setToast(prev => prev ? { ...prev, visible: false } : null); }, 4000);
  };

  const handleRunFolder = (folderId: string) => {
    const folder = activeProject.scenarios.find(s => s.id === folderId);
    if (!folder) return;

    // Safely collect all direct and member scenario cases belonging to this folder
    const directCases = Array.isArray(folder.testCases) ? folder.testCases : [];
    const memberScenarios = (activeProject.scenarios || []).filter(sc => 
      (folder.memberScenarioIds?.includes(sc.id) || sc.folderId === folder.id) &&
      !sc.isFolder && sc.scenarioId !== 'TESTCASE_FOLDER' && sc.scenarioId !== 'MANUAL_FOLDER'
    );
    const memberCases: TestCase[] = [];
    memberScenarios.forEach(ms => {
      if (Array.isArray(ms.testCases) && ms.testCases.length > 0) {
        memberCases.push(...ms.testCases);
      } else if (ms.title) {
        memberCases.push({
          id: `tc_${ms.id}`,
          testCaseId: ms.scenarioId || `TC-${ms.id.slice(-5)}`,
          title: ms.title,
          description: ms.description,
          steps: ms.description ? [ms.description] : ['Execute test scenario procedure'],
          expectedResult: ms.expectedResults || 'Execution validates requirements successfully.',
          status: ms.status || TestStatus.NOT_EXECUTED,
          isApproved: Boolean(ms.isApproved),
          priority: (ms.priority as TestPriority) || TestPriority.MEDIUM,
          testType: ms.type === 'Non-functional' ? TestType.NON_FUNCTIONAL : TestType.FUNCTIONAL,
          testIntent: TestIntent.POSITIVE,
          scenarioId: ms.id
        });
      }
    });

    const folderCases = [...directCases];
    const seenIds = new Set(directCases.map(c => c.id));
    memberCases.forEach(c => {
      if (!seenIds.has(c.id)) {
        folderCases.push(c);
        seenIds.add(c.id);
      }
    });

    if (folderCases.length === 0) {
      showToast('Add at least one test case to the folder.', 'error');
      return;
    }

    const currentActiveFolders = activeProject.activeExecutionFolderIds || [];
    let updatedActiveFolders = [...currentActiveFolders];
    if (!updatedActiveFolders.includes(folderId)) {
        updatedActiveFolders.push(folderId);
    }

    // Reset test case results for a fresh execution (Project-wide for these case IDs)
    const caseIdsToReset = new Set(folderCases.map(tc => tc.id));
    
    const updatedScenarios = activeProject.scenarios.map(s => {
      const isTargetFolder = s.id === folderId;
      const effectiveCases = isTargetFolder && (!s.testCases || s.testCases.length === 0) ? folderCases : (s.testCases || []);
      return {
        ...s,
        testCases: effectiveCases.map(tc => {
          if (caseIdsToReset.has(tc.id)) {
            return {
              ...tc,
              status: TestStatus.NOT_EXECUTED,
              executedAt: undefined,
              comments: '',
              attachments: [],
              links: [],
              evidence: ''
            };
          }
          return tc;
        })
      };
    });

    const updatedManualCases = (activeProject.manualTestCases || []).map(tc => {
      if (caseIdsToReset.has(tc.id)) {
        return {
          ...tc,
          status: TestStatus.NOT_EXECUTED,
          executedAt: undefined,
          comments: '',
          attachments: [],
          links: [],
          evidence: ''
        };
      }
      return tc;
    });

    const caseIdsInFolder = folderCases.map(tc => tc.id);
    const updatedExcludedIds = (activeProject.excludedFromExecutionIds || []).filter(
      id => id !== folderId && !caseIdsInFolder.includes(id)
    );

    const updatedProject: Project = {
        ...activeProject,
        scenarios: updatedScenarios,
        manualTestCases: updatedManualCases,
        activeExecutionFolderIds: updatedActiveFolders,
        excludedFromExecutionIds: updatedExcludedIds
    };

    updateProject(updatedProject);

    try {
      localStorage.setItem('automatiqa_active_folder_run', folderId);
      localStorage.setItem(`automatiqa_active_folder_run_${activeProject.id}`, folderId);
      const curStored = localStorage.getItem(`automatiqa_active_execution_folders_${activeProject.id}`);
      const storedSet = new Set(curStored ? JSON.parse(curStored) : []);
      storedSet.add(folderId);
      localStorage.setItem(`automatiqa_active_execution_folders_${activeProject.id}`, JSON.stringify(Array.from(storedSet)));
    } catch (e) {}

    if (user) {
       logActivity(user.email, user.name, `Initiated Functional Execution for folder: ${folder.title}`, activeProject.id, activeProject.name);
    }

    showToast('Testcase added to the execution queue');
    setActiveFolderRunId(folderId);
    setIsExecutionExpanded(true);
    setActiveTab('execution_manual_cases');
  };

  const getSuiteScenarios = useCallback((targetId: string): ApiRequest[] => {
    if (!targetId || !activeProject) return [];

    const scenarios: ApiRequest[] = [];
    const seenIds = new Set<string>();

    const addScenario = (req: ApiRequest) => {
      if (req && req.id && !seenIds.has(req.id)) {
        seenIds.add(req.id);
        scenarios.push(req);
      }
    };

    // 1. Direct check: Is targetId a Collection ID?
    activeProject.apiWorkspaces?.forEach(ws => {
      ws.collections?.forEach(col => {
        if (col.id === targetId) {
          // Direct collection requests
          (col.requests || []).forEach(addScenario);
          // Requests inside any subfolders of this collection
          (col.folders || []).forEach(fold => {
            (fold.requests || []).forEach(addScenario);
          });
        }
      });
    });

    // 2. Direct check: Is targetId a Folder ID?
    if (scenarios.length === 0) {
      activeProject.apiWorkspaces?.forEach(ws => {
        ws.collections?.forEach(col => {
          col.folders?.forEach(fold => {
            if (fold.id === targetId) {
              (fold.requests || []).forEach(addScenario);
            }
          });
        });
      });
    }

    // 3. Name check fallback: Does targetId match a collection or folder name?
    if (scenarios.length === 0) {
      activeProject.apiWorkspaces?.forEach(ws => {
        ws.collections?.forEach(col => {
          if (col.name === targetId || `${col.name} (${ws.name})` === targetId) {
            (col.requests || []).forEach(addScenario);
            (col.folders || []).forEach(fold => {
              (fold.requests || []).forEach(addScenario);
            });
          }
          col.folders?.forEach(fold => {
            if (fold.name === targetId || `${col.name} → ${fold.name}` === targetId) {
              (fold.requests || []).forEach(addScenario);
            }
          });
        });
      });
    }

    // 4. Special fallback: 'api-generated-scenarios' or project.apiScenarios
    if (scenarios.length === 0 && (targetId === 'api-generated-scenarios' || targetId.includes('AI Scenarios') || targetId.includes('AI-'))) {
      (activeProject.apiScenarios || []).forEach((sc, idx) => {
        const methodMatch = sc.description?.match(/\[([A-Z]+)\s/);
        const method = (methodMatch ? methodMatch[1] : 'GET') as any;
        addScenario({
          id: sc.id || `scen-${idx}`,
          name: sc.title || sc.scenarioId || `Scenario ${idx + 1}`,
          scenarioTitle: sc.title,
          method: method,
          url: sc.appUrl || '',
          headers: [],
          params: [],
          body: '',
          bodyType: 'none',
          description: sc.description || '',
          expectedResults: sc.expectedResults || '',
          createdAt: sc.createdAt || new Date().toISOString()
        });
      });
    }

    // 5. Ultimate fallback: if targetId matched a collection with no workspace requests, check if project.apiScenarios has scenarios
    if (scenarios.length === 0 && (activeProject.apiScenarios || []).length > 0) {
      const isTargetCollection = activeProject.apiWorkspaces?.some(ws => 
        ws.collections?.some(c => c.id === targetId || c.name === targetId)
      );
      if (isTargetCollection) {
        (activeProject.apiScenarios || []).forEach((sc, idx) => {
          const methodMatch = sc.description?.match(/\[([A-Z]+)\s/);
          const method = (methodMatch ? methodMatch[1] : 'GET') as any;
          addScenario({
            id: sc.id || `scen-${idx}`,
            name: sc.title || sc.scenarioId || `Scenario ${idx + 1}`,
            scenarioTitle: sc.title,
            method: method,
            url: sc.appUrl || '',
            headers: [],
            params: [],
            body: '',
            bodyType: 'none',
            description: sc.description || '',
            expectedResults: sc.expectedResults || '',
            createdAt: sc.createdAt || new Date().toISOString()
          });
        });
      }
    }

    return scenarios;
  }, [activeProject]);

  const availableCollections = useMemo(() => {
    const options: {
      id: string;
      name: string;
      path: string;
      isFolder?: boolean;
      collectionName: string;
      folderName?: string;
      scenarioCount: number;
    }[] = [];
    if (!activeProject) return options;

    activeProject.apiWorkspaces?.forEach(ws => {
      (ws.collections || []).forEach(col => {
        const scenariosInCol = getSuiteScenarios(col.id);
        const colLabel = ws.name && (activeProject.apiWorkspaces?.length || 0) > 1
          ? `${col.name} (${ws.name})`
          : col.name;

        options.push({
          id: col.id,
          name: colLabel,
          collectionName: col.name,
          path: `${ws.name} / ${col.name}`,
          isFolder: false,
          scenarioCount: scenariosInCol.length
        });

        // Also add subfolders so user can target an individual folder if desired
        (col.folders || []).forEach(fold => {
          const scenariosInFold = getSuiteScenarios(fold.id);
          options.push({
            id: fold.id,
            name: `${col.name} → ${fold.name}`,
            collectionName: col.name,
            folderName: fold.name,
            path: `${ws.name} / ${col.name} / ${fold.name}`,
            isFolder: true,
            scenarioCount: scenariosInFold.length
          });
        });
      });
    });

    // Fallback: If no collections exist in workspaces, but activeProject.apiScenarios has items
    if (options.length === 0 && (activeProject.apiScenarios || []).length > 0) {
      options.push({
        id: 'api-generated-scenarios',
        name: 'AI Generated Scenarios',
        collectionName: 'AI Generated Scenarios',
        path: 'API Testing / AI Generated Scenarios',
        isFolder: false,
        scenarioCount: (activeProject.apiScenarios || []).length
      });
    }

    return options;
  }, [activeProject, getSuiteScenarios]);

  const availableAiFolders = availableCollections;

  const handleSaveSuite = () => {
    if (!newSuiteName.trim()) { setSuiteError('Suite Name is required'); return; }
    if (!selectedFolderId) { setSuiteError('Please select a collection'); return; }
    const exists = (activeProject.apiTestSuites || []).some(s => s.name.toLowerCase() === newSuiteName.trim().toLowerCase());
    if (exists) { setSuiteError('Test Suite Name must be unique'); return; }
    const folder = availableCollections.find(f => f.id === selectedFolderId);
    
    const existingSuites = activeProject.apiTestSuites || [];
    const nextNumber = existingSuites.length > 0 
      ? Math.max(...existingSuites.map(s => {
          const match = s.id.match(/API-(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        })) + 1 
      : 1;
    
    const sequentialId = `API-${nextNumber.toString().padStart(3, '0')}`;
    const uniqueId = `${sequentialId}-${Date.now()}`;
    
    const targetName = folder 
      ? (folder.isFolder && folder.folderName ? `${folder.collectionName} / ${folder.folderName}` : folder.name) 
      : 'API Collection';

    const newSuite: ApiTestSuite = {
        id: uniqueId,
        name: newSuiteName.trim(),
        targetFolderId: selectedFolderId,
        targetFolderName: targetName,
        status: 'Not Started',
        scenarioResults: {}
    };
    updateProject({
        ...activeProject,
        apiTestSuites: [newSuite, ...(activeProject.apiTestSuites || [])]
    });

    if (user) {
       logActivity(user.email, user.name, `Created API Execution Suite: ${newSuite.name}`, activeProject.id, activeProject.name);
    }

    setIsSuiteModalOpen(false);
    setNewSuiteName('');
    setSelectedFolderId('');
    setSuiteError('');
  };

  const handleDeleteSuite = (suiteId: string) => {
    const updatedSuites = (activeProject.apiTestSuites || []).filter(s => s.id !== suiteId);
    updateProject({ ...activeProject, apiTestSuites: updatedSuites });
    logActivity(user.email, user.name, `Deleted API Execution Suite`, activeProject.id, activeProject.name);
  };

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 800;
        if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) { height *= MAX_DIM / width; width = MAX_DIM; }
            else { width *= MAX_DIM / height; height = MAX_DIM; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.3));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const handleDownloadMedia = (data: string, index: number) => {
    const link = document.createElement('a');
    link.href = data;
    const isVid = data.startsWith('data:video') || data.toLowerCase().includes('.mp4') || data.toLowerCase().includes('.mov') || data.toLowerCase().includes('.webm');
    link.download = `evidence_${index + 1}.${isVid ? 'mp4' : 'jpg'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openEvidenceModal = (suite: ApiTestSuite, scenarioId?: string) => {
    const targetId = scenarioId || suite.id;
    setAddEvidenceContext({ suite, scenarioId });
    setUploadSuccessMessage(null);
    
    let existing: ApiTestSuiteEvidence | undefined;
    if (scenarioId) {
        existing = suite.scenarioResults?.[scenarioId]?.evidence;
    } else {
        existing = suite.evidence;
    }

    setStagedEvidence(prev => ({
      ...prev,
      [targetId]: {
        comment: existing?.comment || '',
        links: existing?.links || [],
        attachments: existing?.attachments || []
      }
    }));

    setNewLinkInput('');
    setActiveMenuSuiteId(null);
    setActiveMenuScenarioId(null);
  };

  const updateStagedField = (field: keyof ApiTestSuiteEvidence, value: any) => {
    if (!addEvidenceContext) return;
    const targetId = addEvidenceContext.scenarioId || addEvidenceContext.suite.id;
    setStagedEvidence(prev => ({
      ...prev,
      [targetId]: {
        ...(prev[targetId] || { comment: '', links: [], attachments: [] }),
        [field]: value
      }
    }));
  };

  const handleAddEvidenceLink = () => {
    if (!newLinkInput.trim() || !addEvidenceContext) return;
    const targetId = addEvidenceContext.scenarioId || addEvidenceContext.suite.id;
    const currentLinks = stagedEvidence[targetId]?.links || [];
    const l = newLinkInput.trim().startsWith('http') ? newLinkInput.trim() : `https://${newLinkInput.trim()}`;
    updateStagedField('links', [...currentLinks, l]);
    setNewLinkInput('');
  };

  const handleRemoveEvidenceLink = (idx: number) => {
    if (!addEvidenceContext) return;
    const targetId = addEvidenceContext.scenarioId || addEvidenceContext.suite.id;
    const currentLinks = stagedEvidence[targetId]?.links || [];
    updateStagedField('links', currentLinks.filter((_, i) => i !== idx));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !addEvidenceContext) return;
    
    const targetId = addEvidenceContext.scenarioId || addEvidenceContext.suite.id;
    const currentAttachments = stagedEvidence[targetId]?.attachments || [];

    setIsUploadingMedia(true);
    setUploadSuccessMessage(null);
    const readers = Array.from(files).map((file: File) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const result = reader.result as string;
          if (result.startsWith('data:image')) {
            const compressed = await compressImage(result);
            resolve(compressed);
          } else {
            resolve(result);
          }
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then(results => {
      updateStagedField('attachments', [...currentAttachments, ...results]);
      setIsUploadingMedia(false);
      setUploadSuccessMessage("Successfully uploaded.");
      setTimeout(() => setUploadSuccessMessage(null), 3000);
    }).catch(err => {
      console.error("Multimedia read failed:", err);
      setIsUploadingMedia(false);
    });
  };

  const saveEvidence = async () => {
    if (!addEvidenceContext || isUploadingMedia) return;
    const { suite, scenarioId } = addEvidenceContext;
    const targetId = scenarioId || suite.id;
    
    const evidenceData = stagedEvidence[targetId] || { comment: '', links: [], attachments: [] };

    const currentProjectSize = estimateSize(activeProject);
    const evidenceSize = estimateSize(evidenceData);
    
    if (currentProjectSize + evidenceSize > 980000) {
      alert("This project document is almost full. Please remove old reports or large images before adding more.");
      return;
    }

    const updatedSuites = (activeProject.apiTestSuites || []).map(s => {
      if (s.id !== suite.id) return s;
      
      if (scenarioId) {
          const results = { ...(s.scenarioResults || {}) };
          results[scenarioId] = { 
            ...(results[scenarioId] || { status: 'Not Started' }), 
            evidence: evidenceData 
          };
          return { ...s, scenarioResults: results };
      } else {
          return { ...s, evidence: evidenceData };
      }
    });

    // Close the modal immediately as requested by the user to fix the "does not close" issue
    setAddEvidenceContext(null);

    try {
      await updateProject({ ...activeProject, apiTestSuites: updatedSuites });
      logActivity(user.email, user.name, `Updated Evidence for API Suite: ${suite.name}${scenarioId ? ` (Scenario: ${scenarioId})` : ''}`, activeProject.id, activeProject.name);
      showToast('Evidence committed');
    } catch (err) {
      console.error("Failed to commit evidence context:", err);
      showToast('Failed to save. Check storage limits.', 'error');
    }
  };

  const toggleSuiteExpansion = (suiteId: string) => {
      const next = new Set(expandedSuiteIds);
      if (next.has(suiteId)) next.delete(suiteId);
      else next.add(suiteId);
      setExpandedSuiteIds(next);
  };

  const normalizeApiStatus = (status?: string): string => {
    if (!status) return 'NOT_STARTED';
    const s = String(status).trim().toUpperCase().replace(/[\s_]+/g, '_');
    if (s === 'PASS' || s === 'PASSED' || s === 'SUCCESS') return 'PASS';
    if (s === 'FAIL' || s === 'FAILED' || s === 'FAILURE') return 'FAIL';
    if (s === 'BLOCKED' || s === 'BLOCK') return 'BLOCKED';
    if (s === 'IN_PROGRESS' || s === 'INPROGRESS' || s === 'RUNNING') return 'IN_PROGRESS';
    return 'NOT_STARTED';
  };

  const handleUpdateScenarioStatus = (suiteId: string, requestId: string, status: string, requestName?: string) => {
      const updatedSuites = (activeProject.apiTestSuites || []).map(suite => {
          if (suite.id === suiteId) {
              const results = { ...(suite.scenarioResults || {}) };
              const prev = results[requestId] || (requestName ? results[requestName] : {}) || {};
              const updatedResult = { ...prev, status };
              results[requestId] = updatedResult;
              if (requestName) {
                results[requestName] = updatedResult;
              }
              return { ...suite, scenarioResults: results };
          }
          return suite;
      });
      updateProject({ ...activeProject, apiTestSuites: updatedSuites });
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-6">
        <Loader2 size={48} className="animate-spin text-indigo-500" />
        <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 animate-pulse">Establishing Secure Session...</p>
      </div>
    );
  }

  if (!user) return <AuthComponent onLogin={handleLogin} />;

  const contextualUser: User = rawContextualUser!;

  const mainNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'projects', label: 'Projects', icon: <FolderKanban size={20} /> },
    ...(isSuperAdmin ? [{ id: 'rag', label: 'RAG Vector Search', icon: <Sparkles size={20} className="text-emerald-400 animate-pulse" /> }] : []),
    { id: 'ai_user_generator', label: 'AI User Story Generator', icon: <UserPlus size={20} /> },
    { id: 'scenarios', label: 'AI Scenarios', icon: <FileSearch size={20} /> },
    { id: 'cases', label: 'AI Test Cases', icon: <Database size={20} /> },
    { id: 'manual', label: 'Functional Test cases', icon: <BookOpen size={20} /> },
  ];

  const executionSubItems = [
    { id: 'execution_manual_cases', label: 'Test Cases Execution', icon: <Activity size={16} /> },
    { id: 'execution_scripts', label: 'Script Execution', icon: <Terminal size={16} /> },
    { id: 'execution_api', label: 'API Execution', icon: <Network size={16} /> },
    { id: 'execution_performance', label: 'Performance API Testing Execution', icon: <Zap size={16} /> },
  ];

  const automationSubItems = [
    { id: 'scripts', label: 'Script Generator', icon: <Terminal size={16} /> },
    { id: 'record_play', label: 'Record and Play', icon: <PlayCircle size={16} /> },
  ];

  const bottomNavItems = [
    { id: 'api', label: 'API Testing', icon: <Network size={20} /> },
    { id: 'performance', label: 'Performance API Testing', icon: <Zap size={20} /> },
    ...(isSuperAdmin ? [
      { id: 'web_performance', label: 'Web Performance Testing', icon: <Globe size={20} /> },
      { id: 'functional_performance', label: 'Functional Performance', icon: <Workflow size={20} className="text-[#00E1C5]" /> },
      { id: 'jmeter_performance', label: 'Jmeter Integration', icon: <Gauge size={20} className="text-emerald-400" /> },
    ] : []),
    { id: 'ui_testing', label: 'UI Testing', icon: <Layout size={20} /> },
    ...(canViewReports ? [{ id: 'reports', label: 'Reports', icon: <BarChart3 size={20} /> }] : []),
    ...(isGlobalAdmin || isAdmin ? [{ id: 'user_management', label: 'Access Control', icon: <Users size={20} /> }] : []),
  ];

  const renderContent = () => {
    if (!user) return null;

    // Guard for project-specific tabs
    const projectTabs = ['ai_user_generator', 'scenarios', 'cases', 'manual', 'execution', 'execution_manual_cases', 'execution_scripts', 'execution_api', 'execution_performance', 'scripts', 'record_play', 'mobile_testing', 'api', 'performance', 'web_performance', 'functional_performance', 'jmeter_performance', 'ui_testing', 'settings_jira', 'settings_github', 'settings_slack'];
    if (projectTabs.includes(activeTab) && !activeProject) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white rounded-[3rem] border border-slate-100 shadow-sm p-12 text-center animate-in fade-in duration-500">
          <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-8 shadow-inner">
            <Briefcase size={48} />
          </div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">No Project Selected</h2>
          <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-sm mb-10">
            Please select an existing project from the dashboard or create a new one to access this feature.
          </p>
          <button 
            onClick={() => setActiveTab('dashboard')}
            className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95 transition-all"
          >
            Go to Dashboard
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard user={contextualUser} projects={projects} activeProject={activeProject} />;
      case 'projects': return <ProjectList user={contextualUser} projects={projects} setProjects={setProjects} onSelectProject={(id) => { setSelectedProjectId(id); setActiveTab('ai_user_generator'); }} />;
      case 'rag': 
        if (!isSuperAdmin) return <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Unauthorized Access - Super Admin Only</div>;
        return <RAGDashboard currentProject={activeProject} projects={projects} />;
      case 'ai_user_generator': return <AIGeneratorUser project={activeProject!} user={contextualUser} onUpdateProject={updateProject} />;
      case 'scenarios': return (
        <ScenarioGenerator
          project={activeProject}
          user={contextualUser}
          onUpdateProject={updateProject}
          onNavigateTab={(tab) => {
            if (tab === 'cases') {
              setTestCaseInitialView('scenarios');
            }
            setActiveTab(tab as any);
          }}
        />
      );
      case 'cases': return (
        <TestCaseManager
          key={`tc_manager_${activeTab}_${testCaseInitialView}`}
          project={activeProject}
          user={contextualUser}
          onUpdateProject={updateProject}
          onRunFolder={handleRunFolder}
          initialView={testCaseInitialView}
          onNavigateTab={(tab, meta) => {
            if (meta) {
              setScriptInitialFolder({ id: meta.folderId, name: meta.folderName });
            } else {
              setScriptInitialFolder(null);
            }
            setActiveTab(tab as any);
          }}
        />
      );
      case 'manual': return <ManualTestCaseManager project={activeProject} user={contextualUser} onUpdateProject={updateProject} onRunFolder={handleRunFolder} />;
      case 'execution': return <ExecutionPanel project={activeProject} user={contextualUser} onUpdateProject={updateProject} onClearActiveFolder={() => setActiveFolderRunId(null)} />;
      case 'execution_manual_cases': return <ExecutionPanel project={activeProject} user={contextualUser} onUpdateProject={updateProject} defaultFilter="MANUAL" activeFolderId={activeFolderRunId} onClearActiveFolder={() => setActiveFolderRunId(null)} />;
      case 'execution_scripts': return <ScriptExecution project={activeProject} user={contextualUser} onUpdateProject={updateProject} onNavigateToGenerator={() => setActiveTab('scripts')} />;
      case 'execution_api':
        return (
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm animate-in fade-in duration-500" onClick={() => { setActiveMenuSuiteId(null); setActiveMenuScenarioId(null); }}>
             <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-4">
                  <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600"><Network size={24} /></div>
                  <div><h3 className="text-2xl font-black text-black uppercase tracking-tight">API Execution</h3></div>
               </div>
               <button onClick={() => setIsSuiteModalOpen(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"><Plus size={16} /> Add Test Suite</button>
             </div>
             <div className="overflow-visible rounded-3xl border border-slate-200">
               <table className="w-full text-left border-collapse">
                 <thead>
                   <tr className="bg-slate-50/50 text-[14px] font-black text-black uppercase tracking-widest border-b border-slate-100">
                     <th className="px-8 py-5 w-16"></th>
                     <th className="px-8 py-5">Suite ID</th>
                     <th className="px-8 py-5">Collections / Suite</th>
                     <th className="px-8 py-5 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {(activeProject.apiTestSuites || []).length === 0 ? (
                     <tr><td colSpan={4} className="px-8 py-24 text-center"><div className="flex flex-col items-center justify-center opacity-50"><BarChart3 size={48} className="mb-4 text-slate-300" /><p className="text-slate-400 font-bold uppercase text-xs tracking-widest">No Test Suites found</p></div></td></tr>
                   ) : (
                     (activeProject.apiTestSuites || []).map((suite, idx) => {
                       const isExpanded = expandedSuiteIds.has(suite.id);
                       const scenarios = getSuiteScenarios(suite.targetFolderId);
                       
                       return (
                         <React.Fragment key={suite.id}>
                           <tr className={`hover:bg-slate-50/50 transition-colors group ${isExpanded ? 'bg-indigo-50/20' : ''}`} onClick={() => toggleSuiteExpansion(suite.id)}>
                             <td className="px-8 py-6">
                                <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                                  <ChevronDown size={18} className="text-slate-400" />
                                </div>
                             </td>
                             <td className="px-8 py-6 text-[14px] font-mono text-black">
                                {(suite?.id || 'N/A').startsWith('API-') ? (suite?.id || '').split('-').slice(0, 2).join('-') : ((suite?.id || '').split('-').pop()?.toUpperCase() || 'N/A')}
                             </td>
                             <td className="px-8 py-6">
                                <div className="flex items-center gap-4">
                                  <div className="p-3 bg-white border border-slate-100 rounded-xl text-amber-500 shadow-sm">
                                    <Folder size={18} />
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-slate-700 text-sm">{suite.name}</h4>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{suite.targetFolderName}</p>
                                  </div>
                                </div>
                             </td>
                             <td className="px-8 py-6 text-right relative overflow-visible">
                               <button 
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setActiveMenuSuiteId(activeMenuSuiteId === suite.id ? null : suite.id); 
                                  }} 
                                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                               >
                                  <MoreVertical size={18} />
                               </button>
                               {activeMenuSuiteId === suite.id && (
                                 <div className="absolute right-8 top-12 w-48 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[500] p-2 animate-in zoom-in-95 duration-200 text-left" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => { setViewDetailsSuite(suite); setActiveMenuSuiteId(null); }} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all"><Eye size={16} /> View Details</button>
                                    <div className="my-1 border-t border-slate-50" />
                                    <button onClick={() => { setDeleteSuiteConfirm({ id: suite.id, name: suite.name }); setActiveMenuSuiteId(null); }} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16} /> Delete Suite</button>
                                 </div>
                               )}
                             </td>
                           </tr>
                           {isExpanded && (
                             <tr>
                               <td colSpan={4} className="px-12 py-6 bg-slate-50/50">
                                 <div className="space-y-3 animate-in slide-in-from-top-2">
                                   <div className="flex items-center gap-2 mb-4">
                                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Scenario Execution Context</p>
                                   </div>
                                   {scenarios.length === 0 ? (
                                     <div className="py-10 text-center text-slate-400 italic text-xs">No scenarios found in this collection.</div>
                                   ) : (
                                     scenarios.map((req, ridx) => {
                                       const res = suite.scenarioResults?.[req.id] || (req.name ? suite.scenarioResults?.[req.name] : undefined) || { status: 'NOT_STARTED' };
                                       const currentStatus = normalizeApiStatus(res.status);
                                       const reqEv = suite.scenarioResults?.[req.id]?.evidence || (req.name ? suite.scenarioResults?.[req.name]?.evidence : undefined) || stagedEvidence[req.id];
                                       const hasEvidence = reqEv && ((reqEv.attachments && reqEv.attachments.length > 0) || (reqEv.links && reqEv.links.length > 0) || (reqEv.comment && reqEv.comment.trim().length > 0));

                                       return (
                                         <div key={req.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4 group/scen">
                                            <div className="flex items-center justify-between gap-6">
                                               <div className="flex items-center gap-5 min-w-0 flex-1">
                                                  <span className="text-[10px] font-mono text-slate-300 w-6">{(ridx + 1).toString().padStart(2, '0')}</span>
                                                  <div className="min-w-0">
                                                     <div className="flex items-center gap-3">
                                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border border-indigo-100 bg-indigo-50 text-indigo-600`}>{req.method}</span>
                                                        <h5 className="text-xs font-bold text-slate-700 truncate uppercase tracking-tight">{req.name || 'Untitled Scenario'}</h5>
                                                     </div>
                                                     <p className="text-[9px] text-slate-400 font-bold truncate mt-1">{req.url}</p>
                                                  </div>
                                               </div>
                                               
                                               <div className="flex items-center gap-3 flex-shrink-0">
                                                  <button
                                                    onClick={() => openEvidenceModal(suite, req.id)}
                                                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all ${
                                                      hasEvidence
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'
                                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-100'
                                                    }`}
                                                    title="Manage Evidence"
                                                  >
                                                    <Paperclip size={12} />
                                                    <span>{hasEvidence ? 'Evidence Added' : 'Add Evidence'}</span>
                                                  </button>

                                                  <div className="relative group">
                                                     <select 
                                                        value={currentStatus} 
                                                        onChange={e => handleUpdateScenarioStatus(suite.id, req.id, e.target.value, req.name)}
                                                        className={`appearance-none pl-4 pr-10 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border outline-none cursor-pointer transition-all shadow-sm ${
                                                          currentStatus === 'PASS' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                          currentStatus === 'FAIL' ? 'bg-red-50 text-red-600 border-red-100' :
                                                          currentStatus === 'BLOCKED' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                          currentStatus === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                          'bg-slate-50 text-slate-400 border-slate-200'
                                                        }`}
                                                      >
                                                        <option value="NOT_STARTED">Not Started</option>
                                                        <option value="IN_PROGRESS">In Progress</option>
                                                        <option value="PASS">PASS</option>
                                                        <option value="FAIL">Fail</option>
                                                        <option value="BLOCKED">Blocked</option>
                                                     </select>
                                                     <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-current opacity-40 pointer-events-none" size={14} />
                                                  </div>
                                                  
                                                  <div className="relative">
                                                    <button 
                                                      onClick={(e) => { e.stopPropagation(); setActiveMenuScenarioId(activeMenuScenarioId === req.id ? null : req.id); }}
                                                      className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-100"
                                                    >
                                                      <MoreHorizontal size={18} />
                                                    </button>
                                                    {activeMenuScenarioId === req.id && (
                                                      <div className="absolute right-0 top-12 w-48 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[500] p-2 animate-in zoom-in-95 duration-200 text-left" onClick={e => e.stopPropagation()}>
                                                         <button onClick={() => openEvidenceModal(suite, req.id)} className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl transition-all">
                                                           <Paperclip size={16} /> 
                                                           {hasEvidence ? 'Update Evidence' : 'Add Evidence'}
                                                         </button>
                                                         {res.status === 'Fail' && (
                                                           <>
                                                             <div className="my-1 border-t border-slate-100" />
                                                             <button 
                                                               onClick={() => {
                                                                 setActiveMenuScenarioId(null);
                                                                 handleCreateScenarioBug(suite, req);
                                                               }} 
                                                               className="w-full flex items-center gap-3 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                                             >
                                                               <AlertTriangle size={16} /> 
                                                               Create Bug
                                                             </button>
                                                           </>
                                                         )}
                                                      </div>
                                                    )}
                                                  </div>
                                               </div>
                                            </div>

                                            {/* EVIDENCE DISPLAY BAR */}
                                            {hasEvidence && (
                                              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
                                                 {reqEv.attachments && reqEv.attachments.length > 0 && (
                                                    <div className="flex items-center gap-2">
                                                       <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 flex items-center gap-1">
                                                          <Paperclip size={10} /> {reqEv.attachments.length} Proof(s)
                                                       </span>
                                                       <div className="flex items-center gap-1.5">
                                                          {reqEv.attachments.map((att: string, aidx: number) => {
                                                             const isVid = att.startsWith('data:video') || att.toLowerCase().includes('.mp4') || att.toLowerCase().includes('.webm');
                                                             return (
                                                                <div 
                                                                  key={aidx} 
                                                                  onClick={() => setPreviewMedia({ url: att, type: isVid ? 'video' : 'image' })}
                                                                  className="w-10 h-10 rounded-xl overflow-hidden border border-slate-200 shadow-sm cursor-pointer hover:ring-2 ring-indigo-500 transition-all relative group/att shrink-0 bg-slate-900"
                                                                  title="Click to view evidence full screen"
                                                                >
                                                                   {isVid ? (
                                                                      <div className="w-full h-full flex items-center justify-center text-white/80">
                                                                         <FileVideo size={16} />
                                                                      </div>
                                                                   ) : (
                                                                      <img src={att} alt={`Evidence ${aidx + 1}`} className="w-full h-full object-cover" />
                                                                   )}
                                                                   <div className="absolute inset-0 bg-indigo-600/30 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                                      <Maximize2 size={12} />
                                                                   </div>
                                                                </div>
                                                             );
                                                          })}
                                                       </div>
                                                    </div>
                                                 )}

                                                 {reqEv.links && reqEv.links.length > 0 && (
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                       {reqEv.links.map((link: string, lidx: number) => (
                                                          <a
                                                            key={lidx}
                                                            href={link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg text-[10px] font-bold text-indigo-600 transition-all max-w-[200px] truncate"
                                                            title={link}
                                                          >
                                                             <Link2 size={10} />
                                                             <span className="truncate">{link}</span>
                                                             <ExternalLink size={8} />
                                                          </a>
                                                       ))}
                                                    </div>
                                                 )}

                                                 {reqEv.comment && (
                                                    <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg text-[10px] font-medium text-slate-600 max-w-md truncate">
                                                       <MessageSquare size={10} className="text-slate-400 shrink-0" />
                                                       <span className="truncate" title={reqEv.comment}>{reqEv.comment}</span>
                                                    </div>
                                                 )}
                                              </div>
                                            )}
                                         </div>
                                       );
                                     })
                                   )}
                                 </div>
                               </td>
                             </tr>
                           )}
                         </React.Fragment>
                       );
                     })
                   )}
                 </tbody>
               </table>
             </div>
          </div>
        );
      case 'execution_performance': return <PerformanceExecution project={activeProject} user={contextualUser} onUpdateProject={updateProject} />;
      case 'scripts': return (
        <ScriptGenerator
          project={activeProject}
          user={contextualUser}
          onUpdateProject={updateProject}
          initialFolderId={scriptInitialFolder?.id}
          initialFolderName={scriptInitialFolder?.name}
          onClearInitialFolder={() => setScriptInitialFolder(null)}
        />
      );
      case 'settings_jira': return <JiraSettings activeProject={activeProject} onUpdateProject={updateProject} />;
      case 'settings_github': return <GithubSettings activeProject={activeProject} onUpdateProject={updateProject} />;
      case 'settings_slack': return <SlackSettings activeProject={activeProject} onUpdateProject={updateProject} />;
      case 'settings_cache': return <AICacheSettings />;
      case 'settings_backup': return <BackupSettings />;
      case 'settings_credits': 
        if (!isSuperAdmin && !isAdmin && !isGlobalAdmin) return null;
        return <CreditConsumption currentUser={contextualUser || user} activeProject={activeProject} projects={projects} onSelectProject={(id) => setSelectedProjectId(id)} />;
      case 'api': return <ApiTesting project={activeProject} user={contextualUser} onUpdateProject={updateProject} />;
      case 'performance': return <PerformanceTesting project={activeProject} user={contextualUser} onUpdateProject={updateProject} />;
      case 'web_performance': 
        if (!isSuperAdmin) return <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Unauthorized Access - Super Admin Only</div>;
        return <PerformanceTestingWorkflow project={activeProject} user={contextualUser} initialMode="page" onUpdateProject={updateProject} />;
      case 'functional_performance': 
        if (!isSuperAdmin) return <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Unauthorized Access - Super Admin Only</div>;
        return <FunctionalPerformanceTesting project={activeProject} user={contextualUser} />;
      case 'jmeter_performance': 
        if (!isSuperAdmin) return <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Unauthorized Access - Super Admin Only</div>;
        return <JMeterPerformance project={activeProject} user={contextualUser} onUpdateProject={updateProject} />;
      case 'record_play': return <RecordAndPlay project={activeProject} user={contextualUser} onUpdateProject={updateProject} isFullScreen={isRecorderFullScreen} onToggleFullScreen={() => setIsRecorderFullScreen(!isRecorderFullScreen)} />;
      case 'mobile_testing': return <MobileTesting project={activeProject} user={contextualUser} onUpdateProject={updateProject} />;
      case 'ui_testing': return <UITesting project={activeProject} user={contextualUser} onUpdateProject={updateProject} />;
      case 'user_management': 
        if (!isGlobalAdmin && !isAdmin) return <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Unauthorized Access</div>;
        return <UserManagement currentUser={user || contextualUser} projects={projects} activeProject={activeProject} />;
      case 'token_consumption':
        if (!isSuperAdmin && !isAdmin && !isGlobalAdmin) return <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Unauthorized Access - Admin and Super Admin Only</div>;
        return <CreditConsumption currentUser={user || contextualUser} activeProject={activeProject} projects={projects} onSelectProject={(id) => setSelectedProjectId(id)} />;
      case 'reports': 
        if (!canViewReports) return <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-widest">Unauthorized Access</div>;
        return <Reports projects={projects} activeProject={activeProject} user={contextualUser} />;
      default: return <Dashboard user={contextualUser} projects={projects} activeProject={activeProject} />;
    }
  };

  const isExecutionActive = activeTab.startsWith('execution');
  const isAutomationActive = ['scripts', 'record_play'].includes(activeTab);
  const isSettingsActive = ['settings_jira', 'settings_github', 'settings_slack', 'settings_cache', 'settings_credits', 'settings_backup'].includes(activeTab);

  const getPageTitle = () => {
    if (activeTab === 'execution') return 'Execution Hub';
    if (activeTab === 'settings_jira') return 'Jira Integration Settings';
    if (activeTab === 'settings_github') return 'GitHub Integration Settings';
    if (activeTab === 'settings_slack') return 'Slack Integration Settings';
    if (activeTab === 'settings_cache') return 'AI Cache & Performance Settings';
    if (activeTab === 'settings_backup') return 'Backup Synchronization Settings';
    if (activeTab === 'settings_credits') return 'Credits Consumption Settings';
    if (activeTab.startsWith('execution_')) {
      return executionSubItems.find(i => i.id === activeTab)?.label || 'Execution Hub';
    }
    const automationItem = automationSubItems.find(i => i.id === activeTab);
    if (automationItem) return automationItem.label;
    
    return [...mainNavItems, ...bottomNavItems].find(i => i.id === activeTab)?.label || 'Dashboard';
  };

  const activeStagedId = addEvidenceContext ? (addEvidenceContext.scenarioId || addEvidenceContext.suite?.id) : null;
  const currentStaged = activeStagedId ? stagedEvidence[activeStagedId] : null;

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden bg-[#edf4f2]">
      {toast?.visible && (
        <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] animate-in slide-in-from-bottom-10 fade-in duration-500`}>
           <div className={`${toast.type === 'error' ? 'bg-rose-900' : toast.type === 'warning' ? 'bg-amber-800' : 'bg-slate-900'} text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-white/10 backdrop-blur-md`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${toast.type === 'error' ? 'bg-rose-500' : toast.type === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                {toast.type === 'error' ? <AlertTriangle size={14} strokeWidth={4} /> : <CheckCircle2 size={14} strokeWidth={4} />}
              </div>
              <p className="text-sm font-bold tracking-tight">{toast.message}</p>
           </div>
        </div>
      )}

      {previewMedia && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 md:p-12 animate-in fade-in duration-300" onClick={() => setPreviewMedia(null)}>
            <button className="absolute top-8 right-8 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/20 z-[5001]">
                <X size={32} />
            </button>
            <div className="relative w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
                {previewMedia.type === 'video' ? (
                    <video src={previewMedia.url || undefined} controls autoPlay className="max-w-full max-h-full rounded-xl shadow-2xl" />
                ) : (
                    <img src={previewMedia.url || undefined} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-300" alt="Evidence Preview" />
                )}
            </div>
        </div>
      )}

      <aside className="w-64 bg-[#0c1017] text-slate-300 flex flex-col border-r border-slate-800">
        <div className="px-4 py-5 border-b border-slate-800/50 flex flex-col items-center justify-center">
          <AutomatiqaLogo variant="stacked" size="md" inverted={true} showTagline={true} />
        </div>
        <nav className="flex-1 p-5 space-y-2 overflow-y-auto custom-scrollbar">
          {mainNavItems.map(item => (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id as any)} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative border ${activeTab === item.id ? 'border-[#00E1C5]/40 bg-[#132d2f]/40 text-[#00E1C5] font-bold' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <span className={`flex-shrink-0 ${activeTab === item.id ? 'text-[#00E1C5]' : 'text-slate-400'}`}>{item.icon}</span>
              <span className={`text-[13px] tracking-tight ${activeTab === item.id ? 'text-white font-bold' : 'text-slate-300'}`}>{item.label}</span>
            </button>
          ))}
          
          <div className="my-4 border-t border-slate-800/50" />

          {/* Automation Section */}
          <div>
            <button 
              onClick={() => { setIsAutomationExpanded(!isAutomationExpanded); if (!isAutomationExpanded) { setScriptInitialFolder(null); setActiveTab('scripts'); } }} 
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 border ${isAutomationActive && !isAutomationExpanded ? 'border-[#00E1C5]/40 bg-[#132d2f]/40 text-[#00E1C5] font-bold' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <div className="flex items-center gap-3">
                <Code2 size={20} className={isAutomationActive && !isAutomationExpanded ? 'text-[#00E1C5]' : 'text-slate-400'} />
                <span className={`text-[13px] tracking-tight ${isAutomationActive && !isAutomationExpanded ? 'text-white font-bold' : 'text-slate-300'}`}>Automation</span>
              </div>
              {isAutomationExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isAutomationExpanded ? 'max-h-64 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
              <div className="ml-5 pl-4 border-l border-slate-800 space-y-1">
                {automationSubItems.map(subItem => (
                  <button 
                    key={subItem.id} 
                    onClick={() => {
                      if (subItem.id === 'scripts') setScriptInitialFolder(null);
                      setActiveTab(subItem.id as any);
                    }} 
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all duration-200 border ${activeTab === subItem.id ? 'border-[#00E1C5]/35 bg-[#132d2f]/40 text-[#00E1C5] font-bold' : 'border-transparent text-slate-400 hover:text-slate-300 hover:bg-white/5'}`}
                  >
                    <span className="flex-shrink-0">{subItem.icon}</span>
                    <span className="truncate text-white">{subItem.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Core Testing Tools */}
          {bottomNavItems.filter(i => ['api', 'performance', 'web_performance', 'functional_performance', 'jmeter_performance', 'ui_testing'].includes(i.id)).map(item => (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id as any)} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative border ${activeTab === item.id ? 'border-[#00E1C5]/40 bg-[#132d2f]/40 text-[#00E1C5] font-bold' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <span className={`flex-shrink-0 ${activeTab === item.id ? 'text-[#00E1C5]' : 'text-slate-400'}`}>{item.icon}</span>
              <span className={`text-[13px] tracking-tight ${activeTab === item.id ? 'text-white font-bold' : 'text-slate-300'}`}>{item.label}</span>
            </button>
          ))}

          {/* Execution Hub */}
          <div>
            <button 
              onClick={() => { setIsExecutionExpanded(!isExecutionExpanded); if (!isExecutionExpanded) setActiveTab('execution'); }} 
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 border ${isExecutionActive && !isExecutionExpanded ? 'border-[#00E1C5]/40 bg-[#132d2f]/40 text-[#00E1C5] font-bold' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <div className="flex items-center gap-3">
                <PlayCircle size={20} className={isExecutionActive && !isExecutionExpanded ? 'text-[#00E1C5]' : 'text-slate-400'} />
                <span className={`text-[13px] tracking-tight ${isExecutionActive && !isExecutionExpanded ? 'text-white font-bold' : 'text-slate-300'}`}>Execution Hub</span>
              </div>
              {isExecutionExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExecutionExpanded ? 'max-h-64 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
              <div className="ml-5 pl-4 border-l border-slate-800 space-y-1">
                {executionSubItems.map(subItem => (
                  <button 
                    key={subItem.id} 
                    onClick={() => setActiveTab(subItem.id as any)} 
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all duration-200 border ${activeTab === subItem.id ? 'border-[#00E1C5]/35 bg-[#132d2f]/40 text-[#00E1C5] font-bold' : 'border-transparent text-slate-400 hover:text-slate-300 hover:bg-white/5'}`}
                  >
                    <span className="flex-shrink-0">{subItem.icon}</span>
                    <span className="truncate text-white">{subItem.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reports & Management */}
          {bottomNavItems.filter(i => ['reports', 'user_management'].includes(i.id)).map(item => (
            <button 
              key={item.id} 
              onClick={() => setActiveTab(item.id as any)} 
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative border ${activeTab === item.id ? 'border-[#00E1C5]/40 bg-[#132d2f]/40 text-[#00E1C5] font-bold' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <span className={`flex-shrink-0 ${activeTab === item.id ? 'text-[#00E1C5]' : 'text-slate-400'}`}>{item.icon}</span>
              <span className={`text-[13px] tracking-tight ${activeTab === item.id ? 'text-white font-bold' : 'text-slate-300'}`}>{item.label}</span>
            </button>
          ))}

          <div className="my-4 border-t border-slate-800/50" />

          {/* Integrations Section */}
          <div>
            <button 
              onClick={() => { setIsSettingsExpanded(!isSettingsExpanded); }} 
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 border ${isSettingsActive && !isSettingsExpanded ? 'border-[#00E1C5]/40 bg-[#132d2f]/40 text-[#00E1C5] font-bold' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-white'}`}
            >
              <div className="flex items-center gap-3">
                <Sliders size={20} className={isSettingsActive && !isSettingsExpanded ? 'text-[#00E1C5]' : 'text-slate-400'} />
                <span className={`text-[13px] tracking-tight ${isSettingsActive && !isSettingsExpanded ? 'text-white font-bold' : 'text-slate-300'}`}>Integrations</span>
              </div>
              {isSettingsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSettingsExpanded ? 'max-h-96 opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
              <div className="ml-5 pl-4 border-l border-slate-800 space-y-1">
                {[
                  { id: 'settings_jira', label: 'Jira Integration', icon: <Sparkles size={16} /> },
                  { id: 'settings_github', label: 'GitHub Integration', icon: <Github size={16} /> },
                  { id: 'settings_slack', label: 'Slack Integration', icon: <Slack size={16} /> },
                  { id: 'settings_cache', label: 'AI Cache & Optimization', icon: <Zap size={16} className="text-yellow-400" /> },
                  { id: 'settings_backup', label: 'Backup Synchronization', icon: <Database size={16} className="text-emerald-400" /> },
                  ...((isSuperAdmin || isAdmin || isGlobalAdmin) ? [{ id: 'settings_credits', label: 'Credits Consumption', icon: <Coins size={16} className="text-[#00E1C5]" /> }] : [])
                ].map(subItem => (
                  <button 
                    key={subItem.id} 
                    onClick={() => setActiveTab(subItem.id as any)} 
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-all duration-200 border ${activeTab === subItem.id ? 'border-[#00E1C5]/35 bg-[#132d2f]/40 text-[#00E1C5] font-bold' : 'border-transparent text-slate-400 hover:text-slate-300 hover:bg-white/5'}`}
                  >
                    <span className="flex-shrink-0">{subItem.icon}</span>
                    <span className="truncate text-white">{subItem.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </nav>
        
        <div className="p-4 border-t border-slate-800/60 bg-slate-950/20">
          <div className="bg-[#111622] p-4 rounded-2xl mb-3 relative group border border-slate-800/40">
            <div className="absolute top-0 right-0 p-3 opacity-10 text-[#00E1C5]"><ShieldCheck size={36} /></div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#00E1C5] flex items-center justify-center text-slate-950 text-sm font-black shadow-lg shadow-[#00E1C5]/20">{String(contextualUser?.name || 'User').charAt(0).toUpperCase()}</div>
              <div className="overflow-hidden">
                <p className="text-[13px] font-bold text-white truncate">{contextualUser.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                   <p className="text-[8px] text-slate-500 font-extrabold uppercase tracking-wider">{contextualUser.role || 'Team Member'}</p>
                </div>
              </div>
            </div>
            
            <div ref={switchDropdownRef} className="relative">
              <button onClick={() => setIsSwitchProjectOpen(!isSwitchProjectOpen)} className={`w-full py-2 px-3 rounded-lg text-[10px] flex items-center justify-between font-bold transition-all ${isSwitchProjectOpen ? 'bg-[#00E1C5] text-slate-950' : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'}`}>
                <span className="truncate mr-2">{activeProject?.name || 'Project'}</span>
                <ChevronDown size={12} className={`transition-transform duration-300 ${isSwitchProjectOpen ? 'rotate-180' : ''}`} />
              </button>
              {isSwitchProjectOpen && (
                <div className="absolute bottom-full left-0 w-full mb-2 bg-[#111622] border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-[100] p-1">
                   <div className="max-h-56 overflow-y-auto custom-scrollbar">
                      {switcherProjects.length === 0 ? (
                        <div className="px-3 py-3 text-[9px] text-slate-500 font-bold uppercase tracking-wider text-center italic">No projects found</div>
                      ) : switcherProjects.map(proj => (
                        <button key={proj.id} onClick={() => { setSelectedProjectId(proj.id); setIsSwitchProjectOpen(false); }} className={`w-full text-left px-3 py-2 text-[10px] font-medium transition-all flex items-center gap-2 rounded-lg mb-0.5 last:mb-0 ${proj.id === activeProject?.id ? 'bg-[#00E1C5] text-slate-950' : 'text-slate-300 hover:bg-white/5'}`}>
                           <Briefcase size={10} />
                           <span className="truncate">{proj.name}</span>
                        </button>
                      ))}
                   </div>
                </div>
              )}
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900/50 hover:bg-rose-950/20 text-slate-500 hover:text-rose-400 transition-all font-bold text-[10px] uppercase tracking-wider border border-slate-800/40"><LogOut size={12} /> Sign Out Session</button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col bg-[#edf4f2]">
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-10 sticky top-0 z-50 shadow-sm">
          <div className="flex items-center gap-3">
             {activeProject && [
               'ai_user_generator', 'scenarios', 'cases', 'manual', 
               'execution', 'execution_manual_cases', 'execution_scripts', 
               'execution_api', 'execution_performance', 'scripts', 
               'record_play', 'api', 'performance', 'web_performance', 'functional_performance', 'ui_testing', 
               'settings_jira', 'settings_github', 'settings_slack'
             ].includes(activeTab) && (
               <div className="bg-[#00E1C5]/10 border border-[#00E1C5]/25 px-5 py-2.5 rounded-full text-[10px] font-black text-[#009B87] uppercase tracking-widest shadow-sm">
                 PROJECT: {String(activeProject?.name || 'Workspace').toUpperCase()}
               </div>
             )}
          </div>
          <div className="flex items-center gap-4">



              {/* Permanent Real-Time Credit Alert Label in Clear Format */}
              <CreditAlertBanner 
                currentUserEmail={user?.email || contextualUser?.email} 
                currentUserName={user?.name || contextualUser?.name} 
                activeProject={activeProject}
                onNavigateToCredits={(isSuperAdmin || isAdmin || isGlobalAdmin) ? () => setActiveTab('settings_credits') : undefined}
              />

              <NotificationBell notifications={notifications} userEmail={user?.email || ''} isAdmin={isAdmin} />

             <div className={`flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] px-5 py-2.5 rounded-full border transition-all duration-300 ${
               isOffline 
                 ? 'bg-amber-50 border border-amber-200 text-amber-700' 
                 : 'bg-[#00E1C5]/10 border border-[#00E1C5]/20 text-[#009B87]'
             }`}>
                <div className={`w-2 h-2 rounded-full ${isOffline ? 'bg-amber-500' : 'bg-[#10b981] animate-pulse'}`} />
                <span className={isOffline ? 'text-amber-700' : 'text-[#009B87]'}>{isOffline ? 'Offline Mode (Local Cache)' : 'Synchronized Session'}</span>
                <span className="opacity-30 text-[#009B87]">|</span>
                <span className={isOffline ? 'text-amber-600' : 'text-slate-600'}>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
             </div>
          </div>
        </header>
        <div className="p-10 w-full">
          <ErrorBoundary
            variant="inline"
            onReset={() => setActiveTab('dashboard')}
            onNavigateHome={() => setActiveTab('dashboard')}
            resetLabel="Return to Dashboard"
          >
            {renderContent()}
          </ErrorBoundary>
        </div>
      </main>



      {/* Add Execution Suite Modal */}
      {isSuiteModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl p-8 sm:p-10 border border-white max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6 flex-shrink-0">
               <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100"><Network size={24} /></div>
               <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Add Execution Suite</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Initialize new API collection run</p>
               </div>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-5">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Suite Label</label>
                <input 
                  type="text" 
                  value={newSuiteName || ''} 
                  onChange={(e) => setNewSuiteName(e.target.value)} 
                  placeholder="e.g. Identity Regression" 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-4 ring-indigo-50/10 transition-all shadow-inner" 
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Source Collection</label>
                <div className="relative">
                  <select 
                    value={selectedFolderId || ''} 
                    onChange={(e) => {
                      const newId = e.target.value;
                      setSelectedFolderId(newId);
                      setSuiteError('');
                      if (!newSuiteName.trim() && newId) {
                        const target = availableCollections.find(c => c.id === newId);
                        if (target) {
                          setNewSuiteName(target.name.replace(/\s*\(.*?\)\s*/g, '').trim());
                        }
                      }
                    }} 
                    className="w-full pl-6 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none appearance-none cursor-pointer focus:ring-4 ring-indigo-50 shadow-inner"
                  >
                    <option value="">Select Target Collection</option>
                    {availableCollections.length === 0 ? (
                      <option value="" disabled>No collections available in API Testing</option>
                    ) : (
                      availableCollections.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name} {f.scenarioCount > 0 ? `(${f.scenarioCount} scenario${f.scenarioCount === 1 ? '' : 's'})` : '(0 scenarios)'}
                        </option>
                      ))
                    )}
                  </select>
                  <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                </div>
              </div>

              {/* Generated Scenarios Preview directly under the selected dropdown */}
              {selectedFolderId && (() => {
                const scenarios = getSuiteScenarios(selectedFolderId);
                return (
                  <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${scenarios.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          Generated Scenarios ({scenarios.length})
                        </label>
                      </div>
                      {scenarios.length > 0 && (
                        <span className="text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full font-mono">
                          Ready for Execution
                        </span>
                      )}
                    </div>

                    {scenarios.length === 0 ? (
                      <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">No scenarios found in this collection</p>
                        <p className="text-[10px] text-slate-400 mt-1">Execute requests and generate scenarios in API Testing to populate this collection.</p>
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto space-y-2 p-1 custom-scrollbar border border-slate-100 rounded-2xl bg-slate-50/50">
                        {scenarios.map((scen, sIdx) => {
                          const method = String(scen?.method || 'GET').toUpperCase();
                          const methodColors: Record<string, string> = {
                            GET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            POST: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                            PUT: 'bg-amber-50 text-amber-700 border-amber-200',
                            PATCH: 'bg-teal-50 text-teal-700 border-teal-200',
                            DELETE: 'bg-rose-50 text-rose-700 border-rose-200',
                          };
                          const badgeClass = methodColors[method] || 'bg-slate-100 text-slate-700 border-slate-200';

                          return (
                            <div 
                              key={scen.id || sIdx} 
                              className="p-3.5 bg-white border border-slate-200/80 rounded-xl shadow-2xs hover:border-indigo-200 transition-all flex flex-col gap-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-md border ${badgeClass} uppercase font-mono`}>
                                    {method}
                                  </span>
                                  <span className="text-xs font-bold text-slate-800 truncate" title={scen.scenarioTitle || scen.name}>
                                    {scen.scenarioTitle || scen.name || `Scenario ${sIdx + 1}`}
                                  </span>
                                </div>
                                <span className="text-[9px] font-mono text-slate-400 flex-shrink-0">
                                  #{String(sIdx + 1).padStart(2, '0')}
                                </span>
                              </div>

                              {scen.url && (
                                <p className="text-[10px] font-mono text-slate-400 truncate pl-0.5">
                                  {scen.url}
                                </p>
                              )}

                              {scen.expectedResults && (
                                <p className="text-[10px] text-slate-500 line-clamp-1 pl-0.5">
                                  <span className="font-semibold text-slate-600">Expected:</span> {scen.expectedResults}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {suiteError && (
                <div className="p-4 bg-red-50 rounded-2xl border border-red-100 text-red-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                  <Zap size={14} /> {suiteError}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 pt-6 flex-shrink-0 border-t border-slate-100 mt-4">
              <button 
                onClick={handleSaveSuite} 
                className="w-full py-4.5 bg-indigo-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                Submit
              </button>
              <button 
                onClick={() => {
                  setIsSuiteModalOpen(false);
                  setNewSuiteName('');
                  setSelectedFolderId('');
                  setSuiteError('');
                }} 
                className="w-full py-4 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Suite Confirmation Modal */}
      {deleteSuiteConfirm && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white p-10 rounded-[3.5rem] max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-300 border border-white">
             <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-10 text-rose-500 shadow-inner">
                <AlertTriangle size={48} />
             </div>
             <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4 leading-none">Delete Suite?</h3>
             <p className="text-sm text-slate-500 font-medium leading-relaxed mb-12 px-4">Permanently remove <span className="font-bold text-slate-800">"{deleteSuiteConfirm.name}"</span>? This action is irreversible.</p>
             <div className="flex flex-col gap-4">
                <button onClick={() => { handleDeleteSuite(deleteSuiteConfirm.id); setDeleteSuiteConfirm(null); }} className="w-full py-5 bg-rose-600 text-white rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest hover:bg-rose-700 shadow-2xl shadow-rose-100 active:scale-95 transition-all">Delete / Continue</button>
                <button onClick={() => setDeleteSuiteConfirm(null)} className="w-full py-5 bg-slate-100 text-slate-500 rounded-[1.8rem] font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
             </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewDetailsSuite && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg"><Eye size={24} /></div>
                    <div>
                       <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{viewDetailsSuite.name} Scenarios</h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Included collection requests</p>
                    </div>
                 </div>
                 <button onClick={() => setViewDetailsSuite(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={24} />
                 </button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-4">
                 {getSuiteScenarios(viewDetailsSuite.targetFolderId).length === 0 ? (
                   <div className="py-20 text-center text-slate-400 italic font-medium">No scenarios found in this collection.</div>
                 ) : (
                   getSuiteScenarios(viewDetailsSuite.targetFolderId).map((req, ridx) => (
                     <div key={req.id} className="p-6 bg-slate-50 border border-slate-100 rounded-[2rem] hover:border-indigo-200 transition-all group">
                        <div className="flex items-center justify-between mb-4">
                           <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black uppercase text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">{req.method}</span>
                              <h4 className="text-sm font-bold text-slate-800">{req.name || 'Untitled Request'}</h4>
                           </div>
                           <span className="text-[10px] font-mono text-slate-400">Step {ridx + 1}</span>
                        </div>
                        <div className="space-y-4">
                           {req.description && (
                             <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Scenario Description</p>
                                <p className="text-xs text-slate-600 leading-relaxed">{req.description}</p>
                             </div>
                           )}
                           {req.expectedResults && (
                             <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Expected Results</p>
                                <p className="text-xs text-indigo-600 font-bold leading-relaxed">{req.expectedResults}</p>
                             </div>
                           )}
                        </div>
                     </div>
                   ))
                 )}
              </div>
              <div className="p-8 border-t border-slate-100 flex justify-end bg-slate-50/50">
                 <button onClick={() => setViewDetailsSuite(null)} className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all">Close Details</button>
              </div>
           </div>
        </div>
      )}

      {/* Add Evidence Modal */}
      {addEvidenceContext && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[3.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-white">
              <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-sm">
                 <div className="flex items-center gap-6">
                    <div className="p-5 bg-indigo-600 rounded-[1.5rem] text-white shadow-2xl shadow-indigo-100">
                       <Paperclip size={32} />
                    </div>
                    <div>
                       <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Add Execution Evidence</h3>
                       {!addEvidenceContext.scenarioId && (
                          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                             Execution Suite: {addEvidenceContext.suite.name}
                          </p>
                       )}
                    </div>
                 </div>
                 <button onClick={() => setAddEvidenceContext(null)} className="p-3 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all border border-slate-100 shadow-sm">
                    <X size={32} />
                 </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar bg-white">
                 {/* Comments Section */}
                 <div>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-3 ml-2">
                       <MessageSquare size={16} className="text-indigo-50" /> Execution Notes & Observations
                    </label>
                    <textarea 
                       value={currentStaged?.comment || ''} 
                       onChange={e => updateStagedField('comment', e.target.value)} 
                       placeholder="Enter technical findings, bug descriptions, or general observations here..." 
                       className="w-full h-40 px-8 py-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none shadow-inner text-slate-700" 
                    />
                 </div>
                 
                 {/* Links Section */}
                 <div>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-3 ml-2">
                       <Link2 size={16} className="text-indigo-50" /> Reference Links (Jam, Jira etc)
                    </label>
                    <div className="flex gap-3 mb-6">
                       <div className="relative flex-1 group">
                          <Link2 className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                          <input 
                             value={newLinkInput || ''} 
                             onChange={e => setNewLinkInput(e.target.value)} 
                             onKeyDown={e => e.key === 'Enter' && handleAddEvidenceLink()}
                             placeholder="e.g. Jira Ticket URL, Confluence link, Log viewer..." 
                             className="w-full pl-14 pr-6 py-5 bg-slate-50 border border-slate-200 rounded-3xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all shadow-sm" 
                          />
                       </div>
                       <button onClick={handleAddEvidenceLink} className="px-8 py-5 bg-indigo-600 text-white rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-lg active:scale-95 transition-all">Add Link</button>
                    </div>

                    {currentStaged?.links && currentStaged.links.length > 0 && (
                       <div className="space-y-3 px-2">
                          {currentStaged.links.map((link, lidx) => (
                             <div key={lidx} className="flex items-center justify-between p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl group/link">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                   <ExternalLink size={14} className="text-indigo-400 flex-shrink-0" />
                                   <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-indigo-700 hover:underline truncate">{link}</a>
                                </div>
                                <button onClick={() => handleRemoveEvidenceLink(lidx)} className="p-2 text-slate-400 hover:text-rose-500 opacity-0 group-hover/link:opacity-100 transition-all"><Trash2 size={16} /></button>
                             </div>
                          ))}
                       </div>
                    )}
                 </div>

                 {/* Attachments Section */}
                 <div>
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-3 ml-2">
                       <Upload size={16} className="text-indigo-50" /> EVIDENCE (SCREENSHOT/IMAGES)
                    </label>
                    <div 
                      onClick={() => !isUploadingMedia && fileInputRef.current?.click()}
                      className={`border-4 border-dashed border-slate-100 rounded-[3rem] p-16 flex flex-col items-center justify-center gap-6 bg-slate-50/50 hover:bg-indigo-50/20 hover:border-indigo-200 transition-all cursor-pointer group mb-10 ${isUploadingMedia ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                       <input type="file" multiple ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileSelect} />
                       {isUploadingMedia ? (
                          <div className="flex flex-col items-center gap-4">
                             <Loader2 size={48} className="animate-spin text-indigo-600" />
                             <p className="text-xs font-black uppercase tracking-widest text-slate-400">Processing Media stream...</p>
                          </div>
                       ) : (
                          <>
                             <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-slate-300 group-hover:text-indigo-50 group-hover:scale-110 shadow-xl border border-slate-100 transition-all">
                                <Upload size={40} />
                             </div>
                             <div className="text-center">
                                <p className="text-lg font-black text-slate-700 uppercase tracking-tight">Drop files or click to initiate upload</p>
                                <p className="text-xs text-slate-400 font-bold uppercase mt-2 tracking-[0.2em]">Supports PNG, JPG, WEBP, MP4, MOV, WEBM (Aggressive Compression)</p>
                             </div>
                          </>
                       )}
                    </div>

                    {uploadSuccessMessage && (
                       <div className="mb-8 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center gap-3 text-emerald-600 text-sm font-black uppercase tracking-widest animate-in slide-in-from-top-2">
                          <CheckCircle size={20} />
                          {uploadSuccessMessage}
                       </div>
                    )}

                    {currentStaged?.attachments && currentStaged.attachments.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-6 animate-in slide-in-from-top-4">
                        {currentStaged.attachments.map((data, aidx) => {
                          const isVid = data.startsWith('data:video') || data.toLowerCase().includes('.mp4') || data.toLowerCase().includes('.mov') || data.toLowerCase().includes('.webm');
                          return (
                            <div key={aidx} className="relative group/att rounded-[2rem] overflow-hidden border border-slate-200 shadow-xl aspect-video bg-slate-900">
                               {isVid ? (
                                 <div 
                                   className="w-full h-full flex flex-col items-center justify-center gap-3 cursor-pointer"
                                   onClick={() => setPreviewMedia({ url: data, type: 'video' })}
                                 >
                                    <FileVideo size={48} className="text-white/30" />
                                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Video Stream Asset</span>
                                    <div className="absolute inset-0 bg-indigo-600/10 opacity-0 group-hover/att:opacity-100 transition-all flex items-center justify-center">
                                       <PlayCircle size={48} className="text-white shadow-2xl" />
                                    </div>
                                 </div>
                               ) : (
                                 <img 
                                   src={data || undefined} 
                                   className="w-full h-full object-cover transition-transform duration-700 group-hover/att:scale-110 opacity-80 group-hover/att:opacity-100 cursor-zoom-in" 
                                   alt="Evidence" 
                                   onClick={() => setPreviewMedia({ url: data, type: 'image' })}
                                 />
                               )}
                               <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover/att:opacity-100 transition-all z-20">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleDownloadMedia(data, aidx); }}
                                    className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-2xl hover:bg-indigo-700 transition-all"
                                    title="Download"
                                  >
                                    <Download size={18}/>
                                  </button>
                                  <button 
                                    onClick={() => updateStagedField('attachments', currentStaged.attachments!.filter((_, i) => i !== aidx))} 
                                    className="p-2.5 bg-rose-500 text-white rounded-2xl shadow-2xl hover:bg-rose-600 transition-all"
                                    title="Delete"
                                  >
                                    <Trash2 size={18}/>
                                  </button>
                               </div>
                               <div className="absolute bottom-4 left-4 px-4 py-1.5 bg-black/40 backdrop-blur-md rounded-xl border border-white/10">
                                  <div className="flex items-center gap-2">
                                     {isVid ? <FileVideo size={14} className="text-white"/> : <ImageIcon size={14} className="text-white"/>}
                                     <span className="text-[9px] font-black uppercase text-white tracking-widest">{isVid ? 'Video Evidence' : 'Static Image'}</span>
                                  </div>
                               </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                 </div>
              </div>
              
              <div className="p-10 bg-slate-50 border-t border-slate-100 flex gap-5 shadow-[0_-10px_40px_rgba(0,0,0,0.02)]">
                 <button 
                  onClick={saveEvidence} 
                  disabled={isUploadingMedia}
                  className={`flex-1 py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-sm uppercase tracking-widest hover:bg-indigo-700 shadow-2xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-3 ${isUploadingMedia ? 'opacity-50 cursor-not-allowed' : ''}`}
                 >
                    {isUploadingMedia ? <Loader2 size={24} /> : <CheckCircle2 size={24} />} Commit Evidence Context
                 </button>
                 <button onClick={() => setAddEvidenceContext(null)} className="flex-1 py-6 bg-white text-slate-500 border border-slate-200 rounded-[2rem] font-black text-sm uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all">Discard Operation</button>
              </div>
           </div>
        </div>
      )}
      <Toaster position="top-right" richColors closeButton />
      <AICacheNotification />
      <QACopilot
        user={contextualUser}
        activeTab={activeTab}
        activeProject={activeProject}
        projects={projects}
        onNavigate={(tab: ActiveTab) => setActiveTab(tab)}
      />
      <JiraBugModal 
        isOpen={apiBugModalOpen} 
        onClose={() => setApiBugModalOpen(false)} 
        project={activeProject} 
        customTitle={apiBugTitle}
        customDescription={apiBugDescription}
        customAttachments={apiBugAttachments}
        customLinks={apiBugLinks}
        customComments={apiBugComments}
        user={contextualUser}
      />
    </div>
    </ErrorBoundary>
  );
};

export default App;