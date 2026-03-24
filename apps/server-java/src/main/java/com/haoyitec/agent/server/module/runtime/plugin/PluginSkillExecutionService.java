package com.haoyitec.agent.server.module.runtime.plugin;

import com.haoyitec.agent.server.domain.entity.SkillEntity;
import com.haoyitec.agent.server.module.skill.ResourceSkillDefinition;
import com.haoyitec.agent.server.module.skill.SkillPluginSecretService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PluginSkillExecutionService {

    private final PluginSkillRouter pluginSkillRouter;
    private final PluginParamResolver pluginParamResolver;
    private final HttpJsonPluginExecutor httpJsonPluginExecutor;
    private final SkillPluginSecretService skillPluginSecretService;

    public Optional<PluginRunResult> tryExecute(String input, List<SkillEntity> boundSkills, Integer timeoutMs) {
        Optional<PluginSkillRouter.RoutedPluginSkill> routed = pluginSkillRouter.route(input, boundSkills);
        if (routed.isEmpty()) {
            return Optional.empty();
        }
        PluginSkillRouter.RoutedPluginSkill routedPluginSkill = routed.get();
        ResourceSkillDefinition.PluginDefinition plugin = routedPluginSkill.definition().plugin();
        SkillEntity skill = routedPluginSkill.skill();

        Map<String, String> secrets = skillPluginSecretService.getDecryptedSecret(skill.getId());
        List<String> missingSecrets = findMissingSecrets(plugin.secretKeys(), secrets);
        if (!missingSecrets.isEmpty()) {
            Map<String, Object> output = new LinkedHashMap<>();
            output.put("error", "缺少密钥配置: " + String.join(", ", missingSecrets));
            output.put("missingSecrets", missingSecrets);
            Map<String, Object> toolInput = new LinkedHashMap<>();
            toolInput.put("keyword", routedPluginSkill.matchedKeyword());
            toolInput.put("query", input);
            return Optional.of(new PluginRunResult(
                    resolveToolName(skill),
                    toolInput,
                    output,
                    "插件调用失败：缺少密钥配置（" + String.join(", ", missingSecrets) + "）"
            ));
        }

        PluginParamResolver.ResolvedPluginCall call = pluginParamResolver.resolve(plugin, input, routedPluginSkill.matchedKeyword(), secrets);
        HttpJsonPluginExecutor.PluginExecutionResult executionResult = httpJsonPluginExecutor.execute(plugin, call, timeoutMs);

        String promptContext = executionResult.success()
                ? "插件执行结果：" + executionResult.summary()
                : "插件执行失败：" + executionResult.error();
        return Optional.of(new PluginRunResult(
                resolveToolName(skill),
                call.resolvedInput(),
                executionResult.output(),
                promptContext
        ));
    }

    private List<String> findMissingSecrets(List<String> expectedSecretKeys, Map<String, String> secretValues) {
        List<String> missing = new ArrayList<>();
        if (expectedSecretKeys == null || expectedSecretKeys.isEmpty()) {
            return missing;
        }
        for (String key : expectedSecretKeys) {
            if (!StringUtils.hasText(key)) {
                continue;
            }
            String value = secretValues.get(key);
            if (!StringUtils.hasText(value)) {
                missing.add(key);
            }
        }
        return missing;
    }

    private String resolveToolName(SkillEntity skill) {
        if (StringUtils.hasText(skill.getExecutorKey())) {
            return skill.getExecutorKey();
        }
        return skill.getSkillKey();
    }

    public record PluginRunResult(
            String toolName,
            Map<String, Object> toolInput,
            Map<String, Object> toolOutput,
            String promptContext
    ) {
    }
}
