package com.haoyitec.agent.server.infra.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class AiChatService {

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${spring.ai.dashscope.api-key:}")
    private String dashscopeApiKey;

    @Value("${spring.ai.dashscope.chat.options.model:qwen-max}")
    private String chatModel;

    @Value("${spring.ai.dashscope.chat.url:https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions}")
    private String chatUrl;

    @Value("${app.ai.fallback-enabled:false}")
    private boolean fallbackEnabled;

    public String chat(String systemPrompt, String userPrompt) {
        if (fallbackEnabled) {
            return fallback(systemPrompt, userPrompt);
        }
        if (!StringUtils.hasText(dashscopeApiKey)) {
            throw new IllegalStateException("未配置 AI_DASHSCOPE_API_KEY，无法调用大模型");
        }

        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("model", chatModel);
            payload.put("messages", List.of(
                    Map.of("role", "system", "content", systemPrompt == null ? "你是一个中文助手。" : systemPrompt),
                    Map.of("role", "user", "content", userPrompt)
            ));
            payload.put("temperature", 0.5);

            String requestBody = objectMapper.writeValueAsString(payload);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(chatUrl))
                    .header("Authorization", "Bearer " + dashscopeApiKey)
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(45))
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("DashScope call failed with status={}, body={}", response.statusCode(), response.body());
                throw new IllegalStateException("DashScope 调用失败，HTTP " + response.statusCode());
            }

            JsonNode root = objectMapper.readTree(response.body());
            JsonNode content = root.path("choices").path(0).path("message").path("content");
            if (content.isMissingNode() || content.isNull() || content.asText().isBlank()) {
                throw new IllegalStateException("DashScope 返回内容为空");
            }
            return content.asText();
        } catch (Exception ex) {
            log.warn("DashScope call exception: {}", ex.getMessage());
            throw new IllegalStateException("调用 DashScope 异常: " + ex.getMessage(), ex);
        }
    }

    public String getConfiguredModel() {
        return chatModel;
    }

    public String getConfiguredChatUrl() {
        return chatUrl;
    }

    private String fallback(String systemPrompt, String userPrompt) {
        return "【模拟回复】" +
                "\n系统提示: " + (systemPrompt == null ? "(空)" : systemPrompt.substring(0, Math.min(systemPrompt.length(), 120))) +
                "\n用户输入: " + (userPrompt == null ? "(空)" : userPrompt) +
                "\n当前环境启用了 app.ai.fallback-enabled=true，已返回本地兜底结果。";
    }
}
