import { watch, FSWatcher } from "fs";
import { readdir, readFile, stat } from "fs/promises";
import { join, extname } from "path";
import { storage } from "./storage";
import { extractThumbnail } from "./thumbnailExtractor";

let watcher: FSWatcher | null = null;
let watchPath: string | null = null;
let processedFiles = new Set<string>();

const GCODE_EXTENSIONS = [".gcode", ".nc", ".cnc"];

async function processNewFile(filePath: string, filename: string) {
  try {
    if (processedFiles.has(filePath)) {
      return;
    }

    const ext = extname(filename).toLowerCase();
    if (!GCODE_EXTENSIONS.includes(ext)) {
      return;
    }

    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return;
    }

    const printers = await storage.getAllPrinters();
    const printer = printers.find((p) => p.isConnected) || printers[0];
    
    if (!printer) {
      console.log(`[FileWatcher] No printer configured, skipping file: ${filename}`);
      return;
    }

    const existingFiles = await storage.getUploadedFiles(printer.id);
    if (existingFiles.some((f) => f.filename === filename)) {
      console.log(`[FileWatcher] File already exists: ${filename}`);
      processedFiles.add(filePath);
      return;
    }

    const fileContent = await readFile(filePath, "utf-8");
    const displayName = filename.replace(/\.[^/.]+$/, "");
    const thumbnail = extractThumbnail(fileContent);

    await storage.addUploadedFile({
      printerId: printer.id,
      filename,
      displayName,
      fileContent,
      thumbnail,
      source: "watch-folder",
    });

    processedFiles.add(filePath);
    console.log(`[FileWatcher] Added file from watch folder: ${filename}${thumbnail ? ' (with thumbnail)' : ''}`);
  } catch (error) {
    console.error(`[FileWatcher] Error processing file ${filename}:`, error);
  }
}

async function scanExistingFiles(dirPath: string) {
  try {
    const files = await readdir(dirPath);
    for (const filename of files) {
      const filePath = join(dirPath, filename);
      await processNewFile(filePath, filename);
    }
  } catch (error) {
    console.error(`[FileWatcher] Error scanning directory:`, error);
  }
}

export async function startWatcher(folderPath: string): Promise<boolean> {
  try {
    await stopWatcher();

    const folderStat = await stat(folderPath);
    if (!folderStat.isDirectory()) {
      console.error(`[FileWatcher] Path is not a directory: ${folderPath}`);
      return false;
    }

    watchPath = folderPath;
    processedFiles.clear();

    await scanExistingFiles(folderPath);

    watcher = watch(folderPath, { persistent: true }, async (eventType, filename) => {
      if (eventType === "rename" && filename) {
        const filePath = join(folderPath, filename);
        setTimeout(() => processNewFile(filePath, filename), 500);
      }
    });

    watcher.on("error", (error) => {
      console.error(`[FileWatcher] Watcher error:`, error);
    });

    console.log(`[FileWatcher] Started watching: ${folderPath}`);
    return true;
  } catch (error) {
    console.error(`[FileWatcher] Failed to start watcher:`, error);
    return false;
  }
}

export async function stopWatcher(): Promise<void> {
  if (watcher) {
    watcher.close();
    watcher = null;
    watchPath = null;
    console.log(`[FileWatcher] Stopped watching`);
  }
}

export function getWatcherStatus(): { active: boolean; path: string | null } {
  return {
    active: watcher !== null,
    path: watchPath,
  };
}

export async function initializeWatcher(): Promise<void> {
  try {
    const savedPath = await storage.getSetting("watchFolderPath");
    if (savedPath) {
      const success = await startWatcher(savedPath);
      if (!success) {
        console.log(`[FileWatcher] Saved watch folder path is invalid, clearing setting`);
        await storage.setSetting("watchFolderPath", null);
      }
    }
  } catch (error) {
    console.error(`[FileWatcher] Error initializing watcher:`, error);
  }
}
