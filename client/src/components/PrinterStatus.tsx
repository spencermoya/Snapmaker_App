import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, Timer, Activity } from "lucide-react";
import { useRealtimeTimer } from "@/hooks/useRealtimeTimer";

interface PrinterStatusProps {
  status: "idle" | "printing" | "paused" | "error";
  progress: number;
  timeLeft: string;
  timeRemainingSeconds?: number | null;
  elapsedTime?: string;
  elapsedTimeSeconds?: number | null;
  totalPrintTime?: number | null;
  currentLine?: number | null;
  totalLines?: number | null;
  filename?: string;
}

export default function PrinterStatus({ 
  status, 
  progress, 
  timeLeft, 
  timeRemainingSeconds, 
  elapsedTime, 
  elapsedTimeSeconds,
  totalPrintTime,
  currentLine,
  totalLines,
  filename 
}: PrinterStatusProps) {
  const isActive = status === "printing";
  
  const { displayElapsedSeconds, displayRemainingSeconds } = useRealtimeTimer({
    elapsedTimeSeconds,
    timeRemainingSeconds,
    isActive,
  });
  const getStatusColor = (s: string) => {
    switch (s) {
      case "printing": return "bg-green-500 hover:bg-green-600";
      case "paused": return "bg-yellow-500 hover:bg-yellow-600";
      case "error": return "bg-destructive hover:bg-destructive/90";
      default: return "bg-primary hover:bg-primary/90";
    }
  };

  const calculateETA = (): string => {
    if (!displayRemainingSeconds || displayRemainingSeconds <= 0) {
      return "--:--";
    }
    const now = new Date();
    const eta = new Date(now.getTime() + displayRemainingSeconds * 1000);
    return eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (!seconds || seconds <= 0) return "--:--";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const formatElapsedTime = (seconds: number): string => {
    if (!seconds || seconds <= 0) return "0m";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
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
              <span className="font-mono font-bold">{progress.toFixed(2)}%</span>
            </div>
            <Progress value={progress} className="h-3 bg-secondary" indicatorClassName={getStatusColor(status)} />
            {currentLine !== null && currentLine !== undefined && totalLines !== null && totalLines !== undefined && totalLines > 0 && (
              <div className="text-xs text-muted-foreground text-right">
                Line {currentLine.toLocaleString()} / {totalLines.toLocaleString()}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Clock className="h-3 w-3" /> Time Left
              </span>
              <span className="text-xl font-mono" data-testid="text-time-left">
                {isActive && displayRemainingSeconds > 0 
                  ? formatTimeRemaining(displayRemainingSeconds) 
                  : timeLeft}
              </span>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Timer className="h-3 w-3" /> ETA
              </span>
              <span className="text-xl font-mono text-muted-foreground" data-testid="text-eta">{calculateETA()}</span>
            </div>
          </div>
          {(elapsedTime || elapsedTimeSeconds || isActive) && (
            <div className="pt-4 border-t border-border/50">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Elapsed</span>
                <span className="font-mono" data-testid="text-elapsed">
                  {isActive ? formatElapsedTime(displayElapsedSeconds) : (elapsedTime || (elapsedTimeSeconds ? formatElapsedTime(elapsedTimeSeconds) : "Unknown"))}
                </span>
              </div>
              {totalPrintTime && totalPrintTime > 0 && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Total Est.</span>
                  <span className="font-mono text-muted-foreground" data-testid="text-total-time">
                    {formatElapsedTime(totalPrintTime)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
