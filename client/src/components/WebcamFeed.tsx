import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Maximize2, Settings, WifiOff, RefreshCw, Play, Square } from "lucide-react";
import { Link } from "wouter";
import Hls from "hls.js";

interface CameraSettings {
  url: string | null;
  rtspUrl: string | null;
  username: string | null;
  password: string | null;
  refreshRate: number;
  streamType: string;
}

interface StreamStatus {
  running: boolean;
  url: string | null;
  uptime: number | null;
}

export default function WebcamFeed() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [rtspFailed, setRtspFailed] = useState(false); // Track if RTSP failed so we can fallback
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const queryClient = useQueryClient();

  const { data: cameraSettings } = useQuery<CameraSettings>({
    queryKey: ["/api/settings/camera"],
    staleTime: 30000,
  });

  const { data: streamStatus, refetch: refetchStreamStatus } = useQuery<StreamStatus>({
    queryKey: ["/api/stream/status"],
    staleTime: 5000,
    refetchInterval: 5000,
  });

  const isConfigured = cameraSettings?.url || cameraSettings?.rtspUrl;
  const hasSnapshotFallback = !!cameraSettings?.url; // Can we fall back to snapshot?
  // Use RTSP mode only if rtspUrl is set AND we haven't failed yet (or no snapshot fallback)
  const isRtspMode = !!cameraSettings?.rtspUrl && (!rtspFailed || !hasSnapshotFallback);
  const isStreamRunning = streamStatus?.running;

  const startStreamMutation = useMutation({
    mutationFn: async (rtspUrl: string) => {
      const response = await fetch("/api/stream/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtspUrl }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start stream");
      }
      return response.json();
    },
    onSuccess: () => {
      refetchStreamStatus();
    },
  });

  const stopStreamMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/stream/stop", { method: "POST" });
      return response.json();
    },
    onSuccess: () => {
      refetchStreamStatus();
    },
  });

  // Reset rtspFailed when camera settings change (user reconfigured camera)
  useEffect(() => {
    setRtspFailed(false);
    setHasError(false);
  }, [cameraSettings?.rtspUrl, cameraSettings?.url]);

  useEffect(() => {
    if (isRtspMode && cameraSettings?.rtspUrl && !isStreamRunning && !streamLoading) {
      setStreamLoading(true);
      startStreamMutation.mutate(cameraSettings.rtspUrl, {
        onSettled: () => setStreamLoading(false),
      });
    }
  }, [isRtspMode, cameraSettings?.rtspUrl]);

  useEffect(() => {
    if (!isRtspMode || !isStreamRunning || !videoRef.current) return;

    const hlsUrl = "/api/stream/hls/stream.m3u8";

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
      });
      
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        setHasError(false);
        videoRef.current?.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error("[HLS] Fatal error:", data.type, data.details);
          // If we have a snapshot URL fallback, use it instead of showing error
          if (hasSnapshotFallback) {
            console.log("[HLS] Falling back to snapshot mode");
            setRtspFailed(true);
            setHasError(false);
            setIsLoading(true); // Will trigger snapshot fetch
          } else {
            setHasError(true);
            setIsLoading(false);
          }
        }
      });

      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.current.src = hlsUrl;
      videoRef.current.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        setHasError(false);
        videoRef.current?.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [isRtspMode, isStreamRunning]);

  useEffect(() => {
    if (isRtspMode || !isConfigured) {
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
  }, [isConfigured, isRtspMode, cameraSettings?.refreshRate, rtspFailed]);

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
        {isRtspMode ? (
          <Badge variant="outline" className="bg-blue-500/50 text-white border-white/20 backdrop-blur-sm">
            STREAM
          </Badge>
        ) : rtspFailed ? (
          <Badge variant="outline" className="bg-orange-500/50 text-white border-white/20 backdrop-blur-sm">
            FALLBACK
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-black/50 text-white border-white/20 backdrop-blur-sm">
            4K
          </Badge>
        )}
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

      {isLoading || streamLoading ? (
        <div className="w-full h-full flex items-center justify-center min-h-[200px]">
          <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      ) : hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center min-h-[200px] text-muted-foreground">
          <WifiOff className="h-12 w-12 mb-2" />
          <p className="text-sm font-medium">Camera unavailable</p>
          <p className="text-xs mt-1 text-muted-foreground/60">Check Settings to verify camera IP and credentials</p>
        </div>
      ) : isRtspMode ? (
        <video 
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-contain ${isFullscreen ? 'max-h-screen' : ''}`}
          data-testid="video-camera-feed"
        />
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
          <span>{isRtspMode ? "Live Stream" : "IP Camera"}</span>
          {isStreamRunning && streamStatus?.uptime && (
            <span className="ml-auto">
              Uptime: {Math.floor(streamStatus.uptime / 60)}m {streamStatus.uptime % 60}s
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
