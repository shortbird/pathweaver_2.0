/**
 * One colour per subject, everywhere: its shared accent (2026-09-28).
 *
 * Before this the badges, the transfer-credit form and the demo each kept a
 * map of their own, so Fine Arts was pink on a badge, magenta on a class and
 * Financial Literacy was purple in the demo. The fence is that no web file may
 * write a subject key next to a colour: pick it from constants/subjects.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { SUBJECTS, subjectColor, subjectTint, SUBJECT_FALLBACK_COLOR } from '../subjects'
import SubjectBadges from '../../components/common/SubjectBadges'

const SRC = path.resolve(__dirname, '../..')

const sourceFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full)
    return /\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : []
  })

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

describe('subject colours', () => {
  it('gives every subject its shared accent, and a distinct one', () => {
    const colours = SUBJECTS.map((s) => subjectColor(s.key))
    SUBJECTS.forEach((s, i) => expect(colours[i]).toBe(s.accent))
    expect(new Set(colours).size).toBe(SUBJECTS.length)
  })

  it('answers to the name a task stores its credit under, not just the key', () => {
    // user_quest_tasks.subject_xp_distribution is keyed by NAME. A key-only
    // lookup turned Digital Literacy and Fine Arts the same grey on one task.
    for (const s of SUBJECTS) expect(subjectColor(s.name)).toBe(s.accent)
    expect(subjectColor('Career & Technical Education')).toBe(subjectColor('cte'))
  })

  it('falls back to grey for a key it does not know', () => {
    expect(subjectColor('underwater_basket_weaving')).toBe(SUBJECT_FALLBACK_COLOR)
    expect(subjectTint(null).color).toBe(SUBJECT_FALLBACK_COLOR)
  })

  it('paints the badge in the same accent', () => {
    for (const s of SUBJECTS) {
      const { container, unmount } = render(<SubjectBadges subjectXpDistribution={{ [s.key]: 50 }} />)
      expect(container.querySelector('[style*="color"]').getAttribute('style')).toContain(hexToRgb(s.accent))
      unmount()
    }
  })

  it('has no hand-written subject colour map anywhere in web/src', () => {
    const keys = SUBJECTS.map((s) => s.key).join('|')
    // `fine_arts: '#EC4899'`, `'math': 'bg-green-100 ...'`, `pe: { color: ... }`
    const map = new RegExp(`['"]?\\b(${keys})['"]?\\s*:\\s*(\\{[^}\\n]*\\b(color|bg|text)\\b|['"](#[0-9a-fA-F]{3,8}|(bg|text|border|from)-))`)
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.endsWith(path.join('constants', 'subjects.js')))
      .flatMap((file) =>
        fs.readFileSync(file, 'utf8').split('\n')
          .map((line, i) => (map.test(line) ? `${path.relative(SRC, file)}:${i + 1}: ${line.trim()}` : null))
          .filter(Boolean)
      )
    expect(offenders).toEqual([])
  })
})
