package com.haoyitec.agent.server.module.agent.agui;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

public interface AGUIType {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record FunctionCall(
            @JsonProperty("name") String name,
            @JsonProperty("arguments") String arguments
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record ToolCall(
            @JsonProperty("id") String id,
            @JsonProperty("type") String type,
            @JsonProperty("function") FunctionCall function
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Context(
            @JsonProperty("description") String description,
            @JsonProperty("value") String value
    ) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    record Tool(
            @JsonProperty("name") String name,
            @JsonProperty("description") String description,
            @JsonProperty("parameters") Object parameters
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    record RunAgentInput(
            @JsonProperty("threadId") String threadId,
            @JsonProperty("userId") String userId,
            @JsonProperty("runId") String runId,
            @JsonProperty("state") Object state,
            @JsonProperty("messages") List<AGUIMessage> messages,
            @JsonProperty("tools") List<Tool> tools,
            @JsonProperty("context") List<Context> context,
            @JsonProperty("forwardedProps") Object forwardedProps,
            @JsonProperty("appName") String appName
    ) {
        public Optional<AGUIMessage> lastUserMessage() {
            if (messages == null) {
                return Optional.empty();
            }
            return messages.stream()
                    .filter(Objects::nonNull)
                    .filter(AGUIMessage::isUserTextMessage)
                    .reduce((first, second) -> second);
        }

        public String normalizedRunId() {
            return StringUtils.hasText(runId) ? runId : threadId + "-" + System.currentTimeMillis();
        }
    }
}
