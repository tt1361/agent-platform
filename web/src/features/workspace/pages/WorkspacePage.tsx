import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Input, message, Modal, Space, Spin, Tag } from 'antd';
import { api } from '../../../services/api';
import type {
  Agent,
  AgentMemory,
    Conversation,
    ConversationMemorySnapshot,
    KnowledgeRetrievalItem,
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

export function WorkspacePage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [traceId, setTraceId] = useState('');
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [conversationMemory, setConversationMemory] = useState<ConversationMemorySnapshot | null>(null);
  const [agentMemories, setAgentMemories] = useState<AgentMemory[]>([]);
  const [recentMemoryUpdates, setRecentMemoryUpdates] = useState<MemoryUpdateItem[]>([]);
  const [knowledgeRetrievals, setKnowledgeRetrievals] = useState<KnowledgeRetrievalItem[]>([]);
  const [providerTest, setProviderTest] = useState<ProviderTestResult | null>(null);
  const [taskInput, setTaskInput] = useState('');
  const [pendingInput, setPendingInput] = useState('');
  const [interruptedInput, setInterruptedInput] = useState('');
  const [replyLanguage, setReplyLanguage] = useState<'中文' | 'English'>('中文');
  const [lastError, setLastError] = useState('');
  const [lastFailedInput, setLastFailedInput] = useState('');
  const [statusText, setStatusText] = useState('正在加载基础数据...');
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
  const currentModelLabel = useMemo(() => {
    const provider = providers.find((item) => item.id === selectedAgent?.llmProviderId);
    return provider?.model || provider?.name || '默认模型';
  }, [providers, selectedAgent]);

  function decorateInput(inputValue: string) {
    if (replyLanguage === 'English') {
      return `${inputValue}\n\nPlease answer in English.`;
    }
    return inputValue;
  }

  async function executeAgentRun(inputValue: string) {
    if (!selectedAgentId || !inputValue.trim()) return;

    const nextInput = inputValue.trim();

    setPending(true);
    setPendingInput(nextInput);
    setInterruptedInput('');
    setTaskInput('');
    setTraceSteps([]);
    setKnowledgeRetrievals([]);
    setStatusText(`智能体正在分析上下文并生成${replyLanguage === 'English' ? '英文' : '中文'}回答...`);
    abortControllerRef.current = new AbortController();

    try {
      let streamedResult: RunAgentResult | null = null;

      await api.runAgentStream(
        selectedAgentId,
        decorateInput(nextInput),
        selectedConversationId || undefined,
        nextInput.slice(0, 20),
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
            if (!incomingStep) return;
            setTraceSteps((current) => {
              const next = current.filter((item) => item.stepIndex !== incomingStep.stepIndex || item.stepType !== incomingStep.stepType);
              return [...next, incomingStep].sort((left, right) => left.stepIndex - right.stepIndex);
            });
            if (incomingStep.traceId) {
              setTraceId(incomingStep.traceId);
            }
            setStatusText(`执行中：${incomingStep.stepType}`);
          },
          completed: (payload) => {
            streamedResult = (payload as { result: RunAgentResult }).result;
          },
          failed: (payload) => {
            const data = payload as { error?: { message?: string } };
            if (data.error?.message) {
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
        throw new Error('未收到执行结果');
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
      setTraceId(result.traceId);
      setTraceSteps(trace.steps);
      setConversationMemory(shortMemory);
      setAgentMemories(longMemories);
      setRecentMemoryUpdates(result.memoryUpdate?.updatedLongTermMemories ?? []);
      setKnowledgeRetrievals(result.knowledgeRetrievals ?? []);
      setSelectedConversationId(result.conversationId);
      setConversations((current) => {
        const normalizedConversation = normalizeConversation(conversation);
        const rest = current.filter((item) => item.id !== normalizedConversation.id);
        return [normalizedConversation, ...rest];
      });
      setStatusText('本轮会话执行完成');
      if (result.memoryUpdate?.updatedLongTermMemories?.length) {
        message.success(`消息发送成功，并更新了 ${result.memoryUpdate.updatedLongTermMemories.length} 条长期记忆`);
      } else {
        message.success('消息发送成功');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setLastError('');
        setLastFailedInput(nextInput);
        return;
      }
      const nextMessage = error instanceof Error ? error.message : '执行失败';
      setLastError(nextMessage);
      setLastFailedInput(nextInput);
      setStatusText(nextMessage);
      message.error(nextMessage);
    } finally {
      setPendingInput('');
      setPending(false);
      abortControllerRef.current = null;
    }
  }

  function scrollToPanel(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleSelectModel(providerId: string) {
    if (!selectedAgent || selectedAgent.llmProviderId === providerId) return;
    const updatedAgent = await api.updateAgent(selectedAgent.id, { llmProviderId: providerId });
    setAgents((current) => current.map((item) => (item.id === updatedAgent.id ? { ...item, ...updatedAgent } : item)));
    const provider = providers.find((item) => item.id === providerId);
    setStatusText(`已切换模型为 ${provider?.model || provider?.name || '新模型'}`);
    message.success(`已切换到 ${provider?.model || provider?.name || '新模型'}`);
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
    void refreshBaseData()
      .then(() => setStatusText('基础数据已加载'))
      .catch((error: Error) => setStatusText(error.message));
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    void refreshConversations(selectedAgentId).catch((error: Error) => setStatusText(error.message));
    void api.listAgentMemories(selectedAgentId)
      .then(setAgentMemories)
      .catch((error: Error) => setStatusText(error.message));
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    setInterruptedInput('');
    setLastError('');
    setLastFailedInput('');
    setRecentMemoryUpdates([]);
    void Promise.all([api.getConversation(selectedConversationId), api.getConversationMemory(selectedConversationId)])
      .then(async ([conversation, memory]) => {
        const normalizedConversation = normalizeConversation(conversation);
        setConversations((current) => current.map((item) => (item.id === normalizedConversation.id ? normalizedConversation : item)));
        setConversationMemory(memory);
        const latestExecution = normalizedConversation.executions[normalizedConversation.executions.length - 1];
        if (latestExecution?.traceId) {
          const trace = await api.getTrace(latestExecution.traceId);
          setKnowledgeRetrievals(trace.retrievals ?? []);
        } else {
          setKnowledgeRetrievals([]);
        }
      })
      .catch((error: Error) => setStatusText(error.message));
  }, [selectedConversationId]);

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
      setTraceId('');
      setTraceSteps([]);
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
          setTraceSteps([]);
          setInterruptedInput('');
          setKnowledgeRetrievals([]);
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
    setTraceSteps(trace.steps);
    setKnowledgeRetrievals(trace.retrievals ?? []);
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
    if (!providers[0]) return;
    setTestingProvider(true);
    try {
      const result = await api.testProvider(providers[0].id);
      setProviderTest(result);
      setStatusText(`模型连通测试：${result.status}`);
      message.success(`模型测试完成：${result.model}`);
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
            knowledgeRetrievals={knowledgeRetrievals}
            modelLabel={currentModelLabel}
            languageLabel={replyLanguage}
            modelOptions={providers.map((provider) => ({ value: provider.id, label: `${provider.name} · ${provider.model}` }))}
            activeModelId={selectedAgent?.llmProviderId}
            onInputChange={setTaskInput}
            onSubmit={() => void handleRunAgent()}
            onSubmitWithInput={(value) => void handleRunAgentWithInput(value)}
            onToggleLanguage={() => setReplyLanguage((current) => (current === '中文' ? 'English' : '中文'))}
            onSelectModel={(providerId) => void handleSelectModel(providerId)}
            onStop={handleStop}
            onOpenContext={() => scrollToPanel('memory-overview-card')}
            onOpenSkills={() => scrollToPanel('bound-skills-card')}
            onOpenTrace={() => scrollToPanel('trace-content-card')}
            onOpenKnowledge={() => scrollToPanel('knowledge-retrieval-card')}
            onSelectTrace={(id) => void handleSelectTrace(id)}
            onRetryExecution={handleRetryExecution}
            pending={pending}
            pendingInput={pendingInput}
            interruptedInput={interruptedInput}
            errorMessage={lastError}
            lastFailedInput={lastFailedInput}
            onQuickPrompt={handleQuickPrompt}
          />
        </Suspense>

        <Suspense fallback={<WorkspaceSectionFallback title="执行检查器" />}>
          <ExecutionInspector
          agent={selectedAgent}
          skills={skills}
          traceId={traceId}
          traceSteps={traceSteps}
          currentExecution={currentExecution}
          providerTest={providerTest}
          conversationMemory={conversationMemory}
          agentMemories={agentMemories}
          recentMemoryUpdates={recentMemoryUpdates}
          knowledgeRetrievals={knowledgeRetrievals}
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
