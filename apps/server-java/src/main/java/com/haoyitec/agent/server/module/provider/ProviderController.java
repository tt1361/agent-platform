package com.haoyitec.agent.server.module.provider;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

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

    @PostMapping
    public Object create(@RequestBody Map<String, Object> body) {
        return providerService.create(body);
    }

    @PutMapping("/{id}")
    public Object update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return providerService.update(id, body);
    }

    @PatchMapping("/{id}/status")
    public Object patchStatus(@PathVariable String id, @RequestBody Map<String, Object> body) {
        Object status = body == null ? null : body.get("status");
        return providerService.updateStatus(id, status == null ? null : String.valueOf(status));
    }

    @DeleteMapping("/{id}")
    public Object remove(@PathVariable String id) {
        return providerService.remove(id);
    }

    @GetMapping("/{id}/models")
    public Object listModels(@PathVariable String id) {
        return providerService.listModels(id);
    }

    @GetMapping("/{id}/secret")
    public Object getSecret(@PathVariable String id) {
        return providerService.getSecret(id);
    }

    @PutMapping("/{id}/secret")
    public Object putSecret(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return providerService.putSecret(id, body);
    }

    @DeleteMapping("/{id}/secret")
    public Object clearSecret(@PathVariable String id) {
        return providerService.clearSecret(id);
    }

    @PostMapping("/{id}/test")
    public Object testConnection(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        return providerService.testConnection(id, body == null ? Map.of() : body);
    }
}
