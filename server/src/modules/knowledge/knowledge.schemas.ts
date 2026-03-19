import { z } from 'zod';

export const createKnowledgeBaseSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
});

export const updateKnowledgeBaseSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

export const createManualKnowledgeDocumentSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
});

export const createUrlKnowledgeDocumentSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(255).optional(),
});

export const retrieveKnowledgeSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});
