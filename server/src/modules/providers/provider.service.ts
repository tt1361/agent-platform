import { env } from '../../config/env.js';
import { MiniMaxProvider } from '../../core/llm/minimax-provider.js';
import { QwenProvider } from '../../core/llm/qwen-provider.js';
import { GeminiProvider } from '../../core/llm/gemini-provider.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';

export const providerService = {
  list: async () => prisma.llmProvider.findMany({ orderBy: { updatedAt: 'desc' } }),

  getById: async (id: string) => {
    const item = await prisma.llmProvider.findUnique({ where: { id } });
    if (!item) throw new HttpError(404, 'NOT_FOUND', 'Provider not found');
    return item;
  },

  testConnection: async (providerId: string) => {
    const providerRecord = await providerService.getById(providerId);
    let adapter;
    let currentModel = '';

    if (providerRecord.providerType === 'qwen') {
      adapter = new QwenProvider();
      currentModel = env.QWEN_MODEL;
    } else if (providerRecord.providerType === 'gemini') {
      adapter = new GeminiProvider();
      currentModel = env.GEMINI_MODEL;
    } else {
      adapter = new MiniMaxProvider();
      currentModel = env.MINIMAX_MODEL;
    }

    const result = await adapter.chat([{ role: 'user', content: '请用中文返回 JSON：{"status":"ok","message":"连接成功"}' }]);
    return {
      status: 'ok',
      model: currentModel,
      contentPreview: result.content.slice(0, 200),
      usage: result.usage,
    };
  },
};
