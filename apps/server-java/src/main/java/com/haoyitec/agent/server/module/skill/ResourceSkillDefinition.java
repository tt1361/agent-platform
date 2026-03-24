package com.haoyitec.agent.server.module.skill;

import java.util.List;
import java.util.Map;

public record ResourceSkillDefinition(
        String skillKey,
        String name,
        String version,
        String description,
        String status,
        String executorKey,
        Map<String, Object> parametersSchema,
        Map<String, Object> returnsSchema,
        List<String> tags,
        Integer timeoutMs,
        String sourcePath,
        List<String> whenToUse,
        List<String> whenNotToUse,
        PluginDefinition plugin
) {
    public String signature() {
        return skillKey + "@" + version;
    }

    public record PluginDefinition(
            String type,
            List<String> triggerKeywords,
            List<String> secretKeys,
            PluginRequest request,
            PluginResponse response,
            PluginOutput output
    ) {
    }

    public record PluginRequest(
            String method,
            String url,
            Map<String, String> headers,
            Map<String, Object> query,
            Object body
    ) {
    }

    public record PluginResponse(
            String listPath,
            String titleField,
            String snippetField,
            String urlField
    ) {
    }

    public record PluginOutput(
            Integer topK
    ) {
    }
}
