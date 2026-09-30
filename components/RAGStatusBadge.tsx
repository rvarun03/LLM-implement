import React, { useState } from 'react';
import { Sparkles, Database, CheckCircle2, ChevronRight, Info, Layers } from 'lucide-react';
import { VectorSearchResult } from '../types';

interface RAGStatusBadgeProps {
  enabled: boolean;
  onToggle?: (enabled: boolean) => void;
  retrievedChunks?: VectorSearchResult[];
  chunkCount?: number;
  className?: string;
}

export const RAGStatusBadge: React.FC<RAGStatusBadgeProps> = ({
  enabled,
  onToggle,
  retrievedChunks = [],
  chunkCount,
  className = ''
}) => {
  const [showModal, setShowModal] = useState(false);
  const count = chunkCount !== undefined ? chunkCount : retrievedChunks.length;

  return (
    <>
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
        enabled 
          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 shadow-sm shadow-emerald-900/20' 
          : 'bg-slate-900/60 border-slate-700/60 text-slate-400'
      } ${className}`}>
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className={enabled ? 'text-emerald-400 animate-pulse' : 'text-slate-500'} />
          <span className="font-semibold tracking-wide">RAG Vector Grounding</span>
        </div>

        {enabled && count > 0 && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-200 text-[11px] font-mono transition-colors"
            title="Click to view retrieved context chunks"
          >
            <Database size={11} />
            <span>{count} Chunks</span>
            <ChevronRight size={11} />
          </button>
        )}

        {onToggle && (
          <label className="relative inline-flex items-center cursor-pointer ml-1">
            <input
              type="checkbox"
              checked={Boolean(enabled)}
              onChange={(e) => onToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-7 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        )}
      </div>

      {/* Modal showing retrieved chunks */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <Sparkles size={20} />
                <h3 className="text-lg font-bold text-slate-100">Retrieved RAG Context Chunks</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-mono px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Close ✕
              </button>
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2 bg-emerald-950/30 p-2.5 rounded border border-emerald-900/40">
              <Info size={14} className="text-emerald-400 shrink-0" />
              <span>These vector chunks were retrieved from Firestore Vector Search (768d Cosine Similarity) and injected into the AI prompt to ground generation in verified project knowledge.</span>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1 custom-scrollbar">
              {retrievedChunks.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  No explicit chunks retrieved for current request (standard prompt utilized).
                </div>
              ) : (
                retrievedChunks.map((res, i) => (
                  <div key={res.chunk.id || i} className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-200 font-semibold">
                        <Layers size={14} className="text-emerald-400" />
                        <span>{res.chunk.title}</span>
                      </div>
                      <span className="bg-emerald-950 text-emerald-300 font-mono text-[11px] px-2 py-0.5 rounded border border-emerald-800">
                        Match: {(res.similarityScore * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-slate-300 font-mono bg-slate-900 p-2.5 rounded border border-slate-800/80 whitespace-pre-wrap leading-relaxed text-[11px]">
                      {res.chunk.content}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Source: {res.chunk.metadata.source || 'Firestore Vector Store'}</span>
                      <span>Type: {res.chunk.metadata.type}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
