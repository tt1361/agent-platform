import { prisma } from '../../lib/prisma.js';

const CHINESE_STOP_PHRASES = [
  '什么情况下',
  '什么情形下',
  '什么情况',
  '什么情形',
  '哪些情况',
  '哪些情形',
  '哪种情况',
  '哪种情形',
  '什么是',
  '请问',
  '如何',
  '怎么',
  '是否',
  '可以',
  '需要',
  '关于',
  '对于',
  '一下',
];

const CHINESE_GENERIC_TERMS = ['员工', '公司', '内容', '规定', '制度', '情形', '情况', '条件', '时候'];
const CHINESE_QUERY_FILLERS = ['会不会', '会被', '是否会', '是否被', '是否能', '是否可以', '能否', '会', '被', '能', '可否'];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\r/g, '')
    .replace(/[\t\f\v\u00A0]+/g, ' ')
    .replace(/[，。！？、；：,.!?;:()[\]{}"'`<>《》【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function extractChineseNgrams(value: string) {
  const compact = normalizeText(value).replace(/\s+/g, '');
  const chineseSegments = compact.match(/[\u4e00-\u9fa5]+/g) ?? [];
  const grams: string[] = [];

  for (const segment of chineseSegments) {
    if (segment.length <= 4) {
      grams.push(segment);
    }

    for (let size = 2; size <= 4; size += 1) {
      if (segment.length < size) continue;
      for (let index = 0; index <= segment.length - size; index += 1) {
        grams.push(segment.slice(index, index + size));
      }
    }
  }

  return grams;
}

function extractEnglishTokens(value: string) {
  return normalizeText(value).match(/[a-z0-9_-]{2,}/g) ?? [];
}

function extractQueryPhrases(query: string) {
  const compact = normalizeText(query).replace(/\s+/g, '');
  const phrases = [compact];
  let cleaned = compact;

  for (const phrase of CHINESE_STOP_PHRASES) {
    cleaned = cleaned.replaceAll(phrase, '');
  }

  for (const phrase of CHINESE_QUERY_FILLERS) {
    cleaned = cleaned.replaceAll(phrase, '');
  }

  for (const phrase of CHINESE_GENERIC_TERMS) {
    cleaned = cleaned.replaceAll(phrase, '');
  }

  phrases.push(cleaned);

  phrases.push(...(compact.match(/[\u4e00-\u9fa5]{2,}/g) ?? []));
  phrases.push(...compact.split(/的|了|吗|呢|呀|啊|并且|以及|或者|还是|与|和/));

  const filtered = unique(
    phrases
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .filter((item) => !CHINESE_GENERIC_TERMS.includes(item)),
  );

  const simplified = filtered.filter((item) => !CHINESE_STOP_PHRASES.some((phrase) => item.includes(phrase)));
  const candidates = simplified.length > 0 ? simplified : filtered;
  const sorted = [...candidates].sort((left, right) => left.length - right.length);
  const minimal = sorted.filter((item, index) => !sorted.some((other, otherIndex) => otherIndex < index && item.includes(other)));

  const prioritized = minimal.filter((item) => item.length >= 2);
  return unique((prioritized.length > 0 ? prioritized : minimal.length > 0 ? minimal : filtered).filter(Boolean));
}

function buildQueryEvidenceText(query: string) {
  const phrases = extractQueryPhrases(query);
  if (phrases.length === 0) return query;
  return unique([...phrases, ...phrases.flatMap((phrase) => extractChineseNgrams(phrase).filter((item) => item.length >= 2))]).join(' ');
}

function tokenize(value: string) {
  return unique([...extractEnglishTokens(value), ...extractChineseNgrams(value)]);
}

function tokenizeWithFrequency(value: string) {
  const frequency = new Map<string, number>();
  for (const token of [...extractEnglishTokens(value), ...extractChineseNgrams(value)]) {
    if (token.length < 2) continue;
    frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }
  return frequency;
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

function buildSparseVector(value: string, idfMap: Map<string, number>) {
  const frequency = tokenizeWithFrequency(value);
  const weighted = new Map<string, number>();

  for (const [token, count] of frequency.entries()) {
    weighted.set(token, (1 + Math.log(count)) * (idfMap.get(token) ?? 1));
  }

  return weighted;
}

function cosineSimilarity(left: Map<string, number>, right: Map<string, number>) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (const value of left.values()) leftNorm += value * value;
  for (const value of right.values()) rightNorm += value * value;
  for (const [token, value] of left.entries()) {
    dot += value * (right.get(token) ?? 0);
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function buildExpandedContent(
  chunk: {
    content: string;
    chunkIndex: number;
    documentId: string;
  },
  byDocument: Map<string, Map<number, string>>,
) {
  const documentChunks = byDocument.get(chunk.documentId);
  if (!documentChunks) return chunk.content;

  const sections = [chunk.chunkIndex - 1, chunk.chunkIndex, chunk.chunkIndex + 1]
    .map((index) => documentChunks.get(index))
    .filter((value): value is string => Boolean(value));

  return unique(sections).join('\n\n');
}

function scoreChunk(
  query: string,
  candidate: { content: string; keywords: unknown; chunkIndex: number; document: { title: string; updatedAt: Date } },
  idfMap: Map<string, number>,
) {
  const queryEvidenceText = buildQueryEvidenceText(query);
  const queryTokens = tokenize(queryEvidenceText);
  const chunkTokens = tokenize(candidate.content);
  const overlap = queryTokens.filter((token) => chunkTokens.includes(token)).length;
  const keywordOverlap = Array.isArray(candidate.keywords)
    ? candidate.keywords.filter((keyword): keyword is string => typeof keyword === 'string' && queryTokens.includes(keyword)).length
    : 0;
  const semanticScore = cosineSimilarity(buildSparseVector(queryEvidenceText, idfMap), buildSparseVector(candidate.content, idfMap));

  const normalizedTitle = normalizeText(candidate.document.title).replace(/\s+/g, '');
  const queryPhrases = extractQueryPhrases(query);
  const contentCompact = normalizeText(candidate.content).replace(/\s+/g, '');
  const phraseHits = queryPhrases.filter((phrase) => contentCompact.includes(phrase)).length;
  const focusPhrases = unique([...queryPhrases, ...queryPhrases.flatMap(p => extractChineseNgrams(p).filter(g => g.length >= 3 && g.length <= 8))]);
  const focusPhraseHits = focusPhrases.filter((phrase) => contentCompact.includes(phrase)).length;
  const hasFocusPhraseHit = focusPhrases.length === 0 || focusPhraseHits > 0;
  const clausePhraseHits = focusPhrases.filter(
    (phrase) => contentCompact.includes(`给予${phrase}`) || contentCompact.includes(`${phrase}处分`) || contentCompact.includes(`${phrase}所列行为`),
  ).length;
  const conditionBonus = /有下列|以下行为|以下情况|以下情形|之一者/.test(candidate.content) ? 3 : 0;
  const titleBonus = queryPhrases.some((phrase) => normalizedTitle.includes(phrase)) ? 1.2 : 0;
  const headingBonus = /(^|\n)\s*[0-9一二三四五六七八九十]+(\.|、)/.test(candidate.content) ? 0.35 : 0;
  const freshnessHours = Math.max(1, (Date.now() - new Date(candidate.document.updatedAt).getTime()) / (1000 * 60 * 60));
  const freshnessScore = 1 / Math.log2(freshnessHours + 2);
  const baseScore = semanticScore * 8 + overlap * 1.6 + keywordOverlap * 1.2 + phraseHits * 6 + clausePhraseHits * 12 + conditionBonus + titleBonus + headingBonus + freshnessScore;

  return hasFocusPhraseHit ? baseScore + focusPhraseHits * 20 : baseScore * (semanticScore > 0.15 ? 0.5 : 0.05);
}

export const knowledgeRetrievalService = {
  retrieve: async (query: string, limit: number = 5, executionId?: string) => {
    const chunks = await prisma.knowledgeChunk.findMany({
      where: {
        document: {
          status: 'ready',
          knowledgeBase: {
            status: 'active',
          },
        },
      },
      include: {
        document: {
          include: {
            knowledgeBase: true,
          },
        },
      },
      orderBy: [{ documentId: 'asc' }, { chunkIndex: 'asc' }],
    });

    if (chunks.length === 0) return [];

    const queryEvidenceText = buildQueryEvidenceText(query);
    const idfMap = buildIdfMap([queryEvidenceText, ...chunks.map((chunk: (typeof chunks)[number]) => chunk.content)]);
    const chunkContentByDocument = new Map<string, Map<number, string>>();

    for (const chunk of chunks) {
      const documentChunks = chunkContentByDocument.get(chunk.documentId) ?? new Map<number, string>();
      documentChunks.set(chunk.chunkIndex, chunk.content);
      chunkContentByDocument.set(chunk.documentId, documentChunks);
    }

    const ranked = [...chunks]
      .map((chunk) => {
        const expandedContent = buildExpandedContent(chunk, chunkContentByDocument);
        return {
          chunk,
          expandedContent,
          score: scoreChunk(query, { ...chunk, content: expandedContent }, idfMap),
        };
      })
      .filter((item) => item.score > 2.0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);

    if (executionId && ranked.length > 0) {
      await prisma.knowledgeRetrievalLog.createMany({
        data: ranked.map(({ chunk, score }) => ({
          executionId,
          query,
          knowledgeBaseId: chunk.document.knowledgeBaseId,
          documentId: chunk.documentId,
          chunkId: chunk.id,
          score,
        })),
      });
    }

    return ranked.map(({ chunk, expandedContent, score }) => ({
      knowledgeBaseId: chunk.document.knowledgeBaseId,
      knowledgeBaseName: chunk.document.knowledgeBase.name,
      documentId: chunk.documentId,
      documentTitle: chunk.document.title,
      sourceType: chunk.document.sourceType,
      sourceUri: chunk.document.sourceUri,
      chunkId: chunk.id,
      chunkIndex: chunk.chunkIndex,
      content: expandedContent,
      score: Number(score.toFixed(4)),
    }));
  },

  listByExecution: async (executionId: string) => {
    const logs = await prisma.knowledgeRetrievalLog.findMany({
      where: { executionId },
      orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
      include: {
        knowledgeBase: true,
        document: true,
        chunk: true,
      },
    });

    return logs.map((log: (typeof logs)[number]) => ({
      id: log.id,
      knowledgeBaseId: log.knowledgeBaseId,
      knowledgeBaseName: log.knowledgeBase.name,
      documentId: log.documentId,
      documentTitle: log.document.title,
      sourceType: log.document.sourceType,
      sourceUri: log.document.sourceUri,
      chunkId: log.chunkId,
      chunkIndex: log.chunk.chunkIndex,
      content: log.chunk.content,
      score: log.score ? Number(log.score) : 0,
      createdAt: log.createdAt,
    }));
  },
};
