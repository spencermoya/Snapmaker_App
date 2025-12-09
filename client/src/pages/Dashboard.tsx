import PrinterStatus from "@/components/PrinterStatus";
import TemperatureChart from "@/components/TemperatureChart";
import JogControls from "@/components/JogControls";
import FileList from "@/components/FileList";
import WebcamFeed from "@/components/WebcamFeed";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Power, Settings, Fan, Lightbulb, PauseCircle, StopCircle } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              Snapmaker<span className="text-primary">F350</span>
              <span className="text-xs font-mono font-normal text-muted-foreground border px-2 py-0.5 rounded-full">v2.4.1</span>
            </h1>
            <p className="text-muted-foreground mt-1">Connected via Wi-Fi • 192.168.1.42</p>
          </div>
          
          <div className="flex gap-3">
             <Button variant="outline" size="icon" className="text-muted-foreground hover:text-foreground">
               <Lightbulb className="h-4 w-4" />
             </Button>
             <Button variant="outline" size="icon" className="text-muted-foreground hover:text-foreground">
               <Fan className="h-4 w-4" />
             </Button>
             <Button variant="outline" size="icon" className="text-muted-foreground hover:text-foreground">
               <Settings className="h-4 w-4" />
             </Button>
             <Separator orientation="vertical" className="h-9" />
             <Button variant="destructive" className="shadow-[0_0_20px_rgba(239,68,68,0.3)]">
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
                 status="printing" 
                 progress={78} 
                 timeLeft="1h 24m" 
                 filename="prototype_chassis_v2.gcode" 
               />
               <WebcamFeed />
             </div>
             
             <TemperatureChart />
          </div>

          {/* Right Column: Controls & Files */}
          <div className="space-y-6">
            <JogControls />
            
            <Card className="p-4 bg-secondary/20 border-border">
               <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">Active Job Controls</h3>
               <div className="grid grid-cols-2 gap-3">
                 <Button variant="outline" className="w-full border-yellow-500/50 hover:bg-yellow-500/10 hover:text-yellow-500 text-yellow-500">
                    <PauseCircle className="h-4 w-4 mr-2" /> Pause
                 </Button>
                 <Button variant="outline" className="w-full border-red-500/50 hover:bg-red-500/10 hover:text-red-500 text-red-500">
                    <StopCircle className="h-4 w-4 mr-2" /> Cancel
                 </Button>
               </div>
            </Card>

            <FileList />
          </div>

        </div>
      </div>
    </div>
  );
}

// Helper Card Wrapper for small inline usage
import { Card } from "@/components/ui/card";
