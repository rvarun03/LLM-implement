import React, { useState, useMemo } from 'react';
import { Project, PerformanceScript, TestStatus } from '../types';
import { JiraBugModal } from './JiraBugModal';
import { 
  Zap, 
  Activity, 
  ChevronDown, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  FileText, 
  FileCode, 
  Calendar,
  Clock,
  Eye,
  X,
  Database,
  Download,
  Import,
  Search,
  Users,
  CheckSquare,
  Square,
  ArrowRight,
  FileSearch,
  CheckCircle,
  Trash2,
  AlertTriangle,
  Hash,
  TrendingUp,
  BarChart3,
  FileWarning
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  Label
} from 'recharts';

interface PerformanceExecutionProps {
  project: Project;
  user: { email: string, name: string } | null;
  onUpdateProject: (p: Project) => void;
}

interface ExecutableItem {
  id: string; // Artifact parent ID
  itemKey: string; // Unique key for status (artifactId-index)
  uniqueKey: string; // artifactId|itemKey
  artifactName: string;
  itemName: string;
  itemType: 'Scenario' | 'AI Analysis' | 'Thread';
  detail: string;
  generatedOn: string;
  status: TestStatus;
  originalArtifact: PerformanceScript;
}

type PerformanceMetricType = 'hits' | 'latency' | 'threads' | 'success' | 'tps' | 'codes';

const PerformanceExecution: React.FC<PerformanceExecutionProps> = ({ project, user, onUpdateProject }) => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [viewingArtifact, setViewingArtifact] = useState<PerformanceScript | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'trends' | 'report'>('trends');
  const [modalActiveMetric, setModalActiveMetric] = useState<PerformanceMetricType>('hits');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ keys: string[], title: string, artifactIds: string[] } | null>(null);

  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [customBugTitle, setCustomBugTitle] = useState('');
  const [customBugDescription, setCustomBugDescription] = useState('');

  const archives = project.performanceScripts || [];
  const importedArtifactIds = useMemo(() => new Set(project.importedPerformanceArtifactIds || []), [project.importedPerformanceArtifactIds]);

  const [tempSelectedIds, setTempSelectedIds] = useState<Set<string>>(new Set());

  const metricConfigs = {
    hits: { label: 'Hits per Second', dataKey: 'hitsPerSecond', color: '#8b5cf6', icon: <Zap size={14}/>, yLabel: 'Number of hits / sec' },
    latency: { label: 'Average Response Time (ms)', dataKey: 'avgLatency', color: '#6366f1', icon: <Clock size={14}/>, yLabel: 'Latency (ms)' },
    threads: { label: 'Active Threads Over Time', dataKey: 'activeThreads', color: '#10b981', icon: <Users size={14}/>, yLabel: 'Threads / Users' },
    success: { label: 'Transaction Success Rate (%)', dataKey: 'successRate', color: '#ec4899', icon: <CheckCircle2 size={14}/>, yLabel: 'Percentage (%)' },
    tps: { label: 'Transactions per Second', dataKey: 'tps', color: '#f59e0b', icon: <TrendingUp size={14}/>, yLabel: 'Trans / sec' },
    codes: { label: 'Response Codes per Second', dataKey: 'errorsPerSecond', color: '#ef4444', icon: <FileWarning size={14}/>, yLabel: 'Samples / sec' }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pass': return <div className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 font-black text-[10px] uppercase tracking-widest"><CheckCircle2 size={12}/> Pass</div>;
      case 'Warning': return <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-50 text-amber-600 rounded-full border border-amber-100 font-black text-[10px] uppercase tracking-widest"><AlertTriangle size={12}/> Warning</div>;
      case 'Fail': return <div className="flex items-center gap-1.5 px-4 py-1.5 bg-red-50 text-red-600 rounded-full border border-red-100 font-black text-[10px] uppercase tracking-widest"><XCircle size={12}/> Fail</div>;
      default: return null;
    }
  };

  const openImportModal = () => {
    setTempSelectedIds(new Set());
    setIsImportModalOpen(true);
  };

  const handleConfirmImport = () => {
    const nextImported = new Set([...Array.from(importedArtifactIds), ...Array.from(tempSelectedIds)]);
    onUpdateProject({
        ...project,
        importedPerformanceArtifactIds: Array.from(nextImported)
    });
    setIsImportModalOpen(false);
  };

  const toggleTempSelection = (id: string) => {
    const next = new Set(tempSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTempSelectedIds(next);
  };

  const availableForImport = useMemo(() => {
    const q = (modalSearchQuery || '').toLowerCase();
    return archives.filter(a => 
      !importedArtifactIds.has(a.id) && 
      (a.analysisReport || a.trendData) && // Display AI analysis Reports and Graph Reports
      ((a.name?.toLowerCase() || '').includes(q) || (a.id?.toLowerCase() || '').includes(q))
    );
  }, [archives, modalSearchQuery, importedArtifactIds]);

  const executableItems = useMemo(() => {
    const items: ExecutableItem[] = [];
    const q = (searchQuery || '').toLowerCase();

    archives.forEach(artifact => {
      if (!importedArtifactIds.has(artifact.id)) return;

      if (artifact.scenarios && artifact.scenarios.length > 0) {
        artifact.scenarios.forEach((s, idx) => {
          const itemKey = `scen-${idx}`;
          const uniqueKey = `${artifact.id}|${itemKey}`;
          
          items.push({
            id: artifact.id,
            itemKey,
            uniqueKey,
            artifactName: artifact.name || 'Untitled JMX',
            itemName: s.behavior || `Profile ${idx + 1}`,
            itemType: 'Scenario',
            detail: `${s.vus} VUs • ${s.duration}s duration`,
            generatedOn: artifact.createdAt,
            status: artifact.itemResults?.[itemKey] || TestStatus.NOT_EXECUTED,
            originalArtifact: artifact
          });
        });
      }

      if (artifact.analysisReport || artifact.trendData) {
        const itemKey = 'analysis-summary';
        const uniqueKey = `${artifact.id}|${itemKey}`;

        items.push({
          id: artifact.id,
          itemKey,
          uniqueKey,
          artifactName: artifact.name || 'Performance Report',
          itemName: artifact.trendData && !artifact.analysisReport ? 'Performance Telemetry & Graph' : 'Performance Insight Analysis',
          itemType: 'AI Analysis',
          detail: 'Post-Execution AI Findings',
          generatedOn: artifact.createdAt,
          status: artifact.itemResults?.[itemKey] || TestStatus.NOT_EXECUTED,
          originalArtifact: artifact
        });
      }
    });

    return items.filter(item => 
      (item.artifactName?.toLowerCase() || '').includes(q) ||
      (item.itemName?.toLowerCase() || '').includes(q)
    );
  }, [archives, importedArtifactIds, searchQuery]);

  const handleUpdateStatus = (artifactId: string, itemKey: string, status: TestStatus) => {
    const updatedScripts = archives.map(s => {
      if (s.id === artifactId) {
        return {
          ...s,
          itemResults: {
            ...(s.itemResults || {}),
            [itemKey]: status
          },
          statusUpdateTimestamps: {
            ...(s.statusUpdateTimestamps || {}),
            [itemKey]: new Date().toISOString()
          }
        };
      }
      return s;
    });
    onUpdateProject({ ...project, performanceScripts: updatedScripts });
  };

  const handleToggleSelectItem = (uniqueKey: string) => {
    const next = new Set(selectedItemKeys);
    if (next.has(uniqueKey)) next.delete(uniqueKey);
    else next.add(uniqueKey);
    setSelectedItemKeys(next);
  };

  const handleSelectAll = () => {
    if (selectedItemKeys.size === executableItems.length) {
      setSelectedItemKeys(new Set());
    } else {
      setSelectedItemKeys(new Set(executableItems.map(item => item.uniqueKey)));
    }
  };

  const handleDeleteItems = () => {
    if (deleteConfirm) {
      const nextImported = new Set(project.importedPerformanceArtifactIds || []);
      deleteConfirm.artifactIds.forEach(id => nextImported.delete(id));
      onUpdateProject({ ...project, importedPerformanceArtifactIds: Array.from(nextImported) });
      setSelectedItemKeys(new Set());
      setDeleteConfirm(null);
    }
  };

  const getStatusStyle = (status: TestStatus) => {
    switch (status) {
      case TestStatus.PASS: return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case TestStatus.FAIL: return 'bg-red-50 text-red-600 border-red-100';
      case TestStatus.BLOCKED: return 'bg-amber-50 text-amber-600 border-amber-100';
      default: return 'bg-slate-50 text-slate-400 border-slate-200';
    }
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'Scenario': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'AI Analysis': return 'bg-amber-50 text-amber-600 border-amber-100';
      default: return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  const triggerBugModal = (item: ExecutableItem) => {
    setCustomBugTitle(`[FAIL] Performance Verification - ${item.artifactName} - ${item.itemName}`);
    setCustomBugDescription(
      `AutomatiQA Performance Failure Report\n` +
      `----------------------------------------\n` +
      `Source Artifact: ${item.artifactName}\n` +
      `Target Item Name: ${item.itemName}\n` +
      `Type: ${item.itemType}\n` +
      `Details: ${item.detail}\n` +
      `Timestamp: ${new Date(item.generatedOn).toLocaleString('en-GB')}\n\n` +
      `Recommended Action: Inspect JMX load thresholds, server connection pool settings, and database query latency logs.`
    );
    setBugModalOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
           <div className="flex items-center gap-5">
              <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
                 <Zap size={24} />
              </div>
              <div>
                 <h2 className="text-2xl font-black text-black uppercase tracking-tight">Performance API Testing Execution</h2>
              </div>
           </div>
           
           <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                 <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                 <input 
                   type="text" 
                   placeholder="Search items..." 
                   value={searchQuery || ''}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold transition-all w-64 shadow-inner"
                 />
              </div>
              <button 
                onClick={openImportModal}
                className="flex items-center gap-3 bg-white text-indigo-600 border border-indigo-100 px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-sm active:scale-95"
              >
                <Import size={18} /> Import Results
              </button>
           </div>
        </div>

        {/* Selection Action Bar */}
        {selectedItemKeys.size > 0 && (
          <div className="mb-6 flex items-center justify-between bg-slate-900 text-white p-4 rounded-2xl shadow-xl animate-in slide-in-from-top-2">
             <div className="flex items-center gap-4 ml-4">
                <CheckSquare size={20} className="text-indigo-400" />
                <span className="text-xs font-black uppercase tracking-widest">{selectedItemKeys.size} Items Selected</span>
             </div>
             <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    const idsToUnimport = Array.from(new Set(
                        executableItems
                            .filter(item => selectedItemKeys.has(item.uniqueKey))
                            .map(item => item.id)
                    ));
                    setDeleteConfirm({ 
                        keys: Array.from(selectedItemKeys), 
                        title: `${idsToUnimport.length} Artifact(s)`, 
                        artifactIds: idsToUnimport 
                    });
                  }}
                  className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                >
                   <Trash2 size={14} /> Remove from Execution
                </button>
                <button 
                  onClick={() => setSelectedItemKeys(new Set())}
                  className="p-2.5 text-slate-400 hover:text-white transition-colors"
                >
                   <X size={20} />
                </button>
             </div>
          </div>
        )}

        <div className="overflow-hidden rounded-[2.5rem] border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-[14px] font-black text-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-5 w-12">
                   <button onClick={handleSelectAll} className="p-1 transition-all text-slate-300 hover:text-indigo-600">
                      {selectedItemKeys.size === executableItems.length && executableItems.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                   </button>
                </th>
                <th className="px-6 py-5">Source Artifact</th>
                <th className="px-6 py-5">Target Item</th>
                <th className="px-6 py-5 min-w-[140px]">Type</th>
                <th className="px-6 py-5">Timestamp</th>
                <th className="px-6 py-5">Execution Status</th>
                <th className="px-6 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {executableItems.length === 0 ? (
                <tr>
                   <td colSpan={7} className="px-8 py-32 text-center">
                      <div className="flex flex-col items-center justify-center opacity-40">
                         <div className="p-6 bg-slate-100 rounded-full mb-6 text-slate-300">
                            <Database size={48} />
                         </div>
                         <p className="text-sm font-black uppercase tracking-widest text-slate-500">No active execution items</p>
                         <p className="text-[10px] font-bold uppercase mt-2 text-slate-400 max-w-xs leading-relaxed">Import results from performance archives to begin verification.</p>
                      </div>
                   </td>
                </tr>
              ) : (
                executableItems.map(item => (
                  <tr key={item.uniqueKey} className={`hover:bg-slate-50/30 transition-colors group ${selectedItemKeys.has(item.uniqueKey) ? 'bg-indigo-50/20' : ''}`}>
                    <td className="px-6 py-6">
                       <button onClick={() => handleToggleSelectItem(item.uniqueKey)} className={`p-1 transition-all ${selectedItemKeys.has(item.uniqueKey) ? 'text-indigo-600' : 'text-slate-200 group-hover:text-slate-300'}`}>
                          {selectedItemKeys.has(item.uniqueKey) ? <CheckSquare size={18} /> : <Square size={18} />}
                       </button>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${item.originalArtifact.analysisReport ? 'bg-amber-50 text-amber-500' : 'bg-indigo-50 text-indigo-500'}`}>
                           {item.originalArtifact.analysisReport ? <FileSearch size={16} /> : <FileCode size={16} />}
                        </div>
                        <h4 className="font-bold text-slate-800 text-xs">{item.artifactName}</h4>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                       <div className="min-w-0">
                          <p className="font-black text-slate-700 text-xs uppercase tracking-tight">{item.itemName}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 tracking-tighter italic">{item.detail}</p>
                       </div>
                    </td>
                    <td className="px-6 py-6">
                       <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-md border shadow-sm whitespace-nowrap inline-block ${getTypeStyle(item.itemType)}`}>
                          {item.itemType}
                       </span>
                    </td>
                    <td className="px-6 py-6">
                       <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase">
                          <Calendar size={12} className="text-slate-300" />
                          {new Date(item.generatedOn).toLocaleDateString()}
                       </div>
                    </td>
                    <td className="px-6 py-6">
                       <div className="relative w-44">
                          <select 
                             value={item.status || ''}
                             onChange={(e) => handleUpdateStatus(item.id, item.itemKey, e.target.value as TestStatus)}
                             className={`appearance-none w-full pl-4 pr-10 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border outline-none cursor-pointer transition-all shadow-sm ${getStatusStyle(item.status)}`}
                          >
                             <option value={TestStatus.NOT_EXECUTED}>Not Executed</option>
                             <option value={TestStatus.PASS}>Passed</option>
                             <option value={TestStatus.FAIL}>Failed</option>
                             <option value={TestStatus.BLOCKED}>Blocked</option>
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                             <ChevronDown size={14} />
                          </div>
                       </div>
                    </td>
                    <td className="px-6 py-6 text-right">
                       <div className="flex items-center justify-end gap-2 transition-all">
                          {item.status === TestStatus.FAIL && (
                             <button 
                                onClick={() => triggerBugModal(item)}
                                className="p-2.5 bg-rose-50 border border-rose-100 text-rose-600 hover:text-rose-700 hover:bg-rose-100 rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center animate-in zoom-in-95"
                                title="Create Bug"
                             >
                                <AlertTriangle size={18} />
                             </button>
                          )}
                          <button 
                             onClick={() => { setViewingArtifact(item.originalArtifact); setModalActiveTab(item.originalArtifact.analysisReport ? 'trends' : 'trends'); }}
                             className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent"
                             title="Preview Content"
                           >
                             <Eye size={18} />
                          </button>
                          <button 
                             onClick={() => setDeleteConfirm({ 
                                keys: [item.uniqueKey], 
                                title: item.artifactName, 
                                artifactIds: [item.id] 
                             })}
                             className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent"
                             title="Remove Artifact"
                           >
                             <Trash2 size={18} />
                          </button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-white w-full max-sm rounded-[3rem] p-10 text-center shadow-2xl animate-in zoom-in-95 border border-white">
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-8 text-rose-500 shadow-inner">
                 <AlertTriangle size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">Remove Artifact?</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10 px-4">This will remove <span className="font-bold text-slate-800">"{deleteConfirm.title}"</span> and all its children from the execution list. You can re-import it later from the archives.</p>
              <div className="flex flex-col gap-4">
                 <button onClick={handleDeleteItems} className="w-full py-5 bg-rose-600 text-white rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-rose-700 shadow-xl active:scale-95 transition-all">Confirm Removal</button>
                 <button onClick={() => setDeleteConfirm(null)} className="w-full py-5 bg-slate-100 text-slate-500 rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200">Keep It</button>
              </div>
           </div>
        </div>
      )}

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 border border-white">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                 <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg">
                       <Import size={24} />
                    </div>
                    <div>
                       <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Import New Artifacts</h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Only unimported files from Performance archives are listed</p>
                    </div>
                 </div>
                 <button onClick={() => setIsImportModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                    <X size={24} />
                 </button>
              </div>

              <div className="p-6 border-b border-slate-100 bg-white">
                 <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      autoFocus
                      placeholder="Search available archives..." 
                      value={modalSearchQuery || ''}
                      onChange={(e) => setModalSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium transition-all shadow-inner"
                    />
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/30 custom-scrollbar">
                 {availableForImport.length === 0 ? (
                    <div className="py-24 text-center">
                       <Database size={40} className="mx-auto text-slate-200 mb-4" />
                       <p className="text-slate-400 font-bold uppercase text-xs tracking-widest italic">All available performance archives are already imported</p>
                    </div>
                 ) : (
                    availableForImport.map(artifact => (
                       <div 
                          key={artifact.id}
                          onClick={() => toggleTempSelection(artifact.id)}
                          className={`group flex items-center gap-5 p-5 rounded-[1.5rem] border transition-all cursor-pointer ${tempSelectedIds.has(artifact.id) ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-50' : 'bg-white/60 border-slate-200 hover:border-indigo-300 hover:bg-white'}`}
                       >
                          <div className={`transition-all ${tempSelectedIds.has(artifact.id) ? 'text-indigo-600 scale-110' : 'text-slate-200 group-hover:text-slate-300'}`}>
                             {tempSelectedIds.has(artifact.id) ? <CheckSquare size={28} /> : <Square size={28} />}
                          </div>
                          <div className={`p-3 rounded-xl transition-colors ${tempSelectedIds.has(artifact.id) ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50'}`}>
                             {artifact.analysisReport ? <FileSearch size={20} /> : <FileCode size={20} />}
                          </div>
                          <div className="flex-1 min-w-0">
                             <h4 className={`text-sm font-black uppercase tracking-tight truncate ${tempSelectedIds.has(artifact.id) ? 'text-indigo-700' : 'text-slate-700'}`}>{artifact.name || 'Untitled Artifact'}</h4>
                             <div className="flex items-center gap-3 mt-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ID: {(artifact.id || '').toUpperCase()}</span>
                                <span className="text-[9px] font-black text-slate-300 uppercase">•</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{new Date(artifact.createdAt).toLocaleTimeString()}</span>
                             </div>
                          </div>
                          <div className="text-right">
                             <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-md border ${artifact.analysisReport ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                                {artifact.analysisReport ? 'Result Analysis' : 'Load Profile'}
                             </span>
                          </div>
                       </div>
                    ))
                 )}
              </div>

              <div className="p-8 border-t border-slate-100 bg-white flex justify-between items-center">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    {tempSelectedIds.size} New Artifacts Selected
                 </p>
                 <div className="flex gap-4">
                    <button onClick={() => setIsImportModalOpen(false)} className="px-8 py-3.5 text-slate-500 font-black uppercase tracking-widest text-[11px] hover:bg-slate-50 rounded-2xl transition-all">Cancel</button>
                    <button 
                       onClick={handleConfirmImport}
                       disabled={tempSelectedIds.size === 0}
                       className="flex items-center gap-3 bg-indigo-600 text-white px-10 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95 disabled:opacity-50"
                    >
                       Add to Execution Hub <ArrowRight size={16} />
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* High Fidelity Detail View Modal */}
      {viewingArtifact && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300">
           <div className="relative bg-white w-full max-w-6xl h-[90vh] rounded-[3.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
              <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 backdrop-blur-sm">
                 <div className="flex items-center gap-5">
                    <div className={`p-4 rounded-3xl text-white shadow-2xl ${
                      viewingArtifact.trendData && !viewingArtifact.analysisReport 
                        ? 'bg-purple-600' 
                        : viewingArtifact.analysisReport 
                        ? 'bg-amber-500' 
                        : 'bg-indigo-600'
                    }`}>
                       {viewingArtifact.trendData && !viewingArtifact.analysisReport 
                         ? <TrendingUp size={32} /> 
                         : viewingArtifact.analysisReport 
                         ? <FileSearch size={32} /> 
                         : <FileCode size={32} />}
                    </div>
                    <div>
                       <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{viewingArtifact.name}</h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                          {viewingArtifact.analysisReport || viewingArtifact.trendData ? 'Archived Telemetry & Intelligence Review' : 'Artifact Specification Preview'}
                       </p>
                    </div>
                 </div>
                 <div className="flex gap-4">
                    {(viewingArtifact.analysisReport || viewingArtifact.trendData) && (
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                            {viewingArtifact.trendData && (
                              <button onClick={() => setModalActiveTab('trends')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modalActiveTab === 'trends' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Trends Graph</button>
                            )}
                            {viewingArtifact.analysisReport && (
                              <button onClick={() => setModalActiveTab('report')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modalActiveTab === 'report' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Verdict Report</button>
                            )}
                        </div>
                    )}
                    <button onClick={() => setViewingArtifact(null)} className="p-3 bg-white text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all border border-slate-100 shadow-sm">
                        <X size={32} />
                    </button>
                 </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-14 bg-slate-50/50 custom-scrollbar shadow-inner">
                  {(() => {
                      if (!viewingArtifact.analysisReport && !viewingArtifact.trendData) {
                        return (
                          <div className="max-w-4xl mx-auto space-y-8">
                             <div>
                                <div className="flex items-center gap-2 text-indigo-600 font-black uppercase tracking-widest text-xs mb-4">
                                   <Users size={16} /> Targeted Load Profiles
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   {(viewingArtifact.scenarios || []).map((s, i) => (
                                      <div key={i} className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                         <p className="text-[10px] text-indigo-500 font-black uppercase mb-1">{s.type || 'Load'}</p>
                                         <p className="text-xs font-bold text-slate-700">{s.behavior}</p>
                                         <div className="mt-3 flex gap-4 text-[10px] font-bold text-slate-400">
                                            <span>VUS: {s.vus}</span>
                                            <span>DUR: {s.duration}s</span>
                                         </div>
                                      </div>
                                   ))}
                                </div>
                             </div>
                             <div>
                                <div className="flex items-center gap-2 text-slate-400 font-black uppercase tracking-widest text-xs mb-4">
                                   <Database size={16} /> XML JMX Artifact Definition
                                </div>
                                <pre className="bg-slate-900 text-emerald-400 p-8 rounded-3xl text-[10px] font-mono leading-relaxed overflow-x-auto shadow-inner h-[300px]">
                                   {viewingArtifact.jmxContent}
                                </pre>
                             </div>
                          </div>
                        );
                      }

                      if (modalActiveTab === 'trends') {
                          const archivedTrendData = viewingArtifact.trendData ? JSON.parse(viewingArtifact.trendData) : [];
                          const maxValInArchived = archivedTrendData.length > 0 ? Math.max(...archivedTrendData.map((d: any) => d[metricConfigs[modalActiveMetric].dataKey])) : 0;
                          return (
                            <div className="max-w-6xl mx-auto">
                               {archivedTrendData.length > 0 ? (
                                  <div className="bg-white p-12 rounded-[3rem] border border-slate-200 shadow-xl overflow-hidden group">
                                     <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-10 gap-6">
                                         <div className="flex items-center gap-6">
                                             <div className={`p-4 rounded-2xl shadow-lg ${modalActiveMetric === 'hits' ? 'bg-purple-50 text-purple-600' : modalActiveMetric === 'latency' ? 'bg-indigo-50 text-indigo-600' : modalActiveMetric === 'threads' ? 'bg-emerald-50 text-emerald-600' : modalActiveMetric === 'success' ? 'bg-pink-50 text-pink-600' : modalActiveMetric === 'tps' ? 'bg-orange-50 text-orange-600' : 'bg-rose-50 text-rose-600'}`}>
                                                 {metricConfigs[modalActiveMetric].icon}
                                             </div>
                                             <div>
                                                <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tighter leading-none">{metricConfigs[modalActiveMetric].label}</h4>
                                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1.5">Archived Execution Telemetry</p>
                                             </div>
                                         </div>
                                         <div className="flex flex-wrap gap-2">
                                            {Object.entries(metricConfigs).map(([key, cfg]) => (
                                                <button key={key} onClick={() => setModalActiveMetric(key as any)} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${modalActiveMetric === key ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{key}</button>
                                            ))}
                                         </div>
                                     </div>
                                     <div className="h-[500px] w-full bg-white rounded-3xl p-6 border border-slate-100 shadow-inner relative">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={archivedTrendData} margin={{ bottom: 30, left: 40 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }}>
                                                   <Label value="Elapsed Time" offset={-20} position="insideBottom" style={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                                                </XAxis>
                                                <YAxis 
                                                  axisLine={false} 
                                                  tickLine={false} 
                                                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }}
                                                  domain={[0, modalActiveMetric === 'hits' && maxValInArchived <= 10 ? 10 : 'auto']}
                                                >
                                                   <Label value={metricConfigs[modalActiveMetric].yLabel} angle={-90} position="insideLeft" offset={-30} style={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', textAnchor: 'middle' }} />
                                                </YAxis>
                                                <RechartsTooltip 
                                                  contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)' }} 
                                                  formatter={(value: any) => [value, metricConfigs[modalActiveMetric].label]}
                                                />
                                                <Line 
                                                  type="monotone" 
                                                  dataKey={metricConfigs[modalActiveMetric].dataKey} 
                                                  stroke={metricConfigs[modalActiveMetric].color} 
                                                  strokeWidth={4} 
                                                  dot={{ r: 5, fill: metricConfigs[modalActiveMetric].color, strokeWidth: 3, stroke: '#fff' }} 
                                                  activeDot={{ r: 8, strokeWidth: 3, stroke: '#fff', fill: metricConfigs[modalActiveMetric].color }} 
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                     </div>
                                  </div>
                               ) : (
                                  <div className="py-32 text-center bg-white border-2 border-dashed border-slate-200 rounded-[3rem] opacity-30 font-black uppercase text-xs tracking-widest">No trend data available for this artifact.</div>
                               )}
                            </div>
                          );
                      }

                      const reportData = viewingArtifact.analysisReport;
                      if (!reportData) return null;
                      try {
                          const parsed = JSON.parse(reportData);
                          return (
                            <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in duration-500">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center group hover:border-indigo-200 transition-all">
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Execution Verdict</p>
                                        <div className="scale-[2] transition-transform group-hover:scale-[2.2]">{getStatusBadge(parsed.status)}</div>
                                    </div>
                                    <div className="md:col-span-2 bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-sm group hover:border-indigo-200 transition-all">
                                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                            <Zap size={14} className="text-indigo-500" /> AI Readiness Indicator
                                        </p>
                                        <h5 className="text-3xl font-black text-slate-800 uppercase tracking-tighter leading-tight">{parsed.productionReadiness}</h5>
                                        <div className="mt-6 pt-6 border-t border-slate-50">
                                            <p className="text-sm text-slate-500 font-medium leading-relaxed italic border-l-4 border-indigo-400 pl-6 py-2 bg-indigo-50/30 rounded-r-2xl">{parsed.loadStatement}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
                                    <h4 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-10 flex items-center gap-4">
                                        <BarChart3 className="text-indigo-600" size={24} /> AI Structural Technical Report
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        {(parsed.technicalReport?.metrics || []).map((m: any, idx: number) => (
                                            <div key={idx} className="p-6 bg-slate-50 border border-slate-100 rounded-3xl hover:bg-white hover:shadow-md transition-all">
                                                <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">{m.label}</p>
                                                <p className="text-sm font-black text-slate-800 uppercase truncate">{m.value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                          );
                      } catch (e) {
                          return (
                            <div className="max-w-4xl mx-auto">
                               <div className="p-8 bg-slate-900 text-slate-300 rounded-3xl border border-white/5 whitespace-pre-wrap leading-relaxed text-sm shadow-inner font-mono">
                                  {viewingArtifact.analysisReport}
                               </div>
                            </div>
                          );
                      }
                  })()}
              </div>

              <div className="p-8 border-t border-slate-100 flex justify-end bg-white">
                 <button onClick={() => setViewingArtifact(null)} className="px-12 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 transition-all active:scale-95 shadow-lg">Dismiss View</button>
              </div>
           </div>
        </div>
      )}
      <JiraBugModal 
        isOpen={bugModalOpen} 
        onClose={() => setBugModalOpen(false)} 
        project={project} 
        customTitle={customBugTitle}
        customDescription={customBugDescription}
        user={user}
      />
    </div>
  );
};

export default PerformanceExecution;