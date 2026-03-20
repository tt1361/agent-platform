import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '../../database.js';

@Injectable()
export class ConversationService {
  async list() {
    return prisma.conversation.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async listByAgent(agentId: string) {
    return prisma.conversation.findMany({ where: { agentId }, orderBy: { updatedAt: 'desc' } });
  }

  async getById(id: string) {
    const item = await prisma.conversation.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!item) throw new NotFoundException('Conversation not found');
    return item;
  }

  async create(input: { agentId: string; title: string }) {
    return prisma.conversation.create({ data: input });
  }

  async touch(id: string) {
    return prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  async update(id: string, input: Record<string, unknown>) {
    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Conversation not found');
    return prisma.conversation.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    const existing = await prisma.conversation.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Conversation not found');

    return prisma.$transaction(async (tx) => {
      await tx.conversationMemorySnapshot.deleteMany({
        where: { conversationId: id },
      });

      await tx.executionTrace.deleteMany({
        where: {
          execution: {
            conversationId: id,
          },
        },
      });

      await tx.knowledgeRetrievalLog.deleteMany({
        where: {
          execution: {
            conversationId: id,
          },
        },
      });

      await tx.execution.deleteMany({
        where: { conversationId: id },
      });

      return tx.conversation.delete({ where: { id } });
    });
  }
}
