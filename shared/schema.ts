import { pgTable, text, serial, timestamp, integer, boolean, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const printers = pgTable("printers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ipAddress: text("ip_address").notNull(),
  token: text("token"),
  isConnected: boolean("is_connected").default(false),
  autoConnect: boolean("auto_connect").default(true),
  lastSeen: timestamp("last_seen"),
});

export const printerStats = pgTable("printer_stats", {
  id: serial("id").primaryKey(),
  printerId: integer("printer_id").references(() => printers.id).unique().notNull(),
  totalPrintTime: integer("total_print_time").default(0),
  totalPrintCount: integer("total_print_count").default(0),
  filamentUsed: real("filament_used").default(0),
  lastPrintFilename: text("last_print_filename"),
  lastPrintCompletedAt: timestamp("last_print_completed_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const uploadedFiles = pgTable("uploaded_files", {
  id: serial("id").primaryKey(),
  printerId: integer("printer_id").references(() => printers.id).notNull(),
  filename: text("filename").notNull(),
  displayName: text("display_name"),
  fileContent: text("file_content"),
  thumbnail: text("thumbnail"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  source: text("source").notNull(),
});

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const smartPlugs = pgTable("smart_plugs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nodeId: text("node_id").notNull().unique(),
  vendorId: text("vendor_id"),
  productId: text("product_id"),
  deviceType: text("device_type"),
  ipAddress: text("ip_address"),
  pairingCode: text("pairing_code"),
  isPaired: boolean("is_paired").default(false),
  isOn: boolean("is_on").default(false),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSmartPlugSchema = createInsertSchema(smartPlugs).omit({
  id: true,
  createdAt: true,
  lastSeen: true,
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

export const insertUploadedFileSchema = createInsertSchema(uploadedFiles).omit({
  id: true,
  uploadedAt: true,
});

export const DEFAULT_ENABLED_MODULES = [
  "status",
  "webcam", 
  "temperature",
  "stats",
  "jogControls",
  "jobControls",
  "fileList",
];

export type Printer = typeof printers.$inferSelect;
export type InsertPrinter = z.infer<typeof insertPrinterSchema>;
export type PrintJob = typeof printJobs.$inferSelect;
export type InsertPrintJob = z.infer<typeof insertPrintJobSchema>;
export type DashboardPreferences = typeof dashboardPreferences.$inferSelect;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type AppSetting = typeof appSettings.$inferSelect;
export type SmartPlug = typeof smartPlugs.$inferSelect;
export type InsertSmartPlug = z.infer<typeof insertSmartPlugSchema>;
export type PrinterStats = typeof printerStats.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

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
  elapsedTime: number | null;
};
