import crypto from "crypto";
import mqtt from "mqtt";
import { storage } from "./storage";

const SECRET = "23x17ahWarFH6w29";
const DEFAULT_DOMAIN = "iotx-us.meross.com";
const MQTT_FALLBACK_DOMAINS = ["iotx-us.meross.com", "mqtt-us.meross.com"];

let httpDomain = DEFAULT_DOMAIN;
let token = "";
let key = "";
let userId = "";
let appId = "";
let isConnected = false;
let connectionError: string | null = null;
let discoveredDevices: MerossDeviceInfo[] = [];
let mqttClient: mqtt.MqttClient | null = null;
let mqttDomainFromLogin: string | null = null;
const pendingMessages = new Map<string, { resolve: (data: any) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();

interface MerossDeviceInfo {
  deviceId: string;
  name: string;
  model: string;
  deviceType: string;
  isOn: boolean;
  channels: number[];
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

function getMqttDomainsToTry(): string[] {
  const domains: string[] = [];
  if (mqttDomainFromLogin) {
    domains.push(mqttDomainFromLogin);
  }
  if (httpDomain && !domains.includes(httpDomain)) {
    domains.push(httpDomain);
  }
  for (const fallback of MQTT_FALLBACK_DOMAINS) {
    if (!domains.includes(fallback)) {
      domains.push(fallback);
    }
  }
  return domains;
}

function disposeMqttClient(): void {
  if (mqttClient) {
    try {
      mqttClient.removeAllListeners();
      mqttClient.end(true);
    } catch {}
    mqttClient = null;
  }
}

function connectMqttToSingleDomain(domain: string): Promise<void> {
  return new Promise((resolve, reject) => {
    disposeMqttClient();

    appId = crypto.createHash("md5").update(`API${generateRandomString(16)}`).digest("hex");
    const clientId = `app:${appId}`;
    const hashedPassword = crypto.createHash("md5").update(userId + key).digest("hex");

    const brokerUrl = `mqtts://${domain}:2001`;
    console.log(`[MerossService] Connecting MQTT to ${brokerUrl} as ${clientId}...`);

    const client = mqtt.connect(brokerUrl, {
      clientId,
      username: userId,
      password: hashedPassword,
      rejectUnauthorized: true,
      keepalive: 30,
      reconnectPeriod: 0,
      connectTimeout: 10000,
      protocolVersion: 4,
    });

    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        client.removeAllListeners();
        client.end(true);
        reject(new Error(`MQTT connack timeout to ${domain}`));
      }
    }, 10000);

    client.on("connect", () => {
      if (settled) return;
      clearTimeout(timeout);

      const userTopic = `/app/${userId}-${appId}/subscribe`;
      client.subscribe(userTopic, (err) => {
        if (settled) return;
        settled = true;
        if (err) {
          console.log(`[MerossService] MQTT subscribe error on ${domain}: ${err.message}`);
          client.removeAllListeners();
          client.end(true);
          reject(err);
        } else {
          mqttClient = client;
          console.log(`[MerossService] MQTT connected to ${domain} and subscribed to ${userTopic}`);
          resolve();
        }
      });
    });

    client.on("message", (topic: string, message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        const messageId = data?.header?.messageId;
        const namespace = data?.header?.namespace;
        const method = data?.header?.method;
        console.log(`[MerossService] MQTT recv on ${topic}: id=${messageId}, ns=${namespace}, method=${method}`);
        if (messageId && pendingMessages.has(messageId)) {
          const pending = pendingMessages.get(messageId)!;
          clearTimeout(pending.timer);
          pendingMessages.delete(messageId);
          pending.resolve(data);
        } else {
          console.log(`[MerossService] MQTT message unmatched (id=${messageId})`);
        }
      } catch (err) {
        console.log(`[MerossService] MQTT message parse error: ${err}`);
      }
    });

    client.on("error", (err: Error) => {
      console.log(`[MerossService] MQTT error on ${domain}: ${err.message}`);
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        client.removeAllListeners();
        client.end(true);
        reject(err);
      }
    });

    client.on("close", () => {
      console.log(`[MerossService] MQTT connection to ${domain} closed`);
      if (mqttClient === client) {
        mqttClient = null;
      }
    });

    client.on("offline", () => {
      console.log("[MerossService] MQTT offline");
    });
  });
}

async function connectMqtt(): Promise<void> {
  if (mqttClient?.connected) {
    return;
  }

  const domains = getMqttDomainsToTry();
  const errors: string[] = [];

  for (const domain of domains) {
    try {
      await connectMqttToSingleDomain(domain);
      console.log(`[MerossService] MQTT successfully connected via ${domain}`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${domain}: ${msg}`);
      console.log(`[MerossService] MQTT failed on ${domain}: ${msg}, trying next...`);
    }
  }

  throw new Error(`Cannot connect to Meross cloud MQTT (tried: ${errors.join("; ")})`);
}

function sendMqttCommand(deviceId: string, method: string, namespace: string, payload: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!mqttClient || !mqttClient.connected) {
      reject(new Error("MQTT not connected. Try reconnecting to Meross."));
      return;
    }

    const messageId = crypto.createHash("md5").update(generateRandomString(16)).digest("hex");
    const timestamp = Math.round(Date.now() / 1000);
    const signature = crypto.createHash("md5").update(messageId + key + timestamp).digest("hex");

    const data = {
      header: {
        from: `/app/${userId}-${appId}/subscribe`,
        messageId,
        method,
        namespace,
        payloadVersion: 1,
        sign: signature,
        timestamp,
        triggerSrc: "iOSLocal",
        uuid: deviceId,
      },
      payload,
    };

    const topic = `/appliance/${deviceId}/subscribe`;
    const timeoutMs = 10000;

    console.log(`[MerossService] MQTT publishing to ${topic}: messageId=${messageId}, namespace=${namespace}, method=${method}`);

    const timer = setTimeout(() => {
      pendingMessages.delete(messageId);
      console.log(`[MerossService] MQTT timeout waiting for response: messageId=${messageId}`);
      reject(new Error(`Device did not respond within ${timeoutMs / 1000}s. It may be offline or unreachable.`));
    }, timeoutMs);

    pendingMessages.set(messageId, { resolve, reject, timer });

    mqttClient.publish(topic, JSON.stringify(data), { qos: 1 }, (err) => {
      if (err) {
        clearTimeout(timer);
        pendingMessages.delete(messageId);
        reject(new Error(`Failed to send MQTT command: ${err.message}`));
      }
    });
  });
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
  const responseMqttDomain = loginResponse.mqttDomain || loginResponse.domain || loginResponse.mqtt_domain;
  if (responseMqttDomain) {
    const cleanDomain = String(responseMqttDomain).replace(/^https?:\/\//, "").replace(/\/+$/, "");
    mqttDomainFromLogin = cleanDomain;
    console.log(`[MerossService] Login response includes MQTT domain: ${mqttDomainFromLogin}`);
  }
  console.log(`[MerossService] Login successful (domain: ${httpDomain}, userId: ${userId}), connecting MQTT...`)
  console.log(`[MerossService] MQTT domains to try: ${getMqttDomainsToTry().join(", ")}`);

  try {
    await connectMqtt();
  } catch (err) {
    console.log(`[MerossService] MQTT connection failed: ${err instanceof Error ? err.message : err}, will retry on demand`);
  }

  const deviceList = await cloudRequest("/v1/Device/devList", {});
  const devices: MerossDeviceInfo[] = [];

  if (Array.isArray(deviceList)) {
    for (const dev of deviceList) {
      const device: MerossDeviceInfo = {
        deviceId: dev.uuid,
        name: dev.devName || dev.deviceName || "Unknown Device",
        model: dev.deviceType || dev.devType || "Unknown",
        deviceType: dev.deviceType || dev.devType || "Unknown",
        isOn: false,
        channels: dev.channels ? dev.channels.map((_: any, i: number) => i) : [0],
        usesToggleX: true,
      };

      if (mqttClient?.connected) {
        try {
          const allData = await sendMqttCommand(dev.uuid, "GET", "Appliance.System.All", {});
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
          console.log(`[MerossService] Could not get status for ${device.name}: ${err instanceof Error ? err.message : err}`);
        }
      }

      devices.push(device);
      console.log(`[MerossService] Device discovered: ${device.name} (${device.deviceId}) model: ${device.model}`);
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

  if (!key) {
    throw new Error(`Meross cloud login required before controlling devices. Check your Meross credentials in Settings.`);
  }

  if (!mqttClient?.connected) {
    console.log("[MerossService] MQTT not connected, reconnecting...");
    try {
      await connectMqtt();
    } catch (err) {
      throw new Error(`Cannot connect to Meross cloud MQTT: ${err instanceof Error ? err.message : err}`);
    }
  }

  try {
    if (device.usesToggleX) {
      const payload = { togglex: { channel, onoff: turnOn ? 1 : 0 } };
      await sendMqttCommand(deviceId, "SET", "Appliance.Control.ToggleX", payload);
    } else {
      const payload = { toggle: { onoff: turnOn ? 1 : 0 } };
      await sendMqttCommand(deviceId, "SET", "Appliance.Control.Toggle", payload);
    }
    device.isOn = turnOn;
    console.log(`[MerossService] Toggled ${device.name} channel ${channel} to ${turnOn ? "ON" : "OFF"}`);
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

  if (mqttClient?.connected) {
    try {
      const allData = await sendMqttCommand(deviceId, "GET", "Appliance.System.All", {});
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
  disposeMqttClient();
  mqttDomainFromLogin = null;

  for (const [, pending] of pendingMessages) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Logging out"));
  }
  pendingMessages.clear();

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
  appId = "";
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
