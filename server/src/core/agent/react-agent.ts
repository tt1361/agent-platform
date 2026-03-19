import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { ExecutionTracer } from '../trace/execution-tracer.js';
import { getLangchainTool } from './skill-discovery.js';
import { conversationService } from '../../modules/conversations/conversation.service.js';
import { knowledgeRetrievalService } from '../../modules/knowledge/knowledge.retrieval.service.js';
import { memoryService } from '../../modules/memories/memory.service.js';
import { ChatMiniMax } from '../llm/langchain-minimax.js';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';

interface RunAgentParams {
  agentId: string;
  input: string;
  overrideTimeoutMs?: number;
  conversationId?: string;
  conversationTitle?: string;
  onEvent?: (event: AgentRunEvent) => void | Promise<void>;
}

export interface AgentTraceStreamStep {
  executionId: string;
  traceId: string;
  stepIndex: number;
  stepType: 'thought' | 'action' | 'observation' | 'final_answer' | 'error';
  content: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
}

export type AgentRunEvent =
  | { type: 'status'; status: string; executionId: string; traceId: string; conversationId: string }
  | { type: 'retrievals'; executionId: string; traceId: string; items: Awaited<ReturnType<typeof knowledgeRetrievalService.retrieve>> }
  | { type: 'trace_step'; step: AgentTraceStreamStep }
  | { type: 'completed'; result: Awaited<ReturnType<ReactAgentRunner['run']>> }
  | { type: 'failed'; error: { code: string; message: string; executionId: string; traceId: string; conversationId: string } };

function normalizeKnowledgeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, '');
}

function extractKnowledgeQueryTerms(query: string) {
  const compact = normalizeKnowledgeText(query);
  const cleaned = compact
    .replaceAll('什么情况下', '')
    .replaceAll('什么情形下', '')
    .replaceAll('什么情况', '')
    .replaceAll('什么情形', '')
    .replaceAll('哪些情况', '')
    .replaceAll('哪些情形', '')
    .replaceAll('请问', '')
    .replaceAll('如何', '')
    .replaceAll('怎么', '')
    .replaceAll('可以', '')
    .replaceAll('会被', '')
    .replaceAll('会', '')
    .replaceAll('被', '')
    .replaceAll('员工', '');

  const candidates = [compact, cleaned, ...(cleaned.match(/[\u4e00-\u9fa5]{2,}/g) ?? [])]
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  return [...new Set(candidates)].sort((left, right) => right.length - left.length);
}

function buildKnowledgeEvidenceExcerpt(content: string, query: string) {
  const terms = extractKnowledgeQueryTerms(query);
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const collected: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalizedLine = normalizeKnowledgeText(line);
    const matchesTerm = terms.some((term) => normalizedLine.includes(term));
    const looksLikeClause = /有下列|以下行为|以下情况|以下情形|之一者|给予|处分|警告|记小过|记大过|解除劳动合同/.test(line);

    if (!matchesTerm && !looksLikeClause) continue;

    for (let offset = 0; offset <= 4; offset += 1) {
      const nextLine = lines[index + offset];
      if (!nextLine) break;
      if (collected.includes(nextLine)) continue;
      collected.push(nextLine);

      if (offset > 0 && /^([0-9]+(\.[0-9]+){0,3}[.、]?|[\-•●])/.test(nextLine) === false && nextLine.length > 36) {
        break;
      }
    }

    if (collected.length >= 10) break;
  }

  if (collected.length === 0) {
    return lines.slice(0, 8).join('\n');
  }

  return collected.slice(0, 10).join('\n');
}

export class ReactAgentRunner {
  private tracer = new ExecutionTracer();

  private async emit(params: RunAgentParams, event: AgentRunEvent) {
    await params.onEvent?.(event);
  }

  private async recordTraceStep(params: RunAgentParams, input: AgentTraceStreamStep) {
    await this.tracer.recordStep(input);
    await this.emit(params, { type: 'trace_step', step: input });
  }

  async run(params: RunAgentParams) {
    const agent = await prisma.agent.findUnique({ where: { id: params.agentId }, include: { llmProvider: true } });
    if (!agent) {
      throw new HttpError(404, 'NOT_FOUND', '未找到智能体');
    }
    if (agent.status !== 'active') {
      throw new HttpError(400, 'AGENT_EXECUTION_ERROR', '智能体必须处于启用状态后才能执行');
    }

    let conversationId = params.conversationId;
    let conversationTitle = params.conversationTitle ?? params.input.slice(0, 40);
    if (conversationId) {
      const existingConversation = await prisma.conversation.findFirst({
        where: { id: conversationId, agentId: agent.id },
      });
      if (!existingConversation) {
        throw new HttpError(404, 'NOT_FOUND', '未找到会话');
      }
      conversationTitle = existingConversation.title;
    } else {
      const conversation = await prisma.conversation.create({
        data: {
          agentId: agent.id,
          title: conversationTitle,
        },
      });
      conversationId = conversation.id;
      conversationTitle = conversation.title;
    }
    if (!conversationId) {
      throw new HttpError(500, 'INTERNAL_ERROR', '会话初始化失败');
    }
    const activeConversationId = conversationId;

    const traceId = `trace_${Date.now()}`;
    const startedAt = new Date();
    const execution = await prisma.execution.create({
      data: {
        agentId: agent.id,
        conversationId: activeConversationId,
        traceId,
        inputText: params.input,
        status: 'running',
        providerId: agent.llmProviderId,
        startedAt,
      },
    });
    await conversationService.touch(activeConversationId);
    await this.emit(params, {
      type: 'status',
      status: 'running',
      executionId: execution.id,
      traceId,
      conversationId: activeConversationId,
    });

    const maxSteps = agent.maxSteps;
    const timeoutMs = params.overrideTimeoutMs ?? agent.timeoutMs;

    const initialMessages: BaseMessage[] = [
      new SystemMessage(`${agent.systemPrompt ?? '你是一名乐于助人的中文智能体。'}\n\n你必须始终使用中文进行思考、工具决策说明和最终回答。`),
      new HumanMessage(`当前用户问题：${params.input}`),
    ];

    const allowedSkillIds = Array.isArray(agent.skillIds) ? (agent.skillIds as string[]) : [];
    const allSkills = await prisma.skill.findMany({ where: { id: { in: allowedSkillIds } } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skills = allSkills.filter((s: any) => s.status === 'active');
    
    const [latestShortTermMemory, longTermMemories, retrievedKnowledge] = await Promise.all([
      memoryService.getLatestShortTermMemory(activeConversationId),
      memoryService.getLongTermMemories(agent.id, params.input),
      knowledgeRetrievalService.retrieve(params.input, 8, execution.id),
    ]);

    initialMessages.push(new HumanMessage(
      `可用技能如下：${JSON.stringify(skills.map((skill: typeof skills[number]) => ({
        id: skill.id,
        skillKey: skill.skillKey,
        name: skill.name,
        description: skill.description,
        executorKey: skill.executorKey,
        parametersSchema: skill.parametersSchema,
      })))}`
    ));

    if (longTermMemories.length > 0) {
      initialMessages.push(new HumanMessage(
        `以下是与当前问题最相关的长期记忆，请优先遵循并在必要时引用：${JSON.stringify(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          longTermMemories.map((memory: any) => ({
            type: memory.memoryType,
            content: memory.content,
            importance: memory.importance,
          }))
        )}`
      ));
    }

    if (latestShortTermMemory) {
      initialMessages.push(new HumanMessage(
        `以下是当前会话的结构化短期记忆，请优先参考：${JSON.stringify({
          summary: latestShortTermMemory.summary,
          activeFacts: latestShortTermMemory.keyFacts,
          openTasks: latestShortTermMemory.openTasks,
          userPreferences: latestShortTermMemory.userPreferences,
          messageCount: latestShortTermMemory.messageCount,
        })}`
      ));
    }

    if (retrievedKnowledge.length > 0) {
      await this.recordTraceStep(params, {
        executionId: execution.id,
        traceId,
        stepIndex: 0,
        stepType: 'observation',
        content: `知识检索命中 ${retrievedKnowledge.length} 条：${retrievedKnowledge
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => `[${item.documentTitle}#${item.chunkIndex}] ${item.content.slice(0, 80)}`)
          .join('；')}`,
      });
      await this.emit(params, {
        type: 'retrievals',
        executionId: execution.id,
        traceId,
        items: retrievedKnowledge,
      });
      initialMessages.push(new HumanMessage(
        `以下是从知识库检索到的参考资料，请优先依据这些证据作答。回答要求：1）先给出明确结论；2）如果是制度/手册/规则类问题，优先整理成“适用情形/处理结果/补充说明”这样的结构化摘要，而不是大段照抄原文；3）尽量归纳出条款要点；4）不要忽略同一文档中的连续条款；5）如果证据不足，再明确说明不足。资料如下：

${retrievedKnowledge
  .map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: any, index: number) => `资料${index + 1}
知识库：${item.knowledgeBaseName}
文档：${item.documentTitle}
片段：#${item.chunkIndex}
得分：${item.score}
证据摘录：
${buildKnowledgeEvidenceExcerpt(item.content, params.input)}

内容：
${item.content}`
  )
  .join('\n\n---\n\n')}`
      ));
    }

    const previousExecutions = await prisma.execution.findMany({
      where: {
        conversationId: activeConversationId,
        status: 'succeeded',
        outputText: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (previousExecutions.length > 0) {
      initialMessages.push(new HumanMessage('以下是当前会话的历史上下文，请在回答时保持延续性，不要忽略历史问答。'));

      for (const previousExecution of previousExecutions) {
        initialMessages.push(new HumanMessage(previousExecution.inputText));
        initialMessages.push(new AIMessage(previousExecution.outputText ?? ''));
      }

      initialMessages.push(new HumanMessage(`请基于以上历史上下文继续回答本轮问题：${params.input}`));
    }

    let stepIndex = 0;
    let totalTokens = 0;
    const startedAtMs = startedAt.getTime();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const langchainTools = skills.map((skill: any) => getLangchainTool(skill));
    const model = new ChatMiniMax();
    if (model.bindTools) {
      model.bindTools(langchainTools);
    }

    const GraphState = Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
      }),
    });

    const callModel = async (state: typeof GraphState.State) => {
      if (Date.now() - startedAtMs > timeoutMs) {
        throw new HttpError(504, 'EXECUTION_TIMEOUT', '执行超时');
      }

      const response = await model.invoke(state.messages);
      totalTokens += response.usage_metadata?.total_tokens ?? 0;
      stepIndex += 1;

      const thought = response.content
        ? String(response.content)
        : (response.tool_calls?.length ? `准备调用工具：${response.tool_calls[0].name}` : '模型正在思考...');
      
      await this.recordTraceStep(params, {
        executionId: execution.id,
        traceId,
        stepIndex,
        stepType: 'thought',
        content: thought,
      });

      return { messages: [response] };
    };

    const callTools = async (state: typeof GraphState.State) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      const toolCalls = lastMessage.tool_calls ?? [];
      const toolMessages: ToolMessage[] = [];

      for (const toolCall of toolCalls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const skill = skills.find((item: any) => item.skillKey === toolCall.name);
        if (!skill) {
          throw new HttpError(400, 'SKILL_EXECUTION_ERROR', `技能 ${toolCall.name} 不在当前智能体的可用范围内`);
        }

        await this.recordTraceStep(params, {
          executionId: execution.id,
          traceId,
          stepIndex: stepIndex + 1,
          stepType: 'action',
          content: `调用技能：${skill.skillKey}`,
          toolName: skill.skillKey,
          toolInput: toolCall.args,
        });

        const tool = langchainTools.find((t: any) => t.name === toolCall.name);
        if (!tool) {
          throw new HttpError(400, 'SKILL_EXECUTION_ERROR', `未能获取到工具: ${toolCall.name}`);
        }

        const observation = await tool.invoke(JSON.stringify(toolCall.args));
        const observationStr = typeof observation === 'string' ? observation : JSON.stringify(observation);

        await this.recordTraceStep(params, {
          executionId: execution.id,
          traceId,
          stepIndex: stepIndex + 2,
          stepType: 'observation',
          content: observationStr,
          toolName: skill.skillKey,
          toolOutput: observation,
        });

        toolMessages.push(new ToolMessage({
          tool_call_id: toolCall.id!,
          content: observationStr,
          name: toolCall.name,
        }));
      }

      stepIndex += 2;
      return { messages: toolMessages };
    };

    const shouldContinue = (state: typeof GraphState.State) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
      if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        if (stepIndex >= maxSteps) {
          throw new HttpError(400, 'AGENT_EXECUTION_ERROR', '已超过最大执行步数');
        }
        return "tools";
      }
      return "end";
    };

    const workflow = new StateGraph(GraphState)
      .addNode("agent", callModel)
      .addNode("tools", callTools)
      .addEdge(START, "agent")
      .addConditionalEdges("agent", shouldContinue, {
        tools: "tools",
        end: END,
      })
      .addEdge("tools", "agent");

    const app = workflow.compile();

    try {
      const finalState = await app.invoke({ messages: initialMessages });
      const lastMessage = finalState.messages[finalState.messages.length - 1] as AIMessage;
      const answer = String(lastMessage.content ?? '');

      await this.recordTraceStep(params, {
        executionId: execution.id,
        traceId,
        stepIndex: stepIndex + 1,
        stepType: 'final_answer',
        content: answer,
      });

      await this.tracer.finalize({
        executionId: execution.id,
        status: 'succeeded',
        outputText: answer,
        stepCount: stepIndex + 1,
        tokensUsed: totalTokens,
        startedAt,
      });

      const shortTermMemory = await memoryService.updateShortTermMemory({
        conversationId: activeConversationId,
        conversationTitle,
        previousSnapshot: latestShortTermMemory,
        input: params.input,
        output: answer,
        messageCount: previousExecutions.length + 1,
      });

      const updatedLongTermMemories = await memoryService.persistLongTermMemories({
        agentId: agent.id,
        conversationId: activeConversationId,
        input: params.input,
        output: answer,
        previousSnapshot: latestShortTermMemory,
      });

      const result = {
        executionId: execution.id,
        traceId,
        conversationId: activeConversationId,
        status: 'succeeded',
        output: answer,
        stepCount: stepIndex + 1,
        tokensUsed: totalTokens,
        memoryUpdate: {
          shortTermMemory,
          updatedLongTermMemories,
        },
        knowledgeRetrievals: retrievedKnowledge,
      };
      await this.emit(params, { type: 'completed', result });
      return result;
    } catch (error) {
      if (error instanceof HttpError && error.code === 'EXECUTION_TIMEOUT') {
        await this.recordTraceStep(params, {
          executionId: execution.id,
          traceId,
          stepIndex: stepIndex + 1,
          stepType: 'error',
          content: '执行超时',
        });
        await this.tracer.finalize({
          executionId: execution.id,
          status: 'timeout',
          stepCount: stepIndex,
          tokensUsed: totalTokens,
          errorCode: 'EXECUTION_TIMEOUT',
          errorMessage: '执行超时',
          startedAt,
        });
        await this.emit(params, {
          type: 'failed',
          error: {
            code: error.code,
            message: error.message,
            executionId: execution.id,
            traceId,
            conversationId: activeConversationId,
          },
        });
        throw error;
      }

      await this.recordTraceStep(params, {
        executionId: execution.id,
        traceId,
        stepIndex: stepIndex + 1,
        stepType: 'error',
        content: error instanceof Error ? error.message : '执行失败',
      });
      await this.tracer.finalize({
        executionId: execution.id,
        status: 'failed',
        stepCount: stepIndex + 1,
        tokensUsed: totalTokens,
        errorCode: error instanceof HttpError ? error.code : 'AGENT_EXECUTION_ERROR',
        errorMessage: error instanceof Error ? error.message : '执行失败',
        startedAt,
      });
      await this.emit(params, {
        type: 'failed',
        error: {
          code: error instanceof HttpError ? error.code : 'AGENT_EXECUTION_ERROR',
          message: error instanceof Error ? error.message : '执行失败',
          executionId: execution.id,
          traceId,
          conversationId: activeConversationId,
        },
      });
      throw error;
    }
  }
}
