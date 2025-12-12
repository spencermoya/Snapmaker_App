import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useEffect, useState, useCallback, memo } from "react";
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

const AddPrinterForm = memo(function AddPrinterForm({
  onAdd,
  onCancel,
  isPending,
  showCancel,
}: {
  onAdd: (name: string, ip: string) => void;
  onCancel?: () => void;
  isPending: boolean;
  showCancel: boolean;
}) {
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");

  const handleSubmit = () => {
    if (!name.trim() || !ip.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    onAdd(name, ip);
    setName("");
    setIp("");
  };

  return (
    <div className="mb-6 p-4 bg-secondary/30 rounded-lg">
      <h3 className="text-sm font-medium mb-3">Add New Printer</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="printer-name" className="text-xs">Printer Name</Label>
          <Input
            id="printer-name"
            placeholder="e.g., Snapmaker F350"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
            data-testid="input-printer-name"
          />
        </div>
        <div>
          <Label htmlFor="printer-ip" className="text-xs">IP Address</Label>
          <Input
            id="printer-ip"
            placeholder="e.g., 192.168.1.42"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="mt-1"
            data-testid="input-printer-ip"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1"
            data-testid="button-add-printer"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
          {showCancel && onCancel && (
            <Button
              variant="outline"
              onClick={onCancel}
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
  );
});

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const [lastReconnectAttempt, setLastReconnectAttempt] = useState<number>(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);

  const { data: printers = [], isLoading: printersLoading } = useQuery<Printer[]>({
    queryKey: ["/api/printers"],
    refetchInterval: 5000,
  });

  // Use connected printer if available, otherwise use first printer in list
  const activePrinter = printers.find((p) => p.isConnected);
  const selectedPrinter = activePrinter || printers[0];
  const isConnected = !!activePrinter;
  const disconnectedPrinter = printers.find((p) => !p.isConnected && p.token);

  const { data: preferencesData, isLoading: preferencesLoading } = useQuery<{ enabledModules: string[] }>({
    queryKey: [`/api/printers/${selectedPrinter?.id}/dashboard-preferences`],
    enabled: !!selectedPrinter,
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
    if (!selectedPrinter) return;
    
    const newEnabledModules = enabledModules.includes(moduleId)
      ? enabledModules.filter((id) => id !== moduleId)
      : [...enabledModules, moduleId];
    
    updatePreferencesMutation.mutate({
      printerId: selectedPrinter.id,
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

  const handleAddPrinter = useCallback((name: string, ip: string) => {
    addPrinterMutation.mutate({
      name,
      ipAddress: ip,
    });
  }, [addPrinterMutation]);

  const handleCancelAddForm = useCallback(() => {
    setShowAddForm(false);
  }, []);

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
    if (!selectedPrinter || !enabledModules.includes(moduleId)) return null;

    switch (moduleId) {
      case "status":
        return (
          <PrinterStatus 
            key={moduleId}
            status={isConnected ? mapStatus(status?.state || "idle") : "idle"} 
            progress={status?.progress || 0} 
            timeLeft={formatTimeRemaining(status?.timeRemaining || null)} 
            filename={status?.currentFile || (isConnected ? "No active job" : "Printer offline")} 
          />
        );
      case "webcam":
        return <WebcamFeed key={moduleId} />;
      case "temperature":
        return (
          <TemperatureChart 
            key={moduleId}
            nozzleTemp={status?.temperature?.nozzle || 0}
            bedTemp={status?.temperature?.bed || 0}
            targetNozzle={status?.temperature?.targetNozzle || 0}
            targetBed={status?.temperature?.targetBed || 0}
          />
        );
      case "jogControls":
        return <JogControls key={moduleId} printerId={selectedPrinter.id} disabled={!isConnected} />;
      case "jobControls":
        return (
          <Card key={moduleId} className="p-4 bg-secondary/20 border-border">
            <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">Active Job Controls</h3>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="w-full border-yellow-500/50 hover:bg-yellow-500/10 hover:text-yellow-500 text-yellow-500"
                data-testid="button-pause"
                disabled={!isConnected}
              >
                <PauseCircle className="h-4 w-4 mr-2" /> Pause
              </Button>
              <Button
                variant="outline"
                className="w-full border-red-500/50 hover:bg-red-500/10 hover:text-red-500 text-red-500"
                data-testid="button-cancel"
                disabled={!isConnected}
              >
                <StopCircle className="h-4 w-4 mr-2" /> Cancel
              </Button>
            </div>
          </Card>
        );
      case "fileList":
        return <FileList key={moduleId} printerId={selectedPrinter.id} />;
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
        
        {/* Printer Connection Section - Show when no printers exist */}
        {printers.length === 0 && (
          <Card className="p-6 bg-secondary/20 border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">Snapmaker Control</h2>
                <p className="text-sm text-muted-foreground">
                  Add your printer to get started
                </p>
              </div>
            </div>

            {/* Add Printer Form */}
            <AddPrinterForm
              onAdd={handleAddPrinter}
              onCancel={handleCancelAddForm}
              isPending={addPrinterMutation.isPending}
              showCancel={false}
            />
          </Card>
        )}

        {/* Dashboard View - Show when any printer is configured */}
        {selectedPrinter && (
          <>
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                  <span data-testid="text-printer-name">{selectedPrinter.name}</span>
                  <span className={`text-xs font-mono font-normal border px-2 py-0.5 rounded-full ${isConnected ? 'text-muted-foreground' : 'text-amber-500 border-amber-500/50'}`}>
                    {isConnected ? (status?.state || "idle") : "offline"}
                  </span>
                </h1>
                <p className="text-muted-foreground mt-1" data-testid="text-printer-ip">
                  {isConnected ? "Connected via Wi-Fi" : "Not connected"} • {selectedPrinter.ipAddress}
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
                {isConnected ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => disconnectMutation.mutate(selectedPrinter.id)}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-disconnect-header"
                  >
                    <WifiOff className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => connectMutation.mutate(selectedPrinter.id)}
                    disabled={connectMutation.isPending}
                    data-testid="button-connect-header"
                  >
                    <Wifi className="h-4 w-4" />
                  </Button>
                )}
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
