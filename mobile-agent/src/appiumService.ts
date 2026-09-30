import http from 'http';
import { runCommand } from './adbService';

export async function checkAppiumStatus(port: number = 4723): Promise<{ running: boolean; version?: string; statusText?: string }> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/status`, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            running: true,
            version: parsed.value?.build?.version || '2.5.1',
            statusText: 'Appium server active & responding on port ' + port
          });
        } catch (e) {
          resolve({ running: true, statusText: 'Appium responding on port ' + port });
        }
      });
    });

    req.on('error', () => {
      resolve({ running: false, statusText: 'Appium not responding on port ' + port });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ running: false, statusText: 'Appium status request timed out' });
    });
  });
}

export async function checkUiAutomator2Driver(): Promise<{ installed: boolean; version?: string }> {
  const res = await runCommand('appium driver list --installed');
  if (res.success && res.stdout.includes('uiautomator2')) {
    return { installed: true, version: 'UiAutomator2 Installed' };
  }
  return { installed: false };
}
