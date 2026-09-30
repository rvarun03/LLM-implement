import React, { useState, useEffect } from 'react';
import { Project, UserStory } from '../types';
import { X, Sparkles, AlertCircle, Link2, CheckCircle2, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { parseApiResponse, formatAcceptanceCriteria } from '../services/apiUtils';
import { deductExportCredits } from '../services/creditService';

interface JiraUserStoryExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  stories: UserStory[];
  user?: { name: string, email: string; role?: any } | null;
}

interface ExportResult {
  storyId: string;
  summary: string;
  success: boolean;
  key?: string;
  storyUrl?: string;
  error?: string;
}

export const JiraUserStoryExportModal: React.FC<JiraUserStoryExportModalProps> = ({
  isOpen,
  onClose,
  project,
  stories = [],
  user = null
}) => {
  const [priority, setPriority] = useState('Medium');
  const [issueType, setIssueType] = useState('Story');
  const [exporting, setExporting] = useState(false);
  const [exportResults, setExportResults] = useState<ExportResult[]>([]);
  const [currentExportIndex, setCurrentExportIndex] = useState(-1);

  useEffect(() => {
    if (isOpen) {
      setExportResults([]);
      setExporting(false);
      setCurrentExportIndex(-1);
    }
  }, [isOpen, stories]);

  if (!isOpen) return null;

  const jiraConfig = project.jiraConfig;
  const isConfigured = jiraConfig && jiraConfig.jiraUrl && jiraConfig.email && jiraConfig.apiToken && jiraConfig.projectKey;

  const handleExportStories = async () => {
    if (!isConfigured || stories.length === 0) return;

    const ok = await deductExportCredits(project.id, 'ai_user_stories', user, 'Jira Export', project.name);
    if (!ok) return;

    setExporting(true);
    setExportResults([]);
    
    const results: ExportResult[] = [];

    for (let i = 0; i < stories.length; i++) {
      const story = stories[i];
      setCurrentExportIndex(i);
      
      const issueTitle = story.summary;
      const issueDescription = 
        `USER STORY\n` +
        `----------------------------------------\n` +
        `${story.description}\n\n` +
        `ACCEPTANCE CRITERIA\n` +
        `----------------------------------------\n` +
        `${formatAcceptanceCriteria(story.acceptanceCriteria)}\n\n` +
        `Exported via AutomatiQA AI Story Forge.`;

      try {
        const response = await fetch('/api/integration/jira/post-user-story', {
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
            issueType,
            reporter: user ? (user.name || user.email) : 'QA Engineer'
          })
        });

        const parsed = await parseApiResponse(response);
        if (parsed.ok && parsed.data?.success) {
          results.push({
            storyId: story.id,
            summary: story.summary,
            success: true,
            key: parsed.data.key,
            storyUrl: parsed.data.storyUrl
          });
        } else {
          results.push({
            storyId: story.id,
            summary: story.summary,
            success: false,
            error: parsed.error || 'Failed to create Jira issue.'
          });
        }
      } catch (err: any) {
        results.push({
          storyId: story.id,
          summary: story.summary,
          success: false,
          error: err.message || 'Error occurred while contacting backend'
        });
      }
    }

    setExportResults(results);
    setExporting(false);
    setCurrentExportIndex(-1);
    toast.success(`Export process completed. ${results.filter(r => r.success).length} of ${stories.length} stories exported successfully!`);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[7000] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header decoration banner */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-6 text-white flex items-center justify-between border-b/10">
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-yellow-300 animate-pulse" />
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">Export to Jira Board</h3>
              <p className="text-[10px] text-indigo-200 font-bold uppercase tracking-widest mt-0.5">Publish user stories directly to agile board</p>
            </div>
          </div>
          <button onClick={onClose} disabled={exporting} className="text-indigo-200 hover:text-white p-1 hover:bg-white/10 rounded-full transition-all cursor-pointer disabled:opacity-50"><X size={18} /></button>
        </div>

        {/* Modal Form */}
        <div className="p-8 space-y-5 bg-white max-h-[75vh] overflow-y-auto">
          {!isConfigured ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-100"><AlertCircle size={24} /></div>
              <h4 className="text-xs font-black uppercase tracking-wider text-rose-800">Jira Integration Missing</h4>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">This project is not linked to Atlassian Jira. Head to Settings &gt; Jira Integration to connect credentials first.</p>
            </div>
          ) : (
            <div className="space-y-5">
              
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

              {/* Configure Fields before export */}
              {exportResults.length === 0 && !exporting && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Issue Type</label>
                    <select
                      value={issueType || ''}
                      onChange={(e) => setIssueType(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white cursor-pointer"
                    >
                      <option value="Story">Story</option>
                      <option value="Task">Task</option>
                      <option value="Epic">Epic</option>
                      <option value="Bug">Bug</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Priority</label>
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
                </div>
              )}

              {/* List of user stories to export */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">
                  Stories Selected ({stories.length})
                </label>
                
                <div className="border border-slate-100 rounded-2xl max-h-48 overflow-y-auto divide-y divide-slate-50 bg-slate-50/50 p-2 space-y-1.5">
                  {stories.map((story, idx) => {
                    const result = exportResults.find(r => r.storyId === story.id);
                    const isCurrent = currentExportIndex === idx;

                    return (
                      <div key={story.id} className="p-3 bg-white rounded-xl border border-slate-100 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 truncate uppercase">{story.summary}</p>
                          <p className="text-[9px] text-slate-400 font-mono mt-0.5">{story.storyId || story.id}</p>
                        </div>

                        <div className="flex-shrink-0">
                          {isCurrent && (
                            <span className="flex items-center gap-1 text-[10px] text-indigo-600 font-black uppercase tracking-wider">
                              <Loader2 size={12} className="animate-spin" /> Exporting...
                            </span>
                          )}
                          {!isCurrent && !result && (
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                              Pending
                            </span>
                          )}
                          {result && result.success && (
                            <a 
                              href={result.storyUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold border border-emerald-100 hover:bg-emerald-100 transition-all"
                            >
                              <Link2 size={10} /> {result.key}
                            </a>
                          )}
                          {result && !result.success && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-100" title={result.error}>
                              <AlertCircle size={10} /> Fail
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* Footer buttons */}
          <div className="flex gap-3 pt-4 border-t border-slate-100 justify-end">
            <button 
              onClick={onClose}
              disabled={exporting}
              className="px-5 py-3 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
            >
              {exportResults.length > 0 ? 'Close' : 'Cancel'}
            </button>
            {isConfigured && exportResults.length === 0 && (
              <button 
                onClick={handleExportStories}
                disabled={exporting || stories.length === 0}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-indigo-100 flex items-center justify-center gap-2 cursor-pointer"
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {exporting ? `Exporting (${currentExportIndex + 1}/${stories.length})...` : `Export to Jira Board`}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
