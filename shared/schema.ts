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

export const printStats = pgTable("print_stats", {
  id: serial("id").primaryKey(),
  printerId: integer("printer_id").references(() => printers.id).notNull(),
  filename: text("filename").notNull(),
  printTimeSeconds: integer("print_time_seconds").notNull(),
  filamentUsedMm: integer("filament_used_mm").default(0),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const smartPlugs = pgTable("smart_plugs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  ipAddress: text("ip_address").notNull(),
  port: integer("port"),
  deviceId: text("device_id"),
  credentials: text("credentials"),
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  printerId: integer("printer_id").references(() => printers.id).notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const homekitDevices = pgTable("homekit_devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  deviceId: text("device_id").notNull().unique(),
  ipAddress: text("ip_address"),
  port: integer("port"),
  pairingData: text("pairing_data"),
  isPaired: boolean("is_paired").default(false),
  deviceType: text("device_type").default("outlet"),
  lastSeen: timestamp("last_seen"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scheduledPrints = pgTable("scheduled_prints", {
  id: serial("id").primaryKey(),
  printerId: integer("printer_id").references(() => printers.id).notNull(),
  fileId: integer("file_id").references(() => uploadedFiles.id).notNull(),
  scheduledTime: timestamp("scheduled_time").notNull(),
  smartPlugId: integer("smart_plug_id"),
  homekitDeviceId: integer("homekit_device_id"),
  printerWarmupMinutes: integer("printer_warmup_minutes").default(2),
  status: text("status").default("pending"),
  executedAt: timestamp("executed_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
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

export const insertPrintStatSchema = createInsertSchema(printStats).omit({
  id: true,
  completedAt: true,
});

export const insertSmartPlugSchema = createInsertSchema(smartPlugs).omit({
  id: true,
  createdAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export const insertHomekitDeviceSchema = createInsertSchema(homekitDevices).omit({
  id: true,
  createdAt: true,
  lastSeen: true,
});

export const insertScheduledPrintSchema = createInsertSchema(scheduledPrints).omit({
  id: true,
  createdAt: true,
  executedAt: true,
  errorMessage: true,
  status: true,
});

export const DEFAULT_ENABLED_MODULES = [
  "status",
  "webcam", 
  "temperature",
  "jogControls",
  "jobControls",
  "fileList",
  "scheduledPrints",
  "stats",
];

export type Printer = typeof printers.$inferSelect;
export type InsertPrinter = z.infer<typeof insertPrinterSchema>;
export type PrintJob = typeof printJobs.$inferSelect;
export type InsertPrintJob = z.infer<typeof insertPrintJobSchema>;
export type DashboardPreferences = typeof dashboardPreferences.$inferSelect;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type AppSetting = typeof appSettings.$inferSelect;
export type PrintStat = typeof printStats.$inferSelect;
export type InsertPrintStat = z.infer<typeof insertPrintStatSchema>;
export type SmartPlug = typeof smartPlugs.$inferSelect;
export type InsertSmartPlug = z.infer<typeof insertSmartPlugSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type HomekitDevice = typeof homekitDevices.$inferSelect;
export type InsertHomekitDevice = z.infer<typeof insertHomekitDeviceSchema>;
export type ScheduledPrint = typeof scheduledPrints.$inferSelect;
export type InsertScheduledPrint = z.infer<typeof insertScheduledPrintSchema>;

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
  totalPrintTime: number | null;
  currentLine: number | null;
  totalLines: number | null;
};
