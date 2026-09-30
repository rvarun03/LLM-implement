import http from 'http';
import { AgentConfig } from './config';
import { getFullDeviceStatus } from './deviceService';
import { checkAppiumStatus } from './appiumService';
import { captureDeviceScreenshotBase64, fetchPageSourceXml } from './screenshotService';
import { installApk, launchPackage } from './apkService';
import { startAvdEmulator } from './emulatorService';

export function startAgentServer(config: AgentConfig) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${config.agentPort}`);

    if (url.pathname === '/status') {
      const devStatus = await getFullDeviceStatus(config);
      const appiumStatus = await checkAppiumStatus(config.appiumPort);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        agentId: config.agentId,
        userEmail: config.userEmail,
        status: 'ONLINE',
        androidSdk: config.androidHome,
        adb: devStatus,
        appium: appiumStatus
      }));
      return;
    }

    if (url.pathname === '/screenshot') {
      const deviceId = url.searchParams.get('deviceId') || 'emulator-5554';
      const screenshot = await captureDeviceScreenshotBase64(config, deviceId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: !!screenshot, screenshotUrl: screenshot }));
      return;
    }

    if (url.pathname === '/hierarchy') {
      const deviceId = url.searchParams.get('deviceId') || 'emulator-5554';
      const xml = await fetchPageSourceXml(config, deviceId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: !!xml, xmlPageSource: xml }));
      return;
    }

    if (url.pathname === '/emulator/start' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const parsed = JSON.parse(body || '{}');
          const avdName = parsed.avdName || 'Pixel_7';
          const result = await startAvdEmulator(config, avdName);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
  });

  server.listen(config.agentPort, '127.0.0.1', () => {
    console.log(`========================================`);
    console.log(`AutomatiQA Local Mobile Agent Server`);
    console.log(`Listening on http://127.0.0.1:${config.agentPort}`);
    console.log(`========================================`);
  });
}
