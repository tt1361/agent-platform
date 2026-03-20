import { Injectable } from '@nestjs/common';
import type { RagChunk, RagSearchResult, VectorStoreAdapter } from './rag.types.js';

function tokenize(value: string) {
  return Array.from(new Set((value.toLowerCase().match(/[a-z0-9_-]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? [])));
}

@Injectable()
export class InMemoryVectorStoreService implements VectorStoreAdapter {
  private readonly chunks = new Map<string, RagChunk>();

  async upsert(chunks: RagChunk[]) {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  async search(query: string, limit: number = 5, filter?: Record<string, unknown>) {
    const queryTokens = tokenize(query);
    const results: RagSearchResult[] = [];

    for (const chunk of this.chunks.values()) {
      if (filter?.documentId && chunk.documentId !== filter.documentId) continue;
      const chunkTokens = tokenize(chunk.content);
      const overlap = queryTokens.filter((token) => chunkTokens.includes(token)).length;
      if (overlap === 0) continue;
      results.push({ chunk, score: overlap / Math.max(queryTokens.length, 1) });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async deleteByDocument(documentId: string) {
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.documentId === documentId) this.chunks.delete(id);
    }
  }
}
