import { Injectable, NotFoundException } from '@nestjs/common';
import { env } from '../../config/env.js';
import { MiniMaxProvider } from '../../llm/minimax-provider.js';
import { QwenProvider } from '../../llm/qwen-provider.js';
import { GeminiProvider } from '../../llm/gemini-provider.js';
import { prisma } from '../../database.js';

function isGeminiRegionUnsupportedError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('user location is not supported');
}

@Injectable()
export class ProviderService {
  async list() {
    return prisma.llmProvider.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async getById(id: string) {
    const item = await prisma.llmProvider.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Provider not found');
    return item;
  }

  async testConnection(providerId: string) {
    const providerRecord = await this.getById(providerId);
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

    let result;
    try {
      result = await adapter.chat([{ role: 'user', content: '请用中文返回 JSON：{"status":"ok","message":"连接成功"}' }]);
    } catch (error) {
      if (providerRecord.providerType === 'gemini' && isGeminiRegionUnsupportedError(error)) {
        throw new Error('Gemini 在当前地区不可用，请切换到 Qwen 或 MiniMax 继续使用');
      }
      throw error;
    }

    return {
      status: 'ok',
      model: currentModel,
      contentPreview: result.content.slice(0, 200),
      usage: result.usage,
    };
  }
}
