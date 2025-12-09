import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

const data = Array.from({ length: 20 }, (_, i) => ({
  time: i,
  nozzle: 200 + Math.random() * 5 - 2.5,
  bed: 60 + Math.random() * 2 - 1,
  targetNozzle: 200,
  targetBed: 60,
}));

export default function TemperatureChart() {
  return (
    <Card className="col-span-1 lg:col-span-2 shadow-lg">
      <CardHeader>
        <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Temperature History
        </CardTitle>
      </CardHeader>
      <CardContent className="pl-2">
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" opacity={0.3} />
              <XAxis 
                dataKey="time" 
                stroke="hsl(var(--muted-foreground))" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false} 
                domain={['auto', 'auto']}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: "hsl(var(--popover))", 
                  borderColor: "hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--popover-foreground))"
                }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Line 
                type="monotone" 
                dataKey="nozzle" 
                stroke="hsl(var(--chart-1))" 
                strokeWidth={2} 
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                animationDuration={1000}
              />
              <Line 
                type="monotone" 
                dataKey="bed" 
                stroke="hsl(var(--chart-2))" 
                strokeWidth={2} 
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                animationDuration={1000}
              />
              <Line 
                type="step" 
                dataKey="targetNozzle" 
                stroke="hsl(var(--chart-1))" 
                strokeDasharray="5 5" 
                strokeWidth={1} 
                dot={false}
                opacity={0.5}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        <div className="flex gap-6 justify-center mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-1))]"></div>
            <span className="text-sm font-mono text-muted-foreground">Nozzle: 200°C</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[hsl(var(--chart-2))]"></div>
            <span className="text-sm font-mono text-muted-foreground">Bed: 60°C</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
