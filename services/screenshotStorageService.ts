/**
 * Persistent Screenshot Storage Service for UI Testing.
 * Integrates directly with Firebase Storage for permanent binary persistence,
 * with synchronized Firestore metadata documents and IndexedDB offline caching.
 * Ensures screenshots remain viewable permanently across page refreshes, navigations,
 * user logouts/logins, and Cloud Run container restarts.
 */

import { storage, db } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { saveArtifact, getArtifact } from './artifactStorage';

export interface UIScreenshotMetadata {
  screenshotId: string;
  fileName: string;
  storagePath: string;
  downloadURL: string;
  dataUrl?: string;
  folderId?: string;
  projectId?: string;
  createdAt: string;
  fileSize?: number;
  contentType?: string;
  category?: string;
}

// Memory cache for instant access
const screenshotCache = new Map<string, string>();
const metadataCache = new Map<string, UIScreenshotMetadata>();

/**
 * Converts a Base64 Data URL to a Uint8Array and MIME type safely
 */
function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = match && match[1] ? match[1] : 'image/png';
    const rawBase64 = match ? match[2] : dataUrl.replace(/^data:[^;]+;base64,/, '');
    const cleanBase64 = rawBase64.replace(/\s+/g, '');
    
    const binaryStr = atob(cleanBase64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return { bytes, mimeType };
  } catch (e) {
    console.warn('[ScreenshotStorageService] Failed to parse data URL into bytes:', e);
    return { bytes: new Uint8Array(0), mimeType: 'image/png' };
  }
}

/**
 * Uploads a screenshot to Firebase Storage and records its metadata in Firestore.
 * Fallback to local server / IndexedDB if Firebase Storage is unavailable.
 */
export async function uploadScreenshotToFirebaseStorage(
  imageData: string | Blob | File,
  options: {
    projectId?: string;
    folderId?: string;
    fileName?: string;
    screenshotId?: string;
    category?: string;
  } = {}
): Promise<UIScreenshotMetadata> {
  const timestamp = new Date().toISOString();
  const rawId = options.screenshotId || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  const screenshotId = rawId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  
  const cleanName = (options.fileName || `screenshot_${Date.now()}.png`).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const projectId = options.projectId || 'global';
  const folderId = options.folderId || 'root';

  let rawDataUrl = typeof imageData === 'string' && imageData.startsWith('data:image/') ? imageData : '';

  // 1. If imageData is already a permanent Firebase Storage or HTTPS URL, return existing metadata
  if (typeof imageData === 'string' && (imageData.startsWith('https://firebasestorage.googleapis.com') || imageData.startsWith('https://storage.googleapis.com'))) {
    const meta: UIScreenshotMetadata = {
      screenshotId,
      fileName: cleanName,
      storagePath: `ui_testing/${projectId}/${folderId}/${screenshotId}_${cleanName}`,
      downloadURL: imageData,
      folderId,
      projectId,
      createdAt: timestamp,
      category: options.category || 'APP UI REVIEW'
    };
    screenshotCache.set(screenshotId, imageData);
    screenshotCache.set(imageData, imageData);
    metadataCache.set(screenshotId, meta);
    return meta;
  }

  // 2. Prepare binary buffer and contentType
  let blobData: Uint8Array | Blob;
  let contentType = 'image/png';
  let fileSize = 0;

  if (typeof imageData === 'string') {
    if (imageData.startsWith('data:image/')) {
      const parsed = dataUrlToBytes(imageData);
      blobData = parsed.bytes;
      contentType = parsed.mimeType;
      fileSize = parsed.bytes.length;
    } else if (imageData.startsWith('blob:')) {
      // Fetch the active blob
      try {
        const resp = await fetch(imageData);
        const b = await resp.blob();
        blobData = b;
        contentType = b.type || 'image/png';
        fileSize = b.size;
      } catch (err) {
        console.warn('[ScreenshotStorageService] Could not fetch local blob URL:', err);
        blobData = new Uint8Array(0);
      }
    } else {
      blobData = new Uint8Array(0);
    }
  } else if (imageData instanceof Blob) {
    blobData = imageData;
    contentType = imageData.type || 'image/png';
    fileSize = imageData.size;
  } else {
    blobData = new Uint8Array(0);
  }

  // Determine file extension
  let ext = 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
  else if (contentType.includes('webp')) ext = 'webp';
  else if (contentType.includes('gif')) ext = 'gif';

  const fileName = cleanName.toLowerCase().endsWith(`.${ext}`) ? cleanName : `${cleanName}.${ext}`;
  const storagePath = `ui_testing/${projectId}/${folderId}/${screenshotId}_${fileName}`;

  let downloadURL = '';

  // 3. Attempt upload to Firebase Storage with an 8s timeout to ensure permanent storage
  if (blobData && (blobData instanceof Blob ? blobData.size > 0 : blobData.length > 0)) {
    try {
      const storageRef = ref(storage, storagePath);
      const uploadPromise = uploadBytes(storageRef, blobData, {
        contentType,
        customMetadata: {
          screenshotId,
          folderId,
          projectId,
          createdAt: timestamp,
          category: options.category || 'APP UI REVIEW'
        }
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Firebase Storage upload timed out after 8000ms')), 8000)
      );

      const uploadResult = (await Promise.race([uploadPromise, timeoutPromise])) as any;
      if (uploadResult && uploadResult.ref) {
        const urlPromise = getDownloadURL(uploadResult.ref);
        const urlTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getDownloadURL timed out after 3000ms')), 3000)
        );
        downloadURL = (await Promise.race([urlPromise, urlTimeout])) as string;
      }
    } catch (storageError) {
      console.warn('[ScreenshotStorageService] Firebase Storage upload notice, using dual persistence fallback:', storageError);
    }
  }

  // 4. Dual Persistence Fallback: If Firebase Storage was blocked or unreachable, persist to server & IndexedDB
  if (!downloadURL) {
    if (rawDataUrl) {
      // Save in IndexedDB immediately
      await saveArtifact(`sc_${screenshotId}`, rawDataUrl).catch(() => {});
      // Try server upload
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;
        const res = await fetch('/api/artifacts/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: `sc_${screenshotId}`, image: rawDataUrl }),
          signal: controller ? controller.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          if (json && json.url) {
            downloadURL = json.url;
          }
        }
      } catch (e) {}

      if (!downloadURL) {
        downloadURL = `/artifacts/sc_${screenshotId}.png`;
      }
    }
  }

  const metadata: UIScreenshotMetadata = {
    screenshotId,
    fileName,
    storagePath,
    downloadURL: downloadURL || '',
    dataUrl: rawDataUrl || undefined,
    folderId,
    projectId,
    createdAt: timestamp,
    fileSize,
    contentType,
    category: options.category || 'APP UI REVIEW'
  };

  // Cache in memory and IndexedDB
  if (downloadURL) {
    screenshotCache.set(screenshotId, downloadURL);
    screenshotCache.set(downloadURL, downloadURL);
  }
  if (rawDataUrl) {
    screenshotCache.set(`raw_${screenshotId}`, rawDataUrl);
    await saveArtifact(`sc_${screenshotId}`, rawDataUrl).catch(() => {});
  }
  metadataCache.set(screenshotId, metadata);
  await saveArtifact(`meta_${screenshotId}`, metadata).catch(() => {});

  // 5. Persist metadata to Firestore documents so ALL authorized users across sessions/devices can load it
  try {
    // Global ui_screenshots collection
    await setDoc(doc(db, 'ui_screenshots', screenshotId), metadata, { merge: true });
    
    // Project subcollection if projectId is specified
    if (projectId && projectId !== 'global') {
      await setDoc(doc(db, 'projects', projectId, 'ui_screenshots', screenshotId), metadata, { merge: true });
    }
  } catch (firestoreErr) {
    console.warn('[ScreenshotStorageService] Firestore metadata write notice:', firestoreErr);
  }

  return metadata;
}

/**
 * Resolves a given screenshot URL, ID, or reference into a reliable, viewable image URL.
 * Handles backward-compatibility for previously saved local paths, /artifacts/ URLs,
 * ui_screenshot_id: references, expired blob URLs, and unpopulated records.
 */
export async function resolveScreenshotDisplayUrl(
  input: string | any
): Promise<{ url: string; isUnavailable: boolean; reason?: string; metadata?: UIScreenshotMetadata }> {
  if (!input) {
    return { url: '', isUnavailable: true, reason: 'No screenshot recorded' };
  }

  // If input is an object, extract image property
  if (typeof input === 'object') {
    if (input.data && typeof input.data === 'string') {
      return resolveScreenshotDisplayUrl(input.data);
    }
    if (input.dataUrl && typeof input.dataUrl === 'string') {
      return resolveScreenshotDisplayUrl(input.dataUrl);
    }
    if (input.originalImage && typeof input.originalImage === 'string') {
      return resolveScreenshotDisplayUrl(input.originalImage);
    }
    if (input.screenshot && typeof input.screenshot === 'string') {
      return resolveScreenshotDisplayUrl(input.screenshot);
    }
    if (input.image && typeof input.image === 'string') {
      return resolveScreenshotDisplayUrl(input.image);
    }
    if (input.url && typeof input.url === 'string') {
      return resolveScreenshotDisplayUrl(input.url);
    }
    if (input.downloadURL && typeof input.downloadURL === 'string') {
      return resolveScreenshotDisplayUrl(input.downloadURL);
    }
    if (input.src && typeof input.src === 'string') {
      return resolveScreenshotDisplayUrl(input.src);
    }
    return { url: '', isUnavailable: true, reason: 'Invalid screenshot object format' };
  }

  const str = String(input).trim();
  if (!str) {
    return { url: '', isUnavailable: true, reason: 'Screenshot URL is empty' };
  }

  // 1. Direct Base64 Data URL or raw base64 string
  if (str.startsWith('data:image/')) {
    return { url: str, isUnavailable: false };
  }

  if (str.length > 100 && !str.startsWith('http') && !str.startsWith('/') && !str.startsWith('blob:')) {
    const dataUrl = str.includes(';base64,') ? str : `data:image/png;base64,${str}`;
    return { url: dataUrl, isUnavailable: false };
  }

  // 2. Memory cache check
  if (screenshotCache.has(str)) {
    return { url: screenshotCache.get(str)!, isUnavailable: false };
  }

  // 3. Extract clean key from ui_screenshot_id: or /artifacts/ or raw ID
  const cleanKey = str
    .replace(/^ui_screenshot_id:/, '')
    .replace(/^\/artifacts\//, '')
    .replace(/^\/api\/artifacts\//, '')
    .replace(/\.(png|jpg|jpeg|webp|json)$/i, '');

  if (screenshotCache.has(cleanKey)) {
    return { url: screenshotCache.get(cleanKey)!, isUnavailable: false };
  }

  // 4. Check IndexedDB first (contains original pristine data URL saved during upload)
  try {
    const cachedLocal = (await getArtifact(cleanKey)) || 
                        (await getArtifact(`sc_${cleanKey}`)) || 
                        (await getArtifact(`raw_${cleanKey}`)) || 
                        (await getArtifact(`img_${cleanKey}`)) ||
                        (await getArtifact(`report_${cleanKey}`));
    if (cachedLocal) {
      if (typeof cachedLocal === 'string' && cachedLocal.startsWith('data:image/')) {
        screenshotCache.set(str, cachedLocal);
        screenshotCache.set(cleanKey, cachedLocal);
        return { url: cachedLocal, isUnavailable: false };
      }
      if (typeof cachedLocal === 'object') {
        const localImg = cachedLocal.dataUrl || cachedLocal.data || cachedLocal.downloadURL || cachedLocal.image || cachedLocal.originalImage || (Array.isArray(cachedLocal.screenshots) ? cachedLocal.screenshots[0] : null);
        if (typeof localImg === 'string' && localImg.length > 50) {
          screenshotCache.set(str, localImg);
          screenshotCache.set(cleanKey, localImg);
          return { url: localImg, isUnavailable: false };
        }
      }
    }
  } catch (idbErr) {
    console.warn('[ScreenshotStorageService] IndexedDB read warning:', idbErr);
  }

  // 5. Permanent Firebase Storage or external HTTPS URL
  if (
    str.startsWith('https://firebasestorage.googleapis.com') || 
    str.startsWith('https://storage.googleapis.com') || 
    str.startsWith('http://') || 
    str.startsWith('https://')
  ) {
    screenshotCache.set(str, str);
    return { url: str, isUnavailable: false };
  }

  // 6. Temporary blob: URL check
  if (str.startsWith('blob:')) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 600);
      const res = await fetch(str, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || res.status === 200) {
        screenshotCache.set(str, str);
        return { url: str, isUnavailable: false };
      }
    } catch {
      // Blob expired
    }
  }

  // 6. Check Firestore for metadata by screenshotId (handles cross-user, cross-device & page refresh)
  const candidateKeys = Array.from(new Set([cleanKey, `sc_${cleanKey}`, cleanKey.replace(/^sc_/, '')]));
  for (const k of candidateKeys) {
    if (!k) continue;
    try {
      const docSnap = await getDoc(doc(db, 'ui_screenshots', k));
      if (docSnap.exists()) {
        const data = docSnap.data() as UIScreenshotMetadata;
        if (data) {
          if (data.downloadURL && (data.downloadURL.startsWith('https://firebasestorage.googleapis.com') || data.downloadURL.startsWith('https://storage.googleapis.com') || data.downloadURL.startsWith('http'))) {
            screenshotCache.set(str, data.downloadURL);
            screenshotCache.set(cleanKey, data.downloadURL);
            return { url: data.downloadURL, isUnavailable: false, metadata: data };
          }
          if (data.dataUrl && data.dataUrl.startsWith('data:image/')) {
            screenshotCache.set(str, data.dataUrl);
            screenshotCache.set(cleanKey, data.dataUrl);
            return { url: data.dataUrl, isUnavailable: false, metadata: data };
          }
        }
      }
    } catch (err) {}
  }

  // 7. Check if /artifacts/${cleanKey}.png, /artifacts/${cleanKey}, or /api/artifacts/${cleanKey} server endpoint returns 200
  const candidatePaths = Array.from(new Set([
    str.startsWith('/artifacts/') ? str : `/artifacts/${cleanKey}.png`,
    `/artifacts/${cleanKey}`,
    `/api/artifacts/${cleanKey}`
  ]));

  for (const path of candidatePaths) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const testRes = await fetch(path, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      if (testRes.ok || testRes.status === 200 || testRes.status === 304) {
        const contentType = testRes.headers.get('content-type') || '';
        if (contentType.includes('image') || path.includes('/artifacts/')) {
          screenshotCache.set(str, path);
          screenshotCache.set(cleanKey, path);
          return { url: path, isUnavailable: false };
        }
      }
    } catch {}
  }

  return { url: '', isUnavailable: true, reason: 'Saved screenshot file could not be recovered' };
}

/**
 * Ensures any screenshot string is converted to a permanent Firebase Storage URL if possible.
 */
export async function ensurePersistentScreenshotUrl(
  rawImage: string,
  options: {
    projectId?: string;
    folderId?: string;
    fileName?: string;
    screenshotId?: string;
    category?: string;
  } = {}
): Promise<string> {
  if (!rawImage || typeof rawImage !== 'string') return '';
  const trimmed = rawImage.trim();
  if (!trimmed) return '';

  // If already a permanent Firebase Storage or HTTPS URL
  if (trimmed.startsWith('https://firebasestorage.googleapis.com') || trimmed.startsWith('https://storage.googleapis.com')) {
    return trimmed;
  }

  // If Base64 or Blob, upload to Firebase Storage
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('blob:')) {
    try {
      const meta = await uploadScreenshotToFirebaseStorage(trimmed, options);
      if (meta && meta.downloadURL) {
        return meta.downloadURL;
      }
    } catch (err) {
      console.warn('[ScreenshotStorageService] ensurePersistentScreenshotUrl upload notice:', err);
    }
  }

  return trimmed;
}

/**
 * Fetches all screenshots recorded for a specific project and optional folder.
 */
export async function fetchProjectScreenshots(
  projectId: string,
  folderId?: string
): Promise<UIScreenshotMetadata[]> {
  const results: UIScreenshotMetadata[] = [];
  if (!projectId) return results;

  try {
    const colRef = collection(db, 'projects', projectId, 'ui_screenshots');
    let q = query(colRef);
    if (folderId && folderId !== 'all') {
      q = query(colRef, where('folderId', '==', folderId));
    }
    const snap = await getDocs(q);
    snap.forEach(d => {
      if (d.exists()) {
        results.push(d.data() as UIScreenshotMetadata);
      }
    });
  } catch (err) {
    console.warn('[ScreenshotStorageService] Error fetching project screenshots:', err);
  }

  return results;
}
