import { KnowledgePage } from '@/features/knowledge/pages/KnowledgePage';
import { getKnowledgePageData, getKnowledgeDocumentsData } from '@/server/console/knowledge';

export default async function KnowledgeRoutePage() {
  const { bases, statusText } = await getKnowledgePageData();
  const firstBaseId = bases[0]?.id ?? '';
  const documents = firstBaseId ? await getKnowledgeDocumentsData(firstBaseId) : [];
  return <KnowledgePage initialBases={bases} initialDocuments={documents} initialStatusText={statusText} initialSelectedBaseId={firstBaseId} />;
}
