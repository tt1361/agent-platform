import { Controller, Get, Post, Put, Delete, Param, Body, Sse, Patch } from '@nestjs/common';
import { AgentService } from './agent.service.js';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('agents')
export class AgentController {
  constructor(private readonly agentService: AgentService) {
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
    this.updateStatus = this.updateStatus.bind(this);
    this.patchStatus = this.patchStatus.bind(this);
    this.remove = this.remove.bind(this);
    this.listExecutions = this.listExecutions.bind(this);
    this.listConversations = this.listConversations.bind(this);
    this.listMemories = this.listMemories.bind(this);
    this.updateMemoryImportance = this.updateMemoryImportance.bind(this);
    this.deleteMemory = this.deleteMemory.bind(this);
    this.runStream = this.runStream.bind(this);
    this.run = this.run.bind(this);
  }

  @Get()
  async list() {
    return this.agentService.list();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.agentService.getById(id);
  }

  @Post()
  async create(@Body() body: any) {
    return this.agentService.create(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.agentService.update(id, body);
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: 'draft' | 'active' | 'archived') {
    return this.agentService.updateStatus(id, status);
  }

  @Patch(':id/status')
  async patchStatus(@Param('id') id: string, @Body('status') status: 'draft' | 'active' | 'archived') {
    return this.agentService.updateStatus(id, status);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.agentService.remove(id);
  }

  @Get(':id/executions')
  async listExecutions(@Param('id') id: string) {
    return this.agentService.listExecutions(id);
  }

  @Get(':id/conversations')
  async listConversations(@Param('id') id: string) {
    return this.agentService.listConversations(id);
  }

  @Get(':id/memories')
  async listMemories(@Param('id') id: string) {
    return this.agentService.listMemories(id);
  }

  @Patch(':id/memories/:memoryId')
  async updateMemoryImportance(@Param('id') id: string, @Param('memoryId') memoryId: string, @Body('importance') importance: number) {
    return this.agentService.updateMemoryImportance(id, memoryId, importance);
  }

  @Delete(':id/memories/:memoryId')
  async deleteMemory(@Param('id') id: string, @Param('memoryId') memoryId: string) {
    return this.agentService.deleteMemory(id, memoryId);
  }

  @Post(':id/run/stream')
  @Sse()
  runStream(@Param('id') id: string, @Body() body: any): Observable<MessageEvent> {
    const { input, timeoutMs, conversationId, conversationTitle } = body;
    const subject = new Subject<MessageEvent>();
    
    // Fire and forget
    this.agentService.run(id, input, timeoutMs, conversationId, conversationTitle, (event) => {
      subject.next({ data: event, type: event.type } as any);
      if (event.type === 'completed' || event.type === 'failed') {
        subject.complete();
      }
    }).then(
      (result) => {
        // success handled by completed event
      },
      (error) => {
        console.error('Agent run failed:', error);
      }
    );
    
    return subject.asObservable();
  }

  @Post(':id/run')
  async run(@Param('id') id: string, @Body() body: any) {
    const { input, timeoutMs, conversationId, conversationTitle } = body;
    return this.agentService.run(id, input, timeoutMs, conversationId, conversationTitle);
  }
}
