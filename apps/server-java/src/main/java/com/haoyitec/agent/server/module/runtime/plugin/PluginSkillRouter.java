package com.haoyitec.agent.server.module.runtime.plugin;

import com.haoyitec.agent.server.domain.entity.SkillEntity;
import com.haoyitec.agent.server.module.skill.ResourceSkillDefinition;
import com.haoyitec.agent.server.module.skill.ResourceSkillRegistry;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Component
@RequiredArgsConstructor
public class PluginSkillRouter {

    private final ResourceSkillRegistry resourceSkillRegistry;

    public Optional<RoutedPluginSkill> route(String input, List<SkillEntity> boundSkills) {
        if (!StringUtils.hasText(input) || boundSkills == null || boundSkills.isEmpty()) {
            return Optional.empty();
        }
        String normalizedInput = input.toLowerCase(Locale.ROOT);

        for (SkillEntity skill : boundSkills) {
            Optional<ResourceSkillDefinition> definitionOptional = resourceSkillRegistry.find(skill.getSkillKey(), skill.getVersion());
            if (definitionOptional.isEmpty()) {
                continue;
            }
            ResourceSkillDefinition definition = definitionOptional.get();
            ResourceSkillDefinition.PluginDefinition plugin = definition.plugin();
            if (plugin == null || !"http-json".equalsIgnoreCase(plugin.type())) {
                continue;
            }
            if (plugin.triggerKeywords() == null || plugin.triggerKeywords().isEmpty()) {
                continue;
            }
            for (String keyword : plugin.triggerKeywords()) {
                if (!StringUtils.hasText(keyword)) {
                    continue;
                }
                if (normalizedInput.contains(keyword.toLowerCase(Locale.ROOT))) {
                    return Optional.of(new RoutedPluginSkill(skill, definition, keyword));
                }
            }
        }
        return Optional.empty();
    }

    public record RoutedPluginSkill(
            SkillEntity skill,
            ResourceSkillDefinition definition,
            String matchedKeyword
    ) {
    }
}
