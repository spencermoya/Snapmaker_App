import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, Crosshair } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export default function JogControls() {
  const [step, setStep] = useState(10);

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
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
            <Button variant="outline" size="icon" className="rounded-full bg-secondary/50 hover:bg-secondary hover:text-primary">
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div />
            <Button variant="outline" size="icon" className="rounded-full bg-secondary/50 hover:bg-secondary hover:text-primary">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button variant="default" size="icon" className="rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)]">
              <Home className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full bg-secondary/50 hover:bg-secondary hover:text-primary">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div />
            <Button variant="outline" size="icon" className="rounded-full bg-secondary/50 hover:bg-secondary hover:text-primary">
              <ArrowDown className="h-4 w-4" />
            </Button>
            <div />
          </div>

          {/* Z Controls */}
          <div className="flex flex-col gap-2 border-l pl-8 border-border">
            <Button variant="outline" size="icon" className="rounded-full bg-secondary/50 hover:bg-secondary hover:text-primary">
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div className="h-8 flex items-center justify-center font-mono text-xs text-muted-foreground">Z</div>
            <Button variant="outline" size="icon" className="rounded-full bg-secondary/50 hover:bg-secondary hover:text-primary">
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="mt-6 space-y-2">
          <div className="flex justify-between items-center px-2 py-1 bg-secondary/30 rounded font-mono text-xs">
            <span className="text-muted-foreground">X:</span>
            <span className="text-foreground">120.50</span>
          </div>
          <div className="flex justify-between items-center px-2 py-1 bg-secondary/30 rounded font-mono text-xs">
            <span className="text-muted-foreground">Y:</span>
            <span className="text-foreground">120.50</span>
          </div>
          <div className="flex justify-between items-center px-2 py-1 bg-secondary/30 rounded font-mono text-xs">
            <span className="text-muted-foreground">Z:</span>
            <span className="text-foreground">0.20</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
