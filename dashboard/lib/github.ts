import { Octokit } from '@octokit/rest'
import { db } from '@/drizzle/client'
import { githubCache, projects } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })

export async function syncGitHubRepo(slug: string) {
  const project = db.select().from(projects).where(eq(projects.slug, slug)).get()
  if (!project?.githubOwner || !project?.githubRepo) {
    throw new Error('Project has no GitHub repo configured')
  }

  const owner = project.githubOwner
  const repo = project.githubRepo

  const [{ data: repoData }, { data: prsData }, { data: issuesData }, { data: commitsData }] =
    await Promise.all([
      octokit.repos.get({ owner, repo }),
      octokit.pulls.list({ owner, repo, state: 'open', per_page: 20 }),
      octokit.issues.listForRepo({ owner, repo, state: 'open', per_page: 20 }),
      octokit.repos.listCommits({ owner, repo, per_page: 20 }),
    ])

  const realIssues = issuesData.filter((i: any) => !i.pull_request)

  const prs = prsData.map((pr: any) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    url: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    author: pr.user?.login ?? '',
    labels: pr.labels?.map((l: any) => l.name) ?? [],
  }))

  const issues = realIssues.map((issue: any) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    createdAt: issue.created_at,
    labels: issue.labels?.map((l: any) => l.name) ?? [],
  }))

  const commits = commitsData.map((c: any) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? c.author?.login ?? '',
    date: c.commit.author?.date ?? '',
    url: c.html_url,
  }))

  const repoStats = {
    stars: repoData.stargazers_count,
    forks: repoData.forks_count,
    openIssues: repoData.open_issues_count,
    defaultBranch: repoData.default_branch,
    language: repoData.language ?? '',
    lastPushAt: repoData.pushed_at,
  }

  const existing = db.select().from(githubCache).where(eq(githubCache.projectId, project.id)).get()

  if (existing) {
    return db.update(githubCache)
      .set({ prs, issues, commits, repoStats, syncedAt: new Date(), syncError: null })
      .where(eq(githubCache.projectId, project.id))
      .returning().get()
  } else {
    return db.insert(githubCache)
      .values({ projectId: project.id, prs, issues, commits, repoStats, syncedAt: new Date() })
      .returning().get()
  }
}
