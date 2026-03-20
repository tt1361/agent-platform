import { requestBackend } from '../backend-client';
import type { KnowledgeBase, KnowledgeDocument } from '@/types/api';

export interface KnowledgePageData {
  bases: KnowledgeBase[];
  documents: KnowledgeDocument[];
  statusText: string;
}

export async function getKnowledgePageData(): Promise<KnowledgePageData> {
  try {
    const items = await requestBackend<KnowledgeBase[]>('/api/v1/knowledge/bases');
    return {
      bases: items,
      documents: [],
      statusText: items.length > 0 ? `已加载 ${items.length} 个知识库` : '还没有知识库，请先创建',
    };
  } catch (error) {
    return {
      bases: [],
      documents: [],
      statusText: error instanceof Error ? error.message : '加载失败',
    };
  }
}

export async function getKnowledgeDocumentsData(baseId: string): Promise<KnowledgeDocument[]> {
  if (!baseId) return [];
  try {
    return await requestBackend<KnowledgeDocument[]>(`/api/v1/knowledge/bases/${baseId}/documents`);
  } catch {
    return [];
  }
}
