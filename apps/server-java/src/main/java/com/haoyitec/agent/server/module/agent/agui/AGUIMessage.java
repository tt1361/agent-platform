package com.haoyitec.agent.server.module.agent.agui;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.springframework.util.StringUtils;

@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AGUIMessage(
        @JsonProperty("id") String id,
        @JsonProperty("role") String role,
        @JsonProperty("content") String content,
        @JsonProperty("type") String type
) {
    @JsonIgnore
    public boolean isUserTextMessage() {
        return "user".equalsIgnoreCase(role) && StringUtils.hasText(content);
    }
}
