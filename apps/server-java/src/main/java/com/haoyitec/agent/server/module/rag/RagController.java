package com.haoyitec.agent.server.module.rag;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/rag")
public class RagController {

    private final RagService ragService;

    @PostMapping("/index")
    public Object index(@RequestBody Map<String, Object> body) {
        String documentId = body.get("documentId") == null ? null : String.valueOf(body.get("documentId"));
        String rawText = body.get("rawText") == null ? null : String.valueOf(body.get("rawText"));
        return ragService.indexDocument(documentId, rawText);
    }

    @PostMapping("/retrieve")
    @SuppressWarnings("unchecked")
    public Object retrieve(@RequestBody Map<String, Object> body) {
        String query = body.get("query") == null ? null : String.valueOf(body.get("query"));
        Integer limit = body.get("limit") == null ? null : Integer.parseInt(String.valueOf(body.get("limit")));
        Map<String, Object> filter = body.get("filter") instanceof Map<?, ?> map ? (Map<String, Object>) map : null;
        return ragService.retrieve(query, limit, filter);
    }

    @GetMapping("/health")
    public Object health() {
        return Map.of("status", "ok");
    }
}

