/**
 * The SIS names pillars the way the rest of the platform names them.
 *
 * The quest form used to carry its own list — "Arts & Creativity", "Life &
 * Wellness", "Society & Culture" — the names pillars had before they were
 * shortened in January 2025. Nothing failed: the KEYS were right, so a teacher
 * picked "Arts & Creativity" and the learner was shown "Art" for the same task.
 * A wrong label is invisible to every test that checks behaviour, which is why
 * this file checks the label against the shared config directly.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import QuestDraftForm, { PILLARS, PILLAR_LABEL } from './QuestDraftForm'
import { PILLARS as PILLAR_CONFIG } from '../../config/pillars'
import { getPillarName } from '../../utils/pillarMappings'

describe('SIS pillar names match the platform', () => {
  it('offers exactly the five pillars, no more and no fewer', () => {
    expect(PILLARS.map(([key]) => key).sort()).toEqual(Object.keys(PILLAR_CONFIG).sort())
  })

  it('labels each one the way the shared config does', () => {
    for (const [key, label] of PILLARS) {
      expect(label).toBe(PILLAR_CONFIG[key].display_name)
    }
  })

  it('agrees with the name the learner is shown for the same key', () => {
    // Two independent sources (config/pillars and pillarMappings) — the SIS
    // must not disagree with either, or a task changes name in transit.
    for (const [key, label] of PILLARS) {
      expect(label).toBe(getPillarName(key))
    }
  })

  it('has no retired long-form names left in it', () => {
    const retired = ['Arts & Creativity', 'STEM & Logic', 'Language & Communication',
                     'Society & Culture', 'Life & Wellness']
    expect(Object.values(PILLAR_LABEL).filter((l) => retired.includes(l))).toEqual([])
  })

  it('renders those names in the picker a teacher actually uses', () => {
    render(
      <QuestDraftForm
        title="" setTitle={() => {}}
        description="" setDescription={() => {}}
        tasks={[{ title: 'a', pillar: 'art', xp_value: 100, is_required: true }]}
        setTasks={() => {}}
      />
    )
    const options = Array.from(screen.getByLabelText('Task 1 pillar').options).map((o) => o.text)
    expect(options).toEqual(PILLARS.map(([, label]) => label))
    expect(options).toContain('Art')
  })
})
