package com.haoyitec.agent.server.infra.ai;

import com.alibaba.cloud.ai.dashscope.api.DashScopeApi;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatModel;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.haoyitec.agent.server.common.exception.BizException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.content.Media;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeType;
import org.springframework.util.MimeTypeUtils;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import reactor.core.publisher.Flux;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Slf4j
@Service
public class LlmChatModelFactoryService {

    private static final String COMPAT_COMPLETION_PATH = "/chat/completions";
    private static final String DASHSCOPE_NATIVE_COMPLETION_PATH = "/api/v1/services/aigc/text-generation/generation";
    private static final double DEFAULT_TEMPERATURE = 0.5D;

    private final ConcurrentMap<String, LlmChatInvoker> invokerCache = new ConcurrentHashMap<>();

    public String chat(AiChatService.ChatRoute route,
                       String systemPrompt,
                       String userPrompt,
                       List<AiChatService.ChatAttachment> attachments,
                       int timeoutMs) {
        LlmChatInvoker invoker = getOrCreateInvoker(route, timeoutMs);
        long startedAt = System.nanoTime();
        try {
            String content = invoker.chat(systemPrompt, userPrompt, attachments);
            long costMs = (System.nanoTime() - startedAt) / 1_000_000;
            log.info("模型调用成功 providerKey={}, modelKey={}, endpoint={}, costMs={}",
                    displayProviderKey(route), route.modelKey(), invoker.endpoint(), costMs);
            return content;
        } catch (BizException ex) {
            long costMs = (System.nanoTime() - startedAt) / 1_000_000;
            log.warn("模型调用失败 providerKey={}, modelKey={}, endpoint={}, failCode={}, costMs={}, message={}",
                    displayProviderKey(route), route.modelKey(), invoker.endpoint(), ex.getCode(), costMs, ex.getMessage());
            throw ex;
        } catch (Exception ex) {
            long costMs = (System.nanoTime() - startedAt) / 1_000_000;
            log.warn("模型调用失败 providerKey={}, modelKey={}, endpoint={}, failCode={}, costMs={}, message={}",
                    displayProviderKey(route), route.modelKey(), invoker.endpoint(), "AI_CALL_FAILED", costMs, ex.getMessage());
            throw new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED", "模型调用失败: " + ex.getMessage());
        }
    }

    public Flux<String> chatStream(AiChatService.ChatRoute route,
                                   String systemPrompt,
                                   String userPrompt,
                                   List<AiChatService.ChatAttachment> attachments,
                                   int timeoutMs) {
        LlmChatInvoker invoker = getOrCreateInvoker(route, timeoutMs);
        return invoker.chatStream(systemPrompt, userPrompt, attachments);
    }

    private LlmChatInvoker getOrCreateInvoker(AiChatService.ChatRoute route, int timeoutMs) {
        String cacheKey = buildCacheKey(route, timeoutMs);
        return invokerCache.computeIfAbsent(cacheKey, ignored -> createInvoker(route, timeoutMs));
    }

    private LlmChatInvoker createInvoker(AiChatService.ChatRoute route, int timeoutMs) {
        if (isTongyiNativeRoute(route)) {
            return new TongyiNativeInvoker(route, timeoutMs);
        }
        return new OpenAiCompatibleInvoker(route, timeoutMs);
    }

    private boolean isTongyiNativeRoute(AiChatService.ChatRoute route) {
        String baseUrl = route == null ? null : route.apiBaseUrl();
        if (!StringUtils.hasText(baseUrl)) {
            return false;
        }
        String normalized = baseUrl.trim().toLowerCase(Locale.ROOT);
        return normalized.contains("dashscope.aliyuncs.com")
                && !normalized.contains("compatible-mode")
                && !normalized.endsWith("/v1");
    }

    private String buildCacheKey(AiChatService.ChatRoute route, int timeoutMs) {
        String endpoint = normalizeApiBaseUrl(route.apiBaseUrl());
        String apiKeyHash = Integer.toHexString(route.apiKey().hashCode());
        return route.providerId() + "|" + route.modelKey() + "|" + endpoint + "|" + apiKeyHash + "|" + timeoutMs;
    }

    private String displayProviderKey(AiChatService.ChatRoute route) {
        if (route == null) {
            return "";
        }
        if (StringUtils.hasText(route.providerKey())) {
            return route.providerKey();
        }
        return route.providerId();
    }

    private String normalizeApiBaseUrl(String apiBaseUrl) {
        String normalized = trimTrailingSlash(apiBaseUrl);
        if (normalized.endsWith(COMPAT_COMPLETION_PATH)) {
            return normalized.substring(0, normalized.length() - COMPAT_COMPLETION_PATH.length());
        }
        return normalized;
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

    private interface LlmChatInvoker {
        String chat(String systemPrompt, String userPrompt, List<AiChatService.ChatAttachment> attachments);

        default Flux<String> chatStream(String systemPrompt, String userPrompt, List<AiChatService.ChatAttachment> attachments) {
            return Flux.fromIterable(splitToDeltas(chat(systemPrompt, userPrompt, attachments), 24));
        }

        String endpoint();
    }

    private static List<String> splitToDeltas(String content, int chunkSize) {
        if (!StringUtils.hasText(content)) {
            return List.of();
        }
        int safeChunkSize = Math.max(chunkSize, 1);
        List<String> chunks = new ArrayList<>();
        int start = 0;
        while (start < content.length()) {
            int end = Math.min(start + safeChunkSize, content.length());
            chunks.add(content.substring(start, end));
            start = end;
        }
        return chunks;
    }

    private final class OpenAiCompatibleInvoker implements LlmChatInvoker {

        private final RestClient restClient;
        private final String modelKey;
        private final String endpoint;

        private OpenAiCompatibleInvoker(AiChatService.ChatRoute route, int timeoutMs) {
            int requestTimeoutMs = Math.max(timeoutMs, 1000);
            SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
            requestFactory.setConnectTimeout(Math.min(requestTimeoutMs, 10000));
            requestFactory.setReadTimeout(requestTimeoutMs);

            String baseUrl = normalizeApiBaseUrl(route.apiBaseUrl());
            this.restClient = RestClient.builder()
                    .requestFactory(requestFactory)
                    .baseUrl(baseUrl)
                    .defaultHeader("Authorization", "Bearer " + route.apiKey())
                    .defaultHeader("Content-Type", "application/json")
                    .build();
            this.modelKey = route.modelKey();
            this.endpoint = baseUrl + COMPAT_COMPLETION_PATH;
        }

        @Override
        public String chat(String systemPrompt, String userPrompt, List<AiChatService.ChatAttachment> attachments) {
            Object userContent = buildOpenAiCompatibleUserContent(userPrompt, attachments);
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("model", modelKey);
            payload.put("temperature", DEFAULT_TEMPERATURE);
            payload.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userContent)
            ));

            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.post()
                    .uri(COMPAT_COMPLETION_PATH)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(Map.class);

            String content = extractTextFromOpenAiResponse(response);
            if (!StringUtils.hasText(content)) {
                throw new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED", "模型返回内容为空");
            }
            return content.trim();
        }

        @Override
        public String endpoint() {
            return endpoint;
        }
    }

    private final class TongyiNativeInvoker implements LlmChatInvoker {

        private final DashScopeChatModel chatModel;
        private final DashScopeChatOptions options;
        private final String endpoint;

        private TongyiNativeInvoker(AiChatService.ChatRoute route, int timeoutMs) {
            int requestTimeoutMs = Math.max(timeoutMs, 1000);
            SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
            requestFactory.setConnectTimeout(Math.min(requestTimeoutMs, 10000));
            requestFactory.setReadTimeout(requestTimeoutMs);

            RestClient.Builder restClientBuilder = RestClient.builder().requestFactory(requestFactory);
            String baseUrl = normalizeApiBaseUrl(route.apiBaseUrl());
            DashScopeApi dashScopeApi = DashScopeApi.builder()
                    .baseUrl(baseUrl)
                    .apiKey(route.apiKey())
                    .restClientBuilder(restClientBuilder)
                    .build();

            this.options = DashScopeChatOptions.builder()
                    .model(route.modelKey())
                    .temperature(DEFAULT_TEMPERATURE)
                    .build();
            this.chatModel = DashScopeChatModel.builder()
                    .dashScopeApi(dashScopeApi)
                    .defaultOptions(options)
                    .build();
            this.endpoint = baseUrl + DASHSCOPE_NATIVE_COMPLETION_PATH;
        }

        @Override
        public String chat(String systemPrompt, String userPrompt, List<AiChatService.ChatAttachment> attachments) {
            UserMessage userMessage;
            List<Media> mediaList = toMediaList(attachments);
            if (mediaList.isEmpty()) {
                userMessage = new UserMessage(userPrompt);
            } else {
                userMessage = UserMessage.builder()
                        .text(userPrompt)
                        .media(mediaList)
                        .build();
            }

            List<Message> messages = List.of(new SystemMessage(systemPrompt), userMessage);
            ChatResponse response = chatModel.call(new Prompt(messages, options));
            String content = response == null || response.getResult() == null || response.getResult().getOutput() == null
                    ? null
                    : response.getResult().getOutput().getText();
            if (!StringUtils.hasText(content)) {
                throw new BizException(HttpStatus.BAD_GATEWAY, "AI_CALL_FAILED", "模型返回内容为空");
            }
            return content.trim();
        }

        @Override
        public String endpoint() {
            return endpoint;
        }
    }

    private Object buildOpenAiCompatibleUserContent(String prompt, List<AiChatService.ChatAttachment> attachments) {
        List<String> imageUrls = new ArrayList<>();
        if (attachments != null) {
            for (AiChatService.ChatAttachment attachment : attachments) {
                if (attachment != null && isImageAttachment(attachment) && StringUtils.hasText(attachment.url())) {
                    imageUrls.add(attachment.url());
                }
            }
        }
        if (imageUrls.isEmpty()) {
            return prompt;
        }

        List<Map<String, Object>> content = new ArrayList<>();
        content.add(Map.of("type", "text", "text", prompt));
        for (String imageUrl : imageUrls) {
            content.add(Map.of(
                    "type", "image_url",
                    "image_url", Map.of("url", imageUrl)
            ));
        }
        return content;
    }

    private List<Media> toMediaList(List<AiChatService.ChatAttachment> attachments) {
        if (attachments == null || attachments.isEmpty()) {
            return List.of();
        }
        List<Media> mediaList = new ArrayList<>();
        for (AiChatService.ChatAttachment attachment : attachments) {
            if (!isImageAttachment(attachment) || !StringUtils.hasText(attachment.url())) {
                continue;
            }
            try {
                URI imageUri = URI.create(attachment.url());
                MimeType mimeType = resolveMimeType(attachment);
                mediaList.add(new Media(mimeType, imageUri));
            } catch (Exception ex) {
                log.warn("忽略非法图片地址: {}", attachment.url());
            }
        }
        return mediaList;
    }

    private MimeType resolveMimeType(AiChatService.ChatAttachment attachment) {
        String mimeTypeText = attachment == null ? null : attachment.mimeType();
        if (!StringUtils.hasText(mimeTypeText)) {
            return MimeTypeUtils.IMAGE_JPEG;
        }
        try {
            return MimeTypeUtils.parseMimeType(mimeTypeText);
        } catch (Exception ignore) {
            return MimeTypeUtils.IMAGE_JPEG;
        }
    }

    private boolean isImageAttachment(AiChatService.ChatAttachment attachment) {
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

    @SuppressWarnings("unchecked")
    private String extractTextFromOpenAiResponse(Map<String, Object> response) {
        if (response == null || response.isEmpty()) {
            return null;
        }
        Object choicesNode = response.get("choices");
        if (choicesNode instanceof List<?> choices && !choices.isEmpty()) {
            Object first = choices.get(0);
            if (first instanceof Map<?, ?> choiceMap) {
                Object messageNode = choiceMap.get("message");
                if (messageNode instanceof Map<?, ?> messageMap) {
                    return extractTextFromMessageContent(messageMap.get("content"));
                }
            }
        }
        Object outputNode = response.get("output");
        if (outputNode instanceof Map<?, ?> outputMap) {
            Object textNode = outputMap.get("text");
            if (textNode != null && StringUtils.hasText(String.valueOf(textNode))) {
                return String.valueOf(textNode).trim();
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private String extractTextFromMessageContent(Object contentNode) {
        if (contentNode == null) {
            return null;
        }
        if (contentNode instanceof String text) {
            return text.trim();
        }
        if (contentNode instanceof List<?> parts) {
            StringBuilder builder = new StringBuilder();
            for (Object part : parts) {
                if (!(part instanceof Map<?, ?> partMap)) {
                    continue;
                }
                Object textNode = partMap.get("text");
                if (textNode != null && StringUtils.hasText(String.valueOf(textNode))) {
                    if (!builder.isEmpty()) {
                        builder.append('\n');
                    }
                    builder.append(String.valueOf(textNode).trim());
                }
            }
            return builder.isEmpty() ? null : builder.toString();
        }
        return String.valueOf(contentNode).trim();
    }
}
