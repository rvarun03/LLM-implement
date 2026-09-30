import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Database, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  TrendingUp, 
  BarChart3, 
  DollarSign, 
  Check, 
  Info,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface CacheStats {
  totalEntries: number;
  hits: number;
  misses: number;
  hitRate: number;
  totalSavedTimeMs: number;
  estimatedCostSavedUsd: number;
  entriesByFunction: Record<string, number>;
  lastUpdated: string;
}

export const AICacheSettings: React.FC = () => {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cache/stats');
      const data = await res.json();
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Failed to fetch cache stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleClearCache = async (functionName?: string) => {
    if (!confirm(functionName ? `Clear cache for ${functionName}?` : 'Are you sure you want to clear all AI response cache?')) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch('/api/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ functionName })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(functionName ? `Cleared ${data.clearedCount} items from ${functionName} cache.` : 'Cleared all AI response cache!');
        if (data.stats) setStats(data.stats);
        else fetchStats();
      } else {
        toast.error('Failed to clear cache.');
      }
    } catch (err) {
      toast.error('Network error clearing cache.');
    } finally {
      setClearing(false);
    }
  };

  const featureCategoryMap: Array<{ name: string; key: string; description: string; status: string }> = [
    { name: 'AI Scenario Generation', key: 'generateScenariosFromInput', description: 'Caches test scenarios generated from user stories, docs, and URLs.', status: 'Active' },
    { name: 'AI Test Case Generation', key: 'generateTestCasesFromScenario', description: 'Caches detailed test cases generated from scenarios.', status: 'Active' },
    { name: 'Automation Script Generation', key: 'generateAutomationScript', description: 'Caches Playwright/Appium POM scripts generated from test cases.', status: 'Active' },
    { name: 'API Test Generation', key: 'generateScenariosFromApiResponse', description: 'Caches API tests generated from Swagger/OpenAPI specs.', status: 'Active' },
    { name: 'Performance Test Generation', key: 'generatePerformanceScenarios', description: 'Caches load profiles and JMeter scripts.', status: 'Active' },
    { name: 'UI Screenshot Analysis', key: 'performUITesting', description: 'Caches UI bug analysis reports from screenshots.', status: 'Active' },
    { name: 'Figma Design Analysis', key: 'performFigmaDesignReview', description: 'Caches Figma design reviews and gap analyses.', status: 'Active' },
    { name: 'Acceptance Criteria / Stories', key: 'generateUserStoriesFromDoc', description: 'Caches user stories parsed from requirement documents.', status: 'Active' },
    { name: 'PR Impact & Code Parse', key: 'analyzePrImpact', description: 'Caches PR regression risk analysis and code step parsing.', status: 'Active' },
    { name: 'Synthetic User Generator', key: 'generateSyntheticUsers', description: 'Caches AI synthetic test persona data.', status: 'Active' },
  ];

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const sec = (ms / 1000).toFixed(1);
    if (Number(sec) < 60) return `${sec}s`;
    const min = (Number(sec) / 60).toFixed(1);
    return `${min}m`;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-indigo-700/50">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-500/30 rounded-lg text-indigo-300">
              <Zap size={24} className="text-yellow-400 fill-yellow-400" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">AI Response Caching & Optimization</h1>
          </div>
          <p className="text-indigo-200 text-sm max-w-2xl">
            Automatically caches repeated AI requests to eliminate latency, prevent rate-limits, and optimize API costs across AutomatiQA modules.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-700/50 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium border border-indigo-500/30 transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => handleClearCache()}
            disabled={clearing || !stats?.totalEntries}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-sm font-medium shadow transition-all disabled:opacity-50"
          >
            <Trash2 size={16} />
            Flush Cache
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Cache Hits</span>
            <Database size={18} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {stats?.hits ?? 0}
            <span className="text-xs font-normal text-slate-500 ml-2">/ {((stats?.hits ?? 0) + (stats?.misses ?? 0))} total</span>
          </div>
          <p className="text-xs text-slate-500">
            Instant AI requests served
          </p>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Time Saved</span>
            <Clock size={18} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {formatTime(stats?.totalSavedTimeMs ?? 0)}
          </div>
          <p className="text-xs text-slate-500">
            Total wait time eliminated
          </p>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Hit Rate</span>
            <TrendingUp size={18} className="text-blue-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {stats?.hitRate ?? 0}%
          </div>
          <p className="text-xs text-slate-500">
            Efficiency percentage
          </p>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Cached Items</span>
            <BarChart3 size={18} className="text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {stats?.totalEntries ?? 0}
          </div>
          <p className="text-xs text-slate-500">
            Active items in persistent store
          </p>
        </div>
      </div>

      {/* Feature Caching Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck size={20} className="text-indigo-600" />
              AutomatiQA Caching Coverage
            </h2>
            <p className="text-xs text-slate-500">
              Overview of AI features optimized with deterministic response caching
            </p>
          </div>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200 flex items-center gap-1.5">
            <CheckCircle2 size={14} /> AI Cache Engine Enabled
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {featureCategoryMap.map((feature) => {
            const cachedCount = stats?.entriesByFunction?.[feature.key] ?? 0;
            return (
              <div key={feature.key} className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm">{feature.name}</span>
                    <span className="px-2 py-0.5 text-[11px] font-medium bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
                      {feature.key}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{feature.description}</p>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center shrink-0">
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-700 block">
                      {cachedCount} {cachedCount === 1 ? 'item' : 'items'}
                    </span>
                    <span className="text-[10px] text-slate-400">In Cache</span>
                  </div>

                  {cachedCount > 0 && (
                    <button
                      onClick={() => handleClearCache(feature.key)}
                      title={`Clear ${feature.name} cache`}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}

                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-emerald-100/80 text-emerald-800 rounded-lg">
                    <Check size={12} /> {feature.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic Exclusions Info Box */}
      <div className="p-5 bg-amber-50/80 rounded-2xl border border-amber-200 text-amber-900 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-sm text-amber-950">
          <Info size={18} className="text-amber-700 shrink-0" />
          Explicit Exclusions for Real-Time Accuracy
        </div>
        <p className="text-xs text-amber-800 leading-relaxed">
          Dynamic operations such as <strong>Live Jira sync</strong>, <strong>GitHub commit tracking</strong>, <strong>Real-time test execution status</strong>, <strong>Live execution reports</strong>, and <strong>Active device heartbeat telemetry</strong> are explicitly excluded from caching to guarantee real-time data integrity.
        </p>
      </div>
    </div>
  );
};
