import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execute_chatwoot_handoff } from '../../webhook/chatwoot_client';
import { get_conversation_context, conversation_context } from '../../runtime/request_context';
import { perfil_agente } from '../../perfil/perfil_agente';
import { nome_ferramenta_handoff, formatar_criterios_triagem } from '../../perfil/prompts';

let fallback_handoff_context: conversation_context | null = null;

export function set_current_handoff_context(context: conversation_context | null): void {
  fallback_handoff_context = context;
}

export const handoff_tool = tool(
  async ({ motivo }: { motivo: string }) => {
    const active_context = get_conversation_context() || fallback_handoff_context;

    if (active_context?.account_id && active_context?.conversation_id) {
      await execute_chatwoot_handoff({
        account_id: active_context.account_id,
        conversation_id: active_context.conversation_id,
        reason: motivo,
      });
    }

    return perfil_agente.mensagens.handoff_concluido(motivo);
  },
  {
    name: nome_ferramenta_handoff,
    description: `${perfil_agente.ferramentas.handoff}\nCriterios da triagem:\n${formatar_criterios_triagem()}`,
    schema: z.object({
      motivo: z
        .string()
        .describe(perfil_agente.ferramentas.handoff_parametro_motivo),
    }),
  }
);
