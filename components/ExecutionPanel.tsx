import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Project, TestStatus, TestCase, TestPriority, TestType, TestIntent, isApiTestingScenario, isApiTestingCase, User } from '../types';
import { deductExportCredits } from '../services/creditService';
import { 
  Activity, 
  Cpu, 
  CheckSquare, 
  Square, 
  CheckCircle2, 
  XCircle, 
  Folder, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft,
  X, 
  Paperclip, 
  MessageSquare, 
  Upload, 
  FileText, 
  Image as ImageIcon,
  Download,
  Search,
  Trash2,
  AlertTriangle,
  Clock,
  Zap,
  Camera,
  Maximize2,
  DatabaseZap,
  Link2,
  Plus,
  PlayCircle,
  FileVideo,
  ExternalLink,
  Loader2,
  Pencil,
  Ban,
  Hash,
  Info
} from 'lucide-react';
import { logActivity } from '../services/activityService';
import * as XLSX from 'xlsx';
import { estimateSize } from '../services/projectService';
import { JiraBugModal } from './JiraBugModal';
import { VideoSizeAlertModal } from './VideoSizeAlertModal';
import { maskPasswordText } from './TestCaseManager';
import { toast } from 'sonner';

interface ExecutionPanelProps {
  project: Project;
  user: { email: string, name: string };
  onUpdateProject: (p: Project) => void;
  defaultFilter?: 'ALL' | 'AI' | 'MANUAL';
  activeFolderId?: string | null;
  onClearActiveFolder?: () => void;
}

interface ExecutableTestCase extends TestCase {
  scenarioId: string;
  scenarioTitle: string;
  source: 'AI' | 'MANUAL';
  folderId?: string;
}

interface ExecutionGroup {
  id: string;
  source: 'AI' | 'MANUAL';
  cases: ExecutableTestCase[];
}

interface GroupedCases {
  [key: string]: ExecutionGroup;
}

interface DeleteTarget {
  type: 'group' | 'case';
  id: string; 
  source: 'AI' | 'MANUAL';
  title: string;
}

interface TestCaseEvidenceViewerProps {
  tc: ExecutableTestCase;
  projectId?: string;
  onOpenModal: (tc: ExecutableTestCase) => void;
  onPreview: (media: {
    url: string;
    type: 'image' | 'video';
    caseId?: string;
    scenarioId?: string;
    allItems?: string[];
    currentIndex?: number;
  }) => void;
  isVideo: (url: string) => boolean;
}

const TestCaseEvidenceViewer: React.FC<TestCaseEvidenceViewerProps> = ({ tc, projectId, onOpenModal, onPreview, isVideo }) => {
  const evList = useMemo(() => {
    const list: string[] = [];
    if (tc.attachments && Array.isArray(tc.attachments)) {
      tc.attachments.forEach(item => {
        if (item && typeof item === 'string' && item.trim() && !list.includes(item)) {
          list.push(item);
        }
      });
    }
    if (tc.evidence && typeof tc.evidence === 'string' && tc.evidence.trim() && !list.includes(tc.evidence)) {
      list.push(tc.evidence);
    }
    // Also read localStorage cache so multiple uploaded images are never lost across renders or state updates
    if (typeof window !== 'undefined' && projectId) {
      try {
        const rawId = tc.id.startsWith('tc_') ? tc.id.slice(3) : tc.id;
        const raw = localStorage.getItem(`automatiqa_case_evidence_${projectId}_${tc.id}`) ||
                    localStorage.getItem(`automatiqa_case_evidence_${projectId}_${rawId}`) ||
                    (tc.testCaseId ? localStorage.getItem(`automatiqa_case_evidence_${projectId}_${tc.testCaseId}`) : null);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.attachments)) {
            parsed.attachments.forEach((att: string) => {
              if (att && typeof att === 'string' && att.trim() && !list.includes(att)) {
                list.push(att);
              }
            });
          }
        }
      } catch (e) {}
    }
    return list;
  }, [tc.attachments, tc.evidence, tc.id, tc.testCaseId, projectId]);

  if (evList.length === 0) {
    return (
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold">
          <Paperclip size={13} className="text-slate-400" />
          <span>No Evidence</span>
        </div>
        <button 
          onClick={() => onOpenModal(tc)} 
          className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-xl font-black text-[9px] uppercase border border-indigo-100 transition-all cursor-pointer active:scale-95"
        >
          <Paperclip size={12} /> Add Evidence
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-3 space-y-2.5 shadow-2xs">
      {/* Header with count badge and Edit button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-indigo-50 text-indigo-600 rounded-lg">
            <Paperclip size={13} />
          </div>
          <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
            Evidence
          </span>
          <span className="px-2 py-0.5 bg-indigo-100/70 text-indigo-700 text-[10px] font-black rounded-full">
            {evList.length} {evList.length === 1 ? 'image' : 'images'}
          </span>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onOpenModal(tc); }} 
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-lg text-[10px] font-bold transition-all cursor-pointer"
          title="Edit evidence"
        >
          <Pencil size={11} />
          <span>Edit</span>
        </button>
      </div>

      {/* ALL uploaded images are directly displayed under execution status */}
      {evList.length === 1 ? (
        /* Single Evidence Preview */
        <div 
          className="relative w-full h-36 bg-slate-900 rounded-xl overflow-hidden group/single cursor-zoom-in border border-slate-200"
          onClick={() => onPreview({ url: evList[0], type: isVideo(evList[0]) ? 'video' : 'image', caseId: tc.id, scenarioId: tc.scenarioId, allItems: evList, currentIndex: 0 })}
        >
          {isVideo(evList[0]) ? (
            <div className="w-full h-full flex items-center justify-center">
              <FileVideo size={36} className="text-white/30" />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover/single:bg-black/20 transition-all">
                <PlayCircle size={32} className="text-white drop-shadow-md" />
              </div>
            </div>
          ) : (
            <img 
              src={evList[0] || undefined} 
              alt="Evidence" 
              className="w-full h-full object-cover group-hover/single:scale-105 transition-all duration-300"
            />
          )}
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 text-white rounded-md text-[9px] font-bold backdrop-blur-sm opacity-0 group-hover/single:opacity-100 transition-opacity flex items-center gap-1">
            <Maximize2 size={10} /> Fullscreen
          </div>
        </div>
      ) : (
        /* Multiple Evidence Preview: Display ALL uploaded images directly in a clean responsive grid */
        <div className="space-y-2">
          <div className={`grid ${evList.length === 2 ? 'grid-cols-2' : evList.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'} gap-2`}>
            {evList.map((item, idx) => {
              const isItemVideo = isVideo(item);
              return (
                <div
                  key={idx}
                  onClick={() => onPreview({ url: item, type: isItemVideo ? 'video' : 'image', caseId: tc.id, scenarioId: tc.scenarioId, allItems: evList, currentIndex: idx })}
                  className="relative group h-24 bg-slate-900 rounded-xl overflow-hidden border border-slate-200/90 shadow-xs cursor-zoom-in transition-all duration-200 hover:scale-[1.03] hover:shadow-md hover:border-indigo-400"
                  title={`View Evidence ${idx + 1} (${isItemVideo ? 'Video' : 'Image'})`}
                >
                  {isItemVideo ? (
                    <div className="w-full h-full flex items-center justify-center bg-slate-900">
                      <FileVideo size={22} className="text-white/50" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
                        <PlayCircle size={22} className="text-white drop-shadow" />
                      </div>
                    </div>
                  ) : (
                    <img
                      src={item || undefined}
                      alt={`Evidence ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                  {/* Item index badge */}
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[8px] font-black font-mono rounded backdrop-blur-xs">
                    #{idx + 1}
                  </div>
                  {/* Hover overlay hint */}
                  <div className="absolute inset-0 bg-indigo-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-2 py-0.5 bg-black/70 text-white rounded text-[8px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-xs">
                      <Maximize2 size={8} /> View
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick info caption and Add more trigger */}
          <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 px-0.5 font-semibold">
            <span className="flex items-center gap-1 text-[9px] text-slate-400">
              <Maximize2 size={10} className="text-slate-400" /> Click any image to enlarge
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenModal(tc); }}
              className="text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer text-[10px]"
            >
              + Add More
            </button>
          </div>
        </div>
      )}

      {/* Execution Comments Preview */}
      {tc.comments && (
        <div className="p-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-slate-600 flex items-start gap-1.5">
          <MessageSquare size={12} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="line-clamp-2 italic">{tc.comments}</p>
        </div>
      )}

      {/* Reference Links Preview */}
      {tc.links && tc.links.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {tc.links.map((link, lidx) => (
            <a
              key={lidx}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 rounded-md text-[9px] font-bold truncate max-w-[140px] border border-indigo-100 transition-colors"
              title={link}
            >
              <Link2 size={9} />
              <span className="truncate">{link.replace(/^https?:\/\//i, '')}</span>
              <ExternalLink size={8} />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const ExecutionPanel: React.FC<ExecutionPanelProps> = ({ project, user, onUpdateProject, defaultFilter = 'ALL', activeFolderId, onClearActiveFolder }) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['ALL']));
  const [searchQuery, setSearchQuery] = useState('');

  // SESSION CACHE
  const [localTestCaseUpdates, setLocalTestCaseUpdates] = useState<Record<string, Partial<TestCase>>>({});

  // Evidence & Comment Modal State
  const [evidenceModal, setEvidenceModal] = useState<{ tc: ExecutableTestCase } | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [newLink, setNewLink] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingEvidence, setIsSavingEvidence] = useState(false);
  const [isVideoSizeAlertOpen, setIsVideoSizeAlertOpen] = useState(false);
  const [oversizedVideoMB, setOversizedVideoMB] = useState<number | undefined>(undefined);
  
  const [previewMedia, setPreviewMedia] = useState<{ 
    url: string; 
    type: 'image' | 'video'; 
    caseId?: string; 
    scenarioId?: string; 
    allItems?: string[]; 
    currentIndex?: number; 
  } | null>(null);

  // Keyboard navigation for full-screen preview lightbox
  useEffect(() => {
    if (!previewMedia) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewMedia(null);
        return;
      }
      if (previewMedia.allItems && previewMedia.allItems.length > 1) {
        const items = previewMedia.allItems;
        const current = previewMedia.currentIndex ?? 0;
        if (e.key === 'ArrowLeft') {
          const nextIdx = current > 0 ? current - 1 : items.length - 1;
          const nextUrl = items[nextIdx];
          setPreviewMedia(prev => prev ? ({
            ...prev,
            url: nextUrl,
            type: isVideo(nextUrl) ? 'video' : 'image',
            currentIndex: nextIdx
          }) : null);
        } else if (e.key === 'ArrowRight') {
          const nextIdx = current < items.length - 1 ? current + 1 : 0;
          const nextUrl = items[nextIdx];
          setPreviewMedia(prev => prev ? ({
            ...prev,
            url: nextUrl,
            type: isVideo(nextUrl) ? 'video' : 'image',
            currentIndex: nextIdx
          }) : null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewMedia]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [jiraBugTestCase, setJiraBugTestCase] = useState<TestCase | null>(null);

  // Fast O(1) scenario password lookup cache to eliminate expensive scans during renders
  const scenarioPasswordMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    (project.scenarios || []).forEach(s => {
      if (s.id) map.set(s.id, s.password);
    });
    return map;
  }, [project.scenarios]);

  // Support pasting screenshots directly into evidence modal
  useEffect(() => {
    if (!evidenceModal) return;
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            setIsUploading(true);
            try {
              const reader = new FileReader();
              reader.onloadend = async () => {
                const result = reader.result as string;
                const compressed = await compressImage(result);
                setAttachments(prev => [...prev, compressed]);
                setIsUploading(false);
                toast.success('Screenshot pasted from clipboard!');
              };
              reader.readAsDataURL(file);
            } catch (err) {
              setIsUploading(false);
            }
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [evidenceModal]);

  useEffect(() => {
    const handleClickOutside = () => setActiveDropdownId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const excludedIds = useMemo(() => new Set(project.excludedFromExecutionIds || []), [project.excludedFromExecutionIds]);
  const activeExecutionFolderIds = useMemo(() => new Set(project.activeExecutionFolderIds || []), [project.activeExecutionFolderIds]);

  const localActiveFolderIds = useMemo(() => {
    try {
      const stored = localStorage.getItem(`automatiqa_active_execution_folders_${project.id}`);
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch (e) {
      return new Set<string>();
    }
  }, [project.id]);

  // Keep local storage synced with project active folders
  useEffect(() => {
    if (project.activeExecutionFolderIds && project.activeExecutionFolderIds.length > 0) {
      try {
        const stored = localStorage.getItem(`automatiqa_active_execution_folders_${project.id}`);
        const set = new Set(stored ? JSON.parse(stored) : []);
        project.activeExecutionFolderIds.forEach(id => set.add(id));
        localStorage.setItem(`automatiqa_active_execution_folders_${project.id}`, JSON.stringify(Array.from(set)));
      } catch (e) {}
    }
  }, [project.activeExecutionFolderIds, project.id]);

  const allTestCases: ExecutableTestCase[] = useMemo(() => {
    const list: ExecutableTestCase[] = [];
    const allScenarios = (project.scenarios || []).filter(s => !isApiTestingScenario(s));

    // Pre-filter candidate member scenarios to avoid O(N*M) nested filtering
    const nonFolderScenarios = allScenarios.filter(sc => 
      !sc.isFolder && sc.scenarioId !== 'TESTCASE_FOLDER' && sc.scenarioId !== 'MANUAL_FOLDER' && !isApiTestingScenario(sc)
    );
    
    allScenarios
      .filter(s => {
        if (isApiTestingScenario(s)) return false;
        const isFolder = s.scenarioId === 'MANUAL_FOLDER' || 
                         s.scenarioId === 'TESTCASE_FOLDER' || 
                         (s.isFolder && s.scenarioId !== 'SCENARIO_FOLDER') ||
                         (activeFolderId && s.id === activeFolderId);
        return isFolder;
      })
      .forEach(s => {
        const isFolderActive = (activeFolderId && s.id === activeFolderId) || 
                               activeExecutionFolderIds.has(s.id) || 
                               localActiveFolderIds.has(s.id);

        if (!isFolderActive || excludedIds.has(s.id)) return;
        
        const source: 'AI' | 'MANUAL' = (s.scenarioId === 'TESTCASE_FOLDER' || s.scenarioId !== 'MANUAL_FOLDER') ? 'AI' : 'MANUAL';

        const directCases = (Array.isArray(s.testCases) ? s.testCases : []).filter(tc => !isApiTestingCase(tc));
        const memberScenarios = nonFolderScenarios.filter(sc => 
          sc.folderId === s.id || (s.memberScenarioIds && s.memberScenarioIds.includes(sc.id))
        );
        const memberCases: TestCase[] = [];
        memberScenarios.forEach(ms => {
          if (Array.isArray(ms.testCases) && ms.testCases.length > 0) {
            memberCases.push(...ms.testCases);
          } else if (ms.title) {
            memberCases.push({
              id: `tc_${ms.id}`,
              testCaseId: ms.scenarioId || `TC-${ms.id.slice(-5)}`,
              title: ms.title,
              description: ms.description,
              steps: ms.description ? [ms.description] : ['Execute test scenario procedure'],
              expectedResult: ms.expectedResults || 'Execution validates requirements successfully.',
              status: ms.status || TestStatus.NOT_EXECUTED,
              isApproved: Boolean(ms.isApproved),
              priority: (ms.priority as TestPriority) || TestPriority.MEDIUM,
              testType: ms.type === 'Non-functional' ? TestType.NON_FUNCTIONAL : TestType.FUNCTIONAL,
              testIntent: TestIntent.POSITIVE,
              scenarioId: ms.id
            });
          }
        });

        const seenCaseIds = new Set<string>();
        const folderCases: TestCase[] = [];
        [...directCases, ...memberCases].forEach(c => {
          if (c && c.id && !seenCaseIds.has(c.id)) {
            seenCaseIds.add(c.id);
            folderCases.push(c);
          }
        });

        folderCases.forEach(tc => {
            if (excludedIds.has(tc.id)) return;
            const rawId = tc.id.startsWith('tc_') ? tc.id.slice(3) : tc.id;
            const updates = localTestCaseUpdates[`${s.id}_${tc.id}`] 
              || localTestCaseUpdates[`${s.id}_${rawId}`] 
              || localTestCaseUpdates[tc.id] 
              || localTestCaseUpdates[rawId] 
              || {};

            // Read dedicated evidence cache so multiple uploaded images are always preserved
            let cachedEvidence: any = null;
            try {
              const raw = localStorage.getItem(`automatiqa_case_evidence_${project.id}_${tc.id}`)
                || localStorage.getItem(`automatiqa_case_evidence_${project.id}_${rawId}`)
                || (tc.testCaseId ? localStorage.getItem(`automatiqa_case_evidence_${project.id}_${tc.testCaseId}`) : null);
              if (raw) cachedEvidence = JSON.parse(raw);
            } catch (e) {}

            const mergedAttachments: string[] = [];
            const attSources = [
              updates.attachments,
              cachedEvidence?.attachments,
              tc.attachments,
              updates.evidence ? [updates.evidence] : [],
              cachedEvidence?.evidence ? [cachedEvidence.evidence] : [],
              tc.evidence ? [tc.evidence] : []
            ];
            attSources.forEach(arr => {
              if (Array.isArray(arr)) {
                arr.forEach(item => {
                  if (item && typeof item === 'string' && item.trim() && !mergedAttachments.includes(item)) {
                    mergedAttachments.push(item);
                  }
                });
              }
            });

            const mergedLinks: string[] = [];
            [updates.links, cachedEvidence?.links, tc.links].forEach(arr => {
              if (Array.isArray(arr)) {
                arr.forEach(item => {
                  if (item && typeof item === 'string' && item.trim() && !mergedLinks.includes(item)) {
                    mergedLinks.push(item);
                  }
                });
              }
            });

            const mergedComments = updates.comments !== undefined 
              ? updates.comments 
              : (cachedEvidence?.comments !== undefined ? cachedEvidence.comments : (tc.comments || ''));

            const mergedCase: ExecutableTestCase = { 
              ...tc, 
              ...updates,
              attachments: mergedAttachments,
              evidence: mergedAttachments.length > 0 ? mergedAttachments[0] : '',
              comments: mergedComments,
              links: mergedLinks,
              scenarioId: s.id, 
              scenarioTitle: s.title, 
              source 
            };
            list.push(mergedCase);
        });
      });

    return list;
  }, [project.scenarios, excludedIds, activeExecutionFolderIds, localActiveFolderIds, activeFolderId, localTestCaseUpdates]);

  const searchedTestCases = useMemo(() => {
    if (!searchQuery.trim()) return allTestCases;
    const query = searchQuery.toLowerCase().trim();
    return allTestCases.filter(tc => 
      (tc.testCaseId || '').toLowerCase().includes(query) ||
      tc.scenarioTitle.toLowerCase().includes(query) ||
      tc.title.toLowerCase().includes(query) ||
      tc.expectedResult.toLowerCase().includes(query)
    );
  }, [allTestCases, searchQuery]);

  const groupedCases = useMemo((): GroupedCases => {
    const groups: GroupedCases = {};
    searchedTestCases.forEach(tc => {
      const groupKey = tc.scenarioTitle;
      if (!groups[groupKey]) {
          groups[groupKey] = {
              id: tc.scenarioId,
              source: tc.source,
              cases: []
          };
      }
      groups[groupKey].cases.push(tc);
    });
    return groups;
  }, [searchedTestCases]);

  // Update logic: When a specific folder is "Run", we auto-expand it instead of filtering others out.
  useEffect(() => {
    if (activeFolderId) {
      // Cast Object.entries to fix TS unknown error on group properties
      const groupEntry = (Object.entries(groupedCases) as [string, ExecutionGroup][]).find(([_, group]) => group.id === activeFolderId);
      if (groupEntry) {
        setExpandedGroups(prev => new Set([...Array.from(prev), groupEntry[0]]));
      }
    }
  }, [activeFolderId, groupedCases]);

  useEffect(() => {
    if (searchQuery.trim()) {
        setExpandedGroups(new Set(Object.keys(groupedCases)));
    }
  }, [searchQuery, groupedCases]);

  const handleUpdateStatus = (caseId: string, status: TestStatus, source: 'AI' | 'MANUAL', scenarioId?: string, updates: Partial<TestCase> = {}) => {
    const isReset = status === TestStatus.NOT_STARTED || status === TestStatus.NOT_EXECUTED;
    const executedAt = isReset ? undefined : new Date().toISOString();
    
    // Normalize target IDs for matching across synthetic and original formats
    const rawId = caseId.startsWith('tc_') ? caseId.slice(3) : caseId;
    const matchesCase = (tc: TestCase) => 
      tc.id === caseId || 
      tc.id === rawId || 
      `tc_${tc.id}` === caseId ||
      (tc.testCaseId && tc.testCaseId === caseId) ||
      (tc.testCaseId && tc.testCaseId === rawId);

    // Save into local session cache immediately
    const fullUpdates = { status, executedAt, ...updates };
    setLocalTestCaseUpdates(prev => {
      const next = { ...prev };
      next[caseId] = { ...(next[caseId] || {}), ...fullUpdates };
      next[rawId] = { ...(next[rawId] || {}), ...fullUpdates };
      if (scenarioId) {
        next[`${scenarioId}_${caseId}`] = { ...(next[`${scenarioId}_${caseId}`] || {}), ...fullUpdates };
        next[`${scenarioId}_${rawId}`] = { ...(next[`${scenarioId}_${rawId}`] || {}), ...fullUpdates };
      }
      return next;
    });

    const updatedProject = { ...project };
    let targetCase: TestCase | undefined;

    // 1. Update project.scenarios (both scenario testCases and scenarios treated as cases)
    updatedProject.scenarios = (project.scenarios || []).map(s => {
      let scenarioChanged = false;
      let newTestCases = s.testCases;

      if (Array.isArray(s.testCases) && s.testCases.length > 0) {
        newTestCases = s.testCases.map(tc => {
          if (matchesCase(tc)) {
            scenarioChanged = true;
            if (!targetCase) targetCase = tc;
            return { ...tc, status, executedAt, ...updates };
          }
          return tc;
        });
      }

      // Check if the scenario itself represents the test case (e.g. AI Scenario card or single case)
      if (s.id === caseId || s.id === rawId || `tc_${s.id}` === caseId || (s.scenarioId && (s.scenarioId === caseId || s.scenarioId === rawId))) {
        scenarioChanged = true;
        if (!targetCase) targetCase = { id: s.id, title: s.title } as any;
        return {
          ...s,
          status,
          executedAt,
          comments: updates.comments !== undefined ? updates.comments : (s as any).comments,
          attachments: updates.attachments !== undefined ? updates.attachments : (s as any).attachments,
          links: updates.links !== undefined ? updates.links : (s as any).links,
          evidence: updates.evidence !== undefined ? updates.evidence : (s as any).evidence,
          testCases: newTestCases
        };
      }

      return scenarioChanged ? { ...s, testCases: newTestCases } : s;
    });

    // 2. ALWAYS update manualTestCases if present
    if (Array.isArray(project.manualTestCases)) {
      updatedProject.manualTestCases = project.manualTestCases.map(tc => {
        if (matchesCase(tc)) {
          if (!targetCase) targetCase = tc;
          return { ...tc, status, executedAt, ...updates };
        }
        return tc;
      });
    }
    
    onUpdateProject(updatedProject);

    if (targetCase) {
       logActivity(user.email, user.name, `Executed QA Check: ${targetCase.title} -> ${status}`, project.id, project.name);
    }
  };

  /**
   * Fix: Added handleDownloadFolder function to allow users to export the execution results of a folder to Excel.
   */
  const handleDownloadFolder = async (folderName: string, cases: ExecutableTestCase[]) => {
    if (cases.length === 0) {
      alert("No test cases in this folder to export.");
      return;
    }

    const ok = await deductExportCredits(project.id, 'ai_test_cases', (user as any), `Export Folder Executions (${folderName}) [EXCEL]`, project.name);
    if (!ok) return;

    const data = cases.map(tc => ({
      'Test Case ID': tc.testCaseId || 'N/A',
      'Folder': folderName,
      'Title': tc.title,
      'Steps': tc.steps.join('\n'),
      'Expected Result': tc.expectedResult,
      'Status': tc.status,
      'Comments': tc.comments || '',
      'Executed At': tc.executedAt ? new Date(tc.executedAt).toLocaleString() : 'NOT EXECUTED'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Execution Results");
    const fileName = `${project.name.replace(/\s+/g, '_')}_${folderName.replace(/\s+/g, '_')}_Execution.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const executeDeletion = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'group') {
        // Clear local cache for cases in this group to ensure fresh state if re-added
        const group = groupedCases[deleteTarget.title];
        if (group) {
            const caseIds = group.cases.map(c => c.id);
            setLocalTestCaseUpdates(prev => {
                const next = { ...prev };
                caseIds.forEach(id => delete next[`${group.id}_${id}`]);
                return next;
            });
        }

        const updatedActiveFolders = (project.activeExecutionFolderIds || []).filter(id => id !== deleteTarget.id);
        try {
          const stored = localStorage.getItem(`automatiqa_active_execution_folders_${project.id}`);
          if (stored) {
            const set = new Set<string>(JSON.parse(stored));
            set.delete(deleteTarget.id);
            localStorage.setItem(`automatiqa_active_execution_folders_${project.id}`, JSON.stringify(Array.from(set)));
          }
          if (localStorage.getItem('automatiqa_active_folder_run') === deleteTarget.id) {
            localStorage.removeItem('automatiqa_active_folder_run');
          }
          if (localStorage.getItem(`automatiqa_active_folder_run_${project.id}`) === deleteTarget.id) {
            localStorage.removeItem(`automatiqa_active_folder_run_${project.id}`);
          }
        } catch (e) {}

        if (activeFolderId === deleteTarget.id && onClearActiveFolder) {
          onClearActiveFolder();
        }

        onUpdateProject({ ...project, activeExecutionFolderIds: updatedActiveFolders });
    } else {
        const updatedExcludedIds = [...(project.excludedFromExecutionIds || []), deleteTarget.id];
        onUpdateProject({ ...project, excludedFromExecutionIds: updatedExcludedIds });
    }
    setDeleteTarget(null);
  };

  const toggleGroup = (name: string) => {
    const next = new Set(expandedGroups);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setExpandedGroups(next);
  };

  const openEvidenceModal = (tc: ExecutableTestCase) => {
    const sessionData = localTestCaseUpdates[`${tc.scenarioId}_${tc.id}`] || {};
    let cachedEvidence: any = null;
    try {
      const raw = localStorage.getItem(`automatiqa_case_evidence_${project.id}_${tc.id}`);
      if (raw) cachedEvidence = JSON.parse(raw);
    } catch (e) {}

    const mergedTc = { ...tc, ...sessionData, ...(cachedEvidence || {}) };

    setEvidenceModal({ tc: mergedTc as ExecutableTestCase });
    setCommentInput(mergedTc.comments || '');
    setLinks(mergedTc.links || []);
    setAttachments(mergedTc.attachments || (mergedTc.evidence ? [mergedTc.evidence] : []));
    setNewLink('');
  };

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      if (!base64Str || !base64Str.startsWith('data:image')) {
        return resolve(base64Str);
      }
      const img = new Image();
      const timeout = setTimeout(() => resolve(base64Str), 3000);
      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_DIM = 1000;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) { height *= MAX_DIM / width; width = MAX_DIM; }
            else { width *= MAX_DIM / height; height = MAX_DIM; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.55));
        } catch (err) {
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        clearTimeout(timeout);
        resolve(base64Str);
      };
      img.src = base64Str;
    });
  };

  const handleFiles = (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    // Check 20 MB video limit
    const fileArray = Array.from(files);
    const oversizedVideo = fileArray.find(f => {
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
    const readers = Array.from(files).map((file: any) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const result = (reader.result as string) || '';
            if (result.startsWith('data:image')) {
              const compressed = await compressImage(result);
              resolve(compressed);
            } else {
              resolve(result);
            }
          } catch (e) {
            resolve((reader.result as string) || '');
          }
        };
        reader.onerror = () => resolve('');
        try {
          reader.readAsDataURL(file);
        } catch (err) {
          resolve('');
        }
      });
    });

    Promise.all(readers).then(results => {
      const valid = results.filter(r => r && r.length > 0);
      if (valid.length > 0) {
        setAttachments(prev => [...prev, ...valid]);
        toast.success(`${valid.length} attachment(s) uploaded successfully.`);
      }
    }).catch(() => {
      toast.error('Failed to process uploaded file.');
    }).finally(() => {
      setIsUploading(false);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) handleFiles(files);
  };

  const handleAddLink = () => {
    const l = newLink.trim();
    if (!l) return;
    const finalLink = l.startsWith('http') ? l : `https://${l}`;
    setLinks(prev => [...prev, finalLink]);
    setNewLink('');
  };

  const saveEvidence = async () => {
    if (!evidenceModal || isSavingEvidence) return;
    const { tc } = evidenceModal;
    setIsSavingEvidence(true);

    try {
      // 1. Save to dedicated local evidence cache for instant persistence
      try {
        const evidencePayload = {
          attachments,
          links,
          comments: commentInput,
          evidence: attachments.length > 0 ? attachments[0] : '',
          updatedAt: new Date().toISOString()
        };
        const rawId = tc.id.startsWith('tc_') ? tc.id.slice(3) : tc.id;
        localStorage.setItem(`automatiqa_case_evidence_${project.id}_${tc.id}`, JSON.stringify(evidencePayload));
        localStorage.setItem(`automatiqa_case_evidence_${project.id}_${rawId}`, JSON.stringify(evidencePayload));
        if (tc.testCaseId) {
          localStorage.setItem(`automatiqa_case_evidence_${project.id}_${tc.testCaseId}`, JSON.stringify(evidencePayload));
        }
      } catch (e) {
        console.warn('Dedicated evidence cache notice:', e);
      }

      // 2. Update test case status and execution data
      handleUpdateStatus(tc.id, tc.status, tc.source, tc.scenarioId, {
        comments: commentInput,
        attachments: attachments,
        links: links,
        evidence: attachments.length > 0 ? attachments[0] : ''
      });

      toast.success('Supporting evidence and execution notes saved successfully!');
      setEvidenceModal(null);
    } catch (error) {
      console.error('Error saving evidence:', error);
      toast.error('Failed to save evidence. Please try again.');
    } finally {
      setIsSavingEvidence(false);
    }
  };

  const isVideo = (data?: string | null) => Boolean(data && typeof data === 'string' && (data.startsWith('data:video') || data.toLowerCase().endsWith('.mp4') || data.toLowerCase().endsWith('.webm')));

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      
      {previewMedia && (
        <div 
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 md:p-12 animate-in fade-in duration-300 select-none" 
          onClick={() => setPreviewMedia(null)}
        >
            {/* Top Bar with Counter and Close Button */}
            <div className="absolute top-6 right-6 flex items-center gap-3 z-[5001]" onClick={e => e.stopPropagation()}>
                {previewMedia.allItems && previewMedia.allItems.length > 1 && (
                  <span className="px-3.5 py-1.5 bg-white/15 backdrop-blur-md border border-white/20 text-white rounded-full text-xs font-black tracking-widest uppercase shadow-lg">
                    {(previewMedia.currentIndex ?? 0) + 1} / {previewMedia.allItems.length}
                  </span>
                )}
                <button 
                  onClick={() => setPreviewMedia(null)}
                  className="p-3 bg-white/10 hover:bg-white/25 text-white rounded-full transition-all border border-white/20 cursor-pointer shadow-lg"
                  title="Close (Esc)"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Left Nav Arrow if multiple */}
            {previewMedia.allItems && previewMedia.allItems.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const items = previewMedia.allItems!;
                  const current = previewMedia.currentIndex ?? 0;
                  const nextIdx = current > 0 ? current - 1 : items.length - 1;
                  const nextUrl = items[nextIdx];
                  setPreviewMedia({
                    ...previewMedia,
                    url: nextUrl,
                    type: isVideo(nextUrl) ? 'video' : 'image',
                    currentIndex: nextIdx
                  });
                }}
                className="absolute left-6 top-1/2 -translate-y-1/2 z-[5001] p-3.5 bg-white/15 hover:bg-white/30 text-white rounded-full transition-all border border-white/20 cursor-pointer shadow-2xl backdrop-blur-md"
                title="Previous (Left Arrow)"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            {/* Right Nav Arrow if multiple */}
            {previewMedia.allItems && previewMedia.allItems.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const items = previewMedia.allItems!;
                  const current = previewMedia.currentIndex ?? 0;
                  const nextIdx = current < items.length - 1 ? current + 1 : 0;
                  const nextUrl = items[nextIdx];
                  setPreviewMedia({
                    ...previewMedia,
                    url: nextUrl,
                    type: isVideo(nextUrl) ? 'video' : 'image',
                    currentIndex: nextIdx
                  });
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 z-[5001] p-3.5 bg-white/15 hover:bg-white/30 text-white rounded-full transition-all border border-white/20 cursor-pointer shadow-2xl backdrop-blur-md"
                title="Next (Right Arrow)"
              >
                <ChevronRight size={28} />
              </button>
            )}

            {/* Main Media Preview */}
            <div className="relative w-full h-full flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
                {previewMedia.type === 'video' ? (
                    <video key={previewMedia.url} src={previewMedia.url || undefined} controls autoPlay className="max-w-full max-h-full rounded-2xl shadow-2xl" />
                ) : (
                    <img key={previewMedia.url} src={previewMedia.url || undefined} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200" alt="Evidence Preview" />
                )}
            </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-md rounded-[2.5rem] p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <AlertTriangle size={32} className="text-red-500 mx-auto mb-6" />
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-4">{deleteTarget.type === 'group' ? 'Remove Folder' : 'Exclude Case'}</h3>
            <p className="text-slate-500 text-sm mb-8">
              Remove <span className="font-bold text-slate-800">"{deleteTarget.title}"</span> from execution context?
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={executeDeletion} className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700">Remove</button>
              <button onClick={() => setDeleteTarget(null)} className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <JiraBugModal
        isOpen={!!jiraBugTestCase}
        onClose={() => setJiraBugTestCase(null)}
        project={project}
        testCase={jiraBugTestCase}
        customAttachments={jiraBugTestCase?.attachments || (jiraBugTestCase?.evidence ? [jiraBugTestCase.evidence] : [])}
        customLinks={jiraBugTestCase?.links || []}
        customComments={jiraBugTestCase?.comments || ''}
        user={user}
        onBugCreated={(bugData) => {
          if (!jiraBugTestCase) return;
          const currentLinks = jiraBugTestCase.links || [];
          const updatedLinks = currentLinks.includes(bugData.bugUrl) ? currentLinks : [...currentLinks, bugData.bugUrl];
          handleUpdateStatus(jiraBugTestCase.id, jiraBugTestCase.status, (jiraBugTestCase.source as 'AI' | 'MANUAL') || 'AI', jiraBugTestCase.scenarioId, {
            links: updatedLinks
          });
        }}
      />

      {evidenceModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg"><Paperclip size={24} /></div>
                        <div>
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Supporting Evidence</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Attach proofs, links and comments</p>
                        </div>
                    </div>
                    <button onClick={() => setEvidenceModal(null)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Target Test Case</p>
                        <div className="flex items-center gap-2">
                           {evidenceModal.tc.testCaseId && <span className="text-[9px] font-black text-indigo-600 bg-white px-1.5 py-0.5 rounded border border-indigo-100">{evidenceModal.tc.testCaseId}</span>}
                           <p className="text-sm font-bold text-indigo-900 break-words whitespace-normal leading-relaxed" title={evidenceModal.tc.title}>{evidenceModal.tc.title}</p>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 flex items-center gap-2">
                            <MessageSquare size={14} className="text-indigo-400" /> Execution Comments
                        </label>
                        <textarea 
                            value={commentInput || ''}
                            onChange={(e) => setCommentInput(e.target.value)}
                            placeholder="Observations..."
                            className="w-full h-24 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none shadow-inner"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 flex items-center gap-2">
                            <Link2 size={14} className="text-indigo-400" /> Reference Links (Jam, Jira etc)
                        </label>
                        <div className="flex gap-2 mb-4">
                           <input type="text" value={newLink || ''} onChange={e => setNewLink(e.target.value)} placeholder="e.g. Jira Ticket..." className="flex-1 px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none" onKeyDown={e => e.key === 'Enter' && handleAddLink()}/>
                           <button onClick={handleAddLink} className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-95"><Plus size={20} /></button>
                        </div>
                        {links.length > 0 && (
                            <div className="space-y-2">
                                {links.map((link, lidx) => (
                                    <div key={lidx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl group/link">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <ExternalLink size={12} className="text-slate-400 flex-shrink-0" /><a href={link} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-indigo-700 hover:underline truncate">{link}</a>
                                        </div>
                                        <button onClick={() => setLinks(prev => prev.filter((_, i) => i !== lidx))} className="p-1.5 text-slate-300 hover:text-rose-500 opacity-0 group-hover/link:opacity-100"><X size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3 flex items-center gap-2">
                            <Upload size={14} className="text-indigo-400" /> Evidence (Screenshot/Images)
                        </label>
                        <div 
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.multiple = true;
                                input.accept = 'image/*,video/*';
                                input.onchange = (e) => handleFileSelect(e as any);
                                input.click();
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (e.dataTransfer?.files?.length) {
                                    handleFiles(e.dataTransfer.files);
                                }
                            }}
                            className={`border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center justify-center gap-3 bg-slate-50 hover:bg-white hover:border-indigo-400 transition-all cursor-pointer group mb-6 ${isUploading ? 'opacity-70' : ''}`}
                        >
                            {isUploading ? (
                                <div className="flex flex-col items-center gap-2"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /><p className="text-[10px] font-black uppercase text-slate-400">Processing files...</p></div>
                            ) : (
                                <><div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-slate-300 group-hover:text-indigo-50 shadow-sm border border-slate-100"><Upload size={24} /></div><div className="center"><p className="text-xs font-bold text-slate-700 uppercase tracking-tight">Drop files or click to upload</p><p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Aggressive Compression Applied</p></div></>
                            )}
                        </div>

                        {attachments.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2">
                                {attachments.map((data, aidx) => (
                                    <div key={aidx} className="relative group/att rounded-2xl overflow-hidden aspect-video bg-slate-900 border border-slate-200 shadow-md">
                                        {isVideo(data) ? (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-slate-900 cursor-pointer" onClick={() => setPreviewMedia({ url: data, type: 'video' })}><FileVideo size={24} className="text-white/50" /><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-all bg-indigo-600/20"><PlayCircle size={32} className="text-white" /></div></div>
                                        ) : (
                                            <img src={data || undefined} className="w-full h-full object-cover cursor-zoom-in group-hover/att:scale-110 transition-transform duration-500" onClick={() => setPreviewMedia({ url: data, type: 'image' })} alt="Evidence" />
                                        )}
                                        <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== aidx))} className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-lg shadow-lg opacity-0 group-hover/att:opacity-100 transition-all z-10"><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-3">
                    <button 
                      onClick={saveEvidence} 
                      disabled={isSavingEvidence} 
                      className="flex-1 min-w-[140px] py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 transition-all cursor-pointer"
                    >
                      {isSavingEvidence ? <Loader2 size={16} className="animate-spin" /> : null}
                      {isSavingEvidence ? 'Saving Evidence...' : isUploading ? 'Processing & Save Evidence' : 'Save Evidence'}
                    </button>
                    {project.jiraConfig?.jiraUrl && (
                      <button 
                        type="button"
                        onClick={() => {
                          const currentTc = evidenceModal.tc;
                          setJiraBugTestCase({
                            ...currentTc,
                            attachments,
                            links,
                            comments: commentInput,
                            evidence: attachments.length > 0 ? attachments[0] : currentTc.evidence
                          });
                        }}
                        className="px-5 py-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
                        title="Create a bug in Jira with these attached evidences"
                      >
                        <AlertTriangle size={15} className="text-rose-600" />
                        <span>Create Jira Bug</span>
                      </button>
                    )}
                    <button 
                      onClick={() => setEvidenceModal(null)} 
                      disabled={isSavingEvidence}
                      className="px-6 py-4 bg-white text-slate-500 border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                </div>
            </div>
        </div>
      )}

      <div className="bg-white p-8 md:p-10 rounded-[3rem] border border-slate-200 shadow-sm">
         <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start md:items-center gap-6">
                <div className="p-5 bg-indigo-600 rounded-[1.5rem] text-white shadow-xl flex-shrink-0"><Activity size={28} /></div>
                <div>
                  <h3 className="text-2xl font-black text-black uppercase tracking-tight leading-none">Test Cases Execution</h3>
                  <p className="text-xs text-slate-500 font-bold mt-2 flex items-center gap-1.5 leading-relaxed">
                    <Info size={14} className="text-indigo-600 shrink-0" />
                    For execution add test cases from AI Test Cases page under Folders section by clicking on RUN FOLDER button
                  </p>
                </div>
            </div>
            <div className="relative group min-w-[320px]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="Search suites..." value={searchQuery || ''} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-10 py-3.5 bg-slate-50 border border-slate-200 rounded-[1.2rem] text-sm focus:bg-white outline-none shadow-inner"/>
            </div>
         </div>
      </div>

      <div className="space-y-8">
        {Object.keys(groupedCases).length === 0 ? (
          <div className="py-20 text-center bg-white border-2 border-dashed border-slate-200 rounded-[3rem] p-8 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 shadow-sm">
              <Folder size={32} />
            </div>
            <div className="max-w-lg">
              <h4 className="text-base font-black text-slate-800 uppercase tracking-tight mb-2">No Test Cases in Execution Queue</h4>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                For execution add test cases from AI Test Cases page under Folders section by clicking on <span className="text-indigo-600 font-black">RUN FOLDER</span> button
              </p>
            </div>
          </div>
        ) : (
          /* Cast Object.entries to fix TS unknown error on group properties */
          (Object.entries(groupedCases) as [string, ExecutionGroup][]).map(([groupName, group]) => {
          const cases = group.cases;
          const passed = cases.filter(c => c.status === TestStatus.PASS).length;
          const progress = cases.length > 0 ? (passed / cases.length) * 100 : 0;
          const isExpanded = expandedGroups.has(groupName);

          return (
            <div key={group.id} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-500 group/group-card">
               <div className={`p-6 flex items-center justify-between transition-all ${isExpanded ? 'bg-slate-50 border-b border-slate-100' : 'hover:bg-slate-50 cursor-pointer'}`} onClick={(e) => { if ((e.target as HTMLElement).closest('.group-action')) return; toggleGroup(groupName); }}>
                  <div className="flex items-center gap-4">
                     <div className={`p-3 rounded-2xl ${isExpanded ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-300 group-hover:text-slate-400'}`}>{group.source === 'AI' ? <Folder size={20} /> : <FileText size={20} />}</div>
                     <div><div className="flex items-center gap-3"><h4 className="font-black text-slate-800 uppercase tracking-tight line-clamp-2 whitespace-normal">{groupName}</h4><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white border border-slate-100 px-2 py-0.5 rounded shadow-sm">{group.source === 'AI' ? 'AI Suite' : 'Functional'}</span></div><div className="flex items-center gap-2 mt-1"><div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} /></div><span className="text-[10px] font-black text-slate-400">{Math.round(progress)}% PASS</span></div></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownloadFolder(groupName, cases); }} 
                      className="group-action p-2 text-slate-300 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-sm opacity-0 group-hover/group-card:opacity-100"
                    >
                      <Download size={18} />
                    </button>
                    <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                      <ChevronDown size={20} className="text-slate-400" />
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-8 space-y-6">
                    {cases.map((tc, idx) => (
                        <div key={tc.id} className={`group/case p-6 rounded-[2rem] border transition-all relative ${tc.status === TestStatus.PASS ? 'bg-emerald-50/20 border-emerald-100' : tc.status === TestStatus.FAIL ? 'bg-red-50/20 border-red-100' : tc.status === TestStatus.BLOCKED ? 'bg-amber-50/20 border-amber-100' : tc.status === TestStatus.NOT_STARTED ? 'bg-slate-50/40 border-slate-200' : 'bg-slate-50/40 border-slate-100 hover:bg-white hover:border-slate-200'}`}>
                          <div className="flex flex-col lg:flex-row gap-8">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-4 mb-4">
                                  <div className="w-10 h-10 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-xs font-black text-slate-400 shadow-sm">{idx + 1}</div>
                                  <div className="min-w-0">
                                     {tc.testCaseId && (
                                       <span className="text-[14px] font-black text-black uppercase tracking-widest inline-flex items-center gap-1 mb-1">
                                          Test case ID - {tc.testCaseId}
                                       </span>
                                     )}
                                     <h5 className="text-lg font-black text-slate-800 uppercase tracking-tight pr-10 break-words whitespace-normal leading-relaxed line-clamp-2" title={tc.title}>{tc.title}</h5>
                                  </div>
                                </div>
                                {(() => {
                                   const scPassword = scenarioPasswordMap.get(tc.scenarioId);
                                   return (
                                      <>
                                         <div className="bg-white/60 p-4 rounded-2xl border border-slate-100 mb-6 shadow-sm"><p className="text-[14px] font-black text-black uppercase tracking-widest mb-1">Expected Outcome</p><p className="text-xs text-indigo-950 font-bold leading-relaxed">{maskPasswordText(tc.expectedResult, scPassword)}</p></div>
                                         <div className="space-y-2 mb-6">{tc.steps.map((step, sidx) => (<div key={sidx} className="flex gap-3 text-[11px] text-slate-600 font-medium"><span className="text-slate-300 font-black">{sidx + 1}.</span><p className="break-words">{maskPasswordText(step, scPassword)}</p></div>))}</div>
                                      </>
                                   );
                                })()}
                                {tc.comments && (<div className="mb-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">QA Comments</p><p className="text-[11px] text-slate-600 italic">"{tc.comments}"</p></div>)}
                            </div>
                            <div className="lg:w-[320px] flex flex-col gap-4">
                                <div className="flex items-center justify-between px-1">
                                    <p className="text-[14px] font-black text-black uppercase tracking-[0.2em]">Execution Status</p>
                                </div>
                                <div className="relative">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const dropdownKey = `${tc.scenarioId}_${tc.id}`;
                                            setActiveDropdownId(activeDropdownId === dropdownKey ? null : dropdownKey);
                                        }}
                                        className={`w-full py-3 px-4 rounded-2xl font-black text-[10px] uppercase transition-all border flex items-center justify-between gap-2 shadow-sm ${
                                            tc.status === TestStatus.PASS ? 'bg-emerald-500 text-white border-emerald-600' :
                                            tc.status === TestStatus.FAIL ? 'bg-red-500 text-white border-red-600' :
                                            tc.status === TestStatus.BLOCKED ? 'bg-amber-500 text-white border-amber-600' :
                                            'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {tc.status === TestStatus.PASS ? <CheckCircle2 size={14} /> :
                                             tc.status === TestStatus.FAIL ? <XCircle size={14} /> :
                                             tc.status === TestStatus.BLOCKED ? <Ban size={14} /> :
                                             <Clock size={14} />}
                                            <span>{tc.status === TestStatus.PASS ? 'Pass' : 
                                                   tc.status === TestStatus.FAIL ? 'Fail' : 
                                                   tc.status === TestStatus.BLOCKED ? 'Block' : 
                                                   'Not Started'}</span>
                                        </div>
                                        <ChevronDown size={14} className={`transition-transform duration-200 ${activeDropdownId === `${tc.scenarioId}_${tc.id}` ? 'rotate-180' : ''}`} />
                                    </button>

                                     {activeDropdownId === `${tc.scenarioId}_${tc.id}` && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveDropdownId(null);
                                                    handleUpdateStatus(tc.id, TestStatus.PASS, tc.source, tc.scenarioId);
                                                }}
                                                className="w-full px-4 py-3 text-left hover:bg-emerald-50 flex items-center gap-3 transition-colors group/opt cursor-pointer"
                                            >
                                                <div className="p-1.5 bg-emerald-100 text-emerald-600 rounded-lg group-hover/opt:bg-emerald-500 group-hover/opt:text-white transition-all"><CheckCircle2 size={12} /></div>
                                                <span className="text-[10px] font-black uppercase text-slate-600 group-hover/opt:text-emerald-700">Pass</span>
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveDropdownId(null);
                                                    handleUpdateStatus(tc.id, TestStatus.FAIL, tc.source, tc.scenarioId);
                                                }}
                                                className="w-full px-4 py-3 text-left hover:bg-red-50 flex items-center gap-3 transition-colors group/opt cursor-pointer"
                                            >
                                                <div className="p-1.5 bg-red-100 text-red-600 rounded-lg group-hover/opt:bg-red-500 group-hover/opt:text-white transition-all"><XCircle size={12} /></div>
                                                <span className="text-[10px] font-black uppercase text-slate-600 group-hover/opt:text-red-700">Fail</span>
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveDropdownId(null);
                                                    handleUpdateStatus(tc.id, TestStatus.BLOCKED, tc.source, tc.scenarioId);
                                                }}
                                                className="w-full px-4 py-3 text-left hover:bg-amber-50 flex items-center gap-3 transition-colors group/opt cursor-pointer"
                                            >
                                                <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg group-hover/opt:bg-amber-500 group-hover/opt:text-white transition-all"><Ban size={12} /></div>
                                                <span className="text-[10px] font-black uppercase text-slate-600 group-hover/opt:text-amber-700">Block</span>
                                            </button>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveDropdownId(null);
                                                    handleUpdateStatus(tc.id, TestStatus.NOT_STARTED, tc.source, tc.scenarioId);
                                                }}
                                                className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center gap-3 transition-colors group/opt cursor-pointer"
                                            >
                                                <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg group-hover/opt:bg-slate-500 group-hover/opt:text-white transition-all"><Clock size={12} /></div>
                                                <span className="text-[10px] font-black uppercase text-slate-600 group-hover/opt:text-slate-700">Not Started</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {tc.status === TestStatus.FAIL && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const sessionData = localTestCaseUpdates[`${tc.scenarioId}_${tc.id}`] || {};
                                      let cachedEvidence: any = null;
                                      try {
                                        const rawId = tc.id.startsWith('tc_') ? tc.id.slice(3) : tc.id;
                                        const raw = localStorage.getItem(`automatiqa_case_evidence_${project.id}_${tc.id}`) ||
                                                    localStorage.getItem(`automatiqa_case_evidence_${project.id}_${rawId}`) ||
                                                    (tc.testCaseId ? localStorage.getItem(`automatiqa_case_evidence_${project.id}_${tc.testCaseId}`) : null);
                                        if (raw) cachedEvidence = JSON.parse(raw);
                                      } catch (err) {}

                                      const mergedAttachments: string[] = [
                                        ...(Array.isArray(sessionData.attachments) ? sessionData.attachments : []),
                                        ...(cachedEvidence && Array.isArray(cachedEvidence.attachments) ? cachedEvidence.attachments : []),
                                        ...(Array.isArray(tc.attachments) ? tc.attachments : []),
                                        ...(tc.evidence ? [tc.evidence] : [])
                                      ].filter(Boolean);

                                      const mergedLinks: string[] = [
                                        ...(Array.isArray(sessionData.links) ? sessionData.links : []),
                                        ...(cachedEvidence && Array.isArray(cachedEvidence.links) ? cachedEvidence.links : []),
                                        ...(Array.isArray(tc.links) ? tc.links : [])
                                      ].filter(Boolean);

                                      setJiraBugTestCase({
                                        ...tc,
                                        ...sessionData,
                                        attachments: Array.from(new Set(mergedAttachments)),
                                        links: Array.from(new Set(mergedLinks)),
                                        comments: sessionData.comments || cachedEvidence?.comments || tc.comments || '',
                                        evidence: mergedAttachments.length > 0 ? mergedAttachments[0] : tc.evidence
                                      });
                                    }}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all shadow-md shadow-rose-100 cursor-pointer"
                                  >
                                    <AlertTriangle size={14} /> Create a bug in JIRA
                                  </button>
                                )}

                                <TestCaseEvidenceViewer 
                                  tc={tc} 
                                  projectId={project.id}
                                  onOpenModal={openEvidenceModal} 
                                  onPreview={setPreviewMedia} 
                                  isVideo={isVideo} 
                                />

                                {tc.links && tc.links.length > 0 && (
                                  <div className="space-y-2">
                                    {tc.links.map((link, lidx) => (
                                      <a 
                                        key={lidx} 
                                        href={link} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="flex items-center gap-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-600 uppercase hover:bg-indigo-100 transition-all group/link"
                                      >
                                        <Link2 size={12} />
                                        <span className="truncate flex-1">{link}</span>
                                        <ExternalLink size={10} className="opacity-0 group-hover/link:opacity-100 transition-opacity" />
                                      </a>
                                    ))}
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                    ))}
                  </div>
                )}
            </div>
          );
        })
      )}
      </div>

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

export default ExecutionPanel;