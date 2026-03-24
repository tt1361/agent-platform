package com.haoyitec.agent.server.module.provider;

import java.time.LocalDateTime;
import java.util.Map;

public record LlmProviderSecretView(
        String providerId,
        boolean configured,
        Map<String, String> masked,
        LocalDateTime updatedAt
) {
}
