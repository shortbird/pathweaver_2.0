import React from 'react'
import { TrophyIcon, PhotoIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { Modal } from '../ui'

/**
 * The draft quest as the person who has to do it will meet it.
 *
 * iCreate, 2026-08-17, building family orientation and teacher training:
 * "a preview showing exactly what parents and students will see when they open
 * the quest from their dashboard."
 *
 * The builder is a stack of form fields, so it is genuinely hard to tell from it
 * whether the thing reads as a welcome or as a compliance form — which for
 * orientation is the whole point. This lays the same pieces out the way the
 * quest page lays them out: header image, title, what it is about, then the
 * tasks with what each is worth.
 *
 * It renders the DRAFT, from the form state, so it works before anything is
 * saved. That is what makes it useful — you look before you commit — and it is
 * also its one limitation: it mirrors the learner's quest page rather than being
 * that page, so it cannot show evidence upload, or progress somebody has yet to
 * make. Pillars are absent because training hides them (see QuestDraftForm).
 *
 * Chrome comes from the shared ui/Modal, per the design system: one backdrop,
 * one focus trap, one Escape handler for every modal on the site.
 */

const Pill = ({ children, className = '' }) => (
  <span className={`text-[11px] px-2 py-0.5 rounded-full ${className}`}>{children}</span>
)

export default function QuestPreviewModal({
  open, onClose, title, description, tasks = [], imageUrl, xpThreshold, audience = 'staff',
  containImage = false, allowOwnTasks = false,
}) {
  const real = tasks.filter((t) => (t.title || '').trim())
  const totalXp = real.reduce((sum, t) => sum + (Number(t.xp_value) || 0), 0)
  const who = audience === 'family' ? 'families' : 'teachers'

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`What ${who} will see`}
      size="md"
      // The header image runs edge to edge, the way it does on the quest page,
      // so the body supplies its own padding instead of the default inset.
      bodyClassName="p-0"
      footer={(
        <div className="flex justify-end">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold">
            Back to editing
          </button>
        </div>
      )}
    >
      {/* Header image — the first thing on the quest page. */}
      {imageUrl ? (
        // A logo is contained on white rather than cropped full-bleed — the
        // same treatment metadata.header_style='org_logo' gets on the real
        // quest header.
        <img src={imageUrl} alt=""
          className={containImage
            ? 'w-full h-48 object-contain bg-white border-b border-gray-200 p-4'
            : 'w-full h-48 object-cover'} />
      ) : (
        <div className="w-full h-48 bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center">
          <div className="text-center text-white/80">
            <PhotoIcon className="w-8 h-8 mx-auto mb-1" />
            <p className="text-xs">No image yet — this gradient is what they will see</p>
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        <div>
          <h3 className="text-2xl font-bold text-neutral-900">
            {title.trim() || 'Untitled quest'}
          </h3>
          {description.trim() && (
            <p className="text-neutral-600 mt-2 whitespace-pre-line">{description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Pill className="bg-optio-purple/10 text-optio-purple">
            {real.length} {real.length === 1 ? 'task' : 'tasks'}
          </Pill>
          <Pill className="bg-optio-purple/10 text-optio-purple">{totalXp} XP available</Pill>
          {xpThreshold > 0 && (
            <Pill className="bg-amber-100 text-amber-800">
              {xpThreshold} XP needed to finish
            </Pill>
          )}
        </div>

        {xpThreshold > totalXp && totalXp > 0 && (
          // Worth catching here rather than when somebody cannot finish: the
          // quest would be impossible to close as written.
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            The finish line is higher than every task added together, so this
            quest could not be completed. Lower it to {totalXp} or add more tasks.
          </p>
        )}

        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-2">
            Tasks
          </h4>
          {!real.length ? (
            <p className="text-sm text-neutral-500 bg-gray-50 border border-gray-200 rounded-lg p-4">
              No preset tasks, so they will write their own when they start it.
            </p>
          ) : (
            <div className="space-y-2">
              {real.map((t, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-gray-300 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-900">{t.title}</p>
                      {t.description && (
                        <p className="text-sm text-neutral-500 mt-0.5">{t.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-optio-purple/10 text-optio-purple">
                          <TrophyIcon className="w-3.5 h-3.5" />
                          {Number(t.xp_value) || 0} XP
                        </span>
                        {t.is_required && (
                          <Pill className="bg-gray-100 text-neutral-600">Required</Pill>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {allowOwnTasks && (
            <p className="text-sm text-neutral-500 mt-2">
              They can also add tasks of their own on top of these.
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
