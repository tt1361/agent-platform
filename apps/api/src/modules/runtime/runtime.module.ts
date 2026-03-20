import { Module } from '@nestjs/common';
import { RuntimeService } from './runtime.service.js';
import { ConversationModule } from '../conversations/conversation.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { MemoryModule } from '../memories/memory.module.js';

@Module({
  imports: [ConversationModule, KnowledgeModule, MemoryModule],
  providers: [RuntimeService],
  exports: [RuntimeService],
})
export class RuntimeModule {}
