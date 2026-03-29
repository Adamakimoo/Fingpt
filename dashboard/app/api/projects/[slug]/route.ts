import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/client'
import { projects } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

export async function GET(_: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const row = db.select().from(projects).where(eq(projects.slug, slug)).get()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const body = await req.json()
  const row = db.update(projects)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(projects.slug, slug))
    .returning().get()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}
