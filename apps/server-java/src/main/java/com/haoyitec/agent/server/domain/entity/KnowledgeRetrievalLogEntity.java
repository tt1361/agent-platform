package com.haoyitec.agent.server.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("knowledge_retrieval_logs")
public class KnowledgeRetrievalLogEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private String executionId;
    private String query;
    private String knowledgeBaseId;
    private String documentId;
    private String chunkId;
    private BigDecimal score;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
