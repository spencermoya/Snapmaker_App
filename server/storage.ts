import { type Printer, type InsertPrinter, printers, printJobs } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getPrinter(id: number): Promise<Printer | undefined>;
  getFirstPrinter(): Promise<Printer | undefined>;
  getAllPrinters(): Promise<Printer[]>;
  createPrinter(printer: InsertPrinter): Promise<Printer>;
  updatePrinter(id: number, data: Partial<Printer>): Promise<Printer | undefined>;
  deletePrinter(id: number): Promise<void>;
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
    await db.delete(printers).where(eq(printers.id, id));
  }
}

export const storage = new DbStorage();
