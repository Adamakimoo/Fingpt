import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/client'
import { milestones } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const createSchema = z.object({
  projectId: z.number(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'complete', 'blocked']).default('pending'),
  dueDate: z.string().optional(),
  sortOrder: z.number().default(0),
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  const rows = projectId
    ? db.select().from(milestones).where(eq(milestones.projectId, Number(projectId))).all()
    : db.select().from(milestones).all()

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { dueDate, ...rest } = parsed.data
  const row = db.insert(milestones).values({
    ...rest,
    dueDate: dueDate ? new Date(dueDate) : undefined,
  }).returning().get()

  return NextResponse.json(row, { status: 201 })
}
