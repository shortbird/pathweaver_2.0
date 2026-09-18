/**
 * The three-step explainer and the credit rule, in one place. The academy
 * page and every story page say the same thing, so a first-time visitor who
 * lands on a story from a search gets the same answer a visitor gets on
 * /academy, and there is one string to edit when the wording changes.
 *
 * Voice: the student, second person. The teacher is "an Optio teacher".
 */
export interface Step {
  title: string
  body: string
}

export const HOW_IT_WORKS: Step[] = [
  {
    title: 'Pick the project.',
    body: 'Something you already care about: the sport, the song, the code, the business.',
  },
  {
    title: 'Do it and capture it.',
    body: 'Photos, videos, drafts, logged in the app as you go.',
  },
  {
    title: 'An Optio teacher makes it count.',
    body: 'Evidence reviewed, credit awarded, straight onto a WASC-accredited transcript.',
  },
]

/**
 * What a story's "What it counted for" section says after the drafted
 * sentences. `xpPerCredit` comes from the API (`credit_rule`), so the number
 * on the page is the platform's, not a copy that drifts.
 */
export function creditExplainer(xpPerCredit: number): string {
  return (
    'Optio students earn XP for finished work instead of letter grades. An Optio teacher ' +
    "reviews the evidence against the task's criteria and awards the XP. " +
    `${xpPerCredit.toLocaleString('en-US')} XP is one high school credit on an Optio Academy transcript.`
  )
}
