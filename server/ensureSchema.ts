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
        device_id TEXT NOT NULL UNIQUE,
        model TEXT,
        device_type TEXT,
        channel INTEGER DEFAULT 0,
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
  {
    name: "scheduled_prints",
    createSQL: `
      CREATE TABLE IF NOT EXISTS scheduled_prints (
        id SERIAL PRIMARY KEY,
        printer_id INTEGER NOT NULL REFERENCES printers(id),
        file_id INTEGER REFERENCES uploaded_files(id),
        filename TEXT NOT NULL,
        scheduled_at TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        power_on_plug BOOLEAN DEFAULT false,
        plug_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        executed_at TIMESTAMP,
        error_message TEXT
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
  {
    table: "smart_plugs",
    column: "device_id",
    addSQL: "ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS device_id TEXT UNIQUE",
  },
  {
    table: "smart_plugs",
    column: "model",
    addSQL: "ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS model TEXT",
  },
  {
    table: "smart_plugs",
    column: "device_type",
    addSQL: "ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS device_type TEXT",
  },
  {
    table: "smart_plugs",
    column: "channel",
    addSQL: "ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS channel INTEGER DEFAULT 0",
  },
  {
    table: "smart_plugs",
    column: "is_on",
    addSQL: "ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS is_on BOOLEAN DEFAULT false",
  },
  {
    table: "smart_plugs",
    column: "last_seen",
    addSQL: "ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP",
  },
  {
    table: "smart_plugs",
    column: "created_at",
    addSQL: "ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
  },
];

const COLUMNS_TO_DROP = [
  {
    table: "push_subscriptions",
    column: "printer_id",
    dropSQL: "ALTER TABLE push_subscriptions DROP COLUMN IF EXISTS printer_id",
  },
  {
    table: "smart_plugs",
    column: "type",
    dropSQL: "ALTER TABLE smart_plugs DROP COLUMN IF EXISTS type",
  },
  {
    table: "smart_plugs",
    column: "node_id",
    dropSQL: "ALTER TABLE smart_plugs DROP COLUMN IF EXISTS node_id",
  },
  {
    table: "smart_plugs",
    column: "vendor_id",
    dropSQL: "ALTER TABLE smart_plugs DROP COLUMN IF EXISTS vendor_id",
  },
  {
    table: "smart_plugs",
    column: "pairing_code",
    dropSQL: "ALTER TABLE smart_plugs DROP COLUMN IF EXISTS pairing_code",
  },
  {
    table: "smart_plugs",
    column: "ip_address",
    dropSQL: "ALTER TABLE smart_plugs DROP COLUMN IF EXISTS ip_address",
  },
  {
    table: "smart_plugs",
    column: "paired",
    dropSQL: "ALTER TABLE smart_plugs DROP COLUMN IF EXISTS paired",
  },
];

const SMART_PLUGS_MIGRATION_SQL = `
DO $$
BEGIN
  -- Migrate smart_plugs from old Matter schema to new Meross schema
  IF EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'smart_plugs' AND column_name = 'node_id'
  ) AND NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'smart_plugs' AND column_name = 'device_id'
  ) THEN
    -- Old schema detected, recreate table (no important data to preserve)
    DROP TABLE smart_plugs CASCADE;
    CREATE TABLE smart_plugs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      device_id TEXT NOT NULL UNIQUE,
      model TEXT,
      device_type TEXT,
      channel INTEGER DEFAULT 0,
      is_on BOOLEAN DEFAULT false,
      last_seen TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    RAISE NOTICE 'Migrated smart_plugs table from Matter to Meross schema';
  END IF;
END $$;
`;

export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  
  try {
    // Run smart_plugs migration from Matter to Meross schema
    try {
      await client.query(SMART_PLUGS_MIGRATION_SQL);
    } catch (error) {
      log(`[Schema] Warning during smart_plugs migration: ${error}`, "db");
    }

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
    
    for (const col of COLUMNS_TO_DROP) {
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
        
        if (exists) {
          log(`[Schema] Dropping deprecated column: ${col.table}.${col.column}`, "db");
          await client.query(col.dropSQL);
          log(`[Schema] Dropped column: ${col.table}.${col.column}`, "db");
        }
      } catch (error) {
        log(`[Schema] Warning dropping column ${col.table}.${col.column}: ${error}`, "db");
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
