import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './modules/agents/agent.module.js';
import { ConversationModule } from './modules/conversations/conversation.module.js';
import { MemoryModule } from './modules/memories/memory.module.js';
import { ProviderModule } from './modules/providers/provider.module.js';
import { SkillModule } from './modules/skills/skill.module.js';
import { TraceModule } from './modules/traces/trace.module.js';
import { KnowledgeModule } from './modules/knowledge/knowledge.module.js';
import { McpModule } from './modules/mcp/mcp.module.js';
import { RagModule } from './modules/rag/rag.module.js';
import { HitlModule } from './modules/hitl/hitl.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AgentModule,
    ConversationModule,
    MemoryModule,
    ProviderModule,
    SkillModule,
    TraceModule,
    KnowledgeModule,
    McpModule,
    RagModule,
    HitlModule,
  ],
})
export class AppModule {}
