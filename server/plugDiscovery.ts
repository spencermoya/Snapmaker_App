import { Bonjour } from "bonjour-service";

export interface DiscoveredDevice {
  name: string;
  type: "homekit";
  ipAddress: string;
  port: number;
  deviceId: string | null;
  model: string | null;
  manufacturer: string | null;
  category: string | null;
}

export async function discoverHomeKitDevices(timeoutMs: number = 5000): Promise<DiscoveredDevice[]> {
  return new Promise((resolve, reject) => {
    const bonjour = new Bonjour();
    const devices: DiscoveredDevice[] = [];
    const seenIps = new Set<string>();

    console.log("[Discovery] Starting HomeKit device scan...");

    try {
      const browser = bonjour.find({ type: "hap" }, (service) => {
        const ipAddress = service.addresses?.find(
          (addr) => addr.includes(".") && !addr.startsWith("169.254")
        );

        if (ipAddress && !seenIps.has(ipAddress)) {
          seenIps.add(ipAddress);
          
          const txt = service.txt || {};
          const name = txt.fn || service.name || "Unknown Device";
          const model = txt.md || null;
          const deviceId = txt.id || null;
          const manufacturer = txt.mf || null;
          
          const categoryMap: Record<string, string> = {
            "1": "Other",
            "2": "Bridge",
            "3": "Fan",
            "4": "Garage Door",
            "5": "Lightbulb",
            "6": "Door Lock",
            "7": "Outlet",
            "8": "Switch",
            "9": "Thermostat",
            "10": "Sensor",
            "11": "Security System",
            "12": "Door",
            "13": "Window",
            "14": "Window Covering",
            "15": "Programmable Switch",
            "16": "Range Extender",
            "17": "IP Camera",
            "18": "Video Doorbell",
            "19": "Air Purifier",
            "20": "Heater",
            "21": "Air Conditioner",
            "22": "Humidifier",
            "23": "Dehumidifier",
            "28": "Sprinkler",
            "29": "Faucet",
            "30": "Shower",
            "32": "Television",
            "34": "Router",
          };
          const categoryId = txt.ci || null;
          const category = categoryId ? (categoryMap[categoryId] || `Type ${categoryId}`) : null;

          console.log(`[Discovery] Found HomeKit device: ${name} (${model || 'unknown model'}) at ${ipAddress}:${service.port}`);

          devices.push({
            name,
            type: "homekit",
            ipAddress,
            port: service.port || 51827,
            deviceId,
            model,
            manufacturer,
            category,
          });
        }
      });

      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        console.log(`[Discovery] Scan complete. Found ${devices.length} HomeKit device(s)`);
        resolve(devices);
      }, timeoutMs);

    } catch (error) {
      bonjour.destroy();
      console.error("[Discovery] Error during scan:", error);
      reject(error);
    }
  });
}

export async function discoverAllDevices(): Promise<DiscoveredDevice[]> {
  console.log("[Discovery] Starting network scan for smart plugs...");
  
  try {
    const devices = await discoverHomeKitDevices();
    return devices;
  } catch (error) {
    console.error("[Discovery] Scan failed:", error);
    throw error;
  }
}
