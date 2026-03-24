package com.haoyitec.agent.server.module.trace;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/traces")
public class TraceController {

    private final TraceService traceService;

    @GetMapping("/{traceId}")
    public Object getTrace(@PathVariable String traceId) {
        return traceService.getTraceDetails(traceId);
    }
}

