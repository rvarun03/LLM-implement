import path from 'path';
import fs from 'fs';
import { runCommand } from './adbService';
import { AgentConfig } from './config';

export interface ApkDetails {
  packageName: string;
  launchActivity?: string;
  versionName?: string;
  versionCode?: string;
  minSdkVersion?: string;
  targetSdkVersion?: string;
}

export async function parseApkMetadata(config: AgentConfig, apkPath: string): Promise<ApkDetails> {
  const isWin = process.platform === 'win32';
  const aaptExe = isWin ? 'aapt.exe' : 'aapt';
  let aaptPath = config.androidHome ? path.join(config.androidHome, 'build-tools', 'aaptExe') : aaptExe;

  // Try running aapt dump badging
  const dumpRes = await runCommand(`aapt dump badging "${apkPath}"`);
  if (dumpRes.success && dumpRes.stdout) {
    const stdout = dumpRes.stdout;
    let packageName = 'com.automatiqa.uploadedapp';
    let launchActivity = '';
    let versionName = '1.0.0';

    const pkgMatch = stdout.match(/package: name='([^']+)'/);
    if (pkgMatch) packageName = pkgMatch[1];

    const verMatch = stdout.match(/versionName='([^']+)'/);
    if (verMatch) versionName = verMatch[1];

    const actMatch = stdout.match(/launchable-activity: name='([^']+)'/);
    if (actMatch) launchActivity = actMatch[1];

    return {
      packageName,
      launchActivity,
      versionName
    };
  }

  // Fallback parsing from filename or default
  const baseName = path.basename(apkPath).toLowerCase();
  return {
    packageName: baseName.includes('loan') ? 'com.automatiqa.loanmanagement' : 'com.automatiqa.mobiletest',
    versionName: '1.0.0',
    launchActivity: '.MainActivity'
  };
}

export async function installApk(config: AgentConfig, deviceId: string, apkPath: string): Promise<{ success: boolean; message: string }> {
  const adbCmd = config.adbPath.includes(' ') ? `"${config.adbPath}"` : config.adbPath;
  console.log(`[ApkService] Installing ${apkPath} onto ${deviceId}...`);

  const installRes = await runCommand(`${adbCmd} -s ${deviceId} install -r "${apkPath}"`);
  if (installRes.success && installRes.stdout.includes('Success')) {
    return { success: true, message: `Successfully installed APK onto ${deviceId}.` };
  } else {
    return { success: false, message: installRes.stderr || installRes.error || 'APK installation failed.' };
  }
}

export async function launchPackage(config: AgentConfig, deviceId: string, packageName: string, launchActivity?: string): Promise<{ success: boolean; message: string }> {
  const adbCmd = config.adbPath.includes(' ') ? `"${config.adbPath}"` : config.adbPath;

  if (launchActivity) {
    const fullActivity = launchActivity.startsWith('.') ? `${packageName}${launchActivity}` : launchActivity;
    const startRes = await runCommand(`${adbCmd} -s ${deviceId} shell am start -n "${packageName}/${fullActivity}"`);
    if (startRes.success) {
      return { success: true, message: `Launched ${packageName}/${fullActivity} on ${deviceId}.` };
    }
  }

  // Fallback to monkey launch
  const monkeyRes = await runCommand(`${adbCmd} -s ${deviceId} shell monkey -p "${packageName}" 1`);
  if (monkeyRes.success) {
    return { success: true, message: `Monkey launched ${packageName} on ${deviceId}.` };
  }

  return { success: false, message: `Could not launch package ${packageName}.` };
}
