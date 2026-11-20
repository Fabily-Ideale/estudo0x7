import { prisma } from '../config/prisma';
import { populateVectorStore } from '../rag/vectorStore';

const identificador_cliente_teste = 'cliente_teste_seed';

async function main() {
  console.log('Iniciando o povoamento do banco de dados (seed)...');

  const client = await prisma.client.upsert({
    where: { identificador_externo: identificador_cliente_teste },
    update: {},
    create: {
      identificador_externo: identificador_cliente_teste,
    },
  });

  console.log(`Cliente de teste pronto: ID=${client.id}, Identificador=${client.identificador_externo}`);

  await prisma.message.deleteMany({
    where: { clientId: client.id },
  });

  const createdMessages = await prisma.message.createMany({
    data: [
      {
        clientId: client.id,
        role: 'user',
        text: 'Olá, gostaria de obter informações sobre os serviços.',
      },
      {
        clientId: client.id,
        role: 'assistant',
        text: 'Olá! Sou o assistente virtual. Como posso ajudar você hoje?',
      },
    ],
  });

  console.log(`${createdMessages.count} mensagens de teste inseridas com sucesso.`);

  await populateVectorStore();

  console.log('Seed concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro ao executar o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
