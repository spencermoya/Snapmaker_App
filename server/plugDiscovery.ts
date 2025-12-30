import { Bonjour } from "bonjour-service";

export interface DiscoveredDevice {
  name: string;
  type: "homekit" | "matter";
  ipAddress: string;
  port: number;
  deviceId: string | null;
  model: string | null;
  manufacturer: string | null;
  category: string | null;
}

const HOMEKIT_CATEGORY_MAP: Record<string, string> = {
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

const MATTER_DEVICE_TYPE_MAP: Record<string, string> = {
  "10": "Door Lock",
  "13": "Outlet",
  "14": "Outlet",
  "15": "Light",
  "256": "Light",
  "257": "Dimmable Light",
  "258": "Color Light",
  "259": "Extended Color Light",
  "266": "Outlet",
  "267": "Outlet",
  "268": "Smart Plug",
  "770": "Temperature Sensor",
  "773": "Pressure Sensor",
  "774": "Flow Sensor",
  "775": "Humidity Sensor",
  "21": "Contact Sensor",
  "263": "Occupancy Sensor",
  "2112": "Thermostat",
  "514": "Window Covering",
  "43": "Fan",
  "44": "Air Purifier",
};

function getIPv4Address(addresses: string[] | undefined): string | null {
  if (!addresses) return null;
  return addresses.find(
    (addr) => addr.includes(".") && !addr.startsWith("169.254")
  ) || null;
}

export async function discoverHomeKitDevices(timeoutMs: number = 5000): Promise<DiscoveredDevice[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const devices: DiscoveredDevice[] = [];
    const seenIps = new Set<string>();

    console.log("[Discovery] Starting HomeKit device scan (_hap._tcp)...");

    try {
      const browser = bonjour.find({ type: "hap" }, (service) => {
        const ipAddress = getIPv4Address(service.addresses);

        if (ipAddress && !seenIps.has(ipAddress)) {
          seenIps.add(ipAddress);
          
          const txt = service.txt || {};
          const name = txt.fn || service.name || "Unknown Device";
          const model = txt.md || null;
          const deviceId = txt.id || null;
          const manufacturer = txt.mf || null;
          const categoryId = txt.ci || null;
          const category = categoryId ? (HOMEKIT_CATEGORY_MAP[categoryId] || `Type ${categoryId}`) : null;

          console.log(`[Discovery] Found HomeKit device: ${name} (${model || 'unknown'}) at ${ipAddress}`);

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
        console.log(`[Discovery] HomeKit scan complete. Found ${devices.length} device(s)`);
        resolve(devices);
      }, timeoutMs);

    } catch (error) {
      bonjour.destroy();
      console.error("[Discovery] HomeKit scan error:", error);
      resolve(devices);
    }
  });
}

export async function discoverMatterDevices(timeoutMs: number = 5000): Promise<DiscoveredDevice[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const devices: DiscoveredDevice[] = [];
    const seenIps = new Set<string>();

    console.log("[Discovery] Starting Matter device scan (_matter._tcp)...");

    try {
      const browser = bonjour.find({ type: "matter", protocol: "tcp" }, (service) => {
        const ipAddress = getIPv4Address(service.addresses);

        if (ipAddress && !seenIps.has(ipAddress)) {
          seenIps.add(ipAddress);
          
          const txt = service.txt || {};
          const name = txt.DN || service.name || "Matter Device";
          const deviceType = txt.DT || null;
          const vendorId = txt.VI || null;
          const productId = txt.PI || null;
          const deviceId = txt.D || null;
          
          const category = deviceType ? (MATTER_DEVICE_TYPE_MAP[deviceType] || `Device ${deviceType}`) : "Matter Device";
          
          let manufacturer: string | null = null;
          if (vendorId) {
            const vendorMap: Record<string, string> = {
              "4874": "Eve",
              "4447": "Nanoleaf",
              "4937": "Philips",
              "5010": "IKEA",
              "4996": "Meross",
              "4417": "TP-Link",
            };
            manufacturer = vendorMap[vendorId] || `Vendor ${vendorId}`;
          }

          console.log(`[Discovery] Found Matter device: ${name} (${category}) at ${ipAddress}`);

          devices.push({
            name,
            type: "matter",
            ipAddress,
            port: service.port || 5540,
            deviceId,
            model: productId ? `Product ${productId}` : null,
            manufacturer,
            category,
          });
        }
      });

      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        console.log(`[Discovery] Matter scan complete. Found ${devices.length} device(s)`);
        resolve(devices);
      }, timeoutMs);

    } catch (error) {
      bonjour.destroy();
      console.error("[Discovery] Matter scan error:", error);
      resolve(devices);
    }
  });
}

export async function discoverMatterCommissionable(timeoutMs: number = 5000): Promise<DiscoveredDevice[]> {
  return new Promise((resolve) => {
    const bonjour = new Bonjour();
    const devices: DiscoveredDevice[] = [];
    const seenIps = new Set<string>();

    console.log("[Discovery] Starting Matter commissionable scan (_matterc._udp)...");

    try {
      const browser = bonjour.find({ type: "matterc", protocol: "udp" }, (service) => {
        const ipAddress = getIPv4Address(service.addresses);

        if (ipAddress && !seenIps.has(ipAddress)) {
          seenIps.add(ipAddress);
          
          const txt = service.txt || {};
          const name = txt.DN || service.name || "Matter Device (Unpaired)";
          const deviceType = txt.DT || null;
          const vendorId = txt.VI || null;
          
          const category = deviceType ? (MATTER_DEVICE_TYPE_MAP[deviceType] || `Device ${deviceType}`) : "Commissionable";
          
          let manufacturer: string | null = null;
          if (vendorId) {
            const vendorMap: Record<string, string> = {
              "4874": "Eve",
              "4447": "Nanoleaf",
              "4937": "Philips",
              "5010": "IKEA",
              "4996": "Meross",
              "4417": "TP-Link",
            };
            manufacturer = vendorMap[vendorId] || `Vendor ${vendorId}`;
          }

          console.log(`[Discovery] Found Matter commissionable: ${name} at ${ipAddress}`);

          devices.push({
            name,
            type: "matter",
            ipAddress,
            port: service.port || 5540,
            deviceId: null,
            model: null,
            manufacturer,
            category,
          });
        }
      });

      setTimeout(() => {
        browser.stop();
        bonjour.destroy();
        console.log(`[Discovery] Matter commissionable scan complete. Found ${devices.length} device(s)`);
        resolve(devices);
      }, timeoutMs);

    } catch (error) {
      bonjour.destroy();
      console.error("[Discovery] Matter commissionable scan error:", error);
      resolve(devices);
    }
  });
}

export async function discoverAllDevices(): Promise<DiscoveredDevice[]> {
  console.log("[Discovery] Starting comprehensive network scan for smart devices...");
  
  try {
    const [homekitDevices, matterDevices, matterCommissionable] = await Promise.all([
      discoverHomeKitDevices(),
      discoverMatterDevices(),
      discoverMatterCommissionable(),
    ]);
    
    const allDevices = [...homekitDevices, ...matterDevices, ...matterCommissionable];
    
    const uniqueDevices = allDevices.reduce((acc, device) => {
      const existing = acc.find(d => d.ipAddress === device.ipAddress);
      if (!existing) {
        acc.push(device);
      } else if (device.type === "matter" && existing.type === "homekit") {
        const index = acc.indexOf(existing);
        acc[index] = { ...device, name: existing.name || device.name };
      }
      return acc;
    }, [] as DiscoveredDevice[]);
    
    console.log(`[Discovery] Total unique devices found: ${uniqueDevices.length}`);
    return uniqueDevices;
  } catch (error) {
    console.error("[Discovery] Scan failed:", error);
    throw error;
  }
}
