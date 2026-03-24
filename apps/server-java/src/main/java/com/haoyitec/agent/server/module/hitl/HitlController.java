package com.haoyitec.agent.server.module.hitl;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/hitl/tasks")
public class HitlController {

    private final HitlService hitlService;

    @GetMapping
    public Object list() {
        return hitlService.list();
    }

    @GetMapping("/{id}")
    public Object getById(@PathVariable String id) {
        return hitlService.getById(id);
    }

    @PostMapping
    public Object create(@RequestBody Map<String, Object> body) {
        return hitlService.create(body);
    }

    @PatchMapping("/{id}/status")
    public Object updateStatus(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String status = body.get("status") == null ? null : String.valueOf(body.get("status"));
        return hitlService.updateStatus(id, status);
    }
}

