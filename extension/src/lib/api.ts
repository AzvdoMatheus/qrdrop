/** Cliente do daemon local. Base fixa em 127.0.0.1 na porta previsível. */
const BASE = "http://127.0.0.1:8765";

export interface UploadResult {
  token: string;
  url: string;
  filename: string;
  size: number;
  expiresAt: string;
}

export interface HealthResult {
  ok: boolean;
  version: string;
  lanIp: string;
}

/** Verifica se o daemon está no ar. Usado para o estado "daemon offline". */
export async function checkHealth(): Promise<HealthResult | null> {
  try {
    const res = await fetch(`${BASE}/health`, { method: "GET" });
    if (!res.ok) return null;
    return (await res.json()) as HealthResult;
  } catch {
    return null;
  }
}

/**
 * Envia um arquivo via XMLHttpRequest para ter progresso de upload.
 * Resolve com o JSON do daemon (201) ou rejeita com mensagem legível.
 */
export function uploadFile(
  file: File,
  onProgress: (fraction: number) => void,
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/upload`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadResult);
        } catch {
          reject(new Error("Resposta inválida do daemon"));
        }
      } else if (xhr.status === 413) {
        reject(new Error("Arquivo excede o limite"));
      } else {
        reject(new Error(`Falha no upload (HTTP ${xhr.status})`));
      }
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Daemon offline ou inacessível")),
    );
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelado")));

    xhr.send(form);
  });
}
