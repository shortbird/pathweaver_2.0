import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildStepsReceiptHtml, printStepsReceipt } from './stepsReceiptPrinter'

const steps = [
  {
    id: '1',
    title: 'Gather your materials',
    description: 'Snap a photo of your setup.',
    is_completed: true,
    sub_steps: [
      { id: '1a', title: 'Find scissors & glue', description: null, is_completed: false, sub_steps: [] }
    ]
  },
  { id: '2', title: 'Sketch your design', description: null, is_completed: false, sub_steps: [] }
]

describe('buildStepsReceiptHtml', () => {
  it('renders header, task title, and every step including nested sub-steps', () => {
    const html = buildStepsReceiptHtml({
      orgName: 'The Treehouse',
      studentName: 'Robin',
      taskTitle: 'Build a birdhouse',
      steps
    })
    expect(html).toContain('The Treehouse')
    expect(html).toContain('Robin')
    expect(html).toContain('Build a birdhouse')
    expect(html).toContain('Gather your materials')
    expect(html).toContain('Snap a photo of your setup.')
    expect(html).toContain('Sketch your design')
    expect(html).toContain('Find scissors &amp; glue')
    expect(html).toContain('class="step depth-1"')
  })

  it('marks completed steps and leaves open steps unchecked', () => {
    const html = buildStepsReceiptHtml({ taskTitle: 'Task', steps })
    expect(html).toContain('box done')
    expect((html.match(/box done/g) || []).length).toBe(1)
  })

  it('lays out inside the printable width of 62mm tape, not the full tape', () => {
    const html = buildStepsReceiptHtml({ taskTitle: 'Task', steps })
    expect(html).toContain('@page { size: 62mm auto; margin: 0; }')
    expect(html).toContain('width: 59mm;')
  })

  it('honors a different tape width', () => {
    const html = buildStepsReceiptHtml({ taskTitle: 'Task', steps, tapeWidthMm: 29 })
    expect(html).toContain('@page { size: 29mm auto; margin: 0; }')
    expect(html).toContain('width: 26mm;')
  })

  it('pins the page height to the rendered content instead of leaving it auto', () => {
    const html = buildStepsReceiptHtml({ taskTitle: 'Task', steps })
    expect(html).toContain('document.body.scrollHeight')
    expect(html).toContain("'@page { size: 62mm ' + heightMm + 'mm; margin: 0; }'")
  })

  it('escapes HTML in AI-generated text', () => {
    const html = buildStepsReceiptHtml({
      taskTitle: '<script>alert(1)</script>',
      steps: [{ id: '1', title: '<b>bold</b>', description: null, is_completed: false, sub_steps: [] }]
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })
})

describe('printStepsReceipt', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns false when there are no steps', () => {
    expect(printStepsReceipt({ taskTitle: 'Task', steps: [] })).toBe(false)
  })

  it('returns false when the popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    expect(printStepsReceipt({ taskTitle: 'Task', steps })).toBe(false)
  })

  it('writes the receipt into the opened window', () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue({ document: doc })
    expect(printStepsReceipt({ taskTitle: 'Build a birdhouse', steps })).toBe(true)
    expect(doc.write).toHaveBeenCalledWith(expect.stringContaining('Build a birdhouse'))
    expect(doc.close).toHaveBeenCalled()
  })
})
