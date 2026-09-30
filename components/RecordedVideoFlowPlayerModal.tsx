import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Maximize2, 
  Minimize2, 
  X, 
  Video, 
  FileCode, 
  Upload, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft, 
  Clock, 
  Layers, 
  AlertTriangle,
  RefreshCw,
  Volume2,
  VolumeX,
  Sliders,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { resolveVideoPlayableUrl, saveVideoBlob, uploadAndPersistVideo, isUrlPlayable } from '../services/artifactStorage';

export interface VideoFlowPlayerData {
  flowId?: string;
  flowName: string;
  fileName: string;
  url: string;
  stepsCount: number;
  steps?: any[];
  videoDuration?: number;
  script?: string;
  scriptFiles?: { path: string; content: string }[];
  tool?: string;
  language?: string;
  thumbnailUrl?: string;
  posterUrl?: string;
}

interface Props {
  data: VideoFlowPlayerData | null;
  onClose: () => void;
  onUpdateFlowVideo?: (flowId: string, newUrl: string, newFileName: string) => Promise<void>;
  onViewScript?: (script: string, files?: { path: string; content: string }[], tool?: string, language?: string) => void;
}

export const RecordedVideoFlowPlayerModal: React.FC<Props> = ({
  data,
  onClose,
  onUpdateFlowVideo,
  onViewScript
}) => {
  if (!data) return null;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active Playable Video Source
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [isResolving, setIsResolving] = useState<boolean>(true);
  const [videoLoadError, setVideoLoadError] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<'video' | 'keyframes'>('video');

  // Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(data.videoDuration || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showStepList, setShowStepList] = useState<boolean>(true);

  // Keyframe Walkthrough Mode State
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [isKeyframePlaying, setIsKeyframePlaying] = useState<boolean>(false);
  const keyframeTimerRef = useRef<any>(null);

  // Re-attach state
  const [isUploadingReplacement, setIsUploadingReplacement] = useState<boolean>(false);

  const steps = useMemo(() => data.steps || [], [data.steps]);
  const posterUrl = useMemo(() => {
    // Only use poster/thumb if it is a valid data URL or valid image, avoiding broken /artifacts/..._thumb.jpg that 404s
    if (typeof data?.posterUrl === 'string' && (data.posterUrl.startsWith('data:') || data.posterUrl.startsWith('http') || (data.posterUrl.startsWith('/artifacts/') && !data.posterUrl.endsWith('_thumb.jpg')))) {
      return data.posterUrl;
    }
    if (typeof data?.thumbnailUrl === 'string' && (data.thumbnailUrl.startsWith('data:') || data.thumbnailUrl.startsWith('http') || (data.thumbnailUrl.startsWith('/artifacts/') && !data.thumbnailUrl.endsWith('_thumb.jpg')))) {
      return data.thumbnailUrl;
    }
    if (steps[0]?.screenshot) return steps[0].screenshot;
    if (steps[0]?.contextImage) return steps[0].contextImage;
    if (steps[activeStepIdx]?.screenshot) return steps[activeStepIdx].screenshot;
    return undefined;
  }, [data, steps, activeStepIdx]);

  // Ensure HTML5 video reloads source and renders first frame whenever videoUrl updates
  useEffect(() => {
    if (videoUrl && videoRef.current) {
      try {
        videoRef.current.load();
        if (videoRef.current.currentTime === 0) {
          videoRef.current.currentTime = 0.001;
        }
      } catch {}
    }
  }, [videoUrl]);

  // Attempt to resolve or recover a playable URL
  useEffect(() => {
    let isMounted = true;

    async function initializePlayer() {
      setIsResolving(true);
      setVideoLoadError(false);

      try {
        const resolved = await resolveVideoPlayableUrl({
          id: data?.flowId,
          url: data?.url,
          videoFileName: data?.fileName
        });

        if (isMounted) {
          if (resolved) {
            setVideoUrl(resolved);
            setVideoLoadError(false);
            setActiveMode('video');
          } else if (data?.url) {
            setVideoUrl(data.url);
            setVideoLoadError(false);
            setActiveMode('video');
          } else {
            // If no video URL at all, fall back to keyframes if steps available
            setVideoUrl('');
            if (steps.length > 0) {
              setActiveMode('keyframes');
            }
            setVideoLoadError(true);
          }
        }
      } catch (err) {
        console.warn('[Video Player Modal] Error resolving URL:', err);
        if (isMounted && data?.url) {
          setVideoUrl(data.url);
          setActiveMode('video');
        }
      } finally {
        if (isMounted) {
          setIsResolving(false);
        }
      }
    }

    initializePlayer();

    return () => {
      isMounted = false;
      if (keyframeTimerRef.current) clearInterval(keyframeTimerRef.current);
    };
  }, [data.flowId, data.url, data.fileName, steps.length]);

  // Handle native video error
  const handleVideoError = async () => {
    console.warn('[Video Player Modal] HTML5 video element failed to load:', videoUrl);
    setVideoLoadError(true);

    // Try secondary recovery from IndexedDB
    if (data.flowId || data.fileName) {
      const recovered = await resolveVideoPlayableUrl({
        id: data.flowId,
        videoFileName: data.fileName
      });
      if (recovered && recovered !== videoUrl) {
        setVideoUrl(recovered);
        setVideoLoadError(false);
        return;
      }
    }

    // If still fails, switch to keyframe mode if steps have screenshots
    if (steps.length > 0) {
      setActiveMode('keyframes');
      toast.info('Switched to Step Walkthrough mode. You can also re-attach the video file below.');
    }
  };

  // Video time updates
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setDuration(videoRef.current.duration);
      }

      // Sync active step with video timestamp
      if (steps.length > 0) {
        const t = videoRef.current.currentTime;
        let matchedIdx = 0;
        for (let i = 0; i < steps.length; i++) {
          const stepTime = steps[i].timestamp || 0;
          if (t >= stepTime) {
            matchedIdx = i;
          }
        }
        setActiveStepIdx(matchedIdx);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      if (videoRef.current.duration && !isNaN(videoRef.current.duration)) {
        setDuration(videoRef.current.duration);
      }
      videoRef.current.playbackRate = playbackRate;
      setVideoLoadError(false);

      // Attempt autoplay
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        // Autoplay policy prevented unmuted playback, try muted
        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsMuted(true);
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {
            setIsPlaying(false);
            try {
              if (videoRef.current && videoRef.current.currentTime === 0) {
                videoRef.current.currentTime = 0.001;
              }
            } catch {}
          });
        }
      });
    }
  };

  const togglePlay = () => {
    if (activeMode === 'video') {
      if (!videoRef.current) return;
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          }
        });
      }
    } else {
      // Keyframe mode playback
      if (isKeyframePlaying) {
        if (keyframeTimerRef.current) clearInterval(keyframeTimerRef.current);
        setIsKeyframePlaying(false);
      } else {
        setIsKeyframePlaying(true);
        if (keyframeTimerRef.current) clearInterval(keyframeTimerRef.current);
        keyframeTimerRef.current = setInterval(() => {
          setActiveStepIdx((prev) => {
            if (prev >= steps.length - 1) {
              setIsKeyframePlaying(false);
              clearInterval(keyframeTimerRef.current);
              return prev;
            }
            return prev + 1;
          });
        }, 2200);
      }
    }
  };

  const handleSeek = (newTime: number) => {
    if (activeMode === 'video' && videoRef.current) {
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleRestart = () => {
    if (activeMode === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      setActiveStepIdx(0);
      setIsKeyframePlaying(true);
    }
  };

  const handleChangePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Jump to specific step
  const handleJumpToStep = (index: number) => {
    setActiveStepIdx(index);
    const targetStep = steps[index];
    if (activeMode === 'video' && videoRef.current && targetStep) {
      const stepTime = targetStep.timestamp || (duration ? (index / steps.length) * duration : index * 3);
      videoRef.current.currentTime = stepTime;
      setCurrentTime(stepTime);
      if (!isPlaying) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  // Re-attach video file handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingReplacement(true);
    const toastId = toast.loading(`Uploading and linking "${file.name}"...`);

    try {
      const flowId = data.flowId || `uvflow_${Date.now()}`;
      
      // 1. Cache in IndexedDB immediately
      await saveVideoBlob(flowId, file, file.name);

      // 2. Upload to server disk
      const uploadRes = await uploadAndPersistVideo(flowId, file, file.name);
      const newUrl = uploadRes.url || URL.createObjectURL(file);

      // 3. Update state
      setVideoUrl(newUrl);
      setVideoLoadError(false);
      setActiveMode('video');

      // 4. Propagate to project in parent
      if (onUpdateFlowVideo && data.flowId) {
        await onUpdateFlowVideo(data.flowId, newUrl, file.name);
      }

      toast.success(`Video "${file.name}" successfully attached and ready to play!`, { id: toastId });
      
      // Auto play
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.load();
          videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }, 300);
    } catch (err: any) {
      console.error('Failed to re-attach video:', err);
      toast.error(`Failed to attach video: ${err.message || err}`, { id: toastId });
    } finally {
      setIsUploadingReplacement(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Download video file
  const handleDownload = async () => {
    if (!videoUrl) {
      toast.error('No video available to download');
      return;
    }

    try {
      const a = document.createElement('a');
      a.href = videoUrl;
      a.download = data.fileName || `${data.flowName.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Download started');
    } catch {
      window.open(videoUrl, '_blank');
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const mins = Math.floor(secs / 60);
    const rem = Math.floor(secs % 60);
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const activeStep = steps[activeStepIdx];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[6000] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          ref={containerRef}
          initial={{ scale: 0.96, y: 15 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 15 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="bg-slate-900 w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden flex flex-col my-auto max-h-[95vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 sm:p-5 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between text-white flex-wrap gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30 shadow-inner shrink-0">
                <Video size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white truncate max-w-[280px] sm:max-w-md">
                  {data.flowName}
                </h3>
                <p className="text-[10px] sm:text-xs text-slate-400 font-medium truncate">
                  {data.fileName} • {data.stepsCount} Recorded Steps {duration > 0 ? `• ${formatTime(duration)}` : ''}
                </p>
              </div>
            </div>

            {/* Mode Selector & Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap ml-auto">
              {/* Mode Toggle Pills */}
              <div className="bg-slate-950/60 p-1 rounded-xl border border-slate-700/60 flex items-center gap-1">
                <button
                  onClick={() => {
                    setActiveMode('video');
                    if (videoRef.current) {
                      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    activeMode === 'video'
                      ? 'bg-cyan-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Native Video
                </button>
                <button
                  onClick={() => {
                    setActiveMode('keyframes');
                    if (videoRef.current) videoRef.current.pause();
                    setIsPlaying(false);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    activeMode === 'keyframes'
                      ? 'bg-cyan-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Step Walkthrough ({steps.length})
                </button>
              </div>

              {/* View Generated Automation Script */}
              {data.script && (
                <button
                  onClick={() => {
                    if (onViewScript) {
                      onViewScript(data.script || '', data.scriptFiles, data.tool, data.language);
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="View Generated Test Automation Code"
                >
                  <FileCode size={13} /> Script
                </button>
              )}

              {/* Download */}
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Download Video File"
              >
                <Download size={13} />
              </button>

              {/* Close */}
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close Player"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Hidden File Input for Video Re-attachment */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Main Stage & Step Timeline */}
          <div className="flex-1 flex flex-col md:flex-row min-h-[380px] sm:min-h-[460px] bg-black overflow-hidden relative">
            {/* Visual Screen Player */}
            <div className="flex-1 flex flex-col bg-black relative items-center justify-center overflow-hidden">
              {activeMode === 'video' ? (
                /* Native Video Player */
                <div className="w-full h-full flex flex-col items-center justify-center relative min-h-[340px]">
                  {isResolving ? (
                    <div className="flex flex-col items-center gap-3 text-cyan-400 py-12">
                      <RefreshCw className="animate-spin" size={28} />
                      <span className="text-xs font-semibold tracking-wider uppercase text-slate-300">
                        Preparing video stream...
                      </span>
                    </div>
                  ) : (videoLoadError || !videoUrl) ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center max-w-md my-auto">
                      <div className="p-4 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 mb-4 shadow-lg">
                        <AlertTriangle size={32} />
                      </div>
                      <h4 className="text-base font-black text-white uppercase tracking-tight mb-2">
                        Video Stream Offline
                      </h4>
                      <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                        The video binary is not found on the local server. You can view the full recorded keyframes walkthrough or re-attach the video file directly below.
                      </p>
                      <div className="flex items-center gap-3 flex-wrap justify-center">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingReplacement}
                          className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer"
                        >
                          <Upload size={14} /> Re-attach {data.fileName || 'Video File'}
                        </button>
                        {steps.length > 0 && (
                          <button
                            onClick={() => setActiveMode('keyframes')}
                            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border border-slate-700 transition-all cursor-pointer"
                          >
                            <Layers size={14} /> Play Step Walkthrough
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="relative flex items-center justify-center max-h-[58vh] max-w-full group">
                      <video
                        ref={videoRef}
                        src={videoUrl || undefined}
                        poster={posterUrl || undefined}
                        preload="auto"
                        playsInline
                        onTimeUpdate={handleTimeUpdate}
                        onLoadedMetadata={handleLoadedMetadata}
                        onLoadedData={() => {
                          if (videoRef.current && videoRef.current.currentTime === 0) {
                            try { videoRef.current.currentTime = 0.001; } catch {}
                          }
                        }}
                        onCanPlay={() => {
                          if (videoRef.current && videoRef.current.currentTime === 0) {
                            try { videoRef.current.currentTime = 0.001; } catch {}
                          }
                        }}
                        onError={handleVideoError}
                        onEnded={() => setIsPlaying(false)}
                        onClick={togglePlay}
                        className="max-h-[58vh] max-w-full rounded-xl object-contain cursor-pointer shadow-2xl"
                      />
                      {/* Center Floating Play Button Overlay when paused */}
                      {!isPlaying && !videoLoadError && (
                        <button
                          type="button"
                          onClick={togglePlay}
                          className="absolute inset-0 m-auto w-16 h-16 rounded-full bg-cyan-500/90 hover:bg-cyan-400 text-white flex items-center justify-center shadow-2xl backdrop-blur-sm group-hover:scale-110 transition-transform cursor-pointer border border-white/20 z-10"
                          title="Play Video"
                        >
                          <Play size={28} className="fill-current ml-1 text-white" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Keyframe Step-by-Step Walkthrough Player */
                <div className="w-full h-full flex flex-col items-center justify-center p-4 relative min-h-[340px]">
                  {activeStep?.screenshot || activeStep?.contextImage ? (
                    <div className="relative max-h-[58vh] max-w-full flex items-center justify-center rounded-xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-950">
                      <img
                        src={activeStep.screenshot || activeStep.contextImage}
                        alt={`Step ${activeStepIdx + 1}`}
                        className="max-h-[58vh] max-w-full object-contain select-none"
                      />
                      {/* Highlighted Step Overlay Badge */}
                      <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-cyan-500/40 text-white shadow-xl flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300">
                          Step {activeStepIdx + 1} of {steps.length}
                        </span>
                        <span className="text-[10px] text-slate-300 font-bold ml-1">
                          {activeStep.action || 'Action'} {activeStep.elementName ? `on "${activeStep.elementName}"` : ''}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
                      <Layers size={40} className="text-slate-600 mb-3" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Step {activeStepIdx + 1}: {activeStep?.action || 'Recorded Action'}
                      </p>
                      <p className="text-[11px] text-slate-500 max-w-sm mt-1">
                        {activeStep?.description || activeStep?.elementName || 'No screenshot captured for this action'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Control Bar */}
              <div className="w-full bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-3 flex flex-col gap-2 z-10">
                {/* Scrubbing Timeline Slider */}
                {activeMode === 'video' ? (
                  <div className="flex items-center gap-3 w-full">
                    <span className="text-[10px] font-bold text-slate-400 min-w-[36px]">
                      {formatTime(currentTime)}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.1}
                      value={currentTime}
                      onChange={(e) => handleSeek(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                    <span className="text-[10px] font-bold text-slate-400 min-w-[36px] text-right">
                      {formatTime(duration)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 w-full">
                    <span className="text-[10px] font-bold text-slate-400 min-w-[36px]">
                      {activeStepIdx + 1}/{steps.length}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, steps.length - 1)}
                      step={1}
                      value={activeStepIdx}
                      onChange={(e) => handleJumpToStep(parseInt(e.target.value, 10))}
                      className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                    <span className="text-[10px] font-bold text-cyan-400 min-w-[36px] text-right">
                      Step {activeStepIdx + 1}
                    </span>
                  </div>
                )}

                {/* Controls row */}
                <div className="flex items-center justify-between flex-wrap gap-2 text-white">
                  <div className="flex items-center gap-2">
                    {/* Play/Pause */}
                    <button
                      onClick={togglePlay}
                      className="p-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl transition-all font-black shadow-md cursor-pointer flex items-center justify-center"
                      title={isPlaying || isKeyframePlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying || isKeyframePlaying ? (
                        <Pause size={16} className="fill-current" />
                      ) : (
                        <Play size={16} className="fill-current ml-0.5" />
                      )}
                    </button>

                    {/* Restart */}
                    <button
                      onClick={handleRestart}
                      className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Restart from beginning"
                    >
                      <RotateCcw size={15} />
                    </button>

                    {/* Previous/Next Step navigation */}
                    {steps.length > 0 && (
                      <div className="flex items-center gap-1 border-l border-slate-700/80 pl-2">
                        <button
                          onClick={() => handleJumpToStep(Math.max(0, activeStepIdx - 1))}
                          disabled={activeStepIdx === 0}
                          className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Previous Step"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          onClick={() => handleJumpToStep(Math.min(steps.length - 1, activeStepIdx + 1))}
                          disabled={activeStepIdx === steps.length - 1}
                          className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Next Step"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}

                    {/* Volume / Mute (Video Mode) */}
                    {activeMode === 'video' && (
                      <button
                        onClick={toggleMute}
                        className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer ml-1"
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                      </button>
                    )}
                  </div>

                  {/* Right side controls: speed, re-attach, steps drawer toggle, fullscreen */}
                  <div className="flex items-center gap-2">
                    {/* Playback speed selector */}
                    {activeMode === 'video' && (
                      <div className="flex items-center bg-slate-800 rounded-xl px-1 py-0.5 border border-slate-700 text-[10px] font-bold">
                        {[1, 1.25, 1.5, 2].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => handleChangePlaybackRate(rate)}
                            className={`px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer ${
                              playbackRate === rate ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Re-attach Video File Button */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingReplacement}
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 hover:border-cyan-500/50 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Attach or replace video file"
                    >
                      <Upload size={12} /> Re-link File
                    </button>

                    {/* Toggle Step Drawer */}
                    {steps.length > 0 && (
                      <button
                        onClick={() => setShowStepList(!showStepList)}
                        className={`p-2 rounded-xl transition-colors cursor-pointer ${
                          showStepList ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Toggle Steps Inspector"
                      >
                        <Layers size={15} />
                      </button>
                    )}

                    {/* Fullscreen */}
                    <button
                      onClick={toggleFullscreen}
                      className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Fullscreen"
                    >
                      {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Side Step Inspector Drawer */}
            {showStepList && steps.length > 0 && (
              <div className="w-full md:w-80 bg-slate-950 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col max-h-[35vh] md:max-h-[70vh]">
                <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={14} className="text-cyan-400" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-200">
                      Recorded Actions ({steps.length})
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    Click to jump
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1.5 divide-y divide-slate-800/40">
                  {steps.map((step, idx) => {
                    const isCurrent = idx === activeStepIdx;
                    return (
                      <div
                        key={idx}
                        onClick={() => handleJumpToStep(idx)}
                        className={`p-2 rounded-xl flex items-start gap-2.5 cursor-pointer transition-all ${
                          isCurrent
                            ? 'bg-cyan-500/20 border border-cyan-500/50 text-white shadow-md'
                            : 'hover:bg-slate-900/80 text-slate-400 border border-transparent'
                        }`}
                      >
                        {/* Step Thumbnail or Number */}
                        {step.screenshot || step.contextImage ? (
                          <div className="w-12 h-8 rounded-lg overflow-hidden border border-slate-700 bg-black shrink-0 relative">
                            <img
                              src={step.screenshot || step.contextImage}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/20" />
                            <span className="absolute bottom-0.5 right-0.5 text-[8px] font-black text-white px-1 rounded bg-black/70">
                              #{idx + 1}
                            </span>
                          </div>
                        ) : (
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${
                            isCurrent ? 'bg-cyan-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {idx + 1}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-[10px] font-black uppercase tracking-wider truncate ${
                              isCurrent ? 'text-cyan-300' : 'text-slate-300'
                            }`}>
                              {step.action || 'Action'}
                            </span>
                            {step.timestamp !== undefined && (
                              <span className="text-[9px] font-mono text-slate-500">
                                {formatTime(step.timestamp)}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">
                            {step.elementName || step.description || step.value || 'Execute action'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
