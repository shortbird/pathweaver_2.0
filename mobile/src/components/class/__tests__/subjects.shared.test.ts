import shared from '@shared/data/subjects.json';

import { SUBJECTS, getSubject } from '../SUBJECTS';

/**
 * The mobile half of the subject-vocabulary guard (QF-01).
 *
 * This file used to hold its own copy of the eleven subjects, and the web app
 * held another, under a comment asking whoever edited either to keep the two
 * and the backend enum in step by hand. They had drifted by one description.
 * Now only the icon is decided here.
 */

describe('school subjects come from one list', () => {
  it('derives keys, names, descriptions and accents from the shared list', () => {
    expect(SUBJECTS.map((s) => ({
      key: s.key, name: s.name, description: s.description, accent: s.accent,
    }))).toEqual(shared.subjects);
  });

  it('gives every subject an icon, which is the part that is mobile-only', () => {
    for (const s of SUBJECTS) {
      expect(s.icon).toBeTruthy();
      expect(typeof s.icon).toBe('string');
    }
    // A subject added to the shared list with no icon here would render blank
    // rather than fail, so assert the count too.
    expect(new Set(SUBJECTS.map((s) => s.icon)).size).toBe(SUBJECTS.length);
  });

  it('looks a subject up by key, and survives a bad one', () => {
    expect(getSubject('fine_arts')?.name).toBe('Fine Arts');
    expect(getSubject('not_a_subject')).toBeNull();
    expect(getSubject(null)).toBeNull();
  });
});
