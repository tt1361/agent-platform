package com.haoyitec.agent.server.domain.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.haoyitec.agent.server.domain.entity.LlmProviderSecretEntity;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface LlmProviderSecretMapper extends BaseMapper<LlmProviderSecretEntity> {
}
