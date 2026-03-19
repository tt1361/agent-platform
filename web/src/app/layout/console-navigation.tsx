import {
  ApartmentOutlined,
  ApiOutlined,
  BookOutlined,
  DashboardOutlined,
  RobotOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';

export const consoleNavItems = [
  { key: '/workspace', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/agents', icon: <RobotOutlined />, label: '智能体' },
  { key: '/skills', icon: <ApartmentOutlined />, label: '技能' },
  { key: '/providers', icon: <ApiOutlined />, label: '模型提供商' },
  { key: '/knowledge', icon: <BookOutlined />, label: '知识库' },
  { key: '/executions', icon: <ScheduleOutlined />, label: '执行记录' },
];

export const consoleTitles: Record<string, { title: string; subtitle: string }> = {
  '/workspace': { title: '会话工作台', subtitle: '围绕上下文会话进行提问、跟踪执行，并在右侧查看智能体与 Trace 细节。' },
  '/agents': { title: '智能体管理', subtitle: '以标准后台方式管理智能体配置、状态、模型与运行策略。' },
  '/skills': { title: '技能管理', subtitle: '维护技能定义、执行器映射与状态，统一沉淀能力资产。' },
  '/providers': { title: '模型提供商', subtitle: '集中查看模型配置、连通状态与调用摘要。' },
  '/knowledge': { title: '知识库与 RAG', subtitle: '维护知识库、导入文档，并为智能体提供检索增强生成能力。' },
  '/executions': { title: '执行记录', subtitle: '追踪历史执行结果、会话链路和步骤明细。' },
};
