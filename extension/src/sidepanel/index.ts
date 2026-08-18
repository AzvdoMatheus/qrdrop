import { checkHealth, uploadFile, type UploadResult } from "../lib/api.js";
import { renderQr } from "../lib/qr.js";

const statusEl = must<HTMLSpanElement>("#status");
const offlineEl = must<HTMLDivElement>("#offline");
const dropzone = must<HTMLDivElement>("#dropzone");
const picker = must<HTMLButtonElement>("#picker");
const fileInput = must<HTMLInputElement>("#fileInput");
const queue = must<HTMLUListElement>("#queue");
const itemTemplate = must<HTMLTemplateElement>("#itemTemplate");

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Elemento não encontrado: ${selector}`);
  return el;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

// ---- Estado do daemon (online/offline) ------------------------------------

async function refreshStatus(): Promise<void> {
  const health = await checkHealth();
  if (health) {
    statusEl.textContent = `online · ${health.lanIp}`;
    statusEl.className = "status status--ok";
    offlineEl.classList.add("hidden");
  } else {
    statusEl.textContent = "offline";
    statusEl.className = "status status--off";
    offlineEl.classList.remove("hidden");
  }
}

// ---- Fila de uploads -------------------------------------------------------

async function enqueue(file: File): Promise<void> {
  const node = itemTemplate.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
  const nameEl = node.querySelector<HTMLSpanElement>(".item__name")!;
  const sizeEl = node.querySelector<HTMLSpanElement>(".item__size")!;
  const bar = node.querySelector<HTMLDivElement>(".item__bar")!;
  const statusLine = node.querySelector<HTMLDivElement>(".item__status")!;
  const qrBox = node.querySelector<HTMLDivElement>(".item__qr")!;

  nameEl.textContent = file.name;
  sizeEl.textContent = formatSize(file.size);
  statusLine.textContent = "enviando…";
  queue.prepend(node);

  try {
    const result = await uploadFile(file, (fraction) => {
      bar.style.width = `${Math.round(fraction * 100)}%`;
    });
    bar.style.width = "100%";
    statusLine.textContent = "pronto — escaneie o QR";
    await showQr(node, qrBox, result);
  } catch (err) {
    statusLine.textContent = err instanceof Error ? err.message : "falha no upload";
    statusLine.style.color = "var(--err)";
    void refreshStatus();
  }
}

async function showQr(
  item: HTMLLIElement,
  qrBox: HTMLDivElement,
  result: UploadResult,
): Promise<void> {
  const canvas = qrBox.querySelector<HTMLCanvasElement>("canvas")!;
  const urlEl = qrBox.querySelector<HTMLDivElement>(".item__url")!;
  const ttlEl = qrBox.querySelector<HTMLDivElement>(".item__ttl")!;

  await renderQr(canvas, result.url);
  urlEl.textContent = result.url;
  qrBox.classList.remove("hidden");

  const expiresAt = new Date(result.expiresAt).getTime();
  const tick = () => {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      ttlEl.textContent = "expirado";
      qrBox.classList.add("item__qr--expired");
      clearInterval(timer);
      return;
    }
    const s = Math.floor(remaining / 1000);
    ttlEl.textContent = `expira em ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  tick();
  const timer = setInterval(tick, 1000);
  item.dataset.token = result.token;
}

function handleFiles(files: FileList | null): void {
  if (!files) return;
  for (const file of Array.from(files)) void enqueue(file);
}

// ---- Wiring ----------------------------------------------------------------

picker.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  handleFiles(fileInput.files);
  fileInput.value = "";
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dropzone--over");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dropzone--over"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dropzone--over");
  handleFiles(e.dataTransfer?.files ?? null);
});

void refreshStatus();
setInterval(() => void refreshStatus(), 5000);
