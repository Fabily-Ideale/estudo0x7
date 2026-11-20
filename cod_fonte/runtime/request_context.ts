import { AsyncLocalStorage } from 'node:async_hooks';

export type canal_atendimento = 'mensageria' | 'site';

export const canal_padrao: canal_atendimento = 'mensageria';

export interface conversation_context {
  account_id?: number | string;
  conversation_id?: number | string;
  canal?: canal_atendimento;
}

const conversation_context_storage = new AsyncLocalStorage<conversation_context>();

export function run_with_conversation_context<result_type>(
  context: conversation_context,
  executor: () => Promise<result_type>
): Promise<result_type> {
  return conversation_context_storage.run({ ...context }, executor);
}

export function get_conversation_context(): conversation_context | undefined {
  return conversation_context_storage.getStore();
}
