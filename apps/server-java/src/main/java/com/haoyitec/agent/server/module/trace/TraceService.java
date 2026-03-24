package com.haoyitec.agent.server.module.trace;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.haoyitec.agent.server.domain.entity.ExecutionEntity;
import com.haoyitec.agent.server.domain.entity.ExecutionTraceEntity;
import com.haoyitec.agent.server.domain.mapper.ExecutionMapper;
import com.haoyitec.agent.server.domain.mapper.ExecutionTraceMapper;
import com.haoyitec.agent.server.module.knowledge.KnowledgeRetrievalItem;
import com.haoyitec.agent.server.module.knowledge.KnowledgeRetrievalService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class TraceService {

    private final ExecutionTraceMapper traceMapper;
    private final ExecutionMapper executionMapper;
    private final KnowledgeRetrievalService retrievalService;

    public Map<String, Object> getTraceDetails(String traceId) {
        List<ExecutionTraceEntity> traces = traceMapper.selectList(new LambdaQueryWrapper<ExecutionTraceEntity>()
                .eq(ExecutionTraceEntity::getTraceId, traceId)
                .orderByAsc(ExecutionTraceEntity::getStepIndex));

        ExecutionEntity execution = executionMapper.selectOne(new LambdaQueryWrapper<ExecutionEntity>()
                .eq(ExecutionEntity::getTraceId, traceId)
                .last("LIMIT 1"));

        List<KnowledgeRetrievalItem> retrievals = execution == null
                ? List.of()
                : retrievalService.listByExecution(execution.getId());
        List<KnowledgeRetrievalItem> citedRetrievals = execution == null
                ? List.of()
                : retrievalService.listCitedByAnswer(retrievals, execution.getOutputText());

        Map<String, Object> result = new HashMap<>();
        result.put("execution", execution);
        result.put("steps", traces);
        result.put("retrievals", retrievals);
        result.put("citedRetrievals", citedRetrievals);
        return result;
    }
}
