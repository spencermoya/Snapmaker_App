import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { ensureSchema } from "./ensureSchema";
import { startBackgroundService } from "./backgroundService";

const app = express();

const certsExist = existsSync("certs/server.key") && existsSync("certs/server.crt");
let server;

if (certsExist) {
  const httpsOptions = {
    key: readFileSync("certs/server.key"),
    cert: readFileSync("certs/server.crt"),
  };
  server = createHttpsServer(httpsOptions, app);
  
  // Create a separate HTTP server on port 5001 for certificate download
  // This allows iOS users to download the cert before they can trust HTTPS
  const certApp = express();
  
  certApp.get("/", (req, res) => {
    res.redirect("/install-cert");
  });
  
  certApp.get("/certificate", (req, res) => {
    const certPath = path.join(process.cwd(), "certs", "server.crt");
    
    if (!existsSync(certPath)) {
      return res.status(404).send("Certificate not found");
    }
    
    const cert = readFileSync(certPath);
    res.setHeader("Content-Type", "application/x-x509-ca-cert");
    res.setHeader("Content-Disposition", 'attachment; filename="snapmaker-ca.cer"');
    res.send(cert);
  });
  
  certApp.get("/install-cert", (req, res) => {
    const port = parseInt(process.env.PORT || "5000", 10);
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
        </style>
      </head>
      <body>
        <h1>Install SSL Certificate</h1>
        <p>To use this app on your iPhone/iPad, install and trust the SSL certificate.</p>
        
        <a href="/certificate" class="button">Download Certificate</a>
        
        <div class="step">
          <span class="step-num">1</span>
          <strong>Tap the button above</strong><br>
          Safari will prompt to download a profile. Tap "Allow".
        </div>
        
        <div class="step">
          <span class="step-num">2</span>
          <strong>Open Settings</strong><br>
          You'll see "Profile Downloaded" near the top. Tap it.
        </div>
        
        <div class="step">
          <span class="step-num">3</span>
          <strong>Install the Profile</strong><br>
          Tap "Install" in the top right, then confirm.
        </div>
        
        <div class="step">
          <span class="step-num">4</span>
          <strong>Trust the Certificate</strong><br>
          Settings → General → About → Certificate Trust Settings.<br>
          Toggle the certificate ON.
        </div>
        
        <div class="step">
          <span class="step-num">5</span>
          <strong>Access the App</strong><br>
          Go to: <a href="https://${req.hostname}:${port}" style="color:#4ade80">https://${req.hostname}:${port}</a>
        </div>
      </body>
      </html>
    `);
  });
  
  const certHttpServer = createServer(certApp);
  certHttpServer.listen(5001, "0.0.0.0", () => {
    console.log("Certificate HTTP server running on http://0.0.0.0:5001");
  });
} else {
  server = createServer(app);
}

const httpServer = server;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    await ensureSchema();
  } catch (error) {
    log(`Failed to ensure database schema: ${error}`, "db");
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const protocol = certsExist ? "https" : "http";
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on ${protocol}://0.0.0.0:${port}`);
      if (certsExist) {
        log("HTTPS enabled with SSL certificates");
      }
      
      startBackgroundService();
      log("Background connection service started");
    },
  );
})();
