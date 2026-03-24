package com.haoyitec.agent.server.module.skill;

import java.time.LocalDateTime;
import java.util.Map;

public record SkillSecretView(
        String skillId,
        boolean configured,
        Map<String, String> masked,
        LocalDateTime updatedAt
) {
}
