import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Code2,
  Film,
  Play,
  Download,
  Sparkles,
  Check,
  Copy,
  FileText,
  Layers,
  Folder,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit3,
  RefreshCw,
  Eye,
  EyeOff,
  Archive,
  FileCode,
  ShieldCheck,
  Save,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  X,
  FileSpreadsheet,
  Cpu,
  MonitorPlay,
  CheckSquare,
  Square,
  Clock,
  FolderPlus,
  FolderCheck,
  ListChecks,
  Maximize2,
  ZoomIn,
  Search,
  Filter,
  Globe,
  User as UserIcon,
  Lock,
  Upload,
  Image as ImageIcon,
  HelpCircle,
  Package,
  Plus,
  GitBranch,
  Send,
  CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Project,
  AutomationScript,
  AutomationScriptFile,
  AutomationTool,
  ProgrammingLanguage,
  TestCase,
  TestStatus,
  TestType,
  TestIntent,
  TestPriority,
  TestScenario,
  User,
  VectorSearchResult,
  isApiTestingScenario,
  isApiTestingCase
} from '../types';
import { ScreenshotUploader, ScreenshotFile } from './ScreenshotUploader';
import { VideoInputUploader, VideoWalkthroughData } from './VideoInputUploader';
import { RAGStatusBadge } from './RAGStatusBadge';
import { GithubPushModal } from './GithubPushModal';
import { JiraSyncModal } from './JiraSyncModal';
import { synthesizeMissingPOMFileContent, ensureCompleteProjectFiles } from '../services/codeGenerators/multiFrameworkScriptGenerator';
import {
  generateAutomationScript,
  refineAutomationScript,
  appendToAutomationScript,
  generateFallbackAutomationScript
} from '../geminiService';
import { logActivity } from '../services/activityService';
import { deductProjectCredits, deductExportCredits, canPerformAction } from '../services/creditService';
import { getDeletedIds, addDeletedIds } from '../services/projectService';
import { deleteFolderFromFirestore } from '../services/folderPersistenceService';
import { getProjectBackup, saveProjectBackup, filterDeletedScriptFiles } from '../services/storageBackupService';
import { formatScriptLanguageAndFramework } from '../utils/automationFrameworkOptions';
import { generateUniqueFolderId } from '../utils/idGenerator';

interface ScriptGeneratorProps {
  project: Project;
  user: User;
  onUpdateProject: (p: Project) => void;
  viewOnly?: boolean;
  initialFolderId?: string;
  initialFolderName?: string;
  onClearInitialFolder?: () => void;
}

// Utility to parse generated markdown output into individual files
export const parseScriptIntoFiles = (
  rawMarkdown: string,
  tool: AutomationTool = 'Playwright',
  language: ProgrammingLanguage = 'TypeScript'
): AutomationScriptFile[] => {
  if (!rawMarkdown || rawMarkdown.trim().length === 0) return [];

  const defaultExt = language === 'Python' ? 'py' : language === 'Java' ? 'java' : language === 'TypeScript' ? 'ts' : 'js';

  // 1. Find all markdown code blocks with start and end indices
  const codeBlockRegex = /```([a-zA-Z0-9_\-./\\]*)\n([\s\S]*?)```/g;
  const blocks: { langTag: string; content: string; startIndex: number; endIndex: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(rawMarkdown)) !== null) {
    if (match[2] !== undefined) {
      blocks.push({
        langTag: (match[1] || '').trim(),
        content: match[2].trim(),
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
  }

  if (blocks.length === 0) {
    // If no code blocks found, return content as single file
    return [{ path: `script.${defaultExt}`, content: rawMarkdown.trim() }];
  }

  // Helper to validate and clean a candidate path string
  const cleanCandidatePath = (candidate: string | null | undefined): string | null => {
    if (!candidate || typeof candidate !== 'string') return null;
    let p = candidate.trim();
    // Remove backticks, quotes, asterisks, hashtags, colons, leading/trailing dashes
    p = p.replace(/^[`"'*#\s:–—-]+|[`"'*#\s:–—-]+$/g, '').trim();
    // Strip prefixes like "File 1:", "1.", "File:", "1 -", etc.
    p = p.replace(/^(?:File\s*\d*\s*[:–—\-]\s*|\d+[\.)\s–—\-]+\s*)/i, '').trim();
    p = p.replace(/^[`"'*#\s:–—-]+|[`"'*#\s:–—-]+$/g, '').trim();

    // Check invalid candidate
    if (!p || p === '---' || p.startsWith('---') || p === '--' || p === '***' || p === '___') return null;
    if (/^(?:Section|Configuration|Step\s*\d*|Overview|Architecture|Project\s*Structure|Test\s*Cases?|Features?|Summary|Notes?)$/i.test(p)) {
      return null;
    }

    return p;
  };

  const files: AutomationScriptFile[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;
    const prevEndIndex = i === 0 ? 0 : blocks[i - 1].endIndex;
    const precedingText = (rawMarkdown || '').substring(prevEndIndex, block.startIndex).trim();

    let resolvedPath: string | null = null;

    // A. Check if the code fence lang tag contains a file path, e.g. ```javascript:utils/envUtils.js
    if (block.langTag && block.langTag.includes(':')) {
      const parts = block.langTag.split(':');
      const tagCandidate = cleanCandidatePath(parts.slice(1).join(':'));
      if (tagCandidate && tagCandidate.includes('.')) {
        resolvedPath = tagCandidate;
      }
    }

    // B. Inspect lines in preceding text backwards (closest to code block first)
    if (!resolvedPath && precedingText) {
      const lines = precedingText.split('\n').map(l => l.trim()).filter(Boolean);
      for (let j = lines.length - 1; j >= 0; j--) {
        const line = lines[j];
        // Skip horizontal dividers or markdown headings that are just separators like ### ---
        if (line === '---' || line === '***' || line === '___' || /^#{1,6}\s*-{2,}$/.test(line)) {
          continue;
        }

        // Pattern 1: Heading with backticks: ### `path/file.ext` or #### `file.ext` or ## `file.ext`
        const backtickMatch = line.match(/(?:^|\s|#|File:?|File\s*\d+:?)\s*`([^`\n]+)`/i);
        if (backtickMatch && backtickMatch[1]) {
          const candidate = cleanCandidatePath(backtickMatch[1]);
          if (candidate && (candidate.includes('.') || candidate.includes('/'))) {
            resolvedPath = candidate;
            break;
          }
        }

        // Pattern 2: Heading with plain path: ### 1. path/file.ext or ### path/file.ext
        const headingMatch = line.match(/^#{1,6}\s*(?:(?:File\s*\d*|\d+)[:.)\s–—\-]+)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_-]+|[a-zA-Z0-9_\-./\\]+)/);
        if (headingMatch && headingMatch[1]) {
          const candidate = cleanCandidatePath(headingMatch[1]);
          if (candidate && (candidate.includes('.') || candidate.includes('/'))) {
            resolvedPath = candidate;
            break;
          }
        }

        // Pattern 3: Bold text line: **File:** `path/file.ext` or **`path/file.ext`**
        const boldMatch = line.match(/\*\*(?:File:?\s*)?`?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_-]+|[a-zA-Z0-9_\-./\\]+)`?\*\*/i);
        if (boldMatch && boldMatch[1]) {
          const candidate = cleanCandidatePath(boldMatch[1]);
          if (candidate && (candidate.includes('.') || candidate.includes('/'))) {
            resolvedPath = candidate;
            break;
          }
        }

        // Pattern 4: Bullet item: * `path/file.ext` or - path/file.ext
        const listMatch = line.match(/^[-*•]\s*(?:`([^`\n]+)`|([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_-]+))/);
        if (listMatch) {
          const candidate = cleanCandidatePath(listMatch[1] || listMatch[2]);
          if (candidate && (candidate.includes('.') || candidate.includes('/'))) {
            resolvedPath = candidate;
            break;
          }
        }
      }
    }

    // C. Check inside the first 4 lines of code content for path comments:
    // e.g. // utils/envUtils.js or # .env or <!-- pom.xml --> or // filepath: ...
    if (!resolvedPath && block.content) {
      const contentLines = block.content.split('\n').slice(0, 4);
      for (const cLine of contentLines) {
        const commentMatch = cLine.match(/^(?:\/\/|#|\/\*|<!--)\s*(?:filepath:?\s*|file:?\s*)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_-]+)/i);
        if (commentMatch && commentMatch[1]) {
          const candidate = cleanCandidatePath(commentMatch[1]);
          if (candidate && (candidate.includes('.') || candidate.includes('/'))) {
            resolvedPath = candidate;
            break;
          }
        }
      }
    }

    // D. Smart Content Analysis Heuristics
    if (!resolvedPath || resolvedPath === '---' || !resolvedPath.includes('.')) {
      const code = block.content || '';
      if (code.includes('APP_PACKAGE=') || code.includes('BASE_URL=') || /^[A-Z0-9_]+=[^\n]*/m.test(code)) {
        resolvedPath = language === 'Java' ? 'src/test/resources/config.properties' : '.env';
      } else if (code.includes('"name":') && (code.includes('"dependencies":') || code.includes('"devDependencies":') || code.includes('"scripts":'))) {
        resolvedPath = language === 'Java' ? 'pom.xml' : 'package.json';
      } else if (code.includes('<suite') && (code.includes('testng.org') || code.includes('</suite>'))) {
        resolvedPath = 'testng.xml';
      } else if (code.includes('<project') && (code.includes('http://maven.apache.org') || code.includes('</project>'))) {
        resolvedPath = 'pom.xml';
      } else if (code.includes('wdio.conf') || code.includes('exports.config') || (code.includes('runner: \'local\'') && code.includes('specs:'))) {
        resolvedPath = `wdio.conf.${defaultExt === 'ts' ? 'ts' : 'js'}`;
      } else if (code.includes('defineConfig') || (code.includes('@playwright/test') && (code.includes('testDir:') || code.includes('use: {')))) {
        resolvedPath = language === 'Java' ? 'pom.xml' : `playwright.config.${defaultExt === 'ts' ? 'ts' : 'js'}`;
      } else if (code.includes('class BaseTest') || code.includes('public class BaseTest')) {
        resolvedPath = language === 'Java' ? 'src/test/java/tests/BaseTest.java' : `tests/BaseTest.${defaultExt}`;
      } else if (/class\s+([A-Za-z0-9_]+Test)\b/.test(code)) {
        const m = code.match(/class\s+([A-Za-z0-9_]+Test)\b/);
        resolvedPath = language === 'Java' ? `src/test/java/tests/${m![1]}.java` : `tests/${m![1]}.${defaultExt}`;
      } else if (code.includes('class BasePage') || code.includes('export class BasePage')) {
        resolvedPath = language === 'Java' ? 'src/main/java/pages/BasePage.java' : `pages/BasePage.${defaultExt}`;
      } else if (/class\s+([A-Za-z0-9_]+Page)\b/.test(code)) {
        const m = code.match(/class\s+([A-Za-z0-9_]+Page)\b/);
        resolvedPath = language === 'Java' ? `src/main/java/pages/${m![1]}.java` : `pages/${m![1]}.${defaultExt}`;
      } else if (/class\s+([A-Za-z0-9_]+Utils|[A-Za-z0-9_]+Helper)\b/.test(code)) {
        const m = code.match(/class\s+([A-Za-z0-9_]+Utils|[A-Za-z0-9_]+Helper)\b/);
        resolvedPath = language === 'Java' ? `src/main/java/utils/${m![1]}.java` : `utils/${m![1]}.${defaultExt}`;
      } else if (code.trim().startsWith('{') || code.trim().startsWith('[')) {
        try {
          JSON.parse(code);
          resolvedPath = language === 'Java' ? 'src/test/resources/testData.json' : `data/testData.json`;
        } catch {
          resolvedPath = language === 'Java' ? `src/test/resources/testData_${i + 1}.json` : `data/testData_${i + 1}.json`;
        }
      } else if (code.includes('cucumber') || code.includes('cucumber.js') || code.includes('require(\'@cucumber/cucumber\')') || code.includes('from \'@cucumber/cucumber\'')) {
        resolvedPath = language === 'Java' ? 'pom.xml' : 'cucumber.js';
      } else if (/^\s*(?:@[\w-]+\s+)*Feature:\s*/m.test(code) || (code.includes('Feature:') && code.includes('Scenario:')) || block.langTag === 'gherkin' || block.langTag === 'feature' || block.langTag === 'cucumber') {
        const featMatch = code.match(/Feature:\s*([^\n\r]+)/i);
        const featSlug = featMatch ? featMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30) : `feature_${i + 1}`;
        resolvedPath = language === 'Java' ? `src/test/resources/features/${featSlug}.feature` : `features/${featSlug}.feature`;
      } else if (code.includes('Given(') || code.includes('When(') || code.includes('Then(') || code.includes('createBdd(') || code.includes('@Given') || code.includes('@When') || code.includes('@Then')) {
        const stepMatch = code.match(/(?:Given|When|Then)\(\s*['"`]([^'"`\n]+)['"`]/) || code.match(/@(?:Given|When|Then)\(\s*['"`]([^'"`\n]+)['"`]/);
        const stepSlug = stepMatch ? stepMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 25) : `steps_${i + 1}`;
        resolvedPath = language === 'Java' ? `src/test/java/stepdefinitions/${stepSlug.charAt(0).toUpperCase() + stepSlug.slice(1)}Steps.java` : `steps/${stepSlug}.steps.${defaultExt}`;
      } else if (code.includes('test(') || code.includes('describe(') || code.includes('it(') || code.includes('@Test') || code.includes('def test_')) {
        const testNameMatch = code.match(/(?:test|describe|it)\(\s*['"`]([^'"`\n]+)['"`]/) || code.match(/public\s+void\s+([A-Za-z0-9_]+)\s*\(/);
        const slug = (testNameMatch && testNameMatch[1]) ? testNameMatch[1].toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20) : `test_${i + 1}`;
        resolvedPath = language === 'Java' ? `src/test/java/tests/${slug.charAt(0).toUpperCase() + slug.slice(1)}Test.java` : `tests/${slug}.spec.${defaultExt}`;
      } else if (code.startsWith('# ') || code.includes('## Instructions') || code.includes('## How to run')) {
        resolvedPath = 'README.md';
      } else {
        resolvedPath = `file_${i + 1}.${defaultExt}`;
      }
    }

    // Final clean
    const rawResolved = resolvedPath && typeof resolvedPath === 'string' ? resolvedPath : `file_${i + 1}.${defaultExt}`;
    let cleaned = rawResolved.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (!cleaned || cleaned === '---' || cleaned.startsWith('---')) {
      cleaned = `file_${i + 1}.${defaultExt}`;
    }

    // Ensure feature files keep proper .feature extension
    if (cleaned.startsWith('features/') && !cleaned.endsWith('.feature')) {
      cleaned = cleaned.replace(/\.[a-zA-Z0-9]+$/, '') + '.feature';
    }

    // Ensure Java language produces Java files, not JS/TS
    if (language === 'Java') {
      if (cleaned.endsWith('.spec.java')) {
        cleaned = cleaned.replace('.spec.java', 'Test.java');
      } else if (cleaned.endsWith('.js') || cleaned.endsWith('.ts')) {
        const code = block.content || '';
        if (code.includes('<project') || cleaned.includes('package.json')) {
          cleaned = 'pom.xml';
        } else if (code.includes('<suite') || cleaned.includes('testng')) {
          cleaned = 'testng.xml';
        } else if (cleaned.includes('config') || code.includes('BASE_URL=')) {
          cleaned = 'src/test/resources/config.properties';
        } else if (code.includes('@Test') || code.includes('class ') || code.includes('package ')) {
          cleaned = cleaned.replace(/\.(?:spec\.)?(?:js|ts)$/i, '.java');
          if (cleaned.endsWith('.java') && !cleaned.includes('/') && code.includes('class ')) {
            const m = code.match(/class\s+([A-Za-z0-9_]+)\b/);
            const className = m ? m[1] : 'AppTest';
            cleaned = className.endsWith('Page') ? `src/main/java/pages/${className}.java` : `src/test/java/tests/${className}.java`;
          }
        } else {
          cleaned = cleaned.replace(/\.(?:spec\.)?(?:js|ts)$/i, '.java');
        }
      }
    }

    files.push({
      path: cleaned,
      content: block.content || ''
    });
  }

  // Ensure ALL file paths are completely unique
  const seenPaths = new Map<string, number>();
  for (let i = 0; i < files.length; i++) {
    const orig = files[i].path;
    const count = seenPaths.get(orig) || 0;
    seenPaths.set(orig, count + 1);
    if (count > 0) {
      const dotIdx = orig.lastIndexOf('.');
      if (dotIdx > 0) {
        files[i].path = `${orig.slice(0, dotIdx)}_${count + 1}${orig.slice(dotIdx)}`;
      } else {
        files[i].path = `${orig}_${count + 1}`;
      }
    }
  }

  // Ensure .env file is ALWAYS included in parsed script files
  const hasEnvFile = files.some(f => 
    f.path === '.env' || 
    f.path.endsWith('/.env') || 
    f.path.endsWith('.env') ||
    f.path === 'src/test/resources/config.properties' ||
    f.path.endsWith('/config.properties')
  );

  if (!hasEnvFile && files.length > 0) {
    // Extract base URL from rawMarkdown or existing files if possible
    let extractedUrl = 'https://example.com';
    const urlMatch = rawMarkdown.match(/https?:\/\/[^\s'"`<>{}()]+/i) ||
      files.map(f => f.content).join('\n').match(/https?:\/\/[^\s'"`<>{}()]+/i);
    if (urlMatch) {
      extractedUrl = urlMatch[0].replace(/[;,.'"]+$/, '');
    }

    let username = 'qa_automation_user';
    const emailMatch = rawMarkdown.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
    if (emailMatch) {
      username = emailMatch[0];
    }

    const envContent = language === 'Java'
      ? `# Environment Configuration\nbaseUrl=${extractedUrl}\ntestUsername=${username}\ntestPassword=secure_password_placeholder\nbrowser=chrome\ntimeout=30000`
      : `# Environment Configuration\nBASE_URL=${extractedUrl}\nTEST_USERNAME=${username}\nTEST_PASSWORD=secure_password_placeholder\nHEADLESS=true\nBROWSER=chromium\nTIMEOUT=30000`;

    files.unshift({
      path: '.env',
      content: envContent
    });
  }

  return files;
};

/**
 * Detects files that should be deleted/removed based on refinement instruction,
 * explicit DELETED_FILES tags, or AI explanation confirmations.
 */
export const detectRemovedFilesFromRefinement = (
  userPrompt: string,
  aiResponse: string,
  existingFiles: AutomationScriptFile[] = []
): string[] => {
  if (!existingFiles || existingFiles.length === 0) return [];

  const removedPaths = new Set<string>();
  const promptLower = (userPrompt || '').toLowerCase();
  const responseLower = (aiResponse || '').toLowerCase();

  // 1. Check for explicit DELETED_FILES line: DELETED_FILES: file1.ts, file2.ts
  const deletedFilesHeaderRegex = /DELETED_FILES\s*:\s*([^\n\r]+)/gi;
  let dfMatch: RegExpExecArray | null;
  while ((dfMatch = deletedFilesHeaderRegex.exec(aiResponse)) !== null) {
    if (dfMatch[1]) {
      const items = dfMatch[1].split(/[,;]/);
      for (const item of items) {
        const clean = item.replace(/[`"'*#\s]/g, '').trim().toLowerCase();
        if (clean) {
          for (const ef of existingFiles) {
            const normEf = ef.path.replace(/\\/g, '/').toLowerCase();
            const efBase = normEf.split('/').pop() || normEf;
            if (normEf === clean || efBase === clean || normEf.endsWith(`/${clean}`)) {
              removedPaths.add(ef.path);
            }
          }
        }
      }
    }
  }

  // 2. Check for AI confirmation patterns in explanation (before code blocks or in general text)
  // e.g. "removed tests/login.spec.ts", "deleted file LoginPage.ts", "the file cart.spec.ts has been removed"
  const confirmationPhrases = [
    /(?:has been|was|is)\s+(?:successfully\s+)?(?:removed|deleted|excluded|purged|pruned)/i,
    /(?:successfully\s+)?(?:removed|deleted|excluded|purged)\s+(?:the\s+)?(?:file\s+)?/i,
    /(?:removing|deleting)\s+(?:the\s+)?(?:file\s+)?/i
  ];

  // 3. For each existing file, check if prompt or response signals its deletion
  for (const ef of existingFiles) {
    const normEf = ef.path.replace(/\\/g, '/').toLowerCase();
    const efBase = normEf.split('/').pop() || normEf;
    const efNameNoExt = efBase.replace(/\.[a-zA-Z0-9]+$/, '');

    // Check if user prompt mentions removing/deleting this specific file
    const removeKeywords = ['remove', 'delete', 'drop', 'exclude', 'get rid of', 'purge', 'omit'];
    const promptHasRemoveIntent = removeKeywords.some(kw => promptLower.includes(kw));

    const promptMentionsFile = promptLower.includes(normEf) ||
      promptLower.includes(efBase) ||
      (efNameNoExt.length > 3 && promptLower.includes(efNameNoExt));

    if (promptHasRemoveIntent && promptMentionsFile) {
      // Check if prompt specifically combines remove/delete with the file name
      const directRemovalRegex = new RegExp(
        `(?:remove|delete|drop|exclude|purge|omit|discard)\\s+(?:the\\s+)?(?:file\\s+)?(?:[\`'"])?(?:${escapeRegExp(normEf)}|${escapeRegExp(efBase)}|${escapeRegExp(efNameNoExt)})(?:[\`'"])?`,
        'i'
      );
      if (directRemovalRegex.test(userPrompt)) {
        removedPaths.add(ef.path);
        continue;
      }
    }

    // Check if AI response confirms removal of this file
    const responseMentionsFile = responseLower.includes(normEf) || responseLower.includes(efBase);
    if (responseMentionsFile) {
      for (const rx of confirmationPhrases) {
        const surroundingContextRegex = new RegExp(
          `(?:${escapeRegExp(efBase)}|${escapeRegExp(normEf)})[\\s\\S]{0,100}${rx.source}|${rx.source}[\\s\\S]{0,100}(?:${escapeRegExp(efBase)}|${escapeRegExp(normEf)})`,
          'i'
        );
        if (surroundingContextRegex.test(aiResponse)) {
          removedPaths.add(ef.path);
          break;
        }
      }
    }
  }

  return Array.from(removedPaths);
};

// Helper to escape regex special characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const ScriptGenerator: React.FC<ScriptGeneratorProps> = ({
  project,
  user,
  onUpdateProject,
  viewOnly = false,
  initialFolderId,
  initialFolderName,
  onClearInitialFolder
}) => {
  // Navigation Tabs: FOLDERS | SCRIPT FOLDERS | IMPORTED SCRIPT FOLDERS
  const userManuallySwitchedTabRef = useRef(false);
  const [activeTab, setActiveTabState] = useState<'folders' | 'scripts' | 'imported'>(() => {
    try {
      const saved = sessionStorage.getItem(`automatiqa_script_gen_tab_${project.id}`);
      if (saved === 'folders' || saved === 'scripts' || saved === 'imported') {
        return saved;
      }
    } catch (e) {}
    return 'folders';
  });

  const setActiveTab = useCallback((tab: 'folders' | 'scripts' | 'imported') => {
    setActiveTabState(tab);
    try {
      sessionStorage.setItem(`automatiqa_script_gen_tab_${project.id}`, tab);
    } catch (e) {}
  }, [project.id]);
  const [searchQuery, setSearchQuery] = useState('');
  const [artifactFilter, setArtifactFilter] = useState('');

  // Automation Configuration (Matches Image 1) - Defaults unselected per requirement
  const [selectedTool, setSelectedTool] = useState<AutomationTool | ''>('');
  const [selectedLanguage, setSelectedLanguage] = useState<ProgrammingLanguage | ''>('');
  const [pomPopupMessage, setPomPopupMessage] = useState<{
    title: string;
    description: string;
    type: 'info' | 'warning' | 'success';
  } | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [appPackage, setAppPackage] = useState('');

  // Global Test Context & Security
  const [contextEmail, setContextEmail] = useState('');
  const [contextPassword, setContextPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // RAG Toggle
  const [ragEnabled, setRagEnabled] = useState(true);
  const [retrievedRagChunks, setRetrievedRagChunks] = useState<VectorSearchResult[]>([]);

  // Selection States
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteScriptsConfirm, setShowBulkDeleteScriptsConfirm] = useState(false);
  const [showBulkDeleteCasesConfirm, setShowBulkDeleteCasesConfirm] = useState(false);
  const [showBulkDeleteFoldersConfirm, setShowBulkDeleteFoldersConfirm] = useState(false);

  // Screenshot & Video Accordion
  const [isScreenshotAccordionOpen, setIsScreenshotAccordionOpen] = useState(false);
  const [screenshots, setScreenshots] = useState<ScreenshotFile[]>([]);
  const [videoData, setVideoData] = useState<VideoWalkthroughData | null>(null);

  // Instruction Field
  const [instructionText, setInstructionText] = useState('');

  // Generating State
  const [isGenerating, setIsGenerating] = useState(false);

  // Unsaved / Draft Scripts (Generated but pending manual save by user)
  const [unsavedScripts, setUnsavedScripts] = useState<AutomationScript[]>(() => {
    try {
      const stored = sessionStorage.getItem(`automatiqa_unsaved_scripts_${project.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  });

  // Sync unsaved draft scripts with sessionStorage
  useEffect(() => {
    try {
      if (unsavedScripts.length > 0) {
        sessionStorage.setItem(`automatiqa_unsaved_scripts_${project.id}`, JSON.stringify(unsavedScripts));
      } else {
        sessionStorage.removeItem(`automatiqa_unsaved_scripts_${project.id}`);
      }
    } catch (e) {}
  }, [unsavedScripts, project.id]);

  // Clean up unsavedScripts when scripts are deleted, already saved, or empty/corrupted
  useEffect(() => {
    const deletedIds = getDeletedIds();
    const savedIds = new Set((project.automationScripts || []).map(s => s.id));

    setUnsavedScripts(prev => {
      const next = prev.filter(s => {
        if (!s || !s.id) return false;
        if (deletedIds.has(s.id) || deletedIds.has(s.id.toLowerCase())) return false;
        if (savedIds.has(s.id)) return false;
        if (!s.content && (!s.files || s.files.length === 0)) return false;
        return true;
      });
      if (next.length !== prev.length) {
        return next;
      }
      return prev;
    });
  }, [project.automationScripts]);

  // Accordion state for Unsaved Drafts item in Script Generated view
  const [expandedUnsavedDrafts, setExpandedUnsavedDrafts] = useState<boolean>(true);

  // Save Script to Folder Modal State
  const [saveModalScript, setSaveModalScript] = useState<{
    script: AutomationScript;
    title: string;
    folderMode: 'concern' | 'existing' | 'new';
    selectedFolderId: string;
    selectedFolderName: string;
    newFolderName: string;
    concernFolderId: string;
    concernFolderName: string;
  } | null>(null);

  // Append to Script Modal State
  const [appendModalScript, setAppendModalScript] = useState<{
    script: AutomationScript;
    selectedCaseIds: Set<string>;
    instruction: string;
    searchQuery: string;
    isSubmitting: boolean;
    statusMessage?: string;
  } | null>(null);

  // Repository Folder Filter ('ALL', '__UNSAVED__', or specific folder name)
  const [selectedRepositoryFolder, setSelectedRepositoryFolder] = useState<string>('ALL');

  // Script Folders tab accordion state
  const [expandedScriptFolders, setExpandedScriptFoldersState] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem(`automatiqa_expanded_script_folders_${project.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch (e) {}
    return new Set<string>();
  });

  const setExpandedScriptFolders = useCallback((action: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setExpandedScriptFoldersState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      try {
        sessionStorage.setItem(`automatiqa_expanded_script_folders_${project.id}`, JSON.stringify(Array.from(next)));
      } catch (e) {}
      return next;
    });
  }, [project.id]);
  const [isAddingScriptFolder, setIsAddingScriptFolder] = useState(false);
  const [newScriptFolderInput, setNewScriptFolderInput] = useState('');

  // Explicitly user-created script folders (via "+ New Folder" in Script Generator)
  const [userCreatedFolderNames, setUserCreatedFolderNames] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    (project.automationFolders || []).forEach(f => {
      if ((f as any).isUserCreatedScriptFolder && f.name) {
        initial.add(f.name.trim().toLowerCase());
      }
    });
    return initial;
  });

  // Test Case Folders tab accordion state
  const [expandedTestCaseFolders, setExpandedTestCaseFolders] = useState<Set<string>>(new Set());
  const [expandedCaseDetails, setExpandedCaseDetails] = useState<Set<string>>(new Set());

  const toggleExpandTestCaseFolder = (folderId: string) => {
    setExpandedTestCaseFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const toggleExpandCaseDetails = (caseId: string) => {
    setExpandedCaseDetails(prev => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  // Refinement Prompts map by script ID
  const [refinementPrompts, setRefinementPrompts] = useState<{ [scriptId: string]: string }>({});
  const [refiningScriptId, setRefiningScriptId] = useState<string | null>(null);

  // Edit Script Title Modal State
  const [editingScript, setEditingScript] = useState<AutomationScript | null>(null);
  const [editTitleText, setEditTitleText] = useState('');

  // Delete Confirmation States
  const [deleteCaseTarget, setDeleteCaseTarget] = useState<{ scenarioId: string; testCaseId: string; title: string } | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<TestScenario | null>(null);
  const [deleteScriptFolderTarget, setDeleteScriptFolderTarget] = useState<{
    folderId: string;
    folderName: string;
    scriptCount: number;
    scripts: AutomationScript[];
    isImported?: boolean;
  } | null>(null);
  const [deleteScriptTarget, setDeleteScriptTarget] = useState<AutomationScript | null>(null);

  // Modals for GitHub & Jira
  const [selectedScriptForGithub, setSelectedScriptForGithub] = useState<AutomationScript | null>(null);
  const [selectedScriptForJira, setSelectedScriptForJira] = useState<AutomationScript | null>(null);

  // Active focused file in POM structure view per script (defaults to '__all__')
  const [activeScriptFile, setActiveScriptFile] = useState<{ [scriptId: string]: string }>({});

  // File Upload Refs
  const importScriptFileRef = useRef<HTMLInputElement>(null);
  const importFolderRef = useRef<HTMLInputElement>(null);

  // Helper to determine if a scenario represents an actual folder
  const isAnyFolder = useCallback((s: TestScenario): boolean => {
    if (!s) return false;
    if (isApiTestingScenario(s)) return false;
    if (s.scenarioId === 'INPUT_SOURCE') return false;

    return Boolean(
      s.isFolder ||
      s.scenarioId === 'TESTCASE_FOLDER' ||
      s.scenarioId === 'SCENARIO_FOLDER' ||
      s.scenarioId === 'MANUAL_FOLDER' ||
      s.scenarioId === 'SCRIPT_GENERATOR_FOLDER' ||
      (typeof s.scenarioId === 'string' && s.scenarioId.endsWith('_FOLDER')) ||
      s.folderType === 'testcase' ||
      s.folderType === 'scenario' ||
      s.folderType === 'manual' ||
      s.folderType === 'script_generator' ||
      (Array.isArray(s.memberScenarioIds) && s.memberScenarioIds.length > 0) ||
      (Array.isArray(s.testCases) && s.testCases.length > 1)
    );
  }, []);

  // Helper to determine if an item is a folder belonging to the AI Scenarios module
  const isAIScenarioFolder = useCallback((s: TestScenario): boolean => {
    if (!s) return false;
    // Strictly preserve test case folders, script generator folders, and manual folders
    if (s.scenarioId === 'TESTCASE_FOLDER' || s.folderType === 'testcase') return false;
    if (s.scenarioId === 'SCRIPT_GENERATOR_FOLDER' || s.folderType === 'script_generator') return false;
    if (s.scenarioId === 'MANUAL_FOLDER' || s.folderType === 'manual') return false;
    if (isApiTestingScenario(s)) return false;

    return Boolean(
      s.scenarioId === 'SCENARIO_FOLDER' ||
      s.folderType === 'scenario' ||
      s.moduleName === 'AI SCENARIOS' ||
      (s.isFolder && (s.folderType === 'scenario' || s.moduleName === 'AI SCENARIOS'))
    );
  }, []);

  // Helper to determine if a scenario is strictly a Script Generator saved folder
  const isScriptGeneratorFolder = useCallback((s: TestScenario): boolean => {
    if (!s) return false;
    if (isApiTestingScenario(s)) return false;
    if (isAIScenarioFolder(s)) return false;

    // Explicitly check for Script Generator folder types
    const isExplicitSg = 
      s.folderType === 'script_generator' ||
      s.scenarioId === 'SCRIPT_GENERATOR_FOLDER' ||
      s.moduleName === 'Script Generator' ||
      Boolean((s as any).savedToScriptGenerator);

    if (isExplicitSg) return true;

    const sTitle = (s.title || '').trim().toLowerCase();
    if (sTitle && (project.automationFolders || []).some(af => af.type === 'script_generator' && af.name.trim().toLowerCase() === sTitle)) {
      return true;
    }

    return false;
  }, [isApiTestingScenario, isAIScenarioFolder, project.automationFolders]);

  // Helper to determine if an item is an individual scenario from the AI Scenarios page
  const isAIScenario = useCallback((s: TestScenario): boolean => {
    if (!s) return false;
    if (isApiTestingScenario(s)) return false;
    if (s.scenarioId === 'INPUT_SOURCE') return false;
    if (isAIScenarioFolder(s)) return true;

    // Items from AI Scenarios module or scenario folderType
    if (s.moduleName === 'AI SCENARIOS' || s.folderType === 'scenario') return true;

    // Items with scenario ID prefix TS- or SC- generated in AI Scenarios page
    if (typeof s.scenarioId === 'string' && (s.scenarioId.startsWith('TS-') || s.scenarioId.startsWith('SC-'))) {
      return true;
    }

    // Scenarios that have no explicit child test cases
    // (AI Scenarios page produces high-level scenarios without child test case objects)
    if (!s.testCases || s.testCases.length === 0) {
      return true;
    }

    return false;
  }, [isAIScenarioFolder]);

  // Helper to resolve test cases from a single scenario (only extracts actual test cases, never synthesizes from raw AI scenarios)
  const getScenarioCases = useCallback((scen: TestScenario): TestCase[] => {
    const deletedIds = getDeletedIds();
    if (isApiTestingScenario(scen) || isAIScenarioFolder(scen) || isAIScenario(scen) || deletedIds.has(scen.id) || deletedIds.has(`TC-${scen.id}`)) {
      return [];
    }
    // Folders must never produce synthetic single test cases
    if (isAnyFolder(scen) || ['SCENARIO_FOLDER', 'MANUAL_FOLDER', 'TESTCASE_FOLDER', 'INPUT_SOURCE'].includes(scen.scenarioId)) {
      return [];
    }
    if (scen.testCases && scen.testCases.length > 0) {
      return scen.testCases.filter(tc => 
        !isApiTestingCase(tc) && 
        Boolean(tc.isApproved) &&
        !deletedIds.has(tc.id) && 
        (!tc.testCaseId || !deletedIds.has(tc.testCaseId)) &&
        (!tc.testCaseId || !deletedIds.has(tc.testCaseId.toLowerCase().trim()))
      );
    }
    return [];
  }, [isAnyFolder, isAIScenarioFolder, isAIScenario]);

  // Helper to resolve all test cases for a folder
  const getFolderCases = useCallback((folder: TestScenario): TestCase[] => {
    const deletedIds = getDeletedIds();
    if (isApiTestingScenario(folder) || isAIScenarioFolder(folder) || deletedIds.has(folder.id)) {
      return [];
    }

    const isSgFolder = isScriptGeneratorFolder(folder);
    const folderTitle = (folder.title || '').trim().toLowerCase();

    // If folder itself has been mapped/saved to a Script Generator folder with a different name,
    // it shouldn't produce cases under its original testcase folder name
    if (!isSgFolder && (folder as any).scriptGeneratorFolderName) {
      const targetSgName = ((folder as any).scriptGeneratorFolderName || '').trim().toLowerCase();
      if (targetSgName && targetSgName !== folderTitle) {
        return [];
      }
    }

    const directCases = (folder.testCases || []).filter(c => {
      if (isApiTestingCase(c) || !c.isApproved || deletedIds.has(c.id)) return false;
      if (c.testCaseId && (deletedIds.has(c.testCaseId) || deletedIds.has(c.testCaseId.toLowerCase().trim()))) return false;
      // If this folder is NOT a Script Generator saved folder (e.g. source AI Test Cases folder),
      // exclude any test cases that were saved to a different Script Generator folder
      if (!isSgFolder && c.scriptGeneratorFolderName && folderTitle && c.scriptGeneratorFolderName.trim().toLowerCase() !== folderTitle) {
        return false;
      }
      return true;
    });

    const memberIds = new Set(folder.memberScenarioIds || []);

    const memberScenarios = (project.scenarios || []).filter(s => 
      (
        memberIds.has(s.id) ||
        s.folderId === folder.id ||
        (folderTitle && s.folderId && s.folderId.trim().toLowerCase() === folderTitle) ||
        (folderTitle && s.folderName && s.folderName.trim().toLowerCase() === folderTitle)
      ) &&
      !isAnyFolder(s) &&
      !isAIScenarioFolder(s) &&
      !isApiTestingScenario(s) &&
      !deletedIds.has(s.id) && 
      !deletedIds.has(`TC-${s.id}`)
    );

    const memberCases: TestCase[] = [];
    memberScenarios.forEach(ms => {
      const msCases = (ms.testCases && ms.testCases.length > 0) ? ms.testCases : getScenarioCases(ms);
      msCases.forEach(tc => {
        if (
          !isApiTestingCase(tc) &&
          Boolean(tc.isApproved) &&
          !deletedIds.has(tc.id) && 
          (!tc.testCaseId || !deletedIds.has(tc.testCaseId)) &&
          (!tc.testCaseId || !deletedIds.has(tc.testCaseId.toLowerCase().trim()))
        ) {
          // If this is NOT a Script Generator folder, exclude cases saved to a different Script Generator folder
          if (!isSgFolder && tc.scriptGeneratorFolderName && folderTitle && tc.scriptGeneratorFolderName.trim().toLowerCase() !== folderTitle) {
            return;
          }
          memberCases.push(tc);
        }
      });
    });

    const combined = [...directCases];
    const seen = new Set(directCases.map(c => c.id));
    memberCases.forEach(c => {
      if (!seen.has(c.id)) {
        combined.push(c);
        seen.add(c.id);
      }
    });

    // Also include any approved test cases anywhere in project.scenarios assigned to this Script Generator folder
    if (isSgFolder) {
      (project.scenarios || []).forEach(scen => {
        (scen.testCases || []).forEach(tc => {
          if (
            !isApiTestingCase(tc) && 
            Boolean(tc.isApproved) &&
            !deletedIds.has(tc.id) && 
            (!tc.testCaseId || !deletedIds.has(tc.testCaseId)) &&
            (!tc.testCaseId || !deletedIds.has(tc.testCaseId.toLowerCase().trim())) &&
            (tc.scriptGeneratorFolderId === folder.id || (folderTitle && tc.scriptGeneratorFolderName && tc.scriptGeneratorFolderName.trim().toLowerCase() === folderTitle))
          ) {
            if (!seen.has(tc.id)) {
              combined.push(tc);
              seen.add(tc.id);
            }
          }
        });
      });
    }

    return combined;
  }, [project.scenarios, getScenarioCases, isAnyFolder, isAIScenarioFolder, isScriptGeneratorFolder]);

  // Actual Folders strictly for the FOLDERS section (Script Generator saved folders & approved test case folders)
  const validFolders = useMemo(() => {
    const deletedIds = getDeletedIds();
    // Key by normalized folder title to prevent duplicate folders with the same name
    const folderMap = new Map<string, TestScenario>();

    // 1. Process all explicit Script Generator folders (created in Script Generator, saved via popup, or registered in automationFolders)
    (project.scenarios || []).forEach(s => {
      if (
        !deletedIds.has(s.id) && 
        !deletedIds.has(`TC-${s.id}`) &&
        Boolean(s.isApproved) &&
        !isApiTestingScenario(s) &&
        !isAIScenarioFolder(s) &&
        s.scenarioId !== 'INPUT_SOURCE' &&
        isScriptGeneratorFolder(s)
      ) {
        const sCases = getFolderCases(s);
        if (sCases.length > 0) {
          const normTitle = (s.title || '').trim().toLowerCase();
          if (!normTitle) return;

          const existing = folderMap.get(normTitle);
          if (existing) {
            // Merge test cases if already present
            const existingCases = existing.testCases || [];
            const mergedCaseMap = new Map<string, TestCase>();
            existingCases.forEach(c => mergedCaseMap.set(c.id, c));
            sCases.forEach(c => mergedCaseMap.set(c.id, c));

            folderMap.set(normTitle, {
              ...s,
              testCases: Array.from(mergedCaseMap.values())
            });
          } else {
            folderMap.set(normTitle, {
              ...s,
              testCases: sCases
            });
          }
        }
      }
    });

    // 2. Also ensure any Script Generator folders referenced by approved test cases via scriptGeneratorFolderName are represented
    (project.scenarios || []).forEach(scen => {
      (scen.testCases || []).forEach(tc => {
        if (
          !isApiTestingCase(tc) &&
          Boolean(tc.isApproved) &&
          !deletedIds.has(tc.id) &&
          (!tc.testCaseId || !deletedIds.has(tc.testCaseId)) &&
          tc.scriptGeneratorFolderName &&
          tc.scriptGeneratorFolderName.trim()
        ) {
          const sgFolderName = tc.scriptGeneratorFolderName.trim();
          const normTitle = sgFolderName.toLowerCase();
          if (!folderMap.has(normTitle)) {
            const virtualFolder: TestScenario = {
              id: tc.scriptGeneratorFolderId || `sg-${normTitle}`,
              scenarioId: 'SCRIPT_GENERATOR_FOLDER',
              title: sgFolderName,
              description: `Script Generator Folder: ${sgFolderName}`,
              expectedResults: 'Execution validates requirements successfully.',
              type: 'Functional',
              isFolder: true,
              folderType: 'script_generator',
              isApproved: true,
              testCases: [],
              moduleName: 'Script Generator',
              saved: true
            };
            const fCases = getFolderCases(virtualFolder);
            if (fCases.length > 0) {
              folderMap.set(normTitle, {
                ...virtualFolder,
                testCases: fCases
              });
            }
          }
        }
      });
    });

    // Collect all test case IDs assigned to Script Generator folders
    const assignedToSgCaseIds = new Set<string>();
    folderMap.forEach(f => {
      (f.testCases || []).forEach(c => {
        if (c.id) assignedToSgCaseIds.add(c.id);
        if (c.testCaseId) assignedToSgCaseIds.add(c.testCaseId.toLowerCase().trim());
      });
    });

    // 3. For any remaining approved folders or scenarios from AI Test Cases / Synthesis:
    // Only include them if they have approved test cases that were NOT saved to a Script Generator folder!
    (project.scenarios || []).forEach(s => {
      if (
        !deletedIds.has(s.id) && 
        !deletedIds.has(`TC-${s.id}`) &&
        Boolean(s.isApproved) &&
        !isApiTestingScenario(s) &&
        !isAIScenarioFolder(s) &&
        s.scenarioId !== 'INPUT_SOURCE' &&
        !isScriptGeneratorFolder(s)
      ) {
        const normTitle = (s.title || '').trim().toLowerCase();
        if (!normTitle || folderMap.has(normTitle)) return;

        // If this folder itself was mapped/saved to a Script Generator folder with a different name, skip it
        if ((s as any).scriptGeneratorFolderName) {
          const targetSgName = ((s as any).scriptGeneratorFolderName || '').trim().toLowerCase();
          if (targetSgName && targetSgName !== normTitle) {
            return;
          }
        }

        if (s.isFolder || s.scenarioId === 'TESTCASE_FOLDER' || s.folderType === 'testcase' || s.folderType === 'scenario' || (Array.isArray(s.testCases) && s.testCases.length > 0)) {
          const sCases = getFolderCases(s);
          // Filter out any cases that have already been assigned to a Script Generator folder
          const unassignedCases = sCases.filter(c => {
            if (c.scriptGeneratorFolderName && c.scriptGeneratorFolderName.trim().toLowerCase() !== normTitle) {
              return false;
            }
            if (assignedToSgCaseIds.has(c.id)) return false;
            if (c.testCaseId && assignedToSgCaseIds.has(c.testCaseId.toLowerCase().trim())) return false;
            return true;
          });

          if (unassignedCases.length > 0) {
            folderMap.set(normTitle, {
              ...s,
              testCases: unassignedCases
            });
            unassignedCases.forEach(c => {
              if (c.id) assignedToSgCaseIds.add(c.id);
              if (c.testCaseId) assignedToSgCaseIds.add(c.testCaseId.toLowerCase().trim());
            });
          }
        }
      }
    });

    return Array.from(folderMap.values());
  }, [project.scenarios, isAIScenarioFolder, isApiTestingScenario, getFolderCases, isScriptGeneratorFolder]);

  // When navigated to Script Generator with initialFolderId or initialFolderName (e.g. from approving in AI Test Cases):
  // 1. Move to Script Generator -> Folders (Tab 1) only ONCE upon initial navigation
  // 2. Expand the approved folder so the user sees their approved test cases
  // 3. Pre-select the approved folder
  // 4. Do NOT re-hijack the user's activeTab when they are viewing SCRIPT FOLDERS or on background updates!
  const handledInitialFolderRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialFolderId && !initialFolderName) return;
    const folderKey = `${initialFolderId || ''}::${initialFolderName || ''}`;
    if (handledInitialFolderRef.current === folderKey) return;

    // Immediately mark as handled so delayed data loads or asynchronous Firestore snapshots do not re-run this
    handledInitialFolderRef.current = folderKey;

    // Immediately notify parent to clear initialFolder to prevent lingering prop triggers
    onClearInitialFolder?.();

    // Only switch to 'folders' if the user has NOT manually clicked away to another tab
    if (!userManuallySwitchedTabRef.current) {
      setActiveTab('folders');
    }

    const targetFolder = validFolders.find(
      f => (initialFolderId && f.id === initialFolderId) || 
           (initialFolderName && (f.title || '').trim().toLowerCase() === initialFolderName.trim().toLowerCase())
    );

    if (targetFolder) {
      setExpandedTestCaseFolders(prev => new Set([...prev, targetFolder.id]));
      setSelectedFolderIds(new Set([targetFolder.id]));
    } else if (initialFolderId) {
      setExpandedTestCaseFolders(prev => new Set([...prev, initialFolderId]));
      setSelectedFolderIds(new Set([initialFolderId]));
    }
  }, [initialFolderId, initialFolderName, validFolders, onClearInitialFolder, setActiveTab]);

  // Standalone individual test cases (strictly excludes AI scenarios and AI scenario folders; requires approved test cases)
  const validIndividualScenarios = useMemo(() => {
    const deletedIds = getDeletedIds();
    return (project.scenarios || []).filter(s => 
      !isAnyFolder(s) &&
      !isAIScenarioFolder(s) &&
      !isAIScenario(s) &&
      s.scenarioId !== 'INPUT_SOURCE' &&
      !isApiTestingScenario(s) &&
      !deletedIds.has(s.id) && 
      !deletedIds.has(`TC-${s.id}`) &&
      Array.isArray(s.testCases) &&
      s.testCases.some(tc => Boolean(tc.isApproved))
    );
  }, [project.scenarios, isAnyFolder, isAIScenarioFolder, isAIScenario]);

  // Legacy reference maintained for compatibility
  const validScenarios = validFolders;

  const allTestCases = useMemo(() => {
    const deletedIds = getDeletedIds();
    const list: Array<{ scenario: TestScenario; testCase: TestCase }> = [];
    const seenCaseIds = new Set<string>();

    // 1. Include approved standalone individual test cases (strictly excluding AI scenarios)
    validIndividualScenarios.forEach(scen => {
      if (isApiTestingScenario(scen) || isAIScenarioFolder(scen) || isAIScenario(scen) || deletedIds.has(scen.id) || deletedIds.has(`TC-${scen.id}`)) return;
      const scenarioCases = getScenarioCases(scen);
      scenarioCases.forEach(tc => {
        if (!isApiTestingCase(tc) && Boolean(tc.isApproved) && !seenCaseIds.has(tc.id) && !deletedIds.has(tc.id) && (!tc.testCaseId || !deletedIds.has(tc.testCaseId))) {
          seenCaseIds.add(tc.id);
          list.push({ scenario: scen, testCase: tc });
        }
      });
    });

    // 2. Include approved test cases from all test case folders in project
    (project.scenarios || []).forEach(scen => {
      if (!isAnyFolder(scen) || isApiTestingScenario(scen) || isAIScenarioFolder(scen) || deletedIds.has(scen.id) || deletedIds.has(`TC-${scen.id}`)) return;
      const folderCases = getFolderCases(scen);
      folderCases.forEach(tc => {
        if (!seenCaseIds.has(tc.id)) {
          seenCaseIds.add(tc.id);
          list.push({ scenario: scen, testCase: tc });
        }
      });
    });

    // Also ensure any folder in validFolders (e.g. Script Generator folders) has its approved cases included
    validFolders.forEach(scen => {
      const folderCases = getFolderCases(scen);
      folderCases.forEach(tc => {
        if (!seenCaseIds.has(tc.id)) {
          seenCaseIds.add(tc.id);
          list.push({ scenario: scen, testCase: tc });
        }
      });
    });

    // 3. Include any manual test cases if present in project and approved
    (project.manualTestCases || []).forEach(mc => {
      if (!isApiTestingCase(mc) && Boolean(mc.isApproved) && !seenCaseIds.has(mc.id) && !deletedIds.has(mc.id) && (!mc.testCaseId || !deletedIds.has(mc.testCaseId))) {
        seenCaseIds.add(mc.id);
        list.push({
          scenario: {
            id: `manual-${mc.id}`,
            scenarioId: 'MANUAL',
            title: mc.title,
            description: mc.description,
            expectedResults: mc.expectedResult,
            type: 'Functional',
            isApproved: true,
            moduleName: 'Manual',
            testCases: [mc]
          },
          testCase: mc
        });
      }
    });

    return list;
  }, [validIndividualScenarios, validFolders, project.scenarios, getScenarioCases, getFolderCases, isAnyFolder, isAIScenarioFolder, isAIScenario, project.manualTestCases]);

  // Clean up selectedCaseIds if any selected case has been deleted
  useEffect(() => {
    const deletedIds = getDeletedIds();
    setSelectedCaseIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        if (!deletedIds.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [project.scenarios]);

  // Saved automation scripts
  const savedScripts = useMemo(() => {
    const deletedIds = getDeletedIds();
    return (project.automationScripts || []).filter(s => {
      // Exclude scripts originating from Record & Play or Video Flows
      if (s.source === 'record_play' || s.source === 'upload_video' || Boolean(s.videoFlowId)) return false;
      if (deletedIds.has(s.id) || deletedIds.has(s.id.toLowerCase())) return false;
      if (s.folderId && (deletedIds.has(s.folderId) || deletedIds.has(s.folderId.toLowerCase()) || deletedIds.has(`folder-${s.folderId.toLowerCase()}`))) return false;
      const sFolder = (s.folderName || '').trim().toLowerCase();
      if (sFolder && (deletedIds.has(sFolder) || deletedIds.has(`folder-${sFolder}`))) return false;
      if (s.testCaseIds && s.testCaseIds.length > 0) {
        const remaining = s.testCaseIds.filter(id => !deletedIds.has(id) && !deletedIds.has(id.toLowerCase().trim()));
        if (remaining.length === 0) return false;
      }
      return true;
    });
  }, [project.automationScripts]);

  // All scripts in repository (both unsaved generated drafts and saved scripts)
  const allArtifacts = useMemo(() => {
    const deletedIds = getDeletedIds();
    // Valid unsaved generated drafts (not deleted by user)
    const validUnsaved = unsavedScripts.filter(s => {
      if (!s || !s.id) return false;
      if (deletedIds.has(s.id) || deletedIds.has(s.id.toLowerCase())) return false;
      return true;
    });

    // Valid saved scripts
    const validSaved = savedScripts.filter(s => {
      if (!s || !s.id) return false;
      if (deletedIds.has(s.id) || deletedIds.has(s.id.toLowerCase())) return false;
      return true;
    });

    return [...validUnsaved, ...validSaved];
  }, [unsavedScripts, savedScripts]);

  // Distinct folders for repository filter
  const repositoryFolders = useMemo(() => {
    const deletedIds = getDeletedIds();
    const foldersMap = new Map<string, { id: string; name: string; count: number; isImported?: boolean }>();
    
    // 1. Only include empty folders from automationFolders if explicitly created by user
    (project.automationFolders || []).forEach(f => {
      const fName = (f.name || '').trim();
      const key = fName.toLowerCase();
      if (deletedIds.has(f.id) || deletedIds.has(key) || deletedIds.has(`folder-${key}`)) return;
      if (fName && (userCreatedFolderNames.has(key) || (f as any).isUserCreatedScriptFolder)) {
        foldersMap.set(fName, { id: f.id, name: fName, count: 0, isImported: !!f.isImported });
      }
    });

    // 2. Also include valid folders from AI Test Cases / scenarios
    (validFolders || []).forEach(vf => {
      const vfName = (vf.title || '').trim();
      const vfKey = vfName.toLowerCase();
      if (deletedIds.has(vf.id) || deletedIds.has(vfKey) || deletedIds.has(`folder-${vfKey}`)) return;
      if (vfName && !foldersMap.has(vfName)) {
        foldersMap.set(vfName, { id: vf.id, name: vfName, count: 0, isImported: false });
      }
    });

    // 3. Count scripts per folder
    allArtifacts.forEach(s => {
      const isImported = Boolean(s.isImported) || s.id.startsWith('import-') || (s.folderName || '').trim().toLowerCase() === 'imported scripts';
      const fName = (s.folderName || (isImported ? 'Imported Scripts' : 'General Scripts')).trim();
      const fId = s.folderId || fName;
      const existing = foldersMap.get(fName);
      if (existing) {
        existing.count += 1;
        if (isImported) existing.isImported = true;
      } else {
        foldersMap.set(fName, { id: fId, name: fName, count: 1, isImported });
      }
    });
    return Array.from(foldersMap.values());
  }, [allArtifacts, project.automationFolders, userCreatedFolderNames, validFolders]);

  // Helper to strictly identify whether a script is imported or generated
  const isImportedScript = useCallback((s: AutomationScript) => {
    return Boolean(s.isImported) || 
      s.id.startsWith('import-') || 
      (s.folderName || '').trim().toLowerCase() === 'imported scripts';
  }, []);

  // Grouped Script Folders for Tab 2 (SCRIPT FOLDERS) - Non-imported generated POM scripts only
  // Each generated script is mapped strictly to the folder where it was generated or saved
  const groupedScriptFolders = useMemo(() => {
    const deletedIds = getDeletedIds();
    const map = new Map<string, { folderId: string; folderName: string; scripts: AutomationScript[] }>();
    const seenScriptIds = new Set<string>();

    // 1. Group all non-imported scripts strictly by their assigned folderName
    // Include both saved scripts and generated drafts
    [...savedScripts, ...unsavedScripts]
      .filter(s => !deletedIds.has(s.id) && !isImportedScript(s))
      .forEach(script => {
        if (seenScriptIds.has(script.id)) return;
        seenScriptIds.add(script.id);
        const fName = (script.folderName || 'General Scripts').trim();
        const fId = script.folderId || fName;
        const key = fName.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          if (!existing.scripts.some(s => s.id === script.id)) {
            existing.scripts.push(script);
          }
        } else {
          map.set(key, { folderId: fId, folderName: fName, scripts: [script] });
        }
      });

    // 2. Include empty folders explicitly created by user via "+ New Folder" in Script Generator
    // Approved test case folders must NOT appear under Tab 2 (SCRIPT FOLDERS) until the user actually generates/saves a script
    (project.automationFolders || [])
      .filter(f => !f.isImported && !deletedIds.has(f.id))
      .filter(f => (f as any).isUserCreatedScriptFolder && userCreatedFolderNames.has((f.name || '').trim().toLowerCase()))
      .forEach(f => {
        const fName = (f.name || '').trim();
        if (fName) {
          const key = fName.toLowerCase();
          // Never include an approved test case folder with 0 scripts in Tab 2 (SCRIPT FOLDERS)
          const isTestCaseFolder = validFolders.some(vf => (vf.title || '').trim().toLowerCase() === key);
          if (!isTestCaseFolder && !map.has(key)) {
            map.set(key, { folderId: f.id, folderName: fName, scripts: [] });
          }
        }
      });

    return Array.from(map.values());
  }, [savedScripts, unsavedScripts, project.automationFolders, userCreatedFolderNames, isImportedScript, validFolders]);

  // Ensure all script folders are expanded by default when viewing Script Folders so scripts are always immediately visible
  useEffect(() => {
    if (groupedScriptFolders.length > 0 && expandedScriptFolders.size === 0) {
      const allFolderNames = new Set(groupedScriptFolders.map(g => g.folderName));
      setExpandedScriptFolders(allFolderNames);
    }
  }, [groupedScriptFolders, expandedScriptFolders.size, setExpandedScriptFolders]);

  // Grouped Script Folders for Tab 3 (IMPORTED SCRIPT FOLDERS) - Imported scripts only
  // Each imported script is mapped strictly to its imported folder
  const groupedImportedScriptFolders = useMemo(() => {
    const deletedIds = getDeletedIds();
    const map = new Map<string, { folderId: string; folderName: string; scripts: AutomationScript[] }>();
    const seenScriptIds = new Set<string>();

    // 1. Group imported scripts strictly by their assigned folderName
    [...savedScripts, ...unsavedScripts]
      .filter(s => !deletedIds.has(s.id) && isImportedScript(s))
      .forEach(script => {
        if (seenScriptIds.has(script.id)) return;
        seenScriptIds.add(script.id);
        const fName = (script.folderName || 'Imported Scripts').trim();
        const fId = script.folderId || fName;
        const key = fName.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          if (!existing.scripts.some(s => s.id === script.id)) {
            existing.scripts.push(script);
          }
        } else {
          map.set(key, { folderId: fId, folderName: fName, scripts: [script] });
        }
      });

    // 2. Also include any imported folders from project.automationFolders only if explicitly created
    (project.automationFolders || [])
      .filter(f => !!f.isImported && !deletedIds.has(f.id))
      .forEach(f => {
        const fName = (f.name || '').trim();
        if (fName) {
          const key = fName.toLowerCase();
          if (!map.has(key) && (userCreatedFolderNames.has(key) || (f as any).isUserCreatedScriptFolder)) {
            map.set(key, { folderId: f.id, folderName: fName, scripts: [] });
          }
        }
      });

    return Array.from(map.values());
  }, [savedScripts, unsavedScripts, project.automationFolders, userCreatedFolderNames, isImportedScript]);

  // Available folders for the currently active tab in repository
  const availableRepositoryFolders = useMemo(() => {
    const deletedIds = getDeletedIds();
    if (activeTab === 'imported') {
      return groupedImportedScriptFolders;
    } else if (activeTab === 'scripts') {
      return groupedScriptFolders;
    } else {
      // In folders tab: folders from validFolders or folders that have non-imported scripts
      const nonImported = allArtifacts.filter(s => !isImportedScript(s));
      const map = new Map<string, { folderId: string; folderName: string; scripts: AutomationScript[] }>();
      nonImported.forEach(s => {
        const fName = (s.folderName || 'General Scripts').trim();
        const key = fName.toLowerCase();
        if (
          deletedIds.has(key) || 
          deletedIds.has(`folder-${key}`) || 
          (s.folderId && (deletedIds.has(s.folderId) || deletedIds.has(`folder-${s.folderId}`)))
        ) {
          return;
        }
        if (!map.has(key)) {
          map.set(key, { folderId: s.folderId || fName, folderName: fName, scripts: [] });
        }
        map.get(key)!.scripts.push(s);
      });
      return Array.from(map.values());
    }
  }, [activeTab, groupedImportedScriptFolders, groupedScriptFolders, allArtifacts, isImportedScript]);

  // Folders and script folders remain strictly closed and unselected by default on initial page load / navigation.
  // A folder opens or expands ONLY when the user explicitly clicks/selects it.

  // Consolidate any previously split imported scripts into a single POM suite preserving approved states
  useEffect(() => {
    const scripts = project.automationScripts || [];
    let needsUpdate = false;

    const importedFolderMap = new Map<string, AutomationScript[]>();
    const standaloneScripts: AutomationScript[] = [];

    scripts.forEach(s => {
      if (s.isImported && s.folderName && s.folderName.trim() && s.folderName.toLowerCase() !== 'imported scripts') {
        const list = importedFolderMap.get(s.folderName) || [];
        list.push(s);
        importedFolderMap.set(s.folderName, list);
      } else {
        standaloneScripts.push(s);
      }
    });

    const consolidatedFolderScripts: AutomationScript[] = [];
    importedFolderMap.forEach((folderScripts, folderName) => {
      if (folderScripts.length > 1) {
        needsUpdate = true;
        const allFiles: AutomationScriptFile[] = [];
        folderScripts.forEach(s => {
          if (Array.isArray(s.files) && s.files.length > 0) {
            s.files.forEach(f => {
              if (!allFiles.some(existing => existing.path === f.path)) {
                allFiles.push(f);
              }
            });
          } else {
            const ext = s.language === 'Python' ? 'py' : s.language === 'Java' ? 'java' : s.language === 'C#' ? 'cs' : 'ts';
            const fileName = s.title && s.title.toLowerCase().includes('.') ? s.title : `${(s.title || 'test').toLowerCase()}.${ext}`;
            if (!allFiles.some(existing => existing.path === fileName)) {
              allFiles.push({ path: fileName, content: s.content || '' });
            }
          }
        });

        const combinedContent = allFiles.map(f => {
          const ext = f.path.split('.').pop() || '';
          const langTag = ext === 'ts' ? 'typescript' : ext === 'js' ? 'javascript' : ext === 'py' ? 'python' : ext === 'java' ? 'java' : ext === 'json' ? 'json' : ext;
          return `### \`${f.path}\`\n\`\`\`${langTag}\n${f.content}\n\`\`\``;
        }).join('\n\n');

        const primary = folderScripts[0];
        const isFolderApproved = folderScripts.some(s => Boolean(s.isApproved));

        consolidatedFolderScripts.push({
          ...primary,
          id: primary.id,
          title: folderName,
          description: `Imported POM folder "${folderName}" with ${allFiles.length} files`,
          content: combinedContent,
          files: allFiles,
          isApproved: isFolderApproved,
          isImported: true,
          isSaved: true,
          folderName: folderName,
          folderId: primary.folderId || `folder-${String(folderName || 'general').toLowerCase().replace(/\s+/g, '-')}`
        });
      } else {
        consolidatedFolderScripts.push(folderScripts[0]);
      }
    });

    if (needsUpdate) {
      const updatedAutomationScripts = [...consolidatedFolderScripts, ...standaloneScripts];
      onUpdateProject({
        ...project,
        automationScripts: updatedAutomationScripts
      });
      try {
        localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify({
          ...project,
          automationScripts: updatedAutomationScripts
        }));
      } catch (e) {}
    }
  }, [project.id]);

  // Imported scripts list
  const importedScripts = useMemo(() => {
    return (project.automationScripts || []).filter(s => !!(s as any).isImported);
  }, [project.automationScripts]);

  // Non-imported scripts list
  const nonImportedScripts = useMemo(() => {
    return (project.automationScripts || []).filter(s => !(s as any).isImported);
  }, [project.automationScripts]);

  // Filtered Test Cases for Individual Tab
  const filteredCases = useMemo(() => {
    if (!searchQuery.trim()) return allTestCases;
    const q = searchQuery.toLowerCase();
    return allTestCases.filter(({ scenario, testCase }) => 
      (testCase.testCaseId || '').toLowerCase().includes(q) ||
      testCase.title.toLowerCase().includes(q) ||
      scenario.title.toLowerCase().includes(q)
    );
  }, [allTestCases, searchQuery]);

  // Filtered Folders (Exclusively real folders, searching test case titles, IDs, descriptions, and steps)
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return validFolders;
    const q = searchQuery.toLowerCase().trim();
    return validFolders.filter(s => {
      if (s.title.toLowerCase().includes(q)) return true;
      if ((s.moduleName || '').toLowerCase().includes(q)) return true;
      const cases = getFolderCases(s);
      return cases.some(tc => {
        if ((tc.testCaseId || '').toLowerCase().includes(q)) return true;
        if ((tc.title || '').toLowerCase().includes(q)) return true;
        if ((tc.description || '').toLowerCase().includes(q)) return true;
        if (tc.steps && Array.isArray(tc.steps)) {
          return tc.steps.some((st: any) =>
            typeof st === 'string'
              ? st.toLowerCase().includes(q)
              : (((st.action || '') + ' ' + (st.expectedResult || '')).toLowerCase().includes(q))
          );
        }
        return false;
      });
    });
  }, [validFolders, searchQuery, getFolderCases]);

  // Filtered Script Folders for Tab 2 (by searchQuery)
  const filteredScriptFolders = useMemo(() => {
    if (!searchQuery.trim()) return groupedScriptFolders;
    const q = searchQuery.toLowerCase().trim();
    return groupedScriptFolders
      .map(folderGroup => {
        const folderMatches = folderGroup.folderName.toLowerCase().includes(q);
        const matchingScripts = folderGroup.scripts.filter(s => {
          if ((s.title || '').toLowerCase().includes(q)) return true;
          if (s.tool && s.tool.toLowerCase().includes(q)) return true;
          if (s.framework && s.framework.toLowerCase().includes(q)) return true;
          if (s.language && s.language.toLowerCase().includes(q)) return true;
          if (s.testCaseTitles && s.testCaseTitles.some(t => t.toLowerCase().includes(q))) return true;
          if (s.testCaseIds && s.testCaseIds.some(id => id.toLowerCase().includes(q))) return true;
          if (s.files && s.files.some(f => (f.path || '').toLowerCase().includes(q))) return true;
          if (s.content && s.content.toLowerCase().includes(q)) return true;
          return false;
        });

        if (folderMatches) {
          return folderGroup;
        }
        if (matchingScripts.length > 0) {
          return {
            ...folderGroup,
            scripts: matchingScripts
          };
        }
        return null;
      })
      .filter((fg): fg is { folderId: string; folderName: string; scripts: AutomationScript[] } => fg !== null);
  }, [groupedScriptFolders, searchQuery]);

  // Filtered Imported Script Folders for Tab 3 (by searchQuery)
  const filteredImportedScriptFolders = useMemo(() => {
    if (!searchQuery.trim()) return groupedImportedScriptFolders;
    const q = searchQuery.toLowerCase().trim();
    return groupedImportedScriptFolders
      .map(folderGroup => {
        const folderMatches = folderGroup.folderName.toLowerCase().includes(q);
        const matchingScripts = folderGroup.scripts.filter(s => {
          if ((s.title || '').toLowerCase().includes(q)) return true;
          if (s.files && s.files.some(f => (f.path || '').toLowerCase().includes(q))) return true;
          if (s.content && s.content.toLowerCase().includes(q)) return true;
          return false;
        });

        if (folderMatches) {
          return folderGroup;
        }
        if (matchingScripts.length > 0) {
          return {
            ...folderGroup,
            scripts: matchingScripts
          };
        }
        return null;
      })
      .filter((fg): fg is { folderId: string; folderName: string; scripts: AutomationScript[] } => fg !== null);
  }, [groupedImportedScriptFolders, searchQuery]);

  // Auto-expand matching folders when user searches
  useEffect(() => {
    if (!searchQuery.trim()) return;
    if (activeTab === 'folders') {
      const matchIds = new Set(filteredFolders.map(f => f.id));
      setExpandedTestCaseFolders(prev => new Set([...prev, ...matchIds]));
    } else if (activeTab === 'scripts') {
      const matchNames = new Set(filteredScriptFolders.map(f => f.folderName));
      setExpandedScriptFolders(prev => new Set([...prev, ...matchNames]));
    } else if (activeTab === 'imported') {
      const matchNames = new Set(filteredImportedScriptFolders.map(f => f.folderName));
      setExpandedScriptFolders(prev => new Set([...prev, ...matchNames]));
    }
  }, [searchQuery, activeTab, filteredFolders, filteredScriptFolders, filteredImportedScriptFolders]);

  // Filtered Artifacts in Repository (Strictly isolated by tab and folder)
  const filteredArtifacts = useMemo(() => {
    let list = allArtifacts;

    // 1. Strict tab isolation:
    // - Under IMPORTED SCRIPT FOLDERS: only imported scripts can appear.
    // - Under SCRIPT FOLDERS: only generated POM scripts can appear.
    // - Under FOLDERS: only non-imported scripts can appear (and if folders are checked, only those folders).
    if (activeTab === 'imported') {
      list = list.filter(s => isImportedScript(s));
    } else if (activeTab === 'scripts') {
      list = list.filter(s => !isImportedScript(s));
    } else if (activeTab === 'folders') {
      list = list.filter(s => !isImportedScript(s));
      // Only filter repository by checked test case folders if the user is not viewing a specific repository folder
      if (selectedFolderIds.size > 0 && (!selectedRepositoryFolder || selectedRepositoryFolder.toLowerCase() === 'all')) {
        const selectedTitles = new Set(
          Array.from(selectedFolderIds).map(id => {
            const f = validFolders.find(vf => vf.id === id);
            return (f?.title || '').trim().toLowerCase();
          }).filter(Boolean)
        );
        list = list.filter(s => {
          // Keep unsaved drafts always visible in repository so newly generated scripts are not hidden
          if (s.isSaved === false || unsavedScripts.some(u => u.id === s.id)) return true;
          const sFolder = (s.folderName || '').trim().toLowerCase();
          return selectedFolderIds.has(s.folderId || '') || selectedTitles.has(sFolder);
        });
      }
    }

    // 2. Folder-level isolation:
    if (selectedRepositoryFolder === '__UNSAVED__') {
      list = list.filter(s => !s.isSaved || unsavedScripts.some(u => u.id === s.id));
    } else if (selectedRepositoryFolder && selectedRepositoryFolder.toLowerCase() !== 'all') {
      const targetFolderNorm = selectedRepositoryFolder.trim().toLowerCase();
      list = list.filter(s => {
        const sFolder = (s.folderName || 'General Scripts').trim().toLowerCase();
        const sFolderId = (s.folderId || '').trim().toLowerCase();
        return sFolder === targetFolderNorm || sFolderId === targetFolderNorm;
      });
    }

    // 3. Search query filter (Filter Artifacts):
    if (!artifactFilter.trim()) return list;
    const q = artifactFilter.toLowerCase().trim();
    return list.filter(s => {
      // Direct property matches
      if ((s.title || '').toLowerCase().includes(q)) return true;
      if (s.tool && s.tool.toLowerCase().includes(q)) return true;
      if (s.framework && s.framework.toLowerCase().includes(q)) return true;
      if (s.language && s.language.toLowerCase().includes(q)) return true;
      if ((s.folderName || '').toLowerCase().includes(q)) return true;
      if (s.content && s.content.toLowerCase().includes(q)) return true;

      // File artifact search (e.g. pom.xml, testng.xml, cypress.config.js, package.json, etc.)
      const scriptFiles = (s.files && s.files.length > 0)
        ? s.files
        : parseScriptIntoFiles(s.content, s.tool, s.language);

      if (scriptFiles && scriptFiles.length > 0) {
        return scriptFiles.some(f => {
          if (!f || !f.path) return false;
          const fileName = (f.path.split('/').pop() || f.path).toLowerCase();
          const filePath = f.path.toLowerCase();
          return (
            fileName === q ||
            fileName.includes(q) ||
            filePath.includes(q) ||
            (f.content && f.content.toLowerCase().includes(q))
          );
        });
      }

      return false;
    });
  }, [allArtifacts, activeTab, isImportedScript, selectedFolderIds, validFolders, selectedRepositoryFolder, artifactFilter, unsavedScripts]);

  const visibleUnsavedDraftsCount = useMemo(() => {
    return filteredArtifacts.filter(s => s.isSaved === false || unsavedScripts.some(u => u.id === s.id)).length;
  }, [filteredArtifacts, unsavedScripts]);

  // Selection helpers
  const toggleSelectCase = (id: string) => {
    const next = new Set(selectedCaseIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCaseIds(next);
  };

  const toggleSelectFolder = (id: string) => {
    const next = new Set(selectedFolderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedFolderIds(next);

    // Also auto-select or deselect test cases inside this folder
    const scen = validFolders.find(s => s.id === id);
    if (scen) {
      const folderCases = getFolderCases(scen);
      const caseNext = new Set(selectedCaseIds);
      if (!selectedFolderIds.has(id)) {
        folderCases.forEach(tc => caseNext.add(tc.id));
      } else {
        folderCases.forEach(tc => caseNext.delete(tc.id));
      }
      setSelectedCaseIds(caseNext);
    }
  };

  // Select All Handlers
  const isAllVisibleCasesSelected = useMemo(() => {
    if (filteredCases.length === 0) return false;
    return filteredCases.every(({ testCase }) => selectedCaseIds.has(testCase.id));
  }, [filteredCases, selectedCaseIds]);

  const toggleSelectAllVisibleCases = () => {
    const next = new Set(selectedCaseIds);
    if (isAllVisibleCasesSelected) {
      filteredCases.forEach(({ testCase }) => next.delete(testCase.id));
    } else {
      filteredCases.forEach(({ testCase }) => next.add(testCase.id));
    }
    setSelectedCaseIds(next);
  };

  const isAllVisibleFoldersSelected = useMemo(() => {
    if (filteredFolders.length === 0) return false;
    return filteredFolders.every(f => selectedFolderIds.has(f.id));
  }, [filteredFolders, selectedFolderIds]);

  const toggleSelectAllVisibleFolders = () => {
    const nextFolders = new Set(selectedFolderIds);
    const nextCases = new Set(selectedCaseIds);
    if (isAllVisibleFoldersSelected) {
      filteredFolders.forEach(f => {
        nextFolders.delete(f.id);
        const folderCases = getFolderCases(f);
        folderCases.forEach(tc => nextCases.delete(tc.id));
      });
    } else {
      filteredFolders.forEach(f => {
        nextFolders.add(f.id);
        const folderCases = getFolderCases(f);
        folderCases.forEach(tc => nextCases.add(tc.id));
      });
    }
    setSelectedFolderIds(nextFolders);
    setSelectedCaseIds(nextCases);
  };

  // Script Selection Helpers
  const toggleSelectScript = (id: string) => {
    const next = new Set(selectedScriptIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedScriptIds(next);
  };

  const isAllVisibleScriptsSelected = useMemo(() => {
    if (filteredArtifacts.length === 0) return false;
    return filteredArtifacts.every(s => selectedScriptIds.has(s.id));
  }, [filteredArtifacts, selectedScriptIds]);

  const toggleSelectAllVisibleScripts = () => {
    const next = new Set(selectedScriptIds);
    if (isAllVisibleScriptsSelected) {
      filteredArtifacts.forEach(s => next.delete(s.id));
    } else {
      filteredArtifacts.forEach(s => next.add(s.id));
    }
    setSelectedScriptIds(next);
  };

  // Scripts in Tab 2 (SCRIPT GENERATED / SCRIPT FOLDERS)
  const tabScriptIds = useMemo(() => {
    const ids: string[] = [];
    groupedScriptFolders.forEach(g => {
      g.scripts.forEach(s => ids.push(s.id));
    });
    return ids;
  }, [groupedScriptFolders]);

  const isAllTabScriptsSelected = useMemo(() => {
    if (tabScriptIds.length === 0) return false;
    return tabScriptIds.every(id => selectedScriptIds.has(id));
  }, [tabScriptIds, selectedScriptIds]);

  const toggleSelectAllTabScripts = () => {
    const next = new Set(selectedScriptIds);
    if (isAllTabScriptsSelected) {
      tabScriptIds.forEach(id => next.delete(id));
    } else {
      tabScriptIds.forEach(id => next.add(id));
    }
    setSelectedScriptIds(next);
  };

  // Scripts in Tab 3 (IMPORTED SCRIPT FOLDERS)
  const importedTabScriptIds = useMemo(() => {
    const ids: string[] = [];
    groupedImportedScriptFolders.forEach(g => {
      g.scripts.forEach(s => ids.push(s.id));
    });
    return ids;
  }, [groupedImportedScriptFolders]);

  // Total generated scripts count (sum across all script folders)
  const totalGeneratedScriptsCount = useMemo(() => {
    return groupedScriptFolders.reduce((sum, g) => sum + g.scripts.length, 0);
  }, [groupedScriptFolders]);

  // Total imported scripts count (sum across all imported script folders)
  const totalImportedScriptsCount = useMemo(() => {
    return groupedImportedScriptFolders.reduce((sum, g) => sum + g.scripts.length, 0);
  }, [groupedImportedScriptFolders]);

  const isAllImportedTabScriptsSelected = useMemo(() => {
    if (importedTabScriptIds.length === 0) return false;
    return importedTabScriptIds.every(id => selectedScriptIds.has(id));
  }, [importedTabScriptIds, selectedScriptIds]);

  const toggleSelectAllImportedTabScripts = () => {
    const next = new Set(selectedScriptIds);
    if (isAllImportedTabScriptsSelected) {
      importedTabScriptIds.forEach(id => next.delete(id));
    } else {
      importedTabScriptIds.forEach(id => next.add(id));
    }
    setSelectedScriptIds(next);
  };

  const handleConfirmBulkDeleteScripts = () => {
    if (selectedScriptIds.size === 0) return;
    const count = selectedScriptIds.size;
    const idsToDelete = Array.from(selectedScriptIds);

    // Add tombstones
    addDeletedIds(idsToDelete);

    setUnsavedScripts(prev => prev.filter(s => !selectedScriptIds.has(s.id)));
    const updatedScripts = (project.automationScripts || []).filter(s => !selectedScriptIds.has(s.id));
    const updatedProject = {
      ...project,
      automationScripts: updatedScripts
    };

    saveProjectBackup(updatedProject);
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);
    setSelectedScriptIds(new Set());
    setShowBulkDeleteScriptsConfirm(false);
    toast.success(`Deleted ${count} script${count > 1 ? 's' : ''} from repository`);
  };

  const handleConfirmBulkDeleteCases = () => {
    setShowBulkDeleteCasesConfirm(false);
    if (selectedCaseIds.size === 0) return;

    const count = selectedCaseIds.size;
    const targetIds = new Set(selectedCaseIds);
    const tombstonesToAdd: string[] = [];

    targetIds.forEach(id => {
      if (!id) return;
      const strId = String(id);
      tombstonesToAdd.push(strId);
      if (strId.startsWith('TC-')) {
        tombstonesToAdd.push(strId.replace(/^TC-/, ''));
      }
    });

    const updatedScenarios = (project.scenarios || [])
      .map(scen => {
        const isFolder = scen.scenarioId === 'SCENARIO_FOLDER' || 
                         scen.scenarioId === 'TESTCASE_FOLDER' || 
                         scen.scenarioId === 'MANUAL_FOLDER';
        const hadExplicitCases = scen.testCases && scen.testCases.length > 0;

        if (hadExplicitCases) {
          const remaining = (scen.testCases || []).filter(tc => 
            !targetIds.has(tc.id) && !targetIds.has(tc.testCaseId || '')
          );
          if (remaining.length === 0 && !isFolder && (targetIds.has(scen.id) || targetIds.has(`TC-${scen.id}`))) {
            tombstonesToAdd.push(scen.id, `TC-${scen.id}`);
            return null;
          }
          return { ...scen, testCases: remaining };
        } else {
          if (targetIds.has(scen.id) || targetIds.has(`TC-${scen.id}`)) {
            tombstonesToAdd.push(scen.id, `TC-${scen.id}`);
            return null;
          }
          return scen;
        }
      })
      .filter(Boolean) as TestScenario[];

    const updatedManualCases = (project.manualTestCases || []).filter(mc => !targetIds.has(mc.id));

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

    const updatedProject: Project = {
      ...project,
      scenarios: finalScenarios,
      manualTestCases: updatedManualCases
    };

    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);
    setSelectedCaseIds(new Set());
    toast.success(`Deleted ${count} test case${count > 1 ? 's' : ''}`);
  };

  const handleConfirmBulkDeleteFolders = () => {
    setShowBulkDeleteFoldersConfirm(false);
    if (selectedFolderIds.size === 0) return;

    const count = selectedFolderIds.size;
    const targetFolderIds = new Set(selectedFolderIds);
    const tombstonesToAdd: string[] = [];

    const allDeletedCaseIds = new Set<string>();
    (project.scenarios || []).forEach(scen => {
      if (targetFolderIds.has(scen.id)) {
        tombstonesToAdd.push(scen.id);
        const folderCases = getFolderCases(scen);
        folderCases.forEach(c => {
          tombstonesToAdd.push(c.id);
          allDeletedCaseIds.add(c.id);
        });
      }
    });

    const updatedScenarios = (project.scenarios || []).filter(s => !targetFolderIds.has(s.id));
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

    const updatedProject: Project = { ...project, scenarios: finalScenarios };
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);
    setSelectedFolderIds(new Set());
    const nextSelectedCases = new Set(selectedCaseIds);
    allDeletedCaseIds.forEach(id => nextSelectedCases.delete(id));
    setSelectedCaseIds(nextSelectedCases);
    toast.success(`Deleted ${count} folder${count > 1 ? 's' : ''}`);
  };

  // Delete Action Implementations
  const handleConfirmDeleteCase = () => {
    if (!deleteCaseTarget) return;
    const targetCaseId = deleteCaseTarget.testCaseId;
    const targetScenarioId = deleteCaseTarget.scenarioId;
    const tombstonesToAdd: string[] = targetCaseId ? [String(targetCaseId)] : [];
    if (targetCaseId && String(targetCaseId).startsWith('TC-')) {
      tombstonesToAdd.push(String(targetCaseId).replace(/^TC-/, ''));
    }

    const updatedScenarios = (project.scenarios || [])
      .map(scen => {
        if (scen.id === targetScenarioId) {
          const isFolder = scen.scenarioId === 'SCENARIO_FOLDER' || 
                           scen.scenarioId === 'TESTCASE_FOLDER' || 
                           scen.scenarioId === 'MANUAL_FOLDER';
          const hadExplicitCases = scen.testCases && scen.testCases.length > 0;
          if (hadExplicitCases) {
            const remaining = (scen.testCases || []).filter(tc => 
              tc.id !== targetCaseId && tc.testCaseId !== targetCaseId
            );
            if (remaining.length === 0 && !isFolder) {
              tombstonesToAdd.push(scen.id, `TC-${scen.id}`);
              return null;
            }
            return { ...scen, testCases: remaining };
          } else {
            if (targetCaseId === `TC-${scen.id}` || targetCaseId === scen.id) {
              tombstonesToAdd.push(scen.id, `TC-${scen.id}`);
              return null;
            }
            return { ...scen, testCases: [] };
          }
        }

        if (scen.testCases && scen.testCases.some(tc => tc.id === targetCaseId || tc.testCaseId === targetCaseId)) {
          const isFolder = scen.scenarioId === 'SCENARIO_FOLDER' || 
                           scen.scenarioId === 'TESTCASE_FOLDER' || 
                           scen.scenarioId === 'MANUAL_FOLDER';
          const remaining = scen.testCases.filter(tc => 
            tc.id !== targetCaseId && tc.testCaseId !== targetCaseId
          );
          if (remaining.length === 0 && !isFolder) {
            tombstonesToAdd.push(scen.id, `TC-${scen.id}`);
            return null;
          }
          return { ...scen, testCases: remaining };
        }

        if (targetCaseId === `TC-${scen.id}` || targetCaseId === scen.id) {
          tombstonesToAdd.push(scen.id, `TC-${scen.id}`);
          return null;
        }

        return scen;
      })
      .filter(Boolean) as TestScenario[];

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
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify({ ...project, scenarios: finalScenarios }));
    } catch (e) {}

    onUpdateProject({ ...project, scenarios: finalScenarios });
    const nextSelected = new Set(selectedCaseIds);
    nextSelected.delete(targetCaseId);
    setSelectedCaseIds(nextSelected);

    toast.success('Test case deleted');
    setDeleteCaseTarget(null);
  };

  const handleConfirmDeleteFolder = () => {
    if (!deleteFolderTarget) return;
    const folderId = deleteFolderTarget.id;
    const folderCases = getFolderCases(deleteFolderTarget);
    const folderCaseIds = new Set(folderCases.map(c => c.id));
    const tombstonesToAdd: string[] = [folderId, ...Array.from(folderCaseIds)];

    const updatedScenarios = (project.scenarios || []).filter(s => s.id !== folderId);
    addDeletedIds(tombstonesToAdd);

    const updatedProject = { ...project, scenarios: updatedScenarios };
    saveProjectBackup(updatedProject);
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);

    const nextSelectedFolders = new Set(selectedFolderIds);
    nextSelectedFolders.delete(folderId);
    setSelectedFolderIds(nextSelectedFolders);

    const nextSelectedCases = new Set(selectedCaseIds);
    folderCaseIds.forEach(id => nextSelectedCases.delete(id));
    setSelectedCaseIds(nextSelectedCases);

    toast.success(`Folder "${deleteFolderTarget.title}" deleted`);
    setDeleteFolderTarget(null);
  };

  const handleConfirmDeleteScriptFolder = () => {
    if (!deleteScriptFolderTarget) return;
    const { folderId, folderName, scripts } = deleteScriptFolderTarget;
    const normName = folderName.trim().toLowerCase();

    // 1. Identify all matching folder and script IDs to tombstone
    const scriptIdsToDelete = new Set(scripts.map(s => s.id));
    (project.automationScripts || []).forEach(s => {
      if ((s.folderName || '').trim().toLowerCase() === normName || s.folderId === folderId) {
        scriptIdsToDelete.add(s.id);
      }
    });

    const matchingAutoFolderIds: string[] = [];
    (project.automationFolders || []).forEach(f => {
      if (f.id === folderId || (f.name || '').trim().toLowerCase() === normName) {
        matchingAutoFolderIds.push(f.id);
      }
    });

    const matchingScenarioIds: string[] = [];
    (project.scenarios || []).forEach(s => {
      if (s.id === folderId || (s.folderType === 'script_generator' && (s.title || '').trim().toLowerCase() === normName)) {
        matchingScenarioIds.push(s.id);
      }
    });

    const allTombstones = [
      folderId,
      `folder-${folderId}`,
      folderName,
      normName,
      `folder-${normName}`,
      ...matchingAutoFolderIds,
      ...matchingAutoFolderIds.map(id => `folder-${id}`),
      ...matchingScenarioIds,
      ...matchingScenarioIds.map(id => `folder-${id}`),
      ...Array.from(scriptIdsToDelete)
    ];

    addDeletedIds(allTombstones);

    // Call folderPersistenceService to delete folder document in Firestore
    deleteFolderFromFirestore(project.id, folderId).catch(() => {});
    matchingAutoFolderIds.forEach(id => deleteFolderFromFirestore(project.id, id).catch(() => {}));
    matchingScenarioIds.forEach(id => deleteFolderFromFirestore(project.id, id).catch(() => {}));

    // Clean unsaved scripts from sessionStorage
    try {
      const unsavedKey = `automatiqa_unsaved_scripts_${project.id}`;
      const rawUnsaved = sessionStorage.getItem(unsavedKey);
      if (rawUnsaved) {
        const parsed = JSON.parse(rawUnsaved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((s: any) => !scriptIdsToDelete.has(s.id) && (s.folderName || '').trim().toLowerCase() !== normName && s.folderId !== folderId);
          sessionStorage.setItem(unsavedKey, JSON.stringify(filtered));
        }
      }
    } catch (e) {}

    // 2. Remove from project.automationFolders
    const updatedAutomationFolders = (project.automationFolders || []).filter(
      f => f.id !== folderId && (f.name || '').trim().toLowerCase() !== normName
    );

    // 3. Remove associated scripts
    const updatedScripts = (project.automationScripts || []).filter(
      s => !scriptIdsToDelete.has(s.id) && (s.folderName || '').trim().toLowerCase() !== normName && s.folderId !== folderId
    );

    // 4. Remove from unsaved scripts if any
    setUnsavedScripts(prev => prev.filter(s => !scriptIdsToDelete.has(s.id) && (s.folderName || '').trim().toLowerCase() !== normName));

    // 5. Clean selected IDs
    const nextSelected = new Set(selectedScriptIds);
    scriptIdsToDelete.forEach(id => nextSelected.delete(id));
    setSelectedScriptIds(nextSelected);

    // 6. Clean expanded folders
    setExpandedScriptFolders(prev => {
      const next = new Set(prev);
      next.delete(folderName);
      return next;
    });

    // 7. Remove from userCreatedFolderNames
    setUserCreatedFolderNames(prev => {
      const next = new Set(prev);
      next.delete(normName);
      return next;
    });

    // 8. Reset repository filter if active
    if (selectedRepositoryFolder.toLowerCase() === normName) {
      setSelectedRepositoryFolder('ALL');
    }

    // 9. Clean up any scenario folder with same name
    const updatedScenarios = (project.scenarios || []).filter(
      s => !(s.id === folderId || (s.folderType === 'script_generator' && (s.title || '').trim().toLowerCase() === normName))
    );

    // 10. Backup and update
    const updatedProject = {
      ...project,
      scenarios: updatedScenarios,
      automationFolders: updatedAutomationFolders,
      automationScripts: updatedScripts
    };

    saveProjectBackup(updatedProject);
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);

    toast.success(`Folder "${folderName}" deleted`);
    setDeleteScriptFolderTarget(null);
  };

  const handleConfirmDeleteScript = () => {
    if (!deleteScriptTarget) return;
    const scriptId = deleteScriptTarget.id;
    addDeletedIds([scriptId]);

    // Remove from unsaved scripts if draft
    setUnsavedScripts(prev => prev.filter(s => s.id !== scriptId));
    // Remove from saved automation scripts
    const updatedScripts = (project.automationScripts || []).filter(s => s.id !== scriptId);
    const updatedProject = { ...project, automationScripts: updatedScripts };

    saveProjectBackup(updatedProject);
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);
    const nextSelected = new Set(selectedScriptIds);
    nextSelected.delete(scriptId);
    setSelectedScriptIds(nextSelected);
    toast.success(`Script "${deleteScriptTarget.title}" deleted`);
    setDeleteScriptTarget(null);
  };

  const selectedCount = selectedCaseIds.size;

  // Handle Script Generation
  const handleGenerateScript = async () => {
    const deletedIds = getDeletedIds();
    let targetCases: TestCase[] = [];
    const seenTargetIds = new Set<string>();

    // 1. Gather any test cases explicitly matched by selectedCaseIds from allTestCases
    allTestCases.forEach(({ testCase }) => {
      if (selectedCaseIds.has(testCase.id) && !seenTargetIds.has(testCase.id)) {
        seenTargetIds.add(testCase.id);
        targetCases.push(testCase);
      }
    });

    // 2. Also search all scenarios in project.scenarios for selectedCaseIds
    (project.scenarios || []).forEach(scen => {
      if (deletedIds.has(scen.id)) return;
      const scenCases = Array.isArray(scen.testCases) && scen.testCases.length > 0 
        ? scen.testCases 
        : getScenarioCases(scen);
      scenCases.forEach(tc => {
        if (selectedCaseIds.has(tc.id) && !seenTargetIds.has(tc.id) && !deletedIds.has(tc.id)) {
          seenTargetIds.add(tc.id);
          targetCases.push(tc);
        }
      });
    });

    // 3. Search manualTestCases for selectedCaseIds
    (project.manualTestCases || []).forEach(tc => {
      if (selectedCaseIds.has(tc.id) && !seenTargetIds.has(tc.id) && !deletedIds.has(tc.id)) {
        seenTargetIds.add(tc.id);
        targetCases.push(tc);
      }
    });

    // 4. Resolve test cases from all selectedFolderIds
    if (selectedFolderIds.size > 0) {
      selectedFolderIds.forEach(folderId => {
        const folder = validFolders.find(f => f.id === folderId || (f.title && f.title.toLowerCase() === folderId.toLowerCase())) ||
                       (project.scenarios || []).find(s => s.id === folderId || (s.title && s.title.toLowerCase() === folderId.toLowerCase()));
        if (folder) {
          let fCases = getFolderCases(folder);
          if (fCases.length === 0) {
            const rawCases = (folder.testCases || []).filter(c => Boolean(c.isApproved) && !deletedIds.has(c.id));
            if (rawCases.length > 0) {
              fCases = rawCases;
            } else {
              const folderTitle = (folder.title || '').trim().toLowerCase();
              const memberScenarios = (project.scenarios || []).filter(s =>
                (s.folderId === folder.id || (folderTitle && s.folderId && s.folderId.trim().toLowerCase() === folderTitle) ||
                 (folderTitle && s.folderName && s.folderName.trim().toLowerCase() === folderTitle)) &&
                !deletedIds.has(s.id)
              );
              memberScenarios.forEach(ms => {
                const msCases = (ms.testCases && ms.testCases.length > 0) ? ms.testCases : getScenarioCases(ms);
                msCases.forEach(tc => {
                  if (Boolean(tc.isApproved) && !deletedIds.has(tc.id)) {
                    fCases.push(tc);
                  }
                });
              });
            }
          }
          fCases.forEach(tc => {
            if (Boolean(tc.isApproved) && !seenTargetIds.has(tc.id) && !deletedIds.has(tc.id)) {
              seenTargetIds.add(tc.id);
              targetCases.push(tc);
            }
          });
        }
      });
    }

    if (targetCases.length === 0 && selectedFolderIds.size === 0 && !instructionText.trim()) {
      toast.error('Please select at least one testcase or folder to generate scripts');
      return;
    }

    if (!selectedTool || !selectedLanguage) {
      setPomPopupMessage({
        title: 'Framework & Language Required',
        description: 'Please select an Automation Framework / Tool and a Programming Language before generating your Page Object Model (POM) script.',
        type: 'warning'
      });
      return;
    }

    setPomPopupMessage({
      title: 'Generating POM Script',
      description: `Synthesizing full Page Object Model (POM) automation architecture using ${selectedTool} in ${selectedLanguage}. Architecting page classes, locator abstractions, and test execution suites...`,
      type: 'info'
    });

    setIsGenerating(true);

    const isBddRequested = 
      selectedTool.toLowerCase().includes('bdd') || 
      selectedTool.toLowerCase().includes('cucumber') ||
      /\b(bdd|cucumber|gherkin|feature\s*files?)\b/i.test(instructionText);

    const toolToUse = isBddRequested 
      ? (selectedTool.includes('BDD') ? selectedTool : `${selectedTool} BDD (Cucumber)`)
      : selectedTool;

    const title = targetCases.length > 0 
      ? (targetCases.length === 1 
          ? (isBddRequested ? `BDD Suite: ${targetCases[0].title}` : targetCases[0].title)
          : `${isBddRequested ? 'BDD' : selectedTool} Suite: ${targetCases[0].title.slice(0, 30)}... (${targetCases.length} cases)`)
      : `${isBddRequested ? 'BDD (Cucumber)' : selectedTool} Automated Suite`;

    try {
      const contextPayload: any = {
        appUrl: targetUrl,
        credentials: {
          username: contextEmail,
          password: contextPassword
        },
        instructionText,
        architecturalInstructions: instructionText,
        isBdd: isBddRequested,
        generateBdd: isBddRequested,
        pomStructure: true,
        dataDriven: true
      };

      if (screenshots.length > 0) {
        contextPayload.screenshots = screenshots.map(s => `data:${s.mimeType};base64,${s.data}`);
      }

      if (videoData?.frames?.length) {
        contextPayload.videoFrames = videoData.frames;
        contextPayload.videoFileName = videoData.fileName;
      }

      // Validate project credit permission before starting synthesis (50 credits deducted upon script generation)
      const permission = await canPerformAction(project.id, 'automation_script', 'analysis', project.name);
      if (!permission.allowed) {
        toast.error(permission.reason || 'Project credits exhausted. Please subscribe to continue.');
        setIsGenerating(false);
        return;
      }

      const generatedCode = await generateAutomationScript(
        targetCases,
        { tool: toolToUse, language: selectedLanguage },
        contextPayload,
        []
      );

      if (!generatedCode || generatedCode.trim().length === 0) {
        throw new Error('No script code received from AI generator.');
      }

      const files = parseScriptIntoFiles(generatedCode, toolToUse as any, selectedLanguage);

      // Determine the concern folder from selected test cases or selected folders
      let concernFolderName = isBddRequested ? 'BDD Automation' : 'General Automation';
      let concernFolderId = generateUniqueFolderId('folder');

      if (selectedFolderIds.size > 0) {
        const firstFolderId = Array.from(selectedFolderIds)[0];
        const fObj = validFolders.find(f => f.id === firstFolderId) || (project.scenarios || []).find(s => s.id === firstFolderId);
        if (fObj) {
          concernFolderName = fObj.title || concernFolderName;
          concernFolderId = fObj.id || concernFolderId;
        }
      } else if (targetCases.length > 0) {
        // Look up scenario from allTestCases first
        const matchedItem = allTestCases.find(item => targetCases.some(tc => tc.id === item.testCase.id));
        if (matchedItem && matchedItem.scenario) {
          concernFolderName = matchedItem.scenario.title || concernFolderName;
          concernFolderId = matchedItem.scenario.id || concernFolderId;
        } else {
          const matchedScen = (project.scenarios || []).find(s => 
            (s.testCases || []).some(tc => targetCases.some(tcTarget => tcTarget.id === tc.id))
          );
          if (matchedScen) {
            concernFolderName = matchedScen.title || concernFolderName;
            concernFolderId = matchedScen.id || concernFolderId;
          }
        }
      } else if (initialFolderName) {
        concernFolderName = initialFolderName;
        concernFolderId = initialFolderId || generateUniqueFolderId('folder');
      }

      // Create new draft script (isSaved: false). Do not automatically save into SCRIPT FOLDERS until user explicitly saves it.
      const newScriptId = `draft-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const selectedToolName = isBddRequested ? (selectedTool.includes('BDD') ? selectedTool : `${selectedTool} BDD`) : selectedTool;
      const draftScriptObj: AutomationScript = {
        id: newScriptId,
        title,
        description: isBddRequested 
          ? `Behavior-Driven (BDD / Cucumber) ${selectedLanguage} framework with Gherkin feature files, step definitions, and POM pages`
          : `Production-ready ${selectedTool} ${selectedLanguage} POM suite`,
        tool: selectedToolName,
        framework: selectedToolName,
        language: selectedLanguage,
        content: generatedCode,
        files,
        createdAt: new Date().toISOString(),
        testCaseTitles: targetCases.map(c => c.title),
        testCaseIds: targetCases.map(c => c.id).filter(Boolean),
        isApproved: false,
        source: 'script_generator',
        platform: selectedTool === 'Appium' ? 'mobile' : 'web',
        appUrl: targetUrl || undefined,
        appPackage: appPackage || undefined,
        folderId: concernFolderId,
        folderName: concernFolderName,
        isSaved: false,
        isImported: false
      };

      // Add to unsaved scripts state (user must explicitly save script)
      setUnsavedScripts(prev => [draftScriptObj, ...prev]);

      // Clean up selection state
      setSelectedCaseIds(new Set());
      setSelectedFolderIds(new Set());
      setSelectedRepositoryFolder('ALL');
      setArtifactFilter('');

      // Prompt user with the Save Script modal to ask for folder and save confirmation
      handleOpenSaveModal(draftScriptObj);

      toast.success(
        `Generated POM script suite! Please review and confirm folder to save script.`,
        { duration: 5000 }
      );
      await logActivity(user.email, user.name, `Generated ${selectedTool} Script Draft: ${title} (Pending Save)`, project.id, project.name);

      // Automatically scroll down to the generated script in repository
      setTimeout(() => {
        const el = document.getElementById('automation-repository-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error('Script generation error:', err);
      toast.error(`Generation error: ${err.message || 'Failed to synthesize script'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Open Save Script Modal
  const handleOpenSaveModal = (script: AutomationScript) => {
    // Determine default destination folder
    const existingList = script.isImported
      ? (groupedImportedScriptFolders.length > 0 ? groupedImportedScriptFolders.map(g => g.folderName) : ['Imported Scripts'])
      : (groupedScriptFolders.length > 0 ? groupedScriptFolders.map(g => g.folderName) : ['General Scripts']);
    const initialFolderName = (script.folderName && script.folderName.trim()) 
      ? script.folderName.trim() 
      : (existingList[0] || (script.isImported ? 'Imported Scripts' : 'General Scripts'));
    const initialFolderId = script.folderId || initialFolderName;

    setSaveModalScript({
      script,
      title: script.title || 'Automation Script',
      folderMode: 'existing',
      selectedFolderId: initialFolderId,
      selectedFolderName: initialFolderName,
      newFolderName: '',
      concernFolderId: initialFolderId,
      concernFolderName: initialFolderName
    });
  };

  // Confirm Saving Script (Manual Save to Selected Folder)
  const handleConfirmSaveScript = async () => {
    if (!saveModalScript) return;
    const { script, title, folderMode, selectedFolderName, selectedFolderId, newFolderName } = saveModalScript;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error('Please enter a script title');
      return;
    }

    let finalFolderId = selectedFolderId || (script.isImported ? 'Imported Scripts' : 'General Scripts');
    let finalFolderName = selectedFolderName || (script.isImported ? 'Imported Scripts' : 'General Scripts');
    let newFolderObj: any = null;

    if (folderMode === 'new') {
      const trimmedNew = newFolderName.trim();
      if (!trimmedNew) {
        toast.error('Please enter a new folder name');
        return;
      }
      finalFolderName = trimmedNew;
      finalFolderId = generateUniqueFolderId('folder');

      // Create new folder in project automation folders if not already there
      const existingFolder = (project.automationFolders || []).find(f => f.name.toLowerCase() === trimmedNew.toLowerCase());
      if (!existingFolder) {
        newFolderObj = {
          id: finalFolderId,
          name: trimmedNew,
          type: 'script_generator' as const,
          isUserCreatedScriptFolder: true,
          isImported: Boolean(script.isImported),
          platform: (script.platform || 'web') as 'web' | 'mobile'
        };
        setUserCreatedFolderNames(prev => new Set([...prev, trimmedNew.toLowerCase()]));
      } else {
        finalFolderId = existingFolder.id;
        finalFolderName = existingFolder.name;
      }
    } else {
      finalFolderName = (selectedFolderName || (script.isImported ? 'Imported Scripts' : 'General Scripts')).trim();
      finalFolderId = selectedFolderId || finalFolderName;
    }

    // Build the saved script object
    const isScriptImported = isImportedScript(script);
    const resolvedScriptFiles = (script.files && script.files.length > 0 && script.files.some(f => f && f.content && f.content.trim().length > 0))
      ? script.files
      : parseScriptIntoFiles(script.content, script.tool, script.language);

    const savedScriptObj: AutomationScript = {
      ...script,
      id: script.id.startsWith('draft-') ? `script-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` : script.id,
      title: trimmedTitle,
      tool: script.tool,
      framework: script.framework || script.tool,
      language: script.language,
      folderId: finalFolderId,
      folderName: finalFolderName,
      content: script.content,
      files: resolvedScriptFiles,
      isSaved: true,
      isImported: isScriptImported,
      source: 'script_generator'
    };

    // Remove from unsaved scripts
    setUnsavedScripts(prev => prev.filter(s => s.id !== script.id));

    // Save into project automation scripts
    const existingIndex = (project.automationScripts || []).findIndex(s => s.id === script.id || s.id === savedScriptObj.id);
    let updatedScripts: AutomationScript[];
    if (existingIndex >= 0) {
      updatedScripts = (project.automationScripts || []).map((s, idx) => idx === existingIndex ? savedScriptObj : s);
    } else {
      updatedScripts = [savedScriptObj, ...(project.automationScripts || [])];
    }

    let updatedAutomationFolders = [...(project.automationFolders || [])];
    if (folderMode === 'new' && newFolderObj) {
      if (isScriptImported) newFolderObj.isImported = true;
      updatedAutomationFolders.push(newFolderObj);
    } else if (isScriptImported) {
      // Ensure the imported folder is registered in automationFolders
      const existingFolder = updatedAutomationFolders.find(f => f.name.toLowerCase() === finalFolderName.toLowerCase());
      if (!existingFolder) {
        updatedAutomationFolders.push({
          id: finalFolderId,
          name: finalFolderName,
          description: `Imported scripts folder "${finalFolderName}"`,
          isImported: true,
          type: 'script_generator' as const
        });
      }
    }

    const updatedProject = {
      ...project,
      automationFolders: updatedAutomationFolders,
      automationScripts: updatedScripts
    };

    saveProjectBackup(updatedProject);
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);

    // Make sure the destination folder is expanded in Script Folders tab or Imported tab
    setExpandedScriptFolders(prev => new Set([...prev, finalFolderName]));

    if (isScriptImported) {
      setActiveTab('imported');
    } else {
      setActiveTab('scripts');
    }
    setSelectedRepositoryFolder(finalFolderName);

    setSaveModalScript(null);
    toast.success(`Script "${trimmedTitle}" saved under folder "${finalFolderName}"!`);
    await logActivity(user.email, user.name, `Saved Script: ${trimmedTitle} into folder ${finalFolderName}`, project.id, project.name);
  };

  // Discard Unsaved Draft Script
  const handleDiscardUnsaved = (scriptId: string) => {
    setUnsavedScripts(prev => prev.filter(s => s.id !== scriptId));
    toast.info('Discarded unsaved script draft');
  };

  // Create New Script Folder
  const handleCreateNewScriptFolder = () => {
    const trimmed = newScriptFolderInput.trim();
    if (!trimmed) {
      toast.error('Please enter a folder name');
      return;
    }
    const existing = (project.automationFolders || []).find(f => f.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      toast.info(`Folder "${trimmed}" already exists`);
      setIsAddingScriptFolder(false);
      setNewScriptFolderInput('');
      return;
    }
    const newFolder = {
      id: generateUniqueFolderId('folder'),
      name: trimmed,
      type: 'script_generator' as const,
      isUserCreatedScriptFolder: true,
      platform: (selectedTool === 'Appium' ? 'mobile' : 'web') as 'web' | 'mobile'
    };
    setUserCreatedFolderNames(prev => new Set([...prev, trimmed.toLowerCase()]));

    const updatedAutomationFolders = [...(project.automationFolders || []), newFolder];
    const updatedProject = {
      ...project,
      automationFolders: updatedAutomationFolders
    };

    saveProjectBackup(updatedProject);
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);
    setExpandedScriptFolders(prev => new Set([...prev, trimmed]));
    setIsAddingScriptFolder(false);
    setNewScriptFolderInput('');
    toast.success(`Created folder "${trimmed}"`);
  };

  // Handle Refine Script
  const handleRefineScript = async (scriptId: string) => {
    const prompt = refinementPrompts[scriptId];
    if (!prompt || !prompt.trim()) {
      toast.error('Please enter a refinement instruction');
      return;
    }

    const script = allArtifacts.find(s => s.id === scriptId) || (project.automationScripts || []).find(s => s.id === scriptId);
    if (!script) return;

    // Validate project credit permission before starting refinement
    const permission = await canPerformAction(project.id, 'automation_script', 'analysis', project.name);
    if (!permission.allowed) {
      toast.error(permission.reason || 'Project credits exhausted. Please subscribe to continue.');
      setRefiningScriptId(null);
      return;
    }

    setRefiningScriptId(scriptId);

    try {
      // 1. Resolve existing POM files from in-memory cache, IndexedDB backup, or active state
      // strictly respecting any prior deletedFilePaths so removed files never reappear
      const cachedBackup = await getProjectBackup(project.id);
      const backupScript = cachedBackup?.automationScripts?.find(s => s.id === scriptId);

      const priorDeletedPaths: string[] = Array.from(new Set([
        ...(Array.isArray(script.deletedFilePaths) ? script.deletedFilePaths : []),
        ...(Array.isArray(backupScript?.deletedFilePaths) ? backupScript.deletedFilePaths : [])
      ]));

      const candidateFiles = (script.files && script.files.length > 0) ? script.files : [];
      const backupFiles = (backupScript?.files && backupScript.files.length > 0) ? backupScript.files : [];
      const sourceFiles: AutomationScriptFile[] = (candidateFiles.length > 0)
        ? candidateFiles
        : (backupFiles.length > 0 ? backupFiles : []);

      const rawExistingFiles: AutomationScriptFile[] = sourceFiles.length > 0
        ? sourceFiles.map(f => ({ ...f }))
        : parseScriptIntoFiles(script.content, script.tool, script.language);

      // Filter against any previously deleted file paths
      const existingFiles: AutomationScriptFile[] = filterDeletedScriptFiles(rawExistingFiles, priorDeletedPaths);

      // 2. Prepare intelligent content for AI refinement
      // If the suite has many files (e.g. 135 files), avoid sending a 100,000+ char raw payload
      // Send manifest + relevant files so Gemini can accurately refine without truncation
      let contentToSend = '';
      if (existingFiles.length > 0) {
        if (existingFiles.length > 15) {
          const promptLower = prompt.toLowerCase();
          const manifestList = existingFiles.map(f => `- ${f.path}`).join('\n');
          
          // Find most relevant files for this prompt
          const relevantFiles = existingFiles.filter(f => {
            const pLower = f.path.toLowerCase();
            const baseName = pLower.split('/').pop() || '';
            return pLower.includes('config') ||
                   pLower.includes('basepage') ||
                   pLower.includes('envutils') ||
                   pLower.includes('steps') ||
                   promptLower.split(/\s+/).some(w => w.length > 3 && (pLower.includes(w) || baseName.includes(w)));
          }).slice(0, 15);

          const filesToInclude = relevantFiles.length > 0 ? relevantFiles : existingFiles.slice(0, 10);
          contentToSend = `PROJECT MANIFEST (${existingFiles.length} files in POM structure):\n${manifestList}\n\n` +
            filesToInclude.map(f => `### \`${f.path}\`\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
        } else {
          contentToSend = existingFiles.map(f => `### \`${f.path}\`\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
        }
      } else {
        contentToSend = script.content || '';
      }

      const refinedCode = await refineAutomationScript(
        contentToSend,
        prompt,
        { tool: script.tool, language: script.language },
        { appUrl: script.appUrl, credentials: { username: contextEmail, password: contextPassword } }
      );

      if (refinedCode) {
        // 3. Detect any files that were requested to be removed or confirmed as deleted
        const detectedDeletions = detectRemovedFilesFromRefinement(prompt, refinedCode, existingFiles);
        const allDeletedFilePaths = Array.from(new Set([
          ...priorDeletedPaths,
          ...detectedDeletions
        ]));

        // 4. Parse newly refined files from AI response and filter out any deleted files
        const newlyRefinedFiles = filterDeletedScriptFiles(
          parseScriptIntoFiles(refinedCode, script.tool, script.language),
          allDeletedFilePaths
        );

        // 5. Extract explanation / summary of refined changes from text before code fences
        let summaryText = '';
        const firstFence = refinedCode.indexOf('```');
        if (firstFence > 0) {
          let preFence = refinedCode.substring(0, firstFence).trim();
          // Remove DELETED_FILES machine header if present from user-facing summary
          preFence = preFence.replace(/DELETED_FILES\s*:\s*[^\n\r]+/gi, '').trim();
          // Remove trailing file headers before fence
          preFence = preFence.replace(/#{1,6}\s*`?[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_-]+`?\s*$/, '').trim();
          preFence = preFence.replace(/\*\*(?:File:?\s*)?`?[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_-]+`?\*\*\s*$/, '').trim();
          if (preFence.length > 8) {
            summaryText = preFence;
          }
        }
        if (!summaryText) {
          if (detectedDeletions.length > 0) {
            summaryText = `Removed file(s): ${detectedDeletions.join(', ')}. ${newlyRefinedFiles.length > 0 ? `Updated ${newlyRefinedFiles.length} file(s).` : 'File removed successfully.'}`;
          } else {
            summaryText = `Refinement Applied: "${prompt}". ${newlyRefinedFiles.length > 0 ? `Updated ${newlyRefinedFiles.length} file(s) in POM structure.` : 'Code refined successfully.'}`;
          }
        }

        // 6. Filter existing POM files against all deleted paths
        const cleanBaseFiles = filterDeletedScriptFiles(existingFiles, allDeletedFilePaths);
        const refinedPaths: string[] = [];
        const mergedFiles: AutomationScriptFile[] = cleanBaseFiles.map(f => ({ ...f }));

        if (newlyRefinedFiles.length > 0) {
          for (const newFile of newlyRefinedFiles) {
            const normNewPath = newFile.path.replace(/^[./\\]+/, '').replace(/\\/g, '/').toLowerCase();
            const newFileName = normNewPath.split('/').pop() || normNewPath;

            // Find match in existing POM structure
            const existingIdx = mergedFiles.findIndex(ef => {
              const normEfPath = ef.path.replace(/^[./\\]+/, '').replace(/\\/g, '/').toLowerCase();
              const efFileName = normEfPath.split('/').pop() || normEfPath;
              return normEfPath === normNewPath || efFileName === newFileName;
            });

            if (existingIdx >= 0) {
              const targetPath = mergedFiles[existingIdx].path;
              mergedFiles[existingIdx] = {
                path: targetPath,
                content: newFile.content
              };
              refinedPaths.push(targetPath);
            } else {
              mergedFiles.push({
                path: newFile.path,
                content: newFile.content
              });
              refinedPaths.push(newFile.path);
            }
          }
        } else if (cleanBaseFiles.length === 0 && detectedDeletions.length === 0) {
          // If no code fence was returned and no existing files, create default file
          const defaultExt = script.language === 'Python' ? 'py' : script.language === 'Java' ? 'java' : script.language === 'TypeScript' ? 'ts' : 'js';
          mergedFiles.push({ path: `script.${defaultExt}`, content: refinedCode });
          refinedPaths.push(`script.${defaultExt}`);
        } else if (cleanBaseFiles.length > 0 && newlyRefinedFiles.length === 0 && detectedDeletions.length === 0) {
          // AI output a single raw code block without file headers: update the first file
          mergedFiles[0] = { ...mergedFiles[0], content: refinedCode };
          refinedPaths.push(mergedFiles[0].path);
        }

        // Final sanity filter on mergedFiles against all deleted paths
        const finalMergedFiles = filterDeletedScriptFiles(mergedFiles, allDeletedFilePaths);

        // 7. Reconstruct composite content
        const defaultExt = script.language === 'Python' ? 'python' : script.language === 'Java' ? 'java' : script.language === 'TypeScript' ? 'typescript' : 'javascript';
        let updatedCompositeContent = '';
        if (summaryText) {
          updatedCompositeContent += `### Refinement Changes:\n${summaryText}\n\n---\n\n`;
        }

        if (finalMergedFiles.length === 0) {
          updatedCompositeContent += `/* All files in script suite removed. */\n`;
        } else if (finalMergedFiles.length > 25) {
          updatedCompositeContent += `/* Unified POM Suite (${finalMergedFiles.length} files). All files preserved in files array. */\n\n`;
          // Render the refined files and top 10 files in markdown preview
          const previewFiles = finalMergedFiles.filter(f => refinedPaths.includes(f.path) || f.path.includes('config') || f.path.includes('BasePage')).slice(0, 15);
          updatedCompositeContent += previewFiles.map(f => {
            const fExt = (f.path.split('.').pop() || '').toLowerCase();
            const langTag = fExt === 'py' ? 'python' : fExt === 'java' ? 'java' : fExt === 'ts' ? 'typescript' : fExt === 'js' ? 'javascript' : fExt === 'json' ? 'json' : fExt === 'xml' ? 'xml' : defaultExt;
            return `### \`${f.path}\`\n\`\`\`${langTag}\n${f.content}\n\`\`\``;
          }).join('\n\n');
        } else {
          updatedCompositeContent += finalMergedFiles.map(f => {
            const fExt = (f.path.split('.').pop() || '').toLowerCase();
            const langTag = fExt === 'py' ? 'python' : fExt === 'java' ? 'java' : fExt === 'ts' ? 'typescript' : fExt === 'js' ? 'javascript' : fExt === 'json' ? 'json' : fExt === 'xml' ? 'xml' : defaultExt;
            return `### \`${f.path}\`\n\`\`\`${langTag}\n${f.content}\n\`\`\``;
          }).join('\n\n');
        }

        const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const updatedData = {
          content: updatedCompositeContent,
          files: finalMergedFiles,
          deletedFilePaths: allDeletedFilePaths,
          lastRefinementSummary: summaryText,
          refinedFilePaths: refinedPaths,
          lastRefinedAt: nowTime
        };

        // If it's an unsaved script draft, update unsavedScripts
        if (unsavedScripts.some(s => s.id === scriptId)) {
          setUnsavedScripts(prev => prev.map(s => s.id === scriptId ? { ...s, ...updatedData } : s));
        } else {
          const updatedScripts = (project.automationScripts || []).map(s => {
            if (s.id === scriptId) {
              return {
                ...s,
                ...updatedData
              };
            }
            return s;
          });

          const nextProject: Project = {
            ...project,
            automationScripts: updatedScripts
          };

          // Save to multi-tier backup immediately so files array is never dropped
          saveProjectBackup(nextProject);

          onUpdateProject(nextProject);
        }

        // Adjust active tab: if currently active file was deleted, switch to the first remaining file or all files
        const currentActive = activeScriptFile[scriptId];
        const isCurrentActiveDeleted = currentActive && allDeletedFilePaths.some(dp => {
          const normDp = dp.replace(/\\/g, '/').toLowerCase();
          const dpBase = normDp.split('/').pop() || normDp;
          const normAct = currentActive.replace(/\\/g, '/').toLowerCase();
          const actBase = normAct.split('/').pop() || normAct;
          return normAct === normDp || actBase === dpBase || normAct.endsWith(`/${normDp}`);
        });

        if (isCurrentActiveDeleted || (currentActive !== '__all__' && currentActive !== '__changes__' && !finalMergedFiles.some(f => f.path === currentActive))) {
          setActiveScriptFile(prev => ({
            ...prev,
            [scriptId]: finalMergedFiles.length > 0 ? finalMergedFiles[0].path : '__all__'
          }));
        } else if (refinedPaths.length > 0) {
          setActiveScriptFile(prev => ({ ...prev, [scriptId]: refinedPaths[0] }));
        }

        setRefinementPrompts(prev => ({ ...prev, [scriptId]: '' }));

        if (detectedDeletions.length > 0) {
          toast.success(`Refinement applied! Removed ${detectedDeletions.length} file(s) and kept ${finalMergedFiles.length} file(s).`);
        } else {
          toast.success(`Refinement applied! Updated ${refinedPaths.length} file(s) while preserving all ${finalMergedFiles.length} files.`);
        }
        await logActivity(user.email, user.name, `Refined script: ${script.title}`, project.id, project.name);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Error occurred';
      const cleanMsg = (errMsg.includes('aborted without reason') || errMsg.includes('signal is aborted') || errMsg.includes('AbortError'))
        ? 'AI request timed out or was interrupted. Please retry your refinement request.'
        : errMsg;
      toast.error(`Refinement failed: ${cleanMsg}`);
    } finally {
      setRefiningScriptId(null);
    }
  };

  // Direct file deletion handler from UI
  const handleDeleteScriptFile = (scriptId: string, filePathToDelete: string) => {
    const script = allArtifacts.find(s => s.id === scriptId) || (project.automationScripts || []).find(s => s.id === scriptId);
    if (!script) return;

    const rawFiles = (script.files && script.files.length > 0)
      ? script.files
      : parseScriptIntoFiles(script.content, script.tool, script.language);

    const updatedDeletedPaths = Array.from(new Set([
      ...(Array.isArray(script.deletedFilePaths) ? script.deletedFilePaths : []),
      filePathToDelete
    ]));

    const remainingFiles = filterDeletedScriptFiles(rawFiles, updatedDeletedPaths);

    const defaultExt = script.language === 'Python' ? 'python' : script.language === 'Java' ? 'java' : script.language === 'TypeScript' ? 'typescript' : 'javascript';
    let updatedCompositeContent = '';
    const fileName = filePathToDelete.split('/').pop() || filePathToDelete;
    const summaryText = `Removed file "${fileName}" from POM structure.`;
    updatedCompositeContent += `### Refinement Changes:\n${summaryText}\n\n---\n\n`;

    if (remainingFiles.length === 0) {
      updatedCompositeContent += `/* All files in script suite removed. */\n`;
    } else {
      updatedCompositeContent += remainingFiles.map(f => {
        const fExt = (f.path.split('.').pop() || '').toLowerCase();
        const langTag = fExt === 'py' ? 'python' : fExt === 'java' ? 'java' : fExt === 'ts' ? 'typescript' : fExt === 'js' ? 'javascript' : fExt === 'json' ? 'json' : fExt === 'xml' ? 'xml' : defaultExt;
        return `### \`${f.path}\`\n\`\`\`${langTag}\n${f.content}\n\`\`\``;
      }).join('\n\n');
    }

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const updatedData = {
      content: updatedCompositeContent,
      files: remainingFiles,
      deletedFilePaths: updatedDeletedPaths,
      lastRefinementSummary: summaryText,
      lastRefinedAt: nowTime
    };

    setActiveScriptFile(prev => ({
      ...prev,
      [scriptId]: remainingFiles.length > 0 ? remainingFiles[0].path : '__all__'
    }));

    if (unsavedScripts.some(s => s.id === scriptId)) {
      setUnsavedScripts(prev => prev.map(s => s.id === scriptId ? { ...s, ...updatedData } : s));
    } else {
      const updatedScripts = (project.automationScripts || []).map(s => {
        if (s.id === scriptId) return { ...s, ...updatedData };
        return s;
      });
      const nextProject: Project = { ...project, automationScripts: updatedScripts };
      saveProjectBackup(nextProject);
      onUpdateProject(nextProject);
    }

    toast.success(`Removed "${fileName}" from script`);
  };

  // Toggle Script Approval
  const handleToggleApprove = (script: AutomationScript) => {
    const isNowApproved = !script.isApproved;
    const isUnsaved = unsavedScripts.some(s => s.id === script.id);

    const updatedScriptObj: AutomationScript = {
      ...script,
      isApproved: isNowApproved,
      isSaved: true,
      source: script.source || 'script_generator'
    };

    if (isUnsaved) {
      setUnsavedScripts(prev => prev.filter(s => s.id !== script.id));
    }

    const currentScripts = project.automationScripts || [];
    const existingIdx = currentScripts.findIndex(s => s.id === script.id || (Boolean(s.isImported) && Boolean(script.isImported) && s.title === script.title));
    let updatedScripts: AutomationScript[];
    if (existingIdx >= 0) {
      updatedScripts = currentScripts.map((s, idx) => idx === existingIdx ? updatedScriptObj : s);
    } else {
      updatedScripts = [updatedScriptObj, ...currentScripts];
    }

    const updatedProject: Project = {
      ...project,
      automationScripts: updatedScripts
    };

    saveProjectBackup(updatedProject);
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);

    if (isNowApproved) {
      toast.success('Script approved and added to Execution Hub!');
    } else {
      toast.info('Script removed from Execution Hub');
    }
  };

  // Copy Script Content (deducts 50 credits)
  const handleCopyScript = async (script: AutomationScript) => {
    const success = await deductExportCredits(
      project.id,
      'automation_script',
      user,
      `Copy ${script.tool || 'POM'} Script`,
      project.name
    );
    if (!success) return;

    navigator.clipboard.writeText(script.content);
    toast.success('Script copied to clipboard!');
  };

  // Download Script or ZIP (deducts 50 credits)
  const handleDownloadScript = async (script: AutomationScript) => {
    const success = await deductExportCredits(
      project.id,
      'automation_script',
      user,
      `Download ${script.tool || 'POM'} Script`,
      project.name
    );
    if (!success) return;

    const files = script.files && script.files.length > 0 
      ? script.files 
      : parseScriptIntoFiles(script.content, script.tool, script.language);

    if (files.length > 1) {
      const zip = new JSZip();
      files.forEach(f => zip.file(f.path, f.content));
      const formattedStack = formatScriptLanguageAndFramework(script);
      zip.file('README.md', `# ${script.title}\n\nGenerated with ${formattedStack}\n\n## Run\n\`\`\`bash\n${script.tool === 'Selenium' && script.language === 'Python' ? 'pytest' : script.tool === 'Selenium' && script.language === 'Java' ? 'mvn test' : script.tool === 'Cypress' ? 'npx cypress run' : 'npx playwright test'}\n\`\`\``);
      const blob = await zip.generateAsync({ type: 'blob' });
      const safeTitle = (script?.title ? String(script.title) : 'script').replace(/[^a-zA-Z0-9_-]/g, '_');
      saveAs(blob, `${safeTitle}.zip`);
      toast.success('Downloaded POM project zip archive');
    } else {
      const ext = script.language === 'Python' ? 'py' : script.language === 'Java' ? 'java' : 'ts';
      const blob = new Blob([script.content], { type: 'text/plain;charset=utf-8' });
      const safeTitle = (script?.title ? String(script.title) : 'script').replace(/[^a-zA-Z0-9_-]/g, '_');
      saveAs(blob, `${safeTitle}.spec.${ext}`);
      toast.success('Downloaded script file');
    }
  };

  // Delete Script
  const handleDeleteScript = (scriptId: string) => {
    addDeletedIds([scriptId]);
    setUnsavedScripts(prev => prev.filter(s => s.id !== scriptId));
    const updatedScripts = (project.automationScripts || []).filter(s => s.id !== scriptId);
    const updatedProject = { ...project, automationScripts: updatedScripts };

    saveProjectBackup(updatedProject);
    try {
      localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(updatedProject));
    } catch (e) {}

    onUpdateProject(updatedProject);
    const nextSelected = new Set(selectedScriptIds);
    nextSelected.delete(scriptId);
    setSelectedScriptIds(nextSelected);
    toast.success('Script removed from repository');
  };

  // Import Script(s) from Disk
  const handleImportScriptFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);

    const readPromises = files.map(file => {
      return new Promise<AutomationScript | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = (event.target?.result as string) || '';
          if (!content.trim()) {
            resolve(null);
            return;
          }

          const lower = file.name.toLowerCase();
          let lang: ProgrammingLanguage = selectedLanguage;
          let tool: AutomationTool = selectedTool;
          if (lower.endsWith('.py')) lang = 'Python';
          else if (lower.endsWith('.java')) lang = 'Java';
          else if (lower.endsWith('.cs')) lang = 'C#';
          else if (lower.endsWith('.ts')) lang = 'TypeScript';
          else if (lower.endsWith('.js')) lang = 'JavaScript';

          if (content.includes('playwright') || content.includes('@playwright/test')) tool = 'Playwright';
          else if (content.includes('cypress') || content.includes('cy.')) tool = 'Cypress';
          else if (content.includes('selenium') || content.includes('webdriver')) tool = 'Selenium';
          else if (content.includes('appium')) tool = 'Appium';

          const cleanTitle = (file?.name ? String(file.name) : 'script').replace(/\.[^/.]+$/, '');
          const scriptFiles = parseScriptIntoFiles(content, tool, lang);
          const finalFiles = scriptFiles.length > 0 ? scriptFiles : [{ path: file.name, content }];

          resolve({
            id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
            title: cleanTitle,
            tool,
            language: lang,
            content,
            files: finalFiles,
            createdAt: new Date().toISOString(),
            isApproved: false, // NOT approved by default
            isImported: true,
            source: 'script_generator',
            isSaved: false, // Draft: user must click "SAVE SCRIPT" to save
            folderName: 'Imported Scripts',
            folderId: 'imported-scripts'
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      });
    });

    const importedResults = await Promise.all(readPromises);
    const validNewScripts = importedResults.filter((s): s is AutomationScript => s !== null && !!s.content.trim());

    if (validNewScripts.length === 0) {
      toast.error('No readable content found in selected file(s).');
      if (importScriptFileRef.current) importScriptFileRef.current.value = '';
      return;
    }

    // Add to unsaved scripts state (user must explicitly click "SAVE SCRIPT" to save under Imported Scripts folder)
    setUnsavedScripts(prev => [...validNewScripts, ...prev]);

    setSelectedRepositoryFolder('ALL');
    setArtifactFilter('');
    setActiveTab('imported');

    setTimeout(() => {
      const repoEl = document.getElementById('automation-repository-section');
      if (repoEl) repoEl.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    toast.success(`Imported ${validNewScripts.length} script${validNewScripts.length > 1 ? 's' : ''} as draft. Click "SAVE SCRIPT" to save.`);
    if (importScriptFileRef.current) importScriptFileRef.current.value = '';
  };

  // Import All Scripts from a Folder as a Single Unified POM Suite
  const handleImportScriptFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    let detectedFolderName = 'Imported Scripts';
    const firstRelPath = (files[0] as any).webkitRelativePath || '';
    if (firstRelPath) {
      const parts = firstRelPath.split('/');
      if (parts.length > 1 && parts[0].trim()) {
        detectedFolderName = parts[0].trim();
      }
    }

    const isJunkOrBinary = (name: string, relPath: string) => {
      const lower = name.toLowerCase();
      const lowerPath = relPath.toLowerCase();
      if (lower.startsWith('.') || lower === 'thumbs.db' || lower === 'desktop.ini') return true;
      if (lowerPath.includes('/node_modules/') || lowerPath.includes('/.git/') || lowerPath.includes('/dist/') || lowerPath.includes('/build/')) return true;
      if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.zip') || lower.endsWith('.pdf') || lower.endsWith('.exe')) return true;
      return false;
    };

    const validExtensions = ['.ts', '.js', '.py', '.java', '.cs', '.spec.ts', '.test.ts', '.spec.js', '.test.js', '.robot', '.feature', '.txt', '.sh', '.bat', '.json', '.xml', '.yml', '.yaml'];
    const nonJunkFiles = files.filter(f => !isJunkOrBinary(f.name, (f as any).webkitRelativePath || f.name));

    const scriptFiles = nonJunkFiles.filter(f => {
      const lower = f.name.toLowerCase();
      return validExtensions.some(ext => lower.endsWith(ext));
    });

    const targetFiles = scriptFiles.length > 0 ? scriptFiles : nonJunkFiles;
    const folderId = `folder-${String(detectedFolderName || 'general').toLowerCase().replace(/\s+/g, '-')}`;

    const readPromises = targetFiles.map(file => {
      return new Promise<{ path: string; content: string; name: string } | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = (event.target?.result as string) || '';
          if (!content.trim()) {
            resolve(null);
            return;
          }

          const relPath = (file as any).webkitRelativePath || file.name;
          // Clean path relative to root folder
          const cleanPath = relPath.startsWith(detectedFolderName + '/')
            ? relPath.substring(detectedFolderName.length + 1)
            : relPath;

          resolve({
            path: cleanPath,
            content,
            name: file.name
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      });
    });

    const readResults = await Promise.all(readPromises);
    const validFileEntries = readResults.filter((f): f is { path: string; content: string; name: string } => f !== null && !!f.content.trim());

    if (validFileEntries.length === 0) {
      toast.error('No readable scripts found in the selected folder.');
      if (importFolderRef.current) importFolderRef.current.value = '';
      return;
    }

    // Sort files logically: config files first, then pages/base, then tests/specs, then others
    validFileEntries.sort((a, b) => {
      const isConfigA = a.path.toLowerCase().includes('config');
      const isConfigB = b.path.toLowerCase().includes('config');
      if (isConfigA && !isConfigB) return -1;
      if (!isConfigA && isConfigB) return 1;
      const isPageA = a.path.toLowerCase().includes('page');
      const isPageB = b.path.toLowerCase().includes('page');
      if (isPageA && !isPageB) return -1;
      if (!isPageA && isPageB) return 1;
      return a.path.localeCompare(b.path);
    });

    // Detect tool and language across all files
    let detectedTool: AutomationTool = selectedTool;
    let detectedLang: ProgrammingLanguage = selectedLanguage;
    const allCode = validFileEntries.map(f => f.content).join('\n');
    const allPaths = validFileEntries.map(f => f.path.toLowerCase()).join(' ');

    if (allCode.includes('playwright') || allPaths.includes('playwright') || allCode.includes('@playwright/test')) {
      detectedTool = 'Playwright';
    } else if (allCode.includes('cypress') || allPaths.includes('cypress') || allCode.includes('cy.')) {
      detectedTool = 'Cypress';
    } else if (allCode.includes('selenium') || allCode.includes('webdriver')) {
      detectedTool = 'Selenium';
    } else if (allCode.includes('appium')) {
      detectedTool = 'Appium';
    }

    if (allPaths.includes('.ts') || allPaths.includes('.tsx')) {
      detectedLang = 'TypeScript';
    } else if (allPaths.includes('.py')) {
      detectedLang = 'Python';
    } else if (allPaths.includes('.java')) {
      detectedLang = 'Java';
    } else if (allPaths.includes('.cs')) {
      detectedLang = 'C#';
    } else if (allPaths.includes('.js')) {
      detectedLang = 'JavaScript';
    }

    // Combine into structured POM suite markdown content
    const combinedMarkdownContent = validFileEntries.map(f => {
      const ext = f.path.split('.').pop() || '';
      const langTag = ext === 'ts' ? 'typescript' : ext === 'js' ? 'javascript' : ext === 'py' ? 'python' : ext === 'java' ? 'java' : ext === 'json' ? 'json' : ext;
      return `### \`${f.path}\`\n\`\`\`${langTag}\n${f.content}\n\`\`\``;
    }).join('\n\n');

    // Create a SINGLE AutomationScript object representing the entire POM structure
    const singlePomSuiteScript: AutomationScript = {
      id: `import-suite-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      title: detectedFolderName,
      description: `Imported POM folder "${detectedFolderName}" with ${validFileEntries.length} files in unified POM structure`,
      tool: detectedTool,
      framework: detectedTool,
      language: detectedLang,
      content: combinedMarkdownContent,
      files: validFileEntries.map(f => ({ path: f.path, content: f.content })),
      createdAt: new Date().toISOString(),
      isApproved: false, // NOT approved by default!
      isImported: true,
      source: 'script_generator',
      isSaved: false, // Draft: user must click "SAVE SCRIPT" to save
      folderName: detectedFolderName,
      folderId
    };

    // Add to unsaved scripts state (user must explicitly click "SAVE SCRIPT" to save under folder)
    setUnsavedScripts(prev => [singlePomSuiteScript, ...prev]);

    setSelectedRepositoryFolder('ALL');
    setArtifactFilter('');
    setActiveTab('imported');

    setTimeout(() => {
      const repoEl = document.getElementById('automation-repository-section');
      if (repoEl) repoEl.scrollIntoView({ behavior: 'smooth' });
    }, 100);

    toast.success(`Imported folder "${detectedFolderName}" (${validFileEntries.length} files as draft). Click "SAVE SCRIPT" to save.`);

    if (importFolderRef.current) importFolderRef.current.value = '';
  };

  // Available test cases for the Append Modal
  const availableModalTestCases = useMemo(() => {
    if (!appendModalScript) return [];
    const deletedIds = getDeletedIds();
    const list: { id: string; title: string; scenarioTitle: string; priority?: string; type?: string; isAlreadyInScript: boolean }[] = [];
    const seen = new Set<string>();

    allTestCases.forEach(({ testCase, scenario }) => {
      if (testCase && testCase.id && !seen.has(testCase.id) && !deletedIds.has(testCase.id)) {
        seen.add(testCase.id);
        const inScript = Boolean(
          (appendModalScript.script.testCaseIds || []).includes(testCase.id) ||
          (appendModalScript.script.testCaseTitles || []).some(t => t.toLowerCase() === testCase.title.toLowerCase())
        );
        list.push({
          id: testCase.id,
          title: testCase.title,
          scenarioTitle: scenario?.title || 'Functional Test Cases',
          priority: testCase.priority,
          type: testCase.testType,
          isAlreadyInScript: inScript
        });
      }
    });

    (project.manualTestCases || []).forEach(mc => {
      if (mc && mc.id && !seen.has(mc.id) && !deletedIds.has(mc.id)) {
        seen.add(mc.id);
        const inScript = Boolean(
          (appendModalScript.script.testCaseIds || []).includes(mc.id) ||
          (appendModalScript.script.testCaseTitles || []).some(t => t.toLowerCase() === mc.title.toLowerCase())
        );
        list.push({
          id: mc.id,
          title: mc.title,
          scenarioTitle: 'Manual Test Cases',
          priority: mc.priority,
          type: mc.testType,
          isAlreadyInScript: inScript
        });
      }
    });

    return list;
  }, [appendModalScript, allTestCases, project.manualTestCases]);

  const filteredModalCases = useMemo(() => {
    if (!appendModalScript) return [];
    const q = appendModalScript.searchQuery.trim().toLowerCase();
    if (!q) return availableModalTestCases;
    return availableModalTestCases.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.scenarioTitle.toLowerCase().includes(q)
    );
  }, [availableModalTestCases, appendModalScript?.searchQuery]);

  // Open the Append Modal
  const handleOpenAppendModal = (script: AutomationScript) => {
    const initialSelected = new Set<string>();
    selectedCaseIds.forEach(id => initialSelected.add(id));

    setAppendModalScript({
      script,
      selectedCaseIds: initialSelected,
      instruction: instructionText ? instructionText.trim() : '',
      searchQuery: '',
      isSubmitting: false,
      statusMessage: ''
    });
  };

  const handleAppendToScript = (script: AutomationScript) => {
    handleOpenAppendModal(script);
  };

  // Execute AI Script Generation & Append to Script
  const handleExecuteAppend = async () => {
    if (!appendModalScript) return;
    const { script, selectedCaseIds: modalCaseIds, instruction } = appendModalScript;

    const deletedIds = getDeletedIds();
    const targetCases: TestCase[] = [];
    const seenIds = new Set<string>();

    allTestCases.forEach(({ testCase }) => {
      if (modalCaseIds.has(testCase.id) && !seenIds.has(testCase.id) && !deletedIds.has(testCase.id)) {
        seenIds.add(testCase.id);
        targetCases.push(testCase);
      }
    });

    (project.scenarios || []).forEach(scen => {
      if (deletedIds.has(scen.id)) return;
      const scenCases = Array.isArray(scen.testCases) && scen.testCases.length > 0
        ? scen.testCases
        : getScenarioCases(scen);
      scenCases.forEach(tc => {
        if (modalCaseIds.has(tc.id) && !seenIds.has(tc.id) && !deletedIds.has(tc.id)) {
          seenIds.add(tc.id);
          targetCases.push(tc);
        }
      });
    });

    (project.manualTestCases || []).forEach(tc => {
      if (modalCaseIds.has(tc.id) && !seenIds.has(tc.id) && !deletedIds.has(tc.id)) {
        seenIds.add(tc.id);
        targetCases.push(tc);
      }
    });

    if (targetCases.length === 0 && !instruction.trim()) {
      toast.error('Please select at least one test case or enter instructions to append.');
      return;
    }

    // Permission / credit check
    const permission = await canPerformAction(project.id, 'automation_script', 'analysis', project.name);
    if (!permission.allowed) {
      toast.error(permission.reason || 'Project credits exhausted. Please subscribe to continue.');
      return;
    }

    setAppendModalScript(prev => prev ? {
      ...prev,
      isSubmitting: true,
      statusMessage: `Synthesizing ${targetCases.length > 0 ? `${targetCases.length} new test cases` : 'specifications'} into ${script.tool} suite with Gemini...`
    } : null);

    try {
      // 1. Gather existing files from script
      const candidateFiles = (script.files && script.files.length > 0) ? script.files : [];
      const rawExistingFiles: AutomationScriptFile[] = candidateFiles.length > 0
        ? candidateFiles.map(f => ({ ...f }))
        : parseScriptIntoFiles(script.content, script.tool as any, script.language as any);

      const existingFiles: AutomationScriptFile[] = filterDeletedScriptFiles(rawExistingFiles, script.deletedFilePaths || []);

      // 2. Prepare contentToSend for intelligent prompt
      let contentToSend = '';
      if (existingFiles.length > 0) {
        if (existingFiles.length > 15) {
          const manifestList = existingFiles.map(f => `- ${f.path}`).join('\n');
          const relevantFiles = existingFiles.filter(f => {
            const pLower = f.path.toLowerCase();
            return pLower.includes('config') ||
                   pLower.includes('basepage') ||
                   pLower.includes('steps') ||
                   pLower.includes('page') ||
                   pLower.includes('spec') ||
                   pLower.includes('test');
          }).slice(0, 15);
          const filesToInclude = relevantFiles.length > 0 ? relevantFiles : existingFiles.slice(0, 10);
          contentToSend = `PROJECT MANIFEST (${existingFiles.length} files in POM structure):\n${manifestList}\n\n` +
            filesToInclude.map(f => `### \`${f.path}\`\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
        } else {
          contentToSend = existingFiles.map(f => `### \`${f.path}\`\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
        }
      } else {
        contentToSend = script.content || '';
      }

      const contextPayload: any = {
        appUrl: script.appUrl || targetUrl,
        credentials: {
          username: contextEmail,
          password: contextPassword
        },
        instructionText: instruction.trim(),
        architecturalInstructions: instruction.trim(),
        pomStructure: true,
        dataDriven: true
      };

      if (screenshots.length > 0) {
        contextPayload.screenshots = screenshots.map(s => `data:${s.mimeType};base64,${s.data}`);
      }
      if (videoData?.frames?.length) {
        contextPayload.videoFrames = videoData.frames;
        contextPayload.videoFileName = videoData.fileName;
      }

      // 3. Call AI to generate appended script
      const appendedCode = await appendToAutomationScript(
        contentToSend,
        targetCases,
        { tool: script.tool, language: script.language },
        contextPayload
      );

      if (!appendedCode || appendedCode.trim().length === 0) {
        throw new Error('No script content received from AI generator.');
      }

      // 4. Parse newly appended files from AI response
      const newlyAppendedFiles = filterDeletedScriptFiles(
        parseScriptIntoFiles(appendedCode, script.tool as any, script.language as any),
        script.deletedFilePaths || []
      );

      // 5. Extract summary from text before code blocks
      let summaryText = '';
      const firstFence = appendedCode.indexOf('```');
      if (firstFence > 0) {
        let preFence = appendedCode.substring(0, firstFence).trim();
        preFence = preFence.replace(/#{1,6}\s*`?[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_-]+`?\s*$/, '').trim();
        if (preFence.length > 8) {
          summaryText = preFence;
        }
      }
      if (!summaryText) {
        summaryText = targetCases.length > 0
          ? `Appended ${targetCases.length} test case(s) (${targetCases.map(c => c.title).slice(0, 2).join(', ')}${targetCases.length > 2 ? '...' : ''}) to suite.`
          : `Appended specifications: "${instruction.trim().slice(0, 60)}..."`;
      }

      // 6. Merge newly appended files into existing POM structure
      const mergedFiles: AutomationScriptFile[] = existingFiles.map(f => ({ ...f }));
      const appendedFilePaths: string[] = [];

      if (newlyAppendedFiles.length > 0) {
        for (const newFile of newlyAppendedFiles) {
          const normNewPath = newFile.path.replace(/^[./\\]+/, '').replace(/\\/g, '/').toLowerCase();
          const newFileName = normNewPath.split('/').pop() || normNewPath;

          const existingIdx = mergedFiles.findIndex(ef => {
            const normEfPath = ef.path.replace(/^[./\\]+/, '').replace(/\\/g, '/').toLowerCase();
            const efFileName = normEfPath.split('/').pop() || normEfPath;
            return normEfPath === normNewPath || efFileName === newFileName;
          });

          if (existingIdx >= 0) {
            const targetPath = mergedFiles[existingIdx].path;
            mergedFiles[existingIdx] = {
              path: targetPath,
              content: newFile.content
            };
            appendedFilePaths.push(targetPath);
          } else {
            mergedFiles.push({
              path: newFile.path,
              content: newFile.content
            });
            appendedFilePaths.push(newFile.path);
          }
        }
      } else if (existingFiles.length === 0) {
        const defaultExt = script.language === 'Python' ? 'py' : script.language === 'Java' ? 'java' : script.language === 'TypeScript' ? 'ts' : 'js';
        mergedFiles.push({ path: `script.${defaultExt}`, content: appendedCode });
        appendedFilePaths.push(`script.${defaultExt}`);
      } else if (existingFiles.length > 0 && newlyAppendedFiles.length === 0) {
        mergedFiles[0] = { ...mergedFiles[0], content: appendedCode };
        appendedFilePaths.push(mergedFiles[0].path);
      }

      // Reconstruct composite markdown content
      const defaultExt = script.language === 'Python' ? 'python' : script.language === 'Java' ? 'java' : script.language === 'TypeScript' ? 'typescript' : 'javascript';
      let updatedCompositeContent = '';
      if (summaryText) {
        updatedCompositeContent += `### Appended Specifications:\n${summaryText}\n\n---\n\n`;
      }
      if (mergedFiles.length > 25) {
        updatedCompositeContent += `/* Unified POM Suite (${mergedFiles.length} files). */\n\n`;
        const previewFiles = mergedFiles.filter(f => appendedFilePaths.includes(f.path) || f.path.includes('config') || f.path.includes('BasePage')).slice(0, 15);
        updatedCompositeContent += previewFiles.map(f => {
          const fExt = (f.path.split('.').pop() || '').toLowerCase();
          const langTag = fExt === 'py' ? 'python' : fExt === 'java' ? 'java' : fExt === 'ts' ? 'typescript' : fExt === 'js' ? 'javascript' : fExt === 'json' ? 'json' : fExt === 'xml' ? 'xml' : defaultExt;
          return `### \`${f.path}\`\n\`\`\`${langTag}\n${f.content}\n\`\`\``;
        }).join('\n\n');
      } else {
        updatedCompositeContent += mergedFiles.map(f => {
          const fExt = (f.path.split('.').pop() || '').toLowerCase();
          const langTag = fExt === 'py' ? 'python' : fExt === 'java' ? 'java' : fExt === 'ts' ? 'typescript' : fExt === 'js' ? 'javascript' : fExt === 'json' ? 'json' : fExt === 'xml' ? 'xml' : defaultExt;
          return `### \`${f.path}\`\n\`\`\`${langTag}\n${f.content}\n\`\`\``;
        }).join('\n\n');
      }

      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const updatedTitles = Array.from(new Set([...(script.testCaseTitles || []), ...targetCases.map(c => c.title)]));
      const updatedIds = Array.from(new Set([...(script.testCaseIds || []), ...targetCases.map(c => c.id).filter(Boolean)]));

      const updatedScript: AutomationScript = {
        ...script,
        content: updatedCompositeContent,
        files: mergedFiles,
        testCaseTitles: updatedTitles,
        testCaseIds: updatedIds,
        lastRefinementSummary: summaryText,
        refinedFilePaths: appendedFilePaths,
        lastRefinedAt: nowTime
      };

      if (unsavedScripts.some(s => s.id === script.id)) {
        setUnsavedScripts(prev => prev.map(s => s.id === script.id ? updatedScript : s));
      } else {
        const updatedScripts = (project.automationScripts || []).map(s =>
          s.id === script.id ? updatedScript : s
        );
        onUpdateProject({ ...project, automationScripts: updatedScripts });
      }

      // Switch active file tab to the appended/impacted spec or page file
      if (appendedFilePaths.length > 0) {
        const specFile = appendedFilePaths.find(p => p.includes('spec') || p.includes('test') || p.includes('.cy.') || p.includes('Search') || p.includes('Page')) || appendedFilePaths[0];
        setActiveScriptFile(prev => ({ ...prev, [script.id]: specFile }));
      }

      // Clear main page selection
      setSelectedCaseIds(new Set());

      toast.success(`Successfully appended ${targetCases.length > 0 ? `${targetCases.length} test case(s)` : 'specifications'} to ${script.title}! POM structure updated.`);
      setAppendModalScript(null);
    } catch (err: any) {
      console.error('[ScriptGenerator] Failed to append to script:', err);
      toast.error(err?.message || 'Failed to generate and append test cases to script.');
      setAppendModalScript(prev => prev ? { ...prev, isSubmitting: false, statusMessage: '' } : null);
    }
  };

  return (
    <div className="space-y-6 pb-28 max-w-7xl mx-auto">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER (Matches Image 1)                                           */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                AUTOMATION
              </h1>
              {/* RAG Vector Grounding pill badge with interactive toggle */}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-50 border border-teal-200/80 rounded-full text-[11px] font-black text-teal-800 tracking-wide shadow-2xs">
                <Sparkles size={13} className="text-teal-600" />
                <span>RAG Vector Grounding</span>
                <button
                  type="button"
                  onClick={() => {
                    setRagEnabled(!ragEnabled);
                    toast.info(ragEnabled ? 'RAG Grounding disabled' : 'RAG Grounding enabled');
                  }}
                  className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                    ragEnabled ? 'bg-teal-600 justify-end' : 'bg-slate-300 justify-start'
                  }`}
                  title="Toggle RAG Vector Grounding"
                >
                  <div className="bg-white w-3 h-3 rounded-full shadow-xs" />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
              SYNTHESIZE INCREMENTAL POM SCRIPTS WITH ARCHITECTURAL OVERSIGHT & RAG GROUNDING
            </p>
          </div>
        </div>

        {/* Row 1: Framework, Language, App URL */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Framework & Tool */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <span className="text-rose-500">*</span> ⚙️ FRAMEWORK & TOOL
            </label>
            <select
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value as AutomationTool)}
              className={`w-full px-3.5 py-3 bg-slate-50 border rounded-xl text-xs font-bold focus:outline-none focus:border-teal-500 focus:bg-white transition-all cursor-pointer ${
                !selectedTool ? 'border-amber-300 text-slate-400' : 'border-slate-200 text-slate-800'
              }`}
            >
              <option value="">Select Framework / Tool</option>
              <option value="Playwright">Playwright</option>
              <option value="Cypress">Cypress</option>
              <option value="Selenium">Selenium</option>
              <option value="Appium">Appium</option>
              <option value="Playwright BDD (Cucumber)">Playwright BDD (Cucumber)</option>
            </select>
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <span className="text-rose-500">*</span> &gt;_ LANGUAGE
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value as ProgrammingLanguage)}
              className={`w-full px-3.5 py-3 bg-slate-50 border rounded-xl text-xs font-bold focus:outline-none focus:border-teal-500 focus:bg-white transition-all cursor-pointer ${
                !selectedLanguage ? 'border-amber-300 text-slate-400' : 'border-slate-200 text-slate-800'
              }`}
            >
              <option value="">Select Language</option>
              <option value="TypeScript">TypeScript</option>
              <option value="JavaScript">JavaScript</option>
              <option value="Python">Python</option>
              <option value="Java">Java</option>
            </select>
          </div>

          {/* App URL (Optional) */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
              🔗 APP URL (OPTIONAL)
            </label>
            <input
              type="text"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://app.example.com"
              className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
            />
          </div>
        </div>



        {/* Row 3: Tabs Bar and Search */}
        <div className="pt-2 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
            <button
              type="button"
              onClick={() => {
                userManuallySwitchedTabRef.current = true;
                setActiveTab('folders');
                setSelectedRepositoryFolder('ALL');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'folders'
                  ? 'border-b-2 border-teal-600 text-teal-700 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📁 FOLDERS</span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold">
                {validFolders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                userManuallySwitchedTabRef.current = true;
                setActiveTab('scripts');
                setSelectedRepositoryFolder('ALL');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'scripts'
                  ? 'border-b-2 border-teal-600 text-teal-700 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📁 SCRIPT FOLDERS</span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold">
                {totalGeneratedScriptsCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                userManuallySwitchedTabRef.current = true;
                setActiveTab('imported');
                setSelectedRepositoryFolder('ALL');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'imported'
                  ? 'border-b-2 border-teal-600 text-teal-700 font-black'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📁 IMPORTED SCRIPT FOLDERS</span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold">
                {totalImportedScriptsCount}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative shrink-0">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'folders'
                  ? 'Search test cases or folders...'
                  : activeTab === 'scripts'
                  ? 'Search test cases or scripts...'
                  : 'Search imported scripts...'
              }
              className="pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white w-full sm:w-64 transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                title="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {activeTab === 'folders' && (
          <div className="flex items-center justify-between px-1 pt-2 pb-1 gap-2 flex-wrap">
            <button
              type="button"
              onClick={toggleSelectAllVisibleFolders}
              className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-teal-700 cursor-pointer transition-colors"
            >
              {isAllVisibleFoldersSelected ? (
                <CheckSquare size={16} className="text-teal-600" />
              ) : (
                <Square size={16} className="text-slate-400" />
              )}
              <span>Select All Visible Folders ({filteredFolders.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (selectedFolderIds.size === 0) {
                  toast.error('Please select at least one folder to delete');
                  return;
                }
                setShowBulkDeleteFoldersConfirm(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                selectedFolderIds.size > 0
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs active:scale-95'
                  : 'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200'
              }`}
              title={selectedFolderIds.size > 0 ? `Delete ${selectedFolderIds.size} selected folder(s)` : 'Select folders to delete'}
            >
              <Trash2 size={13} />
              <span>Bulk Delete {selectedFolderIds.size > 0 ? `(${selectedFolderIds.size})` : ''}</span>
            </button>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>Selected: <strong className="text-teal-700 font-black">{selectedFolderIds.size}</strong></span>
              <span>Showing <strong className="text-slate-800 font-bold">{filteredFolders.length}</strong> of {validFolders.length} Folders</span>
            </div>
          </div>
        )}

        {/* Folders Tab Content */}
        {activeTab === 'folders' && (
          <div className="space-y-3 pt-1 max-h-[440px] overflow-y-auto pr-1 scrollbar-thin">
            {filteredFolders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl space-y-2">
                <div>
                  {validFolders.length === 0
                    ? 'No approved folders available. Click APPROVE on folders in the AI Test Cases page to make them available here.'
                    : searchQuery.trim()
                    ? `No test cases or folders match "${searchQuery}".`
                    : 'No folders match your search criteria.'}
                </div>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-teal-600 font-bold underline cursor-pointer text-xs"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              filteredFolders.map(scen => {
                const isSelected = selectedFolderIds.has(scen.id);
                const allFolderCases = getFolderCases(scen);
                const q = searchQuery.toLowerCase().trim();
                const folderCases = (q && !scen.title.toLowerCase().includes(q) && !(scen.moduleName || '').toLowerCase().includes(q))
                  ? allFolderCases.filter(tc => {
                      if ((tc.testCaseId || '').toLowerCase().includes(q)) return true;
                      if (tc.title.toLowerCase().includes(q)) return true;
                      if ((tc.description || '').toLowerCase().includes(q)) return true;
                      if (tc.steps && Array.isArray(tc.steps)) {
                        return tc.steps.some((st: any) =>
                          typeof st === 'string'
                            ? st.toLowerCase().includes(q)
                            : (((st.action || '') + ' ' + (st.expectedResult || '')).toLowerCase().includes(q))
                        );
                      }
                      return false;
                    })
                  : allFolderCases;
                const count = folderCases.length;
                const matchingSaved = savedScripts.filter(s => s.folderId === scen.id || s.folderName === scen.title);
                const isExpanded = expandedTestCaseFolders.has(scen.id);

                return (
                  <div
                    key={scen.id}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isSelected
                        ? 'bg-teal-50/20 border-teal-500/80 shadow-xs ring-1 ring-teal-500/20'
                        : 'bg-white border-slate-200/90 shadow-2xs hover:border-slate-300'
                    }`}
                  >
                    {/* Folder Header Row */}
                    <div
                      onClick={() => toggleSelectFolder(scen.id)}
                      className={`p-3.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-teal-50/40' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectFolder(scen.id);
                          }}
                        >
                          {isSelected ? (
                            <CheckSquare size={18} className="text-teal-600" />
                          ) : (
                            <Square size={18} className="text-slate-300 hover:text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-black uppercase text-slate-800 truncate flex items-center gap-2">
                            <Folder size={15} className="text-teal-600 shrink-0" />
                            <span>{scen.title}</span>
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold uppercase text-slate-400">
                              {count} {count === 1 ? 'CASE' : 'CASES'} • {scen.moduleName || 'GENERAL'}
                            </span>
                            {matchingSaved.length > 0 && (
                              <span className="px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase bg-teal-100/80 text-teal-800 border border-teal-200">
                                {matchingSaved.length} {matchingSaved.length === 1 ? 'script' : 'scripts'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                          {count} {count === 1 ? 'case' : 'cases'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpandTestCaseFolder(scen.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg shrink-0 cursor-pointer transition-colors"
                          title={isExpanded ? 'Collapse folder' : 'Expand to view test cases'}
                          aria-label={isExpanded ? 'Collapse folder' : 'Expand to view test cases'}
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteFolderTarget(scen);
                          }}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg shrink-0 cursor-pointer transition-colors border border-transparent hover:border-rose-200"
                          title={`Delete Folder "${scen.title}"`}
                          aria-label={`Delete Folder ${scen.title}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Test Cases Inside This Folder */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 bg-slate-50/50 space-y-2">
                        {folderCases.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400">
                            No approved test cases currently in this folder.
                          </div>
                        ) : (
                          folderCases.map((tc, tcIdx) => {
                            const isCaseSelected = selectedCaseIds.has(tc.id);
                            const isDetailsExpanded = expandedCaseDetails.has(tc.id);

                            return (
                              <div
                                key={tc.id || tcIdx}
                                className={`rounded-xl border transition-all ${
                                  isCaseSelected
                                    ? 'bg-teal-50/40 border-teal-400 shadow-2xs'
                                    : 'bg-white border-slate-200/80 hover:border-slate-300'
                                }`}
                              >
                                <div
                                  onClick={() => toggleSelectCase(tc.id)}
                                  className="p-2.5 flex items-center justify-between gap-2.5 cursor-pointer"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                      className="shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelectCase(tc.id);
                                      }}
                                    >
                                      {isCaseSelected ? (
                                        <CheckSquare size={16} className="text-teal-600" />
                                      ) : (
                                        <Square size={16} className="text-slate-300 hover:text-slate-400" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] font-mono font-black text-teal-800 bg-teal-50 border border-teal-200 px-1.5 py-0.2 rounded-md">
                                          {tc.testCaseId || `TC-${tcIdx + 1}`}
                                        </span>
                                        <span className="text-xs font-bold text-slate-800 truncate">
                                          {tc.title}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span
                                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md uppercase ${
                                        tc.priority === 'High'
                                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                          : tc.priority === 'Low'
                                          ? 'bg-slate-50 text-slate-600 border border-slate-200'
                                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                                      }`}
                                    >
                                      {tc.priority || 'Medium'}
                                    </span>
                                    <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded-md uppercase">
                                      {tc.testType || 'Functional'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleExpandCaseDetails(tc.id);
                                      }}
                                      className="p-1 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
                                      title={isDetailsExpanded ? 'Collapse steps' : 'View steps & expected result'}
                                    >
                                      {isDetailsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                  </div>
                                </div>

                                {/* Expanded Steps & Expected Result */}
                                {isDetailsExpanded && (
                                  <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2 text-xs bg-slate-50/70 rounded-b-xl">
                                    {tc.steps && tc.steps.length > 0 && (
                                      <div>
                                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                                          Steps ({tc.steps.length}):
                                        </span>
                                        <ol className="list-decimal list-inside space-y-0.5 text-slate-600 pl-1 text-[11px]">
                                          {tc.steps.map((s, sIdx) => (
                                            <li key={sIdx}>{s}</li>
                                          ))}
                                        </ol>
                                      </div>
                                    )}
                                    {tc.expectedResult && (
                                      <div>
                                        <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">
                                          Expected Result:
                                        </span>
                                        <p className="text-emerald-900 bg-emerald-50/60 border border-emerald-100 p-2 rounded-lg text-[11px] leading-relaxed">
                                          {tc.expectedResult}
                                        </p>
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
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Script Folders Tab (Grouped by Folder) */}
        {activeTab === 'scripts' && (
          <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
            {/* Top Toolbar for Script Folders */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleSelectAllTabScripts}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {isAllTabScriptsSelected ? (
                    <CheckSquare size={14} className="text-teal-600" />
                  ) : (
                    <Square size={14} className="text-slate-400" />
                  )}
                  <span>Select All ({tabScriptIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedScriptIds.size === 0) {
                      toast.error('Please select at least one script to delete');
                      return;
                    }
                    setShowBulkDeleteScriptsConfirm(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs ${
                    selectedScriptIds.size > 0
                      ? 'bg-rose-600 hover:bg-rose-700 text-white active:scale-95'
                      : 'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200'
                  }`}
                  title={selectedScriptIds.size > 0 ? `Delete ${selectedScriptIds.size} selected script(s)` : 'Select scripts to delete'}
                >
                  <Trash2 size={13} />
                  <span>Bulk Delete {selectedScriptIds.size > 0 ? `(${selectedScriptIds.size})` : ''}</span>
                </button>
              </div>

              {/* Create New Script Folder button */}
              <div className="flex items-center gap-2">
                {isAddingScriptFolder ? (
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-teal-300 shadow-xs">
                    <Folder size={14} className="text-teal-600 ml-1.5" />
                    <input
                      type="text"
                      value={newScriptFolderInput}
                      onChange={(e) => setNewScriptFolderInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateNewScriptFolder();
                        if (e.key === 'Escape') {
                          setIsAddingScriptFolder(false);
                          setNewScriptFolderInput('');
                        }
                      }}
                      placeholder="Folder name..."
                      className="px-2 py-1 text-xs text-slate-800 focus:outline-none w-36"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleCreateNewScriptFolder}
                      className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingScriptFolder(false);
                        setNewScriptFolderInput('');
                      }}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsAddingScriptFolder(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                  >
                    <FolderPlus size={13} />
                    New Folder
                  </button>
                )}
              </div>
            </div>

            {/* Unsaved Generated Scripts Pending Save Banner */}
            {unsavedScripts.some(s => !s.isImported) && (
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-amber-100 text-amber-800 rounded-xl shrink-0">
                    <Save size={15} />
                  </div>
                  <div>
                    <span className="font-black uppercase tracking-tight">
                      {unsavedScripts.filter(s => !s.isImported).length} Generated Script{unsavedScripts.filter(s => !s.isImported).length > 1 ? 's' : ''} Pending Save
                    </span>
                    <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                      Items will be organized under folders once you click "SAVE SCRIPT" or confirm the save prompt.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const firstUnsaved = unsavedScripts.find(s => !s.isImported);
                    if (firstUnsaved) handleOpenSaveModal(firstUnsaved);
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-xs flex items-center gap-1.5"
                >
                  <Save size={13} />
                  Save Script
                </button>
              </div>
            )}

            {filteredScriptFolders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl space-y-2">
                <div>
                  {groupedScriptFolders.length === 0
                    ? 'No folders and no generated scripts in this project yet. Select test cases or folders and click "GENERATE POM SCRIPT".'
                    : searchQuery.trim()
                    ? `No test cases or scripts match "${searchQuery}".`
                    : 'No script folders found.'}
                </div>
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-teal-600 font-bold underline cursor-pointer text-xs"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Generated & Saved Script Folders */}
                {filteredScriptFolders.map(folderGroup => {
                  const isExpanded = expandedScriptFolders.has(folderGroup.folderName);
                  return (
                    <div
                      key={folderGroup.folderName}
                      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs transition-all"
                    >
                      {/* Folder Accordion Header */}
                      <div
                        onClick={() => {
                          setExpandedScriptFolders(prev => {
                            const next = new Set(prev);
                            if (next.has(folderGroup.folderName)) next.delete(folderGroup.folderName);
                            else next.add(folderGroup.folderName);
                            return next;
                          });
                        }}
                        className="p-3.5 bg-slate-50/90 hover:bg-slate-100/90 flex items-center justify-between gap-3 cursor-pointer transition-colors border-b border-slate-100"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-teal-100 text-teal-700 rounded-lg">
                            <Folder size={16} />
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-900 uppercase tracking-tight">
                              {folderGroup.folderName}
                            </span>
                            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-600 border border-slate-200">
                              {folderGroup.scripts.length} {folderGroup.scripts.length === 1 ? 'script' : 'scripts'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRepositoryFolder(folderGroup.folderName);
                              const repoEl = document.getElementById('automation-repository-section');
                              if (repoEl) repoEl.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-all cursor-pointer"
                            title="Filter repository to this folder"
                          >
                            View in Repo
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteScriptFolderTarget({
                                folderId: folderGroup.folderId,
                                folderName: folderGroup.folderName,
                                scriptCount: folderGroup.scripts.length,
                                scripts: folderGroup.scripts,
                                isImported: false
                              });
                            }}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-all cursor-pointer"
                            title={`Delete folder "${folderGroup.folderName}"`}
                            aria-label={`Delete folder ${folderGroup.folderName}`}
                          >
                            <Trash2 size={14} />
                          </button>
                          {isExpanded ? (
                            <ChevronUp size={16} className="text-slate-400" />
                          ) : (
                            <ChevronDown size={16} className="text-slate-400" />
                          )}
                        </div>
                      </div>

                      {/* Folder Content - List of scripts inside this folder */}
                      {isExpanded && (
                        <div className="p-2 space-y-2 bg-slate-50/40">
                          {folderGroup.scripts.length === 0 ? (
                            <div className="p-4 text-center text-slate-400 text-xs italic">
                              No scripts in this folder yet.
                            </div>
                          ) : (
                            folderGroup.scripts.map(script => {
                              const isSelected = selectedScriptIds.has(script.id);
                              return (
                                <div
                                  key={script.id}
                                  className={`bg-white rounded-xl border p-3 flex items-center justify-between gap-3 shadow-2xs transition-all ${
                                    isSelected ? 'border-teal-500 bg-teal-50/20 ring-1 ring-teal-500/30' : 'border-slate-200/90'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelectScript(script.id);
                                      }}
                                      className="text-slate-400 hover:text-teal-600 cursor-pointer transition-colors"
                                    >
                                      {isSelected ? (
                                        <CheckSquare size={15} className="text-teal-600" />
                                      ) : (
                                        <Square size={15} className="text-slate-300" />
                                      )}
                                    </button>
                                    <div className="p-1.5 bg-teal-50 text-teal-600 rounded-lg shrink-0">
                                      <FileCode size={14} />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-bold text-slate-800 truncate">{script.title}</h4>
                                        {script.isSaved === false && (
                                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                            Draft
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        {formatScriptLanguageAndFramework(script)} • {script.files?.length || 1} files
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedScriptIds(new Set([script.id]));
                                        setSelectedRepositoryFolder(folderGroup.folderName);
                                        const repoEl = document.getElementById('automation-repository-section');
                                        if (repoEl) repoEl.scrollIntoView({ behavior: 'smooth' });
                                      }}
                                      className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                                      title="View code in repository"
                                    >
                                      View
                                    </button>
                                    {script.isSaved === false && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenSaveModal(script)}
                                        className="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs cursor-pointer transition-all"
                                        title="Save script to folder"
                                      >
                                        <Save size={11} />
                                        Save
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleToggleApprove(script)}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                        script.isApproved
                                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                          : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700'
                                      }`}
                                    >
                                      <CheckCircle2 size={12} className={script.isApproved ? 'text-emerald-600' : 'text-slate-400'} />
                                      {script.isApproved ? 'Approved' : 'Approve'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenAppendModal(script)}
                                      className="px-2 py-1 bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-700 border border-slate-200 hover:border-teal-300 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                                      title="Append test cases to this script suite"
                                    >
                                      <Plus size={10} className="text-teal-600" />
                                      Append
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSaveModal(script)}
                                      className="p-1 text-slate-400 hover:text-teal-600 hover:bg-slate-100 rounded-md cursor-pointer transition-colors"
                                      title="Move to another folder"
                                    >
                                      <Folder size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteScriptTarget(script)}
                                      className="text-slate-300 hover:text-rose-500 p-1 rounded-md shrink-0 cursor-pointer transition-colors"
                                      title="Delete Script"
                                    >
                                      <Trash2 size={13} />
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
          </div>
        )}

        {/* Imported Script Folders Tab */}
        {activeTab === 'imported' && (
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
            {unsavedScripts.some(s => s.isImported) && (
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-amber-100 text-amber-800 rounded-xl shrink-0">
                    <Save size={15} />
                  </div>
                  <div>
                    <span className="font-black uppercase tracking-tight">
                      {unsavedScripts.filter(s => s.isImported).length} Imported Script{unsavedScripts.filter(s => s.isImported).length > 1 ? 's' : ''} Pending Save
                    </span>
                    <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                      Items are saved to your repository and folders only after you click "SAVE SCRIPT" below.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRepositoryFolder('ALL');
                    const repoEl = document.getElementById('automation-repository-section');
                    if (repoEl) repoEl.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-xs"
                >
                  Review & Save
                </button>
              </div>
            )}
            {filteredImportedScriptFolders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <Archive size={22} />
                </div>
                <div>
                  <p className="font-bold text-slate-700 text-sm">
                    {searchQuery.trim() ? `No imported scripts match "${searchQuery}"` : 'No imported script folders yet'}
                  </p>
                  <p className="text-slate-400 text-xs mt-1">
                    {searchQuery.trim() ? 'Try a different search term or clear the filter.' : 'Import local scripts or script folders to manage and execute them here.'}
                  </p>
                </div>
                {searchQuery.trim() ? (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-indigo-600 font-bold underline cursor-pointer text-xs"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => importScriptFileRef.current?.click()}
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
                    >
                      <Upload size={14} className="text-slate-500" />
                      IMPORT SCRIPTS
                    </button>
                    <button
                      type="button"
                      onClick={() => importFolderRef.current?.click()}
                      className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
                    >
                      <Folder size={14} className="text-slate-500" />
                      IMPORT SCRIPT FOLDER
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleSelectAllImportedTabScripts}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      {isAllImportedTabScriptsSelected ? (
                        <CheckSquare size={14} className="text-indigo-600" />
                      ) : (
                        <Square size={14} className="text-slate-400" />
                      )}
                      <span>Select All ({importedTabScriptIds.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (selectedScriptIds.size === 0) {
                          toast.error('Please select at least one script to delete');
                          return;
                        }
                        setShowBulkDeleteScriptsConfirm(true);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs ${
                        selectedScriptIds.size > 0
                          ? 'bg-rose-600 hover:bg-rose-700 text-white active:scale-95'
                          : 'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200'
                      }`}
                      title={selectedScriptIds.size > 0 ? `Delete ${selectedScriptIds.size} selected script(s)` : 'Select scripts to delete'}
                    >
                      <Trash2 size={13} />
                      <span>Bulk Delete {selectedScriptIds.size > 0 ? `(${selectedScriptIds.size})` : ''}</span>
                    </button>

                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1">
                      {groupedImportedScriptFolders.length} Folder{groupedImportedScriptFolders.length === 1 ? '' : 's'} • {importedTabScriptIds.length} Script{importedTabScriptIds.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => importScriptFileRef.current?.click()}
                      className="px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Upload size={13} />
                      Import Scripts
                    </button>
                    <button
                      type="button"
                      onClick={() => importFolderRef.current?.click()}
                      className="px-2.5 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Folder size={13} />
                      Import Folder
                    </button>
                  </div>
                </div>

                {filteredImportedScriptFolders.map(folderGroup => {
                  const isExpanded = expandedScriptFolders.has(folderGroup.folderName);
                  return (
                    <div
                      key={folderGroup.folderId || folderGroup.folderName}
                      className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-2xs transition-all"
                    >
                      <div
                        onClick={() => {
                          setExpandedScriptFolders(prev => {
                            const next = new Set(prev);
                            if (next.has(folderGroup.folderName)) next.delete(folderGroup.folderName);
                            else next.add(folderGroup.folderName);
                            return next;
                          });
                        }}
                        className="p-3.5 bg-indigo-50/40 hover:bg-indigo-50/70 flex items-center justify-between gap-3 cursor-pointer transition-colors border-b border-slate-100"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                            <Archive size={16} />
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-900 uppercase tracking-tight">
                              {folderGroup.folderName}
                            </span>
                            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-indigo-700 border border-indigo-200">
                              {folderGroup.scripts.length} {folderGroup.scripts.length === 1 ? 'script' : 'scripts'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRepositoryFolder(folderGroup.folderName);
                              const repoEl = document.getElementById('automation-repository-section');
                              if (repoEl) repoEl.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-white hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-all cursor-pointer"
                            title="Filter repository to this folder"
                          >
                            View in Repo
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteScriptFolderTarget({
                                folderId: folderGroup.folderId,
                                folderName: folderGroup.folderName,
                                scriptCount: folderGroup.scripts.length,
                                scripts: folderGroup.scripts,
                                isImported: true
                              });
                            }}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition-all cursor-pointer"
                            title={`Delete imported folder "${folderGroup.folderName}"`}
                            aria-label={`Delete imported folder ${folderGroup.folderName}`}
                          >
                            <Trash2 size={14} />
                          </button>
                          {isExpanded ? (
                            <ChevronUp size={16} className="text-slate-400" />
                          ) : (
                            <ChevronDown size={16} className="text-slate-400" />
                          )}
                        </div>
                      </div>

                      {/* Folder Content - List of scripts inside this imported folder */}
                      {isExpanded && (
                        <div className="p-2 space-y-2 bg-slate-50/40">
                          {folderGroup.scripts.length === 0 ? (
                            <div className="p-4 text-center text-slate-400 text-xs italic">
                              No scripts in this imported folder.
                            </div>
                          ) : (
                            folderGroup.scripts.map(script => {
                              const isSelected = selectedScriptIds.has(script.id);
                              return (
                                <div
                                  key={script.id}
                                  className={`bg-white rounded-xl border p-3 flex items-center justify-between gap-3 shadow-2xs transition-all ${
                                    isSelected ? 'border-indigo-500 bg-indigo-50/20 ring-1 ring-indigo-500/30' : 'border-slate-200/90'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelectScript(script.id);
                                      }}
                                      className="text-slate-400 hover:text-indigo-600 cursor-pointer transition-colors"
                                    >
                                      {isSelected ? (
                                        <CheckSquare size={15} className="text-indigo-600" />
                                      ) : (
                                        <Square size={15} className="text-slate-300" />
                                      )}
                                    </button>
                                    <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                                      <FileCode size={14} />
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className="text-xs font-bold text-slate-800 truncate">{script.title}</h4>
                                      <span className="text-[10px] text-slate-400 font-mono">
                                        {formatScriptLanguageAndFramework(script)} • {script.files?.length || 1} files
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleApprove(script)}
                                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                        script.isApproved
                                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                          : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700'
                                      }`}
                                    >
                                      <CheckCircle2 size={12} className={script.isApproved ? 'text-emerald-600' : 'text-slate-400'} />
                                      {script.isApproved ? 'Approved' : 'Approve'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenSaveModal(script)}
                                      className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-md cursor-pointer transition-colors"
                                      title="Move to another folder"
                                    >
                                      <Folder size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeleteScriptTarget(script)}
                                      className="text-slate-300 hover:text-rose-500 p-1 rounded-md shrink-0 cursor-pointer transition-colors"
                                      title="Delete Imported Script"
                                    >
                                      <Trash2 size={13} />
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
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. INSTRUCTION FIELD (Matches Image 2)                                    */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            💬 INSTRUCTION FIELD
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400">
              {instructionText.length}/1000
            </span>
            {instructionText && (
              <button
                type="button"
                onClick={() => setInstructionText('')}
                className="text-slate-400 hover:text-slate-600 text-[10px] cursor-pointer"
                title="Clear instruction"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <textarea
          value={instructionText}
          onChange={(e) => setInstructionText(e.target.value.slice(0, 1000))}
          placeholder="e.g. 'Use specific naming conventions', 'Add BasePage class', 'Locator strategy: data-testid first'"
          rows={3}
          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all resize-none font-medium leading-relaxed"
        />

        <p className="text-[11px] text-amber-600 font-medium">
          * Note: Instruction text may override default behavior if there is a conflict.
        </p>
      </div>

      {/* ========================================================================= */}
      {/* 3. AI PROMPT SYNTHESIS BAR (Matches Image 2)                              */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left info badge */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 bg-teal-500/10 text-teal-600 rounded-2xl flex items-center justify-center shrink-0 border border-teal-500/20">
            <Sparkles size={24} className="text-teal-600" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
              AI PROMPT SYNTHESIS
            </h3>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              GENERATE SMART. AUTOMATE FASTER.
            </p>
            <div className="text-[10px] font-black uppercase tracking-wider text-teal-600 mt-0.5">
              {selectedCount} SELECTED • POM STRUCTURE DEFAULT
            </div>
          </div>
        </div>

        {/* Right action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => importScriptFileRef.current?.click()}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <Upload size={14} className="text-slate-500" />
            IMPORT SCRIPTS
          </button>
          <input
            ref={importScriptFileRef}
            type="file"
            multiple
            accept=".ts,.js,.py,.java,.cs,.spec.ts,.test.ts,.spec.js,.test.js,.robot,.feature,.txt,.sh,.bat"
            className="hidden"
            onChange={handleImportScriptFile}
          />

          <button
            type="button"
            onClick={() => importFolderRef.current?.click()}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
          >
            <Folder size={14} className="text-slate-500" />
            IMPORT SCRIPT FOLDER
          </button>
          <input
            ref={importFolderRef}
            type="file"
            multiple
            // @ts-ignore
            webkitdirectory="true"
            directory="true"
            className="hidden"
            onChange={handleImportScriptFolder}
          />

          <button
            type="button"
            onClick={handleGenerateScript}
            disabled={isGenerating}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Code2 size={15} />
            )}
            {isGenerating ? 'SYNTHESIZING...' : 'GENERATE POM SCRIPT'}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. AUTOMATION REPOSITORY (Matches Image 2 & 3)                            */}
      {/* ========================================================================= */}
      <div id="automation-repository-section" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              🗄️ AUTOMATION REPOSITORY
            </h2>
            {filteredArtifacts.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAllVisibleScripts}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  {isAllVisibleScriptsSelected ? (
                    <CheckSquare size={14} className="text-teal-600" />
                  ) : (
                    <Square size={14} className="text-slate-400" />
                  )}
                  <span>Select All ({filteredArtifacts.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedScriptIds.size === 0) {
                      toast.error('Please select at least one script to delete');
                      return;
                    }
                    setShowBulkDeleteScriptsConfirm(true);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs ${
                    selectedScriptIds.size > 0
                      ? 'bg-rose-600 hover:bg-rose-700 text-white active:scale-95'
                      : 'bg-white hover:bg-rose-50 text-rose-600 border border-rose-200'
                  }`}
                  title={selectedScriptIds.size > 0 ? `Delete ${selectedScriptIds.size} selected script(s)` : 'Select scripts to delete'}
                >
                  <Trash2 size={13} />
                  <span>Bulk Delete {selectedScriptIds.size > 0 ? `(${selectedScriptIds.size})` : ''}</span>
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {visibleUnsavedDraftsCount > 0 && (
              <span className="px-2.5 py-1 rounded-xl text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                {visibleUnsavedDraftsCount} Unsaved Draft{visibleUnsavedDraftsCount > 1 ? 's' : ''}
              </span>
            )}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={artifactFilter}
                onChange={(e) => setArtifactFilter(e.target.value)}
                placeholder="Filter artifacts..."
                className="pl-9 pr-8 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 shadow-2xs w-full sm:w-56 transition-all"
              />
              {artifactFilter && (
                <button
                  type="button"
                  onClick={() => setArtifactFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  title="Clear filter"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Repository Folder Tabs / Filter Pills */}
        {availableRepositoryFolders.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin pt-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 shrink-0">
              Folder:
            </span>
            <button
              type="button"
              onClick={() => setSelectedRepositoryFolder('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                selectedRepositoryFolder === 'ALL'
                  ? 'bg-teal-600 text-white shadow-2xs font-black'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>All Folders</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                selectedRepositoryFolder === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {availableRepositoryFolders.reduce((sum, g) => sum + g.scripts.length, 0)}
              </span>
            </button>
            {availableRepositoryFolders.map(fg => {
              const isActive = selectedRepositoryFolder.toLowerCase() === fg.folderName.toLowerCase();
              return (
                <div
                  key={fg.folderName}
                  className={`inline-flex items-center rounded-xl text-xs font-bold transition-all whitespace-nowrap overflow-hidden border ${
                    isActive
                      ? 'bg-teal-600 text-white border-teal-600 shadow-2xs font-black'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedRepositoryFolder(fg.folderName)}
                    className="px-3 py-1.5 cursor-pointer flex items-center gap-1.5 focus:outline-none"
                  >
                    <Folder size={12} className={isActive ? 'text-white' : 'text-teal-600'} />
                    <span>{fg.folderName}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {fg.scripts.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteScriptFolderTarget({
                        folderId: fg.folderId,
                        folderName: fg.folderName,
                        scriptCount: fg.scripts.length,
                        scripts: fg.scripts,
                        isImported: activeTab === 'imported'
                      });
                    }}
                    className={`px-1.5 py-1.5 cursor-pointer transition-colors border-l ${
                      isActive
                        ? 'border-teal-500/60 text-white/80 hover:text-white hover:bg-teal-700'
                        : 'border-slate-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                    }`}
                    title={`Delete folder "${fg.folderName}"`}
                    aria-label={`Delete folder ${fg.folderName}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
            {selectedRepositoryFolder !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedRepositoryFolder('ALL')}
                className="px-2 py-1 text-[11px] font-bold text-teal-700 hover:text-rose-600 hover:underline cursor-pointer whitespace-nowrap"
              >
                Clear Filter
              </button>
            )}
          </div>
        )}

        {filteredArtifacts.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center text-slate-500 text-xs">
            {artifactFilter.trim() ? (
              <div>
                No scripts match filter <strong className="text-slate-800 font-bold">"{artifactFilter}"</strong>.{' '}
                <button
                  type="button"
                  onClick={() => setArtifactFilter('')}
                  className="text-teal-600 font-bold underline cursor-pointer"
                >
                  Clear filter
                </button>
              </div>
            ) : selectedRepositoryFolder !== 'ALL' ? (
              <div>
                No scripts in folder <strong className="text-slate-800 font-bold">"{selectedRepositoryFolder}"</strong>.{' '}
                <button
                  type="button"
                  onClick={() => setSelectedRepositoryFolder('ALL')}
                  className="text-teal-600 font-bold underline cursor-pointer"
                >
                  View all folders
                </button>
              </div>
            ) : activeTab === 'imported' ? (
              <div>
                No imported scripts in repository yet. Import local scripts or script folders above.
              </div>
            ) : (
              <div>
                No automation scripts in repository yet. Select test cases above and click <span className="font-bold text-teal-600">GENERATE POM SCRIPT</span>.
              </div>
            )}
          </div>
        ) : (
          filteredArtifacts.map((script) => {
            const formattedDate = script.createdAt 
              ? new Date(script.createdAt).toLocaleDateString('en-GB') 
              : '17/08/2026';
            const isSelected = selectedScriptIds.has(script.id);
            const isDraft = script.isSaved === false || unsavedScripts.some(s => s.id === script.id);
            const currentFolderName = script.folderName || 'General Scripts';
            
            // Resolve files: automatically heal existing scripts if any file has '---', missing paths, or empty file content,
            // and strictly filter out any deleted files so removed files never reappear
            let rawFiles = script.files && script.files.length > 0 ? script.files : [];
            let hasCorruptFiles = rawFiles.length === 0 || rawFiles.some(f => !f || !f.path || f.path.trim() === '---' || f.path.trim().startsWith('---') || !f.content || f.content.trim().length === 0);

            // Rehydrate empty file contents from backup if present
            if (hasCorruptFiles) {
              let backupFiles: AutomationScriptFile[] = [];
              let backupMarkdown = '';
              try {
                const rawBackup = localStorage.getItem(`automatiqa_project_backup_${project.id}`);
                if (rawBackup) {
                  const parsedBackup = JSON.parse(rawBackup);
                  const foundB = (parsedBackup.automationScripts || []).find((bs: any) => bs.id === script.id || bs.title === script.title);
                  if (foundB) {
                    if (Array.isArray(foundB.files) && foundB.files.some((f: any) => f && f.content && f.content.trim().length > 0)) {
                      backupFiles = foundB.files;
                    }
                    if (foundB.content && !foundB.content.startsWith('/* POM Suite') && !foundB.content.startsWith('/* Generated script')) {
                      backupMarkdown = foundB.content;
                    }
                  }
                }
              } catch (e) {}

              // Step A: Rehydrate individual file contents from backup if rawFiles has paths
              if (rawFiles.length > 0) {
                rawFiles = rawFiles.map(f => {
                  if (!f.content || f.content.trim().length === 0) {
                    const bf = backupFiles.find(b => b.path === f.path || (b.path.split('/').pop() || b.path) === (f.path.split('/').pop() || f.path));
                    if (bf && bf.content && bf.content.trim().length > 0) {
                      return { ...f, content: bf.content };
                    }
                  }
                  return f;
                });
              }

              // Step B: If still missing content, attempt parsing from script.content or backupMarkdown
              const candidateMarkdown = (script.content && !script.content.startsWith('/* POM Suite') && !script.content.startsWith('/* Generated script'))
                ? script.content
                : backupMarkdown;

              if (candidateMarkdown && candidateMarkdown.trim().length > 0) {
                const parsedFiles = parseScriptIntoFiles(candidateMarkdown, script.tool, script.language);
                if (parsedFiles.length > 0) {
                  rawFiles = parsedFiles;
                }
              } else if (backupFiles.length > 0) {
                rawFiles = backupFiles;
              }
            }

            let unFilteredFiles = [...rawFiles];

            // Auto-heal missing .env file for legacy or existing loaded scripts
            if (unFilteredFiles.length > 0 && !unFilteredFiles.some(f => f && typeof f.path === 'string' && (f.path === '.env' || f.path.endsWith('/.env') || f.path.endsWith('.env') || f.path === 'src/test/resources/config.properties'))) {
              const extractedUrl = (script as any).targetUrl || 'https://example.com';
              const envContent = script.language === 'Java'
                ? `# Environment Configuration\nbaseUrl=${extractedUrl}\ntestUsername=qa_automation_user\ntestPassword=secure_password_placeholder\nbrowser=chrome\ntimeout=30000`
                : `# Environment Configuration\nBASE_URL=${extractedUrl}\nTEST_USERNAME=qa_automation_user\nTEST_PASSWORD=secure_password_placeholder\nHEADLESS=true\nBROWSER=chromium\nTIMEOUT=30000`;

              unFilteredFiles.unshift({
                path: '.env',
                content: envContent
              });
            }

            const scriptFilesList = filterDeletedScriptFiles(unFilteredFiles, script.deletedFilePaths || []);

            const activeFileKey = activeScriptFile[script.id] || '__all__';
            const activeFileObj = activeFileKey !== '__all__' && activeFileKey !== '__changes__'
              ? (scriptFilesList.find(f => f.path === activeFileKey) ||
                 scriptFilesList.find(f => (f.path.split('/').pop() || f.path) === (activeFileKey.split('/').pop() || activeFileKey)) ||
                 (typeof activeFileKey === 'string' && !isNaN(Number(activeFileKey)) ? scriptFilesList[Number(activeFileKey)] : null) ||
                 scriptFilesList[0] ||
                 null)
              : null;

            return (
              <div
                key={script.id}
                className={`bg-white rounded-3xl border overflow-hidden shadow-xs space-y-0 transition-all ${
                  isDraft
                    ? 'border-amber-400/80 ring-2 ring-amber-400/20 shadow-md'
                    : isSelected ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-200/90'
                }`}
              >
                {/* Script Card Header (Matches Image 2 & 3) */}
                <div className={`p-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isDraft ? 'bg-amber-50/20 border-b border-amber-100' : 'bg-white'
                }`}>
                  {/* Left: Checkbox, Terminal icon, Script Title, Date, Tag Badge */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectScript(script.id);
                      }}
                      className="text-slate-400 hover:text-teal-600 cursor-pointer transition-colors p-1"
                      title={isSelected ? 'Deselect script' : 'Select script'}
                    >
                      {isSelected ? (
                        <CheckSquare size={18} className="text-teal-600" />
                      ) : (
                        <Square size={18} className="text-slate-300" />
                      )}
                    </button>
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-mono font-bold text-sm shrink-0 border ${
                      isDraft ? 'bg-amber-100/70 text-amber-800 border-amber-200' : 'bg-teal-50 text-teal-600 border-teal-100'
                    }`}>
                      &gt;_
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-sm font-black text-teal-700 uppercase tracking-tight">
                          {script.title}
                        </h3>
                        {isDraft && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                            Draft • Unsaved
                          </span>
                        )}
                        {script.isImported && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                            <Archive size={10} />
                            Imported
                          </span>
                        )}
                        {scriptFilesList.length > 1 && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                            <Layers size={10} />
                            POM Structure • {scriptFilesList.length} Files
                          </span>
                        )}
                        {script.refinedFilePaths && script.refinedFilePaths.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                            <Sparkles size={10} className="text-amber-600" />
                            Refined • {script.refinedFilePaths.length} Modified
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formattedDate}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 shrink-0">
                          <Code2 size={10} className="text-teal-600" />
                          {formatScriptLanguageAndFramework(script)}
                        </span>
                        <span
                          onClick={() => {
                            setSelectedRepositoryFolder(currentFolderName);
                          }}
                          className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-teal-700 border border-teal-300 bg-teal-50/50 flex items-center gap-1 cursor-pointer hover:bg-teal-100/60 transition-colors"
                          title={`Assigned concern folder: ${currentFolderName}. Click to filter.`}
                        >
                          <Folder size={10} />
                          {currentFolderName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Action Buttons Row (Save option, Approve, Append, Edit, Download, Code, Git, Copy, Delete) */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* MANUAL SAVE OPTION / SAVED STATUS BADGE */}
                    {isDraft ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenSaveModal(script)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-teal-600 hover:bg-teal-700 text-white shadow-sm flex items-center gap-1.5 cursor-pointer transition-all hover:scale-105 active:scale-95"
                          title={`Save this script to folder "${currentFolderName}"`}
                        >
                          <Save size={13} />
                          SAVE SCRIPT
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDiscardUnsaved(script.id)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-all cursor-pointer"
                          title="Discard this draft"
                        >
                          Discard
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenSaveModal(script)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 flex items-center gap-1.5 transition-colors cursor-pointer"
                        title={`Saved under folder "${currentFolderName}". Click to move or rename.`}
                      >
                        <CheckCircle2 size={12} className="text-emerald-600" />
                        <span>SAVED</span>
                        <span className="text-[10px] text-emerald-600 font-mono font-normal">({currentFolderName})</span>
                      </button>
                    )}

                    {/* Approve Toggle Button */}
                    <button
                      type="button"
                      onClick={() => handleToggleApprove(script)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 border ${
                        script.isApproved
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-2xs'
                          : 'bg-white hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border-slate-200'
                      }`}
                      title={script.isApproved ? 'Approved for Execution Hub' : 'Approve for Execution Hub'}
                    >
                      <CheckCircle2 size={13} className={script.isApproved ? 'text-emerald-600' : 'text-slate-400'} />
                      {script.isApproved ? 'APPROVED' : 'APPROVE'}
                    </button>

                    {/* Append Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenAppendModal(script)}
                      className="px-3 py-1.5 bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-700 border border-slate-200 hover:border-teal-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Append test cases and logic to this script suite"
                    >
                      <Plus size={12} className="text-teal-600" />
                      APPEND
                    </button>

                    {/* Edit Title Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingScript(script);
                        setEditTitleText(script.title);
                      }}
                      className="p-2 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl text-xs transition-all cursor-pointer"
                      title="Rename script"
                    >
                      <Edit3 size={14} />
                    </button>

                    {/* Download Button */}
                    <button
                      type="button"
                      onClick={() => handleDownloadScript(script)}
                      className="p-2 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl text-xs transition-all cursor-pointer"
                      title="Download script or POM project ZIP"
                    >
                      <Download size={14} />
                    </button>

                    {/* Push to GitHub Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedScriptForGithub(script)}
                      className="p-2 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl text-xs transition-all cursor-pointer"
                      title="Push to GitHub repository"
                    >
                      <GitBranch size={14} />
                    </button>

                    {/* Sync to Jira */}
                    <button
                      type="button"
                      onClick={() => setSelectedScriptForJira(script)}
                      className="p-2 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 border border-slate-200 rounded-xl text-xs transition-all cursor-pointer"
                      title="Sync status with Jira"
                    >
                      <Send size={14} />
                    </button>

                    {/* Copy Button (Dark Pill) */}
                    <button
                      type="button"
                      onClick={() => handleCopyScript(script)}
                      className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      title="Copy full script"
                    >
                      <Copy size={12} />
                      COPY
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => setDeleteScriptTarget(script)}
                      className="p-2 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 rounded-xl text-xs transition-all cursor-pointer"
                      title="Delete script"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* POM Structure File Navigation Bar */}
                {scriptFilesList.length > 1 && (
                  <div className="bg-[#111827] px-4 py-2.5 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mr-1">
                        <Folder size={12} className="text-teal-400" />
                        POM Structure:
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveScriptFile(prev => ({ ...prev, [script.id]: '__all__' }));
                        }}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                          activeFileKey === '__all__'
                            ? 'bg-teal-500 text-slate-950 font-bold shadow-xs'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        <Layers size={11} />
                        All Files ({scriptFilesList.length})
                      </button>

                      {/* Dedicated Refined Changes Tab */}
                      {script.lastRefinementSummary && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveScriptFile(prev => ({ ...prev, [script.id]: '__changes__' }));
                          }}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                            activeFileKey === '__changes__'
                              ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                              : 'bg-amber-950/60 text-amber-300 border border-amber-800/60 hover:bg-amber-900/60 hover:text-white'
                          }`}
                        >
                          <Sparkles size={11} className={activeFileKey === '__changes__' ? 'text-slate-950' : 'text-amber-400'} />
                          <span>Refined Changes</span>
                          {script.refinedFilePaths && script.refinedFilePaths.length > 0 && (
                            <span className="text-[9px] opacity-80 font-normal">({script.refinedFilePaths.length})</span>
                          )}
                        </button>
                      )}

                      {scriptFilesList.map((f, fIdx) => {
                        const isThisActive = activeFileKey !== '__all__' && activeFileKey !== '__changes__' && (activeFileKey === f.path || (activeFileObj && activeFileObj.path === f.path));
                        const fileName = f.path.split('/').pop() || f.path;
                        const isRefinedFile = script.refinedFilePaths && (
                          script.refinedFilePaths.includes(f.path) ||
                          script.refinedFilePaths.some(rp => typeof rp === 'string' && rp.toLowerCase().endsWith(fileName.toLowerCase()))
                        );

                        return (
                          <button
                            key={`file-tab-${f.path}-${fIdx}`}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveScriptFile(prev => ({ ...prev, [script.id]: f.path }));
                            }}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer flex items-center gap-1.5 ${
                              isThisActive
                                ? 'bg-teal-500 text-slate-950 font-bold shadow-xs ring-1 ring-teal-300'
                                : isRefinedFile
                                ? 'bg-amber-950/40 text-amber-200 border border-amber-700/60 hover:bg-amber-900/50'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            }`}
                            title={f.path}
                          >
                            <FileCode size={11} className={isThisActive ? 'text-slate-950' : isRefinedFile ? 'text-amber-400' : 'text-teal-400'} />
                            <span>{fileName}</span>
                            {isRefinedFile && (
                              <span className={`px-1 py-0.2 text-[8px] font-black uppercase rounded ${
                                isThisActive ? 'bg-slate-950 text-amber-300' : 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                              }`}>
                                Refined
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 ml-auto">
                      <span className="text-teal-400 font-bold">{formatScriptLanguageAndFramework(script)}</span>
                    </div>
                  </div>
                )}

                {/* Dark Code Container */}
                <div className="bg-[#0b0f19] text-slate-200 p-6 font-mono text-xs overflow-x-auto min-h-[300px] max-h-[560px] overflow-y-auto leading-relaxed select-text border-t border-slate-900">
                  {/* Refinement Notice Banner if summary exists and not on __changes__ view */}
                  {script.lastRefinementSummary && activeFileKey !== '__changes__' && (
                    <div className="mb-5 p-3.5 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-1 text-xs">
                      <div className="flex items-center justify-between gap-2 text-amber-300 font-mono font-bold">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Sparkles size={13} className="text-amber-400" />
                          <span>Refined Changes Applied</span>
                          {script.lastRefinedAt && (
                            <span className="text-[10px] text-amber-400/80 font-normal">({script.lastRefinedAt})</span>
                          )}
                          {script.refinedFilePaths && script.refinedFilePaths.length > 0 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 font-sans">
                              {script.refinedFilePaths.length} file{script.refinedFilePaths.length > 1 ? 's' : ''} modified in POM
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveScriptFile(prev => ({ ...prev, [script.id]: '__changes__' }))}
                          className="text-[11px] text-amber-300 hover:text-amber-100 underline flex items-center gap-1 cursor-pointer font-sans"
                        >
                          View Refined Changes Breakdown &rarr;
                        </button>
                      </div>
                      <p className="text-[11px] text-amber-200/90 font-sans line-clamp-2">
                        {script.lastRefinementSummary}
                      </p>
                    </div>
                  )}

                  {/* 1. Dedicated Refined Changes Breakdown View */}
                  {activeFileKey === '__changes__' ? (
                    <div className="space-y-5">
                      <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-amber-300 font-mono font-bold text-xs">
                            <Sparkles size={14} className="text-amber-400" />
                            <span>REFINED CHANGES BREAKDOWN</span>
                            {script.lastRefinedAt && (
                              <span className="text-[10px] text-amber-400/80 font-normal font-sans">({script.lastRefinedAt})</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveScriptFile(prev => ({ ...prev, [script.id]: '__all__' }))}
                            className="text-[10px] font-bold text-teal-400 hover:text-teal-300 bg-teal-950/60 px-2.5 py-1 rounded border border-teal-800/60 cursor-pointer flex items-center gap-1"
                          >
                            <Layers size={11} /> View All POM Files ({scriptFilesList.length})
                          </button>
                        </div>
                        <div className="text-xs text-amber-100/90 whitespace-pre-wrap font-sans leading-relaxed pt-1 bg-black/20 p-3 rounded-lg border border-amber-900/30">
                          {script.lastRefinementSummary || 'Refinement completed successfully.'}
                        </div>
                      </div>

                      {/* Display each refined file */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs text-slate-400 font-mono font-bold">
                          <span>Refined / Impacted POM Files ({(script.refinedFilePaths || []).length})</span>
                          <span className="text-[10px] text-slate-500 font-normal">All {scriptFilesList.length} files are retained in the POM structure</span>
                        </div>

                        {scriptFilesList
                          .filter(f => (script.refinedFilePaths || []).some(rp => rp === f.path || (typeof rp === 'string' && rp.toLowerCase().endsWith((f.path.split('/').pop() || f.path).toLowerCase()))))
                          .map((f, idx) => {
                            const lineCount = ((f?.content || '').match(/\n/g) || []).length + 1;
                            return (
                              <div key={`changes-file-${f.path}-${idx}`} className="border border-amber-500/50 rounded-xl overflow-hidden bg-[#0d1321] ring-1 ring-amber-500/20">
                                <div className="px-4 py-2 bg-[#1f192b] border-b border-amber-900/40 flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-2 text-amber-300 font-mono font-bold">
                                    <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                                      REFINED
                                    </span>
                                    <FileCode size={13} className="text-amber-400" />
                                    <span>{f.path}</span>
                                    <span className="text-[10px] text-slate-400 font-normal">({lineCount} lines)</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setActiveScriptFile(prev => ({ ...prev, [script.id]: f.path }))}
                                      className="text-[10px] font-bold text-teal-400 hover:text-teal-300 bg-teal-950/60 px-2.5 py-1 rounded border border-teal-800/60 cursor-pointer flex items-center gap-1"
                                    >
                                      Focus in POM
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const success = await deductExportCredits(
                                          project.id,
                                          'automation_script',
                                          user,
                                          `Copy ${f.path || 'File'}`,
                                          project.name
                                        );
                                        if (!success) return;
                                        navigator.clipboard.writeText(f.content || '');
                                        toast.success(`Copied ${f.path}`);
                                      }}
                                      className="text-[10px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded cursor-pointer flex items-center gap-1"
                                    >
                                      <Copy size={10} />
                                      Copy
                                    </button>
                                  </div>
                                </div>
                                <pre className="p-4 whitespace-pre-wrap font-mono text-slate-100 text-xs overflow-x-auto leading-relaxed select-text">
                                  {f.content || ''}
                                </pre>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ) : scriptFilesList.length > 1 && activeFileKey === '__all__' ? (
                    <div className="space-y-6">
                      {scriptFilesList.map((f, idx) => {
                        const lineCount = ((f?.content || '').match(/\n/g) || []).length + 1;
                        const isRefined = script.refinedFilePaths && (
                          script.refinedFilePaths.includes(f.path) ||
                          script.refinedFilePaths.some(rp => typeof rp === 'string' && rp.toLowerCase().endsWith((f.path.split('/').pop() || f.path).toLowerCase()))
                        );

                        return (
                          <div
                            key={`all-file-${f.path}-${idx}`}
                            className={`border rounded-xl overflow-hidden bg-[#0d1321] ${
                              isRefined
                                ? 'border-amber-500/60 ring-1 ring-amber-500/30'
                                : 'border-slate-800'
                            }`}
                          >
                            <div
                              className={`px-4 py-2 border-b flex items-center justify-between gap-2 text-xs ${
                                isRefined
                                  ? 'bg-[#1e1927] border-amber-900/40 text-amber-300'
                                  : 'bg-[#162035] border-slate-800 text-teal-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 font-mono font-bold">
                                <span className="text-slate-500 font-normal">#{idx + 1}</span>
                                <FileCode size={13} className={isRefined ? 'text-amber-400' : 'text-teal-400'} />
                                <span>{f.path}</span>
                                {isRefined && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                                    REFINED CHANGE
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 font-normal">({lineCount} lines)</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveScriptFile(prev => ({ ...prev, [script.id]: f.path }));
                                  }}
                                  className="text-[10px] font-bold text-teal-400 hover:text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/60 cursor-pointer transition-colors"
                                >
                                  Focus File
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const success = await deductExportCredits(
                                      project.id,
                                      'automation_script',
                                      user,
                                      `Copy ${f.path || 'File'}`,
                                      project.name
                                    );
                                    if (!success) return;
                                    navigator.clipboard.writeText(f.content || '');
                                    toast.success(`Copied ${f.path}`);
                                  }}
                                  className="text-[10px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 transition-colors"
                                >
                                  <Copy size={10} />
                                  Copy
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteScriptFile(script.id, f.path)}
                                  className="text-[10px] font-bold text-rose-400 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 transition-colors"
                                  title={`Delete ${f.path}`}
                                >
                                  <Trash2 size={10} />
                                  Delete
                                </button>
                              </div>
                            </div>
                            <pre className="p-4 whitespace-pre-wrap font-mono text-slate-100 text-xs overflow-x-auto leading-relaxed select-text">
                              {f.content || ''}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  ) : activeFileObj ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
                        <div className="flex items-center gap-2 font-mono font-bold">
                          <FileCode size={14} className={
                            script.refinedFilePaths && (
                              script.refinedFilePaths.includes(activeFileObj.path) ||
                              script.refinedFilePaths.some(rp => typeof rp === 'string' && rp.toLowerCase().endsWith((activeFileObj.path.split('/').pop() || activeFileObj.path).toLowerCase()))
                            ) ? 'text-amber-400' : 'text-teal-400'
                          } />
                          <span className={
                            script.refinedFilePaths && (
                              script.refinedFilePaths.includes(activeFileObj.path) ||
                              script.refinedFilePaths.some(rp => typeof rp === 'string' && rp.toLowerCase().endsWith((activeFileObj.path.split('/').pop() || activeFileObj.path).toLowerCase()))
                            ) ? 'text-amber-300' : 'text-teal-300'
                          }>{activeFileObj.path}</span>
                          {script.refinedFilePaths && (
                            script.refinedFilePaths.includes(activeFileObj.path) ||
                            script.refinedFilePaths.some(rp => typeof rp === 'string' && rp.toLowerCase().endsWith((activeFileObj.path.split('/').pop() || activeFileObj.path).toLowerCase()))
                          ) && (
                            <span className="px-1.5 py-0.5 text-[9px] font-black uppercase rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                              REFINED CHANGE
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({((activeFileObj?.content || '').match(/\n/g) || []).length + 1} lines)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {scriptFilesList.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setActiveScriptFile(prev => ({ ...prev, [script.id]: '__all__' }));
                              }}
                              className="text-[10px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded cursor-pointer flex items-center gap-1 transition-colors"
                            >
                              <Layers size={11} />
                              View All Files Together
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              const success = await deductExportCredits(
                                project.id,
                                'automation_script',
                                user,
                                `Copy ${activeFileObj?.path || 'File'}`,
                                project.name
                              );
                              if (!success) return;
                              navigator.clipboard.writeText(activeFileObj?.content || '');
                              toast.success(`Copied ${activeFileObj?.path}`);
                            }}
                            className="text-[10px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded cursor-pointer flex items-center gap-1 transition-colors"
                          >
                            <Copy size={11} />
                            Copy File
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteScriptFile(script.id, activeFileObj.path)}
                            className="text-[10px] font-bold text-rose-400 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 px-2.5 py-1 rounded cursor-pointer flex items-center gap-1 transition-colors"
                            title={`Delete ${activeFileObj.path}`}
                          >
                            <Trash2 size={11} />
                            Delete File
                          </button>
                        </div>
                      </div>
                      <pre className="whitespace-pre-wrap font-mono text-slate-100 text-xs overflow-x-auto leading-relaxed select-text">
                        {(() => {
                          let content = activeFileObj?.content || '';
                          if (!content || content.trim().length < 25 || content.trim() === '// No content' || content.trim() === '// Empty file') {
                            const matchingFlow = (project.recordedFlows || []).find(f => f.scriptId === script.id || f.id === script.flowId || f.name === script.flowName);
                            content = synthesizeMissingPOMFileContent(activeFileObj.path, {
                              tool: script.tool,
                              language: script.language,
                              framework: script.framework,
                              flowName: script.flowName || script.title,
                              steps: matchingFlow?.steps || [],
                              targetUrl: script.appUrl || matchingFlow?.initialUrl || (matchingFlow as any)?.targetUrl
                            });
                          }
                          return content;
                        })()}
                      </pre>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-slate-100">{script?.content || ''}</pre>
                  )}
                </div>

                {/* Refinement Section (Matches Image 3) */}
                <div className="p-5 bg-white border-t border-slate-100 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={13} className="text-teal-600" />
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                      REFINE POM PROJECT OR FOLDER STRUCTURE
                    </h4>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="relative flex-1 w-full">
                      <Sparkles size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={refinementPrompts[script.id] || ''}
                        onChange={(e) => setRefinementPrompts(prev => ({ ...prev, [script.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRefineScript(script.id);
                        }}
                        placeholder="e.g. 'Add a BasePage class' or 'Organize tests by functional module'"
                        className="w-full pl-9 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white transition-all font-medium"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRefineScript(script.id)}
                      disabled={refiningScriptId === script.id}
                      className="w-full sm:w-auto px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {refiningScriptId === script.id ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      {refiningScriptId === script.id ? 'REFINING...' : 'REFINE'}
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    YOUR JOB IS TO EXTEND OR REFINE THE USER'S AUTOMATION SUITE, NOT REPLACE IT.
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. EDIT TITLE MODAL                                                       */}
      {/* ========================================================================= */}
      {editingScript && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-black text-slate-900 uppercase">Rename Script</h3>
            <input
              type="text"
              value={editTitleText}
              onChange={(e) => setEditTitleText(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-teal-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingScript(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const updatedScripts = (project.automationScripts || []).map(s => 
                    s.id === editingScript.id ? { ...s, title: editTitleText.trim() || s.title } : s
                  );
                  onUpdateProject({ ...project, automationScripts: updatedScripts });
                  setEditingScript(null);
                  toast.success('Script renamed');
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DELETE CONFIRMATION MODALS                                               */}
      {/* ========================================================================= */}

      {/* 1. Delete Test Case Confirmation Modal */}
      {deleteCaseTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">Delete Test Case?</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-800 font-bold">"{deleteCaseTarget.title}"</strong>? This will remove it from the test case repository.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCaseTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCase}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Delete Folder Confirmation Modal */}
      {deleteFolderTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">Delete Folder?</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete folder <strong className="text-slate-800 font-bold">"{deleteFolderTarget.title}"</strong> and all its associated test cases?
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteFolderTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteFolder}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2b. Delete Script Folder Confirmation Modal */}
      {deleteScriptFolderTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">Delete Folder?</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete folder <strong className="text-slate-800 font-bold">"{deleteScriptFolderTarget.folderName}"</strong>
              {deleteScriptFolderTarget.scriptCount > 0
                ? ` and all its ${deleteScriptFolderTarget.scriptCount} script${deleteScriptFolderTarget.scriptCount > 1 ? 's' : ''}?`
                : '?'}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteScriptFolderTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteScriptFolder}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Delete Script Confirmation Modal */}
      {deleteScriptTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">Delete Script?</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to delete automation script <strong className="text-slate-800 font-bold">"{deleteScriptTarget.title}"</strong> from the repository?
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteScriptTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteScript}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                Delete Script
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Bulk Delete Scripts Confirmation Modal */}
      {showBulkDeleteScriptsConfirm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">Delete {selectedScriptIds.size} Scripts?</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-slate-800 font-bold">{selectedScriptIds.size}</strong> selected script{selectedScriptIds.size > 1 ? 's' : ''} from the repository?
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteScriptsConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDeleteScripts}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4b. Bulk Delete Cases Confirmation Modal */}
      {showBulkDeleteCasesConfirm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">Delete {selectedCaseIds.size} Test Cases?</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-slate-800 font-bold">{selectedCaseIds.size}</strong> selected test case{selectedCaseIds.size > 1 ? 's' : ''} from the repository?
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteCasesConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDeleteCases}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4c. Bulk Delete Folders Confirmation Modal */}
      {showBulkDeleteFoldersConfirm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-black text-slate-900">Delete {selectedFolderIds.size} Folders?</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure you want to permanently delete <strong className="text-slate-800 font-bold">{selectedFolderIds.size}</strong> selected folder{selectedFolderIds.size > 1 ? 's' : ''} and their contents?
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteFoldersConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDeleteFolders}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4d. APPEND TO SCRIPT MODAL (AI-POWERED POM SYNTHESIS)                     */}
      {/* ========================================================================= */}
      {appendModalScript && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center font-mono font-bold shadow-2xs">
                  <Plus size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    <span>Append to Automation Script</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 uppercase tracking-wider">
                      AI Generator
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Target Suite: <span className="font-bold text-slate-800">{appendModalScript.script.title}</span> ({formatScriptLanguageAndFramework(appendModalScript.script)} • {appendModalScript.script.files?.length || 1} files)
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={appendModalScript.isSubmitting}
                onClick={() => setAppendModalScript(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Informational Guidance */}
              <div className="bg-teal-50/70 border border-teal-200/80 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-teal-900">
                <Sparkles size={16} className="text-teal-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Intelligent POM Synthesis:</span> Select test cases to append. Gemini AI will synthesize new test specs, page classes, and data fixtures directly into this suite's Page Object Model architecture without overwriting existing code.
                </div>
              </div>

              {/* Test Cases Selection Area */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ListChecks size={14} className="text-teal-600" />
                    <span>Select Test Cases to Append</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {appendModalScript.selectedCaseIds.size} Selected
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={appendModalScript.isSubmitting || filteredModalCases.length === 0}
                      onClick={() => {
                        setAppendModalScript(prev => {
                          if (!prev) return null;
                          const next = new Set(prev.selectedCaseIds);
                          filteredModalCases.forEach(c => next.add(c.id));
                          return { ...prev, selectedCaseIds: next };
                        });
                      }}
                      className="text-[11px] font-bold text-teal-600 hover:text-teal-800 hover:underline cursor-pointer disabled:opacity-40"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      disabled={appendModalScript.isSubmitting || appendModalScript.selectedCaseIds.size === 0}
                      onClick={() => {
                        setAppendModalScript(prev => prev ? { ...prev, selectedCaseIds: new Set() } : null);
                      }}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    disabled={appendModalScript.isSubmitting}
                    value={appendModalScript.searchQuery}
                    onChange={(e) => {
                      const q = e.target.value;
                      setAppendModalScript(prev => prev ? { ...prev, searchQuery: q } : null);
                    }}
                    placeholder="Search test cases by ID or title..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white transition-colors"
                  />
                  {appendModalScript.searchQuery && (
                    <button
                      type="button"
                      onClick={() => setAppendModalScript(prev => prev ? { ...prev, searchQuery: '' } : null)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Scrollable list */}
                <div className="border border-slate-200 rounded-2xl max-h-52 overflow-y-auto p-2 bg-slate-50/50 space-y-1.5 divide-y divide-slate-100">
                  {filteredModalCases.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      No test cases found matching your search.
                    </div>
                  ) : (
                    filteredModalCases.map(item => {
                      const isChecked = appendModalScript.selectedCaseIds.has(item.id);
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (appendModalScript.isSubmitting) return;
                            setAppendModalScript(prev => {
                              if (!prev) return null;
                              const next = new Set(prev.selectedCaseIds);
                              if (next.has(item.id)) {
                                next.delete(item.id);
                              } else {
                                next.add(item.id);
                              }
                              return { ...prev, selectedCaseIds: next };
                            });
                          }}
                          className={`flex items-start gap-2.5 p-2 rounded-xl transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-teal-50/80 border border-teal-200/90 shadow-2xs'
                              : 'hover:bg-white border border-transparent'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0 text-teal-600">
                            {isChecked ? <CheckSquare size={16} /> : <Square size={16} className="text-slate-300" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono font-black text-teal-700 bg-teal-100/60 px-1.5 py-0.5 rounded">
                                {item.id}
                              </span>
                              {item.scenarioTitle && (
                                <span className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]">
                                  📁 {item.scenarioTitle}
                                </span>
                              )}
                              {item.isAlreadyInScript && (
                                <span className="text-[9px] font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.2 rounded-full">
                                  Already in suite
                                </span>
                              )}
                              {item.priority && (
                                <span className="text-[9px] font-semibold text-slate-600 bg-slate-200/60 px-1.5 py-0.2 rounded-full">
                                  {item.priority}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-semibold text-slate-800 mt-0.5 leading-snug">
                              {item.title}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Instructions / Context Field */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Additional Instructions / Requirements (Optional)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Context for AI</span>
                </label>
                <textarea
                  rows={2}
                  disabled={appendModalScript.isSubmitting}
                  value={appendModalScript.instruction}
                  onChange={(e) => {
                    const text = e.target.value;
                    setAppendModalScript(prev => prev ? { ...prev, instruction: text } : null);
                  }}
                  placeholder="e.g., Generate assertions for flight price breakdown, extend testData.json fixture, add negative flight search validation..."
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-teal-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Submitting Status / Progress */}
              {appendModalScript.isSubmitting && (
                <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-2xl flex items-center gap-3 animate-pulse">
                  <RefreshCw size={16} className="text-teal-600 animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-teal-900">
                      {appendModalScript.statusMessage || 'Synthesizing script with Gemini AI...'}
                    </p>
                    <p className="text-[11px] text-teal-700 mt-0.5">
                      Parsing POM architecture, updating page locators, and generating new test specs...
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Sparkles size={13} className="text-teal-600" />
                <span>Consumes 50 automation credits upon generation</span>
              </div>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={appendModalScript.isSubmitting}
                  onClick={() => setAppendModalScript(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    appendModalScript.isSubmitting ||
                    (appendModalScript.selectedCaseIds.size === 0 && !appendModalScript.instruction.trim())
                  }
                  onClick={handleExecuteAppend}
                  className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-teal-600 hover:bg-teal-700 text-white shadow-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:scale-102 active:scale-98"
                >
                  {appendModalScript.isSubmitting ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>GENERATING SCRIPT...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      <span>GENERATE & APPEND SCRIPT</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MANUAL SAVE SCRIPT MODAL                                               */}
      {/* ========================================================================= */}
      {saveModalScript && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center font-mono font-bold">
                  <Save size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                    Save Automation Script
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Choose the folder to organize and store this script
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSaveModalScript(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Script Title Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                Script Title
              </label>
              <input
                type="text"
                value={saveModalScript.title}
                onChange={(e) => setSaveModalScript({ ...saveModalScript, title: e.target.value })}
                placeholder="e.g. Login Authentication POM Suite"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
              />
            </div>

            {/* Target Folder Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                Destination Folder
              </label>

              <div className="space-y-2">
                {/* 1. Existing Folder (Default) */}
                <div
                  onClick={() => setSaveModalScript({ ...saveModalScript, folderMode: 'existing' })}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                    saveModalScript.folderMode === 'existing'
                      ? 'bg-teal-50/50 border-teal-500 ring-2 ring-teal-500/20 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="folderMode"
                      checked={saveModalScript.folderMode === 'existing'}
                      onChange={() => setSaveModalScript({ ...saveModalScript, folderMode: 'existing' })}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Folder size={14} className="text-teal-600" />
                        <span className="text-xs font-black text-slate-900 uppercase">
                          Choose Existing Folder
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Save this script into an existing folder in your project.
                      </p>
                    </div>
                  </div>

                  {saveModalScript.folderMode === 'existing' && (
                    <div className="pl-6 pt-1">
                      <select
                        value={saveModalScript.selectedFolderName}
                        onChange={(e) => {
                          const name = e.target.value;
                          setSaveModalScript({
                            ...saveModalScript,
                            selectedFolderName: name,
                            selectedFolderId: name
                          });
                        }}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-teal-500"
                      >
                        {repositoryFolders
                          .filter(folder => saveModalScript.script.isImported ? folder.isImported : !folder.isImported)
                          .map(folder => (
                            <option key={folder.id || folder.name} value={folder.name}>
                              📁 {folder.name}
                            </option>
                          ))}
                        {saveModalScript.selectedFolderName && !repositoryFolders.some(f => f.name.toLowerCase() === saveModalScript.selectedFolderName.toLowerCase()) && (
                          <option value={saveModalScript.selectedFolderName}>
                            📁 {saveModalScript.selectedFolderName}
                          </option>
                        )}
                      </select>
                    </div>
                  )}
                </div>

                {/* 3. Create New Folder */}
                <div
                  onClick={() => setSaveModalScript({ ...saveModalScript, folderMode: 'new' })}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                    saveModalScript.folderMode === 'new'
                      ? 'bg-teal-50/50 border-teal-500 ring-2 ring-teal-500/20 shadow-2xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="folderMode"
                      checked={saveModalScript.folderMode === 'new'}
                      onChange={() => setSaveModalScript({ ...saveModalScript, folderMode: 'new' })}
                      className="mt-0.5 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderPlus size={14} className="text-slate-600" />
                        <span className="text-xs font-black text-slate-900 uppercase">
                          Create New Folder
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Specify a new folder name to organize your scripts.
                      </p>
                    </div>
                  </div>

                  {saveModalScript.folderMode === 'new' && (
                    <div className="pl-6 pt-1">
                      <input
                        type="text"
                        value={saveModalScript.newFolderName}
                        onChange={(e) => setSaveModalScript({ ...saveModalScript, newFolderName: e.target.value })}
                        placeholder="Enter new folder name (e.g. Payment Gateway Tests)"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-teal-500"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Script Metadata Preview */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs text-slate-600 font-mono">
              <span>Stack: <strong className="text-slate-800 font-bold">{formatScriptLanguageAndFramework(saveModalScript.script)}</strong></span>
              <span>Files: <strong className="text-slate-800 font-bold">{saveModalScript.script.files?.length || 1}</strong></span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSaveModalScript(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveScript}
                className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm cursor-pointer transition-all hover:scale-105 active:scale-95"
              >
                <Save size={14} />
                Save to Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5b. POM SCRIPT GENERATION POPUP MODAL                                     */}
      {/* ========================================================================= */}
      {pomPopupMessage && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                  pomPopupMessage.type === 'warning' 
                    ? 'bg-amber-50 text-amber-600 border border-amber-200' 
                    : 'bg-teal-50 text-teal-600 border border-teal-200'
                }`}>
                  {pomPopupMessage.type === 'warning' ? <AlertCircle size={22} /> : <Code2 size={22} />}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">
                    {pomPopupMessage.title}
                  </h3>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                    pomPopupMessage.type === 'warning'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-teal-100 text-teal-800'
                  }`}>
                    {pomPopupMessage.type === 'warning' ? 'Action Required' : 'POM Architecture'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPomPopupMessage(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-medium bg-slate-50 p-4 rounded-2xl border border-slate-100">
              {pomPopupMessage.description}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setPomPopupMessage(null)}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm ${
                  pomPopupMessage.type === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
              >
                {pomPopupMessage.type === 'warning' ? 'Got It' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. GITHUB PUSH MODAL & JIRA MODAL                                         */}
      {/* ========================================================================= */}
      <GithubPushModal
        isOpen={!!selectedScriptForGithub}
        onClose={() => setSelectedScriptForGithub(null)}
        project={project}
        script={selectedScriptForGithub}
      />

      <JiraSyncModal
        isOpen={!!selectedScriptForJira}
        onClose={() => setSelectedScriptForJira(null)}
        project={project}
        script={selectedScriptForJira}
      />
    </div>
  );
};

export default ScriptGenerator;
