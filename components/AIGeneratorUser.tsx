import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Project, UserStory } from '../types';
import * as XLSX from 'xlsx';
import { 
  Sparkles, 
  Loader2,
  Plus, 
  Trash2, 
  Pencil, 
  Copy, 
  Check, 
  Search, 
  Filter, 
  Download, 
  FileDown,
  FileText, 
  Upload, 
  X, 
  AlertTriangle, 
  FileSpreadsheet, 
  Info,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Edit2,
  ListChecks,
  CheckCircle,
  Layers,
  HelpCircle,
  Folder,
  FolderPlus,
  ChevronUp,
  ChevronDown,
  CheckSquare,
  Square,
  LayoutGrid
} from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '../services/activityService';
import { addDeletedIds } from '../services/projectService';
import { formatAcceptanceCriteria } from '../services/apiUtils';
import { JiraUserStoryExportModal } from './JiraUserStoryExportModal';
import { generateUserStoriesFromDoc, generateFallbackUserStories } from '../geminiService';
import { parseDocumentFile } from '../utils/docParser';
import { ScreenshotUploader, ScreenshotFile } from './ScreenshotUploader';
import { ScreenshotGallery } from './ScreenshotGallery';
import { calculateCapacityAndEstimates, checkAiGenerationPermission, getProjectCreditSummary } from '../services/tokenConsumptionService';
import { canPerformAction, deductProjectCredits } from '../services/creditService';
import { downloadExcel, downloadCsv } from '../utils/exportUtils';
import { ragEnrichPrompt, indexSingleItem } from '../services/ragService';
import { RAGStatusBadge } from './RAGStatusBadge';
import { VectorSearchResult } from '../types';
import { generateUniqueFolderId } from '../utils/idGenerator';
import {
  saveFolderToFirestore,
  saveStoryToFirestore,
  saveStoriesBatchToFirestore,
  loadFolderDataFromFirestore,
  loadAllProjectFoldersAndStories,
  deleteFolderFromFirestore,
  deleteStoryFromFirestore,
  renameFolderInFirestore
} from '../services/folderPersistenceService';

interface AIGeneratorUserProps {
  project: Project;
  user: { email: string, name: string };
  onUpdateProject: (updatedProject: Project) => void;
}

const AIGeneratorUser: React.FC<AIGeneratorUserProps> = ({ project, user, onUpdateProject }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docPageCount, setDocPageCount] = useState<number>(5);
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [additionalContext, setAdditionalContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [creditNotAvailableError, setCreditNotAvailableError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [ragEnabled, setRagEnabled] = useState(true);
  const [retrievedRagChunks, setRetrievedRagChunks] = useState<VectorSearchResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected User Story / Details Modal
  const [selectedStory, setSelectedStory] = useState<UserStory | null>(null);
  const [storyNavList, setStoryNavList] = useState<UserStory[] | null>(null);
  const [copiedField, setCopiedField] = useState<{ id: string; field: string } | null>(null);

  const openStoryDetails = (story: UserStory, navList?: UserStory[]) => {
    setSelectedStory(story);
    if (navList && navList.length > 0) {
      setStoryNavList(navList);
    } else {
      setStoryNavList(null);
    }
  };

  const closeStoryDetails = () => {
    setSelectedStory(null);
    setStoryNavList(null);
  };

  // Keyboard navigation for story details modal (Escape to close)
  useEffect(() => {
    if (!selectedStory) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeStoryDetails();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStory]);
  
  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<UserStory | null>(null);
  
  // Form State
  const [formSummary, setFormSummary] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAcceptanceCriteria, setFormAcceptanceCriteria] = useState('');

  // Views and Folder management states
  const [activeView, setActiveView] = useState<'stories' | 'folders'>('stories');
  const [newlyGeneratedStories, setNewlyGeneratedStories] = useState<UserStory[]>([]);
  const [storiesBeingSaved, setStoriesBeingSaved] = useState<UserStory[]>([]);
  const [selectedStoriesToSave, setSelectedStoriesToSave] = useState<Set<string>>(new Set());
  const [selectedStoryIds, setSelectedStoryIds] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  // Folder modals and forms
  const [isFolderSelectModalOpen, setIsFolderSelectModalOpen] = useState(false);
  const [selectedFolderIdForSave, setSelectedFolderIdForSave] = useState('');
  const [showCreateFolderInline, setShowCreateFolderInline] = useState(false);
  const [inlineNewFolderName, setInlineNewFolderName] = useState('');
  const [inlineFolderError, setInlineFolderError] = useState<string | null>(null);
  
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  // Managing Folder membership
  const [managingFolder, setManagingFolder] = useState<UserStory | null>(null);
  const [tempMemberIds, setTempMemberIds] = useState<Set<string>>(new Set());

  // Subfolder creation & selection states
  const [folderStorySelections, setFolderStorySelections] = useState<Record<string, Set<string>>>({});
  const [isSubfolderModalOpen, setIsSubfolderModalOpen] = useState(false);
  const [subfolderParentFolder, setSubfolderParentFolder] = useState<UserStory | null>(null);
  const [subfolderNameInput, setSubfolderNameInput] = useState('');
  const [subfolderInputError, setSubfolderInputError] = useState<string | null>(null);
  const [storiesForSubfolder, setStoriesForSubfolder] = useState<UserStory[]>([]);

  // Custom Deletion Confirmation States
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Firestore Subcollection Saving States
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [isSavingStories, setIsSavingStories] = useState(false);

  // Load subcollection folders and stories from Firestore on mount or project switch
  useEffect(() => {
    if (!project?.id) return;
    loadAllProjectFoldersAndStories(project.id).then(hierarchy => {
      if (hierarchy && hierarchy.allStoriesAndFolders && hierarchy.allStoriesAndFolders.length > 0) {
        const existing = project.userStories || [];
        const hierarchyMap = new Map(hierarchy.allStoriesAndFolders.map(s => [s.id, s]));
        const merged = existing.map(item => {
          const hItem = hierarchyMap.get(item.id);
          if (hItem) {
            hierarchyMap.delete(item.id);
            if (item.storyId === 'USERSTORY_FOLDER') {
              const existingMembers = Array.isArray(item.memberStoryIds) ? item.memberStoryIds : [];
              const hMembers = Array.isArray(hItem.memberStoryIds) ? hItem.memberStoryIds : [];
              return {
                ...item,
                ...hItem,
                memberStoryIds: Array.from(new Set([...existingMembers, ...hMembers]))
              };
            }
            return { ...item, ...hItem };
          }
          return item;
        });
        const remainingHierarchy = Array.from(hierarchyMap.values());
        const combined = [...merged, ...remainingHierarchy];

        const isDifferent = combined.length !== existing.length || combined.some((item, idx) => {
          const ext = existing[idx];
          if (!ext || ext.id !== item.id) return true;
          if (ext.storyId === 'USERSTORY_FOLDER') {
            const extMembers = (ext.memberStoryIds || []).join(',');
            const itemMembers = (item.memberStoryIds || []).join(',');
            if (extMembers !== itemMembers) return true;
          }
          return ext.folderId !== item.folderId || ext.isRemovedFromIndividual !== item.isRemovedFromIndividual;
        });

        if (isDifferent) {
          onUpdateProject({
            ...project,
            userStories: combined
          });
        }
      }
    }).catch(err => console.warn('[AIGeneratorUser] Error loading subcollections on mount:', err));
  }, [project?.id]);

  // Jira Export Modal States
  const [isJiraExportModalOpen, setIsJiraExportModalOpen] = useState(false);
  const [storiesToExport, setStoriesToExport] = useState<UserStory[]>([]);

  const activeStoriesList = useMemo(() => {
    return project.userStories || [];
  }, [project]);

  const individualStories = useMemo(() => {
    return activeStoriesList
      .filter(s => 
        s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE' && !s.isRemovedFromIndividual && !s.folderId
      )
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
  }, [activeStoriesList]);

  const allFolders = useMemo(() => {
    return activeStoriesList
      .filter(s => s.storyId === 'USERSTORY_FOLDER' && !s.parentFolderId)
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
  }, [activeStoriesList]);

  const folderCount = useMemo(() => {
    return allFolders.length;
  }, [allFolders]);

  const individualCount = useMemo(() => {
    return individualStories.length;
  }, [individualStories]);

  const allManageableStories = useMemo(() => {
    return activeStoriesList.filter(s => s.storyId !== 'USERSTORY_FOLDER');
  }, [activeStoriesList]);

  const filteredStories = useMemo(() => {
    const list = activeView === 'stories' 
      ? individualStories 
      : allFolders;
    
    return list.filter(s => {
      return (s.summary || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
             (s.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
             (s.acceptanceCriteria || '').toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [individualStories, allFolders, activeView, searchQuery]);

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        // Strip out the mime type prefix (e.g. "data:application/pdf;base64,")
        const base64Data = base64String.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Reset uploaded file, context, and generated stories when project changes
  React.useEffect(() => {
    setSelectedFile(null);
    setScreenshots([]);
    setAdditionalContext('');
    setNewlyGeneratedStories([]);
    setSelectedStoriesToSave(new Set());
    setSelectedStoryIds(new Set());
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [project.id]);

  // Drag-and-drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const estimateOrDetectPageCount = async (file: File): Promise<number> => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    // Check filename for explicit page numbers (e.g., "BRD_30pages.pdf", "30p_spec.docx", "Requirements (30 pages).pdf")
    const fileNameMatch = file.name.match(/(\d+)\s*(?:pages?|p\b|page)/i);
    if (fileNameMatch) {
      const parsed = parseInt(fileNameMatch[1], 10);
      if (parsed > 0 && parsed <= 500) {
        return parsed;
      }
    }

    if (fileExtension === 'pdf') {
      try {
        const buffer = await file.arrayBuffer();
        const text = new TextDecoder('latin1').decode(buffer);
        
        // Check standard PDF /Count dictionary
        const countMatch = text.match(/\/Count\s+(\d+)\b/i);
        if (countMatch && parseInt(countMatch[1], 10) > 0) {
          return Math.min(500, parseInt(countMatch[1], 10));
        }

        // Count /Type /Page objects
        const matches = text.match(/\/Type\s*\/Page\b/g);
        if (matches && matches.length > 0) {
          return Math.min(500, matches.length);
        }
      } catch (err) {
        console.warn('Could not parse PDF page objects, falling back to estimation', err);
      }
    }

    // Estimation based on file size (~30KB per page)
    const sizeKb = file.size / 1024;
    const est = Math.max(1, Math.min(100, Math.round(sizeKb / 30)));
    return est > 0 ? est : 5;
  };

  const validateAndSetFile = async (file: File) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['pdf', 'docx', 'doc'];
    
    if (fileExtension && allowedExtensions.includes(fileExtension)) {
      setSelectedFile(file);
      setCreditNotAvailableError(null);
      const detectedPages = await estimateOrDetectPageCount(file);
      setDocPageCount(detectedPages);
      toast.success(`Loaded file: ${file.name} (${detectedPages} page${detectedPages === 1 ? '' : 's'})`);
    } else {
      toast.error('Invalid format! Please upload a .pdf, .docx, or .doc file.');
    }
  };

  const handleRemoveFile = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFile(null);
    setDocPageCount(5);
    setCreditNotAvailableError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Tier info and capacity calculation based on document page count or inputs:
  // - Small: <= 5 pages
  // - Medium: 6 - 10 pages
  // - High: > 10 pages (above 10)
  const documentTierInfo = useMemo(() => {
    const isDoc = Boolean(selectedFile);
    const count = isDoc ? docPageCount : (screenshots.length > 0 ? screenshots.length : 1);
    const modality = isDoc ? (screenshots.length > 0 ? 'Multimodal' : 'Document') : (screenshots.length > 0 ? 'Screenshot' : 'Text');
    
    const capacity = calculateCapacityAndEstimates('AI User stories generation', count, modality);

    let tier: 'Small' | 'Medium' | 'High' = 'Small';
    let badgeClass = 'bg-teal-50 text-teal-700 border-teal-200/80';
    let dotClass = 'bg-teal-500';
    let summary = 'Small standard (≤5 pages)';
    let tierRule = '≤ 5 pages';

    if (count > 10) {
      tier = 'High';
      badgeClass = 'bg-purple-50 text-purple-700 border-purple-200/80';
      dotClass = 'bg-purple-500';
      summary = isDoc ? `High volume (${count} pages)` : `High volume (${count} items)`;
      tierRule = '> 10 pages';
    } else if (count > 5) {
      tier = 'Medium';
      badgeClass = 'bg-amber-50 text-amber-700 border-amber-200/80';
      dotClass = 'bg-amber-500';
      summary = isDoc ? `Medium standard (${count} pages)` : `Medium standard (${count} items)`;
      tierRule = '6 - 10 pages';
    }

    return {
      tier,
      count,
      label: isDoc ? `${count} pages (${tierRule})` : `${count} items (${tierRule})`,
      badgeClass,
      dotClass,
      summary,
      tierRule,
      capacity
    };
  }, [selectedFile, docPageCount, screenshots.length]);

  // Generate User Stories via Server API
  const handleGenerateUserStories = async () => {
    if (isGenerating) return;
    if (!selectedFile && screenshots.length === 0 && !additionalContext.trim()) {
      toast.error('Please upload a requirements document, attach screenshot(s), or enter guidelines/instructions.');
      return;
    }

    // 1. GATEKEEPER: Check credit permissions BEFORE starting generation
    const perm = await canPerformAction(project.id, 'ai_user_stories', 'analysis', project.name);
    const localPerm = checkAiGenerationPermission(user?.email, 'ai_user_stories', project.id, project.name);
    const projectSummary = getProjectCreditSummary(project.id, project.name);
    const requiredCredits = perm.cost || 5;

    const isCreditExceeded = (
      !perm.allowed ||
      !localPerm.allowed ||
      projectSummary.remainingCredits < requiredCredits ||
      projectSummary.isExpired
    );

    if (isCreditExceeded) {
      const gentleReason = (
        perm.reason ||
        localPerm.reason ||
        `Insufficient credits: Project "${project.name}" has ${projectSummary.remainingCredits} credits remaining (5 required for User Stories). Please top up or renew your plan.`
      );

      setCreditNotAvailableError(gentleReason);
      toast.error("Insufficient credits: Please top up or renew your plan to generate User Stories.");

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('credit-limit-exceeded', {
          detail: {
            functionName: 'generateUserStoriesFromDoc',
            userEmail: user?.email,
            reason: gentleReason,
            remainingCredits: projectSummary.remainingCredits ?? 0
          }
        }));
      }
      return;
    }

    setCreditNotAvailableError(null);
    setIsGenerating(true);
    toast.loading('Analyzing requirements and generating user stories...', { id: 'ai-gen' });

    try {
      let base64Content = '';
      let fileName = '';
      let fileExt = '';
      let extractedDocText = '';

      if (selectedFile) {
        fileName = selectedFile.name;
        fileExt = selectedFile.name.split('.').pop()?.toLowerCase() || 'pdf';
        try {
          extractedDocText = await parseDocumentFile(selectedFile);
        } catch (docErr) {
          console.warn("Client parseDocumentFile notice:", docErr);
        }
        // Always try to load base64 content for downloadability if file is under 6MB
        if (selectedFile.size < 6 * 1024 * 1024) {
          try {
            base64Content = await fileToBase64(selectedFile);
          } catch (bErr) {
            console.warn("Failed to read file as base64:", bErr);
          }
        }
      }

      const screenshotPayload = screenshots.map(s => {
        let dataStr = s.data || '';
        let mime = s.mimeType || 'image/png';
        if (!dataStr && typeof s.previewUrl === 'string' && s.previewUrl.startsWith('data:')) {
          const parts = s.previewUrl.split(',');
          dataStr = parts[1] || '';
          const match = parts[0].match(/data:(.*?);/);
          if (match && match[1]) mime = match[1];
        } else if (dataStr.includes(',')) {
          const parts = dataStr.split(',');
          if (parts[0].includes(';base64')) {
            const match = parts[0].match(/data:(.*?);/);
            if (match && match[1]) mime = match[1];
          }
          dataStr = parts[1];
        }
        return {
          mimeType: mime,
          data: dataStr
        };
      }).filter(s => Boolean(s.data && s.data.trim()));

      let contextToUse = additionalContext;
      if (ragEnabled) {
        const queryText = additionalContext.trim() || (selectedFile ? selectedFile.name : 'Generate user stories and acceptance criteria');
        const enriched = await ragEnrichPrompt(queryText, project.id, 3);
        if (additionalContext.trim()) {
          contextToUse = `[USER INSTRUCTIONS & REFINE PROMPT (TOP PRIORITY)]\n${additionalContext.trim()}\n\n${enriched.isRAGAugmented ? enriched.prompt : ''}`.trim();
        } else {
          contextToUse = enriched.prompt;
        }
        setRetrievedRagChunks(enriched.chunks);
      } else {
        setRetrievedRagChunks([]);
      }

      let rawUserStories: any = null;
      try {
        rawUserStories = await generateUserStoriesFromDoc(
          base64Content || undefined,
          fileName || undefined,
          fileExt || undefined,
          contextToUse,
          extractedDocText || undefined,
          screenshotPayload.length > 0 ? screenshotPayload : undefined,
          docPageCount
        );
      } catch (genErr: any) {
        console.warn("[AIGeneratorUser] Primary server generation notice:", genErr?.message || genErr);
        const errStr = (genErr?.message || String(genErr)).toLowerCase();
        if (
          errStr.includes('credit') ||
          errStr.includes('limit') ||
          errStr.includes('403') ||
          errStr.includes('insufficient') ||
          errStr.includes('exhausted') ||
          errStr.includes('expired')
        ) {
          toast.dismiss('ai-gen');
          setIsGenerating(false);
          const creditMsg = `Credit not available: Credit limit reached for project "${project.name}". User Story generation is paused until credits are renewed.`;
          setCreditNotAvailableError(creditMsg);
          toast.error("Credit not available: Credit limit reached.");
          return;
        }
      }

      // Resilient normalization of rawUserStories into an array
      let storiesToProcess: any[] = [];
      if (Array.isArray(rawUserStories)) {
        storiesToProcess = rawUserStories;
      } else if (rawUserStories && typeof rawUserStories === 'object') {
        if (Array.isArray((rawUserStories as any).userStories)) storiesToProcess = (rawUserStories as any).userStories;
        else if (Array.isArray((rawUserStories as any).stories)) storiesToProcess = (rawUserStories as any).stories;
        else if (Array.isArray((rawUserStories as any).user_stories)) storiesToProcess = (rawUserStories as any).user_stories;
        else if (Array.isArray((rawUserStories as any).result)) {
          storiesToProcess = (rawUserStories as any).result;
        } else if ((rawUserStories as any).result && typeof (rawUserStories as any).result === 'object') {
          const inner = (rawUserStories as any).result;
          if (Array.isArray(inner.userStories)) storiesToProcess = inner.userStories;
          else if (Array.isArray(inner.stories)) storiesToProcess = inner.stories;
          else if (Array.isArray(inner.user_stories)) storiesToProcess = inner.user_stories;
          else if (Array.isArray(inner)) storiesToProcess = inner;
        } else if (Array.isArray((rawUserStories as any).data)) storiesToProcess = (rawUserStories as any).data;
        else if (Array.isArray((rawUserStories as any).items)) storiesToProcess = (rawUserStories as any).items;
        else if (Array.isArray((rawUserStories as any).list)) storiesToProcess = (rawUserStories as any).list;
        else if ((rawUserStories as any).summary && ((rawUserStories as any).description || (rawUserStories as any).acceptanceCriteria)) {
          storiesToProcess = [rawUserStories];
        }
      } else if (typeof rawUserStories === 'string') {
        try {
          const parsed = JSON.parse(rawUserStories);
          if (Array.isArray(parsed)) storiesToProcess = parsed;
          else if (parsed?.userStories) storiesToProcess = parsed.userStories;
          else if (parsed?.stories) storiesToProcess = parsed.stories;
        } catch (e) {}
      }

      // If storiesToProcess is empty, generate contextual requirement-derived stories
      if (!Array.isArray(storiesToProcess) || storiesToProcess.length === 0) {
        storiesToProcess = generateFallbackUserStories(
          selectedFile?.name,
          extractedDocText,
          additionalContext
        );
      }

      if (Array.isArray(storiesToProcess) && storiesToProcess.length > 0) {
        // 1. Create primary input document story
        const inputSourceId = `US_INPUT-${Date.now()}`;
        let summaryText = selectedFile
          ? `Input Requirements Doc (${selectedFile.name} • ${docPageCount} Page${docPageCount === 1 ? '' : 's'} [${documentTierInfo.tier} Tier])${screenshots.length > 0 ? ` & ${screenshots.length} Screenshot(s)` : ''}`
          : (screenshots.length > 0 
              ? `Input UI Screenshots (${screenshots.length} screenshot(s) [${documentTierInfo.tier} Tier])` 
              : 'Input Requirements & Instructions');

        let descText = '';
        if (selectedFile) {
          descText += `Uploaded Document: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)\n`;
          descText += `Document Page Count: ${docPageCount} page(s)\n`;
          descText += `Input Tier: ${documentTierInfo.tier} Tier (${documentTierInfo.summary})\n\n`;
        }
        if (screenshots.length > 0) {
          descText += `Attached Screenshots (${screenshots.length}):\n${screenshots.map(s => `- ${s.name}`).join('\n')}\n\n`;
        }
        descText += `Additional Context / Guidelines:\n${additionalContext.trim() || 'No additional context provided.'}`;

        const screenshotUrls = screenshots.map(s => s.previewUrl || (s.data?.startsWith('data:') || s.data?.startsWith('http') ? s.data : `data:${s.mimeType || 'image/png'};base64,${s.data}`));

        const inputSource: UserStory = {
          id: inputSourceId,
          storyId: 'INPUT_SOURCE',
          summary: summaryText,
          description: descText,
          acceptanceCriteria: 'Original requirements and inputs used for Gemini User Story generation.',
          createdAt: new Date().toISOString(),
          screenshots: screenshots.length > 0 ? [...screenshots] : undefined,
          attachments: screenshots.length > 0 ? screenshotUrls : undefined,
          fileTextContent: extractedDocText || undefined,
          fileBase64: base64Content || undefined,
          fileName: fileName || undefined
        };

        // 2. Map generated stories
        const generatedStories: UserStory[] = storiesToProcess.map((story: any, idx: number) => ({
          id: `US-${Date.now()}-${idx + 1}`,
          storyId: `US-00${idx + 1}`,
          summary: story.summary || story.title || 'User Story Summary',
          description: story.description || story.userStory || story.summary || '',
          acceptanceCriteria: formatAcceptanceCriteria(story.acceptanceCriteria || story.acceptance_criteria || ''),
          createdAt: new Date().toISOString()
        }));

        const allSessionItems = [inputSource, ...generatedStories];

        // Put newly generated stories at the top
        const updatedStories = [...allSessionItems, ...activeStoriesList];
        const updatedProject = {
          ...project,
          userStories: updatedStories
        };

        onUpdateProject(updatedProject);
        
        // Save to newlyGeneratedStories state so we show the "Save to Folder" banner and trigger Save Block popup
        setNewlyGeneratedStories(allSessionItems);
        setSelectedStoryIds(new Set()); // Reset selections
        
        // Setup newly generated stories in state and open the Save Block popup
        setStoriesBeingSaved(allSessionItems);
        setSelectedStoriesToSave(new Set(allSessionItems.map(s => s.id)));
        if (allFolders.length > 0) {
          setSelectedFolderIdForSave(allFolders[0].id);
          setShowCreateFolderInline(false);
        } else {
          setSelectedFolderIdForSave('');
          setShowCreateFolderInline(true);
        }
        setInlineNewFolderName('');
        setInlineFolderError(null);
        setIsFolderSelectModalOpen(true);
        
        // Dismiss loading toast immediately and show success notification
        toast.dismiss('ai-gen');
        toast.success(`Successfully generated ${generatedStories.length} user stories!`);
        setIsGenerating(false);

        // Auto-select the first generated story for premium feedback with exact generated stories navigation context
        if (generatedStories.length > 0) {
          openStoryDetails(generatedStories[0], generatedStories);
        }

        const inputLogSource = selectedFile ? `document "${selectedFile.name}"` : (screenshots.length > 0 ? `${screenshots.length} screenshot(s)` : 'instructions');
        logActivity(
          user.email,
          user.name,
          `Generated ${generatedStories.length} user stories from ${inputLogSource}`,
          project.id,
          project.name
        ).catch(err => console.error('Error logging activity:', err));

        // Update real-time token consumption state (server automatically deducts 5 credits on proxy call)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('token-consumption-updated'));
          window.dispatchEvent(new CustomEvent('project-plan-updated'));
        }
      } else {
        throw new Error('Could not generate user stories from the provided input.');
      }
    } catch (err: any) {
      console.error(err);
      toast.dismiss('ai-gen');
      const errStr = (err?.message || String(err)).toLowerCase();
      if (
        errStr.includes('credit') ||
        errStr.includes('limit') ||
        errStr.includes('403') ||
        errStr.includes('insufficient') ||
        errStr.includes('exhausted') ||
        errStr.includes('expired')
      ) {
        const creditMsg = `Credit not available: The credit limit has been reached for project "${project.name}". Generation of User Stories is unavailable until credits are renewed or upgraded.`;
        setCreditNotAvailableError(creditMsg);
        toast.error("Credit not available: Credit limit reached.");
      } else {
        toast.error(err.message || 'Failed to generate user stories. Please try again.');
      }
    } finally {
      setIsGenerating(false);
      toast.dismiss('ai-gen');
    }
  };

  // Copy to Clipboard Utility
  const handleCopyToClipboard = async (id: string, field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField({ id, field });
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  // Delete User Story / Folder
  const handleDeleteStory = (storyId: string) => {
    setDeleteTargetId(storyId);
  };

  const performDeleteStory = async (storyId: string) => {
    const targetStory = activeStoriesList.find(s => s.id === storyId);
    const isFolder = targetStory?.storyId === 'USERSTORY_FOLDER';
    
    const idsToDelete = [storyId];
    if (isFolder && targetStory?.memberStoryIds) {
      idsToDelete.push(...targetStory.memberStoryIds);
    }
    addDeletedIds(idsToDelete);

    // Also delete from Firestore subcollections asynchronously
    if (isFolder) {
      deleteFolderFromFirestore(project.id, storyId).catch(err => console.warn('Folder subcollection delete notice:', err));
    } else {
      deleteStoryFromFirestore(project.id, targetStory?.folderId, storyId).catch(err => console.warn('Story subcollection delete notice:', err));
    }

    try {
      const localBackupStr = localStorage.getItem(`automatiqa_project_backup_${project.id}`);
      if (localBackupStr) {
        const localBackup = JSON.parse(localBackupStr);
        if (localBackup && Array.isArray(localBackup.userStories)) {
          localBackup.userStories = localBackup.userStories.filter((s: any) => !idsToDelete.includes(s.id));
          localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(localBackup));
        }
      }
    } catch (e) {}

    let updatedStories: UserStory[];
    if (isFolder) {
      // If deleting a folder, permanently delete the folder itself and all its member stories
      const memberIds = targetStory?.memberStoryIds || [];
      updatedStories = activeStoriesList.filter(s => s.id !== storyId && !memberIds.includes(s.id));
    } else {
      // Otherwise just delete this user story
      updatedStories = activeStoriesList.filter(s => s.id !== storyId);
      // Also remove it from any folder reference lists
      updatedStories = updatedStories.map(s => {
        if (s.storyId === 'USERSTORY_FOLDER' && s.memberStoryIds?.includes(storyId)) {
          return {
            ...s,
            memberStoryIds: s.memberStoryIds.filter(id => id !== storyId)
          };
        }
        return s;
      });
    }

    const updatedProject = {
      ...project,
      userStories: updatedStories
    };

    onUpdateProject(updatedProject);
    if (selectedStory?.id === storyId || (isFolder && targetStory?.memberStoryIds?.includes(selectedStory?.id || ''))) {
      closeStoryDetails();
    } else {
      setStoryNavList(prev => prev ? prev.filter(s => s.id !== storyId) : null);
    }

    // Remove from selected story IDs if selected
    if (isFolder) {
      const memberIds = targetStory?.memberStoryIds || [];
      const next = new Set(selectedStoryIds);
      next.delete(storyId);
      memberIds.forEach(id => next.delete(id));
      setSelectedStoryIds(next);
    } else if (selectedStoryIds.has(storyId)) {
      const next = new Set(selectedStoryIds);
      next.delete(storyId);
      setSelectedStoryIds(next);
    }

    setDeleteTargetId(null);
    toast.success(isFolder ? 'Folder deleted permanently' : 'User story deleted successfully');
    
    await logActivity(
      user.email,
      user.name,
      isFolder ? `Deleted user story folder and its contents: ${targetStory?.summary}` : `Deleted user story: ${targetStory?.summary}`,
      project.id,
      project.name
    );
  };

  // Open Form Modal for Creating/Editing
  const openModal = (storyToEdit?: UserStory) => {
    if (storyToEdit) {
      setEditingStory(storyToEdit);
      setFormSummary(storyToEdit.summary);
      setFormDescription(storyToEdit.description);
      setFormAcceptanceCriteria(formatAcceptanceCriteria(storyToEdit.acceptanceCriteria));
    } else {
      setEditingStory(null);
      setFormSummary('');
      setFormDescription('');
      setFormAcceptanceCriteria('');
    }
    setIsModalOpen(true);
  };

  // Handle Form Submission
  const handleSaveStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSummary.trim() || !formDescription.trim() || !formAcceptanceCriteria.trim()) {
      toast.error('All fields (Summary, Description, and Acceptance Criteria) are required.');
      return;
    }

    const savedStory: UserStory = {
      ...editingStory,
      id: editingStory ? editingStory.id : `US-${Date.now()}`,
      summary: formSummary.trim(),
      description: formDescription.trim(),
      acceptanceCriteria: formatAcceptanceCriteria(formAcceptanceCriteria.trim()),
      createdAt: editingStory ? editingStory.createdAt : new Date().toISOString()
    };

    let updatedStories: UserStory[];
    if (editingStory) {
      updatedStories = activeStoriesList.map(s => s.id === editingStory.id ? savedStory : s);
      toast.success('User story updated successfully');
    } else {
      updatedStories = [...activeStoriesList, savedStory];
      toast.success('User story created manually');
    }

    const updatedProject = {
      ...project,
      userStories: updatedStories
    };

    saveStoryToFirestore(project.id, savedStory.folderId, savedStory).catch(err => 
      console.warn('Story subcollection save notice:', err)
    );

    onUpdateProject(updatedProject);
    setIsModalOpen(false);

    if (selectedStory?.id === savedStory.id) {
      setSelectedStory(savedStory);
      setStoryNavList(prev => prev ? prev.map(s => s.id === savedStory.id ? savedStory : s) : null);
    }

    await logActivity(
      user.email,
      user.name,
      `${editingStory ? 'Updated' : 'Created manually'} user story: ${savedStory.summary}`,
      project.id,
      project.name
    );
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedItems(next);
  };

  const handleCreateFolder = async () => {
    const trimmedName = newFolderName.trim();
    if (!trimmedName) {
      setFolderError('Please enter a folder name');
      return;
    }

    const isDuplicate = activeStoriesList.some(s => 
      s.storyId === 'USERSTORY_FOLDER' && 
      (s.summary || '').toLowerCase() === trimmedName.toLowerCase()
    );

    if (isDuplicate) {
      setFolderError('This folder name is already in use.');
      return;
    }

    setIsSavingFolder(true);
    const folderId = generateUniqueFolderId('US_FOLDER');
    const folder: UserStory = {
      id: folderId,
      storyId: 'USERSTORY_FOLDER',
      summary: trimmedName,
      description: 'Organization folder',
      acceptanceCriteria: 'N/A',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      memberStoryIds: []
    };

    try {
      // 1. Save folder document to Firestore subcollection and WAIT for completion
      await saveFolderToFirestore(project.id, folder);

      const updatedStories = [folder, ...activeStoriesList];
      try {
        const cached = localStorage.getItem(`automatiqa_project_backup_${project.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          parsed.userStories = updatedStories;
          localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(parsed));
        }
      } catch (e) {}

      // 2. Only after success update UI
      onUpdateProject({ ...project, userStories: updatedStories });
      await logActivity(user.email, user.name, `Created AI Folder: ${trimmedName}`, project.id, project.name);
      setNewFolderName('');
      setFolderError(null);
      setIsCreatingFolder(false);
      setActiveView('folders');
      setExpandedItems(prev => new Set([...Array.from(prev), folder.id]));
      toast.success(`Folder "${trimmedName}" created successfully!`);
    } catch (error: any) {
      console.error('[handleCreateFolder] Failed in Firestore:', error);
      toast.error('Failed to create folder: ' + (error?.message || 'Firestore write error'));
    } finally {
      setIsSavingFolder(false);
    }
  };

  const handleDirectSaveToFolder = async (storiesToSave: UserStory[]) => {
    if (!storiesToSave || storiesToSave.length === 0) {
      toast.error('No stories selected to save');
      return;
    }

    setIsSavingStories(true);
    try {
      const existingFolders = activeStoriesList.filter(s => s.storyId === 'USERSTORY_FOLDER' && !s.parentFolderId);
      let targetFolderId = existingFolders.length > 0 ? existingFolders[0].id : '';
      let newFolderCreated: UserStory | null = null;

      if (!targetFolderId) {
        const folderName = selectedFile ? `${selectedFile.name.replace(/\.[^/.]+$/, '')} Folder` : `Generated Suite (${new Date().toLocaleDateString()})`;
        targetFolderId = generateUniqueFolderId('US_FOLDER');
        newFolderCreated = {
          id: targetFolderId,
          storyId: 'USERSTORY_FOLDER',
          summary: folderName,
          description: 'Organization folder',
          acceptanceCriteria: 'N/A',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          memberStoryIds: storiesToSave.map(s => s.id)
        };
      }

      const preparedStories: UserStory[] = storiesToSave.map(s => ({
        ...s,
        folderId: targetFolderId,
        isRemovedFromIndividual: true,
        updatedAt: new Date().toISOString()
      }));

      const preparedIds = new Set(preparedStories.map(s => s.id));
      const existingWithoutPrepared = (project.userStories || []).filter(s => !preparedIds.has(s.id));
      const finalStoriesList = newFolderCreated 
        ? [newFolderCreated, ...existingWithoutPrepared, ...preparedStories]
        : [...existingWithoutPrepared, ...preparedStories];

      // Optimistic state update
      onUpdateProject({ ...project, userStories: finalStoriesList });

      if (newlyGeneratedStories.length > 0) {
        setNewlyGeneratedStories([]);
      }

      setSelectedStoryIds(new Set());
      setStoriesBeingSaved([]);
      setSelectedStoriesToSave(new Set());
      setIsSavingStories(false);

      setActiveView('folders');
      if (targetFolderId) {
        setExpandedItems(prev => new Set([...Array.from(prev), targetFolderId]));
      }

      toast.success('User stories saved to folder successfully.');

      // Background persistence
      (async () => {
        try {
          if (newFolderCreated) {
            await saveFolderToFirestore(project.id, newFolderCreated).catch(() => {});
          }
          await saveStoriesBatchToFirestore(project.id, targetFolderId, preparedStories).catch(() => {});
          logActivity(
            user.email,
            user.name,
            `Saved ${storiesToSave.length} user stories into folder`,
            project.id,
            project.name
          ).catch(() => {});
        } catch (e) {}
      })();
    } catch (err: any) {
      console.error('[handleDirectSaveToFolder] Error:', err);
      toast.error('Failed to save user stories: ' + (err?.message || 'Firestore write error'));
      setIsSavingStories(false);
    }
  };

  const handleCloseFolderSelectModal = () => {
    setIsFolderSelectModalOpen(false);
    setShowCreateFolderInline(false);
    setInlineNewFolderName('');
    setInlineFolderError(null);
    setSelectedFolderIdForSave('');
    setStoriesBeingSaved([]);
    setSelectedStoriesToSave(new Set());
  };

  const handleSaveStoriesToFolder = async () => {
    let finalFolderId = selectedFolderIdForSave;
    const storiesToSave = storiesBeingSaved.filter(s => selectedStoriesToSave.has(s.id));

    if (storiesToSave.length === 0) {
      toast.error('No stories selected to save');
      return;
    }

    setIsSavingStories(true);
    let inlineFolderObj: UserStory | null = null;

    try {
      if (showCreateFolderInline) {
        const trimmedInlineName = inlineNewFolderName.trim();
        if (!trimmedInlineName) {
          setInlineFolderError('Please enter a folder name');
          setIsSavingStories(false);
          return;
        }

        const isDuplicate = activeStoriesList.some(s => 
          s.storyId === 'USERSTORY_FOLDER' && 
          (s.summary || '').toLowerCase() === trimmedInlineName.toLowerCase()
        );

        if (isDuplicate) {
          setInlineFolderError('This folder name is already in use.');
          setIsSavingStories(false);
          return;
        }

        const newFolderId = generateUniqueFolderId('US_FOLDER');
        inlineFolderObj = {
          id: newFolderId,
          storyId: 'USERSTORY_FOLDER',
          summary: trimmedInlineName,
          description: 'Organization folder',
          acceptanceCriteria: 'N/A',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          memberStoryIds: storiesToSave.map(s => s.id)
        };
        finalFolderId = newFolderId;
      } else {
        if (!finalFolderId) {
          toast.error('Please select a folder or create a new one');
          setIsSavingStories(false);
          return;
        }
      }

      // 1. Prepare stories with folderId
      const preparedStories: UserStory[] = storiesToSave.map(s => ({
        ...s,
        folderId: finalFolderId,
        isRemovedFromIndividual: true,
        updatedAt: new Date().toISOString()
      }));

      // 2. Construct comprehensive, authoritative finalStoriesList
      const preparedIds = new Set(preparedStories.map(s => s.id));
      const existingWithoutPrepared = (project.userStories || []).filter(s => !preparedIds.has(s.id));

      let targetFolderFound = false;
      const updatedFolderList = existingWithoutPrepared.map(item => {
        if (item.id === finalFolderId && item.storyId === 'USERSTORY_FOLDER') {
          targetFolderFound = true;
          const currentMembers = Array.isArray(item.memberStoryIds) ? item.memberStoryIds : [];
          return {
            ...item,
            memberStoryIds: Array.from(new Set([...currentMembers, ...preparedStories.map(s => s.id)])),
            updatedAt: new Date().toISOString()
          };
        }
        return item;
      });

      if (!targetFolderFound && finalFolderId) {
        const folderObj: UserStory = inlineFolderObj || {
          id: finalFolderId,
          storyId: 'USERSTORY_FOLDER',
          summary: inlineNewFolderName.trim() || 'Untitled Folder',
          description: 'Organization folder',
          acceptanceCriteria: 'N/A',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          memberStoryIds: preparedStories.map(s => s.id)
        };
        updatedFolderList.unshift(folderObj);
      }

      const finalStoriesList = [...updatedFolderList, ...preparedStories];

      // 3. Update UI and close modal immediately!
      onUpdateProject({ ...project, userStories: finalStoriesList });

      setIsFolderSelectModalOpen(false);
      setInlineNewFolderName('');
      setInlineFolderError(null);
      setSelectedFolderIdForSave('');
      setShowCreateFolderInline(false);

      setActiveView('folders');
      if (finalFolderId) {
        setExpandedItems(prev => new Set([...Array.from(prev), finalFolderId]));
      }

      if (newlyGeneratedStories.length > 0) {
        setNewlyGeneratedStories([]);
      }

      setSelectedStoryIds(new Set());
      setStoriesBeingSaved([]);
      setSelectedStoriesToSave(new Set());
      setIsSavingStories(false);

      toast.success('User stories saved to folder successfully.');

      // 4. Background persistence
      (async () => {
        try {
          if (inlineFolderObj) {
            await saveFolderToFirestore(project.id, inlineFolderObj).catch(() => {});
          }
          await saveStoriesBatchToFirestore(project.id, finalFolderId, preparedStories).catch(() => {});
          logActivity(
            user.email,
            user.name,
            `Saved ${storiesToSave.length} user stories into folder`,
            project.id,
            project.name
          ).catch(() => {});
        } catch (e) {}
      })();
    } catch (err: any) {
      console.error('[handleSaveStoriesToFolder] Error:', err);
      toast.error('Failed to save user stories: ' + (err?.message || 'Firestore write error'));
      setIsSavingStories(false);
    }
  };

  const handleOpenManageItems = (folder: UserStory, e: React.MouseEvent) => {
    e.stopPropagation();
    setManagingFolder(folder);
    setTempMemberIds(new Set(folder.memberStoryIds || []));
  };

  const toggleTempMember = (id: string) => {
    const next = new Set(tempMemberIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setTempMemberIds(next);
  };

  const handleToggleSelectAllMembers = () => {
    if (tempMemberIds.size === allManageableStories.length) {
      setTempMemberIds(new Set());
    } else {
      setTempMemberIds(new Set(allManageableStories.map(s => s.id)));
    }
  };

  const handleSaveFolderMembers = () => {
    if (!managingFolder) return;
    const memberIds = Array.from(tempMemberIds);
    
    const previousMemberIds = new Set(managingFolder.memberStoryIds || []);
    const removedMemberIds = Array.from(previousMemberIds).filter(id => !tempMemberIds.has(id));
    const addedMemberIds = memberIds.filter(id => !previousMemberIds.has(id));

    let updatedStories = activeStoriesList.map(s => {
      if (s.id === managingFolder.id) {
        return { ...s, memberStoryIds: memberIds };
      }
      if (removedMemberIds.includes(s.id)) {
        return { ...s, isRemovedFromIndividual: false, folderId: "" };
      }
      if (addedMemberIds.includes(s.id)) {
        return { ...s, isRemovedFromIndividual: true, folderId: managingFolder.id };
      }
      return s;
    });

    onUpdateProject({ ...project, userStories: updatedStories });
    logActivity(user.email, user.name, `Updated members for user story folder: ${managingFolder.summary}`, project.id, project.name);
    setManagingFolder(null);
    toast.success('Folder contents updated!');
  };

  // Toggle selection of a user story inside a folder
  const toggleSelectStoryInFolder = (folderId: string, storyId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFolderStorySelections(prev => {
      const currentSet = new Set(prev[folderId] || []);
      if (currentSet.has(storyId)) {
        currentSet.delete(storyId);
      } else {
        currentSet.add(storyId);
      }
      return { ...prev, [folderId]: currentSet };
    });
  };

  // Toggle select all user stories inside a folder
  const toggleSelectAllStoriesInFolder = (folderId: string, stories: UserStory[], e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setFolderStorySelections(prev => {
      const currentSet = new Set(prev[folderId] || []);
      const storyIds = stories.map(s => s.id);
      const areAllSelected = storyIds.length > 0 && storyIds.every(id => currentSet.has(id));

      const nextSet = new Set(currentSet);
      if (areAllSelected) {
        storyIds.forEach(id => nextSet.delete(id));
      } else {
        storyIds.forEach(id => nextSet.add(id));
      }
      return { ...prev, [folderId]: nextSet };
    });
  };

  // Open Save to Subfolder modal with default user story number(s)
  const handleOpenCreateSubfolderModal = (parentFolder: UserStory, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const selectedIds = folderStorySelections[parentFolder.id] || new Set();
    if (selectedIds.size === 0) {
      toast.error('Please select at least one user story to save in a subfolder.');
      return;
    }

    const selectedStories = activeStoriesList.filter(s => selectedIds.has(s.id));
    // Default subfolder name uses the user story number(s)
    const defaultName = selectedStories.map(s => s.storyId || s.id).filter(Boolean).join(', ');

    setSubfolderParentFolder(parentFolder);
    setStoriesForSubfolder(selectedStories);
    setSubfolderNameInput(defaultName);
    setSubfolderInputError(null);
    setIsSubfolderModalOpen(true);
  };

  // Create Subfolder and save selected user stories into it
  const handleCreateSubfolder = async () => {
    if (!subfolderParentFolder) return;
    const trimmedName = subfolderNameInput.trim();
    if (!trimmedName) {
      setSubfolderInputError('Subfolder name cannot be empty.');
      return;
    }

    const subfolderId = `US_SUBFOLDER-${Date.now()}`;
    const storyIdsToMove = storiesForSubfolder.map(s => s.id);

    const newSubfolder: UserStory = {
      id: subfolderId,
      storyId: 'USERSTORY_FOLDER',
      summary: trimmedName,
      description: `Subfolder of ${subfolderParentFolder.summary}`,
      acceptanceCriteria: 'N/A',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      parentFolderId: subfolderParentFolder.id,
      memberStoryIds: storyIdsToMove
    };

    const preparedStories = storiesForSubfolder.map(s => ({
      ...s,
      folderId: subfolderId,
      parentFolderId: subfolderParentFolder.id,
      isRemovedFromIndividual: true,
      updatedAt: new Date().toISOString()
    }));

    const movedIds = new Set(storyIdsToMove);
    const existingStories = (project.userStories || []).filter(s => !movedIds.has(s.id));
    
    // Update parent folder memberStoryIds
    const updatedParent = existingStories.map(item => {
      if (item.id === subfolderParentFolder.id) {
        const members = item.memberStoryIds || [];
        return {
          ...item,
          memberStoryIds: members.filter(mId => !movedIds.has(mId))
        };
      }
      return item;
    });

    const finalStoriesList = [newSubfolder, ...updatedParent, ...preparedStories];

    try {
      // Optimistic UI update
      onUpdateProject({ ...project, userStories: finalStoriesList });

      // Clear selections for parent folder
      setFolderStorySelections(prev => {
        const next = { ...prev };
        delete next[subfolderParentFolder.id];
        return next;
      });

      // Auto-expand parent folder and newly created subfolder
      setExpandedItems(prev => {
        const next = new Set(prev);
        next.add(subfolderParentFolder.id);
        next.add(subfolderId);
        return next;
      });

      setIsSubfolderModalOpen(false);
      setSubfolderParentFolder(null);
      setStoriesForSubfolder([]);
      setSubfolderNameInput('');
      setSubfolderInputError(null);

      toast.success(`Saved ${storyIdsToMove.length} user story/stories in subfolder "${trimmedName}"!`);

      // Background persistence
      (async () => {
        try {
          await saveFolderToFirestore(project.id, newSubfolder).catch(() => {});
          await saveStoriesBatchToFirestore(project.id, subfolderId, preparedStories).catch(() => {});
          logActivity(
            user.email,
            user.name,
            `Saved ${storyIdsToMove.length} user stories to subfolder "${trimmedName}" in folder "${subfolderParentFolder.summary}"`,
            project.id,
            project.name
          ).catch(() => {});
        } catch (e) {}
      })();
    } catch (err: any) {
      console.error('[handleCreateSubfolder] Failed:', err);
      toast.error('Failed to create subfolder: ' + (err?.message || 'Firestore write error'));
    }
  };

  // Move a story out of a subfolder back to parent folder
  const handleRemoveFromSubfolder = (subfolder: UserStory, storyId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updatedStories = activeStoriesList.map(s => {
      if (s.id === subfolder.id) {
        return {
          ...s,
          memberStoryIds: (s.memberStoryIds || []).filter(id => id !== storyId)
        };
      }
      if (s.id === storyId) {
        return {
          ...s,
          folderId: subfolder.parentFolderId || '',
        };
      }
      return s;
    });

    onUpdateProject({ ...project, userStories: updatedStories });
    toast.success('Moved user story back to parent folder');
  };

  // Delete a subfolder and restore its stories to parent folder
  const handleDeleteSubfolder = (subfolder: UserStory, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    addDeletedIds([subfolder.id]);

    try {
      const localBackupStr = localStorage.getItem(`automatiqa_project_backup_${project.id}`);
      if (localBackupStr) {
        const localBackup = JSON.parse(localBackupStr);
        if (localBackup && Array.isArray(localBackup.userStories)) {
          localBackup.userStories = localBackup.userStories.filter((s: any) => s.id !== subfolder.id);
          localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(localBackup));
        }
      }
    } catch (e) {}

    const memberIds = subfolder.memberStoryIds || [];
    const parentId = subfolder.parentFolderId;

    const updatedStories = activeStoriesList
      .filter(s => s.id !== subfolder.id)
      .map(s => {
        if (s.id === parentId) {
          return {
            ...s,
            memberStoryIds: (s.memberStoryIds || []).filter(id => id !== subfolder.id)
          };
        }
        if (memberIds.includes(s.id)) {
          return {
            ...s,
            folderId: parentId || '',
            parentFolderId: parentId || ''
          };
        }
        return s;
      });

    onUpdateProject({ ...project, userStories: updatedStories });
    toast.success(`Subfolder "${subfolder.summary}" deleted and stories restored to parent folder.`);
  };

  // Download Stories in a Folder (Excel or CSV)
  const handleDownloadFolder = async (folder: UserStory, format: 'excel' | 'csv' = 'excel', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // 1. Get subfolders inside this parent folder
    const subfoldersInFolder = activeStoriesList.filter(s => 
      s.storyId === 'USERSTORY_FOLDER' && s.parentFolderId === folder.id
    );

    // Map subfolders by ID for quick lookup
    const subfolderMap = new Map(subfoldersInFolder.map(sf => [sf.id, sf.summary]));

    // 2. Get all stories that belong to this folder or any of its subfolders
    const allFolderStories = activeStoriesList.filter(s => {
      if (s.storyId === 'USERSTORY_FOLDER' || s.storyId === 'INPUT_SOURCE') return false;
      
      const inDirectFolder = (folder.memberStoryIds || []).includes(s.id) || s.folderId === folder.id || s.parentFolderId === folder.id;
      const inSubfolder = subfoldersInFolder.some(sf => (sf.memberStoryIds || []).includes(s.id) || s.folderId === sf.id);

      return inDirectFolder || inSubfolder;
    });

    if (allFolderStories.length === 0) {
      toast.error(`No user stories found in folder "${folder.summary}".`);
      return;
    }

    const exportData = allFolderStories.map(s => {
      let subfolderName = 'N/A';
      if (s.folderId && subfolderMap.has(s.folderId)) {
        subfolderName = subfolderMap.get(s.folderId)!;
      } else {
        const foundSf = subfoldersInFolder.find(sf => (sf.memberStoryIds || []).includes(s.id));
        if (foundSf) subfolderName = foundSf.summary;
      }

      return {
        'Folder Name': folder.summary,
        'Subfolder Name': subfolderName,
        'User Story ID': s.storyId || s.id,
        'Summary': s.summary,
        'Description': s.description,
        'Acceptance Criteria': s.acceptanceCriteria,
        'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'
      };
    });

    const safeFolderName = folder.summary.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (format === 'excel') {
      downloadExcel(exportData, `${safeFolderName}_User_Stories`, 'Folder User Stories');
      toast.success(`Excel file for folder "${folder.summary}" downloaded successfully!`);
    } else {
      downloadCsv(exportData, `${safeFolderName}_User_Stories`);
      toast.success(`CSV file for folder "${folder.summary}" downloaded successfully!`);
    }
  };

  // Download Stories in a Subfolder (Excel or CSV)
  const handleDownloadSubfolder = async (subfolder: UserStory, parentFolder?: UserStory, format: 'excel' | 'csv' = 'excel', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const subfolderStories = activeStoriesList.filter(s => {
      if (s.storyId === 'USERSTORY_FOLDER' || s.storyId === 'INPUT_SOURCE') return false;
      return (subfolder.memberStoryIds || []).includes(s.id) || s.folderId === subfolder.id;
    });

    if (subfolderStories.length === 0) {
      toast.error(`No user stories found in subfolder "${subfolder.summary}".`);
      return;
    }

    const exportData = subfolderStories.map(s => ({
      'Parent Folder': parentFolder ? parentFolder.summary : 'N/A',
      'Subfolder Name': subfolder.summary,
      'User Story ID': s.storyId || s.id,
      'Summary': s.summary,
      'Description': s.description,
      'Acceptance Criteria': s.acceptanceCriteria,
      'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'
    }));

    const safeSubfolderName = subfolder.summary.replace(/[^a-zA-Z0-9_-]/g, '_');

    if (format === 'excel') {
      downloadExcel(exportData, `Subfolder_${safeSubfolderName}_Stories`, 'Subfolder Stories');
      toast.success(`Excel file for subfolder "${subfolder.summary}" downloaded successfully!`);
    } else {
      downloadCsv(exportData, `Subfolder_${safeSubfolderName}_Stories`);
      toast.success(`CSV file for subfolder "${subfolder.summary}" downloaded successfully!`);
    }
  };

  // Download Single User Story
  const handleDownloadSingleStory = async (story: UserStory, format: 'excel' | 'csv' = 'excel', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const row = [{
      'User Story ID': story.storyId || story.id,
      'Summary': story.summary,
      'Description': story.description,
      'Acceptance Criteria': story.acceptanceCriteria,
      'Folder': (story as any).folderName || 'N/A',
      'Created At': story.createdAt ? new Date(story.createdAt).toLocaleString() : 'N/A'
    }];
    const safeId = (story.storyId || story.id || 'User_Story').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (format === 'excel') {
      downloadExcel(row, `${safeId}_Story`, 'Story Details');
      toast.success(`User story ${story.storyId || ''} downloaded as Excel!`);
    } else {
      downloadCsv(row, `${safeId}_Story`);
      toast.success(`User story ${story.storyId || ''} downloaded as CSV!`);
    }
  };

  // Download Selected Stories
  const handleDownloadSelectedStories = async (format: 'excel' | 'csv' = 'excel') => {
    const checkedStories = activeStoriesList.filter(s => selectedStoryIds.has(s.id) && s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE');
    if (checkedStories.length === 0) {
      toast.error('No valid user stories selected for download.');
      return;
    }

    const rows = checkedStories.map(s => ({
      'User Story ID': s.storyId || s.id,
      'Summary': s.summary,
      'Description': s.description,
      'Acceptance Criteria': s.acceptanceCriteria,
      'Folder': (s as any).folderName || 'N/A',
      'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'
    }));

    if (format === 'excel') {
      downloadExcel(rows, `${project.name.replace(/\s+/g, '_')}_Selected_Stories`, 'Selected Stories');
      toast.success(`Downloaded ${checkedStories.length} stories as Excel!`);
    } else {
      downloadCsv(rows, `${project.name.replace(/\s+/g, '_')}_Selected_Stories`);
      toast.success(`Downloaded ${checkedStories.length} stories as CSV!`);
    }
  };

  const handleBulkDelete = () => {
    if (selectedStoryIds.size === 0) return;
    setShowBulkDeleteConfirm(true);
  };

  const performBulkDelete = async () => {
    const selectedIds = Array.from(selectedStoryIds);
    addDeletedIds(selectedIds);

    try {
      const localBackupStr = localStorage.getItem(`automatiqa_project_backup_${project.id}`);
      if (localBackupStr) {
        const localBackup = JSON.parse(localBackupStr);
        if (localBackup && Array.isArray(localBackup.userStories)) {
          localBackup.userStories = localBackup.userStories.filter((s: any) => !selectedStoryIds.has(s.id));
          localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(localBackup));
        }
      }
    } catch (e) {}

    const updatedStories = activeStoriesList.filter(s => !selectedStoryIds.has(s.id));
    onUpdateProject({ ...project, userStories: updatedStories });
    const countDeleted = selectedStoryIds.size;
    setSelectedStoryIds(new Set());
    setShowBulkDeleteConfirm(false);
    toast.success('Selected user stories deleted successfully');
    
    await logActivity(
      user.email,
      user.name,
      `Bulk deleted ${countDeleted} user stories`,
      project.id,
      project.name
    );
  };

  // Export All to Excel
  const handleExportExcel = async () => {
    const storiesToExport = activeStoriesList.filter(s => s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE');
    if (storiesToExport.length === 0) {
      toast.error('No user stories to export.');
      return;
    }

    const rows = storiesToExport.map(s => ({
      'User Story ID': s.storyId || s.id,
      'Summary': s.summary,
      'Description': s.description,
      'Acceptance Criteria': s.acceptanceCriteria,
      'Folder': (s as any).folderName || 'N/A',
      'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'
    }));

    downloadExcel(rows, `${project.name.replace(/\s+/g, '_')}_User_Stories`, 'User Stories');
    toast.success(`Exported ${storiesToExport.length} user stories to Excel!`);
  };

  // Export All to CSV
  const handleExportCSV = async () => {
    const storiesToExport = activeStoriesList.filter(s => s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE');
    if (storiesToExport.length === 0) {
      toast.error('No user stories to export.');
      return;
    }

    const rows = storiesToExport.map(s => ({
      'User Story ID': s.storyId || s.id,
      'Summary': s.summary,
      'Description': s.description,
      'Acceptance Criteria': s.acceptanceCriteria,
      'Folder': (s as any).folderName || 'N/A',
      'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString() : 'N/A'
    }));

    downloadCsv(rows, `${project.name.toLowerCase().replace(/\s+/g, '_')}_user_stories`);
    toast.success(`Exported ${storiesToExport.length} user stories to CSV!`);
  };

  const areAllStoriesChecked = useMemo(() => {
    return storiesBeingSaved.length > 0 && storiesBeingSaved.every(s => selectedStoriesToSave.has(s.id));
  }, [storiesBeingSaved, selectedStoriesToSave]);

  const renderAcceptanceCriteria = (criteriaText: string) => {
    if (!criteriaText) return null;
    const formatted = formatAcceptanceCriteria(criteriaText);
    const rawLines = formatted
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    if (rawLines.length === 0) return null;

    let pointCounter = 0;

    return (
      <ul className="space-y-2 text-xs text-slate-700 font-medium leading-relaxed">
        {rawLines.map((line, index) => {
          const isGherkin = /^(Given|When|Then|And|But)\b/i.test(line);
          const isGiven = /^Given\b/i.test(line);
          const isWhen = /^When\b/i.test(line);
          const isThen = /^Then\b/i.test(line);

          // Clean off leading bullet or number prefix for non-Gherkin line e.g. "1. ", "- ", "• "
          const cleanLine = isGherkin 
            ? line 
            : line.replace(/^[-*•\d+\.\)]+\s*/, '').trim() || line;

          if (!isGherkin) {
            pointCounter++;
          }

          return (
            <li key={index} className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-50/70 border border-slate-100/80 hover:bg-slate-50 transition-colors">
              {isGherkin ? (
                <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md text-white flex-shrink-0 mt-0.5 shadow-2xs ${
                  isGiven ? 'bg-indigo-600' :
                  isWhen ? 'bg-amber-500' :
                  isThen ? 'bg-emerald-600' :
                  'bg-sky-600'
                }`}>
                  {line.match(/^(Given|When|Then|And|But)\b/i)?.[0].toUpperCase()}
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 border border-indigo-200/50">
                  {pointCounter}
                </span>
              )}
              <span className="flex-1 text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">
                {isGherkin ? cleanLine.replace(/^(Given|When|Then|And|But)\b\s*/i, '') : cleanLine}
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-8 rounded-[2rem] border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight">AI User Story Generator</h1>
            <RAGStatusBadge
              enabled={ragEnabled}
              onToggle={setRagEnabled}
              retrievedChunks={retrievedRagChunks}
            />
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => openModal()}
            className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Plus size={16} /> Create Story Manually
          </button>
          
          <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block" />
          
          <button 
            onClick={handleExportExcel}
            disabled={activeStoriesList.length === 0}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50/50 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shadow-2xs"
            title="Export all user stories to Excel"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" /> Export Excel
          </button>

          <button 
            onClick={handleExportCSV}
            disabled={activeStoriesList.length === 0}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:border-slate-300 hover:bg-slate-50 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shadow-2xs"
            title="Export all user stories to CSV"
          >
            <Download size={15} className="text-slate-600" /> Export CSV
          </button>

          <button 
            onClick={() => {
              if (individualStories.length === 0) {
                toast.error('No individual user stories to export.');
                return;
              }
              setStoriesToExport(individualStories);
              setIsJiraExportModalOpen(true);
            }}
            disabled={individualStories.length === 0}
            className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-100/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <Sparkles size={15} /> Export All to Jira
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Generator Controls (Left Sidebar) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center gap-2">
              <FileText size={18} className="text-indigo-600" />
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Requirements Input</h3>
            </div>
            
            {/* File Drag & Drop Zone */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                BRD / Requirements Document <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  dragActive 
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-inner' 
                    : selectedFile 
                    ? 'border-emerald-500 bg-emerald-50/10' 
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  onChange={handleFileChange}
                  accept=".pdf,.docx,.doc"
                  className="hidden" 
                />
                
                {selectedFile ? (
                  <div className="space-y-3">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto shadow-sm">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-xs truncate max-w-[220px] mx-auto">{selectedFile.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>

                    <button 
                      onClick={handleRemoveFile}
                      className="flex items-center gap-1.5 mx-auto bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                      <X size={12} /> Remove File
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center mx-auto shadow-sm">
                      <Upload size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-700 text-xs">Upload BRD or Epic Document</p>
                      <p className="text-[10px] text-slate-400 mt-1 leading-normal font-medium">Supported formats: <strong className="text-slate-600">.pdf, .docx, .doc</strong></p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Screenshots Input */}
            <div>
              <ScreenshotUploader
                screenshots={screenshots}
                onChange={(files) => {
                  setScreenshots(files);
                  if (creditNotAvailableError) setCreditNotAvailableError(null);
                }}
                title="UI Screenshots / Mockups"
                description="Upload multiple screenshots in PNG, JPG, WEBP, GIF, SVG. You can generate user stories using screenshots alone if no document is available."
                maxFiles={10}
              />
            </div>

            {/* Refine Instructions / Additional Guidelines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles size={14} className="text-indigo-600" />
                  Refine Instructions <span className="text-slate-400 font-normal text-xs">(Optional)</span>
                </label>
                <span className="text-[11px] font-bold text-slate-400">
                  {additionalContext.length}/1000
                </span>
              </div>
              <textarea
                value={additionalContext || ''}
                maxLength={1000}
                onChange={(e) => {
                  setAdditionalContext(e.target.value);
                  if (creditNotAvailableError) setCreditNotAvailableError(null);
                }}
                placeholder="Enter instructions to refine user story generation (e.g., 'Focus on mobile user experience, compliance requirements, or specific actor roles')..."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium resize-none shadow-inner"
              />
            </div>

            {/* Credit Limit Banner: Displayed when remaining credits < 5 or explicitly error */}
            {(creditNotAvailableError || getProjectCreditSummary(project.id, project.name).remainingCredits < 5 || getProjectCreditSummary(project.id, project.name).isExpired) && (
              <div className="p-4 bg-amber-50/95 border border-amber-300 rounded-2xl flex items-start gap-3.5 text-amber-900 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700 mt-0.5">
                  <AlertTriangle size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">
                      Insufficient Credits
                    </h4>
                    {creditNotAvailableError && (
                      <button
                        type="button"
                        onClick={() => setCreditNotAvailableError(null)}
                        className="text-amber-500 hover:text-amber-800 text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed">
                    {creditNotAvailableError || `Insufficient credits for project "${project.name}" (${getProjectCreditSummary(project.id, project.name).remainingCredits} credits remaining, 5 required for User Stories). Please top up or renew your project plan.`}
                  </p>
                  <div className="mt-2.5 pt-2 border-t border-amber-200/60 flex items-center justify-between gap-2 text-[11px] font-bold text-amber-700">
                    <span>Remaining credits: {getProjectCreditSummary(project.id, project.name).remainingCredits}</span>
                    <span>Requires 5 credits</span>
                  </div>
                </div>
              </div>
            )}

            {/* Generate Action Button */}
            <button
              onClick={handleGenerateUserStories}
              disabled={isGenerating || (!selectedFile && screenshots.length === 0 && !additionalContext.trim())}
              className="w-full flex items-center justify-center gap-2.5 bg-indigo-600 text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-55 disabled:cursor-not-allowed transition-all shadow-xl shadow-indigo-100 cursor-pointer"
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {isGenerating ? 'Analyzing & Generating...' : 'Generate AI User Stories (5 Credits)'}
            </button>
          </div>
        </div>

        {/* Display Area (Right panel for searching and listing) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Banner for newly generated stories */}
          {newlyGeneratedStories.length > 0 && (
            <div className="bg-indigo-50/40 border border-indigo-100 rounded-[2rem] p-8 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6 border-b border-indigo-100/50 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                      <Sparkles size={11} className="text-indigo-600" /> Latest Generation Result
                    </span>
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-200">
                      Unsaved Folder Suite
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Newly Generated Stories & Document</h3>
                  <p className="text-xs text-slate-500 mt-1 font-medium">
                    Review the latest generated user stories and their associated requirements input document below. Save them into an organization folder now.
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      setStoriesBeingSaved(newlyGeneratedStories);
                      setSelectedStoriesToSave(new Set(newlyGeneratedStories.map(s => s.id)));
                      setSelectedFolderIdForSave(allFolders.length > 0 ? allFolders[0].id : '');
                      setShowCreateFolderInline(allFolders.length === 0);
                      setInlineNewFolderName(selectedFile ? `${selectedFile.name.replace(/\.[^/.]+$/, '')} Folder` : `Generated Suite (${new Date().toLocaleDateString()})`);
                      setInlineFolderError(null);
                      setIsFolderSelectModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all cursor-pointer"
                  >
                    <FolderPlus size={14} /> Save to Folder
                  </button>
                  <button 
                    onClick={() => {
                      setNewlyGeneratedStories([]);
                      toast.info('Cleared generation view. The stories are still available in your individual list.');
                    }}
                    className="bg-white hover:bg-slate-50 text-slate-500 border border-slate-200 px-5 py-3 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              {/* List preview of newly generated items */}
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {newlyGeneratedStories.map((ns, idx) => {
                  const isInput = ns.storyId === 'INPUT_SOURCE';
                  const nsImages = (ns.attachments && ns.attachments.length > 0)
                    ? ns.attachments 
                    : (ns.screenshots || []).map(s => s.previewUrl || (s.data?.startsWith('data:') || s.data?.startsWith('http') ? s.data : `data:${s.mimeType || 'image/png'};base64,${s.data}`));

                  return (
                    <div 
                      key={ns.id} 
                      onClick={() => {
                        const actualStories = newlyGeneratedStories.filter(s => s.storyId !== 'INPUT_SOURCE' && s.storyId !== 'USERSTORY_FOLDER');
                        openStoryDetails(ns, isInput ? newlyGeneratedStories : actualStories);
                      }}
                      className={`p-4 rounded-xl border flex flex-col gap-3 cursor-pointer hover:border-indigo-300 hover:shadow-xs transition-all ${isInput ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-slate-100'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${isInput ? 'bg-amber-100 text-amber-700' : 'bg-indigo-50 text-indigo-600'}`}>
                          {isInput ? <FileText size={16} /> : <Layers size={16} />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-xs truncate">{ns.summary}</p>
                          <p className="text-[10px] text-slate-400 uppercase font-bold mt-0.5 tracking-wider">
                            {isInput ? 'Original Generation Document' : 'User Story'}
                          </p>
                        </div>
                      </div>
                      {nsImages && nsImages.length > 0 && (
                        <div className="pl-11" onClick={(e) => e.stopPropagation()}>
                          <ScreenshotGallery images={nsImages} title="Attached Screenshots" compact />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-[2rem] border border-slate-200/80 shadow-sm p-6 space-y-6">
            
            {/* Custom Tabs */}
            <div className="flex gap-10 border-b border-slate-100 px-2 pb-0">
              <button 
                onClick={() => {
                  setActiveView('stories');
                  setSearchQuery('');
                }} 
                className={`pb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest relative transition-all cursor-pointer ${activeView === 'stories' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'}`}
              >
                 <LayoutGrid size={14} />
                 Individual Stories ({individualCount})
                 {activeView === 'stories' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full shadow-lg animate-in slide-in-from-left-2" />}
              </button>
              <button 
                onClick={() => {
                  setActiveView('folders');
                  setSearchQuery('');
                }} 
                className={`pb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest relative transition-all cursor-pointer ${activeView === 'folders' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'}`}
              >
                 <Folder size={14} />
                 Folders ({folderCount})
                 {activeView === 'folders' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full shadow-lg animate-in slide-in-from-right-2" />}
              </button>
            </div>

            {/* Search and Action Header */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-80">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery || ''}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={activeView === 'stories' ? "Search individual stories..." : "Search folders..."}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                  {activeView === 'stories' && filteredStories.length > 0 && (
                    <button 
                      onClick={() => {
                        const allFilteredIds = filteredStories.map(s => s.id);
                        const allSelected = allFilteredIds.every(id => selectedStoryIds.has(id));
                        const next = new Set(selectedStoryIds);
                        if (allSelected) {
                          allFilteredIds.forEach(id => next.delete(id));
                        } else {
                          allFilteredIds.forEach(id => next.add(id));
                        }
                        setSelectedStoryIds(next);
                      }}
                      className="flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-sm cursor-pointer"
                    >
                      <CheckSquare size={13} />
                      {filteredStories.every(s => selectedStoryIds.has(s.id)) ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                  {activeView === 'folders' && (
                    <button 
                      onClick={() => setIsCreatingFolder(true)} 
                      className="flex items-center gap-1.5 bg-[#F0F4FF] text-[#4F46E5] hover:bg-indigo-100 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest border border-indigo-50 transition-all shadow-sm cursor-pointer"
                    >
                       <FolderPlus size={14} /> ADD FOLDER
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {activeView === 'stories' ? 'Stories:' : 'Folders:'}
                    </span>
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-md text-xs font-black">
                      {filteredStories.length}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Selected Stories Bulk Bar */}
            {selectedStoryIds.size > 0 && activeView === 'stories' && (
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200/60 p-4 rounded-2xl animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                    Selected {selectedStoryIds.size} stories
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => handleDownloadSelectedStories('excel')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                    title="Export selected stories to Excel"
                  >
                    <FileSpreadsheet size={12} /> Excel ({selectedStoryIds.size})
                  </button>
                  <button 
                    type="button"
                    onClick={() => handleDownloadSelectedStories('csv')}
                    className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                    title="Export selected stories to CSV"
                  >
                    <Download size={12} /> CSV ({selectedStoryIds.size})
                  </button>
                  <button 
                    onClick={() => {
                      const checkedStories = activeStoriesList.filter(s => selectedStoryIds.has(s.id));
                      setStoriesToExport(checkedStories);
                      setIsJiraExportModalOpen(true);
                    }}
                    className="bg-indigo-600 text-white px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md hover:bg-indigo-700 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Sparkles size={12} /> Jira
                  </button>
                  <button 
                    onClick={() => {
                      const checkedStories = activeStoriesList.filter(s => selectedStoryIds.has(s.id));
                      if (checkedStories.length === 0) {
                        toast.error('No stories selected');
                        return;
                      }
                      setStoriesBeingSaved(checkedStories);
                      setSelectedStoriesToSave(new Set(checkedStories.map(s => s.id)));
                      setSelectedFolderIdForSave(allFolders.length > 0 ? allFolders[0].id : '');
                      setShowCreateFolderInline(allFolders.length === 0);
                      setInlineNewFolderName('');
                      setInlineFolderError(null);
                      setIsFolderSelectModalOpen(true);
                    }}
                    className="bg-slate-900 text-white px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-md hover:bg-slate-800 transition-all cursor-pointer"
                  >
                    Save to Folder
                  </button>
                  <button 
                    onClick={handleBulkDelete} 
                    className="bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 px-3 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            )}

            {/* Empty States / Lists */}
            {filteredStories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4">
                  {activeView === 'stories' ? <Layers size={28} /> : <Folder size={28} />}
                </div>
                <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                  No {activeView === 'stories' ? 'Stories' : 'Folders'} Found
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mt-1 leading-normal font-medium">
                  {activeView === 'stories' 
                    ? 'No individual user stories are currently active. Upload a Requirements Document on the left sidebar to generate stories or click "Create Story Manually" above.'
                    : 'Create organization folders to bundle agile requirements and user stories into structured suites.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                
                {/* 1. Folders Render Mode */}
                {activeView === 'folders' && filteredStories.map((folder) => {
                  const isExpanded = expandedItems.has(folder.id);

                  // All subfolders in this parent folder (newest first)
                  const subfoldersInFolder = activeStoriesList
                    .filter(s => s.storyId === 'USERSTORY_FOLDER' && s.parentFolderId === folder.id)
                    .sort((a, b) => {
                      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                      return timeB - timeA;
                    });

                  const subfolderStoryIds = new Set(subfoldersInFolder.flatMap(sf => sf.memberStoryIds || []));

                  // All direct member stories in this parent folder (newest first)
                  const directMemberStories = activeStoriesList
                    .filter(mem => 
                      mem.storyId !== 'USERSTORY_FOLDER' && 
                      ((folder.memberStoryIds || []).includes(mem.id) || mem.folderId === folder.id || mem.parentFolderId === folder.id) &&
                      !subfolderStoryIds.has(mem.id) &&
                      !subfoldersInFolder.some(sf => sf.id === mem.folderId)
                    )
                    .sort((a, b) => {
                      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                      return timeB - timeA;
                    });

                  const selectedStorySetInFolder = folderStorySelections[folder.id] || new Set();
                  const selectedDirectCount = directMemberStories.filter(s => selectedStorySetInFolder.has(s.id)).length;
                  const isAllDirectSelected = directMemberStories.length > 0 && selectedDirectCount === directMemberStories.length;

                  const memberStoriesExcludingInput = activeStoriesList.filter(mem => 
                    mem.storyId !== 'USERSTORY_FOLDER' && 
                    mem.storyId !== 'INPUT_SOURCE' && 
                    ((folder.memberStoryIds || []).includes(mem.id) || mem.folderId === folder.id)
                  );
                  const totalStoryCount = memberStoriesExcludingInput.length;
                  
                  return (
                    <div key={folder.id} className={`bg-white border border-slate-100 rounded-[1.8rem] overflow-hidden transition-all shadow-sm ${isExpanded ? 'ring-1 ring-indigo-50 border-indigo-200' : 'hover:border-slate-200'}`}>
                      <div className="flex items-center justify-between p-6">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <button 
                            onClick={() => toggleExpand(folder.id)} 
                            className={`p-1.5 transition-all rounded-lg cursor-pointer ${isExpanded ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            {isExpanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                          </button>

                          <div className="p-3 border rounded-xl shadow-inner bg-amber-50/40 border-amber-100 text-amber-600">
                             <Folder size={18}/>
                          </div>

                          <div className="min-w-0 flex-1">
                             <h4 className="font-black text-slate-800 uppercase tracking-tight cursor-pointer text-sm" onClick={() => toggleExpand(folder.id)}>
                               {folder.summary}
                             </h4>
                             <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Folder Suite</span>
                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[9px] font-bold">{totalStoryCount} User {totalStoryCount === 1 ? 'Story' : 'Stories'}</span>
                                {subfoldersInFolder.length > 0 && (
                                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[9px] font-bold">
                                    {subfoldersInFolder.length} Subfolders
                                  </span>
                                )}
                             </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                           {/* Folder Download Group */}
                           <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
                             <button 
                               type="button"
                               onClick={(e) => handleDownloadFolder(folder, 'excel', e)} 
                               className="flex items-center gap-1 bg-white hover:bg-emerald-50 text-emerald-700 hover:border-emerald-200 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border border-slate-200/80 shadow-2xs transition-all cursor-pointer"
                               title="Download Folder User Stories (Excel)"
                             >
                               <FileSpreadsheet size={12} className="text-emerald-600" /> Excel
                             </button>
                             <button 
                               type="button"
                               onClick={(e) => handleDownloadFolder(folder, 'csv', e)} 
                               className="flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 hover:border-slate-300 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border border-slate-200/80 shadow-2xs transition-all cursor-pointer"
                               title="Download Folder User Stories (CSV)"
                             >
                               <Download size={12} className="text-slate-500" /> CSV
                             </button>
                           </div>

                           <button 
                             onClick={(e) => handleOpenManageItems(folder, e)} 
                             className="flex items-center gap-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-indigo-100 shadow-sm transition-all cursor-pointer"
                           >
                              <Plus size={12} strokeWidth={3} /> Add Stories
                           </button>
                           <button 
                             onClick={() => handleDeleteStory(folder.id)} 
                             className="p-2 text-slate-300 hover:text-rose-500 rounded-xl transition-all cursor-pointer"
                             title="Delete Folder"
                           >
                             <Trash2 size={16} />
                           </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-6 bg-slate-50/50 border-t border-slate-100 space-y-4 animate-in slide-in-from-top-2">
                           {subfoldersInFolder.length === 0 && directMemberStories.length === 0 ? (
                              <div className="py-8 text-center text-slate-400 italic text-xs border-2 border-dashed border-slate-100 rounded-2xl bg-white">
                                 This folder is currently empty. Click 'Add Stories' to select stories for this folder.
                              </div>
                           ) : (
                              <div className="space-y-4">

              {/* Direct Stories Selection & Subfolder Action Bar */}
                                {directMemberStories.length > 0 && (() => {
                                  const directUserStories = directMemberStories.filter(s => s.storyId !== 'INPUT_SOURCE');
                                  const selectedDirectCount = directUserStories.filter(s => selectedStorySetInFolder.has(s.id)).length;
                                  const isAllDirectSelected = directUserStories.length > 0 && selectedDirectCount === directUserStories.length;

                                  return (
                                    <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
                                      <div className="flex items-center gap-3">
                                        <button
                                          type="button"
                                          onClick={(e) => toggleSelectAllStoriesInFolder(folder.id, directUserStories, e)}
                                          className={`flex items-center gap-2 text-xs font-bold transition-colors cursor-pointer ${
                                            isAllDirectSelected ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                                          }`}
                                        >
                                          {isAllDirectSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                          <span>{isAllDirectSelected ? 'Deselect All Stories' : 'Select All Stories'}</span>
                                        </button>

                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                          ({selectedDirectCount} of {directUserStories.length} Selected)
                                        </span>
                                      </div>

                                      {selectedDirectCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={(e) => handleOpenCreateSubfolderModal(folder, e)}
                                          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-indigo-100 transition-all cursor-pointer animate-in fade-in"
                                        >
                                          <FolderPlus size={14} />
                                          <span>Save {selectedDirectCount} {selectedDirectCount === 1 ? 'Story' : 'Stories'} in Subfolder</span>
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* Subfolders Section */}
                                {subfoldersInFolder.length > 0 && (
                                  <div className="space-y-3">
                                    <div className="flex items-center gap-2 px-1">
                                      <Folder size={14} className="text-indigo-500" />
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        Subfolders ({subfoldersInFolder.length})
                                      </span>
                                    </div>

                                    {subfoldersInFolder.map(sf => {
                                      const sfMemberCount = (sf.memberStoryIds || []).length;
                                      const isSfExpanded = expandedItems.has(sf.id);
                                      const sfMemberStories = activeStoriesList
                                        .filter(mem => (sf.memberStoryIds || []).includes(mem.id) || mem.folderId === sf.id)
                                        .sort((a, b) => {
                                          const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                                          const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                                          return timeB - timeA;
                                        });

                                      return (
                                        <div key={sf.id} className="bg-indigo-50/40 border border-indigo-100 rounded-2xl overflow-hidden transition-all shadow-inner">
                                          <div className="flex items-center justify-between p-4 bg-white/80">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                              <button
                                                type="button"
                                                onClick={() => toggleExpand(sf.id)}
                                                className={`p-1.5 transition-all rounded-lg cursor-pointer ${
                                                  isSfExpanded ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                              >
                                                {isSfExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                              </button>

                                              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                                <Folder size={15} />
                                              </div>

                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                  <h5 
                                                    className="font-black text-slate-800 text-xs uppercase tracking-tight cursor-pointer hover:text-indigo-600 transition-colors"
                                                    onClick={() => toggleExpand(sf.id)}
                                                  >
                                                    {sf.summary}
                                                  </h5>
                                                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider">
                                                    Subfolder
                                                  </span>
                                                </div>
                                                <span className="text-[9px] text-slate-400 font-bold">{sfMemberCount} User {sfMemberCount === 1 ? 'Story' : 'Stories'}</span>
                                              </div>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                              {/* Subfolder Download Buttons */}
                                              <div className="flex items-center gap-1 bg-indigo-100/60 p-1 rounded-xl">
                                                <button
                                                  type="button"
                                                  onClick={(e) => handleDownloadSubfolder(sf, folder, 'excel', e)}
                                                  className="flex items-center gap-1 bg-white hover:bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider border border-indigo-100/80 shadow-2xs transition-all cursor-pointer"
                                                  title="Download Subfolder User Stories (Excel)"
                                                >
                                                  <FileSpreadsheet size={11} className="text-emerald-600" /> Excel
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={(e) => handleDownloadSubfolder(sf, folder, 'csv', e)}
                                                  className="flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-wider border border-indigo-100/80 shadow-2xs transition-all cursor-pointer"
                                                  title="Download Subfolder User Stories (CSV)"
                                                >
                                                  <Download size={11} className="text-slate-500" /> CSV
                                                </button>
                                              </div>

                                              <button
                                                type="button"
                                                onClick={(e) => handleDeleteSubfolder(sf, e)}
                                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                                title="Delete Subfolder & Move Stories to Parent"
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            </div>
                                          </div>

                                          {isSfExpanded && (
                                            <div className="p-4 bg-white border-t border-indigo-100/60 space-y-2.5">
                                              {sfMemberStories.length === 0 ? (
                                                <p className="text-xs text-slate-400 italic text-center py-3">Subfolder is empty</p>
                                              ) : (
                                                sfMemberStories.map(mem => {
                                                  const isInput = mem.storyId === 'INPUT_SOURCE';
                                                  return (
                                                    <div
                                                      key={mem.id}
                                                      onClick={() => {
                                                        const subfolderStories = sfMemberStories.filter(s => s.storyId !== 'INPUT_SOURCE' && s.storyId !== 'USERSTORY_FOLDER');
                                                        openStoryDetails(mem, isInput ? sfMemberStories : subfolderStories);
                                                      }}
                                                      className={`p-3 rounded-xl flex items-center justify-between gap-3 group/submem border transition-all cursor-pointer ${
                                                        isInput
                                                          ? 'bg-amber-50/40 border-amber-100 hover:border-amber-300'
                                                          : 'bg-slate-50/60 border-slate-100 hover:border-indigo-300'
                                                      }`}
                                                    >
                                                      <div className="flex items-center gap-3 min-w-0">
                                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-mono font-black uppercase">
                                                          {mem.storyId || mem.id}
                                                        </span>
                                                        <div className="min-w-0">
                                                          <h6 className="font-bold text-slate-800 text-xs truncate">{mem.summary}</h6>
                                                        </div>
                                                      </div>

                                                      <div className="flex items-center gap-1.5 opacity-0 group-hover/submem:opacity-100 transition-all">
                                                        <button
                                                          type="button"
                                                          onClick={(e) => handleRemoveFromSubfolder(sf, mem.id, e)}
                                                          className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                                                          title="Move story back to parent folder"
                                                        >
                                                          <ArrowRight size={10} className="rotate-180" /> Move to Parent
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteStory(mem.id);
                                                          }}
                                                          className="p-1 bg-white hover:bg-rose-50 border border-slate-200 text-slate-400 hover:text-rose-500 rounded transition-all cursor-pointer"
                                                          title="Delete Permanently"
                                                        >
                                                          <Trash2 size={12} />
                                                        </button>
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
                                )}

                                {/* Direct User Stories Section */}
                                {directMemberStories.length > 0 && (
                                  <div className="space-y-2.5">
                                    {subfoldersInFolder.length > 0 && (
                                      <div className="flex items-center gap-2 px-1 pt-2">
                                        <FileText size={14} className="text-slate-400" />
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                          Direct User Stories ({directMemberStories.length})
                                        </span>
                                      </div>
                                    )}

                                    {directMemberStories.map(mem => {
                                      const isInput = mem.storyId === 'INPUT_SOURCE';
                                      const isSelectedInFolder = selectedStorySetInFolder.has(mem.id);

                                      return (
                                        <div 
                                          key={mem.id} 
                                          onClick={() => {
                                            const folderStories = directMemberStories.filter(s => s.storyId !== 'INPUT_SOURCE' && s.storyId !== 'USERSTORY_FOLDER');
                                            openStoryDetails(mem, isInput ? directMemberStories : folderStories);
                                          }}
                                          className={`p-4 rounded-xl flex items-center justify-between gap-4 group/mem shadow-inner cursor-pointer transition-all border ${
                                            isSelectedInFolder 
                                              ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-200' 
                                              : isInput 
                                              ? 'bg-amber-50/40 border-amber-100 hover:border-amber-300' 
                                              : 'bg-white border-slate-100 hover:border-indigo-300'
                                          }`}
                                        >
                                           <div className="flex items-center gap-3 min-w-0">
                                              {/* Checkbox for subfolder selection */}
                                              <button
                                                type="button"
                                                onClick={(e) => toggleSelectStoryInFolder(folder.id, mem.id, e)}
                                                className={`p-1 transition-all rounded cursor-pointer ${
                                                  isSelectedInFolder ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'
                                                }`}
                                                title="Select to save in subfolder"
                                              >
                                                {isSelectedInFolder ? <CheckSquare size={17} /> : <Square size={17} />}
                                              </button>

                                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[9px] font-mono font-bold uppercase">
                                                {mem.storyId || mem.id}
                                              </span>

                                              <div className="min-w-0">
                                                 <h6 className="font-bold text-slate-800 text-xs break-words line-clamp-1">{mem.summary}</h6>
                                                 <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 tracking-wider">
                                                    {isInput ? 'Original Requirements Input' : `User Story`}
                                                 </p>
                                              </div>
                                           </div>
                                           
                                           <div className="flex items-center gap-2 opacity-0 group-hover/mem:opacity-100 transition-all">
                                              <button 
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  // Remove from this folder (restores to individual list)
                                                  const updatedStories = activeStoriesList.map(us => {
                                                    if (us.id === folder.id) {
                                                      return {
                                                        ...us,
                                                        memberStoryIds: (us.memberStoryIds || []).filter(id => id !== mem.id)
                                                      };
                                                    }
                                                    if (us.id === mem.id) {
                                                      return {
                                                        ...us,
                                                        isRemovedFromIndividual: false,
                                                        folderId: ""
                                                      };
                                                    }
                                                    return us;
                                                  });
                                                  onUpdateProject({ ...project, userStories: updatedStories });
                                                  toast.success('Removed item from folder');
                                                }}
                                                className="p-1.5 bg-white hover:bg-slate-50 border border-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-all cursor-pointer"
                                                title="Remove from Folder"
                                              >
                                                <X size={12} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => handleDownloadSingleStory(mem, 'excel', e)}
                                                className="p-1.5 bg-white hover:bg-emerald-50 border border-slate-100 text-slate-400 hover:text-emerald-600 rounded-lg transition-all cursor-pointer"
                                                title="Download Story (Excel)"
                                              >
                                                <FileSpreadsheet size={12} />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => handleDownloadSingleStory(mem, 'csv', e)}
                                                className="p-1.5 bg-white hover:bg-slate-100 border border-slate-100 text-slate-400 hover:text-slate-700 rounded-lg transition-all cursor-pointer"
                                                title="Download Story (CSV)"
                                              >
                                                <Download size={12} />
                                              </button>
                                              <button 
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteStory(mem.id);
                                                }}
                                                className="p-1.5 bg-white hover:bg-rose-50 border border-slate-100 text-slate-400 hover:text-rose-500 rounded-lg transition-all cursor-pointer"
                                                title="Delete Permanently"
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                           </div>
                                        </div>
                                      );
                                   })}
                                  </div>
                                )}

                              </div>
                           )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 2. Individual Stories Render Mode */}
                {activeView === 'stories' && filteredStories.map((story) => {
                  const isSelected = selectedStory?.id === story.id;
                  const isChecked = selectedStoryIds.has(story.id);
                  
                  return (
                    <div
                      key={story.id}
                      onClick={() => {
                        const storiesList = filteredStories.filter(s => s.storyId !== 'INPUT_SOURCE' && s.storyId !== 'USERSTORY_FOLDER');
                        openStoryDetails(story, storiesList);
                      }}
                      className={`group relative p-6 rounded-2xl border transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-indigo-600 bg-white shadow-md shadow-indigo-100/50' 
                          : 'border-slate-100 bg-white hover:bg-slate-50/50 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Checkbox button */}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = new Set(selectedStoryIds);
                              if (next.has(story.id)) next.delete(story.id); else next.add(story.id);
                              setSelectedStoryIds(next);
                            }}
                            className={`mt-1 transition-all flex-shrink-0 cursor-pointer ${isChecked ? 'text-indigo-600' : 'text-slate-300 group-hover:text-slate-400'}`}
                          >
                             {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                          </button>

                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 bg-slate-900 text-white rounded-md text-[9px] font-mono font-black uppercase tracking-wider border border-slate-800 shadow-xs">
                                {story.storyId || story.id}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(story.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            
                            {/* SUMMARY */}
                            <h4 className="font-black text-slate-800 text-sm group-hover:text-indigo-600 transition-colors uppercase tracking-tight truncate">
                              {story.summary}
                            </h4>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            type="button"
                            onClick={(e) => handleDownloadSingleStory(story, 'excel', e)}
                            className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-200 rounded-lg shadow-sm transition-all cursor-pointer"
                            title="Download Story (Excel)"
                          >
                            <FileSpreadsheet size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDownloadSingleStory(story, 'csv', e)}
                            className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 rounded-lg shadow-sm transition-all cursor-pointer"
                            title="Download Story (CSV)"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openModal(story);
                            }}
                            className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 rounded-lg shadow-sm transition-all cursor-pointer"
                            title="Edit User Story"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteStory(story.id);
                            }}
                            className="p-1.5 bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 rounded-lg shadow-sm transition-all cursor-pointer"
                            title="Delete User Story"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* DESCRIPTION PREVIEW */}
                      <div className="mt-3 bg-white p-3.5 border border-slate-100 rounded-xl">
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 block mb-1">User Story Description</span>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed italic line-clamp-2">
                          {story.description}
                        </p>
                      </div>

                      {/* ACCEPTANCE CRITERIA PREVIEW */}
                      {story.acceptanceCriteria && story.acceptanceCriteria !== 'N/A' && (
                        <div className="mt-3 bg-slate-50/50 p-3.5 border border-slate-100 rounded-xl space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Acceptance Criteria</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Point-Wise</span>
                          </div>
                          {renderAcceptanceCriteria(story.acceptanceCriteria)}
                        </div>
                      )}

                      {/* Detail overlay hover arrow */}
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all pointer-events-none">
                        <ChevronRight size={18} className="text-indigo-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Selected Story Detail Modal/Overlay Panel */}
      {selectedStory && (() => {
        // Determine the exact list of stories for navigation context
        let navStories: UserStory[] = [];

        // 1. If explicit navigation list was provided and contains the selected story
        if (storyNavList && storyNavList.length > 0 && storyNavList.some(s => s.id === selectedStory.id)) {
          navStories = storyNavList.filter(s => s.storyId !== 'USERSTORY_FOLDER');
        } 
        // 2. If the story is one of the newly generated stories from current session
        else if (newlyGeneratedStories.length > 0 && newlyGeneratedStories.some(s => s.id === selectedStory.id)) {
          const actualGenerated = newlyGeneratedStories.filter(s => s.storyId !== 'INPUT_SOURCE' && s.storyId !== 'USERSTORY_FOLDER');
          if (selectedStory.storyId === 'INPUT_SOURCE') {
            navStories = newlyGeneratedStories.filter(s => s.storyId !== 'USERSTORY_FOLDER');
          } else {
            navStories = actualGenerated.length > 0 ? actualGenerated : newlyGeneratedStories.filter(s => s.storyId !== 'USERSTORY_FOLDER');
          }
        } 
        // 3. If in folders view or the story belongs to a folder/subfolder
        else if (activeView === 'folders' || selectedStory.folderId) {
          // Check if it belongs to a subfolder
          const subfolder = activeStoriesList.find(s => 
            s.storyId === 'USERSTORY_FOLDER' && 
            s.parentFolderId && 
            ((s.memberStoryIds || []).includes(selectedStory.id) || selectedStory.folderId === s.id)
          );
          if (subfolder) {
            navStories = activeStoriesList.filter(mem => 
              mem.storyId !== 'USERSTORY_FOLDER' && 
              mem.storyId !== 'INPUT_SOURCE' && 
              ((subfolder.memberStoryIds || []).includes(mem.id) || mem.folderId === subfolder.id)
            );
          } else {
            // Check if it belongs to a parent folder
            const folder = activeStoriesList.find(s => 
              s.storyId === 'USERSTORY_FOLDER' && 
              !s.parentFolderId && 
              ((s.memberStoryIds || []).includes(selectedStory.id) || s.folderId === selectedStory.folderId || s.id === selectedStory.folderId)
            );
            if (folder) {
              navStories = activeStoriesList.filter(mem => 
                mem.storyId !== 'USERSTORY_FOLDER' && 
                mem.storyId !== 'INPUT_SOURCE' && 
                ((folder.memberStoryIds || []).includes(mem.id) || mem.folderId === folder.id)
              );
            }
          }
        }

        // 4. If in stories view (Individual Stories)
        if (navStories.length === 0 && activeView === 'stories') {
          navStories = filteredStories.filter(s => s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE');
        }

        // 5. Fallback if still empty
        if (navStories.length === 0) {
          const fallback = individualStories.filter(s => s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE');
          navStories = fallback.length > 0 
            ? fallback 
            : activeStoriesList.filter(s => s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE');
        }

        // Safety guarantee: Ensure selectedStory is included in navStories so currentStoryIdx is never -1
        let currentStoryIdx = navStories.findIndex(s => s.id === selectedStory.id);
        if (currentStoryIdx === -1) {
          navStories = [selectedStory, ...navStories];
          currentStoryIdx = 0;
        }

        const totalStoriesCount = navStories.length;
        const hasPrev = currentStoryIdx > 0;
        const hasNext = currentStoryIdx < totalStoriesCount - 1;

        const handlePrevStory = () => {
          if (hasPrev) {
            const prevStory = navStories[currentStoryIdx - 1];
            setSelectedStory(prevStory);
            setStoryNavList(navStories);
          }
        };
        const handleNextStory = () => {
          if (hasNext) {
            const nextStory = navStories[currentStoryIdx + 1];
            setSelectedStory(nextStory);
            setStoryNavList(navStories);
          }
        };

        return (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] flex items-center justify-end animate-in fade-in duration-300"
          onClick={closeStoryDetails}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl h-full bg-white shadow-2xl p-8 overflow-y-auto animate-in slide-in-from-right duration-300 flex flex-col justify-between"
          >
            <div className="space-y-5">
              
              {/* Detail Panel Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 flex-shrink-0">
                    <Sparkles size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-slate-800 text-xs uppercase tracking-widest">User Story Details</h3>
                      {totalStoriesCount > 0 && (
                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full text-[10px] font-bold">
                          {currentStoryIdx + 1} of {totalStoriesCount}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-indigo-600 font-bold mt-0.5">{selectedStory.storyId || selectedStory.id}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {totalStoriesCount > 1 && (
                    <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80">
                      <button
                        type="button"
                        onClick={handlePrevStory}
                        disabled={!hasPrev}
                        className={`p-1.5 rounded-lg transition-all ${
                          hasPrev
                            ? 'bg-white hover:bg-slate-100 text-slate-700 shadow-xs cursor-pointer'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
                        title="Previous User Story (Left Arrow)"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextStory}
                        disabled={!hasNext}
                        className={`p-1.5 rounded-lg transition-all ${
                          hasNext
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer'
                            : 'text-slate-300 cursor-not-allowed'
                        }`}
                        title="Next User Story (Right Arrow)"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  <button 
                    onClick={closeStoryDetails}
                    className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-lg transition-all cursor-pointer"
                    title="Close details"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Sequential Navigation Bar */}
              {totalStoriesCount > 0 && (
                <div className="bg-gradient-to-r from-indigo-50/90 via-slate-50 to-emerald-50/70 border border-indigo-100 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-md text-[10px] font-mono font-black uppercase tracking-wider flex-shrink-0 shadow-xs">
                      Story {currentStoryIdx + 1} / {totalStoriesCount}
                    </span>
                    <span className="text-[11px] font-bold text-slate-600 truncate">
                      {hasNext 
                        ? `Next: ${navStories[currentStoryIdx + 1]?.summary || 'Next story'}` 
                        : (totalStoriesCount === 1 ? 'Viewing single story' : 'You are viewing the last story')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={handlePrevStory}
                      disabled={!hasPrev}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
                        hasPrev
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs cursor-pointer'
                          : 'bg-slate-100/60 text-slate-300 border border-transparent cursor-not-allowed'
                      }`}
                    >
                      <ChevronLeft size={14} /> Prev
                    </button>

                    <button
                      type="button"
                      onClick={handleNextStory}
                      disabled={!hasNext}
                      className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                        hasNext
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 cursor-pointer'
                          : 'bg-slate-100/60 text-slate-300 border border-transparent cursor-not-allowed shadow-none'
                      }`}
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {/* Story Content Block */}
              <div className="space-y-6">
                
                {/* SUMMARY */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded">Summary</span>
                    <button 
                      onClick={() => handleCopyToClipboard(selectedStory.id, 'Summary', selectedStory.summary)}
                      className="text-slate-400 hover:text-slate-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField?.id === selectedStory.id && copiedField?.field === 'Summary' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      <span>Copy</span>
                    </button>
                  </div>
                  <h4 className="text-base font-black text-slate-800 uppercase tracking-tight">{selectedStory.summary}</h4>
                </div>

                {/* INPUT DOCUMENT DOWNLOAD / VIEW CARD */}
                {selectedStory.storyId === 'INPUT_SOURCE' && (
                  <div className="bg-amber-50/40 border border-amber-100 p-5 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b border-amber-100/60">
                      <FileDown size={16} className="text-amber-600" />
                      <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">
                        Requirements Document Controls
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 font-medium">
                      You can download the original requirements document or its parsed text content below.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-2">
                      {/* Original File Download */}
                      {(selectedStory.fileBase64 || selectedFile) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedFile) {
                              const link = document.createElement('a');
                              link.href = URL.createObjectURL(selectedFile);
                              link.download = selectedFile.name;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              toast.success(`Downloading original file: ${selectedFile.name}`);
                            } else if (selectedStory.fileBase64) {
                              const fileName = selectedStory.fileName || 'Requirements_Doc.docx';
                              const byteCharacters = atob(selectedStory.fileBase64);
                              const byteNumbers = new Array(byteCharacters.length);
                              for (let i = 0; i < byteCharacters.length; i++) {
                                byteNumbers[i] = byteCharacters.charCodeAt(i);
                              }
                              const byteArray = new Uint8Array(byteNumbers);
                              const ext = fileName.split('.').pop()?.toLowerCase() || '';
                              let mimeType = 'application/octet-stream';
                              if (ext === 'pdf') mimeType = 'application/pdf';
                              else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                              else if (ext === 'doc') mimeType = 'application/msword';
                              else if (ext === 'txt') mimeType = 'text/plain';

                              const blob = new Blob([byteArray], { type: mimeType });
                              const link = document.createElement('a');
                              link.href = URL.createObjectURL(blob);
                              link.download = fileName;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              toast.success(`Downloading original file: ${fileName}`);
                            }
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-amber-100"
                        >
                          <Download size={14} />
                          Download File
                        </button>
                      )}

                      {/* Parsed Text Download */}
                      {(selectedStory.fileTextContent || (selectedFile && selectedStory.description)) && (
                        <button
                          type="button"
                          onClick={() => {
                            const textToDownload = selectedStory.fileTextContent || selectedStory.description;
                            const fileName = (selectedStory.fileName ? selectedStory.fileName.replace(/\.[^/.]+$/, "") : "Requirements") + "_Extracted_Text.txt";
                            const blob = new Blob([textToDownload], { type: 'text/plain;charset=utf-8' });
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = fileName;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            toast.success(`Downloading extracted text: ${fileName}`);
                          }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                        >
                          <FileText size={14} />
                          Download Text
                        </button>
                      )}
                    </div>

                    {/* Quick Text View Panel */}
                    {(selectedStory.fileTextContent || (selectedFile && selectedStory.description)) && (
                      <div className="mt-3 space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                          Extracted Text Snippet (Preview)
                        </label>
                        <div className="bg-slate-900 text-slate-300 font-mono text-[10px] p-3 rounded-xl max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800 scrollbar-thin">
                          {selectedStory.fileTextContent || selectedStory.description}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ATTACHED SCREENSHOTS / INPUT VISUALS */}
                {(() => {
                  const storyImages = (selectedStory.attachments && selectedStory.attachments.length > 0)
                    ? selectedStory.attachments 
                    : (selectedStory.screenshots || []).map(s => s.previewUrl || (s.data?.startsWith('data:') || s.data?.startsWith('http') ? s.data : `data:${s.mimeType || 'image/png'};base64,${s.data}`));
                  
                  if (!storyImages || storyImages.length === 0) return null;

                  return (
                    <div className="border border-indigo-100 bg-indigo-50/20 p-5 rounded-2xl space-y-3">
                      <div className="flex justify-between items-center pb-2 border-b border-indigo-100/60">
                        <span className="text-[9px] font-black text-indigo-700 uppercase tracking-widest bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                          Attached Screenshots ({storyImages.length})
                        </span>
                      </div>
                      <ScreenshotGallery
                        images={storyImages}
                        title="Input UI Screenshots"
                      />
                    </div>
                  );
                })()}

                {/* DESCRIPTION */}
                <div className="border border-slate-100 p-5 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">Description</span>
                    <button 
                      onClick={() => handleCopyToClipboard(selectedStory.id, 'Description', selectedStory.description)}
                      className="text-slate-400 hover:text-slate-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField?.id === selectedStory.id && copiedField?.field === 'Description' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      <span>Copy</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-700 font-medium leading-relaxed italic p-3 bg-slate-50/50 rounded-xl border border-slate-50">
                    {selectedStory.description}
                  </p>
                </div>

                {/* ACCEPTANCE CRITERIA */}
                <div className="border border-slate-100 p-5 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                    <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded">Acceptance Criteria</span>
                    <button 
                      onClick={() => handleCopyToClipboard(selectedStory.id, 'Acceptance Criteria', selectedStory.acceptanceCriteria)}
                      className="text-slate-400 hover:text-slate-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField?.id === selectedStory.id && copiedField?.field === 'Acceptance Criteria' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      <span>Copy</span>
                    </button>
                  </div>
                  <div className="text-xs p-5 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
                    {renderAcceptanceCriteria(selectedStory.acceptanceCriteria)}
                  </div>
                </div>

              </div>
            </div>

            {/* Actions Footer */}
            <div className="border-t border-slate-100 pt-5 mt-8 space-y-3">
              {totalStoriesCount > 1 && (
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={handlePrevStory}
                    disabled={!hasPrev}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                      hasPrev
                        ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-xs cursor-pointer'
                        : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                    }`}
                  >
                    <ChevronLeft size={15} /> Previous Story
                  </button>

                  <button 
                    type="button"
                    onClick={handleNextStory}
                    disabled={!hasNext}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md ${
                      hasNext
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100 cursor-pointer'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <span>Next Story</span> <ChevronRight size={15} />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    setStoriesToExport([selectedStory]);
                    setIsJiraExportModalOpen(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-indigo-100"
                >
                  <Sparkles size={14} /> Export to Jira
                </button>
                <button 
                  onClick={() => openModal(selectedStory)}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer"
                >
                  <Edit2 size={14} /> Edit Story
                </button>
                <button 
                  onClick={() => handleDeleteStory(selectedStory.id)}
                  className="flex-1 flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-600 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all cursor-pointer"
                >
                  <Trash2 size={14} /> Delete Story
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Manual Creation / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-xl bg-white rounded-[2rem] border border-slate-200 shadow-2xl p-8 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
              <div className="flex items-center gap-2.5">
                <Sparkles size={18} className="text-indigo-600" />
                <h3 className="text-base font-black text-slate-800 uppercase tracking-widest">
                  {editingStory ? 'Edit User Story' : 'Create Story Manually'}
                </h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-50 text-slate-400 hover:text-slate-700 rounded-lg transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStory} className="space-y-5 text-xs">
              
              {/* Summary */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Summary / Title *</label>
                <input
                  type="text"
                  required
                  value={formSummary || ''}
                  onChange={(e) => setFormSummary(e.target.value)}
                  placeholder="e.g., Secure User Logins with MFA"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all text-xs font-bold"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Description *</label>
                <textarea
                  required
                  rows={4}
                  value={formDescription || ''}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Format: As a [user], I want to [goal], so that [benefit]"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all text-xs leading-relaxed italic"
                />
              </div>

              {/* Acceptance Criteria */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Acceptance Criteria *</label>
                  <button
                    type="button"
                    onClick={() => setFormAcceptanceCriteria(formatAcceptanceCriteria(formAcceptanceCriteria))}
                    className="text-[9px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider underline cursor-pointer"
                  >
                    Format Given/When/Then
                  </button>
                </div>
                <textarea
                  required
                  rows={8}
                  value={formAcceptanceCriteria || ''}
                  onChange={(e) => setFormAcceptanceCriteria(e.target.value)}
                  onBlur={() => setFormAcceptanceCriteria(formatAcceptanceCriteria(formAcceptanceCriteria))}
                  placeholder={"Given [initial context],\nWhen [event occurs],\nThen [expected outcome]"}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white transition-all text-xs leading-relaxed font-mono whitespace-pre-wrap"
                />
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 transition-all cursor-pointer"
                >
                  {editingStory ? 'Save Changes' : 'Create User Story'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {isCreatingFolder && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white rounded-[2rem] border border-slate-200 shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-100">
                <FolderPlus size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">New Story Folder</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Organize requirements and stories</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block">Folder Name</label>
                <input 
                  type="text"
                  autoFocus
                  className={`w-full px-4 py-3.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner ${folderError ? 'border-rose-300' : 'border-slate-200'}`}
                  placeholder="e.g., Payment Gateway Integration"
                  value={newFolderName || ''}
                  onChange={e => { setNewFolderName(e.target.value); setFolderError(null); }}
                  onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                />
                {folderError && (
                  <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest mt-1 ml-1">{folderError}</p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); setFolderError(null); }}
                  className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateFolder}
                  disabled={isSavingFolder}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSavingFolder ? <Loader2 size={16} className="animate-spin" /> : null}
                  {isSavingFolder ? 'Saving...' : 'Create Folder'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Folder Selection & Review Modal */}
      {isFolderSelectModalOpen && storiesBeingSaved.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 border border-slate-200">
             
             {/* Header */}
             <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 border border-indigo-100">
                      <FolderPlus size={20} />
                   </div>
                   <div>
                      <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Save Stories to Folder</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Select items to save and choose a target folder</p>
                   </div>
                </div>
                <button 
                  onClick={handleCloseFolderSelectModal} 
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                >
                   <X size={18} />
                </button>
             </div>
             
             {/* Content */}
             <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
                
                {/* Target Folder Selection */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Target Folder</label>
                  
                  {/* Folder Mode Switcher */}
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateFolderInline(false);
                        setInlineFolderError(null);
                        if (allFolders.length > 0 && !selectedFolderIdForSave) {
                          setSelectedFolderIdForSave(allFolders[0].id);
                        }
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        !showCreateFolderInline
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Existing Folder
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateFolderInline(true);
                        setInlineFolderError(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        showCreateFolderInline
                          ? 'bg-white text-indigo-600 shadow-sm'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      + New Folder
                    </button>
                  </div>

                  {!showCreateFolderInline ? (
                    <div className="space-y-2">
                      {allFolders.length > 0 ? (
                        <div className="relative">
                          <select 
                            value={selectedFolderIdForSave || ''}
                            onChange={e => setSelectedFolderIdForSave(e.target.value)}
                            className="w-full pl-10 pr-8 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none appearance-none cursor-pointer hover:bg-white focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all text-slate-700"
                          >
                            <option value="">-- Select Existing Folder --</option>
                            {allFolders.map(m => (
                              <option key={m.id} value={m.id}>{m.summary}</option>
                            ))}
                          </select>
                          <Folder size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-indigo-500" />
                          <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                      ) : (
                        <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl text-amber-800 text-[11px] font-medium">
                          No existing folders found. Please select <strong>+ New Folder</strong> above to create one.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input 
                        autoFocus
                        value={inlineNewFolderName || ''} 
                        onChange={e => { setInlineNewFolderName(e.target.value); setInlineFolderError(null); }} 
                        className={`w-full px-4 py-3 bg-slate-50 border rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-800 ${inlineFolderError ? 'border-rose-300' : 'border-slate-200'}`} 
                        placeholder="Enter Folder Name (e.g. Authentication Module)" 
                      />
                      {inlineFolderError && (
                        <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest mt-0.5 ml-1">{inlineFolderError}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Items to Save Preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-1 px-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                      Confirm Stories to Save ({storiesBeingSaved.filter(s => s.storyId !== 'INPUT_SOURCE' && selectedStoriesToSave.has(s.id)).length}/{storiesBeingSaved.filter(s => s.storyId !== 'INPUT_SOURCE').length})
                    </span>
                    <button 
                      type="button"
                      onClick={() => {
                        const areAllChecked = storiesBeingSaved.length > 0 && storiesBeingSaved.every(s => selectedStoriesToSave.has(s.id));
                        if (areAllChecked) {
                          const next = new Set(selectedStoriesToSave);
                          storiesBeingSaved.forEach(s => next.delete(s.id));
                          setSelectedStoriesToSave(next);
                        } else {
                          const next = new Set(selectedStoriesToSave);
                          storiesBeingSaved.forEach(s => next.add(s.id));
                          setSelectedStoriesToSave(next);
                        }
                      }}
                      className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <CheckSquare size={12} />
                      {storiesBeingSaved.length > 0 && storiesBeingSaved.every(s => selectedStoriesToSave.has(s.id)) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100 p-3 bg-slate-50/50 space-y-2 custom-scrollbar">
                    {storiesBeingSaved.map(tc => {
                      const isInput = tc.storyId === 'INPUT_SOURCE';
                      const isSelected = selectedStoriesToSave.has(tc.id);
                      return (
                        <div 
                          key={tc.id} 
                          onClick={() => {
                            const next = new Set(selectedStoriesToSave);
                            if (next.has(tc.id)) {
                              next.delete(tc.id);
                            } else {
                              next.add(tc.id);
                            }
                            setSelectedStoriesToSave(next);
                          }}
                          className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                            isSelected 
                              ? 'border-indigo-500 bg-indigo-50/10 shadow-sm' 
                              : isInput 
                              ? 'border-amber-100 bg-amber-50/10' 
                              : 'border-slate-100 bg-white hover:border-slate-200'
                          }`}
                        >
                          <div className={`transition-all ${isSelected ? 'text-indigo-600' : 'text-slate-300'}`}>
                            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                          </div>
                          <div className={`p-1.5 rounded-lg ${isInput ? 'bg-amber-100 text-amber-700' : 'bg-indigo-50 text-indigo-600'}`}>
                            {isInput ? <Sparkles size={14} /> : <FileText size={14} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h6 className="text-xs font-bold text-slate-800 truncate">{tc.summary}</h6>
                            <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 tracking-wider">
                              {isInput ? 'Input Document' : 'User Story'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

             </div>

             {/* Footer Actions */}
             <div className="p-6 bg-white border-t border-slate-100 flex gap-3">
                <button 
                  onClick={handleCloseFolderSelectModal} 
                  className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
                >
                   Cancel
                </button>
                <button 
                  onClick={handleSaveStoriesToFolder} 
                  disabled={isSavingStories}
                  className="flex-1 py-3.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-100 active:scale-95 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                   {isSavingStories ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                   {isSavingStories ? 'Saving to Database...' : 'Save Items'}
                </button>
             </div>

          </div>
        </div>
      )}
      {managingFolder && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 border border-slate-200">
             
             {/* Header */}
             <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 border border-indigo-100">
                      <Layers size={20} />
                   </div>
                   <div>
                      <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">Manage Folder Contents</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.1em] mt-0.5">Folder: {managingFolder.summary.toUpperCase()}</p>
                   </div>
                </div>
                <button onClick={() => setManagingFolder(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-all cursor-pointer">
                  <X size={18} />
                </button>
             </div>
             
             {/* Content */}
             <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar text-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select stories to include in this folder</span>
                  <button 
                    onClick={handleToggleSelectAllMembers}
                    className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline cursor-pointer"
                  >
                    {tempMemberIds.size === allManageableStories.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                  {allManageableStories.map(s => {
                    const isSelected = tempMemberIds.has(s.id);
                    const isInput = s.storyId === 'INPUT_SOURCE';
                    return (
                      <div 
                        key={s.id}
                        onClick={() => toggleTempMember(s.id)}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected 
                            ? 'border-indigo-500 bg-indigo-50/5 shadow-sm' 
                            : isInput 
                            ? 'border-amber-100 bg-amber-50/5' 
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className={`mt-0.5 transition-all ${isSelected ? 'text-indigo-600' : 'text-slate-200'}`}>
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h6 className="text-xs font-bold text-slate-800 truncate">{s.summary}</h6>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5 tracking-wider">
                            {isInput ? 'Requirements Document' : `User Story`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
             </div>

             {/* Footer */}
             <div className="p-6 bg-white border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setManagingFolder(null)} 
                  className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
                >
                   Cancel
                </button>
                <button 
                  onClick={handleSaveFolderMembers} 
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-100 active:scale-95 transition-all cursor-pointer"
                >
                   Update Folder
                </button>
             </div>

          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 duration-200 border border-slate-200 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <Trash2 size={28} />
            </div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">
              {activeStoriesList.find(s => s.id === deleteTargetId)?.storyId === 'USERSTORY_FOLDER' ? 'Delete Folder' : 'Delete User Story'}
            </h3>
            <p className="text-xs text-slate-500 font-medium mb-6">
              {activeStoriesList.find(s => s.id === deleteTargetId)?.storyId === 'USERSTORY_FOLDER'
                ? 'Are you sure you want to delete this folder and permanently delete all of its contents? This action cannot be undone.'
                : 'Are you sure you want to delete this user story? This action cannot be undone.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => performDeleteStory(deleteTargetId)}
                className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden p-8 animate-in zoom-in-95 duration-200 border border-slate-200 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <Trash2 size={28} />
            </div>
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Bulk Delete Stories</h3>
            <p className="text-xs text-slate-500 font-medium mb-6">
              Are you sure you want to bulk delete the {selectedStoryIds.size} selected user stories? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={performBulkDelete}
                className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all cursor-pointer"
              >
                Bulk Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Stories in Subfolder Modal */}
      {isSubfolderModalOpen && subfolderParentFolder && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[2000] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border border-slate-100 space-y-6 animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <FolderPlus size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-wide">Save Stories in Subfolder</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Parent Folder: <span className="font-bold text-slate-700">{subfolderParentFolder.summary}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSubfolderModalOpen(false);
                  setSubfolderParentFolder(null);
                  setStoriesForSubfolder([]);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Preview Selected Stories */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Selected User Stories ({storiesForSubfolder.length})
              </label>
              <div className="max-h-36 overflow-y-auto space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                {storiesForSubfolder.map(s => (
                  <div key={s.id} className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-mono text-[9px] font-black rounded uppercase">
                      {s.storyId || s.id}
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">{s.summary}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Input Subfolder Name */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block">
                Subfolder Name (Defaulted to User Story Number)
              </label>
              <input
                type="text"
                value={subfolderNameInput || ''}
                onChange={(e) => {
                  setSubfolderNameInput(e.target.value);
                  setSubfolderInputError(null);
                }}
                placeholder="e.g. US-001, US-002"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              {subfolderInputError ? (
                <p className="text-[10px] font-bold text-rose-500">{subfolderInputError}</p>
              ) : (
                <p className="text-[10px] text-slate-400 font-medium">
                  By default, the subfolder name is set to the selected user story number(s). You can customize it if needed.
                </p>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsSubfolderModalOpen(false);
                  setSubfolderParentFolder(null);
                  setStoriesForSubfolder([]);
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSubfolder}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider shadow-md shadow-indigo-100 transition-all cursor-pointer flex items-center gap-2"
              >
                <FolderPlus size={14} />
                <span>Save in Subfolder</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Jira Story Export Modal */}
      <JiraUserStoryExportModal
        isOpen={isJiraExportModalOpen}
        onClose={() => setIsJiraExportModalOpen(false)}
        project={project}
        stories={storiesToExport}
        user={user}
      />

    </div>
  );
};

export default AIGeneratorUser;
