import { z } from 'zod';

export const createAgentSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  llmProviderId: z.string().uuid(),
  skillIds: z.array(z.string().uuid()).default([]),
  maxSteps: z.number().int().min(1).max(20).default(6),
  timeoutMs: z.number().int().min(1000).max(300000).default(60000),
  systemPrompt: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
});

export const updateAgentSchema = createAgentSchema.partial();

export const updateAgentStatusSchema = z.object({
  status: z.enum(['draft', 'active', 'archived']),
});

export const runAgentSchema = z.object({
  input: z.string().min(1),
  timeoutMs: z.number().int().min(1000).max(300000).optional(),
  conversationId: z.string().uuid().optional(),
  conversationTitle: z.string().min(1).max(255).optional(),
});
