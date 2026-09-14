/**
 * One search box over the checklist-progress list.
 *
 * The office looks for a person ("Lisa"), a form ("W-4", "background check"),
 * and often both at once ("lisa w-4") — so one box takes both rather than a
 * name filter and a document filter side by side. Every word typed must match
 * somewhere on the assignment: the person's name, the checklist's name, an
 * item's title, or the name of a document attached to an item.
 *
 * Hyphens and dots are dropped before comparing so "w4" finds "W-4" and "I-9"
 * finds an item titled "I9".
 */
import { itemDocuments } from './checklistDocuments'

const norm = (s) => String(s || '').toLowerCase().replace(/[-.]/g, '')

export const searchTokens = (query) => norm(query).split(/\s+/).filter(Boolean)

const itemText = (item) => [item.title, ...itemDocuments(item).map((d) => d.title || d.filename)]
  .map(norm).join(' ')

/**
 * null when the assignment does not match the query. Otherwise the keys of
 * the items a word of the query named, so the list can open the card on them
 * — an empty list means every word matched the person or the checklist name,
 * and the card can stay collapsed.
 */
export const matchAssignment = (assignment, query) => {
  const tokens = searchTokens(query)
  if (!tokens.length) return { items: [] }
  const head = norm(`${assignment.user_name || ''} ${assignment.template_name || ''}`)
  const items = (assignment.items || []).map((item) => ({ key: item.key, text: itemText(item) }))
  const matched = new Set()
  for (const t of tokens) {
    // A word that names the person is the person's, even when it also sits in
    // an attached filename ("lisa-w4.pdf"): "lisa" lists Lisa and leaves her
    // card collapsed; "lisa w-4" opens it on the W-4.
    if (head.includes(t)) continue
    const onItems = items.filter((i) => i.text.includes(t))
    if (!onItems.length) return null
    onItems.forEach((i) => matched.add(i.key))
  }
  return { items: [...matched] }
}
