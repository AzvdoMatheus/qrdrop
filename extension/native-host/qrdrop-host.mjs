#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DAEMON_ENTRY = join(HERE, "..", "..", "daemon", "dist", "server.js");
const DAEMON_CWD = join(HERE, "..", "..", "daemon");

const PORT = Number.parseInt(process.env.QRDROP_PORT ?? "", 10) || 8765;
const HEALTH_URL = `http://127.0.0.1:${PORT}/health`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readMessage() {
  return new Promise((resolve) => {
    const chunks = [];
    let need = null;
    const onData = (chunk) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (need === null && buf.length >= 4) need = buf.readUInt32LE(0);
      if (need !== null && buf.length >= 4 + need) {
        process.stdin.off("data", onData);
        try {
          resolve(JSON.parse(buf.subarray(4, 4 + need).toString("utf8")));
        } catch {
          resolve({});
        }
      }
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", () => resolve(null));
  });
}

function writeMessage(obj) {
  const body = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

async function health() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(HEALTH_URL, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function spawnDaemon() {
  const child = spawn(process.execPath, [DAEMON_ENTRY], {
    cwd: DAEMON_CWD,
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

async function ensure() {
  const already = await health();
  if (already) return { ok: true, started: false, ...already };

  if (!existsSync(DAEMON_ENTRY)) {
    return {
      ok: false,
      error: "Daemon não compilado. Rode ./install.sh (ou daemon: npm run build).",
    };
  }

  spawnDaemon();

  for (let i = 0; i < 24; i++) {
    await sleep(250);
    const h = await health();
    if (h) return { ok: true, started: true, ...h };
  }
  return { ok: false, error: "Daemon subiu mas não respondeu ao health a tempo." };
}

async function main() {
  const msg = await readMessage();
  if (msg === null) return;
  const cmd = msg && typeof msg === "object" ? msg.cmd : undefined;

  if (cmd === "ensure") {
    writeMessage(await ensure());
  } else if (cmd === "ping") {
    writeMessage({ ok: true, pong: true });
  } else {
    writeMessage({ ok: false, error: `Comando desconhecido: ${String(cmd)}` });
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    try {
      writeMessage({ ok: false, error: String(err) });
    } catch {}
    process.exit(1);
  },
);
