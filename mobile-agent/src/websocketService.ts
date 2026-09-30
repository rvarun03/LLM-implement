import http from 'http';
import https from 'https';
import { AgentConfig } from './config';

export async function sendHeartbeatToBackend(config: AgentConfig, statusData: any): Promise<boolean> {
  const url = new URL(`${config.serverUrl}/api/mobile/agent/heartbeat`);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  const payload = JSON.stringify({
    agentId: config.agentId,
    userEmail: config.userEmail,
    timestamp: new Date().toISOString(),
    ...statusData
  });

  return new Promise((resolve) => {
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 5000
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

export async function registerWithBackend(config: AgentConfig, agentCapabilities: any): Promise<boolean> {
  const url = new URL(`${config.serverUrl}/api/mobile/agent/register`);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  const payload = JSON.stringify({
    agentId: config.agentId,
    userEmail: config.userEmail,
    hostname: config.agentId,
    platform: process.platform,
    androidSdk: config.androidHome,
    capabilities: agentCapabilities
  });

  return new Promise((resolve) => {
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 5000
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}
