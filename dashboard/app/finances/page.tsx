import { db } from '@/drizzle/client'
import { transactions, projects } from '@/drizzle/schema'
import { ne } from 'drizzle-orm'
import { cn, formatMoney, formatDate } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export default function FinancesPage() {
  const allProjects = db.select().from(projects).where(ne(projects.status, 'archived')).all()
  const allTransactions = db.select().from(transactions).all()
  const projectMap = Object.fromEntries(allProjects.map(p => [p.id, p]))

  const totalRevenue = allTransactions.filter(t => t.type === 'revenue').reduce((s, t) => s + t.amount, 0)
  const totalExpenses = allTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const net = totalRevenue - totalExpenses

  const byProject = allProjects.map(p => {
    const pts = allTransactions.filter(t => t.projectId === p.id)
    const rev = pts.filter(t => t.type === 'revenue').reduce((s, t) => s + t.amount, 0)
    const exp = pts.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    return { project: p, revenue: rev, expenses: exp, net: rev - exp }
  }).filter(r => r.revenue > 0 || r.expenses > 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Finances</h1>
        <p className="text-sm text-slate-500 mt-0.5">All projects · {allTransactions.length} transactions</p>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-8">
        <SummaryCard icon={<TrendingUp className="h-4 w-4 text-green-600" />} label="Total Revenue" value={formatMoney(totalRevenue)} color="text-green-700" />
        <SummaryCard icon={<TrendingDown className="h-4 w-4 text-red-500" />} label="Total Expenses" value={formatMoney(totalExpenses)} color="text-red-600" />
        <SummaryCard icon={<Minus className="h-4 w-4 text-slate-500" />} label="Net" value={formatMoney(net)} color={net >= 0 ? 'text-green-700' : 'text-red-600'} />
      </div>
      {byProject.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">By Project</h2>
          <div className="space-y-2">
            {byProject.map(({ project, revenue, expenses, net: pNet }) => (
              <div key={project.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color ?? '#94a3b8' }} />
                <span className="flex-1 text-sm font-medium text-slate-900">{project.name}</span>
                <span className="text-sm text-green-700 tabular-nums">{formatMoney(revenue)}</span>
                <span className="text-xs text-slate-400 hidden sm:block">- {formatMoney(expenses)}</span>
                <span className={cn('text-sm font-semibold tabular-nums', pNet >= 0 ? 'text-green-700' : 'text-red-600')}>= {formatMoney(pNet)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">All Transactions</h2>
        <div className="space-y-1">
          {allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => {
            const project = projectMap[t.projectId]
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
                <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0', t.type === 'revenue' ? 'bg-green-100 text-green-700' : t.type === 'expense' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700')}>{t.type}</span>
                <span className="flex-1 text-sm text-slate-900 truncate">{t.description}</span>
                {project && <span className="text-xs text-slate-400 hidden sm:block"><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: project.color ?? '#94a3b8' }} />{project.name}</span>}
                <span className="text-xs text-slate-400 shrink-0">{formatDate(t.date)}</span>
                <span className={cn('text-sm font-medium tabular-nums shrink-0', t.type === 'revenue' ? 'text-green-700' : 'text-red-600')}>{t.type === 'revenue' ? '+' : '-'}{formatMoney(t.amount)}</span>
              </div>
            )
          })}
          {allTransactions.length === 0 && <div className="text-center py-10 text-sm text-slate-400">No transactions yet</div>}
        </div>
      </section>
    </div>
  )
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-1.5 mb-1 text-xs text-slate-500">{icon}{label}</div>
      <p className={cn('text-xl font-bold tabular-nums', color)}>{value}</p>
    </div>
  )
}
