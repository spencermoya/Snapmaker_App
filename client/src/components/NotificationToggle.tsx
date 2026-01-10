import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  requestNotificationPermission, 
  getNotificationPermission 
} from "@/hooks/useNotifications";

export default function NotificationToggle() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  const handleRequestPermission = async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
  };

  if (permission === "unsupported") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Notifications not supported in this browser"
        data-testid="notification-toggle-unsupported"
      >
        <BellOff className="h-5 w-5 text-muted-foreground" />
      </Button>
    );
  }

  if (permission === "granted") {
    return (
      <Button
        variant="ghost"
        size="icon"
        title="Notifications enabled - you'll be notified when prints start or complete"
        data-testid="notification-toggle-enabled"
      >
        <BellRing className="h-5 w-5 text-green-500" />
      </Button>
    );
  }

  if (permission === "denied") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        title="Notifications blocked - enable in browser settings"
        data-testid="notification-toggle-denied"
      >
        <BellOff className="h-5 w-5 text-red-500" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleRequestPermission}
      title="Click to enable print notifications"
      data-testid="notification-toggle-request"
    >
      <Bell className="h-5 w-5 text-muted-foreground" />
    </Button>
  );
}
