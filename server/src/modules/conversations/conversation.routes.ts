import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { ok } from '../../lib/api-response.js';
import { getRequiredParam } from '../../lib/request.js';
import { validateBody } from '../../lib/validation.js';
import { conversationService } from './conversation.service.js';
import { memoryService } from '../memories/memory.service.js';

const createConversationSchema = z.object({
  agentId: z.string().min(1).max(36),
  title: z.string().min(1).max(255).optional(),
});

const renameConversationSchema = z.object({
  title: z.string().min(1).max(255),
});

export const conversationRouter = Router();

conversationRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json(ok(await conversationService.getById(getRequiredParam(req.params.id, 'id'))));
}));

conversationRouter.get('/:id/memory', asyncHandler(async (req, res) => {
  res.json(ok(await memoryService.getLatestShortTermMemory(getRequiredParam(req.params.id, 'id'))));
}));

conversationRouter.post('/', validateBody(createConversationSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await conversationService.create(req.body.agentId, req.body.title)));
}));

conversationRouter.patch('/:id', validateBody(renameConversationSchema), asyncHandler(async (req, res) => {
  res.json(ok(await conversationService.rename(getRequiredParam(req.params.id, 'id'), req.body.title)));
}));

conversationRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json(ok(await conversationService.remove(getRequiredParam(req.params.id, 'id'))));
}));
