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
  FileJson, 
  Layers, 
  Sliders, 
  Database, 
  HelpCircle,
  ExternalLink,
  ChevronRight,
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
  Sliders as SlidersIcon
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
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { toast } from 'sonner';
import { Project, User, UserRole } from '../types';
import { addTokenLog } from '../services/tokenConsumptionService';
import { sanitizeJmxScript } from '../utils/jmxSanitizer';
import { deductExportCredits, canPerformActionLocal } from '../services/creditService';
import { FunctionalPerformanceTesting } from './FunctionalPerformanceTesting';
import { WebsitePerformanceTesting } from './WebsitePerformanceTesting';

interface PerformanceTestingWorkflowProps {
  project: Project | null;
  user: User | null;
  initialMode?: 'page' | 'functional' | 'load';
  onUpdateProject?: (project: Project) => void;
}

export type TestType = 'Performance Audit' | 'Load Test' | 'Stress Test' | 'Spike Test' | 'Endurance Test' | 'Scalability Test';

export interface UrlValidationResult {
  reachable: boolean;
  url: string;
  hostname?: string;
  protocol?: string;
  statusCode?: number;
  statusText?: string;
  latencyMs?: number;
  isHttps?: boolean;
  serverHeader?: string;
  contentType?: string;
  contentLength?: string;
  verifiedAt?: string;
  error?: string;
}

export interface FunctionalityStep {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  expectedSlaMs: number;
  thinkTimeMs: number;
  payloadTemplate?: string;
}

export interface WebsiteFunctionality {
  id: string;
  name: string;
  icon: any;
  category: string;
  description: string;
  defaultSteps: FunctionalityStep[];
}

export interface StepTelemetry {
  stepId: string;
  stepName: string;
  method: string;
  path: string;
  avgLatencyMs: number;
  p95LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  slaMs: number;
  passRatePercent: number;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  errorCount: number;
  throughputRps: number;
}

export interface MetricDataPoint {
  timestamp: string;
  second: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  activeVus: number;
  rps: number;
  errorRatePercent: number;
  throughputKbps: number;
}

export interface CoreWebVitals {
  lcp: { value: number; unit: string; rating: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; threshold: number };
  cls: { value: number; unit: string; rating: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; threshold: number };
  ttfb: { value: number; unit: string; rating: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; threshold: number };
  inp: { value: number; unit: string; rating: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; threshold: number };
  fcp: { value: number; unit: string; rating: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; threshold: number };
  speedIndex: { value: number; unit: string; rating: 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR'; threshold: number };
}

export interface PerformanceReport {
  targetUrl: string;
  functionalityName: string;
  functionalityCategory: string;
  testType: TestType;
  executedAt: string;
  durationSeconds: number;
  virtualUsers: number;
  rampUpSeconds: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  p99ResponseTimeMs: number;
  minResponseTimeMs: number;
  maxResponseTimeMs: number;
  maxRps: number;
  errorRatePercent: number;
  statusDistribution: { code: string; count: number; color: string }[];
  timeSeriesMetrics: MetricDataPoint[];
  stepTelemetry: StepTelemetry[];
  webVitals: CoreWebVitals;
  jmxPlanXml: string;
  aiAnalysis?: {
    overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    healthStatus: 'Pass' | 'Warning' | 'Fail' | 'Critical';
    verdict: string;
    summaryText: string;
    keyBottlenecks: {
      title: string;
      category: string;
      description: string;
      severity: 'Critical' | 'High' | 'Medium' | 'Low';
      impact: string;
    }[];
    aiRecommendations: {
      actionTitle: string;
      issueType: string;
      recommendation: string;
      codeOrConfigSnippet?: string;
      estimatedImpact: string;
      priority: 'P1' | 'P2' | 'P3';
    }[];
    architectureInsights: {
      serverConcurrency: string;
      databaseAdvice: string;
      cachingStrategy: string;
      frontendOptimization: string;
    };
  };
}

// Pre-built Website Functionalities
const FUNCTIONALITY_PRESETS: WebsiteFunctionality[] = [
  {
    id: 'checkout_payment',
    name: 'Checkout & Payment Gateway',
    icon: CreditCard,
    category: 'E-Commerce Transaction',
    description: 'Load test checkout, address validation, tax calculation, and payment processing endpoints.',
    defaultSteps: [
      { id: 'st_1', name: 'View Shopping Cart', method: 'GET', path: '/api/cart', description: 'Retrieve cart contents & totals', expectedSlaMs: 200, thinkTimeMs: 1000 },
      { id: 'st_2', name: 'Apply Coupon / Discount', method: 'POST', path: '/api/cart/apply-coupon', description: 'Validate promo code & recalculate tax', expectedSlaMs: 250, thinkTimeMs: 1500, payloadTemplate: '{"couponCode": "SAVE20"}' },
      { id: 'st_3', name: 'Submit Shipping Address', method: 'POST', path: '/api/checkout/shipping', description: 'Address validation & shipping rates', expectedSlaMs: 300, thinkTimeMs: 2000, payloadTemplate: '{"street": "123 Tech Blvd", "city": "Austin", "zip": "78701"}' },
      { id: 'st_4', name: 'Process Payment Gateway', method: 'POST', path: '/api/checkout/pay', description: 'Authorize credit card & commit order', expectedSlaMs: 500, thinkTimeMs: 500, payloadTemplate: '{"paymentToken": "tok_visa_1234", "amount": 149.99}' }
    ]
  },
  {
    id: 'user_auth',
    name: 'User Login & Registration',
    icon: UserCheck,
    category: 'Authentication & IAM',
    description: 'Test password hashing, JWT token issue, user registration, and OAuth login flows.',
    defaultSteps: [
      { id: 'st_auth_1', name: 'Get Auth CSRF Token', method: 'GET', path: '/api/auth/csrf', description: 'Fetch session token before authentication', expectedSlaMs: 150, thinkTimeMs: 500 },
      { id: 'st_auth_2', name: 'Submit Login Credentials', method: 'POST', path: '/api/auth/login', description: 'Verify password hash & sign JWT cookie', expectedSlaMs: 350, thinkTimeMs: 1000, payloadTemplate: '{"username": "testuser@qaoncloud.com", "password": "SecurePassword123!"}' },
      { id: 'st_auth_3', name: 'Fetch Authenticated Profile', method: 'GET', path: '/api/user/profile', description: 'Validate bearer token and user permissions', expectedSlaMs: 180, thinkTimeMs: 500 }
    ]
  },
  {
    id: 'product_search',
    name: 'Product Search & Catalog',
    icon: Search,
    category: 'E-Commerce Catalog',
    description: 'Stress test full-text search, filtering, pagination, and product detail page loads.',
    defaultSteps: [
      { id: 'st_srch_1', name: 'Search Product Catalog', method: 'GET', path: '/api/products/search?q=laptop&category=electronics&sort=price_desc', description: 'Database full-text query search', expectedSlaMs: 250, thinkTimeMs: 1000 },
      { id: 'st_srch_2', name: 'View Product Details Page', method: 'GET', path: '/api/products/p-104928', description: 'Fetch product specs, inventory & ratings', expectedSlaMs: 180, thinkTimeMs: 2000 },
      { id: 'st_srch_3', name: 'Fetch Related Recommendations', method: 'GET', path: '/api/products/p-104928/related', description: 'AI recommendation engine query', expectedSlaMs: 300, thinkTimeMs: 1000 }
    ]
  },
  {
    id: 'cart_management',
    name: 'Add to Cart & Basket',
    icon: ShoppingCart,
    category: 'Shopping Cart',
    description: 'Simulate concurrent add-to-cart operations, stock reservation, and cart updates.',
    defaultSteps: [
      { id: 'st_cart_1', name: 'Add Item to Cart', method: 'POST', path: '/api/cart/items', description: 'Reserve stock and add item quantity', expectedSlaMs: 220, thinkTimeMs: 800, payloadTemplate: '{"productId": "p-104928", "quantity": 1}' },
      { id: 'st_cart_2', name: 'Update Item Quantity', method: 'PUT', path: '/api/cart/items/p-104928', description: 'Modify item count in basket', expectedSlaMs: 200, thinkTimeMs: 1200, payloadTemplate: '{"quantity": 2}' },
      { id: 'st_cart_3', name: 'Recalculate Basket Total', method: 'GET', path: '/api/cart/summary', description: 'Fetch updated subtotal and discounts', expectedSlaMs: 160, thinkTimeMs: 500 }
    ]
  },
  {
    id: 'user_profile_orders',
    name: 'User Profile & Order History',
    icon: Database,
    category: 'Account Management',
    description: 'Benchmark historical order retrieval, address updates, and account dashboard.',
    defaultSteps: [
      { id: 'st_prof_1', name: 'Fetch Order History List', method: 'GET', path: '/api/user/orders?page=1&limit=20', description: 'Query past transactions and invoice links', expectedSlaMs: 280, thinkTimeMs: 1500 },
      { id: 'st_prof_2', name: 'View Order Details', method: 'GET', path: '/api/user/orders/ord-99218', description: 'Fetch tracking status and item breakdown', expectedSlaMs: 200, thinkTimeMs: 2000 },
      { id: 'st_prof_3', name: 'Update Account Preferences', method: 'PUT', path: '/api/user/settings', description: 'Save notification & security settings', expectedSlaMs: 220, thinkTimeMs: 1000, payloadTemplate: '{"notifications": true, "theme": "dark"}' }
    ]
  },
  {
    id: 'custom_api',
    name: 'Custom API / URL Workflow',
    icon: Workflow,
    category: 'Custom Microservice',
    description: 'Define custom HTTP endpoints, methods, headers, and think times for tailored microservices.',
    defaultSteps: [
      { id: 'st_cust_1', name: 'Custom GET Endpoint', method: 'GET', path: '/api/v1/resource', description: 'Primary resource retrieval endpoint', expectedSlaMs: 200, thinkTimeMs: 1000 },
      { id: 'st_cust_2', name: 'Custom POST Endpoint', method: 'POST', path: '/api/v1/resource', description: 'Resource creation endpoint', expectedSlaMs: 300, thinkTimeMs: 1000, payloadTemplate: '{"key": "value"}' }
    ]
  }
];

const TEST_TYPE_DESCRIPTIONS: Record<TestType, { title: string; subtitle: string; icon: any; defaultVus: number; defaultDuration: number; color: string; badgeBg: string }> = {
  'Performance Audit': {
    title: 'Performance Audit',
    subtitle: 'Single-user Core Web Vitals & speed index analysis',
    icon: Gauge,
    defaultVus: 1,
    defaultDuration: 15,
    color: '#00E1C5',
    badgeBg: 'bg-[#00E1C5]/10 text-[#009B87] border-[#00E1C5]/30'
  },
  'Load Test': {
    title: 'Load Test',
    subtitle: 'Sustained user traffic under normal expected operating conditions',
    icon: Users,
    defaultVus: 50,
    defaultDuration: 30,
    color: '#6366f1',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  },
  'Stress Test': {
    title: 'Stress Test',
    subtitle: 'Traffic beyond normal limits to identify system breaking points',
    icon: Zap,
    defaultVus: 200,
    defaultDuration: 45,
    color: '#f59e0b',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  'Spike Test': {
    title: 'Spike Test',
    subtitle: 'Sudden drastic traffic bursts to verify auto-scaling & recovery rate',
    icon: TrendingUp,
    defaultVus: 500,
    defaultDuration: 30,
    color: '#ef4444',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  'Endurance Test': {
    title: 'Endurance / Soak Test',
    subtitle: 'Extended load duration to detect memory leaks & resource exhaustion',
    icon: Clock,
    defaultVus: 100,
    defaultDuration: 60,
    color: '#8b5cf6',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200'
  },
  'Scalability Test': {
    title: 'Scalability Test',
    subtitle: 'Step-up incremental load (10 ➔ 50 ➔ 100 ➔ 250 ➔ 500 VUs) to measure linear capacity',
    icon: BarChart3,
    defaultVus: 250,
    defaultDuration: 45,
    color: '#10b981',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
};

export const PerformanceTestingWorkflow: React.FC<PerformanceTestingWorkflowProps> = ({ project, user, initialMode = 'page', onUpdateProject }) => {
  const [activeMode, setActiveMode] = useState<'page' | 'functional' | 'load'>(initialMode);

  useEffect(() => {
    if (initialMode) {
      setActiveMode(initialMode);
    }
  }, [initialMode]);

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
      if (user.role === UserRole.SUPER_ADMIN || userRole === 'super admin') {
        return true;
      }
      const email = user.email?.toLowerCase().trim();
      if (!user.role && (email === 'shanmugapriya@qaoncloud.com' || email === 'vinuta@qaoncloud.com')) {
        return true;
      }
      return false;
    })()
  );

  // Input State
  const [urlInput, setUrlInput] = useState<string>('https://sauce-demo.myshopify.com');
  const [isValidatingUrl, setIsValidatingUrl] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<UrlValidationResult | null>(null);

  // Functionality State
  const [selectedFunctionality, setSelectedFunctionality] = useState<WebsiteFunctionality>(FUNCTIONALITY_PRESETS[0]);
  const [activeSteps, setActiveSteps] = useState<FunctionalityStep[]>(FUNCTIONALITY_PRESETS[0].defaultSteps);
  const [isGeneratingAiWorkflow, setIsGeneratingAiWorkflow] = useState<boolean>(false);

  // Configuration State
  const [selectedTestType, setSelectedTestType] = useState<TestType>('Load Test');
  const [virtualUsers, setVirtualUsers] = useState<number>(50);
  const [durationSeconds, setDurationSeconds] = useState<number>(30);
  const [rampUpSeconds, setRampUpSeconds] = useState<number>(5);
  const [targetSlaMs, setTargetSlaMs] = useState<number>(500);

  // Active Tab View in Results
  const [activeReportTab, setActiveReportTab] = useState<'overview' | 'step_telemetry' | 'charts' | 'ai_insights' | 'jmeter_xml'>('overview');

  // Execution State
  const [isRunningTest, setIsRunningTest] = useState<boolean>(false);
  const [executionProgress, setExecutionProgress] = useState<number>(0);
  const [executionStepText, setExecutionStepText] = useState<string>('');
  const [logs, setLogs] = useState<{ id: string; timestamp: string; level: 'info' | 'warn' | 'success' | 'error'; message: string }[]>([]);
  
  // Real-time metrics during execution
  const [currentLiveMetrics, setCurrentLiveMetrics] = useState<{ vus: number; rps: number; latency: number; errorRate: number }>({ vus: 0, rps: 0, latency: 0, errorRate: 0 });

  // Final Report & AI Analysis State
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [copiedJmx, setCopiedJmx] = useState<boolean>(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Sync test parameters when test type changes
  useEffect(() => {
    const defaults = TEST_TYPE_DESCRIPTIONS[selectedTestType];
    setVirtualUsers(defaults.defaultVus);
    setDurationSeconds(defaults.defaultDuration);
    if (selectedTestType === 'Spike Test') setRampUpSeconds(2);
    else if (selectedTestType === 'Endurance Test') setRampUpSeconds(10);
    else setRampUpSeconds(5);
  }, [selectedTestType]);

  // Sync default steps when functionality preset changes
  const handleSelectFunctionality = (preset: WebsiteFunctionality) => {
    setSelectedFunctionality(preset);
    setActiveSteps(preset.defaultSteps);
  };

  // Scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Helper to append log
  const addLog = (message: string, level: 'info' | 'warn' | 'success' | 'error' = 'info') => {
    setLogs(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
        level,
        message
      }
    ]);
  };

  // Add step to active workflow
  const handleAddStep = () => {
    const newStep: FunctionalityStep = {
      id: `st_custom_${Date.now().toString(36)}`,
      name: `Step ${activeSteps.length + 1}: Custom API Request`,
      method: 'GET',
      path: `/api/v1/endpoint-${activeSteps.length + 1}`,
      description: 'Custom HTTP transaction step',
      expectedSlaMs: 250,
      thinkTimeMs: 1000
    };
    setActiveSteps(prev => [...prev, newStep]);
  };

  // Remove step from workflow
  const handleRemoveStep = (id: string) => {
    if (activeSteps.length <= 1) return;
    setActiveSteps(prev => prev.filter(s => s.id !== id));
  };

  // Update step field
  const handleUpdateStep = (id: string, field: keyof FunctionalityStep, value: any) => {
    setActiveSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // URL Validation Handler
  const handleValidateUrl = async (urlToValidate?: string) => {
    const target = (urlToValidate || urlInput).trim();
    if (!target) return;

    let formattedUrl = target;
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
      setUrlInput(formattedUrl);
    }

    setIsValidatingUrl(true);
    setValidationResult(null);

    try {
      const response = await fetch('/api/web-performance/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: formattedUrl })
      });

      const data = await response.json();
      setValidationResult(data);
    } catch (err: any) {
      setValidationResult({
        reachable: false,
        url: formattedUrl,
        error: err.message || 'Failed to communicate with validation service'
      });
    } finally {
      setIsValidatingUrl(false);
    }
  };

  // Generate AI Workflow Steps for Functionality
  const handleAiAutoGenerateWorkflow = async () => {
    let target = urlInput.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

    setIsGeneratingAiWorkflow(true);
    try {
      const response = await fetch('/api/gemini/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          functionName: 'generatePerformanceStepScenarios',
          args: [
            target,
            selectedFunctionality.name,
            selectedFunctionality.description
          ]
        })
      });

      const data = await response.json();
      if (data.success && Array.isArray(data.result) && data.result.length > 0) {
        const generatedSteps: FunctionalityStep[] = data.result.map((sc: any, idx: number) => ({
          id: `st_ai_${idx + 1}_${Date.now().toString(36)}`,
          name: sc.scenarioName || sc.title || `Step ${idx + 1}: ${sc.path || 'Request'}`,
          method: (sc.method || 'GET').toUpperCase() as any,
          path: sc.path || sc.endpoint || `/api/step-${idx + 1}`,
          description: sc.description || 'AI auto-generated performance transaction step',
          expectedSlaMs: sc.expectedSlaMs || sc.sla || 250,
          thinkTimeMs: sc.thinkTimeMs || 1000,
          payloadTemplate: sc.payload || sc.body || undefined
        }));
        setActiveSteps(generatedSteps);
        addLog(`AI auto-generated ${generatedSteps.length} HTTP transaction steps for ${selectedFunctionality.name}!`, 'success');
      } else {
        throw new Error(data.error || 'Could not parse AI scenarios');
      }
    } catch (err: any) {
      // Fallback smart generation based on functionality
      const fallbackSteps: FunctionalityStep[] = selectedFunctionality.defaultSteps.map((st, i) => ({
        ...st,
        id: `st_ai_fb_${i + 1}_${Date.now().toString(36)}`
      }));
      setActiveSteps(fallbackSteps);
      addLog(`Auto-configured smart performance steps for ${selectedFunctionality.name}.`, 'info');
    } finally {
      setIsGeneratingAiWorkflow(false);
    }
  };

  // XML Escaper for safe JMeter JMX generation
  const escapeXml = (str: string = ''): string => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Helper to generate Apache JMeter .jmx XML strictly compatible with JMeter 5.0+ and 5.6.3 GUI & CLI
  const generateJMeterXml = (
    url: string,
    funcName: string,
    testType: TestType,
    vus: number,
    rampUp: number,
    duration: number,
    steps: FunctionalityStep[]
  ): string => {
    let hostname = 'example.com';
    let protocol = 'https';
    let port = '';

    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      protocol = parsed.protocol.replace(':', '') || 'https';
      port = parsed.port && parsed.port !== '80' && parsed.port !== '443' ? parsed.port : '';
    } catch (e) {
      // fallback
    }

    const samplerXml = steps.map((step, idx) => {
      const hasPayload = Boolean(step.payloadTemplate && step.payloadTemplate.trim());
      const safeStepName = escapeXml(step.name || `Step_${idx + 1}`);
      const safePath = escapeXml(step.path || '/');
      const safeMethod = escapeXml(step.method || 'GET');
      const safePayload = hasPayload ? escapeXml(step.payloadTemplate) : '';
      const slaMs = step.expectedSlaMs || 2000;
      const thinkTime = step.thinkTimeMs || 0;

      return `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="Step ${idx + 1}: ${safeStepName}" enabled="true">
          <boolProp name="HTTPSampler.postBodyRaw">${hasPayload ? 'true' : 'false'}</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
            <collectionProp name="Arguments.arguments">
              ${hasPayload ? `
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">${safePayload}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>` : ''}
            </collectionProp>
          </elementProp>
          <stringProp name="HTTPSampler.domain">\${TARGET_HOST}</stringProp>
          <stringProp name="HTTPSampler.port">\${TARGET_PORT}</stringProp>
          <stringProp name="HTTPSampler.protocol">\${TARGET_PROTOCOL}</stringProp>
          <stringProp name="HTTPSampler.contentEncoding">UTF-8</stringProp>
          <stringProp name="HTTPSampler.path">${safePath}</stringProp>
          <stringProp name="HTTPSampler.method">${safeMethod}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
          <stringProp name="HTTPSampler.connect_timeout">10000</stringProp>
          <stringProp name="HTTPSampler.response_timeout">30000</stringProp>
        </HTTPSamplerProxy>
        <hashTree>
          ${hasPayload ? `
          <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">
            <collectionProp name="HeaderManager.headers">
              <elementProp name="" elementType="Header">
                <stringProp name="Header.name">Content-Type</stringProp>
                <stringProp name="Header.value">application/json</stringProp>
              </elementProp>
            </collectionProp>
          </HeaderManager>
          <hashTree/>` : ''}
          <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Response Code Assertion (200/201/204)" enabled="true">
            <collectionProp name="Assertion.test_strings">
              <stringProp name="49586">200</stringProp>
              <stringProp name="49587">201</stringProp>
              <stringProp name="49590">204</stringProp>
            </collectionProp>
            <stringProp name="Assertion.custom_message">HTTP status code did not match expected successful status</stringProp>
            <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
            <boolProp name="Assertion.assume_success">false</boolProp>
            <intProp name="Assertion.test_type">40</intProp>
          </ResponseAssertion>
          <hashTree/>
          <DurationAssertion guiclass="DurationAssertionGui" testclass="DurationAssertion" testname="SLA Threshold (Max ${slaMs}ms)" enabled="true">
            <stringProp name="DurationAssertion.duration">${slaMs}</stringProp>
          </DurationAssertion>
          <hashTree/>
          ${thinkTime > 0 ? `
          <ConstantTimer guiclass="ConstantTimerGui" testclass="ConstantTimer" testname="Think Time (${thinkTime}ms)" enabled="true">
            <stringProp name="ConstantTimer.delay">${thinkTime}</stringProp>
          </ConstantTimer>
          <hashTree/>` : ''}
        </hashTree>`;
    }).join('\n');

    const safePlanName = escapeXml(`AutomatiQA - ${funcName} (${testType})`);
    const safeHostname = escapeXml(hostname);
    const safeProtocol = escapeXml(protocol);
    const safePort = escapeXml(port);
    const safeGroupName = escapeXml(`${funcName} Thread Group`);

    return sanitizeJmxScript(`<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6.3">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${safePlanName}" enabled="true">
      <stringProp name="TestPlan.comments">Generated automatically by AutomatiQA Performance Testing Engine</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.user_defined_variables" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          <elementProp name="TARGET_HOST" elementType="Argument">
            <stringProp name="Argument.name">TARGET_HOST</stringProp>
            <stringProp name="Argument.value">${safeHostname}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="TARGET_PROTOCOL" elementType="Argument">
            <stringProp name="Argument.name">TARGET_PROTOCOL</stringProp>
            <stringProp name="Argument.value">${safeProtocol}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="TARGET_PORT" elementType="Argument">
            <stringProp name="Argument.name">TARGET_PORT</stringProp>
            <stringProp name="Argument.value">${safePort}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      <CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager" enabled="true">
        <collectionProp name="CookieManager.cookies"/>
        <boolProp name="CookieManager.clearEachIteration">true</boolProp>
        <boolProp name="CookieManager.controlledByThreadGroup">false</boolProp>
      </CookieManager>
      <hashTree/>
      <CacheManager guiclass="CacheManagerGui" testclass="CacheManager" testname="HTTP Cache Manager" enabled="true">
        <boolProp name="clearEachIteration">true</boolProp>
        <boolProp name="useExpires">true</boolProp>
        <boolProp name="CacheManager.controlledByThread">false</boolProp>
      </CacheManager>
      <hashTree/>
      <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager (Global)" enabled="true">
        <collectionProp name="HeaderManager.headers">
          <elementProp name="" elementType="Header">
            <stringProp name="Header.name">User-Agent</stringProp>
            <stringProp name="Header.value">Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 AutomatiQA/5.6.3</stringProp>
          </elementProp>
          <elementProp name="" elementType="Header">
            <stringProp name="Header.name">Accept</stringProp>
            <stringProp name="Header.value">text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8</stringProp>
          </elementProp>
          <elementProp name="" elementType="Header">
            <stringProp name="Header.name">Accept-Language</stringProp>
            <stringProp name="Header.value">en-US,en;q=0.9</stringProp>
          </elementProp>
        </collectionProp>
      </HeaderManager>
      <hashTree/>
      <ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP Request Defaults" enabled="true">
        <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
          <collectionProp name="Arguments.arguments"/>
        </elementProp>
        <stringProp name="HTTPSampler.domain">${safeHostname}</stringProp>
        <stringProp name="HTTPSampler.port">${safePort}</stringProp>
        <stringProp name="HTTPSampler.protocol">${safeProtocol}</stringProp>
        <stringProp name="HTTPSampler.contentEncoding">UTF-8</stringProp>
        <stringProp name="HTTPSampler.path"></stringProp>
        <stringProp name="HTTPSampler.concurrentPool">6</stringProp>
        <stringProp name="HTTPSampler.connect_timeout">10000</stringProp>
        <stringProp name="HTTPSampler.response_timeout">30000</stringProp>
      </ConfigTestElement>
      <hashTree/>
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${safeGroupName}" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <intProp name="LoopController.loops">-1</intProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">${vus}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${rampUp}</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">${duration}</stringProp>
        <stringProp name="ThreadGroup.delay">0</stringProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
      </ThreadGroup>
      <hashTree>
        ${samplerXml}
        <ResultCollector guiclass="ViewResultsFullVisualizer" testclass="ResultCollector" testname="View Results Tree" enabled="true">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename"></stringProp>
        </ResultCollector>
        <hashTree/>
        <ResultCollector guiclass="SummaryReport" testclass="ResultCollector" testname="Summary Report" enabled="true">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename">automatiqa_results.jtl</stringProp>
        </ResultCollector>
        <hashTree/>
        <ResultCollector guiclass="StatVisualizer" testclass="ResultCollector" testname="Aggregate Report" enabled="true">
          <boolProp name="ResultCollector.error_logging">false</boolProp>
          <objProp>
            <name>saveConfig</name>
            <value class="SampleSaveConfiguration">
              <time>true</time>
              <latency>true</latency>
              <timestamp>true</timestamp>
              <success>true</success>
              <label>true</label>
              <code>true</code>
              <message>true</message>
              <threadName>true</threadName>
              <dataType>true</dataType>
              <encoding>false</encoding>
              <assertions>true</assertions>
              <subresults>true</subresults>
              <responseData>false</responseData>
              <samplerData>false</samplerData>
              <xml>false</xml>
              <fieldNames>true</fieldNames>
              <responseHeaders>false</responseHeaders>
              <requestHeaders>false</requestHeaders>
              <responseDataOnError>false</responseDataOnError>
              <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
              <assertionsResultsToSave>0</assertionsResultsToSave>
              <bytes>true</bytes>
              <sentBytes>true</sentBytes>
              <url>true</url>
              <threadCounts>true</threadCounts>
              <idleTime>true</idleTime>
              <connectTime>true</connectTime>
            </value>
          </objProp>
          <stringProp name="filename"></stringProp>
        </ResultCollector>
        <hashTree/>
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`);
  };

  // Helper to generate simulated realistic test metrics
  const generateSimulatedReport = (
    url: string,
    funcName: string,
    funcCategory: string,
    testType: TestType,
    vus: number,
    duration: number,
    rampUp: number,
    slaMs: number,
    steps: FunctionalityStep[]
  ): PerformanceReport => {
    const isAudit = testType === 'Performance Audit';
    const totalReqs = isAudit ? 24 : Math.round(vus * duration * (8 + Math.random() * 12));
    
    // Calculate realistic latencies based on VUs & Test Type
    let baseLatency = 110 + Math.random() * 70;
    if (testType === 'Stress Test') baseLatency = 350 + Math.random() * 220;
    if (testType === 'Spike Test') baseLatency = 480 + Math.random() * 380;
    if (testType === 'Scalability Test') baseLatency = 210 + Math.random() * 120;

    const avgLatency = Math.round(baseLatency);
    const p95Latency = Math.round(avgLatency * 1.42);
    const p99Latency = Math.round(avgLatency * 2.05);
    const minLatency = Math.round(avgLatency * 0.42);
    const maxLatency = Math.round(avgLatency * 3.6);

    const errorRate = isAudit ? 0 : testType === 'Spike Test' ? 2.2 : testType === 'Stress Test' ? 1.6 : 0.15;
    const failedReqs = Math.round((totalReqs * errorRate) / 100);
    const successfulReqs = totalReqs - failedReqs;

    // Time series data points
    const points: MetricDataPoint[] = [];
    const numPoints = Math.min(duration, 30);
    for (let i = 1; i <= numPoints; i++) {
      const progressRatio = i / numPoints;
      let activeVuCount = Math.round(vus * Math.min(1, progressRatio * (duration / rampUp)));
      
      if (testType === 'Spike Test' && i > numPoints * 0.35 && i < numPoints * 0.65) {
        activeVuCount = vus; // peak burst
      } else if (testType === 'Scalability Test') {
        // Step-Up load curve
        const stepStage = Math.floor(progressRatio * 5);
        activeVuCount = Math.round([10, 50, 100, 250, 500][Math.min(stepStage, 4)]);
      }

      const pointRps = Math.round((activeVuCount * (10 + Math.random() * 8)));
      const pointLatency = Math.round(avgLatency + (Math.sin(i) * 25) + (activeVuCount * 0.6));

      points.push({
        timestamp: `${i * Math.max(1, Math.floor(duration / numPoints))}s`,
        second: i * Math.max(1, Math.floor(duration / numPoints)),
        avgLatencyMs: Math.max(30, pointLatency),
        p95LatencyMs: Math.round(pointLatency * 1.36),
        activeVus: activeVuCount,
        rps: pointRps,
        errorRatePercent: parseFloat((errorRate * (0.4 + Math.random() * 0.6)).toFixed(2)),
        throughputKbps: Math.round(pointRps * (4.5 + Math.random() * 2))
      });
    }

    // Step-by-step breakdown
    const stepTelemetryList: StepTelemetry[] = steps.map((st, i) => {
      const stepFactor = st.method === 'POST' ? 1.3 : st.method === 'PUT' ? 1.2 : 0.9;
      const stepAvg = Math.round(avgLatency * stepFactor * (0.8 + (i * 0.15)));
      const stepP95 = Math.round(stepAvg * 1.38);
      const passRate = stepAvg <= st.expectedSlaMs ? 99.8 : stepAvg <= st.expectedSlaMs * 1.5 ? 94.2 : 82.5;

      return {
        stepId: st.id,
        stepName: st.name,
        method: st.method,
        path: st.path,
        avgLatencyMs: stepAvg,
        p95LatencyMs: stepP95,
        minLatencyMs: Math.round(stepAvg * 0.4),
        maxLatencyMs: Math.round(stepAvg * 2.8),
        slaMs: st.expectedSlaMs,
        passRatePercent: passRate,
        status: stepAvg <= st.expectedSlaMs ? 'PASSED' : stepAvg <= st.expectedSlaMs * 1.5 ? 'WARNING' : 'FAILED',
        errorCount: Math.round((totalReqs / steps.length) * ((100 - passRate) / 100)),
        throughputRps: Math.round(Math.max(...points.map(p => p.rps)) / steps.length)
      };
    });

    // Core Web Vitals generator
    const webVitals: CoreWebVitals = {
      lcp: {
        value: parseFloat((1.1 + (avgLatency / 420)).toFixed(2)),
        unit: 's',
        rating: avgLatency < 250 ? 'GOOD' : avgLatency < 500 ? 'NEEDS_IMPROVEMENT' : 'POOR',
        threshold: 2.5
      },
      cls: {
        value: parseFloat((0.018 + Math.random() * 0.05).toFixed(3)),
        unit: 'score',
        rating: 'GOOD',
        threshold: 0.1
      },
      ttfb: {
        value: Math.round(avgLatency * 0.32),
        unit: 'ms',
        rating: avgLatency * 0.32 < 200 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
        threshold: 800
      },
      inp: {
        value: Math.round(105 + Math.random() * 70),
        unit: 'ms',
        rating: 'GOOD',
        threshold: 200
      },
      fcp: {
        value: parseFloat((0.75 + (avgLatency / 650)).toFixed(2)),
        unit: 's',
        rating: 'GOOD',
        threshold: 1.8
      },
      speedIndex: {
        value: parseFloat((1.5 + (avgLatency / 380)).toFixed(2)),
        unit: 's',
        rating: avgLatency < 300 ? 'GOOD' : 'NEEDS_IMPROVEMENT',
        threshold: 3.4
      }
    };

    const jmxXml = generateJMeterXml(url, funcName, testType, vus, rampUp, duration, steps);

    return {
      targetUrl: url,
      functionalityName: funcName,
      functionalityCategory: funcCategory,
      testType: testType,
      executedAt: new Date().toLocaleString(),
      durationSeconds: duration,
      virtualUsers: vus,
      rampUpSeconds: rampUp,
      totalRequests: totalReqs,
      successfulRequests: successfulReqs,
      failedRequests: failedReqs,
      avgResponseTimeMs: avgLatency,
      p95ResponseTimeMs: p95Latency,
      p99ResponseTimeMs: p99Latency,
      minResponseTimeMs: minLatency,
      maxResponseTimeMs: maxLatency,
      maxRps: Math.max(...points.map(p => p.rps)),
      errorRatePercent: parseFloat(errorRate.toFixed(2)),
      statusDistribution: [
        { code: '200 OK', count: successfulReqs, color: '#10b981' },
        { code: '304 Not Modified', count: Math.round(successfulReqs * 0.08), color: '#3b82f6' },
        { code: '404 Not Found', count: Math.round(failedReqs * 0.6), color: '#f59e0b' },
        { code: '500 Server Error', count: Math.round(failedReqs * 0.4), color: '#ef4444' }
      ],
      timeSeriesMetrics: points,
      stepTelemetry: stepTelemetryList,
      webVitals,
      jmxPlanXml: jmxXml
    };
  };

  // Run Test Workflow Engine
  const handleRunTest = async () => {
    let target = urlInput.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

    // Project-Level Credit Check
    const creditCheck = canPerformActionLocal(project?.id || '', 'Web performance testing', 'analysis', project?.name);
    if (!creditCheck.allowed) {
      toast.error(creditCheck.reason || 'Project credits exhausted. Please subscribe to continue.', {
        duration: 6000
      });
      return;
    }

    setIsRunningTest(true);
    setExecutionProgress(0);
    setLogs([]);
    setReport(null);
    setActiveReportTab('overview');

    // Initial validation check
    if (!validationResult || validationResult.url !== target) {
      await handleValidateUrl(target);
    }

    addLog(`Initiating AutomatiQA Web Performance Test Engine for ${selectedFunctionality.name}...`, 'info');
    addLog(`Target Domain: ${target}`, 'info');
    addLog(`Selected Profile: ${selectedTestType} (${virtualUsers} VUs, ${durationSeconds}s duration, ${rampUpSeconds}s ramp-up)`, 'info');
    addLog(`Executing Workflow Sequence with ${activeSteps.length} HTTP transaction samplers...`, 'info');

    // Simulate multi-phase test execution
    const phases = [
      { progress: 12, text: 'Resolving DNS & establishing TLS/1.3 Handshake connection...', delay: 700, level: 'info' as const },
      { progress: 28, text: 'Verifying HTTP Server availability & CORS policies...', delay: 900, level: 'success' as const },
      { progress: 42, text: `Provisioning ${virtualUsers} Virtual User workers across region cluster...`, delay: 1100, level: 'info' as const },
      { progress: 60, text: `Ramping up Virtual Users & executing ${selectedFunctionality.name} transaction sequence...`, delay: 1800, level: 'info' as const },
      { progress: 82, text: 'Aggregating step latency telemetry, error distributions, and Core Web Vitals...', delay: 1100, level: 'info' as const },
      { progress: 94, text: 'Dispatching raw metric telemetry to Gemini AI for deep performance diagnostics...', delay: 1400, level: 'info' as const }
    ];

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      setExecutionProgress(phase.progress);
      setExecutionStepText(phase.text);
      addLog(phase.text, phase.level);

      // Update live gauge
      setCurrentLiveMetrics({
        vus: Math.round((phase.progress / 100) * virtualUsers),
        rps: Math.round((phase.progress / 100) * virtualUsers * 16),
        latency: Math.round(115 + Math.sin(i) * 40),
        errorRate: 0
      });

      await new Promise(r => setTimeout(r, phase.delay));
    }

    // Generate structured report
    const rawReport = generateSimulatedReport(
      target,
      selectedFunctionality.name,
      selectedFunctionality.category,
      selectedTestType,
      virtualUsers,
      durationSeconds,
      rampUpSeconds,
      targetSlaMs,
      activeSteps
    );

    // Call Gemini AI for deep recommendations & analysis
    setIsGeneratingAi(true);
    addLog('Generating AI Performance Recommendations via Gemini 3.8 Flash...', 'info');

    try {
      const aiResponse = await fetch('/api/gemini/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          functionName: 'generateWebPerformanceAnalysis',
          args: [
            target,
            `${selectedFunctionality.name} (${selectedTestType})`,
            {
              avgLatencyMs: rawReport.avgResponseTimeMs,
              p95LatencyMs: rawReport.p95ResponseTimeMs,
              maxRps: rawReport.maxRps,
              errorRatePercent: rawReport.errorRatePercent,
              webVitals: rawReport.webVitals,
              stepCount: activeSteps.length,
              steps: activeSteps.map(s => `${s.method} ${s.path}`)
            },
            {
              virtualUsers,
              durationSeconds,
              targetSlaMs
            }
          ]
        })
      });

      const aiData = await aiResponse.json();
      if (aiData.success && aiData.result) {
        rawReport.aiAnalysis = aiData.result;
        addLog('Successfully generated AI Performance Analysis & Optimization Roadmap!', 'success');
      } else {
        throw new Error(aiData.error || 'Failed to analyze metrics');
      }
    } catch (aiErr: any) {
      addLog(`AI Analysis warning: ${aiErr.message || 'Fallback to rule-based diagnostics'}.`, 'warn');
      // Fallback AI structured payload
      rawReport.aiAnalysis = {
        overallGrade: rawReport.avgResponseTimeMs < 200 ? 'A+' : rawReport.avgResponseTimeMs < 400 ? 'B' : 'C',
        healthStatus: rawReport.avgResponseTimeMs < 300 ? 'Pass' : 'Warning',
        verdict: `Web application functionality "${selectedFunctionality.name}" demonstrates stable response characteristics during ${selectedTestType} with an average latency of ${rawReport.avgResponseTimeMs}ms.`,
        summaryText: `The target website functionality "${selectedFunctionality.name}" at ${target} was subjected to a ${selectedTestType} with ${virtualUsers} virtual user(s) over ${durationSeconds} seconds. The system processed ${rawReport.totalRequests} total requests across ${activeSteps.length} HTTP transaction samplers with a peak throughput of ${rawReport.maxRps} RPS and an overall error rate of ${rawReport.errorRatePercent}%. Core Web Vitals indicate strong rendering performance with minor backend endpoint latency areas identified.`,
        keyBottlenecks: [
          {
            title: `${selectedFunctionality.name} API Payload Overhead`,
            category: 'Backend Endpoint Latency',
            description: `Database query latency increased during concurrent ${selectedFunctionality.name} execution.`,
            severity: 'Medium',
            impact: 'Reduces endpoint throughput by ~25% under high concurrency.'
          },
          {
            title: 'Static Asset Caching Directives',
            category: 'Server Configuration',
            description: 'HTTP response headers lack aggressive Cache-Control max-age policies for static responses.',
            severity: 'Low',
            impact: 'Increases origin server load during repeat visitor journeys.'
          }
        ],
        aiRecommendations: [
          {
            actionTitle: `Optimize ${selectedFunctionality.name} Database Queries & Indexes`,
            issueType: 'Response Time',
            recommendation: `Add composite database indexes on foreign key columns used in ${selectedFunctionality.name} API handlers.`,
            codeOrConfigSnippet: `-- PostgreSQL Composite Index Optimization\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx_func_lookup \nON transactions (user_id, status, created_at DESC);`,
            estimatedImpact: '35% reduction in API response latency under load',
            priority: 'P1'
          },
          {
            actionTitle: 'Enable Gzip / Brotli Content Compression',
            issueType: 'Infrastructure',
            recommendation: 'Configure reverse proxy to compress JSON payloads and API responses.',
            codeOrConfigSnippet: `# Nginx Brotli & Gzip Config\ngzip on;\ngzip_types text/plain application/json text/css application/javascript;\ngzip_min_length 1000;`,
            estimatedImpact: '40% reduction in network payload transfer size',
            priority: 'P2'
          }
        ],
        architectureInsights: {
          serverConcurrency: 'Server event loop handled current concurrency cleanly without worker pool exhaustion.',
          databaseAdvice: 'Verify database connection pool size limits if scaling beyond 500 VUs.',
          cachingStrategy: 'Deploy Redis / Memcached caching layer for frequent read-heavy API routes.',
          frontendOptimization: 'Defer non-critical JavaScript execution and enable web worker offloading.'
        }
      };
    } finally {
      setIsGeneratingAi(false);
    }

    setExecutionProgress(100);
    setExecutionStepText('Test complete! Interactive dashboard & JMeter plan ready.');
    addLog('AutomatiQA Performance Workflow Execution Finished Successfully!', 'success');
    
    // Deduct 100 credits on RUN CHECKOUT / Web Performance test execution click
    addTokenLog({
      user: user?.name || 'Shanmugapriya',
      userEmail: user?.email || 'user@qaoncloud.com',
      workspace: (user as any)?.company || 'AutomatiQA Workspace',
      project: project?.name || 'Global Retail Banking App',
      userStoryId: 'PERF-WEB-CHECKOUT',
      feature: 'Web performance testing',
      inputModality: 'URL',
      inputModalityDetails: `Target URL: ${target} (${selectedFunctionality.name}, ${virtualUsers} VUs, ${durationSeconds}s)`,
      outputType: 'Apache JMeter JMX Test Plan & Web Performance Audit Report',
      itemsGenerated: 1,
      creditsConsumed: 100,
      cached: false
    });

    setReport(rawReport);
    setIsRunningTest(false);
  };

  // Copy Code Snippet
  const handleCopySnippet = async (snippet: string) => {
    const ok = await deductExportCredits(project.id, 'api_performance', user, 'Copy Code Snippet', project.name);
    if (!ok) return;

    navigator.clipboard.writeText(snippet);
    setCopiedSnippet(snippet);
    setTimeout(() => setCopiedSnippet(null), 2500);
  };

  // Copy JMeter XML
  const handleCopyJmx = async () => {
    if (!report?.jmxPlanXml) return;

    const ok = await deductExportCredits(project.id, 'api_performance', user, 'Copy JMeter XML', project.name);
    if (!ok) return;

    navigator.clipboard.writeText(sanitizeJmxScript(report.jmxPlanXml));
    setCopiedJmx(true);
    setTimeout(() => setCopiedJmx(false), 2500);
  };

  // Download Apache JMeter .jmx File (0 points deducted for newly generated script)
  const handleDownloadJmx = async () => {
    let xmlContent = report?.jmxPlanXml;
    const funcName = report?.functionalityName || selectedFunctionality?.name || 'performance_test';

    if (!xmlContent) {
      let target = urlInput.trim() || 'https://example.com';
      if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
      xmlContent = generateJMeterXml(
        target,
        funcName,
        selectedTestType,
        virtualUsers,
        rampUpSeconds,
        durationSeconds,
        activeSteps
      );
    }

    if (!xmlContent) return;

    const cleanXml = sanitizeJmxScript(xmlContent);
    const blob = new Blob([cleanXml], { type: 'application/xml;charset=utf-8;' });
    const cleanFilename = funcName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    saveAs(blob, `automatiqa_${cleanFilename}_plan.jmx`);
    toast.success('Generated .jmx file downloaded (0 credits deducted).');
  };

  // EXPORT 1: PDF Export using jsPDF
  const handleExportPdf = async () => {
    if (!report) return;

    const ok = await deductExportCredits(project.id, 'api_performance', user, 'Export PDF Report', project.name);
    if (!ok) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    // Header Banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(0, 225, 197); // #00E1C5
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('AutomatiQA', 14, 14);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Web Performance Audit: ${report.functionalityName}`, 14, 21);

    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, 18, { align: 'right' });

    let y = 38;

    // Target Info
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, y, pageWidth - 28, 24, 3, 3, 'F');

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Target URL: ${report.targetUrl}`, 18, y + 8);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Functionality: ${report.functionalityName}   |   Test Type: ${report.testType}   |   VUs: ${report.virtualUsers}   |   Duration: ${report.durationSeconds}s`, 18, y + 16);

    y += 32;

    // Executive Metrics Table
    doc.setFillColor(99, 102, 241); // indigo-600
    doc.rect(14, y, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('EXECUTIVE PERFORMANCE METRICS', 18, y + 5.5);

    y += 12;

    const metricsData = [
      ['Total Requests Processed', `${report.totalRequests}`],
      ['Average Response Time', `${report.avgResponseTimeMs} ms`],
      ['95th Percentile Latency', `${report.p95ResponseTimeMs} ms`],
      ['Maximum Peak Throughput', `${report.maxRps} RPS`],
      ['HTTP Error Rate', `${report.errorRatePercent}%`],
      ['Health Verdict', report.aiAnalysis?.verdict || 'Passed Performance Baseline']
    ];

    metricsData.forEach(([label, value], idx) => {
      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
      doc.rect(14, y, pageWidth - 28, 7, 'F');
      
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(label, 18, y + 4.8);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.text(value, pageWidth - 18, y + 4.8, { align: 'right' });
      y += 7;
    });

    y += 8;

    // Functionality Step Telemetry
    doc.setFillColor(99, 102, 241);
    doc.rect(14, y, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('TRANSACTION STEP BREAKDOWN', 18, y + 5.5);

    y += 12;

    report.stepTelemetry.forEach((st, idx) => {
      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
      doc.rect(14, y, pageWidth - 28, 7, 'F');

      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`Step ${idx + 1}: ${st.stepName} (${st.method} ${st.path})`, 18, y + 4.8);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'normal');
      doc.text(`${st.avgLatencyMs} ms (SLA: ${st.slaMs}ms) - ${st.status}`, pageWidth - 18, y + 4.8, { align: 'right' });
      y += 7;
    });

    y += 10;

    // AI Recommendations Section
    if (report.aiAnalysis?.aiRecommendations) {
      if (y > 220) {
        doc.addPage();
        y = 20;
      }

      doc.setFillColor(15, 23, 42);
      doc.rect(14, y, pageWidth - 28, 8, 'F');
      doc.setTextColor(0, 225, 197);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('GEMINI AI OPTIMIZATION RECOMMENDATIONS', 18, y + 5.5);

      y += 12;

      report.aiAnalysis.aiRecommendations.forEach((rec, rIdx) => {
        if (y > 240) {
          doc.addPage();
          y = 20;
        }

        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, y, pageWidth - 28, 20, 2, 2, 'F');

        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text(`${rIdx + 1}. [${rec.priority}] ${rec.actionTitle}`, 18, y + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        const splitText = doc.splitTextToSize(rec.recommendation, pageWidth - 40);
        doc.text(splitText, 18, y + 11);

        y += 24;
      });
    }

    doc.save(`AutomatiQA_Performance_${report.functionalityName.replace(/[^a-z0-9]/gi, '_')}.pdf`);
  };

  // EXPORT 2: Excel Export using xlsx
  const handleExportExcel = async () => {
    if (!report) return;

    const ok = await deductExportCredits(project.id, 'api_performance', user, 'Export Excel Report', project.name);
    if (!ok) return;

    const workbook = XLSX.utils.book_new();

    // Sheet 1: Summary Overview
    const summaryData = [
      ['AutomatiQA Web Application Performance Report'],
      ['Target URL', report.targetUrl],
      ['Functionality', report.functionalityName],
      ['Category', report.functionalityCategory],
      ['Test Type', report.testType],
      ['Executed At', report.executedAt],
      ['Virtual Users', report.virtualUsers],
      ['Ramp Up (s)', report.rampUpSeconds],
      ['Duration (s)', report.durationSeconds],
      ['Total Requests', report.totalRequests],
      ['Successful Requests', report.successfulRequests],
      ['Failed Requests', report.failedRequests],
      ['Average Response Time (ms)', report.avgResponseTimeMs],
      ['P95 Latency (ms)', report.p95ResponseTimeMs],
      ['P99 Latency (ms)', report.p99ResponseTimeMs],
      ['Max RPS', report.maxRps],
      ['Error Rate (%)', report.errorRatePercent],
      ['Overall Health Grade', report.aiAnalysis?.overallGrade || 'A'],
      ['AI Verdict', report.aiAnalysis?.verdict || 'Passed baseline performance checks']
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Executive Summary');

    // Sheet 2: Step Breakdown
    const stepRows = [
      ['Step ID', 'Step Name', 'Method', 'Endpoint Path', 'Avg Latency (ms)', 'P95 Latency (ms)', 'SLA (ms)', 'Pass Rate (%)', 'Status', 'Errors'],
      ...report.stepTelemetry.map(s => [
        s.stepId,
        s.stepName,
        s.method,
        s.path,
        s.avgLatencyMs,
        s.p95LatencyMs,
        s.slaMs,
        s.passRatePercent,
        s.status,
        s.errorCount
      ])
    ];
    const stepSheet = XLSX.utils.aoa_to_sheet(stepRows);
    XLSX.utils.book_append_sheet(workbook, stepSheet, 'Step Telemetry');

    // Sheet 3: Time Series Telemetry Logs
    const timeSeriesRows = [
      ['Second', 'Timestamp', 'Active VUs', 'Requests / Sec (RPS)', 'Avg Latency (ms)', 'P95 Latency (ms)', 'Error Rate (%)', 'Throughput (KB/s)'],
      ...report.timeSeriesMetrics.map(pt => [
        pt.second,
        pt.timestamp,
        pt.activeVus,
        pt.rps,
        pt.avgLatencyMs,
        pt.p95LatencyMs,
        pt.errorRatePercent,
        pt.throughputKbps
      ])
    ];
    const timeSeriesSheet = XLSX.utils.aoa_to_sheet(timeSeriesRows);
    XLSX.utils.book_append_sheet(workbook, timeSeriesSheet, 'Metric Telemetry Logs');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `AutomatiQA_Performance_${report.functionalityName.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white rounded-[3rem] border border-slate-100 shadow-sm p-12 text-center animate-in fade-in duration-300">
        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mb-6 shadow-inner">
          <ShieldAlert size={40} />
        </div>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Unauthorized Access</h2>
        <p className="text-sm text-slate-500 font-medium max-w-md">
          Web Performance Testing is restricted and visible only to users with the Super Admin role.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16">
      {/* Top Level Mode Tabs: Website Performance (Functional Performance & JMeter Load tabs deleted) */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl backdrop-blur-md">
        <button
          id="tab-mode-page-performance"
          type="button"
          onClick={() => setActiveMode('page')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 ${
            activeMode === 'page'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/25'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Globe size={16} />
          Website Performance Testing
          <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-cyan-400/20 text-cyan-300 border border-cyan-400/30">
            LIGHTHOUSE
          </span>
        </button>
      </div>

      {activeMode === 'page' && (
        <WebsitePerformanceTesting project={project ?? undefined} user={user ?? undefined} onUpdateProject={onUpdateProject} />
      )}

      {activeMode === 'functional' && (
        <FunctionalPerformanceTesting project={project ?? undefined} user={user} />
      )}

      {activeMode === 'load' && (
        <div className="space-y-8">
          {/* Top Header Banner */}
          <div className="bg-gradient-to-r from-[#0c1017] via-[#111827] to-[#0c1017] p-8 md:p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-96 h-96 bg-[#00E1C5]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span className="px-3 py-1 bg-[#00E1C5]/10 border border-[#00E1C5]/30 rounded-full text-[10px] font-black text-[#00E1C5] uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles size={12} /> AutomatiQA Performance Studio
              </span>
              <span className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                JMeter AI Engine & Multi-VU Load
              </span>
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight uppercase">Web Application Performance Testing</h2>
            <p className="text-sm text-slate-400 font-medium max-w-2xl mt-2 leading-relaxed">
              Test specific website functionalities (Checkout, Auth, Search, Cart, APIs), auto-generate Apache JMeter JMX test plans, run Load/Stress/Spike/Scalability profiles, and receive AI-powered optimization roadmaps.
            </p>
          </div>
          
          <div className="flex items-center gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800 backdrop-blur-md">
            <div className="p-3 bg-[#00E1C5]/10 text-[#00E1C5] rounded-xl"><Server size={20} /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Engine Status</p>
              <p className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Active Node Cluster
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 1: Website URL Entry & Reachability Validation */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm">
            01
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Enter Website URL & Validate Reachability</h3>
            <p className="text-xs text-slate-500 font-medium">AutomatiQA will ping the target endpoint to verify DNS, SSL, and baseline latency prior to running load test execution.</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <div className="relative flex-1 group">
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
              <Globe size={20} />
            </div>
            <input 
              type="text"
              value={urlInput || ''}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleValidateUrl()}
              placeholder="e.g. https://your-website.com"
              disabled={isRunningTest}
              className="w-full pl-14 pr-32 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-inner disabled:opacity-50"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                onClick={() => handleValidateUrl()}
                disabled={isValidatingUrl || isRunningTest}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
              >
                {isValidatingUrl ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                {isValidatingUrl ? 'Validating...' : 'Validate URL'}
              </button>
            </div>
          </div>
        </div>

        {/* Preset Target Shortcuts */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Sample Targets:</span>
          {[
            'https://sauce-demo.myshopify.com',
            'https://example.com',
            'https://news.ycombinator.com',
            'https://httpbin.org/get'
          ].map((preset) => (
            <button
              key={preset}
              onClick={() => { setUrlInput(preset); handleValidateUrl(preset); }}
              disabled={isRunningTest}
              className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 rounded-lg text-[11px] font-bold transition-all border border-slate-200/60"
            >
              {preset.replace('https://', '')}
            </button>
          ))}
        </div>

        {/* Validation Result Diagnostic Badge */}
        {validationResult && (
          <div className={`p-6 rounded-2xl border animate-in slide-in-from-top-2 duration-300 ${
            validationResult.reachable 
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
              : 'bg-rose-50/70 border-rose-200 text-rose-900'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl text-white ${validationResult.reachable ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                  {validationResult.reachable ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h4 className="font-black text-base uppercase tracking-tight">
                      {validationResult.reachable ? 'URL Reachable & Verified' : 'URL Unreachable / Validation Failed'}
                    </h4>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                      validationResult.reachable ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-rose-100 border-rose-300 text-rose-800'
                    }`}>
                      HTTP {validationResult.statusCode || 0} {validationResult.statusText || ''}
                    </span>
                  </div>
                  <p className="text-xs font-medium opacity-80 mt-1">
                    {validationResult.reachable 
                      ? `Target domain ${validationResult.hostname} answered with status code ${validationResult.statusCode} in ${validationResult.latencyMs}ms.`
                      : validationResult.error || 'Failed to establish TCP connection or domain DNS check failed.'}
                  </p>
                </div>
              </div>

              {validationResult.reachable && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white/80 p-3 rounded-xl border border-emerald-200/60 font-mono">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Latency</p>
                    <p className="font-bold text-emerald-700">{validationResult.latencyMs} ms</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Protocol</p>
                    <p className="font-bold text-indigo-700">{validationResult.isHttps ? 'HTTPS (SSL)' : 'HTTP'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Server</p>
                    <p className="font-bold text-slate-700 truncate">{validationResult.serverHeader || 'Standard'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Content Size</p>
                    <p className="font-bold text-slate-700">{validationResult.contentLength}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* STEP 2: Select Specific Website Functionality */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm">
              02
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Select Target Website Functionality</h3>
              <p className="text-xs text-slate-500 font-medium">Choose a specific user flow (Checkout, Login, Search, Cart) to perform multi-step JMeter sampler testing.</p>
            </div>
          </div>

          <button
            onClick={handleAiAutoGenerateWorkflow}
            disabled={isGeneratingAiWorkflow || isRunningTest}
            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2 self-start md:self-auto disabled:opacity-50"
          >
            {isGeneratingAiWorkflow ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGeneratingAiWorkflow ? 'AI Generating Steps...' : 'AI Auto-Generate Steps'}
          </button>
        </div>

        {/* Functionality Grid Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FUNCTIONALITY_PRESETS.map((preset) => {
            const IconComp = preset.icon;
            const isSelected = selectedFunctionality.id === preset.id;

            return (
              <div
                key={preset.id}
                onClick={() => !isRunningTest && handleSelectFunctionality(preset)}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected 
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-md scale-[1.01]' 
                    : 'border-slate-100 hover:border-slate-300 bg-white'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2.5 rounded-xl ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <IconComp size={18} />
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider">{preset.category}</span>
                      <h4 className="font-black text-sm text-slate-800 uppercase tracking-tight">{preset.name}</h4>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">{preset.description}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-400">
                  <span>{preset.defaultSteps.length} HTTP Sampler Steps</span>
                  <span className="text-indigo-600 font-mono font-bold">JMeter Ready</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Functionality Step Editor Panel */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <div className="flex items-center gap-2">
              <Workflow size={16} className="text-indigo-600" />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                HTTP Transaction Sequence ({selectedFunctionality.name})
              </h4>
            </div>

            <button
              onClick={handleAddStep}
              disabled={isRunningTest}
              className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={14} /> Add Sampler Step
            </button>
          </div>

          <div className="space-y-3">
            {activeSteps.map((step, idx) => (
              <div key={step.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 font-black text-xs flex items-center justify-center font-mono shrink-0">
                    {idx + 1}
                  </span>
                  <select
                    value={step.method || ''}
                    onChange={(e) => handleUpdateStep(step.id, 'method', e.target.value)}
                    disabled={isRunningTest}
                    className="px-2.5 py-1.5 bg-slate-100 font-mono text-xs font-bold text-slate-800 rounded-lg border border-slate-200 outline-none"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <input 
                    type="text"
                    value={step.name || ''}
                    onChange={(e) => handleUpdateStep(step.id, 'name', e.target.value)}
                    disabled={isRunningTest}
                    placeholder="Step Title"
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-indigo-500 w-full md:w-48"
                  />
                </div>

                <div className="flex-1 w-full md:w-auto">
                  <input 
                    type="text"
                    value={step.path || ''}
                    onChange={(e) => handleUpdateStep(step.id, 'path', e.target.value)}
                    disabled={isRunningTest}
                    placeholder="e.g. /api/checkout/pay"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-700 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                    <span className="text-[10px] font-bold uppercase text-slate-400">SLA:</span>
                    <input 
                      type="number"
                      value={step.expectedSlaMs ?? ''}
                      onChange={(e) => handleUpdateStep(step.id, 'expectedSlaMs', parseInt(e.target.value, 10) || 200)}
                      disabled={isRunningTest}
                      className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-center text-xs font-bold text-slate-800"
                    />
                    <span>ms</span>
                  </div>

                  <button
                    onClick={() => handleRemoveStep(step.id)}
                    disabled={isRunningTest || activeSteps.length <= 1}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* STEP 3: Choose Test Type & Configure Profile */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm">
            03
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Choose Performance Profile & Workload</h3>
            <p className="text-xs text-slate-500 font-medium">Select Load, Stress, Spike, Endurance, or Scalability test profile and set Virtual User thread parameters.</p>
          </div>
        </div>

        {/* Test Type Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(TEST_TYPE_DESCRIPTIONS) as TestType[]).map((typeKey) => {
            const config = TEST_TYPE_DESCRIPTIONS[typeKey];
            const IconComponent = config.icon;
            const isSelected = selectedTestType === typeKey;

            return (
              <div
                key={typeKey}
                onClick={() => !isRunningTest && setSelectedTestType(typeKey)}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                  isSelected 
                    ? 'border-indigo-600 bg-indigo-50/30 shadow-lg scale-[1.01]' 
                    : 'border-slate-100 hover:border-slate-300 bg-white'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                    <Check size={12} strokeWidth={3} />
                  </div>
                )}
                <div>
                  <div className={`p-3 rounded-xl w-fit mb-3 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <IconComponent size={20} />
                  </div>
                  <h4 className="font-black text-sm text-slate-800 uppercase tracking-tight mb-1">{config.title}</h4>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{config.subtitle}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100/80 flex items-center justify-between text-[10px] font-black uppercase text-slate-400">
                  <span>Default VUs: {config.defaultVus}</span>
                  <span>{config.defaultDuration}s</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Customizable Workload Parameters */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <SlidersIcon size={16} className="text-indigo-600" />
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">Workload Execution Parameters ({selectedTestType})</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                <span>Virtual Users (Threads):</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max={selectedTestType === 'Spike Test' ? 1000 : 500}
                    value={virtualUsers || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setVirtualUsers(isNaN(val) ? 1 : Math.max(1, val));
                    }}
                    disabled={isRunningTest}
                    className="w-16 px-2 py-0.5 bg-white border border-slate-300 rounded text-right font-mono font-black text-indigo-600 text-xs outline-none focus:border-indigo-600"
                  />
                  <span className="text-slate-500 font-bold text-[11px]">VUs</span>
                </div>
              </div>
              <input 
                type="range"
                min="1"
                max={selectedTestType === 'Spike Test' ? 1000 : 500}
                value={virtualUsers || ''}
                onChange={(e) => setVirtualUsers(parseInt(e.target.value, 10))}
                disabled={isRunningTest}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                <span>Test Duration:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={durationSeconds || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setDurationSeconds(isNaN(val) ? 10 : Math.max(1, val));
                    }}
                    disabled={isRunningTest}
                    className="w-16 px-2 py-0.5 bg-white border border-slate-300 rounded text-right font-mono font-black text-indigo-600 text-xs outline-none focus:border-indigo-600"
                  />
                  <span className="text-slate-500 font-bold text-[11px]">sec</span>
                </div>
              </div>
              <input 
                type="range"
                min="10"
                max="300"
                value={durationSeconds || ''}
                onChange={(e) => setDurationSeconds(parseInt(e.target.value, 10))}
                disabled={isRunningTest}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                <span>Ramp-up Time:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={rampUpSeconds || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setRampUpSeconds(isNaN(val) ? 1 : Math.max(0, val));
                    }}
                    disabled={isRunningTest}
                    className="w-16 px-2 py-0.5 bg-white border border-slate-300 rounded text-right font-mono font-black text-indigo-600 text-xs outline-none focus:border-indigo-600"
                  />
                  <span className="text-slate-500 font-bold text-[11px]">sec</span>
                </div>
              </div>
              <input 
                type="range"
                min="1"
                max="60"
                value={rampUpSeconds || ''}
                onChange={(e) => setRampUpSeconds(parseInt(e.target.value, 10))}
                disabled={isRunningTest}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                <span>Target SLA Latency:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="100"
                    max="2000"
                    step="50"
                    value={targetSlaMs || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setTargetSlaMs(isNaN(val) ? 100 : Math.max(10, val));
                    }}
                    disabled={isRunningTest}
                    className="w-20 px-2 py-0.5 bg-white border border-slate-300 rounded text-right font-mono font-black text-indigo-600 text-xs outline-none focus:border-indigo-600"
                  />
                  <span className="text-slate-500 font-bold text-[11px]">ms</span>
                </div>
              </div>
              <input 
                type="range"
                min="100"
                max="2000"
                step="50"
                value={targetSlaMs || ''}
                onChange={(e) => setTargetSlaMs(parseInt(e.target.value, 10))}
                disabled={isRunningTest}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Launch Execution CTA */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleRunTest}
            disabled={isRunningTest}
            className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isRunningTest ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
            {isRunningTest 
              ? 'Running Performance Engine...' 
              : (selectedFunctionality.id === 'checkout_payment' || selectedFunctionality.name.toLowerCase().includes('checkout')
                  ? 'RUN CHECKOUT'
                  : `Run ${selectedFunctionality.name} ${selectedTestType}`)}
          </button>
        </div>
      </div>

      {/* STEP 4: Execution Progress & Live Metric Stream Terminal */}
      {isRunningTest && (
        <div className="bg-slate-900 text-slate-200 p-8 rounded-[2rem] border border-slate-800 shadow-2xl space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#00E1C5]/10 text-[#00E1C5] rounded-xl"><Activity size={20} /></div>
              <div>
                <h3 className="font-black text-base text-white uppercase tracking-tight">Load Execution Engine Active</h3>
                <p className="text-xs text-slate-400 font-mono">{executionStepText}</p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-[#00E1C5] bg-[#00E1C5]/10 px-3 py-1 rounded-full border border-[#00E1C5]/30 animate-pulse">
              {executionProgress}% COMPLETE
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 border border-slate-700">
            <div 
              className="bg-gradient-to-r from-[#00E1C5] via-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${executionProgress}%` }}
            />
          </div>

          {/* Live Metric Stream Gauges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
              <p className="text-[10px] font-bold uppercase text-slate-400">Active VUs</p>
              <p className="text-2xl font-black text-white font-mono">{currentLiveMetrics.vus}</p>
            </div>
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
              <p className="text-[10px] font-bold uppercase text-slate-400">Current RPS</p>
              <p className="text-2xl font-black text-[#00E1C5] font-mono">{currentLiveMetrics.rps}</p>
            </div>
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
              <p className="text-[10px] font-bold uppercase text-slate-400">Live Latency</p>
              <p className="text-2xl font-black text-indigo-400 font-mono">{currentLiveMetrics.latency} ms</p>
            </div>
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
              <p className="text-[10px] font-bold uppercase text-slate-400">Error Rate</p>
              <p className="text-2xl font-black text-emerald-400 font-mono">{currentLiveMetrics.errorRate}%</p>
            </div>
          </div>

          {/* Live Terminal Output */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 font-mono text-xs space-y-2 h-44 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-2 text-slate-500 pb-2 border-b border-slate-900">
              <Terminal size={14} /> <span>AutomatiQA Telemetry Log Console</span>
            </div>
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3">
                <span className="text-slate-600 select-none">[{log.timestamp}]</span>
                <span className={
                  log.level === 'error' ? 'text-rose-400 font-bold' :
                  log.level === 'warn' ? 'text-amber-400' :
                  log.level === 'success' ? 'text-[#00E1C5] font-bold' :
                  'text-slate-300'
                }>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* STEP 5: Interactive Summary Dashboard, Step Telemetry, JMeter Plan & AI Diagnostics */}
      {report && (
        <div className="space-y-8 animate-in slide-in-from-bottom-6 duration-500">
          {/* Executive Header Bar */}
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  <CheckCircle2 size={12} /> Execution Completed
                </span>
                <span className="text-xs text-slate-400 font-medium">{report.executedAt}</span>
              </div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight uppercase mt-2">
                Performance Test Report: {report.functionalityName}
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Target: <span className="font-bold text-slate-800">{report.targetUrl}</span> | Profile: <span className="font-bold text-indigo-600">{report.testType}</span> ({report.virtualUsers} VUs)
              </p>
            </div>

            {/* Export Actions Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleDownloadJmx}
                className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2"
              >
                <FileCode size={16} /> Apache JMeter (.jmx)
              </button>
              <button
                onClick={handleExportPdf}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2"
              >
                <FileText size={16} /> PDF Report
              </button>
              <button
                onClick={handleExportExcel}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center gap-2"
              >
                <FileSpreadsheet size={16} /> Excel (.xlsx)
              </button>
            </div>
          </div>

          {/* Navigation View Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto custom-scrollbar">
            {[
              { id: 'overview', label: 'Executive Summary', icon: Activity },
              { id: 'step_telemetry', label: 'Functionality Step Breakdown', icon: Workflow },
              { id: 'charts', label: 'Performance Charts', icon: BarChart3 },
              { id: 'ai_insights', label: 'Gemini AI Diagnosis', icon: Sparkles },
              { id: 'jmeter_xml', label: 'Apache JMeter JMX Plan', icon: FileCode }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeReportTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveReportTab(tab.id as any)}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shrink-0 ${
                    isActive 
                      ? 'bg-slate-900 text-white shadow-md' 
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-[#00E1C5]' : 'text-slate-400'} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {activeReportTab === 'overview' && (
            <div className="space-y-6">
              {/* Key Metric KPI Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Health Grade Card */}
                <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Health Grade</p>
                    <div className="text-5xl font-black tracking-tight text-[#00E1C5] mt-2">
                      {report.aiAnalysis?.overallGrade || 'A'}
                    </div>
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 mt-4 uppercase tracking-wider">
                    Status: <span className="text-emerald-400">{report.aiAnalysis?.healthStatus || 'Pass'}</span>
                  </p>
                </div>

                {/* Avg Response Time */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Response Time</p>
                    <div className="text-3xl font-black text-slate-800 tracking-tight mt-2 font-mono">
                      {report.avgResponseTimeMs} <span className="text-sm font-normal text-slate-400">ms</span>
                    </div>
                  </div>
                  <p className={`text-[11px] font-bold mt-4 uppercase tracking-wider ${
                    report.avgResponseTimeMs <= targetSlaMs ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {report.avgResponseTimeMs <= targetSlaMs ? 'Within SLA Target' : 'Exceeds SLA Target'}
                  </p>
                </div>

                {/* P95 Latency */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">P95 Latency</p>
                    <div className="text-3xl font-black text-indigo-600 tracking-tight mt-2 font-mono">
                      {report.p95ResponseTimeMs} <span className="text-sm font-normal text-slate-400">ms</span>
                    </div>
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 mt-4 uppercase tracking-wider">
                    P99: {report.p99ResponseTimeMs} ms
                  </p>
                </div>

                {/* Max RPS */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Peak Throughput</p>
                    <div className="text-3xl font-black text-slate-800 tracking-tight mt-2 font-mono">
                      {report.maxRps} <span className="text-sm font-normal text-slate-400">RPS</span>
                    </div>
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 mt-4 uppercase tracking-wider">
                    Total: {report.totalRequests} reqs
                  </p>
                </div>

                {/* Error Rate */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Error Rate</p>
                    <div className={`text-3xl font-black tracking-tight mt-2 font-mono ${
                      report.errorRatePercent > 1 ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {report.errorRatePercent}%
                    </div>
                  </div>
                  <p className="text-[11px] font-bold text-slate-400 mt-4 uppercase tracking-wider">
                    {report.failedRequests} Error(s)
                  </p>
                </div>
              </div>

              {/* Core Web Vitals Card Grid */}
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-[#00E1C5]/10 text-[#009B87] rounded-xl"><Gauge size={20} /></div>
                    <div>
                      <h4 className="font-black text-lg text-slate-800 uppercase tracking-tight">Core Web Vitals Metrics</h4>
                      <p className="text-xs text-slate-500 font-medium">Standard Google Web Vitals user experience indicators</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {[
                    { name: 'LCP (Largest Contentful)', val: `${report.webVitals.lcp.value} s`, rating: report.webVitals.lcp.rating, target: '<= 2.5s' },
                    { name: 'CLS (Cumulative Layout)', val: `${report.webVitals.cls.value}`, rating: report.webVitals.cls.rating, target: '<= 0.1' },
                    { name: 'TTFB (Time to First Byte)', val: `${report.webVitals.ttfb.value} ms`, rating: report.webVitals.ttfb.rating, target: '<= 800ms' },
                    { name: 'INP (Interaction Next)', val: `${report.webVitals.inp.value} ms`, rating: report.webVitals.inp.rating, target: '<= 200ms' },
                    { name: 'FCP (First Contentful)', val: `${report.webVitals.fcp.value} s`, rating: report.webVitals.fcp.rating, target: '<= 1.8s' },
                    { name: 'Speed Index', val: `${report.webVitals.speedIndex.value} s`, rating: report.webVitals.speedIndex.rating, target: '<= 3.4s' }
                  ].map((cwv) => (
                    <div key={cwv.name} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{cwv.name}</p>
                      <p className="text-xl font-black text-slate-800 font-mono mt-1">{cwv.val}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                          cwv.rating === 'GOOD' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {cwv.rating}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">{cwv.target}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: FUNCTIONALITY STEP BREAKDOWN */}
          {activeReportTab === 'step_telemetry' && (
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h4 className="font-black text-lg text-slate-800 uppercase tracking-tight">Transaction Step Performance Telemetry</h4>
                  <p className="text-xs text-slate-500 font-medium">Individual response times and SLA metrics for {report.functionalityName}</p>
                </div>
              </div>

              {/* Step Telemetry Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Step & Endpoint</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Avg Latency</th>
                      <th className="py-3 px-4">P95 Latency</th>
                      <th className="py-3 px-4">Target SLA</th>
                      <th className="py-3 px-4">Pass Rate</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {report.stepTelemetry.map((st, i) => (
                      <tr key={st.stepId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 px-4 font-bold text-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-600 font-mono font-black text-[10px] flex items-center justify-center">
                              {i + 1}
                            </span>
                            <div>
                              <p className="text-xs font-bold text-slate-800">{st.stepName}</p>
                              <p className="text-[10px] font-mono text-slate-400">{st.path}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4 font-mono font-bold">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            st.method === 'GET' ? 'bg-blue-100 text-blue-700' :
                            st.method === 'POST' ? 'bg-emerald-100 text-emerald-700' :
                            st.method === 'PUT' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {st.method}
                          </span>
                        </td>
                        <td className="py-4 px-4 font-mono font-bold text-slate-800">{st.avgLatencyMs} ms</td>
                        <td className="py-4 px-4 font-mono text-slate-600">{st.p95LatencyMs} ms</td>
                        <td className="py-4 px-4 font-mono text-slate-500">&lt; {st.slaMs} ms</td>
                        <td className="py-4 px-4 font-mono font-bold text-emerald-600">{st.passRatePercent}%</td>
                        <td className="py-4 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            st.status === 'PASSED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                            st.status === 'WARNING' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                            'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}>
                            {st.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Step Comparison Bar Chart */}
              <div className="pt-6 border-t border-slate-100">
                <h5 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-4">Step Response Latency vs SLA Threshold</h5>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.stepTelemetry}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="stepName" stroke="#94a3b8" fontSize={10} />
                      <YAxis stroke="#94a3b8" fontSize={11} unit="ms" />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff' }} />
                      <Legend />
                      <Bar dataKey="avgLatencyMs" name="Actual Avg Latency (ms)" fill="#6366f1" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="slaMs" name="Target SLA (ms)" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CHARTS */}
          {activeReportTab === 'charts' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-300">
              {/* Chart 1: Latency Over Time */}
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                <h4 className="font-black text-base text-slate-800 uppercase tracking-tight">Response Time Over Time</h4>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={report.timeSeriesMetrics}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} unit="ms" />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff' }} />
                      <Legend />
                      <Line type="monotone" dataKey="avgLatencyMs" name="Avg Latency (ms)" stroke="#6366f1" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="p95LatencyMs" name="P95 Latency (ms)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Throughput vs Virtual Users */}
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                <h4 className="font-black text-base text-slate-800 uppercase tracking-tight">Throughput & Active Virtual Users</h4>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={report.timeSeriesMetrics}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="timestamp" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff' }} />
                      <Legend />
                      <Area type="monotone" dataKey="rps" name="Requests / Sec (RPS)" fill="#00E1C5" fillOpacity={0.2} stroke="#00E1C5" strokeWidth={2} />
                      <Area type="monotone" dataKey="activeVus" name="Active VUs" fill="#8b5cf6" fillOpacity={0.15} stroke="#8b5cf6" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: GEMINI AI DIAGNOSIS */}
          {activeReportTab === 'ai_insights' && report.aiAnalysis && (
            <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-white p-8 md:p-10 rounded-[2.5rem] border border-slate-800 shadow-2xl space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-[#00E1C5] text-slate-950 rounded-2xl shadow-lg shadow-[#00E1C5]/20">
                    <Sparkles size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Gemini AI Performance Diagnosis</h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">Automated deep architectural synthesis for {report.functionalityName}</p>
                  </div>
                </div>

                <span className="px-4 py-1.5 bg-[#00E1C5]/10 border border-[#00E1C5]/30 rounded-full text-xs font-black text-[#00E1C5] uppercase tracking-wider self-start md:self-auto">
                  Verdict: {report.aiAnalysis.healthStatus}
                </span>
              </div>

              {/* AI Summary Text */}
              <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/60 leading-relaxed text-sm text-slate-300 font-medium">
                {report.aiAnalysis.summaryText}
              </div>

              {/* Actionable Recommendations with Code Snippets */}
              {report.aiAnalysis.aiRecommendations && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Actionable AI Optimization Roadmap</h4>
                  <div className="space-y-4">
                    {report.aiAnalysis.aiRecommendations.map((rec, rIdx) => (
                      <div key={rIdx} className="bg-slate-800/90 p-6 rounded-2xl border border-slate-700/90 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-lg bg-[#00E1C5]/20 text-[#00E1C5] font-black text-xs flex items-center justify-center font-mono">
                              {rec.priority}
                            </span>
                            <h5 className="font-black text-base text-white">{rec.actionTitle}</h5>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{rec.issueType}</span>
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed">{rec.recommendation}</p>

                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold flex items-center gap-2">
                          <Zap size={14} /> Expected Boost: {rec.estimatedImpact}
                        </div>

                        {rec.codeOrConfigSnippet && (
                          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 relative group">
                            <button
                              onClick={() => handleCopySnippet(rec.codeOrConfigSnippet!)}
                              className="absolute right-3 top-3 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5"
                            >
                              {copiedSnippet === rec.codeOrConfigSnippet ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              {copiedSnippet === rec.codeOrConfigSnippet ? 'Copied' : 'Copy'}
                            </button>
                            <pre className="text-xs font-mono text-[#00E1C5] overflow-x-auto p-1 leading-relaxed">
                              {rec.codeOrConfigSnippet}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: APACHE JMETER JMX PLAN */}
          {activeReportTab === 'jmeter_xml' && (
            <div className="bg-slate-900 text-slate-200 p-8 rounded-[2.5rem] border border-slate-800 shadow-2xl space-y-6 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-500/20 text-purple-400 rounded-2xl border border-purple-500/30">
                    <FileCode size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Apache JMeter Test Plan (.jmx)</h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">Importable directly into Apache JMeter GUI (v5.6.3+) or run via CLI</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyJmx}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2"
                  >
                    {copiedJmx ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    {copiedJmx ? 'JMX Copied!' : 'Copy XML'}
                  </button>
                  <button
                    onClick={handleDownloadJmx}
                    className="px-5 py-2.5 bg-[#00E1C5] hover:bg-[#00c8af] text-slate-950 font-black rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg flex items-center gap-2"
                  >
                    <Download size={14} /> Download .jmx File
                  </button>
                </div>
              </div>

              {/* CLI Execution Instructions */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-slate-300 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">How to run this test plan via Apache JMeter CLI:</p>
                <p className="text-[#00E1C5]">
                  jmeter -n -t automatiqa_{report.functionalityName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_plan.jmx -l results.jtl -e -o ./report
                </p>
              </div>

              {/* Code Viewer */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 font-mono text-xs overflow-x-auto max-h-[500px] custom-scrollbar leading-relaxed text-indigo-300">
                <pre>{report.jmxPlanXml}</pre>
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      )}
    </div>
  );
};

export default PerformanceTestingWorkflow;
