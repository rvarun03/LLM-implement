
import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { 
  Users, 
  Search, 
  Copy, 
  Check, 
  Shield, 
  Briefcase, 
  Trash2, 
  Eye, 
  UserPlus, 
  ChevronDown, 
  X, 
  Loader2, 
  AlertTriangle,
  Mail,
  CheckSquare,
  Square,
  Filter,
  MoreHorizontal,
  ChevronRight,
  ShieldCheck,
  MoreVertical,
  CheckCircle,
  CheckCircle2,
  RotateCw
} from 'lucide-react';
import { collection, onSnapshot, doc, query, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { User, UserRole, Project, NotificationType } from '../types';
import { logActivity } from '../services/activityService';
import { createNotification } from '../services/notificationService';
import { syncUpdateDoc, syncDeleteDoc } from '../services/firestoreSync';
import seededUsers from '../users.json';

interface UserManagementProps {
  currentUser: User;
  projects: Project[];
  activeProject?: Project;
}

const getAssignedProjectIds = (assigned: any): string[] => {
  if (Array.isArray(assigned)) return assigned;
  if (assigned && typeof assigned === 'object') return Object.keys(assigned);
  return [];
};

const getAllocatedUserEmails = (allocated: any): string[] => {
  if (Array.isArray(allocated)) return allocated.filter((e): e is string => typeof e === 'string');
  if (allocated && typeof allocated === 'object') return Object.keys(allocated).filter(e => typeof e === 'string');
  return [];
};

const UserManagement: React.FC<UserManagementProps> = ({ currentUser, projects, activeProject }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [fallbackTrigger, setFallbackTrigger] = useState(0);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeProject?.id]);

  useEffect(() => {
    const handleFallback = () => {
      setFallbackTrigger(prev => prev + 1);
    };
    window.addEventListener('firestore-db-fallback', handleFallback);
    return () => window.removeEventListener('firestore-db-fallback', handleFallback);
  }, []);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Assignment Modal
  const [assignmentModal, setAssignmentModal] = useState<User | null>(null);
  const [tempSelectedProjects, setTempSelectedProjects] = useState<Set<string>>(new Set());
  const [tempProjectRoles, setTempProjectRoles] = useState<Record<string, 'Admin' | 'Team Member'>>({});

  // Access View Modal
  const [accessModal, setAccessModal] = useState<User | null>(null);

  // Delete Modal
  const [deleteModal, setDeleteModal] = useState<User | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);

  const manageableProjects = useMemo(() => {
    if (currentUser.role === UserRole.SUPER_ADMIN) return projects;
    const emailLower = currentUser.email.toLowerCase().trim();
    return projects.filter(p => {
      const isOwner = p.ownerEmail?.toLowerCase().trim() === emailLower;
      const projRole = p.projectRoles?.[emailLower];
      const isProjAdmin = projRole === 'Admin';
      const isDefaultAdmin = !projRole && currentUser.role === UserRole.ADMIN;
      return isOwner || isProjAdmin || isDefaultAdmin;
    });
  }, [projects, currentUser]);

  const handleSyncPermissions = async () => {
    setIsRepairing(true);
    let repairCount = 0;
    try {
      // Loop through all users loaded in the system
      for (const user of users) {
        const userEmailNormalized = user.email.toLowerCase().trim();
        const assignedIds = new Set(getAssignedProjectIds(user.assignedProjectIds));

        // 1. Sync User's assignedProjectIds -> Project's allocatedUserEmails
        for (const projectId of assignedIds) {
          const matchingProject = projects.find(p => p.id === projectId);
          if (matchingProject) {
            const hasEmail = getAllocatedUserEmails(matchingProject.allocatedUserEmails).some(e => e.toLowerCase().trim() === userEmailNormalized);
            if (!hasEmail) {
              const projectRef = doc(db, "projects", projectId);
              await syncUpdateDoc(projectRef, {
                allocatedUserEmails: arrayUnion(userEmailNormalized)
              });
              repairCount++;
            }
          }
        }

        // 2. Sync Project's allocatedUserEmails -> User's assignedProjectIds
        for (const project of projects) {
          const hasEmail = getAllocatedUserEmails(project.allocatedUserEmails).some(e => e.toLowerCase().trim() === userEmailNormalized);
          if (hasEmail && !assignedIds.has(project.id)) {
            const userRef = doc(db, "users", userEmailNormalized);
            await syncUpdateDoc(userRef, {
              assignedProjectIds: arrayUnion(project.id)
            });
            repairCount++;
          }
        }
      }

      if (repairCount > 0) {
        toast.success(`Permissions synchronized! Repaired ${repairCount} mismatched permission links.`);
      } else {
        toast.success('All project permissions are perfectly synchronized!');
      }
    } catch (err) {
      console.error("Failed to repair project permissions:", err);
      toast.error("Failed to synchronize complete permission tables.");
    } finally {
      setIsRepairing(false);
    }
  };

  useEffect(() => {
    const path = "users";
    const q = query(collection(db, path));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(d => ({ ...d.data() } as User));

      // Remove sathya@qaoncloud.com from displaying and delete any stray record from Firestore
      const filtered = usersData.filter(d => {
        const isSathya = d.email?.toLowerCase().trim() === 'sathya@qaoncloud.com';
        if (isSathya) {
          syncDeleteDoc(doc(db, "users", "sathya@qaoncloud.com")).catch(() => {});
        }
        return !isSathya;
      });

      // Default Super Admins: shanmugapriya@qaoncloud.com and vinuta@qaoncloud.com
      const DEFAULT_SUPER_ADMINS: Array<{ email: string; name: string }> = [
        { email: 'shanmugapriya@qaoncloud.com', name: 'shanmugapriya' },
        { email: 'vinuta@qaoncloud.com', name: 'Vinuta' }
      ];

      const processedUsers = [...filtered];
      for (const admin of DEFAULT_SUPER_ADMINS) {
        const existingIdx = processedUsers.findIndex(u => u.email?.toLowerCase().trim() === admin.email);
        if (existingIdx >= 0) {
          if (!processedUsers[existingIdx].role) {
            processedUsers[existingIdx] = {
              ...processedUsers[existingIdx],
              role: UserRole.SUPER_ADMIN
            };
            syncUpdateDoc(doc(db, "users", admin.email), { role: UserRole.SUPER_ADMIN }).catch(() => {});
          }
        } else {
          // If not yet present in database snapshot, seed it as default Super Admin
          const seeded = (seededUsers as any[]).find(u => u.id?.toLowerCase() === admin.email || u.data?.email?.toLowerCase() === admin.email);
          processedUsers.unshift({
            email: admin.email,
            name: seeded?.data?.name || admin.name,
            role: UserRole.SUPER_ADMIN,
            assignedProjectIds: seeded?.data?.assignedProjectIds || [],
            status: 'active' as any,
            createdAt: seeded?.data?.createdAt || new Date().toISOString()
          });
          syncUpdateDoc(doc(db, "users", admin.email), {
            email: admin.email,
            name: seeded?.data?.name || admin.name,
            role: UserRole.SUPER_ADMIN,
            status: 'active',
            createdAt: seeded?.data?.createdAt || new Date().toISOString()
          }).catch(() => {});
        }
      }

      setUsers(processedUsers);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [fallbackTrigger]);

  // Auto-repair desynced permission links silently in the background
  const [autoRepaired, setAutoRepaired] = useState(false);
  useEffect(() => {
    if (loading || users.length === 0 || projects.length === 0 || autoRepaired) return;
    setAutoRepaired(true);
    
    const silentRepair = async () => {
      try {
        let repairCount = 0;
        for (const user of users) {
          if (!user || !user.email) continue;
          const userEmailNormalized = user.email.toLowerCase().trim();
          if (!userEmailNormalized) continue;

          let assignedList: string[] = [];
          if (Array.isArray(user.assignedProjectIds)) {
            assignedList = user.assignedProjectIds.filter(id => typeof id === 'string');
          } else if (user.assignedProjectIds && typeof user.assignedProjectIds === 'object') {
            assignedList = Object.keys(user.assignedProjectIds);
          }
          const assignedIds = new Set(assignedList);

          // 1. Sync User's assignedProjectIds -> Project's allocatedUserEmails
          for (const projectId of assignedIds) {
            const matchingProject = projects.find(p => p && p.id === projectId);
            if (matchingProject) {
              let allocatedEmails: string[] = [];
              if (Array.isArray(matchingProject.allocatedUserEmails)) {
                allocatedEmails = matchingProject.allocatedUserEmails.filter(e => typeof e === 'string').map(e => e.toLowerCase().trim());
              } else if (matchingProject.allocatedUserEmails && typeof matchingProject.allocatedUserEmails === 'object') {
                allocatedEmails = Object.keys(matchingProject.allocatedUserEmails).map(e => e.toLowerCase().trim());
              }

              const hasEmail = allocatedEmails.includes(userEmailNormalized);
              if (!hasEmail) {
                const projectRef = doc(db, "projects", projectId);
                const currentRoles = (matchingProject.projectRoles && typeof matchingProject.projectRoles === 'object') ? matchingProject.projectRoles : {};
                const updatedRoles = { ...currentRoles, [userEmailNormalized]: currentRoles[userEmailNormalized] || 'Team Member' };
                await syncUpdateDoc(projectRef, {
                  allocatedUserEmails: arrayUnion(userEmailNormalized),
                  projectRoles: updatedRoles
                });
                repairCount++;
              }
            }
          }

          // 2. Sync Project's allocatedUserEmails -> User's assignedProjectIds
          for (const project of projects) {
            if (!project || !project.id) continue;
            let allocatedEmails: string[] = [];
            if (Array.isArray(project.allocatedUserEmails)) {
              allocatedEmails = project.allocatedUserEmails.filter(e => typeof e === 'string').map(e => e.toLowerCase().trim());
            } else if (project.allocatedUserEmails && typeof project.allocatedUserEmails === 'object') {
              allocatedEmails = Object.keys(project.allocatedUserEmails).map(e => e.toLowerCase().trim());
            }

            const hasEmail = allocatedEmails.includes(userEmailNormalized);
            if (hasEmail && !assignedIds.has(project.id)) {
              const userRef = doc(db, "users", userEmailNormalized);
              await syncUpdateDoc(userRef, {
                assignedProjectIds: arrayUnion(project.id)
              });
              repairCount++;
            }
          }
        }
        if (repairCount > 0) {
          console.log(`[Auto-Repair] Synchronized ${repairCount} mismatched permission links.`);
        }
        setAutoRepaired(true);
      } catch (err) {
        console.error("[Auto-Repair] Failed silent permissions sync:", err);
      }
    };
    
    silentRepair();
  }, [loading, users, projects, autoRepaired]);

  const handleUpdateRole = async (userEmail: string, newRole: UserRole) => {
    const normalizedTarget = userEmail.toLowerCase().trim();
    if (['shanmugapriya@qaoncloud.com', 'vinuta@qaoncloud.com'].includes(normalizedTarget) && newRole !== UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
      toast.error("Role of a default Super Admin cannot be changed by non-Super Admin.");
      return;
    }

    if (newRole === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
      toast.error("Only Super Admin can assign the Super Admin role.");
      return;
    }

    const targetUser = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
    if (targetUser && targetUser.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
      toast.error("Only Super Admin can modify another Super Admin's role.");
      return;
    }

    const path = `users/${userEmail.toLowerCase()}`;
    try {
      const userRef = doc(db, "users", userEmail.toLowerCase());
      await syncUpdateDoc(userRef, { role: newRole });
      logActivity(currentUser.email, currentUser.name, `Updated system role for ${userEmail} to ${newRole}`, 'system', 'Platform Governance');
      
      // Notify the user about their role change
      await createNotification({
        recipientEmail: userEmail,
        senderName: currentUser.name,
        type: NotificationType.ROLE_UPDATE,
        title: 'Role Updated',
        message: `Your platform role has been updated to ${newRole} by an administrator.`
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleCopyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const filteredUsers = useMemo(() => {
    let result = users;

    // Filter by project access if currentUser is not Super Admin
    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      const isUserAdmin = currentUser.role === UserRole.ADMIN || (currentUser.role as string)?.toLowerCase().trim() === 'admin';

      if (activeProject) {
        const activeProjId = activeProject.id;
        const activeProjEmails = new Set<string>();

        if (activeProject.ownerEmail && (!isUserAdmin || activeProject.ownerEmail.toLowerCase().trim() === currentUser.email.toLowerCase().trim())) {
          activeProjEmails.add(activeProject.ownerEmail.toLowerCase().trim());
        }
        getAllocatedUserEmails(activeProject.allocatedUserEmails).forEach(e => {
          if (e) activeProjEmails.add(e.toLowerCase().trim());
        });
        if (activeProject.projectRoles) {
          Object.keys(activeProject.projectRoles).forEach(e => {
            if (e) activeProjEmails.add(e.toLowerCase().trim());
          });
        }

        result = result.filter(u => {
          const uEmail = u.email.toLowerCase().trim();
          const isSelf = uEmail === currentUser.email.toLowerCase().trim();

          // Hide owner of activeProject from Admin if not self
          if (isUserAdmin && activeProject.ownerEmail?.toLowerCase().trim() === uEmail && !isSelf) {
            return false;
          }

          const isAllocated = activeProjEmails.has(uEmail);
          const isAssigned = getAssignedProjectIds(u.assignedProjectIds).includes(activeProjId);
          return isSelf || isAllocated || isAssigned;
        });
      } else {
        const managedIds = new Set(manageableProjects.map(p => p.id));
        result = result.filter(u => {
          const uEmail = u.email.toLowerCase().trim();
          const isSelf = uEmail === currentUser.email.toLowerCase().trim();

          // Hide owner of any managed project from Admin if not self
          if (isUserAdmin && projects.some(p => p.ownerEmail?.toLowerCase().trim() === uEmail) && !isSelf) {
            return false;
          }

          const belongsToManaged = getAssignedProjectIds(u.assignedProjectIds).some(pid => managedIds.has(pid));
          return isSelf || belongsToManaged;
        });
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(u => 
        u.name.toLowerCase().includes(q) || 
        u.email.toLowerCase().includes(q)
      );
    }

    if (roleFilter !== 'all') {
      result = result.filter(u => {
        const emailLower = u.email.toLowerCase().trim();
        let effectiveRole = u.role;
        if (activeProject) {
          const pRole = activeProject.projectRoles?.[emailLower];
          if (pRole === 'Admin' || activeProject.ownerEmail?.toLowerCase().trim() === emailLower) {
            effectiveRole = UserRole.ADMIN;
          } else if (pRole === 'Team Member') {
            effectiveRole = UserRole.TEAM_MEMBER;
          }
        }
        return effectiveRole === roleFilter || u.role === roleFilter;
      });
    }

    return result;
  }, [users, searchQuery, roleFilter, currentUser, activeProject, manageableProjects]);

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage]);

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);

  const getInitials = (name: string) => {
    if (!name || typeof name !== 'string') return 'US';
    return name.split(' ').map(n => n ? n[0] : '').join('').toUpperCase().substring(0, 2) || 'US';
  };

  const roleColors: Record<UserRole, string> = {
    [UserRole.SUPER_ADMIN]: 'text-purple-600 bg-purple-50 border-purple-100',
    [UserRole.ADMIN]: 'text-rose-600 bg-rose-50 border-rose-100',
    [UserRole.DELIVERY_MANAGER]: 'text-amber-600 bg-amber-50 border-amber-100',
    [UserRole.SPOC]: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    [UserRole.TEAM_MEMBER]: 'text-slate-600 bg-slate-50 border-slate-100',
  };

  const openAssignment = (targetUser: User) => {
    const assigned = getAssignedProjectIds(targetUser.assignedProjectIds);
    setTempSelectedProjects(new Set(assigned));
    const roles: Record<string, 'Admin' | 'Team Member'> = {};
    const normalizedEmail = targetUser.email.toLowerCase().trim();
    projects.forEach(p => {
      const existingRole = p.projectRoles?.[normalizedEmail];
      if (existingRole) {
        roles[p.id] = existingRole;
      } else if (targetUser.role === UserRole.ADMIN) {
        roles[p.id] = 'Admin';
      } else {
        roles[p.id] = 'Team Member';
      }
    });
    setTempProjectRoles(roles);
    setAssignmentModal(targetUser);
  };

  const handleSaveAssignment = async () => {
    if (!assignmentModal) return;
    if (assignmentModal.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
      toast.error("Only Super Admin can modify project access for a Super Admin.");
      return;
    }

    const modalEmailLower = assignmentModal.email.toLowerCase().trim();
    for (const p of projects) {
      if (p.ownerEmail?.toLowerCase().trim() === modalEmailLower) {
        if (!tempSelectedProjects.has(p.id)) {
          toast.error(`Cannot remove ${assignmentModal.name || assignmentModal.email} from '${p.name}' because they are the project owner.`);
          return;
        }
      }
    }

    const path = `users/${assignmentModal.email.toLowerCase()}`;
    try {
      const userRef = doc(db, "users", assignmentModal.email.toLowerCase());
      const oldAssignments = new Set(assignmentModal.assignedProjectIds || []);
      const selectedIds = Array.from(tempSelectedProjects);
      
      await syncUpdateDoc(userRef, { assignedProjectIds: selectedIds });
      
      // Identify new and unassigned projects
      const newlyAssigned = selectedIds.filter(id => !oldAssignments.has(id));
      const unassigned = Array.from(oldAssignments).filter(id => !tempSelectedProjects.has(id));
      const normalizedEmail = assignmentModal.email.toLowerCase().trim();

      // Ensure all selected projects include this user's email and chosen project role
      for (const projectId of selectedIds) {
        try {
          const project = projects.find(p => p.id === projectId);
          const currentRoles = project?.projectRoles || {};
          const roleToSet = tempProjectRoles[projectId] || (assignmentModal.role === UserRole.ADMIN ? 'Admin' : 'Team Member');
          const updatedRoles = { ...currentRoles, [normalizedEmail]: roleToSet };

          const projectRef = doc(db, "projects", projectId);
          await syncUpdateDoc(projectRef, {
            allocatedUserEmails: arrayUnion(normalizedEmail),
            projectRoles: updatedRoles
          });
        } catch (projErr) {
          console.error(`Error ensuring user assignment on project ${projectId}:`, projErr);
        }
      }

      // Update unassigned projects to remove this user's email and role
      for (const projectId of unassigned) {
        try {
          const project = projects.find(p => p.id === projectId);
          const currentRoles = { ...(project?.projectRoles || {}) };
          delete currentRoles[normalizedEmail];
          const projectRef = doc(db, "projects", projectId);
          await syncUpdateDoc(projectRef, {
            allocatedUserEmails: arrayRemove(normalizedEmail),
            projectRoles: currentRoles
          });
        } catch (projErr) {
          console.error(`Error removing user from project ${projectId}:`, projErr);
        }
      }

      // Identify new assignments to notify the user
      if (newlyAssigned.length > 0) {
          const projectNames = newlyAssigned.map(id => projects.find(p => p.id === id)?.name || id).join(', ');
          await createNotification({
              recipientEmail: assignmentModal.email,
              senderName: currentUser.name,
              type: NotificationType.PROJECT_ASSIGNMENT,
              title: 'Project Access Granted',
              message: `You have been assigned to the following project(s): ${projectNames}`
          });
      }

      logActivity(currentUser.email, currentUser.name, `Modified project assignments for ${assignmentModal.email} (${selectedIds.length} projects)`, 'system', 'Platform Governance');
      setAssignmentModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleRemoveUser = async () => {
    if (!deleteModal) return;
    const targetEmail = deleteModal.email.toLowerCase().trim();
    const currentEmail = currentUser.email.toLowerCase().trim();

    if (['shanmugapriya@qaoncloud.com', 'vinuta@qaoncloud.com'].includes(targetEmail)) {
      toast.error("Default Super Admins cannot be removed.");
      return;
    }

    if (deleteModal.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN) {
      toast.error("Only Super Admin can revoke a Super Admin's access.");
      return;
    }

    const isProjectOwner = projects.some(p => p.ownerEmail?.toLowerCase().trim() === targetEmail);
    if (isProjectOwner && currentEmail !== targetEmail && currentUser.role !== UserRole.SUPER_ADMIN) {
      toast.error("Project owners cannot be deleted by another Admin.");
      return;
    }

    const path = `users/${deleteModal.email.toLowerCase()}`;
    try {
      const userRef = doc(db, "users", deleteModal.email.toLowerCase());
      
      // Remove this user's email from all their assigned projects
      const assignedIds = deleteModal.assignedProjectIds || [];
      const normalizedEmail = deleteModal.email.toLowerCase().trim();
      for (const projectId of assignedIds) {
        try {
          const projectRef = doc(db, "projects", projectId);
          await syncUpdateDoc(projectRef, {
            allocatedUserEmails: arrayRemove(normalizedEmail)
          });
        } catch (projErr) {
          console.error(`Error removing deleted user from project ${projectId}:`, projErr);
        }
      }

      await syncDeleteDoc(userRef);
      logActivity(currentUser.email, currentUser.name, `Revoked all system access for user: ${deleteModal.email}`, 'system', 'Platform Governance');
      setDeleteModal(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
           <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Synchronizing Users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-700">
      {/* Header Panel */}
      <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/30 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-6">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-black text-black uppercase tracking-tight">Access Control</h2>
                {activeProject && (
                  <span className="px-3.5 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-black text-indigo-700 uppercase tracking-wider flex items-center gap-2 shadow-sm">
                    <Briefcase size={12} className="text-indigo-600" />
                    Project: {activeProject.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-3 flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-500" />
                {currentUser.role === UserRole.SUPER_ADMIN
                  ? 'Super Admin View • Displaying Users Across All Projects'
                  : `Displaying Admins & Team Members for ${activeProject?.name || 'Selected Project'}`}
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={handleSyncPermissions}
              disabled={isRepairing}
              className={`h-14 px-6 border rounded-2xl text-[10px] font-black uppercase tracking-widest relative overflow-hidden transition-all flex items-center gap-3 active:scale-95 shadow-sm min-w-[200px] justify-center ${
                isRepairing 
                  ? 'bg-slate-150 border-slate-250 text-slate-400' 
                  : 'bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 cursor-pointer'
              }`}
            >
              {isRepairing ? (
                <>
                  <Loader2 size={16} className="animate-spin text-indigo-600" />
                  Repairing...
                </>
              ) : (
                <>
                  <RotateCw size={16} className="text-indigo-600 group-hover:text-white" />
                  Sync Permissions
                </>
              )}
            </button>

            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search by name or email..." 
                value={searchQuery || ''}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:bg-white focus:ring-4 ring-indigo-50/50 outline-none transition-all w-80 shadow-inner"
              />
            </div>
            
            <div className="relative h-14">
              <select 
                value={roleFilter || ''}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-full pl-6 pr-12 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest outline-none focus:ring-4 ring-indigo-50/50 appearance-none cursor-pointer transition-all hover:bg-slate-50"
              >
                <option value="all">All Roles</option>
                {Object.values(UserRole).map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
            </div>
          </div>
        </div>
      </div>

      {/* Users Data Table */}
      <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-[14px] font-black text-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-10 py-8">User Profile</th>
                <th className="px-10 py-8">Email Address</th>
                <th className="px-10 py-8">Role (Instant Persist)</th>
                <th className="px-10 py-8">Projects</th>
                <th className="px-10 py-8 text-[14px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-10 py-32 text-center">
                    <div className="flex flex-col items-center justify-center opacity-30">
                       <Search size={48} className="mb-4" />
                       <p className="text-sm font-black uppercase tracking-widest">No users found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => {
                  const userAssignedProjects = getAssignedProjectIds(user.assignedProjectIds);
                  const isActive = userAssignedProjects.length > 0;
                  return (
                    <tr key={user.email} className="hover:bg-slate-50/30 transition-colors group">
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-[11px] font-black shadow-lg shadow-indigo-100 flex-shrink-0 group-hover:scale-110 transition-transform">
                            {getInitials(user.name)}
                          </div>
                          <div>
                            <span className="font-black text-slate-800 text-sm tracking-tight uppercase block">{user.name}</span>
                            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border mt-1 inline-block ${
                              isActive 
                                ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                                : 'bg-slate-50 text-slate-400 border-slate-100'
                            }`}>
                              Status: {isActive ? 'Active' : 'InActive'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-500">{user.email}</span>
                          <button 
                            onClick={() => handleCopyEmail(user.email)}
                            className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-slate-100"
                          >
                            {copiedEmail === user.email ? <Check size={16} className="text-emerald-500" strokeWidth={3} /> : <Copy size={16} />}
                          </button>
                        </div>
                      </td>
                      <td className="px-10 py-6">
                        <div className="relative w-52">
                          {(() => {
                            const isDefaultAdmin = ['shanmugapriya@qaoncloud.com', 'vinuta@qaoncloud.com'].includes(user.email?.toLowerCase().trim());
                            return (
                              <>
                                <select 
                                  value={user.role || UserRole.TEAM_MEMBER}
                                  disabled={(isDefaultAdmin && currentUser.role !== UserRole.SUPER_ADMIN) || (user.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN)}
                                  onChange={(e) => handleUpdateRole(user.email, e.target.value as UserRole)}
                                  className={`appearance-none w-full pl-5 pr-10 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border outline-none cursor-pointer transition-all shadow-sm ${roleColors[user.role || UserRole.TEAM_MEMBER]} ${((isDefaultAdmin && currentUser.role !== UserRole.SUPER_ADMIN) || (user.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN)) ? 'opacity-70 cursor-not-allowed font-medium' : ''}`}
                                >
                                  {Object.values(UserRole)
                                    .filter(role => role !== UserRole.SUPER_ADMIN || currentUser.role === UserRole.SUPER_ADMIN)
                                    .map(role => (
                                      <option key={role} value={role}>{role}</option>
                                    ))
                                  }
                                </select>
                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-current opacity-50" size={16} />
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex flex-wrap gap-2 max-w-[320px]">
                          {userAssignedProjects.length === 0 ? (
                            <span className="text-[10px] font-bold text-slate-300 uppercase italic flex items-center gap-1">
                               <AlertTriangle size={10} /> Unassigned
                            </span>
                          ) : (
                            <>
                              {userAssignedProjects.slice(0, 2).map(pid => {
                                  const pName = projects.find(p => p.id === pid)?.name || 'Unknown';
                                  return (
                                  <span key={pid} className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[9px] font-black text-slate-600 shadow-sm uppercase tracking-tighter truncate max-w-[140px]">
                                      {pName}
                                  </span>
                                  );
                              })}
                              {userAssignedProjects.length > 2 && (
                                  <span className="px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-[9px] font-black text-indigo-600 uppercase">
                                      +{userAssignedProjects.length - 2} MORE
                                  </span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-10 py-6 text-right">
                        {(() => {
                          const isDefaultAdmin = ['shanmugapriya@qaoncloud.com', 'vinuta@qaoncloud.com'].includes(user.email?.toLowerCase().trim());
                          const isTargetSuperAdmin = user.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN;
                          const isTargetOwner = projects.some(p => p.ownerEmail?.toLowerCase().trim() === user.email.toLowerCase().trim()) &&
                            currentUser.email.toLowerCase().trim() !== user.email.toLowerCase().trim() &&
                            currentUser.role !== UserRole.SUPER_ADMIN;
                          const isDeleteDisabled = isDefaultAdmin || isTargetSuperAdmin || isTargetOwner;
                          const deleteTitle = isDefaultAdmin
                            ? "Default Super Admins cannot be deleted"
                            : isTargetSuperAdmin 
                            ? "Super Admins cannot be deleted by Admin" 
                            : isTargetOwner 
                            ? "Project owners cannot be deleted by another Admin" 
                            : "Revoke All Access";

                          return (
                            <div className="flex items-center justify-end gap-2 transition-all">
                              <button 
                                onClick={() => setAccessModal(user)}
                                className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-[1rem] transition-all border border-transparent hover:border-slate-100 shadow-sm"
                                title="View Access Summary"
                              >
                                <Eye size={20} />
                              </button>
                              <button 
                                onClick={() => openAssignment(user)}
                                disabled={user.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN}
                                className={`p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-[1rem] transition-all border border-transparent hover:border-slate-100 shadow-sm ${user.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN ? 'opacity-40 cursor-not-allowed' : ''}`}
                                title={user.role === UserRole.SUPER_ADMIN && currentUser.role !== UserRole.SUPER_ADMIN ? "Super Admins cannot be reassigned projects by Admin" : "Modify Project Access"}
                              >
                                <UserPlus size={20} />
                              </button>
                              <button 
                                onClick={() => setDeleteModal(user)}
                                disabled={isDeleteDisabled}
                                className={`p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-[1rem] transition-all border border-transparent hover:border-rose-100 ${isDeleteDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                title={deleteTitle}
                              >
                                <Trash2 size={20} />
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="px-10 py-8 border-t border-slate-100 flex items-center justify-between bg-slate-50/20">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Synchronized: Showing {paginatedUsers.length} of {filteredUsers.length} Team Members
          </p>
          <div className="flex gap-3">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-6 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-all shadow-sm"
            >
              Previous
            </button>
            <button 
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-6 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-all shadow-sm"
            >
              Next Page
            </button>
          </div>
        </div>
      </div>

      {/* Project Assignment Modal */}
      {assignmentModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="p-10 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-indigo-600 rounded-[1.5rem] text-white shadow-xl shadow-indigo-100"><Briefcase size={24} /></div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Modify Projects</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">{assignmentModal.name} • {assignmentModal.email}</p>
                </div>
              </div>
              <button onClick={() => setAssignmentModal(null)} className="p-3 text-slate-400 hover:text-slate-600 hover:bg-white rounded-full transition-all border border-transparent hover:border-slate-100"><X size={24} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 space-y-4 custom-scrollbar">
              <div className="flex items-center justify-between mb-4 px-2">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Available Projects</p>
                 <button 
                    onClick={() => {
                        if (tempSelectedProjects.size === manageableProjects.length) {
                          setTempSelectedProjects(new Set());
                        } else {
                          setTempSelectedProjects(new Set(manageableProjects.map(p => p.id)));
                        }
                    }}
                    className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                 >
                    {tempSelectedProjects.size === manageableProjects.length ? 'Deselect All' : 'Select All'}
                 </button>
              </div>

              {manageableProjects.length === 0 ? (
                <div className="py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                    <p className="text-slate-400 font-bold uppercase text-xs italic">No active projects to assign</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                    {manageableProjects.map(project => {
                      const isSelected = tempSelectedProjects.has(project.id);
                      const currentProjectRole = tempProjectRoles[project.id] || (assignmentModal?.role === UserRole.ADMIN ? 'Admin' : 'Team Member');
                      return (
                        <div 
                          key={project.id}
                          className={`w-full flex items-center justify-between p-5 rounded-[2rem] border transition-all ${isSelected ? 'bg-indigo-50/70 border-indigo-300 ring-4 ring-indigo-50/50' : 'bg-white border-slate-100 hover:border-indigo-200'}`}
                        >
                          <button 
                            type="button"
                            onClick={() => {
                              const next = new Set(tempSelectedProjects);
                              if (next.has(project.id)) next.delete(project.id);
                              else next.add(project.id);
                              setTempSelectedProjects(next);
                            }}
                            className="flex items-center gap-4 flex-1 text-left min-w-0 pr-3"
                          >
                            <div className={`p-3 rounded-xl transition-colors flex-shrink-0 ${isSelected ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                              <Briefcase size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">{project.name}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 tracking-widest">ID: {String(project?.id || '').toUpperCase()}</p>
                            </div>
                          </button>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            {isSelected && (
                              <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTempProjectRoles({ ...tempProjectRoles, [project.id]: 'Admin' });
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${currentProjectRole === 'Admin' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}
                                >
                                  Admin
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTempProjectRoles({ ...tempProjectRoles, [project.id]: 'Team Member' });
                                  }}
                                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${currentProjectRole === 'Team Member' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}
                                >
                                  Member
                                </button>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                const next = new Set(tempSelectedProjects);
                                if (next.has(project.id)) next.delete(project.id);
                                else next.add(project.id);
                                setTempSelectedProjects(next);
                              }}
                              className={`transition-all ${isSelected ? 'text-indigo-600 scale-110' : 'text-slate-200 hover:text-slate-400'}`}
                            >
                              {isSelected ? <CheckSquare size={28} /> : <Square size={28} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="p-10 bg-white border-t border-slate-100 flex gap-4">
              <button onClick={handleSaveAssignment} className="flex-1 py-5 bg-indigo-600 text-white rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-indigo-700 shadow-2xl shadow-indigo-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                 <CheckCircle2 size={18} /> Save Project Permissions
              </button>
              <button onClick={() => setAssignmentModal(null)} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200 active:scale-[0.98]">Discard Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Access Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-[2000] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-sm rounded-[3rem] p-10 text-center shadow-2xl animate-in zoom-in-95">
            <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-8 text-rose-500 shadow-inner">
               <AlertTriangle size={48} />
            </div>
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-4">Revoke Platform Access?</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10 px-4">
              Terminating access for <span className="font-bold text-slate-800">"{deleteModal.name}"</span> will immediately invalidate their active session and delete their onboarding record. 
              <br /><span className="text-rose-500 font-bold mt-2 inline-block">This action is permanent.</span>
            </p>
            <div className="flex flex-col gap-4">
               <button onClick={handleRemoveUser} className="w-full py-5 bg-rose-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-rose-700 shadow-xl shadow-rose-100 active:scale-95 transition-all">Revoke Instantly</button>
               <button onClick={() => setDeleteModal(null)} className="w-full py-5 bg-slate-100 text-slate-500 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200">Keep Team Member</button>
            </div>
          </div>
        </div>
      )}

      {/* Access View Summary Modal */}
      {accessModal && (
        <div 
          className="fixed inset-0 z-[2000] bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAccessModal(null);
          }}
        >
          <div className="bg-white w-full max-w-lg rounded-[3.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 border border-white flex flex-col max-h-[85vh]">
            <div className="p-8 sm:p-10 bg-slate-900 text-white relative flex-shrink-0">
              <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none"><Users size={120} /></div>
              <button 
                onClick={() => setAccessModal(null)} 
                className="absolute top-6 right-6 z-20 p-3 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-all"
                title="Close Summary"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-6 relative z-10 pr-10">
                <div className="w-20 h-20 rounded-[1.5rem] bg-indigo-600 flex items-center justify-center text-2xl font-black shadow-2xl border-2 border-white/10 flex-shrink-0">
                  {getInitials(accessModal.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-2xl font-black uppercase tracking-tight truncate">{accessModal.name}</h3>
                  <div className={`mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${roleColors[accessModal.role || UserRole.TEAM_MEMBER]}`}>
                    <Shield size={12} /> {accessModal.role || UserRole.TEAM_MEMBER}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 sm:p-10 space-y-6 custom-scrollbar">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-4 flex items-center gap-2">
                   <Briefcase size={12} className="text-indigo-500" /> Active Project Permissions ({accessModal.assignedProjectIds?.length || 0})
                </label>
                <div className="space-y-3">
                  {(!accessModal.assignedProjectIds || accessModal.assignedProjectIds.length === 0) ? (
                    <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-slate-400 font-bold uppercase text-[10px] italic">No active permissions</p>
                    </div>
                  ) : (
                    accessModal.assignedProjectIds.map(pid => {
                      const proj = projects.find(p => p.id === pid);
                      const emailLower = accessModal.email.toLowerCase().trim();
                      const projRole = proj?.projectRoles?.[emailLower] || (accessModal.role === UserRole.ADMIN ? 'Admin' : 'Team Member');
                      return (
                        <div key={pid} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200 hover:border-indigo-200 transition-all">
                          <div className="flex items-center gap-3 truncate min-w-0 pr-2">
                            <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                            <span className="text-xs font-black text-slate-700 uppercase tracking-tight truncate">{proj?.name || pid}</span>
                          </div>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border flex-shrink-0 ${projRole === 'Admin' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {projRole}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 bg-slate-50/80 border-t border-slate-100 flex-shrink-0">
              <button 
                onClick={() => setAccessModal(null)} 
                className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-slate-800 shadow-xl active:scale-95 transition-all"
              >
                Dismiss Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
