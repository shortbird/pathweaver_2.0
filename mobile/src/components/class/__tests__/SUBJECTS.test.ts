/**
 * SUBJECTS data — keep aligned with backend/utils/school_subjects.py
 * SCHOOL_SUBJECTS list. If a key is added to one side without the other,
 * the wizard will accept input the backend rejects.
 */

import { SUBJECTS, getSubject } from '../SUBJECTS';

const BACKEND_KEYS = [
  'language_arts',
  'math',
  'science',
  'social_studies',
  'financial_literacy',
  'health',
  'pe',
  'fine_arts',
  'cte',
  'digital_literacy',
  'electives',
] as const;

describe('SUBJECTS data', () => {
  it('exposes exactly the 11 backend canonical subjects', () => {
    expect(SUBJECTS.map((s) => s.key).sort()).toEqual([...BACKEND_KEYS].sort());
  });

  it('each subject has a name, description, icon, and accent color', () => {
    for (const s of SUBJECTS) {
      expect(s.name).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.icon).toBeTruthy();
      expect(s.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('getSubject returns metadata for a valid key', () => {
    const s = getSubject('math');
    expect(s).not.toBeNull();
    expect(s?.name).toBe('Math');
  });

  it('getSubject returns null for invalid / null inputs', () => {
    expect(getSubject(null)).toBeNull();
    expect(getSubject(undefined)).toBeNull();
    expect(getSubject('world_languages')).toBeNull();
    expect(getSubject('english')).toBeNull();
  });
});
