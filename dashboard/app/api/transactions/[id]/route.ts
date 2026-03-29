import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/client'
import { transactions } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const { date, ...rest } = body
  const updates: Record<string, unknown> = { ...rest }
  if (date !== undefined) updates.date = new Date(date)

  const row = db.update(transactions).set(updates).where(eq(transactions.id, Number(id))).returning().get()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(row)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  db.delete(transactions).where(eq(transactions.id, Number(id))).run()
  return NextResponse.json({ ok: true })
}
