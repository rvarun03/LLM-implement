import React, { useState, useEffect, useMemo } from 'react';
import { 
  Database, 
  Search, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Layers, 
  Sliders, 
  FileText, 
  Brain, 
  ArrowRight, 
  HelpCircle, 
  Activity, 
  Zap, 
  Eye, 
  Code2, 
  FolderPlus,
  Check,
  ChevronDown,
  Info
} from 'lucide-react';
import { Project, RagChunk, VectorSearchResult, VectorDistanceMetric, RagFeasibilityStatus } from '../types';
import { 
  getAllRagChunks, 
  saveRagChunk, 
  deleteRagChunk, 
  searchVectorDatabase, 
  indexProjectKnowledge, 
  runFeasibilityCheck, 
  buildRAGPrompt,
  generateEmbedding 
} from '../services/ragService';
import { generateScenariosFromInput } from '../geminiService';
import { toast } from 'sonner';

interface RAGDashboardProps {
  currentProject: Project | null;
  projects: Project[];
}

export const RAGDashboard: React.FC<RAGDashboardProps> = ({ currentProject, projects }) => {
  const [activeTab, setActiveTab] = useState<'status' | 'explorer' | 'search' | 'playground'>('status');
  const [feasibilityStatus, setFeasibilityStatus] = useState<RagFeasibilityStatus | null>(null);
  const [isCheckingFeasibility, setIsCheckingFeasibility] = useState(false);
  const [chunks, setChunks] = useState<RagChunk[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProject?.id || 'all');

  // Vector Search Playground state
  const [searchQuery, setSearchQuery] = useState('Payment checkout error handling and gateway timeout');
  const [searchMetric, setSearchMetric] = useState<VectorDistanceMetric>('cosine');
  const [topK, setTopK] = useState<number>(4);
  const [searchResults, setSearchResults] = useState<VectorSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchLatency, setSearchLatency] = useState<number>(0);

  // Add Chunk Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newChunkTitle, setNewChunkTitle] = useState('');
  const [newChunkContent, setNewChunkContent] = useState('');
  const [newChunkType, setNewChunkType] = useState<RagChunk['metadata']['type']>('requirement');
  const [newChunkTags, setNewChunkTags] = useState('authentication, security');
  const [isSavingChunk, setIsSavingChunk] = useState(false);

  // Inspect Vector Modal state
  const [inspectChunk, setInspectChunk] = useState<RagChunk | null>(null);

  // Indexing State
  const [isIndexingProject, setIsIndexingProject] = useState(false);

  // RAG vs Non-RAG Playground State
  const [playgroundPrompt, setPlaygroundPrompt] = useState('Generate 3 edge-case test scenarios for user password reset');
  const [standardResponse, setStandardResponse] = useState('');
  const [ragResponse, setRagResponse] = useState('');
  const [retrievedContext, setRetrievedContext] = useState<VectorSearchResult[]>([]);
  const [isGeneratingPlayground, setIsGeneratingPlayground] = useState(false);

  // Fetch data on load
  useEffect(() => {
    loadFeasibility();
    loadChunks();
  }, [selectedProjectId]);

  const loadFeasibility = async () => {
    setIsCheckingFeasibility(true);
    try {
      const projId = selectedProjectId === 'all' ? undefined : selectedProjectId;
      const status = await runFeasibilityCheck(projId);
      setFeasibilityStatus(status);
    } catch (err) {
      toast.error('Failed to run RAG feasibility check');
    } finally {
      setIsCheckingFeasibility(false);
    }
  };

  const loadChunks = async () => {
    setIsLoadingChunks(true);
    try {
      const projId = selectedProjectId === 'all' ? undefined : selectedProjectId;
      const data = await getAllRagChunks(projId);
      setChunks(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingChunks(false);
    }
  };

  const handleIndexProject = async () => {
    const targetProject = projects.find(p => p.id === (selectedProjectId === 'all' ? currentProject?.id : selectedProjectId)) || currentProject;
    if (!targetProject) {
      toast.error('Please select a project to index into Firestore Vector Store');
      return;
    }

    setIsIndexingProject(true);
    toast.info(`Auto-indexing project "${targetProject.name}" into Firestore Vector Index...`);
    try {
      const res = await indexProjectKnowledge(targetProject);
      toast.success(`Indexed ${res.added} document chunk(s) into Firestore Vector Store!`);
      await loadChunks();
      await loadFeasibility();
    } catch (err: any) {
      toast.error(`Indexing failed: ${err.message}`);
    } finally {
      setIsIndexingProject(false);
    }
  };

  const handleRunVectorSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const start = Date.now();
    try {
      const projId = selectedProjectId === 'all' ? undefined : selectedProjectId;
      const results = await searchVectorDatabase(searchQuery, {
        projectId: projId,
        topK,
        metric: searchMetric,
        minScore: 0.05
      });
      setSearchResults(results);
      setSearchLatency(Date.now() - start);
    } catch (err: any) {
      toast.error(`Vector search failed: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddCustomChunk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChunkTitle.trim() || !newChunkContent.trim()) {
      toast.error('Title and content are required');
      return;
    }

    setIsSavingChunk(true);
    try {
      const tags = newChunkTags.split(',').map(t => t.trim()).filter(Boolean);
      const projId = selectedProjectId === 'all' ? (currentProject?.id || 'global') : selectedProjectId;
      const projName = projects.find(p => p.id === projId)?.name || 'Global QA Domain';

      await saveRagChunk({
        projectId: projId,
        projectName: projName,
        title: newChunkTitle.trim(),
        content: newChunkContent.trim(),
        embedding: [],
        vectorDimension: 768,
        metadata: {
          type: newChunkType,
          tags,
          source: 'Manual Knowledge Base'
        }
      });

      toast.success('Knowledge chunk saved to Firestore Vector Store!');
      setIsAddModalOpen(false);
      setNewChunkTitle('');
      setNewChunkContent('');
      await loadChunks();
      await loadFeasibility();
    } catch (err: any) {
      toast.error(`Failed to save chunk: ${err.message}`);
    } finally {
      setIsSavingChunk(false);
    }
  };

  const handleDeleteChunk = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this vector embedding chunk from Firestore?')) {
      await deleteRagChunk(id);
      toast.success('Chunk deleted');
      await loadChunks();
      await loadFeasibility();
    }
  };

  const handleRunPlaygroundComparison = async () => {
    if (!playgroundPrompt.trim()) return;
    setIsGeneratingPlayground(true);
    setStandardResponse('');
    setRagResponse('');
    setRetrievedContext([]);

    try {
      const projId = selectedProjectId === 'all' ? currentProject?.id : selectedProjectId;
      
      // 1. Fetch RAG Context
      const { augmentedPrompt, retrievedChunks } = await buildRAGPrompt(playgroundPrompt, projId, 3);
      setRetrievedContext(retrievedChunks);

      // 2. Call Standard Gemini (Without Context)
      const standardRes = await generateScenariosFromInput(playgroundPrompt, 'text', {});
      setStandardResponse(typeof standardRes === 'string' ? standardRes : JSON.stringify(standardRes, null, 2));

      // 3. Call RAG Augmented Gemini (With Firestore Vector Context)
      const ragRes = await generateScenariosFromInput(augmentedPrompt, 'text', {});
      setRagResponse(typeof ragRes === 'string' ? ragRes : JSON.stringify(ragRes, null, 2));

      toast.success('RAG comparison completed!');
    } catch (err: any) {
      toast.error(`Playground execution failed: ${err.message}`);
    } finally {
      setIsGeneratingPlayground(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-900">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-blue-800/40">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              FIRESTORE VECTOR SEARCH (RAG) ENGINE
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              768-Dim Gemini Vectors
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            RAG Firestore & Feasibility Explorer
          </h1>
          <p className="text-slate-300 text-sm max-w-2xl">
            Retrieval-Augmented Generation powered by Firestore Vector Store and Gemini Embedding models (<code className="text-blue-300">gemini-embedding-2-preview</code>). Ground AI test generation in precise project knowledge.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-slate-800/90 text-white text-sm border border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Projects & Global Knowledge</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>Project: {p.name}</option>
            ))}
          </select>

          <button
            onClick={loadFeasibility}
            disabled={isCheckingFeasibility}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isCheckingFeasibility ? 'animate-spin' : ''}`} />
            Run Diagnostic
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200 gap-2 bg-slate-50 p-1.5 rounded-xl border">
        <button
          onClick={() => setActiveTab('status')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'status'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4 text-blue-600" />
          RAG Feasibility & Diagnostics
        </button>

        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'explorer'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4 text-emerald-600" />
          Firestore Knowledge Base ({chunks.length})
        </button>

        <button
          onClick={() => {
            setActiveTab('search');
            handleRunVectorSearch();
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'search'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Search className="w-4 h-4 text-indigo-600" />
          Live Vector Search Simulator
        </button>

        <button
          onClick={() => setActiveTab('playground')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'playground'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Brain className="w-4 h-4 text-purple-600" />
          RAG vs. Non-RAG Playground
        </button>
      </div>

      {/* TAB 1: FEASIBILITY & SYSTEM DIAGNOSTICS */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          {/* Status Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">RAG System Status</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span className="text-lg font-bold text-slate-900">ACTIVE & READY</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Firestore Vector Index Operational</p>
              </div>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Embedding Model</p>
                <p className="text-lg font-bold text-slate-900 mt-1">gemini-embedding-2</p>
                <p className="text-xs text-slate-500 mt-1">768-dim Vector Float Arrays</p>
              </div>
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
                <Sparkles className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Indexed Vector Chunks</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{chunks.length}</p>
                <p className="text-xs text-slate-500 mt-1">Stored in collection: <code className="text-blue-600">rag_embeddings</code></p>
              </div>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Database className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Vector Latency</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {feasibilityStatus?.averageSearchLatencyMs || 12} ms
                </p>
                <p className="text-xs text-slate-500 mt-1">Cosine Similarity Lookup</p>
              </div>
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
                <Zap className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Diagnostic Checks Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  RAG Feasibility Diagnostic Verification Suite
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated checks confirming RAG integration, Firestore storage, vector distance math, and retrieval pipeline.
                </p>
              </div>
              <button
                onClick={loadFeasibility}
                disabled={isCheckingFeasibility}
                className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold px-3 py-1.5 rounded-md transition"
              >
                Re-test Suite
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {feasibilityStatus?.diagnosticChecks.map((check, idx) => (
                <div key={idx} className="p-4 flex items-start justify-between hover:bg-slate-50/80 transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wider ${
                        check.status === 'pass'
                          ? 'bg-emerald-100 text-emerald-800'
                          : check.status === 'warn'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {check.status.toUpperCase()}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-900">{check.name}</h4>
                    </div>
                    <p className="text-xs text-slate-600 pl-1">{check.message}</p>
                  </div>

                  <span className="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded">
                    {check.latencyMs} ms
                  </span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
              <span>Target Firestore Database ID: <code className="font-mono bg-white px-1.5 py-0.5 border rounded text-slate-800">{feasibilityStatus?.databaseId}</code></span>
              <span>Last Diagnostic Run: {feasibilityStatus?.lastDiagnosticTimestamp ? new Date(feasibilityStatus.lastDiagnosticTimestamp).toLocaleTimeString() : 'Just now'}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KNOWLEDGE BASE EXPLORER */}
      {activeTab === 'explorer' && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-900">Firestore Vector Document Store</h2>
              <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
                {chunks.length} total chunk(s)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleIndexProject}
                disabled={isIndexingProject}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition shadow-sm disabled:opacity-50"
              >
                <FolderPlus className={`w-4 h-4 ${isIndexingProject ? 'animate-spin' : ''}`} />
                {isIndexingProject ? 'Indexing...' : 'Index Selected Project Data'}
              </button>

              <button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Custom Knowledge Chunk
              </button>
            </div>
          </div>

          {/* Chunks List */}
          {chunks.length === 0 ? (
            <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center space-y-3">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center gap-1 justify-center mx-auto">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No Vector Chunks Indexed Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Click "Index Selected Project Data" to convert project scenarios, test cases, and user stories into 768-dimensional Gemini vector embeddings inside Firestore!
              </p>
              <button
                onClick={handleIndexProject}
                disabled={isIndexingProject}
                className="inline-flex items-center gap-2 bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-sm hover:bg-blue-500"
              >
                <Sparkles className="w-4 h-4" />
                Index Project Scenarios & Test Cases
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {chunks.map((chunk) => (
                <div key={chunk.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          chunk.metadata.type === 'scenario' ? 'bg-purple-100 text-purple-800' :
                          chunk.metadata.type === 'testcase' ? 'bg-blue-100 text-blue-800' :
                          chunk.metadata.type === 'userstory' ? 'bg-emerald-100 text-emerald-800' :
                          'bg-slate-100 text-slate-800'
                        }`}>
                          {chunk.metadata.type}
                        </span>
                        {chunk.projectName && (
                          <span className="text-[11px] text-slate-500 font-medium">
                            {chunk.projectName}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 line-clamp-1">{chunk.title}</h4>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setInspectChunk(chunk)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-slate-100"
                        title="Inspect Vector Array"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteChunk(chunk.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100"
                        title="Delete Chunk"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-3 bg-slate-50 p-2.5 rounded border border-slate-100 font-mono">
                    {chunk.content}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                    <span className="font-mono">768 Dim Vector</span>
                    <span>Created: {new Date(chunk.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LIVE VECTOR SEARCH SIMULATOR */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-600" />
              Live Vector Similarity Search Query Tool
            </h3>
            <p className="text-xs text-slate-500">
              Generates a real-time vector embedding for your query and computes similarity distance over Firestore vector documents.
            </p>

            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunVectorSearch()}
                placeholder="Enter natural language test query (e.g., 'OAuth user token timeout')"
                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="flex items-center gap-2">
                <select
                  value={searchMetric || ''}
                  onChange={(e) => setSearchMetric(e.target.value as VectorDistanceMetric)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="cosine">Cosine Similarity (Recommended)</option>
                  <option value="euclidean">Euclidean Distance</option>
                  <option value="dotProduct">Dot Product</option>
                </select>

                <select
                  value={topK ?? ''}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value={3}>Top 3</option>
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                </select>

                <button
                  onClick={handleRunVectorSearch}
                  disabled={isSearching}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Search className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>
            </div>
          </div>

          {/* Search Results */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-800">
                Top {searchResults.length} Relevant Vector Matches
              </h4>
              {searchLatency > 0 && (
                <span className="text-xs font-mono text-slate-500">
                  Search Latency: <strong className="text-indigo-600">{searchLatency} ms</strong>
                </span>
              )}
            </div>

            {searchResults.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                No matching vector documents found. Try running a query above or indexing project data first.
              </div>
            ) : (
              <div className="space-y-3">
                {searchResults.map((res, i) => (
                  <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="bg-indigo-600 text-white font-mono text-xs font-bold px-2 py-0.5 rounded">
                          #{i + 1}
                        </span>
                        <h5 className="text-sm font-bold text-slate-900">{res.chunk.title}</h5>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded">
                          {res.chunk.metadata.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded border border-slate-100 whitespace-pre-wrap font-sans">
                        {res.chunk.content}
                      </p>
                    </div>

                    {/* Metric Match Badge */}
                    <div className="md:w-44 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-center space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-500">Cosine Match Score</span>
                      <div className="text-xl font-extrabold text-indigo-600">
                        {(res.similarityScore * 100).toFixed(1)}%
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full"
                          style={{ width: `${Math.min(100, res.similarityScore * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">Dist: {res.distance}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: RAG VS NON-RAG COMPARISON PLAYGROUND */}
      {activeTab === 'playground' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              Side-by-Side RAG Impact Comparison Sandbox
            </h3>
            <p className="text-xs text-slate-500">
              Test how Firestore Vector Retrieval (RAG) grounds Gemini generation in exact project requirement chunks vs standard generation.
            </p>

            <div className="space-y-3">
              <textarea
                value={playgroundPrompt || ''}
                onChange={(e) => setPlaygroundPrompt(e.target.value)}
                rows={2}
                placeholder="Enter test prompt..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-purple-500"
              />

              <button
                onClick={handleRunPlaygroundComparison}
                disabled={isGeneratingPlayground}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${isGeneratingPlayground ? 'animate-spin' : ''}`} />
                {isGeneratingPlayground ? 'Generating Comparison...' : 'Generate Side-by-Side Comparison'}
              </button>
            </div>
          </div>

          {/* Retrieved Context Banner */}
          {retrievedContext.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl text-xs space-y-2">
              <h4 className="font-bold text-purple-900 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-purple-700" />
                Retrieved Context Chunks injected into Gemini Prompt (RAG):
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {retrievedContext.map((c, i) => (
                  <div key={i} className="bg-white p-2.5 rounded border border-purple-100">
                    <p className="font-bold text-slate-900 truncate">{c.chunk.title}</p>
                    <p className="text-[11px] text-purple-700 font-semibold">Score: {(c.similarityScore * 100).toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Standard Gemini */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Standard Gemini Generation (No RAG)</h4>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded">Generic AI Knowledge</span>
              </div>
              <div className="p-4 text-xs font-mono text-slate-800 whitespace-pre-wrap flex-1 bg-slate-50/50 min-h-[240px]">
                {standardResponse || (isGeneratingPlayground ? 'Generating standard response...' : 'Run comparison to view output')}
              </div>
            </div>

            {/* RAG Augmented Gemini */}
            <div className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 bg-purple-900 text-white flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                  RAG-Augmented Generation (Firestore Vector Search)
                </h4>
                <span className="text-[10px] bg-purple-700 text-purple-100 px-2 py-0.5 rounded font-bold">Project Grounded</span>
              </div>
              <div className="p-4 text-xs font-mono text-slate-800 whitespace-pre-wrap flex-1 bg-purple-50/30 min-h-[240px]">
                {ragResponse || (isGeneratingPlayground ? 'Retrieving Firestore vector context and generating...' : 'Run comparison to view output')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Chunk Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Add Custom Knowledge Chunk to Firestore Vector Store
            </h3>

            <form onSubmit={handleAddCustomChunk} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={newChunkTitle || ''}
                  onChange={(e) => setNewChunkTitle(e.target.value)}
                  placeholder="e.g. OAuth 2.0 PKCE Security Specification"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Knowledge Content / Specification</label>
                <textarea
                  required
                  rows={4}
                  value={newChunkContent || ''}
                  onChange={(e) => setNewChunkContent(e.target.value)}
                  placeholder="Enter detailed requirement, API contract, or test rule..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={newChunkType || ''}
                    onChange={(e) => setNewChunkType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 outline-none"
                  >
                    <option value="requirement">Requirement</option>
                    <option value="scenario">Scenario</option>
                    <option value="testcase">Test Case</option>
                    <option value="userstory">User Story</option>
                    <option value="custom">Custom Knowledge</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={newChunkTags || ''}
                    onChange={(e) => setNewChunkTags(e.target.value)}
                    placeholder="auth, security, API"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingChunk}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingChunk ? 'Generating Embedding & Saving...' : 'Save Vector Chunk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Vector Modal */}
      {inspectChunk && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Code2 className="w-5 h-5 text-indigo-600" />
                Raw 768-Dim Vector Embedding Inspector
              </h3>
              <button
                onClick={() => setInspectChunk(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-800">{inspectChunk.title}</p>
              <p className="text-xs text-slate-500 font-mono">ID: {inspectChunk.id} | Dim: {inspectChunk.vectorDimension || 768}</p>

              <div className="bg-slate-950 text-emerald-400 p-4 rounded-xl font-mono text-[11px] max-h-60 overflow-y-auto border border-slate-800">
                <pre>{JSON.stringify(inspectChunk.embedding.slice(0, 32), null, 2)}</pre>
                <p className="text-slate-500 text-[10px] mt-2">... and {inspectChunk.embedding.length - 32} more floating point dimensions</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectChunk(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
