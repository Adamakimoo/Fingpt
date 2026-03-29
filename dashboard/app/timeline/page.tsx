import { db } from '@/drizzle/client'
import { tasks, milestones, projects } from '@/drizzle/schema'
import { ne } from 'drizzle-orm'
import { cn, formatDate } from '@/lib/utils'
import { Flag, CheckSquare, AlertCircle, Calendar } from 'lucide-react'
import Link from 'next/link'

export default function TimelinePage() {
  const allProjects = db.select().from(projects).where(ne(projects.status, 'archived')).all()
  const allTasks = db.select().from(tasks).all()
  const allMilestones = db.select().from(milestones).all()
  const projectMap = Object.fromEntries(allProjects.map(p => [p.id, p]))
  const now = new Date()

  const items = [
    ...allMilestones.filter(m => m.status !== 'complete' && m.dueDate).map(m => ({ type: 'milestone' as const, item: m, project: projectMap[m.projectId] })),
    ...allTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled' && t.dueDate).map(t => ({ type: 'task' as const, item: t, project: projectMap[t.projectId] })),
  ].sort((a, b) => a.item.dueDate!.getTime() - b.item.dueDate!.getTime())

  const overdue = items.filter(i => i.item.dueDate! < now)
  const upcoming = items.filter(i => i.item.dueDate! >= now)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Timeline</h1>
        <p className="text-sm text-slate-500 mt-0.5">{overdue.length > 0 && <span className="text-red-600 font-medium">{overdue.length} overdue · </span>}{upcoming.length} upcoming</p>
      </div>
      {overdue.length > 0 && (
        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-3"><AlertCircle className="h-4 w-4" />Overdue</h2>
          <div className="space-y-1.5">{overdue.map(({ type, item, project }) => <DeadlineRow key={`${type}-${item.id}`} type={type} item={item} project={project} overdue />)}</div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3"><Calendar className="h-4 w-4" />Upcoming</h2>
          <div className="space-y-1.5">{upcoming.map(({ type, item, project }) => <DeadlineRow key={`${type}-${item.id}`} type={type} item={item} project={project} />)}</div>
        </section>
      )}
      {items.length === 0 && <div className="text-center py-16 text-sm text-slate-400">No deadlines set.</div>}
    </div>
  )
}

function DeadlineRow({ type, item, project, overdue = false }: { type: 'task' | 'milestone'; item: any; project: any; overdue?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border px-4 py-2.5', overdue ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white')}>
      {type === 'milestone' ? <Flag className={cn('h-4 w-4 shrink-0', overdue ? 'text-red-500' : 'text-slate-400')} /> : <CheckSquare className={cn('h-4 w-4 shrink-0', overdue ? 'text-red-500' : 'text-slate-400')} />}
      <span className={cn('flex-1 text-sm truncate', overdue ? 'text-red-800 font-medium' : 'text-slate-900')}>{item.title}</span>
      {project && <Link href={`/projects/${project.slug}`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 shrink-0 hidden sm:flex"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color ?? '#94a3b8' }} />{project.name}</Link>}
      <span className={cn('text-xs shrink-0', overdue ? 'text-red-600 font-medium' : 'text-slate-400')}>{formatDate(item.dueDate)}</span>
    </div>
  )
}
