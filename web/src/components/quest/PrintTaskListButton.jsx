import { useContext } from 'react'
import { PrinterIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { OrganizationContext } from '../../contexts/OrganizationContext'
import { printTaskListReceipt } from '../../utils/stepsReceiptPrinter'

/**
 * "Print my task list" — the quest's tasks on the kiosk receipt printer, before
 * any of them has been broken into steps.
 *
 * Same opt-in as the step printer (organizations.feature_flags.step_printing),
 * so an org without a printer never sees it. Renders nothing — no wrapper, no
 * margin — when the org is opted out or the quest has no tasks yet.
 *
 * Reads the context directly instead of through useOrgFeature/useOrganization,
 * which throw outside OrganizationProvider. This button sits on the quest page,
 * and a small printing extra must never be the reason the whole page fails to
 * render; no provider simply means no flag, which means no button.
 */
export default function PrintTaskListButton({ questTitle, tasks }) {
  const { user } = useAuth()
  const { organization } = useContext(OrganizationContext) || {}
  const canPrint = Boolean(organization?.feature_flags?.step_printing)

  if (!canPrint || !tasks?.length) return null

  const handlePrint = () => {
    // Print the list in the order it is shown, not the order it came back in.
    const ordered = [...tasks].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    const opened = printTaskListReceipt({
      orgName: organization?.name,
      studentName: user?.first_name || user?.display_name,
      questTitle,
      tasks: ordered,
    })
    if (!opened) {
      toast.error('Could not open the print window. Allow pop-ups and try again.')
    }
  }

  return (
    <div className="mb-3 flex justify-end">
      <button
        type="button"
        onClick={handlePrint}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-optio-purple/30 bg-white text-optio-purple text-sm font-semibold hover:bg-optio-purple/5 active:scale-95 transition min-h-[44px] touch-manipulation"
      >
        <PrinterIcon className="w-4 h-4" />
        Print my task list
      </button>
    </div>
  )
}
