import type { SkillPlugin } from '../plugin-types.js';

const echoPlugin: SkillPlugin = {
  skillKey: 'echo',
  name: '自定义回显技能',
  version: '1.0.0',
  description: '一个用于联调的简单回显技能',
  executorKey: 'echo',
  parametersSchema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
    },
  },
  returnsSchema: { type: 'object' },
  tags: ['utility', 'test'],
  executor: async (input) => {
    return { 回显结果: input.text ?? input };
  },
};

export default echoPlugin;
