import { exec, spawn } from 'child_process';
import { AgentConfig } from './config';
import { runCommand } from './adbService';

export interface AvdInfo {
  avdName: string;
  status: 'STOPPED' | 'STARTING' | 'BOOTING' | 'ONLINE' | 'READY';
  apiLevel?: string;
  target?: string;
}

export async function listAvds(config: AgentConfig): Promise<AvdInfo[]> {
  const emuCmd = config.emulatorPath.includes(' ') ? `"${config.emulatorPath}"` : config.emulatorPath;
  let res = await runCommand(`${emuCmd} -list-avds`);

  if (!res.success) {
    res = await runCommand('emulator -list-avds');
  }

  if (!res.success || !res.stdout) {
    return [];
  }

  const lines = res.stdout.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map(avdName => ({
    avdName,
    status: 'STOPPED'
  }));
}

export async function startAvdEmulator(config: AgentConfig, avdName: string): Promise<{ success: boolean; message: string; deviceId?: string }> {
  const emuCmd = config.emulatorPath.includes(' ') ? `"${config.emulatorPath}"` : config.emulatorPath;
  const adbCmd = config.adbPath.includes(' ') ? `"${config.adbPath}"` : config.adbPath;

  console.log(`[EmulatorService] Launching AVD: ${avdName}...`);

  // Spawn emulator child process detached
  const child = spawn(emuCmd, ['-avd', avdName], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  // Wait for device to appear in adb
  await runCommand(`${adbCmd} wait-for-device`);

  // Poll for boot completion: adb shell getprop sys.boot_completed
  let booted = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const bootRes = await runCommand(`${adbCmd} shell getprop sys.boot_completed`);
    if (bootRes.success && bootRes.stdout.trim() === '1') {
      booted = true;
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (booted) {
    return { success: true, message: `Emulator ${avdName} is booted and READY.`, deviceId: 'emulator-5554' };
  } else {
    return { success: false, message: `Emulator ${avdName} started but boot check timed out.` };
  }
}
