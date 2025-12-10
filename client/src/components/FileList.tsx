import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCode, Play, RefreshCw, AlertCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface FileListProps {
  printerId: number | null;
}

interface PrinterFile {
  id: number;
  name: string;
  size: string;
  date: string;
}

export default function FileList({ printerId }: FileListProps) {
  const queryClient = useQueryClient();

  const { data: files = [], isLoading, error, refetch } = useQuery<PrinterFile[]>({
    queryKey: [`/api/printers/${printerId}/files`],
    enabled: !!printerId,
    refetchInterval: 30000,
    retry: 2,
    retryDelay: 1000,
    staleTime: 5000,
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

  const handlePrint = (filename: string) => {
    printMutation.mutate(filename);
  };

  if (!printerId) {
    return (
      <Card className="h-full shadow-lg">
        <CardHeader>
          <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Local Storage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Connect to a printer to view files
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Printer Storage
        </CardTitle>
        <Button 
          size="sm" 
          variant="outline" 
          className="h-8"
          onClick={() => refetch()}
          disabled={isLoading}
          data-testid="button-refresh-files"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Loading files...</p>
        ) : error ? (
          <div className="text-center py-4 space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive" data-testid="text-files-error">
              Failed to load files
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-files">
            No files found on printer
          </p>
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
                <TableRow key={file.id} className="group border-border hover:bg-secondary/30" data-testid={`row-file-${file.id}`}>
                  <TableCell className="font-medium font-mono text-xs flex items-center gap-2 text-foreground">
                    <FileCode className="h-4 w-4 text-primary" />
                    <span data-testid={`text-filename-${file.id}`}>{file.name}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{file.size}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => handlePrint(file.name)}
                      disabled={printMutation.isPending}
                      data-testid={`button-print-${file.id}`}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
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
