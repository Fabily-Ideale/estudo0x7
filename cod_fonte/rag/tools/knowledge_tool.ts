import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { queryDocuments } from '../vectorStore';
import { perfil_agente } from '../../perfil/perfil_agente';
import { nome_ferramenta_base_conhecimento } from '../../perfil/prompts';

export const knowledge_tool = tool(
  async ({ pergunta_ou_termo, limite }) => {
    const results_limit = limite ?? 4;
    const documents = await queryDocuments(pergunta_ou_termo, results_limit);

    if (documents.length === 0) {
      return perfil_agente.ferramentas.base_conhecimento_sem_resultado;
    }

    return documents
      .map(doc => {
        const source_name = doc.metadata?.filename_source || doc.source || 'Documento';
        return `[Fonte: ${source_name}]\n${doc.content}`;
      })
      .join('\n\n---\n\n');
  },
  {
    name: nome_ferramenta_base_conhecimento,
    description: perfil_agente.ferramentas.base_conhecimento,
    schema: z.object({
      pergunta_ou_termo: z
        .string()
        .describe(perfil_agente.ferramentas.base_conhecimento_parametro_busca),
      limite: z
        .number()
        .optional()
        .describe(perfil_agente.ferramentas.base_conhecimento_parametro_limite),
    }),
  }
);
