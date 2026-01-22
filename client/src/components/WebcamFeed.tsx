import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Maximize2, Settings, WifiOff, RefreshCw } from "lucide-react";
import { Link } from "wouter";

interface CameraSettings {
  url: string | null;
  username: string | null;
  password: string | null;
  refreshRate: number;
  streamType: string;
}

export default function WebcamFeed() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const { data: cameraSettings } = useQuery<CameraSettings>({
    queryKey: ["/api/settings/camera"],
    staleTime: 30000,
  });

  const isConfigured = cameraSettings?.url;

  useEffect(() => {
    if (!isConfigured) {
      setIsLoading(false);
      return;
    }

    let intervalId: NodeJS.Timeout;
    let isMounted = true;

    const fetchSnapshot = async () => {
      try {
        const timestamp = Date.now();
        const response = await fetch(`/api/camera/snapshot?t=${timestamp}`);
        
        if (!response.ok) {
          throw new Error("Failed to fetch");
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        if (isMounted) {
          setImageSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setHasError(false);
          setIsLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setHasError(true);
          setIsLoading(false);
        }
      }
    };

    fetchSnapshot();
    
    const refreshRate = cameraSettings?.refreshRate || 1000;
    intervalId = setInterval(fetchSnapshot, refreshRate);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      if (imageSrc) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [isConfigured, cameraSettings?.refreshRate]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  if (!isConfigured) {
    return (
      <Card className="overflow-hidden relative group aspect-video bg-black/50 border-none shadow-xl ring-1 ring-border flex items-center justify-center">
        <div className="text-center p-8">
          <Camera className="h-16 w-16 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground mb-2">Camera Not Configured</h3>
          <p className="text-sm text-muted-foreground/70 mb-4">
            Add your IP camera in Settings to view the live feed
          </p>
          <Link href="/settings" className="inline-flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 rounded-lg text-primary transition-colors" data-testid="link-camera-settings">
            <Settings className="h-4 w-4" />
            Configure Camera
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      ref={containerRef}
      className={`overflow-hidden relative group bg-black border-none shadow-xl ring-1 ring-border ${isFullscreen ? 'fixed inset-0 z-50' : 'aspect-video'}`}
    >
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Badge 
          variant={hasError ? "outline" : "destructive"} 
          className={`${hasError ? 'bg-yellow-500/80' : 'animate-pulse bg-red-500/80'} text-white border-none shadow-sm backdrop-blur-sm`}
        >
          {hasError ? "OFFLINE" : "LIVE"}
        </Badge>
        <Badge variant="outline" className="bg-black/50 text-white border-white/20 backdrop-blur-sm">
          4K
        </Badge>
      </div>
      
      <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
        <button 
          onClick={toggleFullscreen}
          className="p-2 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-sm transition-colors"
          data-testid="button-fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="w-full h-full flex items-center justify-center min-h-[200px]">
          <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      ) : hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center min-h-[200px] text-muted-foreground">
          <WifiOff className="h-12 w-12 mb-2" />
          <p className="text-sm">Camera unavailable</p>
        </div>
      ) : (
        <img 
          ref={imgRef}
          src={imageSrc || ""} 
          alt="Camera Feed" 
          className={`w-full h-full object-contain ${isFullscreen ? 'max-h-screen' : ''}`}
          style={{ imageRendering: 'auto' }}
          data-testid="img-camera-feed"
        />
      )}
      
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2 text-white/80 text-xs font-mono">
          <Camera className="h-3 w-3" />
          <span>IP Camera</span>
        </div>
      </div>
    </Card>
  );
}
