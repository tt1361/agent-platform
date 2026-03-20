import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { ok } from '../../lib/api-response.js';
import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { getRequiredParam } from '../../lib/request.js';

export const traceRouter = Router();

traceRouter.get('/:traceId', asyncHandler(async (req, res) => {
  const traceId = getRequiredParam(req.params.traceId, 'traceId');
  const traces = await prisma.executionTrace.findMany({ where: { traceId }, orderBy: { stepIndex: 'asc' } });
  if (traces.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Trace not found');

  const execution = await prisma.execution.findUnique({ where: { traceId } });
  const retrievals = execution ? await knowledgeRetrievalService.listByExecution(execution.id) : [];
  const citedRetrievals = execution
    ? await knowledgeRetrievalService.listCitedByAnswer(retrievals, execution.outputText)
    : [];
  res.json(ok({ execution, steps: traces, retrievals, citedRetrievals }));
}));
import { knowledgeRetrievalService } from '../knowledge/knowledge.retrieval.service.js';
