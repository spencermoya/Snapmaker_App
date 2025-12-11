import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { startWatcher, stopWatcher, getWatcherStatus, initializeWatcher } from "./fileWatcher";
import { startLubanProxy, stopLubanProxy, getLubanProxyStatus, initializeLubanProxy } from "./lubanProxy";
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
  
  app.get("/api/printers", async (req, res) => {
    try {
      const printers = await storage.getAllPrinters();
      res.json(printers);
    } catch (error) {
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
      const result = await snapmakerRequest(
        printer.ipAddress,
        "/api/v1/connect",
        "POST",
        `token=${existingToken}`,
        existingToken
      );

      if (result.token) {
        await storage.updatePrinter(printerId, {
          token: result.token,
          isConnected: true,
          lastSeen: new Date(),
        });
        return res.json({
          message: "Connected successfully",
          requiresConfirmation: false,
        });
      }

      if (result.status === 204) {
        return res.json({
          message: "Please confirm connection on printer touchscreen, then click Connect again",
          requiresConfirmation: true,
        });
      }

      await storage.updatePrinter(printerId, {
        isConnected: true,
        lastSeen: new Date(),
      });

      res.json({
        message: "Connected successfully",
        requiresConfirmation: false,
      });
    } catch (error) {
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

      const status: PrinterStatus = {
        state: statusData.status || statusData.state || "idle",
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

      await storage.updatePrinter(printerId, {
        isConnected: false,
        token: null,
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

      res.json({ message: "Print started" });
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

      const file = await storage.addUploadedFile({
        printerId,
        filename,
        displayName: displayName || null,
        fileContent: fileContent || null,
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

      const uploadedFile = await storage.addUploadedFile({
        printerId: printer.id,
        filename: file.originalname,
        displayName,
        fileContent,
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

      const uploadedFile = await storage.addUploadedFile({
        printerId: printer.id,
        filename: file.originalname,
        displayName,
        fileContent,
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

  // Initialize file watcher and Luban proxy on startup
  initializeWatcher().catch((err) => {
    console.error("Failed to initialize file watcher:", err);
  });

  initializeLubanProxy().catch((err) => {
    console.error("Failed to initialize Luban proxy:", err);
  });

  return httpServer;
}
