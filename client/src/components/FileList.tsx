import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCode, Play, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface FileListProps {
  printerId: number;
}

interface PrinterFile {
  id: number;
  name: string;
  size: number;
  date: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function FileList({ printerId }: FileListProps) {
  const queryClient = useQueryClient();

  const { data: files = [], isLoading, isError, refetch } = useQuery<PrinterFile[]>({
    queryKey: ["/api/printers", printerId, "files"],
    enabled: !!printerId,
  });

  const printMutation = useMutation({
    mutationFn: async (filename: string) => {
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
    onSuccess: (_, filename) => {
      toast.success(`Started printing ${filename}`);
      queryClient.invalidateQueries({ queryKey: ["/api/printers", printerId, "status"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handlePrint = (filename: string) => {
    printMutation.mutate(filename);
  };

  return (
    <Card className="h-full shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Printer Files
        </CardTitle>
        <Button 
          size="sm" 
          variant="outline" 
          className="h-8"
          onClick={() => refetch()}
          disabled={isLoading}
          data-testid="button-refresh-files"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-files-error">
            <p>Failed to load files from printer.</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={() => refetch()}
            >
              Try Again
            </Button>
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-files">
            No files found on printer storage.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                <TableHead className="w-[60%]">Filename</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow 
                  key={file.id} 
                  className="group border-border hover:bg-secondary/30"
                  data-testid={`row-file-${file.id}`}
                >
                  <TableCell className="font-medium font-mono text-xs flex items-center gap-2 text-foreground">
                    <FileCode className="h-4 w-4 text-primary" />
                    <span className="truncate max-w-[200px]" title={file.name}>
                      {file.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-7 w-7 text-primary"
                        onClick={() => handlePrint(file.name)}
                        disabled={printMutation.isPending}
                        data-testid={`button-print-${file.id}`}
                      >
                        <Play className="h-3.5 w-3.5" />
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
