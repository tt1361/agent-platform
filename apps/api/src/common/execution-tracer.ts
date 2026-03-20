import { prisma } from '../database.js';

export interface TraceStepInput {
  executionId: string;
  traceId: string;
  stepIndex: number;
  stepType: 'thought' | 'action' | 'observation' | 'final_answer' | 'error';
  content: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  durationMs?: number;
}

export class ExecutionTracer {
  async recordStep(input: TraceStepInput) {
    return prisma.executionTrace.create({
      data: {
        executionId: input.executionId,
        traceId: input.traceId,
        stepIndex: input.stepIndex,
        stepType: input.stepType,
        content: input.content,
        toolName: input.toolName,
        toolInput: input.toolInput as object | undefined,
        toolOutput: input.toolOutput as object | undefined,
        durationMs: input.durationMs,
      },
    });
  }

  async finalize(params: {
    executionId: string;
    status: 'succeeded' | 'failed' | 'timeout' | 'cancelled';
    outputText?: string;
    stepCount: number;
    tokensUsed?: number;
    cost?: number;
    errorCode?: string;
    errorMessage?: string;
    startedAt: Date;
  }) {
    const endedAt = new Date();
    return prisma.execution.update({
      where: { id: params.executionId },
      data: {
        status: params.status,
        outputText: params.outputText,
        stepCount: params.stepCount,
        tokensUsed: params.tokensUsed,
        cost: params.cost,
        startedAt: params.startedAt,
        endedAt,
        durationMs: endedAt.getTime() - params.startedAt.getTime(),
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
      },
    });
  }
}
