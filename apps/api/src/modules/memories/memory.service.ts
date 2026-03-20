import { Injectable } from '@nestjs/common';
import { prisma } from '../../database.js';

@Injectable()
export class MemoryService {
  async getSnapshot(conversationId: string) {
    return prisma.conversationMemorySnapshot.findFirst({ where: { conversationId } });
  }

  async getLatestShortTermMemory(conversationId: string) {
    return prisma.conversationMemorySnapshot.findFirst({
      where: { conversationId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listAgentMemories(agentId: string) {
    return prisma.agentMemory.findMany({
      where: { agentId },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }] as any,
    });
  }

  async getLongTermMemories(agentId: string, _query?: string) {
    return prisma.agentMemory.findMany({
      where: { agentId },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }] as any,
      take: 8,
    });
  }

  async updateShortTermMemory(params: {
    conversationId: string;
    conversationTitle?: string;
    previousSnapshot?: { summary?: string | null } | null;
    input?: string;
    output?: string;
    messageCount?: number;
  }) {
    const summary = [
      params.previousSnapshot?.summary,
      params.conversationTitle,
      params.input,
      params.output,
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 2000);

    return prisma.conversationMemorySnapshot.create({
      data: {
        conversationId: params.conversationId,
        summary,
        messageCount: params.messageCount ?? null,
      } as any,
    });
  }

  async persistLongTermMemories(params: {
    agentId: string;
    conversationId: string;
    input: string;
    output: string;
    previousSnapshot?: unknown;
  }) {
    const content = `${params.input}\n${params.output}`.trim().slice(0, 1000);
    if (!content) return [];

    const memory = await prisma.agentMemory.create({
      data: {
        agentId: params.agentId,
        sourceConversationId: params.conversationId,
        memoryType: 'summary',
        content,
        importance: 3,
        lastAccessedAt: new Date(),
      } as any,
    });

    return [memory];
  }

  async updateAgentMemoryImportance(id: string, importance: number) {
    return prisma.agentMemory.update({ where: { id }, data: { importance } });
  }

  async removeAgentMemory(id: string) {
    return prisma.agentMemory.delete({ where: { id } });
  }
}
