import { Bonjour } from "bonjour-service";

export interface DiscoveredDevice {
  name: string;
  type: "homekit";
  ipAddress: string;
  port: number;
  deviceId: string | null;
  model: string | null;
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
          const name = service.name || txt.md || txt.fn || "Unknown HomeKit Device";
          const model = txt.md || null;
          const deviceId = txt.id || null;

          console.log(`[Discovery] Found HomeKit device: ${name} at ${ipAddress}:${service.port}`);

          devices.push({
            name,
            type: "homekit",
            ipAddress,
            port: service.port || 51827,
            deviceId,
            model,
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
