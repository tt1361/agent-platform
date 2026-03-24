package com.haoyitec.agent.server.domain.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.haoyitec.agent.server.domain.entity.AgentEntity;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AgentMapper extends BaseMapper<AgentEntity> {
}
