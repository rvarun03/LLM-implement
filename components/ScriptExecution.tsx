import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Search,
  Calendar,
  ChevronDown,
  Paperclip,
  Eye,
  GitBranch,
  AlertTriangle,
  Trash2,
  X,
  Download,
  Copy,
  Check,
  Info,
  ExternalLink,
  Maximize2,
  FileCode,
  FileVideo,
  PlayCircle,
  Upload,
  MessageSquare,
  Link2,
  Terminal,
  FolderOpen,
  Loader2,
  Image as ImageIcon
} from 'lucide-react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Project, AutomationScript, AutomationScriptFile, User, TestStatus } from '../types';
import { parseScriptIntoFiles } from './ScriptGenerator';
import { ensureCompleteProjectFiles } from '../services/codeGenerators/multiFrameworkScriptGenerator';
import { GithubPushModal } from './GithubPushModal';
import { JiraBugModal } from './JiraBugModal';
import { VideoSizeAlertModal } from './VideoSizeAlertModal';
import { logActivity } from '../services/activityService';
import { estimateSize, getDeletedIds, addDeletedIds } from '../services/projectService';
import { saveProjectBackup } from '../services/storageBackupService';
import { formatScriptLanguageAndFramework } from '../utils/automationFrameworkOptions';

// Format date to DD/MM/YYYY
export const formatDate = (isoString?: string) => {
  if (!isoString) return '08/07/2026';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '08/07/2026';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '08/07/2026';
  }
};

// Resolve normalized status from any script or status string
export const getNormalizedStatus = (
  script: Partial<AutomationScript> | string | null | undefined
): 'NOT STARTED' | 'PASSED' | 'FAILED' | 'BLOCKED' => {
  if (!script) return 'NOT STARTED';
  const raw = (
    typeof script === 'string'
      ? script
      : (script.lastExecutionStatus || (script as any).executionStatus || (script as any).status || '')
  ).toString().toUpperCase().trim();

  if (raw === 'SUCCESS' || raw === 'PASS' || raw === 'PASSED') return 'PASSED';
  if (raw === 'FAILURE' || raw === 'FAIL' || raw === 'FAILED') return 'FAILED';
  if (raw === 'BLOCKED' || raw === 'BLOCK') return 'BLOCKED';
  return 'NOT STARTED';
};

// File language detection
export const getFileLanguage = (path: string, fallbackLang?: string): string => {
  const p = path.toLowerCase();
  if (p.endsWith('.ts') || p.endsWith('.tsx')) return 'TypeScript';
  if (p.endsWith('.js') || p.endsWith('.jsx') || p.endsWith('.mjs') || p.endsWith('.cjs')) return 'JavaScript';
  if (p.endsWith('.json')) return 'JSON';
  if (p.endsWith('.py')) return 'Python';
  if (p.endsWith('.java')) return 'Java';
  if (p.endsWith('.xml')) return 'XML';
  if (p.endsWith('.html')) return 'HTML';
  if (p.endsWith('.css')) return 'CSS';
  if (p.endsWith('.env')) return 'Config';
  if (p.endsWith('.md') || p.endsWith('.markdown')) return 'Markdown';
  if (p.endsWith('.yml') || p.endsWith('.yaml')) return 'YAML';
  if (p.endsWith('.sh') || p.endsWith('.bash')) return 'Shell';
  return fallbackLang || 'Code';
};

// Safe script files extractor
export const resolveScriptDisplayFiles = (script: AutomationScript): AutomationScriptFile[] => {
  if (Array.isArray(script.files) && script.files.length > 0) {
    return script.files;
  }
  const content = script.content || '';
  const isPomPlaceholder = content.includes('POM Suite with') && content.includes('Preserved in files array');
  if (!isPomPlaceholder && content.trim().length > 0) {
    const parsed = parseScriptIntoFiles(content, script.tool, script.language);
    if (parsed && parsed.length > 0) {
      return parsed;
    }
    const ext = script.language === 'Python' ? 'py' : script.language === 'Java' ? 'java' : script.language === 'TypeScript' ? 'ts' : 'js';
    const toolName = (script.tool || 'test').toLowerCase();
    return [{
      path: `${toolName}.spec.${ext}`,
      content
    }];
  }
  return [];
};

// Clean code viewer with line numbers and file header
export const CodeDisplayBlock: React.FC<{
  code: string;
  filePath?: string;
  language?: string;
  onCopy?: () => void;
}> = ({ code, filePath, language, onCopy }) => {
  const [copied, setCopied] = useState(false);
  const lines = useMemo(() => {
    if (!code) return ['// Empty file'];
    return code.split('\n');
  }, [code]);

  const handleBlockCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(filePath ? `Copied ${filePath}` : 'Code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
    if (onCopy) onCopy();
  };

  return (
    <div className="flex flex-col w-full bg-[#050c18] rounded-xl border border-slate-800/80 overflow-hidden shadow-inner">
      {/* File sub-header */}
      {filePath && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 text-[11px] font-mono text-slate-400 select-none">
          <div className="flex items-center gap-2 truncate">
            <FileCode size={13} className="text-[#00E1C5] shrink-0" />
            <span className="text-slate-200 font-bold truncate">{filePath}</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 font-mono">{lines.length} {lines.length === 1 ? 'line' : 'lines'}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {language && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-[#00E1C5] font-semibold text-[10px] tracking-wide uppercase">
                {language}
              </span>
            )}
            <button
              type="button"
              onClick={handleBlockCopy}
              title="Copy this file"
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-[11px] cursor-pointer"
            >
              {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
              <span>{copied ? 'COPIED' : 'COPY FILE'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Code body with line numbers */}
      <div className="flex font-mono text-xs leading-relaxed max-h-[500px] overflow-y-auto overflow-x-auto custom-scrollbar bg-[#050c18]">
        {/* Line numbers column */}
        <div className="select-none text-right pr-3.5 pl-3 py-3 text-slate-600 border-r border-slate-800/80 bg-slate-950/50 text-[11px] font-mono shrink-0 min-w-[3.2rem]">
          {lines.map((_, i) => (
            <div key={i} className="leading-relaxed">
              {i + 1}
            </div>
          ))}
        </div>
        {/* Code column */}
        <div className="py-3 px-4 flex-1 text-slate-200 selection:bg-teal-500/30">
          <pre className="whitespace-pre font-mono text-xs leading-relaxed m-0 p-0">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};

interface ScriptExecutionProps {
  project: Project;
  user: User;
  onUpdateProject: (p: Project) => void;
  onNavigateToGenerator?: () => void;
}

export const ScriptExecution: React.FC<ScriptExecutionProps> = ({
  project,
  user,
  onUpdateProject,
  onNavigateToGenerator
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NOT STARTED' | 'PASSED' | 'FAILED' | 'BLOCKED'>('ALL');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [evidenceModalScript, setEvidenceModalScript] = useState<AutomationScript | null>(null);
  const [isSavingEvidence, setIsSavingEvidence] = useState(false);
  const [viewCodeScript, setViewCodeScript] = useState<AutomationScript | null>(null);
  const [selectedScriptForGithub, setSelectedScriptForGithub] = useState<AutomationScript | null>(null);
  const [jiraBugScript, setJiraBugScript] = useState<AutomationScript | null>(null);
  const [deleteConfirmScript, setDeleteConfirmScript] = useState<AutomationScript | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeFileMap, setActiveFileMap] = useState<Record<string, number>>({});
  const [modalActiveFileIndex, setModalActiveFileIndex] = useState(0);
  const [deletedScriptIds, setDeletedScriptIds] = useState<Set<string>>(() => getDeletedIds());
  const [isVideoSizeAlertOpen, setIsVideoSizeAlertOpen] = useState(false);
  const [oversizedVideoMB, setOversizedVideoMB] = useState<number | undefined>(undefined);

  // Default fallback scripts (empty to ensure project isolation)
  const defaultFallbackScripts: AutomationScript[] = useMemo(() => [], []);

  // Track expanded script cards inline (matches screenshot where SANDBOX JIRA US is open by default)
  const [expandedScriptIds, setExpandedScriptIds] = useState<Set<string>>(() => {
    return new Set(['script-sandbox-jira-default', 'qzf4s4kzw', 'sandbox-jira-us']);
  });

  // Toggle inline code stream expansion
  const toggleCodeExpansion = (scriptId: string) => {
    setExpandedScriptIds(prev => {
      const next = new Set(prev);
      if (next.has(scriptId)) {
        next.delete(scriptId);
      } else {
        next.add(scriptId);
      }
      return next;
    });
  };

  // Helper to retrieve logic stream content
  const getScriptStreamContent = (script: AutomationScript): string => {
    if (script.content && script.content.trim().length > 0) {
      return script.content;
    }
    if (script.files && script.files.length > 0) {
      const fileTree = script.files.map(f => `├── ${f.path}`).join('\n');
      return `This architecture provides a comprehensive, production-ready QA Automation framework built with ${script.tool || 'Playwright'} and ${script.language || 'TypeScript'}. It adheres to best practices, robust design patterns like Page Object Model (POM), and strict security guidelines for handling sensitive data. The framework is designed for scalability, maintainability, and reliable execution, ensuring high-quality test automation for your application.

---

# 📁 Folder Structure

\`\`\`
automation-project/
${fileTree}
\`\`\`

---

${script.files.map(f => `#### \`${f.path}\`\n\`\`\`typescript\n${f.content}\n\`\`\``).join('\n\n---\n\n')}`;
    }
    return `This architecture provides a comprehensive, production-ready QA Automation framework built with ${script.tool || 'Playwright'} and ${script.language || 'TypeScript'}. It adheres to best practices, robust design patterns like Page Object Model (POM), and strict security guidelines for handling sensitive data. The framework is designed for scalability, maintainability, and reliable execution, ensuring high-quality test automation for your application.

---

# 📁 Folder Structure

\`\`\`
automation-project/
├── .env
├── package.json
├── playwright.config.ts
├── pages/
│   ├── BasePage.ts
│   ├── DashboardPage.ts
│   └── LoginPage.ts
└── tests/
    └── smoke.spec.ts
\`\`\``;
  };

  // Evidence Modal State
  const [attachments, setAttachments] = useState<string[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [newLink, setNewLink] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.status-dropdown-container')) {
        setActiveDropdownId(null);
      }
      if (!target.closest('.status-filter-dropdown-container')) {
        setIsFilterDropdownOpen(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Helper to get fully hydrated script with locally cached evidence if available
  const getHydratedScript = (script: AutomationScript): AutomationScript => {
    try {
      const stored = localStorage.getItem(`automatiqa_script_evidence_${project.id}_${script.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        const mergedAttachments: string[] = [
          ...(Array.isArray((script as any).attachments) ? (script as any).attachments : []),
          ...(Array.isArray(script.contextImages) ? script.contextImages : []),
          ...(script.evidence ? [script.evidence] : [])
        ];
        if (Array.isArray(parsed.attachments)) {
          parsed.attachments.forEach((att: string) => {
            if (att && !mergedAttachments.includes(att)) mergedAttachments.push(att);
          });
        }

        const mergedLinks: string[] = [
          ...(Array.isArray((script as any).links) ? (script as any).links : []),
          ...(script.evidenceUrl ? [script.evidenceUrl] : [])
        ];
        if (Array.isArray(parsed.links)) {
          parsed.links.forEach((l: string) => {
            if (l && !mergedLinks.includes(l)) mergedLinks.push(l);
          });
        }

        return {
          ...script,
          attachments: mergedAttachments,
          contextImages: mergedAttachments,
          evidence: mergedAttachments.length > 0 ? mergedAttachments[0] : script.evidence,
          links: mergedLinks,
          evidenceUrl: mergedLinks.length > 0 ? mergedLinks[0] : script.evidenceUrl,
          comments: script.comments || parsed.comments,
          lastExecutionNotes: script.lastExecutionNotes || parsed.comments
        };
      }
    } catch (e) {
      // Ignore
    }
    return script;
  };

  // Filter scripts: display ONLY approved scripts belonging to the active project
  const scriptsToDisplay = useMemo(() => {
    const deletedIds = new Set<string>([...getDeletedIds(), ...deletedScriptIds]);
    const isDeleted = (id?: string) => {
      if (!id) return true;
      const clean = id.trim();
      return deletedIds.has(clean) || deletedIds.has(clean.toLowerCase());
    };

    const all = (project.automationScripts || []).filter(s => s && s.id && !isDeleted(s.id));
    const approvedUserScripts = all.filter(s => Boolean(s.isApproved));

    // Hydrate scripts with local evidence cache
    let baseList = approvedUserScripts.map(s => getHydratedScript(s));

    // Filter by execution status if selected
    if (statusFilter !== 'ALL') {
      baseList = baseList.filter(s => getNormalizedStatus(s) === statusFilter);
    }

    if (!searchQuery.trim()) return baseList;

    const query = searchQuery.toLowerCase().trim();
    return baseList.filter(s => {
      const titleMatch = (s.title || '').toLowerCase().includes(query);
      const toolMatch = (s.tool || '').toLowerCase().includes(query);
      const langMatch = (s.language || '').toLowerCase().includes(query);
      const testCasesMatch = (s.testCaseTitles || []).some(t => t.toLowerCase().includes(query));
      return titleMatch || toolMatch || langMatch || testCasesMatch;
    });
  }, [project.automationScripts, project.id, searchQuery, statusFilter, deletedScriptIds]);

  // Handle status update
  const handleUpdateStatus = (scriptId: string, newStatus: 'NOT STARTED' | 'PASSED' | 'FAILED' | 'BLOCKED') => {
    let internalStatus: any = TestStatus.NOT_STARTED;
    if (newStatus === 'PASSED') internalStatus = TestStatus.PASS;
    else if (newStatus === 'FAILED') internalStatus = TestStatus.FAIL;
    else if (newStatus === 'BLOCKED') internalStatus = TestStatus.BLOCKED;
    else internalStatus = TestStatus.NOT_STARTED;

    const existingList = Array.isArray(project.automationScripts) ? [...project.automationScripts] : [];
    const updated = existingList.map(s => {
      if (s.id === scriptId) {
        return {
          ...s,
          lastExecutionStatus: internalStatus,
          lastExecutedAt: new Date().toISOString()
        };
      }
      return s;
    });

    const updatedProject = { ...project, automationScripts: updated };
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    saveProjectBackup(updatedProject);
    onUpdateProject(updatedProject);
    logActivity(
      user.email,
      user.name || user.email,
      `Updated execution status of script to ${newStatus}`,
      project.id,
      project.name
    );
    toast.success(`Execution status updated to ${newStatus}`);
    setActiveDropdownId(null);
  };

  // Open Evidence modal
  const handleOpenEvidence = (script: AutomationScript) => {
    const hydrated = getHydratedScript(script);
    setEvidenceModalScript(hydrated);

    const existingAttachments: string[] = [];
    if (hydrated.evidence) existingAttachments.push(hydrated.evidence);
    if (hydrated.contextImages && Array.isArray(hydrated.contextImages)) {
      hydrated.contextImages.forEach(img => {
        if (img && !existingAttachments.includes(img)) existingAttachments.push(img);
      });
    }
    if ((hydrated as any).attachments && Array.isArray((hydrated as any).attachments)) {
      (hydrated as any).attachments.forEach((att: string) => {
        if (att && !existingAttachments.includes(att)) existingAttachments.push(att);
      });
    }

    const existingLinks: string[] = [];
    if (hydrated.evidenceUrl) existingLinks.push(hydrated.evidenceUrl);
    if ((hydrated as any).links && Array.isArray((hydrated as any).links)) {
      (hydrated as any).links.forEach((l: string) => {
        if (l && !existingLinks.includes(l)) existingLinks.push(l);
      });
    }

    setAttachments(existingAttachments);
    setLinks(existingLinks);
    setCommentInput(hydrated.lastExecutionNotes || (hydrated as any).comments || '');
  };

  // Compress Image helper: uses canvas with white background to keep screenshots crisp without dark artifacts
  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width || 800;
            let height = img.height || 600;
            const MAX_DIM = 1200;
            if (width > MAX_DIM || height > MAX_DIM) {
              if (width > height) {
                height = Math.round(height * (MAX_DIM / width));
                width = MAX_DIM;
              } else {
                width = Math.round(width * (MAX_DIM / height));
                height = MAX_DIM;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, width, height);
              ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.75));
              return;
            }
            resolve(base64Str);
          } catch {
            resolve(base64Str);
          }
        };
        img.onerror = () => resolve(base64Str);
        img.src = base64Str;
      } catch {
        resolve(base64Str);
      }
    });
  };

  // Process files (used by file input, drag & drop, and clipboard paste)
  const processFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Check 20 MB video limit
    const oversizedVideo = files.find(f => {
      const isVid = f.type?.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(f.name);
      return isVid && f.size > 20 * 1024 * 1024;
    });

    if (oversizedVideo) {
      setOversizedVideoMB(oversizedVideo.size / (1024 * 1024));
      setIsVideoSizeAlertOpen(true);
      toast.error('Video size should not exceed 20 MB.');
      return;
    }

    setIsUploading(true);
    const readers = files.map((file) => {
      return new Promise<string>(async (resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const result = reader.result as string;
          if (result && result.startsWith('data:image')) {
            const compressed = await compressImage(result);
            resolve(compressed);
          } else {
            resolve(result);
          }
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers)
      .then(results => {
        const valid = results.filter(r => Boolean(r));
        setAttachments(prev => [...prev, ...valid]);
        toast.success(`Attached ${valid.length} file(s)`);
      })
      .catch(() => {
        toast.error('Failed to process attachment');
      })
      .finally(() => {
        setIsUploading(false);
      });
  };

  // Handle file select for evidence
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(files);
    e.target.value = '';
  };

  // Support pasting screenshots directly from clipboard when evidence modal is open
  useEffect(() => {
    if (!evidenceModalScript) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        processFiles(imageFiles);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [evidenceModalScript]);

  // Add Link
  const handleAddLink = () => {
    const l = newLink.trim();
    if (!l) return;
    const finalLink = l.startsWith('http://') || l.startsWith('https://') ? l : `https://${l}`;
    setLinks(prev => [...prev, finalLink]);
    setNewLink('');
  };

  // Save Evidence to script
  const handleSaveEvidence = () => {
    if (!evidenceModalScript || isUploading || isSavingEvidence) return;

    setIsSavingEvidence(true);

    try {
      const currentScripts = Array.isArray(project.automationScripts) ? project.automationScripts : [];

      let found = false;
      const updated = currentScripts.map(s => {
        if (s.id === evidenceModalScript.id) {
          found = true;
          return {
            ...s,
            evidence: attachments.length > 0 ? attachments[0] : undefined,
            evidenceUrl: links.length > 0 ? links[0] : undefined,
            contextImages: attachments,
            lastExecutionNotes: commentInput,
            attachments,
            links,
            comments: commentInput
          };
        }
        return s;
      });

      if (!found) {
        updated.push({
          ...evidenceModalScript,
          evidence: attachments.length > 0 ? attachments[0] : undefined,
          evidenceUrl: links.length > 0 ? links[0] : undefined,
          contextImages: attachments,
          lastExecutionNotes: commentInput,
          attachments,
          links,
          comments: commentInput
        });
      }

      // 1. Save directly to dedicated localStorage cache for 100% reliable persistence
      try {
        localStorage.setItem(
          `automatiqa_script_evidence_${project.id}_${evidenceModalScript.id}`,
          JSON.stringify({
            attachments,
            links,
            comments: commentInput,
            updatedAt: new Date().toISOString()
          })
        );
      } catch (err) {
        console.warn('Dedicated evidence cache notice:', err);
      }

      // 2. Save immediate local project backup
      const updatedProject = { ...project, automationScripts: updated };
      try {
        localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
      } catch (err) {
        console.warn('Project backup notice:', err);
      }

      // 3. Update project in React state & Firestore
      onUpdateProject(updatedProject);

      toast.success('Supporting evidence saved successfully!');
      setEvidenceModalScript(null);
    } catch (err) {
      console.error('Error saving evidence:', err);
      toast.error('Failed to save evidence. Please try again.');
    } finally {
      setIsSavingEvidence(false);
    }
  };

  // Delete script
  const handleDeleteScript = () => {
    if (!deleteConfirmScript) return;
    const targetId = deleteConfirmScript.id;
    const targetTitle = deleteConfirmScript.title;

    // 1. Permanently register tombstone so it can never resurrect
    addDeletedIds([targetId, targetId.toLowerCase()]);
    setDeletedScriptIds(prev => {
      const next = new Set(prev);
      next.add(targetId);
      next.add(targetId.toLowerCase());
      return next;
    });

    // 2. Filter out of project.automationScripts
    const currentScripts = Array.isArray(project.automationScripts) ? project.automationScripts : [];
    const updated = currentScripts.filter(
      s => s && s.id !== targetId && s.id?.toLowerCase() !== targetId.toLowerCase()
    );

    // 3. Immediately clean local backup so onSnapshot or concurrent merge never sees it
    try {
      const backupKey = `automatiqa_project_backup_${project.id}`;
      const localBackupStr = localStorage.getItem(backupKey);
      if (localBackupStr) {
        const localBackup = JSON.parse(localBackupStr);
        if (localBackup && Array.isArray(localBackup.automationScripts)) {
          localBackup.automationScripts = localBackup.automationScripts.filter(
            (s: any) => s && s.id !== targetId && s.id?.toLowerCase() !== targetId.toLowerCase()
          );
          localStorage.setItem(backupKey, JSON.stringify(localBackup));
        }
      }
      localStorage.removeItem(`automatiqa_script_evidence_${project.id}_${targetId}`);
      localStorage.removeItem(`automatiqa_script_evidence_${targetId}`);
    } catch (e) {}

    // 4. Update project state & persistent backups
    const updatedProject = { ...project, automationScripts: updated };
    saveProjectBackup(updatedProject);
    onUpdateProject(updatedProject);

    // 5. Activity log & notification
    logActivity(
      user.email,
      user.name || user.email,
      `Deleted script ${targetTitle}`,
      project.id,
      project.name
    );
    toast.success(`Removed "${targetTitle}"`);
    setDeleteConfirmScript(null);
  };

  // Download script
  const handleDownloadScript = async (script: AutomationScript) => {
    try {
      const files = script.files || [];
      if (files.length > 1) {
        const zip = new JSZip();
        files.forEach(f => {
          zip.file(f.path, f.content);
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        const safeTitle = (script?.title ? String(script.title) : 'suite').replace(/\s+/g, '_');
        saveAs(blob, `${safeTitle}_suite.zip`);
        toast.success('Suite downloaded as ZIP');
      } else {
        const ext = script.language === 'Python' ? 'py' : script.language === 'Java' ? 'java' : script.language === 'TypeScript' ? 'ts' : 'js';
        const content = files.length === 1 ? files[0].content : script.content;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const safeTitle = (script?.title ? String(script.title) : 'script').replace(/\s+/g, '_');
        saveAs(blob, `${safeTitle}.${ext}`);
        toast.success('Script downloaded');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to download script');
    }
  };

  // Copy code
  const handleCopyCode = (text: string, label?: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    toast.success(label ? `Copied ${label} to clipboard!` : 'Code copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isVideo = (data?: string | null) =>
    Boolean(
      data &&
      typeof data === 'string' &&
      (data.startsWith('data:video') ||
        data.toLowerCase().endsWith('.mp4') ||
        data.toLowerCase().endsWith('.webm'))
    );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER BANNER (Matches user screenshot)                            */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-[2rem] border border-slate-200/90 p-6 md:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4 sm:gap-5">
          {/* Cyan/Teal Rounded Icon with >_ */}
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-[#00E1C5] flex items-center justify-center text-white shadow-sm shrink-0">
            <span className="font-mono font-black text-2xl tracking-tighter text-white">&gt;_</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight">
              SCRIPT EXECUTION
            </h1>
            <p className="text-xs sm:text-[13px] text-slate-500 font-medium leading-relaxed mt-1 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-teal-500 text-teal-600 text-[10px] font-black shrink-0">
                i
              </span>
              <span>
                To execute automation scripts, navigate to Automation &rarr; Script Generator, locate the generated script in the Automation Repository, and click the Approve button.
              </span>
            </p>
          </div>
        </div>

        {/* Right Controls: Status Filter Dropdown + Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          {/* Execution Status Filter Dropdown */}
          <div className="relative status-filter-dropdown-container">
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className="h-10 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full text-xs font-bold flex items-center gap-2.5 text-slate-700 transition-colors shadow-2xs cursor-pointer"
            >
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold shrink-0">STATUS:</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                statusFilter === 'PASSED' ? 'bg-emerald-500' :
                statusFilter === 'FAILED' ? 'bg-rose-500' :
                statusFilter === 'BLOCKED' ? 'bg-amber-500' :
                statusFilter === 'NOT STARTED' ? 'bg-slate-400' :
                'bg-indigo-500'
              }`} />
              <span className={
                statusFilter === 'PASSED' ? 'text-emerald-700 font-black' :
                statusFilter === 'FAILED' ? 'text-rose-700 font-black' :
                statusFilter === 'BLOCKED' ? 'text-amber-700 font-black' :
                statusFilter === 'NOT STARTED' ? 'text-slate-700 font-black' :
                'text-slate-900 font-bold'
              }>
                {statusFilter === 'ALL' ? 'ALL STATUSES' : statusFilter}
              </span>
              <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isFilterDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isFilterDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden py-1.5 animate-in fade-in duration-150">
                {(['ALL', 'NOT STARTED', 'PASSED', 'FAILED', 'BLOCKED'] as const).map((opt) => {
                  const isSelected = statusFilter === opt;
                  const label = opt === 'ALL' ? 'ALL STATUSES' : opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setStatusFilter(opt);
                        setIsFilterDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-xs font-bold tracking-wide transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : opt === 'PASSED'
                          ? 'text-emerald-700 hover:bg-emerald-50'
                          : opt === 'FAILED'
                          ? 'text-rose-700 hover:bg-rose-50'
                          : opt === 'BLOCKED'
                          ? 'text-amber-700 hover:bg-amber-50'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          isSelected ? 'bg-white' :
                          opt === 'PASSED' ? 'bg-emerald-500' :
                          opt === 'FAILED' ? 'bg-rose-500' :
                          opt === 'BLOCKED' ? 'bg-amber-500' :
                          opt === 'NOT STARTED' ? 'bg-slate-400' :
                          'bg-indigo-500'
                        }`} />
                        <span>{label}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-white shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-72 shrink-0">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search scripts by test case or tool..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50/70 border border-slate-200 rounded-full text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#00E1C5] focus:bg-white transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SCRIPT CARDS LIST (Matches user screenshot)                            */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        {scriptsToDisplay.length === 0 ? (
          <div className="bg-white rounded-[2rem] border-2 border-dashed border-slate-200 p-12 text-center flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 text-[#00E1C5] flex items-center justify-center shadow-sm">
              <Terminal size={32} />
            </div>
            <div className="max-w-md">
              <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                {statusFilter !== 'ALL'
                  ? `No ${statusFilter} Scripts Found`
                  : searchQuery.trim()
                  ? 'No Matching Scripts Found'
                  : 'No Approved Scripts Found'}
              </h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-2">
                {statusFilter !== 'ALL'
                  ? `There are no automation scripts with execution status "${statusFilter}". You can switch back to all statuses or update a script's status.`
                  : searchQuery.trim()
                  ? `No scripts match your search "${searchQuery}".`
                  : 'To execute automation scripts, navigate to Automation → Script Generator, locate the generated script in the Automation Repository, and click the Approve button.'}
              </p>
            </div>
            {statusFilter !== 'ALL' ? (
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className="mt-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all cursor-pointer shadow-sm"
              >
                Show All Statuses
              </button>
            ) : searchQuery.trim() ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all cursor-pointer shadow-sm"
              >
                Clear Search
              </button>
            ) : onNavigateToGenerator ? (
              <button
                type="button"
                onClick={onNavigateToGenerator}
                className="mt-2 px-6 py-2.5 bg-[#00E1C5] text-slate-900 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-[#00cbb2] transition-all cursor-pointer shadow-sm"
              >
                Go to Script Generator
              </button>
            ) : null}
          </div>
        ) : (
          scriptsToDisplay.map((script) => {
            const status = getNormalizedStatus(script);
            const isDropdownOpen = activeDropdownId === script.id;
            const isExpanded = expandedScriptIds.has(script.id);
            const initialLetter = (script.tool ? script.tool[0] : (script.title ? script.title[0] : 'P')).toUpperCase();
            const hasAttachments = Boolean(
              script.evidence ||
              script.evidenceUrl ||
              (script.contextImages && script.contextImages.length > 0) ||
              ((script as any).attachments && (script as any).attachments.length > 0) ||
              ((script as any).links && (script as any).links.length > 0)
            );
            const streamContent = getScriptStreamContent(script);
            let hasCursorRendered = false;

            return (
              <div
                key={script.id}
                className={`bg-white rounded-[2rem] border border-slate-200/90 shadow-xs hover:shadow-sm transition-all relative ${
                  isDropdownOpen ? 'z-40' : 'z-10'
                }`}
              >
                {/* Top Card Row */}
                <div className="p-5 sm:p-6 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                  {/* Left Side: Initial circle + Title + Language pill + Date */}
                  <div className="flex items-center gap-4 sm:gap-5 min-w-0">
                    {/* Avatar Circle with Initial 'P' (Playwright) or tool initial */}
                    <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 font-black text-lg flex items-center justify-center shrink-0">
                      {initialLetter}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base font-black text-slate-900 uppercase tracking-tight truncate max-w-sm sm:max-w-md">
                          {script.title || 'AUTOMATION SCRIPT'}
                        </h3>
                        {/* Language and framework pill tag */}
                        <span className="px-2.5 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider shrink-0">
                          {formatScriptLanguageAndFramework(script)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                        <Calendar size={13} className="text-slate-400 shrink-0" />
                        <span>{formatDate(script.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Execution Status Dropdown + Attach + View/Hide Code + Git + Create Bug + Delete */}
                  <div className="flex flex-wrap items-end gap-3 shrink-0 self-start xl:self-center">
                    {/* Execution Status Dropdown */}
                    <div className="relative status-dropdown-container">
                      <span className="block text-[10px] sm:text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
                        EXECUTION STATUS
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdownId(isDropdownOpen ? null : script.id);
                        }}
                        className="h-10 px-4 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold flex items-center justify-between gap-3 min-w-[165px] shadow-2xs transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            status === 'PASSED' ? 'bg-emerald-500' :
                            status === 'FAILED' ? 'bg-rose-500' :
                            status === 'BLOCKED' ? 'bg-amber-500' :
                            'bg-slate-400'
                          }`} />
                          <span
                            className={
                              status === 'PASSED'
                                ? 'text-emerald-700 font-black'
                                : status === 'FAILED'
                                ? 'text-rose-700 font-black'
                                : status === 'BLOCKED'
                                ? 'text-amber-700 font-black'
                                : 'text-slate-800 font-bold'
                            }
                          >
                            {status}
                          </span>
                        </div>
                        <ChevronDown
                          size={14}
                          className={`text-slate-400 transition-transform duration-200 ${
                            isDropdownOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {/* Opened Dropdown Options */}
                      {isDropdownOpen && (
                        <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden py-1.5 animate-in fade-in duration-150">
                          {(['NOT STARTED', 'PASSED', 'FAILED', 'BLOCKED'] as const).map((opt) => {
                            const isSelected = status === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUpdateStatus(script.id, opt);
                                }}
                                className={`w-full px-4 py-2.5 text-left text-xs font-bold tracking-wide transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : opt === 'PASSED'
                                    ? 'text-emerald-700 hover:bg-emerald-50'
                                    : opt === 'FAILED'
                                    ? 'text-rose-700 hover:bg-rose-50'
                                    : opt === 'BLOCKED'
                                    ? 'text-amber-700 hover:bg-amber-50'
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    isSelected ? 'bg-white' :
                                    opt === 'PASSED' ? 'bg-emerald-500' :
                                    opt === 'FAILED' ? 'bg-rose-500' :
                                    opt === 'BLOCKED' ? 'bg-amber-500' :
                                    'bg-slate-400'
                                  }`} />
                                  <span>{opt}</span>
                                </div>
                                {isSelected && <Check size={14} className="text-white shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Attach Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenEvidence(script)}
                      className="h-10 px-4 rounded-xl border border-slate-200 hover:border-[#00E1C5] bg-white hover:bg-teal-50/20 text-slate-700 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
                    >
                      <Paperclip size={14} className="text-[#00E1C5]" />
                      <span>ATTACH</span>
                      {hasAttachments && (
                        <span className="w-2 h-2 rounded-full bg-[#00E1C5]" title="Evidence attached" />
                      )}
                    </button>

                    {/* View / Hide Code Button */}
                    {isExpanded ? (
                      <button
                        type="button"
                        onClick={() => toggleCodeExpansion(script.id)}
                        className="h-10 px-4 rounded-xl border-2 border-slate-900 bg-white hover:bg-slate-50 text-slate-900 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
                      >
                        <Eye size={14} className="text-slate-900 stroke-[2.5]" />
                        <span>HIDE CODE</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleCodeExpansion(script.id)}
                        className="h-10 px-4 rounded-xl border border-slate-200 hover:border-[#00E1C5] bg-white hover:bg-teal-50/20 text-slate-700 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
                      >
                        <Eye size={14} className="text-[#00E1C5]" />
                        <span>VIEW CODE</span>
                      </button>
                    )}

                    {/* Push to GitHub (Branch Icon) */}
                    <button
                      type="button"
                      onClick={() => setSelectedScriptForGithub(script)}
                      className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 hover:border-[#00E1C5] bg-white hover:bg-teal-50/20 text-slate-400 hover:text-slate-700 shadow-2xs transition-all cursor-pointer"
                      title="Push to GitHub"
                    >
                      <GitBranch size={15} />
                    </button>

                    {/* Create Bug Button (Shown when status is FAILED - Matches screenshot Card 2) */}
                    {status === 'FAILED' && (
                      <button
                        type="button"
                        onClick={() => setJiraBugScript(getHydratedScript(script))}
                        className="h-10 px-4 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-rose-600 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                      >
                        <AlertTriangle size={14} className="text-rose-600" />
                        <span>CREATE BUG</span>
                      </button>
                    )}

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmScript(script)}
                      className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 hover:border-rose-200 hover:bg-rose-50/40 text-slate-300 hover:text-rose-600 shadow-2xs transition-all cursor-pointer"
                      title="Delete script"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* ATTACHED EVIDENCE SECTION (Always displayed directly on the script card)  */}
                {/* ========================================================================= */}
                {(() => {
                  const cardAttachments = [
                    ...((script as any).attachments && Array.isArray((script as any).attachments) ? (script as any).attachments : []),
                    ...(script.contextImages && Array.isArray(script.contextImages) ? script.contextImages : []),
                    ...(script.evidence ? [script.evidence] : [])
                  ].filter((v, i, a) => typeof v === 'string' && v.trim().length > 0 && a.indexOf(v) === i);

                  const cardLinks = [
                    ...((script as any).links && Array.isArray((script as any).links) ? (script as any).links : []),
                    ...(script.evidenceUrl ? [script.evidenceUrl] : [])
                  ].filter((v, i, a) => typeof v === 'string' && v.trim().length > 0 && a.indexOf(v) === i);

                  const cardNotes = script.lastExecutionNotes || (script as any).comments || '';
                  const hasEvidence = cardAttachments.length > 0 || cardLinks.length > 0 || cardNotes.trim().length > 0;

                  if (!hasEvidence) return null;

                  return (
                    <div className="px-5 sm:px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Paperclip size={14} className="text-[#00E1C5] shrink-0" />
                          <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">
                            Supporting Evidence & Proofs
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">
                            {cardAttachments.length + cardLinks.length} Item{cardAttachments.length + cardLinks.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenEvidence(script)}
                          className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>Manage Evidence</span>
                          <ChevronDown size={12} className="-rotate-90" />
                        </button>
                      </div>

                      {/* Notes / Comments Callout */}
                      {cardNotes.trim().length > 0 && (
                        <div className="bg-white border border-slate-200/80 rounded-xl p-3 text-xs text-slate-700 flex items-start gap-2.5 shadow-2xs">
                          <MessageSquare size={14} className="text-slate-400 mt-0.5 shrink-0" />
                          <span className="font-medium whitespace-pre-wrap leading-relaxed">{cardNotes}</span>
                        </div>
                      )}

                      {/* External Proof Links */}
                      {cardLinks.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          {cardLinks.map((l, lIdx) => (
                            <a
                              key={lIdx}
                              href={l}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-teal-400 rounded-lg text-xs font-semibold text-slate-700 hover:text-teal-700 shadow-2xs transition-all max-w-xs truncate"
                            >
                              <ExternalLink size={12} className="text-teal-500 shrink-0" />
                              <span className="truncate">{l}</span>
                            </a>
                          ))}
                        </div>
                      )}

                      {/* Media Thumbnails Gallery */}
                      {cardAttachments.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-1">
                          {cardAttachments.map((data, aIdx) => (
                            <div
                              key={aIdx}
                              className="group relative aspect-video rounded-xl overflow-hidden bg-slate-200 border border-slate-300/80 shadow-2xs cursor-pointer hover:border-teal-400 transition-all"
                              onClick={() => setPreviewMedia({ url: data, type: isVideo(data) ? 'video' : 'image' })}
                            >
                              {isVideo(data) ? (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white">
                                  <PlayCircle size={22} className="text-teal-400 group-hover:scale-110 transition-transform" />
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-300 mt-1">Video</span>
                                </div>
                              ) : (
                                <img
                                  src={data}
                                  alt={`Evidence ${aIdx + 1}`}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <Maximize2 size={16} className="text-white drop-shadow" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ========================================================================= */}
                {/* INLINE CODE LOGIC STREAM (Matches user screenshot Card 2)                */}
                {/* ========================================================================= */}
                {isExpanded && (() => {
                  const displayFiles = resolveScriptDisplayFiles(script);
                  const currentFileIdx = (() => {
                    const stored = activeFileMap[script.id];
                    if (typeof stored === 'number' && displayFiles.length > 0 && stored >= 0 && stored < displayFiles.length) {
                      return stored;
                    }
                    return 0;
                  })();

                  const activeFile = displayFiles[currentFileIdx];
                  const activeCode = activeFile ? activeFile.content : (script.content || '// No script code available');
                  const activeFilePath = activeFile?.path || (script.title ? `${script.title}.ts` : 'script.ts');
                  const activeLanguage = getFileLanguage(activeFilePath, script.language);
                  const isMarkdown = activeFilePath.endsWith('.md') || activeFilePath.endsWith('.markdown');

                  return (
                    <div className="border-t border-slate-900/40 bg-[#030712] text-slate-200 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                      {/* Dark Stream Header Bar */}
                      <div className="px-6 py-3.5 border-b border-slate-800/80 bg-[#030712] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-[#00E1C5] font-black text-xs tracking-wider uppercase flex items-center gap-2">
                            <Terminal size={14} className="text-[#00E1C5]" />
                            AUTOMATION LOGIC STREAM
                          </span>
                          {displayFiles.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-800/90 text-slate-300 text-[10px] font-mono border border-slate-700/60">
                              {displayFiles.length} {displayFiles.length === 1 ? 'file' : 'files'}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Copy button */}
                          <button
                            type="button"
                            onClick={() => handleCopyCode(activeCode, activeFilePath)}
                            title={`Copy ${activeFilePath}`}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            {copiedCode ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          </button>

                          {/* Download button */}
                          <button
                            type="button"
                            onClick={() => handleDownloadScript(script)}
                            title="Download script"
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            <Download size={14} />
                          </button>

                          {/* Open full modal editor */}
                          <button
                            type="button"
                            onClick={() => {
                              setModalActiveFileIndex(currentFileIdx);
                              setViewCodeScript(script);
                            }}
                            title="Open full modal code inspector"
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            <Maximize2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Multi-File Navigation Tabs */}
                      {displayFiles.length > 1 && (
                        <div className="flex items-center gap-1.5 px-6 py-2 bg-slate-950 border-b border-slate-800/60 overflow-x-auto custom-scrollbar">
                          {displayFiles.map((file, fIdx) => (
                            <button
                              key={fIdx}
                              type="button"
                              onClick={() => setActiveFileMap(prev => ({ ...prev, [script.id]: fIdx }))}
                              className={`px-3 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer shrink-0 ${
                                currentFileIdx === fIdx
                                  ? 'bg-slate-800 text-[#00E1C5] font-bold border border-slate-700 shadow-xs'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                              }`}
                            >
                              {file.path}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Active File Content Viewer */}
                      <div className="p-4 sm:p-6 bg-[#030712]">
                        {isMarkdown ? (
                          <div className="p-5 max-h-[520px] overflow-y-auto custom-scrollbar font-mono text-xs text-slate-200 leading-relaxed bg-[#050c18] rounded-xl border border-slate-800/80">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {activeCode}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <CodeDisplayBlock
                            code={activeCode}
                            filePath={activeFilePath}
                            language={activeLanguage}
                            onCopy={() => setCopiedCode(true)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. SUPPORTING EVIDENCE MODAL                                              */}
      {/* ========================================================================= */}
      {evidenceModalScript && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 sm:p-7 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#00E1C5] rounded-2xl text-white shadow-sm">
                  <Paperclip size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                    Supporting Evidence
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {evidenceModalScript.title} &bull; Attach proofs, links and comments
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEvidenceModalScript(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-7 space-y-6 overflow-y-auto custom-scrollbar flex-1">
              {/* QA Comments */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare size={14} className="text-[#00E1C5]" />
                  <span>Execution Notes & Comments</span>
                </label>
                <textarea
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Describe failure causes, environment details, or steps taken during execution..."
                  className="w-full h-24 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#00E1C5] transition-all resize-none"
                />
              </div>

              {/* External Links */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Link2 size={14} className="text-[#00E1C5]" />
                  <span>Reference Links</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddLink())}
                    placeholder="https://jira.company.com/browse/PROJ-123 or CI log URL"
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#00E1C5]"
                  />
                  <button
                    type="button"
                    onClick={handleAddLink}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                {links.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {links.map((link, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs"
                      >
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#009986] font-bold hover:underline flex items-center gap-1.5 truncate max-w-[450px]"
                        >
                          <ExternalLink size={12} className="shrink-0" />
                          <span className="truncate">{link}</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setLinks(prev => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload Screenshots & Recordings */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Upload size={14} className="text-[#00E1C5]" />
                  <span>Screenshots & Screen Recordings</span>
                </label>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-[#00E1C5] rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-teal-50/10"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Upload size={24} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-xs font-bold text-slate-700">
                    Click to upload screenshots or video recordings
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Images are compressed automatically for efficient storage
                  </p>
                </div>

                {/* Attachments preview grid */}
                {attachments.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                    {attachments.map((data, aidx) => (
                      <div
                        key={aidx}
                        className="relative group rounded-xl overflow-hidden aspect-video bg-slate-900 border border-slate-200 shadow-sm"
                      >
                        {isVideo(data) ? (
                          <div
                            className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-slate-900 cursor-pointer"
                            onClick={() => setPreviewMedia({ url: data, type: 'video' })}
                          >
                            <FileVideo size={22} className="text-white/60" />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-black/40">
                              <PlayCircle size={28} className="text-white" />
                            </div>
                          </div>
                        ) : (
                          <img
                            src={data}
                            alt={`Evidence ${aidx + 1}`}
                            className="w-full h-full object-cover cursor-zoom-in group-hover:scale-105 transition-transform duration-300"
                            onClick={() => setPreviewMedia({ url: data, type: 'image' })}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => setAttachments(prev => prev.filter((_, i) => i !== aidx))}
                          className="absolute top-1.5 right-1.5 p-1 bg-rose-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
              <button
                type="button"
                onClick={handleSaveEvidence}
                disabled={isUploading || isSavingEvidence}
                className="flex-1 py-3 bg-[#00E1C5] hover:bg-[#00cbb2] text-slate-900 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSavingEvidence ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-slate-900" />
                    <span>SAVING EVIDENCE...</span>
                  </>
                ) : (
                  <span>SAVE EVIDENCE</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setEvidenceModalScript(null)}
                disabled={isSavingEvidence}
                className="px-6 py-3 bg-white text-slate-600 border border-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. VIEW CODE MODAL                                                        */}
      {/* ========================================================================= */}
      {viewCodeScript && (() => {
        const modalFiles = resolveScriptDisplayFiles(viewCodeScript);
        const safeModalIdx = modalFiles.length > 0 && modalActiveFileIndex < modalFiles.length ? modalActiveFileIndex : 0;
        const modalFile = modalFiles[safeModalIdx];
        const modalCode = modalFile ? modalFile.content : (viewCodeScript.content || '// No code available');
        const modalPath = modalFile?.path || (viewCodeScript.title ? `${viewCodeScript.title}.ts` : 'script.ts');
        const modalLanguage = getFileLanguage(modalPath, viewCodeScript.language);
        const isMarkdown = modalPath.endsWith('.md') || modalPath.endsWith('.markdown');

        return (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-slate-900 text-slate-100 w-full max-w-5xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-800 animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#00E1C5]/20 text-[#00E1C5] rounded-xl border border-[#00E1C5]/30">
                    <FileCode size={20} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
                      {viewCodeScript.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {viewCodeScript.tool} &bull; {viewCodeScript.language} {modalFiles.length > 1 ? `• ${modalFiles.length} files` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyCode(modalCode, modalPath)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    {copiedCode ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{copiedCode ? 'COPIED' : 'COPY'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownloadScript(viewCodeScript)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00E1C5] hover:bg-[#00cbb2] text-slate-900 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    <Download size={13} />
                    <span>DOWNLOAD</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewCodeScript(null)}
                    className="p-2 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer ml-2"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* File Tabs (if multi-file) */}
              {modalFiles.length > 1 && (
                <div className="flex items-center gap-1 px-4 py-2 bg-slate-950 border-b border-slate-800 overflow-x-auto custom-scrollbar">
                  {modalFiles.map((file, fIdx) => (
                    <button
                      key={fIdx}
                      type="button"
                      onClick={() => setModalActiveFileIndex(fIdx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer shrink-0 ${
                        safeModalIdx === fIdx
                          ? 'bg-slate-800 text-[#00E1C5] font-bold border border-slate-700'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                    >
                      {file.path}
                    </button>
                  ))}
                </div>
              )}

              {/* Code Body */}
              <div className="p-5 overflow-y-auto custom-scrollbar flex-1 font-mono text-xs text-slate-300 leading-relaxed bg-[#0b1120]">
                {isMarkdown ? (
                  <div className="p-4 bg-[#050c18] rounded-xl border border-slate-800">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {modalCode}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <CodeDisplayBlock
                    code={modalCode}
                    filePath={modalPath}
                    language={modalLanguage}
                    onCopy={() => setCopiedCode(true)}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 5. GITHUB PUSH MODAL                                                      */}
      {/* ========================================================================= */}
      <GithubPushModal
        isOpen={!!selectedScriptForGithub}
        onClose={() => setSelectedScriptForGithub(null)}
        project={project}
        script={selectedScriptForGithub}
      />

      {/* ========================================================================= */}
      {/* 6. JIRA BUG MODAL (Triggered from CREATE BUG button on failed scripts)     */}
      {/* ========================================================================= */}
      <JiraBugModal
        isOpen={!!jiraBugScript}
        onClose={() => setJiraBugScript(null)}
        project={project}
        script={jiraBugScript}
        customAttachments={(() => {
          if (!jiraBugScript) return [];
          const hydrated = getHydratedScript(jiraBugScript);
          return [
            ...(Array.isArray((hydrated as any).attachments) ? (hydrated as any).attachments : []),
            ...(Array.isArray(hydrated.contextImages) ? hydrated.contextImages : []),
            ...(hydrated.evidence ? [hydrated.evidence] : [])
          ].filter((v, i, a): v is string => typeof v === 'string' && v.trim().length > 0 && a.indexOf(v) === i);
        })()}
        customLinks={(() => {
          if (!jiraBugScript) return [];
          const hydrated = getHydratedScript(jiraBugScript);
          return [
            ...(Array.isArray((hydrated as any).links) ? (hydrated as any).links : []),
            ...(hydrated.evidenceUrl ? [hydrated.evidenceUrl] : [])
          ].filter((v, i, a): v is string => typeof v === 'string' && v.trim().length > 0 && a.indexOf(v) === i);
        })()}
        customComments={jiraBugScript ? (getHydratedScript(jiraBugScript).lastExecutionNotes || (getHydratedScript(jiraBugScript) as any).comments || '') : ''}
        user={user}
        onBugCreated={(bugData) => {
          if (!jiraBugScript) return;
          const currentLinks = (jiraBugScript as any).links || [];
          const updatedLinks = currentLinks.includes(bugData.bugUrl) ? currentLinks : [...currentLinks, bugData.bugUrl];
          const currentScripts = Array.isArray(project.automationScripts) ? project.automationScripts : [];
          const updated = currentScripts.map(s => {
            if (s.id === jiraBugScript.id) {
              return {
                ...s,
                links: updatedLinks,
                evidenceUrl: s.evidenceUrl || bugData.bugUrl
              };
            }
            return s;
          });
          onUpdateProject({ ...project, automationScripts: updated });
        }}
      />

      {/* ========================================================================= */}
      {/* 7. DELETE CONFIRMATION MODAL                                              */}
      {/* ========================================================================= */}
      {deleteConfirmScript && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-[2rem] p-7 text-center shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-2">
              Delete Script
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-6">
              Are you sure you want to remove <span className="font-bold text-slate-800">"{deleteConfirmScript.title}"</span> from Execution? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDeleteScript}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmScript(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. MEDIA PREVIEW MODAL (Full-size image/video)                           */}
      {/* ========================================================================= */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 sm:p-8 animate-in fade-in duration-200"
          onClick={() => setPreviewMedia(null)}
        >
          <div className="absolute top-6 right-6">
            <button className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all">
              <X size={24} />
            </button>
          </div>
          <div className="relative max-w-4xl max-h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {previewMedia.type === 'video' ? (
              <video src={previewMedia.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-xl shadow-2xl" />
            ) : (
              <img src={previewMedia.url} alt="Evidence preview" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            )}
          </div>
        </div>
      )}

      {/* 20 MB Video Size Limit Alert Popup */}
      <VideoSizeAlertModal
        isOpen={isVideoSizeAlertOpen}
        onClose={() => setIsVideoSizeAlertOpen(false)}
        fileSizeMB={oversizedVideoMB}
        maxSizeMB={20}
      />
    </div>
  );
};

export default ScriptExecution;
