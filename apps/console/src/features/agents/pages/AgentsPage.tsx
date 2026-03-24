'use client';

import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Descriptions, Drawer, Empty, Form, Input, message, Popconfirm, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
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
  skillIds: string[];
}

interface AgentsPageProps {
  initialAgents?: Agent[];
  initialProviders?: LlmProvider[];
  initialSkills?: Skill[];
  initialMessageText?: string;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item)).filter((item) => item.trim().length > 0);
        }
      } catch {
        return [];
      }
    }
    return trimmed.split(',').map((item) => item.trim()).filter((item) => item.length > 0);
  }
  return [];
}

export function AgentsPage({ initialAgents = [], initialProviders = [], initialSkills = [], initialMessageText = '加载中...' }: AgentsPageProps) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [providers, setProviders] = useState<LlmProvider[]>(initialProviders);
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [messageText, setMessageText] = useState(initialMessageText);
  const [open, setOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
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

  const skillMap = useMemo(() => {
    const map = new Map<string, Skill>();
    for (const skill of skills) {
      if (skill.id) {
        map.set(skill.id, skill);
      }
    }
    return map;
  }, [skills]);

  const activeSkillIds = useMemo(
    () => skills.filter((skill) => skill.id && skill.status === 'active').map((skill) => String(skill.id)),
    [skills],
  );

  const skillOptions = useMemo(
    () => skills
      .filter((skill) => !!skill.id)
      .map((skill) => ({
        value: String(skill.id),
        label: `${skill.name} (${skill.version})${skill.status && skill.status !== 'active' ? ` [${skill.status}]` : ''}`,
        disabled: skill.status !== 'active',
      })),
    [skills],
  );

  function openCreateDrawer() {
    setEditingAgentId(null);
    form.setFieldsValue({
      name: '本地智能体',
      description: '用于本地 MVP 联调的智能体',
      systemPrompt: '你是一名中文智能助手。请保持上下文连贯，优先给出清晰、实用、简洁的回答。',
      maxSteps: 6,
      timeoutMs: 60000,
      status: 'active',
      skillIds: activeSkillIds,
    });
    setOpen(true);
  }

  function openEditDrawer(agent: Agent) {
    setEditingAgentId(agent.id);
    form.setFieldsValue({
      name: agent.name,
      description: agent.description || '',
      systemPrompt: agent.systemPrompt || '',
      maxSteps: agent.maxSteps,
      timeoutMs: agent.timeoutMs,
      status: agent.status,
      skillIds: toStringArray(agent.skillIds),
    });
    setOpen(true);
  }

  async function handleSubmit(values: AgentFormValues) {
    if (!providers[0]) {
      message.error('请先确保模型提供商已初始化');
      return;
    }

    const payload = {
      ...values,
      llmProviderId: editingAgentId
        ? agents.find((item) => item.id === editingAgentId)?.llmProviderId || providers[0].id
        : providers[0].id,
      skillIds: values.skillIds || [],
    };

    if (editingAgentId) {
      await api.updateAgent(editingAgentId, payload);
      message.success('智能体已更新');
    } else {
      await api.createAgent(payload);
      message.success('智能体已创建');
    }

    setOpen(false);
    setEditingAgentId(null);
    form.resetFields();
    await refresh();
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
          <Button icon={<EditOutlined />} onClick={() => openEditDrawer(record)}>编辑</Button>
          <Button onClick={() => api.updateAgentStatus(record.id, 'active').then(() => { message.success('智能体已启用'); return refresh(); })}>启用</Button>
          <Button onClick={() => api.updateAgentStatus(record.id, 'archived').then(() => { message.success('智能体已归档'); return refresh(); })}>归档</Button>
          <Popconfirm title="确认删除智能体？" description="删除后不可恢复。" onConfirm={() => api.deleteAgent(record.id).then(() => { message.success('智能体已删除'); return refresh(); })}>
            <Button danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const detailSkillItems = useMemo(() => {
    if (!detailAgent) {
      return [] as Array<{ id: string; name: string; status: string; missing?: boolean }>;
    }
    return toStringArray(detailAgent.skillIds).map((skillId) => {
      const skill = skillMap.get(skillId);
      if (!skill) {
        return { id: skillId, name: skillId, status: 'disabled', missing: true };
      }
      return { id: skillId, name: skill.name, status: skill.status || 'unknown' };
    });
  }, [detailAgent, skillMap]);

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
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>新建智能体</Button>
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

      <Drawer
        title={editingAgentId ? '编辑智能体' : '新建智能体'}
        width={560}
        open={open}
        onClose={() => {
          setOpen(false);
          setEditingAgentId(null);
        }}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
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
          <Form.Item label="绑定技能" name="skillIds" extra="仅允许保存 active 技能；disabled 技能会显示但不可重新选择。">
            <Select
              mode="multiple"
              allowClear
              placeholder="请选择要绑定的技能"
              options={skillOptions}
            />
          </Form.Item>
          <Button htmlType="submit" type="primary" block>{editingAgentId ? '保存修改' : '创建智能体'}</Button>
        </Form>
      </Drawer>

      <Drawer title="智能体详情" width={620} open={detailOpen} onClose={() => setDetailOpen(false)}>
        {detailAgent && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="名称">{detailAgent.name}</Descriptions.Item>
              <Descriptions.Item label="描述">{detailAgent.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={detailAgent.status === 'active' ? 'green' : detailAgent.status === 'archived' ? 'gold' : 'default'}>{detailAgent.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="模型">{providers.find((p) => p.id === detailAgent.llmProviderId)?.name || '-'}</Descriptions.Item>
              <Descriptions.Item label="最大步数">{detailAgent.maxSteps}</Descriptions.Item>
              <Descriptions.Item label="超时时间">{detailAgent.timeoutMs} ms</Descriptions.Item>
              <Descriptions.Item label="Temperature">{detailAgent.temperature ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="TopP">{detailAgent.topP ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="绑定技能">
                {detailSkillItems.length > 0 ? (
                  <Space wrap>
                    {detailSkillItems.map((item) => (
                      <Tag key={item.id} color={item.status === 'active' ? 'green' : 'red'}>
                        {item.name} ({item.status})
                      </Tag>
                    ))}
                  </Space>
                ) : '无'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailAgent.createdAt ? new Date(detailAgent.createdAt).toLocaleString() : '-'}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detailAgent.updatedAt ? new Date(detailAgent.updatedAt).toLocaleString() : '-'}</Descriptions.Item>
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
