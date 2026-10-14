import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OptioAcademyAgreement from '../OptioAcademyAgreement'
import OptioAcademyHandbook from '../OptioAcademyHandbook'

// Tanner, 2026-10-14: families upload transcripts themselves on the Prior
// Learning page (the agreement used to say the old school sends them), and
// unaccredited prior learning is $25 a half credit for every student; OpenEd
// families pay $30 in the OpenEd marketplace because OpenEd adds a $5 fee.
// Both pages read these from PRICE_TEXT, so a missing name would print
// "undefined" into the agreement families sign.

const textOf = (ui) => {
  const { container } = render(<MemoryRouter>{ui}</MemoryRouter>)
  return container.textContent.replace(/\s+/g, ' ')
}

describe('Academy transfer credit copy', () => {
  it('the agreement sends records to the Prior Learning page at $25 a half credit', () => {
    const text = textOf(<OptioAcademyAgreement />)
    expect(text).toContain('Families submit records of earlier learning on the Prior Learning page.')
    expect(text).toContain('$25 per half credit')
    expect(text).not.toContain('when that school sends an official transcript')
    expect(text).not.toContain('undefined')
    expect(screen.getByText(/Effective Date: October 14, 2026/)).toBeTruthy()
  })

  it('the handbook gives the one price and the OpenEd marketplace price', () => {
    const text = textOf(<OptioAcademyHandbook />)
    expect(text).toContain('each half credit awarded is $25')
    expect(text).toContain('OpenEd marketplace for $30 a half credit')
    expect(text).not.toContain('undefined')
  })
})
