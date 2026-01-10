import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Printer, Calendar, TrendingUp } from "lucide-react";
import type { PrintStat } from "@shared/schema";

interface StatsSummary {
  today: { totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number };
  week: { totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number };
  month: { totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number };
  year: { totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number };
  allTime: { totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number };
  recentPrints: PrintStat[];
}

interface PrintStatsProps {
  printerId: number;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "0m";
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
      return `${days}d ${remainingHours}h`;
    }
    return `${days}d`;
  }
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  
  return `${minutes}m`;
}

function formatDate(dateStr: string | null | Date): string {
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-background/50 rounded-lg">
      <div className="p-2 bg-primary/10 rounded-lg">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-lg font-mono font-bold" data-testid={`stat-${label.toLowerCase().replace(/\s/g, '-')}`}>{value}</p>
      </div>
    </div>
  );
}

function PeriodStats({ stats }: { stats: { totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number } }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard 
        label="Print Time" 
        value={formatDuration(stats.totalPrintTimeSeconds)} 
        icon={Clock} 
      />
      <StatCard 
        label="Prints" 
        value={String(stats.totalPrints)} 
        icon={Printer} 
      />
    </div>
  );
}

export default function PrintStats({ printerId }: PrintStatsProps) {
  const { data: summary, isLoading } = useQuery<StatsSummary>({
    queryKey: [`/api/printers/${printerId}/stats/summary`],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="p-4 bg-secondary/20 border-border">
        <p className="text-muted-foreground text-center text-sm">Loading stats...</p>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card className="p-4 bg-secondary/20 border-border">
        <p className="text-muted-foreground text-center text-sm">No stats available</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-secondary/20 border-border">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Print Statistics
        </h3>
      </div>

      <Tabs defaultValue="week" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="today" className="text-xs" data-testid="tab-today">Today</TabsTrigger>
          <TabsTrigger value="week" className="text-xs" data-testid="tab-week">Week</TabsTrigger>
          <TabsTrigger value="month" className="text-xs" data-testid="tab-month">Month</TabsTrigger>
          <TabsTrigger value="all" className="text-xs" data-testid="tab-all">All Time</TabsTrigger>
        </TabsList>
        
        <TabsContent value="today">
          <PeriodStats stats={summary.today} />
        </TabsContent>
        
        <TabsContent value="week">
          <PeriodStats stats={summary.week} />
        </TabsContent>
        
        <TabsContent value="month">
          <PeriodStats stats={summary.month} />
        </TabsContent>
        
        <TabsContent value="all">
          <PeriodStats stats={summary.allTime} />
        </TabsContent>
      </Tabs>

      {summary.recentPrints.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            Recent Prints
          </h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {summary.recentPrints.map((print) => (
              <div 
                key={print.id} 
                className="flex justify-between items-center text-sm py-1 border-b border-border/30 last:border-0"
                data-testid={`recent-print-${print.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs truncate" title={print.filename}>
                    {print.filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(print.completedAt)}
                  </p>
                </div>
                <span className="font-mono text-xs text-muted-foreground ml-2">
                  {formatDuration(print.printTimeSeconds)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
