import { SkillsPage } from '@/features/skills/pages/SkillsPage';
import { getSkillsPageData } from '@/server/console/skills';

export default async function SkillsRoutePage() {
  const { skills, availableSkills, messageText } = await getSkillsPageData();
  return <SkillsPage initialSkills={skills} initialAvailableSkills={availableSkills} initialMessageText={messageText} />;
}
