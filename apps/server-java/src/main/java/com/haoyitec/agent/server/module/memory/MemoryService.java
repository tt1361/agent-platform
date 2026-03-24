package com.haoyitec.agent.server.module.memory;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.domain.entity.AgentMemoryEntity;
import com.haoyitec.agent.server.domain.entity.ConversationMemorySnapshotEntity;
import com.haoyitec.agent.server.domain.mapper.AgentMemoryMapper;
import com.haoyitec.agent.server.domain.mapper.ConversationMemorySnapshotMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
public class MemoryService {

    private final ConversationMemorySnapshotMapper snapshotMapper;
    private final AgentMemoryMapper agentMemoryMapper;

    public ConversationMemorySnapshotEntity getSnapshot(String conversationId) {
        return snapshotMapper.selectOne(new LambdaQueryWrapper<ConversationMemorySnapshotEntity>()
                .eq(ConversationMemorySnapshotEntity::getConversationId, conversationId)
                .last("LIMIT 1"));
    }

    public ConversationMemorySnapshotEntity getLatestShortTermMemory(String conversationId) {
        return snapshotMapper.selectOne(new LambdaQueryWrapper<ConversationMemorySnapshotEntity>()
                .eq(ConversationMemorySnapshotEntity::getConversationId, conversationId)
                .orderByDesc(ConversationMemorySnapshotEntity::getUpdatedAt)
                .last("LIMIT 1"));
    }

    public List<AgentMemoryEntity> listAgentMemories(String agentId) {
        return agentMemoryMapper.selectList(new LambdaQueryWrapper<AgentMemoryEntity>()
                .eq(AgentMemoryEntity::getAgentId, agentId)
                .orderByDesc(AgentMemoryEntity::getImportance)
                .orderByDesc(AgentMemoryEntity::getUpdatedAt));
    }

    public List<AgentMemoryEntity> getLongTermMemories(String agentId) {
        return agentMemoryMapper.selectList(new LambdaQueryWrapper<AgentMemoryEntity>()
                .eq(AgentMemoryEntity::getAgentId, agentId)
                .orderByDesc(AgentMemoryEntity::getImportance)
                .orderByDesc(AgentMemoryEntity::getUpdatedAt)
                .last("LIMIT 8"));
    }

    public ConversationMemorySnapshotEntity updateShortTermMemory(String conversationId,
                                                                   String conversationTitle,
                                                                   String previousSummary,
                                                                   String input,
                                                                   String output,
                                                                   Integer messageCount) {
        String summary = Stream.of(previousSummary, conversationTitle, input, output)
                .filter(StringUtils::hasText)
                .collect(Collectors.joining(" | "));
        if (summary.length() > 2000) {
            summary = summary.substring(0, 2000);
        }
        ConversationMemorySnapshotEntity snapshot = new ConversationMemorySnapshotEntity();
        snapshot.setId(IdUtil.uuid());
        snapshot.setConversationId(conversationId);
        snapshot.setSummary(summary);
        snapshot.setMessageCount(messageCount);
        snapshotMapper.insert(snapshot);
        return snapshot;
    }

    public List<AgentMemoryEntity> persistLongTermMemories(String agentId, String conversationId, String input, String output) {
        String content = ((input == null ? "" : input) + "\n" + (output == null ? "" : output)).trim();
        if (content.isBlank()) {
            return Collections.emptyList();
        }
        if (content.length() > 1000) {
            content = content.substring(0, 1000);
        }

        AgentMemoryEntity memory = new AgentMemoryEntity();
        memory.setId(IdUtil.uuid());
        memory.setAgentId(agentId);
        memory.setSourceConversationId(conversationId);
        memory.setMemoryType("summary");
        memory.setContent(content);
        memory.setImportance(3);
        memory.setLastAccessedAt(LocalDateTime.now());
        agentMemoryMapper.insert(memory);
        return List.of(memory);
    }

    public AgentMemoryEntity updateAgentMemoryImportance(String id, Integer importance) {
        agentMemoryMapper.update(null, new LambdaUpdateWrapper<AgentMemoryEntity>()
                .eq(AgentMemoryEntity::getId, id)
                .set(AgentMemoryEntity::getImportance, importance));
        return agentMemoryMapper.selectById(id);
    }

    public AgentMemoryEntity removeAgentMemory(String id) {
        AgentMemoryEntity existing = agentMemoryMapper.selectById(id);
        if (existing != null) {
            agentMemoryMapper.deleteById(id);
        }
        return existing;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
