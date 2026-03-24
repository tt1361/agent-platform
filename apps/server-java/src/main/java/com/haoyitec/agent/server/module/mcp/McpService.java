package com.haoyitec.agent.server.module.mcp;

import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class McpService {

    private final Map<String, McpServerRecord> servers = new HashMap<>();

    public McpService() {
        String id = IdUtil.uuid();
        servers.put(id, new McpServerRecord(
                id,
                "Demo MCP Server",
                "demo-mcp",
                "http",
                "http://127.0.0.1:8800/mcp",
                "none",
                "inactive",
                Map.of("source", "bootstrap"),
                List.of(),
                LocalDateTime.now(),
                LocalDateTime.now()
        ));
    }

    public List<McpServerRecord> listServers() {
        return servers.values().stream()
                .sorted(Comparator.comparing(McpServerRecord::updatedAt).reversed())
                .toList();
    }

    public McpServerRecord getServer(String id) {
        McpServerRecord record = servers.get(id);
        if (record == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "MCP server not found");
        }
        return record;
    }

    public McpServerRecord registerServer(Map<String, Object> input) {
        String id = IdUtil.uuid();
        McpServerRecord record = new McpServerRecord(
                id,
                asString(input.get("name")),
                asString(input.get("code")),
                asString(input.get("transportType")),
                asString(input.get("endpoint")),
                asString(input.get("authType")),
                "inactive",
                asMap(input.get("metadata")),
                List.of(),
                LocalDateTime.now(),
                LocalDateTime.now()
        );
        servers.put(id, record);
        return record;
    }

    public McpServerRecord removeServer(String id) {
        McpServerRecord existing = getServer(id);
        servers.remove(id);
        return existing;
    }

    public McpServerRecord discoverCapabilities(String id) {
        McpServerRecord existing = getServer(id);
        List<McpCapability> capabilities = new ArrayList<>();
        capabilities.add(new McpCapability(id + "-tool-1", "tool", "demo.search", "Demo discovered MCP tool",
                Map.of("type", "object", "properties", Map.of("query", Map.of("type", "string")), "required", List.of("query"))));
        capabilities.add(new McpCapability(id + "-resource-1", "resource", "demo://handbook", "Demo MCP resource", null));

        McpServerRecord updated = new McpServerRecord(
                existing.id(),
                existing.name(),
                existing.code(),
                existing.transportType(),
                existing.endpoint(),
                existing.authType(),
                "active",
                existing.metadata(),
                capabilities,
                existing.createdAt(),
                LocalDateTime.now()
        );
        servers.put(id, updated);
        return updated;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return Map.of();
    }

    private String asString(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    public record McpCapability(String id, String type, String name, String description, Map<String, Object> schema) {
    }

    public record McpServerRecord(String id,
                                  String name,
                                  String code,
                                  String transportType,
                                  String endpoint,
                                  String authType,
                                  String status,
                                  Map<String, Object> metadata,
                                  List<McpCapability> capabilities,
                                  LocalDateTime createdAt,
                                  LocalDateTime updatedAt) {
    }
}
