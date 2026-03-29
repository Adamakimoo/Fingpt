import { db } from '@/drizzle/client'
import { tasks, projects } from '@/drizzle/schema'
import { ne } from 'drizzle-orm'
import { cn, formatDate, isOverdue } from '@/lib/utils'
import { PRIORITY_COLORS } from '@/lib/constants'
import { Circle, Zap, AlertCircle } from 'lucide-react'

export default function TasksPage() {
  const allProjects = db.select().from(projects).where(ne(projects.status, 'archived')).all()
  const allTasks = db.select().from(tasks).all()
  const projectMap = Object.fromEntries(allProjects.map(p => [p.id, p]))

  const active = allTasks
    .filter(t => t.status !== 'done' && t.status !== 'cancelled')
    .sort((a, b) => {
      const pA = ['urgent', 'high', 'medium', 'low'].indexOf(a.priority)
      const pB = ['urgent', 'high', 'medium', 'low'].indexOf(b.priority)
      if (pA !== pB) return pA - pB
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime()
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return 0
    })

  const overdue = active.filter(t => isOverdue(t.dueDate))
  const nextActions = active.filter(t => t.isNextAction)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
        <p className="text-sm text-slate-500 mt-0.5">{active.length} open{overdue.length > 0 && <> · <span className="text-red-600 font-medium">{overdue.length} overdue</span></>}</p>
      </div>
      {nextActions.length > 0 && (
        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3"><Zap className="h-4 w-4 text-amber-500" />Next Actions ({nextActions.length})</h2>
          <div className="space-y-1">{nextActions.map(t => <TaskRow key={t.id} task={t} project={projectMap[t.projectId]} />)}</div>
        </section>
      )}
      {overdue.length > 0 && (
        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-3"><AlertCircle className="h-4 w-4" />Overdue ({overdue.length})</h2>
          <div className="space-y-1">{overdue.map(t => <TaskRow key={t.id} task={t} project={projectMap[t.projectId]} />)}</div>
        </section>
      )}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">All Open Tasks ({active.length})</h2>
        <div className="space-y-1">
          {active.map(t => <TaskRow key={t.id} task={t} project={projectMap[t.projectId]} />)}
          {active.length === 0 && <div className="text-center py-10 text-sm text-slate-400">All caught up 🎉</div>}
        </div>
      </section>
    </div>
  )
}

function TaskRow({ task, project }: { task: any; project: any }) {
  const overdue = isOverdue(task.dueDate)
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
      <Circle className="h-4 w-4 shrink-0 text-slate-300" />
      <span className="flex-1 text-sm text-slate-900 min-w-0 truncate">{task.title}</span>
      {task.isNextAction && <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
      <span className={cn('text-xs font-medium shrink-0', PRIORITY_COLORS[task.priority])}>{task.priority}</span>
      {project && <span className="text-xs text-slate-400 shrink-0 hidden sm:block"><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: project.color ?? '#94a3b8' }} />{project.name}</span>}
      {task.dueDate && <span className={cn('text-xs shrink-0', overdue ? 'text-red-600 font-medium' : 'text-slate-400')}>{formatDate(task.dueDate)}</span>}
    </div>
  )
}
