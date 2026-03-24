INSERT INTO llm_providers (id, provider_key, name, provider_type, model, api_base_url, api_key_masked, status)
VALUES
('9b34c4d4-6ab8-4f80-a470-000000000001', 'qwen-default', '通义千问 Qwen', 'qwen', 'qwen-max', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'sk-****', 'active')
ON DUPLICATE KEY UPDATE
name = VALUES(name), provider_type = VALUES(provider_type), model = VALUES(model), api_base_url = VALUES(api_base_url), status = VALUES(status);

INSERT INTO skills (id, skill_key, name, version, description, status, executor_key, parameters_schema, returns_schema, tags)
VALUES
('9b34c4d4-6ab8-4f80-a470-000000000011', 'echo', '自定义回显技能', '1.0.0', '一个用于联调的简单回显技能', 'active', 'echo', '{"type":"object","properties":{"text":{"type":"string"}}}', '{"type":"object"}', '["utility","test"]'),
('9b34c4d4-6ab8-4f80-a470-000000000012', 'summarize_text', '摘要生成', '1.0.0', '自动对文本进行缩写截断并统计字数。', 'active', 'summarize_text', '{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}', '{"type":"object"}', '["text","utility"]'),
('9b34c4d4-6ab8-4f80-a470-000000000013', 'extract_keywords', '关键词提取', '1.0.0', '提取给定文本中的关键词信息。', 'active', 'extract_keywords', '{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}', '{"type":"object"}', '["text","utility"]')
ON DUPLICATE KEY UPDATE
name = VALUES(name), description = VALUES(description), status = VALUES(status), executor_key = VALUES(executor_key);

INSERT INTO agents (id, name, description, status, llm_provider_id, system_prompt, max_steps, timeout_ms, skill_ids)
VALUES
('default-agent-id', '默认智能体', '用于本地 MVP 联调的默认智能体', 'active', '9b34c4d4-6ab8-4f80-a470-000000000001', '你是一名中文智能助手。请保持上下文连贯，优先给出清晰、实用、简洁的回答。', 6, 60000, '["9b34c4d4-6ab8-4f80-a470-000000000011","9b34c4d4-6ab8-4f80-a470-000000000012","9b34c4d4-6ab8-4f80-a470-000000000013"]')
ON DUPLICATE KEY UPDATE
name = VALUES(name), description = VALUES(description), status = VALUES(status), llm_provider_id = VALUES(llm_provider_id), system_prompt = VALUES(system_prompt), max_steps = VALUES(max_steps), timeout_ms = VALUES(timeout_ms), skill_ids = VALUES(skill_ids);
