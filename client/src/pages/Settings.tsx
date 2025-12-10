import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Trash2, Wifi, WifiOff, ArrowLeft, FolderOpen, Copy, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import type { Printer } from "@shared/schema";

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
}

export default function Settings() {
  const [, setLocation] = useLocation();
  const [newPrinterName, setNewPrinterName] = useState("");
  const [newPrinterIp, setNewPrinterIp] = useState("");
  const [watchFolderPath, setWatchFolderPath] = useState("");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const queryClient = useQueryClient();

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
                      <div className="flex items-center gap-2 mt-2">
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
