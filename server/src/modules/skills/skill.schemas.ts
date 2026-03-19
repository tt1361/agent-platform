import { z } from 'zod';

export const createSkillSchema = z.object({
  skillKey: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1).default('1.0.0'),
  description: z.string().optional(),
  status: z.enum(['active', 'deprecated', 'disabled']).default('active'),
  executorKey: z.string().optional(),
  parametersSchema: z.record(z.any()),
  returnsSchema: z.record(z.any()),
  tags: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export const updateSkillSchema = createSkillSchema.partial();

export const updateSkillStatusSchema = z.object({
  status: z.enum(['active', 'deprecated', 'disabled']),
});
