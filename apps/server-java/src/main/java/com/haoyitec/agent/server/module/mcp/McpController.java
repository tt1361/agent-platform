package com.haoyitec.agent.server.module.mcp;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/mcp/servers")
public class McpController {

    private final McpService mcpService;

    @GetMapping
    public Object listServers() {
        return mcpService.listServers();
    }

    @GetMapping("/{id}")
    public Object getServer(@PathVariable String id) {
        return mcpService.getServer(id);
    }

    @PostMapping
    public Object registerServer(@RequestBody Map<String, Object> body) {
        return mcpService.registerServer(body);
    }

    @PostMapping("/{id}/discover")
    public Object discover(@PathVariable String id) {
        return mcpService.discoverCapabilities(id);
    }

    @DeleteMapping("/{id}")
    public Object remove(@PathVariable String id) {
        return mcpService.removeServer(id);
    }
}

