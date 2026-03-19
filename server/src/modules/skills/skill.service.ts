import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';

import { discoveredPlugins } from '../../core/agent/skill-discovery.js';

export const skillService = {
  listDiscovered: async () => {
    return discoveredPlugins.map(p => {
      // omit executor function for API serialization
      const { executor, ...meta } = p;
      return meta;
    });
  },

  list: async () => prisma.skill.findMany({ orderBy: [{ skillKey: 'asc' }, { version: 'desc' }] }),

  create: async (input: {
    skillKey: string;
    name: string;
    version: string;
    description?: string;
    status: 'active' | 'deprecated' | 'disabled';
    executorKey?: string;
    parametersSchema: Record<string, unknown>;
    returnsSchema: Record<string, unknown>;
    tags?: string[];
    timeoutMs?: number;
  }) => {
    return prisma.skill.create({
      data: {
        ...input,
        parametersSchema: input.parametersSchema as any,
        returnsSchema: input.returnsSchema as any,
        tags: (input.tags ?? []) as any,
      },
    });
  },

  getById: async (id: string) => {
    const skill = await prisma.skill.findUnique({ where: { id } });
    if (!skill) throw new HttpError(404, 'NOT_FOUND', 'Skill not found');
    return skill;
  },

  update: async (id: string, input: Record<string, unknown>) => {
    await skillService.getById(id);
    return prisma.skill.update({
      where: { id },
      data: {
        ...input,
        parametersSchema: input.parametersSchema as any,
        returnsSchema: input.returnsSchema as any,
        tags: input.tags as any,
      },
    });
  },

  updateStatus: async (id: string, status: 'active' | 'deprecated' | 'disabled') => {
    await skillService.getById(id);
    return prisma.skill.update({
      where: { id },
      data: { status },
    });
  },

  remove: async (id: string) => {
    await skillService.getById(id);
    return prisma.skill.delete({ where: { id } });
  },
};
