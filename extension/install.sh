#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.qrdrop.host"
EXT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$EXT_DIR/.." && pwd)"
NATIVE_DIR="$EXT_DIR/native-host"
HOST_JS="$NATIVE_DIR/qrdrop-host.mjs"
LAUNCHER="$NATIVE_DIR/qrdrop-host.sh"

case "$(uname -s)" in
  Darwin)
    SUPPORT="$HOME/Library/Application Support"
    TARGET_DIRS=(
      "$SUPPORT/Google/Chrome/NativeMessagingHosts"
      "$SUPPORT/Google/Chrome Canary/NativeMessagingHosts"
      "$SUPPORT/Google/Chrome Beta/NativeMessagingHosts"
      "$SUPPORT/Chromium/NativeMessagingHosts"
      "$SUPPORT/BraveSoftware/Brave-Browser/NativeMessagingHosts"
      "$SUPPORT/Microsoft Edge/NativeMessagingHosts"
    )
    ;;
  Linux)
    CFG="${XDG_CONFIG_HOME:-$HOME/.config}"
    TARGET_DIRS=(
      "$CFG/google-chrome/NativeMessagingHosts"
      "$CFG/chromium/NativeMessagingHosts"
      "$CFG/BraveSoftware/Brave-Browser/NativeMessagingHosts"
      "$CFG/microsoft-edge/NativeMessagingHosts"
    )
    ;;
  *)
    echo "SO não suportado por este instalador: $(uname -s)" >&2
    exit 1
    ;;
esac

uninstall() {
  echo "Removendo manifests do host…"
  for dir in "${TARGET_DIRS[@]}"; do
    rm -f "$dir/$HOST_NAME.json" 2>/dev/null && echo "  removido: $dir/$HOST_NAME.json" || true
  done
  rm -f "$LAUNCHER"
  echo "Pronto. A extensão pode ser removida em chrome://extensions."
  exit 0
}

[[ "${1:-}" == "--uninstall" ]] && uninstall

NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "node não encontrado no PATH. Instale o Node 18+ e rode de novo." >&2
  exit 1
fi
NODE_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"
echo "node: $NODE_BIN"

# Chave da extensão: gerada localmente na primeira execução (nunca versionada).
# Fixa o ID da extensão para que o allowed_origins do host bata de primeira.
KEY_PEM="$NATIVE_DIR/qrdrop-key.pem"
if [[ ! -f "$KEY_PEM" ]]; then
  echo "Gerando chave local da extensão (qrdrop-key.pem)…"
  "$NODE_BIN" -e '
    const { generateKeyPairSync } = require("node:crypto");
    const { writeFileSync } = require("node:fs");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" });
    writeFileSync(process.argv[1], pem, { mode: 0o600 });
  ' "$KEY_PEM"
fi

# Deriva do pem: (1) a public key base64 para o manifest, (2) o ID da extensão.
GEN="$("$NODE_BIN" -e '
  const { readFileSync } = require("node:fs");
  const { createPublicKey, createHash } = require("node:crypto");
  const der = createPublicKey(readFileSync(process.argv[1]))
    .export({ type: "spki", format: "der" });
  const hash = createHash("sha256").update(der).digest();
  let id = "";
  for (let i = 0; i < 16; i++) {
    id += String.fromCharCode(97 + (hash[i] >> 4));
    id += String.fromCharCode(97 + (hash[i] & 0xf));
  }
  process.stdout.write(der.toString("base64") + "\n" + id + "\n");
' "$KEY_PEM")"
PUBKEY_B64="$(printf '%s\n' "$GEN" | sed -n 1p)"
EXT_ID="$(printf '%s\n' "$GEN" | sed -n 2p)"
echo "ID da extensão: $EXT_ID"

echo "Compilando o daemon…"
( cd "$REPO_DIR/daemon" && npm install --silent && npm run build --silent )
echo "Compilando a extensão…"
( cd "$EXT_DIR" && npm install --silent && npm run build --silent )

# Injeta a public key no manifest buildado (o manifest versionado não a contém).
"$NODE_BIN" -e '
  const { readFileSync, writeFileSync } = require("node:fs");
  const p = process.argv[1];
  const m = JSON.parse(readFileSync(p, "utf8"));
  m.key = process.argv[2];
  writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
' "$EXT_DIR/dist/manifest.json" "$PUBKEY_B64"

cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
exec "$NODE_BIN" "$HOST_JS" "\$@"
EOF
chmod +x "$LAUNCHER" "$HOST_JS"

MANIFEST="$(sed -e "s#__HOST_PATH__#$LAUNCHER#" -e "s#__EXTENSION_ID__#$EXT_ID#" "$NATIVE_DIR/$HOST_NAME.json.template")"
installed=0
for dir in "${TARGET_DIRS[@]}"; do
  parent="$(dirname "$dir")"
  [[ -d "$parent" ]] || continue
  mkdir -p "$dir"
  printf '%s\n' "$MANIFEST" > "$dir/$HOST_NAME.json"
  echo "  registrado: $dir/$HOST_NAME.json"
  installed=$((installed + 1))
done

if [[ "$installed" -eq 0 ]]; then
  echo "Nenhum navegador baseado em Chromium encontrado. Nada registrado." >&2
  exit 1
fi

cat <<EOF

Pronto — host registrado em $installed navegador(es).

Falta só carregar a extensão (uma vez):
  1. Abra chrome://extensions
  2. Ative o "Modo desenvolvedor"
  3. "Carregar sem compactação" → selecione: $EXT_DIR/dist

Depois disso é só clicar no ícone do QRDrop — o daemon sobe sozinho.
EOF
