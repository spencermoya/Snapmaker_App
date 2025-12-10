import http from "http";
import { storage } from "./storage";
import { log } from "./index";

const PROXY_PORT = 8080;

let proxyServer: http.Server | null = null;
let targetPrinterIp: string | null = null;
let isEnabled = false;
let lastCapturedToken: string | null = null;

function parseUrlEncodedBody(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pairs = body.split("&");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key && value) {
      result[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  return result;
}

function extractTokenFromUrl(url: string): string | null {
  const match = url.match(/[?&]token=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function saveCapturedToken(token: string): Promise<void> {
  if (!token || token === lastCapturedToken) return;
  
  lastCapturedToken = token;
  log(`[Luban Proxy] Captured Luban token: ${token.substring(0, 8)}...`, "proxy");
  
  try {
    if (!targetPrinterIp) {
      log(`[Luban Proxy] Cannot save token: no target printer IP configured`, "proxy");
      return;
    }
    
    const printers = await storage.getAllPrinters();
    const printer = printers.find((p) => p.ipAddress === targetPrinterIp);
    
    if (!printer) {
      log(`[Luban Proxy] Cannot save token: no printer found with IP ${targetPrinterIp}`, "proxy");
      return;
    }
    
    await storage.updatePrinter(printer.id, { token });
    log(`[Luban Proxy] Saved Luban token to printer ${printer.name} (${printer.ipAddress})`, "proxy");
  } catch (error) {
    log(`[Luban Proxy] Error saving token: ${error}`, "proxy");
  }
}

function parseMultipartFormData(
  buffer: Buffer,
  boundary: string
): { token?: string; filename?: string; fileContent?: Buffer } {
  const result: { token?: string; filename?: string; fileContent?: Buffer } = {};
  const boundaryStr = `--${boundary}`;
  const endBoundaryStr = `--${boundary}--`;
  
  const text = buffer.toString("binary");
  const parts = text.split(boundaryStr);
  
  for (const part of parts) {
    if (!part || part === "--" || part.trim() === "--" || part.startsWith("--")) continue;
    
    const headerEndIdx = part.indexOf("\r\n\r\n");
    if (headerEndIdx === -1) continue;
    
    const headers = part.slice(0, headerEndIdx);
    let body = part.slice(headerEndIdx + 4);
    
    if (body.endsWith("\r\n")) {
      body = body.slice(0, -2);
    }
    if (body.endsWith("--")) {
      body = body.slice(0, -2);
    }
    if (body.endsWith("\r\n")) {
      body = body.slice(0, -2);
    }
    
    if (headers.includes('name="token"')) {
      result.token = body.trim();
    } else if (headers.includes('name="file"')) {
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      if (filenameMatch) {
        result.filename = filenameMatch[1];
      }
      result.fileContent = Buffer.from(body, "binary");
    }
  }

  return result;
}

async function handleProxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  if (!targetPrinterIp) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No printer configured for proxy" }));
    return;
  }

  const chunks: Buffer[] = [];
  
  req.on("data", (chunk) => {
    chunks.push(chunk);
  });

  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    const url = req.url || "/";
    const method = req.method || "GET";
    const contentType = req.headers["content-type"] || "";

    log(`[Luban Proxy] ${method} ${url} (${body.length} bytes)`, "proxy");

    // Try to capture token from various sources
    let capturedToken: string | null = null;

    // 1. Check URL query parameters (used in GET requests like /api/v1/status?token=xxx)
    capturedToken = extractTokenFromUrl(url);

    // 2. Check URL-encoded form body (used in POST requests like /api/v1/connect)
    if (!capturedToken && contentType.includes("application/x-www-form-urlencoded") && body.length > 0) {
      const formData = parseUrlEncodedBody(body.toString("utf-8"));
      if (formData.token) {
        capturedToken = formData.token;
      }
    }

    // 3. Check multipart form data (used in upload requests)
    if (!capturedToken && contentType.includes("multipart/form-data")) {
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (boundaryMatch) {
        const parsed = parseMultipartFormData(body, boundaryMatch[1]);
        if (parsed.token) {
          capturedToken = parsed.token;
        }
      }
    }

    // Save any captured token
    if (capturedToken) {
      await saveCapturedToken(capturedToken);
    }

    // Handle file uploads - capture the file content
    if (url.startsWith("/api/v1/upload") && method === "POST") {
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      
      if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const parsed = parseMultipartFormData(body, boundary);
        
        if (parsed.filename && parsed.fileContent) {
          log(`[Luban Proxy] Captured file: ${parsed.filename} (${parsed.fileContent.length} bytes)`, "proxy");
          
          try {
            const printers = await storage.getAllPrinters();
            const printer = printers.find((p) => p.ipAddress === targetPrinterIp) || printers[0];
            
            if (printer) {
              const displayName = parsed.filename.replace(/\.[^/.]+$/, "");
              const fileContent = parsed.fileContent.toString("utf-8");
              
              const existingFiles = await storage.getUploadedFiles(printer.id);
              const alreadyExists = existingFiles.some(
                (f) => f.filename === parsed.filename
              );
              
              if (!alreadyExists) {
                await storage.addUploadedFile({
                  printerId: printer.id,
                  filename: parsed.filename,
                  displayName,
                  fileContent,
                  source: "luban",
                });
                log(`[Luban Proxy] Saved file to database: ${parsed.filename}`, "proxy");
              } else {
                log(`[Luban Proxy] File already exists, skipping: ${parsed.filename}`, "proxy");
              }
            }
          } catch (error) {
            log(`[Luban Proxy] Error saving file: ${error}`, "proxy");
          }
        }
      }
    }

    const options: http.RequestOptions = {
      hostname: targetPrinterIp,
      port: 8080,
      path: url,
      method,
      headers: { ...req.headers, host: `${targetPrinterIp}:8080` },
      timeout: 120000,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on("error", (error) => {
      log(`[Luban Proxy] Error forwarding to printer: ${error.message}`, "proxy");
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to connect to printer" }));
    });

    proxyReq.on("timeout", () => {
      log(`[Luban Proxy] Request timeout`, "proxy");
      proxyReq.destroy();
      res.writeHead(504, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Printer request timeout" }));
    });

    if (body.length > 0) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
}

export async function startLubanProxy(printerIp: string): Promise<boolean> {
  if (proxyServer) {
    await stopLubanProxy();
  }

  targetPrinterIp = printerIp;
  isEnabled = true;

  return new Promise((resolve) => {
    proxyServer = http.createServer(handleProxyRequest);
    
    proxyServer.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        log(`[Luban Proxy] Port ${PROXY_PORT} is already in use`, "proxy");
      } else {
        log(`[Luban Proxy] Server error: ${error.message}`, "proxy");
      }
      isEnabled = false;
      resolve(false);
    });

    proxyServer.listen(PROXY_PORT, "0.0.0.0", () => {
      log(`[Luban Proxy] Started on port ${PROXY_PORT}, forwarding to ${printerIp}`, "proxy");
      resolve(true);
    });
  });
}

export async function stopLubanProxy(): Promise<void> {
  return new Promise((resolve) => {
    if (proxyServer) {
      proxyServer.close(() => {
        log(`[Luban Proxy] Stopped`, "proxy");
        proxyServer = null;
        isEnabled = false;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

export function getLubanProxyStatus(): { 
  enabled: boolean; 
  port: number; 
  targetPrinterIp: string | null;
  hasToken: boolean;
} {
  return {
    enabled: isEnabled && proxyServer !== null,
    port: PROXY_PORT,
    targetPrinterIp: isEnabled ? targetPrinterIp : null,
    hasToken: lastCapturedToken !== null,
  };
}

export function getLastCapturedToken(): string | null {
  return lastCapturedToken;
}

export async function initializeLubanProxy(): Promise<void> {
  try {
    const setting = await storage.getSetting("luban_proxy_printer_ip");
    if (setting) {
      // Try to restore the saved token from the printer that matches this IP
      const printers = await storage.getAllPrinters();
      const printer = printers.find((p) => p.ipAddress === setting);
      if (printer?.token) {
        lastCapturedToken = printer.token;
        log(`[Luban Proxy] Restored saved token from printer ${printer.name}`, "proxy");
      }
      
      const success = await startLubanProxy(setting);
      if (success) {
        log(`[Luban Proxy] Auto-started for printer at ${setting}`, "proxy");
      }
    }
  } catch (error) {
    log(`[Luban Proxy] Failed to initialize: ${error}`, "proxy");
  }
}
