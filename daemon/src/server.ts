import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.js";
import { detectLanIp } from "./network.js";
import { ensureStorage, startGc, shutdown } from "./store.js";
import { handleUpload } from "./routes/upload.js";
import { handleDownload } from "./routes/download.js";
import { sendJson } from "./routes/util.js";

const lanIp = detectLanIp();

/** CORS restrito à origem chrome-extension:// (PLANNING §4). */
function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && origin.startsWith("chrome-extension://")) {
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

  const server = createServer(route);

  // Bind explícito no IP da LAN — nunca 0.0.0.0 (PLANNING §4).
  server.listen(config.port, lanIp, () => {
    console.log(`QRDrop daemon v${config.version}`);
    console.log(`  escutando em http://${lanIp}:${config.port}`);
    console.log(`  TTL dos tokens: ${config.tokenTtlMs / 1000}s`);
  });

  const stop = async () => {
    console.log("\nencerrando…");
    server.close();
    await shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

void main();
