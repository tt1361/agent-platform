package com.haoyitec.agent.server.infra.ai;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.domain.entity.LlmModelCatalogEntity;
import com.haoyitec.agent.server.domain.entity.LlmProviderEntity;
import com.haoyitec.agent.server.domain.mapper.LlmProviderMapper;
import com.haoyitec.agent.server.module.provider.LlmProviderSecretService;
import com.haoyitec.agent.server.module.provider.ModelCatalogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiChatService {

    private static final int DEFAULT_TIMEOUT_MS = 60000;

    private final LlmProviderMapper providerMapper;
    private final LlmProviderSecretService providerSecretService;
    private final ModelCatalogService modelCatalogService;
    private final LlmChatModelFactoryService llmChatModelFactoryService;

    public String chat(String systemPrompt, String userPrompt) {
        String providerId = findDefaultProviderId();
        return chat(systemPrompt, userPrompt, new ChatRequest(
                providerId,
                null,
                List.of(),
                List.of(),
                null,
                null
        ));
    }

    public String chat(String systemPrompt, String userPrompt, ChatRequest chatRequest) {
        ChatRoute route = resolveRoute(chatRequest);
        List<ChatAttachment> attachments = normalizeAttachments(chatRequest == null ? null : chatRequest.attachments());
        int timeoutMs = chatRequest == null || chatRequest.timeoutMs() == null || chatRequest.timeoutMs() <= 0
                ? DEFAULT_TIMEOUT_MS
                : chatRequest.timeoutMs();

        String normalizedSystemPrompt = StringUtils.hasText(systemPrompt) ? systemPrompt : "你是一个中文助手。";
        String normalizedUserPrompt = StringUtils.hasText(userPrompt) ? userPrompt : "";
        String userPromptWithHints = appendNonImageAttachmentHints(normalizedUserPrompt, attachments);

        try {
            return llmChatModelFactoryService.chat(route, normalizedSystemPrompt, userPromptWithHints, attachments, timeoutMs);
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("AI 调用失败 providerId={}, providerKey={}, modelKey={}, err={}",
                    route.providerId(), route.providerKey(), route.modelKey(), ex.getMessage());
            throw new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED", "模型调用失败: " + ex.getMessage());
        }
    }

    public Flux<String> chatStream(String systemPrompt, String userPrompt, ChatRequest chatRequest) {
        ChatRoute route = resolveRoute(chatRequest);
        List<ChatAttachment> attachments = normalizeAttachments(chatRequest == null ? null : chatRequest.attachments());
        int timeoutMs = chatRequest == null || chatRequest.timeoutMs() == null || chatRequest.timeoutMs() <= 0
                ? DEFAULT_TIMEOUT_MS
                : chatRequest.timeoutMs();

        String normalizedSystemPrompt = StringUtils.hasText(systemPrompt) ? systemPrompt : "你是一个中文助手。";
        String normalizedUserPrompt = StringUtils.hasText(userPrompt) ? userPrompt : "";
        String userPromptWithHints = appendNonImageAttachmentHints(normalizedUserPrompt, attachments);
        return llmChatModelFactoryService.chatStream(route, normalizedSystemPrompt, userPromptWithHints, attachments, timeoutMs)
                .onErrorMap(ex -> {
                    if (ex instanceof BizException) {
                        return ex;
                    }
                    log.warn("AI 流式调用失败 providerId={}, providerKey={}, modelKey={}, err={}",
                            route.providerId(), route.providerKey(), route.modelKey(), ex.getMessage());
                    return new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED", "模型流式调用失败: " + ex.getMessage());
                });
    }

    public ChatRoute resolveRoute(ChatRequest chatRequest) {
        String providerId = chatRequest == null ? null : chatRequest.providerId();
        if (!StringUtils.hasText(providerId)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "providerId 必填，且必须为已配置厂商账号");
        }

        LlmProviderEntity provider = providerMapper.selectById(providerId);
        if (provider == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "模型厂商不存在: " + providerId);
        }
        if (!"active".equalsIgnoreCase(provider.getStatus())) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "模型厂商未启用，无法调用");
        }

        String apiKey = providerSecretService.getApiKey(providerId);
        if (!StringUtils.hasText(apiKey)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "模型厂商未配置 API Key，请先在厂商管理中配置");
        }

        String modelKey = StringUtils.hasText(chatRequest == null ? null : chatRequest.modelKey())
                ? chatRequest.modelKey().trim()
                : provider.getModel();
        if (!StringUtils.hasText(modelKey)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "未配置默认模型，请先设置 defaultModel");
        }

        Set<String> allowedModelKeys = resolveAllowedModelKeys(provider);
        if (!allowedModelKeys.isEmpty() && !allowedModelKeys.contains(modelKey)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "当前厂商账号不支持该模型: " + modelKey + "，请切换为已配置模型");
        }

        String providerType = normalizeProviderType(provider.getProviderType());
        if (!"openai-compatible".equals(providerType)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "仅支持兼容协议厂商类型，请改为 openai-compatible");
        }

        LlmModelCatalogEntity modelCatalog = modelCatalogService.findActive(providerType, modelKey);
        if (modelCatalog == null) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "模型不可用或未启用: " + providerType + " / " + modelKey);
        }

        List<ChatAttachment> attachments = normalizeAttachments(chatRequest == null ? null : chatRequest.attachments());
        if (!attachments.isEmpty() && !hasCapability(modelCatalog.getCapabilities(), "vision")) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "当前模型不支持视觉输入，请切换支持 vision 的模型");
        }

        if (!StringUtils.hasText(provider.getApiBaseUrl())) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "厂商未配置 apiBaseUrl");
        }

        return new ChatRoute(
                provider.getId(),
                provider.getProviderKey(),
                providerType,
                provider.getApiBaseUrl().trim(),
                modelKey,
                apiKey,
                parseCapabilities(modelCatalog.getCapabilities())
        );
    }

    public List<ChatAttachment> parseAttachments(Object raw) {
        if (raw == null) {
            return List.of();
        }
        List<ChatAttachment> result = new ArrayList<>();

        if (raw instanceof List<?> list) {
            for (Object item : list) {
                ChatAttachment attachment = parseSingleAttachment(item);
                if (attachment != null) {
                    result.add(attachment);
                }
            }
            return result;
        }

        ChatAttachment single = parseSingleAttachment(raw);
        if (single == null) {
            return List.of();
        }
        return List.of(single);
    }

    private ChatAttachment parseSingleAttachment(Object item) {
        if (item == null) {
            return null;
        }
        if (item instanceof String text) {
            String trimmed = text.trim();
            if (!StringUtils.hasText(trimmed)) {
                return null;
            }
            String type = isLikelyImageUrl(trimmed) ? "image" : "file";
            return new ChatAttachment(type, trimmed, null, null, null);
        }
        if (item instanceof Map<?, ?> map) {
            String type = readString(map, "type");
            String url = firstNonBlank(readString(map, "url"), readString(map, "imageUrl"), readString(map, "fileUrl"));
            String mimeType = firstNonBlank(readString(map, "mimeType"), readString(map, "contentType"));
            String name = firstNonBlank(readString(map, "name"), readString(map, "fileName"));
            String fileId = readString(map, "fileId");

            if (!StringUtils.hasText(url) && !StringUtils.hasText(fileId)) {
                return null;
            }
            String normalizedType = StringUtils.hasText(type)
                    ? type.trim().toLowerCase(Locale.ROOT)
                    : (isLikelyImageUrl(url) || (StringUtils.hasText(mimeType) && mimeType.toLowerCase(Locale.ROOT).startsWith("image/"))
                    ? "image"
                    : "file");
            return new ChatAttachment(normalizedType, url, mimeType, name, fileId);
        }
        return null;
    }

    private String appendNonImageAttachmentHints(String userPrompt, List<ChatAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return userPrompt;
        }
        List<String> hints = new ArrayList<>();
        for (ChatAttachment attachment : attachments) {
            if (attachment == null || isImageAttachment(attachment)) {
                continue;
            }
            String mark = firstNonBlank(attachment.name(), attachment.url(), attachment.fileId(), "附件");
            hints.add("- " + mark);
        }
        if (hints.isEmpty()) {
            return userPrompt;
        }
        return userPrompt + "\n\n以下非图片附件仅作上下文参考（模型不会直接读取二进制内容）：\n" + String.join("\n", hints);
    }

    private String findDefaultProviderId() {
        List<LlmProviderEntity> providers = providerMapper.selectList(new LambdaQueryWrapper<LlmProviderEntity>()
                .eq(LlmProviderEntity::getStatus, "active")
                .orderByDesc(LlmProviderEntity::getUpdatedAt)
                .orderByDesc(LlmProviderEntity::getCreatedAt));
        for (LlmProviderEntity provider : providers) {
            if (!"openai-compatible".equals(normalizeProviderType(provider.getProviderType()))) {
                continue;
            }
            String apiKey = providerSecretService.getApiKey(provider.getId());
            if (StringUtils.hasText(apiKey)) {
                return provider.getId();
            }
        }
        throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "数据库未配置可用模型厂商，请先在模型厂商管理中配置并启用 API Key");
    }

    private boolean hasCapability(String rawCapabilities, String capability) {
        if (!StringUtils.hasText(rawCapabilities) || !StringUtils.hasText(capability)) {
            return false;
        }
        String target = capability.trim().toLowerCase(Locale.ROOT);
        return parseCapabilities(rawCapabilities).stream()
                .map(item -> item == null ? "" : item.toLowerCase(Locale.ROOT))
                .anyMatch(target::equals);
    }

    private List<String> parseCapabilities(String rawCapabilities) {
        if (!StringUtils.hasText(rawCapabilities)) {
            return List.of();
        }
        String trimmed = rawCapabilities.trim();
        if (trimmed.startsWith("[")) {
            return JsonUtil.toStringList(trimmed);
        }
        return List.of(trimmed);
    }

    private List<ChatAttachment> normalizeAttachments(List<ChatAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return List.of();
        }
        List<ChatAttachment> result = new ArrayList<>();
        for (ChatAttachment attachment : attachments) {
            if (attachment == null) {
                continue;
            }
            if (!StringUtils.hasText(attachment.url()) && !StringUtils.hasText(attachment.fileId())) {
                continue;
            }
            result.add(attachment);
        }
        return result;
    }

    private String normalizeProviderType(String providerType) {
        String normalized = providerType == null ? "" : providerType.trim().toLowerCase(Locale.ROOT);
        if (!StringUtils.hasText(normalized)) {
            return "openai-compatible";
        }
        return switch (normalized) {
            case "openai-compatible", "openai", "qwen", "deepseek", "minimax", "zhipu", "baidu", "hunyuan", "xai", "mistral", "cohere", "meta",
                 "anthropic", "claude", "gemini", "google", "google-gemini" -> "openai-compatible";
            default -> normalized;
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

    private boolean isImageAttachment(ChatAttachment attachment) {
        if (attachment == null) {
            return false;
        }
        if (StringUtils.hasText(attachment.type())) {
            return attachment.type().toLowerCase(Locale.ROOT).contains("image");
        }
        if (StringUtils.hasText(attachment.mimeType())) {
            return attachment.mimeType().toLowerCase(Locale.ROOT).startsWith("image/");
        }
        return isLikelyImageUrl(attachment.url());
    }

    private boolean isLikelyImageUrl(String url) {
        if (!StringUtils.hasText(url)) {
            return false;
        }
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                || lower.endsWith(".webp") || lower.endsWith(".gif") || lower.endsWith(".bmp")
                || lower.startsWith("data:image/");
    }

    private String readString(Map<?, ?> source, String key) {
        Object value = source.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }

    public record ChatAttachment(String type,
                                 String url,
                                 String mimeType,
                                 String name,
                                 String fileId) {
    }

    public record ChatRequest(String providerId,
                              String modelKey,
                              List<ChatAttachment> attachments,
                              List<Map<String, Object>> tools,
                              Integer maxToolRounds,
                              Integer timeoutMs) {
    }

    public record ChatRoute(String providerId,
                            String providerKey,
                            String providerType,
                            String apiBaseUrl,
                            String modelKey,
                            String apiKey,
                            List<String> capabilities) {
    }
}
