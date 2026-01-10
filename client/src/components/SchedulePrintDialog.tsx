import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Calendar, Clock, Plug, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { UploadedFile, SmartPlug } from "@shared/schema";

interface SchedulePrintDialogProps {
  printerId: number;
  trigger: React.ReactNode;
  preSelectedFileId?: number;
}

export default function SchedulePrintDialog({ printerId, trigger, preSelectedFileId }: SchedulePrintDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string>(preSelectedFileId ? String(preSelectedFileId) : "");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [useSmartPlug, setUseSmartPlug] = useState(false);
  const [selectedPlugId, setSelectedPlugId] = useState<string>("");
  const [warmupMinutes, setWarmupMinutes] = useState(2);
  
  const queryClient = useQueryClient();

  const { data: files = [] } = useQuery<UploadedFile[]>({
    queryKey: [`/api/printers/${printerId}/uploaded-files`],
    enabled: open && !!printerId,
  });

  const { data: smartPlugs = [] } = useQuery<SmartPlug[]>({
    queryKey: ["/api/smart-plugs"],
    enabled: open && !!printerId,
  });

  const scheduleMutation = useMutation({
    mutationFn: async (data: {
      printerId: number;
      fileId: number;
      scheduledTime: string;
      smartPlugId?: number;
      printerWarmupMinutes: number;
    }) => {
      const res = await fetch("/api/scheduled-prints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to schedule print");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-prints"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scheduled-prints", printerId] });
      toast.success("Print scheduled successfully!");
      setOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setSelectedFileId(preSelectedFileId ? String(preSelectedFileId) : "");
    setScheduledDate("");
    setScheduledTime("");
    setUseSmartPlug(false);
    setSelectedPlugId("");
    setWarmupMinutes(2);
  };

  const handleSchedule = () => {
    if (!selectedFileId || !scheduledDate || !scheduledTime) {
      toast.error("Please select a file and schedule time");
      return;
    }

    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`);
    if (scheduledDateTime <= new Date()) {
      toast.error("Scheduled time must be in the future");
      return;
    }

    scheduleMutation.mutate({
      printerId,
      fileId: parseInt(selectedFileId),
      scheduledTime: scheduledDateTime.toISOString(),
      smartPlugId: useSmartPlug && selectedPlugId ? parseInt(selectedPlugId) : undefined,
      printerWarmupMinutes: warmupMinutes,
    });
  };

  const minDate = new Date().toISOString().split("T")[0];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule Print
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select File</Label>
            <Select value={selectedFileId} onValueChange={setSelectedFileId}>
              <SelectTrigger data-testid="select-file">
                <SelectValue placeholder="Choose a file to print" />
              </SelectTrigger>
              <SelectContent>
                {files.length === 0 ? (
                  <SelectItem value="none" disabled>No files uploaded</SelectItem>
                ) : (
                  files.map((file) => (
                    <SelectItem key={file.id} value={file.id.toString()}>
                      {file.displayName || file.filename}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Date
              </Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={minDate}
                data-testid="input-date"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Time
              </Label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                data-testid="input-time"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Plug className="h-4 w-4" />
                Turn on smart plug first
              </Label>
              <Switch
                checked={useSmartPlug}
                onCheckedChange={setUseSmartPlug}
                data-testid="toggle-smart-plug"
              />
            </div>

            {useSmartPlug && (
              <>
                <div className="space-y-2">
                  <Label>Select Smart Plug</Label>
                  <Select value={selectedPlugId} onValueChange={setSelectedPlugId}>
                    <SelectTrigger data-testid="select-plug">
                      <SelectValue placeholder="Choose a smart plug" />
                    </SelectTrigger>
                    <SelectContent>
                      {smartPlugs.length === 0 ? (
                        <SelectItem value="none" disabled>No smart plugs configured</SelectItem>
                      ) : (
                        smartPlugs.filter(p => p.isEnabled).map((plug) => (
                          <SelectItem key={plug.id} value={plug.id.toString()}>
                            {plug.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Printer warmup time (minutes)</Label>
                  <Input
                    type="number"
                    value={warmupMinutes}
                    onChange={(e) => setWarmupMinutes(parseInt(e.target.value) || 2)}
                    min={1}
                    max={30}
                    data-testid="input-warmup"
                  />
                  <p className="text-xs text-muted-foreground">
                    Time to wait after turning on plug before starting print
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={scheduleMutation.isPending || !selectedFileId || !scheduledDate || !scheduledTime}
            data-testid="button-schedule"
          >
            {scheduleMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Calendar className="h-4 w-4 mr-2" />
            )}
            Schedule Print
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
