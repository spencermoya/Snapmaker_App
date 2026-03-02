import { storage } from "./storage";

let MerossCloud: any = null;
let merossInstance: any = null;
let connectedDevices: Map<string, any> = new Map();
let isConnected = false;
let connectionError: string | null = null;

interface MerossDevice {
  deviceId: string;
  name: string;
  model: string;
  deviceType: string;
  isOn: boolean;
  channels: number[];
}

async function loadMerossCloud() {
  if (!MerossCloud) {
    const mod = await import("meross-cloud");
    MerossCloud = mod.default || mod;
  }
  return MerossCloud;
}

export async function merossLogin(email: string, password: string): Promise<MerossDevice[]> {
  await merossLogout();

  const MC = await loadMerossCloud();
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Meross login timed out after 30 seconds"));
    }, 30000);

    const devices: MerossDevice[] = [];
    let deviceCount = 0;
    let initializedCount = 0;

    merossInstance = new MC({
      email,
      password,
      logger: console.log,
      localHttpFirst: false,
      onlyLocalForGet: false,
      timeout: 10000,
    });

    merossInstance.on("deviceInitialized", (deviceId: string, deviceDef: any, device: any) => {
      deviceCount++;
      console.log(`[MerossService] Device discovered: ${deviceDef.devName} (${deviceId})`);
      
      connectedDevices.set(deviceId, device);

      const dev: MerossDevice = {
        deviceId,
        name: deviceDef.devName || deviceDef.deviceName || "Unknown Device",
        model: deviceDef.deviceType || deviceDef.devType || "Unknown",
        deviceType: deviceDef.deviceType || deviceDef.devType || "Unknown",
        isOn: false,
        channels: deviceDef.channels ? deviceDef.channels.map((_: any, i: number) => i) : [0],
      };

      device.on("connected", () => {
        console.log(`[MerossService] Device connected: ${dev.name}`);
        initializedCount++;

        device.getSystemAllData((err: any, data: any) => {
          if (!err && data) {
            console.log(`[MerossService] Got system data for ${dev.name}`);
          }

          device.getOnOff((err: any, onOff: any) => {
            if (!err && onOff !== undefined) {
              dev.isOn = !!onOff;
            }
            devices.push(dev);
            
            if (initializedCount >= deviceCount) {
              setTimeout(() => {
                clearTimeout(timeout);
                isConnected = true;
                connectionError = null;
                resolve(devices);
              }, 1000);
            }
          });
        });
      });

      device.on("error", (err: any) => {
        console.log(`[MerossService] Device error for ${dev.name}:`, err?.message || err);
      });
    });

    merossInstance.on("connected", () => {
      console.log("[MerossService] Connected to Meross cloud");
      
      setTimeout(() => {
        if (deviceCount === 0) {
          clearTimeout(timeout);
          isConnected = true;
          connectionError = null;
          resolve([]);
        }
      }, 5000);
    });

    merossInstance.on("error", (err: any) => {
      clearTimeout(timeout);
      connectionError = err?.message || "Unknown Meross error";
      console.error("[MerossService] Connection error:", connectionError);
      reject(new Error(connectionError!));
    });

    merossInstance.on("close", (err: any) => {
      console.log("[MerossService] Connection closed:", err?.message || "");
      isConnected = false;
    });

    merossInstance.connect((err: any) => {
      if (err) {
        clearTimeout(timeout);
        connectionError = err?.message || "Failed to connect";
        console.error("[MerossService] Connect callback error:", connectionError);
        reject(new Error(connectionError!));
      }
    });
  });
}

export async function merossToggle(deviceId: string, channel: number, turnOn: boolean): Promise<boolean> {
  const device = connectedDevices.get(deviceId);
  if (!device) {
    throw new Error(`Device ${deviceId} not found or not connected`);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Toggle operation timed out after 10 seconds"));
    }, 10000);

    device.controlToggleX(channel, turnOn, (err: any, res: any) => {
      clearTimeout(timeout);
      if (err) {
        console.error(`[MerossService] Toggle failed for ${deviceId}:`, err);
        reject(new Error(err?.message || "Toggle failed"));
      } else {
        console.log(`[MerossService] Toggled ${deviceId} channel ${channel} to ${turnOn ? "ON" : "OFF"}`);
        resolve(true);
      }
    });
  });
}

export async function merossGetStatus(deviceId: string): Promise<{ isOn: boolean }> {
  const device = connectedDevices.get(deviceId);
  if (!device) {
    throw new Error(`Device ${deviceId} not found or not connected`);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Status check timed out after 10 seconds"));
    }, 10000);

    device.getOnOff((err: any, onOff: any) => {
      clearTimeout(timeout);
      if (err) {
        reject(new Error(err?.message || "Status check failed"));
      } else {
        resolve({ isOn: !!onOff });
      }
    });
  });
}

export async function merossLogout(): Promise<void> {
  if (merossInstance) {
    try {
      merossInstance.disconnectAll(true);
    } catch (err) {
      console.log("[MerossService] Error during disconnect:", err);
    }
    merossInstance = null;
  }
  connectedDevices.clear();
  isConnected = false;
  connectionError = null;
}

export function isMerossConnected(): boolean {
  return isConnected;
}

export function getMerossError(): string | null {
  return connectionError;
}

export function getConnectedDeviceIds(): string[] {
  return Array.from(connectedDevices.keys());
}

export async function autoConnectMeross(): Promise<void> {
  const email = await storage.getSetting("meross_email");
  const password = await storage.getSetting("meross_password");
  
  if (email && password) {
    console.log("[MerossService] Auto-connecting with saved credentials...");
    try {
      const devices = await merossLogin(email, password);
      console.log(`[MerossService] Auto-connected, found ${devices.length} devices`);
      
      for (const dev of devices) {
        const existing = await storage.getSmartPlugByDeviceId(dev.deviceId);
        if (existing) {
          await storage.updateSmartPlug(existing.id, {
            isOn: dev.isOn,
            lastSeen: new Date(),
          });
        } else {
          await storage.createSmartPlug({
            name: dev.name,
            deviceId: dev.deviceId,
            model: dev.model,
            deviceType: dev.deviceType,
            channel: 0,
            isOn: dev.isOn,
          });
        }
      }
    } catch (err) {
      console.error("[MerossService] Auto-connect failed:", err instanceof Error ? err.message : err);
    }
  }
}
