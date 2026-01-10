import { Response } from "express";

export interface PrintNotification {
  type: "print_started" | "print_completed" | "print_stopped";
  printerId: number;
  filename: string | null;
  timestamp: Date;
  durationMinutes?: number;
}

const clients: Map<number, Set<Response>> = new Map();

export function addNotificationClient(printerId: number, res: Response): void {
  if (!clients.has(printerId)) {
    clients.set(printerId, new Set());
  }
  clients.get(printerId)!.add(res);
  
  res.on("close", () => {
    clients.get(printerId)?.delete(res);
  });
}

export function sendNotification(notification: PrintNotification): void {
  const printerClients = clients.get(notification.printerId);
  if (!printerClients || printerClients.size === 0) {
    return;
  }

  const data = JSON.stringify(notification);
  
  Array.from(printerClients).forEach((client) => {
    try {
      client.write(`data: ${data}\n\n`);
    } catch (error) {
      printerClients.delete(client);
    }
  });
  
  console.log(`[Notifications] Sent ${notification.type} to ${printerClients.size} clients for printer ${notification.printerId}`);
}

export function getActiveClientCount(printerId?: number): number {
  if (printerId !== undefined) {
    return clients.get(printerId)?.size ?? 0;
  }
  let total = 0;
  Array.from(clients.values()).forEach((clientSet) => {
    total += clientSet.size;
  });
  return total;
}
