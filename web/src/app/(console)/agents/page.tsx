import { AgentsPage } from '@/features/agents/pages/AgentsPage';
import { getAgentsPageData } from '@/server/console/agents';

export default async function AgentsRoutePage() {
  const { agents, providers, skills, messageText } = await getAgentsPageData();
  return <AgentsPage initialAgents={agents} initialProviders={providers} initialSkills={skills} initialMessageText={messageText} />;
}
