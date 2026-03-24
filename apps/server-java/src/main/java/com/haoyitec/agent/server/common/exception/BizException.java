package com.haoyitec.agent.server.common.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class BizException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Object details;

    public BizException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    public BizException(HttpStatus status, String code, String message, Object details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
