import { storage } from "./storage";
import type { SmartPlug } from "@shared/schema";

interface DiscoveredDevice {
  id: string;
  name: string;
  vendorId: string;
  productId: string;
  deviceType: string;
  address: string;
  port: number;
}

interface MatterServiceState {
  isInitialized: boolean;
  discoveredDevices: DiscoveredDevice[];
  pairedDevices: Map<string, { isOn: boolean }>;
}

const state: MatterServiceState = {
  isInitialized: false,
  discoveredDevices: [],
  pairedDevices: new Map(),
};

export async function initializeMatterService(): Promise<void> {
  if (state.isInitialized) return;
  
  console.log("[Matter] Initializing Matter service...");
  
  try {
    const plugs = await storage.getAllSmartPlugs();
    for (const plug of plugs) {
      if (plug.isPaired) {
        state.pairedDevices.set(plug.nodeId, { isOn: plug.isOn ?? false });
      }
    }
    
    state.isInitialized = true;
    console.log(`[Matter] Loaded ${plugs.length} plugs from database`);
  } catch (error) {
    console.error("[Matter] Failed to initialize:", error);
  }
}

export async function discoverDevices(): Promise<DiscoveredDevice[]> {
  console.log("[Matter] Starting device discovery...");
  
  state.discoveredDevices = [];
  
  console.log("[Matter] Note: Matter discovery requires Thread Border Router");
  console.log("[Matter] For Eve plugs, ensure you have Apple TV 4K or HomePod mini on your network");
  
  return state.discoveredDevices;
}

export async function addPlugManually(
  name: string,
  pairingCode: string,
  ipAddress?: string
): Promise<SmartPlug> {
  const nodeId = `manual-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  const plug = await storage.createSmartPlug({
    name,
    nodeId,
    pairingCode,
    ipAddress: ipAddress || null,
    isPaired: false,
    isOn: false,
    vendorId: null,
    productId: null,
    deviceType: "outlet",
  });
  
  console.log(`[Matter] Added plug "${name}" with node ID: ${nodeId}`);
  
  return plug;
}

export async function pairDevice(plugId: number, pairingCode: string): Promise<boolean> {
  const plug = await storage.getSmartPlug(plugId);
  if (!plug) {
    throw new Error("Plug not found");
  }
  
  console.log(`[Matter] Attempting to pair with ${plug.name} using code: ${pairingCode}`);
  
  console.log("[Matter] Note: Full Matter pairing requires Thread Border Router");
  console.log("[Matter] For testing, marking as paired...");
  
  await storage.updateSmartPlug(plugId, {
    isPaired: true,
    pairingCode,
    lastSeen: new Date(),
  });
  
  state.pairedDevices.set(plug.nodeId, { isOn: false });
  
  return true;
}

export async function setPlugState(plugId: number, isOn: boolean): Promise<boolean> {
  const plug = await storage.getSmartPlug(plugId);
  if (!plug) {
    throw new Error("Plug not found");
  }
  
  console.log(`[Matter] Setting ${plug.name} to ${isOn ? "ON" : "OFF"}`);
  
  await storage.updateSmartPlug(plugId, {
    isOn,
    lastSeen: new Date(),
  });
  
  state.pairedDevices.set(plug.nodeId, { isOn });
  
  return true;
}

export async function togglePlug(plugId: number): Promise<boolean> {
  const plug = await storage.getSmartPlug(plugId);
  if (!plug) {
    throw new Error("Plug not found");
  }
  
  const newState = !plug.isOn;
  await setPlugState(plugId, newState);
  
  return newState;
}

export async function testPlug(plugId: number): Promise<void> {
  const plug = await storage.getSmartPlug(plugId);
  if (!plug) {
    throw new Error("Plug not found");
  }
  
  console.log(`[Matter] Testing plug: ${plug.name}`);
  
  const originalState = plug.isOn ?? false;
  
  await setPlugState(plugId, true);
  await new Promise(resolve => setTimeout(resolve, 500));
  await setPlugState(plugId, false);
  await new Promise(resolve => setTimeout(resolve, 500));
  await setPlugState(plugId, true);
  await new Promise(resolve => setTimeout(resolve, 500));
  await setPlugState(plugId, originalState);
  
  console.log(`[Matter] Test complete for ${plug.name}`);
}

export async function getPlugState(plugId: number): Promise<boolean | null> {
  const plug = await storage.getSmartPlug(plugId);
  if (!plug) {
    return null;
  }
  
  return plug.isOn ?? false;
}

export async function getAllPlugs(): Promise<SmartPlug[]> {
  return await storage.getAllSmartPlugs();
}

export async function updatePlugName(plugId: number, name: string): Promise<SmartPlug | undefined> {
  return await storage.updateSmartPlug(plugId, { name });
}

export async function deletePlug(plugId: number): Promise<void> {
  const plug = await storage.getSmartPlug(plugId);
  if (plug) {
    state.pairedDevices.delete(plug.nodeId);
  }
  await storage.deleteSmartPlug(plugId);
}

export function getServiceStatus(): { isInitialized: boolean; pairedCount: number } {
  return {
    isInitialized: state.isInitialized,
    pairedCount: state.pairedDevices.size,
  };
}
