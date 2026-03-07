import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { Power, Wifi, WifiOff, Lightbulb, Fan, PauseCircle, StopCircle, Plus, Thermometer, Flame, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiRequest } from "@/lib/queryClient";
import type { Printer, PrinterStatus as PrinterStatusType, SmartPlug } from "@shared/schema";

export default function StatusPage() {
  const queryClient = useQueryClient();
  const [lightOn, setLightOn] = useState(false);
  const [fanOn, setFanOn] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIp, setNewIp] = useState("");

  const { data: printers = [], isLoading: printersLoading, isSuccess: printersSuccess } = useQuery<Printer[]>({
    queryKey: ["/api/printers"],
    refetchInterval: 5000,
  });

  const activePrinter = printers.find((p) => p.isConnected);
  const selectedPrinter = activePrinter || printers[0];
  const isConnected = !!activePrinter;
  const disconnectedPrinter = printers.find((p) => !p.isConnected && p.token);

  const { data: status } = useQuery<PrinterStatusType>({
    queryKey: [`/api/printers/${activePrinter?.id}/status`],
    enabled: !!activePrinter,
    refetchInterval: 500,
  });

  const { data: merossStatus } = useQuery<{
    connected: boolean;
    email: string | null;
    devices: SmartPlug[];
  }>({
    queryKey: ["/api/meross/status"],
    refetchInterval: 10000,
  });

  const { data: pingResult } = useQuery<{ online: boolean; hasToken: boolean }>({
    queryKey: [`/api/printers/${disconnectedPrinter?.id}/ping`],
    enabled: !!disconnectedPrinter && !activePrinter,
    refetchInterval: 10000,
  });

  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const [lastReconnectAttempt, setLastReconnectAttempt] = useState(0);

  const connectMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/printers/${id}/connect`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to connect");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      if (data.requiresConfirmation) {
        toast.info("Please confirm connection on printer touchscreen, then click Connect again", { duration: 8000 });
      } else {
        toast.success("Connected successfully");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Failed to connect"),
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
    onError: () => toast.error("Failed to disconnect"),
  });

  const autoReconnectMutation = useMutation({
    mutationFn: async (printerId: number) => {
      const res = await fetch(`/api/printers/${printerId}/auto-reconnect`, { method: "POST" });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Reconnected to printer!");
        queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      } else if (data.requiresConfirmation) {
        toast.info("Please confirm on the printer touchscreen, then we'll try again");
      }
      setAutoReconnecting(false);
    },
    onError: () => setAutoReconnecting(false),
  });

  const emergencyStopMutation = useMutation({
    mutationFn: async (printerId: number) => {
      const res = await fetch(`/api/printers/${printerId}/emergency-stop`, { method: "POST" });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => { toast.success("Emergency stop sent!"); queryClient.invalidateQueries({ queryKey: ["/api/printers"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const lightMutation = useMutation({
    mutationFn: async ({ printerId, enabled }: { printerId: number; enabled: boolean }) => {
      const res = await fetch(`/api/printers/${printerId}/light`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { setLightOn(data.enabled); toast.success(data.message); },
    onError: (error: Error) => toast.error(error.message),
  });

  const fanMutation = useMutation({
    mutationFn: async ({ printerId, enabled }: { printerId: number; enabled: boolean }) => {
      const res = await fetch(`/api/printers/${printerId}/fan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => { setFanOn(data.enabled); toast.success(data.message); },
    onError: (error: Error) => toast.error(error.message),
  });

  const togglePlugMutation = useMutation({
    mutationFn: async ({ plugId, turnOn }: { plugId: number; turnOn: boolean }) => {
      const res = await apiRequest("POST", `/api/meross/devices/${plugId}/toggle`, { turnOn });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meross/status"] });
    },
  });

  const addPrinterMutation = useMutation({
    mutationFn: async (data: { name: string; ipAddress: string }) => {
      const res = await fetch("/api/printers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to add printer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/printers"] });
      setShowAddForm(false);
      setNewName("");
      setNewIp("");
      toast.success("Printer added");
    },
    onError: () => toast.error("Failed to add printer"),
  });

  useEffect(() => {
    if (pingResult?.online && disconnectedPrinter && !activePrinter && !autoReconnecting && Date.now() - lastReconnectAttempt > 30000) {
      setAutoReconnecting(true);
      setLastReconnectAttempt(Date.now());
      autoReconnectMutation.mutate(disconnectedPrinter.id);
    }
  }, [pingResult, disconnectedPrinter, activePrinter, autoReconnecting, lastReconnectAttempt]);

  const mapStatus = (state: unknown): "idle" | "printing" | "paused" | "error" => {
    if (!state || typeof state !== "string") return "idle";
    const n = state.toLowerCase();
    if (n.includes("print") || n.includes("working")) return "printing";
    if (n.includes("pause")) return "paused";
    if (n.includes("error") || n.includes("fail")) return "error";
    return "idle";
  };

  const formatTime = (seconds: number | null | undefined): string => {
    if (!seconds) return "--:--";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const calculateETA = (timeRemainingSeconds: number | null | undefined): string => {
    if (!timeRemainingSeconds || timeRemainingSeconds <= 0) return "--:--";
    const eta = new Date(Date.now() + timeRemainingSeconds * 1000);
    return eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case "printing": return "bg-green-500";
      case "paused": return "bg-yellow-500";
      case "error": return "bg-red-500";
      default: return "bg-zinc-500";
    }
  };

  if (printersLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (printersSuccess && printers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold" data-testid="text-welcome">Snapmaker Control</h1>
            <p className="text-muted-foreground mt-2">Add your printer to get started</p>
          </div>
          <div className="space-y-3">
            <div>
              <Label htmlFor="printer-name" className="text-xs">Printer Name</Label>
              <Input id="printer-name" placeholder="e.g., Snapmaker F350" value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="input-printer-name" />
            </div>
            <div>
              <Label htmlFor="printer-ip" className="text-xs">IP Address</Label>
              <Input id="printer-ip" placeholder="e.g., 192.168.1.42" value={newIp} onChange={(e) => setNewIp(e.target.value)} data-testid="input-printer-ip" />
              <p className="text-xs text-muted-foreground mt-1">Find on touchscreen: Settings &gt; Network &gt; Wi-Fi</p>
            </div>
            <Button className="w-full" onClick={() => { if (newName.trim() && newIp.trim()) addPrinterMutation.mutate({ name: newName, ipAddress: newIp }); else toast.error("Fill in all fields"); }} disabled={addPrinterMutation.isPending} data-testid="button-add-printer">
              <Plus className="h-4 w-4 mr-2" /> Add Printer
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedPrinter) return null;

  const printStatus = isConnected ? mapStatus(status?.state) : "idle";
  const progress = status?.progress || 0;
  const isPrinting = printStatus === "printing";

  return (
    <div className="flex flex-col h-full px-4 py-3 space-y-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-lg font-bold truncate" data-testid="text-printer-name">{selectedPrinter.name}</h1>
          {isConnected ? (
            <button
              onClick={() => disconnectMutation.mutate(selectedPrinter.id)}
              disabled={disconnectMutation.isPending}
              className="shrink-0 text-[10px] font-mono border px-2 py-0.5 rounded-full text-green-400 border-green-500/50 hover:bg-green-500/20"
              data-testid="button-disconnect"
            >
              {status?.state && typeof status.state === 'string' && !['204','200','400','401','403'].includes(status.state) ? status.state : "connected"}
            </button>
          ) : (
            <button
              onClick={() => connectMutation.mutate(selectedPrinter.id)}
              disabled={connectMutation.isPending}
              className="shrink-0 text-[10px] font-mono border px-2 py-0.5 rounded-full text-amber-400 border-amber-500/50 hover:bg-amber-500/20"
              data-testid="button-connect"
            >
              {connectMutation.isPending ? "connecting..." : "offline"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className={`h-8 w-8 ${lightOn ? 'text-yellow-400' : 'text-muted-foreground'}`} onClick={() => lightMutation.mutate({ printerId: selectedPrinter.id, enabled: !lightOn })} disabled={!isConnected} data-testid="button-light">
            <Lightbulb className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className={`h-8 w-8 ${fanOn ? 'text-blue-400' : 'text-muted-foreground'}`} onClick={() => fanMutation.mutate({ printerId: selectedPrinter.id, enabled: !fanOn })} disabled={!isConnected} data-testid="button-fan">
            <Fan className={`h-4 w-4 ${fanOn ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card className="p-4 space-y-3 bg-secondary/20 border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(printStatus)}`} />
            <span className="text-sm font-medium uppercase tracking-wide" data-testid="text-status">{printStatus}</span>
          </div>
          <span className="text-2xl font-mono font-bold" data-testid="text-progress">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2.5 bg-secondary" indicatorClassName={getStatusColor(printStatus)} />
        <p className="text-sm text-muted-foreground truncate" data-testid="text-filename">
          {status?.currentFile || (isConnected ? "No active job" : "Printer offline")}
        </p>
        {isPrinting && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Remaining</p>
              <p className="text-sm font-mono" data-testid="text-time-left">{formatTime(status?.timeRemaining)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Elapsed</p>
              <p className="text-sm font-mono" data-testid="text-elapsed">{formatTime(status?.elapsedTime)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">ETA</p>
              <p className="text-sm font-mono" data-testid="text-eta">{calculateETA(status?.timeRemaining)}</p>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 bg-secondary/20 border-border">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Nozzle</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-mono font-bold" data-testid="text-nozzle-temp">
              {status?.temperature?.nozzle?.toFixed(0) || "--"}
            </span>
            <span className="text-xs text-muted-foreground">
              / {status?.temperature?.targetNozzle?.toFixed(0) || "--"}°C
            </span>
          </div>
        </Card>
        <Card className="p-3 bg-secondary/20 border-border">
          <div className="flex items-center gap-2 mb-1">
            <Thermometer className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Bed</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-mono font-bold" data-testid="text-bed-temp">
              {status?.temperature?.bed?.toFixed(0) || "--"}
            </span>
            <span className="text-xs text-muted-foreground">
              / {status?.temperature?.targetBed?.toFixed(0) || "--"}°C
            </span>
          </div>
        </Card>
      </div>

      {merossStatus?.connected && merossStatus.devices?.length > 0 && (
        <Card className="p-3 bg-secondary/20 border-border">
          {merossStatus.devices.map((plug) => (
            <div key={plug.id} className="flex items-center justify-between" data-testid={`card-plug-${plug.id}`}>
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-full ${plug.isOn ? "bg-green-500/20 text-green-400" : "bg-secondary/40 text-muted-foreground"}`}>
                  <Power className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-sm font-medium" data-testid={`text-plug-name-${plug.id}`}>{plug.name}</p>
                  <p className="text-[10px] text-muted-foreground">{plug.isOn ? "ON" : "OFF"}</p>
                </div>
              </div>
              <Switch
                checked={plug.isOn ?? false}
                onCheckedChange={(checked) => togglePlugMutation.mutate({ plugId: plug.id, turnOn: checked })}
                disabled={togglePlugMutation.isPending}
                data-testid={`switch-plug-${plug.id}`}
              />
            </div>
          ))}
        </Card>
      )}

      <div className="flex gap-2 mt-auto pb-1">
        {isPrinting && (
          <>
            <Button variant="outline" className="flex-1 border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10" disabled={!isConnected} data-testid="button-pause">
              <PauseCircle className="h-4 w-4 mr-1.5" /> Pause
            </Button>
            <Button variant="outline" className="flex-1 border-red-500/50 text-red-500 hover:bg-red-500/10" disabled={!isConnected} data-testid="button-cancel">
              <StopCircle className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
          </>
        )}
        <Button
          variant="destructive"
          className="shadow-[0_0_15px_rgba(239,68,68,0.3)] flex-1"
          onClick={() => emergencyStopMutation.mutate(selectedPrinter.id)}
          disabled={!isConnected || emergencyStopMutation.isPending}
          data-testid="button-estop"
        >
          <Power className="h-4 w-4 mr-1.5" /> E-STOP
        </Button>
      </div>
    </div>
  );
}
