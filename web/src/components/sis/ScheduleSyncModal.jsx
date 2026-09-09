import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'

const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

const GROUPS = [
  { key: 'create', title: 'New classes', hint: 'In the sheet, not in Optio' },
  { key: 'update', title: 'Changed', hint: 'Fields differ from the sheet' },
  { key: 'schedule', title: 'Rescheduled', hint: 'Meeting days/times differ' },
  { key: 'archive', title: 'Not in the sheet', hint: 'Unchecked by default — check to archive' },
]

/**
 * Sync from the Google Sheet master schedule. The backend fetches + diffs and
 * returns operations; NOTHING is written until the staff member reviews the
 * diff and applies the checked changes (through the same endpoint as the AI
 * editor, so Undo works identically).
 */
const ScheduleSyncModal = ({ orgId, onClose, onApplied }) => {
  const [sheetUrl, setSheetUrl] = useState('')
  const [proposal, setProposal] = useState(null) // {summary, operations, warnings}
  const [selected, setSelected] = useState([])   // booleans parallel to operations
  const [undo, setUndo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(true)

  useEffect(() => {
    api.get(`/api/sis/schedule-sync/config?organization_id=${orgId}`)
      .then((r) => setSheetUrl(r.data?.sheet_url || ''))
      .catch(() => {})
      .finally(() => setLoadingConfig(false))
  }, [orgId])

  const propose = async () => {
    if (!sheetUrl.trim()) return toast.error('Paste the master schedule link')
    setBusy(true)
    setProposal(null)
    try {
      const { data } = await api.post('/api/sis/schedule-sync/propose', {
        organization_id: orgId, sheet_url: sheetUrl.trim(),
      })
      setProposal(data)
      setSelected((data.operations || []).map((op) => op.default_selected !== false))
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not read the master schedule')
    } finally { setBusy(false) }
  }

  const apply = async () => {
    const ops = proposal.operations.filter((_, i) => selected[i])
    if (!ops.length) return toast.error('Nothing selected to apply')
    setBusy(true)
    try {
      const { data } = await api.post('/api/sis/schedule-ai/apply', {
        organization_id: orgId, operations: ops,
      })
      const applied = data.applied?.length || 0
      toast.success(`Applied ${applied} change${applied === 1 ? '' : 's'}`)
      for (const err of data.errors || []) toast.error(err)
      setProposal(null)
      setUndo((data.undo_operations || []).length ? { operations: data.undo_operations, count: applied } : null)
      onApplied && onApplied()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not apply the changes')
    } finally { setBusy(false) }
  }

  const undoLast = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/api/sis/schedule-ai/apply', {
        organization_id: orgId, operations: undo.operations,
      })
      for (const err of data.errors || []) toast.error(err)
      toast.success('Sync undone')
      setUndo(null)
      onApplied && onApplied()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not undo the changes')
    } finally { setBusy(false) }
  }

  const toggle = (i) => setSelected((s) => s.map((v, j) => (j === i ? !v : v)))
  const setGroup = (keys, value) => setSelected((s) =>
    s.map((v, i) => (keys.includes(i) ? value : v)))

  const selectedCount = selected.filter(Boolean).length

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl my-auto max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="inline-flex items-center gap-2 text-lg font-bold text-neutral-900">
            <ArrowPathIcon className="w-5 h-5 text-optio-purple" />
            Sync from master schedule
          </div>
          <button onClick={onClose} aria-label="Close"
            className="text-neutral-400 hover:text-neutral-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto">
          <p className="text-xs text-neutral-500 mb-2">
            The Google Sheet is the source of truth. You'll review every change before
            anything is saved, and one-click Undo is available after applying.
          </p>
          <div className="flex gap-2">
            <input
              className={field}
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder={loadingConfig ? 'Loading…' : 'https://docs.google.com/spreadsheets/d/…'}
            />
            <button onClick={propose} disabled={busy || loadingConfig}
              className="shrink-0 px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {busy && !proposal ? 'Comparing…' : 'Preview changes'}
            </button>
          </div>

          {undo && !proposal && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2">
              <span className="text-sm text-green-800">Applied {undo.count} change{undo.count === 1 ? '' : 's'}.</span>
              <button onClick={undoLast} disabled={busy}
                className="text-sm font-semibold text-optio-purple hover:underline disabled:opacity-50">
                {busy ? 'Undoing…' : 'Undo'}
              </button>
            </div>
          )}

          {proposal && (
            <div className="mt-4">
              {proposal.summary && <p className="text-sm text-neutral-700 mb-3">{proposal.summary}</p>}

              {(proposal.warnings || []).map((w, i) => (
                <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1">{w}</p>
              ))}

              {proposal.operations.length === 0 ? (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mt-2">
                  Optio already matches the sheet — nothing to change.
                </p>
              ) : GROUPS.map((g) => {
                const idxs = proposal.operations
                  .map((op, i) => (op.group === g.key ? i : -1))
                  .filter((i) => i >= 0)
                if (!idxs.length) return null
                const allOn = idxs.every((i) => selected[i])
                return (
                  <div key={g.key} className="mt-3 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 rounded-t-lg">
                      <div>
                        <span className="text-sm font-semibold text-neutral-800">{g.title} ({idxs.length})</span>
                        <span className="ml-2 text-xs text-neutral-400">{g.hint}</span>
                      </div>
                      <button onClick={() => setGroup(idxs, !allOn)}
                        className="text-xs font-medium text-optio-purple hover:underline">
                        {allOn ? 'Uncheck all' : 'Check all'}
                      </button>
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {idxs.map((i) => {
                        const op = proposal.operations[i]
                        return (
                          <li key={i} className="px-3 py-2">
                            <label className="flex items-start gap-2 cursor-pointer">
                              <input type="checkbox" checked={!!selected[i]} onChange={() => toggle(i)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple/20" />
                              <span>
                                <span className="block text-sm text-neutral-800">{op.label}</span>
                                {(op.detail || []).map((d, k) => (
                                  <span key={k} className="block text-xs text-neutral-500">{d}</span>
                                ))}
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {proposal && proposal.operations.length > 0 && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={() => setProposal(null)} className="text-sm text-neutral-500 hover:underline">Discard</button>
            <button onClick={apply} disabled={busy || selectedCount === 0}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {busy ? 'Applying…' : `Apply ${selectedCount} change${selectedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </ModalOverlay>
  )
}

export default ScheduleSyncModal
