import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createDigiStorageAssetProvider } from "./asset-import";

const execFileAsync = promisify(execFile);

/** What cannot be rebuilt from the sources or the database: the CDEP evidence behind identity, and the curated decisions. */
export const LOCAL_BACKUP_SETS = [
  { name: "cdep-history", path: "data/cdep-history" },
  { name: "curated", path: "data/curated" }
];

export type LocalBackupResult = {
  persisted: boolean;
  remoteFolder: string;
  files: Array<{ name: string; sourceFiles: number; bytes: number; sha256: string; remote?: string; verified?: boolean }>;
};

function countFiles(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1), 0);
}

/**
 * Archives the irreplaceable local data and, with `persist`, uploads it to Digi Storage under cumvoteaza-backups/
 * and proves the copy: the file is downloaded again and its SHA-256 compared with the original.
 */
export async function backupLocalData(options: { repoRoot: string; persist: boolean; date?: string }): Promise<LocalBackupResult> {
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const remoteFolder = `local-data/${date}`;
  const work = await mkdtemp(path.join(os.tmpdir(), "cumvoteaza-backup-"));
  const result: LocalBackupResult = { persisted: options.persist, remoteFolder, files: [] };
  try {
    const storage = options.persist ? createDigiStorageAssetProvider("cumvoteaza-backups") : undefined;
    for (const set of LOCAL_BACKUP_SETS) {
      const source = path.join(options.repoRoot, set.path);
      if (!existsSync(source)) throw new Error(`Cannot back up ${set.path}: it does not exist.`);
      const archive = path.join(work, `${set.name}-${date}.tar.gz`);
      await execFileAsync("tar", ["-czf", archive, "-C", options.repoRoot, set.path]);
      const bytes = readFileSync(archive);
      const entry: LocalBackupResult["files"][number] = { name: path.basename(archive), sourceFiles: countFiles(source), bytes: statSync(archive).size, sha256: createHash("sha256").update(bytes).digest("hex") };
      if (storage) {
        const objectPath = `${remoteFolder}/${entry.name}`;
        entry.remote = (await storage.upload({ objectPath, bytes, mimeType: "application/gzip" })).storagePath;
        entry.verified = createHash("sha256").update(await storage.download(objectPath)).digest("hex") === entry.sha256;
        if (!entry.verified) throw new Error(`Backup of ${set.name} did not verify: the uploaded copy differs from the archive.`);
      }
      result.files.push(entry);
    }
    if (storage) {
      const manifest = Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), files: result.files }, null, 2));
      await storage.upload({ objectPath: `${remoteFolder}/manifest.json`, bytes: manifest, mimeType: "application/json" });
    }
    return result;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
