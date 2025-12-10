import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface JogControlsProps {
  printerId: number;
}

interface Position {
  x: number;
  y: number;
  z: number;
}

export default function JogControls({ printerId }: JogControlsProps) {
  const [step, setStep] = useState(10);

  const { data: position, refetch: refetchPosition } = useQuery<Position>({
    queryKey: ["/api/printers", printerId, "position"],
    enabled: !!printerId,
    refetchInterval: 2000,
  });

  const jogMutation = useMutation({
    mutationFn: async ({ axis, distance }: { axis: string; distance: number }) => {
      const res = await fetch(`/api/printers/${printerId}/jog`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ axis, distance }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to move");
      }
      return res.json();
    },
    onSuccess: () => {
      refetchPosition();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const homeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/printers/${printerId}/home`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to home");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Homing started");
      refetchPosition();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleJog = (axis: string, direction: number) => {
    jogMutation.mutate({ axis, distance: step * direction });
  };

  const handleHome = () => {
    homeMutation.mutate();
  };

  const isMoving = jogMutation.isPending || homeMutation.isPending;

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center gap-2">
          <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Jog Controls
          </CardTitle>
          <div className="flex gap-1">
             {[1, 10, 50].map((s) => (
               <Badge 
                 key={s} 
                 variant={step === s ? "default" : "outline"}
                 className="cursor-pointer font-mono text-xs"
                 onClick={() => setStep(s)}
                 data-testid={`badge-step-${s}`}
               >
                 {s}mm
               </Badge>
             ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-8 justify-center items-center">
          {/* XY Controls */}
          <div className="grid grid-cols-3 gap-2 w-fit">
            <div />
            <Button 
              variant="outline" 
              size="icon" 
              className="rounded-full bg-secondary/50"
              onClick={() => handleJog("Y", 1)}
              disabled={isMoving}
              data-testid="button-jog-y-plus"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div />
            <Button 
              variant="outline" 
              size="icon" 
              className="rounded-full bg-secondary/50"
              onClick={() => handleJog("X", -1)}
              disabled={isMoving}
              data-testid="button-jog-x-minus"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button 
              variant="default" 
              size="icon" 
              className="rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)]"
              onClick={handleHome}
              disabled={isMoving}
              data-testid="button-home"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              className="rounded-full bg-secondary/50"
              onClick={() => handleJog("X", 1)}
              disabled={isMoving}
              data-testid="button-jog-x-plus"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div />
            <Button 
              variant="outline" 
              size="icon" 
              className="rounded-full bg-secondary/50"
              onClick={() => handleJog("Y", -1)}
              disabled={isMoving}
              data-testid="button-jog-y-minus"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <div />
          </div>

          {/* Z Controls */}
          <div className="flex flex-col gap-2 border-l pl-8 border-border">
            <Button 
              variant="outline" 
              size="icon" 
              className="rounded-full bg-secondary/50"
              onClick={() => handleJog("Z", 1)}
              disabled={isMoving}
              data-testid="button-jog-z-plus"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div className="h-8 flex items-center justify-center font-mono text-xs text-muted-foreground">Z</div>
            <Button 
              variant="outline" 
              size="icon" 
              className="rounded-full bg-secondary/50"
              onClick={() => handleJog("Z", -1)}
              disabled={isMoving}
              data-testid="button-jog-z-minus"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="mt-6 space-y-2">
          <div className="flex justify-between items-center px-2 py-1 bg-secondary/30 rounded font-mono text-xs">
            <span className="text-muted-foreground">X:</span>
            <span className="text-foreground" data-testid="text-position-x">{position?.x?.toFixed(2) ?? "---"}</span>
          </div>
          <div className="flex justify-between items-center px-2 py-1 bg-secondary/30 rounded font-mono text-xs">
            <span className="text-muted-foreground">Y:</span>
            <span className="text-foreground" data-testid="text-position-y">{position?.y?.toFixed(2) ?? "---"}</span>
          </div>
          <div className="flex justify-between items-center px-2 py-1 bg-secondary/30 rounded font-mono text-xs">
            <span className="text-muted-foreground">Z:</span>
            <span className="text-foreground" data-testid="text-position-z">{position?.z?.toFixed(2) ?? "---"}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
