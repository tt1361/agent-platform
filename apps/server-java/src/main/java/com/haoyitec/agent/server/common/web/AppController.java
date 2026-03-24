package com.haoyitec.agent.server.common.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class AppController {

    @GetMapping("/")
    public Object hello() {
        return Map.of("name", "haoyitec-agent-platform", "status", "ok");
    }
}

