package com.haoyitec.agent.server.module.hitl;

import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class HitlService {

    private static final Set<String> TERMINAL_STATUSES = Set.of("approved", "rejected", "timeout", "overridden");

    private final Map<String, HumanTaskRecord> tasks = new HashMap<>();

    public List<HumanTaskRecord> list() {
        return tasks.values().stream()
                .sorted((a, b) -> b.updatedAt().compareTo(a.updatedAt()))
                .toList();
    }

    public HumanTaskRecord getById(String id) {
        HumanTaskRecord task = tasks.get(id);
        if (task == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Human task not found");
        }
        return task;
    }

    public HumanTaskRecord create(Map<String, Object> input) {
        String id = IdUtil.uuid();
        LocalDateTime now = LocalDateTime.now();
        HumanTaskRecord task = new HumanTaskRecord(
                id,
                asString(input.get("title")),
                asString(input.get("taskType")),
                asString(input.get("sourceType")),
                asString(input.get("sourceId")),
                asMap(input.get("payload")),
                asString(input.get("assigneeId")),
                "pending",
                now,
                now,
                null
        );
        tasks.put(id, task);
        return task;
    }

    public HumanTaskRecord updateStatus(String id, String status) {
        HumanTaskRecord current = getById(id);
        if (current.status().equals(status)) {
            return current;
        }
        if (TERMINAL_STATUSES.contains(current.status())) {
            throw new BizException(HttpStatus.BAD_REQUEST, "CONFLICT", "Human task is already in terminal status");
        }
        if (!TERMINAL_STATUSES.contains(status)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Human task can only transition to terminal statuses");
        }

        HumanTaskRecord updated = new HumanTaskRecord(
                current.id(),
                current.title(),
                current.taskType(),
                current.sourceType(),
                current.sourceId(),
                current.payload(),
                current.assigneeId(),
                status,
                current.createdAt(),
                LocalDateTime.now(),
                LocalDateTime.now()
        );
        tasks.put(id, updated);
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

    public record HumanTaskRecord(String id,
                                  String title,
                                  String taskType,
                                  String sourceType,
                                  String sourceId,
                                  Map<String, Object> payload,
                                  String assigneeId,
                                  String status,
                                  LocalDateTime createdAt,
                                  LocalDateTime updatedAt,
                                  LocalDateTime completedAt) {
    }
}
