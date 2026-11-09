import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'
import JSZip from 'jszip'
import type { TaskRepository } from './db/types'
import { localDateKey } from './dates'
import { exportTagsToJSON, exportToJSON, referencedUploads, relativizeUploads } from './export'

// Same ZIP format as the browser export, so it restores with Import. Keeps the newest `keep`.
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
    } catch (err) {
      // Only a missing file is skippable: any other read error would silently
      // drop an attachment from every backup from now on
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      console.warn(`Skipping missing upload: ${name}`)
    }
  }

  await mkdir(outDir, { recursive: true })
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join('')
  // An empty backup usually means the wrong backend: name it so retention ignores it
  const suffix = tasks.length === 0 ? '-empty' : ''
  const file = path.join(outDir, `tickr-${localDateKey(now)}-${time}${suffix}.zip`)
  await writeFile(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))

  if (tasks.length === 0) {
    console.warn('Backup has no tasks: keeping every older backup')
    return file
  }

  // Names sort chronologically, so everything before the last `keep` is older
  const old = (await readdir(outDir))
    .filter((f) => /^tickr-\d{4}-\d{2}-\d{2}-\d{6}\.zip$/.test(f))
    .sort()
    .slice(0, -keep)
  await Promise.all(old.map((f) => rm(path.join(outDir, f))))
  return file
}
