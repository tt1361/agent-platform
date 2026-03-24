package com.haoyitec.agent.server.module.skill;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Component
public class ResourceSkillLoader {

    private static final Pattern SKILL_PATH_PATTERN = Pattern.compile(".*[/!]skills/([^/!]+)/SKILL\\.md$");
    private static final Pattern FOLDER_VERSION_PATTERN = Pattern.compile("^(.+)-([0-9]+(?:\\.[0-9]+)*)$");
    private static final Pattern SECRET_PLACEHOLDER_PATTERN = Pattern.compile("\\$\\{\\s*secret\\.([\\w-]+)\\s*}");

    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public List<ResourceSkillDefinition> loadAll() {
        try {
            Resource[] markdownResources = resolver.getResources("classpath*:skills/*/SKILL.md");
            List<ResourceSkillDefinition> definitions = new ArrayList<>();
            for (Resource markdownResource : markdownResources) {
                definitions.add(loadSingle(markdownResource));
            }
            definitions.sort(Comparator.comparing(ResourceSkillDefinition::signature));
            return definitions;
        } catch (Exception e) {
            throw new IllegalStateException("扫描 resources/skills 目录失败: " + e.getMessage(), e);
        }
    }

    private ResourceSkillDefinition loadSingle(Resource markdownResource) throws Exception {
        String markdown = StreamUtils.copyToString(markdownResource.getInputStream(), StandardCharsets.UTF_8);
        String folderName = extractFolderName(markdownResource);
        Map<String, Object> meta = loadMeta(folderName);
        ParsedMarkdown parsed = parseMarkdown(markdown);
        String skillKey = resolveSkillKey(folderName, meta, parsed.frontmatter());
        String version = resolveVersion(folderName, meta, parsed.frontmatter());
        String name = value(parsed.frontmatter(), "name", skillKey);
        String description = value(parsed.frontmatter(), "description", "技能 " + skillKey);
        String status = value(parsed.frontmatter(), "status", "active");
        String executorKey = resolveExecutorKey(skillKey, parsed.frontmatter());
        List<String> whenToUse = resolveWhenToUse(parsed.frontmatter(), parsed.body());
        List<String> whenNotToUse = resolveWhenNotToUse(parsed.frontmatter(), parsed.body());
        List<String> tags = resolveTags(parsed.frontmatter());
        ResourceSkillDefinition.PluginDefinition plugin = resolvePlugin(meta);

        Map<String, Object> parametersSchema = resolveSchema(parsed.frontmatter().get("parametersSchema"), executorKey);
        Map<String, Object> returnsSchema = resolveReturnsSchema(parsed.frontmatter().get("returnsSchema"));

        Integer timeoutMs = asInteger(parsed.frontmatter().get("timeoutMs"));
        String sourcePath = "skills/" + folderName + "/SKILL.md";

        return new ResourceSkillDefinition(
                skillKey,
                name,
                version,
                description,
                status,
                executorKey,
                parametersSchema,
                returnsSchema,
                tags,
                timeoutMs,
                sourcePath,
                whenToUse,
                whenNotToUse,
                plugin
        );
    }

    private String extractFolderName(Resource markdownResource) throws Exception {
        String url = markdownResource.getURL().toString();
        Matcher matcher = SKILL_PATH_PATTERN.matcher(url);
        if (matcher.matches()) {
            return matcher.group(1);
        }
        throw new IllegalStateException("无法解析技能目录名: " + url);
    }

    private Map<String, Object> loadMeta(String folderName) {
        try {
            Resource metaResource = resolver.getResource("classpath:skills/" + folderName + "/_meta.json");
            if (!metaResource.exists()) {
                return Map.of();
            }
            String json = StreamUtils.copyToString(metaResource.getInputStream(), StandardCharsets.UTF_8);
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            throw new IllegalStateException("解析 _meta.json 失败: skills/" + folderName + "/_meta.json, " + e.getMessage(), e);
        }
    }

    private String resolveSkillKey(String folderName, Map<String, Object> meta, Map<String, Object> frontmatter) {
        if (meta.get("slug") != null && StringUtils.hasText(String.valueOf(meta.get("slug")))) {
            return String.valueOf(meta.get("slug"));
        }
        if (frontmatter.get("skillKey") != null && StringUtils.hasText(String.valueOf(frontmatter.get("skillKey")))) {
            return String.valueOf(frontmatter.get("skillKey"));
        }
        Matcher matcher = FOLDER_VERSION_PATTERN.matcher(folderName);
        if (matcher.matches()) {
            return matcher.group(1);
        }
        return folderName;
    }

    private String resolveVersion(String folderName, Map<String, Object> meta, Map<String, Object> frontmatter) {
        if (meta.get("version") != null && StringUtils.hasText(String.valueOf(meta.get("version")))) {
            return String.valueOf(meta.get("version"));
        }
        if (frontmatter.get("version") != null && StringUtils.hasText(String.valueOf(frontmatter.get("version")))) {
            return String.valueOf(frontmatter.get("version"));
        }
        Matcher matcher = FOLDER_VERSION_PATTERN.matcher(folderName);
        if (matcher.matches()) {
            return matcher.group(2);
        }
        return "1.0.0";
    }

    private String resolveExecutorKey(String skillKey, Map<String, Object> frontmatter) {
        String executor = value(frontmatter, "executorKey", "");
        if (StringUtils.hasText(executor)) {
            return executor;
        }
        return skillKey.replace("-", "_");
    }

    private ResourceSkillDefinition.PluginDefinition resolvePlugin(Map<String, Object> meta) {
        Map<String, Object> pluginMap = asObjectMap(meta.get("plugin"));
        if (pluginMap.isEmpty()) {
            return null;
        }
        String type = value(pluginMap, "type", "");
        if (!StringUtils.hasText(type)) {
            return null;
        }

        List<String> triggerKeywords = asStringList(pluginMap.get("triggerKeywords"));
        Map<String, Object> requestMap = asObjectMap(pluginMap.get("request"));
        String method = value(requestMap, "method", "GET").toUpperCase();
        String url = value(requestMap, "url", "");
        Map<String, String> headers = asStringMap(requestMap.get("headers"));
        Map<String, Object> query = asObjectMap(requestMap.get("query"));
        Object body = requestMap.get("body");

        Map<String, Object> responseMap = asObjectMap(pluginMap.get("response"));
        String listPath = value(responseMap, "listPath", "items");
        String titleField = value(responseMap, "titleField", "title");
        String snippetField = value(responseMap, "snippetField", "snippet");
        String urlField = value(responseMap, "urlField", "url");

        Map<String, Object> outputMap = asObjectMap(pluginMap.get("output"));
        Integer topK = asInteger(outputMap.get("topK"));

        List<String> secretKeys = resolveSecretKeys(pluginMap, url, headers, query, body);

        return new ResourceSkillDefinition.PluginDefinition(
                type,
                triggerKeywords,
                secretKeys,
                new ResourceSkillDefinition.PluginRequest(method, url, headers, query, body),
                new ResourceSkillDefinition.PluginResponse(listPath, titleField, snippetField, urlField),
                new ResourceSkillDefinition.PluginOutput(topK == null || topK <= 0 ? 5 : topK)
        );
    }

    private List<String> resolveSecretKeys(Map<String, Object> pluginMap,
                                           String url,
                                           Map<String, String> headers,
                                           Map<String, Object> query,
                                           Object body) {
        List<String> configured = asStringList(pluginMap.get("secretKeys"));
        if (!configured.isEmpty()) {
            return configured;
        }
        Set<String> discovered = new LinkedHashSet<>();
        collectSecretKeys(url, discovered);
        headers.values().forEach(value -> collectSecretKeys(value, discovered));
        query.values().forEach(value -> collectSecretKeys(value, discovered));
        collectSecretKeys(body, discovered);
        return List.copyOf(discovered);
    }

    private void collectSecretKeys(Object value, Set<String> collector) {
        if (value == null) {
            return;
        }
        if (value instanceof String text) {
            Matcher matcher = SECRET_PLACEHOLDER_PATTERN.matcher(text);
            while (matcher.find()) {
                collector.add(matcher.group(1));
            }
            return;
        }
        if (value instanceof Map<?, ?> map) {
            map.values().forEach(item -> collectSecretKeys(item, collector));
            return;
        }
        if (value instanceof List<?> list) {
            list.forEach(item -> collectSecretKeys(item, collector));
        }
    }

    private List<String> resolveWhenToUse(Map<String, Object> frontmatter, String body) {
        List<String> fromFrontmatter = asStringList(frontmatter.get("whenToUse"));
        if (!fromFrontmatter.isEmpty()) {
            return fromFrontmatter;
        }
        return extractSceneBullets(body, true);
    }

    private List<String> resolveWhenNotToUse(Map<String, Object> frontmatter, String body) {
        List<String> fromFrontmatter = asStringList(frontmatter.get("whenNotToUse"));
        if (!fromFrontmatter.isEmpty()) {
            return fromFrontmatter;
        }
        return extractSceneBullets(body, false);
    }

    private List<String> extractSceneBullets(String body, boolean useMode) {
        List<String> items = new ArrayList<>();
        if (!StringUtils.hasText(body)) {
            return items;
        }

        String mode = "none";
        for (String rawLine : body.split("\n")) {
            String line = rawLine.trim();
            if (line.contains("✅") && line.contains("适用")) {
                mode = "use";
                continue;
            }
            if (line.contains("❌") && line.contains("不适用")) {
                mode = "not";
                continue;
            }
            if (line.startsWith("## ") || line.startsWith("### ")) {
                mode = "none";
            }
            if ("use".equals(mode) && useMode && line.startsWith("-")) {
                String item = normalizeBullet(line.substring(1).trim());
                if (StringUtils.hasText(item)) {
                    items.add(item);
                }
            }
            if ("not".equals(mode) && !useMode && line.startsWith("-")) {
                String item = normalizeBullet(line.substring(1).trim());
                if (StringUtils.hasText(item)) {
                    items.add(item);
                }
            }
        }
        return items;
    }

    private String normalizeBullet(String value) {
        String normalized = value;
        if (normalized.startsWith("\"") && normalized.endsWith("\"") && normalized.length() > 1) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        return normalized.replace("`", "").trim();
    }

    private List<String> resolveTags(Map<String, Object> frontmatter) {
        List<String> tags = asStringList(frontmatter.get("tags"));
        if (!tags.isEmpty()) {
            return tags;
        }
        return List.of("resource-md");
    }

    private Map<String, Object> resolveSchema(Object rawValue, String executorKey) {
        Map<String, Object> parsed = asObjectMap(rawValue);
        if (!parsed.isEmpty()) {
            return parsed;
        }
        return Map.of("type", "object");
    }

    private Map<String, Object> resolveReturnsSchema(Object rawValue) {
        Map<String, Object> parsed = asObjectMap(rawValue);
        if (!parsed.isEmpty()) {
            return parsed;
        }
        return Map.of("type", "object");
    }

    private Map<String, Object> asObjectMap(Object rawValue) {
        if (rawValue instanceof Map<?, ?> map) {
            Map<String, Object> result = new LinkedHashMap<>();
            map.forEach((key, value) -> result.put(String.valueOf(key), value));
            return result;
        }
        if (rawValue instanceof String text && StringUtils.hasText(text) && text.trim().startsWith("{")) {
            try {
                return objectMapper.readValue(text, new TypeReference<>() {
                });
            } catch (Exception ignore) {
                return Map.of();
            }
        }
        return Map.of();
    }

    private Map<String, String> asStringMap(Object rawValue) {
        if (!(rawValue instanceof Map<?, ?> map)) {
            return Map.of();
        }
        Map<String, String> result = new LinkedHashMap<>();
        map.forEach((key, value) -> {
            if (key != null && value != null) {
                result.put(String.valueOf(key), String.valueOf(value));
            }
        });
        return result;
    }

    private List<String> asStringList(Object value) {
        if (value instanceof List<?> list) {
            List<String> result = new ArrayList<>();
            for (Object item : list) {
                if (item != null && StringUtils.hasText(String.valueOf(item))) {
                    result.add(String.valueOf(item));
                }
            }
            return result;
        }
        if (value instanceof String text && StringUtils.hasText(text)) {
            String trimmed = text.trim();
            if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                try {
                    return objectMapper.readValue(trimmed, new TypeReference<>() {
                    });
                } catch (Exception ignore) {
                    // fallback split by comma
                }
            }
            if (trimmed.contains(",")) {
                List<String> result = new ArrayList<>();
                for (String item : trimmed.split(",")) {
                    if (StringUtils.hasText(item)) {
                        result.add(item.trim());
                    }
                }
                return result;
            }
            return List.of(trimmed);
        }
        return List.of();
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

    private ParsedMarkdown parseMarkdown(String markdown) {
        if (!StringUtils.hasText(markdown)) {
            return new ParsedMarkdown(Map.of(), "");
        }
        String normalized = markdown.replace("\r\n", "\n");
        if (!normalized.startsWith("---\n")) {
            return new ParsedMarkdown(Map.of(), normalized);
        }
        int endIndex = normalized.indexOf("\n---\n", 4);
        if (endIndex < 0) {
            return new ParsedMarkdown(Map.of(), normalized);
        }
        String frontmatterText = normalized.substring(4, endIndex);
        String body = normalized.substring(endIndex + 5);
        Map<String, Object> frontmatter = parseFrontmatter(frontmatterText);
        return new ParsedMarkdown(frontmatter, body);
    }

    private Map<String, Object> parseFrontmatter(String frontmatterText) {
        Map<String, Object> data = new LinkedHashMap<>();
        String currentListKey = null;
        List<String> currentList = null;

        for (String rawLine : frontmatterText.split("\n")) {
            String line = rawLine.trim();
            if (!StringUtils.hasText(line)) {
                continue;
            }
            if (line.startsWith("#")) {
                continue;
            }
            if (currentListKey != null && line.startsWith("- ")) {
                String item = normalizeBullet(line.substring(2).trim());
                if (StringUtils.hasText(item)) {
                    currentList.add(item);
                }
                continue;
            }
            int separator = line.indexOf(':');
            if (separator < 0) {
                continue;
            }
            String key = line.substring(0, separator).trim();
            String rawValue = line.substring(separator + 1).trim();
            if (!StringUtils.hasText(key)) {
                continue;
            }
            if (!StringUtils.hasText(rawValue)) {
                currentListKey = key;
                currentList = new ArrayList<>();
                data.put(key, currentList);
                continue;
            }
            currentListKey = null;
            currentList = null;
            if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
                data.put(key, asStringList(rawValue));
            } else {
                data.put(key, stripQuotes(rawValue));
            }
        }
        return data;
    }

    private String stripQuotes(String value) {
        String result = value.trim();
        if ((result.startsWith("\"") && result.endsWith("\"")) || (result.startsWith("'") && result.endsWith("'"))) {
            if (result.length() >= 2) {
                result = result.substring(1, result.length() - 1);
            }
        }
        return result.trim();
    }

    private String value(Map<String, Object> map, String key, String defaultValue) {
        Object value = map.get(key);
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return defaultValue;
        }
        return String.valueOf(value);
    }

    private record ParsedMarkdown(Map<String, Object> frontmatter, String body) {
    }
}
