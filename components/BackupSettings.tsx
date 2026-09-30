import React, { useState, useEffect } from 'react';
import { 
  Database, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  Server, 
  HardDrive, 
  PlayCircle, 
  Sliders, 
  ShieldCheck, 
  AlertCircle, 
  Check, 
  Activity,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import { configureBackupDb, toggleBackupMode, useBackup, db, backupDb } from '../firebase';
import { getDocFromServer, doc } from 'firebase/firestore';

interface ReplicationStats {
  status: string;
  auth?: {
    synced: number;
    created: number;
    errors: number;
  };
  firestore?: {
    totalCollections: number;
    totalDocsSynced: number;
    status?: string;
  };
  timestamp?: string;
  message?: string;
}

export const BackupSettings: React.FC = () => {
  const [backupDatabaseId, setBackupDatabaseId] = useState(() => {
    return localStorage.getItem('automatiqa_backup_database_id') || 'automatiqa-backup';
  });
  const [enableClientSync, setEnableClientSync] = useState(() => {
    return localStorage.getItem('automatiqa_enable_client_sync') === 'true';
  });
  const [isFailoverActive, setIsFailoverActive] = useState(() => {
    return useBackup;
  });

  const [syncLoading, setSyncLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [mainDbStatus, setMainDbStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [backupDbStatus, setBackupDbStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [replicationStats, setReplicationStats] = useState<ReplicationStats | null>(null);

  // Load last replication result from localStorage if present
  useEffect(() => {
    const saved = localStorage.getItem('automatiqa_last_replication_stats');
    if (saved) {
      try {
        setReplicationStats(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const handleSaveConfig = () => {
    try {
      localStorage.setItem('automatiqa_enable_client_sync', String(enableClientSync));
      
      if (enableClientSync) {
        configureBackupDb(backupDatabaseId);
      } else {
        configureBackupDb(null); // revert to mainDb
      }
      
      toast.success('Client backup synchronization settings saved successfully!');
    } catch (err: any) {
      toast.error(`Error saving backup configuration: ${err?.message || String(err)}`);
    }
  };

  const handleToggleFailover = () => {
    const nextState = !isFailoverActive;
    toggleBackupMode(nextState);
    setIsFailoverActive(nextState);
    if (nextState) {
      toast.success('Failover activated! App is now operating directly on the Backup Database.');
    } else {
      toast.info('Failover deactivated! App returned to the Original Database.');
    }
  };

  const handleTriggerReplication = async () => {
    setSyncLoading(true);
    try {
      const res = await fetch('/api/admin/sync-backup-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      
      if (data && (data.status === 'success' || data.status === 'already_running')) {
        setReplicationStats(data);
        localStorage.setItem('automatiqa_last_replication_stats', JSON.stringify(data));
        
        if (data.status === 'already_running') {
          toast.warning('A replication routine is already in progress on the server.');
        } else {
          toast.success('Server-side database backup synchronization completed successfully!');
        }
      } else {
        toast.error(data.message || 'Failed to complete server backup synchronization.');
      }
    } catch (err) {
      toast.error('Network error during backup synchronization request.');
    } finally {
      setSyncLoading(false);
    }
  };

  const testConnections = async () => {
    setTestLoading(true);
    setMainDbStatus('idle');
    setBackupDbStatus('idle');

    // Test Main Database connection
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      setMainDbStatus('success');
    } catch (err: any) {
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        setMainDbStatus('success'); // accessible but permission restricted, still online
      } else {
        setMainDbStatus('failed');
      }
    }

    // Test Backup Database connection
    try {
      await getDocFromServer(doc(backupDb, 'test', 'connection'));
      setBackupDbStatus('success');
    } catch (err: any) {
      if (err.code === 'permission-denied' || err.message?.includes('Missing or insufficient permissions')) {
        setBackupDbStatus('success');
      } else {
        setBackupDbStatus('failed');
      }
    }

    setTestLoading(false);
    toast.success('Connection health check completed.');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-emerald-900 via-emerald-800 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-emerald-700/50">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-500/30 rounded-lg text-emerald-300">
              <Database size={24} className="text-emerald-400 fill-emerald-400" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">Database Backup & Synchronization</h1>
          </div>
          <p className="text-emerald-200 text-sm max-w-2xl">
            Configure real-time client mirroring, trigger multi-database replications, and execute seamless disaster recovery failover settings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={testConnections}
            disabled={testLoading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700/50 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium border border-emerald-500/30 transition-all disabled:opacity-50"
          >
            <RefreshCw size={16} className={testLoading ? 'animate-spin' : ''} />
            Test Health Check
          </button>
          <button
            onClick={handleTriggerReplication}
            disabled={syncLoading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-900 rounded-xl text-sm font-extrabold shadow transition-all disabled:opacity-50"
          >
            <PlayCircle size={16} />
            Sync Main to Backup
          </button>
        </div>
      </div>

      {/* Connection Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Database Card */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Original Database</span>
            <Server size={18} className="text-indigo-600" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 truncate">Main Firestore Instance</h3>
            <p className="text-xs text-slate-400 font-mono truncate">ID: {backupDatabaseId === 'automatiqa-backup' ? '(default)' : 'Primary Prod'}</p>
          </div>
          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Status</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              mainDbStatus === 'success' 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : mainDbStatus === 'failed'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-slate-50 text-slate-500 border border-slate-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${mainDbStatus === 'success' ? 'bg-emerald-500 animate-pulse' : mainDbStatus === 'failed' ? 'bg-rose-500' : 'bg-slate-400'}`} />
              {mainDbStatus === 'success' ? 'Online' : mainDbStatus === 'failed' ? 'Connection Error' : 'Idle'}
            </span>
          </div>
        </div>

        {/* Sync Status Pathway */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Synchronization Flow</span>
            <Activity size={18} className="text-emerald-500" />
          </div>
          
          <div className="flex items-center justify-center gap-3 my-2 text-slate-400">
            <div className="text-center">
              <span className="text-xs font-bold text-indigo-600">Main</span>
            </div>
            <ArrowRight size={24} className="text-emerald-500 animate-pulse" />
            <div className="text-center">
              <span className="text-xs font-bold text-emerald-600">Backup</span>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Mode</span>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
              Bi-directional (Admin + Client)
            </span>
          </div>
        </div>

        {/* Backup Database Card */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Backup Database</span>
            <HardDrive size={18} className="text-emerald-600" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 truncate">Mirror Instance</h3>
            <p className="text-xs text-slate-400 font-mono truncate">ID: {backupDatabaseId}</p>
          </div>
          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Status</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              backupDbStatus === 'success' 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : backupDbStatus === 'failed'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-slate-50 text-slate-500 border border-slate-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${backupDbStatus === 'success' ? 'bg-emerald-500 animate-pulse' : backupDbStatus === 'failed' ? 'bg-rose-500' : 'bg-slate-400'}`} />
              {backupDbStatus === 'success' ? 'Online' : backupDbStatus === 'failed' ? 'Connection Error' : 'Idle'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mirror Settings Configuration Panel */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="p-2 bg-slate-100 rounded-lg text-slate-600">
              <Sliders size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Mirror & Real-Time Sync Settings</h2>
              <p className="text-xs text-slate-500">Configure client-side real-time mirroring parameters.</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Enable Client Mirroring Toggle */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
              <div className="space-y-1">
                <label className="text-sm font-bold text-slate-800">Enable Client-Side Real-Time Mirroring</label>
                <p className="text-xs text-slate-500 leading-relaxed">
                  When enabled, all writes (create, update, delete) made from the web application are written synchronously to BOTH databases to prevent data discrepancy in real-time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnableClientSync(!enableClientSync)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  enableClientSync ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span className="sr-only">Enable client sync</span>
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    enableClientSync ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Backup Database ID Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Backup Firestore Database ID</label>
              <input
                type="text"
                disabled={!enableClientSync}
                value={backupDatabaseId}
                onChange={(e) => setBackupDatabaseId(e.target.value)}
                placeholder="e.g. automatiqa-backup"
                className="w-full px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:bg-white transition-all disabled:opacity-50"
              />
              <p className="text-xs text-slate-400 leading-relaxed">
                Typically configured to a secondary database instance inside the same Google Cloud Firebase project (e.g. standard multi-database setup).
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSaveConfig}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow transition-all"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>

        {/* Disaster Recovery & Active Failover Panel */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <ShieldCheck size={20} className="text-rose-600" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-rose-900">Disaster Recovery & Active Failover</h2>
              <p className="text-xs text-slate-500">Activate failover routines if the main database suffers an outage.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex gap-3 text-rose-800">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5 text-rose-600" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold">Activating failover is an instantaneous override!</h4>
                <p className="text-xs leading-relaxed text-rose-700">
                  Activating failover changes the single source of truth for standard operations directly to the Backup Database instance. Turn off failover to restore original primary operations.
                </p>
              </div>
            </div>

            {/* Failover Status Box */}
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Failover State</span>
                <p className={`text-sm font-extrabold ${isFailoverActive ? 'text-rose-600' : 'text-slate-700'}`}>
                  {isFailoverActive ? 'ACTIVE (Operating on Backup)' : 'STANDBY (Operating on Main)'}
                </p>
              </div>

              <button
                onClick={handleToggleFailover}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold shadow transition-all ${
                  isFailoverActive 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                }`}
              >
                {isFailoverActive ? 'Deactivate Failover' : 'Activate Failover'}
              </button>
            </div>

            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 space-y-1">
              <span className="text-xs font-bold text-slate-600">Recovery Status Log</span>
              <div className="space-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Real-time local state engine replication: Standby</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Server-side background replication cron: Active (every 60m)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sync Status / Replication History */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-slate-100 rounded-lg text-slate-600">
              <Clock size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Last Replication Execution Logs</h2>
              <p className="text-xs text-slate-500">Details of the last server-side full synchronization run.</p>
            </div>
          </div>
          {replicationStats?.timestamp && (
            <span className="text-xs text-slate-400 font-mono">
              Timestamp: {new Date(replicationStats.timestamp).toLocaleString()}
            </span>
          )}
        </div>

        {replicationStats ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Auth Users Sync Summary */}
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Auth Users Replication</span>
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                  Firebase Auth
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-white rounded-lg border border-slate-100">
                  <span className="block text-slate-400">Updated</span>
                  <span className="text-lg font-extrabold text-indigo-600">{replicationStats.auth?.synced ?? 0}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-100">
                  <span className="block text-slate-400">Created</span>
                  <span className="text-lg font-extrabold text-emerald-600">{replicationStats.auth?.created ?? 0}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-100">
                  <span className="block text-slate-400">Errors</span>
                  <span className="text-lg font-extrabold text-rose-600">{replicationStats.auth?.errors ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Firestore Collections Sync Summary */}
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Firestore Collections Replication</span>
                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                  NoSQL Data
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center text-xs">
                <div className="p-2 bg-white rounded-lg border border-slate-100">
                  <span className="block text-slate-400">Collections Processed</span>
                  <span className="text-lg font-extrabold text-slate-800">{replicationStats.firestore?.totalCollections ?? 0}</span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-slate-100">
                  <span className="block text-slate-400">Documents Processed</span>
                  <span className="text-lg font-extrabold text-emerald-600">{replicationStats.firestore?.totalDocsSynced ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <p className="text-sm text-slate-500 font-medium">No replication history found.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Sync Main to Backup" or run "Test Health Check" to fetch sync logs.</p>
          </div>
        )}
      </div>
    </div>
  );
};
