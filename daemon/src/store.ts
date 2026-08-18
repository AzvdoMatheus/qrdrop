import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";

/**
 * Índice de tokens em memória + arquivos em disco. Reinício do daemon invalida
 * todos os tokens — comportamento aceitável e até desejável (PLANNING §2).
 */
export interface FileEntry {
  token: string;
  /** Caminho real em disco — gerado, nunca derivado do nome enviado. */
  path: string;
  /** Nome original sanitizado, usado só no Content-Disposition. */
  filename: string;
  size: number;
  expiresAt: number;
}

const entries = new Map<string, FileEntry>();
let gcTimer: NodeJS.Timeout | undefined;

/** Token aleatório de 16 bytes — nunca sequencial, nunca derivado do nome. */
export function newToken(): string {
  return randomBytes(16).toString("hex");
}

export async function ensureStorage(): Promise<void> {
  await mkdir(config.storageDir, { recursive: true });
}

export function storagePathFor(token: string): string {
  return join(config.storageDir, token);
}

export function register(entry: Omit<FileEntry, "expiresAt">): FileEntry {
  const full: FileEntry = { ...entry, expiresAt: Date.now() + config.tokenTtlMs };
  entries.set(entry.token, full);
  return full;
}

export function get(token: string): FileEntry | undefined {
  const entry = entries.get(token);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) return undefined;
  return entry;
}

async function evict(token: string): Promise<void> {
  const entry = entries.get(token);
  entries.delete(token);
  if (entry) {
    await rm(entry.path, { force: true }).catch(() => {});
  }
}

/** Varredura periódica: apaga registro e arquivo do disco de tokens expirados. */
async function sweep(): Promise<void> {
  const now = Date.now();
  for (const [token, entry] of entries) {
    if (entry.expiresAt <= now) await evict(token);
  }
}

export function startGc(): void {
  gcTimer = setInterval(() => {
    void sweep();
  }, config.gcIntervalMs);
  gcTimer.unref();
}

/** Cleanup no SIGINT: remove todos os arquivos temporários. */
export async function shutdown(): Promise<void> {
  if (gcTimer) clearInterval(gcTimer);
  await Promise.all([...entries.keys()].map((t) => evict(t)));
}
