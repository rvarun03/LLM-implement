import React, { useState, useRef } from 'react';
import { 
  FileVideo, 
  Upload, 
  Trash2, 
  RotateCcw, 
  Maximize2, 
  Play, 
  Clock, 
  Sparkles, 
  Loader2, 
  X, 
  Film,
  Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { extractVideoFrames, ExtractedVideoFrame } from '../utils/videoExtractor';
import { VideoSizeAlertModal } from './VideoSizeAlertModal';
import { uploadAndPersistVideo } from '../services/artifactStorage';

export interface VideoWalkthroughData {
  fileName: string;
  fileSize: number;
  duration: number;
  frames: ExtractedVideoFrame[];
  videoUrl?: string;
  file?: File;
  videoBlob?: Blob | File;
}

interface VideoInputUploaderProps {
  videoData: VideoWalkthroughData | null;
  onVideoChange: (data: VideoWalkthroughData | null) => void;
  onProcessingChange?: (isProcessing: boolean) => void;
  title?: string;
  description?: string;
  accentColor?: 'indigo' | 'teal';
  className?: string;
}

export const VideoInputUploader: React.FC<VideoInputUploaderProps> = ({
  videoData,
  onVideoChange,
  onProcessingChange,
  title = 'Input Video Walkthrough',
  description = 'Upload a screen recording or product walkthrough video (MP4, WebM, MOV, max 20 MB) to generate accurate test cases or scripts.',
  accentColor = 'indigo',
  className = ''
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [selectedFramePreview, setSelectedFramePreview] = useState<ExtractedVideoFrame | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [isVideoSizeAlertOpen, setIsVideoSizeAlertOpen] = useState(false);
  const [oversizedVideoMB, setOversizedVideoMB] = useState<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

  const isIndigo = accentColor === 'indigo';
  const badgeColor = isIndigo ? 'bg-indigo-600' : 'bg-teal-600';
  const lightBgColor = isIndigo ? 'bg-indigo-50/70' : 'bg-teal-50/70';
  const borderLightColor = isIndigo ? 'border-indigo-100' : 'border-teal-100';
  const textAccentColor = isIndigo ? 'text-indigo-600' : 'text-teal-600';
  const hoverBorderColor = isIndigo ? 'hover:border-indigo-400' : 'hover:border-teal-400';

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      const sizeMB = file.size / (1024 * 1024);
      setOversizedVideoMB(sizeMB);
      setIsVideoSizeAlertOpen(true);
      toast.error('Video size should not exceed 20 MB.');
      return;
    }

    setIsProcessing(true);
    onProcessingChange?.(true);
    setProcessingStatus('Starting video walkthrough analysis...');

    try {
      const result = await extractVideoFrames(file, (status) => setProcessingStatus(status));
      
      if (!result.frames || result.frames.length === 0) {
        toast.error('Could not extract frames from this video. Please verify the video format.');
        setIsProcessing(false);
        onProcessingChange?.(false);
        return;
      }

      const videoUrl = URL.createObjectURL(file);

      const baseData: VideoWalkthroughData = {
        fileName: file.name,
        fileSize: file.size,
        duration: result.duration,
        frames: result.frames,
        videoUrl,
        file,
        videoBlob: file
      };

      onVideoChange(baseData);

      // Stream & persist video to server disk /artifacts/ and IndexedDB in background
      const videoId = `walkthrough_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      uploadAndPersistVideo(videoId, file, file.name)
        .then(persisted => {
          if (persisted && persisted.url) {
            onVideoChange({
              ...baseData,
              videoUrl: persisted.url
            });
          }
        })
        .catch(upErr => {
          console.warn('[VideoInputUploader] Video background upload note:', upErr);
        });

      toast.success(`Successfully analyzed ${file.name} (${result.frames.length} keyframes extracted)`);
    } catch (err: any) {
      console.error('Video extraction error:', err);
      toast.error('Failed to process video file. Please try another video.');
    } finally {
      setIsProcessing(false);
      onProcessingChange?.(false);
      setProcessingStatus('');
    }
  };

  const handleRemove = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoData?.videoUrl) {
      try {
        URL.revokeObjectURL(videoData.videoUrl);
      } catch {}
    }
    onVideoChange(null);
    toast.info('Video walkthrough removed');
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins > 0 ? `${mins}m ` : ''}${secs}s`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
          }
          e.target.value = '';
        }}
        accept="video/*,.mp4,.webm,.mov,.mkv,.avi"
        className="hidden"
      />
      <input
        type="file"
        ref={replaceInputRef}
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
          }
          e.target.value = '';
        }}
        accept="video/*,.mp4,.webm,.mov,.mkv,.avi"
        className="hidden"
      />

      <div className="flex items-center justify-between">
        <label className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
          <FileVideo size={15} className={textAccentColor} />
          {title} <span className="text-slate-400 font-normal text-xs">(Optional)</span>
        </label>
        {videoData && (
          <span className={`px-2.5 py-0.5 text-[10px] font-black ${badgeColor} text-white rounded-full`}>
            {videoData.frames.length} Keyframes Extracted
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-400 font-medium">{description}</p>

      {/* Loading state during extraction */}
      {isProcessing && (
        <div className={`p-8 border border-dashed rounded-2xl ${lightBgColor} ${borderLightColor} flex flex-col items-center justify-center gap-3 text-center animate-pulse`}>
          <div className={`p-3.5 ${badgeColor} text-white rounded-2xl shadow-md`}>
            <Loader2 size={24} className="animate-spin" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Analyzing Video Walkthrough
            </h4>
            <p className="text-[11px] font-medium text-slate-600 mt-1">
              {processingStatus || 'Extracting high-resolution UI keyframes across the video...'}
            </p>
          </div>
        </div>
      )}

      {/* Active Video Card */}
      {!isProcessing && videoData && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`p-2.5 ${lightBgColor} ${textAccentColor} rounded-xl border ${borderLightColor} flex-shrink-0`}>
                <Film size={20} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-slate-900 truncate" title={videoData.fileName}>
                  {videoData.fileName}
                </h4>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] font-bold text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {formatDuration(videoData.duration)}
                  </span>
                  <span>•</span>
                  <span>{formatFileSize(videoData.fileSize)}</span>
                  <span>•</span>
                  <span className={textAccentColor}>{videoData.frames.length} Sequential Frames</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {videoData.videoUrl && (
                <button
                  type="button"
                  onClick={() => setShowVideoModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  title="Play Video Walkthrough"
                >
                  <Play size={12} /> Play
                </button>
              )}
              <button
                type="button"
                onClick={() => replaceInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl text-xs font-bold transition-all"
                title="Replace Video"
              >
                <RotateCcw size={12} /> Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 border border-rose-100 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition-all"
                title="Remove Video"
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          </div>

          {/* Sequential Keyframe Thumbnails Grid */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5">
                <Layers size={13} className={textAccentColor} />
                Extracted Workflow Frames ({videoData.frames.length})
              </span>
              <span className="text-[10px] text-slate-400">Click any frame to inspect</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 max-h-48 overflow-y-auto p-1.5 bg-slate-50/70 rounded-xl border border-slate-100">
              {videoData.frames.map((frame, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedFramePreview(frame)}
                  className="group/frame relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-black/5 hover:border-indigo-400 hover:shadow-md cursor-pointer transition-all"
                >
                  <img
                    src={frame.image}
                    alt={`Frame @ ${frame.timestamp}`}
                    className="w-full h-full object-cover group-hover/frame:scale-105 transition-transform"
                  />
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/75 text-white text-[9px] font-mono font-bold rounded">
                    {frame.timestamp}
                  </div>
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/frame:opacity-100 transition-opacity flex items-center justify-center">
                    <Maximize2 size={13} className="text-white" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty Dropzone */}
      {!isProcessing && !videoData && (
        <div
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileSelect(e.dataTransfer.files[0]);
            }
          }}
          className={`border-2 border-dashed border-slate-200 ${hoverBorderColor} rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col items-center justify-center cursor-pointer`}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className={`w-12 h-12 mb-2.5 rounded-2xl ${lightBgColor} ${textAccentColor} flex items-center justify-center border ${borderLightColor} shadow-sm`}>
            <FileVideo size={22} />
          </div>
          <p className="text-xs font-bold text-slate-700">
            Drag & drop your screen recording / walkthrough video here
          </p>
          <p className="text-[10px] font-bold text-slate-400 my-1.5">or click to browse</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className={`${badgeColor} hover:opacity-90 text-white px-5 py-2 rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5 mt-1`}
          >
            <Upload size={13} /> Select Video File
          </button>
          <p className="text-[10px] text-slate-400 font-medium mt-2.5">
            Supports MP4, WebM, MOV, MKV (Maximum video size: 20 MB)
          </p>
        </div>
      )}

      {/* 20 MB Video Size Limit Alert Popup */}
      <VideoSizeAlertModal
        isOpen={isVideoSizeAlertOpen}
        onClose={() => setIsVideoSizeAlertOpen(false)}
        fileSizeMB={oversizedVideoMB}
        maxSizeMB={20}
      />

      {/* Frame Fullscreen Preview Modal */}
      {selectedFramePreview && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedFramePreview(null)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Film size={16} className={textAccentColor} />
                <h3 className="text-xs font-black uppercase tracking-wider">
                  Video Frame @ {selectedFramePreview.timestamp}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFramePreview(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-black/60 overflow-auto">
              <img
                src={selectedFramePreview.image}
                alt={`Keyframe ${selectedFramePreview.timestamp}`}
                className="max-h-[70vh] max-w-full object-contain rounded-lg border border-slate-800"
              />
            </div>
          </div>
        </div>
      )}

      {/* Video Playback Modal */}
      {showVideoModal && videoData?.videoUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setShowVideoModal(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Play size={16} className={textAccentColor} />
                <h3 className="text-xs font-black uppercase tracking-wider truncate max-w-lg">
                  {videoData.fileName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVideoModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 bg-black flex items-center justify-center">
              <video
                src={videoData.videoUrl}
                controls
                autoPlay
                className="max-h-[70vh] max-w-full rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
