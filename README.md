# QRDrop

Compartilhamento de arquivos do PC para o celular pela rede local, sem nuvem.
É composto por uma extensão do Chrome e um daemon local. A extensão mostra um QR
code na tela, o celular escaneia e faz o download.

## Como funciona

1. Você arrasta um arquivo no side panel da extensão.
2. O daemon grava o arquivo em disco e devolve um token temporário.
3. A extensão renderiza um QR code apontando para `http://<ip-da-lan>:8765/d/<token>`.
4. O celular escaneia o QR e baixa o arquivo pela rede local.

Nenhum dado sai da LAN. Não há conta nem servidor remoto.

## Arquitetura

Extensão Chrome (MV3):

* Side panel recebe o arquivo e faz `POST /upload`.
* Renderiza o QR code offline a partir da resposta.

Daemon Node/TypeScript:

* `POST /upload` recebe o arquivo via multipart streaming.
* `GET /d/:token` serve o download.
* `GET /health` informa status e IP da LAN.

O celular acessa o daemon diretamente pela rede local via HTTP.

## Como rodar

### Instalação rápida

```bash
cd extension
./install.sh
```

O script compila o daemon e a extensão e registra o native host. Depois, carregue
a pasta `extension/dist` em `chrome://extensions` (ative o modo desenvolvedor e use
"Carregar sem compactação"). A partir daí, clicar no ícone da extensão inicia o
daemon sob demanda via [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging),
sem precisar abrir o terminal. Para remover o host registrado, rode
`./install.sh --uninstall`.

O passo de instalação existe porque o sandbox do Chrome (MV3) não permite que uma
extensão execute processos locais. O native host é o mecanismo oficial: um launcher
que a extensão aciona e que inicia o daemon.

O `install.sh` é uma vez só por máquina. Ele não precisa rodar de novo a cada
sessão: o manifest do host nativo fica registrado no perfil do navegador e a
extensão carregada continua carregada entre reinícios do Chrome.

### Geração da chave da extensão

Na primeira execução, `extension/scripts/ext-key.mjs` gera um par de chaves em
`extension/native-host/qrdrop-key.pem` (esse arquivo não é versionado). A partir
dele deriva a `key` pública do `manifest.json` e o ID da extensão, e o
`install.sh` registra esse ID no `allowed_origins` do host nativo. Assim o native
messaging funciona sem editar IDs manualmente, e cada usuário usa a própria chave.

Esse mesmo script roda em **todo build** (`npm run build` e `npm run dev`), não só
no `install.sh`. É isso que mantém o ID estável: sem a `key` no
`dist/manifest.json`, o Chrome sorteia um ID novo a cada carga, o
`allowed_origins` do host deixa de bater e é preciso recarregar a extensão do
zero. Com a chave injetada no build, você recompila à vontade e o Chrome continua
enxergando a mesma extensão no mesmo caminho.

O ID impresso ao final da instalação é o mesmo que aparece em `chrome://extensions`.
Se você apagar o `qrdrop-key.pem`, o ID muda na próxima instalação. Basta rodar o
`./install.sh` de novo para regenerar a chave e reregistrar o host.

### Ciclo de desenvolvimento

Depois de carregar a pasta `extension/dist` uma vez, nada precisa ser reenviado ao
`chrome://extensions` — o Chrome lê os arquivos direto do disco:

* Mudou o side panel (`index.ts`, `index.html`, `styles.css`): rode o build e
  reabra o painel.
* Mudou o `manifest.json` ou o service worker: rode o build e clique no botão de
  recarregar do card da extensão em `chrome://extensions`.
* Mudou o daemon: `cd daemon && npm run build` (o host nativo lança
  `daemon/dist/server.js`).

`cd extension && npm run dev` deixa o esbuild em watch, então na maioria dos casos
sobra só reabrir o painel.

### Modo manual (desenvolvimento)

Sem o native host, você inicia o daemon no terminal e carrega a extensão.

Daemon:

```bash
cd daemon
npm install
npm run dev
```

`npm run dev` usa `tsx watch`, escuta no IP da LAN na porta 8765 e faz rebuild
automático. O host nativo lança `dist/server.js`, então rode `npm run build` antes
de testar o fluxo automático, ou `npm run start` para servir direto da build.

Variáveis de ambiente (todas opcionais):

| Variável | Padrão | Descrição |
|---|---|---|
| `QRDROP_PORT` | `8765` | Porta do daemon |
| `QRDROP_BIND_IP` | automático | Força o IP da LAN e pula a heurística |
| `QRDROP_TTL_MS` | `600000` | TTL dos tokens (10 minutos) |
| `QRDROP_MAX_BYTES` | `2147483648` | Limite de upload (2 GB) |
| `QRDROP_STORAGE_DIR` | tmp do sistema | Onde os arquivos são gravados |
| `QRDROP_EXTENSION_ID` | qualquer | Fixa o CORS num ID de extensão específico |

Extensão:

```bash
cd extension
npm install
npm run build
```

Em `chrome://extensions`, ative o modo desenvolvedor, use "Carregar sem compactação"
e selecione a pasta `extension/dist`. Clique no ícone para abrir o side panel. No
modo manual o daemon já está no ar, então a extensão apenas se conecta a ele e o
native host não é acionado.

## Contrato da API

* `POST /upload`: `multipart/form-data` com o campo `file`, gravado direto em disco.
  Responde `201` com `{ token, url, filename, size, expiresAt }`. Retorna `413`
  acima do limite e `400` sem arquivo.
* `GET /d/:token`: download com `Content-Disposition`. Retorna `404` se o token for
  inválido, expirado ou já coletado.
* `GET /health`: retorna `{ ok, version, lanIp }`. A extensão usa para detectar
  quando o daemon está offline.
