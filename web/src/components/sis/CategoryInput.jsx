import React, { useId } from 'react'
import { INPUT_CLASS } from '../ui/Input'

/**
 * A category field that offers the categories already in use and still takes
 * a new one. "Can we get a dropdown of current categories and add new?"
 * (ticket 79e58519): the field was free text, so "Policy" and "Policies"
 * became two headings. A <datalist> lists what the page already loaded and
 * the browser filters it as you type; anything typed that is not on the list
 * is a new category, the same as before.
 *
 * `categories` is the raw list from the caller; blanks and repeats are
 * dropped here so each caller can pass what it has.
 */
export const uniqueCategories = (categories = []) => [...new Set(
  categories.map((c) => (c || '').trim()).filter(Boolean),
)].sort((a, b) => a.localeCompare(b))

export default function CategoryInput({ value, onChange, categories = [], className = INPUT_CLASS, ...props }) {
  const listId = useId()
  const options = uniqueCategories(categories)
  return (
    <>
      <input type="text" value={value} onChange={onChange} className={className}
        list={options.length ? listId : undefined} autoComplete="off" {...props} />
      {options.length > 0 && (
        <datalist id={listId} data-testid="category-options">
          {options.map((c) => <option key={c} value={c} />)}
        </datalist>
      )}
    </>
  )
}
