export interface Agent {
  id: string;
  name: string;
  description?: string | null;
  status: 'draft' | 'active' | 'archived';
  llmProviderId: string;
  systemPrompt?: string | null;
  maxSteps: number;
  timeoutMs: number;
  temperature?: number | null;
  topP?: number | null;
  skillIds?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface Skill {
  id?: string;
  skillKey: string;
  name: string;
  version: string;
  description?: string | null;
  executorKey?: string | null;
  status?: 'active' | 'deprecated' | 'disabled';
  tags?: string[] | null;
  parametersSchema?: Record<string, unknown> | null;
  returnsSchema?: Record<string, unknown> | null;
  timeoutMs?: number | null;
  retryPolicy?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LlmProvider {
  id: string;
  providerKey: string;
  name: string;
  model: string;
  status: string;
}

export interface Execution {
  id: string;
  traceId: string;
  status: string;
  outputText?: string | null;
  inputText: string;
  conversationId?: string | null;
  createdAt?: string;
}

export interface TraceStep {
  id: string;
  stepIndex: number;
  stepType: string;
  content: string;
  toolName?: string | null;
}

export interface Conversation {
  id: string;
  agentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  executions: Execution[];
}

export interface ConversationMemorySnapshot {
  id: string;
  conversationId: string;
  summary: string;
  keyFacts?: string[] | null;
  openTasks?: string[] | null;
  userPreferences?: string[] | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMemory {
  id: string;
  agentId: string;
  memoryType: 'preference' | 'fact' | 'goal' | 'summary';
  content: string;
  importance: number;
  sourceConversationId?: string | null;
  lastAccessedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryUpdateItem {
  id: string;
  memoryType: 'preference' | 'fact' | 'goal' | 'summary';
  content: string;
  importance: number;
  changeType: 'created' | 'updated';
  reason?: string;
}

export interface RunAgentResult {
  executionId: string;
  traceId: string;
  conversationId: string;
  status: string;
  output: string;
  stepCount?: number;
  tokensUsed?: number;
  memoryUpdate?: {
    shortTermMemory: ConversationMemorySnapshot;
    updatedLongTermMemories: MemoryUpdateItem[];
  };
  knowledgeRetrievals?: KnowledgeRetrievalItem[];
  citedKnowledgeRetrievals?: KnowledgeRetrievalItem[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ProviderTestResult {
  status: string;
  model: string;
  contentPreview: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string | null;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  _count?: {
    documents: number;
  };
}

export interface KnowledgeChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  keywords?: string[] | null;
  tokenCount: number;
  charCount: number;
  createdAt: string;
}

export interface KnowledgeDocument {
  id: string;
  knowledgeBaseId: string;
  title: string;
  sourceType: 'upload' | 'manual' | 'url';
  sourceUri?: string | null;
  fileName?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  rawText?: string | null;
  status: 'processing' | 'ready' | 'failed';
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
  chunks?: KnowledgeChunk[];
  _count?: {
    chunks: number;
  };
}

export interface KnowledgeRetrievalItem {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  documentId: string;
  documentTitle: string;
  sourceType: 'upload' | 'manual' | 'url';
  sourceUri?: string | null;
  chunkId: string;
  chunkIndex: number;
  content: string;
  score: number;
  createdAt?: string;
}
