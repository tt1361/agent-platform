import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { ok } from '../../lib/api-response.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { getRequiredParam } from '../../lib/request.js';

export const executionRouter = Router();

executionRouter.get('/', asyncHandler(async (req, res) => {
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const executions = await prisma.execution.findMany({
    where: {
      agentId,
      status: status as never,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(ok(executions));
}));

executionRouter.get('/:id', asyncHandler(async (req, res) => {
  const execution = await prisma.execution.findUnique({ where: { id: getRequiredParam(req.params.id, 'id') } });
  if (!execution) throw new HttpError(404, 'NOT_FOUND', 'Execution not found');
  res.json(ok(execution));
}));
