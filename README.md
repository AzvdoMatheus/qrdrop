# QRDrop

> Compartilhamento de arquivos PC → celular pela LAN, sem nuvem.
> Extensão do Chrome + daemon local. QR code na tela, celular escaneia e baixa.

Arraste um arquivo no side panel da extensão → o daemon grava em disco e devolve
um token efêmero → a extensão renderiza um QR de `http://<ip-da-lan>:8765/d/<token>`
→ o celular escaneia e baixa. **Nada sai da LAN.** Nenhuma conta, nenhum servidor remoto.

## Arquitetura

```
Extensão Chrome MV3           Daemon Node/TS
 side panel (drop)  ──POST──▶  POST /upload  (multipart streaming)
 render QR offline  ◀─JSON──   GET  /d/:token
                               GET  /health
                                      │ HTTP na LAN
                                   Celular
```

## Como rodar

### 1. Daemon

```bash
cd daemon
npm install
npm run dev          # tsx watch, escuta no IP da LAN, porta 8765
```

Variáveis de ambiente (todas opcionais):

| Var | Default | Descrição |
|---|---|---|
| `QRDROP_PORT` | `8765` | Porta do daemon |
| `QRDROP_BIND_IP` | auto | Força o IP da LAN (pula a heurística) |
| `QRDROP_TTL_MS` | `600000` | TTL dos tokens (10 min) |
| `QRDROP_MAX_BYTES` | `2147483648` | Limite de upload (2 GB) |
| `QRDROP_STORAGE_DIR` | tmp do SO | Onde os arquivos são gravados |

### 2. Extensão

```bash
cd extension
npm install
npm run build        # gera dist/
```

Em `chrome://extensions` → ative o modo desenvolvedor → **Carregar sem compactação**
→ selecione a pasta `extension/dist`. Clique no ícone para abrir o side panel.

## Contrato da API

- `POST /upload` — `multipart/form-data`, campo `file`. Streaming direto pro disco.
  `201 → { token, url, filename, size, expiresAt }`. `413` acima do limite, `400` sem arquivo.
- `GET /d/:token` — download com `Content-Disposition`. `404` se inválido/expirado/coletado.
- `GET /health` — `{ ok, version, lanIp }`. Usado pela extensão pra detectar offline.

## Segurança (v1)

1. **Token aleatório de 16 bytes** (`crypto.randomBytes`). Nunca sequencial nem derivado do nome.
2. **TTL de 10 min** — varredura a cada 60s apaga registro e arquivo do disco.
3. **Bind explícito no IP da LAN** — `listen(8765, lanIp)`, nunca `0.0.0.0`.

Complementos: path traversal impossível (token → caminho gerado), nome sanitizado só no
`Content-Disposition`, CORS restrito a `chrome-extension://`, sem log de conteúdo.

## Roadmap (fora do v1, deliberadamente)

HTTPS · autostart do daemon · mDNS/descoberta automática · histórico persistente ·
autenticação · múltiplos dispositivos simultâneos · upload celular → PC.

Cada um transforma a semana em mês — a omissão é escolha, não desconhecimento.
