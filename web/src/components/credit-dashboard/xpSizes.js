/**
 * The only XP values a reviewer can award (backend config.constants.TASK_XP_SIZES).
 *
 * The task creators offer the same sizes, the AI sizes to them, and since
 * 2026-09-29 the server refuses any other award. A student's legacy claim off
 * the scale (120) can still be kept as it is; it just cannot be chosen.
 */
export const XP_SIZES = [25, 50, 75, 100, 150, 200]

export const isXpSize = (value) => XP_SIZES.includes(value)

/** The next size above (dir 1) or below (dir -1) `value`, stopping at the ends. */
export const stepXp = (value, dir) => {
  const n = Number(value)
  if (dir > 0) return XP_SIZES.find(s => s > n) ?? XP_SIZES[XP_SIZES.length - 1]
  return [...XP_SIZES].reverse().find(s => s < n) ?? XP_SIZES[0]
}

/** The size nearest `value`, the smaller one on a tie. Null for no number. */
export const snapXp = (value) => {
  const n = Number(value)
  if (value === '' || value == null || Number.isNaN(n)) return null
  return XP_SIZES.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), XP_SIZES[0])
}

export const XP_SIZES_TEXT = `${XP_SIZES.slice(0, -1).join(', ')} or ${XP_SIZES[XP_SIZES.length - 1]}`
