'use client';

import { ApiOutlined, DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Empty, Form, Input, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import type { LlmModelCatalogItem, LlmProvider, ProviderTestResult } from '../../../types/api';
import { PageHeader } from '../../../shared/components/PageHeader';

const { Paragraph, Text } = Typography;

interface ProvidersPageProps {
  initialProviders?: LlmProvider[];
  initialMessageText?: string;
}

interface ProviderFormValues {
  providerKey: string;
  name: string;
  providerType: string;
  apiBaseUrl: string;
  defaultModel: string;
  status: string;
  apiKey?: string;
}

interface ModelFormValues {
  providerType: string;
  modelKey: string;
  displayName: string;
  capabilitiesText?: string;
  status: string;
  isHot: boolean;
  sort: number;
}

const providerTypeOptions = [
  { label: 'Alibaba Compatible', value: 'openai-compatible' },
];

export function ProvidersPage({ initialProviders = [], initialMessageText = '加载中...' }: ProvidersPageProps) {
  const [providers, setProviders] = useState<LlmProvider[]>(initialProviders);
  const [modelCatalog, setModelCatalog] = useState<LlmModelCatalogItem[]>([]);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [messageText, setMessageText] = useState(initialMessageText);
  const [testingId, setTestingId] = useState('');
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [secretModalOpen, setSecretModalOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LlmProvider | null>(null);
  const [secretProvider, setSecretProvider] = useState<LlmProvider | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [savingModel, setSavingModel] = useState(false);

  const [providerForm] = Form.useForm<ProviderFormValues>();
  const [secretForm] = Form.useForm<{ apiKey: string }>();
  const [modelForm] = Form.useForm<ModelFormValues>();

  async function refresh() {
    const [providerItems, modelItems] = await Promise.all([api.listProviders(), api.listModelCatalog()]);
    setProviders(providerItems);
    setModelCatalog(modelItems);
    setMessageText(`已加载 ${providerItems.length} 个模型厂商，${modelItems.length} 个模型目录项`);
  }

  useEffect(() => {
    void refresh().catch((error: Error) => setMessageText(error.message));
  }, []);

  function openCreateProvider() {
    setEditingProvider(null);
    providerForm.setFieldsValue({
      providerKey: '',
      name: '',
      providerType: 'openai-compatible',
      apiBaseUrl: '',
      defaultModel: '',
      status: 'active',
      apiKey: '',
    });
    setProviderModalOpen(true);
  }

  function openEditProvider(provider: LlmProvider) {
    setEditingProvider(provider);
    providerForm.setFieldsValue({
      providerKey: provider.providerKey,
      name: provider.name,
      providerType: provider.providerType || 'openai-compatible',
      apiBaseUrl: provider.apiBaseUrl || '',
      defaultModel: provider.defaultModel || provider.model,
      status: provider.status,
      apiKey: '',
    });
    setProviderModalOpen(true);
  }

  async function submitProvider() {
    const values = await providerForm.validateFields();
    setSavingProvider(true);
    try {
      if (editingProvider) {
        const payload: Record<string, unknown> = {
          providerKey: values.providerKey,
          name: values.name,
          providerType: values.providerType,
          apiBaseUrl: values.apiBaseUrl,
          defaultModel: values.defaultModel,
          status: values.status,
        };
        if (values.apiKey && values.apiKey.trim()) {
          payload.apiKey = values.apiKey.trim();
        }
        await api.updateProvider(editingProvider.id, payload);
        message.success('模型厂商已更新');
      } else {
        await api.createProvider({
          providerKey: values.providerKey,
          name: values.name,
          providerType: values.providerType,
          apiBaseUrl: values.apiBaseUrl,
          defaultModel: values.defaultModel,
          status: values.status,
          apiKey: values.apiKey,
        });
        message.success('模型厂商已创建');
      }
      setProviderModalOpen(false);
      setEditingProvider(null);
      providerForm.resetFields();
      await refresh();
    } finally {
      setSavingProvider(false);
    }
  }

  function openSecretModal(provider: LlmProvider) {
    setSecretProvider(provider);
    secretForm.setFieldsValue({ apiKey: '' });
    setSecretModalOpen(true);
  }

  async function submitSecret() {
    if (!secretProvider) return;
    const values = await secretForm.validateFields();
    setSavingSecret(true);
    try {
      await api.updateProviderSecret(secretProvider.id, values.apiKey);
      message.success('API Key 已保存');
      setSecretModalOpen(false);
      setSecretProvider(null);
      secretForm.resetFields();
      await refresh();
    } finally {
      setSavingSecret(false);
    }
  }

  async function handleToggleProviderStatus(provider: LlmProvider, enabled: boolean) {
    await api.updateProviderStatus(provider.id, enabled ? 'active' : 'disabled');
    message.success(`厂商状态已切换为 ${enabled ? 'active' : 'disabled'}`);
    await refresh();
  }

  async function handleDeleteProvider(providerId: string) {
    await api.deleteProvider(providerId);
    message.success('厂商已删除');
    await refresh();
  }

  async function handleTest(provider: LlmProvider) {
    setTestingId(provider.id);
    try {
      const result = await api.testProvider(provider.id, {
        modelKey: provider.defaultModel || provider.model,
      });
      setTestResult(result);
      setMessageText(`测试完成：${result.status}`);
      message.success('模型连通测试已完成');
    } finally {
      setTestingId('');
    }
  }

  function openCreateModel() {
    modelForm.setFieldsValue({
      providerType: 'openai-compatible',
      modelKey: '',
      displayName: '',
      capabilitiesText: 'chat,tool_calling',
      status: 'active',
      isHot: true,
      sort: 100,
    });
    setModelModalOpen(true);
  }

  async function submitModel() {
    const values = await modelForm.validateFields();
    const capabilities = (values.capabilitiesText || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    setSavingModel(true);
    try {
      await api.createModelCatalogItem({
        providerType: values.providerType,
        modelKey: values.modelKey,
        displayName: values.displayName,
        capabilities,
        status: values.status,
        isHot: values.isHot,
        sort: values.sort,
      });
      message.success('模型目录项已创建');
      setModelModalOpen(false);
      modelForm.resetFields();
      await refresh();
    } finally {
      setSavingModel(false);
    }
  }

  async function handleToggleModelStatus(item: LlmModelCatalogItem, enabled: boolean) {
    await api.updateModelCatalogItem(item.id, {
      status: enabled ? 'active' : 'disabled',
    });
    message.success(`模型状态已切换为 ${enabled ? 'active' : 'disabled'}`);
    await refresh();
  }

  async function handleDeleteModel(id: string) {
    await api.deleteModelCatalogItem(id);
    message.success('模型目录项已删除');
    await refresh();
  }

  const modelColumns: ColumnsType<LlmModelCatalogItem> = [
    {
      title: '厂商类型',
      dataIndex: 'providerType',
      width: 160,
      render: (value: string) => <Tag>{value}</Tag>,
    },
    {
      title: '模型',
      dataIndex: 'displayName',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.displayName}</Text>
          <Text type="secondary">{record.modelKey}</Text>
        </Space>
      ),
    },
    {
      title: '能力',
      dataIndex: 'capabilities',
      width: 260,
      render: (values: string[]) => (
        <Space wrap>
          {(values || []).map((capability) => (
            <Tag key={capability} color="geekblue">{capability}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '启用',
      dataIndex: 'status',
      width: 90,
      render: (_, record) => (
        <Switch
          size="small"
          checked={record.status === 'active'}
          onChange={(checked) => void handleToggleModelStatus(record, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Popconfirm
          title="删除模型目录项"
          description="删除后将不再出现在可选模型中。"
          okText="删除"
          cancelText="取消"
          onConfirm={() => void handleDeleteModel(record.id)}
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="resource-page-block">
      <PageHeader
        title="模型提供商"
        description={messageText}
        actions={(
          <Space>
            <Button className="soft-action-button" icon={<PlusOutlined />} onClick={openCreateProvider}>新增厂商</Button>
            <Button className="soft-action-button" icon={<ReloadOutlined />} onClick={() => void refresh()}>刷新状态</Button>
          </Space>
        )}
      />
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={14}>
          <div className="provider-grid">
            {providers.map((provider) => (
              <Card key={provider.id} className="console-card provider-antd-card" hoverable>
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space>
                      <ApiOutlined />
                      <Text strong>{provider.name}</Text>
                    </Space>
                    <Tag color={provider.status === 'active' ? 'blue' : 'default'}>{provider.status}</Tag>
                  </Space>
                  <Paragraph>{provider.providerKey}</Paragraph>
                  <Text type="secondary">类型：{provider.providerType || '-'}</Text>
                  <Text type="secondary">默认模型：{provider.defaultModel || provider.model || '-'}</Text>
                  <Text type="secondary">密钥：{provider.secretConfigured ? '已配置' : '未配置'} {provider.secretMasked?.apiKey ? `(${provider.secretMasked.apiKey})` : ''}</Text>
                  <Space wrap>
                    <Button icon={<ThunderboltOutlined />} loading={testingId === provider.id} onClick={() => void handleTest(provider)}>连通测试</Button>
                    <Button icon={<EditOutlined />} onClick={() => openEditProvider(provider)}>编辑</Button>
                    <Button icon={<KeyOutlined />} onClick={() => openSecretModal(provider)}>配置密钥</Button>
                    <Switch
                      size="small"
                      checked={provider.status === 'active'}
                      checkedChildren="启用"
                      unCheckedChildren="停用"
                      onChange={(checked) => void handleToggleProviderStatus(provider, checked)}
                    />
                    <Popconfirm
                      title="删除厂商账号"
                      description="删除后该账号将无法继续调用模型。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => void handleDeleteProvider(provider.id)}
                    >
                      <Button danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                </Space>
              </Card>
            ))}
          </div>
        </Col>
        <Col xs={24} lg={10}>
          <Card className="console-card accent-card" title="测试结果">
            {testResult ? (
              <Descriptions column={1} size="small">
                <Descriptions.Item label="模型">{testResult.model}</Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color="green">{testResult.status}</Tag></Descriptions.Item>
                <Descriptions.Item label="预览内容">{testResult.contentPreview}</Descriptions.Item>
                <Descriptions.Item label="输入 Tokens">{testResult.usage?.inputTokens ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="输出 Tokens">{testResult.usage?.outputTokens ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="总 Tokens">{testResult.usage?.totalTokens ?? '-'}</Descriptions.Item>
              </Descriptions>
            ) : providers.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可用的模型提供商。" />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="点击任一 Provider 的测试按钮后，这里会展示结果。" />
            )}
          </Card>
        </Col>
      </Row>

      <Card
        className="console-card"
        style={{ marginTop: 20 }}
        title="热门模型目录"
        extra={<Button icon={<PlusOutlined />} onClick={openCreateModel}>新增模型</Button>}
      >
        <Table
          rowKey="id"
          columns={modelColumns}
          dataSource={modelCatalog}
          pagination={{ pageSize: 8, showSizeChanger: false }}
        />
      </Card>

      <Modal
        title={editingProvider ? '编辑模型厂商' : '新增模型厂商'}
        open={providerModalOpen}
        onCancel={() => {
          setProviderModalOpen(false);
          setEditingProvider(null);
          providerForm.resetFields();
        }}
        onOk={() => void submitProvider()}
        confirmLoading={savingProvider}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={providerForm} layout="vertical">
          <Form.Item name="providerKey" label="providerKey" rules={[{ required: true, message: '请输入 providerKey' }]}>
            <Input placeholder="例如: openai-main" />
          </Form.Item>
          <Form.Item name="name" label="显示名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="例如: OpenAI 主账号" />
          </Form.Item>
          <Form.Item name="providerType" label="厂商类型" rules={[{ required: true, message: '请选择厂商类型' }]}>
            <Select options={providerTypeOptions} />
          </Form.Item>
          <Form.Item name="apiBaseUrl" label="API Base URL" rules={[{ required: true, message: '请输入 API Base URL' }]}>
            <Input placeholder="例如: https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item name="defaultModel" label="默认模型" rules={[{ required: true, message: '请输入默认模型' }]}>
            <Input placeholder="例如: gpt-4o" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { label: 'active', value: 'active' },
                { label: 'disabled', value: 'disabled' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={editingProvider ? 'API Key（可选，不填则保持原值）' : 'API Key'}
            rules={editingProvider ? [] : [{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="请输入 API Key" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`配置 API Key - ${secretProvider?.name || ''}`}
        open={secretModalOpen}
        onCancel={() => {
          setSecretModalOpen(false);
          setSecretProvider(null);
          secretForm.resetFields();
        }}
        onOk={() => void submitSecret()}
        confirmLoading={savingSecret}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={secretForm} layout="vertical">
          <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
            <Input.Password placeholder="请输入新的 API Key" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新增模型目录项"
        open={modelModalOpen}
        onCancel={() => {
          setModelModalOpen(false);
          modelForm.resetFields();
        }}
        onOk={() => void submitModel()}
        confirmLoading={savingModel}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={modelForm} layout="vertical">
          <Form.Item name="providerType" label="厂商类型" rules={[{ required: true, message: '请选择厂商类型' }]}>
            <Select options={providerTypeOptions} />
          </Form.Item>
          <Form.Item name="modelKey" label="模型 Key" rules={[{ required: true, message: '请输入模型 Key' }]}>
            <Input placeholder="例如: gpt-4.1" />
          </Form.Item>
          <Form.Item name="displayName" label="展示名称" rules={[{ required: true, message: '请输入展示名称' }]}>
            <Input placeholder="例如: OpenAI GPT-4.1" />
          </Form.Item>
          <Form.Item name="capabilitiesText" label="能力（逗号分隔）">
            <Input placeholder="例如: chat,vision,tool_calling" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select
              options={[
                { label: 'active', value: 'active' },
                { label: 'disabled', value: 'disabled' },
              ]}
            />
          </Form.Item>
          <Form.Item name="sort" label="排序" rules={[{ required: true, message: '请输入排序值' }]}>
            <Input type="number" />
          </Form.Item>
          <Form.Item name="isHot" label="热门模型" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
