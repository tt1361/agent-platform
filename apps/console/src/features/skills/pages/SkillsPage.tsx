'use client';

import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Descriptions, Divider, Drawer, Empty, Form, Input, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { api } from '../../../services/api';
import type { Skill, SkillSecret } from '../../../types/api';
import { PageHeader } from '../../../shared/components/PageHeader';

const { Text } = Typography;

interface SkillsPageProps {
  initialSkills?: Skill[];
  initialAvailableSkills?: Skill[];
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

function toObject(value: unknown): Record<string, unknown> | string | null {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return null;
}

export function SkillsPage({ initialSkills = [], initialAvailableSkills = [], initialMessageText = '加载中...' }: SkillsPageProps) {
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [availableSkills, setAvailableSkills] = useState<Skill[]>(initialAvailableSkills);
  const [messageText, setMessageText] = useState(initialMessageText);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | NonNullable<Skill['status']>>('all');
  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('installed');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);
  const [pluginSecretOpen, setPluginSecretOpen] = useState(false);
  const [pluginSecretSkill, setPluginSecretSkill] = useState<Skill | null>(null);
  const [pluginSecretState, setPluginSecretState] = useState<SkillSecret | null>(null);
  const [pluginSecretSaving, setPluginSecretSaving] = useState(false);
  const [secretForm] = Form.useForm<Record<string, string>>();

  async function refresh() {
    const [installedItems, discoveredItems] = await Promise.all([api.listSkills(), api.listAvailableSkills()]);
    setSkills(installedItems);
    setAvailableSkills(discoveredItems);
    setMessageText(`已同步 ${installedItems.length} 个目录技能，待同步 ${discoveredItems.length} 个`);
  }

  async function openPluginSecretDrawer(skill: Skill) {
    if (!skill.id) {
      return;
    }
    setPluginSecretSkill(skill);
    setPluginSecretOpen(true);
    setPluginSecretState(null);
    secretForm.resetFields();
    try {
      const secretState = await api.getSkillSecret(skill.id);
      setPluginSecretState(secretState);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载密钥状态失败');
    }
  }

  async function submitPluginSecret() {
    if (!pluginSecretSkill?.id) {
      return;
    }
    const values = await secretForm.validateFields();
    const secretKeys = toStringArray(pluginSecretSkill.pluginSecretKeys);
    const payload: Record<string, string> = {};
    if (secretKeys.length > 0) {
      for (const key of secretKeys) {
        const value = values[key];
        if (typeof value === 'string' && value.trim().length > 0) {
          payload[key] = value.trim();
        }
      }
    } else {
      Object.entries(values).forEach(([key, value]) => {
        if (typeof value === 'string' && value.trim().length > 0) {
          payload[key] = value.trim();
        }
      });
    }
    if (Object.keys(payload).length === 0) {
      message.warning('请至少填写一个密钥字段');
      return;
    }
    setPluginSecretSaving(true);
    try {
      const secretState = await api.updateSkillSecret(pluginSecretSkill.id, payload);
      setPluginSecretState(secretState);
      message.success('插件密钥已保存');
      await refresh();
      secretForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setPluginSecretSaving(false);
    }
  }

  async function clearPluginSecret() {
    if (!pluginSecretSkill?.id) {
      return;
    }
    setPluginSecretSaving(true);
    try {
      const secretState = await api.deleteSkillSecret(pluginSecretSkill.id);
      setPluginSecretState(secretState);
      message.success('插件密钥已清除');
      await refresh();
      secretForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '清除失败');
    } finally {
      setPluginSecretSaving(false);
    }
  }

  const filteredInstalledSkills = useMemo(() => {
    return skills.filter((skill) => {
      const matchesKeyword = keyword.trim().length === 0 || `${skill.name} ${skill.skillKey}`.toLowerCase().includes(keyword.toLowerCase());
      const matchesStatus = statusFilter === 'all' || skill.status === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [skills, keyword, statusFilter]);

  const filteredAvailableSkills = useMemo(() => {
    return availableSkills.filter((skill) => {
      return keyword.trim().length === 0 || `${skill.name} ${skill.skillKey}`.toLowerCase().includes(keyword.toLowerCase());
    });
  }, [availableSkills, keyword]);

  const installedColumns: ColumnsType<Skill> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <strong>{record.name}</strong>
          <span>{record.skillKey}</span>
        </Space>
      ),
    },
    { title: '执行器', dataIndex: 'executorKey' },
    { title: '版本', dataIndex: 'version' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value) => <Tag color={value === 'active' ? 'green' : value === 'deprecated' ? 'gold' : 'red'}>{value}</Tag>,
    },
    {
      title: '来源',
      render: (_, record) => <Text type="secondary">{record.sourceType || 'resource-md'}</Text>,
    },
    {
      title: '操作',
      render: (_, record) => {
        if (!record.id) {
          return <Text type="secondary">未同步</Text>;
        }
        return (
          <Space>
            <Button icon={<EyeOutlined />} onClick={() => { api.getSkill(record.id!).then(setDetailSkill); setDetailOpen(true); }}>查看</Button>
            {record.pluginType === 'http-json' ? (
              <Button onClick={() => void openPluginSecretDrawer(record)}>插件配置</Button>
            ) : null}
            <Button onClick={() => api.updateSkillStatus(record.id!, 'active').then(() => { message.success('技能已启用'); return refresh(); })}>启用</Button>
            <Button onClick={() => api.updateSkillStatus(record.id!, 'disabled').then(() => { message.success('技能已禁用'); return refresh(); })}>禁用</Button>
          </Space>
        );
      },
    },
  ];

  const availableColumns: ColumnsType<Skill> = [
    {
      title: '目录技能',
      dataIndex: 'name',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <strong>{record.name}</strong>
          <span>{record.skillKey}@{record.version}</span>
        </Space>
      ),
    },
    { title: '执行器', dataIndex: 'executorKey' },
    {
      title: '来源路径',
      dataIndex: 'sourcePath',
      render: (value: string | undefined) => value || '-',
    },
    {
      title: '说明',
      dataIndex: 'description',
      render: (value: string | undefined) => value || '暂无说明',
    },
  ];

  const detailWhenToUse = toStringArray(detailSkill?.whenToUse);
  const detailWhenNotToUse = toStringArray(detailSkill?.whenNotToUse);
  const detailTags = toStringArray(detailSkill?.tags);
  const detailParametersSchema = toObject(detailSkill?.parametersSchema);
  const detailReturnsSchema = toObject(detailSkill?.returnsSchema);
  const detailPluginKeywords = toStringArray(detailSkill?.pluginTriggerKeywords);
  const detailPluginSecretKeys = toStringArray(detailSkill?.pluginSecretKeys);
  const pluginSecretKeys = toStringArray(pluginSecretSkill?.pluginSecretKeys);
  const pluginMasked = pluginSecretState?.masked ?? {};

  return (
    <div className="resource-page-block">
      <PageHeader
        title="技能管理"
        description={messageText}
        actions={
          <Space wrap>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder={activeTab === 'installed' ? '搜索已同步技能' : '搜索待同步目录技能'}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 240 }}
            />
            {activeTab === 'installed' ? (
              <Select
                value={statusFilter}
                style={{ width: 140 }}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: '全部状态' },
                  { value: 'active', label: '启用' },
                  { value: 'deprecated', label: '弃用' },
                  { value: 'disabled', label: '禁用' },
                ]}
              />
            ) : null}
            <Button className="soft-action-button" icon={<ReloadOutlined />} onClick={() => void refresh()}>
              刷新
            </Button>
          </Space>
        }
      />

      <div style={{ marginBottom: 12 }}>
        <Text type="secondary">技能唯一来源：`apps/server-java/src/main/resources/skills/`，新增/删除目录后重启 Java 服务生效。</Text>
      </div>

      <Segmented
        block
        value={activeTab}
        onChange={(value) => setActiveTab(value as 'installed' | 'available')}
        options={[
          { label: `已同步 (${skills.length})`, value: 'installed' },
          { label: `待同步 (${availableSkills.length})`, value: 'available' },
        ]}
      />

      {activeTab === 'installed' ? (
        <Table
          rowKey="id"
          columns={installedColumns}
          dataSource={filteredInstalledSkills}
          className="table-surface"
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的技能。" /> }}
        />
      ) : (
        <Table
          rowKey={(record) => `${record.skillKey}@${record.version}`}
          columns={availableColumns}
          dataSource={filteredAvailableSkills}
          className="table-surface"
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="目录技能都已同步。" /> }}
        />
      )}

      <Drawer title="技能详情" width={620} open={detailOpen} onClose={() => setDetailOpen(false)}>
        {detailSkill && (
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="技能名称">{detailSkill.name}</Descriptions.Item>
              <Descriptions.Item label="技能标识">{detailSkill.skillKey}</Descriptions.Item>
              <Descriptions.Item label="版本">{detailSkill.version}</Descriptions.Item>
              <Descriptions.Item label="描述">{detailSkill.description || '-'}</Descriptions.Item>
              <Descriptions.Item label="执行器">{detailSkill.executorKey || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={detailSkill.status === 'active' ? 'green' : detailSkill.status === 'deprecated' ? 'gold' : 'red'}>
                  {detailSkill.status || '-'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="插件类型">{detailSkill.pluginType || '-'}</Descriptions.Item>
              <Descriptions.Item label="触发词">{detailPluginKeywords.length ? detailPluginKeywords.join('，') : '-'}</Descriptions.Item>
              <Descriptions.Item label="密钥字段">{detailPluginSecretKeys.length ? detailPluginSecretKeys.join('，') : '-'}</Descriptions.Item>
              <Descriptions.Item label="密钥状态">
                {detailSkill.secretConfigured ? <Tag color="green">已配置</Tag> : <Tag color="default">未配置</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="来源类型">{detailSkill.sourceType || 'resource-md'}</Descriptions.Item>
              <Descriptions.Item label="来源路径">{detailSkill.sourcePath || '-'}</Descriptions.Item>
              <Descriptions.Item label="标签">{detailTags.length ? detailTags.join(', ') : '-'}</Descriptions.Item>
              <Descriptions.Item label="超时时间">{detailSkill.timeoutMs ? `${detailSkill.timeoutMs} ms` : '-'}</Descriptions.Item>
              <Descriptions.Item label="适用场景">
                {detailWhenToUse.length ? detailWhenToUse.join('；') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="不适用场景">
                {detailWhenNotToUse.length ? detailWhenNotToUse.join('；') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailSkill.createdAt ? new Date(detailSkill.createdAt).toLocaleString() : '-'}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detailSkill.updatedAt ? new Date(detailSkill.updatedAt).toLocaleString() : '-'}</Descriptions.Item>
            </Descriptions>
            {detailParametersSchema && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>参数 Schema</div>
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 220, overflow: 'auto' }}>
                  {JSON.stringify(detailParametersSchema, null, 2)}
                </pre>
              </div>
            )}
            {detailReturnsSchema && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>返回 Schema</div>
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 220, overflow: 'auto' }}>
                  {JSON.stringify(detailReturnsSchema, null, 2)}
                </pre>
              </div>
            )}
          </Space>
        )}
      </Drawer>

      <Drawer
        title={pluginSecretSkill ? `插件配置 - ${pluginSecretSkill.name}` : '插件配置'}
        width={520}
        open={pluginSecretOpen}
        onClose={() => {
          setPluginSecretOpen(false);
          setPluginSecretSkill(null);
          setPluginSecretState(null);
          secretForm.resetFields();
        }}
      >
        {pluginSecretSkill ? (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              type="info"
              showIcon
              message={pluginSecretState?.configured ? '当前状态：已配置密钥' : '当前状态：未配置密钥'}
              description="密钥仅存储后端加密密文，前端不回显明文。更新时请输入完整新值。"
            />
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="技能标识">{pluginSecretSkill.skillKey}</Descriptions.Item>
              <Descriptions.Item label="插件类型">{pluginSecretSkill.pluginType || '-'}</Descriptions.Item>
              <Descriptions.Item label="已配置字段">
                {Object.keys(pluginMasked).length > 0
                  ? Object.entries(pluginMasked).map(([key, value]) => `${key}: ${value}`).join('；')
                  : '-'}
              </Descriptions.Item>
            </Descriptions>

            {pluginSecretKeys.length === 0 ? (
              <Alert type="warning" showIcon message="该插件未声明 secretKeys，无需配置密钥。" />
            ) : (
              <Form form={secretForm} layout="vertical">
                {pluginSecretKeys.map((key) => (
                  <Form.Item key={key} label={key} name={key}>
                    <Input.Password placeholder={`请输入 ${key}`} autoComplete="new-password" />
                  </Form.Item>
                ))}
              </Form>
            )}

            <Divider style={{ margin: '4px 0' }} />
            <Space>
              <Button
                type="primary"
                loading={pluginSecretSaving}
                disabled={pluginSecretKeys.length === 0}
                onClick={() => void submitPluginSecret()}
              >
                保存密钥
              </Button>
              <Button danger loading={pluginSecretSaving} onClick={() => void clearPluginSecret()}>
                清除密钥
              </Button>
            </Space>
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
}
