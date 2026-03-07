import { useLocation } from "wouter";
import { Activity, Camera, FolderOpen, CalendarClock, Settings } from "lucide-react";

const NAV_ITEMS = [
  { path: "/", label: "Status", icon: Activity },
  { path: "/camera", label: "Camera", icon: Camera },
  { path: "/files", label: "Files", icon: FolderOpen },
  { path: "/schedule", label: "Schedule", icon: CalendarClock },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border" data-testid="bottom-nav">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`nav-${item.label.toLowerCase()}`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
