import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCode, Play, RefreshCw, Upload, Trash2, Info, AlertCircle, X, Calendar, FolderInput, Clock, Plug } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useRef, useCallback, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import type { SmartPlug } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FileListProps {
  printerId: number | null;
}

interface UploadedFile {
  id: number;
  printerId: number;
  filename: string;
  displayName: string | null;
  fileContent: string | null;
  thumbnail: string | null;
  source: string;
  uploadedAt: string;
}

export default function FileList({ printerId }: FileListProps) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleFile, setScheduleFile] = useState<UploadedFile | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [powerOnPlug, setPowerOnPlug] = useState(false);
  const [selectedPlugId, setSelectedPlugId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files = [], isLoading, error, refetch } = useQuery<UploadedFile[]>({
    queryKey: [`/api/printers/${printerId}/uploaded-files`],
    enabled: !!printerId,
    refetchInterval: 30000,
    staleTime: 5000,
    retry: 2,
  });

  const uploadFileMutation = useMutation({
    mutationFn: async ({ file, displayName }: { file: File; displayName: string }) => {
      if (!printerId) throw new Error("No printer connected");
      
      const fileContent = await file.text();
      
      const res = await fetch(`/api/printers/${printerId}/uploaded-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          filename: file.name,
          displayName: displayName || null,
          fileContent,
          source: "upload" 
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload file");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("File uploaded successfully");
      setDisplayName("");
      setSelectedFile(null);
      setDialogOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${printerId}/uploaded-files`] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (fileId: number) => {
      if (!printerId) throw new Error("No printer connected");
      const res = await fetch(`/api/printers/${printerId}/uploaded-files/${fileId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove file");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("File removed");
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${printerId}/uploaded-files`] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const { data: merossStatus } = useQuery<{
    connected: boolean;
    devices: SmartPlug[];
  }>({
    queryKey: ["/api/meross/status"],
    refetchInterval: 30000,
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ fileId, scheduledAt, powerOnPlug, plugId }: {
      fileId: number;
      scheduledAt: string;
      powerOnPlug: boolean;
      plugId?: number;
    }) => {
      if (!printerId) throw new Error("No printer connected");
      const res = await apiRequest("POST", `/api/printers/${printerId}/schedule-print`, {
        fileId,
        scheduledAt,
        powerOnPlug,
        plugId,
      });
      return res.json();
    },
    onSuccess: () => {
      toast.success("Print scheduled successfully");
      setScheduleDialogOpen(false);
      setScheduleFile(null);
      setScheduleDate("");
      setScheduleTime("");
      setPowerOnPlug(false);
      setSelectedPlugId("");
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${printerId}/scheduled-prints`] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const printMutation = useMutation({
    mutationFn: async (fileId: number) => {
      if (!printerId) throw new Error("No printer connected");
      const res = await fetch(`/api/printers/${printerId}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start print");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Print started! Check your printer.");
      setPreviewDialogOpen(false);
      setPreviewFile(null);
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${printerId}/status`] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleFileClick = useCallback((file: UploadedFile) => {
    setPreviewFile(file);
    setPreviewDialogOpen(true);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewDialogOpen(false);
    setPreviewFile(null);
  }, []);

  const handleStartPrint = useCallback(() => {
    if (previewFile) {
      printMutation.mutate(previewFile.id);
    }
  }, [previewFile, printMutation]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "Unknown";
    }
  };

  const parseEstimatedTime = (gcode: string | null): number | null => {
    if (!gcode) return null;
    
    const lines = gcode.slice(0, 8000).split('\n');
    
    for (const line of lines) {
      let match = line.match(/;TIME:(\d+)/i);
      if (match) return parseInt(match[1], 10);
      
      match = line.match(/;estimated_time\(s\):\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
      
      match = line.match(/;\s*estimated_print_time\s*=\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
      
      match = line.match(/;\s*estimated printing time[^=]*[=:]\s*((\d+)h\s*)?((\d+)m\s*)?((\d+)s)?/i);
      if (match) {
        const hours = parseInt(match[2] || '0', 10);
        const minutes = parseInt(match[4] || '0', 10);
        const seconds = parseInt(match[6] || '0', 10);
        if (hours > 0 || minutes > 0 || seconds > 0) {
          return hours * 3600 + minutes * 60 + seconds;
        }
      }
      
      match = line.match(/;PRINT_TIME:\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
      
      match = line.match(/;\s*print_time\s*=\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  };

  const formatPrintTime = (seconds: number | null): string => {
    if (!seconds || seconds <= 0) return "Unknown";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const estimatedTime = useMemo(() => {
    return parseEstimatedTime(previewFile?.fileContent || null);
  }, [previewFile?.fileContent]);

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "upload": return "Manual Upload";
      case "drag-drop": return "Drag & Drop";
      case "slicer": return "Slicer";
      case "watch-folder": return "Watch Folder";
      case "luban": return "Luban";
      default: return source;
    }
  };

  const handleOpenSchedule = useCallback((file: UploadedFile) => {
    setScheduleFile(file);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduleDate(tomorrow.toISOString().split("T")[0]);
    setScheduleTime("08:00");
    setPowerOnPlug(false);
    setSelectedPlugId("");
    setScheduleDialogOpen(true);
  }, []);

  const handleSchedulePrint = useCallback(() => {
    if (!scheduleFile || !scheduleDate || !scheduleTime) return;
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    scheduleMutation.mutate({
      fileId: scheduleFile.id,
      scheduledAt,
      powerOnPlug,
      plugId: powerOnPlug && selectedPlugId ? parseInt(selectedPlugId) : undefined,
    });
  }, [scheduleFile, scheduleDate, scheduleTime, powerOnPlug, selectedPlugId, scheduleMutation]);

  const handleUpload = () => {
    if (selectedFile) {
      uploadFileMutation.mutate({ file: selectedFile, displayName });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!displayName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        setDisplayName(nameWithoutExt);
      }
    }
  };

  if (!printerId) {
    return (
      <Card className="h-full shadow-lg">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            G-Code Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Connect to a printer to manage files
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            G-Code Files
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Upload G-code files here. When you click Print, the file will be sent to your 
                  printer and start automatically.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                size="sm" 
                variant="default" 
                className="h-8"
                data-testid="button-upload-file"
              >
                <Upload className="h-3.5 w-3.5 mr-2" />
                Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload G-Code File</DialogTitle>
                <DialogDescription>
                  Select a G-code file to upload. When you print, it will be sent to your printer and start automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="gcode-file">G-Code File</Label>
                  <Input
                    id="gcode-file"
                    type="file"
                    accept=".gcode,.nc,.cnc"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    data-testid="input-file"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display-name">Display Name (optional)</Label>
                  <Input
                    id="display-name"
                    placeholder="My Print Job"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    data-testid="input-display-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    A friendly name to help you identify this file
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setDialogOpen(false);
                  setSelectedFile(null);
                  setDisplayName("");
                }}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpload} 
                  disabled={!selectedFile || uploadFileMutation.isPending}
                  data-testid="button-confirm-upload"
                >
                  {uploadFileMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-8"
            onClick={() => refetch()}
            disabled={isLoading}
            data-testid="button-refresh-files"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading files...</p>
        ) : error ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-destructive" data-testid="text-files-error">
              Failed to load files
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-files">
            No files uploaded yet. Upload a G-code file to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="w-[70%]">File</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow 
                  key={file.id} 
                  className="group border-border hover:bg-secondary/30 cursor-pointer" 
                  data-testid={`row-file-${file.id}`}
                  onClick={() => handleFileClick(file)}
                >
                  <TableCell className="font-medium text-xs text-foreground">
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate" data-testid={`text-displayname-${file.id}`}>
                          {file.displayName || file.filename}
                        </div>
                        {file.displayName && (
                          <div className="text-xs text-muted-foreground truncate font-mono">
                            {file.filename}
                          </div>
                        )}
                        {!file.fileContent && (
                          <div className="flex items-center gap-1 text-xs text-amber-500">
                            <AlertCircle className="h-3 w-3" />
                            No file content
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={() => printMutation.mutate(file.id)}
                              disabled={printMutation.isPending || !file.fileContent}
                              data-testid={`button-print-${file.id}`}
                            >
                              <Play className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {file.fileContent ? "Start Print" : "No file content - re-upload needed"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 text-yellow-500 hover:text-yellow-500 hover:bg-yellow-500/10"
                              onClick={() => handleOpenSchedule(file)}
                              disabled={!file.fileContent}
                              data-testid={`button-schedule-${file.id}`}
                            >
                              <Clock className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Schedule Print</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteFileMutation.mutate(file.id)}
                        disabled={deleteFileMutation.isPending}
                        data-testid={`button-delete-${file.id}`}
                        title="Remove File"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* File Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-primary" />
              File Details
            </DialogTitle>
          </DialogHeader>
          
          {previewFile && (
            <div className="space-y-4">
              {/* Thumbnail Image */}
              {previewFile.thumbnail ? (
                <div className="flex justify-center bg-secondary/30 rounded-lg p-4">
                  <img 
                    src={previewFile.thumbnail} 
                    alt={`Preview of ${previewFile.displayName || previewFile.filename}`}
                    className="max-w-full max-h-64 object-contain rounded"
                    data-testid="preview-thumbnail"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center bg-secondary/30 rounded-lg p-8 text-muted-foreground">
                  <FileCode className="h-16 w-16 mb-2 opacity-50" />
                  <span className="text-sm">No preview available</span>
                </div>
              )}

              {/* File Info */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold" data-testid="preview-display-name">
                    {previewFile.displayName || previewFile.filename}
                  </h3>
                  {previewFile.displayName && (
                    <p className="text-sm text-muted-foreground font-mono" data-testid="preview-filename">
                      {previewFile.filename}
                    </p>
                  )}
                </div>
                
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Est. Print Time: </span>
                    <span className="text-foreground font-medium" data-testid="preview-print-time">
                      {formatPrintTime(estimatedTime)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span data-testid="preview-date">{formatDate(previewFile.uploadedAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FolderInput className="h-4 w-4" />
                    <span data-testid="preview-source">{getSourceLabel(previewFile.source)}</span>
                  </div>
                </div>

                {!previewFile.fileContent && (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-500">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm">No file content stored. Please re-upload this file to enable printing.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-row justify-between sm:justify-between gap-2">
            <Button
              variant="outline"
              onClick={handleClosePreview}
              className="flex-1 sm:flex-none"
              data-testid="button-close-preview"
            >
              <X className="h-4 w-4 mr-2" />
              Close
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (previewFile) {
                    handleClosePreview();
                    handleOpenSchedule(previewFile);
                  }
                }}
                disabled={!previewFile?.fileContent}
                className="flex-1 sm:flex-none border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                data-testid="button-schedule-from-preview"
              >
                <Clock className="h-4 w-4 mr-2" />
                Schedule
              </Button>
              <Button
                onClick={handleStartPrint}
                disabled={printMutation.isPending || !previewFile?.fileContent}
                className="flex-1 sm:flex-none"
                data-testid="button-start-print"
              >
                <Play className="h-4 w-4 mr-2" />
                {printMutation.isPending ? "Starting..." : "Start Print"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Schedule Print
            </DialogTitle>
            <DialogDescription>
              Set a date and time to automatically start this print.
            </DialogDescription>
          </DialogHeader>
          
          {scheduleFile && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-secondary/30 border border-secondary/40">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium truncate" data-testid="text-schedule-filename">
                    {scheduleFile.displayName || scheduleFile.filename}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="schedule-date" className="text-xs">Date</Label>
                  <Input
                    id="schedule-date"
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    data-testid="input-schedule-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-time" className="text-xs">Time</Label>
                  <Input
                    id="schedule-time"
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    data-testid="input-schedule-time"
                  />
                </div>
              </div>

              {merossStatus?.connected && merossStatus.devices?.length > 0 && (
                <div className="space-y-3 p-3 rounded-lg bg-secondary/30 border border-secondary/40">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="power-on-plug"
                      checked={powerOnPlug}
                      onCheckedChange={(checked) => setPowerOnPlug(!!checked)}
                      data-testid="checkbox-power-on-plug"
                    />
                    <Label htmlFor="power-on-plug" className="text-sm flex items-center gap-1.5 cursor-pointer">
                      <Plug className="h-3.5 w-3.5" />
                      Power on smart plug before printing
                    </Label>
                  </div>
                  
                  {powerOnPlug && (
                    <Select value={selectedPlugId} onValueChange={setSelectedPlugId}>
                      <SelectTrigger className="w-full" data-testid="select-plug">
                        <SelectValue placeholder="Select a smart plug" />
                      </SelectTrigger>
                      <SelectContent>
                        {merossStatus.devices.map((plug) => (
                          <SelectItem key={plug.id} value={String(plug.id)}>
                            {plug.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  
                  {powerOnPlug && (
                    <p className="text-[11px] text-muted-foreground">
                      The plug will turn on 5 minutes before the scheduled time, giving the printer time to boot up.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setScheduleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSchedulePrint}
              disabled={!scheduleDate || !scheduleTime || scheduleMutation.isPending || (powerOnPlug && !selectedPlugId)}
              className="bg-yellow-600 hover:bg-yellow-700 text-white"
              data-testid="button-confirm-schedule"
            >
              <Clock className="h-4 w-4 mr-2" />
              {scheduleMutation.isPending ? "Scheduling..." : "Schedule Print"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
