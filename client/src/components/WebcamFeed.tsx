import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Camera, Maximize2 } from "lucide-react";
import printImage from '@assets/generated_images/3d_print_in_progress_macro_shot.png';

export default function WebcamFeed() {
  return (
    <Card className="overflow-hidden relative group aspect-video bg-black border-none shadow-xl ring-1 ring-border">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Badge variant="destructive" className="animate-pulse bg-red-500/80 text-white border-none shadow-sm backdrop-blur-sm">
          LIVE
        </Badge>
        <Badge variant="outline" className="bg-black/50 text-white border-white/20 backdrop-blur-sm">
          1080p
        </Badge>
      </div>
      
      <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-2 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-sm transition-colors">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      <img 
        src={printImage} 
        alt="Printer Feed" 
        className="w-full h-full object-cover opacity-90 transition-transform duration-[20s] ease-linear hover:scale-105" 
      />
      
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2 text-white/80 text-xs font-mono">
           <Camera className="h-3 w-3" />
           <span>Snapmaker Cam 1</span>
        </div>
      </div>
    </Card>
  );
}
