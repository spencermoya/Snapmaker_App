import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Settings from "@/pages/Settings";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard}/>
      <Route path="/settings" component={Settings}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function useVisibilityReconnect() {
  const lastHiddenTime = useRef<number | null>(null);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenTime.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const hiddenDuration = lastHiddenTime.current 
          ? Date.now() - lastHiddenTime.current 
          : 0;
        
        if (hiddenDuration > 5000) {
          toast.info("Reconnecting...", { duration: 1500 });
          queryClient.invalidateQueries();
        } else if (hiddenDuration > 1000) {
          queryClient.invalidateQueries();
        }
        lastHiddenTime.current = null;
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        toast.info("Reconnecting...", { duration: 1500 });
        queryClient.invalidateQueries();
      }
    };

    const handleFocus = () => {
      queryClient.invalidateQueries();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);
}

function App() {
  useVisibilityReconnect();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
