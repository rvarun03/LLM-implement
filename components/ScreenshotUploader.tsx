import React, { useState, useRef } from 'react';
import { Upload, X, Eye, Trash2, Image as ImageIcon, Clipboard, Plus } from 'lucide-react';
import { toast } from 'sonner';

export interface ScreenshotFile {
  id: string;
  name: string;
  data: string; // raw base64 string without data:image/... prefix
  mimeType: string;
  previewUrl: string; // full data URL for img preview
  size?: number;
}

interface ScreenshotUploaderProps {
  screenshots: ScreenshotFile[];
  onChange: (screenshots: ScreenshotFile[]) => void;
  title?: string;
  description?: string;
  maxFiles?: number;
  className?: string;
  compact?: boolean;
}

export const ScreenshotUploader: React.FC<ScreenshotUploaderProps> = ({
  screenshots,
  onChange,
  title = "UI Screenshots / Mockups",
  description = "Attach 1 or more screenshots (PNG, JPG, WEBP, GIF, BMP, SVG). Optional if text/URL is provided; required if no other input is provided.",
  maxFiles = 10,
  className = "",
  compact = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [previewImage, setPreviewImage] = useState<ScreenshotFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

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

    const hasVideoOrInvalid = fileArray.some(file => isVideoFile(file) || !isImageFile(file));
    const validImageFiles = fileArray.filter(file => !isVideoFile(file) && isImageFile(file));

    if (validImageFiles.length === 0) {
      toast.error("Please upload only images.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (hasVideoOrInvalid) {
      toast.error("Please upload only images. Non-image files were skipped.");
    }

    if (screenshots.length + validImageFiles.length > maxFiles) {
      toast.error(`Maximum limit is ${maxFiles} screenshots.`);
      return;
    }

    const newScreenshots: ScreenshotFile[] = [];

    for (const file of validImageFiles) {
      try {
        const screenshot = await new Promise<ScreenshotFile>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const img = new Image();
            img.onload = () => {
              const maxDim = 1400;
              let width = img.width;
              let height = img.height;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
                const parts = compressedDataUrl.split(',');
                resolve({
                  id: Math.random().toString(36).substring(2, 9),
                  name: file.name,
                  data: parts[1] || '',
                  mimeType: 'image/jpeg',
                  previewUrl: compressedDataUrl,
                  size: Math.round((parts[1] || '').length * 0.75)
                });
                return;
              }
              const base64Data = result.split(',')[1] || '';
              resolve({
                id: Math.random().toString(36).substring(2, 9),
                name: file.name,
                data: base64Data,
                mimeType: file.type || 'image/png',
                previewUrl: result,
                size: file.size
              });
            };
            img.onerror = () => {
              const base64Data = result.split(',')[1] || '';
              resolve({
                id: Math.random().toString(36).substring(2, 9),
                name: file.name,
                data: base64Data,
                mimeType: file.type || 'image/png',
                previewUrl: result,
                size: file.size
              });
            };
            img.src = result;
          };
          reader.onerror = () => {
            resolve({
              id: Math.random().toString(36).substring(2, 9),
              name: file.name,
              data: '',
              mimeType: 'image/png',
              previewUrl: '',
              size: 0
            });
          };
          reader.readAsDataURL(file);
        });
        if (screenshot.data) {
          newScreenshots.push(screenshot);
        }
      } catch (e) {
        console.error("Failed to read image file", e);
      }
    }

    if (newScreenshots.length > 0) {
      onChange([...screenshots, ...newScreenshots]);
      toast.success(`Attached ${newScreenshots.length} screenshot(s)`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Global paste handler for Ctrl+V
  React.useEffect(() => {
    const handleWindowPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      
      const items = e.clipboardData.items;
      const files: File[] = [];
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const file = new File([blob], `pasted-screenshot-${Date.now()}.${blob.type.split('/')[1] || 'png'}`, { type: blob.type });
            files.push(file);
          }
        }
      }
      
      if (files.length > 0) {
        processFiles(files);
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [screenshots]);

  const handlePasteFromClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        const files: File[] = [];
        for (const item of items) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const blob = await item.getType(type);
              const ext = type.split('/')[1] || 'png';
              const file = new File([blob], `pasted-screenshot-${Date.now()}.${ext}`, { type });
              files.push(file);
            }
          }
        }
        if (files.length > 0) {
          processFiles(files);
          return;
        }
      }

      // Check if text in clipboard is a data URL or image URL
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith('data:image/')) {
          const trimmed = text.trim();
          const mimeType = trimmed.substring(5, trimmed.indexOf(';')) || 'image/png';
          const base64Data = trimmed.split(',')[1] || '';
          const screenshot: ScreenshotFile = {
            id: Math.random().toString(36).substring(2, 9),
            name: `pasted-image-${Date.now()}.${mimeType.split('/')[1] || 'png'}`,
            data: base64Data,
            mimeType: mimeType,
            previewUrl: trimmed,
            size: Math.round((base64Data.length * 3) / 4)
          };
          onChange([...screenshots, screenshot]);
          toast.success("Pasted screenshot from clipboard");
          return;
        }
      }
      toast.info("No image found in clipboard. Try copying an image or taking a screenshot first, then press Paste or Ctrl+V.");
    } catch (err) {
      toast.info("Clipboard access requested. You can also paste directly into the page with Ctrl+V.");
    }
  };

  const handleRemove = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onChange(screenshots.filter(s => s.id !== id));
    if (previewImage?.id === id) {
      setPreviewImage(null);
    }
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div className={`bg-slate-50/70 border border-slate-200/80 rounded-[2rem] p-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/80">
            <ImageIcon size={18} />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              {title}
              {screenshots.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-black bg-indigo-600 text-white rounded-full">
                  {screenshots.length}
                </span>
              )}
            </h4>
            {!compact && <p className="text-[11px] font-medium text-slate-500 mt-0.5">{description}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePasteFromClipboard}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-600 rounded-xl text-xs font-bold transition-all shadow-sm"
            title="Paste image from clipboard"
          >
            <Clipboard size={14} /> Paste
          </button>
          
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-100"
          >
            <Upload size={14} /> Upload Images
          </button>

          {screenshots.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
              title="Clear all screenshots"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.avif,image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml"
        className="hidden"
      />

      {/* Drag & Drop Zone / Thumbnail List */}
      {screenshots.length === 0 ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-[1.5rem] p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50/50'
              : 'border-slate-200 hover:border-indigo-300 bg-white hover:bg-slate-50/50'
          }`}
        >
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center border border-indigo-100">
            <Upload size={22} />
          </div>
          <p className="text-xs font-bold text-slate-700">
            Drop screenshots here, or <span className="text-indigo-600 underline">browse files</span>
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Supports PNG, JPG, WEBP, GIF, SVG (Multiple files supported)
          </p>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {screenshots.map((s, idx) => (
              <div
                key={s.id}
                className="group relative bg-white border border-slate-200 rounded-2xl p-2 transition-all hover:shadow-md hover:border-indigo-300"
              >
                <div 
                  className="w-full h-28 rounded-xl overflow-hidden bg-slate-100 relative cursor-pointer"
                  onClick={() => setPreviewImage(s)}
                >
                  <img
                    src={s.previewUrl || undefined}
                    alt={s.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewImage(s);
                      }}
                      className="p-1.5 bg-white text-slate-800 rounded-lg shadow hover:bg-indigo-50 hover:text-indigo-600 transition-all"
                      title="Preview"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleRemove(s.id, e)}
                      className="p-1.5 bg-white text-slate-800 rounded-lg shadow hover:bg-rose-50 hover:text-rose-600 transition-all"
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-2 px-1 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                  <span className="truncate max-w-[80%]" title={s.name}>
                    #{idx + 1} {s.name}
                  </span>
                  <span>{formatFileSize(s.size)}</span>
                </div>
              </div>
            ))}

            {/* Add More Button */}
            {screenshots.length < maxFiles && (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl h-36 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 cursor-pointer bg-white hover:bg-indigo-50/20 transition-all"
              >
                <Plus size={24} />
                <span className="text-[11px] font-bold mt-1">Add More</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Preview Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative bg-white rounded-3xl p-4 max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 px-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ImageIcon size={18} className="text-indigo-600" />
                <span className="text-sm font-bold text-slate-800">{previewImage.name}</span>
                <span className="text-xs text-slate-400">({formatFileSize(previewImage.size)})</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center bg-slate-900 rounded-2xl my-2 max-h-[75vh]">
              <img
                src={previewImage.previewUrl || undefined}
                alt={previewImage.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
            <div className="flex justify-end pt-2 px-2">
              <button
                type="button"
                onClick={() => handleRemove(previewImage.id)}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all"
              >
                <Trash2 size={14} /> Delete Screenshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
