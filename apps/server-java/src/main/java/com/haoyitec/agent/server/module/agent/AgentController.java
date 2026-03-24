package com.haoyitec.agent.server.module.agent;

import com.haoyitec.agent.server.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/agents")
public class AgentController {

    private final AgentService agentService;

    @GetMapping
    public Object list() {
        return agentService.list();
    }

    @GetMapping("/{id}")
    public Object getById(@PathVariable String id) {
        return agentService.getById(id);
    }

    @PostMapping
    public Object create(@RequestBody Map<String, Object> body) {
        return agentService.create(body);
    }

    @PutMapping("/{id}")
    public Object update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return agentService.update(id, body);
    }

    @PutMapping("/{id}/status")
    public Object updateStatus(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return agentService.updateStatus(id, body.get("status") == null ? null : String.valueOf(body.get("status")));
    }

    @PatchMapping("/{id}/status")
    public Object patchStatus(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return updateStatus(id, body);
    }

    @DeleteMapping("/{id}")
    public Object remove(@PathVariable String id) {
        return agentService.remove(id);
    }

    @GetMapping("/{id}/executions")
    public Object listExecutions(@PathVariable String id) {
        return agentService.listExecutions(id);
    }

    @GetMapping("/{id}/conversations")
    public Object listConversations(@PathVariable String id) {
        return agentService.listConversations(id);
    }

    @GetMapping("/{id}/memories")
    public Object listMemories(@PathVariable String id) {
        return agentService.listMemories(id);
    }

    @PatchMapping("/{id}/memories/{memoryId}")
    public Object updateMemoryImportance(@PathVariable String id,
                                         @PathVariable String memoryId,
                                         @RequestBody Map<String, Object> body) {
        Integer importance = body.get("importance") == null ? null : Integer.parseInt(String.valueOf(body.get("importance")));
        return agentService.updateMemoryImportance(id, memoryId, importance);
    }

    @DeleteMapping("/{id}/memories/{memoryId}")
    public Object deleteMemory(@PathVariable String id, @PathVariable String memoryId) {
        return agentService.deleteMemory(id, memoryId);
    }

    @PostMapping("/{id}/run")
    public Object run(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String input = body.get("input") == null ? null : String.valueOf(body.get("input"));
        if (input == null || input.isBlank()) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "input 必填");
        }
        Integer timeoutMs = body.get("timeoutMs") == null ? null : Integer.parseInt(String.valueOf(body.get("timeoutMs")));
        String conversationId = body.get("conversationId") == null ? null : String.valueOf(body.get("conversationId"));
        String conversationTitle = body.get("conversationTitle") == null ? null : String.valueOf(body.get("conversationTitle"));
        String providerId = body.get("providerId") == null ? null : String.valueOf(body.get("providerId"));
        String modelKey = body.get("modelKey") == null ? null : String.valueOf(body.get("modelKey"));
        Object attachments = body.get("attachments");
        return agentService.run(id, input, timeoutMs, conversationId, conversationTitle, providerId, modelKey, attachments, null);
    }

    @PostMapping("/{id}/run/stream")
    public SseEmitter runStream(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String input = body.get("input") == null ? null : String.valueOf(body.get("input"));
        if (input == null || input.isBlank()) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "input 必填");
        }
        Integer timeoutMs = body.get("timeoutMs") == null ? null : Integer.parseInt(String.valueOf(body.get("timeoutMs")));
        String conversationId = body.get("conversationId") == null ? null : String.valueOf(body.get("conversationId"));
        String conversationTitle = body.get("conversationTitle") == null ? null : String.valueOf(body.get("conversationTitle"));
        String providerId = body.get("providerId") == null ? null : String.valueOf(body.get("providerId"));
        String modelKey = body.get("modelKey") == null ? null : String.valueOf(body.get("modelKey"));
        Object attachments = body.get("attachments");

        SseEmitter emitter = new SseEmitter(0L);
        CompletableFuture.runAsync(() -> {
            try {
                agentService.run(id, input, timeoutMs, conversationId, conversationTitle,
                        providerId, modelKey, attachments, event -> pushEvent(emitter, event));
            } catch (Exception ex) {
                log.error("agent run stream failed", ex);
                pushRunError(emitter, ex.getMessage());
            } finally {
                emitter.complete();
            }
        });
        return emitter;
    }

    @SuppressWarnings("unchecked")
    private void pushEvent(SseEmitter emitter, Map<String, Object> event) {
        String type = String.valueOf(event.get("type"));
        try {
            if ("status".equals(type)) {
                emit(emitter, Map.of(
                        "type", "CUSTOM",
                        "customEvent", "run_status",
                        "payload", Map.of(
                                "traceId", event.get("traceId"),
                                "conversationId", event.get("conversationId")
                        )
                ));
                return;
            }

            if ("retrievals".equals(type)) {
                emit(emitter, Map.of(
                        "type", "CUSTOM",
                        "customEvent", "run_retrievals",
                        "payload", Map.of("items", event.get("items"))
                ));
                return;
            }

            if ("trace_step".equals(type)) {
                Map<String, Object> step = (Map<String, Object>) event.get("step");
                String stepType = step.get("stepType") == null ? "" : String.valueOf(step.get("stepType"));
                if ("thought".equals(stepType)) {
                    emit(emitter, Map.of("type", "REASONING_MESSAGE_CONTENT", "content", step.get("content")));
                } else if ("action".equals(stepType)) {
                    emit(emitter, Map.of(
                            "type", "TOOL_CALL_START",
                            "toolCallId", step.get("executionId"),
                            "toolCallName", step.get("toolName") == null ? "tool" : step.get("toolName")
                    ));
                    emit(emitter, Map.of(
                            "type", "TOOL_CALL_ARGS",
                            "toolCallId", step.get("executionId"),
                            "delta", step.get("toolInput") == null ? "{}" : String.valueOf(step.get("toolInput"))
                    ));
                } else if ("observation".equals(stepType)) {
                    emit(emitter, Map.of("type", "TOOL_CALL_END", "toolCallId", step.get("executionId")));
                    emit(emitter, Map.of(
                            "type", "TOOL_CALL_RESULT",
                            "toolCallId", step.get("executionId"),
                            "messageId", step.get("executionId"),
                            "content", step.get("toolOutput") == null ? "{}" : String.valueOf(step.get("toolOutput"))
                    ));
                } else if ("final_answer".equals(stepType)) {
                    emit(emitter, Map.of(
                            "type", "TEXT_MESSAGE_CONTENT",
                            "messageId", step.get("executionId"),
                            "delta", step.get("content")
                    ));
                }
                emit(emitter, Map.of("type", "CUSTOM", "customEvent", "trace_step", "payload", step));
                return;
            }

            if ("answer_start".equals(type)) {
                emit(emitter, Map.of(
                        "type", "TEXT_MESSAGE_START",
                        "messageId", event.get("executionId")
                ));
                return;
            }

            if ("completed".equals(type)) {
                emit(emitter, Map.of(
                        "type", "CUSTOM",
                        "customEvent", "run_completed",
                        "payload", Map.of("result", event.get("result"))
                ));
                return;
            }

            if ("failed".equals(type)) {
                Object err = event.get("error");
                String message = err instanceof Map<?, ?> map && map.get("message") != null
                        ? String.valueOf(map.get("message"))
                        : "执行失败";
                pushRunError(emitter, message);
            }
        } catch (Exception ex) {
            log.warn("push stream event failed: {}", ex.getMessage());
            pushRunError(emitter, ex.getMessage());
        }
    }

    private void pushRunError(SseEmitter emitter, String message) {
        try {
            emit(emitter, Map.of("type", "RUN_ERROR", "message", message == null ? "执行失败" : message));
        } catch (Exception ignore) {
            // ignore
        }
    }

    private void emit(SseEmitter emitter, Map<String, Object> payload) throws IOException {
        emitter.send(SseEmitter.event().data(payload));
    }
}
