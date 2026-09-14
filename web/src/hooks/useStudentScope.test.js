import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

let scopeState = { selectedChildId: null, selectedChild: null }
vi.mock('../contexts/FamilyScopeContext', () => ({ useFamilyScope: () => scopeState }))

import { useStudentScope } from './useStudentScope'

describe('useStudentScope', () => {
  it('is empty params and no key dimension when unscoped', () => {
    scopeState = { selectedChildId: null, selectedChild: null }
    const { result } = renderHook(() => useStudentScope())
    expect(result.current).toEqual({
      studentId: null, scopeId: undefined, params: {}, isDelegated: false, studentName: null,
    })
  })

  it('names the child on every request and in every key when scoped', () => {
    scopeState = { selectedChildId: 'kid-1', selectedChild: { id: 'kid-1', firstName: 'Romney' } }
    const { result } = renderHook(() => useStudentScope())
    expect(result.current.params).toEqual({ student_id: 'kid-1' })
    expect(result.current.scopeId).toBe('kid-1')
    expect(result.current.isDelegated).toBe(true)
    expect(result.current.studentName).toBe('Romney')
  })
})
