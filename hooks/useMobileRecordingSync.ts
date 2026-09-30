import { useEffect, useRef, useCallback } from 'react';
import { RecordedStep } from '../types';

export interface UseMobileRecordingSyncOptions {
  projectId?: string | null;
  packageName?: string;
  steps: RecordedStep[];
  onRemoteStepsReceived?: (steps: RecordedStep[]) => void;
  enableLocalStorageSync?: boolean;
}

const STORAGE_KEY_PREFIX = 'automatiqa_mobile_recording_steps_';

export function useMobileRecordingSync({
  projectId,
  packageName,
  steps,
  onRemoteStepsReceived,
  enableLocalStorageSync = true
}: UseMobileRecordingSyncOptions) {
  const isInitialMount = useRef(true);

  // Sync to localStorage
  useEffect(() => {
    if (!enableLocalStorageSync || !projectId) return;

    const storageKey = `${STORAGE_KEY_PREFIX}${projectId}_${packageName || 'default'}`;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      try {
        const cached = localStorage.getItem(storageKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0 && steps.length === 0 && onRemoteStepsReceived) {
            onRemoteStepsReceived(parsed);
          }
        }
      } catch (err) {
        console.warn('Failed to read cached mobile steps from localStorage:', err);
      }
      return;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(steps));
    } catch (err) {
      console.warn('Failed to cache mobile steps to localStorage:', err);
    }
  }, [projectId, packageName, steps, enableLocalStorageSync, onRemoteStepsReceived]);

  const clearStorageCache = useCallback(() => {
    if (!projectId) return;
    const storageKey = `${STORAGE_KEY_PREFIX}${projectId}_${packageName || 'default'}`;
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      console.warn('Failed to clear cached mobile steps:', err);
    }
  }, [projectId, packageName]);

  return {
    clearStorageCache
  };
}
