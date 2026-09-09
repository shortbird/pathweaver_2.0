import { describe, it, expect } from 'vitest'
import { mapPillarNameToId, buildQuestOrbs, PILLAR_DEFINITIONS } from '../pillarHelpers'

describe('mapPillarNameToId', () => {
  it('returns canonical id when already canonical', () => {
    expect(mapPillarNameToId('stem')).toBe('stem')
    expect(mapPillarNameToId('art')).toBe('art')
    expect(mapPillarNameToId('wellness')).toBe('wellness')
  })

  it('lowercases input', () => {
    expect(mapPillarNameToId('STEM')).toBe('stem')
    expect(mapPillarNameToId('Art')).toBe('art')
  })

  it('maps legacy names', () => {
    expect(mapPillarNameToId('stem_logic')).toBe('stem')
    expect(mapPillarNameToId('language_communication')).toBe('communication')
    expect(mapPillarNameToId('arts_creativity')).toBe('art')
    expect(mapPillarNameToId('life_wellness')).toBe('wellness')
    expect(mapPillarNameToId('society_culture')).toBe('civics')
    expect(mapPillarNameToId('creativity')).toBe('art')
    expect(mapPillarNameToId('practical_skills')).toBe('wellness')
  })

  it('falls back to stem for unknown pillars', () => {
    expect(mapPillarNameToId('gibberish')).toBe('stem')
    expect(mapPillarNameToId(null)).toBe('stem')
    expect(mapPillarNameToId(undefined)).toBe('stem')
  })
})

describe('PILLAR_DEFINITIONS', () => {
  it('exports all 5 pillars', () => {
    expect(PILLAR_DEFINITIONS).toHaveLength(5)
    const ids = PILLAR_DEFINITIONS.map((p) => p.id).sort()
    expect(ids).toEqual(['art', 'civics', 'communication', 'stem', 'wellness'])
  })

  it('every pillar has id, name, description', () => {
    for (const p of PILLAR_DEFINITIONS) {
      expect(p.id).toBeTruthy()
      expect(p.name).toBeTruthy()
      expect(p.description).toBeTruthy()
    }
  })
})

describe('buildQuestOrbs', () => {
  it('builds an orb from task_evidence with pillar breakdown', () => {
    const achievements = [
      {
        id: 'a1',
        quest: { id: 'q1', title: 'Robotics' },
        task_evidence: {
          t1: { pillar: 'stem', xp_awarded: 30 },
          t2: { pillar: 'art', xp_awarded: 20 },
        },
        completed_at: '2026-04-14T00:00:00Z',
      },
    ]
    const orbs = buildQuestOrbs(achievements)
    expect(orbs).toHaveLength(1)
    expect(orbs[0].totalXP).toBe(50)
    expect(orbs[0].xpDistribution).toEqual({ stem: 30, art: 20 })
    expect(orbs[0].title).toBe('Robotics')
  })

  it('falls back to total_xp_earned when no task_evidence', () => {
    const orbs = buildQuestOrbs([
      { id: 'a2', quest: { title: 'Art Project' }, total_xp_earned: 80 },
    ])
    expect(orbs[0].totalXP).toBe(80)
    expect(orbs[0].xpDistribution).toEqual({ stem: 80 })
  })

  it('defaults XP to 50 when neither source present', () => {
    const orbs = buildQuestOrbs([{ id: 'a3', quest: { title: 'X' } }])
    expect(orbs[0].totalXP).toBe(50)
    expect(orbs[0].xpDistribution).toEqual({ stem: 50 })
  })

  it('maps legacy pillar names in task_evidence', () => {
    const orbs = buildQuestOrbs([
      {
        quest: { title: 'Q' },
        task_evidence: {
          t1: { pillar: 'arts_creativity', xp_awarded: 15 },
        },
      },
    ])
    expect(orbs[0].xpDistribution).toEqual({ art: 15 })
  })

  it('uses achievement.title when quest.title missing', () => {
    const orbs = buildQuestOrbs([{ title: 'Loose Title', total_xp_earned: 10 }])
    expect(orbs[0].title).toBe('Loose Title')
  })
})
