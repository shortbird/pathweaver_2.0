import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { codeLines, filesUnder as walk, TEST_FILE } from '../tests/sourceScan.js'

/**
 * The web half of the SIS concept manifest (shared/sisConcepts.json).
 *
 * The SIS console was built in eleven one-day rounds, each adding a feature
 * beside the one that already did most of the job: ten copies of `money()`,
 * seventeen components that spread-and-PUT the whole feature_flags blob,
 * twenty-nine pages that mount the org picker themselves. The audit that
 * counted them (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md) found seventeen
 * new duplicates three days after its first pass. The merges are planned
 * (docs/sis/CONSOLIDATION_PLAN.md); this freezes the counts so the merges can
 * catch up.
 *
 * One manifest names each concept, its owner, and the pattern that spells a
 * copy. Per row with a `forbid.web`, this asserts a ceiling (no more copies
 * than the baseline), a floor (no fewer: a copy that was genuinely removed
 * lowers the baseline in the same commit, and a scan that finds nothing must
 * not pass), and freshness (owners exist unless the row is `proposed`; a
 * proposed row whose owners have all arrived must drop the flag). The failing
 * message prints every path:line and the row's `use_instead` sentence.
 *
 * backend/tests/unit/test_sis_concepts.py and mobile/src/__tests__/
 * sisConcepts.test.ts read the same file for their sides. The scanning rules
 * must agree across the three; the manifest's `_comment` is the contract.
 *
 * Scanning rules, per side: `pattern` is applied line by line after comments
 * are blanked (tests/sourceScan.js: block comments become blank lines so
 * positions hold; a line that starts with `//` or `*` is a comment; ` // `
 * later in a line starts one). `dirs` are roots relative to web/src, a file
 * path scanning that file. `files` are paths whose existence counts one each.
 * `unit: 'files'` counts files with a match rather than lines. `exempt` paths
 * are left out, and default to the row's owners. Test files are never scanned.
 */

const SRC = path.resolve(__dirname, '..')
const MANIFEST = path.resolve(__dirname, '../../../shared/sisConcepts.json')
const SIDE = 'web'

function scan(row) {
  const forbid = row.forbid[SIDE]
  const exempt = new Set(forbid.exempt ?? row.owner?.[SIDE] ?? [])
  let hits = []
  if (forbid.pattern) {
    const rx = new RegExp(forbid.pattern)
    const seen = new Set()
    for (const entry of forbid.dirs || []) {
      for (const rel of walk(SRC, entry)) {
        if (seen.has(rel) || exempt.has(rel)) continue
        seen.add(rel)
        const lines = codeLines(fs.readFileSync(path.join(SRC, rel), 'utf8'))
        lines.forEach((line, i) => { if (rx.test(line)) hits.push(`${rel}:${i + 1}`) })
      }
    }
  }
  if (forbid.unit === 'files') hits = [...new Set(hits.map((h) => h.slice(0, h.lastIndexOf(':'))))].sort()
  for (const rel of forbid.files || []) {
    if (fs.existsSync(path.join(SRC, rel))) hits.push(`${rel} (exists)`)
  }
  return hits
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
const rows = manifest.concepts.filter((r) => r.forbid && r.forbid[SIDE])

function explain(row, hits) {
  const owners = row.owner?.[SIDE]?.join(', ') || '(none on this side)'
  const proposed = row.proposed ? ` (proposed; created by ${row.lowered_by})` : ''
  return [
    '',
    `Concept \`${row.id}\`: ${row.means}`,
    `Owner: ${owners}${proposed}`,
    'Copies found:',
    ...(hits.length ? hits.map((h) => `    ${h}`) : ['    (none)']),
    `Use instead: ${row.use_instead}`,
    `Manifest: shared/sisConcepts.json (lowered by ${row.lowered_by}).`,
  ].join('\n')
}

describe('shared/sisConcepts.json, web side', () => {
  it('is well formed', () => {
    const ids = manifest.concepts.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const row of manifest.concepts) {
      for (const key of ['id', 'means', 'baseline', 'measured', 'lowered_by', 'use_instead']) {
        expect(row, `${row.id}: missing ${key}`).toHaveProperty(key)
      }
      expect(Boolean(row.forbid || row.enforced_by), `${row.id}: needs forbid or enforced_by`).toBe(true)
      expect(Number.isNaN(Date.parse(row.measured)), `${row.id}: measured is not a date`).toBe(false)
      for (const [side, cfg] of Object.entries(row.forbid || {})) {
        expect(row.baseline, `${row.id}: forbid.${side} has no baseline.${side}`).toHaveProperty(side)
        expect(Boolean(cfg.pattern || cfg.files), `${row.id}.${side}: needs pattern or files`).toBe(true)
        if (cfg.pattern) {
          expect(cfg.dirs?.length, `${row.id}.${side}: pattern needs dirs`).toBeGreaterThan(0)
          expect(() => new RegExp(cfg.pattern), `${row.id}.${side}: pattern does not compile`).not.toThrow()
        }
      }
    }
  })

  it('finds at least one row for this side', () => {
    expect(rows.length).toBeGreaterThan(10)
  })

  for (const row of rows) {
    describe(row.id, () => {
      it('gains no new copies', () => {
        const hits = scan(row)
        const baseline = row.baseline[SIDE]
        expect(
          hits.length,
          `${hits.length} copies of \`${row.id}\` against a baseline of ${baseline}.${explain(row, hits)}`,
        ).toBeLessThanOrEqual(baseline)
      })

      it('has a baseline that still means something', () => {
        // Floor. A copy that was removed lowers the baseline in the same
        // commit; slack below the real number is the fraction of a fix that
        // can be undone silently, and a scan that finds nothing looks exactly
        // like success (RATCHETS.md rule 3). The numbers are small, so exact.
        const hits = scan(row)
        const baseline = row.baseline[SIDE]
        expect(
          hits.length,
          `Only ${hits.length} copies of \`${row.id}\` against a baseline of ${baseline}. `
          + `If a copy was genuinely removed, lower baseline.${SIDE} to ${hits.length} in `
          + 'shared/sisConcepts.json in this commit. If not, the scan is broken: check '
          + `forbid.${SIDE}.dirs and the pattern.${explain(row, hits)}`,
        ).toBeGreaterThanOrEqual(baseline)
      })

      it('names an owner that is real, or says it is proposed', () => {
        const owners = row.owner?.[SIDE] || []
        if (!owners.length) return
        const missing = owners.filter((o) => !fs.existsSync(path.join(SRC, o)))
        if (row.proposed) {
          expect(
            missing.length,
            `\`${row.id}\` is marked proposed but every web owner exists (${owners.join(', ')}). `
            + `${row.lowered_by} has shipped: remove \`proposed\`.`,
          ).toBeGreaterThan(0)
        } else {
          expect(
            missing,
            `\`${row.id}\` names an owner that does not exist. Either the canonical module `
            + 'moved (update the row) or the row should say `proposed: true`.',
          ).toEqual([])
        }
      })
    })
  }

  it('the scan reads real files', () => {
    // A guard on the guard: a walk that finds nothing, or a stripper that
    // blanks code along with the comments, would pass every ceiling forever.
    const scanned = walk(SRC, 'pages/sis')
    expect(scanned.length, 'the walk under pages/sis found almost nothing').toBeGreaterThan(40)
    expect(scanned.some((p) => TEST_FILE.test(p)), 'test files leaked into the scan').toBe(false)
    const lines = codeLines(fs.readFileSync(path.join(SRC, 'pages/sis/classesPage/CatalogPanel.jsx'), 'utf8'))
    expect(lines.filter((l) => l.trim()).length, 'the stripper blanked the code').toBeGreaterThan(400)
  })

  it('strips comments by the rules the patterns rely on', () => {
    const src = [
      '/** doc that mentions const money = in prose */',
      '// const money = on a comment line',
      'const x = 1 // const money = trailing',
      '<input accept="image/*" />',
      '/**',
      ' * a block comment after code: const money =',
      ' */',
      'const money = (cents) => cents',
      '{/* jsx comment: const money = */}',
    ].join('\n')
    const lines = codeLines(src)
    expect(lines.map((l, i) => (l.includes('const money =') ? i + 1 : null)).filter(Boolean)).toEqual([8])
    expect(lines[3]).toBe('<input accept="image/*" />')
    // Positions hold: a stripped block comment leaves exactly its own lines.
    expect(lines.length).toBe(9)
  })
})
