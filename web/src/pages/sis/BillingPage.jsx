import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSisOrg } from './useSisOrg'
import GlassTabBar from '../../components/ui/GlassTabBar'
import { useRecurringTuition } from './RecurringTuitionList'
import InvoicePanel from './billingPage/InvoicePanel'
import LedgerPanel from './billingPage/LedgerPanel'

/**
 * Billing -- the school's money, in the order it happens:
 *
 *   To invoice       students waiting on their first invoice, seeded from
 *                    their schedule; verify, adjust, send
 *   Charges          every charge and what has been paid on it
 *   Outstanding      who still owes, and the reminder run
 *   Monthly tuition  students on a set monthly rate, and adding one
 *   Charge detail    every charge line, for reconciling a remittance
 *
 * Until 2026-09-18 the first tab was its own page, Tuition, and the other
 * four were views inside Billing held in local state -- so a dashboard tile
 * could reach the page but never the view, and monthly tuition was on BOTH
 * pages (the list on each; the Add button only on Tuition, with Billing's
 * tab saying "add these on the Tuition page"). Same gate, same module, one
 * flow: the invoice is the first charge, and everything after it is the
 * ledger. Tuition + Billing were also the whole "Money" sidebar section,
 * which folded into Operations with them (M23).
 *
 * Lands on Charges, the office's daily view, as Billing always did. The
 * tab is in the URL: the dashboard's "awaiting tuition" tile opens
 * ?tab=invoice, and /tuition redirects there.
 */

const TABS = [
  ['invoice', 'To invoice'],
  ['charges', 'Charges'],
  ['outstanding', 'Outstanding'],
  ['monthly', 'Monthly tuition'],
  ['detail', 'Charge detail'],
]

const FALLBACK = 'charges'

const BillingPage = () => {
  const { orgId } = useSisOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab = TABS.some(([t]) => t === rawTab) ? rawTab : FALLBACK
  // Fetched once here: the Monthly tuition tab shows the list and the tab
  // itself wears the count.
  const { schedules: recurring, load: loadRecurring } = useRecurringTuition(orgId)

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === FALLBACK) params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">Billing</h1>
      </div>

      <GlassTabBar
        align="start" size="md" className="mb-5 no-print" aria-label="Billing sections"
        tabs={TABS.map(([id, label]) => ({ id, label, badge: id === 'monthly' ? (recurring?.length || null) : null }))}
        active={tab} onSelect={setTab}
      />

      {tab === 'invoice'
        ? <InvoicePanel />
        : <LedgerPanel view={tab} recurring={recurring} loadRecurring={loadRecurring} />}
    </div>
  )
}

export default BillingPage
