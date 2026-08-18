import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { extname } from "node:path";
import { get } from "../store.js";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};

function contentTypeFor(filename: string): string {
  return MIME[extname(filename).toLowerCase()] ?? "application/octet-stream";
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function handleDownload(
  _req: IncomingMessage,
  res: ServerResponse,
  token: string,
): void {
  const entry = get(token);
  if (!entry) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 — token inválido ou expirado");
    return;
  }

  res.writeHead(200, {
    "content-type": contentTypeFor(entry.filename),
    "content-length": String(entry.size),
    "content-disposition": contentDisposition(entry.filename),
    "cache-control": "no-store",
  });

  const stream = createReadStream(entry.path);
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  });
  stream.pipe(res);
}
