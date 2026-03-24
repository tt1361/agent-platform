package com.haoyitec.agent.server.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;

@Data
@TableName("llm_providers")
public class LlmProviderEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private String providerKey;
    private String name;
    private String providerType;
    private String model;
    private String apiBaseUrl;
    private String apiKeyMasked;
    private String config;
    private String status;
    @TableField("cost_per_1k_input_tokens")
    private BigDecimal costPer1kInputTokens;
    @TableField("cost_per_1k_output_tokens")
    private BigDecimal costPer1kOutputTokens;
    private LocalDateTime lastHealthCheckAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableField(exist = false)
    private String defaultModel;
    @TableField(exist = false)
    private Boolean secretConfigured;
    @TableField(exist = false)
    private Map<String, String> secretMasked;
}
