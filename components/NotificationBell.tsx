import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, 
  UserPlus, 
  ShieldCheck, 
  FolderPlus, 
  UserCheck, 
  Zap, 
  Trash2, 
  CheckCheck, 
  Clock, 
  X, 
  CheckCircle2,
  Sparkles,
  Inbox,
  AlertCircle
} from 'lucide-react';
import { AppNotification, NotificationType } from '../types';
import { 
  markAsRead, 
  markAllNotificationsAsRead, 
  deleteNotification, 
  deleteAllNotifications, 
  autoDeleteOldNotifications 
} from '../services/notificationService';

interface NotificationBellProps {
  notifications: AppNotification[];
  userEmail: string;
  isAdmin?: boolean;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ notifications, userEmail, isAdmin = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | NotificationType>('ALL');
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Run auto-delete cleanup when notifications load
  useEffect(() => {
    if (userEmail) {
      autoDeleteOldNotifications(userEmail);
    }
  }, [userEmail, notifications.length]);

  const displayNotifications = notifications;

  const unreadCount = displayNotifications.filter(n => !n.isRead).length;

  const filteredNotifications = displayNotifications.filter(n => {
    if (filter === 'ALL') return true;
    return n.type === filter;
  });

  const handleMarkAsRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await markAsRead(id);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead(userEmail);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteNotification(id);
  };

  const handleDeleteAll = async () => {
    if (notifications.length === 0) return;
    if (window.confirm('Are you sure you want to delete all notifications? This action cannot be undone.')) {
      setIsDeletingAll(true);
      await deleteAllNotifications(userEmail);
      setIsDeletingAll(false);
    }
  };

  const handleTriggerAutoDelete = async () => {
    setIsCleaning(true);
    await autoDeleteOldNotifications(userEmail, 0.01); // Instant auto-purge read/old
    setTimeout(() => setIsCleaning(false), 800);
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.USER_SIGNUP:
        return <UserPlus size={16} className="text-blue-600" />;
      case NotificationType.ROLE_UPDATE:
        return <ShieldCheck size={16} className="text-purple-600" />;
      case NotificationType.PROJECT_CREATION:
        return <FolderPlus size={16} className="text-emerald-600" />;
      case NotificationType.PROJECT_ASSIGNMENT:
        return <UserCheck size={16} className="text-amber-600" />;
      default:
        return <Zap size={16} className="text-indigo-600" />;
    }
  };

  const getTypeBadgeStyle = (type: NotificationType) => {
    switch (type) {
      case NotificationType.USER_SIGNUP:
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case NotificationType.ROLE_UPDATE:
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case NotificationType.PROJECT_CREATION:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case NotificationType.PROJECT_ASSIGNMENT:
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
  };

  const getTypeLabel = (type: NotificationType) => {
    switch (type) {
      case NotificationType.USER_SIGNUP:
        return 'User Signup';
      case NotificationType.ROLE_UPDATE:
        return 'Role Update';
      case NotificationType.PROJECT_CREATION:
        return 'Project Creation';
      case NotificationType.PROJECT_ASSIGNMENT:
        return 'Project Allocation';
      default:
        return 'System Alert';
    }
  };

  const formatTime = (isoString: string) => {
    if (!isoString) return 'Just now';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        className={`p-3 rounded-2xl transition-all relative flex items-center justify-center border ${
          isOpen 
            ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm' 
            : 'bg-white/80 hover:bg-white border-slate-200 text-slate-700 hover:text-indigo-600 shadow-sm hover:shadow'
        }`}
      >
        <Bell size={20} className={unreadCount > 0 ? 'text-indigo-600 animate-pulse' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-md animate-in zoom-in-50">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      
      {/* Notifications Dropdown Drawer */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-3 w-96 sm:w-[420px] bg-white border border-slate-200 rounded-[2rem] shadow-2xl z-[1000] overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200">
          
          {/* Header Bar */}
          <div className="p-5 border-b border-slate-100 bg-slate-50/80 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-200">
                  <Inbox size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-tight text-slate-800">Notifications</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {unreadCount} Unread Alert{unreadCount === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button 
                    onClick={handleMarkAllRead}
                    title="Mark all as read"
                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all text-xs font-bold flex items-center gap-1"
                  >
                    <CheckCheck size={16} />
                    <span className="hidden sm:inline text-[10px] uppercase font-black tracking-wider">Read All</span>
                  </button>
                )}

                {notifications.length > 0 && (
                  <button 
                    onClick={handleDeleteAll}
                    disabled={isDeletingAll}
                    title="Delete all notifications"
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all text-xs font-bold flex items-center gap-1"
                  >
                    <Trash2 size={16} />
                    <span className="hidden sm:inline text-[10px] uppercase font-black tracking-wider text-rose-500">Clear</span>
                  </button>
                )}

                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pt-1 pb-0.5">
              {[
                { id: 'ALL', label: 'All' },
                { id: NotificationType.USER_SIGNUP, label: 'Signups' },
                { id: NotificationType.ROLE_UPDATE, label: 'Roles' },
                { id: NotificationType.PROJECT_CREATION, label: 'Projects' },
                { id: NotificationType.PROJECT_ASSIGNMENT, label: 'Allocations' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
                    filter === tab.id 
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm' 
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notification Cards List */}
          <div className="max-h-[380px] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
            {filteredNotifications.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-300 mx-auto mb-3 shadow-inner">
                  <Bell size={28} />
                </div>
                <p className="text-xs font-black uppercase text-slate-400 tracking-widest mb-1">
                  {filter === 'ALL' ? 'No Notifications' : 'No alerts in this category'}
                </p>
                <p className="text-[11px] text-slate-400 font-medium">
                  {filter === 'ALL' ? 'You are completely caught up!' : 'Select "All" to view other alerts.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((note) => (
                <div 
                  key={note.id} 
                  onClick={async () => {
                    if (!note.isRead) await markAsRead(note.id);
                  }}
                  className={`p-4 border-b border-slate-100 cursor-pointer transition-all hover:bg-slate-50/80 group relative ${
                    !note.isRead ? 'bg-indigo-50/30' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Event Type Icon */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border shadow-xs mt-0.5 ${getTypeBadgeStyle(note.type)}`}>
                      {getNotificationIcon(note.type)}
                    </div>

                    {/* Content Details */}
                    <div className="flex-1 min-w-0 pr-12">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${getTypeBadgeStyle(note.type)}`}>
                          {getTypeLabel(note.type)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                          <Clock size={10} />
                          {formatTime(note.timestamp)}
                        </span>
                      </div>

                      <h5 className={`text-xs font-extrabold tracking-tight ${!note.isRead ? 'text-slate-900 font-black' : 'text-slate-700'}`}>
                        {note.title}
                      </h5>

                      <p className="text-[11px] text-slate-600 font-medium leading-relaxed mt-1">
                        {note.message}
                      </p>

                      <div className="flex items-center justify-between mt-2 pt-1">
                        <span className="text-[9px] font-semibold text-slate-400">
                          By {note.senderName || 'System'}
                        </span>

                        {!note.isRead && (
                          <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                            Unread
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons: Mark Read & Delete */}
                    <div className="absolute right-3 top-4 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      {!note.isRead && (
                        <button
                          onClick={(e) => handleMarkAsRead(e, note.id)}
                          title="Mark as read"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                          <CheckCircle2 size={15} />
                        </button>
                      )}

                      <button
                        onClick={(e) => handleDelete(e, note.id)}
                        title="Delete notification"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Bar with Auto-Delete Info & Trigger */}
          <div className="p-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 text-slate-400 font-bold">
              <Sparkles size={12} className="text-amber-500" />
              <span>Auto-cleanup active (Read & Old alerts)</span>
            </div>

            <button 
              onClick={handleTriggerAutoDelete}
              disabled={isCleaning}
              className="px-2.5 py-1 bg-white hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg font-bold text-[9px] uppercase tracking-wider transition-all"
            >
              {isCleaning ? 'Cleaning...' : 'Clean Now'}
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
