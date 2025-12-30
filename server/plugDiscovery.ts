// @ts-ignore - node-dns-sd doesn't have type definitions
import mDnsSd from "node-dns-sd";

export interface DiscoveredDevice {
  name: string;
  type: "meross" | "homekit" | "unknown";
  ipAddress: string;
  port: number | null;
  deviceId: string | null;
  model: string | null;
  raw: Record<string, unknown>;
}

interface MdnsDevice {
  address: string;
  fqdn?: string;
  port?: number;
  service?: {
    port?: number;
    protocol?: string;
  };
  packet?: {
    answers?: Array<{
      type: string;
      name: string;
      rdata?: Record<string, string> | string;
    }>;
  };
}

function parseTxtRecord(answers: Array<{ type: string; rdata?: Record<string, string> | string }> | undefined): Record<string, string> {
  const txt: Record<string, string> = {};
  if (!answers) return txt;
  
  for (const answer of answers) {
    if (answer.type === "TXT" && answer.rdata) {
      if (typeof answer.rdata === "object") {
        Object.assign(txt, answer.rdata);
      }
    }
  }
  return txt;
}

function extractDeviceName(fqdn: string | undefined, txtRecord: Record<string, string>): string {
  if (txtRecord.md) return txtRecord.md;
  if (txtRecord.fn) return txtRecord.fn;
  if (fqdn) {
    const parts = fqdn.split(".");
    if (parts.length > 0) {
      return parts[0].replace(/_/g, " ");
    }
  }
  return "Unknown Device";
}

export async function discoverHomeKitDevices(): Promise<DiscoveredDevice[]> {
  try {
    const devices = await mDnsSd.discover({
      name: "_hap._tcp.local",
      wait: 5,
    }) as MdnsDevice[];

    return devices.map((device) => {
      const txtRecord = parseTxtRecord(device.packet?.answers);
      return {
        name: extractDeviceName(device.fqdn, txtRecord),
        type: "homekit" as const,
        ipAddress: device.address,
        port: device.service?.port || device.port || 51827,
        deviceId: txtRecord.id || null,
        model: txtRecord.md || null,
        raw: { txtRecord, fqdn: device.fqdn },
      };
    });
  } catch (error) {
    console.error("HomeKit discovery error:", error);
    return [];
  }
}

export async function discoverMerossDevices(): Promise<DiscoveredDevice[]> {
  try {
    const devices = await mDnsSd.discover({
      name: "_meross._tcp.local",
      wait: 5,
    }) as MdnsDevice[];

    return devices.map((device) => {
      const txtRecord = parseTxtRecord(device.packet?.answers);
      return {
        name: extractDeviceName(device.fqdn, txtRecord),
        type: "meross" as const,
        ipAddress: device.address,
        port: device.service?.port || device.port || 80,
        deviceId: txtRecord.uuid || null,
        model: txtRecord.model || null,
        raw: { txtRecord, fqdn: device.fqdn },
      };
    });
  } catch (error) {
    console.error("Meross discovery error:", error);
    return [];
  }
}

export async function discoverAllDevices(): Promise<DiscoveredDevice[]> {
  console.log("[Discovery] Starting network scan for smart plugs...");
  
  const results = await Promise.allSettled([
    discoverHomeKitDevices(),
    discoverMerossDevices(),
  ]);

  const homekitResult = results[0];
  const merossResult = results[1];

  const homekitDevices = homekitResult.status === "fulfilled" ? homekitResult.value : [];
  const merossDevices = merossResult.status === "fulfilled" ? merossResult.value : [];

  if (homekitResult.status === "rejected") {
    console.error("[Discovery] HomeKit scan failed:", homekitResult.reason);
  }
  if (merossResult.status === "rejected") {
    console.error("[Discovery] Meross scan failed:", merossResult.reason);
  }

  console.log(`[Discovery] Found ${homekitDevices.length} HomeKit devices, ${merossDevices.length} Meross devices`);

  const allDevices = [...homekitDevices, ...merossDevices];
  
  const uniqueDevices = allDevices.filter((device, index, self) =>
    index === self.findIndex((d) => d.ipAddress === device.ipAddress)
  );

  return uniqueDevices;
}

export async function testMerossConnection(ipAddress: string, deviceKey: string): Promise<boolean> {
  try {
    const { MerossSmartPlug } = await import("meross-local");
    const plug = new MerossSmartPlug(ipAddress, deviceKey);
    await plug.getState();
    return true;
  } catch {
    return false;
  }
}
