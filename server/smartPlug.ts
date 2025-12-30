import { storage } from "./storage";

interface SmartPlugControl {
  plugId: number;
  turnOn: boolean;
}

export async function controlSmartPlug(control: SmartPlugControl): Promise<{ success: boolean; isOn: boolean; error?: string }> {
  const plug = await storage.getSmartPlug(control.plugId);
  
  if (!plug) {
    return { success: false, isOn: false, error: "Smart plug not found" };
  }
  
  if (!plug.isEnabled) {
    return { success: false, isOn: false, error: "Smart plug is disabled" };
  }

  try {
    if (plug.type === "homekit") {
      const result = await controlHomeKitPlug(plug.ipAddress, plug.port || 80, control.turnOn);
      return result;
    }
    
    return { success: false, isOn: false, error: `Unsupported plug type: ${plug.type}` };
  } catch (error) {
    console.error("Failed to control smart plug:", error);
    return { 
      success: false, 
      isOn: false, 
      error: error instanceof Error ? error.message : "Failed to control plug" 
    };
  }
}

export async function getSmartPlugStatus(plugId: number): Promise<{ isOn: boolean; reachable: boolean }> {
  const plug = await storage.getSmartPlug(plugId);
  
  if (!plug || !plug.isEnabled) {
    return { isOn: false, reachable: false };
  }

  try {
    if (plug.type === "homekit") {
      const status = await getHomeKitPlugStatus(plug.ipAddress, plug.port || 80);
      return status;
    }
    
    return { isOn: false, reachable: false };
  } catch (error) {
    console.error("Failed to get plug status:", error);
    return { isOn: false, reachable: false };
  }
}

async function controlHomeKitPlug(ipAddress: string, port: number, turnOn: boolean): Promise<{ success: boolean; isOn: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`http://${ipAddress}:${port}/characteristics`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        characteristics: [{
          aid: 1,
          iid: 10,
          value: turnOn
        }]
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      return { success: true, isOn: turnOn };
    }
    
    return { success: false, isOn: false, error: `HTTP ${response.status}` };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { success: false, isOn: false, error: "Connection timeout" };
    }
    return { success: false, isOn: false, error: "HomeKit control requires pairing - use Home app" };
  }
}

async function getHomeKitPlugStatus(ipAddress: string, port: number): Promise<{ isOn: boolean; reachable: boolean }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`http://${ipAddress}:${port}/accessories`, {
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      return { isOn: false, reachable: true };
    }
    
    return { isOn: false, reachable: false };
  } catch {
    return { isOn: false, reachable: false };
  }
}
