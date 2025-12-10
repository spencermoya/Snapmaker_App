import { pool } from "./db";

function log(message: string, source = "db") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

const REQUIRED_TABLES = [
  {
    name: "printers",
    createSQL: `
      CREATE TABLE IF NOT EXISTS printers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        token TEXT,
        is_connected BOOLEAN DEFAULT false,
        last_seen TIMESTAMP
      )
    `,
  },
  {
    name: "print_jobs",
    createSQL: `
      CREATE TABLE IF NOT EXISTS print_jobs (
        id SERIAL PRIMARY KEY,
        printer_id INTEGER REFERENCES printers(id),
        filename TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `,
  },
  {
    name: "dashboard_preferences",
    createSQL: `
      CREATE TABLE IF NOT EXISTS dashboard_preferences (
        id SERIAL PRIMARY KEY,
        printer_id INTEGER REFERENCES printers(id) UNIQUE NOT NULL,
        enabled_modules JSONB NOT NULL
      )
    `,
  },
  {
    name: "uploaded_files",
    createSQL: `
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id SERIAL PRIMARY KEY,
        printer_id INTEGER REFERENCES printers(id) NOT NULL,
        filename TEXT NOT NULL,
        display_name TEXT,
        file_content TEXT,
        uploaded_at TIMESTAMP DEFAULT NOW(),
        source TEXT NOT NULL
      )
    `,
  },
  {
    name: "app_settings",
    createSQL: `
      CREATE TABLE IF NOT EXISTS app_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value TEXT
      )
    `,
  },
];

export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  
  try {
    for (const table of REQUIRED_TABLES) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [table.name]);
      
      const exists = result.rows[0]?.exists;
      
      if (!exists) {
        log(`[Schema] Creating missing table: ${table.name}`, "db");
        await client.query(table.createSQL);
        log(`[Schema] Created table: ${table.name}`, "db");
      }
    }
    
    log("[Schema] All required tables verified", "db");
  } catch (error) {
    log(`[Schema] Error ensuring schema: ${error}`, "db");
    throw error;
  } finally {
    client.release();
  }
}
