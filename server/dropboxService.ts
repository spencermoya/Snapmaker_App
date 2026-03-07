import { Dropbox } from 'dropbox';
import { storage } from './storage';
import { extractThumbnail } from './thumbnailExtractor';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=dropbox',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Dropbox not connected');
  }
  return accessToken;
}

async function getUncachableDropboxClient() {
  const accessToken = await getAccessToken();
  return new Dropbox({ accessToken });
}

const ALLOWED_EXTENSIONS = ['.gcode', '.nc', '.cnc'];

function isGcodeFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export async function isDropboxConnected(): Promise<boolean> {
  try {
    const dbx = await getUncachableDropboxClient();
    await dbx.usersGetCurrentAccount();
    return true;
  } catch {
    return false;
  }
}

export async function getDropboxAccountInfo(): Promise<{ email: string; name: string } | null> {
  try {
    const dbx = await getUncachableDropboxClient();
    const account = await dbx.usersGetCurrentAccount();
    return {
      email: account.result.email,
      name: account.result.name.display_name,
    };
  } catch {
    return null;
  }
}

export async function listDropboxFolder(folderPath: string): Promise<{ name: string; path: string; size: number }[]> {
  const dbx = await getUncachableDropboxClient();
  const normalizedPath = folderPath === '/' ? '' : folderPath;

  const files: { name: string; path: string; size: number }[] = [];
  let response = await dbx.filesListFolder({ path: normalizedPath });

  const processEntries = (entries: any[]) => {
    for (const entry of entries) {
      if (entry['.tag'] === 'file' && isGcodeFile(entry.name)) {
        files.push({
          name: entry.name,
          path: entry.path_lower || entry.path_display || '',
          size: (entry as any).size || 0,
        });
      }
    }
  };

  processEntries(response.result.entries);

  while (response.result.has_more) {
    response = await dbx.filesListFolderContinue({ cursor: response.result.cursor });
    processEntries(response.result.entries);
  }

  return files;
}

export async function downloadDropboxFile(filePath: string): Promise<string> {
  const dbx = await getUncachableDropboxClient();
  const response = await dbx.filesDownload({ path: filePath });
  const result = response.result as any;

  const content = result.fileBinary || result.fileBlob;
  if (content instanceof Buffer) {
    return content.toString('utf-8');
  }
  if (content instanceof ArrayBuffer) {
    return Buffer.from(content).toString('utf-8');
  }
  if (typeof content === 'string') {
    return content;
  }
  if (content && typeof content.text === 'function') {
    return await content.text();
  }
  if (content && typeof content.arrayBuffer === 'function') {
    const ab = await content.arrayBuffer();
    return Buffer.from(ab).toString('utf-8');
  }
  throw new Error('Unexpected file content type from Dropbox');
}

export interface DropboxSyncResult {
  synced: number;
  skipped: number;
  errors: string[];
  files: string[];
}

export async function syncDropboxFolder(printerId: number): Promise<DropboxSyncResult> {
  const folderPath = await storage.getSetting('dropbox_folder_path');
  if (!folderPath) {
    throw new Error('No Dropbox folder configured');
  }

  const result: DropboxSyncResult = { synced: 0, skipped: 0, errors: [], files: [] };

  try {
    const dropboxFiles = await listDropboxFolder(folderPath);
    const existingFiles = await storage.getUploadedFiles(printerId);
    const existingFilenames = new Set(existingFiles.filter(f => f.source === 'dropbox').map(f => f.filename));

    for (const file of dropboxFiles) {
      if (existingFilenames.has(file.name)) {
        result.skipped++;
        continue;
      }

      try {
        console.log(`[DropboxSync] Downloading ${file.name}...`);
        const content = await downloadDropboxFile(file.path);
        const thumbnail = extractThumbnail(content);
        const displayName = file.name.replace(/\.(gcode|nc|cnc)$/i, '');

        await storage.addUploadedFile({
          printerId,
          filename: file.name,
          displayName,
          fileContent: content,
          thumbnail,
          source: 'dropbox',
        });

        result.synced++;
        result.files.push(file.name);
        console.log(`[DropboxSync] Imported ${file.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`${file.name}: ${msg}`);
        console.error(`[DropboxSync] Failed to import ${file.name}:`, msg);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Failed to list Dropbox folder: ${msg}`);
  }

  return result;
}

let syncInterval: NodeJS.Timeout | null = null;
let isSyncing = false;
let consecutiveErrors = 0;

export async function startDropboxSync(): Promise<void> {
  if (syncInterval) return;

  const enabled = await storage.getSetting('dropbox_sync_enabled');
  if (enabled !== 'true') return;

  const folderPath = await storage.getSetting('dropbox_folder_path');
  if (!folderPath) return;

  const connected = await isDropboxConnected();
  if (!connected) {
    console.log('[DropboxSync] Dropbox not connected, skipping auto-sync');
    return;
  }

  console.log('[DropboxSync] Starting automatic sync');
  consecutiveErrors = 0;
  syncInterval = setInterval(runDropboxSync, 30000);
  runDropboxSync();
}

export function stopDropboxSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  console.log('[DropboxSync] Stopped automatic sync');
}

async function runDropboxSync(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const enabled = await storage.getSetting('dropbox_sync_enabled');
    if (enabled !== 'true') {
      stopDropboxSync();
      return;
    }

    const printers = await storage.getAllPrinters();
    if (printers.length === 0) return;

    const printerId = printers[0].id;
    const result = await syncDropboxFolder(printerId);

    if (result.synced > 0) {
      console.log(`[DropboxSync] Synced ${result.synced} new file(s): ${result.files.join(', ')}`);

      try {
        const { isPushEnabled, sendPushNotification } = await import('./pushService');
        if (isPushEnabled()) {
          await sendPushNotification({
            title: 'Dropbox Sync',
            body: `${result.synced} new file(s) imported: ${result.files.join(', ')}`,
            data: { type: 'dropbox_sync', count: result.synced },
          });
        }
      } catch {}
    }
    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    if (consecutiveErrors <= 3) {
      console.error('[DropboxSync] Auto-sync error:', err instanceof Error ? err.message : err);
    }
    if (consecutiveErrors >= 10) {
      console.log('[DropboxSync] Too many consecutive errors, stopping auto-sync');
      stopDropboxSync();
    }
  } finally {
    isSyncing = false;
  }
}

export function isDropboxSyncRunning(): boolean {
  return syncInterval !== null;
}
