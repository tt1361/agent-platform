package com.haoyitec.agent.server.module.provider;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.domain.entity.LlmModelCatalogEntity;
import com.haoyitec.agent.server.domain.mapper.LlmModelCatalogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ModelCatalogService {

    private final LlmModelCatalogMapper catalogMapper;

    public List<Map<String, Object>> list() {
        List<LlmModelCatalogEntity> entities = catalogMapper.selectList(new LambdaQueryWrapper<LlmModelCatalogEntity>()
                .orderByAsc(LlmModelCatalogEntity::getSort)
                .orderByAsc(LlmModelCatalogEntity::getProviderType)
                .orderByAsc(LlmModelCatalogEntity::getModelKey));
        return entities.stream().map(this::toView).toList();
    }

    public List<Map<String, Object>> listActiveByProviderType(String providerType) {
        String normalizedProviderType = normalizeProviderType(providerType);
        List<LlmModelCatalogEntity> entities = catalogMapper.selectList(new LambdaQueryWrapper<LlmModelCatalogEntity>()
                .eq(LlmModelCatalogEntity::getProviderType, normalizedProviderType)
                .eq(LlmModelCatalogEntity::getStatus, "active")
                .orderByAsc(LlmModelCatalogEntity::getSort)
                .orderByAsc(LlmModelCatalogEntity::getModelKey));
        return entities.stream().map(this::toView).toList();
    }

    public LlmModelCatalogEntity findActive(String providerType, String modelKey) {
        if (!StringUtils.hasText(providerType) || !StringUtils.hasText(modelKey)) {
            return null;
        }
        String normalizedProviderType = normalizeProviderType(providerType);
        return catalogMapper.selectOne(new LambdaQueryWrapper<LlmModelCatalogEntity>()
                .eq(LlmModelCatalogEntity::getProviderType, normalizedProviderType)
                .eq(LlmModelCatalogEntity::getModelKey, modelKey)
                .eq(LlmModelCatalogEntity::getStatus, "active")
                .last("LIMIT 1"));
    }

    public Map<String, Object> create(Map<String, Object> input) {
        LlmModelCatalogEntity entity = new LlmModelCatalogEntity();
        entity.setId(IdUtil.uuid());
        applyUpsertInput(entity, input, true);
        ensureUnique(entity.getProviderType(), entity.getModelKey(), null);
        catalogMapper.insert(entity);
        return toView(catalogMapper.selectById(entity.getId()));
    }

    public Map<String, Object> update(String id, Map<String, Object> input) {
        LlmModelCatalogEntity existing = catalogMapper.selectById(id);
        if (existing == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Model catalog item not found");
        }

        applyUpsertInput(existing, input, false);
        ensureUnique(existing.getProviderType(), existing.getModelKey(), id);
        catalogMapper.updateById(existing);
        return toView(catalogMapper.selectById(id));
    }

    public Map<String, Object> remove(String id) {
        LlmModelCatalogEntity existing = catalogMapper.selectById(id);
        if (existing == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Model catalog item not found");
        }
        catalogMapper.deleteById(id);
        return toView(existing);
    }

    public void upsertTemplate(String providerType,
                               String modelKey,
                               String displayName,
                               List<String> capabilities,
                               int sort) {
        LlmModelCatalogEntity existing = catalogMapper.selectOne(new LambdaQueryWrapper<LlmModelCatalogEntity>()
                .eq(LlmModelCatalogEntity::getProviderType, providerType)
                .eq(LlmModelCatalogEntity::getModelKey, modelKey)
                .last("LIMIT 1"));

        if (existing == null) {
            LlmModelCatalogEntity entity = new LlmModelCatalogEntity();
            entity.setId(IdUtil.uuid());
            entity.setProviderType(providerType);
            entity.setModelKey(modelKey);
            entity.setDisplayName(displayName);
            entity.setCapabilities(JsonUtil.toJson(capabilities));
            entity.setStatus("active");
            entity.setIsHot(1);
            entity.setSort(sort);
            entity.setConfig("{}");
            catalogMapper.insert(entity);
            return;
        }

        existing.setDisplayName(displayName);
        existing.setCapabilities(JsonUtil.toJson(capabilities));
        if (!StringUtils.hasText(existing.getStatus())) {
            existing.setStatus("active");
        }
        if (existing.getIsHot() == null) {
            existing.setIsHot(1);
        }
        if (existing.getSort() == null) {
            existing.setSort(sort);
        }
        if (!StringUtils.hasText(existing.getConfig())) {
            existing.setConfig("{}");
        }
        catalogMapper.updateById(existing);
    }

    private void applyUpsertInput(LlmModelCatalogEntity entity, Map<String, Object> input, boolean creating) {
        String providerType = readString(input, "providerType", entity.getProviderType());
        String modelKey = readString(input, "modelKey", entity.getModelKey());
        String displayName = readString(input, "displayName", entity.getDisplayName());
        if (!StringUtils.hasText(providerType) || !StringUtils.hasText(modelKey) || !StringUtils.hasText(displayName)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "providerType/modelKey/displayName 必填");
        }

        entity.setProviderType(normalizeProviderType(providerType));
        entity.setModelKey(modelKey.trim());
        entity.setDisplayName(displayName.trim());

        if (input.containsKey("capabilities") || creating) {
            entity.setCapabilities(JsonUtil.toJson(normalizeStringList(input.get("capabilities"))));
        }
        if (input.containsKey("status") || creating) {
            entity.setStatus(readString(input, "status", creating ? "active" : entity.getStatus()));
        }
        if (input.containsKey("isHot") || creating) {
            entity.setIsHot(intValue(input.get("isHot"), creating ? 1 : entity.getIsHot()));
        }
        if (input.containsKey("sort") || creating) {
            entity.setSort(intValue(input.get("sort"), creating ? 100 : entity.getSort()));
        }
        if (input.containsKey("config") || creating) {
            Object configNode = input.get("config");
            if (configNode == null) {
                entity.setConfig("{}");
            } else if (configNode instanceof String text && text.trim().startsWith("{")) {
                entity.setConfig(text.trim());
            } else {
                entity.setConfig(JsonUtil.toJson(configNode));
            }
        }
    }

    private void ensureUnique(String providerType, String modelKey, String excludeId) {
        LlmModelCatalogEntity existing = catalogMapper.selectOne(new LambdaQueryWrapper<LlmModelCatalogEntity>()
                .eq(LlmModelCatalogEntity::getProviderType, providerType)
                .eq(LlmModelCatalogEntity::getModelKey, modelKey)
                .last("LIMIT 1"));
        if (existing != null && (excludeId == null || !excludeId.equals(existing.getId()))) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "该 providerType + modelKey 已存在");
        }
    }

    private Map<String, Object> toView(LlmModelCatalogEntity entity) {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("id", entity.getId());
        view.put("providerType", entity.getProviderType());
        view.put("modelKey", entity.getModelKey());
        view.put("displayName", entity.getDisplayName());
        view.put("capabilities", normalizeStringList(entity.getCapabilities()));
        view.put("status", entity.getStatus());
        view.put("isHot", entity.getIsHot() != null && entity.getIsHot() == 1);
        view.put("sort", entity.getSort());
        view.put("config", JsonUtil.toMap(entity.getConfig()));
        view.put("createdAt", entity.getCreatedAt());
        view.put("updatedAt", entity.getUpdatedAt());
        return view;
    }

    private String readString(Map<String, Object> input, String key, String defaultValue) {
        Object value = input.get(key);
        if (value == null) {
            return defaultValue;
        }
        return String.valueOf(value);
    }

    private String normalizeProviderType(String providerType) {
        String normalized = providerType == null ? "" : providerType.trim().toLowerCase();
        if (!StringUtils.hasText(normalized)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "providerType 必填");
        }
        return switch (normalized) {
            case "openai-compatible", "openai", "qwen", "deepseek", "minimax", "zhipu", "baidu", "hunyuan", "xai", "mistral", "cohere", "meta",
                 "anthropic", "claude", "google", "gemini", "google-gemini" -> "openai-compatible";
            default -> throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "仅支持兼容协议类型：openai-compatible");
        };
    }

    private Integer intValue(Object value, Integer defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Boolean bool) {
            return bool ? 1 : 0;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.parseInt(String.valueOf(value));
    }

    private List<String> normalizeStringList(Object raw) {
        if (raw == null) {
            return List.of();
        }
        if (raw instanceof String text) {
            if (!StringUtils.hasText(text)) {
                return List.of();
            }
            String trimmed = text.trim();
            if (trimmed.startsWith("[")) {
                return JsonUtil.toStringList(trimmed);
            }
            List<String> result = new ArrayList<>();
            for (String item : trimmed.split(",")) {
                if (StringUtils.hasText(item)) {
                    result.add(item.trim());
                }
            }
            return result;
        }
        if (raw instanceof List<?> list) {
            List<String> result = new ArrayList<>();
            for (Object item : list) {
                if (item != null && StringUtils.hasText(String.valueOf(item))) {
                    result.add(String.valueOf(item));
                }
            }
            return result;
        }
        return List.of();
    }
}
