'use client';

import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Collapse, Descriptions, Drawer, Empty, Input, Select, Space, Table, Tag, Timeline, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api';
import type { Execution, KnowledgeRetrievalItem, TraceStep } from '../../../types/api';
import { PageHeader } from '../../../shared/components/PageHeader';

const { Paragraph } = Typography;

const traceTypeMap: Record<string, string> = {
  thought: '思考',
  action: '执行',
  observation: '观察',
  final_answer: '最终回答',
  error: '错误',
};

interface ExecutionsPageProps {
  initialExecutions?: Execution[];
  initialMessageText?: string;
}

export function ExecutionsPage({ initialExecutions = [], initialMessageText = '加载中...' }: ExecutionsPageProps) {
  const [executions, setExecutions] = useState<Execution[]>(initialExecutions);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [citedRetrievals, setCitedRetrievals] = useState<KnowledgeRetrievalItem[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<Execution | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [traceId, setTraceId] = useState('');
  const [messageText, setMessageText] = useState(initialMessageText);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');

  async function refresh() {
    const agents = await api.listAgents();
    const executionGroups = await Promise.all(agents.map((agent) => api.listExecutions(agent.id)));
    const merged = executionGroups.flat().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    setExecutions(merged);
    setMessageText(`共加载 ${merged.length} 条执行记录`);
  }

  const filteredExecutions = useMemo(() => {
    return executions.filter((execution) => {
      const matchesKeyword = keyword.trim().length === 0 || `${execution.inputText} ${execution.outputText || ''}`.toLowerCase().includes(keyword.toLowerCase());
      const matchesStatus = statusFilter === 'all' || execution.status === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [executions, keyword, statusFilter]);

  async function openTrace(nextTraceId: string) {
    const trace = await api.getTrace(nextTraceId);
    setTraceId(nextTraceId);
    setTraceSteps(trace.steps);
    setSelectedExecution(trace.execution);
    setCitedRetrievals(trace.citedRetrievals ?? []);
    setDrawerOpen(true);
  }

  const columns: ColumnsType<Execution> = [
    { title: '时间', dataIndex: 'createdAt', render: (value) => (value ? new Date(value).toLocaleString() : '-') },
    { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 'succeeded' ? 'green' : value === 'failed' ? 'red' : 'gold'}>{value}</Tag> },
    { title: '会话', dataIndex: 'conversationId', render: (value) => value || '无' },
    {
      title: '问题 / 回答摘要',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <strong>{record.inputText.slice(0, 24)}</strong>
          <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>{record.outputText || '无输出'}</Paragraph>
        </Space>
      ),
    },
    { title: '操作', render: (_, record) => <Button icon={<EyeOutlined />} onClick={() => void openTrace(record.traceId)}>查看 Trace</Button> },
  ];

  return (
    <div className="resource-page-block">
      <PageHeader
        title="执行记录"
        description={messageText}
        actions={
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索问题或回答摘要"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 240 }}
            />
            <Select
              value={statusFilter}
              style={{ width: 150 }}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'succeeded', label: '成功' },
                { value: 'failed', label: '失败' },
                { value: 'timeout', label: '超时' },
              ]}
            />
            <Button className="soft-action-button" icon={<ReloadOutlined />} onClick={() => void refresh()}>刷新</Button>
          </Space>
        }
      />
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredExecutions}
        className="table-surface"
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的执行记录。" /> }}
      />

      <Drawer title={`Trace 详情 ${traceId ? `· ${traceId}` : ''}`} width={620} open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {traceSteps.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到 Trace 数据。" />
        ) : (
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {selectedExecution ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="状态">
                  <Tag color={selectedExecution.status === 'succeeded' ? 'green' : selectedExecution.status === 'failed' ? 'red' : 'gold'}>
                    {selectedExecution.status}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="时间">{selectedExecution.createdAt ? new Date(selectedExecution.createdAt).toLocaleString() : '-'}</Descriptions.Item>
                <Descriptions.Item label="会话">{selectedExecution.conversationId || '无'}</Descriptions.Item>
                <Descriptions.Item label="问题摘要">{selectedExecution.inputText}</Descriptions.Item>
              </Descriptions>
            ) : null}

            {citedRetrievals.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>本次回答引用的知识来源</div>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {citedRetrievals.map((item, index) => (
                    <Descriptions key={item.chunkId} column={1} size="small" bordered style={{ background: '#fafafa' }}>
                      <Descriptions.Item label="来源">{index + 1} · {item.documentTitle}</Descriptions.Item>
                      <Descriptions.Item label="知识库">{item.knowledgeBaseName}</Descriptions.Item>
                      <Descriptions.Item label="片段">{item.chunkIndex}</Descriptions.Item>
                      <Descriptions.Item label="引用内容"><Paragraph ellipsis={{ rows: 3 }} style={{ marginBottom: 0 }}>{item.content}</Paragraph></Descriptions.Item>
                    </Descriptions>
                  ))}
                </Space>
              </div>
            )}

            <Collapse
              defaultActiveKey={['thought', 'action', 'observation', 'final_answer', 'error']}
              items={['thought', 'action', 'observation', 'final_answer', 'error']
                .map((type) => ({
                  type,
                  steps: traceSteps.filter((step) => step.stepType === type),
                }))
                .filter((group) => group.steps.length > 0)
                .map((group) => ({
                  key: group.type,
                  label: `${traceTypeMap[group.type] || group.type} (${group.steps.length})`,
                  children: (
                    <Timeline
                      items={group.steps.map((step) => ({
                        color: step.stepType === 'error' ? 'red' : step.stepType === 'final_answer' ? 'green' : 'blue',
                        children: (
                          <Space direction="vertical" size={4}>
                            <Tag>{traceTypeMap[step.stepType] || step.stepType}</Tag>
                            <strong>步骤 {step.stepIndex}</strong>
                            <Paragraph style={{ marginBottom: 0 }}>{step.content}</Paragraph>
                          </Space>
                        ),
                      }))}
                    />
                  ),
                }))}
            />
          </Space>
        )}
      </Drawer>
    </div>
  );
}
