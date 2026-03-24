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
@TableName("agents")
public class AgentEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private String name;
    private String description;
    private String status;
    private String llmProviderId;
    private String systemPrompt;
    private Integer maxSteps;
    private Integer timeoutMs;
    private BigDecimal temperature;
    private BigDecimal topP;
    private String skillIds;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
