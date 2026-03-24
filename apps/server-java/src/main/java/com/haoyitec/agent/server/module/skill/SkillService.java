package com.haoyitec.agent.server.module.skill;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.common.util.JsonUtil;
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
    private final BuiltinSkillRegistry builtinSkillRegistry;

    public List<SkillEntity> list() {
        return skillMapper.selectList(new LambdaQueryWrapper<SkillEntity>()
                .orderByDesc(SkillEntity::getUpdatedAt));
    }

    public List<BuiltinSkill> listAvailable() {
        List<SkillEntity> installed = list();
        Set<String> keys = installed.stream()
                .map(item -> item.getSkillKey() + "@" + item.getVersion())
                .collect(Collectors.toSet());
        return builtinSkillRegistry.list().stream()
                .filter(item -> !keys.contains(item.skillKey() + "@" + item.version()))
                .toList();
    }

    public SkillEntity getById(String id) {
        SkillEntity entity = skillMapper.selectById(id);
        if (entity == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Skill not found");
        }
        return entity;
    }

    public SkillEntity create(Map<String, Object> input) {
        String skillKey = asString(input, "skillKey");
        String version = asString(input, "version");
        if (skillKey == null || version == null) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "skillKey 和 version 必填");
        }

        BuiltinSkill builtin = builtinSkillRegistry.list().stream()
                .filter(item -> item.skillKey().equals(skillKey) && item.version().equals(version))
                .findFirst()
                .orElse(null);

        if (builtin != null) {
            SkillEntity entity = findByKeyAndVersion(skillKey, version);
            if (entity == null) {
                entity = new SkillEntity();
                entity.setId(IdUtil.uuid());
                entity.setSkillKey(skillKey);
                entity.setVersion(version);
            }
            entity.setName(builtin.name());
            entity.setDescription(builtin.description());
            entity.setExecutorKey(builtin.executorKey());
            entity.setStatus("active");
            entity.setParametersSchema(JsonUtil.toJson(builtin.parametersSchema()));
            entity.setReturnsSchema(JsonUtil.toJson(builtin.returnsSchema()));
            entity.setTags(JsonUtil.toJson(builtin.tags()));
            upsert(entity);
            return entity;
        }

        String name = asString(input, "name");
        String executorKey = asString(input, "executorKey");
        Object parametersSchema = input.get("parametersSchema");
        Object returnsSchema = input.get("returnsSchema");
        if (name == null || executorKey == null || parametersSchema == null || returnsSchema == null) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "创建自定义技能需提供 name/executorKey/parametersSchema/returnsSchema");
        }

        SkillEntity entity = findByKeyAndVersion(skillKey, version);
        if (entity == null) {
            entity = new SkillEntity();
            entity.setId(IdUtil.uuid());
            entity.setSkillKey(skillKey);
            entity.setVersion(version);
        }
        entity.setName(name);
        entity.setDescription(asString(input, "description"));
        entity.setExecutorKey(executorKey);
        entity.setStatus(asString(input, "status") == null ? "active" : asString(input, "status"));
        entity.setParametersSchema(JsonUtil.toJson(parametersSchema));
        entity.setReturnsSchema(JsonUtil.toJson(returnsSchema));
        entity.setTags(JsonUtil.toJson(input.get("tags")));
        entity.setTimeoutMs(asInteger(input.get("timeoutMs")));
        upsert(entity);
        return entity;
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

    private SkillEntity findByKeyAndVersion(String skillKey, String version) {
        return skillMapper.selectOne(new LambdaQueryWrapper<SkillEntity>()
                .eq(SkillEntity::getSkillKey, skillKey)
                .eq(SkillEntity::getVersion, version)
                .last("LIMIT 1"));
    }

    private void upsert(SkillEntity entity) {
        SkillEntity existing = skillMapper.selectById(entity.getId());
        if (existing == null) {
            skillMapper.insert(entity);
        } else {
            skillMapper.updateById(entity);
        }
    }

    private String asString(Map<String, Object> input, String key) {
        Object value = input.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private Integer asInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.parseInt(String.valueOf(value));
    }
}
