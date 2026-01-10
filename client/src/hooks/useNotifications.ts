import { useEffect, useRef, useCallback } from "react";

interface PrintNotification {
  type: "connected" | "print_started" | "print_completed" | "print_stopped";
  printerId: number;
  filename?: string | null;
  timestamp?: string;
  durationMinutes?: number;
}

export function useNotifications(printerId: number | undefined) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const showBrowserNotification = useCallback((notification: PrintNotification) => {
    if (!("Notification" in window)) {
      return;
    }

    if (Notification.permission !== "granted") {
      return;
    }

    let title = "";
    let body = "";
    const icon = "/favicon.ico";

    switch (notification.type) {
      case "print_started":
        title = "Print Started";
        body = notification.filename 
          ? `Now printing: ${notification.filename}`
          : "A print job has started";
        break;
      case "print_completed":
        title = "Print Completed!";
        body = notification.filename
          ? `Finished: ${notification.filename}`
          : "Your print has completed";
        if (notification.durationMinutes) {
          body += ` (${notification.durationMinutes} min)`;
        }
        break;
      case "print_stopped":
        title = "Print Stopped";
        body = notification.filename
          ? `Stopped: ${notification.filename}`
          : "The print job was stopped";
        break;
      default:
        return;
    }

    try {
      new Notification(title, { body, icon, tag: `print-${notification.type}` });
    } catch (error) {
      console.error("Failed to show notification:", error);
    }
  }, []);

  const connect = useCallback(() => {
    if (!printerId) return;
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/printers/${printerId}/notifications`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const notification: PrintNotification = JSON.parse(event.data);
        showBrowserNotification(notification);
      } catch (error) {
        console.error("Failed to parse notification:", error);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
      
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 5000);
    };
  }, [printerId, showBrowserNotification]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return null;
}

export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    return Promise.resolve("denied" as NotificationPermission);
  }

  if (Notification.permission === "granted") {
    return Promise.resolve("granted");
  }

  if (Notification.permission === "denied") {
    return Promise.resolve("denied");
  }

  return Notification.requestPermission();
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}
