export type HumanTaskStatus = 'pending' | 'approved' | 'rejected' | 'timeout' | 'overridden';
export type HumanTaskType = 'approval' | 'review' | 'fillin' | 'takeover';

export interface HumanTaskRecord {
  id: string;
  title: string;
  taskType: HumanTaskType;
  sourceType: 'agent' | 'workflow' | 'tool';
  sourceId: string;
  payload: Record<string, unknown>;
  assigneeId?: string;
  status: HumanTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
