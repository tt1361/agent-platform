package com.haoyitec.agent.server.module.rag;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class RagService {

    private final Map<String, RagChunk> chunkStore = new HashMap<>();

    public List<RagChunk> indexDocument(String documentId, String rawText) {
        if (!StringUtils.hasText(documentId) || !StringUtils.hasText(rawText)) {
            return List.of();
        }
        String[] segments = rawText.split("\\n{2,}");
        List<String> chunkTexts = new ArrayList<>();
        for (String segment : segments) {
            String normalized = segment == null ? "" : segment.trim();
            if (StringUtils.hasText(normalized)) {
                chunkTexts.add(normalized);
            }
        }
        if (chunkTexts.isEmpty()) {
            chunkTexts.add(rawText.trim());
        }

        List<RagChunk> chunks = new ArrayList<>();
        for (int i = 0; i < chunkTexts.size(); i++) {
            RagChunk chunk = new RagChunk(documentId + ":" + i, documentId, i, chunkTexts.get(i));
            chunkStore.put(chunk.id(), chunk);
            chunks.add(chunk);
        }
        return chunks;
    }

    public List<RagSearchResult> retrieve(String query, Integer limit, Map<String, Object> filter) {
        int topN = limit == null || limit <= 0 ? 5 : limit;
        Set<String> queryTokens = tokenize(query);
        if (queryTokens.isEmpty()) {
            return List.of();
        }
        String filterDocId = filter == null ? null : asString(filter.get("documentId"));

        List<RagSearchResult> results = new ArrayList<>();
        for (RagChunk chunk : chunkStore.values()) {
            if (StringUtils.hasText(filterDocId) && !filterDocId.equals(chunk.documentId())) {
                continue;
            }
            Set<String> chunkTokens = tokenize(chunk.content());
            long overlap = queryTokens.stream().filter(chunkTokens::contains).count();
            if (overlap == 0) {
                continue;
            }
            double score = (double) overlap / Math.max(queryTokens.size(), 1);
            results.add(new RagSearchResult(chunk, score));
        }

        return results.stream()
                .sorted(Comparator.comparingDouble(RagSearchResult::score).reversed())
                .limit(topN)
                .toList();
    }

    public void purgeDocument(String documentId) {
        List<String> ids = chunkStore.values().stream()
                .filter(item -> documentId.equals(item.documentId()))
                .map(RagChunk::id)
                .toList();
        ids.forEach(chunkStore::remove);
    }

    private Set<String> tokenize(String value) {
        if (!StringUtils.hasText(value)) {
            return Set.of();
        }
        String[] parts = value.toLowerCase().split("[^a-z0-9_\\u4e00-\\u9fa5]+");
        Set<String> result = new HashSet<>();
        for (String part : parts) {
            if (part.length() >= 2) {
                result.add(part);
            }
        }
        return result;
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    public record RagChunk(String id, String documentId, Integer chunkIndex, String content) {
    }

    public record RagSearchResult(RagChunk chunk, Double score) {
    }
}
