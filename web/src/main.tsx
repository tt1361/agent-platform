import React from 'react';
import ReactDOM from 'react-dom/client';
import 'antd/dist/reset.css';
import { ViteApp } from './app/vite-app';
import './shared/styles/tokens.css';
import './shared/styles/base.css';
import './shared/styles/layout.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ViteApp />
  </React.StrictMode>,
);
