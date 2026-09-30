import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Zap,
  Users,
  TrendingUp,
  Clock,
  ShieldCheck,
  ShieldAlert,
  FileText,
  Download,
  Play,
  RefreshCw,
  Sparkles,
  BarChart3,
  Cpu,
  Activity,
  Gauge,
  Terminal,
  Check,
  ArrowRight,
  Copy,
  Server,
  Lock,
  FileSpreadsheet,
  Layers,
  Sliders,
  Database,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Loader2,
  ShoppingCart,
  Search,
  CreditCard,
  UserCheck,
  Plus,
  Trash2,
  Code,
  Workflow,
  SlidersHorizontal,
  ArrowUpRight,
  FileCode,
  Compass,
  AlertCircle,
  TrendingDown,
  Eye,
  EyeOff,
  Cookie,
  Key,
  ChevronUp,
  Sliders as SlidersIcon,
  CheckSquare,
  Square
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  Legend
} from 'recharts';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { Project, User } from '../types';
import { deductExportCredits } from '../services/creditService';
import type {
  TestType,
  FunctionalityStep,
  DetectedFunctionality,
  TestConfig,
  FunctionalPerformanceReport,
  MetricDataPoint
} from '../services/functionalPerformanceService';

interface FunctionalPerformanceTestingProps {
  project?: Project;
  user?: User | null;
}

type WizardStep = 'url_input' | 'detection' | 'config' | 'running' | 'results';

export const FunctionalPerformanceTesting: React.FC<FunctionalPerformanceTestingProps> = ({ project, user }) => {
  const isSuperAdmin = Boolean(
    user && (() => {
      const userRole = (user.role as string | undefined)?.toLowerCase().trim();
      if (
        userRole === 'admin' || 
        userRole === 'team member' || 
        userRole === 'delivery manager' || 
        userRole === 'spoc'
      ) {
        return false;
      }
      if (user.role === 'Super Admin' || userRole === 'super admin') {
        return true;
      }
      const email = user.email?.toLowerCase().trim();
      if (!user.role && (email === 'shanmugapriya@qaoncloud.com' || email === 'vinuta@qaoncloud.com')) {
        return true;
      }
      return false;
    })()
  );

  // Wizard Navigation
  const [currentStep, setCurrentStep] = useState<WizardStep>('url_input');

  // Step 1: URL Input & Authorization
  const [targetUrl, setTargetUrl] = useState<string>('https://ecommerce-playground.lambdatest.io');
  const [isAuthorized, setIsAuthorized] = useState<boolean>(true);
  const [isValidatingUrl, setIsValidatingUrl] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlValidated, setUrlValidated] = useState<boolean>(false);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-slate-900/60 rounded-3xl border border-slate-800/80 p-12 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6">
          <ShieldAlert size={32} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Unauthorized Access</h3>
        <p className="text-sm text-slate-400 max-w-md">
          Functional Performance Testing is restricted and visible only to users with the Super Admin role.
        </p>
      </div>
    );
  }

  // Step 1: Authentication Configuration (Credential vs Session Cookie / Auth Token Injection)
  const [requiresLogin, setRequiresLogin] = useState<'no' | 'yes'>('no');
  const [authMethod, setAuthMethod] = useState<'credentials' | 'cookie_token' | 'skip'>('cookie_token');
  // Credential option state
  const [authUsername, setAuthUsername] = useState<string>('');
  const [authPassword, setAuthPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  // Cookie / Token option state
  const [cookieTokenType, setCookieTokenType] = useState<'cookie' | 'token'>('cookie');
  const [cookiesList, setCookiesList] = useState<Array<{ id: string; name: string; value: string; domain: string; path: string; showValue: boolean }>>([
    { id: 'c_1', name: '', value: '', domain: '', path: '/', showValue: false }
  ]);
  const [authToken, setAuthToken] = useState<string>('');
  const [tokenHeaderName, setTokenHeaderName] = useState<string>('Authorization');
  const [showAuthToken, setShowAuthToken] = useState<boolean>(false);
  // Collapsible Help Guide
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  // Safety confirmation
  const [isTestAccountConfirmed, setIsTestAccountConfirmed] = useState<boolean>(false);

  const handleAddCookieRow = () => {
    setCookiesList((prev) => [
      ...prev,
      { id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, name: '', value: '', domain: '', path: '/', showValue: false }
    ]);
  };

  const handleRemoveCookieRow = (id: string) => {
    setCookiesList((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  };

  const handleCookieChange = (id: string, field: 'name' | 'value' | 'domain' | 'path', val: string) => {
    setCookiesList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: val } : c))
    );
  };

  const handleToggleCookieVisibility = (id: string) => {
    setCookiesList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, showValue: !c.showValue } : c))
    );
  };

  const buildAuthPayload = () => {
    if (requiresLogin !== 'yes' || authMethod === 'skip') {
      return { method: 'none' };
    }
    if (authMethod === 'credentials') {
      return {
        method: 'credentials',
        credentials: {
          username: authUsername.trim(),
          password: authPassword.trim()
        }
      };
    }
    if (authMethod === 'cookie_token') {
      if (cookieTokenType === 'cookie') {
        const valid = cookiesList
          .filter((c) => c.name.trim() && c.value.trim())
          .map((c) => ({
            name: c.name.trim(),
            value: c.value.trim(),
            domain: c.domain.trim() || undefined,
            path: c.path.trim() || '/'
          }));
        return {
          method: 'cookie',
          cookies: valid
        };
      } else {
        return {
          method: 'token',
          token: authToken.trim()
        };
      }
    }
    return { method: 'none' };
  };

  // Step 2: Functionality Detection
  const [detectionMode, setDetectionMode] = useState<'pattern' | 'ai'>('pattern');
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [detectedFunctionalities, setDetectedFunctionalities] = useState<DetectedFunctionality[]>([]);
  const [selectedFunctionality, setSelectedFunctionality] = useState<DetectedFunctionality | null>(null);
  const [customAiDescription, setCustomAiDescription] = useState<string>(
    'User clicks on the search input, types "phone", applies price filter, and adds the first item to cart.'
  );
  const [simplifiedDom, setSimplifiedDom] = useState<string>('');
  const [expandedStepsFuncId, setExpandedStepsFuncId] = useState<string | null>(null);
  const [editableSteps, setEditableSteps] = useState<FunctionalityStep[]>([]);

  // Step 3: Load Configuration
  const [config, setConfig] = useState<TestConfig>({
    users: 15,
    rampUpSeconds: 20,
    durationSeconds: 45,
    testType: 'load',
    thinkTimeMs: 1000
  });
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [networkThrottling, setNetworkThrottling] = useState<string>('unthrottled');
  const [errorThresholdPercent, setErrorThresholdPercent] = useState<number>(10);
  const [showK6Preview, setShowK6Preview] = useState<boolean>(false);

  // Step 4: Running Test Execution
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobPhase, setJobPhase] = useState<string>('Initializing test execution...');
  const [activeVus, setActiveVus] = useState<number>(0);
  const [currentRps, setCurrentRps] = useState<number>(0);
  const [currentAvgLatency, setCurrentAvgLatency] = useState<number>(0);
  const [currentErrorRate, setCurrentErrorRate] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [liveTimeSeries, setLiveTimeSeries] = useState<MetricDataPoint[]>([]);
  const [liveLogs, setLiveLogs] = useState<{ timestamp: string; message: string; level: string }[]>([]);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Step 5: Results & Analytics
  const [report, setReport] = useState<FunctionalPerformanceReport | null>(null);
  const [resultViewMode, setResultViewMode] = useState<'simple' | 'detailed'>('simple');
  const [historyRuns, setHistoryRuns] = useState<FunctionalPerformanceReport[]>([]);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);

  // Auto-scroll logs
  const logsEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveLogs]);

  // Load history on mount
  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/functional-test/history');
      const data = await res.json();
      if (data.success && Array.isArray(data.history)) {
        setHistoryRuns(data.history);
      }
    } catch (e) {}
  };

  // Preset sample targets
  const SAMPLE_TARGETS = [
    { label: 'E-Commerce Demo', url: 'https://ecommerce-playground.lambdatest.io' },
    { label: 'Playwright TodoMVC', url: 'https://demo.playwright.dev/todomvc' },
    { label: 'SauceDemo Store', url: 'https://sauce-demo.myshopify.com' },
    { label: 'Example Portal', url: 'https://example.com' }
  ];

  // ==============================================================================
  // STEP 1 HANDLERS: URL VALIDATION
  // ==============================================================================

  const handleValidateUrl = async () => {
    if (!targetUrl || !targetUrl.trim()) {
      setUrlError('Please enter a target URL.');
      return;
    }

    // Validation for authentication options
    if (requiresLogin === 'yes' && authMethod !== 'skip') {
      if (authMethod === 'credentials') {
        if (!authUsername.trim() || !authPassword.trim()) {
          setUrlError('Please enter both the test username/email and password.');
          return;
        }
      } else if (authMethod === 'cookie_token') {
        if (cookieTokenType === 'cookie') {
          const valid = cookiesList.filter((c) => c.name.trim() && c.value.trim());
          if (valid.length === 0) {
            setUrlError('Please provide at least one cookie name and value.');
            return;
          }
        } else if (cookieTokenType === 'token') {
          if (!authToken.trim()) {
            setUrlError('Please paste your session or auth token.');
            return;
          }
        }
      }

      if (!isTestAccountConfirmed) {
        setUrlError('Please confirm this is a test account before proceeding.');
        return;
      }
    }

    setUrlError(null);
    setIsValidatingUrl(true);

    try {
      // Auto prepend https if missing
      let normalized = targetUrl.trim();
      if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        normalized = `https://${normalized}`;
        setTargetUrl(normalized);
      }

      // Check SSRF client-side first
      const parsed = new URL(normalized);
      if (['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname.toLowerCase())) {
        setUrlError('Testing localhost or loopback addresses is restricted for security.');
        setIsValidatingUrl(false);
        return;
      }

      // Execute backend URL validation (dual-check with 30s timeout, domcontentloaded, and auto-retry)
      const res = await fetch('/api/functional-test/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        const errorMsg = data.error || 'This page is taking longer than expected to load. It may be a slow server or a heavy page — you can retry, or increase the timeout in Advanced Settings.';
        setUrlError(errorMsg);
        setUrlValidated(false);
        return;
      }

      setUrlValidated(true);
      // Auto advance to detection
      setCurrentStep('detection');
      runDetection(normalized);
    } catch (e: any) {
      setUrlError(e.message || 'Invalid URL format. Please enter a valid HTTP/HTTPS address.');
      setUrlValidated(false);
    } finally {
      setIsValidatingUrl(false);
    }
  };

  // ==============================================================================
  // STEP 2 HANDLERS: FUNCTIONALITY DETECTION
  // ==============================================================================

  const runDetection = async (urlToScan?: string) => {
    const url = urlToScan || targetUrl;
    setIsDetecting(true);
    setDetectionError(null);
    setUrlError(null);

    try {
      const authPayload = buildAuthPayload();
      const res = await fetch('/api/functional-test/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, auth: authPayload })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (data.authFailed) {
          // Stay on Step 1 (url_input) and display the exact auth verification failure message
          setCurrentStep('url_input');
          setUrlError(
            data.error ||
              "We couldn't confirm this logged you in — the session may have expired. Please log in again in your browser, copy a fresh cookie/token, and try again."
          );
          return;
        }
        throw new Error(data.error || 'Failed to detect functionalities on target page.');
      }

      setDetectedFunctionalities(data.detectedFunctionalities || []);
      setSimplifiedDom(data.simplifiedDom || '');

      if (data.detectedFunctionalities && data.detectedFunctionalities.length > 0) {
        const first = data.detectedFunctionalities[0];
        setSelectedFunctionality(first);
        setEditableSteps(JSON.parse(JSON.stringify(first.defaultSteps)));
      }
    } catch (err: any) {
      setDetectionError(err.message || 'Error occurred while detecting page elements.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleRunAiDetection = async () => {
    if (!customAiDescription.trim()) {
      setDetectionError('Please enter a description of the functionality you want to test.');
      return;
    }

    setIsDetecting(true);
    setDetectionError(null);

    try {
      const res = await fetch('/api/functional-test/detect-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          description: customAiDescription,
          simplifiedDom
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI analysis failed.');
      }

      const customFunc = data.functionality;
      // Prepend or add to list
      setDetectedFunctionalities((prev) => [customFunc, ...prev]);
      setSelectedFunctionality(customFunc);
      setEditableSteps(JSON.parse(JSON.stringify(customFunc.defaultSteps)));
    } catch (err: any) {
      setDetectionError(err.message || 'Failed to generate functionality with AI.');
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSelectFunctionality = (func: DetectedFunctionality) => {
    setSelectedFunctionality(func);
    setEditableSteps(JSON.parse(JSON.stringify(func.defaultSteps)));
  };

  // Step editing handlers
  const handleUpdateStep = (index: number, field: keyof FunctionalityStep, value: any) => {
    setEditableSteps((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleDeleteStep = (index: number) => {
    if (editableSteps.length <= 1) return;
    setEditableSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddStep = () => {
    const newStep: FunctionalityStep = {
      id: `step_${Date.now().toString(36)}`,
      name: `Custom Step ${editableSteps.length + 1}`,
      action: 'click',
      selector: 'button',
      description: 'Custom user interaction step',
      expectedSlaMs: 500,
      thinkTimeMs: 1000
    };
    setEditableSteps((prev) => [...prev, newStep]);
  };

  // ==============================================================================
  // STEP 3 & 4 HANDLERS: LOAD RUN EXECUTION
  // ==============================================================================

  const handleStartTest = async () => {
    if (!isAuthorized) {
      alert('You must confirm authorization before starting the load test.');
      return;
    }

    if (!selectedFunctionality) {
      alert('Please select a functionality to test.');
      return;
    }

    setCurrentStep('running');
    setJobProgress(0);
    setJobPhase('Queuing load test job in execution worker...');
    setLiveTimeSeries([]);
    setLiveLogs([]);

    try {
      const payload = {
        url: targetUrl,
        functionality: {
          id: selectedFunctionality.id,
          name: selectedFunctionality.name,
          category: selectedFunctionality.category,
          steps: editableSteps
        },
        testConfig: config,
        auth: buildAuthPayload(),
        authorized: true,
        userEmail: user?.email || 'operator@automatiqa.io'
      };

      const res = await fetch('/api/functional-test/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to trigger test job.');
      }

      setActiveJobId(data.jobId);
      startPollingStatus(data.jobId);
    } catch (err: any) {
      alert(`Error starting test: ${err.message}`);
      setCurrentStep('config');
    }
  };

  const startPollingStatus = (jobId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/functional-test/status/${jobId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!data.success) return;

        setJobProgress(data.progressPercent || 0);
        setJobPhase(data.currentPhase || 'Running...');
        setActiveVus(data.activeVus || 0);
        setCurrentRps(data.currentRps || 0);
        setCurrentAvgLatency(data.currentAvgLatencyMs || 0);
        setCurrentErrorRate(data.errorRatePercent || 0);
        setElapsedSeconds(data.elapsedSeconds || 0);
        setRemainingSeconds(data.remainingSeconds || 0);

        if (Array.isArray(data.timeSeries)) {
          setLiveTimeSeries(data.timeSeries);
        }

        if (Array.isArray(data.logs)) {
          setLiveLogs(data.logs);
        }

        if (data.status === 'completed' || data.hasResult) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          // Fetch final report
          fetchFinalReport(jobId);
        } else if (data.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          alert(`Test failed: ${data.error || 'Execution encountered an error.'}`);
          setCurrentStep('config');
        }
      } catch (e) {}
    }, 1000);
  };

  const fetchFinalReport = async (jobId: string) => {
    try {
      const res = await fetch(`/api/functional-test/results/${jobId}`);
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
        setCurrentStep('results');
        fetchHistory();
      }
    } catch (err) {
      console.error('Failed to fetch final report:', err);
    }
  };

  // Clean interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // ==============================================================================
  // EXPORT HANDLERS: PDF & EXCEL
  // ==============================================================================

  const handleExportPDF = async () => {
    if (!report) return;

    const ok = await deductExportCredits(project?.id || 'proj-default', 'api_performance', user, 'Export PDF Report', project?.name);
    if (!ok) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header Banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 40, 'F');

      doc.setTextColor(0, 225, 197); // cyan
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('AutomatiQA Functional Performance Report', 14, 20);

      doc.setTextColor(203, 213, 225); // slate-300
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Target URL: ${report.url}  |  Date: ${new Date(report.executedAt).toLocaleString()}`, 14, 30);

      // Section 1: Executive Summary
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('1. Executive Plain-Language Summary', 14, 52);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const verdictLines = doc.splitTextToSize(`Verdict: ${report.simpleView.verdict}`, pageWidth - 28);
      doc.text(verdictLines, 14, 60);

      doc.setFont('helvetica', 'bold');
      doc.text(`Overall Grade: ${report.simpleView.overallGrade}  (${report.simpleView.healthStatus})`, 14, 75);
      doc.text(`Functionality Tested: ${report.functionality.name} (${report.functionality.category})`, 14, 82);

      // Section 2: Core KPI Metrics
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('2. Benchmark Performance Metrics', 14, 98);

      const kpis = [
        ['Metric', 'Measured Value', 'Recommended SLA'],
        ['Total Requests Executed', `${report.detailedView.totalRequests.toLocaleString()}`, 'N/A'],
        ['Virtual Users (VUs)', `${report.testConfig.users} concurrent users`, 'Sustained'],
        ['Average Response Time', `${report.detailedView.avgResponseTimeMs} ms`, '< 1000 ms'],
        ['95th Percentile Latency (p95)', `${report.detailedView.p95LatencyMs} ms`, '< 2000 ms'],
        ['99th Percentile Latency (p99)', `${report.detailedView.p99LatencyMs} ms`, '< 3000 ms'],
        ['Throughput (Average RPS)', `${report.detailedView.avgRps} req/sec`, 'Linear scale'],
        ['Peak Throughput', `${report.detailedView.peakRps} req/sec`, 'Stable'],
        ['Error Rate (%)', `${report.detailedView.errorRatePercent}%`, '< 1.0%']
      ];

      let yPos = 108;
      kpis.forEach(([title, val, sla], idx) => {
        if (idx === 0) {
          doc.setFillColor(241, 245, 249);
          doc.rect(14, yPos - 5, pageWidth - 28, 8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
        }
        doc.text(title, 16, yPos);
        doc.text(val, 100, yPos);
        doc.text(sla, 160, yPos);
        yPos += 8;
      });

      // Section 3: Step-by-Step Breakdown
      yPos += 8;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('3. Step-by-Step Interaction Latency Breakdown', 14, yPos);
      yPos += 10;

      report.detailedView.stepBreakdown.forEach((step, idx) => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`Step ${idx + 1}: ${step.stepName} [${step.action.toUpperCase()}]`, 14, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Selector: ${step.selector}`, 14, yPos + 5);
        doc.text(`Measured Latency: ${step.avgLatencyMs}ms (Target SLA: ${step.slaMs}ms) - Status: ${step.status}`, 14, yPos + 10);
        yPos += 18;
      });

      // Section 4: Recommendations
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('4. Actionable Engineering Recommendations', 14, yPos);
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(`- User Impact: ${report.simpleView.userImpact}`, 14, yPos);
      yPos += 7;
      doc.text(`- Quick Action: ${report.simpleView.quickAction}`, 14, yPos);

      doc.save(`AutomatiQA-Functional-Report-${report.jobId}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to generate PDF report.');
    }
  };

  const handleExportExcel = async () => {
    if (!report) return;

    const ok = await deductExportCredits(project?.id || 'proj-default', 'api_performance', user, 'Export Excel Report', project?.name);
    if (!ok) return;

    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary & KPIs
      const summaryData = [
        ['AutomatiQA Functional Performance Testing Report'],
        ['Job ID', report.jobId],
        ['Target URL', report.url],
        ['Functionality', report.functionality.name],
        ['Category', report.functionality.category],
        ['Test Date', report.executedAt],
        ['Test Type', report.testConfig.testType],
        ['Virtual Users', report.testConfig.users],
        ['Duration (Seconds)', report.durationSeconds],
        ['Overall Grade', report.simpleView.overallGrade],
        ['Health Status', report.simpleView.healthStatus],
        ['Plain Verdict', report.simpleView.verdict],
        [],
        ['Performance Metrics', 'Value'],
        ['Total Requests', report.detailedView.totalRequests],
        ['Successful Requests', report.detailedView.successfulRequests],
        ['Failed Requests', report.detailedView.failedRequests],
        ['Average Response Time (ms)', report.detailedView.avgResponseTimeMs],
        ['Min Response Time (ms)', report.detailedView.minResponseTimeMs],
        ['Max Response Time (ms)', report.detailedView.maxResponseTimeMs],
        ['p50 Latency (ms)', report.detailedView.p50LatencyMs],
        ['p90 Latency (ms)', report.detailedView.p90LatencyMs],
        ['p95 Latency (ms)', report.detailedView.p95LatencyMs],
        ['p99 Latency (ms)', report.detailedView.p99LatencyMs],
        ['Peak RPS', report.detailedView.peakRps],
        ['Average RPS', report.detailedView.avgRps],
        ['Error Rate (%)', report.detailedView.errorRatePercent]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

      // Sheet 2: Step Latency Breakdown
      const stepData = [
        ['Step ID', 'Step Name', 'Action', 'Selector', 'Avg Latency (ms)', 'p95 Latency (ms)', 'SLA Target (ms)', 'Status', 'Description'],
        ...report.detailedView.stepBreakdown.map((s) => [
          s.stepId,
          s.stepName,
          s.action,
          s.selector,
          s.avgLatencyMs,
          s.p95LatencyMs,
          s.slaMs,
          s.status,
          s.description
        ])
      ];
      const wsSteps = XLSX.utils.aoa_to_sheet(stepData);
      XLSX.utils.book_append_sheet(wb, wsSteps, 'Step Breakdown');

      // Sheet 3: Time Series Data
      const tsData = [
        ['Second', 'Timestamp', 'Active VUs', 'RPS', 'Avg Latency (ms)', 'p95 Latency (ms)', 'Error Rate (%)'],
        ...report.detailedView.timeSeries.map((t) => [
          t.second,
          t.timestamp,
          t.activeVus,
          t.rps,
          t.avgLatencyMs,
          t.p95LatencyMs,
          t.errorRatePercent
        ])
      ];
      const wsTs = XLSX.utils.aoa_to_sheet(tsData);
      XLSX.utils.book_append_sheet(wb, wsTs, 'Time Series');

      XLSX.writeFile(wb, `AutomatiQA-Functional-Report-${report.jobId}.xlsx`);
    } catch (err) {
      console.error('Failed to export Excel:', err);
      alert('Failed to generate Excel report.');
    }
  };

  const handleCopyK6Script = async () => {
    if (!report?.detailedView.k6Script) return;

    const ok = await deductExportCredits(project?.id || 'proj-default', 'api_performance', user, 'Copy k6 Script', project?.name);
    if (!ok) return;

    navigator.clipboard.writeText(report.detailedView.k6Script);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  // Helper for test type explanations
  const TEST_TYPE_GUIDES = {
    load: {
      title: 'Load Test',
      badge: 'Steady State',
      description: 'Gradual ramp-up to simulate standard daily peak traffic. Validates day-to-day user responsiveness.'
    },
    stress: {
      title: 'Stress Test',
      badge: 'Breaking Point',
      description: 'Increases traffic progressively beyond design capacity to pinpoint the system breaking threshold.'
    },
    spike: {
      title: 'Spike Test',
      badge: 'Surge Capacity',
      description: 'Injects a sharp, sudden surge of traffic (e.g., flash sales or push alerts) to test recovery and queuing.'
    },
    soak: {
      title: 'Soak / Endurance',
      badge: 'Longevity',
      description: 'Sustained continuous traffic over an extended window to uncover memory leaks and database connection pool exhaustion.'
    }
  };

  // Helper for Grade Styling
  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A+':
      case 'A':
        return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
      case 'B':
        return 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10';
      case 'C':
        return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
      default:
        return 'text-rose-400 border-rose-500/40 bg-rose-500/10';
    }
  };

  return (
    <div className="w-full text-slate-200">
      {/* ============================================================================== */}
      {/* WIZARD STEP NAVIGATION BAR                                                     */}
      {/* ============================================================================== */}
      <div className="mb-6 p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-[#00E1C5] border border-emerald-500/30">
                <Workflow size={20} />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">Functional Performance Testing</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Live Automation
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Automated DOM & AI functionality detection with real-browser journey timing & multi-VU load execution.
            </p>
          </div>

          {/* Stepper Indicator */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {[
              { id: 'url_input', label: '1. Target URL' },
              { id: 'detection', label: '2. Functionality' },
              { id: 'config', label: '3. Load Config' },
              { id: 'running', label: '4. Live Test' },
              { id: 'results', label: '5. Results' }
            ].map((st, idx, arr) => {
              const isActive = currentStep === st.id;
              const isPast =
                (st.id === 'url_input' && currentStep !== 'url_input') ||
                (st.id === 'detection' && ['config', 'running', 'results'].includes(currentStep)) ||
                (st.id === 'config' && ['running', 'results'].includes(currentStep)) ||
                (st.id === 'running' && currentStep === 'results');

              return (
                <React.Fragment key={st.id}>
                  <button
                    disabled={currentStep === 'running'}
                    onClick={() => {
                      if (st.id === 'url_input') setCurrentStep('url_input');
                      else if (st.id === 'detection' && urlValidated) setCurrentStep('detection');
                      else if (st.id === 'config' && selectedFunctionality) setCurrentStep('config');
                      else if (st.id === 'results' && report) setCurrentStep('results');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-[#00E1C5]/20 text-[#00E1C5] border border-[#00E1C5]/40 font-semibold shadow-sm shadow-[#00E1C5]/10'
                        : isPast
                        ? 'text-slate-300 hover:text-white bg-slate-800/60 border border-slate-700/60'
                        : 'text-slate-500 bg-slate-900/40 border border-transparent cursor-not-allowed'
                    }`}
                  >
                    {st.label}
                  </button>
                  {idx < arr.length - 1 && <ChevronRight size={14} className="text-slate-600" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============================================================================== */}
      {/* STEP 1: TARGET URL INPUT & AUTHORIZATION                                       */}
      {/* ============================================================================== */}
      {currentStep === 'url_input' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Globe size={18} className="text-[#00E1C5]" />
              Enter Target Application URL
            </h3>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Paste the web application or page you want to test. Our headless Playwright inspector will analyze the live DOM to discover interactive user functionalities (search, login, cart, forms, navigation).
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Target Endpoint / Base URL
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 text-sm">
                      https://
                    </span>
                    <input
                      id="input-target-url"
                      type="text"
                      value={targetUrl.replace(/^https?:\/\//i, '')}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        setTargetUrl(`https://${val}`);
                        setUrlError(null);
                      }}
                      placeholder="e.g. ecommerce-playground.lambdatest.io"
                      className="w-full pl-20 pr-4 py-3 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-[#00E1C5] focus:ring-1 focus:ring-[#00E1C5] transition-all font-mono text-sm"
                    />
                  </div>
                  <button
                    id="btn-validate-url"
                    disabled={isValidatingUrl || !isAuthorized || (requiresLogin === 'yes' && !isTestAccountConfirmed)}
                    onClick={handleValidateUrl}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isValidatingUrl ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Validating...
                      </>
                    ) : (
                      <>
                        Detect Functionalities
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>

                {urlError && (
                  <div className="mt-3 p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-300 text-xs">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{urlError}</span>
                    </div>
                    <button
                      type="button"
                      id="btn-retry-validation"
                      onClick={handleValidateUrl}
                      disabled={isValidatingUrl}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 font-semibold flex items-center gap-1.5 shrink-0 transition-colors self-start sm:self-center"
                    >
                      <RefreshCw size={12} className={isValidatingUrl ? "animate-spin" : ""} />
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* Sample Preset Buttons */}
              <div>
                <span className="text-xs text-slate-500 font-medium mr-2">Or try a demo application:</span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {SAMPLE_TARGETS.map((sample) => (
                    <button
                      key={sample.url}
                      onClick={() => {
                        setTargetUrl(sample.url);
                        setUrlError(null);
                      }}
                      className="px-2.5 py-1 rounded-md text-xs bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-colors"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AUTHENTICATION CONFIGURATION (CREDENTIALS VS SESSION COOKIE / AUTH TOKEN) */}
              <div className="mt-6 p-5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Lock size={14} className="text-[#00E1C5]" />
                    Does this page require login?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      id="btn-login-no"
                      onClick={() => setRequiresLogin('no')}
                      className={`py-2.5 px-4 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                        requiresLogin === 'no'
                          ? 'bg-slate-800 border-[#00E1C5] text-white shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${requiresLogin === 'no' ? 'bg-[#00E1C5]' : 'bg-slate-600'}`} />
                      No, page is public
                    </button>
                    <button
                      type="button"
                      id="btn-login-yes"
                      onClick={() => setRequiresLogin('yes')}
                      className={`py-2.5 px-4 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all ${
                        requiresLogin === 'yes'
                          ? 'bg-slate-800 border-[#00E1C5] text-white shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${requiresLogin === 'yes' ? 'bg-[#00E1C5]' : 'bg-slate-600'}`} />
                      Yes, requires login
                    </button>
                  </div>
                </div>

                {requiresLogin === 'yes' && (
                  <div className="pt-4 border-t border-slate-800/80 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-2">
                        Authentication Method
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label
                          htmlFor="auth-method-credentials"
                          className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                            authMethod === 'credentials'
                              ? 'bg-slate-900/90 border-[#00E1C5] text-white'
                              : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            id="auth-method-credentials"
                            name="authMethod"
                            checked={authMethod === 'credentials'}
                            onChange={() => setAuthMethod('credentials')}
                            className="mt-1 text-[#00E1C5] focus:ring-[#00E1C5]"
                          />
                          <div>
                            <span className="text-xs font-semibold text-slate-200 block">
                              Enter credentials (username &amp; password)
                            </span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              Automates standard form login with test account credentials
                            </span>
                          </div>
                        </label>

                        <label
                          htmlFor="auth-method-cookie-token"
                          className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                            authMethod === 'cookie_token'
                              ? 'bg-slate-900/90 border-[#00E1C5] text-white'
                              : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:text-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            id="auth-method-cookie-token"
                            name="authMethod"
                            checked={authMethod === 'cookie_token'}
                            onChange={() => setAuthMethod('cookie_token')}
                            className="mt-1 text-[#00E1C5] focus:ring-[#00E1C5]"
                          />
                          <div>
                            <span className="text-xs font-semibold text-slate-200 block">
                              Inject session cookie or auth token
                            </span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              Skip typing password by pasting an active session token or cookie
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* OPTION A: CREDENTIALS FLOW */}
                    {authMethod === 'credentials' && (
                      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Test Username or Email
                            </label>
                            <input
                              type="text"
                              id="input-auth-username"
                              value={authUsername}
                              onChange={(e) => setAuthUsername(e.target.value)}
                              placeholder="e.g. testuser@example.com"
                              className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#00E1C5]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Test Password
                            </label>
                            <div className="relative">
                              <input
                                type={showPassword ? 'text' : 'password'}
                                id="input-auth-password"
                                value={authPassword}
                                onChange={(e) => setAuthPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full pl-3 pr-9 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-white placeholder-slate-500 text-xs focus:outline-none focus:border-[#00E1C5]"
                              />
                              <button
                                type="button"
                                id="btn-toggle-password"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200"
                              >
                                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* OPTION B: SESSION COOKIE / AUTH TOKEN INJECTION */}
                    {authMethod === 'cookie_token' && (
                      <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-4">
                        {/* Sub-Selector: Cookie vs Token */}
                        <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-lg border border-slate-800 w-fit">
                          <button
                            type="button"
                            id="btn-subselect-cookie"
                            onClick={() => setCookieTokenType('cookie')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                              cookieTokenType === 'cookie'
                                ? 'bg-slate-800 text-[#00E1C5] shadow'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Cookie size={14} />
                            Session Cookie
                          </button>
                          <button
                            type="button"
                            id="btn-subselect-token"
                            onClick={() => setCookieTokenType('token')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                              cookieTokenType === 'token'
                                ? 'bg-slate-800 text-[#00E1C5] shadow'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Key size={14} />
                            Bearer / Auth Token
                          </button>
                        </div>

                        {/* SUB OPTION: COOKIES */}
                        {cookieTokenType === 'cookie' && (
                          <div className="space-y-3">
                            {cookiesList.map((c, index) => (
                              <div
                                key={c.id}
                                className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2.5"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Cookie #{index + 1}
                                  </span>
                                  {cookiesList.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCookieRow(c.id)}
                                      className="text-rose-400 hover:text-rose-300 text-xs flex items-center gap-1"
                                    >
                                      <Trash2 size={12} />
                                      Remove
                                    </button>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  <div>
                                    <label className="block text-[11px] text-slate-300 mb-1">
                                      Cookie Name <span className="text-rose-400">*</span>
                                    </label>
                                    <input
                                      type="text"
                                      id={`cookie-name-${index}`}
                                      value={c.name}
                                      onChange={(e) => handleCookieChange(c.id, 'name', e.target.value)}
                                      placeholder="e.g. connect.sid, session_id, JSESSIONID, auth_token"
                                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-white font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-[#00E1C5]"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-slate-300 mb-1">
                                      Cookie Value <span className="text-rose-400">*</span>
                                    </label>
                                    <div className="relative">
                                      <input
                                        type={c.showValue ? 'text' : 'password'}
                                        id={`cookie-value-${index}`}
                                        value={c.value}
                                        onChange={(e) => handleCookieChange(c.id, 'value', e.target.value)}
                                        placeholder="e.g. s%3A... or jwt..."
                                        className="w-full pl-3 pr-9 py-2 bg-slate-900 border border-slate-700/80 rounded-lg text-white font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-[#00E1C5]"
                                      />
                                      <button
                                        type="button"
                                        id={`btn-toggle-cookie-${index}`}
                                        onClick={() => handleToggleCookieVisibility(c.id)}
                                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200"
                                      >
                                        {c.showValue ? <EyeOff size={14} /> : <Eye size={14} />}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                  <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">
                                      Domain (Optional — defaults to target hostname)
                                    </label>
                                    <input
                                      type="text"
                                      id={`cookie-domain-${index}`}
                                      value={c.domain}
                                      onChange={(e) => handleCookieChange(c.id, 'domain', e.target.value)}
                                      placeholder="e.g. example.com"
                                      className="w-full px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-slate-300 font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-[#00E1C5]"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] text-slate-400 mb-1">
                                      Path (Optional — defaults to /)
                                    </label>
                                    <input
                                      type="text"
                                      id={`cookie-path-${index}`}
                                      value={c.path}
                                      onChange={(e) => handleCookieChange(c.id, 'path', e.target.value)}
                                      placeholder="/"
                                      className="w-full px-3 py-1.5 bg-slate-900/80 border border-slate-800 rounded-lg text-slate-300 font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-[#00E1C5]"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}

                            <button
                              type="button"
                              id="btn-add-cookie"
                              onClick={handleAddCookieRow}
                              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-[#00E1C5] font-semibold text-xs border border-slate-800 flex items-center gap-1.5 transition-colors"
                            >
                              <Plus size={14} />
                              Add another cookie
                            </button>
                          </div>
                        )}

                        {/* SUB OPTION: BEARER / AUTH TOKEN */}
                        {cookieTokenType === 'token' && (
                          <div className="space-y-3">
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className="block text-[11px] text-slate-300">
                                  Token Value <span className="text-rose-400">*</span>
                                </label>
                                <button
                                  type="button"
                                  id="btn-toggle-token-visibility"
                                  onClick={() => setShowAuthToken(!showAuthToken)}
                                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                                >
                                  {showAuthToken ? <EyeOff size={13} /> : <Eye size={13} />}
                                  {showAuthToken ? 'Mask Token' : 'Show Token'}
                                </button>
                              </div>
                              <textarea
                                id="input-auth-token"
                                rows={2}
                                value={authToken}
                                onChange={(e) => setAuthToken(e.target.value)}
                                placeholder="e.g. eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                                className={`w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-lg text-white font-mono text-xs placeholder-slate-500 focus:outline-none focus:border-[#00E1C5] ${
                                  !showAuthToken ? 'font-mono' : ''
                                }`}
                                style={!showAuthToken ? { WebkitTextSecurity: 'disc' } as any : {}}
                              />
                            </div>

                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1">
                                Token Header Name (Optional — defaults to Authorization: Bearer &lt;token&gt;)
                              </label>
                              <input
                                type="text"
                                id="input-token-header-name"
                                value={tokenHeaderName}
                                onChange={(e) => setTokenHeaderName(e.target.value)}
                                placeholder="Authorization (or X-Auth-Token, Token)"
                                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-300 font-mono text-xs placeholder-slate-600 focus:outline-none focus:border-[#00E1C5]"
                              />
                            </div>
                          </div>
                        )}

                        {/* HOW DO I FIND THIS? EXPANDABLE HELPER */}
                        <div className="pt-2 border-t border-slate-800/80">
                          <button
                            type="button"
                            id="btn-toggle-auth-help"
                            onClick={() => setIsHelpOpen(!isHelpOpen)}
                            className="text-xs text-slate-400 hover:text-[#00E1C5] flex items-center gap-1.5 font-medium transition-colors"
                          >
                            <HelpCircle size={14} />
                            <span>How do I find this?</span>
                            {isHelpOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>

                          {isHelpOpen && (
                            <div className="mt-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800/90 text-xs text-slate-300 space-y-2">
                              <p className="font-semibold text-white">Concise 3-Step Guide:</p>
                              <ol className="list-decimal list-inside space-y-1 text-slate-400 leading-relaxed">
                                <li>
                                  <strong className="text-slate-200">Open your application in your browser</strong> and log in normally with your test account.
                                </li>
                                <li>
                                  <strong className="text-slate-200">Open DevTools (press F12 or Inspect)</strong> → go to the <strong className="text-slate-200">Application</strong> (or <strong className="text-slate-200">Storage</strong>) tab → expand <strong className="text-slate-200">Cookies</strong> or <strong className="text-slate-200">Local Storage</strong>.
                                </li>
                                <li>
                                  <strong className="text-slate-200">Copy the name and value</strong> of your session cookie (e.g. <code className="text-[#00E1C5] font-mono">session_id</code>), or copy the token from the <strong className="text-slate-200">Network</strong> tab (look for the <code className="text-[#00E1C5] font-mono">Authorization</code> request header).
                                </li>
                              </ol>
                            </div>
                          )}
                        </div>

                        {/* SENSITIVITY & SECURITY NOTICE */}
                        <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                          <p className="font-medium flex items-center gap-1.5 text-amber-300">
                            <Lock size={13} /> Treat this value like a temporary password.
                          </p>
                          <p className="text-slate-300 text-[11px] leading-relaxed">
                            It gives this test session access to your account. Do not use production or high-privilege accounts.
                          </p>
                          <p className="text-slate-400 text-[11px] leading-relaxed">
                            Values are held in memory only for the duration of this test run and are never logged, stored in any database or run history, or included in exported reports.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* MANDATORY TEST ACCOUNT CONFIRMATION CHECKBOX */}
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-2.5">
                      <button
                        type="button"
                        id="checkbox-test-account"
                        onClick={() => setIsTestAccountConfirmed(!isTestAccountConfirmed)}
                        className="mt-0.5 text-[#00E1C5] focus:outline-none"
                      >
                        {isTestAccountConfirmed ? (
                          <CheckSquare size={16} className="text-[#00E1C5]" />
                        ) : (
                          <Square size={16} className="text-slate-500" />
                        )}
                      </button>
                      <label
                        htmlFor="checkbox-test-account"
                        onClick={() => setIsTestAccountConfirmed(!isTestAccountConfirmed)}
                        className="text-xs text-slate-300 cursor-pointer select-none leading-tight"
                      >
                        I confirm this is a test account and I understand this value grants temporary session access.
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* MANDATORY AUTHORIZATION CHECKBOX & SECURITY SAFEGUARD */}
              <div className="mt-6 p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-3">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    id="checkbox-authorization"
                    onClick={() => setIsAuthorized(!isAuthorized)}
                    className="mt-0.5 text-[#00E1C5] focus:outline-none"
                  >
                    {isAuthorized ? (
                      <CheckSquare size={18} className="text-[#00E1C5]" />
                    ) : (
                      <Square size={18} className="text-slate-500" />
                    )}
                  </button>
                  <div>
                    <label
                      htmlFor="checkbox-authorization"
                      onClick={() => setIsAuthorized(!isAuthorized)}
                      className="text-xs font-semibold text-slate-200 cursor-pointer select-none"
                    >
                      I confirm I am authorized to perform load, stress, and performance testing on this target URL.
                    </label>
                    <p className="text-xs text-slate-400 mt-0.5">
                      AutomatiQA includes built-in SSRF protections (disallowing private networks and cloud metadata), enforces robots.txt compliance, and incorporates automated payment bypass guardrails so no live transactions occur.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-800/60 text-xs text-slate-400">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck size={14} /> SSRF Protection Active
                  </span>
                  <span className="flex items-center gap-1 text-cyan-400">
                    <Lock size={14} /> TLS / HTTPS Verification
                  </span>
                  <span className="flex items-center gap-1 text-purple-400">
                    <CreditCard size={14} /> Payment Stop Guardrail Enforced
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Historical Runs Quick Table */}
          {historyRuns.length > 0 && (
            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock size={16} className="text-slate-400" />
                Recent Functional Test Runs
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Target URL</th>
                      <th className="py-2.5 px-3">Functionality</th>
                      <th className="py-2.5 px-3">Grade</th>
                      <th className="py-2.5 px-3">Avg Latency</th>
                      <th className="py-2.5 px-3">Throughput</th>
                      <th className="py-2.5 px-3">Errors</th>
                      <th className="py-2.5 px-3">Executed</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {historyRuns.slice(0, 5).map((h) => (
                      <tr key={h.jobId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-300 truncate max-w-[180px]">{h.url}</td>
                        <td className="py-2.5 px-3 text-white font-medium">{h.functionality.name}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getGradeColor(h.simpleView.overallGrade)}`}>
                            {h.simpleView.overallGrade}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-cyan-300 font-semibold">{h.detailedView.avgResponseTimeMs} ms</td>
                        <td className="py-2.5 px-3">{h.detailedView.avgRps} req/s</td>
                        <td className="py-2.5 px-3">
                          <span className={h.detailedView.errorRatePercent > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                            {h.detailedView.errorRatePercent}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{new Date(h.executedAt).toLocaleDateString()}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => {
                              setReport(h);
                              setCurrentStep('results');
                            }}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[#00E1C5] font-semibold text-xs border border-slate-700"
                          >
                            View Report
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================================== */}
      {/* STEP 2: FUNCTIONALITY DETECTION (PATTERN VS AI ASSISTED)                       */}
      {/* ============================================================================== */}
      {currentStep === 'detection' && (
        <div className="space-y-6">
          {/* Header & Mode Switcher */}
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Workflow size={18} className="text-[#00E1C5]" />
                  Select Testable Functionality on Page
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Target: <span className="font-mono text-[#00E1C5]">{targetUrl}</span>
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                <button
                  id="tab-pattern-detection"
                  onClick={() => setDetectionMode('pattern')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    detectionMode === 'pattern'
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 shadow-md font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Cpu size={14} />
                  Auto-Detected (DOM)
                </button>
                <button
                  id="tab-ai-detection"
                  onClick={() => setDetectionMode('ai')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    detectionMode === 'ai'
                      ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-md font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles size={14} />
                  Describe It Myself (AI)
                </button>
              </div>
            </div>

            {/* AI Free-Text Mode Area */}
            {detectionMode === 'ai' && (
              <div className="mb-6 p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-3">
                <div className="flex items-center gap-2 text-purple-300 text-xs font-semibold">
                  <Sparkles size={14} />
                  <span>Gemini AI Free-Text Flow Generator</span>
                </div>
                <textarea
                  id="textarea-custom-description"
                  rows={3}
                  value={customAiDescription}
                  onChange={(e) => setCustomAiDescription(e.target.value)}
                  placeholder="Describe what functionality or flow to test, e.g., 'User types shoes in search bar, applies price filter under $50, and adds the first item to cart.'"
                  className="w-full p-3 bg-slate-950 border border-purple-500/40 rounded-lg text-white text-xs placeholder-slate-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 font-sans"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-400">
                    AI synthesizes exact selectors, SLA benchmarks, think times, and guarantees payment safety.
                  </span>
                  <button
                    id="btn-generate-ai-flow"
                    disabled={isDetecting}
                    onClick={handleRunAiDetection}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-purple-500/20 disabled:opacity-50"
                  >
                    {isDetecting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Generate Flow with AI
                  </button>
                </div>
              </div>
            )}

            {/* Detection Status Indicator */}
            {isDetecting && (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                <div className="relative">
                  <Loader2 size={36} className="animate-spin text-[#00E1C5]" />
                  <Sparkles size={16} className="absolute -top-1 -right-1 text-purple-400" />
                </div>
                <p className="text-sm font-semibold text-white">Inspecting DOM & Synthesizing Functionalities...</p>
                <p className="text-xs text-slate-400 max-w-sm">
                  Headless browser is extracting interactive controls, forms, buttons, and navigation elements.
                </p>
              </div>
            )}

            {detectionError && (
              <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-3 my-4">
                <AlertTriangle size={18} className="text-rose-400 shrink-0" />
                <span>{detectionError}</span>
              </div>
            )}

            {/* Functionality Cards Grid */}
            {!isDetecting && detectedFunctionalities.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {detectedFunctionalities.map((func) => {
                    const isSelected = selectedFunctionality?.id === func.id;
                    const isCart = func.isSafePaymentBlocked || func.id.includes('cart') || func.id.includes('checkout');

                    return (
                      <div
                        key={func.id}
                        id={`card-func-${func.id}`}
                        onClick={() => handleSelectFunctionality(func)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer relative flex flex-col justify-between ${
                          isSelected
                            ? 'bg-slate-800/90 border-[#00E1C5] ring-1 ring-[#00E1C5] shadow-lg shadow-[#00E1C5]/10'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`p-2 rounded-lg ${
                                  isSelected ? 'bg-[#00E1C5]/20 text-[#00E1C5]' : 'bg-slate-800 text-slate-300'
                                }`}
                              >
                                {func.id.includes('search') ? (
                                  <Search size={16} />
                                ) : func.id.includes('cart') ? (
                                  <ShoppingCart size={16} />
                                ) : func.id.includes('login') || func.id.includes('auth') ? (
                                  <UserCheck size={16} />
                                ) : func.id.includes('nav') ? (
                                  <Compass size={16} />
                                ) : func.id.includes('filter') ? (
                                  <SlidersHorizontal size={16} />
                                ) : (
                                  <Workflow size={16} />
                                )}
                              </span>
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4 className="text-sm font-bold text-white">{func.name}</h4>
                                  {func.notes && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                      {func.notes}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-slate-400">{func.category}</span>
                              </div>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                func.confidence === 'HIGH'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              }`}
                            >
                              {func.confidence} CONFIDENCE
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 line-clamp-2 mb-3">{func.description}</p>

                          {/* Safety Notice on Checkout / Payment */}
                          {isCart && (
                            <div className="mb-3 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-1.5">
                              <ShieldCheck size={12} className="text-amber-400" />
                              <span>Safe Guardrail: Stops prior to payment</span>
                            </div>
                          )}

                          {func.detectionSignal && (
                            <div className="text-[11px] text-slate-500 font-mono truncate">
                              Signal: {func.detectionSignal}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                          <span className="text-xs text-slate-400 font-medium">
                            {func.defaultSteps.length} Interaction Steps
                          </span>
                          <span
                            className={`text-xs font-semibold flex items-center gap-1 ${
                              isSelected ? 'text-[#00E1C5]' : 'text-slate-500'
                            }`}
                          >
                            {isSelected ? 'Selected' : 'Click to select'}
                            <Check size={14} className={isSelected ? 'opacity-100' : 'opacity-0'} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Interactive Step Sequence Inspector / Editor */}
                {selectedFunctionality && (
                  <div className="mt-6 p-5 rounded-2xl bg-slate-950/80 border border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Code size={16} className="text-[#00E1C5]" />
                          Interaction Sequence: {selectedFunctionality.name}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Review, customize, or add interaction steps. Each step executes in browser context and simulates user think-time.
                        </p>
                      </div>

                      <button
                        onClick={handleAddStep}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[#00E1C5] text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                      >
                        <Plus size={14} />
                        Add Step
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {editableSteps.map((st, sIdx) => (
                        <div
                          key={st.id || sIdx}
                          className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-slate-800 text-[#00E1C5] font-bold flex items-center justify-center text-[11px] shrink-0 border border-slate-700">
                              {sIdx + 1}
                            </span>
                            <div>
                              <input
                                type="text"
                                value={st.name}
                                onChange={(e) => handleUpdateStep(sIdx, 'name', e.target.value)}
                                className="bg-transparent font-semibold text-white text-xs border-b border-transparent hover:border-slate-700 focus:border-[#00E1C5] focus:outline-none"
                              />
                              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span className="uppercase font-mono text-cyan-400 font-bold">{st.action}</span>
                                <span className="font-mono text-slate-500 truncate max-w-[200px]">{st.selector}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500">SLA:</span>
                              <input
                                type="number"
                                value={st.expectedSlaMs}
                                onChange={(e) => handleUpdateStep(sIdx, 'expectedSlaMs', Number(e.target.value))}
                                className="w-16 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-center text-xs"
                              />
                              <span className="text-[11px] text-slate-500">ms</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-slate-500">Think:</span>
                              <input
                                type="number"
                                value={st.thinkTimeMs}
                                onChange={(e) => handleUpdateStep(sIdx, 'thinkTimeMs', Number(e.target.value))}
                                className="w-16 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200 text-center text-xs"
                              />
                              <span className="text-[11px] text-slate-500">ms</span>
                            </div>

                            {editableSteps.length > 1 && (
                              <button
                                onClick={() => handleDeleteStep(sIdx)}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bottom Action */}
                <div className="flex justify-between items-center pt-4">
                  <button
                    onClick={() => setCurrentStep('url_input')}
                    className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold transition-colors"
                  >
                    Back to URL
                  </button>

                  <button
                    id="btn-confirm-functionality"
                    disabled={!selectedFunctionality}
                    onClick={() => setCurrentStep('config')}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    Configure Load Parameters
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Fallback Zero-Detection Prompt */}
            {!isDetecting && detectedFunctionalities.length === 0 && (
              <div className="p-8 rounded-2xl bg-slate-950/80 border border-purple-500/30 text-center space-y-4 my-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto">
                  <Sparkles size={24} />
                </div>
                <div className="max-w-xl mx-auto space-y-2">
                  <h4 className="text-base font-semibold text-white">
                    We couldn't automatically detect functionalities on this page.
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Describe what you'd like to test — e.g., 'submit the contact form' or 'search for a product' — and we'll configure the test for you.
                  </p>
                </div>
                <div className="max-w-xl mx-auto space-y-3 pt-2 text-left">
                  <textarea
                    id="textarea-fallback-description"
                    rows={3}
                    value={customAiDescription}
                    onChange={(e) => setCustomAiDescription(e.target.value)}
                    placeholder="e.g. User fills out contact form with email and clicks Submit, or searches for a product..."
                    className="w-full p-3 bg-slate-900 border border-purple-500/40 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
                  />
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setCurrentStep('url_input')}
                      className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold transition-colors"
                    >
                      Back to URL
                    </button>
                    <button
                      type="button"
                      id="btn-fallback-generate"
                      disabled={isDetecting || !customAiDescription.trim()}
                      onClick={handleRunAiDetection}
                      className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-all"
                    >
                      {isDetecting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      Configure Test with AI
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* STEP 3: LOAD PARAMETERS CONFIGURATION                                          */}
      {/* ============================================================================== */}
      {currentStep === 'config' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <SlidersIcon size={18} className="text-[#00E1C5]" />
                Configure Load Simulation Parameters
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Targeting: <span className="font-semibold text-white">{selectedFunctionality?.name}</span> against{' '}
                <span className="font-mono text-[#00E1C5]">{targetUrl}</span>
              </p>
            </div>

            {/* Test Type Selection Cards */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
                Select Simulation Profile & Test Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(['load', 'stress', 'spike', 'soak'] as TestType[]).map((tType) => {
                  const info = TEST_TYPE_GUIDES[tType];
                  const isSelected = config.testType === tType;

                  return (
                    <div
                      key={tType}
                      id={`card-test-type-${tType}`}
                      onClick={() => setConfig({ ...config, testType: tType })}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-slate-800/90 border-[#00E1C5] ring-1 ring-[#00E1C5] shadow-lg shadow-[#00E1C5]/10'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <h4 className="text-sm font-bold text-white">{info.title}</h4>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isSelected ? 'bg-[#00E1C5]/20 text-[#00E1C5]' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {info.badge}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{info.description}</p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-end">
                        <span className={`text-xs font-semibold ${isSelected ? 'text-[#00E1C5]' : 'text-slate-500'}`}>
                          {isSelected ? 'Active Profile' : 'Select'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-2xl bg-slate-950/70 border border-slate-800/80">
              {/* Virtual Users */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Users size={14} className="text-[#00E1C5]" /> Virtual Users (Concurrent VUs)
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={config.users || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setConfig({ ...config, users: isNaN(val) ? 1 : Math.max(1, val) });
                      }}
                      className="w-16 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-right font-mono font-bold text-[#00E1C5] text-xs outline-none focus:border-[#00E1C5]"
                    />
                    <span className="text-slate-400 font-bold text-[11px]">VUs</span>
                  </div>
                </div>
                <input
                  id="slider-users"
                  type="range"
                  min="1"
                  max="100"
                  value={config.users}
                  onChange={(e) => setConfig({ ...config, users: Number(e.target.value) })}
                  className="w-full accent-[#00E1C5] cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>1 VU (Single)</span>
                  <span>25 VUs (Medium)</span>
                  <span>50 VUs (Standard Peak)</span>
                  <span>100 VUs (High Load)</span>
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Clock size={14} className="text-cyan-400" /> Test Duration (Seconds)
                  </span>
                  <span className="font-mono text-sm font-bold text-cyan-400">{config.durationSeconds}s</span>
                </div>
                <input
                  id="slider-duration"
                  type="range"
                  min="15"
                  max="180"
                  step="5"
                  value={config.durationSeconds}
                  onChange={(e) => setConfig({ ...config, durationSeconds: Number(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>15s (Quick)</span>
                  <span>45s (Recommended)</span>
                  <span>90s (Standard)</span>
                  <span>180s (Deep)</span>
                </div>
              </div>

              {/* Ramp-Up Time */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-emerald-400" /> Ramp-Up Period (Seconds)
                  </span>
                  <span className="font-mono text-sm font-bold text-emerald-400">{config.rampUpSeconds}s</span>
                </div>
                <input
                  id="slider-ramp-up"
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={config.rampUpSeconds}
                  onChange={(e) => setConfig({ ...config, rampUpSeconds: Number(e.target.value) })}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>5s (Instant)</span>
                  <span>20s (Smooth)</span>
                  <span>40s (Gentle)</span>
                  <span>60s (Gradual)</span>
                </div>
              </div>

              {/* Think Time */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Activity size={14} className="text-purple-400" /> User Think-Time (Pacing Delay)
                  </span>
                  <span className="font-mono text-sm font-bold text-purple-400">{config.thinkTimeMs}ms</span>
                </div>
                <input
                  id="slider-think-time"
                  type="range"
                  min="200"
                  max="3000"
                  step="100"
                  value={config.thinkTimeMs}
                  onChange={(e) => setConfig({ ...config, thinkTimeMs: Number(e.target.value) })}
                  className="w-full accent-purple-400 cursor-pointer"
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>200ms (Rapid)</span>
                  <span>1000ms (Human-like)</span>
                  <span>2000ms (Relaxed)</span>
                  <span>3000ms (Deliberate)</span>
                </div>
              </div>
            </div>

            {/* Collapsible Advanced Settings Panel */}
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="w-full px-4 py-3 bg-slate-950/60 hover:bg-slate-950 text-xs font-semibold text-slate-300 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Sliders size={14} className="text-[#00E1C5]" />
                  Advanced Settings (Throttling, Failure Threshold & k6 Script Export)
                </span>
                {showAdvancedSettings ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {showAdvancedSettings && (
                <div className="p-4 bg-slate-950/40 border-t border-slate-800 space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-400 mb-1">Network Latency & Bandwidth Emulation</label>
                      <select
                        value={networkThrottling}
                        onChange={(e) => setNetworkThrottling(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      >
                        <option value="unthrottled">Unthrottled (Direct High-Speed Fiber)</option>
                        <option value="fast4g">Fast 4G Mobile (25ms RTT, 4MB/s)</option>
                        <option value="slow4g">Slow 4G Mobile (100ms RTT, 1.5MB/s)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Error Abort Threshold (%)</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={errorThresholdPercent}
                        onChange={(e) => setErrorThresholdPercent(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                      <span className="text-[11px] text-slate-500 mt-1 block">
                        Automatically aborts test if error rate exceeds this percentage to safeguard target server.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setCurrentStep('detection')}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-semibold transition-colors"
              >
                Back to Functionalities
              </button>

              <button
                id="btn-launch-test"
                onClick={handleStartTest}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm flex items-center gap-2.5 shadow-xl shadow-emerald-500/25 transition-all transform hover:scale-[1.01]"
              >
                <Play size={18} fill="currentColor" />
                Launch Load Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* STEP 4: LIVE TEST EXECUTION & TELEMETRY                                        */}
      {/* ============================================================================== */}
      {currentStep === 'running' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-6">
            {/* Live Header with Progress */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <h3 className="text-lg font-bold text-white tracking-tight">Test In Progress</h3>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Live Telemetry
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  Elapsed: <span className="text-white font-bold">{elapsedSeconds}s</span> | Remaining:{' '}
                  <span className="text-cyan-400 font-bold">{remainingSeconds}s</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-950 rounded-full h-3.5 p-0.5 border border-slate-800 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-[#00E1C5] to-teal-400 h-full rounded-full transition-all duration-300 relative"
                  style={{ width: `${jobProgress}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400 mt-2">
                <span className="flex items-center gap-1.5 font-medium text-slate-300">
                  <Loader2 size={12} className="animate-spin text-[#00E1C5]" />
                  {jobPhase}
                </span>
                <span className="font-mono text-[#00E1C5] font-bold">{jobProgress}%</span>
              </div>
            </div>

            {/* Live Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                  <Users size={14} className="text-[#00E1C5]" /> Active VUs
                </span>
                <div className="text-2xl sm:text-3xl font-bold text-white font-mono mt-1">{activeVus}</div>
                <span className="text-[11px] text-slate-500 mt-1">Simulated users generating traffic</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-cyan-400" /> Current RPS
                </span>
                <div className="text-2xl sm:text-3xl font-bold text-cyan-300 font-mono mt-1">{currentRps}</div>
                <span className="text-[11px] text-slate-500 mt-1">Requests per second</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                  <Clock size={14} className="text-emerald-400" /> Response Time
                </span>
                <div
                  className={`text-2xl sm:text-3xl font-bold font-mono mt-1 ${
                    currentAvgLatency < 800
                      ? 'text-emerald-400'
                      : currentAvgLatency < 1800
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {currentAvgLatency} ms
                </div>
                <span className="text-[11px] text-slate-500 mt-1">Live average latency</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-purple-400" /> Error Rate
                </span>
                <div
                  className={`text-2xl sm:text-3xl font-bold font-mono mt-1 ${
                    currentErrorRate === 0
                      ? 'text-emerald-400'
                      : currentErrorRate < 3
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {currentErrorRate}%
                </div>
                <span className="text-[11px] text-slate-500 mt-1">4xx & 5xx HTTP anomalies</span>
              </div>
            </div>

            {/* Live Chart Stream */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-semibold text-white flex items-center gap-2">
                  <BarChart3 size={16} className="text-[#00E1C5]" />
                  Real-Time Latency vs Concurrency
                </span>
                <span className="text-slate-500 font-mono">Stream updates every 1s</span>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={liveTimeSeries}>
                    <defs>
                      <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00E1C5" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#00E1C5" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="vusGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="second" stroke="#64748b" tickFormatter={(s) => `${s}s`} />
                    <YAxis yAxisId="left" stroke="#00E1C5" domain={[0, 'auto']} unit="ms" />
                    <YAxis yAxisId="right" orientation="right" stroke="#818cf8" domain={[0, 'auto']} unit=" VUs" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Area yAxisId="left" type="monotone" dataKey="avgLatencyMs" name="Avg Latency (ms)" stroke="#00E1C5" strokeWidth={2} fill="url(#latencyGrad)" />
                    <Area yAxisId="right" type="monotone" dataKey="activeVus" name="Active VUs" stroke="#818cf8" strokeWidth={2} fill="url(#vusGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Live Logs Console */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between mb-2 text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Terminal size={14} className="text-emerald-400" />
                  Live Execution Logs
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Job: {activeJobId}</span>
              </div>
              <div className="h-28 overflow-y-auto font-mono text-[11px] space-y-1 text-slate-400 pr-2">
                {liveLogs.map((lg, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-slate-600 shrink-0">[{lg.timestamp.substring(11, 19)}]</span>
                    <span
                      className={
                        lg.level === 'error'
                          ? 'text-rose-400'
                          : lg.level === 'warning'
                          ? 'text-amber-400'
                          : lg.level === 'success'
                          ? 'text-emerald-400'
                          : 'text-slate-300'
                      }
                    >
                      {lg.message}
                    </span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* STEP 5: RESULTS & ANALYTICS DASHBOARD                                          */}
      {/* ============================================================================== */}
      {currentStep === 'results' && report && (
        <div className="space-y-6">
          {/* Results Top Header */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-[#00E1C5]/20 text-[#00E1C5] border border-[#00E1C5]/30">
                    <CheckCircle2 size={20} />
                  </span>
                  <h3 className="text-xl font-bold text-white tracking-tight">Performance Testing Report</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getGradeColor(report.simpleView.overallGrade)}`}>
                    Grade {report.simpleView.overallGrade}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Tested: <span className="font-semibold text-white">{report.functionality.name}</span> on{' '}
                  <span className="font-mono text-[#00E1C5]">{report.url}</span>
                </p>
              </div>

              {/* View Mode Switcher + Export Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Simple vs Detailed View Toggle */}
                <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl">
                  <button
                    id="btn-view-simple"
                    onClick={() => setResultViewMode('simple')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      resultViewMode === 'simple'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Eye size={14} />
                    Simple View
                  </button>
                  <button
                    id="btn-view-detailed"
                    onClick={() => setResultViewMode('detailed')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      resultViewMode === 'detailed'
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <BarChart3 size={14} />
                    Detailed View
                  </button>
                </div>

                {/* Export Buttons */}
                <button
                  id="btn-export-pdf"
                  onClick={handleExportPDF}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                >
                  <Download size={14} />
                  PDF Report
                </button>

                <button
                  id="btn-export-excel"
                  onClick={handleExportExcel}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                >
                  <FileSpreadsheet size={14} />
                  Excel Data
                </button>

                <button
                  onClick={() => setCurrentStep('url_input')}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 text-white text-xs font-bold border border-slate-600 flex items-center gap-1.5"
                >
                  <RefreshCw size={14} />
                  New Test
                </button>
              </div>
            </div>
          </div>

          {/* ============================================================================== */}
          {/* VIEW A: SIMPLE VIEW (PLAIN LANGUAGE, NON-TECHNICAL)                            */}
          {/* ============================================================================== */}
          {resultViewMode === 'simple' && (
            <div className="space-y-6">
              {/* Executive Verdict Banner */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Plain-Language Executive Verdict
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getGradeColor(report.simpleView.overallGrade)}`}>
                        {report.simpleView.healthStatus}
                      </span>
                    </div>
                    <p className="text-base sm:text-lg font-semibold text-white leading-snug">
                      {report.simpleView.verdict}
                    </p>
                  </div>

                  {/* Big Grade Badge */}
                  <div
                    className={`w-24 h-24 rounded-2xl flex flex-col items-center justify-center shrink-0 border-2 shadow-xl ${getGradeColor(
                      report.simpleView.overallGrade
                    )}`}
                  >
                    <span className="text-4xl font-extrabold font-mono tracking-tight">{report.simpleView.overallGrade}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5">Overall</span>
                  </div>
                </div>
              </div>

              {/* 4 Dimension Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {report.simpleView.summaryBullets.map((bullet, idx) => (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-300">{bullet.title}</span>
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            bullet.status === 'good'
                              ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                              : bullet.status === 'warning'
                              ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                              : 'bg-rose-400 shadow-sm shadow-rose-400/50'
                          }`}
                        />
                      </div>
                      <div className="text-xl font-bold text-white font-mono mb-1">{bullet.metricValue}</div>
                      <p className="text-xs text-slate-400 leading-relaxed">{bullet.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* User Impact & Actionable Guidance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Users size={16} className="text-cyan-400" />
                    What this means for your customers:
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{report.simpleView.userImpact}</p>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap size={16} className="text-amber-400" />
                    Recommended Next Action:
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{report.simpleView.quickAction}</p>
                </div>
              </div>

              {/* Historical Comparison Widget */}
              {report.historicalComparison?.hasPrior && (
                <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800">
                  <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                    <TrendingUp size={16} className="text-[#00E1C5]" />
                    Historical Comparison against Prior Run
                  </h4>
                  <p className="text-xs text-slate-400 mb-4">
                    Compared to previous test executed on{' '}
                    {new Date(report.historicalComparison.priorDate || '').toLocaleString()}:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-xs text-slate-400">Average Latency Delta</span>
                      <div className="text-lg font-bold font-mono mt-1 flex items-center gap-2">
                        <span className="text-white">{report.detailedView.avgResponseTimeMs} ms</span>
                        <span
                          className={`text-xs font-semibold ${
                            (report.historicalComparison.latencyDeltaPercent || 0) <= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {(report.historicalComparison.latencyDeltaPercent || 0) > 0 ? '+' : ''}
                          {report.historicalComparison.latencyDeltaPercent}%
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-xs text-slate-400">Throughput (RPS) Delta</span>
                      <div className="text-lg font-bold font-mono mt-1 flex items-center gap-2">
                        <span className="text-white">{report.detailedView.avgRps} req/s</span>
                        <span
                          className={`text-xs font-semibold ${
                            (report.historicalComparison.rpsDeltaPercent || 0) >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {(report.historicalComparison.rpsDeltaPercent || 0) > 0 ? '+' : ''}
                          {report.historicalComparison.rpsDeltaPercent}%
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-xs text-slate-400">Error Rate Delta</span>
                      <div className="text-lg font-bold font-mono mt-1 flex items-center gap-2">
                        <span className="text-white">{report.detailedView.errorRatePercent}%</span>
                        <span
                          className={`text-xs font-semibold ${
                            (report.historicalComparison.errorRateDeltaPercent || 0) <= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {(report.historicalComparison.errorRateDeltaPercent || 0) > 0 ? '+' : ''}
                          {report.historicalComparison.errorRateDeltaPercent}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================================== */}
          {/* VIEW B: DETAILED TECHNICAL ANALYTICS VIEW                                      */}
          {/* ============================================================================== */}
          {resultViewMode === 'detailed' && (
            <div className="space-y-6">
              {/* Comprehensive KPI Table */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Total Requests', val: report.detailedView.totalRequests.toLocaleString(), icon: Layers },
                  { label: 'Avg Latency', val: `${report.detailedView.avgResponseTimeMs} ms`, icon: Clock, color: 'text-cyan-400' },
                  { label: 'p95 Latency', val: `${report.detailedView.p95LatencyMs} ms`, icon: TrendingUp, color: 'text-emerald-400' },
                  { label: 'p99 Latency', val: `${report.detailedView.p99LatencyMs} ms`, icon: Gauge, color: 'text-purple-400' },
                  { label: 'Avg RPS', val: `${report.detailedView.avgRps} req/s`, icon: Activity },
                  { label: 'Error Rate', val: `${report.detailedView.errorRatePercent}%`, icon: ShieldAlert, color: report.detailedView.errorRatePercent > 0 ? 'text-rose-400' : 'text-emerald-400' }
                ].map((kpi, idx) => {
                  const Icon = kpi.icon;
                  return (
                    <div key={idx} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
                        <Icon size={14} className={kpi.color || 'text-slate-400'} />
                        <span>{kpi.label}</span>
                      </div>
                      <div className={`text-base sm:text-lg font-bold font-mono text-white ${kpi.color || ''}`}>
                        {kpi.val}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Step-by-Step Transaction Latency Breakdown */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Workflow size={16} className="text-[#00E1C5]" />
                  Step-by-Step Functional Journey Latency Breakdown
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Step Name</th>
                        <th className="py-2.5 px-3">Action</th>
                        <th className="py-2.5 px-3">DOM Selector</th>
                        <th className="py-2.5 px-3">Measured Avg</th>
                        <th className="py-2.5 px-3">95th Percentile</th>
                        <th className="py-2.5 px-3">SLA Threshold</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {report.detailedView.stepBreakdown.map((step, idx) => (
                        <tr key={step.stepId || idx} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3 text-slate-500 font-sans">{idx + 1}</td>
                          <td className="py-2.5 px-3 text-white font-sans font-medium">{step.stepName}</td>
                          <td className="py-2.5 px-3 uppercase text-cyan-400">{step.action}</td>
                          <td className="py-2.5 px-3 text-slate-400 truncate max-w-[200px]">{step.selector}</td>
                          <td className="py-2.5 px-3 font-semibold text-white">{step.avgLatencyMs} ms</td>
                          <td className="py-2.5 px-3 text-slate-400">{step.p95LatencyMs} ms</td>
                          <td className="py-2.5 px-3 text-slate-500">{step.slaMs} ms</td>
                          <td className="py-2.5 px-3 text-right font-sans">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                step.status === 'PASSED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : step.status === 'WARNING'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {step.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Time Series Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Latency vs Concurrency Chart */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                  <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
                    <Clock size={14} className="text-[#00E1C5]" />
                    Response Time (ms) vs Active Concurrency
                  </h4>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={report.detailedView.timeSeries}>
                        <defs>
                          <linearGradient id="detLatencyGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00E1C5" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#00E1C5" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="second" stroke="#64748b" tickFormatter={(s) => `${s}s`} />
                        <YAxis stroke="#00E1C5" unit="ms" />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                        <Area type="monotone" dataKey="avgLatencyMs" name="Avg Latency (ms)" stroke="#00E1C5" strokeWidth={2} fill="url(#detLatencyGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Throughput vs Errors Chart */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
                  <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
                    <TrendingUp size={14} className="text-purple-400" />
                    Throughput (RPS) & Error Rate
                  </h4>
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={report.detailedView.timeSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="second" stroke="#64748b" tickFormatter={(s) => `${s}s`} />
                        <YAxis yAxisId="left" stroke="#818cf8" unit=" rps" />
                        <YAxis yAxisId="right" orientation="right" stroke="#f43f5e" unit="%" />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }} />
                        <Line yAxisId="left" type="monotone" dataKey="rps" name="Requests / Sec" stroke="#818cf8" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="errorRatePercent" name="Error Rate %" stroke="#f43f5e" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Core Web Vitals & HTTP Status Distribution */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Core Web Vitals */}
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                    <Gauge size={16} className="text-emerald-400" />
                    Browser Core Web Vitals (Real User Experience)
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[11px] text-slate-400">First Contentful Paint (FCP)</span>
                      <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                        {report.detailedView.webVitals.fcp.value} ms
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Largest Contentful Paint (LCP)</span>
                      <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                        {report.detailedView.webVitals.lcp.value} ms
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Cumulative Layout Shift (CLS)</span>
                      <div className="text-base font-bold text-cyan-400 font-mono mt-0.5">
                        {report.detailedView.webVitals.cls.value}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-[11px] text-slate-400">Time to First Byte (TTFB)</span>
                      <div className="text-base font-bold text-emerald-400 font-mono mt-0.5">
                        {report.detailedView.webVitals.ttfb.value} ms
                      </div>
                    </div>
                  </div>
                </div>

                {/* Status Distribution */}
                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
                  <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                    <Server size={16} className="text-cyan-400" />
                    HTTP Status Code Distribution
                  </h4>
                  <div className="space-y-2 font-mono text-xs">
                    {report.detailedView.statusDistribution.map((st, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800/80">
                        <span className="font-semibold text-slate-200">{st.code}</span>
                        <span className="font-bold text-emerald-400">{st.count.toLocaleString()} responses</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Generated k6 Script Viewer */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <FileCode size={16} className="text-purple-400" />
                    Executable k6 Load Testing Script
                  </h4>
                  <button
                    onClick={handleCopyK6Script}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
                  >
                    {copiedScript ? <Check size={12} /> : <Copy size={12} />}
                    {copiedScript ? 'Copied!' : 'Copy Script'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64">
                  {report.detailedView.k6Script}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
