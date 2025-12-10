import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import PrinterStatus from "@/components/PrinterStatus";
import TemperatureChart from "@/components/TemperatureChart";
import JogControls from "@/components/JogControls";
import FileList from "@/components/FileList";
import WebcamFeed from "@/components/WebcamFeed";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Power, Settings, Fan, Lightbulb, PauseCircle, StopCircle, Plus } from "lucide-react";
import type { Printer, PrinterStatus as PrinterStatusType } from "@shared/schema";

export default function Dashboard() {
  const [, setLocation] = useLocation();

  const { data: printers = [], isLoading: printersLoading } = useQuery<Printer[]>({
    queryKey: ["/api/printers"],
    refetchInterval: 5000,
  });

  const activePrinter = printers.find((p) => p.isConnected);

  const { data: status, isLoading: statusLoading } = useQuery<PrinterStatusType>({
    queryKey: [`/api/printers/${activePrinter?.id}/status`],
    enabled: !!activePrinter,
    refetchInterval: 3000,
  });

  if (printersLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (printers.length === 0) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto space-y-6 pt-20">
          <Card className="p-8 bg-secondary/20 border-border text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Plus className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold" data-testid="text-no-printers-title">
              No Printers Configured
            </h2>
            <p className="text-muted-foreground">
              Get started by adding your Snapmaker printer. You'll need your printer's IP address
              from the touchscreen.
            </p>
            <Button
              onClick={() => setLocation("/settings")}
              size="lg"
              className="mt-4"
              data-testid="button-add-first-printer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Printer
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  if (!activePrinter) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto space-y-6 pt-20">
          <Card className="p-8 bg-secondary/20 border-border text-center space-y-4">
            <h2 className="text-2xl font-bold" data-testid="text-no-connection-title">
              No Active Connection
            </h2>
            <p className="text-muted-foreground">
              You have {printers.length} printer{printers.length > 1 ? "s" : ""} configured, but
              none are currently connected.
            </p>
            <Button
              onClick={() => setLocation("/settings")}
              size="lg"
              className="mt-4"
              data-testid="button-go-to-settings"
            >
              <Settings className="h-4 w-4 mr-2" />
              Go to Settings
            </Button>
          </Card>
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

  const mapStatus = (state: string): "idle" | "printing" | "paused" | "error" => {
    const normalized = state.toLowerCase();
    if (normalized.includes("print") || normalized.includes("working")) return "printing";
    if (normalized.includes("pause")) return "paused";
    if (normalized.includes("error") || normalized.includes("fail")) return "error";
    return "idle";
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
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

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Status & Feed */}
          <div className="lg:col-span-2 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <PrinterStatus 
                 status={mapStatus(status?.state || "idle")} 
                 progress={status?.progress || 0} 
                 timeLeft={formatTimeRemaining(status?.timeRemaining || null)} 
                 filename={status?.currentFile || "No active job"} 
               />
               <WebcamFeed />
             </div>
             
             <TemperatureChart 
               nozzleTemp={status?.temperature.nozzle || 0}
               bedTemp={status?.temperature.bed || 0}
               targetNozzle={status?.temperature.targetNozzle || 0}
               targetBed={status?.temperature.targetBed || 0}
             />
          </div>

          {/* Right Column: Controls & Files */}
          <div className="space-y-6">
            <JogControls printerId={activePrinter.id} />
            
            <Card className="p-4 bg-secondary/20 border-border">
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

            <FileList printerId={activePrinter.id} />
          </div>

        </div>
      </div>
    </div>
  );
}

