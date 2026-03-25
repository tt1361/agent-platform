package com.haoyitec.agent.server.module.agent.agui;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public interface AGUIEvent {

    @JsonProperty("type")
    EventType type();

    @JsonProperty("timestamp")
    Long timestamp();

    enum EventType {
        TEXT_MESSAGE_START,
        TEXT_MESSAGE_CONTENT,
        TEXT_MESSAGE_END,
        CUSTOM,
        RUN_STARTED,
        RUN_FINISHED,
        RUN_ERROR
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record TextMessageStartEvent(
            @JsonProperty("type") EventType type,
            @JsonProperty("timestamp") Long timestamp,
            @JsonProperty("message_id") String messageId,
            @JsonProperty("role") String role
    ) implements AGUIEvent {
        public TextMessageStartEvent(String messageId, String role) {
            this(EventType.TEXT_MESSAGE_START, System.currentTimeMillis(), messageId, role);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record TextMessageContentEvent(
            @JsonProperty("type") EventType type,
            @JsonProperty("timestamp") Long timestamp,
            @JsonProperty("message_id") String messageId,
            @JsonProperty("delta") String delta
    ) implements AGUIEvent {
        public TextMessageContentEvent(String messageId, String delta) {
            this(EventType.TEXT_MESSAGE_CONTENT, System.currentTimeMillis(), messageId, delta);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record TextMessageEndEvent(
            @JsonProperty("type") EventType type,
            @JsonProperty("timestamp") Long timestamp,
            @JsonProperty("message_id") String messageId
    ) implements AGUIEvent {
        public TextMessageEndEvent(String messageId) {
            this(EventType.TEXT_MESSAGE_END, System.currentTimeMillis(), messageId);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record CustomEvent(
            @JsonProperty("type") EventType type,
            @JsonProperty("timestamp") Long timestamp,
            @JsonProperty("name") String name,
            @JsonProperty("value") Object value
    ) implements AGUIEvent {
        public CustomEvent(String name, Object value) {
            this(EventType.CUSTOM, System.currentTimeMillis(), name, value);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record RunStartedEvent(
            @JsonProperty("type") EventType type,
            @JsonProperty("timestamp") Long timestamp,
            @JsonProperty("thread_id") String threadId,
            @JsonProperty("run_id") String runId
    ) implements AGUIEvent {
        public RunStartedEvent(String threadId, String runId) {
            this(EventType.RUN_STARTED, System.currentTimeMillis(), threadId, runId);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record RunFinishedEvent(
            @JsonProperty("type") EventType type,
            @JsonProperty("timestamp") Long timestamp,
            @JsonProperty("thread_id") String threadId,
            @JsonProperty("run_id") String runId
    ) implements AGUIEvent {
        public RunFinishedEvent(String threadId, String runId) {
            this(EventType.RUN_FINISHED, System.currentTimeMillis(), threadId, runId);
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record RunErrorEvent(
            @JsonProperty("type") EventType type,
            @JsonProperty("timestamp") Long timestamp,
            @JsonProperty("message") String message,
            @JsonProperty("code") String code
    ) implements AGUIEvent {
        public RunErrorEvent(String message, String code) {
            this(EventType.RUN_ERROR, System.currentTimeMillis(), message, code);
        }
    }
}
