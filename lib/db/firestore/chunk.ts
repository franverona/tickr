// Firestore caps WriteBatch/transactions at 500 operations. Used anywhere a
// batch could exceed that (reorderTasks, deleteTag's fan-out, importTasks).
export function chunk<T>(items: T[], size = 500): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
