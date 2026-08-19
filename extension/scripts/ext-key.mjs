import { createHash, createPublicKey, generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const KEY_PEM = join(HERE, "..", "native-host", "qrdrop-key.pem");

export function ensureKeyPair(pemPath = KEY_PEM) {
  if (existsSync(pemPath)) return false;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(pemPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  return true;
}

export function extensionIdentity(pemPath = KEY_PEM) {
  ensureKeyPair(pemPath);
  const der = createPublicKey(readFileSync(pemPath)).export({ type: "spki", format: "der" });
  const hash = createHash("sha256").update(der).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 0xf));
  }
  return { publicKeyB64: der.toString("base64"), extensionId: id };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { publicKeyB64, extensionId } = extensionIdentity();
  process.stdout.write(`${publicKeyB64}\n${extensionId}\n`);
}
