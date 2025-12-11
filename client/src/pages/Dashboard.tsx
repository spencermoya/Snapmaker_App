import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useState, useCallback } from "react";
import PrinterStatus from "@/components/PrinterStatus";
import TemperatureChart from "@/components/TemperatureChart";
import JogControls from "@/components/JogControls";
import FileList from "@/components/FileList";
import WebcamFeed from "@/components/WebcamFeed";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Power, Settings, Fan, Lightbulb, PauseCircle, StopCircle, Plus, RefreshCw, Wifi, WifiOff, Trash2, LayoutGrid, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Printer, PrinterStatus as PrinterStatusType } from "@shared/schema";
import { DEFAULT_ENABLED_MODULES } from "@shared/schema";

type ModuleConfig = {
  id: string;
  title: string;
  column: "left" | "right";
};

const MODULE_REGISTRY: ModuleConfig[] = [
  { id: "status", title: "Printer Status", column: "left" },
  { id: "webcam", title: "Camera Feed", column: "left" },
  { id: "temperature", title: "Temperature Chart", column: "left" },
  { id: "jogControls", title: "Jog Controls", column: "right" },
  { id: "jobControls", title: "Job Controls", column: "right" },
  { id: "fileList", title: "File List", column: "right" },
];

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const [lastReconnectAttempt, setLastReconnectAttempt] = useState<number>(0);
  const [newPrinterName, setNewPrinterName] = useState("");
  const [newPrinterIp, setNewPrinterIp] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const { data: printers = [], isLoading: printersLoading } = useQuery<Printer[]>({
    queryKey: ["/api/printers"],
    refetchInterval: showAddForm ? false : 5000,
  });

  const activePrinter = printers.find((p) => p.isConnected);
  const disconnectedPrinter = printers.find((p) => !p.isConnected && p.token);

  const { data: preferencesData, isLoading: preferencesLoading } = useQuery<{ enabledModules: string[] }>({
    queryKey: [`/api/printers/${activePrinter?.id}/dashboard-preferences`],
    enabled: !!activePrinter,
    staleTime: Infinity,
  });

  const enabledModules = preferencesData?.enabledModules ?? DEFAULT_ENABLED_MODULES;

  const updatePreferencesMutation = useMutation({
    mutationFn: async ({ printerId, enabledModules }: { printerId: number; enabledModules: string[] }) => {
      const res = await fetch(`/api/printers/${printerId}/dashboard-preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledModules }),
      });
      if (!res.ok) throw new Error("Failed to save preferences");
      return res.json();
    },
    onMutate: async ({ printerId, enabledModules }) => {
      await queryClient.cancelQueries({ queryKey: [`/api/printers/${printerId}/dashboard-preferences`] });
      const previousData = queryClient.getQueryData([`/api/printers/${printerId}/dashboard-preferences`]);
      queryClient.setQueryData([`/api/printers/${printerId}/dashboard-preferences`], { enabledModules });
      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData([`/api/printers/${variables.printerId}/dashboard-preferences`], context.previousData);
      }
      toast.error("Failed to save preferences");
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${variables.printerId}/dashboard-preferences`] });
    },
  });

  const toggleModule = (moduleId: string) => {
    if (!activePrinter) return;
    
    const newEnabledModules = enabledModules.includes(moduleId)
      ? enabledModules.filter((id) => id !== moduleId)
      : [...enabledModules, moduleId];
    
    updatePreferencesMutation.mutate({
      printerId: activePrinter.id,
      enabledModules: newEnabledModules,
    });
  };

  const { data: pingResult } = useQuery<{ online: boolean; hasToken: boolean }>({
    queryKey: [`/api/printers/${disconnectedPrinter?.id}/ping`],
    enabled: !!disconnectedPrinter && !activePrinter,
    refetchInterval: 10000,
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
      setShowAddForm(false);
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
        toast.info("Please confirm connection on printer touchscreen, then click Connect again", {
          duration: 8000,
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

  const autoReconnectMutation = useMutation({
    mutationFn: async (printerId: number) => {
      const res = await fetch(`/api/printers/${printerId}/auto-reconnect`, {
        method: "POST",
      });
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
    onError: () => {
      setAutoReconnecting(false);
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, printerId }: { file: File; printerId: number }) => {
      const fileContent = await file.text();
      const res = await fetch(`/api/printers/${printerId}/uploaded-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          displayName: file.name.replace(/\.[^/.]+$/, ""),
          fileContent,
          source: "drag-drop",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload file");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast.success("File uploaded successfully!");
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${variables.printerId}/uploaded-files`] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => prev + 1);
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    const files = Array.from(e.dataTransfer.files);
    const gcodeFiles = files.filter((f) => 
      f.name.endsWith(".gcode") || f.name.endsWith(".nc") || f.name.endsWith(".cnc")
    );

    if (gcodeFiles.length === 0) {
      toast.error("Please drop G-code files (.gcode, .nc, .cnc)");
      return;
    }

    // Use connected printer, or fall back to first printer with token, or just first printer
    const printer = printers.find((p) => p.isConnected) 
      || printers.find((p) => p.token) 
      || printers[0];
    
    if (!printer) {
      toast.error("Add a printer in Settings first");
      return;
    }

    gcodeFiles.forEach((file) => {
      uploadFileMutation.mutate({ file, printerId: printer.id });
    });
  }, [printers, uploadFileMutation]);

  useEffect(() => {
    if (
      pingResult?.online &&
      disconnectedPrinter &&
      !activePrinter &&
      !autoReconnecting &&
      Date.now() - lastReconnectAttempt > 30000
    ) {
      setAutoReconnecting(true);
      setLastReconnectAttempt(Date.now());
      autoReconnectMutation.mutate(disconnectedPrinter.id);
    }
  }, [pingResult, disconnectedPrinter, activePrinter, autoReconnecting, lastReconnectAttempt]);

  const { data: status } = useQuery<PrinterStatusType>({
    queryKey: [`/api/printers/${activePrinter?.id}/status`],
    enabled: !!activePrinter,
    refetchInterval: 3000,
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

  if (printersLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const formatTimeRemaining = (seconds: number | null): string => {
    if (!seconds) return "Unknown";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const mapStatus = (state: unknown): "idle" | "printing" | "paused" | "error" => {
    if (!state || typeof state !== "string") return "idle";
    const normalized = state.toLowerCase();
    if (normalized.includes("print") || normalized.includes("working")) return "printing";
    if (normalized.includes("pause")) return "paused";
    if (normalized.includes("error") || normalized.includes("fail")) return "error";
    return "idle";
  };

  const renderModule = (moduleId: string) => {
    if (!activePrinter || !enabledModules.includes(moduleId)) return null;

    switch (moduleId) {
      case "status":
        return (
          <PrinterStatus 
            key={moduleId}
            status={mapStatus(status?.state || "idle")} 
            progress={status?.progress || 0} 
            timeLeft={formatTimeRemaining(status?.timeRemaining || null)} 
            filename={status?.currentFile || "No active job"} 
          />
        );
      case "webcam":
        return <WebcamFeed key={moduleId} />;
      case "temperature":
        return (
          <TemperatureChart 
            key={moduleId}
            nozzleTemp={status?.temperature.nozzle || 0}
            bedTemp={status?.temperature.bed || 0}
            targetNozzle={status?.temperature.targetNozzle || 0}
            targetBed={status?.temperature.targetBed || 0}
          />
        );
      case "jogControls":
        return <JogControls key={moduleId} printerId={activePrinter.id} />;
      case "jobControls":
        return (
          <Card key={moduleId} className="p-4 bg-secondary/20 border-border">
            <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">Active Job Controls</h3>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="w-full border-yellow-500/50 hover:bg-yellow-500/10 hover:text-yellow-500 text-yellow-500"
                data-testid="button-pause"
              >
                <PauseCircle className="h-4 w-4 mr-2" /> Pause
              </Button>
              <Button
                variant="outline"
                className="w-full border-red-500/50 hover:bg-red-500/10 hover:text-red-500 text-red-500"
                data-testid="button-cancel"
              >
                <StopCircle className="h-4 w-4 mr-2" /> Cancel
              </Button>
            </div>
          </Card>
        );
      case "fileList":
        return <FileList key={moduleId} printerId={activePrinter.id} />;
      default:
        return null;
    }
  };

  const leftModules = MODULE_REGISTRY.filter((m) => m.column === "left" && enabledModules.includes(m.id));
  const rightModules = MODULE_REGISTRY.filter((m) => m.column === "right" && enabledModules.includes(m.id));

  return (
    <div 
      className="min-h-screen bg-background p-6 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div 
          className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none"
          data-testid="drop-zone-overlay"
        >
          <div className="bg-background border-2 border-dashed border-primary rounded-xl p-12 text-center">
            <Upload className="h-16 w-16 mx-auto text-primary mb-4" />
            <h2 className="text-2xl font-bold mb-2">Drop G-code Files Here</h2>
            <p className="text-muted-foreground">Release to upload .gcode, .nc, or .cnc files</p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Printer Connection Section - Always at top */}
        {!activePrinter && (
          <Card className="p-6 bg-secondary/20 border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">Snapmaker Control</h2>
                <p className="text-sm text-muted-foreground">
                  {printers.length === 0 
                    ? "Add your printer to get started" 
                    : "Connect to your printer to access controls"}
                </p>
              </div>
              {printers.length > 0 && !showAddForm && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddForm(true)}
                  data-testid="button-show-add-form"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Printer
                </Button>
              )}
            </div>

            {/* Add Printer Form */}
            {(printers.length === 0 || showAddForm) && (
              <div className="mb-6 p-4 bg-secondary/30 rounded-lg">
                <h3 className="text-sm font-medium mb-3">Add New Printer</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label htmlFor="printer-name" className="text-xs">Printer Name</Label>
                    <Input
                      id="printer-name"
                      placeholder="e.g., Snapmaker F350"
                      value={newPrinterName}
                      onChange={(e) => setNewPrinterName(e.target.value)}
                      className="mt-1"
                      data-testid="input-printer-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="printer-ip" className="text-xs">IP Address</Label>
                    <Input
                      id="printer-ip"
                      placeholder="e.g., 192.168.1.42"
                      value={newPrinterIp}
                      onChange={(e) => setNewPrinterIp(e.target.value)}
                      className="mt-1"
                      data-testid="input-printer-ip"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      onClick={handleAddPrinter}
                      disabled={addPrinterMutation.isPending}
                      className="flex-1"
                      data-testid="button-add-printer"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                    {showAddForm && (
                      <Button
                        variant="outline"
                        onClick={() => setShowAddForm(false)}
                        data-testid="button-cancel-add"
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Find your printer's IP on the touchscreen: Settings → Network → Wi-Fi
                </p>
              </div>
            )}

            {/* Printer List */}
            {printers.length > 0 && (
              <div className="space-y-2">
                {printers.map((printer) => (
                  <div
                    key={printer.id}
                    className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
                    data-testid={`card-printer-${printer.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-3 w-3 rounded-full ${
                          printer.isConnected ? "bg-green-500" : "bg-gray-500"
                        }`}
                        data-testid={`status-connection-${printer.id}`}
                      />
                      <div>
                        <p className="font-medium" data-testid={`text-printer-name-${printer.id}`}>
                          {printer.name}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-printer-ip-${printer.id}`}>
                          {printer.ipAddress}
                          {disconnectedPrinter?.id === printer.id && autoReconnecting && (
                            <span className="ml-2 inline-flex items-center gap-1">
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              Reconnecting...
                            </span>
                          )}
                        </p>
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
                ))}
              </div>
            )}

            {/* Connection Instructions */}
            {printers.length > 0 && (
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-blue-400">
                  <strong>Connection tip:</strong> Click Connect, then confirm on your printer's touchscreen, then click Connect again to complete.
                </p>
              </div>
            )}
          </Card>
        )}

        {/* Connected Dashboard View */}
        {activePrinter && (
          <>
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                  <span data-testid="text-printer-name">{activePrinter.name}</span>
                  <span className="text-xs font-mono font-normal text-muted-foreground border px-2 py-0.5 rounded-full">
                    {status?.state || "idle"}
                  </span>
                </h1>
                <p className="text-muted-foreground mt-1" data-testid="text-printer-ip">
                  Connected via Wi-Fi • {activePrinter.ipAddress}
                </p>
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-light"
                >
                  <Lightbulb className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-fan"
                >
                  <Fan className="h-4 w-4" />
                </Button>
                <Sheet open={customizeOpen} onOpenChange={setCustomizeOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
                      data-testid="button-customize"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent>
                    <SheetHeader>
                      <SheetTitle>Customize Dashboard</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Toggle modules on or off to customize your dashboard view.
                      </p>
                      <div className="space-y-3">
                        {MODULE_REGISTRY.map((module) => (
                          <div
                            key={module.id}
                            className="flex items-center justify-between p-3 bg-secondary/20 rounded-lg"
                          >
                            <div>
                              <p className="font-medium text-sm">{module.title}</p>
                              <p className="text-xs text-muted-foreground capitalize">{module.column} column</p>
                            </div>
                            <Switch
                              checked={enabledModules.includes(module.id)}
                              onCheckedChange={() => toggleModule(module.id)}
                              disabled={updatePreferencesMutation.isPending}
                              data-testid={`switch-module-${module.id}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => disconnectMutation.mutate(activePrinter.id)}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect-header"
                >
                  <WifiOff className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setLocation("/settings")}
                  data-testid="button-settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="h-9" />
                <Button
                  variant="destructive"
                  className="shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                  data-testid="button-estop"
                >
                  <Power className="h-4 w-4 mr-2" /> E-STOP
                </Button>
              </div>
            </header>

            {/* Main Grid - Dynamic based on enabled modules */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column */}
              {leftModules.length > 0 && (
                <div className="lg:col-span-2 space-y-6">
                  {leftModules.some((m) => m.id === "status" || m.id === "webcam") && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {renderModule("status")}
                      {renderModule("webcam")}
                    </div>
                  )}
                  {renderModule("temperature")}
                </div>
              )}

              {/* Right Column */}
              {rightModules.length > 0 && (
                <div className="space-y-6">
                  {renderModule("jogControls")}
                  {renderModule("jobControls")}
                  {renderModule("fileList")}
                </div>
              )}

            </div>

            {/* Empty state if all modules are disabled */}
            {leftModules.length === 0 && rightModules.length === 0 && (
              <Card className="p-8 bg-secondary/20 border-border text-center">
                <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No modules enabled</h3>
                <p className="text-muted-foreground mb-4">
                  Click the customize button in the header to enable dashboard modules.
                </p>
                <Button onClick={() => setCustomizeOpen(true)} data-testid="button-open-customize">
                  <LayoutGrid className="h-4 w-4 mr-2" />
                  Customize Dashboard
                </Button>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
