import React from 'react'
import PersonPhoto from './PersonPhoto'

/**
 * One person in a list: photo, name, what identifies them on the line below,
 * and -- when the list can open the record -- the name is the door.
 *
 * The People table and a class roster each drew this by hand and drifted
 * (one had the photo, one had the age, both spelled the email-or-username
 * line). Every list of students draws this cell now (M13a, 2026-09-18), and
 * any list can open the same record through useRecordDoors.
 *
 *   person   {name, age, email, username, phone_number, avatar_url, is_placeholder}
 *   onOpen   makes the name a button
 *   detail   a line under the identity (a roster's "Next: ..." line)
 *   photo    false for dense lists
 *   withAge  false when the age has a column of its own
 */
const StudentRow = ({ person, onOpen, detail, photo = true, withAge = true, className = '' }) => {
  // A placeholder's email is synthetic; nobody should read it.
  const contact = [person.is_placeholder ? null : (person.email || person.username), person.phone_number]
    .filter(Boolean).join(' · ')
  const name = (
    <>
      {person.name}
      {withAge && person.age != null && <span className="ml-1.5 text-xs font-normal text-neutral-400">age {person.age}</span>}
    </>
  )
  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`}>
      {photo && <PersonPhoto src={person.avatar_url} name={person.name} />}
      <div className="min-w-0">
        {onOpen ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(person) }}
            className="font-medium text-neutral-900 text-left hover:text-optio-purple hover:underline"
            title="Open the record">
            {name}
          </button>
        ) : (
          <div className="font-medium text-neutral-900">{name}</div>
        )}
        {contact && <div className="text-xs text-neutral-400 truncate">{contact}</div>}
        {detail}
      </div>
    </div>
  )
}

export default StudentRow
