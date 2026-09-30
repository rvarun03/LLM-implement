import { collection } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { cleanFirestoreData } from "./projectService";
import { syncAddDoc } from "./firestoreSync";

/**
 * Formats a user name or email to ensure only a clean user name is returned (stripping email domain if present).
 */
export const formatUserName = (userName?: string, userEmail?: string): string => {
  if (userName && typeof userName === 'string' && userName.trim()) {
    let name = userName.trim();
    if (name.includes('@')) {
      name = name.split('@')[0];
    }
    return name;
  }
  if (userEmail && typeof userEmail === 'string' && userEmail.trim()) {
    return userEmail.trim().split('@')[0];
  }
  return 'User';
};

/**
 * Logs a user activity to the global activity stream in Firestore.
 */
export const logActivity = async (
  userEmail: string, 
  userName: string, 
  action: string, 
  projectId: string, 
  projectName: string
) => {
  // Defensive swap if userEmail and userName were inverted
  let email = userEmail;
  let name = userName;
  if (userEmail && typeof userEmail === 'string' && !userEmail.includes('@') && userName && typeof userName === 'string' && userName.includes('@')) {
    email = userName;
    name = userEmail;
  }

  const cleanUserName = formatUserName(name, email);

  const path = "activities";
  try {
    await syncAddDoc(collection(db, path), cleanFirestoreData({
      userEmail: email || '',
      userName: cleanUserName,
      action,
      projectId,
      projectName,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};