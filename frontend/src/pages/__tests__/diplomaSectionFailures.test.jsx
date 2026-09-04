import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * QF-05: a section that fails to load must not look like a section with
 * nothing in it.
 *
 * DiplomaPage fetches five sections independently so one failure cannot blank
 * the others -- which is right. What was wrong is what happened next: every
 * rejection went to `console.error` and the section rendered EMPTY,
 * indistinguishable from "this student has none of these yet". A parent looking
 * at a diploma with no transfer credits could not tell whether the credits were
 * missing or the request was.
 *
 * The pattern turned out narrower than the audit suggested -- all 13
 * swallow-to-console handlers were in this one file, not "and elsewhere" --
 * which is what made a real fix tractable rather than a sweep.
 *
 * These test the reporting rule directly. Rendering the whole page would need
 * AuthContext, the router and six API mocks, and would mostly be testing mocks.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = fs.readFileSync(path.join(SRC, 'DiplomaPage.jsx'), 'utf8')

/** The helper as written in the page, exercised directly. */
function reportSectionFailures(results, labels, toast, log) {
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? labels[i] : null))
    .filter(Boolean)
  if (!failed.length) return
  log('[Diploma] sections failed to load:', failed)
  toast(`Could not load: ${failed.join(', ')}. Everything else is up to date.`)
}

describe('diploma section failures', () => {
  let toast
  let log

  beforeEach(() => {
    toast = vi.fn()
    log = vi.fn()
  })

  it('says nothing when every section loads', () => {
    reportSectionFailures(
      [{ status: 'fulfilled' }, { status: 'fulfilled' }],
      ['achievements', 'subject credits'], toast, log,
    )
    expect(toast).not.toHaveBeenCalled()
  })

  it('names the sections that failed, and only those', () => {
    reportSectionFailures(
      [{ status: 'fulfilled' }, { status: 'rejected' }, { status: 'rejected' }],
      ['achievements', 'subject credits', 'learning moments'], toast, log,
    )
    expect(toast).toHaveBeenCalledTimes(1)
    const message = toast.mock.calls[0][0]
    expect(message).toContain('subject credits')
    expect(message).toContain('learning moments')
    expect(message).not.toContain('achievements')
  })

  it('says the rest of the page is still good', () => {
    // Without this the message reads as "the diploma is broken", and a parent
    // has no way to know the credits they CAN see are current.
    reportSectionFailures([{ status: 'rejected' }], ['transfer credits'], toast, log)
    expect(toast.mock.calls[0][0]).toContain('Everything else is up to date')
  })

  describe('the page itself', () => {
    it('no longer swallows rejections into console.error', () => {
      // The old shape was `.catch(err => console.error(...))` on each fetch,
      // which ALSO converted every rejection into a fulfilled promise -- so
      // nothing downstream could have told which section failed even if it
      // wanted to.
      expect(PAGE).not.toMatch(/\.catch\(\s*err\s*=>\s*console\.error/)
    })

    it('reports failures from every allSettled block', () => {
      const blocks = PAGE.match(/Promise\.allSettled\(/g) || []
      const reports = PAGE.match(/reportSectionFailures\(/g) || []
      expect(blocks.length).toBeGreaterThan(0)
      // One call per block. The definition reads `const reportSectionFailures =
      // useCallback(`, so it does not match this pattern and is not counted.
      expect(reports.length).toBe(blocks.length)
    })
  })
})
