import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const printers = pgTable("printers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ipAddress: text("ip_address").notNull(),
  token: text("token"),
  isConnected: boolean("is_connected").default(false),
  lastSeen: timestamp("last_seen"),
});

export const printJobs = pgTable("print_jobs", {
  id: serial("id").primaryKey(),
  printerId: integer("printer_id").references(() => printers.id),
  filename: text("filename").notNull(),
  progress: integer("progress").default(0),
  status: text("status").notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const dashboardPreferences = pgTable("dashboard_preferences", {
  id: serial("id").primaryKey(),
  printerId: integer("printer_id").references(() => printers.id).unique().notNull(),
  enabledModules: jsonb("enabled_modules").$type<string[]>().notNull(),
});

export const insertPrinterSchema = createInsertSchema(printers).omit({
  id: true,
  lastSeen: true,
});

export const insertPrintJobSchema = createInsertSchema(printJobs).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export const dashboardPreferencesSchema = z.object({
  printerId: z.number(),
  enabledModules: z.array(z.string()),
});

export const DEFAULT_ENABLED_MODULES = [
  "status",
  "webcam", 
  "temperature",
  "jogControls",
  "jobControls",
  "fileList",
];

export type Printer = typeof printers.$inferSelect;
export type InsertPrinter = z.infer<typeof insertPrinterSchema>;
export type PrintJob = typeof printJobs.$inferSelect;
export type InsertPrintJob = z.infer<typeof insertPrintJobSchema>;
export type DashboardPreferences = typeof dashboardPreferences.$inferSelect;

export type PrinterStatus = {
  state: string;
  temperature: {
    nozzle: number;
    bed: number;
    targetNozzle: number;
    targetBed: number;
  };
  progress: number;
  currentFile: string | null;
  timeRemaining: number | null;
};
