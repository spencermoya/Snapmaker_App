import webpush from "web-push";
import { storage } from "./storage";

let vapidConfigured = false;

export async function initializeWebPush(): Promise<{ publicKey: string } | null> {
  try {
    let publicKey = await storage.getSetting("vapid_public_key");
    let privateKey = await storage.getSetting("vapid_private_key");

    if (!publicKey || !privateKey) {
      console.log("[WebPush] Generating new VAPID keys...");
      const vapidKeys = webpush.generateVAPIDKeys();
      publicKey = vapidKeys.publicKey;
      privateKey = vapidKeys.privateKey;
      
      await storage.setSetting("vapid_public_key", publicKey);
      await storage.setSetting("vapid_private_key", privateKey);
      console.log("[WebPush] VAPID keys generated and saved");
    }

    webpush.setVapidDetails(
      "mailto:admin@snapmaker-control.local",
      publicKey,
      privateKey
    );

    vapidConfigured = true;
    console.log("[WebPush] Initialized successfully");
    return { publicKey };
  } catch (error) {
    console.error("[WebPush] Failed to initialize:", error);
    return null;
  }
}

export async function getVapidPublicKey(): Promise<string | null> {
  return await storage.getSetting("vapid_public_key");
}

export interface PushNotificationPayload {
  type: "print_started" | "print_completed" | "print_stopped";
  printerId: number;
  filename: string | null;
  timestamp: string;
  durationMinutes?: number;
}

export async function sendPushNotification(
  printerId: number,
  payload: PushNotificationPayload
): Promise<void> {
  if (!vapidConfigured) {
    console.warn("[WebPush] Not configured yet, skipping push notification. This may indicate initialization order issue.");
    return;
  }

  try {
    const subscriptions = await storage.getPushSubscriptions(printerId);
    
    if (subscriptions.length === 0) {
      console.log(`[WebPush] No subscriptions for printer ${printerId}`);
      return;
    }

    console.log(`[WebPush] Sending ${payload.type} to ${subscriptions.length} subscribers`);

    const sendPromises = subscriptions.map(async (sub) => {
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
      } catch (error: any) {
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`[WebPush] Subscription expired, removing: ${sub.endpoint.substring(0, 50)}...`);
          await storage.deletePushSubscription(sub.endpoint);
        } else {
          console.error(`[WebPush] Failed to send to subscription:`, error.message || error);
        }
      }
    });

    await Promise.all(sendPromises);
  } catch (error) {
    console.error("[WebPush] Error sending notifications:", error);
  }
}

export function isWebPushConfigured(): boolean {
  return vapidConfigured;
}
