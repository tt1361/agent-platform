'use client';

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Input, message, Modal, Space, Spin, Tag } from 'antd';
import { api } from '../../../services/api';
import type {
  Agent,
  AgentMemory,
  Conversation,
  ConversationMemorySnapshot,
  KnowledgeRetrievalItem,
  LlmModelCatalogItem,
  LlmProvider,
  MemoryUpdateItem,
  ProviderTestResult,
  RunAgentResult,
  Skill,
  TraceStep,
} from '../../../types/api';
import { PageHeader } from '../../../shared/components/PageHeader';

function normalizeConversation(conversation: Conversation): Conversation {
  return {
    ...conversation,
    executions: Array.isArray(conversation.executions) ? conversation.executions : [],
  };
}

const ConversationSidebar = lazy(() =>
  import('../components/ConversationSidebar').then((module) => ({ default: module.ConversationSidebar })),
);
const ChatPanel = lazy(() => import('../components/ChatPanel').then((module) => ({ default: module.ChatPanel })));
const ExecutionInspector = lazy(() =>
  import('../components/ExecutionInspector').then((module) => ({ default: module.ExecutionInspector })),
);

function WorkspaceSectionFallback({ title }: { title: string }) {
  return (
    <Card className="console-card">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <strong>{title}</strong>
        <div className="workspace-fallback-panel">
          <Spin size="large" />
          <span>模块加载中...</span>
        </div>
      </Space>
    </Card>
  );
}

interface WorkspacePageProps {
  initialAgents?: Agent[];
  initialSkills?: Skill[];
  initialProviders?: LlmProvider[];
  initialConversations?: Conversation[];
  initialStatusText?: string;
}

export function WorkspacePage({ initialAgents = [], initialSkills = [], initialProviders = [], initialConversations = [], initialStatusText = '正在加载基础数据...' }: WorkspacePageProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [providers, setProviders] = useState<LlmProvider[]>(initialProviders);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [traceId, setTraceId] = useState('');
  const [traceStepsMap, setTraceStepsMap] = useState<Record<string, TraceStep[]>>({});
  const [conversationMemory, setConversationMemory] = useState<ConversationMemorySnapshot | null>(null);
  const [agentMemories, setAgentMemories] = useState<AgentMemory[]>([]);
  const [recentMemoryUpdates, setRecentMemoryUpdates] = useState<MemoryUpdateItem[]>([]);
  const [knowledgeRetrievals, setKnowledgeRetrievals] = useState<KnowledgeRetrievalItem[]>([]);
  const [citedKnowledgeRetrievals, setCitedKnowledgeRetrievals] = useState<KnowledgeRetrievalItem[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [providerTest, setProviderTest] = useState<ProviderTestResult | null>(null);
  const [providerModelsMap, setProviderModelsMap] = useState<Record<string, LlmModelCatalogItem[]>>({});
  const [sessionProviderId, setSessionProviderId] = useState('');
  const [sessionModelKey, setSessionModelKey] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [pendingInput, setPendingInput] = useState('');
  const [interruptedInput, setInterruptedInput] = useState('');
  const [replyLanguage, setReplyLanguage] = useState<'中文' | 'English'>('中文');
  const [lastError, setLastError] = useState('');
  const [lastFailedInput, setLastFailedInput] = useState('');
  const [statusText, setStatusText] = useState(initialStatusText);
  const [pending, setPending] = useState(false);
  const [testingProvider, setTestingProvider] = useState(false);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameConversationId, setRenameConversationId] = useState('');
  const [renameTitle, setRenameTitle] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId), [agents, selectedAgentId]);
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId),
    [conversations, selectedConversationId],
  );
  const currentExecution = useMemo(
    () => {
      const executions = selectedConversation?.executions ?? [];
      return executions[executions.length - 1];
    },
    [selectedConversation],
  );
  const activeModelSelectionKey = useMemo(() => {
    if (!sessionProviderId) return '';
    return `${sessionProviderId}::${sessionModelKey || ''}`;
  }, [sessionProviderId, sessionModelKey]);
  const sessionModelOptions = useMemo(() => {
    const options: Array<{ value: string; label: string; providerId: string; modelKey: string }> = [];
    providers.forEach((provider) => {
      const providerModels = providerModelsMap[provider.id] ?? [];
      if (providerModels.length === 0) {
        const fallbackModel = provider.defaultModel || provider.model;
        if (fallbackModel) {
          options.push({
            value: `${provider.id}::${fallbackModel}`,
            label: `${provider.name} · ${fallbackModel}`,
            providerId: provider.id,
            modelKey: fallbackModel,
          });
        }
        return;
      }
      providerModels.forEach((item) => {
        options.push({
          value: `${provider.id}::${item.modelKey}`,
          label: `${provider.name} · ${item.displayName || item.modelKey}`,
          providerId: provider.id,
          modelKey: item.modelKey,
        });
      });
    });
    return options;
  }, [providers, providerModelsMap]);
  const currentModelLabel = useMemo(() => {
    const option = sessionModelOptions.find((item) => item.value === activeModelSelectionKey);
    if (option) {
      return option.label;
    }
    const provider = providers.find((item) => item.id === sessionProviderId)
      ?? providers.find((item) => item.id === selectedAgent?.llmProviderId);
    if (!provider) {
      return '默认模型';
    }
    return `${provider.name} · ${sessionModelKey || provider.defaultModel || provider.model}`;
  }, [sessionModelOptions, activeModelSelectionKey, providers, sessionProviderId, selectedAgent, sessionModelKey]);

  function decorateInput(inputValue: string) {
    if (replyLanguage === 'English') {
      return `${inputValue}\n\nPlease answer in English.`;
    }
    return inputValue;
  }

  async function ensureProviderModels(providerId: string) {
    if (!providerId) return [];
    const existing = providerModelsMap[providerId];
    if (existing && existing.length > 0) {
      return existing;
    }
    const items = await api.listProviderModels(providerId);
    setProviderModelsMap((current) => ({ ...current, [providerId]: items }));
    return items;
  }

  async function applySessionModelSelection(providerId: string, preferredModelKey?: string | null) {
    if (!providerId) return;
    const models = await ensureProviderModels(providerId);
    const provider = providers.find((item) => item.id === providerId);
    const fallbackModel = preferredModelKey
      || provider?.defaultModel
      || provider?.model
      || models[0]?.modelKey
      || '';
    const matched = models.find((item) => item.modelKey === fallbackModel);
    setSessionProviderId(providerId);
    setSessionModelKey((matched?.modelKey || fallbackModel || '').trim());
  }

  async function executeAgentRun(inputValue: string) {
    if (!selectedAgentId || !inputValue.trim()) return;

    const nextInput = inputValue.trim();

    setPending(true);
    setPendingInput(nextInput);
    setInterruptedInput('');
    setTaskInput('');
    setTraceStepsMap({});
    setKnowledgeRetrievals([]);
    setCitedKnowledgeRetrievals([]);
    setStreamingAnswer('');
    setStatusText(`智能体正在分析上下文并生成${replyLanguage === 'English' ? '英文' : '中文'}回答...`);
    abortControllerRef.current = new AbortController();

    try {
      let streamedResult: RunAgentResult | null = null;
      let streamedFailureMessage = '';

      await api.runAgentStream(
        selectedAgentId,
        decorateInput(nextInput),
        {
          conversationId: selectedConversationId || undefined,
          conversationTitle: nextInput.slice(0, 20),
          providerId: sessionProviderId || selectedAgent?.llmProviderId,
          modelKey: sessionModelKey || undefined,
          attachments: [],
        },
        abortControllerRef.current.signal,
        {
          status: (payload) => {
            const data = payload as { traceId?: string; conversationId?: string };
            if (data.traceId) setTraceId(data.traceId);
            if (data.conversationId) setSelectedConversationId(data.conversationId);
            setStatusText('智能体正在执行中...');
          },
          retrievals: (payload) => {
            const data = payload as { items?: KnowledgeRetrievalItem[] };
            setKnowledgeRetrievals(data.items ?? []);
            if ((data.items ?? []).length > 0) {
              setStatusText(`已检索到 ${data.items?.length ?? 0} 条相关知识，继续推理中...`);
            }
          },
          trace_step: (payload) => {
            const data = payload as { step?: TraceStep & { traceId?: string } };
            const incomingStep = data.step;
            if (!incomingStep || !incomingStep.traceId) return;
            setTraceStepsMap((current) => {
              const traceId = incomingStep.traceId!;
              const existing = current[traceId] || [];
              const next = existing.filter((item) => item.stepIndex !== incomingStep.stepIndex || item.stepType !== incomingStep.stepType);
              return { ...current, [traceId]: [...next, incomingStep].sort((left, right) => left.stepIndex - right.stepIndex) };
            });
            setTraceId(incomingStep.traceId);
            setStatusText(`执行中：${incomingStep.stepType}`);
          },
          answer_start: () => {
            setStatusText('正在生成回答...');
          },
          completed: (payload) => {
            streamedResult = (payload as { result: RunAgentResult }).result;
          },
          failed: (payload) => {
            const data = payload as { error?: { message?: string } };
            if (data.error?.message) {
              streamedFailureMessage = data.error.message;
              setStatusText(data.error.message);
            }
          },
          server_error: (payload) => {
            const data = payload as { message?: string };
            if (data.message) {
              setStatusText(data.message);
            }
          },
        },
      );

      if (!streamedResult) {
        throw new Error(streamedFailureMessage || '未收到执行结果');
      }

      const result = streamedResult as RunAgentResult;
      const [conversation, trace, shortMemory, longMemories] = await Promise.all([
        api.getConversation(result.conversationId),
        api.getTrace(result.traceId),
        api.getConversationMemory(result.conversationId),
        api.listAgentMemories(selectedAgentId),
      ]);
      setPendingInput('');
      setInterruptedInput('');
      setLastError('');
      setLastFailedInput('');
      setStreamingAnswer(result.output || '');
      setTraceId(result.traceId);
      setTraceStepsMap((current) => ({ ...current, [result.traceId]: trace.steps }));
      setConversationMemory(shortMemory);
      setAgentMemories(longMemories);
      setRecentMemoryUpdates(result.memoryUpdate?.updatedLongTermMemories ?? []);
      setKnowledgeRetrievals(result.knowledgeRetrievals ?? []);
      setCitedKnowledgeRetrievals(result.citedKnowledgeRetrievals ?? trace.citedRetrievals ?? []);
      setSelectedConversationId(result.conversationId);
      setConversations((current) => {
        const normalizedConversation = normalizeConversation(conversation);
        const rest = current.filter((item) => item.id !== normalizedConversation.id);
        return [normalizedConversation, ...rest];
      });
      setStatusText('本轮会话执行完成');
      if (result.providerId) {
        setSessionProviderId(result.providerId);
      }
      if (result.modelKey) {
        setSessionModelKey(result.modelKey);
      }
      if (result.memoryUpdate?.updatedLongTermMemories?.length) {
        message.success(`消息发送成功，并更新了 ${result.memoryUpdate.updatedLongTermMemories.length} 条长期记忆`);
      } else {
        message.success('消息发送成功');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setLastError('');
        setLastFailedInput(nextInput);
        setStreamingAnswer('');
        return;
      }
      const nextMessage = error instanceof Error ? error.message : '执行失败';
      setLastError(nextMessage);
      setLastFailedInput(nextInput);
      setStatusText(nextMessage);
      message.error(nextMessage);
    } finally {
      setPendingInput('');
      setStreamingAnswer('');
      setPending(false);
      abortControllerRef.current = null;
    }
  }

  function scrollToPanel(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleSelectModel(selectionValue: string) {
    const [providerId, modelKey] = String(selectionValue).split('::');
    if (!providerId) return;
    await applySessionModelSelection(providerId, modelKey || undefined);
    const provider = providers.find((item) => item.id === providerId);
    setStatusText(`已切换会话模型为 ${provider?.name || '模型厂商'} / ${modelKey || provider?.defaultModel || provider?.model || '-'}`);
    message.success(`已切换到 ${provider?.name || '模型厂商'} / ${modelKey || provider?.defaultModel || provider?.model || '-'}`);
  }

  async function refreshBaseData() {
    const [agentList, skillList, providerList] = await Promise.all([api.listAgents(), api.listSkills(), api.listProviders()]);
    setAgents(agentList);
    setSkills(skillList);
    setProviders(providerList);
    if (!selectedAgentId && agentList[0]) setSelectedAgentId(agentList[0].id);
  }

  async function refreshConversations(agentId: string, preferredConversationId?: string) {
    const items = await api.listConversations(agentId);
    setConversations(items);
    const nextId = preferredConversationId ?? selectedConversationId;
    const matched = items.find((item) => item.id === nextId);
    if (matched) {
      setSelectedConversationId(matched.id);
      return matched;
    }
    if (items[0]) {
      setSelectedConversationId(items[0].id);
      return items[0];
    }
    setSelectedConversationId('');
    return undefined;
  }

  useEffect(() => {
    if (initialAgents.length === 0) {
      void refreshBaseData()
        .then(() => setStatusText('基础数据已加载'))
        .catch((error: Error) => setStatusText(error.message));
    } else if (initialAgents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(initialAgents[0].id);
      setStatusText('基础数据已加载');
    }
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    const agent = agents.find((item) => item.id === selectedAgentId);
    if (agent?.llmProviderId) {
      void applySessionModelSelection(agent.llmProviderId, null).catch(() => {
        // ignore model preload errors to avoid blocking workspace
      });
    }
    void refreshConversations(selectedAgentId).catch((error: Error) => setStatusText(error.message));
    void api.listAgentMemories(selectedAgentId)
      .then(setAgentMemories)
      .catch((error: Error) => setStatusText(error.message));
  }, [selectedAgentId, agents]);

  useEffect(() => {
    if (!selectedConversationId) return;
    setInterruptedInput('');
    setLastError('');
    setLastFailedInput('');
    setRecentMemoryUpdates([]);
    setStreamingAnswer('');
    void Promise.all([api.getConversation(selectedConversationId), api.getConversationMemory(selectedConversationId)])
      .then(async ([conversation, memory]) => {
        const normalizedConversation = normalizeConversation(conversation);
        setConversations((current) => current.map((item) => (item.id === normalizedConversation.id ? normalizedConversation : item)));
        setConversationMemory(memory);
        const newTraceStepsMap: Record<string, TraceStep[]> = {};
        const tracesToFetch = normalizedConversation.executions
          .filter((exec) => exec.traceId)
          .map((exec) => exec.traceId!);
        
        if (tracesToFetch.length > 0) {
          const traces = await Promise.all(tracesToFetch.map((traceId) => api.getTrace(traceId)));
          normalizedConversation.executions.forEach((exec, index) => {
            if (exec.traceId && traces[index]) {
              newTraceStepsMap[exec.traceId] = traces[index].steps ?? [];
            }
          });
          const latestExecution = normalizedConversation.executions[normalizedConversation.executions.length - 1];
          if (latestExecution?.providerId) {
            await applySessionModelSelection(latestExecution.providerId, latestExecution.modelKey || null);
          }
          if (latestExecution?.traceId) {
            const latestTrace = traces.find((t) => t) ?? { retrievals: [], citedRetrievals: [] };
            setKnowledgeRetrievals(latestTrace.retrievals ?? []);
            setCitedKnowledgeRetrievals(latestTrace.citedRetrievals ?? []);
          }
        } else {
          setKnowledgeRetrievals([]);
          setCitedKnowledgeRetrievals([]);
          if (selectedAgent?.llmProviderId) {
            await applySessionModelSelection(selectedAgent.llmProviderId, null);
          }
        }
        setTraceStepsMap(newTraceStepsMap);
      })
      .catch((error: Error) => setStatusText(error.message));
  }, [selectedConversationId, selectedAgent?.llmProviderId]);

  async function handleCreateConversation() {
    const fallbackAgentId = selectedAgentId || selectedAgent?.id || conversations[0]?.agentId || agents[0]?.id || '';

    if (!fallbackAgentId) {
      setStatusText('请先选择一个智能体，再创建会话');
      message.warning('请先选择一个智能体');
      return;
    }

    try {
      let conversation: Conversation;

      try {
        conversation = await api.createConversation(fallbackAgentId, `新会话 ${conversations.length + 1}`);
      } catch (error) {
        const nextMessage = error instanceof Error ? error.message : '创建会话失败';
        if (nextMessage !== 'Invalid request body' || !agents[0]?.id || agents[0].id === fallbackAgentId) {
          throw error;
        }

        conversation = await api.createConversation(agents[0].id, `新会话 ${conversations.length + 1}`);
      }

      const normalizedConversation = normalizeConversation(conversation);
      setConversations((current) => [normalizedConversation, ...current.filter((item) => item.id !== normalizedConversation.id)]);
      setSelectedConversationId(normalizedConversation.id);
      setSelectedAgentId(normalizedConversation.agentId);
      setTaskInput('');
      setConversationMemory(null);
      setRecentMemoryUpdates([]);
      setKnowledgeRetrievals([]);
      setCitedKnowledgeRetrievals([]);
      setTraceId('');
      setTraceStepsMap({});
      setInterruptedInput('');
      setLastError('');
      setLastFailedInput('');
      await refreshConversations(normalizedConversation.agentId, normalizedConversation.id);
      setStatusText('已创建新会话');
      message.success('新会话已创建');
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : '创建会话失败';
      setStatusText(nextMessage);
      message.error(nextMessage);
    }
  }

  async function handleRenameConversation(conversationId: string) {
    const current = conversations.find((item) => item.id === conversationId);
    setRenameConversationId(conversationId);
    setRenameTitle(current?.title || '');
    setRenameModalOpen(true);
  }

  async function handleConfirmRenameConversation() {
    if (!renameConversationId || !renameTitle.trim()) return;
    await api.renameConversation(renameConversationId, renameTitle.trim());
    if (selectedAgentId) await refreshConversations(selectedAgentId, renameConversationId);
    setStatusText('会话已重命名');
    setRenameModalOpen(false);
    setRenameConversationId('');
    setRenameTitle('');
    message.success('会话名称已更新');
  }

  async function handleDeleteConversation(conversationId: string) {
    Modal.confirm({
      title: '删除会话',
      content: '删除后将一并清理该会话的执行记录与 Trace，不可恢复。',
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await api.deleteConversation(conversationId);
        if (selectedConversationId === conversationId) {
          setSelectedConversationId('');
          setTraceId('');
          setTraceStepsMap({});
          setInterruptedInput('');
          setKnowledgeRetrievals([]);
          setCitedKnowledgeRetrievals([]);
        }
        if (selectedAgentId) await refreshConversations(selectedAgentId);
        setStatusText('会话已删除');
        message.success('会话已删除');
      },
    });
  }

  async function handleRunAgent() {
    await executeAgentRun(taskInput);
  }

  async function handleRunAgentWithInput(value: string) {
    await executeAgentRun(value);
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setPending(false);
      setPendingInput('');
      setInterruptedInput(pendingInput);
      setStatusText('已停止执行');
      message.info('已停止执行');
    }
  }

  async function handleSelectTrace(nextTraceId: string) {
    setTraceId(nextTraceId);
    const trace = await api.getTrace(nextTraceId);
    setTraceStepsMap((current) => ({ ...current, [nextTraceId]: trace.steps }));
    setKnowledgeRetrievals(trace.retrievals ?? []);
    setCitedKnowledgeRetrievals(trace.citedRetrievals ?? []);
    setTimeout(() => {
      const traceCard = document.getElementById('trace-content-card');
      if (traceCard) {
        traceCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  function handleRetryExecution(inputText: string) {
    setTaskInput(inputText);
    setInterruptedInput('');
    setLastError('');
    setStatusText('已回填失败消息，可以直接重新发送。');
  }

  function handleQuickPrompt(prompt: string) {
    setTaskInput(prompt);
    setInterruptedInput('');
    setLastError('');
    setStatusText('已填入建议问题，可以直接发送。');
  }

  async function handleProviderQuickTest() {
    const targetProvider =
      providers.find((item) => item.id === sessionProviderId) ??
      providers.find((item) => item.id === selectedAgent?.llmProviderId) ??
      providers.find((item) => item.providerKey.includes('qwen')) ??
      providers.find((item) => item.providerKey.includes('minimax')) ??
      providers.find((item) => item.status === 'active') ??
      providers[0];

    if (!targetProvider) {
      message.warning('当前没有可测试的模型提供商');
      return;
    }

    setTestingProvider(true);
    try {
      const result = await api.testProvider(targetProvider.id, {
        modelKey: sessionModelKey || targetProvider.defaultModel || targetProvider.model,
      });
      setProviderTest(result);
      setStatusText(`模型连通测试：${result.status}`);
      message.success(`模型测试完成：${targetProvider.name} / ${result.model}`);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : '模型测试失败';
      setStatusText(nextMessage);
      message.error(nextMessage);
    } finally {
      setTestingProvider(false);
    }
  }

  async function handlePinMemory(memoryId: string, importance: number) {
    if (!selectedAgentId) return;
    await api.updateAgentMemoryImportance(selectedAgentId, memoryId, importance);
    const longMemories = await api.listAgentMemories(selectedAgentId);
    setAgentMemories(longMemories);
    message.success('长期记忆重要度已更新');
  }

  async function handleDeleteMemory(memoryId: string) {
    if (!selectedAgentId) return;
    await api.deleteAgentMemory(selectedAgentId, memoryId);
    const longMemories = await api.listAgentMemories(selectedAgentId);
    setAgentMemories(longMemories);
    setRecentMemoryUpdates((current) => current.filter((item) => item.id !== memoryId));
    message.success('长期记忆已删除');
  }

  return (
    <div>
      <PageHeader
        title="会话工作台"
        description={statusText}
        actions={
          <Space>
            {providerTest ? <Tag color="cyan">最近测试：{providerTest.status}</Tag> : null}
            <Button className="soft-action-button" loading={testingProvider} onClick={() => void handleProviderQuickTest()}>
              快速测试模型
            </Button>
          </Space>
        }
      />

      <div className="workspace-grid">
        <Suspense fallback={<WorkspaceSectionFallback title="会话导航" />}>
          <ConversationSidebar
            agents={agents}
            selectedAgentId={selectedAgentId}
            canCreateConversation={Boolean(selectedAgentId || selectedAgent?.id || conversations[0]?.agentId || agents[0]?.id)}
            onSelectAgent={setSelectedAgentId}
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelectConversation={setSelectedConversationId}
            onCreateConversation={() => void handleCreateConversation()}
            onRenameConversation={(id) => void handleRenameConversation(id)}
            onDeleteConversation={(id) => void handleDeleteConversation(id)}
          />
        </Suspense>

        <Suspense fallback={<WorkspaceSectionFallback title="会话面板" />}>
          <ChatPanel
            conversation={selectedConversation}
            input={taskInput}
            currentExecutionId={currentExecution?.id}
            knowledgeRetrievals={citedKnowledgeRetrievals}
            modelLabel={currentModelLabel}
            languageLabel={replyLanguage}
            modelOptions={sessionModelOptions.map((option) => ({ value: option.value, label: option.label }))}
            activeModelId={activeModelSelectionKey}
            onInputChange={setTaskInput}
            onSubmit={() => void handleRunAgent()}
            onSubmitWithInput={(value) => void handleRunAgentWithInput(value)}
            onToggleLanguage={() => setReplyLanguage((current) => (current === '中文' ? 'English' : '中文'))}
            onSelectModel={(selectionValue) => void handleSelectModel(selectionValue)}
            onStop={handleStop}
            onOpenContext={() => scrollToPanel('memory-overview-card')}
            onOpenSkills={() => scrollToPanel('bound-skills-card')}
            onOpenKnowledge={() => scrollToPanel('knowledge-retrieval-card')}
            onRetryExecution={handleRetryExecution}
            pending={pending}
            pendingInput={pendingInput}
            interruptedInput={interruptedInput}
            errorMessage={lastError}
            lastFailedInput={lastFailedInput}
            onQuickPrompt={handleQuickPrompt}
            traceStepsMap={traceStepsMap}
            streamingAnswer={streamingAnswer}
          />
        </Suspense>

        <Suspense fallback={<WorkspaceSectionFallback title="执行检查器" />}>
          <ExecutionInspector
          agent={selectedAgent}
          skills={skills}
          traceId={traceId}
          traceStepsMap={traceStepsMap}
          currentExecution={currentExecution}
          providerTest={providerTest}
          conversationMemory={conversationMemory}
          agentMemories={agentMemories}
          recentMemoryUpdates={recentMemoryUpdates}
          knowledgeRetrievals={knowledgeRetrievals}
          citedKnowledgeRetrievals={citedKnowledgeRetrievals}
            onPinMemory={(memoryId, importance) => void handlePinMemory(memoryId, importance)}
            onDeleteMemory={(memoryId) => void handleDeleteMemory(memoryId)}
          />
        </Suspense>
      </div>

      <Modal
        title="重命名会话"
        open={renameModalOpen}
        okText="保存"
        cancelText="取消"
        onOk={() => void handleConfirmRenameConversation()}
        onCancel={() => {
          setRenameModalOpen(false);
          setRenameConversationId('');
          setRenameTitle('');
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <span>请输入更清晰的会话名称，便于后续检索与回顾。</span>
          <Input value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} maxLength={255} placeholder="例如：产品体验打磨讨论" />
        </Space>
      </Modal>
    </div>
  );
}
