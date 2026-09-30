import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import { Settings, GitBranch, Github, Code, CheckCircle2, AlertCircle, Loader2, Info, X } from 'lucide-react';
import { parseApiResponse } from '../services/apiUtils';

interface GithubSettingsProps {
  activeProject: Project | null;
  onUpdateProject: (updated: Project, options?: { immediate?: boolean }) => void | Promise<void>;
}

export const GithubSettings: React.FC<GithubSettingsProps> = ({ activeProject, onUpdateProject }) => {
  const [repositoryOwner, setRepositoryOwner] = useState('');
  const [repositoryName, setRepositoryName] = useState('');
  const [personalAccessToken, setPersonalAccessToken] = useState('');
  const [branchName, setBranchName] = useState('main');

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    if (activeProject && activeProject.githubConfig) {
      setRepositoryOwner(activeProject.githubConfig.repositoryOwner || '');
      setRepositoryName(activeProject.githubConfig.repositoryName || '');
      setPersonalAccessToken(activeProject.githubConfig.personalAccessToken ? '********' : '');
      setBranchName(activeProject.githubConfig.branchName || 'main');
    } else {
      setRepositoryOwner('');
      setRepositoryName('');
      setPersonalAccessToken('');
      setBranchName('main');
    }
    setTestResult(null);
    setNotification(null);
    setShowSuccessModal(false);
  }, [activeProject]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] bg-white rounded-3xl border border-slate-100 shadow-sm p-8 text-center">
        <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mb-4">
          <Settings size={32} />
        </div>
        <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">No Active Project Selected</h3>
        <p className="text-sm text-slate-500 max-w-sm">Please select or create an active project to configure GitHub Integration settings.</p>
      </div>
    );
  }

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setNotification(null);

    try {
      const response = await fetch('/api/integration/github/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryOwner,
          repositoryName,
          branchName,
          personalAccessToken: personalAccessToken === '********' ? activeProject.githubConfig?.personalAccessToken || '' : personalAccessToken,
          projectId: activeProject.id
        })
      });

      const parsed = await parseApiResponse(response);
      if (parsed.ok && parsed.data?.success) {
        setTestResult({
          success: true,
          message: 'Connection successful! Verified Repository and Branch.'
        });
        setShowSuccessModal(true);
      } else {
        setTestResult({
          success: false,
          message: parsed.error || 'Connection failed. Check repo owner, repo name, and PAT permissions.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Error reaching backend server.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setNotification(null);
    setTestResult(null);

    try {
      const response = await fetch('/api/integration/github/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          repositoryOwner,
          repositoryName,
          personalAccessToken,
          branchName
        })
      });

      const parsed = await parseApiResponse(response);
      if (parsed.ok && parsed.data?.success) {
        const data = parsed.data;
        const finalEncryptedToken = data.encryptedToken === 'KEEP_EXISTING'
          ? activeProject.githubConfig?.personalAccessToken || ''
          : data.encryptedToken;

        const updatedProject: Project = {
          ...activeProject,
          githubConfig: {
            repositoryOwner,
            repositoryName,
            personalAccessToken: finalEncryptedToken,
            branchName
          }
        };

        // Persist and update project state immediately
        await onUpdateProject(updatedProject, { immediate: true });

        setNotification({
          type: 'success',
          message: 'Saved configuration successfully.'
        });
      } else {
        setNotification({
          type: 'error',
          message: parsed.error || 'Failed to save configuration.'
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'An error occurred.'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        {/* Header decoration banner */}
        <div className="bg-gradient-to-r from-slate-905 to-slate-950 p-8 text-white relative bg-slate-900 border-b border-white/5">
          <div className="absolute right-6 top-6 opacity-10"><Github size={80} /></div>
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10">
              <Github size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight">GitHub Code Repos</h2>
              <p className="text-slate-400 text-xs font-semibold mt-1">Push generated automation scripts and perform PR coverage checks</p>
            </div>
          </div>
        </div>

        {/* Form Inputs */}
        <div className="p-8 space-y-6">
          {notification && (
            <div className={`p-5 rounded-2xl flex items-center justify-between gap-3 border shadow-md transition-all animate-in fade-in slide-in-from-top-2 ${notification.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-rose-50 border-rose-300 text-rose-900'}`}>
              <div className="flex items-center gap-3">
                {notification.type === 'success' ? (
                  <>
                    <CheckCircle2 className="text-emerald-600 shrink-0" size={22} />
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-emerald-600 text-white font-black text-[10px] uppercase tracking-wider rounded-md">Saved</span>
                      <p className="text-xs font-extrabold leading-relaxed">{notification.message}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <AlertCircle className="text-rose-600 shrink-0" size={22} />
                    <p className="text-xs font-bold leading-relaxed">{notification.message}</p>
                  </>
                )}
              </div>
              <button 
                onClick={() => setNotification(null)}
                className="p-1 hover:bg-black/5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                title="Dismiss"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Instruction Info Banner */}
          <div className="p-4 bg-slate-100 border border-slate-200 rounded-2xl flex items-center gap-3 text-slate-800">
            <Info className="text-indigo-600 shrink-0" size={20} />
            <p className="text-xs font-bold leading-relaxed">
              After giving inputs, please verify connection first and then Save configuration.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Repository Owner</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Github size={16} />
                </div>
                <input
                  type="text"
                  placeholder="e.g. facebook, your-org"
                  value={repositoryOwner || ''}
                  onChange={(e) => setRepositoryOwner(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Repository Name</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Code size={16} />
                </div>
                <input
                  type="text"
                  placeholder="e.g. react, test-automation-suite"
                  value={repositoryName || ''}
                  onChange={(e) => setRepositoryName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Personal Access Token (PAT)</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Settings size={16} />
                </div>
                <input
                  type="password"
                  placeholder="github_pat_..."
                  value={personalAccessToken || ''}
                  onChange={(e) => setPersonalAccessToken(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
                />
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Requires 'repo' scope to list and write files/branches.</p>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Target Working Branch</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <GitBranch size={16} />
                </div>
                <input
                  type="text"
                  placeholder="e.g. main, dev, qa-stable"
                  value={branchName || ''}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-indigo-500 focus:bg-white transition-all text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          {/* Test connection report */}
          {testResult && (
            <div className={`p-5 rounded-2xl border ${testResult.success ? 'bg-emerald-50/50 border-emerald-100 text-emerald-800' : 'bg-rose-50/50 border-rose-100 text-rose-800'} animate-in zoom-in-95 duration-200`}>
              <div className="flex gap-3">
                {testResult.success ? <CheckCircle2 className="text-emerald-500 shrink-0" size={18} /> : <AlertCircle className="text-rose-500 shrink-0" size={18} />}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider mb-1">{testResult.success ? 'Success' : 'GitHub Authorization Denied'}</h4>
                  <p className="text-[11px] font-semibold leading-relaxed">{testResult.message}</p>
                </div>
              </div>
            </div>
          )}

          {/* Save Reminder Notice */}
          <p className="text-xs font-semibold text-slate-500">
            Please click Save Configuration to save your integration settings
          </p>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={handleTestConnection}
              disabled={testing || saving || !repositoryOwner || !repositoryName || !personalAccessToken || !branchName}
              className="px-6 py-3.5 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {testing ? <Loader2 className="animate-spin" size={14} /> : null}
              {testing ? 'Testing...' : 'Verify Repository'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || testing || !repositoryOwner || !repositoryName || !personalAccessToken || !branchName}
              className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : null}
              {saving ? 'Preserving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      {/* Verification Success Popup Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl max-w-md w-full p-6 text-center space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={36} />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                Repository Verified Successfully!
              </h3>
              <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                {testResult?.message || 'Connection successful! Verified Repository and Branch.'}
              </p>
            </div>

            <div className="p-4 bg-indigo-50/80 border border-indigo-100 rounded-2xl text-left flex items-start gap-3">
              <CheckCircle2 className="text-indigo-600 shrink-0 mt-0.5" size={18} />
              <p className="text-xs font-bold text-indigo-950 leading-relaxed">
                Please click on <span className="underline font-extrabold">Save Configuration</span> to save your integration settings.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSuccessModal(false)}
                className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  setShowSuccessModal(false);
                  await handleSave();
                }}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-indigo-100 transition-all cursor-pointer"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
