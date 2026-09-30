import { RecordedFlow, RecordedStep, AutomationScript, Project } from '../types';
import { formatMobileStepDescription, convertMobileStepsToAppiumCode, optimizeMobileStepSequence } from '../utils/mobileRecordingSteps';
import { updateProjectFirestore } from './projectService';
import { syncUpdateDoc } from './firestoreSync';

export interface MobileRecordingSession {
  sessionId: string;
  deviceName: string;
  appPackage: string;
  appActivity?: string;
  startTime: number;
  steps: RecordedStep[];
}

class MobileRecordingService {
  private activeSessions: Map<string, MobileRecordingSession> = new Map();

  createSession(deviceName: string, appPackage: string, appActivity?: string): MobileRecordingSession {
    const sessionId = `mrec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const session: MobileRecordingSession = {
      sessionId,
      deviceName,
      appPackage,
      appActivity,
      startTime: Date.now(),
      steps: []
    };
    this.activeSessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): MobileRecordingSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  appendStep(sessionId: string, step: RecordedStep): RecordedStep[] {
    const session = this.activeSessions.get(sessionId);
    if (!session) return [];
    session.steps.push(step);
    return session.steps;
  }

  endSession(sessionId: string): RecordedStep[] {
    const session = this.activeSessions.get(sessionId);
    if (!session) return [];
    const finalSteps = optimizeMobileStepSequence(session.steps);
    this.activeSessions.delete(sessionId);
    return finalSteps;
  }

  async saveRecordedFlowToProject(
    project: Project,
    flowName: string,
    steps: RecordedStep[],
    mobilePackageName: string,
    mobileAppName?: string,
    userEmail?: string
  ): Promise<{ updatedProject: Project; savedFlow: RecordedFlow }> {
    const newFlow: RecordedFlow = {
      id: `flow_mobile_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: flowName || `Mobile APK Recording (${mobilePackageName})`,
      description: `Automated mobile recording session captured on ${new Date().toLocaleDateString()}`,
      steps: optimizeMobileStepSequence(steps),
      createdAt: new Date().toISOString(),
      isApproved: true,
      platform: 'mobile',
      mobilePackageName,
      mobileAppName
    };

    const updatedRecordedFlows = [...(project.recordedFlows || []), newFlow];
    const updatedProject: Project = {
      ...project,
      recordedFlows: updatedRecordedFlows
    };

    if (userEmail) {
      await updateProjectFirestore(project.id, updatedProject);
    }

    return { updatedProject, savedFlow: newFlow };
  }

  generateAppiumScript(flow: RecordedFlow, appPackage?: string, appActivity?: string): string {
    return convertMobileStepsToAppiumCode(
      flow.steps,
      appPackage || flow.mobilePackageName || 'com.saucelabs.mydemoapp.rn',
      appActivity || 'com.saucelabs.mydemoapp.rn.MainActivity'
    );
  }
}

export const mobileRecordingService = new MobileRecordingService();
