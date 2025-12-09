import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, Thermometer, Activity } from "lucide-react";

interface PrinterStatusProps {
  status: "idle" | "printing" | "paused" | "error";
  progress: number;
  timeLeft: string;
  filename?: string;
}

export default function PrinterStatus({ status, progress, timeLeft, filename }: PrinterStatusProps) {
  const getStatusColor = (s: string) => {
    switch (s) {
      case "printing": return "bg-green-500 hover:bg-green-600";
      case "paused": return "bg-yellow-500 hover:bg-yellow-600";
      case "error": return "bg-destructive hover:bg-destructive/90";
      default: return "bg-primary hover:bg-primary/90";
    }
  };

  return (
    <Card className="h-full border-l-4 border-l-primary/50 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Machine Status
        </CardTitle>
        <Badge className={`${getStatusColor(status)} uppercase border-none px-3 py-1 font-mono`}>
          {status}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono tracking-tight mb-4">
          {filename || "Ready to Print"}
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Progress
              </span>
              <span className="font-mono font-bold">{progress}%</span>
            </div>
            <Progress value={progress} className="h-3 bg-secondary" indicatorClassName={getStatusColor(status)} />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="h-3 w-3" /> Time Left
              </span>
              <span className="text-xl font-mono">{timeLeft}</span>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                 ETA
              </span>
              <span className="text-xl font-mono text-muted-foreground">14:30</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
