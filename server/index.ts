import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { registerAIRoutes } from "./aiAssistant";
import { serveStatic } from "./static";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { ensureSchema } from "./ensureSchema";
import { startBackgroundPolling } from "./backgroundPoller";
import { initializeWebPush } from "./webPush";

const app = express();

const certDir = process.env.SSL_CERT_DIR || "./certs";
const keyPath = join(certDir, "server.key");
const certPath = join(certDir, "server.crt");

let server: ReturnType<typeof createHttpServer> | ReturnType<typeof createHttpsServer>;
let useHttps = false;

if (existsSync(keyPath) && existsSync(certPath)) {
  try {
    const httpsOptions = {
      key: readFileSync(keyPath),
      cert: readFileSync(certPath),
    };
    server = createHttpsServer(httpsOptions, app);
    useHttps = true;
    console.log("[Server] SSL certificates found, starting HTTPS server");
  } catch (error) {
    console.log("[Server] Failed to load SSL certificates, falling back to HTTP:", error);
    server = createHttpServer(app);
  }
} else {
  console.log("[Server] No SSL certificates found, starting HTTP server");
  server = createHttpServer(app);
}

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

  await registerRoutes(server, app);
  registerAIRoutes(app);

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
    await setupVite(server, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const protocol = useHttps ? "https" : "http";
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on ${protocol}://0.0.0.0:${port}`);
      
      // Initialize services after a short delay to let the server initialize
      setTimeout(async () => {
        await initializeWebPush();
        startBackgroundPolling();
      }, 3000);
    },
  );
})();
