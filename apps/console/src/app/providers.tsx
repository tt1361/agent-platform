'use client';

import { App as AntApp, ConfigProvider, theme } from 'antd';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import zhCN from 'antd/locale/zh_CN';
import type { PropsWithChildren } from 'react';

export function Providers({ children }: PropsWithChildren) {
  return (
    <AntdRegistry>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1f4b7a',
            colorInfo: '#1f4b7a',
            colorSuccess: '#1f845a',
            colorWarning: '#b36b00',
            colorError: '#c2412d',
            borderRadius: 14,
            fontFamily: 'IBM Plex Sans, PingFang SC, Microsoft YaHei, sans-serif',
            colorBgLayout: '#f3f6fb',
          },
          components: {
            Layout: {
              siderBg: '#f7fafc',
              bodyBg: '#f3f6fb',
              headerBg: '#f3f6fb',
            },
            Menu: {
              itemBg: 'transparent',
              itemColor: '#243447',
              itemHoverColor: '#1f4b7a',
              itemHoverBg: '#eef5ff',
              itemSelectedColor: '#1f4b7a',
              itemSelectedBg: '#dcebff',
              itemActiveBg: '#e3efff',
            },
            Card: {
              borderRadiusLG: 18,
            },
            Button: {
              controlHeight: 40,
            },
          },
        }}
      >
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </AntdRegistry>
  );
}
