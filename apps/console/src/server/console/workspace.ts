import { requestBackend } from '../backend-client';
import type { Agent, Conversation, LlmProvider, Skill } from '@/types/api';

export interface WorkspacePageData {
  agents: Agent[];
  skills: Skill[];
  providers: LlmProvider[];
  conversations: Conversation[];
  statusText: string;
}

export async function getWorkspacePageData(): Promise<WorkspacePageData> {
  try {
    const [agents, skills, providers] = await Promise.all([
      requestBackend<Agent[]>('/api/v1/agents'),
      requestBackend<Skill[]>('/api/v1/skills'),
      requestBackend<LlmProvider[]>('/api/v1/llm-providers'),
    ]);

    let conversations: Conversation[] = [];
    if (agents.length > 0) {
      const firstAgent = agents[0];
      conversations = await requestBackend<Conversation[]>(`/api/v1/agents/${firstAgent.id}/conversations`);
    }

    return {
      agents,
      skills,
      providers,
      conversations,
      statusText: '基础数据已加载',
    };
  } catch (error) {
    return {
      agents: [],
      skills: [],
      providers: [],
      conversations: [],
      statusText: error instanceof Error ? error.message : '加载失败',
    };
  }
}
