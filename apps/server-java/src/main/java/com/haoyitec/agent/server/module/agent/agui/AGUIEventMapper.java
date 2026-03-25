package com.haoyitec.agent.server.module.agent.agui;

import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public class AGUIEventMapper {

    private static final String ASSISTANT_ROLE = "assistant";
    private static final String DEFAULT_ERROR_CODE = "AGENT_EXECUTION_ERROR";

    private final String threadId;
    private final String runId;

    private String currentMessageId;
    private boolean textStarted;
    private boolean terminalEmitted;

    public AGUIEventMapper(String threadId, String runId) {
        this.threadId = threadId;
        this.runId = runId;
    }

    public AGUIEvent runStartedEvent() {
        return new AGUIEvent.RunStartedEvent(threadId, runId);
    }

    public List<AGUIEvent> mapRuntimeEvent(Map<String, Object> event) {
        if (event == null) {
            return List.of();
        }
        String type = asText(event.get("type"));
        if (!StringUtils.hasText(type)) {
            return List.of();
        }
        return switch (type) {
            case "status" -> List.of(new AGUIEvent.CustomEvent("run_status", toStatusValue(event)));
            case "retrievals" -> List.of(new AGUIEvent.CustomEvent("run_retrievals", toRetrievalsValue(event)));
            case "trace_step" -> toTraceStepEvents(event);
            case "answer_start" -> toAnswerStartEvents(event);
            case "answer_delta" -> toAnswerDeltaEvents(event);
            case "completed" -> toCompletedEvents(event);
            case "failed" -> toFailedEvents(event);
            default -> List.of();
        };
    }

    public List<AGUIEvent> streamErrorEvents(Throwable throwable) {
        if (terminalEmitted) {
            return List.of();
        }
        String message = throwable == null || !StringUtils.hasText(throwable.getMessage())
                ? "执行失败"
                : throwable.getMessage();
        List<AGUIEvent> events = new ArrayList<>();
        appendTextEndIfStarted(events);
        events.add(new AGUIEvent.RunErrorEvent(message, DEFAULT_ERROR_CODE));
        terminalEmitted = true;
        return events;
    }

    @SuppressWarnings("unchecked")
    private List<AGUIEvent> toTraceStepEvents(Map<String, Object> event) {
        Object step = event.get("step");
        if (!(step instanceof Map<?, ?>)) {
            return List.of(new AGUIEvent.CustomEvent("trace_step", step));
        }
        return List.of(new AGUIEvent.CustomEvent("trace_step", (Map<String, Object>) step));
    }

    private List<AGUIEvent> toAnswerStartEvents(Map<String, Object> event) {
        String executionId = asText(event.get("executionId"));
        if (!StringUtils.hasText(executionId)) {
            return List.of();
        }
        List<AGUIEvent> events = new ArrayList<>();
        if (!textStarted || !Objects.equals(currentMessageId, executionId)) {
            appendTextEndIfStarted(events);
            textStarted = true;
            currentMessageId = executionId;
            events.add(new AGUIEvent.TextMessageStartEvent(executionId, ASSISTANT_ROLE));
        }
        return events;
    }

    private List<AGUIEvent> toAnswerDeltaEvents(Map<String, Object> event) {
        String executionId = asText(event.get("executionId"));
        String delta = asText(event.get("delta"));
        if (!StringUtils.hasText(executionId) || !StringUtils.hasText(delta)) {
            return List.of();
        }
        List<AGUIEvent> events = new ArrayList<>();
        if (!textStarted || !Objects.equals(currentMessageId, executionId)) {
            appendTextEndIfStarted(events);
            textStarted = true;
            currentMessageId = executionId;
            events.add(new AGUIEvent.TextMessageStartEvent(executionId, ASSISTANT_ROLE));
        }
        events.add(new AGUIEvent.TextMessageContentEvent(executionId, delta));
        return events;
    }

    private List<AGUIEvent> toCompletedEvents(Map<String, Object> event) {
        List<AGUIEvent> events = new ArrayList<>();
        appendTextEndIfStarted(events);
        Map<String, Object> customValue = new LinkedHashMap<>();
        customValue.put("result", event.get("result"));
        events.add(new AGUIEvent.CustomEvent("run_completed", customValue));
        events.add(new AGUIEvent.RunFinishedEvent(threadId, runId));
        terminalEmitted = true;
        return events;
    }

    @SuppressWarnings("unchecked")
    private List<AGUIEvent> toFailedEvents(Map<String, Object> event) {
        List<AGUIEvent> events = new ArrayList<>();
        appendTextEndIfStarted(events);
        Object error = event.get("error");
        String message = "执行失败";
        String code = DEFAULT_ERROR_CODE;
        if (error instanceof Map<?, ?> errorMap) {
            Object rawMessage = errorMap.get("message");
            if (StringUtils.hasText(asText(rawMessage))) {
                message = asText(rawMessage);
            }
            Object rawCode = errorMap.get("code");
            if (StringUtils.hasText(asText(rawCode))) {
                code = asText(rawCode);
            }
        }
        events.add(new AGUIEvent.RunErrorEvent(message, code));
        terminalEmitted = true;
        return events;
    }

    private void appendTextEndIfStarted(List<AGUIEvent> events) {
        if (textStarted && StringUtils.hasText(currentMessageId)) {
            events.add(new AGUIEvent.TextMessageEndEvent(currentMessageId));
        }
        textStarted = false;
        currentMessageId = null;
    }

    private Map<String, Object> toStatusValue(Map<String, Object> event) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("traceId", event.get("traceId"));
        value.put("conversationId", event.get("conversationId"));
        value.put("executionId", event.get("executionId"));
        value.put("status", event.get("status"));
        return value;
    }

    private Map<String, Object> toRetrievalsValue(Map<String, Object> event) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("items", event.get("items"));
        value.put("traceId", event.get("traceId"));
        value.put("executionId", event.get("executionId"));
        return value;
    }

    private String asText(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
