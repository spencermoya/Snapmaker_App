import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface PushStatus {
  enabled: boolean;
  publicKey: string | null;
}

export function usePushNotifications() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  const { data: pushStatus } = useQuery<PushStatus>({
    queryKey: ["/api/push/status"],
    staleTime: Infinity,
  });

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      checkSubscription();
    }
  }, []);

  const checkSubscription = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  }, []);

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!pushStatus?.publicKey) {
        throw new Error("Push notifications not configured on server");
      }

      const perm = await Notification.requestPermission();
      setPermission(perm);
      
      if (perm !== "granted") {
        throw new Error("Notification permission denied. Check your browser settings.");
      }

      const registration = await navigator.serviceWorker.ready;
      
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }

      let subscription: PushSubscription | null = null;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(pushStatus.publicKey),
        });

        const response = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });

        if (!response.ok) {
          throw new Error("Failed to save subscription on server");
        }

        return subscription;
      } catch (error) {
        if (subscription) {
          try {
            await subscription.unsubscribe();
          } catch (cleanupError) {
            console.error("Failed to cleanup subscription:", cleanupError);
          }
        }
        throw error;
      }
    },
    onSuccess: () => {
      checkSubscription();
      toast.success("Push notifications enabled!");
    },
    onError: (error: Error) => {
      checkSubscription();
      toast.error(error.message || "Failed to enable notifications");
      console.error("Subscribe error:", error);
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        
        await subscription.unsubscribe();
      }
    },
    onSuccess: () => {
      checkSubscription();
      toast.success("Push notifications disabled");
    },
    onError: (error: Error) => {
      checkSubscription();
      toast.error("Failed to disable notifications");
      console.error("Unsubscribe error:", error);
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      
      if (!response.ok) {
        throw new Error("Failed to send test notification");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.sent > 0) {
        toast.success("Test notification sent!");
      } else {
        toast.error("No subscriptions found to send notification");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send test notification");
    },
  });

  return {
    isSupported,
    isSubscribed,
    permission,
    serverEnabled: pushStatus?.enabled ?? false,
    subscribe: subscribeMutation.mutate,
    unsubscribe: unsubscribeMutation.mutate,
    sendTest: testMutation.mutate,
    isLoading: subscribeMutation.isPending || unsubscribeMutation.isPending,
    isTestLoading: testMutation.isPending,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
