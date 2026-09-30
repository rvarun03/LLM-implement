import React, { useState, useMemo, useEffect } from 'react';
import { 
  Coins, 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Zap, 
  ShieldCheck, 
  Cpu, 
  DollarSign, 
  TrendingUp, 
  CheckCircle2, 
  Info, 
  Sparkles, 
  Layers, 
  Sliders,
  Plus, 
  Trash2,
  Clock,
  UserCheck,
  Building2,
  Lock,
  ChevronDown,
  ArrowUpDown,
  Briefcase,
  CheckSquare,
  Square,
  FileText,
  Image as ImageIcon,
  Video,
  Globe,
  FileCode,
  AlertTriangle,
  Terminal,
  X
} from 'lucide-react';
import { User, UserRole, TokenLog, Project } from '../types';
import { 
  getTokenLogs, 
  addTokenLog, 
  deleteTokenLog,
  deleteTokenLogs,
  resetDefaultTokenLogs, 
  clearAllTokenLogs, 
  subscribeToFirestoreTokenLogs,
  FEATURE_PRICING_RATES, 
  GEMINI_38_FLASH_MODEL,
  GEMINI_38_FLASH_INPUT_RATE_PER_1K,
  GEMINI_38_FLASH_OUTPUT_RATE_PER_1K,
  GEMINI_38_FLASH_CACHED_INPUT_RATE_PER_1K,
  formatDollarCost,
  calculateTokenCostUsd,
  calculateInputTier,
  formatToIST,
  AUTOMATIQA_MODULES
} from '../services/tokenConsumptionService';

interface TokenConsumptionProps {
  currentUser: User;
  activeProject?: Project | null;
  projects?: Project[];
}

export const TokenConsumption: React.FC<TokenConsumptionProps> = ({ currentUser, activeProject, projects = [] }) => {
  // Access Guard: Only Super Admin is permitted to view this page
  const isAuthorized = 
    currentUser?.role === UserRole.SUPER_ADMIN || 
    (currentUser?.role as string) === 'Super Admin' ||
    currentUser?.email?.toLowerCase().trim() === 'shanmugapriya@qaoncloud.com' ||
    currentUser?.email?.toLowerCase().trim() === 'vinuta@qaoncloud.com';

  const [logs, setLogs] = useState<TokenLog[]>(() => getTokenLogs());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>('All');
  const [selectedFeature, setSelectedFeature] = useState<string>('All');
  const [selectedTier, setSelectedTier] = useState<string>('All');
  const [selectedCacheStatus, setSelectedCacheStatus] = useState<string>('All');
  const [sortField, setSortField] = useState<'timestamp' | 'costUsd' | 'totalTokens'>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'consumption_table' | 'rate_card'>('consumption_table');

  // Selection and Delete States
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    open: boolean;
    ids: string[];
    title: string;
    message: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Simulation form states
  const [simFeature, setSimFeature] = useState(FEATURE_PRICING_RATES[0].feature);
  const [simProject, setSimProject] = useState<string>(activeProject?.name || projects[0]?.name || 'Global Retail Banking App');
  const [simUser, setSimUser] = useState(currentUser?.name || 'Shanmugapriya');
  const [simModality, setSimModality] = useState<'Text' | 'Screenshot' | 'Video' | 'Document' | 'URL' | 'Multimodal'>('Multimodal');
  const [simModalityDetails, setSimModalityDetails] = useState('25 User Stories (Text) + Wireframe Screenshots');
  const [simInputCount, setSimInputCount] = useState<number>(25);
  const [simOutputType, setSimOutputType] = useState('7 Test Scenarios');
  const [simItemsGenerated, setSimItemsGenerated] = useState(7);
  const [simInputTokens, setSimInputTokens] = useState(2624);
  const [simOutputTokens, setSimOutputTokens] = useState(1140);
  const [simCached, setSimCached] = useState(false);
  const [simResponseTime, setSimResponseTime] = useState(2.18);

  // Synchronize simProject if activeProject changes
  useEffect(() => {
    if (activeProject?.name) {
      setSimProject(activeProject.name);
    }
  }, [activeProject?.name]);

  // Subscribe to live Firestore database updates for token consumption logs
  useEffect(() => {
    const unsubscribe = subscribeToFirestoreTokenLogs((updatedLogs) => {
      setLogs(updatedLogs);
    });

    const handleUpdate = () => {
      setLogs(getTokenLogs());
    };

    window.addEventListener('token-consumption-updated', handleUpdate);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      window.removeEventListener('token-consumption-updated', handleUpdate);
    };
  }, []);

  // Projects list for filtering
  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    if (activeProject?.name) set.add(activeProject.name);
    projects.forEach(p => { if (p.name) set.add(p.name); });
    logs.forEach(l => { if (l.project) set.add(l.project); });
    return ['All', ...Array.from(set)];
  }, [logs, projects, activeProject]);

  // Normalizer for feature names to ensure 'AI Test Assistant' is renamed to 'API Performance Testing'
  const normalizeFeatureName = (feat?: string): string => {
    if (!feat) return '';
    if (feat === 'AI Test Assistant' || feat.toLowerCase().includes('test assistant')) {
      return 'API Performance Testing';
    }
    if (feat === 'API performance testing' || feat.toLowerCase() === 'api performance testing') {
      return 'API Performance Testing';
    }
    return feat;
  };

  // Features list for filtering with 'AI Test Assistant' renamed to 'API Performance Testing'
  const featureOptions = useMemo(() => {
    const set = new Set<string>();
    // Add all 9 standard AutomatiQA features
    AUTOMATIQA_MODULES.forEach(m => {
      set.add(normalizeFeatureName(m.name));
    });
    // Add from logs
    logs.forEach(l => {
      if (l.feature) set.add(normalizeFeatureName(l.feature));
    });
    return ['All', ...Array.from(set)];
  }, [logs]);

  // Filtered and Sorted Logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter(log => {
        const normFeat = normalizeFeatureName(log.feature);
        const matchesSearch = 
          log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
          normFeat.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.feature.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.date.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (log.inputModalityDetails && log.inputModalityDetails.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (log.outputType && log.outputType.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesProject = selectedProject === 'All' || log.project === selectedProject;
        const matchesFeature = selectedFeature === 'All' || 
          normFeat === selectedFeature || 
          log.feature === selectedFeature ||
          (selectedFeature === 'API Performance Testing' && (log.feature === 'AI Test Assistant' || log.feature === 'API performance testing'));
        
        const matchesTier = selectedTier === 'All' || calculateInputTier(log).tier === selectedTier;
        const matchesCache = 
          selectedCacheStatus === 'All' || 
          (selectedCacheStatus === 'Cached' && log.cached) ||
          (selectedCacheStatus === 'Uncached' && !log.cached);

        return matchesSearch && matchesProject && matchesFeature && matchesTier && matchesCache;
      })
      .sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        if (sortDirection === 'asc') return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });
  }, [logs, searchTerm, selectedProject, selectedFeature, selectedTier, selectedCacheStatus, sortField, sortDirection]);

  // Selection helpers
  const isAllFilteredSelected = filteredLogs.length > 0 && filteredLogs.every(l => selectedLogIds.includes(l.id));
  const isSomeFilteredSelected = filteredLogs.some(l => selectedLogIds.includes(l.id)) && !isAllFilteredSelected;

  const handleToggleSelect = (id: string) => {
    setSelectedLogIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const filteredIdSet = new Set(filteredLogs.map(l => l.id));
      setSelectedLogIds(prev => prev.filter(id => !filteredIdSet.has(id)));
    } else {
      const combined = new Set([...selectedLogIds, ...filteredLogs.map(l => l.id)]);
      setSelectedLogIds(Array.from(combined));
    }
  };

  const handleDeleteSingle = (log: TokenLog) => {
    setDeleteConfirmModal({
      open: true,
      ids: [log.id],
      title: 'Delete Token Consumption Record',
      message: `Are you sure you want to delete this token log for "${log.feature}" by ${log.user} (${log.date})?`
    });
  };

  const handleDeleteSelected = () => {
    if (selectedLogIds.length === 0) return;
    setDeleteConfirmModal({
      open: true,
      ids: [...selectedLogIds],
      title: `Delete ${selectedLogIds.length} Selected Record${selectedLogIds.length > 1 ? 's' : ''}`,
      message: `Are you sure you want to delete ${selectedLogIds.length} selected token consumption record${selectedLogIds.length > 1 ? 's' : ''}? This action cannot be undone.`
    });
  };

  const handleClearAllLogs = () => {
    if (logs.length === 0) return;
    setDeleteConfirmModal({
      open: true,
      ids: logs.map(l => l.id),
      title: 'Delete All Token Consumption Records',
      message: `Are you sure you want to permanently delete all ${logs.length} token consumption log records? This will delete them from the database and the table will remain empty until new logs are generated.`
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmModal || deleteConfirmModal.ids.length === 0) return;
    setIsDeleting(true);
    const idsToDelete = deleteConfirmModal.ids;
    try {
      if (idsToDelete.length === logs.length && logs.length > 0 && idsToDelete.every(id => logs.some(l => l.id === id))) {
        await clearAllTokenLogs();
        setLogs([]);
        setSelectedLogIds([]);
      } else if (idsToDelete.length === 1) {
        await deleteTokenLog(idsToDelete[0]);
        setLogs(prev => prev.filter(l => l.id !== idsToDelete[0]));
        setSelectedLogIds(prev => prev.filter(id => id !== idsToDelete[0]));
      } else {
        await deleteTokenLogs(idsToDelete);
        const idSet = new Set(idsToDelete);
        setLogs(prev => prev.filter(l => !idSet.has(l.id)));
        setSelectedLogIds(prev => prev.filter(id => !idSet.has(id)));
      }
    } catch (err) {
      console.error("Failed to delete token logs:", err);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmModal(null);
    }
  };

  // Input & Output details formatters
  const getInputTypeIcon = (modality?: string) => {
    switch (modality) {
      case 'Screenshot':
        return <ImageIcon size={11} className="text-blue-600 shrink-0" />;
      case 'Video':
        return <Video size={11} className="text-rose-600 shrink-0" />;
      case 'Document':
        return <FileText size={11} className="text-amber-600 shrink-0" />;
      case 'URL':
        return <Globe size={11} className="text-teal-600 shrink-0" />;
      case 'Multimodal':
        return <Layers size={11} className="text-indigo-600 shrink-0" />;
      default:
        return <FileCode size={11} className="text-slate-600 shrink-0" />;
    }
  };

  const getInputBadgeStyle = (modality?: string) => {
    switch (modality) {
      case 'Screenshot':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Video':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Document':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'URL':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'Multimodal':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Multi-type input parser to display structured chips for multiple types of input
  const parseInputComponents = (summary: string, modality?: string) => {
    // Split by +, &, or 'and'
    const rawParts = summary.split(/\s*(?:\+|\band\b|&)\s*/i).map(p => p.trim()).filter(Boolean);
    
    return rawParts.map(part => {
      const lower = part.toLowerCase();
      let type = 'Text';
      let icon = <FileCode size={10} className="text-slate-600 shrink-0" />;
      let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';

      if (lower.includes('screenshot') || lower.includes('image') || lower.includes('wireframe') || lower.includes('ui mockup') || lower.includes('vision')) {
        type = 'Vision/Screenshot';
        icon = <ImageIcon size={10} className="text-blue-600 shrink-0" />;
        badgeClass = 'bg-blue-50 text-blue-700 border-blue-200';
      } else if (lower.includes('doc') || lower.includes('page') || lower.includes('pdf') || lower.includes('docx') || lower.includes('spec') || lower.includes('brd')) {
        type = 'Document';
        icon = <FileText size={10} className="text-amber-600 shrink-0" />;
        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
      } else if (lower.includes('video') || lower.includes('recording') || lower.includes('screen record')) {
        type = 'Video';
        icon = <Video size={10} className="text-rose-600 shrink-0" />;
        badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
      } else if (lower.includes('url') || lower.includes('http') || lower.includes('link') || lower.includes('web')) {
        type = 'Live URL';
        icon = <Globe size={10} className="text-teal-600 shrink-0" />;
        badgeClass = 'bg-teal-50 text-teal-700 border-teal-200';
      } else if (lower.includes('api') || lower.includes('swagger') || lower.includes('openapi') || lower.includes('curl') || lower.includes('endpoint') || lower.includes('jmx')) {
        type = 'API Spec / Config';
        icon = <Terminal size={10} className="text-emerald-600 shrink-0" />;
        badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      } else if (lower.includes('story') || lower.includes('prompt') || lower.includes('scenario') || lower.includes('requirement')) {
        type = 'Requirements';
        icon = <FileCode size={10} className="text-indigo-600 shrink-0" />;
        badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-200';
      }

      return { text: part, type, icon, badgeClass };
    });
  };

  const getInputDetailsFormatted = (log: TokenLog): string => {
    if (log.inputModalityDetails) return log.inputModalityDetails;
    if (log.inputModality === 'Multimodal') {
      return '1 User Story (Text) + 3 Screenshots';
    }
    if (log.inputModality === 'Screenshot') {
      return '3 Screenshots (Vision)';
    }
    if (log.inputModality === 'Document') {
      return '1 Spec Document (PDF/DOCX)';
    }
    if (log.inputModality === 'URL') {
      return '1 Live Target URL';
    }
    if (log.inputModality === 'Video') {
      return '1 Video Recording';
    }
    const matchingRate = FEATURE_PRICING_RATES.find(r => r.feature === log.feature);
    if (matchingRate?.inputTypes && matchingRate.inputTypes.length > 0) {
      return matchingRate.inputTypes.join(' + ');
    }
    return '1 User Story (Text)';
  };

  const getOutputDetailsFormatted = (log: TokenLog): { count: number; countLabel: string; label: string } => {
    const count = log.itemsGenerated !== undefined && log.itemsGenerated > 0 
      ? log.itemsGenerated 
      : (log.creditsConsumed ? log.creditsConsumed : 1);

    let label = log.outputType;
    if (!label) {
      const matchingRate = FEATURE_PRICING_RATES.find(r => r.feature === log.feature);
      label = matchingRate?.outputType || `${count} Test Artefacts`;
    }

    let unit = 'Artefacts';
    const feat = log.feature.toLowerCase();
    if (feat.includes('scenario')) unit = 'Scenarios';
    else if (feat.includes('test case')) unit = 'Test Cases';
    else if (feat.includes('user stor')) unit = 'User Stories';
    else if (feat.includes('script')) unit = 'Script';
    else if (feat.includes('ui test')) unit = 'Reports';
    else if (feat.includes('performance')) unit = 'Load Plans';
    else if (feat.includes('api')) unit = 'Test Suites';
    else if (feat.includes('user generator') || feat.includes('synthetic')) unit = 'User Profiles';

    return { 
      count, 
      countLabel: `${count} ${unit} Generated`,
      label 
    };
  };

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalCost = filteredLogs.reduce((acc, log) => acc + log.costUsd, 0);
    const totalInputTokens = filteredLogs.reduce((acc, log) => acc + log.inputTokens, 0);
    const totalOutputTokens = filteredLogs.reduce((acc, log) => acc + log.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const cachedCount = filteredLogs.filter(l => l.cached).length;
    const cacheHitRate = filteredLogs.length > 0 ? (cachedCount / filteredLogs.length) * 100 : 0;
    const avgResponseTime = filteredLogs.length > 0 
      ? filteredLogs.reduce((acc, log) => acc + log.responseTimeSeconds, 0) / filteredLogs.length 
      : 0;
    
    // Calculate total dollar savings from cache hit
    const estimatedUncachedCost = filteredLogs.reduce((acc, log) => {
      return acc + calculateTokenCostUsd(log.inputTokens, log.outputTokens, false);
    }, 0);
    const totalCacheSavings = Math.max(0, estimatedUncachedCost - totalCost);

    return {
      totalCost,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      cachedCount,
      cacheHitRate,
      avgResponseTime,
      totalCacheSavings,
      totalRequests: filteredLogs.length
    };
  }, [filteredLogs]);

  const toggleSort = (field: 'timestamp' | 'costUsd' | 'totalTokens') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Date & Time (IST)',
      'User',
      'Project',
      'Feature',
      'Given Input Modality',
      'Given Input Details',
      'Given Input Count',
      'Tier',
      'Output Generated Count',
      'Output Generated Details',
      'Model',
      'Input Tokens',
      'Output Tokens',
      'Total Tokens',
      'Cost (USD)',
      'Response Time (s)',
      'Cache'
    ];
    const rows = filteredLogs.map(l => {
      const out = getOutputDetailsFormatted(l);
      const tierInfo = calculateInputTier(l);
      const istDate = formatToIST(l.timestamp || l.date);
      return [
        `"${istDate}"`,
        `"${l.user}"`,
        `"${l.project}"`,
        `"${l.feature}"`,
        `"${l.inputModality || 'Text'}"`,
        `"${(getInputDetailsFormatted(l) || '').replace(/"/g, '""')}"`,
        tierInfo.count,
        `"${tierInfo.tier}"`,
        out.count,
        `"${(out.label || '').replace(/"/g, '""')}"`,
        `"${l.model}"`,
        l.inputTokens,
        l.outputTokens,
        l.totalTokens,
        `"$${l.costUsd.toFixed(6)}"`,
        `"${l.responseTimeSeconds} s"`,
        l.cached ? 'Yes' : 'No'
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Gemini_38_Flash_Token_Consumption_IST_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetLogs = () => {
    if (window.confirm('Reset token consumption logs back to default sample records?')) {
      const resetData = resetDefaultTokenLogs();
      setLogs(resetData);
      setSelectedLogIds([]);
    }
  };

  const handleSimulateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newLog = addTokenLog({
      user: simUser,
      project: simProject,
      feature: simFeature,
      inputModality: simModality,
      inputModalityDetails: simModalityDetails,
      inputCount: Number(simInputCount),
      outputType: simOutputType,
      itemsGenerated: Number(simItemsGenerated),
      model: GEMINI_38_FLASH_MODEL,
      inputTokens: Number(simInputTokens),
      outputTokens: Number(simOutputTokens),
      responseTimeSeconds: Number(simResponseTime),
      cached: simCached
    });
    setLogs(prev => [newLog, ...prev]);
    setIsSimulateModalOpen(false);
  };

  // Restricted Access Screen for non-Admin/non-Super-Admin roles
  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] bg-white rounded-[3rem] p-12 border border-slate-200/60 shadow-xl text-center animate-in fade-in duration-300">
        <div className="w-24 h-24 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mb-6 shadow-inner border border-rose-100">
          <Lock size={48} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Access Restricted</h2>
        <p className="text-sm text-slate-500 font-medium max-w-md mb-8 leading-relaxed">
          The <span className="font-bold text-slate-800">Token Consumption & Dollar Cost Analytics</span> page is restricted to <span className="font-bold text-indigo-600">Admin</span> and <span className="font-bold text-indigo-600">Super Admin</span> roles only.
        </p>
        <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600 flex items-center gap-3">
          <ShieldCheck size={18} className="text-rose-500" />
          <span>Current Role: <strong className="uppercase text-slate-900">{currentUser?.role || 'Team Member'}</strong></span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-400">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 opacity-10 pointer-events-none">
          <Coins size={320} className="text-indigo-300" />
        </div>
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-[#00E1C5]/10 border border-[#00E1C5]/30 text-[#00E1C5] text-[10px] font-black uppercase tracking-widest px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
                <Cpu size={14} /> Gemini 3.8 Flash Engine
              </span>
              <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
                <ShieldCheck size={14} /> Authorized: {currentUser.role}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              Token Consumption & Cost Analytics
            </h1>
            <p className="text-slate-300 text-sm mt-2 max-w-2xl font-medium leading-relaxed">
              Real-time dollar cost breakdown and token utilization tracking for <strong className="text-white">Gemini 3.8 Flash</strong> across all features in AutomatiQA.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <button
              onClick={() => setIsSimulateModalOpen(true)}
              className="px-5 py-3 bg-[#00E1C5] text-slate-950 hover:bg-[#00cbb2] rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-[#00E1C5]/20 flex items-center gap-2 active:scale-95"
            >
              <Plus size={16} /> Simulate Token Log
            </button>
            <button
              onClick={handleExportCSV}
              className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2"
            >
              <Download size={16} /> Export CSV
            </button>
            {logs.length > 0 && (
              <button
                onClick={handleClearAllLogs}
                title="Permanently delete all token consumption records"
                className="px-4 py-3 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-rose-200 border border-rose-500/30 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95"
              >
                <Trash2 size={15} /> Clear All
              </button>
            )}
            <button
              onClick={handleResetLogs}
              title="Reset token logs to default sample records"
              className="p-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-2xl transition-all"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 bg-slate-200/60 p-1.5 rounded-2xl">
          <button
            onClick={() => setActiveTab('consumption_table')}
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'consumption_table'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Coins size={16} className={activeTab === 'consumption_table' ? 'text-indigo-600' : ''} />
            Token Consumption Log Table
          </button>
          <button
            onClick={() => setActiveTab('rate_card')}
            className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'rate_card'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign size={16} className={activeTab === 'rate_card' ? 'text-emerald-600' : ''} />
            Per-Token Rate Card (By Feature)
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-500 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
          <Info size={14} className="text-indigo-500" />
          <span>All costs calculated in <strong>USD ($)</strong> based on <strong>Gemini Paid Tier</strong> rates ($1.50/1M Input, $7.50/1M Output, $0.15/1M Context Caching)</span>
        </div>
      </div>

      {/* SECTION 1: PER-TOKEN PRICING RATE CARD & FEATURE BREAKDOWN */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-6">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 text-xs font-black uppercase tracking-widest mb-1">
              <Zap size={14} /> Gemini 3.8 Flash Pricing Specifications (Paid Tier)
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Per-Token Pricing Rate Card (By Feature)
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Paid Tier token rates and expected average cost breakdown per 1M tokens in USD
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="text-center px-3 border-r border-slate-200">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Input Tokens Rate</p>
              <p className="text-sm font-black text-slate-900">$1.50 / 1M <span className="text-[10px] text-slate-500 font-normal">($0.0015/1K)</span></p>
            </div>
            <div className="text-center px-3 border-r border-slate-200">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Output Tokens Rate</p>
              <p className="text-sm font-black text-slate-900">$7.50 / 1M <span className="text-[10px] text-slate-500 font-normal">($0.0075/1K)</span></p>
            </div>
            <div className="text-center px-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Context Cache Input</p>
              <p className="text-sm font-black text-emerald-600">$0.15 / 1M <span className="text-[10px] text-emerald-700 font-normal">($0.00015/1K)</span></p>
            </div>
          </div>
        </div>

        {/* Feature Rates Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-200">
                <th className="py-4 px-6">Feature</th>
                <th className="py-4 px-4">Model</th>
                <th className="py-4 px-4 text-right">Input Rate (1K)</th>
                <th className="py-4 px-4 text-right">Output Rate (1K)</th>
                <th className="py-4 px-4 text-right">Avg Input Tokens</th>
                <th className="py-4 px-4 text-right">Avg Output Tokens</th>
                <th className="py-4 px-4 text-right">Avg Cost / Call</th>
                <th className="py-4 px-6">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {FEATURE_PRICING_RATES.map((rate, idx) => (
                <tr key={idx} className="hover:bg-indigo-50/30 transition-colors group">
                  <td className="py-4 px-6 font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    {rate.feature}
                  </td>
                  <td className="py-4 px-4">
                    <span className="bg-slate-100 border border-slate-200 text-slate-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full">
                      {rate.model}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right font-mono font-medium text-slate-600">
                    ${rate.inputCostPer1K.toFixed(4)}
                  </td>
                  <td className="py-4 px-4 text-right font-mono font-medium text-slate-600">
                    ${rate.outputCostPer1K.toFixed(4)}
                  </td>
                  <td className="py-4 px-4 text-right font-bold text-slate-800">
                    {rate.avgInputTokens.toLocaleString()}
                  </td>
                  <td className="py-4 px-4 text-right font-bold text-slate-800">
                    {rate.avgOutputTokens.toLocaleString()}
                  </td>
                  <td className="py-4 px-4 text-right font-mono font-extrabold text-indigo-600 bg-indigo-50/50 rounded-lg">
                    {formatDollarCost(rate.avgCostPerCallUsd)}
                  </td>
                  <td className="py-4 px-6 text-slate-500 text-[11px] max-w-xs">
                    {rate.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: SUMMARY STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Expenditure</span>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shadow-inner">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight font-mono">
              {formatDollarCost(summaryMetrics.totalCost)}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
              <TrendingUp size={12} className="text-emerald-500" />
              <span>{summaryMetrics.totalRequests} API calls logged</span>
            </p>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Tokens Consumed</span>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl shadow-inner">
              <Coins size={20} />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight font-mono">
              {summaryMetrics.totalTokens.toLocaleString()}
            </h3>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
              <span className="text-indigo-600">In: {summaryMetrics.totalInputTokens.toLocaleString()}</span>
              <span>|</span>
              <span className="text-purple-600">Out: {summaryMetrics.totalOutputTokens.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cache Hit Savings</span>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl shadow-inner">
              <Zap size={20} />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-3xl font-black text-emerald-600 tracking-tight font-mono">
              {formatDollarCost(summaryMetrics.totalCacheSavings)}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Hit Ratio: <strong className="text-slate-900">{summaryMetrics.cacheHitRate.toFixed(1)}%</strong> ({summaryMetrics.cachedCount} calls cached)
            </p>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Avg Response Time</span>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl shadow-inner">
              <Clock size={20} />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight font-mono">
              {summaryMetrics.avgResponseTime.toFixed(2)} s
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Gemini 3.8 Flash latency
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 3: TOKEN CONSUMPTION DETAILS TABLE */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200/80 shadow-sm space-y-6">
        {/* Table Filter Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Coins size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Token Consumption Details Table
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Detailed per-transaction log with input/output modality counts and Gemini 3.8 Flash metrics
              </p>
            </div>
          </div>

          {/* Filters & Actions */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[200px] flex-1 sm:flex-initial">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                value={searchTerm || ''}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search user, project, feature, inputs..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 ring-indigo-500/20 transition-all"
              />
            </div>

            {/* Project Filter */}
            <div className="relative">
              <select
                value={selectedProject || ''}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 outline-none cursor-pointer appearance-none"
              >
                {projectOptions.map(p => (
                  <option key={p} value={p}>Project: {p}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            {/* Feature Filter */}
            <div className="relative">
              <select
                value={selectedFeature || ''}
                onChange={(e) => setSelectedFeature(e.target.value)}
                className="pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 outline-none cursor-pointer appearance-none"
              >
                {featureOptions.map(f => (
                  <option key={f} value={f}>Feature: {f}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            {/* Tier Filter */}
            <div className="relative">
              <select
                value={selectedTier || ''}
                onChange={(e) => setSelectedTier(e.target.value)}
                className="pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 outline-none cursor-pointer appearance-none"
              >
                <option value="All">Tier: All Tiers</option>
                <option value="Small">Tier: Small (≤5)</option>
                <option value="Medium">Tier: Medium (6-10)</option>
                <option value="High">Tier: High (&gt;10)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            {/* Cache Status Filter */}
            <div className="relative">
              <select
                value={selectedCacheStatus || ''}
                onChange={(e) => setSelectedCacheStatus(e.target.value)}
                className="pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-700 outline-none cursor-pointer appearance-none"
              >
                <option value="All">Cache: All</option>
                <option value="Cached">Cache: Yes (Cached)</option>
                <option value="Uncached">Cache: No (Uncached)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
          </div>
        </div>

        {/* Selected Rows Bulk Action Bar */}
        {selectedLogIds.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-rose-50/90 border border-rose-200 p-4 rounded-2xl animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs font-black shadow-sm">
                {selectedLogIds.length}
              </span>
              <span className="text-xs font-bold text-rose-900">
                {selectedLogIds.length} record{selectedLogIds.length > 1 ? 's' : ''} selected
              </span>
              <span className="text-xs text-rose-600/80 hidden sm:inline font-medium">
                (Click Delete Selected to permanently delete these entries)
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setSelectedLogIds([])}
                className="px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold border border-slate-200 transition-all active:scale-95"
              >
                Deselect All
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-rose-200 transition-all active:scale-95"
              >
                <Trash2 size={14} />
                Delete Selected ({selectedLogIds.length})
              </button>
            </div>
          </div>
        )}

        {/* Detailed Logs Table */}
        <div className="overflow-x-auto custom-scrollbar border border-slate-200/60 rounded-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">
                {/* Select All Checkbox */}
                <th className="py-4 px-3 text-center w-10">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    title={isAllFilteredSelected ? "Deselect all filtered rows" : "Select all filtered rows"}
                    className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
                  >
                    {isAllFilteredSelected ? (
                      <CheckSquare size={16} className="text-[#00E1C5]" />
                    ) : isSomeFilteredSelected ? (
                      <div className="w-4 h-4 rounded border-2 border-[#00E1C5] bg-[#00E1C5]/30 flex items-center justify-center text-[10px] text-white font-black leading-none">
                        -
                      </div>
                    ) : (
                      <Square size={16} className="text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="py-4 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Clock size={12} className="text-indigo-400" />
                    <span>Date & Time (IST)</span>
                  </div>
                </th>
                <th className="py-4 px-4">User</th>
                <th className="py-4 px-4">Project</th>
                <th className="py-4 px-4">Feature</th>
                {/* DEDICATED COLUMN 1: Given Input */}
                <th className="py-4 px-4 bg-slate-850 text-[#00E1C5] border-l border-slate-800 min-w-[190px] max-w-[260px]">
                  <div className="flex items-center gap-1.5">
                    <Layers size={13} className="text-[#00E1C5]" />
                    <span>Given Input</span>
                  </div>
                </th>
                {/* DEDICATED COLUMN: Tier (Small, Medium, High) */}
                <th className="py-4 px-4 bg-slate-850 text-[#00E1C5] border-r border-slate-800 min-w-[130px] max-w-[170px]">
                  <div className="flex items-center gap-1.5">
                    <Sliders size={13} className="text-[#00E1C5]" />
                    <span>Tier</span>
                  </div>
                </th>
                {/* DEDICATED COLUMN 2: Output Generated */}
                <th className="py-4 px-4 bg-slate-850 text-[#00E1C5] border-r border-slate-800 min-w-[190px] max-w-[270px]">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={13} className="text-[#00E1C5]" />
                    <span>Output Generated</span>
                  </div>
                </th>
                <th className="py-4 px-4">Model</th>
                <th className="py-4 px-4 text-right">Input Tokens</th>
                <th className="py-4 px-4 text-right">Output Tokens</th>
                <th 
                  onClick={() => toggleSort('totalTokens')}
                  className="py-4 px-4 text-right cursor-pointer hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Total Tokens</span>
                    <ArrowUpDown size={12} className="opacity-60" />
                  </div>
                </th>
                <th 
                  onClick={() => toggleSort('costUsd')}
                  className="py-4 px-5 text-right cursor-pointer hover:bg-slate-800 transition-colors text-emerald-400"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Cost (USD)</span>
                    <ArrowUpDown size={12} className="opacity-80" />
                  </div>
                </th>
                <th className="py-4 px-4 text-right">Response Time</th>
                <th className="py-4 px-4 text-center">Cache</th>
                {/* Actions Column */}
                <th className="py-4 px-4 text-center w-14">
                  <span title="Delete record">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-16 text-center">
                    {logs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                          <Coins size={24} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-slate-800">All token consumption records deleted</p>
                          <p className="text-xs text-slate-500">The token log table is empty. New consumption logs will appear as AI features are used or simulated.</p>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <button
                            onClick={() => setIsSimulateModalOpen(true)}
                            className="px-4 py-2 bg-[#00E1C5] text-slate-950 hover:bg-[#00cbb2] rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                          >
                            Simulate Token Log
                          </button>
                          <button
                            onClick={handleResetLogs}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                          >
                            Restore Sample Data
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-slate-400 font-semibold uppercase tracking-wider">
                        No matching token consumption records found for selected filters
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isSelected = selectedLogIds.includes(log.id);
                  const outputDetails = getOutputDetailsFormatted(log);
                  const inputSummary = getInputDetailsFormatted(log);
                  const istFormattedDate = formatToIST(log.timestamp || log.date);

                  return (
                    <tr 
                      key={log.id} 
                      className={`transition-colors group ${isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50/80'}`}
                    >
                      {/* Individual Checkbox */}
                      <td className="py-4 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSelect(log.id)}
                          className="p-1 rounded hover:bg-slate-200/60 text-slate-400 transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-indigo-600" />
                          ) : (
                            <Square size={16} className="text-slate-400 group-hover:text-slate-600" />
                          )}
                        </button>
                      </td>
                      {/* DATE IN IST */}
                      <td className="py-4 px-4 font-semibold text-slate-700 whitespace-nowrap text-[11px]">
                        <div className="flex items-center gap-1.5 font-mono">
                          <Clock size={11} className="text-indigo-500 shrink-0" />
                          <span>{istFormattedDate}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-black flex items-center justify-center">
                            {log.user.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs">{log.user}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-semibold text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Briefcase size={12} className="text-indigo-500 shrink-0" />
                          <span className="px-2.5 py-1 bg-slate-100/90 border border-slate-200/90 rounded-md text-[11px] font-bold text-slate-800 tracking-tight">
                            {log.project || activeProject?.name || 'AutomatiQA Testing Project'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-800 text-xs">
                          {normalizeFeatureName(log.feature)}
                        </span>
                      </td>

                      {/* COLUMN 1: GIVEN INPUT (Text, Screenshots, Doc, URL counts & details) */}
                      <td className="py-3 px-4 border-l border-slate-100 bg-slate-50/50 min-w-[210px] max-w-[290px]">
                        {(() => {
                          const components = parseInputComponents(inputSummary, log.inputModality);
                          const isMulti = components.length > 1 || log.inputModality === 'Multimodal';

                          return (
                            <div className="flex flex-col gap-1.5">
                              {isMulti ? (
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-indigo-100/80 text-indigo-800 border border-indigo-200 flex items-center gap-1 shrink-0">
                                    <Layers size={9} className="text-indigo-600 shrink-0" />
                                    <span>Multiple ({components.length})</span>
                                  </span>
                                  {components.map((c, idx) => (
                                    <span key={idx} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border flex items-center gap-1 ${c.badgeClass}`}>
                                      {c.icon}
                                      <span className="truncate max-w-[120px]">{c.text}</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 shrink-0 ${getInputBadgeStyle(log.inputModality)}`}>
                                    {getInputTypeIcon(log.inputModality)}
                                    <span>{log.inputModality || 'Text'}</span>
                                  </span>
                                </div>
                              )}
                              <span className="text-[11px] font-bold text-slate-800 leading-snug" title={inputSummary}>
                                {inputSummary}
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* DEDICATED COLUMN: TIER (Small: ≤5, Medium: 6-10, High: >10) */}
                      <td className="py-3 px-4 border-r border-slate-100 bg-slate-50/30 whitespace-nowrap min-w-[130px] max-w-[170px]">
                        {(() => {
                          const tierInfo = calculateInputTier(log);
                          return (
                            <div className="flex flex-col gap-1">
                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border inline-flex items-center gap-1.5 w-fit ${tierInfo.badgeClass}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${tierInfo.dotClass}`}></span>
                                <span>{tierInfo.tier}</span>
                              </span>
                              <span className="text-[10px] font-semibold text-slate-500">
                                {tierInfo.count} {tierInfo.unit || (tierInfo.count === 1 ? 'input' : 'inputs')} ({tierInfo.tier === 'Small' ? '≤5' : tierInfo.tier === 'Medium' ? '6-10' : '>10'})
                              </span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* COLUMN 2: OUTPUT GENERATED (Count and Artefact details) */}
                      <td className="py-3 px-4 border-r border-slate-100 bg-purple-50/30 min-w-[190px] max-w-[270px]">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1 shrink-0">
                              <Sparkles size={10} className="text-purple-600 shrink-0" />
                              <span>{outputDetails.countLabel}</span>
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-slate-900 leading-snug" title={outputDetails.label}>
                            {outputDetails.label}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200/60 text-[10px] font-black px-2.5 py-1 rounded-full">
                          {log.model && !log.model.includes('3.7') ? log.model : 'Gemini 3.8 Flash'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-medium text-slate-600">
                        {log.inputTokens.toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-medium text-slate-600">
                        {log.outputTokens.toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-slate-900">
                        {log.totalTokens.toLocaleString()}
                      </td>
                      <td className="py-4 px-5 text-right font-mono font-extrabold text-emerald-600 bg-emerald-50/40">
                        {formatDollarCost(calculateTokenCostUsd(log.inputTokens, log.outputTokens, log.cached))}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-600 whitespace-nowrap text-[11px]">
                        {log.responseTimeSeconds} s
                      </td>
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {log.cached ? (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300/80 text-[10px] font-black px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                            <CheckCircle2 size={10} /> Yes
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 text-[10px] font-extrabold px-2.5 py-1 rounded-full">
                            No
                          </span>
                        )}
                      </td>

                      {/* Individual Row Delete Action */}
                      <td className="py-4 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDeleteSingle(log)}
                          title={`Delete token log record: ${log.feature}`}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all active:scale-90"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100 text-xs text-slate-500 font-semibold">
          <div>
            Showing <strong className="text-slate-900">{filteredLogs.length}</strong> of <strong className="text-slate-900">{logs.length}</strong> token entries
            {selectedLogIds.length > 0 && (
              <span className="ml-2 text-rose-600 font-bold">
                ({selectedLogIds.length} selected)
              </span>
            )}
          </div>
          <div className="flex items-center gap-6 flex-wrap justify-end">
            <span>Total Input: <strong className="text-slate-800">{summaryMetrics.totalInputTokens.toLocaleString()}</strong></span>
            <span>Total Output: <strong className="text-slate-800">{summaryMetrics.totalOutputTokens.toLocaleString()}</strong></span>
            <span className="text-emerald-600 font-bold">Total Cost: {formatDollarCost(summaryMetrics.totalCost)}</span>
          </div>
        </div>
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmModal && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 border border-white space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-3.5 bg-rose-50 text-rose-600 rounded-2xl shrink-0 border border-rose-100">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  {deleteConfirmModal.title}
                </h3>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  {deleteConfirmModal.message}
                </p>
              </div>
            </div>

            <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-100/80 text-xs text-rose-800 font-medium space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-900">
                <Trash2 size={13} />
                <span>Action Impact</span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-700">
                This will delete <strong className="font-bold">{deleteConfirmModal.ids.length}</strong> record{deleteConfirmModal.ids.length > 1 ? 's' : ''} from the database and recalculate consumption metrics immediately.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmModal(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SIMULATE LOG MODAL */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8 border border-white">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                    Simulate Token Consumption
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Test cost logging for Gemini 3.8 Flash feature execution
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSimulateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSimulateSubmit} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-slate-500 mb-1">Feature</label>
                <select
                  value={simFeature || ''}
                  onChange={(e) => {
                    const feat = e.target.value;
                    setSimFeature(feat);
                    const matchingRate = FEATURE_PRICING_RATES.find(r => r.feature === feat);
                    if (matchingRate) {
                      setSimInputTokens(matchingRate.avgInputTokens);
                      setSimOutputTokens(matchingRate.avgOutputTokens);
                    }
                  }}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20"
                >
                  {FEATURE_PRICING_RATES.map(r => (
                    <option key={r.feature} value={r.feature}>{r.feature}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">User Name</label>
                  <input
                    type="text"
                    value={simUser || ''}
                    onChange={(e) => setSimUser(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Project Name</label>
                  <input
                    type="text"
                    value={simProject || ''}
                    onChange={(e) => setSimProject(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Input Modality</label>
                  <select
                    value={simModality}
                    onChange={(e) => setSimModality(e.target.value as any)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  >
                    <option value="Text">Text (User Story / Prompt)</option>
                    <option value="Screenshot">Screenshot (Vision)</option>
                    <option value="Document">Document (PDF/DOCX)</option>
                    <option value="URL">Live URL</option>
                    <option value="Multimodal">Multimodal (Text + Screenshots)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Given Input Description</label>
                  <input
                    type="text"
                    value={simModalityDetails}
                    onChange={(e) => setSimModalityDetails(e.target.value)}
                    placeholder="e.g. 25 User Stories + 3 Screenshots"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
              </div>

              {/* Given Input Count & Live Tier Preview */}
              <div className="grid grid-cols-2 gap-4 p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Given Input Count</label>
                  <input
                    type="number"
                    min="1"
                    value={simInputCount}
                    onChange={(e) => setSimInputCount(Math.max(1, Number(e.target.value)))}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none font-mono text-slate-900 font-bold"
                    required
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    ≤5: Small | 6-10: Medium | &gt;10: High
                  </span>
                </div>
                <div className="flex flex-col justify-between">
                  <span className="text-slate-700 font-bold block mb-1">Calculated Tier</span>
                  {(() => {
                    const tempTier = calculateInputTier({ inputCount: simInputCount, inputModalityDetails: simModalityDetails });
                    return (
                      <div className="flex items-center gap-2 pt-1">
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border inline-flex items-center gap-1.5 ${tempTier.badgeClass}`}>
                          <span className={`w-2 h-2 rounded-full ${tempTier.dotClass}`}></span>
                          <span>{tempTier.tier} Tier</span>
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Output Count</label>
                  <input
                    type="number"
                    min="1"
                    value={simItemsGenerated}
                    onChange={(e) => setSimItemsGenerated(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Output Generated Description</label>
                  <input
                    type="text"
                    value={simOutputType}
                    onChange={(e) => setSimOutputType(e.target.value)}
                    placeholder="e.g. 7 Test Scenarios"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Input Tokens</label>
                  <input
                    type="number"
                    value={simInputTokens ?? ''}
                    onChange={(e) => setSimInputTokens(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Output Tokens</label>
                  <input
                    type="number"
                    value={simOutputTokens ?? ''}
                    onChange={(e) => setSimOutputTokens(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-500 mb-1">Response Time (s)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={simResponseTime ?? ''}
                    onChange={(e) => setSimResponseTime(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono"
                    required
                  />
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simCached}
                      onChange={(e) => setSimCached(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-800 font-bold">Cached Response (75% Off Inputs)</span>
                  </label>
                </div>
              </div>

              <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 space-y-1 mt-4">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Calculated Cost for Gemini 3.8 Flash:</span>
                  <span className="font-mono text-indigo-600 text-sm">
                    {formatDollarCost(calculateTokenCostUsd(simInputTokens, simOutputTokens, simCached))}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSimulateModalOpen(false)}
                  className="px-5 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-wider hover:bg-indigo-700 shadow-lg shadow-indigo-100"
                >
                  Add Token Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
