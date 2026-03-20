import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { HumanTaskRecord, HumanTaskStatus, HumanTaskType } from './hitl.types.js';

@Injectable()
export class HitlService {
  private readonly tasks = new Map<string, HumanTaskRecord>();
  private static readonly terminalStatuses = new Set<HumanTaskStatus>(['approved', 'rejected', 'timeout', 'overridden']);

  list() {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getById(id: string) {
    const task = this.tasks.get(id);
    if (!task) throw new NotFoundException('Human task not found');
    return task;
  }

  create(input: {
    title: string;
    taskType: HumanTaskType;
    sourceType: 'agent' | 'workflow' | 'tool';
    sourceId: string;
    payload: Record<string, unknown>;
    assigneeId?: string;
  }) {
    const now = new Date().toISOString();
    const task: HumanTaskRecord = {
      id: randomUUID(),
      title: input.title,
      taskType: input.taskType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      payload: input.payload,
      assigneeId: input.assigneeId,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  updateStatus(id: string, status: HumanTaskStatus) {
    const current = this.getById(id);
    if (current.status === status) {
      return current;
    }

    const currentIsTerminal = HitlService.terminalStatuses.has(current.status);
    const nextIsTerminal = HitlService.terminalStatuses.has(status);
    if (currentIsTerminal) {
      throw new BadRequestException('Human task is already in terminal status');
    }

    if (!nextIsTerminal) {
      throw new BadRequestException('Human task can only transition to terminal statuses');
    }

    const updated: HumanTaskRecord = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    this.tasks.set(id, updated);
    return updated;
  }
}
