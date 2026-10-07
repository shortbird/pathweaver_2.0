/**
 * The two ways off a quest's active list, shared by the quest screen
 * (QuestDetailView), the Family tab's quest cards (FamilyQuestsSection) and
 * Home's Saved for Later list (SavedForLaterSection).
 *
 * Ticket e17134c6 (2026-10-07). An iCreate org admin, on "End Quest": "that's
 * not super clear what that means. And I didn't dare select that because I
 * was worried I might end the quest on accident and I didn't know what would
 * happen." One button now does one thing:
 *
 *   - Save for later asks one question with two answers. "I'll come back to
 *     it" is POST /api/quests/:id/archive: the quest goes to Saved for Later,
 *     and Resume (POST /unarchive) brings it back. "I'm done with it" is the
 *     same POST with reason 'lost_interest': the backend hides the quest from
 *     every list, Saved for Later included. Work and XP are kept either way.
 *   - Mark done is POST /api/quests/:id/end, offered only when /end would
 *     finish the quest (markDoneRule).
 *
 * A parent acting on a child's run adds student_id (the backend's
 * @student_scope).
 */

import { chooseAlert } from '@/src/utils/alerts';

/** archive_reason that hides a quest everywhere ("I'm done with it"). */
export const DONE_WITH_IT_REASON = 'lost_interest';

export type SaveForLaterAnswer = 'later' | 'done';

/** POST /archive body for an answer, scoped to a child when one is named. */
export function archiveBody(answer: SaveForLaterAnswer, studentId?: string | null): Record<string, string> {
  return {
    ...(answer === 'done' ? { reason: DONE_WITH_IT_REASON } : {}),
    ...(studentId ? { student_id: studentId } : {}),
  };
}

/**
 * The Save for later question. `hasSavedList` is false only where the learner
 * has no Saved for Later list to come back to on mobile (a parent's own
 * quest: the parent shell has no Home of its own), and the copy then says
 * the way back is the quest itself.
 */
export function saveForLaterPrompt(questLabel: string, hasSavedList = true) {
  const comeBack = hasSavedList
    ? `"I'll come back to it" moves the ${questLabel} to Saved for Later on Home, and Resume there brings it back.`
    : `"I'll come back to it" takes the ${questLabel} off the active list, and you can open it again here to pick it back up.`;
  return {
    title: `Save this ${questLabel} for later?`,
    message: `All work and XP are kept either way. ${comeBack} "I'm done with it" takes the ${questLabel} off every list, and the work and XP stay in the portfolio.`,
    choices: [
      { key: 'later' as const, text: "I'll come back to it" },
      { key: 'done' as const, text: "I'm done with it" },
    ],
  };
}

export function askSaveForLater(questLabel: string, hasSavedList = true): Promise<SaveForLaterAnswer | null> {
  return chooseAlert<SaveForLaterAnswer>(saveForLaterPrompt(questLabel, hasSavedList));
}

/**
 * When Mark done is offered. With an XP finish line (quests.xp_threshold),
 * /end finishes the quest only at or above it; below it the backend sets the
 * quest aside, so the button would mislead. With no finish line, the backend
 * refuses /end until at least one task is done.
 *
 * `earnedXP` null means the caller does not know the learner's XP on the
 * quest (the Family tab's cards); with a finish line the quest screen then
 * decides, not the card.
 */
export function markDoneRule({ xpThreshold, earnedXP, completedTasks, questLabel }: {
  xpThreshold: number | null | undefined;
  earnedXP: number | null;
  completedTasks: number;
  questLabel: string;
}): { canMarkDone: boolean; hint: string | null } {
  const goal = xpThreshold || 0;
  if (goal > 0) {
    if (earnedXP == null) {
      return { canMarkDone: false, hint: `Open the ${questLabel} to mark it done.` };
    }
    const toGo = Math.max(0, goal - earnedXP);
    return toGo === 0
      ? { canMarkDone: true, hint: null }
      : { canMarkDone: false, hint: `${toGo} XP to go before you can mark this ${questLabel} done.` };
  }
  return completedTasks > 0
    ? { canMarkDone: true, hint: null }
    : { canMarkDone: false, hint: `Finish at least one task to mark this ${questLabel} done.` };
}
