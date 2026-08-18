import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.js";
import { detectLanIp } from "./network.js";
import { ensureStorage, startGc, shutdown } from "./store.js";
import { handleUpload } from "./routes/upload.js";
import { handleDownload } from "./routes/download.js";
import { sendJson } from "./routes/util.js";

const lanIp = detectLanIp();

// Cada usuário gera sua própria extensão, então o ID não é fixo. Aceitamos
// qualquer origem chrome-extension://; QRDROP_EXTENSION_ID fixa um ID específico.
const PINNED_ORIGIN = config.extensionId
  ? `chrome-extension://${config.extensionId}`
  : undefined;

function isAllowedOrigin(origin: string | undefined): origin is string {
  if (!origin) return false;
  if (PINNED_ORIGIN) return origin === PINNED_ORIGIN;
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
  }
}

function route(req: IncomingMessage, res: ServerResponse): void {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${lanIp}:${config.port}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true, version: config.version, lanIp });
    return;
  }

  if (req.method === "POST" && path === "/upload") {
    handleUpload(req, res, lanIp);
    return;
  }

  const dl = path.match(/^\/d\/([a-f0-9]{32})$/);
  if (req.method === "GET" && dl) {
    handleDownload(req, res, dl[1]!);
    return;
  }

  sendJson(res, 404, { error: "Rota não encontrada" });
}

async function main(): Promise<void> {
  await ensureStorage();
  startGc();

  const hosts = lanIp === "127.0.0.1" ? [lanIp] : [lanIp, "127.0.0.1"];
  const servers = hosts.map(() => createServer(route));

  servers.forEach((server, i) => {
    const host = hosts[i]!;
    server.listen(config.port, host, () => {
      if (i === 0) {
        console.log(`QRDrop daemon v${config.version}`);
        console.log(`  TTL dos tokens: ${config.tokenTtlMs / 1000}s`);
      }
      console.log(`  escutando em http://${host}:${config.port}`);
    });
  });

  const stop = async () => {
    console.log("\nencerrando…");
    for (const server of servers) server.close();
    await shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

void main();
