import { DeleteOutlined, ExperimentOutlined, PushpinOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Card, Collapse, Descriptions, Empty, List, Popconfirm, Segmented, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import type { Agent, AgentMemory, ConversationMemorySnapshot, Execution, KnowledgeRetrievalItem, MemoryUpdateItem, ProviderTestResult, Skill, TraceStep } from '../../../types/api';

const { Paragraph, Text } = Typography;

const traceTypeMap: Record<string, string> = {
  thought: '思考',
  action: '执行',
  observation: '观察',
  final_answer: '最终回答',
  error: '错误',
};

interface ExecutionInspectorProps {
  agent?: Agent;
  skills: Skill[];
  traceId: string;
  traceSteps: TraceStep[];
  currentExecution?: Execution;
  providerTest: ProviderTestResult | null;
  conversationMemory: ConversationMemorySnapshot | null;
  agentMemories: AgentMemory[];
  recentMemoryUpdates: MemoryUpdateItem[];
  knowledgeRetrievals: KnowledgeRetrievalItem[];
  onPinMemory: (memoryId: string, importance: number) => void;
  onDeleteMemory: (memoryId: string) => void;
}

const memoryTypeMap: Record<string, string> = {
  preference: '偏好',
  fact: '事实',
  goal: '目标',
  summary: '总结',
};

export function ExecutionInspector({
  agent,
  skills,
  traceId,
  traceSteps,
  currentExecution,
  providerTest,
  conversationMemory,
  agentMemories,
  recentMemoryUpdates,
  knowledgeRetrievals,
  onPinMemory,
  onDeleteMemory,
}: ExecutionInspectorProps) {
  const [memoryFilter, setMemoryFilter] = useState<'all' | 'preference' | 'fact' | 'goal' | 'summary'>('all');
  const [showAllMemories, setShowAllMemories] = useState(false);

  const boundSkills = agent?.skillIds?.length ? skills.filter((skill) => !!skill.id && agent.skillIds?.includes(skill.id) && skill.status === 'active') : [];

  const filteredMemories = useMemo(() => {
    const base = memoryFilter === 'all' ? agentMemories : agentMemories.filter((memory) => memory.memoryType === memoryFilter);
    return showAllMemories ? base : base.slice(0, 5);
  }, [agentMemories, memoryFilter, showAllMemories]);

  const groupedTrace = useMemo(() => {
    const buckets: Array<{ key: string; title: string; steps: TraceStep[] }> = [
      { key: 'thought', title: '思考过程', steps: [] },
      { key: 'action', title: '执行动作', steps: [] },
      { key: 'observation', title: '观察结果', steps: [] },
      { key: 'final_answer', title: '最终回答', steps: [] },
      { key: 'error', title: '异常信息', steps: [] },
    ];

    for (const step of traceSteps) {
      const bucket = buckets.find((item) => item.key === step.stepType);
      if (bucket) bucket.steps.push(step);
    }

    return buckets.filter((bucket) => bucket.steps.length > 0);
  }, [traceSteps]);

  return (
    <div className="workspace-right-rail" id="trace-inspector-panel">
      <Card className="console-card hover-card" title="当前智能体配置" id="current-agent-config-card">
        {agent ? (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="名称">{agent.name}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color="blue">{agent.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="最大步数">{agent.maxSteps}</Descriptions.Item>
            <Descriptions.Item label="超时">{agent.timeoutMs} ms</Descriptions.Item>
            <Descriptions.Item label="已绑技能">{agent.skillIds?.length || 0}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="左侧选择智能体后，这里会展示运行配置。" />
        )}
      </Card>

      <Card className="console-card hover-card" title="当前执行摘要">
        {currentExecution ? (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="状态">
              <Tag color={currentExecution.status === 'succeeded' ? 'green' : currentExecution.status === 'failed' ? 'red' : 'blue'}>
                {currentExecution.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="时间">{currentExecution.createdAt ? new Date(currentExecution.createdAt).toLocaleString() : '-'}</Descriptions.Item>
            <Descriptions.Item label="Trace 步骤数">{traceSteps.length}</Descriptions.Item>
            <Descriptions.Item label="本轮记忆更新">{recentMemoryUpdates.length} 条</Descriptions.Item>
            <Descriptions.Item label="知识检索命中">{knowledgeRetrievals.length} 条</Descriptions.Item>
          </Descriptions>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="发送消息后，这里会展示当前执行摘要。" />
        )}
      </Card>

      <Card className="console-card hover-card" title="已绑定技能" id="bound-skills-card">
        {boundSkills.length > 0 ? (
          <List
            dataSource={boundSkills}
            renderItem={(skill) => (
              <List.Item>
                <List.Item.Meta title={skill.name} description={`${skill.skillKey} · ${skill.executorKey || '未映射执行器'}`} />
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前智能体未绑定技能。" />
        )}
      </Card>

      <Card className="console-card hover-card" title="记忆总览" id="memory-overview-card">
        <Collapse
          defaultActiveKey={['short', 'long']}
          ghost
          items={[
            {
              key: 'short',
              label: '短期记忆',
              children: conversationMemory ? (
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Paragraph>{conversationMemory.summary}</Paragraph>
                  {conversationMemory.openTasks?.length ? (
                    <div>
                      <Text strong>待继续事项</Text>
                      <List
                        size="small"
                        dataSource={conversationMemory.openTasks}
                        renderItem={(item) => <List.Item>{item}</List.Item>}
                      />
                    </div>
                  ) : null}
                  {conversationMemory.userPreferences?.length ? (
                    <div>
                      <Text strong>偏好</Text>
                      <div className="memory-tag-list">
                        {conversationMemory.userPreferences.map((item) => (
                          <Tag key={item} color="cyan">{item}</Tag>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {conversationMemory.keyFacts?.length ? (
                    <div>
                      <Text strong>关键事实</Text>
                      <List
                        size="small"
                        dataSource={conversationMemory.keyFacts}
                        renderItem={(item) => <List.Item>{item}</List.Item>}
                      />
                    </div>
                  ) : null}
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前会话还没有生成短期记忆。" />
              ),
            },
            {
              key: 'long',
              label: '长期记忆',
              children: agentMemories.length > 0 ? (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Segmented
                      value={memoryFilter}
                      onChange={(value) => setMemoryFilter(value as typeof memoryFilter)}
                      options={[
                        { label: '全部', value: 'all' },
                        { label: '偏好', value: 'preference' },
                        { label: '目标', value: 'goal' },
                        { label: '事实', value: 'fact' },
                        { label: '总结', value: 'summary' },
                      ]}
                    />
                    <Button type="link" onClick={() => setShowAllMemories((current) => !current)}>
                      {showAllMemories ? '收起' : '查看更多'}
                    </Button>
                  </Space>

                  <List
                    size="small"
                    dataSource={filteredMemories}
                    renderItem={(memory) => (
                        <List.Item>
                          <List.Item.Meta
                            title={
                              <Space wrap>
                                <Tag color="geekblue">{memoryTypeMap[memory.memoryType] || memory.memoryType}</Tag>
                                <Text>重要度 {memory.importance}</Text>
                                {memory.lastAccessedAt ? <Text type="secondary">最近命中 {new Date(memory.lastAccessedAt).toLocaleString()}</Text> : null}
                              </Space>
                            }
                            description={
                              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                <Paragraph ellipsis={{ rows: 2 }}>{memory.content}</Paragraph>
                                {memory.sourceConversationId ? <Text type="secondary">来源会话：{memory.sourceConversationId}</Text> : null}
                              </Space>
                            }
                          />
                        <Space>
                          <Button size="small" icon={<PushpinOutlined />} onClick={() => onPinMemory(memory.id, 5)}>
                            置顶
                          </Button>
                          <Popconfirm title="确认删除这条长期记忆？" onConfirm={() => onDeleteMemory(memory.id)}>
                            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                          </Popconfirm>
                        </Space>
                      </List.Item>
                    )}
                  />
                </Space>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前智能体还没有沉淀长期记忆。" />
              ),
            },
          ]}
        />
      </Card>

      {recentMemoryUpdates.length > 0 ? (
        <Card className="console-card accent-card" title="本轮记忆更新">
          <List
            size="small"
            dataSource={recentMemoryUpdates}
            renderItem={(memory) => (
              <List.Item>
                <List.Item.Meta
                  title={
                    <Space>
                      <Tag color={memory.changeType === 'created' ? 'green' : 'blue'}>{memory.changeType === 'created' ? '新增' : '更新'}</Tag>
                      <Tag color="geekblue">{memoryTypeMap[memory.memoryType] || memory.memoryType}</Tag>
                      <Text>重要度 {memory.importance}</Text>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Paragraph ellipsis={{ rows: 2 }}>{memory.content}</Paragraph>
                      {memory.reason ? <Text type="secondary">写入原因：{memory.reason}</Text> : null}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      ) : null}

      <Card className="console-card hover-card" title="本轮知识检索" id="knowledge-retrieval-card">
        {knowledgeRetrievals.length > 0 ? (
          <List
            size="small"
            dataSource={knowledgeRetrievals}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  title={<Space wrap><Tag color="cyan">{item.knowledgeBaseName}</Tag><Tag>{item.documentTitle}</Tag><Text>分数 {item.score.toFixed(3)}</Text></Space>}
                  description={<Space direction="vertical" size={4} style={{ width: '100%' }}><Paragraph ellipsis={{ rows: 3 }}>{item.content}</Paragraph>{item.sourceUri ? <Text type="secondary">来源：{item.sourceUri}</Text> : null}</Space>}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本轮没有命中知识库内容。" />
        )}
      </Card>

      <Card className="console-card hover-card flex-card" title="最近 Trace" extra={traceId ? <Tag color="purple">{traceId}</Tag> : null} id="trace-content-card">
        {traceSteps.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="执行一轮消息后，这里会展示思考、执行与观察摘要。" />
        ) : (
          <Collapse
            ghost
            defaultActiveKey={groupedTrace.map((group) => group.key)}
            items={groupedTrace.map((group) => ({
              key: group.key,
              label: `${group.title} (${group.steps.length})`,
              children: (
                <List
                  dataSource={group.steps}
                  renderItem={(step) => (
                    <List.Item className={step.stepType === 'final_answer' ? 'trace-list-item active' : 'trace-list-item'}>
                      <List.Item.Meta
                        avatar={step.stepType === 'action' ? <ExperimentOutlined /> : <ThunderboltOutlined />}
                        title={<Space><Tag>{traceTypeMap[step.stepType] || step.stepType}</Tag><Text>步骤 {step.stepIndex}</Text></Space>}
                        description={<Paragraph ellipsis={{ rows: 3 }}>{step.content}</Paragraph>}
                      />
                    </List.Item>
                  )}
                />
              ),
            }))}
          />
        )}
      </Card>

      {providerTest ? (
        <Card className="console-card accent-card" title="模型连通状态">
          <Space direction="vertical">
            <Text strong>{providerTest.model}</Text>
            <Tag color="green">{providerTest.status}</Tag>
            <Paragraph>{providerTest.contentPreview}</Paragraph>
          </Space>
        </Card>
      ) : null}
    </div>
  );
}
