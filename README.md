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

### Geração da chave da extensão

Na primeira execução, o `./install.sh` gera um par de chaves em
`extension/native-host/qrdrop-key.pem` (esse arquivo não é versionado). A partir
dele o script deriva a `key` pública do `manifest.json` e o ID da extensão, e
registra esse ID no `allowed_origins` do host nativo. Assim o native messaging
funciona sem editar IDs manualmente, e cada usuário usa a própria chave.

O ID impresso ao final da instalação é o mesmo que aparece em `chrome://extensions`.
Se você apagar o `qrdrop-key.pem`, o ID muda na próxima instalação. Basta rodar o
`./install.sh` de novo para regenerar a chave e reregistrar o host.

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

## Segurança (v1)

1. Token aleatório de 16 bytes gerado com `crypto.randomBytes`, nunca sequencial nem
   derivado do nome do arquivo.
2. TTL de 10 minutos. Uma varredura a cada 60 segundos apaga o registro e o arquivo
   do disco.
3. Bind explícito no IP da LAN via `listen(8765, lanIp)`, nunca em `0.0.0.0`.

Além disso: o caminho do arquivo é derivado do token, o que evita path traversal; o
nome do arquivo é sanitizado apenas no `Content-Disposition`; o CORS aceita origens
`chrome-extension://` (opcionalmente fixadas num ID via `QRDROP_EXTENSION_ID`); e não
há log de conteúdo.

## Roadmap

Fora do escopo da v1: HTTPS, autostart no login, descoberta automática por mDNS,
histórico persistente, autenticação, múltiplos dispositivos simultâneos e upload do
celular para o PC.
