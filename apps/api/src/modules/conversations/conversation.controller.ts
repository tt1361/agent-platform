import { Controller, Get, Param, Put, Body, Delete, Post, Patch } from '@nestjs/common';
import { MemoryService } from '../memories/memory.service.js';
import { ConversationService } from './conversation.service.js';

@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly memoryService: MemoryService,
  ) {
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.getMemory = this.getMemory.bind(this);
    this.create = this.create.bind(this);
    this.listByAgent = this.listByAgent.bind(this);
    this.patch = this.patch.bind(this);
    this.update = this.update.bind(this);
    this.remove = this.remove.bind(this);
  }

  @Get()
  async list() {
    return this.conversationService.list();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.conversationService.getById(id);
  }

  @Get(':id/memory')
  async getMemory(@Param('id') id: string) {
    return this.memoryService.getLatestShortTermMemory(id);
  }

  @Post()
  async create(@Body() body: { agentId: string; title?: string }) {
    return this.conversationService.create({ agentId: body.agentId, title: body.title ?? '新会话' });
  }

  @Get('agent/:agentId')
  async listByAgent(@Param('agentId') agentId: string) {
    return this.conversationService.listByAgent(agentId);
  }

  @Patch(':id')
  async patch(@Param('id') id: string, @Body() body: any) {
    return this.conversationService.update(id, body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.conversationService.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.conversationService.remove(id);
  }
}
