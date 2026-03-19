import path from 'node:path';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { knowledgeIngestService } from './knowledge.ingest.service.js';
import { knowledgeRetrievalService } from './knowledge.retrieval.service.js';

async function getKnowledgeBaseById(id: string) {
  const knowledgeBase = await prisma.knowledgeBase.findUnique({ where: { id } });
  if (!knowledgeBase) {
    throw new HttpError(404, 'NOT_FOUND', '未找到知识库');
  }
  return knowledgeBase;
}

async function getKnowledgeDocumentById(id: string) {
  const document = await prisma.knowledgeDocument.findUnique({
    where: { id },
    include: {
      knowledgeBase: true,
      chunks: { orderBy: { chunkIndex: 'asc' } },
    },
  });
  if (!document) {
    throw new HttpError(404, 'NOT_FOUND', '未找到知识文档');
  }
  return document;
}

export const knowledgeService = {
  listBases: async () =>
    prisma.knowledgeBase.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { documents: true },
        },
      },
    }),

  createBase: async (input: { name: string; description?: string }) =>
    prisma.knowledgeBase.create({
      data: {
        name: input.name,
        description: input.description,
      },
    }),

  updateBase: async (id: string, input: { name?: string; description?: string | null; status?: 'active' | 'archived' }) => {
    await getKnowledgeBaseById(id);
    return prisma.knowledgeBase.update({ where: { id }, data: input });
  },

  removeBase: async (id: string) => {
    await getKnowledgeBaseById(id);
    const documents = await prisma.knowledgeDocument.findMany({ where: { knowledgeBaseId: id } });

    for (const document of documents) {
      await knowledgeIngestService.removeLocalFile(document.filePath);
    }

    await prisma.knowledgeRetrievalLog.deleteMany({ where: { knowledgeBaseId: id } });
    await prisma.knowledgeChunk.deleteMany({ where: { document: { knowledgeBaseId: id } } });
    await prisma.knowledgeDocument.deleteMany({ where: { knowledgeBaseId: id } });
    return prisma.knowledgeBase.delete({ where: { id } });
  },

  listDocuments: async (knowledgeBaseId: string) => {
    await getKnowledgeBaseById(knowledgeBaseId);
    return prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });
  },

  getDocumentById: async (id: string) => getKnowledgeDocumentById(id),

  createManualDocument: async (knowledgeBaseId: string, input: { title: string; content: string }) => {
    await getKnowledgeBaseById(knowledgeBaseId);
    return knowledgeIngestService.ingestManualDocument(knowledgeBaseId, input);
  },

  createUrlDocument: async (knowledgeBaseId: string, input: { url: string; title?: string }) => {
    await getKnowledgeBaseById(knowledgeBaseId);
    return knowledgeIngestService.ingestUrlDocument(knowledgeBaseId, input);
  },

  createUploadedDocument: async (knowledgeBaseId: string, file: Express.Multer.File) => {
    await getKnowledgeBaseById(knowledgeBaseId);
    return knowledgeIngestService.ingestUploadedDocument(knowledgeBaseId, file);
  },

  removeDocument: async (id: string) => {
    const document = await getKnowledgeDocumentById(id);
    await prisma.knowledgeRetrievalLog.deleteMany({ where: { documentId: id } });
    await prisma.knowledgeChunk.deleteMany({ where: { documentId: id } });
    await knowledgeIngestService.removeLocalFile(document.filePath);
    return prisma.knowledgeDocument.delete({ where: { id } });
  },

  retrieve: async (query: string, limit?: number) => knowledgeRetrievalService.retrieve(query, limit),

  getDownloadPath: async (documentId: string) => {
    const document = await getKnowledgeDocumentById(documentId);
    if (!document.filePath) {
      throw new HttpError(400, 'DOCUMENT_NOT_FILE', '该文档不是上传文件');
    }
    const relativePath = path.relative(knowledgeIngestService.uploadsDir, document.filePath).replaceAll(path.sep, '/');
    return {
      fileName: document.fileName,
      url: `/uploads/knowledge/${relativePath}`,
    };
  },
};
