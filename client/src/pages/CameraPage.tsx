import { useQuery } from "@tanstack/react-query";
import { Camera, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import WebcamFeed from "@/components/WebcamFeed";

interface CameraSettings {
  url: string | null;
  rtspUrl: string | null;
  mjpegUrl: string | null;
  username: string | null;
  password: string | null;
  refreshRate: number;
  streamType: string;
}

export default function CameraPage() {
  const [, setLocation] = useLocation();

  const { data: cameraSettings, isLoading } = useQuery<CameraSettings>({
    queryKey: ["/api/settings/camera"],
    staleTime: 30000,
  });

  const hasCamera = cameraSettings?.url || cameraSettings?.rtspUrl || cameraSettings?.mjpegUrl;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!hasCamera) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <Camera className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2" data-testid="text-no-camera">No Camera Connected</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Add an IP camera in Settings to watch your prints in real-time.
        </p>
        <Button variant="outline" onClick={() => setLocation("/settings")} data-testid="button-camera-settings">
          <Settings className="h-4 w-4 mr-2" /> Go to Settings
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <WebcamFeed />
    </div>
  );
}
