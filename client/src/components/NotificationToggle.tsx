import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWebPush } from "@/hooks/useWebPush";

interface NotificationToggleProps {
  printerId: number | undefined;
}

export default function NotificationToggle({ printerId }: NotificationToggleProps) {
  const { status, subscribe, unsubscribe, error } = useWebPush(printerId);

  if (status === "unsupported") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Push notifications not supported - try installing this app to your home screen"
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
      <Button
        variant="ghost"
        size="icon"
        onClick={unsubscribe}
        title="Notifications enabled - click to disable"
        data-testid="notification-toggle-enabled"
      >
        <BellRing className="h-5 w-5 text-green-500" />
      </Button>
    );
  }

  if (status === "permission_denied") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Notifications blocked - enable in browser/device settings"
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
