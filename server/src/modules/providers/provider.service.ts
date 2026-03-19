import { env } from '../../config/env.js';
import { MiniMaxProvider } from '../../core/llm/minimax-provider.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';

const provider = new MiniMaxProvider();

export const providerService = {
  list: async () => prisma.llmProvider.findMany({ orderBy: { updatedAt: 'desc' } }),

  getById: async (id: string) => {
    const item = await prisma.llmProvider.findUnique({ where: { id } });
    if (!item) throw new HttpError(404, 'NOT_FOUND', 'Provider not found');
    return item;
  },

  testConnection: async () => {
    const result = await provider.chat([{ role: 'user', content: '请用中文返回 JSON：{"status":"ok","message":"连接成功"}' }]);
    return {
      status: 'ok',
      model: env.MINIMAX_MODEL,
      contentPreview: result.content.slice(0, 200),
      usage: result.usage,
    };
  },
};
