INSERT INTO llm_providers (id, provider_key, name, provider_type, model, api_base_url, api_key_masked, status)
VALUES
('9b34c4d4-6ab8-4f80-a470-000000000001', 'qwen-default', '通义千问 Qwen', 'qwen', 'qwen-max', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'sk-****', 'active')
ON DUPLICATE KEY UPDATE
name = VALUES(name), provider_type = VALUES(provider_type), model = VALUES(model), api_base_url = VALUES(api_base_url), status = VALUES(status);

INSERT INTO agents (id, name, description, status, llm_provider_id, system_prompt, max_steps, timeout_ms, skill_ids)
VALUES
('default-agent-id', '默认智能体', '用于本地 MVP 联调的默认智能体', 'active', '9b34c4d4-6ab8-4f80-a470-000000000001', '你是一名中文智能助手。请保持上下文连贯，优先给出清晰、实用、简洁的回答。', 6, 60000, '[]')
ON DUPLICATE KEY UPDATE
name = VALUES(name), description = VALUES(description), status = VALUES(status), llm_provider_id = VALUES(llm_provider_id), system_prompt = VALUES(system_prompt), max_steps = VALUES(max_steps), timeout_ms = VALUES(timeout_ms), skill_ids = VALUES(skill_ids);
