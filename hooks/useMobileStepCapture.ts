import { useCallback } from 'react';
import { RecordedStep, StepLocator, UniversalLocator } from '../types';
import { MobileElementInfo } from '../components/MobileRecordingInspector';
import { resolveStepTargetMetrics } from '../components/locatorGeometry';

export interface UseMobileStepCaptureOptions {
  currentScreen?: string;
  onStepCaptured: (step: Partial<RecordedStep>) => void;
}

export function useMobileStepCapture({
  currentScreen = 'Mobile Screen',
  onStepCaptured
}: UseMobileStepCaptureOptions) {
  const captureElementInteraction = useCallback(
    (
      elem: MobileElementInfo,
      action: 'click' | 'fill' | 'assertion' | 'long_press' | 'swipe' | 'dblclick' = 'click',
      value: string = '',
      extraMetrics?: {
        targetBox?: { x: number; y: number; width: number; height: number };
        coordinates?: { x: number; y: number };
        deltaX?: number;
        deltaY?: number;
      }
    ) => {
      // Build primary locator
      let primaryType: StepLocator['type'] = 'accessibility-id';
      let primaryVal = elem.accessibilityId || elem.contentDescription || elem.resourceId || elem.xpath || elem.name;

      if (elem.accessibilityId || elem.contentDescription) {
        primaryType = 'accessibility-id';
      } else if (elem.resourceId) {
        primaryType = 'resource-id';
      } else if (elem.xpath) {
        primaryType = 'xpath';
      } else if (elem.text) {
        primaryType = 'text';
      }

      const alternatives: StepLocator[] = [];
      if (elem.resourceId && primaryType !== 'resource-id') {
        alternatives.push({ type: 'resource-id', value: elem.resourceId });
      }
      if (elem.accessibilityId && primaryType !== 'accessibility-id') {
        alternatives.push({ type: 'accessibility-id', value: elem.accessibilityId });
      }
      if (elem.xpath && primaryType !== 'xpath') {
        alternatives.push({ type: 'xpath', value: elem.xpath });
      }
      if (elem.text && primaryType !== 'text') {
        alternatives.push({ type: 'text', value: elem.text });
      }

      const locator: UniversalLocator = {
        primary: { type: primaryType, value: primaryVal },
        alternatives
      };

      let targetBox: { x: number; y: number; width: number; height: number } | undefined = extraMetrics?.targetBox;
      if (!targetBox && elem.bounds) {
        const dummyStep = { targetBox: undefined, bounds: elem.bounds };
        const resolved = resolveStepTargetMetrics(dummyStep, 0, 1, 'mobile');
        if (resolved?.targetBox) {
          targetBox = resolved.targetBox;
        }
      }

      const coordinates = extraMetrics?.coordinates || (targetBox ? { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 } : undefined);

      const capturedStep: Partial<RecordedStep> = {
        action: action === 'fill' ? 'type' : action,
        locator,
        elementName: elem.name || elem.text || elem.resourceId || 'Mobile UI Component',
        value,
        screen: elem.screen || currentScreen,
        platform: 'mobile',
        timestamp: Date.now(),
        targetBox,
        coordinates,
        x: coordinates?.x,
        y: coordinates?.y,
        deltaX: extraMetrics?.deltaX,
        deltaY: extraMetrics?.deltaY
      };

      onStepCaptured(capturedStep);
    },
    [currentScreen, onStepCaptured]
  );

  const captureKeyPress = useCallback(
    (keyCombo: string) => {
      const locator: UniversalLocator = {
        primary: { type: 'id', value: `key_${keyCombo.toLowerCase()}` },
        alternatives: []
      };

      onStepCaptured({
        action: 'press',
        locator,
        elementName: `Hardware Button: ${keyCombo}`,
        value: keyCombo,
        keyCombo,
        screen: currentScreen,
        platform: 'mobile',
        timestamp: Date.now()
      });
    },
    [currentScreen, onStepCaptured]
  );

  const captureWaitStep = useCallback(
    (durationSeconds: number = 2) => {
      const locator: UniversalLocator = {
        primary: { type: 'id', value: 'wait_step' },
        alternatives: []
      };

      onStepCaptured({
        action: 'wait',
        locator,
        elementName: `Wait ${durationSeconds}s`,
        value: String(durationSeconds),
        screen: currentScreen,
        platform: 'mobile',
        timestamp: Date.now()
      });
    },
    [currentScreen, onStepCaptured]
  );

  return {
    captureElementInteraction,
    captureKeyPress,
    captureWaitStep
  };
}
