import React, { useRef, useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Project, TestStatus, TestType, TestIntent, TestPriority, TestCase, ApiTestSuite, User, isApiTestingScenario } from '../types';
import { getScenarioMetrics } from '../services/projectService';
import { 
  getFunctionalExecutionFolderSummaries, 
  getFunctionalExecutionCases,
  getFunctionalExecutionStats,
  getScriptExecutionScripts,
  getScriptExecutionStats,
  normalizeScriptStatus,
  getApiSuiteSummaries,
  getApiExecutionStats,
  getPerformanceExecutionItems,
  getPerformanceExecutionStats
} from '../services/executionStatsService';
import { 
  FileText, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Terminal, 
  Database, 
  Layers, 
  Printer, 
  BarChart, 
  Activity, 
  Zap, 
  Network,
  Calendar,
  TrendingUp,
  FileSpreadsheet,
  X,
  ChevronDown,
  ShieldCheck,
  Target,
  ArrowUpRight,
  Server,
  Users,
  Trophy,
  History,
  Code,
  AlertTriangle,
  BookOpen
} from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  Label
} from 'recharts';
import ReactMarkdown from 'react-markdown';
import { AutomatiqaLogo, AutomatiqaInfinityIcon } from './AutomatiqaLogo';

interface ReportsProps {
  projects: Project[];
  activeProject?: Project;
  user?: User;
}

type ExecutionType = 
  | 'Manual Test Case Execution' 
  | 'Automation Test Script Execution' 
  | 'API Testing Execution' 
  | 'Manual Performance Testing Execution'
  | 'AI User Story Repository';

const Reports: React.FC<ReportsProps> = ({ projects, activeProject, user }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportType, setExportType] = useState<ExecutionType>('Manual Test Case Execution');
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const currentProject = useMemo(() => activeProject || projects[0], [activeProject, projects]);
  const currentUserId = user?.email || currentProject?.ownerEmail || 'N/A';

  const sanitizeAndCloneForPDF = (sourceEl: HTMLElement): { tempContainer: HTMLElement; clone: HTMLElement } => {
    // 1. Setup canvas context to convert any modern CSS colors (oklch, color-mix, lab, etc.) to standard rgb/rgba
    let canvasCtx: CanvasRenderingContext2D | null = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      canvasCtx = canvas.getContext('2d', { willReadFrequently: true });
    } catch (e) {
      // fallback
    }

    const convertColorToRgb = (colorStr: string): string => {
      if (!colorStr) return colorStr;
      if (!canvasCtx) return '#0f172a';
      try {
        canvasCtx.clearRect(0, 0, 1, 1);
        canvasCtx.fillStyle = '#0f172a';
        canvasCtx.fillStyle = colorStr;
        canvasCtx.fillRect(0, 0, 1, 1);
        const data = canvasCtx.getImageData(0, 0, 1, 1).data;
        const a = data[3] / 255;
        if (a >= 0.99) {
          return `rgb(${data[0]}, ${data[1]}, ${data[2]})`;
        } else {
          return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${a.toFixed(3)})`;
        }
      } catch (e) {
        return '#0f172a';
      }
    };

    const replaceModernCssColors = (str: string): string => {
      if (!str || typeof str !== 'string') return str;
      if (!/(?:oklch|oklab|lab|lch|color-mix|light-dark|color)\s*\(/i.test(str)) {
        return str;
      }

      let result = str;
      let safetyCounter = 0;

      while (safetyCounter < 50) {
        const startMatch = /(?:oklch|oklab|lab|lch|color-mix|light-dark|color)\s*\(/i.exec(result);
        if (!startMatch) break;

        const startIndex = startMatch.index;
        let depth = 0;
        let endIndex = -1;

        for (let i = startIndex; i < result.length; i++) {
          if (result[i] === '(') depth++;
          else if (result[i] === ')') {
            depth--;
            if (depth === 0) {
              endIndex = i;
              break;
            }
          }
        }

        if (endIndex !== -1) {
          const fullFuncCall = result.substring(startIndex, endIndex + 1);
          const converted = convertColorToRgb(fullFuncCall);
          result = result.substring(0, startIndex) + converted + result.substring(endIndex + 1);
        } else {
          break;
        }
        safetyCounter++;
      }

      return result;
    };

    // 2. Clone the element and compute explicit inline styles for every element in the tree
    const origElements = [sourceEl, ...Array.from(sourceEl.querySelectorAll('*'))] as HTMLElement[];
    const clone = sourceEl.cloneNode(true) as HTMLElement;
    const cloneElements = [clone, ...Array.from(clone.querySelectorAll('*'))] as HTMLElement[];

    const propsToCopy = [
      'display', 'flexDirection', 'flexWrap', 'alignItems', 'justifyContent', 'justifyItems', 'alignSelf',
      'gap', 'flex', 'flexGrow', 'flexShrink', 'gridTemplateColumns', 'gridTemplateRows',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'boxSizing', 'overflow',
      'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'textAlign', 'textTransform', 'letterSpacing', 'whiteSpace', 'wordBreak',
      'color', 'backgroundColor', 'borderColor', 'borderWidth', 'borderStyle', 'borderRadius', 'boxShadow',
      'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
      'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
      'fill', 'stroke', 'strokeWidth', 'opacity', 'visibility', 'borderCollapse', 'borderSpacing', 'verticalAlign'
    ];

    for (let i = 0; i < origElements.length && i < cloneElements.length; i++) {
      const orig = origElements[i];
      const cloned = cloneElements[i];
      if (orig && cloned && orig.nodeType === 1) {
        const tagName = orig.tagName.toLowerCase();
        try {
          const computed = window.getComputedStyle(orig);
          propsToCopy.forEach((prop) => {
            // @ts-ignore
            let val = computed[prop];
            if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== 'rgba(0, 0, 0, 0)' && val !== 'transparent') {
              val = replaceModernCssColors(val);
              // @ts-ignore
              cloned.style[prop] = val;
            } else if (prop === 'display' || prop === 'flexDirection' || prop === 'color' || prop === 'backgroundColor' || prop === 'boxSizing') {
              val = replaceModernCssColors(val);
              // @ts-ignore
              cloned.style[prop] = val;
            }
          });

          // Explicit width and height for images, SVGs, or Canvas only
          if (tagName === 'img' || tagName === 'svg' || tagName === 'canvas') {
            cloned.style.width = computed.width;
            cloned.style.height = computed.height;
          }

          // Handle SVG currentColor resolution
          if (tagName === 'svg' || (orig as any).ownerSVGElement) {
            const strokeVal = orig.getAttribute('stroke') || computed.stroke;
            const fillVal = orig.getAttribute('fill') || computed.fill;
            const colorVal = computed.color;
            if (strokeVal === 'currentColor') {
              cloned.setAttribute('stroke', replaceModernCssColors(colorVal));
              cloned.style.stroke = replaceModernCssColors(colorVal);
            }
            if (fillVal === 'currentColor') {
              cloned.setAttribute('fill', replaceModernCssColors(colorVal));
              cloned.style.fill = replaceModernCssColors(colorVal);
            }
          }
        } catch (e) {
          // ignore
        }

        // Sanitize inline style attributes and SVG attributes
        if (cloned.style) {
          try {
            for (let j = cloned.style.length - 1; j >= 0; j--) {
              const p = cloned.style[j];
              if (p && p.startsWith('--')) {
                cloned.style.removeProperty(p);
              }
            }
          } catch (e) {}
        }
      }
    }

    // 3. Create isolated container on document.body for rendering (placed offscreen to prevent UI flashing)
    const tempContainer = document.createElement('div');
    tempContainer.id = 'pdf-standalone-render-container';
    tempContainer.style.position = 'fixed';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.style.zIndex = '-9999';
    tempContainer.style.width = '760px';
    tempContainer.style.backgroundColor = '#ffffff';
    tempContainer.style.margin = '0';
    tempContainer.style.padding = '0';
    tempContainer.style.pointerEvents = 'none';
    tempContainer.style.overflow = 'hidden';

    clone.style.margin = '0 auto';
    clone.style.padding = '20px';
    clone.style.width = '760px';
    clone.style.maxWidth = '760px';
    clone.style.minWidth = '760px';
    clone.style.boxSizing = 'border-box';
    clone.style.backgroundColor = '#ffffff';
    clone.style.color = '#0f172a';
    clone.style.borderRadius = '0px';
    clone.style.border = 'none';
    clone.style.boxShadow = 'none';

    tempContainer.appendChild(clone);
    document.body.appendChild(tempContainer);

    return { tempContainer, clone };
  };

  const handleDownloadPDF = async () => {
    if (isGeneratingPDF) return;
    if (!reportRef.current) {
      toast.error('Report content container not found in DOM.');
      return;
    }
    setIsGeneratingPDF(true);
    const element = reportRef.current;
    const toastId = toast.loading('Compiling report and generating PDF...');

    let tempContainer: HTMLElement | null = null;

    try {
      // 1. Prepare self-contained clone with inline styles
      const prepared = sanitizeAndCloneForPDF(element);
      tempContainer = prepared.tempContainer;
      const clone = prepared.clone;

      // 2. Ensure html2pdf is available
      // @ts-ignore
      let html2pdfLib = typeof window !== 'undefined' ? window.html2pdf : null;
      if (!html2pdfLib) {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        // @ts-ignore
        html2pdfLib = window.html2pdf;
      }

      if (!html2pdfLib) {
        throw new Error('PDF generator library is unavailable.');
      }

      const opt = {
        margin: [6, 6, 6, 6],
        filename: `AutomatiQA_Full_Report_${(currentProject?.name || 'Project').replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false, 
          letterRendering: true,
          scrollX: 0,
          scrollY: 0,
          x: 0,
          y: 0,
          windowWidth: 760,
          width: 760
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.avoid-break'] }
      };

      await html2pdfLib().from(clone).set(opt).save();
      toast.success('Full report PDF generated and downloaded successfully!', { id: toastId });
    } catch (error: any) {
      console.error('PDF generation error:', error);
      toast.dismiss(toastId);
      toast.error('Failed to compile PDF report. You can export data in Excel or CSV format instead.');
    } finally {
      // Clean up temporary container
      if (tempContainer && tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }
      setIsGeneratingPDF(false);
    }
  };

  const availableReports = useMemo(() => {
    if (!currentProject) return [];

    switch (exportType) {
      case 'Manual Test Case Execution':
        return getFunctionalExecutionFolderSummaries(currentProject).map(s => ({ id: s.id, name: s.name }));

      case 'Automation Test Script Execution':
        return getScriptExecutionScripts(currentProject).map(s => ({ 
          id: s.id, 
          name: s.title || `${s.tool} - ${s.testCaseTitles?.[0] || 'Untitled'} (${s.language})` 
        }));

      case 'API Testing Execution':
        return getApiSuiteSummaries(currentProject).map(s => ({ 
          id: s.id, 
          name: s.name 
        }));

      case 'Manual Performance Testing Execution':
        const importedIds = new Set(currentProject.importedPerformanceArtifactIds || []);
        return (currentProject.performanceScripts || [])
          .filter(s => importedIds.has(s.id))
          .map(s => ({ 
            id: s.id, 
            name: s.name 
          }));

      case 'AI User Story Repository':
        const userStoryFolders = (currentProject.userStories || [])
          .filter(s => s.storyId === 'USERSTORY_FOLDER')
          .map(s => ({
            id: s.id,
            name: s.parentFolderId ? `Subfolder: ${s.summary}` : `Folder: ${s.summary}`
          }));
        return [
          { id: 'all_user_stories', name: 'All User Stories (Complete Repository)' },
          ...userStoryFolders
        ];

      default:
        return [];
    }
  }, [currentProject, exportType]);

  const handleExcelExport = async () => {
    if (selectedReportIds.length === 0 || !currentProject) {
      toast.error("Please provide input before proceeding");
      return;
    }

    let allData: any[] = [];
    const selectedReports = availableReports.filter(r => selectedReportIds.includes(r.id));
    const targetNames = selectedReports.map(r => r.name).join(', ');
    const safeContext = exportType.replace(/[^a-zA-Z0-9]/g, '_');
    const safeTarget = selectedReportIds.length > 1 ? 'Multiple_Modules' : selectedReports[0].name.replace(/[^a-zA-Z0-9]/g, '_');
    
    for (const reportId of selectedReportIds) {
      let moduleData: any[] = [];
      switch (exportType) {
        case 'Manual Test Case Execution': {
          const allExecCases = getFunctionalExecutionCases(currentProject);
          const folderObj = currentProject.scenarios.find(s => s.id === reportId);
          const memberIds = new Set(folderObj?.memberScenarioIds || []);
          const folderCases = allExecCases.filter(c => c.scenarioId === reportId || memberIds.has(c.scenarioId || ''));
          const casesToExport = folderCases.length > 0 ? folderCases : allExecCases;
          moduleData = casesToExport.map(tc => ({
            'User ID': currentUserId,
            'Test Case ID': tc.testCaseId || 'N/A',
            'User Story ID': tc.userStoryId || folderObj?.userStoryId || folderObj?.userStoryNumber || 'N/A',
            'Scenario/Folder': folderObj?.title || 'Execution Suite',
            'Title': tc.title,
            'Steps': (tc.steps || []).join('\n'),
            'Expected Result': tc.expectedResult,
            'Status': tc.status,
            'Comments': tc.comments || '',
            'Executed At': tc.executedAt ? new Date(tc.executedAt).toLocaleString('en-GB') : 'NOT EXECUTED'
          }));
          break;
        }

        case 'Automation Test Script Execution': {
          const script = getScriptExecutionScripts(currentProject).find(s => s.id === reportId);
          if (script) {
            moduleData = [{
              'User ID': currentUserId,
              'Script ID': script.id,
              'Title': script.title || script.testCaseTitles?.[0] || 'Automation Script',
              'Tool': script.tool,
              'Language': script.language,
              'Status': normalizeScriptStatus(script.lastExecutionStatus),
              'Executed At': script.lastExecutedAt ? new Date(script.lastExecutedAt).toLocaleString('en-GB') : 'N/A'
            }];
          }
          break;
        }

        case 'API Testing Execution':
          const suite = currentProject.apiTestSuites?.find(s => s.id === reportId);
          if (suite) {
            const scenariosInSuite: any[] = [];
            currentProject.apiWorkspaces?.forEach(ws => {
              ws.collections.forEach(col => {
                col.folders?.forEach(fold => {
                  if (fold.id === suite.targetFolderId) {
                    scenariosInSuite.push(...fold.requests);
                  }
                });
              });
            });

            if (scenariosInSuite.length > 0) {
              moduleData = scenariosInSuite.map((req, idx) => {
                const result = suite.scenarioResults?.[req.id] || { status: 'Not Started' };
                return {
                  'User ID': currentUserId,
                  'Suite Name': suite.name,
                  'Target Collection': suite.targetFolderName,
                  'Scenario No': idx + 1,
                  'Method': req.method,
                  'Scenario Title': req.name || 'Untitled',
                  'URL': req.url,
                  'Execution Status': result.status,
                  'Evidence Comments': result.evidence?.comment || 'No comments',
                  'Evidence Links': (result.evidence?.links || []).join(', ') || 'No links'
                };
              });
            } else {
              moduleData = [{
                'User ID': currentUserId,
                'Suite Name': suite.name,
                'Target Collection': suite.targetFolderName,
                'Total Status': suite.status,
                'Last Run': suite.lastRun || 'N/A',
                'Message': 'No individual scenario data captured in this archive'
              }];
            }
          }
          break;

        case 'Manual Performance Testing Execution': {
          const perfItems = getPerformanceExecutionItems(currentProject).filter(item => item.id === reportId);
          moduleData = perfItems.map(item => ({
            'User ID': currentUserId,
            'Artifact Name': item.artifactName,
            'Item Name': item.itemName,
            'Type': item.itemType,
            'Detail': item.detail,
            'Status': item.status || 'NOT EXECUTED',
            'Generated On': item.generatedOn ? new Date(item.generatedOn).toLocaleString('en-GB') : 'N/A'
          }));
          break;
        }

        case 'AI User Story Repository':
          const allStories = (currentProject.userStories || []).filter(s => 
            s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE'
          );
          const folderMap = new Map((currentProject.userStories || []).map(s => [s.id, s.summary]));

          if (reportId === 'all_user_stories') {
            moduleData = allStories.map(s => {
              let folderName = 'Individual / Unassigned';
              if (s.folderId && folderMap.has(s.folderId)) {
                const parentId = (currentProject.userStories || []).find(f => f.id === s.folderId)?.parentFolderId;
                if (parentId && folderMap.has(parentId)) {
                  folderName = `${folderMap.get(parentId)} / ${folderMap.get(s.folderId)}`;
                } else {
                  folderName = folderMap.get(s.folderId)!;
                }
              }
              return {
                'User ID': currentUserId,
                'User Story ID': s.storyId || s.id,
                'Summary': s.summary,
                'Folder/Subfolder': folderName,
                'Description': s.description,
                'Acceptance Criteria': s.acceptanceCriteria,
                'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString('en-GB') : 'N/A'
              };
            });
          } else {
            const folderItem = (currentProject.userStories || []).find(s => s.id === reportId);
            if (folderItem) {
              const folderStories = allStories.filter(s => 
                (folderItem.memberStoryIds || []).includes(s.id) || s.folderId === folderItem.id
              );
              moduleData = folderStories.map(s => ({
                'User ID': currentUserId,
                'Folder Name': folderItem.summary,
                'User Story ID': s.storyId || s.id,
                'Summary': s.summary,
                'Description': s.description,
                'Acceptance Criteria': s.acceptanceCriteria,
                'Created At': s.createdAt ? new Date(s.createdAt).toLocaleString('en-GB') : 'N/A'
              }));
            }
          }
          break;
      }
      allData.push(...moduleData);
    }

    const data = allData;
    const targetName = targetNames;
    let fileName = `${safeContext}_${safeTarget}`;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
    const timestamp = `${dateStr}_${timeStr}`;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Execution Report");

    // Generate Logo using Canvas (Stacked format matching brand identity)
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 400, 120);
      
      // Draw AutomatiQA Infinity Brand Icon at top center
      ctx.save();
      ctx.translate(160, 10);
      const grad = ctx.createLinearGradient(0, 16, 80, 16);
      grad.addColorStop(0, '#005BEA');
      grad.addColorStop(0.5, '#00B4D8');
      grad.addColorStop(1, '#00E676');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      // Infinity loop path
      ctx.moveTo(40, 16);
      ctx.bezierCurveTo(48, 6, 58, 0, 68, 0);
      ctx.bezierCurveTo(80, 0, 88, 8, 88, 16);
      ctx.bezierCurveTo(88, 24, 80, 32, 68, 32);
      ctx.bezierCurveTo(58, 32, 48, 24, 40, 16);
      ctx.bezierCurveTo(32, 8, 22, 0, 12, 0);
      ctx.bezierCurveTo(0, 0, -8, 8, -8, 16);
      ctx.bezierCurveTo(-8, 24, 0, 32, 12, 32);
      ctx.bezierCurveTo(22, 32, 32, 24, 40, 16);
      ctx.stroke();
      ctx.restore();
      
      // AutomatiQA text in middle
      ctx.font = '900 24px Arial, sans-serif';
      const automatiW = ctx.measureText('Automati').width;
      const qaW = ctx.measureText('QA').width;
      const totalW = automatiW + qaW;
      const startX = (400 - totalW) / 2;
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Automati', startX, 76);
      
      const qaGrad = ctx.createLinearGradient(startX + automatiW, 0, startX + totalW, 0);
      qaGrad.addColorStop(0, '#00B4D8');
      qaGrad.addColorStop(0.5, '#00C9A7');
      qaGrad.addColorStop(1, '#00E676');
      ctx.fillStyle = qaGrad;
      ctx.fillText('QA', startX + automatiW, 76);

      // Tagline: FASTER • SMARTER • RELIABLE
      ctx.textAlign = 'center';
      ctx.font = '700 8px Arial, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('FASTER   •   SMARTER   •   RELIABLE', 200, 96);
    }
    const base64Image = canvas.toDataURL('image/png');
    const imageId = workbook.addImage({
      base64: base64Image,
      extension: 'png',
    });

    // Add empty rows for header
    worksheet.addRow([]); // Row 1: Logo
    worksheet.addRow([`Project Name: ${currentProject.name}`]); // Row 2
    worksheet.addRow([`Execution Type: ${exportType}`]); // Row 3
    worksheet.addRow([`Execution Module: ${targetName}`]); // Row 4
    worksheet.addRow([`Report Generated: ${dateStr} ${timeStr.replace(/-/g, ':')}`]); // Row 5
    worksheet.addRow([]); // Row 6: Empty space

    // Merge cells for logo and set background
    worksheet.mergeCells('A1:H1');
    const logoCell = worksheet.getCell('A1');
    logoCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' }
    };

    // Add image to worksheet
    worksheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 200, height: 60 }
    });
    
    // Set row height for the logo row
    worksheet.getRow(1).height = 50;

    // Add data headers
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);
      
      // Add data rows
      data.forEach(item => {
        const row: any[] = [];
        headers.forEach(header => {
          row.push(item[header]);
        });
        worksheet.addRow(row);
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const displayTime = timeStr.replace(/-/g, ':');
    saveAs(blob, `${currentProject.name} - ${dateStr} ${displayTime}.xlsx`);
    setIsExportModalOpen(false);
  };

  const manualExecSummary = useMemo(() => {
    if (!currentProject) return [];
    return getFunctionalExecutionFolderSummaries(currentProject);
  }, [currentProject]);

  const scriptExecSummary = useMemo(() => {
    if (!currentProject) return [];
    return getScriptExecutionScripts(currentProject);
  }, [currentProject]);

  const apiExecSummary = useMemo(() => {
    if (!currentProject) return [];
    return getApiSuiteSummaries(currentProject);
  }, [currentProject]);

  const perfExecItems = useMemo(() => {
    if (!currentProject) return [];
    return getPerformanceExecutionItems(currentProject);
  }, [currentProject]);

  const executionStats = useMemo(() => {
    if (!currentProject) return {
      functional: { total: 0, notStarted: 0, pass: 0, fail: 0, blocked: 0, passRate: 0 },
      script: { total: 0, notStarted: 0, pass: 0, fail: 0, blocked: 0, passRate: 0 },
      api: { total: 0, notStarted: 0, pass: 0, fail: 0, blocked: 0, passRate: 0 },
      performance: { total: 0, notStarted: 0, pass: 0, fail: 0, blocked: 0, passRate: 0 },
    };
    return {
      functional: getFunctionalExecutionStats(currentProject),
      script: getScriptExecutionStats(currentProject),
      api: getApiExecutionStats(currentProject),
      performance: getPerformanceExecutionStats(currentProject),
    };
  }, [currentProject]);

  const perfExecSummary = useMemo(() => {
    const importedIds = new Set(currentProject?.importedPerformanceArtifactIds || []);
    return (currentProject?.performanceScripts || []).filter(s => importedIds.has(s.id));
  }, [currentProject]);

  /**
   * Helper to dynamically calculate API Suite status based on scenario progress
   */
  const calculateApiSuiteStatus = (suite: ApiTestSuite) => {
    // 1. Find all request IDs belonging to this suite's target folder
    const scenarioIds: string[] = [];
    currentProject.apiWorkspaces?.forEach(ws => {
      ws.collections.forEach(col => {
        col.folders?.forEach(fold => {
          if (fold.id === suite.targetFolderId) {
            scenarioIds.push(...fold.requests.map(r => r.id));
          }
        });
      });
    });

    if (scenarioIds.length === 0) return 'Not Started';

    const results = suite.scenarioResults || {};
    const startedCount = scenarioIds.filter(id => {
      const status = results[id]?.status;
      return status && status !== 'Not Started';
    }).length;

    if (startedCount === 0) return 'Not Started';
    if (startedCount === scenarioIds.length) return 'Completed';
    return 'In Progress';
  };

  const handleDownloadPerformancePDF = async () => {
    if (selectedReportIds.length === 0) {
      toast.error('Please select an Execution Module before generating the PDF report.');
      return;
    }
    if (!currentProject) {
      toast.error('Project context is not available.');
      return;
    }
    const artifact = currentProject.performanceScripts?.find(s => s.id === selectedReportIds[0]);
    if (!artifact) {
      toast.error('Selected execution module not found in archives.');
      return;
    }

    const element = document.getElementById('performance-pdf-content');
    if (!element) {
      toast.error('PDF content container element not found in the DOM.');
      return;
    }

    setIsGeneratingPDF(true);
    const toastId = toast.loading('Initializing PDF generation...');

    let tempContainer: HTMLElement | null = null;

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('PDF generation timed out (30 seconds limit reached). Please check your data and try again.')), 30000)
    );

    try {
      // 1. Prepare self-contained clone with inline styles
      const prepared = sanitizeAndCloneForPDF(element);
      tempContainer = prepared.tempContainer;
      const clone = prepared.clone;

      // @ts-ignore
      let html2pdfLib = typeof window !== 'undefined' ? window.html2pdf : null;
      if (!html2pdfLib) {
        throw new Error('PDF generator library (html2pdf) is not loaded in the browser context.');
      }

      const opt = {
        margin: [6, 6, 6, 6],
        filename: `Performance_Report_${artifact.name.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          logging: false, 
          letterRendering: true,
          scrollX: 0,
          scrollY: 0,
          x: 0,
          y: 0,
          windowWidth: 760,
          width: 760
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.avoid-break'] }
      };

      toast.loading('Compiling layout and rendering chart elements...', { id: toastId });
      
      // @ts-ignore
      const generatePromise = html2pdfLib().from(clone).set(opt).save();
      await Promise.race([generatePromise, timeoutPromise]);

      toast.success('Performance Report PDF generated and downloaded successfully!', { id: toastId });
    } catch (error: any) {
      console.error('PDF Generation Failure:', error);
      toast.error(error.message || 'An unexpected error occurred during PDF rendering.', { id: toastId });
    } finally {
      // Clean up temporary container
      if (tempContainer && tempContainer.parentNode) {
        tempContainer.parentNode.removeChild(tempContainer);
      }
      setIsGeneratingPDF(false);
    }
  };

  const selectedPerfArtifact = useMemo(() => {
    if (exportType !== 'Manual Performance Testing Execution' || selectedReportIds.length === 0) return null;
    return currentProject.performanceScripts?.find(s => s.id === selectedReportIds[0]) || null;
  }, [exportType, selectedReportIds, currentProject]);

  const userStoriesSummary = useMemo(() => {
    if (!currentProject?.userStories) return [];
    const folderMap = new Map(currentProject.userStories.map(s => [s.id, s.summary]));
    
    return currentProject.userStories
      .filter(s => s.storyId !== 'USERSTORY_FOLDER' && s.storyId !== 'INPUT_SOURCE')
      .map(s => {
        let folderName = 'Individual / Unassigned';
        if (s.folderId && folderMap.has(s.folderId)) {
          const parentId = currentProject.userStories?.find(f => f.id === s.folderId)?.parentFolderId;
          if (parentId && folderMap.has(parentId)) {
            folderName = `${folderMap.get(parentId)} / ${folderMap.get(s.folderId)}`;
          } else {
            folderName = folderMap.get(s.folderId)!;
          }
        }
        return {
          id: s.id,
          storyId: s.storyId || 'US-000',
          summary: s.summary,
          description: s.description,
          acceptanceCriteria: s.acceptanceCriteria,
          folderName,
          createdAt: s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB') : 'N/A'
        };
      });
  }, [currentProject]);

  const scenarioMetrics = useMemo(() => {
    if (!currentProject?.scenarios) return { total: 0, approved: 0, unapproved: 0, functional: 0, nonFunctional: 0 };
    return getScenarioMetrics(currentProject.scenarios, currentProject.deletedItemIds);
  }, [currentProject]);

  const stats = useMemo(() => {
    if (!currentProject) return { scenarios: 0, approvedScenarios: 0, unapprovedScenarios: 0, functionalScenarios: 0, nonFunctionalScenarios: 0, userStories: 0, manual: 0, automation: 0, api: 0, performance: 0 };
    return {
      scenarios: scenarioMetrics.total,
      approvedScenarios: scenarioMetrics.approved,
      unapprovedScenarios: scenarioMetrics.unapproved,
      functionalScenarios: scenarioMetrics.functional,
      nonFunctionalScenarios: scenarioMetrics.nonFunctional,
      userStories: userStoriesSummary.length,
      manual: executionStats.functional.total,
      automation: executionStats.script.total,
      api: executionStats.api.total,
      performance: executionStats.performance.total
    };
  }, [currentProject, scenarioMetrics, userStoriesSummary, executionStats]);

  if (!currentProject) return <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest">Loading workspace report analytics...</div>;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-700 relative">
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm gap-4">
        <div>
          <h2 className="text-2xl font-black text-black uppercase tracking-tight">Reports</h2>
          <p className="text-sm text-indigo-600 font-black uppercase tracking-widest mt-1">{currentProject.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-3 bg-emerald-600 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95"
          >
            <FileSpreadsheet size={18} /> Export Data
          </button>
          <button 
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            className="flex items-center gap-3 bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer size={18} /> {isGeneratingPDF ? 'Generating Report...' : 'Print full report'}
          </button>
        </div>
      </div>

      <div ref={reportRef} id="main-printable-report" className="bg-white p-6 rounded-2xl border border-slate-100 space-y-6 max-w-[760px] mx-auto overflow-visible printable-report">
        <div className="flex justify-between items-start border-b border-slate-100 pb-4">
          <div className="flex items-center gap-4">
            <AutomatiqaLogo variant="stacked" size="sm" showTagline={true} />
            <div className="h-12 w-px bg-slate-200 mx-1 hidden sm:block self-center" />
            <div className="self-center">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Project</p>
              <p className="text-xs font-black text-teal-600 uppercase tracking-wider leading-none">{currentProject.name}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Generated On</p>
            <p className="text-xs font-bold text-slate-800 mb-1">{new Date().toLocaleString('en-GB')}</p>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">User ID</p>
            <p className="text-[10px] font-bold text-teal-600 font-mono">{currentUserId}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'AI User Stories', value: stats.userStories, icon: <BookOpen size={16}/>, bg: 'bg-rose-100', text: 'text-rose-600' },
            { 
              label: 'AI Scenarios', 
              value: stats.scenarios, 
              sub: `App: ${stats.approvedScenarios} | Unapp: ${stats.unapprovedScenarios}`,
              icon: <Layers size={16}/>, 
              bg: 'bg-indigo-100', 
              text: 'text-indigo-600' 
            },
            { label: 'Test Cases Suite', value: stats.manual, icon: <FileText size={16}/>, bg: 'bg-blue-100', text: 'text-blue-600' },
            { label: 'Automation Scripts', value: stats.automation, icon: <Terminal size={16}/>, bg: 'bg-emerald-100', text: 'text-emerald-600' },
            { label: 'API Suites', value: stats.api, icon: <Network size={16}/>, bg: 'bg-purple-100', text: 'text-purple-600' },
            { label: 'Performance Artifacts', value: stats.performance, icon: <Zap size={16}/>, bg: 'bg-amber-100', text: 'text-amber-600' },
          ].map((stat, idx) => (
            <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                <div className={`p-1.5 ${stat.bg} ${stat.text} rounded-lg w-fit mb-1.5`}>
                    {stat.icon}
                </div>
                <div>
                  <p className="text-[9.5px] font-black text-slate-700 uppercase tracking-wider mb-1 leading-tight" title={stat.label}>{stat.label}</p>
                  <div className="flex items-baseline gap-1.5">
                    <h3 className="text-lg font-black text-slate-900 leading-none">{stat.value}</h3>
                    {stat.sub && (
                      <span className="text-[9px] font-bold text-slate-500">{stat.sub}</span>
                    )}
                  </div>
                </div>
            </div>
          ))}
        </div>

        {/* AI Scenarios Metric Summary Banner */}
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
            <span className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">AI Scenarios</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-700">
            <span>Total: <strong className="font-black text-indigo-700">{stats.scenarios}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Approved: <strong className="font-black text-blue-700">{stats.approvedScenarios}</strong></span>
            <span className="text-slate-300">|</span>
            <span>Unapproved: <strong className="font-black text-amber-700">{stats.unapprovedScenarios}</strong></span>
            <span className="text-slate-300">|</span>
            <span className="text-[10px] text-slate-500 font-medium">({stats.scenarios} = {stats.approvedScenarios} + {stats.unapprovedScenarios})</span>
          </div>
        </div>

        <div className="space-y-3 avoid-break" style={{ pageBreakInside: 'avoid' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-l-4 border-indigo-600 pl-3">
                <div className="flex items-center gap-3">
                    <Activity size={20} className="text-indigo-600 shrink-0" />
                    <div className="flex flex-col">
                        <h2 className="text-base font-black text-slate-900 uppercase tracking-widest leading-snug">Functional Test Case Execution Summary</h2>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Status matrix of active execution folders</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-700">Not Started: {executionStats.functional.notStarted}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100">Pass: {executionStats.functional.pass}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-red-50 text-red-700 border border-red-100">Fail: {executionStats.functional.fail}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-100">Blocked: {executionStats.functional.blocked}</span>
                </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr style={{ pageBreakInside: 'avoid' }} className="bg-slate-50/80 text-[10px] font-black text-slate-700 uppercase tracking-wider border-b border-slate-100">
                            <th className="px-3 py-2.5">Suite Name</th>
                            <th className="px-3 py-2.5">Class</th>
                            <th className="px-3 py-2.5">User ID</th>
                            <th className="px-3 py-2.5 text-center">Total</th>
                            <th className="px-3 py-2.5 text-center">Not Executed</th>
                            <th className="px-3 py-2.5 text-center">Pass</th>
                            <th className="px-3 py-2.5 text-center">Fail</th>
                            <th className="px-3 py-2.5 text-center">Blocked</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {manualExecSummary.length === 0 ? (
                            <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400 italic text-xs">No functional execution folders currently initialized in this workspace.</td></tr>
                        ) : manualExecSummary.map((item, idx) => {
                            return (
                                <tr style={{ pageBreakInside: 'avoid' }} key={idx} className="hover:bg-slate-50/30 transition-colors">
                                    <td className="px-3 py-2.5 font-bold text-slate-800 text-[11px] uppercase tracking-tight">{item.name}</td>
                                    <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${item.type === 'AI' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>{item.type}</span></td>
                                    <td className="px-3 py-2.5 font-mono text-slate-600 text-[9px] truncate max-w-[120px]" title={currentUserId}>{currentUserId}</td>
                                    <td className="px-3 py-2.5 text-center font-bold text-slate-600 text-[10px]">{item.total}</td>
                                    <td className="px-3 py-2.5 text-center"><span className="text-slate-400 font-bold text-[10px]">{item.notExecuted}</span></td>
                                    <td className="px-3 py-2.5 text-center"><span className="text-emerald-600 font-bold text-[10px]">{item.passed}</span></td>
                                    <td className="px-3 py-2.5 text-center"><span className="text-red-600 font-bold text-[10px]">{item.failed}</span></td>
                                    <td className="px-3 py-2.5 text-center"><span className="text-orange-600 font-bold text-[10px]">{item.blocked}</span></td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {manualExecSummary.length > 0 && (
                        <tfoot>
                            <tr className="bg-slate-50/80 font-black text-[10px] text-slate-800 border-t border-slate-200">
                                <td className="px-3 py-2.5" colSpan={3}>Total Across All Suites</td>
                                <td className="px-3 py-2.5 text-center font-black">{executionStats.functional.total}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-slate-500">{executionStats.functional.notStarted}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-emerald-600">{executionStats.functional.pass}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-red-600">{executionStats.functional.fail}</td>
                                <td className="px-3 py-2.5 text-center font-bold text-orange-600">{executionStats.functional.blocked}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>

        <div className="space-y-3 avoid-break" style={{ pageBreakInside: 'avoid' }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-l-4 border-emerald-500 pl-3">
                <div className="flex items-center gap-3">
                    <Terminal size={20} className="text-emerald-500 shrink-0" />
                    <div className="flex flex-col">
                        <h2 className="text-base font-black text-slate-900 uppercase tracking-widest leading-snug">Script Execution Summary</h2>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">High-fidelity POM suite execution status</p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-700">Not Started: {executionStats.script.notStarted}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100">Pass: {executionStats.script.pass}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-red-50 text-red-700 border border-red-100">Fail: {executionStats.script.fail}</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-100">Blocked: {executionStats.script.blocked}</span>
                </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr style={{ pageBreakInside: 'avoid' }} className="bg-slate-50/80 text-[10px] font-black text-slate-700 uppercase tracking-wider border-b border-slate-100">
                            <th className="px-3 py-2.5">Automation Profile</th>
                            <th className="px-3 py-2.5">Framework / Tool</th>
                            <th className="px-3 py-2.5">User ID</th>
                            <th className="px-3 py-2.5">Execution Status</th>
                            <th className="px-3 py-2.5 text-right">Last Synchronized</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {scriptExecSummary.length === 0 ? (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400 italic text-xs">No automation scripts archived in this workspace repository.</td></tr>
                        ) : (
                            scriptExecSummary.map(script => {
                                const normStatus = normalizeScriptStatus(script.lastExecutionStatus);
                                return (
                                <tr style={{ pageBreakInside: 'avoid' }} key={script.id} className="text-[10px] hover:bg-slate-50/30">
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-1.5 bg-slate-900 text-white rounded shadow-sm"><Code size={12}/></div>
                                            <span className="font-bold text-slate-800 uppercase tracking-tight truncate max-w-[220px]">{script.title || script.testCaseTitles?.[0] || `Script-${script.id.substring(0,4)}`}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[8px] font-bold border border-indigo-100 uppercase tracking-wider">{script.tool} / {script.language}</span>
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-slate-600 text-[9px] truncate max-w-[120px]" title={currentUserId}>
                                        {currentUserId}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[8px] font-bold uppercase tracking-wider border ${
                                            normStatus === 'PASSED' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                            normStatus === 'FAILED' ? 'bg-red-50 text-red-600 border-red-100' :
                                            normStatus === 'BLOCKED' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                                            'bg-slate-50 text-slate-400 border-slate-200'
                                        }`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${normStatus === 'PASSED' ? 'bg-emerald-500 animate-pulse' : 'bg-current opacity-30'}`} />
                                            {normStatus === 'NOT STARTED' ? 'NOT EXECUTED' : normStatus}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-slate-400 text-[9px]">
                                        {script.lastExecutedAt ? new Date(script.lastExecutedAt).toLocaleDateString('en-GB') : 'AWAITING RUN'}
                                    </td>
                                </tr>
                                );
                            })
                        )}
                    </tbody>
                    {scriptExecSummary.length > 0 && (
                        <tfoot>
                            <tr className="bg-slate-50/80 font-black text-[10px] text-slate-800 border-t border-slate-200">
                                <td className="px-3 py-2.5" colSpan={3}>Total Scripts: {executionStats.script.total}</td>
                                <td className="px-3 py-2.5" colSpan={2}>
                                    <div className="flex items-center justify-end gap-3 text-[9px]">
                                        <span className="text-slate-500">Not Started: {executionStats.script.notStarted}</span>
                                        <span className="text-emerald-600">Pass: {executionStats.script.pass}</span>
                                        <span className="text-red-600">Fail: {executionStats.script.fail}</span>
                                        <span className="text-orange-600">Blocked: {executionStats.script.blocked}</span>
                                    </div>
                                </td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>

        <div className="space-y-6">
            <div className="space-y-3 avoid-break" style={{ pageBreakInside: 'avoid' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-l-4 border-purple-500 pl-3">
                    <div className="flex items-center gap-3">
                        <Network size={20} className="text-purple-500 shrink-0" />
                        <div className="flex flex-col">
                            <h2 className="text-base font-black text-slate-900 uppercase tracking-widest leading-snug">API Execution Summary</h2>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Collection integration & verification results</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-700">Not Started: {executionStats.api.notStarted}</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100">Pass: {executionStats.api.pass}</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-red-50 text-red-700 border border-red-100">Fail: {executionStats.api.fail}</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-100">Blocked: {executionStats.api.blocked}</span>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr style={{ pageBreakInside: 'avoid' }} className="bg-slate-50/80 text-[10px] font-black text-slate-700 uppercase tracking-wider border-b border-slate-100">
                                <th className="px-3 py-2.5">API Suite</th>
                                <th className="px-3 py-2.5">User ID</th>
                                <th className="px-3 py-2.5 text-center">Total</th>
                                <th className="px-3 py-2.5 text-center">Not Executed</th>
                                <th className="px-3 py-2.5 text-center">Pass</th>
                                <th className="px-3 py-2.5 text-center">Fail</th>
                                <th className="px-3 py-2.5 text-center">Blocked</th>
                                <th className="px-3 py-2.5 text-right">Current Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {apiExecSummary.length === 0 ? (
                                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400 italic text-xs">No API suites initialized.</td></tr>
                            ) : apiExecSummary.map(suite => {
                                const dynamicStatus = calculateApiSuiteStatus(suite as any);
                                return (
                                    <tr style={{ pageBreakInside: 'avoid' }} key={suite.id} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-3 py-2.5 font-bold text-slate-800 uppercase tracking-tight text-[11px]">{suite.name}</td>
                                        <td className="px-3 py-2.5 font-mono text-slate-600 text-[9px] truncate max-w-[150px]" title={currentUserId}>{currentUserId}</td>
                                        <td className="px-3 py-2.5 text-center font-bold text-slate-600 text-[10px]">{suite.total}</td>
                                        <td className="px-3 py-2.5 text-center"><span className="text-slate-400 font-bold text-[10px]">{suite.notStarted}</span></td>
                                        <td className="px-3 py-2.5 text-center"><span className="text-emerald-600 font-bold text-[10px]">{suite.passed}</span></td>
                                        <td className="px-3 py-2.5 text-center"><span className="text-red-600 font-bold text-[10px]">{suite.failed}</span></td>
                                        <td className="px-3 py-2.5 text-center"><span className="text-orange-600 font-bold text-[10px]">{suite.blocked}</span></td>
                                        <td className="px-3 py-2.5 text-right">
                                            <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-bold border uppercase tracking-wider ${
                                                dynamicStatus === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                dynamicStatus === 'In Progress' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                'bg-slate-50 text-slate-400 border-slate-200'
                                            }`}>{dynamicStatus}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {apiExecSummary.length > 0 && (
                            <tfoot>
                                <tr className="bg-slate-50/80 font-black text-[10px] text-slate-800 border-t border-slate-200">
                                    <td className="px-3 py-2.5" colSpan={2}>Total Scenarios Across Suites</td>
                                    <td className="px-3 py-2.5 text-center font-black">{executionStats.api.total}</td>
                                    <td className="px-3 py-2.5 text-center font-bold text-slate-500">{executionStats.api.notStarted}</td>
                                    <td className="px-3 py-2.5 text-center font-bold text-emerald-600">{executionStats.api.pass}</td>
                                    <td className="px-3 py-2.5 text-center font-bold text-red-600">{executionStats.api.fail}</td>
                                    <td className="px-3 py-2.5 text-center font-bold text-orange-600">{executionStats.api.blocked}</td>
                                    <td className="px-3 py-2.5 text-right font-mono text-[9px] text-indigo-600 font-black">{executionStats.api.passRate}% Pass</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            <div className="space-y-3 avoid-break" style={{ pageBreakInside: 'avoid' }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-l-4 border-amber-500 pl-3">
                    <div className="flex items-center gap-3">
                        <Zap size={20} className="text-amber-500 shrink-0" />
                        <div className="flex flex-col">
                            <h2 className="text-base font-black text-slate-900 uppercase tracking-widest leading-snug">Performance Execution Summary</h2>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Load profile & AI analysis audit log</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-700">Not Started: {executionStats.performance.notStarted}</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100">Pass: {executionStats.performance.pass}</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-red-50 text-red-700 border border-red-100">Fail: {executionStats.performance.fail}</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-100">Blocked: {executionStats.performance.blocked}</span>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr style={{ pageBreakInside: 'avoid' }} className="bg-slate-50/80 text-[10px] font-black text-slate-700 uppercase tracking-wider border-b border-slate-100">
                                <th className="px-3 py-2.5">Artifact / Scenario</th>
                                <th className="px-3 py-2.5">Type</th>
                                <th className="px-3 py-2.5">User ID</th>
                                <th className="px-3 py-2.5 text-right">Execution Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {perfExecItems.length === 0 ? (
                                <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400 italic text-xs">No performance results imported for report.</td></tr>
                            ) : perfExecItems.map((item, idx) => {
                                const isPassed = item.status === TestStatus.PASS;
                                const isFailed = item.status === TestStatus.FAIL;
                                const isBlocked = item.status === TestStatus.BLOCKED;
                                return (
                                    <tr style={{ pageBreakInside: 'avoid' }} key={item.uniqueKey || idx} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="px-3 py-2.5">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <Users size={12} className="text-indigo-400 shrink-0" />
                                                    <span className="text-[10px] font-bold text-slate-700 uppercase">{item.artifactName}</span>
                                                    <span className="text-[9px] text-slate-400 font-medium">({item.itemName})</span>
                                                </div>
                                                {item.generatedOn && (
                                                    <span className="text-[8px] text-slate-400 font-medium ml-5">
                                                        {item.detail} • Generated: {new Date(item.generatedOn).toLocaleString('en-GB')}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-slate-100 text-slate-600">{item.itemType}</span>
                                        </td>
                                        <td className="px-3 py-2.5 font-mono text-slate-600 text-[9px] truncate max-w-[150px]" title={currentUserId}>{currentUserId}</td>
                                        <td className="px-3 py-2.5 text-right">
                                            <span className={`text-[8px] font-bold px-2.5 py-0.5 rounded uppercase ${
                                                isPassed ? 'text-emerald-600 bg-emerald-50 border border-emerald-100' :
                                                isFailed ? 'text-red-600 bg-red-50 border border-red-100' :
                                                isBlocked ? 'text-orange-600 bg-orange-50 border border-orange-100' :
                                                'text-slate-400 bg-slate-50 border border-slate-200'
                                            }`}>
                                                {isPassed ? 'PASSED' : isFailed ? 'FAILED' : isBlocked ? 'BLOCKED' : 'NOT EXECUTED'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {perfExecItems.length > 0 && (
                            <tfoot>
                                <tr className="bg-slate-50/80 font-black text-[10px] text-slate-800 border-t border-slate-200">
                                    <td className="px-3 py-2.5" colSpan={2}>Total Performance Items: {executionStats.performance.total}</td>
                                    <td className="px-3 py-2.5 text-right" colSpan={2}>
                                        <div className="flex items-center justify-end gap-3 text-[9px]">
                                            <span className="text-slate-500">Not Started: {executionStats.performance.notStarted}</span>
                                            <span className="text-emerald-600">Pass: {executionStats.performance.pass}</span>
                                            <span className="text-red-600">Fail: {executionStats.performance.fail}</span>
                                            <span className="text-orange-600">Blocked: {executionStats.performance.blocked}</span>
                                        </div>
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>

        {/* Footer removed as per request */}
      </div>

      {/* Hidden Performance PDF Content - rendered offscreen to support reliable layout & chart dimension calculations */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '760px', height: 'auto', overflow: 'visible', pointerEvents: 'none', opacity: 1 }}>
        <div id="performance-pdf-content" className="p-6 bg-white space-y-6 w-[760px]">
          <div className="flex justify-between items-center border-b-2 border-slate-100 pb-3">
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Performance Workload Sign-off</h1>
            <div className="text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase">Generated On</p>
              <p className="text-xs font-bold text-slate-800">{new Date().toLocaleString('en-GB')}</p>
            </div>
          </div>

          {selectedPerfArtifact && (
            <div className="space-y-5">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <h2 className="text-base font-black text-slate-800 uppercase mb-1">{selectedPerfArtifact.name}</h2>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Artifact ID: {selectedPerfArtifact.id}</p>
              </div>

              {/* Trends Section */}
              <div className="space-y-3 avoid-break" style={{ pageBreakInside: 'avoid' }}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-l-4 border-indigo-600 pl-3">Hits Per Second Analysis</h3>
                {selectedPerfArtifact.trendData ? (
                  <div className="bg-white border border-slate-100 rounded-xl p-4">
                    <div className="h-[320px] w-full">
                      {(() => {
                        try {
                          const trendData = JSON.parse(selectedPerfArtifact.trendData);
                          if (!Array.isArray(trendData) || trendData.length === 0) {
                            return <div className="p-8 text-center bg-slate-50 rounded-xl text-slate-400 text-xs font-bold uppercase">No Trend Data Available</div>;
                          }
                          const maxHits = Math.max(...trendData.map((d: any) => d.hitsPerSecond || 0));
                          return (
                            <LineChart width={700} height={300} data={trendData} margin={{ top: 20, right: 30, left: 30, bottom: 50 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                              <XAxis 
                                dataKey="time" 
                                axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 9, fontWeight: 800 }}
                              >
                                <Label value="ELAPSED TIME" offset={-30} position="insideBottom" style={{ fontSize: '9px', fontWeight: '900', fill: '#64748b', textTransform: 'uppercase', letterSpacing: '0.15em' }} />
                              </XAxis>
                              <YAxis 
                                axisLine={{ stroke: '#cbd5e1', strokeWidth: 1.5 }} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 9, fontWeight: 800 }}
                                domain={[0, maxHits <= 10 ? 10 : 'auto']}
                                ticks={maxHits <= 10 ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : undefined}
                              >
                                <Label value="NUMBER OF HITS / SEC" angle={-90} position="insideLeft" offset={-20} style={{ fontSize: '9px', fontWeight: '900', fill: '#64748b', textAnchor: 'middle', letterSpacing: '0.1em' }} />
                              </YAxis>
                              <Line 
                                type="monotone" 
                                dataKey="hitsPerSecond" 
                                stroke="#8b5cf6" 
                                strokeWidth={3} 
                                dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff' }} 
                                connectNulls 
                                isAnimationActive={false}
                              />
                            </LineChart>
                          );
                        } catch (err) {
                          return <div className="p-8 text-center bg-slate-50 rounded-xl text-slate-400 text-xs font-bold uppercase">No Trend Data Available</div>;
                        }
                      })()}
                    </div>
                    <div className="flex justify-center gap-6 mt-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 bg-[#8b5cf6] rounded-full" />
                        <span className="text-[9px] font-bold text-slate-500 uppercase">Hits / Sec</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center bg-slate-50 rounded-xl text-slate-400 text-xs font-bold uppercase">No Trend Data Available</div>
                )}
              </div>

              {/* Verdict Section */}
              <div className="space-y-3 avoid-break" style={{ pageBreakInside: 'avoid' }}>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest border-l-4 border-amber-500 pl-3">AI Analysis Verdict</h3>
                {selectedPerfArtifact.analysisReport ? (
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                    {(() => {
                      try {
                        const parsed = JSON.parse(selectedPerfArtifact.analysisReport);
                        return (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
                                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Execution Status</p>
                                <div className="flex items-center">
                                  <p className={`text-lg font-black uppercase ${parsed.status === 'Pass' ? 'text-emerald-600' : 'text-red-600'}`}>{parsed.status}</p>
                                </div>
                              </div>
                              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                                <p className="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Production Readiness</p>
                                <p className="text-[11px] font-black text-slate-800 uppercase leading-tight">{parsed.productionReadiness}</p>
                              </div>
                            </div>
                            <div className="p-4 bg-white rounded-xl border border-slate-100 italic text-xs text-slate-600 leading-relaxed border-l-4 border-indigo-400">
                              {parsed.loadStatement}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {(parsed.technicalReport?.metrics || []).map((m: any, i: number) => (
                                <div key={i} className="p-3 bg-white rounded-lg border border-slate-100">
                                  <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5 tracking-widest">{m.label}</p>
                                  <p className="text-[10px] font-bold text-slate-800 uppercase">{m.value}</p>
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      } catch (e) {
                        return (
                          <div className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                            <ReactMarkdown>{selectedPerfArtifact.analysisReport}</ReactMarkdown>
                          </div>
                        );
                      }
                    })()}
                  </div>
                ) : (
                  <div className="p-4 text-center bg-slate-50 rounded-xl text-slate-400 text-xs font-bold uppercase">No AI Analysis Report Available</div>
                )}
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-slate-100 text-center">
            <p className="text-[9px] font-black text-slate-400 tracking-[0.3em]">AutomatiQA Intelligence Report • Confidential</p>
          </div>
        </div>
      </div>

      {isExportModalOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[3rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.4)] overflow-hidden border border-white animate-in zoom-in-95 duration-200 font-sans">
            <div className="p-10">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-emerald-600 rounded-2xl text-white shadow-xl shadow-emerald-100">
                    <FileSpreadsheet size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Export Execution Results</h3>
                  </div>
                </div>
                <button onClick={() => setIsExportModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition-all">
                  <X size={28} />
                </button>
              </div>

              <div className="space-y-8 text-left">
                <div>
                  <label className="text-lg font-black text-slate-800 uppercase tracking-widest ml-3 mb-3 block">Execution Type</label>
                  <div className="relative group">
                    <select 
                      value={exportType || ''}
                      onChange={(e) => { 
                        setExportType(e.target.value as ExecutionType); 
                        setSelectedReportIds([]); 
                      }}
                      className="w-full pl-6 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-700 focus:bg-white focus:ring-4 ring-emerald-50 transition-all appearance-none cursor-pointer shadow-inner"
                    >
                      <option value="Manual Test Case Execution">Functional Execution Results</option>
                      <option value="AI User Story Repository">AI User Story Repository</option>
                      <option value="Automation Test Script Execution">Automation Scripts Summary</option>
                      <option value="API Testing Execution">API Execution</option>
                      <option value="Manual Performance Testing Execution">Performance Workload Sign-off</option>
                    </select>
                    <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-emerald-600 transition-colors" size={20} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between ml-3 mb-3">
                    <label className="text-lg font-black text-slate-800 uppercase tracking-widest block">Execution Module</label>
                    {availableReports.length > 0 && (
                      <button 
                        onClick={() => {
                          if (selectedReportIds.length === availableReports.length) {
                            setSelectedReportIds([]);
                          } else {
                            setSelectedReportIds(availableReports.map(r => r.id));
                          }
                        }}
                        className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors"
                      >
                        {selectedReportIds.length === availableReports.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>
                  <div className="max-h-[200px] overflow-y-auto border border-slate-200 rounded-2xl p-4 bg-slate-50 space-y-2 custom-scrollbar shadow-inner">
                    {availableReports.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-3 opacity-40">
                        <AlertTriangle size={24} className="text-slate-400" />
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest text-center">No executable data found in archives</p>
                      </div>
                    ) : (
                      availableReports.map(report => (
                        <label key={report.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-100 hover:border-emerald-200 transition-all cursor-pointer group shadow-sm">
                          <div className="relative flex items-center">
                            <input 
                              type="checkbox"
                              checked={selectedReportIds.includes(report.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedReportIds(prev => [...prev, report.id]);
                                } else {
                                  setSelectedReportIds(prev => prev.filter(id => id !== report.id));
                                }
                              }}
                              className="w-5 h-5 rounded-lg border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </div>
                          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-tight group-hover:text-emerald-600 transition-colors line-clamp-1">{report.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 pt-6">
                  {exportType === 'Manual Performance Testing Execution' && (
                    <button 
                      onClick={handleDownloadPerformancePDF}
                      disabled={isGeneratingPDF}
                      className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {isGeneratingPDF ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating PDF...
                        </>
                      ) : (
                        <>
                          <Printer size={18} /> Generate PDF Report
                        </>
                      )}
                    </button>
                  )}
                  {exportType !== 'Manual Performance Testing Execution' && (
                    <button 
                      onClick={handleExcelExport}
                      className="w-full py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-2xl shadow-emerald-100 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Download size={18} /> Generate Report(Spreadsheet)
                    </button>
                  )}
                  <button 
                    onClick={() => setIsExportModalOpen(false)}
                    className="w-full py-5 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-[0.98]"
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;