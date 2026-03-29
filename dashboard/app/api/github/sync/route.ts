import { NextRequest, NextResponse } from 'next/server'
import { syncGitHubRepo } from '@/lib/github'

export async function POST(req: NextRequest) {
  const { slug } = await req.json()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  try {
    const cache = await syncGitHubRepo(slug)
    return NextResponse.json(cache)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
