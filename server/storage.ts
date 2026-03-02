import { type Printer, type InsertPrinter, type DashboardPreferences, type UploadedFile, type InsertUploadedFile, type SmartPlug, type InsertSmartPlug, type PrinterStats, type PushSubscription, type ScheduledPrint, type InsertScheduledPrint, printers, printJobs, dashboardPreferences, uploadedFiles, appSettings, smartPlugs, printerStats, pushSubscriptions, scheduledPrints, DEFAULT_ENABLED_MODULES } from "@shared/schema";
import { db } from "./db";
import { eq, and, lte } from "drizzle-orm";

export interface IStorage {
  getPrinter(id: number): Promise<Printer | undefined>;
  getFirstPrinter(): Promise<Printer | undefined>;
  getAllPrinters(): Promise<Printer[]>;
  createPrinter(printer: InsertPrinter): Promise<Printer>;
  updatePrinter(id: number, data: Partial<Printer>): Promise<Printer | undefined>;
  deletePrinter(id: number): Promise<void>;
  getDashboardPreferences(printerId: number): Promise<string[]>;
  setDashboardPreferences(printerId: number, enabledModules: string[]): Promise<void>;
  getUploadedFiles(printerId: number): Promise<UploadedFile[]>;
  getUploadedFile(id: number, printerId: number): Promise<UploadedFile | undefined>;
  addUploadedFile(file: InsertUploadedFile): Promise<UploadedFile>;
  deleteUploadedFile(id: number, printerId: number): Promise<boolean>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string | null): Promise<void>;
  getAllSmartPlugs(): Promise<SmartPlug[]>;
  getSmartPlug(id: number): Promise<SmartPlug | undefined>;
  getSmartPlugByDeviceId(deviceId: string): Promise<SmartPlug | undefined>;
  createSmartPlug(plug: InsertSmartPlug): Promise<SmartPlug>;
  updateSmartPlug(id: number, data: Partial<SmartPlug>): Promise<SmartPlug | undefined>;
  deleteSmartPlug(id: number): Promise<void>;
  getPrinterStats(printerId: number): Promise<PrinterStats | undefined>;
  updatePrinterStats(printerId: number, data: Partial<PrinterStats>): Promise<PrinterStats>;
  incrementPrintCount(printerId: number): Promise<void>;
  addPrintTime(printerId: number, seconds: number): Promise<void>;
  addFilamentUsed(printerId: number, grams: number): Promise<void>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
  addPushSubscription(endpoint: string, p256dh: string, auth: string): Promise<PushSubscription>;
  deletePushSubscription(endpoint: string): Promise<boolean>;
  createScheduledPrint(print: InsertScheduledPrint): Promise<ScheduledPrint>;
  getScheduledPrints(printerId: number): Promise<ScheduledPrint[]>;
  getAllScheduledPrints(): Promise<ScheduledPrint[]>;
  getPendingScheduledPrints(): Promise<ScheduledPrint[]>;
  updateScheduledPrint(id: number, data: Partial<ScheduledPrint>): Promise<ScheduledPrint | undefined>;
  deleteScheduledPrint(id: number): Promise<boolean>;
}

export class DbStorage implements IStorage {
  async getPrinter(id: number): Promise<Printer | undefined> {
    const result = await db.select().from(printers).where(eq(printers.id, id)).limit(1);
    return result[0];
  }

  async getFirstPrinter(): Promise<Printer | undefined> {
    const result = await db.select().from(printers).limit(1);
    return result[0];
  }

  async getAllPrinters(): Promise<Printer[]> {
    return await db.select().from(printers);
  }

  async createPrinter(insertPrinter: InsertPrinter): Promise<Printer> {
    const result = await db.insert(printers).values(insertPrinter).returning();
    return result[0]!;
  }

  async updatePrinter(id: number, data: Partial<Printer>): Promise<Printer | undefined> {
    const result = await db.update(printers).set(data).where(eq(printers.id, id)).returning();
    return result[0];
  }

  async deletePrinter(id: number): Promise<void> {
    await db.delete(dashboardPreferences).where(eq(dashboardPreferences.printerId, id));
    await db.delete(printers).where(eq(printers.id, id));
  }

  async getDashboardPreferences(printerId: number): Promise<string[]> {
    const result = await db
      .select()
      .from(dashboardPreferences)
      .where(eq(dashboardPreferences.printerId, printerId))
      .limit(1);
    
    if (result[0]) {
      return result[0].enabledModules;
    }
    return DEFAULT_ENABLED_MODULES;
  }

  async setDashboardPreferences(printerId: number, enabledModules: string[]): Promise<void> {
    const existing = await db
      .select()
      .from(dashboardPreferences)
      .where(eq(dashboardPreferences.printerId, printerId))
      .limit(1);

    if (existing[0]) {
      await db
        .update(dashboardPreferences)
        .set({ enabledModules })
        .where(eq(dashboardPreferences.printerId, printerId));
    } else {
      await db.insert(dashboardPreferences).values({
        printerId,
        enabledModules,
      });
    }
  }

  async getUploadedFiles(printerId: number): Promise<UploadedFile[]> {
    return await db
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.printerId, printerId));
  }

  async getUploadedFile(id: number, printerId: number): Promise<UploadedFile | undefined> {
    const result = await db
      .select()
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.id, id), eq(uploadedFiles.printerId, printerId)))
      .limit(1);
    return result[0];
  }

  async addUploadedFile(file: InsertUploadedFile): Promise<UploadedFile> {
    const result = await db.insert(uploadedFiles).values(file).returning();
    return result[0]!;
  }

  async deleteUploadedFile(id: number, printerId: number): Promise<boolean> {
    const result = await db
      .delete(uploadedFiles)
      .where(and(eq(uploadedFiles.id, id), eq(uploadedFiles.printerId, printerId)))
      .returning();
    return result.length > 0;
  }

  async getSetting(key: string): Promise<string | null> {
    const result = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    return result[0]?.value ?? null;
  }

  async setSetting(key: string, value: string | null): Promise<void> {
    const existing = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);

    if (existing[0]) {
      await db
        .update(appSettings)
        .set({ value })
        .where(eq(appSettings.key, key));
    } else {
      await db.insert(appSettings).values({ key, value });
    }
  }

  async getAllSmartPlugs(): Promise<SmartPlug[]> {
    return await db.select().from(smartPlugs);
  }

  async getSmartPlug(id: number): Promise<SmartPlug | undefined> {
    const result = await db.select().from(smartPlugs).where(eq(smartPlugs.id, id)).limit(1);
    return result[0];
  }

  async getSmartPlugByDeviceId(deviceId: string): Promise<SmartPlug | undefined> {
    const result = await db.select().from(smartPlugs).where(eq(smartPlugs.deviceId, deviceId)).limit(1);
    return result[0];
  }

  async createSmartPlug(plug: InsertSmartPlug): Promise<SmartPlug> {
    const result = await db.insert(smartPlugs).values(plug).returning();
    return result[0]!;
  }

  async updateSmartPlug(id: number, data: Partial<SmartPlug>): Promise<SmartPlug | undefined> {
    const result = await db.update(smartPlugs).set(data).where(eq(smartPlugs.id, id)).returning();
    return result[0];
  }

  async deleteSmartPlug(id: number): Promise<void> {
    await db.delete(smartPlugs).where(eq(smartPlugs.id, id));
  }

  async getPrinterStats(printerId: number): Promise<PrinterStats | undefined> {
    const result = await db.select().from(printerStats).where(eq(printerStats.printerId, printerId)).limit(1);
    if (!result[0]) {
      const newStats = await db.insert(printerStats).values({ printerId }).returning();
      return newStats[0];
    }
    return result[0];
  }

  async updatePrinterStats(printerId: number, data: Partial<PrinterStats>): Promise<PrinterStats> {
    const existing = await this.getPrinterStats(printerId);
    if (existing) {
      const result = await db.update(printerStats)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(printerStats.printerId, printerId))
        .returning();
      return result[0]!;
    }
    const result = await db.insert(printerStats).values({ printerId, ...data }).returning();
    return result[0]!;
  }

  async incrementPrintCount(printerId: number): Promise<void> {
    const stats = await this.getPrinterStats(printerId);
    if (stats) {
      await db.update(printerStats)
        .set({ 
          totalPrintCount: (stats.totalPrintCount ?? 0) + 1,
          updatedAt: new Date()
        })
        .where(eq(printerStats.printerId, printerId));
    }
  }

  async addPrintTime(printerId: number, seconds: number): Promise<void> {
    const stats = await this.getPrinterStats(printerId);
    if (stats) {
      await db.update(printerStats)
        .set({ 
          totalPrintTime: (stats.totalPrintTime ?? 0) + seconds,
          updatedAt: new Date()
        })
        .where(eq(printerStats.printerId, printerId));
    }
  }

  async addFilamentUsed(printerId: number, grams: number): Promise<void> {
    const stats = await this.getPrinterStats(printerId);
    if (stats) {
      await db.update(printerStats)
        .set({ 
          filamentUsed: (stats.filamentUsed ?? 0) + grams,
          updatedAt: new Date()
        })
        .where(eq(printerStats.printerId, printerId));
    }
  }

  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptions);
  }

  async addPushSubscription(endpoint: string, p256dh: string, auth: string): Promise<PushSubscription> {
    const existing = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).limit(1);
    if (existing[0]) {
      const result = await db.update(pushSubscriptions)
        .set({ p256dh, auth })
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .returning();
      return result[0]!;
    }
    const result = await db.insert(pushSubscriptions).values({ endpoint, p256dh, auth }).returning();
    return result[0]!;
  }

  async deletePushSubscription(endpoint: string): Promise<boolean> {
    const result = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).returning();
    return result.length > 0;
  }

  async createScheduledPrint(print: InsertScheduledPrint): Promise<ScheduledPrint> {
    const result = await db.insert(scheduledPrints).values(print).returning();
    return result[0]!;
  }

  async getScheduledPrints(printerId: number): Promise<ScheduledPrint[]> {
    return await db.select().from(scheduledPrints).where(eq(scheduledPrints.printerId, printerId));
  }

  async getAllScheduledPrints(): Promise<ScheduledPrint[]> {
    return await db.select().from(scheduledPrints);
  }

  async getPendingScheduledPrints(): Promise<ScheduledPrint[]> {
    return await db.select().from(scheduledPrints)
      .where(and(
        eq(scheduledPrints.status, "pending"),
        lte(scheduledPrints.scheduledAt, new Date())
      ));
  }

  async updateScheduledPrint(id: number, data: Partial<ScheduledPrint>): Promise<ScheduledPrint | undefined> {
    const result = await db.update(scheduledPrints).set(data).where(eq(scheduledPrints.id, id)).returning();
    return result[0];
  }

  async deleteScheduledPrint(id: number): Promise<boolean> {
    const result = await db.delete(scheduledPrints).where(eq(scheduledPrints.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DbStorage();
