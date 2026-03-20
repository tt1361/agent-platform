import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { Flex, Spin } from 'antd';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layout/AppShell';

const WorkspacePage = lazy(() => import('../features/workspace/pages/WorkspacePage').then((module) => ({ default: module.WorkspacePage })));
const AgentsPage = lazy(() => import('../features/agents/pages/AgentsPage').then((module) => ({ default: module.AgentsPage })));
const SkillsPage = lazy(() => import('../features/skills/pages/SkillsPage').then((module) => ({ default: module.SkillsPage })));
const ProvidersPage = lazy(() => import('../features/providers/pages/ProvidersPage').then((module) => ({ default: module.ProvidersPage })));
const ExecutionsPage = lazy(() => import('../features/executions/pages/ExecutionsPage').then((module) => ({ default: module.ExecutionsPage })));
const KnowledgePage = lazy(() => import('../features/knowledge/pages/KnowledgePage').then((module) => ({ default: module.KnowledgePage })));

function RouteFallback() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: '50vh' }}>
      <Spin size="large" tip="页面加载中..." />
    </Flex>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/workspace" replace /> },
      { path: '/workspace', element: withSuspense(<WorkspacePage />) },
      { path: '/agents', element: withSuspense(<AgentsPage />) },
      { path: '/skills', element: withSuspense(<SkillsPage />) },
      { path: '/providers', element: withSuspense(<ProvidersPage />) },
      { path: '/executions', element: withSuspense(<ExecutionsPage />) },
      { path: '/knowledge', element: withSuspense(<KnowledgePage />) },
    ],
  },
]);
