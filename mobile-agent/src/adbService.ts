import { exec } from 'child_process';
import { AgentConfig } from './config';

export interface AdbDevice {
  deviceId: string;
  type: 'EMULATOR' | 'REAL_DEVICE';
  model: string;
  status: 'ONLINE' | 'OFFLINE' | 'UNAUTHORIZED';
  osVersion?: string;
}

export function runCommand(command: string): Promise<{ success: boolean; stdout: string; stderr: string; error?: string }> {
  return new Promise((resolve) => {
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, stdout: stdout.toString(), stderr: stderr.toString(), error: error.message });
      } else {
        resolve({ success: true, stdout: stdout.toString(), stderr: stderr.toString() });
      }
    });
  });
}

export async function checkAdbAvailable(config: AgentConfig): Promise<{ available: boolean; version?: string; error?: string }> {
  const res = await runCommand(`"${config.adbPath}" version`);
  if (res.success && res.stdout) {
    const firstLine = res.stdout.split('\n')[0].trim();
    return { available: true, version: firstLine };
  }
  
  // Fallback to plain 'adb' command in PATH
  const fallbackRes = await runCommand('adb version');
  if (fallbackRes.success) {
    const firstLine = fallbackRes.stdout.split('\n')[0].trim();
    return { available: true, version: firstLine };
  }

  return { 
    available: false, 
    error: 'ADB_NOT_FOUND: Android Debug Bridge was not found on the execution agent.' 
  };
}

export async function getConnectedDevices(config: AgentConfig): Promise<{ devices: AdbDevice[]; raw: string; error?: string }> {
  const adbCmd = config.adbPath.includes(' ') ? `"${config.adbPath}"` : config.adbPath;
  const res = await runCommand(`${adbCmd} devices -l`);

  if (!res.success) {
    return { devices: [], raw: res.stderr || res.error || '', error: 'ADB_COMMAND_FAILED' };
  }

  const lines = res.stdout.split('\n');
  const devices: AdbDevice[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const id = parts[0];
    const rawStatus = parts[1]; // 'device', 'offline', 'unauthorized'

    let status: AdbDevice['status'] = 'ONLINE';
    if (rawStatus === 'offline') status = 'OFFLINE';
    if (rawStatus === 'unauthorized') status = 'UNAUTHORIZED';

    let model = id.startsWith('emulator-') ? `Android Emulator (${id})` : 'Connected Android Device';
    parts.forEach(p => {
      if (p.startsWith('model:')) {
        model = p.substring(6).replace(/_/g, ' ');
      }
    });

    const isEmulator = id.startsWith('emulator-') || id.startsWith('127.0.0.1:') || model.toLowerCase().includes('emulator');

    devices.push({
      deviceId: id,
      type: isEmulator ? 'EMULATOR' : 'REAL_DEVICE',
      model,
      status
    });
  }

  return { devices, raw: res.stdout };
}
