import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { env } from '../src/config/env.js';

const prisma = new PrismaClient();

async function main() {
  const provider = await prisma.llmProvider.upsert({
    where: { providerKey: 'minimax-default' },
    update: {
      name: 'MiniMax Default',
      providerType: 'minimax',
      model: env.MINIMAX_MODEL,
      apiBaseUrl: env.MINIMAX_BASE_URL,
      apiKeyMasked: `${env.MINIMAX_API_KEY.slice(0, 6)}***${env.MINIMAX_API_KEY.slice(-4)}`,
      status: 'active',
    },
    create: {
      providerKey: 'minimax-default',
      name: 'MiniMax Default',
      providerType: 'minimax',
      model: env.MINIMAX_MODEL,
      apiBaseUrl: env.MINIMAX_BASE_URL,
      apiKeyMasked: `${env.MINIMAX_API_KEY.slice(0, 6)}***${env.MINIMAX_API_KEY.slice(-4)}`,
      status: 'active',
    },
  });

  const sampleSkills = [
    {
      skillKey: 'echo',
      name: 'Echo',
      version: '1.0.0',
      description: 'Echoes the provided payload',
      executorKey: 'echo',
      status: 'active',
      parametersSchema: { type: 'object', properties: { text: { type: 'string' } } },
      returnsSchema: { type: 'object' },
      tags: ['utility'],
    },
    {
      skillKey: 'summarize-text',
      name: 'Summarize Text',
      version: '1.0.0',
      description: 'Produces a short summary from text',
      executorKey: 'summarize_text',
      status: 'active',
      parametersSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      returnsSchema: { type: 'object' },
      tags: ['text'],
    },
    {
      skillKey: 'extract-keywords',
      name: 'Extract Keywords',
      version: '1.0.0',
      description: 'Extracts keywords from text',
      executorKey: 'extract_keywords',
      status: 'active',
      parametersSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      returnsSchema: { type: 'object' },
      tags: ['text'],
    },
  ] as const;

  for (const skill of sampleSkills) {
    await prisma.skill.upsert({
      where: { skillKey_version: { skillKey: skill.skillKey, version: skill.version } },
      update: skill,
      create: skill,
    });
  }

  const skillsInDb = await prisma.skill.findMany({ where: { status: 'active' } });

  await prisma.agent.upsert({
    where: { id: 'default-agent-id' },
    update: {
      skillIds: skillsInDb.map(s => s.id),
    },
    create: {
      id: 'default-agent-id',
      name: '默认智能体',
      description: '用于本地 MVP 联调的默认智能体',
      status: 'active',
      llmProviderId: provider.id,
      systemPrompt: '你是一名中文智能助手。请保持上下文连贯，优先给出清晰、实用、简洁的回答。',
      maxSteps: 6,
      timeoutMs: 60000,
      skillIds: skillsInDb.map(s => s.id),
    },
  });

  console.log('Seed completed', { providerId: provider.id, skillCount: sampleSkills.length });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
