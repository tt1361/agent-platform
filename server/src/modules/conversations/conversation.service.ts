import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';

export const conversationService = {
  listByAgent: async (agentId: string) =>
    prisma.conversation.findMany({
      where: { agentId },
      orderBy: { updatedAt: 'desc' },
      include: {
        executions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    }),

  getById: async (conversationId: string) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        executions: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new HttpError(404, 'NOT_FOUND', 'Conversation not found');
    }

    return conversation;
  },

  create: async (agentId: string, title?: string) => {
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { id: true } });
    if (!agent) {
      throw new HttpError(404, 'NOT_FOUND', '未找到智能体，无法创建会话');
    }

    return prisma.conversation.create({
      data: {
        agentId,
        title: title?.trim() || '新会话',
      },
    });
  },

  rename: async (conversationId: string, title: string) => {
    await conversationService.getById(conversationId);
    return prisma.conversation.update({
      where: { id: conversationId },
      data: { title: title.trim() || '新会话' },
    });
  },

  remove: async (conversationId: string) => {
    await conversationService.getById(conversationId);

    const deleteMemories = prisma.conversationMemorySnapshot.deleteMany({ where: { conversationId } });

    const deleteTraces = prisma.executionTrace.deleteMany({
      where: {
        execution: {
          conversationId,
        },
      },
    });

    const deleteRetrievals = prisma.knowledgeRetrievalLog.deleteMany({
      where: {
        execution: {
          conversationId,
        },
      },
    });

    const deleteExecutions = prisma.execution.deleteMany({ where: { conversationId } });
    const deleteConversation = prisma.conversation.delete({ where: { id: conversationId } });

    const [, , , , conversation] = await prisma.$transaction([
      deleteMemories,
      deleteTraces,
      deleteRetrievals,
      deleteExecutions,
      deleteConversation,
    ]);

    return conversation;
  },

  touch: async (conversationId: string) =>
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
};
