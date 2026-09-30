import React, { useState, useRef, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  Layout, 
  Upload, 
  Link2, 
  AlertCircle, 
  CheckCircle2, 
  CheckCircle,
  Download,
  Loader2, 
  Trash2, 
  Eye, 
  FileSearch,
  ChevronRight,
  ShieldAlert,
  Type as TypeIcon,
  AlignLeft,
  FolderPlus,
  Folder,
  Save,
  MoreVertical,
  Edit,
  Move,
  Search,
  ChevronDown,
  ChevronUp,
  Plus,
  ArrowLeft,
  FileText,
  RotateCcw,
  Sparkles,
  ArrowRightLeft,
  Video,
  File,
  X,
  Copy,
  Check,
  Globe,
  Palette,
  Sliders,
  AlertTriangle,
  Image as ImageIcon,
  BookOpen,
  ShieldCheck,
  FileCheck,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Film
} from 'lucide-react';
import { 
  performUITesting, 
  correctUIIssues, 
  performFigmaDesignReview, 
  correctFigmaDesignIssues, 
  compareAppAndFigmaUI, 
  correctUIComparisonDiscrepancies 
} from '../geminiService';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { compressImage } from '../services/apiUtils';
import { logActivity } from '../services/activityService';
import { deductExportCredits } from '../services/creditService';
import { saveReportArtifacts, hydrateReportArtifacts, hydrateAllReports, saveVideoBlob, getVideoBlob, resolveVideoPlayableUrl } from '../services/artifactStorage';
import { ScreenshotImage, ScreenshotPreviewModalContent } from './ScreenshotViewer';
import { VideoSizeAlertModal } from './VideoSizeAlertModal';
import { UITestingFolder, UITestingInput, UITestingReport, FigmaDesignReview, UIComparisonReport, Project, StandardRequirementData, RequirementFormatType } from '../types';
import mammoth from 'mammoth';
import { generateUniqueFolderId } from '../utils/idGenerator';
import { addDeletedIds } from '../services/projectService';
import { deleteFolderFromFirestore } from '../services/folderPersistenceService';

interface UITestingProps {
  project: Project;
  user: any;
  onUpdateProject: (project: Project) => void;
}

export interface UploadedVideoItem {
  id: string;
  name: string;
  url: string;
  frames: { timestamp: string; image: string }[];
  blob?: Blob | File;
  dataUrl?: string;
  size?: string;
  type?: string;
}

export interface UploadedDocItem {
  id: string;
  name: string;
  content: string;
}

const isFrameBlankOrUniform = (ctx: CanvasRenderingContext2D, width: number, height: number): boolean => {
  try {
    const sampleW = Math.min(width, 120);
    const sampleH = Math.min(height, 120);
    const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;
    let totalBrightness = 0;
    let minBrightness = 255;
    let maxBrightness = 0;
    let sampledCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 15) continue;
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      totalBrightness += brightness;
      if (brightness < minBrightness) minBrightness = brightness;
      if (brightness > maxBrightness) maxBrightness = brightness;
      sampledCount++;
    }

    if (sampledCount === 0) return true;
    const avgBrightness = totalBrightness / sampledCount;
    const delta = maxBrightness - minBrightness;

    // Solid black (< 6 brightness, delta < 4), solid white (> 252 brightness, delta < 4), or completely flat uniform color (< 2 delta)
    if ((avgBrightness < 6 && delta < 4) || (avgBrightness > 252 && delta < 4) || delta < 2) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

const extractVideoFrames = async (file: File): Promise<{ timestamp: string; image: string; isBlank?: boolean }[]> => {
  // Strategy 1: High-Reliability Server-side ffmpeg extraction (100% video frame decode, zero GPU texture lock bugs)
  try {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/extract-video-frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoData: base64, filename: file.name })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.frames) && data.frames.length > 0) {
        return data.frames;
      }
    }
  } catch (serverErr) {
    console.warn('[Video Extract] Server extraction fallback to browser canvas:', serverErr);
  }

  // Strategy 2: Client-side HTML5 canvas extraction fallback
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const timeout = setTimeout(() => {
      resolve([]);
    }, 35000);

    const onMetadataLoaded = async () => {
      try {
        let duration = video.duration;
        // Fix for browsers returning Infinity / NaN for webm duration until seek
        if (!duration || isNaN(duration) || duration === Infinity || duration <= 0) {
          try {
            video.currentTime = 1e10;
            await new Promise<void>((r) => {
              const onSeek = () => {
                video.removeEventListener('seeked', onSeek);
                r();
              };
              video.addEventListener('seeked', onSeek, { once: true });
              setTimeout(r, 600);
            });
            duration = video.duration;
            video.currentTime = 0;
            await new Promise<void>((r) => {
              const onSeek = () => {
                video.removeEventListener('seeked', onSeek);
                r();
              };
              video.addEventListener('seeked', onSeek, { once: true });
              setTimeout(r, 600);
            });
          } catch {
            duration = 5;
          }
        }

        if (!duration || isNaN(duration) || duration === Infinity || duration <= 0) {
          duration = 5;
        }

        // Pulse play once to unlock video frame surface rasterization
        try {
          await video.play();
          video.pause();
        } catch (playErr) {}

        const rawW = video.videoWidth || 1280;
        const rawH = video.videoHeight || 720;
        const maxDim = 1280;
        const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
        const w = Math.round(rawW * scale) || 960;
        const h = Math.round(rawH * scale) || 540;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Calculate comprehensive, sequential timestamps across the entire video walkthrough
        const timestampsToSample: number[] = [];
        if (duration <= 3) {
          timestampsToSample.push(0.1, duration * 0.5, Math.max(0.2, duration - 0.15));
        } else if (duration <= 8) {
          const count = Math.min(6, Math.max(4, Math.floor(duration / 1.2)));
          for (let i = 0; i < count; i++) {
            timestampsToSample.push(0.1 + (duration - 0.25) * (i / Math.max(1, count - 1)));
          }
        } else if (duration <= 25) {
          const count = Math.min(10, Math.max(5, Math.floor(duration / 2)));
          for (let i = 0; i < count; i++) {
            timestampsToSample.push(0.1 + (duration - 0.3) * (i / Math.max(1, count - 1)));
          }
        } else if (duration <= 60) {
          const count = Math.min(14, Math.max(8, Math.floor(duration / 3.5)));
          for (let i = 0; i < count; i++) {
            timestampsToSample.push(0.1 + (duration - 0.4) * (i / Math.max(1, count - 1)));
          }
        } else {
          const count = 18;
          for (let i = 0; i < count; i++) {
            timestampsToSample.push(0.2 + (duration - 0.5) * (i / (count - 1)));
          }
        }

        const frames: { timestamp: string; image: string; isBlank?: boolean }[] = [];

        for (const targetTime of timestampsToSample) {
          await new Promise<void>((seekDone) => {
            let timer: any = null;
            const onSeeked = () => {
              if (timer) clearTimeout(timer);
              video.removeEventListener('seeked', onSeeked);

              // Allow buffer time for video frame decode and rasterization
              setTimeout(() => {
                try {
                  if (ctx) {
                    ctx.drawImage(video, 0, 0, w, h);
                    const isBlank = isFrameBlankOrUniform(ctx, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
                    const mins = Math.floor(targetTime / 60);
                    const secs = Math.floor(targetTime % 60);
                    const ts = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
                    frames.push({ timestamp: ts, image: dataUrl, isBlank });
                  }
                } catch (e) {
                  console.error('Frame extraction draw error:', e);
                }
                seekDone();
              }, 100);
            };

            timer = setTimeout(() => {
              video.removeEventListener('seeked', onSeeked);
              seekDone();
            }, 2500);

            video.addEventListener('seeked', onSeeked, { once: true });
            video.currentTime = Math.min(Math.max(0.05, targetTime), Math.max(0.05, duration - 0.05));
          });
        }

        clearTimeout(timeout);
        resolve(frames);
      } catch (err) {
        clearTimeout(timeout);
        console.error('Error in extractVideoFrames:', err);
        resolve([]);
      }
    };

    video.onloadedmetadata = onMetadataLoaded;
    video.onerror = () => {
      clearTimeout(timeout);
      resolve([]);
    };
    video.load();
  });
};

const parseDocumentFile = async (file: File): Promise<{ name: string; content: string }> => {
  const name = file.name;
  const ext = name.split('.').pop()?.toLowerCase() || '';

  try {
    if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return { name, content: result.value || 'No text content extracted from Word document.' };
    } else {
      const text = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.readAsText(file);
      });
      return { name, content: text || `Document specification content for ${name}` };
    }
  } catch (err) {
    return { name, content: `Document: ${name}` };
  }
};

export interface UploadedImageItem {
  id: string;
  name: string;
  size: string;
  type: string;
  data: string;
}

const getImageData = (img: string | UploadedImageItem): string => {
  if (!img) return '';
  return typeof img === 'string' ? img : (img.data || '');
};

const getImageName = (img: string | UploadedImageItem, fallback = 'Screenshot.png'): string => {
  if (!img) return fallback;
  return typeof img === 'string' ? fallback : (img.name || fallback);
};

const getImageMeta = (img: string | UploadedImageItem): { size: string; type: string } => {
  if (!img || typeof img === 'string') {
    return { size: '0.15 MB', type: 'PNG' };
  }
  return {
    size: img.size || '0.15 MB',
    type: img.type ? img.type.replace('image/', '').toUpperCase() : 'PNG'
  };
};

interface StandardRequirementsInstructionBoxProps {
  value: string;
  onChange: (val: string) => void;
  requirementData?: StandardRequirementData;
  onRequirementDataChange?: (data: StandardRequirementData) => void;
  moduleName: string;
  themeColor?: 'teal' | 'amber' | 'cyan';
}

const StandardRequirementsInstructionBox: React.FC<StandardRequirementsInstructionBoxProps> = ({
  value,
  onChange,
  requirementData,
  onRequirementDataChange,
  moduleName,
  themeColor = 'teal'
}) => {
  const reqType: RequirementFormatType = requirementData?.type || 'text';
  
  const hasContent = useMemo(() => {
    if (reqType === 'text') return value.trim().length > 0;
    if (reqType === 'document') return !!requirementData?.document?.content;
    if (reqType === 'screenshot') return !!requirementData?.image?.dataUrl;
    if (reqType === 'video') return (requirementData?.video?.frames?.length || 0) > 0;
    return value.trim().length > 0;
  }, [reqType, value, requirementData]);

  const [isExtractingFile, setIsExtractingFile] = useState(false);
  const [isVideoSizeAlertOpen, setIsVideoSizeAlertOpen] = useState(false);
  const [oversizedVideoMB, setOversizedVideoMB] = useState<number | undefined>(undefined);
  const docInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const colorStyles = {
    teal: {
      border: 'border-teal-200/80 hover:border-teal-300',
      activeBorder: 'border-[#00E1C5]',
      bg: 'bg-teal-50/30',
      iconBg: 'bg-teal-100/80 text-teal-700',
      badgeActive: 'bg-[#00E1C5]/20 text-teal-800 border-[#00E1C5]/40',
      badgeInactive: 'bg-slate-100 text-slate-500 border-slate-200',
      focusRing: 'focus:border-[#00E1C5] focus:ring-1 focus:ring-[#00E1C5]/30',
      pillActive: 'bg-[#00E1C5] text-white shadow-sm',
      pillInactive: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80',
      buttonTheme: 'bg-[#00E1C5] hover:bg-[#00CBB2] text-white'
    },
    amber: {
      border: 'border-amber-200/80 hover:border-amber-300',
      activeBorder: 'border-amber-400',
      bg: 'bg-amber-50/30',
      iconBg: 'bg-amber-100/80 text-amber-800',
      badgeActive: 'bg-amber-100 text-amber-900 border-amber-300',
      badgeInactive: 'bg-slate-100 text-slate-500 border-slate-200',
      focusRing: 'focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30',
      pillActive: 'bg-amber-500 text-white shadow-sm',
      pillInactive: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80',
      buttonTheme: 'bg-amber-500 hover:bg-amber-600 text-white'
    },
    cyan: {
      border: 'border-cyan-200/80 hover:border-cyan-300',
      activeBorder: 'border-cyan-400',
      bg: 'bg-cyan-50/30',
      iconBg: 'bg-cyan-100/80 text-cyan-800',
      badgeActive: 'bg-cyan-100 text-cyan-900 border-cyan-300',
      badgeInactive: 'bg-slate-100 text-slate-500 border-slate-200',
      focusRing: 'focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30',
      pillActive: 'bg-cyan-600 text-white shadow-sm',
      pillInactive: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80',
      buttonTheme: 'bg-cyan-600 hover:bg-cyan-700 text-white'
    }
  }[themeColor];

  const handleTypeChange = (newType: RequirementFormatType) => {
    if (onRequirementDataChange) {
      onRequirementDataChange({
        type: newType,
        text: value,
        document: requirementData?.document || null,
        image: requirementData?.image || null,
        video: requirementData?.video || null
      });
    }
  };

  const handleClearAll = () => {
    onChange('');
    if (onRequirementDataChange) {
      onRequirementDataChange({
        type: 'text',
        text: '',
        document: null,
        image: null,
        video: null
      });
    }
    toast.success('Standard requirements cleared');
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtractingFile(true);
    try {
      const parsed = await parseDocumentFile(file);
      const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      if (onRequirementDataChange) {
        onRequirementDataChange({
          type: 'document',
          text: parsed.content,
          document: {
            name: file.name,
            size: sizeStr,
            content: parsed.content,
            type: file.type || 'application/octet-stream'
          },
          image: requirementData?.image || null,
          video: requirementData?.video || null
        });
      }
      onChange(parsed.content);
      toast.success(`Requirement document loaded: ${file.name}`);
    } catch (err) {
      toast.error('Failed to parse document file');
    } finally {
      setIsExtractingFile(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtractingFile(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      if (typeof reader.result === 'string') {
        const compressed = await compressImage(reader.result);
        const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        if (onRequirementDataChange) {
          onRequirementDataChange({
            type: 'screenshot',
            text: `Standard Visual Requirement: ${file.name}`,
            image: {
              name: file.name,
              size: sizeStr,
              dataUrl: compressed,
              type: file.type || 'image/png'
            },
            document: requirementData?.document || null,
            video: requirementData?.video || null
          });
        }
        toast.success(`Requirement image loaded: ${file.name}`);
      }
      setIsExtractingFile(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    };
    reader.onerror = () => {
      setIsExtractingFile(false);
      toast.error('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      if (videoInputRef.current) videoInputRef.current.value = '';
      setOversizedVideoMB(file.size / (1024 * 1024));
      setIsVideoSizeAlertOpen(true);
      toast.error('Video size should not exceed 20 MB.');
      return;
    }

    setIsExtractingFile(true);
    toast.info(`Extracting keyframes from requirement video: ${file.name}...`);
    try {
      const frames = await extractVideoFrames(file);
      const url = URL.createObjectURL(file);
      const sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      if (onRequirementDataChange) {
        onRequirementDataChange({
          type: 'video',
          text: `Standard Video Walkthrough: ${file.name} (${frames.length} keyframes)`,
          video: {
            name: file.name,
            size: sizeStr,
            url,
            frames
          },
          document: requirementData?.document || null,
          image: requirementData?.image || null
        });
      }
      toast.success(`Extracted ${frames.length} keyframes from requirement video`);
    } catch (err) {
      toast.error('Failed to process requirement video');
    } finally {
      setIsExtractingFile(false);
      if (videoInputRef.current) videoInputRef.current.value = '';
    }
  };

  return (
    <div className={`p-6 rounded-[2rem] border transition-all ${hasContent ? `${colorStyles.activeBorder} shadow-sm bg-white` : `${colorStyles.border} ${colorStyles.bg}`} space-y-4`}>
      {/* Hidden file inputs */}
      <input type="file" ref={docInputRef} className="hidden" accept=".pdf,.doc,.docx,.txt,.json,.md" onChange={handleDocUpload} />
      <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
      <input type="file" ref={videoInputRef} className="hidden" accept="video/*" onChange={handleVideoUpload} />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${colorStyles.iconBg}`}>
            <BookOpen size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                STANDARD REQUIREMENTS (REFERENCE BENCHMARK)
              </h4>
              {hasContent ? (
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 ${colorStyles.badgeActive}`}>
                  <ShieldCheck size={11} /> STANDARDS ACTIVE FOR AUDIT
                </span>
              ) : (
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${colorStyles.badgeInactive}`}>
                  OPTIONAL REFERENCE BENCHMARK
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium text-slate-500 mt-0.5 leading-relaxed">
              Add your master requirements in multiple formats (Text, Document, Screenshot/Image, or Video) for <strong className="text-slate-800">{moduleName}</strong>. The AI analysis compares all pages against this input and explicitly lists any unmatched pages with specific differences.
            </p>
          </div>
        </div>

        {hasContent && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-rose-600 flex items-center gap-1 self-end sm:self-center transition-colors"
          >
            <Trash2 size={12} /> Clear Requirements
          </button>
        )}
      </div>

      {/* Format / Type Selector Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 uppercase tracking-wider">
          <span>Requirement Type:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => handleTypeChange('text')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${reqType === 'text' ? colorStyles.pillActive : colorStyles.pillInactive}`}
          >
            <TypeIcon size={13} /> Text
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('document')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${reqType === 'document' ? colorStyles.pillActive : colorStyles.pillInactive}`}
          >
            <FileText size={13} /> Document
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('screenshot')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${reqType === 'screenshot' ? colorStyles.pillActive : colorStyles.pillInactive}`}
          >
            <ImageIcon size={13} /> Screenshot / Image
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('video')}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${reqType === 'video' ? colorStyles.pillActive : colorStyles.pillInactive}`}
          >
            <Video size={13} /> Video
          </button>
        </div>
      </div>

      {/* 1. TEXT REQUIREMENT INPUT */}
      {reqType === 'text' && (
        <div className="space-y-2">
          <textarea
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (onRequirementDataChange) {
                onRequirementDataChange({
                  type: 'text',
                  text: e.target.value,
                  document: requirementData?.document || null,
                  image: requirementData?.image || null,
                  video: requirementData?.video || null
                });
              }
            }}
            rows={5}
            placeholder="Paste or type standard website and design requirements here... (e.g., Primary buttons must use #00E1C5 with 8px radius; Header must display logo on left with sticky navigation; All text must meet WCAG 2.1 AA 4.5:1 contrast; Form inputs must show inline validation error messages below fields)..."
            className={`w-full p-4 bg-white border border-slate-200/90 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 outline-none transition-all resize-y ${colorStyles.focusRing}`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-medium text-slate-400 pt-0.5">
            <span className="flex items-center gap-1.5 text-slate-500">
              <FileCheck size={13} className={value.trim() ? 'text-teal-600' : 'text-slate-400'} />
              {value.trim() 
                ? `${value.length} characters of standard text requirements provided — AI will audit each page against this master reference.` 
                : 'Enter your standard specifications or rules.'}
            </span>
            {value.trim() && (
              <span className="font-bold text-slate-600">
                {value.trim().split(/\n+/).length} requirement rules
              </span>
            )}
          </div>
        </div>
      )}

      {/* 2. DOCUMENT REQUIREMENT UPLOAD */}
      {reqType === 'document' && (
        <div className="space-y-3">
          {requirementData?.document ? (
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                  <FileText size={20} />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-black text-slate-900 truncate">{requirementData.document.name}</h5>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{requirementData.document.size}</span>
                    <span className="text-[10px] font-bold text-teal-600 uppercase">• {requirementData.document.content.length} characters parsed</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase border border-emerald-200">
                      ✓ Ready
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                >
                  Replace File
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onRequirementDataChange) {
                      onRequirementDataChange({
                        ...requirementData,
                        type: 'document',
                        text: '',
                        document: null
                      });
                    }
                    onChange('');
                  }}
                  className="p-1.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors"
                  title="Remove document"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => docInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-[#00E1C5] rounded-2xl bg-white p-8 flex flex-col items-center justify-center text-center gap-2.5 cursor-pointer transition-all group"
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-50 group-hover:bg-teal-100 text-teal-600 flex items-center justify-center transition-colors">
                <Upload size={22} />
              </div>
              <div>
                <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  UPLOAD STANDARD REQUIREMENT DOCUMENT
                </h5>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  SUPPORTED FORMATS: PDF, DOC, DOCX, TXT, JSON, MD
                </p>
              </div>
              <button
                type="button"
                disabled={isExtractingFile}
                className={`mt-1 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-wider shadow-xs transition-all ${colorStyles.buttonTheme}`}
              >
                {isExtractingFile ? 'PARSING DOCUMENT...' : 'BROWSE DOCUMENT'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. SCREENSHOT / IMAGE REQUIREMENT UPLOAD */}
      {reqType === 'screenshot' && (
        <div className="space-y-3">
          {requirementData?.image ? (
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img 
                  src={requirementData.image.dataUrl} 
                  alt={requirementData.image.name} 
                  className="w-14 h-14 object-cover rounded-xl border border-slate-200 shrink-0 bg-white"
                />
                <div className="min-w-0">
                  <h5 className="text-xs font-black text-slate-900 truncate">{requirementData.image.name}</h5>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{requirementData.image.size}</span>
                    <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase border border-emerald-200">
                      ✓ Master Visual Reference Loaded
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                >
                  Replace Image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onRequirementDataChange) {
                      onRequirementDataChange({
                        ...requirementData,
                        type: 'screenshot',
                        text: '',
                        image: null
                      });
                    }
                  }}
                  className="p-1.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors"
                  title="Remove image"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => imageInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-[#00E1C5] rounded-2xl bg-white p-8 flex flex-col items-center justify-center text-center gap-2.5 cursor-pointer transition-all group"
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-50 group-hover:bg-teal-100 text-teal-600 flex items-center justify-center transition-colors">
                <ImageIcon size={22} />
              </div>
              <div>
                <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  UPLOAD STANDARD REQUIREMENT SCREENSHOT / UI IMAGE
                </h5>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  SUPPORTED FORMATS: PNG, JPG, JPEG, WEBP
                </p>
              </div>
              <button
                type="button"
                disabled={isExtractingFile}
                className={`mt-1 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-wider shadow-xs transition-all ${colorStyles.buttonTheme}`}
              >
                {isExtractingFile ? 'UPLOADING...' : 'BROWSE IMAGE'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. VIDEO REQUIREMENT UPLOAD */}
      {reqType === 'video' && (
        <div className="space-y-3">
          {requirementData?.video ? (
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                    <Video size={20} />
                  </div>
                  <div className="min-w-0">
                    <h5 className="text-xs font-black text-slate-900 truncate">{requirementData.video.name}</h5>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{requirementData.video.size}</span>
                      <span className="text-[10px] font-bold text-teal-600 uppercase">• {requirementData.video.frames.length} keyframes extracted</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase border border-emerald-200">
                        ✓ Motion Benchmark Ready
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                  >
                    Replace Video
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onRequirementDataChange) {
                        onRequirementDataChange({
                          ...requirementData,
                          type: 'video',
                          text: '',
                          video: null
                        });
                      }
                    }}
                    className="p-1.5 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors"
                    title="Remove video"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Keyframe Thumbnails Strip */}
              {requirementData.video.frames && requirementData.video.frames.length > 0 && (
                <div className="pt-2 border-t border-slate-200/60">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Extracted Requirement Benchmark Frames ({requirementData.video.frames.length}):
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {requirementData.video.frames.map((frame, fIdx) => (
                      <div 
                        key={fIdx}
                        className="rounded-lg overflow-hidden border border-slate-200 bg-white"
                      >
                        <img src={frame.image} alt={`Frame ${fIdx + 1}`} className="w-full h-12 object-cover" />
                        <div className="p-0.5 text-center bg-slate-50 text-[8px] font-mono text-teal-700 font-bold">
                          {frame.timestamp}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div 
              onClick={() => videoInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-[#00E1C5] rounded-2xl bg-white p-8 flex flex-col items-center justify-center text-center gap-2.5 cursor-pointer transition-all group"
            >
              <div className="w-12 h-12 rounded-2xl bg-teal-50 group-hover:bg-teal-100 text-teal-600 flex items-center justify-center transition-colors">
                <Video size={22} />
              </div>
              <div>
                <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  UPLOAD STANDARD REQUIREMENT VIDEO
                </h5>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  SUPPORTED FORMATS: MP4, WEBM, MOV (MAX 20 MB • AUTOMATIC KEYFRAME EXTRACTION)
                </p>
              </div>
              <button
                type="button"
                disabled={isExtractingFile}
                className={`mt-1 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-wider shadow-xs transition-all ${colorStyles.buttonTheme}`}
              >
                {isExtractingFile ? 'EXTRACTING KEYFRAMES...' : 'BROWSE VIDEO'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Video Size Limit Modal for Standard Requirement Video */}
      <VideoSizeAlertModal
        isOpen={isVideoSizeAlertOpen}
        onClose={() => setIsVideoSizeAlertOpen(false)}
        fileSizeMB={oversizedVideoMB}
        maxSizeMB={20}
      />
    </div>
  );
};

const VideoPlayerModalContent: React.FC<{
  title: string;
  url?: string;
  frames?: { timestamp: string; image: string }[];
  videoBlob?: any;
  onSelectImage: (title: string, imgUrl: string) => void;
}> = ({ title, url, frames = [], videoBlob, onSelectImage }) => {
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isPlayingAnimation, setIsPlayingAnimation] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string>(url || '');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationTimerRef = useRef<any>(null);

  // Auto resolve if url is empty but videoBlob is present
  useEffect(() => {
    if (url) {
      setResolvedUrl(url);
    } else if (videoBlob) {
      if (videoBlob instanceof Blob) {
        const u = URL.createObjectURL(videoBlob);
        setResolvedUrl(u);
        return () => { URL.revokeObjectURL(u); };
      }
    }
  }, [url, videoBlob]);

  // Slideshow walkthrough player for extracted frames
  useEffect(() => {
    if (isPlayingAnimation && frames.length > 0) {
      animationTimerRef.current = setInterval(() => {
        setActiveFrameIndex(prev => (prev + 1) % frames.length);
      }, 1200 / playbackSpeed);
    } else {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    }
    return () => {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    };
  }, [isPlayingAnimation, frames.length, playbackSpeed]);

  const handleDownloadVideo = async () => {
    const projId = typeof localStorage !== 'undefined' ? (localStorage.getItem('automatiqa_last_project_id') || 'proj-default') : 'proj-default';
    const userName = typeof localStorage !== 'undefined' ? (localStorage.getItem('automatiqa_user_name') || 'User') : 'User';
    const userEmail = typeof localStorage !== 'undefined' ? (localStorage.getItem('automatiqa_user_email') || 'user@qaoncloud.com') : 'user@qaoncloud.com';
    const ok = await deductExportCredits(projId, 'ui_testing', { name: userName, email: userEmail }, 'Download Video / Keyframe');
    if (!ok) return;

    if (resolvedUrl) {
      const a = document.createElement('a');
      a.href = resolvedUrl;
      a.download = typeof title === 'string' && (title.endsWith('.mp4') || title.endsWith('.webm')) ? title : `${title || 'video'}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (frames.length > 0 && frames[activeFrameIndex]?.image) {
      const a = document.createElement('a');
      a.href = frames[activeFrameIndex].image;
      a.download = `${title}_frame_${activeFrameIndex + 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const currentFrame = frames[activeFrameIndex];

  return (
    <div className="w-full space-y-4">
      {/* Primary Video Player Container */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-950 shadow-xl border border-slate-800 flex flex-col items-center justify-center min-h-[260px] max-h-[50vh]">
        {!videoError && resolvedUrl ? (
          <video
            ref={videoRef}
            src={resolvedUrl}
            controls
            playsInline
            preload="auto"
            poster={frames?.[0]?.image}
            onError={() => {
              console.warn('Direct video playback error, switching to interactive frame walkthrough player.');
              setVideoError(true);
            }}
            className="w-full max-h-[48vh] object-contain mx-auto"
          />
        ) : frames.length > 0 ? (
          <div className="relative w-full h-full flex flex-col items-center justify-center p-2">
            <img
              src={currentFrame?.image}
              alt={`Frame ${activeFrameIndex + 1}`}
              className="max-h-[44vh] max-w-full object-contain rounded-lg shadow"
            />
            <div className="absolute top-3 left-3 px-3 py-1 bg-slate-900/90 text-[#00E1C5] rounded-lg text-[10px] font-mono font-bold border border-slate-700 backdrop-blur-sm shadow">
              Frame {activeFrameIndex + 1} / {frames.length} ({currentFrame?.timestamp})
            </div>
            {videoError && (
              <div className="absolute top-3 right-3 px-2.5 py-1 bg-amber-950/90 text-amber-300 rounded-lg text-[9px] font-bold border border-amber-800 backdrop-blur-sm">
                Interactive Walkthrough Mode
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 space-y-2">
            <Video size={36} className="mx-auto text-slate-600 animate-pulse" />
            <p className="text-xs font-bold">Video stream is buffering or unavailable</p>
          </div>
        )}
      </div>

      {/* Playback Controls & Frame Scrubber */}
      {frames.length > 0 && (
        <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlayingAnimation(!isPlayingAnimation)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm ${
                  isPlayingAnimation 
                    ? 'bg-rose-500 hover:bg-rose-600 text-white' 
                    : 'bg-[#00E1C5] hover:bg-[#00CBB2] text-slate-950'
                }`}
              >
                {isPlayingAnimation ? <Pause size={13} /> : <Play size={13} />}
                {isPlayingAnimation ? 'Pause Walkthrough' : 'Play Walkthrough'}
              </button>

              <button
                type="button"
                onClick={() => setActiveFrameIndex(prev => Math.max(0, prev - 1))}
                disabled={activeFrameIndex === 0}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 rounded-xl transition-all border border-slate-700"
                title="Previous Keyframe"
              >
                <SkipBack size={13} />
              </button>

              <button
                type="button"
                onClick={() => setActiveFrameIndex(prev => Math.min(frames.length - 1, prev + 1))}
                disabled={activeFrameIndex === frames.length - 1}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 rounded-xl transition-all border border-slate-700"
                title="Next Keyframe"
              >
                <SkipForward size={13} />
              </button>

              <div className="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
                <span className="text-[9px] font-bold text-slate-400 uppercase">Speed:</span>
                {[1, 1.5, 2].map(speed => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${playbackSpeed === speed ? 'bg-[#00E1C5] text-slate-950' : 'text-slate-400 hover:text-white'}`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold font-mono text-[#00E1C5]">
                {currentFrame?.timestamp || `Frame ${activeFrameIndex + 1}`}
              </span>
              <button
                type="button"
                onClick={handleDownloadVideo}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-bold uppercase flex items-center gap-1 border border-slate-700"
                title="Download Media"
              >
                <Download size={12} /> Export Video / Frame
              </button>
            </div>
          </div>

          {/* Timeline Range Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-bold text-slate-500 font-mono">1</span>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={activeFrameIndex}
              onChange={(e) => {
                setActiveFrameIndex(Number(e.target.value));
                if (isPlayingAnimation) setIsPlayingAnimation(false);
              }}
              className="w-full accent-[#00E1C5] cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
            />
            <span className="text-[9px] font-bold text-slate-500 font-mono">{frames.length}</span>
          </div>
        </div>
      )}

      {/* Extracted Keyframe Gallery */}
      {frames.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h5 className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Film size={13} className="text-[#00A896]" />
              Extracted Application Walkthrough Pages ({frames.length})
            </h5>
            <span className="text-[9px] font-bold text-slate-400 uppercase">
              Click to inspect any screen
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-[24vh] overflow-y-auto p-1 bg-slate-50 rounded-2xl border border-slate-200">
            {frames.map((f, i) => (
              <div
                key={i}
                onClick={() => {
                  setActiveFrameIndex(i);
                  onSelectImage(`${title} - Page ${i + 1} (${f.timestamp})`, f.image);
                }}
                className={`group cursor-pointer rounded-xl border p-1.5 transition-all space-y-1 shadow-xs ${
                  activeFrameIndex === i
                    ? 'border-[#00E1C5] bg-teal-50/60 ring-2 ring-[#00E1C5]/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-900">
                  <img src={f.image} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[8px] font-bold uppercase gap-1">
                    <Eye size={10} /> Full View
                  </div>
                </div>
                <div className="flex items-center justify-between px-0.5 text-[9px]">
                  <span className="font-bold text-slate-700">Page {i + 1}</span>
                  <span className="font-mono text-[#00A896] font-bold">{f.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const UITesting: React.FC<UITestingProps> = ({ project, user, onUpdateProject }) => {
  const [activeTab, setActiveTab] = useState<'testing' | 'figma_review' | 'comparison' | 'repository'>('testing');
  
  // Tab 1 (New Analysis) Modes
  const [appInputMode, setAppInputMode] = useState<'screenshot' | 'doc' | 'url' | 'video'>('screenshot');
  const [contrastByMode, setContrastByMode] = useState<{
    screenshot: boolean;
    doc: boolean;
    url: boolean;
    video: boolean;
  }>({
    screenshot: false,
    doc: false,
    url: false,
    video: false,
  });
  const checkColorContrast = contrastByMode[appInputMode] ?? false;
  const [isReportWithContrast, setIsReportWithContrast] = useState<boolean>(false);

  // Tab 2 (Figma Review) Modes
  const [figmaInputMode, setFigmaInputMode] = useState<'document' | 'screenshot' | 'url'>('screenshot');

  // Tab 3 (Comparison) Modes
  const [compFigmaMode, setCompFigmaMode] = useState<'doc' | 'screenshot' | 'url'>('screenshot');
  const [compAppMode, setCompAppMode] = useState<'screenshot' | 'doc' | 'url' | 'video'>('screenshot');

  // Company Standard Reference Input States (All 3 Modules)
  const [appCompanyStandards, setAppCompanyStandards] = useState<string>('');
  const [appStandardRequirement, setAppStandardRequirement] = useState<StandardRequirementData>({
    type: 'text',
    text: ''
  });

  const [figmaCompanyStandards, setFigmaCompanyStandards] = useState<string>('');
  const [figmaStandardRequirement, setFigmaStandardRequirement] = useState<StandardRequirementData>({
    type: 'text',
    text: ''
  });

  const [compCompanyStandards, setCompCompanyStandards] = useState<string>('');
  const [compStandardRequirement, setCompStandardRequirement] = useState<StandardRequirementData>({
    type: 'text',
    text: ''
  });

  // New Analysis State (Application UI Input)
  const [screenshots, setScreenshots] = useState<Array<string | UploadedImageItem>>([]);
  const [appVideos, setAppVideos] = useState<UploadedVideoItem[]>([]);
  const [appDocs, setAppDocs] = useState<UploadedDocItem[]>([]);
  const [appUrl, setAppUrl] = useState('');
  const [urlCaptureData, setUrlCaptureData] = useState<{
    url: string;
    screenshot: string;
    pageTitle: string;
    elements?: {
      title: string;
      headings: string[];
      buttons: string[];
      inputs: string[];
      textSnippets: string[];
    };
  } | null>(null);
  const [isCapturingUrl, setIsCapturingUrl] = useState(false);
  const [designLink, setDesignLink] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [highlightedScreenshots, setHighlightedScreenshots] = useState<string[]>([]);
  const [correctedReport, setCorrectedReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVideoSizeAlertOpen, setIsVideoSizeAlertOpen] = useState(false);
  const [oversizedVideoMB, setOversizedVideoMB] = useState<number | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const reportEndRef = useRef<HTMLDivElement>(null);

  // Figma Review State
  const [figmaImages, setFigmaImages] = useState<Array<string | UploadedImageItem>>([]);
  const [figmaDocs, setFigmaDocs] = useState<UploadedDocItem[]>([]);
  const [figmaUrl, setFigmaUrl] = useState('');
  const [figmaUrlCaptureData, setFigmaUrlCaptureData] = useState<{
    url: string;
    screenshot?: string;
    pageTitle: string;
    figmaEmbedUrl?: string;
  } | null>(null);
  const [isCapturingFigmaUrl, setIsCapturingFigmaUrl] = useState(false);
  const [isReviewingFigma, setIsReviewingFigma] = useState(false);
  const [isCorrectingFigma, setIsCorrectingFigma] = useState(false);
  const [figmaReviewReport, setFigmaReviewReport] = useState<string | null>(null);
  const [figmaCorrectedReport, setFigmaCorrectedReport] = useState<string | null>(null);
  const [figmaReviewError, setFigmaReviewError] = useState<string | null>(null);
  const figmaInputRef = useRef<HTMLInputElement>(null);
  const figmaDocInputRef = useRef<HTMLInputElement>(null);
  const [figmaSaveName, setFigmaSaveName] = useState('');
  const [figmaSaveFolderId, setFigmaSaveFolderId] = useState('');
  const [isFigmaSaved, setIsFigmaSaved] = useState(false);
  const [figmaAuditViewMode, setFigmaAuditViewMode] = useState<'issues' | 'visual_defects'>('issues');
  const [selectedFigmaScreenIndex, setSelectedFigmaScreenIndex] = useState<number>(-1);
  const [figmaContrastOutputs, setFigmaContrastOutputs] = useState<Array<{
    id: string;
    pageTitle: string;
    originalImage: string;
    issueHighlightedImage: string;
    issueHighlightedCount: number;
    visualDefectsImage: string;
    visualDefectsCount: number;
    correctedVisualDefectsImage?: string;
    correctedIssueImage?: string;
    activeMode?: 'issues' | 'visual_defects' | 'corrected';
    report?: string;
  }>>([]);
  const [figmaHighlightedScreenshots, setFigmaHighlightedScreenshots] = useState<string[]>([]);
  const [figmaVisualDefectsScreenshots, setFigmaVisualDefectsScreenshots] = useState<string[]>([]);

  // App vs Figma Comparison State
  const [compAppImages, setCompAppImages] = useState<Array<string | UploadedImageItem>>([]);
  const [compAppVideos, setCompAppVideos] = useState<UploadedVideoItem[]>([]);
  const [compAppDocs, setCompAppDocs] = useState<UploadedDocItem[]>([]);
  const [compAppUrl, setCompAppUrl] = useState('');

  const [compFigmaImages, setCompFigmaImages] = useState<Array<string | UploadedImageItem>>([]);
  const [compFigmaDocs, setCompFigmaDocs] = useState<UploadedDocItem[]>([]);
  const [compFigmaUrl, setCompFigmaUrl] = useState('');

  const [isComparing, setIsComparing] = useState(false);
  const [isResolvingComparison, setIsResolvingComparison] = useState(false);
  const [compReport, setCompReport] = useState<string | null>(null);
  const [compResolutionGuide, setCompResolutionGuide] = useState<string | null>(null);
  const [compError, setCompError] = useState<string | null>(null);
  const [compSaveName, setCompSaveName] = useState('');
  const [compSaveFolderId, setCompSaveFolderId] = useState('');
  const [isCompSaved, setIsCompSaved] = useState(false);
  const [compAuditViewMode, setCompAuditViewMode] = useState<'issues' | 'visual_defects'>('issues');
  const [selectedCompScreenIndex, setSelectedCompScreenIndex] = useState<number>(-1);
  const [compContrastOutputs, setCompContrastOutputs] = useState<Array<{
    id: string;
    pageTitle: string;
    figmaImage?: string;
    appImage?: string;
    issueHighlightedImage: string;
    issueHighlightedCount: number;
    visualDefectsImage: string;
    visualDefectsCount: number;
    correctedVisualDefectsImage?: string;
    correctedIssueImage?: string;
    activeMode?: 'issues' | 'visual_defects' | 'corrected';
    report?: string;
  }>>([]);
  const [compHighlightedScreenshots, setCompHighlightedScreenshots] = useState<string[]>([]);
  const [compVisualDefectsScreenshots, setCompVisualDefectsScreenshots] = useState<string[]>([]);

  const compAppInputRef = useRef<HTMLInputElement>(null);
  const compAppDocInputRef = useRef<HTMLInputElement>(null);
  const compAppVideoInputRef = useRef<HTMLInputElement>(null);
  const compFigmaInputRef = useRef<HTMLInputElement>(null);
  const compFigmaDocInputRef = useRef<HTMLInputElement>(null);

  // Previewer Modal State
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    type: 'image' | 'video' | 'document';
    title: string;
    url?: string;
    targetAppUrl?: string;
    content?: string;
    frames?: { timestamp: string; image: string }[];
    videoBlob?: any;
    dataUrl?: string;
  } | null>(null);

  // Folder & Repository State
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<UITestingFolder | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<UITestingFolder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [folderCreationTarget, setFolderCreationTarget] = useState<'app' | 'figma' | 'comp' | 'repo'>('repo');
  const [repoSearchQuery, setRepoSearchQuery] = useState('');
  const [repoModalTab, setRepoModalTab] = useState<'all' | 'outputs' | 'inputs'>('all');

  const [hydratedReports, setHydratedReports] = useState<UITestingReport[]>([]);
  const [hydratedFigmaReviews, setHydratedFigmaReviews] = useState<FigmaDesignReview[]>([]);
  const [hydratedComparisonReports, setHydratedComparisonReports] = useState<UIComparisonReport[]>([]);
  const [hydratedInputs, setHydratedInputs] = useState<UITestingInput[]>([]);

  const folders = project.uiTestingFolders || [];
  const rawSavedInputs = project.uiTestingInputs || [];
  const rawSavedReports = project.uiTestingReports || [];
  const rawSavedFigmaReviews = project.figmaDesignReviews || [];
  const rawSavedComparisonReports = project.uiComparisonReports || [];

  // Reactively merge raw saved reports with hydrated reports so newly saved items never disappear
  const savedReports = useMemo(() => {
    const map = new Map<string, UITestingReport>();
    (rawSavedReports || []).forEach(r => {
      if (r?.id) map.set(r.id, r);
    });
    (hydratedReports || []).forEach(r => {
      if (r?.id) {
        const existing = map.get(r.id);
        map.set(r.id, existing ? { ...existing, ...r } : r);
      }
    });
    return Array.from(map.values());
  }, [rawSavedReports, hydratedReports]);

  const savedFigmaReviews = useMemo(() => {
    const map = new Map<string, FigmaDesignReview>();
    (rawSavedFigmaReviews || []).forEach(f => {
      if (f?.id) map.set(f.id, f);
    });
    (hydratedFigmaReviews || []).forEach(f => {
      if (f?.id) {
        const existing = map.get(f.id);
        map.set(f.id, existing ? { ...existing, ...f } : f);
      }
    });
    return Array.from(map.values());
  }, [rawSavedFigmaReviews, hydratedFigmaReviews]);

  const savedComparisonReports = useMemo(() => {
    const map = new Map<string, UIComparisonReport>();
    (rawSavedComparisonReports || []).forEach(c => {
      if (c?.id) map.set(c.id, c);
    });
    (hydratedComparisonReports || []).forEach(c => {
      if (c?.id) {
        const existing = map.get(c.id);
        map.set(c.id, existing ? { ...existing, ...c } : c);
      }
    });
    return Array.from(map.values());
  }, [rawSavedComparisonReports, hydratedComparisonReports]);

  const savedInputs = useMemo(() => {
    const map = new Map<string, UITestingInput>();
    (rawSavedInputs || []).forEach(i => {
      if (i?.id) map.set(i.id, i);
    });
    (hydratedInputs || []).forEach(i => {
      if (i?.id) {
        const existing = map.get(i.id);
        map.set(i.id, existing ? { ...existing, ...i } : i);
      }
    });
    return Array.from(map.values());
  }, [rawSavedInputs, hydratedInputs]);

  // Reactively hydrate all reports and artifacts from IndexedDB and server filesystem without clobbering optimistic state
  useEffect(() => {
    let isCancelled = false;
    hydrateAllReports(
      rawSavedReports,
      rawSavedFigmaReviews,
      rawSavedComparisonReports,
      rawSavedInputs
    ).then(res => {
      if (!isCancelled && res) {
        setHydratedReports(prev => {
          const map = new Map<string, UITestingReport>();
          prev.forEach(r => { if (r?.id) map.set(r.id, r); });
          (res.hydratedReports || []).forEach(r => {
            if (r?.id) {
              const existing = map.get(r.id);
              map.set(r.id, existing ? { ...existing, ...r } : r);
            }
          });
          return Array.from(map.values());
        });

        setHydratedFigmaReviews(prev => {
          const map = new Map<string, FigmaDesignReview>();
          prev.forEach(f => { if (f?.id) map.set(f.id, f); });
          (res.hydratedReviews || []).forEach(f => {
            if (f?.id) {
              const existing = map.get(f.id);
              map.set(f.id, existing ? { ...existing, ...f } : f);
            }
          });
          return Array.from(map.values());
        });

        setHydratedComparisonReports(prev => {
          const map = new Map<string, UIComparisonReport>();
          prev.forEach(c => { if (c?.id) map.set(c.id, c); });
          (res.hydratedComparisons || []).forEach(c => {
            if (c?.id) {
              const existing = map.get(c.id);
              map.set(c.id, existing ? { ...existing, ...c } : c);
            }
          });
          return Array.from(map.values());
        });

        setHydratedInputs(prev => {
          const map = new Map<string, UITestingInput>();
          prev.forEach(i => { if (i?.id) map.set(i.id, i); });
          (res.hydratedInputs || []).forEach(i => {
            if (i?.id) {
              const existing = map.get(i.id);
              map.set(i.id, existing ? { ...existing, ...i } : i);
            }
          });
          return Array.from(map.values());
        });
      }
    }).catch(err => {
      console.warn('[UITesting] Error hydrating report artifacts:', err);
    });

    return () => {
      isCancelled = true;
    };
  }, [project.uiTestingReports, project.figmaDesignReviews, project.uiComparisonReports, project.uiTestingInputs]);

  // Additional App UI Review State
  const [correctedImage, setCorrectedImage] = useState<string | null>(null);
  const [correctedScreenshots, setCorrectedScreenshots] = useState<Array<{ id: string; pageTitle: string; originalImage: string; correctedImage: string }>>([]);
  const [isGeneratingCorrectedImage, setIsGeneratingCorrectedImage] = useState(false);
  const [appSaveName, setAppSaveName] = useState('');
  const [appSaveFolderId, setAppSaveFolderId] = useState('');
  const [isAppSaved, setIsAppSaved] = useState(false);
  const [isSavingAppReport, setIsSavingAppReport] = useState(false);
  const [isSavingFigmaReview, setIsSavingFigmaReview] = useState(false);
  const [isSavingComparison, setIsSavingComparison] = useState(false);
  const [comparisonStep, setComparisonStep] = useState<number>(1);
  const [repoCategoryTab, setRepoCategoryTab] = useState<'APP UI REVIEW' | 'FIGMA DESIGN REVIEW' | 'FIGMA VS COMPARISON'>('APP UI REVIEW');
  
  // Side-by-Side Dual Analysis Outputs (Issue-Highlighted WCAG Accessibility & Visual Layout Defects)
  const [appAuditViewMode, setAppAuditViewMode] = useState<'issues' | 'visual_defects'>('issues');
  const [selectedAppScreenIndex, setSelectedAppScreenIndex] = useState<number>(-1);
  const [contrastOutputs, setContrastOutputs] = useState<Array<{
    id: string;
    pageTitle: string;
    originalImage: string;
    issueHighlightedImage: string;
    issueHighlightedCount: number;
    visualDefectsImage: string;
    visualDefectsCount: number;
    correctedVisualDefectsImage?: string;
    correctedIssueImage?: string;
    activeMode?: 'issues' | 'visual_defects' | 'corrected';
    report?: string;
  }>>([]);
  const [visualDefectsScreenshots, setVisualDefectsScreenshots] = useState<string[]>([]);

  // Repository Selected Item Detail Viewer State
  const [selectedRepoItem, setSelectedRepoItem] = useState<{
    type: 'report' | 'figma' | 'comparison';
    item: any;
  } | null>(null);
  const [isEditingRepoItem, setIsEditingRepoItem] = useState(false);
  const [editedItemName, setEditedItemName] = useState('');
  const [editedItemContent, setEditedItemContent] = useState('');
  const [editedItemCorrected, setEditedItemCorrected] = useState('');
  const [editedItemStandards, setEditedItemStandards] = useState('');

  // Helper to extract the primary saved input image or fallback image for any repository item
  const getSavedInputImage = (item: any): string | null => {
    if (!item) return null;

    const extractString = (img: any): string | null => {
      if (!img) return null;
      if (typeof img === 'string' && img.trim().length > 0) return img.trim();
      if (typeof img === 'object') {
        if (img.data && typeof img.data === 'string' && img.data.trim().length > 0) return img.data.trim();
        if (img.dataUrl && typeof img.dataUrl === 'string' && img.dataUrl.trim().length > 0) return img.dataUrl.trim();
        if (img.originalImage && typeof img.originalImage === 'string' && img.originalImage.trim().length > 0) return img.originalImage.trim();
        if (img.image && typeof img.image === 'string' && img.image.trim().length > 0) return img.image.trim();
        if (img.url && typeof img.url === 'string' && img.url.trim().length > 0) return img.url.trim();
        if (img.downloadURL && typeof img.downloadURL === 'string' && img.downloadURL.trim().length > 0) return img.downloadURL.trim();
        if (img.src && typeof img.src === 'string' && img.src.trim().length > 0) return img.src.trim();
      }
      return null;
    };

    // 1. Check screenshots array
    if (Array.isArray(item.screenshots)) {
      for (const s of item.screenshots) {
        const res = extractString(s);
        if (res) return res;
      }
    }

    // 2. Check images array
    if (Array.isArray(item.images)) {
      for (const s of item.images) {
        const res = extractString(s);
        if (res) return res;
      }
    }

    // 3. Check appScreenshots array
    if (Array.isArray(item.appScreenshots)) {
      for (const s of item.appScreenshots) {
        const res = extractString(s);
        if (res) return res;
      }
    }

    // 4. Check figmaImages array
    if (Array.isArray(item.figmaImages)) {
      for (const s of item.figmaImages) {
        const res = extractString(s);
        if (res) return res;
      }
    }

    // 5. Check contrastOutputs array
    if (Array.isArray(item.contrastOutputs)) {
      for (const co of item.contrastOutputs) {
        if (co) {
          const res = extractString(co.originalImage) || extractString(co.issueHighlightedImage) || extractString(co.visualDefectsImage);
          if (res) return res;
        }
      }
    }

    // 6. Check correctedScreenshots array
    if (Array.isArray(item.correctedScreenshots)) {
      for (const cs of item.correctedScreenshots) {
        if (cs) {
          const res = extractString(cs.originalImage) || extractString(cs.correctedImage);
          if (res) return res;
        }
      }
    }

    // 7. Check video frames
    const videos = item.videos || item.appVideos;
    if (Array.isArray(videos)) {
      for (const v of videos) {
        if (v && Array.isArray(v.frames)) {
          for (const f of v.frames) {
            const res = extractString(f?.image || f?.dataUrl || f);
            if (res) return res;
          }
        }
      }
    }

    // 8. Check highlightedScreenshots or visualDefectsScreenshots
    if (Array.isArray(item.highlightedScreenshots)) {
      for (const s of item.highlightedScreenshots) {
        const res = extractString(s);
        if (res) return res;
      }
    }
    if (Array.isArray(item.visualDefectsScreenshots)) {
      for (const s of item.visualDefectsScreenshots) {
        const res = extractString(s);
        if (res) return res;
      }
    }

    // 9. Check correctedImage
    const corr = extractString(item.correctedImage);
    if (corr) return corr;

    // 10. Check saved documents
    const docs = item.docs || item.figmaDocs || item.appDocs;
    if (Array.isArray(docs) && docs.length > 0 && docs[0]?.name) {
      return createDocumentCanvasImage(docs[0].name, docs[0].content || '');
    }

    // 11. Check savedInputs in repository for matching folderId or item ID
    if (Array.isArray(savedInputs) && savedInputs.length > 0) {
      const match = savedInputs.find((inp: any) => 
        (inp.id && item.id && (inp.id === item.id || inp.id.includes(item.id) || item.id.includes(inp.id))) ||
        (item.folderId && inp.folderId === item.folderId && inp.appName === item.appName) ||
        (item.name && inp.name && (inp.name.includes(item.name) || item.name.includes(inp.name)))
      );
      if (match) {
        if (Array.isArray(match.screenshots)) {
          for (const s of match.screenshots) {
            const res = extractString(s);
            if (res) return res;
          }
        }
        if (Array.isArray(match.docs) && match.docs.length > 0 && match.docs[0]?.name) {
          return createDocumentCanvasImage(match.docs[0].name, match.docs[0].content || '');
        }
      }
    }

    // 12. Fallback: generate canvas image if target URL or figma URL exists
    const targetUrl = item.appUrl || item.figmaUrl || item.url || item.designLink;
    if (targetUrl && typeof targetUrl === 'string' && targetUrl.trim().length > 0) {
      return createUrlCanvasImage(targetUrl.trim());
    }

    return null;
  };

  // Tab Navigation: Each tab maintains complete isolation. Switching tabs clears inputs and outputs.
  const handleTabChange = (newTab: 'testing' | 'figma_review' | 'comparison' | 'repository') => {
    if (newTab === activeTab) return;

    // Reset Tab 1: App UI Review inputs and outputs
    setScreenshots([]);
    setAppVideos([]);
    setAppDocs([]);
    setAppUrl('');
    setUrlCaptureData(null);
    setIsCapturingUrl(false);
    setDesignLink('');
    setReport(null);
    setHighlightedScreenshots([]);
    setVisualDefectsScreenshots([]);
    setCorrectedReport(null);
    setCorrectedImage(null);
    setIsGeneratingCorrectedImage(false);
    setContrastOutputs([]);
    setIsReportWithContrast(false);
    setAppAuditViewMode('issues');
    setError(null);
    setIsAnalyzing(false);
    setIsCorrecting(false);
    setAppSaveName('');
    setAppSaveFolderId('');
    setIsAppSaved(false);

    // Reset Tab 2: Figma Design Review inputs and outputs
    setFigmaImages([]);
    setFigmaDocs([]);
    setFigmaUrl('');
    setFigmaUrlCaptureData(null);
    setIsCapturingFigmaUrl(false);
    setFigmaReviewReport(null);
    setFigmaCorrectedReport(null);
    setFigmaContrastOutputs([]);
    setFigmaHighlightedScreenshots([]);
    setFigmaVisualDefectsScreenshots([]);
    setFigmaAuditViewMode('issues');
    setFigmaReviewError(null);
    setIsReviewingFigma(false);
    setIsCorrectingFigma(false);
    setFigmaSaveName('');
    setFigmaSaveFolderId('');
    setIsFigmaSaved(false);

    // Reset Tab 3: Figma vs App UI Comparison inputs and outputs
    setCompAppImages([]);
    setCompAppVideos([]);
    setCompAppDocs([]);
    setCompAppUrl('');
    setCompFigmaImages([]);
    setCompFigmaDocs([]);
    setCompFigmaUrl('');
    setCompReport(null);
    setCompResolutionGuide(null);
    setCompContrastOutputs([]);
    setCompHighlightedScreenshots([]);
    setCompVisualDefectsScreenshots([]);
    setCompAuditViewMode('issues');
    setCompError(null);
    setIsComparing(false);
    setIsResolvingComparison(false);
    setComparisonStep(1);
    setCompSaveName('');
    setCompSaveFolderId('');
    setIsCompSaved(false);

    // Reset selection & preview modals
    setSelectedRepoItem(null);
    setPreviewModal(null);
    setActiveTab(newTab);
  };

  // Switch App UI Review Input Mode & Clear previous mode inputs and outputs
  const handleAppInputModeChange = (newMode: 'screenshot' | 'doc' | 'url' | 'video') => {
    if (newMode === appInputMode) return;
    setScreenshots([]);
    setAppVideos([]);
    setAppDocs([]);
    setAppUrl('');
    setUrlCaptureData(null);
    setIsCapturingUrl(false);
    setDesignLink('');
    setReport(null);
    setHighlightedScreenshots([]);
    setVisualDefectsScreenshots([]);
    setCorrectedReport(null);
    setCorrectedImage(null);
    setContrastOutputs([]);
    setIsReportWithContrast(false);
    setAppAuditViewMode('issues');
    setError(null);
    setIsAnalyzing(false);
    setIsCorrecting(false);
    setAppSaveName('');
    setAppSaveFolderId('');
    setIsAppSaved(false);
    setAppInputMode(newMode);
  };

  // Switch Figma Review Input Mode & Clear previous mode inputs and outputs
  const handleFigmaInputModeChange = (newMode: 'document' | 'screenshot' | 'url') => {
    if (newMode === figmaInputMode) return;
    setFigmaImages([]);
    setFigmaDocs([]);
    setFigmaUrl('');
    setFigmaUrlCaptureData(null);
    setIsCapturingFigmaUrl(false);
    setFigmaReviewReport(null);
    setFigmaCorrectedReport(null);
    setFigmaContrastOutputs([]);
    setFigmaHighlightedScreenshots([]);
    setFigmaVisualDefectsScreenshots([]);
    setFigmaAuditViewMode('issues');
    setFigmaReviewError(null);
    setIsReviewingFigma(false);
    setIsCorrectingFigma(false);
    setFigmaSaveName('');
    setFigmaSaveFolderId('');
    setIsFigmaSaved(false);
    setFigmaInputMode(newMode);
  };

  // Switch Comparison Figma Input Mode & Clear comparison inputs/outputs
  const handleCompFigmaModeChange = (newMode: 'doc' | 'screenshot' | 'url') => {
    if (newMode === compFigmaMode) return;
    setCompFigmaImages([]);
    setCompFigmaDocs([]);
    setCompFigmaUrl('');
    setCompReport(null);
    setCompResolutionGuide(null);
    setCompContrastOutputs([]);
    setCompHighlightedScreenshots([]);
    setCompVisualDefectsScreenshots([]);
    setCompError(null);
    setIsComparing(false);
    setIsResolvingComparison(false);
    setCompSaveName('');
    setCompSaveFolderId('');
    setIsCompSaved(false);
    setCompFigmaMode(newMode);
  };

  // Switch Comparison App Input Mode & Clear comparison inputs/outputs
  const handleCompAppModeChange = (newMode: 'screenshot' | 'doc' | 'url' | 'video') => {
    if (newMode === compAppMode) return;
    setCompAppImages([]);
    setCompAppVideos([]);
    setCompAppDocs([]);
    setCompAppUrl('');
    setCompReport(null);
    setCompResolutionGuide(null);
    setCompContrastOutputs([]);
    setCompHighlightedScreenshots([]);
    setCompVisualDefectsScreenshots([]);
    setCompError(null);
    setIsComparing(false);
    setIsResolvingComparison(false);
    setCompSaveName('');
    setCompSaveFolderId('');
    setIsCompSaved(false);
    setCompAppMode(newMode);
  };

  // File & Data Download Helpers
  const convertMarkdownToDocxHtml = (markdown: string, title = 'AutomatiQA UI Analysis Report'): string => {
    if (!markdown) return `<html><body><p>No content provided</p></body></html>`;

    let html = markdown;

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
      const cleanCode = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre><code>${cleanCode}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, (_, c) => `<code>${c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`);

    // Process Markdown Tables
    const lines = html.split('\n');
    const processedLines: string[] = [];
    let inTable = false;
    let tableHeaderDone = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('|') && line.endsWith('|')) {
        // Skip separator row (| :--- | :--- |)
        if (/^\|[\s:\-|-]+\|$/.test(line)) {
          tableHeaderDone = true;
          continue;
        }

        const cells = line.slice(1, -1).split('|').map(c => c.trim());

        if (!inTable) {
          inTable = true;
          tableHeaderDone = false;
          processedLines.push('<table border="1" cellspacing="0" cellpadding="6"><thead><tr>');
          cells.forEach(cell => {
            const formattedCell = cell
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>');
            processedLines.push(`<th>${formattedCell}</th>`);
          });
          processedLines.push('</tr></thead><tbody>');
        } else if (!tableHeaderDone) {
          processedLines.push('<tr>');
          cells.forEach(cell => {
            const formattedCell = cell
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>');
            processedLines.push(`<th>${formattedCell}</th>`);
          });
          processedLines.push('</tr>');
        } else {
          processedLines.push('<tr>');
          cells.forEach(cell => {
            let cellContent = cell
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>');

            if (/\b(PASS|PASSED|RESOLUTION_PASSED)\b/i.test(cellContent)) {
              cellContent = cellContent.replace(/\b(PASS|PASSED|RESOLUTION_PASSED)\b/gi, '<span style="color:#15803d; font-weight:bold;">$1</span>');
            }
            if (/\b(FAIL|FAILED|DEFECT|CRITICAL|HIGH)\b/i.test(cellContent)) {
              cellContent = cellContent.replace(/\b(FAIL|FAILED|DEFECT|CRITICAL|HIGH)\b/gi, '<span style="color:#b91c1c; font-weight:bold;">$1</span>');
            }
            processedLines.push(`<td>${cellContent}</td>`);
          });
          processedLines.push('</tr>');
        }
      } else {
        if (inTable) {
          inTable = false;
          tableHeaderDone = false;
          processedLines.push('</tbody></table>');
        }
        processedLines.push(lines[i]);
      }
    }
    if (inTable) {
      processedLines.push('</tbody></table>');
    }

    html = processedLines.join('\n');

    // Headers
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Horizontal Rule
    html = html.replace(/^---$/gim, '<hr/>');

    // Bold & Italic
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Unordered lists
    html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\n<ul>/g, '\n');

    // Ordered lists
    html = html.replace(/^\s*\d+\.\s+(.*$)/gim, '<ol><li>$1</li></ol>');
    html = html.replace(/<\/ol>\n<ol>/g, '\n');

    // Blockquotes
    html = html.replace(/^\>\s+(.*$)/gim, '<blockquote>$1</blockquote>');

    // Paragraphs
    const paragraphs = html.split('\n\n').map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<table') || p.startsWith('<pre') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<blockquote') || p.startsWith('<hr')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
    }).filter(Boolean);

    const bodyHtml = paragraphs.join('\n');

    return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>${title}</title>
<!--[if gte mso 9]>
<xml>
 <w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForCustomXSL/>
 </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page {
    size: 8.5in 11in;
    margin: 1.0in;
  }
  body {
    font-family: 'Calibri', 'Segoe UI', Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #0f172a;
    background-color: #ffffff;
  }
  h1 {
    font-size: 18pt;
    font-weight: bold;
    color: #0f172a;
    border-bottom: 2pt solid #00E1C5;
    padding-bottom: 4pt;
    margin-top: 18pt;
    margin-bottom: 10pt;
  }
  h2 {
    font-size: 14pt;
    font-weight: bold;
    color: #0369a1;
    border-bottom: 1pt solid #cbd5e1;
    padding-bottom: 3pt;
    margin-top: 14pt;
    margin-bottom: 8pt;
  }
  h3 {
    font-size: 12pt;
    font-weight: bold;
    color: #334155;
    margin-top: 12pt;
    margin-bottom: 6pt;
  }
  h4 {
    font-size: 11pt;
    font-weight: bold;
    color: #475569;
    margin-top: 10pt;
    margin-bottom: 4pt;
  }
  p {
    margin-top: 0;
    margin-bottom: 8pt;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-top: 10pt;
    margin-bottom: 14pt;
  }
  th {
    background-color: #f1f5f9;
    color: #0f172a;
    font-weight: bold;
    font-size: 10pt;
    border: 1pt solid #94a3b8;
    padding: 6pt 8pt;
    text-align: left;
  }
  td {
    font-size: 10pt;
    border: 1pt solid #cbd5e1;
    padding: 6pt 8pt;
    vertical-align: top;
  }
  tr:nth-child(even) td {
    background-color: #f8fafc;
  }
  code {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 9.5pt;
    background-color: #f1f5f9;
    color: #0284c7;
    padding: 1pt 4pt;
  }
  pre {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 9.5pt;
    background-color: #f8fafc;
    border: 1pt solid #e2e8f0;
    padding: 8pt;
    margin-top: 6pt;
    margin-bottom: 10pt;
    white-space: pre-wrap;
  }
  ul, ol {
    margin-top: 0;
    margin-bottom: 8pt;
    padding-left: 20pt;
  }
  li {
    margin-bottom: 3pt;
  }
  blockquote {
    border-left: 3pt solid #00E1C5;
    padding-left: 8pt;
    margin-left: 0;
    margin-right: 0;
    color: #475569;
    font-style: italic;
    background-color: #f8fafc;
    padding-top: 4pt;
    padding-bottom: 4pt;
  }
  hr {
    border: none;
    border-top: 1pt solid #cbd5e1;
    margin: 14pt 0;
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
  };

  const downloadDocx = async (content: string, filename: string) => {
    const ok = await deductExportCredits(project?.id || 'proj-default', 'ui_testing', user, `Download ${filename}`, project?.name);
    if (!ok) return;

    const docxFilename = filename.endsWith('.docx') ? filename : filename.replace(/\.[^/.]+$/, "") + '.docx';
    const htmlDoc = convertMarkdownToDocxHtml(content, docxFilename.replace('.docx', ''));

    const blob = new Blob(['\ufeff', htmlDoc], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = docxFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadFile = async (content: string, filename: string, mimeType = 'text/plain') => {
    const ok = await deductExportCredits(project?.id || 'proj-default', 'ui_testing', user, `Download ${filename}`, project?.name);
    if (!ok) return;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadDataUrl = async (dataUrl: string, filename: string) => {
    const ok = await deductExportCredits(project?.id || 'proj-default', 'ui_testing', user, `Download ${filename}`, project?.name);
    if (!ok) return;

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const createDocumentCanvasImage = (docName: string, docText: string): string => {
    const canvas = document.createElement('canvas');
    const width = 960;
    const height = 600;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    const margin = 30;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(margin, margin, width - margin * 2, height - margin * 2);

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(`📄 DOCUMENT SPECIFICATION: ${docName}`, margin + 24, margin + 40);

    ctx.strokeStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.moveTo(margin + 24, margin + 55);
    ctx.lineTo(width - margin - 24, margin + 55);
    ctx.stroke();

    ctx.fillStyle = '#334155';
    ctx.font = '12px sans-serif';
    const lines = (docText || 'Document Requirement Specification Content').split('\n');
    let y = margin + 80;
    lines.slice(0, 18).forEach((line) => {
      if (y < height - margin - 30) {
        ctx.fillText(line.slice(0, 95), margin + 24, y);
        y += 20;
      }
    });

    return canvas.toDataURL('image/jpeg', 0.75);
  };

  const captureAppUrl = async (targetUrl: string) => {
    if (!targetUrl || !targetUrl.trim()) return null;
    setIsCapturingUrl(true);
    try {
      let captureObj: any = null;
      try {
        const res = await fetch('/api/capture-url-ui', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl.trim() })
        });
        const data = await res.json();
        if (data && (data.success || data.url)) {
          captureObj = {
            url: data.url || targetUrl.trim(),
            screenshot: data.screenshot || null,
            pageTitle: data.pageTitle || targetUrl.trim(),
            elements: data.elements
          };
        }
      } catch (e) {
        console.warn('Backend URL UI capture endpoint note, generating fallback canvas preview:', e);
      }

      const screenshot = captureObj?.screenshot || createUrlCanvasImage(targetUrl.trim(), captureObj);
      const finalCapture = {
        url: captureObj?.url || targetUrl.trim(),
        screenshot,
        pageTitle: captureObj?.pageTitle || targetUrl.trim(),
        elements: captureObj?.elements || {
          headings: ['Target Application Dashboard'],
          buttons: ['Get Started', 'Sign In'],
          inputs: ['Email Address', 'Password'],
          textSnippets: [`Live Captured Web UI from ${targetUrl.trim()}`]
        }
      };

      setUrlCaptureData(finalCapture);
      return finalCapture;
    } catch (e) {
      console.error('Failed to capture URL UI:', e);
      return null;
    } finally {
      setIsCapturingUrl(false);
    }
  };

  const captureFigmaUrl = async (targetUrl: string) => {
    if (!targetUrl || !targetUrl.trim()) return null;
    const cleanUrl = targetUrl.trim();
    setIsCapturingFigmaUrl(true);

    let pageTitle = "Figma Design Specification";
    if (cleanUrl.includes("figma.com/file/") || cleanUrl.includes("figma.com/design/")) {
      const parts = cleanUrl.split("/");
      const namePart = parts[parts.length - 1]?.split("?")[0];
      if (namePart) pageTitle = `Figma Design: ${decodeURIComponent(namePart).replace(/[-_]/g, ' ')}`;
    }

    const fallbackCapture = {
      url: cleanUrl,
      screenshot: null,
      pageTitle,
      figmaEmbedUrl: `https://www.figma.com/embed?embed_host=automatiqa&url=${encodeURIComponent(cleanUrl)}`
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('/api/capture-figma-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      const data = await res.json();
      if (data && (data.success || data.url)) {
        const captureObj = {
          url: data.url || cleanUrl,
          screenshot: data.screenshot || null,
          pageTitle: data.pageTitle || pageTitle,
          figmaEmbedUrl: data.figmaEmbedUrl || fallbackCapture.figmaEmbedUrl
        };
        setFigmaUrlCaptureData(captureObj);
        return captureObj;
      }
      setFigmaUrlCaptureData(fallbackCapture);
      return fallbackCapture;
    } catch (e) {
      console.warn('Failed or timed out capturing Figma URL, using fallback capture:', e);
      setFigmaUrlCaptureData(fallbackCapture);
      return fallbackCapture;
    } finally {
      setIsCapturingFigmaUrl(false);
    }
  };

  const createUrlCanvasImage = (
    targetUrl: string, 
    captured?: { screenshot?: string; pageTitle?: string; elements?: any } | null
  ): string => {
    if (captured?.screenshot) {
      return captured.screenshot;
    }
    if (urlCaptureData?.screenshot && (urlCaptureData.url === targetUrl || targetUrl.includes(urlCaptureData.url) || urlCaptureData.url.includes(targetUrl))) {
      return urlCaptureData.screenshot;
    }
    if (figmaUrlCaptureData?.screenshot && (figmaUrlCaptureData.url === targetUrl || targetUrl.includes(figmaUrlCaptureData.url) || figmaUrlCaptureData.url.includes(targetUrl))) {
      return figmaUrlCaptureData.screenshot;
    }

    const canvas = document.createElement('canvas');
    const width = 960;
    const height = 600;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const title = captured?.pageTitle || urlCaptureData?.pageTitle || targetUrl;
    const headings = captured?.elements?.headings || urlCaptureData?.elements?.headings || [];
    const buttons = captured?.elements?.buttons || urlCaptureData?.elements?.buttons || [];
    const inputs = captured?.elements?.inputs || urlCaptureData?.elements?.inputs || [];
    const textSnippets = captured?.elements?.textSnippets || urlCaptureData?.elements?.textSnippets || [];

    // Browser Chrome bar
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, 0, width, 40);

    ctx.fillStyle = '#EF4444'; ctx.beginPath(); ctx.arc(16, 20, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F59E0B'; ctx.beginPath(); ctx.arc(30, 20, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#10B981'; ctx.beginPath(); ctx.arc(44, 20, 5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(65, 8, width - 85, 24);
    ctx.fillStyle = '#94A3B8';
    ctx.font = '11px monospace';
    ctx.fillText(`🔒 ${targetUrl || 'https://app.example.com'}`, 75, 24);

    // Background
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 40, width, height - 40);

    // Navbar / Header
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 40, width, 50);
    ctx.strokeStyle = '#E2E8F0';
    ctx.strokeRect(0, 40, width, 50);

    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText((title || 'TARGET APPLICATION UI').slice(0, 45).toUpperCase(), 30, 72);

    // Main Content Container
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(30, 110, width - 60, height - 140);
    ctx.strokeStyle = '#E2E8F0';
    ctx.strokeRect(30, 110, width - 60, height - 140);

    // Heading
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 20px sans-serif';
    const mainHeading = headings[0] || title || 'Target Application Page';
    ctx.fillText(mainHeading.slice(0, 55), 50, 155);

    // Subtitle / Text snippet
    ctx.fillStyle = '#64748B';
    ctx.font = '12px sans-serif';
    const subText = textSnippets[0] || headings[1] || `Live Application UI at ${targetUrl}`;
    ctx.fillText(subText.slice(0, 80), 50, 185);

    // Form Inputs if present
    let curY = 215;
    if (inputs.length > 0) {
      inputs.slice(0, 2).forEach((inp: string) => {
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(50, curY, 300, 36);
        ctx.strokeStyle = '#CBD5E1';
        ctx.strokeRect(50, curY, 300, 36);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '11px sans-serif';
        ctx.fillText(inp.slice(0, 30), 62, curY + 22);
        curY += 50;
      });
    }

    // Buttons if present
    let btnX = 50;
    if (buttons.length > 0) {
      buttons.slice(0, 2).forEach((btnText: string, i: number) => {
        ctx.fillStyle = i === 0 ? '#00E1C5' : '#0F172A';
        ctx.fillRect(btnX, curY + 5, 150, 38);
        ctx.fillStyle = i === 0 ? '#0F172A' : '#FFFFFF';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(btnText.slice(0, 18), btnX + 20, curY + 28);
        btnX += 165;
      });
    } else {
      ctx.fillStyle = '#00E1C5';
      ctx.fillRect(50, curY + 5, 150, 38);
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Submit Action', 80, curY + 28);
    }

    return canvas.toDataURL('image/jpeg', 0.75);
  };

  // Types for Page-Specific Defects and Canvas Highlights
  interface UIDefectItem {
    id: number;
    category: 'spelling' | 'alignment' | 'missing' | 'contrast' | 'typography' | 'ui';
    component: string;
    detail: string;
    severity: string;
    fix?: string;
    expected?: string;
    actual?: string;
    region?: 'header' | 'top' | 'middle-left' | 'middle-right' | 'center' | 'bottom-left' | 'bottom-right' | 'footer';
    coordinates?: { xPct: number; yPct: number; wPct?: number; hPct?: number } | null;
    isCorrected?: boolean;
  }

  // Helper: Robust parser to extract visual coordinates and clean component text from LLM defect output
  const parseCoordinatesAndClean = (
    text: string
  ): {
    cleanText: string;
    coords: { xPct: number; yPct: number; wPct: number; hPct: number } | null;
  } => {
    if (!text) return { cleanText: text || '', coords: null };

    let coords: { xPct: number; yPct: number; wPct: number; hPct: number } | null = null;
    let cleanText = text;

    // 1. Look for explicit Location pattern: (Location: [X%, Y%, W%, H%]) or [Location: ...] or (Location: X%, Y%)
    const locPattern = /(?:\(|\[)?\s*location:\s*(?:\[|\()?([^\)\]]+)(?:\)|\])?(?:\)|\])?/i;
    const locMatch = text.match(locPattern);
    if (locMatch) {
      const inner = locMatch[1];
      const nums = inner.match(/(\d+(?:\.\d+)?)\s*%/g);
      if (nums && nums.length >= 2) {
        const xPct = parseFloat(nums[0]);
        const yPct = parseFloat(nums[1]);
        const wPct = nums[2] ? parseFloat(nums[2]) : 18;
        const hPct = nums[3] ? parseFloat(nums[3]) : 5;
        coords = { xPct, yPct, wPct, hPct };
        cleanText = text.replace(locMatch[0], '').replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').trim();
      }
    }

    // 2. Normalized 0-1000 box: [ymin, xmin, ymax, xmax]
    if (!coords) {
      const boxMatch = text.match(/\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/);
      if (boxMatch) {
        const v1 = parseFloat(boxMatch[1]);
        const v2 = parseFloat(boxMatch[2]);
        const v3 = parseFloat(boxMatch[3]);
        const v4 = parseFloat(boxMatch[4]);
        const scale = Math.max(v1, v2, v3, v4) > 100 ? 10 : 1;
        const ymin = v1 / scale;
        const xmin = v2 / scale;
        const ymax = v3 / scale;
        const xmax = v4 / scale;
        coords = {
          xPct: Math.min(xmin, xmax),
          yPct: Math.min(ymin, ymax),
          wPct: Math.max(6, Math.abs(xmax - xmin)),
          hPct: Math.max(3, Math.abs(ymax - ymin))
        };
        cleanText = text.replace(boxMatch[0], '').trim();
      }
    }

    // 3. Generic percentage coordinates: [15%, 25%, 30%, 6%] or [15%, 25%]
    if (!coords) {
      const genPctMatch = text.match(/\[?\s*(\d+(?:\.\d+)?)\s*%\s*,\s*(\d+(?:\.\d+)?)\s*%(?:\s*,\s*(\d+(?:\.\d+)?)\s*%\s*,\s*(\d+(?:\.\d+)?)\s*%)?\s*\]?/);
      if (genPctMatch) {
        coords = {
          xPct: parseFloat(genPctMatch[1]),
          yPct: parseFloat(genPctMatch[2]),
          wPct: genPctMatch[3] ? parseFloat(genPctMatch[3]) : 18,
          hPct: genPctMatch[4] ? parseFloat(genPctMatch[4]) : 5
        };
        cleanText = text.replace(genPctMatch[0], '').replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').trim();
      }
    }

    // Clean remaining trailing colons, brackets, or markdown formatting
    cleanText = cleanText
      .replace(/^[\[\(]+|[\]\)]+$/g, '')
      .replace(/^[:\-–—\s]+|[:\-–—\s]+$/g, '')
      .replace(/[*_~`]/g, '')
      .trim();

    return { cleanText, coords };
  };

  // Helper: Categorize defect type into spelling, alignment, missing text/element, contrast, typography, or general UI defect
  const categorizeDefect = (text: string, component: string = ''): 'spelling' | 'alignment' | 'missing' | 'contrast' | 'typography' | 'ui' => {
    const combined = `${component} ${text}`.toLowerCase();
    if (combined.includes('spelling') || combined.includes('typo') || combined.includes('grammar') || combined.includes('misspell') || combined.includes('~~') || combined.includes('spelt') || combined.includes('copy error')) {
      return 'spelling';
    }
    if (combined.includes('missing') || combined.includes('omitted') || combined.includes('absent') || combined.includes('unmapped') || combined.includes('not found') || combined.includes('no label') || combined.includes('missing text') || combined.includes('missing icon')) {
      return 'missing';
    }
    if (
      combined.includes('color contrast') ||
      combined.includes('contrast') ||
      combined.includes('contrast ratio') ||
      combined.includes('color ratio') ||
      combined.includes('fail aa') ||
      combined.includes('pass aa') ||
      /\b\d+(?:\.\d+)?:\s*1\b/.test(combined) ||
      ((combined.includes('wcag') || combined.includes('luminance')) && (combined.includes('color') || combined.includes('ratio') || combined.includes('background') || combined.includes('foreground') || combined.includes('text')))
    ) {
      return 'contrast';
    }
    if (combined.includes('font') || combined.includes('typography') || combined.includes('hierarchy') || combined.includes('line-height') || combined.includes('weight') || combined.includes('font size') || combined.includes('letter spacing')) {
      return 'typography';
    }
    if (combined.includes('align') || combined.includes('margin') || combined.includes('padding') || combined.includes('spacing') || combined.includes('grid') || combined.includes('offset') || combined.includes('overlap') || combined.includes('indent') || combined.includes('gap')) {
      return 'alignment';
    }
    return 'ui';
  };

  // Helper: Check whether an item is specifically a color contrast defect to prevent mingling with visual defects
  const isContrastDefectItem = (item: { category?: string; component?: string; detail?: string }): boolean => {
    if (item.category === 'contrast') return true;
    const combined = `${item.component || ''} ${item.detail || ''}`.toLowerCase();
    return (
      combined.includes('contrast') ||
      combined.includes('color contrast') ||
      combined.includes('contrast ratio') ||
      combined.includes('color ratio') ||
      combined.includes('fail aa') ||
      combined.includes('pass aa') ||
      combined.includes('wcag contrast') ||
      /\b\d+(?:\.\d+)?:\s*1\b/.test(combined) ||
      ((combined.includes('wcag') || combined.includes('luminance')) && (combined.includes('color') || combined.includes('ratio') || combined.includes('background') || combined.includes('foreground') || combined.includes('text')))
    );
  };

  // Helper: Assign smart canvas region based on component name, detail, and explicit location hints
  const assignDefectRegion = (component: string, detail: string, index: number): 'header' | 'top' | 'middle-left' | 'middle-right' | 'center' | 'bottom-left' | 'bottom-right' | 'footer' => {
    const combined = `${component} ${detail}`.toLowerCase();

    // 1. Check for explicit location tags or bracket annotations
    if (combined.includes('bottom-right') || combined.includes('bottom right') || combined.includes('lower-right') || combined.includes('lower right')) {
      return 'bottom-right';
    }
    if (combined.includes('bottom-left') || combined.includes('bottom left') || combined.includes('lower-left') || combined.includes('lower left')) {
      return 'bottom-left';
    }
    if (combined.includes('top-left') || combined.includes('top left') || combined.includes('upper-left') || combined.includes('upper left')) {
      return 'header';
    }
    if (combined.includes('top-right') || combined.includes('top right') || combined.includes('upper-right') || combined.includes('upper right')) {
      return 'top';
    }
    if (combined.includes('center-right') || combined.includes('center right') || combined.includes('middle-right') || combined.includes('middle right') || combined.includes('right panel') || combined.includes('right-hand')) {
      return 'middle-right';
    }
    if (combined.includes('center-left') || combined.includes('center left') || combined.includes('middle-left') || combined.includes('middle left') || combined.includes('left panel') || combined.includes('left-hand')) {
      return 'middle-left';
    }

    // 2. Specific Semantic UI Components
    if (combined.includes('create free account') || combined.includes('new to spectrum') || combined.includes('signup link') || combined.includes('register link') || combined.includes('sign up link')) {
      return 'bottom-right';
    }
    if (combined.includes('tax ab aasan') || combined.includes('character') || combined.includes('mascot') || combined.includes('spokesperson') || combined.includes('sticker') || combined.includes('pointing')) {
      return 'bottom-left';
    }
    if (combined.includes('login card') || combined.includes('login form') || combined.includes('login container') || combined.includes('welcome back') || combined.includes('mobile number') || combined.includes('password') || combined.includes('login to dashboard')) {
      return 'middle-right';
    }
    if (combined.includes('all your tax compliance') || combined.includes('one secure platform') || combined.includes('hero tagline') || combined.includes('headline') || combined.includes('gst filing') || combined.includes('tds returns') || combined.includes('auto-reconciliation')) {
      return 'middle-left';
    }
    if (combined.includes('header') || combined.includes('navbar') || combined.includes('logo') || combined.includes('brand') || combined.includes('nav') || combined.includes('breadcrumb') || combined.includes('top bar') || combined.includes('app bar') || combined.includes('spectrum cloud')) {
      return 'header';
    }
    if (combined.includes('search') || combined.includes('filter') || combined.includes('sub-header') || combined.includes('banner') || combined.includes('hero')) {
      return 'top';
    }
    if (combined.includes('input') || combined.includes('form') || combined.includes('field') || combined.includes('email') || combined.includes('sidebar') || combined.includes('label') || combined.includes('checkbox') || combined.includes('dropdown')) {
      return 'middle-left';
    }
    if (combined.includes('card') || combined.includes('table') || combined.includes('chart') || combined.includes('grid') || combined.includes('data') || combined.includes('image') || combined.includes('panel') || combined.includes('item') || combined.includes('metric')) {
      return 'middle-right';
    }
    if (combined.includes('button') || combined.includes('cta') || combined.includes('submit') || combined.includes('action') || combined.includes('save') || combined.includes('confirm') || combined.includes('next') || combined.includes('checkout')) {
      return 'bottom-right';
    }
    if (combined.includes('footer') || combined.includes('copyright') || combined.includes('terms') || combined.includes('privacy') || combined.includes('bottom bar') || combined.includes('legal')) {
      return 'footer';
    }

    const fallbackRegions: Array<'middle-left' | 'middle-right' | 'top' | 'bottom-right' | 'center' | 'bottom-left'> = [
      'middle-left', 'middle-right', 'top', 'bottom-right', 'center', 'bottom-left'
    ];
    return fallbackRegions[index % fallbackRegions.length];
  };

  // Helper: Draw rounded rectangle path on canvas
  const drawCanvasRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number
  ) => {
    const r = Math.max(1, Math.min(radius, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // Helper: Resolve high-precision element coordinates and pinpoint target points
  const resolveDefectGeometry = (
    component: string = '',
    detail: string = '',
    region: string = 'center',
    index: number = 0,
    totalIssues: number = 1,
    width: number,
    height: number,
    explicitCoords?: { xPct: number; yPct: number; wPct?: number; hPct?: number } | null
  ) => {
    // 0. EXPLICIT COORDINATES RESOLVER (Highest Precision & Direct Image Pinpointing)
    const parsedComp = parseCoordinatesAndClean(component);
    const parsedDetail = parseCoordinatesAndClean(detail);
    const coords = explicitCoords || parsedComp.coords || parsedDetail.coords;

    if (coords && typeof coords.xPct === 'number' && typeof coords.yPct === 'number') {
      const xPct = Math.max(1, Math.min(95, coords.xPct));
      const yPct = Math.max(1, Math.min(95, coords.yPct));
      const wPct = Math.max(3, Math.min(90, coords.wPct || 18));
      const hPct = Math.max(2, Math.min(50, coords.hPct || 5));

      const boxX = Math.min(width - 40, Math.max(8, Math.round((xPct / 100) * width)));
      const boxY = Math.min(height - 24, Math.max(8, Math.round((yPct / 100) * height)));
      const boxW = Math.max(36, Math.min(Math.round((wPct / 100) * width), width - boxX - 8));
      const boxH = Math.max(18, Math.min(Math.round((hPct / 100) * height), height - boxY - 8));
      const targetX = Math.round(boxX + boxW / 2);
      const targetY = Math.round(boxY + boxH / 2);
      return { targetX, targetY, boxX, boxY, boxW, boxH };
    }

    const combined = `${component} ${detail}`.toLowerCase();
    let targetX = 0;
    let targetY = 0;
    let boxX = 0;
    let boxY = 0;
    let boxW = 0;
    let boxH = 0;

    // Compact box dimensions relative to canvas
    const smallW = Math.max(70, Math.min(Math.round(width * 0.15), 150));
    const smallH = Math.max(22, Math.min(Math.round(height * 0.04), 32));
    const medW = Math.max(90, Math.min(Math.round(width * 0.20), 180));
    const medH = Math.max(26, Math.min(Math.round(height * 0.05), 38));

    // Directional Quadrants in text description
    if (combined.includes('top-left') || combined.includes('upper-left')) {
      boxW = medW;
      boxH = smallH;
      boxX = Math.round(width * 0.08);
      boxY = Math.round(height * (0.04 + (index % 2) * 0.04));
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    } else if (combined.includes('top-right') || combined.includes('upper-right')) {
      boxW = medW;
      boxH = smallH;
      boxX = Math.round(width * 0.72);
      boxY = Math.round(height * (0.04 + (index % 2) * 0.04));
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    } else if (combined.includes('top-center') || combined.includes('upper-center')) {
      boxW = medW;
      boxH = smallH;
      boxX = Math.round(width * 0.40);
      boxY = Math.round(height * 0.04);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    } else if (combined.includes('bottom-left') || combined.includes('lower-left')) {
      boxW = medW;
      boxH = smallH;
      boxX = Math.round(width * 0.12);
      boxY = Math.round(height * 0.82);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    } else if (combined.includes('bottom-right') || combined.includes('lower-right')) {
      boxW = medW;
      boxH = smallH;
      boxX = Math.round(width * 0.65);
      boxY = Math.round(height * 0.84);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    } else if (combined.includes('bottom-center') || combined.includes('lower-center')) {
      boxW = medW;
      boxH = smallH;
      boxX = Math.round(width * 0.38);
      boxY = Math.round(height * 0.88);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 1. Footer "Create Free Account" / "New to Spectrum Cloud?" / Signup Links under login form
    else if (
      combined.includes('create free account') ||
      combined.includes('new to spectrum') ||
      combined.includes('signup link') ||
      combined.includes('register link') ||
      (combined.includes('footer') && (combined.includes('account') || combined.includes('create') || combined.includes('sign')))
    ) {
      boxW = Math.max(140, Math.min(Math.round(width * 0.35), 360));
      boxH = Math.max(22, Math.min(Math.round(height * 0.038), 34));
      boxX = Math.round(width * 0.52);
      boxY = Math.round(height * 0.84);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 2. Character Mascot / "Tax Ab Aasan Hai Boss!" / Bottom Left Badge
    else if (
      combined.includes('tax ab aasan') ||
      combined.includes('character') ||
      combined.includes('mascot') ||
      combined.includes('spokesperson') ||
      combined.includes('sticker') ||
      combined.includes('pointing')
    ) {
      boxW = Math.max(60, Math.min(Math.round(width * 0.075), 100));
      boxH = Math.max(60, Math.min(Math.round(height * 0.16), 140));
      boxX = Math.round(width * 0.22);
      boxY = Math.round(height * 0.68);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 3. Right-hand Login Card Container / Alignment / Uneven Bottom Margin
    else if (
      combined.includes('login card') ||
      combined.includes('right-hand login') ||
      combined.includes('login container') ||
      combined.includes('card alignment') ||
      combined.includes('extends below') ||
      combined.includes('uneven bottom')
    ) {
      boxW = Math.max(200, Math.min(Math.round(width * 0.38), 420));
      boxH = Math.max(260, Math.min(Math.round(height * 0.54), 520));
      boxX = Math.round(width * 0.50);
      boxY = Math.round(height * 0.30);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 4. Left Hero Headline & Main Tagline ("All your tax compliance. One secure platform.")
    else if (
      combined.includes('all your tax compliance') ||
      combined.includes('one secure platform') ||
      combined.includes('hero tagline') ||
      combined.includes('hero headline') ||
      combined.includes('main tagline')
    ) {
      boxW = Math.max(160, Math.min(Math.round(width * 0.25), 320));
      boxH = Math.max(40, Math.min(Math.round(height * 0.075), 75));
      boxX = Math.round(width * 0.22);
      boxY = Math.round(height * 0.35);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 5. Left Feature Bullet Points (GST filing, TDS returns, Auto-reconciliation, ERP, etc.)
    else if (
      combined.includes('gst filing') ||
      combined.includes('tds returns') ||
      combined.includes('auto-reconciliation') ||
      combined.includes('erp integration') ||
      combined.includes('download reports') ||
      combined.includes('track notices') ||
      combined.includes('feature list') ||
      combined.includes('bullet points')
    ) {
      boxW = Math.max(140, Math.min(Math.round(width * 0.24), 280));
      boxH = Math.max(20, Math.min(Math.round(height * 0.035), 32));
      const rowOffset = (index % 5) * 0.042;
      boxX = Math.round(width * 0.23);
      boxY = Math.round(height * (0.45 + rowOffset));
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 6. Login Form Heading ("Welcome back to Spectrum Cloud")
    else if (
      combined.includes('welcome back') ||
      combined.includes('login heading') ||
      combined.includes('welcome back to spectrum')
    ) {
      boxW = Math.max(160, Math.min(Math.round(width * 0.34), 360));
      boxH = Math.max(24, Math.min(Math.round(height * 0.045), 40));
      boxX = Math.round(width * 0.52);
      boxY = Math.round(height * 0.38);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 7. Login Form Subtitle ("Access your GST, TDS & ITR dashboard in seconds")
    else if (
      combined.includes('access your gst') ||
      combined.includes('dashboard in seconds') ||
      combined.includes('login subtitle')
    ) {
      boxW = Math.max(140, Math.min(Math.round(width * 0.32), 340));
      boxH = Math.max(18, Math.min(Math.round(height * 0.032), 30));
      boxX = Math.round(width * 0.52);
      boxY = Math.round(height * 0.43);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 8. Mobile Number Input Field / Phone
    else if (
      combined.includes('mobile number') ||
      combined.includes('enter mobile') ||
      combined.includes('phone') ||
      combined.includes('+91')
    ) {
      boxW = Math.max(160, Math.min(Math.round(width * 0.34), 360));
      boxH = Math.max(26, Math.min(Math.round(height * 0.048), 44));
      boxX = Math.round(width * 0.52);
      boxY = Math.round(height * 0.54);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 9. Password Input Field
    else if (
      combined.includes('enter password') ||
      (combined.includes('password') && !combined.includes('forgot'))
    ) {
      boxW = Math.max(160, Math.min(Math.round(width * 0.34), 360));
      boxH = Math.max(26, Math.min(Math.round(height * 0.048), 44));
      boxX = Math.round(width * 0.52);
      boxY = Math.round(height * 0.65);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 10. Forgot Password Link
    else if (
      combined.includes('forgot password') ||
      combined.includes('reset instantly') ||
      combined.includes('otp')
    ) {
      boxW = Math.max(120, Math.min(Math.round(width * 0.25), 240));
      boxH = Math.max(16, Math.min(Math.round(height * 0.03), 26));
      boxX = Math.round(width * 0.60);
      boxY = Math.round(height * 0.71);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 11. Primary Login Button ("Login to Dashboard ->")
    else if (
      combined.includes('login to dashboard') ||
      combined.includes('login button') ||
      combined.includes('submit button') ||
      combined.includes('primary button')
    ) {
      boxW = Math.max(160, Math.min(Math.round(width * 0.34), 360));
      boxH = Math.max(28, Math.min(Math.round(height * 0.052), 48));
      boxX = Math.round(width * 0.52);
      boxY = Math.round(height * 0.755);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 12. Security & Trust Badges (Secure login • OTP verification • Encrypted access)
    else if (
      combined.includes('secure login') ||
      combined.includes('otp verification') ||
      combined.includes('encrypted access') ||
      combined.includes('security badge')
    ) {
      boxW = Math.max(140, Math.min(Math.round(width * 0.32), 320));
      boxH = Math.max(16, Math.min(Math.round(height * 0.028), 24));
      boxX = Math.round(width * 0.53);
      boxY = Math.round(height * 0.81);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 13. Top banner / Notification / Announcement / Alert bar
    else if (
      combined.includes('banner') ||
      combined.includes('announcement') ||
      combined.includes('notification') ||
      combined.includes('alert') ||
      combined.includes('top bar')
    ) {
      boxW = Math.max(120, Math.min(Math.round(width * 0.28), 260));
      boxH = Math.max(20, Math.min(Math.round(height * 0.032), 26));
      boxX = Math.round(width * 0.36);
      boxY = Math.round(height * 0.015);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 14. Header Action Buttons / Downloads / Old View / Nav items on right
    else if (
      combined.includes('header action') ||
      combined.includes('download') ||
      combined.includes('connector') ||
      combined.includes('app store') ||
      combined.includes('switch to old') ||
      combined.includes('header button')
    ) {
      boxW = smallW;
      boxH = smallH;
      boxX = Math.round(width * 0.68 + (index % 2) * (width * 0.12));
      boxY = Math.round(height * 0.048);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 15. Search Bar / Search Input / Header Search
    else if (
      combined.includes('search') ||
      combined.includes('filter') ||
      combined.includes('search bar') ||
      combined.includes('search features')
    ) {
      boxW = medW;
      boxH = smallH;
      boxX = Math.round(width * 0.28);
      boxY = Math.round(height * 0.055);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 16. Logo / Top Left Nav / Brand / Spectrum
    else if (
      combined.includes('logo') ||
      combined.includes('brand') ||
      combined.includes('spectrum') ||
      combined.includes('header') ||
      combined.includes('navbar') ||
      region === 'header'
    ) {
      boxW = Math.max(80, Math.min(Math.round(width * 0.12), 160));
      boxH = Math.max(22, Math.min(Math.round(height * 0.04), 36));
      boxX = Math.round(width * 0.08);
      boxY = Math.round(height * 0.045);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 17. General Footer / Legal / Copyright / Bottom bar
    else if (
      combined.includes('footer') ||
      combined.includes('copyright') ||
      combined.includes('terms') ||
      combined.includes('privacy') ||
      combined.includes('legal') ||
      region === 'footer'
    ) {
      boxW = medW;
      boxH = smallH;
      boxX = Math.round(width * 0.35);
      boxY = Math.round(height * 0.92);
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }
    // 18. Region / Positional Tag Fallbacks
    else {
      boxW = smallW;
      boxH = smallH;
      switch (region) {
        case 'top':
          boxX = Math.round(width * (0.20 + (index % 3) * 0.24));
          boxY = Math.round(height * 0.08);
          break;
        case 'middle-left':
          boxX = Math.round(width * 0.15);
          boxY = Math.round(height * (0.35 + (index % 3) * 0.14));
          break;
        case 'middle-right':
          boxX = Math.round(width * 0.52);
          boxY = Math.round(height * (0.35 + (index % 3) * 0.14));
          break;
        case 'bottom-left':
          boxX = Math.round(width * 0.18);
          boxY = Math.round(height * (0.68 + (index % 2) * 0.10));
          break;
        case 'bottom-right':
          boxX = Math.round(width * 0.54);
          boxY = Math.round(height * (0.78 + (index % 2) * 0.08));
          break;
        case 'center':
        default: {
          const row = index % 3;
          const col = Math.floor(index / 3) % 2;
          boxX = col === 0 ? Math.round(width * 0.22) : Math.round(width * 0.52);
          boxY = Math.round(height * (0.35 + row * 0.15));
          break;
        }
      }
      targetX = Math.round(boxX + boxW / 2);
      targetY = Math.round(boxY + boxH / 2);
    }

    return { targetX, targetY, boxX, boxY, boxW, boxH };
  };

  interface DefectToDraw {
    targetX: number;
    targetY: number;
    boxX: number;
    boxY: number;
    boxW: number;
    boxH: number;
    strokeColor: string;
    badgeBg: string;
    categoryIcon: string;
    categoryLabel: string;
    defectNumber: number;
    component: string;
    detail: string;
    isCorrected?: boolean;
  }

  // Helper: Draw pinpoint defect highlights with directional callout arrows without overlapping
  const drawNonOverlappingDefects = (
    ctx: CanvasRenderingContext2D,
    items: DefectToDraw[],
    canvasWidth: number,
    canvasHeight: number,
    headerHeight: number,
    isCorrected: boolean = false
  ) => {
    if (!items || items.length === 0) return;

    // Step 1: Draw clean element boundary rectangles and anchor dots for all items
    items.forEach((item) => {
      // 1. Small, precise bounding box with subtle translucent fill
      ctx.save();
      ctx.strokeStyle = item.strokeColor;
      ctx.lineWidth = Math.max(1.8, Math.floor(canvasWidth / 520));
      ctx.fillStyle = item.isCorrected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.06)';
      drawCanvasRoundRect(ctx, item.boxX, item.boxY, item.boxW, item.boxH, 5);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // 2. Small pinpoint anchor dot
      ctx.save();
      ctx.beginPath();
      ctx.arc(item.targetX, item.targetY, Math.max(3.5, Math.floor(canvasWidth / 260)), 0, Math.PI * 2);
      ctx.fillStyle = item.strokeColor;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.restore();
    });

    const isHighDensity = items.length > 5;
    const fontSize = Math.max(10, Math.min(11, Math.floor(canvasWidth / 85)));
    const lineHeight = fontSize + 4;

    if (isHighDensity) {
      // High Density Mode (> 5 items): Render sleek, compact pinpoint callout pills next to bounding boxes
      // Prevents giant multi-line cards from obscuring the screenshot and creating spiderweb lines
      const placedPills: Array<{ x: number; y: number; w: number; h: number }> = [];

      items.forEach((item) => {
        const rawComp = item.component || item.detail || 'Element';
        const cleanComp = parseCoordinatesAndClean(rawComp).cleanText.replace(/[*_~`]/g, '').trim();
        const shortComp = cleanComp.length > 22 ? cleanComp.substring(0, 20) + '…' : cleanComp;

        ctx.font = `bold ${fontSize}px sans-serif`;
        const badgeNumText = `#${item.defectNumber}`;
        const labelText = `${item.categoryIcon} ${badgeNumText} ${shortComp}`;
        const textWidth = ctx.measureText(labelText).width;
        const pillW = Math.max(80, Math.min(220, textWidth + 16));
        const pillH = 22;

        // Try candidate positions around the bounding box
        const candidates = [
          // 1. Top-right of box
          { x: item.boxX + item.boxW + 6, y: item.boxY - 4 },
          // 2. Top-left of box
          { x: item.boxX - pillW - 6, y: item.boxY - 4 },
          // 3. Above box
          { x: item.boxX + (item.boxW - pillW) / 2, y: item.boxY - pillH - 6 },
          // 4. Below box
          { x: item.boxX + (item.boxW - pillW) / 2, y: item.boxY + item.boxH + 6 },
          // 5. Bottom-right of box
          { x: item.boxX + item.boxW + 6, y: item.boxY + item.boxH - pillH + 4 },
          // 6. Bottom-left of box
          { x: item.boxX - pillW - 6, y: item.boxY + item.boxH - pillH + 4 }
        ];

        let chosenX = candidates[0].x;
        let chosenY = candidates[0].y;
        let found = false;

        for (const cand of candidates) {
          const clampedX = Math.max(6, Math.min(canvasWidth - pillW - 6, cand.x));
          const clampedY = Math.max(headerHeight + 6, Math.min(canvasHeight - pillH - 6, cand.y));
          const testRect = { x: clampedX, y: clampedY, w: pillW, h: pillH };

          const collides = placedPills.some(p => !(
            testRect.x + testRect.w + 4 <= p.x ||
            testRect.x >= p.x + p.w + 4 ||
            testRect.y + testRect.h + 4 <= p.y ||
            testRect.y >= p.y + p.h + 4
          ));

          if (!collides) {
            chosenX = clampedX;
            chosenY = clampedY;
            found = true;
            break;
          }
        }

        // If all candidates collide, step vertically or horizontally to avoid overlap
        if (!found) {
          let stepY = Math.max(headerHeight + 6, Math.min(canvasHeight - pillH - 6, item.boxY - 4));
          let stepX = Math.max(6, Math.min(canvasWidth - pillW - 6, item.boxX + item.boxW + 6));
          let attempts = 0;
          while (attempts < 12) {
            const testRect = { x: stepX, y: stepY, w: pillW, h: pillH };
            const collides = placedPills.some(p => !(
              testRect.x + testRect.w + 2 <= p.x ||
              testRect.x >= p.x + p.w + 2 ||
              testRect.y + testRect.h + 2 <= p.y ||
              testRect.y >= p.y + p.h + 2
            ));
            if (!collides) {
              chosenX = stepX;
              chosenY = stepY;
              break;
            }
            stepY = Math.max(headerHeight + 6, Math.min(canvasHeight - pillH - 6, stepY + 24));
            if (stepY + pillH >= canvasHeight - 6) {
              stepY = headerHeight + 6 + (attempts % 5) * 24;
              stepX = Math.max(6, Math.min(canvasWidth - pillW - 6, stepX - 30));
            }
            attempts++;
          }
        }

        placedPills.push({ x: chosenX, y: chosenY, w: pillW, h: pillH });

        // Draw short leader line connecting pill to anchor
        const pillCenterX = chosenX + pillW / 2;
        const pillCenterY = chosenY + pillH / 2;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pillCenterX, pillCenterY);
        ctx.lineTo(item.targetX, item.targetY);
        ctx.strokeStyle = item.strokeColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Draw Pill Container
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        drawCanvasRoundRect(ctx, chosenX, chosenY, pillW, pillH, 5);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = item.strokeColor;
        ctx.lineWidth = 1.4;
        drawCanvasRoundRect(ctx, chosenX, chosenY, pillW, pillH, 5);
        ctx.stroke();

        // Pill Label Text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillText(labelText, chosenX + 8, chosenY + 15);
        ctx.restore();
      });

      return;
    }

    // Low Density Mode (<= 5 items): Render spacious callout cards with full multi-line details and leader arrows
    const cardW = Math.max(200, Math.min(Math.floor(canvasWidth * 0.28), 300));
    const textMaxWidth = cardW - 20;

    interface FormattedDefectCard {
      item: DefectToDraw;
      tagText: string;
      tagW: number;
      lines: string[];
      cardW: number;
      cardH: number;
      chosenX: number;
      chosenY: number;
    }

    const formatDefectCard = (item: DefectToDraw): FormattedDefectCard => {
      ctx.font = `bold ${fontSize}px sans-serif`;
      const tagText = item.isCorrected
        ? `✅ RESOLVED #${item.defectNumber}`
        : `${item.categoryIcon} ${item.categoryLabel} #${item.defectNumber}`;
      const tagW = ctx.measureText(tagText).width + 14;

      const rawText = item.detail || item.component || '';
      const cleanDetail = parseCoordinatesAndClean(rawText).cleanText
        .replace(/[*_~`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      ctx.font = `${fontSize}px sans-serif`;
      const words = cleanDetail.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(testLine).width > textMaxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      if (lines.length === 0) lines.push(cleanDetail);

      const cardH = 20 + 5 + lines.length * lineHeight + 8;

      return {
        item,
        tagText,
        tagW,
        lines,
        cardW,
        cardH,
        chosenX: 0,
        chosenY: 0
      };
    };

    const cards: FormattedDefectCard[] = items.map(formatDefectCard);

    const collides = (
      r1: { x: number; y: number; w: number; h: number },
      r2: { x: number; y: number; w: number; h: number },
      gap = 10
    ) => {
      return !(
        r1.x + r1.w + gap <= r2.x ||
        r1.x >= r2.x + r2.w + gap ||
        r1.y + r1.h + gap <= r2.y ||
        r1.y >= r2.y + r2.h + gap
      );
    };

    const placedCards: Array<{ x: number; y: number; w: number; h: number }> = [];

    cards.forEach((card, idx) => {
      const item = card.item;
      const cw = card.cardW;
      const ch = card.cardH;

      const isRightLeaning = item.targetX >= canvasWidth * 0.5;

      const candidates = [
        {
          x: Math.max(12, Math.min(canvasWidth - cw - 12, item.targetX - cw / 2)),
          y: item.targetY - item.boxH / 2 - ch - 16
        },
        {
          x: Math.max(12, Math.min(canvasWidth - cw - 12, item.targetX - cw / 2)),
          y: item.targetY + item.boxH / 2 + 16
        },
        isRightLeaning
          ? {
              x: Math.max(12, item.targetX - item.boxW / 2 - cw - 18),
              y: Math.max(headerHeight + 10, Math.min(canvasHeight - ch - 12, item.targetY - ch / 2))
            }
          : {
              x: Math.min(canvasWidth - cw - 12, item.targetX + item.boxW / 2 + 18),
              y: Math.max(headerHeight + 10, Math.min(canvasHeight - ch - 12, item.targetY - ch / 2))
            },
        isRightLeaning
          ? {
              x: Math.min(canvasWidth - cw - 12, item.targetX + item.boxW / 2 + 18),
              y: Math.max(headerHeight + 10, Math.min(canvasHeight - ch - 12, item.targetY - ch / 2))
            }
          : {
              x: Math.max(12, item.targetX - item.boxW / 2 - cw - 18),
              y: Math.max(headerHeight + 10, Math.min(canvasHeight - ch - 12, item.targetY - ch / 2))
            }
      ];

      let foundCandidate: { x: number; y: number } | null = null;

      for (const cand of candidates) {
        if (
          cand.x >= 10 &&
          cand.x + cw <= canvasWidth - 10 &&
          cand.y >= headerHeight + 8 &&
          cand.y + ch <= canvasHeight - 10
        ) {
          const testRect = { x: cand.x, y: cand.y, w: cw, h: ch };
          if (!placedCards.some((p) => collides(testRect, p, 10))) {
            foundCandidate = cand;
            break;
          }
        }
      }

      if (!foundCandidate) {
        const slotCol = idx % 2;
        const slotRow = Math.floor(idx / 2);
        const slotX = slotCol === 0 ? 14 : Math.max(12, canvasWidth - cw - 14);
        const slotY = Math.max(
          headerHeight + 10,
          Math.min(canvasHeight - ch - 10, headerHeight + 12 + slotRow * (ch + 12))
        );
        foundCandidate = { x: slotX, y: slotY };
      }

      card.chosenX = foundCandidate.x;
      card.chosenY = foundCandidate.y;
      placedCards.push({ x: card.chosenX, y: card.chosenY, w: cw, h: ch });
    });

    cards.forEach((card) => {
      const item = card.item;
      const bx = card.chosenX;
      const by = card.chosenY;
      const bw = card.cardW;
      const bh = card.cardH;

      let startX = bx + bw / 2;
      let startY = by + bh;
      if (by >= item.targetY) {
        startX = Math.max(bx + 16, Math.min(bx + bw - 16, item.targetX));
        startY = by;
      } else if (by + bh <= item.targetY) {
        startX = Math.max(bx + 16, Math.min(bx + bw - 16, item.targetX));
        startY = by + bh;
      } else if (bx >= item.targetX) {
        startX = bx;
        startY = by + bh / 2;
      } else if (bx + bw <= item.targetX) {
        startX = bx + bw;
        startY = by + bh / 2;
      }

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(item.targetX, item.targetY);
      ctx.strokeStyle = item.strokeColor;
      ctx.lineWidth = Math.max(1.8, Math.floor(canvasWidth / 500));
      ctx.stroke();

      const angle = Math.atan2(item.targetY - startY, item.targetX - startX);
      const headLen = Math.max(7, Math.min(11, canvasWidth / 80));
      ctx.beginPath();
      ctx.moveTo(item.targetX, item.targetY);
      ctx.lineTo(
        item.targetX - headLen * Math.cos(angle - Math.PI / 6),
        item.targetY - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        item.targetX - headLen * Math.cos(angle + Math.PI / 6),
        item.targetY - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = item.strokeColor;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.97)';
      drawCanvasRoundRect(ctx, bx, by, bw, bh, 6);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = item.strokeColor;
      ctx.lineWidth = 1.6;
      drawCanvasRoundRect(ctx, bx, by, bw, bh, 6);
      ctx.stroke();

      ctx.fillStyle = item.badgeBg;
      drawCanvasRoundRect(ctx, bx + 6, by + 6, card.tagW, 18, 4);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillText(card.tagText, bx + 12, by + 19);

      ctx.fillStyle = '#F1F5F9';
      ctx.font = `${fontSize}px sans-serif`;
      card.lines.forEach((lineText, lineIdx) => {
        ctx.fillText(lineText, bx + 10, by + 25 + 13 + lineIdx * lineHeight);
      });
      ctx.restore();
    });
  };

  // Legacy single-item adapter if needed
  const drawDefectHighlightWithArrow = (
    ctx: CanvasRenderingContext2D,
    options: {
      targetX: number;
      targetY: number;
      boxX: number;
      boxY: number;
      boxW: number;
      boxH: number;
      strokeColor: string;
      badgeBg: string;
      categoryIcon: string;
      categoryLabel: string;
      defectNumber: number;
      component: string;
      detail: string;
      isCorrected?: boolean;
      canvasWidth: number;
      canvasHeight: number;
      index: number;
      totalIssues: number;
    }
  ) => {
    const headerH = Math.max(32, Math.floor(options.canvasHeight / 18));
    drawNonOverlappingDefects(
      ctx,
      [{
        targetX: options.targetX,
        targetY: options.targetY,
        boxX: options.boxX,
        boxY: options.boxY,
        boxW: options.boxW,
        boxH: options.boxH,
        strokeColor: options.strokeColor,
        badgeBg: options.badgeBg,
        categoryIcon: options.categoryIcon,
        categoryLabel: options.categoryLabel,
        defectNumber: options.defectNumber,
        component: options.component,
        detail: options.detail,
        isCorrected: options.isCorrected
      }],
      options.canvasWidth,
      options.canvasHeight,
      headerH,
      options.isCorrected
    );
  };

  // Helper: Extract Page-Specific Defect Items and Contrast Issues from Generated Report Markdown
  const extractPageSpecificDefects = (
    reportText: string,
    pageIndex: number,
    pageTitle: string = '',
    totalPages: number = 1,
    tabType: 'ui' | 'figma' | 'comparison' = 'ui',
    isCorrectedReport: boolean = false
  ): {
    contrastIssues: Array<{ id: number; label: string; detail: string; severity: string; region?: string; coordinates?: { x: number; y: number; width: number; height: number } | null }>;
    visualDefects: UIDefectItem[];
    isClean: boolean;
  } => {
    const visualDefects: UIDefectItem[] = [];
    const contrastIssues: Array<{ id: number; label: string; detail: string; severity: string; region?: string; coordinates?: { x: number; y: number; width: number; height: number } | null }> = [];

    if (!reportText || !reportText.trim()) {
      return { visualDefects: [], contrastIssues: [], isClean: true };
    }

    const targetPageNum = pageIndex + 1;

    // 1. Try to segment the report into page-specific sections
    // Matches headers like: PAGE 1: ..., #### [SCREEN 1: ...], ### Frame 1:, ### Keyframe 1:, ### Walkthrough Page 1:,
    // ### 📄 Figma Page / Frame 1:, ### Figma Screen #1:, #### [FIGMA FRAME 1: ...], etc.
    const pageHeaderRegex = /(?:^|\n)(?:#{1,6}\s*)?(?:📄\s*)?(?:\[\s*)?(?:PAGE|Page|Screen|Frame|Keyframe|Figma Page\s*(?:\/\s*Frame)?|Figma Screen|FIGMA FRAME|Figma Frame|Walkthrough Page|Video Keyframe(?:\s*Screen)?|Video Walkthrough Frame|Video Screen|Slide)\s*#?(\d+)[:\s\]\)\-]/gi;
    const sectionIndices: Array<{ pageNum: number; startIndex: number; header: string }> = [];
    let hMatch;
    while ((hMatch = pageHeaderRegex.exec(reportText)) !== null) {
      sectionIndices.push({
        pageNum: parseInt(hMatch[1], 10),
        startIndex: hMatch.index,
        header: hMatch[0]
      });
    }

    let pageSectionText = '';

    if (sectionIndices.length > 0) {
      const currentSecIndex = sectionIndices.findIndex(s => s.pageNum === targetPageNum);
      if (currentSecIndex !== -1) {
        const start = sectionIndices[currentSecIndex].startIndex;
        const end = currentSecIndex < sectionIndices.length - 1 ? sectionIndices[currentSecIndex + 1].startIndex : reportText.length;
        pageSectionText = reportText.slice(start, end);
      } else if (pageIndex < sectionIndices.length) {
        const start = sectionIndices[pageIndex].startIndex;
        const end = pageIndex < sectionIndices.length - 1 ? sectionIndices[pageIndex + 1].startIndex : reportText.length;
        pageSectionText = reportText.slice(start, end);
      }
    }

    // If no page section was found via regex, check for page name / title in report
    if (!pageSectionText && pageTitle) {
      const cleanTitle = pageTitle.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      if (cleanTitle.length > 3) {
        const titleIndex = reportText.toLowerCase().indexOf(cleanTitle.toLowerCase());
        if (titleIndex !== -1) {
          pageSectionText = reportText.slice(titleIndex, titleIndex + 2000);
        }
      }
    }

    // CRITICAL FIX: Strictly parse pageSectionText. Never fall back to full reportText when totalPages > 1
    const textToParse = pageSectionText || (totalPages === 1 ? reportText : '');

    // Check if section explicitly passed / zero issues or if page section is missing for multi-page document
    const isSectionClean = textToParse && (
      textToParse.toLowerCase().includes('page status: passed') ||
      textToParse.toLowerCase().includes('page status: matched - passed') ||
      textToParse.toLowerCase().includes('status: passed') ||
      textToParse.toLowerCase().includes('matched - passed') ||
      textToParse.toLowerCase().includes('approved for dev (passed)') ||
      textToParse.toLowerCase().includes('total defects detected on this frame: 0') ||
      textToParse.toLowerCase().includes('total defects detected: 0') ||
      textToParse.toLowerCase().includes('all design specs passed (0 defects)') ||
      textToParse.toLowerCase().includes('design fully conforms to specifications') ||
      textToParse.toLowerCase().includes('no visual, formatting, or alignment issues detected') ||
      textToParse.toLowerCase().includes('0 defects detected') ||
      textToParse.toLowerCase().includes('0 defects') ||
      textToParse.toLowerCase().includes('no defects found')
    );

    if (isSectionClean || (!textToParse && totalPages > 1)) {
      return { visualDefects: [], contrastIssues: [], isClean: true };
    }

    let defId = 1;
    let contrastId = 1;

    // Helper to check if a line is a non-defect / metadata line
    const isMetadataOrPassLine = (line: string): boolean => {
      const lower = line.toLowerCase().trim();
      return (
        lower === 'spelling and grammar issues' ||
        lower === 'spelling and grammar issues:' ||
        lower === 'layout & visual issues' ||
        lower === 'layout & visual issues:' ||
        lower === 'layout and visual issues' ||
        lower === 'layout and visual issues:' ||
        lower.startsWith('source:') ||
        lower.startsWith('page status:') ||
        lower.startsWith('compliance status:') ||
        lower.startsWith('target page status') ||
        lower.startsWith('user action') ||
        lower.startsWith('navigation step:') ||
        lower.startsWith('standard requirement status:') ||
        lower.startsWith('validation verdict:') ||
        lower.startsWith('requirement format:') ||
        lower.startsWith('wcag 2.1') ||
        lower.startsWith('color contrast audit') ||
        lower.startsWith('total defects detected') ||
        lower.startsWith('actionable developer checklist') ||
        lower.startsWith('verification checklist') ||
        lower.includes('no issues detected') ||
        lower.includes('no spelling or grammar issues detected') ||
        lower.includes('no spelling issues detected') ||
        lower.includes('no grammar issues detected') ||
        lower.includes('no layout issues detected') ||
        lower.includes('no visual issues detected') ||
        lower.includes('no visual, formatting') ||
        lower.includes('no defects detected') ||
        lower.includes('no defects found') ||
        lower.includes('0 defects') ||
        lower.includes('none detected') ||
        lower.includes('none observed') ||
        lower.includes('matched - passed') ||
        lower.includes('status: passed') ||
        lower.includes('approved for dev') ||
        lower.includes('design fully conforms') ||
        lower.includes('no layout or specification defects observed') ||
        lower.includes('no visual, layout, or specification defects') ||
        lower.includes('no design defects detected') ||
        lower.includes('no remediation needed') ||
        lower.includes('no remediation required') ||
        lower.includes('all tokens verified') ||
        lower.includes('8px-grid alignment') ||
        lower.includes('vertical rhythm') ||
        lower.includes('screen balance') ||
        lower.includes('typographic hierarchy') ||
        lower.includes('suggested reusable design tokens') ||
        lower.includes('identification of non-standard paddings') ||
        lower.includes('hover, focus ring') ||
        lower.includes('conforms to the 8px') ||
        lower.includes('viewport layout and vertical rhythm') ||
        lower.includes('reusable component tokens') ||
        lower.includes('placeholder text, copywriting quality')
      );
    };

    // 2. Parse Markdown Table rows (supporting 4, 5, or 6 column tables with Page # support)
    const parsedFromTable: UIDefectItem[] = [];
    let tableHasExplicitNone = false;
    const reportLines = (textToParse || (totalPages === 1 ? reportText : '')).split('\n');

    for (const rawLine of reportLines) {
      const line = rawLine.trim();
      if (!line.startsWith('|') || !line.endsWith('|') || line.includes('---')) continue;

      const cols = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      if (cols.length < 3) continue;

      // Skip header rows
      if (
        cols[0].toLowerCase().includes('field') ||
        cols[0].toLowerCase().includes('page') ||
        cols[0].toLowerCase().includes('component') ||
        cols[0].toLowerCase().includes('item #') ||
        cols[0].toLowerCase().includes('defect #') ||
        cols[1]?.toLowerCase().includes('field') ||
        cols[1]?.toLowerCase().includes('component')
      ) {
        continue;
      }

      // Check if table explicitly states "None" or "Passed" or "0 defects"
      const fullRowText = cols.join(' ').toLowerCase();
      if (
        fullRowText.includes('none (design fully conforms') ||
        fullRowText.includes('no layout or specification defects') ||
        fullRowText.includes('design fully conforms to specifications') ||
        fullRowText.includes('all tokens verified') ||
        fullRowText.includes('no defects found') ||
        fullRowText.includes('0 defects') ||
        (cols[1]?.toLowerCase() === 'none' && cols[2]?.toLowerCase().includes('passed'))
      ) {
        tableHasExplicitNone = true;
        continue;
      }

      let rowPageNum: number | null = null;
      let comp = '';
      let obs = '';
      let exp = '';
      let fix = '';
      let severity = 'High';

      // 6-Column Table: [Page #, Component, Observation, Expected, Fix, Severity]
      if (cols.length >= 6) {
        const pageCol = cols[0];
        const pMatch = pageCol.match(/\d+/);
        if (pMatch) rowPageNum = parseInt(pMatch[0], 10);
        comp = cols[1];
        obs = cols[2];
        exp = cols[3];
        fix = cols[4];
        severity = cols[5] || 'High';
      }
      // 5-Column Table: [Component, Observation, Expected, Fix, Severity]
      else if (cols.length === 5) {
        // Check if Col 1 has [Page X] prefix
        const pMatch = cols[0].match(/\[\s*(?:Page|Screen)\s*(\d+)\s*\]/i);
        if (pMatch) {
          rowPageNum = parseInt(pMatch[1], 10);
          comp = cols[0].replace(/\[\s*(?:Page|Screen)\s*\d+\s*\]/i, '').trim();
        } else {
          comp = cols[0];
        }
        obs = cols[1];
        exp = cols[2];
        fix = cols[3];
        severity = cols[4] || 'High';
      }
      // 4-Column Table: [Component, Original Defect, Corrected Spec, Standard]
      else if (cols.length === 4) {
        const pMatch = cols[0].match(/\[\s*(?:Page|Screen)\s*(\d+)\s*\]/i);
        if (pMatch) {
          rowPageNum = parseInt(pMatch[1], 10);
          comp = cols[0].replace(/\[\s*(?:Page|Screen)\s*\d+\s*\]/i, '').trim();
        } else {
          comp = cols[0];
        }
        obs = cols[1];
        exp = cols[2];
        fix = cols[3];
        severity = 'High';
      }

      // Try inline matching in comp, obs, exp if rowPageNum is not yet detected
      if (rowPageNum === null) {
        const inlineMatch = (comp + ' ' + obs + ' ' + exp).match(/(?:\[\s*|\b)(?:Page|Screen|Frame|Keyframe)\s*#?(\d+)(?:\s*\]|\b)/i);
        if (inlineMatch) {
          rowPageNum = parseInt(inlineMatch[1], 10);
        }
      }

      // If page is specified and doesn't match this page, skip!
      if (rowPageNum !== null && rowPageNum !== targetPageNum && totalPages > 1) {
        continue;
      }

      // If no page number is found on this row and totalPages > 1:
      // Only include it if we are parsing a specific page section (pageSectionText is non-empty)
      // and NOT reading the global un-segmented report text
      if (rowPageNum === null && totalPages > 1 && !pageSectionText) {
        continue;
      }

      if (isMetadataOrPassLine(comp) || isMetadataOrPassLine(obs)) {
        continue;
      }

      const compParsed = parseCoordinatesAndClean(comp);
      const obsParsed = parseCoordinatesAndClean(obs);
      const tableCoords = compParsed.coords || obsParsed.coords || null;
      const cleanComp = compParsed.cleanText || comp.replace(/[*_~`]/g, '').trim();
      const cleanObs = obsParsed.cleanText || obs.replace(/[*_~`]/g, '').trim();
      if (!cleanComp && !cleanObs) continue;

      const category = categorizeDefect(`${cleanComp} ${cleanObs} ${exp} ${fix}`, cleanComp);
      const region = assignDefectRegion(cleanComp, cleanObs, parsedFromTable.length);

      parsedFromTable.push({
        id: defId++,
        category,
        component: cleanComp || 'UI Component',
        detail: `${cleanObs}${exp ? ` → ${exp.replace(/[*_~`]/g, '')}` : ''}`,
        severity: severity.replace(/`/g, '') || 'High',
        fix: fix || 'Align with design standard',
        expected: exp,
        actual: cleanObs,
        region,
        coordinates: tableCoords,
        isCorrected: isCorrectedReport
      });
    }

    // 3. Parse Bullet Points under sections (Spelling, Layout, Contrast, Alignment, Missing items)
    const parsedFromBullets: UIDefectItem[] = [];
    const checklistItems: string[] = [];

    if (textToParse) {
      const lines = textToParse.split('\n');
      let currentBulletCategory: 'spelling' | 'alignment' | 'missing' | 'contrast' | 'typography' | 'ui' = 'ui';
      let inChecklist = false;

      for (const line of lines) {
        const trimmed = line.trim();
        const lower = trimmed.toLowerCase();

        if (!trimmed) continue;

        // Detect section headers
        if (trimmed.startsWith('#') || trimmed.startsWith('**') || trimmed.endsWith(':')) {
          if (lower.includes('checklist') || lower.includes('actionable')) {
            inChecklist = true;
          } else if (lower.includes('spelling') || lower.includes('grammar') || lower.includes('typo')) {
            inChecklist = false;
            currentBulletCategory = 'spelling';
          } else if (lower.includes('layout') || lower.includes('alignment') || lower.includes('margin') || lower.includes('spacing') || lower.includes('grid')) {
            inChecklist = false;
            currentBulletCategory = 'alignment';
          } else if (lower.includes('contrast')) {
            inChecklist = false;
            currentBulletCategory = 'contrast';
          } else if (lower.includes('missing') || lower.includes('omitted')) {
            inChecklist = false;
            currentBulletCategory = 'missing';
          } else if (lower.includes('typography') || lower.includes('font')) {
            inChecklist = false;
            currentBulletCategory = 'typography';
          }
        }

        // Bullet point lines (- , • , * , + , 1. )
        const isBullet = /^(?:[-*•+]|\d+\.)\s+/.test(trimmed);
        if (isBullet) {
          const rawContent = trimmed.replace(/^(?:[-*•+]|\d+\.)\s+/, '').trim();

          if (isMetadataOrPassLine(rawContent)) {
            continue;
          }

          // Check if this is a section-level bullet with inline status or colon
          if (rawContent.toLowerCase().startsWith('spelling and grammar issues:') || rawContent.toLowerCase().startsWith('spelling & grammar issues:')) {
            const afterColon = rawContent.slice(rawContent.indexOf(':') + 1).trim();
            if (!afterColon || isMetadataOrPassLine(afterColon)) {
              currentBulletCategory = 'spelling';
              continue;
            }
          } else if (rawContent.toLowerCase().startsWith('layout & visual issues:') || rawContent.toLowerCase().startsWith('layout and visual issues:')) {
            const afterColon = rawContent.slice(rawContent.indexOf(':') + 1).trim();
            if (!afterColon || isMetadataOrPassLine(afterColon)) {
              currentBulletCategory = 'alignment';
              continue;
            }
          }

          // Check if checklist item
          if (rawContent.startsWith('[ ]') || rawContent.startsWith('[x]') || inChecklist) {
            const cleanChecklist = rawContent.replace(/^\[[ x]\]\s*/i, '').trim();
            if (cleanChecklist && !isMetadataOrPassLine(cleanChecklist)) {
              checklistItems.push(cleanChecklist);
            }
            continue;
          }

          // Real defect bullet item
          const parsedBulletComp = parseCoordinatesAndClean(rawContent);
          const cleanText = rawContent.replace(/^\*\*/, '').replace(/\*\*:/, ':').replace(/\*\*/g, '').trim();

          // Skip purely observational sentences that are not actionable defects
          const lowerClean = cleanText.toLowerCase();
          const isObservationOnly = 
            lowerClean.includes('evaluated for') ||
            lowerClean.includes('evaluated on') ||
            lowerClean.includes('benchmarked against') ||
            lowerClean.includes('proportions reviewed') ||
            lowerClean.includes('tokens reviewed') ||
            lowerClean.includes('specifications audited') ||
            lowerClean.includes('conforms strictly') ||
            lowerClean.includes('meets all specifications') ||
            lowerClean.includes('no remediation required') ||
            lowerClean.includes('no remediation needed') ||
            lowerClean.includes('no changes needed') ||
            lowerClean.includes('all tokens verified') ||
            lowerClean.includes('8px spatial grid') ||
            lowerClean.includes('vertical rhythm') ||
            lowerClean.includes('viewport layout');

          if (cleanText.length > 5 && !isMetadataOrPassLine(cleanText) && !isObservationOnly) {
            const parts = cleanText.split(':');
            let rawComp = (parts.length > 1 ? parts[0] : (cleanText.match(/"([^"]+)"/)?.[1] || 'UI Component')).trim();
            let detailText = (parts.length > 1 ? parts.slice(1).join(':') : cleanText).trim();

            // Extract explicit coordinates from rawComp or detailText
            const compParsed = parseCoordinatesAndClean(rawComp);
            const detailParsed = parseCoordinatesAndClean(detailText);
            const bulletCoords = compParsed.coords || detailParsed.coords || parsedBulletComp.coords || null;

            rawComp = compParsed.cleanText;
            detailText = detailParsed.cleanText;

            // If rawComp is a generic category header like "Spelling and Grammar Issues" or "Layout & Visual Issues", extract real component from detail
            if (
              rawComp.toLowerCase().includes('spelling') ||
              rawComp.toLowerCase().includes('layout') ||
              rawComp.toLowerCase().includes('grammar') ||
              rawComp.toLowerCase().includes('visual issue') ||
              rawComp.toLowerCase().includes('ui issue')
            ) {
              const quoteMatch = detailText.match(/"([^"]+)"/) || detailText.match(/'([^']+)'/);
              if (quoteMatch) {
                rawComp = quoteMatch[1];
              } else {
                const words = detailText.replace(/[*_~`]/g, '').trim().split(' ').filter(Boolean);
                rawComp = words.slice(0, 3).join(' ') || 'UI Component';
              }
            }

            const category = categorizeDefect(cleanText, rawComp);
            const effectiveCategory = category !== 'ui' ? category : currentBulletCategory;
            const region = assignDefectRegion(rawComp, cleanText, parsedFromBullets.length);

            parsedFromBullets.push({
              id: defId++,
              category: effectiveCategory,
              component: rawComp || 'UI Component',
              detail: detailText,
              severity: effectiveCategory === 'contrast' || effectiveCategory === 'alignment' ? 'High' : 'Medium',
              fix: 'Standardize to design specification and UI tokens',
              region,
              coordinates: bulletCoords,
              isCorrected: isCorrectedReport
            });
          }
        }
      }
    }

    // Combine extracted defects: prefer table or explicit defect bullets
    // If the defect table was present and explicitly found no defects (None / Passed), do not fall back to bullets!
    const rawAllDefects: UIDefectItem[] = [];
    if (parsedFromTable.length > 0) {
      rawAllDefects.push(...parsedFromTable);
    } else if (tableHasExplicitNone) {
      // Table was present and reported 0 defects / passed
    } else if (parsedFromBullets.length > 0) {
      rawAllDefects.push(...parsedFromBullets);
    } else if (checklistItems.length > 0) {
      // Use checklist items only as fallback if no explicit defect bullets were found
      checklistItems.forEach((item) => {
        const category = categorizeDefect(item, '');
        const region = assignDefectRegion(item.split(' ')[0] || '', item, rawAllDefects.length);
        rawAllDefects.push({
          id: 0,
          category,
          component: (item.match(/"([^"]+)"/)?.[1] || item.split(':')[0] || 'UI Component').slice(0, 40),
          detail: item.slice(0, 95),
          severity: category === 'contrast' || category === 'alignment' ? 'High' : 'Medium',
          fix: 'Align with design standard',
          region,
          isCorrected: isCorrectedReport
        });
      });
    }

    // Strictly separate color contrast defects from visual defects to prevent mingling
    // In Figma Design Review, Color Contrast is NEVER audited or extracted (strictly empty)
    const rawContrast = tabType === 'figma' ? [] : rawAllDefects.filter(isContrastDefectItem);
    const rawVisual = rawAllDefects.filter(d => !isContrastDefectItem(d));

    // 1. Build visual defects (strictly layout, alignment, typography, spelling, missing, UI defects - NO contrast)
    // Re-index sequentially starting from 1 for clean annotation numbers in defects screenshot
    rawVisual.forEach((d, idx) => {
      visualDefects.push({
        ...d,
        id: idx + 1
      });
    });

    // 2. Build contrast issues list (strictly color contrast / WCAG contrast issues - only for App UI Review)
    if (tabType === 'ui' && rawContrast.length > 0) {
      rawContrast.forEach((d, idx) => {
        contrastIssues.push({
          id: idx + 1,
          label: d.detail.includes('FAIL') ? 'FAIL AA' : (d.detail.includes('PASS') ? 'PASS AA' : 'WCAG CONTRAST'),
          detail: d.detail,
          severity: d.severity,
          region: d.region,
          coordinates: (d as any).coordinates
        });
      });
    }

    return {
      visualDefects,
      contrastIssues: tabType === 'figma' ? [] : contrastIssues,
      isClean: visualDefects.length === 0 && (tabType === 'figma' ? true : contrastIssues.length === 0)
    };
  };

  // Helper: Extract Defect Items and Contrast Issues from Generated Report Markdown (Global backward-compat wrapper)
  const extractDefectsFromReport = (
    reportText: string
  ): {
    contrastIssues: Array<{ id: number; label: string; detail: string; severity: string }>;
    visualDefects: Array<{ id: number; component: string; detail: string; severity: string; fix?: string }>;
  } => {
    const res = extractPageSpecificDefects(reportText, 0, '', 1, 'ui');
    return {
      contrastIssues: res.contrastIssues,
      visualDefects: res.visualDefects
    };
  };

  // Helper: Compute dynamic canvas bounding box coordinates based on region, index, width, height (legacy compat)
  const getCanvasBoxCoords = (region: string = 'center', index: number, width: number, height: number) => {
    const geom = resolveDefectGeometry('', '', region, index, 1, width, height);
    return { x: geom.boxX, y: geom.boxY, w: geom.boxW, h: geom.boxH };
  };

  // Helper: Generate Matched Defects Report Markdown synchronized with defects screenshot
  const generateMatchedDefectsReport = (
    fullReport: string,
    appName: string = 'AutomatiQA App',
    includeContrast: boolean = false
  ): string => {
    const { visualDefects, contrastIssues } = extractDefectsFromReport(fullReport);
    const dateStr = new Date().toLocaleDateString();

    let md = `# 🐛 UI Visual Defects Audit Report\n**Application:** ${appName}\n**Generated Date:** ${dateStr}\n**Total Defects Highlighted in defects.png:** ${visualDefects.length}\n`;

    if (includeContrast) {
      md += `**Total Contrast Issues Highlighted in CHECK COLOR CONTRAST IN UI.png:** ${contrastIssues.length}\n`;
    }

    md += `\n---\n\n## 🎯 DEFECTS LOG & NUMBERED DEFECT AUDIT TABLE\n*All defect numbers in this table directly match the annotations in the **\`defects\`** screenshot.*\n\n| Defect # | UI Component / Area | Severity | Observation / Defect Detail | Required Resolution / Fix |\n| :--- | :--- | :--- | :--- | :--- |\n${visualDefects.map(d => `| **DEFECT #${d.id}** | ${d.component} | \`${d.severity.toUpperCase()}\` | ${d.detail} | ${d.fix || 'Align with design tokens and visual hierarchy standards'} |`).join('\n')}\n`;

    if (includeContrast && contrastIssues.length > 0) {
      md += `\n---\n\n## 🎨 CHECK COLOR CONTRAST IN UI AUDIT BREAKDOWN\n*All contrast items in this table directly match the annotations in the **\`CHECK COLOR CONTRAST IN UI\`** screenshot.*\n\n| Contrast Item # | Area / UI Element | Ratio / Issue | Severity | WCAG Standard |\n| :--- | :--- | :--- | :--- | :--- |\n${contrastIssues.map(c => `| **CONTRAST #${c.id}** | ${c.detail.split(':')[0] || 'Text Element'} | ${c.label} | \`${c.severity}\` | WCAG 2.1 AA (≥ 4.5:1) |`).join('\n')}\n`;
    }

    md += `\n---\n\n## 🛠️ Actionable UI Remediation Checklist\n${visualDefects.map(d => `- [ ] **[${d.severity.toUpperCase()}] DEFECT #${d.id} (${d.component}):** ${d.detail} → *${d.fix || 'Fix issue'}*`).join('\n')}\n`;

    if (includeContrast && contrastIssues.length > 0) {
      md += `${contrastIssues.map(c => `- [ ] **[CONTRAST] CONTRAST #${c.id}:** ${c.detail}`).join('\n')}\n`;
    }

    return md;
  };

  // 1A. Canvas-based WCAG Color Contrast & Accessibility Issue Highlighted Screenshot Generator
  const generateIssueHighlightedScreenshot = (
    originalDataUrl: string,
    pageTitle: string,
    customIssues?: Array<{ id: number; label: string; detail: string; severity: string; region?: string; coordinates?: { x: number; y: number; width: number; height: number } | null }>,
    pageIndex: number = 0,
    isCorrected: boolean = false
  ): Promise<{ highlightedUrl: string; issuesCount: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const rawW = img.width || 960;
        const rawH = img.height || 600;
        const maxDim = 960;
        const scale = rawW > maxDim ? maxDim / rawW : 1;
        const width = Math.round(rawW * scale);
        const height = Math.round(rawH * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ highlightedUrl: originalDataUrl, issuesCount: 0 });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const contrastIssues = customIssues || [];

        const defectsToDraw: DefectToDraw[] = contrastIssues.map((box, index) => {
          const geom = resolveDefectGeometry(
            box.detail.split(':')[0] || 'Text Element',
            box.detail,
            box.region,
            index,
            contrastIssues.length,
            width,
            height,
            (box as any).coordinates
          );
          return {
            targetX: geom.targetX,
            targetY: geom.targetY,
            boxX: geom.boxX,
            boxY: geom.boxY,
            boxW: geom.boxW,
            boxH: geom.boxH,
            strokeColor: isCorrected ? '#10B981' : '#EF4444',
            badgeBg: isCorrected ? '#059669' : '#DC2626',
            categoryIcon: '🎨',
            categoryLabel: box.label || 'WCAG CONTRAST',
            defectNumber: box.id || index + 1,
            component: box.detail.split(':')[0] || 'Text Element',
            detail: box.detail,
            isCorrected
          };
        });

        // Clean Header Banner
        const headerH = Math.max(32, Math.floor(height / 18));
        ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
        ctx.fillRect(0, 0, width, headerH);

        ctx.fillStyle = isCorrected ? '#34D399' : (contrastIssues.length === 0 ? '#34D399' : '#F87171');
        const headerFont = Math.max(11, Math.floor(width / 68));
        ctx.font = `bold ${headerFont}px sans-serif`;

        const bannerTitle = isCorrected
          ? `✓ WCAG 2.1 AA/AAA COLOR CONTRAST RESOLVED — ${pageTitle.toUpperCase()} — ALL RATIOS PASS`
          : (contrastIssues.length === 0
            ? `✓ WCAG 2.1 AA COLOR CONTRAST AUDIT — ${pageTitle.toUpperCase()} — PASSED (0 ISSUES)`
            : `CHECK COLOR CONTRAST IN UI — ${pageTitle.toUpperCase()} — ${contrastIssues.length} ISSUES HIGHLIGHTED`);
        ctx.fillText(bannerTitle, 14, headerH - 10);

        // Draw collision-free defect highlights
        drawNonOverlappingDefects(ctx, defectsToDraw, width, height, headerH, isCorrected);

        resolve({
          highlightedUrl: canvas.toDataURL('image/jpeg', 0.85),
          issuesCount: isCorrected ? 0 : contrastIssues.length
        });
      };

      img.onerror = () => resolve({ highlightedUrl: originalDataUrl, issuesCount: 0 });
      img.src = originalDataUrl;
    });
  };

  // 1B. Canvas-based UI Visual Layout, Alignment, Grid, Spelling & Defect Audit Generator
  const generateVisualDefectsAuditScreenshot = (
    originalDataUrl: string,
    pageTitle: string,
    customDefects?: UIDefectItem[],
    pageIndex: number = 0,
    isCorrected: boolean = false
  ): Promise<{ highlightedUrl: string; issuesCount: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const rawW = img.width || 960;
        const rawH = img.height || 600;
        const maxDim = 960;
        const scale = rawW > maxDim ? maxDim / rawW : 1;
        const width = Math.round(rawW * scale);
        const height = Math.round(rawH * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ highlightedUrl: originalDataUrl, issuesCount: 0 });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const rawIssues = customDefects || [];
        // Strictly filter out any color contrast defects so they NEVER mingle on the visual defects screenshot
        const visualIssues = rawIssues.filter(box => !isContrastDefectItem(box));

        const defectsToDraw: DefectToDraw[] = visualIssues.map((box, index) => {
          const geom = resolveDefectGeometry(
            box.component,
            box.detail,
            box.region,
            index,
            visualIssues.length,
            width,
            height,
            (box as any).coordinates
          );

          let strokeColor = '#F59E0B';
          let badgeBg = '#D97706';
          let categoryIcon = '📐';
          let categoryLabel = 'ALIGNMENT';

          if (isCorrected) {
            strokeColor = '#10B981';
            badgeBg = '#059669';
            categoryIcon = '✅';
            categoryLabel = 'RESOLVED';
          } else {
            switch (box.category) {
              case 'spelling':
                strokeColor = '#EF4444';
                badgeBg = '#DC2626';
                categoryIcon = '🔤';
                categoryLabel = 'SPELLING ERROR';
                break;
              case 'missing':
                strokeColor = '#E11D48';
                badgeBg = '#BE123C';
                categoryIcon = '🔲';
                categoryLabel = 'MISSING ELEMENT';
                break;
              case 'typography':
                strokeColor = '#6366F1';
                badgeBg = '#4F46E5';
                categoryIcon = '🔠';
                categoryLabel = 'TYPOGRAPHY';
                break;
              case 'alignment':
                strokeColor = '#F59E0B';
                badgeBg = '#D97706';
                categoryIcon = '📐';
                categoryLabel = 'ALIGNMENT';
                break;
              case 'ui':
              default:
                strokeColor = '#0284C7';
                badgeBg = '#0369A1';
                categoryIcon = '⚠️';
                categoryLabel = 'UI DEFECT';
                break;
            }
          }

          return {
            targetX: geom.targetX,
            targetY: geom.targetY,
            boxX: geom.boxX,
            boxY: geom.boxY,
            boxW: geom.boxW,
            boxH: geom.boxH,
            strokeColor,
            badgeBg,
            categoryIcon,
            categoryLabel,
            defectNumber: index + 1,
            component: box.component,
            detail: box.detail,
            isCorrected
          };
        });

        // Clean Header Banner
        const headerH = Math.max(32, Math.floor(height / 18));
        ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
        ctx.fillRect(0, 0, width, headerH);

        ctx.fillStyle = isCorrected ? '#34D399' : (visualIssues.length === 0 ? '#34D399' : '#FBBF24');
        const headerFont = Math.max(11, Math.floor(width / 68));
        ctx.font = `bold ${headerFont}px sans-serif`;

        const bannerTitle = isCorrected
          ? `✓ CORRECTED UI SPECIFICATION — ${pageTitle.toUpperCase()} — ALL DEFECTS RESOLVED`
          : (visualIssues.length === 0
            ? `✓ UI SPECIFICATION AUDIT — ${pageTitle.toUpperCase()} — PASSED (0 DEFECTS)`
            : `DEFECTS AUDIT — ${pageTitle.toUpperCase()} — ${visualIssues.length} DEFECT(S) HIGHLIGHTED`);

        ctx.fillText(bannerTitle, 14, headerH - 10);

        // Draw collision-free defect highlights
        drawNonOverlappingDefects(ctx, defectsToDraw, width, height, headerH, isCorrected);

        resolve({
          highlightedUrl: canvas.toDataURL('image/jpeg', 0.85),
          issuesCount: isCorrected ? 0 : visualIssues.length
        });
      };

      img.onerror = () => resolve({ highlightedUrl: originalDataUrl, issuesCount: 0 });
      img.src = originalDataUrl;
    });
  };

  // 2A. Canvas-based Figma Design Token & Specification Defect Audit Generator
  const generateFigmaIssueHighlightedScreenshot = (
    originalDataUrl: string,
    pageTitle: string,
    customDefects?: Array<{ id: number; label?: string; component?: string; detail: string; severity?: string; region?: string }>,
    pageIndex: number = 0,
    isCorrected: boolean = false
  ): Promise<{ highlightedUrl: string; issuesCount: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const rawW = img.width || 960;
        const rawH = img.height || 600;
        const maxDim = 960;
        const scale = rawW > maxDim ? maxDim / rawW : 1;
        const width = Math.round(rawW * scale);
        const height = Math.round(rawH * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ highlightedUrl: originalDataUrl, issuesCount: 0 });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const figmaIssues = customDefects || [];

        const defectsToDraw: DefectToDraw[] = figmaIssues.map((box, index) => {
          const geom = resolveDefectGeometry(
            box.component || box.label || 'Token Element',
            box.detail,
            box.region,
            index,
            figmaIssues.length,
            width,
            height,
            (box as any).coordinates
          );

          return {
            targetX: geom.targetX,
            targetY: geom.targetY,
            boxX: geom.boxX,
            boxY: geom.boxY,
            boxW: geom.boxW,
            boxH: geom.boxH,
            strokeColor: isCorrected ? '#10B981' : '#EF4444',
            badgeBg: isCorrected ? '#059669' : '#DC2626',
            categoryIcon: '📐',
            categoryLabel: box.label || 'FIGMA TOKEN',
            defectNumber: box.id || index + 1,
            component: box.component || 'Figma Element',
            detail: box.detail,
            isCorrected
          };
        });

        const headerH = Math.max(30, Math.floor(height / 20));
        ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
        ctx.fillRect(0, 0, width, headerH);

        ctx.fillStyle = isCorrected ? '#34D399' : (figmaIssues.length === 0 ? '#34D399' : '#F87171');
        const headerFont = Math.max(11, Math.floor(width / 70));
        ctx.font = `bold ${headerFont}px sans-serif`;
        const bannerTitle = isCorrected
          ? `✓ FIGMA TOKENS & SPECIFICATIONS RESOLVED — ${pageTitle.toUpperCase()}`
          : (figmaIssues.length === 0
            ? `✓ FIGMA SPECIFICATION AUDIT — ${pageTitle.toUpperCase()} — PASSED (0 DEFECTS)`
            : `FIGMA SPECIFICATION & TOKEN DEFECTS AUDIT — ${pageTitle.toUpperCase()} — ${figmaIssues.length} DEFECTS HIGHLIGHTED`);
        ctx.fillText(bannerTitle, 14, headerH - 10);

        // Draw collision-free defect highlights
        drawNonOverlappingDefects(ctx, defectsToDraw, width, height, headerH, isCorrected);

        resolve({
          highlightedUrl: canvas.toDataURL('image/jpeg', 0.85),
          issuesCount: isCorrected ? 0 : figmaIssues.length
        });
      };

      img.onerror = () => resolve({ highlightedUrl: originalDataUrl, issuesCount: 0 });
      img.src = originalDataUrl;
    });
  };

  // 2B. Canvas-based Figma Visual Component, Hierarchy & Accessibility Defects Generator
  const generateFigmaVisualDefectsScreenshot = (
    originalDataUrl: string,
    pageTitle: string,
    customDefects?: UIDefectItem[],
    pageIndex: number = 0,
    isCorrected: boolean = false
  ): Promise<{ highlightedUrl: string; issuesCount: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const rawW = img.width || 960;
        const rawH = img.height || 600;
        const maxDim = 960;
        const scale = rawW > maxDim ? maxDim / rawW : 1;
        const width = Math.round(rawW * scale);
        const height = Math.round(rawH * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ highlightedUrl: originalDataUrl, issuesCount: 0 });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const visualFigmaIssues = customDefects || [];

        const defectsToDraw: DefectToDraw[] = visualFigmaIssues.map((box, index) => {
          const geom = resolveDefectGeometry(
            box.component,
            box.detail,
            box.region,
            index,
            visualFigmaIssues.length,
            width,
            height,
            (box as any).coordinates
          );

          return {
            targetX: geom.targetX,
            targetY: geom.targetY,
            boxX: geom.boxX,
            boxY: geom.boxY,
            boxW: geom.boxW,
            boxH: geom.boxH,
            strokeColor: isCorrected ? '#10B981' : '#8B5CF6',
            badgeBg: isCorrected ? '#059669' : '#7C3AED',
            categoryIcon: '🎨',
            categoryLabel: 'FIGMA SPEC',
            defectNumber: box.id || index + 1,
            component: box.component,
            detail: box.detail || box.fix || box.component,
            isCorrected
          };
        });

        const headerH = Math.max(30, Math.floor(height / 20));
        ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
        ctx.fillRect(0, 0, width, headerH);

        ctx.fillStyle = isCorrected ? '#34D399' : (visualFigmaIssues.length === 0 ? '#34D399' : '#C4B5FD');
        const headerFont = Math.max(11, Math.floor(width / 70));
        ctx.font = `bold ${headerFont}px sans-serif`;
        const bannerTitle = isCorrected
          ? `✓ FIGMA DESIGN SPECIFICATIONS & TOKENS RESOLVED — ${pageTitle.toUpperCase()}`
          : (visualFigmaIssues.length === 0
            ? `✓ FIGMA DESIGN SYSTEM AUDIT — ${pageTitle.toUpperCase()} — PASSED (0 DEFECTS)`
            : `FIGMA SPECIFICATION & LAYOUT DEFECTS AUDIT — ${pageTitle.toUpperCase()} — ${visualFigmaIssues.length} DEFECTS HIGHLIGHTED`);
        ctx.fillText(bannerTitle, 14, headerH - 10);

        // Draw collision-free defect highlights
        drawNonOverlappingDefects(ctx, defectsToDraw, width, height, headerH, isCorrected);

        resolve({
          highlightedUrl: canvas.toDataURL('image/jpeg', 0.85),
          issuesCount: isCorrected ? 0 : visualFigmaIssues.length
        });
      };

      img.onerror = () => resolve({ highlightedUrl: originalDataUrl, issuesCount: 0 });
      img.src = originalDataUrl;
    });
  };

  // 3A. Canvas-based App vs Figma UI Comparison Discrepancy & Content Mismatch Generator
  const generateComparisonIssueHighlightedScreenshot = (
    appDataUrl: string,
    figmaDataUrl: string,
    pageTitle: string,
    customDefects?: Array<{ id: number; label?: string; component?: string; detail: string; severity?: string; region?: string }>,
    pageIndex: number = 0,
    isCorrected: boolean = false
  ): Promise<{ highlightedUrl: string; issuesCount: number }> => {
    return new Promise((resolve) => {
      const appImg = new Image();
      appImg.crossOrigin = 'anonymous';

      appImg.onload = () => {
        const canvas = document.createElement('canvas');
        const rawW = appImg.width || 960;
        const rawH = appImg.height || 600;
        const maxDim = 960;
        const scale = rawW > maxDim ? maxDim / rawW : 1;
        const width = Math.round(rawW * scale);
        const height = Math.round(rawH * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ highlightedUrl: appDataUrl, issuesCount: 0 });
          return;
        }

        ctx.drawImage(appImg, 0, 0, width, height);

        const compIssues = customDefects || [];

        const defectsToDraw: DefectToDraw[] = compIssues.map((box, index) => {
          const geom = resolveDefectGeometry(
            box.component || box.label || 'Mismatch Element',
            box.detail,
            box.region,
            index,
            compIssues.length,
            width,
            height,
            (box as any).coordinates
          );

          return {
            targetX: geom.targetX,
            targetY: geom.targetY,
            boxX: geom.boxX,
            boxY: geom.boxY,
            boxW: geom.boxW,
            boxH: geom.boxH,
            strokeColor: isCorrected ? '#10B981' : '#E11D48',
            badgeBg: isCorrected ? '#059669' : '#BE123C',
            categoryIcon: '⚠️',
            categoryLabel: box.label || 'DISCREPANCY',
            defectNumber: box.id || index + 1,
            component: box.component || 'Mismatch Area',
            detail: box.detail,
            isCorrected
          };
        });

        const headerH = Math.max(30, Math.floor(height / 20));
        ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
        ctx.fillRect(0, 0, width, headerH);

        ctx.fillStyle = isCorrected ? '#34D399' : (compIssues.length === 0 ? '#34D399' : '#FDA4AF');
        const headerFont = Math.max(11, Math.floor(width / 70));
        ctx.font = `bold ${headerFont}px sans-serif`;
        const bannerTitle = isCorrected
          ? `✓ FIGMA VS APP DISCREPANCIES RESOLVED — ${pageTitle.toUpperCase()}`
          : (compIssues.length === 0
            ? `✓ FIGMA VS APP COMPARISON — ${pageTitle.toUpperCase()} — 100% MATCH (0 MISMATCHES)`
            : `FIGMA VS APPLICATION DISCREPANCY AUDIT — ${pageTitle.toUpperCase()} — ${compIssues.length} MISMATCHES HIGHLIGHTED`);
        ctx.fillText(bannerTitle, 14, headerH - 10);

        // Draw collision-free defect highlights
        drawNonOverlappingDefects(ctx, defectsToDraw, width, height, headerH, isCorrected);

        resolve({
          highlightedUrl: canvas.toDataURL('image/jpeg', 0.85),
          issuesCount: isCorrected ? 0 : compIssues.length
        });
      };

      appImg.onerror = () => resolve({ highlightedUrl: appDataUrl, issuesCount: 0 });
      appImg.src = appDataUrl;
    });
  };

  // 3B. Canvas-based App vs Figma UI Comparison Visual & Styling Drift Generator
  const generateComparisonVisualDefectsScreenshot = (
    appDataUrl: string,
    figmaDataUrl: string,
    pageTitle: string,
    customDefects?: UIDefectItem[],
    pageIndex: number = 0,
    isCorrected: boolean = false
  ): Promise<{ highlightedUrl: string; issuesCount: number }> => {
    return new Promise((resolve) => {
      const appImg = new Image();
      appImg.crossOrigin = 'anonymous';

      appImg.onload = () => {
        const canvas = document.createElement('canvas');
        const rawW = appImg.width || 960;
        const rawH = appImg.height || 600;
        const maxDim = 960;
        const scale = rawW > maxDim ? maxDim / rawW : 1;
        const width = Math.round(rawW * scale);
        const height = Math.round(rawH * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ highlightedUrl: appDataUrl, issuesCount: 0 });
          return;
        }

        ctx.drawImage(appImg, 0, 0, width, height);

        const visualCompIssues = customDefects || [];

        const defectsToDraw: DefectToDraw[] = visualCompIssues.map((box, index) => {
          const geom = resolveDefectGeometry(
            box.component,
            box.detail,
            box.region,
            index,
            visualCompIssues.length,
            width,
            height,
            (box as any).coordinates
          );

          return {
            targetX: geom.targetX,
            targetY: geom.targetY,
            boxX: geom.boxX,
            boxY: geom.boxY,
            boxW: geom.boxW,
            boxH: geom.boxH,
            strokeColor: isCorrected ? '#10B981' : '#0EA5E9',
            badgeBg: isCorrected ? '#059669' : '#0284C7',
            categoryIcon: '📐',
            categoryLabel: 'SPEC DRIFT',
            defectNumber: box.id || index + 1,
            component: box.component,
            detail: box.detail || box.fix || box.component,
            isCorrected
          };
        });

        const headerH = Math.max(30, Math.floor(height / 20));
        ctx.fillStyle = 'rgba(15, 23, 42, 0.96)';
        ctx.fillRect(0, 0, width, headerH);

        ctx.fillStyle = isCorrected ? '#34D399' : (visualCompIssues.length === 0 ? '#34D399' : '#7DD3FC');
        const headerFont = Math.max(11, Math.floor(width / 70));
        ctx.font = `bold ${headerFont}px sans-serif`;
        const bannerTitle = isCorrected
          ? `✓ FIGMA VS APP VISUAL DRIFT RESOLVED — ${pageTitle.toUpperCase()}`
          : (visualCompIssues.length === 0
            ? `✓ FIGMA VS APP STYLING DRIFT AUDIT — ${pageTitle.toUpperCase()} — PASSED (0 DEFECTS)`
            : `FIGMA VS APPLICATION VISUAL STYLING DRIFT — ${pageTitle.toUpperCase()} — ${visualCompIssues.length} DEFECTS HIGHLIGHTED`);
        ctx.fillText(bannerTitle, 14, headerH - 10);

        // Draw collision-free defect highlights
        drawNonOverlappingDefects(ctx, defectsToDraw, width, height, headerH, isCorrected);

        resolve({
          highlightedUrl: canvas.toDataURL('image/jpeg', 0.85),
          issuesCount: isCorrected ? 0 : visualCompIssues.length
        });
      };

      appImg.onerror = () => resolve({ highlightedUrl: appDataUrl, issuesCount: 0 });
      appImg.src = appDataUrl;
    });
  };

  // Canvas-based Corrected UI Image Generation
  const generateCorrectedUIImage = (
    originalDataUrl: string,
    isColorContrast: boolean,
    pageTitle: string = 'Application Screen',
    customDefectCount: number = 0,
    customDefects?: UIDefectItem[]
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const rawW = img.width || 960;
        const rawH = img.height || 600;
        const maxDim = 960;
        const scale = rawW > maxDim ? maxDim / rawW : 1;
        const width = Math.round(rawW * scale);
        const height = Math.round(rawH * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(originalDataUrl);
          return;
        }

        // Draw original screenshot
        ctx.drawImage(img, 0, 0, width, height);

        // Header Banner
        const headerH = Math.max(36, Math.floor(height * 0.07));
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(0, 0, width, headerH);

        ctx.fillStyle = '#00E1C5';
        ctx.font = `bold ${Math.max(11, Math.floor(width / 68))}px sans-serif`;
        const bannerTitle = isColorContrast
          ? `✓ CORRECTED UI SPECIFICATION: WCAG 2.1 AA/AAA CONTRAST & ACCESSIBILITY`
          : `✓ CORRECTED UI SPECIFICATION — ${pageTitle.toUpperCase()} — ALL DEFECTS RESOLVED`;
        ctx.fillText(bannerTitle, 14, headerH - 12);

        // If defects are passed, draw non-overlapping green resolution callouts
        const defectsList = customDefects || [];
        if (defectsList.length > 0) {
          const defectsToDraw: DefectToDraw[] = defectsList.map((box, index) => {
            const geom = resolveDefectGeometry(
              box.component,
              box.detail,
              box.region,
              index,
              defectsList.length,
              width,
              height,
              (box as any).coordinates
            );
            return {
              targetX: geom.targetX,
              targetY: geom.targetY,
              boxX: geom.boxX,
              boxY: geom.boxY,
              boxW: geom.boxW,
              boxH: geom.boxH,
              strokeColor: '#10B981',
              badgeBg: '#059669',
              categoryIcon: '✅',
              categoryLabel: 'RESOLVED',
              defectNumber: box.id || index + 1,
              component: box.component,
              detail: box.fix || `Corrected & verified: ${box.detail}`,
              isCorrected: true
            };
          });

          drawNonOverlappingDefects(ctx, defectsToDraw, width, height, headerH, true);
        } else {
          // Elegant top status badges
          const badge1W = Math.min(300, Math.floor(width * 0.45));
          const badge2W = Math.min(270, Math.floor(width * 0.42));
          ctx.fillStyle = 'rgba(16, 185, 129, 0.95)';
          drawCanvasRoundRect(ctx, 14, headerH + 8, badge1W, 26, 4);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('✓ WCAG 2.1 AA Contrast Verified (≥ 4.5:1 ratio)', 22, headerH + 25);

          if (width > 640) {
            ctx.fillStyle = 'rgba(14, 165, 233, 0.95)';
            drawCanvasRoundRect(ctx, 22 + badge1W, headerH + 8, badge2W, 26, 4);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('✓ Touch Targets & Spacing: Standardized', 30 + badge1W, headerH + 25);
          }
        }

        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };

      img.onerror = () => resolve(originalDataUrl);
      img.src = originalDataUrl;
    });
  };

  const handleGenerateCorrectedImage = async () => {
    if (isGeneratingCorrectedImage) return;
    setIsGeneratingCorrectedImage(true);
    try {
      const screensToProcess: Array<{ src: string; title: string }> = [];
      if (appInputMode === 'screenshot' && (screenshots.length > 0 || contrastOutputs.length > 0)) {
        if (screenshots.length > 0) {
          screenshots.forEach((s, i) => screensToProcess.push({ src: getImageData(s), title: getImageName(s, `Page ${i + 1}: Application Screenshot`) }));
        } else {
          contrastOutputs.forEach(o => screensToProcess.push({ src: o.originalImage, title: o.pageTitle }));
        }
      } else if (appInputMode === 'video' && appVideos.length > 0) {
        const activeVideoFrames = appVideos.flatMap(v => v.frames);
        activeVideoFrames.forEach(vf => screensToProcess.push({ src: vf.image, title: `Video Keyframe Screen @ Timestamp ${vf.timestamp}` }));
      } else if (appInputMode === 'doc' && appDocs.length > 0) {
        appDocs.forEach(d => screensToProcess.push({ src: createDocumentCanvasImage(d.name, d.content), title: `Document Requirement Page: ${d.name}` }));
      } else if (appInputMode === 'url' && appUrl.trim()) {
        screensToProcess.push({ src: urlCaptureData?.screenshot || createUrlCanvasImage(appUrl.trim(), urlCaptureData), title: `Target Application URL: ${urlCaptureData?.pageTitle || appUrl.trim()}` });
      } else if (contrastOutputs.length > 0) {
        contrastOutputs.forEach(o => screensToProcess.push({ src: o.originalImage, title: o.pageTitle }));
      }

      if (screensToProcess.length === 0) {
        toast.error('Please upload an image screenshot, video, document, or enter a target URL to generate corrected UI images.');
        setIsGeneratingCorrectedImage(false);
        return;
      }

      const allCorrected: Array<{ id: string; pageTitle: string; originalImage: string; correctedImage: string }> = [];
      for (let i = 0; i < screensToProcess.length; i++) {
        const { src, title: pageTitle } = screensToProcess[i];
        const pageDefects = report ? extractPageSpecificDefects(report, i, pageTitle, screensToProcess.length, 'ui', true) : { visualDefects: [] };
        const corrected = await generateCorrectedUIImage(
          getImageData(src),
          checkColorContrast || isReportWithContrast,
          pageTitle,
          pageDefects.visualDefects.length,
          pageDefects.visualDefects
        );
        allCorrected.push({
          id: Math.random().toString(36).substring(2, 9),
          pageTitle,
          originalImage: src,
          correctedImage: corrected
        });
      }

      setCorrectedScreenshots(allCorrected);
      if (allCorrected.length > 0) {
        setCorrectedImage(allCorrected[0].correctedImage);
      }
      toast.success(`Generated ${allCorrected.length} corrected UI image mockup(s)!`);
    } catch (err) {
      console.error('Error generating corrected images:', err);
      toast.error('Failed to generate corrected images');
    } finally {
      setIsGeneratingCorrectedImage(false);
    }
  };

  const compressForStorage = async (dataUrl?: string | null): Promise<string> => {
    if (!dataUrl) return '';
    if (!dataUrl.startsWith('data:image/')) return dataUrl;
    try {
      return await compressImage(dataUrl, 720, 720, 0.65);
    } catch {
      return dataUrl;
    }
  };

  const compressListForStorage = async (list: (string | undefined)[] = []): Promise<string[]> => {
    const validList = list.filter((s): s is string => !!s);
    return Promise.all(validList.map(s => compressForStorage(s)));
  };

  const handleSaveAppUIReport = async () => {
    if (!report) {
      toast.error('No UI Review report available to save. Please generate a report first.');
      return;
    }
    if (isSavingAppReport) return;

    setIsSavingAppReport(true);
    try {
      const appName = project.name || 'AutomatiQA App';
      const name = appSaveName.trim() || `${appName} - App UI Review - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const targetFolderId = appSaveFolderId && appSaveFolderId !== 'root' ? appSaveFolderId : (selectedFolderId && selectedFolderId !== 'root' && selectedFolderId !== 'unassigned' ? selectedFolderId : undefined);
      const targetFolder = folders.find(f => f.id === targetFolderId);

      const reportId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
        ? crypto.randomUUID() 
        : 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

      const rawInputScreenshots = screenshots.length > 0
        ? screenshots.map(s => getImageData(s))
        : (contrastOutputs.length > 0
            ? contrastOutputs.map(o => o.originalImage)
            : (urlCaptureData?.screenshot ? [urlCaptureData.screenshot] : []));

      const inputScreenshots = await compressListForStorage(rawInputScreenshots);
      const highlightedList = (isReportWithContrast && contrastOutputs.length > 0)
        ? contrastOutputs.map(o => o.issueHighlightedImage)
        : (isReportWithContrast ? highlightedScreenshots : []);
      const visualDefectsList = contrastOutputs.length > 0 ? contrastOutputs.map(o => o.visualDefectsImage) : visualDefectsScreenshots;
      
      const [compHighlighted, compVisualDefects, compCorrectedImg] = await Promise.all([
        compressListForStorage(highlightedList),
        compressListForStorage(visualDefectsList),
        correctedImage ? compressForStorage(correctedImage) : Promise.resolve(null)
      ]);

      // Persist full fidelity artifact bundle to server disk & IndexedDB
      let permanentBundle: any = {
        report,
        highlightedScreenshots: compHighlighted,
        visualDefectsScreenshots: compVisualDefects,
        correctedImage: compCorrectedImg,
        correctedScreenshots: correctedScreenshots.length > 0 ? correctedScreenshots : undefined,
        contrastOutputs: contrastOutputs.length > 0 ? contrastOutputs : undefined,
        screenshots: inputScreenshots,
        docs: appDocs.map(d => ({ name: d.name, content: d.content })),
        videos: appVideos,
        appUrl: appUrl.trim() || undefined
      };

      try {
        const savedArtifactRes = await saveReportArtifacts(reportId, permanentBundle, { 
          projectId: project.id, 
          folderId: targetFolderId, 
          category: 'APP UI REVIEW' 
        });
        if (savedArtifactRes && savedArtifactRes.permanentBundle) {
          permanentBundle = savedArtifactRes.permanentBundle;
        }
      } catch (artErr) {
        console.warn('[UITesting] Artifact bundle persistence warning (continuing save):', artErr);
      }

      // Prepare video entries for Firestore & state - strip non-serializable binary Blob references so JSON / Firestore never crashes!
      const safeVideos = appVideos.map(v => ({
        id: v.id,
        name: v.name,
        url: v.url,
        size: v.size,
        type: v.type,
        frames: (v.frames || []).slice(0, 5)
      }));

      const newReport: UITestingReport = {
        id: reportId,
        appName,
        name,
        report,
        highlightedScreenshots: permanentBundle.highlightedScreenshots && permanentBundle.highlightedScreenshots.length > 0 ? permanentBundle.highlightedScreenshots : compHighlighted,
        visualDefectsScreenshots: permanentBundle.visualDefectsScreenshots && permanentBundle.visualDefectsScreenshots.length > 0 ? permanentBundle.visualDefectsScreenshots : compVisualDefects,
        correctedReport: correctedReport || undefined,
        correctedImage: permanentBundle.correctedImage || compCorrectedImg || undefined,
        correctedScreenshots: permanentBundle.correctedScreenshots && permanentBundle.correctedScreenshots.length > 0 ? permanentBundle.correctedScreenshots : (correctedScreenshots.length > 0 ? correctedScreenshots : undefined),
        screenshots: permanentBundle.screenshots && permanentBundle.screenshots.length > 0 ? permanentBundle.screenshots : inputScreenshots,
        appUrl: appUrl.trim() || undefined,
        docs: appDocs.map(d => ({ name: d.name, content: d.content })),
        videos: safeVideos,
        timestamp: new Date().toISOString(),
        folderId: targetFolderId,
        category: 'APP UI REVIEW',
        companyStandards: appCompanyStandards.trim() || undefined,
        standardRequirement: appStandardRequirement,
      };

      // If there were video, document, or screenshot inputs, also persist as input artifacts under the concern folder
      const currentInputs = savedInputs.length > 0 ? savedInputs : (project.uiTestingInputs || []);
      let updatedInputs = [...currentInputs];

      if (appVideos.length > 0 || appDocs.length > 0 || inputScreenshots.length > 0 || appUrl.trim()) {
        const inputId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
          ? crypto.randomUUID() 
          : 'inp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

        let permInputBundle: any = {
          screenshots: inputScreenshots,
          docs: appDocs.map(d => ({ name: d.name, content: d.content })),
          videos: appVideos
        };

        try {
          const resInput = await saveReportArtifacts(inputId, permInputBundle, { 
            projectId: project.id, 
            folderId: targetFolderId, 
            category: 'INPUT ASSETS' 
          });
          if (resInput && resInput.permanentBundle) {
            permInputBundle = resInput.permanentBundle;
          }
        } catch (inputArtErr) {
          console.warn('[UITesting] Input asset bundle persistence warning:', inputArtErr);
        }

        const newInputItem: UITestingInput = {
          id: inputId,
          appName,
          name: `${name} (Input Assets)`,
          screenshots: permInputBundle.screenshots && permInputBundle.screenshots.length > 0 ? permInputBundle.screenshots : inputScreenshots,
          appUrl: appUrl.trim(),
          designLink: designLink.trim(),
          promptInputs: `Associated input assets for report: ${name}`,
          timestamp: new Date().toISOString(),
          folderId: targetFolderId,
          videos: safeVideos,
          docs: appDocs.map(d => ({ name: d.name, content: d.content }))
        };
        updatedInputs.push(newInputItem);
      }

      const currentReports = savedReports.length > 0 ? savedReports : (project.uiTestingReports || []);
      const updatedReports = [...currentReports, newReport];

      setHydratedReports(updatedReports);
      setHydratedInputs(updatedInputs);

      onUpdateProject({
        ...project,
        uiTestingReports: updatedReports,
        uiTestingInputs: updatedInputs
      });

      if (targetFolderId) {
        setSelectedFolderId(targetFolderId);
      }
      setIsAppSaved(true);
      toast.success(`Saved report "${name}" to ${targetFolder ? `folder "${targetFolder.name}"` : 'Root Folder'}! (${updatedReports.length} total reports)`);
    } catch (err: any) {
      console.error('[UITesting] Error saving App UI Report to folder:', err);
      toast.error(`Failed to save report: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSavingAppReport(false);
    }
  };

  const handleSaveFigmaReview = async () => {
    if (!figmaReviewReport) {
      toast.error('No Figma review report available to save. Please generate a review first.');
      return;
    }
    if (isSavingFigmaReview) return;

    setIsSavingFigmaReview(true);
    try {
      const appName = project.name || 'AutomatiQA App';
      const name = figmaSaveName.trim() || `${appName} - Figma Review - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const targetFolderId = figmaSaveFolderId && figmaSaveFolderId !== 'root' ? figmaSaveFolderId : (selectedFolderId && selectedFolderId !== 'root' && selectedFolderId !== 'unassigned' ? selectedFolderId : undefined);
      const targetFolder = folders.find(f => f.id === targetFolderId);

      const reviewId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
        ? crypto.randomUUID() 
        : 'fig_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

      const rawInputImages = figmaImages.length > 0
        ? figmaImages.map(s => getImageData(s))
        : (figmaContrastOutputs.length > 0
            ? figmaContrastOutputs.map(o => o.originalImage)
            : (figmaUrlCaptureData?.screenshot ? [figmaUrlCaptureData.screenshot] : []));

      const inputImages = await compressListForStorage(rawInputImages);
      const highlightedList = figmaHighlightedScreenshots.length > 0 ? figmaHighlightedScreenshots : (figmaContrastOutputs.length > 0 ? figmaContrastOutputs.map(o => o.issueHighlightedImage) : []);
      const visualDefectsList = figmaVisualDefectsScreenshots.length > 0 ? figmaVisualDefectsScreenshots : (figmaContrastOutputs.length > 0 ? figmaContrastOutputs.map(o => o.visualDefectsImage) : []);

      const [compHighlighted, compVisualDefects] = await Promise.all([
        compressListForStorage(highlightedList),
        compressListForStorage(visualDefectsList)
      ]);

      // Persist to server disk & IndexedDB
      let permanentBundle: any = {
        analysisReport: figmaReviewReport,
        highlightedScreenshots: compHighlighted,
        visualDefectsScreenshots: compVisualDefects,
        images: inputImages,
        docs: figmaDocs.map(d => ({ name: d.name, content: d.content })),
        figmaUrl: figmaUrl.trim() || undefined
      };

      try {
        const savedArtifactRes = await saveReportArtifacts(reviewId, permanentBundle, { 
          projectId: project.id, 
          folderId: targetFolderId, 
          category: 'FIGMA DESIGN REVIEW' 
        });
        if (savedArtifactRes && savedArtifactRes.permanentBundle) {
          permanentBundle = savedArtifactRes.permanentBundle;
        }
      } catch (artErr) {
        console.warn('[UITesting] Figma artifact bundle persistence warning (continuing save):', artErr);
      }

      const newReview: FigmaDesignReview = {
        id: reviewId,
        appName,
        name,
        images: permanentBundle.images && permanentBundle.images.length > 0 ? permanentBundle.images : inputImages,
        docs: figmaDocs.map(d => ({ name: d.name, content: d.content })),
        figmaUrl: figmaUrl.trim() || undefined,
        analysisReport: figmaReviewReport,
        highlightedScreenshots: permanentBundle.highlightedScreenshots && permanentBundle.highlightedScreenshots.length > 0 ? permanentBundle.highlightedScreenshots : compHighlighted,
        visualDefectsScreenshots: permanentBundle.visualDefectsScreenshots && permanentBundle.visualDefectsScreenshots.length > 0 ? permanentBundle.visualDefectsScreenshots : compVisualDefects,
        correctedReport: figmaCorrectedReport || undefined,
        timestamp: new Date().toISOString(),
        folderId: targetFolderId,
        companyStandards: figmaCompanyStandards.trim() || undefined,
        standardRequirement: figmaStandardRequirement,
      };

      const currentInputs = savedInputs.length > 0 ? savedInputs : (project.uiTestingInputs || []);
      let updatedInputs = [...currentInputs];

      if (figmaDocs.length > 0 || inputImages.length > 0 || figmaUrl.trim()) {
        const inputId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
          ? crypto.randomUUID() 
          : 'inp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

        let permInputBundle: any = {
          images: inputImages,
          docs: figmaDocs.map(d => ({ name: d.name, content: d.content }))
        };

        try {
          const resInput = await saveReportArtifacts(inputId, permInputBundle, { 
            projectId: project.id, 
            folderId: targetFolderId, 
            category: 'FIGMA ASSETS' 
          });
          if (resInput && resInput.permanentBundle) {
            permInputBundle = resInput.permanentBundle;
          }
        } catch (inputArtErr) {
          console.warn('[UITesting] Figma input asset bundle persistence warning:', inputArtErr);
        }

        const newInputItem: UITestingInput = {
          id: inputId,
          appName,
          name: `${name} (Figma Assets)`,
          screenshots: permInputBundle.images && permInputBundle.images.length > 0 ? permInputBundle.images : inputImages,
          appUrl: '',
          designLink: figmaUrl.trim(),
          promptInputs: `Figma Design Assets for: ${name}`,
          timestamp: new Date().toISOString(),
          folderId: targetFolderId,
          docs: figmaDocs.map(d => ({ name: d.name, content: d.content }))
        };
        updatedInputs.push(newInputItem);
      }

      const currentReviews = savedFigmaReviews.length > 0 ? savedFigmaReviews : (project.figmaDesignReviews || []);
      const updatedReviews = [...currentReviews, newReview];

      setHydratedFigmaReviews(updatedReviews);
      setHydratedInputs(updatedInputs);

      onUpdateProject({
        ...project,
        figmaDesignReviews: updatedReviews,
        uiTestingInputs: updatedInputs
      });

      if (targetFolderId) {
        setSelectedFolderId(targetFolderId);
      }
      setIsFigmaSaved(true);
      toast.success(`Saved Figma review "${name}" to ${targetFolder ? `folder "${targetFolder.name}"` : 'Root Folder'}! (${updatedReviews.length} total reviews)`);
    } catch (err: any) {
      console.error('[UITesting] Error saving Figma review to folder:', err);
      toast.error(`Failed to save Figma review: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSavingFigmaReview(false);
    }
  };

  const handleSaveComparison = async () => {
    if (!compReport) {
      toast.error('No Comparison report available to save. Please generate a comparison first.');
      return;
    }
    if (isSavingComparison) return;

    setIsSavingComparison(true);
    try {
      const appName = project.name || 'AutomatiQA App';
      const name = compSaveName.trim() || `${appName} - Figma vs App Comparison - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const targetFolderId = compSaveFolderId && compSaveFolderId !== 'root' ? compSaveFolderId : (selectedFolderId && selectedFolderId !== 'root' && selectedFolderId !== 'unassigned' ? selectedFolderId : undefined);
      const targetFolder = folders.find(f => f.id === targetFolderId);

      const comparisonId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
        ? crypto.randomUUID() 
        : 'comp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

      const rawAppImages = compAppImages.length > 0
        ? compAppImages.map(s => getImageData(s))
        : (compContrastOutputs.length > 0 ? compContrastOutputs.map(o => o.appImage || '') : []);
      const rawFigmaImages = compFigmaImages.length > 0
        ? compFigmaImages.map(s => getImageData(s))
        : (compContrastOutputs.length > 0 ? compContrastOutputs.map(o => o.figmaImage || '') : []);

      const [appScreenshots, figmaImages, compHighlighted, compVisualDefects] = await Promise.all([
        compressListForStorage(rawAppImages),
        compressListForStorage(rawFigmaImages),
        compressListForStorage(compHighlightedScreenshots.length > 0 ? compHighlightedScreenshots : (compContrastOutputs.length > 0 ? compContrastOutputs.map(o => o.issueHighlightedImage) : [])),
        compressListForStorage(compVisualDefectsScreenshots.length > 0 ? compVisualDefectsScreenshots : (compContrastOutputs.length > 0 ? compContrastOutputs.map(o => o.visualDefectsImage) : []))
      ]);

      // Persist full fidelity artifact bundle to server disk & IndexedDB
      let permanentBundle: any = {
        comparisonReport: compReport,
        highlightedScreenshots: compHighlighted,
        visualDefectsScreenshots: compVisualDefects,
        appScreenshots,
        figmaImages,
        docs: [...compAppDocs, ...compFigmaDocs].map(d => ({ name: d.name, content: d.content })),
        videos: compAppVideos,
        appUrl: compAppUrl.trim() || undefined,
        figmaUrl: compFigmaUrl.trim() || undefined
      };

      try {
        const savedArtifactRes = await saveReportArtifacts(comparisonId, permanentBundle, { 
          projectId: project.id, 
          folderId: targetFolderId, 
          category: 'FIGMA VS APP COMPARISON' 
        });
        if (savedArtifactRes && savedArtifactRes.permanentBundle) {
          permanentBundle = savedArtifactRes.permanentBundle;
        }
      } catch (artErr) {
        console.warn('[UITesting] Comparison artifact bundle persistence warning (continuing save):', artErr);
      }

      const safeCompVideos = compAppVideos.map(v => ({
        id: v.id,
        name: v.name,
        url: v.url,
        size: v.size,
        type: v.type,
        frames: (v.frames || []).slice(0, 5)
      }));

      const newComparison: UIComparisonReport = {
        id: comparisonId,
        appName,
        name,
        appScreenshots: permanentBundle.appScreenshots && permanentBundle.appScreenshots.length > 0 ? permanentBundle.appScreenshots : appScreenshots,
        appUrl: compAppUrl.trim() || undefined,
        appVideos: safeCompVideos,
        figmaImages: permanentBundle.figmaImages && permanentBundle.figmaImages.length > 0 ? permanentBundle.figmaImages : figmaImages,
        figmaDocs: compFigmaDocs.map(d => ({ name: d.name, content: d.content })),
        figmaUrl: compFigmaUrl.trim() || undefined,
        comparisonReport: compReport,
        highlightedScreenshots: permanentBundle.highlightedScreenshots && permanentBundle.highlightedScreenshots.length > 0 ? permanentBundle.highlightedScreenshots : compHighlighted,
        visualDefectsScreenshots: permanentBundle.visualDefectsScreenshots && permanentBundle.visualDefectsScreenshots.length > 0 ? permanentBundle.visualDefectsScreenshots : compVisualDefects,
        resolutionGuide: compResolutionGuide,
        timestamp: new Date().toISOString(),
        folderId: targetFolderId,
        companyStandards: compCompanyStandards.trim() || undefined,
        standardRequirement: compStandardRequirement,
      };

      const currentInputs = savedInputs.length > 0 ? savedInputs : (project.uiTestingInputs || []);
      let updatedInputs = [...currentInputs];

      if (compAppVideos.length > 0 || compAppDocs.length > 0 || compFigmaDocs.length > 0 || appScreenshots.length > 0 || figmaImages.length > 0 || compAppUrl.trim() || compFigmaUrl.trim()) {
        const inputId = (typeof crypto !== 'undefined' && crypto.randomUUID) 
          ? crypto.randomUUID() 
          : 'inp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

        let permInputBundle: any = {
          screenshots: appScreenshots,
          images: figmaImages,
          docs: [...compAppDocs, ...compFigmaDocs].map(d => ({ name: d.name, content: d.content })),
          videos: compAppVideos
        };

        try {
          const resInput = await saveReportArtifacts(inputId, permInputBundle, { 
            projectId: project.id, 
            folderId: targetFolderId, 
            category: 'COMPARISON ASSETS' 
          });
          if (resInput && resInput.permanentBundle) {
            permInputBundle = resInput.permanentBundle;
          }
        } catch (inputArtErr) {
          console.warn('[UITesting] Comparison input asset bundle persistence warning:', inputArtErr);
        }

        const newInputItem: UITestingInput = {
          id: inputId,
          appName,
          name: `${name} (Comparison Assets)`,
          screenshots: [...(permInputBundle.screenshots || appScreenshots), ...(permInputBundle.images || figmaImages)],
          appUrl: compAppUrl.trim(),
          designLink: compFigmaUrl.trim(),
          promptInputs: `Comparison Input Assets for: ${name}`,
          timestamp: new Date().toISOString(),
          folderId: targetFolderId,
          videos: safeCompVideos,
          docs: [...compAppDocs, ...compFigmaDocs].map(d => ({ name: d.name, content: d.content }))
        };
        updatedInputs.push(newInputItem);
      }

      const currentComparisons = savedComparisonReports.length > 0 ? savedComparisonReports : (project.uiComparisonReports || []);
      const updatedComparisons = [...currentComparisons, newComparison];

      setHydratedComparisonReports(updatedComparisons);
      setHydratedInputs(updatedInputs);

      onUpdateProject({
        ...project,
        uiComparisonReports: updatedComparisons,
        uiTestingInputs: updatedInputs
      });

      if (targetFolderId) {
        setSelectedFolderId(targetFolderId);
      }
      setIsCompSaved(true);
      toast.success(`Saved comparison "${name}" to ${targetFolder ? `folder "${targetFolder.name}"` : 'Root Folder'}! (${updatedComparisons.length} total comparisons)`);
    } catch (err: any) {
      console.error('[UITesting] Error saving comparison to folder:', err);
      toast.error(`Failed to save comparison: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSavingComparison(false);
    }
  };

  const handlePlayVideo = async (videoItem: { id?: string; name: string; url?: string; blob?: any; dataUrl?: string; frames?: { timestamp: string; image: string }[] }) => {
    if (!videoItem) return;
    try {
      const resolvedUrl = await resolveVideoPlayableUrl(videoItem);
      setPreviewModal({
        isOpen: true,
        type: 'video',
        title: videoItem.name,
        url: resolvedUrl || videoItem.url || '',
        frames: videoItem.frames || [],
        videoBlob: videoItem.blob
      });
    } catch (err) {
      console.warn('Error resolving video playable url:', err);
      setPreviewModal({
        isOpen: true,
        type: 'video',
        title: videoItem.name,
        url: videoItem.url || '',
        frames: videoItem.frames || [],
        videoBlob: videoItem.blob
      });
    }
  };

  const handleOpenRepoItem = async (type: 'report' | 'figma' | 'comparison', item: any) => {
    let targetItem = item;
    try {
      targetItem = await hydrateReportArtifacts(item);
    } catch {
      targetItem = item;
    }
    setSelectedRepoItem({ type, item: targetItem });
    setIsEditingRepoItem(false);
    setEditedItemName(targetItem.name || '');
    setEditedItemContent(type === 'report' ? targetItem.report || '' : type === 'figma' ? targetItem.analysisReport || '' : targetItem.comparisonReport || '');
    setEditedItemCorrected(targetItem.correctedReport || targetItem.resolutionGuide || '');
    setEditedItemStandards(targetItem.companyStandards || '');
    setRepoModalTab('all');
  };

  const handleCommitRepoItemEdit = async () => {
    if (!selectedRepoItem) return;
    const { type, item } = selectedRepoItem;
    const trimmedName = editedItemName.trim() || item.name;

    const updatedItem = {
      ...item,
      name: trimmedName,
      companyStandards: editedItemStandards.trim() || undefined,
      lastModified: new Date().toISOString()
    };

    if (type === 'report') {
      updatedItem.report = editedItemContent;
      if (editedItemCorrected) updatedItem.correctedReport = editedItemCorrected;
      const updatedList = (project.uiTestingReports || []).map(r => r.id === item.id ? updatedItem : r);
      onUpdateProject({ ...project, uiTestingReports: updatedList });
    } else if (type === 'figma') {
      updatedItem.analysisReport = editedItemContent;
      if (editedItemCorrected) updatedItem.correctedReport = editedItemCorrected;
      const updatedList = (project.figmaDesignReviews || []).map(f => f.id === item.id ? updatedItem : f);
      onUpdateProject({ ...project, figmaDesignReviews: updatedList });
    } else {
      updatedItem.comparisonReport = editedItemContent;
      if (editedItemCorrected) updatedItem.resolutionGuide = editedItemCorrected;
      const updatedList = (project.uiComparisonReports || []).map(c => c.id === item.id ? updatedItem : c);
      onUpdateProject({ ...project, uiComparisonReports: updatedList });
    }

    try {
      await saveReportArtifacts(item.id, {
        report: type === 'report' ? editedItemContent : undefined,
        analysisReport: type === 'figma' ? editedItemContent : undefined,
        comparisonReport: type === 'comparison' ? editedItemContent : undefined,
        correctedReport: editedItemCorrected,
        resolutionGuide: type === 'comparison' ? editedItemCorrected : undefined,
        ...item
      });
    } catch (e) {
      console.warn('Failed to update artifact cache in IndexedDB', e);
    }

    setSelectedRepoItem({ type, item: updatedItem });
    setIsEditingRepoItem(false);
    toast.success(`Committed changes to "${trimmedName}" in folder successfully!`);
    await logActivity(user.email, user.name, `Committed updates to UI Testing item "${trimmedName}"`, project.id, project.name);
  };

  const handleLoadRepoItemIntoWorkspace = (type: 'report' | 'figma' | 'comparison', item: any) => {
    if (type === 'report') {
      setActiveTab('testing');
      setReport(item.report || null);
      setCorrectedReport(item.correctedReport || null);
      setCorrectedImage(item.correctedImage || null);
      if (item.highlightedScreenshots && item.highlightedScreenshots.length > 0) {
        setHighlightedScreenshots(item.highlightedScreenshots);
      }
      if (item.visualDefectsScreenshots && item.visualDefectsScreenshots.length > 0) {
        setVisualDefectsScreenshots(item.visualDefectsScreenshots);
      }
      if (item.correctedScreenshots && item.correctedScreenshots.length > 0) {
        setCorrectedScreenshots(item.correctedScreenshots);
      }
      
      // Reconstruct contrastOutputs to display correct screenshots under identified issues
      const origs = item.screenshots || [];
      const highlist = item.highlightedScreenshots || [];
      const vislist = item.visualDefectsScreenshots || [];
      const corrlist = item.correctedScreenshots || [];
      const isWithContrast = highlist.length > 0;
      
      const loadedOutputs = (origs.length > 0 ? origs : (vislist.length > 0 ? vislist : highlist)).map((orig: string, idx: number) => {
        let pageTitle = `Page ${idx + 1}`;
        if (item.videos && item.videos[0]?.frames?.[idx]) {
          pageTitle = `Video Keyframe Screen @ Timestamp ${item.videos[0].frames[idx].timestamp}`;
        } else if (item.docs && item.docs[idx]) {
          pageTitle = `Document Requirement Page: ${item.docs[idx].name}`;
        } else if (item.appUrl) {
          pageTitle = `Target Application URL: ${item.appUrl}`;
        }

        const corrImgObj = corrlist.find((c: any) => c.originalImage === orig || c.pageTitle === pageTitle);

        return {
          id: Math.random().toString(36).substring(2, 9),
          pageTitle,
          originalImage: orig,
          issueHighlightedImage: highlist[idx] || orig,
          issueHighlightedCount: highlist[idx] ? 1 : 0,
          visualDefectsImage: vislist[idx] || orig,
          visualDefectsCount: vislist[idx] ? 1 : 0,
          correctedVisualDefectsImage: corrImgObj?.correctedImage || item.correctedImage || undefined,
          activeMode: (highlist.length > 0 && isWithContrast) ? 'issues' as const : 'visual_defects' as const
        };
      });
      setContrastOutputs(loadedOutputs);
      setIsReportWithContrast(highlist.length > 0);

      setAppSaveName(item.name || '');
      if (item.folderId) setAppSaveFolderId(item.folderId);
      if (item.companyStandards) setAppCompanyStandards(item.companyStandards);
      setIsAppSaved(true);
    } else if (type === 'figma') {
      setActiveTab('figma_review');
      setFigmaReviewReport(item.analysisReport || null);
      setFigmaCorrectedReport(item.correctedReport || null);
      if (item.highlightedScreenshots && item.highlightedScreenshots.length > 0) {
        setFigmaHighlightedScreenshots(item.highlightedScreenshots);
      }
      if (item.visualDefectsScreenshots && item.visualDefectsScreenshots.length > 0) {
        setFigmaVisualDefectsScreenshots(item.visualDefectsScreenshots);
      }

      // Reconstruct figmaContrastOutputs
      const origs = item.screenshots || [];
      const highlist = item.highlightedScreenshots || [];
      const vislist = item.visualDefectsScreenshots || [];
      const loadedFigmaOutputs = (origs.length > 0 ? origs : (vislist.length > 0 ? vislist : highlist)).map((orig: string, idx: number) => {
        let pageTitle = `Figma Screen ${idx + 1}`;
        if (item.figmaUrl) {
          pageTitle = `Figma Design Screen: ${item.figmaUrl}`;
        }
        return {
          id: Math.random().toString(36).substring(2, 9),
          pageTitle,
          originalImage: orig,
          issueHighlightedImage: highlist[idx] || orig,
          issueHighlightedCount: highlist[idx] ? 1 : 0,
          visualDefectsImage: vislist[idx] || orig,
          visualDefectsCount: vislist[idx] ? 1 : 0,
          activeMode: highlist.length > 0 ? 'issues' as const : 'visual_defects' as const
        };
      });
      setFigmaContrastOutputs(loadedFigmaOutputs);

      setFigmaSaveName(item.name || '');
      if (item.folderId) setFigmaSaveFolderId(item.folderId);
      if (item.companyStandards) setFigmaCompanyStandards(item.companyStandards);
      setIsFigmaSaved(true);
    } else {
      setActiveTab('comparison');
      setCompReport(item.comparisonReport || null);
      setCompResolutionGuide(item.resolutionGuide || null);
      if (item.highlightedScreenshots && item.highlightedScreenshots.length > 0) {
        setCompHighlightedScreenshots(item.highlightedScreenshots);
      }
      if (item.visualDefectsScreenshots && item.visualDefectsScreenshots.length > 0) {
        setCompVisualDefectsScreenshots(item.visualDefectsScreenshots);
      }

      // Reconstruct compContrastOutputs
      const appOrigs = item.appScreenshots || item.screenshots || [];
      const figmaOrigs = item.figmaImages || [];
      const highlist = item.highlightedScreenshots || [];
      const vislist = item.visualDefectsScreenshots || [];
      
      const maxLen = Math.max(appOrigs.length, figmaOrigs.length, vislist.length, highlist.length);
      const loadedCompOutputs = [];
      for (let idx = 0; idx < maxLen; idx++) {
        let pageTitle = `Comparison Screen ${idx + 1}`;
        const appImg = appOrigs[idx] || '';
        const figImg = figmaOrigs[idx] || '';
        
        loadedCompOutputs.push({
          id: Math.random().toString(36).substring(2, 9),
          pageTitle,
          appImage: appImg,
          figmaImage: figImg,
          issueHighlightedImage: highlist[idx] || appImg || figImg,
          issueHighlightedCount: highlist[idx] ? 1 : 0,
          visualDefectsImage: vislist[idx] || appImg || figImg,
          visualDefectsCount: vislist[idx] ? 1 : 0,
          activeMode: highlist.length > 0 ? 'issues' as const : 'visual_defects' as const
        });
      }
      setCompContrastOutputs(loadedCompOutputs);

      setCompSaveName(item.name || '');
      if (item.folderId) setCompSaveFolderId(item.folderId);
      if (item.companyStandards) setCompCompanyStandards(item.companyStandards);
      setIsCompSaved(true);
    }
    setSelectedRepoItem(null);
    toast.success(`Loaded "${item.name}" into workspace. You can now modify and re-commit changes.`);
  };

  const handleReassignFolder = (type: 'report' | 'figma' | 'comparison', itemId: string, targetFolderId: string) => {
    const finalFolderId = targetFolderId && targetFolderId !== 'root' ? targetFolderId : undefined;
    if (type === 'report') {
      const updated = savedReports.map(r => r.id === itemId ? { ...r, folderId: finalFolderId } : r);
      onUpdateProject({ ...project, uiTestingReports: updated });
    } else if (type === 'figma') {
      const updated = savedFigmaReviews.map(f => f.id === itemId ? { ...f, folderId: finalFolderId } : f);
      onUpdateProject({ ...project, figmaDesignReviews: updated });
    } else {
      const updated = savedComparisonReports.map(c => c.id === itemId ? { ...c, folderId: finalFolderId } : c);
      onUpdateProject({ ...project, uiComparisonReports: updated });
    }
    toast.success('Folder reassigned successfully');
  };

  // Handle Application Screenshot Select
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const compressed = await compressImage(reader.result);
          const item: UploadedImageItem = {
            id: Math.random().toString(36).substring(2, 9),
            name: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            type: file.type || 'image/png',
            data: compressed
          };
          setScreenshots(prev => [...prev, item]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle Application Video Upload
  const handleAppVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        if (videoInputRef.current) videoInputRef.current.value = '';
        setOversizedVideoMB(file.size / (1024 * 1024));
        setIsVideoSizeAlertOpen(true);
        toast.error('Video size should not exceed 20 MB.');
        return;
      }
      toast.info(`Processing video: ${file.name}...`);
      const id = Math.random().toString(36).substring(2, 9);
      const url = URL.createObjectURL(file);
      // Immediately cache video binary in IndexedDB
      saveVideoBlob(id, file).catch(err => console.warn('Failed to cache video blob:', err));
      const frames = await extractVideoFrames(file);
      setAppVideos(prev => [
        ...prev,
        {
          id,
          name: file.name,
          url,
          frames,
          blob: file,
          size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          type: file.type || 'video/mp4'
        }
      ]);
      toast.success(`Extracted ${frames.length} keyframes from video ${file.name}`);
    }
  };

  // Handle Document Upload
  const handleDocSelect = async (e: React.ChangeEvent<HTMLInputElement>, target: 'app' | 'figma' | 'compApp' | 'compFigma') => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const parsed = await parseDocumentFile(file);
      const docItem: UploadedDocItem = {
        id: Math.random().toString(36).substring(2, 9),
        name: parsed.name,
        content: parsed.content
      };
      if (target === 'app') {
        setAppDocs(prev => [...prev, docItem]);
      } else if (target === 'figma') {
        setFigmaDocs(prev => [...prev, docItem]);
      } else if (target === 'compApp') {
        setCompAppDocs(prev => [...prev, docItem]);
      } else {
        setCompFigmaDocs(prev => [...prev, docItem]);
      }
      toast.success(`Document uploaded: ${file.name}`);
    }
  };

  // New Analysis - Strictly scoped to current tab and active input mode
  const handleAnalyze = async () => {
    if (isAnalyzing) return;

    if (appInputMode === 'screenshot' && screenshots.length === 0) {
      setError('Please upload at least one Application UI Screenshot.');
      return;
    }
    if (appInputMode === 'url' && !appUrl.trim()) {
      setError('Please enter a valid Application Target URL.');
      return;
    }
    if (appInputMode === 'video' && appVideos.length === 0) {
      setError('Please upload at least one Application UI Video recording.');
      return;
    }
    if (appInputMode === 'doc' && appDocs.length === 0) {
      setError('Please upload at least one Document Specification.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setReport(null);
    setHighlightedScreenshots([]);
    setVisualDefectsScreenshots([]);
    setCorrectedReport(null);
    setCorrectedImage(null);
    setIsAppSaved(false);

    try {
      let activeCapturedUrlData = urlCaptureData;
      if (appInputMode === 'url' && appUrl.trim()) {
        if (!activeCapturedUrlData || activeCapturedUrlData.url !== appUrl.trim() || !activeCapturedUrlData.screenshot) {
          toast.info(`Connecting and capturing live UI from ${appUrl.trim()}...`);
          activeCapturedUrlData = await captureAppUrl(appUrl.trim());
        }
      }

      let activeScreenshots: string[] = [];
      let activeUrl: string | undefined = undefined;
      let activeVideoFrames: any[] = [];
      let activeDocs: { name: string; content: string }[] = [];

      if (appInputMode === 'screenshot') {
        activeScreenshots = await Promise.all(screenshots.map(s => compressImage(getImageData(s))));
      } else if (appInputMode === 'url') {
        activeUrl = appUrl.trim();
        if (activeCapturedUrlData?.screenshot) {
          activeScreenshots = [activeCapturedUrlData.screenshot];
        }
      } else if (appInputMode === 'video') {
        activeVideoFrames = appVideos.flatMap(v => v.frames);
        const isAllBlank = activeVideoFrames.length > 0 && activeVideoFrames.every(f => f.isBlank);
        if (isAllBlank) {
          const blankReport = `# 🧪 Application UI Analysis Report

## ⚠️ Blank Video / No UI Content Detected

- **Overall UI Quality Score**: 0% (No UI Content Detected)
- **Validation Status**: FAILED (BLANK VIDEO / NO UI CONTENT)
- **Color Contrast Audit**: ${checkColorContrast ? 'SKIPPED (No UI Elements Detected)' : 'DISABLED'}
- **Total Keyframes Analyzed**: ${activeVideoFrames.length} keyframes across video duration
- **Blank Video Finding**: The uploaded video recording contains only blank, solid-color, or completely dark/empty frames with no visible user interface components, buttons, text, forms, or navigation elements detected across the entire duration.
- **Root Cause & Evidence**: All ${activeVideoFrames.length} extracted video keyframe screens (timestamps: ${activeVideoFrames.map(f => f.timestamp).join(', ')}) were verified and detected as uniform blank/solid screens with zero interactive or structural UI elements.
- **Recommended Action**: Please upload a video recording that captures actual application screens, interactive workflows, or UI layouts.

---

### 🔍 Keyframe Inspection Breakdown
${activeVideoFrames.map((f, i) => `#### Frame ${i + 1} (@ Timestamp ${f.timestamp})\n- **Status**: Blank / No UI Content Detected\n- **Details**: Solid uniform frame with zero contrast or interactive elements.`).join('\n\n')}
`;
          setReport(blankReport);
          setHighlightedScreenshots([]);
          setVisualDefectsScreenshots([]);
          setContrastOutputs([]);
          setIsReportWithContrast(!!checkColorContrast);
          setAppSaveName(`App UI Review (Blank Video) - ${new Date().toLocaleDateString()}`);
          setIsAnalyzing(false);
          return;
        }
      } else if (appInputMode === 'doc') {
        activeDocs = appDocs.map(d => ({ name: d.name, content: d.content }));
      }

      const result = await performUITesting(
        activeScreenshots,
        activeUrl,
        designLink.trim() || undefined,
        activeVideoFrames,
        activeDocs,
        { 
          checkColorContrast,
          companyStandards: appCompanyStandards.trim() || undefined,
          standardRequirement: appStandardRequirement,
          targetUrlMetadata: activeCapturedUrlData?.elements ? {
            title: activeCapturedUrlData.pageTitle,
            headings: activeCapturedUrlData.elements.headings,
            buttons: activeCapturedUrlData.elements.buttons,
            inputs: activeCapturedUrlData.elements.inputs,
            textSnippets: activeCapturedUrlData.elements.textSnippets
          } : undefined
        }
      );

      const reportContent = result?.report?.trim();
      if (!reportContent) {
        throw new Error('No UI analysis report could be generated. Please check your inputs and try again.');
      }

      setReport(reportContent);
      setHighlightedScreenshots(result.highlightedScreenshots || []);
      setAppSaveName(`App UI Review - ${new Date().toLocaleDateString()}`);

      // Generate Side-by-Side Issue Highlighted and Visual Defects Outputs only when Color Contrast is ON
      const generatedOutputs: Array<{
        id: string;
        pageTitle: string;
        originalImage: string;
        issueHighlightedImage: string;
        issueHighlightedCount: number;
        visualDefectsImage: string;
        visualDefectsCount: number;
        activeMode?: 'issues' | 'visual_defects';
      }> = [];

      if (appInputMode === 'screenshot') {
        const totalScreens = screenshots.length;
        for (let i = 0; i < totalScreens; i++) {
          const src = getImageData(screenshots[i]);
          const pageTitle = getImageName(screenshots[i], `Page ${i + 1}: Application Screenshot`);
          const pageDefects = extractPageSpecificDefects(reportContent, i, pageTitle, totalScreens, 'ui', false);

          const issueRes = checkColorContrast
            ? await generateIssueHighlightedScreenshot(src, pageTitle, pageDefects.contrastIssues, i, false)
            : await generateVisualDefectsAuditScreenshot(src, pageTitle, pageDefects.visualDefects, i, false);
          const visualRes = await generateVisualDefectsAuditScreenshot(src, pageTitle, pageDefects.visualDefects, i, false);

          generatedOutputs.push({
            id: Math.random().toString(36).substring(2, 9),
            pageTitle,
            originalImage: src,
            issueHighlightedImage: issueRes.highlightedUrl,
            issueHighlightedCount: issueRes.issuesCount,
            visualDefectsImage: visualRes.highlightedUrl,
            visualDefectsCount: visualRes.issuesCount,
            activeMode: checkColorContrast ? 'issues' : 'visual_defects'
          });
        }
      } else if (appInputMode === 'video') {
        const totalFrames = activeVideoFrames.length;
        for (let i = 0; i < totalFrames; i++) {
          const vf = activeVideoFrames[i];
          const pageTitle = `Video Keyframe Screen @ Timestamp ${vf.timestamp}`;
          const pageDefects = extractPageSpecificDefects(reportContent, i, pageTitle, totalFrames, 'ui', false);

          const issueRes = checkColorContrast
            ? await generateIssueHighlightedScreenshot(vf.image, pageTitle, pageDefects.contrastIssues, i, false)
            : await generateVisualDefectsAuditScreenshot(vf.image, pageTitle, pageDefects.visualDefects, i, false);
          const visualRes = await generateVisualDefectsAuditScreenshot(vf.image, pageTitle, pageDefects.visualDefects, i, false);

          generatedOutputs.push({
            id: Math.random().toString(36).substring(2, 9),
            pageTitle,
            originalImage: vf.image,
            issueHighlightedImage: issueRes.highlightedUrl,
            issueHighlightedCount: issueRes.issuesCount,
            visualDefectsImage: visualRes.highlightedUrl,
            visualDefectsCount: visualRes.issuesCount,
            activeMode: checkColorContrast ? 'issues' : 'visual_defects'
          });
        }
      } else if (appInputMode === 'doc') {
        const totalDocs = appDocs.length;
        for (let i = 0; i < totalDocs; i++) {
          const doc = appDocs[i];
          const pageTitle = `Document Requirement Page: ${doc.name}`;
          const docOriginal = createDocumentCanvasImage(doc.name, doc.content);
          const pageDefects = extractPageSpecificDefects(reportContent, i, pageTitle, totalDocs, 'ui', false);

          const issueRes = checkColorContrast
            ? await generateIssueHighlightedScreenshot(docOriginal, pageTitle, pageDefects.contrastIssues, i, false)
            : await generateVisualDefectsAuditScreenshot(docOriginal, pageTitle, pageDefects.visualDefects, i, false);
          const visualRes = await generateVisualDefectsAuditScreenshot(docOriginal, pageTitle, pageDefects.visualDefects, i, false);

          generatedOutputs.push({
            id: Math.random().toString(36).substring(2, 9),
            pageTitle,
            originalImage: docOriginal,
            issueHighlightedImage: issueRes.highlightedUrl,
            issueHighlightedCount: issueRes.issuesCount,
            visualDefectsImage: visualRes.highlightedUrl,
            visualDefectsCount: visualRes.issuesCount,
            activeMode: checkColorContrast ? 'issues' : 'visual_defects'
          });
        }
      } else if (appInputMode === 'url') {
        const pageTitle = `Target Application URL: ${activeCapturedUrlData?.pageTitle || appUrl.trim()}`;
        const urlOriginal = activeCapturedUrlData?.screenshot || createUrlCanvasImage(appUrl.trim(), activeCapturedUrlData);
        const pageDefects = extractPageSpecificDefects(reportContent, 0, pageTitle, 1, 'ui', false);

        const issueRes = checkColorContrast
          ? await generateIssueHighlightedScreenshot(urlOriginal, pageTitle, pageDefects.contrastIssues, 0, false)
          : await generateVisualDefectsAuditScreenshot(urlOriginal, pageTitle, pageDefects.visualDefects, 0, false);
        const visualRes = await generateVisualDefectsAuditScreenshot(urlOriginal, pageTitle, pageDefects.visualDefects, 0, false);

        generatedOutputs.push({
          id: Math.random().toString(36).substring(2, 9),
          pageTitle,
          originalImage: urlOriginal,
          issueHighlightedImage: issueRes.highlightedUrl,
          issueHighlightedCount: issueRes.issuesCount,
          visualDefectsImage: visualRes.highlightedUrl,
          visualDefectsCount: visualRes.issuesCount,
          activeMode: checkColorContrast ? 'issues' : 'visual_defects'
        });
      }

      setContrastOutputs(generatedOutputs);
      setHighlightedScreenshots(checkColorContrast ? generatedOutputs.map(o => o.issueHighlightedImage) : []);
      setVisualDefectsScreenshots(generatedOutputs.map(o => o.visualDefectsImage));
      setIsReportWithContrast(!!checkColorContrast);

      // Clear uploaded images only on successful report generation
      setScreenshots([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      toast.success('Application UI Analysis completed successfully!');
    } catch (err: any) {
      console.error('UI Testing Error:', err);
      const errMsg = err?.message || 'Failed to analyze application UI. Please check the inputs and retry.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCorrectIssues = async () => {
    if (isCorrecting || !report) return;

    setIsCorrecting(true);
    setError(null);

    try {
      const imagesToUse = screenshots.length > 0
        ? screenshots.map(s => getImageData(s))
        : contrastOutputs.map(o => o.originalImage);
      const compressedScreenshots = await Promise.all(imagesToUse.map(s => compressImage(s)));
      const result = await correctUIIssues(report, compressedScreenshots);
      setCorrectedReport(result);

      // Re-generate and update all screenshots across the UI Testing tab to reflect corrected specifications
      const updatedOutputs: Array<{
        id: string;
        pageTitle: string;
        originalImage: string;
        issueHighlightedImage: string;
        issueHighlightedCount: number;
        visualDefectsImage: string;
        visualDefectsCount: number;
        activeMode?: 'issues' | 'visual_defects';
      }> = [];

      if (appInputMode === 'screenshot' && (screenshots.length > 0 || contrastOutputs.length > 0)) {
        const screens = screenshots.length > 0
          ? screenshots.map((s, i) => ({ src: getImageData(s), title: getImageName(s, `Page ${i + 1}: Application Screenshot`) }))
          : contrastOutputs.map(o => ({ src: o.originalImage, title: o.pageTitle }));
        const totalScreens = screens.length;
        for (let i = 0; i < totalScreens; i++) {
          const { src, title: pageTitle } = screens[i];
          const pageDefects = extractPageSpecificDefects(result, i, pageTitle, totalScreens, 'ui', true);

          const issueRes = await generateIssueHighlightedScreenshot(src, pageTitle, pageDefects.contrastIssues, i, true);
          const visualRes = await generateVisualDefectsAuditScreenshot(src, pageTitle, pageDefects.visualDefects, i, true);

          updatedOutputs.push({
            id: Math.random().toString(36).substring(2, 9),
            pageTitle,
            originalImage: src,
            issueHighlightedImage: issueRes.highlightedUrl,
            issueHighlightedCount: 0,
            visualDefectsImage: visualRes.highlightedUrl,
            visualDefectsCount: 0,
            activeMode: checkColorContrast || isReportWithContrast ? 'issues' : 'visual_defects'
          });
        }
      } else if (appInputMode === 'video' && appVideos.length > 0) {
        const activeVideoFrames = appVideos.flatMap(v => v.frames);
        const totalFrames = activeVideoFrames.length;
        for (let i = 0; i < totalFrames; i++) {
          const vf = activeVideoFrames[i];
          const pageTitle = `Video Keyframe Screen @ Timestamp ${vf.timestamp}`;
          const pageDefects = extractPageSpecificDefects(result, i, pageTitle, totalFrames, 'ui', true);

          const issueRes = await generateIssueHighlightedScreenshot(vf.image, pageTitle, pageDefects.contrastIssues, i, true);
          const visualRes = await generateVisualDefectsAuditScreenshot(vf.image, pageTitle, pageDefects.visualDefects, i, true);

          updatedOutputs.push({
            id: Math.random().toString(36).substring(2, 9),
            pageTitle,
            originalImage: vf.image,
            issueHighlightedImage: issueRes.highlightedUrl,
            issueHighlightedCount: 0,
            visualDefectsImage: visualRes.highlightedUrl,
            visualDefectsCount: 0,
            activeMode: checkColorContrast || isReportWithContrast ? 'issues' : 'visual_defects'
          });
        }
      } else if (appInputMode === 'doc' && appDocs.length > 0) {
        const totalDocs = appDocs.length;
        for (let i = 0; i < totalDocs; i++) {
          const doc = appDocs[i];
          const pageTitle = `Document Requirement Page: ${doc.name}`;
          const docOriginal = createDocumentCanvasImage(doc.name, doc.content);
          const pageDefects = extractPageSpecificDefects(result, i, pageTitle, totalDocs, 'ui', true);

          const issueRes = await generateIssueHighlightedScreenshot(docOriginal, pageTitle, pageDefects.contrastIssues, i, true);
          const visualRes = await generateVisualDefectsAuditScreenshot(docOriginal, pageTitle, pageDefects.visualDefects, i, true);

          updatedOutputs.push({
            id: Math.random().toString(36).substring(2, 9),
            pageTitle,
            originalImage: docOriginal,
            issueHighlightedImage: issueRes.highlightedUrl,
            issueHighlightedCount: 0,
            visualDefectsImage: visualRes.highlightedUrl,
            visualDefectsCount: 0,
            activeMode: checkColorContrast || isReportWithContrast ? 'issues' : 'visual_defects'
          });
        }
      } else if (appInputMode === 'url' && appUrl.trim()) {
        const pageTitle = `Target Application URL: ${urlCaptureData?.pageTitle || appUrl.trim()}`;
        const urlOriginal = urlCaptureData?.screenshot || createUrlCanvasImage(appUrl.trim(), urlCaptureData);
        const pageDefects = extractPageSpecificDefects(result, 0, pageTitle, 1, 'ui', true);

        const issueRes = await generateIssueHighlightedScreenshot(urlOriginal, pageTitle, pageDefects.contrastIssues, 0, true);
        const visualRes = await generateVisualDefectsAuditScreenshot(urlOriginal, pageTitle, pageDefects.visualDefects, 0, true);

        updatedOutputs.push({
          id: Math.random().toString(36).substring(2, 9),
          pageTitle,
          originalImage: urlOriginal,
          issueHighlightedImage: issueRes.highlightedUrl,
          issueHighlightedCount: 0,
          visualDefectsImage: visualRes.highlightedUrl,
          visualDefectsCount: 0,
          activeMode: checkColorContrast || isReportWithContrast ? 'issues' : 'visual_defects'
        });
      }

      if (updatedOutputs.length > 0) {
        // Attach corrected screenshots to contrastOutputs without deleting or overwriting the original defect audit images
        setContrastOutputs(prev => {
          if (prev.length === 0) return updatedOutputs;
          return prev.map((item, idx) => {
            const upd = updatedOutputs[idx];
            if (upd) {
              return {
                ...item,
                correctedVisualDefectsImage: upd.visualDefectsImage,
                correctedIssueImage: upd.issueHighlightedImage
              };
            }
            return item;
          });
        });
      }

      // Automatically generate corrected UI screenshot mockups for ALL screens with exact defect resolution pinpoints
      const allCorrectedScreenshots: Array<{ id: string; pageTitle: string; originalImage: string; correctedImage: string }> = [];

      for (let i = 0; i < updatedOutputs.length; i++) {
        const upd = updatedOutputs[i];
        const pageDefects = extractPageSpecificDefects(result, i, upd.pageTitle, updatedOutputs.length, 'ui', true);
        const correctedMockup = await generateCorrectedUIImage(
          upd.originalImage,
          checkColorContrast || isReportWithContrast,
          upd.pageTitle,
          pageDefects.visualDefects.length,
          pageDefects.visualDefects
        );
        allCorrectedScreenshots.push({
          id: upd.id || Math.random().toString(36).substring(2, 9),
          pageTitle: upd.pageTitle,
          originalImage: upd.originalImage,
          correctedImage: correctedMockup
        });
      }

      if (allCorrectedScreenshots.length > 0) {
        setCorrectedScreenshots(allCorrectedScreenshots);
        setCorrectedImage(allCorrectedScreenshots[0].correctedImage);
      }

      toast.success('Generated corrected report and updated screenshots!');
      setTimeout(() => {
        reportEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error('UI Correction Error:', err);
      setError(err.message || 'Failed to generate corrected report.');
    } finally {
      setIsCorrecting(false);
    }
  };

  // Figma Design Review Handlers
  const handleFigmaFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setFigmaReviewError(null);
    
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const compressed = await compressImage(reader.result);
          const item: UploadedImageItem = {
            id: Math.random().toString(36).substring(2, 9),
            name: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            type: file.type || 'image/png',
            data: compressed
          };
          setFigmaImages(prev => [...prev, item]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFigmaReview = async () => {
    if (figmaInputMode === 'screenshot' && figmaImages.length === 0) {
      setFigmaReviewError('Please upload at least one Figma design screenshot.');
      return;
    }
    if (figmaInputMode === 'document' && figmaDocs.length === 0) {
      setFigmaReviewError('Please upload at least one Figma design specification document.');
      return;
    }
    if (figmaInputMode === 'url' && !figmaUrl.trim()) {
      setFigmaReviewError('Please enter a valid Figma file / frame URL.');
      return;
    }
    
    setIsReviewingFigma(true);
    setFigmaReviewError(null);
    setFigmaReviewReport(null);
    setFigmaCorrectedReport(null);
    setIsFigmaSaved(false);
    
    try {
      let activeImages: string[] = [];
      let activeUrl: string | undefined = undefined;
      let activeDocs: { name: string; content: string }[] = [];
      let activeFigmaCapturedData = figmaUrlCaptureData;

      if (figmaInputMode === 'screenshot') {
        activeImages = await Promise.all(figmaImages.map(img => compressImage(getImageData(img))));
      } else if (figmaInputMode === 'document') {
        activeDocs = figmaDocs.map(d => ({ name: d.name, content: d.content }));
      } else if (figmaInputMode === 'url') {
        activeUrl = figmaUrl.trim();
        if (!activeFigmaCapturedData || activeFigmaCapturedData.url !== figmaUrl.trim() || !activeFigmaCapturedData.screenshot) {
          activeFigmaCapturedData = await captureFigmaUrl(figmaUrl.trim());
        }
        if (activeFigmaCapturedData?.screenshot) {
          activeImages = [activeFigmaCapturedData.screenshot];
        }
      }

      const response = await performFigmaDesignReview(
        activeImages,
        activeUrl,
        activeDocs,
        {
          companyStandards: figmaCompanyStandards.trim() || undefined,
          standardRequirement: figmaStandardRequirement
        }
      );
      setFigmaReviewReport(response);
      setFigmaSaveName(`Figma Design Review - ${new Date().toLocaleDateString()}`);

      // Generate audited visual design defects screenshots for active Figma inputs only
      const generatedFigmaOutputs: Array<{
        id: string;
        pageTitle: string;
        originalImage: string;
        issueHighlightedImage: string;
        issueHighlightedCount: number;
        visualDefectsImage: string;
        visualDefectsCount: number;
        correctedVisualDefectsImage?: string;
        correctedIssueImage?: string;
        activeMode?: 'visual_defects' | 'corrected';
      }> = [];

      let figmaIdx = 0;
      if (figmaInputMode === 'screenshot') {
        const totalFigma = figmaImages.length;
        for (let i = 0; i < totalFigma; i++) {
          figmaIdx++;
          const img = getImageData(figmaImages[i]);
          const pageTitle = getImageName(figmaImages[i], `Figma Screen #${figmaIdx}`);
          const pageDefects = extractPageSpecificDefects(response, i, pageTitle, totalFigma, 'figma', false);

          const visualOutput = await generateFigmaVisualDefectsScreenshot(img, pageTitle, pageDefects.visualDefects, i, false);

          generatedFigmaOutputs.push({
            id: `figma-screen-${figmaIdx}`,
            pageTitle,
            originalImage: img,
            issueHighlightedImage: visualOutput.highlightedUrl,
            issueHighlightedCount: visualOutput.issuesCount,
            visualDefectsImage: visualOutput.highlightedUrl,
            visualDefectsCount: visualOutput.issuesCount,
            activeMode: 'visual_defects'
          });
        }
      } else if (figmaInputMode === 'document') {
        const totalFigmaDocs = figmaDocs.length;
        for (let i = 0; i < totalFigmaDocs; i++) {
          const doc = figmaDocs[i];
          figmaIdx++;
          const pageTitle = `Doc: ${doc.name}`;
          const docCanvasImg = createDocumentCanvasImage(doc.name, doc.content);
          const pageDefects = extractPageSpecificDefects(response, i, pageTitle, totalFigmaDocs, 'figma', false);

          const visualOutput = await generateFigmaVisualDefectsScreenshot(docCanvasImg, pageTitle, pageDefects.visualDefects, i, false);

          generatedFigmaOutputs.push({
            id: `figma-doc-${figmaIdx}`,
            pageTitle,
            originalImage: docCanvasImg,
            issueHighlightedImage: visualOutput.highlightedUrl,
            issueHighlightedCount: visualOutput.issuesCount,
            visualDefectsImage: visualOutput.highlightedUrl,
            visualDefectsCount: visualOutput.issuesCount,
            activeMode: 'visual_defects'
          });
        }
      } else if (figmaInputMode === 'url' && figmaUrl.trim()) {
        figmaIdx++;
        const pageTitle = `Figma URL Spec: ${activeFigmaCapturedData?.pageTitle || figmaUrlCaptureData?.pageTitle || figmaUrl.trim()}`;
        const urlCanvasImg = activeFigmaCapturedData?.screenshot || figmaUrlCaptureData?.screenshot || createUrlCanvasImage(figmaUrl.trim(), activeFigmaCapturedData || figmaUrlCaptureData);
        const pageDefects = extractPageSpecificDefects(response, 0, pageTitle, 1, 'figma', false);

        const visualOutput = await generateFigmaVisualDefectsScreenshot(urlCanvasImg, pageTitle, pageDefects.visualDefects, 0, false);

        generatedFigmaOutputs.push({
          id: `figma-url-${figmaIdx}`,
          pageTitle,
          originalImage: urlCanvasImg,
          issueHighlightedImage: visualOutput.highlightedUrl,
          issueHighlightedCount: visualOutput.issuesCount,
          visualDefectsImage: visualOutput.highlightedUrl,
          visualDefectsCount: visualOutput.issuesCount,
          activeMode: 'visual_defects'
        });
      }

      setFigmaContrastOutputs(generatedFigmaOutputs);
      setFigmaHighlightedScreenshots(generatedFigmaOutputs.map(o => o.visualDefectsImage));
      setFigmaVisualDefectsScreenshots(generatedFigmaOutputs.map(o => o.visualDefectsImage));

      // Automatically clear uploaded images from the upload section after Figma analysis completes
      setFigmaImages([]);
    } catch (err: any) {
      console.error(err);
      setFigmaReviewError(err?.message || 'An error occurred during figma design review.');
    } finally {
      setIsReviewingFigma(false);
    }
  };

  const handleCorrectFigmaIssues = async () => {
    if (!figmaReviewReport) return;

    setIsCorrectingFigma(true);
    setFigmaReviewError(null);

    try {
      const imagesToCompress = figmaImages.length > 0
        ? figmaImages.map(img => getImageData(img))
        : figmaContrastOutputs.map(o => o.originalImage);
      const compressedFigmaImages = await Promise.all(imagesToCompress.map(img => compressImage(img)));
      const result = await correctFigmaDesignIssues(figmaReviewReport, compressedFigmaImages, figmaUrl.trim() || undefined);
      setFigmaCorrectedReport(result);

      // Re-generate and update all Figma screenshots to reflect corrected specifications
      const updatedFigmaOutputs: Array<{
        id: string;
        pageTitle: string;
        originalImage: string;
        issueHighlightedImage: string;
        issueHighlightedCount: number;
        visualDefectsImage: string;
        visualDefectsCount: number;
        correctedVisualDefectsImage?: string;
        correctedIssueImage?: string;
        activeMode?: 'visual_defects' | 'corrected';
      }> = [];

      let figmaIdx = 0;
      if (figmaInputMode === 'screenshot' && (figmaImages.length > 0 || figmaContrastOutputs.length > 0)) {
        const screens = figmaImages.length > 0
          ? figmaImages.map((s, idx) => ({ src: getImageData(s), title: getImageName(s, `Figma Screen #${idx + 1}`) }))
          : figmaContrastOutputs.map((o, idx) => ({ src: o.originalImage, title: o.pageTitle || `Figma Screen #${idx + 1}` }));
        const totalFigma = screens.length;
        for (let i = 0; i < totalFigma; i++) {
          figmaIdx++;
          const { src: img, title: pageTitle } = screens[i];
          const pageDefects = extractPageSpecificDefects(result, i, pageTitle, totalFigma, 'figma', true);
          const visualOutput = await generateFigmaVisualDefectsScreenshot(img, pageTitle, pageDefects.visualDefects, i, true);

          updatedFigmaOutputs.push({
            id: `figma-screen-${figmaIdx}`,
            pageTitle,
            originalImage: img,
            issueHighlightedImage: visualOutput.highlightedUrl,
            issueHighlightedCount: 0,
            visualDefectsImage: visualOutput.highlightedUrl,
            visualDefectsCount: 0,
            correctedVisualDefectsImage: visualOutput.highlightedUrl,
            activeMode: 'corrected'
          });
        }
      } else if (figmaInputMode === 'document' && figmaDocs.length > 0) {
        const totalFigmaDocs = figmaDocs.length;
        for (let i = 0; i < totalFigmaDocs; i++) {
          const doc = figmaDocs[i];
          figmaIdx++;
          const pageTitle = `Doc: ${doc.name}`;
          const docCanvasImg = createDocumentCanvasImage(doc.name, doc.content);
          const pageDefects = extractPageSpecificDefects(result, i, pageTitle, totalFigmaDocs, 'figma', true);
          const visualOutput = await generateFigmaVisualDefectsScreenshot(docCanvasImg, pageTitle, pageDefects.visualDefects, i, true);

          updatedFigmaOutputs.push({
            id: `figma-doc-${figmaIdx}`,
            pageTitle,
            originalImage: docCanvasImg,
            issueHighlightedImage: visualOutput.highlightedUrl,
            issueHighlightedCount: 0,
            visualDefectsImage: visualOutput.highlightedUrl,
            visualDefectsCount: 0,
            correctedVisualDefectsImage: visualOutput.highlightedUrl,
            activeMode: 'corrected'
          });
        }
      } else if (figmaInputMode === 'url' && figmaUrl.trim()) {
        figmaIdx++;
        const pageTitle = `Figma URL Spec: ${figmaUrlCaptureData?.pageTitle || figmaUrl.trim()}`;
        const urlCanvasImg = figmaUrlCaptureData?.screenshot || createUrlCanvasImage(figmaUrl.trim(), figmaUrlCaptureData);
        const pageDefects = extractPageSpecificDefects(result, 0, pageTitle, 1, 'figma', true);
        const visualOutput = await generateFigmaVisualDefectsScreenshot(urlCanvasImg, pageTitle, pageDefects.visualDefects, 0, true);

        updatedFigmaOutputs.push({
          id: `figma-url-${figmaIdx}`,
          pageTitle,
          originalImage: urlCanvasImg,
          issueHighlightedImage: visualOutput.highlightedUrl,
          issueHighlightedCount: 0,
          visualDefectsImage: visualOutput.highlightedUrl,
          visualDefectsCount: 0,
          correctedVisualDefectsImage: visualOutput.highlightedUrl,
          activeMode: 'corrected'
        });
      }

      if (updatedFigmaOutputs.length > 0) {
        setFigmaContrastOutputs(prev => {
          if (prev.length === 0) return updatedFigmaOutputs;
          return prev.map((item, idx) => {
            const upd = updatedFigmaOutputs[idx];
            if (upd) {
              return {
                ...item,
                correctedVisualDefectsImage: upd.visualDefectsImage,
                correctedIssueImage: upd.visualDefectsImage,
                activeMode: 'corrected'
              };
            }
            return item;
          });
        });
      }

      toast.success('Generated corrected Figma review and updated screenshots!');
    } catch (err: any) {
      console.error(err);
      setFigmaReviewError(err?.message || 'An error occurred during figma design correction.');
    } finally {
      setIsCorrectingFigma(false);
    }
  };

  // App vs Figma Comparison Handlers
  const handleCompAppFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setCompError(null);

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const compressed = await compressImage(reader.result);
          const item: UploadedImageItem = {
            id: Math.random().toString(36).substring(2, 9),
            name: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            type: file.type || 'image/png',
            data: compressed
          };
          setCompAppImages(prev => [...prev, item]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCompAppVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        if (compAppVideoInputRef.current) compAppVideoInputRef.current.value = '';
        setOversizedVideoMB(file.size / (1024 * 1024));
        setIsVideoSizeAlertOpen(true);
        toast.error('Video size should not exceed 20 MB.');
        return;
      }
      toast.info(`Extracting screens from Application Video: ${file.name}...`);
      const id = Math.random().toString(36).substring(2, 9);
      const url = URL.createObjectURL(file);
      // Immediately cache video binary in IndexedDB
      saveVideoBlob(id, file).catch(err => console.warn('Failed to cache video blob:', err));
      const frames = await extractVideoFrames(file);
      setCompAppVideos(prev => [
        ...prev,
        {
          id,
          name: file.name,
          url,
          frames,
          blob: file,
          size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
          type: file.type || 'video/mp4'
        }
      ]);
      toast.success(`Extracted ${frames.length} keyframe screens for comparison`);
    }
  };

  const handleCompFigmaFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setCompError(null);

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (typeof reader.result === 'string') {
          const compressed = await compressImage(reader.result);
          const item: UploadedImageItem = {
            id: Math.random().toString(36).substring(2, 9),
            name: file.name,
            size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            type: file.type || 'image/png',
            data: compressed
          };
          setCompFigmaImages(prev => [...prev, item]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCompareUI = async () => {
    if (compAppMode === 'screenshot' && compAppImages.length === 0) {
      setCompError('Please upload at least one Application screenshot for comparison.');
      return;
    }
    if (compAppMode === 'url' && !compAppUrl.trim()) {
      setCompError('Please enter an Application Target URL for comparison.');
      return;
    }
    if (compAppMode === 'video' && compAppVideos.length === 0) {
      setCompError('Please upload an Application UI Video for comparison.');
      return;
    }

    if (compFigmaMode === 'screenshot' && compFigmaImages.length === 0) {
      setCompError('Please upload at least one Figma design screenshot for comparison.');
      return;
    }
    if (compFigmaMode === 'doc' && compFigmaDocs.length === 0) {
      setCompError('Please upload at least one Figma design document specification.');
      return;
    }
    if (compFigmaMode === 'url' && !compFigmaUrl.trim()) {
      setCompError('Please enter a Figma design URL for comparison.');
      return;
    }

    setIsComparing(true);
    setComparisonStep(1);
    setCompError(null);
    setCompReport(null);
    setCompResolutionGuide(null);
    setCompContrastOutputs([]);
    setCompHighlightedScreenshots([]);
    setCompVisualDefectsScreenshots([]);
    setIsCompSaved(false);

    let activeAppImages: string[] = [];
    let activeAppUrl: string | undefined = undefined;
    let activeVideoFrames: any[] = [];
    let activeFigmaImages: string[] = [];
    let activeFigmaUrl: string | undefined = undefined;
    let activeDocs: { name: string; content: string }[] = [];
    let activeAppCapturedData = urlCaptureData;
    let activeFigmaCapturedData = figmaUrlCaptureData;

    if (compAppMode === 'screenshot') {
      activeAppImages = await Promise.all(compAppImages.map(img => compressImage(getImageData(img))));
    } else if (compAppMode === 'url') {
      activeAppUrl = compAppUrl.trim();
      if (activeAppUrl) {
        if (!activeAppCapturedData || activeAppCapturedData.url !== activeAppUrl || !activeAppCapturedData.screenshot) {
          activeAppCapturedData = await captureAppUrl(activeAppUrl);
        }
        if (activeAppCapturedData?.screenshot) {
          activeAppImages = [activeAppCapturedData.screenshot];
        }
      }
    } else if (compAppMode === 'video') {
      activeVideoFrames = compAppVideos.flatMap(v => v.frames);
      const isAllBlank = activeVideoFrames.length > 0 && activeVideoFrames.every(f => f.isBlank);
      if (isAllBlank) {
        const blankCompReport = `# ⚖️ Figma Design vs Live Application Comparison Report

## ⚠️ Blank Video / No UI Content Detected in Application Recording

- **Overall Visual Parity Score**: 0% (Application UI Missing)
- **Validation Status**: FAILED (BLANK VIDEO / NO UI CONTENT)
- **Comparison Summary**: The uploaded application video recording contains only blank, solid-color, or empty frames with no visible UI components detected across the duration. Visual comparison cannot be performed against the Figma reference.
- **Root Cause & Evidence**: All ${activeVideoFrames.length} extracted application video keyframes (timestamps: ${activeVideoFrames.map(f => f.timestamp).join(', ')}) contain zero UI elements, buttons, or typography.
- **Recommended Action**: Upload a valid application video recording capturing active user interfaces.
`;
        setCompReport(blankCompReport);
        setCompHighlightedScreenshots([]);
        setCompVisualDefectsScreenshots([]);
        setCompContrastOutputs([]);
        setCompSaveName(`Figma vs App (Blank Video) - ${new Date().toLocaleDateString()}`);
        setIsComparing(false);
        return;
      }
    }

    if (compFigmaMode === 'screenshot') {
      activeFigmaImages = await Promise.all(compFigmaImages.map(img => compressImage(getImageData(img))));
    } else if (compFigmaMode === 'doc') {
      activeDocs = compFigmaDocs.map(d => ({ name: d.name, content: d.content }));
    } else if (compFigmaMode === 'url') {
      activeFigmaUrl = compFigmaUrl.trim();
      if (activeFigmaUrl) {
        if (!activeFigmaCapturedData || activeFigmaCapturedData.url !== activeFigmaUrl || !activeFigmaCapturedData.screenshot) {
          activeFigmaCapturedData = await captureFigmaUrl(activeFigmaUrl);
        }
        if (activeFigmaCapturedData?.screenshot) {
          activeFigmaImages = [activeFigmaCapturedData.screenshot];
        }
      }
    }

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // Step 1: Preparing Figma Reference Design
      setComparisonStep(1);
      await delay(400);

      // Step 2: Validating Application Target URL / Inputs
      setComparisonStep(2);
      await delay(400);

      // Step 3: Capturing Live Application UI
      setComparisonStep(3);
      await delay(400);

      // Step 4: Executing Screen Identity Check
      setComparisonStep(4);
      await delay(400);

      // Step 5: Auditing Visual Elements
      setComparisonStep(5);

      const responsePromise = compareAppAndFigmaUI(
        activeAppImages,
        activeAppUrl,
        activeFigmaImages,
        activeFigmaUrl,
        activeVideoFrames,
        activeDocs,
        {
          companyStandards: compCompanyStandards.trim() || undefined,
          standardRequirement: compStandardRequirement
        }
      );

      await delay(500);
      // Step 6: Analyzing Design System Discrepancies
      setComparisonStep(6);

      const response = await responsePromise;

      // Step 7: Generating Enterprise UI Validation Report
      setComparisonStep(7);
      await delay(300);

      setCompReport(response);
      setCompSaveName(`UI vs Figma Comparison - ${new Date().toLocaleDateString()}`);

      // Generate visual comparison discrepancy & styling drift highlighted screenshots
      if (!response.includes('TOTAL_SCREEN_MISMATCH')) {
        const generatedCompOutputs: Array<{
          id: string;
          pageTitle: string;
          figmaImage?: string;
          appImage?: string;
          issueHighlightedImage: string;
          issueHighlightedCount: number;
          visualDefectsImage: string;
          visualDefectsCount: number;
          activeMode?: 'issues' | 'visual_defects';
        }> = [];

        // Determine primary App image
        const appSourceImage = activeAppImages[0] 
          || (activeAppCapturedData?.screenshot)
          || (urlCaptureData?.screenshot)
          || (activeVideoFrames[0]?.image)
          || (compAppDocs[0] ? createDocumentCanvasImage(compAppDocs[0].name, compAppDocs[0].content) : '')
          || (activeAppUrl ? createUrlCanvasImage(activeAppUrl, activeAppCapturedData || urlCaptureData) : '');

        // Determine primary Figma image
        const figmaSourceImage = activeFigmaImages[0]
          || (activeFigmaCapturedData?.screenshot)
          || (figmaUrlCaptureData?.screenshot)
          || (compFigmaDocs[0] ? createDocumentCanvasImage(compFigmaDocs[0].name, compFigmaDocs[0].content) : '')
          || (activeFigmaUrl ? createUrlCanvasImage(activeFigmaUrl, activeFigmaCapturedData || figmaUrlCaptureData) : '');

        const totalCompScreens = Math.max(1, activeAppImages.length);

        if (appSourceImage && figmaSourceImage) {
          const pageTitle = 'Primary App UI vs Figma Spec';
          const pageDefects = extractPageSpecificDefects(response, 0, pageTitle, totalCompScreens, 'comparison', false);

          const issueOutput = await generateComparisonIssueHighlightedScreenshot(appSourceImage, figmaSourceImage, pageTitle, pageDefects.contrastIssues, 0, false);
          const visualOutput = await generateComparisonVisualDefectsScreenshot(appSourceImage, figmaSourceImage, pageTitle, pageDefects.visualDefects, 0, false);

          generatedCompOutputs.push({
            id: 'comp-primary',
            pageTitle,
            appImage: appSourceImage,
            figmaImage: figmaSourceImage,
            issueHighlightedImage: issueOutput.highlightedUrl,
            issueHighlightedCount: issueOutput.issuesCount,
            visualDefectsImage: visualOutput.highlightedUrl,
            visualDefectsCount: visualOutput.issuesCount,
            activeMode: 'issues'
          });
        }

        // Additional app screenshots comparison
        for (let i = 1; i < activeAppImages.length; i++) {
          const appImg = activeAppImages[i];
          const figmaImg = activeFigmaImages[i] || figmaSourceImage;
          const pageTitle = `Comparison Screen #${i + 1}`;
          const pageDefects = extractPageSpecificDefects(response, i, pageTitle, totalCompScreens, 'comparison', false);

          const issueOutput = await generateComparisonIssueHighlightedScreenshot(appImg, figmaImg, pageTitle, pageDefects.contrastIssues, i, false);
          const visualOutput = await generateComparisonVisualDefectsScreenshot(appImg, figmaImg, pageTitle, pageDefects.visualDefects, i, false);

          generatedCompOutputs.push({
            id: `comp-screen-${i + 1}`,
            pageTitle,
            appImage: appImg,
            figmaImage: figmaImg,
            issueHighlightedImage: issueOutput.highlightedUrl,
            issueHighlightedCount: issueOutput.issuesCount,
            visualDefectsImage: visualOutput.highlightedUrl,
            visualDefectsCount: visualOutput.issuesCount,
            activeMode: 'issues'
          });
        }

        // Additional video walkthrough keyframes comparison (only if corresponding Figma image exists)
        if (compAppMode === 'video' && activeVideoFrames.length > 1 && activeFigmaImages.length > 1) {
          for (let i = 1; i < activeVideoFrames.length; i++) {
            const vf = activeVideoFrames[i];
            const figmaImg = activeFigmaImages[i];
            if (!figmaImg) continue; // Do not generate false visual defects for frames without Figma reference
            const pageTitle = `Page ${i + 1}: Video Screen @ Timestamp ${vf.timestamp} vs Figma Spec`;
            const pageDefects = extractPageSpecificDefects(response, i, pageTitle, activeVideoFrames.length, 'comparison', false);

            const issueOutput = await generateComparisonIssueHighlightedScreenshot(vf.image, figmaImg, pageTitle, pageDefects.contrastIssues, i, false);
            const visualOutput = await generateComparisonVisualDefectsScreenshot(vf.image, figmaImg, pageTitle, pageDefects.visualDefects, i, false);

            generatedCompOutputs.push({
              id: `comp-video-frame-${i + 1}`,
              pageTitle,
              appImage: vf.image,
              figmaImage: figmaImg,
              issueHighlightedImage: issueOutput.highlightedUrl,
              issueHighlightedCount: issueOutput.issuesCount,
              visualDefectsImage: visualOutput.highlightedUrl,
              visualDefectsCount: visualOutput.issuesCount,
              activeMode: 'issues'
            });
          }
        }

        setCompContrastOutputs(generatedCompOutputs);
        setCompHighlightedScreenshots(generatedCompOutputs.map(o => o.issueHighlightedImage));
        setCompVisualDefectsScreenshots(generatedCompOutputs.map(o => o.visualDefectsImage));

        // Automatically clear uploaded images from the upload section after comparison analysis completes
        setCompAppImages([]);
        setCompFigmaImages([]);
      }
    } catch (err: any) {
      console.error('UI Comparison Error:', err);
      setCompError(err?.message || 'Failed to generate comparison report.');
    } finally {
      setIsComparing(false);
    }
  };

  const handleResolveComparison = async () => {
    if (!compReport) return;

    setIsResolvingComparison(true);
    setCompError(null);

    try {
      const appImagesToUse = compAppImages.length > 0 ? compAppImages.map(getImageData) : compContrastOutputs.map(o => o.appImage || '').filter(Boolean);
      const figmaImagesToUse = compFigmaImages.length > 0 ? compFigmaImages.map(getImageData) : compContrastOutputs.map(o => o.figmaImage || '').filter(Boolean);
      const result = await correctUIComparisonDiscrepancies(compReport, appImagesToUse, figmaImagesToUse);
      setCompResolutionGuide(result);

      // Re-generate and update all Comparison screenshots to reflect resolved specifications
      const updatedCompOutputs: Array<{
        id: string;
        pageTitle: string;
        figmaImage?: string;
        appImage?: string;
        issueHighlightedImage: string;
        issueHighlightedCount: number;
        visualDefectsImage: string;
        visualDefectsCount: number;
        activeMode?: 'issues' | 'visual_defects';
      }> = [];

      const appSourceImage = (compAppImages[0] ? getImageData(compAppImages[0]) : '')
        || (compContrastOutputs[0]?.appImage)
        || (urlCaptureData?.screenshot)
        || (compAppVideos[0]?.frames[0]?.image)
        || (compAppDocs[0] ? createDocumentCanvasImage(compAppDocs[0].name, compAppDocs[0].content) : '')
        || (compAppUrl.trim() ? createUrlCanvasImage(compAppUrl.trim(), urlCaptureData) : '');

      const figmaSourceImage = (compFigmaImages[0] ? getImageData(compFigmaImages[0]) : '')
        || (compContrastOutputs[0]?.figmaImage)
        || (figmaUrlCaptureData?.screenshot)
        || (compFigmaDocs[0] ? createDocumentCanvasImage(compFigmaDocs[0].name, compFigmaDocs[0].content) : '')
        || (compFigmaUrl.trim() ? createUrlCanvasImage(compFigmaUrl.trim(), figmaUrlCaptureData) : '');

      const totalCompScreens = Math.max(1, compAppImages.length || compContrastOutputs.length);

      if (appSourceImage && figmaSourceImage) {
        const pageTitle = 'Primary App UI vs Figma Spec';
        const pageDefects = extractPageSpecificDefects(result, 0, pageTitle, totalCompScreens, 'comparison', true);

        const issueOutput = await generateComparisonIssueHighlightedScreenshot(appSourceImage, figmaSourceImage, pageTitle, pageDefects.contrastIssues, 0, true);
        const visualOutput = await generateComparisonVisualDefectsScreenshot(appSourceImage, figmaSourceImage, pageTitle, pageDefects.visualDefects, 0, true);

        updatedCompOutputs.push({
          id: 'comp-primary',
          pageTitle,
          appImage: appSourceImage,
          figmaImage: figmaSourceImage,
          issueHighlightedImage: issueOutput.highlightedUrl,
          issueHighlightedCount: 0,
          visualDefectsImage: visualOutput.highlightedUrl,
          visualDefectsCount: 0,
          activeMode: 'issues'
        });
      }

      for (let i = 1; i < compAppImages.length; i++) {
        const appImg = getImageData(compAppImages[i]);
        const figmaImg = (compFigmaImages[i] ? getImageData(compFigmaImages[i]) : '') || figmaSourceImage;
        const pageTitle = `Comparison Screen #${i + 1}`;
        const pageDefects = extractPageSpecificDefects(result, i, pageTitle, totalCompScreens, 'comparison', true);

        const issueOutput = await generateComparisonIssueHighlightedScreenshot(appImg, figmaImg, pageTitle, pageDefects.contrastIssues, i, true);
        const visualOutput = await generateComparisonVisualDefectsScreenshot(appImg, figmaImg, pageTitle, pageDefects.visualDefects, i, true);

        updatedCompOutputs.push({
          id: `comp-screen-${i + 1}`,
          pageTitle,
          appImage: appImg,
          figmaImage: figmaImg,
          issueHighlightedImage: issueOutput.highlightedUrl,
          issueHighlightedCount: 0,
          visualDefectsImage: visualOutput.highlightedUrl,
          visualDefectsCount: 0,
          activeMode: 'issues'
        });
      }

      if (updatedCompOutputs.length > 0) {
        setCompContrastOutputs(updatedCompOutputs);
        setCompHighlightedScreenshots(updatedCompOutputs.map(o => o.issueHighlightedImage));
        setCompVisualDefectsScreenshots(updatedCompOutputs.map(o => o.visualDefectsImage));
      }

      toast.success('Generated resolution guide and updated all comparison screenshots!');
    } catch (err: any) {
      console.error('Resolution Error:', err);
      setCompError(err?.message || 'Failed to generate resolution guide.');
    } finally {
      setIsResolvingComparison(false);
    }
  };

  // Folder & Repository Logic
  const handleCreateFolder = () => {
    const trimmedName = folderName.trim();
    if (!trimmedName) return;
    
    if (editingFolder) {
      const isDuplicate = folders.some(f => f.id !== editingFolder.id && f.name.trim().toLowerCase() === trimmedName.toLowerCase());
      if (isDuplicate) {
        toast.error('A folder with this name already exists in this project');
        return;
      }
      const updatedFolders = folders.map(f => f.id === editingFolder.id ? { ...f, name: trimmedName } : f);
      onUpdateProject({
        ...project,
        uiTestingFolders: updatedFolders
      });
      toast.success(`Folder renamed to "${trimmedName}"`);
      setFolderName('');
      setEditingFolder(null);
      setIsFolderModalOpen(false);
      return;
    }

    const isDuplicate = folders.some(f => f.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (isDuplicate) {
      toast.error('A folder with this name already exists in this project');
      return;
    }

    const newFolderId = generateUniqueFolderId('ui_folder');
    const newFolder: UITestingFolder = {
      id: newFolderId,
      name: trimmedName,
      createdAt: new Date().toISOString()
    };

    onUpdateProject({
      ...project,
      uiTestingFolders: [...folders, newFolder]
    });

    if (folderCreationTarget === 'app') {
      setAppSaveFolderId(newFolderId);
    } else if (folderCreationTarget === 'figma') {
      setFigmaSaveFolderId(newFolderId);
    } else if (folderCreationTarget === 'comp') {
      setCompSaveFolderId(newFolderId);
    } else if (folderCreationTarget === 'repo') {
      setSelectedFolderId(newFolderId);
    }

    toast.success(`Created folder "${trimmedName}"`);
    setFolderName('');
    setEditingFolder(null);
    setIsFolderModalOpen(false);
  };

  const handleDeleteFolder = (folderId: string) => {
    const targetFolder = folders.find(f => f.id === folderId);
    const targetName = targetFolder ? targetFolder.name : 'Folder';

    // Collect all child IDs to permanently tombstone
    const childReports = savedReports.filter(r => r.folderId === folderId);
    const childFigma = savedFigmaReviews.filter(f => f.folderId === folderId);
    const childComps = savedComparisonReports.filter(c => c.folderId === folderId);
    const childInputs = savedInputs.filter(i => i.folderId === folderId);

    const childIds = [
      ...childReports.map(r => r.id),
      ...childFigma.map(f => f.id),
      ...childComps.map(c => c.id),
      ...childInputs.map(i => i.id)
    ];

    const tombstones = [
      folderId,
      `folder-${folderId}`,
      folderId.toLowerCase(),
      `folder-${folderId.toLowerCase()}`,
      targetName,
      targetName.toLowerCase(),
      `folder-${targetName.toLowerCase()}`,
      ...childIds
    ];

    // Record in in-memory & localStorage tombstones
    addDeletedIds(tombstones);

    // Call Firestore delete and backend delete endpoint
    if (project?.id) {
      deleteFolderFromFirestore(project.id, folderId).catch(err => console.warn('[deleteFolderFromFirestore]:', err));
      try {
        fetch(`/api/projects/${project.id}/folders/${folderId}`, { method: 'DELETE' }).catch(() => {});
      } catch (e) {}
    }

    // Completely remove the folder and all its contents (reports, figma reviews, comparisons, inputs)
    const updatedFolders = folders.filter(f => f.id !== folderId);
    const updatedReports = savedReports.filter(r => r.folderId !== folderId);
    const updatedFigma = savedFigmaReviews.filter(f => f.folderId !== folderId);
    const updatedComparisons = savedComparisonReports.filter(c => c.folderId !== folderId);
    const updatedInputs = savedInputs.filter(i => i.folderId !== folderId);

    // Update hydrated states immediately
    setHydratedReports(updatedReports);
    setHydratedFigmaReviews(updatedFigma);
    setHydratedComparisonReports(updatedComparisons);
    setHydratedInputs(updatedInputs);

    const existingDeleted = Array.isArray(project.deletedItemIds) ? project.deletedItemIds : [];
    const nextDeleted = Array.from(new Set([...existingDeleted, ...tombstones].filter(Boolean)));

    // Clean local backup directly
    try {
      const localBackupStr = localStorage.getItem(`automatiqa_project_backup_${project.id}`);
      if (localBackupStr) {
        const localBackup = JSON.parse(localBackupStr);
        if (localBackup) {
          localBackup.uiTestingFolders = updatedFolders;
          localBackup.uiTestingReports = updatedReports;
          localBackup.figmaDesignReviews = updatedFigma;
          localBackup.uiComparisonReports = updatedComparisons;
          localBackup.uiTestingInputs = updatedInputs;
          localBackup.deletedItemIds = nextDeleted;
          localStorage.setItem(`automatiqa_project_backup_${project.id}`, JSON.stringify(localBackup));
        }
      }
    } catch (e) {}

    onUpdateProject({
      ...project,
      uiTestingFolders: updatedFolders,
      uiTestingReports: updatedReports,
      figmaDesignReviews: updatedFigma,
      uiComparisonReports: updatedComparisons,
      uiTestingInputs: updatedInputs,
      deletedItemIds: nextDeleted
    });

    if (selectedFolderId === folderId) {
      setSelectedFolderId('');
    }
    if (appSaveFolderId === folderId) setAppSaveFolderId('');
    if (figmaSaveFolderId === folderId) setFigmaSaveFolderId('');
    if (compSaveFolderId === folderId) setCompSaveFolderId('');
    if (selectedRepoItem && selectedRepoItem.item && (selectedRepoItem.item as any).folderId === folderId) {
      setSelectedRepoItem(null);
    }

    toast.success(`Folder "${targetName}" and all its contents were completely removed.`);
  };

  const executeDeleteItem = (type: 'input' | 'report' | 'figma' | 'comparison', id: string) => {
    addDeletedIds([id]);
    const existingDeleted = Array.isArray(project.deletedItemIds) ? project.deletedItemIds : [];
    const nextDeleted = Array.from(new Set([...existingDeleted, id].filter(Boolean)));

    if (type === 'input') {
      const next = savedInputs.filter(i => i.id !== id);
      setHydratedInputs(next);
      onUpdateProject({
        ...project,
        uiTestingInputs: next,
        deletedItemIds: nextDeleted
      });
    } else if (type === 'report') {
      const next = savedReports.filter(r => r.id !== id);
      setHydratedReports(next);
      onUpdateProject({
        ...project,
        uiTestingReports: next,
        deletedItemIds: nextDeleted
      });
    } else if (type === 'figma') {
      const next = savedFigmaReviews.filter(f => f.id !== id);
      setHydratedFigmaReviews(next);
      onUpdateProject({
        ...project,
        figmaDesignReviews: next,
        deletedItemIds: nextDeleted
      });
    } else {
      const next = savedComparisonReports.filter(c => c.id !== id);
      setHydratedComparisonReports(next);
      onUpdateProject({
        ...project,
        uiComparisonReports: next,
        deletedItemIds: nextDeleted
      });
    }
    toast.success('Item deleted successfully');
  };

  // Split Page-by-Page Comparison Report
  const comparisonPages = useMemo(() => {
    if (!compReport) return [];
    const parts = compReport.split(/(?=###?\s+🖥️|###?\s+Page|##\s+Page)/g);
    if (parts.length <= 1) return [{ title: 'Full Report', content: compReport }];
    
    return parts.map((p, idx) => {
      const lines = p.trim().split('\n');
      const firstLine = lines[0] || `Page ${idx + 1}`;
      const title = firstLine.replace(/^[#\s🖥️]+/, '').trim() || `Page ${idx + 1}`;
      return { title, content: p.trim() };
    });
  }, [compReport]);

  return (
    <div className="space-y-8 animate-fadeIn pb-16">
      {/* Hidden File Inputs */}
      <input type="file" multiple ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
      <input type="file" ref={docInputRef} className="hidden" accept=".pdf,.docx,.txt,.json,.md" onChange={(e) => handleDocSelect(e, 'app')} />
      <input type="file" ref={videoInputRef} className="hidden" accept="video/*" onChange={handleAppVideoSelect} />
      <input type="file" ref={figmaInputRef} className="hidden" accept="image/*" onChange={handleFigmaFileSelect} />
      <input type="file" ref={figmaDocInputRef} className="hidden" accept=".pdf,.docx,.txt,.json,.md" onChange={(e) => handleDocSelect(e, 'figma')} />
      <input type="file" multiple ref={compAppInputRef} className="hidden" accept="image/*" onChange={handleCompAppFileSelect} />
      <input type="file" ref={compAppDocInputRef} className="hidden" accept=".pdf,.docx,.txt,.json,.md" onChange={(e) => handleDocSelect(e, 'compApp')} />
      <input type="file" ref={compAppVideoInputRef} className="hidden" accept="video/*" onChange={handleCompAppVideoSelect} />
      <input type="file" multiple ref={compFigmaInputRef} className="hidden" accept="image/*" onChange={handleCompFigmaFileSelect} />
      <input type="file" ref={compFigmaDocInputRef} className="hidden" accept=".pdf,.docx,.txt,.json,.md" onChange={(e) => handleDocSelect(e, 'compFigma')} />

      {/* Top Header & Tab Navigation Bar */}
      <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">UI TESTING</h2>
        </div>

        {/* Top Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200/60">
          <button 
            onClick={() => handleTabChange('testing')}
            className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${activeTab === 'testing' ? 'bg-white shadow-sm text-[#00E1C5]' : 'text-slate-400 hover:text-slate-700'}`}
          >
            APP UI REVIEW
          </button>
          <button 
            onClick={() => handleTabChange('figma_review')}
            className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${activeTab === 'figma_review' ? 'bg-white shadow-sm text-[#00E1C5]' : 'text-slate-400 hover:text-slate-700'}`}
          >
            FIGMA DESIGN REVIEW
          </button>
          <button 
            onClick={() => handleTabChange('comparison')}
            className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${activeTab === 'comparison' ? 'bg-white shadow-sm text-[#00E1C5]' : 'text-slate-400 hover:text-slate-700'}`}
          >
            FIGMA VS APP UI COMPARISON
          </button>
          <button 
            onClick={() => handleTabChange('repository')}
            className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${activeTab === 'repository' ? 'bg-white shadow-sm text-[#00E1C5]' : 'text-slate-400 hover:text-slate-700'}`}
          >
            FOLDER
          </button>
        </div>
      </div>

      {/* TAB 1: NEW ANALYSIS (APPLICATION UI - ACTUAL UI) */}
      {activeTab === 'testing' && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200/80 shadow-sm space-y-8">
            {/* Header & Sub-navigation pills */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#00E1C5]/15 text-[#00D2B8] rounded-2xl flex items-center justify-center shadow-inner">
                  <Globe size={24} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">APPLICATION UI – ACTUAL UI</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    COLLECT AND ANALYZE ACTUAL APPLICATION UI PAGES & VIDEO FLOWS
                  </p>
                </div>
              </div>

              {/* Input mode switcher pills */}
              <div className="flex items-center gap-1 p-1 bg-slate-100/70 rounded-2xl border border-slate-200/50">
                <button 
                  onClick={() => handleAppInputModeChange('screenshot')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${appInputMode === 'screenshot' ? 'bg-white shadow-sm text-[#00D2B8]' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Upload size={14} /> UPLOAD SCREENSHOT
                </button>
                <button 
                  onClick={() => handleAppInputModeChange('url')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${appInputMode === 'url' ? 'bg-white shadow-sm text-[#00D2B8]' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Link2 size={14} /> APPLICATION URL
                </button>
                <button 
                  onClick={() => handleAppInputModeChange('video')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${appInputMode === 'video' ? 'bg-white shadow-sm text-[#00D2B8]' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Video size={14} /> UPLOAD VIDEO
                </button>
              </div>
            </div>

            {/* Main Upload Drop Box */}
            {appInputMode === 'screenshot' && (
              <div className="border-2 border-dashed border-[#00E1C5]/60 rounded-[2rem] bg-slate-50/20 p-12 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-14 h-14 bg-white rounded-2xl border border-teal-100 shadow-sm flex items-center justify-center text-[#00E1C5]">
                  <Upload size={24} />
                </div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  UPLOAD APPLICATION UI SCREENSHOTS
                </h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  SUPPORTED FORMATS: PNG, JPG, JPEG, WEBP
                </p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 px-8 py-2.5 bg-[#00E1C5] hover:bg-[#00CBB2] text-white rounded-full font-black text-xs uppercase tracking-wider shadow-sm transition-all"
                >
                  BROWSE FILES
                </button>
              </div>
            )}

            {appInputMode === 'url' && (
              <div className="border-2 border-dashed border-[#00E1C5]/60 rounded-[2rem] bg-slate-50/20 p-8 md:p-10 space-y-6">
                <div>
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                    ENTER TARGET APPLICATION URL
                  </label>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    CONNECTS TO ACTUAL APPLICATION URL TO CAPTURE REAL DOM ELEMENTS, HEADINGS & LIVE SCREENSHOT
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative flex-1 w-full">
                    <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text"
                      value={appUrl || ''}
                      onChange={(e) => {
                        setAppUrl(e.target.value);
                        if (urlCaptureData && urlCaptureData.url !== e.target.value.trim()) {
                          setUrlCaptureData(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && appUrl.trim()) {
                          captureAppUrl(appUrl.trim());
                        }
                      }}
                      placeholder="https://app.example.com"
                      className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#00E1C5]"
                    />
                  </div>
                  <button
                    onClick={() => captureAppUrl(appUrl.trim())}
                    disabled={!appUrl.trim() || isCapturingUrl}
                    className="w-full sm:w-auto px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {isCapturingUrl ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-[#00E1C5]" />
                        CAPTURING REAL UI...
                      </>
                    ) : (
                      <>
                        <Globe size={16} className="text-[#00E1C5]" />
                        FETCH & PREVIEW UI
                      </>
                    )}
                  </button>
                </div>

                {/* Live URL Captured Page Preview Card */}
                {urlCaptureData && (
                  <div className="p-5 bg-white rounded-2xl border border-[#00E1C5]/40 shadow-sm space-y-4 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-teal-50 text-[#00E1C5] flex items-center justify-center">
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                              {urlCaptureData.pageTitle || 'Target Application Page'}
                            </span>
                            <span className="px-2 py-0.5 bg-teal-100 text-teal-800 rounded-full text-[9px] font-black uppercase tracking-wider">
                              ● LIVE UI CAPTURED
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-slate-400 truncate max-w-md">
                            {urlCaptureData.url}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => captureAppUrl(appUrl.trim())}
                        disabled={isCapturingUrl}
                        className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-900 flex items-center gap-1 self-start sm:self-auto"
                      >
                        <RotateCcw size={12} /> RE-CAPTURE
                      </button>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-4">
                      {urlCaptureData.screenshot ? (
                        <div className="relative group w-full md:w-48 h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shrink-0">
                          <img 
                            src={urlCaptureData.screenshot} 
                            alt="Live Page Screenshot" 
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                            <button
                              onClick={() => setPreviewModal({
                                isOpen: true,
                                type: 'image',
                                title: `Actual URL UI: ${urlCaptureData.pageTitle}`,
                                url: urlCaptureData.screenshot
                              })}
                              className="px-3 py-1.5 bg-white text-slate-900 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow"
                            >
                              <Eye size={12} /> ZOOM
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full md:w-48 h-28 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] font-bold text-slate-400 text-center p-3 shrink-0">
                          DOM & Content Extracted
                        </div>
                      )}

                      <div className="flex-1 w-full space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {urlCaptureData.elements?.headings?.length ? (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold">
                              {urlCaptureData.elements.headings.length} Headings Detected
                            </span>
                          ) : null}
                          {urlCaptureData.elements?.buttons?.length ? (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold">
                              {urlCaptureData.elements.buttons.length} Buttons / CTAs
                            </span>
                          ) : null}
                          {urlCaptureData.elements?.inputs?.length ? (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-bold">
                              {urlCaptureData.elements.inputs.length} Form Inputs
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[11px] font-medium text-slate-600 line-clamp-2">
                          Ready for exhaustive visual and layout analysis based strictly on the real elements and live visual pages found at this URL.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {appInputMode === 'video' && (
              <div className="border-2 border-dashed border-[#00E1C5]/60 rounded-[2rem] bg-slate-50/20 p-12 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-14 h-14 bg-white rounded-2xl border border-teal-100 shadow-sm flex items-center justify-center text-[#00E1C5]">
                  <Video size={24} />
                </div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  UPLOAD APPLICATION VIDEO RECORDING
                </h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  SUPPORTED FORMATS: MP4, WEBM (MAX 20 MB)
                </p>
                <button 
                  onClick={() => videoInputRef.current?.click()}
                  className="mt-2 px-8 py-2.5 bg-[#00E1C5] hover:bg-[#00CBB2] text-white rounded-full font-black text-xs uppercase tracking-wider shadow-sm transition-all"
                >
                  BROWSE FILES
                </button>
              </div>
            )}

            {/* Render Uploaded Items Thumbnails / Badges */}
            {screenshots.length > 0 && appInputMode === 'screenshot' && (
              <div className="space-y-3 pt-2">
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Uploaded Screenshots ({screenshots.length})</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {screenshots.map((src, idx) => (
                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 shadow-sm">
                      <img src={getImageData(src)} className="w-full h-full object-cover" alt={`Screenshot ${idx + 1}`} />
                      <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `Screenshot ${idx + 1}`, url: getImageData(src) })}
                          className="p-1.5 bg-white text-slate-800 rounded-lg hover:bg-indigo-50 transition-colors shadow"
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          onClick={() => setScreenshots(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors shadow"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {appVideos.length > 0 && appInputMode === 'video' && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Uploaded Application Video Flows ({appVideos.length})
                  </h5>
                  <span className="text-[10px] font-bold text-[#00D2B8] uppercase">
                    {appVideos.reduce((acc, v) => acc + v.frames.length, 0)} Total Extracted Walkthrough Pages
                  </span>
                </div>

                {appVideos.map((vid) => (
                  <div key={vid.id} className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-teal-100 text-[#00D2B8] flex items-center justify-center shrink-0 shadow-xs">
                          <Video size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 truncate" title={vid.name}>{vid.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                              {vid.frames.length} Extracted Screens / Pages
                            </span>
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded uppercase border border-emerald-100 flex items-center gap-0.5">
                              <Check size={10} /> Ready for Audit
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button 
                          onClick={() => setPreviewModal({ isOpen: true, type: 'video', title: vid.name, url: vid.url, frames: vid.frames })}
                          className="px-3 py-1.5 bg-white hover:bg-teal-50 text-[#00D2B8] rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider transition-all shadow-xs flex items-center gap-1.5"
                        >
                          <Eye size={13} /> View Video & Pages
                        </button>
                        <button 
                          onClick={() => setAppVideos(prev => prev.filter(v => v.id !== vid.id))}
                          className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors border border-rose-100"
                          title="Remove Video"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Extracted Keyframe Page Thumbnails Strip */}
                    {vid.frames && vid.frames.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                          Extracted Walkthrough Pages / Screens:
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                          {vid.frames.map((frame, fIdx) => (
                            <div 
                              key={fIdx}
                              onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${vid.name} - Page ${fIdx + 1} (${frame.timestamp})`, url: frame.image })}
                              className="group relative rounded-xl overflow-hidden border border-slate-200/80 bg-white hover:border-[#00E1C5] cursor-pointer shadow-xs transition-all"
                            >
                              <img src={frame.image} alt={`Page ${fIdx + 1}`} className="w-full h-16 object-cover bg-slate-900" />
                              <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-black uppercase gap-1">
                                <Eye size={12} /> Page {fIdx + 1}
                              </div>
                              <div className="p-1 text-center bg-slate-50 border-t border-slate-100 flex items-center justify-between px-1.5">
                                <span className="text-[9px] font-bold text-slate-700">P{fIdx + 1}</span>
                                <span className="text-[9px] font-mono text-[#00D2B8] font-bold">{frame.timestamp}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {appDocs.length > 0 && appInputMode === 'doc' && (
              <div className="space-y-2 pt-2">
                {appDocs.map((doc) => (
                  <div key={doc.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 truncate">
                      <FileText size={16} className="text-[#00D2B8] flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-slate-800 truncate max-w-[200px]">{doc.name}</p>
                        <p className="text-[9px] font-black text-[#00D2B8] uppercase tracking-wider">{doc.content.length} characters parsed</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button 
                        onClick={() => setPreviewModal({ isOpen: true, type: 'document', title: doc.name, content: doc.content })}
                        className="p-1.5 bg-white text-[#00D2B8] rounded-lg hover:bg-teal-50 border border-slate-200 transition-colors shadow-sm"
                      >
                        <Eye size={14} />
                      </button>
                      <button 
                        onClick={() => setAppDocs(prev => prev.filter(d => d.id !== doc.id))}
                        className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors border border-rose-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* INSTRUCTIONAL BOX FOR STANDARD REQUIREMENTS */}
            <StandardRequirementsInstructionBox 
              value={appCompanyStandards}
              onChange={setAppCompanyStandards}
              requirementData={appStandardRequirement}
              onRequirementDataChange={setAppStandardRequirement}
              moduleName="Application UI Review"
              themeColor="teal"
            />

            {/* REFINING INSTRUCTIONS SECTION */}
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">REFINING INSTRUCTIONS</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    ADD CUSTOM RULES OR COLOR CONTRAST VALIDATION DIRECTIVES FOR AI UI ANALYSIS
                  </p>
                </div>
                <span className="px-3 py-1 bg-teal-50 text-[#00D2B8] text-[9px] font-black rounded-full uppercase tracking-wider">
                  ACTIVE FOR {appInputMode.toUpperCase()}
                </span>
              </div>

              {/* Color Contrast Toggle Card */}
              <div className="p-5 bg-slate-50/80 rounded-2xl border border-slate-200/70 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 bg-white rounded-xl border border-slate-200/80 flex items-center justify-center text-slate-500 shadow-sm">
                    <Palette size={18} />
                  </div>
                  <div>
                    <h5 className="text-xs font-black text-slate-800 uppercase tracking-tight">CHECK COLOR CONTRAST IN UI</h5>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                      OPTIONAL: ENABLE WCAG 2.1 COLOR CONTRAST & IMPROVED UI IMAGE GENERATION
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    {checkColorContrast ? 'ON' : 'OFF'}
                  </span>
                  <button 
                    onClick={() => setContrastByMode(prev => ({
                      ...prev,
                      [appInputMode]: !prev[appInputMode]
                    }))}
                    className={`w-12 h-6 rounded-full transition-colors p-1 flex items-center ${checkColorContrast ? 'bg-[#00E1C5] justify-end' : 'bg-slate-200 justify-start'}`}
                  >
                    <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-rose-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* Bottom Action Banner */}
            <div className="p-5 bg-[#00E1C5]/5 border border-[#00E1C5]/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">AI ANALYSIS FOR APPLICATION UI</h5>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  EXECUTE GEMINI AI VISUAL QUALITY & ALIGNMENT AUDIT
                </p>
              </div>

              <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full sm:w-auto px-8 py-3.5 bg-[#00E1C5] hover:bg-[#00CBB2] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    ANALYZING...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    ANALYZE APPLICATION UI NOW
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Analysis Results / Report Container */}
          {report && (
            <div className="space-y-6">
              {/* Primary Analysis Report Card */}
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-teal-50 text-[#00D2B8] rounded-xl flex items-center justify-center">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Application UI Analysis Report</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Numbered issue log & quality audit breakdown</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => downloadDocx(generateMatchedDefectsReport(report, project.name || 'AutomatiQA App', isReportWithContrast), 'defects_report.docx')}
                      className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
                    >
                      <Sliders size={13} /> Download Defects Report (.DOCX)
                    </button>
                    <button
                      onClick={() => downloadDocx(report, 'App_UI_Analysis_Report.docx')}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5"
                    >
                      <FileText size={13} /> Download Report (.DOCX)
                    </button>
                    <button onClick={() => setReport(null)} className="text-slate-400 hover:text-rose-600 text-[10px] font-black uppercase tracking-widest px-2">
                      Clear Report
                    </button>
                  </div>
                </div>

                <div className="markdown-content text-slate-800 leading-relaxed max-h-[600px] overflow-y-auto overflow-x-auto pr-3 custom-scrollbar">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
                </div>
              </div>

              {/* Side-by-Side Issue Highlighted & Visual Defects Audit Analysis Gallery */}
              {contrastOutputs.length > 0 && (
                <div className="bg-white rounded-[2rem] border border-teal-200 shadow-sm p-8 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-teal-100 pb-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-teal-50 text-[#00D2B8] rounded-xl flex items-center justify-center">
                        <ImageIcon size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                          Visual Audit Artifacts & Issue Screenshots
                        </h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                          {isReportWithContrast
                            ? `Switch between CHECK COLOR CONTRAST IN UI and defects audit views for all ${contrastOutputs.length} analyzed screen(s)`
                            : `Visual defects and findings audit view for all ${contrastOutputs.length} analyzed screen(s)`}
                        </p>
                      </div>
                    </div>

                    {/* Master View Switcher Toggle - Only displayed when Color Contrast was enabled */}
                    {isReportWithContrast && (
                      <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start md:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            setAppAuditViewMode('issues');
                            setContrastOutputs(prev => prev.map(item => ({ ...item, activeMode: 'issues' })));
                          }}
                          className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                            appAuditViewMode === 'issues'
                              ? 'bg-[#00E1C5] text-slate-950 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Sparkles size={12} /> CHECK COLOR CONTRAST IN UI
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAppAuditViewMode('visual_defects');
                            setContrastOutputs(prev => prev.map(item => ({ ...item, activeMode: 'visual_defects' })));
                          }}
                          className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                            appAuditViewMode === 'visual_defects'
                              ? 'bg-slate-900 text-[#00E1C5] shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Sliders size={12} /> defects
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-8">
                    {contrastOutputs.map((item, idx) => {
                      const itemMode = item.activeMode || (isReportWithContrast ? appAuditViewMode : 'visual_defects');
                      let activeImage = item.visualDefectsImage;
                      let activeLabel = 'DEFECTS AUDIT';
                      let activeCount = item.visualDefectsCount;

                      if (itemMode === 'corrected' && item.correctedVisualDefectsImage) {
                        activeImage = item.correctedVisualDefectsImage;
                        activeLabel = 'CORRECTED UI SPECIFICATION (RESOLVED)';
                        activeCount = 0;
                      } else if (itemMode === 'issues' && isReportWithContrast) {
                        activeImage = item.issueHighlightedImage;
                        activeLabel = 'CHECK COLOR CONTRAST IN UI';
                        activeCount = item.issueHighlightedCount;
                      } else {
                        activeImage = item.visualDefectsImage;
                        activeLabel = 'defects';
                        activeCount = item.visualDefectsCount;
                      }

                      return (
                        <div key={item.id || idx} className="p-6 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-slate-900 text-[#00E1C5] flex items-center justify-center text-[10px] font-black">
                                {idx + 1}
                              </span>
                              {item.pageTitle}
                            </h5>

                            {/* Item Mode Switcher & Issue Count Badge */}
                            <div className="flex items-center gap-2">
                              <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 shadow-xs">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setContrastOutputs(prev => prev.map((it, i) => i === idx ? { ...it, activeMode: 'visual_defects' } : it));
                                  }}
                                  className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                                    itemMode === 'visual_defects' || (!isReportWithContrast && itemMode !== 'corrected')
                                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                      : 'text-slate-500 hover:text-slate-900'
                                  }`}
                                >
                                  <Sliders size={10} /> defects ({item.visualDefectsCount})
                                </button>
                                {isReportWithContrast && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setContrastOutputs(prev => prev.map((it, i) => i === idx ? { ...it, activeMode: 'issues' } : it));
                                    }}
                                    className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                                      itemMode === 'issues'
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                  >
                                    <Sparkles size={10} /> CHECK COLOR CONTRAST IN UI ({item.issueHighlightedCount})
                                  </button>
                                )}
                                {item.correctedVisualDefectsImage && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setContrastOutputs(prev => prev.map((it, i) => i === idx ? { ...it, activeMode: 'corrected' } : it));
                                    }}
                                    className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                                      itemMode === 'corrected'
                                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                        : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                  >
                                    <CheckCircle2 size={10} /> Corrected UI
                                  </button>
                                )}
                              </div>

                              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                                itemMode === 'corrected'
                                  ? 'bg-teal-50 text-teal-700 border-teal-200'
                                  : itemMode === 'visual_defects' || !isReportWithContrast
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    : 'bg-rose-50 text-rose-600 border-rose-100'
                              }`}>
                                {itemMode === 'corrected' ? 'RESOLVED' : `${activeCount} ${itemMode === 'visual_defects' || !isReportWithContrast ? 'DEFECTS AUDITED' : 'CONTRAST ISSUES'}`}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Original Input */}
                            <div className="space-y-2 bg-white p-3 rounded-xl border border-slate-200">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Original Provided Input</span>
                                <button
                                  onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - Original Input`, url: item.originalImage })}
                                  className="text-[9px] font-bold text-slate-500 hover:text-slate-900 uppercase flex items-center gap-1"
                                >
                                  <Eye size={10} /> Full View
                                </button>
                              </div>
                              <img
                                src={item.originalImage}
                                alt="Original Page Input"
                                className="w-full rounded-lg border border-slate-200 max-h-[380px] object-contain bg-slate-900"
                              />
                            </div>

                            {/* Highlighted Output */}
                            <div className={`space-y-2 bg-white p-3 rounded-xl border ${itemMode === 'corrected' ? 'border-teal-300' : (!isReportWithContrast || itemMode === 'visual_defects' ? 'border-indigo-300' : 'border-teal-200')}`}>
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${itemMode === 'corrected' ? 'text-teal-700' : (!isReportWithContrast || itemMode === 'visual_defects' ? 'text-indigo-700' : 'text-[#00A896]')}`}>
                                  {itemMode === 'corrected' ? <CheckCircle2 size={12} /> : (!isReportWithContrast || itemMode === 'visual_defects' ? <Sliders size={12} /> : <Sparkles size={12} />)}
                                  {activeLabel}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - ${activeLabel}`, url: activeImage })}
                                    className="text-[9px] font-bold text-slate-600 hover:text-slate-900 uppercase flex items-center gap-1"
                                  >
                                    <Eye size={10} /> Full View
                                  </button>
                                  <button
                                    onClick={() => downloadDataUrl(activeImage, `${!isReportWithContrast ? 'defects' : (itemMode === 'visual_defects' ? 'defects' : 'CHECK COLOR CONTRAST IN UI')}${contrastOutputs.length > 1 ? `_Page_${idx + 1}` : ''}.png`)}
                                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-[#00E1C5] text-[9px] font-black uppercase rounded-md transition-all flex items-center gap-1 shadow-xs"
                                  >
                                    <Download size={10} /> Download
                                  </button>
                                </div>
                              </div>
                              <img
                                src={activeImage}
                                alt={activeLabel}
                                className={`w-full rounded-lg border max-h-[380px] object-contain bg-slate-950 shadow-sm ${itemMode === 'corrected' ? 'border-teal-300' : (!isReportWithContrast || itemMode === 'visual_defects' ? 'border-indigo-300' : 'border-teal-300')}`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Corrective Remediation Options (Correct Report) */}
              <div className="p-6 bg-slate-900 text-white rounded-[2rem] border border-slate-800 shadow-lg space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider text-[#00E1C5] flex items-center gap-2">
                      <Sparkles size={18} /> CORRECTIVE UI REMEDIATION & DOWNLOADS
                    </h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      GENERATE CORRECTED SPECIFICATION REPORT AND CORRECTED UI SCREENSHOT MOCKUP
                    </p>
                  </div>

                  {(isReportWithContrast || checkColorContrast) && (
                    <span className="px-3 py-1 bg-[#00E1C5]/20 text-[#00E1C5] border border-[#00E1C5]/30 rounded-full text-[9px] font-black uppercase tracking-wider">
                      WCAG 2.1 CONTRAST CHECK ACTIVE
                    </span>
                  )}
                </div>

                {/* Option 1: Correct Report */}
                <div>
                  <button
                    onClick={handleCorrectIssues}
                    disabled={isCorrecting}
                    className="w-full p-5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 rounded-2xl flex flex-col items-start gap-3 transition-all group hover:border-[#00E1C5]/50 text-left disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="w-10 h-10 bg-teal-500/20 text-[#00E1C5] rounded-xl flex items-center justify-center">
                        <FileText size={20} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#00E1C5] group-hover:underline flex items-center gap-1">
                        {isCorrecting ? <Loader2 size={12} className="animate-spin" /> : null}
                        {correctedReport ? 'REGENERATE CORRECTED REPORT & SCREENSHOT' : 'GENERATE CORRECTED REPORT & SCREENSHOT'}
                      </span>
                    </div>
                    <div>
                      <h5 className="text-xs font-black uppercase text-white tracking-wider">Option 1: Correct Report</h5>
                      <p className="text-[10px] font-medium text-slate-400 mt-1">
                        Generates a corrected UI specification report alongside a high-fidelity corrected UI screenshot mockup with fixed colors, contrast ratios, typography, and copy.
                      </p>
                    </div>
                  </button>
                </div>

                {/* Display Corrected Report if present */}
                {correctedReport && (
                  <div className="p-6 bg-slate-900 text-white rounded-2xl border border-[#00E1C5]/40 shadow-xl space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-[#00E1C5]/20 text-[#00E1C5] rounded-xl border border-[#00E1C5]/30">
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <h5 className="text-xs font-black uppercase text-[#00E1C5] tracking-wider">
                            Corrected UI Specification & Remediation Report
                          </h5>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                            Post-Remediation Specifications, Contrast Ratios & Layout Rules
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(correctedReport);
                            toast.success('Copied corrected report markdown to clipboard');
                          }}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all border border-slate-700 flex items-center gap-1.5"
                        >
                          <Copy size={12} /> Copy Markdown
                        </button>
                        <button
                          onClick={() => downloadDocx(correctedReport, 'Corrected_UI_Specification_Report.docx')}
                          className="px-4 py-2 bg-[#00E1C5] hover:bg-[#00CBB2] text-slate-950 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow flex items-center gap-1.5"
                        >
                          <Download size={12} /> Download Corrected Report (.DOCX)
                        </button>
                      </div>
                    </div>

                    <div className="markdown-dark text-slate-200 text-sm leading-relaxed max-h-[600px] overflow-y-auto overflow-x-auto pr-3 custom-scrollbar p-5 bg-slate-950/80 rounded-xl border border-slate-800">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{correctedReport}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Display Corrected UI Screenshot Mockups for ALL screens if present */}
                {(() => {
                  const correctedList: Array<{ id: string; pageTitle: string; originalImage: string; correctedImage: string }> = 
                    correctedScreenshots.length > 0 
                      ? correctedScreenshots 
                      : (correctedImage 
                          ? [{ 
                              id: 'corr_0', 
                              pageTitle: contrastOutputs[0]?.pageTitle || 'Application Screen 1', 
                              originalImage: (screenshots[0] ? getImageData(screenshots[0]) : '') || (contrastOutputs[0]?.originalImage) || (appVideos[0]?.frames[0]?.image) || '', 
                              correctedImage 
                            }] 
                          : []);

                  if (correctedList.length === 0) return null;

                  return (
                    <div className="p-6 bg-slate-900/90 rounded-2xl border border-[#00E1C5]/40 shadow-xl space-y-6">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-[#00E1C5]/20 text-[#00E1C5] rounded-xl border border-[#00E1C5]/30">
                            <Sparkles size={18} />
                          </div>
                          <div>
                            <h5 className="text-xs font-black uppercase text-[#00E1C5] tracking-wider">
                              Corrected UI Screenshot Mockups ({correctedList.length} Screen{correctedList.length > 1 ? 's' : ''})
                            </h5>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                              Visual Remediation for All Screens with Standardized Geometry, Accessible Contrast & Typography
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {correctedList.length > 1 && (
                            <button
                              onClick={() => {
                                correctedList.forEach((item, idx) => {
                                  downloadDataUrl(item.correctedImage, `Corrected_UI_Screenshot_Screen_${idx + 1}.png`);
                                });
                                toast.success(`Downloaded all ${correctedList.length} corrected UI screenshots`);
                              }}
                              className="px-3.5 py-2 bg-[#00E1C5] hover:bg-[#00CBB2] text-slate-950 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow flex items-center gap-1.5"
                            >
                              <Download size={12} /> Download All ({correctedList.length}) (.PNG)
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-8">
                        {correctedList.map((item, idx) => (
                          <div key={item.id || idx} className="p-5 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                              <span className="text-xs font-black text-[#00E1C5] uppercase tracking-wider flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-[#00E1C5]/20 text-[#00E1C5] flex items-center justify-center text-[10px] font-black border border-[#00E1C5]/30">
                                  {idx + 1}
                                </span>
                                {item.pageTitle || `Application Screen ${idx + 1}`}
                              </span>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setPreviewModal({
                                    isOpen: true,
                                    type: 'image',
                                    title: `Corrected UI: ${item.pageTitle}`,
                                    url: item.correctedImage
                                  })}
                                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[9px] uppercase tracking-wider rounded-lg transition-all border border-slate-700 flex items-center gap-1"
                                >
                                  <Eye size={11} /> Zoom
                                </button>
                                <button
                                  onClick={() => downloadDataUrl(item.correctedImage, `Corrected_UI_Screenshot_${idx + 1}.png`)}
                                  className="px-3 py-1.5 bg-[#00E1C5] hover:bg-[#00CBB2] text-slate-950 font-black text-[9px] uppercase tracking-wider rounded-lg transition-all shadow flex items-center gap-1"
                                >
                                  <Download size={11} /> Download (.PNG)
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                              {/* Original Input */}
                              <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    Original Provided Input
                                  </span>
                                  {item.originalImage && (
                                    <button
                                      onClick={() => setPreviewModal({
                                        isOpen: true,
                                        type: 'image',
                                        title: `${item.pageTitle} - Original Input`,
                                        url: item.originalImage
                                      })}
                                      className="text-[9px] font-bold text-slate-400 hover:text-slate-200 uppercase flex items-center gap-1"
                                    >
                                      <Eye size={10} /> View Original
                                    </button>
                                  )}
                                </div>
                                {item.originalImage ? (
                                  <img
                                    src={item.originalImage}
                                    alt="Original UI"
                                    className="w-full rounded-lg border border-slate-800 max-h-[380px] object-contain bg-slate-950"
                                  />
                                ) : (
                                  <div className="p-12 text-center text-slate-500 text-xs font-bold bg-slate-950 rounded-lg border border-slate-800">
                                    Original Reference
                                  </div>
                                )}
                              </div>

                              {/* Corrected UI Mockup */}
                              <div className="space-y-2 bg-slate-950 p-3 rounded-xl border border-[#00E1C5]/30">
                                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-[#00E1C5] flex items-center gap-1">
                                    <CheckCircle2 size={12} /> Corrected UI Mockup
                                  </span>
                                  <button
                                    onClick={() => setPreviewModal({
                                      isOpen: true,
                                      type: 'image',
                                      title: `Corrected UI Mockup: ${item.pageTitle}`,
                                      url: item.correctedImage
                                    })}
                                    className="text-[9px] font-bold text-[#00E1C5] hover:text-[#00CBB2] uppercase flex items-center gap-1"
                                  >
                                    <Eye size={10} /> View
                                  </button>
                                </div>
                                <img
                                  src={item.correctedImage}
                                  alt="Corrected UI"
                                  className="w-full rounded-lg border border-[#00E1C5]/40 max-h-[380px] object-contain bg-slate-950 shadow-md"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Save to Folder Card */}
                <div className="p-6 bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex-1 w-full space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                        <Save size={14} className="text-[#00E1C5]" /> Save Analysis & Inputs to Folder (APP UI REVIEW)
                      </label>
                      {isAppSaved && (
                        <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase rounded-md border border-emerald-500/30 flex items-center gap-1">
                          <Check size={11} /> Saved to Folder
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={appSaveName || ''}
                        onChange={(e) => {
                          setAppSaveName(e.target.value);
                          if (isAppSaved) setIsAppSaved(false);
                        }}
                        placeholder={`${project.name || 'AutomatiQA App'} - App UI Review`}
                        className="px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-[#00E1C5] w-full"
                      />
                      <div className="flex gap-1.5">
                        <select
                          value={appSaveFolderId || ''}
                          onChange={(e) => {
                            setAppSaveFolderId(e.target.value);
                            if (isAppSaved) setIsAppSaved(false);
                          }}
                          className="px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 outline-none focus:border-[#00E1C5] flex-1"
                        >
                          <option value="">📁 Root / No Folder (Default)</option>
                          {folders.map(f => (
                            <option key={f.id} value={f.id}>📁 {f.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFolder(null);
                            setFolderName('');
                            setFolderCreationTarget('app');
                            setIsFolderModalOpen(true);
                          }}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[#00E1C5] rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"
                          title="Create New Folder"
                        >
                          <FolderPlus size={14} /> + New
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveAppUIReport}
                    disabled={isSavingAppReport}
                    className="w-full md:w-auto px-6 py-3 bg-[#00E1C5] hover:bg-[#00CBB2] disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 rounded-xl font-black text-xs uppercase tracking-wider shadow transition-all flex items-center justify-center gap-2"
                  >
                    {isSavingAppReport ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        SAVING TO FOLDER...
                      </>
                    ) : (
                      <>
                        {isAppSaved ? <Check size={16} /> : <Save size={16} />}
                        {isAppSaved ? 'SAVE ANOTHER COPY' : 'SAVE TO FOLDER'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FIGMA DESIGN REVIEW */}
      {activeTab === 'figma_review' && (
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200/80 shadow-sm space-y-8">
            {/* Header & Sub-navigation pills */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-md shadow-amber-200">
                  <Layout size={24} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">FIGMA DESIGN REVIEW – REFERENCE DESIGN</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                    UPLOAD AND REVIEW FIGMA REFERENCE DESIGNS & MULTI-PAGE SPECS
                  </p>
                </div>
              </div>

              {/* Input mode switcher pills */}
              <div className="flex items-center gap-1 p-1 bg-slate-100/70 rounded-2xl border border-slate-200/50">
                <button 
                  onClick={() => handleFigmaInputModeChange('document')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${figmaInputMode === 'document' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <FileText size={14} /> FIGMA DOCUMENT
                </button>
                <button 
                  onClick={() => handleFigmaInputModeChange('screenshot')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${figmaInputMode === 'screenshot' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Upload size={14} /> FIGMA SCREENSHOT
                </button>
                <button 
                  onClick={() => handleFigmaInputModeChange('url')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${figmaInputMode === 'url' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <Link2 size={14} /> FIGMA URL
                </button>
              </div>
            </div>

            {/* Drop Zone Box */}
            {figmaInputMode === 'screenshot' && (
              <div className="border-2 border-dashed border-amber-300 rounded-[2rem] bg-amber-50/20 p-12 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-14 h-14 bg-white rounded-2xl border border-amber-200 shadow-sm flex items-center justify-center text-amber-500">
                  <Upload size={24} />
                </div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  UPLOAD FIGMA DESIGN SCREENSHOTS & EXPORTS
                </h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  SUPPORTED FORMATS: PNG, JPG, JPEG, WEBP
                </p>
                <button 
                  onClick={() => figmaInputRef.current?.click()}
                  className="mt-2 px-8 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-full font-black text-xs uppercase tracking-wider shadow-sm transition-all"
                >
                  BROWSE FILES
                </button>
              </div>
            )}

            {figmaInputMode === 'document' && (
              <div className="border-2 border-dashed border-amber-300 rounded-[2rem] bg-amber-50/20 p-12 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-14 h-14 bg-white rounded-2xl border border-amber-200 shadow-sm flex items-center justify-center text-amber-500">
                  <FileText size={24} />
                </div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  UPLOAD FIGMA SPECIFICATION DOCUMENTS
                </h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  SUPPORTED FORMATS: PDF, DOCX, TXT, JSON, MD
                </p>
                <button 
                  onClick={() => figmaDocInputRef.current?.click()}
                  className="mt-2 px-8 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-full font-black text-xs uppercase tracking-wider shadow-sm transition-all"
                >
                  BROWSE FILES
                </button>
              </div>
            )}

            {figmaInputMode === 'url' && (
              <div className="border-2 border-dashed border-amber-300 rounded-[2rem] bg-amber-50/20 p-8 md:p-10 space-y-6">
                <div>
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                    ENTER FIGMA DESIGN FILE URL
                  </label>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    FETCHES EXACT FIGMA DESIGN SCREENSHOT & EMBEDDABLE DESIGN CANVAS
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative flex-1 w-full">
                    <FileSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text"
                      value={figmaUrl || ''}
                      onChange={(e) => {
                        setFigmaUrl(e.target.value);
                        if (figmaUrlCaptureData && figmaUrlCaptureData.url !== e.target.value.trim()) {
                          setFigmaUrlCaptureData(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && figmaUrl.trim()) {
                          captureFigmaUrl(figmaUrl.trim());
                        }
                      }}
                      placeholder="https://www.figma.com/file/..."
                      className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500"
                    />
                  </div>
                  <button
                    onClick={() => captureFigmaUrl(figmaUrl.trim())}
                    disabled={!figmaUrl.trim() || isCapturingFigmaUrl}
                    className="w-full sm:w-auto px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {isCapturingFigmaUrl ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-amber-500" />
                        CONNECTING TO FIGMA...
                      </>
                    ) : (
                      <>
                        <Globe size={16} className="text-amber-500" />
                        FETCH & PREVIEW FIGMA
                      </>
                    )}
                  </button>
                </div>

                {/* Live Figma Design Preview Card */}
                {figmaUrlCaptureData && (
                  <div className="p-5 bg-white rounded-2xl border border-amber-300/60 shadow-sm space-y-4 animate-fadeIn">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">
                              {figmaUrlCaptureData.pageTitle || 'Figma Reference Design'}
                            </span>
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[9px] font-black uppercase tracking-wider">
                              ● FIGMA LIVE CAPTURED
                            </span>
                          </div>
                          <p className="text-[10px] font-mono text-slate-400 truncate max-w-md">
                            {figmaUrlCaptureData.url}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => captureFigmaUrl(figmaUrl.trim())}
                        disabled={isCapturingFigmaUrl}
                        className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-900 flex items-center gap-1 self-start sm:self-auto"
                      >
                        <RotateCcw size={12} /> RE-FETCH
                      </button>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-4">
                      {figmaUrlCaptureData.screenshot ? (
                        <div className="relative group w-full md:w-56 h-32 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shrink-0">
                          <img 
                            src={figmaUrlCaptureData.screenshot} 
                            alt="Figma Design Preview" 
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                            <button
                              onClick={() => setPreviewModal({
                                isOpen: true,
                                type: 'image',
                                title: `Figma Design: ${figmaUrlCaptureData.pageTitle}`,
                                url: figmaUrlCaptureData.screenshot
                              })}
                              className="px-3 py-1.5 bg-white text-slate-900 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow"
                            >
                              <Eye size={12} /> ZOOM
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {figmaUrlCaptureData.figmaEmbedUrl && (
                        <div className="w-full h-48 rounded-xl overflow-hidden border border-slate-200">
                          <iframe
                            title="Figma Live Preview"
                            src={figmaUrlCaptureData.figmaEmbedUrl}
                            className="w-full h-full border-0"
                            allowFullScreen
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Render Uploaded Figma Items */}
            {figmaImages.length > 0 && figmaInputMode === 'screenshot' && (
              <div className="space-y-3 pt-2">
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Uploaded Figma Screenshots ({figmaImages.length})</h5>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {figmaImages.map((item, idx) => {
                    const src = getImageData(item);
                    const name = getImageName(item, `Figma Frame ${idx + 1}`);
                    return (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 shadow-sm">
                        <img src={src} className="w-full h-full object-cover" alt={name} />
                        <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-2">
                          <button 
                            onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: name, url: src })}
                            className="p-1.5 bg-white text-slate-800 rounded-lg hover:bg-amber-50 transition-colors shadow"
                          >
                            <Eye size={14} />
                          </button>
                          <button 
                            onClick={() => setFigmaImages(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors shadow"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Uploaded Figma Documents */}
            {figmaDocs.length > 0 && (
              <div className="space-y-3 pt-2">
                <h5 className="text-[10px] font-black text-amber-900 uppercase tracking-wider">
                  Uploaded Figma Specs / Documents ({figmaDocs.length})
                </h5>
                <div className="space-y-2">
                  {figmaDocs.map((doc) => (
                    <div key={doc.id} className="p-3 bg-white rounded-xl border border-amber-200/80 shadow-xs flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0 border border-amber-100">
                          <FileText size={20} />
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-xs font-black text-slate-900 truncate">{doc.name}</h5>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">SPEC DOC</span>
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded uppercase border border-emerald-100 flex items-center gap-0.5">
                              <Check size={10} /> Uploaded
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setPreviewModal({ isOpen: true, type: 'document', title: doc.name, content: doc.content })}
                          className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Eye size={12} /> View
                        </button>
                        <button
                          onClick={() => setFigmaDocs(prev => prev.filter(d => d.id !== doc.id))}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* INSTRUCTIONAL BOX FOR STANDARD REQUIREMENTS */}
            <StandardRequirementsInstructionBox 
              value={figmaCompanyStandards}
              onChange={setFigmaCompanyStandards}
              requirementData={figmaStandardRequirement}
              onRequirementDataChange={setFigmaStandardRequirement}
              moduleName="Figma Design Review"
              themeColor="amber"
            />

            {/* REFINING INSTRUCTIONS SECTION FOR FIGMA REVIEW */}
            <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">REFINING INSTRUCTIONS</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  AUTOMATED FIGMA DESIGN SPECIFICATION & FORMATTING REVIEW
                </p>
              </div>
              <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[9px] font-black rounded-full uppercase tracking-wider">
                ACTIVE FOR {figmaInputMode.toUpperCase()}
              </span>
            </div>

            {figmaReviewError && (
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-rose-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                <AlertCircle size={14} /> {figmaReviewError}
              </div>
            )}

            {/* Bottom Action Banner */}
            <div className="p-5 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  AI ANALYSIS FOR FIGMA DESIGN SCREENSHOT
                </h5>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                  EXECUTE GEMINI AI LAYOUT, TYPOGRAPHY, & VISUAL QUALITY AUDIT FOR THIS INPUT
                </p>
              </div>

              <button 
                onClick={handleFigmaReview}
                disabled={isReviewingFigma}
                className="w-full sm:w-auto px-8 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isReviewingFigma ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    REVIEWING...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    ANALYZE FIGMA DESIGN SCREENSHOT NOW
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Figma Review Report Results */}
          {figmaReviewReport && (
            <div className="bg-white rounded-[2rem] border border-amber-200 shadow-sm p-8 space-y-6">
              <div className="flex items-center justify-between border-b border-amber-100 pb-4">
                <div>
                  <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-black text-[9px] rounded-lg border border-amber-300 uppercase">
                    APP: {project.name || 'AutomatiQA App'}
                  </span>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mt-2">
                    FIGMA DESIGN REVIEW REPORT
                  </h4>
                </div>
                <button onClick={() => setFigmaReviewReport(null)} className="text-slate-400 hover:text-rose-600 text-[10px] font-black uppercase tracking-widest">
                  Clear Report
                </button>
              </div>

              <div className="markdown-content text-slate-800 leading-relaxed max-h-[600px] overflow-y-auto overflow-x-auto pr-3 custom-scrollbar">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{figmaReviewReport}</ReactMarkdown>
              </div>

              {/* Side-by-Side Identified Defects Audit Analysis Gallery for Figma Review */}
              {figmaContrastOutputs.length > 0 && (
                <div className="bg-amber-50/50 rounded-2xl border border-amber-200 p-6 space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-amber-200/80 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                        <ImageIcon size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                          Figma Design Review & Defect Audit Evidence
                        </h4>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                          Visual defects and design system specification audit for all {figmaContrastOutputs.length} analyzed frame(s)/page(s)
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {figmaContrastOutputs.map((item, idx) => {
                      const isItemCorrected = item.activeMode === 'corrected' && Boolean(item.correctedVisualDefectsImage);
                      const activeImage = isItemCorrected ? item.correctedVisualDefectsImage! : item.visualDefectsImage;
                      const activeCount = item.visualDefectsCount;
                      const activeLabel = isItemCorrected ? 'CORRECTED FIGMA DESIGN (RESOLVED)' : 'Figma Design Defects Audit';

                      return (
                        <div key={item.id || idx} className="p-5 bg-white rounded-2xl border border-amber-200 space-y-4 shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black">
                                {idx + 1}
                              </span>
                              {item.pageTitle}
                            </h5>

                            {/* Status Badge & Mode Switcher if corrected */}
                            <div className="flex items-center gap-2">
                              {item.correctedVisualDefectsImage && (
                                <div className="flex items-center bg-slate-50 rounded-lg border border-amber-200 p-0.5 shadow-xs">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFigmaContrastOutputs(prev => prev.map((it, i) => i === idx ? { ...it, activeMode: 'visual_defects' } : it));
                                    }}
                                    className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                                      !isItemCorrected
                                        ? 'bg-amber-500 text-white border border-amber-600'
                                        : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                  >
                                    <Sliders size={10} /> Defects ({item.visualDefectsCount})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFigmaContrastOutputs(prev => prev.map((it, i) => i === idx ? { ...it, activeMode: 'corrected' } : it));
                                    }}
                                    className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                                      isItemCorrected
                                        ? 'bg-emerald-600 text-white border border-emerald-700'
                                        : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                  >
                                    <CheckCircle2 size={10} /> Corrected (Resolved)
                                  </button>
                                </div>
                              )}

                              <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                                isItemCorrected
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : activeCount > 0
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}>
                                {isItemCorrected 
                                  ? 'RESOLVED' 
                                  : activeCount > 0 
                                    ? `${activeCount} ${activeCount === 1 ? 'DEFECT IDENTIFIED' : 'DEFECTS IDENTIFIED'}` 
                                    : 'ALL DESIGN SPECS PASSED (0 DEFECTS)'}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Original Figma Input */}
                            <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Original Figma Reference</span>
                                <button
                                  onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - Original Figma`, url: item.originalImage })}
                                  className="text-[9px] font-bold text-amber-600 hover:text-amber-800 uppercase flex items-center gap-1"
                                >
                                  <Eye size={10} /> Full View
                                </button>
                              </div>
                              <ScreenshotImage
                                src={item.originalImage}
                                alt="Original Figma Input"
                                className="w-full rounded-lg border border-slate-200 max-h-[360px] object-contain bg-slate-900"
                                containerClassName="w-full relative"
                              />
                            </div>

                            {/* Highlighted Figma Output */}
                            <div className={`space-y-2 p-3 rounded-xl border ${isItemCorrected ? 'bg-emerald-50/40 border-emerald-300' : 'bg-amber-50/40 border-amber-300'}`}>
                              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                                <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${isItemCorrected ? 'text-emerald-900' : 'text-amber-900'}`}>
                                  {isItemCorrected ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Sliders size={12} className="text-amber-600" />}
                                  {activeLabel}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - ${activeLabel}`, url: activeImage })}
                                    className="text-[9px] font-bold text-amber-700 hover:text-amber-900 uppercase flex items-center gap-1"
                                  >
                                    <Eye size={10} /> Full View
                                  </button>
                                  <button
                                    onClick={() => downloadDataUrl(activeImage, `Figma_${isItemCorrected ? 'Corrected' : 'Design_Defects'}_Page_${idx + 1}.png`)}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black uppercase rounded-md transition-all flex items-center gap-1 shadow-xs"
                                  >
                                    <Download size={10} /> Download Output
                                  </button>
                                </div>
                              </div>
                              <ScreenshotImage
                                src={activeImage}
                                alt={activeLabel}
                                className={`w-full rounded-lg border max-h-[360px] object-contain bg-slate-950 shadow-md ${isItemCorrected ? 'border-emerald-400' : 'border-amber-300'}`}
                                containerClassName="w-full relative"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action: Correct Figma Issues */}
              {!figmaCorrectedReport && (
                <div className="pt-4 border-t border-amber-100 flex justify-end">
                  <button
                    onClick={handleCorrectFigmaIssues}
                    disabled={isCorrectingFigma}
                    className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isCorrectingFigma ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    CORRECT FIGMA DESIGN ISSUES NOW
                  </button>
                </div>
              )}

              {/* Corrected Figma Report */}
              {figmaCorrectedReport && (
                <div className="p-6 bg-amber-50/70 rounded-2xl border border-amber-300 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                    <h5 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-amber-600" /> CORRECTED FIGMA DESIGN RECOMMENDATIONS & REMEDIATION
                    </h5>
                    <button
                      onClick={() => downloadDocx(figmaCorrectedReport, `${figmaSaveName || 'Figma_Review'}_Corrected_Specs.docx`)}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs"
                    >
                      <Download size={12} /> Download Corrected (.DOCX)
                    </button>
                  </div>
                  <div className="markdown-content text-slate-800 leading-relaxed max-h-[500px] overflow-y-auto overflow-x-auto pr-3 custom-scrollbar">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{figmaCorrectedReport}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Save to Folder Banner for Figma Review */}
              <div className="p-6 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Save size={18} className="text-amber-400" />
                    <h5 className="text-xs font-black uppercase tracking-wider">Save Figma Design Review to Folder</h5>
                  </div>
                  {isFigmaSaved && (
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase rounded-lg border border-emerald-500/30 flex items-center gap-1">
                      <Check size={12} /> SAVED TO FOLDER
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Audit Report Name</label>
                    <input 
                      type="text" 
                      value={figmaSaveName || ''}
                      onChange={(e) => {
                        setFigmaSaveName(e.target.value);
                        if (isFigmaSaved) setIsFigmaSaved(false);
                      }}
                      placeholder={`${project.name || 'AutomatiQA App'} - Figma Review`}
                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Target Folder</label>
                    <div className="flex gap-1.5">
                      <select
                        value={figmaSaveFolderId || ''}
                        onChange={(e) => {
                          setFigmaSaveFolderId(e.target.value);
                          if (isFigmaSaved) setIsFigmaSaved(false);
                        }}
                        className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-amber-400 flex-1"
                      >
                        <option value="">📁 Root / No Folder</option>
                        {folders.map(f => (
                          <option key={f.id} value={f.id}>📁 {f.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFolder(null);
                          setFolderName('');
                          setFolderCreationTarget('figma');
                          setIsFolderModalOpen(true);
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"
                        title="Create New Folder"
                      >
                        <FolderPlus size={14} /> + New
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => downloadDocx(figmaReviewReport, `${figmaSaveName || 'Figma_Review'}.docx`)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
                  >
                    <FileText size={14} /> Download Report (.DOCX)
                  </button>

                  <button
                    onClick={handleSaveFigmaReview}
                    disabled={isSavingFigmaReview}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md flex items-center gap-2 transition-all"
                  >
                    {isSavingFigmaReview ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> SAVING...
                      </>
                    ) : (
                      <>
                        {isFigmaSaved ? <Check size={14} /> : <Save size={14} />} {isFigmaSaved ? 'SAVE ANOTHER COPY' : 'SAVE TO FOLDER'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FIGMA VS APP UI COMPARISON */}
      {activeTab === 'comparison' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Inputs Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <ArrowRightLeft size={16} className="text-[#00D2B8]" /> APPLICATION UI VS FIGMA VALIDATION
                </h3>
                <span className="px-3 py-1 bg-teal-50 text-[#00D2B8] font-black text-[9px] rounded-full uppercase tracking-wider">
                  DESIGN AUDIT
                </span>
              </div>

              {/* 1. FIGMA DESIGN - EXPECTED UI */}
              <div className="p-5 bg-amber-50/40 rounded-2xl border border-amber-200/60 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-amber-900 uppercase tracking-wide">
                    1. FIGMA DESIGN – EXPECTED UI
                  </h4>
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 font-black text-[9px] rounded-md uppercase tracking-wider">
                    EXPECTED SPEC
                  </span>
                </div>

                {/* Sub-mode selector */}
                <div className="flex items-center gap-1 p-1 bg-amber-100/50 rounded-xl">
                  <button 
                    onClick={() => handleCompFigmaModeChange('doc')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${compFigmaMode === 'doc' ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-800 hover:bg-amber-100'}`}
                  >
                    UPLOAD DOC
                  </button>
                  <button 
                    onClick={() => handleCompFigmaModeChange('screenshot')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${compFigmaMode === 'screenshot' ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-800 hover:bg-amber-100'}`}
                  >
                    SCREENSHOT
                  </button>
                  <button 
                    onClick={() => handleCompFigmaModeChange('url')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${compFigmaMode === 'url' ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-800 hover:bg-amber-100'}`}
                  >
                    FIGMA URL
                  </button>
                </div>

                {/* Dashed Drop Box */}
                {compFigmaMode === 'screenshot' && (
                  <div 
                    onClick={() => compFigmaInputRef.current?.click()}
                    className="border-2 border-dashed border-amber-300/80 bg-white rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 cursor-pointer hover:bg-amber-50/30 transition-all"
                  >
                    <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center">
                      <Upload size={18} />
                    </div>
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                      UPLOAD FIGMA SCREENSHOT / EXPORT (PNG, JPG)
                    </p>
                  </div>
                )}

                {compFigmaMode === 'doc' && (
                  <div 
                    onClick={() => compFigmaDocInputRef.current?.click()}
                    className="border-2 border-dashed border-amber-300/80 bg-white rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 cursor-pointer hover:bg-amber-50/30 transition-all"
                  >
                    <div className="w-10 h-10 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center">
                      <FileText size={18} />
                    </div>
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                      UPLOAD FIGMA SPEC DOCUMENT (PDF, DOCX)
                    </p>
                  </div>
                )}

                {compFigmaMode === 'url' && (
                  <input 
                    type="text"
                    value={compFigmaUrl || ''}
                    onChange={(e) => setCompFigmaUrl(e.target.value)}
                    placeholder="https://figma.com/file/..."
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-amber-500"
                  />
                )}

                {/* Uploaded Figma Items Previews */}
                {compFigmaImages.length > 0 && compFigmaMode === 'screenshot' && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[10px] font-black text-amber-900 uppercase tracking-wider">Uploaded Figma Screenshots ({compFigmaImages.length})</p>
                    <div className="space-y-2">
                      {compFigmaImages.map((imgItem, i) => {
                        const src = getImageData(imgItem);
                        const name = getImageName(imgItem, `Figma_Screen_${i + 1}.png`);
                        const meta = getImageMeta(imgItem);
                        return (
                          <div key={i} className="p-3 bg-white rounded-xl border border-amber-200/80 shadow-xs flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <img src={src} className="w-10 h-10 object-cover rounded-lg border border-amber-200 shrink-0" alt="Figma Spec" />
                              <div className="min-w-0">
                                <h5 className="text-xs font-black text-slate-900 truncate" title={name}>{name}</h5>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">{meta.type} • {meta.size}</span>
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded uppercase border border-emerald-100 flex items-center gap-0.5">
                                    <Check size={10} /> Uploaded
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: name, url: src })}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Eye size={12} /> View
                              </button>
                              <button
                                onClick={() => setCompFigmaImages(prev => prev.filter((_, idx) => idx !== i))}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Trash2 size={12} /> Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {compFigmaDocs.length > 0 && compFigmaMode === 'doc' && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[10px] font-black text-amber-900 uppercase tracking-wider">Uploaded Figma Specs / Docs ({compFigmaDocs.length})</p>
                    <div className="space-y-2">
                      {compFigmaDocs.map((doc) => (
                        <div key={doc.id} className="p-3 bg-white rounded-xl border border-amber-200/80 shadow-xs flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0 border border-amber-100">
                              <FileText size={20} />
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-black text-slate-900 truncate">{doc.name}</h5>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">DOCX • 0.02 MB</span>
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded uppercase border border-emerald-100 flex items-center gap-0.5">
                                  <Check size={10} /> Uploaded
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => setPreviewModal({ isOpen: true, type: 'document', title: doc.name, content: doc.content })}
                              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                            >
                              <Eye size={12} /> View
                            </button>
                            <button
                              onClick={() => setCompFigmaDocs(prev => prev.filter(d => d.id !== doc.id))}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. APPLICATION UI - ACTUAL UI */}
              <div className="p-5 bg-teal-50/40 rounded-2xl border border-teal-200/60 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide">
                    2. APPLICATION UI – ACTUAL UI
                  </h4>
                  <span className="px-2.5 py-0.5 bg-teal-100 text-teal-800 font-black text-[9px] rounded-md uppercase tracking-wider">
                    LIVE IMPLEMENTATION
                  </span>
                </div>

                {/* Sub-mode selector */}
                <div className="flex items-center gap-1 p-1 bg-teal-100/50 rounded-xl">
                  <button 
                    onClick={() => handleCompAppModeChange('screenshot')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${compAppMode === 'screenshot' ? 'bg-[#00E1C5] text-white shadow-sm' : 'text-teal-800 hover:bg-teal-100'}`}
                  >
                    UPLOAD SCREENSHOT
                  </button>
                  <button 
                    onClick={() => handleCompAppModeChange('url')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${compAppMode === 'url' ? 'bg-[#00E1C5] text-white shadow-sm' : 'text-teal-800 hover:bg-teal-100'}`}
                  >
                    TARGET URL
                  </button>
                  <button 
                    onClick={() => handleCompAppModeChange('video')}
                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${compAppMode === 'video' ? 'bg-[#00E1C5] text-white shadow-sm' : 'text-teal-800 hover:bg-teal-100'}`}
                  >
                    UPLOAD VIDEO
                  </button>
                </div>

                {/* Dashed Drop Box */}
                {compAppMode === 'screenshot' && (
                  <div 
                    onClick={() => compAppInputRef.current?.click()}
                    className="border-2 border-dashed border-[#00E1C5]/80 bg-white rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 cursor-pointer hover:bg-teal-50/30 transition-all"
                  >
                    <div className="w-10 h-10 bg-teal-50 text-[#00E1C5] rounded-xl flex items-center justify-center">
                      <Upload size={18} />
                    </div>
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                      UPLOAD APP UI SCREENSHOT (PNG, JPG)
                    </p>
                  </div>
                )}

                {compAppMode === 'video' && (
                  <div 
                    onClick={() => compAppVideoInputRef.current?.click()}
                    className="border-2 border-dashed border-[#00E1C5]/80 bg-white rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 cursor-pointer hover:bg-teal-50/30 transition-all"
                  >
                    <div className="w-10 h-10 bg-teal-50 text-[#00E1C5] rounded-xl flex items-center justify-center">
                      <Video size={18} />
                    </div>
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                      UPLOAD APP RECORDING (MP4, WEBM • MAX 20 MB)
                    </p>
                  </div>
                )}

                {compAppMode === 'url' && (
                  <input 
                    type="text"
                    value={compAppUrl || ''}
                    onChange={(e) => setCompAppUrl(e.target.value)}
                    placeholder="https://app.example.com"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[#00E1C5]"
                  />
                )}

                {/* Uploaded App UI Items Previews */}
                {compAppImages.length > 0 && compAppMode === 'screenshot' && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[10px] font-black text-teal-900 uppercase tracking-wider">Uploaded App Screenshots ({compAppImages.length})</p>
                    <div className="space-y-2">
                      {compAppImages.map((imgItem, i) => {
                        const src = getImageData(imgItem);
                        const name = getImageName(imgItem, `App_UI_Screen_${i + 1}.png`);
                        const meta = getImageMeta(imgItem);
                        return (
                          <div key={i} className="p-3 bg-white rounded-xl border border-teal-200/80 shadow-xs flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <img src={src} className="w-10 h-10 object-cover rounded-lg border border-teal-200 shrink-0" alt="App UI" />
                              <div className="min-w-0">
                                <h5 className="text-xs font-black text-slate-900 truncate" title={name}>{name}</h5>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">{meta.type} • {meta.size}</span>
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded uppercase border border-emerald-100 flex items-center gap-0.5">
                                    <Check size={10} /> Uploaded
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: name, url: src })}
                                className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Eye size={12} /> View
                              </button>
                              <button
                                onClick={() => setCompAppImages(prev => prev.filter((_, idx) => idx !== i))}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Trash2 size={12} /> Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {compAppDocs.length > 0 && compAppMode === 'doc' && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[10px] font-black text-teal-900 uppercase tracking-wider">Uploaded App Specs / Docs ({compAppDocs.length})</p>
                    <div className="space-y-2">
                      {compAppDocs.map((doc) => (
                        <div key={doc.id} className="p-3 bg-white rounded-xl border border-teal-200/80 shadow-xs flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-lg flex items-center justify-center shrink-0 border border-teal-100">
                              <FileText size={20} />
                            </div>
                            <div className="min-w-0">
                              <h5 className="text-xs font-black text-slate-900 truncate">{doc.name}</h5>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">SPEC DOC</span>
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded uppercase border border-emerald-100 flex items-center gap-0.5">
                                  <Check size={10} /> Uploaded
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => setPreviewModal({ isOpen: true, type: 'document', title: doc.name, content: doc.content })}
                              className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                            >
                              <Eye size={12} /> View
                            </button>
                            <button
                              onClick={() => setCompAppDocs(prev => prev.filter(d => d.id !== doc.id))}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase rounded-lg transition-colors flex items-center gap-1"
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {compAppVideos.length > 0 && compAppMode === 'video' && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black text-teal-900 uppercase tracking-wider">Uploaded App Videos ({compAppVideos.length})</p>
                      <span className="text-[9px] font-bold text-teal-600 uppercase">
                        {compAppVideos.reduce((acc, v) => acc + v.frames.length, 0)} Total Extracted Walkthrough Pages
                      </span>
                    </div>

                    <div className="space-y-3">
                      {compAppVideos.map((vid) => (
                        <div key={vid.id} className="p-4 bg-white rounded-2xl border border-teal-200/80 shadow-xs space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center shrink-0 border border-teal-100">
                                <Video size={20} />
                              </div>
                              <div className="min-w-0">
                                <h5 className="text-xs font-black text-slate-900 truncate" title={vid.name}>{vid.name}</h5>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">{vid.frames.length} Extracted Screens</span>
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded uppercase border border-emerald-100 flex items-center gap-0.5">
                                    <Check size={10} /> Ready for Comparison
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => setPreviewModal({ isOpen: true, type: 'video', title: vid.name, url: vid.url, frames: vid.frames })}
                                className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-[10px] font-black uppercase rounded-xl transition-colors flex items-center gap-1 shadow-2xs"
                              >
                                <Eye size={12} /> View Video & Pages
                              </button>
                              <button
                                onClick={() => setCompAppVideos(prev => prev.filter(v => v.id !== vid.id))}
                                className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition-colors border border-rose-100"
                                title="Remove Video"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Extracted Keyframes Thumbnails */}
                          {vid.frames && vid.frames.length > 0 && (
                            <div className="pt-2 border-t border-teal-100/60">
                              <span className="text-[9px] font-black text-teal-800/70 uppercase tracking-widest block mb-1.5">
                                Extracted Video Screens / Pages:
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                {vid.frames.map((frame, fIdx) => (
                                  <div 
                                    key={fIdx}
                                    onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${vid.name} - Screen ${fIdx + 1} (${frame.timestamp})`, url: frame.image })}
                                    className="group relative rounded-xl overflow-hidden border border-teal-100 bg-slate-50 hover:border-teal-400 cursor-pointer shadow-2xs transition-all"
                                  >
                                    <img src={frame.image} alt={`Screen ${fIdx + 1}`} className="w-full h-14 object-cover bg-slate-900" />
                                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[8px] font-black uppercase gap-1">
                                      <Eye size={10} /> P{fIdx + 1}
                                    </div>
                                    <div className="p-0.5 text-center bg-white border-t border-teal-50 flex items-center justify-between px-1 text-[8px]">
                                      <span className="font-bold text-slate-700">P{fIdx + 1}</span>
                                      <span className="font-mono text-teal-600 font-bold">{frame.timestamp}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* INSTRUCTIONAL BOX FOR STANDARD REQUIREMENTS */}
              <StandardRequirementsInstructionBox 
                value={compCompanyStandards}
                onChange={setCompCompanyStandards}
                requirementData={compStandardRequirement}
                onRequirementDataChange={setCompStandardRequirement}
                moduleName="Figma vs App Comparison"
                themeColor="cyan"
              />

              {compError && (
                <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-rose-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                  <AlertCircle size={14} /> {compError}
                </div>
              )}

              {/* Big Action Button */}
              <button 
                onClick={handleCompareUI}
                disabled={isComparing}
                className="w-full py-4 bg-[#00E1C5] hover:bg-[#00CBB2] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-[#00E1C5]/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {isComparing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    COMPARING...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft size={16} />
                    COMPARE APPLICATION & FIGMA UI
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Results Column */}
          <div className="lg:col-span-7 space-y-6">
            {isComparing ? (
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 space-y-6 min-h-[480px]">
                <div className="text-center space-y-1 border-b border-slate-100 pb-4">
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin text-[#00E1C5]" /> EXECUTING VISUAL QA COMPARISON
                  </h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    STEP {comparisonStep} OF 7 • {[
                      'PREPARING FIGMA REFERENCE DESIGN',
                      'VALIDATING APPLICATION TARGET URL / INPUTS',
                      'CAPTURING LIVE APPLICATION UI',
                      'EXECUTING SCREEN IDENTITY CHECK',
                      'AUDITING VISUAL ELEMENTS (TYPOGRAPHY, COLORS, LAYOUT)',
                      'ANALYZING DESIGN SYSTEM DISCREPANCIES',
                      'GENERATING ENTERPRISE UI VALIDATION REPORT'
                    ][comparisonStep - 1]}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    <span>PROGRESS</span>
                    <span className="text-[#00E1C5]">{Math.round((comparisonStep / 7) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className="bg-[#00E1C5] h-2.5 rounded-full transition-all duration-500 ease-out" 
                      style={{ width: `${Math.round((comparisonStep / 7) * 100)}%` }} 
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  {[
                    { step: 1, label: 'Preparing Figma Reference Design' },
                    { step: 2, label: 'Validating Application Target URL / Inputs' },
                    { step: 3, label: 'Capturing Live Application UI' },
                    { step: 4, label: 'Executing Screen Identity Check' },
                    { step: 5, label: 'Auditing Visual Elements (Typography, Colors, Layout)' },
                    { step: 6, label: 'Analyzing Design System Discrepancies' },
                    { step: 7, label: 'Generating Enterprise UI Validation Report' }
                  ].map((s) => {
                    const isDone = s.step < comparisonStep;
                    const isActive = s.step === comparisonStep;
                    return (
                      <div key={s.step} className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                        isActive 
                          ? 'bg-[#00E1C5]/10 border-[#00E1C5] text-slate-900 font-black' 
                          : isDone 
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800 font-bold' 
                            : 'bg-slate-50 border-slate-100 text-slate-400 font-medium'
                      }`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                          isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-[#00E1C5] text-white animate-spin' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {isDone ? <Check size={12} /> : s.step}
                        </div>
                        <span className="text-xs tracking-wide">{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : compReport ? (
              (() => {
                const hasFullValidationReport = compReport.includes('UI VALIDATION REPORT') || compReport.includes('1. OVERALL VALIDATION SUMMARY');
                const isScreenMismatch = !hasFullValidationReport && (
                  compReport.includes('COMPARISON STATUS: FAILED (INPUTS DO NOT MATCH)') || 
                  compReport.includes('⚠️ COMPARISON STATUS: FAILED') || 
                  compReport.includes('TOTAL_SCREEN_MISMATCH') ||
                  compReport.includes('Comparison Status: FAILED') ||
                  compReport.includes('SCREEN MISMATCH')
                );

                if (isScreenMismatch) {
                  return (
                    <div className="p-8 bg-rose-50/60 rounded-[2rem] border-2 border-rose-300 shadow-md space-y-6">
                      {/* Top Header Banner */}
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                          <AlertTriangle size={24} />
                        </div>
                        <div className="space-y-1">
                          <span className="px-3 py-1 bg-rose-100 text-rose-700 font-black text-[9px] rounded-full uppercase tracking-wider border border-rose-200 inline-block">
                            SCREEN IDENTITY CHECK: FAILED
                          </span>
                          <h3 className="text-base font-black text-rose-950 uppercase tracking-tight">
                            COMPARISON STATUS: FAILED (SCREEN MISMATCH)
                          </h3>
                          <p className="text-xs font-bold text-rose-700/90 leading-relaxed">
                            The uploaded Figma Design and Application UI do not represent the same screen or workflow. Visual comparison was halted to prevent false discrepancies.
                          </p>
                        </div>
                      </div>

                      {/* Inner White Box with Markdown Report */}
                      <div className="bg-white rounded-2xl border border-rose-200 p-6 space-y-4 shadow-sm text-slate-800">
                        <div className="markdown-content text-slate-800 text-xs leading-relaxed max-h-[500px] overflow-y-auto overflow-x-auto pr-3 custom-scrollbar">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{compReport}</ReactMarkdown>
                        </div>
                      </div>

                      {/* Red Reset Action Button */}
                      <button 
                        onClick={() => {
                          setCompReport(null);
                          setCompAppImages([]);
                          setCompAppVideos([]);
                          setCompFigmaImages([]);
                          setCompFigmaDocs([]);
                          setCompError(null);
                        }}
                        className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
                      >
                        <RotateCcw size={16} />
                        RE-SELECT CORRECT FIGMA FRAME OR APPLICATION URL
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                      <div>
                        <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 font-black text-[9px] rounded-lg border border-indigo-300 uppercase">
                          APP: {project.name || 'AutomatiQA App'}
                        </span>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mt-2">🎨 UI VALIDATION REPORT</h4>
                      </div>
                      <button onClick={() => setCompReport(null)} className="text-slate-400 hover:text-rose-600 text-[10px] font-black uppercase tracking-widest">
                        Clear Comparison
                      </button>
                    </div>

                    <div className="markdown-content text-slate-800 leading-relaxed text-xs max-h-[600px] overflow-y-auto overflow-x-auto pr-3 custom-scrollbar">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{compReport}</ReactMarkdown>
                    </div>

                    {/* Visual Comparison Discrepancy & Issue Screenshots */}
                    {compContrastOutputs.length > 0 && (
                      <div className="bg-indigo-50/50 rounded-2xl border border-indigo-200 p-6 space-y-6">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-200/80 pb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                              <ImageIcon size={20} />
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">
                                Comparison Audit Artifacts & Discrepancy Evidence
                              </h4>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">
                                Switch between Discrepancy Diff and Visual Defect audit views for all {compContrastOutputs.length} comparison screen(s)
                              </p>
                            </div>
                          </div>

                          {/* Master View Switcher Toggle */}
                          <div className="flex items-center gap-2 bg-white/80 p-1.5 rounded-2xl border border-indigo-200 self-start md:self-auto shadow-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setCompAuditViewMode('issues');
                                setCompContrastOutputs(prev => prev.map(item => ({ ...item, activeMode: 'issues' })));
                              }}
                              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                compAuditViewMode === 'issues'
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <Sparkles size={12} /> Discrepancies Highlighted (Diff)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCompAuditViewMode('visual_defects');
                                setCompContrastOutputs(prev => prev.map(item => ({ ...item, activeMode: 'visual_defects' })));
                              }}
                              className={`px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                compAuditViewMode === 'visual_defects'
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <Sliders size={12} /> Visual Defects Audit (Layout)
                            </button>
                          </div>
                        </div>

                        <div className="space-y-6">
                          {compContrastOutputs.map((item, idx) => {
                            const itemMode = item.activeMode || compAuditViewMode;
                            const activeImage = itemMode === 'visual_defects' ? item.visualDefectsImage : item.issueHighlightedImage;
                            const activeCount = itemMode === 'visual_defects' ? item.visualDefectsCount : item.issueHighlightedCount;
                            const activeLabel = itemMode === 'visual_defects' ? 'Visual Defects & Layout Audit' : 'Figma vs App Discrepancies';

                            return (
                              <div key={item.id || idx} className="p-5 bg-white rounded-2xl border border-indigo-200 space-y-4 shadow-sm">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <h5 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">
                                      {idx + 1}
                                    </span>
                                    {item.pageTitle}
                                  </h5>

                                  {/* Item Mode Switcher & Issue Count Badge */}
                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center bg-slate-50 rounded-lg border border-indigo-200 p-0.5 shadow-xs">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCompContrastOutputs(prev => prev.map((it, i) => i === idx ? { ...it, activeMode: 'issues' } : it));
                                        }}
                                        className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                                          itemMode === 'issues'
                                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                            : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                      >
                                        <Sparkles size={10} /> Discrepancies ({item.issueHighlightedCount})
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCompContrastOutputs(prev => prev.map((it, i) => i === idx ? { ...it, activeMode: 'visual_defects' } : it));
                                        }}
                                        className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                                          itemMode === 'visual_defects'
                                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                            : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                      >
                                        <Sliders size={10} /> Visual Defects ({item.visualDefectsCount})
                                      </button>
                                    </div>

                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                                      itemMode === 'visual_defects'
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        : 'bg-rose-50 text-rose-600 border-rose-200'
                                    }`}>
                                      {activeCount} {itemMode === 'visual_defects' ? 'DEFECTS AUDITED' : 'DISCREPANCIES HIGHLIGHTED'}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  {/* Baseline References */}
                                  <div className="space-y-4">
                                    {item.figmaImage && (
                                      <div className="space-y-1.5 bg-amber-50/40 p-3 rounded-xl border border-amber-200">
                                        <div className="flex items-center justify-between border-b border-amber-200 pb-1.5">
                                          <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider">Figma Design (Expected)</span>
                                          <button
                                            onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - Figma Expected`, url: item.figmaImage })}
                                            className="text-[9px] font-bold text-amber-700 hover:text-amber-900 uppercase flex items-center gap-1"
                                          >
                                            <Eye size={10} /> Full View
                                          </button>
                                        </div>
                                        <ScreenshotImage
                                          src={item.figmaImage}
                                          alt="Figma Expected"
                                          className="w-full rounded-lg border border-amber-200 max-h-[220px] object-contain bg-slate-900"
                                          containerClassName="w-full max-h-[220px] relative rounded-lg flex items-center justify-center bg-slate-900"
                                          objectFit="contain"
                                          onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - Figma Expected`, url: item.figmaImage })}
                                        />
                                      </div>
                                    )}

                                    {item.appImage && (
                                      <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Application UI (Actual)</span>
                                          <button
                                            onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - App Actual`, url: item.appImage })}
                                            className="text-[9px] font-bold text-slate-600 hover:text-slate-900 uppercase flex items-center gap-1"
                                          >
                                            <Eye size={10} /> Full View
                                          </button>
                                        </div>
                                        <ScreenshotImage
                                          src={item.appImage}
                                          alt="App Actual"
                                          className="w-full rounded-lg border border-slate-200 max-h-[220px] object-contain bg-slate-900"
                                          containerClassName="w-full max-h-[220px] relative rounded-lg flex items-center justify-center bg-slate-900"
                                          objectFit="contain"
                                          onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - App Actual`, url: item.appImage })}
                                        />
                                      </div>
                                    )}
                                  </div>

                                  {/* Highlighted Discrepancies / Defects Output */}
                                  <div className={`space-y-2 p-3 rounded-xl border flex flex-col justify-between ${itemMode === 'visual_defects' ? 'bg-indigo-50/30 border-indigo-300' : 'bg-rose-50/30 border-rose-300'}`}>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                                        <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${itemMode === 'visual_defects' ? 'text-indigo-900' : 'text-rose-900'}`}>
                                          {itemMode === 'visual_defects' ? <Sliders size={12} className="text-indigo-600" /> : <Sparkles size={12} className="text-rose-600" />}
                                          {activeLabel}
                                        </span>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - ${activeLabel}`, url: activeImage })}
                                            className="text-[9px] font-bold text-slate-700 hover:text-slate-900 uppercase flex items-center gap-1"
                                          >
                                            <Eye size={10} /> Full View
                                          </button>
                                          <button
                                            onClick={() => downloadDataUrl(activeImage, `Comparison_${itemMode === 'visual_defects' ? 'Visual_Defects' : 'Discrepancies'}_Page_${idx + 1}.png`)}
                                            className={`px-2.5 py-1 text-white text-[9px] font-black uppercase rounded-md transition-all flex items-center gap-1 shadow-xs ${itemMode === 'visual_defects' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                                          >
                                            <Download size={10} /> Download Output
                                          </button>
                                        </div>
                                      </div>
                                      <ScreenshotImage
                                        src={activeImage}
                                        alt={activeLabel}
                                        className={`w-full rounded-lg border max-h-[460px] object-contain bg-slate-950 shadow-md ${itemMode === 'visual_defects' ? 'border-indigo-300' : 'border-rose-300'}`}
                                        containerClassName="w-full max-h-[460px] relative rounded-lg flex items-center justify-center bg-slate-950"
                                        objectFit="contain"
                                        onClick={() => setPreviewModal({ isOpen: true, type: 'image', title: `${item.pageTitle} - ${activeLabel}`, url: activeImage })}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Resolution Guide Action */}
                    {!compResolutionGuide && (
                      <div className="pt-4 border-t border-slate-100 flex justify-end">
                        <button
                          onClick={handleResolveComparison}
                          disabled={isResolvingComparison}
                          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          {isResolvingComparison ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          GENERATE RESOLUTION GUIDE NOW
                        </button>
                      </div>
                    )}

                    {/* Generated Resolution Guide */}
                    {compResolutionGuide && (
                      <div className="p-6 bg-indigo-50/70 rounded-2xl border border-indigo-300 space-y-4 shadow-sm">
                        <div className="flex items-center justify-between border-b border-indigo-200 pb-3">
                          <h5 className="text-xs font-black text-indigo-900 uppercase tracking-wider flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-indigo-600" /> RECOMMENDED UI DISCREPANCY RESOLUTIONS & REMEDIATION
                          </h5>
                          <button
                            onClick={() => downloadDocx(compResolutionGuide, `${compSaveName || 'Comparison'}_Resolution_Guide.docx`)}
                            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-xs"
                          >
                            <Download size={12} /> Download Guide (.DOCX)
                          </button>
                        </div>
                        <div className="markdown-content text-slate-800 text-xs leading-relaxed max-h-[500px] overflow-y-auto overflow-x-auto pr-3 custom-scrollbar">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{compResolutionGuide}</ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Save to Folder Banner for Comparison */}
                    <div className="p-6 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-4 shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                          <Save size={18} className="text-indigo-400" />
                          <h5 className="text-xs font-black uppercase tracking-wider">Save UI Comparison Audit to Folder</h5>
                        </div>
                        {isCompSaved && (
                          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase rounded-lg border border-emerald-500/30 flex items-center gap-1">
                            <Check size={12} /> SAVED TO FOLDER
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Audit Report Name</label>
                          <input 
                            type="text" 
                            value={compSaveName || ''}
                            onChange={(e) => {
                              setCompSaveName(e.target.value);
                              if (isCompSaved) setIsCompSaved(false);
                            }}
                            placeholder={`${project.name || 'AutomatiQA App'} - Figma vs App Comparison`}
                            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-400"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Select Target Folder</label>
                          <div className="flex gap-1.5">
                            <select
                              value={compSaveFolderId || ''}
                              onChange={(e) => {
                                setCompSaveFolderId(e.target.value);
                                if (isCompSaved) setIsCompSaved(false);
                              }}
                              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-400 flex-1"
                            >
                              <option value="">📁 Root / No Folder</option>
                              {folders.map(f => (
                                <option key={f.id} value={f.id}>📁 {f.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFolder(null);
                                setFolderName('');
                                setFolderCreationTarget('comp');
                                setIsFolderModalOpen(true);
                              }}
                              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-400 rounded-xl text-xs font-bold flex items-center gap-1 shrink-0"
                              title="Create New Folder"
                            >
                              <FolderPlus size={14} /> + New
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          onClick={() => downloadDocx(compReport, `${compSaveName || 'Comparison'}.docx`)}
                          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
                        >
                          <FileText size={14} /> Download Report (.DOCX)
                        </button>

                        <button
                          onClick={handleSaveComparison}
                          disabled={isSavingComparison}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md flex items-center gap-2 transition-all"
                        >
                          {isSavingComparison ? (
                            <>
                              <Loader2 size={14} className="animate-spin" /> SAVING...
                            </>
                          ) : (
                            <>
                              {isCompSaved ? <Check size={14} /> : <Save size={14} />} {isCompSaved ? 'SAVE ANOTHER COPY' : 'SAVE TO FOLDER'}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="border-2 border-dashed border-slate-200/80 rounded-[2rem] bg-slate-50/20 p-12 flex flex-col items-center justify-center text-center min-h-[500px]">
                <div className="w-16 h-16 bg-slate-100/80 rounded-2xl flex items-center justify-center text-slate-400 mb-4 shadow-inner">
                  <ArrowRightLeft size={28} />
                </div>
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  NO COMPARISON PERFORMED
                </h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest max-w-sm mt-2 leading-relaxed">
                  PROVIDE FIGMA DESIGN (DOC / SCREENSHOT / LINK) AND APPLICATION UI (SCREENSHOT / TARGET URL / VIDEO) ON THE LEFT TO START VISUAL COMPARISON
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: FOLDER */}
      {activeTab === 'repository' && (
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-8">
          {/* Top Folder Header & Controls */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <Folder size={18} className="text-[#00D2B8]" /> QA Folder & Saved UI Artifacts
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                Browse, search, and manage saved analysis reports, original input assets, and generated UI fixes
              </p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={repoSearchQuery}
                  onChange={(e) => setRepoSearchQuery(e.target.value)}
                  placeholder="Search saved reports or assets..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-[#00D2B8]"
                />
                {repoSearchQuery && (
                  <button
                    onClick={() => setRepoSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <button
                onClick={() => {
                  setEditingFolder(null);
                  setFolderName('');
                  setFolderCreationTarget('repo');
                  setIsFolderModalOpen(true);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all shrink-0"
              >
                <FolderPlus size={14} className="text-[#00D2B8]" /> New Folder
              </button>
            </div>
          </div>

          {/* Folder Filtering Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5"><Folder size={12} /> Filter by Folder:</span>
              <span>{folders.length} Custom Folder{folders.length === 1 ? '' : 's'}</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedFolderId('')}
                className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                  selectedFolderId === ''
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>📁 All Items</span>
                <span className={`px-1.5 py-0.2 text-[9px] rounded-full font-black ${selectedFolderId === '' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {savedReports.length + savedFigmaReviews.length + savedComparisonReports.length}
                </span>
              </button>

              <button
                onClick={() => setSelectedFolderId('root')}
                className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                  selectedFolderId === 'root'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>📂 Root / Unassigned</span>
                <span className={`px-1.5 py-0.2 text-[9px] rounded-full font-black ${selectedFolderId === 'root' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {savedReports.filter(r => !r.folderId).length + savedFigmaReviews.filter(f => !f.folderId).length + savedComparisonReports.filter(c => !c.folderId).length}
                </span>
              </button>

              {folders.map(f => {
                const count = savedReports.filter(r => r.folderId === f.id).length +
                              savedFigmaReviews.filter(fr => fr.folderId === f.id).length +
                              savedComparisonReports.filter(c => c.folderId === f.id).length;
                const isSelected = selectedFolderId === f.id;

                return (
                  <div key={f.id} className="relative group flex items-center">
                    <button
                      onClick={() => setSelectedFolderId(f.id)}
                      className={`pl-3.5 pr-8 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#00D2B8] text-slate-950 shadow-sm font-black'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Folder size={12} className={isSelected ? 'text-slate-950' : 'text-slate-500'} />
                      <span className="truncate max-w-[140px]">{f.name}</span>
                      <span className={`px-1.5 py-0.2 text-[9px] rounded-full font-black ${isSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-200 text-slate-700'}`}>
                        {count}
                      </span>
                    </button>

                    <div className="absolute right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFolder(f);
                          setFolderName(f.name);
                          setIsFolderModalOpen(true);
                        }}
                        className="p-1 hover:bg-slate-300 rounded text-slate-700 hover:text-slate-900"
                        title="Rename Folder"
                      >
                        <Edit size={10} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderToDelete(f);
                        }}
                        className="p-1 hover:bg-rose-100 rounded text-slate-700 hover:text-rose-600 transition-colors"
                        title="Delete Folder and Contents"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3 Section Sub-Tabs */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200/60">
            <button
              onClick={() => setRepoCategoryTab('APP UI REVIEW')}
              className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                repoCategoryTab === 'APP UI REVIEW' 
                  ? 'bg-white shadow-sm text-[#00A896]' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Globe size={14} /> 1. APP UI REVIEW ({
                savedReports
                  .filter(r => selectedFolderId === '' ? true : selectedFolderId === 'root' ? !r.folderId : r.folderId === selectedFolderId)
                  .filter(r => !repoSearchQuery.trim() || r.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) || (r.appUrl && r.appUrl.toLowerCase().includes(repoSearchQuery.toLowerCase())) || (r.appName && r.appName.toLowerCase().includes(repoSearchQuery.toLowerCase())))
                  .length
              })
            </button>

            <button
              onClick={() => setRepoCategoryTab('FIGMA DESIGN REVIEW')}
              className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                repoCategoryTab === 'FIGMA DESIGN REVIEW' 
                  ? 'bg-white shadow-sm text-amber-600' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Layout size={14} /> 2. FIGMA DESIGN REVIEW ({
                savedFigmaReviews
                  .filter(f => selectedFolderId === '' ? true : selectedFolderId === 'root' ? !f.folderId : f.folderId === selectedFolderId)
                  .filter(f => !repoSearchQuery.trim() || f.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) || (f.figmaUrl && f.figmaUrl.toLowerCase().includes(repoSearchQuery.toLowerCase())) || (f.appName && f.appName.toLowerCase().includes(repoSearchQuery.toLowerCase())))
                  .length
              })
            </button>

            <button
              onClick={() => setRepoCategoryTab('FIGMA VS COMPARISON')}
              className={`px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                repoCategoryTab === 'FIGMA VS COMPARISON' 
                  ? 'bg-white shadow-sm text-indigo-600' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ArrowRightLeft size={14} /> 3. FIGMA VS COMPARISON ({
                savedComparisonReports
                  .filter(c => selectedFolderId === '' ? true : selectedFolderId === 'root' ? !c.folderId : c.folderId === selectedFolderId)
                  .filter(c => !repoSearchQuery.trim() || c.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) || (c.appUrl && c.appUrl.toLowerCase().includes(repoSearchQuery.toLowerCase())) || (c.figmaUrl && c.figmaUrl.toLowerCase().includes(repoSearchQuery.toLowerCase())) || (c.appName && c.appName.toLowerCase().includes(repoSearchQuery.toLowerCase())))
                  .length
              })
            </button>
          </div>

          {/* Section 1: APP UI REVIEW */}
          {repoCategoryTab === 'APP UI REVIEW' && (
            <div className="space-y-4">
              {(() => {
                const filtered = savedReports
                  .filter(r => selectedFolderId === '' ? true : selectedFolderId === 'root' ? !r.folderId : r.folderId === selectedFolderId)
                  .filter(r => !repoSearchQuery.trim() || r.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) || (r.appUrl && r.appUrl.toLowerCase().includes(repoSearchQuery.toLowerCase())) || (r.appName && r.appName.toLowerCase().includes(repoSearchQuery.toLowerCase())));

                if (filtered.length === 0) {
                  return (
                    <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <Globe size={32} className="mx-auto text-slate-300 mb-3" />
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">No App UI Review reports found in this view</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                        {repoSearchQuery ? `No reports matching "${repoSearchQuery}"` : 'Analyze application UI in the "APP UI REVIEW" tab and click "SAVE TO FOLDER"'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map(report => {
                      const assignedFolder = folders.find(f => f.id === report.folderId);
                      return (
                        <div key={report.id} className="p-6 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-4 relative group shadow-lg flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2.5 py-0.5 bg-[#00E1C5]/20 text-[#00E1C5] text-[9px] font-black uppercase rounded-lg border border-[#00E1C5]/30">
                                  APP: {report.appName || project.name || 'AutomatiQA App'}
                                </span>
                                <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[9px] font-bold rounded-lg flex items-center gap-1 border border-slate-700">
                                  <Folder size={10} className="text-[#00E1C5]" />
                                  {assignedFolder ? assignedFolder.name : 'Root Folder'}
                                </span>
                              </div>
                              <button 
                                onClick={() => executeDeleteItem('report', report.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                                title="Delete Report"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            <div>
                              <h4 className="text-xs font-black text-white truncate">{report.name}</h4>
                              <p className="text-[10px] font-bold text-slate-400 mt-1">
                                Saved on {new Date(report.timestamp).toLocaleDateString()} at {new Date(report.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>

                            {/* Folder Reassign Dropdown */}
                            <div className="flex items-center justify-between bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Folder:</span>
                              <select
                                value={report.folderId || ''}
                                onChange={(e) => handleReassignFolder('report', report.id, e.target.value)}
                                className="bg-slate-900 text-[#00E1C5] text-[9px] font-bold rounded-lg px-2 py-1 outline-none border border-slate-700 max-w-[160px]"
                              >
                                <option value="">📁 Root / No Folder</option>
                                {folders.map(f => (
                                  <option key={f.id} value={f.id}>📁 {f.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Saved Inputs Summary */}
                            <div className="p-3 bg-slate-800/50 rounded-xl space-y-2">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">SAVED ORIGINAL INPUTS:</span>
                              {(() => {
                                const savedImage = getSavedInputImage(report);
                                const totalScreenshots = (report.screenshots || []).filter(Boolean).length || (savedImage ? 1 : 0);

                                return (
                                  <>
                                    <div className="flex flex-wrap gap-1.5 text-[9px] font-bold">
                                      {totalScreenshots > 0 && (
                                        <span className="px-2 py-0.5 bg-slate-700 text-slate-200 rounded-md">
                                          {totalScreenshots} Screenshot{totalScreenshots > 1 ? 's' : ''}
                                        </span>
                                      )}
                                      {report.appUrl && (
                                        <span className="px-2 py-0.5 bg-teal-950 text-teal-300 rounded-md truncate max-w-[150px]" title={report.appUrl}>
                                          URL: {report.appUrl}
                                        </span>
                                      )}
                                      {report.docs && report.docs.length > 0 && (
                                        <span className="px-2 py-0.5 bg-slate-700 text-slate-200 rounded-md">
                                          {report.docs.length} Doc{report.docs.length > 1 ? 's' : ''}
                                        </span>
                                      )}
                                      {report.videos && report.videos.length > 0 && (
                                        <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 rounded-md">
                                          {report.videos.length} Video{report.videos.length > 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </div>

                                    {/* View Input Screenshots / Videos / Specs */}
                                    <div className="space-y-1">
                                      {report.videos && report.videos.length > 0 && (
                                        <button
                                          onClick={() => handlePlayVideo(report.videos![0])}
                                          className="w-full py-1 text-[9px] font-bold text-indigo-300 hover:text-white bg-indigo-950/60 hover:bg-indigo-900/80 rounded-lg flex items-center justify-center gap-1 border border-indigo-800/40 transition-colors"
                                        >
                                          <Play size={10} /> Play Input Video ({report.videos[0].name})
                                        </button>
                                      )}
                                      {savedImage && (
                                        <button
                                          onClick={() => {
                                            setPreviewModal({
                                              isOpen: true,
                                              type: 'image',
                                              title: `${report.name} - Saved Input Screenshot`,
                                              url: savedImage,
                                              targetAppUrl: report.appUrl
                                            });
                                          }}
                                          className="w-full py-1 text-[9px] font-bold text-slate-300 hover:text-white underline flex items-center justify-center gap-1"
                                        >
                                          <Eye size={10} /> View Saved Input
                                        </button>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            {/* Saved Generated Outputs Summary */}
                            <div className="p-3 bg-slate-800/30 rounded-xl space-y-1.5 border border-slate-800">
                              <span className="text-[9px] font-black text-[#00E1C5] uppercase tracking-wider block">SAVED GENERATED OUTPUTS:</span>
                              <div className="flex flex-wrap gap-1 text-[9px] font-bold">
                                <span className="px-2 py-0.5 bg-emerald-950/80 text-emerald-300 rounded-md border border-emerald-800/40">
                                  Full Analysis Report
                                </span>
                                {report.correctedReport && (
                                  <span className="px-2 py-0.5 bg-[#00E1C5]/10 text-[#00E1C5] rounded-md border border-[#00E1C5]/30">
                                    Corrected Specs
                                  </span>
                                )}
                                {report.correctedImage && (
                                  <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 rounded-md border border-indigo-800/40">
                                    Corrected UI Image
                                  </span>
                                )}
                                {report.highlightedScreenshots && report.highlightedScreenshots.length > 0 && (
                                  <span className="px-2 py-0.5 bg-teal-950 text-teal-300 rounded-md">
                                    {report.highlightedScreenshots.length} Contrast Audits
                                  </span>
                                )}
                                {report.visualDefectsScreenshots && report.visualDefectsScreenshots.length > 0 && (
                                  <span className="px-2 py-0.5 bg-rose-950 text-rose-300 rounded-md">
                                    {report.visualDefectsScreenshots.length} Defect Shots
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons for Saved Report */}
                          <div className="flex flex-col gap-2 pt-3 border-t border-slate-800">
                            <button 
                              onClick={() => handleOpenRepoItem('report', report)}
                              className="w-full py-2 bg-[#00E1C5] text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-[#00CBB2] transition-all flex items-center justify-center gap-1.5 shadow"
                            >
                              <Eye size={12} /> Open & View Full Report
                            </button>

                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                onClick={() => downloadDocx(report.report, `${report.name.replace(/\s+/g, '_')}_Report.docx`)}
                                className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                              >
                                <FileText size={11} /> REPORT (.DOCX)
                              </button>

                              <button
                                onClick={() => downloadDocx(generateMatchedDefectsReport(report.report, report.name), `${report.name.replace(/\s+/g, '_')}_defects_report.docx`)}
                                className="py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                              >
                                <Sliders size={11} /> DEFECTS (.DOCX)
                              </button>
                              
                              {report.correctedReport && (
                                <button
                                  onClick={() => downloadDocx(report.correctedReport!, `${report.name.replace(/\s+/g, '_')}_Corrected_Report.docx`)}
                                  className="py-1.5 bg-slate-800 hover:bg-slate-700 text-[#00E1C5] rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                                >
                                  <FileText size={11} /> CORRECTED (.DOCX)
                                </button>
                              )}

                              {report.correctedImage && (
                                <button
                                  onClick={() => downloadDataUrl(report.correctedImage!, `${report.name.replace(/\s+/g, '_')}_defects_corrected.png`)}
                                  className="py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1"
                                >
                                  <Palette size={11} /> Image (.PNG)
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Section 2: FIGMA DESIGN REVIEW */}
          {repoCategoryTab === 'FIGMA DESIGN REVIEW' && (
            <div className="space-y-4">
              {(() => {
                const filtered = savedFigmaReviews
                  .filter(f => selectedFolderId === '' ? true : selectedFolderId === 'root' ? !f.folderId : f.folderId === selectedFolderId)
                  .filter(f => !repoSearchQuery.trim() || f.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) || (f.figmaUrl && f.figmaUrl.toLowerCase().includes(repoSearchQuery.toLowerCase())) || (f.appName && f.appName.toLowerCase().includes(repoSearchQuery.toLowerCase())));

                if (filtered.length === 0) {
                  return (
                    <div className="p-12 text-center border-2 border-dashed border-amber-200 rounded-2xl bg-amber-50/30">
                      <Layout size={32} className="mx-auto text-amber-400 mb-3" />
                      <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider">No Figma Design Reviews in this folder view</h4>
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mt-1">
                        {repoSearchQuery ? `No reviews matching "${repoSearchQuery}"` : 'Audit Figma designs in the "FIGMA DESIGN REVIEW" tab and save your results'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map(review => {
                      const assignedFolder = folders.find(f => f.id === review.folderId);
                      return (
                        <div key={review.id} className="p-6 bg-amber-50/60 rounded-2xl border border-amber-200 space-y-4 relative group shadow-sm flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-amber-200/60 pb-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 text-[9px] font-black uppercase rounded-lg border border-amber-300">
                                  APP: {review.appName || project.name || 'AutomatiQA App'}
                                </span>
                                <span className="px-2 py-0.5 bg-amber-100/80 text-amber-900 text-[9px] font-bold rounded-lg flex items-center gap-1 border border-amber-200">
                                  <Folder size={10} className="text-amber-700" />
                                  {assignedFolder ? assignedFolder.name : 'Root Folder'}
                                </span>
                              </div>
                              <button 
                                onClick={() => executeDeleteItem('figma', review.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                                title="Delete Review"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            <div>
                              <h4 className="text-xs font-black text-slate-900 truncate">{review.name}</h4>
                              <p className="text-[10px] font-bold text-slate-500 mt-1">
                                Saved on {new Date(review.timestamp).toLocaleDateString()}
                              </p>
                            </div>

                            {/* Folder Reassign Dropdown */}
                            <div className="flex items-center justify-between bg-amber-100/60 p-2 rounded-xl border border-amber-200">
                              <span className="text-[9px] font-bold text-amber-900 uppercase">Folder:</span>
                              <select
                                value={review.folderId || ''}
                                onChange={(e) => handleReassignFolder('figma', review.id, e.target.value)}
                                className="bg-white text-amber-900 text-[9px] font-bold rounded-lg px-2 py-1 outline-none border border-amber-300 max-w-[160px]"
                              >
                                <option value="">📁 Root / Unassigned</option>
                                {folders.map(f => (
                                  <option key={f.id} value={f.id}>📁 {f.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Saved Inputs Summary */}
                            <div className="p-3 bg-white/80 rounded-xl space-y-2 border border-amber-200/60">
                              <span className="text-[9px] font-black text-amber-900 uppercase tracking-wider block">SAVED INPUTS & AUDITS:</span>
                              {(() => {
                                const savedImage = getSavedInputImage(review);
                                const totalScreenshots = (review.images || []).filter(Boolean).length || (savedImage ? 1 : 0);

                                return (
                                  <>
                                    <div className="flex flex-wrap gap-1 text-[9px] font-bold">
                                      {totalScreenshots > 0 && (
                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md">
                                          {totalScreenshots} Figma Screenshot{totalScreenshots > 1 ? 's' : ''}
                                        </span>
                                      )}
                                      {review.docs && review.docs.length > 0 && (
                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md">
                                          {review.docs.length} Doc{review.docs.length > 1 ? 's' : ''}
                                        </span>
                                      )}
                                      {review.figmaUrl && (
                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md truncate max-w-[150px]" title={review.figmaUrl}>
                                          URL: {review.figmaUrl}
                                        </span>
                                      )}
                                      {review.highlightedScreenshots && review.highlightedScreenshots.length > 0 && (
                                        <span className="px-2 py-0.5 bg-amber-200 text-amber-950 font-black rounded-md flex items-center gap-1">
                                          <Sparkles size={9} /> {review.highlightedScreenshots.length} Issue Shots
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex flex-col gap-1 pt-1">
                                      {savedImage && (
                                        <button
                                          onClick={() => setPreviewModal({
                                            isOpen: true,
                                            type: 'image',
                                            title: `${review.name} - Figma Screenshot`,
                                            url: savedImage,
                                            targetAppUrl: review.figmaUrl
                                          })}
                                          className="w-full py-0.5 text-[9px] font-bold text-amber-800 hover:text-amber-950 underline flex items-center justify-center gap-1"
                                        >
                                          <Eye size={10} /> View Saved Input
                                        </button>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 pt-3 border-t border-amber-200/60">
                            <button 
                              onClick={() => handleOpenRepoItem('figma', review)}
                              className="w-full py-2 bg-amber-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-amber-600 transition-all flex items-center justify-center gap-1.5 shadow"
                            >
                              <Eye size={12} /> Open & View Review
                            </button>

                            <div className="flex gap-1.5">
                              <button
                                onClick={() => downloadDocx(review.analysisReport, `${review.name.replace(/\s+/g, '_')}_Figma_Review.docx`)}
                                className="flex-1 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-amber-100 transition-all flex items-center justify-center gap-1"
                              >
                                <FileText size={11} /> REPORT (.DOCX)
                              </button>

                              {review.correctedReport && (
                                <button
                                  onClick={() => downloadDocx(review.correctedReport!, `${review.name.replace(/\s+/g, '_')}_Corrected_Figma_Review.docx`)}
                                  className="flex-1 py-1.5 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-amber-200 transition-all flex items-center justify-center gap-1"
                                >
                                  <FileText size={11} /> CORRECTED (.DOCX)
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Section 3: FIGMA VS COMPARISON */}
          {repoCategoryTab === 'FIGMA VS COMPARISON' && (
            <div className="space-y-4">
              {(() => {
                const filtered = savedComparisonReports
                  .filter(c => selectedFolderId === '' ? true : selectedFolderId === 'root' ? !c.folderId : c.folderId === selectedFolderId)
                  .filter(c => !repoSearchQuery.trim() || c.name.toLowerCase().includes(repoSearchQuery.toLowerCase()) || (c.appUrl && c.appUrl.toLowerCase().includes(repoSearchQuery.toLowerCase())) || (c.figmaUrl && c.figmaUrl.toLowerCase().includes(repoSearchQuery.toLowerCase())) || (c.appName && c.appName.toLowerCase().includes(repoSearchQuery.toLowerCase())));

                if (filtered.length === 0) {
                  return (
                    <div className="p-12 text-center border-2 border-dashed border-indigo-200 rounded-2xl bg-indigo-50/30">
                      <ArrowRightLeft size={32} className="mx-auto text-indigo-400 mb-3" />
                      <h4 className="text-xs font-black text-indigo-900 uppercase tracking-wider">No Figma vs App UI Comparisons in this folder view</h4>
                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mt-1">
                        {repoSearchQuery ? `No comparisons matching "${repoSearchQuery}"` : 'Compare Figma vs App UI in the "FIGMA VS APP UI COMPARISON" tab and save your audit'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map(comp => {
                      const assignedFolder = folders.find(f => f.id === comp.folderId);
                      return (
                        <div key={comp.id} className="p-6 bg-indigo-50/60 rounded-2xl border border-indigo-200 space-y-4 relative group shadow-sm flex flex-col justify-between">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-indigo-200/60 pb-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-900 text-[9px] font-black uppercase rounded-lg border border-indigo-300">
                                  APP: {comp.appName || project.name || 'AutomatiQA App'}
                                </span>
                                <span className="px-2 py-0.5 bg-indigo-100/80 text-indigo-900 text-[9px] font-bold rounded-lg flex items-center gap-1 border border-indigo-200">
                                  <Folder size={10} className="text-indigo-700" />
                                  {assignedFolder ? assignedFolder.name : 'Root Folder'}
                                </span>
                              </div>
                              <button 
                                onClick={() => executeDeleteItem('comparison', comp.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                                title="Delete Comparison"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>

                            <div>
                              <h4 className="text-xs font-black text-slate-900 truncate">{comp.name}</h4>
                              <p className="text-[10px] font-bold text-slate-500 mt-1">
                                Saved on {new Date(comp.timestamp).toLocaleDateString()}
                              </p>
                            </div>

                            {/* Folder Reassign Dropdown */}
                            <div className="flex items-center justify-between bg-indigo-100/60 p-2 rounded-xl border border-indigo-200">
                              <span className="text-[9px] font-bold text-indigo-900 uppercase">Folder:</span>
                              <select
                                value={comp.folderId || ''}
                                onChange={(e) => handleReassignFolder('comparison', comp.id, e.target.value)}
                                className="bg-white text-indigo-900 text-[9px] font-bold rounded-lg px-2 py-1 outline-none border border-indigo-300 max-w-[160px]"
                              >
                                <option value="">📁 Root / Unassigned</option>
                                {folders.map(f => (
                                  <option key={f.id} value={f.id}>📁 {f.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Saved Comparison Inputs Summary */}
                            <div className="p-3 bg-white/80 rounded-xl space-y-2 border border-indigo-200/60">
                              <span className="text-[9px] font-black text-indigo-900 uppercase tracking-wider block">SAVED INPUTS & AUDITS:</span>
                              {(() => {
                                const savedImage = getSavedInputImage(comp);
                                const validAppScreens = (comp.appScreenshots || []).filter(Boolean);
                                const validFigmaScreens = (comp.figmaImages || []).filter(Boolean);

                                return (
                                  <>
                                    <div className="flex flex-wrap gap-1 text-[9px] font-bold">
                                      {validAppScreens.length > 0 && (
                                        <span className="px-2 py-0.5 bg-teal-100 text-teal-900 rounded-md">
                                          {validAppScreens.length} App Screen{validAppScreens.length > 1 ? 's' : ''}
                                        </span>
                                      )}
                                      {validFigmaScreens.length > 0 && (
                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded-md">
                                          {validFigmaScreens.length} Figma Screen{validFigmaScreens.length > 1 ? 's' : ''}
                                        </span>
                                      )}
                                      {comp.appVideos && comp.appVideos.length > 0 && (
                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-900 rounded-md">
                                          {comp.appVideos.length} Video{comp.appVideos.length > 1 ? 's' : ''}
                                        </span>
                                      )}
                                      {comp.highlightedScreenshots && comp.highlightedScreenshots.length > 0 && (
                                        <span className="px-2 py-0.5 bg-rose-100 text-rose-900 font-black rounded-md flex items-center gap-1">
                                          <Sparkles size={9} className="text-rose-600" /> {comp.highlightedScreenshots.length} Discrepancy Shots
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex flex-col gap-1 pt-1">
                                      {comp.appVideos && comp.appVideos.length > 0 && (
                                        <button
                                          onClick={() => handlePlayVideo(comp.appVideos![0])}
                                          className="w-full py-1 text-[9px] font-bold text-indigo-900 hover:text-white bg-indigo-200/80 hover:bg-indigo-600 rounded-lg flex items-center justify-center gap-1 border border-indigo-300 transition-colors shadow-xs"
                                        >
                                          <Play size={10} /> Play Input Video ({comp.appVideos[0].name})
                                        </button>
                                      )}
                                      {savedImage && (
                                        <button
                                          onClick={() => setPreviewModal({ 
                                            isOpen: true, 
                                            type: 'image', 
                                            title: `${comp.name} - Comparison Baseline Screenshot`, 
                                            url: savedImage,
                                            targetAppUrl: comp.appUrl || comp.figmaUrl
                                          })}
                                          className="w-full py-0.5 text-[9px] font-bold text-indigo-800 hover:text-indigo-950 underline flex items-center justify-center gap-1"
                                        >
                                          <Eye size={10} /> View Saved Input
                                        </button>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 pt-3 border-t border-indigo-200/60">
                            <button 
                              onClick={() => handleOpenRepoItem('comparison', comp)}
                              className="w-full py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5 shadow"
                            >
                              <Eye size={12} /> Open & View Comparison
                            </button>

                            <div className="flex gap-1.5">
                              <button
                                onClick={() => downloadDocx(comp.comparisonReport, `${comp.name.replace(/\s+/g, '_')}_Comparison.docx`)}
                                className="flex-1 py-1.5 bg-white border border-indigo-300 text-indigo-800 rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-indigo-100 transition-all flex items-center justify-center gap-1"
                              >
                                <FileText size={11} /> REPORT (.DOCX)
                              </button>

                              {comp.resolutionGuide && (
                                <button
                                  onClick={() => downloadDocx(comp.resolutionGuide!, `${comp.name.replace(/\s+/g, '_')}_Resolution_Guide.docx`)}
                                  className="flex-1 py-1.5 bg-indigo-100 border border-indigo-300 text-indigo-900 rounded-lg text-[9px] font-bold uppercase tracking-wider hover:bg-indigo-200 transition-all flex items-center justify-center gap-1"
                                >
                                  <FileText size={11} /> GUIDE (.DOCX)
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* IN-PLACE FOLDER ANALYSIS REPORT MODAL */}
      {selectedRepoItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-slate-900 text-white rounded-[2rem] max-w-5xl w-full p-6 shadow-2xl border border-slate-800 relative flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-[#00E1C5]/10 text-[#00E1C5] rounded-2xl border border-[#00E1C5]/20">
                  <FileText size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 bg-[#00E1C5]/20 text-[#00E1C5] text-[9px] font-black uppercase rounded-md border border-[#00E1C5]/30">
                      {selectedRepoItem.type === 'report' ? 'APP UI REVIEW REPORT' : selectedRepoItem.type === 'figma' ? 'FIGMA DESIGN REVIEW' : 'FIGMA VS APP COMPARISON'}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      APP: {selectedRepoItem.item.appName || project.name || 'AutomatiQA App'}
                    </span>
                    {(() => {
                      const itemFolder = folders.find(f => f.id === selectedRepoItem.item.folderId);
                      return (
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[9px] font-bold rounded-md border border-slate-700 flex items-center gap-1">
                          <Folder size={10} className="text-[#00E1C5]" />
                          {itemFolder ? itemFolder.name : 'Root Folder'}
                        </span>
                      );
                    })()}
                  </div>
                  {isEditingRepoItem ? (
                    <div className="mt-1">
                      <input
                        type="text"
                        value={editedItemName}
                        onChange={(e) => setEditedItemName(e.target.value)}
                        placeholder="Report or Review Title..."
                        className="w-full bg-slate-950 border border-[#00E1C5]/50 text-white font-bold text-sm px-3 py-1.5 rounded-xl outline-none focus:ring-2 focus:ring-[#00E1C5]"
                      />
                    </div>
                  ) : (
                    <h3 className="text-base font-black text-white uppercase tracking-tight mt-1">
                      {selectedRepoItem.item.name}
                    </h3>
                  )}
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Saved on {new Date(selectedRepoItem.item.timestamp).toLocaleDateString()} at {new Date(selectedRepoItem.item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {isEditingRepoItem ? (
                  <>
                    <button
                      onClick={handleCommitRepoItemEdit}
                      className="px-3.5 py-1.5 bg-[#00E1C5] hover:bg-[#00CBB2] text-slate-950 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md"
                    >
                      <Save size={13} /> Commit Changes
                    </button>
                    <button
                      onClick={() => setIsEditingRepoItem(false)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all border border-slate-700"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditingRepoItem(true)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-[#00E1C5] rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-[#00E1C5]/30 hover:border-[#00E1C5]"
                    >
                      <Edit size={13} /> Edit Report
                    </button>
                    <button
                      onClick={() => handleLoadRepoItemIntoWorkspace(selectedRepoItem.type, selectedRepoItem.item)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <RotateCcw size={13} /> Load to Workbench
                    </button>
                    <button
                      onClick={() => {
                        const content = selectedRepoItem.type === 'report' ? selectedRepoItem.item.report : selectedRepoItem.type === 'figma' ? selectedRepoItem.item.analysisReport : selectedRepoItem.item.comparisonReport;
                        downloadDocx(content, `${selectedRepoItem.item.name.replace(/\s+/g, '_')}_Report.docx`);
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-slate-700"
                    >
                      <Download size={13} /> Export .DOCX
                    </button>
                  </>
                )}
                <button 
                  onClick={() => setSelectedRepoItem(null)}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-400 hover:text-white transition-colors border border-slate-700"
                  title="Close & Return to Folder"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Sub-Navigation */}
            <div className="flex items-center gap-2 pb-4 border-b border-slate-800 mb-4">
              <button
                onClick={() => setRepoModalTab('all')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  repoModalTab === 'all'
                    ? 'bg-[#00E1C5] text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                ✨ Complete Analysis & Assets
              </button>

              <button
                onClick={() => setRepoModalTab('outputs')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  repoModalTab === 'outputs'
                    ? 'bg-[#00E1C5] text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                📊 Generated Outputs & Fixes
              </button>

              <button
                onClick={() => setRepoModalTab('inputs')}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  repoModalTab === 'inputs'
                    ? 'bg-[#00E1C5] text-slate-950 shadow-sm'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                📥 Original Input Assets
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
              
              {/* Target / Figma URLs if present */}
              {(selectedRepoItem.item.appUrl || selectedRepoItem.item.figmaUrl) && (
                <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-[#00E1C5]" />
                    <span className="text-[11px] font-bold text-slate-300">
                      {selectedRepoItem.item.appUrl ? `Target URL: ${selectedRepoItem.item.appUrl}` : `Figma URL: ${selectedRepoItem.item.figmaUrl}`}
                    </span>
                  </div>
                  <a
                    href={selectedRepoItem.item.appUrl || selectedRepoItem.item.figmaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-[#00E1C5] rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                  >
                    <Link2 size={12} /> Open Target Link
                  </a>
                </div>
              )}

              {/* GENERATED OUTPUTS SECTION */}
              {(repoModalTab === 'all' || repoModalTab === 'outputs') && (
                <div className="space-y-6">
                  {/* Primary Markdown Report */}
                  <div className="p-6 bg-slate-950/90 rounded-2xl border border-slate-800 shadow-inner space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <h4 className="text-xs font-black text-[#00E1C5] uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={15} /> Primary Analysis Report {isEditingRepoItem && '(Editing Markdown)'}
                      </h4>
                      {!isEditingRepoItem && (
                        <button
                          onClick={() => {
                            const content = selectedRepoItem.type === 'report' ? selectedRepoItem.item.report : selectedRepoItem.type === 'figma' ? selectedRepoItem.item.analysisReport : selectedRepoItem.item.comparisonReport;
                            downloadDocx(content, `${selectedRepoItem.item.name.replace(/\s+/g, '_')}_Report.docx`);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[9px] font-bold uppercase flex items-center gap-1"
                        >
                          <Download size={11} /> Download Report (.DOCX)
                        </button>
                      )}
                    </div>
                    {isEditingRepoItem ? (
                      <textarea
                        value={editedItemContent}
                        onChange={(e) => setEditedItemContent(e.target.value)}
                        rows={16}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs p-4 rounded-xl outline-none focus:ring-2 focus:ring-[#00E1C5] leading-relaxed resize-y"
                        placeholder="Enter modified report content in Markdown..."
                      />
                    ) : (
                      <div className="markdown-dark text-slate-200 text-sm leading-relaxed overflow-x-auto">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {selectedRepoItem.type === 'report' ? selectedRepoItem.item.report : selectedRepoItem.type === 'figma' ? selectedRepoItem.item.analysisReport : selectedRepoItem.item.comparisonReport}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* Corrected Report / Specs if present or when editing */}
                  {(selectedRepoItem.item.correctedReport || selectedRepoItem.item.resolutionGuide || isEditingRepoItem) && (
                    <div className="p-6 bg-slate-950/90 rounded-2xl border border-[#00E1C5]/30 space-y-3 shadow-inner">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={16} className="text-[#00E1C5]" />
                          <h4 className="text-xs font-black text-[#00E1C5] uppercase tracking-wider">
                            {selectedRepoItem.item.correctedReport || selectedRepoItem.type !== 'comparison' ? 'Corrected UI & System Specifications' : 'Resolution & Remediation Guide'} {isEditingRepoItem && '(Optional)'}
                          </h4>
                        </div>
                        {!isEditingRepoItem && (selectedRepoItem.item.correctedReport || selectedRepoItem.item.resolutionGuide) && (
                          <button
                            onClick={() => {
                              const content = selectedRepoItem.item.correctedReport || selectedRepoItem.item.resolutionGuide;
                              downloadDocx(content, `${selectedRepoItem.item.name.replace(/\s+/g, '_')}_Corrected_Specs.docx`);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-[#00E1C5] rounded-lg text-[9px] font-bold uppercase flex items-center gap-1"
                          >
                            <Download size={11} /> Download Specs (.DOCX)
                          </button>
                        )}
                      </div>
                      {isEditingRepoItem ? (
                        <textarea
                          value={editedItemCorrected}
                          onChange={(e) => setEditedItemCorrected(e.target.value)}
                          rows={8}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs p-4 rounded-xl outline-none focus:ring-2 focus:ring-[#00E1C5] leading-relaxed resize-y"
                          placeholder="Enter modified corrected UI specifications / resolution guide..."
                        />
                      ) : (
                        <div className="markdown-dark text-slate-200 text-sm leading-relaxed overflow-x-auto">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {selectedRepoItem.item.correctedReport || selectedRepoItem.item.resolutionGuide}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Corrected UI Mockup Image if present */}
                  {selectedRepoItem.item.correctedImage && selectedRepoItem.item.correctedImage.trim().length > 0 && (
                    <div className="p-6 bg-slate-950/80 rounded-2xl border border-indigo-500/30 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <Palette size={16} className="text-indigo-400" />
                          <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider">Generated Corrected UI Screenshot</h4>
                        </div>
                        <button
                          onClick={() => downloadDataUrl(selectedRepoItem.item.correctedImage!, `${selectedRepoItem.item.name.replace(/\s+/g, '_')}_Corrected_UI.png`)}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1"
                        >
                          <Download size={11} /> Download .PNG
                        </button>
                      </div>
                      <div className="flex justify-center p-2 bg-slate-900 rounded-xl border border-slate-800">
                        <ScreenshotImage 
                          src={selectedRepoItem.item.correctedImage} 
                          alt="Corrected UI" 
                          className="max-h-[500px] object-contain rounded-lg shadow-2xl" 
                          containerClassName="max-h-[500px] relative rounded-lg flex items-center justify-center"
                          objectFit="contain"
                          onClick={() => setPreviewModal({ 
                            isOpen: true, 
                            type: 'image', 
                            title: `${selectedRepoItem.item.name} - Corrected UI`, 
                            url: selectedRepoItem.item.correctedImage,
                            targetAppUrl: selectedRepoItem.item.appUrl || selectedRepoItem.item.figmaUrl
                          })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Multiple Corrected Screenshots if present */}
                  {selectedRepoItem.item.correctedScreenshots && selectedRepoItem.item.correctedScreenshots.length > 0 && (
                    <div className="p-6 bg-slate-950/80 rounded-2xl border border-indigo-500/30 space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <Palette size={16} className="text-indigo-400" />
                          <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider">
                            Generated Corrected UI Mockups ({selectedRepoItem.item.correctedScreenshots.length})
                          </h4>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {selectedRepoItem.item.correctedScreenshots.map((cs: any, idx: number) => (
                          <div key={cs.id || idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-200">{cs.pageTitle || `Screen ${idx + 1}`}</span>
                              <button
                                onClick={() => downloadDataUrl(cs.correctedImage, `${(cs.pageTitle || 'screen').replace(/\s+/g, '_')}_corrected.png`)}
                                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[9px] font-black uppercase flex items-center gap-1"
                              >
                                <Download size={10} /> Download .PNG
                              </button>
                            </div>
                            <div className="flex justify-center p-2 bg-slate-950 rounded-lg">
                              <ScreenshotImage 
                                src={cs.correctedImage} 
                                alt={cs.pageTitle || `Screen ${idx + 1}`} 
                                className="max-h-[300px] object-contain rounded"
                                containerClassName="max-h-[300px] relative rounded flex items-center justify-center"
                                objectFit="contain"
                                onClick={() => setPreviewModal({ 
                                  isOpen: true, 
                                  type: 'image', 
                                  title: cs.pageTitle || `Screen ${idx + 1}`, 
                                  url: cs.correctedImage,
                                  targetAppUrl: selectedRepoItem.item.appUrl || selectedRepoItem.item.figmaUrl
                                })}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Highlighted Issues Screenshots if present */}
                  {(() => {
                    const validHighlighted = (
                      selectedRepoItem.item.highlightedScreenshots ||
                      selectedRepoItem.item.figmaHighlightedScreenshots ||
                      selectedRepoItem.item.compHighlightedScreenshots ||
                      []
                    ).filter((h: string) => h && typeof h === 'string' && h.trim().length > 0);
                    if (validHighlighted.length === 0) return null;
                    return (
                      <div className="p-4 bg-slate-950/60 rounded-2xl border border-teal-500/30 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-[10px] font-black text-[#00E1C5] uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles size={14} /> CHECK COLOR CONTRAST & ACCESSIBILITY AUDIT SCREENSHOTS ({validHighlighted.length}):
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-4">
                          {validHighlighted.map((hUrl: string, idx: number) => (
                            <div key={idx} className="relative group rounded-xl overflow-hidden border border-teal-500/40 w-44 h-32 bg-slate-900 shadow-md">
                              <ScreenshotImage 
                                src={hUrl} 
                                alt={`CHECK COLOR CONTRAST IN UI ${idx + 1}`} 
                                className="w-full h-full object-cover" 
                                containerClassName="w-full h-full relative"
                              />
                              <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2">
                                <button
                                  onClick={() => setPreviewModal({ 
                                    isOpen: true, 
                                    type: 'image', 
                                    title: `Contrast Audit ${idx + 1}`, 
                                    url: hUrl,
                                    targetAppUrl: selectedRepoItem.item.appUrl || selectedRepoItem.item.figmaUrl 
                                  })}
                                  className="px-2.5 py-1 bg-[#00E1C5] text-slate-950 text-[9px] font-black uppercase rounded-lg flex items-center gap-1"
                                >
                                  <Eye size={12} /> View Full
                                </button>
                                <button
                                  onClick={() => downloadDataUrl(hUrl, `contrast_audit_${idx + 1}.png`)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-bold uppercase rounded-lg flex items-center gap-1"
                                >
                                  <Download size={11} /> Download
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Visual Defects Audit Screenshots if present */}
                  {(() => {
                    const validVisualDefects = (
                      selectedRepoItem.item.visualDefectsScreenshots ||
                      selectedRepoItem.item.figmaVisualDefectsScreenshots ||
                      selectedRepoItem.item.compVisualDefectsScreenshots ||
                      []
                    ).filter((v: string) => v && typeof v === 'string' && v.trim().length > 0);
                    if (validVisualDefects.length === 0) return null;
                    return (
                      <div className="p-4 bg-slate-950/60 rounded-2xl border border-indigo-500/30 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Sliders size={14} /> DEFECTS & DISCREPANCY AUDIT SCREENSHOTS ({validVisualDefects.length}):
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-4">
                          {validVisualDefects.map((vUrl: string, idx: number) => (
                            <div key={idx} className="relative group rounded-xl overflow-hidden border border-indigo-500/40 w-44 h-32 bg-slate-900 shadow-md">
                              <ScreenshotImage 
                                src={vUrl} 
                                alt={`defects ${idx + 1}`} 
                                className="w-full h-full object-cover" 
                                containerClassName="w-full h-full relative"
                              />
                              <div className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2">
                                <button
                                  onClick={() => setPreviewModal({ 
                                    isOpen: true, 
                                    type: 'image', 
                                    title: `Defect Shot ${idx + 1}`, 
                                    url: vUrl,
                                    targetAppUrl: selectedRepoItem.item.appUrl || selectedRepoItem.item.figmaUrl 
                                  })}
                                  className="px-2.5 py-1 bg-indigo-500 text-white text-[9px] font-black uppercase rounded-lg flex items-center gap-1"
                                >
                                  <Eye size={12} /> View Full
                                </button>
                                <button
                                  onClick={() => downloadDataUrl(vUrl, `defect_audit_${idx + 1}.png`)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-bold uppercase rounded-lg flex items-center gap-1"
                                >
                                  <Download size={11} /> Download
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ORIGINAL INPUTS SECTION */}
              {(repoModalTab === 'all' || repoModalTab === 'inputs') && (
                <div className="space-y-6 pt-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                    <Upload size={16} className="text-[#00E1C5]" />
                    <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider">
                      Original Input Assets & Source Materials
                    </h4>
                  </div>

                  {/* Saved Input Videos if present */}
                  {(selectedRepoItem.item.videos || selectedRepoItem.item.appVideos) && (selectedRepoItem.item.videos?.length > 0 || selectedRepoItem.item.appVideos?.length > 0) && (
                    <div className="p-4 bg-slate-950/60 rounded-2xl border border-indigo-500/30 space-y-3">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">
                        SAVED INPUT VIDEOS & KEYFRAMES ({(selectedRepoItem.item.videos || selectedRepoItem.item.appVideos).length}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {(selectedRepoItem.item.videos || selectedRepoItem.item.appVideos).map((vid: any, idx: number) => (
                          <div key={vid.id || idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white truncate max-w-[140px]">{vid.name}</span>
                              <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 text-[9px] font-bold rounded-md">
                                {vid.frames?.length || 0} Keyframes
                              </span>
                            </div>
                            {vid.frames?.[0]?.image && (
                              <div className="w-full h-24 rounded-lg border border-slate-800 overflow-hidden relative">
                                <ScreenshotImage 
                                  src={vid.frames[0].image} 
                                  alt="Video Keyframe" 
                                  className="w-full h-full object-cover" 
                                  containerClassName="w-full h-full relative"
                                />
                              </div>
                            )}
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => handlePlayVideo(vid)}
                                className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[9px] font-bold uppercase flex items-center justify-center gap-1"
                              >
                                <Play size={12} /> Play Video & Walkthrough
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Saved Input Documents if present */}
                  {(selectedRepoItem.item.docs || selectedRepoItem.item.figmaDocs) && (selectedRepoItem.item.docs?.length > 0 || selectedRepoItem.item.figmaDocs?.length > 0) && (
                    <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 space-y-3">
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">
                        SAVED INPUT DOCUMENTS ({(selectedRepoItem.item.docs || selectedRepoItem.item.figmaDocs).length}):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(selectedRepoItem.item.docs || selectedRepoItem.item.figmaDocs).map((doc: any, idx: number) => (
                          <div key={idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-200 truncate max-w-[180px]">{doc.name}</span>
                              <button
                                onClick={() => downloadFile(doc.content, `${doc.name.replace(/\s+/g, '_')}`, 'text/plain')}
                                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-[9px] font-bold uppercase flex items-center gap-1"
                              >
                                <Download size={10} /> Download
                              </button>
                            </div>
                            <div className="p-2 bg-slate-950 rounded-lg text-[10px] text-slate-400 font-mono max-h-24 overflow-y-auto leading-relaxed border border-slate-800/80">
                              {doc.content.slice(0, 300)}...
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Saved Screenshots / Inputs Previews */}
                  {(() => {
                    const rawCandidates = [
                      ...(selectedRepoItem.item.screenshots || []),
                      ...(selectedRepoItem.item.images || []),
                      ...(selectedRepoItem.item.appScreenshots || []),
                      ...(selectedRepoItem.item.figmaImages || []),
                    ];

                    const savedScreenshots = rawCandidates
                      .map(s => typeof s === 'object' ? (s.data || s.dataUrl || s.originalImage || s.image || s.url || s.downloadURL || s) : s)
                      .filter((s: any) => s && typeof s === 'string' && s.trim().length > 0);

                    if (savedScreenshots.length === 0) {
                      const fallbackImg = getSavedInputImage(selectedRepoItem.item);
                      if (fallbackImg) savedScreenshots.push(fallbackImg);
                    }

                    if (savedScreenshots.length === 0) return null;

                    return (
                      <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800 space-y-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                          SAVED ATTACHED SCREENSHOTS & BASELINE IMAGES ({savedScreenshots.length}):
                        </span>
                        <div className="flex flex-wrap gap-3">
                          {savedScreenshots.map((s: string, idx: number) => (
                            <div key={`screenshot-${idx}`} className="relative group rounded-xl overflow-hidden border border-slate-800 w-28 h-28 bg-slate-900">
                              <ScreenshotImage 
                                src={s} 
                                alt={`Saved input ${idx + 1}`} 
                                className="w-full h-full object-cover" 
                                containerClassName="w-full h-full relative"
                              />
                              <button
                                onClick={() => setPreviewModal({ 
                                  isOpen: true, 
                                  type: 'image', 
                                  title: `Saved Screenshot ${idx + 1}`, 
                                  url: s,
                                  targetAppUrl: selectedRepoItem.item.appUrl || selectedRepoItem.item.figmaUrl 
                                })}
                                className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[9px] font-bold uppercase gap-1"
                              >
                                <Eye size={14} /> Full View
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-800 mt-4 flex items-center justify-between flex-wrap gap-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Folder Item ID: {selectedRepoItem.item.id}
              </span>
              <button
                onClick={() => setSelectedRepoItem(null)}
                className="px-6 py-2.5 bg-[#00E1C5] text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl hover:bg-[#00CBB2] transition-all shadow-lg"
              >
                Close Report & Back to Folder
              </button>
            </div>

          </div>
        </div>
      )}

      {/* PREVIEW MODAL */}
      {previewModal && previewModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-[2rem] max-w-4xl w-full p-6 shadow-2xl border border-slate-200 relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  {previewModal.type === 'image' && <Eye size={20} />}
                  {previewModal.type === 'video' && <Video size={20} />}
                  {previewModal.type === 'document' && <FileText size={20} />}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">{previewModal.title}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{previewModal.type} Preview</p>
                </div>
              </div>
              <button 
                onClick={() => setPreviewModal(null)}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 flex flex-col items-center justify-center">
              {previewModal.type === 'image' && (
                <ScreenshotPreviewModalContent
                  title={previewModal.title}
                  url={previewModal.url}
                  targetAppUrl={previewModal.targetAppUrl || selectedRepoItem?.item?.appUrl || selectedRepoItem?.item?.figmaUrl}
                  onClose={() => setPreviewModal(null)}
                />
              )}

              {previewModal.type === 'video' && (
                <VideoPlayerModalContent
                  title={previewModal.title}
                  url={previewModal.url}
                  frames={previewModal.frames || []}
                  videoBlob={previewModal.videoBlob}
                  onSelectImage={(subTitle, imgUrl) => setPreviewModal({ isOpen: true, type: 'image', title: subTitle, url: imgUrl })}
                />
              )}

              {previewModal.type === 'document' && (
                <div className="w-full p-6 bg-slate-50 rounded-2xl border border-slate-200 overflow-y-auto max-h-[65vh]">
                  <div className="prose prose-slate max-w-none text-xs leading-relaxed">
                    <ReactMarkdown>
                      {previewModal.content || 'No readable text content available.'}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE / RENAME FOLDER MODAL */}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FolderPlus size={16} className="text-indigo-600" />
                {editingFolder ? 'Rename Folder' : 'Create New Folder'}
              </h3>
              <button
                onClick={() => {
                  setIsFolderModalOpen(false);
                  setEditingFolder(null);
                  setFolderName('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Folder Name
              </label>
              <input 
                type="text" 
                value={folderName || ''}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
                autoFocus
                placeholder="Folder Name (e.g. Sprint 12 UI Audits, Auth Flow Review)"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => {
                  setIsFolderModalOpen(false);
                  setEditingFolder(null);
                  setFolderName('');
                }}
                className="px-4 py-2 text-slate-500 font-bold text-xs uppercase hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateFolder}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase shadow-md hover:bg-indigo-700 transition-all flex items-center gap-1.5"
              >
                <Check size={14} />
                {editingFolder ? 'Rename Folder' : 'Save Folder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE FOLDER AND CONTENTS CONFIRMATION MODAL */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-black text-rose-600 uppercase tracking-wider flex items-center gap-2">
                <Trash2 size={16} />
                Delete Folder & Contents
              </h3>
              <button
                onClick={() => setFolderToDelete(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 bg-rose-50/70 border border-rose-200/70 rounded-2xl text-xs text-rose-900 space-y-2">
              <p className="font-bold">
                Are you sure you want to permanently delete folder <span className="underline font-black">"{folderToDelete.name}"</span>?
              </p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                This will completely remove the selected folder and all reports, Figma reviews, comparison audits, and saved inputs inside it. This action cannot be undone.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setFolderToDelete(null)}
                className="px-4 py-2 text-slate-500 font-bold text-xs uppercase hover:bg-slate-100 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const idToDelete = folderToDelete.id;
                  setFolderToDelete(null);
                  handleDeleteFolder(idToDelete);
                }}
                className="px-5 py-2.5 bg-rose-600 text-white rounded-xl font-black text-xs uppercase shadow-md hover:bg-rose-700 transition-all flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                Delete Folder & Contents
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 20 MB Video Size Limit Alert Popup for UI Testing */}
      <VideoSizeAlertModal
        isOpen={isVideoSizeAlertOpen}
        onClose={() => setIsVideoSizeAlertOpen(false)}
        fileSizeMB={oversizedVideoMB}
        maxSizeMB={20}
      />
    </div>
  );
};

export default UITesting;
