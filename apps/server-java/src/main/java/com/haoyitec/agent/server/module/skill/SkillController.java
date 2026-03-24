package com.haoyitec.agent.server.module.skill;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/skills")
public class SkillController {

    private final SkillService skillService;

    @GetMapping
    public Object list() {
        return skillService.list();
    }

    @GetMapping("/available")
    public Object listAvailable() {
        return skillService.listAvailable();
    }

    @GetMapping("/{id}")
    public Object getById(@PathVariable String id) {
        return skillService.getById(id);
    }

    @PostMapping
    public Object create(@RequestBody Map<String, Object> body) {
        return skillService.create(body);
    }

    @PatchMapping("/{id}/status")
    public Object updateStatus(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String status = body.get("status") == null ? null : String.valueOf(body.get("status"));
        return skillService.updateStatus(id, status);
    }

    @GetMapping("/{id}/secret")
    public Object getSecret(@PathVariable String id) {
        return skillService.getSecret(id);
    }

    @PutMapping("/{id}/secret")
    public Object updateSecret(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return skillService.updateSecret(id, body);
    }

    @DeleteMapping("/{id}/secret")
    public Object deleteSecret(@PathVariable String id) {
        return skillService.removeSecret(id);
    }

    @DeleteMapping("/{id}")
    public Object remove(@PathVariable String id) {
        return skillService.remove(id);
    }
}
