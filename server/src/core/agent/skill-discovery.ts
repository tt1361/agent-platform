import { DynamicTool } from '@langchain/core/tools';
import type { SkillPlugin } from './plugin-types.js';

import echoPlugin from './plugins/echo.js';
import summarizePlugin from './plugins/summarize.js';
import keywordsPlugin from './plugins/keywords.js';
import weatherPlugin from './plugins/weather.js';

export const discoveredPlugins: SkillPlugin[] = [echoPlugin, summarizePlugin, keywordsPlugin, weatherPlugin];

export function getDiscoveredExecutor(executorKey?: string) {
  if (!executorKey) return undefined;
  const plugin = discoveredPlugins.find((p) => p.executorKey === executorKey);
  return plugin?.executor;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLangchainTool(skill: any): DynamicTool {
  const executor = getDiscoveredExecutor(skill.executorKey);
  if (!executor) {
    throw new Error(`未找到插件执行器: ${skill.executorKey}`);
  }
  return new DynamicTool({
    name: skill.skillKey,
    description: skill.description ?? skill.name,
    func: async (inputStr: string) => {
      let parsedInput: Record<string, unknown> = {};
      try {
        if (inputStr) {
          parsedInput = JSON.parse(inputStr) as Record<string, unknown>;
        }
      } catch (e) {
        parsedInput = { input: inputStr };
      }
      try {
        const result = await executor(parsedInput);
        return typeof result === 'string' ? result : JSON.stringify(result) || 'Success';
      } catch (error) {
        return `Error executing tool ${skill.name}: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}
