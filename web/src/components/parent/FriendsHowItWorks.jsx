import { string } from 'prop-types'

/**
 * FriendsHowItWorks -- the explanation a parent reads before consenting.
 *
 * One copy of the text, in two places: FriendsExplainerModal (from the nudge
 * on the family dashboard) and the Friends section of the child's settings
 * while the switch is off. Turning Friends on is the parent's consent, so
 * this is the commitment the privacy policy makes, in the parent's words:
 * what a friend sees, how one is added, what they can do, what the parent
 * sees, and how to end it.
 */
const ROWS = [
  ['What a friend sees', (n) => `${n}’s display name, picture, and the work they share. Never an email address, last name, date of birth, or school.`],
  ['How a friend is added', (n) => `Through a classmate, a code shown in person, or an invite link. Both students have to say yes. You choose who may ask, and you can ask to approve each friend yourself first. You can also connect ${n} with a friend from here.`],
  ['What a friend can do', (n) => `See ${n}\u2019s work, react to it, leave a short comment, and send ${n} a message. You can turn commenting or messaging off.`],
  ['Safety check', () => 'Everything students write to each other passes a safety check before it is shown. Anything it holds is sent to you.'],
  ['What you see', (n) => `A notification each time a friend is added, and every comment and reaction here. You can hide a comment, remove a friend, or block one.`],
  ['Turning it off', (n) => `Any time, from here. Turning Friends off removes every friend ${n} has.`],
]

export default function FriendsHowItWorks({ name, className = '' }) {
  return (
    <div className={className}>
      <p className="text-base text-gray-700">
        Friends lets {name} connect with other students on Optio. Friends see each other&rsquo;s work and encourage it.
      </p>
      <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-base">
        {ROWS.map(([title, body]) => (
          <div key={title}>
            <dt className="font-semibold text-gray-900">{title}</dt>
            <dd className="mt-0.5 text-gray-600">{body(name)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

FriendsHowItWorks.propTypes = {
  name: string.isRequired,
  className: string,
}
