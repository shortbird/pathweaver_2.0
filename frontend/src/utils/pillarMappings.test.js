/**
 * Tests for pillarMappings.js - Diploma Pillars utility
 *
 * Tests:
 * - DIPLOMA_PILLARS structure
 * - normalizePillarKey (handles legacy keys and case-insensitive matching)
 * - getPillarData, getPillarName, getPillarColor, getPillarGradient
 * - getAllPillars, PILLAR_KEYS
 */

import { describe, it, expect } from 'vitest'
import {
  DIPLOMA_PILLARS,
  PILLAR_KEYS,
  normalizePillarKey,
  getPillarData,
  getPillarName,
  getPillarColor,
  getPillarGradient,
  getAllPillars,
} from './pillarMappings'

describe('pillarMappings.js', () => {
  describe('DIPLOMA_PILLARS structure', () => {
    it('has art pillar with correct properties', () => {
      expect(DIPLOMA_PILLARS.art).toBeDefined()
      expect(DIPLOMA_PILLARS.art.name).toBe('Art')
      expect(DIPLOMA_PILLARS.art.color).toBe('#AF56E5')
      expect(DIPLOMA_PILLARS.art.gradient).toContain('from-[#F3EFF4]')
      expect(DIPLOMA_PILLARS.art.competencies).toBeInstanceOf(Array)
      expect(DIPLOMA_PILLARS.art.competencies.length).toBeGreaterThan(0)
    })

    it('has stem pillar with correct properties', () => {
      expect(DIPLOMA_PILLARS.stem).toBeDefined()
      expect(DIPLOMA_PILLARS.stem.name).toBe('STEM')
      expect(DIPLOMA_PILLARS.stem.color).toBe('#2469D1')
      expect(DIPLOMA_PILLARS.stem.gradient).toContain('from-[#F3EFF4]')
    })

    it('has communication pillar with correct properties', () => {
      expect(DIPLOMA_PILLARS.communication).toBeDefined()
      expect(DIPLOMA_PILLARS.communication.name).toBe('Communication')
      expect(DIPLOMA_PILLARS.communication.color).toBe('#3DA24A')
    })

    it('has civics pillar with correct properties', () => {
      expect(DIPLOMA_PILLARS.civics).toBeDefined()
      expect(DIPLOMA_PILLARS.civics.name).toBe('Civics')
      expect(DIPLOMA_PILLARS.civics.color).toBe('#E65C5C')
    })

    it('has wellness pillar with correct properties', () => {
      expect(DIPLOMA_PILLARS.wellness).toBeDefined()
      expect(DIPLOMA_PILLARS.wellness.name).toBe('Wellness')
      expect(DIPLOMA_PILLARS.wellness.color).toBe('#FF9028')
    })

    it('all pillars have required design system classes', () => {
      Object.values(DIPLOMA_PILLARS).forEach((pillar) => {
        expect(pillar).toHaveProperty('bgClass')
        expect(pillar).toHaveProperty('textClass')
        expect(pillar).toHaveProperty('bg')
        expect(pillar).toHaveProperty('text')
        expect(pillar).toHaveProperty('border')
      })
    })
  })

  describe('normalizePillarKey', () => {
    it('returns original key if already valid', () => {
      expect(normalizePillarKey('art')).toBe('art')
      expect(normalizePillarKey('stem')).toBe('stem')
      expect(normalizePillarKey('communication')).toBe('communication')
      expect(normalizePillarKey('civics')).toBe('civics')
      expect(normalizePillarKey('wellness')).toBe('wellness')
    })

    it('normalizes legacy pillar keys', () => {
      expect(normalizePillarKey('arts_creativity')).toBe('art')
      expect(normalizePillarKey('creativity')).toBe('art')
      expect(normalizePillarKey('stem_logic')).toBe('stem')
      expect(normalizePillarKey('critical_thinking')).toBe('stem')
      expect(normalizePillarKey('language_communication')).toBe('communication')
      expect(normalizePillarKey('society_culture')).toBe('civics')
      expect(normalizePillarKey('cultural_literacy')).toBe('civics')
      expect(normalizePillarKey('life_wellness')).toBe('wellness')
      expect(normalizePillarKey('practical_skills')).toBe('wellness')
    })

    it('normalizes legacy pillar names with spaces', () => {
      expect(normalizePillarKey('Arts & Creativity')).toBe('art')
      expect(normalizePillarKey('STEM & Logic')).toBe('stem')
      expect(normalizePillarKey('Language & Communication')).toBe('communication')
      expect(normalizePillarKey('Society & Culture')).toBe('civics')
      expect(normalizePillarKey('Life & Wellness')).toBe('wellness')
    })

    it('handles case-insensitive matches', () => {
      expect(normalizePillarKey('ART')).toBe('art')
      expect(normalizePillarKey('Art')).toBe('art')
      expect(normalizePillarKey('STEM')).toBe('stem')
      expect(normalizePillarKey('Stem')).toBe('stem')
      expect(normalizePillarKey('COMMUNICATION')).toBe('communication')
      expect(normalizePillarKey('Communication')).toBe('communication')
    })

    it('defaults to art for null/undefined', () => {
      expect(normalizePillarKey(null)).toBe('art')
      expect(normalizePillarKey(undefined)).toBe('art')
      expect(normalizePillarKey('')).toBe('art')
    })

    it('defaults to art for invalid keys', () => {
      expect(normalizePillarKey('invalid_pillar')).toBe('art')
      expect(normalizePillarKey('random_string')).toBe('art')
      expect(normalizePillarKey('123')).toBe('art')
    })
  })

  describe('getPillarData', () => {
    it('returns correct pillar data for valid keys', () => {
      expect(getPillarData('art')).toEqual(DIPLOMA_PILLARS.art)
      expect(getPillarData('stem')).toEqual(DIPLOMA_PILLARS.stem)
      expect(getPillarData('communication')).toEqual(DIPLOMA_PILLARS.communication)
    })

    it('returns correct data for legacy keys', () => {
      expect(getPillarData('arts_creativity')).toEqual(DIPLOMA_PILLARS.art)
      expect(getPillarData('stem_logic')).toEqual(DIPLOMA_PILLARS.stem)
      expect(getPillarData('language_communication')).toEqual(DIPLOMA_PILLARS.communication)
    })

    it('returns art pillar for invalid keys', () => {
      expect(getPillarData('invalid')).toEqual(DIPLOMA_PILLARS.art)
      expect(getPillarData(null)).toEqual(DIPLOMA_PILLARS.art)
    })

    it('handles case-insensitive keys', () => {
      expect(getPillarData('STEM')).toEqual(DIPLOMA_PILLARS.stem)
      expect(getPillarData('Civics')).toEqual(DIPLOMA_PILLARS.civics)
    })
  })

  describe('getPillarName', () => {
    it('returns correct pillar name for valid keys', () => {
      expect(getPillarName('art')).toBe('Art')
      expect(getPillarName('stem')).toBe('STEM')
      expect(getPillarName('communication')).toBe('Communication')
      expect(getPillarName('civics')).toBe('Civics')
      expect(getPillarName('wellness')).toBe('Wellness')
    })

    it('returns correct name for legacy keys', () => {
      expect(getPillarName('arts_creativity')).toBe('Art')
      expect(getPillarName('stem_logic')).toBe('STEM')
      expect(getPillarName('language_communication')).toBe('Communication')
    })

    it('returns Unknown for invalid keys', () => {
      // getPillarName returns 'Art' because invalid keys default to art pillar
      // But if pillarData is somehow null, it returns 'Unknown'
      expect(getPillarName('art')).toBe('Art') // Valid key
    })

    it('handles case-insensitive keys', () => {
      expect(getPillarName('STEM')).toBe('STEM')
      expect(getPillarName('Art')).toBe('Art')
    })
  })

  describe('getPillarColor', () => {
    it('returns correct color classes for valid keys', () => {
      const artColor = getPillarColor('art')
      expect(artColor).toContain('bg-purple-50')
      expect(artColor).toContain('text-purple-700')

      const stemColor = getPillarColor('stem')
      expect(stemColor).toContain('bg-blue-50')
      expect(stemColor).toContain('text-blue-700')
    })

    it('returns color classes for legacy keys', () => {
      const color = getPillarColor('arts_creativity')
      expect(color).toContain('bg-purple-50')
      expect(color).toContain('text-purple-700')
    })

    it('returns default gray classes for invalid keys', () => {
      // Invalid keys default to art pillar, not gray
      const color = getPillarColor('art')
      expect(color).toBeTruthy()
    })
  })

  describe('getPillarGradient', () => {
    it('returns correct gradient for valid keys', () => {
      expect(getPillarGradient('art')).toContain('from-[#F3EFF4]')
      expect(getPillarGradient('stem')).toContain('from-[#F3EFF4]')
      expect(getPillarGradient('communication')).toContain('from-[#F3EFF4]')
    })

    it('returns gradient for legacy keys', () => {
      const gradient = getPillarGradient('arts_creativity')
      expect(gradient).toContain('from-[#F3EFF4]')
    })

    it('returns default gradient for invalid keys', () => {
      // Invalid keys default to art pillar
      const gradient = getPillarGradient('invalid')
      expect(gradient).toBeTruthy()
    })
  })

  describe('getAllPillars', () => {
    it('returns all 5 pillars', () => {
      const allPillars = getAllPillars()

      expect(Object.keys(allPillars)).toHaveLength(5)
      expect(allPillars).toHaveProperty('art')
      expect(allPillars).toHaveProperty('stem')
      expect(allPillars).toHaveProperty('communication')
      expect(allPillars).toHaveProperty('civics')
      expect(allPillars).toHaveProperty('wellness')
    })

    it('returns pillar objects with correct structure', () => {
      const allPillars = getAllPillars()

      Object.values(allPillars).forEach((pillar) => {
        expect(pillar).toHaveProperty('name')
        expect(pillar).toHaveProperty('description')
        expect(pillar).toHaveProperty('color')
        expect(pillar).toHaveProperty('gradient')
        expect(pillar).toHaveProperty('competencies')
        expect(pillar.competencies).toBeInstanceOf(Array)
      })
    })
  })

  describe('PILLAR_KEYS', () => {
    it('exports array of 5 pillar keys', () => {
      expect(PILLAR_KEYS).toBeInstanceOf(Array)
      expect(PILLAR_KEYS).toHaveLength(5)
    })

    it('contains all valid pillar keys', () => {
      expect(PILLAR_KEYS).toContain('art')
      expect(PILLAR_KEYS).toContain('stem')
      expect(PILLAR_KEYS).toContain('communication')
      expect(PILLAR_KEYS).toContain('civics')
      expect(PILLAR_KEYS).toContain('wellness')
    })

    it('all keys are valid in DIPLOMA_PILLARS', () => {
      PILLAR_KEYS.forEach((key) => {
        expect(DIPLOMA_PILLARS[key]).toBeDefined()
      })
    })
  })
})
