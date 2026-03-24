package com.haoyitec.agent.server.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@TableName("skills")
public class SkillEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private String skillKey;
    private String name;
    private String version;
    private String description;
    private String status;
    private String executorKey;
    private String parametersSchema;
    private String returnsSchema;
    private String tags;
    private Integer timeoutMs;
    private String retryPolicy;

    @TableField(exist = false)
    private String sourceType;
    @TableField(exist = false)
    private String sourcePath;
    @TableField(exist = false)
    private List<String> whenToUse;
    @TableField(exist = false)
    private List<String> whenNotToUse;
    @TableField(exist = false)
    private String pluginType;
    @TableField(exist = false)
    private List<String> pluginTriggerKeywords;
    @TableField(exist = false)
    private List<String> pluginSecretKeys;
    @TableField(exist = false)
    private Boolean secretConfigured;
    @TableField(exist = false)
    private Map<String, String> secretMasked;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
