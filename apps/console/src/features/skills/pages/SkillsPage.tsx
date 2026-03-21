'use client';

import { DeleteOutlined, EyeOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Descriptions, Drawer, Empty, Form, Input, message, Popconfirm, Segmented, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api';
import type { Skill } from '../../../types/api';
import { PageHeader } from '../../../shared/components/PageHeader';

interface SkillFormValues {
  skillKey: string;
  name: string;
  version: string;
  description?: string;
  executorKey: 'echo' | 'summarize_text' | 'extract_keywords' | 'get_weather';
  status: 'active' | 'deprecated' | 'disabled';
}

interface SkillsPageProps {
  initialSkills?: Skill[];
  initialAvailableSkills?: Skill[];
  initialMessageText?: string;
}

export function SkillsPage({ initialSkills = [], initialAvailableSkills = [], initialMessageText = '加载中...' }: SkillsPageProps) {
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [availableSkills, setAvailableSkills] = useState<Skill[]>(initialAvailableSkills);
  const [open, setOpen] = useState(false);
  const [messageText, setMessageText] = useState(initialMessageText);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | NonNullable<Skill['status']>>('all');
  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('installed');
  const [form] = Form.useForm<SkillFormValues>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSkill, setDetailSkill] = useState<Skill | null>(null);

  async function refresh() {
    const [installedItems, discoveredItems] = await Promise.all([api.listSkills(), api.listAvailableSkills()]);
    setSkills(installedItems);
    setAvailableSkills(discoveredItems);
    setMessageText(`已安装 ${installedItems.length} 个技能，发现 ${discoveredItems.length} 个可用插件`);
  }

  async function handleInstall(skill: Skill) {
    await api.createSkill({
      skillKey: skill.skillKey,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      executorKey: skill.executorKey,
      status: 'active',
      parametersSchema: skill.parametersSchema || {},
      returnsSchema: skill.returnsSchema || {},
      tags: skill.tags || ['plugin'],
    });
    await refresh();
    message.success(`已安装技能插件：${skill.name}`);
  }

  async function handleCreate(values: SkillFormValues) {
    await api.createSkill({
      ...values,
      parametersSchema: values.executorKey === 'get_weather'
        ? {
            type: 'object',
            properties: { location: { type: 'string', description: '城市名称，例如：上海' } },
            required: ['location'],
          }
        : { type: 'object', properties: { text: { type: 'string' } } },
      returnsSchema: { type: 'object' },
      tags: ['custom'],
    });
    setOpen(false);
    form.resetFields();
    await refresh();
    message.success('技能已创建');
  }

  const installedSkillSignatures = useMemo(
    () => new Set(skills.map((skill) => `${skill.skillKey}@${skill.version}`)),
    [skills],
  );

  const filteredInstalledSkills = useMemo(() => {
    return skills.filter((skill) => {
      const matchesKeyword = keyword.trim().length === 0 || `${skill.name} ${skill.skillKey}`.toLowerCase().includes(keyword.toLowerCase());
      const matchesStatus = statusFilter === 'all' || skill.status === statusFilter;
      return matchesKeyword && matchesStatus;
    });
  }, [skills, keyword, statusFilter]);

  const filteredAvailableSkills = useMemo(() => {
    return availableSkills.filter((skill) => {
      if (installedSkillSignatures.has(`${skill.skillKey}@${skill.version}`)) return false;
      return keyword.trim().length === 0 || `${skill.name} ${skill.skillKey}`.toLowerCase().includes(keyword.toLowerCase());
    });
  }, [availableSkills, installedSkillSignatures, keyword]);

  const availableInstalledOverlap = useMemo(() => {
    return skills.filter((item) => availableSkills.some((plugin) => `${plugin.skillKey}@${plugin.version}` === `${item.skillKey}@${item.version}`)).length;
  }, [skills, availableSkills]);

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
    { title: '状态', dataIndex: 'status', render: (value) => <Tag color={value === 'active' ? 'green' : value === 'deprecated' ? 'gold' : 'red'}>{value}</Tag> },
    {
      title: '操作',
      render: (_, record) => (
        <Space>
          <Button icon={<EyeOutlined />} onClick={() => { if (record.id) { api.getSkill(record.id).then(setDetailSkill); setDetailOpen(true); } }}>查看</Button>
          <Button onClick={() => api.updateSkillStatus(record.id!, 'active').then(() => { message.success('技能已启用'); return refresh(); })}>启用</Button>
          <Button onClick={() => api.updateSkillStatus(record.id!, 'deprecated').then(() => { message.success('技能已弃用'); return refresh(); })}>弃用</Button>
          <Popconfirm
            title="确认卸载技能？"
            description="内置技能卸载后会回到可用插件列表；自定义技能卸载后将被删除。"
            onConfirm={() => api.deleteSkill(record.id!).then(() => { message.success('技能已卸载'); return refresh(); })}
          >
            <Button danger icon={<DeleteOutlined />}>卸载</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const availableColumns: ColumnsType<Skill> = [
    {
      title: '插件名称',
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
      title: '说明',
      dataIndex: 'description',
      render: (value: string | undefined) => value || '暂无说明',
    },
    {
      title: '操作',
      render: (_, record) => (
        <Button type="primary" onClick={() => void handleInstall(record)}>
          安装
        </Button>
      ),
    },
  ];

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
              placeholder={activeTab === 'installed' ? '搜索已安装技能' : '搜索可用插件'}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              style={{ width: 220 }}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              新建技能
            </Button>
          </Space>
        }
      />

      <Segmented
        block
        value={activeTab}
        onChange={(value) => setActiveTab(value as 'installed' | 'available')}
        options={[
            { label: `已安装技能 (${skills.length})`, value: 'installed' },
          { label: `可用插件 (${Math.max(0, availableSkills.length - availableInstalledOverlap)})`, value: 'available' },
        ]}
      />

      {activeTab === 'installed' ? (
        <Table
          rowKey="id"
          columns={installedColumns}
          dataSource={filteredInstalledSkills}
          className="table-surface"
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的已安装技能。" /> }}
        />
      ) : (
        <Table
          rowKey="skillKey"
          columns={availableColumns}
          dataSource={filteredAvailableSkills}
          className="table-surface"
          pagination={{ pageSize: 8 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可安装的插件，或者已经全部安装。" /> }}
        />
      )}

      <Drawer title="新建技能" width={500} open={open} onClose={() => setOpen(false)} destroyOnHidden>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            skillKey: 'custom-echo',
            name: '自定义回显技能',
            version: '1.0.0',
            description: '一个用于联调的简单回显技能',
            executorKey: 'echo',
            status: 'active',
          }}
          onFinish={(values) => void handleCreate(values)}
        >
          <Form.Item label="技能名称" name="name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="技能标识" name="skillKey" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="版本" name="version" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item label="描述" name="description"><Input.TextArea rows={4} /></Form.Item>
          <Form.Item label="执行器" name="executorKey" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'echo', label: '回显' },
                { value: 'summarize_text', label: '摘要' },
                { value: 'extract_keywords', label: '关键词提取' },
                { value: 'get_weather', label: '天气查询' },
              ]}
            />
          </Form.Item>
          <Form.Item label="状态" name="status" rules={[{ required: true }]}>
            <Select options={[{ value: 'active', label: '启用' }, { value: 'deprecated', label: '弃用' }, { value: 'disabled', label: '禁用' }]} />
          </Form.Item>
          <Button htmlType="submit" type="primary" block>创建技能</Button>
        </Form>
      </Drawer>

      <Drawer title="技能详情" width={560} open={detailOpen} onClose={() => setDetailOpen(false)}>
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
              <Descriptions.Item label="标签">{detailSkill.tags?.join(', ') || '-'}</Descriptions.Item>
              <Descriptions.Item label="超时时间">{detailSkill.timeoutMs ? `${detailSkill.timeoutMs} ms` : '-'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detailSkill.createdAt ? new Date(detailSkill.createdAt).toLocaleString() : '-'}</Descriptions.Item>
              <Descriptions.Item label="更新时间">{detailSkill.updatedAt ? new Date(detailSkill.updatedAt).toLocaleString() : '-'}</Descriptions.Item>
            </Descriptions>
            {detailSkill.parametersSchema && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>参数 Schema</div>
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                  {JSON.stringify(detailSkill.parametersSchema, null, 2)}
                </pre>
              </div>
            )}
            {detailSkill.returnsSchema && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>返回 Schema</div>
                <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 200, overflow: 'auto' }}>
                  {JSON.stringify(detailSkill.returnsSchema, null, 2)}
                </pre>
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
