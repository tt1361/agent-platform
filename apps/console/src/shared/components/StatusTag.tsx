import { Tag } from 'antd';

interface StatusTagProps {
  status: string;
}

export function StatusTag({ status }: StatusTagProps) {
  const tone =
    status === 'active' || status === 'succeeded' || status === 'ok'
      ? 'success'
      : status === 'failed' || status === 'error'
        ? 'danger'
        : status === 'deprecated' || status === 'archived' || status === 'timeout'
          ? 'warning'
          : 'neutral';

  const color = tone === 'success' ? 'green' : tone === 'danger' ? 'red' : tone === 'warning' ? 'gold' : 'default';
  return <Tag color={color}>{status}</Tag>;
}
