/**
 * The rules behind Save for later and Mark done (ticket e17134c6,
 * 2026-10-07): an iCreate admin "didn't dare select [End Quest] because I
 * was worried I might end the quest on accident".
 */
import { archiveBody, markDoneRule, saveForLaterPrompt } from '../questExit';

describe('archiveBody', () => {
  it("adds reason lost_interest only for \"I'm done with it\", and student_id only in child scope", () => {
    expect(archiveBody('later')).toEqual({});
    expect(archiveBody('done')).toEqual({ reason: 'lost_interest' });
    expect(archiveBody('later', 'kid-a')).toEqual({ student_id: 'kid-a' });
    expect(archiveBody('done', 'kid-a')).toEqual({ reason: 'lost_interest', student_id: 'kid-a' });
  });
});

describe('markDoneRule', () => {
  it('with no finish line, waits for one finished task and says why', () => {
    expect(markDoneRule({ xpThreshold: null, earnedXP: 0, completedTasks: 0, questLabel: 'quest' }))
      .toEqual({ canMarkDone: false, hint: 'Finish at least one task to mark this quest done.' });
    expect(markDoneRule({ xpThreshold: 0, earnedXP: 50, completedTasks: 1, questLabel: 'quest' }))
      .toEqual({ canMarkDone: true, hint: null });
  });

  it('with a finish line, keeps the XP rule', () => {
    expect(markDoneRule({ xpThreshold: 300, earnedXP: 50, completedTasks: 1, questLabel: 'class' }))
      .toEqual({ canMarkDone: false, hint: '250 XP to go before you can mark this class done.' });
    expect(markDoneRule({ xpThreshold: 300, earnedXP: 300, completedTasks: 0, questLabel: 'quest' }))
      .toEqual({ canMarkDone: true, hint: null });
  });

  it('with a finish line and unknown XP, sends the learner to the quest screen', () => {
    expect(markDoneRule({ xpThreshold: 300, earnedXP: null, completedTasks: 5, questLabel: 'quest' }))
      .toEqual({ canMarkDone: false, hint: 'Open the quest to mark it done.' });
  });
});

describe('saveForLaterPrompt', () => {
  it('names the Saved for Later list, or the quest screen where there is no list', () => {
    expect(saveForLaterPrompt('quest').message).toContain('moves the quest to Saved for Later on Home, and Resume there brings it back.');
    expect(saveForLaterPrompt('quest', false).message).toContain('you can open it again here to pick it back up.');
    expect(saveForLaterPrompt('quest').message).toContain('All work and XP are kept either way.');
  });
});
