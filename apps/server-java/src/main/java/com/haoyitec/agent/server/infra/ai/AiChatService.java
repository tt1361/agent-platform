package com.haoyitec.agent.server.infra.ai;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
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

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final ObjectMapper objectMapper = new ObjectMapper();

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

        try {
            return switch (route.providerType()) {
                case "openai-compatible" -> callOpenAiCompatible(route, systemPrompt, userPrompt, attachments, timeoutMs);
                case "anthropic" -> callAnthropic(route, systemPrompt, userPrompt, attachments, timeoutMs);
                case "google-gemini" -> callGoogleGemini(route, systemPrompt, userPrompt, attachments, timeoutMs);
                default -> throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                        "暂不支持的 providerType: " + route.providerType());
            };
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("AI 调用失败 providerId={}, modelKey={}, err={}", route.providerId(), route.modelKey(), ex.getMessage());
            throw new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED", "模型调用失败: " + ex.getMessage());
        }
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
        // 运行时再次校验模型白名单，防止前端绕过下拉直接传入不匹配的模型。
        Set<String> allowedModelKeys = resolveAllowedModelKeys(provider);
        if (!allowedModelKeys.isEmpty() && !allowedModelKeys.contains(modelKey)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "当前厂商账号不支持该模型: " + modelKey + "，请切换为已配置模型");
        }

        String providerType = normalizeProviderType(provider.getProviderType());
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

    private String callOpenAiCompatible(ChatRoute route,
                                        String systemPrompt,
                                        String userPrompt,
                                        List<ChatAttachment> attachments,
                                        int timeoutMs) throws Exception {
        String endpoint = toOpenAiCompatibleEndpoint(route.apiBaseUrl());

        List<Object> messages = new ArrayList<>();
        messages.add(Map.of(
                "role", "system",
                "content", StringUtils.hasText(systemPrompt) ? systemPrompt : "你是一个中文助手。"
        ));

        Object userContent = attachments.isEmpty()
                ? userPrompt
                : buildOpenAiUserContent(userPrompt, attachments);
        messages.add(Map.of("role", "user", "content", userContent));

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", route.modelKey());
        payload.put("messages", messages);
        payload.put("temperature", 0.5);

        JsonNode root = postJson(
                endpoint,
                payload,
                Map.of(
                        "Authorization", "Bearer " + route.apiKey(),
                        "Content-Type", "application/json"
                ),
                timeoutMs
        );

        JsonNode content = root.path("choices").path(0).path("message").path("content");
        String text = readModelContent(content);
        if (!StringUtils.hasText(text)) {
            throw new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED", "模型返回内容为空");
        }
        return text;
    }

    private String callAnthropic(ChatRoute route,
                                 String systemPrompt,
                                 String userPrompt,
                                 List<ChatAttachment> attachments,
                                 int timeoutMs) throws Exception {
        String endpoint = toAnthropicEndpoint(route.apiBaseUrl());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("model", route.modelKey());
        payload.put("max_tokens", 1024);
        if (StringUtils.hasText(systemPrompt)) {
            payload.put("system", systemPrompt);
        }
        payload.put("messages", List.of(Map.of(
                "role", "user",
                "content", buildAnthropicUserContent(userPrompt, attachments)
        )));

        JsonNode root = postJson(
                endpoint,
                payload,
                Map.of(
                        "x-api-key", route.apiKey(),
                        "anthropic-version", "2023-06-01",
                        "Content-Type", "application/json"
                ),
                timeoutMs
        );

        JsonNode content = root.path("content");
        String text = readAnthropicContent(content);
        if (!StringUtils.hasText(text)) {
            throw new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED", "Anthropic 返回内容为空");
        }
        return text;
    }

    private String callGoogleGemini(ChatRoute route,
                                    String systemPrompt,
                                    String userPrompt,
                                    List<ChatAttachment> attachments,
                                    int timeoutMs) throws Exception {
        String endpoint = toGeminiEndpoint(route.apiBaseUrl(), route.modelKey(), route.apiKey());

        List<Map<String, Object>> userParts = new ArrayList<>();
        userParts.add(Map.of("text", userPrompt));
        for (ChatAttachment attachment : attachments) {
            if (!isImageAttachment(attachment)) {
                continue;
            }
            if (StringUtils.hasText(attachment.url())) {
                userParts.add(Map.of(
                        "fileData", Map.of(
                                "mimeType", StringUtils.hasText(attachment.mimeType()) ? attachment.mimeType() : "image/jpeg",
                                "fileUri", attachment.url()
                        )
                ));
            }
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        if (StringUtils.hasText(systemPrompt)) {
            payload.put("systemInstruction", Map.of("parts", List.of(Map.of("text", systemPrompt))));
        }
        payload.put("contents", List.of(Map.of(
                "role", "user",
                "parts", userParts
        )));

        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Content-Type", "application/json");
        if (!isGoogleApiHost(route.apiBaseUrl())) {
            headers.put("Authorization", "Bearer " + route.apiKey());
        }

        JsonNode root = postJson(endpoint, payload, headers, timeoutMs);
        JsonNode parts = root.path("candidates").path(0).path("content").path("parts");
        String text = readGeminiContent(parts);
        if (!StringUtils.hasText(text)) {
            throw new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED", "Gemini 返回内容为空");
        }
        return text;
    }

    private JsonNode postJson(String endpoint,
                              Object payload,
                              Map<String, String> headers,
                              int timeoutMs) throws Exception {
        String body = objectMapper.writeValueAsString(payload);
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder()
                .uri(URI.create(endpoint))
                .timeout(Duration.ofMillis(Math.max(timeoutMs, 1000)))
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));

        headers.forEach(requestBuilder::header);

        HttpResponse<String> response = httpClient.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            log.warn("AI HTTP 请求失败 status={}, endpoint={}, body={}", response.statusCode(), endpoint, response.body());
            throw new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED",
                    "模型调用失败，HTTP " + response.statusCode() + "，响应：" + truncate(response.body(), 260));
        }
        return objectMapper.readTree(response.body());
    }

    private Object buildOpenAiUserContent(String userPrompt, List<ChatAttachment> attachments) {
        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", userPrompt));
        for (ChatAttachment attachment : attachments) {
            if (!isImageAttachment(attachment) || !StringUtils.hasText(attachment.url())) {
                continue;
            }
            content.add(Map.of(
                    "type", "image_url",
                    "image_url", Map.of("url", attachment.url())
            ));
        }
        return content;
    }

    private List<Map<String, Object>> buildAnthropicUserContent(String userPrompt, List<ChatAttachment> attachments) {
        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", userPrompt));
        for (ChatAttachment attachment : attachments) {
            if (!isImageAttachment(attachment) || !StringUtils.hasText(attachment.url())) {
                continue;
            }
            content.add(Map.of(
                    "type", "image",
                    "source", Map.of(
                            "type", "url",
                            "url", attachment.url(),
                            "media_type", StringUtils.hasText(attachment.mimeType()) ? attachment.mimeType() : "image/jpeg"
                    )
            ));
        }
        return content;
    }

    private String readModelContent(JsonNode contentNode) {
        if (contentNode == null || contentNode.isNull() || contentNode.isMissingNode()) {
            return "";
        }
        if (contentNode.isTextual()) {
            return contentNode.asText().trim();
        }
        if (contentNode.isArray()) {
            StringBuilder builder = new StringBuilder();
            for (JsonNode item : contentNode) {
                if (item.isTextual()) {
                    builder.append(item.asText());
                    continue;
                }
                String text = item.path("text").asText("");
                if (StringUtils.hasText(text)) {
                    builder.append(text);
                }
            }
            return builder.toString().trim();
        }
        return contentNode.toString();
    }

    private String readAnthropicContent(JsonNode contentNode) {
        if (contentNode == null || !contentNode.isArray()) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        for (JsonNode item : contentNode) {
            String text = item.path("text").asText("");
            if (StringUtils.hasText(text)) {
                builder.append(text).append("\n");
            }
        }
        return builder.toString().trim();
    }

    private String readGeminiContent(JsonNode partsNode) {
        if (partsNode == null || !partsNode.isArray()) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        for (JsonNode item : partsNode) {
            String text = item.path("text").asText("");
            if (StringUtils.hasText(text)) {
                builder.append(text).append("\n");
            }
        }
        return builder.toString().trim();
    }

    private String findDefaultProviderId() {
        List<LlmProviderEntity> providers = providerMapper.selectList(new LambdaQueryWrapper<LlmProviderEntity>()
                .eq(LlmProviderEntity::getStatus, "active")
                .orderByDesc(LlmProviderEntity::getUpdatedAt)
                .orderByDesc(LlmProviderEntity::getCreatedAt));
        for (LlmProviderEntity provider : providers) {
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
        if (!trimmed.startsWith("[")) {
            return List.of(trimmed);
        }
        try {
            JsonNode array = objectMapper.readTree(trimmed);
            if (!array.isArray()) {
                return List.of();
            }
            List<String> values = new ArrayList<>();
            array.forEach(item -> {
                String text = item.asText();
                if (StringUtils.hasText(text)) {
                    values.add(text.trim());
                }
            });
            return values;
        } catch (Exception ex) {
            return List.of();
        }
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

    private String normalizeProviderType(String providerType) {
        String normalized = providerType == null ? "" : providerType.trim().toLowerCase(Locale.ROOT);
        if (!StringUtils.hasText(normalized)) {
            return "openai-compatible";
        }
        return switch (normalized) {
            case "openai", "qwen", "deepseek", "minimax", "zhipu", "baidu", "hunyuan", "xai", "mistral", "cohere", "meta" -> "openai-compatible";
            case "claude" -> "anthropic";
            case "gemini", "google" -> "google-gemini";
            default -> normalized;
        };
    }

    private String toOpenAiCompatibleEndpoint(String apiBaseUrl) {
        String normalized = trimTrailingSlash(apiBaseUrl);
        if (normalized.endsWith("/chat/completions")) {
            return normalized;
        }
        return normalized + "/chat/completions";
    }

    private String toAnthropicEndpoint(String apiBaseUrl) {
        String normalized = trimTrailingSlash(apiBaseUrl);
        if (normalized.endsWith("/v1/messages")) {
            return normalized;
        }
        if (normalized.endsWith("/v1")) {
            return normalized + "/messages";
        }
        return normalized + "/v1/messages";
    }

    private String toGeminiEndpoint(String apiBaseUrl, String modelKey, String apiKey) {
        String normalized = trimTrailingSlash(apiBaseUrl);
        if (normalized.contains(":generateContent")) {
            return normalized;
        }

        String endpoint;
        if (normalized.endsWith("/models")) {
            endpoint = normalized + "/" + modelKey + ":generateContent";
        } else {
            endpoint = normalized + "/models/" + modelKey + ":generateContent";
        }

        if (isGoogleApiHost(normalized)) {
            String delimiter = endpoint.contains("?") ? "&" : "?";
            return endpoint + delimiter + "key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8);
        }
        return endpoint;
    }

    private boolean isGoogleApiHost(String apiBaseUrl) {
        return apiBaseUrl != null && apiBaseUrl.contains("generativelanguage.googleapis.com");
    }

    private String trimTrailingSlash(String value) {
        if (!StringUtils.hasText(value)) {
            return "";
        }
        String result = value.trim();
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }

    private boolean isImageAttachment(ChatAttachment attachment) {
        if (attachment == null) {
            return false;
        }
        if (StringUtils.hasText(attachment.type())) {
            String type = attachment.type().toLowerCase(Locale.ROOT);
            if (type.contains("image") || type.contains("vision") || type.contains("photo")) {
                return true;
            }
        }
        if (StringUtils.hasText(attachment.mimeType())
                && attachment.mimeType().toLowerCase(Locale.ROOT).startsWith("image/")) {
            return true;
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

    private String truncate(String value, int maxLength) {
        if (!StringUtils.hasText(value) || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
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
                            String providerType,
                            String apiBaseUrl,
                            String modelKey,
                            String apiKey,
                            List<String> capabilities) {
    }
}
