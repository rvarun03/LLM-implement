import * as geminiService from "../geminiService";

/**
 * Mobile Record & Play AI features powered by Gemini 3.8 Flash.
 *
 * Scope: generateMobileTestCasesFromBRD, generateAppiumScript
 */

export interface ClaudeUsageMeta {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  model: string;
}

export function getLastClaudeUsageMetadata(): ClaudeUsageMeta | null {
  const meta = geminiService.getLastUsageMetadata();
  if (!meta) return null;
  return {
    promptTokenCount: meta.promptTokenCount,
    candidatesTokenCount: meta.candidatesTokenCount,
    totalTokenCount: meta.totalTokenCount,
    model: meta.model || "Gemini 3.8 Flash",
  };
}

export function setLastClaudeUsageMetadata(meta: ClaudeUsageMeta | null) {
  if (!meta) {
    geminiService.setLastUsageMetadata(null);
  } else {
    geminiService.setLastUsageMetadata({
      promptTokenCount: meta.promptTokenCount,
      candidatesTokenCount: meta.candidatesTokenCount,
      totalTokenCount: meta.totalTokenCount,
      model: meta.model || "Gemini 3.8 Flash",
    });
  }
}

export function formatClaudeError(error: any): string {
  return geminiService.formatGeminiError(error);
}

/**
 * Generates structured Mobile Scenarios and Test Cases with Appium locators using Gemini 3.8 Flash.
 */
export async function generateMobileTestCasesFromBRD(appName: string, brdText: string, refineInstructions?: string) {
  return geminiService.generateMobileTestCasesFromBRD(appName, brdText, refineInstructions);
}

/**
 * Generates a production-ready Appium TypeScript automation script using Gemini 3.8 Flash.
 */
export async function generateAppiumScript(appName: string, steps: any[], platform: string = "Android", refineInstructions?: string) {
  return geminiService.generateAppiumScript(appName, steps, platform, refineInstructions);
}
