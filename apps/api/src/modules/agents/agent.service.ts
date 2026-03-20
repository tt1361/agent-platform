import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../database.js';
// RuntimeService will be implemented next
import { RuntimeService } from '../runtime/runtime.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { MemoryService } from '../memories/memory.service.js';

@Injectable()
export class AgentService {
  constructor(
    private readonly runtimeService: RuntimeService,
    private readonly conversationService: ConversationService,
    private readonly memoryService: MemoryService,
  ) {}

  async list() {
    return prisma.agent.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async getById(id: string) {
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException('Agent not found');
    return agent;
  }

  async create(input: {
    name: string;
    description?: string;
    llmProviderId: string;
    skillIds: string[];
    maxSteps: number;
    timeoutMs: number;
    systemPrompt?: string;
    status: 'draft' | 'active' | 'archived';
  }) {
    try {
      return await prisma.agent.create({
        data: input,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async update(id: string, input: Record<string, unknown>) {
    await this.getById(id);
    return prisma.agent.update({
      where: { id },
      data: input,
    });
  }

  async updateStatus(id: string, status: 'draft' | 'active' | 'archived') {
    await this.getById(id);
    return prisma.agent.update({
      where: { id },
      data: { status },
    });
  }

  async remove(id: string) {
    await this.getById(id);
    return prisma.agent.delete({ where: { id } });
  }

  async listExecutions(agentId: string) {
    return prisma.execution.findMany({ where: { agentId }, orderBy: { createdAt: 'desc' } });
  }

  async listConversations(agentId: string) {
    return this.conversationService.listByAgent(agentId);
  }

  async listMemories(agentId: string) {
    return this.memoryService.listAgentMemories(agentId);
  }

  async updateMemoryImportance(agentId: string, memoryId: string, importance: number) {
    const memory = await prisma.agentMemory.findUnique({ where: { id: memoryId } });
    if (!memory || memory.agentId !== agentId) throw new NotFoundException('Memory not found');
    return this.memoryService.updateAgentMemoryImportance(memoryId, importance);
  }

  async deleteMemory(agentId: string, memoryId: string) {
    const memory = await prisma.agentMemory.findUnique({ where: { id: memoryId } });
    if (!memory || memory.agentId !== agentId) throw new NotFoundException('Memory not found');
    return this.memoryService.removeAgentMemory(memoryId);
  }

  run(agentId: string, input: string, timeoutMs?: number, conversationId?: string, conversationTitle?: string, onEvent?: (event: any) => void) {
    return this.runtimeService.run({ agentId, input, overrideTimeoutMs: timeoutMs, conversationId, conversationTitle, onEvent });
  }
}
