/**
 * The action trail — added because the evidence-attach pipeline reports nothing.
 *
 * Two iOS reports of "attaching doesn't work" (2026-07-12 video, 2026-07-30
 * photos, same user + device) arrived with an empty console-error buffer, no
 * Sentry event, and zero upload API calls. Every failure mode in that pipeline
 * is a silent fallback or a bare `return`, so there was nothing between the tap
 * and the user giving up. These tests pin the buffer that fixes that.
 */

import { recordAction, collectDiagnostics, _resetDiagnostics } from '../diagnostics';

beforeEach(() => {
  _resetDiagnostics();
});

describe('recordAction', () => {
  it('records stages in order with timestamps', () => {
    recordAction('evidence:picker-tap', { source: 'library' });
    recordAction('evidence:no-assets');

    const { extra } = collectDiagnostics();
    expect(extra.recent_actions.map((a) => a.stage)).toEqual([
      'evidence:picker-tap',
      'evidence:no-assets',
    ]);
    expect(extra.recent_actions[0].detail).toEqual({ source: 'library' });
    expect(typeof extra.recent_actions[0].at).toBe('string');
  });

  it('omits detail entirely when none is given', () => {
    recordAction('evidence:no-assets');
    expect(collectDiagnostics().extra.recent_actions[0]).not.toHaveProperty('detail');
  });

  it('rides inside `extra`, which the backend already persists', () => {
    // bug_reports has an `extra` jsonb and the route's allow-list already
    // includes it — so this needs no migration and no backend change. A new
    // top-level key would have been silently dropped.
    recordAction('evidence:attached', { added: 1, dropped: 0 });
    const diag = collectDiagnostics();
    expect(diag.extra).toEqual({ recent_actions: expect.any(Array) });
    expect(diag.extra.recent_actions[0].detail).toEqual({ added: 1, dropped: 0 });
  });

  it('keeps the most recent 40 stages and drops the oldest', () => {
    // One attach attempt emits several stages and users retry before reporting,
    // so this buffer is deliberately deeper than the 20-entry API/route rings.
    for (let i = 0; i < 45; i++) recordAction(`stage-${i}`);
    const stages = collectDiagnostics().extra.recent_actions.map((a) => a.stage);
    expect(stages).toHaveLength(40);
    expect(stages[0]).toBe('stage-5');
    expect(stages[39]).toBe('stage-44');
  });

  it('never throws, so diagnostics cannot break the flow it observes', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => recordAction('weird', circular)).not.toThrow();
  });

  it('is cleared by _resetDiagnostics', () => {
    recordAction('evidence:picker-tap');
    _resetDiagnostics();
    expect(collectDiagnostics().extra.recent_actions).toEqual([]);
  });

  it('distinguishes a cancelled pick from a picker that never presented', () => {
    // The whole point of the trail. A user who cancels produces
    // tap -> library-result(canceled) -> no-assets. A picker that never
    // presents produces tap -> (nothing). Same visible outcome, different
    // trail — which is what the next report needs to settle the iOS question.
    recordAction('evidence:picker-tap', { source: 'library', platform: 'ios' });
    recordAction('evidence:library-result', { canceled: true, assetCount: 0 });
    recordAction('evidence:no-assets');

    const stages = collectDiagnostics().extra.recent_actions.map((a) => a.stage);
    expect(stages).toEqual([
      'evidence:picker-tap',
      'evidence:library-result',
      'evidence:no-assets',
    ]);

    _resetDiagnostics();
    recordAction('evidence:picker-tap', { source: 'library', platform: 'ios' });
    expect(collectDiagnostics().extra.recent_actions.map((a) => a.stage)).toEqual([
      'evidence:picker-tap',
    ]);
  });
});
