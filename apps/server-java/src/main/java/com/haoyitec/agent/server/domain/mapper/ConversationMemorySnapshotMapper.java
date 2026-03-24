package com.haoyitec.agent.server.domain.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.haoyitec.agent.server.domain.entity.ConversationMemorySnapshotEntity;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ConversationMemorySnapshotMapper extends BaseMapper<ConversationMemorySnapshotEntity> {
}
