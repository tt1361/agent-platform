package com.haoyitec.agent.server.module.agent;

import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.module.agent.agui.AGUIEvent;
import com.haoyitec.agent.server.module.agent.agui.AGUIEventMapper;
import com.haoyitec.agent.server.module.agent.agui.AGUIMessage;
import com.haoyitec.agent.server.module.agent.agui.AGUIType;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.io.IOException;
import java.util.List;
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

    @Operation(
            summary = "Run an agent with CopilotKit AGUI streaming",
            description = "Streams AGUI events for CopilotKit-compatible clients using text/event-stream."
    )
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "SSE stream established"),
            @ApiResponse(
                    responseCode = "400",
                    description = "Validation error",
                    content = @Content(schema = @Schema(implementation = com.haoyitec.agent.server.common.web.ApiResponse.class))
            ),
            @ApiResponse(
                    responseCode = "500",
                    description = "Server error",
                    content = @Content(schema = @Schema(implementation = com.haoyitec.agent.server.common.web.ApiResponse.class))
            )
    })
    @PostMapping(
            value = "/{id}/run/copilotkit",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.TEXT_EVENT_STREAM_VALUE
    )
    public Flux<ServerSentEvent<String>> runCopilotkit(
            @Parameter(description = "Agent id", required = true)
            @PathVariable String id,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(
                    required = true,
                    description = "CopilotKit RunAgentInput payload"
            )
            @RequestBody AGUIType.RunAgentInput input
    ) {
        validateCopilotKitInput(input);
        AGUIMessage lastUserMessage = input.lastUserMessage().orElseThrow(
                () -> new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "messages 中缺少 user 文本消息")
        );
        AGUIEventMapper eventMapper = new AGUIEventMapper(input.threadId(), input.normalizedRunId());

        return Flux.create(sink -> {
            emitAguiEvents(sink, List.of(eventMapper.runStartedEvent()));
            CompletableFuture.runAsync(() -> runCopilotkitInternal(id, input, lastUserMessage, eventMapper, sink));
        });
    }

    private void runCopilotkitInternal(String id,
                                       AGUIType.RunAgentInput input,
                                       AGUIMessage lastUserMessage,
                                       AGUIEventMapper eventMapper,
                                       FluxSink<ServerSentEvent<String>> sink) {
        try {
            agentService.run(
                    id,
                    lastUserMessage.content(),
                    null,
                    input.threadId(),
                    null,
                    null,
                    null,
                    List.of(),
                    event -> emitAguiEvents(sink, eventMapper.mapRuntimeEvent(event))
            );
        } catch (Exception ex) {
            log.error("agent copilotkit stream failed, agentId={}", id, ex);
            emitAguiEvents(sink, eventMapper.streamErrorEvents(ex));
        } finally {
            sink.complete();
        }
    }

    private void validateCopilotKitInput(AGUIType.RunAgentInput input) {
        if (input == null) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求体不能为空");
        }
        if (!StringUtils.hasText(input.threadId())) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "threadId 必填");
        }
        if (input.messages() == null || input.messages().isEmpty()) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "messages 必填");
        }
    }

    private void emitAguiEvents(FluxSink<ServerSentEvent<String>> sink, List<AGUIEvent> events) {
        for (AGUIEvent event : events) {
            try {
                String eventData = JsonUtil.toJson(event);
                sink.next(ServerSentEvent.<String>builder()
                        .event(event.type().name())
                        .data(eventData)
                        .build());
            } catch (Exception ex) {
                log.warn("serialize AGUI event failed: {}", ex.getMessage());
                AGUIEvent.RunErrorEvent runErrorEvent = new AGUIEvent.RunErrorEvent("Error serializing event", "SERIALIZE_ERROR");
                try {
                    String fallback = JsonUtil.toJson(runErrorEvent);
                    sink.next(ServerSentEvent.<String>builder()
                            .event(runErrorEvent.type().name())
                            .data(fallback)
                            .build());
                } catch (Exception ignored) {
                    // ignore secondary serialization failure
                }
            }
        }
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
                    boolean streamed = Boolean.TRUE.equals(step.get("streamed"));
                    if (!streamed) {
                        emit(emitter, Map.of(
                                "type", "TEXT_MESSAGE_CONTENT",
                                "messageId", step.get("executionId"),
                                "delta", step.get("content")
                        ));
                    }
                }
                emit(emitter, Map.of("type", "CUSTOM", "customEvent", "trace_step", "payload", step));
                return;
            }

            if ("answer_delta".equals(type)) {
                emit(emitter, Map.of(
                        "type", "TEXT_MESSAGE_CONTENT",
                        "messageId", event.get("executionId"),
                        "delta", event.get("delta")
                ));
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
