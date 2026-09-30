import path from 'path';
import os from 'os';

export interface AgentConfig {
  agentId: string;
  userEmail: string;
  serverUrl: string;
  agentPort: number;
  appiumPort: number;
  androidHome: string;
  adbPath: string;
  emulatorPath: string;
}

export function loadConfig(): AgentConfig {
  const args: Record<string, string> = {};
  process.argv.slice(2).forEach(val => {
    const parts = val.split('=');
    if (parts[0].startsWith('--')) {
      const key = parts[0].slice(2);
      args[key] = parts[1] || 'true';
    } else if (val.startsWith('--user=')) {
      args['user'] = val.substring(7);
    }
  });

  const userEmail = args.user || args.email || process.env.AUTOMATIQA_USER_EMAIL || 'shanmugapriya@qaoncloud.com';
  const serverUrl = args.server || process.env.AUTOMATIQA_BACKEND_URL || 'http://localhost:3000';
  const agentPort = parseInt(args.port || process.env.AUTOMATIQA_AGENT_PORT || '8080');
  const appiumPort = parseInt(args.appiumPort || process.env.APPIUM_PORT || '4723');

  // Discover Android SDK Home
  let androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
  if (!androidHome) {
    const home = os.homedir();
    if (process.platform === 'win32') {
      androidHome = path.join(home, 'AppData', 'Local', 'Android', 'Sdk');
    } else if (process.platform === 'darwin') {
      androidHome = path.join(home, 'Library', 'Android', 'sdk');
    } else {
      androidHome = path.join(home, 'Android', 'Sdk');
    }
  }

  const isWin = process.platform === 'win32';
  const adbExecutable = isWin ? 'adb.exe' : 'adb';
  const emulatorExecutable = isWin ? 'emulator.exe' : 'emulator';

  const adbPath = androidHome ? path.join(androidHome, 'platform-tools', adbExecutable) : adbExecutable;
  const emulatorPath = androidHome ? path.join(androidHome, 'emulator', emulatorExecutable) : emulatorExecutable;

  const hostname = os.hostname();
  const agentId = `agent-${hostname.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString().slice(-4)}`;

  return {
    agentId,
    userEmail,
    serverUrl,
    agentPort,
    appiumPort,
    androidHome,
    adbPath,
    emulatorPath
  };
}
