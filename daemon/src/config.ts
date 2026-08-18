import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Configuração central do daemon. Tudo é sobrescrevível por variável de ambiente
 * para manter o comportamento previsível (ver seção "Decisões fechadas" do PLANNING).
 */
export interface Config {
  /** Porta fixa, previsível para o README. */
  port: number;
  /** Override manual do IP da LAN (pula a heurística de network.ts). */
  bindIpOverride: string | undefined;
  /** TTL de cada token em milissegundos. */
  tokenTtlMs: number;
  /** Intervalo do garbage collector de tokens/arquivos. */
  gcIntervalMs: number;
  /** Limite de tamanho por upload, em bytes. */
  maxUploadBytes: number;
  /** Diretório onde os arquivos recebidos são gravados. */
  storageDir: string;
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
  version: "1.0.0",
};
