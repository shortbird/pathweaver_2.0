/**
 * The story editor: the review step for a story that did not publish
 * itself, and the fix-after-the-fact screen for one that did.
 *
 * What is held here: the form loads what the server sent, a title option
 * is one click, Save PUTs the editable subset (assets included), Publish
 * saves first and shows the server's blockers when it refuses, the
 * evidence picker locks an excluded image in the anonymized tier, a video
 * asset renders as a player rather than a thumbnail, a PDF as a link, and
 * the "Words and links" list carries the student's quotations and external
 * links with the same include rules the server enforces.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import api from '../../services/api'
import StoryEditor from './StoryEditor'
import { withConfirm } from '../../tests/confirmTestUtils'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const STORY = {
  id: 'st1',
  status: 'review',
  tier: 'anonymized',
  mode: 'auto',
  title: 'A fall of soccer',
  slug: 'a-fall-of-soccer',
  dek: 'Half a credit of PE from a club season.',
  student_label: 'A middle schooler',
  student_user_id: 'stu1',
  setting: 'academy',
  grade_band: 'middle',
  activity_slug: 'soccer',
  activity_label: 'Club soccer',
  receipt: { activity: 'Fall club soccer', course: 'Physical Education', credit: '0.5 credit', icon: 'ball' },
  subject: 'Physical Education',
  xp_awarded: 250,
  credit_fraction: '0.5',
  hero_asset_id: 'a1',
  error: null,
  ai_draft: { data: { title_options: ['A fall of soccer', 'Soccer, counted', 'Ninety minutes a week'] } },
  faq: [{ q: 'Does club soccer count?', a: 'Yes, with evidence.' }],
  body: {
    sections: [
      { kind: 'what_they_did', body_md: 'Played **a season**.' },
      { kind: 'evidence', items: [] },
      { kind: 'what_reviewer_looked_for', criteria: [{ text: 'Attended every week', verdict: 'met', note: '' }] },
      { kind: 'how_it_went', rounds: [{ round: 1, date: '2026-09-01', action: 'grow_this', feedback_verbatim: 'Add the schedule.', what_changed: 'Added it.' }] },
      { kind: 'what_it_counted_for', body_md: 'Half a credit of PE.' },
    ],
  },
}

const ASSETS = [
  { id: 'a1', thumb_url: 'https://thumbs.test/a1.jpg', alt: 'A ball on grass', caption: '', included: true,
    safety: { verdict: 'safe', reason: 'No faces', faces: 0, readable_text: [] } },
  { id: 'a2', thumb_url: 'https://thumbs.test/a2.jpg', alt: 'The team', caption: '', included: false,
    safety: { verdict: 'excluded', reason: 'Two faces', faces: 2, readable_text: [] } },
]

const response = (overrides = {}) => ({
  success: true,
  story: { ...STORY, ...overrides.story },
  assets: overrides.assets || ASSETS,
  consent: overrides.consent || null,
  blockers: overrides.blockers || [],
  concerns: overrides.concerns || [],
  marketing_url: overrides.marketing_url || null,
})

let loaded

const renderEditor = () => render(withConfirm(
  <MemoryRouter initialEntries={['/admin/stories/st1']}>
    <Routes>
      <Route path="/admin/stories/:storyId" element={<StoryEditor />} />
      <Route path="/admin/stories" element={<p>List</p>} />
    </Routes>
  </MemoryRouter>,
))

beforeEach(() => {
  vi.clearAllMocks()
  loaded = response()
  api.get.mockImplementation(async () => ({ data: loaded }))
  api.put.mockImplementation(async (url, body) => ({ data: { data: { story: { ...loaded.story, ...body } } } }))
  api.post.mockResolvedValue({ data: { success: true, story: { ...STORY, status: 'published' } } })
})

describe('loading', () => {
  it('shows the story, its status and the preview in page order', async () => {
    renderEditor()
    expect(await screen.findByRole('heading', { level: 2, name: 'A fall of soccer' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/api/admin/stories/st1')
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.getByText('anonymized tier')).toBeInTheDocument()

    const preview = screen.getByRole('article', { name: 'Story preview' })
    const headings = within(preview).getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(headings).toEqual([
      'What the student did',
      'What the student submitted as evidence',
      'What the reviewer looked for',
      'How the review went',
      'What it counted for',
      'Questions',
    ])
    expect(within(preview).getByText('a season')).toBeInTheDocument()
    expect(within(preview).getByText('Add the schedule.')).toBeInTheDocument()
  })

  it('offers the AI title options and re-slugs on a click', async () => {
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Soccer, counted' }))
    expect(screen.getByLabelText('Title')).toHaveValue('Soccer, counted')
    expect(screen.getByLabelText('Slug')).toHaveValue('soccer-counted')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })
})

describe('saving', () => {
  it('PUTs the editable subset with the assets', async () => {
    renderEditor()
    fireEvent.change(await screen.findByLabelText('Dek'), { target: { value: 'A new dek.' } })
    fireEvent.change(screen.getByLabelText('Caption for image a1'), { target: { value: 'Match day.' } })
    fireEvent.change(screen.getByLabelText('FAQ answer 1'), { target: { value: 'Yes.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const [url, body] = api.put.mock.calls[0]
    expect(url).toBe('/api/admin/stories/st1')
    expect(body.dek).toBe('A new dek.')
    expect(body.faq).toEqual([{ q: 'Does club soccer count?', a: 'Yes.' }])
    expect(body.assets).toEqual([
      { id: 'a1', included: true, alt: 'A ball on grass', caption: 'Match day.' },
      { id: 'a2', included: false, alt: 'The team', caption: '' },
    ])
    expect(body.body.sections[0]).toEqual({ kind: 'what_they_did', body_md: 'Played **a season**.' })
    expect(body).not.toHaveProperty('student_label')
    expect(body).not.toHaveProperty('ai_draft')
  })

  it('edits a markdown section through the editor', async () => {
    renderEditor()
    const textarea = await screen.findByPlaceholderText('What the student did, in plain words.')
    fireEvent.change(textarea, { target: { value: 'Rewritten.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const body = api.put.mock.calls[0][1]
    expect(body.body.sections.find(s => s.kind === 'what_they_did').body_md).toBe('Rewritten.')
  })
})

describe('publishing', () => {
  it('saves first, then publishes', async () => {
    renderEditor()
    fireEvent.change(await screen.findByLabelText('Dek'), { target: { value: 'Edited.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/admin/stories/st1/publish', {}))
    expect(api.put).toHaveBeenCalledTimes(1)
    expect(api.put.mock.invocationCallOrder[0]).toBeLessThan(api.post.mock.invocationCallOrder[0])
  })

  it('shows the server blockers when publish is refused', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 400, data: { error: { code: 'BLOCKED', message: 'blocked', details: { blockers: [{ code: 'text_leak', field: 'dek', message: 'The dek names a town.' }] } } } },
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))
    await screen.findByText('The dek names a town.')
    expect(screen.getByRole('status', { name: 'Publish blockers' })).toBeInTheDocument()
  })

  it('previews the obvious blockers as the story is typed', async () => {
    renderEditor()
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: '' } })
    expect(screen.getByText('The story needs a title.')).toBeInTheDocument()
  })

  it('cannot publish while the AI is still drafting', async () => {
    loaded = response({ story: { status: 'generating' } })
    renderEditor()
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(screen.getByText(/The AI is drafting this story/)).toBeInTheDocument()
  })

  it('offers Unpublish and the www link on a published story', async () => {
    loaded = response({
      story: { status: 'published' },
      marketing_url: 'https://www.optioeducation.com/stories/a-fall-of-soccer/',
    })
    api.post.mockResolvedValue({ data: { success: true, story: { ...STORY, status: 'unpublished' } } })
    renderEditor()
    expect(await screen.findByRole('link', { name: 'View on www' }))
      .toHaveAttribute('href', 'https://www.optioeducation.com/stories/a-fall-of-soccer/')
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Unpublish' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/admin/stories/st1/unpublish', {}))
    await screen.findByText('Unpublished')
  })
})

describe('the evidence picker', () => {
  it('locks an excluded image in the anonymized tier and explains why', async () => {
    renderEditor()
    const box = await screen.findByLabelText('Include image The team')
    expect(box).toBeDisabled()
    expect(box).not.toBeChecked()
    expect(screen.getByText(/Two faces/)).toBeInTheDocument()
    expect(screen.getByText('Locked out in the anonymized tier.')).toBeInTheDocument()
    expect(screen.getByLabelText('Include image A ball on grass')).toBeEnabled()
  })

  it('lets a superadmin override an exclusion in the named tier', async () => {
    loaded = response({ story: { tier: 'named' } })
    renderEditor()
    const box = await screen.findByLabelText('Include image The team')
    expect(box).toBeEnabled()
    fireEvent.click(box)
    expect(box).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put.mock.calls[0][1].assets[1].included).toBe(true)
  })

  it('renders a video asset as a player, with include and captions but no hero radio', async () => {
    loaded = response({
      assets: [
        ...ASSETS,
        { id: 'v1', kind: 'video', mime_type: 'video/mp4', thumb_url: null,
          media_url: 'https://signed.test/v1.mp4?token=abc', alt: 'A dance routine', caption: 'One take',
          included: true, safety: { verdict: 'safe', reason: null, faces: 0, readable_text: [] } },
      ],
    })
    renderEditor()
    const box = await screen.findByLabelText('Include video A dance routine')
    expect(box).toBeEnabled()
    expect(box).toBeChecked()
    expect(screen.queryByLabelText('Use as hero image A dance routine')).toBeNull()
    expect(screen.getByLabelText('Caption for video v1')).toHaveValue('One take')

    // The picker's player and the preview's player, both over the signed URL.
    const players = document.querySelectorAll('video')
    expect(players.length).toBe(2)
    players.forEach((el) => {
      expect(el.getAttribute('src')).toBe('https://signed.test/v1.mp4?token=abc')
      expect(el).toHaveAttribute('controls')
      expect(el.getAttribute('preload')).toBe('metadata')
    })
    const preview = screen.getByRole('article', { name: 'Story preview' })
    expect(within(preview).getByText('One take')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Caption for video v1'), { target: { value: 'Three minutes.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    expect(api.put.mock.calls[0][1].assets[2]).toEqual(
      { id: 'v1', included: true, alt: 'A dance routine', caption: 'Three minutes.' })
  })

  it('keeps a video with location metadata locked even in the named tier', async () => {
    loaded = response({
      story: { tier: 'named' },
      assets: [
        { id: 'v2', kind: 'video', mime_type: 'video/mp4', thumb_url: null, media_url: null,
          alt: 'Located', caption: '', included: false,
          safety: { verdict: 'excluded', reason: 'video_location_metadata', faces: 0, readable_text: [] } },
      ],
    })
    renderEditor()
    const box = await screen.findByLabelText('Include video Located')
    expect(box).toBeDisabled()
    expect(screen.getByText('Locked: the video carries location metadata.')).toBeInTheDocument()
    expect(screen.getByText('No preview')).toBeInTheDocument()
  })

  it('renders a document asset as a PDF link, with include and captions but no hero radio', async () => {
    loaded = response({
      assets: [
        ...ASSETS,
        { id: 'd1', kind: 'document', mime_type: 'application/pdf', thumb_url: null,
          media_url: 'https://signed.test/d1.pdf?token=abc', alt: 'Lab report', caption: 'As submitted',
          included: true, safety: { verdict: 'safe', reason: null, faces: 0, readable_text: [] } },
      ],
    })
    renderEditor()
    const box = await screen.findByLabelText('Include document Lab report')
    expect(box).toBeChecked()
    expect(screen.queryByLabelText('Use as hero image Lab report')).toBeNull()
    const links = screen.getAllByRole('link', { name: 'Open the PDF' })
    expect(links.length).toBe(2)                                   // the picker and the preview
    links.forEach(a => expect(a).toHaveAttribute('href', 'https://signed.test/d1.pdf?token=abc'))
    const preview = screen.getByRole('article', { name: 'Story preview' })
    expect(within(preview).getByText('Lab report')).toBeInTheDocument()
  })
})

describe('words and links', () => {
  const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  const withWords = (tier = 'anonymized') => response({
    story: {
      tier,
      body: {
        sections: [
          { kind: 'what_they_did', body_md: 'Played **a season**.' },
          { kind: 'evidence', items: [
            { type: 'image', asset_id: 'a1', url: null, alt: 'A ball on grass', caption: '' },
            { type: 'quote', text: 'In November I could not finish the drill.', caption: null,
              source_block_id: 'b1', source_item_index: 1, included: true,
              safety: { verdict: 'safe', reason: null } },
            { type: 'quote', text: 'From the log.', caption: 'From Training log',
              source_block_id: 'd1', source_item_index: 1, included: true,
              safety: { verdict: 'safe', reason: null } },
            { type: 'link', url: YOUTUBE, alt: 'Season highlights', caption: null,
              source_block_id: 'l1', source_item_index: 1, included: tier === 'named',
              safety: tier === 'named'
                ? { verdict: 'safe', reason: null }
                : { verdict: 'excluded', reason: 'external_link_identifies' } },
            { type: 'link', url: 'https://www.instagram.com/team/', alt: 'team', caption: null,
              source_block_id: 'l2', source_item_index: 1, included: false,
              safety: { verdict: 'excluded', reason: 'social_profile' } },
          ] },
          { kind: 'what_it_counted_for', body_md: 'Half a credit of PE.' },
        ],
      },
    },
  })

  it('renders a quote row, and the preview shows it as a blockquote with its caption', async () => {
    loaded = withWords()
    renderEditor()
    const box = await screen.findByLabelText('Include quote 1')
    expect(box).toBeEnabled()
    expect(box).toBeChecked()
    expect(screen.getByLabelText('Caption for quote 2')).toHaveValue('From Training log')
    const preview = screen.getByRole('article', { name: 'Story preview' })
    const quotes = within(preview).getAllByRole('blockquote')
    expect(quotes.map(q => q.textContent)).toEqual([
      'In November I could not finish the drill.',
      'From the log.From Training log',
    ])
    expect(within(preview).getByText('From Training log').tagName).toBe('CITE')
  })

  it('locks an external link in the anonymized tier and explains why', async () => {
    loaded = withWords('anonymized')
    renderEditor()
    const box = await screen.findByLabelText('Include link Season highlights')
    expect(box).toBeDisabled()
    expect(box).not.toBeChecked()
    const row = within(box.closest('li'))
    expect(row.getByText('Locked out in the anonymized tier.')).toBeInTheDocument()
    expect(row.getByText(/external_link_identifies/)).toBeInTheDocument()
    expect(row.getByRole('link', { name: YOUTUBE })).toHaveAttribute('href', YOUTUBE)
    const social = screen.getByLabelText('Include link team')
    expect(social).toBeDisabled()
    expect(within(social.closest('li')).getByText('Locked: a social profile is never published.')).toBeInTheDocument()
    // Neither link reaches the preview.
    const preview = screen.getByRole('article', { name: 'Story preview' })
    expect(within(preview).queryByText('Season highlights')).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('in the named tier a clean link embeds through the no-cookie player, a social profile stays locked', async () => {
    loaded = withWords('named')
    renderEditor()
    expect(await screen.findByLabelText('Include link Season highlights')).toBeEnabled()
    expect(screen.getByLabelText('Include link team')).toBeDisabled()
    const frame = document.querySelector('iframe')
    expect(frame.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    const preview = screen.getByRole('article', { name: 'Story preview' })
    expect(within(preview).getByRole('link', { name: 'Season highlights' })).toHaveAttribute('href', YOUTUBE)
  })

  it('switches a quote off and saves the body with the flag', async () => {
    loaded = withWords()
    renderEditor()
    fireEvent.click(await screen.findByLabelText('Include quote 1'))
    const preview = screen.getByRole('article', { name: 'Story preview' })
    expect(within(preview).queryByText('In November I could not finish the drill.')).toBeNull()
    fireEvent.change(screen.getByLabelText('Caption for quote 2'), { target: { value: 'From the log, week 3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const items = api.put.mock.calls[0][1].body.sections.find(s => s.kind === 'evidence').items
    expect(items[1]).toMatchObject({ type: 'quote', included: false, text: 'In November I could not finish the drill.' })
    expect(items[2]).toMatchObject({ type: 'quote', caption: 'From the log, week 3' })
  })

  it('says so when the student submitted no text or links', async () => {
    renderEditor()
    expect(await screen.findByText('The student submitted no text or links.')).toBeInTheDocument()
  })
})

describe('review rounds', () => {
  it('leaves a review round out of the story on a toggle', async () => {
    renderEditor()
    fireEvent.click(await screen.findByLabelText('Include round 1'))
    const preview = screen.getByRole('article', { name: 'Story preview' })
    expect(within(preview).queryByText('How the review went')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const rounds = api.put.mock.calls[0][1].body.sections.find(s => s.kind === 'how_it_went').rounds
    expect(rounds[0].included).toBe(false)
  })
})
