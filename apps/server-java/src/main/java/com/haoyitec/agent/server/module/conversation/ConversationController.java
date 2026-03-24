package com.haoyitec.agent.server.module.conversation;

import com.haoyitec.agent.server.module.memory.MemoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/conversations")
public class ConversationController {

    private final ConversationService conversationService;
    private final MemoryService memoryService;

    @GetMapping
    public Object list() {
        return conversationService.list();
    }

    @GetMapping("/{id}")
    public Object getById(@PathVariable String id) {
        return conversationService.getById(id);
    }

    @GetMapping("/{id}/memory")
    public Object getMemory(@PathVariable String id) {
        return memoryService.getLatestShortTermMemory(id);
    }

    @PostMapping
    public Object create(@RequestBody Map<String, Object> body) {
        String agentId = body.get("agentId") == null ? null : String.valueOf(body.get("agentId"));
        String title = body.get("title") == null ? "新会话" : String.valueOf(body.get("title"));
        return conversationService.create(agentId, title);
    }

    @GetMapping("/agent/{agentId}")
    public Object listByAgent(@PathVariable String agentId) {
        return conversationService.listByAgent(agentId);
    }

    @PatchMapping("/{id}")
    public Object patch(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return conversationService.update(id, body);
    }

    @PutMapping("/{id}")
    public Object update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return conversationService.update(id, body);
    }

    @DeleteMapping("/{id}")
    public Object remove(@PathVariable String id) {
        return conversationService.remove(id);
    }
}

