import { WorkspacePage } from '@/features/workspace/pages/WorkspacePage';
import { getWorkspacePageData } from '@/server/console/workspace';

export default async function WorkspaceRoutePage() {
  const { agents, skills, providers, conversations, statusText } = await getWorkspacePageData();
  return <WorkspacePage initialAgents={agents} initialSkills={skills} initialProviders={providers} initialConversations={conversations} initialStatusText={statusText} />;
}
