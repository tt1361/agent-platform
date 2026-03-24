package com.haoyitec.agent.server.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

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

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
