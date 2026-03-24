package com.haoyitec.agent.server.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("knowledge_chunks")
public class KnowledgeChunkEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private String documentId;
    private Integer chunkIndex;
    private String content;
    private String keywords;
    private Integer tokenCount;
    private Integer charCount;
    private String metadata;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
