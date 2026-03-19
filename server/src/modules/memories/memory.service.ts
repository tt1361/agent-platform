import { HttpError } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';

type MemoryKind = 'preference' | 'fact' | 'goal' | 'summary';

type ShortTermSnapshot = {
  summary?: string | null;
  keyFacts?: unknown;
  openTasks?: unknown;
  userPreferences?: unknown;
  messageCount?: number | null;
};

type MemoryCandidate = {
  content: string;
  memoryType: MemoryKind;
  importance: number;
  reason: string;
};

const MAX_SHORT_TERM_SNAPSHOTS = 12;
const MAX_LONG_TERM_MEMORIES = 60;

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s，。！？、；：,.!?;:()[\]{}"'`]+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  return uniqueStrings((normalizeText(value).match(/[a-z0-9_-]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? []).filter((token) => token.length >= 2));
}

function tokenizeWithFrequency(value: string) {
  const tokens = normalizeText(value).match(/[a-z0-9_-]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? [];
  const frequency = new Map<string, number>();

  for (const token of tokens) {
    if (token.length < 2) continue;
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  return frequency;
}

function sentenceSplit(value: string) {
  return value
    .split(/[。！？\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function extractPreferenceMemories(input: string, output: string) {
  const combined = `${input}\n${output}`;
  const preferences: string[] = [];

  if (/中文|汉语/.test(combined)) preferences.push('用户偏好使用中文交流和输出。');
  if (/英文|english/i.test(combined)) preferences.push('用户在部分场景下接受英文输出。');
  if (/简洁|简明|精简|直接/.test(combined)) preferences.push('用户偏好简洁直接的表达方式。');
  if (/详细|展开|细化|完整/.test(combined)) preferences.push('用户在需要时希望得到展开说明和分点解释。');
  if (/步骤|分步|一步一步/.test(combined)) preferences.push('用户偏好按步骤推进任务并查看明确的下一步。');

  return uniqueStrings(preferences);
}

function extractGoalMemories(input: string, previousOpenTasks: string[] = []) {
  const goals: string[] = [];
  const compactInput = input.replace(/\s+/g, ' ').trim();

  if (/优化|改造|打磨|提升|完善/.test(compactInput)) goals.push(`当前阶段目标：${compactInput.slice(0, 120)}`);
  if (/请继续|下一步|继续|接着/.test(compactInput)) goals.push('用户倾向于在当前任务上连续迭代，而不是切换主题。');
  if (/实现|新增|支持|修复/.test(compactInput) && compactInput.length >= 10) {
    goals.push(`当前执行目标：${compactInput.slice(0, 120)}`);
  }

  return uniqueStrings([...previousOpenTasks, ...goals]).slice(0, 5);
}

function extractFactMemories(output: string, input: string = '') {
  const facts = sentenceSplit(`${input}\n${output}`)
    .filter((item) => item.length >= 14)
    .filter((item) => !/请问|是否|可以|需要|建议|如果你愿意/.test(item))
    .slice(0, 6);

  return uniqueStrings(facts).slice(0, 4);
}

function extractOpenTasks(input: string, output: string, previousOpenTasks: string[] = []) {
  const tasks: string[] = [];
  const sourceSentences = sentenceSplit(`${input}\n${output}`);

  for (const sentence of sourceSentences) {
    if (/下一步|待办|TODO|需要继续|后续可以|后续建议|建议下一步|可以继续/.test(sentence)) {
      tasks.push(sentence.slice(0, 120));
    }
  }

  if (/继续|下一步/.test(input) && previousOpenTasks.length > 0) {
    tasks.push(...previousOpenTasks);
  }

  return uniqueStrings(tasks).slice(0, 5);
}

function extractSummaryMemories(input: string, output: string) {
  const summaries: string[] = [];
  const compactInput = input.replace(/\s+/g, ' ').trim();
  const keySentences = sentenceSplit(output)
    .filter((item) => item.length >= 18)
    .slice(0, 2);

  if (/(完成|已实现|已修复|已经支持|优化了|新增了)/.test(output) && compactInput.length >= 8) {
    summaries.push(`阶段结论：针对“${compactInput.slice(0, 40)}”已取得进展。`);
  }

  if (keySentences.length > 0) {
    summaries.push(`阶段摘要：${keySentences.join('；').slice(0, 160)}`);
  }

  return uniqueStrings(summaries).slice(0, 2);
}

function mergeDistinctBySimilarity(values: string[]) {
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    const duplicated = result.some((existing) => {
      const current = normalizeText(existing);
      return current === normalized || current.includes(normalized) || normalized.includes(current);
    });
    if (!duplicated) result.push(value.trim());
  }

  return result;
}

function summarizeConversation(params: {
  previousSnapshot?: ShortTermSnapshot;
  input: string;
  output: string;
  conversationTitle: string;
  messageCount: number;
  keyFacts: string[];
  openTasks: string[];
  userPreferences: string[];
}) {
  const parts = [
    `会话主题：${params.conversationTitle}`,
    params.previousSnapshot?.summary ? `已有上下文：${params.previousSnapshot.summary.slice(0, 120)}` : undefined,
    `最新问题：${params.input.slice(0, 100)}`,
    `最新进展：${params.output.slice(0, 140)}`,
    params.keyFacts.length > 0 ? `关键事实：${params.keyFacts.join('；')}` : undefined,
    params.openTasks.length > 0 ? `待继续事项：${params.openTasks.join('；')}` : undefined,
    params.userPreferences.length > 0 ? `用户偏好：${params.userPreferences.join('；')}` : undefined,
    `累计轮次：${params.messageCount}`,
  ].filter(Boolean);

  return parts.join('；');
}

function cosineSimilarity(left: Map<string, number>, right: Map<string, number>) {
  if (left.size === 0 || right.size === 0) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const value of left.values()) {
    leftNorm += value * value;
  }
  for (const value of right.values()) {
    rightNorm += value * value;
  }
  for (const [token, leftValue] of left.entries()) {
    const rightValue = right.get(token);
    if (rightValue) dot += leftValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function buildSparseVector(value: string, idfMap: Map<string, number>) {
  const frequency = tokenizeWithFrequency(value);
  const weighted = new Map<string, number>();

  for (const [token, count] of frequency.entries()) {
    const tf = 1 + Math.log(count);
    const idf = idfMap.get(token) ?? 1;
    weighted.set(token, tf * idf);
  }

  return weighted;
}

function buildIdfMap(documents: string[]) {
  const tokenDocumentCount = new Map<string, number>();

  for (const document of documents) {
    const seen = new Set(tokenize(document));
    for (const token of seen) {
      tokenDocumentCount.set(token, (tokenDocumentCount.get(token) ?? 0) + 1);
    }
  }

  const totalDocs = Math.max(1, documents.length);
  const idfMap = new Map<string, number>();

  for (const [token, documentCount] of tokenDocumentCount.entries()) {
    idfMap.set(token, Math.log((1 + totalDocs) / (1 + documentCount)) + 1);
  }

  return idfMap;
}

function scoreMemoryRelevance(
  memory: { memoryType: string; content: string; importance: number; updatedAt: Date; lastAccessedAt: Date | null },
  query: string,
  idfMap: Map<string, number>,
) {
  const queryTokens = tokenize(query);
  const memoryTokens = tokenize(memory.content);
  const overlap = queryTokens.filter((token) => memoryTokens.includes(token)).length;
  const queryVector = buildSparseVector(query, idfMap);
  const memoryVector = buildSparseVector(memory.content, idfMap);
  const semanticScore = cosineSimilarity(queryVector, memoryVector);
  const recencyHours = Math.max(1, (Date.now() - new Date(memory.updatedAt).getTime()) / (1000 * 60 * 60));
  const freshnessScore = 1 / Math.log2(recencyHours + 2);
  const typeWeight = memory.memoryType === 'goal' ? 1.25 : memory.memoryType === 'preference' ? 1.15 : memory.memoryType === 'summary' ? 1.1 : 1;
  const accessBonus = memory.lastAccessedAt ? 0.15 : 0;
  const phraseBonus = normalizeText(query).length >= 6 && normalizeText(memory.content).includes(normalizeText(query)) ? 0.8 : 0;

  return semanticScore * 6 + overlap * 2.1 + phraseBonus + memory.importance * 1.6 + freshnessScore * 2 + typeWeight + accessBonus;
}

async function trimShortTermSnapshots(conversationId: string) {
  const snapshots = await prisma.conversationMemorySnapshot.findMany({
    where: { conversationId },
    orderBy: { updatedAt: 'desc' },
    skip: MAX_SHORT_TERM_SNAPSHOTS,
    select: { id: true },
  });

  if (snapshots.length > 0) {
    await prisma.conversationMemorySnapshot.deleteMany({
      where: { id: { in: snapshots.map((item: { id: string }) => item.id) } },
    });
  }
}

async function trimLongTermMemories(agentId: string) {
  const memories = await prisma.agentMemory.findMany({
    where: { agentId },
    orderBy: [{ importance: 'desc' }, { lastAccessedAt: 'desc' }, { updatedAt: 'desc' }],
    skip: MAX_LONG_TERM_MEMORIES,
    select: { id: true },
  });

  if (memories.length > 0) {
    await prisma.agentMemory.deleteMany({
      where: { id: { in: memories.map((item: { id: string }) => item.id) } },
    });
  }
}

export const memoryService = {
  getLongTermMemories: async (agentId: string, query?: string, limit: number = 8) => {
    const candidates = await prisma.agentMemory.findMany({
      where: { agentId },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: Math.max(limit * 4, 24),
    });

    const idfMap = buildIdfMap([query ?? '', ...candidates.map((item: (typeof candidates)[number]) => item.content)]);
    const ranked = [...candidates]
      .sort((left, right) => scoreMemoryRelevance(right, query ?? '', idfMap) - scoreMemoryRelevance(left, query ?? '', idfMap))
      .slice(0, limit);

    if (ranked.length > 0) {
      await prisma.agentMemory.updateMany({
        where: { id: { in: ranked.map((item) => item.id) } },
        data: { lastAccessedAt: new Date() },
      });
    }

    return ranked;
  },

  getLatestShortTermMemory: async (conversationId: string) =>
    prisma.conversationMemorySnapshot.findFirst({
      where: { conversationId },
      orderBy: { updatedAt: 'desc' },
    }),

  updateShortTermMemory: async (params: {
    conversationId: string;
    conversationTitle: string;
    previousSnapshot?: ShortTermSnapshot | null;
    input: string;
    output: string;
    messageCount: number;
  }) => {
    const userPreferences = mergeDistinctBySimilarity([
      ...asStringArray(params.previousSnapshot?.userPreferences),
      ...extractPreferenceMemories(params.input, params.output),
    ]).slice(0, 6);

    const keyFacts = mergeDistinctBySimilarity([
      ...asStringArray(params.previousSnapshot?.keyFacts),
      ...extractFactMemories(params.output, params.input),
    ]).slice(-6);

    const openTasks = mergeDistinctBySimilarity(extractOpenTasks(params.input, params.output, asStringArray(params.previousSnapshot?.openTasks))).slice(0, 5);

    const snapshot = await prisma.conversationMemorySnapshot.create({
      data: {
        conversationId: params.conversationId,
        summary: summarizeConversation({
          previousSnapshot: params.previousSnapshot ?? undefined,
          input: params.input,
          output: params.output,
          conversationTitle: params.conversationTitle,
          messageCount: params.messageCount,
          keyFacts,
          openTasks,
          userPreferences,
        }),
        keyFacts,
        openTasks,
        userPreferences,
        messageCount: params.messageCount,
      },
    });
    await trimShortTermSnapshots(params.conversationId);
    return snapshot;
  },

  persistLongTermMemories: async (params: {
    agentId: string;
    conversationId: string;
    input: string;
    output: string;
    previousSnapshot?: ShortTermSnapshot | null;
  }) => {
    const candidates: MemoryCandidate[] = [
      ...extractPreferenceMemories(params.input, params.output).map((content) => ({ content, memoryType: 'preference' as MemoryKind, importance: 5, reason: '从用户表达中识别出稳定偏好。' })),
      ...extractGoalMemories(params.input, asStringArray(params.previousSnapshot?.openTasks)).map((content) => ({ content, memoryType: 'goal' as MemoryKind, importance: 4, reason: '从当前需求中提炼出持续目标或下一步方向。' })),
      ...extractFactMemories(params.output, params.input)
        .filter((content) => content.length >= 20)
        .map((content) => ({ content, memoryType: 'fact' as MemoryKind, importance: 3, reason: '从本轮问答中提炼出可复用事实。' })),
      ...extractSummaryMemories(params.input, params.output).map((content) => ({ content, memoryType: 'summary' as MemoryKind, importance: 3, reason: '沉淀本阶段结论，便于后续连续迭代。' })),
    ];

    const mergedCandidates = candidates.filter((candidate, index) => {
      const normalized = normalizeText(candidate.content);
      return candidates.findIndex((item) => item.memoryType === candidate.memoryType && normalizeText(item.content) === normalized) === index;
    });

    const existingMemories = await prisma.agentMemory.findMany({ where: { agentId: params.agentId } });
    const changedMemories: Array<{ id: string; memoryType: MemoryKind; content: string; importance: number; changeType: 'created' | 'updated'; reason: string }> = [];

    for (const candidate of mergedCandidates) {
      const existing = existingMemories.find((memory: (typeof existingMemories)[number]) => {
        if (memory.memoryType !== candidate.memoryType) return false;
        const existingNormalized = normalizeText(memory.content);
        const candidateNormalized = normalizeText(candidate.content);
        return (
          existingNormalized === candidateNormalized ||
          existingNormalized.includes(candidateNormalized) ||
          candidateNormalized.includes(existingNormalized)
        );
      });

      if (existing) {
        const updated = await prisma.agentMemory.update({
          where: { id: existing.id },
          data: {
            content: existing.content.length >= candidate.content.length ? existing.content : candidate.content,
            importance: Math.min(5, Math.max(existing.importance, candidate.importance + 1)),
            sourceConversationId: params.conversationId,
            lastAccessedAt: new Date(),
          },
        });
        changedMemories.push({
          id: updated.id,
          memoryType: updated.memoryType as MemoryKind,
          content: updated.content,
          importance: updated.importance,
          changeType: 'updated',
          reason: candidate.reason,
        });
        continue;
      }

      const created = await prisma.agentMemory.create({
        data: {
          agentId: params.agentId,
          memoryType: candidate.memoryType,
          content: candidate.content,
          importance: candidate.importance,
          sourceConversationId: params.conversationId,
          lastAccessedAt: new Date(),
        },
      });
      changedMemories.push({
        id: created.id,
        memoryType: created.memoryType as MemoryKind,
        content: created.content,
        importance: created.importance,
        changeType: 'created',
        reason: candidate.reason,
      });
    }

    await trimLongTermMemories(params.agentId);
    return changedMemories;
  },

  listAgentMemories: async (agentId: string) =>
    prisma.agentMemory.findMany({
      where: { agentId },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
    }),

  getById: async (memoryId: string) => {
    const memory = await prisma.agentMemory.findUnique({ where: { id: memoryId } });
    if (!memory) {
      throw new HttpError(404, 'NOT_FOUND', '未找到长期记忆');
    }
    return memory;
  },

  updateImportance: async (agentId: string, memoryId: string, importance: number) => {
    const memory = await memoryService.getById(memoryId);
    if (memory.agentId !== agentId) {
      throw new HttpError(403, 'FORBIDDEN', '该记忆不属于当前智能体');
    }
    return prisma.agentMemory.update({
      where: { id: memoryId },
      data: { importance, lastAccessedAt: new Date() },
    });
  },

  remove: async (agentId: string, memoryId: string) => {
    const memory = await memoryService.getById(memoryId);
    if (memory.agentId !== agentId) {
      throw new HttpError(403, 'FORBIDDEN', '该记忆不属于当前智能体');
    }
    return prisma.agentMemory.delete({ where: { id: memoryId } });
  },
};
