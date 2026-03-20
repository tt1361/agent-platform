import { Controller, Get, Post, Delete, Param, Body, Patch } from '@nestjs/common';
import { SkillService } from './skill.service.js';

@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {
    this.list = this.list.bind(this);
    this.listAvailable = this.listAvailable.bind(this);
    this.getById = this.getById.bind(this);
    this.create = this.create.bind(this);
    this.updateStatus = this.updateStatus.bind(this);
    this.remove = this.remove.bind(this);
  }

  @Get()
  async list() {
    return this.skillService.list();
  }

  @Get('available')
  async listAvailable() {
    return this.skillService.listAvailable();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.skillService.getById(id);
  }

  @Post()
  async create(
    @Body()
    body: {
      skillKey: string;
      version: string;
      name?: string;
      description?: string;
      executorKey?: string;
      status?: 'active' | 'deprecated' | 'disabled';
      parametersSchema?: Record<string, unknown>;
      returnsSchema?: Record<string, unknown>;
      tags?: string[];
      timeoutMs?: number;
    },
  ) {
    return this.skillService.create(body);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: 'active' | 'deprecated' | 'disabled') {
    return this.skillService.updateStatus(id, status);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.skillService.remove(id);
  }
}
