import crypto from "crypto";
import { storage } from "./storage";

const SECRET = "23x17ahWarFH6w29";
const DEFAULT_DOMAIN = "iotx.meross.com";

let httpDomain = DEFAULT_DOMAIN;
let token = "";
let key = "";
let userId = "";
let isConnected = false;
let connectionError: string | null = null;
let discoveredDevices: MerossDeviceInfo[] = [];

interface MerossDeviceInfo {
  deviceId: string;
  name: string;
  model: string;
  deviceType: string;
  isOn: boolean;
  channels: number[];
  localIp: string | null;
  usesToggleX: boolean;
}

interface CloudResponse {
  apiStatus: number;
  data: any;
  info?: string;
}

function generateRandomString(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  while (result.length < length) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function encodeParams(params: any): string {
  return Buffer.from(JSON.stringify(params)).toString("base64");
}

async function cloudRequest(endpoint: string, paramsData: any): Promise<any> {
  const nonce = generateRandomString(16);
  const timestampMillis = Date.now();
  const loginParams = encodeParams(paramsData);

  const dataToSign = SECRET + timestampMillis + nonce + loginParams;
  const sign = crypto.createHash("md5").update(dataToSign).digest("hex");

  const headers: Record<string, string> = {
    "Authorization": `Basic ${token || ""}`,
    "Vendor": "meross",
    "AppVersion": "3.22.4",
    "AppType": "iOS",
    "AppLanguage": "en",
    "User-Agent": "intellect_socket/3.22.4 (iPhone; iOS 17.2; Scale/2.00)",
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const body = new URLSearchParams({
    params: loginParams,
    sign,
    timestamp: String(timestampMillis),
    nonce,
  });

  const url = `https://${httpDomain}${endpoint}`;
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from Meross API`);
  }

  const result: CloudResponse = await resp.json();

  if (result.apiStatus === 1030 && result.data?.domain) {
    httpDomain = result.data.domain.replace(/^https?:\/\//, "");
    return cloudRequest(endpoint, paramsData);
  }

  if (result.apiStatus !== 0) {
    const errorMessages: Record<number, string> = {
      1001: "Wrong or missing password",
      1002: "Account does not exist",
      1003: "Token expired or invalid",
      1004: "Wrong token",
      1005: "No device with that UUID",
      1006: "Token has expired",
      1019: "Token expired",
      1022: "MFA code required",
      1030: "Wrong region",
      1200: "Too many logins",
      1301: "Too many requests",
      5000: "Server error",
    };
    const msg = errorMessages[result.apiStatus] || `API error ${result.apiStatus}`;
    throw new Error(`${msg}${result.info ? ` - ${result.info}` : ""}`);
  }

  return result.data;
}

async function sendLocalCommand(deviceIp: string, method: string, namespace: string, payload: any): Promise<any> {
  const messageId = crypto.createHash("md5").update(generateRandomString(16)).digest("hex");
  const timestamp = Math.round(Date.now() / 1000);
  const signature = crypto.createHash("md5").update(messageId + key + timestamp).digest("hex");

  const data = {
    header: {
      from: "",
      messageId,
      method,
      namespace,
      payloadVersion: 1,
      sign: signature,
      timestamp,
    },
    payload,
  };

  const resp = await fetch(`http://${deviceIp}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    throw new Error(`Local device HTTP error: ${resp.status}`);
  }

  return resp.json();
}

export async function merossLogin(email: string, password: string): Promise<MerossDeviceInfo[]> {
  await merossLogout();

  httpDomain = DEFAULT_DOMAIN;

  const passwordHash = crypto.createHash("md5").update(password).digest("hex");
  const logIdentifier = generateRandomString(30) + crypto.randomUUID();

  const loginData = {
    email,
    password: passwordHash,
    encryption: 1,
    accountCountryCode: "--",
    mobileInfo: {
      resolution: "--",
      carrier: "--",
      deviceModel: "--",
      mobileOs: "linux",
      mobileOSVersion: "--",
      uuid: logIdentifier,
    },
    agree: 1,
  };

  console.log("[MerossService] Logging in to Meross cloud...");
  let loginResponse;
  try {
    loginResponse = await cloudRequest("/v1/Auth/signIn", loginData);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Login failed";
    connectionError = errMsg;
    throw err;
  }

  if (!loginResponse || !loginResponse.token) {
    connectionError = "No valid login response received";
    throw new Error(connectionError);
  }

  token = loginResponse.token;
  key = loginResponse.key;
  userId = String(loginResponse.userid);
  console.log(`[MerossService] Login successful (domain: ${httpDomain}), fetching device list...`);

  const deviceList = await cloudRequest("/v1/Device/devList", {});
  const devices: MerossDeviceInfo[] = [];

  console.log(`[MerossService] Device list type: ${typeof deviceList}, isArray: ${Array.isArray(deviceList)}, length: ${Array.isArray(deviceList) ? deviceList.length : 'N/A'}`);
  console.log(`[MerossService] Device list raw: ${JSON.stringify(deviceList)?.substring(0, 1000)}`);

  if (Array.isArray(deviceList)) {
    for (const dev of deviceList) {
      const existingPlug = await storage.getSmartPlugByDeviceId(dev.uuid);
      const deviceIp = existingPlug?.localIp || null;

      const device: MerossDeviceInfo = {
        deviceId: dev.uuid,
        name: dev.devName || dev.deviceName || "Unknown Device",
        model: dev.deviceType || dev.devType || "Unknown",
        deviceType: dev.deviceType || dev.devType || "Unknown",
        isOn: false,
        channels: dev.channels ? dev.channels.map((_: any, i: number) => i) : [0],
        localIp: deviceIp,
        usesToggleX: true,
      };

      if (deviceIp) {
        try {
          const allData = await sendLocalCommand(deviceIp, "GET", "Appliance.System.All", {});
          if (allData?.payload?.all?.digest?.togglex) {
            const togglex = allData.payload.all.digest.togglex;
            const ch0 = togglex.find((t: any) => t.channel === 0);
            device.isOn = ch0 ? !!ch0.onoff : false;
            device.usesToggleX = true;
          } else if (allData?.payload?.all?.digest?.toggle) {
            device.isOn = !!allData.payload.all.digest.toggle.onoff;
            device.usesToggleX = false;
          }
        } catch (err) {
          console.log(`[MerossService] Could not get local status for ${device.name}: ${err instanceof Error ? err.message : err}`);
        }
      }

      devices.push(device);
      console.log(`[MerossService] Device discovered: ${device.name} (${device.deviceId}) IP: ${deviceIp || "not configured"}`);
    }
  }

  discoveredDevices = devices;
  isConnected = true;
  connectionError = null;
  console.log(`[MerossService] Connected with ${devices.length} device(s)`);
  return devices;
}

export async function merossToggle(deviceId: string, channel: number, turnOn: boolean): Promise<boolean> {
  const device = discoveredDevices.find(d => d.deviceId === deviceId);
  if (!device) {
    throw new Error(`Device ${deviceId} not found`);
  }

  if (!device.localIp) {
    throw new Error(`No local IP configured for "${device.name}". Go to Settings and enter the device's IP address.`);
  }

  try {
    if (device.usesToggleX) {
      const payload = { togglex: { channel, onoff: turnOn ? 1 : 0 } };
      await sendLocalCommand(device.localIp, "SET", "Appliance.Control.ToggleX", payload);
    } else {
      const payload = { toggle: { onoff: turnOn ? 1 : 0 } };
      await sendLocalCommand(device.localIp, "SET", "Appliance.Control.Toggle", payload);
    }
    device.isOn = turnOn;
    console.log(`[MerossService] Toggled ${device.name} channel ${channel} to ${turnOn ? "ON" : "OFF"} (local)`);
    return true;
  } catch (err) {
    const errMsg = `Toggle failed for ${device.name}: ${err instanceof Error ? err.message : err}`;
    connectionError = errMsg;
    console.log(`[MerossService] ${errMsg}`);
    throw new Error(errMsg);
  }
}

export async function merossGetStatus(deviceId: string): Promise<{ isOn: boolean }> {
  const device = discoveredDevices.find(d => d.deviceId === deviceId);
  if (!device) {
    throw new Error(`Device ${deviceId} not found`);
  }

  if (device.localIp) {
    try {
      const allData = await sendLocalCommand(device.localIp, "GET", "Appliance.System.All", {});
      if (allData?.payload?.all?.digest?.togglex) {
        const togglex = allData.payload.all.digest.togglex;
        const ch0 = togglex.find((t: any) => t.channel === 0);
        device.isOn = ch0 ? !!ch0.onoff : false;
      } else if (allData?.payload?.all?.digest?.toggle) {
        device.isOn = !!allData.payload.all.digest.toggle.onoff;
      }
      return { isOn: device.isOn };
    } catch (err) {
      console.log(`[MerossService] Could not get status for ${device.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { isOn: device.isOn };
}

export async function merossLogout(): Promise<void> {
  if (token) {
    try {
      await cloudRequest("/v1/Profile/logout", {});
    } catch (err) {
      console.log("[MerossService] Logout request error:", err instanceof Error ? err.message : err);
    }
  }
  token = "";
  key = "";
  userId = "";
  discoveredDevices = [];
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
  return discoveredDevices.map(d => d.deviceId);
}

export function updateDeviceLocalIp(deviceId: string, localIp: string | null): void {
  const device = discoveredDevices.find(d => d.deviceId === deviceId);
  if (device) {
    device.localIp = localIp;
    console.log(`[MerossService] Updated local IP for ${device.name}: ${localIp || "cleared"}`);
  }
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
