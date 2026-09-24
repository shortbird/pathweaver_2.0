import React from 'react'
import SearchSelect from '../ui/SearchSelect'
import { Input } from '../ui/Input'
import { useSisStaff } from '../../hooks/api/useSisStaff'

/**
 * Where a training goes and how it is filed: category, required, "put it on
 * their accounts", who it is for (staff, parents, students, an age window),
 * and for staff which roles or which named people.
 *
 * One block for every training door. TrainingForm draws it under "Use an
 * existing quest" and "Link to a video or document"; the quest editor draws it
 * as its training section when a quest is built or edited for the catalog (P6,
 * 2026-09-23). It used to live inside TrainingForm only, beside the quest
 * fields it now shares a screen with.
 *
 * `value` is {category, required, autoAssign, targets, minAge, maxAge, roles,
 * people}; `onChange(patch)` merges. `isLink` hides what a link has no use for
 * (auto-assign, the audience set) -- a link belongs to the tab that filed it.
 */

const STAFF_ROLE_OPTIONS = [['org_admin', 'Admins'], ['campus_coordinator', 'Coordinators'], ['advisor', 'Teachers']]

export const blankTrainingSettings = (audience) => ({
  category: '', required: false,
  // On by default: somebody setting a quest for their whole school almost
  // always means "put it on their accounts". Untick for something optional.
  autoAssign: true,
  targets: [audience], minAge: '', maxAge: '', roles: [], people: [],
})

/** A catalog row (GET /training/<id>/quest's `training`) as settings. */
export const trainingSettingsFrom = (cat, audience) => ({
  category: cat.category || '',
  required: !!cat.is_required,
  autoAssign: !!cat.auto_assign,
  targets: cat.audiences?.length ? cat.audiences : [cat.audience || audience],
  minAge: cat.student_min_age == null ? '' : String(cat.student_min_age),
  maxAge: cat.student_max_age == null ? '' : String(cat.student_max_age),
  roles: cat.visible_to_roles || [],
  people: cat.visible_to_user_ids || [],
})

/**
 * The settings in the shape the training routes take. The age window is only
 * meaningful with students ticked, and is sent as null rather than omitted so
 * unticking students actually clears it.
 */
export const trainingSettingsBody = (s) => ({
  category: (s.category || '').trim(),
  is_required: !!s.required,
  auto_assign: !!s.autoAssign,
  visible_to_roles: s.roles.length ? s.roles : null,
  visible_to_user_ids: s.people.length ? s.people : null,
  audiences: s.targets,
  student_min_age: s.targets.includes('student') && s.minAge !== '' ? Number(s.minAge) : null,
  student_max_age: s.targets.includes('student') && s.maxAge !== '' ? Number(s.maxAge) : null,
})

export default function TrainingSettingsFields({ value, onChange, audience, orgId, isLink = false }) {
  const { category, required, autoAssign, targets, minAge, maxAge, roles, people } = value
  // Who a training can be aimed at by name. Admin-only screens, so this read
  // never runs for a teacher (who would 403 on it).
  const { data: staff = [] } = useSisStaff(orgId)
  const nameOf = (id) => staff.find((p) => p.id === id)?.name || 'Someone'
  const toggleRole = (v) => onChange({ roles: roles.includes(v) ? roles.filter((r) => r !== v) : [...roles, v] })
  // Never leave it aimed at nobody: the last one ticked stays ticked.
  const toggleTarget = (v) => onChange({
    targets: targets.includes(v) ? (targets.length > 1 ? targets.filter((t) => t !== v) : targets) : [...targets, v],
  })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Input value={category} onChange={(e) => onChange({ category: e.target.value })} className="text-sm"
        placeholder="Category (e.g. Onboarding, Classroom management)" aria-label="Category" />
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={required} onChange={(e) => onChange({ required: e.target.checked })} />
        Required for everyone it goes to
      </label>
      {!isLink && (
        <label className="sm:col-span-2 flex items-start gap-2 text-sm text-neutral-700">
          <input type="checkbox" className="mt-0.5" checked={autoAssign}
            onChange={(e) => onChange({ autoAssign: e.target.checked })} />
          <span>
            Put it on their accounts
            <span className="block text-xs text-neutral-500">
              Everyone it goes to gets the quest when it is published, and anyone who joins later gets
              it too. Untick to let them find it themselves.
            </span>
          </span>
        </label>
      )}
      {/* Who it goes to. Several groups at once, because a school's
          orientation quest is one quest whether the parents or the teenagers
          are doing it (iCreate, 2026-08-17). A link belongs to the one tab
          that built it, and only a staff link can be narrowed by role or by
          name: the role column allows staff roles only (ae16c5da). */}
      <div className="sm:col-span-2 border-t border-gray-200 pt-3">
        {!isLink && <span className="block text-xs text-neutral-500 mb-1.5">Who gets this quest</span>}
        {!isLink && (
          <div className="flex flex-wrap items-center gap-4">
            {[['staff', 'Staff'], ['family', 'Parents'], ['student', 'Students']].map(([v, label]) => (
              <label key={v} className="flex items-center gap-1.5 text-sm text-neutral-700">
                <input type="checkbox" checked={targets.includes(v)} onChange={() => toggleTarget(v)} />
                {label}
              </label>
            ))}
          </div>
        )}
        {!isLink && targets.includes('student') && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-neutral-700">
            <span className="text-xs text-neutral-500">Students aged</span>
            <input type="number" min={0} max={120} value={minAge}
              onChange={(e) => onChange({ minAge: e.target.value })}
              placeholder="any" aria-label="Youngest student age"
              className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
            <span className="text-xs text-neutral-500">to</span>
            <input type="number" min={0} max={120} value={maxAge}
              onChange={(e) => onChange({ maxAge: e.target.value })}
              placeholder="any" aria-label="Oldest student age"
              className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
            <span className="block w-full text-xs text-neutral-500 mt-1">
              {minAge || maxAge
                ? 'A student with no date of birth on file is left out, so check their record if somebody is missing.'
                : 'Leave both blank for every student. Fill in the first for "12 and up".'}
            </span>
          </div>
        )}
        {(isLink ? audience === 'staff' : targets.includes('staff')) && (
          <div className={`${isLink ? '' : 'mt-3 '}text-xs text-neutral-500 space-y-3`}>
            <div>
              <span className="block mb-1">Which staff roles <span className="text-neutral-400">(none ticked = all staff)</span></span>
              <div className="flex items-center gap-3">
                {STAFF_ROLE_OPTIONS.map(([v, label]) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm text-neutral-700">
                    <input type="checkbox" checked={roles.includes(v)} onChange={() => toggleRole(v)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="block mb-1">
                And these people <span className="text-neutral-400">(as well as the roles above)</span>
              </span>
              {people.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {people.map((id) => (
                    <span key={id}
                      className="inline-flex items-center gap-1 rounded-full bg-optio-purple/10 px-2 py-0.5 text-optio-purple">
                      {nameOf(id)}
                      <button type="button" aria-label={`Remove ${nameOf(id)}`}
                        onClick={() => onChange({ people: people.filter((x) => x !== id) })}
                        className="text-optio-purple/60 hover:text-red-600">×</button>
                    </span>
                  ))}
                </div>
              )}
              <SearchSelect
                value=""
                onChange={(id) => { if (id && !people.includes(id)) onChange({ people: [...people, id] }) }}
                options={staff.filter((p) => !people.includes(p.id))}
                getId={(p) => p.id} getLabel={(p) => p.name}
                placeholder="Search staff…"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
