import { env } from '../config/env.js';
import { HttpError } from '../common/http-error.js';
import type { ChatCompletionResult, ChatMessage, LlmProviderAdapter } from './types.js';

function normalizeUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export class GeminiProvider implements LlmProviderAdapter {
  async chat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.GEMINI_TIMEOUT_MS);

    try {
      // Use standard contents mapping for Google Gemini API
      const contents = messages
        .filter(m => m.role !== 'system') // Skip system in standard contents for simplicity in test testConnection
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        }));

      const url = normalizeUrl(
        env.GEMINI_BASE_URL,
        `/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`
      );

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.2,
          },
        }),
      });

      const data: any = await response.json();
      if (!response.ok) {
        throw new HttpError(
          502,
          'PROVIDER_UNAVAILABLE',
          data?.error?.message ?? 'Gemini request failed',
          data
        );
      }

      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      return {
        content,
        raw: data,
        usage: {
          inputTokens: data?.usageMetadata?.promptTokenCount,
          outputTokens: data?.usageMetadata?.candidatesTokenCount,
          totalTokens: data?.usageMetadata?.totalTokenCount,
        },
      };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpError(504, 'EXECUTION_TIMEOUT', 'Gemini request timed out');
      }
      throw new HttpError(502, 'PROVIDER_UNAVAILABLE', error instanceof Error ? error.message : 'Gemini request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}
