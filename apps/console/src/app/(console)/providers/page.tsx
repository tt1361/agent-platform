import { ProvidersPage } from '@/features/providers/pages/ProvidersPage';
import { getProvidersPageData } from '@/server/console/providers';

export default async function ProvidersRoutePage() {
  const { providers, messageText } = await getProvidersPageData();
  return <ProvidersPage initialProviders={providers} initialMessageText={messageText} />;
}
