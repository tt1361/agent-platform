package com.haoyitec.agent.server.module.memory;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/memories")
public class MemoryController {

    private final MemoryService memoryService;

    @GetMapping("/snapshot/{conversationId}")
    public Object getSnapshot(@PathVariable String conversationId) {
        return memoryService.getSnapshot(conversationId);
    }

    @GetMapping("/agent/{agentId}")
    public Object listAgentMemories(@PathVariable String agentId) {
        return memoryService.listAgentMemories(agentId);
    }

    @PatchMapping("/agent/{id}/importance")
    public Object updateImportance(@PathVariable String id, @RequestBody Map<String, Object> body) {
        Integer importance = body.get("importance") == null ? null : Integer.parseInt(String.valueOf(body.get("importance")));
        return memoryService.updateAgentMemoryImportance(id, importance);
    }

    @DeleteMapping("/agent/{id}")
    public Object removeAgentMemory(@PathVariable String id) {
        return memoryService.removeAgentMemory(id);
    }
}

