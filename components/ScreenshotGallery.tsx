import React, { useState } from 'react';
import { Image as ImageIcon, Maximize2, X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

interface ScreenshotGalleryProps {
  images?: string[];
  title?: string;
  className?: string;
  compact?: boolean;
}

const formatImgSrc = (src?: string): string | undefined => {
  if (!src) return undefined;
  const trimmed = src.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('data:') || trimmed.startsWith('http:') || trimmed.startsWith('https:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  return `data:image/png;base64,${trimmed}`;
};

export const ScreenshotGallery: React.FC<ScreenshotGalleryProps> = ({
  images = [],
  title = "Attached Screenshots",
  className = "",
  compact = false
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!images || images.length === 0) return null;

  return (
    <div className={`mt-3 ${className}`}>
      {title && (
        <div className="flex items-center gap-1.5 mb-2">
          <ImageIcon size={12} className="text-indigo-600" />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
            {title} ({images.length})
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-2.5 items-center">
        {images.map((imgUrl, idx) => {
          const formattedSrc = formatImgSrc(imgUrl);
          return (
            <div
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndex(idx);
              }}
              className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm transition-all hover:border-indigo-500 hover:shadow-md ${
                compact ? 'w-16 h-16' : 'w-24 h-24 sm:w-28 sm:h-28'
              }`}
            >
              <img
                src={formattedSrc}
                alt={`Screenshot ${idx + 1}`}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-slate-900/40 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center gap-1.5">
                <span className="p-1.5 bg-white/90 text-slate-800 rounded-lg shadow">
                  <Maximize2 size={12} />
                </span>
              </div>
              <div className="absolute bottom-1 right-1 bg-slate-900/75 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                #{idx + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox / High Resolution Modal */}
      {selectedIndex !== null && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedIndex(null);
          }}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] w-full bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl">
                  <ImageIcon size={20} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">
                    {title} - Image {selectedIndex + 1} of {images.length}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Full Resolution Screenshot Preview</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={formatImgSrc(images[selectedIndex])}
                  download={`screenshot-${selectedIndex + 1}.png`}
                  className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                  title="Download Image"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={18} />
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIndex(null);
                  }}
                  className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Content / Main Image */}
            <div className="relative flex-1 flex items-center justify-center p-6 bg-slate-950/60 overflow-auto max-h-[70vh]">
              <img
                src={formatImgSrc(images[selectedIndex])}
                alt={`Screenshot ${selectedIndex + 1}`}
                className="max-h-[65vh] max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800/80"
              />

              {/* Navigation Arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndex((selectedIndex - 1 + images.length) % images.length);
                    }}
                    className="absolute left-6 top-1/2 -translate-y-1/2 p-3.5 bg-slate-900/80 hover:bg-indigo-600 text-white rounded-2xl transition-all border border-slate-700/50 shadow-2xl"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndex((selectedIndex + 1) % images.length);
                    }}
                    className="absolute right-6 top-1/2 -translate-y-1/2 p-3.5 bg-slate-900/80 hover:bg-indigo-600 text-white rounded-2xl transition-all border border-slate-700/50 shadow-2xl"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}
            </div>

            {/* Modal Footer Thumbnails */}
            {images.length > 1 && (
              <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-3 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndex(i);
                    }}
                    className={`w-14 h-14 rounded-xl overflow-hidden border-2 transition-all ${
                      i === selectedIndex
                        ? 'border-indigo-500 scale-105 shadow-lg ring-2 ring-indigo-500/30'
                        : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={formatImgSrc(img)} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
