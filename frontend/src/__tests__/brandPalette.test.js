import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Ratchet: hard-coded colours in v1 may shrink, never grow (QF-07).
 *
 * CLAUDE.md rule 5 says use `optio-purple` / `optio-pink`, not raw hex. The
 * measurement behind this test, taken 2026-09-03:
 *
 *   493 hex literals in src/
 *     200 are brand colours written as hex -- a mechanical swap to the token
 *     293 are off-palette, across 88 distinct values
 *
 * The off-palette 293 are mostly Tailwind's own greys spelled out
 * (`#e5e7eb`, `#6b7280`, `#9ca3af`) plus one-off pinks, greens and blues that
 * drifted in. Converting them is a visual change to real screens and needs
 * somebody looking at the result, so this does not ask for that. It asks that
 * the number stop climbing.
 *
 * A CORRECTION to the audit while measuring: it lists `#af56e5` and `#2469d1`
 * as off-palette. They are not -- both are DEFINED in tailwind.config.js, as
 * `pillar-art` and `pillar-stem`. They are brand colours written the long way,
 * which is the 200 bucket, not the 293.
 */

const ROOT = path.resolve(__dirname, '..')
const CONFIG = path.resolve(__dirname, '../../tailwind.config.js')

/** Measured 2026-09-03. Ratchet DOWN as colours move to tokens. */
const OFF_PALETTE_BASELINE = 293
const SLACK = 40

const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g

/** Every colour the design system actually sanctions. */
function palette() {
  const cfg = fs.readFileSync(CONFIG, 'utf8')
  return new Set((cfg.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((h) => h.toLowerCase()))
}

function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      sourceFiles(full, acc)
    } else if (/\.(jsx?|css)$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

function countHex() {
  const sanctioned = palette()
  let inPalette = 0
  const offPalette = new Map()
  for (const file of sourceFiles(ROOT)) {
    for (const raw of fs.readFileSync(file, 'utf8').match(HEX) || []) {
      const hex = raw.toLowerCase()
      if (sanctioned.has(hex)) inPalette += 1
      else offPalette.set(hex, (offPalette.get(hex) || 0) + 1)
    }
  }
  const offTotal = [...offPalette.values()].reduce((a, b) => a + b, 0)
  return { inPalette, offTotal, distinct: offPalette.size }
}

describe('brand palette', () => {
  it('the config is readable and defines the brand colours', () => {
    // If this ever globs the wrong file the palette is empty, every hex reads
    // as off-palette, and the ratchet becomes noise.
    const p = palette()
    expect(p.size).toBeGreaterThan(20)
    expect(p.has('#6d469b')).toBe(true) // optio-purple
    expect(p.has('#ef597b')).toBe(true) // optio-pink
  })

  it('off-palette colours do not multiply', () => {
    const { offTotal, distinct } = countHex()
    expect(
      offTotal,
      `${offTotal} off-palette hex literals across ${distinct} distinct values, `
      + `baseline ${OFF_PALETTE_BASELINE}. Use a tailwind token `
      + '(optio-purple / optio-pink / pillar-*) rather than adding another one.',
    ).toBeLessThanOrEqual(OFF_PALETTE_BASELINE)
  })

  it('has a baseline that still means something', () => {
    const { offTotal } = countHex()
    expect(
      offTotal,
      `Only ${offTotal} off-palette hex literals against a baseline of `
      + `${OFF_PALETTE_BASELINE}. Lower OFF_PALETTE_BASELINE to ${offTotal}.`,
    ).toBeGreaterThan(OFF_PALETTE_BASELINE - SLACK)
  })
})
