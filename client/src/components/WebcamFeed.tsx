import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Maximize2, Settings, WifiOff, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import Hls from "hls.js";

interface CameraSettings {
  url: string | null;
  rtspUrl: string | null;
  mjpegUrl: string | null;
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
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [activeMode, setActiveMode] = useState<"mjpeg" | "snapshot" | "rtsp">("mjpeg");
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const mjpegRef = useRef<HTMLImageElement>(null);
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

  const isConfigured = cameraSettings?.url || cameraSettings?.rtspUrl || cameraSettings?.mjpegUrl;
  const hasMjpegUrl = !!cameraSettings?.mjpegUrl;
  const hasSnapshotUrl = !!cameraSettings?.url;
  const hasRtspUrl = !!cameraSettings?.rtspUrl;
  const isStreamRunning = streamStatus?.running;

  useEffect(() => {
    if (!cameraSettings) return;
    const st = cameraSettings.streamType;
    if (st === "mjpeg" && hasMjpegUrl) {
      setActiveMode("mjpeg");
    } else if (st === "rtsp" && hasRtspUrl) {
      setActiveMode("rtsp");
    } else if (hasMjpegUrl) {
      setActiveMode("mjpeg");
    } else if (hasSnapshotUrl) {
      setActiveMode("snapshot");
    } else if (hasRtspUrl) {
      setActiveMode("rtsp");
    } else {
      setActiveMode("snapshot");
    }
    setHasError(false);
    setIsLoading(true);
  }, [cameraSettings?.streamType, cameraSettings?.mjpegUrl, cameraSettings?.url, cameraSettings?.rtspUrl]);

  const fallbackToSnapshot = () => {
    if (hasSnapshotUrl && activeMode !== "snapshot") {
      console.log("[Camera] Falling back to snapshot mode");
      setActiveMode("snapshot");
      setHasError(false);
      setIsLoading(true);
    }
  };

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

  // MJPEG mode: just point an <img> at the proxy endpoint
  useEffect(() => {
    if (activeMode !== "mjpeg" || !isConfigured) return;

    const img = mjpegRef.current;
    if (!img) {
      setIsLoading(false);
      return;
    }

    const timestamp = Date.now();
    const src = `/api/camera/mjpeg?t=${timestamp}`;

    const handleLoad = () => {
      setIsLoading(false);
      setHasError(false);
    };

    const handleError = () => {
      console.error("[Camera] MJPEG stream error");
      setErrorMessage("MJPEG live stream failed");
      if (hasSnapshotUrl) {
        fallbackToSnapshot();
      } else {
        setHasError(true);
        setIsLoading(false);
      }
    };

    img.addEventListener("load", handleLoad);
    img.addEventListener("error", handleError);
    img.src = src;

    return () => {
      img.removeEventListener("load", handleLoad);
      img.removeEventListener("error", handleError);
      img.src = "";
    };
  }, [activeMode, isConfigured, cameraSettings?.mjpegUrl]);

  // RTSP/HLS mode
  useEffect(() => {
    if (activeMode !== "rtsp" || !hasRtspUrl || !cameraSettings?.rtspUrl) return;

    if (!isStreamRunning && !streamLoading) {
      setStreamLoading(true);
      startStreamMutation.mutate(cameraSettings.rtspUrl, {
        onError: () => {
          setStreamLoading(false);
          setErrorMessage("RTSP stream failed to start");
          if (hasMjpegUrl) {
            setActiveMode("mjpeg");
          } else {
            fallbackToSnapshot();
            if (!hasSnapshotUrl) {
              setHasError(true);
              setIsLoading(false);
            }
          }
        },
        onSettled: () => setStreamLoading(false),
      });
    }
  }, [activeMode, cameraSettings?.rtspUrl]);

  useEffect(() => {
    if (activeMode !== "rtsp" || !isStreamRunning || !videoRef.current) return;

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

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error("[HLS] Fatal error:", data.type, data.details);
          setErrorMessage("HLS stream error");
          if (hasMjpegUrl) {
            setActiveMode("mjpeg");
          } else {
            fallbackToSnapshot();
            if (!hasSnapshotUrl) {
              setHasError(true);
              setIsLoading(false);
            }
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
  }, [activeMode, isStreamRunning]);

  // Snapshot polling mode (fallback)
  useEffect(() => {
    if (activeMode !== "snapshot" || !isConfigured) {
      if (activeMode !== "snapshot") setIsLoading(false);
      return;
    }

    let intervalId: NodeJS.Timeout;
    let isMounted = true;

    const fetchSnapshot = async () => {
      try {
        const timestamp = Date.now();
        const response = await fetch(`/api/camera/snapshot?t=${timestamp}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
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
          setErrorMessage("Snapshot fetch failed");
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
  }, [activeMode, isConfigured, cameraSettings?.refreshRate]);

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
          <h3 className="text-lg font-medium text-muted-foreground mb-2" data-testid="text-camera-not-configured">Camera Not Configured</h3>
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

  const modeBadge = activeMode === "mjpeg" ? "LIVE" 
    : activeMode === "rtsp" ? "STREAM" 
    : "SNAPSHOT";

  const modeBadgeClass = activeMode === "mjpeg" ? "bg-green-500/80" 
    : activeMode === "rtsp" ? "bg-blue-500/50" 
    : "bg-orange-500/50";

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
        <Badge variant="outline" className={`${modeBadgeClass} text-white border-white/20 backdrop-blur-sm`}>
          {modeBadge}
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

      {isLoading || streamLoading ? (
        <div className="w-full h-full flex items-center justify-center min-h-[200px]">
          <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      ) : hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center min-h-[200px] text-muted-foreground">
          <WifiOff className="h-12 w-12 mb-2" />
          <p className="text-sm font-medium">Camera unavailable</p>
          <p className="text-xs mt-1 text-muted-foreground/60">
            {errorMessage || "Check Settings to verify camera IP and credentials"}
          </p>
        </div>
      ) : null}

      {/* MJPEG live stream - simple img tag pointed at proxy */}
      {activeMode === "mjpeg" && !hasError && (
        <img 
          ref={mjpegRef}
          alt="Live Camera Feed"
          className={`w-full h-full object-contain ${isFullscreen ? 'max-h-screen' : ''} ${isLoading ? 'hidden' : ''}`}
          style={{ imageRendering: 'auto' }}
          data-testid="img-mjpeg-feed"
        />
      )}

      {/* RTSP/HLS video stream */}
      {activeMode === "rtsp" && !hasError && (
        <video 
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-contain ${isFullscreen ? 'max-h-screen' : ''} ${isLoading ? 'hidden' : ''}`}
          data-testid="video-camera-feed"
        />
      )}

      {/* Snapshot polling fallback */}
      {activeMode === "snapshot" && !hasError && imageSrc && (
        <img 
          ref={imgRef}
          src={imageSrc}
          alt="Camera Feed" 
          className={`w-full h-full object-contain ${isFullscreen ? 'max-h-screen' : ''}`}
          style={{ imageRendering: 'auto' }}
          data-testid="img-camera-feed"
        />
      )}
      
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2 text-white/80 text-xs font-mono">
          <Camera className="h-3 w-3" />
          <span>
            {activeMode === "mjpeg" ? "Live Stream (MJPEG)" 
              : activeMode === "rtsp" ? "Live Stream (RTSP)" 
              : "Snapshot Mode"}
          </span>
          {activeMode === "rtsp" && isStreamRunning && streamStatus?.uptime && (
            <span className="ml-auto">
              Uptime: {Math.floor(streamStatus.uptime / 60)}m {streamStatus.uptime % 60}s
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
