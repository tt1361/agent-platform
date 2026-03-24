package com.haoyitec.agent.server.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("knowledge_documents")
public class KnowledgeDocumentEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private String knowledgeBaseId;
    private String title;
    private String sourceType;
    private String sourceUri;
    private String fileName;
    private String filePath;
    private String mimeType;
    private Integer fileSize;
    private String rawText;
    private String status;
    private Integer chunkCount;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
