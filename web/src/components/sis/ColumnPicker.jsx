/**
 * The checkbox list behind every "which columns" choice: exports of people,
 * classes and rosters, and the report tables.
 *
 * `columns` are `{ key, label, hint?, always?, locked?, lockedTitle? }`: an
 * `always` column is on and cannot be turned off (a roster with nobody's name
 * on it is not a roster); a `locked` one is disabled for a reason the title
 * gives. `groups` (`{ title, keys }`) render the list in titled boxes, each
 * with a Select all / Clear control, the way the People export lays out
 * Identity, Contact, Health. Without groups it is one grid.
 *
 * Four pickers were hand-rolled with the same checkbox and different layouts
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, K5, NW4). The choice itself
 * is the caller's: it owns `selected` and persists it (usePersistedChoice).
 */
const Box = ({ column, on, onToggle }) => (
  <label
    className={`flex items-start gap-2 text-sm ${
      column.always || column.locked ? 'text-neutral-400' : 'text-neutral-700 cursor-pointer'}`}
    title={column.locked ? column.lockedTitle : undefined}
  >
    <input
      type="checkbox"
      aria-label={column.label}
      className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-optio-purple shrink-0"
      checked={Boolean(column.always || on)}
      disabled={Boolean(column.always || column.locked)}
      onChange={() => onToggle(column.key)}
    />
    <span className="leading-tight">
      <span className="block">{column.label}</span>
      {column.hint && <span className="block text-[11px] text-neutral-500">{column.hint}</span>}
    </span>
  </label>
)

const ColumnPicker = ({
  columns,
  selected,
  onToggle,
  groups = null,
  onSetGroup = null,
  columnsClass = 'flex flex-wrap gap-x-4 gap-y-1.5',
  className = '',
}) => {
  const isOn = (c) => c.always || selected.includes(c.key)

  if (!groups) {
    return (
      <div className={`${columnsClass} ${className}`}>
        {columns.map((c) => <Box key={c.key} column={c} on={isOn(c)} onToggle={onToggle} />)}
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {groups.map((g) => {
        const cols = g.keys.map((k) => columns.find((c) => c.key === k)).filter(Boolean)
        const allOn = cols.every(isOn)
        return (
          <div key={g.title} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{g.title}</span>
              {onSetGroup && (
                <button type="button" onClick={() => onSetGroup(g, !allOn)}
                  className="text-xs text-optio-purple hover:underline">
                  {allOn ? 'Clear' : 'Select all'}
                </button>
              )}
            </div>
            <div className={columnsClass}>
              {cols.map((c) => <Box key={c.key} column={c} on={isOn(c)} onToggle={onToggle} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ColumnPicker
