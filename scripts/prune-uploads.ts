// `pnpm uploads:prune`: lists uploads no task references (deleted tasks,
// removed images). Dry run by default; `pnpm uploads:prune --apply` deletes them.
import path from 'path'
import { findOrphanUploads, removeUploads } from '../lib/prune-uploads'
import { loadEnv } from './load-env'

async function main() {
  loadEnv()
  const apply = process.argv.includes('--apply')
  const { getRepository } = await import('../lib/db')
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
  const { taskCount, orphans } = await findOrphanUploads({ repo: getRepository(), uploadsDir })

  // No tasks usually means the wrong backend, where every upload looks orphaned
  if (taskCount === 0) throw new Error('No tasks found: check DB_TYPE before pruning')

  const mb = (orphans.reduce((sum, o) => sum + o.bytes, 0) / 1024 / 1024).toFixed(1)
  for (const o of orphans) console.log(`  ${o.name}`)
  console.log(`${orphans.length} unreferenced upload(s), ${mb} MB (files under a day old are kept)`)
  if (!apply) {
    if (orphans.length > 0) console.log('Dry run: rerun with --apply to delete them')
    return
  }
  await removeUploads(
    uploadsDir,
    orphans.map((o) => o.name),
  )
  console.log(`Deleted ${orphans.length} file(s)`)
}

main().then(
  // Postgres/MySQL pools keep the process alive otherwise
  () => process.exit(0),
  (err) => {
    console.error('Prune failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  },
)
