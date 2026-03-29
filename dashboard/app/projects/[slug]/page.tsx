import { notFound } from 'next/navigation'
import { db } from '@/drizzle/client'
import { projects, tasks, milestones, transactions, githubCache } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { cn, formatMoney } from '@/lib/utils'
import { STATUS_COLORS, CATEGORY_LABELS } from '@/lib/constants'
import { GitBranch, ExternalLink } from 'lucide-react'
import { ProjectTabs } from '@/app/components/projects/project-tabs'

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const project = db.select().from(projects).where(eq(projects.slug, slug)).get()
  if (!project) notFound()

  const projectTasks = db.select().from(tasks).where(eq(tasks.projectId, project.id)).all()
  const projectMilestones = db.select().from(milestones).where(eq(milestones.projectId, project.id)).all()
  const projectTransactions = db.select().from(transactions).where(eq(transactions.projectId, project.id)).all()
  const ghCache = project.githubRepo
    ? db.select().from(githubCache).where(eq(githubCache.projectId, project.id)).get()
    : null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: project.color ?? '#94a3b8' }} />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-slate-500">{CATEGORY_LABELS[project.category]}</span>
                {project.description && <><span className="text-slate-300">·</span><span className="text-sm text-slate-500">{project.description}</span></>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {project.githubOwner && project.githubRepo && (
              <a href={`https://github.com/${project.githubOwner}/${project.githubRepo}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md px-2.5 py-1.5 transition-colors">
                <GitBranch className="h-3.5 w-3.5" />
                {project.githubOwner}/{project.githubRepo}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', STATUS_COLORS[project.status])}>{project.status}</span>
          </div>
        </div>
        {project.category === 'client' && project.contractValue != null && project.contractValue > 0 && (
          <div className="mt-3 flex items-center gap-4 text-sm">
            <span className="text-slate-500">Contract value:</span>
            <span className="font-medium text-slate-900">{formatMoney(project.contractValue)}</span>
          </div>
        )}
      </div>
      <ProjectTabs project={project} tasks={projectTasks} milestones={projectMilestones} transactions={projectTransactions} githubCache={ghCache} />
    </div>
  )
}
