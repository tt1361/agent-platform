import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeRetrievalService } from './knowledge.retrieval.service.js';
import { KnowledgeController } from './knowledge.controller.js';

@Module({
  controllers: [KnowledgeController],
  providers: [KnowledgeService, KnowledgeRetrievalService],
  exports: [KnowledgeService, KnowledgeRetrievalService],
})
export class KnowledgeModule {}
