import { loadConfig } from './config';
import { checkAdbAvailable, getConnectedDevices } from './adbService';
import { checkAppiumStatus, checkUiAutomator2Driver } from './appiumService';
import { listAvds } from './emulatorService';
import { registerWithBackend, sendHeartbeatToBackend } from './websocketService';
import { startAgentServer } from './agentServer';

async function main() {
  const config = loadConfig();

  console.log('========================================');
  console.log('AutomatiQA Mobile Execution Agent');
  console.log('========================================');
  console.log(`Agent ID   : ${config.agentId}`);
  console.log(`User Email : ${config.userEmail}`);
  console.log(`Backend    : ${config.serverUrl}`);
  console.log('----------------------------------------');

  // 1. Check Android SDK & ADB
  const adbStatus = await checkAdbAvailable(config);
  if (adbStatus.available) {
    console.log(`ADB Status : CONNECTED (${adbStatus.version})`);
  } else {
    console.log(`ADB Status : ERROR - ${adbStatus.error}`);
  }

  // 2. Check Appium
  const appiumStatus = await checkAppiumStatus(config.appiumPort);
  if (appiumStatus.running) {
    console.log(`Appium     : DETECTED (${appiumStatus.statusText})`);
  } else {
    console.log(`Appium     : NOT RESPONDING on port ${config.appiumPort}`);
  }

  // 3. Check UiAutomator2
  const driverCheck = await checkUiAutomator2Driver();
  console.log(`UiAutomator2: ${driverCheck.installed ? 'AVAILABLE' : 'NOT DETECTED'}`);

  // 4. List connected devices & AVDs
  const { devices } = await getConnectedDevices(config);
  console.log(`Devices    : ${devices.length} connected device(s) detected`);

  const avds = await listAvds(config);
  console.log(`Emulators  : ${avds.length} AVD emulator(s) available (${avds.map(a => a.avdName).join(', ')})`);

  console.log('----------------------------------------');
  console.log('Agent Status: ONLINE');
  console.log(`Local Server: http://127.0.0.1:${config.agentPort}`);
  console.log('========================================');

  // Start HTTP agent server
  startAgentServer(config);

  // Initial Registration
  const capabilities = {
    android: adbStatus.available,
    emulator: avds.length > 0,
    appium: appiumStatus.running,
    uiAutomator2: driverCheck.installed,
    devices: devices.map(d => d.deviceId)
  };

  await registerWithBackend(config, capabilities);

  // Send periodic heartbeats every 10 seconds
  setInterval(async () => {
    const currentDevices = await getConnectedDevices(config);
    const currentAppium = await checkAppiumStatus(config.appiumPort);

    await sendHeartbeatToBackend(config, {
      status: 'ONLINE',
      adbAvailable: adbStatus.available,
      connectedDevices: currentDevices.devices,
      appiumRunning: currentAppium.running
    });
  }, 10000);
}

main().catch(err => {
  console.error('Fatal agent error:', err);
  process.exit(1);
});
