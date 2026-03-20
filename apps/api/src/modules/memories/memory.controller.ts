import { Controller, Get, Param, Patch, Delete, Body } from '@nestjs/common';
import { MemoryService } from './memory.service.js';

@Controller('memories')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {
    this.getSnapshot = this.getSnapshot.bind(this);
    this.listAgentMemories = this.listAgentMemories.bind(this);
    this.updateImportance = this.updateImportance.bind(this);
    this.removeAgentMemory = this.removeAgentMemory.bind(this);
  }

  @Get('snapshot/:conversationId')
  async getSnapshot(@Param('conversationId') conversationId: string) {
    return this.memoryService.getSnapshot(conversationId);
  }

  @Get('agent/:agentId')
  async listAgentMemories(@Param('agentId') agentId: string) {
    return this.memoryService.listAgentMemories(agentId);
  }

  @Patch('agent/:id/importance')
  async updateImportance(@Param('id') id: string, @Body('importance') importance: number) {
    return this.memoryService.updateAgentMemoryImportance(id, importance);
  }

  @Delete('agent/:id')
  async removeAgentMemory(@Param('id') id: string) {
    return this.memoryService.removeAgentMemory(id);
  }
}
