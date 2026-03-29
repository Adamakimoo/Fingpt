export const PROJECT_CATEGORIES = ['client', 'personal', 'ops'] as const
export type ProjectCategory = typeof PROJECT_CATEGORIES[number]

export const PROJECT_STATUSES = ['active', 'paused', 'complete', 'cancelled', 'archived'] as const
export type ProjectStatus = typeof PROJECT_STATUSES[number]

export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'] as const
export type TaskStatus = typeof TASK_STATUSES[number]

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type TaskPriority = typeof TASK_PRIORITIES[number]

export const MILESTONE_STATUSES = ['pending', 'in_progress', 'complete', 'blocked'] as const
export type MilestoneStatus = typeof MILESTONE_STATUSES[number]

export const TRANSACTION_TYPES = ['revenue', 'expense', 'invoice'] as const
export type TransactionType = typeof TRANSACTION_TYPES[number]

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-slate-500',
  medium: 'text-blue-600',
  high: 'text-orange-500',
  urgent: 'text-red-600',
}

export const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-400',
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  complete: 'bg-blue-100 text-blue-700',
  archived: 'bg-slate-100 text-slate-400',
  pending: 'bg-slate-100 text-slate-700',
}

export const CATEGORY_LABELS: Record<string, string> = {
  client: 'Client',
  personal: 'Personal',
  ops: 'Ops',
}
