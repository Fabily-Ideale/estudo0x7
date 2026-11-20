import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import {
  executar_loop_agente,
  dependencias_loop_agente,
  invocador_llm,
  max_chamadas_ferramenta_por_mensagem,
  resposta_limite_etapas,
} from '../rag/agent';
import { calcular_hash_conteudo, precisa_reindexar } from '../rag/vectorStore';

interface test_case_result {
  name: string;
  passed: boolean;
  details?: string;
}

const test_results: test_case_result[] = [];

function record_test(name: string, condition: boolean, details?: string): void {
  test_results.push({ name, passed: condition, details: condition ? undefined : details });
}

function criar_resposta_ferramenta(indice: number, nome = 'consultar_base_conhecimento'): any {
  return {
    content: '',
    tool_calls: [{ id: `chamada_${indice}`, name: nome, args: { pergunta_ou_termo: `termo_${indice}` } }],
  };
}

function criar_llm_sempre_ferramenta(contador: { chamadas: number }): invocador_llm {
  return {
    async invoke(): Promise<any> {
      contador.chamadas++;
      return criar_resposta_ferramenta(contador.chamadas);
    },
  };
}

function criar_llm_resposta_fixa(contador: { chamadas: number }, conteudo: string): invocador_llm {
  return {
    async invoke(): Promise<any> {
      contador.chamadas++;
      return { content: conteudo, tool_calls: [] };
    },
  };
}

function criar_mensagens(): BaseMessage[] {
  return [new HumanMessage('<mensagem_cliente>Quero contratar</mensagem_cliente>')];
}

async function test_limite_forca_resposta_final(): Promise<void> {
  const contador_ferramentas = { chamadas: 0 };
  const contador_finalizacao = { chamadas: 0 };
  const ferramentas_executadas: string[] = [];

  const dependencias: dependencias_loop_agente = {
    llm_com_ferramentas: criar_llm_sempre_ferramenta(contador_ferramentas),
    llm_finalizacao: criar_llm_resposta_fixa(contador_finalizacao, 'Resposta final consolidada'),
    executar_ferramenta: async (nome: string) => {
      ferramentas_executadas.push(nome);
      return 'Trecho sem o link procurado';
    },
  };

  const resultado = await executar_loop_agente(dependencias, criar_mensagens(), 'site');

  const passed =
    resultado.answer === 'Resposta final consolidada' &&
    ferramentas_executadas.length === max_chamadas_ferramenta_por_mensagem &&
    contador_ferramentas.chamadas === max_chamadas_ferramenta_por_mensagem &&
    contador_finalizacao.chamadas === 1;

  record_test(
    'Loop do agente: limite de chamadas de ferramenta forca resposta final sem ferramentas',
    passed,
    `Resposta: ${resultado.answer}, Ferramentas: ${ferramentas_executadas.length}, LLM com ferramentas: ${contador_ferramentas.chamadas}, Finalizacao: ${contador_finalizacao.chamadas}`
  );
}

async function test_resposta_direta_sem_finalizacao(): Promise<void> {
  const contador_principal = { chamadas: 0 };
  const contador_finalizacao = { chamadas: 0 };

  const dependencias: dependencias_loop_agente = {
    llm_com_ferramentas: criar_llm_resposta_fixa(contador_principal, 'Ola, como posso ajudar?'),
    llm_finalizacao: criar_llm_resposta_fixa(contador_finalizacao, 'nao deveria ser usada'),
    executar_ferramenta: async () => 'nao deveria ser executada',
  };

  const resultado = await executar_loop_agente(dependencias, criar_mensagens(), 'mensageria');

  record_test(
    'Loop do agente: resposta direta encerra sem acionar a finalizacao',
    resultado.answer === 'Ola, como posso ajudar?' && contador_principal.chamadas === 1 && contador_finalizacao.chamadas === 0,
    `Resposta: ${resultado.answer}, Principal: ${contador_principal.chamadas}, Finalizacao: ${contador_finalizacao.chamadas}`
  );
}

async function test_finalizacao_vazia_retorna_fallback(): Promise<void> {
  const dependencias: dependencias_loop_agente = {
    llm_com_ferramentas: criar_llm_sempre_ferramenta({ chamadas: 0 }),
    llm_finalizacao: {
      async invoke(): Promise<any> {
        return criar_resposta_ferramenta(99);
      },
    },
    executar_ferramenta: async () => 'Trecho qualquer',
  };

  const resultado = await executar_loop_agente(dependencias, criar_mensagens(), 'site');

  record_test(
    'Loop do agente: finalizacao sem texto retorna mensagem padrao de limite',
    resultado.answer === resposta_limite_etapas,
    `Resposta: ${resultado.answer}`
  );
}

async function test_handoff_bloqueado_no_site(): Promise<void> {
  let chamada_atual = 0;
  const ferramentas_executadas: string[] = [];

  const dependencias: dependencias_loop_agente = {
    llm_com_ferramentas: {
      async invoke(): Promise<any> {
        chamada_atual++;
        return chamada_atual === 1
          ? criar_resposta_ferramenta(1, 'transferir_atendimento_humano')
          : { content: 'Prossiga pelo canal oficial', tool_calls: [] };
      },
    },
    llm_finalizacao: criar_llm_resposta_fixa({ chamadas: 0 }, 'nao deveria ser usada'),
    executar_ferramenta: async (nome: string) => {
      ferramentas_executadas.push(nome);
      return 'executada';
    },
  };

  const resultado = await executar_loop_agente(dependencias, criar_mensagens(), 'site');

  record_test(
    'Loop do agente: transbordo humano bloqueado no canal do site',
    resultado.answer === 'Prossiga pelo canal oficial' && !resultado.handoff_executed && ferramentas_executadas.length === 0,
    `Resposta: ${resultado.answer}, Handoff: ${resultado.handoff_executed}, Executadas: ${ferramentas_executadas.join(',')}`
  );
}

function test_hash_ingestao(): void {
  const hash_original = calcular_hash_conteudo('## Presenca Digital\nRedes sociais');
  const hash_repetido = calcular_hash_conteudo('## Presenca Digital\nRedes sociais');
  const hash_alterado = calcular_hash_conteudo('## Presenca Digital\nRedes sociais\n- [Contato](https://dominio/caminho)');

  const deterministico = hash_original === hash_repetido && /^[0-9a-f]{64}$/.test(hash_original);
  const detecta_mudanca = hash_original !== hash_alterado;
  const ignora_inalterado = !precisa_reindexar(hash_original, hash_repetido, false);
  const reindexa_alterado = precisa_reindexar(hash_alterado, hash_original, false);
  const reindexa_sem_hash = precisa_reindexar(hash_original, null, false);
  const reindexa_forcado = precisa_reindexar(hash_original, hash_original, true);

  record_test(
    'Ingestao: hash de conteudo detecta alteracoes e dispara reindexacao',
    deterministico && detecta_mudanca && ignora_inalterado && reindexa_alterado && reindexa_sem_hash && reindexa_forcado,
    `Deterministico: ${deterministico}, Mudanca: ${detecta_mudanca}, Inalterado: ${ignora_inalterado}, Alterado: ${reindexa_alterado}, Sem hash: ${reindexa_sem_hash}, Forcado: ${reindexa_forcado}`
  );
}

async function main(): Promise<void> {
  await test_limite_forca_resposta_final();
  await test_resposta_direta_sem_finalizacao();
  await test_finalizacao_vazia_retorna_fallback();
  await test_handoff_bloqueado_no_site();
  test_hash_ingestao();

  let failed_count = 0;
  for (const item of test_results) {
    if (!item.passed) {
      failed_count++;
      console.error(`[FALHA] ${item.name}: ${item.details}`);
    } else {
      console.log(`[PASSOU] ${item.name}`);
    }
  }

  process.exit(failed_count > 0 ? 1 : 0);
}

main();
