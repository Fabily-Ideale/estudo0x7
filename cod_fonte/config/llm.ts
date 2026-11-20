import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { env } from './env';

export const llm = new ChatOpenAI({
  openAIApiKey: env.LLM_API_KEY,
  configuration: {
    baseURL: env.LLM_BASE_URL,
  },
  modelName: env.LLM_MODELO,
  temperature: env.LLM_TEMPERATURA,
  timeout: env.LLM_TIMEOUT_MS,
  maxRetries: 2,
});

export const embeddings = new OpenAIEmbeddings({
  openAIApiKey: env.LLM_API_KEY,
  configuration: {
    baseURL: env.LLM_BASE_URL,
  },
  modelName: env.LLM_MODELO_EMBEDDING,
  timeout: env.LLM_TIMEOUT_MS,
  maxRetries: 2,
});
