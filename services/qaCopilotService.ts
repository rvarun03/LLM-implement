/**
 * ============================================================================
 * QA COPILOT CLIENT SERVICE
 * ============================================================================
 * Front-end bridge connecting the QA Copilot UI to the secure /api/qa-copilot
 * backend endpoint and telemetry feedback loop.
 */

import { extractNavigationTarget } from './qaCopilotKnowledge';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  intent?: string;
  navigationTarget?: { label: string; tab: string } | null;
  feedbackGiven?: 'helpful' | 'not_helpful';
}

export interface CopilotContextPayload {
  currentPage: string;
  currentRoute: string;
  currentFeature: string;
  userId: string;
  userEmail: string;
  userRole: string;
  projectId: string;
  projectName: string;
  lastError?: {
    code?: string;
    message?: string;
  };
  relevantCreditInfo?: {
    planType: string;
    remainingCredits: number;
    totalCredits: number;
    status: string;
  };
}

export interface CopilotQueryParams {
  question: string;
  conversationHistory: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string }>;
  }>;
  context: CopilotContextPayload;
}

export interface CopilotApiResponse {
  success: boolean;
  answer?: string;
  intent?: string;
  suggestedFollowUps?: string[];
  navigationTarget?: { label: string; tab: string } | null;
  error?: string;
  cached?: boolean;
}

/**
 * Ask QA Copilot via server endpoint.
 */
export async function askQACopilot(params: CopilotQueryParams): Promise<CopilotApiResponse> {
  try {
    const response = await fetch('/api/qa-copilot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return {
          success: false,
          error: 'QA Copilot is experiencing high request volume. Please wait a moment and try again.',
        };
      }
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errData.error || 'QA Copilot is temporarily unable to respond. Please try again in a moment.',
      };
    }

    const data: CopilotApiResponse = await response.json();
    
    // Check if an explicit navigation target was returned or can be extracted
    if (!data.navigationTarget && data.answer) {
      data.navigationTarget = extractNavigationTarget(data.answer);
    }

    return data;
  } catch (error: any) {
    console.warn('[QA Copilot] Network or client request failed:', error);
    return {
      success: false,
      error: 'QA Copilot is temporarily unable to respond. Please check your network connection and try again.',
    };
  }
}

/**
 * Submit feedback on a Copilot answer (Helpful / Not helpful).
 */
export async function submitCopilotFeedback(payload: {
  question: string;
  answer: string;
  page: string;
  feature: string;
  rating: 'helpful' | 'not_helpful';
  userEmail?: string;
  projectId?: string;
}): Promise<boolean> {
  try {
    const response = await fetch('/api/qa-copilot/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
      }),
    });
    return response.ok;
  } catch (err) {
    console.warn('[QA Copilot Feedback] Failed to submit feedback:', err);
    return false;
  }
}
