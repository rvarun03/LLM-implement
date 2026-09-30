import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Project, TestScenario, UserStory, isApiTestingScenario } from '../types';
import { toast } from 'sonner';
import { formatAcceptanceCriteria } from '../services/apiUtils';
import { 
  Sparkles, 
  Trash2, 
  Loader2, 
  FileText, 
  X, 
  Info, 
  Search, 
  ChevronDown, 
  LayoutGrid, 
  Globe, 
  FileSearch, 
  Upload, 
  FolderPlus, 
  Folder, 
  CheckCircle2, 
  User, 
  Lock, 
  ChevronUp, 
  Layers, 
  Link, 
  Eye, 
  AlertTriangle, 
  FileSpreadsheet, 
  Download, 
  Check, 
  Pencil, 
  CheckSquare, 
  Square, 
  Save, 
  Asterisk, 
  PlusCircle, 
  Plus, 
  MinusCircle, 
  ChevronLeft, 
  ChevronRight,
  Copy,
  Paperclip
} from 'lucide-react';
import { generateScenariosFromInput } from '../geminiService';
import { recordFeatureConsumption, checkAiGenerationPermission, getProjectCreditSummary } from '../services/tokenConsumptionService';
import { generateUniqueFolderId } from '../utils/idGenerator';
import { deductExportCredits, canPerformAction, deductProjectCredits } from '../services/creditService';
import { downloadExcel, downloadCsv } from '../utils/exportUtils';
import { logActivity } from '../services/activityService';
import { addDeletedIds, getScenarioMetrics } from '../services/projectService';
import { deleteFolderFromFirestore } from '../services/folderPersistenceService';
import { saveProjectBackup } from '../services/storageBackupService';
import { ragEnrichPrompt, indexSingleItem } from '../services/ragService';
import { RAGStatusBadge } from './RAGStatusBadge';
import { VectorSearchResult } from '../types';
import { JiraImportModal } from './JiraImportModal';
import { ScreenshotUploader, ScreenshotFile } from './ScreenshotUploader';
import { ScreenshotGallery } from './ScreenshotGallery';
import * as XLSX from 'xlsx';
import { maskPasswordText } from './TestCaseManager';
import { parseDocumentFile, sanitizeAndExtractDocContent } from '../utils/docParser';

export { sanitizeAndExtractDocContent };

interface ScenarioGeneratorProps {
  project: Project;
  user: { email: string, name: string };
  onUpdateProject: (p: Project, options?: { immediate?: boolean }) => Promise<void> | void;
  onRunFolder?: (folderId: string) => void;
  onNavigateTab?: (tab: string) => void;
}

const ScenarioGenerator: React.FC<ScenarioGeneratorProps> = ({ project, user, onUpdateProject, onRunFolder, onNavigateTab }) => {
  const [activeTab, setActiveTab] = useState<'text' | 'url' | 'doc'>('text');
  const [isJiraModalOpen, setIsJiraModalOpen] = useState(false);
  const [activeView, setActiveView] = useState<'scenarios' | 'folders'>('scenarios');
  const [description, setDescription] = useState('');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // URL State Management
  const [appUrl, setAppUrl] = useState(''); // Global Login Context URL
  const [analysisUrl, setAnalysisUrl] = useState(''); // Website URL Tab specific
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Anti-autofill: Clear any browser-injected credentials on mount if user hasn't focused
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!usernameFocused && username) setUsername('');
      if (!passwordFocused && password) setPassword('');
    }, 150);
    return () => clearTimeout(timer);
  }, []);
  
interface LastInputDetails {
  activeTab: string;
  docFileName?: string;
  docContent?: string;
  description?: string;
  analysisUrl?: string;
  screenshots?: ScreenshotFile[];
  aiInstructions?: string;
  appUrl?: string;
  username?: string;
  timestamp: string;
}

  // Document State Management
  const [docContent, setDocContent] = useState('');
  const [docFileName, setDocFileName] = useState('');
  const [uploadedFileId, setUploadedFileId] = useState('');
  const [uploadedFileSize, setUploadedFileSize] = useState(0);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [activeJobId, setActiveJobId] = useState('');
  const [jobProgressStage, setJobProgressStage] = useState('');
  const [jobProgressPercent, setJobProgressPercent] = useState(0);
  const [canResumeJob, setCanResumeJob] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [lastInputDetails, setLastInputDetails] = useState<LastInputDetails | null>(null);
  
  const [aiInstructions, setAiInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());
  
  // Edit State
  const [editingItem, setEditingItem] = useState<TestScenario | null>(null);
  const [editForm, setEditForm] = useState<Partial<TestScenario>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Manage Items Modal State
  const [managingFolder, setManagingFolder] = useState<TestScenario | null>(null);
  const [tempMemberIds, setTempMemberIds] = useState<Set<string>>(new Set());

  // Folder Creation State
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // New States for AI Scenarios enhancement
  const [newlyGeneratedScenarios, setNewlyGeneratedScenarios] = useState<TestScenario[]>([]);
  const [isSaveConfirmModalOpen, setIsSaveConfirmModalOpen] = useState(false);
  const [isFolderSelectModalOpen, setIsFolderSelectModalOpen] = useState(false);
  const [selectedFolderIdForSave, setSelectedFolderIdForSave] = useState('');
  const [searchFolderQuery, setSearchFolderQuery] = useState('');
  const [showCreateFolderInline, setShowCreateFolderInline] = useState(false);
  const [inlineNewFolderName, setInlineNewFolderName] = useState('');
  const [inlineFolderError, setInlineFolderError] = useState<string | null>(null);
  const [scenariosToApproveAndSave, setScenariosToApproveAndSave] = useState<TestScenario[]>([]);
  const [scenariosToMoveWithoutApprove, setScenariosToMoveWithoutApprove] = useState<TestScenario[]>([]);
  const [ragEnabled, setRagEnabled] = useState(true);
  const [retrievedRagChunks, setRetrievedRagChunks] = useState<VectorSearchResult[]>([]);

  // States for importing user stories
  const [isImportStoriesModalOpen, setIsImportStoriesModalOpen] = useState(false);
  const [selectedImportStoryIds, setSelectedImportStoryIds] = useState<Set<string>>(new Set());
  const [searchImportStoryQuery, setSearchImportStoryQuery] = useState('');
  const [expandedImportFolders, setExpandedImportFolders] = useState<Set<string>>(new Set());
  const [importedStories, setImportedStories] = useState<UserStory[]>([]);

  const userStoriesList = useMemo(() => project.userStories || [], [project.userStories]);

  const userStoryFolders = useMemo(() => {
    return userStoriesList.filter(s => s.storyId === 'USERSTORY_FOLDER');
  }, [userStoriesList]);

  const individualUserStories = useMemo(() => {
    return userStoriesList.filter(s => 
      s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE' && !s.isRemovedFromIndividual
    );
  }, [userStoriesList]);

  const filteredImportStories = useMemo(() => {
    const query = searchImportStoryQuery.toLowerCase().trim();
    if (!query) {
      return {
        folders: userStoryFolders,
        individuals: individualUserStories
      };
    }
    
    const filteredIndividuals = individualUserStories.filter(s => 
      (s.summary || '').toLowerCase().includes(query) ||
      (s.description || '').toLowerCase().includes(query) ||
      (s.acceptanceCriteria || '').toLowerCase().includes(query)
    );

    const filteredFolders = userStoryFolders.filter(folder => {
      const folderMatches = (folder.summary || '').toLowerCase().includes(query);
      if (folderMatches) return true;

      const memberIds = folder.memberStoryIds || [];
      const folderMembers = userStoriesList.filter(s => memberIds.includes(s.id));
      return folderMembers.some(s => 
        (s.summary || '').toLowerCase().includes(query) ||
        (s.description || '').toLowerCase().includes(query) ||
        (s.acceptanceCriteria || '').toLowerCase().includes(query)
      );
    });

    return {
      folders: filteredFolders,
      individuals: filteredIndividuals
    };
  }, [userStoriesList, userStoryFolders, individualUserStories, searchImportStoryQuery]);

  const docUploadRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const scenarios = useMemo(() => (project.scenarios || []).filter(s => !isApiTestingScenario(s)), [project.scenarios]);

  // Helper to check if item is a test scenario (not a folder or input source or API test scenario)
  const isScenarioItem = useCallback((s: TestScenario): boolean => {
    if (!s) return false;
    if (isApiTestingScenario(s)) return false;
    if (s.isFolder) return false;
    if (typeof s.scenarioId === 'string' && s.scenarioId.endsWith('_FOLDER')) return false;
    if (['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER', 'INPUT_SOURCE'].includes(s.scenarioId)) return false;
    return true;
  }, []);

  // Helper to accurately determine if an item is a folder belonging exclusively to AI Scenarios
  const isScenarioFolder = useCallback((s: TestScenario): boolean => {
    if (!s) return false;
    // Strictly exclude folders created in other modules (AI Test Cases, Manual Testing, API Testing)
    if (s.scenarioId === 'TESTCASE_FOLDER' || s.scenarioId === 'MANUAL_FOLDER') return false;
    if (s.folderType === 'testcase' || s.folderType === 'manual') return false;
    if (s.moduleName === 'API Testing' || s.isApiScenario) return false;
    if (typeof s.scenarioId === 'string' && s.scenarioId.startsWith('API-')) return false;
    return Boolean(
      s.scenarioId === 'SCENARIO_FOLDER' ||
      (s.isFolder && (s.moduleName === 'AI SCENARIOS' || s.folderType === 'scenario'))
    );
  }, []);

  // Helper to accurately determine if a scenario belongs to a folder
  const isMemberOfFolder = useCallback((mem: TestScenario, folder: TestScenario): boolean => {
    if (!mem || !folder) return false;
    if (mem.id === folder.id) return false;
    if (!isScenarioFolder(folder)) return false;
    if (mem.isFolder || ['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER', 'INPUT_SOURCE'].includes(mem.scenarioId)) {
      return false;
    }
    // 1. Direct folderId match (exact or case-insensitive)
    if (mem.folderId && (mem.folderId === folder.id || String(mem.folderId).trim().toLowerCase() === String(folder.id).trim().toLowerCase())) {
      return true;
    }
    // 2. Folder title match in folderId or folderName
    if (folder.title && (
      (mem.folderId && mem.folderId.trim().toLowerCase() === folder.title.trim().toLowerCase()) ||
      (mem.folderName && mem.folderName.trim().toLowerCase() === folder.title.trim().toLowerCase())
    )) {
      return true;
    }
    // 3. Folder memberScenarioIds list contains mem.id or mem.scenarioId
    if (Array.isArray(folder.memberScenarioIds)) {
      if (folder.memberScenarioIds.some(id => String(id) === String(mem.id) || (mem.scenarioId && String(id) === String(mem.scenarioId)))) {
        return true;
      }
    }
    return false;
  }, []);

  // Scenarios pool merging latest saved/newly generated scenarios to ensure immediate visibility
  const allScenariosPool = useMemo(() => {
    const list = [...scenarios];
    const existingIds = new Set(list.map(s => s.id));
    newlyGeneratedScenarios.forEach(ns => {
      if (!existingIds.has(ns.id)) {
        list.push(ns);
        existingIds.add(ns.id);
      }
    });
    return list;
  }, [scenarios, newlyGeneratedScenarios]);

  // Single source of truth for scenario metrics
  const scenarioMetrics = useMemo(() => getScenarioMetrics(scenarios, project.deletedItemIds), [scenarios, project.deletedItemIds]);
  const totalScenariosCount = scenarioMetrics.total;
  const totalApprovedScenariosCount = scenarioMetrics.approved;
  const totalUnapprovedScenariosCount = scenarioMetrics.unapproved;

  const individualCount = useMemo(() => {
    const newlyGeneratedIds = new Set(newlyGeneratedScenarios.map(s => s.id));
    return scenarios.filter(s => 
      isScenarioItem(s) && 
      !s.isApproved &&
      !s.isRemovedFromIndividual &&
      (!s.folderId || s.folderId === "") &&
      !newlyGeneratedIds.has(s.id)
    ).length;
  }, [scenarios, isScenarioItem, newlyGeneratedScenarios]);

  const folderCount = useMemo(() => 
    scenarios.filter(isScenarioFolder).length,
  [scenarios, isScenarioFolder]);

  // Robust matcher for scenarios across all metadata and text fields
  const isScenarioMatching = useCallback((s: TestScenario, query: string): boolean => {
    if (!s || !query) return false;
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return Boolean(
      (s.title || '').toLowerCase().includes(q) ||
      (s.scenarioId || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.moduleName || '').toLowerCase().includes(q) ||
      (s.expectedResults || '').toLowerCase().includes(q) ||
      (s.userStoryNumber || '').toLowerCase().includes(q) ||
      (s.userStorySummary || '').toLowerCase().includes(q) ||
      (s.userStoryId || '').toLowerCase().includes(q) ||
      (s.priority || '').toLowerCase().includes(q) ||
      (s.type || '').toLowerCase().includes(q) ||
      (s.scenarioCategory || '').toLowerCase().includes(q) ||
      (Array.isArray(s.tags) && s.tags.some(t => String(t || '').toLowerCase().includes(q)))
    );
  }, []);

  // Robust matcher for folders checking both folder properties and member scenario contents
  const isFolderMatching = useCallback((f: TestScenario, query: string, pool: TestScenario[]): boolean => {
    if (!f || !query) return false;
    const q = query.toLowerCase().trim();
    if (!q) return true;
    if (
      (f.title || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q) ||
      (f.moduleName || '').toLowerCase().includes(q)
    ) {
      return true;
    }
    const members = pool.filter(mem => isMemberOfFolder(mem, f));
    return members.some(mem => isScenarioMatching(mem, query));
  }, [isMemberOfFolder, isScenarioMatching]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim();
    const newlyGeneratedIds = new Set(newlyGeneratedScenarios.map(s => s.id));
    if (activeView === 'folders') {
      const folders = scenarios.filter(isScenarioFolder);
      if (!q) return folders;
      return folders.filter(f => isFolderMatching(f, q, allScenariosPool));
    } else {
      if (!q) {
        return scenarios.filter(s => 
          isScenarioItem(s) && 
          !s.isApproved &&
          !s.isRemovedFromIndividual &&
          (!s.folderId || s.folderId === "") &&
          !newlyGeneratedIds.has(s.id)
        );
      }
      // When searching individual scenarios: search across all scenario items so user can locate any scenario in repository
      return scenarios.filter(s => isScenarioItem(s) && isScenarioMatching(s, q) && !newlyGeneratedIds.has(s.id));
    }
  }, [scenarios, searchQuery, activeView, isScenarioFolder, isScenarioItem, isFolderMatching, isScenarioMatching, allScenariosPool, newlyGeneratedScenarios]);

  // Counts of matching items across views when search query is active
  const matchingScenariosCount = useMemo(() => {
    const newlyGeneratedIds = new Set(newlyGeneratedScenarios.map(s => s.id));
    if (!searchQuery.trim()) return individualCount;
    return scenarios.filter(s => isScenarioItem(s) && isScenarioMatching(s, searchQuery) && !newlyGeneratedIds.has(s.id)).length;
  }, [scenarios, isScenarioItem, isScenarioMatching, searchQuery, individualCount, newlyGeneratedScenarios]);

  const matchingFoldersCount = useMemo(() => {
    if (!searchQuery.trim()) return folderCount;
    return scenarios.filter(f => isScenarioFolder(f) && isFolderMatching(f, searchQuery, allScenariosPool)).length;
  }, [scenarios, isScenarioFolder, isFolderMatching, searchQuery, folderCount, allScenariosPool]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredItems, currentPage]);

  // Handle pagination adjustment when items are deleted on the last page
  useEffect(() => {
    if (currentPage > 1 && paginatedItems.length === 0 && filteredItems.length > 0) {
      setCurrentPage(totalPages);
    } else if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredItems.length, paginatedItems.length, currentPage, totalPages]);

  // Reset page when search or view changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeView]);

  // Auto-expand matching folders / scenarios when search query is active
  useEffect(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      const matchingIds = new Set<string>();
      if (activeView === 'folders') {
        scenarios.filter(isScenarioFolder).forEach(f => {
          if (isFolderMatching(f, q, allScenariosPool)) {
            matchingIds.add(f.id);
          }
        });
      } else {
        scenarios.filter(isScenarioItem).forEach(s => {
          if (isScenarioMatching(s, q)) {
            matchingIds.add(s.id);
          }
        });
      }
      if (matchingIds.size > 0) {
        setExpandedItems(prev => new Set([...prev, ...matchingIds]));
      }
    }
  }, [searchQuery, activeView, scenarios, isScenarioFolder, isScenarioItem, isFolderMatching, isScenarioMatching, allScenariosPool]);

  // Explicit Search Execution function triggered by Search button or Enter key
  const handleExecuteSearch = useCallback((customQuery?: string) => {
    const q = (customQuery !== undefined ? customQuery : searchQuery).trim();
    if (!q) {
      toast.info('Showing all scenarios and folders');
      return;
    }
    const scenMatches = scenarios.filter(s => isScenarioItem(s) && isScenarioMatching(s, q)).length;
    const folderMatches = scenarios.filter(f => isScenarioFolder(f) && isFolderMatching(f, q, allScenariosPool)).length;
    const currentMatches = activeView === 'scenarios' ? scenMatches : folderMatches;

    if (currentMatches === 0) {
      if (activeView === 'scenarios' && folderMatches > 0) {
        setActiveView('folders');
        toast.success(`Found ${folderMatches} matching folder(s) in repository!`);
      } else if (activeView === 'folders' && scenMatches > 0) {
        setActiveView('scenarios');
        toast.success(`Found ${scenMatches} matching scenario(s) in repository!`);
      } else {
        toast.error(`No scenarios or folders found matching "${q}"`);
      }
    } else {
      toast.success(`Found ${currentMatches} matching result(s)`);
    }

    const repoElement = document.getElementById('scenario-repository-section');
    if (repoElement) {
      repoElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [searchQuery, scenarios, activeView, isScenarioItem, isScenarioFolder, isScenarioMatching, isFolderMatching, allScenariosPool]);

  // Reset uploaded document, screenshots, input details when project changes
  useEffect(() => {
    setDocContent('');
    setDocFileName('');
    setDescription('');
    setAnalysisUrl('');
    setScreenshots([]);
    setLastInputDetails(null);
    setNewlyGeneratedScenarios([]);
    setSelectedScenarioIds(new Set());
    if (docUploadRef.current) {
      docUploadRef.current.value = '';
    }
    if (uploadInputRef.current) {
      uploadInputRef.current.value = '';
    }
  }, [project.id]);

  const allMangeableScenarios = useMemo(() => {
    return scenarios.filter(isScenarioItem);
  }, [scenarios, isScenarioItem]);

  const isAllVisibleSelected = useMemo(() => {
    return paginatedItems.length > 0 && paginatedItems.every(s => selectedScenarioIds.has(s.id));
  }, [paginatedItems, selectedScenarioIds]);

  const handleToggleAllVisible = () => {
    if (isAllVisibleSelected) {
      const next = new Set(selectedScenarioIds);
      paginatedItems.forEach(s => next.delete(s.id));
      setSelectedScenarioIds(next);
    } else {
      const next = new Set(selectedScenarioIds);
      paginatedItems.forEach(s => next.add(s.id));
      setSelectedScenarioIds(next);
    }
  };

  const handleImportStories = () => {
    if (selectedImportStoryIds.size === 0) {
      toast.error('Please select at least one user story to import.');
      return;
    }

    const allStories = project.userStories || [];
    const selectedStories = allStories.filter(s => selectedImportStoryIds.has(s.id));

    if (selectedStories.length === 0) {
      toast.error('Selected stories not found.');
      return;
    }

    const formattedText = selectedStories.map(s => {
      let text = `User Story Number: ${s.storyId || 'N/A'}\n`;
      text += `User Story Summary: ${s.summary}\n`;
      if (s.description && s.description !== 'Organization folder') {
        text += `User Story Description:\n${s.description}\n`;
      }
      if (s.acceptanceCriteria && s.acceptanceCriteria !== 'N/A') {
        text += `Acceptance Criteria:\n${formatAcceptanceCriteria(s.acceptanceCriteria)}\n`;
      }
      return text;
    }).join('\n---\n\n');

    const separator = description.trim() ? '\n\n---\n\n' : '';
    setDescription(prev => prev + separator + formattedText);
    
    setImportedStories(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const newItems = selectedStories.filter(s => !existingIds.has(s.id));
      return [...prev, ...newItems];
    });

    setActiveTab('text');
    setIsImportStoriesModalOpen(false);
    setSelectedImportStoryIds(new Set());
    setSearchImportStoryQuery('');
    
    toast.success(`Imported ${selectedStories.length} user story/stories successfully!`);
  };

  const handleToggleImportStory = (id: string) => {
    const next = new Set(selectedImportStoryIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedImportStoryIds(next);
  };

  const handleToggleImportFolder = (folderId: string, memberIds: string[]) => {
    const next = new Set(selectedImportStoryIds);
    const allSelected = memberIds.length > 0 && memberIds.every(id => next.has(id));

    if (allSelected) {
      memberIds.forEach(id => next.delete(id));
    } else {
      memberIds.forEach(id => next.add(id));
    }
    setSelectedImportStoryIds(next);
  };

  const handleToggleExpandImportFolder = (folderId: string) => {
    const next = new Set(expandedImportFolders);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      next.add(folderId);
    }
    setExpandedImportFolders(next);
  };

  const extractStoriesForGeneration = (
    tab: string,
    descText: string,
    docText: string,
    docName: string,
    importedList: UserStory[]
  ): Array<{ storyNumber: string; summary: string; description: string; acceptanceCriteria?: string }> => {
    if (tab === 'text') {
      const trimmedDesc = descText.trim();
      if (!trimmedDesc) return [];

      let blocks: string[] = [];
      if (/(?:\r?\n)\s*---\s*(?:\r?\n|$)/.test(trimmedDesc)) {
        blocks = trimmedDesc.split(/(?:\r?\n)\s*---\s*(?:\r?\n|$)/).map(b => b.trim()).filter(Boolean);
      } else {
        const usNumCount = trimmedDesc.match(/User Story (?:Number|ID):\s*[^\n\r]+/gi)?.length || 0;
        if (usNumCount > 1) {
          blocks = trimmedDesc.split(/(?=(?:^|\r?\n)\s*User Story (?:Number|ID):\s*)/i).map(b => b.trim()).filter(Boolean);
        } else {
          const usCount = trimmedDesc.match(/(?:^|\r?\n)\s*US-\d+[:\s]/gi)?.length || 0;
          if (usCount > 1) {
            blocks = trimmedDesc.split(/(?=(?:^|\r?\n)\s*US-\d+[:\s])/i).map(b => b.trim()).filter(Boolean);
          }
        }
      }

      if (blocks.length > 1) {
        return blocks.map((block, idx) => {
          let storyNumber = '';
          let summary = '';
          let storyDesc = '';
          let ac = '';

          const numMatch = block.match(/User Story (?:Number|ID):\s*([^\n\r]+)/i) || block.match(/\b(US-\d+)\b/i);
          if (numMatch) storyNumber = numMatch[1].trim();

          const sumMatch = block.match(/User Story Summary:\s*([^\n\r]+)/i) || block.match(/(?:^|\n)\s*Summary:\s*([^\n\r]+)/i);
          if (sumMatch) summary = sumMatch[1].trim();

          const descMatch = block.match(/User Story Description:\s*([\s\S]*?)(?=(?:Acceptance Criteria:|---|$))/i);
          if (descMatch) storyDesc = descMatch[1].trim();

          const acMatch = block.match(/Acceptance Criteria:\s*([\s\S]*?)(?=(?:---|$))/i);
          if (acMatch) ac = acMatch[1].trim();

          if (!storyDesc && !ac) {
            storyDesc = block
              .replace(/User Story (?:Number|ID):[^\n\r]*/gi, '')
              .replace(/User Story Summary:[^\n\r]*/gi, '')
              .replace(/---/g, '')
              .trim();
          }

          if (!storyNumber && importedList[idx]?.storyId) {
            storyNumber = importedList[idx].storyId;
          }
          if (!summary && importedList[idx]?.summary) {
            summary = importedList[idx].summary;
          }

          const fallbackNum = storyNumber || `US-${idx + 1}`;
          const fallbackSum = summary || (storyDesc ? storyDesc.slice(0, 50).replace(/\n/g, ' ') : `User Story ${idx + 1}`);

          return {
            storyNumber: fallbackNum,
            summary: fallbackSum,
            description: storyDesc,
            acceptanceCriteria: ac
          };
        });
      }

      if (importedList.length > 1) {
        const matched = importedList.filter(s => 
          (s.storyId && trimmedDesc.includes(s.storyId)) || 
          (s.summary && trimmedDesc.includes(s.summary))
        );
        if (matched.length > 1) {
          return matched.map(s => ({
            storyNumber: s.storyId || 'US',
            summary: s.summary,
            description: s.description && s.description !== 'Organization folder' ? s.description : '',
            acceptanceCriteria: s.acceptanceCriteria && s.acceptanceCriteria !== 'N/A' ? formatAcceptanceCriteria(s.acceptanceCriteria) : ''
          }));
        }
      }

      const numMatch = trimmedDesc.match(/User Story (?:Number|ID):\s*([^\n\r]+)/i) || trimmedDesc.match(/\b(US-\d+)\b/i);
      const sumMatch = trimmedDesc.match(/User Story Summary:\s*([^\n\r]+)/i) || trimmedDesc.match(/(?:^|\n)\s*Summary:\s*([^\n\r]+)/i);
      if (numMatch || sumMatch || importedList.length === 1 || trimmedDesc) {
        const singleNum = numMatch ? numMatch[1].trim() : (importedList[0]?.storyId || 'US-01');
        const singleSum = sumMatch ? sumMatch[1].trim() : (importedList[0]?.summary || (trimmedDesc.slice(0, 60).replace(/\n/g, ' ') || 'User Story Requirements'));
        let singleDesc = '';
        const descMatch = trimmedDesc.match(/User Story Description:\s*([\s\S]*?)(?=(?:Acceptance Criteria:|---|$))/i);
        if (descMatch) singleDesc = descMatch[1].trim();
        let singleAc = '';
        const acMatch = trimmedDesc.match(/Acceptance Criteria:\s*([\s\S]*?)(?=(?:---|$))/i);
        if (acMatch) singleAc = acMatch[1].trim();

        if (!singleDesc && !singleAc) singleDesc = trimmedDesc;

        return [{
          storyNumber: singleNum,
          summary: singleSum,
          description: singleDesc,
          acceptanceCriteria: singleAc || (importedList[0]?.acceptanceCriteria ? formatAcceptanceCriteria(importedList[0].acceptanceCriteria) : '')
        }];
      }

      return [];
    }

    if (tab === 'doc') {
      const trimmedDoc = docText.trim();
      if (!trimmedDoc) return [];

      let blocks: string[] = [];
      if (/(?:\r?\n)\s*---\s*(?:\r?\n|$)/.test(trimmedDoc)) {
        blocks = trimmedDoc.split(/(?:\r?\n)\s*---\s*(?:\r?\n|$)/).map(b => b.trim()).filter(Boolean);
      } else {
        const usNumCount = trimmedDoc.match(/User Story (?:Number|ID):\s*[^\n\r]+/gi)?.length || 0;
        if (usNumCount > 1) {
          blocks = trimmedDoc.split(/(?=(?:^|\r?\n)\s*User Story (?:Number|ID):\s*)/i).map(b => b.trim()).filter(Boolean);
        } else {
          const usStoryCount = trimmedDoc.match(/(?:^|\r?\n)\s*(?:User Story\s*\d+|Story\s*\d+|Feature\s*\d+)[:\s]/gi)?.length || 0;
          if (usStoryCount > 1) {
            blocks = trimmedDoc.split(/(?=(?:^|\r?\n)\s*(?:User Story\s*\d+|Story\s*\d+|Feature\s*\d+)[:\s])/i).map(b => b.trim()).filter(Boolean);
          } else {
            const usCount = trimmedDoc.match(/(?:^|\r?\n)\s*US-\d+[:\s]/gi)?.length || 0;
            if (usCount > 1) {
              blocks = trimmedDoc.split(/(?=(?:^|\r?\n)\s*US-\d+[:\s])/i).map(b => b.trim()).filter(Boolean);
            }
          }
        }
      }

      if (blocks.length > 1) {
        return blocks.map((block, idx) => {
          let storyNumber = '';
          let summary = '';
          let storyDesc = '';
          let ac = '';

          const numMatch = block.match(/User Story (?:Number|ID):\s*([^\n\r]+)/i) || 
                             block.match(/\b(US-\d+)\b/i) || 
                             block.match(/(?:User Story\s*(\d+)|Story\s*(\d+)|Feature\s*(\d+))/i);
          if (numMatch) {
            storyNumber = numMatch[1] || numMatch[2] || numMatch[3] ? (numMatch[1] ? (numMatch[1].startsWith('US') ? numMatch[1].trim() : `US-${numMatch[1].trim()}`) : `US-${(idx + 1)}`) : numMatch[0].trim();
          }

          const sumMatch = block.match(/User Story Summary:\s*([^\n\r]+)/i) || 
                             block.match(/(?:^|\n)\s*Summary:\s*([^\n\r]+)/i) ||
                             block.match(/(?:^|\n)\s*Title:\s*([^\n\r]+)/i);
          if (sumMatch) summary = sumMatch[1].trim();

          const descMatch = block.match(/User Story Description:\s*([\s\S]*?)(?=(?:Acceptance Criteria:|---|$))/i) ||
                              block.match(/Description:\s*([\s\S]*?)(?=(?:Acceptance Criteria:|---|$))/i);
          if (descMatch) storyDesc = descMatch[1].trim();

          const acMatch = block.match(/Acceptance Criteria:\s*([\s\S]*?)(?=(?:---|$))/i);
          if (acMatch) ac = acMatch[1].trim();

          if (!storyDesc && !ac) {
            storyDesc = block.slice(0, 1000).trim();
          }

          const fallbackNum = storyNumber || `US-${idx + 1}`;
          const fallbackSum = summary || (storyDesc ? storyDesc.slice(0, 50).replace(/\n/g, ' ') : `${docName || 'Document'} - Story ${idx + 1}`);

          return {
            storyNumber: fallbackNum,
            summary: fallbackSum,
            description: storyDesc,
            acceptanceCriteria: ac
          };
        });
      }

      const cleanDocName = (docName || 'Uploaded Document').replace(/\.[^/.]+$/, '').trim();
      return [{
        storyNumber: cleanDocName.slice(0, 30),
        summary: cleanDocName,
        description: trimmedDoc,
        acceptanceCriteria: descText.trim() || undefined
      }];
    }

    return [];
  };

  const handleGenerate = async () => {
    if (isGenerating) return;

    // 1. GATEKEEPER: Check credit permissions BEFORE starting generation
    const projectSummary = getProjectCreditSummary(project.id, project.name);
    const localPerm = checkAiGenerationPermission(user?.email, 'generateScenariosFromInput', project.id, project.name);
    let permCheck: any = { allowed: true, cost: 10 };
    
    try {
      permCheck = await canPerformAction(project.id, 'generateScenariosFromInput', 'analysis', project.name);
    } catch (creditErr) {
      console.warn("Credit permission check notice:", creditErr);
    }

    const requiredCredits = permCheck.cost || 10;
    const isCreditExceeded = (
      !permCheck.allowed ||
      !localPerm.allowed ||
      projectSummary.isGated ||
      projectSummary.remainingCredits < requiredCredits ||
      projectSummary.isExpired
    );

    if (isCreditExceeded) {
      setIsGenerating(false);
      const creditMsg = permCheck.reason || localPerm.reason || `Credit limit reached for project "${project.name}" (${projectSummary.usedCredits}/${projectSummary.totalPool} credits used, ${projectSummary.remainingCredits} remaining). Generation of AI Scenarios is unavailable.`;
      toast.error(creditMsg);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('credit-limit-exceeded', {
          detail: {
            functionName: 'generateScenariosFromInput',
            userEmail: user?.email,
            reason: creditMsg,
            remainingCredits: projectSummary.remainingCredits ?? 0
          }
        }));
      }
      return;
    }

    setIsGenerating(true);

    let finalInput = '';
    const loginContext = `\n\nGlobal Login Context:\nURL: ${appUrl}\nUsername: ${username}\nPassword: ${password}`;

    if (activeTab === 'text') {
        if (!description.trim() && screenshots.length === 0 && importedStories.length === 0) {
            setIsGenerating(false);
            toast.error("Please provide feature description text or attach screenshot(s)");
            return;
        }
        finalInput = description.trim() 
          ? `Primary Input (Feature Description):\n${description}${loginContext}`
          : `Primary Input: Screenshots provided without textual description.${loginContext}`;
    } else if (activeTab === 'url') {
        if (!analysisUrl.trim() && !description.trim() && screenshots.length === 0) {
            setIsGenerating(false);
            toast.error("Please provide website URL, description, or attach screenshot(s)");
            return;
        }

        let capturedContext = '';
        if (analysisUrl.trim()) {
          try {
            toast.info(`Capturing and analyzing live UI elements from ${analysisUrl.trim()}...`);
            const captureRes = await fetch('/api/capture-url-ui', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: analysisUrl.trim() })
            });
            const captureData = await captureRes.json();
            if (captureData.success) {
              if (captureData.screenshot && screenshots.length === 0) {
                setScreenshots([{
                  id: 'url-capture-' + Date.now(),
                  name: 'url-ui-mockup.svg',
                  data: captureData.screenshot,
                  mimeType: 'image/svg+xml',
                  previewUrl: captureData.screenshot,
                  size: captureData.screenshot.length
                }]);
              }
              const inputsDesc = (captureData.elements?.inputs || [])
                .map((i: any) => `${i.label || i.name} (${i.type || 'text'}${i.required ? ', required' : ''})`)
                .join(', ');
              const buttonsDesc = (captureData.elements?.buttons || []).join(', ');
              const headingsDesc = (captureData.elements?.headings || []).join(', ');

              capturedContext = `\n\nCaptured Website UI Structure & Elements:\n` +
                `Page Title: ${captureData.pageTitle}\n` +
                `Main Headings: ${headingsDesc || 'N/A'}\n` +
                `Form Inputs: ${inputsDesc || 'Email, Password, Search Query'}\n` +
                `Buttons / Actions: ${buttonsDesc || 'Submit, Login, Continue'}\n`;
            }
          } catch (captureErr) {
            console.warn('URL capture notice in ScenarioGenerator:', captureErr);
          }
        }

        finalInput = analysisUrl.trim()
          ? `Target Analysis URL: ${analysisUrl}\nContext: ${description}${capturedContext}${loginContext}`
          : `Primary Input (Feature Description):\n${description}${loginContext}`;
    } else if (activeTab === 'doc') {
        if (!uploadedFileId && !docContent.trim() && screenshots.length === 0) {
            setIsGenerating(false);
            toast.error("Please attach requirements doc or attach screenshot(s)");
            return;
        }
        finalInput = docContent.trim()
          ? `Requirements Doc (${docFileName}) Content:\n${docContent}\nInstructions: ${description}${loginContext}`
          : `Primary Input: Requirements file attached (${docFileName}).${loginContext}`;
    }

    // SERVER-SIDE LARGE FILE AI TEST CASES PIPELINE
    if (activeTab === 'doc' && uploadedFileId) {
      setIsGenerating(true);
      setJobProgressStage('Analyzing document: 0 sections');
      setJobProgressPercent(5);
      setCanResumeJob(false);

      try {
        const cleanLoginContext = (appUrl || username || password)
          ? `Global Login Context:\nURL: ${appUrl}\nUsername: ${username}\nPassword: ${password}`
          : '';

        const startRes = await fetch('/api/ai/testcases/start-job', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            userId: user.email || user.name,
            fileId: uploadedFileId,
            fileName: docFileName,
            loginContext: cleanLoginContext,
            aiInstructions: description ? `${description}\n${aiInstructions}` : aiInstructions
          })
        });

        const startData = await startRes.json();
        if (!startRes.ok || !startData.success) {
          throw new Error(startData.error || 'Failed to start AI generation job');
        }

        const jobId = startData.jobId;
        setActiveJobId(jobId);
        setJobProgressStage(startData.stage || 'Analyzing document...');

        let pollFailCount = 0;
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/ai/testcases/job-status/${jobId}`);
            if (!statusRes.ok) {
              pollFailCount++;
              if (pollFailCount > 6) {
                clearInterval(pollInterval);
                setIsGenerating(false);
                setCanResumeJob(true);
                toast.error("Network issue while checking scenario generation status. Please try again.");
              }
              return;
            }

            pollFailCount = 0;
            const statusData = await statusRes.json();
            if (!statusData.success) return;

            if (statusData.stage) {
              setJobProgressStage(statusData.stage);
            }

            if (statusData.totalChunks > 0) {
              const pct = Math.min(95, Math.round(((statusData.completedChunks || 0) / statusData.totalChunks) * 100));
              setJobProgressPercent(pct);
            }

            if (statusData.status === 'COMPLETED') {
              clearInterval(pollInterval);
              setJobProgressPercent(100);
              setJobProgressStage('Scenarios generated successfully.');

              const generatedScenarios: TestScenario[] = (statusData.scenarios || []).map((s: any) => ({
                ...s,
                appUrl: appUrl || "",
                username: username || "",
                password: password || ""
              }));

              if (generatedScenarios.length > 0) {
                setNewlyGeneratedScenarios(generatedScenarios);
                const updated = [...generatedScenarios, ...scenarios];
                onUpdateProject({ ...project, scenarios: updated });
                try {
                  localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify({ ...project, scenarios: updated }));
                } catch (_) {}

                toast.success(`Generated ${generatedScenarios.length} test scenarios and cases from ${docFileName}!`);
                await logActivity(user.email, user.name, `Generated ${generatedScenarios.length} Scenarios from ${docFileName}`, project.id, project.name);
              } else {
                toast.warning('No scenarios were generated from the document.');
              }
              setIsGenerating(false);
            } else if (statusData.status === 'FAILED') {
              clearInterval(pollInterval);
              setIsGenerating(false);
              setCanResumeJob(true);
              toast.error(statusData.error || 'Generation failed. You can resume unfinished sections.');
            }
          } catch (pollErr) {
            console.warn('Status poll warning:', pollErr);
            pollFailCount++;
            if (pollFailCount > 6) {
              clearInterval(pollInterval);
              setIsGenerating(false);
              toast.error('Unable to reach server during scenario generation. Please check your connection.');
            }
          }
        }, 1500);

        setTimeout(() => {
          clearInterval(pollInterval);
          setIsGenerating(false);
          setCanResumeJob(true);
          toast.error('Scenario generation timed out after 15 minutes.');
        }, 15 * 60 * 1000);
        return;
      } catch (jobErr: any) {
        setIsGenerating(false);
        console.error('Large file job start error:', jobErr);
        toast.error(jobErr.message || 'Failed to start large file test case generation.');
        return;
      }
    }

    setIsGenerating(true);
    try {
      const screenshotUrls = screenshots.map(s => s.previewUrl || (s.data?.startsWith('data:') || s.data?.startsWith('http') ? s.data : `data:${s.mimeType || 'image/png'};base64,${s.data}`));

      const extractedStories = extractStoriesForGeneration(
        activeTab,
        description,
        docContent,
        docFileName,
        importedStories
      );

      let newScenarios: TestScenario[] = [];

      if (extractedStories.length > 1) {
        toast.info(`Generating individual test scenarios separately for ${extractedStories.length} user stories...`);

        const storyPromises = extractedStories.map(async (storyItem, storyIdx) => {
          let storyInput = `User Story Number: ${storyItem.storyNumber}\n`;
          storyInput += `User Story Summary: ${storyItem.summary}\n`;
          if (storyItem.description) {
            storyInput += `User Story Description:\n${storyItem.description}\n`;
          }
          if (storyItem.acceptanceCriteria) {
            storyInput += `Acceptance Criteria:\n${storyItem.acceptanceCriteria}\n`;
          }
          if (loginContext.trim()) {
            storyInput += `${loginContext}\n`;
          }

          let storyEnrichedInput = storyInput;
          if (ragEnabled) {
            const queryForRag = storyItem.summary || storyItem.description || storyItem.storyNumber;
            const enriched = await ragEnrichPrompt(queryForRag, project.id, 2);
            storyEnrichedInput = `${enriched.prompt}\n\n${storyInput}`;
          }

          const storyResults = (await generateScenariosFromInput(
            storyEnrichedInput,
            activeTab as any,
            {
              aiInstructions,
              screenshots,
              userStoryNumber: storyItem.storyNumber,
              userStorySummary: storyItem.summary
            }
          )) as any[];

          return storyResults.map((s: any, idx: number) => {
            const cleanUsNum = storyItem.storyNumber || s.userStoryNumber || `US-${storyIdx + 1}`;
            const cleanUsSum = storyItem.summary || s.userStorySummary || cleanUsNum;

            let scId = s.scenarioId;
            if (!scId || scId === 'AUTO' || !scId.trim() || scId.startsWith('TS-00')) {
              const prefix = `TS-${cleanUsNum.replace(/[^a-zA-Z0-9]/g, '')}`;
              scId = `${prefix}-${(idx + 1).toString().padStart(2, '0')}`;
            }

            const inferredCategory = s.scenarioCategory || 
              (s.tags?.some((t: string) => t.toLowerCase().includes('positive') || t.toLowerCase().includes('happy')) ? 'Positive' :
               s.tags?.some((t: string) => t.toLowerCase().includes('negative') || t.toLowerCase().includes('error')) ? 'Negative' :
               s.tags?.some((t: string) => t.toLowerCase().includes('edge') || t.toLowerCase().includes('boundary')) ? 'Edge' :
               (s.title?.toLowerCase().includes('negative') || s.title?.toLowerCase().includes('error') ? 'Negative' :
                s.title?.toLowerCase().includes('edge') || s.title?.toLowerCase().includes('boundary') ? 'Edge' : 'Positive'));

            return {
              id: Math.random().toString(36).substr(2, 9),
              scenarioId: scId,
              title: s.title || `Verification for ${cleanUsSum}`,
              type: s.type || 'Functional',
              scenarioCategory: inferredCategory,
              description: s.description || 'No description provided',
              expectedResults: s.expectedResults || 'No expected results defined',
              moduleName: cleanUsSum || cleanUsNum,
              isApproved: false,
              testCases: [],
              createdAt: new Date().toISOString(),
              appUrl: appUrl || "",
              username: username || "",
              password: password || "",
              saved: false,
              folderId: "",
              priority: s.priority || 'Medium',
              tags: s.tags || [],
              userStoryNumber: cleanUsNum,
              userStorySummary: cleanUsSum,
              userStoryId: cleanUsNum,
              attachments: undefined
            } as TestScenario;
          });
        });

        const generatedArrays = await Promise.all(storyPromises);
        newScenarios = generatedArrays.flat();
      } else {
        let enrichedInput = finalInput;
        if (ragEnabled) {
          const queryForRag = description || docContent || analysisUrl || 'Generate test scenarios';
          const enriched = await ragEnrichPrompt(queryForRag, project.id, 3);
          enrichedInput = `${enriched.prompt}\n\n${finalInput}`;
          setRetrievedRagChunks(enriched.chunks);
        } else {
          setRetrievedRagChunks([]);
        }

        const singleStory = extractedStories[0];
        const results = (await generateScenariosFromInput(
          enrichedInput, 
          activeTab as any, 
          { 
            aiInstructions, 
            screenshots,
            userStoryNumber: singleStory?.storyNumber || '',
            userStorySummary: singleStory?.summary || ''
          }
        )) as any[];

        newScenarios = results.map((s: any, idx: number) => {
          const cleanUsNum = s.userStoryNumber || singleStory?.storyNumber || '';
          const cleanUsSum = s.userStorySummary || singleStory?.summary || (cleanUsNum ? `Feature ${cleanUsNum}` : '');

          let scId = s.scenarioId;
          if (!scId || scId === 'AUTO' || !scId.trim()) {
            scId = cleanUsNum ? `TS-${cleanUsNum.replace(/[^a-zA-Z0-9]/g, '')}-${(idx + 1).toString().padStart(2, '0')}` : `TS-${(idx + 1).toString().padStart(3, '0')}`;
          }
          const inferredCategory = s.scenarioCategory || 
            (s.tags?.some((t: string) => t.toLowerCase().includes('positive') || t.toLowerCase().includes('happy')) ? 'Positive' :
             s.tags?.some((t: string) => t.toLowerCase().includes('negative') || t.toLowerCase().includes('error')) ? 'Negative' :
             s.tags?.some((t: string) => t.toLowerCase().includes('edge') || t.toLowerCase().includes('boundary')) ? 'Edge' :
             (s.title?.toLowerCase().includes('negative') || s.title?.toLowerCase().includes('error') ? 'Negative' :
              s.title?.toLowerCase().includes('edge') || s.title?.toLowerCase().includes('boundary') ? 'Edge' : 'Positive'));

          return {
            id: Math.random().toString(36).substr(2, 9),
            scenarioId: scId,
            title: s.title || 'Untitled Scenario',
            type: s.type || 'Functional',
            scenarioCategory: inferredCategory,
            description: s.description || 'No description provided',
            expectedResults: s.expectedResults || 'No expected results defined',
            moduleName: s.moduleName || cleanUsSum || 'AI Generated',
            isApproved: false,
            testCases: [],
            createdAt: new Date().toISOString(),
            appUrl: appUrl || "",
            username: username || "",
            password: password || "",
            saved: false,
            folderId: "",
            priority: s.priority || 'Medium',
            tags: s.tags || [],
            userStoryNumber: cleanUsNum,
            userStorySummary: cleanUsSum,
            userStoryId: cleanUsNum,
            attachments: undefined
          };
        });
      }

      // Generated scenarios are automatically recorded into Token Consumption via the AI service call


      // Create a single consolidated input source item containing all input documents and screenshots together
      const inputSources: TestScenario[] = [];

      const hasDoc = activeTab === 'doc' && docContent.trim();
      const hasUrl = activeTab === 'url' && analysisUrl.trim();
      const hasText = activeTab === 'text' && description.trim();
      const hasScreenshots = screenshotUrls.length > 0;

      if (hasDoc || hasUrl || hasText || hasScreenshots || (aiInstructions && aiInstructions.trim()) || appUrl.trim() || username.trim()) {
        let singleTitle = 'Input Source: Documents & Context';
        if (docFileName && hasScreenshots) {
          singleTitle = `Input Source: Document (${docFileName}) & Screenshots (${screenshotUrls.length})`;
        } else if (docFileName) {
          singleTitle = `Input Source: Requirements Doc (${docFileName})`;
        } else if (hasScreenshots && (hasText || hasUrl)) {
          singleTitle = `Input Source: Requirements & Screenshots (${screenshotUrls.length})`;
        } else if (hasScreenshots) {
          singleTitle = `Input Source: Screenshots (${screenshotUrls.length})`;
        } else if (hasText) {
          singleTitle = 'Input Source: Feature Description';
        } else if (hasUrl) {
          singleTitle = 'Input Source: Website URL Analysis';
        }

        let combinedDesc = '';
        if (hasDoc) {
          const cleanDoc = sanitizeAndExtractDocContent(docContent, docFileName);
          combinedDesc += `Document File: ${docFileName || 'Attached Document'}\n\n${cleanDoc}`;
          if (description.trim()) {
            combinedDesc += `\n\nAdditional Instructions:\n${description.trim()}`;
          }
        } else if (hasUrl) {
          combinedDesc += `Analysis URL: ${analysisUrl.trim()}`;
          if (description.trim()) {
            combinedDesc += `\n\nAdditional Context:\n${description.trim()}`;
          }
        } else if (hasText) {
          combinedDesc += `Feature Description:\n${description.trim()}`;
        }

        if (hasScreenshots) {
          if (combinedDesc) combinedDesc += '\n\n';
          combinedDesc += `Attached Screenshots: ${screenshotUrls.length} image(s) uploaded.`;
        }

        if (appUrl.trim() || username.trim() || password.trim()) {
          if (combinedDesc) combinedDesc += '\n\n';
          combinedDesc += `Login Environment:\nURL: ${appUrl.trim() || 'N/A'}\nUser: ${username.trim() || 'N/A'}\nPassword: ${password ? '••••••••' : 'N/A'}`;
        }

        if (aiInstructions && aiInstructions.trim()) {
          if (combinedDesc) combinedDesc += '\n\n';
          combinedDesc += `Refining Constraints:\n${aiInstructions.trim()}`;
        }

        inputSources.push({
          id: Math.random().toString(36).substr(2, 9),
          scenarioId: 'INPUT_SOURCE',
          title: singleTitle,
          type: 'Functional',
          description: combinedDesc,
          expectedResults: 'Original input document(s) and screenshot(s) used for AI scenario synthesis.',
          moduleName: 'INPUTS',
          isApproved: false,
          testCases: [],
          createdAt: new Date().toISOString(),
          saved: false,
          folderId: "",
          priority: 'Medium',
          tags: ['input-source', 'original-input', ...(hasScreenshots ? ['screenshots'] : []), ...(hasDoc ? ['requirements-doc'] : [])],
          attachments: hasScreenshots ? screenshotUrls : undefined
        });
      }

      const allNewItems = [...newScenarios, ...inputSources];

      // Save input snapshot so details/document can be displayed under generated scenarios
      setLastInputDetails({
        activeTab,
        docFileName,
        docContent,
        description,
        analysisUrl,
        screenshots: [...screenshots],
        aiInstructions,
        appUrl,
        username,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      // Clear input document & fields so they disappear from generator input area
      setDescription('');
      setDocContent('');
      setDocFileName('');
      setAnalysisUrl('');
      setScreenshots([]);
      setImportedStories([]);
      if (docUploadRef.current) {
        docUploadRef.current.value = '';
      }

      // Store in state so they remain visible on screen
      setNewlyGeneratedScenarios(allNewItems);

      // Add new items at the top to ensure visibility on the first page
      onUpdateProject({ ...project, scenarios: [...allNewItems, ...scenarios] });
      logActivity(user.email, user.name, `Generated ${newScenarios.length} Scenarios via ${activeTab.toUpperCase()} (Inputs saved to workspace)`, project.id, project.name).catch(err => console.error("Error logging activity:", err));

      toast.success(`Successfully generated ${newScenarios.length} test scenarios.`);
    } catch (e: any) {
      console.error("AI Scenario generation error:", e);
      const errMsg = e?.message || e?.error || 'Generation failed. Please verify your credit balance or network connection.';
      toast.error(errMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveScenario = (id: string, e?: React.MouseEvent, folderHint?: TestScenario) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    const target = scenarios.find(s => s.id === id) || newlyGeneratedScenarios.find(s => s.id === id);
    if (!target) return;

    if (target.isApproved) {
      toast.info(`Scenario "${target.title}" is already approved.`);
      return;
    }

    // Individual Scenario: When the user clicks Approve, a popup should appear asking the user to select/save a folder
    // UNLESS the scenario is already inside an existing folder or folderHint is provided.
    // If it belongs to an existing folder, bypass popup and directly approve!
    let existingFolder: TestScenario | undefined = folderHint;

    if (!existingFolder && (target.folderId || target.folderName)) {
      const targetFid = (target.folderId || '').trim();
      const targetFname = (target.folderName || '').trim().toLowerCase();

      existingFolder = scenarios.find(f => {
        if (!f) return false;
        const fid = (f.id || '').trim();
        const ftitle = (f.title || '').trim().toLowerCase();
        return (targetFid && (fid === targetFid || ftitle === targetFid.toLowerCase())) ||
               (targetFname && (fid === targetFname || ftitle === targetFname));
      });
    }

    if (!existingFolder) {
      existingFolder = scenarios.find(f => 
        (isScenarioFolder(f) || f.isFolder || f.scenarioId === 'SCENARIO_FOLDER') &&
        (isMemberOfFolder(target, f) || 
         (Array.isArray(f.memberScenarioIds) && (f.memberScenarioIds.includes(target.id) || (target.scenarioId && f.memberScenarioIds.includes(target.scenarioId))))
        )
      );
    }

    const isUnderFolder = Boolean(existingFolder || target.folderId || target.folderName);

    if (isUnderFolder) {
      const folderId = existingFolder?.id || target.folderId || `folder_${Date.now()}`;
      const folderTitle = existingFolder?.title || target.folderName || target.folderId || 'Folder';

      let updatedScenariosList = scenarios.map(s => {
        if (s.id === target.id) {
          return {
            ...s,
            isApproved: true,
            saved: true,
            isRemovedFromIndividual: false,
            folderId: folderId,
            folderName: folderTitle,
            testCaseFolderId: undefined
          };
        }
        if (s.id === folderId) {
          const currentMembers = Array.isArray(s.memberScenarioIds) ? s.memberScenarioIds : [];
          return {
            ...s,
            isFolder: true,
            folderType: 'scenario',
            scenarioId: 'SCENARIO_FOLDER',
            moduleName: s.moduleName || 'AI SCENARIOS',
            memberScenarioIds: currentMembers.includes(target.id) ? currentMembers : [...currentMembers, target.id]
          };
        }
        return s;
      });

      if (!updatedScenariosList.some(s => s.id === target.id)) {
        updatedScenariosList.unshift({
          ...target,
          isApproved: true,
          saved: true,
          isRemovedFromIndividual: false,
          folderId: folderId,
          folderName: folderTitle,
          testCaseFolderId: undefined
        });
      }

      // If folder didn't exist in scenarios list yet, ensure it is added
      if (!updatedScenariosList.some(s => s.id === folderId)) {
        const newFolderObj: TestScenario = existingFolder || {
          id: folderId,
          scenarioId: 'SCENARIO_FOLDER',
          isFolder: true,
          folderType: 'scenario',
          title: folderTitle,
          type: 'Functional',
          description: 'Folder for scenarios',
          expectedResults: 'Folder container',
          moduleName: 'AI SCENARIOS',
          isApproved: true,
          saved: true,
          testCases: [],
          createdAt: new Date().toISOString(),
          memberScenarioIds: [target.id]
        };
        updatedScenariosList.unshift(newFolderObj);
      }

      setNewlyGeneratedScenarios(prev => prev.map(s => {
        if (s.id === target.id) {
          return {
            ...s,
            isApproved: true,
            saved: true,
            isRemovedFromIndividual: false,
            folderId: folderId,
            folderName: folderTitle,
            testCaseFolderId: undefined
          };
        }
        return s;
      }));

      setSelectedScenarioIds(prev => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });

      onUpdateProject({ ...project, scenarios: updatedScenariosList });
      try {
        localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify({ ...project, scenarios: updatedScenariosList }));
      } catch (err) {}

      toast.success(`Scenario "${target.title}" approved! Moved to AI Test Cases → Individual Scenarios.`);
      logActivity(
        user.email,
        user.name,
        `Approved Scenario: ${target.title} (Folder: ${folderTitle})`,
        project.id,
        project.name
      ).catch(err => console.error("Error logging activity:", err));

      if (onNavigateTab) {
        onNavigateTab('cases');
      }
      return;
    }

    const availableFolders = scenarios.filter(isScenarioFolder);
    const initialFolderId = target.folderId || (availableFolders.length > 0 ? availableFolders[0].id : '');

    setScenariosToApproveAndSave([target]);
    setSelectedFolderIdForSave(initialFolderId);
    setShowCreateFolderInline(availableFolders.length === 0);
    setInlineNewFolderName('');
    setInlineFolderError(null);
    setSearchFolderQuery('');
  };

  const handleSaveAndApproveScenario = async () => {
    if (scenariosToApproveAndSave.length === 0) return;
    
    try {
      let finalFolderId = selectedFolderIdForSave;
      let updatedScenariosList = [...scenarios];

      // Ensure any newly generated scenarios are included in updatedScenariosList if not present
      for (const tScen of scenariosToApproveAndSave) {
        if (!updatedScenariosList.some(s => s.id === tScen.id)) {
          updatedScenariosList.unshift(tScen);
        }
      }

      const targetIds = scenariosToApproveAndSave.map(s => s.id);
      const targetIdSet = new Set(targetIds);

      if (showCreateFolderInline) {
        const trimmedInlineName = inlineNewFolderName.trim();
        if (!trimmedInlineName) {
          setInlineFolderError('Please enter a folder name');
          return;
        }

        const isDuplicate = scenarios.some(s => 
          isScenarioFolder(s) && 
          s.title.toLowerCase() === trimmedInlineName.toLowerCase()
        );

        if (isDuplicate) {
          setInlineFolderError('This folder name is already in use.');
          return;
        }

        const newFolderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const newFolder: TestScenario = {
          id: newFolderId,
          scenarioId: 'SCENARIO_FOLDER',
          isFolder: true,
          folderType: 'scenario',
          title: trimmedInlineName,
          type: 'Functional',
          description: 'Folder for scenarios',
          expectedResults: 'Folder container',
          moduleName: 'AI SCENARIOS',
          isApproved: true,
          saved: true,
          testCases: [],
          createdAt: new Date().toISOString(),
          memberScenarioIds: targetIds
        };

        // Remove target scenarios from all existing folders
        updatedScenariosList = updatedScenariosList.map(s => {
          if (isScenarioFolder(s)) {
            return {
              ...s,
              memberScenarioIds: (s.memberScenarioIds || []).filter(id => !targetIdSet.has(id))
            };
          }
          return s;
        });

        updatedScenariosList = [newFolder, ...updatedScenariosList];
        finalFolderId = newFolderId;
      } else {
        if (!finalFolderId) {
          toast.error('Please select an existing folder or create a new one');
          return;
        }

        // Add the target scenario IDs to the selected folder's memberScenarioIds AND remove from all other folders
        updatedScenariosList = updatedScenariosList.map(s => {
          if (s.id === finalFolderId) {
            const currentMembers = (s.memberScenarioIds || []).filter(id => !targetIdSet.has(id));
            return {
              ...s,
              isApproved: true,
              isFolder: true,
              folderType: 'scenario',
              scenarioId: 'SCENARIO_FOLDER',
              moduleName: s.moduleName || 'AI SCENARIOS',
              memberScenarioIds: Array.from(new Set([...currentMembers, ...targetIds]))
            };
          } else if (isScenarioFolder(s)) {
            return {
              ...s,
              memberScenarioIds: (s.memberScenarioIds || []).filter(id => !targetIdSet.has(id))
            };
          }
          return s;
        });
      }

      const targetFolderObj = updatedScenariosList.find(s => s.id === finalFolderId);
      const folderName = targetFolderObj?.title || 'Selected Folder';

      // Mark the target scenarios as saved, moved to folder, and approved!
      updatedScenariosList = updatedScenariosList.map(s => {
        if (targetIdSet.has(s.id)) {
          return {
            ...s,
            saved: true,
            folderId: finalFolderId,
            folderName: folderName,
            isRemovedFromIndividual: false,
            isApproved: true,
            testCaseFolderId: undefined
          };
        }
        return s;
      });

      // Also update newlyGeneratedScenarios if present
      setNewlyGeneratedScenarios(prev => prev.map(s => {
        if (targetIdSet.has(s.id)) {
          return {
            ...s,
            isApproved: true,
            isRemovedFromIndividual: false,
            folderId: finalFolderId,
            folderName: folderName,
            testCaseFolderId: undefined,
            saved: true
          };
        }
        return s;
      }));

      // Update the project
      onUpdateProject({ ...project, scenarios: updatedScenariosList });
      try {
        localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify({ ...project, scenarios: updatedScenariosList }));
      } catch (err) {}

      // Clean selected scenario IDs
      const nextSelected = new Set(selectedScenarioIds);
      targetIds.forEach(id => nextSelected.delete(id));
      setSelectedScenarioIds(nextSelected);

      const count = scenariosToApproveAndSave.length;
      const activityMsg = count === 1
        ? `Saved Scenario: ${scenariosToApproveAndSave[0].title} to folder "${folderName}" and approved`
        : `Saved ${count} Scenarios to folder "${folderName}" and approved`;

      // Close modal immediately
      setScenariosToApproveAndSave([]);
      setInlineNewFolderName('');
      setInlineFolderError(null);
      setSelectedFolderIdForSave('');
      setShowCreateFolderInline(false);

      toast.success(count === 1 ? `Scenario "${scenariosToApproveAndSave[0].title}" saved to folder "${folderName}" and approved! Moved to AI Test Cases → Individual Scenarios.` : `${count} scenarios saved to folder "${folderName}" and approved! Moved to AI Test Cases → Individual Scenarios.`);

      logActivity(
        user.email, 
        user.name, 
        activityMsg, 
        project.id, 
        project.name
      ).catch(err => console.error("Error logging activity:", err));

      if (onNavigateTab) {
        onNavigateTab('cases');
      }
    } catch (error) {
      toast.error('Failed to save and approve scenario. Please try again.');
    }
  };

  const handleSaveScenariosWithoutApprove = async () => {
    if (scenariosToMoveWithoutApprove.length === 0) return;
    
    try {
      let finalFolderId = selectedFolderIdForSave;
      let finalFolderName = '';
      let updatedScenariosList = [...scenarios];
      const targetIds = scenariosToMoveWithoutApprove.map(s => s.id);
      const targetIdSet = new Set(targetIds);

      // Create a map to preserve existing approval status of incoming scenarios
      const incomingStatusMap = new Map<string, boolean>();
      scenariosToMoveWithoutApprove.forEach(s => {
        incomingStatusMap.set(s.id, Boolean(s.isApproved));
      });

      if (showCreateFolderInline) {
        const trimmedInlineName = inlineNewFolderName.trim();
        if (!trimmedInlineName) {
          setInlineFolderError('Please enter a folder name');
          return;
        }

        const isDuplicate = scenarios.some(s => 
          isScenarioFolder(s) && 
          s.title.toLowerCase() === trimmedInlineName.toLowerCase()
        );

        if (isDuplicate) {
          setInlineFolderError('This folder name is already in use.');
          return;
        }

        const newFolderId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const newFolder: TestScenario = {
          id: newFolderId,
          scenarioId: 'SCENARIO_FOLDER',
          isFolder: true,
          folderType: 'scenario',
          title: trimmedInlineName,
          type: 'Functional',
          description: 'Organization folder',
          expectedResults: 'N/A',
          moduleName: 'AI SCENARIOS',
          isApproved: true,
          saved: true,
          testCases: [],
          createdAt: new Date().toISOString(),
          memberScenarioIds: targetIds
        };

        // Remove target scenarios from all existing folders
        updatedScenariosList = updatedScenariosList.map(s => {
          if (isScenarioFolder(s)) {
            return {
              ...s,
              memberScenarioIds: (s.memberScenarioIds || []).filter(id => !targetIdSet.has(id))
            };
          }
          return s;
        });

        updatedScenariosList = [newFolder, ...updatedScenariosList];
        finalFolderId = newFolderId;
        finalFolderName = trimmedInlineName;
      } else {
        if (!finalFolderId) {
          toast.error('Please select a folder or create a new one');
          return;
        }

        const existingFolder = updatedScenariosList.find(s => s.id === finalFolderId);
        finalFolderName = existingFolder?.title || 'Selected Folder';

        // Add the target scenario IDs to the selected folder's memberScenarioIds AND remove from all other folders
        updatedScenariosList = updatedScenariosList.map(s => {
          if (isScenarioFolder(s)) {
            if (s.id === finalFolderId) {
              const currentMembers = (s.memberScenarioIds || []).filter(id => !targetIdSet.has(id));
              return {
                ...s,
                isFolder: true,
                folderType: 'scenario',
                scenarioId: 'SCENARIO_FOLDER',
                moduleName: s.moduleName || 'AI SCENARIOS',
                memberScenarioIds: Array.from(new Set([...currentMembers, ...targetIds]))
              };
            } else {
              return {
                ...s,
                memberScenarioIds: (s.memberScenarioIds || []).filter(id => !targetIdSet.has(id))
              };
            }
          }
          return s;
        });
      }

      // Ensure any target scenarios not currently in updatedScenariosList are preserved
      const existingIdSet = new Set(updatedScenariosList.map(s => s.id));
      const missingTargets = scenariosToMoveWithoutApprove.filter(s => !existingIdSet.has(s.id));
      if (missingTargets.length > 0) {
        updatedScenariosList = [...updatedScenariosList, ...missingTargets];
      }

      // Mark the target scenarios as saved with folderId, preserving existing approval status and keeping visible in individual list
      // Strictly do not generate or move test cases automatically
      updatedScenariosList = updatedScenariosList.map(s => {
        if (targetIdSet.has(s.id)) {
          const preservedApproval = incomingStatusMap.has(s.id) ? incomingStatusMap.get(s.id)! : Boolean(s.isApproved);
          return {
            ...s,
            saved: true,
            folderId: finalFolderId,
            folderName: finalFolderName,
            isRemovedFromIndividual: false,
            isApproved: preservedApproval,
            testCases: s.testCases || []
          };
        }
        return s;
      });

      // Update the project
      onUpdateProject({ ...project, scenarios: updatedScenariosList });
      try {
        localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify({ ...project, scenarios: updatedScenariosList }));
      } catch (err) {}

      // Update newlyGeneratedScenarios if present
      setNewlyGeneratedScenarios(prev => prev.map(s => {
        if (targetIdSet.has(s.id)) {
          const preservedApproval = incomingStatusMap.has(s.id) ? incomingStatusMap.get(s.id)! : Boolean(s.isApproved);
          return {
            ...s,
            saved: true,
            folderId: finalFolderId,
            folderName: finalFolderName,
            isRemovedFromIndividual: false,
            isApproved: preservedApproval,
            testCases: s.testCases || []
          };
        }
        return s;
      }));

      // Clean selected scenario IDs
      const nextSelected = new Set(selectedScenarioIds);
      targetIds.forEach(id => nextSelected.delete(id));
      setSelectedScenarioIds(nextSelected);

      const count = scenariosToMoveWithoutApprove.length;
      const activityMsg = count === 1
        ? `Saved Scenario: ${scenariosToMoveWithoutApprove[0].title} to folder "${finalFolderName}"`
        : `Saved ${count} Scenarios to folder "${finalFolderName}"`;

      // Close modal immediately
      setScenariosToMoveWithoutApprove([]);
      setInlineNewFolderName('');
      setInlineFolderError(null);
      setSelectedFolderIdForSave('');
      setShowCreateFolderInline(false);

      toast.success(count === 1 ? `Scenario saved to folder "${finalFolderName}" successfully!` : `${count} scenarios saved to folder "${finalFolderName}" successfully!`);

      logActivity(
        user.email, 
        user.name, 
        activityMsg, 
        project.id, 
        project.name
      ).catch(err => console.error("Error logging activity:", err));
    } catch (error) {
      toast.error('Failed to save scenario to folder. Please try again.');
    }
  };

  const handleBulkMoveToFolder = () => {
    if (selectedScenarioIds.size === 0) return;

    const selectedScenarios = scenarios.filter(s => selectedScenarioIds.has(s.id) && !['SCENARIO_FOLDER', 'INPUT_SOURCE'].includes(s.scenarioId));
    if (selectedScenarios.length === 0) return;

    setScenariosToMoveWithoutApprove(selectedScenarios);
    setSelectedFolderIdForSave('');
    setShowCreateFolderInline(false);
    setInlineNewFolderName('');
    setInlineFolderError(null);
  };

  const handleBulkApprove = async () => {
    if (selectedScenarioIds.size === 0) return;

    const selectedScenarios = scenarios.filter(s => 
      selectedScenarioIds.has(s.id) && 
      !['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER', 'INPUT_SOURCE'].includes(s.scenarioId) &&
      !s.isFolder
    );
    if (selectedScenarios.length === 0) return;

    const allBelongToFolder = selectedScenarios.every(s => 
      Boolean(s.folderId) || scenarios.some(f => isScenarioFolder(f) && isMemberOfFolder(s, f))
    );

    if (allBelongToFolder) {
      const selectedIdSet = new Set(selectedScenarios.map(s => s.id));
      const updatedScenariosList = scenarios.map(s => {
        if (selectedIdSet.has(s.id)) {
          return {
            ...s,
            isApproved: true,
            saved: true,
            isRemovedFromIndividual: false,
            testCaseFolderId: undefined
          };
        }
        return s;
      });

      setSelectedScenarioIds(new Set());
      onUpdateProject({ ...project, scenarios: updatedScenariosList });
      try {
        localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify({ ...project, scenarios: updatedScenariosList }));
      } catch (err) {}

      toast.success(`Approved ${selectedScenarios.length} scenario(s)! Moved to AI Test Cases → Individual Scenarios.`);
      logActivity(
        user.email,
        user.name,
        `Bulk Approved ${selectedScenarios.length} Scenarios`,
        project.id,
        project.name
      ).catch(err => console.error("Error logging activity:", err));
      if (onNavigateTab) {
        onNavigateTab('cases');
      }
      return;
    }

    const availableFolders = scenarios.filter(isScenarioFolder);
    const firstFolderId = selectedScenarios.find(s => s.folderId)?.folderId || (availableFolders.length > 0 ? availableFolders[0].id : '');

    setScenariosToApproveAndSave(selectedScenarios);
    setSelectedFolderIdForSave(firstFolderId);
    setShowCreateFolderInline(availableFolders.length === 0);
    setInlineNewFolderName('');
    setInlineFolderError(null);
    setSearchFolderQuery('');
  };

  const handleBulkDelete = async () => {
    const selectedIds = new Set(selectedScenarioIds);
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    const tombstonesToAdd: string[] = [];
    const deletedFolderIds: string[] = [];

    selectedIds.forEach(id => {
      tombstonesToAdd.push(id, id.toLowerCase(), `folder-${id}`, `folder-${id.toLowerCase()}`);
      const s = scenarios.find(item => item.id === id);
      if (s) {
        if (s.scenarioId && s.scenarioId !== 'SCENARIO_FOLDER') {
          const scNorm = s.scenarioId.trim().toLowerCase();
          tombstonesToAdd.push(s.scenarioId, scNorm);
        }
        const isFolder = isScenarioFolder(s) || s.scenarioId === 'SCENARIO_FOLDER' || s.folderType === 'scenario';
        if (isFolder) {
          deletedFolderIds.push(id);
          if (s.title) {
            const tNorm = s.title.trim().toLowerCase();
            tombstonesToAdd.push(`folder-${s.title}`, `folder-${tNorm}`);
          }
        }
        if (Array.isArray(s.testCases)) {
          s.testCases.forEach(tc => {
            if (tc?.id) tombstonesToAdd.push(tc.id, tc.id.toLowerCase());
          });
        }
      }
    });

    addDeletedIds(tombstonesToAdd);
    const tombstoneSet = new Set(tombstonesToAdd.map(t => t.toLowerCase()));

    const apiScenarios = (project.scenarios || []).filter(s => isApiTestingScenario(s));

    let updatedScenarios = scenarios.filter(s => 
      !selectedIds.has(s.id) && 
      !tombstoneSet.has(s.id.toLowerCase()) && 
      !(s.scenarioId && tombstoneSet.has(s.scenarioId.toLowerCase()))
    );
    
    const deletedFolderIdSet = new Set(deletedFolderIds);
    updatedScenarios = updatedScenarios.map(s => {
      if (s.folderId && (deletedFolderIdSet.has(s.folderId) || tombstoneSet.has(s.folderId.toLowerCase()))) {
        return { ...s, folderId: "", folderName: "", testCaseFolderId: undefined, isRemovedFromIndividual: false };
      }
      if (isScenarioFolder(s)) {
        const nextMembers = (s.memberScenarioIds || []).filter(mId => !selectedIds.has(mId) && !tombstoneSet.has(mId.toLowerCase()));
        return { ...s, memberScenarioIds: nextMembers };
      }
      return s;
    });

    setNewlyGeneratedScenarios(prev => prev.filter(s => 
      !selectedIds.has(s.id) && 
      !tombstoneSet.has(s.id.toLowerCase()) &&
      !(s.scenarioId && tombstoneSet.has(s.scenarioId.toLowerCase()))
    ));

    const existingDeleted = Array.isArray(project.deletedItemIds) ? project.deletedItemIds : [];
    const mergedDeleted = Array.from(new Set([...existingDeleted, ...tombstonesToAdd]));

    const updatedProject: Project = {
      ...project,
      scenarios: [...updatedScenarios, ...apiScenarios],
      deletedItemIds: mergedDeleted
    };

    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
      const cached = localStorage.getItem('automatiqa_projects_cache');
      if (cached) {
        const list = JSON.parse(cached);
        const next = list.map((p: any) => p.id === project.id ? updatedProject : p);
        localStorage.setItem('automatiqa_projects_cache', JSON.stringify(next));
      }
    } catch (e) {}

    saveProjectBackup(updatedProject);

    // Update UI and close modal immediately
    setSelectedScenarioIds(new Set());
    setShowBulkDeleteConfirm(false);
    toast.success(`Deleted ${count} items successfully!`);

    Promise.resolve(onUpdateProject(updatedProject, { immediate: true })).catch(e => console.warn("Update project notice:", e));

    // Clean deleted folders in backend & Firestore
    deletedFolderIds.forEach(fId => {
      deleteFolderFromFirestore(project.id, fId).catch(() => {});
      fetch(`/api/projects/${encodeURIComponent(project.id)}/folders/${encodeURIComponent(fId)}`, {
        method: 'DELETE'
      }).catch(() => {});
    });

    fetch(`/api/projects/backup/${encodeURIComponent(project.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedProject)
    }).catch(() => {});

    logActivity(user.email, user.name, `Bulk deleted ${count} items`, project.id, project.name);
  };

  const handleDeleteScenario = async (id: string) => {
    const target = scenarios.find(s => s.id === id);
    const isTargetFolder = Boolean(target && (isScenarioFolder(target) || target.scenarioId === 'SCENARIO_FOLDER' || target.folderType === 'scenario'));

    const tombstonesToAdd: string[] = [id, id.toLowerCase(), `folder-${id}`, `folder-${id.toLowerCase()}`];
    if (target?.scenarioId && target.scenarioId !== 'SCENARIO_FOLDER') {
      const scNorm = target.scenarioId.trim().toLowerCase();
      tombstonesToAdd.push(target.scenarioId, scNorm);
    }
    if (isTargetFolder && target?.title) {
      const tNorm = target.title.trim().toLowerCase();
      tombstonesToAdd.push(`folder-${target.title}`, `folder-${tNorm}`);
    }
    if (Array.isArray(target?.testCases)) {
      target.testCases.forEach(tc => {
        if (tc?.id) {
          tombstonesToAdd.push(tc.id);
          tombstonesToAdd.push(tc.id.toLowerCase());
        }
      });
    }

    addDeletedIds(tombstonesToAdd);
    const tombstoneSet = new Set(tombstonesToAdd.map(t => t.toLowerCase()));

    const apiScenarios = (project.scenarios || []).filter(s => isApiTestingScenario(s));

    let updatedScenarios = scenarios.filter(s => {
      if (s.id === id) return false;
      if (tombstoneSet.has(s.id.toLowerCase())) return false;
      if (s.scenarioId && tombstoneSet.has(s.scenarioId.toLowerCase())) return false;
      if (isTargetFolder && s.scenarioId === 'SCENARIO_FOLDER' && target?.title && s.title?.trim().toLowerCase() === target.title.trim().toLowerCase()) {
        return false;
      }
      return true;
    });

    if (isTargetFolder) {
      const memberIds = new Set(target?.memberScenarioIds || []);
      updatedScenarios = updatedScenarios.map(s => {
        const isMember = memberIds.has(s.id) || 
          s.folderId === id || 
          (target?.title && (s.folderId === target.title || (s.folderName && s.folderName.trim().toLowerCase() === target.title.trim().toLowerCase())));
        if (isMember) {
          return { ...s, folderId: "", folderName: "", testCaseFolderId: undefined, isRemovedFromIndividual: false };
        }
        return s;
      });
    } else {
      updatedScenarios = updatedScenarios.map(s => {
        if (isScenarioFolder(s) && s.memberScenarioIds?.includes(id)) {
          return {
            ...s,
            memberScenarioIds: s.memberScenarioIds.filter(mId => mId !== id && !tombstoneSet.has(mId.toLowerCase()))
          };
        }
        return s;
      });
    }

    setNewlyGeneratedScenarios(prev => prev.filter(s => s.id !== id && !tombstoneSet.has(s.id.toLowerCase())));

    const existingDeleted = Array.isArray(project.deletedItemIds) ? project.deletedItemIds : [];
    const mergedDeleted = Array.from(new Set([...existingDeleted, ...tombstonesToAdd]));

    const updatedProject: Project = {
      ...project,
      scenarios: [...updatedScenarios, ...apiScenarios],
      deletedItemIds: mergedDeleted
    };

    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
      const cached = localStorage.getItem('automatiqa_projects_cache');
      if (cached) {
        const list = JSON.parse(cached);
        const next = list.map((p: any) => p.id === project.id ? updatedProject : p);
        localStorage.setItem('automatiqa_projects_cache', JSON.stringify(next));
      }
    } catch (e) {}

    saveProjectBackup(updatedProject);

    // Close popup and update local state immediately
    setDeleteTargetId(null);
    if (selectedScenarioIds.has(id)) {
      const next = new Set(selectedScenarioIds);
      next.delete(id);
      setSelectedScenarioIds(next);
    }
    
    if (expandedItems.has(id)) {
      const nextExp = new Set(expandedItems);
      nextExp.delete(id);
      setExpandedItems(nextExp);
    }

    toast.success(isTargetFolder ? "Folder deleted permanently" : "Scenario deleted successfully");

    Promise.resolve(onUpdateProject(updatedProject, { immediate: true })).catch(e => console.warn("Update project notice:", e));

    if (isTargetFolder) {
      // 1. Delete folder and subcollections in Firestore
      deleteFolderFromFirestore(project.id, id).catch(err => {
        console.warn("deleteFolderFromFirestore notice:", err);
      });
      // 2. Delete folder in server backend
      fetch(`/api/projects/${encodeURIComponent(project.id)}/folders/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      }).catch(() => {});
    }

    // 3. Sync disk backup file on server
    fetch(`/api/projects/backup/${encodeURIComponent(project.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedProject)
    }).catch(() => {});

    logActivity(user.email, user.name, `Deleted ${isTargetFolder ? 'folder' : 'scenario'} ${target?.title || id}`, project.id, project.name);
  };

  const handleDownloadTemplate = (format: 'excel' | 'csv' = 'excel') => {
    const template = [
      { Title: 'Verify login flow', Module: 'Identity', Type: 'Functional', Description: 'Check user can sign in', ExpectedResults: 'User redirected to dashboard' }
    ];
    if (format === 'excel') {
      downloadExcel(template, "Scenario_Template", "Scenarios");
      toast.success('Scenario template downloaded as Excel!');
    } else {
      downloadCsv(template, "Scenario_Template");
      toast.success('Scenario template downloaded as CSV!');
    }
  };

  const handleDownloadRepository = async (format: 'excel' | 'csv' = 'excel') => {
    try {
      await deductExportCredits(project.id, 'ai_scenarios', user, `Export Scenarios Repository (${format.toUpperCase()})`, project.name);
    } catch (err) {
      console.warn('Credit check warning:', err);
    }

    const approvedScenarios = scenarios.filter(s => s.isApproved && !['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER'].includes(s.scenarioId));
    if (approvedScenarios.length === 0) {
      toast.error('No approved scenarios available to export.');
      return;
    }

    const data = approvedScenarios.map((s, idx) => {
      const scPassword = s.password || password;
      return {
        '#': idx + 1,
        'Scenario ID': s.scenarioId || `SC-${idx + 1}`,
        'Title': s.title,
        'Module': s.moduleName || 'General',
        'Type': s.type || 'Functional',
        'Description': maskPasswordText(s.description, scPassword),
        'Expected Results': maskPasswordText(s.expectedResults, scPassword),
        'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'
      };
    });

    if (format === 'excel') {
      downloadExcel(data, `${project.name.replace(/\s+/g, '_')}_Scenarios`, "Repository");
      toast.success(`Exported ${approvedScenarios.length} scenarios to Excel!`);
    } else {
      downloadCsv(data, `${project.name.replace(/\s+/g, '_')}_Scenarios`);
      toast.success(`Exported ${approvedScenarios.length} scenarios to CSV!`);
    }
  };

  const handleUploadScenarios = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const bstr = event.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const newScenarios: TestScenario[] = data.map((item, idx) => ({
          id: Math.random().toString(36).substr(2, 9),
          scenarioId: `UP-${Date.now().toString().slice(-4)}-${idx}`,
          title: item.Title || item.Scenario || 'Uploaded Scenario',
          type: (item.Type === 'Non-functional' || item.Type === 'Non-Functional') ? 'Non-functional' : 'Functional',
          description: item.Description || item.Scenario || 'No description',
          expectedResults: item.ExpectedResults || 'No expected results',
          moduleName: item.Module || 'Uploaded',
          isApproved: false, // Mark as false to ensure they appear in the pending individual scenarios list
          testCases: [],
          createdAt: new Date().toISOString(),
          appUrl: appUrl || "",
          username: username || "",
          password: password || ""
        }));

        // Insert at the beginning so they appear on page 1
        onUpdateProject({ ...project, scenarios: [...newScenarios, ...scenarios] });
        await logActivity(user.email, user.name, `Uploaded ${newScenarios.length} Scenarios via Excel`, project.id, project.name);
        
        if (uploadInputRef.current) uploadInputRef.current.value = '';
        alert(`Successfully uploaded ${newScenarios.length} scenarios. Please review them in the Individual Scenarios tab.`);
      } catch (err) {
        alert('Failed to parse file.');
      }
    };
    reader.readAsBinaryString(file as Blob);
  };

  const handleDownloadFolderScenarios = async (folder: TestScenario, format: 'excel' | 'csv' = 'excel', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    try {
      await deductExportCredits(project.id, 'ai_scenarios', user, `Export Folder (${folder.title}) [${format.toUpperCase()}]`, project.name);
    } catch (err) {
      console.warn('Credit check warning:', err);
    }
    
    const memberIds = new Set(folder.memberScenarioIds || []);
    const members = scenarios.filter(s => memberIds.has(s.id) && s.scenarioId !== 'INPUT_SOURCE');
    
    if (members.length === 0) {
      toast.error("No scenarios found in this folder to export.");
      return;
    }

    const data = members.map((s, idx) => {
      const scPassword = s.password || folder.password || password;
      return {
        '#': idx + 1,
        'Scenario ID': s.scenarioId || `SC-${idx + 1}`,
        'Title': s.title,
        'Module': s.moduleName || 'General',
        'Type': s.type || 'Functional',
        'Description': maskPasswordText(s.description, scPassword),
        'Expected Results': maskPasswordText(s.expectedResults, scPassword),
        'Folder': folder.title,
        'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'
      };
    });

    const safeTitle = folder.title.replace(/\s+/g, '_');
    if (format === 'excel') {
      downloadExcel(data, `${safeTitle}_Scenarios`, "Folder Scenarios");
      toast.success(`Exported ${members.length} scenarios from "${folder.title}" to Excel!`);
    } else {
      downloadCsv(data, `${safeTitle}_Scenarios`);
      toast.success(`Exported ${members.length} scenarios from "${folder.title}" to CSV!`);
    }
  };

  const handleDownloadUserStoryScenarios = async (userStoryNum: string, members: TestScenario[], folderTitle: string, format: 'excel' | 'csv' = 'excel', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    try {
      await deductExportCredits(project.id, 'ai_scenarios', user, `Export Scenarios (${userStoryNum}) [${format.toUpperCase()}]`, project.name);
    } catch (err) {
      console.warn('Credit check warning:', err);
    }
    
    const validMembers = members.filter(s => s.scenarioId !== 'INPUT_SOURCE');
    if (validMembers.length === 0) {
      toast.error("No scenarios found for this user story to export.");
      return;
    }

    const data = validMembers.map((s, idx) => {
      const scPassword = s.password || password;
      return {
        '#': idx + 1,
        'Scenario ID': s.scenarioId || `SC-${idx + 1}`,
        'User Story': userStoryNum,
        'Title': s.title,
        'Module': s.moduleName || 'General',
        'Type': s.type || 'Functional',
        'Description': maskPasswordText(s.description, scPassword),
        'Expected Results': maskPasswordText(s.expectedResults, scPassword),
        'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'
      };
    });

    const safeUserStoryNum = userStoryNum.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeFolderTitle = folderTitle.replace(/\s+/g, '_');
    const filename = `${safeUserStoryNum}_${safeFolderTitle}_Scenarios`;

    if (format === 'excel') {
      downloadExcel(data, filename, "User Story Scenarios");
      toast.success(`Exported ${validMembers.length} scenarios for ${userStoryNum} to Excel!`);
    } else {
      downloadCsv(data, filename);
      toast.success(`Exported ${validMembers.length} scenarios for ${userStoryNum} to CSV!`);
    }
  };

  // Download Single Scenario
  const handleDownloadSingleScenario = async (scenario: TestScenario, format: 'excel' | 'csv' = 'excel', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await deductExportCredits(project.id, 'ai_scenarios', user, `Export Scenario (${scenario.scenarioId || scenario.title})`, project.name);
    } catch (err) {
      console.warn('Credit check warning:', err);
    }
    const scPassword = scenario.password || password;
    const row = [{
      'Scenario ID': scenario.scenarioId || scenario.id,
      'Title': scenario.title,
      'Module': scenario.moduleName || 'General',
      'Type': scenario.type || 'Functional',
      'Description': maskPasswordText(scenario.description, scPassword),
      'Expected Results': maskPasswordText(scenario.expectedResults, scPassword),
      'Created At': scenario.createdAt ? new Date(scenario.createdAt).toLocaleString() : 'N/A'
    }];
    const safeId = (scenario.scenarioId || scenario.id || 'Scenario').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (format === 'excel') {
      downloadExcel(row, `${safeId}_Scenario`, 'Scenario Details');
      toast.success(`Scenario ${scenario.scenarioId || ''} downloaded as Excel!`);
    } else {
      downloadCsv(row, `${safeId}_Scenario`);
      toast.success(`Scenario ${scenario.scenarioId || ''} downloaded as CSV!`);
    }
  };

  // Download Selected Scenarios
  const handleDownloadSelectedScenarios = async (format: 'excel' | 'csv' = 'excel') => {
    const checked = scenarios.filter(s => selectedScenarioIds.has(s.id) && !['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER'].includes(s.scenarioId));
    if (checked.length === 0) {
      toast.error('No valid scenarios selected for download.');
      return;
    }
    try {
      await deductExportCredits(project.id, 'ai_scenarios', user, `Export Selected Scenarios (${format.toUpperCase()})`, project.name);
    } catch (err) {
      console.warn('Credit check warning:', err);
    }
    const rows = checked.map((s, idx) => {
      const scPassword = s.password || password;
      return {
        '#': idx + 1,
        'Scenario ID': s.scenarioId || `SC-${idx + 1}`,
        'Title': s.title,
        'Module': s.moduleName || 'General',
        'Type': s.type || 'Functional',
        'Description': maskPasswordText(s.description, scPassword),
        'Expected Results': maskPasswordText(s.expectedResults, scPassword),
        'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'
      };
    });
    if (format === 'excel') {
      downloadExcel(rows, `${project.name.replace(/\s+/g, '_')}_Selected_Scenarios`, 'Selected Scenarios');
      toast.success(`Downloaded ${checked.length} scenarios as Excel!`);
    } else {
      downloadCsv(rows, `${project.name.replace(/\s+/g, '_')}_Selected_Scenarios`);
      toast.success(`Downloaded ${checked.length} scenarios as CSV!`);
    }
  };

  const handleFileProcess = async (file: File) => {
    if (!file) return;

    // 1. Validate file size up to 150 MB (accommodates 120 MB files safely)
    const MAX_ALLOWED_SIZE = 150 * 1024 * 1024;
    if (file.size > MAX_ALLOWED_SIZE) {
      toast.error(`This file exceeds the supported processing limit (150 MB max). Your file is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`);
      return;
    }

    // 2. Validate file extension
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const allowed = ['txt', 'pdf', 'doc', 'docx', 'xlsx', 'xls', 'csv', 'tsv', 'md', 'json', 'log'];
    if (!allowed.includes(ext)) {
      toast.error(`Unsupported file format: .${ext}. Please upload a supported document (.pdf, .docx, .xlsx, .txt, .csv, .md, .json).`);
      return;
    }

    setDocFileName(file.name);
    setUploadedFileSize(file.size);
    setIsUploadingFile(true);
    setJobProgressStage('Uploading file...');
    setCanResumeJob(false);

    try {
      // Stream upload directly to durable server storage
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', project.id);
      formData.append('userId', user.email || user.name);

      const response = await fetch('/api/ai/testcases/upload-file', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload document file.');
      }

      setUploadedFileId(data.fileId);
      setJobProgressStage('File uploaded successfully.');
      toast.success(`File uploaded successfully: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);

      // For smaller text files (< 200KB), extract light snippet for preview
      if (file.size < 200 * 1024 && ['txt', 'md', 'json', 'csv'].includes(ext)) {
        try {
          const text = await file.text();
          setDocContent(text.slice(0, 10000));
        } catch (_) {}
      } else {
        setDocContent(`[Durable file stored on server for AI processing: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)]`);
      }
    } catch (uploadErr: any) {
      console.error('File upload failure:', uploadErr);
      toast.error(uploadErr.message || 'File upload failed. Please try again.');
      setJobProgressStage('');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleFileProcess(file);
    }
  };

  const handleResumeJob = async () => {
    if (!activeJobId) return;
    setIsGenerating(true);
    setCanResumeJob(false);
    setJobProgressStage('Resuming unfinished sections...');

    try {
      const res = await fetch(`/api/ai/testcases/resume-job/${activeJobId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to resume job');
      }

      toast.info('Resumed processing unfinished document sections.');

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/ai/testcases/job-status/${activeJobId}`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (!statusData.success) return;

          if (statusData.stage) setJobProgressStage(statusData.stage);
          if (statusData.totalChunks > 0) {
            setJobProgressPercent(Math.min(95, Math.round(((statusData.completedChunks || 0) / statusData.totalChunks) * 100)));
          }

          if (statusData.status === 'COMPLETED') {
            clearInterval(pollInterval);
            setJobProgressPercent(100);
            setJobProgressStage('Test cases generated successfully.');

            const generatedScenarios: TestScenario[] = (statusData.scenarios || []).map((s: any) => ({
              ...s,
              appUrl: appUrl || "",
              username: username || "",
              password: password || ""
            }));

            setNewlyGeneratedScenarios(generatedScenarios);
            const updated = [...generatedScenarios, ...scenarios];
            onUpdateProject({ ...project, scenarios: updated });
            toast.success(`Generated ${generatedScenarios.length} test scenarios and cases!`);
            setIsGenerating(false);
          } else if (statusData.status === 'FAILED') {
            clearInterval(pollInterval);
            setIsGenerating(false);
            setCanResumeJob(true);
            toast.error(statusData.error || 'Resume failed.');
          }
        } catch (_) {}
      }, 1500);

      setTimeout(() => clearInterval(pollInterval), 15 * 60 * 1000);
    } catch (err: any) {
      setIsGenerating(false);
      setCanResumeJob(true);
      toast.error(err.message || 'Failed to resume generation.');
    }
  };

  const handleRemoveDoc = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDocFileName('');
    setDocContent('');
    setUploadedFileId('');
    setUploadedFileSize(0);
    setActiveJobId('');
    setJobProgressStage('');
    setJobProgressPercent(0);
    setCanResumeJob(false);
    if (docUploadRef.current) docUploadRef.current.value = '';
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedItems(next);
  };

  const handleOpenEdit = (item: TestScenario, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingItem(item);
    setEditForm({ ...item });
    setEditErrors({});
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    const errors: Record<string, string> = {};
    if (!editForm.title?.trim()) errors.title = "Title is required";
    if (!isScenarioFolder(editingItem) && !editForm.moduleName?.trim()) errors.moduleName = "Module name is required";
    
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    const updatedItem = { ...editingItem, ...editForm } as TestScenario;
    const updatedScenarios = scenarios.map(s => s.id === editingItem.id ? updatedItem : s);

    // Immediately close popup and clear edit state
    setEditingItem(null);
    setEditForm({});
    setEditErrors({});

    // Update newlyGeneratedScenarios if present
    setNewlyGeneratedScenarios(prev => prev.map(s => s.id === editingItem.id ? updatedItem : s));

    // Commit changes immediately to project
    onUpdateProject({ ...project, scenarios: updatedScenarios });
    toast.success('Changes committed successfully!');

    // Persist to immediate local backup
    try {
      const backupKey = `automatiqa_project_backup_${project.id}`;
      const localBackupStr = localStorage.getItem(backupKey);
      if (localBackupStr) {
        const localBackup = JSON.parse(localBackupStr);
        if (localBackup.scenarios) {
          localBackup.scenarios = localBackup.scenarios.map((s: any) => s.id === editingItem.id ? updatedItem : s);
          localStorage.setItem(backupKey, JSON.stringify(localBackup));
        }
      }
    } catch (e) {}

    // Non-blocking activity log
    logActivity(user.email, user.name, `Updated artifact: ${editForm.title || updatedItem.title}`, project.id, project.name)
      .catch(err => console.error('Error logging activity:', err));
  };

  const handleOpenManageItems = (folder: TestScenario, e: React.MouseEvent) => {
    e.stopPropagation();
    setManagingFolder(folder);
    const existingMemberIds = new Set(
      scenarios
        .filter(s => ((folder.memberScenarioIds || []).includes(s.id) || s.folderId === folder.id) && !['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER', 'INPUT_SOURCE'].includes(s.scenarioId))
        .map(s => s.id)
    );
    setTempMemberIds(existingMemberIds);
  };

  const handleToggleSelectAllMembers = () => {
    if (tempMemberIds.size === allMangeableScenarios.length) {
      setTempMemberIds(new Set());
    } else {
      setTempMemberIds(new Set(allMangeableScenarios.map(s => s.id)));
    }
  };

  const toggleTempMember = (id: string) => {
    const next = new Set(tempMemberIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setTempMemberIds(next);
  };

  const handleSaveFolderMembers = () => {
    if (!managingFolder) return;
    const memberIds = Array.from(tempMemberIds);
    const memberIdsSet = new Set(memberIds);

    const previousMemberIds = new Set(
      scenarios
        .filter(s => (s.folderId === managingFolder.id || (managingFolder.memberScenarioIds || []).includes(s.id)) && !['SCENARIO_FOLDER', 'TESTCASE_FOLDER', 'MANUAL_FOLDER', 'INPUT_SOURCE'].includes(s.scenarioId))
        .map(s => s.id)
    );
    const removedMemberIds = Array.from(previousMemberIds).filter(id => !memberIdsSet.has(id));

    const updatedScenarios = scenarios.map(s => {
        if (s.scenarioId === 'SCENARIO_FOLDER') {
            if (s.id === managingFolder.id) {
              return { ...s, memberScenarioIds: memberIds };
            } else {
              return {
                ...s,
                memberScenarioIds: (s.memberScenarioIds || []).filter(id => !memberIdsSet.has(id))
              };
            }
        }
        if (memberIdsSet.has(s.id)) {
            return {
                ...s,
                folderId: managingFolder.id,
                isRemovedFromIndividual: false
            };
        }
        if (removedMemberIds.includes(s.id)) {
            return {
                ...s,
                folderId: "",
                isRemovedFromIndividual: false
            };
        }
        return s;
    });
    onUpdateProject({ ...project, scenarios: updatedScenarios });
    logActivity(user.email, user.name, `Updated members for folder: ${managingFolder.title}`, project.id, project.name);
    setManagingFolder(null);
    toast.success('Folder scenarios updated successfully');
  };

  const handleCreateFolder = () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      setFolderError('Please enter the Folder name');
      return;
    }

    const isDuplicate = scenarios.some(s => 
      isScenarioFolder(s) && 
      s.title.toLowerCase() === trimmedName.toLowerCase()
    );

    if (isDuplicate) {
      setFolderError('This folder name is already in use. Please enter a different name to continue');
      return;
    }

    const folder: TestScenario = {
        id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        scenarioId: 'SCENARIO_FOLDER',
        title: trimmedName,
        type: 'Functional',
        description: 'Organization folder',
        expectedResults: 'N/A',
        moduleName: 'AI SCENARIOS',
        isApproved: true,
        isFolder: true,
        folderType: 'scenario',
        testCases: [],
        createdAt: new Date().toISOString(),
        memberScenarioIds: []
    };
    const apiScenarios = (project.scenarios || []).filter(s => isApiTestingScenario(s));
    onUpdateProject({ ...project, scenarios: [folder, ...scenarios, ...apiScenarios] });
    logActivity(user.email, user.name, `Created AI Folder: ${trimmedName}`, project.id, project.name);
    setNewFolderName('');
    setFolderError(null);
    setIsCreatingFolder(false);
  };

  const handleSaveScenariosToFolder = async () => {
    try {
      let finalFolderId = selectedFolderIdForSave;
      // Filter out artifacts like INPUT_SOURCE so only real scenarios are stored
      const targetScenarios = newlyGeneratedScenarios.filter(s => s.scenarioId !== 'INPUT_SOURCE');
      const targetIds = targetScenarios.map(s => s.id);
      const targetIdSet = new Set(targetIds);

      // Start with all existing scenarios, but ensure all targetScenarios are preserved
      let updatedScenariosList = [...scenarios];
      const existingIdSet = new Set(updatedScenariosList.map(s => s.id));
      const missingScenarios = targetScenarios.filter(s => !existingIdSet.has(s.id));
      if (missingScenarios.length > 0) {
        updatedScenariosList = [...missingScenarios, ...updatedScenariosList];
      }

      let targetFolderName = '';

      if (showCreateFolderInline) {
        const trimmedInlineName = inlineNewFolderName.trim();
        if (!trimmedInlineName) {
          setInlineFolderError('Please enter a folder name');
          return;
        }

        const isDuplicate = scenarios.some(s => 
          isScenarioFolder(s) && 
          s.title.toLowerCase() === trimmedInlineName.toLowerCase()
        );

        if (isDuplicate) {
          setInlineFolderError('This folder name is already in use.');
          return;
        }

        const newFolderId = generateUniqueFolderId('folder');
        targetFolderName = trimmedInlineName;

        const newFolder: TestScenario = {
          id: newFolderId,
          scenarioId: 'SCENARIO_FOLDER',
          title: trimmedInlineName,
          type: 'Functional',
          description: 'Organization folder',
          expectedResults: 'Execution succeeds',
          moduleName: 'AI SCENARIOS',
          isApproved: true,
          isFolder: true,
          folderType: 'scenario',
          testCases: [],
          createdAt: new Date().toISOString(),
          memberScenarioIds: targetIds
        };

        // Remove target scenarios from all other folders
        updatedScenariosList = updatedScenariosList.map(s => {
          if (isScenarioFolder(s)) {
            return {
              ...s,
              memberScenarioIds: (s.memberScenarioIds || []).filter(id => !targetIdSet.has(id))
            };
          }
          return s;
        });

        updatedScenariosList = [newFolder, ...updatedScenariosList];
        finalFolderId = newFolderId;
      } else {
        if (!finalFolderId) {
          toast.error('Please select a folder or create a new one');
          return;
        }

        const existingFolder = scenarios.find(s => s.id === finalFolderId);
        targetFolderName = existingFolder?.title || '';

        // Add the scenario IDs to the selected folder's memberScenarioIds and remove from other folders
        updatedScenariosList = updatedScenariosList.map(s => {
          if (isScenarioFolder(s)) {
            if (s.id === finalFolderId) {
              const currentMembers = (s.memberScenarioIds || []).filter(id => !targetIdSet.has(id));
              return {
                ...s,
                isFolder: true,
                folderType: 'scenario',
                scenarioId: 'SCENARIO_FOLDER',
                moduleName: 'AI SCENARIOS',
                memberScenarioIds: Array.from(new Set([...currentMembers, ...targetIds]))
              };
            } else {
              return {
                ...s,
                memberScenarioIds: (s.memberScenarioIds || []).filter(id => !targetIdSet.has(id))
              };
            }
          }
          return s;
        });
      }

      // Mark the target scenarios as saved with their folderId and folderName
      updatedScenariosList = updatedScenariosList.map(s => {
        if (targetIdSet.has(s.id)) {
          return {
            ...s,
            saved: true,
            folderId: finalFolderId,
            folderName: targetFolderName || s.folderName,
            isRemovedFromIndividual: false
          };
        }
        return s;
      });

      // Update the project
      onUpdateProject({ ...project, scenarios: updatedScenariosList });

      // Update the newlyGeneratedScenarios state to reflect saved status
      setNewlyGeneratedScenarios(prev => prev.map(s => targetIdSet.has(s.id) ? ({
        ...s,
        saved: true,
        folderId: finalFolderId,
        folderName: targetFolderName || s.folderName,
        isRemovedFromIndividual: false
      }) : s));

      // Close all modals immediately
      setIsFolderSelectModalOpen(false);
      setInlineNewFolderName('');
      setInlineFolderError(null);
      setSelectedFolderIdForSave('');
      setShowCreateFolderInline(false);

      toast.success(`Successfully saved ${targetIds.length} scenario${targetIds.length === 1 ? '' : 's'} to folder!`);

      logActivity(user.email, user.name, `Saved ${targetIds.length} scenarios into folder`, project.id, project.name).catch(err => console.error('Error logging activity:', err));
    } catch (error) {
      toast.error('Failed to save scenarios. Please try again.');
    }
  };

  const isGenerateDisabled = useMemo(() => {
    return isGenerating;
  }, [isGenerating]);

  return (
    <div className="pb-20 animate-in fade-in duration-500">
      
      {/* AI Scenario Generation Card */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm mb-12 overflow-hidden relative">
        <div className="p-10">
          <div className="flex justify-between items-center mb-10">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-black uppercase tracking-tight">AI Scenarios</h2>
              <RAGStatusBadge
                enabled={ragEnabled}
                onToggle={setRagEnabled}
                retrievedChunks={retrievedRagChunks}
              />
            </div>
          </div>

          {/* Global Login Context Section */}
          <div className="bg-slate-50/50 border border-slate-100 rounded-[2.5rem] p-8 mb-10 relative">
            {/* Hidden dummy fields to capture browser autofill heuristics and prevent Chrome auto-populating saved passwords */}
            <input type="text" name="fake_username_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" autoComplete="off" defaultValue="" />
            <input type="password" name="fake_password_prevent_autofill" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" autoComplete="new-password" defaultValue="" />

            <div className="flex items-center gap-2 mb-6 ml-1">
              <Link size={14} className="text-indigo-400" />
              <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.15em]">Global Login Context (Applied to every generated scenario)</h3>
            </div>
            <div className="grid grid-cols-1 gap-6">
              <div className="relative group">
                <Globe className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18} />
                <input 
                  value={appUrl || ''} 
                  onChange={e => setAppUrl(e.target.value)} 
                  placeholder="Application URL (e.g. https://app.qi)" 
                  className="w-full pl-12 pr-6 py-4 bg-white border border-slate-200 rounded-[1.2rem] text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all shadow-inner" 
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-10 items-center justify-between">
            <div className="flex gap-4">
              {[
                { id: 'text', label: 'Feature Description', icon: <FileText size={16} /> },
                { id: 'url', label: 'Website URL', icon: <Globe size={16} /> },
                { id: 'doc', label: 'Requirements Doc', icon: <FileSearch size={16} /> }
              ].map(tab => (
                <button 
                  key={tab.id} 
                  onClick={() => setActiveTab(tab.id as any)} 
                  className={`flex items-center gap-3 px-8 py-3.5 rounded-[1.2rem] text-[14px] font-black uppercase tracking-widest transition-all border ${activeTab === tab.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-100' : 'bg-white text-slate-400 border-slate-100 hover:bg-slate-50'}`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button 
                type="button"
                onClick={() => setIsJiraModalOpen(true)}
                className="flex items-center gap-3 px-8 py-3.5 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-[1.2rem] text-[14px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-md cursor-pointer"
              >
                <Sparkles size={16} className="text-yellow-500 animate-pulse" /> Import From Jira
              </button>
              <button 
                type="button"
                onClick={() => setIsImportStoriesModalOpen(true)}
                className="flex items-center gap-3 px-8 py-3.5 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-[1.2rem] text-[14px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all shadow-md cursor-pointer"
              >
                <Folder size={16} className="text-emerald-500" /> Import From AI User Stories
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-2 ml-1">
                <h3 className="text-[14px] font-black text-black uppercase tracking-widest">Primary Input Source</h3>
                <Info size={14} className="text-slate-300" />
              </div>
              
              <div className="bg-slate-50/30 border border-slate-100 rounded-[2.5rem] p-1.5 overflow-hidden group">
                {activeTab === 'doc' && !docFileName ? (
                  <div 
                    onClick={() => !isUploadingFile && docUploadRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const droppedFile = e.dataTransfer.files?.[0];
                      if (droppedFile) await handleFileProcess(droppedFile);
                    }}
                    className={`h-80 border-2 border-dashed ${isDragOver ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 bg-white hover:bg-white hover:border-indigo-400'} rounded-[2.5rem] flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group`}
                  >
                    <input 
                      type="file" 
                      ref={docUploadRef} 
                      className="hidden" 
                      accept=".txt,.pdf,.doc,.docx,.xlsx,.xls,.csv,.tsv,.md,.json,.log" 
                      onChange={handleFileChange} 
                    />
                    <div className="p-6 bg-slate-50 rounded-full text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-400 transition-all">
                      {isUploadingFile ? <Loader2 size={40} className="animate-spin text-indigo-600" /> : <Upload size={40} />}
                    </div>
                    <div className="text-center px-4">
                      <p className="text-sm font-black text-slate-700 uppercase tracking-widest">
                        {isUploadingFile ? 'Streaming upload to server...' : 'Attach Requirements File (Drag & Drop or Click)'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 font-medium">
                        Supports large files up to 150 MB (.pdf, .docx, .xlsx, .txt, .csv, .md, .json)
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 flex flex-col space-y-6">
                    {activeTab === 'url' && (
                      <div className="relative group animate-in slide-in-from-top-2">
                        <Globe className="absolute left-5 top-1/2 -translate-y-1/2 text-indigo-500" size={18} />
                        <input 
                          value={analysisUrl || ''} 
                          onChange={e => setAnalysisUrl(e.target.value)} 
                          placeholder="Enter target Website URL for analysis (e.g. https://example.com/flow)" 
                          className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/10 transition-all"
                        />
                      </div>
                    )}

                    {activeTab === 'doc' && docFileName && (
                      <div className="flex items-center justify-between p-4 bg-indigo-50/80 rounded-2xl border border-indigo-100 animate-in slide-in-from-top-2">
                         <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-sm shrink-0">
                               <FileText size={20} />
                            </div>
                            <div className="truncate">
                              <span className="text-xs font-black text-indigo-950 uppercase truncate block">{docFileName}</span>
                              <span className="text-[11px] font-semibold text-indigo-600">
                                {uploadedFileSize > 0 ? `${(uploadedFileSize / (1024 * 1024)).toFixed(1)} MB` : ''} • Durable server storage verified
                              </span>
                            </div>
                         </div>
                         <button 
                           onClick={handleRemoveDoc} 
                           title="Remove file"
                           className="p-2 bg-white text-rose-500 hover:bg-rose-50 rounded-xl transition-all shadow-sm border border-slate-200 shrink-0 ml-3"
                         >
                            <X size={16}/>
                         </button>
                      </div>
                    )}

                    <textarea 
                      value={description || ''} 
                      onChange={e => {
                        setDescription(e.target.value);
                        if (!e.target.value.trim()) {
                          setImportedStories([]);
                        }
                      }} 
                      placeholder="Please provide detailed user story to generate scenarios"
                      className="w-full h-56 text-sm font-medium leading-relaxed outline-none resize-none placeholder:text-slate-300 italic text-slate-600"
                    />
                    
                    <div className="mt-4 pt-6 border-t border-slate-50 flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      <p className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.1em]">
                        Optional: Attach UI screenshots below for multi-modal analysis (PNG, JPG, WEBP, GIF, SVG)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Multi-Screenshot Input Uploader */}
              <ScreenshotUploader
                screenshots={screenshots}
                onChange={setScreenshots}
                title="Input Screenshots (Optional / Standalone)"
                description="Upload multiple screenshots. AI will analyze UI layouts, buttons, forms, and workflows to generate scenarios even if text is empty."
                className="mt-2"
              />
            </div>

            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[14px] font-black text-black uppercase tracking-widest ml-1 flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-600" />
                  Refine Instructions <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                </h3>
                <span className="text-[11px] font-bold text-slate-400">
                  {(aiInstructions || '').length}/1000
                </span>
              </div>
              <div className="flex-1 bg-white border border-slate-200 rounded-[2.5rem] p-10 shadow-sm relative overflow-hidden">
                <textarea 
                  value={aiInstructions || ''}
                  onChange={e => setAiInstructions(e.target.value)}
                  placeholder="Generate test scenarios using only the inputs provided. Identify actors, business rules, validation logic, and exceptions. Output Functional, Non-Functional, Edge Cases, and Negative scenarios."
                  className="w-full h-full text-xs font-medium text-slate-700 leading-relaxed outline-none resize-none placeholder:text-slate-400 placeholder:italic"
                />
              </div>
            </div>
          </div>

          {/* Real-time Large File Pipeline Progress */}
          {(isGenerating || canResumeJob || isUploadingFile) && (
            <div className="mt-8 p-6 bg-indigo-50/60 border border-indigo-100 rounded-3xl animate-in fade-in slide-in-from-bottom-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  {isGenerating || isUploadingFile ? (
                    <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-sm animate-pulse">
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                  ) : (
                    <div className="p-2 bg-amber-500 text-white rounded-xl shadow-sm">
                      <AlertTriangle size={16} />
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      {isUploadingFile ? 'Streaming Large File Upload' : isGenerating ? 'AI Scenarios Generation Pipeline' : 'Generation Halted'}
                    </h4>
                    <p className="text-xs font-bold text-indigo-700 mt-0.5">
                      {jobProgressStage || (isGenerating ? 'Processing document sections...' : 'Attention needed')}
                    </p>
                  </div>
                </div>
                {canResumeJob && (
                  <button
                    onClick={handleResumeJob}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-xs font-black uppercase tracking-wider shadow-md transition-all active:scale-95 flex items-center gap-2"
                  >
                    <Sparkles size={14} /> Resume Generation
                  </button>
                )}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-indigo-100/80 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(5, jobProgressPercent)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold text-indigo-500 mt-2 px-1">
                <span>{uploadedFileSize > 0 ? `File Size: ${(uploadedFileSize / (1024 * 1024)).toFixed(1)} MB` : 'Durable Chunked Pipeline'}</span>
                <span>{jobProgressPercent}%</span>
              </div>
            </div>
          )}

          {/* Credit Limit Exceeded Warning Banner */}
          {(getProjectCreditSummary(project.id, project.name).remainingCredits <= 0 || getProjectCreditSummary(project.id, project.name).isGated) && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between gap-4 text-amber-900 shadow-sm animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">
                    Credit Limit Exceeded
                  </h4>
                  <p className="text-xs text-amber-800 font-medium mt-0.5">
                    Credit limit reached for project "{project.name}" (0 remaining credits). Generation of AI Scenarios is unavailable until credits are renewed or upgraded.
                  </p>
                </div>
              </div>
              <span className="shrink-0 px-3 py-1 bg-amber-200/80 text-amber-900 rounded-full text-[10px] font-black uppercase tracking-wider">
                0 Credits
              </span>
            </div>
          )}

          <div className="flex justify-end mt-8">
            <button 
              disabled={isGenerating || isUploadingFile || getProjectCreditSummary(project.id, project.name).remainingCredits <= 0 || getProjectCreditSummary(project.id, project.name).isGated}
              onClick={handleGenerate}
              className="bg-indigo-600 text-white px-16 py-5 rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-2xl hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {isGenerating ? 'Generating AI Scenarios...' : 'Generate AI Scenarios'}
            </button>
          </div>
        </div>
      </div>

      {/* Newly Generated Scenarios Preview Section */}
      {newlyGeneratedScenarios.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-[2.5rem] p-10 mb-12 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 border-b border-slate-200/60 pb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                  <Sparkles size={11} className="text-indigo-600" /> Latest Generation Result
                </span>
                {newlyGeneratedScenarios[0].saved ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-200 shadow-sm animate-pulse">
                    Saved to Folder
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-200">
                    Unsaved
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Newly Generated Scenarios</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                Review the latest generated scenarios below. You can save them into an organization folder now.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {!newlyGeneratedScenarios[0].saved ? (
                <button
                  onClick={() => setIsFolderSelectModalOpen(true)}
                  className="flex items-center gap-2.5 bg-indigo-600 text-white px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg active:scale-95"
                >
                  <Save size={15} /> Save to Folder
                </button>
              ) : (
                <div className="flex items-center gap-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-6 py-3.5 rounded-full font-black text-xs uppercase tracking-widest">
                  <Check size={16} strokeWidth={3} /> Saved Successfully
                </div>
              )}
              <button
                onClick={() => setNewlyGeneratedScenarios([])}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-800 px-5 py-4 rounded-full font-black text-xs uppercase tracking-widest transition-all"
              >
                Clear Preview
              </button>
            </div>
          </div>

          <div className="space-y-12">
            {(() => {
              const groups: { [key: string]: typeof newlyGeneratedScenarios } = {};
              newlyGeneratedScenarios.forEach(s => {
                const key = s.userStoryNumber || 'No User Story';
                if (!groups[key]) groups[key] = [];
                groups[key].push(s);
              });

              const sortedGroupEntries = Object.entries(groups).sort(([keyA], [keyB]) => {
                if (keyA === 'No User Story') return 1;
                if (keyB === 'No User Story') return -1;
                return keyA.localeCompare(keyB);
              });

              return sortedGroupEntries.map(([userStoryNum, items]) => {
                const hasUS = userStoryNum !== 'No User Story';
                const usSummary = items.find(item => item.userStorySummary)?.userStorySummary || items[0]?.userStorySummary;

                return (
                  <div key={userStoryNum} className="space-y-6">
                    {hasUS && (
                      <div className="bg-indigo-50/45 border border-indigo-100/60 rounded-[2rem] p-6 text-left shadow-sm space-y-3 animate-in fade-in duration-200">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">User Story ID / Number</span>
                          <div className="flex items-center gap-2.5">

                             <span className="inline-block text-xs font-mono font-black text-indigo-600 bg-white border border-indigo-100 px-3 py-1 rounded-xl shadow-sm w-fit leading-none">

                                {userStoryNum}

                             </span>

                             <button 
                                onClick={(e) => handleDownloadUserStoryScenarios(userStoryNum, items, 'Newly_Generated', 'excel', e)}
                                className="flex items-center gap-1 bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                                title={`Download scenarios for ${userStoryNum} (Excel)`}
                             >
                                <FileSpreadsheet size={11} className="text-emerald-600" /> Excel
                             </button>
                             <button 
                                onClick={(e) => handleDownloadUserStoryScenarios(userStoryNum, items, 'Newly_Generated', 'csv', e)}
                                className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                                title={`Download scenarios for ${userStoryNum} (CSV)`}
                             >
                                <Download size={11} className="text-slate-600" /> CSV
                             </button>

                          </div>
                        </div>
                        {usSummary && (
                          <div className="flex flex-col pt-3 border-t border-indigo-100/30">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">User Story Summary</span>
                            <p className="text-sm font-bold text-slate-700 leading-normal">
                              {usSummary}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {items.map((ns, index) => {
                        const isInput = ns.scenarioId === 'INPUT_SOURCE';
                        return (
                          <div key={ns.id || index} className={`border rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:border-indigo-400 transition-all group ${isInput ? 'bg-amber-50/20 border-amber-200/60 hover:border-amber-400' : 'bg-white border-slate-200/80'}`}>
                            <div className="space-y-4">
                              <div className="flex items-start justify-between gap-3">
                                {isInput ? (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-[9px] font-black uppercase tracking-wider">
                                    <Sparkles size={11} className="text-amber-600 animate-pulse" /> ORIGINAL INPUT
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-black text-indigo-600 font-mono tracking-wider bg-indigo-50 px-2 py-0.5 rounded">
                                    {ns.scenarioId}
                                  </span>
                                )}
                                <div className="flex items-center gap-1.5">
                                  {!isInput && ns.scenarioCategory && (
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                      ns.scenarioCategory === 'Positive' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                      ns.scenarioCategory === 'Negative' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                      'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}>
                                      {ns.scenarioCategory}
                                    </span>
                                  )}
                                  {ns.priority && (
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                      ns.priority === 'High' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                      ns.priority === 'Medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                      'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                    }`}>
                                      {ns.priority}
                                    </span>
                                  )}
                                  <span className="bg-slate-50 text-slate-500 border border-slate-100 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">
                                    {isInput ? 'INPUT' : ns.type}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <h4 className={`font-black text-sm uppercase tracking-tight transition-colors line-clamp-2 ${isInput ? 'text-amber-900 group-hover:text-amber-700' : 'text-slate-800 group-hover:text-indigo-600'}`}>
                                  {ns.title}
                                </h4>
                                {isInput ? (
                                  <div className="mt-2 text-xs text-amber-950 font-mono bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200/80 whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar leading-relaxed shadow-inner">
                                    {maskPasswordText(ns.description, ns.password || password)}
                                  </div>
                                ) : (
                                  <p className="text-xs text-slate-500 mt-2 leading-relaxed font-medium line-clamp-3">
                                    {maskPasswordText(ns.description, ns.password || password)}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                              <div>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Expected Results</span>
                                <p className="text-xs font-semibold text-slate-700 leading-normal line-clamp-2">
                                  {maskPasswordText(ns.expectedResults, ns.password || password)}
                                </p>
                              </div>

                              {ns.tags && ns.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {ns.tags.map(t => (
                                    <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {isInput && ns.attachments && ns.attachments.length > 0 && (
                                <ScreenshotGallery images={ns.attachments} title="Attached Screenshots" compact />
                              )}

                              {!isInput && (
                                <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2 flex-wrap">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider ${
                                      ns.isApproved 
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}>
                                      {ns.isApproved ? 'Approved' : 'Unapproved'}
                                    </span>
                                    {ns.folderName && (
                                      <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 flex items-center gap-1">
                                        <Folder size={10} /> {ns.folderName}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                        setScenariosToMoveWithoutApprove([ns]);
                                        setSelectedFolderIdForSave(ns.folderId || '');
                                        setShowCreateFolderInline(false);
                                        setInlineNewFolderName('');
                                        setInlineFolderError(null);
                                        setSearchFolderQuery('');
                                      }}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all shadow-xs active:scale-95 border bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 border-indigo-200/80 cursor-pointer"
                                      title="Save scenario to folder"
                                    >
                                      <FolderPlus size={13} /> Save to Folder
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => handleApproveScenario(ns.id, e)}
                                      disabled={ns.isApproved}
                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all shadow-xs active:scale-95 border ${
                                        ns.isApproved
                                          ? 'bg-emerald-600 text-white border-emerald-700 cursor-default'
                                          : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 cursor-pointer'
                                      }`}
                                      title={ns.isApproved ? "Approved" : "Approve scenario"}
                                    >
                                      <Check size={13} strokeWidth={3} /> {ns.isApproved ? 'Approved' : 'Approve'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Source Input Details & Document Section under Generated Scenarios */}
          {lastInputDetails && (
            <div className="mt-10 bg-amber-50/50 border border-amber-200/80 rounded-[2.5rem] p-8 shadow-sm animate-in fade-in slide-in-from-bottom-2">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-6 border-b border-amber-200/60">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-sm">
                    <FileText size={22} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-amber-950 uppercase tracking-wide flex items-center gap-2">
                      Source Input Details & Requirements Document
                      <span className="px-2.5 py-0.5 text-[9px] font-black bg-amber-200 text-amber-900 rounded-md uppercase tracking-wider">
                        {lastInputDetails.activeTab === 'doc' ? `Requirements Doc (${lastInputDetails.docFileName || 'Attached File'})` :
                         lastInputDetails.activeTab === 'url' ? 'Website URL Analysis' : 'Feature Description'}
                      </span>
                    </h4>
                    <p className="text-xs font-medium text-amber-800/80 mt-0.5">
                      Original requirements document & context used for synthesizing scenarios (Generated at {lastInputDetails.timestamp})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(lastInputDetails.docContent || lastInputDetails.description || lastInputDetails.analysisUrl) && (
                    <button
                      type="button"
                      onClick={() => {
                        const contentToCopy = lastInputDetails.docContent || lastInputDetails.description || lastInputDetails.analysisUrl || '';
                        navigator.clipboard.writeText(contentToCopy);
                        toast.success("Source document copied to clipboard!");
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                    >
                      <Copy size={13} /> Copy Document Text
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                {lastInputDetails.docFileName && (
                  <div className="inline-flex items-center gap-2 text-xs font-black text-indigo-950 bg-white px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">
                    <Paperclip size={14} className="text-indigo-600" /> Document File: <span className="font-mono text-indigo-700">{lastInputDetails.docFileName}</span>
                  </div>
                )}

                {(lastInputDetails.docContent || lastInputDetails.description || lastInputDetails.analysisUrl) && (
                  <div>
                    <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest block mb-2 flex items-center gap-1.5">
                      <FileText size={12} className="text-amber-700" />
                      Document Content / Input Context
                    </span>
                    <div className="bg-white rounded-2xl border border-amber-200/80 p-5 max-h-72 overflow-y-auto font-sans text-xs text-slate-800 whitespace-pre-wrap leading-relaxed shadow-inner">
                      {sanitizeAndExtractDocContent(lastInputDetails.docContent || lastInputDetails.description || lastInputDetails.analysisUrl || '', lastInputDetails.docFileName || '')}
                    </div>
                  </div>
                )}

                {lastInputDetails.screenshots && lastInputDetails.screenshots.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest block mb-2">
                      Attached Visual Screenshots ({lastInputDetails.screenshots.length})
                    </span>
                    <ScreenshotGallery
                      images={lastInputDetails.screenshots.map(s => s.previewUrl || (s.data?.startsWith('data:') || s.data?.startsWith('http') ? s.data : `data:${s.mimeType || 'image/png'};base64,${s.data}`))}
                      title="Attached Screenshots"
                      compact
                    />
                  </div>
                )}

                {lastInputDetails.aiInstructions && (
                  <div className="pt-2">
                    <span className="text-[10px] font-black text-amber-900 uppercase tracking-widest block mb-1">
                      Refining System Constraints
                    </span>
                    <p className="text-xs font-medium text-amber-900/80 italic bg-amber-100/50 p-3 rounded-xl border border-amber-200/50">
                      "{lastInputDetails.aiInstructions}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Redesigned Scenario Repository Section */}
      <div id="scenario-repository-section" className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-center gap-10 mb-12">
          <div>
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Scenario Repository</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-3">Organize and manage generated test suites</p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
             <div className="relative group w-72 sm:w-80">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                <input 
                  type="text" 
                  placeholder="Search scenarios, IDs, or folders..." 
                  value={searchQuery || ''}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteSearch();
                    }
                  }}
                  className="w-full pl-12 pr-10 py-4 bg-slate-50 border border-slate-200 rounded-[1.2rem] text-sm font-bold focus:bg-white focus:ring-4 ring-indigo-50/10 outline-none transition-all shadow-inner"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      toast.info('Search cleared');
                    }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
                    title="Clear search"
                  >
                    <X size={16} />
                  </button>
                )}
             </div>

             <button 
                type="button"
                onClick={() => handleExecuteSearch()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
                title="Execute Search"
             >
                <Search size={16} /> SEARCH
             </button>
             
             <button onClick={() => setIsCreatingFolder(true)} className="flex items-center gap-2 bg-[#F0F4FF] text-[#4F46E5] px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-indigo-50 hover:bg-indigo-100 transition-all shadow-sm">
                <FolderPlus size={18} /> ADD FOLDER
             </button>
             
             <button onClick={() => handleDownloadTemplate('excel')} className="flex items-center gap-2 bg-white text-slate-600 px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all shadow-sm cursor-pointer" title="Download Excel Template">
                <FileSpreadsheet size={16} /> TEMPLATE
             </button>

             <button onClick={() => handleDownloadRepository('excel')} className="flex items-center gap-2 bg-[#ECFDF5] text-[#059669] px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-emerald-100 hover:bg-emerald-100 transition-all shadow-sm cursor-pointer" title="Export All Scenarios to Excel">
                <FileSpreadsheet size={16} /> EXPORT EXCEL
             </button>

             <button onClick={() => handleDownloadRepository('csv')} className="flex items-center gap-2 bg-slate-50 text-slate-700 px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-100 transition-all shadow-sm cursor-pointer" title="Export All Scenarios to CSV">
                <Download size={16} /> EXPORT CSV
             </button>

             <button onClick={() => uploadInputRef.current?.click()} className="flex items-center gap-2 bg-white text-slate-600 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
                <Upload size={18} /> UPLOAD
                <input type="file" ref={uploadInputRef} className="hidden" accept=".xlsx,.csv" onChange={handleUploadScenarios} />
             </button>
          </div>
        </div>

        {/* Total Scenarios = Approved + Unapproved Summary Widget Banner */}
        <div className="mb-8 p-6 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-emerald-50/30 border border-slate-200/90 rounded-[2rem] flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-md flex items-center justify-center shrink-0">
              <Layers size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                  Total Scenarios Breakdown
                </h3>
                <span className="px-3 py-1 bg-indigo-600 text-white rounded-xl text-xs font-black font-mono shadow-xs">
                  {totalScenariosCount} Total
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500 mt-1">
                Total Scenarios count equals the sum of all Approved and Unapproved scenarios.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap bg-white/95 backdrop-blur-xs px-5 py-3 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider">Total Scenarios ({totalScenariosCount})</span>
              <span className="text-slate-400 font-black text-sm">=</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-black shadow-2xs">
              <CheckCircle2 size={14} className="text-emerald-600" /> {totalApprovedScenariosCount} Approved
            </span>
            <span className="text-slate-400 font-black text-sm">+</span>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-xs font-black shadow-2xs">
              <AlertTriangle size={14} className="text-amber-600" /> {totalUnapprovedScenariosCount} Unapproved
            </span>
          </div>
        </div>

        {/* Custom Tabs */}
        <div className="flex gap-10 border-b border-slate-100 mb-8 px-4">
          <button onClick={() => setActiveView('scenarios')} className={`pb-5 flex items-center gap-3 text-[14px] font-black uppercase tracking-widest relative transition-all ${activeView === 'scenarios' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
             <div className="flex items-center gap-2">
                <LayoutGrid size={16} />
                INDIVIDUAL SCENARIOS
             </div>
             <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black ${searchQuery.trim() ? (activeView === 'scenarios' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700') : 'bg-slate-100 text-slate-500'}`}>
               {searchQuery.trim() ? `${matchingScenariosCount} matching` : individualCount}
             </span>
             {activeView === 'scenarios' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full shadow-lg" />}
          </button>
          <button onClick={() => setActiveView('folders')} className={`pb-5 flex items-center gap-3 text-[14px] font-black uppercase tracking-widest relative transition-all ${activeView === 'folders' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
             <div className="flex items-center gap-2">
                <Folder size={16} />
                FOLDERS
             </div>
             <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black ${searchQuery.trim() ? (activeView === 'folders' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700') : 'bg-slate-100 text-slate-500'}`}>
               {searchQuery.trim() ? `${matchingFoldersCount} matching` : folderCount}
             </span>
             {activeView === 'folders' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full shadow-lg" />}
          </button>
        </div>

        <div className="mb-8 p-6 bg-[#F8FAFF] border border-[#E5EFFF] rounded-[1.5rem] flex items-start gap-4">
           <div className="p-2 bg-[#4F46E5] text-white rounded-lg shadow-md">
              <Info size={18} />
           </div>
           <div>
              <p className="text-sm font-bold text-[#1E293B]">Approved Scenarios will move to <span className="text-[#4F46E5]">AI Test Cases</span> page.</p>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">BEFORE THAT, USER CAN SAVE SCENARIOS IN FOLDERS IF REQUIRED.</p>
           </div>
        </div>

        {paginatedItems.length > 0 && activeView === 'scenarios' && (
          <div className="px-6 mb-6 flex items-center justify-between flex-wrap gap-4">
             <button 
                onClick={handleToggleAllVisible}
                className="flex items-center gap-3 text-[14px] font-black text-slate-400 uppercase tracking-[0.2em] transition-all hover:text-slate-600"
             >
                <div className={isAllVisibleSelected ? 'text-indigo-600' : 'text-slate-300'}>
                    {isAllVisibleSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                </div>
                SELECT ALL ON PAGE
             </button>
             
             {selectedScenarioIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 animate-in slide-in-from-right-4">
                   <button 
                     onClick={() => handleDownloadSelectedScenarios('excel')} 
                     className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer"
                     title="Export selected scenarios to Excel"
                   >
                      <FileSpreadsheet size={13} /> EXCEL ({selectedScenarioIds.size})
                   </button>
                   <button 
                     onClick={() => handleDownloadSelectedScenarios('csv')} 
                     className="flex items-center gap-1.5 bg-slate-800 text-white px-4 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md hover:bg-slate-900 active:scale-95 transition-all cursor-pointer"
                     title="Export selected scenarios to CSV"
                   >
                      <Download size={13} /> CSV ({selectedScenarioIds.size})
                   </button>
                   <button 
                     onClick={handleBulkApprove} 
                     className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-emerald-700 active:scale-95 transition-all"
                     title="Move to folder and approve all selected scenarios"
                   >
                      <CheckCircle2 size={14} /> BULK APPROVE SELECTED ({selectedScenarioIds.size})
                   </button>
                   <button 
                     onClick={handleBulkMoveToFolder} 
                     className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
                     title="Save selected scenarios to a folder"
                   >
                      <FolderPlus size={14} /> SAVE TO FOLDER ({selectedScenarioIds.size})
                   </button>
                   <button 
                     onClick={() => setShowBulkDeleteConfirm(true)} 
                     className="flex items-center gap-2 bg-rose-600 text-white px-5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg hover:bg-rose-700 active:scale-95 transition-all"
                   >
                      <Trash2 size={14} /> BULK DELETE ({selectedScenarioIds.size})
                   </button>
                </div>
             )}
          </div>
        )}

        <div className="space-y-4 mb-8">
          {paginatedItems.length === 0 ? (
            searchQuery.trim() ? (
              <div className="py-20 px-8 text-center bg-white border-2 border-dashed border-slate-200 rounded-[3rem] space-y-4 shadow-xs">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
                  <Search size={28} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                    No matching {activeView === 'scenarios' ? 'scenarios' : 'folders'} found
                  </h3>
                  <p className="text-xs font-medium text-slate-500 max-w-md mx-auto mt-1">
                    No items in {activeView === 'scenarios' ? 'Individual Scenarios' : 'Folders'} matched &ldquo;{searchQuery}&rdquo;.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                  {activeView === 'scenarios' && matchingFoldersCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveView('folders')}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95"
                    >
                      <Folder size={14} /> Switch to Folders ({matchingFoldersCount} matching)
                    </button>
                  )}
                  {activeView === 'folders' && matchingScenariosCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveView('scenarios')}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer transition-all active:scale-95"
                    >
                      <LayoutGrid size={14} /> Switch to Individual Scenarios ({matchingScenariosCount} matching)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      toast.info('Search cleared');
                    }}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <X size={14} /> Clear Search
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-32 text-center bg-white border-2 border-dashed border-slate-200 rounded-[3rem] opacity-30">
                 <Layers size={64} className="mx-auto mb-6 text-slate-200" />
                 <p className="text-sm font-black uppercase tracking-widest text-slate-500">Repository Empty</p>
              </div>
            )
          ) : activeView === 'scenarios' ? (() => {
             // Group individual scenarios by userStoryNumber for the scenarios view
             const groups: { [key: string]: typeof paginatedItems } = {};
             paginatedItems.forEach(s => {
                const key = s.userStoryNumber || 'No User Story';
                if (!groups[key]) groups[key] = [];
                groups[key].push(s);
             });

             // Sort keys so that 'No User Story' comes last if multiple exist
             const sortedGroupEntries = Object.entries(groups).sort(([keyA], [keyB]) => {
                if (keyA === 'No User Story') return 1;
                if (keyB === 'No User Story') return -1;
                return keyA.localeCompare(keyB);
             });

             return (
                <div className="space-y-10 w-full">
                   {sortedGroupEntries.map(([userStoryNum, items]) => {
                      const hasUS = userStoryNum !== 'No User Story';
                      const usSummary = items[0]?.userStorySummary;
                      return (
                         <div key={userStoryNum} className="space-y-4">
                            {hasUS && (
                               <div className="bg-indigo-50/45 border border-indigo-100/60 rounded-[2rem] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left mb-2 animate-in fade-in duration-200 shadow-sm">
                                  <div className="flex flex-col">
                                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">User Story ID / Number</span>
                                     <div className="flex items-center gap-2.5">

                                        <span className="inline-block text-xs font-mono font-black text-indigo-600 bg-white border border-indigo-100 px-3 py-1 rounded-xl shadow-sm w-fit leading-none">

                                           {userStoryNum}

                                        </span>

                                        <button 
                                           onClick={(e) => handleDownloadUserStoryScenarios(userStoryNum, items, 'Repository_Individual', 'excel', e)}
                                           className="flex items-center gap-1 bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                                           title={`Download scenarios for ${userStoryNum} (Excel)`}
                                        >
                                           <FileSpreadsheet size={11} className="text-emerald-600" /> Excel
                                        </button>
                                        <button 
                                           onClick={(e) => handleDownloadUserStoryScenarios(userStoryNum, items, 'Repository_Individual', 'csv', e)}
                                           className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                                           title={`Download scenarios for ${userStoryNum} (CSV)`}
                                        >
                                           <Download size={11} className="text-slate-600" /> CSV
                                        </button>

                                     </div>
                                  </div>
                                  {usSummary && (
                                     <div className="flex-1 sm:border-l sm:border-indigo-100 sm:pl-5 flex flex-col">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-1">User Story Summary</span>
                                        <p className="text-sm font-bold text-slate-700 leading-normal">
                                           {usSummary}
                                        </p>
                                     </div>
                                  )}
                               </div>
                            )}
                            <div className="space-y-4">
                               {items.map(s => {
                                  const isFolderItem = false;
                                  return (
                                     <div key={s.id} className={`bg-white border rounded-[1.8rem] overflow-hidden group transition-all shadow-sm ${selectedScenarioIds.has(s.id) ? 'border-indigo-500 ring-2 ring-indigo-50' : 'border-slate-100 hover:border-indigo-400'}`}>
                                        <div className="flex items-center justify-between p-6">
                                           <div className="flex items-center gap-6 flex-1 min-w-0">
                                              <button 
                                                onClick={() => {
                                                  const next = new Set(selectedScenarioIds);
                                                  if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                                                  setSelectedScenarioIds(next);
                                                }}
                                                className={`transition-all ${selectedScenarioIds.has(s.id) ? 'text-indigo-600' : 'text-slate-300 group-hover:text-slate-400'}`}
                                              >
                                                 {selectedScenarioIds.has(s.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                                              </button>
                                              
                                              <button onClick={() => toggleExpand(s.id)} className={`p-2 transition-all rounded-xl ${expandedItems.has(s.id) ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                                                {expandedItems.has(s.id) ? <ChevronUp size={22}/> : <ChevronDown size={22}/>}
                                              </button>

                                              <div className={`p-3.5 border rounded-2xl shadow-sm bg-[#F8FAFF] border-[#E5EFFF] text-indigo-500`}>
                                                 <FileText size={20}/>
                                              </div>

                                              <div className="min-w-0 flex-1 group/title-wrap">
                                                 <h4 className={`font-black text-black uppercase tracking-tight cursor-pointer ${expandedItems.has(s.id) ? 'break-words whitespace-normal leading-relaxed' : 'line-clamp-2 whitespace-normal'}`} title={s.title}>{s.title}</h4>
                                                 <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-[10px] text-[#4F46E5] font-black uppercase tracking-widest">{s.scenarioId || s.moduleName}</span>
                                                    {(s.userStoryNumber || s.userStoryId) && (
                                                       <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80 flex items-center gap-1">
                                                          <span className="text-slate-400 font-medium">JIRA:</span> {s.userStoryNumber || s.userStoryId}
                                                       </span>
                                                     )}
                                                    <span className={`px-2.5 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${!s.type?.toLowerCase().includes('non-functional') ? 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]' : 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]'}`}>
                                                       {s.type}
                                                    </span>
                                                 </div>
                                              </div>
                                           </div>

                                           <div className="flex items-center gap-4 flex-shrink-0">
                                              <button 
                                                onClick={(e) => handleApproveScenario(s.id, e)} 
                                                disabled={s.isApproved}
                                                className={`flex items-center gap-2 px-6 py-2.5 rounded-[1rem] font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95 border ${
                                                  s.isApproved 
                                                    ? 'bg-[#059669] text-white border-emerald-700 cursor-default' 
                                                    : 'bg-white text-[#059669] border-emerald-200 hover:bg-emerald-50/50 hover:border-emerald-300'
                                                }`}
                                              >
                                                 {s.isApproved ? (
                                                   <>
                                                      <CheckCircle2 size={16} /> APPROVED
                                                   </>
                                                 ) : (
                                                   <>
                                                      <Check size={16} strokeWidth={3} /> APPROVE
                                                   </>
                                                 )}
                                              </button>
                                              
                                              <button onClick={(e) => handleOpenEdit(s, e)} className="p-2.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                                                <Pencil size={18} />
                                               </button>

                                               <button 
                                                 onClick={(e) => {
                                                   e.stopPropagation();
                                                   e.preventDefault();
                                                   setScenariosToMoveWithoutApprove([s]);
                                                   setSelectedFolderIdForSave(s.folderId || '');
                                                   setShowCreateFolderInline(false);
                                                   setInlineNewFolderName('');
                                                   setInlineFolderError(null);
                                                 }} 
                                                 className="flex items-center gap-1.5 px-4 py-2.5 rounded-[1rem] font-black text-[10px] uppercase tracking-widest bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 transition-all shadow-sm active:scale-95"
                                                 title="Save scenario to folder"
                                               >
                                                 <FolderPlus size={15} /> SAVE TO FOLDER
                                              </button>

                                              <button
                                                 type="button"
                                                 onClick={(e) => { e.stopPropagation(); handleDownloadSingleScenario(s, 'excel', e); }}
                                                 className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all cursor-pointer"
                                                 title="Download Scenario (Excel)"
                                               >
                                                 <FileSpreadsheet size={16} />
                                               </button>
                                               <button
                                                 type="button"
                                                 onClick={(e) => { e.stopPropagation(); handleDownloadSingleScenario(s, 'csv', e); }}
                                                 className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                                                 title="Download Scenario (CSV)"
                                               >
                                                 <Download size={16} />
                                               </button>
                                               <button onClick={() => setDeleteTargetId(s.id)} className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer">
                                                 <Trash2 size={18} />
                                               </button>
                                           </div>
                                        </div>
                                        
                                        {expandedItems.has(s.id) && (
                                          <div className="p-10 bg-[#F9FBFF] border-t border-slate-50 space-y-8 animate-in slide-in-from-top-2">
                                             <div className="space-y-6 w-full animate-in fade-in duration-200">
                                                {s.attachments && s.attachments.length > 0 && (
                                                   <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm mb-6">
                                                      <ScreenshotGallery images={s.attachments} title="Attached Screenshots" />
                                                   </div>
                                                )}
                                                {(s.userStoryNumber || s.userStorySummary) && (
                                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pb-6 border-b border-slate-100/80">
                                                      {s.userStoryNumber && (
                                                         <div>
                                                            <label className="text-[9px] font-black text-[#4F46E5] uppercase tracking-widest mb-2 block">User Story Number</label>
                                                            <span className="inline-block text-xs font-mono font-black text-[#4F46E5] bg-white border border-indigo-100 px-3 py-1 rounded-xl shadow-sm leading-none">
                                                               {s.userStoryNumber}
                                                            </span>
                                                         </div>
                                                      )}
                                                      {s.userStorySummary && (
                                                         <div>
                                                            <label className="text-[9px] font-black text-[#4F46E5] uppercase tracking-widest mb-2 block">User Story Summary</label>
                                                            <p className="text-sm font-bold text-slate-700 leading-normal bg-white p-4 rounded-2xl border border-indigo-100/30 shadow-inner">
                                                               {s.userStorySummary}
                                                            </p>
                                                         </div>
                                                      )}
                                                   </div>
                                                )}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                                   <div>
                                                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Scenario Description</label>
                                                      <p className="text-sm text-slate-600 font-medium leading-relaxed bg-white p-6 rounded-3xl border border-slate-100 shadow-inner break-words whitespace-pre-wrap">{maskPasswordText((s.description || '').replace(/\\n/g, '\n'), s.password || password)}</p>
                                                   </div>
                                                   <div>
                                                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Expected Result</label>
                                                      <p className="text-sm text-indigo-900 font-bold leading-relaxed bg-white p-6 rounded-3xl border border-indigo-100/50 shadow-inner break-words whitespace-pre-wrap">{maskPasswordText((s.expectedResults || '').replace(/\\n/g, '\n'), s.password || password)}</p>
                                                   </div>
                                                </div>
                                             </div>
                                          </div>
                                        )}
                                     </div>
                                  );
                               })}
                            </div>
                         </div>
                      );
                   })}
                </div>
             );
          })() : (
            paginatedItems.map(s => {
               const isFolderItem = isScenarioFolder(s);
               const folderMembersList = allScenariosPool.filter(mem => isMemberOfFolder(mem, s));
               const memberCount = folderMembersList.length;
               
               return (
                 <div key={s.id} className="bg-white border rounded-[1.8rem] overflow-hidden group transition-all shadow-sm border-slate-100 hover:border-indigo-400">
                    <div onClick={() => toggleExpand(s.id)} className="flex items-center justify-between p-6 cursor-pointer select-none">
                      <div className="flex items-center gap-6 flex-1 min-w-0">
                          <button onClick={(e) => { e.stopPropagation(); toggleExpand(s.id); }} className={`p-2 transition-all rounded-xl ${expandedItems.has(s.id) ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                           {expandedItems.has(s.id) ? <ChevronUp size={22}/> : <ChevronDown size={22}/>}
                         </button>

                         <div className="p-3.5 border rounded-2xl shadow-sm bg-[#FFFBEB] border-[#FEF3C7] text-[#D97706]">
                            <Folder size={20}/>
                         </div>

                         <div className="min-w-0 flex-1 group/title-wrap">
                            <h4 className={`font-black text-black uppercase tracking-tight cursor-pointer ${expandedItems.has(s.id) ? 'break-words whitespace-normal leading-relaxed' : 'line-clamp-2 whitespace-normal'}`} title={s.title}>{s.title}</h4>
                            <div className="flex items-center gap-3 mt-1">
                               <span className="text-[10px] text-[#4F46E5] font-black uppercase tracking-widest">AI SCENARIOS</span>
                               <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  {memberCount} {memberCount === 1 ? 'Scenario' : 'Scenarios'}
                               </span>
                               <span className="px-2.5 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]">
                                  FUNCTIONAL
                               </span>
                            </div>
                         </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-shrink-0 flex-wrap">
                         <button
                           type="button"
                           onClick={(e) => handleDownloadFolderScenarios(s, 'excel', e)}
                           className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3.5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                           title="Download Folder Scenarios (Excel)"
                         >
                            <FileSpreadsheet size={13} className="text-emerald-600" /> Excel
                         </button>
                         <button
                           type="button"
                           onClick={(e) => handleDownloadFolderScenarios(s, 'csv', e)}
                           className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3.5 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                           title="Download Folder Scenarios (CSV)"
                         >
                            <Download size={13} className="text-slate-600" /> CSV
                         </button>
                         <button onClick={(e) => { e.stopPropagation(); handleOpenEdit(s, e); }} className="flex items-center gap-2 bg-[#4F46E5] text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-[#4338CA] transition-all shadow-sm active:scale-95 cursor-pointer">
                            <Pencil size={14} /> Edit Folder
                         </button>
                         <button onClick={(e) => { e.stopPropagation(); setDeleteTargetId(s.id); }} className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all cursor-pointer">
                            <Trash2 size={18} />
                         </button>
                      </div>
                   </div>
                   
                   {expandedItems.has(s.id) && (
                     <div className="p-10 bg-[#F9FBFF] border-t border-slate-50 space-y-8 animate-in slide-in-from-top-2">
                        {(() => {
                           const folderMembers = allScenariosPool.filter(mem => isMemberOfFolder(mem, s));
                           const pendingFolderMembers = folderMembers.filter(mem => !mem.isApproved && mem.scenarioId !== 'INPUT_SOURCE');
                           const hasPendingMembers = pendingFolderMembers.length > 0;
                           const isAllFolderSelected = hasPendingMembers && pendingFolderMembers.every(mem => selectedScenarioIds.has(mem.id));
                           const selectedFolderMembersCount = folderMembers.filter(mem => selectedScenarioIds.has(mem.id) && !mem.isApproved && mem.scenarioId !== 'INPUT_SOURCE').length;

                           return (
                             <div className="space-y-6">
                             <div className="flex items-center justify-between border-b border-slate-100 pb-4 flex-wrap gap-4">
                                <div className="flex items-center gap-4 flex-wrap">
                                   <div className="flex items-center gap-3">
                                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Layers size={18} /></div>
                                      <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Total Scenarios ({memberCount})</h5>
                                   </div>
                                   
                                   {/* Select All Button */}
                                   {hasPendingMembers && (
                                      <button 
                                         onClick={() => {
                                            const next = new Set(selectedScenarioIds);
                                            if (isAllFolderSelected) {
                                               pendingFolderMembers.forEach(mem => next.delete(mem.id));
                                            } else {
                                               pendingFolderMembers.forEach(mem => next.add(mem.id));
                                            }
                                            setSelectedScenarioIds(next);
                                         }}
                                         className="flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:bg-indigo-50 px-3.5 py-1.5 rounded-xl border border-indigo-100 transition-all cursor-pointer animate-in fade-in duration-200"
                                      >
                                         <div className={isAllFolderSelected ? 'text-indigo-600' : 'text-slate-400'}>
                                            {isAllFolderSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                         </div>
                                         {isAllFolderSelected ? 'Deselect All' : 'Select All'}
                                      </button>
                                   )}

                                   {/* Bulk Approve Folder Button */}
                                   {selectedFolderMembersCount > 0 && (
                                      <button 
                                         onClick={async () => {
                                            const selectedIdsInFolder = folderMembers.filter(mem => selectedScenarioIds.has(mem.id) && !mem.isApproved && mem.scenarioId !== 'INPUT_SOURCE').map(mem => mem.id);
                                            if (selectedIdsInFolder.length === 0) return;
                                            
                                            const selectedIdSet = new Set(selectedIdsInFolder);
                                            const updatedScenarios = (project.scenarios || []).map(sc => {
                                               if (selectedIdSet.has(sc.id)) {
                                                  return { 
                                                    ...sc, 
                                                    isApproved: true, 
                                                    isRemovedFromIndividual: false,
                                                    folderId: sc.folderId || s.id,
                                                    folderName: sc.folderName || s.title,
                                                    saved: true
                                                  };
                                               }
                                               if (sc.id === s.id) {
                                                  const existingMemberIds = Array.isArray(sc.memberScenarioIds) ? sc.memberScenarioIds : [];
                                                  return {
                                                     ...sc,
                                                     memberScenarioIds: Array.from(new Set([...existingMemberIds, ...selectedIdsInFolder]))
                                                  };
                                               }
                                               return sc;
                                            });
                                            onUpdateProject({ ...project, scenarios: updatedScenarios });
                                            
                                            // Deselect them from state
                                            const next = new Set(selectedScenarioIds);
                                            selectedIdsInFolder.forEach(id => next.delete(id));
                                            setSelectedScenarioIds(next);
                                            
                                            await logActivity(user.email, user.name, `Bulk approved ${selectedIdsInFolder.length} scenarios in folder ${s.title}`, project.id, project.name);
                                            toast.success(`Approved ${selectedIdsInFolder.length} scenarios! Visible here and under Individual Scenarios in AI Test Cases.`);
                                            if (onNavigateTab) {
                                               onNavigateTab('cases');
                                            }
                                         }}
                                         className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer animate-in fade-in duration-200"
                                      >
                                         <CheckCircle2 size={14} /> Bulk Approve ({selectedFolderMembersCount})
                                      </button>
                                   )}
                                </div>
                                <button 
                                  onClick={(e) => handleOpenManageItems(s, e)}
                                  className="flex items-center gap-2 text-[#4F46E5] font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all"
                                >
                                   <Plus size={16} /> Add Scenarios
                                </button>
                             </div>
                             {memberCount === 0 ? (
                                <div className="py-12 text-center text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-3xl">
                                   This folder is currently empty. Click 'Add Scenarios' to add scenarios.
                                </div>
                             ) : (() => {
                                // Group folder members by userStoryNumber
                                const groups: { [key: string]: typeof folderMembers } = {};
                                folderMembers.forEach(mem => {
                                   const key = mem.userStoryNumber || 'No User Story';
                                   if (!groups[key]) groups[key] = [];
                                   groups[key].push(mem);
                                });

                                // Sort keys so that 'No User Story' comes last if multiple exist
                                const sortedGroupEntries = Object.entries(groups).sort(([keyA], [keyB]) => {
                                   if (keyA === 'No User Story') return 1;
                                   if (keyB === 'No User Story') return -1;
                                   return keyA.localeCompare(keyB);
                                });

                                return (
                                   <div className="space-y-10 w-full">
                                      {sortedGroupEntries.map(([userStoryNum, members]) => {
                                         const hasUS = userStoryNum !== 'No User Story';
                                         const usSummary = members[0]?.userStorySummary;
                                         return (
                                            <div key={userStoryNum} className="space-y-4">
                                               {hasUS && (
                                                  <div className="bg-indigo-50/45 border border-indigo-100/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left mb-2 animate-in fade-in duration-200 shadow-sm">
                                                     <div className="flex flex-col">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">User Story ID / Number</span>
                                                        <div className="flex items-center gap-2.5">

                                                           <span className="inline-block text-xs font-mono font-black text-indigo-600 bg-white border border-indigo-100 px-3 py-1 rounded-xl shadow-sm w-fit leading-none">

                                                              {userStoryNum}

                                                           </span>

                                                           <button 
                                                               onClick={(e) => handleDownloadUserStoryScenarios(userStoryNum, members, s.title, 'excel', e)}
                                                               className="flex items-center gap-1 bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                                                               title={`Download scenarios for ${userStoryNum} (Excel)`}
                                                            >
                                                               <FileSpreadsheet size={11} className="text-emerald-600" /> Excel
                                                            </button>
                                                            <button 
                                                               onClick={(e) => handleDownloadUserStoryScenarios(userStoryNum, members, s.title, 'csv', e)}
                                                               className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs cursor-pointer"
                                                               title={`Download scenarios for ${userStoryNum} (CSV)`}
                                                            >
                                                               <Download size={11} className="text-slate-600" /> CSV
                                                            </button>

                                                        </div>
                                                     </div>
                                                     {usSummary && (
                                                        <div className="flex-1 sm:border-l sm:border-indigo-100 sm:pl-5 flex flex-col">
                                                           <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">User Story Summary</span>
                                                           <p className="text-xs font-bold text-slate-700 leading-normal">
                                                              {usSummary}
                                                           </p>
                                                        </div>
                                                     )}
                                                  </div>
                                               )}
                                               <div className="flex flex-col gap-4 w-full">
                                                  {members.map(mem => {
                                                     const isInput = mem.scenarioId === 'INPUT_SOURCE';
                                                     const isSelected = selectedScenarioIds.has(mem.id);
                                                     const isExpanded = expandedItems.has(mem.id);
                                                     return (
                                                        <div 
                                                          key={mem.id} 
                                                          className={`w-full p-5 sm:p-6 rounded-2xl flex flex-col gap-3.5 group/mem shadow-sm transition-all border ${
                                                            isInput 
                                                              ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300' 
                                                              : isSelected 
                                                                ? 'bg-white border-indigo-500 ring-2 ring-indigo-100 shadow-md' 
                                                                : 'bg-white border-slate-200/90 hover:border-indigo-300 hover:shadow-md'
                                                          }`}
                                                        >
                                                           {/* Top Row: Checkbox / ID on the Left, Action Buttons in a Single Row on the Right */}
                                                           <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 w-full pb-2.5 border-b border-slate-100/90">
                                                              <div className="flex items-center gap-2.5 min-w-0">
                                                                 {!isInput && (
                                                                    <div className="flex-shrink-0">
                                                                       {!mem.isApproved ? (
                                                                          <button 
                                                                            onClick={() => {
                                                                              const next = new Set(selectedScenarioIds);
                                                                              if (next.has(mem.id)) next.delete(mem.id); else next.add(mem.id);
                                                                              setSelectedScenarioIds(next);
                                                                            }}
                                                                            className={`transition-all cursor-pointer ${selectedScenarioIds.has(mem.id) ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'}`}
                                                                            title="Select scenario"
                                                                          >
                                                                             {selectedScenarioIds.has(mem.id) ? <CheckSquare size={19} /> : <Square size={19} />}
                                                                          </button>
                                                                       ) : (
                                                                          <div className="text-emerald-600 flex items-center justify-center" title="Approved">
                                                                             <CheckCircle2 size={19} className="stroke-[2.5]" />
                                                                          </div>
                                                                       )}
                                                                    </div>
                                                                 )}

                                                                 {/* Scenario ID Tag */}
                                                                 {!isInput ? (
                                                                    <span className="text-xs font-black text-indigo-700 font-mono tracking-wider bg-indigo-50/90 px-2.5 py-1 rounded-lg border border-indigo-200/80 shadow-xs">
                                                                       {mem.scenarioId && mem.scenarioId !== 'AUTO' ? mem.scenarioId : `TS-${(mem.id ? mem.id.slice(0, 4) : '001').toUpperCase()}`}
                                                                    </span>
                                                                 ) : (
                                                                    <span className="text-xs font-black text-amber-800 font-mono tracking-wider bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-300/80 shadow-xs flex items-center gap-1.5">
                                                                       <Sparkles size={13} className="animate-pulse text-amber-600" /> INPUT SOURCE
                                                                    </span>
                                                                 )}

                                                                 {(mem.userStoryNumber || mem.userStoryId) && (
                                                                    <span className="px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                                                                       <span className="text-slate-400 font-medium">JIRA:</span> {mem.userStoryNumber || mem.userStoryId}
                                                                    </span>
                                                                 )}
                                                              </div>

                                                              {/* Action Buttons Top Right in a Single Row */}
                                                              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto sm:ml-0">
                                                                 {!isInput && (
                                                                    <button 
                                                                      onClick={(e) => handleApproveScenario(mem.id, e, s)} 
                                                                      disabled={mem.isApproved}
                                                                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all shadow-xs active:scale-95 border ${
                                                                        mem.isApproved
                                                                          ? 'bg-emerald-600 text-white border-emerald-700 cursor-default'
                                                                          : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300'
                                                                      }`}
                                                                      title={mem.isApproved ? "Approved" : "Approve scenario"}
                                                                    >
                                                                       <Check size={13} strokeWidth={3} /> {mem.isApproved ? 'Approved' : 'Approve'}
                                                                    </button>
                                                                 )}
                                                                 <button 
                                                                   onClick={(e) => handleOpenEdit(mem, e)} 
                                                                   className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 transition-all shadow-xs active:scale-95" 
                                                                   title="Edit scenario"
                                                                 >
                                                                    <Pencil size={12} strokeWidth={2.5} /> Edit
                                                                 </button>
                                                                 {!isInput && (
                                                                    <button 
                                                                      onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        e.preventDefault();
                                                                        setScenariosToMoveWithoutApprove([mem]);
                                                                        setSelectedFolderIdForSave(mem.folderId || '');
                                                                        setShowCreateFolderInline(false);
                                                                        setInlineNewFolderName('');
                                                                        setInlineFolderError(null);
                                                                      }} 
                                                                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase tracking-wider bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-all shadow-xs active:scale-95"
                                                                      title="Save scenario to folder"
                                                                    >
                                                                       <FolderPlus size={13} /> Save to Folder
                                                                    </button>
                                                                 )}
                                                                 <button 
                                                                   type="button"
                                                                   onClick={(e) => { e.stopPropagation(); handleDownloadSingleScenario(mem, 'excel', e); }} 
                                                                   className="p-1.5 bg-slate-50 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-slate-200 shadow-xs active:scale-95 cursor-pointer" 
                                                                   title="Download Scenario (Excel)"
                                                                 >
                                                                    <FileSpreadsheet size={13} />
                                                                 </button>
                                                                 <button 
                                                                   type="button"
                                                                   onClick={(e) => { e.stopPropagation(); handleDownloadSingleScenario(mem, 'csv', e); }} 
                                                                   className="p-1.5 bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all border border-slate-200 shadow-xs active:scale-95 cursor-pointer" 
                                                                   title="Download Scenario (CSV)"
                                                                 >
                                                                    <Download size={13} />
                                                                 </button>
                                                                 <button 
                                                                   onClick={(e) => { e.stopPropagation(); setDeleteTargetId(mem.id); }} 
                                                                   className="p-1.5 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-200 shadow-xs active:scale-95" 
                                                                   title="Delete scenario"
                                                                 >
                                                                    <MinusCircle size={15} />
                                                                 </button>
                                                                 <button 
                                                                   onClick={(e) => { e.stopPropagation(); toggleExpand(mem.id); }} 
                                                                   className={`p-1.5 transition-all rounded-xl border shadow-xs ${isExpanded ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-400 hover:text-slate-700 border-slate-200'}`}
                                                                   title={isExpanded ? "Collapse Details" : "Expand Details"}
                                                                 >
                                                                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                                                 </button>
                                                              </div>
                                                           </div>

                                                           {/* Main Content: Scenario Title (Full Width) */}
                                                           <div className="w-full text-left">
                                                              <h4 
                                                                onClick={() => toggleExpand(mem.id)}
                                                                className="text-sm sm:text-base font-bold text-slate-900 leading-snug cursor-pointer hover:text-indigo-600 transition-colors"
                                                                title={mem.title}
                                                              >
                                                                 {mem.title}
                                                              </h4>
                                                           </div>

                                                           {/* Main Content: Description (Full Width, clear and readable) */}
                                                           {mem.description && (
                                                              <div className="w-full text-left">
                                                                 <p 
                                                                    className="text-xs sm:text-sm text-slate-600 font-normal leading-relaxed truncate"
                                                                    title={maskPasswordText((mem.description || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim(), mem.password || password)}
                                                                 >
                                                                    <span className="font-semibold text-slate-700">Description: </span>
                                                                    {maskPasswordText((mem.description || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim(), mem.password || password)}
                                                                 </p>
                                                              </div>
                                                           )}

                                                           {/* Bottom Row / Metadata Bar: Module | Type | Status | Folder */}
                                                           <div className="flex flex-wrap items-center gap-y-2 gap-x-4 pt-2.5 border-t border-slate-100 text-[11px] font-medium text-slate-600">
                                                              <div className="flex items-center gap-1.5">
                                                                 <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Module:</span>
                                                                 <span className="font-semibold text-slate-800">{mem.moduleName || 'General'}</span>
                                                              </div>
                                                              <span className="text-slate-300 hidden sm:inline">|</span>
                                                              <div className="flex items-center gap-1.5">
                                                                 <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Type:</span>
                                                                 <span className="font-semibold text-indigo-700 bg-indigo-50/70 px-2 py-0.5 rounded border border-indigo-100/80">{mem.type || 'Functional'}</span>
                                                              </div>
                                                              <span className="text-slate-300 hidden sm:inline">|</span>
                                                              <div className="flex items-center gap-1.5">
                                                                 <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Status:</span>
                                                                 <span className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${
                                                                    mem.isApproved 
                                                                       ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                                                       : 'bg-amber-50 text-amber-700 border-amber-200'
                                                                 }`}>
                                                                    {mem.isApproved ? 'Approved' : 'Unapproved'}
                                                                 </span>
                                                              </div>
                                                              <span className="text-slate-300 hidden sm:inline">|</span>
                                                              <div className="flex items-center gap-1.5">
                                                                 <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Folder:</span>
                                                                 <span className="font-semibold text-slate-700 flex items-center gap-1">
                                                                    <Folder size={12} className="text-indigo-500" />
                                                                    {s.title || 'Testing'}
                                                                 </span>
                                                              </div>
                                                           </div>

                                                           {/* Expandable Details (Steps, Expected Results, Attachments, User Story) */}
                                                           {isExpanded && (
                                                              <div className="mt-2 pt-4 border-t border-slate-100 flex flex-col gap-4 text-left animate-in slide-in-from-top-2">
                                                                 {isInput && mem.attachments && mem.attachments.length > 0 && (
                                                                    <div className="mb-2">
                                                                       <ScreenshotGallery images={mem.attachments} title="Attached Screenshots" compact />
                                                                    </div>
                                                                 )}
                                                                 {mem.userStorySummary && (
                                                                    <div>
                                                                       <label className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1 block">User Story Summary</label>
                                                                       <p className="text-xs font-bold text-slate-700 leading-normal bg-indigo-50/20 p-4 rounded-2xl border border-indigo-100/30">
                                                                          {mem.userStorySummary}
                                                                       </p>
                                                                    </div>
                                                                 )}
                                                                 <div>
                                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Expected Result</label>
                                                                    <p className="text-xs text-indigo-900 font-bold leading-relaxed bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100/50 shadow-inner break-words">
                                                                       {maskPasswordText(mem.expectedResults, mem.password || password)}
                                                                    </p>
                                                                 </div>
                                                              </div>
                                                           )}
                                                        </div>
                                                     );
                                                  })}
                                               </div>
                                            </div>
                                         );
                                      })}
                                   </div>
                                );
                             })()}
                             </div>
                           );
                        })()}
                     </div>
                   )}
                 </div>
               );
            })
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex flex-col md:flex-row items-center justify-between bg-white px-8 py-6 rounded-[2rem] border border-slate-200 shadow-sm gap-4">
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
               Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} {activeView === 'folders' ? 'Folders' : 'Scenarios'}
             </p>
             <div className="flex items-center gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-white hover:border-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                  title="Previous Page"
                >
                  <ChevronLeft size={20} />
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const pageNum = i + 1;
                    if (totalPages > 5) {
                      if (pageNum !== 1 && pageNum !== totalPages && Math.abs(pageNum - currentPage) > 1) {
                        if (pageNum === 2 && currentPage > 3) return <span key="dots-1" className="px-2 text-slate-300">...</span>;
                        if (pageNum === totalPages - 1 && currentPage < totalPages - 2) return <span key="dots-2" className="px-2 text-slate-300">...</span>;
                        if (Math.abs(pageNum - currentPage) > 1) return null;
                      }
                    }
                    return (
                      <button 
                        key={pageNum}
                        onClick={() => { setCurrentPage(pageNum); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`w-10 h-10 rounded-xl text-[11px] font-black transition-all border ${currentPage === pageNum ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-white hover:border-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-sm"
                  title="Next Page"
                >
                  <ChevronRight size={20} />
                </button>
             </div>
          </div>
        )}
      </div>

      {/* Manage Folder Items Modal */}
      {managingFolder && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-white">
              <div className="p-10 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                 <div className="flex items-center gap-5">
                    <div className="p-4 bg-indigo-600 rounded-[1.5rem] text-white shadow-xl shadow-indigo-100"><Layers size={24} /></div>
                    <div>
                       <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Add Scenarios</h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">FOLDER: {managingFolder.title.toUpperCase()}</p>
                    </div>
                 </div>
                 <button onClick={() => setManagingFolder(null)} className="p-3 text-slate-400 hover:text-slate-600 transition-all"><X size={28} /></button>
              </div>

              {allMangeableScenarios.length > 0 && (
                <div className="px-10 py-4 bg-white border-b border-slate-50 flex items-center justify-between">
                  <button 
                    onClick={handleToggleSelectAllMembers}
                    className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] transition-all hover:text-slate-600 group"
                  >
                    <div className={tempMemberIds.size === allMangeableScenarios.length ? 'text-indigo-600' : 'text-slate-300 group-hover:text-slate-400'}>
                        {tempMemberIds.size === allMangeableScenarios.length ? <CheckSquare size={20} /> : <Square size={20} />}
                    </div>
                    {tempMemberIds.size === allMangeableScenarios.length ? 'Deselect All Scenarios' : 'Select All Scenarios'}
                  </button>
                  <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-3 py-1 rounded-full">{tempMemberIds.size} Selected</span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-8 space-y-4 custom-scrollbar bg-slate-50/20">
                 {allMangeableScenarios.length === 0 ? (
                    <div className="py-20 text-center text-slate-400 italic font-medium border-2 border-dashed border-slate-100 rounded-3xl">
                       No scenarios available to add.
                    </div>
                 ) : (
                    allMangeableScenarios.map(scen => (
                       <button 
                         key={scen.id} 
                         onClick={() => toggleTempMember(scen.id)}
                         className={`w-full flex items-center justify-between p-5 rounded-3xl border transition-all text-left ${tempMemberIds.has(scen.id) ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-50' : 'bg-white/60 border-slate-100 hover:border-slate-200'}`}
                       >
                          <div className="flex items-center gap-5 min-w-0">
                             <div className={`p-3 rounded-xl transition-colors ${tempMemberIds.has(scen.id) ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400 group-hover:bg-indigo-50'}`}>
                                <FileText size={20} />
                             </div>
                             <div className="min-w-0">
                                <h5 className="text-sm font-black text-slate-800 uppercase tracking-tight break-words line-clamp-2 cursor-pointer" title={scen.title}>{scen.title}</h5>
                                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 tracking-widest">{scen.moduleName} • {scen.type}</p>
                             </div>
                          </div>
                          <div className={`transition-all ${tempMemberIds.has(scen.id) ? 'text-indigo-600 scale-110' : 'text-slate-200'}`}>
                             {tempMemberIds.has(scen.id) ? <CheckSquare size={28} /> : <Square size={28} />}
                          </div>
                       </button>
                    ))
                 )}
              </div>

              <div className="p-10 bg-white border-t border-slate-100 flex gap-4">
                 <button onClick={handleSaveFolderMembers} className="flex-1 py-5 bg-indigo-600 text-white rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-2xl shadow-indigo-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                    <CheckCircle2 size={18} /> Update Folder
                 </button>
                 <button onClick={() => setManagingFolder(null)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200 active:scale-[0.98]">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {/* Add Folder Modal */}
      {isCreatingFolder && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white">
            <div className="p-10">
              <div className="flex items-center gap-5 mb-8">
                <div className="p-4 bg-indigo-600 rounded-[1.5rem] text-white shadow-xl shadow-indigo-100"><FolderPlus size={24} /></div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">New Scenario Folder</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Group your approved AI scenarios</p>
                </div>
              </div>
              <div className="space-y-6">
                <div className="space-y-3">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 block">Folder Name</label>
                   <input 
                     autoFocus 
                     className={`w-full px-7 py-5 bg-slate-50 border rounded-[1.8rem] text-sm font-black outline-none focus:ring-4 ring-indigo-50/5 transition-all shadow-inner ${folderError ? 'border-rose-300' : 'border-slate-200'}`} 
                     placeholder="e.g. Dashboard Regression" 
                     value={newFolderName || ''} 
                     onChange={e => { setNewFolderName(e.target.value); setFolderError(null); }} 
                     onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                   />
                </div>
                {folderError && <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 animate-in shake duration-500"><AlertTriangle size={16}/> {folderError}</div>}
                <div className="flex flex-col gap-3 pt-4">
                   <button onClick={handleCreateFolder} className="w-full py-5 bg-indigo-600 text-white rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95">Create Folder</button>
                   <button onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); setFolderError(null); }} className="w-full py-5 bg-slate-100 text-slate-500 rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-w-2xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-white">
              <div className="p-10 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                 <div className="flex items-center gap-5">
                    <div className="p-5 bg-indigo-600 rounded-[1.5rem] text-white shadow-xl shadow-indigo-100">
                       <Pencil size={28} />
                    </div>
                    <div>
                       <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
                         {isScenarioFolder(editingItem) ? 'Edit Folder Name' : 'Edit Scenario'}
                       </h3>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                         {isScenarioFolder(editingItem) ? 'Update the title of your organization suite' : 'Update the details and specifications of this scenario'}
                       </p>
                    </div>
                 </div>
                 <button onClick={() => setEditingItem(null)} className="p-3 text-slate-400 hover:text-slate-600 transition-all border border-transparent"><X size={28} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-1.5"><Asterisk size={12} className="text-indigo-600" /> Title / Name</label>
                    <input 
                      autoFocus
                      value={editForm.title || ''} 
                      onChange={e => setEditForm({...editForm, title: e.target.value})} 
                      className={`w-full px-6 py-5 bg-slate-50 border rounded-[1.5rem] text-sm font-bold outline-none focus:ring-4 ring-indigo-50/5 transition-all shadow-inner ${editErrors.title ? 'border-rose-300' : 'border-slate-200'}`} 
                      placeholder="Enter scenario or folder title..." 
                    />
                    {editErrors.title && <p className="text-rose-500 text-[10px] font-black mt-2 ml-3 uppercase tracking-widest">{editErrors.title}</p>}
                 </div>

                 {editingItem.scenarioId !== 'SCENARIO_FOLDER' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Module Name</label>
                           <input 
                            value={editForm.moduleName || ''} 
                            onChange={e => setEditForm({...editForm, moduleName: e.target.value})} 
                            className={`w-full px-6 py-4 bg-slate-50 border rounded-2xl text-xs font-black uppercase tracking-widest outline-none focus:ring-4 ring-indigo-50/5 transition-all shadow-inner ${editErrors.moduleName ? 'border-rose-300' : 'border-slate-200'}`} 
                            placeholder="e.g. Identity, Checkout, API" 
                           />
                           {editErrors.moduleName && <p className="text-rose-500 text-[10px] font-black mt-1 ml-3 uppercase tracking-widest">{editErrors.moduleName}</p>}
                        </div>
                        <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Scenario Type</label>
                           <div className="relative">
                              <select 
                                value={editForm.type || ''} 
                                onChange={e => setEditForm({...editForm, type: e.target.value as any})} 
                                className="w-full pl-6 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase outline-none appearance-none cursor-pointer hover:bg-white transition-all shadow-sm"
                              >
                                 <option value="Functional">Functional</option>
                                 <option value="Non-functional">Non-Functional</option>
                              </select>
                              <ChevronDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                           </div>
                        </div>
                    </div>
                 )}

                 {editingItem.scenarioId !== 'SCENARIO_FOLDER' && (
                    <>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2"><FileText size={14} className="text-indigo-400" /> Scenario Description</label>
                        <textarea 
                          value={editForm.description || ''} 
                          onChange={e => setEditForm({...editForm, description: e.target.value})} 
                          className="w-full h-32 px-8 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] text-sm font-medium text-slate-600 outline-none focus:ring-4 ring-indigo-50/5 transition-all resize-none shadow-inner" 
                          placeholder="Detailed scenario interaction steps..." 
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-500" /> Expected Result</label>
                        <textarea 
                          value={editForm.expectedResults || ''} 
                          onChange={e => setEditForm({...editForm, expectedResults: e.target.value})} 
                          className="w-full h-32 px-8 py-6 bg-slate-50 border border-slate-200 rounded-[2rem] text-sm font-bold text-indigo-700 outline-none focus:ring-4 ring-indigo-50/5 transition-all resize-none shadow-inner" 
                          placeholder="What defines a successful run?" 
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-slate-100 pt-6">
                        <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">User Story Number</label>
                           <input 
                            value={editForm.userStoryNumber || ''} 
                            onChange={e => setEditForm({...editForm, userStoryNumber: e.target.value})} 
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest outline-none focus:ring-4 ring-indigo-50/5 transition-all shadow-inner font-mono text-indigo-600" 
                            placeholder="e.g. US-001" 
                           />
                        </div>
                        <div className="space-y-3">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">User Story Summary Line</label>
                           <input 
                            value={editForm.userStorySummary || ''} 
                            onChange={e => setEditForm({...editForm, userStorySummary: e.target.value})} 
                            className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-indigo-50/5 transition-all shadow-inner text-slate-700" 
                            placeholder="User Story Summary Line..." 
                           />
                        </div>
                    </div>
                    </>
                 )}
              </div>

              <div className="p-10 bg-white border-t border-slate-100 flex gap-5">
                 <button onClick={handleSaveEdit} className="flex-1 py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-2xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-3"><Save size={20} /> Commit Changes</button>
                 <button onClick={() => setEditingItem(null)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (() => {
        const isTargetFolder = scenarios.some(s => s.id === deleteTargetId && (isScenarioFolder(s) || s.scenarioId === 'SCENARIO_FOLDER' || s.folderType === 'scenario'));
        return (
          <div className="fixed inset-0 z-[6000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
             <div className="bg-white w-full max-sm rounded-[3rem] p-10 text-center shadow-2xl animate-in zoom-in-95 border border-white">
                <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-8 text-rose-500 shadow-inner">
                   <AlertTriangle size={40} />
                </div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-4">
                  {isTargetFolder ? 'Delete Folder?' : 'Delete Scenario?'}
                </h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10 px-4">
                  {isTargetFolder 
                    ? 'This action will permanently delete this folder. Any scenarios inside will be unassigned and kept in the repository.' 
                    : 'This action will permanently erase this scenario from the workspace repository. This operation is final.'}
                </p>
                <div className="flex flex-col gap-3">
                   <button onClick={() => handleDeleteScenario(deleteTargetId)} className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 shadow-lg active:scale-95">Yes, Delete</button>
                   <button onClick={() => setDeleteTargetId(null)} className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                </div>
             </div>
          </div>
        );
      })()}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white w-full max-sm rounded-[3rem] p-10 text-center shadow-2xl animate-in zoom-in-95 border border-white">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-8 text-red-500 shadow-inner">
                 <AlertTriangle size={40} />
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-4">Delete {selectedScenarioIds.size} Scenarios?</h3>
              <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10 px-4">This action will permanently erase all {selectedScenarioIds.size} selected scenarios from the workspace repository. This operation is final.</p>
              <div className="flex flex-col gap-3">
                 <button onClick={handleBulkDelete} className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 shadow-lg active:scale-95">Yes, Delete All Selected</button>
                 <button onClick={() => setShowBulkDeleteConfirm(false)} className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
              </div>
           </div>
        </div>
      )}

      {/* Save Confirmation Popup Modal */}
      {isSaveConfirmModalOpen && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white p-10">
            <div className="flex items-center gap-5 mb-6">
              <div className="p-4 bg-indigo-100 text-indigo-600 rounded-[1.5rem] shadow-sm">
                <Sparkles size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Save Generated Scenarios</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Organize your workspace</p>
              </div>
            </div>
            
            <p className="text-sm text-slate-600 font-medium leading-relaxed mb-8">
              Your AI scenarios have been generated successfully. Would you like to save these scenarios into a folder?
            </p>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  setIsSaveConfirmModalOpen(false);
                  setIsFolderSelectModalOpen(true);
                }} 
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <FolderPlus size={16} /> Save to Folder
              </button>
              <button 
                onClick={() => {
                  setIsSaveConfirmModalOpen(false);
                  toast.info("Scenarios kept as Individual unsaved items.");
                }} 
                className="w-full py-4 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest transition-all"
              >
                Keep Unsaved (Individual)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Selection Modal */}
      {isFolderSelectModalOpen && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white p-10 flex flex-col max-h-[90vh]">
            <div className="flex items-center gap-5 mb-6 shrink-0">
              <div className="p-4 bg-indigo-600 text-white rounded-[1.5rem] shadow-xl shadow-indigo-100">
                <Folder size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Select Folder</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Choose destination suite</p>
              </div>
            </div>

            <div className="space-y-6 flex-1 overflow-y-auto pr-1">
              <div className="flex items-center gap-6 border-b border-slate-100 pb-4 shrink-0">
                <button 
                  onClick={() => setShowCreateFolderInline(false)}
                  className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${!showCreateFolderInline ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  Existing Folder
                </button>
                <button 
                  onClick={() => {
                    setShowCreateFolderInline(true);
                    setInlineFolderError(null);
                  }}
                  className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${showCreateFolderInline ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  + Create New
                </button>
              </div>

              {showCreateFolderInline ? (
                <div className="space-y-4 animate-in slide-in-from-top-2 duration-200 shrink-0">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">New Folder Name</label>
                    <input 
                      autoFocus
                      type="text"
                      className={`w-full px-5 py-4 bg-slate-50 border rounded-2xl text-sm font-black outline-none focus:ring-4 ring-indigo-50/5 transition-all shadow-inner ${inlineFolderError ? 'border-rose-300' : 'border-slate-200'}`}
                      placeholder="e.g. Authentication Suite"
                      value={inlineNewFolderName || ''}
                      onChange={e => {
                        setInlineNewFolderName(e.target.value);
                        setInlineFolderError(null);
                      }}
                    />
                  </div>
                  {inlineFolderError && (
                    <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle size={14}/> {inlineFolderError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-200 flex flex-col flex-1 min-h-[200px]">
                  <div className="relative shrink-0">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      className="w-full pl-12 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black outline-none focus:ring-4 ring-indigo-50/5 transition-all"
                      placeholder="Search folders..."
                      value={searchFolderQuery || ''}
                      onChange={e => setSearchFolderQuery(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[250px] pr-1">
                    {scenarios.filter(s => isScenarioFolder(s) && s.title.toLowerCase().includes(searchFolderQuery.toLowerCase())).length === 0 ? (
                      <div className="py-12 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                        No folders found. Create a new one!
                      </div>
                    ) : (
                      scenarios
                        .filter(s => isScenarioFolder(s) && s.title.toLowerCase().includes(searchFolderQuery.toLowerCase()))
                        .map(folder => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => setSelectedFolderIdForSave(folder.id)}
                            className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${selectedFolderIdForSave === folder.id ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-black' : 'bg-white border-slate-100 hover:border-slate-200 text-slate-700 font-bold'}`}
                          >
                            <span className="text-xs uppercase tracking-tight break-all pr-2">{folder.title}</span>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${selectedFolderIdForSave === folder.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200'}`}>
                              {selectedFolderIdForSave === folder.id && <Check size={12} strokeWidth={3} />}
                            </div>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-100 flex gap-3 shrink-0">
              <button 
                onClick={handleSaveScenariosToFolder}
                className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} /> Confirm Save
              </button>
              <button 
                onClick={() => {
                  setIsFolderSelectModalOpen(false);
                  setShowCreateFolderInline(false);
                  setInlineNewFolderName('');
                  setInlineFolderError(null);
                  setSelectedFolderIdForSave('');
                }} 
                className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Folder without Approving Modal */}
      {scenariosToMoveWithoutApprove.length > 0 && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white p-10 flex flex-col max-h-[90vh]">
            <div className="flex items-center gap-5 mb-6 shrink-0">
              <div className="p-4 bg-indigo-600 text-white rounded-[1.5rem] shadow-xl shadow-indigo-100">
                <FolderPlus size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Save to Folder</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {scenariosToMoveWithoutApprove.some(s => s.isApproved) ? 'Approved Scenario' : 'Unapproved Scenario'} • {scenariosToMoveWithoutApprove.length === 1 ? '1 scenario' : `${scenariosToMoveWithoutApprove.length} scenarios`}
                </p>
              </div>
            </div>

            <div className="mb-4 shrink-0 space-y-2">
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                {scenariosToMoveWithoutApprove.length === 1 ? (
                  <>Save <strong className="text-slate-800 uppercase">"{scenariosToMoveWithoutApprove[0].title}"</strong> into a folder.</>
                ) : (
                  <>Save the selected <strong className="text-slate-800 uppercase">{scenariosToMoveWithoutApprove.length} scenarios</strong> into a folder.</>
                )}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Status:</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                  scenariosToMoveWithoutApprove.some(s => s.isApproved) 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {scenariosToMoveWithoutApprove.some(s => s.isApproved) ? 'Approved' : 'Unapproved'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  {scenariosToMoveWithoutApprove.some(s => s.isApproved)
                    ? '• Visible in Individual Scenarios under AI Test Cases'
                    : '• Remains unapproved until approved'}
                </span>
              </div>
            </div>

            <div className="space-y-6 flex-1 overflow-y-auto pr-1">
              <div className="flex items-center gap-6 border-b border-slate-100 pb-4 shrink-0">
                <button 
                  onClick={() => setShowCreateFolderInline(false)}
                  className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${!showCreateFolderInline ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  Existing Folder
                </button>
                <button 
                  onClick={() => {
                    setShowCreateFolderInline(true);
                    setInlineFolderError(null);
                  }}
                  className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${showCreateFolderInline ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                >
                  + Create New
                </button>
              </div>

              {showCreateFolderInline ? (
                <div className="space-y-4 animate-in slide-in-from-top-2 duration-200 shrink-0">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">New Folder Name</label>
                    <input 
                      autoFocus
                      type="text"
                      className={`w-full px-5 py-4 bg-slate-50 border rounded-2xl text-sm font-black outline-none focus:ring-4 ring-indigo-50/5 transition-all shadow-inner ${inlineFolderError ? 'border-rose-300' : 'border-slate-200'}`}
                      placeholder="e.g. Authentication Suite"
                      value={inlineNewFolderName || ''}
                      onChange={e => {
                        setInlineNewFolderName(e.target.value);
                        setInlineFolderError(null);
                      }}
                    />
                  </div>
                  {inlineFolderError && (
                    <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle size={14}/> {inlineFolderError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-200 flex flex-col flex-1 min-h-[200px]">
                  <div className="relative shrink-0">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      className="w-full pl-12 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black outline-none focus:ring-4 ring-indigo-50/5 transition-all"
                      placeholder="Search folders..."
                      value={searchFolderQuery || ''}
                      onChange={e => setSearchFolderQuery(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[200px] pr-1">
                    {scenarios.filter(s => isScenarioFolder(s) && s.title.toLowerCase().includes(searchFolderQuery.toLowerCase())).length === 0 ? (
                      <div className="py-12 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-2xl bg-slate-50/30">
                        No folders found. Create a new one!
                      </div>
                    ) : (
                      scenarios
                        .filter(s => isScenarioFolder(s) && s.title.toLowerCase().includes(searchFolderQuery.toLowerCase()))
                        .map(folder => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => setSelectedFolderIdForSave(folder.id)}
                            className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${selectedFolderIdForSave === folder.id ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-black' : 'bg-white border-slate-100 hover:border-slate-200 text-slate-700 font-bold'}`}
                          >
                            <span className="text-xs uppercase tracking-tight break-all pr-2">{folder.title}</span>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${selectedFolderIdForSave === folder.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200'}`}>
                              {selectedFolderIdForSave === folder.id && <Check size={12} strokeWidth={3} />}
                            </div>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-100 flex gap-3 shrink-0">
              <button 
                onClick={handleSaveScenariosWithoutApprove}
                className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <FolderPlus size={16} /> Save to Folder
              </button>
              <button 
                onClick={() => {
                  setScenariosToMoveWithoutApprove([]);
                  setShowCreateFolderInline(false);
                  setInlineNewFolderName('');
                  setInlineFolderError(null);
                  setSelectedFolderIdForSave('');
                }} 
                className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save and Approve Scenario Modal */}
      {scenariosToApproveAndSave.length > 0 && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 p-8 sm:p-10 flex flex-col max-h-[90vh]">
            <div className="flex items-center gap-4 mb-5 shrink-0">
              <div className="p-3.5 bg-emerald-600 text-white rounded-2xl shadow-lg shadow-emerald-100">
                <FolderPlus size={24} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-black text-slate-800 uppercase tracking-tight">Select / Save to Folder</h3>
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-0.5">
                  Approve Scenario • {scenariosToApproveAndSave.length === 1 ? '1 Scenario' : `${scenariosToApproveAndSave.length} Scenarios`}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 font-medium mb-5 leading-relaxed shrink-0">
              {scenariosToApproveAndSave.length === 1 ? (
                <>Select an existing folder or create a new folder for <strong className="text-slate-800">"{scenariosToApproveAndSave[0].title}"</strong>. After approval, the scenario will be saved to the folder and moved to <strong className="text-emerald-700">AI Test Cases → Individual Scenarios</strong>.</>
              ) : (
                <>Select an existing folder or create a new folder. Scenarios will be saved to the folder and moved to <strong className="text-emerald-700">AI Test Cases → Individual Scenarios</strong>.</>
              )}
            </p>

            <div className="space-y-5 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl shrink-0">
                <button 
                  type="button"
                  onClick={() => setShowCreateFolderInline(false)}
                  className={`py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${!showCreateFolderInline ? 'bg-white text-emerald-700 shadow-xs font-black' : 'text-slate-500 hover:text-slate-800 font-bold'}`}
                >
                  Existing Folder
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setShowCreateFolderInline(true);
                    setInlineFolderError(null);
                  }}
                  className={`py-2.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${showCreateFolderInline ? 'bg-white text-emerald-700 shadow-xs font-black' : 'text-slate-500 hover:text-slate-800 font-bold'}`}
                >
                  + Create New Folder
                </button>
              </div>

              {showCreateFolderInline ? (
                <div className="space-y-4 animate-in slide-in-from-top-2 duration-200 shrink-0">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">New Folder Name</label>
                    <input 
                      autoFocus
                      type="text"
                      className={`w-full px-4 py-3.5 bg-slate-50 border rounded-2xl text-xs font-bold outline-none focus:ring-4 ring-emerald-500/10 focus:border-emerald-500 transition-all ${inlineFolderError ? 'border-rose-300' : 'border-slate-200'}`}
                      placeholder="e.g. Authentication & Login Suite"
                      value={inlineNewFolderName || ''}
                      onChange={e => {
                        setInlineNewFolderName(e.target.value);
                        setInlineFolderError(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveAndApproveScenario();
                        }
                      }}
                    />
                  </div>
                  {inlineFolderError && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-bold uppercase tracking-wide flex items-center gap-2">
                      <AlertTriangle size={14} className="shrink-0" /> {inlineFolderError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-200 flex flex-col flex-1 min-h-[180px]">
                  <div className="relative shrink-0">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                    <input 
                      type="text"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:ring-4 ring-emerald-500/10 focus:border-emerald-500 transition-all"
                      placeholder="Search existing folders..."
                      value={searchFolderQuery || ''}
                      onChange={e => setSearchFolderQuery(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[190px] pr-1">
                    {scenarios.filter(s => 
                      isScenarioFolder(s) &&
                      s.title.toLowerCase().includes(searchFolderQuery.toLowerCase())
                    ).length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
                        <p>No existing folders found.</p>
                        <button 
                          type="button" 
                          onClick={() => setShowCreateFolderInline(true)}
                          className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 underline cursor-pointer"
                        >
                          Create New Folder
                        </button>
                      </div>
                    ) : (
                      scenarios
                        .filter(s => 
                          isScenarioFolder(s) &&
                          s.title.toLowerCase().includes(searchFolderQuery.toLowerCase())
                        )
                        .map(folder => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => setSelectedFolderIdForSave(folder.id)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                              selectedFolderIdForSave === folder.id 
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-950 font-black ring-2 ring-emerald-500/20' 
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 font-medium'
                            }`}
                          >
                            <span className="text-xs break-all pr-2 truncate">{folder.title}</span>
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selectedFolderIdForSave === folder.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>
                              {selectedFolderIdForSave === folder.id && <Check size={10} strokeWidth={3} />}
                            </div>
                          </button>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-5 border-t border-slate-100 flex gap-3 shrink-0 mt-4">
              <button 
                type="button"
                onClick={handleSaveAndApproveScenario}
                className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-emerald-700 shadow-md shadow-emerald-200/50 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 size={15} /> Save & Approve
              </button>
              <button 
                type="button"
                onClick={() => {
                  setScenariosToApproveAndSave([]);
                  setShowCreateFolderInline(false);
                  setInlineNewFolderName('');
                  setInlineFolderError(null);
                  setSelectedFolderIdForSave('');
                }} 
                className="py-3 px-4 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import User Stories Modal */}
      {isImportStoriesModalOpen && (
        <div className="fixed inset-0 z-[6000] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-white p-10 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-emerald-600 text-white rounded-[1.5rem] shadow-xl shadow-emerald-100">
                  <Folder size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Import From AI User Stories</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select stories from your story generator folders</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsImportStoriesModalOpen(false);
                  setSelectedImportStoryIds(new Set());
                  setSearchImportStoryQuery('');
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-all border border-slate-200 shadow-sm"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search and Selection summary */}
            <div className="py-6 space-y-4 shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text"
                  className="w-full pl-12 pr-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black outline-none focus:ring-4 ring-emerald-50/5 transition-all"
                  placeholder="Search user stories by summary, description, or acceptance criteria..."
                  value={searchImportStoryQuery || ''}
                  onChange={e => setSearchImportStoryQuery(e.target.value)}
                />
              </div>

              {selectedImportStoryIds.size > 0 && (
                <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-800 text-[10px] font-black uppercase tracking-widest">
                  <span>Selected {selectedImportStoryIds.size} story/stories to import</span>
                  <button 
                    onClick={() => setSelectedImportStoryIds(new Set())}
                    className="text-emerald-600 hover:text-emerald-800 underline uppercase tracking-widest cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-2 mb-6">
              {/* Folders Section */}
              {filteredImportStories.folders.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Folders ({filteredImportStories.folders.length})</h4>
                  <div className="space-y-3">
                    {filteredImportStories.folders.map(folder => {
                      const memberIds = folder.memberStoryIds || [];
                      const folderMembers = userStoriesList.filter(s => memberIds.includes(s.id));
                      const isExpanded = expandedImportFolders.has(folder.id);
                      const allSelected = memberIds.length > 0 && memberIds.every(id => selectedImportStoryIds.has(id));

                      return (
                        <div key={folder.id} className="border border-slate-100 rounded-[2rem] bg-white overflow-hidden shadow-sm hover:border-slate-200 transition-all">
                          {/* Folder Header */}
                          <div className="p-4 bg-slate-50/50 flex items-center justify-between gap-4">
                            <div 
                              className="flex items-center gap-3 cursor-pointer flex-1"
                              onClick={() => handleToggleExpandImportFolder(folder.id)}
                            >
                              <div className="text-slate-400">
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </div>
                              <Folder className="text-indigo-500 shrink-0" size={18} />
                              <div className="truncate">
                                <span className="text-xs font-black text-slate-800 uppercase tracking-tight break-all">{folder.summary}</span>
                                <span className="ml-2 text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{folderMembers.length} stories</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleImportFolder(folder.id, memberIds)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${allSelected ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                            >
                              {allSelected ? 'All Selected' : 'Select All'}
                            </button>
                          </div>

                          {/* Folder Stories List */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 divide-y divide-slate-50 p-2 bg-white max-h-60 overflow-y-auto">
                              {folderMembers.length === 0 ? (
                                <div className="p-4 text-center text-[10px] text-slate-400 italic">This folder is empty.</div>
                              ) : (
                                folderMembers.map(story => {
                                  const isChecked = selectedImportStoryIds.has(story.id);
                                  return (
                                    <div 
                                      key={story.id} 
                                      onClick={() => handleToggleImportStory(story.id)}
                                      className={`p-3 rounded-2xl flex items-start gap-3 transition-all cursor-pointer ${isChecked ? 'bg-emerald-50/30' : 'hover:bg-slate-50/50'}`}
                                    >
                                      <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                                        {isChecked && <Check size={10} strokeWidth={4} />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-slate-700 uppercase tracking-tight truncate">{story.summary}</span>
                                          {story.storyId && (
                                            <span className="text-[8px] font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{story.storyId}</span>
                                          )}
                                        </div>
                                        {story.description && story.description !== 'Organization folder' && (
                                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{story.description}</p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Individual Section */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Individual Stories ({filteredImportStories.individuals.length})</h4>
                {filteredImportStories.individuals.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 italic text-xs border border-dashed border-slate-200 rounded-[2rem] bg-slate-50/30">
                    No individual stories found.
                  </div>
                ) : (
                  <div className="border border-slate-100 rounded-[2rem] bg-white divide-y divide-slate-100 shadow-sm overflow-hidden max-h-60 overflow-y-auto">
                    {filteredImportStories.individuals.map(story => {
                      const isChecked = selectedImportStoryIds.has(story.id);
                      return (
                        <div 
                          key={story.id} 
                          onClick={() => handleToggleImportStory(story.id)}
                          className={`p-4 flex items-start gap-4 transition-all cursor-pointer ${isChecked ? 'bg-emerald-50/30' : 'hover:bg-slate-50/50'}`}
                        >
                          <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 ${isChecked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                            {isChecked && <Check size={12} strokeWidth={4} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate">{story.summary}</span>
                              {story.storyId && (
                                <span className="text-[8px] font-mono font-bold bg-slate-150 text-slate-500 px-1.5 py-0.5 rounded">{story.storyId}</span>
                              )}
                            </div>
                            {story.description && (
                              <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{story.description}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Absolute Empty State */}
              {filteredImportStories.folders.length === 0 && filteredImportStories.individuals.length === 0 && (
                <div className="py-16 text-center border border-dashed border-slate-200 rounded-[3rem] bg-slate-50/30">
                  <div className="w-16 h-16 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Folder size={28} />
                  </div>
                  <h5 className="text-sm font-black text-slate-600 uppercase tracking-tight">No user stories found</h5>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Generate or create user stories in the Story Generator page first.</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-6 border-t border-slate-100 flex gap-3 shrink-0">
              <button 
                onClick={handleImportStories}
                disabled={selectedImportStoryIds.size === 0}
                className="flex-1 py-4 bg-emerald-600 text-white disabled:opacity-50 disabled:pointer-events-none rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} /> Import Selected ({selectedImportStoryIds.size})
              </button>
              <button 
                onClick={() => {
                  setIsImportStoriesModalOpen(false);
                  setSelectedImportStoryIds(new Set());
                  setSearchImportStoryQuery('');
                }} 
                className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jira Import Modal component */}
      <JiraImportModal 
        isOpen={isJiraModalOpen} 
        onClose={() => setIsJiraModalOpen(false)} 
        project={project} 
        user={user} 
        onUpdateProject={onUpdateProject} 
      />

    </div>
  );
};

export default ScenarioGenerator;