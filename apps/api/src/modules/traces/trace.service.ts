import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '../../database.js';
import { KnowledgeRetrievalService } from '../knowledge/knowledge.retrieval.service.js';

@Injectable()
export class TraceService {
  constructor(private readonly knowledgeRetrievalService: KnowledgeRetrievalService) {}

  async getTraceDetails(traceId: string) {
    const traces = await prisma.executionTrace.findMany({
      where: { traceId },
      orderBy: { stepIndex: 'asc' },
    });

    const execution = await prisma.execution.findUnique({ where: { traceId } });
    const retrievals = execution ? await this.knowledgeRetrievalService.listByExecution(execution.id) : [];
    const citedRetrievals = execution
      ? await this.knowledgeRetrievalService.listCitedByAnswer(retrievals, execution.outputText)
      : [];
      
    return { execution, steps: traces, retrievals, citedRetrievals };
  }
}
