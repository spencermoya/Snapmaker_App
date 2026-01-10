import { useState, useEffect, useCallback } from "react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushStatus = 
  | "unsupported"
  | "loading"
  | "permission_denied"
  | "ready"
  | "subscribed"
  | "error";

export function useWebPush(printerId: number | undefined) {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  const checkSupport = useCallback(() => {
    const missing: string[] = [];
    
    if (!("serviceWorker" in navigator)) {
      missing.push("Service Worker");
    }
    if (!("PushManager" in window)) {
      missing.push("Push Manager");
    }
    if (!("Notification" in window)) {
      missing.push("Notifications");
    }
    
    if (missing.length > 0) {
      setDebugInfo(`Not supported: ${missing.join(", ")}. Try installing app to home screen.`);
      setStatus("unsupported");
      return false;
    }
    return true;
  }, []);

  const checkCurrentSubscription = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        setStatus("subscribed");
        return true;
      }
      
      if (Notification.permission === "denied") {
        setStatus("permission_denied");
        return false;
      }
      
      setStatus("ready");
      return false;
    } catch (err) {
      console.error("Failed to check subscription:", err);
      setStatus("error");
      setError("Failed to check notification status");
      return false;
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!printerId) {
      setError("No printer selected");
      return false;
    }

    try {
      setStatus("loading");
      console.log("[WebPush] Starting subscription flow...");

      // Step 1: Request permission
      console.log("[WebPush] Requesting notification permission...");
      const permission = await Notification.requestPermission();
      console.log("[WebPush] Permission result:", permission);
      if (permission !== "granted") {
        setStatus("permission_denied");
        setDebugInfo("Permission denied. On iOS: Settings > Notifications > [App Name]");
        return false;
      }

      // Step 2: Get VAPID key
      console.log("[WebPush] Fetching VAPID public key...");
      const vapidResponse = await fetch("/api/push/vapid-public-key");
      if (!vapidResponse.ok) {
        const errData = await vapidResponse.json().catch(() => ({}));
        throw new Error(errData.error || `VAPID key request failed: ${vapidResponse.status}`);
      }
      const { publicKey } = await vapidResponse.json();
      console.log("[WebPush] Got VAPID key:", publicKey?.substring(0, 20) + "...");

      // Step 3: Wait for service worker
      console.log("[WebPush] Waiting for service worker...");
      const registration = await navigator.serviceWorker.ready;
      console.log("[WebPush] Service worker ready, scope:", registration.scope);
      
      // Step 4: Subscribe to push
      console.log("[WebPush] Subscribing to push manager...");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      console.log("[WebPush] Push subscription created");

      const subJson = subscription.toJSON();
      
      // Step 5: Save to server
      console.log("[WebPush] Saving subscription to server...");
      const saveResponse = await fetch(`/api/printers/${printerId}/push-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      if (!saveResponse.ok) {
        const errData = await saveResponse.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save subscription");
      }

      console.log("[WebPush] Subscription saved successfully!");
      setStatus("subscribed");
      setError(null);
      setDebugInfo(null);
      return true;
    } catch (err) {
      console.error("[WebPush] Subscription failed:", err);
      setStatus("error");
      const msg = err instanceof Error ? err.message : "Failed to enable notifications";
      setError(msg);
      setDebugInfo(`Error: ${msg}. Check console for details.`);
      return false;
    }
  }, [printerId]);

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await fetch("/api/push-subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        
        await subscription.unsubscribe();
      }
      
      setStatus("ready");
      return true;
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
      setError("Failed to disable notifications");
      return false;
    }
  }, []);

  useEffect(() => {
    if (!checkSupport()) {
      return;
    }
    
    checkCurrentSubscription();
  }, [checkSupport, checkCurrentSubscription]);

  return {
    status,
    error,
    debugInfo,
    subscribe,
    unsubscribe,
    isSupported: status !== "unsupported",
    isSubscribed: status === "subscribed",
    canSubscribe: status === "ready",
  };
}
