import express, { Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env';
import webhook_routes from './webhook/controller';
import { hydrate_handoff_sessions } from './webhook/chatwoot_client';
import { recover_pending_queues } from './webhook/conversation_queue';
import { capture_raw_body, create_webhook_auth } from './security/webhook_auth';
import { perfil_agente } from './perfil/perfil_agente';

const app = express();

const cors_allowed_origins = env.CORS_ALLOWED_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

app.set('trust proxy', true);
app.use(cors({ origin: cors_allowed_origins }));
app.use(express.json({ verify: capture_raw_body }));

app.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({ status: 'ok', service: perfil_agente.identificador_servico });
});

app.use('/webhook', create_webhook_auth(env.CHATWOOT_WEBHOOK_SECRET_TOKEN), webhook_routes);

async function start_server(): Promise<void> {
  await hydrate_handoff_sessions();
  await recover_pending_queues();

  app.listen(env.PORT, () => {
    console.log(`Servidor rodando na porta ${env.PORT}`);
  });
}

void start_server();

export default app;
