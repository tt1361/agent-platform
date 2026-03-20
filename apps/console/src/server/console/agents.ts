import { requestBackend } from '../backend-client';
import type { Agent, LlmProvider, Skill, Execution, KnowledgeRetrievalItem } from '@/types/api';

export interface AgentsPageData {
  agents: Agent[];
  providers: LlmProvider[];
  skills: Skill[];
  messageText: string;
}

export async function getAgentsPageData(): Promise<AgentsPageData> {
  try {
    const [agents, providers, skills] = await Promise.all([
      requestBackend<Agent[]>('/api/v1/agents'),
      requestBackend<LlmProvider[]>('/api/v1/llm-providers'),
      requestBackend<Skill[]>('/api/v1/skills'),
    ]);
    return {
      agents,
      providers,
      skills,
      messageText: `已加载 ${agents.length} 个智能体`,
    };
  } catch (error) {
    return {
      agents: [],
      providers: [],
      skills: [],
      messageText: error instanceof Error ? error.message : '加载失败',
    };
  }
}
