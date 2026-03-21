import { DeleteOutlined, EditOutlined, MessageOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Select, Space, Tag, Typography } from 'antd';
import { Conversations } from '@ant-design/x';
import type { ConversationsProps } from '@ant-design/x';
import type { Agent, Conversation } from '../../../types/api';

const { Text, Paragraph } = Typography;

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function getConversationPreview(conversation: Conversation) {
  const executions = conversation.executions ?? [];
  const lastExecution = executions[executions.length - 1];
  if (!lastExecution) return '尚未开始对话';
  return (lastExecution.outputText || lastExecution.inputText || '暂无内容').slice(0, 28);
}

interface ConversationSidebarProps {
  agents: Agent[];
  selectedAgentId: string;
  canCreateConversation?: boolean;
  onSelectAgent: (agentId: string) => void;
  conversations: Conversation[];
  selectedConversationId: string;
  onSelectConversation: (conversationId: string) => void;
  onCreateConversation: () => void;
  onRenameConversation: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string) => void;
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  const {
    agents,
    selectedAgentId,
    canCreateConversation = true,
    onSelectAgent,
    conversations,
    selectedConversationId,
    onSelectConversation,
    onCreateConversation,
    onRenameConversation,
    onDeleteConversation,
  } = props;

  const conversationItems = conversations.map((conversation) => ({
    key: conversation.id,
    label: (
      <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
        <Text strong style={{ fontSize: 14 }}>{conversation.title}</Text>
        <Text type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
          {(conversation.executions ?? []).length} 轮对话 · {formatRelativeTime(conversation.updatedAt)}
        </Text>
      </div>
    ),
  }));

  const menuForConversation = (item: any): ConversationsProps['menu'] => (event: any) => ({
    items: [
      {
        key: 'rename',
        label: '重命名',
        icon: <EditOutlined />,
      },
      {
        key: 'delete',
        label: '删除',
        icon: <DeleteOutlined />,
        danger: true,
      },
    ],
    onClick: (menuInfo) => {
      if (menuInfo.key === 'rename') {
        onRenameConversation(item.key);
      } else if (menuInfo.key === 'delete') {
        onDeleteConversation(item.key);
      }
    },
  });

  return (
    <div className="workspace-left-rail">
      <Card className="console-card hover-card" title="当前智能体">
        <Select
          value={selectedAgentId || undefined}
          placeholder="请选择智能体"
          style={{ width: '100%' }}
          onChange={onSelectAgent}
          options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
        />

        {agents.find((item) => item.id === selectedAgentId) ? (
          <div className="selected-agent-summary">
            <Space direction="vertical" size={4}>
              <Text strong>{agents.find((item) => item.id === selectedAgentId)?.name}</Text>
              <Paragraph className="muted-paragraph" ellipsis={{ rows: 2 }}>
                {agents.find((item) => item.id === selectedAgentId)?.description || '未填写描述'}
              </Paragraph>
              <Tag color="blue">{agents.find((item) => item.id === selectedAgentId)?.status}</Tag>
            </Space>
          </div>
        ) : null}
      </Card>

      <Card
        className="console-card hover-card flex-card"
        title="会话列表"
        extra={
          <Button className="soft-action-button" icon={<PlusOutlined />} onClick={onCreateConversation} disabled={!canCreateConversation}>
            新建
          </Button>
        }
      >
        {conversations.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有会话，发送第一条消息后会自动创建。" />
        ) : (
          <Conversations
            activeKey={selectedConversationId}
            onActiveChange={onSelectConversation}
            items={conversationItems}
            menu={menuForConversation as any}
          />
        )}
      </Card>

      <Card className="console-card subtle-card" size="small">
        <Space align="start">
          <MessageOutlined className="accent-icon" />
          <div>
            <Text strong>使用建议</Text>
            <Paragraph className="muted-paragraph">在同一会话中连续追问，智能体会自动带上历史上下文。</Paragraph>
          </div>
        </Space>
      </Card>
    </div>
  );
}
