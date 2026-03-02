import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Trash2, AlertCircle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import type { ScheduledPrint } from "@shared/schema";

interface ScheduledPrintsProps {
  printerId: number;
}

export default function ScheduledPrints({ printerId }: ScheduledPrintsProps) {
  const queryClient = useQueryClient();

  const { data: prints = [] } = useQuery<ScheduledPrint[]>({
    queryKey: [`/api/printers/${printerId}/scheduled-prints`],
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/scheduled-prints/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${printerId}/scheduled-prints`] });
    },
  });

  const pending = prints.filter(p => p.status === "pending");
  const completed = prints.filter(p => p.status === "completed");
  const failed = prints.filter(p => p.status === "failed");
  const running = prints.filter(p => p.status === "running");

  const sortedPrints = [...running, ...pending, ...failed, ...completed].slice(0, 10);

  if (sortedPrints.length === 0) {
    return (
      <Card className="bg-secondary/20 border-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Scheduled Prints
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground" data-testid="text-no-scheduled">
            No scheduled prints. Use the clock icon on a file to schedule a print.
          </p>
        </CardContent>
      </Card>
    );
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "pending": return <Clock className="h-3.5 w-3.5 text-yellow-400" />;
      case "running": return <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />;
      case "completed": return <CheckCircle className="h-3.5 w-3.5 text-green-400" />;
      case "failed": return <XCircle className="h-3.5 w-3.5 text-red-400" />;
      case "cancelled": return <XCircle className="h-3.5 w-3.5 text-muted-foreground" />;
      default: return <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "pending": return "text-yellow-400";
      case "running": return "text-blue-400";
      case "completed": return "text-green-400";
      case "failed": return "text-red-400";
      default: return "text-muted-foreground";
    }
  }

  function formatScheduledTime(dateStr: string | Date) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    
    if (diff < 0) return formatDate(date);
    
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    
    if (hours > 24) {
      return formatDate(date);
    } else if (hours > 0) {
      return `in ${hours}h ${mins}m`;
    } else {
      return `in ${mins}m`;
    }
  }

  function formatDate(date: Date) {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <Card className="bg-secondary/20 border-secondary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Scheduled Prints
          {pending.length > 0 && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
              {pending.length} pending
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sortedPrints.map((print) => (
          <div
            key={print.id}
            className="flex items-center justify-between p-2.5 rounded-lg bg-background/50 border border-secondary/30"
            data-testid={`card-scheduled-${print.id}`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {getStatusIcon(print.status)}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate" data-testid={`text-scheduled-file-${print.id}`}>
                  {print.filename}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-medium ${getStatusColor(print.status)}`}
                    data-testid={`text-scheduled-status-${print.id}`}>
                    {print.status}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {print.status === "pending"
                      ? formatScheduledTime(print.scheduledAt)
                      : formatDate(new Date(print.scheduledAt))}
                  </span>
                  {print.powerOnPlug && (
                    <span className="text-[10px] text-blue-400">+ power on</span>
                  )}
                </div>
                {print.status === "failed" && print.errorMessage && (
                  <p className="text-[10px] text-red-400 mt-0.5 truncate">{print.errorMessage}</p>
                )}
              </div>
            </div>
            {(print.status === "pending" || print.status === "failed" || print.status === "completed" || print.status === "cancelled") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-400"
                onClick={() => deleteMutation.mutate(print.id)}
                disabled={deleteMutation.isPending}
                data-testid={`button-delete-scheduled-${print.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
