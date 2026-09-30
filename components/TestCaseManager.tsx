import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
  Sparkles, 
  FileVideo, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Trash2, 
  Edit3, 
  Copy, 
  Download, 
  Play, 
  Folder, 
  FolderPlus,
  FileSpreadsheet, 
  Layers, 
  Eye, 
  RefreshCw, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp,
  ChevronLeft,
  Check, 
  CheckSquare, 
  Square, 
  Clock, 
  ShieldAlert, 
  FileText, 
  Film, 
  ExternalLink,
  ArrowRight,
  HelpCircle,
  Hash,
  SlidersHorizontal,
  Maximize2,
  ZoomIn,
  X,
  Globe,
  User as UserIcon,
  Lock,
  Paperclip,
  Upload,
  Info,
  Sliders,
  Image as ImageIcon,
  Clipboard,
  FileCode,
  FileCheck,
  LayoutGrid,
  Pencil,
  Zap,
  Bookmark,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { deductProjectCredits, canPerformAction } from '../services/creditService';
import { checkAiGenerationPermission } from '../services/tokenConsumptionService';
import { downloadExcel, downloadCsv } from '../utils/exportUtils';
import * as XLSX from 'xlsx';
import { 
  Project, 
  TestScenario, 
  TestCase, 
  TestStatus, 
  TestPriority, 
  TestType, 
  TestIntent, 
  User,
  VectorSearchResult,
  isApiTestingScenario,
  isApiTestingCase
} from '../types';
import { VideoInputUploader, VideoWalkthroughData } from './VideoInputUploader';
import { FolderVideoPlayer } from './FolderVideoPlayer';
import { uploadAndPersistVideo, saveVideoBlob } from '../services/artifactStorage';
import { ScreenshotUploader, ScreenshotFile } from './ScreenshotUploader';
import { RAGStatusBadge } from './RAGStatusBadge';
import { generateTestCasesFromScenario, generateFallbackTestCases } from '../geminiService';
import { logActivity } from '../services/activityService';
import { addDeletedIds, getDeletedIds, getAiTestCasesWithScenario } from '../services/projectService';
import { deleteFolderFromFirestore } from '../services/folderPersistenceService';
import { JiraBugModal } from './JiraBugModal';
import { createVideoFramesThumbnails } from '../utils/videoExtractor';
import { generateUniqueFolderId } from '../utils/idGenerator';
import { compressImage, parseApiResponse } from '../services/apiUtils';
import { logger } from '../services/appLogger';

export const maskPasswordText = (text: string | undefined, password?: string): string => {
  if (!text) return '';
  if (!password || password.trim().length === 0) return text;
  try {
    const escaped = password.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), '••••••••');
  } catch {
    return text;
  }
};

/**
 * Parses test case step text to highlight and link Frame references (e.g. [Frame 1 @ 00:01])
 */
export const renderStepWithFrameTags = (
  stepText: string,
  password?: string,
  onFrameClick?: (frameIndex: number) => void
): React.ReactNode => {
  const masked = maskPasswordText(stepText, password);
  const frameRegex = /\[Frame\s*(\d+)(?:\s*@\s*([\d:]+))?\]/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = frameRegex.exec(masked)) !== null) {
    if (match.index > lastIndex) {
      parts.push(masked.substring(lastIndex, match.index));
    }
    const frameNum = parseInt(match[1], 10);
    const timestamp = match[2] || '';
    parts.push(
      <button
        key={`frame-btn-${match.index}`}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onFrameClick) onFrameClick(frameNum - 1);
        }}
        className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200/90 rounded-md font-mono text-[10px] font-black transition-all hover:scale-105 shadow-xs cursor-pointer align-baseline"
        title={`Inspect Frame ${frameNum}${timestamp ? ` at ${timestamp}` : ''}`}
      >
        <Film size={10} className="text-teal-600 shrink-0" />
        <span>Frame {frameNum}</span>
        {timestamp && <span className="text-teal-600 font-semibold">@{timestamp}</span>}
      </button>
    );
    lastIndex = frameRegex.lastIndex;
  }

  if (lastIndex < masked.length) {
    parts.push(masked.substring(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : masked;
};

interface TestCaseManagerProps {
  project: Project;
  user: User;
  onUpdateProject: (p: Project) => void;
  onRunFolder?: (folderId: string) => void;
  onNavigateTab?: (tab: string, meta?: { folderId?: string; folderName?: string }) => void;
  initialView?: 'folders' | 'scenarios';
}

export const TestCaseManager: React.FC<TestCaseManagerProps> = ({
  project,
  user,
  onUpdateProject,
  onRunFolder,
  onNavigateTab,
  initialView = 'scenarios'
}) => {
  // Main view tab: 'folders' or 'scenarios' (defaults to 'scenarios' so approved individual scenarios are immediately visible)
  const [activeView, setActiveView] = useState<'folders' | 'scenarios'>(initialView);

  useEffect(() => {
    if (initialView) {
      setActiveView(initialView);
      setSelectedScenarioId('ALL');
    }
  }, [initialView]);

  // Expanded folders, scenarios, and test cases
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [expandedCaseIds, setExpandedCaseIds] = useState<Set<string>>(new Set());
  const [collapsedScenarioIds, setCollapsedScenarioIds] = useState<Set<string>>(new Set());

  const toggleScenarioCollapse = (scenId: string) => {
    setCollapsedScenarioIds(prev => {
      const next = new Set(prev);
      if (next.has(scenId)) next.delete(scenId);
      else next.add(scenId);
      return next;
    });
  };

  // Scenarios / cases filters
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [intentFilter, setIntentFilter] = useState<string>('ALL');
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());

  // RAG Toggle
  const [ragEnabled, setRagEnabled] = useState(true);
  const [retrievedRagChunks, setRetrievedRagChunks] = useState<VectorSearchResult[]>([]);

  // Generation Context States
  const [defaultAppUrl, setDefaultAppUrl] = useState('');
  const [defaultUsername, setDefaultUsername] = useState('');
  const [defaultPassword, setDefaultPassword] = useState('');
  const [reqDocFile, setReqDocFile] = useState<{ name: string; content: string; size: number; fileId?: string } | null>(null);
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [videoData, setVideoData] = useState<VideoWalkthroughData | null>(null);
  const [isExtractingVideo, setIsExtractingVideo] = useState(false);
  const [visualInputMode, setVisualInputMode] = useState<'screenshots' | 'video'>('screenshots');
  const [focusDirectives, setFocusDirectives] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisStep, setSynthesisStep] = useState('');

  // Check if user has uploaded an input (screenshots, video, or requirements document)
  const hasUploadedInput = useMemo(() => {
    if (isExtractingVideo) return false;
    const hasScreenshots = Array.isArray(screenshots) && screenshots.length > 0;
    const hasVideo = Boolean(videoData && Array.isArray(videoData.frames) && videoData.frames.length > 0);
    const hasDoc = Boolean(reqDocFile && (reqDocFile.content || reqDocFile.name));
    return Boolean(hasScreenshots || hasVideo || hasDoc);
  }, [screenshots, videoData, reqDocFile, isExtractingVideo]);

  // File Upload Refs
  const docInputRef = useRef<HTMLInputElement>(null);
  const excelUploadRef = useRef<HTMLInputElement>(null);
  const imagesUploadRef = useRef<HTMLInputElement>(null);

  // Keyframe Inspector Modal State
  const [previewFrameModal, setPreviewFrameModal] = useState<{
    isOpen: boolean;
    frames: Array<{ timestamp?: string; image?: string; frameIndex?: number; isBlank?: boolean }>;
    currentFrameIndex: number;
    title: string;
    videoFileName?: string;
  }>({
    isOpen: false,
    frames: [],
    currentFrameIndex: 0,
    title: '',
    videoFileName: ''
  });

  // Paste Screenshot Modal State
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);

  // Add / Edit Folder Modal State
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderModule, setNewFolderModule] = useState('');

  // Delete Folder State
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<TestScenario | null>(null);

  // Edit Folder State
  const [editingFolderTarget, setEditingFolderTarget] = useState<TestScenario | null>(null);
  const [editFolderTitle, setEditFolderTitle] = useState('');
  const [editFolderModule, setEditFolderModule] = useState('');

  // Move to Folder / Scenario Modal State
  const [isMoveToFolderModalOpen, setIsMoveToFolderModalOpen] = useState(false);
  const [moveTargetScenarioId, setMoveTargetScenarioId] = useState<string>('');
  const [moveFolderMode, setMoveFolderMode] = useState<'existing' | 'new'>('existing');
  const [moveFolderNewName, setMoveFolderNewName] = useState('');
  const [moveFolderNewModule, setMoveFolderNewModule] = useState('');

  // Add / Edit Case Modal State
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<{ scenarioId: string; testCase: TestCase } | null>(null);
  const [caseFormScenarioId, setCaseFormScenarioId] = useState<string>('');
  const [caseForm, setCaseForm] = useState<Partial<TestCase>>({
    title: '',
    steps: [''],
    expectedResult: '',
    status: TestStatus.NOT_EXECUTED,
    isApproved: false,
    testType: TestType.FUNCTIONAL,
    testIntent: TestIntent.POSITIVE,
    priority: TestPriority.MEDIUM,
    testDataSets: ['', '']
  });

  // Delete Case modal
  const [deleteTarget, setDeleteTarget] = useState<{ scenarioId: string; testCaseId: string; title: string } | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  // Jira bug modal
  const [jiraModalCase, setJiraModalCase] = useState<TestCase | null>(null);

  // Generate AI Test Cases for selected scenario(s) modal states
  const [scenariosForGenerateModal, setScenariosForGenerateModal] = useState<TestScenario[] | null>(null);
  const [generateDirectives, setGenerateDirectives] = useState<string>('');
  const [isModalGenerating, setIsModalGenerating] = useState<boolean>(false);
  const [generatingCurrentIndex, setGeneratingCurrentIndex] = useState<number>(0);

  // Save Generated AI Test Cases into Folder Modal State
  const [saveGeneratedCasesModal, setSaveGeneratedCasesModal] = useState<{
    isOpen: boolean;
    cases: TestCase[];
    sourceTitle: string;
    sourceScenarioId?: string;
    sourceScenarioIds?: string[];
    folderMode: 'existing' | 'new';
    selectedFolderId: string;
    newFolderName: string;
    newFolderModule: string;
    previewExpanded?: boolean;
    videoData?: VideoWalkthroughData | {
      fileName: string;
      fileSize?: number;
      duration?: number;
      frames?: any[];
      videoUrl?: string;
      file?: File;
      videoBlob?: any;
    } | null;
  } | null>(null);
  const [isSavingGeneratedCases, setIsSavingGeneratedCases] = useState<boolean>(false);

  // Select / Create Script Generator Folder on Test Case Approval Modal State
  const [approveScriptModal, setApproveScriptModal] = useState<{
    isOpen: boolean;
    targetType: 'single' | 'bulk' | 'folder' | 'scenario';
    folderId?: string;
    testCases: TestCase[];
    sourceTitle: string;
    folderMode: 'existing' | 'new';
    selectedFolderId: string;
    selectedFolderName: string;
    newFolderName: string;
    newFolderDescription?: string;
  } | null>(null);

  // Helper to parse steps from scenario description
  const helperParseSteps = (desc?: string): string[] => {
    const cleanDesc = (desc || '').trim();
    if (!cleanDesc) return ['Execute scenario verification steps.'];
    const lines = cleanDesc.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const numberedMatches = lines.filter(l => /^\d+[\.\)]\s*/.test(l));
    if (numberedMatches.length > 1) {
      return numberedMatches.map(l => l.replace(/^\d+[\.\)]\s*/, '').trim());
    } else if (lines.length > 1) {
      return lines.map(l => l.replace(/^[-*•]\s*/, '').trim());
    }
    
    // Check if inline numbered steps exist (e.g., "1. Open app 2. Enter credentials")
    const inlineNumbered = cleanDesc.split(/(?:^|\s+)(?:\d+[\.\)]|Step\s*\d+:?)\s+/i).map(s => s.trim()).filter(Boolean);
    if (inlineNumbered.length > 1) {
      return inlineNumbered;
    }

    // Check if separated by semicolons
    const semicolonParts = cleanDesc.split(/;\s+/).map(s => s.trim()).filter(Boolean);
    if (semicolonParts.length > 1) {
      return semicolonParts;
    }

    // If multiple sentences, split cleanly so it doesn't display as a single dense paragraph
    const sentenceParts = cleanDesc.split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 10);
    if (sentenceParts.length > 1) {
      return sentenceParts;
    }

    return [cleanDesc];
  };

  // Reset generation inputs when switching project
  useEffect(() => {
    setScreenshots([]);
    setVideoData(null);
    setReqDocFile(null);
    setFocusDirectives('');
  }, [project?.id]);

  // Helper to identify folders specific to AI Test Cases
  const isTestCaseFolder = useCallback((s: TestScenario): boolean => {
    if (!s) return false;
    // Strictly exclude folders created in other modules (Manual Testing, API Testing, Script Generator)
    if (s.scenarioId === 'MANUAL_FOLDER' || s.scenarioId === 'SCRIPT_GENERATOR_FOLDER') return false;
    if (s.folderType === 'manual' || s.folderType === 'script_generator') return false;
    if (s.moduleName === 'Script Generator') return false;
    if (isApiTestingScenario(s)) return false;
    if (s.moduleName === 'API Testing' || s.isApiScenario) return false;
    if (typeof s.scenarioId === 'string' && s.scenarioId.startsWith('API-')) return false;

    // Explicit testcase folders created in AI Test Cases
    if (s.scenarioId === 'TESTCASE_FOLDER' || (s.isFolder && s.folderType === 'testcase')) {
      return true;
    }

    // Include scenario folders from AI Scenarios ONLY if they have direct test cases or member scenarios that have test cases not assigned to another folder
    if (s.isFolder && (s.scenarioId === 'SCENARIO_FOLDER' || s.folderType === 'scenario')) {
      const hasDirectCases = Array.isArray(s.testCases) && s.testCases.length > 0;
      const hasUnassignedMembers = Array.isArray(s.memberScenarioIds) && s.memberScenarioIds.some(mId => {
        const member = (project.scenarios || []).find(sc => sc.id === mId || sc.scenarioId === mId);
        return member && !member.testCaseFolderId && Array.isArray(member.testCases) && member.testCases.length > 0;
      });
      return hasDirectCases || hasUnassignedMembers;
    }

    return false;
  }, [isApiTestingScenario, project.scenarios]);

  // Helper to identify any structural folder across all modules (used to exclude folders from being treated as individual test scenarios)
  const isAnyFolder = useCallback((s: TestScenario): boolean => {
    if (!s) return false;
    return Boolean(
      s.isFolder ||
      s.scenarioId === 'TESTCASE_FOLDER' ||
      s.scenarioId === 'SCENARIO_FOLDER' ||
      s.scenarioId === 'MANUAL_FOLDER' ||
      (typeof s.scenarioId === 'string' && s.scenarioId.endsWith('_FOLDER'))
    );
  }, []);

  const isStructuralScenario = useCallback((s: TestScenario): boolean => {
    if (!s) return false;
    return isAnyFolder(s) || s.scenarioId === 'INPUT_SOURCE';
  }, [isAnyFolder]);

  // Helper to resolve test cases from a single scenario - only returns test cases when actually generated
  const getScenarioCases = useCallback((scen: TestScenario): TestCase[] => {
    if (isApiTestingScenario(scen) || isStructuralScenario(scen)) {
      return [];
    }
    // Only return actual test cases if they have been generated
    if (scen.testCases && scen.testCases.length > 0) {
      const nonApiCases = scen.testCases.filter(tc => !isApiTestingCase(tc));
      // Exclude legacy synthetic placeholder if it was saved directly
      const realCases = nonApiCases.filter(tc => {
        if (tc.source === 'ai_synthesis' || tc.source === 'manual_import') return true;
        if (tc.id === `TC-${scen.id}` && tc.title === scen.title) return false;
        return true;
      });
      return realCases;
    }
    return [];
  }, [isStructuralScenario, isApiTestingScenario]);

  // Helper to resolve all test cases in a folder (direct + member scenarios)
  const getFolderCases = useCallback((folder: TestScenario, allScenarios: TestScenario[]): TestCase[] => {
    if (isApiTestingScenario(folder)) {
      return [];
    }
    const directCases = ((folder.testCases || []).length > 0 ? (folder.testCases || []) : []).filter(tc => !isApiTestingCase(tc));
    const memberIds = new Set(folder.memberScenarioIds || []);
    const folderTitle = (folder.title || '').trim().toLowerCase();
    
    const memberScenarios = allScenarios.filter(s => 
      (
        (s as any).testCaseFolderId === folder.id ||
        (!s.testCaseFolderId && (
          memberIds.has(s.id) || 
          (Array.isArray(folder.memberScenarioIds) && s.scenarioId && folder.memberScenarioIds.includes(s.scenarioId))
        ))
      ) &&
      !isStructuralScenario(s) &&
      !isApiTestingScenario(s)
    );

    const memberCases: TestCase[] = [];
    memberScenarios.forEach(ms => {
      memberCases.push(...getScenarioCases(ms));
    });

    const combined: TestCase[] = [];
    const seenIds = new Set<string>();
    const seenCaseIds = new Set<string>();
    const seenTitles = new Set<string>();

    const addCase = (c: TestCase) => {
      if (!c) return;
      const idKey = c.id ? c.id.trim() : '';
      const tcIdKey = c.testCaseId ? c.testCaseId.trim().toLowerCase() : '';
      const titleKey = c.title ? c.title.trim().toLowerCase() : '';

      if (idKey && seenIds.has(idKey)) return;
      if (tcIdKey && seenCaseIds.has(tcIdKey)) return;
      if (titleKey && seenTitles.has(titleKey)) return;

      if (idKey) seenIds.add(idKey);
      if (tcIdKey) seenCaseIds.add(tcIdKey);
      if (titleKey) seenTitles.add(titleKey);
      combined.push(c);
    };

    directCases.forEach(addCase);
    memberCases.forEach(addCase);

    return combined;
  }, [getScenarioCases, isStructuralScenario]);

  // Helper to determine if a scenario or its generated test cases are saved under any test case folder
  const isScenarioSavedUnderFolder = useCallback((scen: TestScenario, folders: TestScenario[]): boolean => {
    if (!scen || !folders || folders.length === 0) return false;

    // Check strictly within test case folders (folders created in AI Test Cases)
    for (const folder of folders) {
      const folderTitle = (folder.title || '').trim().toLowerCase();
      // Direct link to this test case folder
      if (scen.folderId && (scen.folderId === folder.id || (folderTitle && scen.folderId.trim().toLowerCase() === folderTitle))) {
        return true;
      }
      if (scen.folderName && folderTitle && scen.folderName.trim().toLowerCase() === folderTitle) {
        return true;
      }
      // Direct membership in test case folder
      if (folder.memberScenarioIds && (folder.memberScenarioIds.includes(scen.id) || (scen.scenarioId && folder.memberScenarioIds.includes(scen.scenarioId)))) {
        return true;
      }

      // Check if this test case folder holds test cases generated from or belonging to this scenario
      const folderCases = folder.testCases || [];
      if (folderCases.length > 0) {
        const hasGeneratedCases = folderCases.some(tc => {
          if (!tc) return false;
          // Match by ID
          if (tc.id === `TC-${scen.id}` || tc.id === scen.id) return true;
          if (typeof tc.id === 'string' && tc.id.startsWith(`TC-${scen.id}-`)) return true;
          // Match by scenarioId
          if (scen.scenarioId) {
            const cleanScenId = scen.scenarioId.replace(/^TS-|^SC-/, '');
            if (tc.testCaseId === `TC-${scen.scenarioId}` || tc.testCaseId === `TC-${cleanScenId}`) return true;
            if (typeof tc.testCaseId === 'string' && (
              tc.testCaseId.startsWith(`TC-${scen.scenarioId}-`) || 
              tc.testCaseId.startsWith(`TC-${cleanScenId}-`)
            )) {
              return true;
            }
          }
          return false;
        });
        if (hasGeneratedCases) return true;

        // Match if the folder was generated specifically for this scenario
        const folderTitle = (folder.title || '').trim().toLowerCase();
        const scenTitle = (scen.title || '').trim().toLowerCase();
        if (folderTitle && scenTitle && folderTitle === scenTitle) {
          return true;
        }
        if (folder.description && scen.title && folder.description.includes(scen.title)) {
          return true;
        }
      }
    }

    return false;
  }, []);

  // Folders available in AI Test Cases (deduplicated by normalized title)
  const testCaseFolders = useMemo(() => {
    const rawFolders = (project.scenarios || []).filter(isTestCaseFolder);
    const seenTitles = new Map<string, TestScenario>();
    const result: TestScenario[] = [];

    for (const folder of rawFolders) {
      const normTitle = (folder.title || '').trim().toLowerCase();
      if (!normTitle) {
        result.push(folder);
        continue;
      }
      if (seenTitles.has(normTitle)) {
        // Merge into existing folder
        const existing = seenTitles.get(normTitle)!;
        const mergedMembers = Array.from(new Set([...(existing.memberScenarioIds || []), ...(folder.memberScenarioIds || [])]));
        existing.memberScenarioIds = mergedMembers;
        const existingCaseIds = new Set((existing.testCases || []).map(c => c.id));
        const extraCases = (folder.testCases || []).filter(c => !existingCaseIds.has(c.id));
        if (extraCases.length > 0) {
          existing.testCases = [...(existing.testCases || []), ...extraCases];
        }
        if (folder.scenarioId === 'TESTCASE_FOLDER' && existing.scenarioId !== 'TESTCASE_FOLDER') {
          existing.scenarioId = 'TESTCASE_FOLDER';
          existing.folderType = 'testcase';
        }
      } else {
        seenTitles.set(normTitle, folder);
        result.push(folder);
      }
    }
    return result;
  }, [project.scenarios, isTestCaseFolder]);

  // Script Generator folders list (derived from automationFolders, script_generator scenario folders, and test cases)
  const scriptGeneratorFolders = useMemo(() => {
    const foldersMap = new Map<string, { id: string; name: string; count: number }>();

    // 1. From project.automationFolders
    (project.automationFolders || []).filter(f => !f.isImported).forEach(f => {
      if (f.name && f.name.trim()) {
        foldersMap.set(f.name.trim().toLowerCase(), {
          id: f.id || `folder-${f.name.trim().toLowerCase().replace(/\s+/g, '-')}`,
          name: f.name.trim(),
          count: 0
        });
      }
    });

    // 2. From project.scenarios where folderType === 'script_generator' or scenarioId === 'SCRIPT_GENERATOR_FOLDER'
    (project.scenarios || []).forEach(s => {
      if ((s.folderType === 'script_generator' || s.scenarioId === 'SCRIPT_GENERATOR_FOLDER') && s.title) {
        const key = s.title.trim().toLowerCase();
        const existing = foldersMap.get(key);
        const count = (s.testCases || []).length;
        if (existing) {
          existing.count = Math.max(existing.count, count);
        } else {
          foldersMap.set(key, {
            id: s.id,
            name: s.title.trim(),
            count
          });
        }
      }
    });

    // 3. From test cases that have scriptGeneratorFolderName
    (project.scenarios || []).forEach(s => {
      (s.testCases || []).forEach(tc => {
        if (tc.scriptGeneratorFolderName && tc.scriptGeneratorFolderName.trim()) {
          const key = tc.scriptGeneratorFolderName.trim().toLowerCase();
          const existing = foldersMap.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            foldersMap.set(key, {
              id: tc.scriptGeneratorFolderId || `folder-${key.replace(/\s+/g, '-')}`,
              name: tc.scriptGeneratorFolderName.trim(),
              count: 1
            });
          }
        }
      });
    });

    const seenIds = new Set<string>();
    return Array.from(foldersMap.values()).map(f => {
      let fid = f.id;
      if (!fid || seenIds.has(fid)) {
        fid = generateUniqueFolderId('folder');
      }
      seenIds.add(fid);
      return { ...f, id: fid };
    });
  }, [project.automationFolders, project.scenarios]);

  // Set of all test case IDs and testCaseIds currently saved inside any test case folder
  const folderTestCaseIds = useMemo(() => {
    const ids = new Set<string>();
    testCaseFolders.forEach(folder => {
      // 1. Direct test cases inside folder
      (folder.testCases || []).forEach(tc => {
        if (tc.id) ids.add(tc.id);
        if (tc.testCaseId) ids.add(tc.testCaseId.toLowerCase().trim());
      });
      // 2. Member scenario test cases inside folder
      const memberIds = new Set(folder.memberScenarioIds || []);
      (project.scenarios || []).forEach(s => {
        if (
          (s.testCaseFolderId === folder.id || memberIds.has(s.id) || (s.scenarioId && folder.memberScenarioIds?.includes(s.scenarioId))) &&
          s.testCases && s.testCases.length > 0
        ) {
          s.testCases.forEach(tc => {
            if (tc.id) ids.add(tc.id);
            if (tc.testCaseId) ids.add(tc.testCaseId.toLowerCase().trim());
          });
        }
      });
    });
    return ids;
  }, [testCaseFolders, project.scenarios]);

  // Set of all scenario IDs that currently belong to any test case folder
  const folderScenarioIds = useMemo(() => {
    const ids = new Set<string>();
    const folderIdSet = new Set(testCaseFolders.map(f => f.id));
    testCaseFolders.forEach(folder => {
      if (Array.isArray(folder.memberScenarioIds)) {
        folder.memberScenarioIds.forEach(id => {
          if (id) ids.add(id);
        });
      }
    });
    (project.scenarios || []).forEach(s => {
      if (!s.isFolder && (
        (s.testCaseFolderId && folderIdSet.has(s.testCaseFolderId)) ||
        (s.folderId && folderIdSet.has(s.folderId))
      )) {
        if (s.id) ids.add(s.id);
        if (s.scenarioId) ids.add(s.scenarioId);
      }
    });
    return ids;
  }, [testCaseFolders, project.scenarios]);

  // Auto-heal / normalize legacy folders, duplicate folders, and restore individual scenario states
  useEffect(() => {
    if (!project?.scenarios || project.scenarios.length === 0) return;
    let hasChanges = false;
    const deleted = getDeletedIds();

    const cleaned = project.scenarios.map(s => {
      // 1. Scenarios belonging to a test case folder must be marked isRemovedFromIndividual: true
      const belongsToFolder = !s.isFolder && (
        folderScenarioIds.has(s.id) ||
        (s.scenarioId && folderScenarioIds.has(s.scenarioId)) ||
        (s.testCaseFolderId && testCaseFolders.some(f => f.id === s.testCaseFolderId)) ||
        (s.folderId && testCaseFolders.some(f => f.id === s.folderId))
      );

      if (belongsToFolder && !s.isRemovedFromIndividual) {
        hasChanges = true;
        return {
          ...s,
          isRemovedFromIndividual: true
        };
      }

      // 2. Scenarios not belonging to any folder and not deleted: restore if approved and was mistakenly marked removed
      if (!s.isFolder && !belongsToFolder && !s.testCaseFolderId && !s.folderId && s.isApproved && !isStructuralScenario(s) && s.isRemovedFromIndividual && !deleted.has(s.id)) {
        hasChanges = true;
        return {
          ...s,
          isRemovedFromIndividual: false
        };
      }

      // 3. Legacy scenario folder normalization
      if (
        s.isFolder &&
        s.scenarioId === 'TESTCASE_FOLDER' &&
        s.memberScenarioIds &&
        s.memberScenarioIds.length > 0 &&
        (!s.testCases || s.testCases.length === 0)
      ) {
        hasChanges = true;
        return {
          ...s,
          scenarioId: 'SCENARIO_FOLDER',
          moduleName: 'AI SCENARIOS'
        };
      }
      return s;
    });

    if (hasChanges) {
      onUpdateProject({ ...project, scenarios: cleaned });
    }
  }, [project, onUpdateProject, isStructuralScenario, folderScenarioIds, testCaseFolders]);

  // Approved scenarios available in AI Test Cases INDIVIDUAL view (all approved non-structural scenarios that do NOT belong to a folder)
  const approvedScenarios = useMemo(() => {
    const deleted = getDeletedIds();
    return (project.scenarios || []).filter(s => 
      !isStructuralScenario(s) &&
      Boolean(s.isApproved) &&
      !isApiTestingScenario(s) &&
      !deleted.has(s.id) &&
      !s.isRemovedFromIndividual &&
      !folderScenarioIds.has(s.id) &&
      !(s.scenarioId && folderScenarioIds.has(s.scenarioId)) &&
      !(s.testCaseFolderId && testCaseFolders.some(f => f.id === s.testCaseFolderId)) &&
      !(s.folderId && testCaseFolders.some(f => f.id === s.folderId))
    );
  }, [project.scenarios, isStructuralScenario, isApiTestingScenario, folderScenarioIds, testCaseFolders]);

  // Active scenarios for test case management (non-folder scenarios)
  const validScenarios = useMemo(() => {
    return (project.scenarios || []).filter(s => 
      !isStructuralScenario(s) &&
      !isApiTestingScenario(s)
    );
  }, [project.scenarios, isStructuralScenario]);

  // Flattened list of test cases for INDIVIDUAL APPROVED SCENARIOS view
  const individualCasesWithScenario = useMemo(() => {
    const list: Array<{ scenario: TestScenario; testCase: TestCase }> = [];
    const seenCaseKeys = new Set<string>();

    // Include cases from all individual approved scenarios
    approvedScenarios.forEach(scen => {
      if (isApiTestingScenario(scen)) return;
      const scenarioCases = getScenarioCases(scen);
      scenarioCases.forEach(tc => {
        if (isApiTestingCase(tc)) return;

        const uniqueKey = tc.id || tc.testCaseId || `${scen.id}_${tc.title}`;
        if (!seenCaseKeys.has(uniqueKey)) {
          seenCaseKeys.add(uniqueKey);
          list.push({ scenario: scen, testCase: tc });
        }
      });
    });

    return list;
  }, [approvedScenarios, getScenarioCases, isApiTestingScenario, isApiTestingCase]);

  // Flattened list of test cases with scenario metadata across ALL test case folders and approved scenarios
  // Uses unified getAiTestCasesWithScenario so it strictly matches the Dashboard calculation
  const allCasesWithScenario = useMemo(() => {
    return getAiTestCasesWithScenario(project);
  }, [project]);

  // Filtered test cases for INDIVIDUAL SCENARIOS view (only shows approved scenario test cases)
  // Robust matcher for single test case across all attributes
  const isTestCaseMatching = useCallback((tc: TestCase, query: string): boolean => {
    if (!tc || !query) return false;
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return Boolean(
      (tc.testCaseId || '').toLowerCase().includes(q) ||
      (tc.title || '').toLowerCase().includes(q) ||
      (tc.expectedResult || '').toLowerCase().includes(q) ||
      (tc.testType || '').toLowerCase().includes(q) ||
      (tc.testIntent || '').toLowerCase().includes(q) ||
      (tc.priority || '').toLowerCase().includes(q) ||
      (Array.isArray(tc.steps) && tc.steps.some(s => String(s || '').toLowerCase().includes(q)))
    );
  }, []);

  // Robust matcher for scenario metadata
  const isScenarioMatching = useCallback((scen: TestScenario, query: string): boolean => {
    if (!scen || !query) return false;
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return Boolean(
      (scen.title || '').toLowerCase().includes(q) ||
      (scen.scenarioId || '').toLowerCase().includes(q) ||
      (scen.description || '').toLowerCase().includes(q) ||
      (scen.moduleName || '').toLowerCase().includes(q) ||
      (scen.userStorySummary || '').toLowerCase().includes(q) ||
      (scen.userStoryNumber || '').toLowerCase().includes(q) ||
      (scen.expectedResults || '').toLowerCase().includes(q)
    );
  }, []);

  // Filtered test cases for INDIVIDUAL SCENARIOS view (only shows approved scenario test cases)
  const filteredCases = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const pool = q
      ? (project.scenarios || []).filter(s => 
          !isStructuralScenario(s) &&
          Boolean(s.isApproved) &&
          !isApiTestingScenario(s) &&
          !getDeletedIds().has(s.id)
        )
      : approvedScenarios;

    const validSelectedScen = pool.some(s => s.id === selectedScenarioId);

    // Build the cases list with scenario metadata on the fly if searching, otherwise use individualCasesWithScenario
    const casesPool = q
      ? (() => {
          const list: Array<{ scenario: TestScenario; testCase: TestCase }> = [];
          const seenCaseKeys = new Set<string>();
          pool.forEach(scen => {
            const scenarioCases = getScenarioCases(scen);
            scenarioCases.forEach(tc => {
              if (isApiTestingCase(tc)) return;
              const uniqueKey = tc.id || tc.testCaseId || `${scen.id}_${tc.title}`;
              if (!seenCaseKeys.has(uniqueKey)) {
                seenCaseKeys.add(uniqueKey);
                list.push({ scenario: scen, testCase: tc });
              }
            });
          });
          return list;
        })()
      : individualCasesWithScenario;

    return casesPool.filter(({ scenario, testCase }) => {
      // Scenario filter: only filter if a valid approved scenario was specifically selected
      if (selectedScenarioId !== 'ALL' && validSelectedScen && scenario.id !== selectedScenarioId) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'ALL' && testCase.status !== statusFilter) {
        return false;
      }
      // Priority filter
      if (priorityFilter !== 'ALL' && testCase.priority !== priorityFilter) {
        return false;
      }
      // Type filter
      if (typeFilter !== 'ALL' && testCase.testType !== typeFilter) {
        return false;
      }
      // Intent filter
      if (intentFilter !== 'ALL' && testCase.testIntent !== intentFilter) {
        return false;
      }
      // Search query
      if (q) {
        const inTc = isTestCaseMatching(testCase, q);
        const inScen = isScenarioMatching(scenario, q);
        if (!inTc && !inScen) {
          return false;
        }
      }
      return true;
    });
  }, [individualCasesWithScenario, approvedScenarios, project.scenarios, selectedScenarioId, statusFilter, priorityFilter, typeFilter, intentFilter, searchQuery, isTestCaseMatching, isScenarioMatching, isStructuralScenario, isApiTestingScenario, isApiTestingCase, getScenarioCases, getDeletedIds]);

  // Helper to reliably resolve User Story Summary for a scenario
  const getResolvedUserStorySummary = useCallback((scen: TestScenario): string => {
    if (scen.userStorySummary && scen.userStorySummary.trim()) {
      return scen.userStorySummary.trim();
    }
    const userStories = project.userStories || [];
    const matched = userStories.find(us => 
      (scen.userStoryNumber && (us.id === scen.userStoryNumber || (us as any).storyId === scen.userStoryNumber)) ||
      (scen.userStoryId && (us.id === scen.userStoryId || (us as any).storyId === scen.userStoryId)) ||
      (us.id === scen.id)
    );
    if (matched && matched.summary && matched.summary.trim()) {
      return matched.summary.trim();
    }
    if (scen.userStoryNumber) {
      const sibling = (project.scenarios || []).find(s => 
        s.userStoryNumber === scen.userStoryNumber && s.userStorySummary && s.userStorySummary.trim()
      );
      if (sibling && sibling.userStorySummary) {
        return sibling.userStorySummary.trim();
      }
    }
    return scen.userStoryNumber ? `User Story: ${scen.userStoryNumber}` : '';
  }, [project.userStories, project.scenarios]);

  // Group scenarios with their test cases for the INDIVIDUAL SCENARIOS view
  const groupedIndividualScenarios = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const pool = q
      ? (project.scenarios || []).filter(s => 
          !isStructuralScenario(s) &&
          Boolean(s.isApproved) &&
          !isApiTestingScenario(s) &&
          !getDeletedIds().has(s.id)
        )
      : approvedScenarios;

    const validSelectedScen = pool.some(s => s.id === selectedScenarioId);

    return pool
      .filter(scen => {
        // Scenario filter dropdown
        if (selectedScenarioId !== 'ALL' && validSelectedScen && scen.id !== selectedScenarioId) {
          return false;
        }
        // Search query
        if (q) {
          const inScenario = isScenarioMatching(scen, q);
          const cases = getScenarioCases(scen);
          const inCases = cases.some(tc => isTestCaseMatching(tc, q));
          if (!inScenario && !inCases) {
            return false;
          }
        }
        return true;
      })
      .map(scenario => {
        let cases = getScenarioCases(scenario);

        // Apply status, priority, type, intent filters to the test cases if set
        if (statusFilter !== 'ALL') {
          cases = cases.filter(tc => tc.status === statusFilter);
        }
        if (priorityFilter !== 'ALL') {
          cases = cases.filter(tc => tc.priority === priorityFilter);
        }
        if (typeFilter !== 'ALL') {
          cases = cases.filter(tc => tc.testType === typeFilter);
        }
        if (intentFilter !== 'ALL') {
          cases = cases.filter(tc => tc.testIntent === intentFilter);
        }

        // CRITICAL FIX: When search query is active, filter the test cases to matching ones (or all if only scenario title matched)
        if (q) {
          const matchingCases = cases.filter(tc => isTestCaseMatching(tc, q));
          if (matchingCases.length > 0) {
            cases = matchingCases;
          }
        }

        return {
          scenario,
          testCases: cases
        };
      });
  }, [approvedScenarios, project.scenarios, selectedScenarioId, searchQuery, statusFilter, priorityFilter, typeFilter, intentFilter, getScenarioCases, isScenarioMatching, isTestCaseMatching, isStructuralScenario, isApiTestingScenario, getDeletedIds]);

  const totalVisibleCasesCount = useMemo(() => {
    return groupedIndividualScenarios.reduce((sum, item) => sum + item.testCases.length, 0);
  }, [groupedIndividualScenarios]);

  // Selected scenarios derived from selectedScenarioIds or selectedCaseIds in the INDIVIDUAL SCENARIOS view
  const selectedScenarios = useMemo(() => {
    const scenMap = new Map<string, TestScenario>();
    // 1. Scenarios explicitly selected by checkbox
    approvedScenarios.forEach(scen => {
      if (selectedScenarioIds.has(scen.id)) {
        scenMap.set(scen.id, scen);
      }
    });
    // 2. Scenarios where at least one test case is selected
    groupedIndividualScenarios.forEach(({ scenario, testCases }) => {
      if (selectedScenarioIds.has(scenario.id) || (testCases.length > 0 && testCases.some(tc => selectedCaseIds.has(tc.id)))) {
        scenMap.set(scenario.id, scenario);
      }
    });
    return Array.from(scenMap.values());
  }, [approvedScenarios, selectedScenarioIds, groupedIndividualScenarios, selectedCaseIds]);

  // Bulk Delete Info (counts, wording, and labels for action bar and confirmation modal)
  const bulkDeleteInfo = useMemo(() => {
    if (activeView === 'scenarios') {
      if (selectedScenarioIds.size > 0) {
        const scenCount = selectedScenarioIds.size;
        const totalCasesUnderScenarios = selectedCaseIds.size;
        return {
          count: scenCount,
          itemType: scenCount === 1 ? 'scenario' : 'scenarios',
          title: `Delete Selected Scenario${scenCount > 1 ? 's' : ''}?`,
          description: `Are you sure you want to delete ${scenCount} selected scenario${scenCount > 1 ? 's' : ''}${totalCasesUnderScenarios > 0 ? ` (and ${totalCasesUnderScenarios} associated test case${totalCasesUnderScenarios > 1 ? 's' : ''})` : ''}? This action cannot be undone.`,
          buttonText: `Delete Selected (${scenCount})`
        };
      }
      const caseCount = selectedCaseIds.size;
      return {
        count: caseCount,
        itemType: caseCount === 1 ? 'test case' : 'test cases',
        title: `Delete Selected Test Case${caseCount > 1 ? 's' : ''}?`,
        description: `Are you sure you want to delete ${caseCount} selected test case${caseCount > 1 ? 's' : ''}? This action cannot be undone.`,
        buttonText: `Delete Selected (${caseCount})`
      };
    }

    // Folders view
    const caseCount = selectedCaseIds.size;
    return {
      count: caseCount,
      itemType: caseCount === 1 ? 'test case' : 'test cases',
      title: `Delete Selected Test Case${caseCount > 1 ? 's' : ''}?`,
      description: `Are you sure you want to delete ${caseCount} selected test case${caseCount > 1 ? 's' : ''}? This action cannot be undone.`,
      buttonText: `Delete Selected (${caseCount})`
    };
  }, [activeView, selectedScenarioIds, selectedCaseIds]);

  // Filtered folders for folders view (ONLY displays AI Test Cases folders)
  const filteredFolders = useMemo(() => {
    const foldersList = testCaseFolders;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return foldersList;
    return foldersList.filter(f => {
      const fCases = getFolderCases(f, project.scenarios || []);
      const folderMatches = 
        (f.title || '').toLowerCase().includes(q) ||
        (f.moduleName || '').toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q);
      const casesMatch = fCases.some(tc => isTestCaseMatching(tc, q));
      return folderMatches || casesMatch;
    });
  }, [testCaseFolders, searchQuery, getFolderCases, project.scenarios, isTestCaseMatching]);

  // Counts of matching items across views when search query is active
  const individualMatchingCasesCount = useMemo(() => {
    return groupedIndividualScenarios.reduce((sum, item) => sum + item.testCases.length, 0);
  }, [groupedIndividualScenarios]);

  const folderMatchingCasesCount = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let total = 0;
    filteredFolders.forEach(folder => {
      const fCases = getFolderCases(folder, project.scenarios || []);
      if (!q) {
        total += fCases.length;
      } else {
        const matching = fCases.filter(tc => isTestCaseMatching(tc, q));
        total += matching.length > 0 ? matching.length : fCases.length;
      }
    });
    return total;
  }, [filteredFolders, getFolderCases, project.scenarios, searchQuery, isTestCaseMatching]);

  // Auto-expand matching items and auto-collapse non-matches when search query is active
  useEffect(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      // Auto-expand all matching scenarios in Individual view
      groupedIndividualScenarios.forEach(({ scenario, testCases }) => {
        if (isScenarioMatching(scenario, q) || testCases.some(tc => isTestCaseMatching(tc, q))) {
          setCollapsedScenarioIds(prev => {
            if (prev.has(scenario.id)) {
              const next = new Set(prev);
              next.delete(scenario.id);
              return next;
            }
            return prev;
          });
          testCases.forEach(tc => {
            if (isTestCaseMatching(tc, q)) {
              setExpandedCaseIds(prev => new Set([...prev, tc.id]));
            }
          });
        }
      });

      // Auto-expand matching folders in Folders view
      filteredFolders.forEach(folder => {
        setExpandedFolderIds(prev => new Set([...prev, folder.id]));
      });
    }
  }, [searchQuery, groupedIndividualScenarios, filteredFolders, isScenarioMatching, isTestCaseMatching]);

  // Explicit Search Execution function triggered by Search button or Enter key
  const handleExecuteSearch = useCallback((customQuery?: string) => {
    const q = (customQuery !== undefined ? customQuery : searchQuery).trim();
    if (!q) {
      toast.info('Showing all test cases');
      return;
    }
    const indCount = individualMatchingCasesCount;
    const foldCount = folderMatchingCasesCount;
    const currentCount = activeView === 'scenarios' ? indCount : foldCount;

    if (currentCount === 0) {
      if (activeView === 'scenarios' && foldCount > 0) {
        setActiveView('folders');
        toast.success(`Found ${foldCount} matching test case(s) in Folders!`);
      } else if (activeView === 'folders' && indCount > 0) {
        setActiveView('scenarios');
        toast.success(`Found ${indCount} matching test case(s) in Individual Scenarios!`);
      } else {
        toast.error(`No test cases or scenarios found matching "${q}"`);
      }
    } else {
      toast.success(`Found ${currentCount} matching test case(s)`);
    }

    const targetElement = document.getElementById('test-cases-repository-view');
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchQuery, individualMatchingCasesCount, folderMatchingCasesCount, activeView]);

  // All test cases across visible filtered folders
  const allFolderCases = useMemo(() => {
    const cases: TestCase[] = [];
    const seen = new Set<string>();
    filteredFolders.forEach(folder => {
      const fCases = getFolderCases(folder, project.scenarios || []);
      fCases.forEach(tc => {
        if (!seen.has(tc.id)) {
          seen.add(tc.id);
          cases.push(tc);
        }
      });
    });
    return cases;
  }, [filteredFolders, getFolderCases, project.scenarios]);

  const isAllFolderCasesSelected = allFolderCases.length > 0 && allFolderCases.every(c => selectedCaseIds.has(c.id));
  const isSomeFolderCasesSelected = allFolderCases.some(c => selectedCaseIds.has(c.id));

  const toggleSelectAllFolderCases = () => {
    if (allFolderCases.length === 0) return;
    const next = new Set(selectedCaseIds);
    if (isAllFolderCasesSelected) {
      allFolderCases.forEach(c => next.delete(c.id));
    } else {
      allFolderCases.forEach(c => next.add(c.id));
    }
    setSelectedCaseIds(next);
  };

  const toggleSelectAllInFolder = (folderCases: TestCase[]) => {
    if (folderCases.length === 0) return;
    const next = new Set(selectedCaseIds);
    const isAllInFolder = folderCases.every(tc => next.has(tc.id));
    if (isAllInFolder) {
      folderCases.forEach(tc => next.delete(tc.id));
    } else {
      folderCases.forEach(tc => next.add(tc.id));
    }
    setSelectedCaseIds(next);
  };

  // Quick summary metrics
  const totalCount = allCasesWithScenario.length;

  // Toggle Folder expansion
  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolderIds(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  // Selection toggles
  const toggleSelectScenario = (scenId: string, cases: TestCase[] = []) => {
    const isCurrentlySelected = selectedScenarioIds.has(scenId) || (cases.length > 0 && cases.every(tc => selectedCaseIds.has(tc.id)));
    const nextScenIds = new Set(selectedScenarioIds);
    const nextCaseIds = new Set(selectedCaseIds);

    if (isCurrentlySelected) {
      nextScenIds.delete(scenId);
      cases.forEach(tc => nextCaseIds.delete(tc.id));
    } else {
      nextScenIds.add(scenId);
      cases.forEach(tc => nextCaseIds.add(tc.id));
    }
    setSelectedScenarioIds(nextScenIds);
    setSelectedCaseIds(nextCaseIds);
  };

  const toggleSelectCase = (id: string, scenId?: string, siblingCases?: TestCase[]) => {
    const nextCaseIds = new Set(selectedCaseIds);
    const isSelecting = !nextCaseIds.has(id);
    if (isSelecting) {
      nextCaseIds.add(id);
    } else {
      nextCaseIds.delete(id);
    }
    setSelectedCaseIds(nextCaseIds);

    if (scenId) {
      const nextScenIds = new Set(selectedScenarioIds);
      if (siblingCases && siblingCases.length > 0) {
        const allSelected = siblingCases.every(c => (c.id === id ? isSelecting : nextCaseIds.has(c.id)));
        if (allSelected) {
          nextScenIds.add(scenId);
        } else {
          nextScenIds.delete(scenId);
        }
      }
      setSelectedScenarioIds(nextScenIds);
    }
  };

  const toggleSelectAllVisible = () => {
    const allSelected = groupedIndividualScenarios.length > 0 && 
      groupedIndividualScenarios.every(({ scenario }) => selectedScenarioIds.has(scenario.id));
    
    const nextScenIds = new Set(selectedScenarioIds);

    if (allSelected) {
      groupedIndividualScenarios.forEach(({ scenario }) => {
        nextScenIds.delete(scenario.id);
      });
    } else {
      groupedIndividualScenarios.forEach(({ scenario }) => {
        nextScenIds.add(scenario.id);
      });
    }
    setSelectedScenarioIds(nextScenIds);
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedCaseIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedCaseIds(next);
  };

  // Toggle single approval
  const handleToggleApproval = (scenarioId: string, testCaseId: string) => {
    // 1. Locate the test case across all scenarios and folders to determine current approval state
    let targetTestCase: TestCase | null = null;
    let parentScenario: TestScenario | null = null;
    for (const scen of (project.scenarios || [])) {
      const found = (scen.testCases || []).find(c => c.id === testCaseId || c.testCaseId === testCaseId);
      if (found) {
        targetTestCase = found;
        parentScenario = scen;
        break;
      }
    }

    if (!targetTestCase) {
      const targetScen = (project.scenarios || []).find(s => s.id === scenarioId || `TC-${s.id}` === testCaseId || s.id === testCaseId);
      if (targetScen) {
        parentScenario = targetScen;
        const synthCases = getScenarioCases(targetScen);
        targetTestCase = synthCases.find(c => c.id === testCaseId || c.testCaseId === testCaseId) || synthCases[0] || null;
      }
    }

    if (!targetTestCase) {
      toast.error('Test case not found');
      return;
    }

    // If already approved, clicking unapproves the test case
    if (targetTestCase.isApproved) {
      const updatedScenarios = (project.scenarios || []).map(scen => {
        const currentCases = scen.testCases || [];
        const isMatched = currentCases.some(tc => tc.id === testCaseId || tc.testCaseId === testCaseId);

        // If this is a Script Generator folder, remove the test case from it
        if (scen.folderType === 'script_generator' || scen.scenarioId === 'SCRIPT_GENERATOR_FOLDER') {
          const filtered = currentCases.filter(tc => tc.id !== testCaseId && tc.testCaseId !== testCaseId);
          if (filtered.length !== currentCases.length) {
            return { ...scen, testCases: filtered };
          }
          return scen;
        }

        if (!isMatched && scen.id !== testCaseId && testCaseId !== `TC-${scen.id}`) {
          return scen;
        }

        const updatedCases = currentCases.map(tc => {
          if (tc.id === testCaseId || tc.testCaseId === testCaseId) {
            return {
              ...tc,
              isApproved: false,
              scriptGeneratorFolderId: undefined,
              scriptGeneratorFolderName: undefined
            };
          }
          return tc;
        });

        return {
          ...scen,
          isApproved: scen.isApproved,
          testCases: updatedCases
        };
      });

      onUpdateProject({ ...project, scenarios: updatedScenarios });
      toast.success('Test case unapproved');
      return;
    }

    // If currently unapproved: trigger Select / Create Script Generator Folder popup
    const initialMode = scriptGeneratorFolders.length > 0 ? 'existing' : 'new';
    const initialFolder = scriptGeneratorFolders[0];
    setApproveScriptModal({
      isOpen: true,
      targetType: 'single',
      folderId: scenarioId,
      testCases: [targetTestCase],
      sourceTitle: targetTestCase.title || 'Test Case',
      folderMode: initialMode,
      selectedFolderId: initialFolder ? initialFolder.id : '',
      selectedFolderName: initialFolder ? initialFolder.name : '',
      newFolderName: targetTestCase.title ? `${targetTestCase.title.slice(0, 30).trim()} Scripts` : '',
      newFolderDescription: ''
    });
  };

  // Toggle folder-level approval
  const handleToggleFolderApproval = (folderId: string) => {
    const targetFolder = (project.scenarios || []).find(s => s.id === folderId);
    if (!targetFolder) return;

    if (targetFolder.isApproved) {
      // Unapprove folder and member test cases
      const memberIds = new Set(targetFolder.memberScenarioIds || []);
      const folderTitle = (targetFolder.title || '').trim().toLowerCase();
      const targetSgFolderId = (targetFolder as any).scriptGeneratorFolderId;
      const targetSgFolderName = ((targetFolder as any).scriptGeneratorFolderName || '').trim().toLowerCase();

      const updatedScenarios = (project.scenarios || []).map(scen => {
        // If this is the Script Generator folder corresponding to targetFolder, unapprove it too
        if (scen.folderType === 'script_generator' || scen.scenarioId === 'SCRIPT_GENERATOR_FOLDER') {
          if (
            (targetSgFolderId && scen.id === targetSgFolderId) ||
            (targetSgFolderName && (scen.title || '').trim().toLowerCase() === targetSgFolderName)
          ) {
            return {
              ...scen,
              isApproved: false,
              testCases: (scen.testCases || []).map(tc => ({
                ...tc,
                isApproved: false,
                scriptGeneratorFolderId: undefined,
                scriptGeneratorFolderName: undefined
              }))
            };
          }
        }

        const isTarget = scen.id === folderId;
        const isMember = 
          memberIds.has(scen.id) ||
          scen.folderId === folderId ||
          (scen.folderId && folderTitle && scen.folderId.trim().toLowerCase() === folderTitle) ||
          (scen.folderName && folderTitle && scen.folderName.trim().toLowerCase() === folderTitle) ||
          (Array.isArray(targetFolder.memberScenarioIds) && scen.scenarioId && targetFolder.memberScenarioIds.includes(scen.scenarioId));

        if (isTarget || isMember) {
          const updatedCases = (scen.testCases || []).map(tc => ({
            ...tc,
            isApproved: false,
            scriptGeneratorFolderId: undefined,
            scriptGeneratorFolderName: undefined
          }));
          return {
            ...scen,
            isApproved: false,
            scriptGeneratorFolderId: undefined,
            scriptGeneratorFolderName: undefined,
            testCases: updatedCases
          };
        }
        return scen;
      });

      onUpdateProject({ ...project, scenarios: updatedScenarios });
      toast.success(`Folder "${targetFolder.title}" unapproved`);
      return;
    }

    // Trigger popup for all test cases inside the folder
    const folderCases = getFolderCases(targetFolder, project.scenarios || []);
    if (folderCases.length === 0) {
      toast.error('This folder has no test cases to approve');
      return;
    }

    const initialMode = scriptGeneratorFolders.length > 0 ? 'existing' : 'new';
    const initialFolder = scriptGeneratorFolders[0];
    setApproveScriptModal({
      isOpen: true,
      targetType: 'folder',
      folderId: folderId,
      testCases: folderCases,
      sourceTitle: `Folder: ${targetFolder.title}`,
      folderMode: initialMode,
      selectedFolderId: initialFolder ? initialFolder.id : '',
      selectedFolderName: initialFolder ? initialFolder.name : '',
      newFolderName: targetFolder.title ? `${targetFolder.title} Suite` : '',
      newFolderDescription: targetFolder.description || ''
    });
  };

  // Toggle scenario-level approval for Script Generator
  const handleToggleScenarioApproval = (scenarioId: string) => {
    const targetScenario = (project.scenarios || []).find(s => s.id === scenarioId);
    if (!targetScenario) return;

    const synthCases = getScenarioCases(targetScenario);
    const targetCases = (targetScenario.testCases && targetScenario.testCases.length > 0) ? targetScenario.testCases : synthCases;
    const isAllApproved = targetCases.length > 0 && targetCases.every(tc => Boolean(tc.isApproved));

    if (isAllApproved) {
      // Unapprove scenario and its test cases from Script Generator
      const caseIdSet = new Set(targetCases.map(c => c.id));
      const testCaseIdSet = new Set(targetCases.filter(c => c.testCaseId).map(c => c.testCaseId!.toLowerCase()));

      const updatedScenarios = (project.scenarios || []).map(scen => {
        // If this is a Script Generator folder, remove this scenario's cases from it
        if (scen.folderType === 'script_generator' || scen.scenarioId === 'SCRIPT_GENERATOR_FOLDER') {
          const remainingCases = (scen.testCases || []).filter(
            tc => !caseIdSet.has(tc.id) && !(tc.testCaseId && testCaseIdSet.has(tc.testCaseId.toLowerCase()))
          );
          if (remainingCases.length !== (scen.testCases || []).length) {
            return { ...scen, testCases: remainingCases };
          }
          return scen;
        }

        if (scen.id === scenarioId) {
          const updatedCases = targetCases.map(tc => ({
            ...tc,
            isApproved: false,
            scriptGeneratorFolderId: undefined,
            scriptGeneratorFolderName: undefined
          }));
          return {
            ...scen,
            isApproved: true, // Retain scenario in AI Test Cases
            scriptGeneratorFolderId: undefined,
            scriptGeneratorFolderName: undefined,
            testCases: updatedCases
          };
        }
        return scen;
      });

      onUpdateProject({ ...project, scenarios: updatedScenarios });
      toast.success(`Scenario "${targetScenario.title}" unapproved from Script Generator`);
      return;
    }

    // If not all approved, open approval popup
    handleApproveScenarioCasesToScripts(targetScenario);
  };

  // Approve all test cases of a scenario to Script Generator
  const handleApproveScenarioCasesToScripts = (scen: TestScenario) => {
    const cases = getScenarioCases(scen);
    if (!cases || cases.length === 0) {
      toast.error('No test cases to approve for this scenario');
      return;
    }
    const allApproved = cases.every(c => Boolean(c.isApproved));
    if (allApproved) {
      handleToggleScenarioApproval(scen.id);
      return;
    }

    const defaultExisting = scriptGeneratorFolders.find(
      f => f.name.toLowerCase() === (scen.folderName || scen.title).toLowerCase()
    ) || scriptGeneratorFolders[0];
    const defaultFolderName = scen.folderName || scen.title || 'Scenario Suite';

    setApproveScriptModal({
      isOpen: true,
      targetType: 'scenario',
      folderId: scen.id,
      testCases: cases,
      sourceTitle: scen.title,
      folderMode: defaultExisting ? 'existing' : 'new',
      selectedFolderId: defaultExisting ? defaultExisting.id : '',
      selectedFolderName: defaultExisting ? defaultExisting.name : '',
      newFolderName: defaultFolderName,
      newFolderDescription: `Automated test scripts for ${defaultFolderName}`
    });
  };

  // Bulk Approve - triggers Select / Create Script Generator Folder modal
  const handleBulkApprove = () => {
    if (selectedCaseIds.size === 0) {
      toast.error('Please select at least one test case to approve');
      return;
    }

    const selectedIds = new Set(selectedCaseIds);
    const selectedCases: TestCase[] = [];
    const seenIds = new Set<string>();

    (project.scenarios || []).forEach(scen => {
      const isFolderSelected = selectedIds.has(scen.id) || selectedIds.has(`TC-${scen.id}`);
      (scen.testCases || []).forEach(tc => {
        const isCaseSelected = selectedIds.has(tc.id) || (tc.testCaseId && selectedIds.has(tc.testCaseId));
        if ((isCaseSelected || isFolderSelected) && !seenIds.has(tc.id)) {
          seenIds.add(tc.id);
          selectedCases.push(tc);
        }
      });
    });

    if (selectedCases.length === 0) {
      toast.error('No valid test cases found among the selected items');
      return;
    }

    const initialMode = scriptGeneratorFolders.length > 0 ? 'existing' : 'new';
    const initialFolder = scriptGeneratorFolders[0];
    setApproveScriptModal({
      isOpen: true,
      targetType: 'bulk',
      testCases: selectedCases,
      sourceTitle: `${selectedCases.length} Selected Test Cases`,
      folderMode: initialMode,
      selectedFolderId: initialFolder ? initialFolder.id : '',
      selectedFolderName: initialFolder ? initialFolder.name : '',
      newFolderName: '',
      newFolderDescription: ''
    });
  };

  // Confirm Approval and Assign / Link Test Cases into Script Generator Folder
  const handleConfirmApproveToScriptGenerator = async () => {
    if (!approveScriptModal) return;
    const { testCases, folderMode, selectedFolderId, selectedFolderName, newFolderName, newFolderDescription } = approveScriptModal;

    if (!testCases || testCases.length === 0) {
      toast.error('No test cases selected for approval');
      setApproveScriptModal(null);
      return;
    }

    let finalFolderId = '';
    let finalFolderName = '';

    if (folderMode === 'new') {
      const trimmedName = newFolderName.trim();
      if (!trimmedName) {
        toast.error('Please enter a folder name for Script Generator');
        return;
      }
      finalFolderName = trimmedName;
      // Check if folder with this name already exists in automationFolders
      const existingInAutomation = (project.automationFolders || []).find(
        f => f.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      finalFolderId = existingInAutomation ? existingInAutomation.id : generateUniqueFolderId('sg-folder');
    } else {
      if (!selectedFolderId && !selectedFolderName) {
        toast.error('Please select an existing Script Generator folder');
        return;
      }
      const matched = scriptGeneratorFolders.find(
        f => f.id === selectedFolderId || f.name.toLowerCase() === (selectedFolderName || '').toLowerCase()
      );
      if (matched) {
        finalFolderId = matched.id;
        finalFolderName = matched.name;
      } else {
        finalFolderId = selectedFolderId || generateUniqueFolderId('sg-folder');
        finalFolderName = selectedFolderName || 'General Scripts';
      }
    }

    const approvingCaseIdSet = new Set(testCases.map(c => c.id));

    // 1. Update test cases in ALL existing scenarios and AI Test Cases folders without removing them!
    const updatedScenarios = (project.scenarios || []).map(scen => {
      const currentCases = scen.testCases || [];
      let anyCaseChanged = false;

      const updatedCases = currentCases.map(tc => {
        if (approvingCaseIdSet.has(tc.id) || (tc.testCaseId && testCases.some(c => c.testCaseId && c.testCaseId.toLowerCase() === tc.testCaseId?.toLowerCase()))) {
          anyCaseChanged = true;
          return {
            ...tc,
            isApproved: true,
            scriptGeneratorFolderId: finalFolderId,
            scriptGeneratorFolderName: finalFolderName
          };
        }
        return tc;
      });

      // If this is the folder or scenario being approved directly
      const isTargetFolder = (approveScriptModal.targetType === 'folder' || approveScriptModal.targetType === 'scenario') && scen.id === approveScriptModal.folderId;
      const allCasesApproved = updatedCases.length > 0 && updatedCases.every(c => Boolean(c.isApproved));

      if (anyCaseChanged || isTargetFolder) {
        return {
          ...scen,
          isApproved: isTargetFolder ? true : (allCasesApproved || scen.isApproved),
          testCases: (isTargetFolder && currentCases.length === 0 && testCases.length > 0)
            ? testCases.map(tc => ({
                ...tc,
                isApproved: true,
                scriptGeneratorFolderId: finalFolderId,
                scriptGeneratorFolderName: finalFolderName
              }))
            : updatedCases,
          scriptGeneratorFolderId: isTargetFolder ? finalFolderId : (scen as any).scriptGeneratorFolderId,
          scriptGeneratorFolderName: isTargetFolder ? finalFolderName : (scen as any).scriptGeneratorFolderName
        };
      }

      return scen;
    });

    // 2. Ensure Script Generator folder exists in project.scenarios and contains the approved test cases
    const existingSgScenarioIndex = updatedScenarios.findIndex(
      s => (s.folderType === 'script_generator' || s.scenarioId === 'SCRIPT_GENERATOR_FOLDER') &&
           (s.id === finalFolderId || s.title.trim().toLowerCase() === finalFolderName.toLowerCase())
    );

    let finalScenariosList = [...updatedScenarios];

    if (existingSgScenarioIndex >= 0) {
      // Folder exists: merge new approved cases without duplicate records
      const targetSgFolder = updatedScenarios[existingSgScenarioIndex];
      const existingCases = targetSgFolder.testCases || [];
      const mergedCasesMap = new Map<string, TestCase>();
      existingCases.forEach(c => mergedCasesMap.set(c.id, c));
      testCases.forEach(tc => {
        mergedCasesMap.set(tc.id, {
          ...tc,
          isApproved: true,
          scriptGeneratorFolderId: finalFolderId,
          scriptGeneratorFolderName: finalFolderName
        });
      });
      finalScenariosList[existingSgScenarioIndex] = {
        ...targetSgFolder,
        isApproved: true,
        testCases: Array.from(mergedCasesMap.values()),
        saved: true
      };
    } else {
      // Create new Script Generator folder in project.scenarios
      const newSgScenario: TestScenario = {
        id: finalFolderId,
        scenarioId: 'SCRIPT_GENERATOR_FOLDER',
        title: finalFolderName,
        description: newFolderDescription?.trim() || `Script Generator Folder: ${finalFolderName}`,
        expectedResults: 'Execution validates requirements successfully.',
        type: 'Functional',
        isFolder: true,
        folderType: 'script_generator',
        isApproved: true,
        testCases: testCases.map(tc => ({
          ...tc,
          isApproved: true,
          scriptGeneratorFolderId: finalFolderId,
          scriptGeneratorFolderName: finalFolderName
        })),
        moduleName: 'Script Generator',
        saved: true,
        createdAt: new Date().toISOString()
      };
      finalScenariosList.push(newSgScenario);
    }

    // 3. Ensure test-case approval folders are NOT added to project.automationFolders!
    // Approved test cases move to Script Generator -> Folders (project.scenarios) ONLY.
    // They must not appear under Script Generator -> Scripts automatically until a script is actually generated/saved.
    // Clean up any stale empty automationFolders entry with this name that had 0 scripts:
    let updatedAutomationFolders = (project.automationFolders || []).filter(f => {
      const fName = (f.name || '').trim().toLowerCase();
      if (fName === finalFolderName.toLowerCase() || f.id === finalFolderId) {
        const hasScripts = (project.automationScripts || []).some(
          s => (s.folderName || '').trim().toLowerCase() === fName || s.folderId === f.id
        );
        return hasScripts;
      }
      return true;
    });

    // De-duplicate any script_generator scenario folders by normalized title
    const seenSgTitles = new Set<string>();
    finalScenariosList = finalScenariosList.filter(s => {
      if (s.folderType === 'script_generator' || s.scenarioId === 'SCRIPT_GENERATOR_FOLDER') {
        const norm = (s.title || '').trim().toLowerCase();
        if (seenSgTitles.has(norm)) return false;
        seenSgTitles.add(norm);
      }
      return true;
    });

    // De-duplicate automationFolders by normalized name
    const seenAutoNames = new Set<string>();
    updatedAutomationFolders = updatedAutomationFolders.filter(f => {
      const norm = (f.name || '').trim().toLowerCase();
      if (seenAutoNames.has(norm)) return false;
      seenAutoNames.add(norm);
      return true;
    });

    // 4. Update project state
    onUpdateProject({
      ...project,
      scenarios: finalScenariosList,
      automationFolders: updatedAutomationFolders
    });

    // 5. Clean up selection and close modal
    setSelectedCaseIds(new Set());
    setApproveScriptModal(null);

    toast.success(`Approved ${testCases.length} test case(s) and linked to Script Generator folder "${finalFolderName}"!`);
    logActivity(
      user.email,
      user.name,
      `Approved ${testCases.length} test case(s) into Script Generator folder: ${finalFolderName}`,
      project.id,
      project.name
    ).catch(() => {});

    if (onNavigateTab) {
      onNavigateTab('scripts', { folderId: finalFolderId, folderName: finalFolderName });
    }
  };

  // Bulk Delete Trigger
  const handleBulkDelete = () => {
    if (selectedCaseIds.size === 0 && selectedScenarioIds.size === 0) {
      toast.error('Please select at least one item to delete');
      return;
    }
    setIsBulkDeleteModalOpen(true);
  };

  const handleBulkDeleteConfirm = () => {
    if (selectedCaseIds.size === 0 && selectedScenarioIds.size === 0) {
      setIsBulkDeleteModalOpen(false);
      return;
    }
    const idsToDelete = new Set([...selectedCaseIds, ...selectedScenarioIds]);
    const tombstonesToAdd: string[] = Array.from(idsToDelete);

    const updatedScenarios = (project.scenarios || []).map(scen => {
      const isFolder = isAnyFolder(scen) ||
                       isTestCaseFolder(scen) ||
                       scen.scenarioId === 'SCENARIO_FOLDER' || 
                       scen.scenarioId === 'TESTCASE_FOLDER' || 
                       scen.scenarioId === 'MANUAL_FOLDER';

      if (isFolder) {
        const remainingDirectCases = (scen.testCases || []).filter(tc => !idsToDelete.has(tc.id));
        return {
          ...scen,
          testCases: remainingDirectCases
        };
      } else {
        const virtualCaseId = `TC-${scen.id}`;
        const isVirtualDeleted = idsToDelete.has(virtualCaseId) || idsToDelete.has(scen.id);
        const hadExplicitCases = scen.testCases && scen.testCases.length > 0;

        if (hadExplicitCases) {
          const remainingCases = (scen.testCases || []).filter(tc => !idsToDelete.has(tc.id));
          if (remainingCases.length === 0 || isVirtualDeleted) {
            tombstonesToAdd.push(scen.id, virtualCaseId);
            return {
              ...scen,
              testCases: [],
              isApproved: false,
              isRemovedFromIndividual: true
            };
          }
          return {
            ...scen,
            testCases: remainingCases
          };
        } else {
          // No explicit test cases - scenario was represented by virtual case
          if (isVirtualDeleted) {
            tombstonesToAdd.push(scen.id, virtualCaseId);
            return {
              ...scen,
              isApproved: false,
              isRemovedFromIndividual: true
            };
          }
          return scen;
        }
      }
    });

    // Clean up memberScenarioIds in folders if referenced scenarios were removed
    const existingActiveScenarioIds = new Set(updatedScenarios.filter(s => !s.isRemovedFromIndividual && !idsToDelete.has(s.id)).map(s => s.id));
    const finalScenarios = updatedScenarios.map(scen => {
      if (scen.memberScenarioIds && scen.memberScenarioIds.length > 0) {
        return {
          ...scen,
          memberScenarioIds: scen.memberScenarioIds.filter(id => existingActiveScenarioIds.has(id))
        };
      }
      return scen;
    });

    const tombstoneSet = new Set(tombstonesToAdd.map(t => t.toLowerCase().trim()));
    const remainingScripts = (project.automationScripts || []).filter(s => {
      if (tombstoneSet.has(s.id.toLowerCase())) return false;
      if (s.testCaseIds && s.testCaseIds.length > 0) {
        const remaining = s.testCaseIds.filter(id => !tombstoneSet.has(id.toLowerCase().trim()));
        if (remaining.length === 0) {
          tombstonesToAdd.push(s.id);
          return false;
        }
      }
      return true;
    });

    // Record all deleted IDs in tombstones
    addDeletedIds(tombstonesToAdd);

    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify({ ...project, scenarios: finalScenarios, automationScripts: remainingScripts }));
    } catch (e) {}

    onUpdateProject({ ...project, scenarios: finalScenarios, automationScripts: remainingScripts });
    const count = bulkDeleteInfo.count;
    const label = bulkDeleteInfo.itemType;
    toast.success(`Deleted ${count} ${label}`);
    setSelectedCaseIds(new Set());
    setSelectedScenarioIds(new Set());
    setIsBulkDeleteModalOpen(false);
  };

  // Export to Excel / CSV
  const handleExportExcel = async (format: 'excel' | 'csv' = 'excel') => {
    const target = selectedCaseIds.size > 0 
      ? filteredCases.filter(c => selectedCaseIds.has(c.testCase.id))
      : filteredCases;

    if (target.length === 0) {
      toast.error('No test cases available to export');
      return;
    }

    const rows = target.map(({ scenario, testCase }, idx) => ({
      '#': idx + 1,
      'Test Case ID': testCase.testCaseId || `TC-${idx + 1}`,
      'Scenario Title': scenario.title,
      'Module': scenario.moduleName || 'General',
      'Test Case Title': testCase.title,
      'Test Steps': (testCase.steps || []).join('\n'),
      'Expected Result': testCase.expectedResult,
      'Priority': testCase.priority || 'Medium',
      'Type': testCase.testType || 'Functional',
      'Intent': testCase.testIntent || 'Positive',
      'Status': testCase.status || 'NOT_EXECUTED',
      'Approved': testCase.isApproved ? 'YES' : 'NO',
      'Test Data Sets': (testCase.testDataSets || []).join(' | '),
      'Source': (testCase as any).source || (scenario.videoFileName ? 'Video Walkthrough' : 'AI Scenario')
    }));

    const filename = `${project.name.replace(/\s+/g, '_')}_AI_Test_Cases`;
    if (format === 'excel') {
      downloadExcel(rows, filename, 'AI Test Cases');
      toast.success(`Exported ${target.length} test cases to Excel`);
    } else {
      downloadCsv(rows, filename);
      toast.success(`Exported ${target.length} test cases to CSV`);
    }
  };

  // Single Folder Export
  const handleExportSingleFolder = async (folder: TestScenario, format: 'excel' | 'csv' = 'excel') => {
    const cases = getFolderCases(folder, project.scenarios || []);
    if (cases.length === 0) {
      toast.error(`Folder "${folder.title}" has no test cases to export`);
      return;
    }

    const rows = cases.map((tc, idx) => ({
      '#': idx + 1,
      'Test Case ID': tc.testCaseId || `TC-${idx + 1}`,
      'Folder / Scenario': folder.title,
      'Module': folder.moduleName || 'General',
      'Test Case Title': tc.title,
      'Test Steps': (tc.steps || []).join('\n'),
      'Expected Result': tc.expectedResult,
      'Priority': tc.priority || 'Medium',
      'Type': tc.testType || 'Functional',
      'Intent': tc.testIntent || 'Positive',
      'Status': tc.status || 'NOT_EXECUTED',
      'Approved': tc.isApproved ? 'YES' : 'NO',
      'Test Data Sets': (tc.testDataSets || []).join(' | ')
    }));

    const safeTitle = folder.title.replace(/\s+/g, '_');
    const filename = `${safeTitle}_Test_Cases`;
    if (format === 'excel') {
      downloadExcel(rows, filename, folder.title.slice(0, 30));
      toast.success(`Exported ${cases.length} test cases from "${folder.title}" to Excel`);
    } else {
      downloadCsv(rows, filename);
      toast.success(`Exported ${cases.length} test cases from "${folder.title}" to CSV`);
    }
  };

  // Single Test Case Export
  const handleExportSingleTestCase = async (
    scenarioTitle: string,
    moduleName: string,
    testCase: TestCase,
    format: 'excel' | 'csv' = 'excel',
    e?: React.MouseEvent
  ) => {
    if (e) e.stopPropagation();

    const rows = [{
      'Test Case ID': testCase.testCaseId || testCase.id,
      'Scenario / Folder': scenarioTitle,
      'Module': moduleName,
      'Test Case Title': testCase.title,
      'Test Steps': (testCase.steps || []).join('\n'),
      'Expected Result': testCase.expectedResult,
      'Priority': testCase.priority || 'Medium',
      'Type': testCase.testType || 'Functional',
      'Intent': testCase.testIntent || 'Positive',
      'Status': testCase.status || 'NOT_EXECUTED',
      'Approved': testCase.isApproved ? 'YES' : 'NO',
      'Test Data Sets': (testCase.testDataSets || []).join(' | ')
    }];

    const safeId = (testCase.testCaseId || 'TestCase').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeId}_Test_Case`;
    if (format === 'excel') {
      downloadExcel(rows, filename, 'Test Case');
      toast.success(`Test case ${testCase.testCaseId || ''} exported to Excel`);
    } else {
      downloadCsv(rows, filename);
      toast.success(`Test case ${testCase.testCaseId || ''} exported to CSV`);
    }
  };

  // Delete Folder
  const handleDeleteFolder = (folderId: string) => {
    const target = (project.scenarios || []).find(s => s.id === folderId);

    // Collect tombstones only for the folder itself and its direct test cases
    const tombstonesToAdd: string[] = [folderId];
    (target?.testCases || []).forEach(tc => {
      if (tc.id) tombstonesToAdd.push(tc.id);
    });

    const tombstonesSet = new Set(tombstonesToAdd.map(id => id.trim().toLowerCase()));

    // Automation scripts to delete if belonging directly to this folder
    const remainingScripts = (project.automationScripts || []).filter(s => {
      if (tombstonesSet.has(s.id.toLowerCase())) return false;
      if (s.folderId && (tombstonesSet.has(s.folderId.toLowerCase()) || s.folderId === folderId)) return false;
      return true;
    });

    // Automation folders to delete
    const remainingFolders = (project.automationFolders || []).filter(f => {
      if (f.id === folderId || tombstonesSet.has(f.id.toLowerCase())) return false;
      return true;
    });

    // Record tombstones to permanently prevent resurrection of this folder
    addDeletedIds(tombstonesToAdd);

    if (project?.id) {
      deleteFolderFromFirestore(project.id, folderId).catch(() => {});
      try {
        fetch(`/api/projects/${project.id}/folders/${folderId}`, { method: 'DELETE' }).catch(() => {});
      } catch (e) {}
    }

    // Remove the folder only; keep member scenarios safe by un-associating their folderId
    const updatedScenarios = (project.scenarios || [])
      .filter(s => s.id !== folderId)
      .map(s => {
        if (s.folderId === folderId || s.testCaseFolderId === folderId) {
          return { ...s, folderId: "", testCaseFolderId: "", isRemovedFromIndividual: false };
        }
        return s;
      });

    const existingDeleted = Array.isArray(project.deletedItemIds) ? project.deletedItemIds : [];
    const nextDeleted = Array.from(new Set([...existingDeleted, ...tombstonesToAdd].filter(Boolean)));

    // Clean local backup directly
    try {
      const localBackupStr = localStorage.getItem(`automatiqa_project_backup_${project.id}`);
      if (localBackupStr) {
        const localBackup = JSON.parse(localBackupStr);
        if (localBackup) {
          localBackup.scenarios = updatedScenarios;
          localBackup.automationScripts = remainingScripts;
          localBackup.automationFolders = remainingFolders;
          localBackup.deletedItemIds = nextDeleted;
          localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(localBackup));
        }
      }
    } catch (e) {}

    onUpdateProject({
      ...project,
      scenarios: updatedScenarios,
      automationScripts: remainingScripts,
      automationFolders: remainingFolders,
      deletedItemIds: nextDeleted
    });
    toast.success(`Folder "${target?.title || 'Folder'}" deleted`);
    setDeleteFolderTarget(null);
    if (selectedScenarioId === folderId) {
      setSelectedScenarioId('ALL');
    }
  };

  // Download Excel / CSV Template for Scenarios
  const handleDownloadTemplate = (format: 'excel' | 'csv' = 'excel') => {
    const templateData = [
      {
        'Scenario ID': 'TS-001',
        'Scenario Title': 'Verify successful login with valid credentials',
        'Module': 'Authentication',
        'Description': 'Test user login flow with valid registered username and password',
        'Expected Results': 'User is successfully logged in and redirected to Dashboard',
        'Priority': 'High',
        'Type': 'Functional'
      },
      {
        'Scenario ID': 'TS-002',
        'Scenario Title': 'Verify error message with invalid credentials',
        'Module': 'Authentication',
        'Description': 'Test user login flow with invalid username or password',
        'Expected Results': 'System displays "Invalid credentials" error banner',
        'Priority': 'High',
        'Type': 'Functional'
      }
    ];

    if (format === 'excel') {
      downloadExcel(templateData, 'Scenarios_Import_Template', 'Scenarios');
      toast.success('Scenarios template downloaded as Excel!');
    } else {
      downloadCsv(templateData, 'Scenarios_Import_Template');
      toast.success('Scenarios template downloaded as CSV!');
    }
  };

  // Helper to extract value from row across multiple common column names
  const getColValue = (row: any, candidates: string[]): string => {
    if (!row || typeof row !== 'object') return '';
    for (const cand of candidates) {
      if (row[cand] !== undefined && row[cand] !== null && String(row[cand]).trim() !== '') {
        return String(row[cand]).trim();
      }
    }
    const rowKeys = Object.keys(row);
    for (const cand of candidates) {
      const normCand = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const k of rowKeys) {
        const normKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normKey === normCand || normKey.includes(normCand)) {
          const val = row[k];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
          }
        }
      }
    }
    return '';
  };

  // Handle Excel/CSV Upload Import for Scenarios
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        if (!buffer) {
          toast.error('Could not read file content');
          return;
        }

        const wb = XLSX.read(new Uint8Array(buffer as ArrayBuffer), { type: 'array' });
        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          toast.error('The uploaded file contains no readable sheets');
          return;
        }

        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data || data.length === 0) {
          toast.error('The uploaded sheet is empty');
          return;
        }

        const importedScenarios: TestScenario[] = [];
        const seenKeys = new Set<string>();

        data.forEach((row, idx) => {
          let title = getColValue(row, [
            'Scenario Title', 'Scenario', 'Scenario Name', 'Test Scenario', 'Title',
            'Test Case Title', 'TestCase Title', 'Case Title', 'Test Name', 'Name',
            'Summary', 'Test Summary', 'Test Description', 'Description', 'User Story'
          ]);

          if (!title) {
            const values = Object.values(row)
              .map(v => String(v).trim())
              .filter(v => v.length >= 3 && v.length <= 250);
            if (values.length > 0) {
              title = values[0];
            }
          }

          if (!title) return;

          const customScenId = getColValue(row, [
            'Scenario ID', 'ScenarioID', 'Scenario Id', 'TS ID', 'TSID', 'Test Scenario ID',
            'ID', 'Case ID', 'Test Case ID', 'TestCase ID', 'Key'
          ]);

          const dedupKey = (customScenId || title).toLowerCase().trim();
          if (seenKeys.has(dedupKey)) {
            return;
          }
          seenKeys.add(dedupKey);

          const module = getColValue(row, ['Module', 'Module Name', 'Feature', 'Component', 'Epic', 'Area', 'Folder']) || 'General';

          const description = getColValue(row, [
            'Description', 'Scenario Description', 'Summary', 'User Story', 'Test Description'
          ]) || title;

          const expectedResult = getColValue(row, [
            'Expected Results', 'Expected Result', 'Expected Outcome', 'Expected', 'Result', 'Expected Output'
          ]) || 'Execution validates expected scenario workflow successfully.';

          const rawPriority = (getColValue(row, ['Priority', 'Severity', 'Importance']) || '').toUpperCase();
          const priority = rawPriority.includes('HIGH') || rawPriority.includes('P1') 
            ? 'High' 
            : rawPriority.includes('LOW') || rawPriority.includes('P3') 
            ? 'Low' 
            : 'Medium';

          const rawType = (getColValue(row, ['Type', 'Scenario Type', 'Test Type', 'Category']) || '').toLowerCase();
          const testType = rawType.includes('non') ? 'Non-functional' : 'Functional';

          const userStoryNumber = getColValue(row, ['User Story Number', 'User Story #', 'User Story ID', 'Story ID', 'Jira ID']);
          const userStorySummary = getColValue(row, ['User Story Summary', 'User Story Title', 'Story Summary']);

          const newScenario: TestScenario = {
            id: `scen_imp_${Date.now()}_${Math.random().toString(36).substr(2, 7)}_${idx}`,
            scenarioId: customScenId || `TS-IMP-${String(importedScenarios.length + 1).padStart(3, '0')}`,
            title: title,
            moduleName: module,
            description: description,
            expectedResults: expectedResult,
            type: testType,
            priority: priority,
            userStoryNumber: userStoryNumber || undefined,
            userStorySummary: userStorySummary || undefined,
            isApproved: true, // Marked approved so it displays in AI Test Cases -> Individual Scenarios view
            isFolder: false,
            folderId: undefined,
            testCaseFolderId: undefined,
            isRemovedFromIndividual: false,
            testCases: [], // Crucial: Do NOT auto-create test cases
            saved: true,
            createdAt: new Date().toISOString()
          };

          importedScenarios.push(newScenario);
        });

        if (importedScenarios.length === 0) {
          toast.error('No valid scenarios found in file. Please verify column headers or use the TEMPLATE.');
          return;
        }

        // Add imported scenarios directly to project without creating any folders
        const updatedScenarios = [...importedScenarios, ...(project.scenarios || [])];
        onUpdateProject({ ...project, scenarios: updatedScenarios });

        // Switch to Individual Scenarios view
        setSelectedScenarioId('ALL');
        setActiveView('scenarios');

        toast.success(`Successfully imported ${importedScenarios.length} scenario(s) under Individual Scenarios!`);
        logActivity(user?.email || 'user', user?.name || 'User', `Imported ${importedScenarios.length} scenarios from ${file.name}`, project.id, project.name).catch(() => {});
      } catch (err: any) {
        console.error('Import error:', err);
        toast.error(`Failed to parse file: ${err.message || 'Please use the provided template format.'}`);
      } finally {
        if (excelUploadRef.current) excelUploadRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Process Requirements Document File
  const processDocFile = async (file: File) => {
    if (!file) return;

    const MAX_ALLOWED_SIZE = 150 * 1024 * 1024;
    if (file.size > MAX_ALLOWED_SIZE) {
      toast.error(`Document exceeds the supported processing limit (150 MB max). Your file is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`);
      return;
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const allowed = ['txt', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'csv', 'tsv', 'md', 'json', 'log'];
    if (!allowed.includes(ext)) {
      toast.error(`Unsupported format: .${ext}. Please upload a document (.pdf, .docx, .xlsx, .txt, .csv, .md, .json).`);
      return;
    }

    try {
      logger.info('AITestCases', `Starting document upload: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`, { fileName: file.name, fileSize: file.size, fileType: ext }, 'DocUploadStart', user?.email, project.id);

      // 1. Client-side text extraction snippet for supported text files
      let extractedSnippet = '';
      if (file.size < 5 * 1024 * 1024 && ['txt', 'md', 'json', 'csv', 'tsv', 'log'].includes(ext)) {
        try {
          const text = await file.text();
          extractedSnippet = text.slice(0, 30000);
        } catch (_) {}
      }

      toast.info(`Uploading ${file.name} to server...`);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', project.id);
      formData.append('projectName', project.name || '');
      formData.append('userId', user.email || user.name);

      const res = await fetch('/api/ai/testcases/upload-file', {
        method: 'POST',
        body: formData
      });
      
      const apiRes = await parseApiResponse(res);
      if (apiRes.ok && apiRes.data?.success) {
        const data = apiRes.data;
        setReqDocFile({
          name: file.name,
          content: data.extractedSnippet || extractedSnippet || `[Durable file on server: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)]`,
          size: file.size,
          fileId: data.fileId
        });
        logger.info('AITestCases', `Document upload completed successfully: ${file.name}`, { fileId: data.fileId, size: file.size }, 'DocUploadSuccess', user?.email, project.id);
        toast.success(`Attached requirements document: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);
      } else if (extractedSnippet) {
        // Fallback to client-side extracted content if server endpoint unavailable/returned error
        setReqDocFile({
          name: file.name,
          content: extractedSnippet,
          size: file.size,
          fileId: undefined
        });
        logger.warn('AITestCases', `Server upload returned error, using client-extracted text snippet fallback for ${file.name}`, { error: apiRes.error }, 'DocUploadFallback', user?.email, project.id);
        toast.success(`Attached requirements document: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      } else {
        throw new Error(apiRes.error || 'Failed to upload document file');
      }
    } catch (uploadErr: any) {
      logger.error('AITestCases', `Document upload failed: ${uploadErr.message}`, uploadErr, 'DocUploadError', user?.email, project.id);
      console.error('Doc upload error:', uploadErr);
      toast.error(uploadErr.message || 'Failed to upload document file.');
    }
  };

  // Requirements Document Upload Handler
  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processDocFile(file);
    }
    if (docInputRef.current) docInputRef.current.value = '';
  };

  // Paste Screenshot Handler
  const handlePasteScreenshot = async () => {
    let pastedAny = false;

    // 1. Attempt direct async clipboard.read() (Image Blob)
    try {
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          const imageType = item.types.find(type => type.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const base64Data = dataUrl.split(',')[1] || '';
              const newScreenshot: ScreenshotFile = {
                id: Math.random().toString(36).substr(2, 9),
                name: `pasted-image-${Date.now()}.${imageType.split('/')[1] || 'png'}`,
                data: base64Data,
                mimeType: imageType,
                previewUrl: dataUrl,
                size: blob.size
              };
              setScreenshots(prev => [...prev, newScreenshot]);
              setVisualInputMode('screenshots');
              toast.success('Screenshot pasted from clipboard!');
            };
            reader.readAsDataURL(blob);
            pastedAny = true;
            return;
          }

          // Check if HTML clipboard data contains an embedded image
          if (item.types.includes('text/html')) {
            try {
              const htmlBlob = await item.getType('text/html');
              const htmlText = await htmlBlob.text();
              const imgMatch = htmlText.match(/<img[^>]+src=["']([^"']+)["']/i);
              if (imgMatch && imgMatch[1]) {
                const src = imgMatch[1];
                if (src.startsWith('data:image/')) {
                  const mimeType = src.substring(5, src.indexOf(';')) || 'image/png';
                  const base64Data = src.split(',')[1] || '';
                  setScreenshots(prev => [...prev, {
                    id: Math.random().toString(36).substr(2, 9),
                    name: `pasted-image-${Date.now()}.${mimeType.split('/')[1] || 'png'}`,
                    data: base64Data,
                    mimeType,
                    previewUrl: src,
                    size: Math.round((base64Data.length * 3) / 4)
                  }]);
                  setVisualInputMode('screenshots');
                  toast.success('Screenshot pasted from clipboard!');
                  pastedAny = true;
                  return;
                }
              }
            } catch (htmlErr) {
              console.warn('HTML clipboard parsing error:', htmlErr);
            }
          }
        }
      }
    } catch (clipboardReadErr) {
      console.warn('Direct clipboard.read failed or blocked by iframe permissions:', clipboardReadErr);
    }

    // 2. Attempt reading clipboard text (data URL, image URL, or base64)
    try {
      if (!pastedAny && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith('data:image/')) {
          const trimmed = text.trim();
          const mimeType = trimmed.substring(5, trimmed.indexOf(';')) || 'image/png';
          const base64Data = trimmed.split(',')[1] || '';
          setScreenshots(prev => [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            name: `pasted-image-${Date.now()}.${mimeType.split('/')[1] || 'png'}`,
            data: base64Data,
            mimeType,
            previewUrl: trimmed,
            size: Math.round((base64Data.length * 3) / 4)
          }]);
          setVisualInputMode('screenshots');
          toast.success('Screenshot pasted from clipboard!');
          return;
        }
      }
    } catch (readTextErr) {
      console.warn('Clipboard readText failed:', readTextErr);
    }

    // 3. Fallback: Open interactive Paste Capture Modal where user presses Ctrl+V natively
    setIsPasteModalOpen(true);
  };

  // Multiple Image Upload Handler
  const processUploadedImageFiles = useCallback(async (rawFiles: FileList | File[]) => {
    if (!rawFiles || rawFiles.length === 0) return;

    const fileList = Array.from(rawFiles);

    const videoRegex = /\.(mp4|webm|ogg|mov|avi|mkv|flv|wmv|m4v|3gp|3g2|ts|mts|m2ts|vob|ogv|qt|asf|rm|rmvb|divx|f4v|h264|h265|hevc|av1|m4p|mpg|mpeg|m2v|mpv|mpe)$/i;
    const imageRegex = /\.(png|jpe?g|webp|gif|bmp|svg|avif|ico|tiff?)$/i;

    const isVideoFile = (file: File) => {
      const type = (file.type || '').toLowerCase();
      const name = (file.name || '').toLowerCase();
      return type.startsWith('video/') || videoRegex.test(name);
    };

    const isImageFile = (file: File) => {
      if (isVideoFile(file)) return false;
      const type = (file.type || '').toLowerCase();
      const name = (file.name || '').toLowerCase();
      return type.startsWith('image/') || imageRegex.test(name);
    };

    // If a video file was uploaded/dragged, switch to video tab and set video file
    const firstVideo = fileList.find(isVideoFile);
    if (firstVideo && fileList.length === 1) {
      setVisualInputMode('video');
      toast.info(`Switched to Video Input mode for "${firstVideo.name}"`);
      return;
    }

    const validImages = fileList.filter(file => !isVideoFile(file) && isImageFile(file));

    if (validImages.length === 0) {
      toast.error('Please upload image files (PNG, JPG, WEBP, GIF, SVG).');
      if (imagesUploadRef.current) imagesUploadRef.current.value = '';
      return;
    }

    try {
      const readPromises = validImages.map(file => {
        return new Promise<ScreenshotFile>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async () => {
            const rawDataUrl = reader.result as string;
            const mimeType = file.type || 'image/png';
            let finalDataUrl = rawDataUrl;
            try {
              finalDataUrl = await compressImage(rawDataUrl, 1600, 1600, 0.85);
            } catch (cErr) {
              console.warn('Image compression fallback:', cErr);
            }
            const base64Data = finalDataUrl.split(',')[1] || rawDataUrl.split(',')[1] || '';
            resolve({
              id: Math.random().toString(36).substring(2, 9),
              name: file.name,
              data: base64Data,
              mimeType: mimeType,
              previewUrl: finalDataUrl,
              size: Math.round((base64Data.length * 3) / 4)
            });
          };
          reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
          reader.readAsDataURL(file);
        });
      });

      const newScreenshots = await Promise.all(readPromises);
      if (newScreenshots.length > 0) {
        setScreenshots(prev => [...prev, ...newScreenshots]);
        setVisualInputMode('screenshots');
        toast.success(`Attached ${newScreenshots.length} screenshot(s)`);
      }
    } catch (err) {
      console.error('Error processing uploaded images:', err);
      toast.error('Failed to read image files.');
    } finally {
      if (imagesUploadRef.current) imagesUploadRef.current.value = '';
    }
  }, []);

  const handleImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedImageFiles(e.target.files);
    }
    e.target.value = '';
  };

  // Global window paste listener for capturing screenshots anywhere on the page
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        (activeEl as HTMLElement).isContentEditable
      );
      if (isTyping && activeEl?.getAttribute('type') !== 'file') {
        const hasImage = Array.from(e.clipboardData?.items || []).some(item => item.type.startsWith('image/'));
        const hasText = Array.from(e.clipboardData?.items || []).some(item => item.type === 'text/plain');
        if (!hasImage || hasText) {
          return;
        }
      }

      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        processUploadedImageFiles(imageFiles);
        setVisualInputMode('screenshots');
        setIsPasteModalOpen(false);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [processUploadedImageFiles]);

  // Create New Folder Modal Handler
  const handleCreateFolder = () => {
    const trimmedTitle = newFolderName.trim();
    if (!trimmedTitle) {
      toast.error('Please enter a folder name');
      return;
    }

    const isDuplicate = testCaseFolders.some(f => f.title.toLowerCase() === trimmedTitle.toLowerCase());
    if (isDuplicate) {
      toast.error('A folder with this name already exists in AI Test Cases');
      return;
    }

    const newFolderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const newScenario: TestScenario = {
      id: newFolderId,
      scenarioId: 'TESTCASE_FOLDER',
      isFolder: true,
      folderType: 'testcase',
      saved: true,
      title: trimmedTitle,
      moduleName: newFolderModule.trim() || 'General',
      description: 'Folder for test cases',
      expectedResults: 'Execution succeeds',
      type: 'Functional',
      isApproved: false,
      testCases: [],
      memberScenarioIds: [],
      createdAt: new Date().toISOString()
    };

    const updatedScenarios = [newScenario, ...(project.scenarios || [])];
    onUpdateProject({ ...project, scenarios: updatedScenarios });
    setSelectedScenarioId(newFolderId);
    setActiveView('folders');
    setExpandedFolderIds(prev => new Set([...Array.from(prev), newFolderId]));
    setIsAddFolderModalOpen(false);
    setNewFolderName('');
    setNewFolderModule('');
    toast.success(`Folder "${trimmedTitle}" created successfully`);
  };

  // Edit Folder Handlers
  const handleOpenEditFolder = (folder: TestScenario, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolderTarget(folder);
    setEditFolderTitle(folder.title || '');
    setEditFolderModule(folder.moduleName || 'General');
  };

  const handleSaveEditFolder = () => {
    if (!editingFolderTarget) return;
    const trimmedTitle = editFolderTitle.trim();
    if (!trimmedTitle) {
      toast.error('Please enter a folder name');
      return;
    }

    const isDuplicate = testCaseFolders.some(f => 
      f.id !== editingFolderTarget.id && 
      f.title.toLowerCase() === trimmedTitle.toLowerCase()
    );
    if (isDuplicate) {
      toast.error('A folder with this name already exists in AI Test Cases');
      return;
    }

    const updatedScenarios = (project.scenarios || []).map(s => {
      if (s.id === editingFolderTarget.id) {
        return {
          ...s,
          title: trimmedTitle,
          moduleName: editFolderModule.trim() || 'General',
          updatedAt: new Date().toISOString()
        };
      }
      return s;
    });

    onUpdateProject({ ...project, scenarios: updatedScenarios });
    toast.success(`Folder "${trimmedTitle}" updated successfully`);
    setEditingFolderTarget(null);
  };

  // Handler to generate AI test cases for one or multiple approved scenarios
  const handleExecuteGenerateForScenarios = async (targets: TestScenario | TestScenario[]) => {
    const targetScenarios = Array.isArray(targets) ? targets : [targets];
    if (!targetScenarios || targetScenarios.length === 0) return;

    // Validate credit requirement: Exactly 20 credits for the generation action
    const perm = await canPerformAction(project.id, 'ai_test_cases', 'analysis', project.name);
    const localPerm = checkAiGenerationPermission(user?.email, 'ai_test_cases', project.id, project.name);
    if (!perm.allowed || !localPerm.allowed) {
      const creditMsg = perm.reason || localPerm.reason || 'Insufficient project credits for AI Test Cases generation (20 credits required).';
      toast.error(creditMsg);
      return;
    }

    setIsModalGenerating(true);
    setGeneratingCurrentIndex(0);
    try {
      const allFormattedCases: TestCase[] = [];
      const successfulScenarioIds: string[] = [];

      for (let i = 0; i < targetScenarios.length; i++) {
        const scen = targetScenarios[i];
        setGeneratingCurrentIndex(i);
        if (targetScenarios.length > 1) {
          toast.info(`Generating test cases (${i + 1}/${targetScenarios.length}) for "${scen.title}"...`);
        } else {
          toast.info(`Generating AI Test Cases for "${scen.title}"...`);
        }

        const contextPayload: any = {
          url: scen.appUrl || defaultAppUrl,
          username: scen.username || defaultUsername,
          password: scen.password || defaultPassword,
          refineInstructions: generateDirectives || focusDirectives,
          docContent: reqDocFile?.content || scen.docContent,
          docFileName: reqDocFile?.name || scen.docFileName,
          // First scenario deducts 20 credits; subsequent scenarios in this click reuse the session quota (strictly 20 credits total)
          isBulkContinuation: i > 0,
          skipCreditLogging: i > 0
        };

        const scenAppUrl = scen.appUrl || defaultAppUrl;
        if (screenshots.length > 0) {
          contextPayload.screenshots = screenshots.map(s => `data:${s.mimeType};base64,${s.data}`);
        } else if (scenAppUrl && scenAppUrl.trim() && (!videoData || !videoData.frames || videoData.frames.length === 0)) {
          try {
            toast.info(`Capturing and analyzing live UI elements from ${scenAppUrl.trim()}...`);
            const captureRes = await fetch('/api/capture-url-ui', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: scenAppUrl.trim() })
            });
            const captureData = await captureRes.json();
            if (captureData.success) {
              contextPayload.screenshots = [captureData.screenshot];
              contextPayload.targetUrlMetadata = {
                title: captureData.pageTitle,
                headings: captureData.elements?.headings,
                buttons: captureData.elements?.buttons,
                inputs: captureData.elements?.inputs,
                textSnippets: captureData.elements?.textSnippets
              };
            }
          } catch (captureErr) {
            console.warn('URL capture error in scenario generation:', captureErr);
          }
        }

        if (videoData && videoData.frames.length > 0) {
          contextPayload.videoFrames = videoData.frames;
          contextPayload.videoFileName = videoData.fileName;
          contextPayload.videoDuration = videoData.duration;
        }

        try {
          let generatedCases = await generateTestCasesFromScenario(scen, contextPayload);
          if (!Array.isArray(generatedCases) || generatedCases.length === 0) {
            generatedCases = generateFallbackTestCases(scen, contextPayload);
          }
          if (Array.isArray(generatedCases) && generatedCases.length > 0) {
            const formattedCases: TestCase[] = generatedCases.map((tc: any, idx: number) => ({
              id: Math.random().toString(36).substr(2, 9),
              testCaseId: `TC-${scen.scenarioId || 'GEN'}-${String(idx + 1).padStart(2, '0')}`,
              title: tc.title || `Test Case ${idx + 1}`,
              steps: Array.isArray(tc.steps) && tc.steps.length > 0 ? tc.steps : ['Execute scenario steps'],
              expectedResult: tc.expectedResult || scen.expectedResults || 'Execution succeeds.',
              status: TestStatus.NOT_EXECUTED,
              isApproved: false,
              testType: tc.testType === 'Non-Functional' ? TestType.NON_FUNCTIONAL : tc.testType === 'UI' ? TestType.UI : TestType.FUNCTIONAL,
              testIntent: tc.testIntent === 'Negative' ? TestIntent.NEGATIVE : TestIntent.POSITIVE,
              priority: tc.priority === 'High' ? TestPriority.HIGH : tc.priority === 'Low' ? TestPriority.LOW : TestPriority.MEDIUM,
              testDataSets: Array.isArray(tc.testDataSets) ? tc.testDataSets : ['Set 1: Valid inputs', 'Set 2: Boundary data', 'Set 3: Edge case values'],
              source: 'ai_synthesis',
              executedAt: new Date().toISOString()
            }));
            allFormattedCases.push(...formattedCases);
            successfulScenarioIds.push(scen.id);
          }
        } catch (genErr: any) {
          console.warn(`Generation notice for scenario "${scen.title}":`, genErr);
          const errMsg = (genErr?.message || String(genErr)).toLowerCase();
          const isCreditOrAuth = (
            errMsg.includes('insufficient credit') ||
            errMsg.includes('basic plan credit limit reached') ||
            errMsg.includes('top up')
          );
          if (isCreditOrAuth) {
            toast.error(genErr.message || 'Credit limit reached.');
          } else {
            const fallback = generateFallbackTestCases(scen, contextPayload);
            if (fallback.length > 0) {
              const formattedCases: TestCase[] = fallback.map((tc: any, idx: number) => ({
                id: Math.random().toString(36).substr(2, 9),
                testCaseId: `TC-${scen.scenarioId || 'GEN'}-${String(idx + 1).padStart(2, '0')}`,
                title: tc.title || `Test Case ${idx + 1}`,
                steps: Array.isArray(tc.steps) && tc.steps.length > 0 ? tc.steps : ['Execute scenario steps'],
                expectedResult: tc.expectedResult || scen.expectedResults || 'Execution succeeds.',
                status: TestStatus.NOT_EXECUTED,
                isApproved: false,
                testType: tc.testType === 'Non-Functional' ? TestType.NON_FUNCTIONAL : tc.testType === 'UI' ? TestType.UI : TestType.FUNCTIONAL,
                testIntent: tc.testIntent === 'Negative' ? TestIntent.NEGATIVE : TestIntent.POSITIVE,
                priority: tc.priority === 'High' ? TestPriority.HIGH : tc.priority === 'Low' ? TestPriority.LOW : TestPriority.MEDIUM,
                testDataSets: Array.isArray(tc.testDataSets) ? tc.testDataSets : ['Set 1: Valid inputs', 'Set 2: Boundary data', 'Set 3: Edge case values'],
                source: 'ai_synthesis',
                executedAt: new Date().toISOString()
              }));
              allFormattedCases.push(...formattedCases);
              successfulScenarioIds.push(scen.id);
            } else {
              toast.error(`Error for "${scen.title}": ${genErr.message || 'Generation failed'}`);
            }
          }
        }
      }

      if (allFormattedCases.length === 0) {
        throw new Error('No test cases generated by the AI service for the selected scenario(s).');
      }

      // Close generate modal and directives
      setScenariosForGenerateModal(null);
      setGenerateDirectives('');

      // Open Save to Folder modal so user can choose or create a folder
      const firstTarget = targetScenarios[0];
      const existingFolderId = firstTarget?.folderId || '';
      const existingFolderName = firstTarget?.folderName || '';

      const availableFolders = (project.scenarios || []).filter(isTestCaseFolder);
      const matchedFolder = availableFolders.find(f => 
        (existingFolderId && f.id === existingFolderId) || 
        (existingFolderName && (f.title || '').trim().toLowerCase() === existingFolderName.trim().toLowerCase())
      );

      const isMultiple = targetScenarios.length > 1;
      const defaultFolder = matchedFolder 
        ? matchedFolder.title 
        : isMultiple
        ? `AI Test Suite (${targetScenarios.length} Scenarios)`
        : (firstTarget.title || 'AI Test Cases');

      const preselectedFolderId = matchedFolder 
        ? matchedFolder.id 
        : (availableFolders.length > 0 ? availableFolders[0].id : '');

      const sourceTitle = isMultiple
        ? `${successfulScenarioIds.length} Scenarios`
        : firstTarget.title;

      setSaveGeneratedCasesModal({
        isOpen: true,
        cases: allFormattedCases,
        sourceTitle,
        sourceScenarioId: firstTarget.id,
        sourceScenarioIds: successfulScenarioIds,
        folderMode: (matchedFolder || availableFolders.length > 0) ? 'existing' : 'new',
        selectedFolderId: preselectedFolderId,
        newFolderName: defaultFolder,
        newFolderModule: firstTarget.moduleName || 'General',
        previewExpanded: false,
        videoData: videoData ? {
          fileName: videoData.fileName,
          fileSize: videoData.fileSize,
          duration: videoData.duration,
          videoUrl: videoData.videoUrl,
          frames: videoData.frames,
          file: videoData.file,
          videoBlob: videoData.videoBlob
        } : (firstTarget?.videoFileName || firstTarget?.videoUrl) ? {
          fileName: firstTarget.videoFileName || 'walkthrough_video.mp4',
          fileSize: firstTarget.videoSize,
          duration: firstTarget.videoDuration,
          videoUrl: firstTarget.videoUrl,
          frames: firstTarget.videoFrames
        } : undefined
      });

      setSelectedCaseIds(new Set());
      setSelectedScenarioIds(new Set());

      toast.success(
        isMultiple
          ? `Generated ${allFormattedCases.length} AI test cases across ${successfulScenarioIds.length} scenarios! Please choose a folder to save.`
          : `Generated ${allFormattedCases.length} AI test cases! Please choose a folder to save.`
      );
    } catch (err: any) {
      console.error('Generation error:', err);
      toast.error(`Generation error: ${err.message || 'Failed to generate test cases'}`);
    } finally {
      setIsModalGenerating(false);
      setGeneratingCurrentIndex(0);
    }
  };

  const handleExecuteGenerateForScenario = (targetScenario: TestScenario) => {
    return handleExecuteGenerateForScenarios([targetScenario]);
  };

  // Confirm Save Generated Cases into Selected or New Folder
  const handleConfirmSaveGeneratedCases = async () => {
    if (!saveGeneratedCasesModal || isSavingGeneratedCases) return;
    const { cases, folderMode, selectedFolderId, newFolderName, newFolderModule, sourceTitle, sourceScenarioId, sourceScenarioIds } = saveGeneratedCasesModal;

    if (!cases || cases.length === 0) {
      toast.error('No test cases to save');
      setSaveGeneratedCasesModal(null);
      return;
    }

    setIsSavingGeneratedCases(true);

    try {
      const targetSourceIds = sourceScenarioIds && sourceScenarioIds.length > 0
        ? sourceScenarioIds
        : sourceScenarioId
        ? [sourceScenarioId]
        : [];

      // Determine the target folder ID and Title
      let targetFolderId = '';
      let targetFolderTitle = '';
      let isNewFolderCreation = false;

      if (folderMode === 'new') {
        const trimmedTitle = newFolderName.trim();
        if (!trimmedTitle) {
          toast.error('Please enter a folder name');
          setIsSavingGeneratedCases(false);
          return;
        }

        // Check if an existing folder with this title already exists in AI Test Cases
        const existingFolder = testCaseFolders.find(f => 
          (f.title || '').trim().toLowerCase() === trimmedTitle.toLowerCase()
        ) || (project.scenarios || []).find(s => 
          isTestCaseFolder(s) && (s.title || '').trim().toLowerCase() === trimmedTitle.toLowerCase()
        );

        if (existingFolder) {
          // Reuse existing folder to prevent creating duplicates!
          targetFolderId = existingFolder.id;
          targetFolderTitle = existingFolder.title;
          isNewFolderCreation = false;
        } else {
          targetFolderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
          targetFolderTitle = trimmedTitle;
          isNewFolderCreation = true;
        }
      } else {
        if (!selectedFolderId) {
          toast.error('Please select an existing folder');
          setIsSavingGeneratedCases(false);
          return;
        }
        const targetFolder = (project.scenarios || []).find(s => s.id === selectedFolderId);
        targetFolderId = selectedFolderId;
        targetFolderTitle = targetFolder?.title || 'Selected Folder';
        isNewFolderCreation = false;
      }

      // Extract any video walkthrough associated with this generation or current uploader
      const attachedVideo = saveGeneratedCasesModal.videoData || (videoData ? {
        fileName: videoData.fileName,
        fileSize: videoData.fileSize,
        duration: videoData.duration,
        frames: videoData.frames,
        videoUrl: videoData.videoUrl,
        file: videoData.file,
        videoBlob: videoData.videoBlob
      } : null);

      let persistentVideoUrl = attachedVideo?.videoUrl || videoData?.videoUrl || '';

      if (attachedVideo || videoData) {
        let rawBlobOrFile = (attachedVideo as any)?.videoBlob || 
                            (attachedVideo as any)?.file || 
                            videoData?.videoBlob || 
                            videoData?.file;
        const videoFileName = attachedVideo?.fileName || videoData?.fileName || 'walkthrough_video.mp4';

        // If raw blob/file is not directly attached but we have a blob URL, fetch it into a Blob
        if (!rawBlobOrFile && persistentVideoUrl && persistentVideoUrl.startsWith('blob:')) {
          try {
            const bRes = await fetch(persistentVideoUrl);
            if (bRes.ok) {
              rawBlobOrFile = await bRes.blob();
            }
          } catch (fetchErr) {
            console.warn('[handleConfirmSaveGeneratedCases] Error fetching blob URL:', fetchErr);
          }
        }

        if (rawBlobOrFile) {
          try {
            await saveVideoBlob(targetFolderId, rawBlobOrFile, videoFileName);
            if (videoFileName) {
              await saveVideoBlob(videoFileName, rawBlobOrFile, videoFileName);
            }
          } catch (e) {
            console.warn('[handleConfirmSaveGeneratedCases] IndexedDB save notice:', e);
          }

          try {
            const res = await uploadAndPersistVideo(targetFolderId, rawBlobOrFile, videoFileName);
            if (res && res.url) {
              persistentVideoUrl = res.url;
            }
          } catch (upErr) {
            console.warn('[handleConfirmSaveGeneratedCases] Server upload notice:', upErr);
          }
        }
      }

      const activeFrames = (attachedVideo?.frames && attachedVideo.frames.length > 0)
        ? attachedVideo.frames
        : (videoData?.frames && videoData.frames.length > 0)
        ? videoData.frames
        : undefined;

      const videoFieldsToSave = (attachedVideo || videoData) ? {
        videoFileName: attachedVideo?.fileName || videoData?.fileName,
        videoUrl: persistentVideoUrl || attachedVideo?.videoUrl || videoData?.videoUrl || undefined,
        videoDuration: attachedVideo?.duration || videoData?.duration,
        videoFrames: activeFrames,
        videoSize: attachedVideo?.fileSize || videoData?.fileSize
      } : {};

      const newFolderObj: TestScenario | null = isNewFolderCreation ? {
        id: targetFolderId,
        scenarioId: 'TESTCASE_FOLDER',
        isFolder: true,
        folderType: 'testcase',
        saved: true,
        title: targetFolderTitle,
        moduleName: newFolderModule.trim() || 'General',
        description: `Folder containing AI test cases for ${sourceTitle}`,
        expectedResults: 'Execution validates requirements successfully.',
        type: 'Functional',
        isApproved: false,
        testCases: cases,
        memberScenarioIds: targetSourceIds,
        createdAt: new Date().toISOString(),
        ...videoFieldsToSave
      } : null;

      let updatedScenarios = (project.scenarios || []).map(s => {
        // Target existing folder: append new test cases, memberScenarioIds, and video walkthrough
        if (!isNewFolderCreation && s.id === targetFolderId) {
          const existingCases = s.testCases || [];
          const existingIds = new Set(existingCases.map((c: any) => c.id));
          const existingCaseIds = new Set(existingCases.map((c: any) => (c.testCaseId || '').trim().toLowerCase()).filter(Boolean));
          
          const uniqueNew = cases.filter(c => {
            if (existingIds.has(c.id)) return false;
            const tcKey = (c.testCaseId || '').trim().toLowerCase();
            if (tcKey && existingCaseIds.has(tcKey)) return false;
            return true;
          });

          const mergedMemberIds = Array.from(new Set([...(s.memberScenarioIds || []), ...targetSourceIds]));
          return {
            ...s,
            scenarioId: 'TESTCASE_FOLDER',
            folderType: 'testcase',
            isFolder: true,
            saved: true,
            isApproved: s.isApproved || false,
            testCases: [...existingCases, ...uniqueNew],
            memberScenarioIds: mergedMemberIds,
            ...(attachedVideo ? {
              videoFileName: attachedVideo.fileName || s.videoFileName,
              videoUrl: persistentVideoUrl || attachedVideo.videoUrl || s.videoUrl,
              videoDuration: attachedVideo.duration || s.videoDuration,
              videoFrames: (attachedVideo.frames && attachedVideo.frames.length > 0) ? attachedVideo.frames : s.videoFrames,
              videoSize: attachedVideo.fileSize || s.videoSize
            } : {})
          };
        }

        // Target scenarios: mark as saved to folder, attach video walkthrough, and remove from individual view
        if (targetSourceIds.includes(s.id)) {
          return {
            ...s,
            testCases: cases.filter(c => c.scenarioId === s.id || targetSourceIds.length === 1),
            isRemovedFromIndividual: true,
            testCaseFolderId: targetFolderId,
            folderId: targetFolderId,
            folderName: targetFolderTitle,
            saved: true,
            isApproved: true,
            ...(attachedVideo ? {
              videoFileName: attachedVideo.fileName || s.videoFileName,
              videoUrl: persistentVideoUrl || attachedVideo.videoUrl || s.videoUrl,
              videoDuration: attachedVideo.duration || s.videoDuration,
              videoFrames: (attachedVideo.frames && attachedVideo.frames.length > 0) ? attachedVideo.frames : s.videoFrames,
              videoSize: attachedVideo.fileSize || s.videoSize
            } : {})
          };
        }

        // Other folders: remove targetSourceIds from memberScenarioIds and strip duplicate direct cases
        if (s.isFolder && s.id !== targetFolderId) {
          let modified = false;
          let newMemberIds = s.memberScenarioIds;
          if (Array.isArray(s.memberScenarioIds) && s.memberScenarioIds.some(id => targetSourceIds.includes(id))) {
            newMemberIds = s.memberScenarioIds.filter(id => !targetSourceIds.includes(id));
            modified = true;
          }
          if (modified) {
            return {
              ...s,
              memberScenarioIds: newMemberIds
            };
          }
        }

        return s;
      });

      if (isNewFolderCreation && newFolderObj) {
        updatedScenarios = [newFolderObj, ...updatedScenarios];
      }

      onUpdateProject({ ...project, scenarios: updatedScenarios });
      setSelectedScenarioId(targetFolderId);
      setActiveView('folders');
      setExpandedFolderIds(prev => new Set([...Array.from(prev), targetFolderId]));
      setSelectedCaseIds(new Set());
      setSelectedScenarioIds(new Set());
      setVideoData(null);
      setScreenshots([]);
      setIsSavingGeneratedCases(false);
      setSaveGeneratedCasesModal(null);
      toast.success(`Successfully saved ${cases.length} AI test cases into folder "${targetFolderTitle}"!`);
      logActivity(user.email, user.name, `Saved ${cases.length} AI Test Cases into folder: ${targetFolderTitle}`, project.id, project.name).catch(() => {});
    } catch (err: any) {
      console.error('Error saving generated test cases to folder:', err);
      toast.error('Failed to save test cases to folder');
    } finally {
      setIsSavingGeneratedCases(false);
      setSaveGeneratedCasesModal(null);
    }
  };

  // Save Add/Edit Test Case Handler
  const handleSaveTestCase = () => {
    if (!caseForm.title?.trim()) {
      toast.error('Please enter a test case title');
      return;
    }
    if (!caseFormScenarioId) {
      toast.error('Please select a target folder');
      return;
    }

    const cleanSteps = (caseForm.steps || []).filter(s => s.trim().length > 0);
    const formattedSteps = cleanSteps.length > 0 ? cleanSteps : ['Perform initial validation step'];

    if (editingCase) {
      // Update existing case
      const updatedScenarios = (project.scenarios || []).map(scen => {
        if (scen.id !== editingCase.scenarioId) return scen;
        const updatedCases = (scen.testCases || []).map(tc => {
          if (tc.id !== editingCase.testCase.id) return tc;
          return {
            ...tc,
            title: caseForm.title!.trim(),
            steps: formattedSteps,
            expectedResult: caseForm.expectedResult?.trim() || 'Verify expected behavior',
            priority: caseForm.priority || TestPriority.MEDIUM,
            testType: caseForm.testType || TestType.FUNCTIONAL,
            testIntent: caseForm.testIntent || TestIntent.POSITIVE,
            testDataSets: (caseForm.testDataSets || []).filter(d => d.trim().length > 0)
          };
        });
        return { ...scen, testCases: updatedCases };
      });
      onUpdateProject({ ...project, scenarios: updatedScenarios });
      toast.success('Test case updated successfully');
    } else {
      // Add new case
      const newCase: TestCase = {
        id: Math.random().toString(36).substr(2, 9),
        testCaseId: `TC-${Date.now().toString().slice(-4)}`,
        title: caseForm.title!.trim(),
        steps: formattedSteps,
        expectedResult: caseForm.expectedResult?.trim() || 'Verify expected outcome',
        status: TestStatus.NOT_EXECUTED,
        isApproved: false,
        priority: caseForm.priority || TestPriority.MEDIUM,
        testType: caseForm.testType || TestType.FUNCTIONAL,
        testIntent: caseForm.testIntent || TestIntent.POSITIVE,
        testDataSets: (caseForm.testDataSets || []).filter(d => d.trim().length > 0),
        executedAt: new Date().toISOString()
      };

      const updatedScenarios = (project.scenarios || []).map(scen => {
        if (scen.id !== caseFormScenarioId) return scen;
        return {
          ...scen,
          testCases: [...(scen.testCases || []), newCase]
        };
      });
      onUpdateProject({ ...project, scenarios: updatedScenarios });
      setExpandedFolderIds(prev => new Set([...Array.from(prev), caseFormScenarioId]));
      toast.success('Test case created successfully');
    }

    setIsCaseModalOpen(false);
    setEditingCase(null);
  };

  // AI Synthesis of Test Cases from Global Generation Context
  const handleSynthesizeTestCases = async () => {
    if (isSynthesizing) return;

    if (!hasUploadedInput) {
      toast.error('Please upload an input (screenshots, video, or requirements document) before generating test cases.');
      return;
    }

    if (isExtractingVideo) {
      toast.error('Please wait for key-frame extraction to complete before generating test cases.');
      return;
    }

    if (visualInputMode === 'video' && !reqDocFile && (!Array.isArray(screenshots) || screenshots.length === 0)) {
      if (!videoData || !Array.isArray(videoData.frames) || videoData.frames.length === 0) {
        toast.error('Please upload a video and wait for key-frame extraction to complete before generating test cases.');
        return;
      }
    }

    // 1. Validate credit balance BEFORE setting synthesis lock or making AI calls
    const perm = await canPerformAction(project.id, 'ai_test_cases', 'analysis', project.name);
    const localPerm = checkAiGenerationPermission(user?.email, 'ai_test_cases', project.id, project.name);

    if (!perm.allowed || !localPerm.allowed) {
      const creditMsg = perm.reason || localPerm.reason || 'Insufficient project credits for AI Test Cases generation.';
      toast.error(creditMsg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('credit-limit-exceeded', {
          detail: {
            functionName: 'generateTestCasesFromScenario',
            userEmail: user?.email,
            reason: creditMsg,
            remainingCredits: perm.remainingCredits ?? localPerm.remainingCredits ?? 0
          }
        }));
      }
      return;
    }

    setIsSynthesizing(true);
    setSynthesisStep('Synthesizing requirements, visual inputs, and test workflows...');

    let targetScenario: any = null;
    let contextPayload: any = null;

    try {
      // Determine folder or scenario target
      targetScenario = validScenarios.find(s => s.id === selectedScenarioId);
      if (!targetScenario || selectedScenarioId === 'ALL') {
        const inferredTitle = videoData?.fileName 
          ? `Workflow: ${videoData.fileName.replace(/\.[^/.]+$/, '')}`
          : reqDocFile?.name
          ? `Spec: ${reqDocFile.name.replace(/\.[^/.]+$/, '')}`
          : defaultAppUrl
          ? `App: ${defaultAppUrl.replace(/^https?:\/\//, '').split('/')[0]}`
          : `AI Synthesized Suite #${(project.scenarios?.length || 0) + 1}`;

        targetScenario = {
          id: Math.random().toString(36).substr(2, 9),
          scenarioId: `TS-AI-${Date.now().toString().slice(-4)}`,
          title: inferredTitle,
          moduleName: 'Synthesis',
          description: 'AI Synthesized Test Cases with visual and architectural context',
          expectedResults: 'All test assertions and workflow steps succeed',
          type: 'Functional',
          isApproved: false,
          testCases: [],
          appUrl: defaultAppUrl,
          username: defaultUsername,
          password: defaultPassword,
          createdAt: new Date().toISOString()
        };
      }

      // Context Payload
      contextPayload = {
        url: defaultAppUrl,
        username: defaultUsername,
        password: defaultPassword,
        refineInstructions: focusDirectives,
        docContent: reqDocFile?.content,
        docFileName: reqDocFile?.name
      };

      // Add Screenshots / Capture Live URL input dynamically
      if (screenshots.length > 0) {
        contextPayload.screenshots = screenshots.map(s => `data:${s.mimeType};base64,${s.data}`);
      } else if (defaultAppUrl && defaultAppUrl.trim() && (!videoData || !videoData.frames || videoData.frames.length === 0)) {
        try {
          setSynthesisStep('Connecting and capturing live UI elements from App URL...');
          const captureRes = await fetch('/api/capture-url-ui', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: defaultAppUrl.trim() })
          });
          const captureData = await captureRes.json();
          if (captureData.success) {
            contextPayload.screenshots = [captureData.screenshot];
            contextPayload.targetUrlMetadata = {
              title: captureData.pageTitle,
              headings: captureData.elements?.headings,
              buttons: captureData.elements?.buttons,
              inputs: captureData.elements?.inputs,
              textSnippets: captureData.elements?.textSnippets
            };
          }
        } catch (captureErr) {
          console.warn('URL capture error inside test case generation:', captureErr);
        }
      }

      // Add Video Frames
      if (videoData && videoData.frames.length > 0) {
        contextPayload.videoFrames = videoData.frames;
        contextPayload.videoFileName = videoData.fileName;
        contextPayload.videoDuration = videoData.duration;
      }

      let generatedCases: any[] = [];
      if (reqDocFile?.fileId && !videoData && screenshots.length === 0) {
        try {
          setSynthesisStep('Starting document analysis on server...');
          const cleanLoginContext = (defaultAppUrl || defaultUsername || defaultPassword)
            ? `Global Login Context:\nURL: ${defaultAppUrl}\nUsername: ${defaultUsername}\nPassword: ${defaultPassword}`
            : '';

          const startRes = await fetch('/api/ai/testcases/start-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: project.id,
              projectName: project.name || '',
              userId: user.email || user.name,
              fileId: reqDocFile.fileId,
              fileName: reqDocFile.name,
              loginContext: cleanLoginContext,
              aiInstructions: focusDirectives || 'Generate functional, non-functional, negative, and edge test cases.'
            })
          });

          const startApiRes = await parseApiResponse(startRes);
          if (startApiRes.ok && startApiRes.data?.success) {
            const startData = startApiRes.data;
            const jobId = startData.jobId;
            setSynthesisStep(startData.stage || 'Analyzing document...');

            const resultScenarios: TestScenario[] = await new Promise((resolve, reject) => {
              const pollInterval = setInterval(async () => {
                try {
                  const statusRes = await fetch(`/api/ai/testcases/job-status/${jobId}`);
                  const statusApiRes = await parseApiResponse(statusRes);
                  if (!statusApiRes.ok || !statusApiRes.data?.success) return;
                  const statusData = statusApiRes.data;

                  if (statusData.stage) setSynthesisStep(statusData.stage);

                  if (statusData.status === 'COMPLETED') {
                    clearInterval(pollInterval);
                    resolve(statusData.scenarios || []);
                  } else if (statusData.status === 'FAILED') {
                    clearInterval(pollInterval);
                    reject(new Error(statusData.error || 'Document test case generation failed'));
                  }
                } catch (pErr) {
                  console.warn('Poll error:', pErr);
                }
              }, 1500);

              setTimeout(() => {
                clearInterval(pollInterval);
                reject(new Error('Document generation polling timed out.'));
              }, 60 * 1000);
            });

            const allExtractedCases: any[] = [];
            resultScenarios.forEach((sc) => {
              (sc.testCases || []).forEach((tc: any) => {
                allExtractedCases.push({
                  title: tc.title,
                  steps: Array.isArray(tc.steps) && tc.steps.length > 0 ? tc.steps : [tc.title || 'Execute verification step'],
                  expectedResult: tc.expectedResult || sc.expectedResults || 'Action verified successfully.',
                  testType: tc.type === 'Non-functional' || tc.type === 'Non-Functional' ? 'Non-Functional' : tc.type === 'UI' ? 'UI' : 'Functional',
                  testIntent: tc.testIntent || (sc.scenarioCategory === 'Negative' ? 'Negative' : 'Positive'),
                  priority: tc.priority || sc.priority || 'Medium',
                  testDataSets: Array.isArray(tc.testDataSets) ? tc.testDataSets : ['Set 1: Valid inputs', 'Set 2: Boundary data', 'Set 3: Edge case values']
                });
              });
            });

            if (allExtractedCases.length === 0 && resultScenarios.length > 0) {
              resultScenarios.forEach((sc: any) => {
                allExtractedCases.push({
                  title: sc.title,
                  steps: Array.isArray(sc.steps) && sc.steps.length > 0 ? sc.steps : [sc.description || `Verify scenario: ${sc.title}`],
                  expectedResult: sc.expectedResults || 'Action completed successfully.',
                  testType: String(sc.type || '').toLowerCase().includes('non-functional') ? 'Non-Functional' : 'Functional',
                  testIntent: sc.scenarioCategory === 'Negative' ? 'Negative' : 'Positive',
                  priority: sc.priority || 'Medium',
                  testDataSets: ['Valid Inputs', 'Boundary Condition']
                });
              });
            }

            generatedCases = allExtractedCases;
          } else {
            console.warn('[AI TestCaseManager] Start job notice:', startApiRes.error);
          }
        } catch (jobErr: any) {
          console.warn('[AI TestCaseManager] Server document job notice:', jobErr?.message || jobErr);
        }
      }

      if (!Array.isArray(generatedCases) || generatedCases.length === 0) {
        setSynthesisStep('Synthesizing test cases directly with AI engine...');
        generatedCases = await generateTestCasesFromScenario(targetScenario, contextPayload);
      }

      if (!Array.isArray(generatedCases) || generatedCases.length === 0) {
        throw new Error('No test cases generated by the AI service.');
      }

      const formattedCases: TestCase[] = generatedCases.map((tc: any, idx: number) => ({
        id: Math.random().toString(36).substr(2, 9),
        testCaseId: `TC-${targetScenario!.scenarioId || 'GEN'}-${String(idx + 1).padStart(2, '0')}`,
        title: tc.title || `Test Case ${idx + 1}`,
        steps: Array.isArray(tc.steps) && tc.steps.length > 0 ? tc.steps : ['Execute scenario steps'],
        expectedResult: tc.expectedResult || targetScenario!.expectedResults || 'Execution succeeds.',
        status: TestStatus.NOT_EXECUTED,
        isApproved: false,
        testType: tc.testType === 'Non-Functional' ? TestType.NON_FUNCTIONAL : tc.testType === 'UI' ? TestType.UI : TestType.FUNCTIONAL,
        testIntent: tc.testIntent === 'Negative' ? TestIntent.NEGATIVE : TestIntent.POSITIVE,
        priority: tc.priority === 'High' ? TestPriority.HIGH : tc.priority === 'Low' ? TestPriority.LOW : TestPriority.MEDIUM,
        testDataSets: Array.isArray(tc.testDataSets) ? tc.testDataSets : ['Set 1: Valid inputs', 'Set 2: Boundary data', 'Set 3: Edge case values'],
        source: videoData ? 'video_walkthrough' : screenshots.length > 0 ? 'screenshot_analysis' : 'ai_synthesis',
        executedAt: new Date().toISOString()
      }));

      // Compress video frames if present for storage
      const compressedFrames = videoData?.frames?.length 
        ? await createVideoFramesThumbnails(videoData.frames)
        : targetScenario.videoFrames;

      // Inferred or selected folder name
      const availableFolders = (project.scenarios || []).filter(isTestCaseFolder);
      const inferredName = videoData?.fileName 
        ? `Workflow: ${videoData.fileName.replace(/\.[^/.]+$/, '')}`
        : reqDocFile?.name
        ? `Spec: ${reqDocFile.name.replace(/\.[^/.]+$/, '')}`
        : defaultAppUrl
        ? `App: ${defaultAppUrl.replace(/^https?:\/\//, '').split('/')[0]}`
        : `AI Test Suite #${(testCaseFolders.length || 0) + 1}`;

      const suggestedName = (targetScenario && targetScenario.title && !isStructuralScenario(targetScenario))
        ? targetScenario.title
        : inferredName;

      setSaveGeneratedCasesModal({
        isOpen: true,
        cases: formattedCases,
        sourceTitle: targetScenario?.title || suggestedName,
        sourceScenarioId: targetScenario?.id,
        sourceScenarioIds: targetScenario?.id ? [targetScenario.id] : [],
        folderMode: availableFolders.length > 0 ? 'existing' : 'new',
        selectedFolderId: availableFolders.length > 0 ? availableFolders[0].id : '',
        newFolderName: suggestedName,
        newFolderModule: targetScenario?.moduleName || 'General',
        previewExpanded: false,
        videoData: videoData ? {
          fileName: videoData.fileName,
          fileSize: videoData.fileSize,
          duration: videoData.duration,
          videoUrl: videoData.videoUrl,
          frames: compressedFrames || videoData.frames,
          file: videoData.file,
          videoBlob: videoData.videoBlob
        } : (targetScenario?.videoFileName || targetScenario?.videoUrl) ? {
          fileName: targetScenario.videoFileName || 'walkthrough_video.mp4',
          fileSize: targetScenario.videoSize,
          duration: targetScenario.videoDuration,
          videoUrl: targetScenario.videoUrl,
          frames: targetScenario.videoFrames
        } : undefined
      });

      toast.success(`Generated ${formattedCases.length} AI test cases! 20 credit points deducted. Please choose a folder to save.`);
    } catch (err: any) {
      console.warn('Synthesis notice:', err);
      const msg = err?.message || String(err);
      const isCreditError = msg.toLowerCase().includes('insufficient credit') || msg.toLowerCase().includes('basic plan credit limit reached') || msg.toLowerCase().includes('top up');
      if (targetScenario && !isCreditError) {
        const fallback = generateFallbackTestCases(targetScenario, contextPayload);
        if (fallback.length > 0) {
          const formattedCases: TestCase[] = fallback.map((tc: any, idx: number) => ({
            id: Math.random().toString(36).substr(2, 9),
            testCaseId: `TC-${targetScenario!.scenarioId || 'GEN'}-${String(idx + 1).padStart(2, '0')}`,
            title: tc.title || `Test Case ${idx + 1}`,
            steps: Array.isArray(tc.steps) && tc.steps.length > 0 ? tc.steps : ['Execute scenario steps'],
            expectedResult: tc.expectedResult || targetScenario!.expectedResults || 'Execution succeeds.',
            status: TestStatus.NOT_EXECUTED,
            isApproved: false,
            testType: tc.testType === 'Non-Functional' ? TestType.NON_FUNCTIONAL : tc.testType === 'UI' ? TestType.UI : TestType.FUNCTIONAL,
            testIntent: tc.testIntent === 'Negative' ? TestIntent.NEGATIVE : TestIntent.POSITIVE,
            priority: tc.priority === 'High' ? TestPriority.HIGH : tc.priority === 'Low' ? TestPriority.LOW : TestPriority.MEDIUM,
            testDataSets: Array.isArray(tc.testDataSets) ? tc.testDataSets : ['Set 1: Valid inputs', 'Set 2: Boundary data', 'Set 3: Edge case values'],
            source: videoData ? 'video_walkthrough' : screenshots.length > 0 ? 'screenshot_analysis' : 'ai_synthesis',
            executedAt: new Date().toISOString()
          }));

          const availableFolders = (project.scenarios || []).filter(isTestCaseFolder);
          const inferredName = reqDocFile?.name
            ? `Spec: ${reqDocFile.name.replace(/\.[^/.]+$/, '')}`
            : defaultAppUrl
            ? `App: ${defaultAppUrl.replace(/^https?:\/\//, '').split('/')[0]}`
            : `AI Test Suite #${(testCaseFolders.length || 0) + 1}`;

          const suggestedName = (targetScenario && targetScenario.title && !isStructuralScenario(targetScenario))
            ? targetScenario.title
            : inferredName;

          setSaveGeneratedCasesModal({
            isOpen: true,
            cases: formattedCases,
            sourceTitle: targetScenario?.title || suggestedName,
            sourceScenarioId: targetScenario?.id,
            sourceScenarioIds: targetScenario?.id ? [targetScenario.id] : [],
            folderMode: availableFolders.length > 0 ? 'existing' : 'new',
            selectedFolderId: availableFolders.length > 0 ? availableFolders[0].id : '',
            newFolderName: suggestedName,
            newFolderModule: targetScenario?.moduleName || 'General',
            previewExpanded: false,
            videoData: undefined
          });

          try {
            await deductProjectCredits(project.id, 'ai_test_cases', 'analysis', { email: user?.email, name: user?.name }, { projectName: project.name, details: 'AI Test Cases generation' });
          } catch (deductErr) {
            console.warn('Fallback credit deduction notice:', deductErr);
          }

          toast.success(`Generated ${formattedCases.length} AI test cases! 20 credit points deducted. Please choose a folder to save.`);
          return;
        }
      }
      toast.error(`Synthesis notice: ${err.message || 'Failed to synthesize test cases'}`);
    } finally {
      setIsSynthesizing(false);
      setSynthesisStep('');
    }
  };

  // Open Frame Inspector
  const openFramePreview = (
    frames: Array<{ timestamp?: string; image?: string; frameIndex?: number; isBlank?: boolean }>,
    initialIndex: number = 0,
    title: string = 'Video Walkthrough Keyframe',
    videoFileName: string = ''
  ) => {
    if (!frames || frames.length === 0) return;
    const safeIdx = Math.max(0, Math.min(frames.length - 1, initialIndex));
    setPreviewFrameModal({
      isOpen: true,
      frames,
      currentFrameIndex: safeIdx,
      title,
      videoFileName
    });
  };

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & METRIC / ACTION ROW                                       */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            AI TEST CASES
          </h1>
          <RAGStatusBadge
            enabled={ragEnabled}
            onToggle={setRagEnabled}
            retrievedChunks={retrievedRagChunks}
          />
        </div>
      </div>

      {/* Second Row: TOTAL TESTCASES metric card on left, Search & Action Buttons on right */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* TOTAL TESTCASES METRIC CARD */}
        <div className="w-fit min-w-[200px] bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs flex items-center gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">TOTAL TESTCASES</span>
            <div className="text-2xl font-black text-teal-600 flex items-center gap-1.5 mt-0.5">
              {totalCount}
              <span className="text-sm text-teal-500 font-bold">↗</span>
            </div>
          </div>
        </div>

        {/* Right action buttons: Search, Template, Upload, Export, Add Folder */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input + Clear + Search Button */}
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleExecuteSearch();
                  }
                }}
                placeholder="Search cases or IDs..."
                className="pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 shadow-xs w-48 sm:w-60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    toast.info('Search cleared');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleExecuteSearch()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
              title="Search Test Cases"
            >
              <Search size={13} />
              SEARCH
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleDownloadTemplate()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
            title="Download Excel Template"
          >
            <Download size={13} className="text-slate-500" />
            TEMPLATE
          </button>

          <button
            type="button"
            onClick={() => excelUploadRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
            title="Upload Excel or CSV"
          >
            <Upload size={13} className="text-slate-500" />
            UPLOAD
          </button>
          <input
            ref={excelUploadRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleExcelUpload}
          />

          <button
            type="button"
            onClick={() => handleExportExcel('excel')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
            title="Export Test Cases to Excel"
          >
            <FileSpreadsheet size={13} className="text-emerald-600" />
            EXPORT EXCEL
          </button>

          <button
            type="button"
            onClick={() => handleExportExcel('csv')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
            title="Export Test Cases to CSV"
          >
            <Download size={13} className="text-slate-600" />
            EXPORT CSV
          </button>

          <button
            type="button"
            onClick={() => setIsAddFolderModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-500/10 border border-teal-500/30 hover:bg-teal-500/20 text-teal-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
          >
            <Plus size={14} className="text-teal-600" />
            ADD FOLDER
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. GENERATION CONTEXT CARD (Exact Screenshot Match with Video Input)     */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs space-y-6">
        {/* Top Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#00E1C5] text-slate-950 flex items-center justify-center font-bold shadow-xs">
            <SlidersHorizontal size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              GENERATION CONTEXT
            </h2>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
              CONFIGURE GLOBAL CONTEXT FOR TEST CASE SYNTHESIS
            </p>
          </div>
        </div>

        {/* Input Fields Grid: URL */}
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1.5">
              APP URL
            </label>
            <div className="relative">
              <Globe size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={defaultAppUrl}
                onChange={(e) => setDefaultAppUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all font-mono"
              />
            </div>
          </div>
        </div>

        {/* Amber System Notice */}
        <div className="bg-[#FFF9EE] border border-[#FFE8C8] rounded-xl px-4 py-3 flex items-center gap-2.5 text-[#C26100]">
          <Info size={16} className="shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wide">
            SYSTEM WILL INTELLIGENTLY DETECT IF LOGIN IS REQUIRED. PROVIDED CREDENTIALS WILL BE USED ONLY WHEN NECESSARY.
          </span>
        </div>

        {/* Requirements Document Box */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600">
            REQUIREMENTS DOCUMENT (OPTIONAL)
          </label>
          <div
            onClick={() => docInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                processDocFile(e.dataTransfer.files[0]);
              }
            }}
            className="border-2 border-dashed border-teal-200 hover:border-teal-400 bg-teal-50/20 hover:bg-teal-50/40 rounded-2xl p-4 text-center cursor-pointer transition-all flex items-center justify-center gap-2 group"
          >
            <Paperclip size={16} className="text-teal-600 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-black text-teal-700 uppercase tracking-wide">
              {reqDocFile ? reqDocFile.name : 'UPLOAD REQUIREMENTS DOCUMENT (PDF, TXT, DOCX)'}
            </span>
            {reqDocFile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReqDocFile(null);
                  if (docInputRef.current) docInputRef.current.value = '';
                  toast.info('Requirements document removed');
                }}
                className="ml-2 p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                title="Remove Document"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <input
            ref={docInputRef}
            type="file"
            accept=".pdf,.txt,.docx,.md"
            className="hidden"
            onChange={handleDocUpload}
          />
        </div>

        {/* Screenshots & Video Input Section with Switcher */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                GENERATION SCREENSHOTS & VIDEO INPUT (OPTIONAL)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Attach screenshots or video walkthroughs to guide test case synthesis with visual UI layouts, buttons, forms, and workflows.
              </p>
            </div>

            {/* Switcher tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setVisualInputMode('screenshots')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  visualInputMode === 'screenshots'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ImageIcon size={14} />
                <span>Screenshots ({screenshots.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setVisualInputMode('video')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  visualInputMode === 'video'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Film size={14} />
                <span>Video Input {videoData ? `(${videoData.frames?.length || 0} frames)` : ''}</span>
              </button>
            </div>
          </div>

          {/* If Screenshots view is active */}
          {visualInputMode === 'screenshots' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                  ATTACH UI SCREENSHOTS
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePasteScreenshot}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <Clipboard size={13} className="text-slate-500" />
                    Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => imagesUploadRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <Upload size={13} />
                    Upload Images
                  </button>
                  <input
                    ref={imagesUploadRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.avif,image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
                    multiple
                    className="hidden"
                    onChange={handleImagesUpload}
                  />
                </div>
              </div>

              <div
                tabIndex={0}
                onClick={() => imagesUploadRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    imagesUploadRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    processUploadedImageFiles(e.dataTransfer.files);
                  }
                }}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (items && items.length > 0) {
                    const imageFiles: File[] = [];
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.startsWith('image/')) {
                        const file = items[i].getAsFile();
                        if (file) imageFiles.push(file);
                      }
                    }
                    if (imageFiles.length > 0) {
                      e.preventDefault();
                      e.stopPropagation();
                      processUploadedImageFiles(imageFiles);
                    }
                  }
                }}
                className="border-2 border-dashed border-teal-200/80 hover:border-teal-400 bg-teal-50/20 hover:bg-teal-50/40 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
              >
                <div className="w-10 h-10 rounded-2xl bg-teal-100/70 group-hover:bg-teal-200/80 flex items-center justify-center text-teal-600 transition-colors">
                  <Upload size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">
                    Drop screenshots here, browse files, or press Ctrl+V to paste
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Supports PNG, JPG, WEBP, GIF, SVG (Multiple files supported)
                  </p>
                </div>
              </div>

              {screenshots.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider block">
                      Attached Screenshots ({screenshots.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setScreenshots([]);
                        if (imagesUploadRef.current) imagesUploadRef.current.value = '';
                        toast.info('All screenshots removed');
                      }}
                      className="text-[11px] font-bold text-rose-500 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                      title="Remove all uploaded screenshots"
                    >
                      <Trash2 size={12} /> Clear All
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {screenshots.map((s, idx) => (
                      <div key={s.id || idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                        <img
                          src={s.previewUrl || `data:${s.mimeType};base64,${s.data}`}
                          alt={s.name}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setScreenshots(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="p-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm"
                            title="Remove Screenshot"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <span className="absolute bottom-1 left-1 right-1 text-[9px] font-mono text-white bg-black/60 px-1 rounded truncate">
                          {s.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* If Video Input view is active */}
          {visualInputMode === 'video' && (
            <div className="animate-in fade-in duration-200">
              <VideoInputUploader
                videoData={videoData}
                onVideoChange={setVideoData}
                onProcessingChange={setIsExtractingVideo}
                accentColor="teal"
                title="Video Walkthrough Input"
                description="Upload a screen recording or walkthrough video (MP4, WebM, MOV) to extract key UI states and synthesis context."
              />
            </div>
          )}
        </div>

        {/* Refine Instructions / Focus Directives */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Hash size={13} className="text-teal-600" />
              FOCUS DIRECTIVES / CUSTOM PROMPT (OPTIONAL)
            </label>
            <span className="text-[11px] font-mono font-bold text-slate-400">
              {focusDirectives.length}/1000
            </span>
          </div>

          <textarea
            value={focusDirectives}
            maxLength={1000}
            onChange={(e) => setFocusDirectives(e.target.value)}
            placeholder="e.g. 'Focus on edge boundary validations, error banners, responsive drawer interactions, and confirmation modal states.'"
            rows={3}
            className="w-full p-3.5 bg-slate-50/70 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all resize-none leading-relaxed"
          />
        </div>

        {/* Synthesize Button */}
        <div className="pt-2">
          {isSynthesizing ? (
            <div className="w-full py-3.5 bg-teal-50 border border-teal-200 rounded-2xl flex items-center justify-center gap-2 text-teal-800 animate-pulse text-xs font-black">
              <RefreshCw size={15} className="animate-spin text-teal-600" />
              <span>{synthesisStep || 'Synthesizing Test Cases...'}</span>
            </div>
          ) : (
            <button
              id="generate-ai-test-cases-btn"
              type="button"
              disabled={!hasUploadedInput || isSynthesizing}
              onClick={handleSynthesizeTestCases}
              className={`w-full py-3.5 font-black rounded-2xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                hasUploadedInput && !isSynthesizing
                  ? 'bg-[#00B4A0] hover:bg-[#009E8C] text-white shadow-sm hover:shadow-teal-500/20 cursor-pointer active:scale-[0.99]'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none opacity-60 select-none'
              }`}
              title={!hasUploadedInput ? 'Please upload an input (screenshots, video, or requirements document) to enable test case generation' : undefined}
            >
              <Sparkles size={15} className={hasUploadedInput && !isSynthesizing ? 'text-white' : 'text-slate-400'} />
              <span>
                GENERATE AI TEST CASES{' '}
                {screenshots.length > 0
                  ? `(${screenshots.length} IMAGE${screenshots.length > 1 ? 'S' : ''})`
                  : videoData
                  ? '(1 VIDEO)'
                  : reqDocFile
                  ? '(1 DOC)'
                  : ''}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. AMBER ALERT BANNER: BULK SELECTION DYNAMICS (Exact Old UI Match)      */}
      {/* ========================================================================= */}
      <div className="bg-[#FFFDF5] border border-amber-200/80 rounded-2xl p-4 flex items-start gap-3 shadow-2xs">
        <div className="p-1 text-amber-500 shrink-0 mt-0.5">
          <Info size={18} />
        </div>
        <div>
          <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-wider">
            BULK SELECTION DYNAMICS
          </h4>
          <p className="text-[10px] font-bold text-amber-800/90 uppercase tracking-wide mt-0.5">
            BULK SELECTION IS UNLIMITED FOR DELETION. AI GENERATION IS CAPPED AT 30 SCENARIOS PER BATCH TO ENSURE ARTIFACT QUALITY.
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. SUB-TABS: INDIVIDUAL SCENARIOS & FOLDERS (Exact Old UI Match)          */}
      {/* ========================================================================= */}
      <div id="test-cases-repository-view" className="flex gap-8 border-b border-slate-200 px-2 scroll-mt-6">
        <button
          type="button"
          onClick={() => {
            setActiveView('scenarios');
            setSelectedScenarioId('ALL');
          }}
          className={`pb-4 flex items-center gap-2 text-[13px] font-black uppercase tracking-wider relative transition-all cursor-pointer ${
            activeView === 'scenarios'
              ? 'text-teal-600'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <LayoutGrid size={15} />
          <span>INDIVIDUAL SCENARIOS</span>
          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
            searchQuery.trim()
              ? (activeView === 'scenarios' ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-700')
              : (activeView === 'scenarios' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500')
          }`}>
            {searchQuery.trim() ? `${groupedIndividualScenarios.length} matching` : groupedIndividualScenarios.length}
          </span>
          {activeView === 'scenarios' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 rounded-t-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView('folders');
            setSelectedScenarioId('ALL');
          }}
          className={`pb-4 flex items-center gap-2 text-[13px] font-black uppercase tracking-wider relative transition-all cursor-pointer ${
            activeView === 'folders'
              ? 'text-teal-600'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Folder size={15} />
          <span>FOLDERS</span>
          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
            searchQuery.trim()
              ? (activeView === 'folders' ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-700')
              : (activeView === 'folders' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500')
          }`}>
            {searchQuery.trim() ? `${filteredFolders.length} matching` : testCaseFolders.length}
          </span>
          {activeView === 'folders' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 rounded-t-full" />
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* BULK SELECTION ACTION BAR (Shared across Folders & Individual Scenarios)  */}
      {/* ========================================================================= */}
      {((activeView === 'scenarios' && (selectedScenarioIds.size > 0 || selectedCaseIds.size > 0)) ||
        (activeView === 'folders' && selectedCaseIds.size > 0)) && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-slate-900 text-white rounded-2xl shadow-md animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-0.5 bg-teal-400 text-slate-950 text-[11px] font-black rounded-full">
              {activeView === 'scenarios'
                ? (selectedScenarios.length > 0 ? `${selectedScenarios.length} Selected` : `${selectedCaseIds.size} Selected`)
                : `${selectedCaseIds.size} Selected`}
            </span>
            {activeView === 'scenarios' && selectedScenarios.length > 0 && (
              <span className="px-2.5 py-0.5 bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[11px] font-bold rounded-full">
                {selectedScenarios.length} Scenario{selectedScenarios.length > 1 ? 's' : ''}
              </span>
            )}
            <span className="text-xs text-slate-300">Bulk Operations</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeView === 'scenarios' && (
              <button
                type="button"
                onClick={() => {
                  const targets = selectedScenarios.length > 0 
                    ? selectedScenarios 
                    : (approvedScenarios.length > 0 ? [approvedScenarios[0]] : []);
                  if (targets.length > 0) {
                    setScenariosForGenerateModal(targets);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Sparkles size={13} /> Generate AI Test Cases{selectedScenarios.length > 1 ? ` (${selectedScenarios.length} Scenarios)` : ''}
              </button>
            )}
            {activeView === 'folders' && (
              <button
                type="button"
                onClick={handleBulkApprove}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                title="Approve all selected test cases"
              >
                <CheckCircle2 size={13} /> Approve Selected ({selectedCaseIds.size})
              </button>
            )}
            {activeView === 'folders' && (
              <button
                type="button"
                onClick={() => {
                  const hasFolders = testCaseFolders.length > 0;
                  setMoveFolderMode(hasFolders ? 'existing' : 'new');
                  setMoveTargetScenarioId(testCaseFolders[0]?.id || '');
                  setMoveFolderNewName('');
                  setMoveFolderNewModule('');
                  setIsMoveToFolderModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Folder size={13} /> Move to Folder
              </button>
            )}
            <button
              type="button"
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <Trash2 size={13} /> {bulkDeleteInfo.buttonText}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCaseIds(new Set());
                setSelectedScenarioIds(new Set());
              }}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition-all cursor-pointer"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. FOLDERS VIEW (Exact Match to Image Screenshot)                         */}
      {/* ========================================================================= */}
      {activeView === 'folders' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* Folders View Header / Select All Toolbar */}
          {filteredFolders.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={toggleSelectAllFolderCases}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 hover:text-slate-900 transition-all cursor-pointer shadow-2xs"
                  title={isAllFolderCasesSelected ? 'Deselect all test cases across folders' : 'Select all test cases across folders'}
                >
                  {isAllFolderCasesSelected ? (
                    <CheckSquare size={16} className="text-teal-600" />
                  ) : isSomeFolderCasesSelected ? (
                    <CheckSquare size={16} className="text-teal-400" />
                  ) : (
                    <Square size={16} className="text-slate-400" />
                  )}
                  <span>{isAllFolderCasesSelected ? 'Deselect All' : 'Select All'} ({allFolderCases.length})</span>
                </button>

                {selectedCaseIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkApprove}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                    title={`Approve ${selectedCaseIds.size} selected test case(s)`}
                  >
                    <CheckCircle2 size={13} />
                    <span>Approve Selected ({selectedCaseIds.size})</span>
                  </button>
                )}

                {selectedCaseIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Delete Selected ({selectedCaseIds.size})</span>
                  </button>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Showing <strong className="text-slate-800">{filteredFolders.length}</strong> Folders (<strong className="text-slate-800">{allFolderCases.length}</strong> Test Cases)
              </div>
            </div>
          )}

          {filteredFolders.length === 0 ? (
            searchQuery.trim() ? (
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-3">
                <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto">
                  <Search size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">No Matching Folders</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No folders or contained test cases matched &ldquo;{searchQuery}&rdquo;.
                </p>
                <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                  {individualMatchingCasesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveView('scenarios')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer active:scale-95"
                    >
                      <LayoutGrid size={13} /> Switch to Individual Scenarios ({individualMatchingCasesCount} matching)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      toast.info('Search cleared');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <X size={13} /> Clear Search
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-3">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                  <Folder size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">No Folders Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Click "Add Folder" above to create your first folder or synthesize new AI test cases.
                </p>
                <button
                  type="button"
                  onClick={() => setIsAddFolderModalOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  <Plus size={14} /> Add Folder
                </button>
              </div>
            )
          ) : (
            filteredFolders.map(folder => {
              const isExpanded = expandedFolderIds.has(folder.id);
              const q = searchQuery.toLowerCase().trim();
              const rawFolderCases = getFolderCases(folder, project.scenarios || []);
              const matchingFolderCases = q ? rawFolderCases.filter(tc => isTestCaseMatching(tc, q)) : rawFolderCases;
              const folderCases = (q && matchingFolderCases.length > 0) ? matchingFolderCases : rawFolderCases;
              const casesCount = folderCases.length;
              const isAllFolderSelected = casesCount > 0 && folderCases.every(tc => selectedCaseIds.has(tc.id));
              const isSomeFolderSelected = folderCases.some(tc => selectedCaseIds.has(tc.id));

              return (
                <div 
                  key={folder.id} 
                  className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:border-slate-300 transition-all"
                >
                  {/* Folder Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Left: Chevron, Folder Select All Checkbox & Folder Title */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleFolderExpand(folder.id)}
                        className="p-1 text-slate-400 hover:text-slate-700 transition-transform cursor-pointer"
                        title={isExpanded ? 'Collapse folder' : 'Expand folder'}
                      >
                        {isExpanded ? (
                          <ChevronDown size={20} className="text-slate-700" />
                        ) : (
                          <ChevronRight size={20} className="text-slate-400" />
                        )}
                      </button>

                      {casesCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectAllInFolder(folderCases);
                          }}
                          className="p-1 text-slate-400 hover:text-teal-600 transition-colors cursor-pointer shrink-0"
                          title={isAllFolderSelected ? 'Deselect all in this folder' : 'Select all in this folder'}
                        >
                          {isAllFolderSelected ? (
                            <CheckSquare size={18} className="text-teal-600" />
                          ) : isSomeFolderSelected ? (
                            <CheckSquare size={18} className="text-teal-400 opacity-80" />
                          ) : (
                            <Square size={18} className="text-slate-400" />
                          )}
                        </button>
                      )}

                      <h3
                        onClick={() => toggleFolderExpand(folder.id)}
                        className="font-black text-sm sm:text-base text-slate-900 uppercase tracking-tight truncate cursor-pointer hover:text-teal-600 transition-colors"
                        title={folder.title}
                      >
                        {folder.title}
                      </h3>
                    </div>

                    {/* Right: Count Badge, FOLDER Tag, RUN FOLDER button, Action Icons */}
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto flex-wrap">
                      {/* Count Badge */}
                      <span className="text-xs font-black text-teal-600 bg-teal-50 px-2.5 py-1 rounded-lg border border-teal-100">
                        {casesCount}
                      </span>

                      {/* FOLDER Tag Badge */}
                      <span className="bg-[#E6FFFA] text-[#00B4A0] px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase border border-[#B2F5EA]">
                        FOLDER
                      </span>

                      {/* Video Walkthrough Tag Badge */}
                      {Boolean(
                        folder.videoFileName ||
                        folder.videoUrl ||
                        (folder.videoFrames && folder.videoFrames.length > 0) ||
                        (project.scenarios || []).some(s =>
                          ((folder.memberScenarioIds || []).includes(s.id) || s.testCaseFolderId === folder.id) &&
                          (s.videoUrl || s.videoFileName || (s.videoFrames && s.videoFrames.length > 0))
                        )
                      ) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!isExpanded) toggleFolderExpand(folder.id);
                          }}
                          className="bg-teal-50 hover:bg-teal-100 text-teal-800 px-3 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase border border-teal-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Walkthrough video attached to this folder"
                        >
                          <Film size={12} className="text-teal-600" />
                          <span>WALKTHROUGH VIDEO</span>
                        </button>
                      )}

                      {/* RUN FOLDER Button (Exact Match) */}
                      <button
                        type="button"
                        onClick={() => {
                          if (onRunFolder) {
                            onRunFolder(folder.id);
                          } else {
                            toast.success(`Starting execution for folder: "${folder.title}"`);
                          }
                        }}
                        className="flex items-center gap-2 bg-[#00E1C5] hover:bg-[#00C4AC] text-slate-950 font-black px-5 py-2 rounded-full text-[11px] uppercase tracking-wider shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer"
                      >
                        <Play size={13} className="fill-slate-950 text-slate-950" />
                        RUN FOLDER
                      </button>

                      {/* Folder Level APPROVE Button */}
                      {folder.isApproved ? (
                        <button
                          type="button"
                          onClick={() => handleToggleFolderApproval(folder.id)}
                          className="flex items-center gap-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 font-black px-4 py-2 rounded-full text-[11px] uppercase tracking-wider shadow-2xs transition-all cursor-pointer"
                          title="Folder is Approved. Click to unapprove."
                        >
                          <CheckCircle2 size={13} className="text-emerald-700" />
                          <span>APPROVED</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleFolderApproval(folder.id)}
                          className="flex items-center gap-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border-2 border-emerald-500 hover:border-emerald-600 font-black px-4 py-2 rounded-full text-[11px] uppercase tracking-wider shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer"
                          title="Approve this folder and all test cases inside it"
                        >
                          <Check size={13} className="text-emerald-600 stroke-[3]" />
                          <span>APPROVE</span>
                        </button>
                      )}

                      {/* Download Folder test cases Excel / CSV */}
                      <button
                        type="button"
                        onClick={() => handleExportSingleFolder(folder, 'excel')}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                        title="Download Folder Test Cases (Excel)"
                      >
                        <FileSpreadsheet size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportSingleFolder(folder, 'csv')}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                        title="Download Folder Test Cases (CSV)"
                      >
                        <Download size={16} />
                      </button>

                      {/* Add Test Case to Folder */}
                      <button
                        type="button"
                        onClick={() => {
                          setCaseFormScenarioId(folder.id);
                          setEditingCase(null);
                          setCaseForm({
                            title: '',
                            steps: [''],
                            expectedResult: '',
                            status: TestStatus.NOT_EXECUTED,
                            isApproved: false,
                            testType: TestType.FUNCTIONAL,
                            testIntent: TestIntent.POSITIVE,
                            priority: TestPriority.MEDIUM,
                            testDataSets: ['', '']
                          });
                          setIsCaseModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all cursor-pointer"
                        title="Add Test Case to this Folder"
                      >
                        <Plus size={18} />
                      </button>

                      {/* Edit Folder */}
                      <button
                        type="button"
                        onClick={(e) => handleOpenEditFolder(folder, e)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                        title="Edit Folder"
                      >
                        <Edit3 size={16} />
                      </button>

                      {/* Delete Folder */}
                      <button
                        type="button"
                        onClick={() => setDeleteFolderTarget(folder)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        title="Delete Folder"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Test Cases Inside Folder */}
                  {isExpanded && (
                    <div className="mt-5 pt-5 border-t border-slate-100 space-y-3 animate-in slide-in-from-top-1 duration-200">
                      {/* Walkthrough Video Player (if attached to this folder or member scenarios) */}
                      {(() => {
                        const hasDirectVideo = Boolean(
                          folder.videoUrl || 
                          folder.videoFileName || 
                          (folder.videoFrames && folder.videoFrames.length > 0)
                        );
                        
                        let folderVideoData = hasDirectVideo ? {
                          videoUrl: folder.videoUrl,
                          videoFileName: folder.videoFileName,
                          videoDuration: folder.videoDuration,
                          videoFrames: folder.videoFrames,
                          videoSize: folder.videoSize
                        } : null;

                        // Fallback: check member scenarios in this folder for video data
                        if (!folderVideoData) {
                          const memberScenWithVideo = (project.scenarios || []).find(s =>
                            ((folder.memberScenarioIds || []).includes(s.id) ||
                             s.testCaseFolderId === folder.id ||
                             (folder.memberScenarioIds && s.scenarioId && folder.memberScenarioIds.includes(s.scenarioId))) &&
                            (s.videoUrl || s.videoFileName || (s.videoFrames && s.videoFrames.length > 0))
                          );
                          if (memberScenWithVideo) {
                            folderVideoData = {
                              videoUrl: memberScenWithVideo.videoUrl,
                              videoFileName: memberScenWithVideo.videoFileName,
                              videoDuration: memberScenWithVideo.videoDuration,
                              videoFrames: memberScenWithVideo.videoFrames,
                              videoSize: memberScenWithVideo.videoSize
                            };
                          }
                        }

                        if (!folderVideoData) return null;

                        return (
                          <FolderVideoPlayer
                            folderId={folder.id}
                            folderTitle={folder.title}
                            videoUrl={folderVideoData.videoUrl}
                            videoFileName={folderVideoData.videoFileName}
                            videoDuration={folderVideoData.videoDuration}
                            videoFrames={folderVideoData.videoFrames}
                            videoSize={folderVideoData.videoSize}
                            onOpenFramePreview={(frames, idx, title, fName) => {
                              openFramePreview(frames, idx, title, fName);
                            }}
                          />
                        );
                      })()}

                      {/* Scenarios in this folder */}
                      {(() => {
                        const memberScenariosForFolder = (project.scenarios || []).filter(s =>
                          (folder.memberScenarioIds || []).includes(s.id) ||
                          s.testCaseFolderId === folder.id ||
                          (folder.memberScenarioIds && s.scenarioId && folder.memberScenarioIds.includes(s.scenarioId))
                        );
                        if (memberScenariosForFolder.length === 0) return null;
                        return (
                          <div className="bg-teal-50/60 border border-teal-200/80 rounded-2xl p-3 space-y-2 mb-3">
                            <span className="text-[10px] font-black uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                              <FileText size={12} className="text-teal-600" />
                              Scenarios in this Folder ({memberScenariosForFolder.length})
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {memberScenariosForFolder.map(scen => (
                                <div
                                  key={scen.id}
                                  className="text-xs font-semibold text-slate-800 bg-white border border-teal-200/80 rounded-xl px-2.5 py-1 flex items-center gap-1.5 shadow-2xs"
                                  title={scen.description || scen.title}
                                >
                                  {scen.scenarioId && (
                                    <span className="font-mono text-[10px] font-black text-teal-700 bg-teal-50 px-1 py-0.5 rounded">
                                      {scen.scenarioId}
                                    </span>
                                  )}
                                  <span className="truncate max-w-[280px]">{scen.title}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {folderCases.length === 0 ? (
                        <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                          This folder is currently empty. Click '+' to add a test case or synthesize new test cases.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {folderCases.map((tc, tcIdx) => {
                            const isTcSelected = selectedCaseIds.has(tc.id);
                            const isTcExpanded = expandedCaseIds.has(tc.id);

                            return (
                              <div
                                key={tc.id}
                                className={`bg-slate-50/60 rounded-xl border transition-all ${
                                  isTcSelected 
                                    ? 'border-teal-500 bg-teal-50/20' 
                                    : 'border-slate-200/80 hover:border-slate-300'
                                }`}
                              >
                                <div 
                                  onClick={() => toggleExpand(tc.id)}
                                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                                >
                                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelectCase(tc.id);
                                      }}
                                      className="mt-0.5 sm:mt-0 text-slate-400 hover:text-teal-600 cursor-pointer"
                                    >
                                      {isTcSelected ? <CheckSquare size={16} className="text-teal-600" /> : <Square size={16} />}
                                    </button>

                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-mono text-[10px] font-black text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                          {tc.testCaseId || `TC-${tcIdx + 1}`}
                                        </span>

                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                                          tc.priority === TestPriority.HIGH 
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                            : tc.priority === TestPriority.LOW
                                            ? 'bg-slate-100 text-slate-600'
                                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                                        }`}>
                                          {tc.priority || 'Medium'}
                                        </span>

                                        <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded uppercase">
                                          {tc.testType || 'Functional'}
                                        </span>

                                        {(() => {
                                          const parentScen = (project.scenarios || []).find(s =>
                                            s.id === tc.scenarioId ||
                                            (s.testCases || []).some(c => c.id === tc.id || c.testCaseId === tc.testCaseId)
                                          );
                                          if (!parentScen) return null;
                                          return (
                                            <span 
                                              className="text-[9px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded flex items-center gap-1 max-w-[180px] truncate"
                                              title={`Scenario: ${parentScen.title}`}
                                            >
                                              <FileText size={10} className="text-teal-600 shrink-0" />
                                              <span className="truncate">{parentScen.title}</span>
                                            </span>
                                          );
                                        })()}
                                      </div>

                                      <h4 className="text-xs font-bold text-slate-800 mt-1 truncate">
                                        {tc.title}
                                      </h4>
                                    </div>
                                  </div>

                                  {/* Test Case Action Buttons */}
                                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                    {/* Test Case Level APPROVE Button */}
                                    {tc.isApproved ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleApproval(folder.id, tc.id);
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100/90 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                                        title="Approved. Click to unapprove."
                                      >
                                        <CheckCircle2 size={12} className="text-emerald-700" />
                                        <span>APPROVED</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleApproval(folder.id, tc.id);
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border border-emerald-400 hover:border-emerald-500 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs active:scale-95"
                                        title="Approve Test Case"
                                      >
                                        <Check size={12} className="text-emerald-600 stroke-[3]" />
                                        <span>APPROVE</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCase({ scenarioId: folder.id, testCase: tc });
                                        setCaseFormScenarioId(folder.id);
                                        setCaseForm({
                                          title: tc.title,
                                          steps: tc.steps || [''],
                                          expectedResult: tc.expectedResult,
                                          status: tc.status,
                                          isApproved: tc.isApproved,
                                          testType: tc.testType,
                                          testIntent: tc.testIntent,
                                          priority: tc.priority,
                                          testDataSets: tc.testDataSets || ['', '']
                                        });
                                        setIsCaseModalOpen(true);
                                      }}
                                      className="p-1.5 hover:bg-white text-slate-400 hover:text-slate-700 rounded-lg border border-transparent hover:border-slate-200"
                                      title="Edit Test Case"
                                    >
                                      <Pencil size={13} />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => handleExportSingleTestCase(folder.title, folder.moduleName || 'General', tc, 'excel', e)}
                                      className="p-1.5 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg cursor-pointer"
                                      title="Download Test Case (Excel)"
                                    >
                                      <FileSpreadsheet size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleExportSingleTestCase(folder.title, folder.moduleName || 'General', tc, 'csv', e)}
                                      className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                                      title="Download Test Case (CSV)"
                                    >
                                      <Download size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteTarget({ scenarioId: folder.id, testCaseId: tc.id, title: tc.title });
                                      }}
                                      className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg"
                                      title="Delete Test Case"
                                    >
                                      <Trash2 size={13} />
                                    </button>

                                    <div className="p-1 text-slate-400">
                                      {isTcExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                    </div>
                                  </div>
                                </div>

                                {/* Expanded Steps and Details */}
                                {isTcExpanded && (
                                  <div className="px-4 pb-4 pt-1 border-t border-slate-200/60 space-y-3 bg-white rounded-b-xl">
                                    <div>
                                      <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                                        Steps ({tc.steps?.length || 0})
                                      </h5>
                                      <ol className="space-y-1 bg-slate-50 rounded-lg p-2.5 text-xs text-slate-700 font-medium">
                                        {(tc.steps || []).map((step, sIdx) => (
                                          <li key={sIdx} className="flex items-start gap-2">
                                            <span className="font-mono text-slate-400 font-bold shrink-0">{sIdx + 1}.</span>
                                            <div>{renderStepWithFrameTags(step, folder.password)}</div>
                                          </li>
                                        ))}
                                      </ol>
                                    </div>

                                    <div>
                                      <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                        Expected Result
                                      </h5>
                                      <div className="p-2.5 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs text-emerald-950 font-medium leading-relaxed">
                                        {tc.expectedResult}
                                      </div>
                                    </div>

                                    {tc.testDataSets && tc.testDataSets.length > 0 && (
                                      <div>
                                        <h5 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                          Test Data
                                        </h5>
                                        <div className="flex flex-wrap gap-1.5">
                                          {tc.testDataSets.map((ds, dIdx) => (
                                            <span key={dIdx} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] font-mono">
                                              {ds}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. INDIVIDUAL SCENARIOS VIEW                                              */}
      {/* ========================================================================= */}
      {activeView === 'scenarios' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* Listing Header */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              {groupedIndividualScenarios.length > 0 && groupedIndividualScenarios.every(({ scenario, testCases }) => 
                selectedScenarioIds.has(scenario.id) || (testCases.length > 0 && testCases.every(tc => selectedCaseIds.has(tc.id)))
              ) ? (
                <CheckSquare size={16} className="text-teal-600" />
              ) : (
                <Square size={16} className="text-slate-400" />
              )}
              Select All Visible ({groupedIndividualScenarios.length})
            </button>

            <div className="text-xs text-slate-500">
              Showing <strong className="text-slate-800">{groupedIndividualScenarios.length}</strong> Scenarios
            </div>
          </div>

          {/* Individual Scenarios List */}
          {groupedIndividualScenarios.length === 0 ? (
            searchQuery.trim() ? (
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-3">
                <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center mx-auto">
                  <Search size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">No Matching Test Cases</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No test cases or scenarios in Individual Scenarios matched &ldquo;{searchQuery}&rdquo;.
                </p>
                <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
                  {folderMatchingCasesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveView('folders')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer active:scale-95"
                    >
                      <Folder size={13} /> Switch to Folders ({folderMatchingCasesCount} matching)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      toast.info('Search cleared');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <X size={13} /> Clear Search
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-3">
                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
                  <FileText size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-800">
                  {approvedScenarios.length === 0 ? 'No Approved Scenarios Found' : 'No Matching Scenarios'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {approvedScenarios.length === 0
                    ? 'Approve test scenarios from the AI Scenarios page to view and manage them individually here.'
                    : 'Adjust your search query or filters above to find matching scenarios.'}
                </p>
              </div>
            )
          ) : (
            groupedIndividualScenarios.map(({ scenario, testCases }) => {
              const isCollapsed = collapsedScenarioIds.has(scenario.id);
              const resolvedUsSummary = getResolvedUserStorySummary(scenario);
              const isScenarioSelected = selectedScenarioIds.has(scenario.id) || (testCases.length > 0 && testCases.every(tc => selectedCaseIds.has(tc.id)));
              const isSomeScenSelected = !isScenarioSelected && (selectedScenarioIds.has(scenario.id) || testCases.some(tc => selectedCaseIds.has(tc.id)));
              const isScenarioApproved = testCases.length > 0 && testCases.every(tc => Boolean(tc.isApproved));

              return (
                <div
                  key={scenario.id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all p-5 space-y-4"
                >
                  {/* ================================================================= */}
                  {/* 1. USER STORY SUMMARY - DISPLAY FIRST                             */}
                  {/* ================================================================= */}
                  <div className="bg-indigo-50/50 border border-indigo-100/90 rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                      <span className="text-[10px] font-black text-indigo-700 bg-white border border-indigo-200/80 px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0 flex items-center gap-1.5 shadow-2xs">
                        <Bookmark size={12} className="text-indigo-600" />
                        User Story Summary
                        {scenario.userStoryNumber && (
                          <span className="font-mono text-indigo-900 font-extrabold ml-1">
                            ({scenario.userStoryNumber})
                          </span>
                        )}
                      </span>
                      <p className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
                        {resolvedUsSummary || (scenario.userStoryNumber ? `User Story ${scenario.userStoryNumber}` : 'General / No User Story')}
                      </p>
                    </div>
                    {scenario.userStoryNumber && (
                      <span className="text-[10px] font-mono font-bold text-indigo-600 bg-white px-2 py-0.5 rounded border border-indigo-100 shrink-0 self-start sm:self-auto">
                        JIRA: {scenario.userStoryNumber}
                      </span>
                    )}
                  </div>

                  {/* ================================================================= */}
                  {/* 2. SCENARIO TITLE - DISPLAY SECOND                                */}
                  {/* ================================================================= */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                      {/* Scenario Selection Checkbox */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectScenario(scenario.id, testCases);
                        }}
                        className="p-1 text-slate-400 hover:text-teal-600 transition-colors cursor-pointer mt-0.5 sm:mt-0 shrink-0"
                        title={isScenarioSelected ? 'Deselect this scenario' : 'Select this scenario'}
                      >
                        {isScenarioSelected ? (
                          <CheckSquare size={18} className="text-teal-600" />
                        ) : isSomeScenSelected ? (
                          <CheckSquare size={18} className="text-teal-400 opacity-80" />
                        ) : (
                          <Square size={18} className="text-slate-400" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleScenarioCollapse(scenario.id)}
                        className="p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer mt-0.5 sm:mt-0 shrink-0"
                        title={isCollapsed ? 'Expand scenario details' : 'Collapse scenario details'}
                      >
                        {isCollapsed ? (
                          <ChevronRight size={18} className="text-slate-500" />
                        ) : (
                          <ChevronDown size={18} className="text-slate-700" />
                        )}
                      </button>

                      <span className="text-[10px] font-black text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg uppercase tracking-wider shrink-0 flex items-center gap-1.5">
                        <FileText size={12} className="text-teal-600" />
                        Scenario Title
                        {scenario.scenarioId && (
                          <span className="font-mono text-teal-900 font-extrabold ml-1">
                            ({scenario.scenarioId})
                          </span>
                        )}
                      </span>

                      <h3
                        onClick={() => toggleScenarioCollapse(scenario.id)}
                        className="text-sm sm:text-base font-black text-slate-900 tracking-tight cursor-pointer hover:text-teal-600 transition-colors"
                        title={scenario.title}
                      >
                        {scenario.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto flex-wrap">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md uppercase ${
                        scenario.priority === 'High' 
                          ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                          : scenario.priority === 'Low'
                          ? 'bg-slate-50 text-slate-600 border border-slate-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {scenario.priority || 'Medium'}
                      </span>

                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-0.5 rounded-md uppercase">
                        {scenario.type || 'Functional'}
                      </span>

                      {(() => {
                        const folder = (project.scenarios || []).find(f => 
                          (f.id === scenario.folderId || (f.memberScenarioIds && f.memberScenarioIds.includes(scenario.id))) && 
                          (isTestCaseFolder(f) || f.scenarioId === 'SCENARIO_FOLDER' || f.folderType === 'scenario' || f.isFolder)
                        );
                        if (!folder) return null;
                        return (
                          <span 
                            className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs"
                            title={`In Folder: ${folder.title}`}
                          >
                            <Folder size={11} className="text-teal-600" />
                            <span className="max-w-[120px] truncate">{folder.title}</span>
                          </span>
                        );
                      })()}

                      {/* Quick Scenario Action Buttons */}
                      <div className="flex items-center gap-1 ml-1 border-l border-slate-200 pl-2">
                        <button
                          type="button"
                          onClick={() => setScenariosForGenerateModal([scenario])}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Generate AI Test Cases for this Scenario"
                        >
                          <Sparkles size={14} />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setCaseFormScenarioId(scenario.id);
                            setEditingCase(null);
                            setCaseForm({
                              title: '',
                              steps: [''],
                              expectedResult: '',
                              status: TestStatus.NOT_EXECUTED,
                              isApproved: false,
                              testType: TestType.FUNCTIONAL,
                              testIntent: TestIntent.POSITIVE,
                              priority: TestPriority.MEDIUM,
                              testDataSets: ['', '']
                            });
                            setIsCaseModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
                          title="Add Test Case to this Scenario"
                        >
                          <Plus size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedScenarioIds(new Set([scenario.id]));
                            setIsBulkDeleteModalOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete this Scenario"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ================================================================= */}
                  {/* 3. SCENARIO DESCRIPTION - DISPLAY IN ONE LINE (MATCHING SAVED SCENARIOS) */}
                  {/* ================================================================= */}
                  {scenario.description && (
                    <div className="w-full text-left">
                      <p 
                        className="text-xs sm:text-sm text-slate-600 font-normal leading-relaxed truncate"
                        title={maskPasswordText((scenario.description || '').replace(/\\n/g, ' ').replace(/\r?\n+/g, ' ').trim(), scenario.password || defaultPassword)}
                      >
                        <span className="font-semibold text-slate-700">Description: </span>
                        {maskPasswordText((scenario.description || '').replace(/\\n/g, ' ').replace(/\r?\n+/g, ' ').trim(), scenario.password || defaultPassword)}
                      </p>
                    </div>
                  )}

                  {/* ================================================================= */}
                  {/* 4. EXPANDABLE DETAILS & TEST CASES (WHEN EXPANDED)                */}
                  {/* ================================================================= */}
                  {!isCollapsed && (
                    <div className="pt-3 border-t border-slate-100 space-y-3 animate-in slide-in-from-top-1 duration-150">
                      {/* Expected Results */}
                      {scenario.expectedResults && (
                        <div className="w-full text-left bg-slate-50 border border-slate-200/70 rounded-xl p-3 text-xs text-slate-700">
                          <span className="font-semibold text-slate-800">Expected Result: </span>
                          {scenario.expectedResults}
                        </div>
                      )}

                      {/* Test Cases inside Scenario */}
                      {testCases.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] font-black text-slate-600 uppercase tracking-wider">
                              Test Cases ({testCases.length})
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setCaseFormScenarioId(scenario.id);
                                setEditingCase(null);
                                setCaseForm({
                                  title: '',
                                  steps: [''],
                                  expectedResult: '',
                                  status: TestStatus.NOT_EXECUTED,
                                  isApproved: false,
                                  testType: TestType.FUNCTIONAL,
                                  testIntent: TestIntent.POSITIVE,
                                  priority: TestPriority.MEDIUM,
                                  testDataSets: ['', '']
                                });
                                setIsCaseModalOpen(true);
                              }}
                              className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                            >
                              <Plus size={13} /> Add Test Case
                            </button>
                          </div>

                          {testCases.map((tc, tcIdx) => {
                            const isTcSelected = selectedCaseIds.has(tc.id);
                            const isTcExpanded = expandedCaseIds.has(tc.id);

                            return (
                              <div
                                key={tc.id}
                                className={`border rounded-xl transition-all ${
                                  isTcSelected ? 'border-teal-300 bg-teal-50/20' : 'border-slate-200/80 bg-slate-50/40 hover:bg-slate-50'
                                }`}
                              >
                                <div 
                                  onClick={() => toggleExpand(tc.id)}
                                  className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                                >
                                  <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelectCase(tc.id);
                                      }}
                                      className="mt-0.5 sm:mt-0 text-slate-400 hover:text-teal-600 cursor-pointer"
                                    >
                                      {isTcSelected ? <CheckSquare size={16} className="text-teal-600" /> : <Square size={16} />}
                                    </button>

                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-mono text-[10px] font-black text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                          {tc.testCaseId || `TC-${tcIdx + 1}`}
                                        </span>

                                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${
                                          tc.priority === TestPriority.HIGH 
                                            ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                                            : tc.priority === TestPriority.LOW
                                            ? 'bg-slate-100 text-slate-600'
                                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                                        }`}>
                                          {tc.priority || 'Medium'}
                                        </span>

                                        <span className="text-[9px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded uppercase">
                                          {tc.testType || 'Functional'}
                                        </span>
                                      </div>

                                      <h4 className="text-xs font-bold text-slate-800 mt-1 truncate">
                                        {tc.title}
                                      </h4>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                                    {tc.isApproved ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleApproval(scenario.id, tc.id);
                                        }}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100/90 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                                        title="Approved. Click to unapprove."
                                      >
                                        <CheckCircle2 size={11} className="text-emerald-700" />
                                        <span>APPROVED</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleApproval(scenario.id, tc.id);
                                        }}
                                        className="flex items-center gap-1 px-2 py-0.5 bg-white hover:bg-emerald-50 text-emerald-700 hover:text-emerald-800 border border-emerald-400 hover:border-emerald-500 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs active:scale-95"
                                        title="Approve Test Case"
                                      >
                                        <Check size={11} className="text-emerald-600 stroke-[3]" />
                                        <span>APPROVE</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingCase({ scenarioId: scenario.id, testCase: tc });
                                        setCaseFormScenarioId(scenario.id);
                                        setCaseForm({
                                          title: tc.title,
                                          steps: tc.steps || [''],
                                          expectedResult: tc.expectedResult,
                                          status: tc.status || TestStatus.NOT_EXECUTED,
                                          isApproved: Boolean(tc.isApproved),
                                          testType: tc.testType || TestType.FUNCTIONAL,
                                          testIntent: tc.testIntent || TestIntent.POSITIVE,
                                          priority: tc.priority || TestPriority.MEDIUM,
                                          testDataSets: tc.testDataSets || ['', '']
                                        });
                                        setIsCaseModalOpen(true);
                                      }}
                                      className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
                                      title="Edit Test Case"
                                    >
                                      <Edit3 size={13} />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteTarget({ scenarioId: scenario.id, testCaseId: tc.id, title: tc.title });
                                      }}
                                      className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                      title="Delete Test Case"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {isTcExpanded && (
                                  <div className="px-3.5 pb-3.5 pt-1 text-xs space-y-2 border-t border-slate-100 bg-white/70 rounded-b-xl animate-in slide-in-from-top-1 duration-150">
                                    <div>
                                      <p className="font-bold text-slate-700 mb-1">Steps to Execute:</p>
                                      <ol className="list-decimal list-inside space-y-0.5 text-slate-600 pl-1">
                                        {(tc.steps || []).map((step, sIdx) => (
                                          <li key={sIdx} className="leading-relaxed">{step}</li>
                                        ))}
                                      </ol>
                                    </div>
                                    {tc.expectedResult && (
                                      <div>
                                        <p className="font-bold text-slate-700 mb-0.5">Expected Result:</p>
                                        <p className="text-slate-600 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                                          {tc.expectedResult}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 bg-slate-50/60 border border-dashed border-slate-200 rounded-xl text-xs text-slate-500">
                          <span>No test cases generated yet for this scenario.</span>
                          <button
                            type="button"
                            onClick={() => setScenariosForGenerateModal([scenario])}
                            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                          >
                            <Sparkles size={12} /> Generate AI Test Cases
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. ADD FOLDER MODAL                                                       */}
      {/* ========================================================================= */}
      {isAddFolderModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FolderPlus size={18} className="text-teal-600" />
                Add New Folder
              </h3>
              <button 
                type="button"
                onClick={() => setIsAddFolderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Folder Name *</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. REPORTS PAGE N"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Module / Tag (Optional)</label>
                <input
                  type="text"
                  value={newFolderModule}
                  onChange={(e) => setNewFolderModule(e.target.value)}
                  placeholder="e.g. Reports"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddFolderModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateFolder}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                Create Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. DELETE FOLDER CONFIRMATION MODAL                                       */}
      {/* ========================================================================= */}
      {deleteFolderTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-100 text-center">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">Delete Folder?</h3>
            <p className="text-xs text-slate-500">
              Are you sure you want to delete folder <strong className="text-slate-800">"{deleteFolderTarget.title}"</strong> and all its {deleteFolderTarget.testCases?.length || 0} test cases? This action cannot be undone.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteFolderTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteFolder(deleteFolderTarget.id)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. ADD / EDIT TEST CASE MODAL                                             */}
      {/* ========================================================================= */}
      {isCaseModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <FileText size={18} className="text-teal-600" />
                {editingCase ? 'Edit Test Case' : 'Add Test Case'}
              </h3>
              <button 
                type="button"
                onClick={() => {
                  setIsCaseModalOpen(false);
                  setEditingCase(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Folder or Scenario *</label>
                <select
                  value={caseFormScenarioId}
                  onChange={(e) => setCaseFormScenarioId(e.target.value)}
                  disabled={Boolean(editingCase)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                >
                  <option value="">Select Folder or Scenario</option>
                  {testCaseFolders.length > 0 && (
                    <optgroup label="AI Test Case Folders">
                      {testCaseFolders.map(s => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </optgroup>
                  )}
                  {approvedScenarios.length > 0 && (
                    <optgroup label="Approved Scenarios">
                      {approvedScenarios.map(s => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={caseForm.title || ''}
                  onChange={(e) => setCaseForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Verify user can export summary report"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={caseForm.priority || TestPriority.MEDIUM}
                    onChange={(e) => setCaseForm(prev => ({ ...prev, priority: e.target.value as TestPriority }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value={TestPriority.HIGH}>High</option>
                    <option value={TestPriority.MEDIUM}>Medium</option>
                    <option value={TestPriority.LOW}>Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Type</label>
                  <select
                    value={caseForm.testType || TestType.FUNCTIONAL}
                    onChange={(e) => setCaseForm(prev => ({ ...prev, testType: e.target.value as TestType }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value={TestType.FUNCTIONAL}>Functional</option>
                    <option value={TestType.UI}>UI</option>
                    <option value={TestType.NON_FUNCTIONAL}>Non-Functional</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">Execution Steps</label>
                  <button
                    type="button"
                    onClick={() => setCaseForm(prev => ({ ...prev, steps: [...(prev.steps || []), ''] }))}
                    className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Step
                  </button>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {(caseForm.steps || ['']).map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400 w-5">{idx + 1}.</span>
                      <input
                        type="text"
                        value={step}
                        onChange={(e) => {
                          const updated = [...(caseForm.steps || [])];
                          updated[idx] = e.target.value;
                          setCaseForm(prev => ({ ...prev, steps: updated }));
                        }}
                        placeholder={`Step ${idx + 1}`}
                        className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                      />
                      {(caseForm.steps || []).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (caseForm.steps || []).filter((_, i) => i !== idx);
                            setCaseForm(prev => ({ ...prev, steps: updated }));
                          }}
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expected Result</label>
                <textarea
                  value={caseForm.expectedResult || ''}
                  onChange={(e) => setCaseForm(prev => ({ ...prev, expectedResult: e.target.value }))}
                  placeholder="e.g. Exported report file is downloaded with accurate data"
                  rows={2}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsCaseModalOpen(false);
                  setEditingCase(null);
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTestCase}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                {editingCase ? 'Save Changes' : 'Add Test Case'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 10. MOVE TO FOLDER MODAL                                                  */}
      {/* ========================================================================= */}
      {isMoveToFolderModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Folder size={18} className="text-teal-600" />
                  Move to Folder
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Moving {selectedCaseIds.size} test case{selectedCaseIds.size !== 1 ? 's' : ''} across {(() => {
                    const sIds = new Set<string>();
                    individualCasesWithScenario.forEach(item => {
                      if (selectedCaseIds.has(item.testCase.id)) sIds.add(item.scenario.id);
                    });
                    return `${sIds.size} scenario${sIds.size !== 1 ? 's' : ''}`;
                  })()}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => setIsMoveToFolderModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mode selector: Move to Existing Folder vs Create New Folder */}
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setMoveFolderMode('existing')}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  moveFolderMode === 'existing'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Folder size={13} className={moveFolderMode === 'existing' ? 'text-teal-600' : ''} />
                Existing Folder {testCaseFolders.length > 0 ? `(${testCaseFolders.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setMoveFolderMode('new')}
                className={`flex-1 py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  moveFolderMode === 'new'
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Plus size={13} />
                Create New Folder
              </button>
            </div>

            <div className="space-y-3">
              {moveFolderMode === 'existing' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Select Destination Folder</label>
                  {testCaseFolders.length === 0 ? (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 space-y-2">
                      <p>No folders exist in AI Test Cases yet.</p>
                      <button
                        type="button"
                        onClick={() => setMoveFolderMode('new')}
                        className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 underline cursor-pointer"
                      >
                        <Plus size={12} /> Switch to "Create New Folder"
                      </button>
                    </div>
                  ) : (
                    <select
                      value={moveTargetScenarioId}
                      onChange={(e) => setMoveTargetScenarioId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                    >
                      <option value="" disabled>Choose a destination folder...</option>
                      {testCaseFolders.map(s => (
                        <option key={s.id} value={s.id}>{s.title} ({s.testCases?.length || 0} cases)</option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      New Folder Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={moveFolderNewName}
                      onChange={(e) => setMoveFolderNewName(e.target.value)}
                      placeholder="e.g., Checkout & Payment Flows"
                      autoFocus
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Module / Category <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={moveFolderNewModule}
                      onChange={(e) => setMoveFolderNewModule(e.target.value)}
                      placeholder="e.g., Core Automation, Billing, User Management"
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsMoveToFolderModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={moveFolderMode === 'existing' ? (!moveTargetScenarioId || testCaseFolders.length === 0) : !moveFolderNewName.trim()}
                onClick={() => {
                  const casesToMove: TestCase[] = [];
                  const movedScenarioIds = new Set<string>();

                  individualCasesWithScenario.forEach(item => {
                    if (selectedCaseIds.has(item.testCase.id)) {
                      casesToMove.push(item.testCase);
                      movedScenarioIds.add(item.scenario.id);
                    }
                  });

                  if (casesToMove.length === 0) {
                    toast.error('No test cases selected to move');
                    return;
                  }

                  if (moveFolderMode === 'new') {
                    const trimmedName = moveFolderNewName.trim();
                    if (!trimmedName) {
                      toast.error('Please enter a folder name');
                      return;
                    }

                    const existingFolder = testCaseFolders.find(f => 
                      (f.title || '').trim().toLowerCase() === trimmedName.toLowerCase()
                    );

                    let targetFolderId = '';
                    let isNew = false;
                    let newFolder: TestScenario | null = null;

                    if (existingFolder) {
                      targetFolderId = existingFolder.id;
                    } else {
                      targetFolderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
                      isNew = true;
                      newFolder = {
                        id: targetFolderId,
                        scenarioId: 'TESTCASE_FOLDER',
                        isFolder: true,
                        folderType: 'testcase',
                        title: trimmedName,
                        type: 'Functional',
                        description: `Folder containing ${casesToMove.length} test cases`,
                        expectedResults: '',
                        isApproved: true,
                        moduleName: moveFolderNewModule.trim() || 'General',
                        createdAt: new Date().toISOString(),
                        testCases: casesToMove,
                        saved: true,
                        memberScenarioIds: Array.from(movedScenarioIds)
                      };
                    }

                    // Update existing scenarios:
                    const updatedExistingScenarios = (project.scenarios || []).map(scen => {
                      if (!isNew && scen.id === targetFolderId) {
                        const existing = scen.testCases || [];
                        const existingIds = new Set(existing.map((c: any) => c.id));
                        const uniqueNew = casesToMove.filter(c => !existingIds.has(c.id));
                        const mergedMembers = Array.from(new Set([...(scen.memberScenarioIds || []), ...Array.from(movedScenarioIds)]));
                        return {
                          ...scen,
                          scenarioId: 'TESTCASE_FOLDER',
                          folderType: 'testcase',
                          isFolder: true,
                          saved: true,
                          testCases: [...existing, ...uniqueNew],
                          memberScenarioIds: mergedMembers
                        };
                      }
                      if (movedScenarioIds.has(scen.id)) {
                        const remainingCases = (scen.testCases || []).filter(tc => !selectedCaseIds.has(tc.id));
                        const allCasesMoved = remainingCases.length === 0;
                        return {
                          ...scen,
                          testCases: allCasesMoved
                            ? (scen.testCases && scen.testCases.length > 0 ? scen.testCases : casesToMove.filter(c => c.id.startsWith(`TC-${scen.id}`) || c.scenarioId === scen.id || movedScenarioIds.size === 1))
                            : remainingCases,
                          isRemovedFromIndividual: allCasesMoved ? true : scen.isRemovedFromIndividual,
                          testCaseFolderId: targetFolderId,
                          folderId: targetFolderId,
                          folderName: trimmedName,
                          saved: true
                        };
                      }
                      if (scen.isFolder && scen.id !== targetFolderId && Array.isArray(scen.memberScenarioIds)) {
                        if (scen.memberScenarioIds.some(id => movedScenarioIds.has(id))) {
                          return {
                            ...scen,
                            memberScenarioIds: scen.memberScenarioIds.filter(id => !movedScenarioIds.has(id))
                          };
                        }
                      }
                      return scen;
                    });

                    const finalScenarios = isNew && newFolder 
                      ? [newFolder, ...updatedExistingScenarios] 
                      : updatedExistingScenarios;

                    onUpdateProject({ ...project, scenarios: finalScenarios });
                    setSelectedCaseIds(new Set());
                    setIsMoveToFolderModalOpen(false);
                    setSelectedScenarioId(targetFolderId);
                    setActiveView('folders');
                    setExpandedFolderIds(prev => new Set([...Array.from(prev), targetFolderId]));
                    setMoveFolderNewName('');
                    setMoveFolderNewModule('');
                    toast.success(`Moved ${movedScenarioIds.size} scenario${movedScenarioIds.size > 1 ? 's' : ''} to folder "${trimmedName}"`);
                    return;
                  }

                  // Mode === 'existing'
                  if (!moveTargetScenarioId) return;

                  const targetFolder = (project.scenarios || []).find(s => s.id === moveTargetScenarioId);
                  const targetFolderName = targetFolder?.title || 'Selected Folder';

                  const updatedScenarios = (project.scenarios || []).map(scen => {
                    if (movedScenarioIds.has(scen.id)) {
                      const remainingCases = (scen.testCases || []).filter(tc => !selectedCaseIds.has(tc.id));
                      const allCasesMoved = remainingCases.length === 0;
                      return {
                        ...scen,
                        testCases: allCasesMoved
                          ? (scen.testCases && scen.testCases.length > 0 ? scen.testCases : casesToMove.filter(c => c.id.startsWith(`TC-${scen.id}`) || c.scenarioId === scen.id || movedScenarioIds.size === 1))
                          : remainingCases,
                        isRemovedFromIndividual: allCasesMoved ? true : scen.isRemovedFromIndividual,
                        testCaseFolderId: moveTargetScenarioId,
                        folderId: moveTargetScenarioId,
                        saved: true
                      };
                    }
                    if (scen.id === moveTargetScenarioId) {
                      const existing = scen.testCases || [];
                      const existingIds = new Set(existing.map((c: any) => c.id));
                      const uniqueNew = casesToMove.filter(c => !existingIds.has(c.id));
                      const mergedMembers = Array.from(new Set([...(scen.memberScenarioIds || []), ...Array.from(movedScenarioIds)]));
                      return {
                        ...scen,
                        isFolder: true,
                        saved: true,
                        testCases: [...existing, ...uniqueNew],
                        memberScenarioIds: mergedMembers
                      };
                    }
                    return scen;
                  });

                  onUpdateProject({ ...project, scenarios: updatedScenarios });
                  setSelectedCaseIds(new Set());
                  setIsMoveToFolderModalOpen(false);
                  setSelectedScenarioId(moveTargetScenarioId);
                  setActiveView('folders');
                  setExpandedFolderIds(prev => new Set([...Array.from(prev), moveTargetScenarioId]));
                  toast.success(`Moved ${movedScenarioIds.size} scenario${movedScenarioIds.size > 1 ? 's' : ''} to "${targetFolderName}" successfully`);
                }}
                className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                {moveFolderMode === 'new' ? 'Create & Move' : 'Move to Folder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 11. KEYFRAME INSPECTOR MODAL                                              */}
      {/* ========================================================================= */}
      {previewFrameModal.isOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 text-white rounded-3xl max-w-4xl w-full p-6 space-y-4 shadow-2xl border border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Film size={16} className="text-teal-400" />
                  {previewFrameModal.title}
                </h3>
                {previewFrameModal.videoFileName && (
                  <span className="text-[11px] text-slate-400">Video Source: {previewFrameModal.videoFileName}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPreviewFrameModal(prev => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            {previewFrameModal.frames[previewFrameModal.currentFrameIndex] && (
              <div className="space-y-3">
                <div className="relative aspect-video bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800">
                  <img
                    src={previewFrameModal.frames[previewFrameModal.currentFrameIndex].image}
                    alt={`Keyframe ${previewFrameModal.currentFrameIndex + 1}`}
                    className="max-h-full max-w-full object-contain"
                  />
                  <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono text-teal-300 font-bold border border-teal-500/30">
                    Frame {previewFrameModal.currentFrameIndex + 1} of {previewFrameModal.frames.length}
                    {previewFrameModal.frames[previewFrameModal.currentFrameIndex].timestamp && (
                      <span className="ml-2 text-white">@{previewFrameModal.frames[previewFrameModal.currentFrameIndex].timestamp}</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto py-2 scrollbar-thin">
                  {previewFrameModal.frames.map((frame, fIdx) => (
                    <button
                      key={fIdx}
                      type="button"
                      onClick={() => setPreviewFrameModal(prev => ({ ...prev, currentFrameIndex: fIdx }))}
                      className={`relative shrink-0 w-24 h-14 rounded-lg overflow-hidden border transition-all ${
                        fIdx === previewFrameModal.currentFrameIndex
                          ? 'border-teal-400 ring-2 ring-teal-400/40'
                          : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={frame.image} alt="" className="w-full h-full object-cover" />
                      <span className="absolute bottom-0.5 right-1 text-[9px] font-mono text-white bg-black/70 px-1 rounded">
                        #{fIdx + 1}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 12. DELETE CONFIRMATION MODALS                                            */}
      {/* ========================================================================= */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-100 text-center">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">Delete Test Case?</h3>
            <p className="text-xs text-slate-500">
              Are you sure you want to delete <strong className="text-slate-800">"{deleteTarget.title}"</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetCaseId = deleteTarget.testCaseId;
                  const targetScenarioId = deleteTarget.scenarioId;
                  const tombstonesToAdd: string[] = [targetCaseId];

                  const updatedScenarios = (project.scenarios || []).map(scen => {
                    if (scen.id === targetScenarioId) {
                      const virtualCaseId = `TC-${scen.id}`;
                      const isVirtual = targetCaseId === virtualCaseId || targetCaseId === scen.id;
                      const hadExplicitCases = scen.testCases && scen.testCases.length > 0;
                      if (hadExplicitCases) {
                        const remaining = (scen.testCases || []).filter(tc => tc.id !== targetCaseId);
                        if (remaining.length === 0 || isVirtual) {
                          tombstonesToAdd.push(scen.id, virtualCaseId);
                          return { ...scen, testCases: [], isApproved: false, isRemovedFromIndividual: true };
                        }
                        return { ...scen, testCases: remaining };
                      } else {
                        tombstonesToAdd.push(scen.id, virtualCaseId);
                        return { ...scen, testCases: [], isApproved: false, isRemovedFromIndividual: true };
                      }
                    }

                    // Check if case belongs to this scenario or member scenario
                    if (scen.testCases && scen.testCases.some(tc => tc.id === targetCaseId)) {
                      const remaining = scen.testCases.filter(tc => tc.id !== targetCaseId);
                      return { ...scen, testCases: remaining };
                    }

                    return scen;
                  });

                  // Record tombstones so other modules (and Script Generator) sync automatically
                  const tombstoneSet = new Set(tombstonesToAdd.map(t => t.toLowerCase().trim()));
                  const remainingScripts = (project.automationScripts || []).filter(s => {
                    if (tombstoneSet.has(s.id.toLowerCase())) return false;
                    if (s.testCaseIds && s.testCaseIds.length > 0) {
                      const remaining = s.testCaseIds.filter(id => !tombstoneSet.has(id.toLowerCase().trim()));
                      if (remaining.length === 0) {
                        tombstonesToAdd.push(s.id);
                        return false;
                      }
                    }
                    return true;
                  });

                  addDeletedIds(tombstonesToAdd);

                  const existingIds = new Set(updatedScenarios.map(s => s.id));
                  const finalScenarios = updatedScenarios.map(scen => {
                    if (scen.memberScenarioIds && scen.memberScenarioIds.length > 0) {
                      return {
                        ...scen,
                        memberScenarioIds: scen.memberScenarioIds.filter(id => existingIds.has(id))
                      };
                    }
                    return scen;
                  });

                  try {
                    localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify({ ...project, scenarios: finalScenarios, automationScripts: remainingScripts }));
                  } catch (e) {}

                  onUpdateProject({ ...project, scenarios: finalScenarios, automationScripts: remainingScripts });
                  toast.success('Test case deleted');
                  setDeleteTarget(null);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-xl border border-slate-100 text-center animate-in fade-in zoom-in duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">{bulkDeleteInfo.title}</h3>
            <p className="text-xs text-slate-500">
              {bulkDeleteInfo.description}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                {bulkDeleteInfo.buttonText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 13. JIRA BUG MODAL                                                        */}
      {/* ========================================================================= */}
      {jiraModalCase && (
        <JiraBugModal
          isOpen={Boolean(jiraModalCase)}
          onClose={() => setJiraModalCase(null)}
          testCase={jiraModalCase}
          customAttachments={jiraModalCase.attachments || (jiraModalCase.evidence ? [jiraModalCase.evidence] : [])}
          customLinks={jiraModalCase.links || []}
          customComments={jiraModalCase.comments || ''}
          project={project}
        />
      )}

      {/* ========================================================================= */}
      {/* 14. GENERATE AI TEST CASES FOR SCENARIO(S) MODAL                          */}
      {/* ========================================================================= */}
      {scenariosForGenerateModal && scenariosForGenerateModal.length > 0 && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200/80 text-teal-600 flex items-center justify-center font-bold shadow-xs">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {scenariosForGenerateModal.length > 1 
                      ? `Generate AI Test Cases (${scenariosForGenerateModal.length} Scenarios)` 
                      : 'Generate AI Test Cases'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {scenariosForGenerateModal.length > 1
                      ? `Synthesize comprehensive, step-by-step test cases for all ${scenariosForGenerateModal.length} selected scenarios`
                      : 'Synthesize comprehensive, step-by-step test cases for this approved scenario'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setScenariosForGenerateModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                disabled={isModalGenerating}
              >
                <X size={18} />
              </button>
            </div>

            {/* Selected Scenario Details Box */}
            {scenariosForGenerateModal.length === 1 ? (
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-black text-teal-800 bg-teal-100/70 border border-teal-200 px-2 py-0.5 rounded-md">
                    {scenariosForGenerateModal[0].scenarioId || 'SC-001'}
                  </span>
                  <span className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md uppercase">
                    {scenariosForGenerateModal[0].moduleName || 'General'}
                  </span>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md uppercase">
                    {scenariosForGenerateModal[0].type || 'Functional'}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md uppercase">
                    Approved
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 leading-snug">
                  {scenariosForGenerateModal[0].title}
                </h4>
                {scenariosForGenerateModal[0].description && (
                  <p 
                    className="text-xs text-slate-600 leading-relaxed truncate"
                    title={maskPasswordText((scenariosForGenerateModal[0].description || '').replace(/\\n/g, ' ').replace(/\r?\n+/g, ' ').trim(), scenariosForGenerateModal[0].password || defaultPassword)}
                  >
                    <span className="font-semibold text-slate-700">Description: </span>
                    {maskPasswordText((scenariosForGenerateModal[0].description || '').replace(/\\n/g, ' ').replace(/\r?\n+/g, ' ').trim(), scenariosForGenerateModal[0].password || defaultPassword)}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Selected Scenarios ({scenariosForGenerateModal.length})
                  </span>
                  <span className="text-[11px] text-teal-700 font-semibold">
                    Will be generated in batch
                  </span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {scenariosForGenerateModal.map((scen, idx) => (
                    <div key={scen.id || idx} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-black text-teal-800 bg-teal-100/70 border border-teal-200 px-1.5 py-0.5 rounded">
                            {scen.scenarioId || `SC-${idx + 1}`}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {scen.moduleName || 'General'}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded uppercase">
                          {scen.type || 'Functional'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 line-clamp-1">
                        {scen.title}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optional Focus Directives */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider flex items-center justify-between">
                <span>Focus Directives / Custom Instructions (Optional)</span>
                <span className="text-[10px] font-mono text-slate-400">
                  {generateDirectives.length}/500
                </span>
              </label>
              <textarea
                value={generateDirectives}
                maxLength={500}
                onChange={(e) => setGenerateDirectives(e.target.value)}
                placeholder="e.g. Include negative input validations, boundary tests, and responsive layout checks."
                rows={3}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all resize-none leading-relaxed"
                disabled={isModalGenerating}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setScenariosForGenerateModal(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all cursor-pointer"
                disabled={isModalGenerating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteGenerateForScenarios(scenariosForGenerateModal)}
                disabled={isModalGenerating}
                className="flex-2 py-3 bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-600 hover:to-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-teal-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                {isModalGenerating ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>
                      {scenariosForGenerateModal.length > 1
                        ? `Synthesizing Scenario ${generatingCurrentIndex + 1} of ${scenariosForGenerateModal.length}...`
                        : 'Synthesizing Test Cases...'}
                    </span>
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    <span>
                      {scenariosForGenerateModal.length > 1
                        ? `Generate for ${scenariosForGenerateModal.length} Scenarios`
                        : 'Generate AI Test Cases'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Generated AI Test Cases to Folder Modal */}
      {saveGeneratedCasesModal && saveGeneratedCasesModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 shadow-xs">
                  <FolderPlus size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Save AI Test Cases into Folder
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Save the generated test cases into a new or existing folder
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSaveGeneratedCasesModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Success Banner */}
            <div className="bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200/80 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
                  {saveGeneratedCasesModal.cases.length}
                </div>
                <div>
                  <span className="text-xs font-black text-teal-900 uppercase tracking-wide block">
                    AI Test Cases Generated Successfully
                  </span>
                  <span className="text-[11px] font-medium text-teal-700/90 truncate max-w-xs block">
                    Source: {saveGeneratedCasesModal.sourceTitle}
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-teal-600/10 text-teal-700 text-[10px] font-black uppercase tracking-wider rounded-lg border border-teal-600/20">
                Ready to Save
              </span>
            </div>

            {/* Walkthrough Video Attached Notice */}
            {(saveGeneratedCasesModal.videoData || videoData) && (
              <div className="flex items-center gap-3 p-3.5 bg-teal-50/90 border border-teal-200/90 rounded-2xl text-xs text-teal-950 shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0 text-teal-700">
                  <Film size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-teal-900 truncate">
                      {saveGeneratedCasesModal.videoData?.fileName || videoData?.fileName || 'Walkthrough Video'}
                    </span>
                    {(saveGeneratedCasesModal.videoData?.duration || videoData?.duration) ? (
                      <span className="text-[10px] font-mono text-teal-700 font-bold bg-teal-100/80 px-1.5 py-0.5 rounded">
                        {Math.round(saveGeneratedCasesModal.videoData?.duration || videoData?.duration || 0)}s
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[11px] text-teal-700/90 mt-0.5">
                    Uploaded video walkthrough will be saved into the folder and playable anytime alongside test cases.
                  </p>
                </div>
              </div>
            )}

            {/* Folder Mode Selection Tabs */}
            <div className="space-y-2">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                Choose Folder Destination
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/90 rounded-2xl border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setSaveGeneratedCasesModal(prev => prev ? ({ ...prev, folderMode: 'existing' }) : null)}
                  disabled={testCaseFolders.length === 0}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    saveGeneratedCasesModal.folderMode === 'existing'
                      ? 'bg-white text-teal-800 shadow-xs'
                      : testCaseFolders.length === 0
                      ? 'text-slate-400 cursor-not-allowed opacity-60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Folder size={14} />
                  <span>Existing Folder ({testCaseFolders.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSaveGeneratedCasesModal(prev => prev ? ({ ...prev, folderMode: 'new' }) : null)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    saveGeneratedCasesModal.folderMode === 'new'
                      ? 'bg-white text-teal-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FolderPlus size={14} />
                  <span>Create New Folder</span>
                </button>
              </div>
            </div>

            {/* Mode 1: Existing Folder Dropdown */}
            {saveGeneratedCasesModal.folderMode === 'existing' && (
              <div className="space-y-2 animate-in fade-in duration-150">
                <label className="text-[11px] font-black text-slate-600 uppercase tracking-wider block">
                  Select Existing Folder
                </label>
                {testCaseFolders.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800">
                    No folders found. Please select "Create New Folder" to create one.
                  </div>
                ) : (
                  <select
                    value={saveGeneratedCasesModal.selectedFolderId}
                    onChange={(e) => setSaveGeneratedCasesModal(prev => prev ? ({ ...prev, selectedFolderId: e.target.value }) : null)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white transition-all cursor-pointer"
                  >
                    {testCaseFolders.map(folder => {
                      const count = getFolderCases(folder, project.scenarios || []).length;
                      return (
                        <option key={folder.id} value={folder.id}>
                          📁 {folder.title} ({count} test cases) — {folder.moduleName || 'General'}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            )}

            {/* Mode 2: Create New Folder Inputs */}
            {saveGeneratedCasesModal.folderMode === 'new' && (
              <div className="space-y-3.5 animate-in fade-in duration-150">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                    New Folder Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={saveGeneratedCasesModal.newFolderName}
                    onChange={(e) => setSaveGeneratedCasesModal(prev => prev ? ({ ...prev, newFolderName: e.target.value }) : null)}
                    placeholder="e.g. Checkout & Payment Flow"
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                    Module / Category (Optional)
                  </label>
                  <input
                    type="text"
                    value={saveGeneratedCasesModal.newFolderModule}
                    onChange={(e) => setSaveGeneratedCasesModal(prev => prev ? ({ ...prev, newFolderModule: e.target.value }) : null)}
                    placeholder="e.g. Authentication, Billing, Dashboard"
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            )}

            {/* Preview Generated Cases Strip */}
            <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-slate-50/50">
              <button
                type="button"
                onClick={() => setSaveGeneratedCasesModal(prev => prev ? ({ ...prev, previewExpanded: !prev.previewExpanded }) : null)}
                className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-100/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    Preview Generated Cases ({saveGeneratedCasesModal.cases.length})
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Click to inspect</span>
                </div>
                {saveGeneratedCasesModal.previewExpanded ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
              </button>

              {saveGeneratedCasesModal.previewExpanded && (
                <div className="p-3 border-t border-slate-200 space-y-2 max-h-52 overflow-y-auto bg-white">
                  {saveGeneratedCasesModal.cases.map((tc, idx) => (
                    <div key={tc.id || idx} className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/50 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] font-black text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded">
                            {tc.testCaseId}
                          </span>
                          <span className="font-bold text-slate-900 truncate">
                            {tc.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                          {tc.steps?.length || 1} steps • Expected: {tc.expectedResult}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                        tc.priority === TestPriority.HIGH ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {tc.priority}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                disabled={isSavingGeneratedCases}
                onClick={() => setSaveGeneratedCasesModal(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-2xl text-xs font-bold transition-all cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={isSavingGeneratedCases}
                onClick={handleConfirmSaveGeneratedCases}
                className="flex-2 py-3 bg-[#00B4A0] hover:bg-[#009E8C] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-teal-500/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                {isSavingGeneratedCases ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Save Test Cases into Folder</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Select / Create Script Generator Folder on Test Case Approval Modal */}
      {approveScriptModal && approveScriptModal.isOpen && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-xs">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Select / Create Script Generator Folder
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Link approved test cases to a Script Generator folder to generate automation scripts
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setApproveScriptModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <XCircle size={20} />
              </button>
            </div>

            {/* Target Test Cases Information Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText size={14} className="text-emerald-600" />
                  Approving <strong className="text-emerald-700">{approveScriptModal.testCases.length}</strong> Test Case(s)
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md truncate max-w-[200px]">
                  Source: {approveScriptModal.sourceTitle}
                </span>
              </div>
              
              {approveScriptModal.testCases.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                  {approveScriptModal.testCases.map((tc, idx) => (
                    <div key={tc.id || idx} className="text-[11px] text-slate-600 flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-100 font-medium">
                      <span className="font-mono font-bold text-teal-700 shrink-0">{tc.testCaseId || `TC-${idx + 1}`}</span>
                      <span className="truncate">{tc.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Folder Mode Switcher */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                Destination Script Generator Folder
              </label>
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    const defaultFolder = scriptGeneratorFolders[0];
                    setApproveScriptModal(prev => prev ? ({
                      ...prev,
                      folderMode: 'existing',
                      selectedFolderId: defaultFolder ? defaultFolder.id : '',
                      selectedFolderName: defaultFolder ? defaultFolder.name : ''
                    }) : null);
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    approveScriptModal.folderMode === 'existing'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Folder size={14} />
                  <span>Existing Folder ({scriptGeneratorFolders.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setApproveScriptModal(prev => prev ? ({
                      ...prev,
                      folderMode: 'new'
                    }) : null);
                  }}
                  className={`py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    approveScriptModal.folderMode === 'new'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FolderPlus size={14} />
                  <span>Create New Folder</span>
                </button>
              </div>
            </div>

            {/* Existing Folder Selector */}
            {approveScriptModal.folderMode === 'existing' && (
              <div className="space-y-3 animate-in fade-in duration-150">
                {scriptGeneratorFolders.length === 0 ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-2">
                    <p className="text-xs text-amber-800 font-medium">
                      No Script Generator folders created yet. Please create a new folder to organize these scripts.
                    </p>
                    <button
                      type="button"
                      onClick={() => setApproveScriptModal(prev => prev ? ({ ...prev, folderMode: 'new' }) : null)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                    >
                      <FolderPlus size={13} />
                      <span>Switch to Create New Folder</span>
                    </button>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      Select Script Generator Folder <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={approveScriptModal.selectedFolderId}
                      onChange={e => {
                        const targetId = e.target.value;
                        const found = scriptGeneratorFolders.find(f => f.id === targetId);
                        setApproveScriptModal(prev => prev ? ({
                          ...prev,
                          selectedFolderId: targetId,
                          selectedFolderName: found ? found.name : ''
                        }) : null);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      {scriptGeneratorFolders.map(f => (
                        <option key={f.id} value={f.id}>
                          📁 {f.name} {f.count > 0 ? `(${f.count} scripts)` : '(Empty)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Create New Folder Form */}
            {approveScriptModal.folderMode === 'new' && (
              <div className="space-y-3 animate-in fade-in duration-150">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Folder Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={approveScriptModal.newFolderName}
                    onChange={e => setApproveScriptModal(prev => prev ? ({ ...prev, newFolderName: e.target.value }) : null)}
                    placeholder="e.g. Smoke Tests, Checkout Flow, Regression Suite"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Description <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={approveScriptModal.newFolderDescription || ''}
                    onChange={e => setApproveScriptModal(prev => prev ? ({ ...prev, newFolderDescription: e.target.value }) : null)}
                    placeholder="e.g. Automated test scripts for checkout and payment flows"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setApproveScriptModal(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmApproveToScriptGenerator}
                disabled={
                  (approveScriptModal.folderMode === 'existing' && (!approveScriptModal.selectedFolderId || scriptGeneratorFolders.length === 0)) ||
                  (approveScriptModal.folderMode === 'new' && !approveScriptModal.newFolderName.trim())
                }
                className="flex-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <Check size={16} />
                <span>Confirm & Approve</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Folder Modal */}
      {editingFolderTarget && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600">
                  <Folder size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Folder</h3>
                  <p className="text-xs text-slate-500">Update folder name and module for AI Test Cases</p>
                </div>
              </div>
              <button 
                onClick={() => setEditingFolderTarget(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Folder Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  value={editFolderTitle}
                  onChange={e => setEditFolderTitle(e.target.value)}
                  placeholder="e.g. Authentication Flow"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Module / Component</label>
                <input
                  type="text"
                  value={editFolderModule}
                  onChange={e => setEditFolderModule(e.target.value)}
                  placeholder="e.g. Auth, Checkout, Settings"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-sm font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingFolderTarget(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditFolder}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-600/20 transition-all cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* PASTE SCREENSHOT CAPTURE MODAL                                            */}
      {/* ========================================================================= */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                  <Clipboard size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Paste Screenshot</h3>
                  <p className="text-xs text-slate-400">Capture copied screenshot from clipboard</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div
              tabIndex={0}
              autoFocus
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items || items.length === 0) return;
                const imageFiles: File[] = [];
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) imageFiles.push(file);
                  }
                }
                if (imageFiles.length > 0) {
                  e.preventDefault();
                  processUploadedImageFiles(imageFiles);
                  setVisualInputMode('screenshots');
                  setIsPasteModalOpen(false);
                } else {
                  toast.info('No image found in clipboard. Please copy an image first.');
                }
              }}
              className="border-2 border-dashed border-teal-300 bg-teal-50/30 hover:bg-teal-50/60 rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-100/80 text-teal-600 flex items-center justify-center">
                <Clipboard size={24} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-800">
                  Press <kbd className="px-2 py-1 bg-white rounded-lg border border-slate-200 text-xs font-mono font-bold shadow-2xs">Ctrl + V</kbd> or <kbd className="px-2 py-1 bg-white rounded-lg border border-slate-200 text-xs font-mono font-bold shadow-2xs">Cmd + V</kbd>
                </p>
                <p className="text-xs text-slate-500 max-w-xs">
                  Click here and press paste to attach your clipboard screenshot
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsPasteModalOpen(false);
                  imagesUploadRef.current?.click();
                }}
                className="text-xs font-bold text-teal-600 hover:text-teal-700 hover:underline cursor-pointer"
              >
                Or browse files from computer
              </button>
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestCaseManager;
