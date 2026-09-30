import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Maximize2, 
  Minimize2, 
  X, 
  Globe, 
  Sparkles, 
  Clock, 
  Layers, 
  Video, 
  CheckCircle2, 
  SkipForward, 
  SkipBack, 
  Check, 
  Loader2,
  ChevronRight,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import { RecordedFlow, RecordedStep } from '../types';
import { toast } from 'sonner';
import { resolveStepTargetMetrics, StepTargetMetrics } from './locatorGeometry';
import { MobilePlaybackEmulator } from './MobilePlaybackEmulator';

export { resolveStepTargetMetrics };

/**
 * Universal client-side Video Recorder and Downloader for recorded flows
 */
export async function downloadFlowVideoFile(
  flow: RecordedFlow,
  targetUrl?: string,
  onProgress?: (percent: number) => void,
  stepScreenshots?: Record<string, string>
): Promise<void> {
  if (!flow || !flow.steps || flow.steps.length === 0) {
    toast.error('No recording steps available to export video');
    return;
  }

  const toastId = toast.loading(`Rendering and encoding video for "${flow.name || 'Recorded Flow'}"...`);

  try {
    // Sort and calculate timestamps
    const sorted = [...flow.steps].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const baseTime = sorted[0]?.timestamp || 0;
    
    let runningTime = 0;
    const normalizedSteps = sorted.map((step, index) => {
      let timeOffsetMs = 0;
      if (step.timestamp && step.timestamp > baseTime) {
        timeOffsetMs = Math.min(step.timestamp - baseTime, (index + 1) * 3500);
      } else {
        timeOffsetMs = index * 1800;
      }
      
      if (timeOffsetMs <= runningTime) {
        runningTime += 1500;
        timeOffsetMs = runningTime;
      } else {
        runningTime = timeOffsetMs;
      }

      const metrics = resolveStepTargetMetrics(step, index, sorted.length, flow.platform || 'web');

      return {
        ...step,
        calculatedTimeMs: timeOffsetMs,
        resolvedTargetBox: metrics.targetBox,
        resolvedCoordinates: metrics.coordinates,
        locatorLabel: metrics.locatorLabel,
        strategy: metrics.strategy
      };
    });

    const lastStep = normalizedSteps[normalizedSteps.length - 1];
    const totalDurationMs = lastStep ? lastStep.calculatedTimeMs + 2200 : 8000;

    // Preload actual screenshot images for each step if available
    const preloadedImages: Record<number, HTMLImageElement> = {};
    for (let i = 0; i < normalizedSteps.length; i++) {
      const step = normalizedSteps[i];
      const shotSrc = step.screenshot || stepScreenshots?.[step.id] || (flow.screenshots && flow.screenshots[i]);
      if (shotSrc && (shotSrc.startsWith('data:image') || shotSrc.startsWith('http') || shotSrc.startsWith('/'))) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = shotSrc;
          await new Promise((resolve) => {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            setTimeout(() => resolve(false), 2000);
          });
          if (img.complete && img.naturalWidth > 0) {
            preloadedImages[i] = img;
          }
        } catch (e) {
          console.warn('Could not preload step screenshot', e);
        }
      }
    }

    const width = 1280;
    const height = 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    // Check MediaRecorder support
    const stream = canvas.captureStream(30);
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 2500000
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    const recordingPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      };
    });

    recorder.start();

    // Render frames through the timeline
    const totalFrames = Math.max(30, Math.floor((totalDurationMs / 1000) * 30));
    const frameStepMs = totalDurationMs / totalFrames;
    const isMobileFlow = flow.platform === 'mobile';

    // Mobile device metrics for video canvas
    const phoneWidth = 360;
    const phoneHeight = 640;
    const phoneX = (width - phoneWidth) / 2;
    const phoneY = 40;
    const phoneRadius = 36;
    const screenX = phoneX + 8;
    const screenY = phoneY + 32;
    const screenWidth = phoneWidth - 16;
    const screenHeight = phoneHeight - 56;

    for (let f = 0; f <= totalFrames; f++) {
      const frameTimeMs = f * frameStepMs;
      if (onProgress) {
        onProgress(Math.round((f / totalFrames) * 95));
      }

      // Background canvas
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      // Find active step for this frame
      let frameStepIdx = 0;
      for (let i = normalizedSteps.length - 1; i >= 0; i--) {
        if (frameTimeMs >= normalizedSteps[i].calculatedTimeMs) {
          frameStepIdx = i;
          break;
        }
      }
      const activeFrameStep = normalizedSteps[frameStepIdx];

      if (isMobileFlow) {
        // --- MOBILE VIDEO CANVAS RENDERING ---
        
        // Studio backdrop subtle gradient
        const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 600);
        bgGrad.addColorStop(0, '#1e1b4b');
        bgGrad.addColorStop(1, '#020617');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Mobile Phone Outer Bezel Shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 15;
        
        // Phone Bezel Frame
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(phoneX, phoneY, phoneWidth, phoneHeight, phoneRadius);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.roundRect(phoneX, phoneY, phoneWidth, phoneHeight, phoneRadius);
        ctx.stroke();

        // Phone Status Bar (Top)
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.roundRect(screenX, phoneY + 6, screenWidth, 26, [phoneRadius - 6, phoneRadius - 6, 0, 0]);
        ctx.fill();

        // Clock 12:00 PM
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('12:00 PM', screenX + 16, phoneY + 23);

        // Punch-hole Camera
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(phoneX + phoneWidth / 2, phoneY + 19, 5, 0, Math.PI * 2);
        ctx.fill();

        // 5G & Battery
        ctx.fillStyle = '#818cf8';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText('5G', screenX + screenWidth - 45, phoneY + 23);
        ctx.fillStyle = '#34d399';
        ctx.fillRect(screenX + screenWidth - 26, phoneY + 15, 14, 8);

        // Mobile Screen Content (Viewport)
        ctx.save();
        ctx.beginPath();
        ctx.rect(screenX, screenY, screenWidth, screenHeight);
        ctx.clip();

        // Check if preloaded screenshot image is available
        if (preloadedImages[frameStepIdx] || Object.values(preloadedImages).length > 0) {
          const imgToDraw = preloadedImages[frameStepIdx] || Object.values(preloadedImages)[0];
          try {
            ctx.drawImage(imgToDraw, screenX, screenY, screenWidth, screenHeight);
          } catch {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(screenX, screenY, screenWidth, screenHeight);
          }
        } else {
          // Render High-Fidelity Mobile App UI on Canvas
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(screenX, screenY, screenWidth, screenHeight);

          // Mobile App Header Bar
          ctx.fillStyle = '#020617';
          ctx.fillRect(screenX, screenY, screenWidth, 42);
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(screenX, screenY + 42);
          ctx.lineTo(screenX + screenWidth, screenY + 42);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px sans-serif';
          const appHeaderName = flow.mobileAppName || flow.name || 'Mobile App Simulation';
          ctx.fillText(appHeaderName.substring(0, 22), screenX + 16, screenY + 26);

          // Dynamic screen list / card elements
          ctx.fillStyle = '#1e293b';
          ctx.roundRect(screenX + 12, screenY + 54, screenWidth - 24, 34, 8);
          ctx.fill();
          ctx.fillStyle = '#94a3b8';
          ctx.font = '10px sans-serif';
          ctx.fillText('Search in application...', screenX + 24, screenY + 75);

          // Step action cards
          normalizedSteps.slice(0, 5).forEach((s, idx) => {
            const cardY = screenY + 98 + idx * 62;
            if (cardY + 54 < screenY + screenHeight) {
              const isCurrent = idx === frameStepIdx;
              ctx.fillStyle = isCurrent ? '#1e1b4b' : '#1e293b';
              ctx.roundRect(screenX + 12, cardY, screenWidth - 24, 52, 10);
              ctx.fill();
              ctx.strokeStyle = isCurrent ? '#6366f1' : '#334155';
              ctx.lineWidth = isCurrent ? 2 : 1;
              ctx.stroke();

              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 11px sans-serif';
              ctx.fillText((s.elementName || s.locatorLabel || `Action #${idx + 1}`).substring(0, 20), screenX + 22, cardY + 22);

              ctx.fillStyle = isCurrent ? '#818cf8' : '#94a3b8';
              ctx.font = '9px monospace';
              ctx.fillText((s.value ? `Value: ${s.value}` : `[${s.action.toUpperCase()}]`).substring(0, 26), screenX + 22, cardY + 38);

              // Action Badge
              ctx.fillStyle = isCurrent ? '#4f46e5' : '#334155';
              ctx.roundRect(screenX + screenWidth - 75, cardY + 14, 52, 22, 6);
              ctx.fill();
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 9px sans-serif';
              ctx.fillText(s.action.toUpperCase().substring(0, 7), screenX + screenWidth - 70, cardY + 29);
            }
          });
        }

        // Target bounding box & interaction within mobile screen
        if (activeFrameStep) {
          const stepElapsed = frameTimeMs - activeFrameStep.calculatedTimeMs;
          const box = activeFrameStep.resolvedTargetBox;
          const boxPx = {
            x: screenX + (box.x / 100) * screenWidth,
            y: screenY + (box.y / 100) * screenHeight,
            w: Math.max(40, (box.width / 100) * screenWidth),
            h: Math.max(22, (box.height / 100) * screenHeight)
          };

          const isInput = activeFrameStep.action === 'fill' || activeFrameStep.action === 'type';
          const isClick = ['click', 'dblclick', 'check', 'uncheck', 'select', 'selectOption', 'tap'].includes(activeFrameStep.action);

          // Interpolated touch position
          const prevStep = frameStepIdx > 0 ? normalizedSteps[frameStepIdx - 1] : null;
          const prevCoords = prevStep ? prevStep.resolvedCoordinates : { x: 50, y: 50 };
          const targetCoords = activeFrameStep.resolvedCoordinates;

          const moveDuration = 450;
          const moveProgress = Math.max(0, Math.min(1, stepElapsed / moveDuration));
          const ease = moveProgress < 0.5 ? 2 * moveProgress * moveProgress : 1 - Math.pow(-2 * moveProgress + 2, 2) / 2;

          const currCxPct = prevCoords.x + (targetCoords.x - prevCoords.x) * ease;
          const currCyPct = prevCoords.y + (targetCoords.y - prevCoords.y) * ease;

          const touchX = screenX + (currCxPct / 100) * screenWidth;
          const touchY = screenY + (currCyPct / 100) * screenHeight;

          // Element Focus Highlight Box
          ctx.strokeStyle = isInput ? '#6366f1' : '#10b981';
          ctx.lineWidth = 2;
          ctx.fillStyle = isInput ? 'rgba(99, 102, 241, 0.15)' : 'rgba(16, 185, 129, 0.15)';
          ctx.fillRect(boxPx.x, boxPx.y, boxPx.w, boxPx.h);
          ctx.strokeRect(boxPx.x, boxPx.y, boxPx.w, boxPx.h);

          // Action Tag Badge
          ctx.fillStyle = isInput ? '#6366f1' : '#10b981';
          ctx.roundRect(boxPx.x, Math.max(screenY + 4, boxPx.y - 18), Math.min(boxPx.w, 120), 16, 4);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px sans-serif';
          ctx.fillText(activeFrameStep.action.toUpperCase(), boxPx.x + 4, Math.max(screenY + 16, boxPx.y - 6));

          // Touch Tap Ripple
          if (isClick && stepElapsed >= 350 && stepElapsed <= 850) {
            const rippleRadius = (stepElapsed - 350) / 14;
            const alpha = Math.max(0, 1 - (stepElapsed - 350) / 500);
            ctx.strokeStyle = `rgba(52, 211, 153, ${alpha})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(touchX, touchY, rippleRadius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = `rgba(52, 211, 153, ${alpha * 0.3})`;
            ctx.beginPath();
            ctx.arc(touchX, touchY, rippleRadius, 0, Math.PI * 2);
            ctx.fill();
          }

          // Translucent Mobile Touch Pointer Ring
          ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(touchX, touchY, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(touchX, touchY, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Bottom Android Navigation Gesture Pill
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.roundRect(screenX, phoneY + phoneHeight - 24, screenWidth, 20, [0, 0, phoneRadius - 6, phoneRadius - 6]);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.roundRect(phoneX + phoneWidth / 2 - 35, phoneY + phoneHeight - 16, 70, 4, 2);
        ctx.fill();

      } else {
        // --- WEB BROWSER CANVAS RENDERING ---
        
        // Draw real screenshot of actual application UI if available
        if (preloadedImages[frameStepIdx] || Object.values(preloadedImages).length > 0) {
          const imgToDraw = preloadedImages[frameStepIdx] || Object.values(preloadedImages)[0];
          try {
            ctx.drawImage(imgToDraw, 0, 54, width, height - 54);
          } catch {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 54, width, height - 54);
          }
        } else {
          // Clean high fidelity browser viewport
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 54, width, height - 54);
        }

        // Header Browser Chrome Bar
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, width, 54);
        
        // Window circles
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(24, 27, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.arc(42, 27, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#10b981';
        ctx.beginPath(); ctx.arc(60, 27, 6, 0, Math.PI * 2); ctx.fill();

        // Address Bar
        ctx.fillStyle = '#1e293b';
        ctx.roundRect(85, 12, width - 260, 30, 8);
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px monospace';
        const urlToDraw = activeFrameStep?.action === 'navigate' ? activeFrameStep.value : (targetUrl || flow.initialUrl || 'https://sauce-demo.myshopify.com/');
        ctx.fillText(urlToDraw, 100, 31);

        // Watermark Badge
        ctx.fillStyle = '#6366f1';
        ctx.roundRect(width - 155, 14, 135, 26, 6);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('RECORDED FLOW', width - 142, 31);

        if (activeFrameStep) {
          const stepElapsed = frameTimeMs - activeFrameStep.calculatedTimeMs;
          const box = activeFrameStep.resolvedTargetBox;
          const boxPx = {
            x: (box.x / 100) * width,
            y: (box.y / 100) * (height - 54) + 54,
            w: Math.max(60, (box.width / 100) * width),
            h: Math.max(28, (box.height / 100) * (height - 54))
          };

          const isInput = activeFrameStep.action === 'fill' || activeFrameStep.action === 'type';
          const isClick = ['click', 'dblclick', 'check', 'uncheck', 'select', 'selectOption'].includes(activeFrameStep.action);

          // Smooth cursor interpolation to exact locator position
          const prevStep = frameStepIdx > 0 ? normalizedSteps[frameStepIdx - 1] : null;
          const prevCoords = prevStep ? prevStep.resolvedCoordinates : { x: 50, y: 50 };
          const targetCoords = activeFrameStep.resolvedCoordinates;

          const moveDuration = 450;
          const moveProgress = Math.max(0, Math.min(1, stepElapsed / moveDuration));
          const ease = moveProgress < 0.5 
            ? 2 * moveProgress * moveProgress 
            : 1 - Math.pow(-2 * moveProgress + 2, 2) / 2;

          const currCxPct = prevCoords.x + (targetCoords.x - prevCoords.x) * ease;
          const currCyPct = prevCoords.y + (targetCoords.y - prevCoords.y) * ease;

          const cx = (currCxPct / 100) * width;
          const cy = (currCyPct / 100) * (height - 54) + 54;

          // Draw Element Focus Highlight & Bounding Outline
          if (isInput) {
            ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
            ctx.fillRect(boxPx.x, boxPx.y, boxPx.w, boxPx.h);
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(boxPx.x, boxPx.y, boxPx.w, boxPx.h);

            // Draw Step Action Badge above input field
            ctx.fillStyle = '#6366f1';
            ctx.roundRect(boxPx.x, Math.max(56, boxPx.y - 20), Math.min(boxPx.w, 180), 18, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px sans-serif';
            const badgeLabel = `INPUT: ${activeFrameStep.locatorLabel || activeFrameStep.elementName || activeFrameStep.locator?.primary?.value || 'Field'}`;
            ctx.fillText(badgeLabel.substring(0, 26), boxPx.x + 6, Math.max(68, boxPx.y - 7));
          } else {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
            ctx.fillRect(boxPx.x, boxPx.y, boxPx.w, boxPx.h);
            ctx.strokeStyle = isClick ? '#10b981' : '#6366f1';
            ctx.lineWidth = 3;
            ctx.strokeRect(boxPx.x, boxPx.y, boxPx.w, boxPx.h);

            // Draw Element Tag Badge above bounding box only for non-input steps
            ctx.fillStyle = '#10b981';
            ctx.roundRect(boxPx.x, Math.max(56, boxPx.y - 20), Math.min(boxPx.w, 180), 18, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px sans-serif';
            const badgeLabel = `${activeFrameStep.action.toUpperCase()}: ${activeFrameStep.locatorLabel || activeFrameStep.locator?.primary?.value || 'Element'}`;
            ctx.fillText(badgeLabel.substring(0, 26), boxPx.x + 6, Math.max(68, boxPx.y - 7));
          }

          // Click Wave Ripple precisely at the element center coordinates
          if (isClick && stepElapsed >= 380 && stepElapsed <= 850) {
            const rippleRadius = (stepElapsed - 380) / 12;
            const alpha = Math.max(0, 1 - (stepElapsed - 380) / 470);
            ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = `rgba(16, 185, 129, ${alpha * 0.3})`;
            ctx.beginPath();
            ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
            ctx.fill();
          }

          // Draw Mouse Cursor Pointer
          ctx.fillStyle = '#6366f1';
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + 14, cy + 20);
          ctx.lineTo(cx + 7, cy + 20);
          ctx.lineTo(cx + 12, cy + 30);
          ctx.lineTo(cx + 7, cy + 32);
          ctx.lineTo(cx + 2, cy + 22);
          ctx.lineTo(cx - 5, cy + 25);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      // Universal Action Spotlight HUD Overlay (Top Right)
      if (activeFrameStep) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
        ctx.roundRect(width - 360, 68, 340, 105, 14);
        ctx.fill();
        ctx.strokeStyle = (activeFrameStep.action === 'fill' || activeFrameStep.action === 'type') ? '#6366f1' : '#10b981';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = (activeFrameStep.action === 'fill' || activeFrameStep.action === 'type') ? '#818cf8' : '#34d399';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`STEP #${frameStepIdx + 1} / ${normalizedSteps.length} • ${activeFrameStep.action.toUpperCase()}`, width - 344, 92);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px sans-serif';
        const titleText = activeFrameStep.elementName || activeFrameStep.locatorLabel || 'Target Element';
        ctx.fillText(titleText.substring(0, 38), width - 344, 116);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '11px monospace';
        const rawStep = activeFrameStep as any;
        const locValue = activeFrameStep.locator?.primary?.value || rawStep.selector || '';
        const locStrat = activeFrameStep.strategy || activeFrameStep.locator?.primary?.type || 'locator';
        ctx.fillText(`[${locStrat.toUpperCase()}] ${locValue.substring(0, 36)}`, width - 344, 138);

        if (activeFrameStep.value) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 11px monospace';
          ctx.fillText(`Value: "${activeFrameStep.value}"`, width - 344, 158);
        }
      }

      // Draw Timer HUD at bottom left
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.roundRect(30, height - 45, 150, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      const formatSec = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        return `${Math.floor(totalSec / 60).toString().padStart(2, '0')}:${(totalSec % 60).toString().padStart(2, '0')}`;
      };
      ctx.fillText(`${formatSec(frameTimeMs)} / ${formatSec(totalDurationMs)}`, 45, height - 26);

      // Yield so browser UI remains responsive
      if (f % 5 === 0) {
        await new Promise(r => setTimeout(r, 8));
      }
    }

    recorder.stop();
    const recordedBlob = await recordingPromise;

    // Trigger automatic file download
    const cleanFlowName = (flow.name || 'Recorded_Flow').replace(/[^a-zA-Z0-9_-]/g, '_');
    const downloadUrl = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${cleanFlowName}_recording.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    toast.success(`Video downloaded: ${cleanFlowName}_recording.webm`, { id: toastId });
  } catch (err: any) {
    console.error('Download video error:', err);
    toast.error(`Video export failed: ${err.message || err}`, { id: toastId });
    throw err;
  }
}

interface RecordedVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
  flow: RecordedFlow | null;
  initialUrl?: string;
  screenshots?: Record<string, string>;
  onDownloadVideo?: (flow: RecordedFlow) => void;
}

export const RecordedVideoModal: React.FC<RecordedVideoModalProps> = ({
  isOpen,
  onClose,
  flow,
  initialUrl,
  screenshots = {},
  onDownloadVideo
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isGeneratingDownload, setIsGeneratingDownload] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'video' | 'timeline'>('video');
  const hasScreenshots = useMemo(() => {
    return !!(flow?.screenshots?.length || (screenshots && Object.keys(screenshots).length > 0) || flow?.steps?.some(s => s.screenshot));
  }, [flow, screenshots]);

  const [viewMode, setViewMode] = useState<'screenshot' | 'interactive' | 'iframe'>(() => {
    if (flow?.platform === 'mobile') {
      return (flow?.screenshots?.length || (screenshots && Object.keys(screenshots).length > 0)) ? 'screenshot' : 'interactive';
    }
    return 'screenshot';
  });
  const [useProxy, setUseProxy] = useState<boolean>(true);

  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(Date.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Compute normalized steps with cumulative timestamps and exact locator metrics
  const steps = useMemo(() => {
    if (!flow || !flow.steps || flow.steps.length === 0) return [];
    
    // Sort by timestamp
    const sorted = [...flow.steps].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const baseTime = sorted[0]?.timestamp || 0;
    
    let runningTime = 0;
    return sorted.map((step, index) => {
      // Calculate realistic time offset (at least 1.2s per step if timestamps are identical)
      let timeOffsetMs = 0;
      if (step.timestamp && step.timestamp > baseTime) {
        timeOffsetMs = Math.min(step.timestamp - baseTime, (index + 1) * 3500);
      } else {
        timeOffsetMs = index * 1800;
      }
      
      // Ensure strictly ascending time offsets
      if (timeOffsetMs <= runningTime) {
        runningTime += 1500;
        timeOffsetMs = runningTime;
      } else {
        runningTime = timeOffsetMs;
      }

      const metrics = resolveStepTargetMetrics(step, index, sorted.length, flow.platform || 'web');

      return {
        ...step,
        calculatedTimeMs: timeOffsetMs,
        stepDurationMs: 1400,
        resolvedTargetBox: metrics.targetBox,
        resolvedCoordinates: metrics.coordinates,
        locatorLabel: metrics.locatorLabel,
        strategy: metrics.strategy
      };
    });
  }, [flow]);

  const totalDurationMs = useMemo(() => {
    if (steps.length === 0) return 4000;
    const lastStep = steps[steps.length - 1];
    return Math.max(4000, lastStep.calculatedTimeMs + lastStep.stepDurationMs + 800);
  }, [steps]);

  // Current active step calculation
  const currentStepIndex = useMemo(() => {
    if (steps.length === 0) return -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (currentTimeMs >= steps[i].calculatedTimeMs) {
        return i;
      }
    }
    return 0;
  }, [steps, currentTimeMs]);

  const currentStep = steps[currentStepIndex] || null;

  // Active typed text simulation for input actions
  const activeTypedText = useMemo(() => {
    if (!currentStep) return '';
    if (currentStep.action !== 'fill' && currentStep.action !== 'type') return '';
    const fullValue = currentStep.value || '';
    const stepElapsed = currentTimeMs - currentStep.calculatedTimeMs;
    const typingDuration = Math.max(400, currentStep.stepDurationMs - 200);
    const progress = Math.max(0, Math.min(1, stepElapsed / typingDuration));
    const charsToShow = Math.round(progress * fullValue.length);
    return fullValue.substring(0, charsToShow);
  }, [currentStep, currentTimeMs]);

  // Current active URL
  const currentActiveUrl = useMemo(() => {
    for (let i = currentStepIndex; i >= 0; i--) {
      if (steps[i]?.action === 'navigate' && steps[i]?.value) {
        return steps[i].value;
      }
    }
    return flow?.initialUrl || initialUrl || 'https://sauce-demo.myshopify.com/';
  }, [steps, currentStepIndex, flow, initialUrl]);

  // Cursor position and clicking animation state
  const { cursorPos, isClicking } = useMemo(() => {
    if (!currentStep) return { cursorPos: { x: 50, y: 50 }, isClicking: false };
    
    const stepElapsed = currentTimeMs - currentStep.calculatedTimeMs;
    const target = currentStep.resolvedCoordinates;
    
    // Previous step position for smooth interpolation
    const prevTarget = currentStepIndex > 0 
      ? steps[currentStepIndex - 1].resolvedCoordinates 
      : { x: 50, y: 50 };

    const moveDuration = 450;
    const moveProgress = Math.max(0, Math.min(1, stepElapsed / moveDuration));
    
    // Ease-in-out interpolation
    const ease = moveProgress < 0.5 
      ? 2 * moveProgress * moveProgress 
      : 1 - Math.pow(-2 * moveProgress + 2, 2) / 2;

    const x = prevTarget.x + (target.x - prevTarget.x) * ease;
    const y = prevTarget.y + (target.y - prevTarget.y) * ease;

    const isClickAction = ['click', 'dblclick', 'check', 'uncheck', 'select', 'selectOption'].includes(currentStep.action);
    const clicking = isClickAction && stepElapsed >= 400 && stepElapsed <= 850;

    return { cursorPos: { x, y }, isClicking: clicking };
  }, [currentStep, currentStepIndex, steps, currentTimeMs]);

  // Reset to beginning (0:00) when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentTimeMs(0);
      setIsPlaying(true);
      lastTickTimeRef.current = Date.now();
    }
  }, [isOpen]);

  // Main playback loop
  useEffect(() => {
    if (!isOpen || !isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    lastTickTimeRef.current = Date.now();

    const loop = () => {
      const now = Date.now();
      const delta = (now - lastTickTimeRef.current) * playbackSpeed;
      lastTickTimeRef.current = now;

      setCurrentTimeMs(prev => {
        const next = prev + delta;
        if (next >= totalDurationMs) {
          setIsPlaying(false);
          return totalDurationMs;
        }
        return next;
      });

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, isPlaying, playbackSpeed, totalDurationMs]);

  const handlePlayPause = () => {
    if (currentTimeMs >= totalDurationMs) {
      setCurrentTimeMs(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(!isPlaying);
    }
    lastTickTimeRef.current = Date.now();
  };

  const handleReplay = () => {
    setCurrentTimeMs(0);
    setIsPlaying(true);
    lastTickTimeRef.current = Date.now();
  };

  const handleSeek = (percentage: number) => {
    const targetMs = Math.max(0, Math.min(totalDurationMs, (percentage / 100) * totalDurationMs));
    setCurrentTimeMs(targetMs);
    lastTickTimeRef.current = Date.now();
  };

  const handleSkip = (seconds: number) => {
    const deltaMs = seconds * 1000;
    setCurrentTimeMs(prev => Math.max(0, Math.min(totalDurationMs, prev + deltaMs)));
    lastTickTimeRef.current = Date.now();
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // High-fidelity client-side Video Recorder and Downloader
  const handleDownloadRecordedVideo = async () => {
    if (!flow || steps.length === 0) {
      toast.error('No recording steps available to export video');
      return;
    }

    setIsGeneratingDownload(true);
    setDownloadProgress(10);
    try {
      await downloadFlowVideoFile(flow, currentActiveUrl || initialUrl, (progress) => {
        setDownloadProgress(progress);
      }, screenshots);
      if (onDownloadVideo) {
        onDownloadVideo(flow);
      }
    } finally {
      setIsGeneratingDownload(false);
      setDownloadProgress(0);
    }
  };

  const activeScreenshot = currentStep?.screenshot || 
    (currentStep ? screenshots[currentStep.id] : undefined) || 
    (flow?.screenshots && flow.screenshots[currentStepIndex]) || 
    Object.values(screenshots)[currentStepIndex] || 
    Object.values(screenshots).slice(-1)[0];

  if (!isOpen || !flow) return null;

  return (
    <AnimatePresence>
      <div className={`fixed inset-0 z-[6000] flex items-center justify-center bg-slate-950/90 backdrop-blur-md transition-all duration-300 ${isFullscreen ? 'p-0' : 'p-4 md:p-6'}`}>
        <motion.div
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          className={`bg-slate-900 shadow-2xl flex flex-col overflow-hidden text-slate-100 transition-all duration-300 ${
            isFullscreen 
              ? 'w-screen h-screen rounded-none border-0' 
              : 'w-full max-w-6xl h-[92vh] rounded-[2.5rem] border border-slate-800'
          }`}
        >
          {/* Header Bar */}
          <div className="p-5 md:p-6 border-b border-slate-800 bg-slate-950/90 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20 shadow-lg shadow-indigo-950">
                <Video size={24} />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    Recorded Flow Video Viewer
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
                    <Sparkles size={10} /> Full Flow Recording
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 size={10} /> {steps.length} Actions Captured
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-2">
                  <span>Flow: <strong className="text-indigo-300">"{flow.name}"</strong></span>
                  <span>• Duration: {formatTime(totalDurationMs)}</span>
                  <span>• Platform: {flow.platform === 'mobile' ? 'Mobile' : 'Web App'}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Download Video Button */}
              <button
                onClick={handleDownloadRecordedVideo}
                disabled={isGeneratingDownload}
                className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-950 flex items-center gap-2 disabled:opacity-50"
                title="Download complete recorded video to your computer"
              >
                {isGeneratingDownload ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Rendering ({downloadProgress}%)...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>Download Video</span>
                  </>
                )}
              </button>

              {/* Fullscreen Toggle */}
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-700"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
              >
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>

              {/* Close Modal */}
              <button
                onClick={onClose}
                className="p-2.5 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Main Video View Canvas & Sidebar Workspace */}
          <div className="flex-1 bg-slate-950 relative overflow-hidden flex flex-col lg:flex-row">
            
            {/* Visual Video Playback Stage */}
            <div className="flex-1 bg-slate-900 p-6 flex flex-col justify-between overflow-y-auto custom-scrollbar border-r border-slate-800">
              <div className="w-full h-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden flex flex-col relative min-h-[380px] shadow-2xl">
                
                {flow.platform === 'mobile' ? (
                  /* Mobile Emulator Stage */
                  <div className="flex-1 bg-slate-900 relative flex items-center justify-center p-3 overflow-hidden select-none">
                    <MobilePlaybackEmulator
                      flow={flow}
                      currentStepIndex={currentStepIndex}
                      playbackStatus={isPlaying ? 'running' : 'paused'}
                      playbackSpeed={playbackSpeed}
                      cursorPos={cursorPos}
                      isClicking={isClicking}
                      activeTypingText={activeTypedText}
                      stepScreenshots={screenshots}
                      viewMode={viewMode === 'screenshot' ? 'screenshot' : 'interactive'}
                      onToggleViewMode={(m) => setViewMode(m === 'screenshot' ? 'screenshot' : 'interactive')}
                      showInteractionOverlay={true}
                    />
                  </div>
                ) : (
                  <>
                    {/* Browser Address Bar / Header HUD */}
                    <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                        </div>
                        <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800 flex-1 max-w-[550px]">
                          <Globe size={13} className="text-indigo-400 shrink-0" />
                          <span className="text-[11px] font-mono text-slate-300 truncate">
                            {currentActiveUrl}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                        {/* Mode switcher: Step Screenshot vs Live Application Frame */}
                        <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                          <button
                            onClick={() => setViewMode('screenshot')}
                            className={`px-2.5 py-1 rounded text-[9px] font-bold transition-all ${
                              viewMode === 'screenshot'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Screenshot View
                          </button>
                          <button
                            onClick={() => setViewMode('iframe')}
                            className={`px-2.5 py-1 rounded text-[9px] font-bold transition-all ${
                              viewMode === 'iframe'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Live Proxy View
                          </button>
                        </div>

                        <span className="px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                          Playback Stream
                        </span>
                        <span className="font-mono text-slate-400">
                          Step {currentStepIndex + 1} of {steps.length}
                        </span>
                      </div>
                    </div>

                    {/* Visual Interactive Application UI Canvas Frame */}
                    <div className="flex-1 bg-slate-900 relative flex items-center justify-center overflow-hidden select-none">
                      
                      {/* Real Web/Mobile Application Stage */}
                      <div className="w-full h-full bg-slate-950 relative overflow-hidden flex items-center justify-center">
                    
                    {/* Actual Application UI Content */}
                    {viewMode === 'screenshot' && activeScreenshot ? (
                      <img
                        key={`screenshot-img-${currentStepIndex}`}
                        src={activeScreenshot}
                        alt={`Actual UI - Step ${currentStepIndex + 1}`}
                        className="w-full h-full object-fill object-top pointer-events-none select-none"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <iframe
                        key={`video-modal-frame-${currentActiveUrl}-${useProxy}`}
                        src={
                          currentActiveUrl
                            ? (useProxy ? `/api/proxy?url=${encodeURIComponent(currentActiveUrl)}` : currentActiveUrl)
                            : 'about:blank'
                        }
                        className="w-full h-full border-none pointer-events-none bg-white select-none"
                        title="Actual Recorded Web Application"
                      />
                    )}

                    {/* Active Step Highlight Focus Ring */}
                    {currentStep && (
                      <motion.div
                        key={`video-bbox-${currentStepIndex}`}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                          left: `${currentStep.resolvedTargetBox.x}%`,
                          top: `${currentStep.resolvedTargetBox.y}%`,
                          width: `${Math.max(4, currentStep.resolvedTargetBox.width)}%`,
                          height: `${Math.max(2.8, currentStep.resolvedTargetBox.height)}%`,
                        }}
                        className={`absolute rounded-md pointer-events-none transition-all duration-200 z-30 ${
                          ['fill', 'type'].includes(currentStep.action)
                            ? 'border-2 border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.4)]'
                            : 'border-2 border-emerald-400 bg-emerald-500/15 shadow-[0_0_20px_rgba(16,185,129,0.7)] ring-2 ring-emerald-400/30'
                        } flex items-start justify-between p-1 overflow-hidden`}
                      >
                        <div className={`flex items-center gap-1 text-[8px] font-black uppercase px-1.5 py-0.5 rounded shadow ${
                          ['fill', 'type'].includes(currentStep.action)
                            ? 'bg-indigo-600 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}>
                          <span>{currentStep.action}</span>
                        </div>
                        <span className={`w-2 h-2 rounded-full ${
                          ['fill', 'type'].includes(currentStep.action) ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-400 animate-ping'
                        }`} />
                      </motion.div>
                    )}

                    {/* Click Wave Ripple Animation */}
                    <AnimatePresence>
                      {isClicking && (
                        <motion.div
                          initial={{ scale: 0.2, opacity: 1 }}
                          animate={{ scale: 2.4, opacity: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.45, ease: 'easeOut' }}
                          style={{
                            left: `${cursorPos.x}%`,
                            top: `${cursorPos.y}%`,
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-4 border-emerald-400 bg-emerald-500/30 shadow-[0_0_30px_rgba(52,211,153,0.9)] pointer-events-none z-40"
                        />
                      )}
                    </AnimatePresence>

                    {/* Animated Virtual Mouse Cursor */}
                    <motion.div
                      animate={{
                        left: `${cursorPos.x}%`,
                        top: `${cursorPos.y}%`,
                      }}
                      transition={{
                        duration: 0.45 / playbackSpeed,
                        ease: 'easeInOut',
                      }}
                      className="absolute z-50 pointer-events-none -translate-x-1 -translate-y-1"
                    >
                      <div className="relative">
                        <svg
                          width="28"
                          height="28"
                          viewBox="0 0 24 24"
                          fill="none"
                          className="drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]"
                        >
                          <path
                            d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
                            fill="#6366f1"
                            stroke="#ffffff"
                            strokeWidth="2.2"
                            strokeLinejoin="round"
                          />
                        </svg>

                        {/* Floating Action Badge Tooltip (Non-typing steps only to prevent overlapping) */}
                        {currentStep && !['fill', 'type'].includes(currentStep.action) && (
                          <div className="absolute left-6 top-2 bg-slate-950/95 text-white px-3 py-1.5 rounded-xl border border-indigo-500/50 text-[10px] font-black uppercase tracking-wider whitespace-nowrap shadow-2xl flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${isClicking ? 'bg-emerald-400 animate-ping' : 'bg-indigo-400'}`} />
                            <span className="text-indigo-300">{currentStep.action}</span>
                            <span className="text-slate-400 text-[9px] font-mono font-normal truncate max-w-[140px]">
                              {currentStep.elementName || currentStep.locator?.primary?.value}
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>

                    {/* Action Spotlight HUD Card (Top Right) */}
                    {currentStep && (
                      <div className="absolute top-4 right-4 bg-slate-950/95 backdrop-blur-md border border-indigo-500/50 p-4 rounded-2xl text-white shadow-2xl max-w-sm z-30 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[9px] font-black uppercase tracking-widest">
                            Action #{currentStepIndex + 1} / {steps.length}
                          </span>
                          <span className="text-[9px] font-mono text-emerald-400 flex items-center gap-1 font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Recorded Action
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-200 mt-1">
                          {currentStep.elementName || currentStep.locator?.primary?.value || 'Target Element'}
                        </p>
                        {currentStep.value && (
                          <p className="text-[10px] text-emerald-400 font-mono mt-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-800 truncate">
                            Value: "{currentStep.value}"
                          </p>
                        )}
                      </div>
                    )}

                  </div>
                </div>
                  </>
                )}

              </div>
            </div>

            {/* Right Side: Step Timeline & Metadata */}
            <div className="w-full lg:w-[380px] bg-slate-950 p-6 flex flex-col justify-between overflow-y-auto custom-scrollbar border-t lg:border-t-0 lg:border-l border-slate-800">
              <div className="flex-1 flex flex-col overflow-hidden">
                
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Layers size={14} className="text-indigo-400" /> Recorded Timeline
                  </h4>
                  <span className="text-[10px] font-mono text-slate-400 font-bold">
                    {steps.length} Steps
                  </span>
                </div>

                {/* Steps Scrollable List */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar max-h-[420px]">
                  {steps.map((step, idx) => {
                    const isPassed = idx < currentStepIndex;
                    const isCurrent = idx === currentStepIndex;

                    return (
                      <div
                        key={step.id || idx}
                        onClick={() => {
                          setCurrentTimeMs(step.calculatedTimeMs);
                          lastTickTimeRef.current = Date.now();
                        }}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                          isCurrent
                            ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-lg shadow-indigo-950 ring-1 ring-indigo-500/40'
                            : isPassed
                            ? 'bg-slate-900/80 border-emerald-500/30 text-slate-200 hover:bg-slate-800'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono font-black text-slate-500">#{idx + 1}</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                              isCurrent
                                ? 'bg-indigo-500 text-white'
                                : isPassed
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {step.action}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
                            <Clock size={10} />
                            <span>{formatTime(step.calculatedTimeMs)}</span>
                            {isPassed && <CheckCircle2 size={12} className="text-emerald-400 ml-1" />}
                          </div>
                        </div>

                        <p className="text-[11px] font-bold text-slate-200 truncate">
                          {step.elementName || step.locator?.primary?.value || step.value || 'Action step'}
                        </p>
                        {step.value && step.action !== 'navigate' && (
                          <p className="text-[10px] text-indigo-300 font-mono mt-0.5 truncate">
                            "{step.value}"
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Bottom Card Summary */}
              <div className="pt-4 mt-4 border-t border-slate-800 space-y-3">
                <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck size={16} className="text-indigo-400" />
                    <span className="text-[11px] font-bold text-slate-300">Video Persistence</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Saved in Cloud
                  </span>
                </div>

                <button
                  onClick={handleDownloadRecordedVideo}
                  disabled={isGeneratingDownload}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-950 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Download size={14} /> Download Recording (.webm)
                </button>
              </div>

            </div>

          </div>

          {/* Interactive Player Scrubber & Control Footer Bar */}
          <div className="p-4 md:px-8 md:py-4 bg-slate-950 border-t border-slate-800 flex flex-col gap-3 select-none">
            
            {/* Timeline Progress Scrubber Track */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-indigo-400 min-w-[45px]">
                {formatTime(currentTimeMs)}
              </span>

              <div 
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
                  handleSeek(pct);
                }}
                className="flex-1 h-3 bg-slate-800 rounded-full relative cursor-pointer group flex items-center overflow-hidden"
              >
                {/* Progress Fill */}
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-75 relative rounded-full"
                  style={{ width: `${Math.max(0, Math.min(100, (currentTimeMs / totalDurationMs) * 100))}%` }}
                />

                {/* Step Marker Pins on Timeline */}
                {steps.map((step, idx) => {
                  const pct = (step.calculatedTimeMs / totalDurationMs) * 100;
                  return (
                    <div
                      key={step.id || idx}
                      style={{ left: `${pct}%` }}
                      className="absolute w-1.5 h-3 bg-slate-400/80 -translate-x-1/2 pointer-events-none group-hover:bg-white transition-colors"
                      title={`Step ${idx + 1}: ${step.action}`}
                    />
                  );
                })}
              </div>

              <span className="text-xs font-mono font-bold text-slate-400 min-w-[45px] text-right">
                {formatTime(totalDurationMs)}
              </span>
            </div>

            {/* Playback Controls & Speed Buttons */}
            <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReplay}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700"
                  title="Replay from Beginning (0:00)"
                >
                  <RotateCcw size={15} />
                </button>

                <button
                  onClick={() => handleSkip(-5)}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700"
                  title="Rewind 5s"
                >
                  <SkipBack size={15} />
                </button>

                <button
                  onClick={handlePlayPause}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-950"
                >
                  {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                  <span>{isPlaying ? 'Pause' : currentTimeMs >= totalDurationMs ? 'Replay' : 'Play'}</span>
                </button>

                <button
                  onClick={() => handleSkip(5)}
                  className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700"
                  title="Forward 5s"
                >
                  <SkipForward size={15} />
                </button>
              </div>

              {/* Speed Controller */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Speed:</span>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                  {[0.5, 1, 1.5, 2].map(speed => (
                    <button
                      key={speed}
                      onClick={() => setPlaybackSpeed(speed)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                        playbackSpeed === speed
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>

            </div>

          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
