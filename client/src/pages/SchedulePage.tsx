import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import ScheduledPrints from "@/components/ScheduledPrints";
import type { Printer } from "@shared/schema";

export default function SchedulePage() {
  const { data: printers = [], isLoading } = useQuery<Printer[]>({
    queryKey: ["/api/printers"],
  });

  const activePrinter = printers.find((p) => p.isConnected);
  const selectedPrinter = activePrinter || printers[0];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!selectedPrinter) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <CalendarClock className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2" data-testid="text-no-printer">No Printer Configured</h2>
        <p className="text-sm text-muted-foreground">
          Add a printer in Settings first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden px-4 py-3">
      <ScheduledPrints printerId={selectedPrinter.id} />
    </div>
  );
}
