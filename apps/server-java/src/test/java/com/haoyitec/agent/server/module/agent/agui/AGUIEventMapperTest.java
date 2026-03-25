package com.haoyitec.agent.server.module.agent.agui;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

class AGUIEventMapperTest {

    @Test
    void shouldMapRunStatusToCustomEvent() {
        AGUIEventMapper mapper = new AGUIEventMapper("thread-1", "run-1");

        Map<String, Object> statusEvent = new HashMap<>();
        statusEvent.put("type", "status");
        statusEvent.put("traceId", "trace-1");
        statusEvent.put("conversationId", "conv-1");
        statusEvent.put("executionId", "exec-1");
        statusEvent.put("status", "running");

        List<AGUIEvent> result = mapper.mapRuntimeEvent(statusEvent);

        assertEquals(1, result.size());
        AGUIEvent.CustomEvent customEvent = assertInstanceOf(AGUIEvent.CustomEvent.class, result.get(0));
        assertEquals("run_status", customEvent.name());
        Map<?, ?> value = assertInstanceOf(Map.class, customEvent.value());
        assertEquals("trace-1", value.get("traceId"));
        assertEquals("conv-1", value.get("conversationId"));
        assertEquals("exec-1", value.get("executionId"));
        assertEquals("running", value.get("status"));
    }

    @Test
    void shouldEmitExpectedSequenceOnCompletedStream() {
        AGUIEventMapper mapper = new AGUIEventMapper("thread-2", "run-2");

        AGUIEvent started = mapper.runStartedEvent();
        List<AGUIEvent> answerStart = mapper.mapRuntimeEvent(Map.of("type", "answer_start", "executionId", "exec-2"));
        List<AGUIEvent> answerDelta = mapper.mapRuntimeEvent(Map.of("type", "answer_delta", "executionId", "exec-2", "delta", "hello"));
        List<AGUIEvent> completed = mapper.mapRuntimeEvent(Map.of("type", "completed", "result", Map.of("status", "succeeded")));

        assertEquals(AGUIEvent.EventType.RUN_STARTED, started.type());
        assertEquals(1, answerStart.size());
        assertEquals(AGUIEvent.EventType.TEXT_MESSAGE_START, answerStart.get(0).type());
        assertEquals(1, answerDelta.size());
        assertEquals(AGUIEvent.EventType.TEXT_MESSAGE_CONTENT, answerDelta.get(0).type());
        assertEquals(3, completed.size());
        assertEquals(AGUIEvent.EventType.TEXT_MESSAGE_END, completed.get(0).type());
        assertEquals(AGUIEvent.EventType.CUSTOM, completed.get(1).type());
        assertEquals(AGUIEvent.EventType.RUN_FINISHED, completed.get(2).type());
    }

    @Test
    void shouldEmitRunErrorWithoutRunFinishedWhenFailed() {
        AGUIEventMapper mapper = new AGUIEventMapper("thread-3", "run-3");

        mapper.mapRuntimeEvent(Map.of("type", "answer_start", "executionId", "exec-3"));
        List<AGUIEvent> failed = mapper.mapRuntimeEvent(Map.of(
                "type", "failed",
                "error", Map.of("code", "AGENT_EXECUTION_ERROR", "message", "boom")
        ));

        assertEquals(2, failed.size());
        assertEquals(AGUIEvent.EventType.TEXT_MESSAGE_END, failed.get(0).type());
        assertEquals(AGUIEvent.EventType.RUN_ERROR, failed.get(1).type());
    }
}
