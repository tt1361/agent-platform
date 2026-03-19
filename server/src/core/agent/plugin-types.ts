export type SkillExecutor = (input: Record<string, unknown>) => Promise<unknown>;

export interface SkillPlugin {
  skillKey: string;
  name: string;
  version: string;
  description: string;
  executorKey: string;
  parametersSchema: Record<string, unknown>;
  returnsSchema: Record<string, unknown>;
  tags?: string[];
  executor: SkillExecutor;
}
