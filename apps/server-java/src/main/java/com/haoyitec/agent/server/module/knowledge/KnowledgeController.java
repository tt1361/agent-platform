package com.haoyitec.agent.server.module.knowledge;

import com.haoyitec.agent.server.common.exception.BizException;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/knowledge")
public class KnowledgeController {

    private final KnowledgeService knowledgeService;
    private final KnowledgeRetrievalService retrievalService;

    @GetMapping("/bases")
    public Object listBases() {
        return knowledgeService.list();
    }

    @PostMapping("/bases")
    public Object createBase(@RequestBody Map<String, Object> body) {
        return knowledgeService.create(body);
    }

    @PatchMapping("/bases/{id}")
    public Object updateBase(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return knowledgeService.update(id, body);
    }

    @DeleteMapping("/bases/{id}")
    public Object deleteBase(@PathVariable String id) {
        return knowledgeService.remove(id);
    }

    @GetMapping("/bases/{id}/documents")
    public Object listBaseDocuments(@PathVariable String id) {
        return knowledgeService.listDocuments(id);
    }

    @PostMapping("/bases/{id}/documents/manual")
    public Object createManualDocument(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return knowledgeService.createManualDocument(id, body);
    }

    @PostMapping("/bases/{id}/documents/url")
    public Object createUrlDocument(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return knowledgeService.createUrlDocument(id, body);
    }

    @PostMapping(value = "/bases/{id}/documents/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Object uploadDocument(@PathVariable String id, @RequestParam("file") MultipartFile file) {
        return knowledgeService.createUploadedDocument(id, file);
    }

    @GetMapping("/documents/{id}")
    public Object getDocument(@PathVariable String id) {
        return knowledgeService.getDocumentById(id);
    }

    @GetMapping("/documents/{id}/download")
    public Object getDownloadInfo(@PathVariable String id) {
        return knowledgeService.getDownloadPath(id);
    }

    @GetMapping("/documents/{id}/file")
    public ResponseEntity<Resource> downloadFile(@PathVariable String id) {
        @SuppressWarnings("unchecked")
        Map<String, Object> doc = (Map<String, Object>) knowledgeService.getDocumentById(id);
        String filePath = doc.get("filePath") == null ? null : String.valueOf(doc.get("filePath"));
        if (!StringUtils.hasText(filePath)) {
            throw new BizException(HttpStatus.NOT_FOUND, "FILE_NOT_FOUND", "No file for document");
        }
        try {
            byte[] bytes = Files.readAllBytes(Path.of(filePath));
            String fileName = doc.get("fileName") == null ? "document" : String.valueOf(doc.get("fileName"));
            String mimeType = doc.get("mimeType") == null ? "application/octet-stream" : String.valueOf(doc.get("mimeType"));
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + fileName + "\"")
                    .contentType(MediaType.parseMediaType(mimeType))
                    .body(new ByteArrayResource(bytes));
        } catch (Exception ex) {
            throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "读取文件失败: " + ex.getMessage());
        }
    }

    @PostMapping("/retrieve")
    public Object retrieve(@RequestBody Map<String, Object> body) {
        String query = body.get("query") == null ? null : String.valueOf(body.get("query"));
        Integer limit = body.get("limit") == null ? null : Integer.parseInt(String.valueOf(body.get("limit")));
        return retrievalService.retrieve(query, limit, null);
    }

    @GetMapping
    public Object list() {
        return knowledgeService.list();
    }

    @PostMapping
    public Object create(@RequestBody Map<String, Object> body) {
        return knowledgeService.create(body);
    }

    @DeleteMapping("/{id}")
    public Object remove(@PathVariable String id) {
        return knowledgeService.remove(id);
    }

    @GetMapping("/{id}/documents")
    public Object listDocuments(@PathVariable String id) {
        return knowledgeService.listDocuments(id);
    }

    @DeleteMapping("/documents/{id}")
    public Object removeDocument(@PathVariable String id) {
        return knowledgeService.removeDocument(id);
    }
}

