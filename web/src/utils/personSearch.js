/**
 * Finding a person by any name they go by.
 *
 * Names render as ONE string (utils/person_name.py::full_name — the preferred
 * name replaces the first), so a student on file as Monroe and known as Montie
 * appears as "Montie Adams" everywhere. Searching the rendered string alone
 * then makes the other half of that student unfindable: the office types the
 * legal name off a form and the roster comes back empty.
 *
 * iCreate, 2026-08-28: "Is there a way that we can search for a student in the
 * CLP or the families roster by either their given name or their preferred
 * name? ... I can't find them unless I figure out their given name AND their
 * nickname."
 *
 * So the haystack is every name the record holds, not the one it displays.
 */

/** The strings a person can be found by, lowercased. */
export function searchableNames(person) {
  if (!person) return []
  return [
    person.name,
    person.first_name,
    person.last_name,
    person.preferred_name,
    person.display_name,
    person.search_terms,
    // "Montie Adams" has to match a search for "monroe adams" too.
    [person.first_name, person.last_name].filter(Boolean).join(' '),
    [person.preferred_name, person.last_name].filter(Boolean).join(' '),
  ].filter(Boolean).map((s) => String(s).toLowerCase())
}

/**
 * Does this person match the query? An empty query matches everyone.
 * `query` is matched as a substring, so "mon" finds both Monroe and Montie.
 */
export function matchesPersonSearch(person, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  return searchableNames(person).some((n) => n.includes(q))
}
