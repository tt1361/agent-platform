package com.haoyitec.agent.server.module.provider;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.domain.entity.LlmProviderEntity;
import com.haoyitec.agent.server.domain.mapper.LlmProviderMapper;
import com.haoyitec.agent.server.infra.ai.AiChatService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProviderService {

    private final LlmProviderMapper providerMapper;
    private final LlmProviderSecretService providerSecretService;
    private final ModelCatalogService modelCatalogService;
    private final AiChatService aiChatService;

    public List<LlmProviderEntity> list() {
        List<LlmProviderEntity> providers = providerMapper.selectList(new LambdaQueryWrapper<LlmProviderEntity>()
                .orderByDesc(LlmProviderEntity::getUpdatedAt));
        Map<String, LlmProviderSecretView> secretViews = providerSecretService.batchSecretViews(
                providers.stream().map(LlmProviderEntity::getId).collect(Collectors.toList()));
        return providers.stream().map(provider -> decorateProvider(provider, secretViews.get(provider.getId()))).toList();
    }

    public LlmProviderEntity getById(String id) {
        LlmProviderEntity entity = providerMapper.selectById(id);
        if (entity == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Provider not found");
        }
        return decorateProvider(entity, providerSecretService.getSecretView(id));
    }

    public LlmProviderEntity create(Map<String, Object> input) {
        String providerKey = readRequired(input, "providerKey", "providerKey 必填");
        String name = readRequired(input, "name", "name 必填");
        String providerType = normalizeProviderType(readRequired(input, "providerType", "providerType 必填"));
        String apiBaseUrl = readRequired(input, "apiBaseUrl", "apiBaseUrl 必填");
        String defaultModel = firstNonBlank(readString(input, "defaultModel", null), readString(input, "model", null));
        if (!StringUtils.hasText(defaultModel)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "defaultModel 必填");
        }
        String apiKey = readRequired(input, "apiKey", "apiKey 必填");

        ensureProviderKeyUnique(providerKey, null);

        LlmProviderEntity entity = new LlmProviderEntity();
        entity.setId(IdUtil.uuid());
        entity.setProviderKey(providerKey.trim());
        entity.setName(name.trim());
        entity.setProviderType(providerType);
        entity.setApiBaseUrl(apiBaseUrl.trim());
        entity.setModel(defaultModel.trim());
        entity.setStatus(readString(input, "status", "active"));
        entity.setConfig(toJsonNode(input.get("config"), "{}"));
        entity.setApiKeyMasked(maskValue(apiKey));

        providerMapper.insert(entity);
        providerSecretService.upsertSecret(entity.getId(), apiKey);
        return getById(entity.getId());
    }

    public LlmProviderEntity update(String id, Map<String, Object> input) {
        LlmProviderEntity existing = providerMapper.selectById(id);
        if (existing == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Provider not found");
        }

        LlmProviderEntity update = new LlmProviderEntity();
        update.setId(id);

        if (input.containsKey("providerKey")) {
            String providerKey = readRequired(input, "providerKey", "providerKey 必填");
            ensureProviderKeyUnique(providerKey, id);
            update.setProviderKey(providerKey.trim());
        }
        if (input.containsKey("name")) {
            update.setName(readRequired(input, "name", "name 必填").trim());
        }
        if (input.containsKey("providerType")) {
            update.setProviderType(normalizeProviderType(readRequired(input, "providerType", "providerType 必填")));
        }
        if (input.containsKey("apiBaseUrl")) {
            update.setApiBaseUrl(readRequired(input, "apiBaseUrl", "apiBaseUrl 必填").trim());
        }
        if (input.containsKey("model") || input.containsKey("defaultModel")) {
            String nextModel = firstNonBlank(readString(input, "defaultModel", null), readString(input, "model", null));
            if (!StringUtils.hasText(nextModel)) {
                throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "defaultModel 必填");
            }
            update.setModel(nextModel.trim());
        }
        if (input.containsKey("status")) {
            update.setStatus(readRequired(input, "status", "status 必填"));
        }
        if (input.containsKey("config")) {
            update.setConfig(toJsonNode(input.get("config"), "{}"));
        }

        if (hasAnyUpdate(update)) {
            providerMapper.updateById(update);
        }

        if (input.containsKey("apiKey")) {
            Object apiKeyNode = input.get("apiKey");
            if (apiKeyNode != null && StringUtils.hasText(String.valueOf(apiKeyNode))) {
                String apiKey = String.valueOf(apiKeyNode).trim();
                providerSecretService.upsertSecret(id, apiKey);
                providerMapper.update(null, new LambdaUpdateWrapper<LlmProviderEntity>()
                        .eq(LlmProviderEntity::getId, id)
                        .set(LlmProviderEntity::getApiKeyMasked, maskValue(apiKey)));
            }
        }

        return getById(id);
    }

    public LlmProviderEntity updateStatus(String id, String status) {
        if (!StringUtils.hasText(status)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "status 必填");
        }
        getById(id);
        providerMapper.update(null, new LambdaUpdateWrapper<LlmProviderEntity>()
                .eq(LlmProviderEntity::getId, id)
                .set(LlmProviderEntity::getStatus, status));
        return getById(id);
    }

    public LlmProviderEntity remove(String id) {
        LlmProviderEntity existing = getById(id);
        providerMapper.deleteById(id);
        return existing;
    }

    public LlmProviderSecretView getSecret(String providerId) {
        getById(providerId);
        return providerSecretService.getSecretView(providerId);
    }

    public LlmProviderSecretView putSecret(String providerId, Map<String, Object> input) {
        getById(providerId);
        if (input == null) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "apiKey 必填");
        }

        String apiKey = readString(input, "apiKey", null);
        if (!StringUtils.hasText(apiKey)) {
            Object secretsNode = input.get("secrets");
            if (secretsNode instanceof Map<?, ?> secretsMap) {
                Object mapped = secretsMap.get("apiKey");
                if (mapped == null) {
                    mapped = secretsMap.get("apikey");
                }
                if (mapped != null) {
                    apiKey = String.valueOf(mapped);
                }
            }
        }
        if (!StringUtils.hasText(apiKey)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "apiKey 必填");
        }

        LlmProviderSecretView view = providerSecretService.upsertSecret(providerId, apiKey.trim());
        providerMapper.update(null, new LambdaUpdateWrapper<LlmProviderEntity>()
                .eq(LlmProviderEntity::getId, providerId)
                .set(LlmProviderEntity::getApiKeyMasked, maskValue(apiKey)));
        return view;
    }

    public LlmProviderSecretView clearSecret(String providerId) {
        getById(providerId);
        LlmProviderSecretView view = providerSecretService.clearSecret(providerId);
        providerMapper.update(null, new LambdaUpdateWrapper<LlmProviderEntity>()
                .eq(LlmProviderEntity::getId, providerId)
                .set(LlmProviderEntity::getApiKeyMasked, null));
        return view;
    }

    public List<Map<String, Object>> listModels(String providerId) {
        LlmProviderEntity provider = getById(providerId);
        List<Map<String, Object>> allModels = modelCatalogService.listActiveByProviderType(normalizeProviderType(provider.getProviderType()));
        // 模型列表按“账号可用范围”过滤，避免同协议下的跨厂商模型被误选。
        Set<String> allowedModelKeys = resolveAllowedModelKeys(provider);
        if (allowedModelKeys.isEmpty()) {
            return allModels;
        }
        return allModels.stream()
                .filter(item -> allowedModelKeys.contains(String.valueOf(item.get("modelKey"))))
                .toList();
    }

    public Map<String, Object> testConnection(String providerId, Map<String, Object> input) {
        LlmProviderEntity provider = getById(providerId);
        String modelKey = readString(input, "modelKey", provider.getModel());
        String prompt = readString(input, "input", "请只返回 JSON：{\"status\":\"ok\",\"message\":\"连接成功\"}");

        List<AiChatService.ChatAttachment> attachments = aiChatService.parseAttachments(input.get("attachments"));
        AiChatService.ChatRoute route = aiChatService.resolveRoute(
                new AiChatService.ChatRequest(providerId, modelKey, attachments, List.of(), null, 45000)
        );
        String content = aiChatService.chat(
                "你是连接测试助手",
                prompt,
                new AiChatService.ChatRequest(
                        providerId,
                        modelKey,
                        attachments,
                        List.of(),
                        null,
                        45000
                )
        );

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "ok");
        result.put("providerType", route.providerType());
        result.put("providerModel", provider.getModel());
        result.put("model", route.modelKey());
        result.put("contentPreview", content.length() > 200 ? content.substring(0, 200) : content);
        result.put("attachments", attachments.size());
        return result;
    }

    private LlmProviderEntity decorateProvider(LlmProviderEntity provider, LlmProviderSecretView secretView) {
        provider.setDefaultModel(provider.getModel());
        if (secretView != null) {
            provider.setSecretConfigured(secretView.configured());
            provider.setSecretMasked(secretView.masked());
        } else {
            provider.setSecretConfigured(false);
            provider.setSecretMasked(Map.of());
        }
        return provider;
    }

    private void ensureProviderKeyUnique(String providerKey, String excludeId) {
        LlmProviderEntity existing = providerMapper.selectOne(new LambdaQueryWrapper<LlmProviderEntity>()
                .eq(LlmProviderEntity::getProviderKey, providerKey)
                .last("LIMIT 1"));
        if (existing != null && (excludeId == null || !excludeId.equals(existing.getId()))) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "providerKey 已存在");
        }
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

    private Set<String> resolveAllowedModelKeys(LlmProviderEntity provider) {
        Set<String> keys = new LinkedHashSet<>();
        Map<String, Object> configMap = JsonUtil.toMap(provider.getConfig());
        Object supported = configMap.get("supportedModelKeys");
        if (supported instanceof List<?> list) {
            for (Object item : list) {
                if (item != null && StringUtils.hasText(String.valueOf(item))) {
                    keys.add(String.valueOf(item).trim());
                }
            }
        } else if (supported instanceof String text) {
            for (String item : text.split(",")) {
                if (StringUtils.hasText(item)) {
                    keys.add(item.trim());
                }
            }
        }
        if (keys.isEmpty() && StringUtils.hasText(provider.getModel())) {
            keys.add(provider.getModel().trim());
        }
        return keys;
    }

    private boolean hasAnyUpdate(LlmProviderEntity update) {
        return StringUtils.hasText(update.getProviderKey())
                || StringUtils.hasText(update.getName())
                || StringUtils.hasText(update.getProviderType())
                || StringUtils.hasText(update.getApiBaseUrl())
                || StringUtils.hasText(update.getModel())
                || StringUtils.hasText(update.getStatus())
                || update.getConfig() != null;
    }

    private String readRequired(Map<String, Object> input, String key, String message) {
        Object value = input.get(key);
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
        }
        return String.valueOf(value);
    }

    private String readString(Map<String, Object> input, String key, String defaultValue) {
        if (input == null) {
            return defaultValue;
        }
        Object value = input.get(key);
        return value == null ? defaultValue : String.valueOf(value);
    }

    private String toJsonNode(Object value, String defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof String text) {
            String trimmed = text.trim();
            if (trimmed.startsWith("{")) {
                return trimmed;
            }
        }
        return JsonUtil.toJson(value);
    }

    private String maskValue(String value) {
        if (!StringUtils.hasText(value)) {
            return "****";
        }
        String trimmed = value.trim();
        if (trimmed.length() <= 4) {
            return trimmed.charAt(0) + "***";
        }
        return trimmed.substring(0, 2) + "****" + trimmed.substring(trimmed.length() - 2);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }
}
