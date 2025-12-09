import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCode, Play, Trash2, Download } from "lucide-react";

const files = [
  { id: 1, name: "benchy_v3.gcode", size: "12.4 MB", date: "2023-10-24" },
  { id: 2, name: "phone_stand_final.gcode", size: "4.1 MB", date: "2023-10-23" },
  { id: 3, name: "calibration_cube.gcode", size: "0.5 MB", date: "2023-10-20" },
  { id: 4, name: "drawer_handle_x4.gcode", size: "8.2 MB", date: "2023-10-18" },
  { id: 5, name: "monitor_mount_arm.gcode", size: "24.6 MB", date: "2023-10-15" },
];

export default function FileList() {
  return (
    <Card className="h-full shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Local Storage
        </CardTitle>
        <Button size="sm" variant="outline" className="h-8">
          <Download className="h-3.5 w-3.5 mr-2" />
          Upload G-Code
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[50%]">Filename</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.id} className="group border-border hover:bg-secondary/30">
                <TableCell className="font-medium font-mono text-xs flex items-center gap-2 text-foreground">
                  <FileCode className="h-4 w-4 text-primary" />
                  {file.name}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{file.size}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-primary hover:text-primary hover:bg-primary/10">
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
