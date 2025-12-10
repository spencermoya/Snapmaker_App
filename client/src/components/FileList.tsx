import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCode, Play, RefreshCw, Plus, Trash2, Info } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
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
  source: string;
  uploadedAt: string;
}

export default function FileList({ printerId }: FileListProps) {
  const queryClient = useQueryClient();
  const [newFilename, setNewFilename] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: files = [], isLoading, error, refetch } = useQuery<UploadedFile[]>({
    queryKey: [`/api/printers/${printerId}/uploaded-files`],
    enabled: !!printerId,
    refetchInterval: 30000,
    staleTime: 5000,
    retry: 2,
  });

  const addFileMutation = useMutation({
    mutationFn: async (filename: string) => {
      if (!printerId) throw new Error("No printer connected");
      const res = await fetch(`/api/printers/${printerId}/uploaded-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, source: "manual" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add file");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("File added to list");
      setNewFilename("");
      setDialogOpen(false);
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
      toast.success("File removed from list");
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${printerId}/uploaded-files`] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const printMutation = useMutation({
    mutationFn: async (filename: string) => {
      if (!printerId) throw new Error("No printer connected");
      const res = await fetch(`/api/printers/${printerId}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start print");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Print started");
      queryClient.invalidateQueries({ queryKey: [`/api/printers/${printerId}/status`] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleAddFile = () => {
    if (newFilename.trim()) {
      addFileMutation.mutate(newFilename.trim());
    }
  };

  if (!printerId) {
    return (
      <Card className="h-full shadow-lg">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            File List
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
            File List
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  The Snapmaker API doesn't support listing files directly. Add filenames here manually 
                  to track files you've uploaded via Luban or the printer's touchscreen.
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
                variant="outline" 
                className="h-8"
                data-testid="button-add-file"
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                Add File
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add File to List</DialogTitle>
                <DialogDescription>
                  Enter the exact filename (including .gcode extension) as it appears on your printer's storage.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="example.gcode"
                  value={newFilename}
                  onChange={(e) => setNewFilename(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddFile()}
                  data-testid="input-filename"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddFile} 
                  disabled={!newFilename.trim() || addFileMutation.isPending}
                  data-testid="button-confirm-add"
                >
                  Add
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
            No files tracked. Add files you've uploaded via Luban to start prints from here.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="w-[70%]">Filename</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id} className="group border-border hover:bg-secondary/30" data-testid={`row-file-${file.id}`}>
                  <TableCell className="font-medium font-mono text-xs flex items-center gap-2 text-foreground">
                    <FileCode className="h-4 w-4 text-primary" />
                    <span data-testid={`text-filename-${file.id}`}>{file.filename}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => printMutation.mutate(file.filename)}
                        disabled={printMutation.isPending}
                        data-testid={`button-print-${file.id}`}
                        title="Start Print"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteFileMutation.mutate(file.id)}
                        disabled={deleteFileMutation.isPending}
                        data-testid={`button-delete-${file.id}`}
                        title="Remove from List"
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
