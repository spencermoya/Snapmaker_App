import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPrinterSchema, type PrinterStatus } from "@shared/schema";
import { z } from "zod";

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
        state: statusData.state || "idle",
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

  return httpServer;
}
