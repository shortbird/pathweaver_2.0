import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import fs from 'fs'
import path from 'path'

import Alert from '../Alert'
import Button from '../Button'
import Card from '../Card'
import EmptyState from '../EmptyState'
import FormField from '../FormField'
import Input from '../Input'
import RolePill from '../RolePill'
import Skeleton from '../Skeleton'
import Spinner from '../Spinner'
import StatusBadge from '../StatusBadge'

/**
 * Accessibility smoke tests (QF-08).
 *
 * `vitest-axe`, `jest-axe` and `axe-core` have been devDependencies for a long
 * time with ZERO imports. The item's choice was "wire them up or remove the
 * dead deps"; this wires them up.
 *
 * SCOPE, deliberately: the shared UI primitives in components/ui, not the top
 * pages. A page here drags in AuthContext, the router and a dozen API calls, so
 * a page-level axe test is mostly a mocking exercise and goes red for reasons
 * that have nothing to do with accessibility. These components are rendered by
 * nearly every page, so a violation in one of them is a violation everywhere --
 * which is the leverage worth having, and it needs no mocking.
 *
 * These are SMOKE tests. axe catches perhaps a third of real accessibility
 * problems and nothing at all about whether the thing makes sense to somebody
 * using a screen reader. Passing is not a claim that the app is accessible.
 */

const cases = [
  ['Alert', <Alert type="error">Something went wrong</Alert>],
  ['Button', <Button>Save</Button>],
  ['Button (disabled)', <Button disabled>Save</Button>],
  ['Card', <Card><p>Body</p></Card>],
  ['EmptyState', <EmptyState title="Nothing here" description="Add one to start" />],
  ['Input', <Input aria-label="Search" />],
  ['RolePill', <RolePill role="student" />],
  ['Skeleton', <Skeleton />],
  ['Spinner', <Spinner />],
  ['StatusBadge', <StatusBadge status="active" />],
]

describe('shared UI primitives have no obvious a11y violations', () => {
  it.each(cases)('%s', async (_name, element) => {
    const { container } = render(element)
    const results = await axe(container)
    expect(results.violations).toEqual([])
  })
})

describe('clickable divs', () => {
  // A <div onClick> is invisible to keyboard and screen-reader users: no focus,
  // no Enter/Space, no role. A RATCHET rather than a ban -- converting each one
  // is a behavioural change to a real screen, and doing them blind is how you
  // break a modal's close button.
  //
  // 142, not the 36 the audit counted. The difference is real rather than
  // drift: a single-line grep only sees `<div onClick=` when both sit on one
  // line, and most JSX spreads its attributes over several. `[^>]*` in a JS
  // regex crosses newlines, so this counts the multi-line ones too.
  const BASELINE = 142

  it('do not multiply', () => {
    const SRC = path.resolve(__dirname, '../../..')
    const found = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '__tests__') continue
          walk(full)
        } else if (/\.jsx$/.test(entry.name) && !/\.test\.jsx$/.test(entry.name)) {
          const body = fs.readFileSync(full, 'utf8')
          const matches = body.match(/<div[^>]*\sonClick=/g)
          if (matches) found.push(...matches.map(() => path.relative(SRC, full)))
        }
      }
    }
    walk(SRC)
    expect(
      found.length,
      `${found.length} <div onClick> against a baseline of ${BASELINE}. `
      + 'Use a <button>, or add role="button" with tabIndex and a key handler. '
      + 'A clickable div cannot be reached by keyboard at all.',
    ).toBeLessThanOrEqual(BASELINE)
  })
})
