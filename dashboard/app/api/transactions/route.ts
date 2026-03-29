import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/drizzle/client'
import { transactions } from '@/drizzle/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod/v4'

const createSchema = z.object({
  projectId: z.number(),
  type: z.enum(['revenue', 'expense', 'invoice']),
  amount: z.number().int().positive(),
  description: z.string().min(1),
  category: z.string().optional(),
  date: z.string(),
  invoiceRef: z.string().optional(),
  paid: z.boolean().default(false),
  notes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  const rows = projectId
    ? db.select().from(transactions).where(eq(transactions.projectId, Number(projectId))).all()
    : db.select().from(transactions).all()

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { date, ...rest } = parsed.data
  const row = db.insert(transactions).values({
    ...rest,
    date: new Date(date),
  }).returning().get()

  return NextResponse.json(row, { status: 201 })
}
