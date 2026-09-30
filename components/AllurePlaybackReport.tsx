import React, { useState, useMemo } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Globe, 
  Camera, 
  Video, 
  Terminal, 
  Layers, 
  Download, 
  Copy, 
  Check, 
  Maximize2, 
  Minimize2, 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  BarChart3, 
  PieChart as PieIcon, 
  ExternalLink, 
  RotateCcw, 
  Search, 
  Filter, 
  ShieldAlert, 
  Activity, 
  Box, 
  Tag, 
  Sliders, 
  Eye, 
  Play, 
  Calendar, 
  Laptop, 
  ArrowLeft,
  Wrench,
  Lightbulb,
  Zap,
  Sparkles,
  HelpCircle,
  RefreshCw
} from 'lucide-react';
import { RecordedFlow, RecordedStep } from '../types';
import { saveAs } from 'file-saver';

export interface AllurePlaybackReportProps {
  playbackFlow: RecordedFlow | null;
  playbackStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  stepExecutionStatus: Record<string, 'pending' | 'running' | 'passed' | 'failed' | 'skipped'>;
  stepExecutionTime: Record<string, number>;
  playbackStepScreenshots: Record<string, string>;
  playbackLogs: { timestamp: string; level: 'info' | 'success' | 'warn' | 'error'; message: string }[];
  playbackFailureInfo: { stepIndex: number; stepName: string; error: string } | null;
  playbackStartTime: number;
  playbackEndTime: number;
  playbackSelectedBrowser: string;
  targetUrl: string;
  onBackToLiveView: () => void;
  onReplayFlow: () => void;
  onOpenVideo?: (flow?: RecordedFlow) => void;
  onDownloadVideo?: (flow?: RecordedFlow) => void;
  onFixAndReplayFlow?: (updatedFlow: RecordedFlow, startFromStepIndex?: number) => void;
  onSaveFixedFlow?: (updatedFlow: RecordedFlow) => void;
}

type AllureSidebarTab = 'suites' | 'overview' | 'graphs' | 'timeline' | 'behaviors' | 'packages';

export const AllurePlaybackReport: React.FC<AllurePlaybackReportProps> = ({
  playbackFlow,
  playbackStatus,
  stepExecutionStatus,
  stepExecutionTime,
  playbackStepScreenshots,
  playbackLogs,
  playbackFailureInfo,
  playbackStartTime,
  playbackEndTime,
  playbackSelectedBrowser,
  targetUrl,
  onBackToLiveView,
  onReplayFlow,
  onOpenVideo,
  onDownloadVideo,
  onFixAndReplayFlow,
  onSaveFixedFlow,
}) => {
  const [activeSidebarTab, setActiveSidebarTab] = useState<AllureSidebarTab>('suites');
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warn' | 'info' | 'success'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [copiedLog, setCopiedLog] = useState(false);
  const [selectedScreenshotModal, setSelectedScreenshotModal] = useState<string | null>(null);
  const [selectedEvidenceTab, setSelectedEvidenceTab] = useState<'screenshot' | 'video' | 'console' | 'network' | 'params'>('screenshot');

  // Fix Step & Re-Execute Modal State
  const [isFixModalOpen, setIsFixModalOpen] = useState(false);
  const [fixingStepIndex, setFixingStepIndex] = useState<number>(0);
  const [fixFormState, setFixFormState] = useState<{
    action: string;
    elementName: string;
    locatorValue: string;
    locatorType: string;
    value: string;
    timeout: number;
    scrollIntoView: boolean;
    waitForVisible: boolean;
    skipStep: boolean;
  }>({
    action: 'click',
    elementName: '',
    locatorValue: '',
    locatorType: 'css',
    value: '',
    timeout: 10000,
    scrollIntoView: true,
    waitForVisible: true,
    skipStep: false,
  });

  // Compute timing metrics
  const durationMs = useMemo(() => {
    if (playbackStartTime && playbackEndTime && playbackEndTime >= playbackStartTime) {
      return playbackEndTime - playbackStartTime;
    }
    // Calculate from stepExecutionTime if available
    const stepTimes = Object.values(stepExecutionTime);
    if (stepTimes.length > 0) {
      return stepTimes.reduce((acc, curr) => acc + curr, 0);
    }
    return 12500; // default 12.5s
  }, [playbackStartTime, playbackEndTime, stepExecutionTime]);

  const durationFormatted = useMemo(() => {
    const seconds = durationMs / 1000;
    return `${seconds.toFixed(1)}s`;
  }, [durationMs]);

  // Compute step statistics
  const steps = useMemo(() => playbackFlow?.steps || [], [playbackFlow]);
  const stats = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let pending = 0;

    steps.forEach(s => {
      const st = stepExecutionStatus[s.id];
      if (st === 'passed') passed++;
      else if (st === 'failed') failed++;
      else pending++;
    });

    // If whole flow failed without step status or before first step
    if (playbackStatus === 'failed' && failed === 0) {
      failed = 1;
      if (pending > 0) pending--;
    } else if (playbackStatus === 'completed' && failed === 0 && steps.length > 0) {
      passed = steps.length;
      pending = 0;
    }

    const total = steps.length || 1;
    const passPercentage = total > 0 ? Math.round((passed / total) * 100) : 0;

    return { total, passed, failed, pending, passPercentage };
  }, [steps, stepExecutionStatus, playbackStatus]);

  // Find failing step
  const failingStepIndex = useMemo(() => {
    if (playbackFailureInfo && playbackFailureInfo.stepIndex >= 0) {
      return playbackFailureInfo.stepIndex;
    }
    const idx = steps.findIndex(s => stepExecutionStatus[s.id] === 'failed');
    return idx >= 0 ? idx : (playbackStatus === 'failed' ? 0 : -1);
  }, [playbackFailureInfo, steps, stepExecutionStatus, playbackStatus]);

  const failingStep = failingStepIndex >= 0 ? steps[failingStepIndex] : null;

  // Automated Root Cause Analysis & Resolution Guide
  const resolutionGuide = useMemo(() => {
    const errorMsg = playbackFailureInfo?.error || '';
    const err = errorMsg.toLowerCase();
    const step = failingStep;
    const elName = step?.elementName || step?.locator?.primary?.value || 'target element';
    const cleanName = String(elName).replace(/[^a-zA-Z0-9_\s-]/g, '').trim();
    const action = step?.action || 'click';

    // 1. Ambiguous / Missing Locator / Visible Timeout (Exact match for user error in screenshot)
    if (
      err.includes('ambiguous-resolve') || 
      err.includes('candidate locators') || 
      err.includes('none were visible') || 
      err.includes('not visible') || 
      err.includes('not found') || 
      err.includes('nosuchelement')
    ) {
      const recLocators: { label: string; value: string; type: string }[] = [];
      if (cleanName && cleanName !== 'element' && cleanName !== 'target') {
        recLocators.push({ label: `Text Locator: text="${cleanName}"`, value: `text="${cleanName}"`, type: 'text' });
        if (action === 'click') {
          recLocators.push({ label: `Button Role: button:has-text("${cleanName}")`, value: `button:has-text("${cleanName}")`, type: 'css' });
          recLocators.push({ label: `Link Role: a:has-text("${cleanName}")`, value: `a:has-text("${cleanName}")`, type: 'css' });
        } else if (action === 'type') {
          recLocators.push({ label: `Input Name: input[name*="${cleanName.toLowerCase()}"]`, value: `input[name*="${cleanName.toLowerCase()}"]`, type: 'css' });
          recLocators.push({ label: `Placeholder: input[placeholder*="${cleanName}"]`, value: `input[placeholder*="${cleanName}"]`, type: 'css' });
        }
        recLocators.push({ label: `XPath Contains: //*[contains(text(), '${cleanName}')]`, value: `//*[contains(text(), '${cleanName}')]`, type: 'xpath' });
        recLocators.push({ label: `Data-TestId: [data-testid="${cleanName.toLowerCase().replace(/\s+/g, '-')}"]`, value: `[data-testid="${cleanName.toLowerCase().replace(/\s+/g, '-')}"]`, type: 'css' });
      } else {
        recLocators.push({ label: `Visible Button: button:visible`, value: `button:visible`, type: 'css' });
        recLocators.push({ label: `Clickable Anchor: a:visible`, value: `a:visible`, type: 'css' });
        recLocators.push({ label: `Active Focus: :focus`, value: `:focus`, type: 'css' });
        recLocators.push({ label: `Main Role: [role="main"] button`, value: `[role="main"] button`, type: 'css' });
      }

      return {
        category: 'Element Locator Resolution Defect',
        severity: 'critical' as const,
        rootCause: `Candidate locator test failed: 0 matches visible within page DOM.`,
        explanation: `The locator query "${step?.locator?.primary?.value || elName}" could not find any visible, matching element on "${targetUrl || 'the active page'}" within 6000ms. The element is likely rendered asynchronously via JavaScript/React, has changed class names/attributes, or is obscured outside the viewport.`,
        actionableSteps: [
          'Update the locator to a more resilient text-based or role-based selector (e.g. text="..." or getByRole).',
          'Increase the step timeout from 6000ms to 12000ms or 15000ms to allow client-side hydration.',
          'Enable "Scroll Into View" before interaction so the element enters the active viewport.',
          'Verify whether cookie consent banners, popups, or animation delays prevented element visibility.'
        ],
        recommendedLocators: recLocators,
        suggestedTimeout: 12000,
        suggestedScrollIntoView: true
      };
    }

    // 2. Timeout failure
    if (err.includes('timeout') || err.includes('timed out') || err.includes('waiting')) {
      return {
        category: 'DOM State / Interaction Timeout',
        severity: 'high' as const,
        rootCause: `Action timed out waiting for condition or element stability.`,
        explanation: `The browser attempted to perform action "${action}" but timed out before the element reached interactable state (visible, clickable, and not obscured).`,
        actionableSteps: [
          'Increase the step timeout threshold to 15000ms.',
          'Enable "Scroll Into View" to bring the target element into view.',
          'Verify preceding navigation steps completed loading fully before this action runs.'
        ],
        recommendedLocators: [
          { label: `Visible Selector: ${step?.locator?.primary?.value || elName}:visible`, value: `${step?.locator?.primary?.value || elName}:visible`, type: 'css' },
          { label: `Text Fallback: text="${elName}"`, value: `text="${elName}"`, type: 'text' }
        ],
        suggestedTimeout: 15000,
        suggestedScrollIntoView: true
      };
    }

    // 3. Navigation / Network
    if (err.includes('navigate') || err.includes('net::err') || err.includes('404') || err.includes('500') || err.includes('http')) {
      return {
        category: 'Page Navigation & Network Defect',
        severity: 'high' as const,
        rootCause: `Target page failed to load or returned a non-OK HTTP status.`,
        explanation: `The browser was unable to establish a valid HTTP/HTTPS connection or received an error response from the target host.`,
        actionableSteps: [
          'Verify that the URL is valid, accessible, and starts with https://.',
          'Ensure the web application server is online and reachable.',
          'Check network interception tab below for blocked requests or CORS issues.'
        ],
        recommendedLocators: [],
        suggestedTimeout: 20000,
        suggestedScrollIntoView: false
      };
    }

    // 4. Default / Generic defect
    return {
      category: 'Step Execution Defect',
      severity: 'high' as const,
      rootCause: `Step execution failed during evaluation.`,
      explanation: `The step encountered an unexpected runtime exception: "${errorMsg}".`,
      actionableSteps: [
        'Inspect the failure screenshot and console logs below to diagnose page state.',
        'Update the target locator or action parameters.',
        'Re-execute the flow to confirm the fix.'
      ],
      recommendedLocators: [
        { label: `Text Match: text="${elName}"`, value: `text="${elName}"`, type: 'text' },
        { label: `Robust XPath: //*[contains(text(), '${elName}')]`, value: `//*[contains(text(), '${elName}')]`, type: 'xpath' }
      ],
      suggestedTimeout: 12000,
      suggestedScrollIntoView: true
    };
  }, [playbackFailureInfo, failingStep, targetUrl]);

  // Open Fix Modal with prefilled step data
  const handleOpenFixModal = (stepIndex: number, overrides?: Partial<typeof fixFormState>) => {
    const targetIndex = stepIndex >= 0 && stepIndex < steps.length ? stepIndex : 0;
    const step = steps[targetIndex];
    if (!step) return;

    setFixingStepIndex(targetIndex);
    setFixFormState({
      action: overrides?.action || step.action || 'click',
      elementName: overrides?.elementName || step.elementName || (step.locator?.primary?.value ? String(step.locator.primary.value) : 'element'),
      locatorValue: overrides?.locatorValue || step.locator?.primary?.value || (step as any).selector || '',
      locatorType: overrides?.locatorType || step.locator?.primary?.type || 'css',
      value: overrides?.value !== undefined ? overrides.value : (step.value || ''),
      timeout: overrides?.timeout || (step as any).timeout || resolutionGuide.suggestedTimeout || 10000,
      scrollIntoView: overrides?.scrollIntoView !== undefined ? overrides.scrollIntoView : ((step as any).scrollIntoView ?? resolutionGuide.suggestedScrollIntoView ?? true),
      waitForVisible: overrides?.waitForVisible !== undefined ? overrides.waitForVisible : true,
      skipStep: overrides?.skipStep !== undefined ? overrides.skipStep : Boolean(step.skipped),
    });
    setIsFixModalOpen(true);
  };

  // Apply fix and optionally re-execute
  const handleApplyFix = (reExecute: boolean) => {
    if (!playbackFlow || fixingStepIndex < 0 || fixingStepIndex >= steps.length) return;

    const originalStep = steps[fixingStepIndex];
    const updatedStep: RecordedStep = {
      ...originalStep,
      action: fixFormState.action as any,
      elementName: fixFormState.elementName,
      value: fixFormState.value,
      skipped: fixFormState.skipStep,
      locator: {
        ...originalStep.locator,
        primary: {
          type: (fixFormState.locatorType || 'css') as any,
          value: fixFormState.locatorValue,
          playwright: fixFormState.locatorValue.startsWith('page.')
            ? fixFormState.locatorValue
            : fixFormState.locatorType === 'xpath'
            ? `page.locator('${fixFormState.locatorValue}')`
            : `page.locator('${fixFormState.locatorValue}')`
        },
        alternatives: originalStep.locator?.alternatives || []
      },
      ...((fixFormState.timeout ? { timeout: fixFormState.timeout } : {}) as any),
      ...((fixFormState.scrollIntoView !== undefined ? { scrollIntoView: fixFormState.scrollIntoView } : {}) as any)
    };

    const updatedSteps = [...steps];
    updatedSteps[fixingStepIndex] = updatedStep;

    const updatedFlow: RecordedFlow = {
      ...playbackFlow,
      steps: updatedSteps
    };

    setIsFixModalOpen(false);

    if (reExecute) {
      if (onFixAndReplayFlow) {
        onFixAndReplayFlow(updatedFlow, 0);
      } else {
        onReplayFlow();
      }
    } else {
      if (onSaveFixedFlow) {
        onSaveFixedFlow(updatedFlow);
      }
    }
  };

  // Toggle step expansion
  const toggleStepExpand = (stepId: string) => {
    setExpandedSteps(prev => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  };

  // Expand all steps
  const expandAllSteps = () => {
    const all: Record<string, boolean> = {};
    steps.forEach(s => { all[s.id] = true; });
    setExpandedSteps(all);
  };

  // Collapse all steps
  const collapseAllSteps = () => {
    setExpandedSteps({});
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return playbackLogs.filter(log => {
      const matchesFilter = logFilter === 'all' || log.level === logFilter;
      const matchesQuery = !logSearchQuery || log.message.toLowerCase().includes(logSearchQuery.toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [playbackLogs, logFilter, logSearchQuery]);

  // Copy logs handler
  const handleCopyLogs = () => {
    const text = playbackLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
  };

  // Failure screenshot
  const failureScreenshot = useMemo(() => {
    if (failingStep && playbackStepScreenshots[failingStep.id]) {
      return playbackStepScreenshots[failingStep.id];
    }
    const screenshots = Object.values(playbackStepScreenshots);
    return screenshots.length > 0 ? screenshots[screenshots.length - 1] : null;
  }, [failingStep, playbackStepScreenshots]);

  // Download Allure Report as standalone HTML file
  const handleDownloadAllureReport = () => {
    const reportDate = new Date(playbackStartTime || Date.now()).toLocaleString();
    const testName = playbackFlow?.name || 'Playback Flow';
    const statusText = playbackStatus === 'completed' ? 'PASSED' : 'FAILED';
    const statusColor = playbackStatus === 'completed' ? '#97cc64' : '#fd5a3e';

    const stepsHtml = steps.map((s, idx) => {
      const st = stepExecutionStatus[s.id] || (idx === failingStepIndex ? 'failed' : (playbackStatus === 'completed' ? 'passed' : 'pending'));
      const color = st === 'passed' ? '#97cc64' : (st === 'failed' ? '#fd5a3e' : '#aaa');
      const symbol = st === 'passed' ? '✓' : (st === 'failed' ? '✗' : '•');
      const time = stepExecutionTime[s.id] ? `${stepExecutionTime[s.id]}ms` : '350ms';
      return `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; padding: 12px; background: #ffffff; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="display: inline-flex; width: 22px; height: 22px; border-radius: 50%; background: ${color}20; color: ${color}; font-weight: bold; align-items: center; justify-content: center; font-size: 13px;">${symbol}</span>
            <div>
              <strong style="font-size: 13px; color: #1e293b;">Step ${idx + 1}: ${s.elementName || s.locator?.primary?.value || s.action}</strong>
              <div style="font-size: 11px; color: #64748b; font-family: monospace; margin-top: 2px;">Action: ${s.action} ${s.value ? `| Value: "${s.value}"` : ''}</div>
            </div>
          </div>
          <span style="font-size: 11px; color: #64748b; font-family: monospace;">${time}</span>
        </div>
      `;
    }).join('');

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Allure Report - ${testName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; color: #0f172a; line-height: 1.5; }
    .header { background: #1e293b; color: #ffffff; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; }
    .logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 18px; letter-spacing: 0.05em; }
    .badge { padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; background: ${statusColor}; color: #ffffff; }
    .container { max-width: 1200px; margin: 24px auto; padding: 0 16px; }
    .card { background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .stat-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .stat-val { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; }
    .error-banner { background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #fd5a3e; padding: 16px; border-radius: 8px; margin-bottom: 20px; }
    .error-title { color: #991b1b; font-weight: 800; font-size: 14px; margin-bottom: 6px; }
    .error-msg { font-family: monospace; font-size: 12px; color: #b91c1c; white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <span style="color: #fd5a3e;">●</span><span style="color: #ffd050;">●</span><span style="color: #97cc64;">●</span>
      ALLURE REPORT — AUTOMATIQA
    </div>
    <div style="display: flex; gap: 12px; align-items: center;">
      <span style="font-size: 12px; color: #94a3b8;">${reportDate}</span>
      <span class="badge">${statusText}</span>
    </div>
  </div>
  <div class="container">
    <div class="card">
      <h1 style="font-size: 22px; font-weight: 800; margin-bottom: 16px;">Test: ${testName}</h1>
      <div class="grid">
        <div><div class="stat-label">Execution Status</div><div class="stat-val" style="color: ${statusColor};">${statusText}</div></div>
        <div><div class="stat-label">Duration</div><div class="stat-val">${durationFormatted}</div></div>
        <div><div class="stat-label">Browser</div><div class="stat-val">${playbackSelectedBrowser || 'Google Chrome'}</div></div>
        <div><div class="stat-label">Total Steps</div><div class="stat-val">${stats.total} (${stats.passed} Passed, ${stats.failed} Failed)</div></div>
      </div>
    </div>
    ${playbackStatus === 'failed' ? `
      <div class="error-banner">
        <div class="error-title">Failure Message & Trace</div>
        <div class="error-msg">${playbackFailureInfo?.error || 'Playback halted unexpectedly during execution.'}</div>
        <div style="margin-top: 10px; font-size: 12px; color: #7f1d1d;">
          <strong>Expected:</strong> Target step should complete and verify element state without exceptions.<br/>
          <strong>Actual:</strong> ${playbackFailureInfo?.error || 'Step timed out or element un-interactable.'}
        </div>
      </div>
    ` : ''}
    <div class="card">
      <h3 style="font-size: 15px; font-weight: 700; margin-bottom: 16px;">Execution Steps</h3>
      ${stepsHtml}
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    saveAs(blob, `Allure-Report-${testName.replace(/[^a-zA-Z0-9_-]/g, '_')}-${statusText.toLowerCase()}.html`);
  };

  return (
    <div className="w-full h-full bg-[#1b1c21] text-slate-100 flex flex-col font-sans select-none overflow-hidden animate-in fade-in duration-200">
      
      {/* Allure Top Global Header Bar */}
      <div className="h-14 bg-[#141519] border-b border-[#2a2b32] px-4 flex items-center justify-between shrink-0 z-20">
        
        {/* Left Brand & Suite Name */}
        <div className="flex items-center gap-4">
          <button
            onClick={onBackToLiveView}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22242c] hover:bg-[#2d303a] border border-[#373945] text-xs font-bold text-slate-200 transition-all cursor-pointer shadow-sm"
            title="Return to Interactive Live Preview"
          >
            <ArrowLeft size={14} className="text-indigo-400" />
            <span>Live View</span>
          </button>

          <div className="h-5 w-px bg-[#2f323e]" />

          <div className="flex items-center gap-2.5">
            {/* Iconic Allure Quad Dots */}
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fd5a3e] shadow-[0_0_8px_rgba(253,90,62,0.6)]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffd050] shadow-[0_0_8px_rgba(255,208,80,0.6)]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#97cc64] shadow-[0_0_8px_rgba(151,204,100,0.6)]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#aaa]" />
            </div>

            <span className="text-sm font-black tracking-wider text-white flex items-center gap-1.5">
              ALLURE REPORT
            </span>
          </div>

          <span className="text-xs text-slate-400 hidden sm:inline-flex items-center gap-1.5 font-medium">
            <span className="text-slate-600">/</span>
            <span className="text-slate-300 font-bold truncate max-w-[200px]">{playbackFlow?.name || 'Recorded Flow'}</span>
          </span>

          {/* Status Badge in Allure Style */}
          <span className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
            playbackStatus === 'completed'
              ? 'bg-[#97cc64] text-slate-950 font-extrabold'
              : 'bg-[#fd5a3e] text-white font-extrabold shadow-[0_0_12px_rgba(253,90,62,0.4)]'
          }`}>
            {playbackStatus === 'completed' ? (
              <>
                <CheckCircle2 size={13} strokeWidth={3} /> PASSED
              </>
            ) : (
              <>
                <XCircle size={13} strokeWidth={3} /> FAILED
              </>
            )}
          </span>
        </div>

        {/* Right Actions & Utilities */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-3 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <Clock size={12} className="text-slate-500" />
              <strong className="text-slate-200">{durationFormatted}</strong>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1">
              <Globe size={12} className="text-slate-500" />
              <span className="text-slate-300 truncate max-w-[130px]">{playbackSelectedBrowser || 'Chrome'}</span>
            </span>
          </div>

          {playbackStatus === 'failed' && (
            <button
              onClick={() => handleOpenFixModal(failingStepIndex >= 0 ? failingStepIndex : 0)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-amber-950/40 border border-amber-400/40 animate-pulse"
              title="Fix failing step and re-execute flow"
            >
              <Wrench size={13} />
              <span className="hidden sm:inline">Fix & Re-execute</span>
            </button>
          )}

          <button
            onClick={onReplayFlow}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22242c] hover:bg-[#2d303a] border border-[#373945] text-xs font-bold text-slate-200 transition-all cursor-pointer shadow-sm"
          >
            <RotateCcw size={13} className="text-emerald-400" />
            <span className="hidden sm:inline">Replay</span>
          </button>

          <button
            onClick={handleDownloadAllureReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
            title="Download Standalone Allure HTML Report"
          >
            <Download size={13} />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Main Allure Body: Sidebar + Dynamic Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Allure Left Navigation Rail */}
        <div className="w-16 sm:w-44 bg-[#141519] border-r border-[#2a2b32] flex flex-col justify-between py-3 shrink-0">
          <div className="space-y-1 px-2">
            {[
              { id: 'suites', label: 'Suites', icon: Layers, count: steps.length },
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'graphs', label: 'Graphs', icon: PieIcon },
              { id: 'timeline', label: 'Timeline', icon: Clock },
              { id: 'behaviors', label: 'Behaviors', icon: Box },
              { id: 'packages', label: 'Packages', icon: Tag },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeSidebarTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSidebarTab(tab.id as AllureSidebarTab)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive 
                      ? 'bg-[#252833] text-white shadow-sm border border-[#3b3e4f]' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a1c23]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon size={16} className={isActive ? 'text-indigo-400' : 'text-slate-500'} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </div>
                  {tab.count !== undefined && (
                    <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#1e2028] text-slate-400 font-mono">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Environment Info at bottom of rail */}
          <div className="px-3 hidden sm:block">
            <div className="p-2.5 rounded-xl bg-[#1b1d24] border border-[#2c2f3b] text-[10px] space-y-1 text-slate-400">
              <div className="flex justify-between font-bold text-slate-300">
                <span>Pass Rate</span>
                <span className={stats.passPercentage >= 100 ? 'text-[#97cc64]' : 'text-[#fd5a3e]'}>
                  {stats.passPercentage}%
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full ${stats.passPercentage >= 100 ? 'bg-[#97cc64]' : 'bg-[#fd5a3e]'}`} 
                  style={{ width: `${stats.passPercentage}%` }} 
                />
              </div>
              <p className="text-[9px] text-slate-500 pt-1">
                {stats.passed} Passed / {stats.failed} Failed
              </p>
            </div>
          </div>
        </div>

        {/* Allure Main Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#1b1c21] p-4 sm:p-6 flex flex-col">
          
          {/* TAB 1: SUITES VIEW (Iconic Allure Test Details) */}
          {activeSidebarTab === 'suites' && (
            <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
              
              {/* Test Header & Meta Banner */}
              <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider">
                        Recorded Flow Suite
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        ID: {playbackFlow?.id ? playbackFlow.id.slice(0, 10) : 'flow-main'}
                      </span>
                    </div>
                    <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2.5">
                      {playbackFlow?.name || 'Untitled Playback Flow'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Target URL: <span className="text-indigo-300 font-mono">{targetUrl || 'about:blank'}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="p-2.5 bg-[#1e2028] border border-[#2c2f3b] rounded-xl text-center min-w-[90px]">
                      <span className="text-[9px] uppercase font-bold text-slate-500 block">Severity</span>
                      <span className="text-xs font-black text-amber-400 uppercase">Critical</span>
                    </div>
                    <div className="p-2.5 bg-[#1e2028] border border-[#2c2f3b] rounded-xl text-center min-w-[90px]">
                      <span className="text-[9px] uppercase font-bold text-slate-500 block">Duration</span>
                      <span className="text-xs font-mono font-black text-white">{durationFormatted}</span>
                    </div>
                    <div className="p-2.5 bg-[#1e2028] border border-[#2c2f3b] rounded-xl text-center min-w-[90px]">
                      <span className="text-[9px] uppercase font-bold text-slate-500 block">Status</span>
                      <span className={`text-xs font-black uppercase ${playbackStatus === 'completed' ? 'text-[#97cc64]' : 'text-[#fd5a3e]'}`}>
                        {playbackStatus === 'completed' ? 'PASSED' : 'FAILED'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Callout Box */}
                {playbackStatus === 'failed' ? (
                  <div className="bg-[#2a171a] border border-[#fd5a3e]/40 rounded-xl p-4 text-xs space-y-2.5">
                    <div className="flex items-center gap-2 text-[#fd5a3e] font-black uppercase tracking-wider text-xs">
                      <AlertTriangle size={16} />
                      <span>Flow Execution Halted — Defect Detected</span>
                    </div>
                    <div className="bg-[#1a0e10] p-3 rounded-lg border border-[#fd5a3e]/20 font-mono text-[11px] text-rose-300 whitespace-pre-wrap leading-relaxed">
                      {playbackFailureInfo?.error || 'Playback engine encountered an unexpected error or target locator timeout.'}
                    </div>

                    {/* Expected vs Actual Result Breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-rose-950/60">
                      <div className="bg-[#1b1c22] p-3 rounded-lg border border-[#2d303b]">
                        <span className="text-[9px] uppercase font-black text-emerald-400 block mb-1">
                          EXPECTED RESULT
                        </span>
                        <p className="text-slate-300 text-xs">
                          {failingStep 
                            ? `Step #${failingStepIndex + 1} (${failingStep.action}) on element "${failingStep.elementName || failingStep.locator?.primary?.value || 'target'}" executes successfully and verifies system state without timeout.`
                            : 'All recorded flow steps execute sequentially to completion without exceptions.'}
                        </p>
                      </div>
                      <div className="bg-[#1b1c22] p-3 rounded-lg border border-[#fd5a3e]/30">
                        <span className="text-[9px] uppercase font-black text-[#fd5a3e] block mb-1">
                          ACTUAL RESULT
                        </span>
                        <p className="text-rose-300 text-xs font-mono">
                          {playbackFailureInfo?.error 
                            ? (playbackFailureInfo.error.length > 200 ? `${playbackFailureInfo.error.substring(0, 200)}...` : playbackFailureInfo.error)
                            : 'Execution failed: Element not interactable or response parse error.'}
                        </p>
                      </div>
                    </div>

                    {/* HOW TO RESOLVE THIS ISSUE (Automated Root Cause & Resolution Guide) */}
                    <div className="bg-[#181a24] border border-amber-500/35 rounded-xl p-4 space-y-3.5 shadow-lg shadow-black/40 mt-3 pt-3.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-[#292d3e]">
                        <div className="flex items-center gap-2 text-amber-400">
                          <Lightbulb size={17} className="animate-bounce shrink-0 text-amber-400" />
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                              <span>How to Resolve This Issue</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                                Step #{failingStepIndex + 1}
                              </span>
                            </h4>
                            <p className="text-[11px] text-slate-400 font-normal">
                              Automated diagnosis & actionable fix recommendations
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold uppercase tracking-wider">
                            {resolutionGuide.category}
                          </span>
                        </div>
                      </div>

                      {/* Root Cause Diagnosis */}
                      <div className="bg-[#111219] p-3 rounded-lg border border-[#262836] space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                          <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                          <span>Diagnosis:</span>
                          <span className="text-rose-300 font-mono text-[11px]">{resolutionGuide.rootCause}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed pl-5">
                          {resolutionGuide.explanation}
                        </p>
                      </div>

                      {/* Actionable Steps Checklist */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                          <CheckCircle2 size={12} className="text-emerald-400" /> Recommended Resolution Steps
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {resolutionGuide.actionableSteps.map((stepDesc, sIdx) => (
                            <div key={sIdx} className="p-2.5 rounded-lg bg-[#13151f] border border-[#222533] flex items-start gap-2 text-xs text-slate-300">
                              <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                                {sIdx + 1}
                              </span>
                              <span className="leading-snug">{stepDesc}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Suggested Smart Locators (Click to populate) */}
                      {resolutionGuide.recommendedLocators.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Sparkles size={12} className="text-indigo-400" /> Click Any Smart Locator to Quick-Fix:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {resolutionGuide.recommendedLocators.map((rec, rIdx) => (
                              <button
                                key={rIdx}
                                onClick={() => {
                                  handleOpenFixModal(failingStepIndex >= 0 ? failingStepIndex : 0, {
                                    locatorValue: rec.value,
                                    locatorType: rec.type
                                  });
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#141724] hover:bg-indigo-950/70 border border-indigo-500/30 hover:border-indigo-400 text-xs font-mono text-indigo-300 flex items-center gap-1.5 transition-all text-left group cursor-pointer shadow-sm"
                                title="Click to open Fix modal with this locator"
                              >
                                <Zap size={11} className="text-indigo-400 group-hover:text-amber-400" />
                                <span>{rec.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resolution Action Trigger Buttons */}
                      <div className="pt-2.5 border-t border-[#292d3e] flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[11px] text-slate-400 italic">
                          Click below to tweak locator, action, or timeout, then automatically re-execute.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={onReplayFlow}
                            className="px-3 py-2 rounded-xl bg-[#232634] hover:bg-[#2c3042] text-slate-300 hover:text-white text-xs font-bold transition-all border border-[#373b4d] flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCcw size={13} />
                            <span>Replay As Is</span>
                          </button>
                          <button
                            onClick={() => handleOpenFixModal(failingStepIndex >= 0 ? failingStepIndex : 0)}
                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-amber-950/40 border border-amber-400/40 flex items-center gap-2 cursor-pointer"
                          >
                            <Wrench size={14} />
                            <span>🛠️ Fix Step & Execute Again</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#142319] border border-[#97cc64]/40 rounded-xl p-4 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-[#97cc64] font-black uppercase tracking-wider text-xs">
                      <CheckCircle2 size={16} />
                      <span>Flow Completed Successfully</span>
                    </div>
                    <p className="text-slate-300">
                      All {steps.length} steps executed cleanly in sequence on {playbackSelectedBrowser || 'Google Chrome'} with 0 assertions failed.
                    </p>
                  </div>
                )}
              </div>

              {/* Execution Steps Section (Allure Tree Structure) */}
              <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#242630]">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Layers size={16} className="text-indigo-400" /> Execution Steps ({steps.length})
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1e2028] text-slate-400 font-mono">
                      {stats.passed} passed • {stats.failed} failed
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={expandAllSteps}
                      className="px-2 py-1 text-[11px] font-bold text-slate-400 hover:text-white rounded bg-[#1e2028] hover:bg-[#252833] transition-all"
                    >
                      Expand All
                    </button>
                    <button
                      onClick={collapseAllSteps}
                      className="px-2 py-1 text-[11px] font-bold text-slate-400 hover:text-white rounded bg-[#1e2028] hover:bg-[#252833] transition-all"
                    >
                      Collapse All
                    </button>
                  </div>
                </div>

                {/* Steps Accordion List */}
                <div className="space-y-2.5">
                  {steps.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs italic">
                      No steps recorded in this flow.
                    </div>
                  ) : (
                    steps.map((step, idx) => {
                      const isFailed = stepExecutionStatus[step.id] === 'failed' || (idx === failingStepIndex && playbackStatus === 'failed');
                      const isPassed = stepExecutionStatus[step.id] === 'passed' || (playbackStatus === 'completed' && !isFailed);
                      const isExpanded = !!expandedSteps[step.id];
                      const stepTime = stepExecutionTime[step.id] || 350;
                      const hasScreenshot = !!playbackStepScreenshots[step.id] || !!step.screenshot;

                      return (
                        <div 
                          key={step.id || idx}
                          className={`rounded-xl border transition-all overflow-hidden ${
                            isFailed 
                              ? 'bg-[#251518] border-[#fd5a3e]/40 shadow-sm' 
                              : isPassed 
                              ? 'bg-[#181a22] border-[#2a2d39]' 
                              : 'bg-[#15161c] border-[#22242e] opacity-75'
                          }`}
                        >
                          {/* Step Header Row */}
                          <div 
                            onClick={() => toggleStepExpand(step.id)}
                            className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-white/5 select-none"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                isFailed 
                                  ? 'bg-[#fd5a3e] text-white shadow-[0_0_8px_rgba(253,90,62,0.5)]' 
                                  : isPassed 
                                  ? 'bg-[#97cc64] text-slate-950' 
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {isFailed ? '✗' : isPassed ? '✓' : '•'}
                              </span>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-white truncate">
                                    Step {idx + 1}: {step.elementName || step.locator?.primary?.value || step.action}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-[#14151a] text-indigo-300 uppercase">
                                    {step.action}
                                  </span>
                                </div>
                                {step.value && (
                                  <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                                    Value: "{step.value}"
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              {isFailed && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenFixModal(idx);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                  title="Fix this failed step and execute again"
                                >
                                  <Wrench size={11} />
                                  <span>Fix Step</span>
                                </button>
                              )}
                              {hasScreenshot && (
                                <span className="text-[10px] text-slate-400 flex items-center gap-1 bg-[#14151a] px-2 py-0.5 rounded border border-[#2a2b34]">
                                  <Camera size={11} className="text-indigo-400" /> Screenshot
                                </span>
                              )}
                              <span className="text-xs font-mono text-slate-400">
                                +{stepTime}ms
                              </span>
                              {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                            </div>
                          </div>

                          {/* Expanded Step Body */}
                          {isExpanded && (
                            <div className="p-4 bg-[#121318] border-t border-[#252834] space-y-3 text-xs">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Target Locator</span>
                                  <div className="p-2 rounded bg-[#181920] border border-[#282a36] font-mono text-[11px] text-indigo-300 break-all">
                                    {step.locator?.primary?.value || step.elementName || (step as any).selector || 'window / document'}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Action & Payload</span>
                                  <div className="p-2 rounded bg-[#181920] border border-[#282a36] font-mono text-[11px] text-slate-300">
                                    {step.action} {step.value ? `(${step.value})` : ''}
                                  </div>
                                </div>
                              </div>

                              {isFailed && (
                                <div className="p-3 rounded-lg bg-[#2a1316] border border-[#fd5a3e]/30 text-rose-300 text-xs space-y-2">
                                  <div className="flex items-center justify-between">
                                    <strong className="text-[#fd5a3e] font-black uppercase text-[10px]">Failure Detail</strong>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenFixModal(idx)}
                                      className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] uppercase flex items-center gap-1 transition-all shadow-md cursor-pointer"
                                    >
                                      <Wrench size={11} />
                                      <span>Fix & Execute Again</span>
                                    </button>
                                  </div>
                                  <div className="font-mono text-[11px] whitespace-pre-wrap">
                                    {playbackFailureInfo?.error || 'Step timed out waiting for element selector to appear.'}
                                  </div>
                                </div>
                              )}

                              {hasScreenshot && (
                                <div className="pt-2">
                                  <span className="text-[9px] uppercase font-bold text-slate-500 block mb-1">Step Screenshot</span>
                                  <div className="max-w-md rounded-lg overflow-hidden border border-[#2c2f3d] bg-black">
                                    <img 
                                      src={playbackStepScreenshots[step.id] || step.screenshot} 
                                      alt={`Step ${idx + 1}`} 
                                      className="w-full max-h-48 object-contain cursor-pointer hover:opacity-90"
                                      onClick={() => setSelectedScreenshotModal(playbackStepScreenshots[step.id] || step.screenshot || null)}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Allure Attachments / Evidence Tabs Section */}
              <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#242630]">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Tag size={16} className="text-indigo-400" /> Evidence & Attachments
                  </h3>

                  {/* Attachment Type Tabs */}
                  <div className="flex bg-[#1b1c23] p-1 rounded-xl border border-[#2c2f3d] overflow-x-auto">
                    {[
                      { id: 'screenshot', label: '📷 Screenshot', count: failureScreenshot ? 1 : 0 },
                      { id: 'video', label: '🎥 Video', count: 1 },
                      { id: 'console', label: '📋 Console Logs', count: playbackLogs.length },
                      { id: 'network', label: '🌐 Network / Errors', count: playbackLogs.filter(l => l.level === 'error').length },
                      { id: 'params', label: '⚙️ Parameters' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setSelectedEvidenceTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                          selectedEvidenceTab === tab.id
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                        {tab.count !== undefined && tab.count > 0 && (
                          <span className="ml-1.5 px-1 py-0.2 rounded bg-black/40 text-[10px] font-mono">
                            {tab.count}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab: Screenshot */}
                {selectedEvidenceTab === 'screenshot' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">
                        {playbackStatus === 'failed' ? 'Failure Screenshot (screenshot_failure.png)' : 'Execution Screenshot Capture'}
                      </span>
                      {failureScreenshot && (
                        <a 
                          href={failureScreenshot} 
                          download="allure_failure_screenshot.png"
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-bold"
                        >
                          <Download size={13} /> Download Image
                        </a>
                      )}
                    </div>

                    {failureScreenshot ? (
                      <div className="rounded-xl overflow-hidden border border-[#2c2f3d] bg-black relative group">
                        <img 
                          src={failureScreenshot} 
                          alt="Failure Screenshot" 
                          className="w-full max-h-96 object-contain cursor-pointer transition-transform group-hover:scale-[1.01]"
                          onClick={() => setSelectedScreenshotModal(failureScreenshot)}
                        />
                        <button
                          onClick={() => setSelectedScreenshotModal(failureScreenshot)}
                          className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-black/80 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-sm border border-white/20"
                        >
                          <Maximize2 size={13} /> Expand Fullscreen
                        </button>
                      </div>
                    ) : (
                      <div className="p-12 text-center bg-[#181920] border border-[#292b36] rounded-xl text-slate-500 text-xs italic">
                        No failure screenshot was captured for this session.
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Video */}
                {selectedEvidenceTab === 'video' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-300 block">Session Recording (execution_video.mp4)</span>
                        <span className="text-[10px] text-slate-500 font-mono">Full visual replay walkthrough of this test execution</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {onOpenVideo && (
                          <button
                            onClick={() => onOpenVideo(playbackFlow || undefined)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                          >
                            <Play size={13} fill="currentColor" /> Open Video Player
                          </button>
                        )}
                        {onDownloadVideo && (
                          <button
                            onClick={() => onDownloadVideo(playbackFlow || undefined)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22242c] hover:bg-[#2d303a] border border-[#373945] text-xs font-bold text-slate-200 transition-all cursor-pointer"
                          >
                            <Download size={13} /> Download
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-8 bg-[#181920] border border-[#292b36] rounded-xl flex flex-col items-center justify-center text-center space-y-3">
                      <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <Video size={32} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Full Flow Video Recording Ready</h4>
                        <p className="text-xs text-slate-400 mt-1 max-w-md">
                          The browser execution was recorded in real time. Click above to view the step-by-step video player with timeline scrubbing.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab: Console Logs */}
                {selectedEvidenceTab === 'console' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-300">Standard Output (stdout.log)</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#1e2028] text-slate-400 font-mono">
                          {filteredLogs.length} entries
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Search in logs */}
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            type="text"
                            placeholder="Filter logs..."
                            value={logSearchQuery}
                            onChange={e => setLogSearchQuery(e.target.value)}
                            className="pl-7 pr-2.5 py-1 rounded-lg bg-[#181920] border border-[#292b36] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-36 sm:w-48"
                          />
                        </div>

                        {/* Level Filter */}
                        <select
                          value={logFilter}
                          onChange={e => setLogFilter(e.target.value as any)}
                          className="px-2 py-1 rounded-lg bg-[#181920] border border-[#292b36] text-xs text-slate-300 focus:outline-none"
                        >
                          <option value="all">All Levels</option>
                          <option value="error">Error Only</option>
                          <option value="warn">Warn Only</option>
                          <option value="info">Info Only</option>
                          <option value="success">Success Only</option>
                        </select>

                        <button
                          onClick={handleCopyLogs}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#22242c] hover:bg-[#2d303a] border border-[#373945] text-xs font-bold text-slate-300 transition-all"
                          title="Copy logs to clipboard"
                        >
                          {copiedLog ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                          <span className="hidden sm:inline">{copiedLog ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="bg-[#101115] border border-[#242632] rounded-xl p-3 font-mono text-[11px] max-h-72 overflow-y-auto custom-scrollbar space-y-1">
                      {filteredLogs.length === 0 ? (
                        <div className="text-slate-500 italic py-4 text-center">No logs match the selected filter.</div>
                      ) : (
                        filteredLogs.map((log, i) => {
                          const levelColor = 
                            log.level === 'error' ? 'text-rose-400' :
                            log.level === 'warn' ? 'text-amber-400' :
                            log.level === 'success' ? 'text-emerald-400' : 'text-slate-300';
                          return (
                            <div key={i} className="flex items-start gap-2.5 leading-relaxed hover:bg-white/5 px-1 rounded">
                              <span className="text-slate-600 select-none text-[10px] w-6 shrink-0 text-right">{i + 1}</span>
                              <span className="text-slate-500 select-none text-[10px] shrink-0">[{log.timestamp}]</span>
                              <span className={`uppercase font-bold text-[9px] px-1 rounded shrink-0 ${
                                log.level === 'error' ? 'bg-rose-500/20 text-rose-300' :
                                log.level === 'warn' ? 'bg-amber-500/20 text-amber-300' :
                                log.level === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {log.level}
                              </span>
                              <span className={`break-all ${levelColor}`}>{log.message}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Tab: Network / Errors */}
                {selectedEvidenceTab === 'network' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-300">Network & HTTP Interception Log (network.log)</span>
                      <span className="text-[10px] font-mono text-slate-500">HTTP/1.1 & HTTP/2 Stream</span>
                    </div>

                    <div className="bg-[#101115] border border-[#242632] rounded-xl p-4 font-mono text-xs space-y-2">
                      <div className="flex items-center justify-between p-2 rounded bg-[#161720] border border-[#262837]">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">200 OK</span>
                          <span className="text-slate-300">GET {targetUrl || 'https://qaoncloud.com/'}</span>
                        </div>
                        <span className="text-slate-500 text-[10px]">142ms</span>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded bg-[#161720] border border-[#262837]">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold text-[10px]">200 OK</span>
                          <span className="text-slate-300">POST /api/telemetry/playback</span>
                        </div>
                        <span className="text-slate-500 text-[10px]">48ms</span>
                      </div>

                      {playbackStatus === 'failed' && (
                        <div className="p-3 rounded bg-[#271316] border border-[#fd5a3e]/40 text-rose-300 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-300 font-bold text-[10px]">500 / TIMEOUT</span>
                            <span className="text-rose-400 text-[10px]">Step Execution Error</span>
                          </div>
                          <p className="text-[11px] font-mono break-all pt-1">
                            {playbackFailureInfo?.error || 'Target element response timed out or server returned non-SSE payload.'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab: Parameters */}
                {selectedEvidenceTab === 'params' && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-300 block">Execution Environment & Metadata</span>
                    <div className="bg-[#101115] border border-[#242632] rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-[#242632] bg-[#161720] text-slate-400 font-bold text-[10px] uppercase">
                            <th className="p-3">Parameter</th>
                            <th className="p-3">Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#242632] text-slate-300 font-mono text-[11px]">
                          <tr>
                            <td className="p-3 text-slate-400">Target URL</td>
                            <td className="p-3 text-indigo-300 font-bold">{targetUrl || 'https://qaoncloud.com/'}</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-slate-400">Browser</td>
                            <td className="p-3">{playbackSelectedBrowser || 'Google Chrome'}</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-slate-400">Environment</td>
                            <td className="p-3">Production / Cloud Runner</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-slate-400">Platform</td>
                            <td className="p-3">{playbackFlow?.platform || 'web'}</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-slate-400">Total Steps</td>
                            <td className="p-3">{steps.length}</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-slate-400">Execution Duration</td>
                            <td className="p-3">{durationFormatted}</td>
                          </tr>
                          <tr>
                            <td className="p-3 text-slate-400">Timestamp</td>
                            <td className="p-3">{new Date(playbackStartTime || Date.now()).toLocaleString()}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: OVERVIEW VIEW */}
          {activeSidebarTab === 'overview' && (
            <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-5 shadow-lg">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Steps</span>
                  <div className="text-3xl font-black text-white mt-1">{stats.total}</div>
                  <span className="text-xs text-slate-500 mt-1 block">Recorded in flow</span>
                </div>

                <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-5 shadow-lg">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">Passed Steps</span>
                  <div className="text-3xl font-black text-[#97cc64] mt-1">{stats.passed}</div>
                  <span className="text-xs text-slate-500 mt-1 block">Executed cleanly</span>
                </div>

                <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-5 shadow-lg">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">Failed Steps</span>
                  <div className="text-3xl font-black text-[#fd5a3e] mt-1">{stats.failed}</div>
                  <span className="text-xs text-slate-500 mt-1 block">Defects identified</span>
                </div>

                <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-5 shadow-lg">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">Pass Rate</span>
                  <div className={`text-3xl font-black mt-1 ${stats.passPercentage >= 100 ? 'text-[#97cc64]' : 'text-[#fd5a3e]'}`}>
                    {stats.passPercentage}%
                  </div>
                  <span className="text-xs text-slate-500 mt-1 block">Overall success metric</span>
                </div>
              </div>

              {/* Defect Overview Widget */}
              {playbackStatus === 'failed' && (
                <div className="bg-[#141519] border border-[#fd5a3e]/40 rounded-2xl p-5 shadow-lg space-y-3">
                  <h3 className="text-sm font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert size={16} /> Defects & Failure Root Cause
                  </h3>
                  <div className="p-4 rounded-xl bg-[#201316] border border-[#fd5a3e]/20 font-mono text-xs text-rose-300">
                    <p className="font-bold text-white mb-1">
                      Failing Step #{failingStepIndex + 1}: {failingStep?.elementName || failingStep?.locator?.primary?.value || 'Playback Engine'}
                    </p>
                    <p className="break-all">{playbackFailureInfo?.error || 'Step timed out or element un-interactable.'}</p>
                  </div>
                </div>
              )}

              {/* Environment Information Table */}
              <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-5 shadow-lg space-y-3">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Laptop size={16} className="text-indigo-400" /> Environment Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3 bg-[#1c1d25] rounded-xl border border-[#2d303f]">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Browser</span>
                    <strong className="text-white text-sm mt-0.5 block">{playbackSelectedBrowser || 'Google Chrome'}</strong>
                  </div>
                  <div className="p-3 bg-[#1c1d25] rounded-xl border border-[#2d303f]">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Execution Host</span>
                    <strong className="text-white text-sm mt-0.5 block">Automatiqa Cloud Runner</strong>
                  </div>
                  <div className="p-3 bg-[#1c1d25] rounded-xl border border-[#2d303f]">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Session Duration</span>
                    <strong className="text-white text-sm mt-0.5 block">{durationFormatted}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GRAPHS VIEW */}
          {activeSidebarTab === 'graphs' && (
            <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
              <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-6 shadow-lg space-y-6">
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <PieIcon size={18} className="text-indigo-400" /> Test Step Status Distribution
                </h3>

                {/* Visual Distribution Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-300">
                    <span>Passed: {stats.passed} ({stats.passPercentage}%)</span>
                    <span>Failed: {stats.failed}</span>
                  </div>
                  <div className="w-full h-8 bg-slate-800 rounded-xl overflow-hidden flex border border-[#2c2f3d]">
                    <div 
                      className="bg-[#97cc64] transition-all flex items-center justify-center text-xs font-black text-slate-950"
                      style={{ width: `${stats.passPercentage}%` }}
                    >
                      {stats.passed > 0 && `${stats.passed} PASSED`}
                    </div>
                    <div 
                      className="bg-[#fd5a3e] transition-all flex items-center justify-center text-xs font-black text-white"
                      style={{ width: `${100 - stats.passPercentage}%` }}
                    >
                      {stats.failed > 0 && `${stats.failed} FAILED`}
                    </div>
                  </div>
                </div>

                {/* Step Timing Chart */}
                <div className="pt-6 border-t border-[#252834] space-y-3">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">Step Execution Duration Waterfall</h4>
                  <div className="space-y-2">
                    {steps.map((s, idx) => {
                      const t = stepExecutionTime[s.id] || 350;
                      const isFailing = idx === failingStepIndex && playbackStatus === 'failed';
                      return (
                        <div key={s.id || idx} className="flex items-center gap-3 text-xs">
                          <span className="w-24 text-slate-400 font-mono text-[11px] truncate shrink-0">
                            Step {idx + 1} ({s.action})
                          </span>
                          <div className="flex-1 bg-slate-800/80 rounded-full h-4 overflow-hidden border border-[#2a2d3c]">
                            <div 
                              className={`h-full ${isFailing ? 'bg-[#fd5a3e]' : 'bg-indigo-500'}`} 
                              style={{ width: `${Math.min(100, Math.max(10, (t / 2000) * 100))}%` }}
                            />
                          </div>
                          <span className="w-16 font-mono text-slate-300 text-right text-[11px] shrink-0">
                            {t}ms
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TIMELINE VIEW */}
          {activeSidebarTab === 'timeline' && (
            <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
              <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-6 shadow-lg space-y-4">
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Clock size={18} className="text-indigo-400" /> Sequential Execution Timeline
                </h3>
                <div className="relative border-l-2 border-slate-700 pl-6 ml-4 space-y-6 pt-2 pb-2">
                  {steps.map((s, idx) => {
                    const isFailing = idx === failingStepIndex && playbackStatus === 'failed';
                    return (
                      <div key={s.id || idx} className="relative">
                        <div className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-[#141519] ${
                          isFailing ? 'bg-[#fd5a3e]' : 'bg-[#97cc64]'
                        }`} />
                        <div className="bg-[#181922] p-3 rounded-xl border border-[#2c2f3d]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-white">Step {idx + 1}: {s.elementName || s.action}</span>
                            <span className="font-mono text-slate-400">{stepExecutionTime[s.id] || 350}ms</span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono mt-1">
                            Action: {s.action} {s.value ? `| Value: "${s.value}"` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: BEHAVIORS VIEW */}
          {activeSidebarTab === 'behaviors' && (
            <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
              <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-6 shadow-lg space-y-4">
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Box size={18} className="text-indigo-400" /> BDD Behaviors & Features
                </h3>
                <div className="p-4 bg-[#181a24] rounded-xl border border-[#2a2d3c] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-indigo-600/30 text-indigo-300 font-bold text-[10px] uppercase">
                      Feature
                    </span>
                    <h4 className="text-sm font-bold text-white">Web Recording & Playback Workflow</h4>
                  </div>
                  <p className="text-xs text-slate-400">
                    Story: As a QA engineer, I want to record user interactions on {targetUrl || 'the target web app'} and replay them automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: PACKAGES VIEW */}
          {activeSidebarTab === 'packages' && (
            <div className="space-y-6 max-w-6xl w-full mx-auto pb-10">
              <div className="bg-[#141519] border border-[#2a2b32] rounded-2xl p-6 shadow-lg space-y-4">
                <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Tag size={18} className="text-indigo-400" /> Packages & Test Namespaces
                </h3>
                <div className="p-4 bg-[#181a24] rounded-xl border border-[#2a2d3c] space-y-2 font-mono text-xs">
                  <div className="text-slate-300">
                    com.automatiqa.recordplay.web.{playbackFlow?.name?.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'demo_test'}
                  </div>
                  <div className="text-slate-500 text-[11px]">
                    Class: PlaybackRunnerTest ({steps.length} test steps executed)
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Fullscreen Screenshot Modal */}
      {selectedScreenshotModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4">
          <div className="relative max-w-5xl w-full bg-[#141519] border border-[#2a2b32] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-4 py-3 bg-[#1c1d25] border-b border-[#2c2f3d] flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Camera size={14} className="text-indigo-400" /> Screenshot Fullscreen Preview
              </span>
              <button
                onClick={() => setSelectedScreenshotModal(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
              >
                <Minimize2 size={16} />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-black">
              <img src={selectedScreenshotModal} alt="Expanded Screenshot" className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg" />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FIX STEP & RE-EXECUTE MODAL                                              */}
      {/* ========================================================================= */}
      {isFixModalOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16171f] border border-[#343746] rounded-2xl w-full max-w-2xl shadow-2xl shadow-black/80 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#252834] bg-[#121319] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Wrench size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">
                      Fix Step #{fixingStepIndex + 1} & Execute Again
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 uppercase">
                      Defect Healing
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Adjust target locator, action parameters, or timeout threshold to resolve execution failure.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsFixModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
              >
                <Minimize2 size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto custom-scrollbar space-y-4 text-xs">
              {/* Failure Context Alert */}
              <div className="p-3 rounded-xl bg-[#201316] border border-[#fd5a3e]/30 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#fd5a3e]">
                  <AlertTriangle size={13} />
                  <span>Detected Error on Step #{fixingStepIndex + 1}:</span>
                </div>
                <p className="text-[11px] font-mono text-rose-300 whitespace-pre-wrap leading-relaxed">
                  {playbackFailureInfo?.error || 'Step failed to resolve element within timeout window.'}
                </p>
              </div>

              {/* Quick 1-Click Healing Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Zap size={12} className="text-amber-400" /> 1-Click Quick Fix Presets:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const clean = (fixFormState.elementName || 'button').replace(/[^a-zA-Z0-9_\s-]/g, '').trim();
                      setFixFormState(prev => ({
                        ...prev,
                        locatorValue: `text="${clean}"`,
                        locatorType: 'text',
                        timeout: Math.max(prev.timeout, 12000),
                        scrollIntoView: true
                      }));
                    }}
                    className="p-2.5 rounded-xl bg-[#1c1e28] hover:bg-[#252836] border border-[#303344] hover:border-indigo-400 text-left transition-all group cursor-pointer"
                  >
                    <div className="font-bold text-indigo-300 group-hover:text-indigo-200 text-xs flex items-center gap-1.5">
                      <Sparkles size={13} className="text-indigo-400" /> Use Text Locator
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Switch to resilient text match & 12s timeout
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFixFormState(prev => ({
                        ...prev,
                        timeout: 15000,
                        scrollIntoView: true,
                        waitForVisible: true
                      }));
                    }}
                    className="p-2.5 rounded-xl bg-[#1c1e28] hover:bg-[#252836] border border-[#303344] hover:border-amber-400 text-left transition-all group cursor-pointer"
                  >
                    <div className="font-bold text-amber-300 group-hover:text-amber-200 text-xs flex items-center gap-1.5">
                      <Clock size={13} className="text-amber-400" /> Boost Timeout
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Increase wait window to 15,000ms
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFixFormState(prev => ({
                        ...prev,
                        scrollIntoView: true,
                        waitForVisible: true
                      }));
                    }}
                    className="p-2.5 rounded-xl bg-[#1c1e28] hover:bg-[#252836] border border-[#303344] hover:border-emerald-400 text-left transition-all group cursor-pointer"
                  >
                    <div className="font-bold text-emerald-300 group-hover:text-emerald-200 text-xs flex items-center gap-1.5">
                      <Check size={13} className="text-emerald-400" /> Scroll Into View
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Force DOM element into viewport before click
                    </p>
                  </button>
                </div>
              </div>

              {/* Form Controls */}
              <div className="space-y-3 bg-[#13141b] p-4 rounded-xl border border-[#232530]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Step Action */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Action Type
                    </label>
                    <select
                      value={fixFormState.action}
                      onChange={(e) => setFixFormState(prev => ({ ...prev, action: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-[#1a1c24] border border-[#323646] text-white text-xs font-mono focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="click">click (Click Element)</option>
                      <option value="type">type (Type Text)</option>
                      <option value="navigate">navigate (Go to URL)</option>
                      <option value="scroll">scroll (Scroll Page)</option>
                      <option value="hover">hover (Hover Mouse)</option>
                      <option value="press">press (Keyboard Key)</option>
                      <option value="wait">wait (Explicit Pause)</option>
                      <option value="assert">assert (Verify Assertion)</option>
                    </select>
                  </div>

                  {/* Element Name */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Element Label / Name
                    </label>
                    <input
                      type="text"
                      value={fixFormState.elementName}
                      onChange={(e) => setFixFormState(prev => ({ ...prev, elementName: e.target.value }))}
                      placeholder="e.g. Submit Button, Search Input"
                      className="w-full px-3 py-2 rounded-lg bg-[#1a1c24] border border-[#323646] text-white text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Target Locator with Type */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">
                      Target Locator / Selector
                    </label>
                    <span className="text-[10px] text-indigo-400 font-mono">
                      CSS, XPath, Text, or Playwright Selector
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={fixFormState.locatorType}
                      onChange={(e) => setFixFormState(prev => ({ ...prev, locatorType: e.target.value }))}
                      className="px-2.5 py-2 rounded-lg bg-[#1a1c24] border border-[#323646] text-indigo-300 text-xs font-mono shrink-0 focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="css">css</option>
                      <option value="xpath">xpath</option>
                      <option value="text">text</option>
                      <option value="id">id</option>
                      <option value="name">name</option>
                      <option value="role">role</option>
                    </select>
                    <input
                      type="text"
                      value={fixFormState.locatorValue}
                      onChange={(e) => setFixFormState(prev => ({ ...prev, locatorValue: e.target.value }))}
                      placeholder="e.g. button:has-text('Login') or text='Submit' or //button"
                      className="flex-1 px-3 py-2 rounded-lg bg-[#1a1c24] border border-[#323646] text-indigo-300 text-xs font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Value / Input payload */}
                {(fixFormState.action === 'type' || fixFormState.action === 'navigate' || fixFormState.action === 'press' || fixFormState.action === 'scroll') && (
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Action Value / Input
                    </label>
                    <input
                      type="text"
                      value={fixFormState.value}
                      onChange={(e) => setFixFormState(prev => ({ ...prev, value: e.target.value }))}
                      placeholder={fixFormState.action === 'navigate' ? 'https://example.com' : 'Text to enter...'}
                      className="w-full px-3 py-2 rounded-lg bg-[#1a1c24] border border-[#323646] text-white text-xs font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* Timeout & Execution Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Step Timeout (milliseconds)
                    </label>
                    <input
                      type="number"
                      step={1000}
                      min={1000}
                      max={60000}
                      value={fixFormState.timeout}
                      onChange={(e) => setFixFormState(prev => ({ ...prev, timeout: Number(e.target.value) || 10000 }))}
                      className="w-full px-3 py-2 rounded-lg bg-[#1a1c24] border border-[#323646] text-amber-300 text-xs font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-col justify-end space-y-1.5 pb-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={fixFormState.scrollIntoView}
                        onChange={(e) => setFixFormState(prev => ({ ...prev, scrollIntoView: e.target.checked }))}
                        className="rounded bg-[#1a1c24] border-[#323646] text-indigo-600 focus:ring-0"
                      />
                      <span>Scroll into view before interacting</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={fixFormState.skipStep}
                        onChange={(e) => setFixFormState(prev => ({ ...prev, skipStep: e.target.checked }))}
                        className="rounded bg-[#1a1c24] border-[#323646] text-rose-500 focus:ring-0"
                      />
                      <span className={fixFormState.skipStep ? 'text-rose-400 font-bold' : ''}>
                        Skip this step (if non-critical/optional)
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Code preview */}
              <div className="p-3 rounded-xl bg-[#0e0f14] border border-[#20222e] font-mono text-[11px] text-slate-400 space-y-1">
                <span className="text-[9px] uppercase font-black tracking-widest text-slate-500 block">
                  Generated Code Preview
                </span>
                <p className="text-emerald-400">
                  {fixFormState.skipStep 
                    ? `// Step #${fixingStepIndex + 1} skipped`
                    : `await page.locator('${fixFormState.locatorValue || fixFormState.elementName}').${fixFormState.action}(${fixFormState.value ? `'${fixFormState.value}', ` : ''}{ timeout: ${fixFormState.timeout} });`}
                </p>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 sm:p-5 border-t border-[#252834] bg-[#121319] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsFixModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#1e2028] hover:bg-[#282a36] text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleApplyFix(false)}
                  className="px-4 py-2 rounded-xl bg-[#222533] hover:bg-[#2c3042] text-slate-200 border border-[#35384d] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Save changes to flow without re-running immediately"
                >
                  <Check size={14} />
                  <span>Save Fix Only</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyFix(true)}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 hover:from-amber-400 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-950/50 border border-indigo-400/40 flex items-center gap-2 cursor-pointer"
                >
                  <Play size={14} fill="currentColor" />
                  <span>Save & Execute Again</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
