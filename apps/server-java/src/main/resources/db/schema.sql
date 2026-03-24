CREATE TABLE IF NOT EXISTS llm_providers (
  id VARCHAR(36) PRIMARY KEY,
  provider_key VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  provider_type VARCHAR(50) NOT NULL,
  model VARCHAR(255) NOT NULL,
  api_base_url VARCHAR(1024),
  api_key_masked VARCHAR(255),
  config JSON,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  cost_per_1k_input_tokens DECIMAL(10,6),
  cost_per_1k_output_tokens DECIMAL(10,6),
  last_health_check_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_llm_providers_status(status),
  INDEX idx_llm_providers_type(provider_type)
);

CREATE TABLE IF NOT EXISTS skills (
  id VARCHAR(36) PRIMARY KEY,
  skill_key VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  executor_key VARCHAR(100),
  parameters_schema JSON,
  returns_schema JSON,
  tags JSON,
  timeout_ms INT,
  retry_policy JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_skill_key_version(skill_key, version),
  INDEX idx_skills_skill_key(skill_key),
  INDEX idx_skills_status(status)
);

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  llm_provider_id VARCHAR(36) NOT NULL,
  system_prompt TEXT,
  max_steps INT NOT NULL DEFAULT 6,
  timeout_ms INT NOT NULL DEFAULT 60000,
  temperature DECIMAL(4,2),
  top_p DECIMAL(4,2),
  skill_ids JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agents_status(status),
  INDEX idx_agents_llm_provider(llm_provider_id),
  CONSTRAINT fk_agents_provider FOREIGN KEY (llm_provider_id) REFERENCES llm_providers(id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(36) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_conversations_agent(agent_id, updated_at),
  CONSTRAINT fk_conversations_agent FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS executions (
  id VARCHAR(36) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL,
  conversation_id VARCHAR(36),
  trace_id VARCHAR(100) NOT NULL UNIQUE,
  input_text TEXT NOT NULL,
  output_text TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  provider_id VARCHAR(36),
  step_count INT,
  tokens_used INT,
  cost DECIMAL(10,6),
  started_at DATETIME,
  ended_at DATETIME,
  duration_ms INT,
  error_code VARCHAR(100),
  error_message TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_executions_agent(agent_id, created_at),
  INDEX idx_executions_conversation(conversation_id, created_at),
  INDEX idx_executions_status(status),
  CONSTRAINT fk_executions_agent FOREIGN KEY (agent_id) REFERENCES agents(id),
  CONSTRAINT fk_executions_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  CONSTRAINT fk_executions_provider FOREIGN KEY (provider_id) REFERENCES llm_providers(id)
);

CREATE TABLE IF NOT EXISTS execution_traces (
  id VARCHAR(36) PRIMARY KEY,
  execution_id VARCHAR(36) NOT NULL,
  trace_id VARCHAR(100) NOT NULL,
  step_index INT NOT NULL,
  step_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  tool_name VARCHAR(255),
  tool_input JSON,
  tool_output JSON,
  duration_ms INT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_execution_traces_execution(execution_id, step_index),
  INDEX idx_execution_traces_trace(trace_id),
  CONSTRAINT fk_execution_traces_execution FOREIGN KEY (execution_id) REFERENCES executions(id)
);

CREATE TABLE IF NOT EXISTS conversation_memory_snapshots (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL,
  summary TEXT,
  key_facts JSON,
  open_tasks JSON,
  user_preferences JSON,
  message_count INT DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_conversation_memory(conversation_id, updated_at),
  CONSTRAINT fk_snapshot_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id VARCHAR(36) PRIMARY KEY,
  agent_id VARCHAR(36) NOT NULL,
  memory_type VARCHAR(32) NOT NULL,
  content TEXT NOT NULL,
  importance INT NOT NULL DEFAULT 1,
  source_conversation_id VARCHAR(36),
  last_accessed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_agent_memories_agent(agent_id, memory_type),
  INDEX idx_agent_memories_importance(importance, updated_at),
  CONSTRAINT fk_agent_memories_agent FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_knowledge_bases_status(status)
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id VARCHAR(36) PRIMARY KEY,
  knowledge_base_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  source_uri VARCHAR(1024),
  file_name VARCHAR(255),
  file_path VARCHAR(1024),
  mime_type VARCHAR(255),
  file_size INT,
  raw_text LONGTEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'processing',
  chunk_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_knowledge_documents_base(knowledge_base_id, status),
  INDEX idx_knowledge_documents_source(source_type),
  CONSTRAINT fk_knowledge_documents_base FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id VARCHAR(36) PRIMARY KEY,
  document_id VARCHAR(36) NOT NULL,
  chunk_index INT NOT NULL,
  content LONGTEXT NOT NULL,
  keywords JSON,
  token_count INT NOT NULL DEFAULT 0,
  char_count INT NOT NULL DEFAULT 0,
  metadata JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_knowledge_chunks_document(document_id, chunk_index),
  CONSTRAINT fk_knowledge_chunks_document FOREIGN KEY (document_id) REFERENCES knowledge_documents(id)
);

CREATE TABLE IF NOT EXISTS knowledge_retrieval_logs (
  id VARCHAR(36) PRIMARY KEY,
  execution_id VARCHAR(36) NOT NULL,
  query TEXT NOT NULL,
  knowledge_base_id VARCHAR(36) NOT NULL,
  document_id VARCHAR(36) NOT NULL,
  chunk_id VARCHAR(36) NOT NULL,
  score DECIMAL(10,6),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_knowledge_retrieval_execution(execution_id, created_at),
  INDEX idx_knowledge_retrieval_base(knowledge_base_id, created_at),
  CONSTRAINT fk_knowledge_retrieval_execution FOREIGN KEY (execution_id) REFERENCES executions(id),
  CONSTRAINT fk_knowledge_retrieval_base FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id),
  CONSTRAINT fk_knowledge_retrieval_document FOREIGN KEY (document_id) REFERENCES knowledge_documents(id),
  CONSTRAINT fk_knowledge_retrieval_chunk FOREIGN KEY (chunk_id) REFERENCES knowledge_chunks(id)
);
