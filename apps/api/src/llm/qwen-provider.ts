import { env } from '../config/env.js';
import { HttpError } from '../common/http-error.js';
import type { ChatCompletionResult, ChatMessage, LlmProviderAdapter } from './types.js';

function normalizeUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export class QwenProvider implements LlmProviderAdapter {
  async chat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.QWEN_TIMEOUT_MS);

    try {
      const response = await fetch(normalizeUrl(env.QWEN_BASE_URL, '/chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.QWEN_API_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: env.QWEN_MODEL,
          messages,
          temperature: 0.2,
        }),
      });

      const data: any = await response.json();
      if (!response.ok) {
        throw new HttpError(502, 'PROVIDER_UNAVAILABLE', data?.error?.message ?? data?.message ?? 'Qwen request failed', data);
      }

      const content = data?.choices?.[0]?.message?.content ?? '';

      return {
        content,
        raw: data,
        usage: {
          inputTokens: data?.usage?.prompt_tokens,
          outputTokens: data?.usage?.completion_tokens,
          totalTokens: data?.usage?.total_tokens,
        },
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpError(504, 'EXECUTION_TIMEOUT', 'Qwen request timed out');
      }
      throw new HttpError(502, 'PROVIDER_UNAVAILABLE', error instanceof Error ? error.message : 'Qwen request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}
