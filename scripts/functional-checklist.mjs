const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
const consoleBaseUrl = process.env.CONSOLE_BASE_URL ?? 'http://127.0.0.1:5173';
const runLlm = (process.env.CHECKLIST_RUN_LLM ?? '1') !== '0';

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

async function checkConsolePage(path) {
  const response = await fetch(`${consoleBaseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

async function run() {
  let providers = [];
  let skills = [];
  let agents = [];
  let selectedAgent = null;

  try {
    providers = await requestApi('/llm-providers');
    record('A1 Provider list', Array.isArray(providers) && providers.length > 0, `count=${providers.length}`);
  } catch (error) {
    record('A1 Provider list', false, error.message);
  }

  try {
    skills = await requestApi('/skills');
    record('A2 Skill list', Array.isArray(skills) && skills.length > 0, `count=${skills.length}`);
  } catch (error) {
    record('A2 Skill list', false, error.message);
  }

  try {
    agents = await requestApi('/agents');
    selectedAgent = agents.find((agent) => agent.status === 'active') ?? agents[0] ?? null;
    record('A3 Agent list', Array.isArray(agents) && agents.length > 0, `count=${agents.length}`);
  } catch (error) {
    record('A3 Agent list', false, error.message);
  }

  let conversationId;
  if (selectedAgent) {
    try {
      const conversation = await requestApi('/conversations', {
        method: 'POST',
        body: JSON.stringify({ agentId: selectedAgent.id, title: `Checklist-${Date.now()}` }),
      });
      conversationId = conversation.id;
      record('A4 Create conversation', Boolean(conversationId), conversationId);
    } catch (error) {
      record('A4 Create conversation', false, error.message);
    }
  } else {
    record('A4 Create conversation', false, 'no agent available');
  }

  let traceId;
  if (selectedAgent && runLlm) {
    try {
      const runResult = await requestApi(`/agents/${selectedAgent.id}/run`, {
        method: 'POST',
        body: JSON.stringify({
          input: '请用一句话确认升级联调是否通过。',
          conversationId,
        }),
      });
      traceId = runResult.traceId;
      record('A5 Runtime run', runResult.status === 'succeeded', runResult.status);
    } catch (error) {
      record('A5 Runtime run', false, error.message);
    }
  } else {
    record('A5 Runtime run', true, 'skipped');
  }

  if (traceId) {
    try {
      const trace = await requestApi(`/traces/${traceId}`);
      const stepCount = Array.isArray(trace.steps) ? trace.steps.length : 0;
      record('A6 Trace details', stepCount > 0, `steps=${stepCount}`);
    } catch (error) {
      record('A6 Trace details', false, error.message);
    }
  }

  try {
    const base = await requestApi('/knowledge/bases', {
      method: 'POST',
      body: JSON.stringify({ name: `Checklist KB ${Date.now()}` }),
    });
    await requestApi(`/knowledge/bases/${base.id}/documents/manual`, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Checklist Doc',
        content: '员工连续旷工三天属于严重违纪，可解除劳动合同。',
      }),
    });
    const retrievals = await requestApi('/knowledge/retrieve', {
      method: 'POST',
      body: JSON.stringify({ query: '什么情况可以解除劳动合同', limit: 3 }),
    });
    record('A7 Knowledge retrieve', Array.isArray(retrievals) && retrievals.length > 0, `hits=${retrievals.length}`);
  } catch (error) {
    record('A7 Knowledge retrieve', false, error.message);
  }

  try {
    const server = await requestApi('/mcp/servers', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Checklist MCP',
        code: `check-${Date.now()}`,
        transportType: 'http',
        endpoint: 'http://127.0.0.1:8800/mcp',
      }),
    });
    const discovered = await requestApi(`/mcp/servers/${server.id}/discover`, { method: 'POST' });
    await requestApi(`/mcp/servers/${server.id}`, { method: 'DELETE' });
    record('B1 MCP register/discover/delete', Array.isArray(discovered.capabilities), `capabilities=${discovered.capabilities.length}`);
  } catch (error) {
    record('B1 MCP register/discover/delete', false, error.message);
  }

  try {
    await requestApi('/rag/index', {
      method: 'POST',
      body: JSON.stringify({
        documentId: `check-doc-${Date.now()}`,
        rawText: 'RAG checklist testing verifies upgraded architecture functionality.',
      }),
    });
    const ragResults = await requestApi('/rag/retrieve', {
      method: 'POST',
      body: JSON.stringify({ query: 'checklist', limit: 2 }),
    });
    record('C1 RAG index/retrieve', Array.isArray(ragResults) && ragResults.length > 0, `hits=${ragResults.length}`);
  } catch (error) {
    record('C1 RAG index/retrieve', false, error.message);
  }

  try {
    const task = await requestApi('/hitl/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Checklist HITL task',
        taskType: 'approval',
        sourceType: 'workflow',
        sourceId: 'checklist',
        payload: { reason: 'qa' },
      }),
    });
    const updated = await requestApi(`/hitl/tasks/${task.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    record('D1 HITL create/update', updated.status === 'approved', updated.status);
  } catch (error) {
    record('D1 HITL create/update', false, error.message);
  }

  try {
    await checkConsolePage('/workspace');
    await checkConsolePage('/agents');
    record('FE1 Console routes', true, 'workspace + agents reachable');
  } catch (error) {
    record('FE1 Console routes', false, error.message);
  }

  const failed = results.filter((item) => !item.ok);
  console.log('\nChecklist finished.');
  console.log(`Passed: ${results.length - failed.length}/${results.length}`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
