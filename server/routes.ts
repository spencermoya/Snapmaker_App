import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { startWatcher, stopWatcher, getWatcherStatus, initializeWatcher } from "./fileWatcher";
import { startLubanProxy, stopLubanProxy, getLubanProxyStatus, initializeLubanProxy } from "./lubanProxy";
import { extractThumbnail } from "./thumbnailExtractor";
import { getVapidPublicKey, isPushEnabled } from "./pushService";
import { startStream, stopStream, getStreamInfo, getHlsDirectory, playlistExists } from "./streamService";
import { insertPrinterSchema, dashboardPreferencesSchema, type PrinterStatus } from "@shared/schema";
import { z } from "zod";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [".gcode", ".nc", ".cnc"];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only G-code files (.gcode, .nc, .cnc) are allowed"));
    }
  },
});

const SNAPMAKER_PORT = 8080;

async function snapmakerRequest(
  ipAddress: string,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: string,
  token?: string | null
): Promise<any> {
  const url = `http://${ipAddress}:${SNAPMAKER_PORT}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
      body,
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 204) {
      return { status: 204 };
    }

    if (!response.ok && response.status !== 204) {
      throw new Error(`Snapmaker API error: ${response.status}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return await response.json();
    }

    return { status: response.status };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to connect to printer at ${ipAddress}: ${error.message}`);
    }
    throw error;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Serve SSL certificate for iOS installation
  app.get("/certificate", (req, res) => {
    const certPath = path.join(process.cwd(), "certs", "server.crt");
    
    if (!fs.existsSync(certPath)) {
      return res.status(404).send(`
        <html>
          <head><title>Certificate Not Found</title></head>
          <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>SSL Certificate Not Found</h1>
            <p>No certificate has been generated yet.</p>
            <p>Run <code>npm run generate-certs</code> on your Raspberry Pi to create one.</p>
          </body>
        </html>
      `);
    }
    
    // Read the certificate
    const cert = fs.readFileSync(certPath);
    
    // Set headers for iOS to recognize it as a certificate
    res.setHeader("Content-Type", "application/x-x509-ca-cert");
    res.setHeader("Content-Disposition", 'attachment; filename="snapmaker-ca.cer"');
    res.send(cert);
  });

  // Show a helpful page for iOS certificate installation
  app.get("/install-cert", (req, res) => {
    const certPath = path.join(process.cwd(), "certs", "server.crt");
    const certExists = fs.existsSync(certPath);
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Install SSL Certificate</title>
        <style>
          body { 
            font-family: -apple-system, system-ui, sans-serif; 
            padding: 20px; 
            max-width: 600px; 
            margin: 0 auto;
            background: #1a1a1a;
            color: #fff;
          }
          h1 { color: #4ade80; }
          .step { 
            background: #2a2a2a; 
            padding: 15px; 
            margin: 10px 0; 
            border-radius: 8px;
            border-left: 4px solid #4ade80;
          }
          .step-num { 
            display: inline-block;
            width: 24px;
            height: 24px;
            background: #4ade80;
            color: #1a1a1a;
            border-radius: 50%;
            text-align: center;
            font-weight: bold;
            margin-right: 10px;
          }
          .button {
            display: inline-block;
            background: #4ade80;
            color: #1a1a1a;
            padding: 15px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin: 20px 0;
          }
          .warning { 
            background: #433; 
            padding: 15px; 
            border-radius: 8px;
            border-left: 4px solid #f87171;
          }
        </style>
      </head>
      <body>
        <h1>Install SSL Certificate</h1>
        <p>To use this app on your iPhone/iPad, you need to install and trust the SSL certificate.</p>
        
        ${certExists ? `
          <a href="/certificate" class="button">Download Certificate</a>
          
          <div class="step">
            <span class="step-num">1</span>
            <strong>Tap the button above</strong><br>
            Safari will prompt you to download a profile. Tap "Allow".
          </div>
          
          <div class="step">
            <span class="step-num">2</span>
            <strong>Open Settings</strong><br>
            Go to Settings - you'll see "Profile Downloaded" near the top. Tap it.
          </div>
          
          <div class="step">
            <span class="step-num">3</span>
            <strong>Install the Profile</strong><br>
            Tap "Install" in the top right, then confirm.
          </div>
          
          <div class="step">
            <span class="step-num">4</span>
            <strong>Trust the Certificate</strong><br>
            Go to Settings → General → About → Certificate Trust Settings.<br>
            Find the certificate and toggle it ON.
          </div>
          
          <div class="step">
            <span class="step-num">5</span>
            <strong>Access via HTTPS</strong><br>
            Return to Safari and visit the HTTPS version of this app.
          </div>
        ` : `
          <div class="warning">
            <strong>Certificate Not Generated</strong><br>
            Run <code>npm run generate-certs</code> on your Raspberry Pi first.
          </div>
        `}
      </body>
      </html>
    `);
  });

  app.get("/api/printers", async (req, res) => {
    try {
      const printers = await storage.getAllPrinters();
      res.json(printers);
    } catch (error) {
      console.error("[api/printers] Database error:", error);
      res.status(500).json({ error: "Failed to fetch printers" });
    }
  });

  app.post("/api/printers", async (req, res) => {
    try {
      const data = insertPrinterSchema.parse(req.body);
      const printer = await storage.createPrinter(data);
      res.status(201).json(printer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        console.error("[api/printers POST] Database error:", error);
        res.status(500).json({ error: "Failed to create printer" });
      }
    }
  });

  app.post("/api/printers/:id/connect", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      const existingToken = printer.token || "";
      console.log(`[Connect] Attempting to connect to ${printer.name} at ${printer.ipAddress}, existing token: ${existingToken ? 'yes' : 'no'}`);
      
      const result = await snapmakerRequest(
        printer.ipAddress,
        "/api/v1/connect",
        "POST",
        `token=${existingToken}`,
        existingToken
      );

      // Log response without exposing token
      const logSafeResult = { ...result };
      if (logSafeResult.token) logSafeResult.token = '[REDACTED]';
      if (logSafeResult.data?.token) logSafeResult.data = { ...logSafeResult.data, token: '[REDACTED]' };
      console.log(`[Connect] Response from printer:`, JSON.stringify(logSafeResult));

      // Check for token in various possible locations in the response
      const token = result.token || result.data?.token || result.result?.token;
      
      if (token) {
        console.log(`[Connect] Token received, saving to database`);
        await storage.updatePrinter(printerId, {
          token: token,
          isConnected: true,
          lastSeen: new Date(),
        });
        return res.json({
          message: "Connected successfully",
          requiresConfirmation: false,
          tokenSaved: true,
        });
      }

      if (result.status === 204) {
        console.log(`[Connect] Waiting for touchscreen confirmation`);
        return res.json({
          message: "Please confirm connection on printer touchscreen, then click Connect again",
          requiresConfirmation: true,
        });
      }

      // If we get here with status 200 but no token, the connection succeeded
      // but the printer didn't give us a new token - try to use existing token
      if (result.status === 200 && existingToken) {
        console.log(`[Connect] Connected with existing token`);
        await storage.updatePrinter(printerId, {
          isConnected: true,
          lastSeen: new Date(),
        });
        return res.json({
          message: "Connected successfully with existing token",
          requiresConfirmation: false,
          tokenSaved: true,
        });
      }

      // Connected but no token - this is a problem, warn the user
      console.log(`[Connect] WARNING: Connected but no token received or saved!`);
      await storage.updatePrinter(printerId, {
        isConnected: true,
        lastSeen: new Date(),
      });

      res.json({
        message: "Connected, but no authentication token received. Auto-connect may not work.",
        requiresConfirmation: false,
        tokenSaved: false,
      });
    } catch (error) {
      console.error(`[Connect] Error:`, error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to connect to printer",
      });
    }
  });

  app.get("/api/printers/:id/status", async (req, res) => {
    const printerId = parseInt(req.params.id);
    try {
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      if (!printer.token) {
        return res.status(400).json({ error: "Printer not connected. Connect first." });
      }

      const statusData = await snapmakerRequest(
        printer.ipAddress,
        `/api/v1/status?token=${printer.token}`,
        "GET",
        undefined,
        printer.token
      );

      await storage.updatePrinter(printerId, {
        isConnected: true,
        lastSeen: new Date(),
      });

      // Filter out HTTP status codes - only use string states like "idle", "running", "paused"
      const rawState = statusData.status || statusData.state;
      const state = (typeof rawState === 'string' && !/^\d+$/.test(rawState)) ? rawState : "idle";
      
      const status: PrinterStatus = {
        state,
        temperature: {
          nozzle: statusData.temperature?.nozzle || 0,
          bed: statusData.temperature?.bed || 0,
          targetNozzle: statusData.temperature?.target_nozzle || 0,
          targetBed: statusData.temperature?.target_bed || 0,
        },
        progress: statusData.progress || 0,
        currentFile: statusData.current_file || null,
        timeRemaining: statusData.time_remaining || null,
      };

      res.json(status);
    } catch (error) {
      await storage.updatePrinter(printerId, { isConnected: false });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to get printer status",
      });
    }
  });

  app.post("/api/printers/:id/disconnect", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      if (printer.token) {
        await snapmakerRequest(
          printer.ipAddress,
          "/api/v1/disconnect",
          "POST",
          `token=${printer.token}`,
          printer.token
        );
      }

      // Only set isConnected to false - KEEP the token for auto-reconnect!
      await storage.updatePrinter(printerId, {
        isConnected: false,
      });

      res.json({ message: "Disconnected successfully" });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to disconnect",
      });
    }
  });

  app.delete("/api/printers/:id", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      await storage.deletePrinter(printerId);
      res.json({ message: "Printer deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete printer" });
    }
  });

  app.post("/api/printers/:id/save-token", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: "Token is required" });
      }

      await storage.updatePrinter(printerId, { token });
      res.json({ message: "Token saved successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to save token" });
    }
  });

  app.get("/api/printers/:id/ping", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      const url = `http://${printer.ipAddress}:${SNAPMAKER_PORT}/api/v1/status`;
      const response = await fetch(url, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });

      res.json({ 
        online: response.ok || response.status === 401 || response.status === 403,
        hasToken: !!printer.token 
      });
    } catch (error) {
      res.json({ online: false, hasToken: false });
    }
  });

  app.post("/api/printers/:id/auto-reconnect", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      if (!printer.token) {
        return res.status(400).json({ 
          success: false, 
          error: "No saved token. Manual connection required first." 
        });
      }

      const result = await snapmakerRequest(
        printer.ipAddress,
        "/api/v1/connect",
        "POST",
        `token=${printer.token}`,
        printer.token
      );

      if (result.token || result.status === 200) {
        if (result.token) {
          await storage.updatePrinter(printerId, {
            token: result.token,
            isConnected: true,
            lastSeen: new Date(),
          });
        } else {
          await storage.updatePrinter(printerId, {
            isConnected: true,
            lastSeen: new Date(),
          });
        }
        return res.json({ success: true, message: "Auto-reconnected successfully" });
      }

      if (result.status === 204) {
        return res.json({ 
          success: false, 
          requiresConfirmation: true,
          message: "Touchscreen confirmation required" 
        });
      }

      res.json({ success: false, error: "Could not reconnect" });
    } catch (error) {
      res.json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Reconnection failed" 
      });
    }
  });

  app.post("/api/printers/:id/jog", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      if (!printer.token) {
        return res.status(400).json({ error: "Printer not connected" });
      }

      const { axis, distance } = req.body;
      
      if (!axis || distance === undefined) {
        return res.status(400).json({ error: "Axis and distance are required" });
      }

      const sendGcode = async (code: string) => {
        console.log(`Sending G-code: ${code}`);
        return await snapmakerRequest(
          printer.ipAddress,
          "/api/v1/execute_code",
          "POST",
          `token=${encodeURIComponent(printer.token!)}&code=${encodeURIComponent(code)}`,
          printer.token!
        );
      };

      await sendGcode("G91");
      await sendGcode(`G0 ${axis.toUpperCase()}${distance} F3000`);
      await sendGcode("G90");

      res.json({ message: "Jog command sent" });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to send jog command",
      });
    }
  });

  app.post("/api/printers/:id/home", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      if (!printer.token) {
        return res.status(400).json({ error: "Printer not connected" });
      }

      const { axes } = req.body;
      const homeAxes = axes || "XYZ";

      const gcode = `G28 ${homeAxes}`;
      await snapmakerRequest(
        printer.ipAddress,
        "/api/v1/execute_code",
        "POST",
        `token=${encodeURIComponent(printer.token)}&code=${encodeURIComponent(gcode)}`,
        printer.token
      );

      res.json({ message: "Home command sent" });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to send home command",
      });
    }
  });

  // Emergency stop endpoint
  app.post("/api/printers/:id/emergency-stop", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      if (!printer.token) {
        return res.status(400).json({ error: "Printer not connected" });
      }

      // M112 is the emergency stop command
      await snapmakerRequest(
        printer.ipAddress,
        "/api/v1/execute_code",
        "POST",
        `token=${encodeURIComponent(printer.token)}&code=${encodeURIComponent("M112")}`,
        printer.token
      );

      res.json({ message: "Emergency stop sent" });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to send emergency stop",
      });
    }
  });

  // Light control endpoint (toggle enclosure LED)
  app.post("/api/printers/:id/light", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      if (!printer.token) {
        return res.status(400).json({ error: "Printer not connected" });
      }

      const { enabled } = req.body;
      // M1010 S3 P<0-100> controls LED brightness (0 = off, 100 = full)
      const brightness = enabled ? 100 : 0;
      const gcode = `M1010 S3 P${brightness}`;
      
      await snapmakerRequest(
        printer.ipAddress,
        "/api/v1/execute_code",
        "POST",
        `token=${encodeURIComponent(printer.token)}&code=${encodeURIComponent(gcode)}`,
        printer.token
      );

      res.json({ message: enabled ? "Light turned on" : "Light turned off", enabled });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to control light",
      });
    }
  });

  // Fan control endpoint (toggle cooling fan)
  app.post("/api/printers/:id/fan", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      if (!printer.token) {
        return res.status(400).json({ error: "Printer not connected" });
      }

      const { enabled } = req.body;
      // M106 turns fan on, M107 turns fan off
      // M106 P0 S<0-255> for precise control
      const gcode = enabled ? "M106 S255" : "M107";
      
      await snapmakerRequest(
        printer.ipAddress,
        "/api/v1/execute_code",
        "POST",
        `token=${encodeURIComponent(printer.token)}&code=${encodeURIComponent(gcode)}`,
        printer.token
      );

      res.json({ message: enabled ? "Fan turned on" : "Fan turned off", enabled });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to control fan",
      });
    }
  });

  app.get("/api/printers/:id/files", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      console.log(`Fetching files for printer ${printerId}`);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        console.log(`Printer ${printerId} not found`);
        return res.status(404).json({ error: "Printer not found" });
      }

      if (!printer.token) {
        console.log(`Printer ${printerId} not connected (no token)`);
        return res.status(400).json({ error: "Printer not connected" });
      }

      console.log(`Requesting files from ${printer.ipAddress}`);
      const result = await snapmakerRequest(
        printer.ipAddress,
        `/api/v1/files?token=${printer.token}`,
        "GET",
        undefined,
        printer.token
      );
      console.log(`Files response:`, JSON.stringify(result).substring(0, 500));

      const files = (result.files || []).map((file: any, index: number) => ({
        id: index + 1,
        name: file.name || file.filename || "Unknown",
        size: file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "Unknown",
        date: file.date || file.modified || "Unknown",
      }));

      console.log(`Returning ${files.length} files`);
      res.json(files);
    } catch (error) {
      console.log(`Files error:`, error instanceof Error ? error.message : error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to fetch files",
      });
    }
  });

  app.post("/api/printers/:id/print", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      if (!printer.token) {
        return res.status(400).json({ error: "Printer not connected" });
      }

      const { fileId } = req.body;
      
      if (!fileId) {
        return res.status(400).json({ error: "File ID is required" });
      }

      const file = await storage.getUploadedFile(parseInt(fileId), printerId);
      
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }

      if (!file.fileContent) {
        return res.status(400).json({ error: "No file content stored. Please upload the G-code file first." });
      }

      const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
      
      const parts: string[] = [];
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="token"\r\n`);
      parts.push(`\r\n`);
      parts.push(`${printer.token}\r\n`);
      parts.push(`--${boundary}\r\n`);
      parts.push(`Content-Disposition: form-data; name="file"; filename="${file.filename}"\r\n`);
      parts.push(`Content-Type: application/octet-stream\r\n`);
      parts.push(`\r\n`);
      parts.push(file.fileContent);
      parts.push(`\r\n--${boundary}--\r\n`);
      
      const body = parts.join("");

      const url = `http://${printer.ipAddress}:${SNAPMAKER_PORT}/api/v1/upload`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      // Now start the print using G-code commands
      // Snapmaker stores uploaded files in wifiTransfer/ directory
      // M23 selects the file, M24 starts printing
      const startPrintUrl = `http://${printer.ipAddress}:${SNAPMAKER_PORT}/api/v1/execute_code`;
      const filePath = `wifiTransfer/${file.filename}`;
      
      // First, select the file with M23
      const selectParams = new URLSearchParams();
      selectParams.append("token", printer.token);
      selectParams.append("code", `M23 ${filePath}`);
      
      const selectResponse = await fetch(startPrintUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: selectParams.toString(),
        signal: AbortSignal.timeout(10000),
      });

      console.log(`[print] M23 select file response: ${selectResponse.status}`);
      if (!selectResponse.ok) {
        const errorText = await selectResponse.text().catch(() => "");
        console.log(`[print] M23 error: ${errorText}`);
        throw new Error(`Failed to select file for printing: ${selectResponse.status}`);
      }

      // Then start the print with M24
      const startParams = new URLSearchParams();
      startParams.append("token", printer.token);
      startParams.append("code", "M24");
      
      const startResponse = await fetch(startPrintUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: startParams.toString(),
        signal: AbortSignal.timeout(10000),
      });

      console.log(`[print] M24 start print response: ${startResponse.status}`);
      if (!startResponse.ok) {
        const errorText = await startResponse.text().catch(() => "");
        console.log(`[print] M24 error: ${errorText}`);
        throw new Error(`Failed to start print: ${startResponse.status}`);
      }

      res.json({ message: "Print started successfully", filename: file.filename });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to start print",
      });
    }
  });

  app.get("/api/printers/:id/dashboard-preferences", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      const enabledModules = await storage.getDashboardPreferences(printerId);
      res.json({ enabledModules });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to fetch preferences",
      });
    }
  });

  app.put("/api/printers/:id/dashboard-preferences", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      const validationResult = dashboardPreferencesSchema.pick({ enabledModules: true }).safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ error: "enabledModules must be an array of strings" });
      }

      const { enabledModules } = validationResult.data;

      await storage.setDashboardPreferences(printerId, enabledModules);
      res.json({ message: "Preferences saved", enabledModules });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to save preferences",
      });
    }
  });

  app.get("/api/printers/:id/uploaded-files", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      const files = await storage.getUploadedFiles(printerId);
      res.json(files);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to fetch uploaded files",
      });
    }
  });

  app.post("/api/printers/:id/uploaded-files", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const printer = await storage.getPrinter(printerId);
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      const { filename, displayName, fileContent, source } = req.body;
      
      if (!filename) {
        return res.status(400).json({ error: "Filename is required" });
      }

      // Extract thumbnail from G-code if available
      const thumbnail = fileContent ? extractThumbnail(fileContent) : null;

      const file = await storage.addUploadedFile({
        printerId,
        filename,
        displayName: displayName || null,
        fileContent: fileContent || null,
        thumbnail,
        source: source || "manual",
      });

      res.status(201).json(file);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to add file",
      });
    }
  });

  app.delete("/api/printers/:id/uploaded-files/:fileId", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const fileId = parseInt(req.params.fileId);
      
      const printer = await storage.getPrinter(printerId);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      const deleted = await storage.deleteUploadedFile(fileId, printerId);
      if (!deleted) {
        return res.status(404).json({ error: "File not found" });
      }

      res.json({ message: "File removed" });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to remove file",
      });
    }
  });

  // Slicer-compatible upload endpoint (OctoPrint-style)
  // POST /api/files/local - accepts multipart/form-data with "file" field
  // Compatible with Cura, PrusaSlicer, and other slicers
  app.post("/api/files/local", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Get the first connected printer, or first printer if none connected
      const printers = await storage.getAllPrinters();
      const printer = printers.find((p) => p.isConnected) || printers[0];
      
      if (!printer) {
        return res.status(400).json({ error: "No printer configured. Please add a printer first." });
      }

      const fileContent = file.buffer.toString("utf-8");
      const displayName = file.originalname.replace(/\.[^/.]+$/, "");
      const thumbnail = extractThumbnail(fileContent);

      const uploadedFile = await storage.addUploadedFile({
        printerId: printer.id,
        filename: file.originalname,
        displayName,
        fileContent,
        thumbnail,
        source: "slicer",
      });

      // Return OctoPrint-compatible response
      res.status(201).json({
        files: {
          local: {
            name: uploadedFile.filename,
            display: uploadedFile.displayName,
            path: uploadedFile.filename,
            origin: "local",
          },
        },
        done: true,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to upload file",
      });
    }
  });

  // Alternative endpoint: /api/upload for direct slicer integration
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Allow specifying printer by ID in form data or query param
      const printerIdParam = (req.body.printerId || req.query.printerId) as string | undefined;
      let printer;

      if (printerIdParam) {
        printer = await storage.getPrinter(parseInt(printerIdParam));
      } else {
        const printers = await storage.getAllPrinters();
        printer = printers.find((p) => p.isConnected) || printers[0];
      }
      
      if (!printer) {
        return res.status(400).json({ error: "No printer configured or found" });
      }

      const fileContent = file.buffer.toString("utf-8");
      const displayName = (req.body.displayName as string) || file.originalname.replace(/\.[^/.]+$/, "");
      const thumbnail = extractThumbnail(fileContent);

      const uploadedFile = await storage.addUploadedFile({
        printerId: printer.id,
        filename: file.originalname,
        displayName,
        fileContent,
        thumbnail,
        source: "slicer",
      });

      res.status(201).json({
        success: true,
        file: {
          id: uploadedFile.id,
          filename: uploadedFile.filename,
          displayName: uploadedFile.displayName,
        },
        message: "File uploaded successfully",
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to upload file",
      });
    }
  });

  // Endpoint to get slicer configuration info
  app.get("/api/slicer-config", async (req, res) => {
    const protocol = req.protocol;
    const host = req.get("host");
    const baseUrl = `${protocol}://${host}`;

    res.json({
      name: "Snapmaker Control",
      version: "1.0.0",
      endpoints: {
        octoprint: `${baseUrl}/api/files/local`,
        direct: `${baseUrl}/api/upload`,
      },
      instructions: {
        cura: `In Cura, install the OctoPrint Connection plugin. Set the URL to: ${baseUrl}`,
        prusaslicer: `In PrusaSlicer, go to Printer Settings > Physical Printer. Set Host Type to "OctoPrint", and URL to: ${baseUrl}`,
        generic: `POST multipart/form-data to ${baseUrl}/api/upload with a 'file' field containing your G-code`,
      },
    });
  });

  // Watch folder settings
  app.get("/api/settings/watch-folder", async (req, res) => {
    try {
      const savedPath = await storage.getSetting("watchFolderPath");
      const status = getWatcherStatus();
      res.json({
        path: savedPath,
        active: status.active,
        currentPath: status.path,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get watch folder settings" });
    }
  });

  app.put("/api/settings/watch-folder", async (req, res) => {
    try {
      const { path: folderPath } = req.body;

      if (!folderPath) {
        await storage.setSetting("watchFolderPath", null);
        await stopWatcher();
        return res.json({ success: true, message: "Watch folder disabled" });
      }

      const success = await startWatcher(folderPath);
      if (!success) {
        return res.status(400).json({ error: "Invalid folder path or unable to watch" });
      }

      await storage.setSetting("watchFolderPath", folderPath);
      res.json({ success: true, message: "Watch folder configured", path: folderPath });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to configure watch folder",
      });
    }
  });

  // Get all settings for the settings page
  app.get("/api/settings", async (req, res) => {
    try {
      const protocol = req.protocol;
      const host = req.get("host");
      const baseUrl = `${protocol}://${host}`;
      
      const watchFolderPath = await storage.getSetting("watchFolderPath");
      const watcherStatus = getWatcherStatus();
      const lubanProxyStatus = getLubanProxyStatus();

      res.json({
        watchFolder: {
          path: watchFolderPath,
          active: watcherStatus.active,
        },
        slicerApi: {
          octoprintUrl: `${baseUrl}/api/files/local`,
          directUrl: `${baseUrl}/api/upload`,
          configUrl: `${baseUrl}/api/slicer-config`,
        },
        lubanProxy: lubanProxyStatus,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get settings" });
    }
  });

  // Luban Proxy settings
  app.get("/api/settings/luban-proxy", async (req, res) => {
    try {
      const status = getLubanProxyStatus();
      const savedPrinterIp = await storage.getSetting("luban_proxy_printer_ip");
      res.json({
        ...status,
        savedPrinterIp,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get Luban proxy settings" });
    }
  });

  app.put("/api/settings/luban-proxy", async (req, res) => {
    try {
      const { printerIp, enabled } = req.body;

      if (enabled === false) {
        await storage.setSetting("luban_proxy_printer_ip", null);
        await stopLubanProxy();
        return res.json({ success: true, message: "Luban proxy disabled" });
      }

      if (!printerIp) {
        return res.status(400).json({ error: "Printer IP is required" });
      }

      const success = await startLubanProxy(printerIp);
      if (!success) {
        return res.status(400).json({ 
          error: "Failed to start proxy. Port 8080 may be in use or the printer IP is invalid." 
        });
      }

      await storage.setSetting("luban_proxy_printer_ip", printerIp);
      res.json({ 
        success: true, 
        message: "Luban proxy started", 
        port: 8080,
        printerIp 
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to configure Luban proxy",
      });
    }
  });

  app.get("/api/printers/:id/stats", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const stats = await storage.getPrinterStats(printerId);
      
      const { getBackgroundServiceStatus } = await import("./backgroundService");
      const bgStatus = getBackgroundServiceStatus();
      const printerState = bgStatus.printerStates.find(s => s.printerId === printerId);
      
      res.json({
        totalPrintTime: stats?.totalPrintTime || 0,
        totalPrintCount: stats?.totalPrintCount || 0,
        filamentUsed: stats?.filamentUsed || 0,
        lastPrintFilename: stats?.lastPrintFilename || null,
        lastPrintCompletedAt: stats?.lastPrintCompletedAt || null,
        currentPrintStartTime: printerState?.printStartTime || null,
        isPrinting: printerState?.lastPrintState === "running",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get printer stats" });
    }
  });

  app.put("/api/printers/:id/auto-connect", async (req, res) => {
    try {
      const printerId = parseInt(req.params.id);
      const { enabled } = req.body;
      
      const printer = await storage.updatePrinter(printerId, { autoConnect: enabled });
      
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }
      
      res.json({ success: true, autoConnect: enabled });
    } catch (error) {
      res.status(500).json({ error: "Failed to update auto-connect setting" });
    }
  });

  // Camera settings endpoints
  app.get("/api/settings/camera", async (req, res) => {
    try {
      const cameraUrl = await storage.getSetting("camera_url");
      const cameraRtspUrl = await storage.getSetting("camera_rtsp_url");
      const cameraUsername = await storage.getSetting("camera_username");
      const cameraPassword = await storage.getSetting("camera_password");
      const cameraRefreshRate = await storage.getSetting("camera_refresh_rate");
      const cameraStreamType = await storage.getSetting("camera_stream_type");
      
      res.json({
        url: cameraUrl,
        rtspUrl: cameraRtspUrl,
        username: cameraUsername,
        password: cameraPassword ? "***" : null,
        refreshRate: cameraRefreshRate ? parseInt(cameraRefreshRate) : 1000,
        streamType: cameraStreamType || "snapshot",
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get camera settings" });
    }
  });

  app.put("/api/settings/camera", async (req, res) => {
    try {
      const { url, rtspUrl, username, password, refreshRate, streamType, clearPassword } = req.body;
      
      await storage.setSetting("camera_url", url || null);
      await storage.setSetting("camera_rtsp_url", rtspUrl || null);
      await storage.setSetting("camera_username", username || null);
      
      if (clearPassword) {
        await storage.setSetting("camera_password", null);
      } else if (password && password !== "***") {
        await storage.setSetting("camera_password", password);
      }
      
      await storage.setSetting("camera_refresh_rate", refreshRate ? String(refreshRate) : "1000");
      await storage.setSetting("camera_stream_type", streamType || "snapshot");
      
      // Stop any running stream if RTSP URL changed or was cleared
      if (!rtspUrl) {
        stopStream();
      }
      
      res.json({ success: true, message: "Camera settings saved" });
    } catch (error) {
      res.status(500).json({ error: "Failed to save camera settings" });
    }
  });

  // Camera auto-detect - tries common snapshot URL patterns to find what works
  app.post("/api/camera/detect", async (req, res) => {
    try {
      const { ip, username, password } = req.body;
      
      if (!ip) {
        return res.status(400).json({ error: "IP address is required" });
      }
      
      // Strict validation: only allow valid IP addresses or hostnames, no paths/ports/userinfo
      // This prevents SSRF attacks via malformed input like "192.168.1.1@evil.com"
      const validIpPattern = /^(?:(?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*)$/;
      if (!validIpPattern.test(ip)) {
        return res.status(400).json({ error: "Invalid IP address format. Enter only the IP address (e.g., 192.168.1.50)" });
      }
      
      // Validate IP is a local network address
      const isLocalNetwork = 
        ip === "localhost" ||
        ip.startsWith("192.168.") ||
        ip.startsWith("10.") ||
        ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
        ip.endsWith(".local");
        
      if (!isLocalNetwork) {
        return res.status(400).json({ error: "Only local network IP addresses allowed" });
      }
      
      // Double-check by parsing the constructed URL
      try {
        const testUrl = new URL(`http://${ip}/test`);
        if (testUrl.username || testUrl.password || testUrl.port) {
          return res.status(400).json({ error: "Invalid IP address format" });
        }
      } catch {
        return res.status(400).json({ error: "Invalid IP address format" });
      }
      
      // Common snapshot URL patterns for different camera brands
      const patterns = [
        { brand: "Lorex/Dahua", path: "/cgi-bin/snapshot.cgi" },
        { brand: "Lorex/Dahua (alt)", path: "/cgi-bin/snapshot.cgi?channel=1" },
        { brand: "Hikvision", path: "/ISAPI/Streaming/channels/1/picture" },
        { brand: "Hikvision (alt)", path: "/Streaming/channels/1/picture" },
        { brand: "ONVIF", path: "/onvif-http/snapshot?Profile_1" },
        { brand: "Amcrest", path: "/cgi-bin/snapshot.cgi?chn=0" },
        { brand: "Reolink", path: "/cgi-bin/api.cgi?cmd=Snap&channel=0" },
        { brand: "Axis", path: "/jpg/image.jpg" },
        { brand: "Axis (alt)", path: "/axis-cgi/jpg/image.cgi" },
        { brand: "Generic", path: "/snap.jpg" },
        { brand: "Generic (alt)", path: "/snapshot.jpg" },
        { brand: "Generic MJPEG", path: "/cgi-bin/snapshot.cgi" },
      ];
      
      const headers: Record<string, string> = {};
      if (username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      }
      
      console.log(`[Camera] Auto-detecting camera at ${ip}...`);
      
      // Try each pattern
      for (const pattern of patterns) {
        const url = `http://${ip}${pattern.path}`;
        try {
          const response = await fetch(url, {
            headers,
            signal: AbortSignal.timeout(5000),
          });
          
          if (response.ok) {
            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("image")) {
              console.log(`[Camera] Found working URL: ${url} (${pattern.brand})`);
              return res.json({ 
                success: true, 
                url,
                brand: pattern.brand,
                message: `Detected ${pattern.brand} camera`
              });
            }
          }
        } catch (e) {
          // Try next pattern
        }
      }
      
      console.log(`[Camera] No working snapshot URL found for ${ip}`);
      res.status(404).json({ 
        error: "Could not detect camera. Make sure the IP is correct and the camera is accessible.",
        suggestion: "If you know your camera's snapshot URL, you can enter it manually."
      });
    } catch (error) {
      console.error("[Camera] Auto-detect error:", error);
      res.status(500).json({ error: "Failed to detect camera" });
    }
  });

  // Camera stream proxy - fetches snapshot from camera and returns it
  // Note: This is designed for local network use only. For security, validate URLs.
  app.get("/api/camera/snapshot", async (req, res) => {
    try {
      const cameraUrl = await storage.getSetting("camera_url");
      const cameraUsername = await storage.getSetting("camera_username");
      const cameraPassword = await storage.getSetting("camera_password");
      
      if (!cameraUrl) {
        return res.status(404).json({ error: "Camera not configured" });
      }
      
      // Validate URL is HTTP/HTTPS and appears to be a LAN address
      try {
        const parsedUrl = new URL(cameraUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return res.status(400).json({ error: "Only HTTP/HTTPS URLs allowed" });
        }
        
        // Allow common LAN IP ranges and localhost
        const hostname = parsedUrl.hostname;
        const isLocalNetwork = 
          hostname === "localhost" ||
          hostname.startsWith("192.168.") ||
          hostname.startsWith("10.") ||
          hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
          hostname.endsWith(".local");
          
        if (!isLocalNetwork) {
          console.warn(`[Camera] Blocked request to non-local URL: ${hostname}`);
          return res.status(400).json({ error: "Only local network cameras allowed" });
        }
      } catch {
        return res.status(400).json({ error: "Invalid camera URL" });
      }
      
      const headers: Record<string, string> = {};
      if (cameraUsername && cameraPassword) {
        const auth = Buffer.from(`${cameraUsername}:${cameraPassword}`).toString("base64");
        headers["Authorization"] = `Basic ${auth}`;
      }
      
      const response = await fetch(cameraUrl, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) {
        throw new Error(`Camera returned ${response.status}`);
      }
      
      const contentType = response.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("[Camera] Snapshot error:", error);
      res.status(502).json({ error: "Failed to fetch camera snapshot" });
    }
  });

  // RTSP Live Streaming endpoints
  app.post("/api/stream/start", async (req, res) => {
    try {
      const { rtspUrl } = req.body;
      
      if (!rtspUrl) {
        return res.status(400).json({ error: "RTSP URL is required" });
      }
      
      // Validate RTSP URL format
      if (!rtspUrl.startsWith("rtsp://")) {
        return res.status(400).json({ error: "Invalid RTSP URL format. Must start with rtsp://" });
      }
      
      // Extract host from RTSP URL and validate it's a local network address
      try {
        const urlWithoutProtocol = rtspUrl.replace("rtsp://", "");
        const hostPart = urlWithoutProtocol.split("@").pop()?.split("/")[0]?.split(":")[0] || "";
        
        const isLocalNetwork = 
          hostPart === "localhost" ||
          hostPart.startsWith("192.168.") ||
          hostPart.startsWith("10.") ||
          hostPart.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
          hostPart.endsWith(".local");
          
        if (!isLocalNetwork) {
          return res.status(400).json({ error: "Only local network cameras allowed" });
        }
      } catch {
        return res.status(400).json({ error: "Invalid RTSP URL" });
      }
      
      console.log("[Stream] Starting stream request received");
      const result = await startStream(rtspUrl);
      
      if (result.success) {
        res.json({ success: true, message: "Stream started", hlsUrl: "/api/stream/hls/stream.m3u8" });
      } else {
        res.status(500).json({ error: result.error || "Failed to start stream" });
      }
    } catch (error) {
      console.error("[Stream] Start error:", error);
      res.status(500).json({ error: "Failed to start stream" });
    }
  });

  app.post("/api/stream/stop", (req, res) => {
    stopStream();
    res.json({ success: true, message: "Stream stopped" });
  });

  app.get("/api/stream/status", (req, res) => {
    const info = getStreamInfo();
    res.json(info);
  });

  // Serve HLS files
  app.get("/api/stream/hls/:filename", (req, res) => {
    const { filename } = req.params;
    const hlsDir = getHlsDirectory();
    const filePath = path.join(hlsDir, filename);
    
    // Security: only allow .m3u8 and .ts files
    if (!filename.endsWith(".m3u8") && !filename.endsWith(".ts")) {
      return res.status(400).json({ error: "Invalid file type" });
    }
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Stream not ready" });
    }
    
    // Set appropriate content type
    const contentType = filename.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    fs.createReadStream(filePath).pipe(res);
  });

  // Push notification endpoints
  app.get("/api/push/vapid-public-key", (req, res) => {
    const key = getVapidPublicKey();
    if (!key) {
      return res.status(503).json({ error: "Push notifications not configured" });
    }
    res.json({ publicKey: key });
  });

  app.get("/api/push/status", (req, res) => {
    res.json({ 
      enabled: isPushEnabled(),
      publicKey: getVapidPublicKey() 
    });
  });

  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { endpoint, keys } = req.body;
      
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: "Invalid subscription data" });
      }

      const subscription = await storage.addPushSubscription(endpoint, keys.p256dh, keys.auth);
      console.log(`[Push] New subscription registered: ${endpoint.substring(0, 50)}...`);
      console.log(`[Push] Subscription keys - p256dh length: ${keys.p256dh.length}, auth length: ${keys.auth.length}`);
      res.json({ success: true, id: subscription.id });
    } catch (error) {
      console.error("[Push] Subscribe error:", error);
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  app.get("/api/push/debug", async (req, res) => {
    try {
      const subscriptions = await storage.getAllPushSubscriptions();
      const { getVapidPublicKey, isPushEnabled } = await import("./pushService");
      res.json({
        enabled: isPushEnabled(),
        publicKey: getVapidPublicKey(),
        subscriptionCount: subscriptions.length,
        subscriptions: subscriptions.map(s => ({
          id: s.id,
          endpoint: s.endpoint.substring(0, 60) + "...",
          p256dhLength: s.p256dh.length,
          authLength: s.auth.length,
          createdAt: s.createdAt
        }))
      });
    } catch (error) {
      console.error("[Push] Debug error:", error);
      res.status(500).json({ error: "Debug failed" });
    }
  });

  app.post("/api/push/unsubscribe", async (req, res) => {
    try {
      const { endpoint } = req.body;
      
      if (!endpoint) {
        return res.status(400).json({ error: "Missing endpoint" });
      }

      const deleted = await storage.deletePushSubscription(endpoint);
      console.log(`[Push] Subscription removed: ${endpoint.substring(0, 50)}...`);
      res.json({ success: deleted });
    } catch (error) {
      console.error("[Push] Unsubscribe error:", error);
      res.status(500).json({ error: "Failed to remove subscription" });
    }
  });

  app.post("/api/push/test", async (req, res) => {
    try {
      const { sendPushNotification } = await import("./pushService");
      const result = await sendPushNotification({
        title: "Test Notification",
        body: "Push notifications are working!",
        tag: "test",
      });
      res.json({ sent: result.success, failed: result.failed });
    } catch (error) {
      console.error("[Push] Test notification error:", error);
      res.status(500).json({ error: "Failed to send test notification" });
    }
  });

  // Initialize file watcher and Luban proxy on startup
  initializeWatcher().catch((err) => {
    console.error("Failed to initialize file watcher:", err);
  });

  initializeLubanProxy().catch((err) => {
    console.error("Failed to initialize Luban proxy:", err);
  });

  return httpServer;
}
