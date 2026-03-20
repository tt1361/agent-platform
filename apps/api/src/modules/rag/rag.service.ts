import { Injectable } from '@nestjs/common';
import { InMemoryVectorStoreService } from './in-memory-vector-store.service.js';
import type { RagChunk } from './rag.types.js';

@Injectable()
export class RagService {
  constructor(private readonly vectorStore: InMemoryVectorStoreService) {}

  async indexDocument(documentId: string, rawText: string) {
    const segments = rawText
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);

    const chunks: RagChunk[] = (segments.length ? segments : [rawText.trim()])
      .filter(Boolean)
      .map((content, index) => ({
        id: `${documentId}:${index}`,
        documentId,
        chunkIndex: index,
        content,
      }));

    await this.vectorStore.upsert(chunks);
    return chunks;
  }

  async retrieve(query: string, limit?: number, filter?: Record<string, unknown>) {
    return this.vectorStore.search(query, limit, filter);
  }

  async purgeDocument(documentId: string) {
    return this.vectorStore.deleteByDocument(documentId);
  }
}
