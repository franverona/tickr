// `pnpm backup`: writes backups/tickr-<date>-<time>.zip (or into BACKUP_DIR)
// from whichever backend .env.local selects. Schedule it with cron or pm2, e.g.
//   pm2 start "pnpm backup" --name tickr-backup --cron "0 3 * * *" --no-autorestart
import path from 'path'
import { createBackup } from '../lib/backup'

async function main() {
  try {
    process.loadEnvFile('.env.local') // same DB_TYPE/DATABASE_URL as the app
  } catch {
    // no .env.local: SQLite defaults
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
