import type { SkillPlugin } from '../plugin-types.js';

const summarizePlugin: SkillPlugin = {
  skillKey: 'summarize_text',
  name: '摘要生成',
  version: '1.0.0',
  description: '自动对文本进行缩写截断并统计字数。',
  executorKey: 'summarize_text',
  parametersSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '需要被截断摘要的原始文本' },
    },
    required: ['text'],
  },
  returnsSchema: { type: 'object' },
  tags: ['text', 'utility'],
  executor: async (input) => {
    const text = String(input.text ?? '');
    return {
      摘要: text.length > 200 ? `${text.slice(0, 200)}...` : text,
      字数: text.length,
    };
  },
};

export default summarizePlugin;
