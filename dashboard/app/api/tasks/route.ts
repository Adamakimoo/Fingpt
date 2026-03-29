import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/client'
import { tasks } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const createSchema = z.object({
  projectId: z.number(),
  title: z.string().min(1),
  notes: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked', 'cancelled']).default('todo'),
  dueDate: z.string().optional(),
  isNextAction: z.boolean().default(false),
  milestoneId: z.number().optional(),
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  const rows = projectId
    ? db.select().from(tasks).where(eq(tasks.projectId, Number(projectId))).all()
    : db.select().from(tasks).all()

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { dueDate, ...rest } = parsed.data
  const row = db.insert(tasks).values({
    ...rest,
    dueDate: dueDate ? new Date(dueDate) : undefined,
  }).returning().get()

  return NextResponse.json(row, { status: 201 })
}
