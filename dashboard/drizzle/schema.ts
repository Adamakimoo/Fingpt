import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── projects ────────────────────────────────────────────────────────────────
export const projects = sqliteTable('projects', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  slug:          text('slug').notNull().unique(),
  name:          text('name').notNull(),
  description:   text('description'),
  category:      text('category').notNull(), // 'client' | 'personal' | 'ops'
  status:        text('status').notNull().default('active'), // 'active'|'paused'|'complete'|'cancelled'|'archived'
  color:         text('color'),
  githubOwner:   text('github_owner'),
  githubRepo:    text('github_repo'),
  contractValue: integer('contract_value'), // cents
  hourlyRate:    integer('hourly_rate'),    // cents
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull()
                   .default(sql`(unixepoch())`),
  updatedAt:     integer('updated_at', { mode: 'timestamp' }).notNull()
                   .default(sql`(unixepoch())`),
})

// ─── milestones ───────────────────────────────────────────────────────────────
export const milestones = sqliteTable('milestones', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  projectId:   integer('project_id').notNull()
                 .references(() => projects.id, { onDelete: 'cascade' }),
  title:       text('title').notNull(),
  description: text('description'),
  status:      text('status').notNull().default('pending'),
  dueDate:     integer('due_date', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  sortOrder:   integer('sort_order').notNull().default(0),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
})

// ─── tasks ────────────────────────────────────────────────────────────────────
export const tasks = sqliteTable('tasks', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  projectId:      integer('project_id').notNull()
                    .references(() => projects.id, { onDelete: 'cascade' }),
  milestoneId:    integer('milestone_id')
                    .references(() => milestones.id, { onDelete: 'set null' }),
  title:          text('title').notNull(),
  notes:          text('notes'),
  status:         text('status').notNull().default('todo'),
  priority:       text('priority').notNull().default('medium'),
  dueDate:        integer('due_date', { mode: 'timestamp' }),
  completedAt:    integer('completed_at', { mode: 'timestamp' }),
  estimatedMins:  integer('estimated_mins'),
  isNextAction:   integer('is_next_action', { mode: 'boolean' }).notNull().default(false),
  createdAt:      integer('created_at', { mode: 'timestamp' }).notNull()
                    .default(sql`(unixepoch())`),
  updatedAt:      integer('updated_at', { mode: 'timestamp' }).notNull()
                    .default(sql`(unixepoch())`),
})

// ─── time_entries ─────────────────────────────────────────────────────────────
export const timeEntries = sqliteTable('time_entries', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  projectId:   integer('project_id').notNull()
                 .references(() => projects.id, { onDelete: 'cascade' }),
  taskId:      integer('task_id')
                 .references(() => tasks.id, { onDelete: 'set null' }),
  description: text('description'),
  minutes:     integer('minutes').notNull(),
  loggedAt:    integer('logged_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
  billable:    integer('billable', { mode: 'boolean' }).notNull().default(false),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
})

// ─── transactions ─────────────────────────────────────────────────────────────
export const transactions = sqliteTable('transactions', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  projectId:   integer('project_id').notNull()
                 .references(() => projects.id, { onDelete: 'cascade' }),
  type:        text('type').notNull(),
  amount:      integer('amount').notNull(),
  description: text('description').notNull(),
  category:    text('category'),
  date:        integer('date', { mode: 'timestamp' }).notNull(),
  invoiceRef:  text('invoice_ref'),
  paid:        integer('paid', { mode: 'boolean' }).notNull().default(false),
  notes:       text('notes'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull()
                 .default(sql`(unixepoch())`),
})

// ─── github_cache ─────────────────────────────────────────────────────────────
export const githubCache = sqliteTable('github_cache', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  projectId:   integer('project_id').notNull().unique()
                 .references(() => projects.id, { onDelete: 'cascade' }),
  prs:         text('prs', { mode: 'json' }).$type<object[]>(),
  issues:      text('issues', { mode: 'json' }).$type<object[]>(),
  commits:     text('commits', { mode: 'json' }).$type<object[]>(),
  repoStats:   text('repo_stats', { mode: 'json' }).$type<object>(),
  syncedAt:    integer('synced_at', { mode: 'timestamp' }),
  syncError:   text('sync_error'),
})

export type Project      = typeof projects.$inferSelect
export type NewProject   = typeof projects.$inferInsert
export type Milestone    = typeof milestones.$inferSelect
export type NewMilestone = typeof milestones.$inferInsert
export type Task         = typeof tasks.$inferSelect
export type NewTask      = typeof tasks.$inferInsert
export type TimeEntry    = typeof timeEntries.$inferSelect
export type Transaction  = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
export type GithubCache  = typeof githubCache.$inferSelect
