/**
 * Ticket 9200a103, item 4, then Tanner 2026-10-15 for every student: Optio
 * credit prints in quarter credits, rounded down, as numbered courses named
 * for the subject ("Language Arts 1", "Language Arts 2"), one credit each,
 * with a half-credit course where the requirement ends on a half. Transfer
 * credit prints as recorded and Optio's numbering follows it. A name the
 * office set still wins.
 */
import { describe, it, expect } from 'vitest'
import { buildTranscriptRows, optioBreakdown } from './transcriptRows'

const earned = (credits) => Object.fromEntries(
  Object.entries(credits).map(([subject, [display_name, c]]) => [subject, { display_name, credits: c }]),
)

const DATA = {
  earned_credits: earned({ math: ['Mathematics', 2.5] }),
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

const summary = (rows) => rows.map(r => [r.course, r.credits, r.status])
const sum = (rows) => rows.reduce((s, r) => s + r.credits, 0)

describe('buildTranscriptRows', () => {
  it('prints a whole transcript in numbered quarter-credit courses', () => {
    // A 0.04 Digital Literacy row on a real transcript prompted the rule.
    const rows = buildTranscriptRows({
      earned_credits: earned({
        language_arts: ['Language Arts', 1.8],
        fine_arts: ['Fine Arts', 1.65],
        math: ['Mathematics', 1.18],
        science: ['Science', 1.15],
        social_studies: ['Social Studies', 1],
        electives: ['Electives', 0.5],
        pe: ['Physical Education', 0.5],
        digital_literacy: ['Digital Literacy', 0.04],
      }),
    }, {})
    expect(summary(rows)).toEqual([
      ['Electives 1', 0.5, 'In Progress'],
      ['Fine Arts 1', 1, 'Completed'],
      ['Fine Arts 2', 0.5, 'Completed'],
      ['Language Arts 1', 1, 'Completed'],
      ['Language Arts 2', 0.75, 'In Progress'],
      ['Mathematics 1', 1, 'Completed'],
      ['Physical Education 1', 0.5, 'In Progress'],
      ['Science 1', 1, 'Completed'],
      ['Social Studies 1', 1, 'Completed'],
    ])
    expect(sum(rows)).toBeCloseTo(7.25)
  })

  it('leaves a subject off until it reaches a quarter credit', () => {
    const rows = buildTranscriptRows({ earned_credits: earned({ health: ['Health', 0.24] }) }, {})
    expect(rows).toEqual([])
  })

  it('gives a half-credit subject one half-credit course, then whole credits past it', () => {
    const course = (credits) => summary(buildTranscriptRows(
      { earned_credits: earned({ digital_literacy: ['Digital Literacy', credits] }) }, {},
    ))
    expect(course(0.5)).toEqual([['Digital Literacy 1', 0.5, 'Completed']])
    expect(course(0.7)).toEqual([['Digital Literacy 1', 0.5, 'Completed']])
    expect(course(1)).toEqual([
      ['Digital Literacy 1', 0.5, 'Completed'],
      ['Digital Literacy 2', 0.5, 'In Progress'],
    ])
  })

  it('counts class credit with earned credit in the same subject', () => {
    const rows = buildTranscriptRows(DATA, {})
    expect(summary(rows.filter(r => r.subject === 'Mathematics'))).toEqual([
      ['Mathematics 1', 1, 'Completed'],
      ['Mathematics 2', 1, 'Completed'],
      ['Mathematics 3', 1, 'Completed'],
    ])
    expect(rows.map(r => r.course)).not.toContain('Puzzle Club')
  })

  it('prints transfer credit as recorded and numbers Optio credit after it', () => {
    const rows = buildTranscriptRows({
      ...DATA,
      earned_credits: earned({ language_arts: ['Language Arts', 1.3] }),
    }, {})
    expect(summary(rows.filter(r => r.subject === 'Language Arts'))).toEqual([
      ['English 9', 1, 'Completed'],
      ['Language Arts 2', 1, 'Completed'],
      ['Language Arts 3', 0.25, 'In Progress'],
    ])
  })

  it('keeps a name the office typed and numbers the rest after it', () => {
    // Three prod transcripts carry these keys today (2026-10-15).
    const rows = buildTranscriptRows({
      ...DATA,
      earned_credits: earned({ math: ['Mathematics', 2.5], fine_arts: ['Fine Arts', 0.8] }),
    }, {
      earned_course_math: 'Kenya Mathematics',
      class_courses_fine_arts: 'Pipe Organ Encounter',
    })
    // The named 2.5 credits are half way through Mathematics 3, so the
    // numbered credit finishes it rather than skipping to Mathematics 4.
    expect(summary(rows.filter(r => r.subject === 'Mathematics'))).toEqual([
      ['Kenya Mathematics', 2.5, 'Completed'],
      ['Mathematics 3', 0.5, 'Completed'],
    ])
    expect(rows.find(r => r.course === 'Kenya Mathematics').courseOverrideKey).toBe('earned_course_math')
    expect(summary(rows.filter(r => r.subject === 'Fine Arts'))).toEqual([
      ['Pipe Organ Encounter', 0.5, 'Completed'],
      ['Fine Arts 1', 0.5, 'Completed'],
      ['Fine Arts 2', 0.25, 'In Progress'],
    ])
  })

  it('prints a breakdown into named courses first and numbers the rest', () => {
    const rows = buildTranscriptRows(DATA, {
      earned_course_math: 'Ignored once a breakdown exists',
      optio_courses_math: [{ name: 'Algebra I', credits: 1 }],
    })
    const math = rows.filter(r => r.subject === 'Mathematics')
    expect(summary(math)).toEqual([
      ['Algebra I', 1, 'Completed'],
      ['Mathematics 2', 1, 'Completed'],
      ['Mathematics 3', 1, 'Completed'],
    ])
    expect(math.every(r => r.type === 'optio' && r.source === 'Optio')).toBe(true)
    expect(math.map(r => !!r.hasCourseBreakdown)).toEqual([true, false, false])
  })

  it('never prints more credit than was earned when credit falls under the breakdown', () => {
    const rows = buildTranscriptRows(DATA, {
      optio_courses_math: [{ name: 'Algebra I', credits: 2 }, { name: 'Geometry', credits: 2 }],
    })
    expect(summary(rows.filter(r => r.subject === 'Mathematics'))).toEqual([
      ['Algebra I', 2, 'Completed'],
      ['Geometry', 1, 'Completed'],
    ])
  })

  it('prints the same total with or without names, rounded down to a quarter', () => {
    const data = { ...DATA, earned_credits: earned({ math: ['Mathematics', 2.6] }) }
    const plain = sum(buildTranscriptRows(data, {}))
    // English 9, 3.1 Mathematics printed as 3.0, and 0.5 Fine Arts.
    expect(plain).toBeCloseTo(1 + 3 + 0.5)
    expect(sum(buildTranscriptRows(data, { optio_courses_math: [{ name: 'Algebra I', credits: 0.75 }] }))).toBeCloseTo(plain)
    expect(sum(buildTranscriptRows(data, { earned_course_math: 'Kenya Mathematics' }))).toBeCloseTo(plain)
  })

  it('leaves planned credit off unless the editor asks for it, and lists it last', () => {
    expect(buildTranscriptRows(DATA, {}).some(r => r.type === 'planned')).toBe(false)
    const editor = buildTranscriptRows(DATA, {}, { includePlanned: true })
    expect(editor.at(-1)).toMatchObject({ type: 'planned', status: 'In Progress' })
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
