// `pnpm backup`: writes backups/tickr-<date>-<time>.zip (or into BACKUP_DIR)
// from whichever backend .env.local selects. Schedule it with cron or pm2, e.g.
//   pm2 start "pnpm backup" --name tickr-backup --cron "0 3 * * *" --no-autorestart
import path from 'path'
import { createBackup } from '../lib/backup'

async function main() {
  // Same files as `next start`, highest priority first: a variable that's
  // already set is kept, so the first file to define it wins
  for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    try {
      process.loadEnvFile(file)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
  const { getRepository } = await import('../lib/db')
  const file = await createBackup({
    repo: getRepository(),
    uploadsDir: path.join(process.cwd(), 'public', 'uploads'),
    outDir: process.env.BACKUP_DIR ?? path.join(process.cwd(), 'backups'),
  })
  console.log(`Backup written to ${file}`)
}

main().then(
  // Postgres/MySQL pools keep the process alive otherwise
  () => process.exit(0),
  (err) => {
    console.error('Backup failed:', err)
    process.exit(1)
  },
)
