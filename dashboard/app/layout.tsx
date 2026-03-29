import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/app/components/layout/sidebar'
import { db } from '@/drizzle/client'
import { projects } from '@/drizzle/schema'
import { asc } from 'drizzle-orm'

export const metadata: Metadata = {
  title: 'Command — Project Dashboard',
  description: 'Personal project management dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const allProjects = db.select().from(projects).orderBy(asc(projects.name)).all()

  return (
    <html lang="en" className="h-dvh">
      <body className="flex h-dvh overflow-hidden bg-white antialiased font-sans">
        <Sidebar projects={allProjects} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
