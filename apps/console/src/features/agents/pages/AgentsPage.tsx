'use client';

import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Descriptions, Drawer, Empty, Form, Input, message, Popconfirm, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api';
import type { Agent, LlmProvider, Skill } from '../../../types/api';
import { PageHeader } from '../../../shared/components/PageHeader';

interface AgentFormValues {
  name: string;
  description?: string;
  systemPrompt?: string;
  maxSteps: number;
  timeoutMs: number;
  status: 'draft' | 'active' | 'archived';
}

interface AgentsPageProps {
  initialAgents?: Agent[];
  initialProviders?: LlmProvider[];
  initialSkills?: Skill[];
  initialMessageText?: string;
}

export function AgentsPage({ initialAgents = [], initialProviders = [], initialSkills = [], initialMessageText = '加载中...' }: AgentsPageProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [providers, setProviders] = useState<LlmProvider[]>(initialProviders);
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [messageText, setMessageText] = useState(initialMessageText);
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Agent['status']>('all');
  const [form] = Form.useForm<AgentFormValues>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null);

  async function refresh() {
    const [agentList, providerList, skillList] = await Promise.all([api.listAgents(), api.listProviders(), api.listSkills()]);
    setAgents(agentList);
    setProviders(providerList);
    setSkills(skillList);
    setMessageText('智能体列表已刷新');
  }

  async function handleCreate(values: AgentFormValues) {
    if (!providers[0]) {
      message.error('请先确保模型提供商已初始化');
      return;
    }

    const activeSkillIds = skills.filter(s => s.status === 'active').map(s => s.id).filter(Boolean);
    await api.createAgent({
      ...values,
      llmProviderId: providers[0].id,
      skillIds: activeSkillIds,
    });

    setOpen(false);
    form.resetFields();
    await refresh();
    message.success('智能体已创建');
  }

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const matchesKeyword = keyword.trim().length === 0 || `${agent.name} ${agent.description || ''}`.toLowerCase().includes(keyword.toLowerCase());
      const matchesStatus = statusFilter === 'all' || agent.status === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [agents, keyword, statusFilter]);

  const columns: ColumnsType<Agent> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <strong>{record.name}</strong>
          <span>{record.description || '未填写描述'}</span>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: Agent['status']) => <Tag color={value === 'active' ? 'green' : value === 'archived' ? 'gold' : 'default'}>{value}</Tag>,
    },
    {
      title: '模型',
      key: 'provider',
      render: (_, record) => providers.find((item) => item.id === record.llmProviderId)?.name || '未匹配',
    },
    {
      title: '运行配置',
      key: 'runtime',
      render: (_, record) => `${record.maxSteps} 步 / ${record.timeoutMs} ms`,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => { api.getAgent(record.id).then(setDetailAgent); setDetailOpen(true); }}>查看</Button>
          <Button icon={<EditOutlined />} onClick={() => api.updateAgentStatus(record.id, 'active').then(() => { message.success('智能体已启用'); return refresh(); })}>启用</Button>
          <Button onClick={() => api.updateAgentStatus(record.id, 'archived').then(() => { message.success('智能体已归档'); return refresh(); })}>归档</Button>
          <Popconfirm title="确认删除智能体？" description="删除后不可恢复。" onConfirm={() => api.deleteAgent(record.id).then(() => { message.success('智能体已删除'); return refresh(); })}>
            <Button danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="resource-page-block">
      <PageHeader
        title="智能体管理"
        description={messageText}
        actions={
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="搜索名称或描述"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 220 }}
            />
            <Select
              value={statusFilter}
              style={{ width: 140 }}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: '全部状态' },
                { value: 'draft', label: '草稿' },
                { value: 'active', label: '启用' },
                { value: 'archived', label: '归档' },
              ]}
            />
            <Button className="soft-action-button" icon={<ReloadOutlined />} onClick={() => void refresh()}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建智能体</Button>
          </Space>
        }
      />

      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredAgents}
        className="table-surface"
        pagination={{ pageSize: 8 }}
        locale={{
          emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的智能体，试试更换筛选条件。" />,
        }}
      />

      <Drawer title="新建智能体" width={520} open={open} onClose={() => setOpen(false)} destroyOnHidden>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ name: '本地智能体', description: '用于本地 MVP 联调的智能体', systemPrompt: '你是一名中文智能助手。请保持上下文连贯，优先给出清晰、实用、简洁的回答。', maxSteps: 6, timeoutMs: 60000, status: 'active' }}
          onFinish={(values) => void handleCreate(values)}
        >
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="系统提示词" name="systemPrompt">
            <Input.TextArea rows={6} />
          </Form.Item>
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item label="最大步数" name="maxSteps" rules={[{ required: true }]}>
              <Input type="number" />
            </Form.Item>
            <Form.Item label="超时(ms)" name="timeoutMs" rules={[{ required: true }]}>
              <Input type="number" />
            </Form.Item>
            <Form.Item label="状态" name="status" rules={[{ required: true }]}>
              <Select options={[{ value: 'draft', label: '草稿' }, { value: 'active', label: '启用' }, { value: 'archived', label: '归档' }]} />
            </Form.Item>
          </Space>
          <Button htmlType="submit" type="primary" block>创建智能体</Button>
        </Form>
      </Drawer>

      <Drawer title="智能体详情" width={560} open={detailOpen} onClose={() => setDetailOpen(false)}>
        {detailAgent && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="名称">{detailAgent.name}</Descriptions.Item>
              <Descriptions.Item label="描述">{detailAgent.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={detailAgent.status === 'active' ? 'green' : detailAgent.status === 'archived' ? 'gold' : 'default'}>{detailAgent.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="模型">{providers.find(p => p.id === detailAgent.llmProviderId)?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="最大步数">{detailAgent.maxSteps}</Descriptions.Item>
              <Descriptions.Item label="超时时间">{detailAgent.timeoutMs} ms</Descriptions.Item>
              <Descriptions.Item label="Temperature">{detailAgent.temperature ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="TopP">{detailAgent.topP ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="绑定技能">{detailAgent.skillIds && Array.isArray(detailAgent.skillIds) ? detailAgent.skillIds.length : 0} 个</Descriptions.Item>
              <Descriptions.Item label="创建时间">{new Date(detailAgent.createdAt).toLocaleString()}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{new Date(detailAgent.updatedAt).toLocaleString()}</Descriptions.Item>
            </Descriptions>
            {detailAgent.systemPrompt && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>系统提示词</div>
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>{detailAgent.systemPrompt}</pre>
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
