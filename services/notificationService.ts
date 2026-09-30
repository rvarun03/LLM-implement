import { collection, doc, getDocs, query, where } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { NotificationType, AppNotification, UserRole } from "../types";
import { cleanFirestoreData } from "./projectService";
import { syncAddDoc, syncUpdateDoc, syncDeleteDoc } from "./firestoreSync";

/**
 * Creates a notification in Firestore.
 */
export const createNotification = async (notification: Omit<AppNotification, 'id' | 'isRead' | 'timestamp'>) => {
  const path = "notifications";
  try {
    await syncAddDoc(collection(db, path), cleanFirestoreData({
      ...notification,
      isRead: false,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

/**
 * Marks a specific notification as read.
 */
export const markAsRead = async (notificationId: string) => {
  const path = `notifications/${notificationId}`;
  try {
    const notificationRef = doc(db, "notifications", notificationId);
    await syncUpdateDoc(notificationRef, { isRead: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

/**
 * Marks all notifications for a recipient as read.
 */
export const markAllNotificationsAsRead = async (recipientEmail: string) => {
  if (!recipientEmail) return;
  const path = "notifications";
  try {
    const q = query(
      collection(db, path),
      where("recipientEmail", "==", recipientEmail.toLowerCase().trim()),
      where("isRead", "==", false)
    );
    const snap = await getDocs(q);
    const promises = snap.docs.map(d => syncUpdateDoc(doc(db, "notifications", d.id), { isRead: true }));
    await Promise.all(promises);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

/**
 * Deletes a single notification by ID.
 */
export const deleteNotification = async (notificationId: string) => {
  if (!notificationId) return;
  const path = `notifications/${notificationId}`;
  try {
    const notificationRef = doc(db, "notifications", notificationId);
    await syncDeleteDoc(notificationRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

/**
 * Deletes all notifications for a recipient.
 */
export const deleteAllNotifications = async (recipientEmail: string) => {
  if (!recipientEmail) return;
  const path = "notifications";
  try {
    const q = query(
      collection(db, path),
      where("recipientEmail", "==", recipientEmail.toLowerCase().trim())
    );
    const snap = await getDocs(q);
    const promises = snap.docs.map(d => syncDeleteDoc(doc(db, "notifications", d.id)));
    await Promise.all(promises);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

/**
 * Auto-deletes old or read notifications beyond retention threshold.
 * Default threshold: Read notifications older than 24h, or any notification older than 7 days (168h).
 */
export const autoDeleteOldNotifications = async (recipientEmail: string, maxAgeHours: number = 168) => {
  if (!recipientEmail) return;
  const path = "notifications";
  try {
    const q = query(
      collection(db, path),
      where("recipientEmail", "==", recipientEmail.toLowerCase().trim())
    );
    const snap = await getDocs(q);
    const now = Date.now();

    const deletePromises: Promise<void>[] = [];
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const createdTime = data.timestamp ? new Date(data.timestamp).getTime() : now;
      const ageHours = (now - createdTime) / (1000 * 60 * 60);

      // Delete if read and older than 24 hours, or if older than maxAgeHours (e.g. 7 days)
      if ((data.isRead && ageHours > 24) || ageHours > maxAgeHours) {
        deletePromises.push(syncDeleteDoc(doc(db, "notifications", docSnap.id)));
      }
    });

    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }
  } catch (error) {
    console.warn("Auto-delete notifications check failed:", error);
  }
};

/**
 * Helper to notify all admins about an event.
 */
export const notifyAdmins = async (title: string, message: string, senderName: string, type: NotificationType = NotificationType.USER_SIGNUP) => {
  const path = "users";
  try {
    const usersQuery = query(collection(db, path), where("role", "in", [UserRole.ADMIN, UserRole.SUPER_ADMIN]));
    const querySnapshot = await getDocs(usersQuery);
    
    const promises = querySnapshot.docs.map(userDoc => 
      createNotification({
        recipientEmail: userDoc.id,
        senderName,
        type,
        title,
        message
      })
    );
    
    await Promise.all(promises);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
};