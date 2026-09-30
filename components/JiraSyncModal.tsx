import React, { useState, useEffect } from 'react';
import { Project, AutomationScript } from '../types';
import { X, Sparkles, Check, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { parseApiResponse } from '../services/apiUtils';

interface JiraSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  script: AutomationScript | null;
}

export const JiraSyncModal: React.FC<JiraSyncModalProps> = ({
  isOpen,
  onClose,
  project,
  script
}) => {
  const [issueKey, setIssueKey] = useState('');
  const [commentText, setCommentText] = useState('');

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (script && project) {
      setIssueKey(script.scenarioId || '');
      setCommentText(
        `✅ AutomatiQA Test Sync Report\n` +
        `----------------------------------------\n` +
        `Automation execution completed successfully!\n` +
        `• Script Title: ${script.title || 'Standard Script'}\n` +
        `• Automation Tool: ${script.tool}\n` +
        `• Client Language: ${script.language}\n` +
        `• Status Flag: PASSED\n` +
        `• Synchronization Status: Active (Signed off of staging)`
      );
      setResult(null);
    }
  }, [script, project]);

  if (!isOpen || !script) return null;

  const jiraConfig = project.jiraConfig;
  const isConfigured = jiraConfig && jiraConfig.jiraUrl && jiraConfig.email && jiraConfig.apiToken && jiraConfig.projectKey;

  const handleSyncComment = async () => {
    if (!isConfigured) return;
    setSaving(true);
    setResult(null);

    try {
      const response = await fetch('/api/integration/jira/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          jiraConfig: project.jiraConfig,
          issueKey,
          commentText
        })
      });

      const parsed = await parseApiResponse(response);
      if (parsed.ok && parsed.data?.success) {
        setResult({
          success: true
        });
      } else {
        setResult({
          success: false,
          error: parsed.error || 'Jira comment synchronization failed.'
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        error: err.message || 'Error communicating with server proxy.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[7000] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header decoration banner */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-yellow-300" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Sync Run with Jira</h3>
              <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest mt-0.5">Post comments and status updates directly</p>
            </div>
          </div>
          <button onClick={onClose} className="text-indigo-200 hover:text-white p-1 hover:bg-white/10 rounded-full transition-all cursor-pointer"><X size={18} /></button>
        </div>

        {/* Modal Form Content */}
        <div className="p-8 space-y-5 bg-white">
          {!isConfigured ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100"><AlertCircle size={24} /></div>
              <h4 className="text-xs font-black uppercase tracking-wider text-rose-800">Jira Integration Missing</h4>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">This project is not linked to Atlassian Jira. Head to Settings &gt; Jira Integration to connect credentials first.</p>
            </div>
          ) : result && result.success ? (
            <div className="p-6 text-center space-y-4 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-100"><CheckCircle2 size={30} /></div>
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800">Linked to Jira Successfully</h4>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">The test runtime status comment was successfully posted inside issue ticket <strong>{issueKey}</strong>.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {result && !result.success && (
                <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl flex gap-2">
                  <AlertCircle size={18} className="text-rose-500 mt-0.5 shrink-0" />
                  <div>
                    <h5 className="text-[10px] font-black uppercase tracking-wider text-rose-800">Sync Attempt Failed</h5>
                    <p className="text-[11px] font-semibold leading-relaxed mt-0.5">{result.error}</p>
                  </div>
                </div>
              )}

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

              {/* Ticket selector input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Jira Story / Bug Issue Key</label>
                <input
                  type="text"
                  value={issueKey || ''}
                  onChange={(e) => setIssueKey(e.target.value)}
                  placeholder="e.g. CORE-124"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Comment text input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Comment / Run Summary to Log</label>
                <textarea
                  value={commentText || ''}
                  onChange={(e) => setCommentText(e.target.value)}
                  rows={4}
                  placeholder="Summary details..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white resize-none font-mono"
                />
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex gap-3 pt-4 border-t border-slate-100 justify-end">
            <button 
              onClick={onClose}
              className="px-5 py-3 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer"
            >
              {result?.success ? 'Dismiss' : 'Cancel'}
            </button>
            {isConfigured && (!result || !result.success) && (
              <button 
                onClick={handleSyncComment}
                disabled={saving || !issueKey || !commentText}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Posting Comment...' : 'Post Comment to Jira'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
