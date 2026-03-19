import type { LlmProvider } from '@/types/api';
import { requestBackend } from '../backend-client';

export async function getProvidersPageData() {
  try {
    const providers = await requestBackend<LlmProvider[]>('/api/v1/llm-providers');
    return {
      providers,
      messageText: `已加载 ${providers.length} 个模型提供商`,
    };
  } catch (error) {
    return {
      providers: [] as LlmProvider[],
      messageText: error instanceof Error ? error.message : '加载中...',
    };
  }
}
