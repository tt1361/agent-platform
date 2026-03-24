package com.haoyitec.agent.server.module.conversation;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.domain.entity.ConversationEntity;
import com.haoyitec.agent.server.domain.entity.ExecutionEntity;
import com.haoyitec.agent.server.domain.mapper.ConversationMapper;
import com.haoyitec.agent.server.domain.mapper.ConversationMemorySnapshotMapper;
import com.haoyitec.agent.server.domain.mapper.ExecutionMapper;
import com.haoyitec.agent.server.domain.mapper.ExecutionTraceMapper;
import com.haoyitec.agent.server.domain.mapper.KnowledgeRetrievalLogMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ConversationService {

    private final ConversationMapper conversationMapper;
    private final ConversationMemorySnapshotMapper snapshotMapper;
    private final ExecutionMapper executionMapper;
    private final ExecutionTraceMapper executionTraceMapper;
    private final KnowledgeRetrievalLogMapper retrievalLogMapper;

    public List<Map<String, Object>> list() {
        List<ConversationEntity> conversations = conversationMapper.selectList(new LambdaQueryWrapper<ConversationEntity>()
                .orderByDesc(ConversationEntity::getUpdatedAt));
        return enrichWithExecutions(conversations);
    }

    public List<Map<String, Object>> listByAgent(String agentId) {
        List<ConversationEntity> conversations = conversationMapper.selectList(new LambdaQueryWrapper<ConversationEntity>()
                .eq(ConversationEntity::getAgentId, agentId)
                .orderByDesc(ConversationEntity::getUpdatedAt));
        return enrichWithExecutions(conversations);
    }

    public Map<String, Object> getById(String id) {
        ConversationEntity entity = getEntityById(id);
        Map<String, List<ExecutionEntity>> executionMap = loadExecutionsByConversationIds(List.of(id));
        List<ExecutionEntity> executions = executionMap.getOrDefault(id, List.of());
        return toMap(entity, executions);
    }

    public ConversationEntity getEntityById(String id) {
        ConversationEntity entity = conversationMapper.selectById(id);
        if (entity == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Conversation not found");
        }
        return entity;
    }

    public ConversationEntity create(String agentId, String title) {
        ConversationEntity entity = new ConversationEntity();
        entity.setId(IdUtil.uuid());
        entity.setAgentId(agentId);
        entity.setTitle(title == null || title.isBlank() ? "新会话" : title);
        conversationMapper.insert(entity);
        return entity;
    }

    public void touch(String id) {
        conversationMapper.update(null, new LambdaUpdateWrapper<ConversationEntity>()
                .eq(ConversationEntity::getId, id)
                .set(ConversationEntity::getUpdatedAt, LocalDateTime.now()));
    }

    public ConversationEntity update(String id, Map<String, Object> input) {
        ConversationEntity existing = getEntityById(id);
        ConversationEntity update = new ConversationEntity();
        update.setId(id);
        if (input.containsKey("title")) {
            update.setTitle((String) input.get("title"));
        }
        conversationMapper.updateById(update);
        return conversationMapper.selectById(existing.getId());
    }

    @Transactional(rollbackFor = Exception.class)
    public ConversationEntity remove(String id) {
        ConversationEntity existing = getEntityById(id);

        snapshotMapper.delete(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.ConversationMemorySnapshotEntity>()
                .eq(com.haoyitec.agent.server.domain.entity.ConversationMemorySnapshotEntity::getConversationId, id));

        List<String> executionIds = executionMapper.selectList(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.ExecutionEntity>()
                        .eq(com.haoyitec.agent.server.domain.entity.ExecutionEntity::getConversationId, id)
                        .select(com.haoyitec.agent.server.domain.entity.ExecutionEntity::getId))
                .stream()
                .map(com.haoyitec.agent.server.domain.entity.ExecutionEntity::getId)
                .toList();

        if (!executionIds.isEmpty()) {
            executionTraceMapper.delete(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.ExecutionTraceEntity>()
                    .in(com.haoyitec.agent.server.domain.entity.ExecutionTraceEntity::getExecutionId, executionIds));
            retrievalLogMapper.delete(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.KnowledgeRetrievalLogEntity>()
                    .in(com.haoyitec.agent.server.domain.entity.KnowledgeRetrievalLogEntity::getExecutionId, executionIds));
        }

        executionMapper.delete(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.ExecutionEntity>()
                .eq(com.haoyitec.agent.server.domain.entity.ExecutionEntity::getConversationId, id));
        conversationMapper.deleteById(id);
        return existing;
    }

    private List<Map<String, Object>> enrichWithExecutions(List<ConversationEntity> conversations) {
        if (conversations.isEmpty()) {
            return List.of();
        }
        List<String> conversationIds = conversations.stream().map(ConversationEntity::getId).toList();
        Map<String, List<ExecutionEntity>> executionMap = loadExecutionsByConversationIds(conversationIds);
        List<Map<String, Object>> result = new ArrayList<>();
        for (ConversationEntity conversation : conversations) {
            List<ExecutionEntity> executions = executionMap.getOrDefault(conversation.getId(), List.of());
            result.add(toMap(conversation, executions));
        }
        return result;
    }

    private Map<String, List<ExecutionEntity>> loadExecutionsByConversationIds(List<String> conversationIds) {
        if (conversationIds == null || conversationIds.isEmpty()) {
            return Map.of();
        }
        List<ExecutionEntity> executions = executionMapper.selectList(new LambdaQueryWrapper<ExecutionEntity>()
                .in(ExecutionEntity::getConversationId, conversationIds)
                .orderByAsc(ExecutionEntity::getCreatedAt));
        Map<String, List<ExecutionEntity>> executionMap = new HashMap<>();
        for (ExecutionEntity execution : executions) {
            executionMap.computeIfAbsent(execution.getConversationId(), key -> new ArrayList<>()).add(execution);
        }
        return executionMap;
    }

    private Map<String, Object> toMap(ConversationEntity entity, List<ExecutionEntity> executions) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", entity.getId());
        map.put("agentId", entity.getAgentId());
        map.put("title", entity.getTitle());
        map.put("createdAt", entity.getCreatedAt());
        map.put("updatedAt", entity.getUpdatedAt());
        map.put("executions", executions == null ? List.of() : executions);
        return map;
    }
}
