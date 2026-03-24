INSERT INTO llm_providers (id, provider_key, name, provider_type, model, api_base_url, api_key_masked, config, status)
VALUES
('9b34c4d4-6ab8-4f80-a470-000000000001', 'qwen-default', '通义千问 Qwen', 'openai-compatible', 'qwen-max', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'sk-****', '{"supportedModelKeys":["qwen-max"]}', 'active')
ON DUPLICATE KEY UPDATE
name = VALUES(name), provider_type = VALUES(provider_type), model = VALUES(model), api_base_url = VALUES(api_base_url), config = VALUES(config), status = VALUES(status);

INSERT INTO llm_model_catalog (id, provider_type, model_key, display_name, capabilities, status, is_hot, sort, config)
VALUES
('m-openai-gpt-4o', 'openai-compatible', 'gpt-4o', 'OpenAI GPT-4o', '["chat","vision","tool_calling"]', 'active', 1, 10, '{}'),
('m-openai-gpt-4.1', 'openai-compatible', 'gpt-4.1', 'OpenAI GPT-4.1', '["chat","tool_calling"]', 'active', 1, 11, '{}'),
('m-anthropic-claude-3-7', 'anthropic', 'claude-3-7-sonnet-20250219', 'Anthropic Claude 3.7 Sonnet', '["chat","vision","tool_calling"]', 'active', 1, 20, '{}'),
('m-google-gemini-2-5-pro', 'google-gemini', 'gemini-2.5-pro', 'Google Gemini 2.5 Pro', '["chat","vision","tool_calling"]', 'active', 1, 30, '{}'),
('m-xai-grok-2', 'openai-compatible', 'grok-2-latest', 'xAI Grok 2', '["chat","vision","tool_calling"]', 'active', 1, 40, '{}'),
('m-meta-llama-3-3-70b', 'openai-compatible', 'llama-3.3-70b-instruct', 'Meta Llama 3.3 70B', '["chat","tool_calling"]', 'active', 1, 50, '{}'),
('m-mistral-large', 'openai-compatible', 'mistral-large-latest', 'Mistral Large', '["chat","tool_calling"]', 'active', 1, 60, '{}'),
('m-cohere-command-r-plus', 'openai-compatible', 'command-r-plus', 'Cohere Command R+', '["chat","tool_calling"]', 'active', 1, 70, '{}'),
('m-deepseek-v3', 'openai-compatible', 'deepseek-chat', 'DeepSeek V3', '["chat","tool_calling"]', 'active', 1, 80, '{}'),
('m-qwen-max', 'openai-compatible', 'qwen-max', '阿里 Qwen Max', '["chat","tool_calling"]', 'active', 1, 90, '{}'),
('m-baidu-ernie-4-0', 'openai-compatible', 'ernie-4.0-8k', '百度文心 ERNIE 4.0', '["chat","tool_calling"]', 'active', 1, 100, '{}'),
('m-zhipu-glm-4-9', 'openai-compatible', 'glm-4.9', '智谱 GLM-4.9', '["chat","tool_calling"]', 'active', 1, 110, '{}'),
('m-hunyuan-turbo', 'openai-compatible', 'hunyuan-turbo', '腾讯混元 Turbo', '["chat","tool_calling"]', 'active', 1, 120, '{}'),
('m-minimax-abab6', 'openai-compatible', 'abab6.5-chat', 'MiniMax abab6.5', '["chat","tool_calling"]', 'active', 1, 130, '{}')
ON DUPLICATE KEY UPDATE
display_name = VALUES(display_name), capabilities = VALUES(capabilities), status = VALUES(status), is_hot = VALUES(is_hot), sort = VALUES(sort), config = VALUES(config);

INSERT INTO agents (id, name, description, status, llm_provider_id, system_prompt, max_steps, timeout_ms, skill_ids)
VALUES
('default-agent-id', '默认智能体', '用于本地 MVP 联调的默认智能体', 'active', '9b34c4d4-6ab8-4f80-a470-000000000001', '你是一名中文智能助手。请保持上下文连贯，优先给出清晰、实用、简洁的回答。', 6, 60000, '[]')
ON DUPLICATE KEY UPDATE
name = VALUES(name), description = VALUES(description), status = VALUES(status), llm_provider_id = VALUES(llm_provider_id), system_prompt = VALUES(system_prompt), max_steps = VALUES(max_steps), timeout_ms = VALUES(timeout_ms), skill_ids = VALUES(skill_ids);
