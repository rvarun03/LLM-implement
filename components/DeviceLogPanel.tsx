import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Terminal, 
  Play, 
  Pause, 
  Trash2, 
  Download, 
  Copy, 
  Search, 
  Filter, 
  ArrowDown, 
  Maximize2, 
  Minimize2, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  Bug, 
  Check, 
  RefreshCw, 
  Sliders, 
  Smartphone, 
  Layers, 
  ShieldAlert, 
  FileText, 
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  X
} from 'lucide-react';
import { toast } from 'sonner';

export type LogLevel = 'ALL' | 'V' | 'D' | 'I' | 'W' | 'E' | 'F';

export interface DeviceLogEntry {
  id: string;
  timestamp: string;
  level: 'V' | 'D' | 'I' | 'W' | 'E' | 'F';
  tag: string;
  pid?: number;
  tid?: number;
  message: string;
  raw?: string;
  deviceId?: string;
}

interface DeviceLogPanelProps {
  logs: DeviceLogEntry[];
  onClearLogs?: () => void;
  deviceName?: string;
  deviceId?: string;
  appPackage?: string;
  appName?: string;
  isStreaming?: boolean;
  onToggleStreaming?: () => void;
  heightClass?: string;
  maxHeight?: string;
  isCompact?: boolean;
  onInjectTestLog?: (level: 'V' | 'D' | 'I' | 'W' | 'E', tag: string, message: string) => void;
}

export const DeviceLogPanel: React.FC<DeviceLogPanelProps> = ({
  logs,
  onClearLogs,
  deviceName = 'Pixel 7 Pro (Emulator)',
  deviceId = 'emulator-5554',
  appPackage = 'com.machaxi.app',
  appName,
  isStreaming = true,
  onToggleStreaming,
  heightClass = 'h-[540px]',
  maxHeight,
  isCompact = false,
  onInjectTestLog
}) => {
  const [selectedLevel, setSelectedLevel] = useState<LogLevel>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [wrapText, setWrapText] = useState<boolean>(false);
  const [selectedLog, setSelectedLog] = useState<DeviceLogEntry | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when new logs arrive if enabled
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Extract unique tags
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => {
      if (l.tag) set.add(l.tag);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Log counts by level
  const stats = useMemo(() => {
    const counts = { ALL: logs.length, V: 0, D: 0, I: 0, W: 0, E: 0, F: 0 };
    logs.forEach(l => {
      if (counts[l.level] !== undefined) {
        counts[l.level]++;
      }
    });
    return counts;
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Level filter
      if (selectedLevel !== 'ALL' && log.level !== selectedLevel) {
        return false;
      }
      // Tag filter
      if (selectedTag !== 'ALL' && log.tag.toLowerCase() !== selectedTag.toLowerCase()) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const msgMatch = log.message.toLowerCase().includes(q);
        const tagMatch = log.tag.toLowerCase().includes(q);
        const pidMatch = log.pid ? String(log.pid).includes(q) : false;
        const levelMatch = log.level.toLowerCase() === q;
        if (!msgMatch && !tagMatch && !pidMatch && !levelMatch) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedLevel, selectedTag, searchQuery]);

  const handleCopyAll = () => {
    const text = filteredLogs.map(l => 
      `${l.timestamp} ${l.pid || 1920} ${l.tid || 1920} ${l.level} ${l.tag}: ${l.message}`
    ).join('\n');

    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    toast.success(`Copied ${filteredLogs.length} device log entries to clipboard!`);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleDownloadLogs = () => {
    const text = filteredLogs.map(l => 
      `${l.timestamp} ${l.pid || 1920} ${l.tid || 1920} ${l.level} ${l.tag}: ${l.message}`
    ).join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `device-logcat-${deviceId}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Device logs downloaded successfully!");
  };

  const getLevelBadge = (level: 'V' | 'D' | 'I' | 'W' | 'E' | 'F') => {
    switch (level) {
      case 'V':
        return <span className="px-1.5 py-0.2 rounded font-mono font-black text-[9px] bg-slate-800 text-slate-400 border border-slate-700">V</span>;
      case 'D':
        return <span className="px-1.5 py-0.2 rounded font-mono font-black text-[9px] bg-sky-950 text-sky-400 border border-sky-800/60">D</span>;
      case 'I':
        return <span className="px-1.5 py-0.2 rounded font-mono font-black text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800/60">I</span>;
      case 'W':
        return <span className="px-1.5 py-0.2 rounded font-mono font-black text-[9px] bg-amber-950 text-amber-300 border border-amber-800/60">W</span>;
      case 'E':
        return <span className="px-1.5 py-0.2 rounded font-mono font-black text-[9px] bg-rose-950 text-rose-300 border border-rose-800/60 animate-pulse">E</span>;
      case 'F':
        return <span className="px-1.5 py-0.2 rounded font-mono font-black text-[9px] bg-purple-950 text-purple-300 border border-purple-800/60 font-black">F</span>;
      default:
        return <span className="px-1.5 py-0.2 rounded font-mono font-black text-[9px] bg-slate-800 text-slate-300">I</span>;
    }
  };

  const getMessageColor = (level: 'V' | 'D' | 'I' | 'W' | 'E' | 'F') => {
    switch (level) {
      case 'V':
        return 'text-slate-400';
      case 'D':
        return 'text-sky-300';
      case 'I':
        return 'text-slate-200';
      case 'W':
        return 'text-amber-200 font-medium';
      case 'E':
        return 'text-rose-300 font-semibold';
      case 'F':
        return 'text-purple-300 font-bold';
      default:
        return 'text-slate-200';
    }
  };

  return (
    <div id="device-log-panel" className="bg-slate-950 rounded-3xl border border-slate-800/90 shadow-2xl flex flex-col overflow-hidden">
      {/* Top Header Bar */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl shrink-0 border border-indigo-500/30">
            <Terminal size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                Device System Logs (ADB Logcat)
              </h3>
              {isStreaming ? (
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full font-black text-[9px] uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Stream Active
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-full font-bold text-[9px] uppercase tracking-wider flex items-center gap-1.5">
                  <Pause size={10} /> Stream Paused
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
              Target: <span className="text-indigo-300 font-semibold">{deviceName}</span> ({deviceId})
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {appPackage && (
            <button
              onClick={() => {
                if (selectedTag === appPackage) {
                  setSelectedTag('ALL');
                } else {
                  setSelectedTag(appPackage);
                  setSearchQuery('');
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                selectedTag === appPackage 
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md' 
                  : 'bg-slate-900 text-slate-300 hover:text-white border-slate-700/80 hover:bg-slate-800'
              }`}
              title={`Filter by app package: ${appPackage}`}
            >
              <Smartphone size={12} className="text-indigo-400" />
              App Only
            </button>
          )}

          {onToggleStreaming && (
            <button
              onClick={onToggleStreaming}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                isStreaming
                  ? 'bg-amber-950/60 hover:bg-amber-900 text-amber-300 border-amber-700/60'
                  : 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border-emerald-700/60'
              }`}
              title={isStreaming ? "Pause real-time log stream" : "Resume real-time log stream"}
            >
              {isStreaming ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}
              {isStreaming ? 'Pause' : 'Resume'}
            </button>
          )}

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
              autoScroll
                ? 'bg-indigo-950 text-indigo-300 border-indigo-700/60'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
            }`}
            title="Auto-scroll on new log lines"
          >
            <ArrowDown size={13} className={autoScroll ? "text-indigo-400" : ""} />
            Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setWrapText(!wrapText)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              wrapText 
                ? 'bg-indigo-950 text-indigo-300 border-indigo-700/60' 
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border-slate-800'
            }`}
            title="Toggle word wrap for long messages"
          >
            Wrap
          </button>

          <button
            onClick={handleCopyAll}
            disabled={filteredLogs.length === 0}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 transition-all disabled:opacity-40"
            title="Copy filtered logs"
          >
            {copiedAll ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>

          <button
            onClick={handleDownloadLogs}
            disabled={filteredLogs.length === 0}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 transition-all disabled:opacity-40"
            title="Download logcat file"
          >
            <Download size={14} />
          </button>

          {onClearLogs && (
            <button
              onClick={onClearLogs}
              disabled={logs.length === 0}
              className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-100 rounded-xl border border-rose-800/50 transition-all disabled:opacity-40"
              title="Clear device logs buffer"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="p-3 bg-slate-950 border-b border-slate-900 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Log Level Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(['ALL', 'V', 'D', 'I', 'W', 'E', 'F'] as LogLevel[]).map(lvl => {
            const count = stats[lvl] || 0;
            const isSelected = selectedLevel === lvl;
            return (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-2.5 py-1 rounded-xl font-mono text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 border ${
                  isSelected
                    ? lvl === 'E' ? 'bg-rose-600 text-white border-rose-500 shadow-md font-black'
                    : lvl === 'W' ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black'
                    : lvl === 'D' ? 'bg-sky-600 text-white border-sky-500 shadow-md font-black'
                    : lvl === 'V' ? 'bg-slate-700 text-white border-slate-600 shadow-md font-black'
                    : 'bg-indigo-600 text-white border-indigo-500 shadow-md font-black'
                    : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <span>{lvl === 'ALL' ? 'ALL' : lvl}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  isSelected ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tag Selector & Search Query */}
        <div className="flex items-center gap-2">
          {/* Tag Dropdown */}
          <div className="relative min-w-[140px]">
            <select
              value={selectedTag || 'ALL'}
              onChange={e => setSelectedTag(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-mono"
            >
              <option value="ALL">All Tags ({availableTags.length})</option>
              {availableTags.map(tag => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 md:w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search tag, PID, regex..."
              value={searchQuery || ''}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-7 py-1.5 focus:outline-none focus:border-indigo-500 font-mono placeholder:text-slate-600"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Terminal Console View */}
      <div 
        ref={scrollContainerRef}
        className={`flex-1 ${heightClass} overflow-y-auto font-mono text-[11px] p-3 space-y-1 select-text bg-[#070b14] border-t border-slate-900 custom-scrollbar`}
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 py-16">
            <Terminal size={32} className="text-slate-700 stroke-[1.5]" />
            <p className="text-xs font-semibold text-slate-400">
              {logs.length === 0 ? 'No device logcat streams received yet.' : 'No logs match the active filter criteria.'}
            </p>
            <p className="text-[10.5px] text-slate-600 max-w-sm text-center">
              {logs.length === 0 
                ? 'Device system events, Appium logs, and AndroidRuntime traces will appear here in real time during test runs.'
                : `Try resetting the search query or level filters to view all ${logs.length} captured lines.`}
            </p>
            {logs.length > 0 && (
              <button
                onClick={() => {
                  setSelectedLevel('ALL');
                  setSelectedTag('ALL');
                  setSearchQuery('');
                }}
                className="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded-lg transition-all"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            const isWarningOrError = log.level === 'W' || log.level === 'E' || log.level === 'F';
            return (
              <div
                key={log.id || `log-${index}`}
                onClick={() => setSelectedLog(log)}
                className={`group flex items-start gap-2.5 px-2 py-1 rounded-lg transition-all cursor-pointer hover:bg-slate-900/90 ${
                  isWarningOrError 
                    ? log.level === 'E' || log.level === 'F' ? 'bg-rose-950/20 border-l-2 border-rose-500' : 'bg-amber-950/15 border-l-2 border-amber-500'
                    : 'hover:bg-slate-900/60'
                }`}
              >
                {/* Timestamp */}
                <span className="text-slate-500 shrink-0 select-none text-[10px] pt-0.5">
                  {log.timestamp}
                </span>

                {/* Level Badge */}
                <span className="shrink-0 pt-0.5">
                  {getLevelBadge(log.level)}
                </span>

                {/* PID/TID */}
                {(log.pid || log.tid) && (
                  <span className="text-slate-600 text-[10px] shrink-0 pt-0.5 hidden sm:inline">
                    {log.pid || 1920}:{log.tid || 1920}
                  </span>
                )}

                {/* Tag */}
                <span className="text-indigo-400 font-bold shrink-0 max-w-[130px] truncate pt-0.5 text-[10.5px]">
                  {log.tag}:
                </span>

                {/* Message Body */}
                <span className={`flex-1 text-[11px] leading-relaxed ${getMessageColor(log.level)} ${
                  wrapText ? 'break-words' : 'whitespace-pre-wrap truncate'
                }`}>
                  {log.message}
                </span>

                {/* Quick copy on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(log.message);
                    toast.success("Log line copied to clipboard!");
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-slate-300 transition-all shrink-0"
                  title="Copy this line"
                >
                  <Copy size={11} />
                </button>
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Bottom Summary & Status Bar */}
      <div className="px-4 py-2 bg-slate-900/95 border-t border-slate-800 text-[11px] flex flex-wrap items-center justify-between gap-3 text-slate-400 font-mono">
        <div className="flex items-center gap-4">
          <span>Total: <strong className="text-white">{logs.length}</strong> lines</span>
          <span>Showing: <strong className="text-indigo-400">{filteredLogs.length}</strong></span>
          {stats.E > 0 && (
            <span className="text-rose-400 font-bold flex items-center gap-1">
              <AlertCircle size={12} /> {stats.E} Errors
            </span>
          )}
          {stats.W > 0 && (
            <span className="text-amber-400 font-bold flex items-center gap-1">
              <AlertTriangle size={12} /> {stats.W} Warnings
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 text-[10.5px]">
          <span className="text-slate-500">Log Format: <strong className="text-slate-300">ADB Logcat (v-time)</strong></span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
      </div>

      {/* Log Detail Drawer / Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  <Terminal size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white flex items-center gap-2">
                    Device Log Details
                    {getLevelBadge(selectedLog.level)}
                  </h4>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Tag: <span className="text-indigo-300">{selectedLog.tag}</span> | Time: {selectedLog.timestamp}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 text-[10px] block">LEVEL</span>
                <strong className="text-white">{selectedLog.level}</strong>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 text-[10px] block">PID / TID</span>
                <strong className="text-white">{selectedLog.pid || 1920} : {selectedLog.tid || 1920}</strong>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 text-[10px] block">DEVICE</span>
                <strong className="text-white truncate block">{selectedLog.deviceId || deviceId}</strong>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-slate-500 text-[10px] block">TIMESTAMP</span>
                <strong className="text-white">{selectedLog.timestamp}</strong>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Full Message Payload / Stack Trace
              </label>
              <pre className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap break-words max-h-60 overflow-y-auto custom-scrollbar">
                {selectedLog.message}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `[${selectedLog.timestamp}] [${selectedLog.level}] [${selectedLog.tag}] (PID: ${selectedLog.pid || 1920}): ${selectedLog.message}`
                  );
                  toast.success("Formatted log entry copied!");
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
              >
                <Copy size={13} /> Copy Formatted Entry
              </button>
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
