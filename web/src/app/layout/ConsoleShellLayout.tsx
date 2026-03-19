import { Avatar, Badge, Button, Divider, Layout, Menu, Space, Tag, Typography } from 'antd';
import type { PropsWithChildren } from 'react';
import { consoleNavItems, consoleTitles } from './console-navigation';

const { Sider, Header, Content } = Layout;
const { Title, Paragraph, Text } = Typography;

interface ConsoleShellLayoutProps extends PropsWithChildren {
  pathname: string;
  onNavigate: (path: string) => void;
}

export function ConsoleShellLayout({ pathname, onNavigate, children }: ConsoleShellLayoutProps) {
  const activePath = pathname || '/workspace';
  const heading = consoleTitles[activePath] ?? consoleTitles['/workspace'];

  return (
    <Layout className="console-shell">
      <Sider width={284} className="console-sider">
        <div className="console-brand">
          <Space align="start" size={14}>
            <Avatar shape="square" size={52} className="brand-avatar">
              智
            </Avatar>
            <div>
              <Text className="brand-kicker">Agent Console</Text>
              <Title level={3} className="brand-title">智能体平台</Title>
              <Paragraph className="brand-description">本地联调与产品化验证控制台。</Paragraph>
            </div>
          </Space>
        </div>

        <Divider className="sider-divider" />

        <Menu
          mode="inline"
          selectedKeys={[activePath]}
          items={consoleNavItems}
          className="console-menu"
          onClick={({ key }) => onNavigate(String(key))}
        />

        <div className="console-sider-footer">
          <Space wrap>
            <Tag color="gold">本地环境</Tag>
            <Tag color="cyan">中文交互</Tag>
          </Space>
          <Paragraph className="sider-footer-copy">Node 22 · MySQL · MiniMax M2.5 · 会话上下文已启用</Paragraph>
        </div>
      </Sider>

      <Layout>
        <Header className="console-header">
          <div>
            <Text className="page-kicker">产品控制台</Text>
            <Title level={2} className="page-title">{heading.title}</Title>
            <Paragraph className="page-subtitle">{heading.subtitle}</Paragraph>
          </div>

          <Space size={12} wrap>
            <Badge status="processing" text="上下文会话中" />
            <Badge status="success" text="模型在线" />
            <Button type="default">查看文档</Button>
          </Space>
        </Header>

        <Content className="console-content">{children}</Content>
      </Layout>
    </Layout>
  );
}
