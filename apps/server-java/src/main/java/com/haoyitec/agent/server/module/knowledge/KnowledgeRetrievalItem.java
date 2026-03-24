package com.haoyitec.agent.server.module.knowledge;

import java.time.LocalDateTime;

public record KnowledgeRetrievalItem(
        String knowledgeBaseId,
        String knowledgeBaseName,
        String documentId,
        String documentTitle,
        String sourceType,
        String sourceUri,
        String chunkId,
        Integer chunkIndex,
        String content,
        Double score,
        LocalDateTime createdAt
) {
}
