package com.haoyitec.agent.server.module.skill;

import java.util.List;
import java.util.Map;

public record BuiltinSkill(
        String skillKey,
        String name,
        String version,
        String description,
        String executorKey,
        Map<String, Object> parametersSchema,
        Map<String, Object> returnsSchema,
        List<String> tags
) {
}
