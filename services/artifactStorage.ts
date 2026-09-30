import { uploadScreenshotToFirebaseStorage, resolveScreenshotDisplayUrl } from './screenshotStorageService';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

/**
 * Persistent Client-Side and Server-Side Artifact & Image Store.
 * Ensures UI Testing reports, screenshots, highlighted audit overlays,
 * and input assets are reliably persisted and viewable permanently across reloads,
 * tab sessions, folder navigations, and Firestore sync events.
 */

const DB_NAME = 'AutomatiQA_Artifacts_DB';
const DB_VERSION = 1;
const STORE_NAME = 'ui_testing_artifacts';

interface ArtifactEntry {
  id: string;
  data: any;
  updatedAt: number;
}

// In-memory fallback cache
const memoryCache = new Map<string, any>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: any) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };

        request.onsuccess = (event: any) => {
          resolve(event.target.result);
        };

        request.onerror = (err) => {
          console.warn('[ArtifactStorage] IndexedDB open error, using memory cache:', err);
          resolve(null);
        };
      } catch (err) {
        console.warn('[ArtifactStorage] IndexedDB init exception, using memory cache:', err);
        resolve(null);
      }
    });
  }

  return dbPromise;
}

/**
 * Save an artifact bundle or image by key/ID (IndexedDB + Server API fallback)
 */
export async function saveArtifact(id: string, data: any): Promise<void> {
  if (!id || !data) return;

  memoryCache.set(id, data);

  // 1. IndexedDB persistence
  try {
    const db = await getDB();
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: ArtifactEntry = {
        id,
        data,
        updatedAt: Date.now()
      };
      store.put(entry);
    }
  } catch (err) {
    console.warn('[ArtifactStorage] Error saving to IndexedDB:', err);
  }

  // 2. Server Disk Persistence (async background)
  if (typeof fetch !== 'undefined') {
    try {
      fetch('/api/artifacts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, data })
      }).catch(() => {});
    } catch {}
  }
}

/**
 * Retrieve an artifact bundle or image by key/ID (Memory -> IndexedDB -> Server)
 */
export async function getArtifact(id: string): Promise<any | null> {
  if (!id) return null;

  if (memoryCache.has(id)) {
    return memoryCache.get(id);
  }

  // 1. Check IndexedDB
  try {
    const db = await getDB();
    if (db) {
      const result = await new Promise<any>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(id);

        req.onsuccess = () => {
          if (req.result && req.result.data) {
            resolve(req.result.data);
          } else {
            resolve(null);
          }
        };

        req.onerror = () => {
          resolve(null);
        };
      });

      if (result) {
        memoryCache.set(id, result);
        return result;
      }
    }
  } catch (err) {
    console.warn('[ArtifactStorage] Error reading from IndexedDB:', err);
  }

  // 2. Check Server API
  if (typeof fetch !== 'undefined') {
    try {
      const res = await fetch(`/api/artifacts/${id}`);
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await res.json();
          memoryCache.set(id, json);
          return json;
        } else if (contentType.includes('image/')) {
          const blob = await res.blob();
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          if (dataUrl) {
            memoryCache.set(id, dataUrl);
            return dataUrl;
          }
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Helper to save video binary or blob in IndexedDB and in-memory cache
 */
export async function saveVideoBlob(videoId: string, blobOrFile: Blob | File | ArrayBuffer | string, fileName?: string): Promise<void> {
  if (!videoId || !blobOrFile) return;
  
  const cleanKey = `video_${videoId}`;
  memoryCache.set(cleanKey, blobOrFile);
  memoryCache.set(videoId, blobOrFile);

  if (typeof URL !== 'undefined' && blobOrFile instanceof Blob) {
    try {
      const activeUrl = URL.createObjectURL(blobOrFile);
      memoryCache.set(`objectUrl_${videoId}`, activeUrl);
      if (fileName) {
        memoryCache.set(`objectUrl_${fileName}`, activeUrl);
        memoryCache.set(`objectUrl_${fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_')}`, activeUrl);
      }
    } catch {}
  }

  if (fileName) {
    const cleanFileKey = `video_${fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_')}`;
    memoryCache.set(cleanFileKey, blobOrFile);
    memoryCache.set(`video_${fileName}`, blobOrFile);
    memoryCache.set(fileName, blobOrFile);
  }

  // 1. IndexedDB persistence
  try {
    const db = await getDB();
    if (db) {
      // If it is a Blob or File, ensure we can clone it into IndexedDB
      let entryData = blobOrFile;
      if (blobOrFile instanceof Blob) {
        try {
          entryData = await blobOrFile.arrayBuffer();
        } catch {
          entryData = blobOrFile;
        }
      }

      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        store.put({
          id: cleanKey,
          data: entryData,
          type: blobOrFile instanceof Blob ? blobOrFile.type || 'video/mp4' : 'video/mp4',
          fileName: fileName || '',
          updatedAt: Date.now()
        });

        store.put({
          id: videoId,
          data: entryData,
          type: blobOrFile instanceof Blob ? blobOrFile.type || 'video/mp4' : 'video/mp4',
          fileName: fileName || '',
          updatedAt: Date.now()
        });

        if (fileName) {
          store.put({
            id: `video_${fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_')}`,
            data: entryData,
            type: blobOrFile instanceof Blob ? blobOrFile.type || 'video/mp4' : 'video/mp4',
            fileName: fileName,
            updatedAt: Date.now()
          });

          store.put({
            id: `video_${fileName}`,
            data: entryData,
            type: blobOrFile instanceof Blob ? blobOrFile.type || 'video/mp4' : 'video/mp4',
            fileName: fileName,
            updatedAt: Date.now()
          });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch (err) {
    console.warn('[ArtifactStorage] Error saving video to IndexedDB:', err);
  }
}

/**
 * Retrieve stored video Blob or data from IndexedDB or memory
 */
export async function getVideoBlob(videoId: string, fileName?: string): Promise<Blob | File | string | null> {
  if (!videoId && !fileName) return null;

  // 1. Check memory cache first
  const candidateKeys: string[] = [];
  if (videoId) {
    candidateKeys.push(`video_${videoId}`);
    if (videoId.startsWith('uvflow_')) {
      candidateKeys.push(`video_${videoId.replace('uvflow_', '')}`);
      candidateKeys.push(videoId.replace('uvflow_', ''));
    }
    if (videoId.startsWith('script_')) {
      candidateKeys.push(`video_${videoId.replace('script_', '')}`);
      candidateKeys.push(`video_${videoId.replace('script_uvflow_', '')}`);
    }
    candidateKeys.push(videoId);
  }
  if (fileName) {
    candidateKeys.push(`video_${fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_')}`);
    candidateKeys.push(`video_${fileName}`);
    candidateKeys.push(fileName);
    candidateKeys.push(fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_'));
    try {
      const decoded = decodeURIComponent(fileName);
      if (decoded !== fileName) {
        candidateKeys.push(`video_${decoded.replace(/[^a-zA-Z0-9_\-\.]/g, '_')}`);
        candidateKeys.push(`video_${decoded}`);
      }
    } catch {}
  }

  for (const k of candidateKeys) {
    if (memoryCache.has(k)) {
      const cached = memoryCache.get(k);
      if (cached instanceof Blob) return cached;
      if (typeof ArrayBuffer !== 'undefined' && (cached instanceof ArrayBuffer || cached?.buffer instanceof ArrayBuffer)) {
        const buf = cached instanceof ArrayBuffer ? cached : cached.buffer;
        return new Blob([buf], { type: 'video/mp4' });
      }
      if (typeof cached === 'string') return cached;
    }
  }

  // 2. Check IndexedDB across candidate keys
  try {
    const db = await getDB();
    if (db) {
      for (const k of candidateKeys) {
        const item = await new Promise<any>((resolve) => {
          try {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(k);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });

        if (item && item.data) {
          const raw = item.data;
          const mimeType = item.type || 'video/mp4';
          if (raw instanceof Blob) {
            memoryCache.set(k, raw);
            return raw;
          }
          if (typeof ArrayBuffer !== 'undefined' && (raw instanceof ArrayBuffer || raw?.buffer instanceof ArrayBuffer)) {
            const buf = raw instanceof ArrayBuffer ? raw : raw.buffer;
            const blob = new Blob([buf], { type: mimeType });
            memoryCache.set(k, blob);
            return blob;
          }
          if (typeof raw === 'string') {
            memoryCache.set(k, raw);
            return raw;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ArtifactStorage] Error retrieving video from IndexedDB:', err);
  }

  return null;
}

/**
 * Stream/upload a video File or Blob to persistent server disk and IndexedDB.
 * Returns the permanent server URL (e.g. /artifacts/video_....mp4) that survives reloads.
 */
export async function uploadAndPersistVideo(
  videoId: string,
  fileOrBlob: File | Blob,
  fileName?: string
): Promise<{ url: string; id: string }> {
  const rawName = fileName || (fileOrBlob instanceof File ? fileOrBlob.name : `video_${Date.now()}.mp4`);
  const cleanName = rawName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const uniqueName = cleanName.includes(videoId) ? cleanName : `${videoId}_${cleanName}`;
  
  // 1. Cache in IndexedDB asynchronously in background for instant UI response
  saveVideoBlob(videoId, fileOrBlob, uniqueName).catch(() => {});
  saveVideoBlob(videoId, fileOrBlob, cleanName).catch(() => {});

  let finalUrl = '';

  // 2. Upload to Server Disk via local API endpoint first (ultra-fast local disk storage)
  if (typeof fetch !== 'undefined') {
    try {
      const sanitizedName = encodeURIComponent(uniqueName);
      const res = await fetch(`/api/artifacts/upload-video?filename=${sanitizedName}`, {
        method: 'POST',
        headers: {
          'Content-Type': fileOrBlob.type || 'video/mp4'
        },
        body: fileOrBlob
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.url) {
          finalUrl = json.url;
          memoryCache.set(`objectUrl_${videoId}`, json.url);
          memoryCache.set(`serverUrl_${videoId}`, json.url);
        }
      }
    } catch (serverErr) {
      console.warn('[ArtifactStorage] Server video stream upload notice:', serverErr);
    }
  }

  // 3. Stream/Upload to Firebase Storage in parallel with a 3s timeout safety net
  try {
    const storagePath = `record_play_videos/${videoId}_${uniqueName}`;
    const storageRef = ref(storage, storagePath);
    const firebasePromise = uploadBytes(storageRef, fileOrBlob, {
      contentType: fileOrBlob.type || 'video/mp4'
    }).then(async (uploadResult) => {
      if (uploadResult && uploadResult.ref) {
        const downloadURL = await getDownloadURL(uploadResult.ref);
        if (downloadURL) {
          memoryCache.set(`objectUrl_${videoId}`, downloadURL);
          memoryCache.set(`serverUrl_${videoId}`, downloadURL);
          return downloadURL;
        }
      }
      return '';
    });

    const timeoutPromise = new Promise<string>((r) => setTimeout(() => r(''), 3000));
    const cloudUrl = await Promise.race([firebasePromise, timeoutPromise]);
    if (cloudUrl) {
      finalUrl = cloudUrl;
    }
  } catch (storageErr) {
    console.warn('[ArtifactStorage] Firebase Storage upload notice:', storageErr);
  }

  if (finalUrl) {
    return { url: finalUrl, id: videoId };
  }

  // Fallback to object URL if offline/error, but since saved in IndexedDB, resolveVideoPlayableUrl can retrieve it
  const fallbackUrl = typeof URL !== 'undefined' ? URL.createObjectURL(fileOrBlob) : '';
  if (fallbackUrl) {
    memoryCache.set(`objectUrl_${videoId}`, fallbackUrl);
  }
  return { url: fallbackUrl, id: videoId };
}

/**
 * Probes if a URL actually returns a valid 200/206 status within a brief timeout
 */
export async function isUrlPlayable(url: string, timeoutMs: number = 2500): Promise<boolean> {
  if (!url || typeof fetch === 'undefined') return false;
  if (url.startsWith('https://firebasestorage.googleapis.com') || url.startsWith('https://storage.googleapis.com')) {
    // Firebase Storage and GCS URLs are permanent, fully-managed and highly-available. Skip active probe to bypass potential CORS/preflight issues.
    return true;
  }
  if (url.startsWith('blob:')) {
    try {
      // Browser Fetch specification disallows HEAD method for blob: URLs.
      // Probing with GET and a 0-1 byte range validates the blob without downloading full stream.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 1000));
      const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1' }, signal: controller.signal });
      clearTimeout(timer);
      return res.ok || res.status === 200 || res.status === 206;
    } catch {
      return false;
    }
  }
  if (url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      const contentType = res.headers.get('content-type') || '';
      // If server returned an HTML fallback or error response, it's not a playable video stream
      if (contentType.includes('text/html') || !res.ok) {
        return false;
      }
      return res.ok || res.status === 200 || res.status === 206 || res.status === 304;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Resolves a reliable, playable URL for a video across reloads and tab sessions.
 * Gracefully cascades across in-memory cache, active blob URLs, server static endpoints,
 * and IndexedDB storage so saved videos NEVER fail to play.
 */
export async function resolveVideoPlayableUrl(
  video: { id?: string; url?: string; blob?: any; dataUrl?: string; videoFileName?: string } | null | undefined
): Promise<string | null> {
  if (!video) return null;

  // 1. Direct active Blob / File in memory
  if (video.blob instanceof Blob) {
    try {
      return URL.createObjectURL(video.blob);
    } catch {}
  }

  // 2. Check active cached object URL from this session
  if (video.id) {
    const activeUrl = memoryCache.get(`objectUrl_${video.id}`) || memoryCache.get(`serverUrl_${video.id}`);
    if (activeUrl && typeof activeUrl === 'string') {
      const alive = await isUrlPlayable(activeUrl, 800);
      if (alive) return activeUrl;
    }
  }
  if (video.videoFileName) {
    const activeUrl = memoryCache.get(`objectUrl_${video.videoFileName}`);
    if (activeUrl && typeof activeUrl === 'string') {
      const alive = await isUrlPlayable(activeUrl, 800);
      if (alive) return activeUrl;
    }
  }

  // 3. Test if video.url is live on server
  if (video.url && (video.url.startsWith('/') || video.url.startsWith('http://') || video.url.startsWith('https://'))) {
    const isLive = await isUrlPlayable(video.url, 2500);
    if (isLive) {
      return video.url;
    }
  }

  // 4. Test if video.dataUrl is live on server
  if (video.dataUrl && (video.dataUrl.startsWith('/') || video.dataUrl.startsWith('http://') || video.dataUrl.startsWith('https://'))) {
    const isLive = await isUrlPlayable(video.dataUrl, 2500);
    if (isLive) {
      return video.dataUrl;
    }
  }

  // 5. Check candidate server paths by video.id and filename
  if (video.id || video.videoFileName || video.url) {
    const cleanId = (video.id || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const urlBasename = video.url ? video.url.split('/').pop()?.split('?')[0] : '';
    const cleanName = (video.videoFileName || urlBasename || 'video.mp4').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const candidateServerUrls: string[] = [];

    if (cleanId && cleanName) candidateServerUrls.push(`/artifacts/${cleanId}_${cleanName}`, `/api/uploads/${cleanId}_${cleanName}`);
    if (cleanId) candidateServerUrls.push(`/artifacts/${cleanId}.mp4`, `/artifacts/${cleanId}.webm`, `/api/uploads/${cleanId}.webm`);
    if (cleanName) candidateServerUrls.push(`/artifacts/${cleanName}`, `/api/uploads/${cleanName}`, `/uploads/${cleanName}`);

    for (const cand of candidateServerUrls) {
      const alive = await isUrlPlayable(cand, 1200);
      if (alive) {
        if (video.id) memoryCache.set(`serverUrl_${video.id}`, cand);
        return cand;
      }
    }
  }

  // 6. Retrieve from IndexedDB or memory cache by flow ID, file name, or URL basename
  const urlBasename = video.url ? video.url.split('/').pop()?.split('?')[0] : undefined;
  const stored: any = await getVideoBlob(video.id || '', video.videoFileName || urlBasename);
  if (stored) {
    if (typeof Blob !== 'undefined' && stored instanceof Blob) {
      try {
        const freshUrl = URL.createObjectURL(stored);
        if (video.id) memoryCache.set(`objectUrl_${video.id}`, freshUrl);
        if (video.videoFileName) memoryCache.set(`objectUrl_${video.videoFileName}`, freshUrl);
        return freshUrl;
      } catch {}
    } else if (typeof ArrayBuffer !== 'undefined' && (stored instanceof ArrayBuffer || stored?.buffer instanceof ArrayBuffer)) {
      try {
        const buf = stored instanceof ArrayBuffer ? stored : stored.buffer;
        const blob = new Blob([buf], { type: 'video/mp4' });
        const freshUrl = URL.createObjectURL(blob);
        if (video.id) memoryCache.set(`objectUrl_${video.id}`, freshUrl);
        if (video.videoFileName) memoryCache.set(`objectUrl_${video.videoFileName}`, freshUrl);
        return freshUrl;
      } catch {}
    } else if (typeof stored === 'string') {
      if (stored.startsWith('data:video/')) {
        return stored;
      }
      if (stored.startsWith('/') || stored.startsWith('http')) {
        const live = await isUrlPlayable(stored, 1500);
        if (live) return stored;
      }
    }
  }

  // 7. If video.url is a blob: URL and still alive in current document, return it
  if (video.url && video.url.startsWith('blob:')) {
    const isAlive = await isUrlPlayable(video.url, 500);
    if (isAlive) {
      return video.url;
    }
  }

  // 8. Base64 dataUrl directly embedded
  if (video.dataUrl && video.dataUrl.startsWith('data:video/')) {
    return video.dataUrl;
  }
  if (video.url && video.url.startsWith('data:video/')) {
    return video.url;
  }

  // 9. Ultimate fallback: if video.url starts with / or http, return it as last resort
  if (video.url && (video.url.startsWith('/') || video.url.startsWith('http://') || video.url.startsWith('https://'))) {
    return video.url;
  }
  if (video.dataUrl && (video.dataUrl.startsWith('/') || video.dataUrl.startsWith('http://') || video.dataUrl.startsWith('https://'))) {
    return video.dataUrl;
  }

  return null;
}

/**
 * Helper to upload/persist a single image to Firebase Storage, server disk, and IndexedDB.
 * Returns the permanent download URL (e.g. Firebase Storage URL or /artifacts/img_...png) or data URL.
 */
export async function persistImageArtifact(
  key: string, 
  dataUrl: string, 
  options: { projectId?: string; folderId?: string; category?: string } = {}
): Promise<string> {
  if (!key || !dataUrl) return '';

  // If already a persistent static, Firebase Storage URL, or ui_screenshot_id reference, return it
  if (
    dataUrl.startsWith('https://firebasestorage.googleapis.com') || 
    dataUrl.startsWith('https://storage.googleapis.com') || 
    dataUrl.startsWith('ui_screenshot_id:') ||
    dataUrl.startsWith('http://') || 
    dataUrl.startsWith('https://')
  ) {
    return dataUrl;
  }

  // 1. Save locally in IndexedDB & Memory Cache under key
  await saveArtifact(key, dataUrl).catch(() => {});

  // 2. Upload image payload to server disk via /api/artifacts/save
  let serverUrl = '';
  try {
    const res = await fetch('/api/artifacts/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: key, image: dataUrl })
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.url) {
        serverUrl = data.url;
      }
    }
  } catch (err) {
    console.warn('[ArtifactStorage] Server image save fallback to local:', err);
  }

  // 3. Primary / Cloud sync: Upload to Firebase Storage and sync Firestore ui_screenshots collection
  try {
    const meta = await uploadScreenshotToFirebaseStorage(dataUrl, {
      screenshotId: key,
      fileName: `${key}.png`,
      projectId: options.projectId,
      folderId: options.folderId,
      category: options.category
    });
    if (meta && meta.downloadURL && (meta.downloadURL.startsWith('https://firebasestorage.googleapis.com') || meta.downloadURL.startsWith('https://storage.googleapis.com') || meta.downloadURL.startsWith('http'))) {
      return meta.downloadURL;
    }
  } catch (storageErr) {
    console.warn('[ArtifactStorage] Firebase Storage upload notice:', storageErr);
  }

  if (serverUrl) {
    return serverUrl;
  }

  return `ui_screenshot_id:${key}`;
}

export interface ReportArtifactsBundle {
  highlightedScreenshots?: string[];
  visualDefectsScreenshots?: string[];
  appScreenshots?: string[];
  figmaImages?: string[];
  screenshots?: string[];
  images?: string[];
  correctedImage?: string | null;
  docs?: any[];
  figmaDocs?: any[];
  appDocs?: any[];
  videos?: any[];
  appVideos?: any[];
  report?: string;
  analysisReport?: string;
  comparisonReport?: string;
  correctedReport?: string;
  resolutionGuide?: string;
  appUrl?: string;
  figmaUrl?: string;
  designLink?: string;
  promptInputs?: string;
  url?: string;
  contrastOutputs?: any[];
  correctedScreenshots?: any[];
  companyStandards?: string;
  standardRequirement?: any;
  projectId?: string;
  folderId?: string;
}

/**
 * Persists all report images and bundles to Firebase Storage, Server Disk, and IndexedDB,
 * returning lightweight permanent URLs suitable for Firestore (staying well under 1MB).
 */
export async function saveReportArtifacts(
  reportId: string, 
  artifacts: ReportArtifactsBundle,
  options: { projectId?: string; folderId?: string; category?: string } = {}
): Promise<{ permanentBundle: ReportArtifactsBundle }> {
  if (!reportId) return { permanentBundle: artifacts };

  const sanitizedId = reportId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const targetProjectId = options.projectId || artifacts.projectId;
  const targetFolderId = options.folderId || artifacts.folderId;
  const category = options.category;

  // 1. Save full in-memory bundle to IndexedDB & Server disk immediately
  await saveArtifact(`report_${sanitizedId}`, artifacts);

  // Save video binaries if present
  const videoList = [...(artifacts.videos || []), ...(artifacts.appVideos || [])];
  for (const vid of videoList) {
    if (vid && vid.id) {
      if (vid.blob instanceof Blob || vid.file instanceof Blob) {
        await saveVideoBlob(vid.id, vid.blob || vid.file);
      } else if (vid.dataUrl && typeof vid.dataUrl === 'string' && vid.dataUrl.startsWith('data:')) {
        await saveVideoBlob(vid.id, vid.dataUrl);
      }
    }
  }

  // 2. Persist individual images to Firebase Storage, server disk & IndexedDB in parallel
  const convertImageList = async (list: string[] | undefined, prefix: string): Promise<string[]> => {
    if (!list || !Array.isArray(list)) return [];
    return Promise.all(
      list.map(async (img, idx) => {
        if (!img || typeof img !== 'string') return '';
        const key = `img_${sanitizedId}_${prefix}_${idx}`;
        try {
          return await persistImageArtifact(key, img, { projectId: targetProjectId, folderId: targetFolderId, category });
        } catch (e) {
          return img;
        }
      })
    );
  };

  const results = await Promise.all([
    convertImageList(artifacts.screenshots, 'screenshot'),
    convertImageList(artifacts.images, 'image'),
    convertImageList(artifacts.appScreenshots, 'app'),
    convertImageList(artifacts.figmaImages, 'figma'),
    convertImageList(artifacts.highlightedScreenshots, 'highlight'),
    convertImageList(artifacts.visualDefectsScreenshots, 'defects'),
    artifacts.correctedImage && typeof artifacts.correctedImage === 'string'
      ? persistImageArtifact(`img_${sanitizedId}_corrected`, artifacts.correctedImage, { projectId: targetProjectId, folderId: targetFolderId, category }).catch(() => artifacts.correctedImage as string)
      : Promise.resolve(null),
    Array.isArray(artifacts.contrastOutputs) && artifacts.contrastOutputs.length > 0
      ? Promise.all(
          artifacts.contrastOutputs.map(async (co: any, cIdx: number) => {
            if (!co || typeof co !== 'object') return co;
            try {
              const issueImg = co.issueHighlightedImage ? await persistImageArtifact(`img_${sanitizedId}_co_issue_${cIdx}`, co.issueHighlightedImage, { projectId: targetProjectId, folderId: targetFolderId, category }).catch(() => co.issueHighlightedImage) : co.issueHighlightedImage;
              const defectImg = co.visualDefectsImage ? await persistImageArtifact(`img_${sanitizedId}_co_defect_${cIdx}`, co.visualDefectsImage, { projectId: targetProjectId, folderId: targetFolderId, category }).catch(() => co.visualDefectsImage) : co.visualDefectsImage;
              const corrDefectImg = co.correctedVisualDefectsImage ? await persistImageArtifact(`img_${sanitizedId}_co_corrdefect_${cIdx}`, co.correctedVisualDefectsImage, { projectId: targetProjectId, folderId: targetFolderId, category }).catch(() => co.correctedVisualDefectsImage) : co.correctedVisualDefectsImage;
              const corrIssueImg = co.correctedIssueImage ? await persistImageArtifact(`img_${sanitizedId}_co_corrissue_${cIdx}`, co.correctedIssueImage, { projectId: targetProjectId, folderId: targetFolderId, category }).catch(() => co.correctedIssueImage) : co.correctedIssueImage;
              return {
                ...co,
                issueHighlightedImage: issueImg,
                visualDefectsImage: defectImg,
                correctedVisualDefectsImage: corrDefectImg,
                correctedIssueImage: corrIssueImg
              };
            } catch {
              return co;
            }
          })
        )
      : Promise.resolve(artifacts.contrastOutputs || []),
    Array.isArray(artifacts.correctedScreenshots) && artifacts.correctedScreenshots.length > 0
      ? Promise.all(
          artifacts.correctedScreenshots.map(async (cs: any, csIdx: number) => {
            if (!cs || typeof cs !== 'object') return cs;
            try {
              const origImg = cs.originalImage ? await persistImageArtifact(`img_${sanitizedId}_cs_orig_${csIdx}`, cs.originalImage, { projectId: targetProjectId, folderId: targetFolderId, category }).catch(() => cs.originalImage) : cs.originalImage;
              const corrImg = cs.correctedImage ? await persistImageArtifact(`img_${sanitizedId}_cs_corr_${csIdx}`, cs.correctedImage, { projectId: targetProjectId, folderId: targetFolderId, category }).catch(() => cs.correctedImage) : cs.correctedImage;
              return {
                ...cs,
                originalImage: origImg,
                correctedImage: corrImg
              };
            } catch {
              return cs;
            }
          })
        )
      : Promise.resolve(artifacts.correctedScreenshots || [])
  ]);

  const [
    permScreenshots,
    permImages,
    permAppScreenshots,
    permFigmaImages,
    permHighlighted,
    permDefects,
    permCorrected,
    permContrastOutputs,
    permCorrectedScreenshots
  ] = results;

  const permanentBundle: ReportArtifactsBundle = {
    ...artifacts,
    screenshots: permScreenshots.filter(Boolean),
    images: permImages.filter(Boolean),
    appScreenshots: permAppScreenshots.filter(Boolean),
    figmaImages: permFigmaImages.filter(Boolean),
    highlightedScreenshots: permHighlighted.filter(Boolean),
    visualDefectsScreenshots: permDefects.filter(Boolean),
    correctedImage: permCorrected || undefined,
    contrastOutputs: permContrastOutputs,
    correctedScreenshots: permCorrectedScreenshots
  };

  // Also save the permanent bundle record
  await saveArtifact(`perm_report_${sanitizedId}`, permanentBundle);

  return { permanentBundle };
}

/**
 * Hydrates a repository item with any cached artifacts from IndexedDB/Server if the cloud payload
 * had pruned or missing image strings.
 */
export async function hydrateReportArtifacts(item: any): Promise<any> {
  if (!item || !item.id) return item;

  const sanitizedId = String(item.id).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const cached = (await getArtifact(`report_${sanitizedId}`)) || (await getArtifact(`perm_report_${sanitizedId}`));
  const merged = { ...item };

  // Helper to safely extract image strings from arrays (supporting strings and object items)
  const cleanList = (arr: any): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr.map(s => {
      if (!s) return '';
      if (typeof s === 'string') return s.trim();
      if (typeof s === 'object') {
        return (s.data || s.dataUrl || s.originalImage || s.image || s.url || s.downloadURL || s.src || '').trim();
      }
      return '';
    }).filter(s => s.length > 0);
  };

  merged.screenshots = cleanList(merged.screenshots);
  merged.images = cleanList(merged.images);
  merged.appScreenshots = cleanList(merged.appScreenshots);
  merged.figmaImages = cleanList(merged.figmaImages);
  merged.highlightedScreenshots = cleanList(merged.highlightedScreenshots);
  merged.visualDefectsScreenshots = cleanList(merged.visualDefectsScreenshots);

  if (cached) {
    const isTagOrMissing = (list: string[]) => list.length === 0 || list.some(s => s.startsWith('ui_screenshot_id:'));

    if (isTagOrMissing(merged.screenshots) && cleanList(cached.screenshots).length > 0) {
      merged.screenshots = cleanList(cached.screenshots);
    }

    if (isTagOrMissing(merged.images) && cleanList(cached.images).length > 0) {
      merged.images = cleanList(cached.images);
    }

    if (isTagOrMissing(merged.appScreenshots) && cleanList(cached.appScreenshots).length > 0) {
      merged.appScreenshots = cleanList(cached.appScreenshots);
    }

    if (isTagOrMissing(merged.figmaImages) && cleanList(cached.figmaImages).length > 0) {
      merged.figmaImages = cleanList(cached.figmaImages);
    }

    if (isTagOrMissing(merged.highlightedScreenshots) && cleanList(cached.highlightedScreenshots).length > 0) {
      merged.highlightedScreenshots = cleanList(cached.highlightedScreenshots);
    }

    if (isTagOrMissing(merged.visualDefectsScreenshots) && cleanList(cached.visualDefectsScreenshots).length > 0) {
      merged.visualDefectsScreenshots = cleanList(cached.visualDefectsScreenshots);
    }

    if (!merged.correctedImage && cached.correctedImage) {
      merged.correctedImage = cached.correctedImage;
    }

    if ((!merged.videos || merged.videos.length === 0) && cached.videos?.length > 0) {
      merged.videos = cached.videos;
    }

    if ((!merged.appVideos || merged.appVideos.length === 0) && cached.appVideos?.length > 0) {
      merged.appVideos = cached.appVideos;
    }

    if ((!merged.docs || merged.docs.length === 0) && cached.docs?.length > 0) {
      merged.docs = cached.docs;
    }

    if ((!merged.figmaDocs || merged.figmaDocs.length === 0) && cached.figmaDocs?.length > 0) {
      merged.figmaDocs = cached.figmaDocs;
    }

    if ((!merged.appDocs || merged.appDocs.length === 0) && cached.appDocs?.length > 0) {
      merged.appDocs = cached.appDocs;
    }

    if (!merged.appUrl && cached.appUrl) {
      merged.appUrl = cached.appUrl;
    }

    if (!merged.figmaUrl && cached.figmaUrl) {
      merged.figmaUrl = cached.figmaUrl;
    }

    if (!merged.url && cached.url) {
      merged.url = cached.url;
    }

    if (!merged.designLink && cached.designLink) {
      merged.designLink = cached.designLink;
    }

    if (!merged.promptInputs && cached.promptInputs) {
      merged.promptInputs = cached.promptInputs;
    }

    if (!merged.report && cached.report) {
      merged.report = cached.report;
    }

    if (!merged.analysisReport && cached.analysisReport) {
      merged.analysisReport = cached.analysisReport;
    }

    if (!merged.comparisonReport && cached.comparisonReport) {
      merged.comparisonReport = cached.comparisonReport;
    }

    if (!merged.correctedReport && cached.correctedReport) {
      merged.correctedReport = cached.correctedReport;
    }

    if (!merged.resolutionGuide && cached.resolutionGuide) {
      merged.resolutionGuide = cached.resolutionGuide;
    }

    if (!merged.companyStandards && cached.companyStandards) {
      merged.companyStandards = cached.companyStandards;
    }

    if (!merged.standardRequirement && cached.standardRequirement) {
      merged.standardRequirement = cached.standardRequirement;
    }

    if ((!merged.contrastOutputs || merged.contrastOutputs.length === 0) && cached.contrastOutputs?.length > 0) {
      merged.contrastOutputs = cached.contrastOutputs;
    }

    if ((!merged.correctedScreenshots || merged.correctedScreenshots.length === 0) && cached.correctedScreenshots?.length > 0) {
      merged.correctedScreenshots = cached.correctedScreenshots;
    }
  }

  // Fallback: If still empty, check granular image keys in IndexedDB/Server
  if (merged.screenshots.length === 0) {
    const single = await getArtifact(`img_${sanitizedId}_screenshot_0`);
    if (single) merged.screenshots = [single];
  }
  if (merged.images.length === 0) {
    const single = await getArtifact(`img_${sanitizedId}_image_0`) || await getArtifact(`img_${sanitizedId}_figma_0`);
    if (single) merged.images = [single];
  }
  if (merged.appScreenshots.length === 0) {
    const single = await getArtifact(`img_${sanitizedId}_app_0`);
    if (single) merged.appScreenshots = [single];
  }
  if (merged.figmaImages.length === 0) {
    const single = await getArtifact(`img_${sanitizedId}_figma_0`);
    if (single) merged.figmaImages = [single];
  }
  if (!merged.correctedImage) {
    const single = await getArtifact(`img_${sanitizedId}_corrected`);
    if (single) merged.correctedImage = single;
  }
  if (merged.appScreenshots.length === 0) {
    const single = await getArtifact(`img_${sanitizedId}_app_0`);
    if (single) merged.appScreenshots = [single];
  }
  if (merged.figmaImages.length === 0) {
    const single = await getArtifact(`img_${sanitizedId}_figma_0`);
    if (single) merged.figmaImages = [single];
  }
  if (!merged.correctedImage) {
    const single = await getArtifact(`img_${sanitizedId}_corrected`);
    if (single) merged.correctedImage = single;
  }

  // Hydrate video playable URLs for merged.videos
  if (Array.isArray(merged.videos) && merged.videos.length > 0) {
    merged.videos = await Promise.all(
      merged.videos.map(async (v: any) => {
        if (!v) return v;
        const resolvedUrl = await resolveVideoPlayableUrl(v);
        return {
          ...v,
          url: resolvedUrl || v.url || ''
        };
      })
    );
  }

  // Hydrate video playable URLs for merged.appVideos
  if (Array.isArray(merged.appVideos) && merged.appVideos.length > 0) {
    merged.appVideos = await Promise.all(
      merged.appVideos.map(async (v: any) => {
        if (!v) return v;
        const resolvedUrl = await resolveVideoPlayableUrl(v);
        return {
          ...v,
          url: resolvedUrl || v.url || ''
        };
      })
    );
  }

  return merged;
}

/**
 * Hydrates all lists of UI Testing reports, reviews, comparisons, and inputs simultaneously.
 */
export async function hydrateAllReports(
  reports: any[] = [],
  reviews: any[] = [],
  comparisons: any[] = [],
  inputs: any[] = []
): Promise<{
  hydratedReports: any[];
  hydratedReviews: any[];
  hydratedComparisons: any[];
  hydratedInputs: any[];
}> {
  const [hydratedReports, hydratedReviews, hydratedComparisons, hydratedInputs] = await Promise.all([
    Promise.all((reports || []).map(r => hydrateReportArtifacts(r))),
    Promise.all((reviews || []).map(r => hydrateReportArtifacts(r))),
    Promise.all((comparisons || []).map(c => hydrateReportArtifacts(c))),
    Promise.all((inputs || []).map(i => hydrateReportArtifacts(i)))
  ]);

  return {
    hydratedReports,
    hydratedReviews,
    hydratedComparisons,
    hydratedInputs
  };
}
