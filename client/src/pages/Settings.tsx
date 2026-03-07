import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Wifi, WifiOff, FolderOpen, Copy, CheckCircle, XCircle, ExternalLink, Monitor, Radio, Bell, Camera, Loader2, ChevronDown, ChevronUp, Plug, Power } from "lucide-react";
import type { Printer, SmartPlug } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface SettingsData {
  watchFolder: { path: string | null; active: boolean };
  slicerApi: { octoprintUrl: string; directUrl: string; configUrl: string };
  lubanProxy: { enabled: boolean; port: number; targetPrinterIp: string | null; hasToken: boolean };
}

interface PushStatus { enabled: boolean; publicKey: string | null }

interface CameraSettings {
  url: string | null; rtspUrl: string | null; mjpegUrl: string | null;
  username: string | null; password: string | null; refreshRate: number; streamType: string;
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [newPrinterName, setNewPrinterName] = useState("");
  const [newPrinterIp, setNewPrinterIp] = useState("");
  const [watchFolderPath, setWatchFolderPath] = useState("");
  const [lubanProxyIp, setLubanProxyIp] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
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

  const { data: pushStatus } = useQuery<PushStatus>({ queryKey: ["/api/push/status"], staleTime: Infinity });
  const { data: cameraSettings } = useQuery<CameraSettings>({ queryKey: ["/api/settings/camera"], staleTime: 30000 });
  const { data: printers = [], isLoading } = useQuery<Printer[]>({ queryKey: ["/api/printers"] });
  const { data: settings } = useQuery<SettingsData>({ queryKey: ["/api/settings"] });
  const { data: merossStatus, refetch: refetchMeross } = useQuery<{ connected: boolean; email: string | null; devices: SmartPlug[] }>({ queryKey: ["/api/meross/status"], refetchInterval: 15000 });

  useEffect(() => {
    if (cameraSettings) {
      setCameraUrl(cameraSettings.url || "");
      setCameraRtspUrl(cameraSettings.rtspUrl || "");
      setCameraMjpegUrl(cameraSettings.mjpegUrl || "");
      setCameraUsername(cameraSettings.username || "");
      setCameraPassword(cameraSettings.password === "***" ? "" : (cameraSettings.password || ""));
      setCameraRefreshRate(cameraSettings.refreshRate || 1000);
      const st = cameraSettings.streamType;
      if (st === "mjpeg" || st === "rtsp" || st === "snapshot") setCameraMode(st);
      else if (cameraSettings.mjpegUrl) setCameraMode("mjpeg");
      else if (cameraSettings.rtspUrl) setCameraMode("rtsp");
      else if (cameraSettings.url) setCameraMode("snapshot");
      const urlToParse = cameraSettings.mjpegUrl || cameraSettings.url || cameraSettings.rtspUrl;
      if (urlToParse) {
        try { setCameraIp(new URL(urlToParse).hostname); } catch { setCameraIp(""); }
      }
    }
  }, [cameraSettings]);

  const saveCameraSettings = async (data: { url: string; rtspUrl?: string; mjpegUrl?: string; username: string; password: string; refreshRate: number; streamType?: string; clearPassword?: boolean }) => {
    const response = await fetch("/api/settings/camera", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!response.ok) throw new Error("Failed to save camera settings");
    queryClient.invalidateQueries({ queryKey: ["/api/settings/camera"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stream/status"] });
    return response.json();
  };

  const cameraMutation = useMutation({
    mutationFn: saveCameraSettings,
    onSuccess: () => toast.success("Camera settings saved"),
    onError: () => toast.error("Failed to save camera settings"),
  });

  const handleSaveCameraSettings = () => {
    cameraMutation.mutate({ url: cameraUrl || "", rtspUrl: cameraRtspUrl || "", mjpegUrl: cameraMjpegUrl || "", username: cameraUsername, password: cameraPassword, refreshRate: cameraRefreshRate, streamType: cameraMode });
  };

  const handleClearCamera = async () => {
    try { await fetch("/api/stream/stop", { method: "POST" }); } catch {}
    cameraMutation.mutate({ url: "", rtspUrl: "", mjpegUrl: "", username: "", password: "", refreshRate: 1000, streamType: "mjpeg", clearPassword: true });
    setCameraUrl(""); setCameraRtspUrl(""); setCameraMjpegUrl(""); setCameraIp(""); setCameraUsername(""); setCameraPassword(""); setCameraRefreshRate(1000); setCameraDetectedBrand(null); setCameraMode("mjpeg");
  };

  const handleSmartConnect = async () => {
    if (!cameraIp) { toast.error("Please enter the camera's IP address"); return; }
    setCameraConnecting(true); setCameraPreviewError(null); setCameraDetectedBrand(null);
    try {
      const selectedBrand = CAMERA_BRANDS.find(b => b.id === cameraBrand);
      if (cameraBrand === "auto") {
        const response = await fetch("/api/camera/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip: cameraIp, username: cameraUsername, password: cameraPassword }) });
        const data = await response.json();
        if (response.ok && data.success) {
          try { await saveCameraSettings({ url: data.url, username: cameraUsername, password: cameraPassword, refreshRate: 1000 }); setCameraDetectedBrand(data.brand); toast.success(`Connected to ${data.brand} camera!`); } catch { toast.error("Failed to save camera settings"); }
        } else { setCameraPreviewError(data.error || "Could not detect camera. Try selecting your camera brand manually."); }
      } else if (selectedBrand) {
        const authPart = cameraUsername && cameraPassword ? `${cameraUsername}:${cameraPassword}@` : (cameraUsername ? `${cameraUsername}@` : "");
        const snapshotUrl = selectedBrand.snapshot ? `http://${cameraIp}${selectedBrand.snapshot}` : "";
        const rtspUrl = selectedBrand.rtsp ? `rtsp://${authPart}${cameraIp}:554${selectedBrand.rtsp}` : "";
        const mjpegUrl = selectedBrand.mjpeg ? `http://${cameraIp}${selectedBrand.mjpeg}` : "";
        const testResponse = await fetch("/api/camera/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ip: cameraIp, snapshotUrl: snapshotUrl || undefined, mjpegUrl: mjpegUrl || undefined, username: cameraUsername, password: cameraPassword }) });
        const testData = await testResponse.json();
        const streamType = testData.recommendedMode || (snapshotUrl ? "snapshot" : (mjpegUrl ? "mjpeg" : "rtsp"));
        try {
          await saveCameraSettings({ url: snapshotUrl, rtspUrl, mjpegUrl, username: cameraUsername, password: cameraPassword, refreshRate: 1000, streamType });
          setCameraDetectedBrand(selectedBrand.name);
          if (testData.reachable) { toast.success(`${selectedBrand.name} camera connected! Using ${streamType === "snapshot" ? "Snapshot" : streamType === "mjpeg" ? "MJPEG Live" : "RTSP"} mode.`); }
          else { const err = testData.results?.[0]?.error || "Could not reach camera"; setCameraPreviewError(`Settings saved but camera test failed: ${err}`); toast.error(`Settings saved but test failed: ${err}`); }
        } catch { toast.error("Failed to save camera settings"); }
      }
    } catch { setCameraPreviewError("Failed to connect to camera. Please check the IP address."); }
    finally { setCameraConnecting(false); }
  };

  const handleManualConnect = () => {
    const url = cameraUrl || cameraRtspUrl;
    if (!url) { toast.error("Please enter a camera URL"); return; }
    if (url.startsWith("rtsp://")) { cameraMutation.mutate({ url: "", rtspUrl: url, username: cameraUsername, password: cameraPassword, refreshRate: 1000 }); }
    else { cameraMutation.mutate({ url, rtspUrl: "", username: cameraUsername, password: cameraPassword, refreshRate: 1000 }); }
  };

  const checkPushSubscription = useCallback(async () => {
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setPushSubscribed(!!subscription);
      }
    } catch (error) { console.error("Error checking push subscription:", error); }
  }, []);

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(supported);
    if (supported) { setPushPermission(Notification.permission); checkPushSubscription(); }
  }, [checkPushSubscription]);

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  };

  const handlePushSubscribe = async () => {
    if (!pushStatus?.publicKey) { toast.error("Push notifications not configured on server"); return; }
    setPushLoading(true);
    try {
      const perm = await Notification.requestPermission(); setPushPermission(perm);
      if (perm !== "granted") { toast.error("Notification permission denied"); return; }
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) { try { await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existingSub.endpoint }) }); } catch {} await existingSub.unsubscribe(); }
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(pushStatus.publicKey) });
      const response = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error("Failed to save subscription");
      await checkPushSubscription(); toast.success("Push notifications enabled!");
    } catch (error) { console.error("Push subscribe error:", error); toast.error("Failed to enable notifications"); await checkPushSubscription(); }
    finally { setPushLoading(false); }
  };

  const handlePushUnsubscribe = async () => {
    setPushLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) { await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) }); await subscription.unsubscribe(); }
      await checkPushSubscription(); toast.success("Push notifications disabled");
    } catch { toast.error("Failed to disable notifications"); await checkPushSubscription(); }
    finally { setPushLoading(false); }
  };

  const handlePushTest = async () => {
    setPushTestLoading(true);
    try {
      const response = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!response.ok) throw new Error("Failed to send test notification");
      const data = await response.json();
      if (data.sent > 0) toast.success("Test notification sent!");
      else if (data.failed > 0) toast.error("Notification failed to deliver");
      else toast.error("No subscriptions found - try toggling notifications off and on");
    } catch { toast.error("Failed to send test notification"); }
    finally { setPushTestLoading(false); }
  };

  const handleMerossLogin = async () => {
    if (!merossEmail.trim() || !merossPassword.trim()) { toast.error("Please enter your Meross email and password"); return; }
    setMerossConnecting(true);
    try {
      const res = await apiRequest("POST", "/api/meross/login", { email: merossEmail, password: merossPassword });
      const data = await res.json();
      toast.success(`Connected! Found ${data.devices?.length || 0} device(s)`); setMerossEmail(""); setMerossPassword(""); refetchMeross();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to connect to Meross"); }
    finally { setMerossConnecting(false); }
  };

  const handleMerossLogout = async () => {
    try { await apiRequest("DELETE", "/api/meross/logout"); toast.success("Disconnected from Meross"); refetchMeross(); } catch { toast.error("Failed to disconnect"); }
  };

  const handleMerossToggle = async (plugId: number, turnOn: boolean) => {
    try { await apiRequest("POST", `/api/meross/devices/${plugId}/toggle`, { turnOn }); refetchMeross(); } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to toggle plug"); }
  };

  const addPrinterMutation = useMutation({
    mutationFn: async (data: { name: string; ipAddress: string }) => {
      const res = await fetch("/api/printers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to add printer"); return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/printers"] }); setNewPrinterName(""); setNewPrinterIp(""); toast.success("Printer added successfully"); },
    onError: () => toast.error("Failed to add printer"),
  });

  const deletePrinterMutation = useMutation({
    mutationFn: async (id: number) => { const res = await fetch(`/api/printers/${id}`, { method: "DELETE" }); if (!res.ok) throw new Error("Failed to delete printer"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/printers"] }); toast.success("Printer removed"); },
    onError: () => toast.error("Failed to remove printer"),
  });

  const connectMutation = useMutation({
    mutationFn: async (id: number) => { const res = await fetch(`/api/printers/${id}/connect`, { method: "POST" }); if (!res.ok) throw new Error("Failed to connect"); return res.json(); },
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["/api/printers"] }); if (data.requiresConfirmation) toast.info("Please confirm connection on printer touchscreen", { duration: 5000 }); else toast.success("Connected successfully"); },
    onError: (error: Error) => toast.error(error.message || "Failed to connect to printer"),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: number) => { const res = await fetch(`/api/printers/${id}/disconnect`, { method: "POST" }); if (!res.ok) throw new Error("Failed to disconnect"); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/printers"] }); toast.success("Disconnected"); },
    onError: () => toast.error("Failed to disconnect"),
  });

  const watchFolderMutation = useMutation({
    mutationFn: async (path: string | null) => {
      const res = await fetch("/api/settings/watch-folder", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed to update watch folder"); } return res.json();
    },
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["/api/settings"] }); toast.success(data.message); setWatchFolderPath(""); },
    onError: (error: Error) => toast.error(error.message),
  });

  const lubanProxyMutation = useMutation({
    mutationFn: async (data: { printerIp?: string; enabled: boolean }) => {
      const res = await fetch("/api/settings/luban-proxy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) { const errData = await res.json(); throw new Error(errData.error || "Failed to update Luban proxy"); } return res.json();
    },
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ["/api/settings"] }); toast.success(data.message); setLubanProxyIp(""); },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleAddPrinter = () => {
    if (!newPrinterName.trim() || !newPrinterIp.trim()) { toast.error("Please fill in all fields"); return; }
    addPrinterMutation.mutate({ name: newPrinterName, ipAddress: newPrinterIp });
  };

  const copyToClipboard = async (text: string, field: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedField(field); toast.success("Copied to clipboard"); setTimeout(() => setCopiedField(null), 2000); } catch { toast.error("Failed to copy"); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <h1 className="text-xl font-bold" data-testid="text-settings-title">Settings</h1>
      </div>

      <Tabs defaultValue="printer" className="flex-1 flex flex-col overflow-hidden px-4">
        <TabsList data-testid="settings-tabs">
          <TabsTrigger value="printer" data-testid="tab-printer">Printer</TabsTrigger>
          <TabsTrigger value="camera" data-testid="tab-camera">Camera</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">More</TabsTrigger>
        </TabsList>

        <TabsContent value="printer" className="flex-1 overflow-y-auto space-y-4 pb-4">
          <Card className="p-4 bg-secondary/20 border-border">
            <h2 className="text-sm font-semibold mb-3">Add New Printer</h2>
            <div className="space-y-2">
              <div>
                <Label htmlFor="printer-name" className="text-xs">Printer Name</Label>
                <Input id="printer-name" placeholder="e.g., Snapmaker F350" value={newPrinterName} onChange={(e) => setNewPrinterName(e.target.value)} data-testid="input-printer-name" />
              </div>
              <div>
                <Label htmlFor="printer-ip" className="text-xs">IP Address</Label>
                <Input id="printer-ip" placeholder="e.g., 192.168.1.42" value={newPrinterIp} onChange={(e) => setNewPrinterIp(e.target.value)} data-testid="input-printer-ip" />
                <p className="text-[10px] text-muted-foreground mt-1">Touchscreen: Settings &gt; Network &gt; Wi-Fi</p>
              </div>
              <Button onClick={handleAddPrinter} disabled={addPrinterMutation.isPending} className="w-full" size="sm" data-testid="button-add-printer">
                <Plus className="h-4 w-4 mr-2" /> Add Printer
              </Button>
            </div>
          </Card>

          {isLoading ? (
            <p className="text-muted-foreground text-center text-sm">Loading...</p>
          ) : printers.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm" data-testid="text-no-printers">No printers configured yet.</p>
          ) : (
            <div className="space-y-2">
              {printers.map((printer) => (
                <Card key={printer.id} className="p-3 bg-secondary/20 border-border" data-testid={`card-printer-${printer.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate" data-testid={`text-printer-name-${printer.id}`}>{printer.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground" data-testid={`text-printer-ip-${printer.id}`}>{printer.ipAddress}</span>
                        <div className={`h-1.5 w-1.5 rounded-full ${printer.isConnected ? "bg-green-500" : "bg-gray-500"}`} data-testid={`status-connection-${printer.id}`} />
                        {printer.token && <CheckCircle className="h-3 w-3 text-green-500" />}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {printer.isConnected ? (
                        <Button variant="outline" size="sm" onClick={() => disconnectMutation.mutate(printer.id)} disabled={disconnectMutation.isPending} data-testid={`button-disconnect-${printer.id}`}>
                          <WifiOff className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => connectMutation.mutate(printer.id)} disabled={connectMutation.isPending} data-testid={`button-connect-${printer.id}`}>
                          <Wifi className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => deletePrinterMutation.mutate(printer.id)} disabled={deletePrinterMutation.isPending} data-testid={`button-delete-${printer.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="camera" className="flex-1 overflow-y-auto space-y-4 pb-4">
          {cameraSettings?.url || cameraSettings?.rtspUrl || cameraSettings?.mjpegUrl ? (
            <Card className="p-4 bg-secondary/20 border-border space-y-3">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                {cameraSettings?.streamType === "snapshot" && cameraSettings?.url ? (
                  <img src={`/api/camera/snapshot?t=${Date.now()}`} alt="Camera preview" className="w-full h-full object-contain" onError={() => setCameraPreviewError("Could not load camera preview")} />
                ) : cameraSettings?.streamType === "mjpeg" && cameraSettings?.mjpegUrl ? (
                  <img src={`/api/camera/mjpeg?t=${Date.now()}`} alt="Camera MJPEG preview" className="w-full h-full object-contain" onError={() => setCameraPreviewError("Could not load MJPEG stream")} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black">
                    <div className="flex items-center gap-2 mb-2"><div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" /><span className="text-white font-medium">LIVE</span></div>
                    <p className="text-gray-400 text-sm">Stream configured</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-xs font-medium text-green-400">Camera Connected</p>
                    <p className="text-[10px] text-muted-foreground">{cameraSettings?.streamType === "snapshot" ? "Snapshot" : cameraSettings?.streamType === "mjpeg" ? "MJPEG" : "RTSP"}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleClearCamera} disabled={cameraMutation.isPending} data-testid="button-disconnect-camera">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-4 bg-secondary/20 border-border space-y-3">
              <p className="text-sm text-muted-foreground">Add a camera to watch prints in real-time.</p>
              <div>
                <Label htmlFor="camera-ip" className="text-xs">Camera IP Address</Label>
                <Input id="camera-ip" placeholder="192.168.1.50" value={cameraIp} onChange={(e) => setCameraIp(e.target.value)} data-testid="input-camera-ip" />
              </div>
              <div>
                <Label htmlFor="camera-brand" className="text-xs">Camera Brand</Label>
                <select id="camera-brand" value={cameraBrand} onChange={(e) => setCameraBrand(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" data-testid="select-camera-brand">
                  {CAMERA_BRANDS.map((brand) => (<option key={brand.id} value={brand.id}>{brand.name}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Username" value={cameraUsername} onChange={(e) => setCameraUsername(e.target.value)} data-testid="input-camera-username" />
                <Input type="password" placeholder="Password" value={cameraPassword} onChange={(e) => setCameraPassword(e.target.value)} data-testid="input-camera-password" />
              </div>
              <Button onClick={handleSmartConnect} disabled={cameraConnecting || !cameraIp} className="w-full" data-testid="button-connect-camera">
                {cameraConnecting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>) : (<><Camera className="h-4 w-4 mr-2" />Connect Camera</>)}
              </Button>
              {cameraPreviewError && (
                <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  <span className="text-xs text-red-400">{cameraPreviewError}</span>
                </div>
              )}
              <button type="button" onClick={() => setShowAdvancedCamera(!showAdvancedCamera)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {showAdvancedCamera ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Advanced options
              </button>
              {showAdvancedCamera && (
                <div className="space-y-3 pl-3 border-l-2 border-muted">
                  <div>
                    <Label htmlFor="camera-url" className="text-xs">Manual URL</Label>
                    <Input id="camera-url" placeholder="http://... or rtsp://..." value={cameraUrl || cameraRtspUrl} onChange={(e) => { const val = e.target.value; if (val.startsWith("rtsp://")) { setCameraRtspUrl(val); setCameraUrl(""); } else { setCameraUrl(val); setCameraRtspUrl(""); }}} data-testid="input-camera-url-manual" />
                  </div>
                  <Button size="sm" onClick={handleManualConnect} disabled={cameraMutation.isPending || (!cameraUrl && !cameraRtspUrl)} data-testid="button-manual-connect">
                    <Camera className="h-3.5 w-3.5 mr-1.5" /> Connect Manually
                  </Button>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="integrations" className="flex-1 overflow-y-auto space-y-4 pb-4">
          <Card className="p-4 bg-secondary/20 border-border space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Push Notifications</h2>
            </div>
            {!pushSupported ? (
              <p className="text-xs text-yellow-400 p-2 bg-yellow-500/10 rounded">Not supported in this browser. For iOS, add to Home Screen first.</p>
            ) : !pushStatus?.enabled ? (
              <p className="text-xs text-yellow-400 p-2 bg-yellow-500/10 rounded">Not configured on server. VAPID keys needed.</p>
            ) : (
              <>
                <div className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">Enable Notifications</p>
                    <p className="text-[10px] text-muted-foreground">{pushSubscribed ? "Active" : pushPermission === "denied" ? "Permission denied" : "Get alerts when app is closed"}</p>
                  </div>
                  <Switch checked={pushSubscribed} onCheckedChange={() => pushSubscribed ? handlePushUnsubscribe() : handlePushSubscribe()} disabled={pushLoading || pushPermission === "denied"} data-testid="switch-push-notifications" />
                </div>
                {pushSubscribed && (
                  <Button variant="outline" size="sm" className="w-full" onClick={handlePushTest} disabled={pushTestLoading} data-testid="button-test-notification">
                    <Bell className="h-3.5 w-3.5 mr-1.5" /> Send Test
                  </Button>
                )}
              </>
            )}
          </Card>

          <Card className="p-4 bg-secondary/20 border-border space-y-3">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Smart Plug (Meross)</h2>
            </div>
            {merossStatus?.connected ? (
              <>
                <div className="flex items-center justify-between p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                    <div>
                      <p className="text-xs font-medium text-green-400">Connected</p>
                      <p className="text-[10px] text-muted-foreground">{merossStatus.email}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleMerossLogout} className="text-destructive border-destructive/50 hover:bg-destructive/10 text-xs" data-testid="button-meross-logout">Disconnect</Button>
                </div>
                {merossStatus.devices?.map((plug) => (
                  <div key={plug.id} className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg" data-testid={`card-settings-plug-${plug.id}`}>
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded-full ${plug.isOn ? "bg-green-500/20 text-green-400" : "bg-secondary/40 text-muted-foreground"}`}><Power className="h-3 w-3" /></div>
                      <div><p className="text-sm font-medium">{plug.name}</p><p className="text-[10px] text-muted-foreground">{plug.model || "Smart Plug"}</p></div>
                    </div>
                    <Switch checked={plug.isOn ?? false} onCheckedChange={(checked) => handleMerossToggle(plug.id, checked)} data-testid={`switch-settings-plug-${plug.id}`} />
                  </div>
                ))}
              </>
            ) : (
              <div className="space-y-2">
                <Input type="email" placeholder="Meross email" value={merossEmail} onChange={(e) => setMerossEmail(e.target.value)} data-testid="input-meross-email" />
                <Input type="password" placeholder="Meross password" value={merossPassword} onChange={(e) => setMerossPassword(e.target.value)} data-testid="input-meross-password" />
                <Button onClick={handleMerossLogin} disabled={merossConnecting || !merossEmail || !merossPassword} className="w-full" size="sm" data-testid="button-meross-connect">
                  {merossConnecting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>) : (<><Plug className="h-4 w-4 mr-2" />Connect</>)}
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4 bg-secondary/20 border-border space-y-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Watch Folder</h2>
            </div>
            <p className="text-xs text-muted-foreground">Auto-import G-code files from a folder on your Pi.</p>
            {settings?.watchFolder.path ? (
              <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                {settings.watchFolder.active ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-yellow-500 shrink-0" />}
                <p className="text-xs font-mono flex-1 truncate">{settings.watchFolder.path}</p>
                <Button variant="outline" size="sm" onClick={() => watchFolderMutation.mutate(null)} disabled={watchFolderMutation.isPending} data-testid="button-disable-watch">Disable</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input placeholder="/home/pi/gcode" value={watchFolderPath} onChange={(e) => setWatchFolderPath(e.target.value)} data-testid="input-watch-folder" />
                <Button size="sm" onClick={() => { if (watchFolderPath.trim()) watchFolderMutation.mutate(watchFolderPath.trim()); else toast.error("Enter a folder path"); }} disabled={watchFolderMutation.isPending} data-testid="button-set-watch-folder">
                  <FolderOpen className="h-3.5 w-3.5 mr-1.5" /> Enable
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4 bg-secondary/20 border-border space-y-3">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Slicer Integration</h2>
            </div>
            {settings?.slicerApi && (
              <>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">OctoPrint URL</Label>
                  <div className="flex gap-1.5">
                    <Input readOnly value={settings.slicerApi.octoprintUrl} className="font-mono text-xs" data-testid="input-octoprint-url" />
                    <Button variant="outline" size="icon" className="shrink-0 h-9 w-9" onClick={() => copyToClipboard(settings.slicerApi.octoprintUrl, "octoprint")} data-testid="button-copy-octoprint">
                      {copiedField === "octoprint" ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Direct Upload URL</Label>
                  <div className="flex gap-1.5">
                    <Input readOnly value={settings.slicerApi.directUrl} className="font-mono text-xs" data-testid="input-direct-url" />
                    <Button variant="outline" size="icon" className="shrink-0 h-9 w-9" onClick={() => copyToClipboard(settings.slicerApi.directUrl, "direct")} data-testid="button-copy-direct">
                      {copiedField === "direct" ? <CheckCircle className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>

          <Card className="p-4 bg-secondary/20 border-border space-y-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Luban Auto-Capture</h2>
            </div>
            <p className="text-xs text-muted-foreground">Capture files from Luban app and token for prompt-free connections.</p>
            {settings?.lubanProxy.enabled ? (
              <>
                <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-medium">Active</p>
                    <p className="text-[10px] text-muted-foreground">Port {settings.lubanProxy.port} → {settings.lubanProxy.targetPrinterIp}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => lubanProxyMutation.mutate({ enabled: false })} disabled={lubanProxyMutation.isPending} data-testid="button-disable-luban-proxy">Disable</Button>
                </div>
                {settings.lubanProxy.hasToken ? (
                  <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    <p className="text-xs text-green-400">Luban token captured</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                    <Radio className="h-3.5 w-3.5 text-yellow-500" />
                    <p className="text-xs text-yellow-400">Waiting for Luban connection...</p>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <Input placeholder={printers.length > 0 ? printers[0].ipAddress : "Printer IP"} value={lubanProxyIp} onChange={(e) => setLubanProxyIp(e.target.value)} data-testid="input-luban-proxy-ip" />
                <Button size="sm" onClick={() => { const ip = lubanProxyIp.trim() || (printers.length > 0 ? printers[0].ipAddress : ""); if (!ip) { toast.error("Enter printer IP"); return; } lubanProxyMutation.mutate({ printerIp: ip, enabled: true }); }} disabled={lubanProxyMutation.isPending} data-testid="button-enable-luban-proxy">
                  <Monitor className="h-3.5 w-3.5 mr-1.5" /> Enable
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
