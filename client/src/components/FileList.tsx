import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCode, Play, RefreshCw, Upload, Trash2, Info, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState, useRef } from "react";
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
  source: string;
  uploadedAt: string;
}

export default function FileList({ printerId }: FileListProps) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
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
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${printerId}/status`] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

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
                <TableRow key={file.id} className="group border-border hover:bg-secondary/30" data-testid={`row-file-${file.id}`}>
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
                    <div className="flex justify-end gap-1">
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
    </Card>
  );
}
