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
        auto_connect BOOLEAN DEFAULT true,
        last_seen TIMESTAMP
      )
    `,
  },
  {
    name: "printer_stats",
    createSQL: `
      CREATE TABLE IF NOT EXISTS printer_stats (
        id SERIAL PRIMARY KEY,
        printer_id INTEGER REFERENCES printers(id) UNIQUE NOT NULL,
        total_print_time INTEGER DEFAULT 0,
        total_print_count INTEGER DEFAULT 0,
        filament_used REAL DEFAULT 0,
        last_print_filename TEXT,
        last_print_completed_at TIMESTAMP,
        updated_at TIMESTAMP DEFAULT NOW()
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
        thumbnail TEXT,
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
  {
    name: "smart_plugs",
    createSQL: `
      CREATE TABLE IF NOT EXISTS smart_plugs (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        node_id TEXT NOT NULL UNIQUE,
        vendor_id TEXT,
        product_id TEXT,
        device_type TEXT,
        ip_address TEXT,
        pairing_code TEXT,
        is_paired BOOLEAN DEFAULT false,
        is_on BOOLEAN DEFAULT false,
        last_seen TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `,
  },
  {
    name: "push_subscriptions",
    createSQL: `
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `,
  },
];

const REQUIRED_COLUMNS = [
  {
    table: "printers",
    column: "auto_connect",
    addSQL: "ALTER TABLE printers ADD COLUMN IF NOT EXISTS auto_connect BOOLEAN DEFAULT true",
  },
  {
    table: "uploaded_files",
    column: "thumbnail",
    addSQL: "ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS thumbnail TEXT",
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
    
    for (const col of REQUIRED_COLUMNS) {
      try {
        const result = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = $1
            AND column_name = $2
          )
        `, [col.table, col.column]);
        
        const exists = result.rows[0]?.exists;
        
        if (!exists) {
          log(`[Schema] Adding missing column: ${col.table}.${col.column}`, "db");
          await client.query(col.addSQL);
          log(`[Schema] Added column: ${col.table}.${col.column}`, "db");
        }
      } catch (error) {
        log(`[Schema] Warning adding column ${col.table}.${col.column}: ${error}`, "db");
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
