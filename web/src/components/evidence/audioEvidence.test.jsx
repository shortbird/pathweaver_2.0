/**
 * Voice-note evidence on web.
 *
 * Tickets 9040e599, 672adb58, 64c75285: the mobile app saves voice notes as
 * 'audio' blocks with content { url, filename, duration_ms }. None of the web
 * evidence renderers knew the type: the editor crashed on a missing config,
 * the display showed nothing, and the review view said "Unknown block type".
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvidenceBlockRenderer } from './EvidenceBlockRenderer'
import EvidenceDisplay from './EvidenceDisplay'
import AudioBlock from './blocks/AudioBlock'

// vi.mock is hoisted above the imports.

vi.mock('./EvidenceEditorContext', () => ({
  useEvidenceEditor: () => ({
    activeBlock: null,
    setActiveBlock: vi.fn(),
    collapsedBlocks: new Set(),
    toggleBlockCollapse: vi.fn(),
    uploadingBlocks: new Set(),
    uploadErrors: {},
    setBlocks: vi.fn(),
  }),
}))

const URL = 'https://cdn.example/quest-evidence/u/voice.m4a?token=abc'
const audioBlock = {
  id: 'b1',
  type: 'audio',
  block_type: 'audio',
  content: { url: URL, filename: 'voice.m4a', duration_ms: 4200 },
}

const audioSrc = () => screen.getByTestId('evidence-audio').getAttribute('src')

describe('audio evidence blocks (tickets 9040e599 / 672adb58 / 64c75285)', () => {
  it('the editor renders a playable audio element from the block url', () => {
    render(
      <EvidenceBlockRenderer
        block={audioBlock}
        index={0}
        mediaHandlers={{}}
        addBlock={vi.fn()}
        updateBlock={vi.fn()}
        deleteBlock={vi.fn()}
      />
    )
    expect(audioSrc()).toBe(URL)
    expect(screen.getByTestId('evidence-audio').hasAttribute('controls')).toBe(true)
  })

  it('the evidence display renders a playable audio element', () => {
    render(<EvidenceDisplay blocks={[audioBlock]} />)
    expect(audioSrc()).toBe(URL)
    expect(screen.getByLabelText('Voice note voice.m4a')).toBeInTheDocument()
  })

  it('the review view block plays the recording, and says so when there is none', () => {
    const { unmount } = render(<AudioBlock block={audioBlock} />)
    expect(audioSrc()).toBe(URL)
    unmount()
    render(<AudioBlock block={{ content: {} }} />)
    expect(screen.getByText('This voice note has no recording.')).toBeInTheDocument()
  })
})
