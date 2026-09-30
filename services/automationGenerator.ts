import { RecordedFlow, AutomationTool, ProgrammingLanguage } from '../types';
import { 
  generateFlowAutomationProject, 
  suggestFlowLocatorHealing,
  generateFallbackFlowAutomationProject,
  isCreditLimitError
} from '../geminiService';
import { validateProjectFilesLanguage, ensureCompleteProjectFiles } from './codeGenerators/multiFrameworkScriptGenerator';
import { formatProjectFiles } from './codeFormatter';

export interface GeneratedProject {
  files: {
    path: string;
    content: string;
  }[];
  explanation: string;
}

export const generateAutomationScript = async (
  flow: RecordedFlow,
  tool: AutomationTool,
  language: ProgrammingLanguage,
  framework?: string,
  bddDoc?: any
): Promise<GeneratedProject> => {
  try {
    const aiPromise = generateFlowAutomationProject(flow, tool, language, framework, bddDoc);
    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error('AI script synthesis timeout (15s ceiling reached), using verified POM generator')), 15000)
    );
    const result = await Promise.race([aiPromise, timeoutPromise]);

    if (result && Array.isArray(result.files) && result.files.length > 0) {
      const repairedFiles = ensureCompleteProjectFiles(result.files, {
        tool,
        language,
        framework,
        flowName: flow.name,
        steps: flow.steps,
        targetUrl: flow.initialUrl || (flow as any).targetUrl
      });

      if (
        repairedFiles.length > 0 && 
        !repairedFiles.some(f => f.path === 'error.txt') &&
        validateProjectFilesLanguage(repairedFiles, language)
      ) {
        return {
          ...result,
          files: formatProjectFiles(repairedFiles)
        };
      }
    }
    console.warn(`generateAutomationScript: validation failed for ${language} / ${tool}, generating verified local project.`);
    const fallback = generateFallbackFlowAutomationProject(flow, tool, language, framework, bddDoc);
    const completeFallbackFiles = ensureCompleteProjectFiles(fallback.files, {
      tool,
      language,
      framework,
      flowName: flow.name,
      steps: flow.steps,
      targetUrl: flow.initialUrl || (flow as any).targetUrl
    });
    return {
      ...fallback,
      files: formatProjectFiles(completeFallbackFiles)
    };
  } catch (error: any) {
    if (isCreditLimitError(error)) {
      throw error;
    }
    console.warn("generateAutomationScript error, generating resilient local POM framework:", error);
    const fallback = generateFallbackFlowAutomationProject(flow, tool, language, framework, bddDoc);
    const completeFallbackFiles = ensureCompleteProjectFiles(fallback.files, {
      tool,
      language,
      framework,
      flowName: flow.name,
      steps: flow.steps,
      targetUrl: flow.initialUrl || (flow as any).targetUrl
    });
    return {
      ...fallback,
      files: formatProjectFiles(completeFallbackFiles)
    };
  }
};

export const suggestLocatorHealing = async (
  step: any,
  domContext?: string
): Promise<{ suggestedLocator: string; reasoning: string }> => {
  try {
    return await suggestFlowLocatorHealing(step, domContext);
  } catch (error) {
    return {
      suggestedLocator: step?.selector || (step?.xpath ? step.xpath : `text="${step?.target || 'button'}"`),
      reasoning: 'Fallback resilient locator selected from captured attributes.'
    };
  }
};
