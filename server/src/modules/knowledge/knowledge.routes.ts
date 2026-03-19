import path from 'node:path';
import multer from 'multer';
import { Router } from 'express';
import type { Request } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { ok } from '../../lib/api-response.js';
import { getRequiredParam } from '../../lib/request.js';
import { validateBody } from '../../lib/validation.js';
import {
  createKnowledgeBaseSchema,
  createManualKnowledgeDocumentSchema,
  createUrlKnowledgeDocumentSchema,
  retrieveKnowledgeSchema,
  updateKnowledgeBaseSchema,
} from './knowledge.schemas.js';
import { knowledgeService } from './knowledge.service.js';
import { knowledgeIngestService } from './knowledge.ingest.service.js';

export const knowledgeRouter = Router();

const storage = multer.diskStorage({
  destination: async (_req: Request, _file: Express.Multer.File, callback: (error: Error | null, destination: string) => void) => {
    await knowledgeIngestService.ensureUploadsDir();
    callback(null, knowledgeIngestService.uploadsDir);
  },
  filename: (_req: Request, file: Express.Multer.File, callback: (error: Error | null, filename: string) => void) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_\u4e00-\u9fa5]/g, '-').slice(0, 60);
    callback(null, `${Date.now()}-${base || 'document'}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

knowledgeRouter.get('/bases', asyncHandler(async (_req, res) => {
  res.json(ok(await knowledgeService.listBases()));
}));

knowledgeRouter.post('/bases', validateBody(createKnowledgeBaseSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await knowledgeService.createBase(req.body)));
}));

knowledgeRouter.patch('/bases/:id', validateBody(updateKnowledgeBaseSchema), asyncHandler(async (req, res) => {
  res.json(ok(await knowledgeService.updateBase(getRequiredParam(req.params.id, 'id'), req.body)));
}));

knowledgeRouter.delete('/bases/:id', asyncHandler(async (req, res) => {
  res.json(ok(await knowledgeService.removeBase(getRequiredParam(req.params.id, 'id'))));
}));

knowledgeRouter.get('/bases/:id/documents', asyncHandler(async (req, res) => {
  res.json(ok(await knowledgeService.listDocuments(getRequiredParam(req.params.id, 'id'))));
}));

knowledgeRouter.post('/bases/:id/documents/manual', validateBody(createManualKnowledgeDocumentSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await knowledgeService.createManualDocument(getRequiredParam(req.params.id, 'id'), req.body)));
}));

knowledgeRouter.post('/bases/:id/documents/url', validateBody(createUrlKnowledgeDocumentSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await knowledgeService.createUrlDocument(getRequiredParam(req.params.id, 'id'), req.body)));
}));

knowledgeRouter.post('/bases/:id/documents/upload', upload.single('file'), asyncHandler(async (req, res) => {
  const uploadedFile = (req as Request & { file?: Express.Multer.File }).file;
  if (!uploadedFile) {
    throw new Error('请上传文件');
  }
  res.status(201).json(ok(await knowledgeService.createUploadedDocument(getRequiredParam(req.params.id, 'id'), uploadedFile)));
}));

knowledgeRouter.get('/documents/:id', asyncHandler(async (req, res) => {
  res.json(ok(await knowledgeService.getDocumentById(getRequiredParam(req.params.id, 'id'))));
}));

knowledgeRouter.get('/documents/:id/download', asyncHandler(async (req, res) => {
  res.json(ok(await knowledgeService.getDownloadPath(getRequiredParam(req.params.id, 'id'))));
}));

knowledgeRouter.delete('/documents/:id', asyncHandler(async (req, res) => {
  res.json(ok(await knowledgeService.removeDocument(getRequiredParam(req.params.id, 'id'))));
}));

knowledgeRouter.post('/retrieve', validateBody(retrieveKnowledgeSchema), asyncHandler(async (req, res) => {
  res.json(ok(await knowledgeService.retrieve(req.body.query, req.body.limit)));
}));
