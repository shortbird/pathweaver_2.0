/**
 * What families, schools and partners pay Optio -- the front door to
 * shared/data/pricing.json for the web and mobile apps.
 *
 * PRICING holds integer cents; PRICE_TEXT holds the same prices formatted for
 * copy ('$50', '$2,400', '2.9% + $0.30'). Write a price in copy as
 * PRICE_TEXT.<name>, never as a typed '$50': the agreement, the Terms of
 * Service, the website and the help center all read this one list, and a typed
 * amount is how the Terms came to say $8,000 a year while the agreement said
 * $500 a month (fixed 2026-10-13).
 */

export { PRICING, PRICE_TEXT, type PriceTextKey } from './generated/pricing';
