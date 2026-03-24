package com.haoyitec.agent.server.module.skill;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
@RequiredArgsConstructor
public class ResourceSkillRegistry {

    private final ResourceSkillLoader skillLoader;
    private volatile Map<String, ResourceSkillDefinition> definitionMap = Map.of();

    public synchronized List<ResourceSkillDefinition> refresh() {
        List<ResourceSkillDefinition> definitions = skillLoader.loadAll();
        Map<String, ResourceSkillDefinition> map = new HashMap<>();
        for (ResourceSkillDefinition definition : definitions) {
            map.put(definition.signature(), definition);
        }
        this.definitionMap = map;
        return definitions;
    }

    public List<ResourceSkillDefinition> list() {
        if (definitionMap.isEmpty()) {
            refresh();
        }
        return List.copyOf(definitionMap.values());
    }

    public Optional<ResourceSkillDefinition> find(String skillKey, String version) {
        if (definitionMap.isEmpty()) {
            refresh();
        }
        return Optional.ofNullable(definitionMap.get(skillKey + "@" + version));
    }
}
