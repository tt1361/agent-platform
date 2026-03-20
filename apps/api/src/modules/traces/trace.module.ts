import { Module } from '@nestjs/common';
import { TraceService } from './trace.service.js';
import { TraceController } from './trace.controller.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';

@Module({
  imports: [KnowledgeModule],
  controllers: [TraceController],
  providers: [TraceService],
  exports: [TraceService],
})
export class TraceModule {}
