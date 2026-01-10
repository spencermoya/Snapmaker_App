import { Bell, BellOff, BellRing, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWebPush } from "@/hooks/useWebPush";
import { useState } from "react";
import { toast } from "sonner";

interface NotificationToggleProps {
  printerId: number | undefined;
}

export default function NotificationToggle({ printerId }: NotificationToggleProps) {
  const { status, subscribe, unsubscribe, error, debugInfo } = useWebPush(printerId);
  const [testing, setTesting] = useState(false);

  const sendTestNotification = async () => {
    if (!printerId) return;
    setTesting(true);
    try {
      const res = await fetch(`/api/printers/${printerId}/test-notification`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast.success("Test notification sent! Check your notifications.");
      } else {
        toast.error(data.error || "Failed to send test notification");
      }
    } catch (err) {
      toast.error("Failed to send test notification");
    } finally {
      setTesting(false);
    }
  };

  if (status === "unsupported") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title={debugInfo || "Push notifications not supported - install app to home screen (iOS 16.4+ required)"}
        data-testid="notification-toggle-unsupported"
      >
        <BellOff className="h-5 w-5 text-muted-foreground" />
      </Button>
    );
  }

  if (status === "loading") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Checking notification status..."
        data-testid="notification-toggle-loading"
      >
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
      </Button>
    );
  }

  if (status === "subscribed") {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={unsubscribe}
          title="Notifications enabled - click to disable"
          data-testid="notification-toggle-enabled"
        >
          <BellRing className="h-5 w-5 text-green-500" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={sendTestNotification}
          disabled={testing}
          title="Send test notification"
          data-testid="notification-test-button"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Send className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          )}
        </Button>
      </div>
    );
  }

  if (status === "permission_denied") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Notifications blocked - go to Settings > Safari > Snapmaker Control to enable"
        data-testid="notification-toggle-denied"
      >
        <BellOff className="h-5 w-5 text-red-500" />
      </Button>
    );
  }

  if (status === "error") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={subscribe}
        title={error || "Error - click to retry"}
        data-testid="notification-toggle-error"
      >
        <Bell className="h-5 w-5 text-yellow-500" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={subscribe}
      disabled={!printerId}
      title={printerId ? "Click to enable push notifications" : "Select a printer first"}
      data-testid="notification-toggle-request"
    >
      <Bell className="h-5 w-5 text-muted-foreground" />
    </Button>
  );
}
