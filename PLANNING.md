# QRDrop — Plano de Desenvolvimento (v1)

> Compartilhamento de arquivos PC → celular pela LAN, sem nuvem.
> Extensão do Chrome + daemon local. QR code na tela, celular escaneia e baixa.

**Status:** planejamento
**Janela de execução:** 5 dias úteis (~5–10h/semana → estender para 2 semanas de calendário)
**Stack:** Node.js + TypeScript (daemon e extensão), sem framework pesado

---

## 1. Problema e solução

Mandar um arquivo do PC pro celular hoje passa por WhatsApp, e-mail pra si mesmo ou cabo.
Todos vazam o arquivo pra fora da rede ou exigem fricção.

**Fluxo alvo (3 segundos):**

1. Usuário arrasta o arquivo no side panel da extensão
2. Extensão faz `POST http://127.0.0.1:8765/upload`
3. Daemon grava em disco e devolve `{ token, url, expiresAt }`
4. Extensão renderiza o QR de `http://<ip-da-lan>:8765/d/<token>`
5. Celular escaneia, baixa, token morre em 10 min

Nada sai da LAN. Nenhuma conta, nenhum servidor remoto.

---

## 2. Arquitetura

```
┌───────────────────────┐        ┌──────────────────────┐
│  Extensão Chrome MV3  │        │   Daemon Node/TS     │
│                       │        │                      │
│  side panel (drop)    │──POST──▶  POST /upload        │
│                       │◀─JSON──│  (multipart stream)  │
│  render QR offline    │        │                      │
└───────────────────────┘        │  GET  /d/:token      │
                                 │  GET  /health        │
                                 └──────────┬───────────┘
                                            │ HTTP na LAN
                                     ┌──────▼───────┐
                                     │   Celular    │
                                     └──────────────┘
```

**Decisões fechadas:**

| Decisão | Escolha | Por quê |
|---|---|---|
| Linguagem | Node/TS nos dois lados | Uma linguagem só; binário único do Go não importa porque não vou distribuir |
| Transporte | HTTP puro | HTTPS na LAN exige CA própria ou cert self-signed que o celular rejeita |
| Persistência | Disco + índice em memória | Reinício do daemon invalida tokens — comportamento aceitável e até desejável |
| Descoberta | IP fixo no QR | mDNS é escopo de mês, não de semana |
| Porta | 8765 (fixa, configurável por env) | Previsível pro README |

**Estrutura de pastas:**

```
qrdrop/
├── daemon/
│   ├── src/
│   │   ├── server.ts        # bootstrap HTTP
│   │   ├── routes/upload.ts
│   │   ├── routes/download.ts
│   │   ├── store.ts         # tokens + TTL + GC
│   │   ├── network.ts       # detecção da interface de LAN
│   │   └── config.ts
│   └── package.json
├── extension/
│   ├── src/
│   │   ├── sidepanel/       # UI, drop target, fila
│   │   ├── lib/api.ts       # cliente do daemon
│   │   └── lib/qr.ts        # geração offline
│   ├── manifest.json
│   └── package.json
└── README.md
```

---

## 3. Contrato da API

### `POST /upload`
- Body: `multipart/form-data`, campo `file`
- Streaming direto pro disco (nunca buffer inteiro em memória)
- Limite: 2 GB (configurável)
- `201` → `{ "token": "a3f...", "url": "http://192.168.0.12:8765/d/a3f...", "filename": "x.pdf", "size": 12345, "expiresAt": "2026-08-18T14:30:00Z" }`
- `413` se exceder o limite, `400` se não houver arquivo

### `GET /d/:token`
- `200` com `Content-Disposition: attachment; filename="..."`, `Content-Length`, `Content-Type` por extensão
- `404` se token inválido, expirado ou já coletado pelo GC
- Sem listagem de diretório, sem index

### `GET /health`
- `200` → `{ "ok": true, "version": "1.0.0", "lanIp": "192.168.0.12" }`
- Usado pela extensão pra detectar "daemon offline"

---

## 4. Segurança do v1 (não negociável)

Três coisas baratas separam "ferramenta" de "servidor de arquivos aberto pra quem estiver no wifi".
São a primeira coisa que alguém experiente vai olhar no README.

1. **Token aleatório de 16 bytes** — `crypto.randomBytes(16).toString('hex')`. Nunca sequencial, nunca derivado do nome do arquivo.
2. **TTL de 10 minutos** — varredura a cada 60s apaga registro e arquivo do disco.
3. **Bind explícito na interface da LAN** — `server.listen(8765, lanIp)`. Nunca `0.0.0.0`.

Complementos de custo zero:
- Path traversal impossível: o token mapeia pra um caminho gerado, nunca pro nome enviado pelo usuário
- Nome original só aparece no `Content-Disposition`, sanitizado
- CORS restrito à origem `chrome-extension://<id>`
- Nada de log do conteúdo, só metadados

---

## 5. Cronograma

### Dias 1–2 — Daemon
- [ ] Scaffold TS + tsx watch + tsconfig strict
- [ ] `network.ts`: enumerar interfaces, **filtrar Docker/VPN/loopback/link-local** — essa é a parte que dá mais trabalho do que parece
- [ ] `store.ts`: Map de tokens, TTL, GC periódico, cleanup no SIGINT
- [ ] `POST /upload` com parse multipart em streaming (`busboy`)
- [ ] `GET /d/:token` com headers corretos
- [ ] `GET /health`
- [ ] Teste manual: `curl -F file=@x.pdf` → abrir a URL no celular

### Dias 3–4 — Extensão
- [ ] Scaffold MV3 + build (esbuild ou vite)
- [ ] `manifest.json`: `sidePanel`, `host_permissions` pra `http://127.0.0.1:8765/*`
- [ ] Side panel como drop target (dragover/drop + input file de fallback)
- [ ] `api.ts`: upload com `XMLHttpRequest` pra ter progresso, ou `fetch` + stream
- [ ] `qr.ts`: geração **offline**, lib bundlada (`qrcode`) — nunca API remota de QR
- [ ] Render: QR + nome do arquivo + tamanho + URL em texto (fallback pra digitar)

### Dia 5 — Arestas
- [ ] Contagem regressiva do TTL na tela, QR esmaece ao expirar
- [ ] Estado "daemon offline" com instrução clara de como subir
- [ ] Fila de múltiplos arquivos com status por item
- [ ] Barra de progresso do upload
- [ ] README com screenshot/GIF e a seção de segurança

---

## 6. Fora do escopo do v1 (deliberadamente)

HTTPS · autostart do daemon · mDNS/descoberta automática · histórico persistente ·
autenticação · suporte a múltiplos dispositivos simultâneos · upload celular → PC

Cada um transforma a semana em mês. Ficam listados como "Roadmap" no README —
mostra que a omissão foi escolha, não desconhecimento.

---

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Detecção de interface pega Docker/VPN | Heurística por prioridade + override via `QRDROP_BIND_IP` |
| Wifi com isolamento de cliente (AP isolation) | Detectar timeout no celular e explicar no README; fora do meu controle |
| MV3 bloqueando fetch pra `http://` local | Declarar `host_permissions` explicitamente; testar cedo, no dia 3 |
| Firewall do SO bloqueando a porta | Documentar a liberação; primeira execução costuma pedir permissão |
| Arquivo grande estourando memória | Streaming obrigatório dos dois lados; teste com arquivo de 1 GB |

---

## 8. Definição de pronto

- [ ] Arquivo de 500 MB vai do PC pro celular em uma tentativa
- [ ] Token expirado devolve 404, arquivo sumiu do disco
- [ ] Daemon derrubado → extensão mostra estado offline, não trava
- [ ] `netstat` confirma bind no IP da LAN, não em `0.0.0.0`
- [ ] README explica arquitetura, segurança e roadmap
- [ ] GIF de 10s do fluxo completo no topo do README
