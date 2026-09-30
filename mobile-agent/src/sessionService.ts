import http from 'http';

export interface MobileSessionConfig {
  deviceId: string;
  appiumPort: number;
  appPath?: string;
  packageName?: string;
}

export interface AppiumSession {
  sessionId: string;
  deviceId: string;
  status: 'ACTIVE' | 'CLOSED';
}

export async function createUiAutomator2Session(sessionConfig: MobileSessionConfig): Promise<AppiumSession | null> {
  const payload = JSON.stringify({
    capabilities: {
      alwaysMatch: {
        platformName: "Android",
        "appium:automationName": "UiAutomator2",
        "appium:deviceName": sessionConfig.deviceId,
        "appium:udid": sessionConfig.deviceId,
        "appium:app": sessionConfig.appPath,
        "appium:appPackage": sessionConfig.packageName,
        "appium:autoGrantPermissions": true,
        "appium:newCommandTimeout": 300
      }
    }
  });

  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: sessionConfig.appiumPort,
      path: '/session',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const sessionId = parsed.value?.sessionId || parsed.sessionId;
          if (sessionId) {
            resolve({ sessionId, deviceId: sessionConfig.deviceId, status: 'ACTIVE' });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}
