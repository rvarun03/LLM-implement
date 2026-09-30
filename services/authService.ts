import { 
  onAuthStateChanged, 
  onIdTokenChanged, 
  signOut, 
  User as FirebaseUser 
} from "firebase/auth";
import { auth } from "../firebase";
import { User, UserRole } from "../types";

/**
 * Safe, privacy-compliant diagnostic logging.
 * NEVER logs passwords, tokens, API keys, secrets, or sensitive credentials.
 */
export function logAuthDiagnostic(event: string, details?: Record<string, any>) {
  try {
    const sanitizedDetails = details ? { ...details } : {};
    delete (sanitizedDetails as any).password;
    delete (sanitizedDetails as any).token;
    delete (sanitizedDetails as any).idToken;
    delete (sanitizedDetails as any).refreshToken;
    delete (sanitizedDetails as any).apiKey;
    delete (sanitizedDetails as any).secret;

    const projectId = (auth.app.options as any)?.projectId || 'unknown';
    console.log(`[AUTH-DIAGNOSTIC] [${projectId}] ${event}`, sanitizedDetails);
  } catch (e) {
    // Fail silently without disrupting execution
  }
}

/**
 * Cleans ONLY stale authentication and session keys from LocalStorage and SessionStorage.
 * Does NOT clear project backups, project cache, user settings, or any application data.
 */
export function clearStaleAuthSession(options?: { clearFirebaseSdkStorage?: boolean }) {
  try {
    const authKeys = [
      'automatiqa_user',
      'automatiqa_user_name',
      'automatiqa_user_email',
      'automatiqa_user_id',
    ];

    authKeys.forEach(k => {
      try { sessionStorage.removeItem(k); } catch (e) {}
      try { localStorage.removeItem(k); } catch (e) {}
    });

    if (typeof window !== 'undefined') {
      try {
        delete (window as any).__automatiqa_user;
        delete (window as any).__automatiqa_user_name;
        delete (window as any).__automatiqa_user_email;
        delete (window as any).__automatiqa_user_id;
      } catch (e) {}
    }

    // If requested or if the SDK encountered corrupted local credentials, remove only firebase auth user keys
    if (options?.clearFirebaseSdkStorage) {
      try {
        const apiKey = (auth.app.options as any)?.apiKey || '';
        if (apiKey) {
          localStorage.removeItem(`firebase:authUser:${apiKey}:[DEFAULT]`);
        }
        // Remove any other firebase auth-specific keys without clearing app data (iterate backwards to avoid shifting index bugs)
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('firebase:authUser:') || key.startsWith('firebase:host:'))) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {}
    }

    logAuthDiagnostic('Stale auth session keys cleaned from browser storage');
  } catch (err) {
    console.warn("[AUTH] Error cleaning stale auth session:", err);
  }
}

/**
 * Promise that resolves once Firebase Auth has completed its initial state evaluation.
 * Prevents race conditions where API requests are dispatched before auth state is ready.
 */
let isAuthInitialized = false;
let authReadyPromise: Promise<FirebaseUser | null> | null = null;

export function waitForAuthReady(): Promise<FirebaseUser | null> {
  if (isAuthInitialized && auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          isAuthInitialized = true;
          unsubscribe();
          resolve(user);
        },
        (error) => {
          isAuthInitialized = true;
          unsubscribe();
          logAuthDiagnostic('Auth initialization error', { message: error?.message });
          resolve(null);
        }
      );
    });
  }
  return authReadyPromise;
}

/**
 * Obtains the current valid Firebase ID token.
 * Optionally forces a refresh to recover from token expiration (401/403).
 */
export async function getValidAuthToken(forceRefresh = false): Promise<string | null> {
  try {
    let currentUser = auth.currentUser;
    if (!currentUser && !isAuthInitialized) {
      currentUser = await waitForAuthReady();
    }

    if (!currentUser) {
      return null;
    }

    const token = await currentUser.getIdToken(forceRefresh);
    if (forceRefresh) {
      logAuthDiagnostic('Firebase ID token refreshed', { email: currentUser.email });
    }
    return token;
  } catch (error: any) {
    logAuthDiagnostic('Failed to retrieve Firebase ID token', {
      code: error?.code,
      message: error?.message,
      forceRefresh
    });
    return null;
  }
}

/**
 * Global listener for ID token changes to handle automatic refresh events
 * and session state transitions reliably.
 */
let idTokenListenerInitialized = false;
export function initAuthTokenListener(onSessionInvalid?: () => void) {
  if (idTokenListenerInitialized) return;
  idTokenListenerInitialized = true;

  try {
    onIdTokenChanged(auth, async (user) => {
      if (user) {
        logAuthDiagnostic('Auth ID token state changed: user authenticated', { email: user.email });
        try {
          const token = await user.getIdToken();
          if (token) {
            // Token is active and valid
          }
        } catch (tokenErr: any) {
          logAuthDiagnostic('Failed to obtain token on id token change', {
            code: tokenErr?.code,
            message: tokenErr?.message
          });
          if (tokenErr?.code === 'auth/user-token-expired' || tokenErr?.code === 'auth/user-disabled') {
            clearStaleAuthSession();
            if (onSessionInvalid) onSessionInvalid();
          }
        }
      } else {
        logAuthDiagnostic('Auth ID token state changed: no user session');
      }
    });
  } catch (e) {
    console.warn("[AUTH] Error initializing ID token listener:", e);
  }
}

/**
 * Safely logs out the current user, clears auth session keys, and leaves all project data intact.
 */
export async function performSafeLogout(): Promise<void> {
  logAuthDiagnostic('Initiating safe logout');
  try {
    await signOut(auth);
  } catch (error: any) {
    logAuthDiagnostic('Firebase signOut warning (proceeding with local cleanup)', { message: error?.message });
  }
  clearStaleAuthSession();
}
