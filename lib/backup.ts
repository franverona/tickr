import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'
import JSZip from 'jszip'
import type { TaskRepository } from './db/types'
import { localDateKey } from './dates'
import { exportTagsToJSON, exportToJSON, referencedUploads, relativizeUploads } from './export'

// Writes a ZIP in the same format as the browser export (tasks.json plus the
// uploads/ its descriptions reference), so it restores with the regular
// Import. Keeps only the newest `keep` backups in outDir.
export async function createBackup({
  repo,
  uploadsDir,
  outDir,
  now = new Date(),
  keep = 30,
}: {
  repo: TaskRepository
  uploadsDir: string
  outDir: string
  now?: Date
  keep?: number
}): Promise<string> {
  const [tasks, tags] = await Promise.all([repo.getTasks(), repo.getTags()])

  const zip = new JSZip()
  const archived = tasks.map((t) => ({ ...t, description: relativizeUploads(t.description) }))
  zip.file('tasks.json', exportToJSON(archived, tags))
  zip.file('tags.json', exportTagsToJSON(tags))
  for (const uploadPath of referencedUploads(tasks)) {
    const name = path.basename(uploadPath)
    try {
      zip.file(`uploads/${name}`, await readFile(path.join(uploadsDir, name)))
    } catch {
      console.warn(`Skipping missing upload: ${name}`)
    }
  }

  await mkdir(outDir, { recursive: true })
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join('')
  const file = path.join(outDir, `tickr-${localDateKey(now)}-${time}.zip`)
  await writeFile(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))

  // Names sort chronologically, so everything before the last `keep` is older
  const old = (await readdir(outDir))
    .filter((f) => /^tickr-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/.test(f))
    .sort()
    .slice(0, -keep)
  await Promise.all(old.map((f) => rm(path.join(outDir, f))))
  return file
}
