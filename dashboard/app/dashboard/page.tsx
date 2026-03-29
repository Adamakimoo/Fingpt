import { db } from '@/drizzle/client'
import { projects, tasks, milestones, transactions } from '@/drizzle/schema'
import { ne } from 'drizzle-orm'
import { ProjectCard } from '@/app/components/dashboard/project-card'
import { formatMoney } from '@/lib/utils'
import { CheckSquare, DollarSign, AlertCircle, Zap } from 'lucide-react'

export default function DashboardPage() {
  const allProjects = db.select().from(projects).where(ne(projects.status, 'archived')).all()
  const allTasks = db.select().from(tasks).all()
  const allMilestones = db.select().from(milestones).all()
  const allTransactions = db.select().from(transactions).all()

  const totalRevenue = allTransactions.filter(t => t.type === 'revenue').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = allTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const openTasks = allTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
  const now = new Date()
  const overdueTasks = openTasks.filter(t => t.dueDate && t.dueDate < now)
  const nextActions = allTasks.filter(t => t.isNextAction && t.status !== 'done' && t.status !== 'cancelled')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">{allProjects.length} active projects</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <StatCard icon={<DollarSign className="h-4 w-4 text-green-600" />} label="Total Revenue" value={formatMoney(totalRevenue)} sub={`${formatMoney(totalExpenses)} expenses`} />
        <StatCard icon={<CheckSquare className="h-4 w-4 text-blue-600" />} label="Open Tasks" value={String(openTasks.length)} sub={`across ${allProjects.length} projects`} />
        <StatCard icon={<AlertCircle className="h-4 w-4 text-red-600" />} label="Overdue" value={String(overdueTasks.length)} sub="tasks past due date" highlight={overdueTasks.length > 0} />
        <StatCard icon={<Zap className="h-4 w-4 text-amber-500" />} label="Next Actions" value={String(nextActions.length)} sub="flagged across projects" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {allProjects.map(project => (
          <ProjectCard
            key={project.id}
            project={project}
            tasks={allTasks.filter(t => t.projectId === project.id)}
            milestones={allMilestones.filter(m => m.projectId === project.id)}
            transactions={allTransactions.filter(t => t.projectId === project.id)}
          />
        ))}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, highlight = false }: {
  icon: React.ReactNode; label: string; value: string; sub: string; highlight?: boolean
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-slate-500">{label}</span></div>
      <p className={`text-xl font-bold tabular-nums ${highlight ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}
