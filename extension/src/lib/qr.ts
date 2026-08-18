import QRCode from "qrcode";

/**
 * Geração de QR 100% offline — a lib `qrcode` é bundlada, nunca uma API remota.
 * Renderiza direto num <canvas>.
 */
export async function renderQr(canvas: HTMLCanvasElement, text: string): Promise<void> {
  await QRCode.toCanvas(canvas, text, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
}
