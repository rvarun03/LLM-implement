import React, { useState, useMemo, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Project, TestStatus, TestCase, TestType, ActivityLog, User as UserType, UserRole, isApiTestingScenario, isApiTestingCase } from '../types';
import { getScenarioMetrics, getAiTestCases, getAiTestCaseMetrics } from '../services/projectService';
import { 
  CheckCircle2, 
  // Added missing CheckCircle icon
  CheckCircle,
  XCircle, 
  AlertCircle, 
  Clock, 
  TrendingUp, 
  Sparkles, 
  Layers, 
  Zap, 
  Terminal, 
  Network, 
  Activity, 
  LayoutDashboard,
  History,
  FileText,
  FileSearch,
  ChevronDown,
  Database,
  ShieldCheck,
  AlertTriangle,
  MousePointer2,
  Filter,
  Inbox,
  LayoutGrid,
  Briefcase,
  User,
  Calendar,
  MessageSquare,
  ArrowRight,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { updateProjectFirestore } from '../services/projectService';
import { logActivity, formatUserName } from '../services/activityService';
import { 
  getFunctionalExecutionStats, 
  getScriptExecutionStats, 
  getApiExecutionStats, 
  getPerformanceExecutionStats 
} from '../services/executionStatsService';

interface DashboardProps {
  user: UserType;
  projects: Project[];
  activeProject?: Project;
}

type QualityType = 
  | 'AI Scenarios' 
  | 'AI Test Cases' 
  | 'Manual Test Case Execution' 
  | 'Automation Test Script Execution' 
  | 'API Testing Execution' 
  | 'Performance Testing Execution';

const Dashboard: React.FC<DashboardProps> = ({ user, projects, activeProject }) => {
  const [qualityType, setQualityType] = useState<QualityType>('AI Scenarios');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    activeProject?.id || 'all'
  );
  const [realTimeLogs, setRealTimeLogs] = useState<ActivityLog[]>([]);
  const [fallbackTrigger, setFallbackTrigger] = useState(0);

  useEffect(() => {
    const handleFallback = () => {
      setFallbackTrigger(prev => prev + 1);
    };
    window.addEventListener('firestore-db-fallback', handleFallback);
    return () => window.removeEventListener('firestore-db-fallback', handleFallback);
  }, []);

  // Sync with activeProject from side nav
  useEffect(() => {
    if (activeProject?.id) {
      setSelectedWorkspaceId(activeProject.id);
    }
  }, [activeProject?.id]);
  
  // Pagination State for Activity Logs
  const [currentLogPage, setCurrentLogPage] = useState(1);
  const logsPerPage = 10;

  // 1. Real-time Activity Subscription
  useEffect(() => {
    const path = "activities";
    const q = query(collection(db, path), orderBy("timestamp", "desc"), limit(1000));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ActivityLog[];
      setRealTimeLogs(logs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [fallbackTrigger]);

  // Reset pagination when filter changes
  useEffect(() => {
    setCurrentLogPage(1);
  }, [selectedWorkspaceId]);

  // User associated projects filter
  const userAssociatedProjects = useMemo(() => {
    if (!user || !user.email) return [];
    const email = user.email.toLowerCase().trim();
    const userRoleLower = (user.role as string | undefined)?.toLowerCase().trim();
    const isSuperAdmin = user.role === UserRole.SUPER_ADMIN || 
                         userRoleLower === 'super admin' || 
                         email === 'shanmugapriya@qaoncloud.com' ||
                         email === 'vinuta@qaoncloud.com';

    // Super Admin has access to all projects
    if (isSuperAdmin) {
      return projects || [];
    }

    const rawAssigned = Array.isArray(user.assignedProjectIds)
      ? user.assignedProjectIds
      : (user.assignedProjectIds && typeof user.assignedProjectIds === 'object')
        ? Object.keys(user.assignedProjectIds)
        : [];
    const assignedIds = new Set(rawAssigned.map(id => String(id)));

    const filtered = (projects || []).filter(p => {
      const ownerMatch = p.ownerEmail?.toLowerCase().trim() === email;
      let allocatedMatch = false;
      if (Array.isArray(p.allocatedUserEmails)) {
        allocatedMatch = p.allocatedUserEmails.some(e => typeof e === 'string' && e.toLowerCase().trim() === email);
      } else if (p.allocatedUserEmails && typeof p.allocatedUserEmails === 'object') {
        allocatedMatch = Object.keys(p.allocatedUserEmails).some(e => e.toLowerCase().trim() === email) ||
                         Object.values(p.allocatedUserEmails).some(e => typeof e === 'string' && e.toLowerCase().trim() === email);
      }
      const roleMatch = Boolean(p.projectRoles && typeof p.projectRoles === 'object' && Object.keys(p.projectRoles).some(k => k.toLowerCase().trim() === email));
      const assignedIdMatch = assignedIds.has(p.id);

      return ownerMatch || allocatedMatch || roleMatch || assignedIdMatch;
    });

    return filtered;
  }, [projects, user]);

  const userAssociatedProjectIds = useMemo(() => {
    return new Set(userAssociatedProjects.map(p => p.id));
  }, [userAssociatedProjects]);

  // Unified Data Aggregation focused on selection
  const displayProjects = useMemo(() => {
    if (selectedWorkspaceId === 'all') return userAssociatedProjects;
    return userAssociatedProjects.filter(p => p.id === selectedWorkspaceId);
  }, [selectedWorkspaceId, userAssociatedProjects]);

  // Filter logs based on 60-day retention, user associated projects, and selected project
  const filteredActivityLogs = useMemo(() => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    return realTimeLogs
      .filter(log => {
        const logDate = new Date(log.timestamp);
        const withinRetention = logDate > sixtyDaysAgo;

        // Ensure log belongs to a project where the user is associated
        const isUserProject = userAssociatedProjectIds.has(log.projectId);

        // Ensure log matches current dropdown selection
        const projectMatch = selectedWorkspaceId === 'all'
          ? isUserProject
          : (log.projectId === selectedWorkspaceId);

        return withinRetention && isUserProject && projectMatch;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [realTimeLogs, selectedWorkspaceId, userAssociatedProjectIds]);

  // Paginated View of Logs
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentLogPage - 1) * logsPerPage;
    return filteredActivityLogs.slice(startIndex, startIndex + logsPerPage);
  }, [filteredActivityLogs, currentLogPage]);

  const totalLogPages = Math.ceil(filteredActivityLogs.length / logsPerPage);

  const scenarioMetrics = useMemo(() => {
    const allScenarios = displayProjects.flatMap(p => p.scenarios || []);
    const allDeletedIds = displayProjects.flatMap(p => p.deletedItemIds || []);
    return getScenarioMetrics(allScenarios, allDeletedIds);
  }, [displayProjects]);
  
  const allAiCases = useMemo(() => {
    const caseMap = new Map<string, TestCase>();
    displayProjects.forEach(p => {
      const cases = getAiTestCases(p);
      cases.forEach(tc => {
        const key = tc.id || tc.testCaseId || `${p.id}_${tc.title}`;
        if (!caseMap.has(key)) {
          caseMap.set(key, tc);
        }
      });
    });
    return Array.from(caseMap.values());
  }, [displayProjects]);

  const allExecutionCases = useMemo(() => {
    const list: TestCase[] = [];
    displayProjects.forEach(project => {
      const activeIds = new Set(project.activeExecutionFolderIds || []);
      const excludedIds = new Set(project.excludedFromExecutionIds || []);
      
      (project.scenarios || []).forEach(s => {
        if (isApiTestingScenario(s)) return;
        if (s && s.scenarioId && ['TESTCASE_FOLDER', 'MANUAL_FOLDER'].includes(s.scenarioId) && activeIds.has(s.id) && !excludedIds.has(s.id)) {
          (s.testCases || []).forEach(tc => {
            if (tc && !excludedIds.has(tc.id) && !isApiTestingCase(tc)) {
              list.push(tc);
            }
          });
        }
      });
    });
    return list;
  }, [displayProjects]);

  const allScripts = useMemo(() => 
    displayProjects.flatMap(p => {
      const executionIds = new Set(p.automationExecutionIds || []);
      return (p.automationScripts || []).filter(s => executionIds.has(s.id));
    }), 
    [displayProjects]
  );
  const allApiSuites = useMemo(() => displayProjects.flatMap(p => p.apiTestSuites || []), [displayProjects]);
  const allPerfScripts = useMemo(() => displayProjects.flatMap(p => p.performanceScripts || []), [displayProjects]);

  const currentData = useMemo(() => {
    switch (qualityType) {
      case 'AI Scenarios': {
        const { total, approved, unapproved, functional, nonFunctional } = scenarioMetrics;
        
        return {
          title: 'AI Scenarios',
          chartType: 'pie',
          metrics: [
            { label: 'Total Scenarios', value: total, icon: <Layers />, color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
            { label: 'Approved Scenarios', value: approved, icon: <CheckCircle />, color: 'text-blue-600', bgColor: 'bg-blue-50' },
            { label: 'Unapproved Scenarios', value: unapproved, icon: <AlertTriangle />, color: 'text-amber-600', bgColor: 'bg-amber-50' },
            { label: 'Functional', value: functional, icon: <Activity />, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
            { label: 'Non-Functional', value: nonFunctional, icon: <Zap />, color: 'text-amber-600', bgColor: 'bg-amber-50' }
          ],
          chartData: [
            { name: 'Functional', value: functional, color: '#10b981' },
            { name: 'Non-Functional', value: nonFunctional, color: '#f59e0b' }
          ],
          health: total > 0 ? 'Active' : 'No Data',
          totalCount: total
        };
      }
      case 'AI Test Cases': {
        const functional = allAiCases.filter(c => c.testType === 'Functional').length;
        const nonFunctional = allAiCases.filter(c => c.testType === 'Non-Functional').length;
        const ui = allAiCases.filter(c => c.testType === 'UI').length;
        const total = allAiCases.length;

        return {
          title: 'AI Test Cases',
          chartType: 'bar',
          metrics: [
            { label: 'Total AI Cases', value: total, icon: <Sparkles />, color: 'text-violet-600', bgColor: 'bg-violet-50' },
            { label: 'Functional', value: functional, icon: <Layers />, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
            { label: 'Non-Functional', value: nonFunctional, icon: <Zap />, color: 'text-amber-600', bgColor: 'bg-amber-50' },
            { label: 'UI / UX', value: ui, icon: <LayoutGrid />, color: 'text-pink-600', bgColor: 'bg-pink-50' }
          ],
          chartData: [
            { name: 'Functional', value: functional, color: '#10b981' },
            { name: 'Non-Functional', value: nonFunctional, color: '#f59e0b' },
            { name: 'UI', value: ui, color: '#ec4899' }
          ],
          health: total > 0 ? 'Stable' : 'Empty',
          totalCount: total
        };
      }
      case 'Manual Test Case Execution': {
        const stats = getFunctionalExecutionStats(displayProjects);
        return {
          title: 'Functional Test Case Execution',
          chartType: 'pie',
          metrics: [
            { label: 'Not Started', value: stats.notStarted, icon: <Clock />, color: 'text-slate-500', bgColor: 'bg-slate-50' },
            { label: 'Pass', value: stats.pass, icon: <CheckCircle2 />, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
            { label: 'Fail', value: stats.fail, icon: <XCircle />, color: 'text-red-600', bgColor: 'bg-red-50' },
            { label: 'Blocked', value: stats.blocked, icon: <AlertCircle />, color: 'text-amber-600', bgColor: 'bg-amber-50' }
          ],
          chartData: [
            { name: 'Not Started', value: stats.notStarted, color: '#94a3b8' },
            { name: 'Pass', value: stats.pass, color: '#10b981' },
            { name: 'Fail', value: stats.fail, color: '#ef4444' },
            { name: 'Blocked', value: stats.blocked, color: '#f59e0b' }
          ],
          health: stats.total > 0 ? (stats.fail > stats.pass ? 'Critical' : 'Stable') : 'Waiting',
          totalCount: stats.total
        };
      }
      case 'Automation Test Script Execution': {
        const stats = getScriptExecutionStats(displayProjects);
        return {
          title: 'Automation Test Script Execution',
          chartType: 'bar',
          metrics: [
            { label: 'Not Started', value: stats.notStarted, icon: <Clock />, color: 'text-slate-500', bgColor: 'bg-slate-50' },
            { label: 'Pass', value: stats.pass, icon: <CheckCircle2 />, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
            { label: 'Fail', value: stats.fail, icon: <XCircle />, color: 'text-red-600', bgColor: 'bg-red-50' },
            { label: 'Blocked', value: stats.blocked, icon: <AlertTriangle />, color: 'text-amber-600', bgColor: 'bg-amber-50' }
          ],
          chartData: [
            { name: 'Not Started', value: stats.notStarted, color: '#94a3b8' },
            { name: 'Pass', value: stats.pass, color: '#10b981' },
            { name: 'Fail', value: stats.fail, color: '#ef4444' },
            { name: 'Blocked', value: stats.blocked, color: '#f59e0b' }
          ],
          health: stats.total > 0 ? 'Ready' : 'Draft',
          totalCount: stats.total
        };
      }
      case 'API Testing Execution': {
        const stats = getApiExecutionStats(displayProjects);
        return {
          title: 'API Testing Execution',
          chartType: 'pie',
          metrics: [
            { label: 'Not Started', value: stats.notStarted, icon: <Clock />, color: 'text-slate-500', bgColor: 'bg-slate-50' },
            { label: 'Pass', value: stats.pass, icon: <CheckCircle2 />, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
            { label: 'Fail', value: stats.fail, icon: <XCircle />, color: 'text-red-600', bgColor: 'bg-red-50' },
            { label: 'Blocked', value: stats.blocked, icon: <AlertCircle />, color: 'text-amber-600', bgColor: 'bg-amber-50' }
          ],
          chartData: [
            { name: 'Not Started', value: stats.notStarted, color: '#94a3b8' },
            { name: 'Pass', value: stats.pass, color: '#10b981' },
            { name: 'Fail', value: stats.fail, color: '#ef4444' },
            { name: 'Blocked', value: stats.blocked, color: '#f59e0b' }
          ],
          health: stats.total > 0 ? (stats.fail > stats.pass ? 'Critical' : 'Stable') : 'No Runs',
          totalCount: stats.total
        };
      }
      case 'Performance Testing Execution': {
        const stats = getPerformanceExecutionStats(displayProjects);
        return {
          title: 'Performance Testing Execution',
          chartType: 'bar',
          metrics: [
            { label: 'Not Started', value: stats.notStarted, icon: <Clock />, color: 'text-slate-500', bgColor: 'bg-slate-50' },
            { label: 'Pass', value: stats.pass, icon: <CheckCircle2 />, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
            { label: 'Fail', value: stats.fail, icon: <XCircle />, color: 'text-red-600', bgColor: 'bg-red-50' },
            { label: 'Blocked', value: stats.blocked, icon: <AlertTriangle />, color: 'text-amber-600', bgColor: 'bg-amber-50' }
          ],
          chartData: [
            { name: 'Not Started', value: stats.notStarted, color: '#94a3b8' },
            { name: 'Pass', value: stats.pass, color: '#10b981' },
            { name: 'Fail', value: stats.fail, color: '#ef4444' },
            { name: 'Blocked', value: stats.blocked, color: '#f59e0b' }
          ],
          health: stats.total > 0 ? 'Archived' : 'Empty',
          totalCount: stats.total
        };
      }
      default: return null;
    }
  }, [qualityType, scenarioMetrics, allAiCases, displayProjects]);

  const calculateRate = () => {
    if (currentData.totalCount === 0) return 0;
    switch (qualityType) {
      case 'AI Scenarios': {
        const functional = scenarioMetrics.functional;
        return Math.round((functional / currentData.totalCount) * 100);
      }
      case 'AI Test Cases': {
        const functional = allAiCases.filter(c => c.testType === 'Functional').length;
        return Math.round((functional / currentData.totalCount) * 100);
      }
      case 'Manual Test Case Execution':
      case 'Automation Test Script Execution':
      case 'API Testing Execution':
      case 'Performance Testing Execution': {
        const pass = currentData.metrics.find(m => m.label.toLowerCase() === 'pass' || m.label.toLowerCase() === 'passed')?.value || 0;
        return Math.round((pass / currentData.totalCount) * 100);
      }
      default: return 0;
    }
  };

  const selectedProjectName = useMemo(() => {
    if (selectedWorkspaceId === 'all') return 'All Projects';
    return userAssociatedProjects.find(p => p.id === selectedWorkspaceId)?.name || 'Project';
  }, [selectedWorkspaceId, userAssociatedProjects]);

  const getInitials = (name: string) => {
    if (!name || typeof name !== 'string') return 'AQ';
    return name.split(' ').map(n => n ? n[0] : '').join('').toUpperCase().substring(0, 2) || 'AQ';
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();
    const hours = date.getHours() % 12 || 12;
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = date.getHours() >= 12 ? 'PM' : 'AM';
    return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
  };

  if (!currentData) return null;

  const canViewLogs = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN || user.role === UserRole.DELIVERY_MANAGER;

  const rate = calculateRate();

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-700">
      {/* Header & Quality Selector Card */}
      <div className="bg-white p-8 rounded-[1.5rem] border border-slate-100 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">
              Dashboard
            </h2>
            <p className="text-xs text-teal-600 font-extrabold mt-1.5 uppercase tracking-widest">
              {selectedProjectName === 'all' ? 'All Projects' : selectedProjectName} · {qualityType === 'Manual Test Case Execution' ? 'Functional Test Case Execution' : qualityType} coverage
            </p>
          </div>
          
          <div className="flex flex-row gap-3 w-full md:w-auto">
            {/* Project Filter */}
            <div className="relative w-1/2 md:w-[220px]">
              <select 
                value={selectedWorkspaceId || ''}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="w-full pl-4 pr-10 py-3.5 bg-teal-50/60 border border-teal-100 rounded-xl text-[10px] font-black text-[#009B87] uppercase tracking-widest outline-none hover:bg-teal-100/50 transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Projects</option>
                {userAssociatedProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#009B87] pointer-events-none" size={16} />
            </div>

            {/* Metrics Filter */}
            <div className="relative w-1/2 md:w-[240px]">
              <select 
                value={qualityType || ''}
                onChange={(e) => setQualityType(e.target.value as QualityType)}
                className="w-full pl-4 pr-10 py-3.5 bg-teal-50/60 border border-teal-100 rounded-xl text-[10px] font-black text-[#009B87] uppercase tracking-widest outline-none hover:bg-teal-100/50 transition-all appearance-none cursor-pointer"
              >
                <option value="AI Scenarios">AI Scenarios</option>
                <option value="AI Test Cases">AI Test Cases</option>
                <option value="Manual Test Case Execution">Functional Test Case Execution</option>
                <option value="Automation Test Script Execution">Automation Test Script Execution</option>
                <option value="API Testing Execution">API Testing Execution</option>
                <option value="Performance Testing Execution">Performance Testing Execution</option>
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#009B87] pointer-events-none" size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Section */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Items Tracked Tile */}
          <div className="bg-white p-8 rounded-[1.8rem] border border-slate-100 shadow-sm flex flex-col justify-between min-h-[300px]">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#009B87] block mb-2">Items Tracked</span>
                <h3 className="text-8xl font-black text-slate-900 tracking-tighter leading-none mt-2">
                  {currentData.totalCount}
                </h3>
              </div>
              
              <div className="flex items-center gap-4 mt-6">
                <div className="bg-[#00E1C5]/10 p-3.5 rounded-xl text-[#009B87]">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="text-xs font-extrabold text-slate-800 tracking-tight">Workspace assets</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Verified & Synced</p>
                </div>
              </div>
          </div>

          {/* Chart Section */}
          <div className="lg:col-span-2 bg-[#09121F] p-8 rounded-[1.8rem] border border-slate-800/60 shadow-lg flex flex-col md:flex-row items-center justify-between min-h-[300px]">
            {/* Left Info Column */}
            <div className="flex flex-col justify-between h-full w-full md:w-1/2 space-y-6">
              <div>
                <h4 className="text-[#00E1C5] text-[10px] font-black uppercase tracking-widest">{currentData.title}</h4>
              </div>
              
              <div className="space-y-3.5 py-4">
                {(['Manual Test Case Execution', 'Automation Test Script Execution', 'API Testing Execution', 'Performance Testing Execution'].includes(qualityType) ? currentData.metrics : currentData.metrics.slice(1)).map((metric, idx) => {
                  let dotColor = 'bg-indigo-500';
                  const labelLower = metric.label.toLowerCase();
                  if (labelLower === 'not started' || labelLower === 'not executed') {
                    dotColor = 'bg-slate-400';
                  } else if (labelLower === 'pass' || labelLower === 'passed' || (labelLower.includes('functional') && !labelLower.includes('non'))) {
                    dotColor = 'bg-emerald-500';
                  } else if (labelLower === 'fail' || labelLower === 'failed') {
                    dotColor = 'bg-red-500';
                  } else if (labelLower === 'blocked' || labelLower.includes('non-functional')) {
                    dotColor = 'bg-amber-500';
                  } else if (labelLower.includes('approved')) {
                    dotColor = 'bg-indigo-500';
                  }
                  
                  return (
                    <div key={idx} className="flex items-center justify-between max-w-[240px]">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                        <span className="text-xs font-bold text-slate-300">{metric.label}</span>
                      </div>
                      <span className="text-sm font-extrabold text-white">{metric.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Right Gauge Column */}
            <div className="w-full md:w-1/2 flex items-center justify-center mt-6 md:mt-0">
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <defs>
                    <linearGradient id="gaugeGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#2dd4bf" />
                      <stop offset="100%" stopColor="#00E1C5" />
                    </linearGradient>
                  </defs>
                  
                  {/* Outer speedometer ticks radiating around the center */}
                  <g transform="translate(50, 50)">
                    {Array.from({ length: 40 }).map((_, i) => {
                      const angle = i * 9;
                      return (
                        <line
                          key={i}
                          x1="0"
                          y1="-44"
                          x2="0"
                          y2="-41"
                          stroke="#1e293b"
                          strokeWidth="0.8"
                          transform={`rotate(${angle})`}
                        />
                      );
                    })}
                  </g>

                  {/* Gray background ring track */}
                  <circle
                    cx="50"
                    cy="50"
                    r="34"
                    fill="transparent"
                    stroke="#1e293b/40"
                    strokeWidth="5"
                  />

                  {/* Active progress arc colored dynamically */}
                  <circle
                    cx="50"
                    cy="50"
                    r="34"
                    fill="transparent"
                    stroke="url(#gaugeGradient)"
                    strokeWidth="5"
                    strokeDasharray={2 * Math.PI * 34}
                    strokeDashoffset={2 * Math.PI * 34 * (1 - rate / 100)}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                
                {/* Center text for percentage display */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center mt-1">
                  <span className="text-3xl font-extrabold text-white tracking-tighter leading-none">
                    {rate}%
                  </span>
                  <span className="text-[7px] text-slate-400 font-extrabold uppercase tracking-widest mt-1">
                    PASS RATE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic bottom metrics row (always 4 stat cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {currentData.metrics.map((metric, idx) => {
            let barColor = 'bg-cyan-500';
            let iconBg = 'bg-cyan-50';
            let iconText = 'text-cyan-600';
            let progressWidth = '0%';

            const labelLower = metric.label.toLowerCase();
            if (labelLower === 'not started' || labelLower === 'not executed') {
              barColor = 'bg-slate-400';
              iconBg = 'bg-slate-100';
              iconText = 'text-slate-500';
              progressWidth = currentData.totalCount > 0 ? `${(metric.value / currentData.totalCount) * 100}%` : '0%';
            } else if (labelLower === 'pass' || labelLower === 'passed' || (labelLower.includes('functional') && !labelLower.includes('non'))) {
              barColor = 'bg-[#10b981]';
              iconBg = 'bg-emerald-50';
              iconText = 'text-emerald-600';
              progressWidth = currentData.totalCount > 0 ? `${(metric.value / currentData.totalCount) * 100}%` : '0%';
            } else if (labelLower === 'fail' || labelLower === 'failed') {
              barColor = 'bg-red-500';
              iconBg = 'bg-red-50';
              iconText = 'text-red-600';
              progressWidth = currentData.totalCount > 0 ? `${(metric.value / currentData.totalCount) * 100}%` : '0%';
            } else if (labelLower === 'blocked') {
              barColor = 'bg-amber-500';
              iconBg = 'bg-amber-50';
              iconText = 'text-amber-600';
              progressWidth = currentData.totalCount > 0 ? `${(metric.value / currentData.totalCount) * 100}%` : '0%';
            } else if (labelLower.includes('total') || idx === 0) {
              barColor = 'bg-[#00E1C5]';
              iconBg = 'bg-teal-50';
              iconText = 'text-teal-600';
              progressWidth = '100%';
            } else if (labelLower.includes('non-functional')) {
              barColor = 'bg-amber-500';
              iconBg = 'bg-amber-50';
              iconText = 'text-amber-600';
              progressWidth = currentData.totalCount > 0 ? `${(metric.value / currentData.totalCount) * 100}%` : '0%';
            } else {
              barColor = 'bg-indigo-500';
              iconBg = 'bg-[#f0f0ff]';
              iconText = 'text-indigo-600';
              progressWidth = currentData.totalCount > 0 ? `${(metric.value / currentData.totalCount) * 100}%` : '0%';
            }

            return (
              <div key={idx} className="bg-white p-6 rounded-[1.8rem] border border-slate-100 shadow-sm transition-all hover:shadow-md group relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-xl ${iconBg} ${iconText} group-hover:scale-105 transition-transform`}>
                      {metric.icon}
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">{metric.label}</p>
                      <p className="text-3xl font-extrabold text-slate-800 tracking-tight mt-0.5">{metric.value}</p>
                    </div>
                </div>
                {/* Solid bottom indicator line */}
                <div className={`absolute bottom-0 left-0 right-0 h-1.5 ${barColor}`} />
              </div>
            );
          })}
        </div>
      </div>

      {/* User Activity Log Section */}
      {canViewLogs && (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-bottom-10 duration-700">
           <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#00E1C5] rounded-[1.2rem] text-white shadow-lg shadow-teal-100">
                    <History size={24} />
                </div>
                <div>
                    <h3 className="text-xl font-black text-black uppercase tracking-tight">Activity Logs</h3>
                </div>
              </div>
              <div className="px-4 py-2 bg-teal-50 border border-teal-100 rounded-full flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                 <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest">Real-time Sync</span>
              </div>
           </div>

           <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/30 text-[11px] font-black text-[#009B87] uppercase tracking-widest border-b border-slate-100">
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Project</th>
                    <th className="px-6 py-4">Action / Event</th>
                    <th className="px-6 py-4 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                   {filteredActivityLogs.length === 0 ? (
                     <tr>
                       <td colSpan={4} className="px-6 py-12 text-center">
                          <div className="flex flex-col items-center justify-center opacity-30">
                             <div className="p-6 bg-slate-100 rounded-full mb-4">
                                <Clock size={48} className="text-slate-300" />
                             </div>
                             <p className="text-sm font-black uppercase tracking-widest text-slate-500 max-w-sm">
                                No active events found within the governance retention cycle.
                             </p>
                          </div>
                       </td>
                     </tr>
                   ) : (
                     paginatedLogs.map((log) => (
                       <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                         <td className="px-6 py-3">
                            <div className="flex items-center gap-4">
                              {(() => {
                                const cleanUserName = formatUserName(log.userName, log.userEmail);
                                const currentUserCleanName = formatUserName(user?.name, user?.email);
                                const isMe = (log.userEmail && user?.email && log.userEmail.toLowerCase().trim() === user.email.toLowerCase().trim()) ||
                                             (cleanUserName.toLowerCase() === currentUserCleanName.toLowerCase());

                                return (
                                  <>
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black shadow-sm flex-shrink-0 transition-transform group-hover:scale-105 ${isMe ? 'bg-teal-50 border border-teal-100 text-teal-600' : 'bg-slate-100 text-slate-500'}`}>
                                       {getInitials(cleanUserName)}
                                    </div>
                                    <div className="min-w-0">
                                       <p className="text-sm font-black text-slate-800 uppercase tracking-tight leading-none truncate max-w-[150px]">{cleanUserName}</p>
                                       {isMe && <span className="text-[8px] font-black text-teal-500 uppercase tracking-widest mt-1 inline-block">Me</span>}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                         </td>
                         <td className="px-10 py-5">
                            <div className="flex items-center gap-2">
                               <Briefcase size={12} className="text-teal-500" />
                               <span className="text-[11px] font-bold text-[#009B87] uppercase tracking-tighter truncate max-w-[150px]">{log.projectName}</span>
                            </div>
                         </td>
                         <td className="px-10 py-5">
                            <div className="flex items-center gap-3">
                               <div className="p-1.5 bg-teal-50 rounded-lg text-teal-500"><MessageSquare size={12} /></div>
                               <p className="text-xs font-medium text-slate-600 leading-relaxed">{log.action}</p>
                            </div>
                         </td>
                         <td className="px-6 py-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                               <div className="flex items-center gap-1.5 text-[11px] text-slate-700 font-bold uppercase">
                                  <Calendar size={12} className="text-slate-300" />
                                  {formatDate(log.timestamp).split(',')[0]}
                               </div>
                               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formatDate(log.timestamp).split(',')[1]}</span>
                            </div>
                         </td>
                       </tr>
                     ))
                   )}
                </tbody>
              </table>
           </div>

           {totalLogPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/20 flex items-center justify-between">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Showing {((currentLogPage - 1) * logsPerPage) + 1} - {Math.min(currentLogPage * logsPerPage, filteredActivityLogs.length)} of {filteredActivityLogs.length} Events
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={currentLogPage === 1}
                    onClick={() => setCurrentLogPage(p => Math.max(1, p - 1))}
                    className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="flex items-center gap-1 px-3">
                     <span className="text-xs font-black text-teal-600">{currentLogPage}</span>
                     <span className="text-xs font-bold text-slate-300">/</span>
                     <span className="text-xs font-bold text-slate-400">{totalLogPages}</span>
                  </div>
                  <button 
                    disabled={currentLogPage === totalLogPages}
                    onClick={() => setCurrentLogPage(p => Math.min(totalLogPages, p + 1))}
                    className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
           )}
           
           <div className="p-8 bg-slate-900 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4 text-white">
                 <div className="p-2 bg-teal-500/20 rounded-lg"><Activity size={16} className="text-[#00E1C5]" /></div>
                 <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">Live Monitoring</p>
                    <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Records are strictly retained for 60-day governance cycles</p>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Total Log Volume</span>
                 <span className="bg-[#00E1C5] text-slate-900 text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg uppercase tracking-wider">{filteredActivityLogs.length} EVENTS</span>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;