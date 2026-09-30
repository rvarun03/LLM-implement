import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  Gauge,
  Zap,
  Clock,
  Sparkles,
  Smartphone,
  Monitor,
  Wifi,
  History,
  GitCompare,
  Download,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  Filter,
  Layers,
  Code,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Info,
  Server,
  BarChart3,
  Sliders,
  Radio
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  BarChart,
  Bar
} from 'recharts';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { Project, User } from '../types';
import { deductExportCredits } from '../services/creditService';
import { WebRecordAndCapture } from './WebRecordAndCapture';

export interface WebsitePerformanceTestingProps {
  project?: Project;
  user?: User;
  onUpdateProject?: (project: Project) => void;
}

// -----------------------------------------------------------------------------
// TYPES & INTERFACES
// -----------------------------------------------------------------------------

export interface WebVitalMetric {
  value: number;
  unit: string;
  rating: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR';
  displayValue: string;
  weightPercent?: number;
  description: string;
}

export interface WebsitePerformanceMetrics {
  overallScore: number;
  ttfb: WebVitalMetric;
  fcp: WebVitalMetric;
  lcp: WebVitalMetric;
  tbt: WebVitalMetric;
  cls: WebVitalMetric;
  tti: WebVitalMetric;
  speedIndex: WebVitalMetric;
}

export interface PlainLanguageSummary {
  loading: { status: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; label: string; description: string };
  interactivity: { status: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; label: string; description: string };
  stability: { status: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; label: string; description: string };
  speedIndex: { status: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; label: string; description: string };
}

export interface QuickWin {
  id: string;
  title: string;
  description: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  potentialSavings: string;
  category: 'images' | 'scripts' | 'caching' | 'fonts' | 'compression' | 'dom';
}

export interface AuditOpportunityItem {
  url?: string;
  label?: string;
  wastedBytes?: number;
  wastedMs?: number;
  totalBytes?: number;
  suggestion?: string;
}

export interface AuditOpportunity {
  id: string;
  title: string;
  description: string;
  score: number;
  displayValue: string;
  estimatedSavingsMs?: number;
  estimatedSavingsBytes?: number;
  items: AuditOpportunityItem[];
  guidance: string;
  codeSnippet?: string;
}

export interface ResourceCategory {
  type: 'document' | 'script' | 'stylesheet' | 'image' | 'font' | 'media' | 'xhr' | 'other';
  label: string;
  count: number;
  bytes: number;
  color: string;
}

export interface WaterfallTiming {
  startTimeMs: number;
  dnsMs: number;
  connectMs: number;
  sslMs: number;
  ttfbMs: number;
  downloadMs: number;
  totalMs: number;
}

export interface WaterfallRequest {
  id: string;
  index: number;
  url: string;
  name: string;
  domain: string;
  type: 'document' | 'script' | 'stylesheet' | 'image' | 'font' | 'media' | 'xhr' | 'other';
  status: number;
  statusText: string;
  protocol: string;
  method: string;
  sizeBytes: number;
  uncompressedBytes: number;
  isCompressed: boolean;
  compressionType: string;
  cacheControl: string;
  isCached: boolean;
  timing: WaterfallTiming;
}

export interface WebsitePerformanceReport {
  id: string;
  targetUrl: string;
  domain: string;
  device: 'mobile' | 'desktop';
  throttling: 'none' | '4g' | 'fast3g' | 'slow3g';
  location: string;
  testedAt: string;
  cached: boolean;
  overallScore: number;
  metrics: WebsitePerformanceMetrics;
  plainLanguage: PlainLanguageSummary;
  quickWins: QuickWin[];
  opportunities: AuditOpportunity[];
  diagnostics: AuditOpportunity[];
  resources: {
    totalRequests: number;
    totalBytes: number;
    categories: ResourceCategory[];
  };
  thirdParties: Array<{
    entity: string;
    category: string;
    transferBytes: number;
    blockingTimeMs: number;
    urls: string[];
  }>;
  dom: {
    totalElements: number;
    maxDepth: number;
    maxChildren: number;
    rating: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR';
  };
  waterfall: WaterfallRequest[];
}

export const WebsitePerformanceTesting: React.FC<WebsitePerformanceTestingProps> = ({ project, user, onUpdateProject }) => {
  // Config state
  const [url, setUrl] = useState<string>(project?.url || 'https://');
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [throttling, setThrottling] = useState<'none' | '4g' | 'fast3g' | 'slow3g'>('4g');
  const [location, setLocation] = useState<string>('US-East (N. Virginia)');
  const [forceFresh, setForceFresh] = useState<boolean>(false);

  // Execution & Polling state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Result & View state
  const [report, setReport] = useState<WebsitePerformanceReport | null>(null);
  const [viewMode, setViewMode] = useState<'simple' | 'detailed'>('simple');
  const [activeTab, setActiveTab] = useState<'audit' | 'record_capture' | 'waterfall' | 'history' | 'comparison'>('audit');

  // Technical Accordion & Filter states
  const [expandedAuditIds, setExpandedAuditIds] = useState<Record<string, boolean>>({});
  const [waterfallFilter, setWaterfallFilter] = useState<string>('all');
  const [waterfallSearch, setWaterfallSearch] = useState<string>('');

  // History & Comparison state
  const [historyList, setHistoryList] = useState<WebsitePerformanceReport[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [compareIdA, setCompareIdA] = useState<string>('');
  const [compareIdB, setCompareIdB] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<any | null>(null);

  // Set default project URL if available
  useEffect(() => {
    if (project?.url && (!url || url === 'https://')) {
      setUrl(project.url);
    }
  }, [project?.url]);

  // Load history on mount or URL change
  const fetchHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const res = await fetch(`/api/website-performance/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data);
      }
    } catch (e) {
      console.warn('Failed to load website performance history', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // Poll active audit job
  useEffect(() => {
    let timer: any = null;
    if (isRunning && activeJobId) {
      timer = setInterval(async () => {
        try {
          const res = await fetch(`/api/website-performance/jobs/${activeJobId}`);
          if (!res.ok) {
            clearInterval(timer);
            setIsRunning(false);
            setError('Failed to poll audit status.');
            return;
          }
          const job = await res.json();
          setProgress(job.progress || 0);
          setCurrentStep(job.currentStep || 'Analyzing...');

          if (job.status === 'completed' && job.result) {
            clearInterval(timer);
            setIsRunning(false);
            setReport(job.result);
            fetchHistory();
          } else if (job.status === 'failed') {
            clearInterval(timer);
            setIsRunning(false);
            setError(job.error || 'Performance audit failed. Please ensure the target URL is accessible.');
          }
        } catch (e: any) {
          console.error('Polling error:', e);
        }
      }, 1200);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isRunning, activeJobId]);

  // Start Audit
  const handleStartAudit = async (fresh: boolean = false) => {
    let cleanUrl = url.trim();
    if (!cleanUrl) {
      setError('Please enter a valid website URL.');
      return;
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
      setUrl(cleanUrl);
    }

    setError(null);
    setIsRunning(true);
    setProgress(5);
    setCurrentStep('Initiating performance audit...');

    try {
      const res = await fetch('/api/website-performance/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: cleanUrl,
          device,
          throttling,
          location,
          forceFresh: fresh || forceFresh
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setIsRunning(false);
        setError(data.error || 'Failed to start performance audit.');
        return;
      }

      if (data.status === 'completed' && data.report) {
        // Fast cached hit
        setProgress(100);
        setCurrentStep('Loaded from cache');
        setIsRunning(false);
        setReport(data.report);
      } else {
        setActiveJobId(data.jobId);
      }
    } catch (e: any) {
      setIsRunning(false);
      setError(e.message || 'Network error while contacting performance engine.');
    }
  };

  // Compare two runs
  const handleRunComparison = async () => {
    if (!compareIdA || !compareIdB) return;
    try {
      const res = await fetch(`/api/website-performance/compare?id1=${compareIdA}&id2=${compareIdB}`);
      if (res.ok) {
        const data = await res.json();
        setComparisonResult(data);
      }
    } catch (e) {
      console.error('Comparison error', e);
    }
  };

  // Toggle accordion item
  const toggleAuditExpand = (id: string) => {
    setExpandedAuditIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filtered waterfall list
  const filteredWaterfall = useMemo(() => {
    if (!report?.waterfall) return [];
    return report.waterfall.filter(req => {
      const matchesType = waterfallFilter === 'all' || req.type === waterfallFilter;
      const matchesSearch =
        !waterfallSearch ||
        req.name.toLowerCase().includes(waterfallSearch.toLowerCase()) ||
        req.url.toLowerCase().includes(waterfallSearch.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [report?.waterfall, waterfallFilter, waterfallSearch]);

  // Historical data points for trend chart
  const trendData = useMemo(() => {
    const matched = historyList
      .filter(h => report && h.targetUrl.toLowerCase() === report.targetUrl.toLowerCase())
      .slice(0, 15)
      .reverse();

    return matched.map(m => ({
      date: new Date(m.testedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      score: m.overallScore,
      lcp: m.metrics.lcp.value,
      fcp: m.metrics.fcp.value,
      device: m.device
    }));
  }, [historyList, report]);

  // Export PDF using jsPDF
  const handleExportPdf = async () => {
    if (!report) return;

    const ok = await deductExportCredits(project?.id || 'proj-default', 'web_performance', user, 'Export PDF Report', project?.name);
    if (!ok) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Slate header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setTextColor(0, 225, 197);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('AutomatiQA Performance', 14, 14);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Lighthouse Audit Report: ${report.domain}`, 14, 21);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.text(`Tested: ${new Date(report.testedAt).toLocaleString()}`, pageWidth - 14, 18, { align: 'right' });

    let y = 36;
    // Score box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, y, pageWidth - 28, 26, 3, 3, 'F');

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Overall Performance Score: ${report.overallScore} / 100`, 18, y + 10);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Device: ${report.device.toUpperCase()}   |   Throttling: ${report.throttling.toUpperCase()}   |   Location: ${report.location}`, 18, y + 18);

    y += 34;

    // Metrics table
    doc.setFillColor(16, 185, 129);
    doc.rect(14, y, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('CORE WEB VITALS & TIMING METRICS', 18, y + 5.5);

    y += 11;
    const metricsRows = [
      ['Largest Contentful Paint (LCP)', report.metrics.lcp.displayValue, report.metrics.lcp.rating],
      ['Total Blocking Time (TBT)', report.metrics.tbt.displayValue, report.metrics.tbt.rating],
      ['Cumulative Layout Shift (CLS)', report.metrics.cls.displayValue, report.metrics.cls.rating],
      ['First Contentful Paint (FCP)', report.metrics.fcp.displayValue, report.metrics.fcp.rating],
      ['Time to First Byte (TTFB)', report.metrics.ttfb.displayValue, report.metrics.ttfb.rating],
      ['Speed Index', report.metrics.speedIndex.displayValue, report.metrics.speedIndex.rating],
      ['Time to Interactive (TTI)', report.metrics.tti.displayValue, report.metrics.tti.rating]
    ];

    metricsRows.forEach(([name, val, rating], idx) => {
      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
      doc.rect(14, y, pageWidth - 28, 7, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(name, 18, y + 4.8);

      doc.setTextColor(rating === 'GOOD' ? 16 : rating === 'NEEDS_IMPROVEMENT' ? 217 : 225, rating === 'GOOD' ? 185 : rating === 'NEEDS_IMPROVEMENT' ? 119 : 29, 72);
      doc.text(`${val} (${rating})`, pageWidth - 18, y + 4.8, { align: 'right' });
      y += 7;
    });

    y += 10;
    // Quick Wins Section
    doc.setFillColor(15, 23, 42);
    doc.rect(14, y, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('KEY RECOMMENDATIONS & QUICK WINS', 18, y + 5.5);

    y += 11;
    report.quickWins.forEach((qw, i) => {
      doc.setFillColor(255, 255, 255);
      doc.rect(14, y, pageWidth - 28, 12, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`${i + 1}. ${qw.title}`, 18, y + 4.5);

      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(`${qw.potentialSavings} - ${qw.description}`, 18, y + 9);
      y += 13;
    });

    saveAs(doc.output('blob'), `Lighthouse_Audit_${report.domain.replace(/[^a-z0-9]/gi, '_')}.pdf`);
  };

  // Export JSON
  const handleExportJson = async () => {
    if (!report) return;

    const ok = await deductExportCredits(project?.id || 'proj-default', 'web_performance', user, 'Export JSON Report', project?.name);
    if (!ok) return;

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    saveAs(blob, `Lighthouse_Audit_${report.domain.replace(/[^a-z0-9]/gi, '_')}.json`);
  };

  // Color helper for scores
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500 bg-emerald-50 border-emerald-200';
    if (score >= 50) return 'text-amber-500 bg-amber-50 border-amber-200';
    return 'text-rose-500 bg-rose-50 border-rose-200';
  };

  const getScoreGradient = (score: number) => {
    if (score >= 90) return 'from-emerald-500 to-teal-600 text-emerald-400';
    if (score >= 50) return 'from-amber-500 to-orange-600 text-amber-400';
    return 'from-rose-500 to-red-600 text-rose-400';
  };

  const getRatingBadge = (rating: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR') => {
    switch (rating) {
      case 'GOOD':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 size={12} className="text-emerald-600" /> Good
          </span>
        );
      case 'NEEDS_IMPROVEMENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle size={12} className="text-amber-600" /> Needs Improvement
          </span>
        );
      case 'POOR':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle size={12} className="text-rose-600" /> Poor
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#0c1017] via-[#111827] to-[#0c1017] p-8 md:p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles size={12} /> Google Lighthouse Engine
              </span>
              <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                Core Web Vitals & Waterfall Analysis
              </span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight uppercase">Website Performance Testing</h1>
            <p className="text-sm text-slate-400 font-medium max-w-2xl mt-2 leading-relaxed">
              Full Google Lighthouse-style page performance audit. Measure Core Web Vitals, diagnose render-blocking resources, inspect network waterfall timelines, and simulate real mobile and desktop connection speeds.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800 backdrop-blur-md">
            <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-xl">
              <Gauge size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Audit Engine</p>
              <p className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Ready & Active
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-200/80 rounded-2xl border border-slate-300">
          <button
            id="tab-view-audit"
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Gauge size={14} /> Audit Overview
          </button>
          <button
            id="tab-view-record-capture"
            type="button"
            onClick={() => setActiveTab('record_capture')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'record_capture'
                ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/25 font-extrabold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio size={14} className={activeTab === 'record_capture' ? 'animate-pulse text-white' : 'text-rose-500'} />
            Record & Capture
            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${
              activeTab === 'record_capture' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'
            }`}>
              JMX
            </span>
          </button>
          <button
            id="tab-view-waterfall"
            type="button"
            onClick={() => setActiveTab('waterfall')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'waterfall' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 size={14} /> Network Waterfall
            {report && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-slate-100 text-slate-700 font-extrabold">
                {report.waterfall.length}
              </span>
            )}
          </button>
          <button
            id="tab-view-history"
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History size={14} /> Trends & History
          </button>
          <button
            id="tab-view-comparison"
            type="button"
            onClick={() => setActiveTab('comparison')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'comparison' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitCompare size={14} /> Compare Runs
          </button>
        </div>

        {report && (
          <div className="flex items-center gap-2">
            {activeTab === 'audit' && (
              <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  id="toggle-view-simple"
                  type="button"
                  onClick={() => setViewMode('simple')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'simple' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Simple View
                </button>
                <button
                  id="toggle-view-detailed"
                  type="button"
                  onClick={() => setViewMode('detailed')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    viewMode === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Detailed View
                </button>
              </div>
            )}

            <button
              id="btn-export-pdf"
              type="button"
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition-all"
            >
              <Download size={14} /> PDF Report
            </button>
            <button
              id="btn-export-json"
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition-all"
            >
              <Code size={14} /> JSON
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: AUDIT - URL Entry & Configuration Card */}
      {activeTab === 'audit' && (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex-1 relative">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Target Website URL</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Globe size={18} />
                </div>
                <input
                  id="input-website-audit-url"
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  disabled={isRunning}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Device Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Device</label>
                <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    id="btn-device-mobile"
                    type="button"
                    onClick={() => setDevice('mobile')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      device === 'mobile' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Smartphone size={14} /> Mobile
                  </button>
                  <button
                    id="btn-device-desktop"
                    type="button"
                    onClick={() => setDevice('desktop')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      device === 'desktop' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Monitor size={14} /> Desktop
                  </button>
                </div>
              </div>

              {/* Throttling Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Network Speed</label>
                <select
                  id="select-throttling"
                  value={throttling}
                  onChange={e => setThrottling(e.target.value as any)}
                  disabled={isRunning}
                  className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="none">⚡ No Throttling (Direct)</option>
                  <option value="4g">📶 Regular 4G (120ms RTT, 9 Mbps)</option>
                  <option value="fast3g">📱 Fast 3G (350ms RTT, 1.6 Mbps)</option>
                  <option value="slow3g">🐌 Slow 3G (1200ms RTT, 450 Kbps)</option>
                </select>
              </div>

              {/* Run Button */}
              <div className="self-end pt-5 lg:pt-0">
                <button
                  id="btn-run-performance-audit"
                  type="button"
                  onClick={() => handleStartAudit(false)}
                  disabled={isRunning}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-cyan-500/25 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Auditing...
                    </>
                  ) : (
                    <>
                      <Zap size={16} /> Run Performance Audit
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Optional Re-run Fresh Checkbox */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={forceFresh}
                onChange={e => setForceFresh(e.target.checked)}
                className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
              />
              <span>Bypass cached results and force a fresh browser audit run</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Simulation Location:</span>
              <span className="font-semibold text-slate-700">{location}</span>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-start gap-3">
              <AlertTriangle size={18} className="shrink-0 text-rose-500 mt-0.5" />
              <div>
                <p className="font-bold">Audit Failed</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Progress Bar while running */}
          {isRunning && (
            <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 text-white space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-cyan-400" />
                  {currentStep || 'Running Lighthouse Audit...'}
                </span>
                <span className="font-mono font-bold text-slate-400">{progress}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Simulating realistic {device} browser interaction, analyzing Core Web Vitals, recording render-blocking styles, and assembling network waterfall...
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: RECORD & CAPTURE STUDIO */}
      {activeTab === 'record_capture' && (
        <div className="animate-in fade-in duration-300">
          <WebRecordAndCapture project={project} user={user} initialUrl={url} onUpdateProject={onUpdateProject} />
        </div>
      )}

      {/* TAB 1: AUDIT OVERVIEW (SIMPLE & DETAILED VIEWS) */}
      {report && activeTab === 'audit' && (
        <div className="space-y-8">
          {/* Executive Score & Core Web Vitals Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Overall Score Gauge Card */}
            <div className="lg:col-span-4 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Overall Performance Score</p>
              
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="text-slate-100"
                    strokeWidth="10"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * report.overallScore) / 100}
                    strokeLinecap="round"
                    className={`transition-all duration-1000 ${
                      report.overallScore >= 90 ? 'text-emerald-500' : report.overallScore >= 50 ? 'text-amber-500' : 'text-rose-500'
                    }`}
                    strokeWidth="10"
                    stroke="currentColor"
                    fill="transparent"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-slate-900 tracking-tight">{report.overallScore}</span>
                  <span className="text-[11px] font-bold text-slate-400 uppercase">out of 100</span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getScoreColor(report.overallScore)}`}>
                  {report.overallScore >= 90 ? 'Fast & Optimized' : report.overallScore >= 50 ? 'Needs Improvement' : 'Slow Performance'}
                </span>
                {report.cached && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                    Cached Result
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-3 max-w-xs leading-relaxed">
                Calculated using Google Lighthouse standard metric weights (LCP 25%, TBT 30%, CLS 25%, FCP 10%, Speed Index 10%).
              </p>
            </div>

            {/* Core Web Vitals Card Grid */}
            <div className="lg:col-span-8 bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Core Web Vitals Assessment</h3>
                  <p className="text-xs text-slate-500 font-medium">Standard thresholds used by Google search ranking and UX benchmarks.</p>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> &lt;2.5s Good</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Needs Improvement</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Poor</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* LCP Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider">LCP (Loading)</span>
                    {getRatingBadge(report.metrics.lcp.rating)}
                  </div>
                  <p className="text-2xl font-black text-slate-900">{report.metrics.lcp.displayValue}</p>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Largest Contentful Paint. Main visual element loaded.
                  </p>
                </div>

                {/* TBT Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider">TBT (Interactivity)</span>
                    {getRatingBadge(report.metrics.tbt.rating)}
                  </div>
                  <p className="text-2xl font-black text-slate-900">{report.metrics.tbt.displayValue}</p>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Total Blocking Time. CPU delays on user taps/clicks.
                  </p>
                </div>

                {/* CLS Card */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider">CLS (Stability)</span>
                    {getRatingBadge(report.metrics.cls.rating)}
                  </div>
                  <p className="text-2xl font-black text-slate-900">{report.metrics.cls.displayValue}</p>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Cumulative Layout Shift. Visual stability of layout.
                  </p>
                </div>
              </div>

              {/* Secondary timing row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">First Contentful Paint</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{report.metrics.fcp.displayValue}</p>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Time to First Byte</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{report.metrics.ttfb.displayValue}</p>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Speed Index</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{report.metrics.speedIndex.displayValue}</p>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Time to Interactive</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{report.metrics.tti.displayValue}</p>
                </div>
              </div>
            </div>
          </div>

          {/* SIMPLE VIEW: Plain-Language Summary & Top Quick Wins */}
          {viewMode === 'simple' && (
            <div className="space-y-6">
              {/* Plain Language Core Experience Summary */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="p-2.5 bg-cyan-50 text-cyan-600 rounded-xl">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Plain-Language Experience Summary</h3>
                    <p className="text-xs text-slate-500 font-medium">How real visitors perceive your website performance.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Loading */}
                  <div className="space-y-2 p-4 bg-slate-50/70 border border-slate-100 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-slate-600" />
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Page Loading</h4>
                    </div>
                    <p className="text-xs font-bold text-slate-700">{report.plainLanguage.loading.label}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{report.plainLanguage.loading.description}</p>
                  </div>

                  {/* Interactivity */}
                  <div className="space-y-2 p-4 bg-slate-50/70 border border-slate-100 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <Zap size={16} className="text-slate-600" />
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Tap & Click Response</h4>
                    </div>
                    <p className="text-xs font-bold text-slate-700">{report.plainLanguage.interactivity.label}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{report.plainLanguage.interactivity.description}</p>
                  </div>

                  {/* Visual Stability */}
                  <div className="space-y-2 p-4 bg-slate-50/70 border border-slate-100 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-slate-600" />
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Visual Stability</h4>
                    </div>
                    <p className="text-xs font-bold text-slate-700">{report.plainLanguage.stability.label}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{report.plainLanguage.stability.description}</p>
                  </div>
                </div>
              </div>

              {/* Top Quick Wins Card */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Top Quick Wins</h3>
                      <p className="text-xs text-slate-500 font-medium">The highest-impact optimizations to implement first.</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
                    {report.quickWins.length} Actionable Fixes
                  </span>
                </div>

                <div className="space-y-4">
                  {report.quickWins.map((qw, idx) => (
                    <div
                      key={qw.id}
                      className="p-5 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white hover:border-cyan-300 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black">
                            {idx + 1}
                          </span>
                          <h4 className="text-sm font-black text-slate-900">{qw.title}</h4>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-100 text-cyan-800 border border-cyan-200">
                          {qw.potentialSavings}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 pl-9 leading-relaxed">{qw.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* DETAILED VIEW: Technical Opportunities, Code Diagnostics & Breakdown */}
          {viewMode === 'detailed' && (
            <div className="space-y-8">
              {/* Opportunities Accordion */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Lighthouse Opportunities</h3>
                    <p className="text-xs text-slate-500 font-medium">Estimated savings in load time and data transfer bytes.</p>
                  </div>
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                    {report.opportunities.length} Opportunities
                  </span>
                </div>

                <div className="space-y-4">
                  {report.opportunities.map(opp => {
                    const isExpanded = expandedAuditIds[opp.id];
                    return (
                      <div key={opp.id} className="border border-slate-200 rounded-2xl overflow-hidden transition-all">
                        <div
                          onClick={() => toggleAuditExpand(opp.id)}
                          className="p-4 bg-slate-50 hover:bg-slate-100/80 cursor-pointer flex items-center justify-between gap-4 select-none"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">{opp.title}</h4>
                              <p className="text-xs text-slate-500 mt-0.5">{opp.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                              {opp.displayValue}
                            </span>
                            {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-5 bg-white border-t border-slate-200 space-y-4 text-xs">
                            <p className="text-slate-700 leading-relaxed font-medium">{opp.guidance}</p>

                            {opp.codeSnippet && (
                              <div className="space-y-1.5">
                                <span className="text-[10px] font-black uppercase text-slate-400">Implementation Snippet:</span>
                                <pre className="p-3 bg-slate-900 text-cyan-300 rounded-xl font-mono text-[11px] overflow-x-auto leading-relaxed">
                                  {opp.codeSnippet}
                                </pre>
                              </div>
                            )}

                            {opp.items && opp.items.length > 0 && (
                              <div className="space-y-2">
                                <span className="text-[10px] font-black uppercase text-slate-400">Flagged Resources:</span>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {opp.items.map((item, i) => (
                                    <div key={i} className="p-2.5 bg-slate-50 rounded-lg flex items-center justify-between text-[11px]">
                                      <span className="font-mono text-slate-800 truncate max-w-md">{item.url || item.label}</span>
                                      <span className="text-slate-500 font-bold shrink-0">
                                        {item.wastedBytes ? `${(item.wastedBytes / 1024).toFixed(1)} KB potential savings` : item.suggestion}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Diagnostics & Technical Insights */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Diagnostics & System Health</h3>
                  <p className="text-xs text-slate-500 font-medium">Browser execution patterns, caching policies, and DOM efficiency.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {report.diagnostics.map(diag => (
                    <div key={diag.id} className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">{diag.title}</h4>
                        <span className="text-[11px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                          {diag.displayValue}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{diag.description}</p>
                      <p className="text-xs text-slate-700 font-medium">{diag.guidance}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Page Weight & Resource Distribution Card */}
              <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Resource Weight Breakdown</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Total: {(report.resources.totalBytes / (1024 * 1024)).toFixed(2)} MB across {report.resources.totalRequests} network requests
                    </p>
                  </div>
                </div>

                {/* Visual Distribution Bar */}
                <div className="w-full h-4 rounded-full overflow-hidden flex bg-slate-100">
                  {report.resources.categories.map(cat => {
                    const pct = report.resources.totalBytes > 0 ? (cat.bytes / report.resources.totalBytes) * 100 : 0;
                    if (pct < 0.5) return null;
                    return (
                      <div
                        key={cat.type}
                        style={{ width: `${pct}%`, backgroundColor: cat.color }}
                        title={`${cat.label}: ${(cat.bytes / 1024).toFixed(1)} KB (${pct.toFixed(1)}%)`}
                        className="h-full transition-all"
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                  {report.resources.categories.map(cat => (
                    <div key={cat.type} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="text-xs font-bold text-slate-700">{cat.label}</span>
                      </div>
                      <p className="text-sm font-black text-slate-900">{(cat.bytes / 1024).toFixed(1)} KB</p>
                      <p className="text-[10px] text-slate-400 font-medium">{cat.count} requests</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: NETWORK WATERFALL CHART */}
      {report && activeTab === 'waterfall' && (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Interactive Network Waterfall</h3>
              <p className="text-xs text-slate-500 font-medium">
                Detailed request timeline and resource lifecycles during page load, similar to GTmetrix and Chrome DevTools.
              </p>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by name..."
                  value={waterfallSearch}
                  onChange={e => setWaterfallSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <select
                value={waterfallFilter}
                onChange={e => setWaterfallFilter(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none"
              >
                <option value="all">All Types ({report.waterfall.length})</option>
                <option value="document">Documents (HTML)</option>
                <option value="script">JavaScript</option>
                <option value="stylesheet">CSS</option>
                <option value="image">Images</option>
                <option value="font">Fonts</option>
                <option value="xhr">XHR / Fetch</option>
              </select>
            </div>
          </div>

          {/* Waterfall Timing Legend */}
          <div className="flex flex-wrap items-center gap-4 text-[11px] font-medium text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="font-bold text-slate-700">Timeline Legend:</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-indigo-400 rounded-sm" /> DNS / Connect</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-amber-400 rounded-sm" /> TTFB (Waiting)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-emerald-500 rounded-sm" /> Content Download</span>
            <span className="ml-auto text-slate-400">Total requests displayed: {filteredWaterfall.length}</span>
          </div>

          {/* Waterfall Table & Gantt Bars */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-black text-[11px] uppercase tracking-wider">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">Resource Name</th>
                  <th className="p-3 w-20">Type</th>
                  <th className="p-3 w-16">Status</th>
                  <th className="p-3 w-20">Size</th>
                  <th className="p-3 w-24">Duration</th>
                  <th className="p-3 min-w-[280px]">Timeline (Waterfall)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredWaterfall.map((req, idx) => {
                  const maxDuration = Math.max(...report.waterfall.map(r => r.timing.startTimeMs + r.timing.totalMs), 1000);
                  const startPct = (req.timing.startTimeMs / maxDuration) * 100;
                  const durationPct = Math.max(2, (req.timing.totalMs / maxDuration) * 100);

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-3 max-w-xs truncate font-mono text-slate-800" title={req.url}>
                        {req.name}
                        <span className="block text-[10px] text-slate-400 truncate">{req.domain}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            req.type === 'script'
                              ? 'bg-amber-100 text-amber-800'
                              : req.type === 'stylesheet'
                              ? 'bg-purple-100 text-purple-800'
                              : req.type === 'image'
                              ? 'bg-emerald-100 text-emerald-800'
                              : req.type === 'font'
                              ? 'bg-pink-100 text-pink-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {req.type}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`font-mono text-xs font-bold ${
                            req.status >= 200 && req.status < 300
                              ? 'text-emerald-600'
                              : req.status >= 300 && req.status < 400
                              ? 'text-blue-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-600">{(req.sizeBytes / 1024).toFixed(1)} KB</td>
                      <td className="p-3 font-mono text-slate-600">{req.timing.totalMs} ms</td>
                      <td className="p-3">
                        <div className="w-full bg-slate-100 h-4 rounded overflow-hidden relative">
                          <div
                            className="absolute top-0 bottom-0 flex rounded overflow-hidden"
                            style={{ left: `${startPct}%`, width: `${durationPct}%` }}
                          >
                            <div className="bg-indigo-400 h-full w-1/4" title={`DNS: ${req.timing.dnsMs}ms`} />
                            <div className="bg-amber-400 h-full w-2/5" title={`TTFB: ${req.timing.ttfbMs}ms`} />
                            <div className="bg-emerald-500 h-full flex-1" title={`Download: ${req.timing.downloadMs}ms`} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: NETWORK WATERFALL */}
      {report && activeTab === 'waterfall' && (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Network Waterfall Timeline</h3>
              <p className="text-xs text-slate-500 font-medium">Inspect timing breakdown (DNS, TTFB, Content Download) for all captured resources.</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter resource name/url..."
                  value={waterfallSearch}
                  onChange={e => setWaterfallSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <select
                value={waterfallFilter}
                onChange={e => setWaterfallFilter(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
              >
                <option value="all">All Resources</option>
                <option value="document">HTML Document</option>
                <option value="script">Scripts (JS)</option>
                <option value="stylesheet">Stylesheets (CSS)</option>
                <option value="image">Images</option>
                <option value="font">Fonts</option>
                <option value="fetch">Fetch / XHR</option>
              </select>
            </div>
          </div>

          {/* Timing Legend */}
          <div className="flex items-center gap-4 text-[11px] font-bold text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase tracking-wider text-[10px]">Timing Legend:</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-indigo-400 rounded-sm" /> DNS Lookup</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-amber-400 rounded-sm" /> TTFB (Server Wait)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 bg-emerald-500 rounded-sm" /> Content Download</span>
            <span className="ml-auto text-slate-400">Total requests displayed: {filteredWaterfall.length}</span>
          </div>

          {/* Waterfall Table & Gantt Bars */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white font-black text-[11px] uppercase tracking-wider">
                  <th className="p-3 w-12 text-center">#</th>
                  <th className="p-3">Resource Name</th>
                  <th className="p-3 w-20">Type</th>
                  <th className="p-3 w-16">Status</th>
                  <th className="p-3 w-20">Size</th>
                  <th className="p-3 w-24">Duration</th>
                  <th className="p-3 min-w-[280px]">Timeline (Waterfall)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredWaterfall.map((req, idx) => {
                  const maxDuration = Math.max(...report.waterfall.map(r => r.timing.startTimeMs + r.timing.totalMs), 1000);
                  const startPct = (req.timing.startTimeMs / maxDuration) * 100;
                  const durationPct = Math.max(2, (req.timing.totalMs / maxDuration) * 100);

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-3 max-w-xs truncate font-mono text-slate-800" title={req.url}>
                        {req.name}
                        <span className="block text-[10px] text-slate-400 truncate">{req.domain}</span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            req.type === 'script'
                              ? 'bg-amber-100 text-amber-800'
                              : req.type === 'stylesheet'
                              ? 'bg-purple-100 text-purple-800'
                              : req.type === 'image'
                              ? 'bg-emerald-100 text-emerald-800'
                              : req.type === 'font'
                              ? 'bg-pink-100 text-pink-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {req.type}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`font-mono text-xs font-bold ${
                            req.status >= 200 && req.status < 300
                              ? 'text-emerald-600'
                              : req.status >= 300 && req.status < 400
                              ? 'text-blue-600'
                              : 'text-rose-600'
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-600">{(req.sizeBytes / 1024).toFixed(1)} KB</td>
                      <td className="p-3 font-mono text-slate-600">{req.timing.totalMs} ms</td>
                      <td className="p-3">
                        <div className="w-full bg-slate-100 h-4 rounded overflow-hidden relative">
                          <div
                            className="absolute top-0 bottom-0 flex rounded overflow-hidden"
                            style={{ left: `${startPct}%`, width: `${durationPct}%` }}
                          >
                            <div className="bg-indigo-400 h-full w-1/4" title={`DNS: ${req.timing.dnsMs}ms`} />
                            <div className="bg-amber-400 h-full w-2/5" title={`TTFB: ${req.timing.ttfbMs}ms`} />
                            <div className="bg-emerald-500 h-full flex-1" title={`Download: ${req.timing.downloadMs}ms`} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Waterfall empty state */}
      {!report && activeTab === 'waterfall' && (
        <div className="bg-white p-12 rounded-[2rem] border border-slate-200 shadow-sm text-center space-y-4 animate-in fade-in">
          <div className="w-16 h-16 bg-cyan-50 rounded-2xl flex items-center justify-center mx-auto text-cyan-600">
            <BarChart3 size={32} />
          </div>
          <h3 className="text-lg font-black text-slate-900 uppercase">No Network Waterfall Data Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
            Run a performance audit in the Audit Overview tab to record the full network waterfall timeline and inspect resource latencies.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold rounded-xl shadow-md hover:brightness-110 transition-all"
          >
            Go to Audit Overview
          </button>
        </div>
      )}

      {/* TAB 3: HISTORICAL TREND ANALYSIS */}
      {activeTab === 'history' && (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Performance Trend Over Time</h3>
            <p className="text-xs text-slate-500 font-medium">
              {report ? `Historical Lighthouse scores and Core Web Vitals for ${report.domain}.` : 'Historical Lighthouse audit runs across past sessions.'}
            </p>
          </div>

          {trendData.length > 1 ? (
            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="score" stroke="#06b6d4" strokeWidth={3} dot={{ r: 5 }} name="Overall Score" />
                  <Line type="monotone" dataKey="lcp" stroke="#10b981" strokeWidth={2} name="LCP (s)" />
                  <Line type="monotone" dataKey="fcp" stroke="#f59e0b" strokeWidth={2} name="FCP (s)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <History size={32} className="mx-auto text-slate-300" />
              <p className="text-sm font-bold">More runs needed for trend visualization</p>
              <p className="text-xs">Run audits across different throttle settings to populate the historical trend graph.</p>
            </div>
          )}

          {/* Historical Runs List */}
          <div className="space-y-3 pt-4">
            <h4 className="text-xs font-black uppercase text-slate-500 tracking-wider">Past Test Runs</h4>
            {historyList.length > 0 ? (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {historyList
                  .filter(h => !report || h.targetUrl.toLowerCase() === report.targetUrl.toLowerCase())
                  .map(item => (
                    <div key={item.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-lg font-black ${getScoreColor(item.overallScore)}`}>
                          {item.overallScore}
                        </span>
                        <div>
                          <p className="font-bold text-slate-800">{new Date(item.testedAt).toLocaleString()}</p>
                          <p className="text-[11px] text-slate-400">
                            {item.targetUrl} • {item.device.toUpperCase()} • {item.throttling.toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReport(item);
                          setActiveTab('audit');
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-all"
                      >
                        View Report
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                No past test runs recorded yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SIDE-BY-SIDE RUN COMPARISON */}
      {activeTab === 'comparison' && (
        <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Side-by-Side Run Comparison</h3>
            <p className="text-xs text-slate-500 font-medium">Compare performance before and after code changes or under different network conditions.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Run A selector */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-slate-600 uppercase">Baseline Run (A)</label>
              <select
                value={compareIdA}
                onChange={e => setCompareIdA(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              >
                <option value="">Select baseline run...</option>
                {historyList.map(h => (
                  <option key={h.id} value={h.id}>
                    Score {h.overallScore} - {h.device.toUpperCase()} - {new Date(h.testedAt).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            </div>

            {/* Run B selector */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <label className="block text-xs font-bold text-slate-600 uppercase">Comparison Run (B)</label>
              <select
                value={compareIdB}
                onChange={e => setCompareIdB(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium"
              >
                <option value="">Select comparison run...</option>
                {historyList.map(h => (
                  <option key={h.id} value={h.id}>
                    Score {h.overallScore} - {h.device.toUpperCase()} - {new Date(h.testedAt).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRunComparison}
            disabled={!compareIdA || !compareIdB}
            className="w-full py-3 bg-slate-900 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-800 disabled:opacity-40 transition-all"
          >
            Calculate Comparison Delta
          </button>

          {/* Comparison Output */}
          {comparisonResult && (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <span className="text-xs font-black uppercase text-slate-500">Comparison Result</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    comparisonResult.comparison.scoreDelta >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {comparisonResult.comparison.verdict}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Score Delta</p>
                  <p
                    className={`text-2xl font-black ${
                      comparisonResult.comparison.scoreDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {comparisonResult.comparison.scoreDelta > 0 ? `+${comparisonResult.comparison.scoreDelta}` : comparisonResult.comparison.scoreDelta}
                  </p>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">LCP Delta</p>
                  <p className="text-xl font-black text-slate-800">
                    {comparisonResult.comparison.lcpDelta > 0 ? `+${comparisonResult.comparison.lcpDelta}s` : `${comparisonResult.comparison.lcpDelta}s`}
                  </p>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">TBT Delta</p>
                  <p className="text-xl font-black text-slate-800">
                    {comparisonResult.comparison.tbtDelta > 0 ? `+${comparisonResult.comparison.tbtDelta}ms` : `${comparisonResult.comparison.tbtDelta}ms`}
                  </p>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Payload Delta</p>
                  <p className="text-xl font-black text-slate-800">
                    {(comparisonResult.comparison.weightDelta / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
