import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import type { Request, Response } from 'express';
import { fail } from '../lib/api-response.js';
import { HttpError } from '../lib/http-error.js';
import { agentRouter } from '../modules/agents/agent.routes.js';
import { conversationRouter } from '../modules/conversations/conversation.routes.js';
import { executionRouter } from '../modules/executions/execution.routes.js';
import { knowledgeRouter } from '../modules/knowledge/knowledge.routes.js';
import { providerRouter } from '../modules/providers/provider.routes.js';
import { skillRouter } from '../modules/skills/skill.routes.js';
import { traceRouter } from '../modules/traces/trace.routes.js';

export function createApp() {
  const app = express();
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const knowledgeUploadsDir = path.resolve(currentDir, '../../uploads/knowledge');

  app.use(cors());
  app.use(express.json({ limit: '8mb' }));
  app.use('/uploads/knowledge', express.static(knowledgeUploadsDir));

  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/api/v1/agents', agentRouter);
  app.use('/api/v1/conversations', conversationRouter);
  app.use('/api/v1/skills', skillRouter);
  app.use('/api/v1/knowledge', knowledgeRouter);
  app.use('/api/v1/llm-providers', providerRouter);
  app.use('/api/v1/executions', executionRouter);
  app.use('/api/v1/traces', traceRouter);

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.statusCode).json(fail(error.code, error.message, error.details, req.headers['x-request-id'] as string | undefined));
      return;
    }

    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error(error);
    res.status(500).json(fail('INTERNAL_ERROR', message, undefined, req.headers['x-request-id'] as string | undefined));
  });

  return app;
}
