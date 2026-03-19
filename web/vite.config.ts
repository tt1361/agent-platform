import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@ant-design/icons')) return 'antd-icons';

          if (id.includes('node_modules/antd')) {
            if (
              id.includes('/table/') ||
              id.includes('/pagination/') ||
              id.includes('/list/') ||
              id.includes('/timeline/') ||
              id.includes('/descriptions/')
            ) {
              return 'antd-data-display';
            }

            if (
              id.includes('/form/') ||
              id.includes('/input/') ||
              id.includes('/select/') ||
              id.includes('/segmented/') ||
              id.includes('/checkbox/') ||
              id.includes('/radio/')
            ) {
              return 'antd-form-controls';
            }

            if (
              id.includes('/modal/') ||
              id.includes('/drawer/') ||
              id.includes('/message/') ||
              id.includes('/notification/') ||
              id.includes('/popconfirm/') ||
              id.includes('/alert/') ||
              id.includes('/spin/') ||
              id.includes('/empty/')
            ) {
              return 'antd-feedback';
            }

            if (
              id.includes('/layout/') ||
              id.includes('/menu/') ||
              id.includes('/card/') ||
              id.includes('/space/') ||
              id.includes('/tag/') ||
              id.includes('/typography/') ||
              id.includes('/button/') ||
              id.includes('/avatar/') ||
              id.includes('/badge/') ||
              id.includes('/divider/')
            ) {
              return 'antd-layout';
            }

            return 'antd-misc';
          }

          if (id.includes('node_modules/react-router')) return 'router';
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
