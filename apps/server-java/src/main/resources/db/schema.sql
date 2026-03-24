CREATE TABLE IF NOT EXISTS llm_providers (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  provider_key VARCHAR(100) NOT NULL UNIQUE COMMENT '提供商标识',
  name VARCHAR(255) NOT NULL COMMENT '名称',
  provider_type VARCHAR(50) NOT NULL COMMENT '提供商类型',
  model VARCHAR(255) NOT NULL COMMENT '默认模型Key',
  api_base_url VARCHAR(1024) COMMENT 'API基础地址',
  api_key_masked VARCHAR(255) COMMENT '脱敏后的API密钥',
  config JSON COMMENT '提供商配置(JSON)',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态',
  cost_per_1k_input_tokens DECIMAL(10,6) COMMENT '每千输入Token成本',
  cost_per_1k_output_tokens DECIMAL(10,6) COMMENT '每千输出Token成本',
  last_health_check_at DATETIME COMMENT '最近健康检查时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_llm_providers_status(status),
  INDEX idx_llm_providers_type(provider_type)
);

CREATE TABLE IF NOT EXISTS llm_model_catalog (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  provider_type VARCHAR(50) NOT NULL COMMENT '提供商类型',
  model_key VARCHAR(255) NOT NULL COMMENT '模型Key',
  display_name VARCHAR(255) NOT NULL COMMENT '展示名称',
  capabilities JSON COMMENT '能力标签(JSON)',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态',
  is_hot TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否热门模型',
  sort INT NOT NULL DEFAULT 100 COMMENT '排序值',
  config JSON COMMENT '扩展配置(JSON)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_model_provider(provider_type, model_key),
  INDEX idx_model_catalog_status(status),
  INDEX idx_model_catalog_provider(provider_type, sort)
);

CREATE TABLE IF NOT EXISTS llm_provider_secrets (
  provider_id VARCHAR(36) PRIMARY KEY COMMENT '厂商账号ID',
  secret_ciphertext TEXT NOT NULL COMMENT '密钥密文',
  secret_masked JSON COMMENT '脱敏密钥(JSON)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  CONSTRAINT fk_provider_secrets_provider FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skills (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  skill_key VARCHAR(100) NOT NULL COMMENT '技能标识',
  name VARCHAR(255) NOT NULL COMMENT '名称',
  version VARCHAR(50) NOT NULL COMMENT '版本号',
  description TEXT COMMENT '描述',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态',
  executor_key VARCHAR(100) COMMENT '执行器标识',
  parameters_schema JSON COMMENT '入参Schema(JSON)',
  returns_schema JSON COMMENT '返回Schema(JSON)',
  tags JSON COMMENT '标签(JSON)',
  timeout_ms INT COMMENT '超时时间(毫秒)',
  retry_policy JSON COMMENT '重试策略(JSON)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_skill_key_version(skill_key, version),
  INDEX idx_skills_skill_key(skill_key),
  INDEX idx_skills_status(status)
);

CREATE TABLE IF NOT EXISTS skill_plugin_secrets (
  skill_id VARCHAR(36) PRIMARY KEY COMMENT '技能ID',
  secret_ciphertext TEXT NOT NULL COMMENT '密钥密文',
  secret_masked JSON COMMENT '脱敏密钥(JSON)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  CONSTRAINT fk_skill_plugin_secrets_skill FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  name VARCHAR(255) NOT NULL COMMENT '名称',
  description TEXT COMMENT '描述',
  status VARCHAR(32) NOT NULL DEFAULT 'draft' COMMENT '状态',
  llm_provider_id VARCHAR(36) NOT NULL COMMENT '大模型提供商ID',
  system_prompt TEXT COMMENT '系统提示词',
  max_steps INT NOT NULL DEFAULT 6 COMMENT '最大执行步数',
  timeout_ms INT NOT NULL DEFAULT 60000 COMMENT '超时时间(毫秒)',
  temperature DECIMAL(4,2) COMMENT '温度参数',
  top_p DECIMAL(4,2) COMMENT 'TopP参数',
  skill_ids JSON COMMENT '技能ID列表(JSON)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_agents_status(status),
  INDEX idx_agents_llm_provider(llm_provider_id),
  CONSTRAINT fk_agents_provider FOREIGN KEY (llm_provider_id) REFERENCES llm_providers(id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  agent_id VARCHAR(36) NOT NULL COMMENT '智能体ID',
  title VARCHAR(255) NOT NULL COMMENT '标题',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_conversations_agent(agent_id, updated_at),
  CONSTRAINT fk_conversations_agent FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS executions (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  agent_id VARCHAR(36) NOT NULL COMMENT '智能体ID',
  conversation_id VARCHAR(36) COMMENT '会话ID',
  trace_id VARCHAR(100) NOT NULL UNIQUE COMMENT '链路追踪ID',
  input_text TEXT NOT NULL COMMENT '输入文本',
  output_text TEXT COMMENT '输出文本',
  status VARCHAR(32) NOT NULL DEFAULT 'pending' COMMENT '状态',
  provider_id VARCHAR(36) COMMENT '提供商ID',
  model_key VARCHAR(255) COMMENT '模型Key',
  step_count INT COMMENT '执行步数',
  tokens_used INT COMMENT '消耗Token数',
  cost DECIMAL(10,6) COMMENT '调用成本',
  started_at DATETIME COMMENT '开始时间',
  ended_at DATETIME COMMENT '结束时间',
  duration_ms INT COMMENT '耗时(毫秒)',
  error_code VARCHAR(100) COMMENT '错误码',
  error_message TEXT COMMENT '错误信息',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_executions_agent(agent_id, created_at),
  INDEX idx_executions_conversation(conversation_id, created_at),
  INDEX idx_executions_status(status),
  CONSTRAINT fk_executions_agent FOREIGN KEY (agent_id) REFERENCES agents(id),
  CONSTRAINT fk_executions_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_executions_provider FOREIGN KEY (provider_id) REFERENCES llm_providers(id)
);

CREATE TABLE IF NOT EXISTS execution_traces (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  execution_id VARCHAR(36) NOT NULL COMMENT '执行ID',
  trace_id VARCHAR(100) NOT NULL COMMENT '链路追踪ID',
  step_index INT NOT NULL COMMENT '步骤序号',
  step_type VARCHAR(50) NOT NULL COMMENT '步骤类型',
  content TEXT NOT NULL COMMENT '内容',
  tool_name VARCHAR(255) COMMENT '工具名称',
  tool_input JSON COMMENT '工具输入(JSON)',
  tool_output JSON COMMENT '工具输出(JSON)',
  duration_ms INT COMMENT '耗时(毫秒)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_execution_traces_execution(execution_id, step_index),
  INDEX idx_execution_traces_trace(trace_id),
  CONSTRAINT fk_execution_traces_execution FOREIGN KEY (execution_id) REFERENCES executions(id)
);

CREATE TABLE IF NOT EXISTS conversation_memory_snapshots (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  conversation_id VARCHAR(36) NOT NULL COMMENT '会话ID',
  summary TEXT COMMENT '摘要',
  key_facts JSON COMMENT '关键事实(JSON)',
  open_tasks JSON COMMENT '待办事项(JSON)',
  user_preferences JSON COMMENT '用户偏好(JSON)',
  message_count INT DEFAULT 0 COMMENT '消息数量',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_conversation_memory(conversation_id, updated_at),
  CONSTRAINT fk_snapshot_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  agent_id VARCHAR(36) NOT NULL COMMENT '智能体ID',
  memory_type VARCHAR(32) NOT NULL COMMENT '记忆类型',
  content TEXT NOT NULL COMMENT '内容',
  importance INT NOT NULL DEFAULT 1 COMMENT '重要度',
  source_conversation_id VARCHAR(36) COMMENT '来源会话ID',
  last_accessed_at DATETIME COMMENT '最近访问时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_agent_memories_agent(agent_id, memory_type),
  INDEX idx_agent_memories_importance(importance, updated_at),
  CONSTRAINT fk_agent_memories_agent FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  name VARCHAR(255) NOT NULL COMMENT '名称',
  description TEXT COMMENT '描述',
  status VARCHAR(32) NOT NULL DEFAULT 'active' COMMENT '状态',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_knowledge_bases_status(status)
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  knowledge_base_id VARCHAR(36) NOT NULL COMMENT '知识库ID',
  title VARCHAR(255) NOT NULL COMMENT '标题',
  source_type VARCHAR(32) NOT NULL COMMENT '来源类型',
  source_uri VARCHAR(1024) COMMENT '来源地址',
  file_name VARCHAR(255) COMMENT '文件名',
  file_path VARCHAR(1024) COMMENT '文件路径',
  mime_type VARCHAR(255) COMMENT '文件MIME类型',
  file_size INT COMMENT '文件大小(字节)',
  raw_text LONGTEXT COMMENT '原始文本',
  status VARCHAR(32) NOT NULL DEFAULT 'processing' COMMENT '状态',
  chunk_count INT NOT NULL DEFAULT 0 COMMENT '分块数量',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_knowledge_documents_base(knowledge_base_id, status),
  INDEX idx_knowledge_documents_source(source_type),
  CONSTRAINT fk_knowledge_documents_base FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  document_id VARCHAR(36) NOT NULL COMMENT '文档ID',
  chunk_index INT NOT NULL COMMENT '分块序号',
  content LONGTEXT NOT NULL COMMENT '内容',
  keywords JSON COMMENT '关键词(JSON)',
  token_count INT NOT NULL DEFAULT 0 COMMENT 'Token数量',
  char_count INT NOT NULL DEFAULT 0 COMMENT '字符数量',
  metadata JSON COMMENT '元数据(JSON)',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_knowledge_chunks_document(document_id, chunk_index),
  CONSTRAINT fk_knowledge_chunks_document FOREIGN KEY (document_id) REFERENCES knowledge_documents(id)
);

CREATE TABLE IF NOT EXISTS knowledge_retrieval_logs (
  id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
  execution_id VARCHAR(36) NOT NULL COMMENT '执行ID',
  query TEXT NOT NULL COMMENT '检索查询文本',
  knowledge_base_id VARCHAR(36) NOT NULL COMMENT '知识库ID',
  document_id VARCHAR(36) NOT NULL COMMENT '文档ID',
  chunk_id VARCHAR(36) NOT NULL COMMENT '分块ID',
  score DECIMAL(10,6) COMMENT '相关度分数',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_knowledge_retrieval_execution(execution_id, created_at),
  INDEX idx_knowledge_retrieval_base(knowledge_base_id, created_at),
  CONSTRAINT fk_knowledge_retrieval_execution FOREIGN KEY (execution_id) REFERENCES executions(id),
  CONSTRAINT fk_knowledge_retrieval_base FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id),
  CONSTRAINT fk_knowledge_retrieval_document FOREIGN KEY (document_id) REFERENCES knowledge_documents(id),
  CONSTRAINT fk_knowledge_retrieval_chunk FOREIGN KEY (chunk_id) REFERENCES knowledge_chunks(id)
);
