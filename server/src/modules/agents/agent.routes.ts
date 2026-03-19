import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { ok } from '../../lib/api-response.js';
import { getRequiredParam } from '../../lib/request.js';
import { validateBody } from '../../lib/validation.js';
import { z } from 'zod';
import { createAgentSchema, runAgentSchema, updateAgentSchema, updateAgentStatusSchema } from './agent.schemas.js';
import { agentService } from './agent.service.js';
import { conversationService } from '../conversations/conversation.service.js';
import { memoryService } from '../memories/memory.service.js';
import { ReactAgentRunner } from '../../core/agent/react-agent.js';

export const agentRouter = Router();
const agentRunner = new ReactAgentRunner();

const updateMemoryImportanceSchema = z.object({
  importance: z.number().int().min(1).max(5),
});

agentRouter.get('/', asyncHandler(async (_req, res) => {
  res.json(ok(await agentService.list()));
}));

agentRouter.get('/:id', asyncHandler(async (req, res) => {
  res.json(ok(await agentService.getById(getRequiredParam(req.params.id, 'id'))));
}));

agentRouter.post('/', validateBody(createAgentSchema), asyncHandler(async (req, res) => {
  res.status(201).json(ok(await agentService.create(req.body)));
}));

agentRouter.put('/:id', validateBody(updateAgentSchema), asyncHandler(async (req, res) => {
  res.json(ok(await agentService.update(getRequiredParam(req.params.id, 'id'), req.body)));
}));

agentRouter.patch('/:id/status', validateBody(updateAgentStatusSchema), asyncHandler(async (req, res) => {
  res.json(ok(await agentService.updateStatus(getRequiredParam(req.params.id, 'id'), req.body.status)));
}));

agentRouter.delete('/:id', asyncHandler(async (req, res) => {
  res.json(ok(await agentService.remove(getRequiredParam(req.params.id, 'id'))));
}));

agentRouter.post('/:id/run', validateBody(runAgentSchema), asyncHandler(async (req, res) => {
  res.json(
    ok(
      await agentService.run(
        getRequiredParam(req.params.id, 'id'),
        req.body.input,
        req.body.timeoutMs,
        req.body.conversationId,
        req.body.conversationTitle,
      ),
    ),
  );
}));

agentRouter.post('/:id/run/stream', validateBody(runAgentSchema), asyncHandler(async (req, res) => {
  const agentId = getRequiredParam(req.params.id, 'id');

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, payload: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).flush?.();
  };

  let isClosed = false;
  res.on('close', () => {
    isClosed = true;
  });
  req.on('aborted', () => {
    isClosed = true;
  });

  try {
    send('ready', { agentId });

    const result = await agentRunner.run({
      agentId,
      input: req.body.input,
      overrideTimeoutMs: req.body.timeoutMs,
      conversationId: req.body.conversationId,
      conversationTitle: req.body.conversationTitle,
      onEvent: async (event) => {
        if (!isClosed) {
          send(event.type, event);
        }
      },
    });

    if (!isClosed) {
      send('done', { executionId: result.executionId, traceId: result.traceId, conversationId: result.conversationId });
      res.end();
    }
  } catch (error) {
    if (!isClosed) {
      send('server_error', {
        message: error instanceof Error ? error.message : '执行失败',
      });
      res.end();
    }
    console.error(error);
  }
}));

agentRouter.get('/:id/executions', asyncHandler(async (req, res) => {
  res.json(ok(await agentService.listExecutions(getRequiredParam(req.params.id, 'id'))));
}));

agentRouter.get('/:id/conversations', asyncHandler(async (req, res) => {
  res.json(ok(await conversationService.listByAgent(getRequiredParam(req.params.id, 'id'))));
}));

agentRouter.get('/:id/memories', asyncHandler(async (req, res) => {
  res.json(ok(await memoryService.listAgentMemories(getRequiredParam(req.params.id, 'id'))));
}));

agentRouter.patch('/:id/memories/:memoryId', validateBody(updateMemoryImportanceSchema), asyncHandler(async (req, res) => {
  res.json(
    ok(
      await memoryService.updateImportance(
        getRequiredParam(req.params.id, 'id'),
        getRequiredParam(req.params.memoryId, 'memoryId'),
        req.body.importance,
      ),
    ),
  );
}));

agentRouter.delete('/:id/memories/:memoryId', asyncHandler(async (req, res) => {
  res.json(ok(await memoryService.remove(getRequiredParam(req.params.id, 'id'), getRequiredParam(req.params.memoryId, 'memoryId'))));
}));
