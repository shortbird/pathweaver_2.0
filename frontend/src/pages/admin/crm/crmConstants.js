/**
 * Shared constants for the CRM admin console.
 *
 * Values mirror docs/CRM_REPLACEMENT_PLAN.md: contact types are the
 * contact_submissions types that can feed funnels; lead / membership / funnel
 * statuses mirror the crm_leads / crm_funnel_memberships / crm_funnels CHECKs.
 */

export const CONTACT_TYPES = [
  'demo',
  'sales',
  'general',
  'families',
  'philosophy',
  'academy',
  'claim_free_class',
  'course_purchase',
]

export const CONTACT_TYPE_LABELS = {
  demo: 'Demo request',
  sales: 'Sales',
  general: 'General',
  families: 'Families',
  philosophy: 'Philosophy',
  academy: 'Academy',
  claim_free_class: 'Free class claim',
  course_purchase: 'Course purchase',
}

export const LEAD_STATUSES = ['active', 'converted', 'unsubscribed', 'suppressed']

export const MEMBERSHIP_STATUSES = ['active', 'completed', 'exited']

export const FUNNEL_STATUSES = ['active', 'paused', 'archived']

export const FUNNEL_TYPES = ['nurture', 'onboarding']

export const LEAD_STATUS_BADGES = {
  active: 'bg-green-100 text-green-700',
  converted: 'bg-blue-100 text-blue-700',
  unsubscribed: 'bg-yellow-100 text-yellow-700',
  suppressed: 'bg-red-100 text-red-700',
}

export const FUNNEL_STATUS_BADGES = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  archived: 'bg-gray-100 text-gray-700',
}

export const MEMBERSHIP_STATUS_BADGES = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  exited: 'bg-gray-100 text-gray-700',
}

/** Chip styling for lead source / entry type labels. */
export const SOURCE_CHIP_CLASS = 'bg-optio-purple/10 text-optio-purple'

/**
 * Variables available inside step HTML. `name` is the bare variable used to
 * build a whitespace-tolerant regex; `sample` feeds the live preview.
 */
export const TEMPLATE_VARIABLES = [
  { name: 'first_name', token: '{{first_name}}', label: 'First name', sample: 'Jordan' },
  { name: 'last_name', token: '{{last_name}}', label: 'Last name', sample: 'Rivera' },
  { name: 'email', token: '{{email}}', label: 'Email', sample: 'jordan@example.com' },
  { name: 'unsubscribe_url', token: '{{unsubscribe_url}}', label: 'Unsubscribe URL', sample: '#' },
]

export const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const formatDateTime = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
