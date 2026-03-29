import { db } from '../drizzle/client'
import { projects } from '../drizzle/schema'
import { SEED_PROJECTS } from '../drizzle/seed-data'

function seed() {
  console.log('Seeding projects...')
  for (const p of SEED_PROJECTS) {
    db.insert(projects).values(p).onConflictDoNothing().run()
  }
  console.log(`✓ Seeded ${SEED_PROJECTS.length} projects`)
}

seed()
