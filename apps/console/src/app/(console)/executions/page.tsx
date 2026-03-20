import { ExecutionsPage } from '@/features/executions/pages/ExecutionsPage';
import { getExecutionsPageData } from '@/server/console/executions';

export default async function ExecutionsRoutePage() {
  const { executions, messageText } = await getExecutionsPageData();
  return <ExecutionsPage initialExecutions={executions} initialMessageText={messageText} />;
}
