import { env } from '../config/env.js';
import { HttpError } from '../common/http-error.js';
import type { ChatCompletionResult, ChatMessage, LlmProviderAdapter } from './types.js';

function normalizeUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export class MiniMaxProvider implements LlmProviderAdapter {
  async chat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.MINIMAX_TIMEOUT_MS);

    try {
      const response = await fetch(normalizeUrl(env.MINIMAX_BASE_URL, env.MINIMAX_CHAT_PATH), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.MINIMAX_API_KEY}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: env.MINIMAX_MODEL,
          messages,
          temperature: 0.2,
        }),
      });

      const data: any = await response.json();
      if (!response.ok) {
        throw new HttpError(502, 'PROVIDER_UNAVAILABLE', data?.message ?? 'MiniMax request failed', data);
      }

      const content =
        data?.choices?.[0]?.message?.content ??
        data?.reply ??
        data?.output_text ??
        data?.text ??
        '';

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
        throw new HttpError(504, 'EXECUTION_TIMEOUT', 'MiniMax request timed out');
      }
      throw new HttpError(502, 'PROVIDER_UNAVAILABLE', error instanceof Error ? error.message : 'MiniMax request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}
