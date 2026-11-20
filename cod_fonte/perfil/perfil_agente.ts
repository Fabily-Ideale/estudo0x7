export interface identidade_organizacao {
  nome: string;
  aliases: string[];
  descricao_atuacao: string;
}

export interface mensagens_usuario {
  bloqueio_guardrail: string;
  erro_processamento: string;
  midia_nao_suportada: string;
  limite_mensagens: string;
  limite_etapas: string;
  ferramenta_nao_encontrada: (nome_ferramenta: string) => string;
  handoff_concluido: (motivo: string) => string;
  handoff_bloqueado_site: string;
}

export interface descricoes_ferramentas {
  base_conhecimento: string;
  base_conhecimento_parametro_busca: string;
  base_conhecimento_parametro_limite: string;
  base_conhecimento_sem_resultado: string;
  handoff: string;
  handoff_parametro_motivo: string;
}

export interface perfil_agente_definicao {
  identificador_servico: string;
  organizacao: identidade_organizacao;
  fuso_horario: string;
  locale: string;
  criterios_triagem: string[];
  rotulo_handoff_chatwoot: string;
  motivo_handoff_por_declaracao: string;
  frases_declaracao_transferencia: string[];
  mensagens: mensagens_usuario;
  ferramentas: descricoes_ferramentas;
}

const nome_organizacao = 'Organizacao Exemplo';

export const perfil_agente: perfil_agente_definicao = {
  identificador_servico: 'boilerplate_agente',
  organizacao: {
    nome: nome_organizacao,
    aliases: [nome_organizacao, 'Org Exemplo', 'Org-Exemplo'],
    descricao_atuacao: 'organizacao que presta servicos aos seus clientes',
  },
  fuso_horario: 'America/Sao_Paulo',
  locale: 'pt-BR',
  criterios_triagem: [
    'o que o cliente deseja (o proposito ou necessidade do contato)',
    'o contexto relevante atrelado ao pedido (detalhes, sintomas, prazos ou informacoes operacionais)',
  ],
  rotulo_handoff_chatwoot: 'atendimento_humano',
  motivo_handoff_por_declaracao: 'declaracao_agente_conclusao_triagem',
  frases_declaracao_transferencia: [
    'transferi seu atendimento',
    'transferindo seu atendimento',
    'transferido para nossa equipe',
  ],
  mensagens: {
    bloqueio_guardrail: `Atendimento restrito a clientes da ${nome_organizacao}. Por favor, informe sua duvida sobre nossos servicos.`,
    erro_processamento: 'Desculpe, ocorreu um erro ao processar sua solicitacao.',
    midia_nao_suportada: 'Nosso assistente virtual suporta apenas mensagens de texto. Por favor, envie sua duvida ou solicitacao por escrito em texto.',
    limite_mensagens: 'Limite de mensagens atingido. Por favor, aguarde alguns instantes antes de enviar novas mensagens.',
    limite_etapas: 'Nao foi possivel concluir o processamento dentro do limite de etapas.',
    ferramenta_nao_encontrada: (nome_ferramenta: string) => `Ferramenta ${nome_ferramenta} nao encontrada.`,
    handoff_concluido: (motivo: string) =>
      `Atendimento transferido para a equipe humana com sucesso. Resumo da triagem registrado: ${motivo}. Informe ao cliente que a triagem foi concluida e que um atendente dara continuidade ao atendimento por aqui em instantes.`,
    handoff_bloqueado_site: 'Ferramenta indisponivel no canal do site. Oriente o visitante a prosseguir pelo canal oficial de atendimento.',
  },
  ferramentas: {
    base_conhecimento: `Consulta a base de conhecimento institucional da ${nome_organizacao} (historico, quem somos, onde atua, servicos, presenca digital e redes sociais, missao, visao, valores, politicas e artigos).`,
    base_conhecimento_parametro_busca: 'Pergunta ou termo para busca semantica na base de documentos institucionais',
    base_conhecimento_parametro_limite: 'Quantidade maxima de trechos de documentos a recuperar (padrao 4)',
    base_conhecimento_sem_resultado: 'Nenhuma informacao relevante encontrada na base de conhecimento.',
    handoff: 'Transfere o atendimento para a equipe humana no Chatwoot para que ela de continuidade ao atendimento real. Deve ser acionada assim que os criterios da triagem forem atendidos, ou se o proposito do cliente permanecer incompreensivel apos tentativas de clarificacao. O agente sob nenhuma hipotese conclui o atendimento por conta propria.',
    handoff_parametro_motivo: 'Resumo estruturado da triagem contendo cada criterio identificado (ou a justificativa de incompreensao)',
  },
};
