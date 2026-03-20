import { requestBackend } from '../backend-client';
import type { Agent, Execution } from '@/types/api';

export interface ExecutionsPageData {
  executions: Execution[];
  messageText: string;
}

export async function getExecutionsPageData(): Promise<ExecutionsPageData> {
  try {
    const agents = await requestBackend<Agent[]>('/api/v1/agents');
    const executionGroups = await Promise.all(agents.map((agent) => requestBackend<Execution[]>(`/api/v1/agents/${agent.id}/executions`)));
    const merged = executionGroups.flat().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return {
      executions: merged,
      messageText: `共加载 ${merged.length} 条执行记录`,
    };
  } catch (error) {
    return {
      executions: [],
      messageText: error instanceof Error ? error.message : '加载失败',
    };
  }
}
