import React from 'react'

const initialsOf = (name) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .replace(/\./g, '')
    .toUpperCase()

/**
 * A single testimonial as a full-width row: attribution rail on the left,
 * quote on the right behind an accent rule.
 *
 * Quotes vary a lot in length, so the card grid this replaced produced tall,
 * narrow columns of text. Stacked rows keep the line length comfortable and let
 * each quote take exactly the height it needs.
 *
 * `className` sets the card surface — pages differ there (plain white on
 * /classes, brand-tinted on /academy) while sharing the layout.
 */
const TestimonialRow = ({
  quote,
  name,
  context,
  className = 'bg-white border border-gray-200 shadow-sm',
}) => (
  <figure className={`rounded-2xl p-6 sm:p-8 sm:flex sm:items-start sm:gap-8 ${className}`}>
    <figcaption className="flex items-center gap-4 mb-5 sm:mb-0 sm:block sm:w-40 sm:flex-shrink-0">
      <div
        aria-hidden="true"
        className="w-12 h-12 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink text-white flex items-center justify-center text-base font-bold flex-shrink-0 sm:mb-3"
      >
        {initialsOf(name)}
      </div>
      <div>
        <div className="font-semibold text-gray-900">{name}</div>
        <div className="text-sm text-gray-500">{context}</div>
      </div>
    </figcaption>
    <blockquote className="flex-1 border-l-2 border-optio-pink/30 pl-5 sm:pl-8 text-gray-700 text-base sm:text-lg leading-relaxed">
      "{quote}"
    </blockquote>
  </figure>
)

export default TestimonialRow
