import {
  AudioOutlined,
  CopyOutlined,
  DownOutlined,
  LoadingOutlined,
  PaperClipOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Collapse, Dropdown, Space, Tag, Typography, message } from 'antd';
import type { MenuProps } from 'antd';
import { Bubble, Sender, Attachments } from '@ant-design/x';
import type { BubbleListProps } from '@ant-design/x';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../services/api';
import type { Conversation, KnowledgeRetrievalItem, TraceStep } from '../../../types/api';

const { Text, Paragraph } = Typography;

interface ChatPanelProps {
  conversation?: Conversation;
  input: string;
  currentExecutionId?: string;
  knowledgeRetrievals: KnowledgeRetrievalItem[];
  traceStepsMap?: Record<string, TraceStep[]>;
  streamingAnswer?: string;
  modelLabel: string;
  languageLabel: '中文' | 'English';
  modelOptions: Array<{ label: string; value: string }>;
  activeModelId?: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSubmitWithInput?: (value: string) => void;
  onToggleLanguage: () => void;
  onSelectModel: (providerId: string) => void;
  onStop?: () => void;
  onOpenContext: () => void;
  onOpenKnowledge: () => void;
  onOpenSkills: () => void;
  onRetryExecution: (inputText: string) => void;
  pending: boolean;
  pendingInput?: string;
  interruptedInput?: string;
  errorMessage?: string;
  lastFailedInput?: string;
  onQuickPrompt: (prompt: string) => void;
}

const suggestedPrompts = [
  '帮我总结当前智能体平台 MVP 的核心能力。',
  '请列出产品体验下一步最值得优化的三个点。',
  '结合历史上下文继续细化执行记录页的改造建议。',
];

const thinkingMessages = [
  '正在结合历史上下文进行分析，请稍候...',
  '正在梳理已绑定技能与会话记忆...',
  '正在组织更清晰的回答结构...',
];

interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  kind: 'text' | 'file';
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remain).padStart(2, '0')}`;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    SpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

function formatMessageTime(value?: string) {
  if (!value) return '刚刚';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getExecutionStatusMeta(status: string) {
  switch (status) {
    case 'succeeded':
      return { label: '已完成', color: 'green' as const };
    case 'failed':
      return { label: '失败', color: 'red' as const };
    case 'timeout':
      return { label: '超时', color: 'orange' as const };
    case 'running':
      return { label: '进行中', color: 'blue' as const };
    default:
      return { label: status, color: 'default' as const };
  }
}

export function ChatPanel({
  conversation,
  input,
  currentExecutionId,
  knowledgeRetrievals,
  traceStepsMap,
  streamingAnswer,
  modelLabel,
  languageLabel,
  modelOptions,
  activeModelId,
  onInputChange,
  onSubmit,
  onSubmitWithInput,
  onToggleLanguage,
  onSelectModel,
  onStop,
  onOpenContext,
  onOpenKnowledge,
  onOpenSkills,
  onRetryExecution,
  pending,
  pendingInput,
  interruptedInput,
  errorMessage,
  lastFailedInput,
  onQuickPrompt,
}: ChatPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const latestInputRef = useRef(input);
  const voiceBaseInputRef = useRef('');
  const [thinkingIndex, setThinkingIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [displayedAnswer, setDisplayedAnswer] = useState('');

  useEffect(() => {
    if (!streamingAnswer) {
      setDisplayedAnswer('');
      return;
    }

    if (streamingAnswer.length <= displayedAnswer.length) {
      setDisplayedAnswer(streamingAnswer);
      return;
    }

    const timeout = setTimeout(() => {
      setDisplayedAnswer(streamingAnswer.slice(0, displayedAnswer.length + Math.ceil(streamingAnswer.length / 20)));
    }, 30);

    return () => clearTimeout(timeout);
  }, [streamingAnswer, displayedAnswer]);

  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);

  useEffect(() => {
    if (!pending) {
      setThinkingIndex(0);
    }
  }, [pending, conversation?.id]);

  useEffect(() => {
    if (pending) {
      setAttachments([]);
    }
  }, [pending]);

  useEffect(() => {
    if (!isListening) {
      setVoiceDuration(0);
      return;
    }
    const timer = window.setInterval(() => {
      setVoiceDuration((current) => current + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isListening]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
  }, []);

  const thinkingMessage = thinkingMessages[thinkingIndex % thinkingMessages.length];
  const modelMenuItems = useMemo<MenuProps['items']>(
    () => modelOptions.map((option) => ({ key: option.value, label: option.label })),
    [modelOptions],
  );

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => {
      setThinkingIndex((current) => (current + 1) % thinkingMessages.length);
    }, 1800);

    return () => window.clearInterval(timer);
  }, [pending]);

  async function handleCopy(content: string) {
    if (!content) return;
    await navigator.clipboard.writeText(content);
  }

  async function appendFiles(files: File[]) {
    if (files.length === 0) return;

    const nextAttachments: AttachmentItem[] = [];
    let nextContent = latestInputRef.current;

    for (const file of files) {
      const id = `${file.name}-${file.lastModified}-${file.size}`;
      const isTextFile =
        file.type.startsWith('text/') ||
        /\.(txt|md|markdown|json|csv|ts|tsx|js|jsx|py|java|go|rs|sql|yaml|yml)$/i.test(file.name);

      if (isTextFile && file.size <= 1024 * 1024) {
        const content = await file.text();
        const snippet = content.slice(0, 4000);
        nextContent = `${nextContent.trim()}\n\n[附件 ${file.name}]\n${snippet}`.trim();
        nextAttachments.push({ id, name: file.name, size: file.size, kind: 'text' });
      } else {
        nextContent = `${nextContent.trim()}\n\n[附件 ${file.name}，大小 ${(file.size / 1024).toFixed(1)} KB]`.trim();
        nextAttachments.push({ id, name: file.name, size: file.size, kind: 'file' });
      }
    }

    onInputChange(nextContent);
    setAttachments((current) => [...current, ...nextAttachments]);
    message.success(`已添加 ${files.length} 个文件`);
  }

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    await appendFiles(files);
    event.target.value = '';
  }

  function handleRemoveAttachment(id: string) {
    setAttachments((current) => current.filter((item) => item.id !== id));
  }

  function handleOpenFilePicker() {
    fileInputRef.current?.click();
  }

  function handleComposerDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleComposerDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragOver(false);
    }
  }

  async function handleComposerDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    await appendFiles(files);
  }

  function handleToggleVoiceInput() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      message.warning('当前浏览器暂不支持语音输入，请使用 Chrome 内核浏览器。');
      return;
    }

    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      voiceBaseInputRef.current = latestInputRef.current;
      setIsListening(true);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event) => {
      setIsListening(false);
      message.error(`语音输入失败：${event.error}`);
    };
    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        transcript += result[0].transcript;
      }
      const prefix = voiceBaseInputRef.current.trim();
      onInputChange(`${prefix}${prefix ? '\n' : ''}${transcript}`.trim());
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function handleQuickSubmit(value: string) {
    if (!value.trim()) return;
    setAttachments([]);
    onSubmitWithInput?.(value);
  }

  const messageSources = useMemo(() => {
    const grouped = new Map<string, (typeof knowledgeRetrievals)[number]>();
    for (const item of knowledgeRetrievals) {
      if (!grouped.has(item.documentId)) grouped.set(item.documentId, item);
    }
    return [...grouped.values()];
  }, [knowledgeRetrievals]);

  const indexedMessageSources = useMemo(
    () => messageSources.map((item, index) => ({ ...item, refLabel: `来源${index + 1}` })),
    [messageSources],
  );

  async function handleOpenKnowledgeSource(item: (typeof knowledgeRetrievals)[number]) {
    if (item.sourceType === 'url' && item.sourceUri) {
      window.open(item.sourceUri, '_blank', 'noopener');
      return;
    }

    if (item.sourceType === 'upload') {
      const result = await api.getKnowledgeDocumentDownload(item.documentId);
      const backendOrigin = `${window.location.protocol}//${window.location.hostname}:3000`;
      const targetUrl = result.url.startsWith('http') ? result.url : `${backendOrigin}${result.url}`;
      window.open(targetUrl, '_blank', 'noopener');
      return;
    }

    // fallback to just open modal inside Knowledge component (simplified here)
    message.info(`请到知识库界面查看完整文档：${item.documentTitle}`);
  }

  const items: BubbleListProps['items'] = useMemo(() => {
    const list: BubbleListProps['items'] = [];

    if (!conversation || (conversation.executions ?? []).length === 0) {
      list.push({
        key: 'welcome',
        role: 'system',
        content: (
          <div className="empty-pane">
            <div className="first-use-panel">
              <Space direction="vertical" size="large" align="center" style={{ width: '100%' }}>
                <Text type="secondary">输入第一条消息开始本轮会话。</Text>
                <Space wrap style={{ justifyContent: 'center' }}>
                  {suggestedPrompts.map((prompt) => (
                    <Button key={prompt} onClick={() => handleQuickSubmit(prompt)}>
                      {prompt}
                    </Button>
                  ))}
                </Space>
              </Space>
            </div>
          </div>
        ),
        variant: 'borderless',
      });
      return list;
    }

    const traceTypeMap: Record<string, string> = {
      thought: '思考',
      action: '执行',
      observation: '观察',
      final_answer: '最终回答',
      error: '错误',
    };

    function getExecutionTraceSteps(execution: { traceId?: string | null }) {
      const traceId = execution.traceId;
      if (!traceId || !traceStepsMap) return [];
      const steps = traceStepsMap[traceId] || [];
      return steps.filter((step) => step.stepType !== 'final_answer' && step.stepType !== 'error');
    }

    (conversation.executions ?? []).forEach((execution) => {
      const isCurrentExecution = execution.id === currentExecutionId;
      const executionTraceSteps = getExecutionTraceSteps(execution);
      
      const isGenerating = pending && isCurrentExecution && streamingAnswer;
      const finalAnswerText = isGenerating ? displayedAnswer : (execution.outputText || '');
      const isThinking = pending && isCurrentExecution && !streamingAnswer;
      
      const referenceText = isCurrentExecution && indexedMessageSources.length > 0 && !isGenerating
        ? `\n\n参考来源：${indexedMessageSources.map((item) => `[${item.refLabel}]`).join(' ')}`
        : '';
      const assistantText = isThinking 
        ? '思考中...' 
        : `${finalAnswerText || (isGenerating ? '' : '本轮执行失败，请查看 Trace 分析原因，或直接重试本条消息。')}${referenceText}`;

      list.push({
        key: `user-${execution.id}`,
        role: 'user',
        placement: 'end',
        content: execution.inputText,
        header: (
          <Space>
            <Text type="secondary">{formatMessageTime(execution.createdAt)}</Text>
            <Text>用户</Text>
          </Space>
        ),
      });

      list.push({
        key: `agent-${execution.id}`,
        role: 'ai',
        placement: 'start',
        content: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
             <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{assistantText}</Typography.Paragraph>
             {executionTraceSteps.length > 0 && (
               <Collapse
                 ghost
                 size="small"
                 items={[
                   {
                     key: 'thinking',
                     label: <Text type="secondary">思考过程 ({executionTraceSteps.length} 步)</Text>,
                     children: (
                       <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                         {executionTraceSteps.map((step, idx) => (
                           <div key={step.id || idx} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: idx < executionTraceSteps.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                             <Space>
                               <Tag color={step.stepType === 'thought' ? 'blue' : step.stepType === 'action' ? 'orange' : 'green'}>{traceTypeMap[step.stepType] || step.stepType}</Tag>
                               <Text type="secondary">步骤 {step.stepIndex}</Text>
                             </Space>
                             <Paragraph style={{ marginTop: 4, marginBottom: 0, fontSize: 13 }}>{step.content}</Paragraph>
                           </div>
                         ))}
                       </div>
                     ),
                   },
                 ]}
               />
             )}
             {isCurrentExecution && indexedMessageSources.length > 0 && (
                <div style={{ background: 'rgba(0,0,0,0.02)', padding: '8px 12px', borderRadius: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>本次回答参考资料</Text>
                  <Space wrap>
                    {indexedMessageSources.map((item) => (
                      <Button key={item.documentId} size="small" onClick={() => void handleOpenKnowledgeSource(item)}>
                        <PaperClipOutlined />[{item.refLabel}] {item.documentTitle}
                      </Button>
                    ))}
                  </Space>
                </div>
             )}
          </div>
        ),
        header: (
          <Space align="center">
            <Text strong>{isThinking ? '思考中' : isGenerating ? '生成中' : execution.status === 'succeeded' ? '智能体' : '执行异常'}</Text>
            <Tag bordered={false} color={isThinking ? 'processing' : isGenerating ? 'blue' : getExecutionStatusMeta(execution.status).color}>
              {isThinking ? '思考中' : isGenerating ? '生成中' : getExecutionStatusMeta(execution.status).label}
            </Tag>
            <Text type="secondary">{formatMessageTime(execution.createdAt)}</Text>
          </Space>
        ),
        footer: (
          <Space wrap size="small">
            {!isGenerating && execution.outputText ? <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => void handleCopy(execution.outputText || '')}>复制回答</Button> : null}
            {!isGenerating && execution.status !== 'succeeded' ? <Button size="small" type="text" onClick={() => onRetryExecution(execution.inputText)}>重试本条</Button> : null}
          </Space>
        ),
        variant: isThinking || isGenerating ? 'borderless' : execution.status === 'succeeded' ? 'borderless' : 'filled',
      });
    });

    if (!pending && interruptedInput) {
       list.push({
         key: 'interrupted-user',
         role: 'user',
         placement: 'end',
         content: interruptedInput,
         header: <Space><Text type="secondary">刚刚</Text><Text>用户</Text><Tag bordered={false} color="default">已发送</Tag></Space>
       });
       list.push({
         key: 'interrupted-agent',
         role: 'ai',
         placement: 'start',
         content: '本次回答已停止。你可以继续补充问题，或重新发送刚才的内容。',
         header: <Space><Text strong>智能体</Text><Tag bordered={false} color="default">已中断</Tag></Space>,
         footer: (
            <Space wrap size="small">
               <Button size="small" type="text" onClick={() => onRetryExecution(interruptedInput!)}>重新发送</Button>
               <Button size="small" type="text" onClick={() => handleQuickSubmit(`${interruptedInput}\n\n请从刚才中断的位置继续回答。`)}>继续生成</Button>
            </Space>
         ),
         variant: 'filled',
       });
    }

    if (pending) {
       if (pendingInput) {
         list.push({
           key: 'pending-user',
           role: 'user',
           placement: 'end',
           content: pendingInput,
           header: <Space><Text type="secondary">刚刚</Text><Text>用户</Text><Tag bordered={false} color="processing">发送中</Tag></Space>
         });
       }
       
       if (streamingAnswer) {
         list.push({
           key: 'pending-agent-streaming',
           role: 'ai',
           placement: 'start',
           content: (
             <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
               <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{displayedAnswer}</Typography.Paragraph>
             </div>
           ),
           header: <Space><Text strong>智能体</Text><Tag bordered={false} color="blue">生成中</Tag></Space>,
           variant: 'borderless',
         });
       } else {
         list.push({
           key: 'pending-agent',
           role: 'ai',
           placement: 'start',
           loading: true,
           content: thinkingMessage,
           header: <Space><Text strong>智能体</Text><Tag bordered={false} color="processing">思考中</Tag></Space>,
           variant: 'borderless',
         });
       }
    }

    return list;
  }, [conversation, currentExecutionId, indexedMessageSources, interruptedInput, pending, pendingInput, thinkingMessage, handleCopy, onRetryExecution, traceStepsMap, streamingAnswer, displayedAnswer]);

  return (
    <Card className="console-card workspace-chat-card" bordered={false}>
      <div className="chat-toolbar">
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {conversation?.title || '请选择会话'}
          </Typography.Title>
          <Paragraph className="muted-paragraph">
            {conversation ? '当前会话启用上下文记忆，适合连续追问和逐步深入。' : '先选择会话或发送第一条消息，系统会自动创建会话。'}
          </Paragraph>
        </div>
        <Tag color="cyan">上下文记忆中</Tag>
      </div>

      {errorMessage && (
        <div style={{ padding: '0 24px' }}>
          <Alert
            type="error"
            showIcon
            message="最近一次执行失败"
            description={errorMessage}
            action={
              lastFailedInput ? (
                <Button size="small" onClick={() => onRetryExecution(lastFailedInput)}>
                  重新编辑
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      <Bubble.List
        items={items}
        style={{ flex: 1, padding: '24px', overflowY: 'auto' }}
      />

      <div
        style={{ padding: '16px 24px', background: '#fff', borderTop: '1px solid #f0f0f0' }}
        onDragOver={handleComposerDragOver}
        onDragLeave={handleComposerDragLeave}
        onDrop={(event) => void handleComposerDrop(event)}
      >
        <div style={{ marginBottom: 12 }}>
           <Space size={4} wrap>
               <Button type="text" icon={<PlusOutlined />} onClick={handleOpenFilePicker} />
               <Dropdown
                 menu={{
                   items: modelMenuItems,
                   selectable: true,
                   selectedKeys: activeModelId ? [activeModelId] : [],
                   onClick: ({ key }) => onSelectModel(String(key)),
                 }}
                 trigger={['click']}
               >
                 <Button size="small" type="text">
                   {modelLabel} <DownOutlined />
                 </Button>
               </Dropdown>
               <Button size="small" type="text" onClick={onToggleLanguage}>{languageLabel}</Button>
                <Button size="small" type="text" onClick={onOpenContext}>上下文</Button>
                <Button size="small" type="text" onClick={onOpenKnowledge}>知识</Button>
                <Button size="small" type="text" onClick={onOpenSkills}>技能</Button>
                <Button
                 size="small"
                 type="text"
                 icon={isListening ? <LoadingOutlined /> : <AudioOutlined />}
                 onClick={handleToggleVoiceInput}
                 style={isListening ? { color: '#1677ff' } : undefined}
               />
            </Space>
        </div>

        <Sender
          value={input}
          onChange={(v) => onInputChange(v)}
          onSubmit={(v) => {
            if (v.trim()) {
              onSubmitWithInput?.(v);
            }
          }}
          onCancel={onStop}
          loading={pending}
          header={
            <div style={{ marginBottom: attachments.length > 0 ? 8 : 0 }}>
              {attachments.length > 0 && (
                <Attachments
                  items={attachments.map(a => ({ uid: a.id, name: a.name, size: a.size }))}
                  onRemove={(item) => handleRemoveAttachment(item.uid)}
                />
              )}
              {isDragOver && (
                <div style={{ background: '#e6f4ff', border: '1px dashed #1677ff', borderRadius: 8, padding: 8, textAlign: 'center', color: '#1677ff' }}>
                  松开文件即可添加到当前问题
                </div>
              )}
              {isListening && (
                 <div style={{ color: '#1677ff', marginBottom: 8, fontSize: 13 }}>
                   <LoadingOutlined style={{ marginRight: 8 }} />
                   正在聆听 {formatDuration(voiceDuration)}，请直接说话，结束后再次点击麦克风即可停止。
                 </div>
              )}
            </div>
          }
        />
        <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} />
      </div>
    </Card>
  );
}
