import { NextResponse } from 'next/server'
import { db } from '@/drizzle/client'
import { projects } from '@/drizzle/schema'
import { ne } from 'drizzle-orm'

export async function GET() {
  const rows = db.select().from(projects).where(ne(projects.status, 'archived')).all()
  return NextResponse.json(rows)
}
