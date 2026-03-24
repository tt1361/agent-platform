const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:8888/api/v1';
const consoleBaseUrl = process.env.CONSOLE_BASE_URL ?? 'http://127.0.0.1:5173';

const results = [];

function record(name, ok, details) {
  results.push({ name, ok, details });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}${details ? ` - ${details}` : ''}`);
}

async function requestApi(path, init) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body?.error?.message ?? response.statusText;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  if (!body?.success) {
    throw new Error(body?.error?.message ?? 'API returned unsuccessful response');
  }

  return body.data;
}

async function run() {
  const providers = await requestApi('/llm-providers');
  const skills = await requestApi('/skills');
  const agents = await requestApi('/agents');
  const preferredProvider =
    providers.find((item) => item.providerType === 'qwen') ??
    providers.find((item) => item.providerType === 'minimax') ??
    providers.find((item) => item.status === 'active') ??
    providers[0];
  const providerId = preferredProvider?.id;
  const activeSkillIds = skills.filter((item) => item.status === 'active').map((item) => item.id);

  if (!providerId) {
    throw new Error('没有可用模型提供商，无法继续按钮测试');
  }

  let tempAgent;
  let tempSkill;
  let tempConversation;
  let tempKnowledgeBase;
  let tempKnowledgeDoc;
  let tempMcpServer;
  let tempHitlTask;

  try {
    tempAgent = await requestApi('/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: `按钮测试智能体-${Date.now()}`,
        description: '用于按钮功能自动验证',
        llmProviderId: providerId,
        skillIds: activeSkillIds,
        maxSteps: 6,
        timeoutMs: 60000,
        status: 'draft',
        systemPrompt: '你是一个测试助手，请简要回复。',
      }),
    });
    record('Agents: 新建', Boolean(tempAgent?.id), tempAgent?.id);

    const viewedAgent = await requestApi(`/agents/${tempAgent.id}`);
    record('Agents: 查看', viewedAgent.id === tempAgent.id, viewedAgent.name);

    const activatedAgent = await requestApi(`/agents/${tempAgent.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });
    record('Agents: 启用', activatedAgent.status === 'active', activatedAgent.status);

    const archivedAgent = await requestApi(`/agents/${tempAgent.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived' }),
    });
    record('Agents: 归档', archivedAgent.status === 'archived', archivedAgent.status);

    const reactivatedAgent = await requestApi(`/agents/${tempAgent.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });
    record('Agents: 重新启用', reactivatedAgent.status === 'active', reactivatedAgent.status);

    const switchedModelAgent = await requestApi(`/agents/${tempAgent.id}`, {
      method: 'PUT',
      body: JSON.stringify({ llmProviderId: providerId }),
    });
    record('Workspace: 切换模型', switchedModelAgent.llmProviderId === providerId, switchedModelAgent.llmProviderId);

    tempConversation = await requestApi('/conversations', {
      method: 'POST',
      body: JSON.stringify({ agentId: tempAgent.id, title: '按钮测试会话' }),
    });
    record('Workspace: 新建会话', Boolean(tempConversation.id), tempConversation.id);

    const renamedConversation = await requestApi(`/conversations/${tempConversation.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: '按钮测试会话-重命名' }),
    });
    record('Workspace: 重命名会话', renamedConversation.title.includes('重命名'), renamedConversation.title);

    const runResult = await requestApi(`/agents/${tempAgent.id}/run`, {
      method: 'POST',
      body: JSON.stringify({ input: '请输出按钮测试通过', conversationId: tempConversation.id }),
    });
    record('Workspace: 发送消息', runResult.status === 'succeeded', runResult.status);

    const trace = await requestApi(`/traces/${runResult.traceId}`);
    record('Executions: 查看 Trace', Array.isArray(trace.steps) && trace.steps.length > 0, `steps=${trace.steps?.length ?? 0}`);

    const providerTest = await requestApi(`/llm-providers/${providerId}/test`, { method: 'POST' });
    record('Providers: 连通测试', providerTest.status === 'ok', providerTest.status);

    tempSkill = await requestApi('/skills', {
      method: 'POST',
      body: JSON.stringify({
        skillKey: `button-test-${Date.now()}`,
        name: '按钮测试技能',
        version: '1.0.0',
        description: '按钮测试技能',
        executorKey: 'echo',
        status: 'active',
        parametersSchema: { type: 'object' },
        returnsSchema: { type: 'object' },
        tags: ['test'],
      }),
    });
    record('Skills: 新建', Boolean(tempSkill.id), tempSkill.id);

    const viewedSkill = await requestApi(`/skills/${tempSkill.id}`);
    record('Skills: 查看', viewedSkill.id === tempSkill.id, viewedSkill.skillKey);

    const deprecatedSkill = await requestApi(`/skills/${tempSkill.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'deprecated' }),
    });
    record('Skills: 弃用', deprecatedSkill.status === 'deprecated', deprecatedSkill.status);

    const enabledSkill = await requestApi(`/skills/${tempSkill.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });
    record('Skills: 启用', enabledSkill.status === 'active', enabledSkill.status);

    tempKnowledgeBase = await requestApi('/knowledge/bases', {
      method: 'POST',
      body: JSON.stringify({ name: `按钮测试知识库-${Date.now()}` }),
    });
    record('Knowledge: 新建知识库', Boolean(tempKnowledgeBase.id), tempKnowledgeBase.id);

    tempKnowledgeDoc = await requestApi(`/knowledge/bases/${tempKnowledgeBase.id}/documents/manual`, {
      method: 'POST',
      body: JSON.stringify({ title: '按钮测试文档', content: '按钮功能测试内容。' }),
    });
    record('Knowledge: 手工录入', Boolean(tempKnowledgeDoc.id), tempKnowledgeDoc.id);

    const downloadInfo = await requestApi(`/knowledge/documents/${tempKnowledgeDoc.id}/download`);
    record('Knowledge: 原文件按钮信息', Boolean(downloadInfo.url), downloadInfo.url);

    const retrievals = await requestApi('/knowledge/retrieve', {
      method: 'POST',
      body: JSON.stringify({ query: '按钮功能测试', limit: 3 }),
    });
    record('Knowledge: 检索', Array.isArray(retrievals) && retrievals.length > 0, `hits=${retrievals.length}`);

    tempMcpServer = await requestApi('/mcp/servers', {
      method: 'POST',
      body: JSON.stringify({
        name: '按钮测试 MCP',
        code: `button-mcp-${Date.now()}`,
        transportType: 'http',
        endpoint: 'http://127.0.0.1:8800/mcp',
      }),
    });
    record('MCP: 新建服务', Boolean(tempMcpServer.id), tempMcpServer.id);

    const discovered = await requestApi(`/mcp/servers/${tempMcpServer.id}/discover`, { method: 'POST' });
    record('MCP: 能力发现', Array.isArray(discovered.capabilities), `capabilities=${discovered.capabilities?.length ?? 0}`);

    await requestApi('/rag/index', {
      method: 'POST',
      body: JSON.stringify({ documentId: `button-rag-${Date.now()}`, rawText: 'button flow verification text.' }),
    });
    const ragResult = await requestApi('/rag/retrieve', {
      method: 'POST',
      body: JSON.stringify({ query: 'verification', limit: 2 }),
    });
    record('RAG: 检索', Array.isArray(ragResult) && ragResult.length > 0, `hits=${ragResult.length}`);

    tempHitlTask = await requestApi('/hitl/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: '按钮测试 HITL',
        taskType: 'approval',
        sourceType: 'workflow',
        sourceId: 'button-checklist',
        payload: { source: 'page-button-checklist' },
      }),
    });
    record('HITL: 新建任务', Boolean(tempHitlTask.id), tempHitlTask.id);

    const approvedTask = await requestApi(`/hitl/tasks/${tempHitlTask.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    record('HITL: 审批按钮流转', approvedTask.status === 'approved', approvedTask.status);

    const pagePaths = ['/agents', '/skills', '/knowledge', '/providers', '/executions', '/workspace'];
    for (const pagePath of pagePaths) {
      const response = await fetch(`${consoleBaseUrl}${pagePath}`);
      record(`Console页面可达: ${pagePath}`, response.ok, `HTTP ${response.status}`);
    }
  } catch (error) {
    record('按钮测试执行', false, error instanceof Error ? error.message : '未知错误');
  } finally {
    if (tempConversation?.id) {
      await requestApi(`/conversations/${tempConversation.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
    if (tempAgent?.id) {
      await requestApi(`/agents/${tempAgent.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
    if (tempSkill?.id) {
      await requestApi(`/skills/${tempSkill.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
    if (tempKnowledgeDoc?.id) {
      await requestApi(`/knowledge/documents/${tempKnowledgeDoc.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
    if (tempKnowledgeBase?.id) {
      await requestApi(`/knowledge/bases/${tempKnowledgeBase.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
    if (tempMcpServer?.id) {
      await requestApi(`/mcp/servers/${tempMcpServer.id}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }

  const failed = results.filter((item) => !item.ok);
  console.log('\nButton checklist finished.');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
