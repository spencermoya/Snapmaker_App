import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Wifi, WifiOff, ArrowLeft, FolderOpen, Copy, CheckCircle, XCircle, ExternalLink, Monitor, Radio, Bell, Camera, Loader2, Search, ChevronDown, ChevronUp, Plug, Power } from "lucide-react";
import { useLocation } from "wouter";
import type { Printer, SmartPlug } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface SettingsData {
  watchFolder: {
    path: string | null;
    active: boolean;
  };
  slicerApi: {
    octoprintUrl: string;
    directUrl: string;
    configUrl: string;
  };
  lubanProxy: {
    enabled: boolean;
    port: number;
    targetPrinterIp: string | null;
    hasToken: boolean;
  };
}

interface PushStatus {
  enabled: boolean;
  publicKey: string | null;
}

interface CameraSettings {
  url: string | null;
  rtspUrl: string | null;
  mjpegUrl: string | null;
  username: string | null;
  password: string | null;
  refreshRate: number;
  streamType: string;
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const [newPrinterName, setNewPrinterName] = useState("");
  const [newPrinterIp, setNewPrinterIp] = useState("");
  const [watchFolderPath, setWatchFolderPath] = useState("");
  const [lubanProxyIp, setLubanProxyIp] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const [merossEmail, setMerossEmail] = useState("");
  const [merossPassword, setMerossPassword] = useState("");
  const [merossConnecting, setMerossConnecting] = useState(false);

  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushLoading, setPushLoading] = useState(false);
  const [pushTestLoading, setPushTestLoading] = useState(false);

  const [cameraUrl, setCameraUrl] = useState("");
  const [cameraRtspUrl, setCameraRtspUrl] = useState("");
  const [cameraIp, setCameraIp] = useState("");
  const [cameraUsername, setCameraUsername] = useState("");
  const [cameraPassword, setCameraPassword] = useState("");
  const [cameraRefreshRate, setCameraRefreshRate] = useState(1000);
  const [cameraConnecting, setCameraConnecting] = useState(false);
  const [cameraDetectedBrand, setCameraDetectedBrand] = useState<string | null>(null);
  const [showAdvancedCamera, setShowAdvancedCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<"mjpeg" | "snapshot" | "rtsp">("mjpeg");
  const [cameraMjpegUrl, setCameraMjpegUrl] = useState("");
  const [cameraBrand, setCameraBrand] = useState<string>("auto");
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState<string | null>(null);
  const [cameraPreviewError, setCameraPreviewError] = useState<string | null>(null);

  const CAMERA_BRANDS = [
    { id: "auto", name: "Auto-Detect", rtsp: "", snapshot: "", mjpeg: "" },
    { id: "lorex", name: "Lorex / Dahua", rtsp: "/cam/realmonitor?channel=1&subtype=1", snapshot: "/cgi-bin/snapshot.cgi", mjpeg: "" },
    { id: "hikvision", name: "Hikvision", rtsp: "/Streaming/channels/101", snapshot: "/ISAPI/Streaming/channels/1/picture", mjpeg: "/ISAPI/Streaming/channels/102/httpPreview" },
    { id: "reolink", name: "Reolink", rtsp: "/h264Preview_01_main", snapshot: "/cgi-bin/api.cgi?cmd=Snap&channel=0", mjpeg: "" },
    { id: "amcrest", name: "Amcrest", rtsp: "/cam/realmonitor?channel=1&subtype=1", snapshot: "/cgi-bin/snapshot.cgi", mjpeg: "/cgi-bin/mjpg/video.cgi?channel=1&subtype=1" },
    { id: "axis", name: "Axis", rtsp: "/axis-media/media.amp", snapshot: "/axis-cgi/jpg/image.cgi", mjpeg: "/axis-cgi/mjpg/video.cgi" },
    { id: "onvif", name: "ONVIF Generic", rtsp: "/stream1", snapshot: "/onvif-http/snapshot", mjpeg: "" },
    { id: "wyze", name: "Wyze (via RTSP firmware)", rtsp: "/live", snapshot: "", mjpeg: "" },
  ];

  const { data: pushStatus } = useQuery<PushStatus>({
    queryKey: ["/api/push/status"],
    staleTime: Infinity,
  });

  const { data: cameraSettings } = useQuery<CameraSettings>({
    queryKey: ["/api/settings/camera"],
    staleTime: 30000,
  });

  useEffect(() => {
    if (cameraSettings) {
      setCameraUrl(cameraSettings.url || "");
      setCameraRtspUrl(cameraSettings.rtspUrl || "");
      setCameraMjpegUrl(cameraSettings.mjpegUrl || "");
      setCameraUsername(cameraSettings.username || "");
      setCameraPassword(cameraSettings.password === "***" ? "" : (cameraSettings.password || ""));
      setCameraRefreshRate(cameraSettings.refreshRate || 1000);
      const st = cameraSettings.streamType;
      if (st === "mjpeg" || st === "rtsp" || st === "snapshot") {
        setCameraMode(st);
      } else if (cameraSettings.mjpegUrl) {
        setCameraMode("mjpeg");
      } else if (cameraSettings.rtspUrl) {
        setCameraMode("rtsp");
      } else if (cameraSettings.url) {
        setCameraMode("snapshot");
      }
      const urlToParse = cameraSettings.mjpegUrl || cameraSettings.url || cameraSettings.rtspUrl;
      if (urlToParse) {
        try {
          const parsedUrl = new URL(urlToParse);
          setCameraIp(parsedUrl.hostname);
        } catch {
          setCameraIp("");
        }
      }
    }
  }, [cameraSettings]);

  const saveCameraSettings = async (data: { url: string; rtspUrl?: string; mjpegUrl?: string; username: string; password: string; refreshRate: number; streamType?: string; clearPassword?: boolean }) => {
    const response = await fetch("/api/settings/camera", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error("Failed to save camera settings");
    queryClient.invalidateQueries({ queryKey: ["/api/settings/camera"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stream/status"] });
    return response.json();
  };
  
  const cameraMutation = useMutation({
    mutationFn: saveCameraSettings,
    onSuccess: () => {
      toast.success("Camera settings saved");
    },
    onError: () => {
      toast.error("Failed to save camera settings");
    },
  });

  const handleSaveCameraSettings = () => {
    cameraMutation.mutate({
      url: cameraUrl || "",
      rtspUrl: cameraRtspUrl || "",
      mjpegUrl: cameraMjpegUrl || "",
      username: cameraUsername,
      password: cameraPassword,
      refreshRate: cameraRefreshRate,
      streamType: cameraMode,
    });
  };

  const handleClearCamera = async () => {
    // Stop any running stream before clearing settings
    try {
      await fetch("/api/stream/stop", { method: "POST" });
    } catch {
      // Ignore errors if stream wasn't running
    }
    
    cameraMutation.mutate({
      url: "",
      rtspUrl: "",
      mjpegUrl: "",
      username: "",
      password: "",
      refreshRate: 1000,
      streamType: "mjpeg",
      clearPassword: true,
    });
    setCameraUrl("");
    setCameraRtspUrl("");
    setCameraMjpegUrl("");
    setCameraIp("");
    setCameraUsername("");
    setCameraPassword("");
    setCameraRefreshRate(1000);
    setCameraDetectedBrand(null);
    setCameraMode("mjpeg");
  };

  const handleSmartConnect = async () => {
    if (!cameraIp) {
      toast.error("Please enter the camera's IP address");
      return;
    }
    
    setCameraConnecting(true);
    setCameraPreviewError(null);
    setCameraDetectedBrand(null);
    
    try {
      const selectedBrand = CAMERA_BRANDS.find(b => b.id === cameraBrand);
      
      if (cameraBrand === "auto") {
        // Use auto-detect endpoint
        const response = await fetch("/api/camera/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ip: cameraIp,
            username: cameraUsername,
            password: cameraPassword,
          }),
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          try {
            await saveCameraSettings({
              url: data.url,
              username: cameraUsername,
              password: cameraPassword,
              refreshRate: 1000,
            });
            setCameraDetectedBrand(data.brand);
            toast.success(`Connected to ${data.brand} camera!`);
          } catch {
            toast.error("Failed to save camera settings");
          }
        } else {
          setCameraPreviewError(data.error || "Could not detect camera. Try selecting your camera brand manually.");
        }
      } else if (selectedBrand) {
        const authPart = cameraUsername && cameraPassword 
          ? `${cameraUsername}:${cameraPassword}@` 
          : (cameraUsername ? `${cameraUsername}@` : "");
        
        const snapshotUrl = selectedBrand.snapshot ? `http://${cameraIp}${selectedBrand.snapshot}` : "";
        const rtspUrl = selectedBrand.rtsp ? `rtsp://${authPart}${cameraIp}:554${selectedBrand.rtsp}` : "";
        const mjpegUrl = selectedBrand.mjpeg ? `http://${cameraIp}${selectedBrand.mjpeg}` : "";
        
        console.log(`[Camera] Brand selected: ${selectedBrand.name}, testing connection first...`);
        
        const testResponse = await fetch("/api/camera/test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ip: cameraIp,
            snapshotUrl: snapshotUrl || undefined,
            mjpegUrl: mjpegUrl || undefined,
            username: cameraUsername,
            password: cameraPassword,
          }),
        });
        const testData = await testResponse.json();
        
        console.log(`[Camera] Test results:`, testData);
        
        const streamType = testData.recommendedMode || (snapshotUrl ? "snapshot" : (mjpegUrl ? "mjpeg" : "rtsp"));
        
        try {
          await saveCameraSettings({
            url: snapshotUrl,
            rtspUrl: rtspUrl,
            mjpegUrl: mjpegUrl,
            username: cameraUsername,
            password: cameraPassword,
            refreshRate: 1000,
            streamType: streamType,
          });
          setCameraDetectedBrand(selectedBrand.name);
          
          if (testData.reachable) {
            const modeLabel = streamType === "snapshot" ? "Snapshot" : streamType === "mjpeg" ? "MJPEG Live" : "RTSP";
            toast.success(`${selectedBrand.name} camera connected! Using ${modeLabel} mode.`);
          } else {
            const errorDetail = testData.results?.[0]?.error || "Could not reach camera";
            setCameraPreviewError(`Settings saved but camera test failed: ${errorDetail}. The feed may not work until this is resolved.`);
            toast.warning ? toast.warning("Camera saved but connection test failed - check the error below") : 
              toast.error(`Settings saved but test failed: ${errorDetail}`);
          }
        } catch {
          toast.error("Failed to save camera settings");
        }
      }
    } catch (error) {
      setCameraPreviewError("Failed to connect to camera. Please check the IP address.");
    } finally {
      setCameraConnecting(false);
    }
  };

  const handleManualConnect = () => {
    const url = cameraUrl || cameraRtspUrl;
    if (!url) {
      toast.error("Please enter a camera URL");
      return;
    }
    
    if (url.startsWith("rtsp://")) {
      cameraMutation.mutate({
        url: "",
        rtspUrl: url,
        username: cameraUsername,
        password: cameraPassword,
        refreshRate: 1000,
      });
    } else {
      cameraMutation.mutate({
        url: url,
        rtspUrl: "",
        username: cameraUsername,
        password: cameraPassword,
        refreshRate: 1000,
      });
    }
  };

  const handleAutoDetectCamera = async () => {
    if (!cameraIp) {
      toast.error("Please enter the camera's IP address");
      return;
    }
    
    setCameraConnecting(true);
    setCameraDetectedBrand(null);
    
    try {
      const response = await fetch("/api/camera/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: cameraIp,
          username: cameraUsername,
          password: cameraPassword,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        // Save settings first, then show success
        try {
          await saveCameraSettings({
            url: data.url,
            username: cameraUsername,
            password: cameraPassword,
            refreshRate: cameraRefreshRate,
          });
          setCameraUrl(data.url);
          setCameraDetectedBrand(data.brand);
          toast.success(data.message);
        } catch {
          toast.error("Failed to save camera settings");
        }
      } else {
        toast.error(data.error || "Could not detect camera");
        setShowAdvancedCamera(true);
      }
    } catch (error) {
      toast.error("Failed to detect camera");
      setShowAdvancedCamera(true);
    } finally {
      setCameraConnecting(false);
    }
  };

  const checkPushSubscription = useCallback(async () => {
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setPushSubscribed(!!subscription);
      }
    } catch (error) {
      console.error("Error checking push subscription:", error);
    }
  }, []);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(supported);
    if (supported) {
      setPushPermission(Notification.permission);
      checkPushSubscription();
    }
  }, [checkPushSubscription]);

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const handlePushSubscribe = async () => {
    if (!pushStatus?.publicKey) {
      toast.error("Push notifications not configured on server");
      return;
    }
    setPushLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm !== "granted") {
        toast.error("Notification permission denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        try {
          await fetch("/api/push/unsubscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: existingSub.endpoint }),
          });
        } catch (e) {
          console.log("Old subscription cleanup failed, continuing...");
        }
        await existingSub.unsubscribe();
      }
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pushStatus.publicKey),
      });
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        throw new Error("Failed to save subscription");
      }
      await checkPushSubscription();
      toast.success("Push notifications enabled!");
    } catch (error) {
      console.error("Push subscribe error:", error);
      toast.error("Failed to enable notifications");
      await checkPushSubscription();
    } finally {
      setPushLoading(false);
    }
  };

  const handlePushUnsubscribe = async () => {
    setPushLoading(true);
    try {
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
      await checkPushSubscription();
      toast.success("Push notifications disabled");
    } catch (error) {
      console.error("Push unsubscribe error:", error);
      toast.error("Failed to disable notifications");
      await checkPushSubscription();
    } finally {
      setPushLoading(false);
    }
  };

  const handlePushTest = async () => {
    setPushTestLoading(true);
    try {
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error("Failed to send test notification");
      }
      const data = await response.json();
      if (data.sent > 0) {
        toast.success("Test notification sent!");
      } else if (data.failed > 0) {
        toast.error("Notification failed to deliver - check server logs");
      } else {
        toast.error("No subscriptions found - try toggling notifications off and on");
      }
    } catch (error) {
      console.error("Push test error:", error);
      toast.error("Failed to send test notification");
    } finally {
      setPushTestLoading(false);
    }
  };

  const { data: merossStatus, refetch: refetchMeross } = useQuery<{
    connected: boolean;
    email: string | null;
    devices: SmartPlug[];
  }>({
    queryKey: ["/api/meross/status"],
    refetchInterval: 15000,
  });

  const handleMerossLogin = async () => {
    if (!merossEmail.trim() || !merossPassword.trim()) {
      toast.error("Please enter your Meross email and password");
      return;
    }
    setMerossConnecting(true);
    try {
      const res = await apiRequest("POST", "/api/meross/login", {
        email: merossEmail,
        password: merossPassword,
      });
      const data = await res.json();
      toast.success(`Connected! Found ${data.devices?.length || 0} device(s)`);
      setMerossEmail("");
      setMerossPassword("");
      refetchMeross();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to connect to Meross");
    } finally {
      setMerossConnecting(false);
    }
  };

  const handleMerossLogout = async () => {
    try {
      await apiRequest("DELETE", "/api/meross/logout");
      toast.success("Disconnected from Meross");
      refetchMeross();
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleMerossToggle = async (plugId: number, turnOn: boolean) => {
    try {
      await apiRequest("POST", `/api/meross/devices/${plugId}/toggle`, { turnOn });
      refetchMeross();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to toggle plug");
    }
  };

  const { data: printers = [], isLoading } = useQuery<Printer[]>({
    queryKey: ["/api/printers"],
  });

  const { data: settings } = useQuery<SettingsData>({
    queryKey: ["/api/settings"],
  });

  const addPrinterMutation = useMutation({
    mutationFn: async (data: { name: string; ipAddress: string }) => {
      const res = await fetch("/api/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add printer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      setNewPrinterName("");
      setNewPrinterIp("");
      toast.success("Printer added successfully");
    },
    onError: () => {
      toast.error("Failed to add printer");
    },
  });

  const deletePrinterMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/printers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete printer");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      toast.success("Printer removed");
    },
    onError: () => {
      toast.error("Failed to remove printer");
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/printers/${id}/connect`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to connect");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      if (data.requiresConfirmation) {
        toast.info("Please confirm connection on printer touchscreen", {
          duration: 5000,
        });
      } else {
        toast.success("Connected successfully");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to connect to printer");
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/printers/${id}/disconnect`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      toast.success("Disconnected");
    },
    onError: () => {
      toast.error("Failed to disconnect");
    },
  });

  const watchFolderMutation = useMutation({
    mutationFn: async (path: string | null) => {
      const res = await fetch("/api/settings/watch-folder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update watch folder");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success(data.message);
      setWatchFolderPath("");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const lubanProxyMutation = useMutation({
    mutationFn: async (data: { printerIp?: string; enabled: boolean }) => {
      const res = await fetch("/api/settings/luban-proxy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to update Luban proxy");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast.success(data.message);
      setLubanProxyIp("");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleAddPrinter = () => {
    if (!newPrinterName.trim() || !newPrinterIp.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    addPrinterMutation.mutate({
      name: newPrinterName,
      ipAddress: newPrinterIp,
    });
  };

  const handleSetWatchFolder = () => {
    if (!watchFolderPath.trim()) {
      toast.error("Please enter a folder path");
      return;
    }
    watchFolderMutation.mutate(watchFolderPath.trim());
  };

  const handleDisableWatchFolder = () => {
    watchFolderMutation.mutate(null);
  };

  const handleEnableLubanProxy = () => {
    const ip = lubanProxyIp.trim() || (printers.length > 0 ? printers[0].ipAddress : "");
    if (!ip) {
      toast.error("Please enter the printer IP address");
      return;
    }
    lubanProxyMutation.mutate({ printerIp: ip, enabled: true });
  };

  const handleDisableLubanProxy = () => {
    lubanProxyMutation.mutate({ enabled: false });
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-1">
              Configure printers, file upload options, and slicer integration
            </p>
          </div>
        </header>

        <Card className="p-6 bg-secondary/20 border-border">
          <h2 className="text-lg font-semibold mb-4">Add New Printer</h2>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="printer-name">Printer Name</Label>
              <Input
                id="printer-name"
                placeholder="e.g., Snapmaker F350"
                value={newPrinterName}
                onChange={(e) => setNewPrinterName(e.target.value)}
                data-testid="input-printer-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="printer-ip">IP Address</Label>
              <Input
                id="printer-ip"
                placeholder="e.g., 192.168.1.42"
                value={newPrinterIp}
                onChange={(e) => setNewPrinterIp(e.target.value)}
                data-testid="input-printer-ip"
              />
              <p className="text-xs text-muted-foreground">
                Find your printer's IP address on the touchscreen: Settings - Network - Wi-Fi
              </p>
            </div>
            <Button
              onClick={handleAddPrinter}
              disabled={addPrinterMutation.isPending}
              className="w-full md:w-auto"
              data-testid="button-add-printer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Printer
            </Button>
          </div>
        </Card>

        <Separator />

        <div>
          <h2 className="text-lg font-semibold mb-4">Configured Printers</h2>
          {isLoading ? (
            <Card className="p-6 bg-secondary/20 border-border">
              <p className="text-muted-foreground text-center">Loading...</p>
            </Card>
          ) : printers.length === 0 ? (
            <Card className="p-6 bg-secondary/20 border-border">
              <p className="text-muted-foreground text-center" data-testid="text-no-printers">
                No printers configured. Add one above to get started.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {printers.map((printer) => (
                <Card
                  key={printer.id}
                  className="p-4 bg-secondary/20 border-border"
                  data-testid={`card-printer-${printer.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold" data-testid={`text-printer-name-${printer.id}`}>
                        {printer.name}
                      </h3>
                      <p className="text-sm text-muted-foreground" data-testid={`text-printer-ip-${printer.id}`}>
                        {printer.ipAddress}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-2 w-2 rounded-full ${
                              printer.isConnected ? "bg-green-500" : "bg-gray-500"
                            }`}
                            data-testid={`status-connection-${printer.id}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {printer.isConnected ? "Connected" : "Disconnected"}
                          </span>
                        </div>
                        {printer.token && (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-3 w-3 text-green-500" />
                            <span className="text-xs text-green-500">Has Token</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {printer.isConnected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => disconnectMutation.mutate(printer.id)}
                          disabled={disconnectMutation.isPending}
                          data-testid={`button-disconnect-${printer.id}`}
                        >
                          <WifiOff className="h-4 w-4 mr-2" />
                          Disconnect
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => connectMutation.mutate(printer.id)}
                          disabled={connectMutation.isPending}
                          data-testid={`button-connect-${printer.id}`}
                        >
                          <Wifi className="h-4 w-4 mr-2" />
                          Connect
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deletePrinterMutation.mutate(printer.id)}
                        disabled={deletePrinterMutation.isPending}
                        data-testid={`button-delete-${printer.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <Card className="p-6 bg-secondary/20 border-border">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Watch Folder</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Automatically import G-code files saved to a folder on your Raspberry Pi. 
            Great for network shares or when your slicer saves directly to the Pi.
          </p>
          
          {settings?.watchFolder.path ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                {settings.watchFolder.active ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-yellow-500" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {settings.watchFolder.active ? "Watching folder" : "Folder configured (not active)"}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">{settings.watchFolder.path}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisableWatchFolder}
                  disabled={watchFolderMutation.isPending}
                  data-testid="button-disable-watch"
                >
                  Disable
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="watch-folder">Folder Path</Label>
                <Input
                  id="watch-folder"
                  placeholder="/home/pi/gcode"
                  value={watchFolderPath}
                  onChange={(e) => setWatchFolderPath(e.target.value)}
                  data-testid="input-watch-folder"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the full path to a folder on your Raspberry Pi
                </p>
              </div>
              <Button
                onClick={handleSetWatchFolder}
                disabled={watchFolderMutation.isPending || !watchFolderPath.trim()}
                data-testid="button-set-watch-folder"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Enable Watch Folder
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-secondary/20 border-border">
          <div className="flex items-center gap-2 mb-4">
            <ExternalLink className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Slicer Integration</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Configure your slicer (Cura, PrusaSlicer, etc.) to send G-code files directly to this app.
            Use the OctoPrint-compatible endpoint for best compatibility.
          </p>
          
          {settings?.slicerApi && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">OctoPrint-Compatible URL (recommended)</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={settings.slicerApi.octoprintUrl}
                    className="font-mono text-sm"
                    data-testid="input-octoprint-url"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(settings.slicerApi.octoprintUrl, "octoprint")}
                    data-testid="button-copy-octoprint"
                  >
                    {copiedField === "octoprint" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Direct Upload URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={settings.slicerApi.directUrl}
                    className="font-mono text-sm"
                    data-testid="input-direct-url"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(settings.slicerApi.directUrl, "direct")}
                    data-testid="button-copy-direct"
                  >
                    {copiedField === "direct" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <h3 className="font-medium text-sm mb-2 text-blue-400">Setup Instructions</h3>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li><strong>Cura:</strong> Install OctoPrint Connection plugin, set URL to your Pi's address</li>
                  <li><strong>PrusaSlicer:</strong> Printer Settings - Physical Printer - Host Type: OctoPrint</li>
                  <li><strong>Other slicers:</strong> Use OctoPrint upload if available, or POST to the direct URL</li>
                </ul>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-secondary/20 border-border">
          <div className="flex items-center gap-2 mb-4">
            <Radio className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Luban Auto-Capture</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Automatically capture files sent from the Luban app. When enabled, point Luban to this 
            Pi's IP address instead of the printer's IP. Files will be captured and added to your 
            list, then forwarded to the printer.
          </p>
          
          {settings?.lubanProxy.enabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Proxy Active</p>
                  <p className="text-xs text-muted-foreground">
                    Listening on port {settings.lubanProxy.port}, forwarding to {settings.lubanProxy.targetPrinterIp}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisableLubanProxy}
                  disabled={lubanProxyMutation.isPending}
                  data-testid="button-disable-luban-proxy"
                >
                  Disable
                </Button>
              </div>

              {settings.lubanProxy.hasToken ? (
                <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Luban Token Captured</p>
                    <p className="text-xs text-muted-foreground">
                      Your printer will now connect without touchscreen prompts using Luban's credentials.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <Radio className="h-5 w-5 text-yellow-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Waiting for Luban Connection</p>
                    <p className="text-xs text-muted-foreground">
                      Connect through Luban once to capture its token. After that, our app will use the same token for prompt-free connections.
                    </p>
                  </div>
                </div>
              )}
              
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <h3 className="font-medium text-sm mb-2 text-blue-400">How to Use</h3>
                <p className="text-xs text-muted-foreground">
                  In Luban, instead of connecting to <code className="bg-muted px-1 rounded">{settings.lubanProxy.targetPrinterIp}</code>, 
                  connect to this Raspberry Pi's IP address on the same port. Files sent through 
                  Luban will be captured and appear in your file list automatically, and the token 
                  will be saved for prompt-free connections.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="luban-proxy-ip">Printer IP to Forward To</Label>
                <Input
                  id="luban-proxy-ip"
                  placeholder={printers.length > 0 ? printers[0].ipAddress : "e.g., 192.168.1.42"}
                  value={lubanProxyIp}
                  onChange={(e) => setLubanProxyIp(e.target.value)}
                  data-testid="input-luban-proxy-ip"
                />
                <p className="text-xs text-muted-foreground">
                  Your Snapmaker printer's actual IP address. Leave blank to use the first configured printer.
                </p>
              </div>
              <Button
                onClick={handleEnableLubanProxy}
                disabled={lubanProxyMutation.isPending}
                data-testid="button-enable-luban-proxy"
              >
                <Monitor className="h-4 w-4 mr-2" />
                Enable Luban Capture
              </Button>
              
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <h3 className="font-medium text-sm mb-2 text-yellow-400">Note</h3>
                <p className="text-xs text-muted-foreground">
                  This feature only works when running on a Raspberry Pi or computer on the same network as your printer. 
                  It won't work from cloud-hosted environments.
                </p>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-secondary/20 border-border">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">IP Camera</h2>
          </div>
          
          {/* Show connected state or setup form */}
          {cameraSettings?.url || cameraSettings?.rtspUrl || cameraSettings?.mjpegUrl ? (
            <div className="space-y-4">
              {/* Camera Connected - Show Preview */}
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                {cameraSettings?.streamType === "snapshot" && cameraSettings?.url ? (
                  <>
                    <img 
                      src={`/api/camera/snapshot?t=${Date.now()}`}
                      alt="Camera preview"
                      className="w-full h-full object-contain"
                      onError={() => setCameraPreviewError("Could not load camera preview - check camera connection")}
                    />
                    {cameraPreviewError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                        <p className="text-sm text-red-400">{cameraPreviewError}</p>
                      </div>
                    )}
                  </>
                ) : cameraSettings?.streamType === "mjpeg" && cameraSettings?.mjpegUrl ? (
                  <img 
                    src={`/api/camera/mjpeg?t=${Date.now()}`}
                    alt="Camera MJPEG preview"
                    className="w-full h-full object-contain"
                    onError={() => setCameraPreviewError("Could not load MJPEG stream")}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-white font-medium">LIVE</span>
                    </div>
                    <p className="text-gray-400 text-sm">Stream configured</p>
                    <p className="text-gray-500 text-xs mt-1">View on dashboard</p>
                  </div>
                )}
              </div>
              
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-400">Camera Connected</p>
                      <p className="text-xs text-muted-foreground">
                        {cameraSettings?.streamType === "snapshot" ? "Snapshot Mode (1 fps)" : cameraSettings?.streamType === "mjpeg" ? "MJPEG Live Stream" : "RTSP Live Stream"}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearCamera}
                    disabled={cameraMutation.isPending}
                    data-testid="button-disconnect-camera"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Disconnect
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Add a camera to watch your prints in real-time. Just enter your camera's details below.
              </p>
              
              {/* Step 1: Camera IP */}
              <div className="grid gap-2">
                <Label htmlFor="camera-ip" className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                  Camera IP Address
                </Label>
                <Input
                  id="camera-ip"
                  placeholder="192.168.1.50"
                  value={cameraIp}
                  onChange={(e) => setCameraIp(e.target.value)}
                  data-testid="input-camera-ip"
                />
                <p className="text-xs text-muted-foreground">
                  Find this in your camera's app or router settings
                </p>
              </div>
              
              {/* Step 2: Camera Brand */}
              <div className="grid gap-2">
                <Label htmlFor="camera-brand" className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                  Camera Brand
                </Label>
                <select
                  id="camera-brand"
                  value={cameraBrand}
                  onChange={(e) => setCameraBrand(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="select-camera-brand"
                >
                  {CAMERA_BRANDS.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Select "Auto-Detect" if you're not sure
                </p>
              </div>
              
              {/* Step 3: Credentials */}
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                  Camera Login (if required)
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Username"
                    value={cameraUsername}
                    onChange={(e) => setCameraUsername(e.target.value)}
                    data-testid="input-camera-username"
                  />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={cameraPassword}
                    onChange={(e) => setCameraPassword(e.target.value)}
                    data-testid="input-camera-password"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Usually "admin" for username. Leave blank if no login required.
                </p>
              </div>
              
              {/* Connect Button */}
              <Button
                onClick={handleSmartConnect}
                disabled={cameraConnecting || !cameraIp}
                className="w-full h-12 text-base"
                data-testid="button-connect-camera"
              >
                {cameraConnecting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Camera className="h-5 w-5 mr-2" />
                    Connect Camera
                  </>
                )}
              </Button>
              
              {/* Error message */}
              {cameraPreviewError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-400">{cameraPreviewError}</span>
                </div>
              )}
              
              {/* Advanced options toggle */}
              <button
                type="button"
                onClick={() => setShowAdvancedCamera(!showAdvancedCamera)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAdvancedCamera ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Advanced options
              </button>
              
              {showAdvancedCamera && (
                <div className="space-y-4 pl-4 border-l-2 border-muted">
                  <div className="grid gap-2">
                    <Label htmlFor="camera-url">Manual URL (Snapshot or RTSP)</Label>
                    <Input
                      id="camera-url"
                      placeholder="http://... or rtsp://..."
                      value={cameraUrl || cameraRtspUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.startsWith("rtsp://")) {
                          setCameraRtspUrl(val);
                          setCameraUrl("");
                        } else {
                          setCameraUrl(val);
                          setCameraRtspUrl("");
                        }
                      }}
                      data-testid="input-camera-url-manual"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter the full camera URL if auto-connect doesn't work
                    </p>
                  </div>
                  
                  <Button
                    onClick={handleManualConnect}
                    disabled={cameraMutation.isPending || (!cameraUrl && !cameraRtspUrl)}
                    data-testid="button-manual-connect"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Connect Manually
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-6 bg-secondary/20 border-border">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Push Notifications</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Get alerts when prints complete, when the printer disconnects, or comes back online - 
            even when the app is closed or your phone is locked.
          </p>
          
          {!pushSupported ? (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-sm text-yellow-400">
                Push notifications are not supported in this browser. 
                For iOS, add the app to your Home Screen first.
              </p>
            </div>
          ) : !pushStatus?.enabled ? (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-sm text-yellow-400">
                Push notifications are not configured on the server. 
                VAPID keys need to be set in environment variables.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div>
                  <p className="font-medium text-sm">Enable Notifications</p>
                  <p className="text-xs text-muted-foreground">
                    {pushSubscribed 
                      ? "You will receive alerts for print events" 
                      : pushPermission === "denied" 
                        ? "Permission denied - check browser settings"
                        : "Receive alerts even when app is closed"}
                  </p>
                </div>
                <Switch
                  checked={pushSubscribed}
                  onCheckedChange={() => pushSubscribed ? handlePushUnsubscribe() : handlePushSubscribe()}
                  disabled={pushLoading || pushPermission === "denied"}
                  data-testid="switch-push-notifications"
                />
              </div>
              
              {pushSubscribed && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handlePushTest}
                  disabled={pushTestLoading}
                  data-testid="button-test-notification"
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Send Test Notification
                </Button>
              )}
              
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <h3 className="font-medium text-sm mb-2 text-blue-400">Requirements for iOS</h3>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>iOS 16.4 or later</li>
                  <li>HTTPS enabled (certificates installed)</li>
                  <li>App added to Home Screen (not just browser)</li>
                  <li>Notification permission granted</li>
                </ul>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-secondary/20 border-border">
          <div className="flex items-center gap-2 mb-4">
            <Plug className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Smart Plug (Meross)</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Connect your Meross smart plugs to control printer power remotely and automate power-on for scheduled prints.
          </p>

          {merossStatus?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <div>
                    <p className="text-sm font-medium text-green-400">Connected</p>
                    <p className="text-xs text-muted-foreground">{merossStatus.email}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMerossLogout}
                  className="text-destructive border-destructive/50 hover:bg-destructive/10"
                  data-testid="button-meross-logout"
                >
                  Disconnect
                </Button>
              </div>

              {merossStatus.devices && merossStatus.devices.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Discovered Devices</p>
                  {merossStatus.devices.map((plug) => (
                    <div
                      key={plug.id}
                      className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                      data-testid={`card-settings-plug-${plug.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-full ${plug.isOn ? "bg-green-500/20 text-green-400" : "bg-secondary/40 text-muted-foreground"}`}>
                          <Power className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{plug.name}</p>
                          <p className="text-xs text-muted-foreground">{plug.model || "Smart Plug"}</p>
                        </div>
                      </div>
                      <Switch
                        checked={plug.isOn ?? false}
                        onCheckedChange={(checked) => handleMerossToggle(plug.id, checked)}
                        data-testid={`switch-settings-plug-${plug.id}`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No smart plug devices found on your Meross account.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="meross-email" className="text-sm">Meross Account Email</Label>
                <Input
                  id="meross-email"
                  type="email"
                  placeholder="your@email.com"
                  value={merossEmail}
                  onChange={(e) => setMerossEmail(e.target.value)}
                  data-testid="input-meross-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meross-password" className="text-sm">Password</Label>
                <Input
                  id="meross-password"
                  type="password"
                  placeholder="Your Meross password"
                  value={merossPassword}
                  onChange={(e) => setMerossPassword(e.target.value)}
                  data-testid="input-meross-password"
                />
              </div>
              <Button
                onClick={handleMerossLogin}
                disabled={merossConnecting || !merossEmail || !merossPassword}
                className="w-full"
                data-testid="button-meross-connect"
              >
                {merossConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Plug className="h-4 w-4 mr-2" />
                    Connect to Meross
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Your Meross credentials are stored locally and only used to communicate with the Meross cloud service.
              </p>
            </div>
          )}
        </Card>

        <Card className="p-6 bg-blue-500/10 border-blue-500/50">
          <h3 className="font-semibold mb-2 text-blue-400">Connection Instructions</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Add your printer using the form above with its IP address</li>
            <li>Click "Connect" to initiate the connection</li>
            <li>A confirmation dialog will appear on your printer's touchscreen</li>
            <li>Tap "Yes" on the touchscreen to authorize the connection</li>
            <li>Once connected, the status will update and you can access the dashboard</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
