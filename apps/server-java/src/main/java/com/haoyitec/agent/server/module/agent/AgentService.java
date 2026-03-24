package com.haoyitec.agent.server.module.agent;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.haoyitec.agent.server.common.exception.BizException;
import com.haoyitec.agent.server.common.util.IdUtil;
import com.haoyitec.agent.server.common.util.JsonUtil;
import com.haoyitec.agent.server.domain.entity.AgentEntity;
import com.haoyitec.agent.server.domain.entity.AgentMemoryEntity;
import com.haoyitec.agent.server.domain.entity.ExecutionEntity;
import com.haoyitec.agent.server.domain.entity.SkillEntity;
import com.haoyitec.agent.server.domain.mapper.AgentMapper;
import com.haoyitec.agent.server.domain.mapper.AgentMemoryMapper;
import com.haoyitec.agent.server.domain.mapper.ConversationMapper;
import com.haoyitec.agent.server.domain.mapper.ConversationMemorySnapshotMapper;
import com.haoyitec.agent.server.domain.mapper.ExecutionMapper;
import com.haoyitec.agent.server.domain.mapper.ExecutionTraceMapper;
import com.haoyitec.agent.server.domain.mapper.KnowledgeRetrievalLogMapper;
import com.haoyitec.agent.server.domain.mapper.SkillMapper;
import com.haoyitec.agent.server.module.conversation.ConversationService;
import com.haoyitec.agent.server.module.memory.MemoryService;
import com.haoyitec.agent.server.module.runtime.RuntimeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

@Service
@RequiredArgsConstructor
public class AgentService {

    private final AgentMapper agentMapper;
    private final ExecutionMapper executionMapper;
    private final ConversationMapper conversationMapper;
    private final ConversationMemorySnapshotMapper snapshotMapper;
    private final AgentMemoryMapper agentMemoryMapper;
    private final ExecutionTraceMapper traceMapper;
    private final KnowledgeRetrievalLogMapper retrievalLogMapper;
    private final SkillMapper skillMapper;
    private final ConversationService conversationService;
    private final MemoryService memoryService;
    private final RuntimeService runtimeService;

    public List<AgentEntity> list() {
        return agentMapper.selectList(new LambdaQueryWrapper<AgentEntity>()
                .orderByDesc(AgentEntity::getUpdatedAt));
    }

    public AgentEntity getById(String id) {
        AgentEntity agent = agentMapper.selectById(id);
        if (agent == null) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Agent not found");
        }
        return agent;
    }

    public AgentEntity create(Map<String, Object> input) {
        AgentEntity agent = new AgentEntity();
        agent.setId(IdUtil.uuid());
        agent.setName(value(input, "name"));
        agent.setDescription(value(input, "description"));
        agent.setStatus(value(input, "status") == null ? "draft" : value(input, "status"));
        agent.setLlmProviderId(value(input, "llmProviderId"));
        agent.setSystemPrompt(value(input, "systemPrompt"));
        agent.setMaxSteps(intValue(input.get("maxSteps"), 6));
        agent.setTimeoutMs(intValue(input.get("timeoutMs"), 60000));
        List<String> skillIds = normalizeSkillIds(input.get("skillIds"));
        validateActiveSkillIds(skillIds);
        agent.setSkillIds(JsonUtil.toJson(skillIds));

        if (agent.getName() == null || agent.getLlmProviderId() == null) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "name 和 llmProviderId 必填");
        }

        agentMapper.insert(agent);
        return agent;
    }

    public AgentEntity update(String id, Map<String, Object> input) {
        AgentEntity existing = getById(id);
        AgentEntity update = new AgentEntity();
        update.setId(id);
        if (input.containsKey("name")) update.setName(value(input, "name"));
        if (input.containsKey("description")) update.setDescription(value(input, "description"));
        if (input.containsKey("status")) update.setStatus(value(input, "status"));
        if (input.containsKey("llmProviderId")) update.setLlmProviderId(value(input, "llmProviderId"));
        if (input.containsKey("systemPrompt")) update.setSystemPrompt(value(input, "systemPrompt"));
        if (input.containsKey("maxSteps")) update.setMaxSteps(intValue(input.get("maxSteps"), existing.getMaxSteps() == null ? 6 : existing.getMaxSteps()));
        if (input.containsKey("timeoutMs")) update.setTimeoutMs(intValue(input.get("timeoutMs"), existing.getTimeoutMs() == null ? 60000 : existing.getTimeoutMs()));
        if (input.containsKey("skillIds")) {
            List<String> skillIds = normalizeSkillIds(input.get("skillIds"));
            validateActiveSkillIds(skillIds);
            update.setSkillIds(JsonUtil.toJson(skillIds));
        }
        agentMapper.updateById(update);
        return getById(id);
    }

    public AgentEntity updateStatus(String id, String status) {
        getById(id);
        agentMapper.update(null, new LambdaUpdateWrapper<AgentEntity>()
                .eq(AgentEntity::getId, id)
                .set(AgentEntity::getStatus, status));
        return getById(id);
    }

    @Transactional(rollbackFor = Exception.class)
    public AgentEntity remove(String id) {
        AgentEntity existing = getById(id);

        List<String> conversationIds = conversationMapper.selectList(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.ConversationEntity>()
                        .eq(com.haoyitec.agent.server.domain.entity.ConversationEntity::getAgentId, id)
                        .select(com.haoyitec.agent.server.domain.entity.ConversationEntity::getId))
                .stream()
                .map(com.haoyitec.agent.server.domain.entity.ConversationEntity::getId)
                .toList();

        if (!conversationIds.isEmpty()) {
            snapshotMapper.delete(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.ConversationMemorySnapshotEntity>()
                    .in(com.haoyitec.agent.server.domain.entity.ConversationMemorySnapshotEntity::getConversationId, conversationIds));
        }

        List<String> executionIds = executionMapper.selectList(new LambdaQueryWrapper<ExecutionEntity>()
                        .eq(ExecutionEntity::getAgentId, id)
                        .select(ExecutionEntity::getId))
                .stream().map(ExecutionEntity::getId).toList();

        if (!executionIds.isEmpty()) {
            traceMapper.delete(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.ExecutionTraceEntity>()
                    .in(com.haoyitec.agent.server.domain.entity.ExecutionTraceEntity::getExecutionId, executionIds));
            retrievalLogMapper.delete(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.KnowledgeRetrievalLogEntity>()
                    .in(com.haoyitec.agent.server.domain.entity.KnowledgeRetrievalLogEntity::getExecutionId, executionIds));
        }

        executionMapper.delete(new LambdaQueryWrapper<ExecutionEntity>()
                .eq(ExecutionEntity::getAgentId, id));
        conversationMapper.delete(new LambdaQueryWrapper<com.haoyitec.agent.server.domain.entity.ConversationEntity>()
                .eq(com.haoyitec.agent.server.domain.entity.ConversationEntity::getAgentId, id));
        agentMemoryMapper.delete(new LambdaQueryWrapper<AgentMemoryEntity>()
                .eq(AgentMemoryEntity::getAgentId, id));
        agentMapper.deleteById(id);
        return existing;
    }

    public List<ExecutionEntity> listExecutions(String agentId) {
        return executionMapper.selectList(new LambdaQueryWrapper<ExecutionEntity>()
                .eq(ExecutionEntity::getAgentId, agentId)
                .orderByDesc(ExecutionEntity::getCreatedAt));
    }

    public List<Map<String, Object>> listConversations(String agentId) {
        return conversationService.listByAgent(agentId);
    }

    public List<AgentMemoryEntity> listMemories(String agentId) {
        return memoryService.listAgentMemories(agentId);
    }

    public AgentMemoryEntity updateMemoryImportance(String agentId, String memoryId, Integer importance) {
        AgentMemoryEntity memory = agentMemoryMapper.selectById(memoryId);
        if (memory == null || !agentId.equals(memory.getAgentId())) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Memory not found");
        }
        return memoryService.updateAgentMemoryImportance(memoryId, importance);
    }

    public AgentMemoryEntity deleteMemory(String agentId, String memoryId) {
        AgentMemoryEntity memory = agentMemoryMapper.selectById(memoryId);
        if (memory == null || !agentId.equals(memory.getAgentId())) {
            throw new BizException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Memory not found");
        }
        return memoryService.removeAgentMemory(memoryId);
    }

    public Map<String, Object> run(String agentId,
                                   String input,
                                   Integer timeoutMs,
                                   String conversationId,
                                   String conversationTitle,
                                   Consumer<Map<String, Object>> eventConsumer) {
        return runtimeService.run(agentId, input, timeoutMs, conversationId, conversationTitle, eventConsumer);
    }

    private String value(Map<String, Object> input, String key) {
        Object value = input.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private Integer intValue(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.parseInt(String.valueOf(value));
    }

    private List<String> normalizeSkillIds(Object raw) {
        if (raw == null) {
            return List.of();
        }
        if (raw instanceof List<?> list) {
            List<String> result = new ArrayList<>();
            for (Object item : list) {
                if (item != null && StringUtils.hasText(String.valueOf(item))) {
                    result.add(String.valueOf(item));
                }
            }
            return result;
        }
        if (raw instanceof String text) {
            if (!StringUtils.hasText(text)) {
                return List.of();
            }
            String trimmed = text.trim();
            if (trimmed.startsWith("[")) {
                return JsonUtil.toStringList(trimmed);
            }
            List<String> result = new ArrayList<>();
            for (String item : trimmed.split(",")) {
                if (StringUtils.hasText(item)) {
                    result.add(item.trim());
                }
            }
            return result;
        }
        return List.of();
    }

    private void validateActiveSkillIds(List<String> skillIds) {
        if (skillIds == null || skillIds.isEmpty()) {
            return;
        }
        List<SkillEntity> activeSkills = skillMapper.selectList(new LambdaQueryWrapper<SkillEntity>()
                .in(SkillEntity::getId, skillIds)
                .eq(SkillEntity::getStatus, "active"));
        Set<String> activeIds = activeSkills.stream().map(SkillEntity::getId).collect(HashSet::new, HashSet::add, HashSet::addAll);
        List<String> invalidIds = new ArrayList<>();
        for (String skillId : skillIds) {
            if (!activeIds.contains(skillId)) {
                invalidIds.add(skillId);
            }
        }
        if (!invalidIds.isEmpty()) {
            throw new BizException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR",
                    "存在不可绑定的技能（不存在或非启用状态）: " + String.join(",", invalidIds));
        }
    }
}
