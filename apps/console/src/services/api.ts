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
  SkillSecret,
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

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = (await response.json()) as
      | ApiResponse<unknown>
      | { success?: boolean; error?: { message?: string }; data?: unknown; type?: string };
    const jsonAny = json as any;

    if ('success' in json && json.success === false) {
      throw new Error(jsonAny.error?.message ?? 'Request failed');
    }

    const envelopeData = (json as { data?: unknown }).data;
    const eventName =
      (envelopeData as { type?: string } | undefined)?.type ??
      (json as { type?: string }).type ??
      'completed';
    const eventPayload =
      (envelopeData as { data?: unknown } | undefined)?.data ??
      envelopeData ??
      json;

    handlers[eventName]?.(eventPayload);
    return;
  }

  if (!response.body) {
    throw new Error('Streaming response is not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatchRawEvent = (rawEvent: string) => {
    const lines = rawEvent.split('\n');
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const text = line.slice(5).trim();
        if (text) dataLines.push(text);
      }
    }

    if (dataLines.length === 0) return;

    const payloadText = dataLines.join('\n');
    let payload: any = null;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      // ignore
      return;
    }

    if (!payload || !payload.type) return;

    // Map AG-UI events back to our legacy handlers so the UI doesn't break
    switch (payload.type) {
      case 'CUSTOM':
        if (payload.customEvent === 'run_status') {
          handlers['status']?.(payload.payload);
        } else if (payload.customEvent === 'run_retrievals') {
          handlers['retrievals']?.(payload.payload);
        } else if (payload.customEvent === 'trace_step') {
          handlers['trace_step']?.({ step: payload.payload });
        } else if (payload.customEvent === 'run_completed') {
          handlers['completed']?.(payload.payload);
        }
        break;
      case 'TEXT_MESSAGE_START':
        handlers['answer_start']?.(payload);
        break;
      case 'TEXT_MESSAGE_CONTENT':
        handlers['trace_step']?.({ step: { stepType: 'final_answer', content: payload.delta || payload.content } });
        break;
      case 'RUN_ERROR':
        handlers['failed']?.({ error: { message: payload.message } });
        break;
      // We mapped reasoning/tools to trace_step via CUSTOM to preserve UI compat for now.
    }
  };

  const processChunk = (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    while (buffer.includes('\n\n')) {
      const boundaryIndex = buffer.indexOf('\n\n');
      const rawEvent = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);
      dispatchRawEvent(rawEvent);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      processChunk(decoder.decode());
      if (buffer.trim()) {
        dispatchRawEvent(buffer.trim());
      }
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
  getSkillSecret: (skillId: string) => request<SkillSecret>(`/api/v1/skills/${skillId}/secret`),
  updateSkillSecret: (skillId: string, secrets: Record<string, string>) =>
    request<SkillSecret>(`/api/v1/skills/${skillId}/secret`, { method: 'PUT', body: JSON.stringify({ secrets }) }),
  deleteSkillSecret: (skillId: string) => request<SkillSecret>(`/api/v1/skills/${skillId}/secret`, { method: 'DELETE' }),
  deleteSkill: (skillId: string) => request<Skill>(`/api/v1/skills/${skillId}`, { method: 'DELETE' }),
  listProviders: () => request<LlmProvider[]>('/api/v1/llm-providers'),
  testProvider: (providerId: string) => request<ProviderTestResult>(`/api/v1/llm-providers/${providerId}/test`, { method: 'POST' }),
  getTrace: (traceId: string) => request<{ execution: Execution; steps: TraceStep[]; retrievals: KnowledgeRetrievalItem[]; citedRetrievals: KnowledgeRetrievalItem[] }>(`/api/v1/traces/${traceId}`),
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
