import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { HitlService } from './hitl.service.js';
import type { HumanTaskStatus, HumanTaskType } from './hitl.types.js';

@Controller('hitl/tasks')
export class HitlController {
  constructor(private readonly hitlService: HitlService) {
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.create = this.create.bind(this);
    this.updateStatus = this.updateStatus.bind(this);
  }

  @Get()
  list() {
    return this.hitlService.list();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.hitlService.getById(id);
  }

  @Post()
  create(
    @Body()
    body: {
      title: string;
      taskType: HumanTaskType;
      sourceType: 'agent' | 'workflow' | 'tool';
      sourceId: string;
      payload: Record<string, unknown>;
      assigneeId?: string;
    },
  ) {
    return this.hitlService.create(body);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: HumanTaskStatus) {
    return this.hitlService.updateStatus(id, status);
  }
}
