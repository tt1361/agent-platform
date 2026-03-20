'use client';

import { ApiOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Empty, Row, Space, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import type { LlmProvider, ProviderTestResult } from '../../../types/api';
import { PageHeader } from '../../../shared/components/PageHeader';

const { Paragraph, Text } = Typography;

interface ProvidersPageProps {
  initialProviders?: LlmProvider[];
  initialMessageText?: string;
}

export function ProvidersPage({ initialProviders = [], initialMessageText = '加载中...' }: ProvidersPageProps) {
  const [providers, setProviders] = useState<LlmProvider[]>(initialProviders);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [messageText, setMessageText] = useState(initialMessageText);
  const [testingId, setTestingId] = useState('');

  async function refresh() {
    const items = await api.listProviders();
    setProviders(items);
    setMessageText(`已加载 ${items.length} 个模型提供商`);
  }

  useEffect(() => {
    if (initialProviders.length > 0) return;
    void refresh().catch((error: Error) => setMessageText(error.message));
  }, [initialProviders.length]);

  async function handleTest(providerId: string) {
    setTestingId(providerId);
    try {
      const result = await api.testProvider(providerId);
      setTestResult(result);
      setMessageText(`测试完成：${result.status}`);
      message.success('模型连通测试已完成');
    } finally {
      setTestingId('');
    }
  }

  return (
    <div className="resource-page-block">
      <PageHeader title="模型提供商" description={messageText} actions={<Button className="soft-action-button" icon={<ReloadOutlined />} onClick={() => void refresh()}>刷新状态</Button>} />
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
                    <Tag color="blue">{provider.status}</Tag>
                  </Space>
                  <Paragraph>{provider.providerKey}</Paragraph>
                  <Text type="secondary">模型：{provider.model}</Text>
                  <Button icon={<ThunderboltOutlined />} loading={testingId === provider.id} onClick={() => void handleTest(provider.id)}>执行连通测试</Button>
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
    </div>
  );
}
