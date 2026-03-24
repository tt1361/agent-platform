package com.haoyitec.agent.server.module.provider;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/llm-model-catalog")
public class ModelCatalogController {

    private final ModelCatalogService modelCatalogService;

    @GetMapping
    public Object list() {
        return modelCatalogService.list();
    }

    @PostMapping
    public Object create(@RequestBody Map<String, Object> body) {
        return modelCatalogService.create(body);
    }

    @PutMapping("/{id}")
    public Object update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return modelCatalogService.update(id, body);
    }

    @DeleteMapping("/{id}")
    public Object remove(@PathVariable String id) {
        return modelCatalogService.remove(id);
    }
}
