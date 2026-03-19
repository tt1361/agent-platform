import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { ok } from '../../lib/api-response.js';
import { getRequiredParam } from '../../lib/request.js';
import { providerService } from './provider.service.js';

export const providerRouter = Router();

providerRouter.get('/', asyncHandler(async (_req, res) => {
  res.json(ok(await providerService.list()));
}));

providerRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json(ok(await providerService.getById(getRequiredParam(req.params.id, 'id'))));
}));

providerRouter.post('/:id/test', asyncHandler(async (req, res) => {
  getRequiredParam(req.params.id, 'id');
  res.json(ok(await providerService.testConnection()));
}));
