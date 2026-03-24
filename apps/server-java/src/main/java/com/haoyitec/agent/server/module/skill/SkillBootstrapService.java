package com.haoyitec.agent.server.module.skill;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.domain.entity.AgentEntity;
import com.haoyitec.agent.server.domain.entity.SkillEntity;
import com.haoyitec.agent.server.domain.mapper.AgentMapper;
import com.haoyitec.agent.server.domain.mapper.SkillMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class SkillBootstrapService implements ApplicationRunner {

    private final ResourceSkillRegistry resourceSkillRegistry;
    private final SkillMapper skillMapper;
    private final AgentMapper agentMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void run(ApplicationArguments args) {
        syncFromResourceSkills();
    }

    public void syncFromResourceSkills() {
        List<ResourceSkillDefinition> definitions = resourceSkillRegistry.refresh();
        Map<String, ResourceSkillDefinition> definitionMap = new HashMap<>();
        for (ResourceSkillDefinition definition : definitions) {
            definitionMap.put(definition.signature(), definition);
        }

        List<SkillEntity> existingSkills = skillMapper.selectList(new LambdaQueryWrapper<SkillEntity>());
        Map<String, SkillEntity> existingMap = new HashMap<>();
        for (SkillEntity existing : existingSkills) {
            existingMap.put(existing.getSkillKey() + "@" + existing.getVersion(), existing);
        }

        Set<String> activeSkillIds = new HashSet<>();
        for (ResourceSkillDefinition definition : definitions) {
            String signature = definition.signature();
            SkillEntity entity = existingMap.get(signature);
            boolean insert = entity == null;
            if (insert) {
                entity = new SkillEntity();
                entity.setId(IdUtil.uuid());
                entity.setSkillKey(definition.skillKey());
                entity.setVersion(definition.version());
            }

            entity.setName(definition.name());
            entity.setDescription(definition.description());
            entity.setStatus(definition.status());
            entity.setExecutorKey(definition.executorKey());
            entity.setParametersSchema(JsonUtil.toJson(definition.parametersSchema()));
            entity.setReturnsSchema(JsonUtil.toJson(definition.returnsSchema()));
            entity.setTags(JsonUtil.toJson(definition.tags()));
            entity.setTimeoutMs(definition.timeoutMs());

            if (insert) {
                skillMapper.insert(entity);
            } else {
                skillMapper.updateById(entity);
            }
            if ("active".equals(entity.getStatus())) {
                activeSkillIds.add(entity.getId());
            }
        }

        int disabledCount = 0;
        for (SkillEntity existing : existingSkills) {
            String signature = existing.getSkillKey() + "@" + existing.getVersion();
            if (definitionMap.containsKey(signature)) {
                continue;
            }
            if (!"disabled".equals(existing.getStatus())) {
                SkillEntity update = new SkillEntity();
                update.setId(existing.getId());
                update.setStatus("disabled");
                skillMapper.updateById(update);
                disabledCount++;
            }
        }

        int cleanedAgents = cleanupAgentSkillBindings(activeSkillIds);
        log.info("Skill bootstrap completed: loaded={}, disabled={}, cleanedAgents={}",
                definitions.size(), disabledCount, cleanedAgents);
    }

    private int cleanupAgentSkillBindings(Set<String> activeSkillIds) {
        List<AgentEntity> agents = agentMapper.selectList(new LambdaQueryWrapper<AgentEntity>());
        int cleanedCount = 0;
        for (AgentEntity agent : agents) {
            List<String> currentSkillIds = JsonUtil.toStringList(agent.getSkillIds());
            List<String> cleanedSkillIds = new ArrayList<>();
            List<String> removedSkillIds = new ArrayList<>();
            for (String skillId : currentSkillIds) {
                if (activeSkillIds.contains(skillId)) {
                    cleanedSkillIds.add(skillId);
                } else {
                    removedSkillIds.add(skillId);
                }
            }
            if (!removedSkillIds.isEmpty()) {
                AgentEntity update = new AgentEntity();
                update.setId(agent.getId());
                update.setSkillIds(JsonUtil.toJson(cleanedSkillIds));
                agentMapper.updateById(update);
                cleanedCount++;
                log.warn("Removed invalid/disabled skills from agent: agentId={}, removedSkillIds={}",
                        agent.getId(), removedSkillIds);
            }
        }
        return cleanedCount;
    }
}
