import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";
import { ensureSchema } from "./ensureSchema";

const app = express();

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

function getSSLOptions() {
  const certDir = process.env.SSL_CERT_DIR || "./certs";
  const keyPath = `${certDir}/server.key`;
  const certPath = `${certDir}/server.crt`;
  
  if (existsSync(keyPath) && existsSync(certPath)) {
    try {
      return {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
      };
    } catch (error) {
      log(`Failed to read SSL certificates: ${error}`, "ssl");
      return null;
    }
  }
  return null;
}

(async () => {
  try {
    await ensureSchema();
  } catch (error) {
    log(`Failed to ensure database schema: ${error}`, "db");
  }

  const sslOptions = getSSLOptions();
  const useHttps = sslOptions && process.env.NODE_ENV === "production";
  
  const server = useHttps 
    ? createHttpsServer(sslOptions, app)
    : createHttpServer(app);

  await registerRoutes(server, app);

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
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      const protocol = useHttps ? "https" : "http";
      log(`serving on ${protocol}://0.0.0.0:${port}`);
      if (useHttps) {
        log(`HTTPS enabled with SSL certificates`);
      }
    },
  );
})();
