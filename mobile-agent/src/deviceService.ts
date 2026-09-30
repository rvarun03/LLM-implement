import { AgentConfig } from './config';
import { getConnectedDevices, checkAdbAvailable, AdbDevice } from './adbService';
import { listAvds, AvdInfo } from './emulatorService';

export interface ComprehensiveDeviceStatus {
  adbAvailable: boolean;
  adbVersion?: string;
  connectedDevices: AdbDevice[];
  availableAvds: AvdInfo[];
  error?: string;
}

export async function getFullDeviceStatus(config: AgentConfig): Promise<ComprehensiveDeviceStatus> {
  const adbCheck = await checkAdbAvailable(config);
  if (!adbCheck.available) {
    return {
      adbAvailable: false,
      connectedDevices: [],
      availableAvds: [],
      error: adbCheck.error
    };
  }

  const { devices } = await getConnectedDevices(config);
  const avds = await listAvds(config);

  return {
    adbAvailable: true,
    adbVersion: adbCheck.version,
    connectedDevices: devices,
    availableAvds: avds
  };
}
