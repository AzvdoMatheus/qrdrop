const HOST = "com.qrdrop.host";

export interface EnsureResult {
  ok: boolean;
  started?: boolean;
  lanIp?: string;
  version?: string;
  error?: string;
  hostMissing?: boolean;
}

export function ensureDaemon(): Promise<EnsureResult> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(HOST, { cmd: "ensure" }, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ ok: false, hostMissing: true, error: err.message });
          return;
        }
        resolve((resp ?? { ok: false, error: "Resposta vazia do host" }) as EnsureResult);
      });
    } catch (e) {
      resolve({
        ok: false,
        hostMissing: true,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
