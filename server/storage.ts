import { type Printer, type InsertPrinter, type DashboardPreferences, type UploadedFile, type InsertUploadedFile, type PrintStat, type InsertPrintStat, type SmartPlug, type InsertSmartPlug, type PushSubscription, type InsertPushSubscription, printers, printJobs, dashboardPreferences, uploadedFiles, appSettings, printStats, smartPlugs, pushSubscriptions, DEFAULT_ENABLED_MODULES } from "@shared/schema";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { eq, and, gte, desc } from "drizzle-orm";

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
  addPrintStat(stat: InsertPrintStat): Promise<PrintStat>;
  getPrintStats(printerId: number): Promise<PrintStat[]>;
  getPrintStatsTotals(printerId: number): Promise<{ totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number }>;
  getPrintStatsByPeriod(printerId: number, since: Date): Promise<{ totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number }>;
  getRecentPrintStats(printerId: number, limit: number): Promise<PrintStat[]>;
  getSmartPlugs(): Promise<SmartPlug[]>;
  getSmartPlug(id: number): Promise<SmartPlug | undefined>;
  getEnabledSmartPlugs(): Promise<SmartPlug[]>;
  addSmartPlug(plug: InsertSmartPlug): Promise<SmartPlug>;
  updateSmartPlug(id: number, data: Partial<SmartPlug>): Promise<SmartPlug | undefined>;
  deleteSmartPlug(id: number): Promise<boolean>;
  getPushSubscriptions(printerId: number): Promise<PushSubscription[]>;
  addPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(endpoint: string): Promise<boolean>;
  deletePushSubscriptionsByPrinter(printerId: number): Promise<void>;
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
      .where(eq(uploadedFiles.printerId, printerId))
      .orderBy(desc(uploadedFiles.uploadedAt));
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

  async addPrintStat(stat: InsertPrintStat): Promise<PrintStat> {
    const result = await db.insert(printStats).values(stat).returning();
    return result[0]!;
  }

  async getPrintStats(printerId: number): Promise<PrintStat[]> {
    return await db
      .select()
      .from(printStats)
      .where(eq(printStats.printerId, printerId));
  }

  async getPrintStatsTotals(printerId: number): Promise<{ totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number }> {
    const result = await db
      .select({
        totalPrintTimeSeconds: sql<number>`COALESCE(SUM(${printStats.printTimeSeconds}), 0)`,
        totalFilamentUsedMm: sql<number>`COALESCE(SUM(${printStats.filamentUsedMm}), 0)`,
        totalPrints: sql<number>`COUNT(*)`,
      })
      .from(printStats)
      .where(eq(printStats.printerId, printerId));
    
    return {
      totalPrintTimeSeconds: Number(result[0]?.totalPrintTimeSeconds ?? 0),
      totalFilamentUsedMm: Number(result[0]?.totalFilamentUsedMm ?? 0),
      totalPrints: Number(result[0]?.totalPrints ?? 0),
    };
  }

  async getPrintStatsByPeriod(printerId: number, since: Date): Promise<{ totalPrintTimeSeconds: number; totalFilamentUsedMm: number; totalPrints: number }> {
    const result = await db
      .select({
        totalPrintTimeSeconds: sql<number>`COALESCE(SUM(${printStats.printTimeSeconds}), 0)`,
        totalFilamentUsedMm: sql<number>`COALESCE(SUM(${printStats.filamentUsedMm}), 0)`,
        totalPrints: sql<number>`COUNT(*)`,
      })
      .from(printStats)
      .where(and(
        eq(printStats.printerId, printerId),
        gte(printStats.completedAt, since)
      ));
    
    return {
      totalPrintTimeSeconds: Number(result[0]?.totalPrintTimeSeconds ?? 0),
      totalFilamentUsedMm: Number(result[0]?.totalFilamentUsedMm ?? 0),
      totalPrints: Number(result[0]?.totalPrints ?? 0),
    };
  }

  async getRecentPrintStats(printerId: number, limit: number): Promise<PrintStat[]> {
    return await db
      .select()
      .from(printStats)
      .where(eq(printStats.printerId, printerId))
      .orderBy(desc(printStats.completedAt))
      .limit(limit);
  }

  async getSmartPlugs(): Promise<SmartPlug[]> {
    return await db.select().from(smartPlugs);
  }

  async getSmartPlug(id: number): Promise<SmartPlug | undefined> {
    const result = await db.select().from(smartPlugs).where(eq(smartPlugs.id, id)).limit(1);
    return result[0];
  }

  async getEnabledSmartPlugs(): Promise<SmartPlug[]> {
    return await db.select().from(smartPlugs).where(eq(smartPlugs.isEnabled, true));
  }

  async addSmartPlug(plug: InsertSmartPlug): Promise<SmartPlug> {
    const result = await db.insert(smartPlugs).values(plug).returning();
    return result[0]!;
  }

  async updateSmartPlug(id: number, data: Partial<SmartPlug>): Promise<SmartPlug | undefined> {
    const result = await db.update(smartPlugs).set(data).where(eq(smartPlugs.id, id)).returning();
    return result[0];
  }

  async deleteSmartPlug(id: number): Promise<boolean> {
    const result = await db.delete(smartPlugs).where(eq(smartPlugs.id, id)).returning();
    return result.length > 0;
  }

  async getPushSubscriptions(printerId: number): Promise<PushSubscription[]> {
    return await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.printerId, printerId));
  }

  async addPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, sub.endpoint))
      .limit(1);
    
    if (existing[0]) {
      const result = await db
        .update(pushSubscriptions)
        .set({ printerId: sub.printerId, p256dh: sub.p256dh, auth: sub.auth })
        .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        .returning();
      return result[0]!;
    }
    
    const result = await db.insert(pushSubscriptions).values(sub).returning();
    return result[0]!;
  }

  async deletePushSubscription(endpoint: string): Promise<boolean> {
    const result = await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .returning();
    return result.length > 0;
  }

  async deletePushSubscriptionsByPrinter(printerId: number): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.printerId, printerId));
  }
}

export const storage = new DbStorage();
