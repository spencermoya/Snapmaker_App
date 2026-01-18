import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Clock, Layers, Printer } from "lucide-react";

interface PrinterStatsData {
  totalPrintTime: number;
  totalPrintCount: number;
  filamentUsed: number;
  lastPrintFilename: string | null;
  lastPrintCompletedAt: string | null;
}

interface PrinterStatsProps {
  printerId: number;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "0h";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function formatFilament(grams: number): string {
  if (!grams || grams === 0) return "0g";
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2)}kg`;
  }
  return `${grams.toFixed(0)}g`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export default function PrinterStats({ printerId }: PrinterStatsProps) {
  const { data: stats, isLoading } = useQuery<PrinterStatsData>({
    queryKey: [`/api/printers/${printerId}/stats`],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card className="p-4 bg-secondary/20 border-border">
        <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
          Lifetime Statistics
        </h3>
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-secondary/40 rounded"></div>
          <div className="h-8 bg-secondary/40 rounded"></div>
        </div>
      </Card>
    );
  }

  const printTime = stats?.totalPrintTime || 0;
  const printCount = stats?.totalPrintCount || 0;
  const filament = stats?.filamentUsed || 0;

  return (
    <Card className="p-4 bg-secondary/20 border-border" data-testid="card-printer-stats">
      <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
        Lifetime Statistics
      </h3>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div className="text-xl font-bold" data-testid="stat-print-time">
            {formatDuration(printTime)}
          </div>
          <div className="text-xs text-muted-foreground">Print Time</div>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Printer className="h-5 w-5 text-green-500" />
          </div>
          <div className="text-xl font-bold" data-testid="stat-print-count">
            {printCount}
          </div>
          <div className="text-xs text-muted-foreground">Prints</div>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Layers className="h-5 w-5 text-blue-500" />
          </div>
          <div className="text-xl font-bold" data-testid="stat-filament-used">
            {formatFilament(filament)}
          </div>
          <div className="text-xs text-muted-foreground">Filament</div>
        </div>
      </div>

      {stats?.lastPrintFilename && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            Last print: <span className="text-foreground">{stats.lastPrintFilename}</span>
            <span className="ml-2 text-muted-foreground/70">
              ({formatDate(stats.lastPrintCompletedAt)})
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
