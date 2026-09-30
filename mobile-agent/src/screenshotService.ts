import { AgentConfig } from './config';
import { runCommand } from './adbService';

export async function captureDeviceScreenshotBase64(config: AgentConfig, deviceId: string): Promise<string | null> {
  const adbCmd = config.adbPath.includes(' ') ? `"${config.adbPath}"` : config.adbPath;
  const res = await runCommand(`${adbCmd} -s ${deviceId} shell screencap -p | exec base64`);

  if (res.success && res.stdout) {
    const cleanB64 = res.stdout.replace(/[\r\n]/g, '');
    if (cleanB64.length > 100) {
      return `data:image/png;base64,${cleanB64}`;
    }
  }
  return null;
}

export async function fetchPageSourceXml(config: AgentConfig, deviceId: string): Promise<string | null> {
  const adbCmd = config.adbPath.includes(' ') ? `"${config.adbPath}"` : config.adbPath;
  // Dump ui hierarchy to /sdcard/window_dump.xml and cat it out
  await runCommand(`${adbCmd} -s ${deviceId} shell uiautomator dump /sdcard/window_dump.xml`);
  const catRes = await runCommand(`${adbCmd} -s ${deviceId} shell cat /sdcard/window_dump.xml`);

  if (catRes.success && catRes.stdout.includes('<?xml')) {
    return catRes.stdout.trim();
  }
  return null;
}
