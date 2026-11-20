import { HumanMessage, SystemMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { traceable } from 'langsmith/traceable';
import { llm } from '../config/llm';
import { prisma } from '../config/prisma';
import { agent_tools, knowledge_tool, handoff_tool } from './tools';
import { execute_chatwoot_handoff } from '../webhook/chatwoot_client';
import { validate_security_guardrails, criar_padroes_impersonacao_organizacao } from '../security/guardrails';
import { log_standard_event, log_error_event, log_guardrail_violation_event } from '../logging/logger';
import { canal_atendimento, conversation_context, run_with_conversation_context } from '../runtime/request_context';
import { perfil_agente } from '../perfil/perfil_agente';
import { selecionar_system_prompt, tag_mensagem_cliente } from '../perfil/prompts';

export type { conversation_context } from '../runtime/request_context';
export { generate_system_prompt, generate_site_system_prompt, selecionar_system_prompt } from '../perfil/prompts';

const tools_map: Record<string, (args: any) => Promise<any>> = {
  [knowledge_tool.name]: (args: any) => knowledge_tool.invoke(args),
  [handoff_tool.name]: (args: any) => handoff_tool.invoke(args),
};

const ferramentas_site = [knowledge_tool];
const llm_with_tools = llm.bindTools(agent_tools);
const llm_with_tools_site = llm.bindTools(ferramentas_site);
const llm_finalizacao = llm.bindTools(agent_tools, { tool_choice: 'none' });
const llm_finalizacao_site = llm.bindTools(ferramentas_site, { tool_choice: 'none' });

const padroes_impersonacao_organizacao = criar_padroes_impersonacao_organizacao(perfil_agente.organizacao.aliases);
const tags_rastreamento = [perfil_agente.identificador_servico, 'atendimento'];

export const max_chamadas_ferramenta_por_mensagem = 3;
export const max_iteracoes_agente = 5;
export const resposta_limite_etapas = perfil_agente.mensagens.limite_etapas;

export interface invocador_llm {
  invoke(messages: BaseMessage[]): Promise<any>;
}

export interface dependencias_loop_agente {
  llm_com_ferramentas: invocador_llm;
  llm_finalizacao: invocador_llm;
  executar_ferramenta: (nome: string, argumentos: any) => Promise<any>;
}

function extrair_conteudo_texto(response: any): string {
  return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
}

async function executar_ferramenta_registrada(nome: string, argumentos: any): Promise<any> {
  const executor = tools_map[nome];
  if (!executor) {
    return perfil_agente.mensagens.ferramenta_nao_encontrada(nome);
  }
  return executor(argumentos);
}

function montar_dependencias_por_canal(canal?: canal_atendimento): dependencias_loop_agente {
  return {
    llm_com_ferramentas: canal === 'site' ? llm_with_tools_site : llm_with_tools,
    llm_finalizacao: canal === 'site' ? llm_finalizacao_site : llm_finalizacao,
    executar_ferramenta: executar_ferramenta_registrada,
  };
}

function normalizar_para_comparacao(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const frases_transferencia_normalizadas = perfil_agente.frases_declaracao_transferencia.map(normalizar_para_comparacao);

function resposta_declara_transferencia(resposta: string): boolean {
  const resposta_normalizada = normalizar_para_comparacao(resposta);
  return frases_transferencia_normalizadas.some((frase) => resposta_normalizada.includes(frase));
}

export interface agent_loop_result {
  answer: string;
  handoff_executed: boolean;
}

export async function executar_loop_agente(
  dependencias: dependencias_loop_agente,
  conversation_messages: BaseMessage[],
  canal?: canal_atendimento
): Promise<agent_loop_result> {
  let handoff_executed = false;
  let total_chamadas_ferramenta = 0;

  for (let iteracao = 1; iteracao <= max_iteracoes_agente; iteracao++) {
    const deve_finalizar = total_chamadas_ferramenta >= max_chamadas_ferramenta_por_mensagem || iteracao === max_iteracoes_agente;
    const invocador = deve_finalizar ? dependencias.llm_finalizacao : dependencias.llm_com_ferramentas;

    const response = await invocador.invoke(conversation_messages);
    const tool_calls = response.tool_calls;

    if (!tool_calls || tool_calls.length === 0 || deve_finalizar) {
      const final_content = extrair_conteudo_texto(response).trim();
      return { answer: final_content.length > 0 ? final_content : resposta_limite_etapas, handoff_executed };
    }

    conversation_messages.push(response);

    for (const call of tool_calls) {
      total_chamadas_ferramenta++;
      const is_handoff_bloqueado = canal === 'site' && call.name === handoff_tool.name;
      let tool_output: string;

      if (call.name === handoff_tool.name && !is_handoff_bloqueado) {
        handoff_executed = true;
      }

      if (is_handoff_bloqueado) {
        tool_output = perfil_agente.mensagens.handoff_bloqueado_site;
      } else {
        try {
          const raw_result = await dependencias.executar_ferramenta(call.name, call.args);
          tool_output = typeof raw_result === 'string' ? raw_result : JSON.stringify(raw_result);
        } catch (exec_error) {
          tool_output = `Erro ao executar a ferramenta ${call.name}: ${String(exec_error)}`;
        }
      }

      conversation_messages.push(
        new ToolMessage({
          tool_call_id: call.id ?? '',
          content: tool_output,
          name: call.name,
        })
      );
    }
  }

  return { answer: resposta_limite_etapas, handoff_executed };
}

const execute_agent_loop = traceable(
  async (
    conversation_messages: BaseMessage[],
    context?: conversation_context
  ): Promise<agent_loop_result> => run_with_conversation_context(context || {}, () =>
    executar_loop_agente(montar_dependencias_por_canal(context?.canal), conversation_messages, context?.canal)
  ),
  {
    name: 'agent_execution_loop',
    run_type: 'chain',
    tags: tags_rastreamento,
  }
);

export const handle_user_message = traceable(
  async (identificador_remetente: string, text: string, context?: conversation_context): Promise<string> => {
    const start_time = Date.now();
    log_standard_event(identificador_remetente, 'request_received');

    let client = await prisma.client.findUnique({
      where: { identificador_externo: identificador_remetente },
    });

    if (!client) {
      client = await prisma.client.create({
        data: { identificador_externo: identificador_remetente },
      });
    }

    const guardrail_result = validate_security_guardrails(text, padroes_impersonacao_organizacao);

    if (!guardrail_result.is_valid) {
      const security_response = perfil_agente.mensagens.bloqueio_guardrail;

      log_guardrail_violation_event(identificador_remetente, guardrail_result.reason_code || 'guardrail_violation', 'blocked');
      log_standard_event(identificador_remetente, 'response_sent', { duration_ms: Date.now() - start_time, status: 'guardrail_blocked' });

      await prisma.message.create({
        data: {
          text,
          role: 'user',
          clientId: client.id,
        },
      });

      await prisma.message.create({
        data: {
          text: security_response,
          role: 'assistant',
          clientId: client.id,
        },
      });

      return security_response;
    }

    await prisma.message.create({
      data: {
        text: guardrail_result.sanitized_text,
        role: 'user',
        clientId: client.id,
      },
    });

    const raw_history = await prisma.message.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    const history = [...raw_history].reverse();

    const conversation_messages: BaseMessage[] = [new SystemMessage(selecionar_system_prompt(context?.canal))];

    for (const item of history) {
      if (item.role === 'user') {
        conversation_messages.push(new HumanMessage(`<${tag_mensagem_cliente}>${item.text}</${tag_mensagem_cliente}>`));
      } else if (item.role === 'assistant') {
        conversation_messages.push(new AIMessage(item.text));
      }
    }

    try {
      const loop_result = await execute_agent_loop(conversation_messages, context);
      const final_answer = loop_result.answer;

      if (
        context?.canal !== 'site' &&
        context?.account_id &&
        context?.conversation_id &&
        !loop_result.handoff_executed &&
        resposta_declara_transferencia(final_answer)
      ) {
        await execute_chatwoot_handoff({
          account_id: context.account_id,
          conversation_id: context.conversation_id,
          reason: perfil_agente.motivo_handoff_por_declaracao,
        });
      }

      await prisma.message.create({
        data: {
          text: final_answer,
          role: 'assistant',
          clientId: client.id,
        },
      });

      log_standard_event(identificador_remetente, 'response_sent', { duration_ms: Date.now() - start_time, status: 'success' });
      return final_answer;
    } catch (error) {
      log_error_event('AGENT_PROCESSING_ERROR', error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined, { identificador_remetente });
      log_standard_event(identificador_remetente, 'response_sent', { duration_ms: Date.now() - start_time, status: 'error' });
      return perfil_agente.mensagens.erro_processamento;
    }
  },
  {
    name: `atendimento_${perfil_agente.identificador_servico}`,
    run_type: 'chain',
    tags: tags_rastreamento,
    processInputs: (inputs: any) => ({
      identificador_remetente: inputs.args ? inputs.args[0] : inputs.identificador_remetente,
      user_message: inputs.args ? inputs.args[1] : inputs.text,
      context: inputs.args ? inputs.args[2] : inputs.context,
    }),
    processOutputs: (output: any) => ({
      response: typeof output === 'object' && output.outputs !== undefined ? output.outputs : output,
    }),
  }
);

export const handleUserMessage = handle_user_message;
