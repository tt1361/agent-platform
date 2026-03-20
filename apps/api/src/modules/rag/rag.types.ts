export interface RagChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RagSearchResult {
  chunk: RagChunk;
  score: number;
}

export interface VectorStoreAdapter {
  upsert(chunks: RagChunk[]): Promise<void>;
  search(query: string, limit?: number, filter?: Record<string, unknown>): Promise<RagSearchResult[]>;
  deleteByDocument(documentId: string): Promise<void>;
}
