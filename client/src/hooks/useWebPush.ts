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

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("permission_denied");
        return false;
      }

      const vapidResponse = await fetch("/api/push/vapid-public-key");
      if (!vapidResponse.ok) {
        throw new Error("Failed to get VAPID key");
      }
      const { publicKey } = await vapidResponse.json();

      const registration = await navigator.serviceWorker.ready;
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const subJson = subscription.toJSON();
      
      const saveResponse = await fetch(`/api/printers/${printerId}/push-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      if (!saveResponse.ok) {
        throw new Error("Failed to save subscription");
      }

      setStatus("subscribed");
      setError(null);
      return true;
    } catch (err) {
      console.error("Failed to subscribe:", err);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to enable notifications");
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
