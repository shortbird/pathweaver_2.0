/**
 * Ticket 9200a103, item 4 (Tanner, 2026-09-22 and 2026-10-13): the transcript
 * prints conventional course names that Optio's office sets. Unnamed Optio
 * credit prints under the subject's name; the office can split a subject's
 * Optio credit (earned plus class) into named courses; what the courses do not
 * hold prints under the subject's name.
 */
import { describe, it, expect } from 'vitest'
import { buildTranscriptRows, optioBreakdown } from './transcriptRows'

const DATA = {
  earned_credits: { math: { display_name: 'Mathematics', credits: 2.5 } },
  class_credits: [
    { school_subject: 'math', display_name: 'Mathematics', course_name: 'Puzzle Club', credits: 0.5 },
    { school_subject: 'fine_arts', display_name: 'Fine Arts', course_name: 'Pipe Organ Encounter', credits: 0.5 },
  ],
  transfer_credits: [{
    id: 'tc1', school_name: 'Green Canyon High',
    subjects: { language_arts: { display_name: 'Language Arts', credits: 1 } },
    course_names: { language_arts: [{ name: 'English 9', credits: 1, grade: 'B' }] },
  }],
  planned_credits: [{ id: 'p1', display_name: 'Health', course_name: 'First Aid', credits: 0.5, status: 'in_progress' }],
}

const summary = (rows) => rows.map(r => [r.subject, r.course, r.credits])

describe('buildTranscriptRows', () => {
  it('prints unnamed Optio and class credit under the subject name', () => {
    const rows = buildTranscriptRows(DATA, {})
    expect(summary(rows)).toEqual([
      ['Fine Arts', 'Fine Arts', 0.5],
      ['Language Arts', 'English 9', 1],
      ['Mathematics', 'Mathematics', 2.5],
      ['Mathematics', 'Mathematics', 0.5],
    ])
    expect(rows.map(r => r.course)).not.toContain('Optio Competency-Based')
    expect(rows.map(r => r.course)).not.toContain('Puzzle Club')
  })

  it('keeps a name the office already typed on an earned or class row', () => {
    // Three prod transcripts carry these keys today (2026-10-13).
    const rows = buildTranscriptRows(DATA, {
      earned_course_math: 'Kenya Mathematics',
      class_courses_fine_arts: 'Pipe Organ Encounter',
    })
    expect(rows.find(r => r.type === 'earned').course).toBe('Kenya Mathematics')
    expect(rows.find(r => r.subject === 'Fine Arts').course).toBe('Pipe Organ Encounter')
  })

  it('splits earned plus class credit into named courses and prints the rest under the subject', () => {
    const rows = buildTranscriptRows(DATA, {
      earned_course_math: 'Ignored once a breakdown exists',
      optio_courses_math: [{ name: 'Algebra I', credits: 1 }, { name: 'Geometry', credits: 1 }],
    })
    const math = rows.filter(r => r.subject === 'Mathematics')
    expect(summary(math)).toEqual([
      ['Mathematics', 'Algebra I', 1],
      ['Mathematics', 'Geometry', 1],
      ['Mathematics', 'Mathematics', 1],
    ])
    expect(math.every(r => r.type === 'optio' && r.source === 'Optio')).toBe(true)
    expect(math[2].unassigned).toBe(true)
    // The breakdown replaces both the earned and the class row.
    expect(rows.some(r => r.type === 'earned' || (r.type === 'class' && r.subject === 'Mathematics'))).toBe(false)
  })

  it('never prints more credit than was earned when credit falls under the breakdown', () => {
    const rows = buildTranscriptRows(DATA, {
      optio_courses_math: [{ name: 'Algebra I', credits: 2 }, { name: 'Geometry', credits: 2 }],
    })
    const math = rows.filter(r => r.subject === 'Mathematics')
    expect(summary(math)).toEqual([
      ['Mathematics', 'Algebra I', 2],
      ['Mathematics', 'Geometry', 1],
    ])
  })

  it('totals match with or without a breakdown', () => {
    const sum = (rows) => rows.reduce((s, r) => s + r.credits, 0)
    const plain = sum(buildTranscriptRows(DATA, {}))
    const split = sum(buildTranscriptRows(DATA, { optio_courses_math: [{ name: 'Algebra I', credits: 0.75 }] }))
    expect(split).toBeCloseTo(plain)
  })

  it('leaves planned credit off unless the editor asks for it', () => {
    expect(buildTranscriptRows(DATA, {}).some(r => r.type === 'planned')).toBe(false)
    const editor = buildTranscriptRows(DATA, {}, { includePlanned: true })
    expect(editor.find(r => r.type === 'planned').status).toBe('In Progress')
  })

  it('keeps the transfer breakdown and its original grade', () => {
    const row = buildTranscriptRows(DATA, {}).find(r => r.type === 'transfer')
    expect(row).toMatchObject({ course: 'English 9', grade: 'B', hasCourseBreakdown: true })
  })
})

describe('optioBreakdown', () => {
  it('drops blank and zero-credit courses and ignores a non-list value', () => {
    expect(optioBreakdown({ optio_courses_math: [{ name: ' ', credits: 1 }, { name: 'Algebra I', credits: 0 }, { name: 'Geometry', credits: '0.5' }] }, 'math'))
      .toEqual([{ name: 'Geometry', credits: 0.5 }])
    expect(optioBreakdown({ optio_courses_math: 'Algebra' }, 'math')).toEqual([])
    expect(optioBreakdown(undefined, 'math')).toEqual([])
  })
})
