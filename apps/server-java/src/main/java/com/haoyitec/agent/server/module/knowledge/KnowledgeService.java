package com.haoyitec.agent.server.module.knowledge;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.haoyitec.agent.server.common.config.AppProperties;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.domain.entity.KnowledgeBaseEntity;
import com.haoyitec.agent.server.domain.entity.KnowledgeChunkEntity;
import com.haoyitec.agent.server.domain.entity.KnowledgeDocumentEntity;
import com.haoyitec.agent.server.domain.mapper.KnowledgeBaseMapper;
import com.haoyitec.agent.server.domain.mapper.KnowledgeChunkMapper;
import com.haoyitec.agent.server.domain.mapper.KnowledgeDocumentMapper;
import com.haoyitec.agent.server.domain.mapper.KnowledgeRetrievalLogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class KnowledgeService {

    private final KnowledgeBaseMapper baseMapper;
    private final KnowledgeDocumentMapper documentMapper;
    private final KnowledgeChunkMapper chunkMapper;
    private final KnowledgeRetrievalLogMapper retrievalLogMapper;
    private final KnowledgeRetrievalService retrievalService;
    private final AppProperties appProperties;

    public List<Map<String, Object>> list() {
        List<KnowledgeBaseEntity> bases = baseMapper.selectList(new LambdaQueryWrapper<KnowledgeBaseEntity>()
                .orderByDesc(KnowledgeBaseEntity::getUpdatedAt));
        List<Map<String, Object>> result = new ArrayList<>();
        for (KnowledgeBaseEntity base : bases) {
            Long count = documentMapper.selectCount(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                    .eq(KnowledgeDocumentEntity::getKnowledgeBaseId, base.getId()));
            Map<String, Object> item = toMap(base);
            item.put("_count", Map.of("documents", count == null ? 0 : count));
            result.add(item);
        }
        return result;
    }

    public KnowledgeBaseEntity getById(String id) {
        KnowledgeBaseEntity entity = baseMapper.selectById(id);
        if (entity == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "知识库不存在");
        }
        return entity;
    }

    public KnowledgeBaseEntity create(Map<String, Object> input) {
        String name = value(input, "name");
        if (!StringUtils.hasText(name)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "name 必填");
        }
        KnowledgeBaseEntity entity = new KnowledgeBaseEntity();
        entity.setId(IdUtil.uuid());
        entity.setName(name);
        entity.setDescription(value(input, "description"));
        entity.setStatus("active");
        baseMapper.insert(entity);
        return entity;
    }

    public KnowledgeBaseEntity update(String id, Map<String, Object> input) {
        KnowledgeBaseEntity existing = getById(id);
        KnowledgeBaseEntity update = new KnowledgeBaseEntity();
        update.setId(id);
        if (input.containsKey("name")) {
            update.setName(value(input, "name"));
        }
        if (input.containsKey("description")) {
            update.setDescription(value(input, "description"));
        }
        if (input.containsKey("status")) {
            update.setStatus(value(input, "status"));
        }
        baseMapper.updateById(update);
        return baseMapper.selectById(existing.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public KnowledgeBaseEntity remove(String id) {
        KnowledgeBaseEntity existing = getById(id);
        List<KnowledgeDocumentEntity> docs = documentMapper.selectList(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                .eq(KnowledgeDocumentEntity::getKnowledgeBaseId, id));
        for (KnowledgeDocumentEntity doc : docs) {
            removeDocument(doc.getId());
        }
        baseMapper.deleteById(id);
        return existing;
    }

    public List<Map<String, Object>> listDocuments(String knowledgeBaseId) {
        getById(knowledgeBaseId);
        List<KnowledgeDocumentEntity> docs = documentMapper.selectList(new LambdaQueryWrapper<KnowledgeDocumentEntity>()
                .eq(KnowledgeDocumentEntity::getKnowledgeBaseId, knowledgeBaseId)
                .orderByDesc(KnowledgeDocumentEntity::getCreatedAt));
        List<Map<String, Object>> result = new ArrayList<>();
        for (KnowledgeDocumentEntity doc : docs) {
            Long chunks = chunkMapper.selectCount(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                    .eq(KnowledgeChunkEntity::getDocumentId, doc.getId()));
            Map<String, Object> item = toMap(doc);
            item.put("_count", Map.of("chunks", chunks == null ? 0 : chunks));
            result.add(item);
        }
        return result;
    }

    public Map<String, Object> getDocumentById(String id) {
        KnowledgeDocumentEntity doc = documentMapper.selectById(id);
        if (doc == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "文档不存在");
        }
        Long chunks = chunkMapper.selectCount(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDocumentId, doc.getId()));
        Map<String, Object> result = toMap(doc);
        result.put("_count", Map.of("chunks", chunks == null ? 0 : chunks));
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createManualDocument(String knowledgeBaseId, Map<String, Object> input) {
        getById(knowledgeBaseId);
        String title = value(input, "title");
        String content = value(input, "content");
        if (!StringUtils.hasText(title) || !StringUtils.hasText(content)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "title 和 content 必填");
        }

        KnowledgeDocumentEntity doc = new KnowledgeDocumentEntity();
        doc.setId(IdUtil.uuid());
        doc.setKnowledgeBaseId(knowledgeBaseId);
        doc.setTitle(title);
        doc.setSourceType("manual");
        doc.setRawText(content);
        doc.setStatus("ready");
        doc.setChunkCount(0);
        documentMapper.insert(doc);

        int chunkCount = createChunks(doc.getId(), content);
        doc.setChunkCount(chunkCount);
        doc.setUpdatedAt(LocalDateTime.now());
        documentMapper.updateById(doc);
        return getDocumentById(doc.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createUrlDocument(String knowledgeBaseId, Map<String, Object> input) {
        getById(knowledgeBaseId);
        String url = value(input, "url");
        if (!StringUtils.hasText(url)) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "url 必填");
        }
        String title = StringUtils.hasText(value(input, "title")) ? value(input, "title") : url;
        String content = "来源链接: " + url;

        KnowledgeDocumentEntity doc = new KnowledgeDocumentEntity();
        doc.setId(IdUtil.uuid());
        doc.setKnowledgeBaseId(knowledgeBaseId);
        doc.setTitle(title);
        doc.setSourceType("url");
        doc.setSourceUri(url);
        doc.setRawText(content);
        doc.setStatus("ready");
        doc.setChunkCount(0);
        documentMapper.insert(doc);

        int chunkCount = createChunks(doc.getId(), content);
        doc.setChunkCount(chunkCount);
        documentMapper.updateById(doc);
        return getDocumentById(doc.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createUploadedDocument(String knowledgeBaseId, MultipartFile file) {
        getById(knowledgeBaseId);
        if (file == null || file.isEmpty()) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "文件不能为空");
        }

        try {
            Path uploadDir = ensureUploadsDir();
            String originName = StringUtils.hasText(file.getOriginalFilename()) ? file.getOriginalFilename() : "file.bin";
            String storedName = IdUtil.uuid() + "_" + originName;
            Path filePath = uploadDir.resolve(storedName);
            Files.write(filePath, file.getBytes());

            String rawText = new String(file.getBytes(), StandardCharsets.UTF_8);

            KnowledgeDocumentEntity doc = new KnowledgeDocumentEntity();
            doc.setId(IdUtil.uuid());
            doc.setKnowledgeBaseId(knowledgeBaseId);
            doc.setTitle(originName);
            doc.setSourceType("upload");
            doc.setFileName(originName);
            doc.setFilePath(filePath.toAbsolutePath().toString());
            doc.setMimeType(file.getContentType());
            doc.setFileSize((int) file.getSize());
            doc.setRawText(rawText);
            doc.setStatus("ready");
            doc.setChunkCount(0);
            documentMapper.insert(doc);

            int chunkCount = createChunks(doc.getId(), rawText);
            doc.setChunkCount(chunkCount);
            documentMapper.updateById(doc);
            return getDocumentById(doc.getId());
        } catch (Exception e) {
            throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "上传失败: " + e.getMessage());
        }
    }

    public Map<String, Object> getDownloadPath(String documentId) {
        Map<String, Object> doc = getDocumentById(documentId);
        Map<String, Object> result = new HashMap<>();
        result.put("fileName", doc.get("fileName"));
        result.put("url", "/api/v1/knowledge/documents/" + documentId + "/file");
        return result;
    }

    public List<KnowledgeRetrievalItem> retrieve(String query, Integer limit) {
        return retrievalService.retrieve(query, limit, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> removeDocument(String id) {
        Map<String, Object> existing = getDocumentById(id);
        retrievalLogMapper.delete(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.KnowledgeRetrievalLogEntity>()
                .eq(com.haoyitec.agent.server.domain.entity.KnowledgeRetrievalLogEntity::getDocumentId, id));
        chunkMapper.delete(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDocumentId, id));
        documentMapper.deleteById(id);
        return existing;
    }

    public List<KnowledgeChunkEntity> listDocumentChunks(String documentId) {
        getDocumentById(documentId);
        return chunkMapper.selectList(new LambdaQueryWrapper<KnowledgeChunkEntity>()
                .eq(KnowledgeChunkEntity::getDocumentId, documentId)
                .orderByAsc(KnowledgeChunkEntity::getChunkIndex));
    }

    private int createChunks(String documentId, String rawText) {
        if (!StringUtils.hasText(rawText)) {
            return 0;
        }
        String[] segments = rawText.trim().split("\\n{2,}");
        List<String> chunkTexts = new ArrayList<>();
        for (String segment : segments) {
            String normalized = segment == null ? "" : segment.trim();
            if (StringUtils.hasText(normalized)) {
                chunkTexts.add(normalized);
            }
        }
        if (chunkTexts.isEmpty()) {
            chunkTexts.add(rawText.trim());
        }

        int index = 0;
        for (String content : chunkTexts) {
            KnowledgeChunkEntity chunk = new KnowledgeChunkEntity();
            chunk.setId(IdUtil.uuid());
            chunk.setDocumentId(documentId);
            chunk.setChunkIndex(index++);
            chunk.setContent(content);
            chunk.setTokenCount(content.length());
            chunk.setCharCount(content.length());
            chunkMapper.insert(chunk);
        }
        return chunkTexts.size();
    }

    private Path ensureUploadsDir() throws Exception {
        Path path = Path.of(appProperties.getUpload().getPath()).toAbsolutePath();
        if (!Files.exists(path)) {
            Files.createDirectories(path);
        }
        return path;
    }

    private String value(Map<String, Object> input, String key) {
        Object value = input.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private Map<String, Object> toMap(KnowledgeBaseEntity entity) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", entity.getId());
        map.put("name", entity.getName());
        map.put("description", entity.getDescription());
        map.put("status", entity.getStatus());
        map.put("createdAt", entity.getCreatedAt());
        map.put("updatedAt", entity.getUpdatedAt());
        return map;
    }

    private Map<String, Object> toMap(KnowledgeDocumentEntity entity) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", entity.getId());
        map.put("knowledgeBaseId", entity.getKnowledgeBaseId());
        map.put("title", entity.getTitle());
        map.put("sourceType", entity.getSourceType());
        map.put("sourceUri", entity.getSourceUri());
        map.put("fileName", entity.getFileName());
        map.put("filePath", entity.getFilePath());
        map.put("mimeType", entity.getMimeType());
        map.put("fileSize", entity.getFileSize());
        map.put("rawText", entity.getRawText());
        map.put("status", entity.getStatus());
        map.put("chunkCount", entity.getChunkCount());
        map.put("createdAt", entity.getCreatedAt());
        map.put("updatedAt", entity.getUpdatedAt());
        return map;
    }
}
