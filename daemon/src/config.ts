import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Config {
  port: number;
  bindIpOverride: string | undefined;
  tokenTtlMs: number;
  gcIntervalMs: number;
  maxUploadBytes: number;
  storageDir: string;
  extensionId: string | undefined;
  version: string;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config: Config = {
  port: envInt("QRDROP_PORT", 8765),
  bindIpOverride: process.env.QRDROP_BIND_IP,
  tokenTtlMs: envInt("QRDROP_TTL_MS", 10 * 60 * 1000),
  gcIntervalMs: envInt("QRDROP_GC_MS", 60 * 1000),
  maxUploadBytes: envInt("QRDROP_MAX_BYTES", 2 * 1024 * 1024 * 1024),
  storageDir: process.env.QRDROP_STORAGE_DIR ?? join(tmpdir(), "qrdrop-files"),
  extensionId: process.env.QRDROP_EXTENSION_ID,
  version: "1.0.0",
};
