import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Power, Plug, RefreshCw, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiRequest } from "@/lib/queryClient";
import type { SmartPlug } from "@shared/schema";

export default function SmartPlugControl() {
  const queryClient = useQueryClient();

  const { data: merossStatus } = useQuery<{
    connected: boolean;
    email: string | null;
    devices: SmartPlug[];
  }>({
    queryKey: ["/api/meross/status"],
    refetchInterval: 10000,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ plugId, turnOn }: { plugId: number; turnOn: boolean }) => {
      const res = await apiRequest("POST", `/api/meross/devices/${plugId}/toggle`, { turnOn });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meross/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meross/devices"] });
    },
  });

  if (!merossStatus?.connected || !merossStatus.devices?.length) {
    return (
      <Card className="bg-secondary/20 border-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Smart Plug
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground" data-testid="text-no-plugs">
            No smart plugs connected. Go to Settings to connect your Meross account.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-secondary/20 border-secondary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Plug className="h-4 w-4" />
          Smart Plugs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {merossStatus.devices.map((plug) => (
          <div
            key={plug.id}
            className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-secondary/30"
            data-testid={`card-plug-${plug.id}`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${plug.localIp ? (plug.isOn ? "bg-green-500/20 text-green-400" : "bg-secondary/40 text-muted-foreground") : "bg-amber-500/20 text-amber-400"}`}>
                {plug.localIp ? <Power className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm font-medium" data-testid={`text-plug-name-${plug.id}`}>{plug.name}</p>
                {plug.localIp ? (
                  <p className="text-xs text-muted-foreground">{plug.model || "Smart Plug"}</p>
                ) : (
                  <p className="text-xs text-amber-400" data-testid={`text-plug-noip-${plug.id}`}>Set IP in Settings to control</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${plug.isOn ? "text-green-400" : "text-muted-foreground"}`}
                data-testid={`text-plug-status-${plug.id}`}>
                {plug.localIp ? (plug.isOn ? "ON" : "OFF") : ""}
              </span>
              <Switch
                checked={plug.isOn ?? false}
                onCheckedChange={(checked) => {
                  toggleMutation.mutate({ plugId: plug.id, turnOn: checked });
                }}
                disabled={toggleMutation.isPending || !plug.localIp}
                data-testid={`switch-plug-${plug.id}`}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
