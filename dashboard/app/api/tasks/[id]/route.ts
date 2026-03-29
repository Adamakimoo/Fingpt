import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/client'
import { tasks } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const { dueDate, ...rest } = body
  const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() }
  if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null
  if (rest.status === 'done') updates.completedAt = new Date()
  if (rest.status && rest.status !== 'done') updates.completedAt = null

  const row = db.update(tasks).set(updates).where(eq(tasks.id, Number(id))).returning().get()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  db.delete(tasks).where(eq(tasks.id, Number(id))).run()
  return NextResponse.json({ ok: true })
}
