
import React, { useState, useMemo, useEffect } from 'react';
import { Project, User, UserRole, NotificationType } from '../types';
import { saveProject, allocateProject, deleteProject, updateProjectFirestore } from "../services/projectService";
import { logActivity } from "../services/activityService";
import { createNotification, notifyAdmins } from "../services/notificationService";

import { 
  FolderPlus, 
  Pencil, 
  Trash2, 
  Calendar, 
  Layout, 
  AlertTriangle, 
  X, 
  UserPlus, 
  Shield, 
  Check, 
  Mail, 
  ChevronDown,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  MoreVertical,
  Lock,
  Users
} from 'lucide-react';

interface ProjectListProps {
  user: User;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  onSelectProject: (id: string) => void;
}

const getAllocatedEmails = (allocated: any): string[] => {
  if (Array.isArray(allocated)) return allocated.filter((e): e is string => typeof e === 'string');
  if (allocated && typeof allocated === 'object') return Object.keys(allocated).filter(e => typeof e === 'string');
  return [];
};

const ProjectList: React.FC<ProjectListProps> = ({ user, projects, onSelectProject }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isAllocating, setIsAllocating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStatus, setNewStatus] = useState<'Active' | 'Inactive' | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Inactive'>('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const projectsPerPage = 15;

  // Edit State
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStatus, setEditStatus] = useState<'Active' | 'Inactive' | ''>('');

  // Delete State
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [allocationForm, setAllocationForm] = useState({ projectId: '', inviteEmail: '' });
  const [allocationError, setAllocationError] = useState('');
  const [allocationSuccess, setAllocationSuccess] = useState('');

  const [viewingMembersProject, setViewingMembersProject] = useState<Project | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'Admin' | 'Team Member'>('Team Member');
  const [isProcessingMember, setIsProcessingMember] = useState(false);
  const [memberError, setMemberError] = useState('');

  const isProjectAdmin = (project: Project, email: string): boolean => {
    const userRoleLower = (user.role as string | undefined)?.toLowerCase().trim();
    if (user.role === UserRole.SUPER_ADMIN || userRoleLower === 'super admin') return true;
    const emailLower = email.toLowerCase().trim();
    if (project.ownerEmail?.toLowerCase().trim() === emailLower) return true;
    const projRole = project.projectRoles?.[emailLower];
    if (projRole === 'Admin') return true;
    if (projRole === 'Team Member') return false;
    if (user.role === UserRole.ADMIN || userRoleLower === 'admin' || user.role === UserRole.DELIVERY_MANAGER) return true;
    return false;
  };

  const userRoleStr = (user.role as string | undefined)?.toLowerCase().trim();
  const isTeamMemberRole = user.role === UserRole.TEAM_MEMBER || userRoleStr === 'team member';
  const isAdminRole = user.role === UserRole.ADMIN || userRoleStr === 'admin';

  const canCreateProject = user.role === UserRole.SUPER_ADMIN || userRoleStr === 'super admin';

  const handleAddMemberToProject = async () => {
    if (!viewingMembersProject || !newMemberEmail.trim()) return;
    setMemberError('');
    setIsProcessingMember(true);
    const email = newMemberEmail.trim().toLowerCase();

    try {
      await allocateProject(viewingMembersProject.id, email, newMemberRole);
      
      const currentRoles = viewingMembersProject.projectRoles || {};
      const updatedRoles = { ...currentRoles, [email]: newMemberRole };
      const currentAllocated = getAllocatedEmails(viewingMembersProject.allocatedUserEmails);
      const updatedAllocated = currentAllocated.some(e => e.toLowerCase().trim() === email) ? currentAllocated : [...currentAllocated, email];
      
      const updatedProj = {
        ...viewingMembersProject,
        allocatedUserEmails: updatedAllocated,
        projectRoles: updatedRoles
      };

      await createNotification({
        recipientEmail: email,
        senderName: user.name,
        type: NotificationType.PROJECT_ASSIGNMENT,
        title: 'Project Allocated',
        message: `You have been allocated to project '${viewingMembersProject.name}' as ${newMemberRole}.`,
        projectId: viewingMembersProject.id
      });

      setViewingMembersProject(updatedProj);
      setNewMemberEmail('');
    } catch (err) {
      console.error(err);
      setMemberError('Failed to add member to project');
    } finally {
      setIsProcessingMember(false);
    }
  };

  const handleUpdateMemberRole = async (memberEmail: string, role: 'Admin' | 'Team Member') => {
    if (!viewingMembersProject) return;
    const emailLower = memberEmail.toLowerCase().trim();
    try {
      const currentRoles = viewingMembersProject.projectRoles || {};
      const updatedRoles = { ...currentRoles, [emailLower]: role };
      
      const updatedProj = {
        ...viewingMembersProject,
        projectRoles: updatedRoles
      };

      await updateProjectFirestore(viewingMembersProject.id, updatedProj);

      await createNotification({
        recipientEmail: emailLower,
        senderName: user.name,
        type: NotificationType.ROLE_UPDATE,
        title: 'Project Role Updated',
        message: `Your role in project '${viewingMembersProject.name}' has been updated to ${role}.`,
        projectId: viewingMembersProject.id
      });

      setViewingMembersProject(updatedProj);
    } catch (err) {
      console.error(err);
      alert('Failed to update member role');
    }
  };

  const handleRemoveMemberFromProject = async (memberEmail: string) => {
    if (!viewingMembersProject) return;
    const emailLower = memberEmail.toLowerCase().trim();
    if (emailLower === viewingMembersProject.ownerEmail.toLowerCase()) {
      alert("Cannot remove the project owner.");
      return;
    }
    try {
      const currentRoles = { ...(viewingMembersProject.projectRoles || {}) };
      delete currentRoles[emailLower];
      
      const currentAllocated = getAllocatedEmails(viewingMembersProject.allocatedUserEmails);
      const updatedAllocated = currentAllocated.filter(e => e.toLowerCase().trim() !== emailLower);

      const updatedProj = {
        ...viewingMembersProject,
        allocatedUserEmails: updatedAllocated,
        projectRoles: currentRoles
      };

      await updateProjectFirestore(viewingMembersProject.id, updatedProj);
      setViewingMembersProject(updatedProj);
    } catch (err) {
      console.error(err);
      alert('Failed to remove member');
    }
  };

  const visibleProjects = useMemo(() => {
    return projects.map(p => {
      const pAny = p as any;
      if (pAny && pAny.data && typeof pAny.data === 'object' && p.name === undefined) {
        return { id: p.id, ...pAny.data } as Project;
      }
      return p;
    }).filter(p => {
      const pName = (p.name || (p as any).data?.name || '').toString();
      const pDesc = (p.description || (p as any).data?.description || '').toString();
      const matchesStatus = statusFilter === 'all' || (p.status || 'Active') === statusFilter;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch = !query || 
        pName.toLowerCase().includes(query) || 
        pDesc.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [projects, searchQuery, statusFilter]);

  const ownedProjects = useMemo(() => {
    if (user.role === UserRole.SUPER_ADMIN) return projects;
    return projects.filter(p => isProjectAdmin(p, user.email));
  }, [projects, user.email, user.role]);

  const totalPages = Math.ceil(visibleProjects.length / projectsPerPage);
  
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * projectsPerPage;
    return visibleProjects.slice(startIndex, startIndex + projectsPerPage);
  }, [visibleProjects, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const handleOpenAdd = () => {
    if (!canCreateProject) return;
    setNewName('');
    setNewDesc('');
    setNewStatus('');
    setIsAdding(true);
  };

  const addProject = async () => {
    if (!canCreateProject || !newName.trim() || !newStatus) return;
    setIsProcessing(true);
    try {
      const newProjectId = await saveProject({
        name: newName,
        description: newDesc,
        status: newStatus as 'Active' | 'Inactive',
        ownerEmail: user.email,
        ownerName: user.name,
        allocatedUserEmails: [user.email]
      });

      await logActivity(user.email, user.name, `Created new project: ${newName}`, newProjectId, newName);

      await createNotification({
        recipientEmail: user.email,
        senderName: user.name,
        type: NotificationType.PROJECT_CREATION,
        title: 'Project Created',
        message: `New project '${newName}' was created successfully.`,
        projectId: newProjectId
      });

      await notifyAdmins(
        'Project Creation Alert',
        `New project '${newName}' was created by ${user.name} (${user.email}).`,
        user.name,
        NotificationType.PROJECT_CREATION
      );

      setNewName('');
      setNewDesc('');
      setNewStatus('');
      setIsAdding(false);
    } catch (err) {
      console.error(err);
      alert('Failed to create project');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenEdit = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditingProject(project);
    setEditName(project.name);
    setEditDesc(project.description);
    setEditStatus(project.status);
  };

  const handleSaveEdit = async () => {
    if (!editingProject || !editName.trim() || !editStatus) return;
    setIsProcessing(true);
    try {
      await updateProjectFirestore(editingProject.id, {
        ...editingProject,
        name: editName,
        description: editDesc,
        status: editStatus as 'Active' | 'Inactive'
      });
      setEditingProject(null);
    } catch (err) {
      console.error(err);
      alert('Failed to update project');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOpenDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setDeletingProjectId(projectId);
  };

  const handleConfirmDelete = async () => {
    if (!deletingProjectId) return;
    const targetProj = projects.find(p => p.id === deletingProjectId);
    if (targetProj && user.role !== UserRole.SUPER_ADMIN && targetProj.ownerEmail?.toLowerCase().trim() !== user.email.toLowerCase().trim()) {
      alert("Only the project owner or Super Admin can delete this project.");
      setDeletingProjectId(null);
      return;
    }
    setIsProcessing(true);
    try {
      await deleteProject(deletingProjectId);
      setDeletingProjectId(null);
    } catch (err) {
      console.error(err);
      alert('Failed to delete project');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAllocate = async () => {
    setAllocationError('');
    setAllocationSuccess('');

    const email = allocationForm.inviteEmail.trim().toLowerCase();

    if (!allocationForm.projectId || !email) {
      setAllocationError('Select project and valid email');
      return;
    }

    try {
      await allocateProject(allocationForm.projectId, email);
      setAllocationSuccess(`Project allocated to ${email}`);
      setTimeout(() => {
        setIsAllocating(false);
        setAllocationForm({ projectId: '', inviteEmail: '' });
        setAllocationSuccess('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setAllocationError('Allocation failed');
    }
  };

  const isAdmin = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
  const isDeliveryManager = user.role === UserRole.DELIVERY_MANAGER;
  const isElevatedUser = isAdmin || isDeliveryManager;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">

      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-6 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-black text-black uppercase tracking-tight">Projects</h2>
          <p className="text-sm text-slate-500 font-medium">
            {isElevatedUser ? 'Manage all platform projects' : 'View and manage your assigned projects'}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative group min-w-[160px]">
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={16} />
            <select 
              value={statusFilter || ''}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full pl-11 pr-10 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest outline-none focus:bg-white focus:ring-4 ring-indigo-50/50 appearance-none cursor-pointer transition-all shadow-inner"
            >
              <option value="all">All Status</option>
              <option value="Active">Active Only</option>
              <option value="Inactive">Inactive Only</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
          </div>

          <div className="relative group min-w-[280px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search projects..." 
              value={searchQuery || ''}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-6 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:bg-white focus:ring-4 ring-indigo-50/50 outline-none transition-all shadow-inner"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Buttons restricted to users with project creation / admin privileges */}
          <div className="flex gap-3">
            {(user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN || user.role === UserRole.DELIVERY_MANAGER) && (
              <button 
                onClick={() => setIsAllocating(true)}
                className="flex items-center gap-2 bg-white text-indigo-600 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest border border-indigo-100 hover:bg-indigo-50 transition-all shadow-sm"
              >
                <UserPlus size={18} />
                Allocate
              </button>
            )}
            {canCreateProject && (
              <button 
                onClick={handleOpenAdd}
                className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                <FolderPlus size={18} />
                New Project
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PROJECT LIST VIEW */}
      <div className="flex flex-col gap-4">
        {paginatedProjects.length === 0 ? (
          <div className="py-32 text-center bg-slate-50 rounded-[3rem] border-2 border-dashed border-slate-200">
            <Layout size={64} className="text-slate-200 mx-auto mb-4" />
            <p className="text-slate-400 font-black uppercase text-xs tracking-widest">
              {searchQuery || statusFilter !== 'all' ? `No projects match your filters` : 'No assigned projects found.'}
            </p>
          </div>
        ) : (
          paginatedProjects.map(project => (
            <div 
              key={project.id} 
              className="group bg-white p-5 rounded-[1.8rem] border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all cursor-pointer flex items-center gap-6"
              onClick={() => onSelectProject(project.id)}
            >
              <div className="p-3.5 bg-indigo-50 rounded-2xl text-indigo-600 shadow-sm flex-shrink-0">
                <Layout size={24} />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-black uppercase tracking-tight mb-0.5 truncate group-hover:text-indigo-600 transition-colors">
                  {project.name || (project as any).data?.name || 'UNTITLED PROJECT'}
                </h3>
                <p className="text-sm text-slate-500 font-medium truncate max-w-2xl leading-relaxed">
                  {project.description || (project as any).data?.description || 'No description provided for this project.'}
                </p>
              </div>

              <div className="hidden sm:flex w-24 flex-shrink-0">
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${project.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  {project.status || (project as any).data?.status || 'Active'}
                </span>
              </div>

              <div className="hidden lg:flex flex-col w-44 flex-shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400">
                {(() => {
                  const ownerName = project.ownerName || (project as any).data?.ownerName;
                  const ownerEmail = project.ownerEmail || (project as any).data?.ownerEmail;
                  const ownerDisplay = ownerName || (ownerEmail ? ownerEmail.split('@')[0] : 'System');
                  const isOwnedByCurrentUser = ownerEmail && user.email && ownerEmail.toLowerCase().trim() === user.email.toLowerCase().trim();
                  return (
                    <div className="flex items-center gap-2 mb-1.5 truncate">
                      <Shield size={12} className={isOwnedByCurrentUser ? 'text-emerald-500' : 'text-indigo-500'} />
                      <span className="truncate">{isOwnedByCurrentUser ? 'Owned by you' : `By ${ownerDisplay}`}</span>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2 opacity-70">
                  <Calendar size={12} />
                  <span>{(() => {
                    if (!project.createdAt) return 'N/A';
                    let date: Date;
                    if (typeof (project.createdAt as any).toDate === 'function') {
                      date = (project.createdAt as any).toDate();
                    } else if (project.createdAt && typeof (project.createdAt as any).seconds === 'number') {
                      // Handle plain object from JSON serialization
                      date = new Date((project.createdAt as any).seconds * 1000);
                    } else {
                      date = new Date(project.createdAt);
                    }
                    return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString();
                  })()}</span>
                </div>
              </div>

              {/* Members/Roles Button (Accessible to all members) */}
              <div className="flex items-center flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewingMembersProject(project);
                  }}
                  className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-all cursor-pointer shadow-sm mr-2"
                  title="View & Manage Members & Roles"
                >
                  <Users size={16} />
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {(() => {
                      const emails = getAllocatedEmails(project.allocatedUserEmails);
                      const otherMembersCount = emails.filter(e => e.toLowerCase().trim() !== project.ownerEmail?.toLowerCase().trim()).length;
                      return isAdminRole ? otherMembersCount : (1 + otherMembersCount);
                    })()} Members
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {isProjectAdmin(project, user.email) ? (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={(e) => handleOpenEdit(e, project)}
                      className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-transparent hover:border-indigo-100"
                      title="Edit Project"
                    >
                      <Pencil size={18} />
                    </button>
                    {(user.role === UserRole.SUPER_ADMIN || project.ownerEmail?.toLowerCase().trim() === user.email.toLowerCase().trim()) && (
                      <button 
                        onClick={(e) => handleOpenDelete(e, project.id)}
                        className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                        title="Delete Project"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="p-2.5 text-slate-200">
                    <MoreVertical size={18} />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col md:flex-row items-center justify-between bg-white px-8 py-6 rounded-[2rem] border border-slate-200 shadow-sm gap-4">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
             Showing {((currentPage - 1) * projectsPerPage) + 1} - {Math.min(currentPage * projectsPerPage, visibleProjects.length)} of {visibleProjects.length} Projects
           </p>
           <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-white hover:border-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Previous Page"
              >
                <ChevronLeft size={20} />
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  if (totalPages > 5) {
                    if (pageNum !== 1 && pageNum !== totalPages && Math.abs(pageNum - currentPage) > 1) {
                      if (pageNum === 2 && currentPage > 3) return <span key="dots-1" className="px-2 text-slate-300">...</span>;
                      if (pageNum === totalPages - 1 && currentPage < totalPages - 2) return <span key="dots-2" className="px-2 text-slate-300">...</span>;
                      if (Math.abs(pageNum - currentPage) > 1) return null;
                    }
                  }
                  return (
                    <button 
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-10 h-10 rounded-xl text-[11px] font-black transition-all border ${currentPage === pageNum ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button 
                disabled={currentPage === totalPages}
                onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-white hover:border-indigo-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Next Page"
              >
                <ChevronRight size={20} />
              </button>
           </div>
        </div>
      )}

      {/* CREATE MODAL */}
      {isAdding && canCreateProject && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-indigo-600 rounded-2xl text-white">
                  <FolderPlus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">New Project</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Create a fresh testing context</p>
                </div>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Project Name</label>
                  <input 
                    autoFocus
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner" 
                    placeholder="e.g. Nexus Core API" 
                    value={newName || ''} 
                    onChange={e => setNewName(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Description</label>
                  <textarea 
                    className="w-full h-32 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none shadow-inner" 
                    placeholder="Define the scope and objectives..." 
                    value={newDesc || ''} 
                    onChange={e => setNewDesc(e.target.value)} 
                  />
                </div>
                
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Project Status</label>
                  <div className="relative group">
                    <select 
                      value={newStatus || ''}
                      onChange={(e) => setNewStatus(e.target.value as any)}
                      className="w-full pl-5 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500 transition-all hover:bg-white shadow-inner"
                    >
                      <option value="" disabled>-- Select Status --</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                    <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" size={20} />
                  </div>
                </div>
                
                <div className="flex flex-col gap-3 pt-4">
                  <button 
                    onClick={addProject} 
                    disabled={isProcessing || !newName.trim() || !newStatus}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Create Project'}
                  </button>
                  <button 
                    onClick={() => setIsAdding(false)} 
                    className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editingProject && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-indigo-600 rounded-2xl text-white">
                  <Pencil size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Edit Project</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Update project properties</p>
                </div>
              </div>
              
              <div className="space-y-6">
                <div className="relative group">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block flex items-center gap-2">
                    Project Name {!isElevatedUser && <Lock size={10} className="text-slate-300" />}
                  </label>
                  <input 
                    autoFocus={isElevatedUser}
                    disabled={!isElevatedUser}
                    className={`w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none transition-all shadow-inner ${!isElevatedUser ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'focus:ring-2 focus:ring-indigo-500'}`} 
                    value={editName || ''} 
                    onChange={e => setEditName(e.target.value)} 
                  />
                  {!isElevatedUser && (
                    <p className="text-[9px] text-amber-500 font-bold uppercase tracking-widest mt-1.5 ml-2">Only Admins & Managers can rename projects</p>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Description</label>
                  <textarea 
                    className="w-full h-32 px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none shadow-inner" 
                    value={editDesc || ''} 
                    onChange={e => setEditDesc(e.target.value)} 
                  />
                </div>
                
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Project Status</label>
                  <div className="relative group">
                    <select 
                      value={editStatus || ''}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      className="w-full pl-5 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500 transition-all hover:bg-white shadow-inner"
                    >
                      <option value="" disabled>-- Select Status --</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                    <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" size={20} />
                  </div>
                </div>
                
                <div className="flex flex-col gap-3 pt-4">
                  <button 
                    onClick={handleSaveEdit} 
                    disabled={isProcessing || !editName.trim() || !editStatus}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Save Changes'}
                  </button>
                  <button 
                    onClick={() => setEditingProject(null)} 
                    className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingProjectId && (
        <div className="fixed inset-0 z-[2100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-sm rounded-[2.5rem] p-10 text-center shadow-2xl animate-in zoom-in-95">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-8 text-red-500">
               <AlertTriangle size={40} />
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-4">Delete Project?</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10">This will permanently remove the project and all associated scenarios, test cases, and scripts. This action is irreversible.</p>
            <div className="flex flex-col gap-3">
               <button 
                  onClick={handleConfirmDelete}
                  disabled={isProcessing}
                  className="w-full py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-100 flex items-center justify-center gap-2"
               >
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'Delete Permanently'}
               </button>
               <button 
                  onClick={() => setDeletingProjectId(null)}
                  disabled={isProcessing}
                  className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
               >
                  Keep Project
               </button>
            </div>
          </div>
        </div>
      )}

      {/* ALLOCATE MODAL */}
      {isAllocating && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Allocate Project</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Invite collaborators to your project</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Target Project</label>
                  <div className="relative">
                    <select 
                      className="w-full pl-5 pr-10 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none appearance-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer shadow-inner"
                      value={allocationForm.projectId || ''}
                      onChange={e => setAllocationForm({...allocationForm, projectId: e.target.value})}
                    >
                      <option value="">-- Select Project --</option>
                      {ownedProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-2 block">Collaborator Email</label>
                  <div className="relative">
                     <Mail size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                     <input 
                       className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner"
                       placeholder="colleague@company.com"
                       value={allocationForm.inviteEmail || ''}
                       onChange={e => setAllocationForm({...allocationForm, inviteEmail: e.target.value})}
                     />
                  </div>
                </div>

                {allocationError && <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center gap-3 text-red-600 text-xs font-bold animate-in slide-in-from-top-2"><AlertTriangle size={16}/> {allocationError}</div>}
                {allocationSuccess && <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3 text-emerald-600 text-xs font-bold animate-in slide-in-from-top-2"><Check size={16}/> {allocationSuccess}</div>}

                <div className="flex flex-col gap-3 pt-4">
                  <button 
                    onClick={handleAllocate} 
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    Send Invitation
                  </button>
                  <button 
                    onClick={() => setIsAllocating(false)} 
                    className="w-full py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROJECT MEMBERS MODAL */}
      {viewingMembersProject && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 flex flex-col max-h-[85vh]">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                  <Users size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Project Members</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    Manage roles for {viewingMembersProject.name}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setViewingMembersProject(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
              {/* Add New Member Section (Only for Project Admins) */}
              {isProjectAdmin(viewingMembersProject, user.email) && (
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-150 space-y-4">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Add Member to Project</h4>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-5 relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        type="email"
                        placeholder="collaborator@company.com"
                        value={newMemberEmail || ''}
                        onChange={e => setNewMemberEmail(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      />
                    </div>
                    <div className="md:col-span-4 relative">
                      <select
                        value={newMemberRole || ''}
                        onChange={e => setNewMemberRole(e.target.value as 'Admin' | 'Team Member')}
                        className="w-full pl-4 pr-10 py-3.5 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      >
                        <option value="Team Member">Team Member</option>
                        <option value="Admin">Project Admin</option>
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                    </div>
                    <div className="md:col-span-3">
                      <button
                        onClick={handleAddMemberToProject}
                        disabled={isProcessingMember}
                        className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-100 disabled:opacity-50"
                      >
                        {isProcessingMember ? <Loader2 size={14} className="animate-spin" /> : 'Add Member'}
                      </button>
                    </div>
                  </div>
                  {memberError && <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider">{memberError}</p>}
                </div>
              )}

              {/* Members List */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Members</h4>
                <div className="divide-y divide-slate-100 border border-slate-150 rounded-[2rem] overflow-hidden bg-white">
                  {/* Owner (Implicit Project Admin) */}
                  {!isAdminRole && (
                    <div className="p-5 flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black text-xs border border-emerald-100">
                          {(viewingMembersProject.ownerEmail || 'OW').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                            {viewingMembersProject.ownerName || viewingMembersProject.ownerEmail}
                            <span className="text-[9px] font-bold text-amber-500 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full font-sans">Owner</span>
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold">{viewingMembersProject.ownerEmail}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest px-3 py-1 bg-slate-100 rounded-lg">
                        Project Admin
                      </span>
                    </div>
                  )}

                  {/* Other Members */}
                  {(() => {
                    const emails = getAllocatedEmails(viewingMembersProject.allocatedUserEmails);
                    const otherMembers = emails.filter(e => e.toLowerCase().trim() !== viewingMembersProject.ownerEmail?.toLowerCase().trim());

                    if (otherMembers.length === 0) {
                      return (
                        <div className="p-8 text-center text-[10px] font-bold text-slate-400 uppercase italic">
                          No other collaborators allocated to this project.
                        </div>
                      );
                    }

                    return otherMembers.map(email => {
                      const emailLower = email.toLowerCase().trim();
                      const currentRole = viewingMembersProject.projectRoles?.[emailLower] || 'Team Member';
                      const isUserAdmin = isProjectAdmin(viewingMembersProject, user.email);

                      return (
                        <div key={email} className="p-5 flex items-center justify-between hover:bg-slate-50/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border ${currentRole === 'Admin' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                              {(email || 'MB').substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-black text-slate-800 tracking-tight">{email}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{currentRole === 'Admin' ? 'Project Admin' : 'Project Contributor'}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {isUserAdmin ? (
                              <div className="relative">
                                <select
                                  value={currentRole || ''}
                                  onChange={e => handleUpdateMemberRole(emailLower, e.target.value as 'Admin' | 'Team Member')}
                                  className="pl-3 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer hover:bg-white transition-all appearance-none"
                                >
                                  <option value="Team Member">Team Member</option>
                                  <option value="Admin">Admin</option>
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                              </div>
                            ) : (
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${currentRole === 'Admin' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>
                                {currentRole}
                              </span>
                            )}

                            {isUserAdmin && (
                              <button
                                onClick={() => handleRemoveMemberFromProject(emailLower)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Remove Member"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setViewingMembersProject(null)}
                className="px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ProjectList;
