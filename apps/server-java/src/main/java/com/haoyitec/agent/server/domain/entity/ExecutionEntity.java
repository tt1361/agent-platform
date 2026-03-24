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
@TableName("executions")
public class ExecutionEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private String agentId;
    private String conversationId;
    private String traceId;
    private String inputText;
    private String outputText;
    private String status;
    private String providerId;
    private Integer stepCount;
    private Integer tokensUsed;
    private BigDecimal cost;
    private LocalDateTime startedAt;
    private LocalDateTime endedAt;
    private Integer durationMs;
    private String errorCode;
    private String errorMessage;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
