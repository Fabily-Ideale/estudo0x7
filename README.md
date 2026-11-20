boilerplate_agente
===

Boilerplate de agente de IA com RAG (Retrieval-Augmented Generation), em TypeScript/Node.js. O agente é modular: não depende de nenhum sistema específico e pode ser usado sozinho ou como módulo de outros agentes e sistemas. A integração de referência usa o [Chatwoot](https://www.chatwoot.com/) como gateway de mensagens (WhatsApp, Telegram, e-mail, widget de site etc.).

Licença: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). Domínio público, sem restrições de uso, cópia ou modificação.

Recursos
---
- **RAG com PostgreSQL + pgvector:**
  - converte documentos `.md`, `.pdf` e `.csv` para Markdown;
  - divide os documentos em seções `##`;
  - reindexa só quando o hash SHA-256 do conteúdo muda.
- **Loop de ferramentas com limites:** no máximo 3 chamadas de ferramenta e 5 iterações por mensagem. A resposta final é forçada sem ferramentas (`tool_choice: none`).
- **Prompts por canal:**
  - `mensageria`: triagem com transbordo para atendimento humano;
  - `site`: só tira dúvidas, sem transbordo.
- **Handoff para humano no Chatwoot:** pausa o bot, abre a conversa, atribui um agente ou time e aplica um rótulo. O estado fica persistido e é recuperado após um restart.
- **Fila por conversa:**
  - debounce para juntar mensagens próximas;
  - limite de buffer;
  - rate limit por remetente;
  - recuperação das mensagens pendentes no boot.
- **Guardrails determinísticos:**
  - injeção de delimitadores e jailbreak;
  - personificação de equipe, incluindo aliases configuráveis da organização;
  - vazamento de prompt;
  - flood de caracteres e limite de tamanho.
- **Webhook autenticado por HMAC-SHA256** com tolerância de timestamp, mais logs JSONL rotativos (`standard`, `error`, `guardrails`) e tracing opcional no LangSmith.
- **LLM via qualquer endpoint compatível com a API da OpenAI** (OpenAI, NVIDIA NIM, vLLM, Ollama, OpenRouter etc.).

Estrutura
---
```
cod_fonte/
  config/        env (validacao zod), llm, prisma
  perfil/        perfil_agente.ts (identidade, mensagens, criterios) e prompts.ts
  rag/           agent.ts (orquestracao), vectorStore.ts, doc_conversor.ts, tools/
  rag/doc_bruto/     documentos de origem (.md, .pdf, .csv) - ignorados pelo git
  rag/doc_markdown/  documentos convertidos - gerados automaticamente
  webhook/       controller (Chatwoot), conversation_queue, chatwoot_client
  security/      guardrails, webhook_auth (HMAC), auth, rate_limiter
  persistence/   session_store, rate_limit_store, keyed_serial_executor
  runtime/       request_context (AsyncLocalStorage com conta, conversa e canal)
  logging/       logger rotativo em JSONL
  database/      seed e reset
  test/          suites de teste e runner consolidado
prisma/          schema.prisma
docker/          scripts de inicializacao do PostgreSQL
```

Como adaptar a um novo contexto
---
Toda a customização de domínio fica em `cod_fonte/perfil/`:

1. **`perfil_agente.ts`:**
   - `organizacao`: `nome`, `descricao_atuacao` e `aliases`. Os aliases alimentam o guardrail de personificação e aceitam acentos, hífen, underscore e alfabetos não latinos.
   - `fuso_horario` e `locale`: usados no contexto temporal do prompt.
   - `criterios_triagem`: os critérios que o agente precisa identificar antes de transferir para um humano. Aparecem no prompt e na descrição da ferramenta de handoff.
   - `mensagens`: todos os textos enviados ao usuário (bloqueio, erro, mídia não suportada, limite de mensagens etc.).
   - `ferramentas`: descrições das ferramentas apresentadas ao LLM.
   - `rotulo_handoff_chatwoot`, `frases_declaracao_transferencia` e `identificador_servico` (usado no `/health` e nas tags do LangSmith).
2. **`prompts.ts`:** os system prompts dos canais `mensageria` e `site`. Ajuste o tom, as regras e o fluxo de atendimento.
3. **Base de conhecimento:** coloque os documentos institucionais em `cod_fonte/rag/doc_bruto/` e rode o seed (veja abaixo).
4. **Novas ferramentas:** crie em `cod_fonte/rag/tools/`, registre em `tools/index.ts` e no `tools_map` de `rag/agent.ts`. Se a ferramenta também for valer no canal do site, inclua em `ferramentas_site`.

O canal é decidido em `webhook/controller.ts` (`resolver_canal_atendimento`). Inboxes `Channel::WebWidget` viram `site`; qualquer outra vira `mensageria`.

Variáveis de ambiente
---
Copie o exemplo e preencha:
```bash
cp .env_exemplo .env
```

**Aplicação**

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `PORT` | sim | - | Porta HTTP da aplicação |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | sim | - | Credenciais e base do PostgreSQL |
| `POSTGRES_HOST` / `POSTGRES_PORT` | não | `localhost` / `5432` | Endereço do PostgreSQL |
| `DATABASE_URL` | não | montada a partir de `POSTGRES_*` | URL completa de conexão |
| `LLM_API_KEY` | sim | - | Chave do provedor de LLM |
| `LLM_BASE_URL` | não | endpoint da OpenAI | URL de um provedor compatível com a OpenAI |
| `LLM_MODELO` | sim | - | Modelo de chat |
| `LLM_MODELO_EMBEDDING` | sim | - | Modelo de embeddings |
| `LLM_TEMPERATURA` / `LLM_TIMEOUT_MS` | não | `0.2` / `60000` | Parâmetros de inferência |
| `CHATWOOT_BASE_URL` | não | `http://chatwoot:3000` | URL interna do Chatwoot |
| `CHATWOOT_API_TOKEN` | não | - | Token de API do Chatwoot (sem ele, nenhuma chamada é feita) |
| `CHATWOOT_ASSIGNEE_ID` / `CHATWOOT_TEAM_ID` | não | - | Agente ou time que recebe o handoff |
| `CHATWOOT_WEBHOOK_SECRET_TOKEN` | sim | - | Segredo HMAC do webhook (mínimo de 16 caracteres) |
| `CORS_ALLOWED_ORIGINS` | sim | - | Origens permitidas, separadas por vírgula |
| `LANGSMITH_TRACING` / `LANGSMITH_API_KEY` / `LANGSMITH_PROJECT` / `LANGSMITH_ENDPOINT` | não | `false` / - / `default` / API pública | Tracing |
| `RATE_LIMIT_REMETENTE_MAX_REQUESTS` / `RATE_LIMIT_REMETENTE_WINDOW_MS` | não | `10` / `60000` | Rate limit por remetente na fila |
| `QUEUE_DEBOUNCE_MS` | não | `1500` | Janela de agrupamento de mensagens |
| `LOG_DIR` / `LOG_MAX_LINES` / `LOG_MAX_FILES` | não | `./logs` / `10000` / `1` | Rotação de logs |

**Infraestrutura (docker-compose)**

| Variável | Descrição |
|---|---|
| `SECRET_KEY_BASE` | Chave do Rails para o Chatwoot (`openssl rand -hex 64`) |
| `FRONTEND_URL` | URL pública do Chatwoot |
| `CHATWOOT_LOCALE` | Idioma padrão do Chatwoot (padrão `pt_BR`) |
| `CLOUDFLARE_TUNNEL_TOKEN` | Token do Cloudflare Tunnel, que faz a exposição externa sem publicar portas |
| `RAILS_MAX_THREADS`, `SIDEKIQ_CONCURRENCY`, `LOG_LEVEL` | Ajustes do Chatwoot |
| `*_MEM`, `POSTGRES_SHARED_BUFFERS`, `POSTGRES_EFFECTIVE_CACHE_SIZE` | Limites de memória e tuning |

Como executar
---

### 1. Subir os containers
```bash
docker compose up -d --build
```
Serviços:
- `db`: `pgvector/pgvector:pg17`, contêiner `rag_postgres_db`;
- `redis`: usado pelo Chatwoot;
- `chatwoot_web` e `chatwoot_worker`;
- `app`: contêiner `rag_agent_app`;
- `cloudflared`.

O `app` espera o healthcheck do banco e sincroniza o schema com `prisma db push` na entrada. A rede `agente_rede_compartilhada` permite que outros stacks Docker alcancem o agente (`agente.local`) e o Chatwoot.

### 2. Configurar o webhook no Chatwoot
1. Em **Settings > Integrations > Webhooks**, cadastre `http://agente.local:3001/webhook/chatwoot` com o evento `message_created`.
2. Copie o segredo gerado para `CHATWOOT_WEBHOOK_SECRET_TOKEN`.
3. A assinatura é validada pelos headers `x-chatwoot-signature` (`sha256=HMAC(segredo, "<timestamp>.<corpo>")`) e `x-chatwoot-timestamp`, com tolerância de 300 s.
4. Gere um token de acesso (Profile > Access Token) e defina em `CHATWOOT_API_TOKEN`.

### 3. Povoar a base e gerar embeddings
Com os documentos em `cod_fonte/rag/doc_bruto/`:
```bash
docker compose exec app node cod_result/database/seed.js
```

### 4. Acompanhar os logs
```bash
docker compose logs -f app
```
Os logs persistentes ficam em `./logs/standard.log`, `./logs/error.log` e `./logs/guardrails.log`.

### 5. Resetar os dados
```bash
docker compose down -v
```

Desenvolvimento local
---
```bash
npm ci
npx prisma generate
npm run dev
```

Testes
---
```bash
npm test
```
O runner (`cod_fonte/test/test_runner.ts`) roda todas as suítes de forma isolada. Para rodar uma suíte só, use `npm run test:<nome>` (veja `package.json`).

Dependências por suíte:
- `test_agent_prompt`, `test_guardrails`, `test_auth`, `test_rate_limiter` e `test_webhook_auth` não precisam de `.env`.
- As demais carregam `config/env.ts` e precisam de um `.env` válido.
- `test_persistence`, `test_conversation_queue` e `test_handoff` consultam o banco e exigem PostgreSQL acessível. `test_webhook` e `test_loop_agente` carregam `config/prisma.ts`, mas não fazem consultas.

Pendências conhecidas
---
- `execute_chatwoot_handoff` chama `pause_conversation_for_human` e o handler padrão chama de novo (é redundante, mas idempotente).
- A recuperação de filas pendentes no boot não guarda o canal de origem: mensagens recuperadas são tratadas como `mensageria`.
- O pacote `pg` é usado diretamente (`config/prisma.ts`), mas só chega como dependência transitiva de `@prisma/adapter-pg`.
- A imagem `cloudflare/cloudflared:latest` não tem versão fixada.
- O contêiner `app` roda como `root`.
- A coluna `embedding` não tem dimensão fixada nem índice HNSW/IVFFlat.
- `security/rate_limiter.ts` tem utilitários prontos (`create_ip_rate_limiter`, `create_phone_rate_limiter`) que não estão montados em nenhuma rota. Se você usar `extract_client_ip`, ele confia em `X-Forwarded-For` sem restringir quais proxies são confiáveis.
- Renomear o campo de `Client` num banco que já existe exige `prisma db push --accept-data-loss`.
- Com o driver adapter (`@prisma/adapter-pg`), `prisma.$connect()` não abre conexão de verdade: `config/prisma.ts` registra "Conectado ao banco de dados" mesmo com o PostgreSQL fora do ar, e a falha só aparece na primeira consulta.
