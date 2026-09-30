import { useState, useCallback, useRef } from 'react';
import { RecordedStep, RecordedFlow } from '../types';

export interface MobileAppInfo {
  packageName: string;
  appName: string;
  apkName?: string;
  appActivity?: string;
  version?: string;
  icon?: string;
}

export interface UseMobileRecorderStateOptions {
  initialSteps?: RecordedStep[];
  initialDevice?: string;
  initialApp?: MobileAppInfo | null;
  onStepsChange?: (steps: RecordedStep[]) => void;
}

export function useMobileRecorderState(options: UseMobileRecorderStateOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [currentPlaybackIndex, setCurrentPlaybackIndex] = useState<number | null>(null);

  const [recordedSteps, setRecordedSteps] = useState<RecordedStep[]>(options.initialSteps || []);
  const [selectedDevice, setSelectedDevice] = useState<string>(options.initialDevice || 'Android Emulator (Pixel 7)');
  const [selectedApp, setSelectedApp] = useState<MobileAppInfo | null>(
    options.initialApp || {
      packageName: 'com.saucelabs.mydemoapp.rn',
      appName: 'Sauce Labs MyDemoApp',
      apkName: 'mda-2.0.0-22.apk',
      appActivity: 'com.saucelabs.mydemoapp.rn.MainActivity'
    }
  );

  const [undoStack, setUndoStack] = useState<RecordedStep[][]>([]);
  const [redoStack, setRedoStack] = useState<RecordedStep[][]>([]);

  const pushStateToHistory = useCallback((newSteps: RecordedStep[]) => {
    setUndoStack(prev => [...prev.slice(-20), recordedSteps]);
    setRedoStack([]);
  }, [recordedSteps]);

  const addStep = useCallback((stepInput: Partial<RecordedStep>) => {
    const newStep: RecordedStep = {
      id: `mstep_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      action: stepInput.action || 'click',
      locator: stepInput.locator || {
        primary: { type: 'accessibility-id', value: 'unknown' },
        alternatives: []
      },
      structuredLocator: stepInput.structuredLocator,
      elementName: stepInput.elementName || 'Mobile Element',
      value: stepInput.value || '',
      screen: stepInput.screen || 'Mobile Screen',
      platform: 'mobile',
      timestamp: Date.now(),
      sequenceNumber: stepInput.sequenceNumber || recordedSteps.length + 1,
      screenshot: stepInput.screenshot,
      x: stepInput.x,
      y: stepInput.y,
      coordinates: stepInput.coordinates,
      targetBox: stepInput.targetBox,
      skipped: stepInput.skipped || false,
      deltaX: stepInput.deltaX,
      deltaY: stepInput.deltaY,
      keyCombo: stepInput.keyCombo
    };

    setRecordedSteps(prev => {
      const updated = [...prev, newStep];
      pushStateToHistory(prev);
      if (options.onStepsChange) {
        options.onStepsChange(updated);
      }
      return updated;
    });
  }, [recordedSteps.length, pushStateToHistory, options]);

  const removeStep = useCallback((id: string) => {
    setRecordedSteps(prev => {
      pushStateToHistory(prev);
      const updated = prev.filter(s => s.id !== id).map((s, idx) => ({ ...s, sequenceNumber: idx + 1 }));
      if (options.onStepsChange) {
        options.onStepsChange(updated);
      }
      return updated;
    });
  }, [pushStateToHistory, options]);

  const updateStep = useCallback((id: string, updates: Partial<RecordedStep>) => {
    setRecordedSteps(prev => {
      pushStateToHistory(prev);
      const updated = prev.map(s => (s.id === id ? { ...s, ...updates } : s));
      if (options.onStepsChange) {
        options.onStepsChange(updated);
      }
      return updated;
    });
  }, [pushStateToHistory, options]);

  const clearSteps = useCallback(() => {
    setRecordedSteps(prev => {
      if (prev.length === 0) return prev;
      pushStateToHistory(prev);
      if (options.onStepsChange) {
        options.onStepsChange([]);
      }
      return [];
    });
  }, [pushStateToHistory, options]);

  const toggleStepSkip = useCallback((id: string) => {
    setRecordedSteps(prev => {
      const updated = prev.map(s => (s.id === id ? { ...s, skipped: !s.skipped } : s));
      if (options.onStepsChange) {
        options.onStepsChange(updated);
      }
      return updated;
    });
  }, [options]);

  const reorderSteps = useCallback((startIndex: number, endIndex: number) => {
    setRecordedSteps(prev => {
      pushStateToHistory(prev);
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      const resequenced = result.map((s, idx) => ({ ...s, sequenceNumber: idx + 1 }));
      if (options.onStepsChange) {
        options.onStepsChange(resequenced);
      }
      return resequenced;
    });
  }, [pushStateToHistory, options]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, recordedSteps]);
    setUndoStack(prev => prev.slice(0, prev.length - 1));
    setRecordedSteps(previous);
    if (options.onStepsChange) {
      options.onStepsChange(previous);
    }
  }, [undoStack, recordedSteps, options]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, recordedSteps]);
    setRedoStack(prev => prev.slice(0, prev.length - 1));
    setRecordedSteps(next);
    if (options.onStepsChange) {
      options.onStepsChange(next);
    }
  }, [redoStack, recordedSteps, options]);

  const startRecording = useCallback(() => {
    setIsRecording(true);
    setIsPaused(false);
  }, []);

  const pauseRecording = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeRecording = useCallback(() => {
    setIsPaused(false);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
  }, []);

  return {
    isRecording,
    isPaused,
    isPlayingBack,
    currentPlaybackIndex,
    recordedSteps,
    selectedDevice,
    selectedApp,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    setIsRecording,
    setIsPaused,
    setIsPlayingBack,
    setCurrentPlaybackIndex,
    setSelectedDevice,
    setSelectedApp,
    setRecordedSteps,
    addStep,
    removeStep,
    updateStep,
    clearSteps,
    toggleStepSkip,
    reorderSteps,
    undo,
    redo,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording
  };
}
