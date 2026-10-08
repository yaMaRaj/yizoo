/**
 * Match a znode against a search keyword.
 * A name-only keyword matches that node, not every descendant of a hit.
 * A keyword that contains `/` matches the node path itself.
 */
export function pathMatchesKeyword(path: string, keyword: string): boolean {
  const kw = keyword.toLowerCase().trim()
  if (!kw) return false
  if (path === '/') return kw === '/'

  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (!kw.includes('/') && name.includes(kw)) return true
  if (!kw.includes('/')) return false

  const pathLower = path.toLowerCase()
  const needle = kw.startsWith('/') ? kw : `/${kw}`
  return pathLower === needle || pathLower.endsWith(needle)
}
