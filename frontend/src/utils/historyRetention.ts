export function trimHistoryEntries<T extends { created_at: string; saved?: boolean }>(
  items: T[],
  max: number
): T[] {
  const sorted = [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const saved = sorted.filter(item => item.saved === true)
  const unsaved = sorted.filter(item => item.saved !== true)
  const budget = saved.length >= max ? 1 : Math.max(0, max - saved.length)
  return [...saved, ...unsaved.slice(0, budget)].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}
