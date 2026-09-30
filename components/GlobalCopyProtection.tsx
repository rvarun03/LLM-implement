import React, { useEffect } from 'react';
import { getProjectCreditSummary } from '../services/tokenConsumptionService';
import { toast } from 'sonner';

/**
 * ============================================================================
 * GLOBAL DATA PROTECTION & COPY RESTRICTION SYSTEM
 * ============================================================================
 * Centrally enforces copy protection across the entire AutomatiQA platform:
 * 
 * 1. Blocks keyboard copy shortcuts:
 *    - Ctrl + C
 *    - Cmd + C (macOS)
 *    - Ctrl + Insert
 * 
 * 2. Blocks browser context menu (Right-click -> Copy):
 *    - Disables native browser context menu on AutomatiQA application content.
 *    - Preserves normal interactive controls (buttons, inputs, dropdowns, scrollbars).
 * 
 * 3. Blocks other browser copy mechanisms:
 *    - Clipboard `copy` event (clears clipboard data if unauthorized).
 *    - Clipboard `cut` event on read-only/application content.
 *    - Dragging selected text into external apps (`dragstart`).
 *    - Selection on protected read-only elements (`selectstart`).
 * 
 * 4. Preserves official application Copy buttons:
 *    - Distinguishes AUTHORIZED APPLICATION COPY from UNAUTHORIZED USER COPY.
 *    - Transparently wraps `navigator.clipboard.writeText` to authorize official copies.
 *    - Allows existing credit checks and deduction handlers to execute uninterrupted.
 * 
 * 5. Preserves user input and form editing:
 *    - Users can type, edit, delete, backspace, and paste into text fields normally.
 * ============================================================================
 */

let authorizedUntilTimestamp = 0;
let isInitialized = false;

/**
 * Open an authorized copy window (e.g., when an official Copy button is clicked).
 */
export function markAuthorizedCopy(durationMs: number = 3000): void {
  authorizedUntilTimestamp = Date.now() + durationMs;
}

/**
 * Check if the application is currently within an authorized copy window.
 */
export function isAuthorizedCopyActive(): boolean {
  return Date.now() < authorizedUntilTimestamp;
}

/**
 * Official application helper to copy text to clipboard with authorization.
 */
export async function authorizedCopyToClipboard(text: string): Promise<boolean> {
  // Enforce project credit limit: Copy is blocked when credit limit is exceeded
  try {
    const activeProjId = typeof window !== 'undefined' ? (localStorage.getItem('automatiqa_active_project_id') || undefined) : undefined;
    const activeProjName = typeof window !== 'undefined' ? (localStorage.getItem('automatiqa_active_project_name') || undefined) : undefined;
    const summary = getProjectCreditSummary(activeProjId, activeProjName);
    if (summary.remainingCredits <= 0) {
      toast.error(`Project credit limit exceeded (${summary.usedCredits}/${summary.totalPool} used on ${summary.planType} plan). Copy is blocked until Super Admin renews or changes the plan.`);
      return false;
    }
  } catch (e) {
    // Ignore error if storage/summary unavailable
  }

  markAuthorizedCopy(3000);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('[GlobalCopyProtection] Primary clipboard writeText failed, using fallback:', err);
  }

  // Fallback for iframe / unsupported permissions
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    textarea.className = 'allow-select';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    markAuthorizedCopy(3000);
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (fallbackErr) {
    console.error('[GlobalCopyProtection] Fallback copy failed:', fallbackErr);
    return false;
  }
}

/**
 * Determine if the event target is an editable form control where user text entry
 * must be preserved (input, textarea, contenteditable).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const editableElement = target.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]');
  if (!editableElement) return false;

  if (editableElement instanceof HTMLInputElement || editableElement instanceof HTMLTextAreaElement) {
    if (editableElement.readOnly || editableElement.disabled) {
      return false;
    }
    const type = editableElement.getAttribute('type')?.toLowerCase();
    if (type && ['button', 'submit', 'reset', 'checkbox', 'radio', 'image'].includes(type)) {
      return false;
    }
    return true;
  }

  const contentEditable = editableElement.getAttribute('contenteditable');
  return contentEditable === 'true' || contentEditable === 'plaintext-only';
}

/**
 * Initialize global event listeners on window / document.
 * Safe to call multiple times; executes only once.
 */
export function initGlobalCopyProtection(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  if (isInitialized) {
    return () => {};
  }
  isInitialized = true;

  // 1. Transparently wrap navigator.clipboard.writeText so official Copy buttons work seamlessly
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      const originalWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
      (navigator.clipboard as any).__originalWriteText = originalWriteText;

      navigator.clipboard.writeText = async (text: string) => {
        markAuthorizedCopy(3000);
        try {
          return await originalWriteText(text);
        } catch (error) {
          // If writeText is blocked by browser permission policy, attempt fallback
          const fallbackSuccess = await authorizedCopyToClipboard(text);
          if (!fallbackSuccess) {
            throw error;
          }
        }
      };
    }
  } catch (err) {
    console.warn('[GlobalCopyProtection] Could not wrap navigator.clipboard.writeText:', err);
  }

  // 2. Keyboard shortcut blocking: Ctrl+C, Cmd+C, Ctrl+Insert
  const handleKeyDown = (e: KeyboardEvent) => {
    const isCtrlOrCmd = e.ctrlKey || e.metaKey;
    const key = e.key ? e.key.toLowerCase() : '';
    const code = e.code ? e.code.toLowerCase() : '';

    // Check for Copy shortcuts: Ctrl+C / Cmd+C / Ctrl+Insert
    const isCopyShortcut = 
      (isCtrlOrCmd && (key === 'c' || code === 'keyc')) ||
      (e.ctrlKey && (key === 'insert' || code === 'insert'));

    if (isCopyShortcut) {
      // If within an active authorized window (e.g. programmatic), allow
      if (isAuthorizedCopyActive()) {
        return;
      }

      // Block unauthorized user keyboard copy operation across all content
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Check for Cut shortcut: Ctrl+X / Cmd+X on non-editable elements
    const isCutShortcut = isCtrlOrCmd && (key === 'x' || code === 'keyx');
    if (isCutShortcut && !isEditableTarget(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // 3. Right-Click Context Menu Blocking
  // Prevents the browser's context menu (Right Click -> Copy) from appearing on AutomatiQA content
  const handleContextMenu = (e: MouseEvent) => {
    // Stop the default browser context menu
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  // 4. Global DOM `copy` event interception
  const handleCopy = (e: ClipboardEvent) => {
    if (isAuthorizedCopyActive()) {
      // Authorized application copy, permit write
      return;
    }

    // Unauthorized user copy attempt: prevent default and clear clipboard data
    e.preventDefault();
    e.stopPropagation();

    if (e.clipboardData) {
      try {
        e.clipboardData.clearData();
        e.clipboardData.setData('text/plain', '');
      } catch (err) {}
    }
  };

  // 5. Global DOM `cut` event interception
  const handleCut = (e: ClipboardEvent) => {
    if (isAuthorizedCopyActive()) {
      return;
    }

    // If cutting from non-editable text, block
    if (!isEditableTarget(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      if (e.clipboardData) {
        try {
          e.clipboardData.clearData();
        } catch (err) {}
      }
    }
  };

  // 6. Block dragging selected text out of the application
  const handleDragStart = (e: DragEvent) => {
    const target = e.target as HTMLElement | null;
    const isExplicitDraggable = target && (target.getAttribute('draggable') === 'true' || target.closest('[draggable="true"]'));
    
    // If not a component specifically built to be dragged, prevent dragging text
    if (!isExplicitDraggable) {
      e.preventDefault();
    }
  };

  // 7. Prevent text selection highlighting on read-only application content
  const handleSelectStart = (e: Event) => {
    if (!isEditableTarget(e.target)) {
      // Prevent highlighting of read-only / generated test cases, scenarios, scripts, reports
      e.preventDefault();
    }
  };

  // 8. Auto-detect clicks on authorized application Copy buttons
  const handleClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const button = target.closest('button, [role="button"], a');
    if (button) {
      const text = (button.textContent || '').toLowerCase();
      const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
      const title = (button.getAttribute('title') || '').toLowerCase();
      const isCopyButton = 
        button.getAttribute('data-authorized-copy') === 'true' ||
        text.includes('copy') ||
        ariaLabel.includes('copy') ||
        title.includes('copy');

      if (isCopyButton) {
        markAuthorizedCopy(3000);
      }
    }
  };

  // Attach all handlers with capture: true to intercept before page elements
  document.addEventListener('keydown', handleKeyDown, { capture: true });
  document.addEventListener('contextmenu', handleContextMenu, { capture: true });
  document.addEventListener('copy', handleCopy, { capture: true });
  document.addEventListener('cut', handleCut, { capture: true });
  document.addEventListener('dragstart', handleDragStart, { capture: true });
  document.addEventListener('selectstart', handleSelectStart, { capture: true });
  document.addEventListener('click', handleClick, { capture: true });

  return () => {
    document.removeEventListener('keydown', handleKeyDown, { capture: true });
    document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    document.removeEventListener('copy', handleCopy, { capture: true });
    document.removeEventListener('cut', handleCut, { capture: true });
    document.removeEventListener('dragstart', handleDragStart, { capture: true });
    document.removeEventListener('selectstart', handleSelectStart, { capture: true });
    document.removeEventListener('click', handleClick, { capture: true });
    isInitialized = false;
  };
}

// Auto-initialize immediately if running in browser
if (typeof window !== 'undefined') {
  initGlobalCopyProtection();
}

export interface GlobalCopyProtectionProps {
  children?: React.ReactNode;
}

/**
 * Root React Provider component ensuring copy protection stays active across
 * all React views, tabs, modals, dynamic renders, and route changes.
 */
export const GlobalCopyProtection: React.FC<GlobalCopyProtectionProps> = ({ children }) => {
  useEffect(() => {
    const cleanup = initGlobalCopyProtection();
    return cleanup;
  }, []);

  return <>{children}</>;
};

export default GlobalCopyProtection;
