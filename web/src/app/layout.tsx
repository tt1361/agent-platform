import 'antd/dist/reset.css';
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import '../shared/styles/layout.css';
import type { Metadata } from 'next';
import type { PropsWithChildren } from 'react';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: '智能体平台',
  description: '本地联调与产品化验证控制台。',
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
