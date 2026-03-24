package com.haoyitec.agent.server.module.knowledge;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.domain.entity.KnowledgeBaseEntity;
import com.haoyitec.agent.server.domain.entity.KnowledgeChunkEntity;
import com.haoyitec.agent.server.domain.entity.KnowledgeDocumentEntity;
import com.haoyitec.agent.server.domain.entity.KnowledgeRetrievalLogEntity;
import com.haoyitec.agent.server.domain.mapper.KnowledgeBaseMapper;
import com.haoyitec.agent.server.domain.mapper.KnowledgeChunkMapper;
import com.haoyitec.agent.server.domain.mapper.KnowledgeDocumentMapper;
import com.haoyitec.agent.server.domain.mapper.KnowledgeRetrievalLogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class KnowledgeRetrievalService {

    private final KnowledgeBaseMapper knowledgeBaseMapper;
    private final KnowledgeDocumentMapper documentMapper;
    private final KnowledgeChunkMapper chunkMapper;
    private final KnowledgeRetrievalLogMapper retrievalLogMapper;

    public List<KnowledgeRetrievalItem> retrieve(String query, Integer limit, String executionId) {
        int topN = (limit == null || limit <= 0) ? 5 : limit;
        String normalized = normalize(query);
        if (!StringUtils.hasText(normalized)) {
            return List.of();
        }

        List<KnowledgeBaseEntity> bases = knowledgeBaseMapper.selectList(new LambdaQueryWrapper<KnowledgeBaseEntity>()
                .eq(KnowledgeBaseEntity::getStatus, "active"));
        if (bases.isEmpty()) {
            return List.of();
        }

        Map<String, KnowledgeBaseEntity> baseMap = bases.stream()
                .collect(HashMap::new, (m, b) -> m.put(b.getId(), b), HashMap::putAll);

        List<KnowledgeDocumentEntity> documents = documentMapper.selectList(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                .in(KnowledgeDocumentEntity::getKnowledgeBaseId, baseMap.keySet())
                .eq(KnowledgeDocumentEntity::getStatus, "ready"));
        if (documents.isEmpty()) {
            return List.of();
        }

        Map<String, KnowledgeDocumentEntity> documentMap = documents.stream()
                .collect(HashMap::new, (m, d) -> m.put(d.getId(), d), HashMap::putAll);

        List<KnowledgeChunkEntity> chunks = chunkMapper.selectList(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .in(KnowledgeChunkEntity::getDocumentId, documentMap.keySet())
                .orderByAsc(KnowledgeChunkEntity::getDocumentId)
                .orderByAsc(KnowledgeChunkEntity::getChunkIndex));

        List<ScoredChunk> scored = new ArrayList<>();
        for (KnowledgeChunkEntity chunk : chunks) {
            KnowledgeDocumentEntity doc = documentMap.get(chunk.getDocumentId());
            if (doc == null) {
                continue;
            }
            KnowledgeBaseEntity base = baseMap.get(doc.getKnowledgeBaseId());
            if (base == null) {
                continue;
            }
            double score = score(normalized, normalize(chunk.getContent()), normalize(doc.getTitle()));
            if (score <= 0) {
                continue;
            }
            scored.add(new ScoredChunk(chunk, doc, base, score));
        }

        scored.sort(Comparator.comparingDouble(ScoredChunk::score).reversed());
        if (scored.size() > topN) {
            scored = scored.subList(0, topN);
        }

        List<KnowledgeRetrievalItem> results = scored.stream()
                .map(item -> new KnowledgeRetrievalItem(
                        item.base().getId(),
                        item.base().getName(),
                        item.doc().getId(),
                        item.doc().getTitle(),
                        item.doc().getSourceType(),
                        item.doc().getSourceUri(),
                        item.chunk().getId(),
                        item.chunk().getChunkIndex(),
                        item.chunk().getContent(),
                        Math.round(item.score() * 10000D) / 10000D,
                        null
                ))
                .toList();

        if (StringUtils.hasText(executionId) && !results.isEmpty()) {
            for (KnowledgeRetrievalItem item : results) {
                KnowledgeRetrievalLogEntity log = new KnowledgeRetrievalLogEntity();
                log.setId(IdUtil.uuid());
                log.setExecutionId(executionId);
                log.setQuery(query);
                log.setKnowledgeBaseId(item.knowledgeBaseId());
                log.setDocumentId(item.documentId());
                log.setChunkId(item.chunkId());
                log.setScore(BigDecimal.valueOf(item.score()));
                retrievalLogMapper.insert(log);
            }
        }

        return results;
    }

    public List<KnowledgeRetrievalItem> listByExecution(String executionId) {
        List<KnowledgeRetrievalLogEntity> logs = retrievalLogMapper.selectList(new LambdaQueryWrapper<KnowledgeRetrievalLogEntity>()
                .eq(KnowledgeRetrievalLogEntity::getExecutionId, executionId)
                .orderByDesc(KnowledgeRetrievalLogEntity::getScore)
                .orderByAsc(KnowledgeRetrievalLogEntity::getCreatedAt));

        if (logs.isEmpty()) {
            return List.of();
        }

        Set<String> baseIds = logs.stream().map(KnowledgeRetrievalLogEntity::getKnowledgeBaseId).collect(HashSet::new, HashSet::add, HashSet::addAll);
        Set<String> documentIds = logs.stream().map(KnowledgeRetrievalLogEntity::getDocumentId).collect(HashSet::new, HashSet::add, HashSet::addAll);
        Set<String> chunkIds = logs.stream().map(KnowledgeRetrievalLogEntity::getChunkId).collect(HashSet::new, HashSet::add, HashSet::addAll);

        Map<String, KnowledgeBaseEntity> baseMap = knowledgeBaseMapper.selectList(new LambdaQueryWrapper<KnowledgeBaseEntity>()
                        .in(KnowledgeBaseEntity::getId, baseIds))
                .stream().collect(HashMap::new, (m, v) -> m.put(v.getId(), v), HashMap::putAll);
        Map<String, KnowledgeDocumentEntity> docMap = documentMapper.selectList(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                        .in(KnowledgeDocumentEntity::getId, documentIds))
                .stream().collect(HashMap::new, (m, v) -> m.put(v.getId(), v), HashMap::putAll);
        Map<String, KnowledgeChunkEntity> chunkMap = chunkMapper.selectList(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                        .in(KnowledgeChunkEntity::getId, chunkIds))
                .stream().collect(HashMap::new, (m, v) -> m.put(v.getId(), v), HashMap::putAll);

        return logs.stream().map(log -> {
            KnowledgeBaseEntity base = baseMap.get(log.getKnowledgeBaseId());
            KnowledgeDocumentEntity doc = docMap.get(log.getDocumentId());
            KnowledgeChunkEntity chunk = chunkMap.get(log.getChunkId());
            return new KnowledgeRetrievalItem(
                    log.getKnowledgeBaseId(),
                    base == null ? "" : base.getName(),
                    log.getDocumentId(),
                    doc == null ? "" : doc.getTitle(),
                    doc == null ? "manual" : doc.getSourceType(),
                    doc == null ? null : doc.getSourceUri(),
                    log.getChunkId(),
                    chunk == null ? 0 : chunk.getChunkIndex(),
                    chunk == null ? "" : chunk.getContent(),
                    log.getScore() == null ? 0D : log.getScore().doubleValue(),
                    log.getCreatedAt()
            );
        }).toList();
    }

    public List<KnowledgeRetrievalItem> listCitedByAnswer(List<KnowledgeRetrievalItem> items, String answerText) {
        if (!StringUtils.hasText(answerText) || items == null || items.isEmpty()) {
            return List.of();
        }
        String normalizedAnswer = normalize(answerText);
        return items.stream().filter(item -> {
            if (StringUtils.hasText(item.documentTitle()) && normalizedAnswer.contains(normalize(item.documentTitle()))) {
                return true;
            }
            String sample = item.content();
            if (!StringUtils.hasText(sample)) {
                return false;
            }
            String[] parts = normalize(sample).split(" ");
            int hit = 0;
            for (String part : parts) {
                if (part.length() < 2) {
                    continue;
                }
                if (normalizedAnswer.contains(part)) {
                    hit++;
                }
            }
            return hit >= 4;
        }).toList();
    }

    private double score(String query, String content, String title) {
        if (!StringUtils.hasText(content)) {
            return 0D;
        }
        Set<String> queryTokens = tokenize(query);
        Set<String> contentTokens = tokenize(content);
        if (queryTokens.isEmpty() || contentTokens.isEmpty()) {
            return 0D;
        }
        long overlap = queryTokens.stream().filter(contentTokens::contains).count();
        if (overlap == 0) {
            return 0D;
        }
        double score = overlap * 1.2D + (double) overlap / queryTokens.size() * 5D;
        if (StringUtils.hasText(title)) {
            Set<String> titleTokens = tokenize(title);
            long titleOverlap = queryTokens.stream().filter(titleTokens::contains).count();
            score += titleOverlap * 1.5D;
        }
        return score;
    }

    private Set<String> tokenize(String text) {
        String[] parts = normalize(text).split(" ");
        Set<String> result = new HashSet<>();
        for (String part : parts) {
            if (part.length() >= 2) {
                result.add(part);
            }
            if (containsCjk(part)) {
                addBigrams(part, result);
            }
        }
        return result;
    }

    private boolean containsCjk(String text) {
        return text.codePoints().anyMatch(cp -> {
            Character.UnicodeScript script = Character.UnicodeScript.of(cp);
            return script == Character.UnicodeScript.HAN
                    || script == Character.UnicodeScript.HIRAGANA
                    || script == Character.UnicodeScript.KATAKANA
                    || script == Character.UnicodeScript.HANGUL;
        });
    }

    private void addBigrams(String text, Set<String> target) {
        if (!StringUtils.hasText(text)) {
            return;
        }
        int[] codePoints = text.codePoints().toArray();
        if (codePoints.length < 2) {
            return;
        }
        for (int i = 0; i < codePoints.length - 1; i++) {
            String token = new String(codePoints, i, 2);
            if (token.length() >= 2) {
                target.add(token);
            }
        }
    }

    private String normalize(String text) {
        if (text == null) {
            return "";
        }
        return text.toLowerCase()
                .replaceAll("[\\r\\n\\t]+", " ")
                .replaceAll("[，。！？、；：,.!?;:()\\[\\]{}\"'`<>《》【】]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private record ScoredChunk(KnowledgeChunkEntity chunk, KnowledgeDocumentEntity doc, KnowledgeBaseEntity base, double score) {
    }
}
