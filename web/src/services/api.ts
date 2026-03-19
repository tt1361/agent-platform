import type {
  Agent,
  AgentMemory,
  ApiResponse,
  Conversation,
  ConversationMemorySnapshot,
  Execution,
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeRetrievalItem,
  LlmProvider,
  ProviderTestResult,
  RunAgentResult,
  Skill,
  TraceStep,
} from '../types/api';
import { buildApiUrl } from './http';

async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const url = buildApiUrl(path);
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const response = await fetch(url, {
    headers: isFormData ? { ...(init?.headers ?? {}) } : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const data = (await response.json()) as ApiResponse<T> & { error?: { message: string } };
  if (!response.ok || !data.success) {
    throw new Error(data.error?.message ?? 'Request failed');
  }
  return data.data;
}

type StreamEventHandler = (payload: unknown) => void;

async function requestEventStream(
  path: string,
  init: RequestInit & { signal?: AbortSignal },
  handlers: Record<string, StreamEventHandler | undefined>,
) {
  const url = buildApiUrl(path);
  const response = await fetch(url, {
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = (await response.json()) as ApiResponse<unknown> & { error?: { message?: string } };
      message = data.error?.message ?? message;
    } catch {
      // ignore json parse failure
    }
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error('Streaming response is not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processChunk = (chunk: string) => {
    buffer += chunk;

    while (buffer.includes('\n\n')) {
      const boundaryIndex = buffer.indexOf('\n\n');
      const rawEvent = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      const lines = rawEvent.split('\n');
      let eventName = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) continue;

      const payloadText = dataLines.join('\n');
      let payload: unknown = payloadText;
      try {
        payload = JSON.parse(payloadText);
      } catch {
        // keep raw text payload
      }

      handlers[eventName]?.(payload);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      processChunk(decoder.decode());
      break;
    }

    processChunk(decoder.decode(value, { stream: true }));
  }
}

export const api = {
  listAgents: () => request<Agent[]>('/api/v1/agents'),
  getAgent: (agentId: string) => request<Agent>(`/api/v1/agents/${agentId}`),
  createAgent: (payload: Record<string, unknown>) =>
    request<Agent>('/api/v1/agents', { method: 'POST', body: JSON.stringify(payload) }),
  updateAgent: (agentId: string, payload: Record<string, unknown>) =>
    request<Agent>(`/api/v1/agents/${agentId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateAgentStatus: (agentId: string, status: 'draft' | 'active' | 'archived') =>
    request<Agent>(`/api/v1/agents/${agentId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteAgent: (agentId: string) => request<Agent>(`/api/v1/agents/${agentId}`, { method: 'DELETE' }),
  runAgent: (agentId: string, input: string, conversationId?: string, conversationTitle?: string, signal?: AbortSignal) =>
    request<RunAgentResult>(`/api/v1/agents/${agentId}/run`, {
      method: 'POST',
      body: JSON.stringify({ input, conversationId, conversationTitle }),
      signal,
    }),
  runAgentStream: (
    agentId: string,
    input: string,
    conversationId: string | undefined,
    conversationTitle: string | undefined,
    signal: AbortSignal | undefined,
    handlers: Record<string, StreamEventHandler | undefined>,
  ) =>
    requestEventStream(
      `/api/v1/agents/${agentId}/run/stream`,
      {
        method: 'POST',
        body: JSON.stringify({ input, conversationId, conversationTitle }),
        signal,
      },
      handlers,
    ),
  listExecutions: (agentId: string) => request<Execution[]>(`/api/v1/agents/${agentId}/executions`),
  listConversations: (agentId: string) => request<Conversation[]>(`/api/v1/agents/${agentId}/conversations`),
  createConversation: (agentId: string, title?: string) =>
    request<Conversation>('/api/v1/conversations', { method: 'POST', body: JSON.stringify({ agentId, title }) }),
  renameConversation: (conversationId: string, title: string) =>
    request<Conversation>(`/api/v1/conversations/${conversationId}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteConversation: (conversationId: string) => request<Conversation>(`/api/v1/conversations/${conversationId}`, { method: 'DELETE' }),
  getConversation: (conversationId: string) => request<Conversation>(`/api/v1/conversations/${conversationId}`),
  getConversationMemory: (conversationId: string) => request<ConversationMemorySnapshot | null>(`/api/v1/conversations/${conversationId}/memory`),
  listSkills: () => request<Skill[]>('/api/v1/skills'),
  getSkill: (skillId: string) => request<Skill>(`/api/v1/skills/${skillId}`),
  listAvailableSkills: () => request<Skill[]>('/api/v1/skills/available'),
  createSkill: (payload: Record<string, unknown>) =>
    request<Skill>('/api/v1/skills', { method: 'POST', body: JSON.stringify(payload) }),
  updateSkillStatus: (skillId: string, status: 'active' | 'deprecated' | 'disabled') =>
    request<Skill>(`/api/v1/skills/${skillId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteSkill: (skillId: string) => request<Skill>(`/api/v1/skills/${skillId}`, { method: 'DELETE' }),
  listProviders: () => request<LlmProvider[]>('/api/v1/llm-providers'),
  testProvider: (providerId: string) => request<ProviderTestResult>(`/api/v1/llm-providers/${providerId}/test`, { method: 'POST' }),
  getTrace: (traceId: string) => request<{ execution: Execution; steps: TraceStep[]; retrievals: KnowledgeRetrievalItem[] }>(`/api/v1/traces/${traceId}`),
  listAgentMemories: (agentId: string) => request<AgentMemory[]>(`/api/v1/agents/${agentId}/memories`),
  updateAgentMemoryImportance: (agentId: string, memoryId: string, importance: number) =>
    request<AgentMemory>(`/api/v1/agents/${agentId}/memories/${memoryId}`, {
      method: 'PATCH',
      body: JSON.stringify({ importance }),
    }),
  deleteAgentMemory: (agentId: string, memoryId: string) => request<AgentMemory>(`/api/v1/agents/${agentId}/memories/${memoryId}`, { method: 'DELETE' }),
  listKnowledgeBases: () => request<KnowledgeBase[]>('/api/v1/knowledge/bases'),
  createKnowledgeBase: (payload: Record<string, unknown>) => request<KnowledgeBase>('/api/v1/knowledge/bases', { method: 'POST', body: JSON.stringify(payload) }),
  updateKnowledgeBase: (knowledgeBaseId: string, payload: Record<string, unknown>) =>
    request<KnowledgeBase>(`/api/v1/knowledge/bases/${knowledgeBaseId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteKnowledgeBase: (knowledgeBaseId: string) => request<KnowledgeBase>(`/api/v1/knowledge/bases/${knowledgeBaseId}`, { method: 'DELETE' }),
  listKnowledgeDocuments: (knowledgeBaseId: string) => request<KnowledgeDocument[]>(`/api/v1/knowledge/bases/${knowledgeBaseId}/documents`),
  createManualKnowledgeDocument: (knowledgeBaseId: string, payload: Record<string, unknown>) =>
    request<KnowledgeDocument>(`/api/v1/knowledge/bases/${knowledgeBaseId}/documents/manual`, { method: 'POST', body: JSON.stringify(payload) }),
  createUrlKnowledgeDocument: (knowledgeBaseId: string, payload: Record<string, unknown>) =>
    request<KnowledgeDocument>(`/api/v1/knowledge/bases/${knowledgeBaseId}/documents/url`, { method: 'POST', body: JSON.stringify(payload) }),
  uploadKnowledgeDocument: (knowledgeBaseId: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<KnowledgeDocument>(`/api/v1/knowledge/bases/${knowledgeBaseId}/documents/upload`, { method: 'POST', body });
  },
  getKnowledgeDocument: (documentId: string) => request<KnowledgeDocument>(`/api/v1/knowledge/documents/${documentId}`),
  getKnowledgeDocumentDownload: (documentId: string) => request<{ fileName?: string | null; url: string }>(`/api/v1/knowledge/documents/${documentId}/download`),
  deleteKnowledgeDocument: (documentId: string) => request<KnowledgeDocument>(`/api/v1/knowledge/documents/${documentId}`, { method: 'DELETE' }),
  retrieveKnowledge: (query: string, limit?: number) => request<KnowledgeRetrievalItem[]>('/api/v1/knowledge/retrieve', { method: 'POST', body: JSON.stringify({ query, limit }) }),
};
