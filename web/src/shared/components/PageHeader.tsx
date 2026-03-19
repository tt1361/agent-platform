import type { ReactNode } from 'react';
import { Space, Typography } from 'antd';

const { Title, Paragraph } = Typography;

interface PageHeaderProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="module-header panel-header-surface">
      <Space direction="vertical" size={2}>
        <span className="page-header-kicker">Console Module</span>
        <Title level={3} style={{ margin: 0 }}>{title}</Title>
        <Paragraph className="page-header-description" style={{ marginBottom: 0 }}>{description}</Paragraph>
      </Space>
      {actions ? <div className="module-actions">{actions}</div> : null}
    </div>
  );
}
