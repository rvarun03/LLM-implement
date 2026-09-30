import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface VideoSizeAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileSizeMB?: number;
  maxSizeMB?: number;
}

export const VideoSizeAlertModal: React.FC<VideoSizeAlertModalProps> = ({
  isOpen,
  onClose,
  fileSizeMB,
  maxSizeMB = 20
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 max-w-sm w-full p-6 space-y-4 text-center relative animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-size-modal-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>

        <div className="w-12 h-12 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center mx-auto text-rose-600 shadow-xs">
          <AlertCircle size={26} />
        </div>

        <div className="space-y-1.5">
          <h3 id="video-size-modal-title" className="text-base font-black text-slate-900 tracking-tight">
            Video Size Limit
          </h3>
          <p className="text-sm sm:text-base font-bold text-rose-600">
            Video size should not exceed 20 MB.
          </p>
          {fileSizeMB !== undefined && (
            <p className="text-xs text-slate-500 font-medium pt-1">
              Selected file size: <span className="font-bold text-slate-700">{fileSizeMB.toFixed(1)} MB</span> (Limit: {maxSizeMB} MB)
            </p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs active:scale-98"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
