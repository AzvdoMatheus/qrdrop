import QRCode from "qrcode";

export async function renderQr(canvas: HTMLCanvasElement, text: string): Promise<void> {
  await QRCode.toCanvas(canvas, text, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#111111", light: "#ffffff" },
  });
}
