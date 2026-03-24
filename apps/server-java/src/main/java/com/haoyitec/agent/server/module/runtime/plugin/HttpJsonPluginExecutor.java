package com.haoyitec.agent.server.module.runtime.plugin;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.haoyitec.agent.server.module.skill.ResourceSkillDefinition;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
public class HttpJsonPluginExecutor {

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PluginExecutionResult execute(ResourceSkillDefinition.PluginDefinition plugin,
                                         PluginParamResolver.ResolvedPluginCall call,
                                         Integer timeoutMs) {
        int requestTimeoutMs = timeoutMs == null || timeoutMs <= 0 ? 12000 : Math.min(timeoutMs, 30000);
        try {
            HttpRequest request = buildRequest(call, requestTimeoutMs);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                return PluginExecutionResult.failed("HTTP " + response.statusCode() + " 调用失败");
            }
            String bodyText = response.body() == null ? "" : response.body().trim();
            if (!StringUtils.hasText(bodyText)) {
                return PluginExecutionResult.failed("插件返回为空");
            }

            Object payload = parseBody(bodyText);
            List<Map<String, String>> items = extractItems(payload, plugin);
            int topK = plugin.output() == null || plugin.output().topK() == null
                    ? 5
                    : Math.max(plugin.output().topK(), 1);
            if (items.size() > topK) {
                items = items.subList(0, topK);
            }
            String summary = buildSummary(items, payload);

            Map<String, Object> output = new LinkedHashMap<>();
            output.put("items", items);
            output.put("summary", summary);
            output.put("httpStatus", response.statusCode());
            return PluginExecutionResult.success(output, summary);
        } catch (Exception ex) {
            String message = ex.getMessage() == null ? "插件调用失败" : ex.getMessage();
            return PluginExecutionResult.failed(message);
        }
    }

    private HttpRequest buildRequest(PluginParamResolver.ResolvedPluginCall call, int timeoutMs) throws Exception {
        String method = StringUtils.hasText(call.method()) ? call.method().toUpperCase(Locale.ROOT) : "GET";
        String url = appendQuery(call.url(), call.query());
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofMillis(timeoutMs))
                .header("User-Agent", "haoyitec-agent-server/plugin-http-json");

        if (call.headers() != null) {
            call.headers().forEach((key, value) -> {
                if (StringUtils.hasText(key) && StringUtils.hasText(value)) {
                    builder.header(key, value);
                }
            });
        }

        if ("POST".equals(method)) {
            String bodyJson;
            if (call.body() == null) {
                bodyJson = "{}";
            } else if (call.body() instanceof String bodyText) {
                bodyJson = bodyText;
            } else {
                bodyJson = objectMapper.writeValueAsString(call.body());
            }
            if (call.headers() == null || !hasContentType(call.headers())) {
                builder.header("Content-Type", "application/json");
            }
            builder.POST(HttpRequest.BodyPublishers.ofString(bodyJson, StandardCharsets.UTF_8));
        } else {
            builder.GET();
        }
        return builder.build();
    }

    private boolean hasContentType(Map<String, String> headers) {
        for (String key : headers.keySet()) {
            if ("content-type".equalsIgnoreCase(key)) {
                return true;
            }
        }
        return false;
    }

    private String appendQuery(String baseUrl, Map<String, Object> query) {
        if (!StringUtils.hasText(baseUrl) || query == null || query.isEmpty()) {
            return baseUrl;
        }
        List<String> pairs = new ArrayList<>();
        for (Map.Entry<String, Object> entry : query.entrySet()) {
            if (!StringUtils.hasText(entry.getKey()) || entry.getValue() == null) {
                continue;
            }
            pairs.add(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8)
                    + "="
                    + URLEncoder.encode(String.valueOf(entry.getValue()), StandardCharsets.UTF_8));
        }
        if (pairs.isEmpty()) {
            return baseUrl;
        }
        StringBuilder builder = new StringBuilder(baseUrl);
        builder.append(baseUrl.contains("?") ? "&" : "?");
        for (int i = 0; i < pairs.size(); i++) {
            if (i > 0) {
                builder.append("&");
            }
            builder.append(pairs.get(i));
        }
        return builder.toString();
    }

    private Object parseBody(String bodyText) {
        try {
            return objectMapper.readValue(bodyText, new TypeReference<>() {
            });
        } catch (Exception ex) {
            return bodyText;
        }
    }

    private List<Map<String, String>> extractItems(Object payload, ResourceSkillDefinition.PluginDefinition plugin) {
        ResourceSkillDefinition.PluginResponse response = plugin.response();
        String listPath = response == null ? "items" : response.listPath();
        String titleField = response == null ? "title" : response.titleField();
        String snippetField = response == null ? "snippet" : response.snippetField();
        String urlField = response == null ? "url" : response.urlField();

        Object listNode = readPath(payload, listPath);
        if (!(listNode instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, String>> items = new ArrayList<>();
        for (Object item : list) {
            String title = toStringValue(readPath(item, titleField));
            String snippet = toStringValue(readPath(item, snippetField));
            String url = toStringValue(readPath(item, urlField));
            if (!StringUtils.hasText(title) && !StringUtils.hasText(snippet) && !StringUtils.hasText(url)) {
                continue;
            }
            Map<String, String> mappedItem = new LinkedHashMap<>();
            mappedItem.put("title", StringUtils.hasText(title) ? title : "-");
            mappedItem.put("snippet", snippet);
            mappedItem.put("url", url);
            items.add(mappedItem);
        }
        return items;
    }

    private Object readPath(Object source, String path) {
        if (source == null || !StringUtils.hasText(path)) {
            return source;
        }
        Object current = source;
        String[] parts = path.split("\\.");
        for (String part : parts) {
            if (current == null) {
                return null;
            }
            if (part.isBlank()) {
                continue;
            }
            if (current instanceof Map<?, ?> map) {
                current = map.get(part);
            } else if (current instanceof List<?> list) {
                Integer index = parseIndex(part);
                if (index == null || index < 0 || index >= list.size()) {
                    return null;
                }
                current = list.get(index);
            } else {
                return null;
            }
        }
        return current;
    }

    private Integer parseIndex(String token) {
        try {
            return Integer.parseInt(token);
        } catch (Exception ignore) {
            return null;
        }
    }

    private String toStringValue(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof String text) {
            return text.trim();
        }
        return String.valueOf(value);
    }

    private String buildSummary(List<Map<String, String>> items, Object payload) {
        if (items.isEmpty()) {
            if (payload instanceof String text) {
                return text.length() > 300 ? text.substring(0, 300) + "..." : text;
            }
            String fallback = String.valueOf(payload);
            return fallback.length() > 300 ? fallback.substring(0, 300) + "..." : fallback;
        }
        StringBuilder builder = new StringBuilder();
        int index = 1;
        for (Map<String, String> item : items) {
            builder.append(index++).append(". ").append(item.getOrDefault("title", "-"));
            if (StringUtils.hasText(item.get("snippet"))) {
                builder.append(" - ").append(item.get("snippet"));
            }
            if (StringUtils.hasText(item.get("url"))) {
                builder.append(" (").append(item.get("url")).append(")");
            }
            builder.append("\n");
        }
        return builder.toString().trim();
    }

    public record PluginExecutionResult(
            boolean success,
            Map<String, Object> output,
            String summary,
            String error
    ) {
        static PluginExecutionResult success(Map<String, Object> output, String summary) {
            return new PluginExecutionResult(true, output, summary, null);
        }

        static PluginExecutionResult failed(String error) {
            Map<String, Object> output = new LinkedHashMap<>();
            output.put("error", error);
            return new PluginExecutionResult(false, output, null, error);
        }
    }
}
