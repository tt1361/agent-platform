import type { SkillPlugin } from '../plugin-types.js';

const keywordsPlugin: SkillPlugin = {
  skillKey: 'extract_keywords',
  name: '关键词提取',
  version: '1.0.0',
  description: '提取给定文本中的关键词信息。',
  executorKey: 'extract_keywords',
  parametersSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '原始文本' },
    },
    required: ['text'],
  },
  returnsSchema: { type: 'object' },
  tags: ['text', 'utility'],
  executor: async (input) => {
    const text = String(input.text ?? '');
    const keywords = Array.from(new Set(text.split(/[^\p{L}\p{N}_]+/u).filter(Boolean))).slice(0, 10);
    return { 关键词: keywords };
  },
};

export default keywordsPlugin;
