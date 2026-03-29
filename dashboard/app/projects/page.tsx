import { db } from '@/drizzle/client'
import { projects, tasks, transactions } from '@/drizzle/schema'
import { ne } from 'drizzle-orm'
import Link from 'next/link'
import { cn, formatMoney } from '@/lib/utils'
import { STATUS_COLORS, CATEGORY_LABELS } from '@/lib/constants'
import { GitBranch } from 'lucide-react'

export default function ProjectsPage() {
  const allProjects = db.select().from(projects).where(ne(projects.status, 'archived')).all()
  const allTasks = db.select().from(tasks).all()
  const allTransactions = db.select().from(transactions).all()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        <p className="text-sm text-slate-500 mt-0.5">{allProjects.length} projects</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Category</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Open Tasks</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allProjects.map(project => {
              const openTasks = allTasks.filter(t => t.projectId === project.id && t.status !== 'done' && t.status !== 'cancelled').length
              const revenue = allTransactions.filter(t => t.projectId === project.id && t.type === 'revenue').reduce((s, t) => s + t.amount, 0)
              return (
                <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${project.slug}`} className="flex items-center gap-2 group">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color ?? '#94a3b8' }} />
                      <span className="font-medium text-slate-900 group-hover:text-slate-600">{project.name}</span>
                      {project.githubRepo && <GitBranch className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{CATEGORY_LABELS[project.category]}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[project.status])}>{project.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700 hidden md:table-cell">{openTasks}</td>
                  <td className="px-4 py-3 text-right text-slate-700 tabular-nums hidden lg:table-cell">{revenue > 0 ? formatMoney(revenue) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
