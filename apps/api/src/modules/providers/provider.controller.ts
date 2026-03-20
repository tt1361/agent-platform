import { Controller, Get, Param, Post } from '@nestjs/common';
import { ProviderService } from './provider.service.js';

@Controller('llm-providers')
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.testConnection = this.testConnection.bind(this);
  }

  @Get()
  async list() {
    return this.providerService.list();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.providerService.getById(id);
  }

  @Post(':id/test')
  async testConnection(@Param('id') id: string) {
    return this.providerService.testConnection(id);
  }
}
