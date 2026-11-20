import {
  generate_system_prompt,
  generate_site_system_prompt,
  selecionar_system_prompt,
  nome_ferramenta_base_conhecimento,
  nome_ferramenta_handoff,
  tag_mensagem_cliente,
} from '../perfil/prompts';
import { perfil_agente } from '../perfil/perfil_agente';

interface test_case_result {
  name: string;
  passed: boolean;
  details?: string;
}

const test_results: test_case_result[] = [];
const data_fixa = new Date('2026-10-05T15:30:00.000Z');

function record_test(name: string, condition: boolean, details?: string): void {
  test_results.push({
    name,
    passed: condition,
    details: condition ? undefined : details,
  });
}

function test_dynamic_timestamp_generation(): void {
  const prompts = [generate_system_prompt(data_fixa), generate_site_system_prompt(data_fixa)];

  const todos_validos = prompts.every((prompt) =>
    prompt.includes('2026-10-05T15:30:00.000Z') &&
    prompt.includes(perfil_agente.fuso_horario) &&
    prompt.includes('CONTEXTO TEMPORAL:')
  );

  record_test(
    'Injecao dinamica de timestamp e fuso horario do perfil nos prompts',
    todos_validos,
    'Algum prompt nao contem o ISO fixo, o fuso do perfil ou o cabecalho de contexto temporal.'
  );
}

function test_identidade_organizacao(): void {
  const prompts = [generate_system_prompt(data_fixa), generate_site_system_prompt(data_fixa)];
  const { nome, descricao_atuacao } = perfil_agente.organizacao;

  record_test(
    'Prompts utilizam a identidade da organizacao definida no perfil',
    prompts.every((prompt) => prompt.includes(nome) && prompt.includes(descricao_atuacao)),
    `Nome ou descricao de atuacao ausente em algum prompt: ${nome}`
  );
}

function test_obrigatoriedade_base_conhecimento(): void {
  const prompts = [generate_system_prompt(data_fixa), generate_site_system_prompt(data_fixa)];

  record_test(
    'Obrigatoriedade de consulta a base de conhecimento para dados institucionais',
    prompts.every((prompt) =>
      prompt.includes(nome_ferramenta_base_conhecimento) &&
      prompt.includes('Nao faca deducoes ou suposicoes sobre dados institucionais')
    ),
    'Diretriz da ferramenta de conhecimento ausente em algum prompt.'
  );
}

function test_isolamento_mensagem_cliente(): void {
  const prompts = [generate_system_prompt(data_fixa), generate_site_system_prompt(data_fixa)];

  record_test(
    'Prompts declaram a tag de isolamento das mensagens do cliente',
    prompts.every((prompt) => prompt.includes(`<${tag_mensagem_cliente}>`)),
    'Tag de isolamento ausente em algum prompt.'
  );
}

function test_prompt_mensageria_triagem_e_handoff(): void {
  const prompt = generate_system_prompt(data_fixa);

  const contem_criterios = perfil_agente.criterios_triagem.every((criterio) => prompt.includes(criterio));
  const contem_handoff = prompt.includes(nome_ferramenta_handoff);
  const contem_fluxo = prompt.includes('FLUXO DE TRIAGEM E TRANSBORDO HUMANO');

  record_test(
    'Prompt de mensageria contem criterios de triagem do perfil e transbordo humano',
    contem_criterios && contem_handoff && contem_fluxo,
    `Criterios: ${contem_criterios}, Handoff: ${contem_handoff}, Fluxo: ${contem_fluxo}`
  );
}

function test_site_prompt_somente_duvidas(): void {
  const prompt = generate_site_system_prompt(data_fixa);

  const identifica_site = prompt.includes('no chat do site oficial');
  const restringe_a_duvidas = prompt.includes('exclusivamente tirar duvidas');
  const nega_fechamento = prompt.includes('nao realiza atendimento, orcamento formal, agendamento, venda ou fechamento de servicos');
  const sem_tool_handoff = !prompt.includes(nome_ferramenta_handoff);
  const sem_triagem = !prompt.includes('FLUXO DE TRIAGEM E TRANSBORDO HUMANO');

  record_test(
    'Prompt do site restringe o agente a duvidas e nao possui transbordo humano',
    identifica_site && restringe_a_duvidas && nega_fechamento && sem_tool_handoff && sem_triagem,
    `Site: ${identifica_site}, Duvidas: ${restringe_a_duvidas}, Fechamento: ${nega_fechamento}, Handoff: ${sem_tool_handoff}, Triagem: ${sem_triagem}`
  );
}

function test_site_prompt_links_da_base(): void {
  const prompt = generate_site_system_prompt(data_fixa);

  const links_via_base = prompt.includes(`Os links e contatos oficiais devem ser obtidos OBRIGATORIAMENTE pela ferramenta ${nome_ferramenta_base_conhecimento}`);
  const proibe_links_inventados = prompt.includes('Nunca invente, deduza, complete ou altere links');
  const sem_links_fixos = (prompt.match(/https?:\/\/\S+/g) || []).every((link) => link.startsWith('https://dominio/caminho'));

  record_test(
    'Prompt do site obtem links exclusivamente da base de conhecimento',
    links_via_base && proibe_links_inventados && sem_links_fixos,
    `Base: ${links_via_base}, Proibicao: ${proibe_links_inventados}, Sem fixos: ${sem_links_fixos}`
  );
}

function test_selecao_prompt_por_canal(): void {
  const site_correto = selecionar_system_prompt('site', data_fixa) === generate_site_system_prompt(data_fixa);
  const mensageria_correto = selecionar_system_prompt('mensageria', data_fixa) === generate_system_prompt(data_fixa);
  const padrao_mensageria = selecionar_system_prompt(undefined, data_fixa) === generate_system_prompt(data_fixa);

  record_test(
    'Selecao do system prompt conforme o canal de origem',
    site_correto && mensageria_correto && padrao_mensageria,
    `Site: ${site_correto}, Mensageria: ${mensageria_correto}, Padrao: ${padrao_mensageria}`
  );
}

function test_descricao_ferramenta_conhecimento(): void {
  const descricao = perfil_agente.ferramentas.base_conhecimento;

  record_test(
    'Descricao da ferramenta de conhecimento referencia a organizacao e a presenca digital',
    descricao.includes(perfil_agente.organizacao.nome) && descricao.includes('presenca digital e redes sociais'),
    `Descricao da ferramenta nao contem escopo esperado: ${descricao}`
  );
}

function main(): void {
  test_dynamic_timestamp_generation();
  test_identidade_organizacao();
  test_obrigatoriedade_base_conhecimento();
  test_isolamento_mensagem_cliente();
  test_prompt_mensageria_triagem_e_handoff();
  test_site_prompt_somente_duvidas();
  test_site_prompt_links_da_base();
  test_selecao_prompt_por_canal();
  test_descricao_ferramenta_conhecimento();

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
