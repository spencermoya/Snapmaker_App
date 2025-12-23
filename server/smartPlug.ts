import { MerossSmartPlug } from "meross-local";
import { storage } from "./storage";

interface PlugSettings {
  ipAddress: string | null;
  deviceKey: string | null;
  enabled: boolean;
}

export async function getPlugSettings(): Promise<PlugSettings> {
  const [ipAddress, deviceKey, enabled] = await Promise.all([
    storage.getSetting("plugIpAddress"),
    storage.getSetting("plugDeviceKey"),
    storage.getSetting("plugEnabled"),
  ]);
  
  return {
    ipAddress,
    deviceKey,
    enabled: enabled === "true",
  };
}

export async function savePlugSettings(settings: Partial<PlugSettings>): Promise<void> {
  const promises: Promise<void>[] = [];
  
  if (settings.ipAddress !== undefined) {
    promises.push(storage.setSetting("plugIpAddress", settings.ipAddress));
  }
  if (settings.deviceKey !== undefined) {
    promises.push(storage.setSetting("plugDeviceKey", settings.deviceKey));
  }
  if (settings.enabled !== undefined) {
    promises.push(storage.setSetting("plugEnabled", settings.enabled ? "true" : "false"));
  }
  
  await Promise.all(promises);
}

export async function getPlugStatus(): Promise<{ isOn: boolean; reachable: boolean }> {
  const settings = await getPlugSettings();
  
  if (!settings.enabled || !settings.ipAddress || !settings.deviceKey) {
    return { isOn: false, reachable: false };
  }
  
  try {
    const plug = new MerossSmartPlug(settings.ipAddress, settings.deviceKey);
    const isOn = await plug.getPower();
    return { isOn, reachable: true };
  } catch (error) {
    console.error("Failed to get plug status:", error);
    return { isOn: false, reachable: false };
  }
}

export async function setPlugPower(turnOn: boolean): Promise<{ success: boolean; isOn: boolean; error?: string }> {
  const settings = await getPlugSettings();
  
  if (!settings.enabled) {
    return { success: false, isOn: false, error: "Smart plug is not enabled" };
  }
  
  if (!settings.ipAddress || !settings.deviceKey) {
    return { success: false, isOn: false, error: "Smart plug not configured" };
  }
  
  try {
    const plug = new MerossSmartPlug(settings.ipAddress, settings.deviceKey);
    
    if (turnOn) {
      await plug.turnOn();
    } else {
      await plug.turnOff();
    }
    
    const isOn = await plug.getPower();
    return { success: true, isOn };
  } catch (error) {
    console.error("Failed to control plug:", error);
    return { 
      success: false, 
      isOn: false, 
      error: error instanceof Error ? error.message : "Failed to control plug" 
    };
  }
}

export async function testPlugConnection(ipAddress: string, deviceKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const plug = new MerossSmartPlug(ipAddress, deviceKey);
    await plug.getState();
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to connect to plug" 
    };
  }
}
