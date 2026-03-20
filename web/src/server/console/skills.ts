import { requestBackend } from '../backend-client';
import type { Skill } from '@/types/api';

export interface SkillsPageData {
  skills: Skill[];
  availableSkills: Skill[];
  messageText: string;
}

export async function getSkillsPageData(): Promise<SkillsPageData> {
  try {
    const [installedItems, discoveredItems] = await Promise.all([
      requestBackend<Skill[]>('/api/v1/skills'),
      requestBackend<Skill[]>('/api/v1/skills/available'),
    ]);
    return {
      skills: installedItems,
      availableSkills: discoveredItems,
      messageText: `已安装 ${installedItems.length} 个技能，发现 ${discoveredItems.length} 个可用插件`,
    };
  } catch (error) {
    return {
      skills: [],
      availableSkills: [],
      messageText: error instanceof Error ? error.message : '加载失败',
    };
  }
}
