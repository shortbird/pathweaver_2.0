/**
 * subjectNames() — `diploma_subjects` arrives in two shapes.
 *
 * Regression guard for Sentry OPTIO-MOBILE-W: the task editor read the field
 * as an array unconditionally, so opening any task whose subjects were stored
 * as a weighted {subject: share} map crashed with "undefined is not a
 * function" on `.filter`. About a third of user_quest_tasks rows are the map
 * form, and the quest screen's subject chips silently rendered nothing for
 * every one of them.
 */

import { subjectNames } from '../useQuestDetail';

describe('subjectNames', () => {
  it('passes a list of names through', () => {
    expect(subjectNames(['Math', 'Science'])).toEqual(['Math', 'Science']);
  });

  it('reads the names out of a weighted map', () => {
    expect(subjectNames({ 'Fine Arts': 75, 'Digital Literacy': 25 }))
      .toEqual(['Fine Arts', 'Digital Literacy']);
  });

  it('handles a single-subject map', () => {
    expect(subjectNames({ Electives: 100 })).toEqual(['Electives']);
  });

  it.each([null, undefined, '', 0, false])('returns [] for %p', (raw) => {
    expect(subjectNames(raw)).toEqual([]);
  });

  it('drops non-string entries from a list', () => {
    expect(subjectNames(['Math', null, 7, 'PE'])).toEqual(['Math', 'PE']);
  });

  it('always returns something array methods work on', () => {
    // The actual crash: `.filter` on the result of reading the field.
    for (const raw of [{ Math: 100 }, ['Math'], null, undefined]) {
      expect(() => subjectNames(raw).filter((s) => s !== 'Math')).not.toThrow();
    }
  });
});
