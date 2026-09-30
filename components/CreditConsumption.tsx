import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  Coins, 
  Search, 
  Download, 
  Copy, 
  RefreshCw, 
  Zap, 
  ShieldCheck, 
  Cpu, 
  CheckCircle2, 
  Sparkles, 
  Layers, 
  Sliders, 
  Filter,
  Plus, 
  Trash2, 
  UserCheck, 
  ArrowUpDown, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  Globe, 
  AlertTriangle, 
  Terminal, 
  Smartphone, 
  Activity, 
  Calendar, 
  Award,
  Eye,
  CheckSquare,
  Crown,
  Send,
  UserPlus,
  Clock,
  ShieldAlert,
  Info
} from 'lucide-react';
import { 
  User, 
  UserRole, 
  TokenLog, 
  Project, 
  SubscriptionRequest,
  ProjectPlan,
  ProjectCreditSummary,
  PlanType,
  ProjectMemberCreditContribution
} from '../types';
import { 
  getTokenLogs, 
  getFirestoreTokenLogs,
  addTokenLog, 
  deleteTokenLog,
  deleteTokenLogs,
  resetDefaultTokenLogs, 
  clearAllTokenLogs,
  subscribeToFirestoreTokenLogs, 
  AUTOMATIQA_MODULES,
  calculateCreditsConsumed,
  getCreditCost,
  calculateInputTier,
  formatToIST,
  TOTAL_CREDIT_POOL,
  BASIC_PLAN_CONFIG,
  TRIAL_PLAN_CONFIG,
  PAID_PLAN_CONFIG,
  PLAN_CONFIGS,
  getBasicPlanValidity,
  getUserCreditSummary,
  getUserCreditCycleDetails,
  UserCreditCycleDetails,
  getProjectPlans,
  getProjectPlanSync,
  getProjectCreditSummary,
  renewProjectPlanCycle,
  switchProjectPlan,
  reEnableProjectPlanBySuperAdmin,
  resetBasicPlanStartDate,
  isSuperAdminUser,
  isAdminUser,
  getAccessibleProjects,
  getAuthorizedMembersForProjects,
  isLogRecordAccessible,
  isLogMatchingProject,
  getProjectDisplayName
} from '../services/tokenConsumptionService';
import seededUsers from '../users.json';
import {
  getSubscriptionRequests,
  getLocalSubscriptionRequests,
  reEnableUserSubscription,
  grantDirectSubscription,
  createSubscriptionRequest,
  subscribeToSubscriptionRequests
} from '../services/subscriptionService';

interface CreditConsumptionProps {
  currentUser: User;
  activeProject?: Project | null;
  projects?: Project[];
  onSelectProject?: (projectId: string) => void;
}

export function getActionTypeInfo(log: Partial<TokenLog> | null | undefined): {
  type: 'copy' | 'download' | 'export' | 'analysis';
  label: string;
  badgeClass: string;
  isExport: boolean;
} {
  if (!log) {
    return {
      type: 'analysis',
      label: 'AI Analysis',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      isExport: false
    };
  }

  const actionStr = (log.actionType || '').toLowerCase().trim();
  const outputStr = (log.outputType || '').toLowerCase().trim();
  const modalityDetails = (log.inputModalityDetails || '').toLowerCase().trim();
  const featureStr = (log.feature || '').toLowerCase().trim();

  const isCopy = 
    actionStr === 'copy' || 
    outputStr.includes('copy') || 
    outputStr.includes('snippet') || 
    outputStr.includes('clipboard') ||
    modalityDetails.includes('copy');

  const isDownload = 
    actionStr === 'download' || 
    outputStr.includes('download') || 
    outputStr.includes('pdf') || 
    outputStr.includes('excel') || 
    outputStr.includes('jmx') || 
    outputStr.includes('json') ||
    outputStr.includes('zip') ||
    outputStr.includes('xml') ||
    modalityDetails.includes('download');

  const isExport = 
    actionStr === 'export' || 
    actionStr === 'copy / download' || 
    actionStr === 'export / download' ||
    outputStr.includes('export') || 
    outputStr.includes('jira') ||
    modalityDetails.includes('export') ||
    featureStr.includes('export');

  if (isCopy && !isDownload) {
    return {
      type: 'copy',
      label: 'Copy',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      isExport: true
    };
  }

  if (isDownload && !isCopy) {
    return {
      type: 'download',
      label: 'Download',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      isExport: true
    };
  }

  if (isCopy || isDownload || isExport) {
    if (outputStr.includes('copy')) {
      return {
        type: 'copy',
        label: 'Copy',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        isExport: true
      };
    }
    if (outputStr.includes('download')) {
      return {
        type: 'download',
        label: 'Download',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        isExport: true
      };
    }
    return {
      type: 'export',
      label: 'Copy / Download',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      isExport: true
    };
  }

  return {
    type: 'analysis',
    label: 'AI Analysis',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
    isExport: false
  };
}

export const CreditConsumption: React.FC<CreditConsumptionProps> = ({ currentUser, activeProject, projects = [], onSelectProject }) => {
  const isSuperAdmin = useMemo(() => isSuperAdminUser(currentUser), [currentUser]);
  const isAdmin = useMemo(() => isAdminUser(currentUser), [currentUser]);

  // For Admin role: determine their particular project
  const adminParticularProject = useMemo<Project | null>(() => {
    if (isSuperAdmin) return null;
    // 1. If activeProject is provided, prioritize it as the active particular project
    if (activeProject) {
      return activeProject;
    }
    // 2. Otherwise check assigned/accessible projects
    const accessible = getAccessibleProjects(currentUser, projects);
    if (accessible.length > 0) {
      return accessible[0];
    }
    // 3. Fallback to first available project
    return projects.length > 0 ? projects[0] : null;
  }, [isSuperAdmin, activeProject, currentUser, projects]);

  // Accessible projects according to user role:
  // - Super Admin: has full access to all projects in the system
  // - Admin: restricted strictly to their particular project
  const accessibleProjects = useMemo(() => {
    if (isSuperAdmin) {
      const list = getAccessibleProjects(currentUser, projects);
      if (activeProject && !list.some(p => p.id === activeProject.id || p.name === activeProject.name)) {
        return [...list, activeProject];
      }
      if (list.length === 0) {
        if (activeProject) return [activeProject];
        if (projects.length > 0) return projects;
      }
      return list.length > 0 ? list : projects;
    }
    return adminParticularProject ? [adminParticularProject] : [];
  }, [isSuperAdmin, currentUser, projects, activeProject, adminParticularProject]);

  // Authorized members for accessible projects
  const authorizedMembers = useMemo(() => {
    return getAuthorizedMembersForProjects(accessibleProjects, (seededUsers as any) || []);
  }, [accessibleProjects]);

  const authorizedMemberEmails = useMemo(() => {
    return new Set(authorizedMembers.map(m => m.email.toLowerCase().trim()));
  }, [authorizedMembers]);

  const [logs, setLogs] = useState<TokenLog[]>(() => getTokenLogs());
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>(() => {
    if (!isSuperAdmin && adminParticularProject?.name) {
      return adminParticularProject.name;
    }
    if (activeProject?.name && activeProject.name !== '27/07') {
      return activeProject.name;
    }
    const storedName = typeof window !== 'undefined'
      ? (localStorage.getItem('automatiqa_active_project_name') || (window as any).__automatiqa_active_project_name)
      : null;
    if (storedName && storedName !== '27/07') {
      return storedName;
    }
    const validAcc = accessibleProjects.find(p => p.name && p.name !== '27/07');
    if (validAcc?.name) return validAcc.name;
    const validProj = projects.find(p => p.name && p.name !== '27/07');
    if (validProj?.name) return validProj.name;
    return 'Project - Pradee';
  });

  // Sync selectedProject when activeProject loads or changes
  useEffect(() => {
    if (activeProject?.name && activeProject.name !== '27/07') {
      setSelectedProject(prev => {
        if (!prev || prev === '27/07' || !projects.some(p => p.name === prev || p.id === prev)) {
          return activeProject.name;
        }
        return prev;
      });
    }
  }, [activeProject?.name, projects]);

  // Keep selectedProject strictly locked to adminParticularProject for Admin role
  useEffect(() => {
    if (!isSuperAdmin && adminParticularProject?.name) {
      if (selectedProject !== adminParticularProject.name) {
        setSelectedProject(adminParticularProject.name);
      }
    }
  }, [isSuperAdmin, adminParticularProject, selectedProject]);
  const [selectedMember, setSelectedMember] = useState<string>('All');
  const [selectedFeature, setSelectedFeature] = useState<string>('All');
  const [selectedTier, setSelectedTier] = useState<string>('All');
  const [selectedCacheStatus, setSelectedCacheStatus] = useState<string>('All');
  const [selectedActionType, setSelectedActionType] = useState<string>('All');
  const [sortField, setSortField] = useState<'timestamp' | 'creditsConsumed' | 'itemsGenerated'>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [inspectLog, setInspectLog] = useState<TokenLog | null>(null);
  
  // Navigation Tabs: Overview, Subscription Management, Logs, Rate Card (Calculator removed per user request)
  const [activeTab, setActiveTab] = useState<'credits_overview' | 'subscription_management' | 'consumption_table' | 'rate_card'>('credits_overview');

  // Subscription Management state
  const [subscriptionRequests, setSubscriptionRequests] = useState<SubscriptionRequest[]>(() => getLocalSubscriptionRequests());
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Plan validity state
  const [validityInfo, setValidityInfo] = useState(() => getBasicPlanValidity());

  // Project-level plan versioning & live sync
  const [projectPlansVersion, setProjectPlansVersion] = useState<number>(0);
  const [isUpdatingPlan, setIsUpdatingPlan] = useState<boolean>(false);

  // Project Subscription Request State
  const [isSubscribeModalOpen, setIsSubscribeModalOpen] = useState(false);
  const [isSubscribingProject, setIsSubscribingProject] = useState(false);
  const [subscribeNotes, setSubscribeNotes] = useState('');

  // Multi-select and delete state
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    open: boolean;
    ids: string[];
    title: string;
    message: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Simulation form states
  const [simFeature, setSimFeature] = useState<string>(AUTOMATIQA_MODULES[0].name);
  const [simProject, setSimProject] = useState<string>(
    accessibleProjects[0]?.name || activeProject?.name || projects[0]?.name || 'Global Retail Banking App'
  );
  const [simUserStoryId, setSimUserStoryId] = useState('US-101');
  const [simModality, setSimModality] = useState<'Text' | 'Screenshot' | 'Video' | 'Document' | 'URL' | 'Multimodal'>('Multimodal');
  const [simModalityDetails, setSimModalityDetails] = useState('2 Wireframe Screenshots + PRD Document');
  const [simItemsGenerated, setSimItemsGenerated] = useState<number>(5);
  const [simCached, setSimCached] = useState<boolean>(false);

  // Sync with Firestore & handle real-time updates
  useEffect(() => {
    let isMounted = true;

    // Load project plans from backend
    getProjectPlans().then(() => {
      if (isMounted) setProjectPlansVersion(v => v + 1);
    });

    // 1. Initial direct fetch from backend/Firestore with RBAC parameters
    const loadInitialLogs = async () => {
      try {
        const directLogs = await getFirestoreTokenLogs(currentUser, accessibleProjects);
        if (isMounted) {
          setLogs(directLogs);
          setIsLoadingLogs(false);
          setFirestoreError(null);
        }
      } catch (err: any) {
        console.error("[CreditConsumption] Initial Firestore fetch error:", err);
        if (isMounted) {
          setFirestoreError(err?.message || "Failed to load records from Firestore.");
          setIsLoadingLogs(false);
        }
      }
    };
    loadInitialLogs();

    // 2. Real-time Firestore subscription with error surfacing
    const unsubscribe = subscribeToFirestoreTokenLogs(
      (firestoreLogs) => {
        if (isMounted) {
          setLogs(firestoreLogs);
          setIsLoadingLogs(false);
          setFirestoreError(null);
          setValidityInfo(getBasicPlanValidity());
        }
      },
      (err) => {
        console.error("[CreditConsumption] Firestore live listener error:", err);
        if (isMounted) {
          setFirestoreError(err?.message || "Firestore listener connection issue.");
          setIsLoadingLogs(false);
        }
      },
      currentUser,
      accessibleProjects
    );

    const refreshSubs = async () => {
      const subs = await getSubscriptionRequests();
      if (isMounted) {
        setSubscriptionRequests(subs);
      }
    };
    refreshSubs();

    const unsubscribeSubs = subscribeToSubscriptionRequests((subs) => {
      if (isMounted) {
        setSubscriptionRequests(subs);
      }
    });

    const handleSubUpdate = () => {
      if (isMounted) {
        setSubscriptionRequests(getLocalSubscriptionRequests());
        setValidityInfo(getBasicPlanValidity());
      }
    };

    const handleProjectPlanUpdate = () => {
      if (isMounted) {
        setProjectPlansVersion(v => v + 1);
      }
    };

    const handleTokenLogUpdate = (e: any) => {
      if (!isMounted) return;
      const detail = e?.detail;
      if (detail && !detail.cleared && !detail.reset && detail.id) {
        setLogs(prev => {
          if (prev.some(l => l.id === detail.id)) return prev;
          return [detail, ...prev];
        });
      } else if (detail?.cleared || detail?.reset) {
        setLogs([]);
      } else if (detail?.deletedIds && Array.isArray(detail.deletedIds)) {
        const deletedSet = new Set(detail.deletedIds);
        setLogs(prev => prev.filter(l => !deletedSet.has(l.id)));
      } else if (detail?.deletedId) {
        setLogs(prev => prev.filter(l => l.id !== detail.deletedId));
      }
      setValidityInfo(getBasicPlanValidity());
      setProjectPlansVersion(v => v + 1);
    };

    window.addEventListener('subscription-request-updated', handleSubUpdate);
    window.addEventListener('token-consumption-updated', handleTokenLogUpdate);
    window.addEventListener('user-credit-cycle-reset', handleSubUpdate);
    window.addEventListener('project-plan-updated', handleProjectPlanUpdate);

    return () => {
      isMounted = false;
      unsubscribe();
      unsubscribeSubs();
      window.removeEventListener('subscription-request-updated', handleSubUpdate);
      window.removeEventListener('token-consumption-updated', handleTokenLogUpdate);
      window.removeEventListener('user-credit-cycle-reset', handleSubUpdate);
      window.removeEventListener('project-plan-updated', handleProjectPlanUpdate);
    };
  }, [currentUser, accessibleProjects]);

  const handleRefreshFromFirestore = async () => {
    setIsRefreshing(true);
    setFirestoreError(null);
    try {
      const refreshed = await getFirestoreTokenLogs(currentUser, accessibleProjects);
      setLogs(refreshed);
      setValidityInfo(getBasicPlanValidity());
    } catch (err: any) {
      console.error("[CreditConsumption] Manual refresh error:", err);
      setFirestoreError(err?.message || "Failed to refresh records from Firestore.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshValidity = () => {
    setValidityInfo(getBasicPlanValidity());
  };

  // Helper icons for modules
  const getModuleIcon = (featureName: string) => {
    const lower = featureName.toLowerCase();
    if (lower.includes('user story') || lower.includes('requirement')) return <Sparkles size={16} className="text-amber-500" />;
    if (lower.includes('scenario')) return <Layers size={16} className="text-blue-500" />;
    if (lower.includes('manual') || lower.includes('case')) return <FileText size={16} className="text-emerald-500" />;
    if (lower.includes('script') || lower.includes('cypress') || lower.includes('playwright')) return <Terminal size={16} className="text-purple-500" />;
    if (lower.includes('performance') || lower.includes('load')) return <Activity size={16} className="text-rose-500" />;
    if (lower.includes('api')) return <Globe size={16} className="text-cyan-500" />;
    if (lower.includes('ui') || lower.includes('visual')) return <ImageIcon size={16} className="text-indigo-500" />;
    if (lower.includes('record') || lower.includes('play')) return <Video size={16} className="text-orange-500" />;
    if (lower.includes('mobile')) return <Smartphone size={16} className="text-teal-500" />;
    return <Cpu size={16} className="text-slate-500" />;
  };

  // Authorized logs for this user session (defence-in-depth)
  const authorizedLogs = useMemo(() => {
    if (isSuperAdmin) return logs;
    return logs.filter(l => isLogRecordAccessible(l, accessibleProjects, authorizedMemberEmails));
  }, [logs, isSuperAdmin, accessibleProjects, authorizedMemberEmails]);

  // Unified helper to match a log to selected project taking into account case-insensitivity, IDs, names, and slugs
  const isLogMatching = useCallback((
    log: TokenLog,
    selProj: string
  ): boolean => {
    if (!selProj || selProj === 'All') return true;
    return isLogMatchingProject(log, selProj, projects);
  }, [projects]);

  // Distinct projects and members for dropdown filters
  const uniqueProjects = useMemo(() => {
    if (!isSuperAdmin) {
      return adminParticularProject?.name ? [adminParticularProject.name] : [];
    }
    const set = new Set<string>();
    accessibleProjects.forEach(p => { if (p.name && p.name !== '27/07') set.add(p.name); });
    projects.forEach(p => { if (p.name && p.name !== '27/07') set.add(p.name); });
    authorizedLogs.forEach(l => {
      const displayName = getProjectDisplayName(l, projects);
      if (displayName && displayName !== 'Default Project' && displayName !== '27/07') {
        set.add(displayName);
      } else if (l.project && l.project !== 'Default Project' && l.project !== '27/07') {
        set.add(l.project);
      }
    });
    return ['All', ...Array.from(set)];
  }, [isSuperAdmin, adminParticularProject, projects, authorizedLogs, accessibleProjects]);

  // Scoped members for selected project
  const scopedMembers = useMemo(() => {
    if (selectedProject === 'All') {
      return authorizedMembers;
    }
    const targetProject = accessibleProjects.find(
      p => p.name === selectedProject || p.id === selectedProject || (p.name && p.name.toLowerCase().trim() === selectedProject.toLowerCase().trim())
    ) || (isSuperAdmin ? projects.find(
      p => p.name === selectedProject || p.id === selectedProject || (p.name && p.name.toLowerCase().trim() === selectedProject.toLowerCase().trim())
    ) : undefined);

    if (!targetProject) {
      return authorizedMembers;
    }
    return getAuthorizedMembersForProjects([targetProject], (seededUsers as any) || []);
  }, [selectedProject, authorizedMembers, accessibleProjects, isSuperAdmin, projects]);

  const uniqueMembers = useMemo(() => {
    const set = new Set<string>();
    scopedMembers.forEach(m => set.add(m.email));
    
    // Supplement with users who have logs in this project/scope
    const candidateLogs = selectedProject === 'All' 
      ? authorizedLogs 
      : authorizedLogs.filter(l => isLogMatching(l, selectedProject));
      
    candidateLogs.forEach(l => {
      if (l.userEmail) {
        const lower = l.userEmail.toLowerCase().trim();
        if (isSuperAdmin || authorizedMemberEmails.has(lower)) {
          set.add(l.userEmail);
        }
      } else if (l.user) {
        set.add(l.user);
      }
    });

    return ['All', ...Array.from(set)];
  }, [scopedMembers, selectedProject, authorizedLogs, isSuperAdmin, authorizedMemberEmails, isLogMatching]);

  // Helper to format a friendly label for member dropdowns
  const getMemberLabel = useCallback((m: string): string => {
    const memberObj = authorizedMembers.find(mem => mem.email.toLowerCase().trim() === m.toLowerCase().trim());
    if (memberObj) return `${memberObj.name} (${m})`;
    const logMatch = authorizedLogs.find(l => 
      (l.userEmail && l.userEmail.toLowerCase().trim() === m.toLowerCase().trim()) || 
      (l.user && l.user.toLowerCase().trim() === m.toLowerCase().trim())
    );
    if (logMatch?.user && logMatch?.userEmail && logMatch.userEmail.toLowerCase().trim() === m.toLowerCase().trim()) {
      return `${logMatch.user} (${m})`;
    }
    return m;
  }, [authorizedMembers, authorizedLogs]);

  // Ensure selectedMember is reset if it's no longer valid in current scope
  useEffect(() => {
    if (selectedMember !== 'All' && !uniqueMembers.includes(selectedMember)) {
      setSelectedMember('All');
    }
  }, [uniqueMembers, selectedMember]);

  // Logs scoped to selectedProject and selectedMember
  const scopedLogs = useMemo(() => {
    return authorizedLogs.filter(log => {
      const matchesProject = isLogMatching(log, selectedProject);
      const matchesMember = selectedMember === 'All' || 
        (log.userEmail && log.userEmail.toLowerCase().trim() === selectedMember.toLowerCase().trim()) ||
        (log.user && log.user.toLowerCase().trim() === selectedMember.toLowerCase().trim());
      return matchesProject && matchesMember;
    });
  }, [authorizedLogs, selectedProject, selectedMember, isLogMatching]);

  const uniqueFeatures = useMemo(() => {
    return ['All', ...AUTOMATIQA_MODULES.map(m => m.name)];
  }, []);

  // Filtered & Sorted logs
  const filteredLogs = useMemo(() => {
    return scopedLogs
      .filter(log => {
        const matchesSearch = 
          searchTerm === '' ||
          (log.feature || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.user || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.userEmail && log.userEmail.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (log.project || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.userStoryId && log.userStoryId.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (log.inputModality && log.inputModality.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (log.inputModalityDetails && log.inputModalityDetails.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (log.outputType && log.outputType.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (log.workspace && log.workspace.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesFeature = selectedFeature === 'All' || log.feature === selectedFeature;
        const tier = log.tier || calculateInputTier(log).tier;
        const matchesTier = selectedTier === 'All' || tier === selectedTier;
        const matchesCache = selectedCacheStatus === 'All' || 
          (selectedCacheStatus === 'Cached' && log.cached) || 
          (selectedCacheStatus === 'Standard' && !log.cached);
        const info = getActionTypeInfo(log);
        const matchesActionType = selectedActionType === 'All' ||
          (selectedActionType === 'export' && info.isExport) ||
          (selectedActionType === 'copy' && info.type === 'copy') ||
          (selectedActionType === 'download' && info.type === 'download') ||
          (selectedActionType === 'analysis' && !info.isExport);

        return matchesSearch && matchesFeature && matchesTier && matchesCache && matchesActionType;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'timestamp') {
          diff = a.timestamp - b.timestamp;
        } else if (sortField === 'creditsConsumed') {
          const aInfo = getActionTypeInfo(a);
          const bInfo = getActionTypeInfo(b);
          const aCredits = a.creditsConsumed ?? calculateCreditsConsumed(a.feature, a.itemsGenerated || 1, a.cached, aInfo.isExport ? 'export' : 'analysis');
          const bCredits = b.creditsConsumed ?? calculateCreditsConsumed(b.feature, b.itemsGenerated || 1, b.cached, bInfo.isExport ? 'export' : 'analysis');
          diff = aCredits - bCredits;
        } else if (sortField === 'itemsGenerated') {
          diff = (a.itemsGenerated || 1) - (b.itemsGenerated || 1);
        }
        return sortDirection === 'asc' ? diff : -diff;
      });
  }, [scopedLogs, searchTerm, selectedFeature, selectedTier, selectedCacheStatus, selectedActionType, sortField, sortDirection]);

  // Normalization helper to map any variation to the official 10 AUTOMATIQA_MODULES names
  const normalizeModuleName = (feat: string): string => {
    if (!feat) return 'AI Test Cases generation';
    const lower = feat.toLowerCase().trim();
    if (lower.includes('mobile') || lower.includes('appium')) {
      return 'Automation - Record and play - Mobile app';
    }
    if (lower.includes('test case') || lower.includes('test cases') || lower.includes('generatetestcases') || lower.includes('case')) {
      return 'AI Test Cases generation';
    }
    if (lower.includes('user stor')) {
      return 'AI User stories generation';
    }
    if (lower.includes('scenario')) {
      return 'AI Test Scenario generation';
    }
    if (lower.includes('script generator') || lower.includes('generatescript') || lower.includes('generateautomationscript')) {
      return 'Automation - script generator';
    }
    if (lower.includes('web app') && !lower.includes('mobile')) {
      return 'Automation - Record and play - Web app';
    }
    if (lower.includes('ui testing') || lower.includes('figma') || lower.includes('visual')) {
      return 'UI testing';
    }
    if (lower.includes('api testing') || lower.includes('apisuit')) {
      return 'API testing';
    }
    if (lower.includes('api performance') || lower.includes('jmeter')) {
      return 'API performance testing';
    }
    if (lower.includes('web performance') || lower.includes('lighthouse')) {
      return 'Web performance testing';
    }
    const matched = AUTOMATIQA_MODULES.find(m => m.name.toLowerCase() === lower);
    return matched ? matched.name : feat;
  };

  // Summary Metrics calculated strictly from scoped logs
  const summaryMetrics = useMemo(() => {
    let totalLifetimeCredits = 0;
    let totalGenerations = scopedLogs.length;
    let cachedGenerationsCount = 0;

    const moduleDistribution: Record<string, { count: number; credits: number; items: number }> = {};
    const userDistribution: Record<string, { count: number; credits: number; email: string; displayName?: string }> = {};

    scopedLogs.forEach(log => {
      const credits = log.creditsConsumed ?? calculateCreditsConsumed(log.feature, log.itemsGenerated || 1, log.cached);
      totalLifetimeCredits += credits;
      if (log.cached) cachedGenerationsCount++;

      // Normalized module breakdown
      const normalizedMod = normalizeModuleName(log.feature);
      if (!moduleDistribution[normalizedMod]) {
        moduleDistribution[normalizedMod] = { count: 0, credits: 0, items: 0 };
      }
      moduleDistribution[normalizedMod].count++;
      moduleDistribution[normalizedMod].credits += credits;
      moduleDistribution[normalizedMod].items += (log.itemsGenerated || 1);

      // User breakdown (lifetime cumulative across all scoped logs)
      const userKey = log.user || 'Unknown User';
      const userEmail = (log.userEmail || `${userKey.toLowerCase().replace(/\s+/g, '')}@qaoncloud.com`).toLowerCase().trim();
      if (!userDistribution[userEmail]) {
        userDistribution[userEmail] = { count: 0, credits: 0, email: userEmail, displayName: userKey };
      }
      userDistribution[userEmail].count++;
      userDistribution[userEmail].credits += credits;
    });

    return {
      totalCreditsPool: TOTAL_CREDIT_POOL,
      totalLifetimeCredits,
      totalGenerations,
      cachedGenerationsCount,
      moduleDistribution,
      userDistribution
    };
  }, [scopedLogs]);

  // User Account Credit Allocations & Alert Thresholds list, strictly calculated via getUserCreditCycleDetails
  // Enforces 1,000 credit cap per cycle and cleanly isolates historical cumulative usage.
  const userAccountRows = useMemo(() => {
    let targetMembers = scopedMembers;
    if (selectedMember !== 'All') {
      targetMembers = targetMembers.filter(m => m.email.toLowerCase().trim() === selectedMember.toLowerCase().trim());
      if (targetMembers.length === 0 && selectedMember) {
        targetMembers = [{ name: selectedMember.split('@')[0], email: selectedMember }];
      }
    }

    const memberMap = new Map<string, {
      name: string;
      email: string;
      allocated: number;
      used: number;
      actualCycleRaw: number;
      remaining: number;
      pct: number;
      lifetimeUsed: number;
      count: number;
      currentCycleCount: number;
      status: string;
      statusBadgeClass: string;
      isGated: boolean;
    }>();

    const processMember = (name: string, email: string) => {
      const emailLower = email.toLowerCase().trim();
      if (memberMap.has(emailLower)) return;

      const cycle = getUserCreditCycleDetails(emailLower, logs);
      const allocated = cycle.allocatedCredits || TOTAL_CREDIT_POOL; // Strictly 1,000
      const used = Math.min(cycle.consumedCredits, allocated); // STRICTLY CAPPED AT 1,000 (never 4,717, 1,500, etc.)
      const remaining = Math.max(0, allocated - used);
      const pct = Math.min(100, Math.round((used / allocated) * 100));

      memberMap.set(emailLower, {
        name: name || cycle.userName || emailLower.split('@')[0],
        email: emailLower,
        allocated,
        used,
        actualCycleRaw: cycle.actualCurrentCycleRaw,
        remaining,
        pct,
        lifetimeUsed: cycle.historicalTotalCredits, // Preserved separately as Historical/Cumulative
        count: cycle.lifetimeGenerationsCount,
        currentCycleCount: cycle.currentCycleGenerationsCount,
        status: cycle.status,
        statusBadgeClass: cycle.statusBadgeClass,
        isGated: cycle.isGated
      });
    };

    targetMembers.forEach(m => processMember(m.name, m.email));

    if (isSuperAdmin && selectedProject === 'All' && selectedMember === 'All') {
      Object.values(summaryMetrics.userDistribution).forEach(stat => {
        processMember(stat.displayName || stat.email.split('@')[0], stat.email);
      });
    }

    return Array.from(memberMap.values());
  }, [isSuperAdmin, scopedMembers, selectedMember, selectedProject, summaryMetrics.userDistribution, logs]);

  // Filter subscription requests according to authorized members & accessible projects
  const visibleSubscriptionRequests = useMemo(() => {
    if (isSuperAdmin) return subscriptionRequests;
    const targetProjName = (adminParticularProject?.name || '').toLowerCase().trim();
    const targetProjId = (adminParticularProject?.id || '').toLowerCase().trim();
    return subscriptionRequests.filter(r => {
      const pIdLower = (r.projectId || '').toLowerCase().trim();
      const pNameLower = (r.projectName || '').toLowerCase().trim();
      return (targetProjId && pIdLower === targetProjId) || (targetProjName && pNameLower === targetProjName);
    });
  }, [isSuperAdmin, subscriptionRequests, adminParticularProject]);

  // Current user's credit status
  const currentUserEmail = currentUser?.email || 'sowbarnya@qaoncloud.com';
  const currentUserCreditSummary = useMemo(() => {
    return getUserCreditSummary(currentUserEmail);
  }, [currentUserEmail, logs]);

  // Active Project for Plan-based calculation
  const currentProjectName = useMemo(() => {
    if (!isSuperAdmin && adminParticularProject?.name) {
      return adminParticularProject.name;
    }
    if (selectedProject && selectedProject !== 'All' && selectedProject !== '27/07') {
      const match = projects.find(p => p.name === selectedProject || p.id === selectedProject) ||
                    accessibleProjects.find(p => p.name === selectedProject || p.id === selectedProject);
      if (match?.name) return match.name;
      return selectedProject;
    }
    if (activeProject?.name && activeProject.name !== '27/07') {
      return activeProject.name;
    }
    const storedName = typeof window !== 'undefined'
      ? (localStorage.getItem('automatiqa_active_project_name') || (window as any).__automatiqa_active_project_name)
      : null;
    if (storedName && storedName !== '27/07') {
      return storedName;
    }
    const validAcc = accessibleProjects.find(p => p.name && p.name !== '27/07');
    if (validAcc?.name) return validAcc.name;
    const validProj = projects.find(p => p.name && p.name !== '27/07');
    if (validProj?.name) return validProj.name;
    return 'Project - Pradee';
  }, [isSuperAdmin, adminParticularProject, selectedProject, activeProject, accessibleProjects, projects]);

  const currentProjectObj = useMemo(() => {
    return projects.find(p => p.name === currentProjectName || p.id === currentProjectName) ||
      accessibleProjects.find(p => p.name === currentProjectName || p.id === currentProjectName);
  }, [projects, accessibleProjects, currentProjectName]);

  const currentProjectId = useMemo(() => {
    if (currentProjectObj?.id) return currentProjectObj.id;
    return `proj-${currentProjectName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }, [currentProjectObj, currentProjectName]);

  // Project credit summary adhering strictly to:
  // - Project-level pool (shared across all users in that project)
  // - Trial Plan (200 credits, 7 days) or Paid Plan (1,000 credits, 30 days)
  // - Hard limits: Used Credits = MIN(actual current-cycle, plan limit), Remaining = MAX(plan limit - used, 0)
  // - Preserves historical lifetime total separately
  const projectCreditSummary = useMemo(() => {
    return getProjectCreditSummary(currentProjectId, currentProjectName, logs);
  }, [currentProjectId, currentProjectName, logs, projectPlansVersion]);

  // Action type breakdown for current scope (strictly capped at project's current cycle used credits)
  const actionTypeBreakdown = useMemo(() => {
    let analysisCredits = 0;
    let analysisCount = 0;
    let exportCredits = 0;
    let exportCount = 0;

    scopedLogs.forEach(l => {
      const info = getActionTypeInfo(l);
      const cost = l.creditsConsumed ?? calculateCreditsConsumed(l.feature, l.itemsGenerated || 1, l.cached, info.isExport ? 'export' : 'analysis');
      if (info.isExport) {
        exportCredits += cost;
        exportCount++;
      } else {
        analysisCredits += cost;
        analysisCount++;
      }
    });

    const totalRaw = analysisCredits + exportCredits;
    // Strictly cap the displayed action breakdown at the project's current cycle used credits (200 for Trial)
    const effectiveTotal = Math.min(totalRaw, projectCreditSummary.usedCredits);

    let displayAnalysisCredits = analysisCredits;
    let displayExportCredits = exportCredits;
    if (totalRaw > effectiveTotal && totalRaw > 0) {
      displayAnalysisCredits = Math.round((analysisCredits / totalRaw) * effectiveTotal);
      displayExportCredits = Math.max(0, effectiveTotal - displayAnalysisCredits);
    }

    const analysisPercent = effectiveTotal > 0 ? Math.round((displayAnalysisCredits / effectiveTotal) * 100) : 0;
    const exportPercent = effectiveTotal > 0 ? Math.round((displayExportCredits / effectiveTotal) * 100) : 0;

    return {
      analysisCredits: displayAnalysisCredits,
      analysisCount,
      analysisPercent,
      exportCredits: displayExportCredits,
      exportCount,
      exportPercent,
      totalCredits: effectiveTotal,
      rawTotalCredits: totalRaw
    };
  }, [scopedLogs, projectCreditSummary.usedCredits]);

  // All project summaries for Project Plan Management across accessible projects
  const allProjectSummaries = useMemo(() => {
    const targetProjects = isSuperAdmin
      ? (accessibleProjects.length > 0 ? accessibleProjects : (projects.length > 0 ? projects : [{ id: 'proj-1', name: 'Global Retail Banking App' } as any]))
      : (adminParticularProject ? [adminParticularProject] : accessibleProjects);
    return targetProjects.map(proj => getProjectCreditSummary(proj.id, proj.name, logs));
  }, [isSuperAdmin, accessibleProjects, projects, adminParticularProject, logs, projectPlansVersion]);

  // Filter pending subscription requests (excluding requests whose projects are already active/non-gated)
  const pendingSubscriptionRequests = useMemo(() => {
    return visibleSubscriptionRequests.filter(r => {
      const isPendingStatus = r.status === 'PENDING' || r.status === 'pending';
      if (!isPendingStatus) return false;
      const rId = (r.projectId || '').toLowerCase().trim();
      const rName = (r.projectName || '').toLowerCase().trim();
      const matchingProj = allProjectSummaries.find(p => 
        (p.projectId && p.projectId.toLowerCase().trim() === rId) ||
        (p.projectName && p.projectName.toLowerCase().trim() === rName) ||
        (rId && p.projectName && p.projectName.toLowerCase().trim() === rId) ||
        (rName && p.projectId && p.projectId.toLowerCase().trim() === rName)
      );
      if (matchingProj && !matchingProj.isGated && matchingProj.remainingCredits > 0) {
        return false;
      }
      return true;
    });
  }, [visibleSubscriptionRequests, allProjectSummaries]);

  // Check if current project has a pending subscription request waiting for Super Admin approval
  const projectPendingSubscription = useMemo(() => {
    if (!projectCreditSummary.isGated) return undefined;
    const pIdLower = (currentProjectId || '').toLowerCase().trim();
    const pNameLower = (currentProjectName || '').toLowerCase().trim();
    return subscriptionRequests.find(r => {
      const rId = (r.projectId || '').toLowerCase().trim();
      const rName = (r.projectName || '').toLowerCase().trim();
      const isMatch = (pIdLower && rId === pIdLower) || (pNameLower && rName === pNameLower);
      return isMatch && (r.status === 'PENDING' || r.status === 'pending');
    });
  }, [subscriptionRequests, currentProjectId, currentProjectName, projectCreditSummary]);

  const handleRenewProjectPlan = async (projectId: string, projName: string) => {
    if (!isSuperAdmin && !isAdmin) {
      toast.error("Unauthorized: Only Admins and Super Admins can renew project credit cycles.");
      setActionSuccessMessage("Unauthorized: Only Admins and Super Admins can renew project credit cycles.");
      return;
    }
    setIsUpdatingPlan(true);
    try {
      const updated = await renewProjectPlanCycle(projectId, currentUser.email || 'automatiqa@qaoncloud.com', projName);
      toast.success(`Successfully renewed credit cycle for "${projName}"! Reset to 0 used credits; fresh allocation of ${updated.allocatedCredits} credits granted.`);
      setActionSuccessMessage(`Successfully renewed credit cycle for "${projName}". Reset to 0 used credits; fresh allocation of ${updated.allocatedCredits} credits granted.`);
      setLogs(getTokenLogs());
      setValidityInfo(getBasicPlanValidity());
      setProjectPlansVersion(v => v + 1);
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err: any) {
      console.error("Failed to renew project plan:", err);
      toast.error(`Failed to renew project plan: ${err?.message || 'Error occurred'}`);
      setActionSuccessMessage(`Failed to renew project plan: ${err?.message || 'Error occurred'}`);
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  const handleSwitchProjectPlan = async (projectId: string, projName: string, newPlanType: PlanType) => {
    if (!isSuperAdmin && !isAdmin) {
      toast.error("Unauthorized: Only Admins and Super Admins can switch project plans.");
      setActionSuccessMessage("Unauthorized: Only Admins and Super Admins can switch project plans.");
      return;
    }

    // Check if plan cannot change in between till credit limit is exceeded or validity has expired
    const currentSummary = getProjectCreditSummary(projectId, projName);
    const isExceeded = currentSummary.usedCredits >= currentSummary.totalPool || currentSummary.remainingCredits <= 0;
    const isExpired = currentSummary.isExpired;
    if (!isExceeded && !isExpired) {
      const warningMsg = `⚠️ Plan for project "${projName}" is locked and cannot be changed while credits remain active (${currentSummary.usedCredits}/${currentSummary.totalPool} used). You can renew or change the plan once the credit limit is exceeded or validity has expired.`;
      toast.warning(warningMsg);
      setActionSuccessMessage(warningMsg);
      setTimeout(() => setActionSuccessMessage(null), 7000);
      return;
    }

    setIsUpdatingPlan(true);
    try {
      const updated = await switchProjectPlan(projectId, newPlanType, currentUser.email || 'automatiqa@qaoncloud.com', projName);
      toast.success(`Project "${projName}" switched to ${newPlanType} Plan (${newPlanType === 'Trial' ? '100 Credits / 7 Days' : '1,000 Credits / 30 Days'}). Fresh cycle started with 0 used credits.`);
      setActionSuccessMessage(`Project "${projName}" switched to ${newPlanType} Plan (${newPlanType === 'Trial' ? '100 Credits / 7 Days' : '1,000 Credits / 30 Days'}). Fresh cycle started with 0 used credits.`);
      setLogs(getTokenLogs());
      setValidityInfo(getBasicPlanValidity());
      setProjectPlansVersion(v => v + 1);
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err: any) {
      console.error("Failed to switch project plan:", err);
      toast.error(`Failed to switch project plan: ${err?.message || 'Error occurred'}`);
      setActionSuccessMessage(`Failed to switch project plan: ${err?.message || 'Error occurred'}`);
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  // Super Admin re-enablement handler for projects
  const handleSuperAdminReEnableProject = async (pId: string, pName: string, reqId?: string) => {
    setIsUpdatingPlan(true);
    try {
      await reEnableProjectPlanBySuperAdmin(
        pId,
        pName,
        currentUser.email || 'automatiqa@qaoncloud.com',
        'Paid',
        reqId
      );
      setActionSuccessMessage(`Super Admin approved & re-enabled "${pName}"! New Paid Plan (1,000 Credits) has been added and cycle reset.`);
      setSubscriptionRequests(getLocalSubscriptionRequests());
      setProjectPlansVersion(v => v + 1);
      setLogs(getTokenLogs());
      setValidityInfo(getBasicPlanValidity());
      setTimeout(() => setActionSuccessMessage(null), 7000);
    } catch (err: any) {
      console.error("Failed to re-enable project plan:", err);
      setActionSuccessMessage(`Failed to re-enable project plan: ${err?.message || 'Error'}`);
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  // User request project subscription handler
  const handleRequestProjectSubscription = async (pId: string, pName: string, customNotes?: string) => {
    setIsSubscribingProject(true);
    try {
      const email = currentUser?.email || 'sowbarnya@qaoncloud.com';
      const name = currentUser?.name || email.split('@')[0];
      await createSubscriptionRequest(
        email,
        name,
        projectCreditSummary.usedCredits,
        customNotes || `Credits exhausted for project "${pName}" (${projectCreditSummary.usedCredits}/${projectCreditSummary.totalPool} pts used). User requested Super Admin re-enablement.`,
        {
          projectId: pId,
          projectName: pName,
          planRequested: 'Paid',
          currentPlan: projectCreditSummary.planType,
          creditsRequested: 1000
        }
      );
      setActionSuccessMessage(`Subscription request for "${pName}" submitted! Super Admin has been notified. New plan/points will be added once Super Admin approves and re-enables.`);
      setSubscriptionRequests(getLocalSubscriptionRequests());
      setIsSubscribeModalOpen(false);
      setSubscribeNotes('');
      setTimeout(() => setActionSuccessMessage(null), 8000);
    } catch (err: any) {
      console.error("Failed to submit project subscription request:", err);
      setActionSuccessMessage(`Failed to submit request: ${err?.message || 'Error occurred'}`);
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } finally {
      setIsSubscribingProject(false);
    }
  };

  // Active Display Metrics for the Overview Hero Banner and 5 Metric Cards
  // Adheres strictly to project-level pooling and plan limits (200 or 1,000)
  const activeDisplayMetrics = useMemo(() => {
    if (selectedMember !== 'All') {
      const found = projectCreditSummary.memberBreakdown.find(
        m => m.userEmail.toLowerCase().trim() === selectedMember.toLowerCase().trim()
      );
      if (found) {
        return {
          allocated: projectCreditSummary.totalPool,
          used: Math.min(found.consumedCredits, projectCreditSummary.totalPool),
          remaining: projectCreditSummary.remainingCredits,
          pct: Math.min(100, projectCreditSummary.usedCredits > 0 ? Math.round((Math.min(found.consumedCredits, projectCreditSummary.totalPool) / projectCreditSummary.usedCredits) * 100) : 0),
          lifetime: found.lifetimeConsumed,
          isGated: projectCreditSummary.isGated,
          status: projectCreditSummary.isGated 
            ? (projectCreditSummary.isExpired ? 'Plan Expired' : 'Credits Exhausted') 
            : `${found.percentageOfProjectUsed}% Contributed`,
          targetLabel: `${found.userName} (${found.userEmail})`,
          generations: found.generationsCount
        };
      }
    }

    // Default: Project-Level Allocation
    return {
      allocated: projectCreditSummary.totalPool,
      used: projectCreditSummary.usedCredits, // Strictly capped at totalPool (200 or 1,000)
      remaining: projectCreditSummary.remainingCredits,
      pct: projectCreditSummary.percentageUsed,
      lifetime: projectCreditSummary.historicalLifetimeUsed,
      isGated: projectCreditSummary.isGated,
      isExpired: projectCreditSummary.isExpired,
      status: projectCreditSummary.isGated 
        ? (projectCreditSummary.isExpired ? 'Plan Validity Expired' : '100% Credit Limit Reached') 
        : projectCreditSummary.percentageUsed >= 75 ? '75% Warning' : projectCreditSummary.percentageUsed >= 50 ? '50% Milestone' : 'Active Normal',
      targetLabel: `${projectCreditSummary.projectName} (${projectCreditSummary.planType} Plan Shared Credits)`,
      generations: scopedLogs.length
    };
  }, [selectedMember, projectCreditSummary, scopedLogs]);

  const isQuotaExceeded = projectCreditSummary.isGated;

  // Sorting helper
  const handleSort = (field: 'timestamp' | 'creditsConsumed' | 'itemsGenerated') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Selection helpers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedLogIds(filteredLogs.map(l => l.id));
    } else {
      setSelectedLogIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedLogIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Delete Handlers
  const handleDeleteSelected = async () => {
    if (selectedLogIds.length === 0) return;
    setIsDeleting(true);
    try {
      await deleteTokenLogs(selectedLogIds);
      setSelectedLogIds([]);
      setDeleteConfirmModal(null);
      refreshValidity();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async (id: string) => {
    setIsDeleting(true);
    try {
      await deleteTokenLog(id);
      setSelectedLogIds(prev => prev.filter(x => x !== id));
      setDeleteConfirmModal(null);
      refreshValidity();
    } finally {
      setIsDeleting(false);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      'Transaction ID',
      'Date (IST)',
      'Workspace',
      'Project',
      'User Name',
      'User Email',
      'User Story ID',
      'AutomatiQA Module',
      'Input Modality',
      'Modality Details',
      'Output Type',
      'Items Generated',
      'Credits Consumed',
      'Generation Tier',
      'Context Cached'
    ];

    const rows = filteredLogs.map(log => {
      const credits = log.creditsConsumed ?? calculateCreditsConsumed(log.feature, log.itemsGenerated || 1, log.cached);
      const tierInfo = log.tier ? { tier: log.tier } : calculateInputTier(log);

      return [
        `"${log.id}"`,
        `"${log.date || formatToIST(log.timestamp)}"`,
        `"${log.workspace || 'AutomatiQA Global'}"`,
        `"${log.project || 'Default Project'}"`,
        `"${log.user || 'Unknown'}"`,
        `"${log.userEmail || ''}"`,
        `"${log.userStoryId || 'US-GENERAL'}"`,
        `"${log.feature}"`,
        `"${log.inputModality || 'Text'}"`,
        `"${(log.inputModalityDetails || '').replace(/"/g, '""')}"`,
        `"${(log.outputType || '').replace(/"/g, '""')}"`,
        log.itemsGenerated || 1,
        credits,
        `"${tierInfo.tier}"`,
        log.cached ? 'Yes' : 'No'
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `automatiqa_credit_consumption_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Simulation Submission
  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const credits = calculateCreditsConsumed(simFeature, simItemsGenerated, simCached);
    const tierInfo = calculateInputTier(simItemsGenerated);

    const matchedProject = accessibleProjects.find(p => p.name === simProject) || projects.find(p => p.name === simProject);

    const newLog: Omit<TokenLog, 'id'> = {
      timestamp: Date.now(),
      date: formatToIST(Date.now()),
      user: currentUser?.name || 'Sowbarnya S',
      userEmail: currentUser?.email || 'sowbarnya@qaoncloud.com',
      project: simProject,
      projectId: matchedProject?.id,
      userStoryId: simUserStoryId,
      feature: simFeature,
      model: 'AutomatiQA AI Engine',
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      responseTimeSeconds: 1.2,
      cached: simCached,
      inputModality: simModality,
      inputModalityDetails: simModalityDetails,
      outputType: `${simItemsGenerated} ${simFeature} Artifacts`,
      itemsGenerated: simItemsGenerated,
      tier: tierInfo.tier,
      creditsConsumed: credits,
      workspace: 'AutomatiQA Global Workspace'
    };

    await addTokenLog(newLog);
    setIsSimulateModalOpen(false);
    refreshValidity();
  };

  // Super Admin Action Handlers for Subscriptions
  const handleApproveSubscription = async (requestId: string, userEmail: string, userName: string) => {
    setIsApproving(requestId);
    try {
      const req = subscriptionRequests.find(r => r.id === requestId);
      if (req?.projectId) {
        await reEnableProjectPlanBySuperAdmin(
          req.projectId,
          req.projectName,
          currentUser.email || 'automatiqa@qaoncloud.com',
          (req.planRequested as PlanType) || 'Paid',
          requestId
        );
        setActionSuccessMessage(`Super Admin approved & re-enabled project "${req.projectName || req.projectId}" with 1,000 Credits and 30 Days validity!`);
      } else {
        await reEnableUserSubscription(
          requestId,
          userEmail,
          userName,
          currentUser.email || 'automatiqa@qaoncloud.com',
          1000,
          30
        );
        setActionSuccessMessage(`Successfully re-enabled subscription for ${userName} (${userEmail}) with 1,000 Credits and 30 Days validity.`);
      }
      setSubscriptionRequests(getLocalSubscriptionRequests());
      setProjectPlansVersion(v => v + 1);
      setLogs(getTokenLogs());
      setValidityInfo(getBasicPlanValidity());
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err: any) {
      console.error("Failed to approve subscription:", err);
    } finally {
      setIsApproving(null);
    }
  };

  const handleDirectGrant = async (userEmail: string, userName: string) => {
    setIsApproving(userEmail);
    try {
      await grantDirectSubscription(
        userEmail,
        userName,
        currentUser.email || 'automatiqa@qaoncloud.com',
        1000,
        30
      );
      setActionSuccessMessage(`Directly granted and re-enabled 1,000 Credits & 30-day validity to ${userName} (${userEmail}).`);
      setSubscriptionRequests(getLocalSubscriptionRequests());
      setLogs(getTokenLogs());
      setValidityInfo(getBasicPlanValidity());
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err: any) {
      console.error("Failed to grant subscription:", err);
    } finally {
      setIsApproving(null);
    }
  };

  // Guard: if user is not Super Admin or Admin (e.g. Team Member), Credit Consumption page is not accessible
  if (!isSuperAdmin && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center animate-in fade-in duration-300">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl space-y-6">
          <div className="mx-auto w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shadow-sm">
            <ShieldAlert size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Access Denied</h2>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Access Denied: You do not have permission to access the Credit Consumption page. Only administrators and system-wide super admins are permitted to view and manage billing credit allocations.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-16">
      {/* HEADER HERO BANNER */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden border border-slate-800 shadow-xl">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-gradient-to-br from-[#00E1C5]/20 to-teal-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute right-32 -bottom-20 w-60 h-60 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-black tracking-widest uppercase text-[#00E1C5] border border-white/10">
              <Award size={14} className="text-[#00E1C5]" />
              AutomatiQA AI Credit Allocation & Usage Analytics
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
              Credit Consumption & Analytics
            </h1>
            <p className="text-sm text-slate-300 font-medium max-w-3xl leading-relaxed">
              Real-time plan-based credit allocation and consumption tracking for all 10 AI generation modules in AutomatiQA. Supporting both Trial Plan (200 credits, 7-day validity) and Paid Plan (1,000 credits, 30-day validity) with hard limits, zero over-consumption, and automatic cycle renewal.
            </p>

            {/* Quick Plan Validity Sub-Badge */}
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700 font-bold text-slate-200">
                <Crown size={14} className="text-amber-400" />
                <span>Plan: <strong className="text-white">{projectCreditSummary.planType} Plan</strong> ({projectCreditSummary.totalPool} pts)</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700 font-bold text-slate-200">
                <Calendar size={14} className="text-[#00E1C5]" />
                <span>Validity: <strong className="text-white">{projectCreditSummary.daysRemaining} Days Left</strong> (Expires {projectCreditSummary.cycleEndDateFormatted})</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700 font-bold text-slate-200">
                <Coins size={14} className="text-amber-400" />
                <span>Project Credits: <strong className="text-[#00E1C5] font-mono">{projectCreditSummary.remainingCredits}</strong> / {projectCreditSummary.totalPool}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 rounded-xl border border-slate-700 font-bold text-slate-200">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Non-AI Features: <strong className="text-emerald-400">100% Free & Unlimited</strong></span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
            <button
              onClick={() => setActiveTab('subscription_management')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                activeTab === 'subscription_management'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
              }`}
            >
              <Crown size={14} className="text-amber-400" /> Subscription Requests
              {pendingSubscriptionRequests.length > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-black">
                  {pendingSubscriptionRequests.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsSimulateModalOpen(true)}
              className="flex items-center gap-2 bg-[#00E1C5] text-slate-950 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-[#00cbb2] shadow-lg shadow-[#00E1C5]/20 active:scale-95 transition-all"
            >
              <Plus size={16} /> Simulate Usage
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border border-white/10 active:scale-95 transition-all"
              title="Export all credit records as CSV"
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* EMPTY STATE FOR ADMIN WITH NO ASSIGNED PROJECTS */}
      {!isSuperAdmin && accessibleProjects.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] p-12 border border-slate-200/80 shadow-sm text-center space-y-4">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
            <AlertTriangle size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-900">No projects or credit consumption data available.</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed font-medium">
            You do not currently have any assigned or owned projects. Credit consumption records and member usage statistics are restricted strictly to your authorized projects.
          </p>
          <div className="pt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold">
              Logged in as: {currentUser.name || currentUser.email} ({currentUser.role || 'Admin'})
            </span>
          </div>
        </div>
      ) : (
        <>
          {/* SCOPE & FILTERING BAR: ADMIN/SUPER ADMIN FILTERING */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Filter size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-900">
                    Credits Consumption Scope
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    isSuperAdmin ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  }`}>
                    {isSuperAdmin ? 'Super Admin Mode' : 'Admin: Project View & Request Mode'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium">
                  {isSuperAdmin 
                    ? 'Full System Access: Select any project or member to view and scope credit consumption.' 
                    : `Viewing credit details exclusively for project "${adminParticularProject?.name || currentProjectName}". Admin permissions allow viewing metrics and submitting re-enablement/subscription requests.`}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Project Filter */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Project:</span>
                {isSuperAdmin ? (
                  <select
                    id="project-filter-select"
                    value={selectedProject}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedProject(val);
                      if (val !== 'All') {
                        const matchingProj = projects.find(p => p.name === val || p.id === val) || accessibleProjects.find(p => p.name === val || p.id === val);
                        if (matchingProj) {
                          if (typeof onSelectProject === 'function') {
                            onSelectProject(matchingProj.id);
                          } else {
                            try {
                              localStorage.setItem('automatiqa_selected_project_id', matchingProj.id);
                              window.dispatchEvent(new CustomEvent('project-changed', { detail: matchingProj }));
                            } catch (err) {}
                          }
                        }
                      }
                    }}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500/20 max-w-[210px] cursor-pointer"
                  >
                    {uniqueProjects.map(pName => (
                      <option key={pName} value={pName}>
                        {pName === 'All' ? 'All Projects (System-wide)' : pName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-black text-indigo-900 flex items-center gap-1.5 shadow-xs">
                    <Layers size={13} className="text-indigo-600" />
                    <span>{adminParticularProject?.name || currentProjectName}</span>
                  </div>
                )}
              </div>

              {/* Plan Selector / Display */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Plan:</span>
                {isSuperAdmin ? (
                  <div className="flex items-center gap-1.5">
                    <select
                      id="plan-scope-select"
                      value={projectCreditSummary.planType}
                      disabled={isUpdatingPlan}
                      onChange={(e) => {
                        const newPlan = e.target.value as PlanType;
                        if (newPlan !== projectCreditSummary.planType) {
                          handleSwitchProjectPlan(projectCreditSummary.projectId, projectCreditSummary.projectName, newPlan);
                        }
                      }}
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500/20 max-w-[220px] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Choose active plan for this project (Super Admin)"
                    >
                      <option value="Trial">Trial Plan (100 pts / 7d)</option>
                      <option value="Paid">Paid Plan (1,000 pts / 30d)</option>
                    </select>
                  </div>
                ) : (
                  <span className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Crown size={12} className={projectCreditSummary.planType === 'Paid' ? "text-purple-600" : "text-indigo-600"} />
                    {projectCreditSummary.planType} Plan ({projectCreditSummary.totalPool.toLocaleString()} pts)
                  </span>
                )}
              </div>

              {/* Member Filter */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Member:</label>
                <select
                  value={selectedMember}
                  onChange={(e) => setSelectedMember(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500/20 max-w-[210px]"
                >
                  <option value="All">
                    {selectedProject === 'All'
                      ? (isSuperAdmin ? 'All Members (System-wide)' : `All Project Members (${scopedMembers.length})`)
                      : `All Members of ${selectedProject} (${scopedMembers.length})`}
                  </option>
                  {uniqueMembers.filter(m => m !== 'All').map(m => {
                    const label = getMemberLabel(m);
                    return (
                      <option key={m} value={m}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {(selectedProject !== 'All' || selectedMember !== 'All') && (
                <button
                  onClick={() => {
                    setSelectedProject('All');
                    setSelectedMember('All');
                  }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors whitespace-nowrap"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          {/* ========================================================================= */}
          {/* CURRENT SELECTED PROJECT REAL-TIME CREDIT ALERT BANNER                    */}
          {/* Displays credit alert for the currently selected project with consumption */}
          {/* metrics, threshold indicators, and Super Admin approval-based subscribe   */}
          {/* ========================================================================= */}
          <div
            id="current-project-credit-alert"
            className={`rounded-2xl p-5 border transition-all shadow-sm ${
              projectCreditSummary.isGated || projectCreditSummary.percentageUsed >= 100
                ? 'bg-gradient-to-r from-rose-50 via-rose-100/50 to-amber-50/40 border-rose-300 ring-2 ring-rose-500/20'
                : projectCreditSummary.percentageUsed >= 75
                ? 'bg-gradient-to-r from-amber-50 via-orange-50/50 to-yellow-50/40 border-amber-300 ring-2 ring-amber-500/20'
                : projectCreditSummary.percentageUsed >= 50
                ? 'bg-gradient-to-r from-indigo-50/80 via-blue-50/50 to-slate-50 border-indigo-200'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Left Column: Icon + Project Alert Title + Subtitle */}
              <div className="flex items-start sm:items-center gap-3.5">
                <div className={`p-3 rounded-2xl shrink-0 ${
                  projectCreditSummary.isGated || projectCreditSummary.percentageUsed >= 100
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20 animate-pulse'
                    : projectCreditSummary.percentageUsed >= 75
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                    : projectCreditSummary.percentageUsed >= 50
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#00E1C5]/10 text-teal-800'
                }`}>
                  {projectCreditSummary.isGated || projectCreditSummary.percentageUsed >= 100 ? (
                    <AlertTriangle size={22} />
                  ) : projectCreditSummary.percentageUsed >= 75 ? (
                    <ShieldAlert size={22} />
                  ) : (
                    <Coins size={22} />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      CREDIT ALERT: <span className="text-indigo-600 font-extrabold">{currentProjectName}</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-slate-900 text-white">
                      {projectCreditSummary.planType} Plan ({projectCreditSummary.totalPool} Pts)
                    </span>
                    {projectCreditSummary.isGated || projectCreditSummary.percentageUsed >= 100 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-rose-600 text-white animate-pulse">
                        🚨 100% Credits Exhausted
                      </span>
                    ) : projectCreditSummary.percentageUsed >= 75 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-amber-500 text-white">
                        ⚠️ 75% Usage Warning
                      </span>
                    ) : projectCreditSummary.percentageUsed >= 50 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-indigo-100 text-indigo-800 border border-indigo-200">
                        ⚡ 50% Milestone Reached
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ✅ Plan Active
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 font-medium">
                    {projectCreditSummary.isGated || projectCreditSummary.percentageUsed >= 100 ? (
                      <span className="text-rose-900 font-semibold">
                        All <strong className="font-black">{projectCreditSummary.totalPool} credits</strong> for project <strong>"{currentProjectName}"</strong> are exhausted. Click <strong className="font-bold underline">Subscribe</strong> to request re-enablement from the Super Admin.
                      </span>
                    ) : projectCreditSummary.percentageUsed >= 75 ? (
                      <span className="text-amber-900 font-semibold">
                        High usage: <strong>{projectCreditSummary.usedCredits}</strong> of <strong>{projectCreditSummary.totalPool}</strong> credits consumed ({projectCreditSummary.percentageUsed}%). Only {projectCreditSummary.remainingCredits} credits remain.
                      </span>
                    ) : (
                      <span>
                        Project credit usage is at <strong>{projectCreditSummary.percentageUsed}%</strong> ({projectCreditSummary.usedCredits}/{projectCreditSummary.totalPool} pts). Valid until {projectCreditSummary.cycleEndDateFormatted}.
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Right Column: Key Metrics & Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                {/* Metrics Pill */}
                <div className="flex items-center gap-3 px-3.5 py-2 bg-white/90 border border-slate-200 rounded-xl shadow-xs">
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Consumed</p>
                    <p className="text-xs font-black font-mono text-slate-900">
                      {projectCreditSummary.usedCredits} <span className="text-slate-400 font-normal">/ {projectCreditSummary.totalPool} pts</span>
                    </p>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Remaining</p>
                    <p className={`text-xs font-black font-mono ${
                      projectCreditSummary.remainingCredits === 0 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {projectCreditSummary.remainingCredits} pts
                    </p>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cycle</p>
                    <p className="text-xs font-bold text-slate-700">
                      {projectCreditSummary.daysRemaining}d left
                    </p>
                  </div>
                </div>

                {/* Actions depending on state & role */}
                {projectPendingSubscription ? (
                  isSuperAdmin ? (
                    <button
                      id="superadmin-approve-project-alert-btn"
                      onClick={() => handleSuperAdminReEnableProject(currentProjectId, currentProjectName, projectPendingSubscription.id)}
                      disabled={isUpdatingPlan}
                      className="px-4 py-2 bg-[#00E1C5] hover:bg-[#00cbb2] text-slate-950 rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="Super Admin: Approve and re-enable this project plan with 1,000 credits"
                    >
                      <CheckCircle2 size={15} />
                      <span>{isUpdatingPlan ? 'Re-Enabling...' : 'Super Admin: Approve & Re-Enable (+1,000)'}</span>
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-black">
                      <Clock size={14} className="animate-spin text-amber-600" />
                      <span>Request Pending Super Admin Approval</span>
                    </div>
                  )
                ) : (
                  (projectCreditSummary.isGated || projectCreditSummary.percentageUsed >= 100) ? (
                    isSuperAdmin ? (
                      <div className="flex items-center gap-2">
                        <button
                          id="superadmin-reenable-direct-btn"
                          onClick={() => handleSuperAdminReEnableProject(currentProjectId, currentProjectName)}
                          disabled={isUpdatingPlan}
                          className="px-4 py-2 bg-[#00E1C5] hover:bg-[#00cbb2] text-slate-950 rounded-xl text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Crown size={15} />
                          <span>{isUpdatingPlan ? 'Re-Enabling...' : 'Super Admin: Re-Enable Plan (+1,000)'}</span>
                        </button>
                        <button
                          id="subscribe-project-modal-btn"
                          onClick={() => setIsSubscribeModalOpen(true)}
                          className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all"
                        >
                          Subscribe
                        </button>
                      </div>
                    ) : (
                      <button
                        id="subscribe-project-exhausted-btn"
                        onClick={() => setIsSubscribeModalOpen(true)}
                        className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/30 transition-all active:scale-95 flex items-center gap-1.5 animate-bounce cursor-pointer"
                        title="Send credit renewal request to Super Admin"
                      >
                        <Send size={15} />
                        <span>Send Renewal Request</span>
                      </button>
                    )
                  ) : (
                    <button
                      id="subscribe-project-early-btn"
                      onClick={() => setIsSubscribeModalOpen(true)}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      title={isSuperAdmin ? "Request plan upgrade or re-enablement" : "Send credit subscription or plan request to Super Admin"}
                    >
                      {isSuperAdmin ? (
                        <>
                          <Crown size={14} className="text-amber-400" />
                          <span>Subscribe</span>
                        </>
                      ) : (
                        <>
                          <Send size={14} className="text-[#00E1C5]" />
                          <span>Send Request</span>
                        </>
                      )}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Consumption Progress Bar for Current Project */}
            <div className="mt-3.5 pt-3 border-t border-slate-200/60">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mb-1.5">
                <span>{currentProjectName} Credit Usage: {projectCreditSummary.usedCredits} of {projectCreditSummary.totalPool} ({projectCreditSummary.percentageUsed}%)</span>
                <span>
                  {projectCreditSummary.isGated || projectCreditSummary.percentageUsed >= 100
                    ? '0 Credits Remaining • AI Modules Paused'
                    : `${projectCreditSummary.remainingCredits} Credits Available • Cycle ends ${projectCreditSummary.cycleEndDateFormatted}`}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    projectCreditSummary.isGated || projectCreditSummary.percentageUsed >= 100
                      ? 'bg-rose-600'
                      : projectCreditSummary.percentageUsed >= 75
                      ? 'bg-amber-500'
                      : projectCreditSummary.percentageUsed >= 50
                      ? 'bg-indigo-600'
                      : 'bg-[#00E1C5]'
                  }`}
                  style={{ width: `${Math.min(100, projectCreditSummary.percentageUsed)}%` }}
                />
              </div>

              {/* Informational Subtext for Super Admin approval requirement */}
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Info size={11} className="text-slate-400" />
                  When project credits are exhausted, click "Subscribe" in this alert. The Super Admin must approve and re-enable it before new points and plan are added.
                </span>
                {projectPendingSubscription && (
                  <span className="font-bold text-amber-700">
                    Pending request by {projectPendingSubscription.userName} on {projectPendingSubscription.requestedDateFormatted}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* NAVIGATION TABS */}
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit max-w-full overflow-x-auto">
            <button
              onClick={() => setActiveTab('credits_overview')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === 'credits_overview'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Award size={14} className={activeTab === 'credits_overview' ? 'text-[#00E1C5]' : 'text-slate-400'} />
              Overview & Module Credits
            </button>

            <button
              onClick={() => setActiveTab('subscription_management')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === 'subscription_management'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Crown size={14} className={activeTab === 'subscription_management' ? 'text-amber-400' : 'text-slate-400'} />
              Subscription Requests & Super Admin Controls
              {pendingSubscriptionRequests.length > 0 && (
                <span className="px-2 py-0.5 bg-rose-500 text-white rounded-full text-[10px] font-black animate-pulse">
                  {pendingSubscriptionRequests.length} Pending
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('consumption_table')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === 'consumption_table'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Coins size={14} className={activeTab === 'consumption_table' ? 'text-teal-400' : 'text-slate-400'} />
              Detailed Consumption Logs ({authorizedLogs.length})
            </button>

            <button
              onClick={() => setActiveTab('rate_card')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                activeTab === 'rate_card'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Zap size={14} className={activeTab === 'rate_card' ? 'text-amber-400' : 'text-slate-400'} />
              Module Credit Rate Card
            </button>
          </div>

      {/* TAB 1: OVERVIEW & MODULE CREDITS */}
      {activeTab === 'credits_overview' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* PLAN-BASED PROJECT HERO STATUS CARD */}
          <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 rounded-[2.5rem] p-8 text-white border border-indigo-800/40 shadow-2xl relative overflow-hidden">
            <div className="relative z-10 space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-indigo-900/60">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-gradient-to-tr from-[#00E1C5] to-teal-500 rounded-2xl flex items-center justify-center text-slate-950 shadow-lg font-black text-xl">
                    <Coins size={28} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                        projectCreditSummary.planType === 'Paid'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-400/30'
                          : 'bg-indigo-500/30 text-indigo-300 border-indigo-400/30'
                      }`}>
                        {projectCreditSummary.planType} Plan ({projectCreditSummary.totalPool} Credits / {projectCreditSummary.validityDays} Days)
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 border ${
                        projectCreditSummary.isGated
                          ? 'bg-rose-500/20 text-rose-300 border-rose-400/30'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                      }`}>
                        {projectCreditSummary.isGated ? (projectCreditSummary.isExpired ? 'Validity Expired' : 'Credits Exhausted') : <><CheckCircle2 size={10} /> Active Plan</>}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-full text-[10px] font-bold">
                        Project Level
                      </span>
                    </div>
                    <h2 className="text-2xl font-black text-white mt-1">
                      {projectCreditSummary.projectName}: {projectCreditSummary.totalPool.toLocaleString()} Credit Points
                    </h2>
                    <p className="text-xs text-slate-300 font-medium mt-0.5">
                      Shared across all project members. Validity ends when {projectCreditSummary.validityDays} days complete OR {projectCreditSummary.totalPool} credits are consumed.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Plan Dropdown Selector */}
                  <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-inner">
                    <Crown size={14} className="text-amber-400 shrink-0" />
                    <label htmlFor="plan-hero-select" className="text-[11px] font-black uppercase tracking-wider text-slate-300 shrink-0">
                      Plan:
                    </label>
                    <select
                      id="plan-hero-select"
                      value={projectCreditSummary.planType}
                      disabled={isUpdatingPlan}
                      onChange={(e) => {
                        const newPlan = e.target.value as PlanType;
                        if (newPlan !== projectCreditSummary.planType) {
                          handleSwitchProjectPlan(projectCreditSummary.projectId, projectCreditSummary.projectName, newPlan);
                        }
                      }}
                      className="bg-slate-900 text-white font-bold text-xs py-1.5 px-3 rounded-lg border border-slate-600 focus:border-[#00E1C5] focus:ring-1 focus:ring-[#00E1C5] focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Choose between Trial Plan and Paid Plan"
                    >
                      <option value="Trial">Trial Plan (100 Credits / 7 Days)</option>
                      <option value="Paid">Paid Plan (1,000 Credits / 30 Days)</option>
                    </select>
                  </div>

                  {/* Renew Cycle button */}
                  <button
                    id="renew-cycle-hero-btn"
                    onClick={() => {
                      handleRenewProjectPlan(projectCreditSummary.projectId, projectCreditSummary.projectName);
                    }}
                    disabled={isUpdatingPlan}
                    className="flex items-center gap-2 px-4 py-2 bg-[#00E1C5] hover:bg-[#00c4ab] text-slate-950 font-black rounded-xl text-xs transition-all shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer active:scale-95"
                    title="Renew credit cycle: Reset used credits to 0 and grant fresh credits"
                  >
                    <RefreshCw size={13} className={isUpdatingPlan ? "animate-spin" : ""} />
                    <span>RENEW CYCLE</span>
                  </button>
                </div>
              </div>

              {/* Quota Progress Bar & Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Total Credits</span>
                  <div className="text-2xl font-black text-white font-mono flex items-baseline gap-1">
                    {projectCreditSummary.totalPool.toLocaleString()} <span className="text-xs text-[#00E1C5] font-normal">pts</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Shared across all project users</span>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Credits Consumed</span>
                  <div className="text-2xl font-black text-amber-400 font-mono flex items-baseline gap-1">
                    {projectCreditSummary.usedCredits.toLocaleString()} <span className="text-xs text-amber-300 font-normal">pts ({projectCreditSummary.percentageUsed}%)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Current cycle (strictly capped at {projectCreditSummary.totalPool})</span>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Remaining Balance</span>
                  <div className="text-2xl font-black text-[#00E1C5] font-mono flex items-baseline gap-1">
                    {projectCreditSummary.remainingCredits.toLocaleString()} <span className="text-xs text-teal-300 font-normal">pts left</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Available for all project users</span>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 block">Plan Validity Countdown</span>
                  <div className="text-2xl font-black text-indigo-300 font-mono flex items-baseline gap-1">
                    {projectCreditSummary.daysRemaining} <span className="text-xs text-indigo-200 font-normal">of {projectCreditSummary.validityDays} Days</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">Valid until {projectCreditSummary.cycleEndDateFormatted}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-300">
                    {selectedMember !== 'All' ? `Credit Contribution: ${activeDisplayMetrics.targetLabel}` : `${projectCreditSummary.projectName} Project Credit Utilization`}
                  </span>
                  <span className={projectCreditSummary.percentageUsed >= 90 ? 'text-rose-400 font-black' : projectCreditSummary.percentageUsed >= 75 ? 'text-amber-400 font-black' : 'text-[#00E1C5] font-black'}>
                    {projectCreditSummary.percentageUsed}% Utilized ({projectCreditSummary.usedCredits} / {projectCreditSummary.totalPool} Credits)
                  </span>
                </div>
                <div className="w-full bg-slate-800/80 h-3 rounded-full overflow-hidden p-0.5 border border-slate-700">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ${
                      projectCreditSummary.percentageUsed >= 90 
                        ? 'bg-gradient-to-r from-amber-500 to-rose-500' 
                        : projectCreditSummary.percentageUsed >= 75 
                        ? 'bg-gradient-to-r from-teal-400 to-amber-400' 
                        : 'bg-gradient-to-r from-teal-400 to-[#00E1C5]'
                    }`}
                    style={{ width: `${Math.max(2, projectCreditSummary.percentageUsed)}%` }}
                  />
                </div>
              </div>

              {/* OVER-QUOTA / EXPIRED NOTICE BANNER */}
              {projectCreditSummary.isGated && (
                <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-start gap-4">
                  <AlertTriangle size={20} className="text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-rose-200">
                      {projectCreditSummary.isExpired 
                        ? "Plan validity expired. Please renew or upgrade your plan." 
                        : `Credit limit reached. All ${projectCreditSummary.totalPool} credits have been consumed for this project.`}
                    </h4>
                    <p className="text-xs text-rose-300 leading-relaxed font-medium">
                      All AI generation features are blocked for all users in project "{projectCreditSummary.projectName}". Super Admins/Admins can click "Renew / Start New Cycle" or "Switch Plan" above to re-enable AI features.
                      <strong className="text-white"> All manual test cases, manual executions, test script runs, record & play, and reports remain 100% functional and unlimited.</strong>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 5 OVERVIEW METRIC CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider">Total Credits</span>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Coins size={16} /></div>
              </div>
              <div>
                <p className="text-2xl font-black text-slate-900 font-mono">{projectCreditSummary.totalPool.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">{projectCreditSummary.planType} Plan Shared Credits</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider">Current Cycle Used</span>
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl"><Zap size={16} /></div>
              </div>
              <div>
                <p className="text-2xl font-black text-amber-600 font-mono">{projectCreditSummary.usedCredits.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">{projectCreditSummary.percentageUsed}% of limit (max {projectCreditSummary.totalPool})</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider">Remaining Balance</span>
                <div className="p-2 bg-teal-50 text-[#00a693] rounded-xl"><CheckCircle2 size={16} /></div>
              </div>
              <div>
                <p className="text-2xl font-black text-[#00a693] font-mono">{projectCreditSummary.remainingCredits.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Shared across all project users</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider">Historical Total Used</span>
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Layers size={16} /></div>
              </div>
              <div>
                <p className="text-2xl font-black text-purple-600 font-mono">{projectCreditSummary.historicalLifetimeUsed.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Lifetime cumulative usage</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider">Plan Validity</span>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Calendar size={16} /></div>
              </div>
              <div>
                <p className="text-2xl font-black text-indigo-600 font-mono">{projectCreditSummary.daysRemaining}d Left</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">Expires {projectCreditSummary.cycleEndDateFormatted}</p>
              </div>
            </div>
          </div>

          {/* ACTION-BASED CREDIT USAGE SUMMARY (AI Analysis vs Copy/Download) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-purple-50/70 to-indigo-50/50 p-5 rounded-3xl border border-purple-100/80 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-900">AI Analysis Actions</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-purple-700 font-mono">{actionTypeBreakdown.analysisCredits.toLocaleString()} pts</span>
                  <span className="text-xs font-bold text-purple-500">({actionTypeBreakdown.analysisPercent}% of consumed)</span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  {actionTypeBreakdown.analysisCount} AI Generation, Inference, and Execution triggers
                </p>
              </div>
              <div className="p-3 bg-purple-100 text-purple-700 rounded-2xl">
                <Zap size={22} />
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50/70 to-teal-50/50 p-5 rounded-3xl border border-emerald-100/80 shadow-sm flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900">Copy & Download Actions</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-700 font-mono">{actionTypeBreakdown.exportCredits.toLocaleString()} pts</span>
                  <span className="text-xs font-bold text-emerald-500">({actionTypeBreakdown.exportPercent}% of consumed)</span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium">
                  {actionTypeBreakdown.exportCount} Script Downloads, Test Case Exports, and Clipboard Copies
                </p>
              </div>
              <div className="p-3 bg-emerald-100 text-emerald-700 rounded-2xl">
                <Download size={22} />
              </div>
            </div>
          </div>

          {/* PROJECT MEMBER CREDIT CONTRIBUTIONS TABLE */}
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200/80 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <UserCheck size={18} className="text-indigo-600" />
                  Project Member Credit Contributions & Activity
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Credits are allocated at the project level ({projectCreditSummary.totalPool} credits shared across all project members for {projectCreditSummary.planType} plan). Only {projectCreditSummary.totalPool} credits are available for this project in the current cycle; members cannot use more than the credit limit and must subscribe once exhausted.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {projectCreditSummary.memberBreakdown.length} Team Member(s)
              </span>
            </div>

            {/* Trial / Pool Exhausted Notice Banner */}
            {projectCreditSummary.isGated && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                <ShieldAlert size={20} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <span className="font-black text-rose-900 uppercase tracking-wide block">
                    100% Credit Limit Reached ({projectCreditSummary.totalPool} / {projectCreditSummary.totalPool} Credits Used)
                  </span>
                  <p className="text-rose-700 leading-relaxed font-medium">
                    For one project, only <strong>{projectCreditSummary.totalPool} credits</strong> are available on the {projectCreditSummary.planType} plan. This limit has been reached and no further AI credits can be consumed. Project members must subscribe to a paid plan to re-enable AI features.
                  </p>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                    <th className="py-3.5 px-4">User Account</th>
                    <th className="py-3.5 px-4 text-center">Project Allocation</th>
                    <th className="py-3.5 px-4 text-center">Current Cycle Consumed</th>
                    <th className="py-3.5 px-4">Contribution Share</th>
                    <th className="py-3.5 px-4 text-center">Historical Lifetime Total</th>
                    <th className="py-3.5 px-4 text-center">AI Generations</th>
                    <th className="py-3.5 px-4 text-center">Last Active</th>
                    <th className="py-3.5 px-4 text-center">Member Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {projectCreditSummary.memberBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <UserCheck size={32} className="text-slate-300" />
                          <p className="font-bold text-slate-700 text-sm">No members associated with current scope</p>
                          <p className="text-xs text-slate-400 max-w-sm">
                            No team members were found in project "{projectCreditSummary.projectName}".
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    projectCreditSummary.memberBreakdown.map((member, idx) => {
                      const name = member.userName;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900 text-xs">{name}</p>
                                <p className="text-[10px] text-slate-400 font-medium font-mono">{member.userEmail}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700">
                            Shared ({projectCreditSummary.totalPool.toLocaleString()} pts)
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <div className="font-mono font-bold text-amber-600">
                              {member.consumedCredits.toLocaleString()} pts
                            </div>
                            <span className="text-[9px] text-slate-400 block font-sans font-medium">In current cycle</span>
                          </td>

                          <td className="py-3.5 px-4 min-w-[150px]">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[10px] font-bold text-slate-600">
                                <span>{member.percentageOfProjectUsed}%</span>
                                <span className="text-[9px] text-slate-400 font-mono">{member.consumedCredits} / {projectCreditSummary.usedCredits || 1} used</span>
                              </div>
                              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    member.percentageOfProjectUsed >= 50 ? 'bg-amber-500' : 'bg-[#00E1C5]'
                                  }`} 
                                  style={{ width: `${Math.max(member.consumedCredits > 0 ? 4 : 0, member.percentageOfProjectUsed)}%` }} 
                                />
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <div className="font-mono font-bold text-indigo-700">
                              {member.lifetimeConsumed.toLocaleString()} pts
                            </div>
                            <span className="text-[9px] text-slate-400 block font-sans font-medium">Cumulative</span>
                          </td>

                          <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-800">
                            {member.generationsCount} runs
                          </td>

                          <td className="py-3.5 px-4 text-center text-[10px] text-slate-500 font-mono">
                            {member.lastActivity}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-[10px]">
                              <CheckCircle2 size={10} /> Active Member
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ALL 10 AUTOMATIQA MODULES CREDIT CONSUMPTION GRID */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Zap size={20} className="text-[#00E1C5]" />
                  AutomatiQA 10 AI Generator Modules & Credit Consumption
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Pre-configured credit rates per generation across all 10 specialized testing and generation features
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {AUTOMATIQA_MODULES.map((mod) => {
                const stats = summaryMetrics.moduleDistribution[mod.name] || { count: 0, credits: 0, items: 0 };
                const creditCost = calculateCreditsConsumed(mod.name, 1, false);

                return (
                  <div 
                    key={mod.id} 
                    className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col justify-between group"
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                            {getModuleIcon(mod.name)}
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight">
                              {mod.name}
                            </h4>
                            <p className="text-[10px] text-slate-400 font-mono font-bold mt-0.5">
                              {creditCost} {creditCost === 1 ? 'Credit' : 'Credits'} / Button Click
                            </p>
                          </div>
                        </div>

                        <span className="px-2.5 py-1 bg-teal-50 border border-teal-200 text-[#008f7d] text-xs font-black rounded-xl shrink-0">
                          {creditCost} {creditCost === 1 ? 'Credit' : 'Credits'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        {mod.description}
                      </p>

                      <div className="space-y-1.5 pt-2 border-t border-slate-100 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-medium">Input Modalities:</span>
                          <span className="text-slate-800 font-bold max-w-[180px] truncate text-right">{mod.inputTypes.join(', ')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-medium">Output Artifacts:</span>
                          <span className="text-slate-800 font-bold max-w-[180px] truncate text-right">{mod.outputType}</span>
                        </div>
                      </div>
                    </div>

                    {/* Module Usage Footer */}
                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50/60 -mx-6 -mb-6 p-4 rounded-b-3xl">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Executions</span>
                        <span className="font-bold text-slate-900 font-mono">{stats.count} Runs</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Credits Used</span>
                        <span className="font-black text-[#00a693] font-mono">{stats.credits} Credits</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SUBSCRIPTION REQUESTS & SUPER ADMIN RE-ENABLEMENT CONTROLS */}
      {activeTab === 'subscription_management' && (
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200/80 shadow-sm space-y-8 animate-in fade-in duration-200">
          <div className="border-b border-slate-100 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-600 text-xs font-black uppercase tracking-widest mb-1">
                <Crown size={16} className="text-amber-500" /> Plan-Based Credit & Subscription Management
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Project Plan Allocation & Subscription Control
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Manage project-level credit plans (Trial: 100 pts / 7 days, Paid: 1,000 pts / 30 days). Once allocated, plans are locked until credit limit is exceeded. When exceeded, AI Generations, Downloads, and Copy are blocked until Super Admin renews or changes the plan.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700 text-xs font-bold flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-indigo-600" />
                {isSuperAdmin ? 'Super Admin Role Active' : 'Admin Role Active'}
              </span>
            </div>
          </div>

          {actionSuccessMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 text-xs font-bold animate-in fade-in">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <span>{actionSuccessMessage}</span>
            </div>
          )}

          {/* QUICK SUMMARY CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Trial Plans Active</span>
              <div className="text-2xl font-black text-indigo-600 font-mono">
                {allProjectSummaries.filter(p => p.planType === 'Trial').length} Projects
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">200 credits / 7 days validity</p>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Paid Plans Active</span>
              <div className="text-2xl font-black text-purple-600 font-mono">
                {allProjectSummaries.filter(p => p.planType === 'Paid').length} Projects
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">1,000 credits / 30 days validity</p>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">Pending Requests</span>
              <div className="text-2xl font-black text-amber-600 font-mono">
                {pendingSubscriptionRequests.length}
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Awaiting Super Admin approval</p>
            </div>
          </div>

          {/* PROJECT PLAN ALLOCATIONS TABLE */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Layers size={16} className="text-indigo-600" />
                  Project-Level Credit Plans & Renewal Controls
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Credits are allocated at the project level. When renewed, a NEW cycle begins with 0 used credits and full validity, keeping historical logs intact.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                    <th className="py-3.5 px-4">Project</th>
                    <th className="py-3.5 px-4 text-center">Active Plan</th>
                    <th className="py-3.5 px-4 text-center">Credit Limit</th>
                    <th className="py-3.5 px-4 text-center">Cycle Used</th>
                    <th className="py-3.5 px-4 text-center">Remaining</th>
                    <th className="py-3.5 px-4 text-center">Validity</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {allProjectSummaries.map((pSummary) => (
                    <tr key={pSummary.projectId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900">{pSummary.projectName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{pSummary.projectId}</p>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2.5 py-1 text-[10px] font-black rounded-lg border ${
                          pSummary.planType === 'Paid'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        }`}>
                          {pSummary.planType} Plan
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700">
                        {pSummary.totalPool.toLocaleString()} pts
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-amber-600">
                        {pSummary.usedCredits.toLocaleString()} pts ({pSummary.percentageUsed}%)
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-[#00a693]">
                        {pSummary.remainingCredits.toLocaleString()} pts
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-mono font-bold text-slate-800">
                          {pSummary.daysRemaining} of {pSummary.validityDays}d
                        </div>
                        <span className="text-[9px] text-slate-400 block font-mono">Expires {pSummary.cycleEndDateFormatted}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 text-[10px] font-black rounded-md border ${
                          pSummary.isGated
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {pSummary.isGated ? (pSummary.isExpired ? 'Expired' : 'Exhausted') : 'Active'}
                        </span>
                      </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {(isSuperAdmin || isAdmin) ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <select
                                    value={pSummary.planType}
                                    disabled={isUpdatingPlan}
                                    onChange={(e) => {
                                      const nextPlan = e.target.value as PlanType;
                                      if (nextPlan !== pSummary.planType) {
                                        handleSwitchProjectPlan(pSummary.projectId, pSummary.projectName, nextPlan);
                                      }
                                    }}
                                    className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-1 focus:ring-[#00E1C5] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50"
                                    title="Choose Plan: Trial Plan (100 pts) or Paid Plan (1,000 pts)"
                                  >
                                    <option value="Trial">Trial Plan (100 pts)</option>
                                    <option value="Paid">Paid Plan (1,000 pts)</option>
                                  </select>
                                </div>
                                <button
                                  id={`renew-cycle-btn-${pSummary.projectId}`}
                                  onClick={() => {
                                    handleRenewProjectPlan(pSummary.projectId, pSummary.projectName);
                                  }}
                                  disabled={isUpdatingPlan}
                                  className="px-2.5 py-1 bg-[#00E1C5]/20 hover:bg-[#00E1C5] text-teal-900 hover:text-slate-950 border border-teal-300 rounded-lg text-[11px] font-black transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
                                  title="Renew credit cycle: Reset used credits to 0 and grant fresh credits"
                                >
                                  <RefreshCw size={11} className={isUpdatingPlan ? "animate-spin" : ""} />
                                  <span>RENEW CYCLE</span>
                                </button>
                              </>
                            ) : (
                              projectPendingSubscription ? (
                                <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[10px] font-bold flex items-center gap-1">
                                  <Clock size={11} className="text-amber-600 animate-spin" />
                                  <span>Request Pending</span>
                                </span>
                              ) : (
                                <button
                                  id={`send-request-btn-${pSummary.projectId}`}
                                  onClick={() => setIsSubscribeModalOpen(true)}
                                  className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-black transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
                                  title="Send credit subscription or plan request to Super Admin"
                                >
                                  <Send size={11} className="text-indigo-600" />
                                  <span>SEND REQUEST</span>
                                </button>
                              )
                            )}
                          </div>
                        </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PENDING SUBSCRIPTION REQUESTS TABLE */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Crown size={16} className="text-amber-500" />
              Incoming Subscription Requests from Gated Users
            </h3>

            {visibleSubscriptionRequests.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
                <Crown size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-700">No Subscription Requests Yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  When a user clicks "Subscribe" after hitting 1,000 credits, their request appears here for approval. You can also directly re-enable any user in the table below.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                      <th className="py-3.5 px-4">User</th>
                      <th className="py-3.5 px-4">Target Project / Scope</th>
                      <th className="py-3.5 px-4">Requested At</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-center">Credits Requested</th>
                      <th className="py-3.5 px-4">Notes</th>
                      <th className="py-3.5 px-4 text-center">{isSuperAdmin ? 'Super Admin Action' : 'Action / Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {visibleSubscriptionRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-slate-900">{req.userName}</p>
                          <p className="text-[11px] text-slate-400 font-mono">{req.userEmail}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          {req.projectName ? (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg font-black text-[11px] flex items-center gap-1">
                                <Layers size={11} className="text-indigo-600" /> {req.projectName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-medium italic">Global User Plan</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 font-mono text-[11px]">
                          {req.requestedAtFormatted || new Date(req.requestedAt).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {(req.status === 'PENDING' || req.status === 'pending') && pendingSubscriptionRequests.some(p => p.id === req.id) ? (
                            <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded-lg text-[10px] inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
                              Pending Approval
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-lg text-[10px]">
                              Approved & Active
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-indigo-600">
                          {req.requestedCredits || 1000} pts
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 text-[11px] max-w-[200px] truncate">
                          {req.notes || '1000 credits limit reached. Requesting re-enablement.'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isSuperAdmin ? (
                            (req.status === 'PENDING' || req.status === 'pending') && pendingSubscriptionRequests.some(p => p.id === req.id) ? (
                              <button
                                onClick={() => handleApproveSubscription(req.id, req.userEmail, req.userName)}
                                disabled={isApproving === req.id}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#00E1C5] hover:bg-[#00cbb2] text-slate-950 font-black rounded-xl text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
                              >
                                <CheckCircle2 size={14} />
                                {isApproving === req.id ? 'Re-Enabling...' : req.projectName ? 'Re-Enable Project (+1,000)' : 'Approve & Re-Enable (+1,000)'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleDirectGrant(req.userEmail, req.userName)}
                                disabled={isApproving === req.userEmail}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-[11px] transition-all disabled:opacity-50"
                              >
                                <RefreshCw size={12} />
                                {isApproving === req.userEmail ? 'Re-granting...' : 'Re-grant Plan'}
                              </button>
                            )
                          ) : (
                            (req.status === 'PENDING' || req.status === 'pending') && pendingSubscriptionRequests.some(p => p.id === req.id) ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 font-bold rounded-xl text-xs">
                                <Clock size={13} className="text-amber-600 animate-spin" />
                                <span>Awaiting Super Admin</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-xl text-xs">
                                <CheckCircle2 size={13} className="text-emerald-600" />
                                <span>Approved & Active</span>
                              </span>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* DIRECT USER RE-ENABLEMENT PANEL (Super Admin Only) */}
          {isSuperAdmin && (
            <div className="p-6 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-xl text-[#00E1C5]">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h4 className="text-base font-black text-white">Direct User Subscription Grant</h4>
                  <p className="text-xs text-slate-300 font-medium">
                    Select any user account to immediately re-enable their subscription with a fresh 1,000 credit allocation and 30 days validity.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                {userAccountRows.map((data, i) => {
                  const name = data.name;
                  return (
                    <div key={i} className="bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-2">
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-bold text-white text-xs truncate">{name}</p>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${data.statusBadgeClass}`}>
                            {data.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{data.email}</p>
                        <div className="mt-1 space-y-0.5">
                          <p className="text-[10px] text-amber-300 font-mono font-bold">
                            Cycle: {data.used.toLocaleString()} / {data.allocated.toLocaleString()} pts ({data.pct}%)
                          </p>
                          <p className="text-[9px] text-slate-400 font-mono">
                            Remaining: {data.remaining.toLocaleString()} pts • Lifetime: {data.lifetimeUsed.toLocaleString()} pts
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDirectGrant(data.email, name)}
                        disabled={isApproving === data.email}
                        className="w-full py-1.5 bg-[#00E1C5] hover:bg-[#00cbb2] text-slate-950 font-black rounded-lg text-[11px] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <Crown size={12} />
                        {isApproving === data.email ? 'Granting...' : 'Re-Enable (+1000)'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DETAILED CONSUMPTION LOGS TABLE */}
      {activeTab === 'consumption_table' && (
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200/80 shadow-sm space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <Coins size={20} className="text-[#00E1C5]" />
                  Detailed Credit Consumption Logs
                </h3>
                <span className="px-2.5 py-0.5 bg-teal-50 text-[#008f7d] border border-teal-200 rounded-full text-[11px] font-bold">
                  {authorizedLogs.length} Records
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Every AI generation transaction with workspace, project, user, module, and exact credit points consumed.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                id="refresh-firestore-logs-btn"
                onClick={handleRefreshFromFirestore}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                title="Reload live records directly from Firestore database"
              >
                <RefreshCw size={14} className={isRefreshing ? "animate-spin text-teal-600" : ""} />
                {isRefreshing ? "Refreshing..." : "Refresh from Firestore"}
              </button>

              {selectedLogIds.length > 0 && (
                <div className="flex items-center gap-3 ml-2">
                  <span className="text-xs font-bold text-slate-500">
                    {selectedLogIds.length} Selected
                  </span>
                  <button
                    onClick={() => {
                      setDeleteConfirmModal({
                        open: true,
                        ids: selectedLogIds,
                        title: `Delete ${selectedLogIds.length} Log(s)`,
                        message: `Are you sure you want to delete ${selectedLogIds.length} selected consumption record(s)?`
                      });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition-all"
                  >
                    <Trash2 size={14} /> Delete Selected
                  </button>
                </div>
              )}
            </div>
          </div>

          {firestoreError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between gap-3 text-rose-800 text-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                <div>
                  <span className="font-bold">Firestore Notice: </span>
                  <span>{firestoreError}</span>
                  <span className="ml-1 text-rose-600">(Showing cached in-memory records)</span>
                </div>
              </div>
              <button
                onClick={handleRefreshFromFirestore}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shrink-0 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* FILTER BAR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search user, project, story ID, module..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500/20"
              />
            </div>

            <div>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
              >
                {uniqueProjects.map(pName => (
                  <option key={pName} value={pName}>
                    {pName === 'All'
                      ? (isSuperAdmin ? 'Project: All (Global)' : `Project: All (${accessibleProjects.length})`)
                      : `Project: ${pName}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedMember}
                onChange={(e) => setSelectedMember(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
              >
                <option value="All">
                  {selectedProject === 'All'
                    ? (isSuperAdmin ? 'Member: All (Global)' : 'Member: All Project Members')
                    : `Member: All of ${selectedProject}`}
                </option>
                {uniqueMembers.filter(m => m !== 'All').map(m => {
                  const label = getMemberLabel(m);
                  return (
                    <option key={m} value={m}>{label}</option>
                  );
                })}
              </select>
            </div>

            <div>
              <select
                value={selectedFeature}
                onChange={(e) => setSelectedFeature(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
              >
                {uniqueFeatures.map(f => (
                  <option key={f} value={f}>Module: {f}</option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedActionType}
                onChange={(e) => setSelectedActionType(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
              >
                <option value="All">Action: All Types</option>
                <option value="analysis">AI Analysis</option>
                <option value="export">Copy / Download</option>
                <option value="copy">Copy</option>
                <option value="download">Download</option>
              </select>
            </div>

            <div>
              <select
                value={selectedCacheStatus}
                onChange={(e) => setSelectedCacheStatus(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none"
              >
                <option value="All">Cache: All Statuses</option>
                <option value="Standard">Standard Execution</option>
                <option value="Cached">Cached (0 Credits)</option>
              </select>
            </div>
          </div>

          {/* CONSUMPTION LOGS TABLE */}
          <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200 select-none">
                  <th className="py-3.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredLogs.length > 0 && selectedLogIds.length === filteredLogs.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    />
                  </th>
                  <th className="py-3.5 px-4 cursor-pointer" onClick={() => handleSort('timestamp')}>
                    <div className="flex items-center gap-1">
                      <span>Date & Time (IST)</span>
                      <ArrowUpDown size={12} className={sortField === 'timestamp' ? 'text-indigo-600' : 'text-slate-400'} />
                    </div>
                  </th>
                  <th className="py-3.5 px-4">User</th>
                  <th className="py-3.5 px-4">Project</th>
                  <th className="py-3.5 px-4">User Story</th>
                  <th className="py-3.5 px-4">AutomatiQA Module</th>
                  <th className="py-3.5 px-4 text-center">Action Type</th>
                  <th className="py-3.5 px-4">Input Modality</th>
                  <th className="py-3.5 px-4">Tier</th>
                  <th className="py-3.5 px-4 cursor-pointer" onClick={() => handleSort('itemsGenerated')}>
                    <div className="flex items-center gap-1">
                      <span>Output Produced</span>
                      <ArrowUpDown size={12} className={sortField === 'itemsGenerated' ? 'text-indigo-600' : 'text-slate-400'} />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-center cursor-pointer bg-teal-50/50" onClick={() => handleSort('creditsConsumed')}>
                    <div className="flex items-center justify-center gap-1 text-[#008f7d]">
                      <span>Credits Consumed</span>
                      <ArrowUpDown size={12} className={sortField === 'creditsConsumed' ? 'text-[#008f7d]' : 'text-teal-400'} />
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-center">Remaining Balance</th>
                  <th className="py-3.5 px-4 text-center">Cache Status</th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {isLoadingLogs && logs.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-16 text-center text-slate-500">
                      <RefreshCw size={36} className="mx-auto mb-3 animate-spin text-teal-500" />
                      <p className="font-bold text-slate-700">Loading consumption records from Firestore...</p>
                      <p className="text-[11px] text-slate-400 mt-1">Fetching live transaction logs from cloud database</p>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-12 text-center text-slate-400">
                      <Coins size={36} className="mx-auto mb-2 opacity-30" />
                      <p className="font-bold text-slate-700">No consumption records found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {selectedProject !== 'All' 
                          ? `No credit transactions logged for project "${selectedProject}".`
                          : selectedMember !== 'All'
                          ? `No credit transactions logged for member "${selectedMember}".`
                          : 'No records match the current filter criteria.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const isSelected = selectedLogIds.includes(log.id);
                    const credits = log.creditsConsumed ?? calculateCreditsConsumed(log.feature, log.itemsGenerated || 1, log.cached, log.actionType || 'analysis');
                    const tierInfo = log.tier ? { tier: log.tier } : calculateInputTier(log);

                    return (
                      <tr 
                        key={log.id} 
                        className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-indigo-50/30' : ''}`}
                      >
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectOne(log.id)}
                            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                          />
                        </td>

                        <td className="py-3.5 px-4 font-mono font-medium text-slate-600 whitespace-nowrap">
                          {log.date || formatToIST(log.timestamp)}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{log.user || 'Unknown'}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-slate-100 rounded-md font-bold text-slate-800 text-[11px]" title={log.project || log.projectId}>
                            {getProjectDisplayName(log, projects)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/80 rounded-md text-[11px] font-mono font-bold">
                            {log.userStoryId || 'US-GENERAL'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="p-1 bg-slate-50 border border-slate-200 rounded-lg shrink-0">
                              {getModuleIcon(log.feature)}
                            </div>
                            <span className="text-xs text-slate-900 font-bold">{log.feature}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {(() => {
                            const info = getActionTypeInfo(log);
                            if (info.type === 'copy') {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Copy size={11} /> Copy
                                </span>
                              );
                            }
                            if (info.type === 'download') {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Download size={11} /> Download
                                </span>
                              );
                            }
                            if (info.type === 'export') {
                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Download size={11} /> Copy / Download
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                                <Zap size={11} /> AI Analysis
                              </span>
                            );
                          })()}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 w-max">
                              {log.inputModality || 'Text'}
                            </span>
                            {log.inputModalityDetails && (
                              <span className="text-[10px] text-slate-500 font-medium max-w-[200px] truncate block" title={log.inputModalityDetails}>
                                {log.inputModalityDetails}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            {tierInfo.tier}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-800 text-xs">
                              {log.itemsGenerated || 1} Artifacts
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium max-w-[180px] truncate block" title={log.outputType}>
                              {log.outputType || 'AI Output Artifacts'}
                            </span>
                          </div>
                        </td>

                        {/* CREDITS CONSUMED COLUMN */}
                        <td className="py-3.5 px-4 text-center font-mono font-black text-[#00a693] bg-teal-50/40 whitespace-nowrap">
                          <span className="px-2.5 py-1 rounded-lg bg-teal-100/70 text-teal-800 text-xs font-black shadow-xs">
                            {credits} {credits === 1 ? 'Credit' : 'Credits'}
                          </span>
                        </td>

                        {/* REMAINING BALANCE COLUMN */}
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {log.remainingCreditsAfter !== undefined ? (
                            <span className="text-xs font-mono font-bold text-slate-700">
                              {log.remainingCreditsAfter.toLocaleString()} pts
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 font-mono">-</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {log.cached ? (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <CheckCircle2 size={10} /> Cached (0 Credits)
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Standard
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setInspectLog(log)}
                              className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition-all"
                              title="Inspect Credit Details"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setDeleteConfirmModal({
                                  open: true,
                                  ids: [log.id],
                                  title: 'Delete Log',
                                  message: 'Are you sure you want to delete this credit consumption entry?'
                                });
                              }}
                              className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition-all"
                              title="Delete Log"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* TABLE FOOTER */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 text-xs text-slate-500 font-semibold">
            <div>
              Showing <strong className="text-slate-900">{filteredLogs.length}</strong> of <strong className="text-slate-900">{logs.length}</strong> entries
            </div>
            <div className="flex items-center gap-6">
              <span>Historical Lifetime Used: <strong className="text-indigo-600 font-bold">{summaryMetrics.totalLifetimeCredits.toLocaleString()} Credits</strong></span>
              <span>Cycle Balance: <strong className="text-teal-600 font-bold">{activeDisplayMetrics.remaining.toLocaleString()} Credits</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: MODULE CREDIT RATE CARD */}
      {activeTab === 'rate_card' && (
        <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200/80 shadow-sm space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <div className="flex items-center gap-2 text-indigo-600 text-xs font-black uppercase tracking-widest mb-1">
                <Zap size={14} /> AutomatiQA Module Credit Rate Card
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Credit Point Consumption Rates Across All 10 AI Modules
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Fixed credit deduction model per AI generation button click. Input/output volume is not charged.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="text-center px-3 border-r border-slate-200">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Trial Plan</p>
                <p className="text-sm font-black text-indigo-600">100 Pts / 7 Days</p>
              </div>
              <div className="text-center px-3 border-r border-slate-200">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Paid Plan</p>
                <p className="text-sm font-black text-purple-600">1,000 Pts / 30 Days</p>
              </div>
              <div className="text-center px-3 border-r border-slate-200">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Current Project</p>
                <p className="text-sm font-black text-slate-900">{projectCreditSummary.planType} Plan ({projectCreditSummary.remainingCredits} Left)</p>
              </div>
              <div className="text-center px-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cached Re-runs</p>
                <p className="text-sm font-black text-emerald-600">0 Credits (Free)</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                  <th className="py-4 px-6">Feature Module</th>
                  <th className="py-4 px-4">Action / Button Trigger</th>
                  <th className="py-4 px-4 text-center bg-indigo-50/40 text-indigo-900 border-x border-indigo-100/50">
                    <div>Trial Plan (100 Pts / 7d)</div>
                    <div className="flex items-center justify-center gap-4 text-[9px] mt-1 font-bold text-indigo-600">
                      <span>Analysis</span>
                      <span>•</span>
                      <span>Copy/Download</span>
                    </div>
                  </th>
                  <th className="py-4 px-4 text-center bg-purple-50/40 text-purple-900 border-r border-purple-100/50">
                    <div>Paid Plan (1,000 Pts / 30d)</div>
                    <div className="flex items-center justify-center gap-4 text-[9px] mt-1 font-bold text-purple-600">
                      <span>Analysis</span>
                      <span>•</span>
                      <span>Copy/Download</span>
                    </div>
                  </th>
                  <th className="py-4 px-4">Supported Inputs</th>
                  <th className="py-4 px-4">Output Artifacts</th>
                  <th className="py-4 px-4 text-center">Cache Benefit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {AUTOMATIQA_MODULES.map((mod, idx) => {
                  const trialAnalysis = getCreditCost(mod.name, 'analysis', 'Trial');
                  const trialExport = getCreditCost(mod.name, 'export', 'Trial');
                  const paidAnalysis = getCreditCost(mod.name, 'analysis', 'Paid');
                  const paidExport = getCreditCost(mod.name, 'export', 'Paid');

                  // Button trigger labels
                  let buttonTrigger = 'AI GENERATE BUTTON';
                  const lowerName = mod.name.toLowerCase();
                  if (lowerName.includes('user stor')) {
                    buttonTrigger = "'Generate AI user stories'";
                  } else if (lowerName.includes('scenario')) {
                    buttonTrigger = "'Generate AI Scenarios'";
                  } else if (lowerName.includes('test case')) {
                    buttonTrigger = "'GENERATE AI TEST CASES' / 'AI GENERATE SELECTED'";
                  } else if (lowerName.includes('script generator')) {
                    buttonTrigger = "'GENERATE POM SCRIPT'";
                  } else if (lowerName.includes('record and play - web')) {
                    buttonTrigger = "'START RECORDING' & 'GENERATE SCRIPTS'";
                  } else if (lowerName.includes('record and play - mobile')) {
                    buttonTrigger = "'START RECORDING' & 'GENERATE SCRIPTS'";
                  } else if (lowerName.includes('ui testing')) {
                    buttonTrigger = "'RUN UI TESTING' / 'START AUDIT'";
                  } else if (lowerName.includes('api testing')) {
                    buttonTrigger = "'GENERATE API TEST SUITE'";
                  } else if (lowerName.includes('api performance')) {
                    buttonTrigger = "'GENERATE JMX SCRIPT' & 'GENERATE REPORT'";
                  } else if (lowerName.includes('web performance')) {
                    buttonTrigger = "'RUN CHECKOUT'";
                  }

                  return (
                    <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-900">
                        <div className="flex items-center gap-2.5">
                          {getModuleIcon(mod.name)}
                          <span>{mod.name}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-mono font-semibold text-indigo-700 bg-indigo-50/30">
                        {buttonTrigger}
                      </td>

                      {/* TRIAL PLAN RATES */}
                      <td className="py-4 px-4 text-center bg-indigo-50/20 border-x border-indigo-100/50">
                        <div className="flex items-center justify-center gap-2">
                          <span className="bg-indigo-100 text-indigo-800 text-xs font-black px-2.5 py-1 rounded-lg">
                            {trialAnalysis} pts
                          </span>
                          <span className="text-slate-300">/</span>
                          <span className="bg-teal-100 text-teal-800 text-xs font-black px-2.5 py-1 rounded-lg">
                            {trialExport} pts
                          </span>
                        </div>
                      </td>

                      {/* PAID PLAN RATES */}
                      <td className="py-4 px-4 text-center bg-purple-50/20 border-r border-purple-100/50">
                        <div className="flex items-center justify-center gap-2">
                          <span className="bg-purple-100 text-purple-800 text-xs font-black px-2.5 py-1 rounded-lg">
                            {paidAnalysis} pts
                          </span>
                          <span className="text-slate-300">/</span>
                          <span className="bg-teal-100 text-teal-800 text-xs font-black px-2.5 py-1 rounded-lg">
                            {paidExport} pts
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {mod.inputTypes.map((t, i) => (
                            <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-4 px-4 font-medium text-slate-800">
                        {mod.outputType}
                      </td>

                      <td className="py-4 px-4 text-center">
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold">
                          0 Credits
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* INSPECT LOG MODAL */}
      {inspectLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  {getModuleIcon(inspectLog.feature)}
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">{inspectLog.feature}</h3>
                  <p className="text-xs text-slate-500 font-medium">Transaction ID: {inspectLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectLog(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-black p-2"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">Date & Time:</span><span className="font-bold text-slate-800">{inspectLog.date}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">User:</span><span className="font-bold text-slate-800">{inspectLog.user} ({inspectLog.userEmail || 'user@qaoncloud.com'})</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">Project:</span><span className="font-bold text-slate-800">{inspectLog.project}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">User Story:</span><span className="font-bold text-slate-800">{inspectLog.userStoryId || 'US-GENERAL'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">Action Type:</span><span className="font-bold text-slate-800">{getActionTypeInfo(inspectLog).label}</span></div>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">Input Modality:</span><span className="font-bold text-slate-800">{inspectLog.inputModality || 'Text'}</span></div>
                {inspectLog.inputModalityDetails && (
                  <div className="flex justify-between"><span className="text-slate-500 font-semibold">Modality Details:</span><span className="font-bold text-slate-800 text-right max-w-[240px]">{inspectLog.inputModalityDetails}</span></div>
                )}
                {inspectLog.outputType && (
                  <div className="flex justify-between"><span className="text-slate-500 font-semibold">Output Type:</span><span className="font-bold text-slate-800 text-right max-w-[240px]">{inspectLog.outputType}</span></div>
                )}
                <div className="flex justify-between"><span className="text-slate-500 font-semibold">Items Produced:</span><span className="font-bold text-slate-800">{inspectLog.itemsGenerated || 1} Artifacts</span></div>
              </div>

              <div className="bg-teal-50 p-4 rounded-2xl border border-teal-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-teal-900">Total Credits Consumed:</span>
                  <p className="text-[10px] text-teal-700 font-medium">Billed to AutomatiQA workspace credits</p>
                </div>
                <span className="text-xl font-black text-teal-800 font-mono">
                  {inspectLog.creditsConsumed ?? calculateCreditsConsumed(inspectLog.feature, inspectLog.itemsGenerated || 1, inspectLog.cached)} Credits
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                onClick={() => setInspectLog(null)}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* SIMULATE CONSUMPTION LOG MODAL */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#00E1C5]/10 text-[#00E1C5] rounded-2xl">
                  <Coins size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Simulate AI Credit Consumption</h3>
                  <p className="text-xs text-slate-500 font-medium">Record simulated usage for any of the 10 AutomatiQA modules</p>
                </div>
              </div>
              <button
                onClick={() => setIsSimulateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-black p-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSimulateSubmit} className="space-y-4 text-xs font-semibold text-slate-700">
              <div>
                <label className="block mb-1 font-bold text-slate-800">Module / Feature</label>
                <select
                  value={simFeature}
                  onChange={(e) => setSimFeature(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20"
                >
                  {AUTOMATIQA_MODULES.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 font-bold text-slate-800">Project</label>
                  {accessibleProjects.length > 0 ? (
                    <select
                      value={simProject}
                      onChange={(e) => setSimProject(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      required
                    >
                      <option value="">Select Project</option>
                      {accessibleProjects.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={simProject}
                      onChange={(e) => setSimProject(e.target.value)}
                      placeholder="e.g. Global Retail Banking App"
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      required
                    />
                  )}
                </div>

                <div>
                  <label className="block mb-1 font-bold text-slate-800">User Story ID</label>
                  <input
                    type="text"
                    value={simUserStoryId}
                    onChange={(e) => setSimUserStoryId(e.target.value)}
                    placeholder="e.g. US-102 (Funds Transfer)"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1 font-bold text-slate-800">Input Modality</label>
                  <select
                    value={simModality}
                    onChange={(e) => setSimModality(e.target.value as any)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  >
                    <option value="Text">Text</option>
                    <option value="Screenshot">Screenshot</option>
                    <option value="Video">Video</option>
                    <option value="Document">Document</option>
                    <option value="URL">URL</option>
                    <option value="Multimodal">Multimodal</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 font-bold text-slate-800">Items Generated</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={simItemsGenerated}
                    onChange={(e) => setSimItemsGenerated(Number(e.target.value))}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 font-bold text-slate-800">Modality Details</label>
                <input
                  type="text"
                  value={simModalityDetails}
                  onChange={(e) => setSimModalityDetails(e.target.value)}
                  placeholder="e.g. 2 Screenshots + 1 BRD Document (4 pages)"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simCached}
                    onChange={(e) => setSimCached(e.target.checked)}
                    className="w-4 h-4 accent-[#00E1C5] rounded"
                  />
                  <span className="text-xs font-bold text-slate-800">Context Cache Hit (0 credits billed)</span>
                </label>
              </div>

              <div className="p-3 bg-teal-50 rounded-xl border border-teal-200 flex items-center justify-between text-xs">
                <span className="text-teal-900 font-bold">Estimated Credits to Deduct:</span>
                <span className="font-mono font-black text-teal-800 text-sm">
                  {calculateCreditsConsumed(simFeature, simItemsGenerated, simCached)} Credits
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSimulateModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#00E1C5] text-slate-950 font-black hover:bg-[#00cbb2] shadow-md uppercase tracking-wider"
                >
                  Simulate & Add Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-2xl"><AlertTriangle size={24} /></div>
              <h3 className="text-lg font-black text-slate-900">{deleteConfirmModal.title}</h3>
            </div>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              {deleteConfirmModal.message}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteConfirmModal.ids.length === 1) {
                    handleDeleteSingle(deleteConfirmModal.ids[0]);
                  } else {
                    handleDeleteSelected();
                  }
                }}
                disabled={isDeleting}
                className="px-5 py-2 bg-rose-600 text-white rounded-xl text-xs font-black hover:bg-rose-700 transition-all shadow-md"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* PROJECT SUBSCRIBE / RE-ENABLE REQUEST MODAL */}
      {isSubscribeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <Crown size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Subscribe & Re-Enable Project Plan</h3>
                  <p className="text-xs text-slate-500 font-medium">Request credit re-enablement for your project</p>
                </div>
              </div>
              <button
                onClick={() => setIsSubscribeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-black p-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-500">Target Project:</span>
                  <span className="font-black text-slate-900 text-sm">{currentProjectName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-500">Current Plan / Status:</span>
                  <span className="font-bold text-rose-600">
                    {projectCreditSummary.planType} Plan ({projectCreditSummary.usedCredits}/{projectCreditSummary.totalPool} credits used - {projectCreditSummary.percentageUsed}%)
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-500">Requested Plan:</span>
                  <span className="font-black text-indigo-600">Paid Plan (1,000 Credits / 30 Days)</span>
                </div>
              </div>

              {/* Policy Banner */}
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-black text-xs text-amber-800">
                  <ShieldAlert size={15} />
                  <span>Super Admin Approval Required</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800/90 font-medium">
                  Once submitted, this request will be sent to the Super Admin. As per workflow requirements, new points and the new plan will ONLY be added once the Super Admin reviews and re-enables this project.
                </p>
              </div>

              <div>
                <label className="block mb-1.5 font-bold text-slate-800">
                  Optional Notes for Super Admin:
                </label>
                <textarea
                  value={subscribeNotes}
                  onChange={(e) => setSubscribeNotes(e.target.value)}
                  placeholder="e.g. Project test phase is accelerating, please re-enable with 1,000 credits."
                  rows={3}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 text-xs text-slate-800 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSubscribeModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestProjectSubscription(currentProjectId, currentProjectName, subscribeNotes)}
                  disabled={isSubscribingProject}
                  className="px-6 py-2.5 rounded-xl bg-[#00E1C5] hover:bg-[#00cbb2] text-slate-950 font-black shadow-md uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Send size={14} />
                  <span>{isSubscribingProject ? 'Submitting...' : 'Submit Subscription Request'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
