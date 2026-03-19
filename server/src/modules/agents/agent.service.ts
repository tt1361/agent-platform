import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { ReactAgentRunner } from '../../core/agent/react-agent.js';

const agentRunner = new ReactAgentRunner();

export const agentService = {
  list: async () => prisma.agent.findMany({ orderBy: { updatedAt: 'desc' } }),

  getById: async (id: string) => {
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new HttpError(404, 'NOT_FOUND', 'Agent not found');
    return agent;
  },

  create: async (input: {
    name: string;
    description?: string;
    llmProviderId: string;
    skillIds: string[];
    maxSteps: number;
    timeoutMs: number;
    systemPrompt?: string;
    status: 'draft' | 'active' | 'archived';
  }) => {
    try {
      return await prisma.agent.create({
        data: {
          name: input.name,
          description: input.description,
          llmProviderId: input.llmProviderId,
          skillIds: input.skillIds,
          maxSteps: input.maxSteps,
          timeoutMs: input.timeoutMs,
          systemPrompt: input.systemPrompt,
          status: input.status,
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new HttpError(400, 'VALIDATION_ERROR', error.message);
      }
      throw error;
    }
  },

  update: async (id: string, input: Record<string, unknown>) => {
    await agentService.getById(id);
    return prisma.agent.update({
      where: { id },
      data: input,
    });
  },

  updateStatus: async (id: string, status: 'draft' | 'active' | 'archived') => {
    await agentService.getById(id);
    return prisma.agent.update({
      where: { id },
      data: { status },
    });
  },

  remove: async (id: string) => {
    await agentService.getById(id);
    return prisma.agent.delete({ where: { id } });
  },

  listExecutions: async (agentId: string) => prisma.execution.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } }),

  run: async (agentId: string, input: string, timeoutMs?: number, conversationId?: string, conversationTitle?: string) =>
    agentRunner.run({ agentId, input, overrideTimeoutMs: timeoutMs, conversationId, conversationTitle }),
};
