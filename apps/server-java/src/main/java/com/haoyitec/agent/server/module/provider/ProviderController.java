package com.haoyitec.agent.server.module.provider;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/llm-providers")
public class ProviderController {

    private final ProviderService providerService;

    @GetMapping
    public Object list() {
        return providerService.list();
    }

    @GetMapping("/{id}")
    public Object getById(@PathVariable String id) {
        return providerService.getById(id);
    }

    @PostMapping("/{id}/test")
    public Object testConnection(@PathVariable String id) {
        return providerService.testConnection(id);
    }
}

