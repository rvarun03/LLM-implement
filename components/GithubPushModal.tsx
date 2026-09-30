import React, { useState } from 'react';
import { Project, AutomationScript } from '../types';
import { X, Github, GitCommit, Link2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { parseApiResponse } from '../services/apiUtils';

interface GithubPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  script: AutomationScript | null;
}

export const GithubPushModal: React.FC<GithubPushModalProps> = ({
  isOpen,
  onClose,
  project,
  script
}) => {
  const [filePath, setFilePath] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [branchName, setBranchName] = useState('');

  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; commitUrl?: string; error?: string } | null>(null);

  // Initialize form default properties when opened
  React.useEffect(() => {
    if (script && project) {
      const toolFolder = script.tool.toLowerCase();
      const rawTitle = (script.title || 'test_script').toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const ext = script.language.toLowerCase().includes('python') ? 'py' : 
                  script.language.toLowerCase().includes('java') ? 'java' : 'ts';
      
      setFilePath(`${toolFolder}/${rawTitle}.spec.${ext}`);
      setCommitMessage(`feat(qa-automation): add generated ${script.tool} script for ${script.title || 'actions'}`);
      setBranchName(project.githubConfig?.branchName || 'main');
      setResult(null);
    }
  }, [script, project]);

  if (!isOpen || !script) return null;

  const config = project.githubConfig;
  const isConfigured = config && config.repositoryOwner && config.repositoryName && config.personalAccessToken;

  const handlePush = async () => {
    if (!isConfigured) return;
    setPushing(true);
    setResult(null);

    try {
      const response = await fetch('/api/integration/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          githubConfig: project.githubConfig,
          commitMessage,
          branchName,
          files: [
            {
              path: filePath,
              content: script.content
            }
          ]
        })
      });

      const parsed = await parseApiResponse(response);
      if (parsed.ok && parsed.data?.success) {
        setResult({
          success: true,
          commitUrl: parsed.data.commitUrl
        });
      } else {
        setResult({
          success: false,
          error: parsed.error || 'GitHub push failed.'
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        error: err.message || 'Failed to submit push request due to a network connection.'
      });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[7000] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-950 p-6 text-white flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <Github size={20} className="text-indigo-400" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-100">Commit to GitHub Repository</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Push code changes securely</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 hover:bg-white/5 rounded-full transition-all cursor-pointer"><X size={18} /></button>
        </div>

        {/* Outer view body */}
        <div className="p-8 space-y-5 bg-white">
          {!isConfigured ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100"><AlertCircle size={24} /></div>
              <h4 className="text-xs font-black uppercase tracking-wider text-rose-800">GitHub Integration Missing</h4>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">This project is not linked to any GitHub Repo yet. Please head to Settings &gt; GitHub Integration relative page to configure.</p>
            </div>
          ) : result && result.success ? (
            <div className="p-6 text-center space-y-4 animate-in zoom-in-95 duration-2 *">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-100"><CheckCircle2 size={30} /></div>
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-800">Success! Commit Broadcasted</h4>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">Automation script successfully pushed to {config.repositoryOwner}/{config.repositoryName} branches '{branchName}'.</p>
              
              {result.commitUrl && (
                <a 
                  href={result.commitUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-md transition-all pt-3.5"
                >
                  <Link2 size={14} /> Commit Changes URL
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {result && !result.success && (
                <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl flex gap-2">
                  <AlertCircle size={18} className="text-rose-500 mt-0.5 shrink-0" />
                  <div>
                    <h5 className="text-[10px] font-black uppercase tracking-wider text-rose-800">Failed to Push Code</h5>
                    <p className="text-[11px] font-semibold leading-relaxed mt-0.5">{result.error}</p>
                  </div>
                </div>
              )}

              {/* Status bar */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Repository</p>
                  <p className="text-xs font-bold text-slate-800 truncate mt-0.5" title={`${config?.repositoryOwner}/${config?.repositoryName}`}>{config?.repositoryOwner}/{config?.repositoryName}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Target Path</p>
                  <p className="text-xs font-bold text-slate-800 truncate mt-0.5">/ {filePath}</p>
                </div>
              </div>

              {/* Destination directory input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Repository Destination File Path</label>
                <input
                  type="text"
                  value={filePath || ''}
                  onChange={(e) => setFilePath(e.target.value)}
                  placeholder="tests/login.spec.ts"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Branch name input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Destination Branch</label>
                <input
                  type="text"
                  value={branchName || ''}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="main"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>

              {/* Commit Message input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Commit Message</label>
                <textarea
                  value={commitMessage || ''}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  rows={2}
                  placeholder="Commit notes..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white resize-none"
                />
              </div>
            </div>
          )}

          {/* Buttons Footer */}
          <div className="flex gap-3 pt-4 border-t border-slate-100 justify-end">
            <button 
              onClick={onClose}
              className="px-5 py-3 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer"
            >
              {result?.success ? 'Dismiss' : 'Cancel'}
            </button>
            {isConfigured && (!result || !result.success) && (
              <button 
                onClick={handlePush}
                disabled={pushing || !filePath || !commitMessage || !branchName}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55"
              >
                {pushing ? <Loader2 size={14} className="animate-spin" /> : <GitCommit size={14} />}
                {pushing ? 'Committing...' : 'Push Code'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
