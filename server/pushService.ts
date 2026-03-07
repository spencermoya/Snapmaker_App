import webpush from "web-push";
import { storage } from "./storage";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || "mailto:admin@snapmaker.local";

let isConfigured = false;

export function initPushService(): boolean {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.log("[PushService] VAPID keys not configured - push notifications disabled");
    return false;
  }
  
  try {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    isConfigured = true;
    console.log("[PushService] Initialized with VAPID keys");
    return true;
  } catch (error) {
    console.error("[PushService] Failed to initialize:", error);
    return false;
  }
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY || null;
}

export function isPushEnabled(): boolean {
  return isConfigured;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export async function sendPushNotification(payload: NotificationPayload): Promise<{ success: number; failed: number }> {
  if (!isConfigured) {
    console.log("[PushService] Not configured, skipping notification");
    return { success: 0, failed: 0 };
  }

  const subscriptions = await storage.getAllPushSubscriptions();
  
  if (subscriptions.length === 0) {
    console.log("[PushService] No subscriptions, skipping notification");
    return { success: 0, failed: 0 };
  }

  console.log(`[PushService] Sending notification to ${subscriptions.length} subscriber(s): ${payload.title}`);

  let success = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        JSON.stringify(payload)
      );
      success++;
    } catch (error: any) {
      failed++;
      console.error(`[PushService] Failed to send to ${sub.endpoint.substring(0, 50)}...:`, error.message);
      console.error(`[PushService] Error details - statusCode: ${error.statusCode}, body: ${error.body}`);
      
      if (error.statusCode === 401 || error.statusCode === 403) {
        console.error("[PushService] VAPID authentication failed - keys may be mismatched");
        console.error("[PushService] Try: 1) Regenerate VAPID keys, 2) Rebuild app, 3) Clear subscriptions, 4) Re-subscribe");
      }
      
      if (error.statusCode === 404 || error.statusCode === 410) {
        console.log("[PushService] Subscription expired, removing");
        await storage.deletePushSubscription(sub.endpoint);
      }
    }
  }

  console.log(`[PushService] Notification sent: ${success} success, ${failed} failed`);
  return { success, failed };
}

export async function notifyPrintStarted(filename: string): Promise<void> {
  await sendPushNotification({
    title: "Print Started",
    body: `${filename} is now printing`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "print-started",
    data: { type: "print-started", filename },
  });
}

export async function notifyPrintComplete(filename: string): Promise<void> {
  await sendPushNotification({
    title: "Print Complete!",
    body: `${filename} has finished printing`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "print-complete",
    data: { type: "print-complete", filename },
  });
}

export async function notifyPrintError(filename: string, error?: string): Promise<void> {
  await sendPushNotification({
    title: "Print Error",
    body: error ? `${filename}: ${error}` : `Problem with ${filename}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "print-error",
    data: { type: "print-error", filename, error },
  });
}

export async function notifyPrinterDisconnected(printerName: string): Promise<void> {
  await sendPushNotification({
    title: "Printer Disconnected",
    body: `${printerName} lost connection`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "printer-disconnected",
    data: { type: "printer-disconnected", printerName },
  });
}

export async function notifyPrinterOnline(printerName: string): Promise<void> {
  await sendPushNotification({
    title: "Printer Online",
    body: `${printerName} is now connected`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "printer-online",
    data: { type: "printer-online", printerName },
  });
}
