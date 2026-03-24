package com.haoyitec.agent.server.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("execution_traces")
public class ExecutionTraceEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private String executionId;
    private String traceId;
    private Integer stepIndex;
    private String stepType;
    private String content;
    private String toolName;
    private String toolInput;
    private String toolOutput;
    private Integer durationMs;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
