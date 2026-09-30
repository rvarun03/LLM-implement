import React, { useState, useEffect } from 'react';
import { ImageOff, Loader2, Maximize2, Download, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { resolveScreenshotDisplayUrl, UIScreenshotMetadata } from '../services/screenshotStorageService';
import { getArtifact } from '../services/artifactStorage';

interface ScreenshotImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  containerClassName?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
  onClick?: () => void;
  showHoverZoom?: boolean;
  metadata?: UIScreenshotMetadata;
}

/**
 * Robust ScreenshotImage component with automatic URL resolution,
 * loading state, fallback, and "Screenshot unavailable" state.
 */
export const ScreenshotImage: React.FC<ScreenshotImageProps> = ({
  src,
  alt = 'UI Screenshot',
  className = 'w-full h-full object-cover',
  containerClassName = 'w-full h-full relative overflow-hidden bg-slate-100 rounded-xl',
  objectFit = 'cover',
  onClick,
  showHoverZoom = true,
  metadata
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setIsError(false);
    setErrorMessage('');

    if (!src) {
      setIsLoading(false);
      setIsError(true);
      setErrorMessage('No screenshot data');
      return;
    }

    resolveScreenshotDisplayUrl(src).then((res) => {
      if (!isMounted) return;
      if (res.isUnavailable || !res.url) {
        setIsError(true);
        setErrorMessage(res.reason || 'Screenshot unavailable');
        setIsLoading(false);
      } else {
        setResolvedUrl(res.url);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!isMounted) return;
      setIsError(true);
      setErrorMessage('Failed to resolve screenshot');
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [src]);

  return (
    <div 
      className={`${containerClassName} ${onClick ? 'cursor-pointer group' : ''}`}
      onClick={onClick}
    >
      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/10 backdrop-blur-xs p-3 text-center animate-pulse">
          <Loader2 size={18} className="animate-spin text-slate-500 mb-1" />
          <span className="text-[10px] font-bold text-slate-600">Loading screenshot...</span>
        </div>
      )}

      {/* Error / Unavailable Fallback State */}
      {isError && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 p-3 text-center border border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center mb-1.5">
            <ImageOff size={16} />
          </div>
          <span className="text-[10px] font-black text-slate-700 tracking-tight block">Screenshot unavailable</span>
          <span className="text-[9px] font-medium text-slate-400 mt-0.5 line-clamp-1">{errorMessage}</span>
        </div>
      )}

      {/* Resolved Image */}
      {!isLoading && !isError && resolvedUrl && (
        <>
          <img
            src={resolvedUrl}
            alt={alt}
            referrerPolicy="no-referrer"
            className={`${className} ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} transition-transform duration-300 ${onClick && showHoverZoom ? 'group-hover:scale-105' : ''}`}
            onError={async () => {
              if (src && !resolvedUrl.startsWith('/api/artifacts/')) {
                const cleanKey = String(src).replace(/^ui_screenshot_id:/, '').replace(/^\/artifacts\//, '').replace(/\.(png|jpg|jpeg|webp)$/i, '');
                try {
                  const fallbackRes = await fetch(`/api/artifacts/${cleanKey}`);
                  if (fallbackRes.ok) {
                    setResolvedUrl(`/api/artifacts/${cleanKey}`);
                    return;
                  }
                } catch {}
              }
              setIsError(true);
              setErrorMessage('Screenshot image failed to load');
            }}
          />
          {onClick && showHoverZoom && (
            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white">
              <span className="px-2.5 py-1 bg-slate-900/80 rounded-lg text-[10px] font-bold flex items-center gap-1 backdrop-blur-sm border border-white/20">
                <Maximize2 size={11} /> View Full
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

interface ScreenshotPreviewModalContentProps {
  title: string;
  url?: string | null;
  onClose: () => void;
  metadata?: UIScreenshotMetadata;
  targetAppUrl?: string;
}

/**
 * Fullscreen viewer modal content for screenshots.
 * Completely eliminates blank-screen issues by validating and displaying
 * the persistent image or showing an informative "Screenshot unavailable" fallback.
 */
export const ScreenshotPreviewModalContent: React.FC<ScreenshotPreviewModalContentProps> = ({
  title,
  url,
  onClose,
  metadata,
  targetAppUrl
}) => {
  const [displayUrl, setDisplayUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUnavailable, setIsUnavailable] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('');

  const loadUrl = () => {
    setIsLoading(true);
    setIsUnavailable(false);
    setReason('');

    if (!url) {
      setIsUnavailable(true);
      setReason('No screenshot link was provided for this item.');
      setIsLoading(false);
      return;
    }

    resolveScreenshotDisplayUrl(url).then((res) => {
      if (res.isUnavailable || !res.url) {
        setIsUnavailable(true);
        setReason(res.reason || 'Screenshot file could not be recovered.');
        setIsLoading(false);
      } else {
        setDisplayUrl(res.url);
        setIsLoading(false);
      }
    }).catch(() => {
      setIsUnavailable(true);
      setReason('Network or storage error resolving image.');
      setIsLoading(false);
    });
  };

  useEffect(() => {
    loadUrl();
  }, [url]);

  const handleDownload = () => {
    if (!displayUrl) return;
    try {
      const a = document.createElement('a');
      a.href = displayUrl;
      a.download = `${title.replace(/[^a-zA-Z0-9_\-]/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(displayUrl, '_blank');
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-[300px]">
      {/* Loading */}
      {isLoading && (
        <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm animate-pulse">
            <Loader2 size={24} className="animate-spin" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">Loading saved screenshot...</h4>
            <p className="text-xs text-slate-400 mt-0.5">Fetching image from persistent storage</p>
          </div>
        </div>
      )}

      {/* Unavailable Fallback Card */}
      {isUnavailable && !isLoading && (
        <div className="w-full max-w-lg p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-4 my-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mx-auto flex items-center justify-center">
            <ImageOff size={28} />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-black text-slate-900 tracking-tight">Screenshot unavailable</h4>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              {reason || 'The saved screenshot could not be loaded because the temporary session expired or the file reference is no longer accessible.'}
            </p>
          </div>

          <div className="p-3 bg-white rounded-xl border border-slate-200 text-left space-y-1 text-[11px]">
            <div className="flex items-center justify-between text-slate-500">
              <span>Item:</span>
              <span className="font-bold text-slate-800 truncate max-w-[240px]">{title}</span>
            </div>
            {targetAppUrl && (
              <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-slate-100">
                <span>Application URL:</span>
                <a 
                  href={targetAppUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="font-bold text-indigo-600 hover:underline flex items-center gap-1 truncate max-w-[240px]"
                >
                  {targetAppUrl} <ExternalLink size={10} />
                </a>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={loadUrl}
              className="px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw size={13} /> Retry Loading
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold transition-all shadow"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Success Image Display */}
      {!isLoading && !isUnavailable && displayUrl && (
        <div className="w-full flex flex-col items-center space-y-3">
          <div className="relative max-h-[70vh] rounded-2xl overflow-hidden border border-slate-200/80 shadow-lg bg-slate-950 flex items-center justify-center">
            <img
              src={displayUrl}
              alt={title}
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[70vh] object-contain"
              onError={async () => {
                const targetKey = String(url || displayUrl).trim();
                const cleanKey = targetKey
                  .replace(/^ui_screenshot_id:/, '')
                  .replace(/^\/artifacts\//, '')
                  .replace(/^\/api\/artifacts\//, '')
                  .replace(/\.(png|jpg|jpeg|webp|json)$/i, '');

                // 1. Try local IndexedDB
                try {
                  const cached = (await getArtifact(cleanKey)) || 
                                 (await getArtifact(`sc_${cleanKey}`)) || 
                                 (await getArtifact(`raw_${cleanKey}`)) || 
                                 (await getArtifact(`img_${cleanKey}`)) ||
                                 (await getArtifact(`report_${cleanKey}`));
                  if (cached) {
                    if (typeof cached === 'string' && cached.startsWith('data:image/')) {
                      setDisplayUrl(cached);
                      return;
                    }
                    if (typeof cached === 'object') {
                      const recImg = cached.dataUrl || cached.data || cached.downloadURL || cached.image || cached.originalImage;
                      if (typeof recImg === 'string' && recImg.length > 50) {
                        setDisplayUrl(recImg);
                        return;
                      }
                    }
                  }
                } catch {}

                // 2. Try server API /api/artifacts/:cleanKey
                if (!displayUrl.startsWith('/api/artifacts/')) {
                  try {
                    const fallbackRes = await fetch(`/api/artifacts/${cleanKey}`);
                    if (fallbackRes.ok) {
                      setDisplayUrl(`/api/artifacts/${cleanKey}`);
                      return;
                    }
                  } catch {}
                }

                setIsUnavailable(true);
                setReason('Failed to render the image format.');
              }}
            />
          </div>

          <div className="flex items-center justify-between w-full max-w-xl px-2 text-xs">
            <span className="text-[11px] font-bold text-slate-500 truncate max-w-[280px]">
              {displayUrl.startsWith('https://firebasestorage.googleapis.com') ? '☁️ Firebase Storage (Persistent)' : '💾 Saved Artifact'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-colors border border-slate-200"
              >
                <Download size={12} /> Download Image
              </button>
              <a
                href={displayUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-colors border border-indigo-100"
              >
                <ExternalLink size={12} /> Open in New Tab
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
