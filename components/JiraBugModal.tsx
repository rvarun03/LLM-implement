import React, { useState, useEffect, useMemo } from 'react';
import { Project, AutomationScript, TestCase } from '../types';
import { 
  X, Sparkles, AlertCircle, AlertTriangle, Link2, CheckCircle2, 
  Loader2, Paperclip, MessageSquare, ExternalLink, Image as ImageIcon, 
  FileVideo, Copy, Check, RefreshCw 
} from 'lucide-react';
import { parseApiResponse } from '../services/apiUtils';
import { toast } from 'sonner';

interface JiraBugModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  script?: AutomationScript | null;
  testCase?: TestCase | null;
  customTitle?: string;
  customDescription?: string;
  customAttachments?: string[];
  customLinks?: string[];
  customComments?: string;
  user?: { name: string, email: string; role?: any } | null;
  onBugCreated?: (bugData: { key: string; bugUrl: string; title: string }) => void;
}

export const JiraBugModal: React.FC<JiraBugModalProps> = ({
  isOpen,
  onClose,
  project,
  script = null,
  testCase = null,
  customTitle = '',
  customDescription = '',
  customAttachments = [],
  customLinks = [],
  customComments = '',
  user = null,
  onBugCreated
}) => {
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [severity, setSeverity] = useState('Major');

  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; key?: string; bugUrl?: string; error?: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Dynamically resolve all attachments ensuring multiple evidences are never truncated to 1
  const tcAttachments = useMemo(() => {
    if (customAttachments && customAttachments.length > 0) {
      return customAttachments.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    }
    if (script) {
      const list: string[] = [
        ...(Array.isArray((script as any).attachments) ? (script as any).attachments : []),
        ...(Array.isArray(script.contextImages) ? script.contextImages : []),
        ...(script.evidence ? [script.evidence] : [])
      ];
      if (project?.id && script.id) {
        try {
          const raw = localStorage.getItem(`automatiqa_script_evidence_${project.id}_${script.id}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.attachments)) {
              list.push(...parsed.attachments);
            }
          }
        } catch (e) {}
      }
      return list.filter((v, i, a): v is string => typeof v === 'string' && v.trim().length > 0 && a.indexOf(v) === i);
    }
    if (testCase) {
      const list: string[] = [
        ...(Array.isArray(testCase.attachments) ? testCase.attachments : []),
        ...(Array.isArray((testCase as any).contextImages) ? (testCase as any).contextImages : []),
        ...(testCase.evidence ? [testCase.evidence] : [])
      ];
      if (project?.id && testCase.id) {
        try {
          const rawId = testCase.id.startsWith('tc_') ? testCase.id.slice(3) : testCase.id;
          const raw = localStorage.getItem(`automatiqa_case_evidence_${project.id}_${testCase.id}`) ||
                      localStorage.getItem(`automatiqa_case_evidence_${project.id}_${rawId}`) ||
                      (testCase.testCaseId ? localStorage.getItem(`automatiqa_case_evidence_${project.id}_${testCase.testCaseId}`) : null);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.attachments)) {
              list.push(...parsed.attachments);
            }
          }
        } catch (e) {}
      }
      return list.filter((v, i, a): v is string => typeof v === 'string' && v.trim().length > 0 && a.indexOf(v) === i);
    }
    return [];
  }, [customAttachments, script, testCase, project?.id]);

  // Dynamically resolve all reference links
  const tcLinks = useMemo(() => {
    if (customLinks && customLinks.length > 0) {
      return customLinks.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    }
    if (script) {
      const list: string[] = [
        ...(Array.isArray((script as any).links) ? (script as any).links : []),
        ...(script.evidenceUrl ? [script.evidenceUrl] : [])
      ];
      if (project?.id && script.id) {
        try {
          const raw = localStorage.getItem(`automatiqa_script_evidence_${project.id}_${script.id}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.links)) {
              list.push(...parsed.links);
            }
          }
        } catch (e) {}
      }
      return list.filter((v, i, a): v is string => typeof v === 'string' && v.trim().length > 0 && a.indexOf(v) === i);
    }
    if (testCase) {
      const list: string[] = [
        ...(Array.isArray(testCase.links) ? testCase.links : [])
      ];
      if (project?.id && testCase.id) {
        try {
          const rawId = testCase.id.startsWith('tc_') ? testCase.id.slice(3) : testCase.id;
          const raw = localStorage.getItem(`automatiqa_case_evidence_${project.id}_${testCase.id}`) ||
                      localStorage.getItem(`automatiqa_case_evidence_${project.id}_${rawId}`) ||
                      (testCase.testCaseId ? localStorage.getItem(`automatiqa_case_evidence_${project.id}_${testCase.testCaseId}`) : null);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.links)) {
              list.push(...parsed.links);
            }
          }
        } catch (e) {}
      }
      return list.filter((v, i, a): v is string => typeof v === 'string' && v.trim().length > 0 && a.indexOf(v) === i);
    }
    return [];
  }, [customLinks, script, testCase, project?.id]);

  // Dynamically resolve execution comments/notes
  const tcComments = useMemo(() => {
    if (customComments) return customComments;
    if (script) {
      let c = script.lastExecutionNotes || (script as any).comments || '';
      if (!c && project?.id && script.id) {
        try {
          const raw = localStorage.getItem(`automatiqa_script_evidence_${project.id}_${script.id}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.comments) c = parsed.comments;
          }
        } catch (e) {}
      }
      return c;
    }
    if (testCase) {
      let c = testCase.comments || '';
      if (!c && project?.id && testCase.id) {
        try {
          const rawId = testCase.id.startsWith('tc_') ? testCase.id.slice(3) : testCase.id;
          const raw = localStorage.getItem(`automatiqa_case_evidence_${project.id}_${testCase.id}`) ||
                      localStorage.getItem(`automatiqa_case_evidence_${project.id}_${rawId}`) ||
                      (testCase.testCaseId ? localStorage.getItem(`automatiqa_case_evidence_${project.id}_${testCase.testCaseId}`) : null);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.comments) c = parsed.comments;
          }
        } catch (e) {}
      }
      return c;
    }
    return '';
  }, [customComments, script, testCase, project?.id]);

  useEffect(() => {
    if (customTitle) {
      setIssueTitle(customTitle);
      setIssueDescription(customDescription || '');
      setPriority('High');
      setResult(null);
    } else if (script && project) {
      setIssueTitle(`[FAIL] ${script.title || 'Automation Run'} - Test Run Failure`);
      let scriptDesc = 
        `AutomatiQA Failure Report\n` +
        `----------------------------------------\n` +
        `Script: ${script.title || 'Artifact'}\n` +
        `Framework: ${script.tool} (${script.language})\n` +
        `Created on: ${new Date(script.createdAt).toLocaleDateString('en-GB')}\n\n` +
        `Description: ${script.description || 'Automation Script Execution Failure'}\n\n`;

      if (tcComments) {
        scriptDesc += `Execution Notes & Comments:\n${tcComments}\n\n`;
      }
      if (tcLinks.length > 0) {
        scriptDesc += `Reference Links:\n` + tcLinks.map((l, i) => `${i + 1}. ${l}`).join('\n') + `\n\n`;
      }
      if (tcAttachments.length > 0) {
        scriptDesc += `Attached Evidences: ${tcAttachments.length} file(s) attached to this bug report.\n\n`;
      }
      scriptDesc += `Recommended Fix: Check selector availability and verify site server and database synchronization responses.`;

      setIssueDescription(scriptDesc);
      setPriority(script.lastExecutionStatus === 'FAILURE' || script.lastExecutionStatus === 'FAIL' ? 'High' : 'Medium');
      setResult(null);
    } else if (testCase && project) {
      const stepsText = testCase.steps && testCase.steps.length > 0
        ? testCase.steps.map((step, idx) => `${idx + 1}. ${step}`).join('\n')
        : '1. Executed specified manual steps.';

      const attachmentsCount = tcAttachments.length;

      let desc = `AutomatiQA Functional Test Case Failure Report\n` +
        `----------------------------------------\n` +
        `Test Case ID: ${testCase.testCaseId || 'N/A'}\n` +
        `Title: ${testCase.title}\n` +
        `Type: ${testCase.testType || 'Functional'}\n` +
        `Priority: ${testCase.priority || 'Medium'}\n\n` +
        `Steps to Reproduce:\n` +
        `${stepsText}\n\n` +
        `Expected Result: ${testCase.expectedResult}\n`;

      if (testCase.actualResult) {
        desc += `Actual Result: ${testCase.actualResult}\n`;
      }
      if (tcComments) {
        desc += `\nExecution Comments:\n${tcComments}\n`;
      }
      if (tcLinks.length > 0) {
        desc += `\nReference Links:\n` + tcLinks.map((l, i) => `${i + 1}. ${l}`).join('\n') + `\n`;
      }
      if (attachmentsCount > 0) {
        desc += `\nAttached Evidences: ${attachmentsCount} file(s) attached to this bug report.\n`;
      }
      desc += `\nReported via Functional Test Execution page.`;

      setIssueTitle(`[FAIL] ${testCase.testCaseId || 'TC'} - ${testCase.title}`);
      setIssueDescription(desc);
      setPriority(testCase.priority === 'High' ? 'High' : testCase.priority === 'Low' ? 'Low' : 'Medium');
      setResult(null);
    }
  }, [script, testCase, project, customTitle, customDescription, tcAttachments, tcLinks, tcComments]);

  if (!isOpen || (!script && !testCase && !customTitle)) return null;

  const jiraConfig = project.jiraConfig;
  const isConfigured = jiraConfig && jiraConfig.jiraUrl && jiraConfig.email && jiraConfig.apiToken && jiraConfig.projectKey;

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    toast.success(`Copied "${key}" to clipboard!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePostBug = async () => {
    if (!isConfigured) {
      toast.error('Jira Integration is not configured for this project.');
      return;
    }
    setPosting(true);
    setResult(null);

    try {
      const response = await fetch('/api/integration/jira/post-bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          projectName: project.name,
          jiraConfig: project.jiraConfig,
          slackConfig: project.slackConfig,
          issueTitle,
          issueDescription,
          priority,
          severity,
          reporter: user ? (user.name || user.email) : 'QA Engineer',
          attachments: tcAttachments,
          links: tcLinks,
          comments: tcComments
        })
      });

      const parsed = await parseApiResponse(response);
      if (parsed.ok && parsed.data?.success) {
        const bugKey = parsed.data.key;
        const bugUrl = parsed.data.bugUrl;
        setResult({
          success: true,
          key: bugKey,
          bugUrl: bugUrl
        });
        toast.success(`Jira Bug ${bugKey} created successfully!`);
        if (onBugCreated) {
          onBugCreated({
            key: bugKey,
            bugUrl: bugUrl,
            title: issueTitle
          });
        }
      } else {
        const errorMsg = parsed.error || parsed.data?.error || 'Jira ticket creation failed. Please check your Jira credentials and permissions.';
        setResult({
          success: false,
          error: errorMsg
        });
        toast.error(`Failed to create bug in Jira: ${errorMsg}`);
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Error occurred while contacting backend server.';
      setResult({
        success: false,
        error: errorMsg
      });
      toast.error(`Jira bug creation unsuccessful: ${errorMsg}`);
    } finally {
      setPosting(false);
    }
  };

  const isVideo = (data?: string | null) => Boolean(data && typeof data === 'string' && (data.startsWith('data:video') || data.toLowerCase().endsWith('.mp4') || data.toLowerCase().endsWith('.webm')));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[7000] p-4 animate-in fade-in duration-200">
      
      {/* Zoomed Evidence Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-6" onClick={() => setPreviewImage(null)}>
          <button onClick={() => setPreviewImage(null)} className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all">
            <X size={28} />
          </button>
          <img src={previewImage || undefined} className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl" alt="Evidence Large Preview" />
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        
        {/* Header decoration banner */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white flex items-center justify-between border-b/10 shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-yellow-300 animate-pulse" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Create Jira Bug Ticket</h3>
              <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest mt-0.5">Publish incident to engineer dashboard</p>
            </div>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white p-1 hover:bg-white/10 rounded-full transition-all cursor-pointer"><X size={18} /></button>
        </div>

        {/* Modal Content */}
        <div className="p-8 space-y-5 bg-white overflow-y-auto custom-scrollbar flex-1">
          {!isConfigured ? (
            /* Missing Jira Integration Config Pop-up Box */
            <div className="p-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-100 shadow-sm">
                <AlertCircle size={28} />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-rose-800">Jira Integration Missing</h4>
                <p className="text-xs text-slate-500 font-semibold leading-relaxed mt-1">
                  This project is not linked to Atlassian Jira. Please head to <strong>Project Settings &gt; Jira Integration</strong> to connect credentials first.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : result && result.success ? (
            /* ========================================================================= */
            /* SUCCESSFUL POP-UP DIALOG (prominently confirms Jira Bug Creation)          */
            /* ========================================================================= */
            <div className="p-4 sm:p-6 text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto border border-emerald-200 shadow-lg shadow-emerald-100/50">
                <CheckCircle2 size={36} />
              </div>
              
              <div>
                <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest rounded-full mb-2">
                  SUCCESSFUL
                </span>
                <h4 className="text-base font-black uppercase tracking-wide text-slate-900">
                  Bug Created Successfully in Jira!
                </h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1 max-w-md mx-auto">
                  Your incident report has been posted to Jira and assigned an official issue key. All execution steps and attached evidence files were packaged successfully.
                </p>
              </div>

              {/* Ticket Details Summary Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Issue Key
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-mono font-black text-xs tracking-wider shadow-xs">
                      {result.key}
                    </span>
                    <button
                      type="button"
                      onClick={() => result.key && handleCopyKey(result.key)}
                      className="p-1.5 hover:bg-white text-slate-500 hover:text-slate-800 rounded-lg border border-transparent hover:border-slate-200 transition-all cursor-pointer"
                      title="Copy issue key"
                    >
                      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">
                    Summary Title
                  </span>
                  <p className="text-xs font-bold text-slate-800 leading-snug">
                    {issueTitle}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-medium">Jira Project: </span>
                    <span className="font-bold text-slate-700">{jiraConfig.projectKey}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium">Evidences: </span>
                    <span className="font-bold text-slate-700">{tcAttachments.length} file(s) attached</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                {result.bugUrl && (
                  <a 
                    href={result.bugUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all"
                  >
                    <ExternalLink size={14} /> Open Bug in Jira
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Done / Close
                </button>
              </div>
            </div>
          ) : result && !result.success ? (
            /* ========================================================================= */
            /* UNSUCCESSFUL POP-UP DIALOG (prominently displays failure explanation)      */
            /* ========================================================================= */
            <div className="p-4 sm:p-6 text-center space-y-5 animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto border border-rose-200 shadow-lg shadow-rose-100/50">
                <AlertTriangle size={36} />
              </div>

              <div>
                <span className="inline-block px-3 py-1 bg-rose-100 text-rose-800 text-[10px] font-black uppercase tracking-widest rounded-full mb-2">
                  UNSUCCESSFUL
                </span>
                <h4 className="text-base font-black uppercase tracking-wide text-rose-900">
                  Jira Bug Creation Failed
                </h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1 max-w-md mx-auto">
                  The Jira API rejected this request or could not complete ticket creation. Review the error details below to resolve.
                </p>
              </div>

              {/* Error Details Box */}
              <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 text-left space-y-2">
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertCircle size={15} className="shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    Error Message Reported
                  </span>
                </div>
                <p className="text-xs font-semibold text-rose-900 leading-relaxed break-words font-mono bg-white/70 p-3 rounded-xl border border-rose-100">
                  {result.error || 'Failed to create Jira issue.'}
                </p>
              </div>

              {/* Troubleshooting suggestions */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left space-y-2 text-xs text-slate-600">
                <p className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                  Recommended Checks:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 font-medium">
                  <li>Verify that project key <strong className="text-slate-800">{jiraConfig.projectKey}</strong> exists in Jira and allows issue creation.</li>
                  <li>Check that your Atlassian API Token and Email have "Create Issue" permissions.</li>
                  <li>Ensure required custom fields in your Jira project are satisfied or optional.</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResult(null)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all cursor-pointer"
                >
                  <RefreshCw size={14} /> Try Again / Edit Details
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Standard Creation Form */
            <div className="space-y-4">
              {/* Status parameters */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Jira Workspace</p>
                  <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{jiraConfig.jiraUrl.replace(/^https?:\/\//i, '')}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Project Key</p>
                  <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{jiraConfig.projectKey}</p>
                </div>
              </div>

              {/* Ticket title input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Bug Summary Title</label>
                <input
                  type="text"
                  value={issueTitle || ''}
                  onChange={(e) => setIssueTitle(e.target.value)}
                  placeholder="e.g. Fail to login under staging"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Priority Select */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Bug Priority</label>
                  <select
                    value={priority || ''}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Bug Severity</label>
                  <select
                    value={severity || ''}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                  >
                    <option value="Critical">Critical</option>
                    <option value="Major">Major</option>
                    <option value="Minor">Minor</option>
                    <option value="Trivial">Trivial</option>
                  </select>
                </div>
              </div>

              {/* Description input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Reproduction Steps & Description</label>
                <textarea
                  value={issueDescription || ''}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  rows={4}
                  placeholder="Steps..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white resize-none font-mono"
                />
              </div>

              {/* Evidences & Proof Preview Section */}
              {(tcAttachments.length > 0 || tcLinks.length > 0 || tcComments) && (
                <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 text-indigo-700">
                    <Paperclip size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Attached Execution Evidences ({tcAttachments.length} files, {tcLinks.length} links)</span>
                  </div>

                  {tcComments && (
                    <div className="p-3 bg-white border border-indigo-100 rounded-xl text-xs text-slate-700 font-medium">
                      <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                        <MessageSquare size={12} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Execution Comments</span>
                      </div>
                      <p className="whitespace-pre-wrap">{tcComments}</p>
                    </div>
                  )}

                  {tcLinks.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Reference Links</p>
                      <div className="flex flex-wrap gap-2">
                        {tcLinks.map((link, lidx) => (
                          <a
                            key={lidx}
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-100 rounded-lg text-[11px] font-bold text-indigo-600 hover:underline"
                          >
                            <Link2 size={12} />
                            <span className="max-w-[200px] truncate">{link}</span>
                            <ExternalLink size={10} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {tcAttachments.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Evidence Screenshots / Proofs ({tcAttachments.length} Total)</p>
                      <div className="grid grid-cols-3 gap-2">
                        {tcAttachments.map((att, aidx) => (
                          <div
                            key={aidx}
                            onClick={() => !isVideo(att) && setPreviewImage(att)}
                            className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden border border-indigo-100 cursor-pointer group shadow-sm"
                          >
                            {isVideo(att) ? (
                              <div className="w-full h-full flex items-center justify-center text-white/50 bg-slate-900">
                                <FileVideo size={20} />
                              </div>
                            ) : (
                              <img
                                src={att}
                                alt={`Evidence ${aidx + 1}`}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              />
                            )}
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-black uppercase">
                              Zoom
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer buttons (Only displayed when in creation form) */}
          {(!result || (!result.success && result.error === undefined)) && isConfigured && (
            <div className="flex gap-3 pt-4 border-t border-slate-100 justify-end shrink-0">
              <button 
                onClick={onClose}
                className="px-5 py-3 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button 
                onClick={handlePostBug}
                disabled={posting || !issueTitle || !issueDescription}
                className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-rose-100 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {posting ? <Loader2 size={14} className="animate-spin" /> : null}
                {posting ? 'Logging Bug...' : 'Create Jira Bug'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

