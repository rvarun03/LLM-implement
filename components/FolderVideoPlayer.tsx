import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Maximize2, 
  Download, 
  Film, 
  Clock, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Layers, 
  Video, 
  Eye, 
  RotateCcw,
  X,
  Volume2,
  VolumeX
} from 'lucide-react';
import { toast } from 'sonner';
import { resolveVideoPlayableUrl, getVideoBlob, isUrlPlayable } from '../services/artifactStorage';

export interface FolderVideoPlayerProps {
  folderId: string;
  folderTitle: string;
  videoUrl?: string;
  videoFileName?: string;
  videoDuration?: number;
  videoFrames?: Array<{
    timestamp?: string | number;
    image?: string;
    frameIndex?: number;
    timeSeconds?: number;
    isBlank?: boolean;
    description?: string;
  }>;
  videoSize?: number;
  onOpenFramePreview?: (
    frames: any[],
    initialIndex: number,
    title: string,
    videoFileName: string
  ) => void;
}

export const FolderVideoPlayer: React.FC<FolderVideoPlayerProps> = ({
  folderId,
  folderTitle,
  videoUrl,
  videoFileName,
  videoDuration,
  videoFrames = [],
  videoSize,
  onOpenFramePreview
}) => {
  const [playableUrl, setPlayableUrl] = useState<string>(videoUrl || '');
  const [isResolving, setIsResolving] = useState<boolean>(!videoUrl);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isTheaterOpen, setIsTheaterOpen] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(videoDuration || 0);
  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const theaterVideoRef = useRef<HTMLVideoElement | null>(null);

  // Format seconds to mm:ss
  const formatTime = (secs: number = 0): string => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Format file size
  const formatSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  // Extract poster frame from frames array
  const posterFrame = videoFrames?.find(f => f?.image && !f?.isBlank)?.image || videoFrames?.[0]?.image;

  // Resolve playable video URL across memory, server /artifacts/, and IndexedDB
  useEffect(() => {
    let isMounted = true;

    async function resolveUrl() {
      setIsResolving(true);
      setHasError(false);
      setErrorMessage('');

      try {
        const resolved = await resolveVideoPlayableUrl({
          id: folderId,
          url: videoUrl,
          videoFileName
        });

        if (!isMounted) return;

        if (resolved) {
          setPlayableUrl(resolved);
          setIsResolving(false);
          return;
        }

        // Fallback: check candidate /artifacts/ path if filename is known
        if (videoFileName) {
          const cleanName = videoFileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
          const candUrl = `/artifacts/${cleanName}`;
          setPlayableUrl(candUrl);
          setIsResolving(false);
          return;
        }

        if (videoUrl) {
          setPlayableUrl(videoUrl);
        }
      } catch (err: any) {
        console.warn('[FolderVideoPlayer] URL resolution notice:', err);
        if (isMounted) {
          if (videoUrl) setPlayableUrl(videoUrl);
        }
      } finally {
        if (isMounted) setIsResolving(false);
      }
    }

    resolveUrl();

    return () => {
      isMounted = false;
    };
  }, [folderId, videoUrl, videoFileName]);

  // Auto load media pipeline when playableUrl updates
  useEffect(() => {
    if (videoRef.current && playableUrl) {
      try {
        videoRef.current.load();
      } catch {}
    }
  }, [playableUrl]);

  // Handle video error fallback
  const handleVideoError = async () => {
    console.warn('[FolderVideoPlayer] Video failed to load from:', playableUrl);
    
    // Try to retrieve blob from IndexedDB directly
    try {
      const stored = await getVideoBlob(folderId, videoFileName);
      let blobObj: Blob | null = null;

      if (stored instanceof Blob) {
        blobObj = stored;
      } else if (typeof ArrayBuffer !== 'undefined' && ((stored as any) instanceof ArrayBuffer || (stored as any)?.buffer instanceof ArrayBuffer)) {
        const buf = (stored as any) instanceof ArrayBuffer ? stored : (stored as any).buffer;
        blobObj = new Blob([buf], { type: 'video/mp4' });
      } else if (typeof stored === 'string' && stored.startsWith('data:video/')) {
        setPlayableUrl(stored);
        setHasError(false);
        return;
      }

      if (blobObj && blobObj.size > 0) {
        const freshUrl = URL.createObjectURL(blobObj);
        setPlayableUrl(freshUrl);
        setHasError(false);
        return;
      }
    } catch (e) {
      console.warn('[FolderVideoPlayer] Blob recovery failed:', e);
    }

    // Try candidate artifacts URL if not already tried
    if (videoFileName && !playableUrl.includes('/artifacts/')) {
      const cleanName = videoFileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const candidateUrl = `/artifacts/${cleanName}`;
      const isLive = await isUrlPlayable(candidateUrl, 1200);
      if (isLive) {
        setPlayableUrl(candidateUrl);
        setHasError(false);
        return;
      }
    }

    setHasError(true);
    setErrorMessage('Video walkthrough stream unavailable. You can re-upload or view the extracted keyframes below.');
  };

  // Jump video to specific timestamp (in seconds or timestamp string)
  const seekToTimestamp = (ts: string | number | undefined) => {
    let seconds = 0;
    if (typeof ts === 'number') {
      seconds = ts;
    } else if (typeof ts === 'string') {
      const parts = ts.split(':').map(Number);
      if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
      } else if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else {
        seconds = parseFloat(ts) || 0;
      }
    }

    if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  // Download video file
  const handleDownload = async () => {
    try {
      toast.info('Preparing video download...');
      
      // If we have a playable URL, trigger download
      if (playableUrl) {
        const a = document.createElement('a');
        a.href = playableUrl;
        a.download = videoFileName || `${folderTitle.replace(/\s+/g, '_')}_walkthrough.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success('Download started');
        return;
      }

      // Check IndexedDB
      const blob = await getVideoBlob(folderId, videoFileName);
      if (blob) {
        const blobObj = blob instanceof Blob ? blob : new Blob([blob as any], { type: 'video/mp4' });
        const url = URL.createObjectURL(blobObj);
        const a = document.createElement('a');
        a.href = url;
        a.download = videoFileName || 'walkthrough_video.mp4';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        toast.success('Download started');
        return;
      }

      toast.error('Video file could not be retrieved for download.');
    } catch (err: any) {
      toast.error(`Download failed: ${err.message || 'Unknown error'}`);
    }
  };

  const displayName = videoFileName || `${folderTitle} Walkthrough Video`;

  return (
    <div className="bg-slate-900 border border-slate-800/90 rounded-2xl overflow-hidden shadow-lg mb-4 text-white transition-all">
      {/* 1. Header Bar */}
      <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center shrink-0 text-teal-400">
            <Film size={15} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-teal-400 bg-teal-950/60 border border-teal-800/60 px-2 py-0.5 rounded-md">
                Walkthrough Video
              </span>
              <h4 className="text-xs font-bold text-slate-100 truncate max-w-sm sm:max-w-md" title={displayName}>
                {displayName}
              </h4>
            </div>
          </div>
        </div>

        {/* Right Controls: Duration, Frame Count, Theater Mode, Download, Collapse */}
        <div className="flex items-center gap-2 shrink-0">
          {(duration > 0 || videoDuration) && (
            <span className="text-[11px] font-mono text-slate-400 bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-700/80 flex items-center gap-1.5">
              <Clock size={12} className="text-teal-400" />
              <span>{formatTime(duration || videoDuration || 0)}</span>
              {videoSize ? <span className="text-slate-500">• {formatSize(videoSize)}</span> : null}
            </span>
          )}

          {videoFrames.length > 0 && (
            <span className="text-[11px] font-bold text-teal-300 bg-teal-950/60 px-2.5 py-1 rounded-lg border border-teal-800/60 flex items-center gap-1.5">
              <Layers size={12} className="text-teal-400" />
              <span>{videoFrames.length} Frames</span>
            </span>
          )}

          {/* Theater Mode Button */}
          {playableUrl && !hasError && (
            <button
              type="button"
              onClick={() => setIsTheaterOpen(true)}
              className="p-1.5 text-slate-400 hover:text-teal-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Open Theater Mode Player"
            >
              <Maximize2 size={15} />
            </button>
          )}

          {/* Download Video Button */}
          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 text-slate-400 hover:text-teal-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Download Video File"
          >
            <Download size={15} />
          </button>

          {/* Collapse/Expand Player Toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title={isCollapsed ? 'Show Video Player' : 'Hide Video Player'}
          >
            {isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
        </div>
      </div>

      {/* 2. Main Player Body (Collapsible) */}
      {!isCollapsed && (
        <div className="p-3 sm:p-4 space-y-3 animate-in fade-in duration-200">
          {/* Video Player Container */}
          <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center min-h-[220px] max-h-[420px] shadow-inner">
            {hasError ? (
              <div className="p-6 text-center space-y-2.5 text-slate-400 max-w-md">
                <Video size={32} className="mx-auto text-slate-600" />
                <p className="text-xs">{errorMessage}</p>
                {posterFrame && (
                  <div className="mt-3 rounded-lg overflow-hidden border border-slate-800 max-h-40 mx-auto">
                    <img src={posterFrame} alt="Keyframe Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            ) : isResolving ? (
              <div className="p-8 flex flex-col items-center justify-center gap-2 text-slate-400">
                <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold">Loading walkthrough video...</span>
              </div>
            ) : playableUrl ? (
              <video
                key={playableUrl}
                ref={videoRef}
                src={playableUrl}
                poster={posterFrame}
                controls
                playsInline
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                onLoadedMetadata={(e) => {
                  const d = (e.target as HTMLVideoElement).duration;
                  if (d && !isNaN(d) && d > 0) setDuration(d);
                }}
                onError={handleVideoError}
                className="w-full max-h-[420px] object-contain rounded-lg"
              />
            ) : posterFrame ? (
              <div className="relative w-full h-[240px] flex items-center justify-center overflow-hidden">
                <img src={posterFrame} alt="Walkthrough Preview" className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2 text-white">
                  <Film size={28} className="text-teal-400" />
                  <span className="text-xs font-bold">Keyframe snapshot available</span>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                No video stream available
              </div>
            )}
          </div>

          {/* 3. Keyframes Timeline / Frame Strip (Interactive Seek) */}
          {videoFrames.length > 0 && (
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-bold uppercase text-[10px] tracking-wider text-slate-300">
                  <Layers size={12} className="text-teal-400" />
                  Extracted Keyframes ({videoFrames.length})
                  <span className="text-slate-500 font-normal capitalize">
                    • Click any frame to jump video
                  </span>
                </span>
                {onOpenFramePreview && (
                  <button
                    type="button"
                    onClick={() => onOpenFramePreview(videoFrames, 0, displayName, videoFileName || '')}
                    className="text-[11px] font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Eye size={12} />
                    <span>Inspect Frames</span>
                  </button>
                )}
              </div>

              {/* Scrollable Frame Thumbnails Strip */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900">
                {videoFrames.map((frame, idx) => {
                  const ts = frame.timestamp || (frame.timeSeconds !== undefined ? formatTime(frame.timeSeconds) : `Frame ${idx + 1}`);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => seekToTimestamp(frame.timeSeconds !== undefined ? frame.timeSeconds : frame.timestamp)}
                      className="group relative flex-shrink-0 w-24 h-15 rounded-lg overflow-hidden border border-slate-800 hover:border-teal-400 transition-all bg-slate-950 focus:outline-none focus:ring-1 focus:ring-teal-400 cursor-pointer"
                      title={`Jump to ${ts}`}
                    >
                      {frame.image ? (
                        <img 
                          src={frame.image} 
                          alt={`Frame ${idx + 1}`} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-600 text-[10px]">
                          Frame {idx + 1}
                        </div>
                      )}

                      {/* Timestamp Badge */}
                      <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-black/85 text-[9px] font-mono font-bold text-teal-300 rounded border border-black/40">
                        {ts}
                      </span>

                      {/* Play Hover Overlay */}
                      <div className="absolute inset-0 bg-teal-500/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play size={14} className="fill-white text-white drop-shadow-md" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Fullscreen / Theater Modal */}
      {isTheaterOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsTheaterOpen(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-700 rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5 min-w-0">
                <Film size={18} className="text-teal-400" />
                <h3 className="text-sm font-black uppercase tracking-wider truncate max-w-xl">
                  {displayName}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsTheaterOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Video View */}
            <div className="p-4 bg-black flex-1 flex items-center justify-center min-h-[360px] max-h-[70vh]">
              <video
                ref={theaterVideoRef}
                src={playableUrl}
                controls
                autoPlay
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
              />
            </div>

            {/* Frame strip inside modal */}
            {videoFrames.length > 0 && (
              <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 overflow-x-auto">
                <span className="text-[10px] font-black uppercase text-slate-400 shrink-0 mr-1">
                  Keyframes:
                </span>
                {videoFrames.map((frame, idx) => {
                  const ts = frame.timestamp || (frame.timeSeconds !== undefined ? formatTime(frame.timeSeconds) : `F${idx + 1}`);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (theaterVideoRef.current) {
                          const secs = typeof frame.timeSeconds === 'number' ? frame.timeSeconds : (parseFloat(String(frame.timestamp)) || 0);
                          theaterVideoRef.current.currentTime = secs;
                          theaterVideoRef.current.play().catch(() => {});
                        }
                      }}
                      className="group relative flex-shrink-0 w-20 h-13 rounded-lg overflow-hidden border border-slate-800 hover:border-teal-400 cursor-pointer"
                    >
                      {frame.image && <img src={frame.image} alt="" className="w-full h-full object-cover" />}
                      <span className="absolute bottom-0.5 right-0.5 px-1 bg-black/80 text-[8px] font-mono text-teal-300 rounded">
                        {ts}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
