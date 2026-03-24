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
      messageText: `已同步 ${installedItems.length} 个目录技能，待同步 ${discoveredItems.length} 个`,
    };
  } catch (error) {
    return {
      skills: [],
      availableSkills: [],
      messageText: error instanceof Error ? error.message : '加载失败',
    };
  }
}
