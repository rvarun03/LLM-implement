import React, { useEffect, useState } from 'react';
import { 
  getTokenLogs, 
  calculateCreditsConsumed, 
  TOTAL_CREDIT_POOL, 
  getBasicPlanValidity,
  getUserCreditSummary,
  getProjectCreditSummary,
  getProjectPlans,
  subscribeToProjectPlans,
  getActiveProjectName,
  PlanValidityInfo
} from '../services/tokenConsumptionService';
import { PlanType } from '../types';
import { 
  createSubscriptionRequest, 
  getLocalSubscriptionRequests,
  getSubscriptionRequests,
  subscribeToSubscriptionRequests,
  getActiveUserSubscription,
  syncSubscriptionState
} from '../services/subscriptionService';
import { AlertTriangle, ShieldAlert, Sparkles, AlertCircle, Coins, ArrowRight, X, Send, CheckCircle2, Crown, RefreshCw, Layers } from 'lucide-react';

interface CreditAlertBannerProps {
  currentUserEmail?: string;
  currentUserName?: string;
  activeProject?: { id?: string; name?: string } | null;
  onNavigateToCredits?: () => void;
}

export const CreditAlertBanner: React.FC<CreditAlertBannerProps> = ({ 
  currentUserEmail, 
  currentUserName,
  activeProject,
  onNavigateToCredits 
}) => {
  const [creditsState, setCreditsState] = useState<{
    totalUsed: number;
    remaining: number;
    percentUsed: number;
    threshold: number; // 0, 25, 50, 75, 100
    pool: number;
    isApproved: boolean;
    projectName?: string;
    planType?: string;
  }>({
    totalUsed: 0,
    remaining: TOTAL_CREDIT_POOL,
    percentUsed: 0,
    threshold: 0,
    pool: TOTAL_CREDIT_POOL,
    isApproved: false,
    projectName: undefined,
    planType: 'Trial'
  });

  const [isHovered, setIsHovered] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [subscriptionSent, setSubscriptionSent] = useState(false);
  const [validityInfo, setValidityInfo] = useState(() => getBasicPlanValidity());

  const getResolvedEmail = () => {
    return (
      currentUserEmail || 
      (typeof window !== 'undefined' ? (window as any).__automatiqa_user_email || localStorage.getItem('automatiqa_user_email') : '') || 
      'sowbarnya@qaoncloud.com'
    ).toLowerCase().trim();
  };

  const calculateCredits = () => {
    const email = getResolvedEmail();
    let effectiveProjName = activeProject?.name || (activeProject as any)?.data?.name || (typeof window !== 'undefined' ? (window as any).__automatiqa_active_project_name || localStorage.getItem('automatiqa_active_project_name') : '') || undefined;
    if (effectiveProjName === 'undefined' || effectiveProjName === 'UNDEFINED' || effectiveProjName === 'null') {
      effectiveProjName = undefined;
    }
    let effectiveProjId = activeProject?.id || (typeof window !== 'undefined' ? (window as any).__automatiqa_active_project_id || localStorage.getItem('automatiqa_active_project_id') : '') || undefined;

    if (!effectiveProjName && !effectiveProjId) {
      effectiveProjName = getActiveProjectName();
    }
    if (effectiveProjName === 'undefined' || effectiveProjName === 'UNDEFINED' || effectiveProjName === 'null') {
      effectiveProjName = 'Project - Pradee';
    }

    // If an active project is selected, calculate credits specifically for that project
    if (effectiveProjName) {
      const projSummary = getProjectCreditSummary(effectiveProjId, effectiveProjName);
      const totalUsed = projSummary.usedCredits;
      const pool = projSummary.totalPool;
      const remaining = projSummary.remainingCredits;
      const percentUsed = projSummary.percentageUsed;

      const remainingPercent = pool > 0 ? (remaining / pool) * 100 : (100 - percentUsed);

      let threshold = 0;
      if (projSummary.isGated || projSummary.isExpired || remaining <= 0 || percentUsed >= 100) {
        threshold = 100;
      } else if (remainingPercent <= 25) {
        threshold = 25;
      } else if (remainingPercent <= 50) {
        threshold = 50;
      }

      // Check if project has a pending subscription request
      const pIdLower = (effectiveProjId || '').toLowerCase().trim();
      const pNameLower = (effectiveProjName || '').toLowerCase().trim();
      const pending = getLocalSubscriptionRequests().find(r => {
        const rId = (r.projectId || '').toLowerCase().trim();
        const rName = (r.projectName || '').toLowerCase().trim();
        const isMatch = (pIdLower && rId === pIdLower) || (pNameLower && rName === pNameLower);
        return isMatch && (r.status === 'PENDING' || r.status === 'pending');
      });

      setCreditsState({
        totalUsed,
        remaining,
        percentUsed,
        threshold,
        pool,
        isApproved: !projSummary.isGated,
        projectName: effectiveProjName,
        planType: projSummary.planType
      });
      setValidityInfo({
        planName: `${projSummary.planType} Plan`,
        creditPoints: pool,
        trialDays: projSummary.planType === 'Trial' ? 7 : 0,
        activePackDays: projSummary.validityDays,
        totalValidityDays: projSummary.validityDays,
        startTimestamp: projSummary.cycleStartTimestamp,
        startDateFormatted: projSummary.cycleStartDateFormatted,
        trialEndTimestamp: projSummary.cycleEndTimestamp,
        trialEndDateFormatted: projSummary.cycleEndDateFormatted,
        packEndTimestamp: projSummary.cycleEndTimestamp,
        packEndDateFormatted: projSummary.cycleEndDateFormatted,
        daysElapsed: projSummary.daysElapsed,
        daysRemaining: projSummary.daysRemaining,
        isTrialPhase: projSummary.planType === 'Trial',
        isActivePackPhase: !projSummary.isExpired,
        isExpired: projSummary.isExpired,
        phaseLabel: projSummary.isExpired ? 'Plan Expired (Renewal Required)' : `${projSummary.planType} Plan (${projSummary.daysRemaining} Days Left)`,
        validityBadgeClass: projSummary.isExpired ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
      });
      setSubscriptionSent(Boolean(pending));
      return;
    }

    // Fallback: Global user credit summary
    const summary = getUserCreditSummary(email);
    const activeSub = getActiveUserSubscription(email);

    const totalUsed = summary.usedCredits;
    const pool = summary.totalPool;
    const remaining = summary.remainingCredits;
    const percentUsed = summary.percentageUsed;

    const remainingPercent = pool > 0 ? (remaining / pool) * 100 : (100 - percentUsed);

    let threshold = 0;
    if (summary.isExceeded || remaining <= 0 || percentUsed >= 100) {
      threshold = 100;
    } else if (remainingPercent <= 25) {
      threshold = 25;
    } else if (remainingPercent <= 50) {
      threshold = 50;
    }

    const isApproved = Boolean(activeSub && activeSub.status === 'APPROVED');
    const resolvedPlanType: PlanType = (summary.planName && summary.planName.toLowerCase().includes('paid')) || pool > 100 ? 'Paid' : 'Trial';

    setCreditsState({
      totalUsed,
      remaining,
      percentUsed,
      threshold,
      pool,
      isApproved,
      projectName: undefined,
      planType: resolvedPlanType
    });
    setValidityInfo(summary.validity);

    // Check if subscription request was already sent for this user
    if (email) {
      const pending = getLocalSubscriptionRequests().find(r => r.userEmail === email && (r.status === 'PENDING' || r.status === 'pending'));
      if (pending) {
        setSubscriptionSent(true);
      } else if (isApproved) {
        setSubscriptionSent(false);
      }
    }
  };

  useEffect(() => {
    // Initial fetch of project plans and subscriptions so team members retrieve latest Paid plans immediately
    Promise.all([
      getProjectPlans().catch(() => []),
      getSubscriptionRequests().catch(() => [])
    ]).then(() => {
      calculateCredits();
    }).catch(() => {
      calculateCredits();
    });

    const handleUpdate = () => {
      calculateCredits();
    };

    const handleLimitExceeded = () => {
      const email = getResolvedEmail();
      const current = getUserCreditSummary(email);
      // Only pop open modal if genuinely exceeded after checking active subscriptions
      if (current.isExceeded) {
        calculateCredits();
        setIsModalOpen(true);
      } else {
        calculateCredits();
      }
    };

    // Real-time Firestore subscription listener
    const unsubscribeSubs = subscribeToSubscriptionRequests(() => {
      calculateCredits();
    });

    // Real-time Firestore project plans listener (for instant plan upgrades by Super Admin)
    const unsubscribePlans = subscribeToProjectPlans(() => {
      calculateCredits();
    });

    window.addEventListener('storage', handleUpdate);
    window.addEventListener('token-consumption-updated', handleUpdate);
    window.addEventListener('credit-limit-exceeded', handleLimitExceeded);
    window.addEventListener('subscription-request-updated', handleUpdate);
    window.addEventListener('user-credit-cycle-reset', handleUpdate);
    window.addEventListener('project-plan-updated', handleUpdate);
    
    // Periodic check every 5 seconds to guarantee synchronization across all browser tabs
    const interval = setInterval(() => {
      getProjectPlans().then(() => {
        calculateCredits();
      }).catch(() => {
        calculateCredits();
      });
    }, 5000);

    return () => {
      unsubscribeSubs();
      unsubscribePlans();
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('token-consumption-updated', handleUpdate);
      window.removeEventListener('credit-limit-exceeded', handleLimitExceeded);
      window.removeEventListener('subscription-request-updated', handleUpdate);
      window.removeEventListener('user-credit-cycle-reset', handleUpdate);
      window.removeEventListener('project-plan-updated', handleUpdate);
      clearInterval(interval);
    };
  }, [currentUserEmail, currentUserName, activeProject?.id, activeProject?.name]);

  const { totalUsed, remaining, percentUsed, threshold, pool, isApproved, projectName, planType } = creditsState;

  const handleSubscribeClick = async () => {
    setIsSubscribing(true);
    try {
      const email = getResolvedEmail();
      const name = currentUserName || email.split('@')[0] || 'User';
      if (activeProject?.name) {
        await createSubscriptionRequest(
          email, 
          name, 
          totalUsed, 
          `Project "${activeProject.name}" credits exhausted. User requested subscription re-enablement.`,
          {
            projectId: activeProject.id,
            projectName: activeProject.name,
            planRequested: 'Paid',
            creditsRequested: 1000
          }
        );
      } else {
        await createSubscriptionRequest(email, name, totalUsed, 'User clicked Subscribe to re-enable 1,000 credits & 30-day validity.');
      }
      setSubscriptionSent(true);
      calculateCredits();
    } catch (e) {
      console.error("Failed to submit subscription request:", e);
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleSyncSubscription = async () => {
    setIsSyncing(true);
    try {
      const email = getResolvedEmail();
      await syncSubscriptionState(email);
      calculateCredits();
    } catch (e) {
      console.warn("Sync error:", e);
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  // Configure clear format text and color themes based on threshold
  let badgeClasses = 'bg-teal-50 border-teal-200/90 text-teal-950 hover:bg-teal-100/70';
  let dotColor = 'bg-teal-500 animate-pulse';
  let iconColor = 'text-teal-600';
  let alertPrefix = 'Credit Status';
  let IconComponent = Coins;

  if (threshold >= 100) {
    badgeClasses = 'bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100 animate-pulse';
    dotColor = 'bg-rose-600';
    iconColor = 'text-rose-600';
    alertPrefix = '100% Credit Limit Reached';
    IconComponent = ShieldAlert;
  } else if (threshold >= 75) {
    badgeClasses = 'bg-orange-50 border-orange-300 text-orange-950 hover:bg-orange-100';
    dotColor = 'bg-orange-600 animate-pulse';
    iconColor = 'text-orange-600';
    alertPrefix = '75% Credit Alert';
    IconComponent = AlertTriangle;
  } else if (threshold >= 50) {
    badgeClasses = 'bg-amber-50 border-amber-300 text-amber-950 hover:bg-amber-100';
    dotColor = 'bg-amber-500 animate-pulse';
    iconColor = 'text-amber-600';
    alertPrefix = '50% Credit Alert';
    IconComponent = AlertTriangle;
  } else if (threshold >= 25) {
    badgeClasses = 'bg-indigo-50 border-indigo-200 text-indigo-950 hover:bg-indigo-100';
    dotColor = 'bg-indigo-500';
    iconColor = 'text-indigo-600';
    alertPrefix = '25% Credit Alert';
    IconComponent = AlertCircle;
  }

  return (
    <>
      <div 
        className="relative inline-flex items-center"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Permanent Text Label in Clear Format */}
        <div 
          id="permanent-credit-alert-label"
          onClick={() => setIsModalOpen(true)}
          className={`flex items-center gap-2.5 px-4 py-2 rounded-full border text-[11px] font-black uppercase tracking-wider transition-all duration-200 shadow-sm cursor-pointer select-none ${badgeClasses}`}
          title="Click to view Credit Allocation & Subscription details"
        >
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`w-2 h-2 rounded-full ${dotColor}`} />
            <IconComponent size={14} className={iconColor} />
          </div>

          {/* Clear Text Format Display */}
          <div className="flex items-center gap-2">
            {projectName && projectName !== 'undefined' && projectName !== 'UNDEFINED' && (
              <span className="px-2 py-0.5 rounded-md bg-slate-900/10 text-slate-800 text-[10px] font-black uppercase tracking-tight flex items-center gap-1">
                <Layers size={11} /> {projectName}
              </span>
            )}
            {threshold >= 25 ? (
              <>
                <span className="font-black text-slate-900 tracking-tight">
                  {alertPrefix}:
                </span>
                <span className="font-mono font-bold text-slate-800">
                  {totalUsed} / {pool} Used
                </span>
                <span className="text-slate-400 font-normal">|</span>
                <span className={`font-mono font-black ${threshold >= 100 ? 'text-rose-700 font-extrabold' : threshold >= 75 ? 'text-orange-700' : 'text-amber-700'}`}>
                  {remaining} Rem ({percentUsed}%)
                </span>
              </>
            ) : (
              <>
                <span className="font-bold text-teal-800 tracking-tight">
                  Credits:
                </span>
                <span className="font-mono font-extrabold text-teal-950">
                  {remaining} / {pool} Rem
                </span>
                <span className="text-teal-300 font-normal">|</span>
                <span className="font-mono text-teal-700 font-bold">
                  {totalUsed} Used ({percentUsed}%)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Hover Info Tooltip Card */}
        {isHovered && !isModalOpen && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-slate-800 z-[9999] animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <Coins size={15} className="text-[#00E1C5]" />
                <span className="text-xs font-black uppercase tracking-wider text-white">Credit Allocation</span>
              </div>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${isApproved ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : threshold >= 100 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : threshold >= 75 ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' : threshold >= 25 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'}`}>
                {isApproved ? 'Subscription Active' : `${percentUsed}% Used`}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>Total Plan Pool:</span>
                <span className="font-mono font-bold text-white">{pool} Credits</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Consumed Credits:</span>
                <span className="font-mono font-bold text-amber-400">{totalUsed} Credits</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Remaining Credits:</span>
                <span className="font-mono font-bold text-[#00E1C5]">{remaining} Credits</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Plan Validity:</span>
                <span className="font-bold text-slate-300">{validityInfo.daysRemaining} Days Left</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-800 h-2 rounded-full mt-3 overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${threshold >= 100 ? 'bg-rose-500' : threshold >= 75 ? 'bg-orange-500' : threshold >= 50 ? 'bg-amber-500' : threshold >= 25 ? 'bg-indigo-500' : 'bg-[#00E1C5]'}`}
                style={{ width: `${percentUsed}%` }}
              />
            </div>

            <button 
              onClick={() => setIsModalOpen(true)}
              className="mt-3 w-full py-2 bg-gradient-to-r from-[#00E1C5] to-teal-500 hover:opacity-90 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md"
            >
              <Coins size={14} /> Open Credit Allocation <ArrowRight size={12} />
            </button>
          </div>
        )}
      </div>

      {/* CREDIT ALLOCATION & SUBSCRIBE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className={`p-6 text-white relative overflow-hidden ${isApproved ? 'bg-gradient-to-br from-teal-950 via-slate-900 to-slate-900' : threshold >= 100 ? 'bg-gradient-to-br from-rose-950 via-slate-900 to-slate-900' : 'bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900'}`}>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg font-black text-xl ${isApproved ? 'bg-emerald-400 text-slate-950' : threshold >= 100 ? 'bg-rose-600 text-white' : 'bg-[#00E1C5] text-slate-950'}`}>
                  {isApproved ? <CheckCircle2 size={26} /> : threshold >= 100 ? <ShieldAlert size={26} /> : <Coins size={26} />}
                </div>
                <div>
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${isApproved ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : 'bg-white/10 text-[#00E1C5] border-white/10'}`}>
                    <Crown size={12} /> {projectName ? `${projectName} • ${planType || 'Trial'} Plan` : isApproved ? 'Subscription Active & Approved' : 'Basic Plan Allocation'}
                  </div>
                  <h3 className="text-xl font-black text-white mt-1">
                    {projectName 
                      ? (threshold >= 100 ? `Project Credits Exhausted (${pool} pts)` : `Credit Allocation: ${projectName}`)
                      : (isApproved ? 'Subscription Re-Enabled' : threshold >= 100 ? '1,000 Credit Limit Exceeded' : 'Credit Allocation Status')}
                  </h3>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Credit Status Summary Cards */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Total Pool</span>
                  <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">{pool}</span>
                  <span className="text-[10px] text-slate-500 font-medium">Credits</span>
                </div>

                <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-2xl">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block">Used</span>
                  <span className="text-xl font-black text-amber-600 font-mono mt-0.5 block">{totalUsed}</span>
                  <span className="text-[10px] text-amber-700 font-bold">{percentUsed}%</span>
                </div>

                <div className="p-3.5 bg-teal-50 border border-teal-200/80 rounded-2xl">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#008f7d] block">Remaining</span>
                  <span className="text-xl font-black text-[#00a693] font-mono mt-0.5 block">{remaining}</span>
                  <span className="text-[10px] text-[#008f7d] font-bold">Credits</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span>Quota Usage</span>
                  <span className={threshold >= 100 ? 'text-rose-600 font-black' : 'text-slate-900'}>
                    {percentUsed}% ({totalUsed} / {pool} Credits)
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${threshold >= 100 ? 'bg-gradient-to-r from-amber-500 to-rose-600' : 'bg-gradient-to-r from-teal-400 to-[#00E1C5]'}`}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>
              </div>

              {/* Dynamic Status Box */}
              {isApproved && threshold < 100 ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-black text-xs uppercase tracking-wider">
                    <CheckCircle2 size={15} className="text-emerald-600" /> Plan Active & Healthy
                  </div>
                  <p className="text-xs text-emerald-900 font-medium leading-relaxed">
                    {projectName 
                      ? `Project "${projectName}" has ${remaining} credits remaining on the ${planType || 'active'} plan with ${validityInfo.daysRemaining} days left in the current cycle.` 
                      : `Your subscription is active with ${remaining} credits remaining.`}
                  </p>
                </div>
              ) : threshold >= 100 ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-rose-800 font-black text-xs uppercase tracking-wider">
                    <AlertTriangle size={15} /> {pool} Credits Exhausted
                  </div>
                  <p className="text-xs text-rose-700 font-medium leading-relaxed">
                    {projectName 
                      ? `All ${pool} credits for project "${projectName}" have been exceeded. AI Generations, Downloads, and Copy are blocked until a Super Admin renews or changes the plan.` 
                      : `You have reached the maximum credit limit. AI Generations, Downloads, and Copy are blocked until a Super Admin renews or changes the plan.`}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium pt-1">
                    * Remaining actions (manual test cases, executions, reports, and dashboards) remain operational until plan validity expires.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs space-y-1.5 text-slate-600">
                  <div className="flex items-center gap-2 text-slate-900 font-bold">
                    <CheckCircle2 size={14} className="text-teal-600" /> Plan Validity: {validityInfo.daysRemaining} Days Remaining
                  </div>
                  <p className="font-medium text-slate-500">
                    {projectName ? `Project cycle expires on ${validityInfo.packEndDateFormatted || 'scheduled date'}.` : 'The active cycle includes full access across all AI generator modules.'}
                  </p>
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="pt-2 space-y-3">
                {isApproved || threshold < 100 ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSyncSubscription}
                      disabled={isSyncing}
                      className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                      {isSyncing ? 'Syncing...' : 'Sync Subscription Status'}
                    </button>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="py-3 px-5 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 rounded-2xl font-black text-xs uppercase tracking-wider transition-all"
                    >
                      Close
                    </button>
                  </div>
                ) : subscriptionSent ? (
                  <div className="space-y-3">
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 animate-in fade-in duration-300">
                      <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wide">
                          Subscription Request Pending Super Admin Approval
                        </h4>
                        <p className="text-xs text-emerald-800 font-medium leading-relaxed">
                          {projectName 
                            ? `Your request to re-enable "${projectName}" with a fresh 1,000 Credit Paid Plan has been submitted. Super Admin must re-enable it before new points and plan are added.`
                            : 'Super Admin (automatiqa@qaoncloud.com) has received your request. Once re-enabled by the Super Admin, your new credits will become active.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleSyncSubscription}
                      disabled={isSyncing}
                      className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                      {isSyncing ? 'Checking status...' : 'Check If Approved by Admin'}
                    </button>
                  </div>
                ) : (
                  <button
                    id="credit-allocation-subscribe-button"
                    onClick={handleSubscribeClick}
                    disabled={isSubscribing}
                    className="w-full py-3.5 bg-gradient-to-r from-[#00E1C5] to-teal-500 hover:from-[#00cbb2] hover:to-teal-600 text-slate-950 rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg shadow-teal-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {isSubscribing ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" /> Submitting Request...
                      </>
                    ) : (
                      <>
                        <Send size={16} /> Subscribe (Notify Super Admin to Re-Enable)
                      </>
                    )}
                  </button>
                )}

                {/* Secondary Action */}
                {onNavigateToCredits && (
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      onNavigateToCredits();
                    }}
                    className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    View Detailed Credit Analytics <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const CreditAlertLabel = CreditAlertBanner;
export default CreditAlertBanner;

