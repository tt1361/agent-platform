// @ts-ignore
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '../../server/.env'), override: false });
loadEnv({ path: resolve(process.cwd(), '.env'), override: false });

const prisma = new PrismaClient();

// Note: environment variables like MINIMAX_MODEL are passed from apps/api context now
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.5';
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat';
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || 'replace-me';

const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-plus';
const QWEN_BASE_URL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_API_KEY = process.env.QWEN_API_KEY || 'replace-me';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'replace-me';

async function main() {
  const provider = await prisma.llmProvider.upsert({
    where: { providerKey: 'minimax-default' },
    update: {
      name: 'MiniMax Default',
      providerType: 'minimax',
      model: MINIMAX_MODEL,
      apiBaseUrl: MINIMAX_BASE_URL,
      apiKeyMasked: `${MINIMAX_API_KEY.slice(0, 6)}***${MINIMAX_API_KEY.slice(-4)}`,
      status: 'active',
    },
    create: {
      providerKey: 'minimax-default',
      name: 'MiniMax Default',
      providerType: 'minimax',
      model: MINIMAX_MODEL,
      apiBaseUrl: MINIMAX_BASE_URL,
      apiKeyMasked: `${MINIMAX_API_KEY.slice(0, 6)}***${MINIMAX_API_KEY.slice(-4)}`,
      status: 'active',
    },
  });

  const qwenProvider = await prisma.llmProvider.upsert({
    where: { providerKey: 'qwen-default' },
    update: {
      name: '通义千问 Qwen',
      providerType: 'qwen',
      model: QWEN_MODEL,
      apiBaseUrl: QWEN_BASE_URL,
      apiKeyMasked: `${QWEN_API_KEY.slice(0, 6)}***${QWEN_API_KEY.slice(-4)}`,
      status: 'active',
    },
    create: {
      providerKey: 'qwen-default',
      name: '通义千问 Qwen',
      providerType: 'qwen',
      model: QWEN_MODEL,
      apiBaseUrl: QWEN_BASE_URL,
      apiKeyMasked: `${QWEN_API_KEY.slice(0, 6)}***${QWEN_API_KEY.slice(-4)}`,
      status: 'active',
    },
  });

  const geminiProvider = await prisma.llmProvider.upsert({
    where: { providerKey: 'gemini-default' },
    update: {
      name: 'Google Gemini',
      providerType: 'gemini',
      model: GEMINI_MODEL,
      apiBaseUrl: GEMINI_BASE_URL,
      apiKeyMasked: `${GEMINI_API_KEY.slice(0, 6)}***${GEMINI_API_KEY.slice(-4)}`,
      status: 'active',
    },
    create: {
      providerKey: 'gemini-default',
      name: 'Google Gemini',
      providerType: 'gemini',
      model: GEMINI_MODEL,
      apiBaseUrl: GEMINI_BASE_URL,
      apiKeyMasked: `${GEMINI_API_KEY.slice(0, 6)}***${GEMINI_API_KEY.slice(-4)}`,
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
      llmProviderId: qwenProvider.id,
      skillIds: skillsInDb.map(s => s.id),
    },
    create: {
      id: 'default-agent-id',
      name: '默认智能体',
      description: '用于本地 MVP 联调的默认智能体',
      status: 'active',
      llmProviderId: qwenProvider.id,
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
