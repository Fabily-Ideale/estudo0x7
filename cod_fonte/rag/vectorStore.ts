import path from 'path';
import { createHash } from 'crypto';
import { prisma } from '../config/prisma';
import { embeddings } from '../config/llm';
import { process_directory_documents, prepare_chunks, document_chunk } from './doc_conversor';

export function calcular_hash_conteudo(conteudo: string): string {
  return createHash('sha256').update(conteudo, 'utf8').digest('hex');
}

export function precisa_reindexar(hash_atual: string, hash_armazenado: string | null | undefined, force_reload: boolean): boolean {
  return force_reload || hash_armazenado !== hash_atual;
}

async function obter_hash_armazenado(source: string): Promise<string | null> {
  const registro = await prisma.documentEmbedding.findFirst({
    where: { source },
    select: { metadata: true },
  });
  const metadata = registro?.metadata as Record<string, unknown> | null | undefined;
  return typeof metadata?.content_hash === 'string' ? metadata.content_hash : null;
}

export async function populateVectorStore(force_reload = false): Promise<void> {
  const source_dir = path.join(__dirname, 'doc_bruto');
  const target_dir = path.join(__dirname, 'doc_markdown');

  const converted_docs = await process_directory_documents(source_dir, target_dir);

  const active_target_paths = converted_docs.map(doc => doc.target_path);
  if (active_target_paths.length > 0) {
    await prisma.documentEmbedding.deleteMany({
      where: {
        source: { notIn: active_target_paths },
      },
    });
  } else {
    await prisma.documentEmbedding.deleteMany();
    return;
  }

  for (const doc of converted_docs) {
    const hash_atual = calcular_hash_conteudo(doc.content);
    const hash_armazenado = await obter_hash_armazenado(doc.target_path);

    if (!precisa_reindexar(hash_atual, hash_armazenado, force_reload)) {
      continue;
    }

    const doc_chunks = prepare_chunks(doc);
    if (doc_chunks.length === 0) {
      continue;
    }

    const texts = doc_chunks.map(chunk => chunk.content);
    const vector_list = await embeddings.embedDocuments(texts);

    await prisma.documentEmbedding.deleteMany({
      where: { source: doc.target_path },
    });

    for (let i = 0; i < doc_chunks.length; i++) {
      const chunk = doc_chunks[i];
      const vector = vector_list[i];
      const vector_literal = `[${vector.join(',')}]`;
      const metadata_json = JSON.stringify({ ...chunk.metadata, content_hash: hash_atual });

      await prisma.$executeRawUnsafe(
        `INSERT INTO "DocumentEmbedding" (id, content, embedding, metadata, source, "createdAt")
         VALUES (gen_random_uuid(), $1, $2::vector, $3::jsonb, $4, NOW())`,
        chunk.content,
        vector_literal,
        metadata_json,
        chunk.source_file
      );
    }
  }
}

export async function queryDocuments(query: string, n_results = 4): Promise<{ content: string; metadata: any; source: string }[]> {
  try {
    const embedding = await embeddings.embedQuery(query);
    const sql = `
      SELECT content, metadata, source 
      FROM "DocumentEmbedding" 
      ORDER BY embedding <=> $1::vector 
      LIMIT $2
    `;

    const vector_literal = `[${embedding.join(',')}]`;
    const results = await prisma.$queryRawUnsafe<any[]>(sql, vector_literal, n_results);

    return results;
  } catch (error) {
    console.error('Erro na busca vetorial de documentos:', error);
    return [];
  }
}
