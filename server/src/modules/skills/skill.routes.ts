import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { ok } from '../../lib/api-response.js';
import { getRequiredParam } from '../../lib/request.js';
import { validateBody } from '../../lib/validation.js';
import { createSkillSchema, updateSkillSchema, updateSkillStatusSchema } from './skill.schemas.js';
import { skillService } from './skill.service.js';

export const skillRouter = Router();

skillRouter.get('/available', asyncHandler(async (_req, res) => {
  res.json(ok(await skillService.listDiscovered()));
}));

skillRouter.get('/', asyncHandler(async (_req, res) => {
  res.json(ok(await skillService.list()));
}));

skillRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json(ok(await skillService.getById(getRequiredParam(req.params.id, 'id'))));
}));

skillRouter.post('/', validateBody(createSkillSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await skillService.create(req.body)));
}));

skillRouter.put('/:id', validateBody(updateSkillSchema), asyncHandler(async (req, res) => {
  res.json(ok(await skillService.update(getRequiredParam(req.params.id, 'id'), req.body)));
}));

skillRouter.patch('/:id/status', validateBody(updateSkillStatusSchema), asyncHandler(async (req, res) => {
  res.json(ok(await skillService.updateStatus(getRequiredParam(req.params.id, 'id'), req.body.status)));
}));

skillRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json(ok(await skillService.remove(getRequiredParam(req.params.id, 'id'))));
}));
