import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { prisma } from '../../database.js';
import { KnowledgeRetrievalService } from './knowledge.retrieval.service.js';

@Injectable()
export class KnowledgeService {
  constructor(private readonly retrievalService: KnowledgeRetrievalService) {}

  private async createChunks(documentId: string, rawText: string) {
    const normalized = rawText.trim();
    if (!normalized) return [];
    const segments = normalized
      .split(/\n{2,}/)
      .map((item) => item.trim())
      .filter(Boolean);
    const chunks: string[] = segments.length > 0 ? segments : [normalized];
    await prisma.knowledgeChunk.createMany({
      data: chunks.map((content, index) => ({
        documentId,
        chunkIndex: index,
        content,
        tokenCount: content.length,
        charCount: content.length,
      })),
    });
    return chunks;
  }

  async list() {
    return prisma.knowledgeBase.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    });
  }

  async getById(id: string) {
    const item = await prisma.knowledgeBase.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('知识库不存在');
    return item;
  }

  async create(input: { name: string; description?: string }) {
    return prisma.knowledgeBase.create({
      data: {
        name: input.name,
        description: input.description,
      } as any,
    });
  }

  async update(id: string, input: { name?: string; description?: string | null; status?: 'active' | 'archived' }) {
    await this.getById(id);
    return prisma.knowledgeBase.update({
      where: { id },
      data: input as any,
    });
  }

  async remove(id: string) {
    await this.getById(id);
    return prisma.knowledgeBase.delete({ where: { id } });
  }

  async listDocuments(knowledgeBaseId: string) {
    await this.getById(knowledgeBaseId);
    return prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });
  }

  async getDocumentById(id: string) {
    const doc = await prisma.knowledgeDocument.findUnique({
      where: { id },
      include: { _count: { select: { chunks: true } } },
    });
    if (!doc) throw new NotFoundException('文档不存在');
    return doc;
  }

  async createManualDocument(knowledgeBaseId: string, input: { title: string; content: string }) {
    await this.getById(knowledgeBaseId);
    const document = await prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId,
        title: input.title,
        sourceType: 'manual',
        rawText: input.content,
        status: 'ready',
      } as any,
    });
    const chunks = await this.createChunks(document.id, input.content);
    return prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: { chunkCount: chunks.length } as any,
      include: { _count: { select: { chunks: true } } },
    });
  }

  async createUrlDocument(knowledgeBaseId: string, input: { url: string; title?: string }) {
    await this.getById(knowledgeBaseId);
    const title = input.title?.trim() || input.url;
    const rawText = `来源链接: ${input.url}`;
    const document = await prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId,
        title,
        sourceType: 'url',
        sourceUri: input.url,
        rawText,
        status: 'ready',
      } as any,
    });
    const chunks = await this.createChunks(document.id, rawText);
    return prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: { chunkCount: chunks.length } as any,
      include: { _count: { select: { chunks: true } } },
    });
  }

  async createUploadedDocument(knowledgeBaseId: string, file: Express.Multer.File) {
    await this.getById(knowledgeBaseId);
    const rawText = file.buffer.toString('utf-8');
    const document = await prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId,
        title: file.originalname,
        sourceType: 'upload',
        fileName: file.originalname,
        filePath: file.path,
        mimeType: file.mimetype,
        fileSize: file.size,
        rawText,
        status: 'ready',
      } as any,
    });
    const chunks = await this.createChunks(document.id, rawText);
    return prisma.knowledgeDocument.update({
      where: { id: document.id },
      data: { chunkCount: chunks.length } as any,
      include: { _count: { select: { chunks: true } } },
    });
  }

  async getDownloadPath(documentId: string) {
    const document: any = await this.getDocumentById(documentId);
    return {
      fileName: document.fileName,
      url: `/api/v1/knowledge/documents/${documentId}/file`,
    };
  }

  async ensureUploadsDir() {
    const uploadDir = 'apps/api/uploads';
    await mkdir(uploadDir, { recursive: true });
    return uploadDir;
  }

  async retrieve(query: string, limit?: number) {
    return this.retrievalService.retrieve(query, limit);
  }

  async removeDocument(id: string) {
    const doc = await this.getDocumentById(id);
    await prisma.knowledgeRetrievalLog.deleteMany({ where: { documentId: id } });
    await prisma.knowledgeChunk.deleteMany({ where: { documentId: id } });
    return prisma.knowledgeDocument.delete({ where: { id } });
  }

  async listDocumentChunks(documentId: string) {
    await this.getDocumentById(documentId);
    return prisma.knowledgeChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
    });
  }
}
