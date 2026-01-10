import { storage } from "./storage";
import { sendNotification } from "./notifications";
import { sendPushNotification } from "./webPush";

const POLL_INTERVAL_MS = 5000;
const SNAPMAKER_PORT = 8080;

const reconnectAttempts: Map<number, number> = new Map();

interface PrinterState {
  lastStatus: string;
  printStartTime: Date | null;
  currentFilename: string | null;
  lastProgress: number;
  isTracking: boolean;
}

const printerStates: Map<number, PrinterState> = new Map();

async function snapmakerRequest(
  ipAddress: string,
  endpoint: string,
  token: string
): Promise<any> {
  const url = `http://${ipAddress}:${SNAPMAKER_PORT}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Snapmaker API error: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return await response.json();
    }

    return null;
  } catch (error) {
    throw error;
  }
}

async function pingPrinter(ipAddress: string, attempt: number = 1): Promise<boolean> {
  const maxAttempts = 2;
  const timeoutMs = 6000;
  
  try {
    const url = `http://${ipAddress}:${SNAPMAKER_PORT}/api/v1/status`;
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    
    const isReachable = response.ok || response.status === 400 || response.status === 401 || response.status === 403;
    if (isReachable) {
      console.log(`[BackgroundPoller] Ping ${ipAddress}: SUCCESS (status ${response.status})`);
    }
    return isReachable;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (attempt < maxAttempts) {
      console.log(`[BackgroundPoller] Ping ${ipAddress}: attempt ${attempt} failed (${errorMessage}), retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return pingPrinter(ipAddress, attempt + 1);
    }
    
    console.log(`[BackgroundPoller] Ping ${ipAddress}: FAILED after ${maxAttempts} attempts (${errorMessage})`);
    return false;
  }
}

async function attemptReconnect(printerId: number, ipAddress: string, token: string): Promise<string | null> {
  try {
    const url = `http://${ipAddress}:${SNAPMAKER_PORT}/api/v1/connect`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `token=${token}`,
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 204) {
      console.log(`[BackgroundPoller] Printer ${printerId} requires touchscreen confirmation`);
      return null;
    }

    if (response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = await response.json();
        if (data.token) {
          await storage.updatePrinter(printerId, {
            token: data.token,
            isConnected: true,
            lastSeen: new Date(),
          });
          console.log(`[BackgroundPoller] Auto-reconnected printer ${printerId}`);
          reconnectAttempts.delete(printerId);
          return data.token;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.log(`[BackgroundPoller] Reconnect attempt failed for printer ${printerId}:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

function isPrintingState(state: string): boolean {
  if (!state) return false;
  const normalized = state.toLowerCase();
  return normalized.includes("print") || normalized.includes("working") || normalized.includes("running");
}

function isPausedState(state: string): boolean {
  if (!state) return false;
  return state.toLowerCase().includes("pause");
}

function isIdleState(state: string): boolean {
  if (!state) return false;
  const normalized = state.toLowerCase();
  return normalized.includes("idle") || normalized === "idle";
}

async function pollPrinter(printerId: number, ipAddress: string, token: string): Promise<void> {
  try {
    const statusData = await snapmakerRequest(
      ipAddress,
      `/api/v1/status?token=${token}`,
      token
    );

    if (!statusData) {
      return;
    }

    const currentState = statusData.status || statusData.state || "idle";
    const currentFile = statusData.current_file ?? statusData.currentFile ?? statusData.filename ?? null;
    const progress = statusData.progress ?? 0;

    let printerState = printerStates.get(printerId);
    if (!printerState) {
      printerState = {
        lastStatus: "idle",
        printStartTime: null,
        currentFilename: null,
        lastProgress: 0,
        isTracking: false,
      };
      printerStates.set(printerId, printerState);
    }

    const wasPrinting = isPrintingState(printerState.lastStatus) || isPausedState(printerState.lastStatus);
    const isPrinting = isPrintingState(currentState);
    const isPaused = isPausedState(currentState);
    const isIdle = isIdleState(currentState);

    if (isPrinting && !printerState.isTracking) {
      console.log(`[BackgroundPoller] Print started on printer ${printerId}: ${currentFile}`);
      printerState.printStartTime = new Date();
      printerState.currentFilename = currentFile;
      printerState.isTracking = true;
      printerState.lastProgress = progress;
      
      sendNotification({
        type: "print_started",
        printerId,
        filename: currentFile,
        timestamp: new Date(),
      });
      
      sendPushNotification(printerId, {
        type: "print_started",
        printerId,
        filename: currentFile,
        timestamp: new Date().toISOString(),
      });
    }

    if (printerState.isTracking && isIdle && wasPrinting) {
      const endTime = new Date();
      const startTime = printerState.printStartTime || endTime;
      const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      
      // Consider print completed if:
      // - Last recorded progress was >= 90% (lowered threshold to account for polling gaps)
      // - OR the print ran for more than 5 minutes (likely a real print that we should record)
      const wasCompleted = printerState.lastProgress >= 90 || (durationSeconds > 300);
      
      console.log(`[BackgroundPoller] Print ${wasCompleted ? 'completed' : 'stopped'} on printer ${printerId}: ${printerState.currentFilename}`);
      console.log(`[BackgroundPoller] Duration: ${Math.floor(durationSeconds / 60)} minutes, Last Progress: ${printerState.lastProgress}%`);
      
      sendNotification({
        type: wasCompleted ? "print_completed" : "print_stopped",
        printerId,
        filename: printerState.currentFilename,
        timestamp: new Date(),
        durationMinutes: Math.floor(durationSeconds / 60),
      });

      sendPushNotification(printerId, {
        type: wasCompleted ? "print_completed" : "print_stopped",
        printerId,
        filename: printerState.currentFilename,
        timestamp: new Date().toISOString(),
        durationMinutes: Math.floor(durationSeconds / 60),
      });

      // Record the print if it appears to be a real completed print (not just a cancelled/aborted job)
      if (wasCompleted && printerState.currentFilename && durationSeconds > 60) {
        try {
          await storage.addPrintStat({
            printerId,
            filename: printerState.currentFilename,
            printTimeSeconds: durationSeconds,
            filamentUsedMm: 0,
          });
          console.log(`[BackgroundPoller] Saved print stats for ${printerState.currentFilename}`);
        } catch (error) {
          console.error(`[BackgroundPoller] Failed to save print stats:`, error);
        }
      }

      printerState.printStartTime = null;
      printerState.currentFilename = null;
      printerState.isTracking = false;
      printerState.lastProgress = 0;
    }

    if (printerState.isTracking) {
      printerState.lastProgress = progress;
    }
    printerState.lastStatus = currentState;

    await storage.updatePrinter(printerId, {
      isConnected: true,
      lastSeen: new Date(),
    });

  } catch (error) {
    console.log(`[BackgroundPoller] Failed to poll printer ${printerId}:`, error instanceof Error ? error.message : 'Unknown error');
    await storage.updatePrinter(printerId, { isConnected: false });
  }
}

async function pollAllPrinters(): Promise<void> {
  try {
    const printers = await storage.getAllPrinters();
    
    for (const printer of printers) {
      const hasToken = !!printer.token;
      const tokenPreview = printer.token ? `${printer.token.substring(0, 8)}...` : 'null';
      
      console.log(`[BackgroundPoller] Checking printer ${printer.id} (${printer.name}): token=${tokenPreview}, isConnected=${printer.isConnected}`);
      
      if (printer.token && printer.isConnected) {
        await pollPrinter(printer.id, printer.ipAddress, printer.token);
      } else if (printer.token && !printer.isConnected) {
        console.log(`[BackgroundPoller] Printer ${printer.id} has token but disconnected, pinging ${printer.ipAddress}...`);
        const isReachable = await pingPrinter(printer.ipAddress);
        console.log(`[BackgroundPoller] Ping result for printer ${printer.id}: ${isReachable ? 'REACHABLE' : 'UNREACHABLE'}`);
        
        if (isReachable) {
          const attempts = reconnectAttempts.get(printer.id) || 0;
          console.log(`[BackgroundPoller] Printer ${printer.id} is reachable but disconnected, attempting reconnect (attempt ${attempts + 1})`);
          
          const newToken = await attemptReconnect(printer.id, printer.ipAddress, printer.token);
          
          if (newToken) {
            console.log(`[BackgroundPoller] Reconnect SUCCESS for printer ${printer.id}, new token: ${newToken.substring(0, 8)}...`);
            await pollPrinter(printer.id, printer.ipAddress, newToken);
          } else {
            console.log(`[BackgroundPoller] Reconnect FAILED for printer ${printer.id}`);
            reconnectAttempts.set(printer.id, attempts + 1);
          }
        }
      } else if (!printer.token) {
        console.log(`[BackgroundPoller] Printer ${printer.id} has NO TOKEN - cannot auto-reconnect. Manual connection required first.`);
      }
    }
  } catch (error) {
    console.error("[BackgroundPoller] Error polling printers:", error);
  }
}

let pollingInterval: NodeJS.Timeout | null = null;

export function startBackgroundPolling(): void {
  if (pollingInterval) {
    console.log("[BackgroundPoller] Already running");
    return;
  }

  console.log(`[BackgroundPoller] Starting background polling (every ${POLL_INTERVAL_MS / 1000}s)`);
  
  pollAllPrinters();
  
  pollingInterval = setInterval(pollAllPrinters, POLL_INTERVAL_MS);
}

export function stopBackgroundPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("[BackgroundPoller] Stopped background polling");
  }
}

export function isPollingActive(): boolean {
  return pollingInterval !== null;
}

export function getPrinterState(printerId: number): PrinterState | undefined {
  return printerStates.get(printerId);
}
