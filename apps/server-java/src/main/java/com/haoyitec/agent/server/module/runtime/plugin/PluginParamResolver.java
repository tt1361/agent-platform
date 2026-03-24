package com.haoyitec.agent.server.module.runtime.plugin;

import com.haoyitec.agent.server.module.skill.ResourceSkillDefinition;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class PluginParamResolver {

    private static final Pattern TEMPLATE_PATTERN = Pattern.compile("\\$\\{\\s*([^}]+?)\\s*}");

    public ResolvedPluginCall resolve(ResourceSkillDefinition.PluginDefinition plugin,
                                      String rawInput,
                                      String matchedKeyword,
                                      Map<String, String> secretValues) {
        String inputRaw = rawInput == null ? "" : rawInput;
        String inputQuery = normalizeQuery(inputRaw, matchedKeyword);

        Map<String, Object> context = new LinkedHashMap<>();
        context.put("input.raw", inputRaw);
        context.put("input.query", inputQuery);
        context.put("input.rawEncoded", URLEncoder.encode(inputRaw, StandardCharsets.UTF_8));
        context.put("input.queryEncoded", URLEncoder.encode(inputQuery, StandardCharsets.UTF_8));
        context.put("input.keyword", matchedKeyword == null ? "" : matchedKeyword);
        if (secretValues != null) {
            secretValues.forEach((key, value) -> context.put("secret." + key, value));
        }

        ResourceSkillDefinition.PluginRequest request = plugin.request();
        Map<String, String> renderedHeaders = new LinkedHashMap<>();
        if (request.headers() != null) {
            request.headers().forEach((headerKey, headerValue) -> renderedHeaders.put(headerKey,
                    String.valueOf(renderTemplate(headerValue, context))));
        }

        Map<String, Object> renderedQuery = castObjectMap(renderTemplate(request.query(), context));
        Object renderedBody = renderTemplate(request.body(), context);
        String renderedUrl = request.url() == null ? "" : String.valueOf(renderTemplate(request.url(), context));

        Map<String, Object> resolvedInput = new LinkedHashMap<>();
        resolvedInput.put("raw", inputRaw);
        resolvedInput.put("query", inputQuery);
        resolvedInput.put("keyword", matchedKeyword == null ? "" : matchedKeyword);

        return new ResolvedPluginCall(
                request.method(),
                renderedUrl,
                renderedHeaders,
                renderedQuery,
                renderedBody,
                resolvedInput
        );
    }

    private String normalizeQuery(String rawInput, String matchedKeyword) {
        if (!StringUtils.hasText(rawInput)) {
            return "";
        }
        String query = rawInput;
        if (StringUtils.hasText(matchedKeyword)) {
            int index = rawInput.toLowerCase().indexOf(matchedKeyword.toLowerCase());
            if (index >= 0) {
                query = rawInput.substring(0, index) + rawInput.substring(index + matchedKeyword.length());
            }
        }
        query = query.replaceAll("^[\\s，,。.!！?？:：]+", "")
                .replaceAll("^(请|帮我|麻烦|帮忙)\\s*", "")
                .replaceAll("^(搜索|查询|查一下|查下|查找|查)\\s*", "")
                .replaceAll("(天气)?(怎么样|如何|咋样|什么样|怎样)$", "")
                .replaceAll("(如何|怎么样|咋样)$", "")
                .trim();
        if (!StringUtils.hasText(query)) {
            return rawInput.trim();
        }
        return query;
    }

    private Object renderTemplate(Object template, Map<String, Object> context) {
        if (template == null) {
            return null;
        }
        if (template instanceof String text) {
            return renderString(text, context);
        }
        if (template instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            map.forEach((key, value) -> result.put(String.valueOf(key), renderTemplate(value, context)));
            return result;
        }
        if (template instanceof List<?> list) {
            List<Object> result = new ArrayList<>();
            list.forEach(item -> result.add(renderTemplate(item, context)));
            return result;
        }
        return template;
    }

    private Object renderString(String text, Map<String, Object> context) {
        Matcher matcher = TEMPLATE_PATTERN.matcher(text);
        if (!matcher.find()) {
            return text;
        }
        matcher.reset();
        if (isSinglePlaceholder(text, matcher)) {
            String key = matcher.group(1).trim();
            return context.getOrDefault(key, "");
        }

        matcher.reset();
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            String key = matcher.group(1).trim();
            Object value = context.get(key);
            matcher.appendReplacement(buffer, Matcher.quoteReplacement(value == null ? "" : String.valueOf(value)));
        }
        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private boolean isSinglePlaceholder(String text, Matcher matcher) {
        if (!matcher.find()) {
            return false;
        }
        int start = matcher.start();
        int end = matcher.end();
        return start == 0 && end == text.length();
    }

    private Map<String, Object> castObjectMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, Object> result = new LinkedHashMap<>();
        map.forEach((key, item) -> result.put(String.valueOf(key), item));
        return result;
    }

    public record ResolvedPluginCall(
            String method,
            String url,
            Map<String, String> headers,
            Map<String, Object> query,
            Object body,
            Map<String, Object> resolvedInput
    ) {
    }
}
