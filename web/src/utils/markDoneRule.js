/**
 * When may a quest be marked done (POST /api/quests/:id/end)? One rule for the
 * quest page and the family lists (ticket e17134c6, 2026-10-07).
 *
 *   - With an XP finish line (quests.xp_threshold): at or above it. Below it
 *     /end sets the quest aside instead of finishing it, which is Save for
 *     later's job.
 *   - Without one: at least one finished task. Marking an empty quest done
 *     filed it under Completed with nothing in it; the backend now refuses
 *     that too (NO_COMPLETED_TASKS).
 *
 * Returns null when Mark done is allowed, else the one line that says why not.
 */
export function markDoneBlocker({ xpThreshold, earnedXP, completedTasks, label = 'quest' }) {
  const goal = xpThreshold > 0 ? xpThreshold : 0
  if (goal) {
    const toGo = Math.max(0, goal - (earnedXP || 0))
    return toGo > 0 ? `${toGo} XP to go before you can mark this ${label} done.` : null
  }
  return (completedTasks || 0) > 0 ? null : `Finish at least one task to mark this ${label} done.`
}

export default markDoneBlocker
