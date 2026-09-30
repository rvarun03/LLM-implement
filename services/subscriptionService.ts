import { collection, doc, getDocs, getDoc, setDoc, query, orderBy, onSnapshot } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { SubscriptionRequest, NotificationType, UserRole } from "../types";
import { syncSetDoc, syncUpdateDoc, syncDeleteDoc } from "./firestoreSync";
import { createNotification, notifyAdmins } from "./notificationService";
import { formatToIST, TOTAL_CREDIT_POOL } from "./tokenConsumptionService";
import { logActivity } from "./activityService";

const LOCAL_STORAGE_KEY = 'automatiqa_subscription_requests';

// In-memory / local fallback store
export const getLocalSubscriptionRequests = (): SubscriptionRequest[] => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const saveLocalSubscriptionRequests = (requests: SubscriptionRequest[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(requests));
    window.dispatchEvent(new CustomEvent('subscription-request-updated', { detail: requests }));
  } catch (e) {
    console.warn("Failed to save local subscription requests:", e);
  }
};

/**
 * Fetch all subscription requests from Firestore (with local storage fallback)
 */
export const getSubscriptionRequests = async (): Promise<SubscriptionRequest[]> => {
  const path = "subscription_requests";
  try {
    const snap = await getDocs(query(collection(db, path)));
    if (!snap.empty) {
      const requests: SubscriptionRequest[] = [];
      const localMap = new Map<string, SubscriptionRequest>();
      getLocalSubscriptionRequests().forEach(r => {
        if (r.id) localMap.set(r.id.toLowerCase().trim(), r);
      });

      snap.forEach(d => {
        const item = { id: d.id, ...(d.data() as any) };
        const localItem = localMap.get(d.id.toLowerCase().trim());
        // If local state marked it APPROVED, respect APPROVED to prevent stale pending resurrects
        if (localItem && localItem.status === 'APPROVED' && (item.status === 'PENDING' || item.status === 'pending')) {
          item.status = 'APPROVED';
          try {
            syncSetDoc(doc(db, "subscription_requests", d.id), { status: 'APPROVED' }, { merge: true }).catch(() => {});
          } catch (e) {}
        }
        requests.push(item);
      });
      // Sort newest first
      requests.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
      saveLocalSubscriptionRequests(requests);
      return requests;
    }
  } catch (error) {
    console.warn("Failed to fetch subscription requests from Firestore:", error);
  }
  return getLocalSubscriptionRequests();
};

/**
 * Real-time listener for subscription requests in Firestore
 */
export const subscribeToSubscriptionRequests = (callback?: (requests: SubscriptionRequest[]) => void) => {
  try {
    const q = query(collection(db, "subscription_requests"));
    return onSnapshot(q, (snapshot) => {
      const requests: SubscriptionRequest[] = [];
      const localMap = new Map<string, SubscriptionRequest>();
      getLocalSubscriptionRequests().forEach(r => {
        if (r.id) localMap.set(r.id.toLowerCase().trim(), r);
      });

      snapshot.forEach(d => {
        const item = { id: d.id, ...(d.data() as any) };
        const localItem = localMap.get(d.id.toLowerCase().trim());
        if (localItem && localItem.status === 'APPROVED' && (item.status === 'PENDING' || item.status === 'pending')) {
          item.status = 'APPROVED';
          try {
            syncSetDoc(doc(db, "subscription_requests", d.id), { status: 'APPROVED' }, { merge: true }).catch(() => {});
          } catch (e) {}
        }
        requests.push(item);
      });
      requests.sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
      saveLocalSubscriptionRequests(requests);
      if (callback) {
        callback(requests);
      }
    }, (err) => {
      console.warn("Firestore subscription_requests listener error:", err);
      if (callback) {
        callback(getLocalSubscriptionRequests());
      }
    });
  } catch (e) {
    console.warn("Failed to subscribe to subscription_requests:", e);
    if (callback) {
      callback(getLocalSubscriptionRequests());
    }
    return () => {};
  }
};

/**
 * Retrieves the currently active approved subscription or cycle renewal for a user, if any exists.
 * Compares all records to return the one with the latest approval/renewal timestamp.
 */
export const getActiveUserSubscription = (userEmail?: string): SubscriptionRequest | null => {
  if (!userEmail) return null;
  const cleanEmail = userEmail.toLowerCase().trim();
  const requests = getLocalSubscriptionRequests();
  
  // 1. Find approved requests for this user in request records
  const approved = requests.filter(r => 
    (r.userEmail || '').toLowerCase().trim() === cleanEmail && 
    r.status === 'APPROVED'
  );
  
  let latestFromRequests: SubscriptionRequest | null = null;
  if (approved.length > 0) {
    approved.sort((a, b) => (b.approvedAt || b.requestedAt || 0) - (a.approvedAt || a.requestedAt || 0));
    latestFromRequests = approved[0];
  }

  // 2. Check dedicated credit cycle metadata
  let latestFromCycle: SubscriptionRequest | null = null;
  try {
    const rawCycle = localStorage.getItem(`automatiqa_credit_cycle_${cleanEmail}`);
    if (rawCycle) {
      const cycleMeta = JSON.parse(rawCycle);
      if (cycleMeta && cycleMeta.cycleStartTimestamp) {
        latestFromCycle = {
          id: `cycle_${cycleMeta.cycleStartTimestamp}`,
          userEmail: cleanEmail,
          userName: cleanEmail.split('@')[0],
          requestedAt: cycleMeta.cycleStartTimestamp,
          requestedDateFormatted: cycleMeta.cycleStartDateFormatted || formatToIST(cycleMeta.cycleStartTimestamp),
          status: 'APPROVED',
          creditsRequested: cycleMeta.allocatedCredits || 1000,
          creditsGranted: cycleMeta.allocatedCredits || 1000,
          currentUsedCredits: 0,
          planName: 'AutomatiQA 1,000 Credit Pack (30-Day Validity)',
          approvedAt: cycleMeta.cycleStartTimestamp,
          approvedBy: cycleMeta.renewedBy || 'Super Admin',
          validityDays: 30
        };
      }
    }
  } catch (e) {}

  // 3. Check local renewal metadata fallback
  let latestFromMeta: SubscriptionRequest | null = null;
  try {
    const raw = localStorage.getItem(`automatiqa_subscription_renewed_${cleanEmail}`);
    if (raw) {
      const meta = JSON.parse(raw);
      if (meta && meta.renewedAt) {
        latestFromMeta = {
          id: `local_renewed_${meta.renewedAt}`,
          userEmail: cleanEmail,
          userName: cleanEmail.split('@')[0],
          requestedAt: meta.renewedAt,
          requestedDateFormatted: formatToIST(meta.renewedAt),
          status: 'APPROVED',
          creditsRequested: meta.creditsGranted || 1000,
          creditsGranted: meta.creditsGranted || 1000,
          currentUsedCredits: 0,
          planName: 'AutomatiQA 1,000 Credit Pack (30-Day Validity)',
          approvedAt: meta.renewedAt,
          approvedBy: meta.renewedBy || 'Super Admin',
          validityDays: meta.validityDays || 30
        };
      }
    }
  } catch (e) {}

  // Compare timestamps across all sources to return the freshest active cycle
  const candidates = [latestFromRequests, latestFromCycle, latestFromMeta].filter(Boolean) as SubscriptionRequest[];
  if (candidates.length === 0) return null;
  
  candidates.sort((a, b) => (b.approvedAt || b.requestedAt || 0) - (a.approvedAt || a.requestedAt || 0));
  return candidates[0];
};

/**
 * Returns the exact timestamp when the user's current active credit cycle started.
 * If user has never been renewed, returns 0 (indicating initial cycle).
 */
export const getUserCycleStartTimestamp = (userEmail?: string): number => {
  const activeSub = getActiveUserSubscription(userEmail);
  return activeSub?.approvedAt || activeSub?.requestedAt || 0;
};

/**
 * Proactively forces a synchronization with Firestore to retrieve latest subscription status
 */
export const syncSubscriptionState = async (userEmail?: string): Promise<SubscriptionRequest | null> => {
  const requests = await getSubscriptionRequests();
  window.dispatchEvent(new CustomEvent('subscription-request-updated', { detail: requests }));
  window.dispatchEvent(new CustomEvent('token-consumption-updated'));
  return getActiveUserSubscription(userEmail);
};

/**
 * Create a new subscription renewal request when user or project exceeds credit limit
 */
export const createSubscriptionRequest = async (
  userEmail: string,
  userName: string,
  currentUsedCredits: number = 1000,
  notes?: string,
  projectInfo?: {
    projectId?: string;
    projectName?: string;
    planRequested?: 'Paid' | 'Trial';
    currentPlan?: 'Trial' | 'Paid';
    creditsRequested?: number;
  }
): Promise<SubscriptionRequest> => {
  const cleanEmail = userEmail.toLowerCase().trim();
  const now = Date.now();
  const dateFormatted = formatToIST(now);
  const pId = projectInfo?.projectId?.trim();
  const pName = projectInfo?.projectName?.trim();
  const planReq = projectInfo?.planRequested || 'Paid';
  const reqCredits = projectInfo?.creditsRequested || (planReq === 'Trial' ? 100 : 1000);

  const requestObj: SubscriptionRequest = {
    id: `sub_req_${now}_${Math.random().toString(36).substring(2, 7)}`,
    userEmail: cleanEmail,
    userName: userName || cleanEmail.split('@')[0],
    projectId: pId,
    projectName: pName,
    requestedByUserId: cleanEmail,
    requestedByUserEmail: cleanEmail,
    planRequested: planReq,
    currentPlan: projectInfo?.currentPlan || 'Trial',
    requestedAt: now,
    requestedDateFormatted: dateFormatted,
    requestedAtFormatted: dateFormatted,
    status: 'PENDING',
    creditsRequested: reqCredits,
    requestedCredits: reqCredits,
    currentUsedCredits,
    planName: pName 
      ? `Project Plan: ${pName} (${planReq} Plan - ${reqCredits} Credits)`
      : 'AutomatiQA 1,000 Credit Pack (30-Day Validity)',
    notes: notes || (pName 
      ? `Project "${pName}" credits exhausted. Requested re-enablement (${planReq} Plan).`
      : 'Exceeded credit limit. Requested subscription re-enablement.')
  };

  // 1. Save locally
  const currentRequests = getLocalSubscriptionRequests();
  const existingIdx = currentRequests.findIndex(r => {
    if (pId && r.projectId) {
      return (r.projectId === pId || (pName && r.projectName === pName)) && (r.status === 'PENDING' || r.status === 'pending');
    }
    return r.userEmail === cleanEmail && (r.status === 'PENDING' || r.status === 'pending');
  });

  if (existingIdx >= 0) {
    currentRequests[existingIdx] = requestObj;
  } else {
    currentRequests.unshift(requestObj);
  }
  saveLocalSubscriptionRequests(currentRequests);

  // 2. Save to Firestore
  try {
    const ref = doc(db, "subscription_requests", requestObj.id);
    await syncSetDoc(ref, requestObj);
  } catch (err) {
    console.warn("Failed to sync subscription request to Firestore:", err);
  }

  // 3. If tied to a project, notify backend endpoint
  if (pId) {
    try {
      await fetch(`/api/credits/project-plan/${encodeURIComponent(pId)}/request-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedPlanType: planReq,
          userEmail: cleanEmail,
          userName: userName || cleanEmail.split('@')[0],
          projectName: pName,
          message: requestObj.notes
        })
      });
    } catch (err) {
      console.warn("Backend project subscription endpoint notice warning:", err);
    }
  }

  // 4. Notify Super Admins
  try {
    const notifTitle = pName
      ? `🚨 Subscription Re-Enablement Request: ${pName}`
      : '🚨 Subscription Re-Enablement Request';
    const notifMsg = pName
      ? `User ${userName} (${cleanEmail}) requested to re-enable credits for project "${pName}". Credits are exhausted. Super Admin must re-enable this project to add new plan and points.`
      : `User ${userName} (${cleanEmail}) has exceeded their 1,000 credit limit and clicked Subscribe. Please re-enable their subscription in the Credit Consumption page.`;

    await notifyAdmins(
      notifTitle,
      notifMsg,
      userName || cleanEmail,
      NotificationType.SUBSCRIPTION_REQUEST
    );
  } catch (err) {
    console.warn("Failed to notify admins of subscription request:", err);
  }

  // 5. Also trigger backend notification / email route
  try {
    await fetch('/api/subscription/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userEmail: cleanEmail,
        userName,
        projectId: pId,
        projectName: pName,
        currentUsedCredits,
        notes: requestObj.notes
      })
    });
  } catch (err) {
    console.warn("Server subscription notify endpoint warning:", err);
  }

  // 6. Global events
  window.dispatchEvent(new CustomEvent('subscription-request-created', { detail: requestObj }));

  return requestObj;
};

/**
 * Super Admin Re-enables subscription for the user:
 * - Resets user's consumed credit tally to 0 (granting fresh 1,000 credits & 30-day validity)
 * - Updates request status to 'APPROVED'
 * - Sends in-app and email notification to the user
 */
export const reEnableUserSubscription = async (
  requestId: string,
  userEmail: string,
  userName?: string,
  adminEmail: string = 'automatiqa@qaoncloud.com',
  additionalCredits: number = 1000,
  validityDays: number = 30
): Promise<boolean> => {
  const cleanEmail = userEmail.toLowerCase().trim();
  const displayName = userName || cleanEmail.split('@')[0];
  const now = Date.now();
  const dateFormatted = formatToIST(now);

  // 1. Update request status in Firestore
  try {
    const targetRequestId = requestId || `sub_req_${now}`;
    const ref = doc(db, "subscription_requests", targetRequestId);
    await syncSetDoc(ref, {
      id: targetRequestId,
      userEmail: cleanEmail,
      userName: displayName,
      status: 'APPROVED',
      approvedAt: now,
      approvedAtFormatted: dateFormatted,
      approvedBy: adminEmail,
      creditsGranted: additionalCredits,
      validityDays,
      requestedCredits: additionalCredits,
      currentUsedCredits: 0,
      planName: 'AutomatiQA 1,000 Credit Pack (30-Day Validity)'
    }, { merge: true });

    // Also persist dedicated user credit cycle in Firestore
    const cycleRef = doc(db, "user_credit_cycles", cleanEmail);
    await syncSetDoc(cycleRef, {
      userEmail: cleanEmail,
      userName: displayName,
      cycleStartTimestamp: now,
      cycleStartDateFormatted: dateFormatted,
      allocatedCredits: additionalCredits,
      renewedBy: adminEmail,
      renewedAt: now,
      status: 'ACTIVE'
    }, { merge: true });
  } catch (err) {
    console.warn("Failed to update subscription request in Firestore:", err);
  }

  // 2. Update local requests (ensure approved record always exists)
  const currentReqs = getLocalSubscriptionRequests();
  let found = false;
  const localReqs = currentReqs.map(r => {
    if (r.id === requestId || (r.userEmail === cleanEmail && r.status === 'PENDING')) {
      found = true;
      return {
        ...r,
        status: 'APPROVED' as const,
        approvedAt: now,
        approvedAtFormatted: dateFormatted,
        approvedBy: adminEmail,
        creditsGranted: additionalCredits,
        validityDays,
        currentUsedCredits: 0
      };
    }
    return r;
  });

  if (!found) {
    localReqs.unshift({
      id: requestId || `sub_req_${now}`,
      userEmail: cleanEmail,
      userName: displayName,
      requestedAt: now,
      requestedDateFormatted: dateFormatted,
      status: 'APPROVED' as const,
      requestedCredits: additionalCredits,
      creditsGranted: additionalCredits,
      currentUsedCredits: 0,
      planName: 'AutomatiQA 1,000 Credit Pack (30-Day Validity)',
      approvedAt: now,
      approvedAtFormatted: dateFormatted,
      approvedBy: adminEmail,
      validityDays
    });
  }
  saveLocalSubscriptionRequests(localReqs);

  // 3. Register Subscription Renewal & Credit Cycle Metadata
  try {
    // Preserve all historical credit consumption logs for auditing and reporting.
    // Subscription validity & credit pool logic automatically uses `approvedAt` / `renewedAt`
    // to calculate consumption for the new billing cycle without destroying past records.
    localStorage.setItem(`automatiqa_subscription_renewed_${cleanEmail}`, JSON.stringify({
      renewedAt: now,
      renewedBy: adminEmail,
      creditsGranted: additionalCredits,
      validityDays
    }));

    localStorage.setItem(`automatiqa_credit_cycle_${cleanEmail}`, JSON.stringify({
      cycleStartTimestamp: now,
      cycleStartDateFormatted: dateFormatted,
      allocatedCredits: additionalCredits,
      renewedBy: adminEmail,
      renewedAt: now
    }));

    // Dispatch global events so all components immediately update to 0 Used / 1000 Remaining
    window.dispatchEvent(new CustomEvent('token-consumption-updated', { 
      detail: { creditReset: true, userEmail: cleanEmail, cycleStartTimestamp: now } 
    }));
    window.dispatchEvent(new CustomEvent('subscription-request-updated', { detail: localReqs }));
    window.dispatchEvent(new CustomEvent('user-credit-cycle-reset', { 
      detail: { userEmail: cleanEmail, cycleStartTimestamp: now } 
    }));
  } catch (e) {
    console.warn("Failed to set subscription renewal metadata for user:", e);
  }

  // 4. Send In-App Notification to User
  try {
    await createNotification({
      recipientEmail: cleanEmail,
      senderName: 'Super Admin',
      type: NotificationType.SUBSCRIPTION_APPROVED,
      title: '🎉 Subscription Re-Enabled by Super Admin',
      message: `Your AutomatiQA subscription has been successfully renewed and re-enabled by Super Admin! You now have a fresh pool of ${additionalCredits} AI generation credits and ${validityDays} days of validity.`
    });
  } catch (err) {
    console.warn("Failed to create user approval notification:", err);
  }

  // 5. Trigger Backend Email/Notification Route
  try {
    const localReqs = getLocalSubscriptionRequests();
    const matchedReq = localReqs.find(r => r.id === requestId || r.userEmail === cleanEmail);

    await fetch('/api/subscription/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        userEmail: cleanEmail,
        userName: displayName,
        adminEmail,
        adminName: 'Super Admin',
        creditsGranted: additionalCredits,
        projectId: matchedReq?.projectId,
        projectName: matchedReq?.projectName
      })
    });
  } catch (err) {
    console.warn("Server subscription approve endpoint warning:", err);
  }

  // 6. Log Activity
  try {
    await logActivity(
      adminEmail,
      'Super Admin',
      `Re-enabled subscription for ${cleanEmail} (+${additionalCredits} Credits & ${validityDays} Days Validity)`,
      'global',
      'Global Subscription'
    );
  } catch (e) {}

  return true;
};

/**
 * Super Admin directly grants credits or renews subscription for any user without a pending request
 */
export const grantDirectSubscription = async (
  userEmail: string,
  userName?: string,
  adminEmail: string = 'automatiqa@qaoncloud.com',
  credits: number = 1000,
  validityDays: number = 30
): Promise<boolean> => {
  const dummyRequestId = `direct-sub-${Date.now()}`;
  return reEnableUserSubscription(dummyRequestId, userEmail, userName, adminEmail, credits, validityDays);
};
