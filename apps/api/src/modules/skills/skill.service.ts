import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../database.js';
import { discoverBuiltinSkills } from '../../llm/skill-discovery.js';

interface CreateSkillInput {
  skillKey: string;
  version: string;
  name?: string;
  description?: string;
  executorKey?: string;
  status?: 'active' | 'deprecated' | 'disabled';
  parametersSchema?: Record<string, unknown>;
  returnsSchema?: Record<string, unknown>;
  tags?: string[];
  timeoutMs?: number;
}

@Injectable()
export class SkillService {
  async list() {
    return prisma.skill.findMany({ orderBy: { updatedAt: 'desc' } });
  }

  async listAvailable() {
    const builtin = discoverBuiltinSkills();
    const installed = await this.list();
    const installedKeys = new Set(installed.map((s) => `${s.skillKey}@${s.version}`));
    return builtin.filter((s) => !installedKeys.has(`${s.skillKey}@${s.version}`));
  }

  async getById(id: string) {
    const item = await prisma.skill.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Skill not found');
    return item;
  }

  async getByKey(skillKey: string) {
    return prisma.skill.findFirst({
      where: { skillKey, status: 'active' },
      orderBy: { version: 'desc' },
    });
  }

  async create(input: CreateSkillInput) {
    const builtin = discoverBuiltinSkills().find(
      (s) => s.skillKey === input.skillKey && s.version === input.version
    );

    if (builtin) {
      return prisma.skill.upsert({
        where: { skillKey_version: { skillKey: builtin.skillKey, version: builtin.version } },
        update: builtin as any,
        create: builtin as any,
      });
    }

    if (!input.name || !input.executorKey || !input.parametersSchema || !input.returnsSchema) {
      throw new BadRequestException(`内置技能 ${input.skillKey}@${input.version} 不存在，创建自定义技能需提供完整字段`);
    }

    return prisma.skill.upsert({
      where: { skillKey_version: { skillKey: input.skillKey, version: input.version } },
      update: {
        name: input.name,
        description: input.description,
        executorKey: input.executorKey,
        status: input.status ?? 'active',
        parametersSchema: input.parametersSchema as any,
        returnsSchema: input.returnsSchema as any,
        tags: input.tags ?? [],
        timeoutMs: input.timeoutMs,
      },
      create: {
        skillKey: input.skillKey,
        version: input.version,
        name: input.name,
        description: input.description,
        executorKey: input.executorKey,
        status: input.status ?? 'active',
        parametersSchema: input.parametersSchema as any,
        returnsSchema: input.returnsSchema as any,
        tags: input.tags ?? [],
        timeoutMs: input.timeoutMs,
      },
    });
  }

  async updateStatus(id: string, status: 'active' | 'deprecated' | 'disabled') {
    await this.getById(id);
    return prisma.skill.update({
      where: { id },
      data: { status } as any,
    });
  }

  async remove(id: string) {
    await this.getById(id);
    return prisma.skill.delete({ where: { id } });
  }
}
