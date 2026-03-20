import { Module } from '@nestjs/common';
import { RagController } from './rag.controller.js';
import { RagService } from './rag.service.js';
import { InMemoryVectorStoreService } from './in-memory-vector-store.service.js';

@Module({
  controllers: [RagController],
  providers: [RagService, InMemoryVectorStoreService],
  exports: [RagService, InMemoryVectorStoreService],
})
export class RagModule {}
