/**
 * One quest as a parent's list shows it: the picture (or the cap), the title,
 * the description, the badges beside the title, and whatever the list needs
 * underneath. Two parent pages drew this their own way -- the family's own
 * quests on /family and the school's quests on /family/forms -- and used the
 * word "quests" for both without saying whose
 * (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, N3; M19). The headings now
 * say ("Your family's quests" / "Quests from <the school>") and the rows are
 * this one component.
 *
 * Two places for what goes underneath. `children` sit in the text column,
 * beside the picture, for a line that belongs to the title (the start link).
 * `footer` spans the whole row, under the picture, for content that needs the
 * width: the family card's member rows carry a rhythm badge each, and in the
 * text column of a three-up card they ran off the right edge (2026-09-18).
 */
import React from 'react'
import { AcademicCapIcon } from '@heroicons/react/24/outline'

const QuestListItem = ({ quest, badges = null, children, footer = null, className = '', as: Tag = 'div', imageSize = 'md' }) => {
  const box = imageSize === 'sm' ? 'w-10 h-10' : 'w-14 h-14'
  return (
    <Tag className={className}>
      <div className="flex items-start gap-3">
        {quest.image_url ? (
          <img src={quest.image_url} alt="" className={`${box} rounded-lg object-cover flex-shrink-0`} />
        ) : (
          <span aria-hidden="true" className={`${box} rounded-lg bg-optio-purple/10 text-optio-purple flex items-center justify-center flex-shrink-0`}>
            <AcademicCapIcon className={imageSize === 'sm' ? 'w-5 h-5' : 'w-6 h-6'} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{quest.title}</h3>
            {badges}
          </div>
          {quest.description && (
            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{quest.description}</p>
          )}
          {children}
        </div>
      </div>
      {footer}
    </Tag>
  )
}

export default QuestListItem
