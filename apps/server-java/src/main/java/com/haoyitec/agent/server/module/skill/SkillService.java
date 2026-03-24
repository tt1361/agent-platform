package com.haoyitec.agent.server.module.skill;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.domain.entity.SkillEntity;
import com.haoyitec.agent.server.domain.mapper.SkillMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SkillService {

    private final SkillMapper skillMapper;
    private final ResourceSkillRegistry resourceSkillRegistry;
    private final SkillPluginSecretService skillPluginSecretService;

    public List<SkillEntity> list() {
        List<SkillEntity> skills = skillMapper.selectList(new LambdaQueryWrapper<SkillEntity>()
                .orderByDesc(SkillEntity::getUpdatedAt));
        Map<String, SkillSecretView> secretViewMap = skillPluginSecretService.batchSecretViews(
                skills.stream().map(SkillEntity::getId).collect(Collectors.toList()));
        return skills
                .stream()
                .map(skill -> decorateSkill(skill, secretViewMap.get(skill.getId())))
                .toList();
    }

    public List<SkillEntity> listAvailable() {
        Set<String> syncedKeys = skillMapper.selectList(new LambdaQueryWrapper<SkillEntity>())
                .stream()
                .map(item -> item.getSkillKey() + "@" + item.getVersion())
                .collect(Collectors.toSet());

        return resourceSkillRegistry.list().stream()
                .filter(item -> !syncedKeys.contains(item.signature()))
                .map(this::fromResourceDefinition)
                .toList();
    }

    public SkillEntity getById(String id) {
        SkillEntity entity = skillMapper.selectById(id);
        if (entity == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Skill not found");
        }
        return decorateSkill(entity, skillPluginSecretService.getSecretView(id));
    }

    public SkillEntity create(Map<String, Object> input) {
        throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                "技能定义为只读，请通过 apps/server-java/src/main/resources/skills 目录新增技能");
    }

    public SkillEntity updateStatus(String id, String status) {
        SkillEntity entity = getById(id);
        skillMapper.update(null, new LambdaUpdateWrapper<SkillEntity>()
                .eq(SkillEntity::getId, id)
                .set(SkillEntity::getStatus, status));
        entity.setStatus(status);
        return entity;
    }

    public SkillEntity remove(String id) {
        SkillEntity entity = getById(id);
        skillMapper.deleteById(id);
        return entity;
    }

    public SkillSecretView getSecret(String id) {
        return skillPluginSecretService.getSecretView(id);
    }

    public SkillSecretView updateSecret(String id, Map<String, Object> body) {
        return skillPluginSecretService.upsertSecret(id, body);
    }

    public SkillSecretView removeSecret(String id) {
        return skillPluginSecretService.clearSecret(id);
    }

    private SkillEntity decorateSkill(SkillEntity entity, SkillSecretView secretView) {
        resourceSkillRegistry.find(entity.getSkillKey(), entity.getVersion())
                .ifPresentOrElse(definition -> {
                    entity.setSourceType("resource-md");
                    entity.setSourcePath(definition.sourcePath());
                    entity.setWhenToUse(definition.whenToUse());
                    entity.setWhenNotToUse(definition.whenNotToUse());
                    if (definition.plugin() != null) {
                        entity.setPluginType(definition.plugin().type());
                        entity.setPluginTriggerKeywords(definition.plugin().triggerKeywords());
                        entity.setPluginSecretKeys(definition.plugin().secretKeys());
                    } else {
                        entity.setPluginType(null);
                        entity.setPluginTriggerKeywords(List.of());
                        entity.setPluginSecretKeys(List.of());
                    }
                }, () -> {
                    entity.setSourceType("database-legacy");
                    entity.setSourcePath(null);
                    entity.setWhenToUse(List.of());
                    entity.setWhenNotToUse(List.of());
                    entity.setPluginType(null);
                    entity.setPluginTriggerKeywords(List.of());
                    entity.setPluginSecretKeys(List.of());
                });
        if (secretView != null) {
            entity.setSecretConfigured(secretView.configured());
            entity.setSecretMasked(secretView.masked());
        } else {
            entity.setSecretConfigured(false);
            entity.setSecretMasked(Map.of());
        }
        return entity;
    }

    private SkillEntity fromResourceDefinition(ResourceSkillDefinition definition) {
        SkillEntity entity = new SkillEntity();
        entity.setSkillKey(definition.skillKey());
        entity.setName(definition.name());
        entity.setVersion(definition.version());
        entity.setDescription(definition.description());
        entity.setStatus(definition.status());
        entity.setExecutorKey(definition.executorKey());
        entity.setSourceType("resource-md");
        entity.setSourcePath(definition.sourcePath());
        entity.setWhenToUse(definition.whenToUse());
        entity.setWhenNotToUse(definition.whenNotToUse());
        if (definition.plugin() != null) {
            entity.setPluginType(definition.plugin().type());
            entity.setPluginTriggerKeywords(definition.plugin().triggerKeywords());
            entity.setPluginSecretKeys(definition.plugin().secretKeys());
        }
        entity.setSecretConfigured(false);
        entity.setSecretMasked(Map.of());
        return entity;
    }
}
