// Same files as `next start`, highest priority first: a variable that's
// already set is kept, so the first file to define it wins
export function loadEnv(): void {
  for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    try {
      process.loadEnvFile(file)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
}
