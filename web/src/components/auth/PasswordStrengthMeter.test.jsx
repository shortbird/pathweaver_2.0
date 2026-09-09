import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PasswordStrengthMeter from './PasswordStrengthMeter'

describe('PasswordStrengthMeter', () => {
  it('returns null when password is empty', () => {
    const { container } = render(<PasswordStrengthMeter password="" />)
    expect(container.firstChild).toBeNull()
  })

  it('returns null when password is undefined', () => {
    const { container } = render(<PasswordStrengthMeter password={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders strength bar when password is provided', () => {
    render(<PasswordStrengthMeter password="a" />)
    expect(screen.getByText('Password Strength')).toBeInTheDocument()
  })

  it('shows "Very Weak" for short simple password', () => {
    render(<PasswordStrengthMeter password="abc" />)
    expect(screen.getByText('Very Weak')).toBeInTheDocument()
  })

  it('shows "Strong" for long complex password', () => {
    render(<PasswordStrengthMeter password="MyStr0ng!Pass#2024xy" />)
    expect(screen.getByText('Strong')).toBeInTheDocument()
  })

  it('shows all 5 requirement items', () => {
    render(<PasswordStrengthMeter password="a" />)
    expect(screen.getByText('At least 12 characters')).toBeInTheDocument()
    expect(screen.getByText('One uppercase letter (A-Z)')).toBeInTheDocument()
    expect(screen.getByText('One lowercase letter (a-z)')).toBeInTheDocument()
    expect(screen.getByText('One digit (0-9)')).toBeInTheDocument()
    expect(screen.getByText('One special character (!@#$...)')).toBeInTheDocument()
  })

  it('marks length requirement as met for 12+ char password', () => {
    render(<PasswordStrengthMeter password="abcdefghijkl" />)
    const lengthText = screen.getByText('At least 12 characters')
    expect(lengthText).toHaveClass('text-green-700')
  })

  it('marks uppercase requirement as met', () => {
    render(<PasswordStrengthMeter password="A" />)
    const reqText = screen.getByText('One uppercase letter (A-Z)')
    expect(reqText).toHaveClass('text-green-700')
  })

  it('marks digit requirement as met', () => {
    render(<PasswordStrengthMeter password="5" />)
    const reqText = screen.getByText('One digit (0-9)')
    expect(reqText).toHaveClass('text-green-700')
  })

  it('marks special character requirement as met', () => {
    render(<PasswordStrengthMeter password="!" />)
    const reqText = screen.getByText('One special character (!@#$...)')
    expect(reqText).toHaveClass('text-green-700')
  })

  it('shows error box when requirements not met', () => {
    render(<PasswordStrengthMeter password="short" />)
    expect(screen.getByText('Password requirements not met:')).toBeInTheDocument()
  })
})
