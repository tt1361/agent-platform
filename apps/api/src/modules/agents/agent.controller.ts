import { Controller, Get, Post, Put, Delete, Param, Body, Patch, Res } from '@nestjs/common';
import { AgentService } from './agent.service.js';
import { Response } from 'express';
import { EventEncoder } from '@ag-ui/encoder';
import { Readable } from 'stream';

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
  async runStream(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    const { input, timeoutMs, conversationId, conversationTitle } = body;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const encoder = new EventEncoder();
    const writeEvent = (event: any) => {
      try { res.write(encoder.encodeSSE(event)); } catch {}
    };

    this.agentService.run(id, input, timeoutMs, conversationId, conversationTitle, (event) => {
      if (event.type === 'status') {
        writeEvent({
          type: 'CUSTOM',
          customEvent: 'run_status',
          payload: { traceId: event.traceId, conversationId: event.conversationId },
        });
      } else if (event.type === 'retrievals') {
        writeEvent({
          type: 'CUSTOM',
          customEvent: 'run_retrievals',
          payload: { items: event.items },
        });
      } else if (event.type === 'trace_step') {
        const { step } = event;
        switch (step.stepType) {
          case 'thought':
            writeEvent({ type: 'REASONING_MESSAGE_CONTENT', content: step.content });
            writeEvent({
              type: 'CUSTOM',
              customEvent: 'trace_step',
              payload: step,
            });
            break;
          case 'action':
            writeEvent({ type: 'TOOL_CALL_START', toolCallId: step.executionId, toolCallName: step.toolName || 'tool' });
            writeEvent({ type: 'TOOL_CALL_ARGS', toolCallId: step.executionId, delta: JSON.stringify(step.toolInput || {}) });
            writeEvent({
              type: 'CUSTOM',
              customEvent: 'trace_step',
              payload: step,
            });
            break;
          case 'observation':
            writeEvent({ type: 'TOOL_CALL_END', toolCallId: step.executionId });
            writeEvent({ type: 'TOOL_CALL_RESULT', toolCallId: step.executionId, messageId: step.executionId, content: JSON.stringify(step.toolOutput || {}) });
            writeEvent({
              type: 'CUSTOM',
              customEvent: 'trace_step',
              payload: step,
            });
            break;
          case 'final_answer':
            writeEvent({ type: 'TEXT_MESSAGE_CONTENT', messageId: step.executionId, delta: step.content });
            break;
        }
      } else if (event.type === 'failed') {
        writeEvent({ type: 'RUN_ERROR', message: event.error.message });
      } else if (event.type === 'answer_start') {
        writeEvent({ type: 'TEXT_MESSAGE_START', messageId: event.executionId });
      } else if (event.type === 'completed') {
        writeEvent({
          type: 'CUSTOM',
          customEvent: 'run_completed',
          payload: { result: event.result },
        });
      }
      
      if (event.type === 'completed' || event.type === 'failed') {
        try { res.end(); } catch {}
      }
    }).catch((error) => {
      console.error('Agent run failed:', error);
      writeEvent({ type: 'RUN_ERROR', message: error.message });
      try { res.end(); } catch {}
    });
  }

  @Post(':id/run')
  async run(@Param('id') id: string, @Body() body: any) {
    const { input, timeoutMs, conversationId, conversationTitle } = body;
    return this.agentService.run(id, input, timeoutMs, conversationId, conversationTitle);
  }
}
