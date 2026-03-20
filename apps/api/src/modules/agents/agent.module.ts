import { Module } from '@nestjs/common';
import { AgentService } from './agent.service.js';
import { AgentController } from './agent.controller.js';
import { RuntimeModule } from '../runtime/runtime.module.js';
import { ConversationModule } from '../conversations/conversation.module.js';
import { MemoryModule } from '../memories/memory.module.js';

@Module({
  imports: [RuntimeModule, ConversationModule, MemoryModule],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
