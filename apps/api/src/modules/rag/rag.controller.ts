import { Body, Controller, Get, Post } from '@nestjs/common';
import { RagService } from './rag.service.js';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {
    this.index = this.index.bind(this);
    this.retrieve = this.retrieve.bind(this);
    this.health = this.health.bind(this);
  }

  @Post('index')
  index(@Body() body: { documentId: string; rawText: string }) {
    return this.ragService.indexDocument(body.documentId, body.rawText);
  }

  @Post('retrieve')
  retrieve(@Body() body: { query: string; limit?: number; filter?: Record<string, unknown> }) {
    return this.ragService.retrieve(body.query, body.limit, body.filter);
  }

  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
