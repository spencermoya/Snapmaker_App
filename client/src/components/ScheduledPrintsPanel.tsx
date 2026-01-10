import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Trash2, Plug, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { ScheduledPrint, UploadedFile } from "@shared/schema";

interface ScheduledPrintsPanelProps {
  printerId: number;
}

export default function ScheduledPrintsPanel({ printerId }: ScheduledPrintsPanelProps) {
  const queryClient = useQueryClient();

  const { data: scheduledPrints = [], isLoading } = useQuery<ScheduledPrint[]>({
    queryKey: ["/api/scheduled-prints", printerId],
    queryFn: async () => {
      const res = await fetch(`/api/scheduled-prints?printerId=${printerId}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: files = [] } = useQuery<UploadedFile[]>({
    queryKey: [`/api/printers/${printerId}/uploaded-files`],
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/scheduled-prints/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to cancel scheduled print");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-prints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-prints", printerId] });
      toast.success("Scheduled print cancelled");
    },
    onError: () => {
      toast.error("Failed to cancel scheduled print");
    },
  });

  const getFileName = (fileId: number): string => {
    const file = files.find(f => f.id === fileId);
    return file?.displayName || file?.filename || `File #${fileId}`;
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "executing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "pending":
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusText = (status: string | null) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "executing":
        return "Running...";
      case "pending":
      default:
        return "Scheduled";
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (scheduledPrints.length === 0) {
    return (
      <Card className="p-4">
        <div className="text-center py-6 text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No scheduled prints</p>
          <p className="text-xs mt-1">Use the Schedule button to set up automatic prints</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        Scheduled Prints
      </h3>
      
      <div className="space-y-3">
        {scheduledPrints.map((job) => (
          <div
            key={job.id}
            className="flex items-start justify-between p-3 bg-secondary/30 rounded-lg"
            data-testid={`scheduled-print-${job.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {getStatusIcon(job.status)}
                <span className="text-sm font-medium truncate">
                  {getFileName(job.fileId)}
                </span>
              </div>
              
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(job.scheduledTime), "MMM d, h:mm a")}
                </span>
                
                {job.smartPlugId && (
                  <span className="flex items-center gap-1">
                    <Plug className="h-3 w-3" />
                    {job.printerWarmupMinutes}m warmup
                  </span>
                )}
              </div>
              
              <div className="mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  job.status === "completed" ? "bg-green-500/20 text-green-400" :
                  job.status === "failed" ? "bg-red-500/20 text-red-400" :
                  job.status === "executing" ? "bg-blue-500/20 text-blue-400" :
                  "bg-yellow-500/20 text-yellow-400"
                }`}>
                  {getStatusText(job.status)}
                </span>
              </div>
              
              {job.errorMessage && (
                <div className="flex items-start gap-1 mt-2 text-xs text-red-400">
                  <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{job.errorMessage}</span>
                </div>
              )}
            </div>
            
            {job.status === "pending" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => cancelMutation.mutate(job.id)}
                disabled={cancelMutation.isPending}
                data-testid={`button-cancel-${job.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
