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

### Instalação rápida (recomendada) — sem terminal depois

```bash
cd extension
./install.sh         # compila daemon+extensão e registra o native host
```

Depois carregue `extension/dist` em `chrome://extensions` (modo desenvolvedor →
**Carregar sem compactação**). A partir daí, **clicar no ícone do QRDrop sobe o
daemon sozinho** — via [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging),
sem abrir terminal. `./install.sh --uninstall` remove o host registrado.

> Por que ainda existe um passo de install: o sandbox do Chrome (MV3) não deixa
> uma extensão executar processos locais. O native host é o mecanismo oficial —
> um launcher que a extensão aciona e que sobe o daemon destacado sob demanda.

> **ID fixo da extensão — gerado por você, localmente.** Na primeira execução o
> `./install.sh` gera um par de chaves seu em `extension/native-host/qrdrop-key.pem`
> (nunca versionado), deriva a `key` pública do `manifest.json` e o ID da extensão,
> e registra esse ID no `allowed_origins` do host nativo. Assim o native messaging
> funciona de primeira, sem editar IDs a cada carregamento — e sem depender de
> nenhuma chave de outra pessoa. O ID impresso ao final é o que aparece em
> `chrome://extensions`. Guarde o `qrdrop-key.pem`: apagá-lo muda o ID na próxima
> instalação (basta rodar o `./install.sh` de novo para reregistrar o host).

### Modo manual (dev)

Sem o native host: você mesmo sobe o daemon no terminal e carrega a extensão.

#### 1. Daemon

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
| `QRDROP_EXTENSION_ID` | qualquer | Fixa o CORS num ID de extensão específico |

> `npm run dev` roda do fonte via `tsx watch` (rebuild automático). O host
> nativo, porém, lança `dist/server.js` — então rode `npm run build` antes de
> testar o fluxo automático, ou `npm run start` para servir direto da build.

#### 2. Extensão

```bash
cd extension
npm install
npm run build        # gera dist/  (npm run dev para rebuild em watch)
```

Em `chrome://extensions` → ative o modo desenvolvedor → **Carregar sem compactação**
→ selecione a pasta `extension/dist`. Clique no ícone para abrir o side panel.

No modo manual o daemon já está no ar, então a extensão apenas se conecta a ele —
o native host não é acionado (e o botão de "subir daemon" vira no-op).

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
`Content-Disposition`, CORS restrito a origens `chrome-extension://` (opcionalmente
fixado num ID via `QRDROP_EXTENSION_ID`), sem log de conteúdo.

## Roadmap (fora do v1, deliberadamente)

HTTPS · autostart no login (hoje o daemon sobe ao clicar na extensão) ·
mDNS/descoberta automática · histórico persistente ·
autenticação · múltiplos dispositivos simultâneos · upload celular → PC.

Cada um transforma a semana em mês — a omissão é escolha, não desconhecimento.
