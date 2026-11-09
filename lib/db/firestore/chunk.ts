// Firestore caps a batch at 500 operations and a commit at 10 MiB. An item over
// `maxBytes` gets its own chunk, where Firestore rejects it.
export function chunk<T>(
  items: T[],
  size = 500,
  bytes?: (item: T) => number,
  maxBytes = 9 * 1024 * 1024,
): T[][] {
  const out: T[][] = []
  let current: T[] = []
  let currentBytes = 0
  for (const item of items) {
    const b = bytes ? bytes(item) : 0
    if (current.length > 0 && (current.length === size || currentBytes + b > maxBytes)) {
      out.push(current)
      current = []
      currentBytes = 0
    }
    current.push(item)
    currentBytes += b
  }
  if (current.length > 0) out.push(current)
  return out
}
