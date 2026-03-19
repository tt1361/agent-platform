import { DeleteOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Card, Col, Empty, Form, Input, List, Modal, Row, Space, Table, Tabs, Tag, Typography, Upload, message } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api';
import type { KnowledgeBase, KnowledgeDocument } from '../../../types/api';
import { PageHeader } from '../../../shared/components/PageHeader';

const { Paragraph, Text } = Typography;

export function KnowledgePage() {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState('');
  const [statusText, setStatusText] = useState('加载知识库中...');
  const [createOpen, setCreateOpen] = useState(false);
  const [manualForm] = Form.useForm<{ title: string; content: string }>();
  const [baseForm] = Form.useForm<{ name: string; description?: string }>();
  const [urlForm] = Form.useForm<{ url: string; title?: string }>();
  const [uploading, setUploading] = useState(false);

  const selectedBase = useMemo(() => bases.find((item) => item.id === selectedBaseId), [bases, selectedBaseId]);

  async function refreshBases(preferredId?: string) {
    const items = await api.listKnowledgeBases();
    setBases(items);
    const nextId = preferredId ?? selectedBaseId ?? items[0]?.id ?? '';
    setSelectedBaseId(nextId);
    setStatusText(items.length > 0 ? `已加载 ${items.length} 个知识库` : '还没有知识库，请先创建');
    return nextId;
  }

  async function refreshDocuments(baseId: string) {
    if (!baseId) {
      setDocuments([]);
      return;
    }
    const items = await api.listKnowledgeDocuments(baseId);
    setDocuments(items);
  }

  useEffect(() => {
    void refreshBases()
      .then((baseId) => refreshDocuments(baseId))
      .catch((error: Error) => setStatusText(error.message));
  }, []);

  useEffect(() => {
    void refreshDocuments(selectedBaseId).catch((error: Error) => setStatusText(error.message));
  }, [selectedBaseId]);

  async function handleCreateBase(values: { name: string; description?: string }) {
    const created = await api.createKnowledgeBase(values);
    await refreshBases(created.id);
    await refreshDocuments(created.id);
    setCreateOpen(false);
    baseForm.resetFields();
    message.success('知识库已创建');
  }

  async function handleDeleteBase(baseId: string) {
    await api.deleteKnowledgeBase(baseId);
    const nextId = await refreshBases();
    await refreshDocuments(nextId);
    message.success('知识库已删除');
  }

  async function handleManualSubmit(values: { title: string; content: string }) {
    if (!selectedBaseId) return;
    await api.createManualKnowledgeDocument(selectedBaseId, values);
    manualForm.resetFields();
    await refreshDocuments(selectedBaseId);
    message.success('知识条目已入库');
  }

  async function handleUrlSubmit(values: { url: string; title?: string }) {
    if (!selectedBaseId) return;
    await api.createUrlKnowledgeDocument(selectedBaseId, values);
    urlForm.resetFields();
    await refreshDocuments(selectedBaseId);
    message.success('网页内容已抓取入库');
  }

  async function handleDeleteDocument(documentId: string) {
    await api.deleteKnowledgeDocument(documentId);
    await refreshDocuments(selectedBaseId);
    message.success('文档已删除');
  }

  async function handleDownload(document: KnowledgeDocument) {
    const result = await api.getKnowledgeDocumentDownload(document.id);
    const backendOrigin = `${window.location.protocol}//${window.location.hostname}:3000`;
    const targetUrl = result.url.startsWith('http') ? result.url : `${backendOrigin}${result.url}`;
    if ((document.mimeType || '').includes('pdf') || (document.fileName || '').toLowerCase().endsWith('.pdf')) {
      window.open(targetUrl, '_blank', 'noopener');
      return;
    }

    const link = window.document.createElement('a');
    link.href = targetUrl;
    link.download = result.fileName || document.fileName || 'knowledge-file';
    link.rel = 'noopener';
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  }

  return (
    <div className="resource-page-block">
      <PageHeader
        title="知识库与 RAG"
        description={statusText}
        actions={
          <Space>
            <Button className="soft-action-button" icon={<ReloadOutlined />} onClick={() => void refreshBases(selectedBaseId).then((id) => refreshDocuments(id))}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建知识库
            </Button>
          </Space>
        }
      />

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={7}>
          <Card className="console-card" title="知识库列表">
            {bases.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无知识库" />
            ) : (
              <List
                dataSource={bases}
                renderItem={(base) => (
                  <List.Item
                    className={base.id === selectedBaseId ? 'knowledge-base-item active' : 'knowledge-base-item'}
                    actions={[
                      <Button key="pick" type="link" onClick={() => setSelectedBaseId(base.id)}>选择</Button>,
                      <Button key="delete" type="link" danger onClick={() => void handleDeleteBase(base.id)}>删除</Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={<Space><span>{base.name}</span><Tag color={base.status === 'active' ? 'green' : 'default'}>{base.status}</Tag></Space>}
                      description={<Text type="secondary">文档数 {base._count?.documents ?? 0}</Text>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={17}>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <Card className="console-card" title={selectedBase ? `导入到：${selectedBase.name}` : '请选择知识库'}>
              {selectedBase ? (
                <Tabs
                  items={[
                    {
                      key: 'upload',
                      label: '本地上传',
                      children: (
                        <Upload
                          multiple
                          showUploadList={false}
                          beforeUpload={async (file) => {
                            setUploading(true);
                            try {
                              await api.uploadKnowledgeDocument(selectedBase.id, file);
                              await refreshDocuments(selectedBase.id);
                              message.success(`${file.name} 已上传入库`);
                            } finally {
                              setUploading(false);
                            }
                            return false;
                          }}
                        >
                          <Button icon={<UploadOutlined />} loading={uploading}>上传 txt / md / pdf / docx</Button>
                        </Upload>
                      ),
                    },
                    {
                      key: 'manual',
                      label: '手工录入',
                      children: (
                        <Form layout="vertical" form={manualForm} onFinish={(values) => void handleManualSubmit(values)}>
                          <Form.Item name="title" label="标题" rules={[{ required: true }]}>
                            <Input placeholder="例如：产品术语表" />
                          </Form.Item>
                          <Form.Item name="content" label="内容" rules={[{ required: true }]}>
                            <Input.TextArea rows={6} placeholder="直接输入知识正文" />
                          </Form.Item>
                          <Button type="primary" htmlType="submit">保存并分块</Button>
                        </Form>
                      ),
                    },
                    {
                      key: 'url',
                      label: '网页抓取',
                      children: (
                        <Form layout="vertical" form={urlForm} onFinish={(values) => void handleUrlSubmit(values)}>
                          <Form.Item name="url" label="网页 URL" rules={[{ required: true }]}>
                            <Input prefix={<LinkOutlined />} placeholder="https://example.com/article" />
                          </Form.Item>
                          <Form.Item name="title" label="标题（可选）">
                            <Input placeholder="不填则自动抓取网页标题" />
                          </Form.Item>
                          <Button type="primary" htmlType="submit">抓取并入库</Button>
                        </Form>
                      ),
                    },
                  ]}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="左侧选择或创建知识库后，即可导入内容。" />
              )}
            </Card>

            <Card className="console-card" title="文档列表">
              <Table
                rowKey="id"
                dataSource={documents}
                pagination={false}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前知识库暂无文档" /> }}
                columns={[
                  { title: '标题', dataIndex: 'title', key: 'title' },
                  { title: '来源', dataIndex: 'sourceType', key: 'sourceType', render: (value: string) => <Tag>{value}</Tag> },
                  { title: '状态', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'ready' ? 'green' : value === 'failed' ? 'red' : 'blue'}>{value}</Tag> },
                  { title: 'Chunks', key: 'chunks', render: (_, record: KnowledgeDocument) => record._count?.chunks ?? record.chunkCount },
                  {
                    title: '操作',
                    key: 'actions',
                    render: (_, record: KnowledgeDocument) => (
                      <Space>
                        {record.sourceType === 'upload' ? <Button size="small" onClick={() => void handleDownload(record)}>原文件</Button> : null}
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => void handleDeleteDocument(record.id)}>删除</Button>
                      </Space>
                    ),
                  },
                ]}
              />
            </Card>
          </Space>
        </Col>
      </Row>

      <Modal title="新建知识库" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => void baseForm.submit()} okText="创建" cancelText="取消">
        <Form form={baseForm} layout="vertical" onFinish={(values) => void handleCreateBase(values)}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入知识库名称' }]}>
            <Input placeholder="例如：产品文档库" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={4} placeholder="描述这个知识库的用途和内容范围" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
