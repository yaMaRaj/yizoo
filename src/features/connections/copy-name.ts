/** Next name for a duplicated profile: `<base>-N`, N = max existing suffix + 1. */
export function nextCopyName(baseName: string, existingNames: string[]): string {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^${escaped}-(\\d+)$`)
  let max = 0
  for (const name of existingNames) {
    const m = name.match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${baseName}-${max + 1}`
}
