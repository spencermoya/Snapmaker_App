import { storage } from "./storage";
import type { Printer, PrinterStatus } from "@shared/schema";
import { notifyPrintComplete, notifyPrinterDisconnected, notifyPrinterOnline, isPushEnabled } from "./pushService";
import { merossToggle, isMerossConnected, merossLogin } from "./merossService";

const SNAPMAKER_PORT = 8080;
const POLL_INTERVAL_CONNECTED = 5000;
const POLL_INTERVAL_DISCONNECTED = 15000;
const RECONNECT_COOLDOWN = 5000;

interface PrinterState {
  printerId: number;
  lastPrintState: string;
  printStartTime: number | null;
  currentFilename: string | null;
  wasOnline: boolean;
  lastReconnectAttempt: number;
  consecutiveFailures: number;
}

const printerStates = new Map<number, PrinterState>();
let isRunning = false;
let pollTimer: NodeJS.Timeout | null = null;

async function snapmakerRequest(
  ipAddress: string,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: string,
  token?: string | null
): Promise<any> {
  const url = `http://${ipAddress}:${SNAPMAKER_PORT}${endpoint}`;
  
  const response = await fetch(url, {
    method,
    headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
    body,
    signal: AbortSignal.timeout(5000),
  });

  if (response.status === 204) {
    return { status: 204 };
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return await response.json();
  }

  return { status: response.status };
}

async function checkPrinterOnline(ipAddress: string): Promise<boolean> {
  try {
    const url = `http://${ipAddress}:${SNAPMAKER_PORT}/api/v1/status`;
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    const isOnline = response.ok || response.status === 400 || response.status === 401 || response.status === 403;
    console.log(`[BackgroundService] Ping ${ipAddress}:${SNAPMAKER_PORT} -> ${response.status} (online: ${isOnline})`);
    return isOnline;
  } catch (error) {
    console.log(`[BackgroundService] Ping ${ipAddress}:${SNAPMAKER_PORT} -> FAILED: ${error instanceof Error ? error.message : 'unknown error'}`);
    return false;
  }
}

async function getPrinterStatus(printer: Printer): Promise<PrinterStatus | null> {
  if (!printer.token) return null;
  
  try {
    const statusData = await snapmakerRequest(
      printer.ipAddress,
      `/api/v1/status?token=${printer.token}`,
      "GET",
      undefined,
      printer.token
    );

    const stateValue = typeof statusData.state === 'string' && statusData.state 
      ? statusData.state 
      : typeof statusData.status === 'string' && statusData.status 
        ? statusData.status 
        : "idle";
    
    return {
      state: stateValue,
      temperature: {
        nozzle: statusData.temperature?.nozzle || 0,
        bed: statusData.temperature?.bed || 0,
        targetNozzle: statusData.temperature?.target_nozzle || statusData.temperature?.targetNozzle || 0,
        targetBed: statusData.temperature?.target_bed || statusData.temperature?.targetBed || 0,
      },
      progress: statusData.progress || 0,
      currentFile: statusData.currentFile || statusData.current_file || null,
      timeRemaining: statusData.remainingTime || statusData.time_remaining || null,
      elapsedTime: statusData.elapsedTime || statusData.elapsed_time || null,
    };
  } catch {
    return null;
  }
}

async function attemptReconnect(printer: Printer): Promise<boolean> {
  if (!printer.token) return false;
  
  try {
    console.log(`[BackgroundService] Attempting auto-reconnect for ${printer.name}`);
    
    const result = await snapmakerRequest(
      printer.ipAddress,
      "/api/v1/connect",
      "POST",
      `token=${printer.token}`,
      printer.token
    );

    if (result.token || result.status === 200 || result.status === 204) {
      if (result.token) {
        await storage.updatePrinter(printer.id, {
          token: result.token,
          isConnected: true,
          lastSeen: new Date(),
        });
      } else {
        await storage.updatePrinter(printer.id, {
          isConnected: true,
          lastSeen: new Date(),
        });
      }
      console.log(`[BackgroundService] Auto-reconnected to ${printer.name}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.log(`[BackgroundService] Reconnect failed for ${printer.name}:`, error instanceof Error ? error.message : error);
    return false;
  }
}

function getOrCreateState(printerId: number): PrinterState {
  let state = printerStates.get(printerId);
  if (!state) {
    state = {
      printerId,
      lastPrintState: "idle",
      printStartTime: null,
      currentFilename: null,
      wasOnline: false,
      lastReconnectAttempt: 0,
      consecutiveFailures: 0,
    };
    printerStates.set(printerId, state);
  }
  return state;
}

function extractFilamentFromGcode(gcode: string): number | null {
  const lines = gcode.split('\n').slice(0, 100);
  
  for (const line of lines) {
    let match = line.match(/;filament\s+used\s*[:\[=]\s*([\d.]+)\s*g/i);
    if (match) {
      return parseFloat(match[1]);
    }
    
    match = line.match(/;Filament\s+weight\s*=\s*([\d.]+)\s*g/i);
    if (match) {
      return parseFloat(match[1]);
    }
    
    match = line.match(/;estimated_filament_weight_g\s*=\s*([\d.]+)/i);
    if (match) {
      return parseFloat(match[1]);
    }
    
    match = line.match(/;Filament\s+used\s*:\s*([\d.]+)\s*mm/i);
    if (match) {
      const mm = parseFloat(match[1]);
      return mm * 0.00246;
    }
  }
  
  return null;
}

async function handlePrintStateChange(
  printerId: number,
  oldState: string,
  newState: string,
  status: PrinterStatus
): Promise<void> {
  const state = getOrCreateState(printerId);
  
  if (oldState !== "running" && newState === "running") {
    console.log(`[BackgroundService] Print started for printer ${printerId}`);
    state.printStartTime = Date.now();
    state.currentFilename = status.currentFile;
  }
  
  if (oldState === "running" && (newState === "idle" || newState === "finished")) {
    console.log(`[BackgroundService] Print completed for printer ${printerId}`);
    
    if (state.printStartTime) {
      const printDuration = Math.floor((Date.now() - state.printStartTime) / 1000);
      
      await storage.incrementPrintCount(printerId);
      await storage.addPrintTime(printerId, printDuration);
      
      let filamentUsed = 0;
      if (state.currentFilename) {
        try {
          const files = await storage.getUploadedFiles(printerId);
          const matchingFile = files.find(f => 
            f.filename === state.currentFilename || 
            f.displayName === state.currentFilename
          );
          
          if (matchingFile?.fileContent) {
            const extracted = extractFilamentFromGcode(matchingFile.fileContent);
            if (extracted !== null && extracted > 0) {
              filamentUsed = extracted;
              await storage.addFilamentUsed(printerId, filamentUsed);
              console.log(`[BackgroundService] Filament used: ${filamentUsed.toFixed(2)}g`);
            }
          }
        } catch (error) {
          console.log(`[BackgroundService] Could not extract filament usage:`, error);
        }
        
        await storage.updatePrinterStats(printerId, {
          lastPrintFilename: state.currentFilename,
          lastPrintCompletedAt: new Date(),
        });
        
        if (isPushEnabled()) {
          notifyPrintComplete(state.currentFilename).catch(err => 
            console.log(`[BackgroundService] Failed to send print complete notification:`, err)
          );
        }
      }
      
      console.log(`[BackgroundService] Stats updated: +1 print, +${printDuration}s print time, +${filamentUsed.toFixed(2)}g filament`);
    }
    
    state.printStartTime = null;
    state.currentFilename = null;
  }
  
  state.lastPrintState = newState;
}

async function pollPrinter(printer: Printer): Promise<void> {
  const state = getOrCreateState(printer.id);
  
  const isOnline = await checkPrinterOnline(printer.ipAddress);
  
  if (!isOnline) {
    state.consecutiveFailures++;
    
    if (state.wasOnline && printer.isConnected) {
      console.log(`[BackgroundService] ${printer.name} went offline`);
      await storage.updatePrinter(printer.id, { isConnected: false });
      
      if (isPushEnabled()) {
        notifyPrinterDisconnected(printer.name).catch(err => 
          console.log(`[BackgroundService] Failed to send disconnect notification:`, err)
        );
      }
    }
    
    state.wasOnline = false;
    return;
  }
  
  state.consecutiveFailures = 0;
  const wasOffline = !state.wasOnline;
  state.wasOnline = true;
  
  if (wasOffline) {
    console.log(`[BackgroundService] ${printer.name} is reachable at ${printer.ipAddress}`);
  }
  
  // Re-fetch printer data to get current isConnected state from database
  const currentPrinter = await storage.getPrinter(printer.id);
  if (!currentPrinter) return;
  
  // If printer is online, has token, autoConnect enabled, but NOT connected - try to reconnect
  if (currentPrinter.token && currentPrinter.autoConnect !== false && !currentPrinter.isConnected) {
    const now = Date.now();
    if (now - state.lastReconnectAttempt > RECONNECT_COOLDOWN) {
      console.log(`[BackgroundService] Attempting auto-reconnect for ${currentPrinter.name} (has token, autoConnect=${currentPrinter.autoConnect}, isConnected=${currentPrinter.isConnected})`);
      state.lastReconnectAttempt = now;
      const reconnected = await attemptReconnect(currentPrinter);
      if (reconnected) {
        console.log(`[BackgroundService] Successfully auto-reconnected to ${currentPrinter.name}`);
        
        if (isPushEnabled()) {
          notifyPrinterOnline(currentPrinter.name).catch(err => 
            console.log(`[BackgroundService] Failed to send online notification:`, err)
          );
        }
        return;
      } else {
        console.log(`[BackgroundService] Auto-reconnect failed for ${currentPrinter.name}, will retry in ${RECONNECT_COOLDOWN / 1000}s`);
      }
    }
    return;
  }
  
  if (!currentPrinter.token) {
    if (wasOffline) {
      console.log(`[BackgroundService] ${currentPrinter.name} has no saved token - manual connection required first`);
    }
    return;
  }
  
  if (!currentPrinter.isConnected) {
    return;
  }
  
  const status = await getPrinterStatus(currentPrinter);
  
  if (!status) {
    if (currentPrinter.isConnected) {
      console.log(`[BackgroundService] Lost connection to ${currentPrinter.name}, marking as disconnected`);
      await storage.updatePrinter(currentPrinter.id, { isConnected: false });
    }
    return;
  }
  
  await storage.updatePrinter(currentPrinter.id, { lastSeen: new Date() });
  
  if (status.state !== state.lastPrintState) {
    await handlePrintStateChange(currentPrinter.id, state.lastPrintState, status.state, status);
  }
}

async function executeScheduledPrint(scheduledId: number, printerId: number, fileId: number | null, filename: string, plugId: number | null, powerOnPlug: boolean): Promise<void> {
  console.log(`[BackgroundService] Executing scheduled print #${scheduledId}: ${filename}`);
  
  await storage.updateScheduledPrint(scheduledId, { status: "running", executedAt: new Date() });

  try {
    if (powerOnPlug && plugId) {
      const plug = await storage.getSmartPlug(plugId);
      if (plug) {
        console.log(`[BackgroundService] Powering on smart plug: ${plug.name}`);
        
        if (!isMerossConnected()) {
          const email = await storage.getSetting("meross_email");
          const password = await storage.getSetting("meross_password");
          if (email && password) {
            await merossLogin(email, password);
          }
        }
        
        if (isMerossConnected()) {
          await merossToggle(plug.deviceId, plug.channel ?? 0, true);
          await storage.updateSmartPlug(plug.id, { isOn: true, lastSeen: new Date() });
          console.log(`[BackgroundService] Waiting 30s for printer to boot...`);
          await new Promise(resolve => setTimeout(resolve, 30000));
        } else {
          console.log(`[BackgroundService] Meross not connected, skipping plug power-on`);
        }
      }
    }

    const printer = await storage.getPrinter(printerId);
    if (!printer) {
      throw new Error("Printer not found");
    }

    const isOnline = await checkPrinterOnline(printer.ipAddress);
    if (!isOnline) {
      throw new Error("Printer is not reachable on the network");
    }

    if (!printer.isConnected || !printer.token) {
      if (printer.token) {
        const reconnected = await attemptReconnect(printer);
        if (!reconnected) {
          throw new Error("Could not connect to printer - reconnection failed");
        }
      } else {
        throw new Error("Printer has no saved token - manual connection required first");
      }
    }

    const currentPrinter = await storage.getPrinter(printerId);
    if (!currentPrinter?.token) {
      throw new Error("Printer lost connection during scheduled print setup");
    }

    if (!fileId) {
      throw new Error("No file ID associated with this scheduled print");
    }

    const file = await storage.getUploadedFile(fileId, printerId);
    if (!file || !file.fileContent) {
      throw new Error("File not found or has no content");
    }

    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    const parts: string[] = [];
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="token"\r\n\r\n`);
    parts.push(`${currentPrinter.token}\r\n`);
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n`);
    parts.push(`Content-Type: application/octet-stream\r\n\r\n`);
    parts.push(file.fileContent);
    parts.push(`\r\n--${boundary}--\r\n`);
    const body = parts.join("");

    const uploadUrl = `http://${currentPrinter.ipAddress}:${SNAPMAKER_PORT}/api/v1/upload`;
    const uploadResp = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(120000),
    });

    if (!uploadResp.ok) {
      throw new Error(`File upload failed: ${uploadResp.status}`);
    }

    const execUrl = `http://${currentPrinter.ipAddress}:${SNAPMAKER_PORT}/api/v1/execute_code`;
    const filePath = `wifiTransfer/${file.filename}`;

    const selectParams = new URLSearchParams();
    selectParams.append("token", currentPrinter.token);
    selectParams.append("code", `M23 ${filePath}`);
    const selectResp = await fetch(execUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: selectParams.toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!selectResp.ok) {
      throw new Error(`Failed to select file: ${selectResp.status}`);
    }

    const startParams = new URLSearchParams();
    startParams.append("token", currentPrinter.token);
    startParams.append("code", "M24");
    const startResp = await fetch(execUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: startParams.toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!startResp.ok) {
      throw new Error(`Failed to start print: ${startResp.status}`);
    }

    await storage.updateScheduledPrint(scheduledId, { status: "completed" });
    console.log(`[BackgroundService] Scheduled print #${scheduledId} started successfully`);

    if (isPushEnabled()) {
      const { sendPushNotification } = await import("./pushService");
      sendPushNotification({
        title: "Scheduled Print Started",
        body: `${filename} has started printing`,
        data: { type: "scheduled_print_started", filename },
      }).catch(err => console.log("[BackgroundService] Push notification error:", err));
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[BackgroundService] Scheduled print #${scheduledId} failed:`, errorMsg);
    await storage.updateScheduledPrint(scheduledId, { 
      status: "failed", 
      errorMessage: errorMsg 
    });

    if (isPushEnabled()) {
      const { sendPushNotification } = await import("./pushService");
      sendPushNotification({
        title: "Scheduled Print Failed",
        body: `${filename} failed: ${errorMsg}`,
        data: { type: "scheduled_print_failed", filename },
      }).catch(err => console.log("[BackgroundService] Push notification error:", err));
    }
  }
}

async function checkScheduledPrints(): Promise<void> {
  try {
    const pendingPrints = await storage.getPendingScheduledPrints();
    
    for (const print of pendingPrints) {
      await executeScheduledPrint(
        print.id,
        print.printerId,
        print.fileId,
        print.filename,
        print.plugId,
        print.powerOnPlug ?? false
      );
    }
  } catch (error) {
    console.error("[BackgroundService] Error checking scheduled prints:", error);
  }
}

async function pollAllPrinters(): Promise<void> {
  try {
    const printers = await storage.getAllPrinters();
    console.log(`[BackgroundService] Polling ${printers.length} printer(s)...`);
    
    await Promise.all(printers.map(printer => pollPrinter(printer)));
    
    await checkScheduledPrints();
  } catch (error) {
    console.error("[BackgroundService] Poll error:", error);
  }
  
  if (isRunning) {
    const hasConnected = Array.from(printerStates.values()).some(s => s.wasOnline);
    const interval = hasConnected ? POLL_INTERVAL_CONNECTED : POLL_INTERVAL_DISCONNECTED;
    pollTimer = setTimeout(pollAllPrinters, interval);
  }
}

export function startBackgroundService(): void {
  if (isRunning) {
    console.log("[BackgroundService] Already running");
    return;
  }
  
  console.log("[BackgroundService] Starting background connection service");
  isRunning = true;
  pollAllPrinters();
}

export function stopBackgroundService(): void {
  console.log("[BackgroundService] Stopping background connection service");
  isRunning = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

export function getBackgroundServiceStatus(): {
  running: boolean;
  printerStates: { printerId: number; wasOnline: boolean; lastPrintState: string; printStartTime: number | null }[];
} {
  return {
    running: isRunning,
    printerStates: Array.from(printerStates.values()).map(s => ({
      printerId: s.printerId,
      wasOnline: s.wasOnline,
      lastPrintState: s.lastPrintState,
      printStartTime: s.printStartTime,
    })),
  };
}
