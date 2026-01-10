import { storage } from "./storage";
import { controlSmartPlug } from "./smartPlug";

import type { ScheduledPrint } from "@shared/schema";

let schedulerInterval: NodeJS.Timeout | null = null;
const CHECK_INTERVAL_MS = 30000;

export function startScheduler(): void {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running");
    return;
  }

  console.log("[Scheduler] Starting scheduler service (checking every 30s)");
  
  schedulerInterval = setInterval(async () => {
    await checkScheduledPrints();
  }, CHECK_INTERVAL_MS);

  checkScheduledPrints();
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] Stopped");
  }
}

async function checkScheduledPrints(): Promise<void> {
  try {
    const pendingJobs = await storage.getPendingScheduledPrints();
    const now = new Date();

    for (const job of pendingJobs) {
      const scheduledTime = new Date(job.scheduledTime);
      
      const warmupMinutes = job.printerWarmupMinutes || 2;
      const warmupMs = warmupMinutes * 60 * 1000;
      
      const effectiveStartTime = new Date(scheduledTime.getTime() - warmupMs);
      
      if (now >= effectiveStartTime) {
        console.log(`[Scheduler] Executing scheduled print job ${job.id}`);
        await executeScheduledPrint(job);
      }
    }
  } catch (error) {
    console.error("[Scheduler] Error checking scheduled prints:", error);
  }
}

async function executeScheduledPrint(job: ScheduledPrint): Promise<void> {
  try {
    await storage.updateScheduledPrintStatus(job.id, "executing");

    if (job.smartPlugId) {
      console.log(`[Scheduler] Turning on smart plug ${job.smartPlugId}`);
      const plugResult = await controlSmartPlug({ plugId: job.smartPlugId, turnOn: true });
      
      if (!plugResult.success) {
        throw new Error(`Failed to turn on smart plug: ${plugResult.error}`);
      }
      
      const warmupMinutes = job.printerWarmupMinutes || 2;
      console.log(`[Scheduler] Waiting ${warmupMinutes} minutes for printer warmup...`);
      await sleep(warmupMinutes * 60 * 1000);
    }

    const printer = await storage.getPrinter(job.printerId);
    if (!printer) {
      throw new Error("Printer not found");
    }

    if (!printer.isConnected || !printer.token) {
      console.log("[Scheduler] Printer not connected, attempting to connect...");
      const connected = await attemptPrinterConnection(printer.id, printer.ipAddress);
      if (!connected) {
        throw new Error("Could not connect to printer");
      }
    }

    const file = await storage.getUploadedFileById(job.fileId);
    if (!file) {
      throw new Error("File not found");
    }

    console.log(`[Scheduler] Starting print: ${file.filename}`);
    const printResult = await startPrint(printer.id, file.filename);
    
    if (!printResult.success) {
      throw new Error(printResult.error || "Failed to start print");
    }

    await storage.updateScheduledPrintStatus(job.id, "completed", new Date());
    console.log(`[Scheduler] Scheduled print job ${job.id} completed successfully`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Scheduler] Job ${job.id} failed:`, errorMessage);
    await storage.updateScheduledPrintStatus(job.id, "failed", new Date(), errorMessage);
  }
}

async function attemptPrinterConnection(printerId: number, ipAddress: string): Promise<boolean> {
  try {
    const printer = await storage.getPrinter(printerId);
    if (!printer?.token) {
      console.log("[Scheduler] No saved token for printer, cannot auto-connect");
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`http://${ipAddress}:8080/api/v1/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: printer.token }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      await storage.updatePrinterConnection(printerId, true, printer.token);
      console.log("[Scheduler] Successfully connected to printer");
      return true;
    }

    return false;
  } catch (error) {
    console.error("[Scheduler] Failed to connect to printer:", error);
    return false;
  }
}

async function startPrint(printerId: number, filename: string): Promise<{ success: boolean; error?: string }> {
  try {
    const printer = await storage.getPrinter(printerId);
    if (!printer || !printer.token) {
      return { success: false, error: "Printer not connected" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`http://${printer.ipAddress}:8080/api/v1/start_print`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "token": printer.token,
      },
      body: JSON.stringify({ filename }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      return { success: true };
    }

    const text = await response.text();
    return { success: false, error: `HTTP ${response.status}: ${text}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getSchedulerStatus(): Promise<{
  running: boolean;
  pendingJobs: number;
  nextJobTime: Date | null;
}> {
  const pendingJobs = await storage.getPendingScheduledPrints();
  
  let nextJobTime: Date | null = null;
  if (pendingJobs.length > 0) {
    const sortedJobs = pendingJobs.sort((a, b) => 
      new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
    );
    nextJobTime = new Date(sortedJobs[0].scheduledTime);
  }

  return {
    running: schedulerInterval !== null,
    pendingJobs: pendingJobs.length,
    nextJobTime,
  };
}
